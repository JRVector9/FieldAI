import assert from 'node:assert/strict';
import { createCipheriv,randomBytes,randomUUID } from 'node:crypto';
import { after,test } from 'node:test';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import type { ApConnectorConfig } from '../src/ap-connector.js';
const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL});
after(async()=>{await pool.end();});
function seal(value:string,key:Buffer){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);}
test('actual owner BFF preserves new/legacy nullable receipt metadata and rejects malformed source DTO',async()=>{
 const user=randomUUID(),org=randomUUID(),session=randomUUID(),client=randomUUID(),grant=randomUUID(),connection=randomUUID(),apOrg=randomUUID(),apAgent=randomUUID(),apGrant=randomUUID(),key=randomBytes(32);
 await pool.query(`insert into "user"(id,name,email,"emailVerified") values($1,'Source owner',$2,true)`,[user,`${user}@example.invalid`]);
 await pool.query(`insert into "session"(id,"userId",token,"expiresAt","updatedAt") values($1,$2,$3,now()+interval '1 day',now())`,[session,user,randomUUID()]);
 await pool.query("insert into field.organizations(id,owner_user_id,name) values($1,$2,'Source consumer')",[org,user]);
 await pool.query("insert into field.memberships(organization_id,user_id,role) values($1,$2,'owner')",[org,user]);
 await pool.query(`insert into "oauthClient"(id,"clientId",name,scopes,"redirectUris") values($1,$1,'Source consumer','["field.facts.read"]','["https://source.example.invalid/callback"]')`,[client]);
 await pool.query(`insert into field.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,requested_scopes,selection_expires_at) values($1,$2,$3,$4,$5,array['field.facts.read'],now()+interval '1 day')`,[grant,session,user,client,org]);
 await pool.query(`insert into field.ap_connections(id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,ap_agent_name,ap_agent_revision,allowed_deployment_ids,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status,field_grant_id,field_actor_user_id) values($1,$2,$3,'https://agent.example.invalid/api/auth',$4,$5,$6,$7,'Source AI',1,array[]::text[],array['ap.sources.refresh'],$8,$8,now()+interval '1 day','review_required',$9,$3)`,[connection,org,user,client,apGrant,apOrg,apAgent,seal('SYNTHETIC_TOKEN_NOT_REAL',key),grant]);
 const response:Record<string,unknown>={connectionId:connection,sourceRevision:3,approvedSourceRevision:2,state:'pending_review',syncedAt:'2026-08-20T03:04:05.123Z'};let actor:string|null=user;
 const config:ApConnectorConfig={issuer:'https://agent.example.invalid/api/auth',clientId:client,clientSecret:'synthetic',tokenKey:key,redirectUri:'http://127.0.0.1:4321/v1/connections/ap/callback',webOrigin:'http://127.0.0.1:3002',fetcher:async url=>{
  if(String(url).endsWith('/me'))return Response.json({grantId:apGrant,organizationId:apOrg,agentId:apAgent,state:'active',deploymentIds:[],scopes:['ap.sources.refresh']});
  assert.equal(String(url),`https://agent.example.invalid/integrations/v1/connections/${connection}/source`);return Response.json(response);
 }};
 const app=createFieldApp(async()=>undefined,undefined,undefined,{pool,resolveUserId:async()=>actor,apConnector:config});
 const base=await app.listen({host:'127.0.0.1',port:0}),read=async()=>{const r=await fetch(`${base}/v1/connections/ap/${connection}/source-refresh`);return {status:r.status,body:await r.json() as Record<string,unknown>};};
 try{
  const fresh=await read();assert.equal(fresh.status,200);assert.equal(fresh.body.syncedAt,response.syncedAt);
  delete response.syncedAt;assert.equal((await read()).body.syncedAt,null,'preview.9 missing field must remain null');
  response.syncedAt=null;assert.equal((await read()).body.syncedAt,null);
  for(const bad of ['now','2026-02-30T03:04:05Z','2026-08-20',42,{}]){response.syncedAt=bad;assert.equal((await read()).status,502);}
  response.syncedAt='2026-08-20T03:04:05.123Z';response.state='stale';assert.equal((await read()).body.state,'stale');
  await pool.query("update field.memberships set role='viewer' where organization_id=$1 and user_id=$2",[org,user]);assert.equal((await read()).status,404);
  actor=null;assert.equal((await read()).status,401);
 }finally{await app.close();}
});
