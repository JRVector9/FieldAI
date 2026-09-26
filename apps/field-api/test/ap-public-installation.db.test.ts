import assert from 'node:assert/strict';
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import type { FieldBusinessRuntime } from '../src/business.js';

let pool: Pool;
before(() => {
  const url = new URL(process.env.FIELD_DATABASE_URL!);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55432'); assert.equal(url.username, 'field_local');
  assert.match(url.pathname, /^\/fieldai_field_test_[a-f0-9]{32}$/);
  pool = new Pool({ connectionString: url.toString() });
});
after(async () => { await pool?.end(); });
async function fixture() {
  const routes = await import('../src/ap-public-installation-routes.js').catch(() => null);
  assert.ok(routes, 'Field durable public installation BFF is not implemented');
  const owner = randomUUID(), other = randomUUID(), org = randomUUID(), site = randomUUID(), connection = randomUUID();
  const apOrg = randomUUID(), ai = randomUUID(), grant = randomUUID(), client = randomUUID(), slug = 'field-'+randomBytes(6).toString('hex');
  const origin = `http://${slug}.localhost:3002`, tokenKey = randomBytes(32), token = randomBytes(32).toString('base64url');
  const seal = (value: string) => { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', tokenKey, iv);
    return Buffer.concat([iv, c.update(value), c.final(), c.getAuthTag()]); };
  for (const id of [owner, other]) await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,\'Synthetic installation\',$2,true)', [id,id+'@example.invalid']);
  await pool.query('insert into field.organizations(id,owner_user_id,name) values($1,$2,\'Synthetic installation\')', [org,owner]);
  await pool.query("insert into field.memberships(organization_id,user_id,role) values($1,$2,'owner'),($1,$3,'editor')", [org,owner,other]);
  await pool.query('insert into field.sites(id,organization_id,slug) values($1,$2,$3)', [site,org,slug]);
  const catalog = randomUUID();
  await pool.query('insert into field.catalog_releases(id,organization_id,revision,content,content_hash,approved_by) values($1,$2,1,$3,\'synthetic\',$4)', [catalog,org,JSON.stringify({businessName:'Synthetic',services:[]}),owner]);
  await pool.query('insert into field.site_releases(id,site_id,revision,content,content_hash,catalog_release_id,catalog_revision,published_by) values($1,$2,1,$3,\'synthetic\',$4,1,$5)', [randomUUID(),site,JSON.stringify({template:'essential',palette:'#ffffff',pages:[]}),catalog,owner]);
  let scopes = ['ap.agent.read','ap.conversations.read','ap.connections.create','ap.deployments.manage'], meActive = true;
  await pool.query(`insert into field.ap_connections(id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,
    ap_organization_id,ap_agent_id,ap_agent_name,ap_agent_revision,allowed_deployment_ids,scopes,
    access_token_cipher,refresh_token_cipher,access_expires_at,status)
    values($1,$2,$3,'http://127.0.0.1:4311/api/auth',$4,$5,$6,$7,'Synthetic AI',1,'{}',$8,$9,$10,now()+interval '1 hour','pending_field_consent')`,
  [connection,org,owner,client,grant,apOrg,ai,scopes,seal(token),seal('synthetic-refresh')]);
  const calls: { path:string; key:string|null; body:unknown; revision:string|null }[] = [];
  const remoteConnection = randomUUID(), deployment = randomUUID();
  const base = {organizationId:apOrg,agentId:ai,createdAt:new Date().toISOString(),request_id:'synthetic',operation_id:randomUUID(),retryable:false};
  let dep = { ...base,id:deployment,publicId:'dep_'+randomBytes(24).toString('base64url'),connectionId:remoteConnection,
    kind:'owned_embed',origin,verificationProof:randomBytes(24).toString('base64url'),verifiedAt:null as string|null,
    knowledgeRevision:null as number|null,revision:1,state:'pending' };
  let lost = false, rejectVerify = false, rejectStale = false, refreshFail = false,serviceDown=false;
  let hold: Promise<void>|undefined, release: (()=>void)|undefined;
  const fetcher = (async (url, init) => {
    const path = new URL(String(url)).pathname, h = new Headers(init?.headers);
    if (path.endsWith('/oauth2/token')) return refreshFail ? new Response('{}',{status:401})
      : Response.json({access_token:token,refresh_token:'synthetic-refresh-new',token_type:'Bearer',expires_in:3600,scope:['offline_access',...scopes].join(' ')});
    if (path.endsWith('/me')) {if(serviceDown)throw new Error('synthetic AP offline');return meActive ? Response.json({grantId:grant,organizationId:apOrg,agentId:ai,state:'active',scopes,deploymentIds:[]}) : new Response('{}',{status:401});}
    calls.push({path,key:h.get('idempotency-key'),body:init?.body ? JSON.parse(String(init.body)) : null,revision:h.get('if-match')});
    await hold;
    if (lost) { lost = false; throw new Error('synthetic response lost after remote commit'); }
    if (path.endsWith('/connections')) return Response.json({...base,id:remoteConnection,externalOrganizationId:org,origin,revision:1,state:'installation_only'},{status:201});
    if (path.endsWith('/deployments')) return Response.json(dep,{status:201});
    if (path.endsWith('/verify')) {
      if(rejectVerify)return Response.json({error:'domain_not_verified',retryable:false},{status:409});
      dep = {...dep,revision:dep.revision+1,verifiedAt:new Date().toISOString()};
    }
    if (path.endsWith('/activate')) {
      if(rejectStale)return Response.json({error:'revision_conflict',retryable:false},{status:409});
      dep = {...dep,revision:dep.revision+1,state:'active',knowledgeRevision:1};
    }
    if (path.endsWith('/pause')) dep = {...dep,revision:dep.revision+1,state:'paused'};
    return Response.json(dep);
  }) as typeof fetch;
  let actor: string|null = owner;
  const runtime: FieldBusinessRuntime = {pool,resolveUserId:async()=>actor,apConnector:{issuer:'http://127.0.0.1:4311/api/auth',clientId:client,
    clientSecret:'synthetic-secret',tokenKey,redirectUri:'http://127.0.0.1:4321/v1/connections/ap/callback',webOrigin:'http://localhost:3002',fetcher}};
  const app = createFieldApp(async()=>undefined,undefined,undefined,runtime);
  const call = (method:'GET'|'POST',url:string,body?:Record<string,unknown>,webOrigin='http://localhost:3002') => app.inject({method,url,headers:{origin:webOrigin,'x-organization-id':org},payload:body});
  const create = (key=randomUUID(),extra={}) => call('POST','/v1/sites/ap-public-installations',{requestKey:key,connectionId:connection,origin,mode:'floating',approval:true,...extra});
  const step = (id:string,action:string,revision:number,key=randomUUID()) => call('POST',`/v1/sites/ap-public-installations/${id}/actions`,{action,expectedRevision:revision,requestKey:key});
  const full = async () => { let value=(await create()).json();
    for(const action of ['connect','prepare','verify','activate','install']) { const response=await step(value.id,action,value.revision);assert.equal(response.statusCode,200,response.body);value=response.json(); }return value; };
  return {app,call,create,step,full,org,site,connection,owner,other,slug,origin,calls,grant,
    as:(id:string|null)=>{actor=id;},lost:()=>{lost=true;},deny:()=>{meActive=false;},
    scopes:async()=>{scopes=['ap.agent.read','ap.conversations.read'];await pool.query('update field.ap_connections set scopes=$2 where id=$1',[connection,scopes]);},
    expire:async(fail=true)=>{await pool.query("update field.ap_connections set access_expires_at=now()-interval '1 second' where id=$1",[connection]);refreshFail=fail;},
    offline:()=>{serviceDown=true;},
    rejectVerify:()=>{rejectVerify=true;},rejectStale:()=>{rejectStale=true;},
    hold:()=>{hold=new Promise<void>(r=>{release=r;});},release:()=>{release?.();hold=undefined;},
    close:async()=>{release?.();await app.close();}};
}

test('Field requires current owner, exact Origin, scopes and published exact origin before durable approval',async()=>{
  const f=await fixture();try{
    f.as(null);assert.equal((await f.create()).statusCode,401);f.as(f.other);assert.equal((await f.create()).statusCode,404);f.as(f.owner);
    assert.equal((await f.call('POST','/v1/sites/ap-public-installations',{},'https://evil.example.test')).statusCode,403);
    assert.equal((await f.create(randomUUID(),{approval:false})).statusCode,400);
    assert.equal((await f.create(randomUUID(),{origin:'https://foreign.example.test'})).statusCode,409);
    await f.scopes();assert.equal((await f.create()).statusCode,403);assert.equal(f.calls.length,0);
  }finally{await f.close();}
});
test('Field durable creation and action UUID replay preserve body and one operation under concurrency',async()=>{
  const f=await fixture();try{
    const key=randomUUID(), a=await f.create(key);assert.equal(a.statusCode,201,a.body);const intent=a.json();
    assert.equal((await f.create(key)).json().id,intent.id);assert.equal((await f.create(key,{mode:'inline'})).statusCode,409);
    assert.equal((await f.create()).statusCode,409);
    const op=randomUUID(), results=await Promise.all([f.step(intent.id,'connect',intent.revision,op),f.step(intent.id,'connect',intent.revision,op)]);
    assert.ok(results.every(r=>r.statusCode===200),results.map(r=>r.body).join('\n'));
    assert.equal(f.calls.length,1);assert.equal((await f.step(intent.id,'prepare',intent.revision,op)).statusCode,409);
  }finally{await f.close();}
});
test('Field lost write remains durable unknown; only original UUID/snapshot can recover after restart',async()=>{
  const f=await fixture();try{
    const intent=(await f.create()).json(), key=randomUUID();f.lost();
    const unknown=await f.step(intent.id,'connect',intent.revision,key);assert.equal(unknown.statusCode,503,unknown.body);
    assert.equal((await f.step(intent.id,'connect',intent.revision)).statusCode,409);
    const list=(await f.call('GET','/v1/sites/ap-public-installations')).json();assert.equal(list.intents[0].pendingOperation.requestKey,key);
    assert.equal((await f.step(intent.id,'connect',intent.revision,key)).statusCode,200);
    assert.deepEqual(f.calls[0],f.calls[1]);
  }finally{await f.close();}
});
test('Field separate proof, AP activation and SDK approval install only active exact origin; direct inquiry remains',async()=>{
  const f=await fixture();try{
    const value=await f.full();assert.equal(value.state,'installed');
    assert.equal((await pool.query('select status from field.ap_connections where id=$1',[f.connection])).rows[0].status,'pending_field_consent');
    assert.deepEqual((await pool.query('select allowed_deployment_ids from field.ap_connections where id=$1',[f.connection])).rows[0].allowed_deployment_ids,[]);
    const site=await f.app.inject({url:`/v1/public/sites/${f.slug}`});assert.equal(site.statusCode,200);assert.ok(site.json().apWidget);
    assert.equal((await f.step(value.id,'pause',value.revision)).statusCode,200);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).json().apWidget,null);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).statusCode,200);
  }finally{await f.close();}
});
test('Field definitive verification/revision errors stay rejected and never fake SDK success',async()=>{
  const f=await fixture();try{
    let value=(await f.create()).json();for(const action of ['connect','prepare'])value=(await f.step(value.id,action,value.revision)).json();
    f.rejectVerify();const key=randomUUID();assert.equal((await f.step(value.id,'verify',value.revision,key)).statusCode,409);
    assert.equal((await f.step(value.id,'verify',value.revision,key)).statusCode,409);
    assert.equal((await f.step(value.id,'install',value.revision)).statusCode,409);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).json().apWidget,null);
  }finally{await f.close();}
});
test('Field grant expiry/refresh rejection, AP selection revoke, initiator and current owner loss fence access',async()=>{
  for(const mode of ['expire','deny','initiator','owner']) {
    const f=await fixture();try{
      const value=(await f.create()).json();
      if(mode==='expire')await f.expire();if(mode==='deny')f.deny();
      if(mode==='initiator')await pool.query('update field.ap_connections set initiator_user_id=$2 where id=$1',[f.connection,f.other]);
      if(mode==='owner')await pool.query("update field.memberships set role='editor' where organization_id=$1 and user_id=$2",[f.org,f.owner]);
      const denied=await f.step(value.id,'connect',value.revision);assert.ok(denied.statusCode>=400,denied.body);assert.equal(f.calls.length,0);
    }finally{await f.close();}
  }
});
test('Field local connection revoke hides SDK and independent Field pause remains available without AP',async()=>{
  const f=await fixture();try{
    const value=await f.full();await f.step(value.id,'pause',value.revision);
    await pool.query("update field.ap_connections set status='revoked' where id=$1",[f.connection]);
    assert.equal((await f.call('GET','/v1/sites/ap-public-installations')).json().intents[0].available,false);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).json().apWidget,null);
    f.deny();assert.equal((await f.call('POST','/v1/sites/ap-installation/pause',{})).statusCode,200);
  }finally{await f.close();}
});
test('Field owner/session loss during AP install lookup fences the final SDK commit',async()=>{
  for(const mode of ['owner','session']) {
    const f=await fixture();try{
      let value=(await f.create()).json();for(const action of ['connect','prepare','verify','activate'])value=(await f.step(value.id,action,value.revision)).json();
      const prior=f.calls.length;f.hold();const installing=f.step(value.id,'install',value.revision);
      for(let i=0;i<100&&f.calls.length===prior;i++)await new Promise(r=>setTimeout(r,5));assert.equal(f.calls.length,prior+1);
      if(mode==='owner')await pool.query("update field.memberships set role='editor' where organization_id=$1 and user_id=$2",[f.org,f.owner]);else f.as(null);
      f.release();const result=await installing;assert.equal(result.statusCode,409,result.body);
      assert.equal((await pool.query('select count(*)::int n from field.site_ap_installations where site_id=$1',[f.site])).rows[0].n,0);
    }finally{await f.close();}
  }
});
test('Field installation OAuth purpose alone requests write scope, and ordinary reconnect keeps original scopes',async()=>{
  const f=await fixture();try{
    const regular=await f.call('POST','/v1/connections/ap/start',{organizationId:f.org});assert.equal(regular.statusCode,201,regular.body);
    assert.ok(!new URL(regular.json().authorizationUrl).searchParams.get('scope')!.includes('ap.deployments.manage'));
    const install=await f.call('POST','/v1/connections/ap/start',{organizationId:f.org,purpose:'installation'});assert.equal(install.statusCode,201,install.body);
    assert.ok(new URL(install.json().authorizationUrl).searchParams.get('scope')!.includes('ap.deployments.manage'));
    assert.equal((await pool.query('select count(*)::int n from field.ap_oauth_attempts where organization_id=$1 and requested_installation',[f.org])).rows[0].n,1);
  }finally{await f.close();}
});
test('Field refresh rotates own encrypted credential and AP outage preserves direct site plus original intent',async()=>{
  const f=await fixture();try{
    let value=(await f.create()).json();const old=(await pool.query('select refresh_token_cipher from field.ap_connections where id=$1',[f.connection])).rows[0].refresh_token_cipher as Buffer;
    await f.expire(false);const connected=await f.step(value.id,'connect',value.revision);assert.equal(connected.statusCode,200,connected.body);value=connected.json();
    const current=(await pool.query('select refresh_token_cipher from field.ap_connections where id=$1',[f.connection])).rows[0].refresh_token_cipher as Buffer;
    assert.notDeepEqual(current,old);f.offline();const unavailable=await f.step(value.id,'prepare',value.revision);assert.equal(unavailable.statusCode,503,unavailable.body);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).statusCode,200);
    assert.equal((await f.call('GET','/v1/sites/ap-public-installations')).json().intents[0].id,value.id);
    assert.equal(f.calls.length,1);
  }finally{await f.close();}
});
test('Field reverse selection revoke cannot be bypassed through installation-only access on a review connection',async()=>{
  const f=await fixture();try{
    const session=randomUUID(),client=randomUUID(),selection=randomUUID();
    await pool.query('insert into "session"(id,"userId",token,"expiresAt","updatedAt") values($1,$2,$3,now()+interval \'1 day\',now())',[session,f.owner,randomUUID()]);
    await pool.query(`insert into "oauthClient"(id,"clientId",name,"clientSecret",scopes,"redirectUris","applicationType")
      values($1,$1,'Synthetic AP reverse','synthetic','["field.facts.read"]','["https://ap.example.invalid/callback"]','web')`,[client]);
    await pool.query(`insert into field.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,requested_scopes,selection_expires_at)
      values($1,$2,$3,$4,$5,array['field.facts.read'],now()+interval '5 minutes')`,[selection,session,f.owner,client,f.org]);
    await pool.query("update field.ap_connections set status='review_required',field_actor_user_id=$2,field_grant_id=$3 where id=$1",[f.connection,f.owner,selection]);
    const value=await f.full(),prior=f.calls.length;
    assert.ok((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).json().apWidget);
    await pool.query("update field.memberships set role='editor' where organization_id=$1 and user_id=$2",[f.org,f.owner]);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).json().apWidget,null);
    await pool.query("update field.memberships set role='owner' where organization_id=$1 and user_id=$2",[f.org,f.owner]);
    await pool.query('update field.oauth_selections set revoked_at=now() where id=$1',[selection]);
    assert.equal((await f.step(value.id,'refresh',value.revision)).statusCode,409);assert.equal(f.calls.length,prior);
    assert.equal((await f.call('GET','/v1/sites/ap-public-installations')).json().intents[0].available,false);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).json().apWidget,null);
  }finally{await f.close();}
});
test('Field pause hides the local SDK before a lost AP acknowledgement and replays its original If-Match',async()=>{
  const f=await fixture();try{
    const value=await f.full(),key=randomUUID(),prior=f.calls.length;f.lost();
    const unknown=await f.step(value.id,'pause',value.revision,key);assert.equal(unknown.statusCode,503,unknown.body);
    const listed=(await f.call('GET','/v1/sites/ap-public-installations')).json().intents[0];
    assert.equal(listed.fieldStatus,'paused');assert.equal(listed.pendingOperation.requestKey,key);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).json().apWidget,null);
    assert.equal((await f.step(value.id,'refresh',value.revision)).statusCode,409);
    assert.equal((await f.step(value.id,'pause',value.revision,key)).statusCode,200);
    assert.deepEqual(f.calls[prior],f.calls[prior+1]);assert.match(f.calls[prior]!.revision!,/^"\d+"$/);
  }finally{await f.close();}
});
test('Field local pause fences an in-flight SDK installation even when no installation row exists yet',async()=>{
  const f=await fixture();try{
    let value=(await f.create()).json();for(const action of ['connect','prepare','verify','activate'])value=(await f.step(value.id,action,value.revision)).json();
    const prior=f.calls.length;f.hold();const installing=f.step(value.id,'install',value.revision);
    for(let i=0;i<100&&f.calls.length===prior;i++)await new Promise(r=>setTimeout(r,5));assert.equal(f.calls.length,prior+1);
    assert.equal((await f.call('POST','/v1/sites/ap-installation/pause',{})).statusCode,200);
    f.release();const result=await installing;assert.equal(result.statusCode,409,result.body);
    assert.equal(result.json().error,'local_visibility_changed');
    assert.equal((await pool.query('select count(*)::int n from field.site_ap_installations where site_id=$1',[f.site])).rows[0].n,0);
  }finally{await f.close();}
});
test('Field committed connect remains original-UUID unknown across a temporarily lost Field session',async()=>{
  const f=await fixture();try{
    const value=(await f.create()).json(),key=randomUUID(),prior=f.calls.length;f.hold();const connecting=f.step(value.id,'connect',value.revision,key);
    for(let i=0;i<100&&f.calls.length===prior;i++)await new Promise(r=>setTimeout(r,5));assert.equal(f.calls.length,prior+1);
    f.as(null);f.release();assert.equal((await connecting).statusCode,409);f.as(f.owner);
    const pending=(await f.call('GET','/v1/sites/ap-public-installations')).json().intents[0].pendingOperation;
    assert.ok(pending);assert.equal(pending.state,'unknown');assert.equal(pending.requestKey,key);
    assert.equal((await f.step(value.id,'connect',value.revision,key)).statusCode,200);
    assert.deepEqual(f.calls[prior],f.calls[prior+1]);
  }finally{await f.close();}
});
