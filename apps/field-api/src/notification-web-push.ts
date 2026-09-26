import { createHash } from 'node:crypto';
import webpush from 'web-push';
import type { NotificationProvider, NotificationResult, NotificationSend } from './notification-provider.js';
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
export function validPushSubscription(value:unknown):{endpoint:string;keys:{p256dh:string;auth:string}}|null{
 const body=object(value),keys=object(body?.keys);if(typeof body?.endpoint!=='string'||body.endpoint.length>2000||typeof keys?.p256dh!=='string'||typeof keys.auth!=='string')return null;
 let url:URL;try{url=new URL(body.endpoint);}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||url.hash
   ||!['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(url.hostname)
   ||Buffer.from(keys.p256dh,'base64url').length!==65||Buffer.from(keys.auth,'base64url').length!==16)return null;
 return {endpoint:url.toString(),keys:{p256dh:keys.p256dh,auth:keys.auth}};
}
export function createWebPushNotificationProvider(config:{subject:string;publicKey:string;privateKey:string},send:typeof webpush.sendNotification=webpush.sendNotification):NotificationProvider{
 const accountId=createHash('sha256').update(config.publicKey).digest('hex'),keyFingerprint=createHash('sha256').update(config.privateKey).digest('hex');
 const result=(i:NotificationSend,state:'accepted'|'failed',code:string):NotificationResult=>({deliveryId:i.deliveryId,providerId:i.deliveryId,accountId,recipient:i.recipient,channel:'web_push',state,code,allowFallback:false});
 return {name:'web_push',accountId,keyFingerprint,async send(input){
   const subscription=validPushSubscription(JSON.parse(input.recipient));if(!subscription)throw Error('invalid_push_subscription');
   try{const response=await send(subscription,JSON.stringify({title:'새 처리 업무',body:'관리실에서 확인해 주세요.',tag:input.deliveryId}),{vapidDetails:config,TTL:300,timeout:65000});if(response.statusCode!==201&&response.statusCode!==202)throw Error('notification_result_unknown');return result(input,'accepted',String(response.statusCode));}
   catch(error){const code=object(error)?.statusCode;if(code===404||code===410)return result(input,'failed',String(code));throw Error('notification_result_unknown');}
 },async lookup(){return null;}};
}
