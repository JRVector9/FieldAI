import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { Client, Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import { sealBilling, type BillingContext } from '../src/billing-context.js';
import { BillingProviderError, type BillingPayment, type BillingRefund } from '../src/toss-billing.js';
import { runBillingChargeOnce } from '../src/billing-charge-execution.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
const source=process.env.FIELD_DATABASE_URL!,databases=new Set<string>();let admin:Client;
before(async()=>{
 const url=new URL(source);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55432');assert.equal(url.username,'field_local');assert.match(url.pathname,/^\/fieldai_field_test_[a-f0-9]+$/);
 url.pathname='/postgres';admin=new Client({connectionString:url.toString()});await admin.connect();
});
after(async()=>{try{for(const name of databases)await admin.query(`drop database "${name}" with(force)`);}finally{await admin.end();}});
async function fixture(paid=true){
 process.env.FIELD_PROFILE='mock';const name='fieldai_field_test_'+randomUUID().replaceAll('-',''),url=new URL(source);
 await admin.query(`create database "${name}"`);databases.add(name);url.pathname='/'+name;
 const migrated=spawnSync(process.execPath,['tools/run-migrations.mjs','field'],{cwd:resolve('../..'),env:{...process.env,FIELD_DATABASE_URL:url.toString()},stdio:'pipe'});
 assert.equal(migrated.error,undefined);assert.equal(migrated.signal,null);assert.equal(migrated.status,0,migrated.stderr?.toString());
 const pool=new Pool({connectionString:url.toString()}),[owner,operator,approver,outsider]=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];let actor:string=owner,sessionValid=true;
 let remote:BillingPayment={paymentKey:'synthetic-payment-NO-RAW',orderId:'field_'+randomUUID().replaceAll('-',''),status:'DONE',totalAmount:11000,balanceAmount:11000,taxFreeAmount:0,suppliedAmount:10000,vat:1000,approvedAt:new Date().toISOString(),cancels:[],isPartialCancelable:true};
 let mode:'success'|'lost'|'timeout'|'forged'|'decline'='success';const posts:BillingRefund[]=[],lookups:string[]=[];
 let hold:Promise<void>|undefined,release:(()=>void)|undefined;
 const billing:BillingContext={credentialKey:randomBytes(32),webOrigin:'http://localhost:3002',provider:{mode:'test',mid:'synthetic-mid',clientKey:'test_ck_fixture',keyFingerprint:'a'.repeat(64),
 async issue(){return 'synthetic-billing';},async charge(){throw new BillingProviderError('REJECT_CARD_PAYMENT','declined');},
 async lookup(order){lookups.push(order);await hold;return mode==='decline'?null:structuredClone(remote);},
 async refund(input){posts.push(input);const stored=(await pool.query('select * from field.billing_refunds where request_key=$1',[input.requestKey])).rows[0];
 assert.equal(stored.state,'processing');assert.ok(stored.dispatched_at);assert.ok(stored.claim_token);assert.doesNotMatch(stored.payment_key_ciphertext,/NO-RAW/);
 if(mode==='timeout')throw new Error('SECRET-TRANSPORT');
 const balance=remote.balanceAmount-input.amount;
 remote={...remote,status:balance===0?'CANCELED':'PARTIAL_CANCELED',balanceAmount:balance,suppliedAmount:balance-Math.round(balance/11),vat:Math.round(balance/11),
 cancels:[...remote.cancels!,{transactionKey:'cancel_'+randomUUID(),cancelAmount:input.amount,taxFreeAmount:input.taxFreeAmount,cancelReason:mode==='forged'?'other-refund':input.reason,canceledAt:new Date().toISOString(),cancelStatus:'DONE',refundableAmount:balance}]};
 if(mode==='lost')throw new Error('SECRET-TRANSPORT');return structuredClone(remote);
 }}};
 const runtime={pool,billing,resolveUserId:async()=>actor,resolveSession:async()=>sessionValid?{id:actor,userId:actor}:null};
 const app=createFieldApp(async()=>undefined,undefined,undefined,runtime);
 for(const id of [owner,operator,approver,outsider])await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',[id,'Synthetic refund',id+'@example.invalid']);
 for(const id of [operator,approver])await pool.query("insert into field.platform_admin_memberships(user_id,role) values($1,'operator')",[id]);
 const org=(await app.inject({method:'POST',url:'/v1/organizations',payload:{name:'Synthetic refund organization'}})).json().id;
 const [plan,subscription,consent,period,transaction]=[randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID()];
 await pool.query(`insert into field.billing_plans(id,mode,name,total_amount,supply_amount,vat_amount,tax_free_amount,included_ai_units,grace_days,terms_version,terms_text,refund_version,refund_text,reference,requested_by,approved_by,approved_at)
 values($1,'test','Synthetic',11000,10000,1000,0,500,3,'terms','Synthetic terms','refund-v1','Synthetic refund policy','SYNTHETIC',$2,$3,now())`,[plan,operator,approver]);
 await pool.query(`insert into field.paid_subscriptions(id,organization_id,plan_id,customer_key,state,created_by,anchor_at) values($1,$2,$3,$4,$5,$6,$7)`,[subscription,org,plan,randomUUID(),paid?'active':'awaiting_authorization',owner,paid?remote.approvedAt:null]);
 await pool.query(`insert into field.billing_consents(id,subscription_id,plan_id,accepted_by,terms_version,refund_version,total_amount,supply_amount,vat_amount,tax_free_amount,currency,included_ai_units,grace_days,auto_renew)
 values($1,$2,$3,$4,'terms','refund-v1',11000,10000,1000,0,'KRW',500,3,true)`,[consent,subscription,plan,owner]);
 await pool.query(`insert into field.billing_periods(id,subscription_id,billing_period,consent_id,plan_id,starts_at,ends_at,total_amount,supply_amount,vat_amount,tax_free_amount,currency,state,paid_at)
 values($1,$2,0,$3,$4,$5,$6,11000,10000,1000,0,'KRW',$7,$5)`,[period,subscription,consent,plan,paid?remote.approvedAt:null,paid?new Date(Date.now()+30*86400000):null,paid?'paid':'pending']);
 await pool.query(`insert into field.billing_transactions(id,period_id,order_id,request_key,state,mode,provider_mid,provider_key_fingerprint,payment_key_ciphertext,started_at,dispatched_at,customer_key,order_name,billing_key_ciphertext)
 values($1,$2,$3,$4,$5,'test','synthetic-mid','${'a'.repeat(64)}',$6,$7,$7,$8,'Synthetic',null)`,[transaction,period,remote.orderId,randomUUID(),paid?'succeeded':'pending',paid?sealBilling(remote.paymentKey,billing.credentialKey,`payment:${transaction}`):null,paid?remote.approvedAt:null,randomUUID()]);
 if(!paid)await pool.query('insert into field.billing_credentials(subscription_id,billing_key_ciphertext) values($1,$2)',[subscription,sealBilling('synthetic-billing',billing.credentialKey,`credential:${subscription}`)]);
 const call=(method:'GET'|'POST',path:string,body?:object,key=randomUUID(),organizationId=org)=>app.inject({method,url:path,payload:body,headers:{'x-organization-id':organizationId,'idempotency-key':key,origin:'http://localhost:3002'}});
 const request=async(amount=5500)=>{actor=owner;const r=await call('POST','/v1/subscription/refunds',{periodId:period,amount,reason:'Synthetic customer refund request'});assert.equal(r.statusCode,201,r.body);return r.json().id as string;};
 const approve=async(id:string)=>{actor=operator;let r=await call('POST',`/v1/admin/billing/refunds/${id}/review`,{reason:'Synthetic explicit review reason',reference:'SYNTHETIC',taxFreeAmount:0});assert.equal(r.statusCode,200,r.body);actor=approver;r=await call('POST',`/v1/admin/billing/refunds/${id}/approve`,{reason:'Synthetic different operator approval'});assert.equal(r.statusCode,200,r.body);};
 const run=async(context:BillingContext|undefined|null=billing)=>{const {runBillingRefundOnce}=await import('../src/billing-refund-execution.js');return runBillingRefundOnce({pool,billing:context??undefined});};
 return {pool,billing,org,owner,operator,approver,outsider,period,transaction,subscription,posts,lookups,call,request,approve,run,raw:app.inject.bind(app),session:(value:boolean)=>{sessionValid=value;},as:(value:string)=>{actor=value;},mode:(value:typeof mode)=>{mode=value;},remote:(value:BillingPayment)=>{remote=value;},getRemote:()=>remote,
 row:async(id:string)=>(await pool.query('select * from field.billing_refunds where id=$1',[id])).rows[0],due:()=>pool.query("update field.billing_refunds set next_attempt_at=clock_timestamp()-interval '1 second' where state not in ('succeeded','rejected')"),hold:()=>{hold=new Promise(r=>{release=r;});},release:()=>{release?.();hold=undefined;},
 close:async()=>{release?.();await app.close();await pool.end();await admin.query(`drop database "${name}"`);databases.delete(name);}};
}

test('owner refund request is scoped, idempotent and requires separate review and approval',async()=>{
 const f=await fixture();try{
  const key=randomUUID(),body={periodId:f.period,amount:5500,reason:'Synthetic refund request reason'};
  const r=await f.call('POST','/v1/subscription/refunds',body,key);assert.equal(r.statusCode,201,r.body);const id=r.json().id;
  assert.equal((await f.call('POST','/v1/subscription/refunds',body,key)).json().id,id);
  assert.equal((await f.call('POST','/v1/subscription/refunds',{...body,amount:6000},key)).statusCode,409);
  assert.equal(await f.run(),'empty');f.as(f.operator);
  assert.equal((await f.call('POST',`/v1/admin/billing/refunds/${id}/approve`,{reason:'Premature approval reason'})).statusCode,409);
  assert.equal((await f.call('POST',`/v1/admin/billing/refunds/${id}/review`,{reason:'Synthetic review reason',reference:'REF',taxFreeAmount:0})).statusCode,200);
  assert.equal((await f.call('POST',`/v1/admin/billing/refunds/${id}/approve`,{reason:'Self approval must be denied'})).statusCode,403);
  f.as(f.outsider);assert.equal((await f.call('GET','/v1/subscription/refunds')).statusCode,404);
  assert.equal((await f.call('POST','/v1/subscription/refunds',body)).statusCode,404);
 }finally{await f.close();}
});

test('partial refunds append verified proof once and full refund does not cancel the subscription',async()=>{
 const f=await fixture();try{for(const amount of [5500,5500]){const id=await f.request(amount);await f.approve(id);assert.equal(await f.run(),'succeeded');assert.equal((await f.row(id)).state,'succeeded');assert.equal(await f.run(),'empty');}
 const p=(await f.pool.query('select * from field.billing_periods where id=$1',[f.period])).rows[0];assert.equal(p.refunded_amount,11000);assert.equal(p.state,'refunded');
 assert.equal((await f.pool.query('select state from field.paid_subscriptions where id=$1',[f.subscription])).rows[0].state,'active');
 assert.equal(f.posts.length,2);assert.ok(f.posts.every(p=>p.paymentKey==='synthetic-payment-NO-RAW'));
 f.as(f.owner);assert.doesNotMatch((await f.call('GET','/v1/subscription/refunds')).body,/NO-RAW|ciphertext|fingerprint|transactionKey|synthetic-mid/);
 assert.equal((await f.call('POST','/v1/subscription/refunds',{periodId:f.period,amount:1,reason:'Another refund beyond paid value'})).statusCode,409);
 }finally{await f.close();}
});

test('lost refund response reconciles exact cancellation by GET without another POST',async()=>{
 const f=await fixture();try{const id=await f.request();await f.approve(id);f.mode('lost');assert.equal(await f.run(),'unknown');const before=await f.row(id);await f.due();assert.equal(await f.run(),'succeeded');
 assert.equal(f.posts.length,1);assert.equal((await f.row(id)).request_key,before.request_key);assert.equal((await f.pool.query('select refunded_amount from field.billing_periods where id=$1',[f.period])).rows[0].refunded_amount,5500);
 }finally{await f.close();}
});

test('unknown and uncorrelated cancellation never submit another refund or infer ownership from amount',async()=>{
 const f=await fixture();try{const id=await f.request();await f.approve(id);f.mode('forged');assert.equal(await f.run(),'unknown');await f.due();assert.equal(await f.run(),'unknown');assert.equal(f.posts.length,1);
 assert.equal((await f.pool.query('select refunded_amount from field.billing_periods where id=$1',[f.period])).rows[0].refunded_amount,0);
 f.as(f.owner);assert.equal((await f.call('POST','/v1/subscription/refunds',{periodId:f.period,amount:5500,reason:'Duplicate unconfirmed refund'})).statusCode,409);
 }finally{await f.close();}
});

test('provider absence and original key rotation block before any refund dispatch',async()=>{
 const f=await fixture();try{const id=await f.request();await f.approve(id);assert.equal(await f.run(null),'blocked_integration');assert.equal(f.posts.length,0);f.billing.provider.keyFingerprint='b'.repeat(64);await f.due();assert.equal(await f.run(),'blocked_integration');assert.equal(f.posts.length,0);assert.equal((await f.row(id)).dispatched_at,null);
 }finally{await f.close();}
});

test('current operator authority is checked after lookup, not only at route approval',async()=>{
 const f=await fixture();try{const id=await f.request();await f.approve(id);f.hold();const running=f.run();while(f.lookups.length===0)await new Promise(r=>setTimeout(r,5));await f.pool.query('delete from field.platform_admin_memberships where user_id=$1',[f.approver]);f.release();assert.equal(await running,'blocked_integration');assert.equal(f.posts.length,0);
 }finally{await f.close();}
});

test('untracked external cancellation prevents dispatch and all financial evidence remains retained',async()=>{
 const f=await fixture();try{const id=await f.request();await f.approve(id);f.remote({...f.getRemote(),balanceAmount:5500,status:'PARTIAL_CANCELED',cancels:[{transactionKey:'outside',cancelAmount:5500,taxFreeAmount:0,cancelReason:'external',canceledAt:new Date().toISOString(),cancelStatus:'DONE',refundableAmount:5500}]});assert.equal(await f.run(),'blocked_integration');assert.equal(f.posts.length,0);
 await assert.rejects(f.pool.query('delete from field.billing_refunds where id=$1',[id]));await assert.rejects(f.pool.query('update field.billing_refunds set amount=1 where id=$1',[id]));await assert.rejects(f.pool.query('delete from field.billing_transactions where id=$1',[f.transaction]));
 }finally{await f.close();}
});

test('initial documented decline becomes failed while later replay decline preserves unknown',async()=>{
 const f=await fixture(false);try{f.mode('decline');assert.equal(await runBillingChargeOnce({pool:f.pool,billing:f.billing}),'failed');
 assert.equal((await f.pool.query('select state from field.billing_transactions where id=$1',[f.transaction])).rows[0].state,'failed');
 }finally{await f.close();}
 const g=await fixture(false);try{g.mode('decline');g.billing.provider.charge=async()=>{throw new Error('synthetic timeout');};assert.equal(await runBillingChargeOnce({pool:g.pool,billing:g.billing}),'unknown');
 g.billing.provider.charge=async()=>{throw new BillingProviderError('REJECT_CARD_PAYMENT','declined');};await g.pool.query("update field.billing_transactions set next_attempt_at=clock_timestamp()-interval '1 second'");assert.equal(await runBillingChargeOnce({pool:g.pool,billing:g.billing}),'unknown');
 }finally{await g.close();}
});


test('timeout with no cancellation proof stays unknown and blocks cancellation or another refund',async()=>{
 const f=await fixture();try{const id=await f.request();await f.approve(id);f.mode('timeout');assert.equal(await f.run(),'unknown');await f.due();assert.equal(await f.run(),'unknown');assert.equal(f.posts.length,1);
 f.as(f.operator);assert.equal((await f.call('POST',`/v1/admin/billing/refunds/${id}/reject`,{reason:'Must not discard unknown transaction'})).statusCode,409);
 assert.equal((await f.pool.query('select refunded_amount from field.billing_periods where id=$1',[f.period])).rows[0].refunded_amount,0);
 }finally{await f.close();}
});

test('invalid amount/tax, current owner membership and unsafe Origin fail before dispatch',async()=>{
 const f=await fixture();try{
 for(const amount of [0,-1,1.2,1000000001])assert.equal((await f.call('POST','/v1/subscription/refunds',{periodId:f.period,amount,reason:'Synthetic invalid amount request'})).statusCode,400);
 assert.equal((await f.call('POST','/v1/subscription/refunds',{periodId:f.period,amount:11001,reason:'Synthetic excessive amount request'})).statusCode,409);
 const denied=await f.raw({method:'POST',url:'/v1/subscription/refunds',headers:{'x-organization-id':f.org,'idempotency-key':randomUUID(),origin:'https://other.invalid'},payload:{periodId:f.period,amount:5500,reason:'Synthetic cross origin request'}});assert.equal(denied.statusCode,403);
 f.session(false);assert.equal((await f.call('POST','/v1/subscription/refunds',{periodId:f.period,amount:5500,reason:'Synthetic session required request'})).statusCode,401);f.session(true);
 const id=await f.request();f.as(f.operator);assert.equal((await f.call('POST',`/v1/admin/billing/refunds/${id}/review`,{reason:'Synthetic invalid tax decision',reference:'REF',taxFreeAmount:1})).statusCode,409);
 await f.pool.query("update field.memberships set role='viewer' where organization_id=$1 and user_id=$2",[f.org,f.owner]);f.as(f.owner);
 assert.equal((await f.call('POST','/v1/subscription/refunds',{periodId:f.period,amount:5500,reason:'Synthetic demoted owner request'})).statusCode,403);assert.equal(f.posts.length,0);
 }finally{await f.close();}
});

test('operator proxy requester cannot approve after a different operator reviews',async()=>{
 const f=await fixture();try{f.as(f.operator);const r=await f.call('POST','/v1/admin/billing/refunds',{organizationId:f.org,periodId:f.period,amount:5500,reason:'Synthetic operator proxy request',reference:'CUSTOMER-REQUEST'});assert.equal(r.statusCode,201,r.body);const id=r.json().id;
 f.as(f.approver);assert.equal((await f.call('POST',`/v1/admin/billing/refunds/${id}/review`,{reason:'Synthetic separate operator review',reference:'REF',taxFreeAmount:0})).statusCode,200);
 f.as(f.operator);assert.equal((await f.call('POST',`/v1/admin/billing/refunds/${id}/approve`,{reason:'Original proxy cannot approve'})).statusCode,403);
 const result=await f.call('POST',`/v1/admin/billing/refunds/${id}/reject`,{reason:'Synthetic safe unstarted rejection'});assert.equal(result.statusCode,200);assert.equal((await f.row(id)).state,'rejected');assert.equal(await f.run(),'empty');
 }finally{await f.close();}
});
