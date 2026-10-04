import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import { purgeExpiredInboundRecords } from '../src/retention-purge.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
after(async () => { await pool.end(); });

test('Field Toss webhook accepts configured shared-sender volume above 120 and keeps a finite limit',async()=>{
  const prior=process.env.FIELD_BILLING_WEBHOOK_IP_LIMIT;
  process.env.FIELD_BILLING_WEBHOOK_IP_LIMIT='1002';
  const app=createFieldApp(async()=>undefined,undefined,undefined,{pool,resolveUserId:async()=>null});
  try {
    await pool.query('delete from field.billing_webhook_ip_windows');
    for(let count=0;count<1002;count++){
      const response=await app.inject({method:'POST',url:'/v1/billing/webhooks/toss',remoteAddress:'198.51.100.219',payload:{eventType:'BILLING_DELETED',data:{}}});
      assert.equal(response.statusCode,200,`configured request ${count+1}: ${response.body}`);
    }
    const limited=await app.inject({method:'POST',url:'/v1/billing/webhooks/toss',remoteAddress:'198.51.100.219',payload:{eventType:'BILLING_DELETED',data:{}}});
    assert.equal(limited.statusCode,429);assert.ok(Number(limited.headers['retry-after'])>0);
  }finally{await app.close();if(prior===undefined)delete process.env.FIELD_BILLING_WEBHOOK_IP_LIMIT;else process.env.FIELD_BILLING_WEBHOOK_IP_LIMIT=prior;}
});

// 토스 웹훅(추가): 공급사 미설정 시 mock은 차단 상태로 기록만 하고, 그 외 환경은 503으로 거절한다.
test('Field Toss webhook records blocked_integration in mock, rejects elsewhere, and rate limits per IP', async () => {
  const profile = process.env.FIELD_PROFILE;
  const app = createFieldApp(async () => undefined, undefined, undefined, { pool, resolveUserId: async () => null });
  const marker = randomUUID();
  const body = { eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId: `order_${marker}`.slice(0, 40), status: 'DONE', marker } };
  const stored = async () => Number((await pool.query<{ count: string }>(
    'select count(*)::text as count from field.billing_webhook_events where order_id = $1', [body.data.orderId])).rows[0]!.count);
  try {
    process.env.FIELD_PROFILE = 'sandbox';
    const rejected = await app.inject({ method: 'POST', url: '/v1/billing/webhooks/toss', payload: body, remoteAddress: '198.51.100.7' });
    assert.equal(rejected.statusCode, 503);
    assert.deepEqual(rejected.json(), { error: 'blocked_integration' });
    assert.equal(await stored(), 0);
    process.env.FIELD_PROFILE = 'mock';
    const received = await app.inject({ method: 'POST', url: '/v1/billing/webhooks/toss', payload: body, remoteAddress: '198.51.100.7' });
    assert.equal(received.statusCode, 200, received.body);
    // 응답은 처리 결과를 드러내지 않는 고정값이다.
    assert.deepEqual(received.json(), { received: true });
    assert.equal(await stored(), 1);
    const row = (await pool.query<Record<string, unknown>>(
      'select * from field.billing_webhook_events where order_id = $1', [body.data.orderId])).rows[0]!;
    assert.equal(row.outcome, 'blocked_integration');
    assert.ok(row.processed_at);
    // 미인증 원문(payload)은 저장하지 않는다.
    assert.equal('payload' in row, false);
    assert.doesNotMatch(JSON.stringify(row), new RegExp(marker));
    // 같은 IP의 15분 창은 120회까지 받고 그 뒤에는 429와 Retry-After를 돌려준다.
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    await pool.query('delete from field.billing_webhook_ip_windows');
    for (let index = 0; index < 120; index += 1) {
      const accepted = await app.inject({ method: 'POST', url: '/v1/billing/webhooks/toss', payload: { eventType: 'BILLING_DELETED', data: {} }, remoteAddress: ip });
      assert.equal(accepted.statusCode, 200, accepted.body);
    }
    const limited = await app.inject({ method: 'POST', url: '/v1/billing/webhooks/toss', payload: body, remoteAddress: ip });
    assert.equal(limited.statusCode, 429);
    assert.ok(Number(limited.headers['retry-after']) >= 1);
    assert.equal(await stored(), 1);
    // Security #4: IPv6는 /64로 묶는다. 같은 /64 안에서 주소만 바꿔도 같은 창이고, 다른 /64는 별도 창이다.
    await pool.query('delete from field.billing_webhook_ip_windows');
    for (let index = 0; index < 120; index += 1) {
      const accepted = await app.inject({ method: 'POST', url: '/v1/billing/webhooks/toss', payload: { eventType: 'BILLING_DELETED', data: {} },
        remoteAddress: `2001:db8:5:6:${(index + 1).toString(16)}::1` });
      assert.equal(accepted.statusCode, 200, accepted.body);
    }
    assert.equal((await app.inject({ method: 'POST', url: '/v1/billing/webhooks/toss', payload: body, remoteAddress: '2001:db8:5:6:ffff::9' })).statusCode, 429);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/billing/webhooks/toss', payload: { eventType: 'BILLING_DELETED', data: {} },
      remoteAddress: '2001:db8:5:7::1' })).statusCode, 200);
    assert.equal((await pool.query('select count(*)::int as n from field.billing_webhook_ip_windows')).rows[0].n, 2);
  } finally {
    if (profile === undefined) delete process.env.FIELD_PROFILE; else process.env.FIELD_PROFILE = profile;
    await app.close();
  }
});

// 짧은 보존 정리: 30일 지난 웹훅 힌트와 끝난 IP·비밀번호 시도 창만 지우고 최근 행은 남긴다.
test('Field inbound cleanup removes only expired webhook hints and attempt windows', async () => {
  const oldOrder = `order_${randomUUID()}`.slice(0, 40), freshOrder = `order_${randomUUID()}`.slice(0, 40);
  const oldWindow = randomUUID().replaceAll('-', '').padEnd(64, '0'), freshWindow = randomUUID().replaceAll('-', '').padEnd(64, 'a');
  const oldUser = randomUUID(), freshUser = randomUUID(), owner = randomUUID(), org = randomUUID();
  await pool.query(`insert into field.billing_webhook_events(id,event_type,order_id,received_at,processed_at,outcome) values
    ($1,'PAYMENT_STATUS_CHANGED',$2,now()-interval '31 days',now(),'blocked_integration'),
    ($3,'PAYMENT_STATUS_CHANGED',$4,now()-interval '29 days',now(),'blocked_integration')`,
  [randomUUID(), oldOrder, randomUUID(), freshOrder]);
  await pool.query(`insert into field.billing_webhook_ip_windows(subject_hash,attempts,window_started_at,updated_at) values
    ($1,1,now()-interval '20 minutes',now()-interval '20 minutes'),($2,1,now(),now())`, [oldWindow, freshWindow]);
  await pool.query(`insert into field.account_deletion_password_windows(user_id,attempts,window_started_at,updated_at) values
    ($1,1,now()-interval '20 minutes',now()-interval '20 minutes'),($2,1,now(),now())`, [oldUser, freshUser]);
  // M2: 공개 접수 IP 창·전화번호 창도 15분 창이 끝나면 지운다.
  await pool.query('insert into "user"(id,name,email,"emailVerified") values ($1,$1,$2,true)', [owner, `${owner}@example.invalid`]);
  await pool.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Field Window Org']);
  for (const table of ['public_submission_ip_windows', 'public_submission_windows'])
    await pool.query(`insert into field.${table}(organization_id,subject_hash,attempts,window_started_at,updated_at) values
      ($1,$2,1,now()-interval '20 minutes',now()-interval '20 minutes'),($1,$3,1,now(),now())`, [org, oldWindow, freshWindow]);
  const purged = await purgeExpiredInboundRecords(pool);
  assert.ok(purged.billingWebhookEvents >= 1 && purged.billingWebhookIpWindows >= 1 && purged.passwordWindows >= 1);
  assert.deepEqual([purged.publicSubmissionIpWindows, purged.publicSubmissionWindows], [1, 1]);
  for (const table of ['public_submission_ip_windows', 'public_submission_windows'])
    assert.deepEqual((await pool.query(`select subject_hash from field.${table} where organization_id = $1`, [org])).rows,
      [{ subject_hash: freshWindow }], table);
  assert.deepEqual((await pool.query('select order_id from field.billing_webhook_events where order_id = any($1::text[])',
    [[oldOrder, freshOrder]])).rows, [{ order_id: freshOrder }]);
  assert.deepEqual((await pool.query('select subject_hash from field.billing_webhook_ip_windows where subject_hash = any($1::text[])',
    [[oldWindow, freshWindow]])).rows, [{ subject_hash: freshWindow }]);
  assert.deepEqual((await pool.query('select user_id from field.account_deletion_password_windows where user_id = any($1::text[])',
    [[oldUser, freshUser]])).rows, [{ user_id: freshUser }]);
  await pool.query('delete from field.billing_webhook_ip_windows where subject_hash = $1', [freshWindow]);
  await pool.query('delete from field.account_deletion_password_windows where user_id = $1', [freshUser]);
});
