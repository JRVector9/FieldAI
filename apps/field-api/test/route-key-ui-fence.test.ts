import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import Fastify from 'fastify';
import type {Pool} from 'pg';
import {registerApRouteKeyLifecycleRoutes} from '../src/ap-route-key-lifecycle.js';

test('route-key UI rejects actor/session replacement before any connection read or close intent',async()=>{
  let reads=0;const actor='current-owner',session='current-session';
  const app=Fastify();registerApRouteKeyLifecycleRoutes(app,{pool:{query:async()=>{reads++;throw new Error('unexpected read');},connect:async()=>{reads++;throw new Error('unexpected mutation');}} as unknown as Pool,
    resolveUserId:async()=>actor,resolveSession:async()=>({id:session,userId:actor})});
  try {
    const url=`/v1/connections/ap/${randomUUID()}/route-key`;
    for(const headers of [
      {'x-field-route-key-actor-id':'former-owner','x-field-route-key-session-id':session},
      {'x-field-route-key-actor-id':actor,'x-field-route-key-session-id':'former-session'},
      {'x-field-route-key-actor-id':actor},
    ])for(const method of ['GET','POST'] as const){
      const r=await app.inject({url:method==='POST'?`${url}/close`:url,method,headers,
        ...(method==='POST'?{payload:{closeId:randomUUID(),confirm:true}}:{})});
      assert.equal(r.statusCode,409);assert.equal(r.json().error,'route_key_session_changed');
    }
    assert.equal(reads,0);
  } finally {await app.close();}
});

test('current UI session can read metadata and legacy headerless reads remain compatible',async()=>{
  const actor='current-owner',session='current-session';let reads=0;
  const app=Fastify();registerApRouteKeyLifecycleRoutes(app,{pool:{query:async()=>{reads++;return {rows:[{route_key_closed_at:null,retained:true,close_id:null,state:null,last_reason:null}]};}} as unknown as Pool,
    resolveUserId:async()=>actor,resolveSession:async()=>({id:session,userId:actor})});
  try{for(const headers of [{},{'x-field-route-key-actor-id':actor,'x-field-route-key-session-id':session}]){
    const r=await app.inject({url:`/v1/connections/ap/${randomUUID()}/route-key`,headers});assert.equal(r.statusCode,200);
    assert.deepEqual(r.json(),{closeId:null,state:'retained',reason:'not_requested',keyRetained:true,requestedByCurrentActor:false});
  }assert.equal(reads,2);}finally{await app.close();}
});
