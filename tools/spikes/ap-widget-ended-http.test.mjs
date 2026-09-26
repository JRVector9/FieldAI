import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {test} from 'node:test';
import pg from 'pg';
import {createAgentApp} from '../../apps/agent-api/dist/app.js';
import {createAgentInquiryMediaStore} from '../../apps/agent-api/dist/inquiry-media.js';
import {AgentRetentionJournal} from '../../apps/agent-api/dist/retention-journal.js';
import {runAgentRetentionJobOnce} from '../../apps/agent-api/dist/retention-purge.js';

process.loadEnvFile(resolve('infra/agent/.env'));
process.env.AP_PROFILE='mock';

for(const lateResponse of ['answer','transcript']) test(`native widget ends a retained conversation and isolates late ${lateResponse} after one explicit new conversation`,async()=>{
  const source=new URL(process.env.AP_DATABASE_URL);
  assert.equal(source.hostname,'127.0.0.1');assert.equal(source.port,'55431');
  assert.equal(source.username,'agent_local');assert.equal(source.pathname,'/fieldai_agent_mock');
  const dbName=`fieldai_agent_test_${randomUUID().replaceAll('-','')}`;
  const adminUrl=new URL(source);adminUrl.pathname='/postgres';
  const admin=new pg.Client({connectionString:adminUrl.toString()});await admin.connect();
  const root=await mkdtemp(resolve(tmpdir(),'ap-widget-end-'));
  let pool,app,external,created=false;
  try{
    await admin.query(`create database "${dbName}"`);created=true;source.pathname='/'+dbName;
    process.env.AP_REVOCATION_JOURNAL_DIRECTORY=resolve(root,'revocations');
    process.env.AP_REVOCATION_JOURNAL_SECRET=randomBytes(32).toString('base64url');
    await promisify(execFile)(process.execPath,['tools/run-migrations.mjs','agent'],{
      env:{...process.env,AP_DATABASE_URL:source.toString()}});
    pool=new pg.Pool({connectionString:source.toString()});
    process.env.AP_INQUIRY_MEDIA_DIRECTORY=resolve(root,'media');
    const media=createAgentInquiryMediaStore();
    const journalDirectory=resolve(root,'journal');
    const {mkdir}=await import('node:fs/promises');await mkdir(journalDirectory);
    const journal=new AgentRetentionJournal(journalDirectory,randomBytes(32).toString('base64url'));
    const [owner,operator,approver]=[randomUUID(),randomUUID(),randomUUID()];
    for(const id of [owner,operator,approver])await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',[id,'Synthetic widget lifetime',`${id}@example.invalid`]);
    for(const id of [operator,approver])await pool.query("insert into ap.platform_admin_memberships(user_id,role) values($1,'operator')",[id]);
    const runtime={pool,inquiryMedia:media,verifyDomain:async()=>true,customerDailyLimit:10,
      resolveUserId:async headers=>typeof headers['x-test-user']==='string'?headers['x-test-user']:null,
      modelProvider:{model:'synthetic-widget-lifetime',generate:async()=>({output:{answer:'승인된 안내입니다.',evidenceIds:['business'],unknowns:[],handoffRecommended:false},inputTokens:10,outputTokens:5,responseId:`synthetic-${randomUUID()}`})}};
    app=createAgentApp(async()=>undefined,undefined,undefined,undefined,runtime);
    const listening=await app.listen({port:0,host:'127.0.0.1'});
    const api=listening.replace('127.0.0.1','widget-api.localhost');process.env.AP_PUBLIC_WEB_ORIGIN=api;
    const write=async(method,url,payload,user=owner)=>{
      const response=await app.inject({method,url,payload,headers:{'x-test-user':user,'idempotency-key':randomUUID()}});
      assert.ok(response.statusCode>=200&&response.statusCode<300,response.body);return response.json();
    };
    const org=(await write('POST','/v1/organizations',{name:'합성 위젯 종료 상점'})).id;
    await write('PUT','/v1/knowledge/draft',{expectedRevision:0,businessName:'합성 위젯 종료 상점',introduction:'승인된 안내입니다.',services:[],faqs:[]});
    await write('POST','/v1/knowledge/releases',{expectedRevision:1});
    await write('PUT','/v1/agents/draft',{expectedRevision:0,expectedKnowledgeRevision:1,name:'합성 안내',tone:'clear',guideScope:'',handoffText:'담당자에게 문의해 주세요.'});
    await write('POST','/v1/agents/releases',{expectedRevision:1,expectedKnowledgeRevision:1});
    const policy=(await write('POST','/v1/admin/retention/policies',{anonymousDays:30,workDays:180,photoDays:90,reference:'SYNTHETIC-WIDGET-END',reason:'합성 위젯 종료 분기를 검수합니다.'},operator)).id;
    await write('POST',`/v1/admin/retention/policies/${policy}/approve`,{reason:'다른 합성 운영자가 검수 정책을 승인합니다.'},approver);
    let deployment,endedId;
    external=createServer((request,response)=>{
      const path=new URL(request.url??'/','http://localhost').pathname;
      if(path==='/end'){
        void(async()=>{
          endedId=(await pool.query('select conversation_id from ap.embed_sessions where deployment_id=$1',[deployment.id])).rows[0].conversation_id;
          await pool.query("update ap.inquiries set created_at=now()-interval '31 days' where id=$1",[endedId]);
          await pool.query("update ap.inquiry_messages set created_at=now()-interval '31 days' where inquiry_id=$1",[endedId]);
          await pool.query("update ap.ai_runs set started_at=now()-interval '31 days' where inquiry_id=$1",[endedId]);
          const preview=await app.inject({url:`/v1/admin/retention/preview?organizationId=${org}&policyId=${policy}`,headers:{'x-test-user':operator}});
          assert.equal(preview.statusCode,200,preview.body);
          const item=preview.json().items.find(row=>row.targetId===endedId);assert.equal(item.reason,'due');
          const job=(await write('POST','/v1/admin/retention/jobs',{organizationId:org,targetKind:'inquiry',targetId:endedId,policyId:policy,scope:'work',expectedRevision:item.revision,expectedAnchorAt:item.anchorAt,reason:'합성 위젯 대화 보존 종료를 검수합니다.'},operator)).id;
          await write('POST',`/v1/admin/retention/jobs/${job}/approve`,{reason:'별도 합성 운영자가 정리 검수를 승인합니다.'},approver);
          assert.equal(await runAgentRetentionJobOnce({pool,media,journal}),'completed');
          runtime.modelProvider=undefined;
          response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({endedId}));
        })().catch(error=>{response.writeHead(500).end(String(error));});return;
      }
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main><h1>합성 외부 사이트</h1><script async src="${api}/sdk/v1.js" data-deployment="${deployment?.publicId??''}" data-mode="inline"></script></main></body></html>`);
    });
    await new Promise(resolveListen=>external.listen(0,'127.0.0.1',resolveListen));
    const origin=`http://retention-widget.localhost:${external.address().port}`;
    deployment=await write('POST','/v1/deployments',{kind:'owned_embed',origin});
    // Local injected ownership verifier is a fixture, not real DNS evidence.
    await write('POST',`/v1/deployments/${deployment.id}/verify`,{});
    await write('POST',`/v1/deployments/${deployment.id}/activate`,{});
    const result=await promisify(execFile)(process.env.AP_BROWSER_PYTHON??'/tmp/fieldai-ui-venv/bin/python',['tools/spikes/ap-widget-ended-browser.py'],{
      timeout:90000,env:{...process.env,AP_WIDGET_TEST_ORIGIN:origin,AP_WIDGET_LATE_RESPONSE:lateResponse}});
    assert.match(result.stdout,/AP native widget lifetime: passed/);process.stdout.write(result.stdout);
    const inquiries=(await pool.query('select id,retention_work_purged_at from ap.inquiries where deployment_id=$1',[deployment.id])).rows;
    assert.equal(inquiries.length,2);assert.ok(inquiries.find(row=>row.id===endedId)?.retention_work_purged_at);
  }finally{
    if(external)await new Promise(resolveClose=>external.close(resolveClose));
    if(app)await app.close();if(pool)await pool.end();
    if(created)await admin.query(`drop database "${dbName}"`);
    await admin.end();await rm(root,{recursive:true,force:true});
  }
});
