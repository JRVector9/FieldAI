import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { before, after, test } from 'node:test';
import { Client, Pool } from 'pg';
import Fastify from 'fastify';
import { runNotificationDeliveryOnce } from '../src/notification-delivery-execution.js';
import { sealNotification, type NotificationContext } from '../src/notification-context.js';
import { registerFieldDeliveryRoutes } from '../src/notification-delivery-routes.js';
import type { NotificationSend, NotificationResult } from '../src/notification-provider.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
const original=process.env.FIELD_DATABASE_URL!, databases=new Set<string>();let admin:Client;
before(async()=>{const u=new URL(original);assert.ok(['localhost','127.0.0.1'].includes(u.hostname));assert.equal(u.port,'55432');assert.equal(u.username,'field_local');assert.match(u.pathname,/^\/fieldai_field_test_[a-f0-9]+$/);u.pathname='/postgres';admin=new Client({connectionString:u.toString()});await admin.connect();});
after(async()=>{for(const db of databases)await admin.query(`drop database "${db}" with(force)`);await admin.end();});
async function fixture(){
  const name=`fieldai_field_test_${randomUUID().replaceAll('-','')}`,url=new URL(original);await admin.query(`create database "${name}"`);databases.add(name);url.pathname=`/${name}`;
  const migration=spawnSync(process.execPath,['tools/run-migrations.mjs','field'],{cwd:resolve('../..'),env:{...process.env,FIELD_DATABASE_URL:url.toString()},stdio:'inherit'});assert.equal(migration.status,0);
  const pool=new Pool({connectionString:url.toString()}),org=randomUUID(),owner=randomUUID(),inquiry=randomUUID(),release=randomUUID(),recipient=randomUUID(),cap=randomBytes(32).toString('base64url');
  await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,true)',[owner,'Synthetic',`${owner}@example.invalid`]);
  await pool.query('insert into field.organizations(id,owner_user_id,name) values($1,$2,$3)',[org,owner,'합성 알림 조직']);await pool.query("insert into field.memberships(organization_id,user_id,role) values($1,$2,'owner')",[org,owner]);
  await pool.query("insert into field.inquiries(id,organization_id,catalog_revision,service_id,service_snapshot,customer_name,customer_phone,visitor_key_hash,state,consent_at) values($1,$2,1,$3,'{}','Synthetic','01012345678',$4,'waiting_customer',now())",[inquiry,org,release,createHash('sha256').update(cap).digest('hex')]);
  const calls:NotificationSend[]=[],lookups:NotificationSend[]=[];let remote:NotificationResult|null=null,behavior:'sent'|'accepted'|'lost'|'failed'='sent',waiting:Promise<void>|undefined,resume:(()=>void)|undefined;
  const notification:NotificationContext={key:randomBytes(32),webOrigin:'http://127.0.0.1:3002',callbackSecret:'synthetic-secret',provider:{name:'solapi',accountId:'synthetic-account',keyFingerprint:'a'.repeat(64),
    async send(input){calls.push(input);const row=(await pool.query('select * from field.notification_deliveries where id=$1',[input.deliveryId])).rows[0];assert.equal(row.state,'processing');assert.ok(row.started_at);assert.ok(row.claim_token);assert.equal(row.account_id,'synthetic-account');
      remote={deliveryId:input.deliveryId,providerId:`provider-${input.deliveryId}`,accountId:'synthetic-account',recipient:input.recipient,channel:input.channel,state:behavior==='failed'?'failed':behavior==='accepted'?'accepted':'sent',code:behavior==='failed'?'3104':'4000',allowFallback:behavior==='failed'};
      await waiting;if(behavior==='lost')throw Error('synthetic-lost');return remote;},async lookup(input){lookups.push(input);return remote;}}};
  await pool.query("insert into field.notification_recipients(id,organization_id,target_kind,target_id,audience,recipient_ciphertext,kakao,sms,consent_version,consented_at) values($1,$2,'inquiry',$3,'customer',$4,true,true,'notification-v1',now()-interval '1 minute')",[recipient,org,inquiry,sealNotification('01012345678',notification.key,`recipient:${recipient}`)]);
  await pool.query('insert into field.notification_limits(organization_id,daily_attempt_limit,approved_by) values($1,10,$2)',[org,owner]);
  const event=async()=>{const outbox=randomUUID(),message=randomUUID();await pool.query("insert into field.inquiry_messages(id,inquiry_id,sender,visibility,body,delivery_state) values($1,$2,'owner','customer','합성 답변','pending')",[message,inquiry]);await pool.query("insert into field.outbox(id,organization_id,event_type,aggregate_id,payload) values($1,$2,'field.inquiry.owner_reply',$3,$4)",[outbox,org,inquiry,{inquiryId:inquiry,sourceMessageId:message}]);return (await pool.query('select id from field.notification_events where outbox_id=$1',[outbox])).rows[0].id;};
  let actor:string|null=owner;const app=Fastify();registerFieldDeliveryRoutes(app,{pool,resolveUserId:async()=>actor,resolveSession:async()=>actor?{id:actor,userId:actor}:null},notification);
  return {pool,org,owner,inquiry,recipient,cap,notification,calls,lookups,app,event,run:(context:NotificationContext|undefined=notification)=>runNotificationDeliveryOnce({pool,notification:context}),
    row:async()=>(await pool.query('select * from field.notification_deliveries order by created_at,id')).rows,
    due:()=>pool.query("update field.notification_deliveries set next_attempt_at=now(),lease_expires_at=case when state='processing' then now()-interval '1 minute' else lease_expires_at end"),
    mode(v:typeof behavior){behavior=v;},remote(v:NotificationResult|null){remote=v;},as(v:string|null){actor=v;},hold(){waiting=new Promise(r=>{resume=r;});},release(){resume?.();},
    close:async()=>{resume?.();await app.close();await pool.end();await admin.query(`drop database "${name}"`);databases.delete(name);}};
}

test('Field persists before send, accounts once, and safely projects confirmed delivery',async()=>{const f=await fixture();try{await f.event();assert.equal(await f.run(),'sent');assert.equal(await f.run(),'empty');assert.equal(f.calls.length,1);const rows=await f.row();assert.equal(rows.length,1);assert.equal(rows[0].state,'sent');assert.equal(rows[0].reserved,true);assert.equal(JSON.stringify(rows).includes('01012345678'),false);assert.equal((await f.pool.query('select delivery_state from field.inquiry_messages')).rows[0].delivery_state,'sent');await assert.rejects(f.pool.query("update field.notification_deliveries set account_id='different'"),{code:'PFN01'});}finally{await f.close();}});
test('Field lost results and unknown absent lookup never resend or create fallback',async()=>{const f=await fixture();try{await f.event();f.mode('lost');assert.equal(await f.run(),'unknown');f.remote(null);await f.due();assert.equal(await f.run(),'unknown');assert.equal(f.calls.length,1);assert.equal((await f.row()).length,1);f.mode('sent');const first=f.calls[0]!;f.remote({deliveryId:first.deliveryId,providerId:'provider-original',accountId:'synthetic-account',recipient:first.recipient,channel:'kakao',state:'sent',code:'4000',allowFallback:false});await f.due();assert.equal(await f.run(),'sent');assert.equal(f.calls.length,1);assert.equal((await f.pool.query('select reserved from field.notification_daily_usage')).rows[0].reserved,1);}finally{await f.close();}});
test('Field confirmed Kakao failure creates exactly one consented SMS fallback',async()=>{const f=await fixture();try{await f.event();f.mode('failed');assert.equal(await f.run(),'failed');f.mode('sent');assert.equal(await f.run(),'sent');assert.equal(await f.run(),'empty');assert.deepEqual(f.calls.map(c=>c.channel),['kakao','sms']);const rows=await f.row();assert.equal(rows.filter(r=>r.channel==='sms').length,1);assert.equal((await f.pool.query('select reserved from field.notification_daily_usage')).rows[0].reserved,2);}finally{await f.close();}});
test('Field missing provider and cost cap preserve event without provider call',async()=>{const f=await fixture();try{await f.event();assert.equal(await f.run({...f.notification,provider:undefined}),'blocked_integration');assert.equal(f.calls.length,0);await f.pool.query('update field.notification_limits set daily_attempt_limit=0');await f.due();assert.equal(await f.run(),'blocked_limit');assert.equal(f.calls.length,0);assert.equal((await f.pool.query('select count(*) from field.notification_events')).rows[0].count,'1');}finally{await f.close();}});
test('Field consent withdrawal stops unstarted work but reconciles started unknown',async()=>{const f=await fixture();try{await f.event();f.mode('lost');await f.run();await f.pool.query('update field.notification_recipients set revoked_at=now()');await f.due();assert.equal(await f.run(),'sent');assert.equal(f.calls.length,1);await f.event();assert.equal(await f.run(),'empty');}finally{await f.close();}});
test('Field concurrent worker claims and expired lease fence late responses',async()=>{const f=await fixture();try{await f.event();f.hold();const first=f.run();while(f.calls.length===0)await new Promise(r=>setTimeout(r,10));assert.equal(await f.run(),'empty');await f.due();assert.equal(await f.run(),'sent');f.release();assert.equal(await first,'superseded');assert.equal(f.calls.length,1);assert.equal((await f.row())[0].state,'sent');}finally{await f.close();}});
test('Field callback validates secret, deduplicates, and never trusts claimed failure',async()=>{const f=await fixture();try{await f.event();f.mode('accepted');await f.run();const input=f.calls[0]!,body=[{messageId:`provider-${input.deliveryId}`,statusCode:'3104',customFields:{deliveryId:input.deliveryId}}];const call=(secret:string)=>f.app.inject({method:'POST',url:'/integrations/v1/notifications/solapi',headers:{'x-solapi-secret':secret,'x-solapi-event-name':'SINGLE-REPORT'},payload:body});assert.equal((await call('bad')).statusCode,401);const secret=createHash('sha1').update('synthetic-secret').digest('hex');assert.equal((await call(secret)).statusCode,200);assert.equal((await call(secret)).statusCode,200);assert.equal((await f.pool.query('select count(*) from field.notification_callbacks')).rows[0].count,'1');assert.equal(await f.run(),'accepted');assert.equal(f.calls.length,1);assert.equal((await f.row()).length,1);}finally{await f.close();}});
test('Field customer opt-in requires original capability and organization owner sees redacted history',async()=>{const f=await fixture();try{const url=`/v1/customer/notification-consents/inquiry/${f.inquiry}`;f.as(null);assert.equal((await f.app.inject({method:'POST',url,payload:{kakao:true,sms:true,consentVersion:'notification-v1'}})).statusCode,404);const wrong=await f.app.inject({method:'POST',url,headers:{authorization:`Bearer ${randomBytes(32).toString('base64url')}`},payload:{kakao:true,sms:true,consentVersion:'notification-v1'}});assert.equal(wrong.statusCode,404);const accepted=await f.app.inject({method:'POST',url,headers:{authorization:`Bearer ${f.cap}`},payload:{kakao:true,sms:false,consentVersion:'notification-v1'}});assert.equal(accepted.statusCode,200,accepted.body);f.as(f.owner);assert.equal((await f.app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers:{'x-organization-id':f.org}})).statusCode,200);f.as(randomUUID());assert.equal((await f.app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers:{'x-organization-id':f.org}})).statusCode,404);}finally{await f.close();}});

test('Field owner reply API binds its exact source message and projects only that reply',async()=>{const f=await fixture();try{
 const {registerInquiryRoutes}=await import('../src/inquiries.js');registerInquiryRoutes(f.app,{pool:f.pool,resolveUserId:async()=>f.owner});
 const calls=await Promise.all(['첫 합성 답변','둘째 합성 답변'].map(body=>f.app.inject({method:'POST',url:`/v1/owner/inquiries/${f.inquiry}/replies`,headers:{'x-organization-id':f.org},payload:{body}})));
 assert.deepEqual(calls.map(c=>c.statusCode),[201,201]);const ids=calls.map(c=>c.json().messageId);
 const events=(await f.pool.query('select n.delivery_source_message_id,o.payload from field.notification_events n join field.outbox o on o.id=n.outbox_id')).rows;assert.equal(events.length,2);assert.deepEqual(new Set(events.map(e=>e.delivery_source_message_id)),new Set(ids));assert.ok(events.every(e=>e.delivery_source_message_id===e.payload.sourceMessageId));
 assert.equal(await f.run(),'sent');const messages=(await f.pool.query('select id,delivery_state from field.inquiry_messages')).rows;assert.equal(messages.filter(m=>m.delivery_state==='sent').length,1);assert.equal(messages.filter(m=>m.delivery_state==='pending').length,1);assert.equal(await f.run(),'sent');
 }finally{await f.close();}});

test('Field external AP reservation customer events keep AP as sole sender',async()=>{const f=await fixture();try{
 const reservation=randomUUID(),recipient=randomUUID(),outbox=randomUUID();
 await f.pool.query("insert into field.reservations(id,organization_id,catalog_revision,service_id,service_snapshot,booking_mode,customer_name,customer_phone,visitor_key_hash,preferred_time_text,timezone,state,consent_at,source) values($1,$2,1,$3,'{}','request','Synthetic','01012345678',$4,'합성 요청','Asia/Seoul','requested',now(),'external_ap')",[reservation,f.org,randomUUID(),createHash('sha256').update(randomUUID()).digest('hex')]);
 await f.pool.query("insert into field.notification_recipients(id,organization_id,target_kind,target_id,audience,recipient_ciphertext,kakao,sms,consent_version,consented_at) values($1,$2,'reservation',$3,'customer',$4,true,true,'notification-v1',now()-interval '1 minute')",[recipient,f.org,reservation,sealNotification('01012345678',f.notification.key,`recipient:${recipient}`)]);
 await f.pool.query("insert into field.outbox(id,organization_id,event_type,aggregate_id,payload) values($1,$2,'field.reservation.confirmed',$3,$4)",[outbox,f.org,reservation,{reservationId:reservation,notification:'pending'}]);
 assert.equal((await f.pool.query('select delivery_owner_product from field.notification_events where outbox_id=$1',[outbox])).rows[0].delivery_owner_product,'ap');assert.equal(await f.run(),'empty');assert.equal(f.calls.length,0);assert.equal((await f.row()).length,0);
 }finally{await f.close();}});

test('Field native retention clears new customer recipient copies and preserves delivery evidence',async()=>{const f=await fixture();try{await f.event();await f.run();const {removeRetainedPayload}=await import('../src/retention-purge.js');const db=await f.pool.connect();try{await db.query('begin');await removeRetainedPayload(db,'inquiry',f.inquiry,new Date());await db.query('commit');}catch(e){await db.query('rollback');throw e;}finally{db.release();}assert.equal((await f.pool.query('select recipient_ciphertext from field.notification_recipients')).rows[0].recipient_ciphertext,null);assert.equal((await f.row())[0].recipient_ciphertext,null);assert.equal((await f.row())[0].state,'sent');assert.equal(await f.run(),'empty');}finally{await f.close();}});
test('Field started unknown delivery holds native retention until same-attempt reconciliation',async()=>{const f=await fixture();try{await f.event();f.mode('lost');await f.run();const {removeRetainedPayload}=await import('../src/retention-purge.js');const db=await f.pool.connect();try{await db.query('begin');await assert.rejects(removeRetainedPayload(db,'inquiry',f.inquiry,new Date()),{code:'PFN02'});await db.query('rollback');}finally{db.release();}assert.equal((await f.row())[0].state,'unknown');await f.due();assert.equal(await f.run(),'sent');assert.equal(f.calls.length,1);}finally{await f.close();}});

test('Field explicit cost approval requires a current owner session',async()=>{const f=await fixture();const app=Fastify();try{registerFieldDeliveryRoutes(app,{pool:f.pool,resolveUserId:async()=>f.owner,resolveSession:async()=>null},f.notification);const response=await app.inject({method:'PUT',url:'/v1/owner/notification-limit',headers:{'x-organization-id':f.org},payload:{dailyAttemptLimit:100,costLimitAccepted:true}});assert.equal(response.statusCode,401);assert.equal((await f.pool.query('select daily_attempt_limit from field.notification_limits')).rows[0].daily_attempt_limit,10);}finally{await app.close();await f.close();}});


test('Field owner settings expose only self masked consent and withdraw without phone reentry',async()=>{const f=await fixture();try{
 const headers={'x-organization-id':f.org},url='/v1/owner/notification-consent';
 const save=await f.app.inject({method:'POST',url,headers,payload:{phone:'01087654321',kakao:true,sms:false,consentVersion:'notification-v1'}});assert.equal(save.statusCode,200,save.body);
 const settings=await f.app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers});assert.equal(settings.statusCode,200);assert.equal(settings.json().canManage,true);assert.deepEqual(settings.json().ownerConsent,{maskedPhone:'010-****-4321',kakao:true,push:false});assert.equal(settings.body.includes('01087654321'),false);
 const same=await f.app.inject({method:'POST',url,headers,payload:{kakao:true,sms:false,consentVersion:'notification-v1'}});assert.equal(same.statusCode,200,same.body);assert.equal(same.json().recipientId,save.json().recipientId);
 const other=randomUUID();await f.pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,true)',[other,'Synthetic',`${other}@example.invalid`]);await f.pool.query("insert into field.memberships(organization_id,user_id,role) values($1,$2,'editor')",[f.org,other]);f.as(other);
 const own=await f.app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers});assert.equal(own.statusCode,200);assert.equal(own.json().canManage,false);assert.deepEqual(own.json().ownerConsent,{maskedPhone:null,kakao:false,push:false});assert.equal(own.body.includes('4321'),false);assert.equal((await f.app.inject({method:'POST',url,headers,payload:{kakao:false,sms:false,consentVersion:'notification-v1'}})).statusCode,404);
 f.as(f.owner);const withdrawn=await f.app.inject({method:'POST',url,headers,payload:{kakao:false,sms:false,consentVersion:'notification-v1'}});assert.equal(withdrawn.statusCode,200,withdrawn.body);assert.equal(withdrawn.json().recipientId,'withdrawn');
 const after=await f.app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers});assert.deepEqual(after.json().ownerConsent,{maskedPhone:null,kakao:false,push:false});assert.equal((await f.app.inject({method:'POST',url,headers,payload:{kakao:true,sms:false,consentVersion:'notification-v1'}})).statusCode,400);
 const pushUrl='/v1/owner/push-subscriptions',subscription={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',keys:{p256dh:randomBytes(65).toString('base64url'),auth:randomBytes(16).toString('base64url')}};
 const push=await f.app.inject({method:'POST',url:pushUrl,headers,payload:{push:true,subscription,consentVersion:'notification-v1'}});assert.equal(push.statusCode,200,push.body);assert.equal(push.json().providerState,'blocked_integration');
 const pushSettings=await f.app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers});assert.equal(pushSettings.json().ownerConsent.push,true);assert.equal(pushSettings.body.includes(subscription.endpoint),false);
 assert.equal((await f.app.inject({method:'POST',url:pushUrl,headers,payload:{push:false,consentVersion:'notification-v1'}})).statusCode,200);assert.equal((await f.pool.query("select count(*) from field.notification_recipients where push and revoked_at is null")).rows[0].count,'0');
 const resave=await f.app.inject({method:'POST',url,headers,payload:{phone:'01087654321',kakao:true,sms:false,consentVersion:'notification-v1'}});assert.equal(resave.statusCode,200);
 assert.equal((await f.app.inject({method:'POST',url:pushUrl,headers,payload:{push:true,subscription,consentVersion:'notification-v1'}})).statusCode,200);
 const noKey=Fastify();try{registerFieldDeliveryRoutes(noKey,{pool:f.pool,resolveUserId:async()=>f.owner,resolveSession:async()=>({id:f.owner,userId:f.owner})});assert.equal((await noKey.inject({method:'POST',url,headers:{...headers,origin:process.env.FIELD_PUBLIC_WEB_ORIGIN??'http://127.0.0.1:3002','sec-fetch-site':'same-origin'},payload:{kakao:false,sms:false,consentVersion:'notification-v1'}})).statusCode,200);assert.equal((await noKey.inject({method:'POST',url:pushUrl,headers:{...headers,origin:process.env.FIELD_PUBLIC_WEB_ORIGIN??'http://127.0.0.1:3002','sec-fetch-site':'same-origin'},payload:{push:false,consentVersion:'notification-v1'}})).statusCode,200);assert.equal((await noKey.inject({method:'POST',url,headers:{...headers,origin:'https://foreign.synthetic.example.com'},payload:{kakao:false,sms:false,consentVersion:'notification-v1'}})).statusCode,403);}finally{await noKey.close();}assert.equal(f.calls.length,0);
 }finally{await f.close();}});

test('Field integrated application registers delivery once with own runtime context',async()=>{const f=await fixture();let app:ReturnType<typeof Fastify>|undefined;try{
 const {createFieldApp}=await import('../src/app.js');app=createFieldApp(async()=>{},undefined,undefined,{pool:f.pool,resolveUserId:async()=>f.owner,resolveSession:async()=>({id:f.owner,userId:f.owner}),notification:f.notification});
 const response=await app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers:{'x-organization-id':f.org}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().providerState,'configured');assert.equal(response.json().canManage,true);
 }finally{await app?.close();await f.close();}});


test('Field owner settings recheck owner role after waiting for organization lock',async()=>{const f=await fixture();const demoter=await f.pool.connect();try{
 await demoter.query('begin');await demoter.query('select id from field.organizations where id=$1 for update',[f.org]);
 const pending=f.app.inject({method:'POST',url:'/v1/owner/notification-consent',headers:{'x-organization-id':f.org},payload:{phone:'01087654321',kakao:true,sms:false,consentVersion:'notification-v1'}});
 // Start the injection while the organization lock is held and observe the actual lock wait.
 const running=Promise.resolve(pending);let waited=false;for(let i=0;i<200;i++){const active=(await f.pool.query("select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like 'select id from field.organizations%' ")).rowCount;if(active){waited=true;break;}await new Promise(r=>setTimeout(r,5));}assert.equal(waited,true);
 await demoter.query("update field.memberships set role='editor' where organization_id=$1 and user_id=$2",[f.org,f.owner]);await demoter.query('commit');
 const result=await running;assert.equal(result.statusCode,404,result.body);assert.equal((await f.pool.query("select count(*) from field.notification_recipients where target_kind='owner'")).rows[0].count,'0');
 }finally{await demoter.query('rollback');demoter.release();await f.close();}});


test('Field customer channel read and keyless withdrawal use only the current receipt capability',async()=>{const f=await fixture();const noKey=Fastify();try{
 const url=`/v1/customer/notification-consents/inquiry/${f.inquiry}`,headers={authorization:`Bearer ${f.cap}`};
 const own=await f.app.inject({method:'GET',url,headers});assert.equal(own.statusCode,200,own.body);assert.equal(own.json().kakao,true);assert.equal(own.json().sms,true);assert.equal(own.json().phoneVerified,false);assert.equal(own.body.includes('01012345678'),false);assert.equal(own.body.includes(f.cap),false);
 assert.equal((await f.app.inject({method:'GET',url,headers:{authorization:'Bearer 01012345678'}})).statusCode,404);assert.equal((await f.app.inject({method:'GET',url})).statusCode,404);assert.equal((await f.app.inject({method:'POST',url,headers,payload:{kakao:false,sms:true,consentVersion:'notification-v1'}})).statusCode,400);
 registerFieldDeliveryRoutes(noKey,{pool:f.pool,resolveUserId:async()=>null});const actualHeaders={...headers,origin:process.env.FIELD_PUBLIC_WEB_ORIGIN??'http://127.0.0.1:3002','sec-fetch-site':'same-origin'};const withdrawn=await noKey.inject({method:'POST',url,headers:actualHeaders,payload:{kakao:false,sms:false,consentVersion:'notification-v1'}});assert.equal(withdrawn.statusCode,200,withdrawn.body);
 const settings=await noKey.inject({method:'GET',url,headers});assert.equal(settings.json().kakao,false);assert.equal(settings.json().sms,false);assert.equal(settings.json().providerState,'blocked_integration');
 await f.pool.query('update field.inquiries set visitor_key_hash=$2 where id=$1',[f.inquiry,createHash('sha256').update(randomBytes(32)).digest('hex')]);assert.equal((await f.app.inject({method:'GET',url,headers})).statusCode,404);assert.equal((await f.app.inject({method:'POST',url,headers,payload:{kakao:true,sms:false,consentVersion:'notification-v1'}})).statusCode,404);assert.equal(f.calls.length,0);
 }finally{await noKey.close();await f.close();}});

test('Field customer channel save rechecks rotated receipt after organization lock wait',async()=>{const f=await fixture();const rotator=await f.pool.connect();try{
 await rotator.query('begin');await rotator.query('select id from field.organizations where id=$1 for update',[f.org]);
 const running=Promise.resolve(f.app.inject({method:'POST',url:`/v1/customer/notification-consents/inquiry/${f.inquiry}`,headers:{authorization:`Bearer ${f.cap}`},payload:{kakao:true,sms:false,consentVersion:'notification-v1'}}));
 let waited=false;for(let i=0;i<200;i++){if((await f.pool.query("select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like 'select id from field.organizations%' ")).rowCount){waited=true;break;}await new Promise(r=>setTimeout(r,5));}assert.equal(waited,true);
 await rotator.query('update field.inquiries set visitor_key_hash=$2 where id=$1',[f.inquiry,createHash('sha256').update(randomBytes(32)).digest('hex')]);await rotator.query('commit');const result=await running;assert.equal(result.statusCode,404,result.body);assert.equal((await f.pool.query('select sms from field.notification_recipients where id=$1',[f.recipient])).rows[0].sms,true);
 }finally{await rotator.query('rollback');rotator.release();await f.close();}});


test('Field customer channel withdrawal preserves started unknown and never posts again',async()=>{const f=await fixture();try{
 await f.event();f.mode('lost');assert.equal(await f.run(),'unknown');f.remote(null);
 const url=`/v1/customer/notification-consents/inquiry/${f.inquiry}`,headers={authorization:`Bearer ${f.cap}`};
 assert.equal((await f.app.inject({method:'POST',url,headers,payload:{kakao:false,sms:false,consentVersion:'notification-v1'}})).statusCode,200);
 assert.equal((await f.app.inject({method:'GET',url,headers})).json().state,'withdrawn');
 await f.due();assert.equal(await f.run(),'unknown');assert.equal(f.calls.length,1);assert.equal((await f.row()).length,1);
 }finally{await f.close();}});

test('Field customer channel save rejects retention purge completed while waiting for organization lock',async()=>{const f=await fixture();const purge=await f.pool.connect();try{
 await purge.query('begin');await purge.query('select id from field.organizations where id=$1 for update',[f.org]);
 const url=`/v1/customer/notification-consents/inquiry/${f.inquiry}`,headers={authorization:`Bearer ${f.cap}`};
 const running=Promise.resolve(f.app.inject({method:'POST',url,headers,payload:{kakao:true,sms:false,consentVersion:'notification-v1'}}));
 let waited=false;for(let i=0;i<200;i++){if((await f.pool.query("select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like 'select id from field.organizations%' ")).rowCount){waited=true;break;}await new Promise(r=>setTimeout(r,5));}assert.equal(waited,true);
 const {removeRetainedPayload}=await import('../src/retention-purge.js');await removeRetainedPayload(purge,'inquiry',f.inquiry,new Date());await purge.query('commit');
 assert.equal((await running).statusCode,404);assert.equal((await f.app.inject({method:'GET',url,headers})).statusCode,404);
 const recipients=(await f.pool.query('select recipient_ciphertext,retention_purged_at from field.notification_recipients')).rows;assert.equal(recipients.length,1);assert.equal(recipients[0].recipient_ciphertext,null);assert.ok(recipients[0].retention_purged_at);assert.equal(f.calls.length,0);
 }finally{await purge.query('rollback');purge.release();await f.close();}});


test('Field customer channel reservation receipt is distinct and accepts only own published site or current verified custom origin',async()=>{const f=await fixture();try{
 const reservation=randomUUID(),cap=randomBytes(32).toString('base64url'),site=randomUUID(),slug=`field-${randomBytes(6).toString('hex')}`,catalog=randomUUID();
 await f.pool.query("insert into field.reservations(id,organization_id,catalog_revision,service_id,service_snapshot,booking_mode,customer_name,customer_phone,visitor_key_hash,preferred_time_text,timezone,state,consent_at,source) values($1,$2,1,$3,'{}','request','Synthetic','01012345678',$4,'합성 요청','Asia/Seoul','requested',now(),'public')",[reservation,f.org,randomUUID(),createHash('sha256').update(cap).digest('hex')]);
 await f.pool.query('insert into field.sites(id,organization_id,slug) values($1,$2,$3)',[site,f.org,slug]);
 await f.pool.query("insert into field.catalog_releases(id,organization_id,revision,content,content_hash,approved_by) values($1,$2,1,'{}','synthetic',$3)",[catalog,f.org,f.owner]);
 await f.pool.query("insert into field.site_releases(id,site_id,revision,content,content_hash,catalog_release_id,catalog_revision,published_by) values($1,$2,1,'{}','synthetic',$3,1,$4)",[randomUUID(),site,catalog,f.owner]);
 const domain=randomUUID(),host='own.synthetic.example.com';
 await f.pool.query("insert into field.site_domains(id,organization_id,site_id,hostname,request_key,created_by,ownership_token,hostname_claimed,state,ownership_state,dns_state,tls_state,binding_state,valid_until,certificate_expires_at) values($1,$2,$3,$4,$5,$6,$7,true,'connected','verified','verified','ready','ready',now()+interval '1 hour',now()+interval '2 hour')",[domain,f.org,site,host,randomUUID(),f.owner,randomBytes(32).toString('base64url')]);
 const url=`/v1/customer/notification-consents/reservation/${reservation}`,headers={authorization:`Bearer ${cap}`},payload={kakao:true,sms:true,consentVersion:'notification-v1'};
 assert.equal((await f.app.inject({method:'GET',url,headers:{authorization:`Bearer ${f.cap}`}})).statusCode,404);
 assert.equal((await f.app.inject({method:'GET',url,headers:{...headers,origin:'http://field-aaaaaaaaaaaa.localhost:3002'}})).statusCode,403);
 assert.equal((await f.app.inject({method:'POST',url,headers:{...headers,origin:`http://${slug}.localhost:3002`},payload})).statusCode,200);
 assert.equal((await f.app.inject({method:'GET',url,headers:{...headers,origin:`https://${host}`}})).json().sms,true);
 assert.equal((await f.app.inject({method:'POST',url,headers:{...headers,origin:`https://${host}`},payload:{...payload,kakao:false,sms:false}})).statusCode,200);
 assert.equal((await f.app.inject({method:'GET',url,headers:{...headers,origin:'https://foreign.synthetic.example.com'}})).statusCode,403);
 assert.equal((await f.app.inject({method:'POST',url,headers:{...headers,origin:`https://${host}`,'sec-fetch-site':'cross-site'},payload})).statusCode,403);
 await f.pool.query("update field.site_domains set valid_until=now()-interval '1 second' where id=$1",[domain]);
 assert.equal((await f.app.inject({method:'GET',url,headers:{...headers,origin:`https://${host}`}})).statusCode,403);
 assert.equal(f.calls.length,0);
 }finally{await f.close();}});


test('Field customer channel failed capability shares existing source receipt abuse limit',async()=>{const f=await fixture();try{
 const {registerFieldReceiptAbuseGuard}=await import('../src/receipt-abuse.js');registerFieldReceiptAbuseGuard(f.app,{pool:f.pool,resolveUserId:async()=>null});
 const url=`/v1/customer/notification-consents/inquiry/${f.inquiry}`,headers={authorization:`Bearer ${randomBytes(32).toString('base64url')}`};
 for(let i=0;i<5;i++)assert.equal((await f.app.inject({method:'GET',url,headers})).statusCode,404);
 assert.equal((await f.app.inject({method:'GET',url,headers})).statusCode,429);
 assert.equal((await f.app.inject({method:'GET',url:`/v1/inquiries/${f.inquiry}`,headers})).statusCode,429);
 await f.pool.query("update field.receipt_attempts set blocked_until=now()-interval '1 second'");
 assert.equal((await f.app.inject({method:'GET',url,headers:{authorization:`Bearer ${f.cap}`}})).statusCode,200);
 assert.equal((await f.pool.query('select count(*) from field.receipt_attempts')).rows[0].count,'0');assert.equal(f.calls.length,0);
 }finally{await f.close();}});
