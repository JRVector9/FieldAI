import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, rename, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));

test('AP native revocations preserve customer work and remain revoked after isolated PG17 restore', async () => {
  const previous=process.env.AP_PROFILE;process.env.AP_PROFILE='mock';
  const source=new URL(process.env.AP_DATABASE_URL!);assert.match(source.pathname,/^\/fieldai_agent_test_[a-f0-9]+$/);
  const database=`fieldai_agent_test_${randomUUID().replaceAll('-','')}`;
  const adminUrl=new URL(source);adminUrl.pathname='/postgres';const admin=new Pool({connectionString:adminUrl.toString()});
  await admin.query(`create database "${database}"`);source.pathname=`/${database}`;
  await promisify(execFile)(process.execPath,['tools/run-migrations.mjs','agent'],{cwd:resolve('../..'),env:{...process.env,AP_DATABASE_URL:source.toString()}});
  const pool=new Pool({connectionString:source.toString()});
  const root=await mkdtemp(resolve(tmpdir(),'agent-revocation-')),journalRoot=resolve(root,'journal');await mkdir(journalRoot);
  let journal:import('../src/revocation-journal.js').AgentRevocationJournal|undefined;
  const owner=randomUUID(),outsider=randomUUID(),session=randomUUID(),client=randomUUID();
  const selection=randomUUID(),otherSelection=randomUUID(),connection=randomUUID(),incomingConnection=randomUUID(),incomingId=randomUUID();
  const bearer=randomBytes(32).toString('base64url'),tokenKey=randomBytes(32),eventKey=randomUUID(),eventSecret=randomBytes(32);
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(tokenKey).update('ap-field-event-route-v1').digest(),iv);
  const eventCipher=Buffer.concat([iv,cipher.update(eventSecret.toString('base64url')),cipher.final(),cipher.getAuthTag()]);
  const restoreDb=`fieldai_agent_restore_${randomUUID().replaceAll('-','')}`;
  let restored:Pool|undefined,restoredApp:ReturnType<typeof createAgentApp>|undefined;
  let rejectJournal=true,org:string|undefined;
  const runtime={pool,revocationJournal:{read:async()=>journal?journal.read():[],append:async(intent:Parameters<import('../src/revocation-journal.js').AgentRevocationJournal['append']>[0])=>{
    if(rejectJournal||!journal)throw new Error('synthetic disk unavailable');return journal.append(intent);
  }},resolveUserId:async(headers:Record<string,unknown>)=>headers['x-test-user']===outsider?outsider:owner,
    resolveSession:async(headers:Record<string,unknown>)=>({id:session,userId:headers['x-test-user']===outsider?outsider:owner}),
    fieldConnector:{issuer:'http://127.0.0.1:4321/api/auth',clientId:'synthetic',clientSecret:'synthetic',tokenKey,
      redirectUri:'http://127.0.0.1:4311/v1/connections/field/callback',webOrigin:'http://localhost:3001'}};
  const app=createAgentApp(async()=>undefined,undefined,undefined,undefined,runtime);
  try{
    for(const user of [owner,outsider])await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',[user,'Synthetic AP restore actor',`${user}@example.invalid`]);
    await pool.query('insert into "session"(id,"userId",token,"expiresAt","createdAt","updatedAt") values($1,$2,$3,now()+interval \'1 day\',now(),now())',[session,owner,randomUUID()]);
    const made=await app.inject({method:'POST',url:'/v1/organizations',payload:{name:'합성 AP 회수 복원 조직'}});assert.equal(made.statusCode,201,made.body);org=made.json().id;
    assert.equal((await app.inject({method:'PUT',url:'/v1/knowledge/draft',payload:{expectedRevision:0,businessName:'합성 AP 회수 복원 조직',introduction:'안내',region:'',openingHours:'',services:[{name:'문의',description:'문의'}],faqs:[]}})).statusCode,200);
    assert.equal((await app.inject({method:'POST',url:'/v1/knowledge/releases',payload:{expectedRevision:1}})).statusCode,201);
    assert.equal((await app.inject({method:'PUT',url:'/v1/agents/draft',payload:{expectedRevision:0,name:'합성 AP 상담',tone:'clear',guideScope:'승인된 정보',handoffText:'담당자가 확인합니다.'}})).statusCode,200);
    const release=await app.inject({method:'POST',url:'/v1/agents/releases',payload:{expectedRevision:1,expectedKnowledgeRevision:1}});assert.equal(release.statusCode,201,release.body);
    const agent=(await pool.query('select agent_id from ap.agent_releases where organization_id=$1',[org])).rows[0].agent_id;
    await pool.query('insert into "oauthClient"(id,"clientId","redirectUris") values($1,$2,\'[]\')',[client,client]);
    for(const id of [selection,otherSelection]){
      await pool.query(`insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,agent_id,requested_scopes,selection_expires_at)
        values($1,$2,$3,$4,$5,$6,array['ap.agent.read'],now()+interval '1 day')`,[id,session,owner,client,org,agent]);
      await pool.query(`insert into "oauthConsent"(id,"clientId","userId","referenceId",scopes,"createdAt","updatedAt") values($1,$2,$3,$4,'["ap.agent.read"]',now(),now())`,[randomUUID(),client,owner,id]);
      await pool.query(`insert into "oauthRefreshToken"(id,token,"clientId","userId","referenceId","expiresAt","createdAt",scopes) values($1,$2,$3,$4,$5,now()+interval '1 day',now(),'["ap.agent.read"]')`,[randomUUID(),randomUUID(),client,owner,id]);
    }
    await pool.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId",resources,"expiresAt","createdAt",scopes)
      values($1,$2,$3,$4,$5,'["http://127.0.0.1:4311/integrations/v1"]',now()+interval '1 hour',now(),'["ap.agent.read"]')`,[randomUUID(),createHash('sha256').update(bearer).digest('base64url'),client,owner,selection]);
    for(const id of [connection,incomingConnection])await pool.query(`insert into ap.field_connections(id,ap_grant_id,ap_organization_id,ap_agent_id,initiator_user_id,
      field_issuer,field_client_id,field_grant_id,field_organization_id,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status,event_key_id,event_secret_cipher)
      values($1,$2,$3,$4,$5,'http://127.0.0.1:4321/api/auth','synthetic','synthetic','synthetic',array[]::text[],$6,$6,now()+interval '1 hour','review_required',$7,$8)`,
      [id,selection,org,agent,owner,Buffer.from('synthetic-not-a-real-token'),eventKey,eventCipher]);
    const inquiry=await app.inject({method:'POST',url:`/v1/public/organizations/${org}/inquiries`,payload:{name:'PRESERVED_REVOKE_CUSTOMER',phone:'010-1234-5678',message:'PRESERVED_REVOKE_MESSAGE',consent:true}});assert.equal(inquiry.statusCode,201,inquiry.body);
    assert.equal((await app.inject({url:'/integrations/v1/me',headers:{authorization:`Bearer ${bearer}`}})).statusCode,200);
    const snapshot=await promisify(execFile)('docker',['exec','fieldai-agent-mock-db-1','pg_dump','-U','agent_local','-d',source.pathname.slice(1),'-Fc','--no-owner','--no-acl'],{encoding:'buffer',maxBuffer:32*1024*1024});
    assert.ok(snapshot.stdout.length);
    const localPath=`/v1/connections/field/${connection}/revoke`;
    assert.equal((await app.inject({method:'POST',url:localPath,headers:{'x-test-user':outsider}})).statusCode,404);
    assert.equal((await app.inject({method:'POST',url:localPath})).statusCode,503);
    assert.equal((await pool.query('select status from ap.field_connections where id=$1',[connection])).rows[0].status,'review_required');
    const module=await import('../src/revocation-journal.js');journal=new module.AgentRevocationJournal(journalRoot,'synthetic-agent-revocation-secret');rejectJournal=false;
    const revoked=await app.inject({method:'POST',url:localPath});assert.equal(revoked.statusCode,200,revoked.body);
    assert.equal((await app.inject({method:'POST',url:localPath})).json().revocationId,revoked.json().revocationId);assert.equal((await journal.read()).length,1);
    const at=String(Math.floor(Date.now()/1000));
    const remotePath=`/integrations/v1/connections/${incomingConnection}/revoke`,remoteHeaders={'x-key-id':eventKey,'x-revocation-id':incomingId,'x-timestamp':at,'x-signature-version':'2','x-signature':createHmac('sha256',eventSecret).update(`v2:field->ap.${at}.${incomingId}.${incomingConnection}.revoke`).digest('hex')};
    assert.equal((await app.inject({method:'POST',url:remotePath,headers:{...remoteHeaders,'x-signature':'a'.repeat(64)}})).statusCode,401);
    assert.equal((await app.inject({method:'POST',url:remotePath,headers:remoteHeaders})).statusCode,200);
    assert.equal((await app.inject({method:'POST',url:remotePath,headers:remoteHeaders})).statusCode,200);
    assert.equal((await journal.read()).length,2);
    // A provider already revoking a token must not acquire its parent after the token row lock.
    const authority=await pool.connect(),provider=await pool.connect();
    try{
      await authority.query('begin');await authority.query('select id from ap.oauth_selections where id=$1 for update',[otherSelection]);
      await provider.query('begin');await provider.query("set local statement_timeout='300ms'");
      await assert.rejects(provider.query('update "oauthRefreshToken" set "expiresAt"="expiresAt" where "referenceId"=$1',[otherSelection]),{code:'55P03'});
      await provider.query('rollback');await provider.query('begin');await provider.query("set local statement_timeout='300ms'");
      await provider.query('update "oauthRefreshToken" set revoked=now() where "referenceId"=$1',[otherSelection]);
      await provider.query('commit');
    }finally{await provider.query('rollback');await authority.query('rollback');provider.release();authority.release();}
    // Simulate fsync completed but DB commit lost; retry adopts the same durable intent.
    await journal.append({organizationId:org!,targetKind:'selection',targetId:otherSelection,selectionId:otherSelection,source:'owner',revocationId:null});
    const minting=await pool.connect();await minting.query('begin');const lateToken=randomUUID();
    await minting.query(`insert into "oauthRefreshToken"(id,token,"clientId","userId","referenceId","expiresAt","createdAt",scopes)
      values($1,$2,$3,$4,$5,now()+interval '1 day',now(),'["ap.agent.read"]')`,[lateToken,randomUUID(),client,owner,otherSelection]);
    let revokeSettled=false;
    const pending=app.inject({method:'POST',url:`/integrations/v1/authorization/selections/${otherSelection}/revoke`}).then(response=>{revokeSettled=true;return response;});
    await new Promise(observe=>setTimeout(observe,40));const beforeCommit=revokeSettled;
    await minting.query('commit');minting.release();assert.equal((await pending).statusCode,200);assert.equal(beforeCommit,false);
    assert.ok((await pool.query('select revoked from "oauthRefreshToken" where id=$1',[lateToken])).rows[0].revoked);

    assert.equal((await journal.read()).length,3);
    const receipt=await app.inject({url:`/v1/inquiries/${inquiry.json().id}`,headers:{authorization:`Bearer ${inquiry.json().receiptKey}`}});assert.equal(receipt.statusCode,200);assert.match(receipt.body,/PRESERVED_REVOKE_MESSAGE/);
    const entries=await journal.read(),checkpoint=await journal.checkpoint();
    const checkpointFile=resolve(root,'trusted-checkpoint');
    const cliEnv={...process.env,AP_DATABASE_URL:source.toString(),AP_PROFILE:'mock',AP_REVOCATION_JOURNAL_DIRECTORY:journalRoot,
      AP_REVOCATION_JOURNAL_SECRET:'synthetic-agent-revocation-secret',AP_REVOCATION_CHECKPOINT_OUTPUT:checkpointFile};
    const command=(name:string,flag:string,env:Record<string,string|undefined>=cliEnv)=>promisify(execFile)(process.execPath,['--import','tsx',`src/${name}.ts`,flag],{env});
    await command('revocation-checkpoint-cli','--quiesced');assert.equal((await journal.verifiedEntries(await readFile(checkpointFile,'utf8'))).length,3);
    const rejectCli=(name:string,flag:string,env:Record<string,string|undefined>,message:RegExp)=>assert.rejects(
      promisify(execFile)(process.execPath,['--import','tsx',`src/${name}.ts`,flag],{env}),
      (error:unknown)=>Boolean(error&&typeof error==='object'&&'stderr' in error&&message.test(String(error.stderr))));
    await rejectCli('revocation-checkpoint-cli','--quiesced',{...cliEnv,AP_REVOCATION_CHECKPOINT_OUTPUT:resolve(journalRoot,'inside')},/outside/);
    await assert.rejects(pool.query('delete from ap.revocation_journal_receipts'),{code:'PJR01'});

    assert.doesNotMatch(JSON.stringify(entries),/PRESERVED_REVOKE_MESSAGE|synthetic-not-a-real-token|010-1234/);
    const removed=entries[0]!.id;
    const liveOriginal=await readFile(resolve(journalRoot,`${removed}.json`),'utf8');
    await writeFile(resolve(journalRoot,`${removed}.json`),liveOriginal.replace('agent','field'));
    assert.equal((await app.inject({method:'POST',url:localPath})).statusCode,503);
    assert.equal((await app.inject({method:'POST',url:localPath})).statusCode,503,'failed signature validation must invalidate the cached proof');
    await writeFile(resolve(journalRoot,`${removed}.json`),liveOriginal);
    assert.equal((await app.inject({method:'POST',url:localPath})).statusCode,200);

    await rename(resolve(journalRoot,`${removed}.json`),resolve(root,'removed'));
    assert.equal((await app.inject({method:'POST',url:localPath})).statusCode,503);
    await rejectCli('revocation-checkpoint-cli','--quiesced',{...cliEnv,AP_REVOCATION_CHECKPOINT_OUTPUT:resolve(root,'incomplete')},/continuity/);
    await rename(resolve(root,'removed'),resolve(journalRoot,`${removed}.json`));
    await admin.query(`create database "${restoreDb}"`);
    await new Promise<void>((done,fail)=>{
      const child=spawn('docker',['exec','-i','fieldai-agent-mock-db-1','pg_restore','-U','agent_local','-d',restoreDb,'--exit-on-error','--no-owner','--no-acl'],{stdio:['pipe','ignore','pipe']});
      let error='';child.stderr.on('data',data=>{error+=data.toString();});child.once('error',fail);child.once('exit',code=>code===0?done():fail(new Error(error)));child.stdin.end(snapshot.stdout);
    });
    const restoreUrl=new URL(source);restoreUrl.pathname=`/${restoreDb}`;restored=new Pool({connectionString:restoreUrl.toString()});
    restoredApp=createAgentApp(async()=>undefined,undefined,undefined,undefined,{...runtime,pool:restored});
    assert.equal((await restoredApp.inject({url:'/integrations/v1/me',headers:{authorization:`Bearer ${bearer}`}})).statusCode,200);
    const restoreModule=await import('../src/revocation-restore.js').catch(()=>null);assert.ok(restoreModule,'AP revocation restore implementation is required');
    const replay=()=>restoreModule.reapplyAgentRevocationJournal(restored!,journal!,checkpoint);
    await rename(resolve(journalRoot,`${removed}.json`),resolve(root,'removed'));
    await assert.rejects(replay(),/trusted checkpoint/);
    assert.equal((await restored.query('select status from ap.field_connections where id=$1',[connection])).rows[0].status,'review_required');
    await rename(resolve(root,'removed'),resolve(journalRoot,`${removed}.json`));
    const original=await readFile(resolve(journalRoot,`${removed}.json`),'utf8');
    await writeFile(resolve(journalRoot,`${removed}.json`),original.replace('agent','field'));
    await assert.rejects(replay(),/signature mismatch/);await writeFile(resolve(journalRoot,`${removed}.json`),original);
    await rename(journalRoot,resolve(root,'missing-journal'));await assert.rejects(replay(),{code:'ENOENT'});await rename(resolve(root,'missing-journal'),journalRoot);
    const extra=await journal.append({organizationId:org!,targetKind:'selection',targetId:selection,selectionId:selection,source:'owner',revocationId:null});
    await assert.rejects(replay(),/trusted checkpoint/);await rm(resolve(journalRoot,`${extra.id}.json`));
    await assert.rejects(restoreModule.reapplyAgentRevocationJournal(restored,journal,checkpoint.replace('revocation-checkpoint','wrong-purpose')),/signature mismatch/);
    await restored.query('create schema field');await assert.rejects(replay(),/isolated AP/);await restored.query('drop schema field');
    await restored.query('update ap.field_connections set ap_grant_id=$2 where id=$1',[connection,otherSelection]);
    await assert.rejects(replay(),/binding mismatch/);assert.equal((await restored.query('select count(*)::integer as n from ap.revocation_restore_audit')).rows[0].n,0);
    await restored.query('update ap.field_connections set ap_grant_id=$2 where id=$1',[connection,selection]);
    const activeAlias=new URL(source);activeAlias.hostname='localhost';
    await rejectCli('revocation-restore-cli','--offline-restored',{...cliEnv,AP_REVOCATION_RESTORE_DATABASE_URL:activeAlias.toString(),AP_REVOCATION_RESTORE_CHECKPOINT_FILE:checkpointFile},/must differ from the active/);
    const wrongPort=new URL(restoreUrl);wrongPort.port='55432';
    await rejectCli('revocation-restore-cli','--offline-restored',{...cliEnv,AP_REVOCATION_RESTORE_DATABASE_URL:wrongPort.toString(),AP_REVOCATION_RESTORE_CHECKPOINT_FILE:checkpointFile},/local AP mock/);
    const appliedCli=await command('revocation-restore-cli','--offline-restored',{...cliEnv,AP_REVOCATION_RESTORE_DATABASE_URL:restoreUrl.toString(),AP_REVOCATION_RESTORE_CHECKPOINT_FILE:checkpointFile});
    assert.match(appliedCli.stdout,/applied: 3; entries: 3/);assert.equal((await replay()).applied,0);
    for(const id of [connection,incomingConnection])assert.deepEqual((await restored.query('select status,access_token_cipher,refresh_token_cipher from ap.field_connections where id=$1',[id])).rows[0],{status:'revoked',access_token_cipher:null,refresh_token_cipher:null});
    assert.deepEqual((await restored.query('select id,state,last_error from ap.field_remote_revocations where connection_id=$1',[connection])).rows[0],{id:revoked.json().revocationId,state:'blocked',last_error:'restore_remote_reconciliation_required'});
    assert.equal((await restored.query('select id from ap.field_connection_revocations where connection_id=$1',[incomingConnection])).rows[0].id,incomingId);
    assert.equal((await restoredApp.inject({method:'POST',url:remotePath,headers:remoteHeaders})).statusCode,200);
    assert.equal((await restoredApp.inject({url:'/integrations/v1/me',headers:{authorization:`Bearer ${bearer}`}})).statusCode,401);
    assert.equal((await restored.query('select count(*)::integer as n from "oauthRefreshToken" where "referenceId"=any($1::text[]) and revoked is null',[[selection,otherSelection]])).rows[0].n,0);
    assert.equal((await restored.query('select count(*)::integer as n from "oauthConsent" where "referenceId"=any($1::text[])',[[selection,otherSelection]])).rows[0].n,0);
    await assert.rejects(restored.query("update ap.field_connections set status='review_required',access_token_cipher=$2,refresh_token_cipher=$2 where id=$1",[connection,Buffer.from('late-synthetic-token')]),{code:'PAP02'});
    await assert.rejects(restored.query('update ap.oauth_selections set revoked_at=null where id=$1',[selection]),{code:'PAP02'});
    const preserved=await restoredApp.inject({url:`/v1/inquiries/${inquiry.json().id}`,headers:{authorization:`Bearer ${inquiry.json().receiptKey}`}});assert.equal(preserved.statusCode,200);assert.match(preserved.body,/PRESERVED_REVOKE_MESSAGE/);
  }finally{
    await restoredApp?.close();await restored?.end();await admin.query(`drop database if exists "${restoreDb}"`);
    await app.close();if(org)await pool.query('delete from ap.organizations where id=$1',[org]);
    await pool.query('delete from "oauthClient" where "clientId"=$1',[client]);await pool.query('delete from "user" where id=any($1::text[])',[[owner,outsider]]);
    journal?.close();await pool.end();await admin.query(`drop database "${database}"`);await admin.end();await rm(root,{recursive:true,force:true});process.env.AP_PROFILE=previous;
  }
});
