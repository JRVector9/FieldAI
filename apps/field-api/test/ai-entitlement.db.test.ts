import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, mock, test } from 'node:test';
import { Client, Pool } from 'pg';
import { runner } from 'node-pg-migrate';
import { resolve } from 'node:path';
import { createFieldApp } from '../src/app.js';
import type { FieldBusinessRuntime } from '../src/business.js';
import type { BillingContext } from '../src/billing-context.js';
import { runBillingAuthorizationOnce } from '../src/billing-authorization-execution.js';
import { runBillingChargeOnce } from '../src/billing-charge-execution.js';
import { failAbandonedSiteJobs, runSiteGenerationJob } from '../src/site-generation.js';
import { fieldAiEntitlement, reserveFieldAi } from '../src/ai-entitlement.js';
import { periodAt } from '../src/billing-period.js';
import { runBillingRefundOnce } from '../src/billing-refund-execution.js';
import type { BillingPayment } from '../src/toss-billing.js';
import { createFieldOpenAIProvider } from '../src/field-openai.js';

const source = new URL(process.env.FIELD_DATABASE_URL!);
assert.equal(source.hostname, '127.0.0.1');
assert.equal(source.port, '55432');
assert.equal(source.username, 'field_local');
assert.match(source.pathname, /^\/fieldai_field_test_[a-f0-9]+$/);
process.env.FIELD_PROFILE = 'mock';
const pool = new Pool({ connectionString: source.toString() });
after(async () => { await pool.end(); });

async function withIsolatedDatabase(count: number | undefined, action: (db: Pool, databaseUrl: string) => Promise<void>) {
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() }); await admin.connect();
  const name = 'fieldai_field_test_' + randomUUID().replaceAll('-', '');
  const url = new URL(source); url.pathname = '/' + name;
  let created = false, db: Pool | undefined;
  try {
    await admin.query(`create database "${name}"`); created = true;
    await runner({ databaseUrl: url.toString(), dir: resolve('migrations'), direction: 'up',
      migrationsTable: 'pgmigrations', count, log: () => undefined });
    db = new Pool({ connectionString: url.toString() }); await action(db, url.toString());
  } finally {
    await db?.end(); if (created) await admin.query(`drop database "${name}" with(force)`); await admin.end();
  }
}

async function fixture(units = 1, fixturePool = pool, initialAt?: Date) {
  const pool = fixturePool;
  const [owner, operator, approver] = [randomUUID(), randomUUID(), randomUUID()];
  let actor: string = owner;
  let calls = 0;
  let failure: string | null = null;
  let wait: Promise<void> | undefined;
  let entered: (() => void) | undefined;
  let release: (() => void) | undefined;
  let payment: BillingPayment | null = null;
  let providerAt: Date | undefined = initialAt;
  const billing: BillingContext = { credentialKey: randomBytes(32), webOrigin: 'http://127.0.0.1:3002', provider: {
    mode: 'test', mid: 'synthetic-mid', clientKey: 'test_ck_fixture', keyFingerprint: 'a'.repeat(64),
    async issue() { return 'synthetic-billing-key'; },
    async charge(input) { payment = { paymentKey: 'synthetic-payment-key', orderId: input.orderId,
      status: 'DONE', totalAmount: 11000, balanceAmount: 11000, taxFreeAmount: 0,
      suppliedAmount: 10000, vat: 1000, // 합성 공급사 승인 시각은 Node 시계다. DB 컨테이너 시계가 수 ms 느리면 starts_at이 DB now()보다 미래가 되어
      // 결제 기간이 아직 시작되지 않은 것으로 판정되므로, 명시 시각이 없을 때는 1초 전으로 둔다(validApproval 허용 범위 내).
      approvedAt: (providerAt ?? new Date(Date.now() - 1000)).toISOString(), cancels: [], isPartialCancelable: true };
      return payment; },
    async lookup() { return payment; },
    async refund(input) { assert.ok(payment); payment = { ...payment, balanceAmount: 0, status: 'CANCELED', suppliedAmount: 0, vat: 0,
      cancels: [{ transactionKey: 'synthetic-cancel-' + randomUUID(), cancelAmount: input.amount,
        taxFreeAmount: input.taxFreeAmount, cancelReason: input.reason, canceledAt: new Date().toISOString(), cancelStatus: 'DONE', refundableAmount: 0 }] };
      return payment; },
  } };
  const runtime: FieldBusinessRuntime = { pool, billing, resolveUserId: async () => actor,
    resolveSession: async () => ({ id: actor, userId: actor }),
    siteQueue: { enqueue: async () => undefined },
    siteGenerator: { model: 'synthetic-layout', generate: async () => {
      calls += 1; entered?.(); await wait;
      if (failure) throw new Error(failure);
      return { plan: { template: 'warm', palette: '#9a5335', pages: [{ kind: 'home', sections: ['hero'] }] },
        inputTokens: 24, outputTokens: 16, responseId: randomUUID() };
    } },
  };
  const app = createFieldApp(async () => undefined, undefined, undefined, runtime);
  for (const id of [owner, operator, approver]) await pool.query(
    'insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',
    [id, 'Synthetic quota owner', `${id}@example.invalid`]);
  for (const id of [operator, approver]) await pool.query(
    "insert into field.platform_admin_memberships(user_id,role) values($1,'operator')", [id]);
  const organization = await app.inject({ method: 'POST', url: '/v1/organizations', payload: { name: 'Synthetic Field quota' } });
  assert.equal(organization.statusCode, 201, organization.body);
  const org = organization.json().id as string;
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) => app.inject({ method, url, payload,
    headers: { 'x-organization-id': org, 'idempotency-key': randomUUID(), origin: billing.webOrigin } });
  const price = { mode: 'test', name: 'Synthetic model quota', totalAmount: 11000, supplyAmount: 10000,
    vatAmount: 1000, taxFreeAmount: 0, includedAiUnits: units, graceDays: 3, termsVersion: 'synthetic-terms',
    termsText: 'Synthetic automatically renewed subscription terms', refundVersion: 'synthetic-refund',
    refundText: 'Synthetic retained refund conditions', reference: 'SYNTHETIC-ONLY' };
  actor = operator;
  const requested = await call('POST', '/v1/admin/billing/plans', price);
  assert.equal(requested.statusCode, 201, requested.body);
  const plan = requested.json().id as string;
  actor = approver;
  assert.equal((await call('POST', `/v1/admin/billing/plans/${plan}/approve`, { reason: 'Synthetic different operator approval' })).statusCode, 200);
  actor = owner;
  const checkout = await call('POST', '/v1/subscription/checkout', { planId: plan, termsVersion: price.termsVersion,
    refundVersion: price.refundVersion, totalAmount: 11000, supplyAmount: 10000, vatAmount: 1000, taxFreeAmount: 0,
    currency: 'KRW', includedAiUnits: units, graceDays: 3, autoRenew: true, termsAccepted: true,
    firstChargePolicy: 'after_authorization' });
  assert.equal(checkout.statusCode, 201, checkout.body);
  const opened = checkout.json();
  const confirmation = await call('POST', `/v1/subscription/authorizations/${opened.authorizationId}/confirm`, {
    state: new URL(opened.sdk.successUrl).searchParams.get('state'), customerKey: opened.sdk.customerKey, authKey: 'synthetic-auth-key' });
  assert.equal(confirmation.statusCode, 202, confirmation.body);
  assert.equal(await runBillingAuthorizationOnce({ pool, billing }), 'completed');
  assert.equal(await runBillingChargeOnce({ pool, billing, now: initialAt }), 'paid');
  const period = (await pool.query('select id from field.billing_periods where subscription_id=$1', [opened.subscriptionId])).rows[0].id as string;
  const catalog = { expectedRevision: 0, businessName: 'Synthetic Field quota', industry: '상담', introduction: '사업자가 승인한 소개',
    region: '서울', openingHours: '평일', contactPhone: '010-1234-5678', services: [{ id: randomUUID(),
      name: '상담', description: '사업자가 등록한 서비스', bookingMode: 'request', durationMinutes: 30, priceAmount: 10000 }] };
  assert.equal((await call('PUT', '/v1/business/draft', catalog)).statusCode, 200);
  assert.equal((await call('POST', '/v1/catalog/releases', { expectedRevision: 1 })).statusCode, 201);
  assert.equal((await call('POST', '/v1/sites')).statusCode, 201);
  return { org, owner, operator, approver, period, plan, subscriptionId: opened.subscriptionId as string, billing, runtime, app, call, calls: () => calls, as: (id: string) => { actor = id; },
    renew: async (at: Date) => { providerAt = at; return runBillingChargeOnce({ pool, billing, now: at }); },
    refundFull: async () => {
      actor = owner; const requested = await call('POST', '/v1/subscription/refunds', { periodId: period, amount: 11000,
        reason: 'Synthetic full refund for current period' }); assert.equal(requested.statusCode, 201, requested.body);
      const id = requested.json().id as string;
      actor = operator; let r = await call('POST', `/v1/admin/billing/refunds/${id}/review`, {
        reason: 'Synthetic explicit refund review', reference: 'SYNTHETIC', taxFreeAmount: 0 }); assert.equal(r.statusCode, 200, r.body);
      actor = approver; r = await call('POST', `/v1/admin/billing/refunds/${id}/approve`, { reason: 'Synthetic different operator refund approval' });
      assert.equal(r.statusCode, 200, r.body); assert.equal(await runBillingRefundOnce({ pool, billing }), 'succeeded'); actor = owner;
    },
    start: () => call('POST', '/v1/sites/generation-jobs', { prompt: '승인 정보로 사이트 제작', expectedRevision: 0 }),
    cancel: (id: string) => call('POST', `/v1/sites/generation-jobs/${id}/cancel`),
    summary: async () => (await call('GET', '/v1/usage/summary')).json(),
    failure: (code: string | null) => { failure = code; },
    hold: () => { wait = new Promise<void>(resolve => { release = resolve; }); return new Promise<void>(resolve => { entered = resolve; }); },
    release: () => { release?.(); wait = undefined; entered = undefined; },
    close: async () => { release?.(); await app.close(); },
  };
}

test('Field paid model quota uses the approved period and blocks a second call without another charge', async () => {
  const f = await fixture();
  try {
    const created = await f.start(); assert.equal(created.statusCode, 202, created.body);
    const id = created.json().id as string;
    assert.equal(await runSiteGenerationJob(f.runtime, id), true);
    assert.equal((await f.cancel(id)).statusCode, 200);
    const second = await f.start();
    assert.equal(second.statusCode, 429, second.body);
    assert.equal(second.json().error, 'ai_quota_exhausted');
    assert.equal(f.calls(), 1);
    const summary = await f.summary();
    assert.equal(summary.entitlement.periodId, f.period);
    assert.equal(summary.entitlement.unitPolicy, 'model_call_v1');
    assert.deepEqual(summary.entitlement.siteAi, { includedUnits: 1, consumedUnits: 1,
      reservedUnits: 0, unknownUnits: 0, remainingUnits: 0 });
    assert.equal((await pool.query('select count(*)::int as n from field.billing_transactions where period_id=$1', [f.period])).rows[0].n, 1);
  } finally { await f.close(); }
});

test('Field pre-dispatch cancellation releases its reservation and keeps the original job terminal', async () => {
  const f = await fixture();
  try {
    const created = await f.start(); assert.equal(created.statusCode, 202, created.body);
    assert.equal((await f.summary()).entitlement.siteAi.reservedUnits, 1);
    const id = created.json().id as string;
    assert.equal((await f.cancel(id)).statusCode, 200);
    assert.equal(await runSiteGenerationJob(f.runtime, id), false);
    assert.equal(f.calls(), 0);
    assert.equal((await f.summary()).entitlement.siteAi.remainingUnits, 1);
    assert.equal((await f.start()).statusCode, 202);
  } finally { await f.close(); }
});

test('Field unknown provider outcome holds quota and never sends the same job again', async () => {
  const f = await fixture();
  try {
    f.failure('synthetic_transport_timeout');
    const created = await f.start(); assert.equal(created.statusCode, 202, created.body);
    const id = created.json().id as string;
    assert.equal(await runSiteGenerationJob(f.runtime, id), true);
    assert.equal(await runSiteGenerationJob(f.runtime, id), false);
    assert.equal((await f.start()).statusCode, 429);
    assert.equal(f.calls(), 1);
    assert.equal((await f.summary()).entitlement.siteAi.unknownUnits, 1);
  } finally { await f.close(); }
});

test('Field late valid usage consumes its original quota after cancellation without applying a proposal', async () => {
  const f = await fixture();
  try {
    const created = await f.start(); const id = created.json().id as string;
    const entered = f.hold(); const work = runSiteGenerationJob(f.runtime, id);
    await entered;
    assert.equal((await f.cancel(id)).statusCode, 200);
    f.release(); assert.equal(await work, true);
    const job = (await f.call('GET', '/v1/sites/generation-jobs/latest')).json().job;
    assert.equal(job.status, 'canceled'); assert.equal(job.inputTokens, 24);
    assert.equal((await f.summary()).entitlement.siteAi.consumedUnits, 1);
    assert.equal((await f.start()).statusCode, 429);
  } finally { await f.close(); }
});

test('Field current requester authority is checked before a queued model dispatch', async () => {
  const f = await fixture();
  try {
    const created = await f.start(); const id = created.json().id as string;
    await pool.query('delete from field.memberships where organization_id=$1 and user_id=$2', [f.org, f.owner]);
    assert.equal(await runSiteGenerationJob(f.runtime, id), true);
    assert.equal(f.calls(), 0);
    assert.equal((await pool.query('select status from field.site_generation_jobs where id=$1', [id])).rows[0].status, 'failed');
  } finally { await f.close(); }
});

test('Field documented pre-acceptance HTTP refusal releases quota but a provider 5xx does not', async () => {
  const f = await fixture();
  try {
    f.failure('provider_http_429');
    let created = await f.start(); assert.equal(created.statusCode, 202, created.body);
    assert.equal(await runSiteGenerationJob(f.runtime, created.json().id), true);
    assert.equal((await f.summary()).entitlement.siteAi.remainingUnits, 1);
    f.failure('provider_http_503');
    created = await f.start(); assert.equal(created.statusCode, 202, created.body);
    assert.equal(await runSiteGenerationJob(f.runtime, created.json().id), true);
    assert.equal((await f.summary()).entitlement.siteAi.unknownUnits, 1);
    assert.equal((await f.start()).statusCode, 429);
  } finally { await f.close(); }
});

test('Field abandoned execution keeps its reservation and records late usage without reviving output', async () => {
  const f = await fixture();
  try {
    const created = await f.start(); const id = created.json().id as string;
    const entered = f.hold(); const work = runSiteGenerationJob(f.runtime, id); await entered;
    await pool.query("update field.site_generation_jobs set started_at=now()-interval '61 seconds' where id=$1", [id]);
    await failAbandonedSiteJobs(f.runtime);
    assert.equal((await f.summary()).entitlement.siteAi.unknownUnits, 1);
    f.release(); assert.equal(await work, true);
    const job = (await f.call('GET', '/v1/sites/generation-jobs/latest')).json().job;
    assert.equal(job.status, 'failed'); assert.equal(job.inputTokens, 24);
    assert.equal((await f.summary()).entitlement.siteAi.consumedUnits, 1);
    assert.equal(await runSiteGenerationJob(f.runtime, id), false);
  } finally { await f.close(); }
});

test('Field full refund before dispatch releases the held unit and preserves the original job', async () => {
  const f = await fixture();
  try {
    const created = await f.start(); const id = created.json().id as string;
    await f.refundFull();
    assert.equal(await runSiteGenerationJob(f.runtime, id), true); assert.equal(f.calls(), 0);
    assert.equal((await pool.query('select state from field.ai_entitlements where job_id=$1', [id])).rows[0].state, 'released');
    assert.equal((await pool.query('select status from field.site_generation_jobs where id=$1', [id])).rows[0].status, 'failed');
    assert.equal((await f.start()).statusCode, 403);
  } finally { await f.close(); }
});

test('Field full refund during the call keeps actual cost but prevents a new usable proposal', async () => {
  const f = await fixture();
  try {
    const created = await f.start(); const id = created.json().id as string;
    const entered = f.hold(); const work = runSiteGenerationJob(f.runtime, id); await entered;
    await f.refundFull(); f.release(); assert.equal(await work, true);
    assert.equal((await pool.query('select state from field.ai_entitlements where job_id=$1', [id])).rows[0].state, 'consumed');
    const job = (await f.call('GET', '/v1/sites/generation-jobs/latest')).json().job;
    assert.equal(job.status, 'stale'); assert.equal(job.proposal, null); assert.equal(job.inputTokens, 24);
    assert.equal((await f.start()).statusCode, 403);
  } finally { await f.close(); }
});

test('Field duplicate worker delivery makes one model call and one immutable consumption', async () => {
  const f = await fixture();
  try {
    const created = await f.start(); const id = created.json().id as string;
    const entered = f.hold(); const work = runSiteGenerationJob(f.runtime, id); await entered;
    assert.equal(await runSiteGenerationJob(f.runtime, id), false);
    assert.equal((await f.start()).statusCode, 409);
    f.release(); assert.equal(await work, true);
    assert.equal(f.calls(), 1);
    assert.equal((await pool.query("select count(*)::int n from field.ai_entitlement_events where job_id=$1 and event_type='consumed'", [id])).rows[0].n, 1);
    await assert.rejects(pool.query("update field.ai_entitlements set state='released' where job_id=$1", [id]));
    await assert.rejects(pool.query('update field.billing_periods set included_ai_units=100 where id=$1', [f.period]));
    await pool.query('delete from field.site_generation_jobs where id=$1', [id]);
    assert.equal((await f.summary()).entitlement.siteAi.consumedUnits, 1);
    assert.equal((await f.summary()).siteAi.recordedCalls, 1);
  } finally { await f.close(); }
});

test('Field grace reuses the paid quota and only a confirmed new paid period replenishes it', async () => {
  await withIsolatedDatabase(undefined, async db => {
  const f = await fixture(1, db);
  try {
    const created = await f.start(); const id = created.json().id as string;
    assert.equal(await runSiteGenerationJob(f.runtime, id), true); assert.equal((await f.cancel(id)).statusCode, 200);
    const original = (await db.query('select starts_at,ends_at from field.billing_periods where id=$1', [f.period])).rows[0];
    const graceAt = new Date(original.ends_at.getTime() + 1000);
    const grace = await fieldAiEntitlement(db, f.org, graceAt);
    assert.equal(grace.mode, 'grace'); assert.equal(grace.periodId, f.period); assert.equal(grace.siteAi.remainingUnits, 0);
    assert.equal(await f.renew(graceAt), 'paid');
    const next = await fieldAiEntitlement(db, f.org, graceAt);
    assert.equal(next.mode, 'paid'); assert.notEqual(next.periodId, f.period); assert.equal(next.siteAi.remainingUnits, 1);
    const last = await fieldAiEntitlement(db, f.org, new Date(periodAt(original.starts_at, 1).endsAt.getTime() + 4 * 86400000));
    assert.equal(last.mode, 'cleanup_only'); assert.equal(last.siteAi.includedUnits, null);
  } finally { await f.close(); }
  });
});

test('Field migration keeps legacy paid known usage and unresolved calls instead of resetting quota', async () => {
  await withIsolatedDatabase(71, async (db, databaseUrl) => {
    // This fixture intentionally stops before migration 72 to test its historical
    // AI backfill. Supply only the later deletion guard's read schema for current
    // routes; do not move the migration cutoff or bypass production checks.
    await db.query('alter table field.organizations add column deleted_at timestamptz');
    await db.query('create table field.organization_deletion_requests(organization_id uuid not null,status text not null)');
    await db.query('create table field.account_deletion_journal_binding(id uuid not null,singleton boolean not null,receipt_generation bigint not null default 0)');
    await db.query('insert into field.account_deletion_journal_binding(id,singleton) values(gen_random_uuid(),true)');
    await db.query('create table field.account_deletion_receipts(entry_id uuid,entry_sha256 text,target_kind text,target_id text,stage text)');
    const clock = new Date();
    const initialAt = Array.from({length: 9}, (_,i) => new Date(clock.getTime()-(28+i)*86400000))
      .find(anchor => { const ends=periodAt(anchor,0).endsAt.getTime(); return ends<clock.getTime()-1000&&ends>clock.getTime()-2*86400000; });
    assert.ok(initialAt);
    const f = await fixture(3, db, initialAt);
    try {
      const site = (await db.query('select id from field.sites where organization_id=$1', [f.org])).rows[0].id as string;
      const originalPeriod = (await db.query('select ends_at from field.billing_periods where id=$1', [f.period])).rows[0];
      const started = new Date(originalPeriod.ends_at.getTime() + 1000);
      let queuedId = '';
      for (const state of ['known', 'unknown', 'queued']) {
        const jobId = randomUUID(); if(state === 'queued') queuedId = jobId;
        await db.query(`insert into field.site_generation_jobs(id,organization_id,site_id,requested_by,prompt,base_revision,
          catalog_revision,catalog_snapshot,status,model,started_at,provider_response_id,input_tokens,output_tokens,error_code,created_at)
          select $1,$2,$3,$4,'Legacy quota evidence',0,c.revision,c.content,$5,'synthetic-layout',
            case when $6='queued' then null else $7::timestamptz end,
            case when $6='known' then 'synthetic-legacy-response' else null end,
            case when $6='known' then 20 else null end,case when $6='known' then 10 else null end,
            case when $6='unknown' then 'provider_failed' else null end,$7
          from field.catalog_releases c where c.organization_id=$2 order by c.revision desc limit 1`,
          [jobId, f.org, site, f.owner, state === 'queued' ? 'queued' : 'failed', state, started]);
      }
      assert.equal(await f.renew(new Date()), 'paid');
      await runner({ databaseUrl, dir: resolve('migrations'), direction: 'up', migrationsTable: 'pgmigrations', count: 1, log: () => undefined });
      const summary = await fieldAiEntitlement(db, f.org);
      assert.deepEqual(summary.siteAi, { includedUnits: 3, consumedUnits: 0, reservedUnits: 0, unknownUnits: 0, remainingUnits: 3 });
      assert.notEqual(summary.periodId, f.period);
      const historical=(await db.query("select state,count(*)::int n from field.ai_entitlements where period_id=$1 group by state order by state",[f.period])).rows;
      assert.deepEqual(historical,[{state:'consumed',n:1},{state:'unknown',n:1}]);
      assert.equal((await db.query('select 1 from field.ai_entitlements where job_id=$1',[queuedId])).rowCount,0);
      assert.equal(await runSiteGenerationJob(f.runtime,queuedId),true);
      assert.equal((await db.query('select period_id,state from field.ai_entitlements where job_id=$1',[queuedId])).rows[0].period_id,summary.periodId);
      assert.equal((await fieldAiEntitlement(db,f.org)).siteAi.remainingUnits,2);
      assert.equal((await db.query('select included_ai_units from field.billing_periods where id=$1', [f.period])).rows[0].included_ai_units, 3);
    } finally { await f.close(); }
  });
});

test('Field central admin billing overview executes its own SQL and redacts provider secrets', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('GET', '/v1/admin/billing/overview')).statusCode, 403);
    f.as(f.operator); const response = await f.call('GET', '/v1/admin/billing/overview');
    assert.equal(response.statusCode, 200, response.body);
    const value = response.json(); assert.equal(value.product, 'field'); assert.equal(value.actorUserId, f.operator);
    assert.equal(value.sessionId, f.operator); assert.equal(value.role, 'operator');
    assert.ok(value.transactions.some((t: {organizationId:string;periodId:string;state:string}) => t.organizationId === f.org && t.periodId === f.period && t.state === 'succeeded'));
    assert.doesNotMatch(response.body, /synthetic-payment-key|ciphertext|keyFingerprint|test_ck_fixture/);
    assert.equal((await pool.query("select count(*)::int n from field.admin_access_audit where actor_user_id=$1 and resource='overview'", [f.operator])).rows[0].n, 1);
  } finally { await f.close(); }
});

test('Field completed provider refusal with known usage is consumed instead of losing its cost as unknown', async () => {
  const oldKey = process.env.FIELD_OPENAI_API_KEY, oldModel = process.env.FIELD_OPENAI_MODEL;
  process.env.FIELD_OPENAI_API_KEY = 'synthetic-no-network'; process.env.FIELD_OPENAI_MODEL = 'synthetic-layout';
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ id: 'synthetic-refused-result',
    status: 'completed', usage: { input_tokens: 24, output_tokens: 16 }, output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'synthetic refusal' }] }] }),
    { status: 200, headers: { 'content-type': 'application/json' } }));
  const f = await fixture();
  try {
    const provider = createFieldOpenAIProvider(); assert.ok(provider); f.runtime.siteGenerator = provider;
    const created = await f.start(); const id = created.json().id as string;
    assert.equal(await runSiteGenerationJob(f.runtime, id), true);
    const summary = await f.summary();
    assert.equal(summary.entitlement.siteAi.consumedUnits, 1);
    assert.equal(summary.entitlement.siteAi.unknownUnits, 0);
    assert.equal(summary.siteAi.recordedCalls, 1);
    const job = (await f.call('GET', '/v1/sites/generation-jobs/latest')).json().job;
    assert.equal(job.status, 'failed'); assert.equal(job.inputTokens, 24);
    assert.equal(fetchMock.mock.callCount(), 1);
  } finally {
    await f.close(); fetchMock.mock.restore();
    if (oldKey === undefined) delete process.env.FIELD_OPENAI_API_KEY; else process.env.FIELD_OPENAI_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.FIELD_OPENAI_MODEL; else process.env.FIELD_OPENAI_MODEL = oldModel;
  }
});

test('Field a legacy queued job binds the current period before dispatch instead of bypassing quota', async () => {
  const f = await fixture();
  try {
    const site = (await pool.query('select id from field.sites where organization_id=$1', [f.org])).rows[0].id as string;
    const id = randomUUID();
    await pool.query(`insert into field.site_generation_jobs(id,organization_id,site_id,requested_by,prompt,base_revision,
      catalog_revision,catalog_snapshot,status,model) select $1,$2,$3,$4,'Legacy queued job',0,c.revision,c.content,'queued','synthetic-layout'
      from field.catalog_releases c where c.organization_id=$2 order by c.revision desc limit 1`, [id, f.org, site, f.owner]);
    assert.equal(await runSiteGenerationJob(f.runtime, id), true);
    assert.equal((await pool.query('select period_id,state from field.ai_entitlements where job_id=$1', [id])).rows[0].period_id, f.period);
    assert.equal((await f.summary()).entitlement.siteAi.consumedUnits, 1);
    const other = await fixture();
    try {
      const client = await pool.connect();
      try {
        await client.query('begin'); await client.query('select id from field.organizations where id=$1 for update', [other.org]);
        assert.equal(await reserveFieldAi(client, other.org, id), 'ai_request_terminal'); await client.query('rollback');
      } finally { client.release(); }
    } finally { await other.close(); }
  } finally { await f.close(); }
});
