import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));

test('AP owns approved immutable price versions, period constraints and blocked unconfigured checkout', async () => {
  process.env.AP_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
  assert.match(new URL(process.env.AP_DATABASE_URL!).pathname, /^\/fieldai_agent_test_[a-f0-9]+$/);
  const [owner, operator, approver, auditor] = Array.from({ length: 4 }, () => randomUUID());
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined, {
    pool, resolveUserId: async h => typeof h['x-test-user'] === 'string' ? h['x-test-user'] : null,
  });
  const call = (method: 'GET' | 'POST', url: string, actor = owner, payload?: object, key = randomUUID()) =>
    app.inject({ method, url, payload, headers: { 'x-test-user': actor, 'idempotency-key': key } });
  try {
    for (const id of [owner, operator, approver, auditor]) await pool.query(
      'insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)', [id, 'Synthetic billing', `${id}@example.invalid`]);
    for (const id of [operator, approver]) await pool.query(
      "insert into ap.platform_admin_memberships(user_id,role) values($1,'operator')", [id]);
    await pool.query("insert into ap.platform_admin_memberships(user_id,role) values($1,'auditor')", [auditor]);
    const org = (await call('POST', '/v1/organizations', owner, { name: '합성 AP 구독' })).json().id;
    const body = { name: '합성 AP 테스트 구독', mode: 'test', totalAmount: 11000,
      supplyAmount: 10000, vatAmount: 1000, graceDays: 3, includedAiUnits: 500,
      termsVersion: 'synthetic-terms-v1', termsText: '합성 검수용 명시 갱신 조건입니다.',
      refundVersion: 'synthetic-refund-v1', refundText: '합성 검수용 별도 환불 조건입니다.', reference: 'SYNTHETIC-ONLY' };
    assert.equal((await call('POST', '/v1/admin/billing/plans', owner, body)).statusCode, 403);
    assert.equal((await call('POST', '/v1/admin/billing/plans', auditor, body)).statusCode, 403);
    assert.equal((await call('POST', '/v1/admin/billing/plans', operator, { ...body, vatAmount: 1001 })).statusCode, 400);
    const key = randomUUID(), requested = await call('POST', '/v1/admin/billing/plans', operator, body, key);
    assert.equal(requested.statusCode, 201, requested.body);
    const plan = requested.json();
    assert.equal((await call('POST', '/v1/admin/billing/plans', operator, body, key)).json().id, plan.id);
    assert.equal((await call('POST', '/v1/admin/billing/plans', operator, { ...body, name: '다른 구독' }, key)).statusCode, 409);
    assert.equal((await call('POST', `/v1/admin/billing/plans/${plan.id}/approve`, operator, { reason: '같은 운영자 승인 거절' })).statusCode, 403);
    assert.equal((await call('POST', `/v1/admin/billing/plans/${plan.id}/approve`, auditor, { reason: '감사자 판매 승인 거절' })).statusCode, 403);
    assert.equal((await call('GET', '/v1/subscription/plans')).json().plans.length, 0);
    const approved = await call('POST', `/v1/admin/billing/plans/${plan.id}/approve`, approver, { reason: '다른 운영자가 합성 가격 조건을 승인합니다.' });
    assert.equal(approved.statusCode, 200, approved.body);
    const available = await call('GET', '/v1/subscription/plans');
    assert.equal(available.statusCode, 200, available.body);
    assert.equal(available.json().plans[0].id, plan.id);
    assert.equal(available.json().plans[0].totalAmount, 11000);
    assert.equal(available.json().product, 'agent');
    await assert.rejects(pool.query('update ap.billing_plans set total_amount=12000,supply_amount=11000 where id=$1', [plan.id]), { code: 'PAB01' });
    const status = await call('GET', '/v1/subscription/billing');
    assert.equal(status.statusCode, 200, status.body);
    assert.equal(status.json().organizationId, org);
    assert.deepEqual(status.json().periods, []);
    assert.equal((await call('POST', '/v1/subscription/checkout', owner, { planId: plan.id, termsAccepted: true })).statusCode, 503);
    assert.equal((await pool.query('select count(*)::int as n from ap.paid_subscriptions where organization_id=$1', [org])).rows[0].n, 0);
    const livePlan = (await call('POST', '/v1/admin/billing/plans', operator, { ...body, mode: 'live' })).json();
    assert.equal((await call('POST', `/v1/admin/billing/plans/${livePlan.id}/approve`, approver,
      { reason: '로컬 권한으로 실판매 승인을 대신하지 않습니다.' })).statusCode, 503);
    process.env.AP_PROFILE = 'live';
    assert.equal((await call('GET', '/v1/subscription/plans')).json().plans.length, 0);
    process.env.AP_PROFILE = 'sandbox';
    assert.deepEqual((await call('GET', '/v1/admin/billing/plans', operator)).json(), { error: 'mfa_required' });
    assert.deepEqual((await call('POST', '/v1/admin/billing/plans', operator, body)).json(), { error: 'mfa_required' });
    process.env.AP_PROFILE = 'mock';
    // Only this isolated fixture seeds a pending ledger. It does not simulate a payment.
    const sub = randomUUID(), consent = randomUUID(), period = randomUUID();
    await pool.query('insert into ap.paid_subscriptions(id,organization_id,plan_id,customer_key,created_by) values($1,$2,$3,$4,$5)',
      [sub, org, plan.id, randomUUID(), owner]);
    const insertConsent = (id: string, planId: string, amount: number, terms: string) => pool.query(`insert into ap.billing_consents
      (id,subscription_id,plan_id,accepted_by,terms_version,refund_version,total_amount,supply_amount,vat_amount,
      currency,included_ai_units,grace_days,auto_renew) values($1,$2,$3,$4,$5,'synthetic-refund-v1',$6,$7,1000,'KRW',500,3,true)`,
    [id, sub, planId, owner, terms, amount, amount - 1000]);
    await assert.rejects(insertConsent(randomUUID(), livePlan.id, 11000, 'synthetic-terms-v1'), { code: 'PAB01' });
    await assert.rejects(insertConsent(randomUUID(), plan.id, 12000, 'synthetic-terms-v1'), { code: 'PAB01' });
    await assert.rejects(insertConsent(randomUUID(), plan.id, 11000, 'changed-terms'), { code: 'PAB01' });
    await pool.query(`insert into ap.billing_consents(id,subscription_id,plan_id,accepted_by,terms_version,refund_version,
      total_amount,supply_amount,vat_amount,currency,included_ai_units,grace_days,auto_renew)
      values($1,$2,$3,$4,'synthetic-terms-v1','synthetic-refund-v1',11000,10000,1000,'KRW',500,3,true)`, [consent, sub, plan.id, owner]);
    const insertPeriod = (id: string) => pool.query(`insert into ap.billing_periods(id,subscription_id,billing_period,consent_id,plan_id,
      starts_at,ends_at,total_amount,supply_amount,vat_amount,currency)
      values($1,$2,0,$3,$4,'2026-01-31T00:00:00+09:00','2026-02-28T00:00:00+09:00',11000,10000,1000,'KRW')`, [id, sub, consent, plan.id]);
    await insertPeriod(period);
    await assert.rejects(insertPeriod(randomUUID()), { code: '23505' });
    await assert.rejects(pool.query(`insert into ap.billing_periods(id,subscription_id,billing_period,consent_id,plan_id,
      starts_at,ends_at,total_amount,supply_amount,vat_amount,currency)
      values($1,$2,1,$3,$4,'2026-02-15T00:00:00+09:00','2026-03-15T00:00:00+09:00',11000,10000,1000,'KRW')`,
    [randomUUID(), sub, consent, plan.id]), { code: '23P01' });
    await pool.query(`insert into ap.billing_periods(id,subscription_id,billing_period,consent_id,plan_id,
      starts_at,ends_at,total_amount,supply_amount,vat_amount,currency)
      values($1,$2,1,$3,$4,'2026-02-28T00:00:00+09:00','2026-03-31T00:00:00+09:00',11000,10000,1000,'KRW')`,
    [randomUUID(), sub, consent, plan.id]);
    await assert.rejects(pool.query('update ap.billing_periods set total_amount=12000,supply_amount=11000 where id=$1', [period]), { code: 'PAB01' });
    await assert.rejects(pool.query("update ap.billing_consents set terms_version='changed' where id=$1", [consent]), { code: 'PAB01' });
    assert.equal((await call('POST', `/v1/admin/billing/plans/${plan.id}/retire`, operator,
      { reason: '새 판매만 중단하고 기존 동의는 유지합니다.' })).statusCode, 200);
    assert.equal((await call('GET', '/v1/subscription/plans')).json().plans.length, 0);
    assert.equal((await call('GET', '/v1/subscription/billing')).json().periods[0].totalAmount, 11000);
    const currentPlan=(await call('GET','/v1/subscription/billing')).json().currentPlan;
    assert.equal(currentPlan?.name,body.name);
    assert.equal(currentPlan?.totalAmount,11000);
    assert.equal(currentPlan?.includedAiUnits,500);
    assert.equal(currentPlan?.state,'retired');
    await assert.rejects(insertConsent(randomUUID(), plan.id, 11000, 'synthetic-terms-v1'), { code: 'PAB01' });

  } finally { await app.close(); await pool.end(); }
});
