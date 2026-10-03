import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { Pool } from 'pg';
import { EMAIL_OUTBOX_ANONYMIZED_TO, purgeAgentEmailOutbox } from '../src/retention-purge.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await pool.end(); });

// 인증 메일 outbox 보존(추가): 7일 지난 발송 완료 주소 익명화, 30일 삭제, 차단·실패 행은 90일까지 보존.
test('AP email outbox retention anonymizes sent recipients after 7 days and deletes by state-specific age', async () => {
  const marker = randomUUID();
  const insert = async (label: string, state: string, ageDays: number, purpose = 'verify_email') =>
    (await pool.query<{ id: string }>(
      `insert into ap.email_outbox("to",subject,text,purpose,state,created_at,sent_at)
       values($1,'인증 메일','본문',$2,$3,now()-make_interval(days=>$4),
         case when $3='sent' then now()-make_interval(days=>$4) else null end) returning id`,
      [`${label}-${marker}@example.invalid`, purpose, state, ageDays])).rows[0]!.id;
  const rows = {
    sentFresh: await insert('sent-fresh', 'sent', 3),
    sentWeek: await insert('sent-week', 'sent', 8, 'reset_password'),
    sentOld: await insert('sent-old', 'sent', 31),
    pendingWeek: await insert('pending-week', 'pending', 8),
    pendingOld: await insert('pending-old', 'pending', 31),
    blockedKept: await insert('blocked-kept', 'blocked_integration', 60),
    failedKept: await insert('failed-kept', 'failed', 89),
    blockedOld: await insert('blocked-old', 'blocked_integration', 91),
    failedOld: await insert('failed-old', 'failed', 91),
  };
  const read = async () => new Map((await pool.query<{ id: string; to: string }>(
    'select id, "to" from ap.email_outbox where id = any($1::uuid[])', [Object.values(rows)])).rows.map(row => [row.id, row.to]));
  try {
    const first = await purgeAgentEmailOutbox(pool);
    assert.ok(first.anonymized >= 1 && first.deleted >= 4);
    const left = await read();
    // 30일 경과 삭제: 일반 행과 90일 경과 차단·실패 행
    for (const id of [rows.sentOld, rows.pendingOld, rows.blockedOld, rows.failedOld]) assert.equal(left.has(id), false);
    // 7일 경과 발송 완료 인증 메일만 익명화, 미발송·최근 행은 원래 주소 유지
    assert.equal(left.get(rows.sentWeek), EMAIL_OUTBOX_ANONYMIZED_TO);
    assert.equal(left.get(rows.sentFresh), `sent-fresh-${marker}@example.invalid`);
    assert.equal(left.get(rows.pendingWeek), `pending-week-${marker}@example.invalid`);
    // 운영 확인용 차단·실패 행은 90일 전까지 남는다
    assert.equal(left.get(rows.blockedKept), `blocked-kept-${marker}@example.invalid`);
    assert.equal(left.get(rows.failedKept), `failed-kept-${marker}@example.invalid`);
    // 다시 실행해도 같은 행을 반복 갱신하지 않는다
    const second = await purgeAgentEmailOutbox(pool);
    assert.deepEqual(await read(), left);
    assert.deepEqual(second, { anonymized: 0, deleted: 0 });
  } finally {
    await pool.query('delete from ap.email_outbox where id = any($1::uuid[])', [Object.values(rows)]);
  }
});
