import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { rejectExpiredTrial } from './trial-access.js';
import { normalizeCustomHostname } from './custom-domain-dns.js';
import { siteHealthProof, siteHealthSecret } from './custom-domain-edge-caddy.js';
import { customDomainContextFromEnvironment, disconnectSiteDomain, domainView, resolvedCustomHost, type CustomDomainContext, type SiteDomain } from './custom-domains.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown>|null {return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
export function registerCustomDomainRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime,
  context: CustomDomainContext=customDomainContextFromEnvironment()) {
  async function owner(request: FastifyRequest,reply: FastifyReply,write=false) {
    reply.headers({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
    const user=await runtime.resolveUserId(request.headers);
    if(!user){reply.code(401).send({error:'unauthenticated'});return null;}
    if(write&&request.headers.origin!==context.webOrigin){reply.code(403).send({error:'invalid_origin'});return null;}
    const selected=request.headers['x-organization-id'];
    if(selected!==undefined&&(typeof selected!=='string'||!uuid.test(selected))){reply.code(400).send({error:'invalid_organization'});return null;}
    const found=await runtime.pool.query<{organization_id:string}>(`select organization_id from field.memberships
      where user_id=$1 and role='owner' and ($2::uuid is null or organization_id=$2) order by created_at limit 1`,[user,selected??null]);
    if(!found.rows[0]){reply.code(404).send({error:'organization_not_found'});return null;}
    return {organizationId:found.rows[0].organization_id,userId:user};
  }
  async function lockOwner(db: PoolClient,identity:{organizationId:string;userId:string}){
    await db.query('select id from field.organizations where id=$1 for update',[identity.organizationId]);
    return (await db.query("select 1 from field.memberships where organization_id=$1 and user_id=$2 and role='owner' for share",[identity.organizationId,identity.userId])).rowCount;
  }
  app.get('/v1/sites/domains',async(request,reply)=>{
    const identity=await owner(request,reply);if(!identity)return reply;
    const found=await runtime.pool.query<SiteDomain>('select * from field.site_domains where organization_id=$1 order by created_at,id',[identity.organizationId]);
    return {domains:found.rows.map(row=>domainView(row,context)),providerState:context.edge?'configured':'blocked_integration'};
  });
  app.get<{Params:{id:string}}>('/v1/sites/domains/:id',async(request,reply)=>{
    const identity=await owner(request,reply);if(!identity)return reply;
    if(!uuid.test(request.params.id))return reply.code(404).send({error:'domain_not_found'});
    const found=await runtime.pool.query<SiteDomain>('select * from field.site_domains where id=$1 and organization_id=$2',[request.params.id,identity.organizationId]);
    return found.rows[0]?domainView(found.rows[0],context):reply.code(404).send({error:'domain_not_found'});
  });
  app.post('/v1/sites/domains',async(request,reply)=>{
    const identity=await owner(request,reply,true);if(!identity)return reply;
    const body=object(request.body),hostname=normalizeCustomHostname(body?.hostname,context.baseDomain),requestKey=body?.requestKey;
    if(!hostname||typeof requestKey!=='string'||!uuid.test(requestKey))return reply.code(400).send({error:'invalid_domain_registration'});
    const db=await runtime.pool.connect();
    try{
      await db.query('begin');
      if(!await lockOwner(db,identity)){await db.query('rollback');return reply.code(404).send({error:'organization_not_found'});}
      const previous=await db.query<SiteDomain>('select * from field.site_domains where organization_id=$1 and request_key=$2',[identity.organizationId,requestKey]);
      if(previous.rows[0]){await db.query('commit');return previous.rows[0].hostname===hostname?domainView(previous.rows[0],context):reply.code(409).send({error:'idempotency_conflict'});}
      if(await rejectExpiredTrial(reply,db,identity.organizationId)){await db.query('rollback');return reply;}
      const site=await db.query<{id:string}>('select id from field.sites where organization_id=$1',[identity.organizationId]);
      if(!site.rows[0]){await db.query('rollback');return reply.code(404).send({error:'site_not_found'});}
      const claimed=await db.query('select 1 from field.site_domains where hostname=$1 and organization_id=$2',[hostname,identity.organizationId]);
      if(claimed.rowCount){await db.query('rollback');return reply.code(409).send({error:'domain_already_registered'});}
      const count=await db.query<{count:number}>('select count(*)::integer as count from field.site_domains where organization_id=$1 and desired_state=\'active\'',[identity.organizationId]);
      if(count.rows[0]!.count>=5){await db.query('rollback');return reply.code(409).send({error:'domain_limit_reached'});}
      const created=await db.query<SiteDomain>(`insert into field.site_domains(id,organization_id,site_id,hostname,request_key,created_by,ownership_token)
        values($1,$2,$3,$4,$5,$6,$7) returning *`,[randomUUID(),identity.organizationId,site.rows[0].id,hostname,requestKey,identity.userId,randomBytes(32).toString('base64url')]);
      await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
        values($1,$2,'field.site.domain.registered',$3,$4::jsonb)`,[randomUUID(),identity.organizationId,created.rows[0]!.id,JSON.stringify({domainId:created.rows[0]!.id,siteId:site.rows[0].id})]);
      await db.query('commit');return reply.code(201).send(domainView(created.rows[0]!,context));
    }catch(error){await db.query('rollback');if((error as{code?:string}).code==='23505')return reply.code(409).send({error:'domain_already_registered'});throw error;}finally{db.release();}
  });
  for(const action of ['verify','primary','disconnect','reconnect'] as const){
    app.post<{Params:{id:string}}>(`/v1/sites/domains/:id/${action}`,async(request,reply)=>{
      const identity=await owner(request,reply,true);if(!identity)return reply;
      if(!uuid.test(request.params.id))return reply.code(404).send({error:'domain_not_found'});
      const db=await runtime.pool.connect();
      try{
        await db.query('begin');
        if(!await lockOwner(db,identity)){await db.query('rollback');return reply.code(404).send({error:'organization_not_found'});}
        const found=await db.query<SiteDomain>('select * from field.site_domains where id=$1 and organization_id=$2 for update',[request.params.id,identity.organizationId]),row=found.rows[0];
        if(!row){await db.query('rollback');return reply.code(404).send({error:'domain_not_found'});}
        if(action==='primary'){
          if(row.desired_state!=='active'||row.state!=='connected'||!row.valid_until||row.valid_until.getTime()<=Date.now()){
            await db.query('rollback');return reply.code(409).send({error:'domain_not_ready'});
          }
          if(await rejectExpiredTrial(reply,db,identity.organizationId)){await db.query('rollback');return reply;}
          await db.query('update field.site_domains set is_primary=false where site_id=$1 and is_primary',[row.site_id]);
          await db.query('update field.site_domains set is_primary=true,updated_at=now() where id=$1',[row.id]);
        }else if(action==='disconnect'){
          await disconnectSiteDomain(db,row);
        }else if(action==='reconnect'){
          if(row.desired_state!=='disconnected'||row.state!=='disconnected'){await db.query('rollback');return reply.code(409).send({error:'domain_release_not_completed'});}
          if(await rejectExpiredTrial(reply,db,identity.organizationId)){await db.query('rollback');return reply;}
          const count=await db.query<{count:number}>("select count(*)::integer as count from field.site_domains where organization_id=$1 and desired_state='active'",[identity.organizationId]);
          if(count.rows[0]!.count>=5){await db.query('rollback');return reply.code(409).send({error:'domain_limit_reached'});}
          await db.query(`update field.site_domains set desired_state='active',state='registered',ownership_token=$2,generation=generation+1,
            ownership_state='pending',dns_state='pending',tls_state='pending',binding_state='pending',checked_at=null,valid_until=null,
            certificate_expires_at=null,ownership_release_generation=null,last_error=null,claim_token=null,lease_expires_at=null,next_check_at=now(),updated_at=now() where id=$1`,[row.id,randomBytes(32).toString('base64url')]);
        }else{
          if(row.desired_state!=='active'){await db.query('rollback');return reply.code(409).send({error:'domain_disconnected'});}
          await db.query('update field.site_domains set next_check_at=now(),updated_at=now() where id=$1',[row.id]);
        }
        const saved=await db.query<SiteDomain>('select * from field.site_domains where id=$1',[row.id]);
        await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
          values($1,$2,$3,$4,$5::jsonb)`,[randomUUID(),identity.organizationId,`field.site.domain.${action}`,row.id,JSON.stringify({domainId:row.id,siteId:row.site_id})]);
        await db.query('commit');return domainView(saved.rows[0]!,context);
      }catch(error){await db.query('rollback');throw error;}finally{db.release();}
    });
  }
  // Caddy on-demand TLS `ask` 확인용. 소유권 TXT와 라우팅 DNS가 검증된 활성 도메인(tls_pending·connected)만 200을 준다.
  // TLS 확인 실패로 error/domain_tls_failed에 머문 도메인도 재발급·재확인이 가능하도록 허용한다(사이트 연결은 connected만).
  // 인증서는 이 응답 뒤에 발급되므로 TLS ready를 요구하지 않는다. 조회 전용이며 DB에 쓰지 않는다.
  // 삭제 예약·실행된 조직의 도메인은 발급·갱신을 허용하지 않는다(F-O16).
  async function allowedHost(value:unknown){
    const hostname=normalizeCustomHostname(value,context.baseDomain);
    if(!hostname)return null;
    const found=await runtime.pool.query<{organization_id:string}>(`select d.organization_id from field.site_domains d
      join field.organizations o on o.id=d.organization_id and o.deleted_at is null
      where d.hostname=$1 and d.hostname_claimed and d.desired_state='active' and d.ownership_release_generation is null
        and d.ownership_state='verified' and d.dns_state='verified' and (d.state in ('tls_pending','connected') or (d.state='error' and d.last_error='domain_tls_failed'))
        and not exists(select 1 from field.organization_deletion_requests r where r.organization_id=d.organization_id
          and r.status in ('scheduled','executed')) limit 1`,[hostname]);
    return found.rows[0]?{hostname,organizationId:found.rows[0].organization_id}:null;
  }
  app.get<{Querystring:{domain?:unknown}}>('/v1/public/site-hosts/allow',async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    const allowed=await allowedHost(request.query.domain);
    return allowed?{domain:allowed.hostname,organizationId:allowed.organizationId}:reply.code(404).send({error:'site_host_not_allowed'});
  });
  // edge TLS 준비 확인(추가). Caddy가 사업자 도메인 HTTPS 요청 중 이 경로만 Field API로 넘긴다(Host 유지).
  // ask와 같은 허용 조건의 도메인에만 증명값을 돌려주고, 조회 전용이며 DB에 쓰지 않는다.
  // 조직 ID는 공개 조회로 누구나 알 수 있으므로, 서버 비밀값에서 나온 HMAC(도메인:조직)을 증명으로 준다.
  // Caddy edge 어댑터는 인증서 체인 검증을 통과한 응답의 proof가 도메인 행으로 계산한 값과 같을 때만 TLS ready로 본다.
  app.get('/.well-known/field-site-health',async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    const allowed=await allowedHost(request.headers.host);
    return allowed?{ok:true,proof:siteHealthProof(siteHealthSecret(),allowed.hostname,allowed.organizationId)}
      :reply.code(404).send({error:'site_host_not_allowed'});
  });
  app.get<{Params:{hostname:string;kind:string;id:string}}>('/v1/public/site-hosts/:hostname/resources/:kind/:id',async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    const tables:Record<string,string>={'inquiries':'field.inquiries','reservations':'field.reservations','site-assets':'field.site_assets'};
    const table=tables[request.params.kind];
    if(typeof table!=='string'||!uuid.test(request.params.id))return reply.code(404).send({error:'site_resource_not_found'});
    const host=await resolvedCustomHost(runtime.pool,request.params.hostname);
    if(!host)return reply.code(404).send({error:'site_resource_not_found'});
    // 삭제 요청된 사진('deleting')은 공개 GET이 404이므로 허용하지 않는다.
    const usable=table==='field.site_assets'?" and state='ready'":'';
    const found=await runtime.pool.query(`select 1 from ${table} where id=$1 and organization_id=$2${usable}`,[request.params.id,host.organization_id]);
    return found.rowCount?{allowed:true}:reply.code(404).send({error:'site_resource_not_found'});
  });
  app.get<{Params:{hostname:string}}>('/v1/public/site-hosts/:hostname',async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    const row=await resolvedCustomHost(runtime.pool,request.params.hostname);
    return row?{slug:row.slug,organizationId:row.organization_id,origin:`https://${row.hostname}`}:
      reply.code(404).send({error:'site_host_not_found'});
  });
}
