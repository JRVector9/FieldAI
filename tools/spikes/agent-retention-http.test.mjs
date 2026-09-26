import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createAgentInquiryMediaStore } from '../../apps/agent-api/dist/inquiry-media.js';
const sharp=createRequire(resolve('apps/agent-api/package.json'))('sharp');

process.loadEnvFile(resolve('infra/agent/.env'));
const database=new URL(process.env.AP_DATABASE_URL);
assert.equal(database.hostname,'127.0.0.1'); assert.equal(database.port,'55431');
assert.equal(database.username,'agent_local'); assert.equal(database.pathname,'/fieldai_agent_mock');

test('AP retention mobile administrator requests, independently approves and recovers policies and inquiry holds',async()=>{
 const pool=new Pool({connectionString:database.toString()}), users=[];
 const accounts=Array.from({length:3},()=>({email:`ap-retention-${randomUUID()}@example.invalid`,password:`${randomBytes(18).toString('base64url')}A1!`}));
 let org,photoKey;
 const request=async(path,body,cookie,method='POST')=>{
   const response=await fetch(`http://localhost:3001${path}`,{method,headers:{'content-type':'application/json',origin:'http://localhost:3001',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
   return {status:response.status,data:await response.json(),cookie:response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};
 };
 try{
   for(const [i,account] of accounts.entries()){
    assert.equal((await request('/api/auth/sign-up/email',{...account,name:'Synthetic AP retention browser'})).status,200);
    const signed=await request('/api/auth/sign-in/email',account); assert.equal(signed.status,200); account.cookie=signed.cookie;
    const user=(await pool.query('select id from "user" where email=$1',[account.email])).rows[0].id; users.push(user);
    if(i>0) await pool.query("insert into ap.platform_admin_memberships(user_id,role) values($1,'operator')",[user]);
   }
   const owner=accounts[0]; org=(await request('/v1/organizations',{name:'합성 AP 보존 화면'},owner.cookie)).data.id;
   await request('/v1/knowledge/draft',{expectedRevision:0,businessName:'합성 AP 보존 화면',introduction:'',services:[],faqs:[]},owner.cookie,'PUT');
   await request('/v1/knowledge/releases',{expectedRevision:1},owner.cookie);
   const made=await request(`/v1/public/organizations/${org}/inquiries`,{name:'SYNTHETIC_RETENTION_CUSTOMER',phone:'010-4567-7890',message:'SYNTHETIC_RETENTION_BODY',consent:true});
   assert.equal(made.status,201); const inquiry=made.data;
   const purge=(await request(`/v1/public/organizations/${org}/inquiries`,{name:'PRIVATE_PURGE_BROWSER',phone:'010-4567-7891',message:'PRIVATE_PURGE_BROWSER_BODY',consent:true})).data;
   const auth={authorization:`Bearer ${purge.receiptKey}`};
   const details=await (await fetch(`http://localhost:3001/v1/inquiries/${purge.id}`,{headers:auth})).json();
   const image=await sharp({create:{width:3,height:2,channels:3,background:'#285588'}}).png().toBuffer();
   const uploaded=await fetch(`http://localhost:3001/v1/inquiries/${purge.id}/messages/${details.messages[0].id}/attachments`,{method:'POST',headers:{...auth,'content-type':'application/octet-stream'},body:image});
   assert.equal(uploaded.status,201);photoKey=`${org}/${(await uploaded.json()).id}.webp`;
   const revision=(await pool.query('select revision from ap.inquiries where id=$1',[purge.id])).rows[0].revision;
   assert.equal((await request(`/v1/owner/inquiries/${purge.id}/close`,{expectedRevision:revision},owner.cookie)).status,200);
   await pool.query("update ap.inquiries set created_at=now()-interval '201 days',retention_closed_at=now()-interval '200 days' where id=$1",[purge.id]);
   await pool.query("update ap.inquiry_messages set created_at=now()-interval '201 days' where inquiry_id=$1",[purge.id]);
   await pool.query("update ap.inquiry_attachments set created_at=now()-interval '201 days' where inquiry_id=$1",[purge.id]);
   assert.equal((await request('/v1/agents/draft',{expectedRevision:0,name:'합성 익명 보존 상담',tone:'clear',guideScope:'승인된 안내',handoffText:'담당자가 확인합니다.'},owner.cookie,'PUT')).status,200);
   assert.equal((await request('/v1/agents/releases',{expectedRevision:1,expectedKnowledgeRevision:1},owner.cookie)).status,201);
   const link=(await request('/v1/deployments',{kind:'link'},owner.cookie)).data;
   assert.equal((await request(`/v1/deployments/${link.id}/activate`,{},owner.cookie)).status,200);
   const started=await request(`/v1/public/deployments/${link.publicId}/engagements`,{});assert.equal(started.status,201);
   await pool.query("update ap.inquiries set created_at=now()-interval '31 days' where id=$1",[started.data.id]);
   const anonymous={id:started.data.id,publicId:link.publicId,cookie:started.cookie};
   const fixture={operator:accounts[1],approver:accounts[2],owner,org,inquiryId:inquiry.id,purge,anonymous,reference:`AP-RETENTION-${randomUUID()}`};
   const result=await promisify(execFile)(process.env.AP_BROWSER_PYTHON??'/tmp/fieldai-ui-venv/bin/python',['tools/spikes/agent-retention-browser.py'],{
    timeout:90000,env:{...process.env,AP_RETENTION_FIXTURE:JSON.stringify(fixture)}});
   assert.match(result.stdout,/AP retention browser: passed/); process.stdout.write(result.stdout);
   const policy=(await pool.query('select id from ap.work_retention_policies where requested_by=$1 and reference=$2',[users[1],fixture.reference])).rows[0].id;
   const invalidCursor=Buffer.from(JSON.stringify({org,policy,kind:'inquiry',id:inquiry.id,at:'2026-02-31T10:00:00.000000Z'})).toString('base64url');
   const rejected=await fetch(`http://localhost:3001/v1/admin/retention/preview?organizationId=${org}&policyId=${policy}&before=${invalidCursor}`,{headers:{cookie:accounts[1].cookie}});
   assert.equal(rejected.status,400); assert.equal((await rejected.json()).error,'invalid_cursor');
   assert.equal((await pool.query('select customer_name from ap.inquiries where id=$1',[inquiry.id])).rows[0].customer_name,'SYNTHETIC_RETENTION_CUSTOMER');
   assert.equal((await pool.query('select customer_name from ap.inquiries where id=$1',[purge.id])).rows[0].customer_name,'[보존 기간 종료]');
   process.env.AP_PROFILE='mock';assert.equal(await createAgentInquiryMediaStore().get(photoKey),null);

 }finally{
   if(photoKey){process.env.AP_PROFILE='mock';await createAgentInquiryMediaStore().delete(photoKey);}
   if(org) await pool.query('delete from ap.organizations where id=$1',[org]);
   await pool.query('delete from ap.work_retention_policies where requested_by=any($1::text[])',[users]);
   if(org) await pool.query('delete from ap.organizations where id=$1',[org]);
   await pool.query('delete from "user" where email=any($1::text[])',[accounts.map(a=>a.email)]); await pool.end();
 }
});
