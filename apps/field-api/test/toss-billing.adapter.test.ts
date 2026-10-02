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

test('Field card registration treats provider 4xx as declined but keeps retryable and transport results unknown', async () => {
  let status = 400, body: string = JSON.stringify({ code: 'INVALID_CARD_EXPIRATION', message: 'secret response must never escape' });
  let transportFailure = false;
  const fetcher: typeof fetch = async () => {
    if (transportFailure) throw new TypeError('network down');
    return new Response(body, { status });
  };
  const provider = createTossBillingProvider({ mode: 'test', mid: 'synthetic-mid', clientKey: 'test_ck_synthetic',
    secretKey: 'test_sk_synthetic', fetcher });
  const issue = () => provider.issue({ authKey: 'synthetic-auth-key', customerKey: 'synthetic-customer', requestKey: randomUUID() });
  // 카드 등록 단계의 4xx는 돈이 움직이지 않은 확정 거절이다.
  for (const [nextStatus, code] of [[400, 'INVALID_CARD_EXPIRATION'], [403, 'REJECT_CARD_COMPANY'], [404, 'NOT_FOUND_AUTH_KEY']] as const) {
    status = nextStatus; body = JSON.stringify({ code, message: 'secret response must never escape' });
    await assert.rejects(issue(), e => {
      assert.equal((e as { kind: string }).kind, 'declined'); assert.equal((e as { code: string }).code, code);
      assert.doesNotMatch(String(e), /secret response/); return true;
    });
  }
  // 같은 멱등키 처리 중·한도 초과·시간 초과·5xx·응답 해석 불가·전송 오류는 결과 미상이다.
  for (const nextStatus of [408, 409, 429, 500, 503]) {
    status = nextStatus; body = JSON.stringify({ code: 'PROVIDER_ERROR' });
    await assert.rejects(issue(), { kind: 'unknown' });
  }
  status = 400; body = 'not json';
  await assert.rejects(issue(), { kind: 'unknown' });
  transportFailure = true;
  await assert.rejects(issue(), { kind: 'unknown', code: 'transport_or_invalid_response' });
  // 결제(charge)의 거절 분류는 기존 목록만 유지한다.
  transportFailure = false; status = 404; body = JSON.stringify({ code: 'NOT_FOUND_AUTH_KEY' });
  await assert.rejects(provider.charge({ billingKey: 'synthetic-billing-key', customerKey: 'synthetic-customer', orderId: 'synthetic-order',
    orderName: 'Synthetic only', amount: 11000, taxFreeAmount: 0, requestKey: randomUUID() }), { kind: 'unknown' });
});
