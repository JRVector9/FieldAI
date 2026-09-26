import assert from 'node:assert/strict';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { after,test } from 'node:test';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';
import { assertLifecycleServing,lifecycleJournalFromEnvironment } from '../src/oauth-lifecycle-journal.js';
const pool=new Pool({connectionString:process.env.AP_DATABASE_URL});
const journal=lifecycleJournalFromEnvironment()!;await journal.initialize(pool);
const app=createAgentApp(async()=>undefined,undefined,undefined,undefined,{pool,resolveUserId:async()=>null,oauthLifecycleGuard:()=>assertLifecycleServing(pool,journal)});
const base=await app.listen({host:'127.0.0.1',port:0});
after(async()=>{await app.close();await pool.end();});
async function fixture(){
 const user=randomUUID(),session=randomUUID(),org=randomUUID(),client=randomUUID(),grant=randomUUID(),agent=randomUUID(),knowledge=randomUUID(),connection=randomUUID(),bearer=randomBytes(32).toString('base64url');
 const scopes=['ap.sources.refresh'],resources=JSON.stringify([new URL('/integrations/v1',process.env.AP_AUTH_BASE_URL!).toString()]);
 await pool.query(`insert into "user"(id,name,email,"emailVerified") values($1,'Source owner',$2,true)`,[user,`${user}@example.invalid`]);
 await pool.query(`insert into "session"(id,"userId",token,"expiresAt","updatedAt") values($1,$2,$3,now()+interval '1 day',now())`,[session,user,randomUUID()]);
 await pool.query("insert into ap.organizations(id,owner_user_id,name) values($1,$2,'Source status')",[org,user]);
 await pool.query("insert into ap.memberships(organization_id,user_id,role) values($1,$2,'owner')",[org,user]);
 await pool.query(`insert into ap.knowledge_releases(id,organization_id,revision,draft_revision,source_kind,content,content_hash,approved_by) values($1,$2,1,1,'native','{}','synthetic',$3)`,[knowledge,org,user]);
 await pool.query(`insert into ap.agent_releases(id,organization_id,agent_id,revision,draft_revision,content,content_hash,knowledge_release_id,knowledge_revision,approved_by) values($1,$2,$3,1,1,'{}','synthetic',$4,1,$5)`,[randomUUID(),org,agent,knowledge,user]);
 await pool.query(`insert into "oauthClient"(id,"clientId",name,scopes,"redirectUris") values($1,$1,'Source consumer',$2,'["https://source.example.invalid/callback"]')`,[client,JSON.stringify(scopes)]);
 await pool.query(`insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,agent_id,requested_scopes,selection_expires_at) values($1,$2,$3,$4,$5,$6,$7,now()+interval '1 day')`,[grant,session,user,client,org,agent,scopes]);
 await pool.query(`insert into "oauthConsent"(id,"clientId","userId","referenceId",resources,scopes,"createdAt","updatedAt") values($1,$2,$3,$4,$5,$6,now(),now())`,[randomUUID(),client,user,grant,resources,JSON.stringify(scopes)]);
 await pool.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId",resources,scopes,"createdAt","expiresAt") values($1,$2,$3,$4,$5,$6,$7,now(),now()+interval '1 day')`,[randomUUID(),createHash('sha256').update(bearer).digest('base64url'),client,user,grant,resources,JSON.stringify(scopes)]);
 await pool.query(`insert into ap.field_connections(id,ap_grant_id,ap_organization_id,ap_agent_id,initiator_user_id,field_issuer,field_client_id,field_grant_id,field_organization_id,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status) values($1,$2,$3,$4,$5,'https://field.example.invalid/api/auth','synthetic','synthetic','synthetic',array[]::text[],$6,$6,now()+interval '1 day','review_required')`,[connection,grant,org,agent,user,Buffer.from('SYNTHETIC_NOT_A_REAL_TOKEN')]);
 return {connection,org,user,grant,bearer};
}
async function read(f:Awaited<ReturnType<typeof fixture>>,connection=f.connection){const r=await fetch(`${base}/integrations/v1/connections/${connection}/source`,{headers:{authorization:`Bearer ${f.bearer}`}});return {status:r.status,body:await r.json() as Record<string,unknown>};}
test('actual public GET reads matching snapshot receipt clock, never source approval/change clocks',async()=>{
 const f=await fixture();const empty=await read(f);assert.equal(empty.status,200);assert.equal(empty.body.syncedAt,null);assert.equal(empty.body.state,'not_synced');
 const source=randomUUID(),clock='2026-08-20T03:04:05.123Z';
 await pool.query(`insert into ap.knowledge_sources(id,organization_id,provider,connection_id,external_org_id,source_revision,content_hash,published_at,fetched_at,state,updated_at) values($1,$2,'field',$3,'synthetic',3,$4,now(),now(),'pending_review',now())`,[source,f.org,f.connection,'a'.repeat(64)]);
 await pool.query(`insert into ap.knowledge_source_snapshots(id,source_id,source_revision,release_id,content_hash,content,published_at,fetched_at) values($1,$2,3,$3,$4,'{}',now(),$5)`,[randomUUID(),source,randomUUID(),'a'.repeat(64),clock]);
 const received=await read(f);assert.equal(received.status,200);assert.equal(received.body.syncedAt,clock);assert.equal(received.body.state,'pending_review');
 await pool.query(`update ap.knowledge_sources set fetched_at=now(),updated_at=now(),approved_at=now(),approved_by=$2,approved_source_revision=3,state='current' where id=$1`,[source,f.user]);
 const approved=await read(f);assert.equal(approved.body.syncedAt,clock);assert.equal(approved.body.state,'current');
 await pool.query("update ap.knowledge_sources set state='stale' where id=$1",[source]);assert.equal((await read(f)).body.state,'stale');
 await pool.query('update ap.knowledge_sources set source_revision=4 where id=$1',[source]);assert.equal((await read(f)).body.syncedAt,null,'older snapshot must not substitute for missing current revision');
 assert.equal((await read(f,randomUUID())).status,404);
 await pool.query("update ap.memberships set role='viewer' where organization_id=$1 and user_id=$2",[f.org,f.user]);assert.equal((await read(f)).status,401);
});
