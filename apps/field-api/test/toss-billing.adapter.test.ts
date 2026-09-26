import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { createTossBillingProvider } from '../src/toss-billing.js';
import { billingContextFromEnvironment, sealBilling, unsealBilling } from '../src/billing-context.js';

test('Field Toss port verifies bindings, preserves request keys, and treats uncertainty as unknown', async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let next: object = { billingKey: 'synthetic-billing-key', customerKey: 'synthetic-customer', mId: 'synthetic-mid' }, status = 200;
  const fetcher: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(next), { status }); };
  const options = { mode: 'test' as const, mid: 'synthetic-mid', clientKey: 'test_ck_synthetic', secretKey: 'test_sk_synthetic', fetcher };
  const provider = createTossBillingProvider(options), requestKey = randomUUID();
  assert.equal(await provider.issue({ authKey: 'synthetic-auth-key', customerKey: 'synthetic-customer', requestKey }), 'synthetic-billing-key');
  assert.equal(calls[0]!.url, 'https://api.tosspayments.com/v1/billing/authorizations/issue');
  assert.equal(new Headers(calls[0]!.init?.headers).get('Idempotency-Key'), requestKey);
  assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), { authKey: 'synthetic-auth-key', customerKey: 'synthetic-customer' });
  const payment = { paymentKey: 'synthetic-payment', orderId: 'synthetic-order', mId: options.mid, currency: 'KRW', type: 'BILLING',
    status: 'DONE', totalAmount: 11000, balanceAmount: 11000, taxFreeAmount: 0, suppliedAmount: 10000, vat: 1000,
    approvedAt: '2026-01-31T00:00:00+09:00', cancels: null };
  next = payment;
  const charged = await provider.charge({ billingKey: 'synthetic-billing-key', customerKey: 'synthetic-customer', orderId: payment.orderId,
    orderName: 'Synthetic only', amount: 11000, taxFreeAmount: 0, requestKey });
  assert.equal(charged.paymentKey, payment.paymentKey);
  assert.equal(charged.approvedAt, payment.approvedAt);
  assert.equal((await provider.lookup(payment.orderId))?.totalAmount, 11000);
  next = { code: 'NOT_FOUND_PAYMENT' }; status = 404;
  assert.equal(await provider.lookup(payment.orderId), null);
  next = { ...payment, mId: 'other-mid' }; status = 200;
  await assert.rejects(provider.lookup(payment.orderId), { kind: 'unknown' });
  next = { code: 'PROVIDER_ERROR', message: 'secret response must never escape' }; status = 500;
  await assert.rejects(provider.charge({ billingKey: 'synthetic-billing-key', customerKey: 'synthetic-customer', orderId: payment.orderId,
    orderName: 'Synthetic only', amount: 11000, taxFreeAmount: 0, requestKey }), e => {
    assert.equal((e as { kind: string }).kind, 'unknown'); assert.doesNotMatch(String(e), /secret response/); return true;
  });
  assert.throws(() => createTossBillingProvider({ ...options, secretKey: 'live_sk_synthetic' }));
  assert.throws(() => createTossBillingProvider({ ...options, clientKey: 'test_gck_widget' }));
});


test('FIELD billing configuration and encryption fail closed across profiles and intent bindings', async () => {
  assert.equal(billingContextFromEnvironment({}), undefined);
  const env = { FIELD_PROFILE: 'mock', FIELD_TOSS_CLIENT_KEY: 'test_ck_synthetic', FIELD_TOSS_SECRET_KEY: 'test_sk_synthetic',
    FIELD_TOSS_MID: 'synthetic-mid', FIELD_BILLING_CREDENTIAL_KEY: randomBytes(32).toString('base64url') };
  const context = billingContextFromEnvironment(env)!;
  assert.equal(context.provider.mode, 'test');
  const cipher = sealBilling('synthetic-auth', context.credentialKey, 'authorization:own');
  assert.equal(unsealBilling(cipher, context.credentialKey, 'authorization:own'), 'synthetic-auth');
  assert.throws(() => unsealBilling(cipher, context.credentialKey, 'authorization:other'));
  assert.throws(() => billingContextFromEnvironment({ ...env, NODE_ENV: 'production' }));
  assert.throws(() => billingContextFromEnvironment({ ...env, FIELD_PROFILE: 'live' }));
  assert.throws(() => billingContextFromEnvironment({ FIELD_TOSS_CLIENT_KEY: 'test_ck_partial' }));
});


test('billing provider identifies its API key without exposing it', () => {
  const first = createTossBillingProvider({ mode:'test',mid:'synthetic-mid',clientKey:'test_ck_synthetic',secretKey:'test_sk_synthetic' });
  const rotated = createTossBillingProvider({ mode:'test',mid:'synthetic-mid',clientKey:'test_ck_synthetic',secretKey:'test_sk_rotated' });
  const fingerprint = (first as typeof first & { keyFingerprint?: string }).keyFingerprint;
  assert.match(fingerprint ?? '',/^[a-f0-9]{64}$/);
  assert.notEqual(fingerprint,(rotated as typeof rotated & { keyFingerprint?: string }).keyFingerprint);
  assert.doesNotMatch(fingerprint ?? '',/test_sk_/);
});
