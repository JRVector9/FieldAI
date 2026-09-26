import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createTossBillingProvider } from '../src/toss-billing.js';

test('core billing declines require the documented endpoint, HTTP status and exact code', async()=>{
  let status=403, code='REJECT_CARD_PAYMENT';
  const p=createTossBillingProvider({mode:'test',mid:'synthetic-mid',clientKey:'test_ck_fixture',secretKey:'test_sk_fixture',
    fetcher:async()=>new Response(JSON.stringify({code,message:'SECRET-UNTRUSTED'}),{status})});
  const charge={billingKey:'synthetic-billing',customerKey:'synthetic-customer',orderId:'synthetic-order',orderName:'Synthetic',amount:11000,taxFreeAmount:0,requestKey:randomUUID()};
  await assert.rejects(p.charge(charge),{kind:'declined',code});
  for(const pair of [[400,'DUPLICATED_ORDER_ID'],[401,'UNAUTHORIZED_KEY'],[400,'PROVIDER_ERROR'],[500,'REJECT_CARD_PAYMENT'],[400,'REJECT_CARD_PAYMENT']] as const){
    [status,code]=pair;await assert.rejects(p.charge(charge),e=>{assert.equal((e as {kind:string}).kind,'unknown');assert.doesNotMatch(String(e),/SECRET-UNTRUSTED/);return true;});
  }
  status=403;code='REJECT_CARD_PAYMENT';await assert.rejects(p.lookup(charge.orderId),{kind:'unknown'});
});

test('refund port explicitly binds the same payment and retains cancellation proof without nullable request ids',async()=>{
  const key=randomUUID(), reason=`AP refund ${randomUUID()}`;let called:RequestInit|undefined;
  let next:Record<string,unknown>={mId:'synthetic-mid',type:'BILLING',currency:'KRW',paymentKey:'synthetic-payment',orderId:'synthetic-order',status:'PARTIAL_CANCELED',
    totalAmount:11000,balanceAmount:5500,taxFreeAmount:0,suppliedAmount:5000,vat:500,approvedAt:new Date().toISOString(),isPartialCancelable:true,
    cancels:[{cancelAmount:5500,taxFreeAmount:0,cancelReason:reason,canceledAt:new Date().toISOString(),transactionKey:'synthetic-cancel',cancelStatus:'DONE',cancelRequestId:null,refundableAmount:5500}]};
  const p=createTossBillingProvider({mode:'test',mid:'synthetic-mid',clientKey:'test_ck_fixture',secretKey:'test_sk_fixture',
    fetcher:async(url,init)=>{assert.equal(String(url),'https://api.tosspayments.com/v1/payments/synthetic-payment/cancel');called=init;return new Response(JSON.stringify(next));}});
  const input={paymentKey:'synthetic-payment',orderId:'synthetic-order',amount:5500,taxFreeAmount:0,reason,requestKey:key};
  const response=await p.refund!(input);
  assert.equal(new Headers(called?.headers).get('Idempotency-Key'),key);
  assert.deepEqual(JSON.parse(String(called?.body)),{cancelAmount:5500,taxFreeAmount:0,cancelReason:reason,currency:'KRW'});
  assert.equal(response.cancels?.[0]?.transactionKey,'synthetic-cancel');assert.equal(response.cancels?.[0]?.cancelReason,reason);
  assert.equal(Object.hasOwn(response.cancels![0]!,'cancelRequestId'),false);
  next={...next,paymentKey:'other-payment'};await assert.rejects(p.refund!(input),{kind:'unknown'});
  next={...next,paymentKey:'synthetic-payment',cancels:[{transactionKey:'invalid'}]};await assert.rejects(p.refund!(input),{kind:'unknown'});
});
