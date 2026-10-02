import assert from 'node:assert/strict';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { execFile,spawn } from 'node:child_process';
import { mkdtemp,rm,readFile,writeFile,readdir,mkdir,rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createAgentApp } from '../src/app.js';
import { createAgentInquiryMediaStore } from '../src/inquiry-media.js';
import { runAgentRetentionJobOnce } from '../src/retention-purge.js';
import { AgentRetentionJournal } from '../src/retention-journal.js';
import type { BusinessRuntime } from '../src/business.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));

test('AP independently approves and executes retained inquiry cleanup with real files and irreversible native originals',async()=>{
 process.env.AP_PROFILE='mock';
 const root=await mkdtemp(resolve(tmpdir(),'ap-retention-execution-'));
 const priorMedia=process.env.AP_INQUIRY_MEDIA_DIRECTORY;
 process.env.AP_INQUIRY_MEDIA_DIRECTORY=resolve(root,'media');
 const media=createAgentInquiryMediaStore()!;
 const pool=new Pool({connectionString:process.env.AP_DATABASE_URL});
 const users=Array.from({length:3},()=>randomUUID()),[owner,operator,approver]=users as [string,string,string];
 const runtime:BusinessRuntime={pool,inquiryMedia:media,
  verifyDomain:async()=>true,customerDailyLimit:10,
  modelProvider:{model:'synthetic-unused-retention-model',generate:async()=>{throw new Error('retention must not generate model answers');}},
  resolveUserId:async headers=>typeof headers['x-test-user']==='string'?headers['x-test-user']:null};
 const app=createAgentApp(async()=>undefined,undefined,undefined,undefined,runtime);
 const headers=(user=operator,key:string=randomUUID())=>({'x-test-user':user,'idempotency-key':key});
 const post=(url:string,payload:Record<string,unknown>,user=operator,key?:string)=>app.inject({method:'POST',url,payload,headers:headers(user,key)});
 let org:string|undefined;
 try{
  for(const user of users) await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',[user,'Synthetic AP retention execution',`${user}@example.invalid`]);
  for(const user of [operator,approver]) await pool.query("insert into ap.platform_admin_memberships(user_id,role) values($1,'operator')",[user]);
  org=(await post('/v1/organizations',{name:'합성 AP 정리 실행'},owner)).json().id;
  await app.inject({method:'PUT',url:'/v1/knowledge/draft',headers:headers(owner),payload:{expectedRevision:0,businessName:'합성 AP 정리 실행',introduction:'',services:[],faqs:[]}});
  await post('/v1/knowledge/releases',{expectedRevision:1},owner);
  const made=await app.inject({method:'POST',url:`/v1/public/organizations/${org}/inquiries`,payload:{name:'PRIVATE_PURGE_CUSTOMER',phone:'010-3333-4444',message:'PRIVATE_PURGE_BODY',consent:true}});
  assert.equal(made.statusCode,201,made.body); const inquiry=made.json();
  const receipt={authorization:`Bearer ${inquiry.receiptKey}`};
  const original=(await app.inject({url:`/v1/inquiries/${inquiry.id}`,headers:receipt})).json();
  const png=await sharp({create:{width:4,height:3,channels:3,background:'#225588'}}).png().toBuffer();
  const uploaded=await app.inject({method:'POST',url:`/v1/inquiries/${inquiry.id}/messages/${original.messages[0].id}/attachments`,headers:{...receipt,'content-type':'application/octet-stream'},payload:png});
  assert.equal(uploaded.statusCode,201,uploaded.body); const photo=uploaded.json().id;
  const objectKey=(await pool.query('select object_key from ap.inquiry_attachments where id=$1',[photo])).rows[0].object_key;
  assert.ok(await media.get(objectKey));
  const revision=(await pool.query('select revision from ap.inquiries where id=$1',[inquiry.id])).rows[0].revision;
  await post(`/v1/owner/inquiries/${inquiry.id}/close`,{expectedRevision:revision},owner);
  await pool.query("update ap.inquiries set created_at=now()-interval '201 days',retention_closed_at=now()-interval '200 days' where id=$1",[inquiry.id]);
  await pool.query("update ap.inquiry_messages set created_at=now()-interval '201 days' where inquiry_id=$1",[inquiry.id]);
  await pool.query("update ap.inquiry_attachments set created_at=now()-interval '201 days' where inquiry_id=$1",[inquiry.id]);
  const policy=(await post('/v1/admin/retention/policies',{anonymousDays:30,workDays:180,photoDays:90,reference:'SYNTHETIC-PURGE-POLICY',reason:'합성 정리 실행의 보존 기간을 검토합니다.'})).json().id;
  await post(`/v1/admin/retention/policies/${policy}/approve`,{reason:'다른 운영자가 합성 정리 정책을 승인합니다.'},approver);
  const preview=await app.inject({url:`/v1/admin/retention/preview?organizationId=${org}&policyId=${policy}`,headers:headers()});
  const candidate=preview.json().items.find((row:{targetId:string})=>row.targetId===inquiry.id);
  assert.equal(candidate.reason,'due');
  const body={organizationId:org,targetKind:'inquiry',targetId:inquiry.id,policyId:policy,scope:'work',expectedRevision:candidate.revision,expectedAnchorAt:candidate.anchorAt,reason:'합성 문의의 만료된 원문과 사진을 정리합니다.'};
  const key=randomUUID(),requested=await post('/v1/admin/retention/jobs',body,operator,key);
  assert.equal(requested.statusCode,201,requested.body); const job=requested.json().id;
  assert.equal((await post('/v1/admin/retention/jobs',body,operator,key)).json().id,job);
  assert.equal((await post('/v1/admin/retention/jobs',{...body,scope:'photos'},operator,key)).statusCode,409);
  assert.equal((await post(`/v1/admin/retention/jobs/${job}/approve`,{reason:'합성 원문 정리를 승인합니다.'})).statusCode,403);
  assert.equal((await post(`/v1/admin/retention/jobs/${job}/approve`,{reason:'다른 운영자가 합성 원문 정리를 승인합니다.'},approver)).statusCode,200);
  await mkdir(resolve(root,'journal'));
  const journalSecret=randomBytes(32).toString('base64url'),journal=new AgentRetentionJournal(resolve(root,'journal'),journalSecret);
  const source=new URL(process.env.AP_DATABASE_URL!);assert.match(source.pathname,/^\/fieldai_agent_test_[a-f0-9]+$/);
  const snapshot=await promisify(execFile)('docker',['exec','fieldai-agent-mock-db-1','pg_dump','-U','agent_local','-d',source.pathname.slice(1),'-Fc','--no-owner','--no-acl'],{encoding:'buffer',maxBuffer:32*1024*1024});
  const originalPhoto=(await media.get(objectKey))!;
  assert.equal(await runAgentRetentionJobOnce({pool,media,journal}),'completed');
  assert.equal(await media.get(objectKey),null);
  const ended=await app.inject({url:`/v1/inquiries/${inquiry.id}`,headers:receipt});
  assert.equal(ended.statusCode,200,ended.body); assert.ok(ended.json().retention.workPurgedAt);
  assert.doesNotMatch(ended.body,/PRIVATE_PURGE|010-3333/);
  assert.equal((await app.inject({method:'POST',url:`/v1/inquiries/${inquiry.id}/messages`,headers:{...receipt,'idempotency-key':randomBytes(32).toString('base64url')},payload:{body:'이미 정리된 합성 대화를 다시 저장합니다.'}})).statusCode,410);
  await assert.rejects(pool.query('update ap.inquiries set customer_name=$2 where id=$1',[inquiry.id,'RESURRECT_CUSTOMER']),{code:'PAP01'});
  await assert.rejects(pool.query('update ap.inquiry_messages set body=$2 where inquiry_id=$1',[inquiry.id,'RESURRECT_BODY']),{code:'PAP01'});
  await assert.rejects(pool.query('update ap.inquiry_attachments set state=$2 where id=$1',[photo,'ready']),{code:'PAP01'});
  assert.ok((await journal.read()).some(row=>row.action==='file_deleted'&&row.attachmentId===photo));
  assert.ok((await journal.read()).some(row=>row.action==='completed'&&row.jobId===job));
  assert.equal((await post(`/v1/admin/retention/jobs/${job}/cancel`,{reason:'완료된 합성 정리를 취소하려고 합니다.'})).statusCode,409);
  assert.equal(await runAgentRetentionJobOnce({pool,media,journal}),'empty');
  await assert.rejects(pool.query("update ap.retention_journal_receipts set sha256=repeat('0',64)"),{code:'PJR01'});
  await assert.rejects(pool.query('delete from ap.retention_journal_receipts'),{code:'PJR01'});
  const ledgerPath=resolve(root,'journal'), ledgerBackup=resolve(root,'journal-backup');
  const lostName=(await readdir(ledgerPath)).find(name=>name.endsWith('.json'))!;
  const lostFile=resolve(ledgerPath,lostName), lostBytes=await readFile(lostFile);
  await rm(lostFile);
  try { await assert.rejects(runAgentRetentionJobOnce({pool,media,journal}), /journal_continuity/); }
  finally { await writeFile(lostFile,lostBytes); }
  await rename(ledgerPath,ledgerBackup); await mkdir(ledgerPath);
  try { await assert.rejects(runAgentRetentionJobOnce({pool,media,journal}), /journal_continuity/); }
  finally { await rm(ledgerPath,{recursive:true}); await rename(ledgerBackup,ledgerPath); }
  await rename(ledgerPath,ledgerBackup);
  try { await assert.rejects(journal.append({jobId:job,organizationId:org!,targetKind:'inquiry',targetId:inquiry.id,scope:'work',action:'completed'}),{code:'ENOENT'}); }
  finally { await rename(ledgerBackup,ledgerPath); }

  const restoredName=`fieldai_agent_restore_${randomUUID().replaceAll('-','')}`,adminUrl=new URL(source);adminUrl.pathname='/postgres';
  const admin=new Pool({connectionString:adminUrl.toString()});let restored:Pool|undefined;
  try{
   await admin.query(`create database "${restoredName}"`);
   await new Promise<void>((resolveRestore,reject)=>{
    const child=spawn('docker',['exec','-i','fieldai-agent-mock-db-1','pg_restore','-U','agent_local','-d',restoredName,'--exit-on-error','--no-owner','--no-acl'],{stdio:['pipe','ignore','pipe']});
    let error='';child.stderr.on('data',chunk=>{error+=String(chunk);});child.once('error',reject);child.once('close',code=>code===0?resolveRestore():reject(new Error(error)));child.stdin.end(snapshot.stdout);
   });
   const restoreUrl=new URL(source);restoreUrl.pathname=`/${restoredName}`;restored=new Pool({connectionString:restoreUrl.toString()});
   // pool.end()는 소켓 종료를 기다리지 않으므로, 아래 drop ... with(force)가 끊은 연결 오류를 처리되지 않은 'error'로 올리지 않게 받는다
   restored.on('error',()=>undefined);
   assert.equal((await restored.query('select customer_name from ap.inquiries where id=$1',[inquiry.id])).rows[0].customer_name,'PRIVATE_PURGE_CUSTOMER');
   process.env.AP_INQUIRY_MEDIA_DIRECTORY=resolve(root,'restored-media');
   const restoredMedia=createAgentInquiryMediaStore()!;await restoredMedia.put(objectKey,originalPhoto);
   const restorePath='../src/retention-restore.js';const {reapplyAgentRetentionJournal}=await import(restorePath);
   const checkpoint=await journal.checkpoint();
   const restoreRuntime={pool:restored,media:restoredMedia,journal,checkpoint};
   await assert.rejects(reapplyAgentRetentionJournal({...restoreRuntime,journal:new AgentRetentionJournal(resolve(root,'missing-journal'),journalSecret)}),{code:'ENOENT'});
   const filename=(await readdir(resolve(root,'journal'))).find(name=>name.endsWith('.json'))!;
   const path=resolve(root,'journal',filename),saved=await readFile(path);
   await rm(path);await assert.rejects(reapplyAgentRetentionJournal(restoreRuntime),/trusted checkpoint/);await writeFile(path,saved,{mode:0o600});
   const extra=await journal.append({jobId:job,organizationId:org!,targetKind:'inquiry',targetId:inquiry.id,scope:'work',action:'completed'});
   await assert.rejects(reapplyAgentRetentionJournal(restoreRuntime),/trusted checkpoint/);await rm(resolve(root,'journal',`${extra.id}.json`));
   const envelope=JSON.parse(checkpoint);envelope.data+=' ';
   await assert.rejects(reapplyAgentRetentionJournal({...restoreRuntime,checkpoint:JSON.stringify(envelope)}),/signature mismatch/);
   await mkdir(resolve(root,'unconfirmed'));
   const unconfirmed=new AgentRetentionJournal(resolve(root,'unconfirmed'),journalSecret);
   await unconfirmed.append({jobId:job,organizationId:org!,targetKind:'inquiry',targetId:inquiry.id,scope:'work',action:'file_prepared',attachmentId:photo,objectKey});
   await assert.rejects(reapplyAgentRetentionJournal({...restoreRuntime,journal:unconfirmed,checkpoint:await unconfirmed.checkpoint()}),/unconfirmed/);
   assert.ok(await restoredMedia.get(objectKey));
   assert.equal((await restored.query('select customer_name from ap.inquiries where id=$1',[inquiry.id])).rows[0].customer_name,'PRIVATE_PURGE_CUSTOMER');
   const result=await reapplyAgentRetentionJournal(restoreRuntime);assert.ok(result.applied>0);
   const checkpointFile=resolve(root,'protected-checkpoint.json');
   const baseEnv=Object.fromEntries(['PATH','HOME','TMPDIR','LANG'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
   const cliEnv={...baseEnv,AP_PROFILE:'mock',AP_DATABASE_URL:source.toString(),AP_RETENTION_JOURNAL_DIRECTORY:resolve(root,'journal'),AP_RETENTION_JOURNAL_SECRET:journalSecret,
    AP_INQUIRY_MEDIA_DIRECTORY:resolve(root,'media'),AP_RETENTION_RESTORE_DATABASE_URL:restoreUrl.toString(),AP_RETENTION_RESTORE_MEDIA_DIRECTORY:resolve(root,'restored-media'),
    AP_RETENTION_RESTORE_CHECKPOINT_FILE:checkpointFile,AP_RETENTION_CHECKPOINT_OUTPUT:checkpointFile};
   await promisify(execFile)('pnpm',['exec','tsx','src/retention-checkpoint-cli.ts','--quiesced'],{env:cliEnv});
   const cli=await promisify(execFile)('pnpm',['exec','tsx','src/retention-restore-cli.ts','--offline-restored'],{env:cliEnv});assert.match(cli.stdout,/applied: 0/);
   await assert.rejects(promisify(execFile)('pnpm',['exec','tsx','src/retention-restore-cli.ts','--offline-restored'],{env:{...cliEnv,AP_RETENTION_RESTORE_DATABASE_URL:source.toString().replace('127.0.0.1','localhost')}}),/restore target must differ/);
   await assert.rejects(promisify(execFile)('pnpm',['exec','tsx','src/retention-restore-cli.ts','--offline-restored'],{env:{...cliEnv,AP_RETENTION_RESTORE_MEDIA_DIRECTORY:resolve(root,'media')}}),/must differ from the active/);
   await assert.rejects(promisify(execFile)('pnpm',['exec','tsx','src/retention-checkpoint-cli.ts','--quiesced'],{env:{...cliEnv,AP_RETENTION_CHECKPOINT_OUTPUT:resolve(root,'journal','checkpoint.json')}}),/outside the retention journal/);

   assert.equal(await restoredMedia.get(objectKey),null);
   assert.equal((await restored.query('select customer_name from ap.inquiries where id=$1',[inquiry.id])).rows[0].customer_name,'[보존 기간 종료]');
   assert.equal((await reapplyAgentRetentionJournal({pool:restored,media:restoredMedia,journal,checkpoint})).applied,0);
   await assert.rejects(restored.query('update ap.inquiry_messages set body=$2 where inquiry_id=$1',[inquiry.id,'RESURRECT_RESTORED_BODY']),{code:'PAP01'});
  }finally{
   if(restored) await restored.end();await admin.query(`drop database if exists "${restoredName}" with(force)`);await admin.end();
   process.env.AP_INQUIRY_MEDIA_DIRECTORY=resolve(root,'media');
  }
  let syntheticPhone=1000;
  async function makeWork(days=200){
   const response=await app.inject({method:'POST',url:`/v1/public/organizations/${org}/inquiries`,payload:{name:'PRIVATE_FAULT_CUSTOMER',phone:`010-0000-${++syntheticPhone}`,message:'PRIVATE_FAULT_BODY',consent:true}});
   assert.equal(response.statusCode,201,response.body);const made=response.json(),auth={authorization:`Bearer ${made.receiptKey}`};
   const details=(await app.inject({url:`/v1/inquiries/${made.id}`,headers:auth})).json();
   const upload=await app.inject({method:'POST',url:`/v1/inquiries/${made.id}/messages/${details.messages[0].id}/attachments`,headers:{...auth,'content-type':'application/octet-stream'},payload:png});
   assert.equal(upload.statusCode,201,upload.body);
   const current=(await pool.query('select revision from ap.inquiries where id=$1',[made.id])).rows[0].revision;
   assert.equal((await post(`/v1/owner/inquiries/${made.id}/close`,{expectedRevision:current},owner)).statusCode,200);
   await pool.query("update ap.inquiries set created_at=now()-($2+1)*interval '1 day',retention_closed_at=now()-$2*interval '1 day' where id=$1",[made.id,days]);
   await pool.query("update ap.inquiry_messages set created_at=now()-($2+1)*interval '1 day' where inquiry_id=$1",[made.id,days]);
   await pool.query("update ap.inquiry_attachments set created_at=now()-($2+1)*interval '1 day' where inquiry_id=$1",[made.id,days]);
   return {...made,auth,photoId:upload.json().id,key:(await pool.query('select object_key from ap.inquiry_attachments where id=$1',[upload.json().id])).rows[0].object_key};
  }
  async function requestJob(id:string,scope:'photos'|'work'='work'){
   const preview=(await app.inject({url:`/v1/admin/retention/preview?organizationId=${org}&policyId=${policy}`,headers:headers()})).json();
   const candidate=preview.items.find((row:{targetId:string})=>row.targetId===id);assert.equal(candidate.reason,'due');
   const response=await post('/v1/admin/retention/jobs',{...body,targetId:id,scope,expectedRevision:candidate.revision,expectedAnchorAt:candidate.anchorAt});
   assert.equal(response.statusCode,201,response.body);return response.json().id as string;
  }
  async function approveJob(id:string){assert.equal((await post(`/v1/admin/retention/jobs/${id}/approve`,{reason:'다른 운영자가 합성 정리 범위를 승인합니다.'},approver)).statusCode,200);}
  const photoOnly=await makeWork(100),photoJob=await requestJob(photoOnly.id,'photos');await approveJob(photoJob);
  assert.equal(await runAgentRetentionJobOnce({pool,media,journal}),'completed');assert.equal(await media.get(photoOnly.key),null);
  const photoReceipt=(await app.inject({url:`/v1/inquiries/${photoOnly.id}`,headers:photoOnly.auth})).json();
  assert.equal(photoReceipt.retention.workPurgedAt,null);assert.ok(photoReceipt.retention.photosPurgedAt);
  assert.match(JSON.stringify(photoReceipt),/PRIVATE_FAULT_BODY/);
  assert.equal((await app.inject({method:'POST',url:`/v1/inquiries/${photoOnly.id}/messages`,headers:{...photoOnly.auth,'idempotency-key':randomBytes(32).toString('base64url')},payload:{body:'사진 정리 후 합성 문의를 다시 엽니다.'}})).statusCode,201);
  const metadataRace=await makeWork(100),metadataJob=await requestJob(metadataRace.id,'photos');await approveJob(metadataJob);
  const metadataPool=new Pool({connectionString:source.toString()}),metadataQuery=metadataPool.query.bind(metadataPool);
  metadataPool.query=(async(sql:string,values?:unknown[])=>{
   const result=await metadataQuery(sql,values);
   if(sql.includes('select id, message_id, byte_size')&&values?.[0]===metadataRace.id)
    assert.equal(await runAgentRetentionJobOnce({pool,media,journal}),'completed');
   return result;
  }) as typeof metadataPool.query;
  const metadataApp=createAgentApp(async()=>undefined,undefined,undefined,undefined,{pool:metadataPool,
   resolveUserId:async h=>typeof h['x-test-user']==='string'?h['x-test-user']:null,inquiryMedia:media});
  try{
   const details=await metadataApp.inject({url:`/v1/inquiries/${metadataRace.id}`,headers:metadataRace.auth});
   assert.equal(details.statusCode,200);assert.ok(details.json().retention.photosPurgedAt);
   assert.equal(details.json().attachments.length,0);assert.match(details.body,/PRIVATE_FAULT_BODY/);
  }finally{await metadataApp.close();await metadataPool.end();}
  async function verifySlowRead(path:(work:Awaited<ReturnType<typeof makeWork>>)=>string,ownerRead:boolean,expectedStatus:number){
   const work=await makeWork(),job=await requestJob(work.id);await approveJob(job);
   let releaseRead!:()=>void,readStarted!:()=>void;
   const waiting=new Promise<void>(resolve=>{releaseRead=resolve;}),started=new Promise<void>(resolve=>{readStarted=resolve;});
   const delayed=createAgentApp(async()=>undefined,undefined,undefined,undefined,{pool,
    resolveUserId:async h=>typeof h['x-test-user']==='string'?h['x-test-user']:null,
    inquiryMedia:{put:(key,bytes)=>media.put(key,bytes),delete:key=>media.delete(key),get:async key=>{
     const bytes=await media.get(key);if(key===work.key){readStarted();await waiting;}return bytes;
    }}});
   const response=delayed.inject({url:path(work),headers:ownerRead?headers(owner):work.auth}).then(result=>result);
   try{
    await started;assert.equal(await runAgentRetentionJobOnce({pool,media,journal}),'completed');
    releaseRead();const result=await response;assert.equal(result.statusCode,expectedStatus,result.body);
    assert.doesNotMatch(result.body,/PRIVATE_FAULT_BODY|PRIVATE_FAULT_CUSTOMER|dataBase64/);
   }finally{releaseRead();await response;await delayed.close();}
  }
  await verifySlowRead(work=>`/v1/inquiries/${work.id}/attachments/${work.photoId}`,false,404);
  await verifySlowRead(()=>`/v1/owner/organizations/${org}/inquiries/export`,true,409);
  const continued=(await app.inject({url:`/v1/inquiries/${photoOnly.id}`,headers:photoOnly.auth})).json();
  const newer=await app.inject({method:'POST',url:`/v1/inquiries/${photoOnly.id}/messages/${continued.messages.at(-1).id}/attachments`,headers:{...photoOnly.auth,'content-type':'application/octet-stream'},payload:png});
  assert.equal(newer.statusCode,201,newer.body);
  const newPhotoId=newer.json().id,newPhotoKey=`${org}/${newPhotoId}.webp`;
  const {reapplyAgentRetentionJournal}=await import('../src/retention-restore.js');
  await reapplyAgentRetentionJournal({pool,media,journal,checkpoint:await journal.checkpoint()});
  assert.ok(await media.get(newPhotoKey));
  assert.equal((await pool.query('select state from ap.inquiry_attachments where id=$1',[newPhotoId])).rows[0].state,'ready');
  async function verifyResponseGuard(kind:'photo'|'archive'|'detail'|'list'){
   const work=await makeWork(),job=await requestJob(work.id);await approveJob(job);
   const path=kind==='archive'?`/v1/owner/organizations/${org}/inquiries/export`:kind==='detail'?`/v1/owner/inquiries/${work.id}`:kind==='list'?'/v1/owner/inquiries':`/v1/inquiries/${work.id}/attachments/${work.photoId}`;
   let releaseResponse!:()=>void,ready!:()=>void;
   const paused=new Promise<void>(resolve=>{releaseResponse=resolve;}),reached=new Promise<void>(resolve=>{ready=resolve;});
   const guarded=createAgentApp(async()=>undefined,undefined,undefined,undefined,{pool,inquiryMedia:media,
    resolveUserId:async h=>typeof h['x-test-user']==='string'?h['x-test-user']:null});
   guarded.addHook('onSend',async(request,_reply,payload)=>{if(request.url===path){ready();await paused;}return payload;});
   const response=guarded.inject({url:path,headers:kind==='photo'?work.auth:headers(owner)}).then(result=>result);
   let cleanup:ReturnType<typeof runAgentRetentionJobOnce>|undefined;
   try{
    await reached;
    await assert.rejects(pool.query('select id from ap.inquiries where id=$1 for update nowait',[work.id]),{code:'55P03'});
    cleanup=runAgentRetentionJobOnce({pool,media,journal});
    assert.ok(await media.get(work.key));
    releaseResponse();assert.equal((await response).statusCode,200);
    assert.equal(await cleanup,'completed');assert.equal(await media.get(work.key),null);
   }finally{releaseResponse();await response;if(cleanup)await cleanup;await guarded.close();}
  }
  await verifyResponseGuard('photo');await verifyResponseGuard('archive');await verifyResponseGuard('detail');await verifyResponseGuard('list');
  const holdWork=await makeWork(),holdJob=await requestJob(holdWork.id);await approveJob(holdJob);
  const hold=await post('/v1/admin/retention/holds',{organizationId:org,targetKind:'inquiry',targetId:holdWork.id,reasonCode:'dispute',reason:'승인 후 합성 분쟁 보류를 새로 확인합니다.',reference:'SYNTHETIC-LATE-HOLD',reviewDueAt:new Date(Date.now()-86400000).toISOString()});assert.equal(hold.statusCode,201,hold.body);
  assert.equal(await runAgentRetentionJobOnce({pool,media,journal}),'blocked');
  assert.equal((await pool.query('select last_error from ap.work_retention_jobs where id=$1',[holdJob])).rows[0].last_error,'active_hold');assert.ok(await media.get(holdWork.key));
  const staleWork=await makeWork(),staleJob=await requestJob(staleWork.id);await approveJob(staleJob);
  await pool.query("update ap.inquiry_messages set body='PRIVATE_CHANGED_BASIS' where inquiry_id=$1",[staleWork.id]);
  assert.equal(await runAgentRetentionJobOnce({pool,media,journal}),'blocked');assert.equal((await pool.query('select state from ap.work_retention_jobs where id=$1',[staleJob])).rows[0].state,'stale');assert.ok(await media.get(staleWork.key));
  const unconfirmed=await makeWork(),retryJob=await requestJob(unconfirmed.id);await approveJob(retryJob);
  assert.equal(await runAgentRetentionJobOnce({pool,media:{put:(key,bytes)=>media.put(key,bytes),delete:async()=>undefined,get:key=>media.get(key)},journal}),'retry');
  assert.ok(await media.get(unconfirmed.key));assert.equal((await pool.query('select retention_work_purged_at from ap.inquiries where id=$1',[unconfirmed.id])).rows[0].retention_work_purged_at,null);
  await pool.query('update ap.work_retention_jobs set next_attempt_at=clock_timestamp() where id=$1',[retryJob]);
  assert.equal(await runAgentRetentionJobOnce({pool,media,journal}),'completed');assert.equal(await media.get(unconfirmed.key),null);
  const receiptWork=await makeWork(),receiptJob=await requestJob(receiptWork.id);await approveJob(receiptJob);
  assert.equal(await runAgentRetentionJobOnce({pool,media,journal:{read:()=>journal.read(),append:async entry=>{if(entry.action==='completed') throw new Error('synthetic_receipt_unavailable');return journal.append(entry);}}}),'receipt_pending');
  assert.equal((await pool.query('select state,last_error from ap.work_retention_jobs where id=$1',[receiptJob])).rows[0].state,'completed');assert.equal(await media.get(receiptWork.key),null);
  await pool.query('update ap.work_retention_jobs set next_attempt_at=clock_timestamp() where id=$1',[receiptJob]);assert.equal(await runAgentRetentionJobOnce({pool,media,journal}),'completed');
  const canceled=await makeWork(),canceledJob=await requestJob(canceled.id);
  assert.equal((await post(`/v1/admin/retention/jobs/${canceledJob}/cancel`,{reason:'합성 자료 정리 승인을 기다리기 전에 취소합니다.'})).statusCode,200);
  assert.equal(await runAgentRetentionJobOnce({pool,media,journal}),'empty');assert.ok(await media.get(canceled.key));
  await app.inject({method:'PUT',url:'/v1/agents/draft',headers:headers(owner),payload:{expectedRevision:0,name:'합성 익명 상담',tone:'clear',guideScope:'승인된 정보',handoffText:'담당자가 확인합니다.'}});
  assert.equal((await post('/v1/agents/releases',{expectedRevision:1,expectedKnowledgeRevision:1},owner)).statusCode,201);
  const link=(await post('/v1/deployments',{kind:'link'},owner)).json();await post(`/v1/deployments/${link.id}/activate`,{},owner);
  const anon=await app.inject({method:'POST',url:`/v1/public/deployments/${link.publicId}/engagements`});assert.equal(anon.statusCode,201,anon.body);
  const anonymous=anon.json().id,cookie=anon.headers['set-cookie']?.toString().split(';')[0];
  await pool.query("update ap.inquiries set created_at=now()-interval '31 days' where id=$1",[anonymous]);
  const agent=(await pool.query('select agent_release_id,knowledge_release_id from ap.inquiries where id=$1',[anonymous])).rows[0],run=randomUUID();
  await pool.query(`insert into ap.ai_runs(id,organization_id,agent_release_id,knowledge_release_id,kind,question,status,answer,input_tokens,output_tokens,inquiry_id,inquiry_revision,started_at)
    values($1,$2,$3,$4,'customer_message','PRIVATE_ANONYMOUS_QUESTION','completed','{"answer":"PRIVATE_AI_ANSWER"}',42,4,$5,1,now()-interval '31 days')`,[run,org,agent.agent_release_id,agent.knowledge_release_id,anonymous]);
  const anonymousJob=await requestJob(anonymous);await approveJob(anonymousJob);assert.equal(await runAgentRetentionJobOnce({pool,media,journal}),'completed');
  const ledger=(await pool.query('select question,answer,input_tokens,output_tokens,status from ap.ai_runs where id=$1',[run])).rows[0];
  assert.equal(ledger.question,'[보존 기간 종료]');assert.equal(ledger.answer,null);assert.equal(ledger.input_tokens,42);assert.equal(ledger.status,'completed');
  const endedAI=await app.inject({url:`/v1/engagements/${anonymous}`,headers:{cookie}});assert.equal(endedAI.statusCode,200,endedAI.body);assert.ok(endedAI.json().retention.workPurgedAt);
  assert.equal((await app.inject({method:'POST',url:`/v1/engagements/${anonymous}/messages`,headers:{cookie},payload:{question:'종료된 합성 상담에 새 질문을 합니다.'}})).statusCode,410);
  const currentEnded=await app.inject({url:`/v1/public/deployments/${link.publicId}/engagements/current`,headers:{cookie}});
  assert.ok(currentEnded.json().engagement.retention.workPurgedAt);
  const newSession=await app.inject({method:'POST',url:`/v1/public/deployments/${link.publicId}/engagements`,headers:{cookie}});assert.equal(newSession.statusCode,201,newSession.body);assert.notEqual(newSession.json().id,anonymous);
  const embed=(await post('/v1/deployments',{kind:'owned_embed',origin:'https://synthetic-retention.example.invalid'},owner)).json();
  // This isolated test fixture supplies local verification state; it is not DNS evidence.
  assert.equal((await post(`/v1/deployments/${embed.id}/verify`,{},owner)).statusCode,200);
  assert.equal((await post(`/v1/deployments/${embed.id}/activate`,{},owner)).statusCode,200);
  const frame=await app.inject({url:`/embed/v1/${embed.publicId}/frame`,headers:{referer:'https://synthetic-retention.example.invalid/'}});
  const nonce=frame.body.match(/const handshakeNonce = "([^"]+)";/)?.[1];assert.ok(nonce);
  const embedSession=(await post('/v1/embed/sessions',{nonce},owner)).json();
  const embedAuth={authorization:`Bearer ${embedSession.token}`};
  const begun=await app.inject({method:'POST',url:'/v1/embed/engagements',headers:embedAuth});assert.equal(begun.statusCode,201,begun.body);
  const embedId=begun.json().id;
  const oldHandoff=await app.inject({method:'POST',url:'/v1/embed/handoffs',headers:embedAuth,payload:{question:'이전 대화의 질문입니다.',conditions:'이전 희망 조건입니다.'}});
  assert.equal(oldHandoff.statusCode,201,oldHandoff.body);
  await pool.query("update ap.inquiries set created_at=now()-interval '31 days' where id=$1",[embedId]);
  const embedJob=await requestJob(embedId);await approveJob(embedJob);assert.equal(await runAgentRetentionJobOnce({pool,media,journal}),'completed');
  const embedCurrent=await app.inject({url:`/v1/public/deployments/${embed.publicId}/engagements/current`,headers:embedAuth});
  assert.equal(embedCurrent.statusCode,200,embedCurrent.body);assert.ok(embedCurrent.json().engagement.retention.workPurgedAt);
  assert.ok((await app.inject({url:`/v1/engagements/${embedId}`,headers:embedAuth})).json().retention.workPurgedAt);
  const endedWidgetQuestion=await app.inject({method:'POST',url:`/v1/engagements/${embedId}/messages`,headers:embedAuth,payload:{question:'종료된 위젯에서 새 질문을 합니다.'}});
  assert.equal(endedWidgetQuestion.statusCode,410,endedWidgetQuestion.body);
  assert.equal(endedWidgetQuestion.json().error,'retention_work_ended');
  const endedWidgetRecovery=await app.inject({url:`/v1/engagements/${embedId}/messages/recover`,headers:{...embedAuth,'idempotency-key':randomBytes(32).toString('base64url')}});
  assert.equal(endedWidgetRecovery.statusCode,410,endedWidgetRecovery.body);
  assert.equal(endedWidgetRecovery.json().error,'retention_work_ended');
  const endedStart=await app.inject({method:'POST',url:'/v1/embed/engagements',headers:embedAuth});
  assert.equal(endedStart.statusCode,410,endedStart.body);
  assert.equal(endedStart.json().id,embedId);
  assert.equal(endedStart.json().error,'retention_work_ended');
  const priorProvider=runtime.modelProvider;
  runtime.modelProvider=undefined;
  assert.equal((await app.inject({method:'POST',url:'/v1/embed/engagements',headers:embedAuth})).statusCode,410);
  runtime.modelProvider=priorProvider;runtime.customerDailyLimit=0;
  assert.equal((await app.inject({method:'POST',url:'/v1/embed/engagements',headers:embedAuth})).statusCode,410);
  runtime.customerDailyLimit=10;
  const ticketsBefore=(await pool.query('select count(*)::int as count from ap.embed_handoffs where session_id=(select id from ap.embed_sessions where token_hash=$1)',[createHash('sha256').update(embedSession.token).digest('hex')])).rows[0].count;
  const endedHandoff=await app.inject({method:'POST',url:'/v1/embed/handoffs',headers:embedAuth,payload:{question:'종료된 위젯에서 사람에게 문의합니다.'}});
  assert.equal(endedHandoff.statusCode,410,endedHandoff.body);
  assert.equal((await pool.query('select count(*)::int as count from ap.embed_handoffs where session_id=(select id from ap.embed_sessions where token_hash=$1)',[createHash('sha256').update(embedSession.token).digest('hex')])).rows[0].count,ticketsBefore);
  assert.equal((await app.inject({method:'POST',url:'/v1/embed/engagements',headers:embedAuth,payload:{startNewFrom:'not-a-uuid'}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:'/v1/embed/engagements',headers:embedAuth,payload:{startNewFrom:randomUUID()}})).statusCode,409);
  const countBefore=(await pool.query('select count(*)::int as count from ap.inquiries where deployment_id=$1',[embed.id])).rows[0].count;
  const restarted=await app.inject({method:'POST',url:'/v1/embed/engagements',headers:embedAuth,payload:{startNewFrom:embedId}});
  assert.equal(restarted.statusCode,201,restarted.body);assert.notEqual(restarted.json().id,embedId);
  const newEmbedId=restarted.json().id;
  const oldContinue=await app.inject({method:'POST',url:'/v1/embed/continue',headers:{origin:'http://localhost:3001'},payload:{ticket:oldHandoff.json().ticket}});
  assert.equal(oldContinue.statusCode,410,oldContinue.body);
  assert.equal(oldContinue.json().error,'ticket_expired_or_used');
  assert.equal((await pool.query('select transferred_at from ap.embed_sessions where token_hash=$1',[createHash('sha256').update(embedSession.token).digest('hex')])).rows[0].transferred_at,null);
  assert.equal((await app.inject({method:'POST',url:'/v1/embed/engagements',headers:embedAuth,payload:{startNewFrom:embedId}})).statusCode,409);
  const restartedCurrent=await app.inject({url:`/v1/public/deployments/${embed.publicId}/engagements/current`,headers:embedAuth});
  assert.equal(restartedCurrent.json().engagement.id,newEmbedId);
  assert.deepEqual(restartedCurrent.json().engagement.messages,[]);
  assert.equal((await pool.query('select count(*)::int as count from ap.inquiries where deployment_id=$1',[embed.id])).rows[0].count,countBefore+1);
  assert.equal((await app.inject({method:'POST',url:'/v1/embed/engagements',headers:embedAuth,payload:{startNewFrom:newEmbedId}})).statusCode,409);
  const baseEnv=Object.fromEntries(['PATH','HOME','TMPDIR','LANG'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
  const independent=await promisify(execFile)('pnpm',['exec','tsx','src/retention-purge-worker.ts','--once'],{env:{...baseEnv,AP_PROFILE:'mock',AP_DATABASE_URL:source.toString(),
    AP_INQUIRY_MEDIA_DIRECTORY:resolve(root,'media'),AP_RETENTION_JOURNAL_DIRECTORY:resolve(root,'journal'),AP_RETENTION_JOURNAL_SECRET:journalSecret}});
  assert.match(independent.stdout,/agent retention worker ready/);assert.match(independent.stdout,/agent retention: empty/);
  await assert.rejects(promisify(execFile)('pnpm',['exec','tsx','src/retention-purge-worker.ts','--once'],{env:{...baseEnv,AP_PROFILE:'mock',AP_DATABASE_URL:source.toString(),
    AP_INQUIRY_MEDIA_DIRECTORY:resolve(root,'media'),AP_RETENTION_JOURNAL_DIRECTORY:resolve(root,'missing-startup-journal'),AP_RETENTION_JOURNAL_SECRET:journalSecret}}),/ENOENT/);


 }finally{
  await app.close();
  if(org) await pool.query('delete from ap.organizations where id=$1',[org]);
  await pool.query('delete from ap.work_retention_policies where requested_by=any($1::text[])',[users]);
  await pool.query('delete from "user" where id=any($1::text[])',[users]); await pool.end();
  if(priorMedia===undefined) delete process.env.AP_INQUIRY_MEDIA_DIRECTORY;else process.env.AP_INQUIRY_MEDIA_DIRECTORY=priorMedia;
  await rm(root,{recursive:true,force:true});
 }
});
