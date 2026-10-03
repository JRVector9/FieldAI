import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';
import { purgeBillingWebhookRecords } from '../src/billing-webhook.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await pool.end(); });

// 토스 웹훅(추가): 공급사 미설정 시 mock은 차단 상태로 기록만 하고, 그 외 환경은 503으로 거절한다.
test('AP Toss webhook records blocked_integration in mock, rejects elsewhere, and rate limits per IP', async () => {
  const profile = process.env.AP_PROFILE;
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined, { pool, resolveUserId: async () => null });
  const marker = randomUUID();
  const body = { eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId: `order_${marker}`.slice(0, 40), status: 'DONE', marker } };
  const stored = async () => Number((await pool.query<{ count: string }>(
    'select count(*)::text as count from ap.billing_webhook_events where order_id = $1', [body.data.orderId])).rows[0]!.count);
  try {
    process.env.AP_PROFILE = 'sandbox';
    const rejected = await app.inject({ method: 'POST', url: '/v1/billing/webhooks/toss', payload: body, remoteAddress: '198.51.100.7' });
    assert.equal(rejected.statusCode, 503);
    assert.deepEqual(rejected.json(), { error: 'blocked_integration' });
    assert.equal(await stored(), 0);
    process.env.AP_PROFILE = 'mock';
    const received = await app.inject({ method: 'POST', url: '/v1/billing/webhooks/toss', payload: body, remoteAddress: '198.51.100.7' });
    assert.equal(received.statusCode, 200, received.body);
    // 응답은 처리 결과(미상 건 존재 여부)를 드러내지 않는 고정 본문이다.
    assert.deepEqual(received.json(), { received: true });
    assert.equal(await stored(), 1);
    const row = (await pool.query<{ outcome: string; processed_at: Date | null; order_id: string }>(
      'select outcome, processed_at, order_id from ap.billing_webhook_events where order_id = $1', [body.data.orderId])).rows[0]!;
    assert.equal(row.outcome, 'blocked_integration');
    assert.ok(row.processed_at);
    assert.equal(row.order_id, body.data.orderId);
    // 같은 IP의 15분 창은 120회까지 받고 그 뒤에는 429와 Retry-After를 돌려준다.
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    await pool.query('delete from ap.billing_webhook_ip_windows');
    for (let index = 0; index < 120; index += 1) {
      const accepted = await app.inject({ method: 'POST', url: '/v1/billing/webhooks/toss', payload: { eventType: 'BILLING_DELETED', data: {} }, remoteAddress: ip });
      assert.equal(accepted.statusCode, 200, accepted.body);
    }
    const limited = await app.inject({ method: 'POST', url: '/v1/billing/webhooks/toss', payload: body, remoteAddress: ip });
    assert.equal(limited.statusCode, 429);
    assert.ok(Number(limited.headers['retry-after']) >= 1);
    assert.equal(await stored(), 1);
  } finally {
    if (profile === undefined) delete process.env.AP_PROFILE; else process.env.AP_PROFILE = profile;
    await app.close();
  }
});

// 보존 정리(추가): 30일 지난 수신 기록과 15분 창이 끝난 IP 창만 지우고 최근 기록은 남긴다. 원문 컬럼은 없다.
test('AP Toss webhook cleanup removes events older than 30 days and expired IP windows only', async () => {
  const oldId = randomUUID(), freshId = randomUUID();
  const oldWindow = 'a'.repeat(64), freshWindow = 'b'.repeat(64);
  try {
    const columns = (await pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema='ap' and table_name='billing_webhook_events'")).rows
      .map(row => row.column_name);
    assert.ok(columns.includes('payment_key_hash'));
    assert.ok(!columns.includes('payload') && !columns.includes('payment_key'));
    await pool.query(`insert into ap.billing_webhook_events(id, event_type, received_at) values
      ($1, 'BILLING_DELETED', now() - interval '31 days'), ($2, 'BILLING_DELETED', now() - interval '29 days')`, [oldId, freshId]);
    await pool.query(`insert into ap.billing_webhook_ip_windows(subject_hash, attempts, window_started_at, updated_at) values
      ($1, 1, now() - interval '20 minutes', now() - interval '16 minutes'), ($2, 1, now(), now())`, [oldWindow, freshWindow]);
    const purged = await purgeBillingWebhookRecords(pool);
    assert.ok(purged.events >= 1 && purged.windows >= 1);
    assert.deepEqual((await pool.query<{ id: string }>('select id from ap.billing_webhook_events where id = any($1::uuid[])',
      [[oldId, freshId]])).rows.map(row => row.id), [freshId]);
    assert.deepEqual((await pool.query<{ subject_hash: string }>('select subject_hash from ap.billing_webhook_ip_windows where subject_hash = any($1::text[])',
      [[oldWindow, freshWindow]])).rows.map(row => row.subject_hash), [freshWindow]);
  } finally {
    await pool.query('delete from ap.billing_webhook_events where id = any($1::uuid[])', [[oldId, freshId]]);
    await pool.query('delete from ap.billing_webhook_ip_windows where subject_hash = any($1::text[])', [[oldWindow, freshWindow]]);
  }
});
