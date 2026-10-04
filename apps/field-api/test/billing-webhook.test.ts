import assert from 'node:assert/strict';
import { test } from 'node:test';
import { billingWebhookIpLimit, parseTossWebhook } from '../src/billing-webhook.js';

// 토스 웹훅 본문 검증(추가): 식별자만 힌트로 꺼내고 금액·상태 값은 해석하지 않는다.
test('Field Toss webhook parser keeps only identifier hints', () => {
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

test('Field webhook sender cap validates finite operator settings',()=>{
  assert.equal(billingWebhookIpLimit(''),120);assert.equal(billingWebhookIpLimit('6000'),6000);
  assert.equal(billingWebhookIpLimit('100000'),100000);
  for(const invalid of ['0','-1','100001','Infinity','1.5','abc',' 120 '])assert.throws(()=>billingWebhookIpLimit(invalid),/FIELD_BILLING_WEBHOOK_IP_LIMIT/);
});
