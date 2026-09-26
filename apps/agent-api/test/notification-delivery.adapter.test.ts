import assert from 'node:assert/strict';
import { test } from 'node:test';

test('AP delivery has a real optional SOLAPI port with no mock success fallback', async () => {
  const module = await import('../src/notification-provider.js').catch(() => null);
  assert.equal(typeof module?.createSolapiNotificationProvider, 'function');
  const calls: { url: string; body?: unknown }[] = [];
  const provider = module!.createSolapiNotificationProvider({ accountId:'synthetic-account',apiKey:'synthetic-key',apiSecret:'synthetic-secret',from:'0212345678',pfId:'synthetic-pf',ownerTemplateId:'synthetic-owner',customerTemplateId:'synthetic-customer' },async (input,init) => {
    const body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({url:String(input),body});
    assert.match(String((init?.headers as Record<string,string>).Authorization),/^HMAC-SHA256 /);
    return new Response(JSON.stringify({groupInfo:{accountId:'synthetic-account'},messageList:[{messageId:'synthetic-message',customFields:{deliveryId:'synthetic-delivery'},statusCode:'2000'}],failedMessageList:[]}),{status:200});
  });
  const result=await provider.send({deliveryId:'synthetic-delivery',channel:'kakao',audience:'customer',recipient:'01012345678',startedAt:new Date().toISOString()});
  assert.equal(result.state,'accepted');assert.equal(result.providerId,'synthetic-message');
  const body=calls[0]!.body as {messages:{kakaoOptions:{disableSms:boolean};customFields:{deliveryId:string};replacements?:unknown}[]};
  assert.equal(body.messages[0]!.kakaoOptions.disableSms,true);assert.equal(body.messages[0]!.replacements,undefined);
  assert.equal(body.messages[0]!.customFields.deliveryId,'synthetic-delivery');
});

test('AP SOLAPI lookup validates account and frozen recipient and keeps absence unknown',async()=>{
 const {createSolapiNotificationProvider}=await import('../src/notification-provider.js');let kind='absent';
 const input={deliveryId:'synthetic-id',channel:'kakao' as const,audience:'customer' as const,recipient:'01012345678',startedAt:new Date().toISOString()};
 const config={accountId:'expected-account',apiKey:'synthetic-key',apiSecret:'synthetic-secret',from:'0212345678',pfId:'synthetic',ownerTemplateId:'synthetic',customerTemplateId:'synthetic'};
 const provider=createSolapiNotificationProvider(config,async()=>new Response(JSON.stringify({messageList:kind==='absent'?{}:{m:{messageId:'m',accountId:kind==='wrong'?'wrong-account':'expected-account',to:input.recipient,from:config.from,type:'ATA',replacement:false,status:'COMPLETE',statusCode:'3104',customFields:{deliveryId:input.deliveryId}}}}),{status:200}));
 assert.equal(await provider.lookup(input),null);kind='wrong';await assert.rejects(provider.lookup(input),/unknown/);kind='failed';const result=await provider.lookup(input);assert.equal(result?.state,'failed');assert.equal(result?.allowFallback,true);
});
test('AP Web Push blocks SSRF endpoints and distinguishes accepted from read/delivered',async()=>{
 const {validPushSubscription,createWebPushNotificationProvider}=await import('../src/notification-web-push.js');
 const keys={p256dh:Buffer.alloc(65,1).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')};
 assert.equal(validPushSubscription({endpoint:'http://127.0.0.1/private',keys}),null);assert.equal(validPushSubscription({endpoint:'https://example.invalid/private',keys}),null);
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',keys};assert.ok(validPushSubscription(subscription));
 const {createHash}=await import('node:crypto');const config={subject:'mailto:notification@example.invalid',publicKey:keys.p256dh,privateKey:Buffer.alloc(32,3).toString('base64url')};
 const provider=createWebPushNotificationProvider(config,async(_subscription,payload,options)=>{assert.equal(String(payload).includes('010'),false);assert.deepEqual(options?.vapidDetails,config);return {statusCode:201,body:'',headers:{}};});
 const result=await provider.send({deliveryId:'synthetic-id',channel:'web_push',audience:'owner',recipient:JSON.stringify(subscription),startedAt:new Date().toISOString()});assert.equal(result.state,'accepted');assert.equal(await provider.lookup({deliveryId:'synthetic-id',channel:'web_push',audience:'owner',recipient:JSON.stringify(subscription),startedAt:new Date().toISOString()}),null);assert.equal(provider.accountId,createHash('sha256').update(config.publicKey).digest('hex'));
 const gone=createWebPushNotificationProvider(config,async()=>{throw {statusCode:410};});assert.equal((await gone.send({deliveryId:'synthetic-id',channel:'web_push',audience:'owner',recipient:JSON.stringify(subscription),startedAt:new Date().toISOString()})).state,'failed');
});
test('AP notification environment never enables real provider in mock or copies Field config',async()=>{
 const {notificationContextFromEnvironment}=await import('../src/notification-context.js');const key=Buffer.alloc(32,4).toString('base64url');
 assert.equal(notificationContextFromEnvironment({FIELD_NOTIFICATION_CREDENTIAL_KEY:key}),undefined);
 assert.equal(notificationContextFromEnvironment({AP_NOTIFICATION_CREDENTIAL_KEY:key,AP_PROFILE:'mock'})?.provider,undefined);
 assert.throws(()=>notificationContextFromEnvironment({AP_NOTIFICATION_CREDENTIAL_KEY:key,AP_PROFILE:'mock',AP_SOLAPI_API_KEY:'synthetic-key'}),/forbidden/);
 assert.throws(()=>notificationContextFromEnvironment({AP_NOTIFICATION_CREDENTIAL_KEY:key,AP_PROFILE:'sandbox',AP_SOLAPI_API_KEY:'synthetic-key'}),/incomplete/);
});

test('AP send acknowledgement cannot confirm failure or substitute a returned recipient',async()=>{
 const {createSolapiNotificationProvider}=await import('../src/notification-provider.js');let wrong=false;
 const provider=createSolapiNotificationProvider({accountId:'synthetic-account',apiKey:'synthetic-key',apiSecret:'synthetic-secret',from:'0212345678',pfId:'synthetic',ownerTemplateId:'synthetic',customerTemplateId:'synthetic'},async()=>new Response(JSON.stringify({groupInfo:{accountId:'synthetic-account'},failedMessageList:[{messageId:'m',customFields:{deliveryId:'d'},statusCode:'3104',to:wrong?'01099999999':'01012345678',from:'0212345678',type:'ATA',accountId:'synthetic-account'}]}),{status:200}));
 const input={deliveryId:'d',channel:'kakao' as const,audience:'customer' as const,recipient:'01012345678',startedAt:new Date().toISOString()};
 const result=await provider.send(input);assert.equal(result.state,'accepted');assert.equal(result.allowFallback,false);wrong=true;await assert.rejects(provider.send(input),/unknown/);
});
