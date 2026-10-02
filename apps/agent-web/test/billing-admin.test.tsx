import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const id='00000000-0000-4000-8000-000000000001',period='00000000-0000-4000-8000-000000000002',key='00000000-0000-4000-8000-000000000003';
const context={userId:'operator-a',sessionId:'current-session',origin:'http://localhost:3001'};
const plan={id,mode:'test',state:'pending',name:'명시 승인 플랜',currency:'KRW',totalAmount:11000,supplyAmount:10000,vatAmount:1000,taxFreeAmount:0,includedAiUnits:500,graceDays:3,termsVersion:'terms-1',termsText:'명시된 구독 이용 조건입니다.',refundVersion:'refund-1',refundText:'명시된 환불 조건입니다.',reference:'cost-evidence-1',requestedBy:'operator-b',approvedBy:null,approvedAt:null,createdAt:'2026-09-27T00:00:00.000Z'};
const refund={id,organizationId:period,periodId:period,amount:5500,taxFreeAmount:null,state:'requested',reason:'고객이 요청한 구독 환불 사유',refundVersion:'refund-1',createdAt:'2026-09-27T00:00:00.000Z',reviewedAt:null,approvedAt:null,completedAt:null,errorCode:null,requestedRole:'owner',requestedBy:'owner-a',reviewedBy:null,approvedBy:null,reference:null,reviewReason:null,approvalReason:null};
const overview={product:'agent',actorUserId:context.userId,sessionId:context.sessionId,role:'operator',snapshotAt:'2026-09-27T00:00:00.000Z',counts:{unconfirmedCharges:'2',renewalFailures:'1',refundRequests:'1'},transactions:[],refundExecution:[{id,mode:'test',dispatchedAt:null}]};
function storage(){const values=new Map<string,string>();return {values,get length(){return values.size;},key:(i:number)=>Array.from(values.keys())[i]??null,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};}
async function client(){const m=await import('../src/billing-admin-client.js').catch(()=>null);assert.ok(m,'new billing admin consumer is not implemented');return m;}
function fetcher(post:(init:RequestInit)=>Response|Promise<Response>,changes:Partial<typeof overview>={}):typeof fetch{return async(url,init)=>{
 if(url==='/api/auth/get-session')return Response.json({user:{id:context.userId},session:{id:context.sessionId,userId:context.userId}});
 if(url==='/v1/admin/billing/overview')return Response.json({...overview,...changes});
 if(url==='/v1/admin/billing/plans'&&init?.method!=='POST')return Response.json({product:'agent',plans:[plan]});
 if(url==='/v1/admin/billing/refunds'&&init?.method!=='POST')return Response.json({product:'agent',refunds:[refund]});
 return post(init!);
};}
test('actual own GET DTO and current session metadata load without card/provider fields',async()=>{
 const m=await client(),s=await m.loadBillingAdmin(context.origin,fetcher(()=>{throw new Error('unexpected POST');}));
 assert.equal(s.overview.counts.unconfirmedCharges,'2');assert.equal(s.plans[0]?.requestedBy,'operator-b');assert.equal(s.refunds[0]?.amount,5500);
 await assert.rejects(m.loadBillingAdmin(context.origin,fetcher(()=>Response.json({}),{product:'field'})),/billing_admin_result_unknown/);
 await assert.rejects(m.loadBillingAdmin(context.origin,fetcher(()=>Response.json({}),{sessionId:'other-session'})),/billing_admin_binding_invalid/);
});
test('auditor, same requester and same refund reviewer never receive approval authority',async()=>{
 const m=await client(),s=await m.loadBillingAdmin(context.origin,fetcher(()=>Response.json({})));
 assert.equal(m.adminBillingActionReason(s,'plan-approve',id),null);
 assert.ok(m.adminBillingActionReason({...s,overview:{...s.overview,role:'auditor'}},'plan-approve',id));
 assert.ok(m.adminBillingActionReason({...s,plans:[{...s.plans[0]!,requestedBy:context.userId}]},'plan-approve',id));
 assert.ok(m.adminBillingActionReason({...s,refunds:[{...s.refunds[0]!,state:'reviewed',reviewedBy:context.userId}]},'refund-approve',id));
 assert.ok(m.adminBillingActionReason({...s,refunds:[{...s.refunds[0]!,state:'unknown'}]},'refund-reject',id));
});
test('lost review response reloads exact context body/key and confirms reviewed rather than executed',async()=>{
 const m=await client(),store=storage(),body={reason:'운영자가 거래와 환불 범위를 검토했습니다.',reference:'evidence-1',taxFreeAmount:0};
 const a=m.prepareAdminBillingMutation('refund-review',id,body,context,store,()=>key);let calls=0;const sent:RequestInit[]=[];
 const f=fetcher(init=>{sent.push(init);calls++;return calls===1?Promise.reject(new Error('raw-payment-secret')):Response.json({...refund,state:'reviewed',taxFreeAmount:0,reviewedBy:context.userId,reviewedAt:'2026-09-27T00:00:00.000Z',reference:body.reference,reviewReason:body.reason});});
 await assert.rejects(m.submitAdminBillingMutation(a,context,store,f),/billing_admin_result_unknown/);
 const restored=m.restoreAdminBillingMutation('refund-review',id,context,store)!;assert.equal(restored.requestKey,key);assert.deepEqual(restored.body,body);
 assert.throws(()=>m.prepareAdminBillingMutation('refund-review',id,{...body,taxFreeAmount:1},context,store,()=>period),/idempotency_conflict/);
 const result=await m.submitAdminBillingMutation(restored,context,store,f);assert.equal(result.state,'reviewed');assert.equal(store.values.size,0);
 assert.equal(sent[0]?.body,sent[1]?.body);assert.equal(new Headers(sent[1]?.headers).get('Idempotency-Key'),key);
});
test('unknown keeps original UUID on conflict or malformed receipt; initial precise precommit denial can clear',async()=>{
 const m=await client(),store=storage(),body={reason:'다른 운영자가 명시적으로 승인합니다.'};let a=m.prepareAdminBillingMutation('plan-approve',id,body,context,store,()=>key);
 await assert.rejects(m.submitAdminBillingMutation(a,context,store,fetcher(()=>Response.json({error:'different_approver_required'},{status:403}))));assert.equal(store.values.size,0);
 a=m.prepareAdminBillingMutation('plan-approve',id,body,context,store,()=>key);
 await assert.rejects(m.submitAdminBillingMutation(a,context,store,fetcher(()=>Response.json({...plan,id:period,state:'approved'}))));
 await assert.rejects(m.submitAdminBillingMutation(a,context,store,fetcher(()=>Response.json({error:'different_approver_required'},{status:403}))));assert.equal(m.restoreAdminBillingMutation('plan-approve',id,context,store)?.requestKey,key);
 await assert.rejects(m.submitAdminBillingMutation(a,context,store,fetcher(()=>Response.json({error:'plan_state_changed'},{status:409}))));assert.equal(store.values.size,1);
});
test('other context remains independent but cannot send original attempt; current role/session must be rechecked',async()=>{
 const m=await client(),store=storage(),a=m.prepareAdminBillingMutation('plan-retire',id,{reason:'신규 판매를 중지할 명시 사유입니다.'},context,store,()=>key);let posts=0;
 const other={...context,sessionId:'other-session'};assert.equal(m.restoreAdminBillingMutation('plan-retire',id,other,store),null);
 assert.equal(m.prepareAdminBillingMutation('plan-retire',id,a.body,other,store,()=>period).requestKey,period);
 await assert.rejects(m.submitAdminBillingMutation(a,other,store,fetcher(()=>{posts++;return Response.json({...plan,state:'retired'});})),/billing_admin_binding_invalid/);
 await assert.rejects(m.submitAdminBillingMutation(a,context,store,fetcher(()=>{posts++;return Response.json({});},{role:'auditor'})),/operator_membership_required/);assert.equal(posts,0);
});
test('explicit economic inputs and secret-free retry storage fail before request',async()=>{
 const m=await client(),store=storage(),{id:_id,state:_state,currency:_currency,requestedBy:_requestedBy,approvedBy:_approvedBy,approvedAt:_approvedAt,createdAt:_createdAt,...body}=plan;void [_id,_state,_currency,_requestedBy,_approvedBy,_approvedAt,_createdAt];
 assert.equal(m.prepareAdminBillingMutation('plan-request',null,body,context,store,()=>key).body.totalAmount,11000);
 assert.throws(()=>m.prepareAdminBillingMutation('plan-request',null,{...body,totalAmount:11001},context,storage(),()=>key),/billing_admin_input_invalid/);
 assert.throws(()=>m.prepareAdminBillingMutation('refund-review',id,{reason:'검토 사유와 민감 값 authKey=secret',reference:'evidence',taxFreeAmount:0},context,storage(),()=>key),/billing_admin_input_invalid/);
 const broken={getItem:()=>null,setItem:()=>{throw new Error('private');},removeItem:()=>{}};
 assert.throws(()=>m.prepareAdminBillingMutation('plan-retire',id,{reason:'신규 판매 중지 명시 사유입니다.'},context,broken,()=>key),/billing_admin_storage_unavailable/);
});
test('same document duplicate submit sends only once and wrong requested receipt never clears',async()=>{
 const m=await client(),store=storage(),a=m.prepareAdminBillingMutation('plan-retire',id,{reason:'신규 판매 중지 명시 사유입니다.'},context,store,()=>key);let calls=0,resolve!:()=>void;
 const wait=new Promise<void>(r=>{resolve=r;});const f=fetcher(async()=>{calls++;await wait;return Response.json({...plan,state:'retired'});});
 const first=m.submitAdminBillingMutation(a,context,store,f);await assert.rejects(m.submitAdminBillingMutation(a,context,store,f),/billing_admin_in_progress/);resolve();await first;assert.equal(calls,1);
});
test('fixed adminBilling structure and new actions retain explicit added labels',async()=>{
 const m=await client(),s=await m.loadBillingAdmin(context.origin,fetcher(()=>Response.json({}))),view=await import('../src/billing-admin.js').catch(()=>null);assert.ok(view,'billing admin component is not implemented');
 const html=renderToStaticMarkup(React.createElement(view.BillingAdminView,{snapshot:s,busy:false,notice:'',onRefresh:()=>{},onAction:()=>{}}));
 for(const text of ['확인할 결제','갱신 실패','환불 요청','최근 구독 이벤트','고객 서비스 대금','가격 승인 관리 (추가)','환불 검토·승인 (추가)'])assert.ok(html.includes(text),text);
 assert.ok(html.indexOf('확인할 결제')<html.indexOf('최근 구독 이벤트'));assert.ok(html.indexOf('최근 구독 이벤트')<html.indexOf('가격 승인 관리 (추가)'));
});

test('late previous session read is rejected and unknown accepted action still exposes exact retry after state advances',async()=>{
 const m=await client();let identities=0;const base=fetcher(()=>Response.json({}));
 const late:typeof fetch=async(url,init)=>{if(url==='/api/auth/get-session'){identities++;return Response.json({user:{id:context.userId},session:{id:identities===1?context.sessionId:'new-session',userId:context.userId}});}return base(url,init);};
 await assert.rejects(m.loadBillingAdmin(context.origin,late),/billing_admin_binding_invalid/);
 const s=await m.loadBillingAdmin(context.origin,base),store=storage(),a=m.prepareAdminBillingMutation('plan-retire',id,{reason:'신규 판매를 중지할 명시 사유입니다.'},context,store,()=>key);
 await assert.rejects(m.submitAdminBillingMutation(a,context,store,fetcher(()=>{throw new Error('response lost');})));
 const view=await import('../src/billing-admin.js'),html=renderToStaticMarkup(React.createElement(view.BillingAdminView,{snapshot:{...s,plans:[{...s.plans[0]!,state:'retired'}]},busy:false,notice:'',attempts:[m.restoreAdminBillingMutation('plan-retire',id,context,store)!],onRefresh:()=>{},onAction:()=>{}}));
 assert.match(html,/<button type="button">동일 요청 재시도<\/button>/);
});

test('an unknown target outside the newest 100 records still restores exact retry and never reads foreign session body',async()=>{
 const m=await client(),store=storage(),body={reason:'원래 판매 중지 요청의 명시적 사유입니다.'},a=m.prepareAdminBillingMutation('plan-retire',id,body,context,store,()=>key);
 await assert.rejects(m.submitAdminBillingMutation(a,context,store,fetcher(()=>{throw new Error('lost');})));
 const other={...context,userId:'other-admin',sessionId:'other-session'},foreign=m.prepareAdminBillingMutation('refund-approve',period,{reason:'다른 계정의 환불 실행 승인 사유입니다.'},other,store,()=>period),foreignKey=m.adminBillingStorageKey(foreign.action,foreign.targetId,other);
 const get=store.getItem;store.getItem=k=>{assert.notEqual(k,foreignKey,'foreign body must not be read');return get(k);};
 assert.equal(typeof m.listAdminBillingMutations,'function','reload recovery must not depend on the latest 100 rows');
 const restored=m.listAdminBillingMutations(context,store);assert.equal(restored.length,1);assert.equal(restored[0]?.requestKey,key);assert.deepEqual(restored[0]?.body,body);
 const s=await m.loadBillingAdmin(context.origin,fetcher(()=>Response.json({}))),view=await import('../src/billing-admin.js');
 const html=renderToStaticMarkup(React.createElement(view.BillingAdminView,{snapshot:{...s,plans:[],refunds:[]},busy:false,notice:'',attempts:restored,onRefresh:()=>{},onAction:()=>{}}));assert.match(html,/<button type="button">동일 요청 재시도<\/button>/);
 await m.submitAdminBillingMutation(restored[0]!,context,store,fetcher(()=>Response.json({...plan,state:'retired'})));assert.equal(m.listAdminBillingMutations(context,store).length,0);
});

test('every billing POST binds the original actor and session and preserves unknown on a late session mismatch',async()=>{
 const m=await client(),store=storage(),a=m.prepareAdminBillingMutation('plan-retire',id,{reason:'현재 판매를 중지하는 명시적 요청입니다.'},context,store,()=>key);
 let calls=0;const f=fetcher(init=>{calls++;const headers=new Headers(init.headers);assert.equal(headers.get('x-admin-billing-actor-id'),context.userId);assert.equal(headers.get('x-admin-billing-session-id'),context.sessionId);return Response.json({error:'billing_admin_binding_invalid'},{status:403});});
 await assert.rejects(m.submitAdminBillingMutation(a,context,store,f),{code:'billing_admin_binding_invalid',status:403});assert.equal(calls,1);assert.equal(m.restoreAdminBillingMutation('plan-retire',id,context,store)?.requestKey,key);
});

test('multiline terms and refund policy preserve explicit legal text but other controls and secret fields remain invalid',async()=>{
 const m=await client(),store=storage(),{id:_id,state:_state,currency:_currency,requestedBy:_requestedBy,approvedBy:_approvedBy,approvedAt:_approvedAt,createdAt:_createdAt,...base}=plan;void [_id,_state,_currency,_requestedBy,_approvedBy,_approvedAt,_createdAt];
 const body={...base,termsText:'첫 번째 구독 이용 조건\n두 번째 조건\r\n\t세 번째 조건',refundText:'환불 검토 요청 조건\n다른 운영자의 실행 승인 조건'};
 assert.deepEqual(m.prepareAdminBillingMutation('plan-request',null,body,context,store,()=>key).body,body);
 const fallback=fetcher(()=>Response.json({})),f:typeof fetch=(url,init)=>url==='/v1/admin/billing/plans'&&init?.method!=='POST'?Promise.resolve(Response.json({product:'agent',plans:[{...plan,...body}]})):fallback(url,init);
 const s=await m.loadBillingAdmin(context.origin,f);assert.equal(s.plans[0]?.termsText,body.termsText);assert.equal(s.plans[0]?.refundText,body.refundText);
 assert.throws(()=>m.prepareAdminBillingMutation('plan-request',null,{...body,name:'name\ninvalid'},context,storage(),()=>key),/billing_admin_input_invalid/);
 assert.throws(()=>m.prepareAdminBillingMutation('plan-request',null,{...body,termsText:'명시 조건에 잘못된 NUL\u0000 값이 있습니다.'},context,storage(),()=>key),/billing_admin_input_invalid/);
});
test('multi-line refund reasons stored by the API still load the admin refund list',async()=>{
 const m=await client(),base=fetcher(()=>{throw new Error('unexpected POST');});
 const multiline={...refund,state:'reviewed',reason:'첫 줄 사유\n둘째 줄 사유\r\n\t셋째 줄',reviewReason:'검토 사유\n추가 설명',reviewedBy:'operator-b',reference:'evidence-1'};
 const s=await m.loadBillingAdmin(context.origin,async(url,init)=>url==='/v1/admin/billing/refunds'?Response.json({product:overview.product,refunds:[multiline]}):base(url,init));
 assert.equal(s.refunds[0]?.reason,multiline.reason);assert.equal(s.refunds[0]?.reviewReason,multiline.reviewReason);
});
