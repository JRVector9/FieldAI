import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTossWebhook, webhookIpBucket } from '../src/billing-webhook.js';

// 토스 웹훅 본문 검증(추가): 식별자만 힌트로 꺼내고 금액·상태 값은 해석하지 않는다.
test('AP Toss webhook parser keeps only identifier hints', () => {
  assert.deepEqual(parseTossWebhook({ eventType: 'PAYMENT_STATUS_CHANGED', createdAt: '2026-10-03T00:00:00',
    data: { paymentKey: 'tgen_20261003abc', orderId: 'order_123456', status: 'DONE', totalAmount: 1 } }),
  { eventType: 'PAYMENT_STATUS_CHANGED', paymentKey: 'tgen_20261003abc', orderId: 'order_123456' });
  assert.deepEqual(parseTossWebhook({ createdAt: '2026-10-03T00:00:00', secret: 's', status: 'DONE', orderId: 'order_123456' }),
    { eventType: 'DEPOSIT_CALLBACK', paymentKey: null, orderId: 'order_123456' });
  assert.deepEqual(parseTossWebhook({ eventType: 'BILLING_DELETED', data: { billingKey: 'b' } }),
    { eventType: 'BILLING_DELETED', paymentKey: null, orderId: null });
  for (const invalid of [null, 'text', [], {}, { eventType: 'lower_case', data: {} }, { eventType: 'A'.repeat(65) },
    { eventType: 'PAYMENT_STATUS_CHANGED', data: [] }, { eventType: 'PAYMENT_STATUS_CHANGED', data: 'x' },
    { eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId: 'short' } },
    { eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId: 'order 123456' } },
    { eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId: 123456789 } },
    { eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'bad key' } },
    { eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'k'.repeat(201) } },
    { orderId: 'order_123456', data: {} }])
    assert.equal(parseTossWebhook(invalid), null, JSON.stringify(invalid));
});

test('AP billing webhook IP limit can be raised explicitly and rejects malformed limits',async()=>{
  const {billingWebhookIpLimitFromEnvironment}=await import('../src/billing-webhook.js');
  assert.equal(billingWebhookIpLimitFromEnvironment(undefined),120);
  assert.equal(billingWebhookIpLimitFromEnvironment(''),120);
  assert.equal(billingWebhookIpLimitFromEnvironment('1000'),1000);
  assert.equal(billingWebhookIpLimitFromEnvironment('100000'),100000);
  for(const invalid of ['0','100001','-1','1.5','1e3',' 120 ','invalid'])assert.throws(()=>billingWebhookIpLimitFromEnvironment(invalid),/AP_BILLING_WEBHOOK_IP_LIMIT/);
});

// 보안 #4: 웹훅 IP 창은 IPv6를 /64로 묶고, IPv4 매핑 주소는 IPv4로 본다.
test('AP Toss webhook IP window groups IPv6 by /64 and unwraps IPv4-mapped addresses', () => {
  assert.equal(webhookIpBucket('203.0.113.9'), '203.0.113.9');
  assert.equal(webhookIpBucket('::ffff:203.0.113.9'), '203.0.113.9');
  const bucket = webhookIpBucket('2001:db8:12:34::1');
  assert.equal(bucket, '2001:0db8:0012:0034::/64');
  for (const sibling of ['2001:db8:12:34:ffff:ffff:ffff:ffff', '2001:0DB8:0012:0034:0:0:0:abcd', '2001:db8:12:34::'])
    assert.equal(webhookIpBucket(sibling), bucket, sibling);
  assert.notEqual(webhookIpBucket('2001:db8:12:35::1'), bucket);
  assert.equal(webhookIpBucket('::1'), '0000:0000:0000:0000::/64');
});
