import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createWebPushNotificationProvider } from './notification-web-push.js';
import { createSolapiNotificationProvider, type NotificationProvider } from './notification-provider.js';
export type NotificationContext={key:Buffer;webOrigin:string;callbackSecret?:string;provider?:NotificationProvider;pushProvider?:NotificationProvider;pushPublicKey?:string};
export function sealNotification(value:string,key:Buffer,binding:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(`AP/notifications/v1/${binding}`));return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64url');}
export function unsealNotification(value:string,key:Buffer,binding:string){const bytes=Buffer.from(value,'base64url');if(bytes.length<29)throw Error('invalid_notification_ciphertext');const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAAD(Buffer.from(`AP/notifications/v1/${binding}`));cipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString('utf8');}
// 휴대전화 번호는 구분 기호(공백·하이픈·괄호)를 제거한 숫자만 저장·비교한다. 휴대전화 형식이 아니면 null
export function normalizeMobilePhone(value:string){const digits=value.replace(/[\s()-]/g,'');return /^01[016789]\d{7,8}$/.test(digits)?digits:null;}
export function notificationContextFromEnvironment(env:Record<string,string|undefined>=process.env):NotificationContext|undefined{
  const key=env.AP_NOTIFICATION_CREDENTIAL_KEY;if(!key){if(Object.keys(env).some(k=>(k.startsWith('AP_SOLAPI_')||k.startsWith('AP_PUSH_'))&&env[k]))throw Error('incomplete_AP_notification_configuration');return undefined;}
  if(!/^[A-Za-z0-9_-]{43}$/.test(key)||Buffer.from(key,'base64url').length!==32)throw Error('invalid_AP_notification_key');
  const profile=env.AP_PROFILE;if(!['mock','sandbox','live'].includes(profile??'')||env.NODE_ENV==='production'&&profile!=='live')throw Error('invalid_AP_notification_profile');
  const origin=new URL(env.AP_PUBLIC_WEB_ORIGIN??'http://localhost:3001');if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||!['http:','https:'].includes(origin.protocol)||origin.protocol==='http:'&&!['localhost','127.0.0.1'].includes(origin.hostname)||profile==='live'&&origin.protocol!=='https:')throw Error('invalid_AP_notification_origin');
  const context:NotificationContext={key:Buffer.from(key,'base64url'),webOrigin:origin.origin};
  const names=['AP_SOLAPI_ACCOUNT_ID','AP_SOLAPI_API_KEY','AP_SOLAPI_API_SECRET','AP_SOLAPI_FROM','AP_SOLAPI_PF_ID','AP_SOLAPI_OWNER_TEMPLATE_ID','AP_SOLAPI_CUSTOMER_TEMPLATE_ID','AP_SOLAPI_CALLBACK_SECRET'];
  if(names.some(n=>env[n])){
    if(profile==='mock')throw Error('real_notification_provider_forbidden_in_mock');
    if(names.some(n=>!env[n])||env.AP_NOTIFICATION_PROVIDER_APPROVED!=='true'||!/^0\d{8,10}$/.test(env.AP_SOLAPI_FROM!)||env.AP_SOLAPI_CALLBACK_SECRET!.length<32)throw Error('incomplete_AP_notification_provider_approval');
    context.provider=createSolapiNotificationProvider({accountId:env.AP_SOLAPI_ACCOUNT_ID!,apiKey:env.AP_SOLAPI_API_KEY!,apiSecret:env.AP_SOLAPI_API_SECRET!,from:env.AP_SOLAPI_FROM!,pfId:env.AP_SOLAPI_PF_ID!,ownerTemplateId:env.AP_SOLAPI_OWNER_TEMPLATE_ID!,customerTemplateId:env.AP_SOLAPI_CUSTOMER_TEMPLATE_ID!});context.callbackSecret=env.AP_SOLAPI_CALLBACK_SECRET;
  }
  const pushNames=['AP_PUSH_VAPID_SUBJECT','AP_PUSH_VAPID_PUBLIC_KEY','AP_PUSH_VAPID_PRIVATE_KEY'];
  if(pushNames.some(n=>env[n])){
    if(profile==='mock')throw Error('real_push_provider_forbidden_in_mock');
    if(pushNames.some(n=>!env[n])||env.AP_PUSH_PROVIDER_APPROVED!=='true'||!/^mailto:[^@\s]+@[^@\s]+$/.test(env.AP_PUSH_VAPID_SUBJECT!)||Buffer.from(env.AP_PUSH_VAPID_PUBLIC_KEY!,'base64url').length!==65||Buffer.from(env.AP_PUSH_VAPID_PRIVATE_KEY!,'base64url').length!==32)throw Error('incomplete_AP_push_provider_approval');
    context.pushProvider=createWebPushNotificationProvider({subject:env.AP_PUSH_VAPID_SUBJECT!,publicKey:env.AP_PUSH_VAPID_PUBLIC_KEY!,privateKey:env.AP_PUSH_VAPID_PRIVATE_KEY!});context.pushPublicKey=env.AP_PUSH_VAPID_PUBLIC_KEY;
  }
  return context;
}
