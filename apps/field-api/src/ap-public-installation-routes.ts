import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { userFor, organizationFor, siteFor, publicSiteOrigin } from './sites.js';
import { authorizedApInstallationAccess } from './ap-connector.js';
import { activeSiteOrigin } from './custom-domains.js';
import { subscriptionAccess } from './subscription-access.js';
import { installationAuthority, installationView, publicInstallationActions, runApPublicInstallationAction,
  type PublicInstallationIntent, type InstallationAction } from './ap-public-installation-execution.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
export function registerApPublicInstallationRoutes(app:FastifyInstance,runtime:FieldBusinessRuntime) {
  app.get('/v1/sites/ap-public-installations',async(request,reply)=>{
    reply.header('Cache-Control','private, no-store');
    const user=await userFor(request,reply,runtime);if(!user)return reply;
    const org=await organizationFor(request,reply,runtime,user,'publish');if(!org)return reply;
    const rows=await runtime.pool.query<PublicInstallationIntent>(`select i.*,s.slug from field.ap_public_installation_intents i
      join field.sites s on s.id=i.site_id where i.organization_id=$1 and i.actor_user_id=$2 order by i.created_at desc limit 50`,[org.organization_id,user]);
    const intents=[];
    for(const row of rows.rows) {
      const pending=(await runtime.pool.query<{request_key:string;action:string;expected_revision:number;state:string;error:string|null}>(
        "select request_key,action,expected_revision,state,error from field.ap_public_installation_operations where intent_id=$1 and state in ('pending','unknown')",[row.id])).rows[0];
      const fieldStatus=row.deployment?(await runtime.pool.query<{status:string}>(`select status from field.site_ap_installations
        where site_id=$1 and site_origin=$2 and connection_id=$3 and ap_deployment_id=$4`,[row.site_id,row.site_origin,row.connection_id,row.deployment.id])).rows[0]?.status??null:null;
      intents.push({...installationView(row),fieldStatus,available:await installationAuthority(runtime.pool,row),
        pendingOperation:pending?{requestKey:pending.request_key,action:pending.action,expectedRevision:pending.expected_revision,state:pending.state,error:pending.error}:null});
    }
    return {intents};
  });
  app.post('/v1/sites/ap-public-installations',async(request,reply)=>{
    reply.header('Cache-Control','private, no-store');
    const user=await userFor(request,reply,runtime);if(!user)return reply;
    const org=await organizationFor(request,reply,runtime,user,'publish');if(!org)return reply;
    if(request.headers.origin!==(runtime.apConnector?.webOrigin??process.env.FIELD_PUBLIC_WEB_ORIGIN??'http://localhost:3002'))
      return reply.code(403).send({error:'invalid_origin'});
    const body=object(request.body);
    if(!body||typeof body.requestKey!=='string'||!uuid.test(body.requestKey)||typeof body.connectionId!=='string'
      ||!uuid.test(body.connectionId)||typeof body.origin!=='string'||(body.mode!=='inline'&&body.mode!=='floating')||body.approval!==true
      ||Object.keys(body).some(key=>!['requestKey','connectionId','origin','mode','approval'].includes(key)))
      return reply.code(400).send({error:'invalid_installation_approval'});
    const site=await siteFor(runtime,org.organization_id);if(!site)return reply.code(404).send({error:'site_not_found'});
    if(!await activeSiteOrigin(runtime.pool,site.id,body.origin,publicSiteOrigin(site.slug)))return reply.code(409).send({error:'site_origin_not_allowed'});
    if(!(await runtime.pool.query('select 1 from field.site_releases where site_id=$1 limit 1',[site.id])).rowCount)
      return reply.code(409).send({error:'site_not_published'});
    const access=await authorizedApInstallationAccess(runtime,org.organization_id,user,body.connectionId);
    if('error' in access)return reply.code(access.status).send({error:access.error});
    const db=await runtime.pool.connect();
    try {
      await db.query('begin');
      await db.query("select pg_advisory_xact_lock(hashtextextended('field-public-site:'||$1||':'||$2,0))",[site.id,body.origin]);
      const existing=await db.query<{id:string}>(`select id from field.ap_public_installation_intents
        where site_id=$1 and site_origin=$2 and connection_id=$3 and state<>'paused' and id<>$4`,[site.id,body.origin,body.connectionId,body.requestKey]);
      if(existing.rowCount){await db.query('rollback');return reply.code(409).send({error:'installation_intent_exists',intentId:existing.rows[0]!.id});}
      if(!(await db.query('select 1 from field.ap_public_installation_intents where id=$1',[body.requestKey])).rowCount) {
        const access=await subscriptionAccess(db,org.organization_id);
        if(!access.canStartNew){await db.query('rollback');return reply.code(403).send({error:access.reason});}
      }
      await db.query(`insert into field.ap_public_installation_intents(id,organization_id,site_id,actor_user_id,connection_id,
        ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,site_origin,mode)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(id) do nothing`,
      [body.requestKey,org.organization_id,site.id,user,body.connectionId,access.issuer,access.clientId,access.grantId,access.organizationId,access.agentId,body.origin,body.mode]);
      const row=(await db.query<PublicInstallationIntent>(`select i.*,s.slug from field.ap_public_installation_intents i
        join field.sites s on s.id=i.site_id where i.id=$1 for update of i`,[body.requestKey])).rows[0]!;
      if(row.organization_id!==org.organization_id||row.actor_user_id!==user||row.site_id!==site.id
        ||row.connection_id!==body.connectionId||row.site_origin!==body.origin||row.mode!==body.mode
        ||row.ap_grant_id!==access.grantId||row.ap_organization_id!==access.organizationId||row.ap_agent_id!==access.agentId) {
        await db.query('rollback');return reply.code(409).send({error:'installation_request_key_conflict'});
      }
      if(!await installationAuthority(db,row,true)){await db.query('rollback');return reply.code(409).send({error:'installation_authority_changed'});}
      await db.query('commit');return reply.code(201).send(installationView(row));
    }catch(error){await db.query('rollback');throw error;}finally{db.release();}
  });
  app.post<{Params:{id:string}}>('/v1/sites/ap-public-installations/:id/actions',async(request,reply)=>{
    reply.header('Cache-Control','private, no-store');
    const user=await userFor(request,reply,runtime);if(!user)return reply;
    const org=await organizationFor(request,reply,runtime,user,'publish');if(!org)return reply;
    if(request.headers.origin!==(runtime.apConnector?.webOrigin??process.env.FIELD_PUBLIC_WEB_ORIGIN??'http://localhost:3002'))
      return reply.code(403).send({error:'invalid_origin'});
    const body=object(request.body);
    if(!uuid.test(request.params.id)||!body||typeof body.requestKey!=='string'||!uuid.test(body.requestKey)
      ||typeof body.action!=='string'||!publicInstallationActions.includes(body.action as InstallationAction)
      ||!Number.isSafeInteger(body.expectedRevision)||Number(body.expectedRevision)<1
      ||Object.keys(body).some(key=>!['requestKey','action','expectedRevision'].includes(key)))
      return reply.code(400).send({error:'invalid_installation_action'});
    const result=await runApPublicInstallationAction(runtime,{intentId:request.params.id,organizationId:org.organization_id,
      actorId:user,headers:request.headers,action:body.action as InstallationAction,requestKey:body.requestKey,expectedRevision:Number(body.expectedRevision)});
    return reply.code(result.status).send(result.body);
  });
}
