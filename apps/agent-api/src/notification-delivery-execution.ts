import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { sealNotification, unsealNotification, type NotificationContext } from './notification-context.js';
import type { NotificationResult, NotificationSend } from './notification-provider.js';
export type NotificationDeliveryRuntime={pool:Pool;notification?:NotificationContext};
type Source={id:string;organization_id:string;target_id:string;target_kind:string;audience:'owner'|'customer';created_at:Date;source_message_id:string|null;purged_at:Date|null;eligible:boolean;phone:string|null};
type Recipient={id:string;organization_id:string;audience:'owner'|'customer';target_id:string;actor_user_id:string|null;target_kind:string;recipient_ciphertext:string;kakao:boolean;sms:boolean;push:boolean;consented_at:Date;revoked_at:Date|null};
type Delivery={id:string;organization_id:string;notification_id:string;recipient_id:string;channel:NotificationSend['channel'];state:string;fallback_of:string|null;recipient_ciphertext:string;started_at:Date|null;provider:string|null;account_id:string|null;key_fingerprint:string|null;provider_id:string|null;claim_token:string|null};
const sourceQuery=`select n.id,n.organization_id,n.inquiry_id::text as target_id,'inquiry' as target_kind,n.audience,n.created_at,n.source_message_id,i.retention_work_purged_at as purged_at,
 i.customer_phone as phone,(i.retention_work_purged_at is null and i.mode='human' and i.state<>'spam' and i.consent_at is not null and n.state<>'not_applicable'
 and (n.field_reservation_event_id is null or not exists(select 1 from ap.field_reservation_events e join ap.field_notification_route_closures c on c.action_request_id=e.action_request_id where e.id=n.field_reservation_event_id))) as eligible
 from ap.notification_events n join ap.inquiries i on i.id=n.inquiry_id join ap.outbox o on o.id=n.outbox_id
 where (o.event_type in ('ap.inquiry.created','ap.inquiry.customer_message','ap.inquiry.owner_reply','ap.field_reservation.event_recorded'))`;
async function source(db:PoolClient,id:string){return (await db.query<Source>(`${sourceQuery} and n.id=$1`,[id])).rows[0];}
async function lockSource(db:PoolClient,id:string){
  await db.query('select i.id from ap.inquiries i join ap.notification_events n on n.inquiry_id=i.id where n.id=$1 for update of i',[id]);
  await db.query(`select a.id from ap.field_action_requests a join ap.field_reservation_events e on e.action_request_id=a.id join ap.notification_events n on n.field_reservation_event_id=e.id where n.id=$1 for update of a`,[id]);
}
async function prepare(runtime:NotificationDeliveryRuntime){
 const db=await runtime.pool.connect();try{
  await db.query('begin');
  const rows=await db.query<Source>(`${sourceQuery} and exists(select 1 from ap.notification_recipients r where r.organization_id=n.organization_id and r.revoked_at is null and r.consented_at<=n.created_at and ((n.audience='owner' and r.target_kind='owner') or (n.audience='customer' and r.target_kind='inquiry' and r.target_id=n.inquiry_id::text))) and not exists(select 1 from ap.notification_deliveries d where d.notification_id=n.id) order by n.created_at,n.id limit 100`);
  for(const initial of rows.rows){
   await db.query('select id from ap.organizations where id=$1 for update',[initial.organization_id]);await lockSource(db,initial.id);const s=await source(db,initial.id);if(!s?.eligible)continue;
   const recipients=await db.query<Recipient>(`select r.* from ap.notification_recipients r where r.organization_id=$1 and r.audience=$2 and r.revoked_at is null and r.consented_at<=$3 and (($2='owner' and r.target_kind='owner' and exists(select 1 from ap.memberships m where m.organization_id=r.organization_id and m.user_id=r.actor_user_id and m.role in ('owner','editor'))) or ($2='customer' and r.target_kind=$4 and r.target_id=$5)) for share`,[s.organization_id,s.audience,s.created_at,s.target_kind,s.target_id]);
   for(const r of recipients.rows){
    for(const channel of (r.push?['web_push'] as const:r.kakao?['kakao'] as const:[])){
     if(!runtime.notification)continue;let value:string;try{value=unsealNotification(r.recipient_ciphertext,runtime.notification.key,`recipient:${r.id}`);}catch{continue;}
     if(channel!=='web_push'&&(s.audience==='customer'&&value!==s.phone||!/^01[016789]\d{7,8}$/.test(value)))continue;
     const id=randomUUID();await db.query(`insert into ap.notification_deliveries(id,organization_id,notification_id,recipient_id,channel,state,recipient_ciphertext) values($1,$2,$3,$4,$5,'pending',$6) on conflict(notification_id,recipient_id,channel) do nothing`,[id,s.organization_id,s.id,r.id,channel,sealNotification(value,runtime.notification.key,`delivery:${id}`)]);
    }
   }
  }
  await db.query('commit');
 }catch(e){await db.query('rollback');throw e;}finally{db.release();}
}
async function projection(db:PoolClient,d:Delivery,s:Source,state:string){
 if(s.audience!=='customer'||s.purged_at)return;
 const projected=state==='suppressed'?'blocked_integration':state;
 await db.query("update ap.notification_events set state=$2 where id=$1 and state<>'not_applicable'",[s.id,projected]);
 if(s.source_message_id)await db.query("update ap.inquiry_messages set delivery_state=$2 where id=$1 and visibility='customer' and actor='owner'",[s.source_message_id,['accepted','unknown'].includes(projected)?'unknown':['sent','failed','pending'].includes(projected)?projected:'blocked_integration']);
}
async function claim(runtime:NotificationDeliveryRuntime){
 const db=await runtime.pool.connect();try{
  await db.query('begin');
  const org=(await db.query<{organization_id:string}>(`select o.id as organization_id from ap.organizations o where exists(select 1 from ap.notification_deliveries d where d.organization_id=o.id and d.state in ('pending','processing','unknown','accepted','blocked_integration','blocked_limit') and (d.channel<>'web_push' or d.state<>'accepted') and d.next_attempt_at<=now() and (d.state<>'processing' or d.lease_expires_at<=now())) order by o.id for update skip locked limit 1`)).rows[0];
  if(!org){await db.query('commit');return {state:'empty'} as const;}
  const candidate=(await db.query<Delivery>(`select * from ap.notification_deliveries where organization_id=$1 and state in ('pending','processing','unknown','accepted','blocked_integration','blocked_limit') and (channel<>'web_push' or state<>'accepted') and next_attempt_at<=now() and (state<>'processing' or lease_expires_at<=now()) order by created_at,id for update limit 1`,[org.organization_id])).rows[0]!;
  await lockSource(db,candidate.notification_id);const s=await source(db,candidate.notification_id);
  const r=(await db.query<Recipient>('select * from ap.notification_recipients where id=$1 for share',[candidate.recipient_id])).rows[0]!;
  const provider=candidate.channel==='web_push'?runtime.notification?.pushProvider:runtime.notification?.provider;
  const eligible=s?.eligible&&!r.revoked_at&&(candidate.channel==='sms'?r.sms:candidate.channel==='kakao'?r.kakao:r.push)
    &&(r.audience!=='owner'||!!(await db.query("select 1 from ap.memberships where organization_id=$1 and user_id=$2 and role in ('owner','editor') for share",[r.organization_id,r.actor_user_id])).rowCount);
  let reason:string|undefined,newState:string|undefined;
  if(!candidate.started_at&&!eligible){newState='suppressed';reason='consent_or_route_unavailable';}
  else if(!provider||!runtime.notification){newState=candidate.started_at?'unknown':'blocked_integration';reason='provider_unavailable';}
  else if(candidate.started_at&&(candidate.provider!==provider.name||candidate.account_id!==provider.accountId)){newState='unknown';reason='provider_binding_changed';}
  let recipient:string|undefined;
  if(!newState)try{recipient=unsealNotification(candidate.recipient_ciphertext,runtime.notification!.key,`delivery:${candidate.id}`);}catch{newState=candidate.started_at?'unknown':'blocked_integration';reason='recipient_unavailable';}
  if(!newState&&!candidate.started_at){
    const limits=await db.query<{daily_attempt_limit:number}>('select daily_attempt_limit from ap.notification_limits where organization_id=$1 for share',[org.organization_id]);
    const day=(await db.query<{day:string}>("select to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD') as day")).rows[0]!.day;
    await db.query('insert into ap.notification_daily_usage(organization_id,day) values($1,$2) on conflict do nothing',[org.organization_id,day]);
    const used=await db.query<{reserved:number}>('select reserved from ap.notification_daily_usage where organization_id=$1 and day=$2 for update',[org.organization_id,day]);
    if(!limits.rows[0]||used.rows[0]!.reserved>=limits.rows[0].daily_attempt_limit){newState='blocked_limit';reason='notification_limit';}
    else{await db.query('update ap.notification_daily_usage set reserved=reserved+1 where organization_id=$1 and day=$2',[org.organization_id,day]);await db.query('update ap.notification_deliveries set reserved=true,reserved_day=$2 where id=$1',[candidate.id,day]);}
  }
  if(newState){await db.query("update ap.notification_deliveries set state=$2,error_code=$3,claim_token=null,lease_expires_at=null,next_attempt_at=now()+interval '5 minutes',updated_at=now() where id=$1",[candidate.id,newState,reason]);if(s)await projection(db,candidate,s,newState);await db.query('commit');return {state:newState} as const;}
  const token=randomUUID(),first=!candidate.started_at;
  const updated=(await db.query<Delivery>(`update ap.notification_deliveries set state='processing',error_code=null,claim_token=$2,lease_expires_at=now()+interval '90 seconds',started_at=coalesce(started_at,now()),provider=coalesce(provider,$3),account_id=coalesce(account_id,$4),key_fingerprint=coalesce(key_fingerprint,$5),updated_at=now() where id=$1 returning *`,[candidate.id,token,provider!.name,provider!.accountId,provider!.keyFingerprint])).rows[0]!;
  if(s)await projection(db,updated,s,'pending');await db.query('commit');
  return {state:'claimed',row:updated,provider:provider!,first,input:{deliveryId:updated.id,channel:updated.channel,audience:r.audience,recipient:recipient!,startedAt:updated.started_at!.toISOString(),...(updated.provider_id?{providerId:updated.provider_id}:{})} as NotificationSend} as const;
 }catch(e){await db.query('rollback');throw e;}finally{db.release();}
}
async function finish(runtime:NotificationDeliveryRuntime,d:Delivery,input:NotificationSend,result:NotificationResult|null){
 const db=await runtime.pool.connect();try{
  await db.query('begin');await db.query('select id from ap.organizations where id=$1 for update',[d.organization_id]);await lockSource(db,d.notification_id);
  const row=(await db.query<Delivery>('select * from ap.notification_deliveries where id=$1 for update',[d.id])).rows[0]!;
  if(row.state!=='processing'||row.claim_token!==d.claim_token){await db.query('commit');return 'superseded';}
  const s=await source(db,d.notification_id);
  const valid=result&&result.deliveryId===d.id&&result.accountId===d.account_id&&result.recipient===input.recipient&&result.channel===d.channel&&result.providerId.length>0&&(!row.provider_id||row.provider_id===result.providerId);
  const state=valid?result.state:'unknown';
  await db.query("update ap.notification_deliveries set state=$2,error_code=$3,provider_id=coalesce(provider_id,$4),allow_fallback=$5,claim_token=null,lease_expires_at=null,next_attempt_at=now()+interval '1 minute',updated_at=now() where id=$1",[d.id,state,valid?result.code:'provider_result_unknown',valid?result.providerId:null,!!(valid&&result.state==='failed'&&result.allowFallback&&result.code==='3104'&&d.channel==='kakao')]);
  let projected:string=state;
  if(valid&&state==='failed'&&result.allowFallback&&result.code==='3104'&&d.channel==='kakao'&&s?.eligible){
   const r=(await db.query<Recipient>('select * from ap.notification_recipients where id=$1 for share',[d.recipient_id])).rows[0]!;
   if(r.audience==='customer'&&r.sms&&!r.revoked_at&&runtime.notification){const id=randomUUID();await db.query(`insert into ap.notification_deliveries(id,organization_id,notification_id,recipient_id,channel,state,fallback_of,recipient_ciphertext) values($1,$2,$3,$4,'sms','pending',$5,$6) on conflict(notification_id,recipient_id,channel) do nothing`,[id,d.organization_id,d.notification_id,d.recipient_id,d.id,sealNotification(input.recipient,runtime.notification.key,`delivery:${id}`)]);projected='pending';}
  }
  if(s)await projection(db,d,s,projected);
  if(valid&&d.channel==='web_push'&&state==='failed'&&['404','410'].includes(result.code))await db.query('update ap.notification_recipients set revoked_at=coalesce(revoked_at,now()) where id=$1',[d.recipient_id]);
  await db.query('commit');return state;
 }catch(e){await db.query('rollback');throw e;}finally{db.release();}
}
export async function runNotificationDeliveryOnce(runtime:NotificationDeliveryRuntime):Promise<string>{
 await prepare(runtime);
 const c=await claim(runtime);if(!c.row||!c.provider||!c.input)return c.state;
 let result:NotificationResult|null=null;try{result=c.first?await c.provider.send(c.input):await c.provider.lookup(c.input);if(c.first&&c.input.channel!=='web_push'&&result&&result.state!=='accepted')result=await c.provider.lookup({...c.input,providerId:result.providerId});}catch{/* A transport error is never an authoritative failure. */}
 return finish(runtime,c.row,c.input,result);
}
