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

const root = await mkdtemp(resolve(tmpdir(), 'agent-oauth-lifecycle-'));
const journalRoot = resolve(root, 'journal'); await mkdir(journalRoot);
process.env.AP_REVOCATION_JOURNAL_DIRECTORY = journalRoot;
process.env.AP_REVOCATION_JOURNAL_SECRET = 'synthetic-agent-lifecycle-journal-secret';
const { auth, authPool: pool } = await import('../src/auth.js');
after(async () => { await pool.end(); });
const base = new URL('/api/auth', process.env.AP_AUTH_BASE_URL!).toString();
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
    response_types: ['code'], scope: 'openid offline_access ap.agent.read' }, cookie);
  assert.equal(registered.status, 201, await registered.clone().text());
  const client = await registered.json() as { client_id: string; client_secret: string };
  const user = current.user.id, reference = randomUUID(), codeId = randomUUID();
  const access = randomBytes(32).toString('base64url'), refresh = randomBytes(32).toString('base64url');
  const refreshId = randomUUID(), accessId = randomUUID();
  const insert = async (ref = reference, code = codeId) => {
    const a = randomBytes(32).toString('base64url'), r = randomBytes(32).toString('base64url'), rid = randomUUID();
    await pool.query(`insert into "oauthRefreshToken"(id,token,"clientId","userId","referenceId","authorizationCodeId",resources,scopes,"createdAt","expiresAt")
      values($1,$2,$3,$4,$5,$6,$7::jsonb,'["offline_access","ap.agent.read"]',now(),now()+interval '1 day')`,[rid,digest(r),client.client_id,user,ref,code,JSON.stringify([resource])]);
    await pool.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId","authorizationCodeId","refreshId",resources,scopes,"createdAt","expiresAt")
      values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'["ap.agent.read"]',now(),now()+interval '10 minutes')`,[randomUUID(),digest(a),client.client_id,user,ref,code,rid,JSON.stringify([resource])]);
    return { access:a, refresh:r, refreshId:rid };
  };
  await pool.query(`insert into "oauthRefreshToken"(id,token,"clientId","userId","referenceId","authorizationCodeId",resources,scopes,"createdAt","expiresAt")
    values($1,$2,$3,$4,$5,$6,$7::jsonb,'["offline_access","ap.agent.read"]',now(),now()+interval '1 day')`,[refreshId,digest(refresh),client.client_id,user,reference,codeId,JSON.stringify([resource])]);
  await pool.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId","authorizationCodeId","refreshId",resources,scopes,"createdAt","expiresAt")
    values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'["ap.agent.read"]',now(),now()+interval '10 minutes')`,[accessId,digest(access),client.client_id,user,reference,codeId,refreshId,JSON.stringify([resource])]);
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
  await pool.query('insert into ap.organizations(id,owner_user_id,name) values($1,$2,$3)',[org,f.user,'Synthetic fresh consent']);
  await pool.query("insert into ap.memberships(organization_id,user_id,role) values($1,$2,'owner')",[org,f.user]);
  const verifier=randomBytes(32).toString('base64url'),url=new URL(`${base}/oauth2/authorize`);
  for(const [key,value] of Object.entries({client_id:f.client.client_id,response_type:'code',redirect_uri:'http://127.0.0.1:4399/callback',
    scope:'openid offline_access ap.agent.read',resource,state:randomUUID(),code_challenge: createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(key,value);
  const authorization=await auth.handler(new Request(url,{headers:{cookie:f.cookie}}));assert.equal(authorization.status,302);
  await pool.query(`insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,agent_id,requested_scopes,selection_expires_at) values($1,$2,$3,$4,$5,$6,array['ap.agent.read'],now()+interval '5 minutes')`,[selection,f.current.session.id,f.user,f.client.client_id,org,randomUUID()]);
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


test('actual pre-revoke PG17 backup restores active token then signed latest lifecycle replay denies it and preserves customer receipt',async()=>{
  const f=await fixture(),org=randomUUID(),inquiry=randomUUID(),receipt=randomBytes(32).toString('base64url');
  await pool.query('insert into ap.organizations(id,owner_user_id,name) values($1,$2,$3)',[org,f.user,'Synthetic preserved customer']);
  const release=randomUUID();await pool.query(`insert into ap.knowledge_releases(id,organization_id,revision,draft_revision,source_kind,content,content_hash,approved_by) values($1,$2,1,1,'native','{}','synthetic',$3)`,[release,org,f.user]);
  await pool.query(`insert into ap.inquiries(id,organization_id,knowledge_release_id,knowledge_revision,customer_name,customer_phone,visitor_key_hash,state,consent_at) values($1,$2,$3,1,'PRESERVED_LIFECYCLE_CUSTOMER','010-0000-0000',$4,'needs_owner',now())`,[inquiry,org,release,createHash('sha256').update(receipt).digest('hex')]);
  const legacyConnection=randomUUID();
  await pool.query(`insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,agent_id,requested_scopes,selection_expires_at) values($1,$2,$3,$4,$5,$6,array['ap.agent.read'],now()+interval '1 day')`,[f.reference,f.current.session.id,f.user,f.client.client_id,org,randomUUID()]);
  await pool.query(`insert into ap.field_connections(id,ap_grant_id,ap_organization_id,ap_agent_id,initiator_user_id,field_issuer,field_client_id,field_grant_id,field_organization_id,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status) values($1,$2,$3,$4,$5,'http://127.0.0.1:4321/api/auth','synthetic','synthetic','synthetic',array[]::text[],$6,$6,now()+interval '1 hour','review_required')`,[legacyConnection,f.reference,org,randomUUID(),f.user,Buffer.from('SYNTHETIC_LEGACY_CIPHER')]);
  const deletedLegacy=await f.insert(randomUUID(),randomUUID());
  const source=new URL(process.env.AP_DATABASE_URL!);assert.match(source.pathname,/^\/fieldai_agent_test_[a-f0-9]+$/);
  const restoreName='fieldai_agent_restore_'+randomUUID().replaceAll('-','');
  const adminUrl=new URL(source);adminUrl.pathname='/postgres';const admin=new Pool({connectionString:adminUrl.toString()});
  let restored:Pool|undefined,app:ReturnType<typeof import('../src/app.js')['createAgentApp']>|undefined,created=false;
  try{
    const snapshot=await promisify(execFile)('docker',['exec','fieldai-agent-mock-db-1','pg_dump','-U','agent_local','-d',source.pathname.slice(1),'-Fc','--no-owner','--no-acl'],{encoding:'buffer',maxBuffer:32*1024*1024});
    assert.ok(snapshot.stdout.length);
    await pool.query("update ap.field_connections set status='revoked' where id=$1",[legacyConnection]);
    await pool.query('update ap.oauth_selections set revoked_at=now() where id=$1',[f.reference]);
    await pool.query('update "oauthRefreshToken" set revoked=now() where id=$1',[f.refreshId]);
    await pool.query('update "oauthAccessToken" set revoked=now() where id=$1',[f.accessId]);
    const {AgentRevocationJournal}=await import('../src/revocation-journal.js');const native=new AgentRevocationJournal(journalRoot,process.env.AP_REVOCATION_JOURNAL_SECRET!);
    const lifecycle=await import('../src/oauth-lifecycle-journal.js'),restore=await import('../src/oauth-lifecycle-restore.js');
    // Historical provider DELETE before lifecycle adoption is absent from the current DB.
    await pool.query('delete from "oauthAccessToken" where token=$1',[digest(deletedLegacy.access)]);
    await pool.query('delete from "oauthRefreshToken" where id=$1',[deletedLegacy.refreshId]);
    const baseline=await restore.baselineLifecycle(pool,lifecycle.lifecycleJournalFromEnvironment()!,native);assert.ok(baseline.selections&&baseline.connections);
    const nativeCount=(await native.read()).length;await restore.baselineLifecycle(pool,lifecycle.lifecycleJournalFromEnvironment()!,native);assert.equal((await native.read()).length,nativeCount);
    assert.equal((await pool.query('select access_token_cipher from ap.field_connections where id=$1',[legacyConnection])).rows[0].access_token_cipher,null,'legacy source token ciphertext is discarded after signed adoption');
    const cli=(mode:string,env:NodeJS.ProcessEnv=process.env)=>promisify(execFile)(process.execPath,['--import','tsx','src/oauth-lifecycle-cli.ts',mode],{env,maxBuffer:1024*1024});
    assert.match((await cli('--baseline-quiesced')).stdout,/legacy lifecycle baseline recorded/);
    const cliCheckpoint=resolve(root,'protected-lifecycle-checkpoint');
    assert.match((await cli('--checkpoint-quiesced',{...process.env,AP_OAUTH_LIFECYCLE_CHECKPOINT_OUTPUT:cliCheckpoint})).stdout,/checkpoint exported/);
    const nativeCheckpoint=await native.checkpoint();
    assert.equal((await f.form('/oauth2/revoke',{token:f.access,token_type_hint:'access_token'})).status,200);
    const {lifecycleJournalFromEnvironment}=await import('../src/oauth-lifecycle-journal.js');const journal=lifecycleJournalFromEnvironment()!;
    const checkpoint=await journal.checkpoint();assert.doesNotMatch(JSON.stringify(await journal.read()),new RegExp([f.access,f.refresh,receipt].join('|')));
    await admin.query(`create database "${restoreName}"`);created=true;
    await new Promise<void>((done,fail)=>{const child=spawn('docker',['exec','-i','fieldai-agent-mock-db-1','pg_restore','-U','agent_local','-d',restoreName,'--exit-on-error','--no-owner','--no-acl'],{stdio:['pipe','ignore','pipe']});
      let error='';child.stderr.on('data',v=>{error+=String(v);});child.once('error',fail);child.once('exit',exit=>exit===0?done():fail(new Error(error)));child.stdin.end(snapshot.stdout);});
    source.pathname='/'+restoreName;restored=new Pool({connectionString:source.toString()});
    const {betterAuth}=await import('better-auth');
    const restoredAuth=betterAuth({...auth.options,database:restored,plugins:auth.options.plugins?.filter(p=>p.id!=='agent-oauth-lifecycle')});
    const inspect=()=>restoredAuth.handler(new Request(`${base}/oauth2/introspect`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',authorization:`Basic ${Buffer.from(`${f.client.client_id}:${f.client.client_secret}`).toString('base64')}`},body:new URLSearchParams({token:f.access})}));
    assert.equal((await (await inspect()).json() as {active:boolean}).active,true);
    const inspectDeleted=()=>restoredAuth.handler(new Request(`${base}/oauth2/introspect`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',authorization:`Basic ${Buffer.from(`${f.client.client_id}:${f.client.client_secret}`).toString('base64')}`},body:new URLSearchParams({token:deletedLegacy.access})}));
    assert.equal((await (await inspectDeleted()).json() as {active:boolean}).active,true);
    const {reapplyLifecycleJournal}=await import('../src/oauth-lifecycle-restore.js');await reapplyLifecycleJournal(restored,journal,checkpoint);
    const {reapplyAgentRevocationJournal}=await import('../src/revocation-restore.js');await reapplyAgentRevocationJournal(restored,native,nativeCheckpoint);
    assert.equal((await restored.query('select status,access_token_cipher,refresh_token_cipher from ap.field_connections where id=$1',[legacyConnection])).rows[0].status,'revoked');
    assert.equal((await restored.query('select access_token_cipher from ap.field_connections where id=$1',[legacyConnection])).rows[0].access_token_cipher,null);

    assert.match((await cli('--offline-restored',{...process.env,AP_OAUTH_LIFECYCLE_RESTORE_DATABASE_URL:source.toString(),AP_OAUTH_LIFECYCLE_CHECKPOINT_FILE:cliCheckpoint})).stdout,/lifecycle restore entries/);
    await assert.rejects(cli('--offline-restored',{...process.env,AP_OAUTH_LIFECYCLE_RESTORE_DATABASE_URL:process.env.AP_DATABASE_URL,AP_OAUTH_LIFECYCLE_CHECKPOINT_FILE:cliCheckpoint}),/separate own local restore database required/);
    assert.equal((await (await inspect()).json() as {active:boolean}).active,false);
    assert.equal((await (await inspectDeleted()).json() as {active:boolean}).active,false,'pre-cutover deleted provider token must stay inactive after restore');
    await reapplyLifecycleJournal(restored,journal,checkpoint);assert.equal((await (await inspect()).json() as {active:boolean}).active,false);
    const {createAgentApp}=await import('../src/app.js');app=createAgentApp(async()=>undefined,undefined,undefined,undefined,{pool:restored,resolveUserId:async()=>f.user});
    const preserved=await app.inject({url:`/v1/inquiries/${inquiry}`,headers:{authorization:`Bearer ${receipt}`}});assert.equal(preserved.statusCode,200,preserved.body);assert.match(preserved.body,/PRESERVED_LIFECYCLE_CUSTOMER/);
    const entries=await journal.read(),entry=entries[0]!,path=resolve(journal.root,`${entry.id}.json`),original=await readFile(path,'utf8');
    await rename(path,resolve(root,'missing-proof'));
    await assert.rejects(reapplyLifecycleJournal(restored,journal,checkpoint));await rename(resolve(root,'missing-proof'),path);
    await writeFile(path,original.replace('"signature":"','"signature":"0'));
    await assert.rejects(reapplyLifecycleJournal(restored,journal,checkpoint));await writeFile(path,original);
    await assert.rejects(restored.query('delete from ap.oauth_lifecycle_receipts'),{code:'POL01'});
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
  await pool.query("update ap.memberships set role='viewer' where organization_id=$1 and user_id=$2",[org,f.user]);
  const lostOwner=await f.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:validRotation.refresh_token});
  assert.equal(lostOwner.status,400,'current owner loss must deny provider refresh issuance');
});


test('family invalidation waits for an in-flight mint and then denies both its refresh and access tokens',async()=>{
  const f=await fixture();assert.equal((await f.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:f.refresh})).status,200);
  const mint=await pool.connect(),id=randomUUID(),access=randomBytes(32).toString('base64url');
  try{
    await mint.query('begin');
    await mint.query(`insert into "oauthRefreshToken"(id,token,"clientId","userId","referenceId","authorizationCodeId",scopes,"createdAt","expiresAt") values($1,$2,$3,$4,$5,$6,'["offline_access","ap.agent.read"]',now(),now()+interval '1 day')`,[id,digest(randomBytes(32).toString('base64url')),f.client.client_id,f.user,f.reference,f.codeId]);
    await mint.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId","authorizationCodeId","refreshId",resources,scopes,"createdAt","expiresAt") values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'["ap.agent.read"]',now(),now()+interval '10 minutes')`,[randomUUID(),digest(access),f.client.client_id,f.user,f.reference,f.codeId,id,JSON.stringify([resource])]);
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
  const f=await fixture(),{createAgentApp}=await import('../src/app.js');
  const {assertLifecycleServing,lifecycleJournalFromEnvironment}=await import('../src/oauth-lifecycle-journal.js');
  const journal=lifecycleJournalFromEnvironment()!;
  const app=createAgentApp(async()=>undefined,undefined,undefined,undefined,{pool,resolveUserId:async()=>null,oauthLifecycleGuard:()=>assertLifecycleServing(pool,journal)});
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
  await pool.query('update ap.oauth_selections set revoked_at=now() where id=$1',[a.selection]);
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

test('twelve concurrent token issuances finish without each request holding two auth pool clients',async()=>{
  const f=await fixture(),org=randomUUID(),selection=randomUUID();
  await pool.query('insert into ap.organizations(id,owner_user_id,name) values($1,$2,$3)',[org,f.user,'Synthetic concurrent issuance']);
  await pool.query("insert into ap.memberships(organization_id,user_id,role) values($1,$2,'owner')",[org,f.user]);
  await pool.query(`insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,agent_id,requested_scopes,selection_expires_at) values($1,$2,$3,$4,$5,$6,array['ap.agent.read'],now()+interval '5 minutes')`,[selection,f.current.session.id,f.user,f.client.client_id,org,randomUUID()]);
  const families=[];for(let i=0;i<12;i++)families.push(await f.insert(selection,randomUUID()));
  // 별도 연결로 승인 행을 잠가 12개 발급이 모두 승인 검사(for share)에서 auth pool client를 쥔 채 모이게 한다
  const locker=new Pool({connectionString:process.env.AP_DATABASE_URL,max:2}),held=await locker.connect();
  let timer:NodeJS.Timeout|undefined,released=false;
  try{
    await held.query('begin');await held.query('select 1 from ap.oauth_selections where id=$1 for update',[selection]);
    const pending=Promise.all(families.map(x=>f.form('/oauth2/token',{grant_type:'refresh_token',refresh_token:x.refresh})));
    let waiting=0;for(let i=0;i<300&&waiting<10;i++){waiting=Number((await locker.query("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock'")).rows[0].count);if(waiting<10)await new Promise(done=>setTimeout(done,10));}
    assert.equal(waiting,10,'auth pool(max 10) must be fully held by blocked issuances');
    await held.query('commit');released=true;
    // pool보다 많은 동시 발급이 서로 client 반납을 기다리면 끝나지 않으므로 시간 제한으로 실패시킨다
    const deadlock=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('concurrent token issuance did not finish')),20000);});
    const issued=await Promise.race([pending,deadlock]);
    assert.deepEqual(issued.map(r=>r.status),Array(12).fill(200));
  }finally{clearTimeout(timer);if(!released)await held.query('rollback');held.release();await locker.end();}
});

test('lifecycle serving reuses verified journal files and applied proofs, rereading only new or changed entries',async t=>{
  const f=await fixture(),g=await fixture();
  assert.equal((await f.form('/oauth2/revoke',{token:f.access,token_type_hint:'access_token'})).status,200);
  const {assertLifecycleServing,lifecycleJournalFromEnvironment,lifecycleJournalMetrics,LifecycleJournal}=await import('../src/oauth-lifecycle-journal.js');
  const {tokenIntent}=await import('../src/oauth-lifecycle-provider.js');
  const journal=lifecycleJournalFromEnvironment()!,secret=process.env.AP_REVOCATION_JOURNAL_SECRET!;
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
  const forged=JSON.stringify({data,signature:createHmac('sha256',secret).update('agent-oauth-lifecycle-v1\0').update(data).digest('hex')});
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

  // 같은 oid의 물리 복원·failover: postmaster 시작 시각·timeline이 들어간 식별값이 바뀌면 캐시 없이 전체 확인한다
  const entryCount=(await readdir(journal.root)).filter(n=>n.endsWith('.json')).length;
  const full=(result:{queries:number})=>result.queries>=4+entryCount;
  assert.deepEqual(await measure(()=>assertLifecycleServing(counting,journal)),{reads:0,queries:1});
  let identitySeen='';
  const failover={connect:async()=>{const client=await counting.connect();return new Proxy(client,{get(target,key){
    if(key==='query')return async(...args:unknown[])=>{const result=await (target.query as (...values:unknown[])=>Promise<{rows:{identity?:string}[]}>).apply(target,args);
      if(typeof args[0]==='string'&&args[0].includes('pg_postmaster_start_time()')){identitySeen=args[0];result.rows[0]!.identity+=':promoted';}
      return result;};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});}} as unknown as Pool;
  const promoted=await measure(()=>assertLifecycleServing(failover,journal));
  assert.match(identitySeen,/pg_control_checkpoint\(\)/,'권한이 있으면 checkpoint timeline도 식별값에 넣는다');
  assert.ok(full(promoted),`식별값이 바뀌면 전체 확인(queries=${promoted.queries})`);
  assert.deepEqual(await measure(()=>assertLifecycleServing(counting,journal)),{reads:0,queries:1});
  // 최대 유효 시간(60초)이 지나면 같은 식별값이어도 전체 확인을 다시 한다
  const {SERVING_PROOF_MAX_AGE_MS}=await import('../src/oauth-lifecycle-journal.js');
  const realNow=Date.now;
  try{
    Date.now=()=>realNow()+SERVING_PROOF_MAX_AGE_MS-5_000;
    assert.deepEqual(await measure(()=>assertLifecycleServing(counting,journal)),{reads:0,queries:1},'유효 시간 안에서는 캐시를 쓴다');
    Date.now=()=>realNow()+SERVING_PROOF_MAX_AGE_MS+1_000;
    const expired=await measure(()=>assertLifecycleServing(counting,journal));
    assert.ok(full(expired),`유효 시간이 지나면 전체 확인(queries=${expired.queries})`);
    assert.deepEqual(await measure(()=>assertLifecycleServing(counting,journal)),{reads:0,queries:1});
  }finally{Date.now=realNow;}
  // TRUNCATE는 행 트리거를 거치지 않으므로 문장 트리거(POL04)로 거절한다
  for(const table of ['ap.oauth_lifecycle_receipts','ap.oauth_lifecycle_tombstones']){
    const client=await pool.connect();
    try{
      await client.query('begin');
      await assert.rejects(client.query(`truncate ${table}`),(error:{code?:string})=>error.code==='POL04',table);
    }finally{await client.query('rollback');client.release();}
  }
  await assertLifecycleServing(counting,journal);

  // checkpoint/restore 검증은 항상 전체 서명을 다시 읽고, restore 검증 뒤 서빙은 처음부터 다시 확인한다
  const total=(await readdir(journal.root)).filter(n=>n.endsWith('.json')).length;
  const checkpoint=await measure(()=>journal.checkpoint());assert.equal(checkpoint.reads,total);
  const exported=await journal.checkpoint();
  assert.equal((await measure(()=>journal.verifiedEntries(exported))).reads,total);
  assert.ok((await measure(()=>assertLifecycleServing(counting,journal))).queries>1,'restore 검증 뒤에는 적용 확인 캐시를 버린다');
});
