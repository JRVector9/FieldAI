import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { after, test } from 'node:test';

// pg-pool의 end()는 소켓 종료를 기다리지 않아 종료 직후 pg_stat_activity에 연결이 잠깐 남을 수 있다(CI 1회 재현). 최대 2초 기다린 뒤 0을 단언한다.
async function assertNoConnections(admin:{query:(text:string,values:unknown[])=>Promise<{rows:{n:number}[]}>},databaseName:string){
  let n=-1;for(let i=0;i<40;i++){n=(await admin.query('select count(*)::int n from pg_stat_activity where datname=$1',[databaseName])).rows[0]!.n;if(n===0)break;await new Promise(done=>setTimeout(done,50));}
  assert.equal(n,0);
}

const root = await mkdtemp(resolve(tmpdir(), 'field-oauth-lifecycle-'));
const journalRoot = resolve(root, 'journal'); await mkdir(journalRoot);
process.env.FIELD_REVOCATION_JOURNAL_DIRECTORY = journalRoot;
process.env.FIELD_REVOCATION_JOURNAL_SECRET = 'synthetic-field-lifecycle-journal-secret';
const { auth, authPool: pool } = await import('../src/auth.js');
after(async () => { await pool.end(); });
const base = new URL('/api/auth', process.env.FIELD_AUTH_BASE_URL!).toString();
const resource = new URL('/integrations/v1', base).toString();
const digest = (value: string) => createHash('sha256').update(value).digest('base64url');

async function fixture() {
  const post = (path: string, body: object, cookie?: string) => auth.handler(new Request(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: new URL(base).origin,
      ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }));
  const signup = await post('/sign-up/email', { email: `${randomUUID()}@example.invalid`,
    password: 'Synthetic-only-password-123!', name: 'Lifecycle synthetic owner' });
  assert.equal(signup.status, 200, await signup.clone().text());
  const cookie = signup.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  const current = await auth.api.getSession({ headers: new Headers({ cookie }) }); assert.ok(current);
  const registered = await post('/oauth2/create-client', { client_name: 'Lifecycle synthetic client',
    redirect_uris: ['http://127.0.0.1:4399/callback'], application_type: 'native',
    token_endpoint_auth_method: 'client_secret_basic', grant_types: ['authorization_code','refresh_token'],
    response_types: ['code'], scope: 'openid offline_access field.facts.read' }, cookie);
  assert.equal(registered.status, 201, await registered.clone().text());
  const client = await registered.json() as { client_id: string; client_secret: string };
  const user = current.user.id, reference = randomUUID(), codeId = randomUUID();
  const access = randomBytes(32).toString('base64url'), refresh = randomBytes(32).toString('base64url');
  const refreshId = randomUUID(), accessId = randomUUID();
  const insert = async (ref = reference, code = codeId) => {
    const a = randomBytes(32).toString('base64url'), r = randomBytes(32).toString('base64url'), rid = randomUUID();
    await pool.query(`insert into "oauthRefreshToken"(id,token,"clientId","userId","referenceId","authorizationCodeId",resources,scopes,"createdAt","expiresAt")
      values($1,$2,$3,$4,$5,$6,$7::jsonb,'["offline_access","field.facts.read"]',now(),now()+interval '1 day')`,[rid,digest(r),client.client_id,user,ref,code,JSON.stringify([resource])]);
    await pool.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId","authorizationCodeId","refreshId",resources,scopes,"createdAt","expiresAt")
      values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'["field.facts.read"]',now(),now()+interval '10 minutes')`,[randomUUID(),digest(a),client.client_id,user,ref,code,rid,JSON.stringify([resource])]);
    return { access:a, refresh:r, refreshId:rid };
  };
  await pool.query(`insert into "oauthRefreshToken"(id,token,"clientId","userId","referenceId","authorizationCodeId",resources,scopes,"createdAt","expiresAt")
    values($1,$2,$3,$4,$5,$6,$7::jsonb,'["offline_access","field.facts.read"]',now(),now()+interval '1 day')`,[refreshId,digest(refresh),client.client_id,user,reference,codeId,JSON.stringify([resource])]);
  await pool.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId","authorizationCodeId","refreshId",resources,scopes,"createdAt","expiresAt")
    values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'["field.facts.read"]',now(),now()+interval '10 minutes')`,[accessId,digest(access),client.client_id,user,reference,codeId,refreshId,JSON.stringify([resource])]);
  const form = (path: string, values: Record<string,string>, credentials = `${client.client_id}:${client.client_secret}`) => auth.handler(new Request(`${base}${path}`, {
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',authorization:`Basic ${Buffer.from(credentials).toString('base64')}`},body:new URLSearchParams(values) }));
  const active = async (token = access) => {
    const res = await form('/oauth2/introspect',{token}); assert.equal(res.status,200);
    return (await res.json() as {active:boolean}).active;
  };
  return { client,user,reference,codeId,access,refresh,refreshId,accessId,form,active,insert,post,cookie,current };
}

async function authorize(f:Awaited<ReturnType<typeof fixture>>) {
  const org=randomUUID(),selection=randomUUID();
  await pool.query('insert into field.organizations(id,owner_user_id,name) values($1,$2,$3)',[org,f.user,'Synthetic fresh consent']);
  await pool.query("insert into field.memberships(organization_id,user_id,role) values($1,$2,'owner')",[org,f.user]);
  const verifier=randomBytes(32).toString('base64url'),url=new URL(`${base}/oauth2/authorize`);
  for(const [key,value] of Object.entries({client_id:f.client.client_id,response_type:'code',redirect_uri:'http://127.0.0.1:4399/callback',
    scope:'openid offline_access field.facts.read',resource,state:randomUUID(),code_challenge: createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(key,value);
  const authorization=await auth.handler(new Request(url,{headers:{cookie:f.cookie}}));assert.equal(authorization.status,302);
  await pool.query(`insert into field.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,requested_scopes,selection_expires_at) values($1,$2,$3,$4,$5,array['field.facts.read'],now()+interval '5 minutes')`,[selection,f.current.session.id,f.user,f.client.client_id,org]);
  const selectionCookie=[f.cookie,...authorization.headers.getSetCookie().map(v=>v.split(';')[0])].join('; ');
  const continued=await f.post('/oauth2/continue',{postLogin:true,oauth_query:new URL(authorization.headers.get('location')!,base).searchParams.toString()},selectionCookie);
  assert.equal(continued.status,200,await continued.clone().text());
  const location=(await continued.json() as {url:string}).url;
  const consentCookie=[selectionCookie,...continued.headers.getSetCookie().map(v=>v.split(';')[0])].join('; ');
  const consent=await f.post('/oauth2/consent',{accept:true,oauth_query:new URL(location).searchParams.toString()},consentCookie);assert.equal(consent.status,200,await consent.clone().text());
  const callback=new URL((await consent.json() as {url:string}).url),code=callback.searchParams.get('code');assert.ok(code);
  return {org,selection,verifier,code};
}

test('standard access revocation has independent signed metadata before deleting its provider row', async () => {
  const f = await fixture(); assert.equal(await f.active(),true);
  const revoked = await f.form('/oauth2/revoke',{token:f.access,token_type_hint:'access_token'});
  assert.equal(revoked.status,200,await revoked.clone().text()); assert.equal(await f.active(),false);
  const files = await readdir(resolve(journalRoot,'oauth-lifecycle')).catch(()=>[]);
  assert.ok(files.some(n=>n.endsWith('.json')),'provider DELETE currently has no independent lifecycle proof');
});

test('refresh replay fences old family late issuance but a fresh reference and authorization remains allowed', async () => {
  const f = await fixture();
  const rotate = await f.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:f.refresh});
  assert.equal(rotate.status,200,await rotate.clone().text());
  const rotated = await rotate.json() as {access_token:string;refresh_token:string};
  assert.equal(await f.active(rotated.access_token),true);
  const replay = await f.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:f.refresh});
  assert.equal(replay.status,400); assert.equal(await f.active(rotated.access_token),false);
  await assert.rejects(f.insert(), 'late mint into an invalidated family must be rejected');
  const fresh = await f.insert(randomUUID(),randomUUID()); assert.equal(await f.active(fresh.access),true);
});

test('wrong client cannot revoke another client and explicit refresh revoke/expiry do not reopen access', async () => {
  const f=await fixture(),other=await fixture();
  const invalid=await f.form('/oauth2/revoke',{token:f.refresh,token_type_hint:'refresh_token'},`${other.client.client_id}:${other.client.client_secret}`);
  assert.equal(invalid.status,200);assert.equal(await f.active(),true);
  const bad=await f.form('/oauth2/revoke',{token:f.access,token_type_hint:'access_token'},`${f.client.client_id}:incorrect`);
  assert.equal(bad.status,401);assert.equal(await f.active(),true);
  const revoked=await f.form('/oauth2/revoke',{token:f.refresh,token_type_hint:'refresh_token'});
  assert.equal(revoked.status,200);assert.equal(await f.active(),false);
  await assert.rejects(f.insert());
  const expires=await fixture();await pool.query(`update "oauthRefreshToken" set "expiresAt"=now()-interval '1 second' where id=$1`,[expires.refreshId]);
  assert.equal((await expires.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:expires.refresh})).status,400);
});


test('Field keeps a route key while revoke/old work are unresolved and accepts a durable close request',async()=>{
  const f=await fixture(),org=randomUUID(),connection=randomUUID(),key=randomUUID();
  await pool.query('insert into field.organizations(id,owner_user_id,name) values($1,$2,$3)',[org,f.user,'Synthetic route key']);
  await pool.query("insert into field.memberships(organization_id,user_id,role) values($1,$2,'owner')",[org,f.user]);
  await pool.query(`insert into field.ap_connections(id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,ap_agent_name,ap_agent_revision,allowed_deployment_ids,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status,event_key_id,event_secret_cipher,route_generation)
    values($1,$2,$3,'http://127.0.0.1:4311/api/auth','synthetic','synthetic','synthetic','synthetic','synthetic',1,array[]::text[],array[]::text[],null,null,now(),'revoked',$4,$5,1)`,[connection,org,f.user,key,Buffer.from('SYNTHETIC_KEY_CIPHER')]);
  const {createFieldApp}=await import('../src/app.js');
  const app=createFieldApp(async()=>undefined,undefined,undefined,{pool,resolveUserId:async()=>f.user});
  try{
    const close=await app.inject({method:'POST',url:`/v1/connections/ap/${connection}/route-key/close`,headers:{origin:process.env.FIELD_PUBLIC_WEB_ORIGIN!},payload:{closeId:randomUUID(),confirm:true}});
    assert.equal(close.statusCode,202,close.body);assert.equal(close.json().reason,'remote_revoke_unacknowledged');
    const metadata=await app.inject({url:`/v1/connections/ap/${connection}/route-key`});
    assert.equal(metadata.statusCode,200,metadata.body);
    assert.equal(metadata.json().closeId,close.json().closeId);assert.equal(metadata.json().requestedByCurrentActor,true);
    assert.equal(metadata.json().keyRetained,true);assert.equal(metadata.json().eventSecret,undefined);
    assert.ok((await pool.query('select event_secret_cipher from field.ap_connections where id=$1',[connection])).rows[0].event_secret_cipher);
    const closeId=close.json().closeId as string,reservation=randomUUID(),service=randomUUID(),receipt=randomBytes(32).toString('base64url'),event=randomUUID();
    const {finalizeApRouteKeyRequest}=await import('../src/ap-route-key-lifecycle.js');
    const journal=(await import('../src/oauth-lifecycle-journal.js')).lifecycleJournalFromEnvironment()!;
    const workerPool=new Pool({connectionString:process.env.FIELD_DATABASE_URL});
    const connect=workerPool.connect.bind(workerPool);let entered!:()=>void,proceed!:()=>void;
    const boundary=new Promise<void>(done=>{entered=done;}),resume=new Promise<void>(done=>{proceed=done;});
    workerPool.connect=(async()=>{
      const db=await connect(),query=db.query.bind(db);
      db.query=(async(...args:unknown[])=>{
        if(typeof args[0]==='string'&&args[0].startsWith('select status,event_key_id,event_secret_cipher')){entered();await resume;}
        return Reflect.apply(query,db,args);
      }) as typeof db.query;
      return db;
    }) as typeof workerPool.connect;
    try{
      const work=finalizeApRouteKeyRequest(workerPool,journal,closeId);await boundary;
      const retryAtBoundary=app.inject({method:'POST',url:`/v1/connections/ap/${connection}/route-key/close`,headers:{origin:process.env.FIELD_PUBLIC_WEB_ORIGIN!},payload:{closeId:randomUUID(),confirm:true}});
      // Let the real API take its connection lock while the worker is paused.
      await Promise.race([retryAtBoundary,new Promise(done=>setTimeout(done,100))]);proceed();
      const outcome=await Promise.allSettled([work,retryAtBoundary]);
      assert.equal(outcome[0].status,'fulfilled','owner retry and worker must not deadlock');
      assert.equal(outcome[1].status,'fulfilled');
      if(outcome[1].status==='fulfilled')assert.equal(outcome[1].value.statusCode,409);
      await pool.query("update field.memberships set role='viewer' where organization_id=$1 and user_id=$2",[org,f.user]);
      assert.equal((await finalizeApRouteKeyRequest(pool,journal,closeId))?.reason,'owner_permission_changed');
      assert.ok((await pool.query('select event_secret_cipher from field.ap_connections where id=$1',[connection])).rows[0].event_secret_cipher);
      await pool.query("update field.memberships set role='owner' where organization_id=$1 and user_id=$2",[org,f.user]);
    }finally{proceed();await workerPool.end();}

    await pool.query(`insert into field.reservations(id,organization_id,catalog_revision,service_id,service_snapshot,booking_mode,customer_name,customer_phone,visitor_key_hash,timezone,state,consent_at,source)
      values($1,$2,1,$3,'{}','request','PRESERVED_ROUTE_CUSTOMER','010-0000-0000',$4,'Asia/Seoul','requested',now(),'external_ap')`,[reservation,org,service,createHash('sha256').update(receipt).digest('hex')]);
    await pool.query(`insert into field.external_work_requests(id,organization_id,provider,connection_id,client_id,field_grant_id,action_request_id,body_hash,origin_conversation_id,source_deployment_id,kind,service_id,catalog_revision,policy_revision,service_snapshot,customer_snapshot,request_snapshot,summary,consent_record_id,consent_confirmed_at,conditions_hash,is_test,reservation_id,status)
      values($1,$2,'agent-platform',$3,'synthetic',$4,$5,$6,$7,$8,'reservation_request',$9,1,1,'{}','{}','{}','preserved synthetic work',$10,now(),$6,false,$11,'requested')`,[randomUUID(),org,connection,randomUUID(),randomUUID(),'a'.repeat(64),randomUUID(),randomUUID(),service,randomUUID(),reservation]);
    await pool.query('insert into field.ap_received_connection_revocations(id,connection_id) values($1,$2)',[randomUUID(),connection]);
    const retry=()=>app.inject({method:'POST',url:`/v1/connections/ap/${connection}/route-key/close`,headers:{origin:process.env.FIELD_PUBLIC_WEB_ORIGIN!},payload:{closeId,confirm:true}});
    assert.equal((await retry()).json().reason,'original_routes_unreconciled');
    await pool.query(`insert into field.reservation_events(id,reservation_id,organization_id,revision,actor_type,event_type,next_state) values($1,$2,$3,0,'customer','field.reservation.requested','requested')`,[event,reservation,org]);
    await pool.query("insert into field.ap_event_deliveries(event_id,connection_id,state,last_error) values($1,$2,'retry','delivery_unknown')",[event,connection]);
    assert.equal((await retry()).json().reason,'delivery_reconciliation_pending');
    await pool.query("update field.ap_event_deliveries set state='acked',acked_at=now(),last_error=null where event_id=$1",[event]);
    const checkpointJournal=(await import('../src/oauth-lifecycle-journal.js')).lifecycleJournalFromEnvironment()!;
    const source=new URL(process.env.FIELD_DATABASE_URL!),adminUrl=new URL(source);adminUrl.pathname='/postgres';
    const restoreName='fieldai_field_restore_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:adminUrl.toString()});let restored:Pool|undefined,created=false;
    try{
      const snapshot=await promisify(execFile)('docker',['exec','fieldai-field-mock-db-1','pg_dump','-U','field_local','-d',source.pathname.slice(1),'-Fc','--no-owner','--no-acl'],{encoding:'buffer',maxBuffer:32*1024*1024});
      await pool.query(`insert into field.external_reservation_notification_routes(reservation_id,organization_id,connection_id,state,route_generation,customer_consent_id,customer_consent_version,customer_consented_at,activation_id,activated_by_user_id,activated_at,ap_closed_revision,ap_closed_event_id)
      values($1,$2,$3,'active',2,$4,'field-reservation-route-v1',now(),$5,$6,now(),0,$7)`,[reservation,org,connection,randomUUID(),randomUUID(),f.user,event]);
      const closed=await retry();assert.equal(closed.statusCode,200,closed.body);assert.equal(closed.json().state,'closed');
      assert.equal((await retry()).json().state,'closed');
      assert.equal((await pool.query('select event_secret_cipher from field.ap_connections where id=$1',[connection])).rows[0].event_secret_cipher,null);
      await assert.rejects(pool.query('update field.ap_connections set event_secret_cipher=$2 where id=$1',[connection,Buffer.from('LATE_KEY')]),{code:'POL03'});
      const preserved=await app.inject({url:`/v1/reservations/${reservation}`,headers:{authorization:`Bearer ${receipt}`}});assert.equal(preserved.statusCode,200,preserved.body);assert.match(preserved.body,/PRESERVED_ROUTE_CUSTOMER/);
      const checkpoint=await checkpointJournal.checkpoint();await admin.query(`create database "${restoreName}"`);created=true;
      await new Promise<void>((done,fail)=>{const child=spawn('docker',['exec','-i','fieldai-field-mock-db-1','pg_restore','-U','field_local','-d',restoreName,'--exit-on-error','--no-owner','--no-acl'],{stdio:['pipe','ignore','pipe']});let error='';child.stderr.on('data',v=>{error+=String(v);});child.once('error',fail);child.once('exit',exit=>exit===0?done():fail(new Error(error)));child.stdin.end(snapshot.stdout);});
      source.pathname='/'+restoreName;restored=new Pool({connectionString:source.toString()});assert.ok((await restored.query('select event_secret_cipher from field.ap_connections where id=$1',[connection])).rows[0].event_secret_cipher);
      const {reapplyLifecycleJournal}=await import('../src/oauth-lifecycle-restore.js');
      await assert.rejects(reapplyLifecycleJournal(restored,checkpointJournal,checkpoint),/original_routes_unreconciled/,'older original route state must prevent key disposal');
      assert.ok((await restored.query('select event_secret_cipher from field.ap_connections where id=$1',[connection])).rows[0].event_secret_cipher);
      const {assertLifecycleServing}=await import('../src/oauth-lifecycle-journal.js');await assert.rejects(assertLifecycleServing(restored,checkpointJournal));
      const route=(await pool.query('select * from field.external_reservation_notification_routes where reservation_id=$1',[reservation])).rows[0];
      await restored.query('insert into field.external_reservation_notification_routes select * from jsonb_populate_record(null::field.external_reservation_notification_routes,$1::jsonb)',[JSON.stringify(route)]);
      await reapplyLifecycleJournal(restored,checkpointJournal,checkpoint);await reapplyLifecycleJournal(restored,checkpointJournal,checkpoint);
      assert.equal((await restored.query('select event_secret_cipher from field.ap_connections where id=$1',[connection])).rows[0].event_secret_cipher,null);
      assert.equal((await restored.query('select visitor_key_hash from field.reservations where id=$1',[reservation])).rows[0].visitor_key_hash,createHash('sha256').update(receipt).digest('hex'));
    }finally{await restored?.end();if(created){await assertNoConnections(admin,restoreName);await admin.query(`drop database "${restoreName}"`);}await admin.end();}

  }finally{await app.close();}
});

test('actual pre-revoke PG17 backup restores active token then signed latest lifecycle replay denies it and preserves customer receipt',async()=>{
  const f=await fixture(),org=randomUUID(),inquiry=randomUUID(),receipt=randomBytes(32).toString('base64url');
  await pool.query('insert into field.organizations(id,owner_user_id,name) values($1,$2,$3)',[org,f.user,'Synthetic preserved customer']);
  await pool.query(`insert into field.inquiries(id,organization_id,catalog_revision,service_id,service_snapshot,customer_name,customer_phone,visitor_key_hash,state,consent_at) values($1,$2,1,$3,'{}','PRESERVED_LIFECYCLE_CUSTOMER','010-0000-0000',$4,'needs_owner',now())`,[inquiry,org,randomUUID(),createHash('sha256').update(receipt).digest('hex')]);
  const legacyConnection=randomUUID();
  await pool.query(`insert into field.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,requested_scopes,selection_expires_at) values($1,$2,$3,$4,$5,array['field.facts.read'],now()+interval '1 day')`,[f.reference,f.current.session.id,f.user,f.client.client_id,org]);
  await pool.query(`insert into field.ap_connections(id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,ap_agent_name,ap_agent_revision,allowed_deployment_ids,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status,field_grant_id,field_actor_user_id) values($1,$2,$3,'http://127.0.0.1:4311/api/auth','synthetic','synthetic','synthetic','synthetic','synthetic',1,array[]::text[],array[]::text[],$4,$4,now()+interval '1 hour','review_required',$5,$3)`,[legacyConnection,org,f.user,Buffer.from('SYNTHETIC_LEGACY_CIPHER'),f.reference]);
  const deletedLegacy=await f.insert(randomUUID(),randomUUID());
  const source=new URL(process.env.FIELD_DATABASE_URL!);assert.match(source.pathname,/^\/fieldai_field_test_[a-f0-9]+$/);
  const restoreName='fieldai_field_restore_'+randomUUID().replaceAll('-','');
  const adminUrl=new URL(source);adminUrl.pathname='/postgres';const admin=new Pool({connectionString:adminUrl.toString()});
  let restored:Pool|undefined,app:ReturnType<typeof import('../src/app.js')['createFieldApp']>|undefined,created=false;
  try{
    const snapshot=await promisify(execFile)('docker',['exec','fieldai-field-mock-db-1','pg_dump','-U','field_local','-d',source.pathname.slice(1),'-Fc','--no-owner','--no-acl'],{encoding:'buffer',maxBuffer:32*1024*1024});
    assert.ok(snapshot.stdout.length);
    await pool.query("update field.ap_connections set status='revoked' where id=$1",[legacyConnection]);
    await pool.query('update field.oauth_selections set revoked_at=now() where id=$1',[f.reference]);
    await pool.query('update "oauthRefreshToken" set revoked=now() where id=$1',[f.refreshId]);
    await pool.query('update "oauthAccessToken" set revoked=now() where id=$1',[f.accessId]);
    const {FieldRevocationJournal}=await import('../src/revocation-journal.js');const native=new FieldRevocationJournal(journalRoot,process.env.FIELD_REVOCATION_JOURNAL_SECRET!);
    const lifecycle=await import('../src/oauth-lifecycle-journal.js'),restore=await import('../src/oauth-lifecycle-restore.js');
    // Historical provider DELETE before lifecycle adoption is absent from the current DB.
    await pool.query('delete from "oauthAccessToken" where token=$1',[digest(deletedLegacy.access)]);
    await pool.query('delete from "oauthRefreshToken" where id=$1',[deletedLegacy.refreshId]);
    const baseline=await restore.baselineLifecycle(pool,lifecycle.lifecycleJournalFromEnvironment()!,native);assert.ok(baseline.selections&&baseline.connections);
    const nativeCount=(await native.read()).length;await restore.baselineLifecycle(pool,lifecycle.lifecycleJournalFromEnvironment()!,native);assert.equal((await native.read()).length,nativeCount);
    assert.equal((await pool.query('select access_token_cipher from field.ap_connections where id=$1',[legacyConnection])).rows[0].access_token_cipher,null,'legacy source token ciphertext is discarded after signed adoption');
    const cli=(mode:string,env:NodeJS.ProcessEnv=process.env)=>promisify(execFile)(process.execPath,['--import','tsx','src/oauth-lifecycle-cli.ts',mode],{env,maxBuffer:1024*1024});
    assert.match((await cli('--baseline-quiesced')).stdout,/legacy lifecycle baseline recorded/);
    const cliCheckpoint=resolve(root,'protected-lifecycle-checkpoint');
    assert.match((await cli('--checkpoint-quiesced',{...process.env,FIELD_OAUTH_LIFECYCLE_CHECKPOINT_OUTPUT:cliCheckpoint})).stdout,/checkpoint exported/);
    const nativeCheckpoint=await native.checkpoint();
    assert.equal((await f.form('/oauth2/revoke',{token:f.access,token_type_hint:'access_token'})).status,200);
    const {lifecycleJournalFromEnvironment}=await import('../src/oauth-lifecycle-journal.js');const journal=lifecycleJournalFromEnvironment()!;
    const checkpoint=await journal.checkpoint();assert.doesNotMatch(JSON.stringify(await journal.read()),new RegExp([f.access,f.refresh,receipt].join('|')));
    await admin.query(`create database "${restoreName}"`);created=true;
    await new Promise<void>((done,fail)=>{const child=spawn('docker',['exec','-i','fieldai-field-mock-db-1','pg_restore','-U','field_local','-d',restoreName,'--exit-on-error','--no-owner','--no-acl'],{stdio:['pipe','ignore','pipe']});
      let error='';child.stderr.on('data',v=>{error+=String(v);});child.once('error',fail);child.once('exit',exit=>exit===0?done():fail(new Error(error)));child.stdin.end(snapshot.stdout);});
    source.pathname='/'+restoreName;restored=new Pool({connectionString:source.toString()});
    const {betterAuth}=await import('better-auth');
    const restoredAuth=betterAuth({...auth.options,database:restored,plugins:auth.options.plugins?.filter(p=>p.id!=='field-oauth-lifecycle')});
    const inspect=()=>restoredAuth.handler(new Request(`${base}/oauth2/introspect`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',authorization:`Basic ${Buffer.from(`${f.client.client_id}:${f.client.client_secret}`).toString('base64')}`},body:new URLSearchParams({token:f.access})}));
    assert.equal((await (await inspect()).json() as {active:boolean}).active,true);
    const inspectDeleted=()=>restoredAuth.handler(new Request(`${base}/oauth2/introspect`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',authorization:`Basic ${Buffer.from(`${f.client.client_id}:${f.client.client_secret}`).toString('base64')}`},body:new URLSearchParams({token:deletedLegacy.access})}));
    assert.equal((await (await inspectDeleted()).json() as {active:boolean}).active,true);
    const {reapplyLifecycleJournal}=await import('../src/oauth-lifecycle-restore.js');await reapplyLifecycleJournal(restored,journal,checkpoint);
    const {reapplyFieldRevocationJournal}=await import('../src/revocation-restore.js');await reapplyFieldRevocationJournal(restored,native,nativeCheckpoint);
    assert.equal((await restored.query('select status,access_token_cipher,refresh_token_cipher from field.ap_connections where id=$1',[legacyConnection])).rows[0].status,'revoked');
    assert.equal((await restored.query('select access_token_cipher from field.ap_connections where id=$1',[legacyConnection])).rows[0].access_token_cipher,null);

    assert.match((await cli('--offline-restored',{...process.env,FIELD_OAUTH_LIFECYCLE_RESTORE_DATABASE_URL:source.toString(),FIELD_OAUTH_LIFECYCLE_CHECKPOINT_FILE:cliCheckpoint})).stdout,/lifecycle restore entries/);
    await assert.rejects(cli('--offline-restored',{...process.env,FIELD_OAUTH_LIFECYCLE_RESTORE_DATABASE_URL:process.env.FIELD_DATABASE_URL,FIELD_OAUTH_LIFECYCLE_CHECKPOINT_FILE:cliCheckpoint}),/separate own local restore database required/);
    assert.equal((await (await inspect()).json() as {active:boolean}).active,false);
    assert.equal((await (await inspectDeleted()).json() as {active:boolean}).active,false,'pre-cutover deleted provider token must stay inactive after restore');
    await reapplyLifecycleJournal(restored,journal,checkpoint);assert.equal((await (await inspect()).json() as {active:boolean}).active,false);
    const {createFieldApp}=await import('../src/app.js');app=createFieldApp(async()=>undefined,undefined,undefined,{pool:restored,resolveUserId:async()=>f.user});
    const preserved=await app.inject({url:`/v1/inquiries/${inquiry}`,headers:{authorization:`Bearer ${receipt}`}});assert.equal(preserved.statusCode,200,preserved.body);assert.match(preserved.body,/PRESERVED_LIFECYCLE_CUSTOMER/);
    const entries=await journal.read(),entry=entries[0]!,path=resolve(journal.root,`${entry.id}.json`),original=await readFile(path,'utf8');
    await rename(path,resolve(root,'missing-proof'));
    await assert.rejects(reapplyLifecycleJournal(restored,journal,checkpoint));await rename(resolve(root,'missing-proof'),path);
    await writeFile(path,original.replace('"signature":"','"signature":"0'));
    await assert.rejects(reapplyLifecycleJournal(restored,journal,checkpoint));await writeFile(path,original);
    await assert.rejects(restored.query('delete from field.oauth_lifecycle_receipts'),{code:'POL01'});
  }finally{
    await app?.close();await restored?.end();
    if(created){await assertNoConnections(admin,restoreName);await admin.query(`drop database "${restoreName}"`);}
    await admin.end();
  }
});

test('fresh owner selection + PKCE + explicit consent succeeds after a prior family is invalidated',async()=>{
  const f=await fixture();
  const rotate=await f.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:f.refresh});assert.equal(rotate.status,200);
  assert.equal((await f.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:f.refresh})).status,400);
  const {org,verifier,code}=await authorize(f);
  const issued=await f.form('/oauth2/token',{grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:'http://127.0.0.1:4399/callback'});
  assert.equal(issued.status,200,await issued.clone().text());
  const fresh=await issued.json() as {access_token:string;refresh_token:string};assert.equal(await f.active(fresh.access_token),true);
  const initialRotation=await f.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:fresh.refresh_token});assert.equal(initialRotation.status,200);
  const validRotation=await initialRotation.json() as {refresh_token:string};
  await pool.query("update field.memberships set role='viewer' where organization_id=$1 and user_id=$2",[org,f.user]);
  const lostOwner=await f.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:validRotation.refresh_token});
  assert.equal(lostOwner.status,400,'current owner loss must deny provider refresh issuance');
});


test('family invalidation waits for an in-flight mint and then denies both its refresh and access tokens',async()=>{
  const f=await fixture();assert.equal((await f.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:f.refresh})).status,200);
  const mint=await pool.connect(),id=randomUUID(),access=randomBytes(32).toString('base64url');
  try{
    await mint.query('begin');
    await mint.query(`insert into "oauthRefreshToken"(id,token,"clientId","userId","referenceId","authorizationCodeId",scopes,"createdAt","expiresAt") values($1,$2,$3,$4,$5,$6,'["offline_access","field.facts.read"]',now(),now()+interval '1 day')`,[id,digest(randomBytes(32).toString('base64url')),f.client.client_id,f.user,f.reference,f.codeId]);
    await mint.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId","authorizationCodeId","refreshId",resources,scopes,"createdAt","expiresAt") values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'["field.facts.read"]',now(),now()+interval '10 minutes')`,[randomUUID(),digest(access),f.client.client_id,f.user,f.reference,f.codeId,id,JSON.stringify([resource])]);
    let settled=false;const replay=f.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:f.refresh}).then(v=>{settled=true;return v;});
    let waiting=false;for(let i=0;i<100;i++){waiting=!!(await pool.query("select 1 from pg_stat_activity where datname=current_database() and wait_event='advisory' and pid<>pg_backend_pid()")).rowCount;if(waiting)break;await new Promise(done=>setTimeout(done,10));}
    assert.equal(waiting,true,'real family lock must be observed');assert.equal(settled,false);
    await mint.query('commit');assert.equal((await replay).status,400);assert.equal(await f.active(access),false);
    assert.ok(!(await pool.query('select 1 from "oauthRefreshToken" where id=$1 and revoked is null',[id])).rowCount);
  }finally{await mint.query('rollback');mint.release();}
});

test('missing signed journal blocks a provider revocation and retains the token until same request recovery',async()=>{
  const f=await fixture(),source=resolve(journalRoot,'oauth-lifecycle'),moved=resolve(root,'unavailable-lifecycle');
  await rename(source,moved);
  try{assert.equal((await f.form('/oauth2/introspect',{token:f.access})).status,503,'missing proof must block OAuth serving');assert.equal((await f.form('/oauth2/revoke',{token:f.access,token_type_hint:'access_token'})).status,500);assert.ok((await pool.query('select 1 from "oauthAccessToken" where id=$1 and revoked is null',[f.accessId])).rowCount);}
  finally{await rename(moved,source);}
  assert.equal((await f.form('/oauth2/revoke',{token:f.access,token_type_hint:'access_token'})).status,200);assert.equal(await f.active(),false);
});

test('a durable fsync intent whose DB commit was lost blocks serving until the same provider revoke adopts it',async()=>{
  const f=await fixture(),{lifecycleJournalFromEnvironment}=await import('../src/oauth-lifecycle-journal.js'),{tokenIntent}=await import('../src/oauth-lifecycle-provider.js');
  const journal=lifecycleJournalFromEnvironment()!,row=(await pool.query('select * from "oauthAccessToken" where id=$1',[f.accessId])).rows[0];
  await journal.append(tokenIntent(row,'access'));
  assert.equal((await f.form('/oauth2/introspect',{token:f.access})).status,503);
  assert.equal((await f.form('/oauth2/revoke',{token:f.access,token_type_hint:'access_token'})).status,200);assert.equal(await f.active(),false);
});


test('actual HTTP public Bearer consumer fails closed for missing/pending proof without changing the token',async()=>{
  const f=await fixture(),{createFieldApp}=await import('../src/app.js');
  const {assertLifecycleServing,lifecycleJournalFromEnvironment}=await import('../src/oauth-lifecycle-journal.js');
  const journal=lifecycleJournalFromEnvironment()!;
  const app=createFieldApp(async()=>undefined,undefined,undefined,{pool,resolveUserId:async()=>null,oauthLifecycleGuard:()=>assertLifecycleServing(pool,journal)});
  const address=await app.listen({host:'127.0.0.1',port:0}),source=resolve(journalRoot,'oauth-lifecycle'),moved=resolve(root,'http-proof-moved');
  const inspect=()=>fetch(`${address}/integrations/v1/me`,{headers:{authorization:`Bearer ${f.access}`}});
  try{
    assert.equal((await inspect()).status,401); // Valid synthetic token, no product selection.
    await rename(source,moved);
    try{assert.equal((await inspect()).status,503);assert.ok((await pool.query('select 1 from "oauthAccessToken" where id=$1 and revoked is null',[f.accessId])).rowCount);}
    finally{await rename(moved,source);}
    assert.equal((await inspect()).status,401);
    const {tokenIntent}=await import('../src/oauth-lifecycle-provider.js');
    await journal.append(tokenIntent((await pool.query('select * from "oauthAccessToken" where id=$1',[f.accessId])).rows[0],'access'));
    assert.equal((await inspect()).status,503);assert.ok((await pool.query('select 1 from "oauthAccessToken" where id=$1 and revoked is null',[f.accessId])).rowCount);
    assert.equal((await f.form('/oauth2/revoke',{token:f.access,token_type_hint:'access_token'})).status,200);
    assert.equal((await inspect()).status,401);
  }finally{await app.close();}
});

test('a code issued before selection revocation cannot mint a successful token response afterward',async()=>{
  const f=await fixture(),a=await authorize(f);
  await pool.query('update field.oauth_selections set revoked_at=now() where id=$1',[a.selection]);
  const late=await f.form('/oauth2/token',{grant_type:'authorization_code',code:a.code,code_verifier:a.verifier,redirect_uri:'http://127.0.0.1:4399/callback'});
  assert.equal(late.status,400,'late code must return invalid_grant');
  assert.equal((await pool.query('select count(*)::int n from "oauthAccessToken" where "referenceId"=$1 and revoked is null',[a.selection])).rows[0].n,0);
});

test('provider replay deletes only its signed snapshot while a fresh consented family arrives',async()=>{
  const f=await fixture(),{LifecycleJournal}=await import('../src/oauth-lifecycle-journal.js');
  assert.equal((await f.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:f.refresh})).status,200);
  const original=LifecycleJournal.prototype.append;let fresh:Awaited<ReturnType<typeof f.insert>>|undefined;
  LifecycleJournal.prototype.append=async function(intent){
    if(intent.kind==='family'&&intent.clientId===f.client.client_id&&!fresh)fresh=await f.insert(randomUUID(),randomUUID());
    return original.call(this,intent);
  };
  try{assert.equal((await f.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:f.refresh})).status,400);}
  finally{LifecycleJournal.prototype.append=original;}
  assert.ok(fresh);assert.ok((await pool.query('select 1 from "oauthRefreshToken" where id=$1 and revoked is null',[fresh.refreshId])).rowCount,'fresh family outside signed snapshot must survive');
  assert.equal(await f.active(fresh.access),true);
});

test('lifecycle serving reuses verified journal files and applied proofs, rereading only new or changed entries',async t=>{
  const f=await fixture(),g=await fixture();
  assert.equal((await f.form('/oauth2/revoke',{token:f.access,token_type_hint:'access_token'})).status,200);
  const {assertLifecycleServing,lifecycleJournalFromEnvironment,lifecycleJournalMetrics,LifecycleJournal}=await import('../src/oauth-lifecycle-journal.js');
  const {tokenIntent}=await import('../src/oauth-lifecycle-provider.js');
  const journal=lifecycleJournalFromEnvironment()!,secret=process.env.FIELD_REVOCATION_JOURNAL_SECRET!;
  assert.equal(lifecycleJournalFromEnvironment(),journal,'요청마다 같은 검증 캐시 인스턴스를 써야 한다');
  // 요청당 DB 왕복 수를 세는 pool 래퍼(실제 pool client를 그대로 쓴다)
  let queries=0;
  const counting={connect:async()=>{const client=await pool.connect();return new Proxy(client,{get(target,key){
    if(key==='query')return (...args:unknown[])=>{queries++;return (target.query as (...values:unknown[])=>unknown).apply(target,args);};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});}} as unknown as Pool;
  const measure=async(run:()=>Promise<unknown>)=>{lifecycleJournalMetrics.fileReads=0;queries=0;await run();return {reads:lifecycleJournalMetrics.fileReads,queries};};
  const count=(await readdir(journal.root)).filter(n=>n.endsWith('.json')).length;assert.ok(count>0);
  const cold=await measure(()=>assertLifecycleServing(counting,new LifecycleJournal(journal.root,secret)));
  assert.equal(cold.reads,count,'재시작한 인스턴스는 모든 서명을 다시 확인한다');
  await assertLifecycleServing(counting,journal);
  for(let i=0;i<3;i++)assert.deepEqual(await measure(()=>assertLifecycleServing(counting,journal)),{reads:0,queries:1},'변경 없는 원장은 다시 읽지 않는다');
  t.diagnostic(`entries=${count} cold(reads=${cold.reads},queries=${cold.queries}) warm(reads=0,queries=1)`);

  // 식별값에는 서버 시작 시각이 들어가고, 같은 oid라도 식별값이 바뀌면(물리 복원·failover) 처음부터 다시 확인한다.
  const {LIFECYCLE_SERVING_CACHE_MAX_AGE_MS}=await import('../src/oauth-lifecycle-journal.js');
  let identity='',suffix='';
  const shifted={connect:async()=>{const client=await counting.connect();return new Proxy(client,{get(target,key){
    if(key==='query')return async(...args:unknown[])=>{
      const result=await (target.query as (...values:unknown[])=>Promise<{rows:{identity?:string}[]}>).apply(target,args);
      if(typeof args[0]==='string'&&args[0].includes('pg_postmaster_start_time')&&result.rows[0]){identity=result.rows[0].identity!;result.rows[0].identity+=suffix;}
      return result;};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});}} as unknown as Pool;
  assert.deepEqual(await measure(()=>assertLifecycleServing(shifted,journal)),{reads:0,queries:1});
  const started=(await pool.query<{t:string}>('select pg_postmaster_start_time()::text as t')).rows[0]!.t;
  assert.ok(identity.endsWith(`:${started}`),identity);
  suffix=':failover';
  assert.ok((await measure(()=>assertLifecycleServing(shifted,journal))).queries>1,'식별값이 바뀌면 적용 확인을 처음부터 다시 한다');
  assert.deepEqual(await measure(()=>assertLifecycleServing(shifted,journal)),{reads:0,queries:1});

  // 캐시는 최대 유효 시간까지만 믿고, 지나면 변경이 없어도 모든 항목을 DB에서 다시 확인한다.
  t.mock.timers.enable({apis:['Date'],now:Date.now()});
  try{
    assert.deepEqual(await measure(()=>assertLifecycleServing(counting,journal)),{reads:0,queries:1});
    t.mock.timers.tick(LIFECYCLE_SERVING_CACHE_MAX_AGE_MS);
    assert.ok((await measure(()=>assertLifecycleServing(counting,journal))).queries>1,'유효 시간이 지나면 다시 확인한다');
    assert.deepEqual(await measure(()=>assertLifecycleServing(counting,journal)),{reads:0,queries:1},'다시 확인한 뒤에는 캐시를 쓴다');
  }finally{t.mock.timers.reset();}

  // append: 새 파일 하나만 읽고, receipt 없는 항목은 즉시 서빙을 막는다
  await journal.append(tokenIntent((await pool.query('select * from "oauthAccessToken" where id=$1',[g.accessId])).rows[0],'access'));
  lifecycleJournalMetrics.fileReads=0;
  await assert.rejects(assertLifecycleServing(counting,journal),/recovery required/);assert.equal(lifecycleJournalMetrics.fileReads,1);
  assert.equal((await g.form('/oauth2/revoke',{token:g.access,token_type_hint:'access_token'})).status,200);
  await assertLifecycleServing(counting,journal);
  assert.deepEqual(await measure(()=>assertLifecycleServing(counting,journal)),{reads:0,queries:1});

  // 같은 크기 변조: 서명이 맞는 다른 내용(같은 길이)도 stat 변화로 다시 읽고 검증된 해시와 달라 즉시 거부한다
  const name=(await readdir(journal.root)).filter(n=>n.endsWith('.json')).sort()[0]!,path=resolve(journal.root,name),original=await readFile(path,'utf8');
  const envelope=JSON.parse(original) as {data:string;signature:string},entry=JSON.parse(envelope.data) as {createdAt:string};
  const digit=entry.createdAt.at(-2)==='1'?'2':'1';
  const data=JSON.stringify({...entry,createdAt:entry.createdAt.slice(0,-2)+digit+'Z'});
  const forged=JSON.stringify({data,signature:createHmac('sha256',secret).update('field-oauth-lifecycle-v1\0').update(data).digest('hex')});
  assert.equal(forged.length,original.length);
  const flipped=original.replace(/"signature":"(.)/,(_,c:string)=>`"signature":"${c==='0'?'1':'0'}`);assert.equal(flipped.length,original.length);
  try{
    await writeFile(path,forged);
    await assert.rejects(assertLifecycleServing(counting,journal),/continuity lost/);
    await assert.rejects(journal.read(),/continuity lost/,'거부 후에도 검증된 해시를 기준으로 계속 거부한다');
    await assert.rejects(assertLifecycleServing(counting,new LifecycleJournal(journal.root,secret)),/continuity lost/,'재시작 후에는 DB receipt 해시가 같은 변조를 거부한다');
    await writeFile(path,flipped);
    await assert.rejects(assertLifecycleServing(counting,journal),/signature mismatch/);
  }finally{await writeFile(path,original);}
  await assertLifecycleServing(counting,journal);

  // checkpoint/restore 검증은 항상 전체 서명을 다시 읽고, restore 검증 뒤 서빙은 처음부터 다시 확인한다
  const total=(await readdir(journal.root)).filter(n=>n.endsWith('.json')).length;
  const checkpoint=await measure(()=>journal.checkpoint());assert.equal(checkpoint.reads,total);
  const exported=await journal.checkpoint();
  assert.equal((await measure(()=>journal.verifiedEntries(exported))).reads,total);
  assert.ok((await measure(()=>assertLifecycleServing(counting,journal))).queries>1,'restore 검증 뒤에는 적용 확인 캐시를 버린다');
});
test('lifecycle tombstone and receipt tables refuse TRUNCATE, which row triggers cannot see',async()=>{
  const client=await pool.connect();
  try{
    for(const table of ['field.oauth_lifecycle_tombstones','field.oauth_lifecycle_receipts']){
      // 보호가 없을 때도 실제 기록을 지우지 않도록 트랜잭션 안에서 시도하고 되돌린다.
      await client.query('begin');
      await assert.rejects(client.query(`truncate ${table}`),{code:'POL04'},table);
      await client.query('rollback');
    }
  }finally{await client.query('rollback').catch(()=>undefined);client.release();}
});
