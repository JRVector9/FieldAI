import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createWebPushNotificationProvider } from './notification-web-push.js';
import { createSolapiNotificationProvider, type NotificationProvider } from './notification-provider.js';
export type NotificationContext={key:Buffer;webOrigin:string;callbackSecret?:string;provider?:NotificationProvider;pushProvider?:NotificationProvider;pushPublicKey?:string};
export function sealNotification(value:string,key:Buffer,binding:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(`Field/notifications/v1/${binding}`));return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64url');}
export function unsealNotification(value:string,key:Buffer,binding:string){const bytes=Buffer.from(value,'base64url');if(bytes.length<29)throw Error('invalid_notification_ciphertext');const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAAD(Buffer.from(`Field/notifications/v1/${binding}`));cipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString('utf8');}
export function notificationContextFromEnvironment(env:Record<string,string|undefined>=process.env):NotificationContext|undefined{
  const key=env.FIELD_NOTIFICATION_CREDENTIAL_KEY;if(!key){if(Object.keys(env).some(k=>(k.startsWith('FIELD_SOLAPI_')||k.startsWith('FIELD_PUSH_'))&&env[k]))throw Error('incomplete_FIELD_notification_configuration');return undefined;}
  if(!/^[A-Za-z0-9_-]{43}$/.test(key)||Buffer.from(key,'base64url').length!==32)throw Error('invalid_FIELD_notification_key');
  const profile=env.FIELD_PROFILE;if(!['mock','sandbox','live'].includes(profile??'')||env.NODE_ENV==='production'&&profile!=='live')throw Error('invalid_FIELD_notification_profile');
  const origin=new URL(env.FIELD_PUBLIC_WEB_ORIGIN??'http://127.0.0.1:3002');if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||!['http:','https:'].includes(origin.protocol)||origin.protocol==='http:'&&!['localhost','127.0.0.1'].includes(origin.hostname)||profile==='live'&&origin.protocol!=='https:')throw Error('invalid_FIELD_notification_origin');
  const context:NotificationContext={key:Buffer.from(key,'base64url'),webOrigin:origin.origin};
  const names=['FIELD_SOLAPI_ACCOUNT_ID','FIELD_SOLAPI_API_KEY','FIELD_SOLAPI_API_SECRET','FIELD_SOLAPI_FROM','FIELD_SOLAPI_PF_ID','FIELD_SOLAPI_OWNER_TEMPLATE_ID','FIELD_SOLAPI_CUSTOMER_TEMPLATE_ID','FIELD_SOLAPI_CALLBACK_SECRET'];
  if(names.some(n=>env[n])){
    if(profile==='mock')throw Error('real_notification_provider_forbidden_in_mock');
    if(names.some(n=>!env[n])||env.FIELD_NOTIFICATION_PROVIDER_APPROVED!=='true'||!/^0\d{8,10}$/.test(env.FIELD_SOLAPI_FROM!)||env.FIELD_SOLAPI_CALLBACK_SECRET!.length<32)throw Error('incomplete_FIELD_notification_provider_approval');
    context.provider=createSolapiNotificationProvider({accountId:env.FIELD_SOLAPI_ACCOUNT_ID!,apiKey:env.FIELD_SOLAPI_API_KEY!,apiSecret:env.FIELD_SOLAPI_API_SECRET!,from:env.FIELD_SOLAPI_FROM!,pfId:env.FIELD_SOLAPI_PF_ID!,ownerTemplateId:env.FIELD_SOLAPI_OWNER_TEMPLATE_ID!,customerTemplateId:env.FIELD_SOLAPI_CUSTOMER_TEMPLATE_ID!});context.callbackSecret=env.FIELD_SOLAPI_CALLBACK_SECRET;
  }
  const pushNames=['FIELD_PUSH_VAPID_SUBJECT','FIELD_PUSH_VAPID_PUBLIC_KEY','FIELD_PUSH_VAPID_PRIVATE_KEY'];
  if(pushNames.some(n=>env[n])){
    if(profile==='mock')throw Error('real_push_provider_forbidden_in_mock');
    if(pushNames.some(n=>!env[n])||env.FIELD_PUSH_PROVIDER_APPROVED!=='true'||!/^mailto:[^@\s]+@[^@\s]+$/.test(env.FIELD_PUSH_VAPID_SUBJECT!)||Buffer.from(env.FIELD_PUSH_VAPID_PUBLIC_KEY!,'base64url').length!==65||Buffer.from(env.FIELD_PUSH_VAPID_PRIVATE_KEY!,'base64url').length!==32)throw Error('incomplete_FIELD_push_provider_approval');
    context.pushProvider=createWebPushNotificationProvider({subject:env.FIELD_PUSH_VAPID_SUBJECT!,publicKey:env.FIELD_PUSH_VAPID_PUBLIC_KEY!,privateKey:env.FIELD_PUSH_VAPID_PRIVATE_KEY!});context.pushPublicKey=env.FIELD_PUSH_VAPID_PUBLIC_KEY;
  }
  return context;
}
