import assert from 'node:assert/strict';
import test from 'node:test';
import {createFieldApp} from '../src/app.js';
import type { FieldBusinessRuntime } from '../src/business.js';
process.env.FIELD_AUTH_SECRET='synthetic-admin-billing-secret-32-bytes-immutable';
const id='00000000-0000-4000-8000-000000000001';
async function module(){const m=await import('../src/admin-billing-routes.js').catch(()=>null);assert.ok(m,'new redacted admin billing read route is absent');return m;}
async function fixture(options:{user?:string|null;session?:string|null;role?:string|null;changedRole?:string|null}={}){
 const m=await module(),queries:string[]=[],user=options.user===undefined?'operator-a':options.user,role=options.role===undefined?'operator':options.role;
 const query=async(sql:string)=>{queries.push(sql);if(sql.includes('platform_admin_memberships'))return{rows:role?[{role:sql.includes('for share')&&options.changedRole!==undefined?options.changedRole:role}]:[],rowCount:role?1:0};
 if(sql.includes('as "unconfirmedCharges"'))return{rows:[{unconfirmedCharges:'2',renewalFailures:'1',refundRequests:'1'}],rowCount:1};
 if(sql.includes('t.id as "id"'))return{rows:[{id,organizationId:id,organizationName:'합성 사업체',periodId:id,billingPeriod:1,amount:11000,state:'unknown',mode:'test',createdAt:new Date(),completedAt:null,errorCode:null}],rowCount:1};
 if(sql.includes('dispatched_at'))return{rows:[{id,mode:'test',dispatchedAt:null}],rowCount:1};return{rows:[],rowCount:0};};
 const db={query,release:()=>{}},runtime={pool:{query,connect:async()=>db},resolveUserId:async()=>user,resolveSession:async()=>options.session===null?null:{id:options.session??'current-session',userId:user}} as unknown as FieldBusinessRuntime;
 assert.equal(typeof m.registerAdminBillingRoutes,'function');const app=createFieldApp(async()=>{},undefined,undefined,runtime);return{app,queries};
}
test('redacted own ledger read requires current operator session and records audit without provider access',async()=>{
 process.env.FIELD_PROFILE='mock';const {app,queries}=await fixture();try{const response=await app.inject('/v1/admin/billing/overview');assert.equal(response.statusCode,200);const b=response.json();assert.equal(b.product,'field');assert.equal(b.sessionId,'current-session');assert.equal(b.counts.unconfirmedCharges,'2');assert.equal(b.transactions[0].amount,11000);
 assert.match(response.headers['cache-control']??'',/no-store/);assert.ok(queries.some(q=>q.includes('admin_access_audit')));assert.ok(queries.some(q=>q.includes('for share')));assert.ok(queries.some(q=>q.includes('billing_period>0')));
 const sql=queries.join(' ');assert.doesNotMatch(sql,/payment_key|billing_key|ciphertext|customer_key|provider_mid|key_fingerprint/);assert.doesNotMatch(JSON.stringify(b),/secret|ciphertext|token/);
 }finally{await app.close();}
});
test('missing authentication, missing current session and removed current membership deny the read',async()=>{
 process.env.FIELD_PROFILE='mock';for(const [options,status] of [[{user:null},401],[{session:null},401],[{role:null},403],[{changedRole:null},403]] as const){const {app}=await fixture(options);try{assert.equal((await app.inject('/v1/admin/billing/overview')).statusCode,status);}finally{await app.close();}}
});
test('auditor reads safely while non-mock MFA is blocked and no queries assume peer product',async()=>{
 process.env.FIELD_PROFILE='mock';const {app,queries}=await fixture({role:'auditor'});try{assert.equal((await app.inject('/v1/admin/billing/overview')).json().role,'auditor');assert.ok(queries.every(q=>!q.includes('ap.')));process.env.FIELD_PROFILE='sandbox';assert.equal((await app.inject('/v1/admin/billing/overview')).statusCode,503);}finally{process.env.FIELD_PROFILE='mock';await app.close();}
});

test('expected actor and session fence rejects a newly signed-in operator before billing mutation',async()=>{
 process.env.FIELD_PROFILE='mock';const {app,queries}=await fixture({user:'operator-b',session:'session-b'}),payload={mode:'test',name:'Synthetic price',totalAmount:11000,supplyAmount:10000,vatAmount:1000,taxFreeAmount:0,includedAiUnits:500,graceDays:3,termsVersion:'terms',termsText:'Synthetic terms conditions',refundVersion:'refund',refundText:'Synthetic refund policy',reference:'SYNTHETIC'};
 try{for(const headers of [{'x-admin-billing-actor-id':'operator-a','x-admin-billing-session-id':'session-a'},{'x-admin-billing-actor-id':'operator-b'}]){
 const before=queries.length,r=await app.inject({method:'POST',url:'/v1/admin/billing/plans',headers:{...headers,'idempotency-key':id},payload});assert.equal(r.statusCode,403,r.body);assert.equal(r.json().error,'billing_admin_binding_invalid');assert.ok(!queries.slice(before).some(q=>q.includes('insert into field.billing_plans')));}
 const ok=await app.inject({method:'POST',url:'/v1/admin/billing/plans',headers:{'x-admin-billing-actor-id':'operator-b','x-admin-billing-session-id':'session-b','idempotency-key':id},payload});assert.equal(ok.statusCode,201,ok.body);
 }finally{await app.close();}
});
