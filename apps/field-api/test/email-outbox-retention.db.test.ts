import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { Pool } from 'pg';
import { FIELD_EMAIL_OUTBOX_ANONYMIZED_TO, purgeFieldEmailOutbox } from '../src/retention-purge.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
after(async () => { await pool.end(); });

test('Field email outbox retention anonymizes sent auth mail after 7 days and deletes rows after 30/90 days', async () => {
  const rows = {
    sentOld: { purpose: 'verify_email', state: 'sent', days: 8 },
    resetOld: { purpose: 'reset_password', state: 'sent', days: 8 },
    sentRecent: { purpose: 'reset_password', state: 'sent', days: 6 },
    pendingOld: { purpose: 'verify_email', state: 'pending', days: 8 },
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
    assert.deepEqual(first, { emailOutboxAnonymized: 2, emailOutboxDeleted: 4 });
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
    for (const name of ['sentRecent', 'pendingOld', 'failedKept', 'blockedKept'])
      assert.equal(remaining.get(ids.get(name)!)?.to, addresses.get(name), name);
    // 반복 실행해도 이미 익명화한 행은 다시 바꾸지 않는다.
    const second = await purgeFieldEmailOutbox(pool);
    assert.equal((await pool.query(`select count(*)::int as count from field.email_outbox where id = any($1::uuid[])`,
      [[...ids.values()]])).rows[0].count, 6);
    assert.deepEqual(second, { emailOutboxAnonymized: 0, emailOutboxDeleted: 0 });
  } finally {
    await pool.query('delete from field.email_outbox where id = any($1::uuid[])', [[...ids.values()]]);
  }
});
