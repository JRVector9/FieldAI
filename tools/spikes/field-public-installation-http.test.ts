import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Client, Pool } from 'pg';
import { createAgentApp } from '../../apps/agent-api/src/app.js';
import { createFieldApp } from '../../apps/field-api/src/app.js';

const root=resolve(import.meta.dirname,'../..');
test('Actual Field HTTP BFF persists lost AP commit and replays the same UUID; SDK approval and revoke use public contract',async()=>{
  const owned:{product:'agent'|'field';name:string;admin:Client;pool:Pool}[]=[];
  let ap:ReturnType<typeof createAgentApp>|undefined,field:ReturnType<typeof createFieldApp>|undefined;
  try {
    for(const product of ['agent','field'] as const) {
      const prefix=product==='agent'?'AP':'FIELD',port=product==='agent'?'55431':'55432',user=product==='agent'?'agent_local':'field_local';
      process.loadEnvFile(resolve(root,`infra/${product}/.env`));
      const source=new URL(process.env[`${prefix}_DATABASE_URL`]!);
      assert.equal(source.hostname,'127.0.0.1');assert.equal(source.port,port);assert.equal(source.username,user);
      assert.equal(source.pathname,`/fieldai_${product}_mock`);
      const adminUrl=new URL(source);adminUrl.pathname='/postgres';const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
      const name=`fieldai_${product}_test_${randomUUID().replaceAll('-','')}`;await admin.query(`create database "${name}"`);source.pathname='/'+name;
      owned.push({product,name,admin,pool:new Pool({connectionString:source.toString()})});
      const env={...process.env,[`${prefix}_DATABASE_URL`]:source.toString(),[`${prefix}_PROFILE`]:'mock'};
      for(const key of Object.keys(env))if(key.startsWith(product==='agent'?'FIELD_':'AP_')||key.startsWith(product==='agent'?'AP_FIELD_':'FIELD_AP_'))delete env[key];
      const result=spawnSync(process.execPath,['tools/run-migrations.mjs',product],{cwd:root,env,stdio:'pipe'});
      assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr.toString());
    }
    process.env.AP_PROFILE='mock';process.env.FIELD_PROFILE='mock';process.env.FIELD_PUBLIC_WEB_ORIGIN='http://localhost:3002';
    const apPool=owned[0]!.pool,fieldPool=owned[1]!.pool,apActor=randomUUID(),session=randomUUID();
    await apPool.query('insert into "user"(id,name,email,"emailVerified") values($1,\'AP HTTP owner\',$2,true)',[apActor,apActor+'@example.invalid']);
    await apPool.query('insert into "session"(id,"userId",token,"expiresAt","updatedAt") values($1,$2,$3,now()+interval \'1 day\',now())',[session,apActor,randomUUID()]);
    ap=createAgentApp(async()=>undefined,undefined,undefined,undefined,{pool:apPool,resolveUserId:async()=>apActor,verifyDomain:async()=>true});
    const apOrigin=await ap.listen({host:'127.0.0.1',port:0});process.env.AP_AUTH_BASE_URL=apOrigin;
    const orgResponse=await ap.inject({method:'POST',url:'/v1/organizations',payload:{name:'AP HTTP synthetic'}});
    assert.equal(orgResponse.statusCode,201,orgResponse.body);const apOrg=orgResponse.json().id as string;
    assert.equal((await ap.inject({method:'PUT',url:'/v1/knowledge/draft',payload:{expectedRevision:0,businessName:'Synthetic',introduction:'Approved',services:[],faqs:[]}})).statusCode,200);
    assert.equal((await ap.inject({method:'POST',url:'/v1/knowledge/releases',payload:{expectedRevision:1}})).statusCode,201);
    const agentResponse=await ap.inject({method:'PUT',url:'/v1/agents/draft',payload:{expectedRevision:0,name:'Synthetic AI',tone:'clear',guideScope:'Approved information',handoffText:'문의하세요.'}});
    assert.equal(agentResponse.statusCode,200,agentResponse.body);const ai=agentResponse.json().agentId as string;
    assert.equal((await ap.inject({method:'POST',url:'/v1/agents/releases',payload:{expectedRevision:1,expectedKnowledgeRevision:1}})).statusCode,201);
    const client=randomUUID(),grant=randomUUID(),token=randomBytes(32).toString('base64url'),scopes=['ap.agent.read','ap.conversations.read','ap.connections.create','ap.deployments.manage'];
    await apPool.query(`insert into "oauthClient"(id,"clientId",name,"clientSecret",scopes,"redirectUris","applicationType")
      values($1,$1,'Field HTTP consumer','synthetic',$2,'["https://field.example.invalid/callback"]','web')`,[client,JSON.stringify(scopes)]);
    await apPool.query(`insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,agent_id,requested_scopes,selection_expires_at)
      values($1,$2,$3,$4,$5,$6,$7,now()+interval '5 minutes')`,[grant,session,apActor,client,apOrg,ai,scopes]);
    const resources=JSON.stringify([new URL('/integrations/v1',apOrigin).toString()]);
    await apPool.query(`insert into "oauthConsent"(id,"clientId","userId","referenceId",resources,scopes,"createdAt","updatedAt")
      values($1,$2,$3,$4,$5,$6,now(),now())`,[randomUUID(),client,apActor,grant,resources,JSON.stringify(scopes)]);
    await apPool.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId",resources,scopes,"expiresAt","createdAt")
      values($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes',now())`,[randomUUID(),createHash('sha256').update(token).digest('base64url'),client,apActor,grant,resources,JSON.stringify(scopes)]);
    const actor=randomUUID(),org=randomUUID(),site=randomUUID(),connection=randomUUID(),slug='field-'+randomBytes(6).toString('hex');
    await fieldPool.query('insert into "user"(id,name,email,"emailVerified") values($1,\'Field HTTP owner\',$2,true)',[actor,actor+'@example.invalid']);
    await fieldPool.query('insert into field.organizations(id,owner_user_id,name) values($1,$2,\'Field HTTP synthetic\')',[org,actor]);
    await fieldPool.query("insert into field.memberships(organization_id,user_id,role) values($1,$2,'owner')",[org,actor]);
    await fieldPool.query('insert into field.sites(id,organization_id,slug) values($1,$2,$3)',[site,org,slug]);
    const catalog=randomUUID();
    await fieldPool.query('insert into field.catalog_releases(id,organization_id,revision,content,content_hash,approved_by) values($1,$2,1,$3,\'synthetic\',$4)',[catalog,org,JSON.stringify({businessName:'Synthetic',services:[]}),actor]);
    await fieldPool.query('insert into field.site_releases(id,site_id,revision,content,content_hash,catalog_release_id,catalog_revision,published_by) values($1,$2,1,$3,\'synthetic\',$4,1,$5)',[randomUUID(),site,JSON.stringify({template:'essential',palette:'#ffffff',pages:[]}),catalog,actor]);
    const tokenKey=randomBytes(32),seal=(value:string)=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',tokenKey,iv);return Buffer.concat([iv,cipher.update(value),cipher.final(),cipher.getAuthTag()]);};
    await fieldPool.query(`insert into field.ap_connections(id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,
      ap_organization_id,ap_agent_id,ap_agent_name,ap_agent_revision,allowed_deployment_ids,scopes,access_token_cipher,
      refresh_token_cipher,access_expires_at,status) values($1,$2,$3,$4,$5,$6,$7,$8,'HTTP synthetic AI',1,'{}',$9,$10,$11,now()+interval '1 hour','pending_field_consent')`,
    [connection,org,actor,apOrigin+'/api/auth',client,grant,apOrg,ai,scopes,seal(token),seal('synthetic-refresh')]);
    let corrupt=true,loseSessionAfterConnection=false,fieldSessionActive=true;
    const transport=(async(url,init)=>{const response=await fetch(url,init);
      if(corrupt&&String(url).endsWith('/connections')){corrupt=false;const value=await response.json() as Record<string,unknown>;delete value.operation_id;return Response.json(value,{status:response.status});}
      if(loseSessionAfterConnection&&String(url).endsWith('/connections')){loseSessionAfterConnection=false;fieldSessionActive=false;}
      return response;}) as typeof fetch;
    const runtime={pool:fieldPool,resolveUserId:async(h:Record<string,unknown>)=>fieldSessionActive&&h['x-test-field-actor']===actor?actor:null,
      apConnector:{issuer:apOrigin+'/api/auth',clientId:client,clientSecret:'synthetic',tokenKey,
        redirectUri:'http://127.0.0.1:4321/v1/connections/ap/callback',webOrigin:'http://localhost:3002',fetcher:transport}};
    field=createFieldApp(async()=>undefined,undefined,undefined,runtime);
    const fieldOrigin=await field.listen({host:'127.0.0.1',port:0});
    const call=async(path:string,body?:Record<string,unknown>)=>{const response=await fetch(fieldOrigin+path,{method:body?'POST':'GET',
      headers:{'x-test-field-actor':actor,'x-organization-id':org,origin:'http://localhost:3002',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,value:await response.json() as Record<string,unknown>};};
    const opened=await call('/v1/sites/ap-public-installations',{requestKey:randomUUID(),connectionId:connection,origin:`http://${slug}.localhost:3002`,mode:'floating',approval:true});assert.equal(opened.status,201,JSON.stringify(opened.value));
    let value=opened.value;const key=randomUUID(),path=`/v1/sites/ap-public-installations/${value.id}/actions`;
    const body={action:'connect',requestKey:key,expectedRevision:value.revision};
    const unknown=await call(path,body);assert.equal(unknown.status,503);assert.equal(unknown.value.error,'ap_public_write_result_unknown');
    assert.equal((await apPool.query('select count(*)::int n from ap.public_installation_connections where selection_id=$1',[grant])).rows[0].n,1);
    assert.equal((await fieldPool.query('select state from field.ap_public_installation_operations where request_key=$1',[key])).rows[0].state,'unknown');
    const recovered=await call(path,body);assert.equal(recovered.status,200,JSON.stringify(recovered.value));value=recovered.value;
    for(const action of ['prepare','verify','activate','install']){const response=await call(path,{action,requestKey:randomUUID(),expectedRevision:value.revision});assert.equal(response.status,200,JSON.stringify(response.value));value=response.value;}
    assert.equal(value.state,'installed');
    const publicSite=await fetch(fieldOrigin+`/v1/public/sites/${slug}`);assert.equal(publicSite.status,200);assert.ok((await publicSite.json()).apWidget);
    assert.deepEqual((await apPool.query('select allowed_deployment_ids from ap.oauth_selections where id=$1',[grant])).rows[0].allowed_deployment_ids,[]);
    const paused=await call(path,{action:'pause',requestKey:randomUUID(),expectedRevision:value.revision});assert.equal(paused.status,200);value=paused.value;
    const second=await call('/v1/sites/ap-public-installations',{requestKey:randomUUID(),connectionId:connection,origin:`http://${slug}.localhost:3002`,mode:'floating',approval:true});assert.equal(second.status,201);
    const secondPath=`/v1/sites/ap-public-installations/${second.value.id}/actions`,secondKey=randomUUID();
    const secondBody={action:'connect',requestKey:secondKey,expectedRevision:second.value.revision};loseSessionAfterConnection=true;
    const authorityLost=await call(secondPath,secondBody);assert.equal(authorityLost.status,409);assert.equal(authorityLost.value.retryable,true);
    assert.equal((await fieldPool.query('select state from field.ap_public_installation_operations where request_key=$1',[secondKey])).rows[0].state,'unknown');
    assert.equal((await apPool.query('select count(*)::int n from ap.public_installation_connections where selection_id=$1',[grant])).rows[0].n,2);
    fieldSessionActive=true;assert.equal((await call(secondPath,secondBody)).status,200);
    assert.equal((await apPool.query('select count(*)::int n from ap.public_installation_connections where selection_id=$1',[grant])).rows[0].n,2);
    await apPool.query('update ap.oauth_selections set revoked_at=now() where id=$1',[grant]);
    assert.equal((await call(path,{action:'refresh',requestKey:randomUUID(),expectedRevision:value.revision})).status,401);
    assert.equal((await call('/v1/sites/ap-installation/pause',{})).status,200);
    const fallback=await fetch(fieldOrigin+`/v1/public/sites/${slug}`);assert.equal(fallback.status,200);assert.equal((await fallback.json()).apWidget,null);
  }finally {
    if(field)await field.close();if(ap)await ap.close();
    for(const item of owned.reverse()) {
      await item.pool.end();let n=0;for(let i=0;i<50;i++){n=(await item.admin.query('select count(*)::int n from pg_stat_activity where datname=$1',[item.name])).rows[0].n as number;if(!n)break;await new Promise(r=>setTimeout(r,20));}
      assert.equal(n,0,'own test clients must close before database drop');await item.admin.query(`drop database "${item.name}"`);await item.admin.end();
    }
  }
});
