import assert from 'node:assert/strict';
import test from 'node:test';
const organizationId='00000000-0000-4000-8000-000000000001';
const periodId='00000000-0000-4000-8000-000000000002';
const subscriptionId='00000000-0000-4000-8000-000000000003';
const requestKey='00000000-0000-4000-8000-000000000004';
const refundId='00000000-0000-4000-8000-000000000005';
const context={organizationId,userId:'owner-user',sessionId:'own-current-session',origin:'http://localhost:3001'};
const body={periodId,amount:5500,reason:'합성 구독 환불 검토 요청 사유'};
function storage(){const values=new Map<string,string>();return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};}
async function client(){const m=await import('../src/billing-mutation-client.js').catch(()=>null);assert.ok(m,'own mutation metadata helper is not implemented');return m;}

test('lost refund response reloads original body and UUID, then acknowledges exact request receipt',async()=>{
 const m=await client(),store=storage(),calls:RequestInit[]=[],attempt=m.prepareBillingMutation('refund',body,context,store,()=>requestKey);
 const fetcher:typeof fetch=async(url,init)=>{assert.equal(url,'/v1/subscription/refunds');calls.push(init!);assert.equal(JSON.parse(store.getItem(m.billingMutationStorageKey('refund',context))!).stage,'unknown');
 if(calls.length===1)throw new Error('RAW-PROVIDER-SECRET');return Response.json({id:refundId,state:'requested'});};
 await assert.rejects(m.submitBillingMutation(attempt,context,store,fetcher),/billing_result_unknown/);
 const restored=m.restoreBillingMutation('refund',context,store)!;assert.deepEqual(restored.body,body);assert.equal(restored.requestKey,requestKey);
 let created=0;const retry=m.prepareBillingMutation('refund',body,context,store,()=>{created++;return refundId;});assert.equal(created,0);assert.equal(retry.requestKey,requestKey);
 assert.throws(()=>m.prepareBillingMutation('refund',{...body,amount:6000},context,store,()=>refundId),/idempotency_conflict/);
 const receipt=await m.submitBillingMutation(retry,context,store,fetcher);assert.deepEqual(receipt,{kind:'refund',id:refundId,state:'requested'});
 assert.equal(store.getItem(m.billingMutationStorageKey('refund',context)),null);assert.equal(calls[0]!.body,calls[1]!.body);
 for(const call of calls){assert.equal(new Headers(call.headers).get('idempotency-key'),requestKey);assert.equal(new Headers(call.headers).get('x-organization-id'),organizationId);assert.equal(call.credentials,'same-origin');}
});

test('renewal-stop exact receipt survives unknown and never becomes subscription refund',async()=>{
 const m=await client(),store=storage(),attempt=m.prepareBillingMutation('cancel-renewal',{subscriptionId},context,store,()=>requestKey);let calls=0;
 const fetcher:typeof fetch=async(url,init)=>{assert.equal(url,'/v1/subscription/billing/cancel');assert.deepEqual(JSON.parse(String(init?.body)),{subscriptionId});calls++;
 return calls===1?Response.json({subscriptionId,state:'canceled',renewalStopped:false}):Response.json({subscriptionId,state:'canceled',renewalStopped:true});};
 await assert.rejects(m.submitBillingMutation(attempt,context,store,fetcher),/billing_result_unknown/);assert.ok(m.restoreBillingMutation('cancel-renewal',context,store));
 const result=await m.submitBillingMutation(attempt,context,store,fetcher);assert.deepEqual(result,{kind:'cancel-renewal',subscriptionId,state:'canceled',renewalStopped:true});assert.equal(store.values.size,0);
});

test('other session user organization origin and product metadata cannot execute or overwrite an unknown request',async()=>{
 const m=await client(),store=storage(),attempt=m.prepareBillingMutation('refund',body,context,store,()=>requestKey);let calls=0;
 const fetcher:typeof fetch=async()=>{calls++;throw new Error('unknown');};await assert.rejects(m.submitBillingMutation(attempt,context,store,fetcher));
 for(const changed of [{...context,sessionId:'other-session'},{...context,userId:'other-user'},{...context,organizationId:refundId},{...context,origin:'https://other.invalid'}]){
 assert.equal(m.restoreBillingMutation('refund',changed,store),null);
 await assert.rejects(m.submitBillingMutation(attempt,changed,store,fetcher),/billing_mutation_binding_invalid/);
 const independent=m.prepareBillingMutation('refund',body,changed,store,()=>refundId);assert.equal(independent.requestKey,refundId);assert.equal(m.restoreBillingMutation('refund',context,store)!.requestKey,requestKey);}
 assert.equal(calls,1);const key=m.billingMutationStorageKey('refund',context);store.setItem(key,JSON.stringify({...attempt,product:'field',stage:'unknown'}));
 assert.throws(()=>m.prepareBillingMutation('refund',body,context,store,()=>refundId),/billing_mutation_metadata_invalid/);assert.ok(store.getItem(key));
});

test('only first-attempt documented precommit rejection clears metadata; prior unknown errors retain it',async()=>{
 const m=await client();
 for(const action of ['refund','cancel-renewal'] as const){const store=storage(),input=action==='refund'?body:{subscriptionId};let attempt=m.prepareBillingMutation(action,input,context,store,()=>requestKey);
 const invalid=action==='refund'?'invalid_refund_request':'invalid_cancel_request';
 await assert.rejects(m.submitBillingMutation(attempt,context,store,async()=>Response.json({error:invalid},{status:400})),{code:invalid,status:400});assert.equal(store.values.size,0);
 attempt=m.prepareBillingMutation(action,input,context,store,()=>requestKey);await assert.rejects(m.submitBillingMutation(attempt,context,store,async()=>{throw new Error('unknown');}));
 await assert.rejects(m.submitBillingMutation(attempt,context,store,async()=>Response.json({error:invalid},{status:400})));assert.equal(m.restoreBillingMutation(action,context,store)!.requestKey,requestKey);}
});

test('409 conflicts in-progress, unrecognized status/errors and malformed receipts remain unresolved',async()=>{
 const m=await client();
 const replies=[()=>Response.json({error:'idempotency_conflict'},{status:409}),()=>Response.json({error:'refund_in_progress'},{status:409}),
 ()=>Response.json({error:'refund_amount_exceeded'},{status:500}),()=>Response.json({error:'RAW-PROVIDER-SECRET'},{status:400}),
 ()=>Response.json({id:refundId,state:'succeeded'}),()=>Response.json({id:'not-uuid',state:'requested'}),()=>new Response('not-json',{status:200}),
 ()=>Response.json({id:refundId,state:'requested'},{status:202})];
 for(const next of replies){const store=storage(),attempt=m.prepareBillingMutation('refund',body,context,store,()=>requestKey);
 await assert.rejects(m.submitBillingMutation(attempt,context,store,async()=>next()),e=>{assert.doesNotMatch(String(e),/RAW-PROVIDER-SECRET/);return true;});assert.ok(store.getItem(m.billingMutationStorageKey('refund',context)));}
});

test('metadata rejects injected authority and card/provider/auth secrets, and persists before sending',async()=>{
 const m=await client(),store=storage();
 for(const input of [{...body,authKey:'raw-auth-secret'},{...body,billingKey:'provider-secret'},{...body,reason:'환불 이유 test_sk_SYNTHETIC_SECRET 노출 금지'},
 {...body,reason:'카드번호 4111 1111 1111 1111 입력 금지'}])assert.throws(()=>m.prepareBillingMutation('refund',input,context,store,()=>requestKey),/billing_mutation_input_invalid/);
 const attempt=m.prepareBillingMutation('refund',body,context,store,()=>requestKey);const raw=store.getItem(m.billingMutationStorageKey('refund',context))!;
 assert.doesNotMatch(raw,/authKey|billingKey|paymentKey|customerKey|provider|cardNumber|secretKey/);
 assert.equal(m.readBillingMutation(JSON.stringify({...attempt,authKey:'raw-secret'})),null);
 let called=false;const unavailable={...store,setItem:()=>{throw new Error('quota');}};
 await assert.rejects(m.submitBillingMutation(attempt,context,unavailable,async()=>{called=true;return Response.json({id:refundId,state:'requested'});}),/billing_retry_storage_unavailable/);assert.equal(called,false);
});

test('same tab concurrent submit cannot clear an in-flight unknown or start another UUID',async()=>{
 const m=await client(),store=storage(),attempt=m.prepareBillingMutation('refund',body,context,store,()=>requestKey);let release:(()=>void)|undefined,calls=0;
 const waiting=new Promise<void>(r=>{release=r;});const fetcher:typeof fetch=async()=>{calls++;await waiting;return Response.json({error:'invalid_refund_request'},{status:400});};
 const first=m.submitBillingMutation(attempt,context,store,fetcher);while(calls===0)await new Promise(r=>setTimeout(r,1));
 await assert.rejects(m.submitBillingMutation(attempt,context,store,fetcher),/billing_mutation_in_progress/);assert.equal(calls,1);assert.ok(store.getItem(m.billingMutationStorageKey('refund',context)));
 release!();await assert.rejects(first,{code:'invalid_refund_request'});assert.equal(store.values.size,0);
});


test('documented amount rejection before any unknown permits correction, but never clears a prior unknown',async()=>{
 const m=await client(),store=storage();const attempt=m.prepareBillingMutation('refund',body,context,store,()=>requestKey);
 await assert.rejects(m.submitBillingMutation(attempt,context,store,async()=>Response.json({error:'refund_amount_exceeded'},{status:409})),{code:'refund_amount_exceeded',status:409});assert.equal(store.values.size,0);
 const corrected=m.prepareBillingMutation('refund',{...body,amount:1000},context,store,()=>refundId);assert.equal(corrected.requestKey,refundId);
 await assert.rejects(m.submitBillingMutation(corrected,context,store,async()=>{throw new Error('lost response');}));
 await assert.rejects(m.submitBillingMutation(corrected,context,store,async()=>Response.json({error:'refund_amount_exceeded'},{status:409})));assert.equal(m.restoreBillingMutation('refund',context,store)!.requestKey,refundId);
});


test('organization A unknown does not block organization B and scoped metadata never exposes the prior session body',async()=>{
 const m=await client(),store=storage(),a=m.prepareBillingMutation('refund',body,context,store,()=>requestKey);
 await assert.rejects(m.submitBillingMutation(a,context,store,async()=>{throw new Error('unknown A');}));
 const other={...context,organizationId:refundId},bBody={...body,amount:1000,reason:'독립 조직 B의 새로운 명시 요청'};
 assert.equal(m.restoreBillingMutation('refund',other,store),null);const b=m.prepareBillingMutation('refund',bBody,other,store,()=>subscriptionId);
 assert.equal(b.requestKey,subscriptionId);assert.notEqual(m.billingMutationStorageKey('refund',context),m.billingMutationStorageKey('refund',other));
 assert.equal(m.restoreBillingMutation('refund',context,store)!.requestKey,requestKey);assert.deepEqual(m.restoreBillingMutation('refund',other,store)!.body,bBody);
 let calls=0;await assert.rejects(m.submitBillingMutation(a,other,store,async()=>{calls++;return Response.json({id:refundId,state:'requested'});}),/billing_mutation_binding_invalid/);assert.equal(calls,0);
 await m.submitBillingMutation(b,other,store,async()=>Response.json({id:refundId,state:'requested'}));assert.equal(m.restoreBillingMutation('refund',other,store),null);assert.equal(m.restoreBillingMutation('refund',context,store)!.stage,'unknown');
 const newSession={...context,userId:'other-user',sessionId:'other-session'};assert.equal(m.restoreBillingMutation('refund',newSession,store),null);
});

test('legacy metadata migrates only its exact original context and other contexts leave it intact',async()=>{
 const m=await client(),store=storage(),legacy=m.prepareBillingMutation('refund',body,context,store,()=>requestKey),legacyKey='agent:billing-mutation:refund:v1';
 store.removeItem(m.billingMutationStorageKey('refund',context));const legacyRaw=JSON.stringify({...legacy,stage:'unknown'});store.setItem(legacyKey,legacyRaw);
 const other={...context,sessionId:'new-session'};assert.equal(m.restoreBillingMutation('refund',other,store),null);assert.equal(store.getItem(legacyKey),legacyRaw);
 const fresh=m.prepareBillingMutation('refund',{...body,amount:1000},other,store,()=>refundId);assert.equal(fresh.requestKey,refundId);assert.equal(store.getItem(legacyKey),legacyRaw);
 const restored=m.restoreBillingMutation('refund',context,store)!;assert.equal(restored.requestKey,requestKey);assert.deepEqual(restored.body,body);assert.equal(restored.stage,'unknown');
 assert.equal(store.getItem(legacyKey),null);assert.equal(m.restoreBillingMutation('refund',other,store)!.requestKey,refundId);
 const key=m.billingMutationStorageKey('refund',context);assert.ok(store.getItem(key));
});


test('foreign malformed legacy does not block independent scoped recovery and is never deleted',async()=>{
 const m=await client(),store=storage(),original=m.prepareBillingMutation('refund',body,context,store,()=>requestKey),legacyKey='agent:billing-mutation:refund:v1';
 store.removeItem(m.billingMutationStorageKey('refund',context));const foreign=JSON.stringify({...original,stage:'unknown',body:{authKey:'RAW-LEGACY-SECRET'}});store.setItem(legacyKey,foreign);
 const other={...context,organizationId:refundId,sessionId:'independent-session'};
 assert.equal(m.restoreBillingMutation('refund',other,store),null);const independent=m.prepareBillingMutation('refund',{...body,amount:1000},other,store,()=>subscriptionId);
 assert.equal(independent.requestKey,subscriptionId);assert.equal(store.getItem(legacyKey),foreign);
 assert.throws(()=>m.restoreBillingMutation('refund',context,store),/billing_mutation_metadata_invalid/);assert.equal(store.getItem(legacyKey),foreign);
 await assert.rejects(m.submitBillingMutation(independent,other,store,async()=>{throw new Error('lost');}));
 store.setItem(legacyKey,'unparseable-old-pointer');assert.equal(m.restoreBillingMutation('refund',other,store)!.requestKey,subscriptionId);
 const retry=m.prepareBillingMutation('refund',{...body,amount:1000},other,store,()=>refundId);assert.equal(retry.requestKey,subscriptionId);assert.equal(store.getItem(legacyKey),'unparseable-old-pointer');
 assert.throws(()=>m.prepareBillingMutation('refund',body,{...context,sessionId:'new-empty-context'},store,()=>refundId),/billing_mutation_metadata_invalid/);
});
