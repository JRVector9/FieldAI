import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { Client, Pool } from 'pg';
import { createAgentApp } from '../src/app.js';
import { unsealBilling, type BillingContext } from '../src/billing-context.js';
import { runBillingAuthorizationOnce } from '../src/billing-authorization-execution.js';
import { runBillingChargeOnce } from '../src/billing-charge-execution.js';
import { periodAt } from '../src/billing-period.js';
import type { BillingCharge, BillingPayment } from '../src/toss-billing.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
const sourceUrl=process.env.AP_DATABASE_URL!, isolatedDatabase=`fieldai_agent_test_${randomUUID().replaceAll('-','')}`;
let admin: Client | undefined, created=false;
const fixtureDatabases=new Set<string>();
before(async () => {
  const url=new URL(sourceUrl); assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
  assert.equal(url.port,'55431'); assert.equal(url.username,'agent_local'); assert.match(url.pathname,/^\/fieldai_agent_test_[a-f0-9]+$/);
  const adminUrl=new URL(url);adminUrl.pathname='/postgres';admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
  await admin.query(`create database "${isolatedDatabase}"`);created=true;
  url.pathname=`/${isolatedDatabase}`;process.env.AP_DATABASE_URL=url.toString();
  const migrated=spawnSync(process.execPath,['tools/run-migrations.mjs','agent'],{cwd:resolve('../..'),env:process.env,stdio:'inherit'});
  assert.equal(migrated.error,undefined);assert.equal(migrated.signal,null);assert.equal(migrated.status,0);
});
after(async () => {
  process.env.AP_DATABASE_URL=sourceUrl;
  try {
    for(const db of fixtureDatabases)await admin!.query(`drop database "${db}" with(force)`);
    if(created)await admin!.query(`drop database "${isolatedDatabase}"`);
  } finally {await admin?.end();}
});

async function fixture(taxFreeAmount: number | null = 0) {
  process.env.AP_PROFILE='mock';
  const database=`fieldai_agent_test_${randomUUID().replaceAll('-','')}`,url=new URL(process.env.AP_DATABASE_URL!);
  await admin!.query(`create database "${database}"`);fixtureDatabases.add(database);url.pathname=`/${database}`;
  const migrated=spawnSync(process.execPath,['tools/run-migrations.mjs','agent'],{cwd:resolve('../..'),env:{...process.env,AP_DATABASE_URL:url.toString()},stdio:'inherit'});
  assert.equal(migrated.status,0);assert.equal(migrated.signal,null);
  const pool=new Pool({connectionString:url.toString()});
  const [owner,operator,approver]=[randomUUID(),randomUUID(),randomUUID()] as const;
  let actor:string=owner, subscriptionId='', mode:'success'|'lost'|'failure'='success', remote:BillingPayment|null=null;
  let waiting:Promise<void>|undefined, releaseIssue:(()=>void)|undefined;
  const calls:BillingCharge[]=[], lookups:string[]=[], approvedAt=new Date().toISOString();
  const billing:BillingContext={credentialKey:randomBytes(32),webOrigin:'http://localhost:3001',provider:{
    mode:'test',mid:'synthetic-mid',clientKey:'test_ck_synthetic',
    ...{keyFingerprint:'a'.repeat(64)},
    async issue(){return 'synthetic-billing-key-NO-RAW-STORAGE';},
    async charge(input){
      calls.push(input);
      const stored=(await pool.query('select * from ap.billing_transactions where order_id=$1',[input.orderId])).rows[0];
      assert.equal(stored.state,'processing');assert.ok(stored.claim_token);assert.ok(stored.started_at);assert.ok(stored.lease_expires_at);
      assert.equal(stored.request_key,input.requestKey);assert.equal(stored.customer_key,input.customerKey);assert.equal(stored.order_name,input.orderName);
      assert.equal(stored.provider_key_fingerprint,'a'.repeat(64));
      const period=(await pool.query('select * from ap.billing_periods where id=$1',[stored.period_id])).rows[0];
      assert.equal(period.starts_at,null);assert.equal(period.ends_at,null);assert.equal(period.state,'pending');
      const payment={paymentKey:'synthetic-payment-key-NO-RAW-STORAGE',orderId:input.orderId,status:'DONE',
        totalAmount:11000,balanceAmount:11000,taxFreeAmount:0,suppliedAmount:10000,vat:1000,approvedAt};
      if(mode!=='failure')remote=payment;
      if(calls.length===1)await waiting;
      if(mode!=='success')throw new Error('SYNTHETIC-TRANSPORT-NO-RAW-ERROR');
      return payment;
    },
    async lookup(order){lookups.push(order);return remote;},
  }};
  const runtime={pool,billing,resolveUserId:async()=>actor,resolveSession:async()=>({id:actor,userId:actor})};
  const app=createAgentApp(async()=>undefined,undefined,undefined,undefined,runtime);
  for(const id of [owner,operator,approver])await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',[id,'Synthetic charge',`${id}@example.invalid`]);
  for(const id of [operator,approver])await pool.query("insert into ap.platform_admin_memberships(user_id,role) values($1,'operator')",[id]);
  const org=(await app.inject({method:'POST',url:'/v1/organizations',payload:{name:'합성 첫 청구 조직'}})).json().id;
  const call=(method:'GET'|'POST',url:string,payload?:object,key=randomUUID())=>app.inject({method,url,payload,
    headers:{'x-organization-id':org,'idempotency-key':key}});
  const price={mode:'test',name:'합성 첫 청구 가격',totalAmount:11000,supplyAmount:10000,vatAmount:1000,
    ...(taxFreeAmount===null?{}:{taxFreeAmount}),includedAiUnits:500,graceDays:3,
    termsVersion:'synthetic-terms',termsText:'합성 자동 갱신 조건 검수용입니다.',refundVersion:'synthetic-refund',refundText:'합성 환불 조건 검수용입니다.',reference:'SYNTHETIC-ONLY'};
  actor=operator;const requested=await call('POST','/v1/admin/billing/plans',price);assert.equal(requested.statusCode,201,requested.body);
  const plan=requested.json().id;
  actor=approver;assert.equal((await call('POST',`/v1/admin/billing/plans/${plan}/approve`,{reason:'별도 합성 운영자 명시 가격 승인'})).statusCode,200);
  actor=owner;
  const consent={planId:plan,termsVersion:price.termsVersion,refundVersion:price.refundVersion,totalAmount:11000,supplyAmount:10000,vatAmount:1000,
    ...(taxFreeAmount===null?{}:{taxFreeAmount}),currency:'KRW',includedAiUnits:500,graceDays:3,autoRenew:true,termsAccepted:true,firstChargePolicy:'after_authorization'};
  const checkout=await call('POST','/v1/subscription/checkout',consent);assert.equal(checkout.statusCode,201,checkout.body);
  const opened=checkout.json();subscriptionId=opened.subscriptionId;
  const confirmation=await call('POST',`/v1/subscription/authorizations/${opened.authorizationId}/confirm`,{
    state:new URL(opened.sdk.successUrl).searchParams.get('state'),customerKey:opened.sdk.customerKey,authKey:'synthetic-auth-key'});
  assert.equal(confirmation.statusCode,202,confirmation.body);assert.equal(await runBillingAuthorizationOnce({pool,billing}),'completed');
  const run=async(context:BillingContext=billing)=>{
    return runBillingChargeOnce({pool,billing:context});
  };
  return {pool,billing,calls,lookups,run,call,owner,operator,org,plan,subscriptionId,approvedAt,price,consent,
    row:async()=>(await pool.query('select t.* from ap.billing_transactions t join ap.billing_periods p on p.id=t.period_id where p.subscription_id=$1',[subscriptionId])).rows[0],
    due:()=>pool.query('update ap.billing_transactions set next_attempt_at=now() where period_id in (select id from ap.billing_periods where subscription_id=$1)',[subscriptionId]),
    setMode(value:typeof mode){mode=value;},setRemote(value:BillingPayment|null){remote=value;},
    as(value:string){actor=value;},hold(){waiting=new Promise<void>(r=>{releaseIssue=r;});},release(){releaseIssue?.();},
    close:async()=>{releaseIssue?.();await app.close();await pool.end();await admin!.query(`drop database "${database}"`);fixtureDatabases.delete(database);},
  };
}

test('AP explicitly approves and consents to tax policy without filling legacy prices',async()=>{
  const f=await fixture();
  try {
    const plans=(await f.call('GET','/v1/subscription/plans')).json().plans;
    assert.equal(plans.find((p:{id:string})=>p.id===f.plan).taxFreeAmount,0);
    assert.equal((await f.pool.query('select tax_free_amount from ap.billing_consents where subscription_id=$1',[f.subscriptionId])).rows[0].tax_free_amount,0);
    await assert.rejects(f.pool.query('update ap.billing_plans set tax_free_amount=100 where id=$1',[f.plan]),{code:'PAB01'});
  } finally {await f.close();}
});

test('AP stores one first charge before the provider and grants only its verified approval period',async()=>{
  const f=await fixture();
  try {
    assert.equal(await f.run(),'paid');assert.equal(f.calls.length,1);assert.equal(f.lookups.length,0);
    const row=await f.row();assert.equal(row.state,'succeeded');assert.doesNotMatch(row.payment_key_ciphertext,/NO-RAW-STORAGE/);
    assert.equal(unsealBilling(row.payment_key_ciphertext,f.billing.credentialKey,`payment:${row.id}`),'synthetic-payment-key-NO-RAW-STORAGE');
    const s=(await f.pool.query('select * from ap.paid_subscriptions where id=$1',[f.subscriptionId])).rows[0];
    const p=(await f.pool.query('select * from ap.billing_periods where subscription_id=$1',[f.subscriptionId])).rows[0];
    assert.equal(s.state,'active');assert.equal(s.anchor_at.toISOString(),f.approvedAt);assert.equal(p.state,'paid');
    assert.equal(p.starts_at.toISOString(),f.approvedAt);assert.equal(p.ends_at.toISOString(),periodAt(new Date(f.approvedAt),0).endsAt.toISOString());
    assert.equal(p.tax_free_amount,0);assert.equal(await f.run(),'empty');
    assert.doesNotMatch((await f.call('GET','/v1/subscription/billing')).body,/NO-RAW-STORAGE|ciphertext|provider_key_fingerprint/);
    await assert.rejects(f.pool.query("update ap.billing_periods set starts_at=starts_at+interval '1 second' where id=$1",[p.id]),{code:'PAB01'});
  } finally {await f.close();}
});

test('AP lost approval response is recovered by the same order without another charge',async()=>{
  const f=await fixture();
  try {
    f.setMode('lost');assert.equal(await f.run(),'unknown');const before=await f.row();assert.equal(before.state,'unknown');
    await f.due();assert.equal(await f.run(),'paid');const after=await f.row();
    assert.equal(f.calls.length,1);assert.deepEqual(f.lookups,[before.order_id]);assert.equal(after.id,before.id);
    assert.equal(after.request_key,before.request_key);assert.equal(after.started_at.getTime(),before.started_at.getTime());
  } finally {await f.close();}
});

// 토스 웹훅(추가)은 서명이 없어 힌트로만 보관한다. 원장은 워커의 lookup 결과로만 바뀐다.
test('AP Toss webhook stores a hint without changing the ledger until the worker lookup',async()=>{
  const f=await fixture();
  try {
    f.setMode('lost');assert.equal(await f.run(),'unknown');const before=await f.row();
    const periodBefore=(await f.pool.query('select state,paid_at from ap.billing_periods where id=$1',[before.period_id])).rows[0];
    const forged={eventType:'PAYMENT_STATUS_CHANGED',createdAt:new Date().toISOString(),
      data:{paymentKey:'forgedPaymentKey123',orderId:before.order_id,status:'DONE',totalAmount:11000}};
    const latest=async()=>(await f.pool.query('select * from ap.billing_webhook_events where order_id=$1 order by received_at desc,id desc limit 1',[before.order_id])).rows[0];
    // 다음 lookup이 60초 이내면(기본 backoff) 앞당기지 않는다. 응답은 결과와 무관하게 같다.
    const early=await f.call('POST','/v1/billing/webhooks/toss',forged);
    assert.equal(early.statusCode,200,early.body);assert.deepEqual(early.json(),{received:true});
    assert.equal((await latest()).outcome,'no_pending_reconciliation');
    assert.equal((await f.row()).next_attempt_at.getTime(),before.next_attempt_at.getTime());
    // 다음 lookup이 60초 넘게 남았으면 지금으로 앞당긴다.
    await f.pool.query("update ap.billing_transactions set next_attempt_at=now()+interval '10 minutes' where id=$1",[before.id]);
    const received=await f.call('POST','/v1/billing/webhooks/toss',forged);
    assert.equal(received.statusCode,200,received.body);assert.deepEqual(received.json(),{received:true});
    const hinted=await f.row();
    assert.equal(hinted.state,'unknown');assert.equal(hinted.payment_key_ciphertext,before.payment_key_ciphertext);
    assert.equal((await f.pool.query('select next_attempt_at<=now() as due from ap.billing_transactions where id=$1',[before.id])).rows[0].due,true);
    assert.deepEqual((await f.pool.query('select state,paid_at from ap.billing_periods where id=$1',[before.period_id])).rows[0],periodBefore);
    assert.equal(f.lookups.length,0);assert.equal(f.calls.length,1);
    // 미인증 원문·평문 paymentKey는 저장하지 않고 파싱한 힌트와 paymentKey의 sha256만 남긴다.
    const stored=await latest();
    assert.equal(stored.event_type,'PAYMENT_STATUS_CHANGED');assert.equal(stored.order_id,before.order_id);
    assert.equal(stored.payment_key_hash,createHash('sha256').update('forgedPaymentKey123').digest('hex'));
    assert.ok(!('payload' in stored)&&!('payment_key' in stored));
    assert.equal(stored.outcome,'reconcile_scheduled');assert.ok(stored.processed_at);
    // 같은 주문의 재전송은 앞당길 미상 건이 없으므로 기록만 남긴다(응답은 동일).
    assert.deepEqual((await f.call('POST','/v1/billing/webhooks/toss',forged)).json(),{received:true});
    assert.equal((await latest()).outcome,'no_pending_reconciliation');
    assert.equal((await f.call('POST','/v1/billing/webhooks/toss',{eventType:'bad type',data:{}})).statusCode,400);
    assert.equal((await f.call('POST','/v1/billing/webhooks/toss',{eventType:'PAYMENT_STATUS_CHANGED',data:{orderId:'x'.repeat(70000)}})).statusCode,413);
    // 확정은 다음 워커 실행의 공급사 lookup으로만 일어난다(재청구 없음).
    assert.equal(await f.run(),'paid');assert.deepEqual(f.lookups,[before.order_id]);assert.equal(f.calls.length,1);
  } finally {await f.close();}
});

test('AP not-found reconciliation reuses the entire stored request and stops after API key rotation',async()=>{
  const f=await fixture();
  try {
    f.setMode('failure');assert.equal(await f.run(),'unknown');const before=await f.row();
    (f.billing.provider as typeof f.billing.provider & {keyFingerprint:string}).keyFingerprint='b'.repeat(64);
    await f.due();assert.equal(await f.run(),'unknown');assert.equal(f.calls.length,1);assert.deepEqual(f.lookups,[before.order_id]);
    (f.billing.provider as typeof f.billing.provider & {keyFingerprint:string}).keyFingerprint='a'.repeat(64);
    f.setMode('success');await f.due();assert.equal(await f.run(),'paid');assert.deepEqual(f.calls[1],f.calls[0]);
    await assert.rejects(f.pool.query('update ap.billing_transactions set request_key=$2 where id=$1',[before.id,randomUUID()]),{code:'PAB04'});
    await assert.rejects(f.pool.query('update ap.billing_transactions set started_at=now() where id=$1',[before.id]),{code:'PAB04'});
  } finally {await f.close();}
});

test('AP reconciles an expired replay window using GET without sending another approval',async()=>{
  const f=await fixture(),originalClock=Date.now;
  try {
    f.setMode('failure');assert.equal(await f.run(),'unknown');const before=await f.row();await f.due();
    Date.now=()=>originalClock()+16*86400000;
    assert.equal(await f.run(),'unknown');assert.equal(f.calls.length,1);assert.equal((await f.row()).error_code,'payment_reconciliation_required');
    f.setRemote({paymentKey:'synthetic-recovered-payment',orderId:before.order_id,status:'DONE',totalAmount:11000,balanceAmount:11000,
      taxFreeAmount:0,suppliedAmount:10000,vat:1000,approvedAt:f.approvedAt});
    await f.due();assert.equal(await f.run(),'paid');assert.equal(f.calls.length,1);
  } finally {Date.now=originalClock;await f.close();}
});

test('AP concurrency and stale lease responses cannot duplicate the paid period',async()=>{
  const f=await fixture();let first:Promise<string>|undefined;
  try {
    f.hold();first=f.run();for(let i=0;i<100&&f.calls.length===0;i++)await new Promise(r=>setTimeout(r,10));assert.equal(f.calls.length,1);
    assert.equal(await f.run(),'empty');
    await f.pool.query("update ap.billing_transactions set lease_expires_at=now()-interval '1 second' where period_id in (select id from ap.billing_periods where subscription_id=$1)",[f.subscriptionId]);
    assert.equal(await f.run(),'paid');f.release();assert.equal(await first,'superseded');assert.equal(f.calls.length,1);
    assert.equal((await f.pool.query("select count(*)::int n from ap.billing_periods where subscription_id=$1 and state='paid'",[f.subscriptionId])).rows[0].n,1);
  } finally {f.release();await first?.catch(()=>undefined);await f.close();}
});

test('AP incomplete legacy tax, absent provider and unstarted stop flags never charge',async()=>{
  const legacy=await fixture(null);
  try {assert.equal(await legacy.run(),'blocked_integration');assert.equal(legacy.calls.length,0);assert.equal((await legacy.row()).error_code,'billing_tax_policy_not_configured');}
  finally {await legacy.close();}
  const f=await fixture();
  try {
    assert.equal(await runBillingChargeOnce({pool:f.pool}),'blocked_integration');assert.equal(f.calls.length,0);
    await f.pool.query("update ap.paid_subscriptions set cancel_requested_at=now(),cancel_requested_by=$2 where id=$1",[f.subscriptionId,f.owner]);
    await f.due();assert.equal(await f.run(),'canceled');assert.equal(f.calls.length,0);
    assert.equal((await f.pool.query('select starts_at from ap.billing_periods where subscription_id=$1',[f.subscriptionId])).rows[0].starts_at,null);
  } finally {await f.close();}
});

test('AP rejects mismatched remote approval economics and premature dates without granting access',async()=>{
  const f=await fixture();
  try {
    f.setMode('failure');assert.equal(await f.run(),'unknown');const row=await f.row();
    f.setRemote({paymentKey:'synthetic-wrong-payment',orderId:row.order_id,status:'DONE',totalAmount:11000,balanceAmount:11000,
      taxFreeAmount:0,suppliedAmount:9900,vat:1100,approvedAt:f.approvedAt});
    await f.due();assert.equal(await f.run(),'unknown');assert.equal(f.calls.length,1);
    const period=(await f.pool.query('select * from ap.billing_periods where subscription_id=$1',[f.subscriptionId])).rows[0];
    assert.equal(period.state,'pending');assert.equal(period.starts_at,null);
    assert.equal((await f.pool.query('select anchor_at from ap.paid_subscriptions where id=$1',[f.subscriptionId])).rows[0].anchor_at,null);
    f.setRemote({paymentKey:'synthetic-date-mismatch',orderId:row.order_id,status:'DONE',totalAmount:11000,balanceAmount:11000,
      taxFreeAmount:0,suppliedAmount:10000,vat:1000,approvedAt:'2000-01-01T00:00:00Z'});
    await f.due();assert.equal(await f.run(),'unknown');assert.equal(f.calls.length,1);
  } finally {await f.close();}
});


test('AP replays pre-tax-snapshot idempotency records without changing their original digest',async()=>{
  const f=await fixture(null),hash=(v:string)=>createHash('sha256').update(v).digest('hex');
  try {
    const auth=(await f.pool.query('select id from ap.billing_authorizations where subscription_id=$1',[f.subscriptionId])).rows[0].id;
    const key=randomUUID(),c=f.consent;
    const digest=hash(JSON.stringify(['checkout',f.org,c.planId,c.termsVersion,c.refundVersion,c.totalAmount,c.supplyAmount,c.vatAmount,c.currency,c.includedAiUnits,c.graceDays,c.autoRenew,c.firstChargePolicy]));
    await f.pool.query('insert into ap.billing_requests(actor_user_id,key_hash,request_hash,result) values($1,$2,$3,$4::jsonb)',[f.owner,hash(key),digest,JSON.stringify({authorizationId:auth})]);
    assert.equal((await f.call('POST','/v1/subscription/checkout',c,key)).statusCode,200);
    f.as(f.operator);const p=f.price,planKey=randomUUID();
    const oldPriceDigest=hash(JSON.stringify(['plan',p.mode,p.name,p.totalAmount,p.supplyAmount,p.vatAmount,p.includedAiUnits,p.graceDays,p.termsVersion,p.termsText,p.refundVersion,p.refundText,p.reference]));
    await f.pool.query('insert into ap.billing_requests(actor_user_id,key_hash,request_hash,result) values($1,$2,$3,$4::jsonb)',[f.operator,hash(planKey),oldPriceDigest,JSON.stringify({id:f.plan})]);
    assert.equal((await f.call('POST','/v1/admin/billing/plans',p,planKey)).statusCode,200);
  } finally {await f.close();}
});


test('AP retains date and overlap constraints after first-period approval',async()=>{
  const f=await fixture();
  try {
    f.setMode('failure');assert.equal(await f.run(),'unknown');const row=await f.row();
    await assert.rejects(f.pool.query("update ap.billing_periods set state='paid' where id=$1",[row.period_id]),{code:'23514'});
    f.setMode('success');await f.due();assert.equal(await f.run(),'paid');
    const clone=`insert into ap.billing_periods(id,subscription_id,billing_period,consent_id,plan_id,starts_at,ends_at,total_amount,supply_amount,vat_amount,tax_free_amount,currency)
      select $2,subscription_id,1,consent_id,plan_id,$3,$4,total_amount,supply_amount,vat_amount,tax_free_amount,currency from ap.billing_periods where id=$1`;
    const boundaries=periodAt(new Date(f.approvedAt),0);
    await assert.rejects(f.pool.query(clone,[row.period_id,randomUUID(),boundaries.startsAt,boundaries.endsAt]),{code:'23P01'});
    const next=periodAt(new Date(f.approvedAt),1);
    await f.pool.query(clone,[row.period_id,randomUUID(),next.startsAt,next.endsAt]);
    assert.equal((await f.pool.query('select count(*)::int n from ap.billing_periods where subscription_id=$1',[f.subscriptionId])).rows[0].n,2);
    await assert.rejects(f.pool.query('update ap.billing_periods set tax_free_amount=1 where id=$1',[row.period_id]),{code:'PAB01'});
  } finally {await f.close();}
});

test('AP a verified aborted remote order ends the first attempt without starting a new charge',async()=>{
  const f=await fixture();
  try {
    f.setMode('failure');assert.equal(await f.run(),'unknown');const row=await f.row();
    f.setRemote({paymentKey:'synthetic-aborted-payment',orderId:row.order_id,status:'ABORTED',totalAmount:11000,balanceAmount:11000,
      taxFreeAmount:0,suppliedAmount:10000,vat:1000,approvedAt:null});
    await f.due();assert.equal(await f.run(),'failed');assert.equal((await f.row()).state,'failed');assert.equal(f.calls.length,1);
    const period=(await f.pool.query('select * from ap.billing_periods where id=$1',[row.period_id])).rows[0];
    assert.equal(period.state,'failed');assert.equal(period.starts_at,null);assert.equal(period.paid_at,null);assert.equal(await f.run(),'empty');
    assert.equal((await f.pool.query('select anchor_at from ap.paid_subscriptions where id=$1',[f.subscriptionId])).rows[0].anchor_at,null);
  } finally {await f.close();}
});
