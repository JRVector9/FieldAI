import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { Pool, PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { authorizedApInstallationAccess } from './ap-connector.js';
import { ApPublicWriteClient, ApPublicWriteError, type ApPublicDeployment } from './ap-public-write-client.js';
import { activeSiteOrigin, resolvedCustomHost } from './custom-domains.js';
import { publicSiteOrigin } from './sites.js';
import { subscriptionAccess } from './subscription-access.js';

export const publicInstallationActions = ['connect','prepare','verify','activate','install','pause','refresh'] as const;
export type InstallationAction = typeof publicInstallationActions[number];
export type PublicInstallationIntent = { id:string; organization_id:string; site_id:string; actor_user_id:string;
  connection_id:string; ap_issuer:string; ap_client_id:string; ap_grant_id:string; ap_organization_id:string;
  ap_agent_id:string; site_origin:string; mode:'inline'|'floating'; revision:number; state:string;
  ap_connection_id:string|null; deployment:ApPublicDeployment|null; sdk_approved_at:Date|null; slug:string };
type Operation = {request_key:string;intent_id:string;action:InstallationAction;expected_revision:number;
  input:{connectionId:string|null;origin:string;deployment:ApPublicDeployment|null};state:string;
  http_status:number|null;result:Record<string,unknown>|null;error:string|null};
type Db = Pick<Pool|PoolClient,'query'>;
export function installationView(row:PublicInstallationIntent) {
  return {id:row.id,connectionId:row.connection_id,apOrganizationId:row.ap_organization_id,apAgentId:row.ap_agent_id,
    origin:row.site_origin,mode:row.mode,revision:row.revision,state:row.state,
    deployment:row.deployment ? {id:row.deployment.id,publicId:row.deployment.publicId,state:row.deployment.state,
      revision:row.deployment.revision,verifiedAt:row.deployment.verifiedAt} : null,
    sdkApproved:row.sdk_approved_at!==null};
}
// Current local authority is also checked after network I/O, before changing SDK visibility.
export async function installationAuthority(db:Db,row:PublicInstallationIntent,lock=false) {
  const owner=await db.query(`select 1 from field.memberships where organization_id=$1 and user_id=$2
    and role='owner'${lock?' for share':''}`,[row.organization_id,row.actor_user_id]);
  const connection=await db.query(`select 1 from field.ap_connections c where c.id=$1 and c.organization_id=$2
    and c.initiator_user_id=$3 and c.ap_issuer=$4 and c.ap_client_id=$5 and c.ap_grant_id=$6
    and c.ap_organization_id=$7 and c.ap_agent_id=$8 and c.status in ('pending_field_consent','review_required')
    and c.scopes @> array['ap.connections.create','ap.deployments.manage']::text[]
    and (c.status='pending_field_consent' or (c.field_actor_user_id=$3 and exists(
      select 1 from field.oauth_selections s where s.id::text=c.field_grant_id and s.organization_id=c.organization_id
        and s.actor_user_id=$3 and s.revoked_at is null${lock?' for share of s':''})))${lock?' for share of c':''}`,
  [row.connection_id,row.organization_id,row.actor_user_id,row.ap_issuer,row.ap_client_id,row.ap_grant_id,row.ap_organization_id,row.ap_agent_id]);
  return Boolean(owner.rowCount && connection.rowCount
    && await activeSiteOrigin(db,row.site_id,row.site_origin,publicSiteOrigin(row.slug),lock)
    && (await db.query('select 1 from field.site_releases where site_id=$1 limit 1',[row.site_id])).rowCount
    && !(await db.query('select 1 from field.site_visibility_holds where site_id=$1 and released_at is null',[row.site_id])).rowCount);
}
export async function publicInstallationFor(db:Db,siteId:string,origin:string) {
  const found=await db.query<PublicInstallationIntent>(`select i.*,s.slug from field.ap_public_installation_intents i
    join field.sites s on s.id=i.site_id join field.site_ap_installations w on w.site_id=i.site_id
      and w.site_origin=i.site_origin and w.connection_id=i.connection_id
      and w.ap_deployment_id=(i.deployment->>'id')::uuid and w.ap_public_id=i.deployment->>'publicId'
    where i.site_id=$1 and i.site_origin=$2 and i.state='installed' and i.sdk_approved_at is not null
      and i.deployment->>'state'='active' and w.status='active' order by i.created_at desc limit 1`,[siteId,origin]);
  const row=found.rows[0];
  return row && await installationAuthority(db,row) && row.deployment
    ? {ap_public_id:row.deployment.publicId,mode:row.mode} : null;
}
function permitted(row:PublicInstallationIntent,action:InstallationAction) {
  return action==='connect' ? row.state==='created'
    : action==='prepare' ? row.state==='connection_prepared'
      : action==='verify' ? ['deployment_prepared','verified'].includes(row.state)
        : action==='activate' ? row.state==='verified'
          : action==='install' ? ['ap_active','installed'].includes(row.state)
            : row.deployment!==null;
}
function failure(status:number,error:string,retryable=false) {return {status,body:{error,retryable}};}
export async function runApPublicInstallationAction(runtime:FieldBusinessRuntime,input:{intentId:string;organizationId:string;
  actorId:string;headers:IncomingHttpHeaders;action:InstallationAction;requestKey:string;expectedRevision:number}) {
  const db=await runtime.pool.connect();let locked=false,discarded=false;
  try {
    await db.query("select pg_advisory_lock(hashtextextended('field-public-installation:'||$1,0))",[input.intentId]);locked=true;
    const found=await db.query<PublicInstallationIntent>(`select i.*,s.slug from field.ap_public_installation_intents i
      join field.sites s on s.id=i.site_id where i.id=$1 and i.organization_id=$2 and i.actor_user_id=$3`,
    [input.intentId,input.organizationId,input.actorId]);
    const row=found.rows[0];if(!row)return failure(404,'installation_intent_not_found');
    if(!await installationAuthority(db,row))return failure(409,'installation_authority_changed');
    const access=await authorizedApInstallationAccess(runtime,input.organizationId,input.actorId,row.connection_id);
    if('error' in access)return failure(access.status,access.error,access.status===503);
    if(access.grantId!==row.ap_grant_id || access.organizationId!==row.ap_organization_id || access.agentId!==row.ap_agent_id
      || access.clientId!==row.ap_client_id || access.issuer!==row.ap_issuer)return failure(409,'installation_authority_changed');
    const client=new ApPublicWriteClient({...access,accessToken:access.token,mock:process.env.FIELD_PROFILE==='mock',fetcher:runtime.apConnector?.fetcher});
    let op=(await db.query<Operation>('select * from field.ap_public_installation_operations where request_key=$1',[input.requestKey])).rows[0];
    if(op) {
      if(op.intent_id!==row.id || op.action!==input.action || op.expected_revision!==input.expectedRevision)
        return failure(409,'installation_request_key_conflict');
      if(op.state==='succeeded'||op.state==='rejected')return {status:op.http_status!,body:op.result!};
    } else {
      if(row.revision!==input.expectedRevision)return failure(409,'installation_revision_conflict');
      if((await db.query("select 1 from field.ap_public_installation_operations where intent_id=$1 and state in ('pending','unknown')",[row.id])).rowCount)
        return failure(409,'installation_result_pending');
      if(!permitted(row,input.action))return failure(409,'installation_step_not_ready');
      if(!['pause','refresh'].includes(input.action)) {
        const access=await subscriptionAccess(db,row.organization_id);
        if(!access.canStartNew)return failure(403,access.reason!);
      }
      await db.query('begin');
      if(!await installationAuthority(db,row,true)){await db.query('rollback');return failure(409,'installation_authority_changed');}
      op=(await db.query<Operation>(`insert into field.ap_public_installation_operations(request_key,intent_id,action,expected_revision,input)
        values($1,$2,$3,$4,$5::jsonb) returning *`,[input.requestKey,row.id,input.action,input.expectedRevision,
        JSON.stringify({connectionId:row.ap_connection_id,origin:row.site_origin,deployment:row.deployment})])).rows[0]!;
      // Local visibility is fenced even if the remote pause response later becomes unknown.
      if(input.action==='pause')await db.query("update field.site_ap_installations set status='paused',updated_at=now() where site_id=$1 and site_origin=$2 and connection_id=$3",[row.site_id,row.site_origin,row.connection_id]);
      if(input.action==='verify' && row.deployment) {
        if(row.site_origin===publicSiteOrigin(row.slug))await db.query(`insert into field.site_verification_proofs(site_id,proof,created_by,expires_at)
          values($1,$2,$3,now()+interval '15 minutes') on conflict(site_id) do update set proof=excluded.proof,
          created_by=excluded.created_by,expires_at=excluded.expires_at,updated_at=now()`,[row.site_id,row.deployment.verificationProof,input.actorId]);
        else {
          const domain=await resolvedCustomHost(db,new URL(row.site_origin).hostname,true);
          if(!domain){await db.query('rollback');return failure(409,'site_origin_not_allowed');}
          await db.query(`insert into field.custom_domain_ap_proofs(domain_id,site_id,proof,created_by,expires_at)
            values($1,$2,$3,$4,now()+interval '15 minutes') on conflict(domain_id) do update set proof=excluded.proof,
              created_by=excluded.created_by,expires_at=excluded.expires_at,updated_at=now()`,[domain.id,row.site_id,row.deployment.verificationProof,input.actorId]);
        }
      }
      await db.query('commit');
    }
    let remoteConnection=row.ap_connection_id, deployment=row.deployment;
    try {
      if(op.action==='connect')remoteConnection=(await client.createConnection({externalOrganizationId:row.organization_id,origin:op.input.origin},op.request_key)).id;
      else if(op.action==='prepare')deployment=await client.prepareDeployment({id:op.input.connectionId!,origin:op.input.origin},op.request_key);
      else if(op.action==='install'||op.action==='refresh')deployment=await client.getDeployment(op.input.deployment!);
      else deployment=await client.updateDeployment(op.action,op.input.deployment!,op.request_key);
      if(op.action==='install' && deployment?.state!=='active')throw new ApPublicWriteError(409,'ap_deployment_not_active',false);
      if(op.action==='verify'&&!deployment?.verifiedAt || op.action==='activate'&&deployment?.state!=='active'
        || op.action==='pause'&&deployment?.state!=='paused')throw new ApPublicWriteError(503,'ap_public_write_result_unknown',true);
    }catch(error) {
      if(!(error instanceof ApPublicWriteError))throw error;
      const unknown=error.retryable && !['install','refresh'].includes(op.action);
      const result=failure(error.status,error.code,unknown);
      await db.query(`update field.ap_public_installation_operations set state=$2,http_status=$3,error=$4,result=$5::jsonb,
        completed_at=case when $2='rejected' then now() else null end where request_key=$1`,
      [op.request_key,unknown?'unknown':'rejected',error.status,error.code,JSON.stringify(result.body)]);
      return result;
    }
    await db.query('begin');
    if(op.action==='install') {
      const current=(await db.query<{revision:number}>('select revision from field.ap_public_installation_intents where id=$1 for update',[row.id])).rows[0]!;
      if(current.revision!==op.expected_revision) {
        const result=failure(409,'local_visibility_changed');
        await db.query(`update field.ap_public_installation_operations set state='rejected',http_status=409,error=$2,
          result=$3::jsonb,completed_at=now() where request_key=$1`,[op.request_key,'local_visibility_changed',JSON.stringify(result.body)]);
        await db.query('commit');return result;
      }
    }
    const sdkAccess=op.action==='install'?await subscriptionAccess(db,row.organization_id):null;
    if(await runtime.resolveUserId(input.headers)!==input.actorId || !await installationAuthority(db,row,true) || sdkAccess&&!sdkAccess.canStartNew) {
      // A remote write may already be committed. Preserve its original UUID/snapshot until the
      // same current actor/grant can recover it; never make that receipt a terminal rejection.
      const unknown=!['install','refresh'].includes(op.action),result=failure(409,'installation_authority_changed',unknown);
      await db.query(`update field.ap_public_installation_operations set state=$2,http_status=409,error=$3,
        result=$4::jsonb,completed_at=case when $2='rejected' then now() else null end where request_key=$1`,
      [op.request_key,unknown?'unknown':'rejected','installation_authority_changed',JSON.stringify(result.body)]);
      await db.query('commit');return result;
    }
    let state=op.action==='connect'?'connection_prepared':op.action==='prepare'?'deployment_prepared'
      :op.action==='verify'?'verified':op.action==='activate'?'ap_active':op.action==='install'?'installed':op.action==='pause'?'paused'
        :deployment?.state==='active'?(row.state==='installed'?'installed':'ap_active'):deployment?.state==='paused'?'paused':deployment?.verifiedAt?'verified':'deployment_prepared';
    if(op.action==='install') {
      await db.query(`insert into field.site_ap_installations(site_id,connection_id,ap_deployment_id,ap_public_id,site_origin,mode,status,installed_by)
        values($1,$2,$3,$4,$5,$6,'active',$7) on conflict(site_id,site_origin) do update set connection_id=excluded.connection_id,
          ap_deployment_id=excluded.ap_deployment_id,ap_public_id=excluded.ap_public_id,mode=excluded.mode,status='active',
          installed_by=excluded.installed_by,updated_at=now()`,[row.site_id,row.connection_id,deployment!.id,deployment!.publicId,row.site_origin,row.mode,input.actorId]);
    }
    if(op.action==='refresh' && deployment?.state!=='active') {
      state=deployment?.state==='paused'?'paused':deployment?.verifiedAt?'verified':'deployment_prepared';
      await db.query("update field.site_ap_installations set status='paused',updated_at=now() where site_id=$1 and site_origin=$2 and connection_id=$3",[row.site_id,row.site_origin,row.connection_id]);
    }
    const saved=(await db.query<PublicInstallationIntent>(`update field.ap_public_installation_intents set state=$2,
      ap_connection_id=$3,deployment=$4::jsonb,revision=revision+1,updated_at=now(),
      sdk_approved_at=case when $5 then now() else sdk_approved_at end where id=$1 returning *`,
    [row.id,state,remoteConnection,JSON.stringify(deployment),op.action==='install'])).rows[0]!;
    const body=installationView(saved);
    await db.query(`update field.ap_public_installation_operations set state='succeeded',http_status=200,result=$2::jsonb,
      error=null,completed_at=now() where request_key=$1`,[op.request_key,JSON.stringify(body)]);
    await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
      values($1,$2,$3,$4,$5::jsonb)`,[randomUUID(),row.organization_id,'field.site.ap_public_installation.'+op.action,row.site_id,
      JSON.stringify({intentId:row.id,requestKey:op.request_key,actorId:input.actorId,origin:row.site_origin,state})]);
    await db.query('commit');return {status:200,body};
  }catch(error){await db.query('rollback');throw error;}finally{
    if(locked) {try{await db.query("select pg_advisory_unlock(hashtextextended('field-public-installation:'||$1,0))",[input.intentId]);}
      catch{db.release(true);discarded=true;}}
    if(!discarded)db.release();
  }
}
