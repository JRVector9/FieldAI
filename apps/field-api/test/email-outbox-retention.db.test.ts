import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { Pool } from 'pg';
import { FIELD_EMAIL_OUTBOX_ANONYMIZED_TO, purgeFieldEmailOutbox, purgeUnverifiedCredentialUsers } from '../src/retention-purge.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
after(async () => { await pool.end(); });

test('Field email outbox retention anonymizes sent auth mail after 7 days and deletes rows after 30/90 days', async () => {
  const rows = {
    sentOld: { purpose: 'verify_email', state: 'sent', days: 8 },
    resetOld: { purpose: 'reset_password', state: 'sent', days: 8 },
    sentRecent: { purpose: 'reset_password', state: 'sent', days: 6 },
    pendingOld: { purpose: 'verify_email', state: 'pending', days: 8 },
    // M5 중복 억제 행도 7일 뒤 주소를 익명화한다.
    suppressedOld: { purpose: 'reset_password', state: 'suppressed_duplicate', days: 8 },
    sentExpired: { purpose: 'verify_email', state: 'sent', days: 31 },
    pendingExpired: { purpose: 'verify_email', state: 'pending', days: 31 },
    failedKept: { purpose: 'reset_password', state: 'failed', days: 31 },
    blockedKept: { purpose: 'verify_email', state: 'blocked_integration', days: 89 },
    failedExpired: { purpose: 'reset_password', state: 'failed', days: 91 },
    blockedExpired: { purpose: 'verify_email', state: 'blocked_integration', days: 91 },
  } as const;
  const ids = new Map<string, string>();
  const addresses = new Map<string, string>();
  try {
    for (const [name, row] of Object.entries(rows)) {
      const id = randomUUID(), to = `field-outbox-${id}@example.invalid`;
      ids.set(name, id); addresses.set(name, to);
      await pool.query(`insert into field.email_outbox(id,"to",subject,text,purpose,state,created_at,sent_at)
        values($1,$2,'[Field] 합성 인증 메일','본문 [redacted]',$3,$4,now()-make_interval(days=>$5),
          case when $4='sent' then now()-make_interval(days=>$5) else null end)`, [id, to, row.purpose, row.state, row.days]);
    }
    const first = await purgeFieldEmailOutbox(pool);
    assert.deepEqual(first, { emailOutboxAnonymized: 3, emailOutboxDeleted: 4 });
    const remaining = new Map((await pool.query<{ id: string; to: string; state: string; sent_at: Date | null }>(
      'select id,"to",state,sent_at from field.email_outbox where id = any($1::uuid[])', [[...ids.values()]])).rows.map(row => [row.id, row]));
    for (const name of ['sentExpired', 'pendingExpired', 'failedExpired', 'blockedExpired'])
      assert.equal(remaining.has(ids.get(name)!), false, name);
    // 익명화는 수신 주소만 바꾸고 발송 결과·시각은 감사용으로 남긴다.
    for (const name of ['sentOld', 'resetOld']) {
      const row = remaining.get(ids.get(name)!)!;
      assert.equal(row.to, FIELD_EMAIL_OUTBOX_ANONYMIZED_TO, name);
      assert.equal(row.state, 'sent'); assert.ok(row.sent_at);
    }
    assert.equal(remaining.get(ids.get('suppressedOld')!)?.to, FIELD_EMAIL_OUTBOX_ANONYMIZED_TO);
    for (const name of ['sentRecent', 'pendingOld', 'failedKept', 'blockedKept'])
      assert.equal(remaining.get(ids.get(name)!)?.to, addresses.get(name), name);
    // 반복 실행해도 이미 익명화한 행은 다시 바꾸지 않는다.
    const second = await purgeFieldEmailOutbox(pool);
    assert.equal((await pool.query(`select count(*)::int as count from field.email_outbox where id = any($1::uuid[])`,
      [[...ids.values()]])).rows[0].count, 7);
    assert.deepEqual(second, { emailOutboxAnonymized: 0, emailOutboxDeleted: 0 });
  } finally {
    await pool.query('delete from field.email_outbox where id = any($1::uuid[])', [[...ids.values()]]);
  }
});

// Security #2: 48시간 지난 미인증·비밀번호 전용·조직 없는 계정만 지운다(남의 주소 선점 해제). 다른 조건의 계정은 남긴다.
test('Field retention removes only stale unverified credential-only users without memberships', async () => {
  const ids = { stale: randomUUID(), fresh: randomUUID(), verified: randomUUID(), member: randomUUID(), kakao: randomUUID(),
    client: randomUUID(), referenced: randomUUID(), org: randomUUID(), owner: randomUUID() };
  const users = [ids.stale, ids.fresh, ids.verified, ids.member, ids.kakao, ids.client, ids.referenced, ids.owner];
  try {
    for (const id of users) {
      const old = id !== ids.fresh;
      await pool.query(`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt")
        values ($1,$1,$2,$3,now()-make_interval(hours=>$4),now())`, [id, `${id}@example.invalid`, id === ids.verified || id === ids.owner, old ? 49 : 47]);
      await pool.query(`insert into "account"(id,"accountId","providerId","userId","password","createdAt","updatedAt")
        values ($1,$2,'credential',$2,'synthetic-hash',now(),now())`, [randomUUID(), id]);
    }
    await pool.query(`insert into "account"(id,"accountId","providerId","userId","createdAt","updatedAt") values ($1,$2,'kakao',$3,now(),now())`,
      [randomUUID(), `kakao-${ids.kakao}`, ids.kakao]);
    await pool.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)', [ids.org, ids.owner, 'Field Unverified Org']);
    await pool.query("insert into field.memberships(organization_id,user_id,role) values ($1,$2,'editor')", [ids.org, ids.member]);
    await pool.query(`insert into "oauthClient"(id,"clientId",name,"redirectUris","userId","createdAt","updatedAt")
      values ($1,$2,'Synthetic','[]'::jsonb,$3,now(),now())`, [randomUUID(), `field-unverified-${ids.client}`, ids.client]);
    // 업무 원장이 FK로 참조하는 사용자는 삭제가 거부되므로 건너뛰고 남긴다(조직 없이도 참조가 남는 경우).
    await pool.query(`insert into field.trial_subscriptions(id,organization_id,consent_version,started_by,ends_at)
      values ($1,$2,'synthetic',$3,now()+interval '1 day')`, [randomUUID(), ids.org, ids.referenced]);
    const result = await purgeUnverifiedCredentialUsers(pool);
    assert.deepEqual(result, { unverifiedUsersDeleted: 1, unverifiedUsersRetained: 1 });
    const left = new Set((await pool.query<{ id: string }>('select id from "user" where id = any($1::text[])', [users])).rows.map(row => row.id));
    assert.deepEqual([...users].filter(id => !left.has(id)), [ids.stale]);
  } finally {
    await pool.query('delete from field.trial_subscriptions where organization_id = $1', [ids.org]);
    await pool.query('delete from field.memberships where organization_id = $1', [ids.org]);
    await pool.query('delete from field.organizations where id = $1', [ids.org]);
    await pool.query('delete from "user" where id = any($1::text[])', [Object.values(ids)]);
  }
});
