import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { Client, Pool, type PoolClient } from 'pg';
import { createFieldApp } from '../src/app.js';
import { type BillingContext } from '../src/billing-context.js';
import { runBillingAuthorizationOnce } from '../src/billing-authorization-execution.js';
import { runBillingChargeOnce } from '../src/billing-charge-execution.js';
import { periodAt } from '../src/billing-period.js';
import type { BillingCharge, BillingPayment } from '../src/toss-billing.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
const sourceUrl=process.env.FIELD_DATABASE_URL!, isolatedDatabase=`fieldai_field_test_${randomUUID().replaceAll('-','')}`;
let admin: Client | undefined, created=false;
const fixtureDatabases=new Set<string>();
before(async () => {
  const url=new URL(sourceUrl); assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
  assert.equal(url.port,'55432'); assert.equal(url.username,'field_local'); assert.match(url.pathname,/^\/fieldai_field_test_[a-f0-9]+$/);
  const adminUrl=new URL(url);adminUrl.pathname='/postgres';admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
  await admin.query(`create database "${isolatedDatabase}"`);created=true;
  url.pathname=`/${isolatedDatabase}`;process.env.FIELD_DATABASE_URL=url.toString();
  const migrated=spawnSync(process.execPath,['tools/run-migrations.mjs','field'],{cwd:resolve('../..'),env:process.env,stdio:'inherit'});
  assert.equal(migrated.error,undefined);assert.equal(migrated.signal,null);assert.equal(migrated.status,0);
});
after(async () => {
  process.env.FIELD_DATABASE_URL=sourceUrl;
  try {
    for(const db of fixtureDatabases)await admin!.query(`drop database "${db}" with(force)`);
    if(created)await admin!.query(`drop database "${isolatedDatabase}"`);
  } finally {await admin?.end();}
});

async function fixture(taxFreeAmount: number | null = 0,initialPaid=true,start=new Date()) {
  process.env.FIELD_PROFILE='mock';
  const database=`fieldai_field_test_${randomUUID().replaceAll('-','')}`,url=new URL(process.env.FIELD_DATABASE_URL!);
  await admin!.query(`create database "${database}"`);fixtureDatabases.add(database);url.pathname=`/${database}`;
  const migrated=spawnSync(process.execPath,['tools/run-migrations.mjs','field'],{cwd:resolve('../..'),env:{...process.env,FIELD_DATABASE_URL:url.toString()},stdio:'inherit'});
  assert.equal(migrated.status,0);assert.equal(migrated.signal,null);
  const pool=new Pool({connectionString:url.toString()});
  const [owner,operator,approver]=[randomUUID(),randomUUID(),randomUUID()] as const;
  let actor:string=owner, subscriptionId='', mode:'success'|'lost'|'failure'='success', remote:BillingPayment|null=null;
  let waiting:Promise<void>|undefined, releaseIssue:(()=>void)|undefined,lookupWait:Promise<void>|undefined,releaseLookup:(()=>void)|undefined;
  const calls:BillingCharge[]=[], lookups:string[]=[]; let now=start; let sessionAvailable=true; const approvedAt=now.toISOString();
  const billing:BillingContext={credentialKey:randomBytes(32),webOrigin:'http://localhost:3002',provider:{
    mode:'test',mid:'synthetic-mid',clientKey:'test_ck_synthetic',
    ...{keyFingerprint:'a'.repeat(64)},
    async issue(){return 'synthetic-billing-key-NO-RAW-STORAGE';},
    async charge(input){
      calls.push(input);
      const stored=(await pool.query('select * from field.billing_transactions where order_id=$1',[input.orderId])).rows[0];
      assert.equal(stored.state,'processing');assert.ok(stored.claim_token);assert.ok(stored.started_at);assert.ok(stored.lease_expires_at);
      assert.equal(stored.request_key,input.requestKey);assert.equal(stored.customer_key,input.customerKey);assert.equal(stored.order_name,input.orderName);
      assert.equal(stored.provider_key_fingerprint,'a'.repeat(64));
      const period=(await pool.query('select * from field.billing_periods where id=$1',[stored.period_id])).rows[0];
      assert.equal(period.state,'pending'); if(period.billing_period===0)assert.equal(period.starts_at,null); else {assert.ok(period.starts_at);assert.ok(period.ends_at);}
      const payment={paymentKey:'synthetic-payment-key-NO-RAW-STORAGE',orderId:input.orderId,status:'DONE',
        totalAmount:11000,balanceAmount:11000,taxFreeAmount:0,suppliedAmount:10000,vat:1000,approvedAt:now.toISOString()};
      remote=mode==='failure'?{...payment,status:'ABORTED',approvedAt:null}:payment;
      await waiting;
      if(mode!=='success')throw new Error('SYNTHETIC-TRANSPORT-NO-RAW-ERROR');
      return payment;
    },
    async lookup(order){lookups.push(order);await lookupWait;return remote;},
  }};
  const runtime={pool,billing,resolveUserId:async()=>actor,resolveSession:async()=>sessionAvailable?({id:actor,userId:actor}):null};
  const app=createFieldApp(async()=>undefined,undefined,undefined,runtime);
  for(const id of [owner,operator,approver])await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',[id,'Synthetic charge',`${id}@example.invalid`]);
  for(const id of [operator,approver])await pool.query("insert into field.platform_admin_memberships(user_id,role) values($1,'operator')",[id]);
  const org=(await app.inject({method:'POST',url:'/v1/organizations',payload:{name:'합성 첫 청구 조직'}})).json().id;
  const call=(method:'GET'|'POST',url:string,payload?:object,key=randomUUID(),extra:Record<string,string>={})=>app.inject({method,url,payload,
    headers:{'x-organization-id':org,'idempotency-key':key,...extra}});
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
    return runBillingChargeOnce({pool,billing:context,now});
  };
  if(initialPaid)assert.equal(await run(),'paid');
  return {pool,billing,calls,lookups,run,call,owner,operator,org,plan,subscriptionId,approvedAt,price,consent,
    row:async()=>(await pool.query('select t.* from field.billing_transactions t join field.billing_periods p on p.id=t.period_id where p.subscription_id=$1 order by p.billing_period desc limit 1',[subscriptionId])).rows[0],
    due:()=>pool.query('update field.billing_transactions set next_attempt_at=now() where period_id in (select id from field.billing_periods where subscription_id=$1)',[subscriptionId]),
    session(value:boolean){sessionAvailable=value;},setNow(value:Date){now=value;},now:()=>now, setMode(value:typeof mode){mode=value;},setRemote(value:BillingPayment|null){remote=value;},
    holdLookup(){lookupWait=new Promise<void>(r=>{releaseLookup=r;});},releaseLookup(){releaseLookup?.();},as(value:string){actor=value;},hold(){waiting=new Promise<void>(r=>{releaseIssue=r;});},release(){releaseIssue?.();},
    close:async()=>{releaseIssue?.();releaseLookup?.();await app.close();await pool.end();await admin!.query(`drop database "${database}"`);fixtureDatabases.delete(database);},
  };
}


async function access(f:Awaited<ReturnType<typeof fixture>>,at=f.now()) {
  const { subscriptionAccess }=await import('../src/subscription-access.js');
  return subscriptionAccess(f.pool,f.org,at);
}
const later=(date:Date,ms=1000)=>new Date(date.getTime()+ms);

test('Field renews only one consented month and preserves its original anchor',async()=>{
  const f=await fixture();try {
    const anchor=new Date(f.approvedAt),next=periodAt(anchor,1);
    assert.equal(await f.run(),'empty');assert.equal(f.calls.length,1);
    f.setNow(later(next.startsAt));assert.equal(await f.run(),'paid');
    const periods=(await f.pool.query('select * from field.billing_periods order by billing_period')).rows;
    assert.equal(periods.length,2);assert.equal(periods[1].starts_at.getTime(),next.startsAt.getTime());
    assert.equal(periods[1].ends_at.getTime(),next.endsAt.getTime());assert.equal(periods[1].paid_at.getTime(),f.now().getTime());
    assert.equal((await f.pool.query('select anchor_at from field.paid_subscriptions')).rows[0].anchor_at.getTime(),anchor.getTime());
    assert.equal(await f.run(),'empty');assert.equal(f.calls.length,2);
    f.setNow(later(periodAt(anchor,2).startsAt));assert.equal(await f.run(),'paid');
    assert.equal((await f.pool.query('select starts_at from field.billing_periods where billing_period=2')).rows[0].starts_at.getTime(),periodAt(anchor,2).startsAt.getTime());
  }finally{await f.close();}
});

test('Field recovers a lost renewal response using one persisted order without shifting the month',async()=>{
  const f=await fixture();try {
    const period=periodAt(new Date(f.approvedAt),1);f.setNow(later(period.startsAt));f.setMode('lost');
    assert.equal(await f.run(),'unknown');const before=await f.row();await f.due();
    f.setNow(later(f.now(),3600000));assert.equal(await f.run(),'paid');const after=await f.row();
    assert.equal(after.order_id,before.order_id);assert.equal(after.request_key,before.request_key);assert.equal(f.calls.length,2);
    assert.deepEqual(f.lookups,[before.order_id]);
    assert.equal((await f.pool.query('select starts_at from field.billing_periods where id=$1',[after.period_id])).rows[0].starts_at.getTime(),period.startsAt.getTime());
  }finally{await f.close();}
});

test('Field owner cancellation is session and organization bound, idempotent, and keeps paid time',async()=>{
  const f=await fixture();try {
    const editor=randomUUID();await f.pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',[editor,'Synthetic editor',`${editor}@example.invalid`]);
    await f.pool.query("insert into field.memberships(organization_id,user_id,role) values($1,$2,'editor')",[f.org,editor]);
    f.as(editor);assert.equal((await f.call('POST','/v1/subscription/billing/cancel',{subscriptionId:f.subscriptionId})).statusCode,403);
    f.as(f.owner);
    assert.equal((await f.call('POST','/v1/subscription/billing/cancel',{subscriptionId:randomUUID()})).statusCode,404);
    const key=randomUUID(),body={subscriptionId:f.subscriptionId};
    assert.equal((await f.call('POST','/v1/subscription/billing/cancel',body,key)).statusCode,200);
    assert.equal((await f.call('POST','/v1/subscription/billing/cancel',body,key)).statusCode,200);
    assert.equal((await f.call('POST','/v1/subscription/billing/cancel',{subscriptionId:randomUUID()},key)).statusCode,409);
    assert.equal((await f.pool.query("select count(*)::int n from field.billing_events where event_type='subscription_cancel_requested'")).rows[0].n,1);
    assert.equal((await access(f)).mode,'paid');
    const current=(await f.call('GET','/v1/subscription')).json();assert.equal(current.access.mode,'paid');
    f.setNow(later(periodAt(new Date(f.approvedAt),0).endsAt));assert.equal(await f.run(),'empty');assert.equal(f.calls.length,1);
    assert.equal((await access(f)).mode,'cleanup_only');
    assert.equal((await f.pool.query('select count(*)::int n from field.billing_periods')).rows[0].n,1);
  }finally{await f.close();}
});

test('Field canceled unknown renewal remains reconcilable and retains late approved paid time',async()=>{
  const f=await fixture();try {
    f.setNow(later(periodAt(new Date(f.approvedAt),1).startsAt));f.setMode('lost');assert.equal(await f.run(),'unknown');
    const original=await f.row();assert.equal((await f.call('POST','/v1/subscription/billing/cancel',{subscriptionId:f.subscriptionId})).statusCode,200);
    assert.equal((await f.row()).state,'unknown');await f.due();assert.equal(await f.run(),'paid');
    assert.equal(f.calls.length,2);assert.equal((await f.row()).order_id,original.order_id);assert.equal((await access(f)).mode,'paid');
    f.setNow(later(periodAt(new Date(f.approvedAt),1).endsAt));assert.equal(await f.run(),'empty');assert.equal((await access(f)).mode,'cleanup_only');
  }finally{await f.close();}
});

test('Field unstarted renewal cancels without provider config and cannot start again',async()=>{
  const f=await fixture();try {
    f.setNow(later(periodAt(new Date(f.approvedAt),1).startsAt));
    assert.equal(await runBillingChargeOnce({pool:f.pool,now:f.now()}),'blocked_integration');const before=await f.row();assert.equal(before.started_at,null);
    assert.equal((await f.call('POST','/v1/subscription/billing/cancel',{subscriptionId:f.subscriptionId})).statusCode,200);
    assert.equal((await f.row()).state,'canceled');assert.equal(await f.run(),'empty');assert.equal(f.calls.length,1);
  }finally{await f.close();}
});

test('Field renewal failure grace is fixed to scheduled time and is never extended by later worker runs',async()=>{
  const f=await fixture();try {
    const next=periodAt(new Date(f.approvedAt),1);f.setNow(later(next.startsAt));f.setMode('failure');
    assert.equal(await f.run(),'unknown');await f.due();assert.equal(await f.run(),'failed');
    const grace=(await f.pool.query('select grace_ends_at from field.billing_periods where billing_period=1')).rows[0].grace_ends_at;
    assert.equal(grace.getTime(),next.startsAt.getTime()+3*86400000);assert.equal((await access(f)).mode,'grace');
    f.setNow(grace);assert.equal((await access(f)).mode,'cleanup_only');assert.equal(await f.run(),'empty');assert.equal(f.calls.length,2);
    assert.equal((await f.pool.query('select grace_ends_at from field.billing_periods where billing_period=1')).rows[0].grace_ends_at.getTime(),grace.getTime());
  }finally{await f.close();}
});

test('Field a missed whole renewal period never silently batches overdue charges',async()=>{
  const f=await fixture();try {
    f.setNow(later(periodAt(new Date(f.approvedAt),1).endsAt));assert.equal(await f.run(),'empty');assert.equal(f.calls.length,1);
    assert.equal((await access(f)).mode,'cleanup_only');
    assert.equal((await f.pool.query('select count(*)::int n from field.billing_periods')).rows[0].n,1);
    assert.equal((await f.pool.query('select state from field.paid_subscriptions')).rows[0].state,'past_due');
  }finally{await f.close();}
});

test('Field active paid time overrides expired trial and its original anchor cannot be changed',async()=>{
  const f=await fixture();try {
    await f.pool.query("insert into field.trial_subscriptions(id,organization_id,consent_version,started_by,started_at,ends_at) values($1,$2,'mock-trial-v1',$3,now()-interval '15 days',now()-interval '1 day')",[randomUUID(),f.org,f.owner]);
    const view=(await f.call('GET','/v1/subscription')).json();assert.equal(view.access.mode,'paid');
    await assert.rejects(f.pool.query("update field.paid_subscriptions set anchor_at=anchor_at+interval '1 day' where id=$1",[f.subscriptionId]),{code:'PFB05'});
    assert.equal((await access(f)).mode,'paid');
  }finally{await f.close();}
});


test('Field monthly renewals clamp January 31 then return to March 31 without adopting February',async()=>{
  const f=await fixture(0,true,new Date('2027-01-31T01:30:00.000Z'));try {
    f.setNow(new Date('2027-02-28T01:30:01.000Z'));assert.equal(await f.run(),'paid');
    f.setNow(new Date('2027-03-31T01:30:01.000Z'));assert.equal(await f.run(),'paid');
    const periods=(await f.pool.query('select * from field.billing_periods order by billing_period')).rows;
    assert.equal(periods[1].starts_at.toISOString(),'2027-02-28T01:30:00.000Z');
    assert.equal(periods[2].starts_at.toISOString(),'2027-03-31T01:30:00.000Z');
    await assert.rejects(f.pool.query("update field.billing_periods set grace_ends_at=grace_ends_at+interval '1 day' where id=$1",[periods[1].id]),{code:'PFB05'});
  }finally{await f.close();}
});

test('Field simultaneous renewal workers create and charge just one next period',async()=>{
  const f=await fixture();try {
    f.setNow(later(periodAt(new Date(f.approvedAt),1).startsAt));f.hold();const first=f.run();
    await new Promise(r=>setTimeout(r,100));const second=await f.run();assert.equal(second,'empty');f.release();assert.equal(await first,'paid');
    assert.equal(f.calls.length,2);assert.equal((await f.pool.query('select count(*)::int n from field.billing_periods')).rows[0].n,2);
  }finally{await f.close();}
});

test('Field cancellation after an unknown order lookup never replays a new approval',async()=>{
  const f=await fixture();try {
    f.setNow(later(periodAt(new Date(f.approvedAt),1).startsAt));f.setMode('lost');assert.equal(await f.run(),'unknown');
    const before=await f.row();f.setRemote(null);
    assert.equal((await f.call('POST','/v1/subscription/billing/cancel',{subscriptionId:f.subscriptionId})).statusCode,200);
    await f.due();assert.equal(await f.run(),'unknown');assert.equal(f.calls.length,2);assert.deepEqual(f.lookups,[before.order_id]);
    assert.equal((await f.row()).request_key,before.request_key);assert.equal((await access(f)).mode,'cleanup_only');
  }finally{await f.close();}
});

test('Field grace expires by the consent calendar even when no renewal worker was deployed',async()=>{
  const f=await fixture();try {
    const next=periodAt(new Date(f.approvedAt),1);assert.equal((await access(f,later(next.startsAt))).mode,'grace');
    assert.equal((await access(f,new Date(next.startsAt.getTime()+3*86400000))).mode,'cleanup_only');
    assert.equal((await f.pool.query('select count(*)::int n from field.billing_periods')).rows[0].n,1);
    f.session(false);assert.equal((await f.call('POST','/v1/subscription/billing/cancel',{subscriptionId:f.subscriptionId})).statusCode,401);f.session(true);
    assert.equal((await f.call('POST','/v1/subscription/billing/cancel',{subscriptionId:f.subscriptionId},randomUUID(),{origin:'https://other.invalid'})).statusCode,403);
    assert.equal((await f.pool.query('select cancel_requested_at from field.paid_subscriptions')).rows[0].cancel_requested_at,null);
  }finally{await f.close();}
});

test('Field an unsuccessful first payment grants neither paid access nor paid grace',async()=>{
  const f=await fixture(0,false);try {
    f.setMode('failure');assert.equal(await f.run(),'unknown');await f.due();assert.equal(await f.run(),'failed');
    assert.equal((await access(f)).mode,'mock_unconfigured');
    process.env.FIELD_PROFILE='sandbox';const denied=await access(f);assert.equal(denied.mode,'cleanup_only');assert.equal(denied.canStartNew,false);
  }finally{process.env.FIELD_PROFILE='mock';await f.close();}
});


test('Field refunded or test-only payment cannot reopen mock or live paid access',async()=>{
  const f=await fixture();try {
    process.env.FIELD_PROFILE='live';assert.equal((await access(f)).mode,'cleanup_only');process.env.FIELD_PROFILE='mock';
    await f.pool.query("update field.billing_periods set state='refunded',refunded_amount=total_amount");
    assert.equal((await access(f)).mode,'cleanup_only');
  }finally{process.env.FIELD_PROFILE='mock';await f.close();}
});


test('Field cancellation committed during order lookup fences its later approval replay',async()=>{
  const f=await fixture();try {
    f.setNow(later(periodAt(new Date(f.approvedAt),1).startsAt));f.setMode('lost');assert.equal(await f.run(),'unknown');
    f.setRemote(null);await f.due();f.holdLookup();const recovering=f.run();
    await new Promise(r=>setTimeout(r,100));assert.equal(f.lookups.length,1);
    assert.equal((await f.call('POST','/v1/subscription/billing/cancel',{subscriptionId:f.subscriptionId})).statusCode,200);
    f.releaseLookup();assert.equal(await recovering,'unknown');assert.equal(f.calls.length,2);
  }finally{await f.close();}
});


test('Field cancellation after claim but before any POST closes a provably unsent attempt',async()=>{
  const f=await fixture(0,false);let canceled=false;
  try {
    const wrapped={query:f.pool.query.bind(f.pool),async connect(){
      const db=await f.pool.connect(),query=db.query.bind(db),release=db.release.bind(db);let claimed=false;
      db.query=(async(sql:string,values?:unknown[])=>{
        const result=await query(sql,values);
        if(sql.includes("set state='processing',started_at"))claimed=true;
        if(sql==='commit'&&claimed&&!canceled){
          canceled=true;assert.equal((await f.call('POST','/v1/subscription/billing/cancel',{subscriptionId:f.subscriptionId})).statusCode,200);
        }
        return result;
      }) as PoolClient['query'];
      db.release=error=>{db.query=query;release(error);};return db;
    }} as unknown as Pool;
    assert.equal(await runBillingChargeOnce({pool:wrapped,billing:f.billing,now:f.now()}),'canceled');
    assert.equal(f.calls.length,0);assert.equal((await f.row()).state,'failed');
    assert.equal(await f.run(),'empty');
    const checkout=await f.call('POST','/v1/subscription/checkout',f.consent);assert.equal(checkout.statusCode,201,checkout.body);
    assert.notEqual(checkout.json().subscriptionId,f.subscriptionId);
  }finally{await f.close();}
});


test('Field recovery closes canceled unsent evidence without a billing provider or lookup',async()=>{
  const f=await fixture(0,false);let crashed=false;
  try {
    const wrapped={query:f.pool.query.bind(f.pool),async connect(){
      const db=await f.pool.connect(),query=db.query.bind(db),release=db.release.bind(db);let claimed=false;
      db.query=(async(sql:string,values?:unknown[])=>{
        const result=await query(sql,values);
        if(sql.includes("set state='processing',started_at"))claimed=true;
        if(sql==='commit'&&claimed&&!crashed){crashed=true;throw new Error('SYNTHETIC_CRASH_AFTER_CLAIM');}
        return result;
      }) as PoolClient['query'];
      db.release=error=>{db.query=query;release(error);};return db;
    }} as unknown as Pool;
    await assert.rejects(runBillingChargeOnce({pool:wrapped,billing:f.billing,now:f.now()}),/SYNTHETIC_CRASH_AFTER_CLAIM/);
    assert.equal(f.calls.length,0);assert.equal((await f.row()).dispatched_at,null);
    assert.equal((await f.call('POST','/v1/subscription/billing/cancel',{subscriptionId:f.subscriptionId})).statusCode,200);
    await f.pool.query("update field.billing_transactions set lease_expires_at=now()-interval '1 second',next_attempt_at=now()");
    assert.equal(await runBillingChargeOnce({pool:f.pool,now:f.now()}),'canceled');
    assert.equal(f.lookups.length,0);assert.equal(f.calls.length,0);assert.equal((await f.row()).state,'failed');
    assert.equal(await f.run(),'empty');
    assert.equal((await f.call('POST','/v1/subscription/checkout',f.consent)).statusCode,201);
  }finally{await f.close();}
});


test('Field delayed lookup cannot replay renewal approval after its period ends',async()=>{
  const f=await fixture();try {
    const end=periodAt(new Date(f.approvedAt),1).endsAt;
    f.setNow(new Date(end.getTime()-150));f.setMode('lost');assert.equal(await f.run(),'unknown');
    f.setRemote(null);await f.due();f.holdLookup();const recovering=f.run();
    const deadline=Date.now()+5000;
    while(f.lookups.length===0&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
    assert.equal(f.lookups.length,1);
    await new Promise(r=>setTimeout(r,220));f.releaseLookup();
    assert.equal(await recovering,'unknown');assert.equal(f.calls.length,2);
  }finally{await f.close();}
});
