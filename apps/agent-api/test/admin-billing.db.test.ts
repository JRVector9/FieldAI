import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes,randomUUID } from 'node:crypto';
import {Pool} from 'pg';
import {createAgentApp} from '../src/app.js';
import {sealBilling} from '../src/billing-context.js';

test('native PostgreSQL17 own admin billing query returns exact counts and appends allowed overview audit',async()=>{
 const url=new URL(process.env.AP_DATABASE_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55431');assert.equal(url.username,'agent_local');assert.match(url.pathname,/^\/fieldai_agent_test_[a-f0-9]{32}$/);
 assert.equal(process.env.FIELD_DATABASE_URL,undefined);process.env.AP_PROFILE='mock';
 const pool=new Pool({connectionString:url.toString()}),[owner,operator,approver,auditor,org,plan,subscription,consent]=[randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID()] as const;let actor:string=operator;
 const app=createAgentApp(async()=>{},undefined,undefined,undefined,{pool,resolveUserId:async()=>actor,resolveSession:async()=>({id:`session-${actor}`,userId:actor})});
 try{assert.match((await pool.query('show server_version')).rows[0].server_version,/^17\./);
  for(const id of [owner,operator,approver,auditor])await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',[id,'Synthetic admin billing',id+'@example.invalid']);
  for(const [id,role] of [[operator,'operator'],[approver,'operator'],[auditor,'auditor']])await pool.query('insert into ap.platform_admin_memberships(user_id,role) values($1,$2)',[id,role]);
  await pool.query('insert into ap.organizations(id,owner_user_id,name) values($1,$2,$3)',[org,owner,'Synthetic billing organization']);await pool.query("insert into ap.memberships(organization_id,user_id,role) values($1,$2,'owner')",[org,owner]);
  await pool.query(`insert into ap.billing_plans(id,mode,name,total_amount,supply_amount,vat_amount,tax_free_amount,included_ai_units,grace_days,terms_version,terms_text,refund_version,refund_text,reference,requested_by,approved_by,approved_at)
   values($1,'test','Synthetic approved price',11000,10000,1000,0,500,3,'terms','Synthetic explicit terms','refund','Synthetic refund policy','SYNTHETIC',$2,$3,now())`,[plan,operator,approver]);
  const anchor=new Date(Date.now()-30*86400000);await pool.query("insert into ap.paid_subscriptions(id,organization_id,plan_id,customer_key,state,created_by,anchor_at) values($1,$2,$3,$4,'past_due',$5,$6)",[subscription,org,plan,randomUUID(),owner,anchor]);
  await pool.query(`insert into ap.billing_consents(id,subscription_id,plan_id,accepted_by,terms_version,refund_version,total_amount,supply_amount,vat_amount,tax_free_amount,currency,included_ai_units,grace_days,auto_renew)
   values($1,$2,$3,$4,'terms','refund',11000,10000,1000,0,'KRW',500,3,true)`,[consent,subscription,plan,owner]);
  const periods:string[]=[],transactions:string[]=[];for(const [index,state,transactionState] of [[0,'paid','succeeded'],[1,'failed','failed'],[2,'pending','unknown']] as const){const period=randomUUID(),transaction=randomUUID();periods.push(period);transactions.push(transaction);
   const starts=new Date(anchor.getTime()+index*30*86400000),ends=new Date(starts.getTime()+30*86400000);await pool.query(`insert into ap.billing_periods(id,subscription_id,billing_period,consent_id,plan_id,starts_at,ends_at,total_amount,supply_amount,vat_amount,tax_free_amount,currency,state,paid_at)
    values($1,$2,$3,$4,$5,$6,$7,11000,10000,1000,0,'KRW',$8,$9)`,[period,subscription,index,consent,plan,starts,ends,state,index===0?starts:null]);
   await pool.query(`insert into ap.billing_transactions(id,period_id,order_id,request_key,state,mode,provider_mid,provider_key_fingerprint,payment_key_ciphertext,started_at,dispatched_at,customer_key,order_name)
    values($1,$2,$3,$4,$5,'test','synthetic-mid',$6,$7,now(),now(),$8,'Synthetic subscription')`,[transaction,period,'synthetic-order-'+randomUUID(),randomUUID(),transactionState,'a'.repeat(64),index===0?sealBilling('synthetic-payment',randomBytes(32),`payment:${transaction}`):null,randomUUID()]);
  }
  actor=owner;const requested=await app.inject({method:'POST',url:'/v1/subscription/refunds',headers:{'x-organization-id':org,'idempotency-key':randomUUID(),origin:'http://localhost:3001'},payload:{periodId:periods[0],amount:5500,reason:'Synthetic customer subscription refund request'}});assert.equal(requested.statusCode,201,requested.body);
  actor=operator;const before=Number((await pool.query("select count(*)::text as n from ap.admin_access_audit where actor_user_id=$1 and resource='overview'",[operator])).rows[0].n);
  const response=await app.inject('/v1/admin/billing/overview');assert.equal(response.statusCode,200,response.body);const b=response.json();assert.equal(b.product,'agent');assert.equal(b.actorUserId,operator);assert.equal(b.sessionId,`session-${operator}`);assert.deepEqual(b.counts,{unconfirmedCharges:'1',renewalFailures:'1',refundRequests:'1'});
  assert.equal(b.transactions.length,3);assert.equal(b.transactions.find((t:{id:string})=>t.id===transactions[2]).state,'unknown');assert.equal(b.transactions[0].organizationName,'Synthetic billing organization');assert.deepEqual(b.refundExecution,[{id:requested.json().id,mode:'test',dispatchedAt:null}]);
  assert.equal(Number((await pool.query("select count(*)::text as n from ap.admin_access_audit where actor_user_id=$1 and resource='overview'",[operator])).rows[0].n),before+1);assert.doesNotMatch(response.body,/paymentKey|ciphertext|provider_mid|fingerprint|customer_key|synthetic-mid/);
  const events=Number((await pool.query('select count(*)::text as n from ap.billing_events')).rows[0].n);
  const fenced=await app.inject({method:'POST',url:`/v1/admin/billing/plans/${plan}/retire`,headers:{'idempotency-key':randomUUID(),'x-admin-billing-actor-id':approver,'x-admin-billing-session-id':`session-${approver}`},payload:{reason:'Previous operator action must not run in new session'}});
  assert.equal(fenced.statusCode,403,fenced.body);assert.equal(fenced.json().error,'billing_admin_binding_invalid');assert.equal(Number((await pool.query('select count(*)::text as n from ap.billing_events')).rows[0].n),events);assert.equal((await pool.query('select retired_at from ap.billing_plans where id=$1',[plan])).rows[0].retired_at,null);
  actor=auditor;assert.equal((await app.inject('/v1/admin/billing/overview')).statusCode,200);
 }finally{await app.close();await pool.end();}
});
