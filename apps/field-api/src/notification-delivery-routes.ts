import { resolvedCustomHost } from './custom-domains.js';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { sealNotification, unsealNotification, type NotificationContext } from './notification-context.js';
import { validPushSubscription } from './notification-web-push.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
function allowedOrigin(request:FastifyRequest,context:NotificationContext|undefined){const origin=context?.webOrigin??process.env.FIELD_PUBLIC_WEB_ORIGIN??(process.env.FIELD_PROFILE==='mock'?'http://127.0.0.1:3002':undefined);return (!request.headers.origin||request.headers.origin===origin)&&request.headers['sec-fetch-site']!=='cross-site';}
export function registerFieldDeliveryRoutes(app:FastifyInstance,runtime:Pick<FieldBusinessRuntime,'pool'|'resolveUserId'|'resolveSession'>,context?:NotificationContext){
 async function organization(request:FastifyRequest,reply:FastifyReply,owner=false){
  const userId=await runtime.resolveUserId(request.headers);if(!userId){reply.code(401).send({error:'authentication_required'});return null;}
  const org=request.headers['x-organization-id'];if(typeof org!=='string'||!uuid.test(org)){reply.code(400).send({error:'organization_id_required'});return null;}
  const found=await runtime.pool.query<{role:string}>('select role from field.memberships where organization_id=$1 and user_id=$2 and ($3=false or role=\'owner\')',[org,userId,owner]);
  if(!found.rowCount){reply.code(404).send({error:'organization_not_found'});return null;}
  return {organizationId:org,userId,role:found.rows[0]!.role};
 }
 app.get('/v1/owner/notification-deliveries',async(request,reply)=>{
  const actor=await organization(request,reply);if(!actor)return reply;
  const result=await runtime.pool.query(`select d.id,d.notification_id,d.channel,d.state,d.error_code,d.started_at,d.updated_at,d.fallback_of from field.notification_deliveries d where d.organization_id=$1 order by d.created_at desc,d.id desc limit 100`,[actor.organizationId]);
  const limit=(await runtime.pool.query('select daily_attempt_limit from field.notification_limits where organization_id=$1',[actor.organizationId])).rows[0];
  const recipients=(await runtime.pool.query<{id:string;recipient_ciphertext:string|null;kakao:boolean;push:boolean}>("select id,recipient_ciphertext,kakao,push from field.notification_recipients where organization_id=$1 and target_kind='owner' and target_id=$2 and actor_user_id=$2 and revoked_at is null and retention_purged_at is null",[actor.organizationId,actor.userId])).rows;
  const phone=recipients.find(r=>!r.push);let maskedPhone:string|null=null;
  if(phone?.recipient_ciphertext&&context){try{const raw=unsealNotification(phone.recipient_ciphertext,context.key,`recipient:${phone.id}`);if(/^01[016789]\d{7,8}$/.test(raw))maskedPhone=raw.replace(/^(\d{3})\d+(\d{4})$/,'$1-****-$2');}catch{/* Never expose ciphertext or a decryption error. */}}
  const ownerConsent={maskedPhone,kakao:phone?.kakao===true,push:recipients.some(r=>r.push)};
  return reply.header('Cache-Control','private, no-store').send({deliveries:result.rows,canManage:actor.role==='owner',ownerConsent,storageState:context?'configured':'blocked_integration',dailyAttemptLimit:limit?.daily_attempt_limit??0,providerState:context?.provider?'configured':'blocked_integration',pushState:context?.pushProvider?'configured':'blocked_integration',pushPublicKey:context?.pushPublicKey??null});
 });
 app.put('/v1/owner/notification-limit',async(request,reply)=>{
  const actor=await organization(request,reply,true);if(!actor)return reply;if(!allowedOrigin(request,context))return reply.code(403).send({error:'origin_not_allowed'});
  const session=await runtime.resolveSession?.(request.headers);if(!session||session.userId!==actor.userId)return reply.code(401).send({error:'current_session_required'});
  const body=object(request.body),limit=body?.dailyAttemptLimit;
  if(body?.costLimitAccepted!==true||!Number.isInteger(limit)||Number(limit)<0||Number(limit)>1000)return reply.code(400).send({error:'invalid_notification_limit'});
  const db=await runtime.pool.connect();try{await db.query('begin');await db.query('select id from field.organizations where id=$1 for update',[actor.organizationId]);
    if(!(await db.query("select 1 from field.memberships where organization_id=$1 and user_id=$2 and role='owner' for share",[actor.organizationId,actor.userId])).rowCount){await db.query('rollback');return reply.code(404).send({error:'organization_not_found'});}
    await db.query('insert into field.notification_limits(organization_id,daily_attempt_limit,approved_by) values($1,$2,$3) on conflict(organization_id) do update set daily_attempt_limit=excluded.daily_attempt_limit,approved_by=excluded.approved_by,approved_at=now()',[actor.organizationId,limit,actor.userId]);await db.query('commit');
  }catch(e){await db.query('rollback');throw e;}finally{db.release();}
  return {dailyAttemptLimit:limit};
 });
 async function customerSource(kind:string,id:string,capHash:string,db:Pick<typeof runtime.pool,'query'>=runtime.pool,lock=false){
  if(!['inquiry','reservation'].includes(kind))return null;
  const table=kind==='inquiry'?'field.inquiries':'field.reservations';
  return (await db.query<{organization_id:string;customer_phone:string}>(`select organization_id,customer_phone from ${table} where id=$1 and visitor_key_hash=$2 and consent_at is not null and retention_work_purged_at is null ${kind==='inquiry'?'and is_test=false':''}${lock?' for share':''}`,[id,capHash])).rows[0]??null;
 }
 async function customerOrigin(request:FastifyRequest,organizationId:string,db:Pick<typeof runtime.pool,'query'>=runtime.pool,lock=false){
  if(request.headers['sec-fetch-site']==='cross-site')return false;
  const webOrigin=context?.webOrigin??process.env.FIELD_PUBLIC_WEB_ORIGIN??(process.env.FIELD_PROFILE==='mock'?'http://127.0.0.1:3002':undefined);
  if(!request.headers.origin||request.headers.origin===webOrigin)return true;
  let origin:URL;try{origin=new URL(request.headers.origin);}catch{return false;}
  if(origin.origin!==request.headers.origin||origin.username||origin.password)return false;
  const base=process.env.FIELD_SITE_BASE_DOMAIN??(process.env.FIELD_PROFILE==='mock'?'localhost:3002':undefined);
  if(base){const site=(await db.query<{slug:string}>(`select s.slug from field.sites s where s.organization_id=$1 and exists(select 1 from field.site_releases r where r.site_id=s.id)${lock?' for share of s':''}`,[organizationId])).rows[0];
   if(site&&origin.origin===`${process.env.FIELD_PROFILE==='mock'?'http':'https'}://${site.slug}.${base}`)return true;}
  if(origin.protocol!=='https:'||origin.port)return false;
  const host=await resolvedCustomHost(db,origin.hostname,lock);return host?.organization_id===organizationId;
 }
 async function saveConsent(organizationId:string,kind:string,target:string,audience:string,phone:string|undefined,body:Record<string,unknown>,actor:string|null,push=false,capHash?:string,customerRequest?:FastifyRequest){
  const db=await runtime.pool.connect();try{await db.query('begin');await db.query('select id from field.organizations where id=$1 for update',[organizationId]);
   if(actor&&!(await db.query("select 1 from field.memberships where organization_id=$1 and user_id=$2 and role='owner' for share",[organizationId,actor])).rowCount){await db.query('rollback');return null;}
   if(capHash){const source=await customerSource(kind,target,capHash,db,true);if(!source||source.organization_id!==organizationId||customerRequest&&!await customerOrigin(customerRequest,organizationId,db,true)){await db.query('rollback');return null;}phone=source.customer_phone;}
   const active=(await db.query<{id:string;recipient_ciphertext:string|null;kakao:boolean;sms:boolean;push:boolean}>('select id,recipient_ciphertext,kakao,sms,push from field.notification_recipients where organization_id=$1 and target_kind=$2 and target_id=$3 and push=$4 and revoked_at is null for update',[organizationId,kind,target,push])).rows[0];
   const enabled=push?body.push===true:body.kakao===true||body.sms===true;
   if(enabled&&phone===undefined&&active?.recipient_ciphertext&&context){try{phone=unsealNotification(active.recipient_ciphertext,context.key,`recipient:${active.id}`);}catch{/* A new recipient is required when the stored value cannot be opened. */}}
   if(enabled&&(phone===undefined||!context)){await db.query('rollback');return 'recipient_required';}
   if(active&&enabled&&active.kakao===(body.kakao===true)&&active.sms===(body.sms===true)&&active.push===push&&active.recipient_ciphertext!==null&&unsealNotification(active.recipient_ciphertext,context!.key,`recipient:${active.id}`)===phone){await db.query('commit');return active.id;}
   if(active)await db.query('update field.notification_recipients set revoked_at=now() where id=$1',[active.id]);
   if(!enabled){await db.query('commit');return 'withdrawn';}
   const id=randomUUID();await db.query(`insert into field.notification_recipients(id,organization_id,target_kind,target_id,audience,actor_user_id,recipient_ciphertext,kakao,sms,push,consent_version) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'notification-v1')`,[id,organizationId,kind,target,audience,actor,sealNotification(phone!,context!.key,`recipient:${id}`),body.kakao===true,body.sms===true,push]);await db.query('commit');return id;
  }catch(e){await db.query('rollback');throw e;}finally{db.release();}
 }
 app.post('/v1/owner/notification-consent',async(request,reply)=>{
  const actor=await organization(request,reply,true);if(!actor)return reply;if(!allowedOrigin(request,context))return reply.code(403).send({error:'origin_not_allowed'});
  const session=await runtime.resolveSession?.(request.headers);if(!session||session.userId!==actor.userId)return reply.code(401).send({error:'current_session_required'});
  const body=object(request.body);if(!body||body.consentVersion!=='notification-v1'||typeof body.kakao!=='boolean'||body.sms===true||body.phone!==undefined&&(typeof body.phone!=='string'||!/^01[016789]\d{7,8}$/.test(body.phone)))return reply.code(400).send({error:'invalid_notification_consent'});
  if(body.kakao&&!context)return reply.code(503).send({error:'notification_configuration_missing',state:'blocked_integration'});
  const id=await saveConsent(actor.organizationId,'owner',actor.userId,'owner',body.phone as string|undefined,body,actor.userId);if(id==='recipient_required')return reply.code(400).send({error:'notification_phone_required'});if(!id)return reply.code(404).send({error:'organization_not_found'});
  return {recipientId:id,phoneVerified:false,providerState:context?.provider?'configured':'blocked_integration'};
 });
 app.post('/v1/owner/push-subscriptions',async(request,reply)=>{
  const actor=await organization(request,reply,true);if(!actor)return reply;if(!allowedOrigin(request,context))return reply.code(403).send({error:'origin_not_allowed'});
  const session=await runtime.resolveSession?.(request.headers);if(!session||session.userId!==actor.userId)return reply.code(401).send({error:'current_session_required'});
  const body=object(request.body),subscription=validPushSubscription(body?.subscription);if(!body||typeof body.push!=='boolean'||body.consentVersion!=='notification-v1'||body.push&&!subscription)return reply.code(400).send({error:'invalid_push_subscription'});
  if(body.push&&!context)return reply.code(503).send({error:'notification_configuration_missing',state:'blocked_integration'});
  const id=await saveConsent(actor.organizationId,'owner',actor.userId,'owner',subscription?JSON.stringify(subscription):undefined,body,actor.userId,true);
  if(!id)return reply.code(404).send({error:'organization_not_found'});return {recipientId:id,providerState:context?.pushProvider?'configured':'blocked_integration'};
 });
 app.get<{Params:{kind:string;id:string}}>('/v1/customer/notification-consents/:kind/:id',async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  const token=request.headers.authorization?.startsWith('Bearer ')?request.headers.authorization.slice(7):'',kind=request.params.kind;
  if(!uuid.test(request.params.id)||!/^[A-Za-z0-9_-]{43}$/.test(token))return reply.code(404).send({error:'notification_target_not_found'});
  const found=await customerSource(kind,request.params.id,createHash('sha256').update(token).digest('hex'));
  if(!found)return reply.code(404).send({error:'notification_target_not_found'});if(!(await customerOrigin(request,found.organization_id)))return reply.code(403).send({error:'origin_not_allowed'});
  const active=(await runtime.pool.query<{kakao:boolean;sms:boolean}>("select kakao,sms from field.notification_recipients where organization_id=$1 and target_kind=$2 and target_id=$3 and audience='customer' and not push and revoked_at is null and retention_purged_at is null",[found.organization_id,kind,request.params.id])).rows[0];
  return {kakao:active?.kakao===true,sms:active?.sms===true,state:active?'consented':'withdrawn',phoneVerified:false,storageState:context?'configured':'blocked_integration',providerState:context?.provider?'configured':'blocked_integration'};
 });
 app.post<{Params:{kind:string;id:string}}>('/v1/customer/notification-consents/:kind/:id',async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  const token=request.headers.authorization?.startsWith('Bearer ')?request.headers.authorization.slice(7):'',kind=request.params.kind;
  if(!uuid.test(request.params.id)||!/^[A-Za-z0-9_-]{43}$/.test(token))return reply.code(404).send({error:'notification_target_not_found'});
  const capHash=createHash('sha256').update(token).digest('hex'),found=await customerSource(kind,request.params.id,capHash);
  if(!found)return reply.code(404).send({error:'notification_target_not_found'});if(!(await customerOrigin(request,found.organization_id)))return reply.code(403).send({error:'origin_not_allowed'});
  const body=object(request.body);if(!body||body.consentVersion!=='notification-v1'||typeof body.kakao!=='boolean'||typeof body.sms!=='boolean'||body.sms===true&&body.kakao!==true)return reply.code(400).send({error:'invalid_notification_consent'});
  if((body.kakao||body.sms)&&!context)return reply.code(503).send({error:'notification_configuration_missing',state:'blocked_integration'});
  const id=await saveConsent(found.organization_id,kind,request.params.id,'customer',found.customer_phone,body,null,false,capHash,request);
  if(!id)return reply.code(404).send({error:'notification_target_not_found'});
  return {recipientId:id,state:id==='withdrawn'?'withdrawn':'consented',providerState:context?.provider?'configured':'blocked_integration'};
 });
 app.post('/integrations/v1/notifications/solapi',async(request,reply)=>{
  const hash=context?.callbackSecret?createHash('sha1').update(context.callbackSecret).digest('hex'):undefined,received=request.headers['x-solapi-secret'];
  if(!hash||typeof received!=='string'||! /^[a-f0-9]{40}$/.test(received)||!timingSafeEqual(Buffer.from(hash),Buffer.from(received)))return reply.code(401).send({error:'invalid_notification_callback'});
  if(request.headers['x-solapi-event-name']!=='SINGLE-REPORT'||!Array.isArray(request.body)||request.body.length>100)return reply.code(400).send({error:'invalid_notification_callback'});
  const events=request.body.map(object);if(events.some(e=>!e||!uuid.test(String(object(e.customFields)?.deliveryId))||typeof e.messageId!=='string'||e.messageId.length>100||typeof e.statusCode!=='string'||!/^\d{4}$/.test(e.statusCode)))return reply.code(400).send({error:'invalid_notification_callback'});
  const db=await runtime.pool.connect();try{await db.query('begin');for(const event of events){const e=event!,id=String(object(e.customFields)!.deliveryId),digest=createHash('sha256').update(JSON.stringify([id,e.messageId,e.statusCode,e.dateReported??null])).digest('hex');
    const d=(await db.query<{id:string;provider_id:string|null}>('select id,provider_id from field.notification_deliveries where id=$1 and provider=\'solapi\' and account_id=$2',[id,context?.provider?.accountId])).rows[0];if(!d||d.provider_id&&d.provider_id!==e.messageId)continue;
    const inserted=await db.query('insert into field.notification_callbacks(digest,delivery_id,provider_id) values($1,$2,$3) on conflict do nothing',[digest,d.id,e.messageId]);
    if(inserted.rowCount)await db.query("update field.notification_deliveries set next_attempt_at=now() where id=$1 and state in ('unknown','accepted')",[d.id]);
   }await db.query('commit');return reply.code(200).send({received:true});
  }catch(e){await db.query('rollback');throw e;}finally{db.release();}
 });
}
