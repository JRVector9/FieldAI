import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {closeRouteKey,loadRouteKey,RouteKeyError} from '../src/route-key-client.js';

const actor={userId:'owner',sessionId:'session'};
const base={organizationId:randomUUID(),connectionId:randomUUID(),origin:'http://127.0.0.1:3002'};
const response=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
const auth=(userId=actor.userId,sessionId=actor.sessionId)=>response({user:{id:userId},session:{id:sessionId,userId}});
function memory(){const map=new Map<string,string>();return {map,getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}};}
const retained={closeId:null,state:'retained',reason:'not_requested',keyRetained:true,requestedByCurrentActor:false};

test('lost close response reloads the durable receipt and retries the original ID after reload',async()=>{
  const storage=memory();const posted:string[]=[];let receipt=retained as {closeId:string|null;state:string;reason:string;keyRetained:boolean;requestedByCurrentActor:boolean};
  let loses=true;
  const fetcher=(async(path:RequestInfo|URL,options?:RequestInit)=>{
    if(path==='/api/auth/get-session')return auth();
    if(options?.method==='POST'){
      const h=new Headers(options.headers);assert.equal(h.get('x-field-route-key-actor-id'),actor.userId);assert.equal(h.get('x-field-route-key-session-id'),actor.sessionId);
      const body=JSON.parse(String(options.body));assert.deepEqual(Object.keys(body).sort(),['closeId','confirm']);assert.equal(body.confirm,true);posted.push(body.closeId);
      receipt={closeId:body.closeId,state:loses?'pending':'closed',reason:loses?'original_routes_unreconciled':'reconciled',keyRetained:loses,requestedByCurrentActor:true};
      if(loses)throw new Error('POST response lost');return response({closeId:body.closeId,state:'closed',reason:'reconciled'});
    }return response(receipt);
  }) as typeof fetch;
  const context={...base,...actor};assert.equal((await closeRouteKey(context,'revoked',true,storage,fetcher)).state,'pending');
  loses=false;assert.equal((await closeRouteKey(context,'revoked',true,storage,fetcher)).state,'closed');
  assert.equal(posted.length,2);assert.equal(posted[0],posted[1]);
  const stored=[...storage.map.values()][0];assert.ok(stored);assert.deepEqual(Object.keys(JSON.parse(stored)).sort(),['closeId','version']);
});

test('unknown intent not visible in GET is preserved for the same ID retry',async()=>{
  const storage=memory();const ids:string[]=[];let lost=true;let receipt=retained as typeof retained|{closeId:string;state:string;reason:string;keyRetained:boolean;requestedByCurrentActor:boolean};
  const fetcher=(async(path:RequestInfo|URL,options?:RequestInit)=>{
    if(path==='/api/auth/get-session')return auth();
    if(options?.method==='POST'){const b=JSON.parse(String(options.body));ids.push(b.closeId);if(lost)throw new Error('offline');receipt={closeId:b.closeId,state:'pending',reason:'remote_revoke_unacknowledged',keyRetained:true,requestedByCurrentActor:true};return response(receipt,202);}
    return response(receipt);
  }) as typeof fetch;
  await assert.rejects(closeRouteKey({...base,...actor},'revoked',true,storage,fetcher),{code:'route_key_result_unknown'});
  lost=false;await closeRouteKey({...base,...actor},'revoked',true,storage,fetcher);assert.equal(ids[0],ids[1]);
});

test('changed identity, late receipt and missing confirmation never submit close',async()=>{
  let calls=0,posts=0;
  const changed=(async(path:RequestInfo|URL,options?:RequestInit)=>{if(options?.method==='POST')posts++;return path==='/api/auth/get-session'?auth(++calls>1?'another-owner':'owner'):response(retained);}) as typeof fetch;
  await assert.rejects(closeRouteKey({...base,...actor},'revoked',true,memory(),changed),{code:'route_key_session_changed'});assert.equal(posts,0);
  const same=(async(path:RequestInfo|URL,options?:RequestInit)=>{if(options?.method==='POST')posts++;return path==='/api/auth/get-session'?auth():response(retained);}) as typeof fetch;
  await assert.rejects(closeRouteKey({...base,...actor},'active',true,memory(),same),{code:'route_key_confirmation_required'});
  await assert.rejects(closeRouteKey({...base,...actor},'revoked',false,memory(),same),{code:'route_key_confirmation_required'});
  let current=true;const late=(async(path:RequestInfo|URL)=>{if(path==='/api/auth/get-session')return auth();current=false;return response(retained);}) as typeof fetch;
  await assert.rejects(loadRouteKey(base,late,()=>current),RouteKeyError);assert.equal(posts,0);
});

test('inaccessible storage and unsafe metadata cannot create a new close',async()=>{
  let posts=0;
  const raw=(async(path:RequestInfo|URL)=>path==='/api/auth/get-session'?auth():response({...retained,eventSecret:'must-not-be-consumed'})) as typeof fetch;
  await assert.rejects(loadRouteKey(base,raw),{code:'route_key_result_unknown'});
  const plain=(async(path:RequestInfo|URL,options?:RequestInit)=>{if(options?.method==='POST')posts++;return path==='/api/auth/get-session'?auth():response(retained);}) as typeof fetch;
  await assert.rejects(closeRouteKey({...base,...actor},'revoked',true,{getItem:()=>null,setItem:()=>{throw new Error('storage denied');}},plain),{code:'route_key_storage_unavailable'});
  assert.equal(posts,0);
});

test('same owner new session and overwritten tab cache retry the authoritative pending ID',async()=>{
  const id=randomUUID();const receipt={closeId:id,state:'pending',reason:'original_routes_unreconciled',keyRetained:true,requestedByCurrentActor:true};
  const posts:string[]=[];const storage=memory();
  const fetcher=(async(path:RequestInfo|URL,options?:RequestInit)=>{
    if(path==='/api/auth/get-session')return auth('owner','fresh-session');
    if(options?.method==='POST'){posts.push(JSON.parse(String(options.body)).closeId);return response({closeId:id,state:'pending',reason:'original_routes_unreconciled'},202);}
    return response(receipt);
  }) as typeof fetch;
  const context={...base,userId:'owner',sessionId:'fresh-session'};
  await closeRouteKey(context,'revoked',true,storage,fetcher);
  for(const key of storage.map.keys())storage.map.set(key,JSON.stringify({version:1,closeId:randomUUID()}));
  await closeRouteKey(context,'revoked',true,storage,fetcher);
  assert.deepEqual(posts,[id,id]);
});

test('current owner may explicitly request takeover of a former owner pending receipt; backend remains authority',async()=>{
  const formerId=randomUUID();let receipt={closeId:String(formerId),state:'pending',reason:'owner_permission_changed',keyRetained:true,requestedByCurrentActor:false};let submitted='';
  const fetcher=(async(path:RequestInfo|URL,options?:RequestInit)=>{
    if(path==='/api/auth/get-session')return auth();
    if(options?.method==='POST'){submitted=JSON.parse(String(options.body)).closeId;receipt={...receipt,closeId:submitted,reason:'original_routes_unreconciled',requestedByCurrentActor:true};return response(receipt,202);}
    return response(receipt);
  }) as typeof fetch;
  await closeRouteKey({...base,...actor},'revoked',true,memory(),fetcher);
  assert.notEqual(submitted,formerId);assert.ok(submitted);
});

test('a saved earlier cancelled request is retired only on its exact server receipt before a confirmed takeover',async()=>{
  const otherId=randomUUID(),storage=memory(),posts:string[]=[];
  let receipt=retained as {closeId:string|null;state:string;reason:string;keyRetained:boolean;requestedByCurrentActor:boolean};
  const fetcher=(async(path:RequestInfo|URL,options?:RequestInit)=>{
    if(path==='/api/auth/get-session')return auth();
    if(options?.method==='POST'){
      const id=JSON.parse(String(options.body)).closeId;posts.push(id);
      if(posts.length===1){receipt={closeId:otherId,state:'pending',reason:'owner_permission_changed',keyRetained:true,requestedByCurrentActor:false};return response({closeId:id,state:'cancelled',reason:'owner_permission_changed'},202);}
      receipt={closeId:id,state:'pending',reason:'original_routes_unreconciled',keyRetained:true,requestedByCurrentActor:true};return response({closeId:id,state:'pending',reason:'original_routes_unreconciled'},202);
    }return response(receipt);
  }) as typeof fetch;
  await assert.rejects(closeRouteKey({...base,...actor},'revoked',true,storage,fetcher),{code:'route_key_request_cancelled'});
  await closeRouteKey({...base,...actor},'revoked',true,storage,fetcher);
  assert.notEqual(posts[0],posts[1]);assert.notEqual(posts[1],otherId);
});
