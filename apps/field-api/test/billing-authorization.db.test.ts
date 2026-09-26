import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { Client, Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import { unsealBilling, type BillingContext } from '../src/billing-context.js';
import { runBillingAuthorizationOnce } from '../src/billing-authorization-execution.js';

process.loadEnvFile(resolve('../../infra/field/.env'));

// DB 전체를 순회하는 worker 검사는 다른 파일의 대기 요청/건수 검수와 분리한다.
const sourceUrl = process.env.FIELD_DATABASE_URL!;
const isolatedDatabase = `fieldai_field_test_${randomUUID().replaceAll('-', '')}`;
let admin: Client | undefined, created = false;
before(async () => {
  const source = new URL(sourceUrl);
  assert.ok(['localhost','127.0.0.1'].includes(source.hostname));
  assert.equal(source.port,'55432'); assert.equal(source.username,'field_local');
  assert.match(source.pathname,/^\/fieldai_field_test_[a-f0-9]+$/);
  const adminUrl = new URL(source); adminUrl.pathname='/postgres';
  admin = new Client({ connectionString: adminUrl.toString() }); await admin.connect();
  await admin.query(`create database "${isolatedDatabase}"`); created=true;
  source.pathname=`/${isolatedDatabase}`; process.env.FIELD_DATABASE_URL=source.toString();
  const migration = spawnSync(process.execPath,['tools/run-migrations.mjs','field'],
    { cwd:resolve('../..'),env:process.env,stdio:'inherit' });
  assert.equal(migration.error,undefined); assert.equal(migration.signal,null); assert.equal(migration.status,0);
});
after(async () => {
  process.env.FIELD_DATABASE_URL=sourceUrl;
  try { if (created) await admin!.query(`drop database "${isolatedDatabase}"`); } finally { await admin?.end(); }
});


async function fixture() {
  process.env.FIELD_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  assert.match(new URL(process.env.FIELD_DATABASE_URL!).pathname, /^\/fieldai_field_test_[a-f0-9]+$/);
  const [owner, operator, approver] = [randomUUID(), randomUUID(), randomUUID()] as const;
  const calls: { authKey: string; customerKey: string; requestKey: string }[] = [];
  let authorizationId = '', fail = false, releaseIssue: (() => void) | undefined;
  let waiting: Promise<void> | undefined;
  const billing: BillingContext = { credentialKey: randomBytes(32), webOrigin: 'http://localhost:3002', provider: {
    mode: 'test', mid: 'synthetic-mid', clientKey: 'test_ck_synthetic',
    async issue(input) {
      calls.push(input);
      const row = (await pool.query('select * from field.billing_authorizations where id=$1', [authorizationId])).rows[0];
      assert.equal(row.state, 'processing'); assert.ok(row.started_at); assert.ok(row.lease_expires_at); assert.ok(row.claim_token);
      assert.equal(input.requestKey, row.request_key);
      if (calls.length === 1) await waiting;
      if (fail) throw new Error('SYNTHETIC-TRANSPORT-NO-RAW-ERROR');
      return 'synthetic-billing-key-NO-RAW-STORAGE';
    },
    async charge() { throw new Error('authorization must not charge'); }, async lookup() { throw new Error('authorization must not read payments'); },
  } };
  const runtime = { pool, billing, resolveUserId: async () => owner, resolveSession: async () => ({ id: owner, userId: owner }) };
  const app = createFieldApp(async () => undefined, undefined, undefined, runtime);
  for (const id of [owner, operator, approver]) await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',
    [id, 'Synthetic authorization', `${id}@example.invalid`]);
  const org = (await app.inject({ method: 'POST', url: '/v1/organizations', payload: { name: '합성 인증 발급 조직' } })).json().id;
  const plan = randomUUID();
  await pool.query(`insert into field.billing_plans(id,mode,name,total_amount,supply_amount,vat_amount,included_ai_units,grace_days,
    terms_version,terms_text,refund_version,refund_text,reference,requested_by,approved_by,approved_at)
    values($1,'test','합성 독립 가격',11000,10000,1000,500,3,'synthetic-terms','합성 약관','synthetic-refund','합성 환불','SYNTHETIC-ONLY',$2,$3,now())`, [plan, operator, approver]);
  const call = (url: string, payload: object = {}) => app.inject({ method: 'POST', url, payload,
    headers: { 'x-organization-id': org, 'idempotency-key': randomUUID() } });
  const checkout = await call('/v1/subscription/checkout', { planId: plan, termsVersion: 'synthetic-terms', refundVersion: 'synthetic-refund',
    totalAmount: 11000, supplyAmount: 10000, vatAmount: 1000, includedAiUnits: 500, graceDays: 3, currency: 'KRW',
    autoRenew: true, termsAccepted: true, firstChargePolicy: 'after_authorization' });
  assert.equal(checkout.statusCode, 201, checkout.body);
  const opened = checkout.json(); authorizationId = opened.authorizationId;
  const response = await call(`/v1/subscription/authorizations/${authorizationId}/confirm`, {
    state: new URL(opened.sdk.successUrl).searchParams.get('state'), customerKey: opened.sdk.customerKey, authKey: 'synthetic-auth-NO-RAW-STORAGE' });
  assert.equal(response.statusCode, 202, response.body);
  const run = async (context: BillingContext | undefined = billing) => {
    return runBillingAuthorizationOnce({ pool, billing: context });
  };
  return { pool, billing, calls, run, org, owner, authorizationId, subscriptionId: opened.subscriptionId, call,
    setFailure(value: boolean) { fail = value; },
    holdIssue() { waiting = new Promise<void>(r => { releaseIssue = r; }); },
    release() { releaseIssue?.(); },
    row: async () => (await pool.query('select * from field.billing_authorizations where id=$1', [authorizationId])).rows[0],
    close: async () => { releaseIssue?.(); await app.close(); await pool.end(); },
  };
}

test('Field issues a product-owned encrypted credential without activating or charging a subscription', async () => {
  const f = await fixture();
  try {
    assert.equal(await f.run(), 'completed');
    const row = await f.row();
    assert.equal(row.state, 'completed'); assert.equal(row.auth_key_ciphertext, null); assert.equal(row.callback_token_ciphertext, null);
    const credential = (await f.pool.query('select * from field.billing_credentials where subscription_id=$1', [f.subscriptionId])).rows[0];
    assert.doesNotMatch(credential.billing_key_ciphertext, /NO-RAW-STORAGE/);
    assert.equal(unsealBilling(credential.billing_key_ciphertext, f.billing.credentialKey, `credential:${f.subscriptionId}`), 'synthetic-billing-key-NO-RAW-STORAGE');
    assert.equal((await f.pool.query('select state from field.paid_subscriptions where id=$1', [f.subscriptionId])).rows[0].state, 'awaiting_authorization');
    assert.equal((await f.pool.query('select count(*)::int n from field.billing_transactions')).rows[0].n, 0);
    assert.equal(await f.run(), 'empty'); assert.equal(f.calls.length, 1);
    assert.doesNotMatch(JSON.stringify((await f.pool.query('select payload from field.billing_events where subscription_id=$1', [f.subscriptionId])).rows), /NO-RAW-STORAGE/);
  } finally { await f.close(); }
});

test('Field lost issuance responses and expired leases reuse the persisted request key', async () => {
  const f = await fixture();
  try {
    f.setFailure(true); assert.equal(await f.run(), 'unknown');
    assert.equal((await f.row()).state, 'unknown'); assert.doesNotMatch((await f.row()).error_code, /SYNTHETIC-TRANSPORT/);
    const before = await f.row();
    await f.pool.query("update field.billing_authorizations set state='processing',claim_token=$2,lease_expires_at=now()-interval '1 second',next_attempt_at=now() where id=$1", [f.authorizationId, randomUUID()]);
    f.setFailure(false); assert.equal(await f.run(), 'completed');
    assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[1], f.calls[0]);
    assert.equal((await f.row()).started_at.getTime(), before.started_at.getTime());
  } finally { await f.close(); }
});

test('Field simultaneous workers do not issue twice while a request owns its lease', async () => {
  const f = await fixture();
  let running: Promise<string> | undefined;
  try {
    f.holdIssue(); running = f.run();
    for (let i = 0; i < 100 && f.calls.length === 0; i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(f.calls.length, 1);
    assert.equal(await f.run(), 'empty');
    assert.equal((await f.call(`/v1/subscription/authorizations/${f.authorizationId}/cancel`)).statusCode, 409);
    f.release(); assert.equal(await running, 'completed');
  } finally { f.release(); await running?.catch(() => undefined); await f.close(); }
});

test('Field missing or changed provider settings preserve uncertainty instead of permitting cancellation', async () => {
  const f = await fixture();
  try {
    assert.equal(await runBillingAuthorizationOnce({ pool: f.pool }), 'blocked_integration');
    assert.equal(f.calls.length, 0);
    await f.pool.query('update field.billing_authorizations set next_attempt_at=now() where id=$1', [f.authorizationId]);
    f.setFailure(true); assert.equal(await f.run(), 'unknown');
    await f.pool.query('update field.billing_authorizations set next_attempt_at=now() where id=$1', [f.authorizationId]);
    const originalMid = f.billing.provider.mid; f.billing.provider.mid = 'other-mid';
    assert.equal(await f.run(), 'unknown'); assert.equal(f.calls.length, 1);
    assert.equal((await f.call(`/v1/subscription/authorizations/${f.authorizationId}/cancel`)).statusCode, 409);
    f.billing.provider.mid = originalMid;
    await f.pool.query('update field.billing_authorizations set next_attempt_at=now() where id=$1', [f.authorizationId]);
    f.setFailure(false); assert.equal(await f.run(), 'completed');
  } finally { await f.close(); }
});

test('Field cancels unstarted work and stops expired or unowned authorization before the provider', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call(`/v1/subscription/authorizations/${f.authorizationId}/cancel`)).statusCode, 200);
    assert.equal(await f.run(), 'empty'); assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
  const expired = await fixture();
  const originalClock = Date.now;
  try {
    Date.now = () => originalClock() + 31 * 60000;
    assert.equal(await expired.run(), 'failed'); assert.equal(expired.calls.length, 0);
    assert.equal((await expired.row()).auth_key_ciphertext, null);
  } finally { Date.now = originalClock; await expired.close(); }
  const unowned = await fixture();
  try {
    await unowned.pool.query("update field.memberships set role='editor' where organization_id=$1 and user_id=$2", [unowned.org, unowned.owner]);
    assert.equal(await unowned.run(), 'blocked_integration'); assert.equal(unowned.calls.length, 0);
  } finally { await unowned.close(); }
});

test('Field stops uncertain issuance after the provider idempotency window and retains evidence', async () => {
  const f = await fixture();
  const originalClock = Date.now;
  try {
    f.setFailure(true); assert.equal(await f.run(), 'unknown');
    const before = await f.row();
    await f.pool.query('update field.billing_authorizations set next_attempt_at=now() where id=$1', [f.authorizationId]);
    Date.now = () => originalClock() + 16 * 86400000;
    assert.equal(await f.run(), 'unknown'); assert.equal(f.calls.length, 1);
    assert.equal((await f.row()).error_code, 'authorization_reconciliation_required');
    assert.ok((await f.row()).auth_key_ciphertext);
    await assert.rejects(f.pool.query('update field.billing_authorizations set started_at=now() where id=$1', [f.authorizationId]), { code: 'PFB03' });
    assert.equal((await f.row()).started_at.getTime(), before.started_at.getTime());
  } finally { Date.now = originalClock; await f.close(); }
});


test('Field ignores a stale issuance response after another worker has recovered the lease', async () => {
  const f = await fixture();
  let first: Promise<string> | undefined;
  try {
    f.holdIssue(); first = f.run();
    for (let i = 0; i < 100 && f.calls.length === 0; i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(f.calls.length, 1);
    await f.pool.query("update field.billing_authorizations set lease_expires_at=now()-interval '1 second' where id=$1", [f.authorizationId]);
    assert.equal(await f.run(), 'completed');
    f.release(); assert.equal(await first, 'superseded');
    assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[0], f.calls[1]);
    assert.equal((await f.pool.query('select count(*)::int n from field.billing_credentials where subscription_id=$1', [f.subscriptionId])).rows[0].n, 1);
    assert.equal((await f.pool.query("select count(*)::int n from field.billing_events where subscription_id=$1 and event_type='authorization_completed'", [f.subscriptionId])).rows[0].n, 1);
  } finally { f.release(); await first?.catch(() => undefined); await f.close(); }
});


test('Field disposes expired unstarted auth keys even when configuration is missing or changed', async () => {
  for (const unavailable of ['missing','changed'] as const) {
    const f = await fixture();
    const originalClock = Date.now;
    try {
      Date.now = () => originalClock() + 31 * 60000;
      f.billing.provider.mid = 'other-mid';
      assert.equal(await runBillingAuthorizationOnce({ pool:f.pool,...(unavailable==='changed' ? { billing:f.billing } : {}) }), 'failed');
      assert.equal((await f.row()).auth_key_ciphertext,null); assert.equal((await f.row()).callback_token_ciphertext,null);
      assert.equal(f.calls.length,0);
    } finally { Date.now=originalClock; await f.close(); }
  }
});
