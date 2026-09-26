import assert from 'node:assert/strict';
import test from 'node:test';

const id = '00000000-0000-4000-8000-000000000001';
const org = '00000000-0000-4000-8000-000000000002';
const sub = '00000000-0000-4000-8000-000000000003';
const key = '00000000-0000-4000-8000-000000000004';
const customer = '00000000-0000-4000-8000-000000000005';
const origin = 'http://127.0.0.1:3002';
const nonce = `${id}.${'n'.repeat(43)}`;
const identity = { userId: 'owner-user', sessionId: 'current-session' };
const plan = { id, mode: 'test', state: 'approved', name: '합성 승인가격', currency: 'KRW', totalAmount: 11000,
  supplyAmount: 10000, vatAmount: 1000, taxFreeAmount: 0, includedAiUnits: 4, graceDays: 3,
  termsVersion: 'test-terms', termsText: '합성 약관이며 실제 청구 아님', refundVersion: 'test-refund', refundText: '합성 환불조건' };
const reply = () => ({ authorizationId: id, subscriptionId: sub, state: 'awaiting', expiresAt: '2099-01-01T00:00:00.000Z',
  sdk: { clientKey: 'test_ck_SYNTHETIC', customerKey: customer, successUrl: `${origin}/billing/return?state=${nonce}`,
    failUrl: `${origin}/billing/return?state=${nonce}&failed=1` } });
async function client() {
  const module = await import('../src/billing-client.js').catch(() => null);
  assert.ok(module, 'own billing return client is not implemented');
  return module;
}

test('callback URL is scrubbed before identity/network work and duplicate authority fields are rejected', async () => {
  const m = await client();
  let cleaned = '';
  const result = m.consumeBillingReturn(`${origin}/billing/return?state=${nonce}&authKey=one-use-secret&customerKey=${customer}`,
    path => { cleaned = path; });
  assert.equal(cleaned, '/billing/return');
  assert.equal(result?.kind, 'success');
  assert.equal(m.parseBillingReturn(`${origin}/billing/return?state=${nonce}&state=${nonce}&authKey=a&customerKey=${customer}`), null);
  assert.equal(m.parseBillingReturn(`${origin}/billing/return?state=${nonce}&authKey=a&customerKey=${customer}&failed=1`), null);
});

test('SDK authority is bound to exact own callback origin and nonce without persisting its raw value', async () => {
  const m = await client();
  const attempt = m.createCheckoutAttempt(identity, org, plan, key, origin);
  const bound = await m.bindCheckoutAuthorization(attempt, reply(), origin);
  assert.equal(bound.authorizationId, id);
  assert.equal(bound.customerKey, customer);
  assert.equal(bound.stateHash?.length, 64);
  assert.doesNotMatch(JSON.stringify(bound), /one-use-secret|\.nnnnnn|test_ck_SYNTHETIC/);
  assert.equal(m.readCheckoutAttempt(JSON.stringify(bound))?.requestKey, key);
  const evil = reply(); evil.sdk.successUrl = `https://other.example/billing/return?state=${nonce}`;
  await assert.rejects(m.bindCheckoutAuthorization(attempt, evil, origin), /billing_sdk_binding_invalid/);
  const badPath = reply(); badPath.sdk.failUrl = `${origin}/other?state=${nonce}&failed=1`;
  await assert.rejects(m.bindCheckoutAuthorization(attempt, badPath, origin), /billing_sdk_binding_invalid/);
});

test('lost checkout response retries the same explicit plan and UUID with own organization', async () => {
  const m = await client();
  const attempt = m.createCheckoutAttempt(identity, org, plan, key, origin);
  const calls: RequestInit[] = [];
  const fetcher: typeof fetch = async (_url, options) => {
    calls.push(options!);
    if (calls.length === 1) throw new Error('synthetic response loss after persistence');
    return Response.json(reply(), { status: 200 });
  };
  await assert.rejects(m.submitCheckout(attempt, fetcher), /billing_result_unknown/);
  const recovered = await m.submitCheckout(attempt, fetcher);
  assert.equal(recovered.authorizationId, id);
  assert.equal(calls[0]?.body, calls[1]?.body);
  for (const options of calls) {
    assert.equal(new Headers(options.headers).get('idempotency-key'), key);
    assert.equal(new Headers(options.headers).get('x-organization-id'), org);
    const body = JSON.parse(String(options.body));
    assert.equal(body.termsAccepted, true); assert.equal(body.autoRenew, true);
    assert.equal(body.totalAmount, plan.totalAmount); assert.equal(body.taxFreeAmount, 0);
  }
});

test('return requires original user session org nonce and customer before sending confirmation', async () => {
  const m = await client();
  const bound = await m.bindCheckoutAuthorization(m.createCheckoutAttempt(identity, org, plan, key, origin), reply(), origin);
  const callback = m.parseBillingReturn(`${origin}/billing/return?state=${nonce}&authKey=one-use-secret&customerKey=${customer}`)!;
  assert.equal(callback.kind,'success');
  if(callback.kind!=='success')throw new Error('success callback required');
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ authorizationId: id, subscriptionId: sub,
    state: 'pending', expiresAt: reply().expiresAt, sdk: null }, { status: 202 }); };
  for (const context of [{ ...identity, sessionId: 'different-session' }, { ...identity, userId: 'other-owner' }])
    await assert.rejects(m.confirmBillingReturn(callback, bound, context, origin, fetcher), /billing_return_binding_invalid/);
  await assert.rejects(m.confirmBillingReturn({ ...callback, state: `${id}.${'x'.repeat(43)}` }, bound, identity, origin, fetcher), /billing_return_binding_invalid/);
  await assert.rejects(m.confirmBillingReturn(callback, bound, identity, 'https://other.example', fetcher), /billing_return_binding_invalid/);
  await assert.rejects(m.confirmBillingReturn({ ...callback, customerKey: org }, bound, identity, origin, fetcher), /billing_return_binding_invalid/);
  assert.equal(calls, 0);
  const response = await m.confirmBillingReturn(callback, bound, identity, origin, fetcher);
  assert.equal(response.state, 'pending');
  assert.equal(calls, 1);
  assert.doesNotMatch(m.authorizationNotice(response.state), /結제 완료|결제 완료|구독 활성화/);
});

test('unknown confirmation retains the same callback in memory and server state cannot become paid from query', async () => {
  const m = await client();
  const bound = await m.bindCheckoutAuthorization(m.createCheckoutAttempt(identity, org, plan, key, origin), reply(), origin);
  const callback = m.parseBillingReturn(`${origin}/billing/return?state=${nonce}&authKey=one-use-secret&customerKey=${customer}`)!;
  const requests: RequestInit[] = [];
  const fetcher: typeof fetch = async (_url, init) => { requests.push(init!); if (requests.length === 1) throw new Error('lost');
    return Response.json({ authorizationId: id, subscriptionId: sub, state: 'completed', expiresAt: reply().expiresAt, sdk: null }); };
  await assert.rejects(m.confirmBillingReturn(callback, bound, identity, origin, fetcher), /billing_result_unknown/);
  const response = await m.confirmBillingReturn(callback, bound, identity, origin, fetcher);
  assert.equal(requests[0]?.body, requests[1]?.body);
  assert.equal(response.state, 'completed');
  assert.match(m.authorizationNotice(response.state), /카드 인증/);
  assert.doesNotMatch(m.authorizationNotice(response.state), /결제 완료/);
  const invalid: typeof fetch = async () => Response.json({ state: 'paid', authorizationId: id, subscriptionId: sub });
  await assert.rejects(m.confirmBillingReturn(callback, bound, identity, origin, invalid), /billing_result_unknown/);
});

test('failure callback performs no confirmation and returns no provider message or auth secret', async () => {
  const m = await client();
  const callback = m.parseBillingReturn(`${origin}/billing/return?state=${nonce}&failed=1&code=PAY_PROCESS_CANCELED&message=private-provider-message`)!;
  assert.equal(callback.kind, 'failure');
  assert.doesNotMatch(JSON.stringify(callback), /private-provider-message/);
  const bound = await m.bindCheckoutAuthorization(m.createCheckoutAttempt(identity, org, plan, key, origin), reply(), origin);
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({}); };
  await assert.rejects(m.confirmBillingReturn(callback, bound, identity, origin, fetcher), /billing_return_binding_invalid/);
  assert.equal(calls, 0);
});

test('stored attempts are metadata only and wrong product or injected authority is rejected', async () => {
  const m = await client();
  const attempt = m.createCheckoutAttempt(identity, org, plan, key, origin);
  assert.equal(m.readCheckoutAttempt(JSON.stringify({ ...attempt, product: 'agent' })), null);
  assert.equal(m.readCheckoutAttempt(JSON.stringify({ ...attempt, authKey: 'raw-secret' })), null);
  assert.equal(m.readCheckoutAttempt(JSON.stringify({ ...attempt, requestKey: 'not-a-uuid' })), null);
  assert.equal(m.readCheckoutAttempt(JSON.stringify({ ...attempt, organizationId: 'not-a-uuid' })), null);
  assert.throws(() => m.createCheckoutAttempt(identity, org, { ...plan, state: 'pending' }, key, origin), /billing_plan_invalid/);
});

test('card window uses bound own customer and redirect options after identity validation', async () => {
  const m = await client();
  const attempt = m.createCheckoutAttempt(identity, org, plan, key, origin);
  const auth = reply();
  const bound = await m.bindCheckoutAuthorization(attempt, auth, origin);
  const inputs: unknown[] = [];
  const loader = async () => (clientKey: string) => {
    inputs.push(clientKey);
    return { payment: (options: unknown) => { inputs.push(options); return {
      requestBillingAuth: async (options: unknown) => { inputs.push(options); } }; } };
  };
  await assert.rejects(m.openBillingSdk(bound, auth, { ...identity, sessionId:'other' }, origin, loader), /billing_return_binding_invalid/);
  assert.equal(inputs.length, 0);
  await m.openBillingSdk(bound, auth, identity, origin, loader);
  assert.deepEqual(inputs, ['test_ck_SYNTHETIC', {customerKey:customer},
    {method:'CARD',successUrl:auth.sdk.successUrl,failUrl:auth.sdk.failUrl,windowTarget:'self'}]);
});

test('known checkout receipt survives an unavailable SDK without granting callback authority', async () => {
  const m = await client();
  const original = m.createCheckoutAttempt(identity, org, plan, key, origin);
  const receipt = m.rememberBillingAuthorization(original, reply());
  const loaded = m.readCheckoutAttempt(JSON.stringify(receipt));
  assert.equal(loaded?.authorizationId, id);
  assert.equal(loaded?.subscriptionId, sub);
  assert.equal(loaded?.stateHash, undefined);
  const callback = m.parseBillingReturn(`${origin}/billing/return?state=${nonce}&authKey=one-use-secret&customerKey=${customer}`)!;
  let calls=0;
  const fetcher:typeof fetch=async()=>{calls++;return Response.json({});};
  await assert.rejects(m.confirmBillingReturn(callback, receipt, identity, origin, fetcher), /billing_return_binding_invalid/);
  assert.equal(calls,0);
});


test('checkout metadata isolates a new login and organization while retaining the original callback request',async()=>{
 const m=await client();const values=new Map<string,string>();
 const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
 const original=await m.bindCheckoutAuthorization(m.createCheckoutAttempt(identity,org,plan,key,origin),reply(),origin);
 m.storeCheckoutAttempt(original,storage);
 const otherIdentity={userId:'another-owner',sessionId:'another-login'};
 const otherOrg='00000000-0000-4000-8000-000000000006';
 assert.equal(m.restoreCheckoutAttempt(otherIdentity,otherOrg,origin,storage),null);
 const other=m.createCheckoutAttempt(otherIdentity,otherOrg,plan,'00000000-0000-4000-8000-000000000007',origin);
 m.storeCheckoutAttempt(other,storage);
 assert.equal(m.restoreCheckoutAttempt(identity,org,origin,storage)?.requestKey,key);
 assert.equal(m.restoreCheckoutAttempt(otherIdentity,otherOrg,origin,storage)?.requestKey,other.requestKey);
 assert.equal(m.restoreCheckoutReturnAttempt(id,identity,origin,storage)?.authorizationId,id);
 assert.equal(m.restoreCheckoutReturnAttempt(id,otherIdentity,origin,storage),null);
 const anotherOrg=m.createCheckoutAttempt(identity,otherOrg,plan,'00000000-0000-4000-8000-000000000008',origin);
 m.storeCheckoutAttempt(anotherOrg,storage);
 assert.equal(m.restoreCheckoutReturnAttempt(id,identity,origin,storage)?.requestKey,key);
 assert.equal(m.restoreCheckoutAttempt(identity,org,origin,storage)?.requestKey,key);
 const legacyValues=new Map<string,string>([[m.checkoutStorageKey,JSON.stringify(original)]]);
 const legacy={getItem:(k:string)=>legacyValues.get(k)??null,setItem:(k:string,v:string)=>{legacyValues.set(k,v);},removeItem:(k:string)=>{legacyValues.delete(k);}};
 assert.equal(m.restoreCheckoutAttempt(otherIdentity,otherOrg,origin,legacy),null);
 assert.ok(legacy.getItem(m.checkoutStorageKey));
 assert.equal(m.restoreCheckoutAttempt(identity,org,origin,legacy)?.requestKey,key);
 m.forgetCheckoutAttempt(original,storage);
 assert.equal(m.restoreCheckoutAttempt(identity,org,origin,storage),null);
 assert.equal(m.restoreCheckoutAttempt(otherIdentity,otherOrg,origin,storage)?.requestKey,other.requestKey);
});


test('a late checkout keeps its original receipt and cannot change the next view or open its card window',async()=>{
 const m=await client(),values=new Map<string,string>();
 const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
 const attempt=m.createCheckoutAttempt(identity,org,plan,key,origin);let current=true;
 const fetcher:typeof fetch=async()=>{current=false;return Response.json(reply(),{status:201});};
 const result=await m.continueCheckout(attempt,identity,origin,storage,()=>current,fetcher);
 assert.equal(result,null);
 assert.equal(m.restoreCheckoutAttempt(identity,org,origin,storage)?.authorizationId,id);
 assert.equal(m.restoreCheckoutAttempt(identity,'00000000-0000-4000-8000-000000000006',origin,storage),null);
});

test('card SDK finishing its load after a view change cannot open a card window',async()=>{
 const m=await client();const bound=await m.bindCheckoutAuthorization(m.createCheckoutAttempt(identity,org,plan,key,origin),reply(),origin);
 let current=true,windows=0;
 const loader=async()=>{current=false;return ()=>({payment:()=>({requestBillingAuth:async()=>{windows++;}})});};
 await assert.rejects(m.openBillingSdk(bound,reply(),identity,origin,loader,()=>current),/billing_checkout_view_changed/);
 assert.equal(windows,0);
});
