import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));

test('AP owner explicitly consents once and binds queued card authorization to its session', async () => {
  process.env.AP_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
  assert.match(new URL(process.env.AP_DATABASE_URL!).pathname, /^\/fieldai_agent_test_[a-f0-9]+$/);
  const [owner, editor, operator, approver, outsider] = Array.from({ length: 5 }, () => randomUUID());
  let session = randomUUID();
  const runtime = { pool, resolveUserId: async (h: import('node:http').IncomingHttpHeaders) => typeof h['x-test-user'] === 'string' ? h['x-test-user'] : null,
    resolveSession: async (h: import('node:http').IncomingHttpHeaders) => typeof h['x-test-user'] === 'string' ? { id: session, userId: h['x-test-user'] } : null,
    billing: { credentialKey: randomBytes(32), webOrigin: 'http://localhost:3001', provider: {
      mode: 'test' as const, clientKey: 'test_ck_synthetic', mid: 'synthetic-mid',
      issue: async () => { throw new Error('provider must not run in request'); }, charge: async () => { throw new Error('provider must not run in request'); },
      lookup: async () => null,
    } },
  };
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined, runtime);
  const call = (method: 'GET' | 'POST', url: string, actor = owner, payload?: object, key = randomUUID(), headers: object = {}) =>
    app.inject({ method, url, payload, headers: { 'x-test-user': actor, 'idempotency-key': key, ...headers } });
  try {
    for (const id of [owner, editor, operator, approver, outsider]) await pool.query(
      'insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)', [id, 'Synthetic consent', `${id}@example.invalid`]);
    for (const id of [operator, approver]) await pool.query("insert into ap.platform_admin_memberships(user_id,role) values($1,'operator')", [id]);
    const org = (await call('POST', '/v1/organizations', owner, { name: '합성 AP 구독' })).json().id;
    await call('POST', '/v1/organizations', outsider, { name: '별도 합성 조직' });
    await pool.query("insert into ap.memberships(organization_id,user_id,role) values($1,$2,'editor')", [org, editor]);
    const price = { name: '합성 제품별 구독', mode: 'test', totalAmount: 11000, supplyAmount: 10000, vatAmount: 1000,
      graceDays: 3, includedAiUnits: 500, termsVersion: 'synthetic-terms-v1', termsText: '합성 명시적 매월 갱신 조건입니다.',
      refundVersion: 'synthetic-refund-v1', refundText: '합성 환불 조건 검수용입니다.', reference: 'SYNTHETIC-ONLY' };
    const plan = (await call('POST', '/v1/admin/billing/plans', operator, price)).json().id;
    await call('POST', `/v1/admin/billing/plans/${plan}/approve`, approver, { reason: '다른 합성 운영자의 시험 조건 승인' });
    const consent = { planId: plan, termsVersion: price.termsVersion, refundVersion: price.refundVersion,
      totalAmount: price.totalAmount, supplyAmount: price.supplyAmount, vatAmount: price.vatAmount, currency: 'KRW',
      includedAiUnits: price.includedAiUnits, graceDays: price.graceDays, termsAccepted: true, autoRenew: true,
      firstChargePolicy: 'after_authorization' };
    const key = randomUUID(), checkout = await call('POST', '/v1/subscription/checkout', owner, consent, key);
    assert.equal(checkout.statusCode, 201, checkout.body);
    assert.equal((await call('POST', '/v1/subscription/checkout', editor, consent)).statusCode, 403);
    assert.equal((await call('POST', '/v1/subscription/checkout', owner, { ...consent, autoRenew: false })).statusCode, 400);
    assert.equal((await call('POST', '/v1/subscription/checkout', owner, { ...consent, totalAmount: 12000 })).statusCode, 409);
    const started = checkout.json();
    assert.equal(started.state, 'awaiting');
    assert.equal(started.sdk.clientKey, 'test_ck_synthetic');
    assert.match(started.sdk.customerKey, /^[a-f0-9-]{36}$/);
    const replayed = (await call('POST', '/v1/subscription/checkout', owner, consent, key)).json();
    assert.equal(replayed.authorizationId, started.authorizationId);
    assert.equal(replayed.sdk.successUrl, started.sdk.successUrl);
    assert.equal((await call('POST', '/v1/subscription/checkout', owner, { ...consent, autoRenew: false }, key)).statusCode, 400);
    assert.equal((await call('POST', '/v1/subscription/checkout', owner, consent)).statusCode, 409);
    const state = new URL(started.sdk.successUrl).searchParams.get('state');
    assert.ok(state);
    const confirmation = { state, customerKey: started.sdk.customerKey, authKey: 'synthetic-auth-key-NO-RAW-STORAGE' };
    const url = `/v1/subscription/authorizations/${started.authorizationId}/confirm`;
    assert.equal((await call('GET', `/v1/subscription/authorizations/${started.authorizationId}`, outsider)).statusCode, 404);
    assert.equal((await call('POST', url, outsider, confirmation)).statusCode, 404);
    assert.equal((await call('POST', url, owner, confirmation, randomUUID(), { origin: 'https://other.invalid' })).statusCode, 403);
    const originalClock = Date.now;
    try { Date.now = () => originalClock() + 31 * 60000;
      assert.equal((await call('POST', url, owner, confirmation)).statusCode, 410);
    } finally { Date.now = originalClock; }
    assert.equal((await call('POST', url, owner, { ...confirmation, state: 'wrong-state' })).statusCode, 403);
    const originalMid = runtime.billing.provider.mid; runtime.billing.provider.mid = 'other-mid';
    assert.equal((await call('POST', url, owner, confirmation)).statusCode, 409);
    assert.equal((await call('POST', '/v1/subscription/checkout', owner, consent, key)).statusCode, 409);
    runtime.billing.provider.mid = originalMid;
    const originalSession = session; session = randomUUID();
    assert.equal((await call('POST', url, owner, confirmation)).statusCode, 403); session = originalSession;
    const confirmed = await call('POST', url, owner, confirmation);
    assert.equal(confirmed.statusCode, 202, confirmed.body); assert.equal(confirmed.json().state, 'pending');
    assert.equal((await call('POST', url, owner, confirmation)).statusCode, 202);
    assert.equal((await call('POST', url, owner, { ...confirmation, authKey: 'different-auth-key' })).statusCode, 409);
    const stored = (await pool.query('select * from ap.billing_authorizations where id=$1', [started.authorizationId])).rows[0];
    assert.ok(stored.auth_key_ciphertext); assert.doesNotMatch(stored.auth_key_ciphertext, /NO-RAW-STORAGE/);
    assert.doesNotMatch(JSON.stringify((await pool.query('select result from ap.billing_requests')).rows), /NO-RAW-STORAGE|state=/);
    assert.equal((await pool.query('select count(*)::int n from ap.billing_periods')).rows[0].n, 0);
    assert.equal((await pool.query('select count(*)::int n from ap.billing_consents')).rows[0].n, 1);
    const canceled = await call('POST', `/v1/subscription/authorizations/${started.authorizationId}/cancel`, owner, {});
    assert.equal(canceled.statusCode, 200, canceled.body);
    assert.equal((await call('POST', url, owner, confirmation)).statusCode, 409);
    const ended = (await pool.query('select auth_key_ciphertext,callback_token_ciphertext from ap.billing_authorizations where id=$1', [started.authorizationId])).rows[0];
    assert.equal(ended.auth_key_ciphertext, null); assert.equal(ended.callback_token_ciphertext, null);
    assert.equal((await call('POST', '/v1/subscription/checkout', owner, consent)).statusCode, 201);
  } finally { await app.close(); await pool.end(); }
});
