import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));

test('AP retention uses separately approved native periods, real closure and persistent inquiry holds without Field', async () => {
  process.env.AP_PROFILE='mock';
  const pool=new Pool({ connectionString: process.env.AP_DATABASE_URL });
  const users=Array.from({ length:4 },()=>randomUUID()), [owner,operator,approver,auditor]=users as [string,string,string,string];
  const app=createAgentApp(async()=>undefined,undefined,undefined,undefined,{ pool,
    resolveUserId:async headers=>typeof headers['x-test-user']==='string'?headers['x-test-user']:null });
  const headers=(user=operator,key:string=randomUUID())=>({ 'x-test-user':user,'idempotency-key':key });
  const post=(url:string,payload:Record<string,unknown>,user=operator,key?:string)=>app.inject({method:'POST',url,payload,headers:headers(user,key)});
  let org:string|undefined;
  try {
    for(const user of users) await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',[user,'Synthetic AP retention actor',`${user}@example.invalid`]);
    for(const [user,role] of [[operator,'operator'],[approver,'operator'],[auditor,'auditor']])
      await pool.query('insert into ap.platform_admin_memberships(user_id,role) values($1,$2)',[user,role]);
    org=(await post('/v1/organizations',{name:'합성 AP 보존 조직'},owner)).json().id;
    await app.inject({method:'PUT',url:'/v1/knowledge/draft',headers:headers(owner),payload:{expectedRevision:0,businessName:'합성 AP 보존 조직',introduction:'',services:[],faqs:[]}});
    await post('/v1/knowledge/releases',{expectedRevision:1},owner);
    const created=await app.inject({method:'POST',url:`/v1/public/organizations/${org}/inquiries`,payload:{name:'PRIVATE_RETENTION_CUSTOMER',phone:'010-3333-4444',message:'PRIVATE_RETENTION_BODY',consent:true}});
    assert.equal(created.statusCode,201); const inquiry=created.json();
    const body={anonymousDays:30,workDays:180,photoDays:90,reference:'SYNTHETIC-AP-POLICY',reason:'합성 AP 업무 보존 기준을 요청합니다.'}, key=randomUUID();
    const requested=await post('/v1/admin/retention/policies',body,operator,key);
    assert.equal(requested.statusCode,201,requested.body); const policy=requested.json().id;
    assert.equal((await post('/v1/admin/retention/policies',body,operator,key)).json().id,policy);
    assert.equal((await post('/v1/admin/retention/policies',{...body,anonymousDays:31},operator,key)).statusCode,409);
    assert.equal((await post('/v1/admin/retention/policies',body,auditor)).statusCode,403);
    assert.equal((await post('/v1/admin/retention/policies', {...body,anonymousDays:['30']})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/v1/admin/retention/policies',headers:{...headers(),origin:'https://untrusted.invalid'},payload:body})).statusCode,403);
    assert.equal((await app.inject({url:'/v1/admin/retention/policies'})).statusCode,401);
    assert.equal((await post(`/v1/admin/retention/policies/${policy}/approve`,{reason:'다른 운영자가 기준을 검토합니다.'},operator)).statusCode,403);
    assert.equal((await post(`/v1/admin/retention/policies/${policy}/approve`,{reason:'합성 AP 원장 보존 기준을 승인합니다.'},approver)).statusCode,200);
    const preview=()=>app.inject({url:`/v1/admin/retention/preview?organizationId=${org}&policyId=${policy}`,headers:headers(auditor)});
    assert.equal((await preview()).json().items[0].reason,'active_work');
    const initialRevision=(await pool.query('select revision from ap.inquiries where id=$1',[inquiry.id])).rows[0].revision;
    assert.equal((await post(`/v1/owner/inquiries/${inquiry.id}/close`,{expectedRevision:initialRevision},owner)).statusCode,200);
    const closed=(await pool.query('select retention_closed_at from ap.inquiries where id=$1',[inquiry.id])).rows[0].retention_closed_at;
    assert.ok(closed);
    await post(`/v1/owner/inquiries/${inquiry.id}/close`,{expectedRevision:initialRevision},owner);
    assert.equal((await pool.query('select retention_closed_at from ap.inquiries where id=$1',[inquiry.id])).rows[0].retention_closed_at.toISOString(),closed.toISOString());
    await pool.query("update ap.inquiries set created_at=now()-interval '201 days',retention_closed_at=now()-interval '200 days' where id=$1",[inquiry.id]);
    await pool.query("update ap.inquiry_resolution_events set created_at=now()-interval '200 days' where inquiry_id=$1",[inquiry.id]);
    await pool.query("update ap.inquiry_messages set created_at=now()-interval '201 days' where inquiry_id=$1",[inquiry.id]);
    const due=await preview(); assert.equal(due.statusCode,200,due.body); assert.equal(due.json().items[0].workDue,true);
    assert.doesNotMatch(due.body,/PRIVATE_RETENTION|010-3333|visitor_key|object_key|consult_session/);
    const holdBody={targetKind:'inquiry',targetId:inquiry.id,organizationId:org,reasonCode:'dispute',reason:'합성 자료에 대한 분쟁 보존을 요청합니다.',reference:'SYNTHETIC-AP-HOLD',reviewDueAt:new Date(Date.now()-86400000).toISOString()};
    const held=await post('/v1/admin/retention/holds',holdBody); assert.equal(held.statusCode,201,held.body);
    await assert.rejects(pool.query('update ap.work_retention_holds set reason=$2 where id=$1',[held.json().id,'기존 검토 사유를 덮어쓰려는 합성 입력']),{code:'23514'});
    assert.equal((await preview()).json().items[0].reason,'active_hold');
    assert.equal((await post('/v1/admin/retention/holds',{...holdBody,organizationId:randomUUID()})).statusCode,404);
    assert.equal((await post(`/v1/admin/retention/holds/${held.json().id}/release`,{reason:'합성 보류 해제 기준을 검토합니다.'})).statusCode,403);
    assert.equal((await post(`/v1/admin/retention/holds/${held.json().id}/release`,{reason:'다른 운영자가 합성 보류 해제를 승인합니다.'},approver)).statusCode,200);
    assert.equal((await preview()).json().items[0].reason,'due');
    await assert.rejects(pool.query('update ap.work_retention_policies set work_days=181 where id=$1',[policy]),{code:'23514'});
    const reply=await app.inject({method:'POST',url:`/v1/inquiries/${inquiry.id}/messages`,headers:{authorization:`Bearer ${inquiry.receiptKey}`,'idempotency-key':randomBytes(32).toString('base64url')},payload:{body:'합성 문의를 다시 엽니다.'}});
    assert.equal(reply.statusCode,201,reply.body);
    assert.equal((await pool.query('select retention_closed_at from ap.inquiries where id=$1',[inquiry.id])).rows[0].retention_closed_at,null);
    assert.equal((await preview()).json().items[0].reason,'active_work');
    assert.equal((await post(`/v1/admin/retention/policies/${policy}/retire`,{reason:'합성 보존 정책의 신규 사용을 중단합니다.'})).statusCode,200);
    assert.equal((await preview()).json().items[0].reason,'policy_not_approved');
    process.env.AP_PROFILE='sandbox';
    assert.equal((await app.inject({url:'/v1/admin/retention/policies',headers:headers()})).statusCode,503);
    process.env.AP_PROFILE='mock';
  } finally {
    await app.close();
    if(org) await pool.query('delete from ap.organizations where id=$1',[org]);
    await pool.query('delete from ap.work_retention_policies where requested_by=any($1::text[])',[users]);
    await pool.query('delete from "user" where id=any($1::text[])',[users]);
    await pool.end();
  }
});

test('AP retention separates anonymous activity, photo periods, pending work, approved support and stable native pagination', async () => {
  process.env.AP_PROFILE='mock';
  const pool=new Pool({connectionString:process.env.AP_DATABASE_URL});
  const users=Array.from({length:3},()=>randomUUID()),[owner,operator,approver]=users as [string,string,string];
  const app=createAgentApp(async()=>undefined,undefined,undefined,undefined,{pool,
    resolveUserId:async headers=>typeof headers['x-test-user']==='string'?headers['x-test-user']:null});
  const headers=(user=operator)=>({'x-test-user':user,'idempotency-key':randomUUID()});
  const post=(url:string,payload:Record<string,unknown>,user=operator)=>app.inject({method:'POST',url,payload,headers:headers(user)});
  let org:string|undefined;
  try {
    for(const user of users) await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',[user,'Synthetic AP retention periods',`${user}@example.invalid`]);
    for(const user of [operator,approver]) await pool.query("insert into ap.platform_admin_memberships(user_id,role) values($1,'operator')",[user]);
    org=(await post('/v1/organizations',{name:'합성 AP 보존 기간 조직'},owner)).json().id;
    assert.equal((await app.inject({method:'PUT',url:'/v1/knowledge/draft',headers:headers(owner),payload:{expectedRevision:0,businessName:'합성 AP 보존 기간 조직',introduction:'',services:[],faqs:[]}})).statusCode,200);
    await post('/v1/knowledge/releases',{expectedRevision:1},owner);
    await app.inject({method:'PUT',url:'/v1/agents/draft',headers:headers(owner),payload:{expectedRevision:0,name:'합성 AI',tone:'clear',guideScope:'승인 정보',handoffText:'담당자가 확인합니다.'}});
    assert.equal((await post('/v1/agents/releases',{expectedRevision:1,expectedKnowledgeRevision:1},owner)).statusCode,201);
    const deployment=await post('/v1/deployments',{kind:'link'},owner); assert.equal(deployment.statusCode,201,deployment.body);
    assert.equal((await post(`/v1/deployments/${deployment.json().id}/activate`,{},owner)).statusCode,200);
    const started=await post(`/v1/public/deployments/${deployment.json().publicId}/engagements`,{});
    assert.equal(started.statusCode,201,started.body); const anonymous=started.json().id;
    const policy=(await post('/v1/admin/retention/policies',{anonymousDays:30,workDays:180,photoDays:90,reference:'SYNTHETIC-AP-PERIODS',reason:'익명과 정식 문의의 별도 보존 기간을 검토합니다.'})).json().id;
    assert.equal((await post(`/v1/admin/retention/policies/${policy}/approve`,{reason:'다른 운영자가 합성 기간 정책을 승인합니다.'},approver)).statusCode,200);
    const preview=async(before?:string)=>{
      const response=await app.inject({url:`/v1/admin/retention/preview?organizationId=${org}&policyId=${policy}${before?`&before=${encodeURIComponent(before)}`:''}`,headers:headers()});
      assert.equal(response.statusCode,200,response.body); return response.json();
    };
    const item=async(id:string)=>(await preview()).items.find((row:{targetId:string})=>row.targetId===id);
    await pool.query("update ap.inquiries set created_at=now()-interval '31 days' where id=$1",[anonymous]);
    const anonymousDue=await item(anonymous);
    assert.equal(anonymousDue.classification,'anonymous'); assert.equal(anonymousDue.closedAt,null);
    assert.equal(anonymousDue.reason,'due'); assert.equal(anonymousDue.workDue,true);
    const native=(await pool.query('select agent_release_id from ap.inquiries where id=$1',[anonymous])).rows[0];
    const knowledge=(await pool.query('select knowledge_release_id from ap.agent_releases where id=$1',[native.agent_release_id])).rows[0];
    const run=randomUUID();
    await pool.query(`insert into ap.ai_runs(id,organization_id,agent_release_id,knowledge_release_id,kind,question,status,inquiry_id,inquiry_revision,started_at)
      values($1,$2,$3,$4,'customer_message','PRIVATE_RETENTION_AI','in_progress',$5,1,now()-interval '31 days')`,[run,org,native.agent_release_id,knowledge.knowledge_release_id,anonymous]);
    assert.equal((await item(anonymous)).reason,'pending_delivery');
    await pool.query("update ap.ai_runs set status='failed',finished_at=now() where id=$1",[run]);
    await pool.query("insert into ap.inquiry_messages(id,inquiry_id,sequence,actor,visibility,body,delivery_state) values($1,$2,1,'customer','customer','PRIVATE_RECENT_ACTIVITY','not_applicable')",[randomUUID(),anonymous]);
    assert.equal((await item(anonymous)).reason,'not_due');

    const made=await app.inject({method:'POST',url:`/v1/public/organizations/${org}/inquiries`,headers:{'idempotency-key':randomBytes(32).toString('base64url'),'x-receipt-key':randomBytes(32).toString('base64url')},payload:{name:'PRIVATE_PERIOD_CUSTOMER',phone:'010-3333-4444',message:'PRIVATE_PERIOD_BODY',consent:true}});
    assert.equal(made.statusCode,201,made.body); const inquiry=made.json().id;
    const revision=(await pool.query('select revision from ap.inquiries where id=$1',[inquiry])).rows[0].revision;
    await post(`/v1/owner/inquiries/${inquiry}/close`,{expectedRevision:revision},owner);
    await pool.query("update ap.inquiries set created_at=now()-interval '101 days',retention_closed_at=now()-interval '100 days' where id=$1",[inquiry]);
    await pool.query("update ap.inquiry_messages set created_at=now()-interval '101 days' where inquiry_id=$1",[inquiry]);
    const photoDue=await item(inquiry); assert.equal(photoDue.reason,'due'); assert.equal(photoDue.photosDue,true); assert.equal(photoDue.workDue,false);
    await pool.query('update ap.inquiries set retention_closed_at=null where id=$1',[inquiry]);
    assert.equal((await item(inquiry)).reason,'unknown_closure');
    await pool.query("update ap.inquiries set retention_closed_at=now()-interval '100 days' where id=$1",[inquiry]);
    const delivery=randomUUID();
    await pool.query("insert into ap.inquiry_messages(id,inquiry_id,sequence,actor,visibility,body,delivery_state,created_at) select $1,$2,coalesce(max(sequence),0)+1,'owner','customer','PRIVATE_PENDING_DELIVERY','unknown',now()-interval '101 days' from ap.inquiry_messages where inquiry_id=$2",[delivery,inquiry]);
    assert.equal((await item(inquiry)).reason,'pending_delivery');
    await pool.query("update ap.inquiry_messages set delivery_state='sent' where id=$1",[delivery]);
    const support=await post('/v1/admin/support-access',{inquiryId:inquiry,purpose:'customer_requested_investigation',reference:'SYNTHETIC-RETENTION-SUPPORT',reason:'고객이 요청한 합성 보존 자료 장애를 조사합니다.',minutes:15,scopes:['conversation'],minimumNecessary:true});
    assert.equal(support.statusCode,201,support.body);
    assert.equal((await item(inquiry)).reason,'due');
    assert.equal((await post(`/v1/admin/support-access/${support.json().id}/approve`,{reason:'다른 운영자가 합성 자료 조사 열람을 승인합니다.'},approver)).statusCode,200);
    assert.equal((await item(inquiry)).reason,'active_support');
    await pool.query("delete from ap.platform_admin_memberships where user_id=$1",[approver]);
    assert.equal((await item(inquiry)).reason,'due');
    await pool.query("insert into ap.platform_admin_memberships(user_id,role) values($1,'operator')",[approver]);
    assert.equal((await item(inquiry)).reason,'active_support');
    await pool.query("update ap.customer_support_access_requests set approved_at=now()-interval '16 minutes',expires_at=now()-interval '1 second' where id=$1",[support.json().id]);
    assert.equal((await item(inquiry)).reason,'due');
    const action=randomUUID(),external=randomUUID(),reservation=randomUUID();
    await pool.query(`insert into ap.field_action_requests(id,organization_id,inquiry_id,connection_id,submission_key_hash,input_hash,field_body_hash,
      field_request_body,kind,service_id,service_snapshot,consent_record_id,consent_confirmed_at,state,created_at,updated_at)
      values($1,$2,$3,$4,$5,$5,$5,'{"synthetic":"PRIVATE_FIELD_PAYLOAD"}','reservation_request',$6,'{}',$7,now()-interval '101 days','delivery_unknown',now()-interval '101 days',now()-interval '101 days')`,
    [action,org,inquiry,randomUUID(),'a'.repeat(64),randomUUID(),randomUUID()]);
    assert.equal((await item(inquiry)).reason,'external_work_unresolved');
    await pool.query("update ap.field_action_requests set state='accepted_external',external_request_id=$2 where id=$1",[action,external]);
    assert.equal((await item(inquiry)).reason,'external_work_unresolved');
    const outbox=randomUUID(),event=randomUUID();
    await pool.query("insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload) values($1,$2,'synthetic.retention',$3,'{}')",[outbox,org,action]);
    await pool.query(`insert into ap.field_reservation_events(id,organization_id,action_request_id,field_event_id,reservation_id,revision,event_type,state,occurred_at,
      route_generation,customer_notification_owner_product,start_at,end_at,outbox_id) values($1,$2,$3,$4,$5,1,'completed','completed',now(),1,'ap',now()+interval '1 day',now()+interval '2 days',$6)`,
    [event,org,action,randomUUID(),reservation,outbox]);
    assert.equal((await item(inquiry)).reason,'future_schedule');
    await pool.query("update ap.field_reservation_events set start_at=now()-interval '101 days',end_at=now()-interval '100 days' where id=$1",[event]);
    assert.equal((await item(inquiry)).reason,'due');
    assert.doesNotMatch(JSON.stringify(await preview()),/PRIVATE_|010-3333|question|customer_phone|consult_session|object_key/);
    await pool.query(`insert into ap.inquiries(id,organization_id,knowledge_release_id,knowledge_revision,customer_name,customer_phone,visitor_key_hash,consent_at,state,mode,automation_paused,
      deployment_id,agent_release_id,consult_session_hash,consult_session_expires_at,created_at)
      select gen_random_uuid(),organization_id,knowledge_release_id,knowledge_revision,null,null,null,null,'ai_assisting','ai',false,deployment_id,agent_release_id,
        md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),now()+interval '1 day',date_trunc('second',now())+n*interval '1 microsecond'
      from ap.inquiries cross join generate_series(1,105) as n where id=$1`,[anonymous]);
    const first=await preview(); assert.equal(first.items.length,100); assert.ok(first.nextCursor);
    const second=await preview(first.nextCursor); assert.equal(second.items.length,7); assert.equal(second.nextCursor,null);
    const ids=[...first.items,...second.items].map(row=>row.targetId); assert.equal(new Set(ids).size,107);
    const unbound=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(first.nextCursor,'base64url').toString()),org:randomUUID()})).toString('base64url');
    assert.equal((await app.inject({url:`/v1/admin/retention/preview?organizationId=${org}&policyId=${policy}&before=${unbound}`,headers:headers()})).statusCode,400);
    const invalidDate=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(first.nextCursor,'base64url').toString()),at:'2026-02-31T10:00:00.000000Z'})).toString('base64url');
    assert.equal((await app.inject({url:`/v1/admin/retention/preview?organizationId=${org}&policyId=${policy}&before=${invalidDate}`,headers:headers()})).statusCode,400);
  } finally {
    await app.close();
    if(org) await pool.query('delete from ap.organizations where id=$1',[org]);
    await pool.query('delete from ap.work_retention_policies where requested_by=any($1::text[])',[users]);
    await pool.query('delete from "user" where id=any($1::text[])',[users]);
    await pool.end();
  }
});
