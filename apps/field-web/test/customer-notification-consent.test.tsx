import assert from "node:assert/strict";
import test from "node:test";
import { readCustomerNotificationConsent, updateCustomerNotificationConsent } from "../src/field-customer-notification-model";
import { inspectNotificationPush, prepareNotificationPush, changeNotificationPush, type PushEnvironment } from "../src/field-notification-push-client";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { resolve } from "node:path";
const target={kind:"inquiry" as const,id:"dff74ac9-7c84-424b-91ba-4c64e010bcd1",receiptKey:"a".repeat(43)};
const settings={kakao:true,sms:false,state:"consented",phoneVerified:false,storageState:"configured",providerState:"blocked_integration"};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
test("customer consent sends only own receipt header and explicit service channel flags",async()=>{
 const calls:{url:string;init?:RequestInit}[]=[];
 const transport:typeof fetch=async(input,init)=>{calls.push({url:String(input),init});return response(init?.method==='POST'?{state:'consented'}:{...settings,customerPhone:'must-not-escape'});};
 const loaded=await readCustomerNotificationConsent(target,transport);assert.deepEqual(loaded,settings);
 const saved=await updateCustomerNotificationConsent(target,{kakao:true,sms:false},transport);assert.equal(saved.outcome,'confirmed');
 assert.equal(calls.length,3);for(const c of calls){assert.equal(c.url,`/v1/customer/notification-consents/inquiry/${target.id}`);assert.equal(new Headers(c.init?.headers).get('authorization'),`Bearer ${target.receiptKey}`);assert.equal(c.init?.credentials,'same-origin');assert.equal(c.url.includes(target.receiptKey),false);}
 assert.deepEqual(JSON.parse(String(calls[1]!.init!.body)),{kakao:true,sms:false,consentVersion:'notification-v1'});
 await assert.rejects(readCustomerNotificationConsent({...target,receiptKey:'01012345678'},transport),/receipt/);assert.equal(calls.length,3);
});
test("customer lost save response reconciles by GET and never repeats POST",async()=>{
 let posts=0,reads=0,stored=false;const transport:typeof fetch=async(_input,init)=>{if(init?.method==='POST'){posts++;stored=true;throw Error('synthetic-lost');}reads++;return response({...settings,kakao:stored,state:stored?'consented':'withdrawn'});};
 const result=await updateCustomerNotificationConsent(target,{kakao:true,sms:false},transport);assert.equal(result.outcome,'confirmed');assert.equal(posts,1);assert.equal(reads,1);
 const unknown=await updateCustomerNotificationConsent(target,{kakao:false,sms:false},async(_input,init)=>{if(init?.method==='POST'){posts++;throw Error('synthetic-lost');}return response(settings);});assert.equal(unknown.outcome,'unknown');assert.equal(posts,2);
});
test("customer withdrawal needs no phone and invalid SMS-only consent makes no request",async()=>{
 let calls=0;const transport:typeof fetch=async(_input,init)=>{calls++;return response(init?.method==='POST'?{state:'withdrawn'}:{...settings,kakao:false,state:'withdrawn'});};
 assert.equal((await updateCustomerNotificationConsent(target,{kakao:false,sms:false},transport)).outcome,'confirmed');assert.equal(calls,2);
 await assert.rejects(updateCustomerNotificationConsent(target,{kakao:false,sms:true},transport),/channel/);assert.equal(calls,2);
 assert.equal((await updateCustomerNotificationConsent(target,{kakao:true,sms:false},async()=>response({error:'notification_target_not_found'},404))).outcome,'rejected');
});
function browserFixture(){
 const key=new Uint8Array(65);key[0]=4;const publicKey=Buffer.from(key).toString('base64url');
 let permission:'default'|'granted'|'denied'='default',registered=false,unsubscribed=0,subscriptions=0,requests=0;
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',options:{applicationServerKey:key.buffer},toJSON(){return {endpoint:this.endpoint,keys:{p256dh:publicKey,auth:Buffer.alloc(16).toString('base64url')}};},async unsubscribe(){unsubscribed++;return true;}};
 const registration={active:{scriptURL:'https://own.example/field-notification-sw.js',state:'activated'},pushManager:{async getSubscription(){return subscriptions?subscription:null;},async subscribe(){subscriptions++;return subscription;}}};
 const environment:PushEnvironment={origin:'https://own.example',secure:true,supported:true,installationRequired:false,permission:()=>permission,async requestPermission(){requests++;return permission;},async getRegistration(){return registered?registration:undefined;},async register(){registered=true;return registration;}};
 return {environment,publicKey,subscription,registered:()=>registered,unsubscribed:()=>unsubscribed,requests:()=>requests,permission(value:typeof permission){permission=value;}};
}
test("push preparation really registers own worker without pretending provider or permission success",async()=>{
 const b=browserFixture();assert.equal((await inspectNotificationPush({pushState:'blocked_integration',pushPublicKey:null},b.environment)).state,'blocked_integration');assert.equal(b.requests(),0);
 assert.equal((await prepareNotificationPush(b.environment)).state,'ready');assert.equal(b.registered(),true);assert.equal(b.requests(),0);
 assert.equal((await inspectNotificationPush({pushState:'configured',pushPublicKey:b.publicKey},b.environment)).state,'ready');
 assert.equal((await prepareNotificationPush({...b.environment,installationRequired:true})).state,'unsupported');
});
test("push denied permission never subscribes; lost save preserves real subscription; revoke clears it",async()=>{
 const b=browserFixture();await prepareNotificationPush(b.environment);b.permission('denied');let posts=0;
 const save=async()=>{posts++;return {outcome:'confirmed' as const};};
 await assert.rejects(changeNotificationPush({enabled:true,pushState:'configured',pushPublicKey:b.publicKey},save,b.environment),/permission/);assert.equal(posts,0);
 b.permission('granted');const lost=await changeNotificationPush({enabled:true,pushState:'configured',pushPublicKey:b.publicKey},async()=>{posts++;return {outcome:'unknown' as const};},b.environment);assert.equal(lost.outcome,'unknown');assert.equal(b.unsubscribed(),0);
 const withdrawn=await changeNotificationPush({enabled:false,pushState:'blocked_integration',pushPublicKey:null},save,b.environment);assert.equal(withdrawn.outcome,'confirmed');assert.equal(b.unsubscribed(),1);
});
test("push registration POST rejection cleans only the new subscription and remains rejected",async()=>{
 const b=browserFixture();await prepareNotificationPush(b.environment);b.permission('granted');
 const result=await changeNotificationPush({enabled:true,pushState:'configured',pushPublicKey:b.publicKey},async()=>({outcome:'rejected' as const}),b.environment);assert.equal(result.outcome,'rejected');assert.equal(b.unsubscribed(),1);
});
test("own service worker displays generic privacy-safe notification and opens only own management",async()=>{
 const handlers=new Map<string,(event:Record<string,unknown>)=>void>(),shown:unknown[]=[],opened:string[]=[];let promise:Promise<unknown>|undefined;
 const own={location:{origin:'https://own.example'},addEventListener(name:string,handler:(event:Record<string,unknown>)=>void){handlers.set(name,handler);},registration:{async showNotification(title:string,options:unknown){shown.push({title,options});}},async skipWaiting(){},clients:{async claim(){},async matchAll(){return [];},async openWindow(url:string){opened.push(url);}}};
 vm.runInNewContext(readFileSync(resolve('public/field-notification-sw.js'),'utf8'),{self:own,URL});
 handlers.get('install')!({waitUntil(p:Promise<unknown>){promise=p;}});await promise;
 handlers.get('activate')!({waitUntil(p:Promise<unknown>){promise=p;}});await promise;
 handlers.get('push')!({data:{json(){return {title:'Private customer',body:'secret receipt key',tag:target.id,url:'https://evil.invalid'};}},waitUntil(p:Promise<unknown>){promise=p;}});await promise;
 assert.equal(JSON.stringify(shown).includes('Private customer'),false);assert.equal(JSON.stringify(shown).includes('secret receipt key'),false);assert.equal(shown.length,1);
 handlers.get('notificationclick')!({notification:{close(){}},waitUntil(p:Promise<unknown>){promise=p;}});await promise;assert.deepEqual(opened,['https://own.example/workspace#owner-notifications']);
});

test("push preparation preserves another installing or waiting worker",async()=>{
 for(const slot of ['installing','waiting'] as const){const b=browserFixture();const registration={active:null,[slot]:{scriptURL:'https://own.example/existing-app-sw.js',state:slot==='installing'?'installing':'installed'},pushManager:{async getSubscription(){return null;},async subscribe(){throw Error('must not subscribe');}}};
  const result=await prepareNotificationPush({...b.environment,async getRegistration(){return registration;}});assert.equal(result.state,'worker_missing');assert.equal(b.registered(),false);
 }
});

test("push enable refuses own active worker with a foreign replacement pending",async()=>{
 for(const slot of ['installing','waiting'] as const){const b=browserFixture();await prepareNotificationPush(b.environment);b.permission('granted');let saved=0;
  const existing=await b.environment.getRegistration();const environment={...b.environment,async getRegistration(){return {...existing!,[slot]:{scriptURL:'https://own.example/replacement-app-sw.js',state:slot==='installing'?'installing':'installed'}};}};
  assert.equal((await inspectNotificationPush({pushState:'configured',pushPublicKey:b.publicKey},environment)).state,'worker_missing');
  await assert.rejects(changeNotificationPush({enabled:true,pushState:'configured',pushPublicKey:b.publicKey},async()=>{saved++;return {outcome:'confirmed' as const};},environment),/worker/);assert.equal(saved,0);
 }
});
