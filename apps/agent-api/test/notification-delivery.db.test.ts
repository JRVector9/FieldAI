import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { before, after, test } from 'node:test';
import { Client, Pool } from 'pg';
import Fastify from 'fastify';
import { runNotificationDeliveryOnce } from '../src/notification-delivery-execution.js';
import { sealNotification, type NotificationContext } from '../src/notification-context.js';
import { registerAgentDeliveryRoutes } from '../src/notification-delivery-routes.js';
import type { NotificationSend, NotificationResult } from '../src/notification-provider.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
const original=process.env.AP_DATABASE_URL!, databases=new Set<string>();let admin:Client;
before(async()=>{const u=new URL(original);assert.ok(['localhost','127.0.0.1'].includes(u.hostname));assert.equal(u.port,'55431');assert.equal(u.username,'agent_local');assert.match(u.pathname,/^\/fieldai_agent_test_[a-f0-9]+$/);u.pathname='/postgres';admin=new Client({connectionString:u.toString()});await admin.connect();});
after(async()=>{for(const db of databases)await admin.query(`drop database "${db}" with(force)`);await admin.end();});
async function fixture(){
  const name=`fieldai_agent_test_${randomUUID().replaceAll('-','')}`,url=new URL(original);await admin.query(`create database "${name}"`);databases.add(name);url.pathname=`/${name}`;
  const migration=spawnSync(process.execPath,['tools/run-migrations.mjs','agent'],{cwd:resolve('../..'),env:{...process.env,AP_DATABASE_URL:url.toString()},stdio:'inherit'});assert.equal(migration.status,0);
  const pool=new Pool({connectionString:url.toString()}),org=randomUUID(),owner=randomUUID(),inquiry=randomUUID(),release=randomUUID(),recipient=randomUUID(),cap=randomBytes(32).toString('base64url');
  await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,true)',[owner,'Synthetic',`${owner}@example.invalid`]);
  await pool.query('insert into ap.organizations(id,owner_user_id,name) values($1,$2,$3)',[org,owner,'합성 알림 조직']);await pool.query("insert into ap.memberships(organization_id,user_id,role) values($1,$2,'owner')",[org,owner]);
  await pool.query("insert into ap.knowledge_releases(id,organization_id,revision,draft_revision,source_kind,content,content_hash,approved_by) values($1,$2,1,1,'native','{}','synthetic',$3)",[release,org,owner]);
  await pool.query("insert into ap.inquiries(id,organization_id,knowledge_release_id,knowledge_revision,customer_name,customer_phone,visitor_key_hash,state,consent_at) values($1,$2,$3,1,'Synthetic','01012345678',$4,'waiting_customer',now())",[inquiry,org,release,createHash('sha256').update(cap).digest('hex')]);
  const calls:NotificationSend[]=[],lookups:NotificationSend[]=[];let remote:NotificationResult|null=null,behavior:'sent'|'accepted'|'lost'|'failed'='sent',waiting:Promise<void>|undefined,resume:(()=>void)|undefined;
  const notification:NotificationContext={key:randomBytes(32),webOrigin:'http://localhost:3001',callbackSecret:'synthetic-secret',provider:{name:'solapi',accountId:'synthetic-account',keyFingerprint:'a'.repeat(64),
    async send(input){calls.push(input);const row=(await pool.query('select * from ap.notification_deliveries where id=$1',[input.deliveryId])).rows[0];assert.equal(row.state,'processing');assert.ok(row.started_at);assert.ok(row.claim_token);assert.equal(row.account_id,'synthetic-account');
      remote={deliveryId:input.deliveryId,providerId:`provider-${input.deliveryId}`,accountId:'synthetic-account',recipient:input.recipient,channel:input.channel,state:behavior==='failed'?'failed':behavior==='accepted'?'accepted':'sent',code:behavior==='failed'?'3104':'4000',allowFallback:behavior==='failed'};
      await waiting;if(behavior==='lost')throw Error('synthetic-lost');return remote;},async lookup(input){lookups.push(input);return remote;}}};
  await pool.query("insert into ap.notification_recipients(id,organization_id,target_kind,target_id,audience,recipient_ciphertext,kakao,sms,consent_version,consented_at) values($1,$2,'inquiry',$3,'customer',$4,true,true,'notification-v1',now()-interval '1 minute')",[recipient,org,inquiry,sealNotification('01012345678',notification.key,`recipient:${recipient}`)]);
  await pool.query('insert into ap.notification_limits(organization_id,daily_attempt_limit,approved_by) values($1,10,$2)',[org,owner]);
  const event=async()=>{const outbox=randomUUID(),message=randomUUID(),id=randomUUID();await pool.query("insert into ap.inquiry_messages(id,inquiry_id,sequence,actor,visibility,body,delivery_state) values($1,$2,(select coalesce(max(sequence),0)+1 from ap.inquiry_messages where inquiry_id=$2),'owner','customer','합성 답변','blocked_integration')",[message,inquiry]);await pool.query("insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload) values($1,$2,'ap.inquiry.owner_reply',$3,$4)",[outbox,org,inquiry,{inquiryId:inquiry,sourceMessageId:message}]);await pool.query("insert into ap.notification_events(id,organization_id,outbox_id,inquiry_id,source_message_id,audience,channel,state) values($1,$2,$3,$4,$5,'customer','kakao','blocked_integration')",[id,org,outbox,inquiry,message]);return id;};
  let actor:string|null=owner;const app=Fastify();registerAgentDeliveryRoutes(app,{pool,resolveUserId:async()=>actor,resolveSession:async()=>actor?{id:actor,userId:actor}:null},notification);
  return {pool,org,owner,inquiry,recipient,cap,notification,calls,lookups,app,event,run:(context:NotificationContext|undefined=notification)=>runNotificationDeliveryOnce({pool,notification:context}),
    row:async()=>(await pool.query('select * from ap.notification_deliveries order by created_at,id')).rows,
    due:()=>pool.query("update ap.notification_deliveries set next_attempt_at=now(),lease_expires_at=case when state='processing' then now()-interval '1 minute' else lease_expires_at end"),
    mode(v:typeof behavior){behavior=v;},remote(v:NotificationResult|null){remote=v;},as(v:string|null){actor=v;},hold(){waiting=new Promise(r=>{resume=r;});},release(){resume?.();},
    close:async()=>{resume?.();await app.close();await pool.end();await admin.query(`drop database "${name}"`);databases.delete(name);}};
}

test('AP persists before send, accounts once, and safely projects confirmed delivery',async()=>{const f=await fixture();try{await f.event();assert.equal(await f.run(),'sent');assert.equal(await f.run(),'empty');assert.equal(f.calls.length,1);const rows=await f.row();assert.equal(rows.length,1);assert.equal(rows[0].state,'sent');assert.equal(rows[0].reserved,true);assert.equal(JSON.stringify(rows).includes('01012345678'),false);assert.equal((await f.pool.query('select delivery_state from ap.inquiry_messages')).rows[0].delivery_state,'sent');await assert.rejects(f.pool.query("update ap.notification_deliveries set account_id='different'"),{code:'PAN01'});}finally{await f.close();}});
test('AP lost results and unknown absent lookup never resend or create fallback',async()=>{const f=await fixture();try{await f.event();f.mode('lost');assert.equal(await f.run(),'unknown');f.remote(null);await f.due();assert.equal(await f.run(),'unknown');assert.equal(f.calls.length,1);assert.equal((await f.row()).length,1);f.mode('sent');const first=f.calls[0]!;f.remote({deliveryId:first.deliveryId,providerId:'provider-original',accountId:'synthetic-account',recipient:first.recipient,channel:'kakao',state:'sent',code:'4000',allowFallback:false});await f.due();assert.equal(await f.run(),'sent');assert.equal(f.calls.length,1);assert.equal((await f.pool.query('select reserved from ap.notification_daily_usage')).rows[0].reserved,1);}finally{await f.close();}});
test('AP confirmed Kakao failure creates exactly one consented SMS fallback',async()=>{const f=await fixture();try{await f.event();f.mode('failed');assert.equal(await f.run(),'failed');f.mode('sent');assert.equal(await f.run(),'sent');assert.equal(await f.run(),'empty');assert.deepEqual(f.calls.map(c=>c.channel),['kakao','sms']);const rows=await f.row();assert.equal(rows.filter(r=>r.channel==='sms').length,1);assert.equal((await f.pool.query('select reserved from ap.notification_daily_usage')).rows[0].reserved,2);}finally{await f.close();}});
test('AP missing provider and cost cap preserve event without provider call',async()=>{const f=await fixture();try{await f.event();assert.equal(await f.run({...f.notification,provider:undefined}),'blocked_integration');assert.equal(f.calls.length,0);await f.pool.query('update ap.notification_limits set daily_attempt_limit=0');await f.due();assert.equal(await f.run(),'blocked_limit');assert.equal(f.calls.length,0);assert.equal((await f.pool.query('select count(*) from ap.notification_events')).rows[0].count,'1');}finally{await f.close();}});
test('AP consent withdrawal stops unstarted work but reconciles started unknown',async()=>{const f=await fixture();try{await f.event();f.mode('lost');await f.run();await f.pool.query('update ap.notification_recipients set revoked_at=now()');await f.due();assert.equal(await f.run(),'sent');assert.equal(f.calls.length,1);await f.event();assert.equal(await f.run(),'empty');}finally{await f.close();}});
test('AP concurrent worker claims and expired lease fence late responses',async()=>{const f=await fixture();try{await f.event();f.hold();const first=f.run();while(f.calls.length===0)await new Promise(r=>setTimeout(r,10));assert.equal(await f.run(),'empty');await f.due();assert.equal(await f.run(),'sent');f.release();assert.equal(await first,'superseded');assert.equal(f.calls.length,1);assert.equal((await f.row())[0].state,'sent');}finally{await f.close();}});
test('AP callback validates secret, deduplicates, and never trusts claimed failure',async()=>{const f=await fixture();try{await f.event();f.mode('accepted');await f.run();const input=f.calls[0]!,body=[{messageId:`provider-${input.deliveryId}`,statusCode:'3104',customFields:{deliveryId:input.deliveryId}}];const call=(secret:string)=>f.app.inject({method:'POST',url:'/integrations/v1/notifications/solapi',headers:{'x-solapi-secret':secret,'x-solapi-event-name':'SINGLE-REPORT'},payload:body});assert.equal((await call('bad')).statusCode,401);const secret=createHash('sha1').update('synthetic-secret').digest('hex');assert.equal((await call(secret)).statusCode,200);assert.equal((await call(secret)).statusCode,200);assert.equal((await f.pool.query('select count(*) from ap.notification_callbacks')).rows[0].count,'1');assert.equal(await f.run(),'accepted');assert.equal(f.calls.length,1);assert.equal((await f.row()).length,1);}finally{await f.close();}});
test('AP customer opt-in requires original capability and organization owner sees redacted history',async()=>{const f=await fixture();try{const url=`/v1/customer/notification-consents/inquiry/${f.inquiry}`;f.as(null);assert.equal((await f.app.inject({method:'POST',url,payload:{kakao:true,sms:true,consentVersion:'notification-v1'}})).statusCode,404);const wrong=await f.app.inject({method:'POST',url,headers:{authorization:`Bearer ${randomBytes(32).toString('base64url')}`},payload:{kakao:true,sms:true,consentVersion:'notification-v1'}});assert.equal(wrong.statusCode,404);const accepted=await f.app.inject({method:'POST',url,headers:{authorization:`Bearer ${f.cap}`},payload:{kakao:true,sms:false,consentVersion:'notification-v1'}});assert.equal(accepted.statusCode,200,accepted.body);f.as(f.owner);assert.equal((await f.app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers:{'x-organization-id':f.org}})).statusCode,200);f.as(randomUUID());assert.equal((await f.app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers:{'x-organization-id':f.org}})).statusCode,404);}finally{await f.close();}});

async function fieldRoute(f:Awaited<ReturnType<typeof fixture>>){
 const {createCipheriv,createHmac}=await import('node:crypto');const {registerFieldNotificationRouteClose}=await import('../src/field-notification-route-close.js');
 const tokenKey=randomBytes(32),secret=randomBytes(32),connection=randomUUID(),selection=randomUUID(),session=randomUUID(),client=randomUUID(),action=randomUUID(),reservation=randomUUID(),sourceEvent=randomUUID(),event=randomUUID(),outbox=randomUUID(),notification=randomUUID(),eventKey=randomUUID();
 await f.pool.query('insert into "session"(id,"expiresAt",token,"updatedAt","userId") values($1,now()+interval \'1 hour\',$2,now(),$3)',[session,randomUUID(),f.owner]);
 await f.pool.query('insert into "oauthClient"(id,"clientId","redirectUris") values($1,$1,\'[]\')',[client]);
 await f.pool.query("insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,agent_id,requested_scopes,selection_expires_at) values($1,$2,$3,$4,$5,$6,array['ap.conversations.read'],now()+interval '1 hour')",[selection,session,f.owner,client,f.org,randomUUID()]);
 const key=createHash('sha256').update(tokenKey).update('ap-field-event-route-v1').digest(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([iv,cipher.update(secret.toString('base64url'),'utf8'),cipher.final(),cipher.getAuthTag()]);
 await f.pool.query("insert into ap.field_connections(id,ap_grant_id,ap_organization_id,ap_agent_id,initiator_user_id,field_issuer,field_client_id,field_grant_id,field_organization_id,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status,event_key_id,event_secret_cipher,route_generation) values($1,$2,$3,$4,$5,'http://127.0.0.1:4321/api/auth','synthetic','synthetic','synthetic',array['field.requests.read'],$6,$6,now(),'revoked',$7,$8,1)",[connection,selection,f.org,randomUUID(),f.owner,Buffer.from('synthetic'),eventKey,encrypted]);
 await f.pool.query("insert into ap.field_action_requests(id,organization_id,inquiry_id,connection_id,submission_key_hash,input_hash,field_body_hash,field_request_body,kind,service_id,service_snapshot,consent_record_id,consent_confirmed_at,state,external_request_id,reservation_id) values($1,$2,$3,$4,$5,$5,$5,'{}','reservation_request',$6,'{}',$7,now(),'accepted_external',$8,$9)",[action,f.org,f.inquiry,connection,'a'.repeat(64),randomUUID(),randomUUID(),randomUUID(),reservation]);
 await f.pool.query("insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload) values($1,$2,'ap.field_reservation.event_recorded',$3,'{}')",[outbox,f.org,action]);
 await f.pool.query("insert into ap.field_reservation_events(id,organization_id,action_request_id,field_event_id,reservation_id,revision,event_type,state,occurred_at,route_generation,customer_notification_owner_product,outbox_id) values($1,$2,$3,$4,$5,0,'field.reservation.confirmed','confirmed',now(),1,'ap',$6)",[event,f.org,action,sourceEvent,reservation,outbox]);
 await f.pool.query("insert into ap.notification_events(id,organization_id,outbox_id,inquiry_id,field_reservation_event_id,audience,channel,state) values($1,$2,$3,$4,$5,'customer','kakao','blocked_integration')",[notification,f.org,outbox,f.inquiry,event]);
 registerFieldNotificationRouteClose(f.app,{pool:f.pool,resolveUserId:async()=>f.owner,fieldConnector:{issuer:'http://127.0.0.1:4321/api/auth',clientId:'synthetic',clientSecret:'synthetic',tokenKey,redirectUri:'http://localhost:3001/synthetic',webOrigin:'http://localhost:3001'}});
 const body={transferId:randomUUID(),connectionId:connection,actionRequestId:action,reservationId:reservation,latestRevision:0,latestEventId:sourceEvent,routeGeneration:2};
 return {notification,close(){const at=String(Math.floor(Date.now()/1000));return f.app.inject({method:'POST',url:'/integrations/v1/notification-routes/close',payload:body,headers:{'x-key-id':eventKey,'x-timestamp':at,'x-signature':createHmac('sha256',secret).update(`${at}.${body.transferId}.${connection}.${action}.${reservation}.0.${sourceEvent}.route-close`).digest('hex')}});}};
}
test('AP route close waits for started unknown and accepts reconciled delivery without duplicate send',async()=>{const f=await fixture();try{const route=await fieldRoute(f);f.mode('lost');assert.equal(await f.run(),'unknown');assert.equal((await route.close()).statusCode,409);await f.due();assert.equal(await f.run(),'sent');const closed=await route.close();assert.equal(closed.statusCode,200,closed.body);assert.equal(f.calls.length,1);}finally{await f.close();}});
test('AP route close and late unstarted delivery serialize to suppress old route',async()=>{const f=await fixture();try{const route=await fieldRoute(f);assert.equal(await f.run({...f.notification,provider:undefined}),'blocked_integration');assert.equal((await route.close()).statusCode,200);await f.due();assert.equal(await f.run(),'suppressed');assert.equal(f.calls.length,0);}finally{await f.close();}});

test('AP native retention clears new customer recipient copies and preserves delivery evidence',async()=>{const f=await fixture();try{await f.event();await f.run();const {removeRetainedPayload}=await import('../src/retention-purge.js');const db=await f.pool.connect();try{await db.query('begin');await removeRetainedPayload(db,'inquiry',f.inquiry,new Date());await db.query('commit');}catch(e){await db.query('rollback');throw e;}finally{db.release();}assert.equal((await f.pool.query('select recipient_ciphertext from ap.notification_recipients')).rows[0].recipient_ciphertext,null);assert.equal((await f.row())[0].recipient_ciphertext,null);assert.equal((await f.row())[0].state,'sent');assert.equal(await f.run(),'empty');}finally{await f.close();}});
test('AP started unknown delivery holds native retention until same-attempt reconciliation',async()=>{const f=await fixture();try{await f.event();f.mode('lost');await f.run();const {removeRetainedPayload}=await import('../src/retention-purge.js');const db=await f.pool.connect();try{await db.query('begin');await assert.rejects(removeRetainedPayload(db,'inquiry',f.inquiry,new Date()),{code:'PAN02'});await db.query('rollback');}finally{db.release();}assert.equal((await f.row())[0].state,'unknown');await f.due();assert.equal(await f.run(),'sent');assert.equal(f.calls.length,1);}finally{await f.close();}});

test('AP explicit cost approval requires a current owner session',async()=>{const f=await fixture();const app=Fastify();try{registerAgentDeliveryRoutes(app,{pool:f.pool,resolveUserId:async()=>f.owner,resolveSession:async()=>null},f.notification);const response=await app.inject({method:'PUT',url:'/v1/owner/notification-limit',headers:{'x-organization-id':f.org},payload:{dailyAttemptLimit:100,costLimitAccepted:true}});assert.equal(response.statusCode,401);assert.equal((await f.pool.query('select daily_attempt_limit from ap.notification_limits')).rows[0].daily_attempt_limit,10);}finally{await app.close();await f.close();}});


test('AP owner settings expose only self masked consent and withdraw without phone reentry',async()=>{const f=await fixture();try{
 const headers={'x-organization-id':f.org},url='/v1/owner/notification-consent';
 const save=await f.app.inject({method:'POST',url,headers,payload:{phone:'01087654321',kakao:true,sms:false,consentVersion:'notification-v1'}});assert.equal(save.statusCode,200,save.body);
 const settings=await f.app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers});assert.equal(settings.statusCode,200);assert.equal(settings.json().canManage,true);assert.deepEqual(settings.json().ownerConsent,{maskedPhone:'010-****-4321',kakao:true,push:false});assert.equal(settings.body.includes('01087654321'),false);
 const same=await f.app.inject({method:'POST',url,headers,payload:{kakao:true,sms:false,consentVersion:'notification-v1'}});assert.equal(same.statusCode,200,same.body);assert.equal(same.json().recipientId,save.json().recipientId);
 const other=randomUUID();await f.pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,true)',[other,'Synthetic',`${other}@example.invalid`]);await f.pool.query("insert into ap.memberships(organization_id,user_id,role) values($1,$2,'editor')",[f.org,other]);f.as(other);
 const own=await f.app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers});assert.equal(own.statusCode,200);assert.equal(own.json().canManage,false);assert.deepEqual(own.json().ownerConsent,{maskedPhone:null,kakao:false,push:false});assert.equal(own.body.includes('4321'),false);assert.equal((await f.app.inject({method:'POST',url,headers,payload:{kakao:false,sms:false,consentVersion:'notification-v1'}})).statusCode,404);
 f.as(f.owner);const withdrawn=await f.app.inject({method:'POST',url,headers,payload:{kakao:false,sms:false,consentVersion:'notification-v1'}});assert.equal(withdrawn.statusCode,200,withdrawn.body);assert.equal(withdrawn.json().recipientId,'withdrawn');
 const after=await f.app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers});assert.deepEqual(after.json().ownerConsent,{maskedPhone:null,kakao:false,push:false});assert.equal((await f.app.inject({method:'POST',url,headers,payload:{kakao:true,sms:false,consentVersion:'notification-v1'}})).statusCode,400);
 const pushUrl='/v1/owner/push-subscriptions',subscription={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',keys:{p256dh:randomBytes(65).toString('base64url'),auth:randomBytes(16).toString('base64url')}};
 const push=await f.app.inject({method:'POST',url:pushUrl,headers,payload:{push:true,subscription,consentVersion:'notification-v1'}});assert.equal(push.statusCode,200,push.body);assert.equal(push.json().providerState,'blocked_integration');
 const pushSettings=await f.app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers});assert.equal(pushSettings.json().ownerConsent.push,true);assert.equal(pushSettings.body.includes(subscription.endpoint),false);
 assert.equal((await f.app.inject({method:'POST',url:pushUrl,headers,payload:{push:false,consentVersion:'notification-v1'}})).statusCode,200);assert.equal((await f.pool.query("select count(*) from ap.notification_recipients where push and revoked_at is null")).rows[0].count,'0');
 const resave=await f.app.inject({method:'POST',url,headers,payload:{phone:'01087654321',kakao:true,sms:false,consentVersion:'notification-v1'}});assert.equal(resave.statusCode,200);
 assert.equal((await f.app.inject({method:'POST',url:pushUrl,headers,payload:{push:true,subscription,consentVersion:'notification-v1'}})).statusCode,200);
 const noKey=Fastify();try{registerAgentDeliveryRoutes(noKey,{pool:f.pool,resolveUserId:async()=>f.owner,resolveSession:async()=>({id:f.owner,userId:f.owner})});assert.equal((await noKey.inject({method:'POST',url,headers:{...headers,origin:process.env.AP_PUBLIC_WEB_ORIGIN??'http://localhost:3001','sec-fetch-site':'same-origin'},payload:{kakao:false,sms:false,consentVersion:'notification-v1'}})).statusCode,200);assert.equal((await noKey.inject({method:'POST',url:pushUrl,headers:{...headers,origin:process.env.AP_PUBLIC_WEB_ORIGIN??'http://localhost:3001','sec-fetch-site':'same-origin'},payload:{push:false,consentVersion:'notification-v1'}})).statusCode,200);assert.equal((await noKey.inject({method:'POST',url,headers:{...headers,origin:'https://foreign.synthetic.example.com'},payload:{kakao:false,sms:false,consentVersion:'notification-v1'}})).statusCode,403);}finally{await noKey.close();}assert.equal(f.calls.length,0);
 }finally{await f.close();}});

test('AP integrated application registers delivery once with own runtime context',async()=>{const f=await fixture();let app:ReturnType<typeof Fastify>|undefined;try{
 const {createAgentApp}=await import('../src/app.js');app=createAgentApp(async()=>{},undefined,undefined,undefined,{pool:f.pool,resolveUserId:async()=>f.owner,resolveSession:async()=>({id:f.owner,userId:f.owner}),notification:f.notification});
 const response=await app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers:{'x-organization-id':f.org}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().providerState,'configured');assert.equal(response.json().canManage,true);
 }finally{await app?.close();await f.close();}});


test('AP owner settings recheck owner role after waiting for organization lock',async()=>{const f=await fixture();const demoter=await f.pool.connect();try{
 await demoter.query('begin');await demoter.query('select id from ap.organizations where id=$1 for update',[f.org]);
 const pending=f.app.inject({method:'POST',url:'/v1/owner/notification-consent',headers:{'x-organization-id':f.org},payload:{phone:'01087654321',kakao:true,sms:false,consentVersion:'notification-v1'}});
 // Start the injection while the organization lock is held and observe the actual lock wait.
 const running=Promise.resolve(pending);let waited=false;for(let i=0;i<200;i++){const active=(await f.pool.query("select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like 'select id from ap.organizations%' ")).rowCount;if(active){waited=true;break;}await new Promise(r=>setTimeout(r,5));}assert.equal(waited,true);
 await demoter.query("update ap.memberships set role='editor' where organization_id=$1 and user_id=$2",[f.org,f.owner]);await demoter.query('commit');
 const result=await running;assert.equal(result.statusCode,404,result.body);assert.equal((await f.pool.query("select count(*) from ap.notification_recipients where target_kind='owner'")).rows[0].count,'0');
 }finally{await demoter.query('rollback');demoter.release();await f.close();}});


test('AP customer channel read and keyless withdrawal use only the current receipt capability',async()=>{const f=await fixture();const noKey=Fastify();try{
 const url=`/v1/customer/notification-consents/inquiry/${f.inquiry}`,headers={authorization:`Bearer ${f.cap}`};
 const own=await f.app.inject({method:'GET',url,headers});assert.equal(own.statusCode,200,own.body);assert.equal(own.json().kakao,true);assert.equal(own.json().sms,true);assert.equal(own.json().phoneVerified,false);assert.equal(own.body.includes('01012345678'),false);assert.equal(own.body.includes(f.cap),false);
 assert.equal((await f.app.inject({method:'GET',url,headers:{authorization:'Bearer 01012345678'}})).statusCode,404);assert.equal((await f.app.inject({method:'GET',url})).statusCode,404);assert.equal((await f.app.inject({method:'POST',url,headers,payload:{kakao:false,sms:true,consentVersion:'notification-v1'}})).statusCode,400);
 registerAgentDeliveryRoutes(noKey,{pool:f.pool,resolveUserId:async()=>null});const actualHeaders={...headers,origin:process.env.AP_PUBLIC_WEB_ORIGIN??'http://localhost:3001','sec-fetch-site':'same-origin'};const withdrawn=await noKey.inject({method:'POST',url,headers:actualHeaders,payload:{kakao:false,sms:false,consentVersion:'notification-v1'}});assert.equal(withdrawn.statusCode,200,withdrawn.body);
 const settings=await noKey.inject({method:'GET',url,headers});assert.equal(settings.json().kakao,false);assert.equal(settings.json().sms,false);assert.equal(settings.json().providerState,'blocked_integration');
 await f.pool.query('update ap.inquiries set visitor_key_hash=$2 where id=$1',[f.inquiry,createHash('sha256').update(randomBytes(32)).digest('hex')]);assert.equal((await f.app.inject({method:'GET',url,headers})).statusCode,404);assert.equal((await f.app.inject({method:'POST',url,headers,payload:{kakao:true,sms:false,consentVersion:'notification-v1'}})).statusCode,404);assert.equal(f.calls.length,0);
 }finally{await noKey.close();await f.close();}});

test('AP customer channel save rechecks rotated receipt after organization lock wait',async()=>{const f=await fixture();const rotator=await f.pool.connect();try{
 await rotator.query('begin');await rotator.query('select id from ap.organizations where id=$1 for update',[f.org]);
 const running=Promise.resolve(f.app.inject({method:'POST',url:`/v1/customer/notification-consents/inquiry/${f.inquiry}`,headers:{authorization:`Bearer ${f.cap}`},payload:{kakao:true,sms:false,consentVersion:'notification-v1'}}));
 let waited=false;for(let i=0;i<200;i++){if((await f.pool.query("select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like 'select id from ap.organizations%' ")).rowCount){waited=true;break;}await new Promise(r=>setTimeout(r,5));}assert.equal(waited,true);
 await rotator.query('update ap.inquiries set visitor_key_hash=$2 where id=$1',[f.inquiry,createHash('sha256').update(randomBytes(32)).digest('hex')]);await rotator.query('commit');const result=await running;assert.equal(result.statusCode,404,result.body);assert.equal((await f.pool.query('select sms from ap.notification_recipients where id=$1',[f.recipient])).rows[0].sms,true);
 }finally{await rotator.query('rollback');rotator.release();await f.close();}});


test('AP customer channel withdrawal preserves started unknown and never posts again',async()=>{const f=await fixture();try{
 await f.event();f.mode('lost');assert.equal(await f.run(),'unknown');f.remote(null);
 const url=`/v1/customer/notification-consents/inquiry/${f.inquiry}`,headers={authorization:`Bearer ${f.cap}`};
 assert.equal((await f.app.inject({method:'POST',url,headers,payload:{kakao:false,sms:false,consentVersion:'notification-v1'}})).statusCode,200);
 assert.equal((await f.app.inject({method:'GET',url,headers})).json().state,'withdrawn');
 await f.due();assert.equal(await f.run(),'unknown');assert.equal(f.calls.length,1);assert.equal((await f.row()).length,1);
 }finally{await f.close();}});

test('AP customer channel save rejects retention purge completed while waiting for organization lock',async()=>{const f=await fixture();const purge=await f.pool.connect();try{
 await purge.query('begin');await purge.query('select id from ap.organizations where id=$1 for update',[f.org]);
 const url=`/v1/customer/notification-consents/inquiry/${f.inquiry}`,headers={authorization:`Bearer ${f.cap}`};
 const running=Promise.resolve(f.app.inject({method:'POST',url,headers,payload:{kakao:true,sms:false,consentVersion:'notification-v1'}}));
 let waited=false;for(let i=0;i<200;i++){if((await f.pool.query("select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like 'select id from ap.organizations%' ")).rowCount){waited=true;break;}await new Promise(r=>setTimeout(r,5));}assert.equal(waited,true);
 const {removeRetainedPayload}=await import('../src/retention-purge.js');await removeRetainedPayload(purge,'inquiry',f.inquiry,new Date());await purge.query('commit');
 assert.equal((await running).statusCode,404);assert.equal((await f.app.inject({method:'GET',url,headers})).statusCode,404);
 const recipients=(await f.pool.query('select recipient_ciphertext,retention_purged_at from ap.notification_recipients')).rows;assert.equal(recipients.length,1);assert.equal(recipients[0].recipient_ciphertext,null);assert.ok(recipients[0].retention_purged_at);assert.equal(f.calls.length,0);
 }finally{await purge.query('rollback');purge.release();await f.close();}});


test('AP customer channel failed capability shares existing source receipt abuse limit',async()=>{const f=await fixture();try{
 const {registerAgentReceiptAbuseGuard}=await import('../src/receipt-abuse.js');registerAgentReceiptAbuseGuard(f.app,{pool:f.pool,resolveUserId:async()=>null});
 const url=`/v1/customer/notification-consents/inquiry/${f.inquiry}`,headers={authorization:`Bearer ${randomBytes(32).toString('base64url')}`};
 for(let i=0;i<5;i++)assert.equal((await f.app.inject({method:'GET',url,headers})).statusCode,404);
 assert.equal((await f.app.inject({method:'GET',url,headers})).statusCode,429);
 assert.equal((await f.app.inject({method:'GET',url:`/v1/inquiries/${f.inquiry}`,headers})).statusCode,429);
 await f.pool.query("update ap.receipt_attempts set blocked_until=now()-interval '1 second'");
 assert.equal((await f.app.inject({method:'GET',url,headers:{authorization:`Bearer ${f.cap}`}})).statusCode,200);
 assert.equal((await f.pool.query('select count(*) from ap.receipt_attempts')).rows[0].count,'0');assert.equal(f.calls.length,0);
 }finally{await f.close();}});

test('AP prepare is not starved by ineligible backlog and terminally marks undeliverable recipients',async()=>{const f=await fixture();try{
 // spam(not_applicable) 이벤트 100건이 가장 오래된 자리를 차지해도 새 알림 준비가 막히지 않아야 한다
 await f.pool.query(`with o as (insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload) select gen_random_uuid(),$1,'ap.inquiry.owner_reply',$2,'{}'::jsonb from generate_series(1,100) returning id)
  insert into ap.notification_events(id,organization_id,outbox_id,inquiry_id,audience,channel,state,suppression_reason,created_at) select gen_random_uuid(),$1,o.id,$3,'customer','kakao','not_applicable','spam',now() from o`,[f.org,f.inquiry,f.inquiry]);
 // 하이픈으로 입력된 문의 번호는 숫자로 정규화해 비교하고, 동의 번호가 다른 문의는 종결 표시한다
 const extra=async(phone:string,consented:string)=>{const inquiry=randomUUID(),recipient=randomUUID(),outbox=randomUUID(),id=randomUUID();
  await f.pool.query("insert into ap.inquiries(id,organization_id,knowledge_release_id,knowledge_revision,customer_name,customer_phone,visitor_key_hash,state,consent_at) select $1,organization_id,knowledge_release_id,1,'Synthetic',$2,$3,'waiting_customer',now() from ap.inquiries where id=$4",[inquiry,phone,randomBytes(32).toString('hex'),f.inquiry]);
  await f.pool.query("insert into ap.notification_recipients(id,organization_id,target_kind,target_id,audience,recipient_ciphertext,kakao,sms,consent_version,consented_at) values($1,$2,'inquiry',$3,'customer',$4,true,false,'notification-v1',now()-interval '2 hours')",[recipient,f.org,inquiry,sealNotification(consented,f.notification.key,`recipient:${recipient}`)]);
  await f.pool.query("insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload) values($1,$2,'ap.inquiry.owner_reply',$3,'{}')",[outbox,f.org,inquiry]);
  await f.pool.query("insert into ap.notification_events(id,organization_id,outbox_id,inquiry_id,audience,channel,state,created_at) values($1,$2,$3,$4,'customer','kakao','blocked_integration',now()-interval '30 minutes')",[id,f.org,outbox,inquiry]);return id;};
 const hyphen=await extra('010-2222-3333','01022223333'),mismatch=await extra('010-4444-5555','01066667777');
 const fresh=await f.event();
 assert.equal(await f.run(),'sent');assert.equal(await f.run(),'sent');assert.equal(await f.run(),'empty');
 const rows=(await f.pool.query('select notification_id,state,error_code from ap.notification_deliveries')).rows;
 assert.equal(rows.length,3);
 assert.equal(rows.find(r=>r.notification_id===hyphen)?.state,'sent');assert.equal(rows.find(r=>r.notification_id===fresh)?.state,'sent');
 assert.deepEqual(rows.find(r=>r.notification_id===mismatch),{notification_id:mismatch,state:'suppressed',error_code:'recipient_phone_invalid'});
 assert.deepEqual(f.calls.map(c=>c.recipient).sort(),['01012345678','01022223333']);
 }finally{await f.close();}});

test('AP notification consent stores digits only and rejects non-mobile numbers',async()=>{const f=await fixture();try{
 const owner=await f.app.inject({method:'POST',url:'/v1/owner/notification-consent',headers:{'x-organization-id':f.org},payload:{phone:'010-8765-4321',kakao:true,sms:false,consentVersion:'notification-v1'}});
 assert.equal(owner.statusCode,200,owner.body);
 assert.equal((await f.app.inject({method:'POST',url:'/v1/owner/notification-consent',headers:{'x-organization-id':f.org},payload:{phone:'02-123-4567',kakao:true,sms:false,consentVersion:'notification-v1'}})).statusCode,400);
 const settings=await f.app.inject({method:'GET',url:'/v1/owner/notification-deliveries',headers:{'x-organization-id':f.org}});
 assert.equal(settings.json().ownerConsent.maskedPhone,'010-****-4321');
 const url=`/v1/customer/notification-consents/inquiry/${f.inquiry}`,headers={authorization:`Bearer ${f.cap}`};f.as(null);
 await f.pool.query("update ap.inquiries set customer_phone='010-1234-5678' where id=$1",[f.inquiry]);
 const hyphen=await f.app.inject({method:'POST',url,headers,payload:{kakao:true,sms:false,consentVersion:'notification-v1'}});assert.equal(hyphen.statusCode,200,hyphen.body);
 const {unsealNotification}=await import('../src/notification-context.js');
 const stored=(await f.pool.query("select id,recipient_ciphertext from ap.notification_recipients where target_kind='inquiry' and revoked_at is null")).rows[0];
 assert.equal(unsealNotification(stored.recipient_ciphertext,f.notification.key,`recipient:${stored.id}`),'01012345678');
 await f.pool.query("update ap.inquiries set customer_phone='02-123-4567' where id=$1",[f.inquiry]);
 const landline=await f.app.inject({method:'POST',url,headers,payload:{kakao:true,sms:false,consentVersion:'notification-v1'}});
 assert.equal(landline.statusCode,400);assert.equal(landline.json().error,'notification_phone_invalid');
 }finally{await f.close();}});

test('AP web push result unknown is final because the provider has no lookup',async()=>{const f=await fixture();try{
 await f.pool.query('update ap.notification_recipients set revoked_at=now()');
 const recipient=randomUUID(),outbox=randomUUID();
 await f.pool.query("insert into ap.notification_recipients(id,organization_id,target_kind,target_id,audience,actor_user_id,recipient_ciphertext,push,consent_version,consented_at) values($1,$2,'owner',$3,'owner',$3,$4,true,'notification-v1',now()-interval '1 minute')",[recipient,f.org,f.owner,sealNotification('{"synthetic":true}',f.notification.key,`recipient:${recipient}`)]);
 await f.pool.query("insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload) values($1,$2,'ap.inquiry.created',$3,'{}')",[outbox,f.org,f.inquiry]);
 await f.pool.query("insert into ap.notification_events(id,organization_id,outbox_id,inquiry_id,audience,channel,state) values($1,$2,$3,$4,'owner','in_app','available')",[randomUUID(),f.org,outbox,f.inquiry]);
 let sends=0,lookups=0;
 const context:NotificationContext={...f.notification,pushProvider:{name:'web_push',accountId:'synthetic-push',keyFingerprint:'b'.repeat(64),async send(){sends++;throw Error('synthetic-push-lost');},async lookup(){lookups++;return null;}}};
 assert.equal(await f.run(context),'unknown');
 await f.due();
 // 조회 수단이 없는 결과 미상 행은 1분마다 다시 claim되지 않는다
 assert.equal(await f.run(context),'empty');assert.equal(sends,1);assert.equal(lookups,0);
 assert.equal((await f.row())[0].state,'unknown');
 }finally{await f.close();}});
