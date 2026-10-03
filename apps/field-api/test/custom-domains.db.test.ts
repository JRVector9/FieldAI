import assert from 'node:assert/strict';
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { createFieldApp } from '../src/app.js';
import { Client, Pool } from 'pg';
import type { FieldBusinessRuntime } from '../src/business.js';
import type { CustomDomainContext } from '../src/custom-domains.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
const databaseUrl = process.env.FIELD_DATABASE_URL!, originalWebOrigin=process.env.FIELD_PUBLIC_WEB_ORIGIN;
process.env.FIELD_PUBLIC_WEB_ORIGIN='http://localhost:3002';
let admin: Client, outerProbe: Client;
const databases = new Set<string>();
before(async () => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55432');
  assert.equal(url.username, 'field_local'); assert.match(url.pathname, /^\/fieldai_field_test_[a-f0-9]+$/);
  outerProbe=new Client({connectionString:databaseUrl});await outerProbe.connect();
  url.pathname = '/postgres'; admin = new Client({ connectionString: url.toString() }); await admin.connect();
});
after(async () => {
  for (const name of databases) await admin.query(`drop database "${name}" with(force)`);
  await outerProbe.end();await admin.end();
  if(originalWebOrigin===undefined)delete process.env.FIELD_PUBLIC_WEB_ORIGIN;else process.env.FIELD_PUBLIC_WEB_ORIGIN=originalWebOrigin;
});
async function fixture(withAp=false) {
  const routes = await import('../src/custom-domain-routes.js').catch(() => null);
  const execution = await import('../src/custom-domain-execution.js').catch(() => null);
  assert.ok(routes, 'custom domain routes are not implemented');
  assert.ok(execution, 'custom domain worker execution is not implemented');
  const source = new URL(databaseUrl), name = `fieldai_field_test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`create database "${name}"`); databases.add(name);
  source.pathname = `/${name}`;
  const migrated=spawnSync(process.execPath,['tools/run-migrations.mjs','field'],{cwd:resolve('../..'),env:{...process.env,FIELD_DATABASE_URL:source.toString()},stdio:'inherit'});
  assert.equal(migrated.error,undefined);assert.equal(migrated.signal,null);assert.equal(migrated.status,0);
  const pool = new Pool({ connectionString: source.toString() });
  const owner = randomUUID(), other = randomUUID(), editor = randomUUID(), org = randomUUID(), otherOrg = randomUUID();
  const siteId = randomUUID(), otherSiteId = randomUUID(), slug = `field-${randomBytes(6).toString('hex')}`;
  for (const id of [owner, other, editor]) await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)', [id, 'Synthetic domain', `${id}@example.invalid`]);
  for (const [id,user] of [[org,owner],[otherOrg,other]]) {
    await pool.query('insert into field.organizations(id,owner_user_id,name) values($1,$2,$3)', [id,user,'Synthetic domain business']);
    await pool.query("insert into field.memberships(organization_id,user_id,role) values($1,$2,'owner')", [id,user]);
  }
  await pool.query("insert into field.memberships(organization_id,user_id,role) values($1,$2,'editor')", [org,editor]);
  await pool.query('insert into field.sites(id,organization_id,slug) values($1,$2,$3)', [siteId,org,slug]);
  await pool.query('insert into field.sites(id,organization_id,slug) values($1,$2,$3)', [otherSiteId,otherOrg,`field-${randomBytes(6).toString('hex')}`]);
  const catalogId=randomUUID(), content={template:'essential',palette:'#ffffff',pages:[{id:randomUUID(),slug:'home',title:'Home',sections:[]}]};
  await pool.query('insert into field.catalog_releases(id,organization_id,revision,content,content_hash,approved_by) values($1,$2,1,$3,$4,$5)',[catalogId,org,JSON.stringify({businessName:'Synthetic',introduction:'Intro',services:[]}), 'synthetic-hash',owner]);
  await pool.query('insert into field.site_releases(id,site_id,revision,content,content_hash,catalog_release_id,catalog_revision,published_by) values($1,$2,1,$3,$4,$5,1,$6)',[randomUUID(),siteId,JSON.stringify(content),'synthetic-hash',catalogId,owner]);
  let actor: string|null=owner, ownership=true, routing=true, providerMode:'ready'|'pending'|'mismatch'|'expired'|'lost'='ready';
  let hold: Promise<void>|undefined, release: (()=>void)|undefined;
  const bindingCalls: {hostname:string;siteId:string;requestKey:string;generation:number}[]=[];
  const removalCalls:{hostname:string;siteId:string;domainId:string;requestKey:string;generation:number}[]=[];
  let removeMode:'ready'|'unknown'|'pending'='ready';
  const context={webOrigin:'http://localhost:3002',baseDomain:'sites.platform.com',target:'edge.platform.com',
    dns:{async inspect(){return {ownership,routing};}},
    edge:{async ensureBinding(input:{hostname:string;siteId:string;requestKey:string;generation:number}){
      bindingCalls.push(input); if(bindingCalls.length===1)await hold;
      if(providerMode==='lost')throw new Error('private provider error must not persist');
      return {hostname:providerMode==='mismatch'?'someone.example.com':input.hostname,siteId:input.siteId,generation:input.generation,
        state:providerMode==='pending'?'pending' as const:'ready' as const,
        certificateExpiresAt:new Date(Date.now()+(providerMode==='expired'?-60_000:86_400_000)).toISOString()};
    },async removeBinding(input:{hostname:string;siteId:string;domainId:string;requestKey:string;generation:number}){
      removalCalls.push(input);if(removeMode==='unknown')throw new Error('private remote removal error');return removeMode==='ready';
    }},};
  const runtime:FieldBusinessRuntime={pool,resolveUserId:async()=>actor,customDomain:context,
    apConnector:withAp?{issuer:'https://ap.example.com/api/auth',clientId:'synthetic-client',clientSecret:'synthetic-secret',tokenKey:randomBytes(32),
      redirectUri:'http://localhost:3002/callback',webOrigin:'http://localhost:3002',fetcher:async()=>new Response('',{status:503})}:undefined};
  const app=createFieldApp(async()=>undefined,undefined,'http://127.0.0.1:4321',runtime);
  const call=(method:'GET'|'POST',url:string,payload?:Record<string,unknown>,organizationId=org,origin=context.webOrigin)=>app.inject({method,url,headers:{'x-organization-id':organizationId,origin},payload});
  const create=async(hostname='shop.example.com',key=randomUUID())=>call('POST','/v1/sites/domains',{hostname,requestKey:key});
  return {pool,app,runtime,org,otherOrg,owner,other,editor,siteId,slug,context,bindingCalls,removalCalls,call,create,
    run:(value:CustomDomainContext=context)=>execution.runCustomDomainOnce({pool,context:value}),
    due:()=>pool.query('update field.site_domains set next_check_at=now()'),
    as:(value:string|null)=>{actor=value;}, dns:(a:boolean,b:boolean)=>{ownership=a;routing=b;}, mode:(value:typeof providerMode)=>{providerMode=value;},removeMode:(value:typeof removeMode)=>{removeMode=value;},
    hold:()=>{hold=new Promise<void>(r=>{release=r;});},release:()=>{release?.();hold=undefined;},
    close:async()=>{release?.();await app.close();await pool.end();await admin.query(`drop database "${name}"`);databases.delete(name);},};
}

test('Field domain registration requires owner and exact CSRF origin; UUID retry does not transfer a hostname',async()=>{
  const f=await fixture();try{
    f.as(null);assert.equal((await f.create()).statusCode,401);f.as(f.editor);assert.equal((await f.create()).statusCode,404);
    f.as(f.owner);assert.equal((await f.call('POST','/v1/sites/domains',{hostname:'shop.example.com',requestKey:randomUUID()},f.org,'https://evil.example.com')).statusCode,403);
    const key=randomUUID(), first=await f.create('SHOP.example.com',key);assert.equal(first.statusCode,201,first.body);
    const opened=first.json();assert.equal(opened.state,'registered');assert.match(opened.verification.txtValue,/^field-domain=[A-Za-z0-9_-]{43}$/);
    assert.equal((await f.create('shop.example.com',key)).json().id,opened.id);
    assert.equal((await f.create('other.example.com',key)).statusCode,409);
    f.as(f.other);assert.equal((await f.call('POST','/v1/sites/domains',{hostname:'shop.example.com',requestKey:randomUUID()},f.otherOrg)).statusCode,201);
    assert.equal((await f.call('GET',`/v1/sites/domains/${opened.id}`,undefined,f.otherOrg)).statusCode,404);
    f.as(f.owner);const publicSite=await f.app.inject({url:`/v1/public/sites/${f.slug}`});assert.equal(publicSite.statusCode,200);assert.equal(publicSite.json().siteOrigin,`http://${f.slug}.localhost:3002`);
  }finally{await f.close();}
});

test('Field requires ownership DNS and exact TLS binding before selecting a custom canonical; the base URL stays public',async()=>{
  const f=await fixture();try{
    const opened=(await f.create()).json();f.dns(false,true);assert.equal(await f.run(),'ownership_pending');
    assert.equal((await f.call('POST',`/v1/sites/domains/${opened.id}/primary`,{})).statusCode,409);assert.equal(f.bindingCalls.length,0);
    f.dns(true,false);await f.due();assert.equal(await f.run(),'dns_pending');assert.equal(f.bindingCalls.length,0);
    f.dns(true,true);await f.due();f.mode('pending');assert.equal(await f.run(),'tls_pending');
    await f.due();f.mode('mismatch');assert.equal(await f.run(),'error');
    await f.due();f.mode('expired');assert.equal(await f.run(),'error');
    await f.due();f.mode('ready');assert.equal(await f.run(),'connected');
    assert.equal((await f.call('POST',`/v1/sites/domains/${opened.id}/primary`,{})).statusCode,200);
    const resolved=await f.app.inject({url:'/v1/public/site-hosts/shop.example.com'});assert.equal(resolved.statusCode,200);assert.equal(resolved.json().slug,f.slug);
    const defaultSite=await f.app.inject({url:`/v1/public/sites/${f.slug}`});assert.equal(defaultSite.statusCode,200);assert.equal(defaultSite.json().siteOrigin,'https://shop.example.com');assert.equal(defaultSite.json().defaultOrigin,`http://${f.slug}.localhost:3002`);assert.equal(defaultSite.json().requestOrigin,`http://${f.slug}.localhost:3002`);assert.equal(defaultSite.json().apWidget,null);
    const customSite=await f.app.inject({url:`/v1/public/sites/${f.slug}?host=shop.example.com`});assert.equal(customSite.statusCode,200);assert.equal(customSite.json().requestOrigin,'https://shop.example.com');
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}?host=someone.example.com`})).statusCode,404);
    assert.equal((await f.app.inject({url:'/v1/public/site-hosts/shop.example.com:443'})).statusCode,404);
    await f.due();f.dns(true,false);assert.equal(await f.run(),'dns_pending');
    assert.equal((await f.app.inject({url:'/v1/public/site-hosts/shop.example.com'})).statusCode,404);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).json().siteOrigin,`http://${f.slug}.localhost:3002`);
  }finally{await f.close();}
});

test('Field on-demand TLS ask allows only a verified active custom domain and never writes',async()=>{
  const f=await fixture();try{
    const ask=(query:string)=>f.app.inject({url:`/v1/public/site-hosts/allow${query}`});
    const opened=(await f.create()).json();
    // 등록 직후·소유권 미확인·라우팅 미확인 단계에서는 인증서 발급을 거부한다.
    assert.equal((await ask('?domain=shop.example.com')).statusCode,404);
    f.dns(false,true);assert.equal(await f.run(),'ownership_pending');assert.equal((await ask('?domain=shop.example.com')).statusCode,404);
    f.dns(true,false);await f.due();assert.equal(await f.run(),'dns_pending');assert.equal((await ask('?domain=shop.example.com')).statusCode,404);
    // 소유권·DNS가 검증되면 첫 인증서를 받아야 하므로 tls_pending부터 허용한다.
    f.dns(true,true);await f.due();f.mode('pending');assert.equal(await f.run(),'tls_pending');
    const before=await f.pool.query("select (select count(*) from field.outbox)::int as outbox,(select max(updated_at) from field.site_domains) as updated");
    const allowed=await ask('?domain=SHOP.Example.COM');
    assert.equal(allowed.statusCode,200);assert.equal(allowed.headers['cache-control'],'no-store');
    assert.deepEqual(allowed.json(),{domain:'shop.example.com',organizationId:f.org});
    const after=await f.pool.query("select (select count(*) from field.outbox)::int as outbox,(select max(updated_at) from field.site_domains) as updated");
    assert.deepEqual(after.rows[0],before.rows[0]);
    await f.due();f.mode('ready');assert.equal(await f.run(),'connected');
    assert.equal((await ask('?domain=shop.example.com')).statusCode,200);
    for(const query of ['','?domain=','?domain=other.example.com','?domain=shop.example.com:443','?domain=127.0.0.1',
      `?domain=${f.slug}.sites.platform.com`,'?domain=shop.example.com&domain=other.example.com']){
      const denied=await ask(query);assert.equal(denied.statusCode,404,query);assert.equal(denied.headers['cache-control'],'no-store');
    }
    // 연결 해제 후에는 새 인증서 발급·갱신을 허용하지 않는다.
    assert.equal((await f.call('POST',`/v1/sites/domains/${opened.id}/disconnect`,{})).statusCode,200);
    assert.equal((await ask('?domain=shop.example.com')).statusCode,404);
  }finally{await f.close();}
});

// F-O16: 삭제 예약·실행된 조직의 도메인은 TLS 발급·갱신을 거부하고, 삭제 실행은 사업자 해제와 같은 경로로 도메인을 놓아준다.
test('Field organization deletion denies TLS ask and releases the custom domain claim',async()=>{
  const f=await fixture();try{
    const {runOrganizationDeletionOnce}=await import('../src/account-deletion.js');
    const ask=()=>f.app.inject({url:'/v1/public/site-hosts/allow?domain=shop.example.com'});
    const opened=(await f.create()).json();assert.equal(await f.run(),'connected');
    assert.equal((await ask()).statusCode,200);
    const requestId=randomUUID();
    await f.pool.query(`insert into field.organization_deletion_requests(id,organization_id,requested_by,confirmation,status,requested_at,scheduled_at,next_attempt_at)
      values($1,$2,$3,'{}'::jsonb,'scheduled',now()-interval '15 days',now()+interval '1 day',now()+interval '1 day')`,[requestId,f.org,f.owner]);
    assert.equal((await ask()).statusCode,404);
    await f.pool.query("update field.organization_deletion_requests set status='canceled',canceled_at=now(),canceled_by=$2 where id=$1",[requestId,f.owner]);
    assert.equal((await ask()).statusCode,200);
    const again=randomUUID();
    await f.pool.query(`insert into field.organization_deletion_requests(id,organization_id,requested_by,confirmation,status,requested_at,scheduled_at,next_attempt_at)
      values($1,$2,$3,'{}'::jsonb,'scheduled',now()-interval '15 days',now()-interval '1 minute',now()-interval '1 minute')`,[again,f.org,f.owner]);
    assert.equal(await runOrganizationDeletionOnce({pool:f.pool}),'executed');
    assert.equal((await ask()).statusCode,404);
    const released=(await f.pool.query('select desired_state,state,is_primary from field.site_domains where id=$1',[opened.id])).rows[0];
    assert.deepEqual(released,{desired_state:'disconnected',state:'release_pending',is_primary:false});
    assert.equal((await f.pool.query('select steps from field.organization_deletion_requests where id=$1',[again])).rows[0].steps.executed.domainsDisconnected,1);
    // 도메인 작업자가 edge 바인딩을 지우고 claim을 놓으면 실제 도메인 주인이 다른 조직에서 다시 쓸 수 있다.
    await f.due();assert.equal(await f.run(),'disconnected');assert.equal(f.removalCalls.length,1);
    assert.equal((await f.pool.query('select hostname_claimed from field.site_domains where id=$1',[opened.id])).rows[0].hostname_claimed,false);
    f.as(f.other);const reused=await f.call('POST','/v1/sites/domains',{hostname:'shop.example.com',requestKey:randomUUID()},f.otherOrg);
    assert.equal(reused.statusCode,201,reused.body);
    await f.due();assert.equal(await f.run(),'connected');
  }finally{await f.close();}
});

// Caddy edge 어댑터(추가): 상태 경로는 ask와 같은 도메인에만 서버 비밀값 HMAC 증명을 주고, 작업자는 그 증명이 같은 도메인·조직일 때만 연결한다.
// TLS 확인 유예는 DB(checked_at·last_error)에 남는다. 이전 기대(어댑터 메모리 유예, error 뒤 다음 점검에서 tls_pending으로 복귀,
// error에서 상태 경로 404)는 L1~L3 수정으로 바뀌었다: 여러 작업자·재시작이 같은 유예를 보고, error는 확인 성공 전까지 유지되며
// 그동안 ask·상태 경로를 열어 재발급·재확인이 가능해야 하기 때문이다.
test('Field Caddy edge connects only after the site health route proves the same domain and organization over the edge',async()=>{
  const f=await fixture();try{
    const {createCaddyDomainEdge,siteHealthProof}=await import('../src/custom-domain-edge-caddy.js');
    const secret=process.env.FIELD_AUTH_SECRET!;assert.ok(secret);
    const health=(host:string)=>f.app.inject({url:'/.well-known/field-site-health',headers:{host}});
    // 실제 TLS 대신 Host만 바꿔 같은 앱의 상태 경로를 읽는다(인증서 검증은 단위 검수가 맡는다).
    let tlsUp=true;const probed:string[]=[];
    const probe=async(hostname:string)=>{
      probed.push(hostname);if(!tlsUp)return {ok:false as const,reason:'certificate_untrusted' as const};
      const response=await health(hostname);
      return response.statusCode===200?{ok:true as const,proof:response.json().proof as string,certificateExpiresAt:new Date(Date.now()+86_400_000).toISOString()}
        :{ok:false as const,reason:'health_status' as const};
    };
    const caddy={...f.context,edge:createCaddyDomainEdge({secret,probe})};
    const read=async()=>(await f.pool.query('select state,tls_state,last_error,checked_at from field.site_domains where id=$1',[opened.id])).rows[0];
    const statusEvents=async()=>(await f.pool.query("select count(*)::integer as count from field.outbox where event_type='field.site.domain.status' and aggregate_id=$1",[opened.id])).rows[0].count;
    const opened=(await f.create()).json();
    assert.equal((await health('shop.example.com')).statusCode,404);
    // 첫 점검 중에는 아직 ask 허용 전(verifying)이라 상태 경로가 거부한다. 이 실패는 유예를 시작하지 않는다.
    assert.equal(await f.run(caddy),'tls_pending');assert.deepEqual(probed,['shop.example.com']);
    assert.equal((await read()).last_error,'domain_tls_pending');
    const allowed=await health('SHOP.example.com');assert.equal(allowed.statusCode,200);assert.equal(allowed.headers['cache-control'],'no-store');
    // 공개 조회로 알 수 있는 조직 ID 대신 서버 비밀값 HMAC(도메인:조직)을 증명으로 준다.
    assert.deepEqual(allowed.json(),{ok:true,proof:siteHealthProof(secret,'shop.example.com',f.org)});
    // tls_pending 점검 중에도 ask·상태 경로 허용을 유지해 인증서 발급과 확인이 가능하다.
    await f.due();assert.equal(await f.run(caddy),'connected');
    assert.equal((await f.app.inject({url:'/v1/public/site-hosts/shop.example.com'})).statusCode,200);
    for(const host of ['other.example.com',`${f.slug}.sites.platform.com`,'127.0.0.1','shop.example.com:8443'])
      assert.equal((await health(host)).statusCode,404,host);
    // 연결된 도메인의 TLS 확인 실패는 마지막 확정 점검 뒤 유예 시간 안에서는 연결을 유지한다.
    tlsUp=false;await f.due();assert.equal(await f.run(caddy),'connected');
    assert.equal((await read()).last_error,'domain_tls_unconfirmed');
    // 유예가 지나면 tls_pending으로 내리고 그 실패 시각(checked_at)부터 TLS 유예를 센다.
    await f.pool.query("update field.site_domains set checked_at=now()-interval '16 minutes'");
    await f.due();assert.equal(await f.run(caddy),'tls_pending');
    const graceStart=await read();assert.equal(graceStart.last_error,'domain_tls_unconfirmed');
    assert.equal((await f.app.inject({url:'/v1/public/site-hosts/shop.example.com'})).statusCode,404);
    // 유예 안의 실패는 시작 시각을 바꾸지 않는다. 메모리가 없는 새 어댑터(다른 작업자·재시작)도 같은 시각을 본다.
    const restarted={...f.context,edge:createCaddyDomainEdge({secret,probe})};
    await f.due();assert.equal(await f.run(restarted),'tls_pending');
    assert.equal((await read()).checked_at.getTime(),graceStart.checked_at.getTime());
    // 유예를 넘기면 error/domain_tls_failed로 기록한다.
    await f.pool.query("update field.site_domains set checked_at=now()-interval '16 minutes'");
    await f.due();assert.equal(await f.run(restarted),'error');
    const failed=await read();assert.deepEqual({tls_state:failed.tls_state,last_error:failed.last_error},{tls_state:'error',last_error:'domain_tls_failed'});
    const eventsAfterFailure=await statusEvents();
    // error는 확인이 성공할 때까지 유지하고(tls_pending과 왕복하지 않음), 상태가 바뀌지 않으면 사건을 더 남기지 않는다.
    // 그동안 ask·상태 경로는 열어 두어 재발급·재확인이 가능하다(사이트 연결은 connected만).
    await f.due();assert.equal(await f.run(caddy),'error');
    await f.due();assert.equal(await f.run(caddy),'error');
    assert.equal(await statusEvents(),eventsAfterFailure);
    assert.equal((await health('shop.example.com')).statusCode,200);
    assert.equal((await f.app.inject({url:'/v1/public/site-hosts/allow?domain=shop.example.com'})).statusCode,200);
    assert.equal((await f.app.inject({url:'/v1/public/site-hosts/shop.example.com'})).statusCode,404);
    // 사업자 상태 API는 원인(last_error)을 보여 준다.
    assert.equal((await f.call('GET',`/v1/sites/domains/${opened.id}`)).json().error,'domain_tls_failed');
    // TLS가 복구되면 다음 점검에서 바로 연결된다.
    tlsUp=true;await f.due();assert.equal(await f.run(caddy),'connected');
    assert.equal(await statusEvents(),eventsAfterFailure+1);
    // 연결 해제 뒤에는 상태 경로가 증명하지 않는다.
    assert.equal((await f.call('POST',`/v1/sites/domains/${opened.id}/disconnect`,{})).statusCode,200);
    assert.equal((await health('shop.example.com')).statusCode,404);
    await f.due();assert.equal(await f.run(caddy),'disconnected');
  }finally{await f.close();}
});

test('Field missing edge authority stays blocked, unknown result does not bind, and expired evidence is rejected',async()=>{
  const f=await fixture();try{
    await f.create();const missing={...f.context,edge:undefined};
    assert.equal(await f.run(missing),'blocked_integration');assert.equal(f.bindingCalls.length,0);
    await f.due();f.mode('lost');assert.equal(await f.run(),'unknown');
    assert.equal((await f.app.inject({url:'/v1/public/site-hosts/shop.example.com'})).statusCode,404);
    await f.due();f.mode('ready');assert.equal(await f.run(),'connected');
    await f.pool.query("update field.site_domains set valid_until=now()-interval '1 second'");
    assert.equal((await f.app.inject({url:'/v1/public/site-hosts/shop.example.com'})).statusCode,404);
  }finally{await f.close();}
});

test('Field disconnect fences a running validation and reconnect requires new ownership evidence',async()=>{
  const f=await fixture();try{
    const opened=(await f.create()).json();f.hold();const running=f.run();
    for(let i=0;i<100&&f.bindingCalls.length===0;i++)await new Promise(r=>setTimeout(r,5));assert.equal(f.bindingCalls.length,1);
    const stopped=await f.call('POST',`/v1/sites/domains/${opened.id}/disconnect`,{});assert.equal(stopped.statusCode,200);
    f.release();assert.equal(await running,'superseded');
    assert.equal((await f.app.inject({url:'/v1/public/site-hosts/shop.example.com'})).statusCode,404);
    await f.due();assert.equal(await f.run(),'disconnected');
    const again=await f.call('POST',`/v1/sites/domains/${opened.id}/reconnect`,{});assert.equal(again.statusCode,200);
    assert.notEqual(again.json().verification.txtValue,opened.verification.txtValue);f.dns(false,true);
    assert.equal(await f.run(),'ownership_pending');assert.equal(f.bindingCalls.length,1);
  }finally{await f.close();}
});

test('Field custom host scopes existing customer inquiry and image paths to the same business',async()=>{
  const f=await fixture();try{
    await f.create();assert.equal(await f.run(),'connected');
    const ownInquiry=randomUUID(),otherInquiry=randomUUID();
    for(const [id,org] of [[ownInquiry,f.org],[otherInquiry,f.otherOrg]])await f.pool.query(`insert into field.inquiries
      (id,organization_id,catalog_revision,service_id,service_snapshot,customer_name,customer_phone,visitor_key_hash,state,consent_at)
      values($1,$2,1,$3,'{}','Synthetic','01000000000',$4,'needs_owner',now())`,[id,org,randomUUID(),randomUUID()]);
    assert.equal((await f.app.inject({url:`/v1/public/site-hosts/shop.example.com/resources/inquiries/${ownInquiry}`})).statusCode,200);
    assert.equal((await f.app.inject({url:`/v1/public/site-hosts/shop.example.com/resources/inquiries/${otherInquiry}`})).statusCode,404);
    assert.equal((await f.app.inject({url:`/v1/public/site-hosts/shop.example.com/resources/users/${f.owner}`})).statusCode,404);
    const ownAsset=randomUUID(),otherAsset=randomUUID();
    for(const [id,org,owner] of [[ownAsset,f.org,f.owner],[otherAsset,f.otherOrg,f.other]])await f.pool.query(`insert into field.site_assets
      (id,organization_id,object_key,content_type,byte_size,width,height,sha256,uploaded_by)
      values($1,$2,$3,'image/webp',100,10,10,$4,$5)`,[id,org,`synthetic/${id}`,'a'.repeat(64),owner]);
    assert.equal((await f.app.inject({url:`/v1/public/site-hosts/shop.example.com/resources/site-assets/${ownAsset}`})).statusCode,200);
    assert.equal((await f.app.inject({url:`/v1/public/site-hosts/shop.example.com/resources/site-assets/${otherAsset}`})).statusCode,404);
    // 삭제 요청된 사진은 같은 조직이어도 허용하지 않는다(공개 GET도 404).
    await f.pool.query(`update field.site_assets set state='deleting',deletion_requested_at=now(),deletion_next_attempt_at=now() where id=$1`,[ownAsset]);
    assert.equal((await f.app.inject({url:`/v1/public/site-hosts/shop.example.com/resources/site-assets/${ownAsset}`})).statusCode,404);

  }finally{await f.close();}
});

test('Field custom origin requires new AP approval and proof; old base deployment is not reused on that Host',async()=>{
  const f=await fixture(true);try{
    const opened=(await f.create()).json();assert.equal(await f.run(),'connected');
    const key=randomBytes(32),connection=randomUUID(),grant=randomUUID(),apOrg=randomUUID(),agent=randomUUID(),deployment=randomUUID(),publicId=`dep_${randomBytes(24).toString('base64url')}`;
    let remoteOrigin=`http://${f.slug}.localhost:3002`;
    const seal=(text:string)=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(text),cipher.final(),cipher.getAuthTag()]);};
    Object.assign(f.runtime.apConnector!,{issuer:'https://ap.example.com/api/auth',clientId:'synthetic-client',clientSecret:'synthetic-secret',tokenKey:key,
      redirectUri:'http://localhost:3002/callback',webOrigin:'http://localhost:3002',fetcher:async(input:RequestInfo|URL)=>Response.json(String(input).endsWith('/me')?
        {grantId:grant,organizationId:apOrg,agentId:agent,deploymentIds:[deployment],scopes:['ap.agent.read'],state:'active'}:
        {deployments:[{id:deployment,publicId,kind:'owned_embed',origin:remoteOrigin}]})});
    await f.pool.query(`insert into field.ap_connections(id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,ap_agent_name,
      ap_agent_revision,allowed_deployment_ids,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status)
      values($1,$2,$3,$4,'synthetic-client',$5,$6,$7,'Synthetic',1,$8,'{ap.agent.read}',$9,$10,now()+interval '1 hour','review_required')`,
      [connection,f.org,f.owner,f.runtime.apConnector!.issuer,grant,apOrg,agent,[deployment],seal('synthetic-access'),seal('synthetic-refresh')]);
    const payload={connectionId:connection,deploymentId:deployment,mode:'floating'};
    assert.equal((await f.call('POST','/v1/sites/ap-installation',payload)).statusCode,201);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).json().apWidget.publicId,publicId);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}?host=shop.example.com`})).json().apWidget,null);
    assert.equal((await f.call('POST','/v1/sites/ap-installation',{...payload,origin:'https://shop.example.com'})).statusCode,409);
    remoteOrigin='https://shop.example.com';assert.equal((await f.call('POST','/v1/sites/ap-installation',{...payload,origin:remoteOrigin})).statusCode,201);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}?host=shop.example.com`})).json().apWidget.publicId,publicId);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).json().apWidget.publicId,publicId);
    const baseProof='b'.repeat(43);assert.equal((await f.call('POST','/v1/sites/verification',{proof:baseProof})).statusCode,201);
    const proof='a'.repeat(43);
    assert.equal((await f.call('POST','/v1/sites/verification',{proof,origin:remoteOrigin})).statusCode,201);
    assert.equal((await f.app.inject({url:`/v1/public/site-verification/${f.slug}?host=shop.example.com`})).json().origin,remoteOrigin);
    assert.equal((await f.app.inject({url:`/v1/public/site-verification/${f.slug}`})).json().proof,baseProof);
    await f.call('POST',`/v1/sites/domains/${opened.id}/disconnect`,{});
    assert.equal((await f.app.inject({url:`/v1/public/site-verification/${f.slug}?host=shop.example.com`})).statusCode,404);
    assert.equal((await f.pool.query('select status from field.site_ap_installations where site_id=$1 and site_origin=$2',[f.siteId,'https://shop.example.com'])).rows[0].status,'paused');
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).statusCode,200);
    assert.equal((await f.app.inject({url:`/v1/public/sites/${f.slug}`})).json().apWidget.publicId,publicId);
    assert.equal((await f.app.inject({url:`/v1/public/site-verification/${f.slug}`})).json().proof,baseProof);
  }finally{await f.close();}
});

test('Field domain workers claim once and ignore a late result after an expired lease is replaced',async()=>{
  const f=await fixture();try{
    await f.create();f.hold();const first=f.run();
    for(let i=0;i<100&&f.bindingCalls.length===0;i++)await new Promise(r=>setTimeout(r,5));assert.equal(f.bindingCalls.length,1);
    assert.equal(await f.run(),'empty');
    await f.pool.query("update field.site_domains set lease_expires_at=now()-interval '1 second'");
    assert.equal(await f.run(),'connected');f.release();assert.equal(await first,'superseded');
    assert.equal(f.bindingCalls.length,2);assert.equal(f.bindingCalls[0]!.requestKey,f.bindingCalls[1]!.requestKey);
    assert.equal(f.bindingCalls[0]!.generation,f.bindingCalls[1]!.generation);
    const events=await f.pool.query("select payload from field.outbox where event_type='field.site.domain.status' and payload->>'state'='connected'");assert.equal(events.rowCount,1);
    assert.equal((await f.app.inject({url:'/v1/public/site-hosts/shop.example.com'})).statusCode,200);
  }finally{await f.close();}
});

test('Field hostname claims begin after TXT proof and unstarted pending registration can stop without touching another site',async()=>{
  const f=await fixture();try{
    const opened=(await f.create()).json();f.as(f.other);
    const other=(await f.call('POST','/v1/sites/domains',{hostname:'shop.example.com',requestKey:randomUUID()},f.otherOrg)).json();
    assert.equal((await f.pool.query('select count(*)::integer as count from field.site_domains where hostname_claimed')).rows[0].count,0);
    f.as(f.owner);assert.equal(await f.run(),'connected');
    assert.equal(await f.run(),'error');assert.equal(f.bindingCalls.length,1);
    const blocked=(await f.call('GET',`/v1/sites/domains/${other.id}`,undefined,f.otherOrg)).statusCode;assert.equal(blocked,404);
    f.as(f.other);assert.equal((await f.call('GET',`/v1/sites/domains/${other.id}`,undefined,f.otherOrg)).json().error,'domain_claimed_by_other_site');
    await f.call('POST',`/v1/sites/domains/${other.id}/disconnect`,{},f.otherOrg);assert.equal(await f.run({...f.context,edge:undefined}),'disconnected');
    assert.equal((await f.app.inject({url:'/v1/public/site-hosts/shop.example.com'})).json().organizationId,f.org);
    f.as(f.owner);await f.call('POST',`/v1/sites/domains/${opened.id}/disconnect`,{});assert.equal(await f.run(),'disconnected');
    assert.equal((await f.pool.query('select count(*)::integer as count from field.site_domains where hostname_claimed')).rows[0].count,0);
  }finally{await f.close();}
});

test('Field releases a former verified ownership claim through the edge before the new DNS owner can connect',async()=>{
  const f=await fixture();try{
    const former=(await f.create()).json();assert.equal(await f.run(),'connected');
    f.as(f.other);const next=(await f.call('POST','/v1/sites/domains',{hostname:'shop.example.com',requestKey:randomUUID()},f.otherOrg)).json();
    await f.pool.query("update field.site_domains set next_check_at=now()+interval '1 hour' where id=$1",[next.id]);
    await f.pool.query('update field.site_domains set next_check_at=now() where id=$1',[former.id]);f.dns(false,true);
    await f.pool.query("update field.site_domains set checked_at=now()-interval '16 minutes' where id=$1",[former.id]);
    assert.equal(await f.run(),'ownership_pending');
    assert.equal((await f.pool.query('select hostname_claimed from field.site_domains where id=$1',[former.id])).rows[0].hostname_claimed,false);
    await f.pool.query('update field.site_domains set next_check_at=now() where id=$1',[next.id]);f.dns(true,true);
    assert.equal(await f.run(),'connected');
    assert.equal((await f.pool.query('select hostname_claimed from field.site_domains where id=$1',[next.id])).rows[0].hostname_claimed,true);
    assert.equal(f.bindingCalls.length,2);assert.notEqual(f.bindingCalls[0]!.siteId,f.bindingCalls[1]!.siteId);
  }finally{await f.close();}
});

test('Field ownership loss preserves the same durable removal revision through unavailable authority and unknown results',async()=>{
  const f=await fixture();try{
    const opened=(await f.create()).json();assert.equal(await f.run(),'connected');f.dns(false,true);await f.due();
    await f.pool.query("update field.site_domains set checked_at=now()-interval '16 minutes'");
    assert.equal(await f.run({...f.context,edge:undefined}),'blocked_integration');
    let row=(await f.pool.query('select * from field.site_domains where id=$1',[opened.id])).rows[0];assert.equal(row.hostname_claimed,true);const releaseGeneration=row.ownership_release_generation;
    assert.equal((await f.pool.query("select count(*)::integer as count from field.outbox where event_type='field.site.domain.status' and payload->>'state'='ownership_pending'")).rows[0].count,1);
    assert.equal((await f.app.inject({url:'/v1/public/site-hosts/shop.example.com'})).statusCode,404);
    f.removeMode('unknown');await f.due();assert.equal(await f.run(),'unknown');assert.equal(f.removalCalls.length,1);
    row=(await f.pool.query('select * from field.site_domains where id=$1',[opened.id])).rows[0];assert.equal(row.hostname_claimed,true);assert.equal(row.ownership_release_generation,releaseGeneration);
    assert.equal(row.last_error,'domain_verification_unknown');
    f.removeMode('ready');await f.due();assert.equal(await f.run(),'ownership_pending');assert.equal(f.removalCalls.length,2);
    assert.equal(f.removalCalls[0]!.requestKey,f.removalCalls[1]!.requestKey);assert.equal(f.removalCalls[0]!.generation,f.removalCalls[1]!.generation);assert.equal(f.removalCalls[0]!.domainId,opened.id);
    row=(await f.pool.query('select * from field.site_domains where id=$1',[opened.id])).rows[0];assert.equal(row.hostname_claimed,false);assert.equal(row.ownership_release_generation,null);
    f.dns(true,true);await f.due();assert.equal(await f.run(),'connected');assert.ok(f.bindingCalls[1]!.generation>releaseGeneration);
  }finally{await f.close();}
});

test('Field completed disconnect clears interrupted ownership release and reconnect binds a newer revision',async()=>{
  const f=await fixture();try{
    const opened=(await f.create()).json();assert.equal(await f.run(),'connected');f.dns(false,true);await f.due();
    await f.pool.query("update field.site_domains set checked_at=now()-interval '16 minutes'");
    assert.equal(await f.run({...f.context,edge:undefined}),'blocked_integration');
    const releasing=(await f.pool.query('select ownership_release_generation from field.site_domains where id=$1',[opened.id])).rows[0].ownership_release_generation;assert.ok(releasing);
    await f.call('POST',`/v1/sites/domains/${opened.id}/disconnect`,{});assert.equal(await f.run(),'disconnected');
    const stopped=(await f.pool.query('select * from field.site_domains where id=$1',[opened.id])).rows[0];assert.equal(stopped.ownership_release_generation,null);assert.equal(stopped.hostname_claimed,false);
    await f.call('POST',`/v1/sites/domains/${opened.id}/reconnect`,{});f.dns(true,true);assert.equal(await f.run(),'connected');
    assert.equal(f.removalCalls.length,1);assert.ok(f.removalCalls[0]!.generation>releasing);assert.ok(f.bindingCalls[1]!.generation>f.removalCalls[0]!.generation);
  }finally{await f.close();}
});

test('Field keeps a connected domain through a transient DNS error or one missing TXT and downgrades only after the grace period',async()=>{
  const f=await fixture();try{
    const opened=(await f.create()).json();assert.equal(await f.run(),'connected');
    const read=async()=>(await f.pool.query('select * from field.site_domains where id=$1',[opened.id])).rows[0];
    const host=async()=>(await f.app.inject({url:'/v1/public/site-hosts/shop.example.com'})).statusCode;
    const timeout={...f.context,dns:{async inspect():Promise<{ownership:boolean;routing:boolean}>{throw Object.assign(new Error('query timeout'),{code:'ETIMEOUT'});}}};
    const verified=await read();
    // DNS 시간 초과 한 번: 상태·유효기간·인증서 만료를 유지하고 오류만 남긴 뒤 1분 뒤 재점검한다.
    await f.due();assert.equal(await f.run(timeout),'connected');
    let row=await read();assert.equal(row.state,'connected');assert.equal(row.last_error,'domain_verification_unknown');
    assert.equal(row.valid_until.getTime(),verified.valid_until.getTime());assert.equal(row.certificate_expires_at.getTime(),verified.certificate_expires_at.getTime());
    assert.equal(row.checked_at.getTime(),verified.checked_at.getTime());assert.equal(row.claim_token,null);
    assert.ok(row.next_check_at.getTime()-Date.now()<=90_000);assert.equal(await host(),200);
    assert.equal((await f.pool.query("select count(*)::integer as count from field.outbox where event_type='field.site.domain.status'")).rows[0].count,1);
    // TXT 한 번 미검출: 소유 해제를 시작하지 않는다(세대·바인딩 유지).
    await f.due();f.dns(false,true);assert.equal(await f.run(),'connected');
    row=await read();assert.equal(row.last_error,'ownership_txt_unconfirmed');assert.equal(row.ownership_release_generation,null);
    assert.equal(row.generation,verified.generation);assert.equal(row.hostname_claimed,true);assert.equal(f.removalCalls.length,0);assert.equal(await host(),200);
    // TXT가 다시 보이면 정상 확정 점검으로 돌아간다.
    await f.due();f.dns(true,true);assert.equal(await f.run(),'connected');
    row=await read();assert.equal(row.last_error,null);assert.ok(row.checked_at.getTime()>verified.checked_at.getTime());
    // 오류가 유예 시간 넘게 이어지면 기존처럼 unknown으로 내리고 유효기간을 지운다.
    await f.pool.query("update field.site_domains set checked_at=now()-interval '16 minutes'");
    await f.due();assert.equal(await f.run(timeout),'unknown');
    row=await read();assert.equal(row.valid_until,null);assert.equal(await host(),404);
    await f.due();assert.equal(await f.run(),'connected');assert.equal(await host(),200);
    // TXT 미검출이 유예 시간 넘게 이어지면 그때 해제를 시작한다.
    await f.pool.query("update field.site_domains set checked_at=now()-interval '16 minutes'");
    await f.due();f.dns(false,true);assert.equal(await f.run(),'ownership_pending');
    row=await read();assert.equal(row.hostname_claimed,false);assert.equal(f.removalCalls.length,1);assert.equal(await host(),404);
  }finally{await f.close();}
});
