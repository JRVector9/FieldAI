import { BillingClientError,billingProduct,type BillingIdentity } from './billing-client';
export type BillingMutationKind='refund'|'cancel-renewal';
export type BillingMutationContext=BillingIdentity&{organizationId:string;origin:string};
export type BillingMutationStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type RefundBody={periodId:string;amount:number;reason:string};
type CancelBody={subscriptionId:string};
export type BillingMutationAttempt={version:1;product:typeof billingProduct;kind:BillingMutationKind;organizationId:string;actorUserId:string;
 sessionId:string;origin:string;requestKey:string;body:RefundBody|CancelBody;stage:'prepared'|'unknown'};
export type BillingMutationReceipt={kind:'refund';id:string;state:'requested'}|{kind:'cancel-renewal';subscriptionId:string;state:'canceled';renewalStopped:true};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown,max:number)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const exactKeys=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&Object.keys(value).every(k=>keys.includes(k));
const inFlight=new WeakMap<BillingMutationStorage,Set<string>>();
const legacyStorageKey=(kind:BillingMutationKind)=>`${billingProduct}:billing-mutation:${kind}:v1`;
export function billingMutationStorageKey(kind:BillingMutationKind,context:BillingMutationContext){
 if(!['refund','cancel-renewal'].includes(kind)||!contextValid(context))throw new BillingClientError('billing_mutation_binding_invalid');
 return `${billingProduct}:billing-mutation:${kind}:v2:${encodeURIComponent(JSON.stringify([context.organizationId,context.userId,context.sessionId,context.origin]))}`;
}
const attemptContext=(attempt:BillingMutationAttempt):BillingMutationContext=>({organizationId:attempt.organizationId,userId:attempt.actorUserId,sessionId:attempt.sessionId,origin:attempt.origin});
function ownOrigin(value:unknown):value is string{try{const url=new URL(String(value));return url.origin===value&&!url.username&&!url.password
 &&(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname));}catch{return false;}}
function contextValid(context:BillingMutationContext){return uuid.test(context.organizationId)&&text(context.userId,200)&&text(context.sessionId,200)&&ownOrigin(context.origin);}
function privateCardNumber(reason:string){
 return (reason.match(/\b(?:\d[ -]?){12,18}\d\b/g)??[]).some(raw=>{const digits=raw.replace(/\D/g,'');let sum=0;
 for(let i=digits.length-1;i>=0;i--){let n=Number(digits[i]);if((digits.length-1-i)%2){n*=2;if(n>9)n-=9;}sum+=n;}return sum%10===0;});
}
function canonicalBody(kind:BillingMutationKind,value:unknown):RefundBody|CancelBody|null{
 const body=object(value);
 if(kind==='cancel-renewal')return exactKeys(body,['subscriptionId'])&&uuid.test(String(body.subscriptionId))?{subscriptionId:body.subscriptionId as string}:null;
 if(kind!=='refund'||!exactKeys(body,['periodId','amount','reason'])||!uuid.test(String(body.periodId))||!Number.isSafeInteger(body.amount)
 ||Number(body.amount)<1||Number(body.amount)>1000000000||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.length>500
 ||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.reason)||/(?:test|live)_(?:sk|ck|gck)_|(?:authKey|billingKey|paymentKey|secretKey)\s*[:=]/i.test(body.reason)||privateCardNumber(body.reason))return null;
 return {periodId:body.periodId as string,amount:Number(body.amount),reason:body.reason.trim()};
}
export function readBillingMutation(raw:string|null):BillingMutationAttempt|null{
 if(!raw||raw.length>4000)return null;
 try{const value=object(JSON.parse(raw));
 if(!exactKeys(value,['version','product','kind','organizationId','actorUserId','sessionId','origin','requestKey','body','stage'])
 ||value.version!==1||value.product!==billingProduct||!['refund','cancel-renewal'].includes(String(value.kind))||!['prepared','unknown'].includes(String(value.stage))
 ||!uuid.test(String(value.requestKey))||!contextValid({organizationId:value.organizationId as string,userId:value.actorUserId as string,sessionId:value.sessionId as string,origin:value.origin as string}))return null;
 const body=canonicalBody(value.kind as BillingMutationKind,value.body);if(!body)return null;
 return Object.freeze({version:1,product:billingProduct,kind:value.kind as BillingMutationKind,organizationId:value.organizationId as string,actorUserId:value.actorUserId as string,
 sessionId:value.sessionId as string,origin:value.origin as string,requestKey:value.requestKey as string,body:Object.freeze(body),stage:value.stage as 'prepared'|'unknown'});
 }catch{return null;}
}
function bound(attempt:BillingMutationAttempt,context:BillingMutationContext){
 if(attempt.product!==billingProduct||!contextValid(context)||attempt.organizationId!==context.organizationId||attempt.actorUserId!==context.userId
 ||attempt.sessionId!==context.sessionId||attempt.origin!==context.origin)throw new BillingClientError('billing_mutation_binding_invalid');
}
function readStored(kind:BillingMutationKind,context:BillingMutationContext,storage:BillingMutationStorage){
 const key=billingMutationStorageKey(kind,context);let raw:string|null,legacyRaw:string|null;
 try{raw=storage.getItem(key);legacyRaw=storage.getItem(legacyStorageKey(kind));}catch{throw new BillingClientError('billing_retry_storage_unavailable');}
 let current=raw===null?null:readBillingMutation(raw);
 if(raw!==null&&(!current||current.kind!==kind))throw new BillingClientError('billing_mutation_metadata_invalid');
 if(current)bound(current,context);
 if(legacyRaw===null)return current;
 let header:Record<string,unknown>={};try{if(legacyRaw.length<=4000)header=object(JSON.parse(legacyRaw));}catch{/* Preserve unreadable legacy metadata. */}
 const legacyContext={organizationId:header.organizationId as string,userId:header.actorUserId as string,sessionId:header.sessionId as string,origin:header.origin as string};
 // Establish a foreign binding from safe metadata only; its malformed/private body is never restored.
 if(header.version===1&&header.product===billingProduct&&header.kind===kind&&contextValid(legacyContext)
 &&(legacyContext.organizationId!==context.organizationId||legacyContext.userId!==context.userId||legacyContext.sessionId!==context.sessionId||legacyContext.origin!==context.origin))return current;
 const legacy=readBillingMutation(legacyRaw);
 if(!legacy||legacy.kind!==kind){
 // A verified scoped UUID can be retried without choosing or discarding an unreadable legacy request.
 if(current)return current;throw new BillingClientError('billing_mutation_metadata_invalid');
 }
 if(current&&JSON.stringify({...current,stage:'unknown'})!==JSON.stringify({...legacy,stage:'unknown'}))throw new BillingClientError('billing_mutation_metadata_invalid');
 current=Object.freeze({...legacy,stage:current?.stage==='unknown'||legacy.stage==='unknown'?'unknown':'prepared'});
 // Verify the scoped copy before removing only the original context's identical legacy pointer.
 persist(current,storage);
 try{if(storage.getItem(legacyStorageKey(kind))!==legacyRaw)throw new Error('legacy_changed');
 storage.removeItem(legacyStorageKey(kind));if(storage.getItem(legacyStorageKey(kind))!==null)throw new Error('unverified_storage');}
 catch{throw new BillingClientError('billing_retry_storage_unavailable');}
 return current;
}
export function restoreBillingMutation(kind:BillingMutationKind,context:BillingMutationContext,storage:BillingMutationStorage){
 const attempt=readStored(kind,context,storage);if(attempt)bound(attempt,context);return attempt;
}
function persist(attempt:BillingMutationAttempt,storage:BillingMutationStorage){
 try{const key=billingMutationStorageKey(attempt.kind,attemptContext(attempt)),raw=JSON.stringify(attempt);storage.setItem(key,raw);
 if(storage.getItem(key)!==raw)throw new Error('unverified_storage');}catch{throw new BillingClientError('billing_retry_storage_unavailable');}
}
export function prepareBillingMutation(kind:BillingMutationKind,body:unknown,context:BillingMutationContext,storage:BillingMutationStorage,
 createKey:()=>string=()=>crypto.randomUUID()):BillingMutationAttempt{
 const input=canonicalBody(kind,body);if(!input)throw new BillingClientError('billing_mutation_input_invalid');
 if(!contextValid(context))throw new BillingClientError('billing_mutation_binding_invalid');
 const previous=restoreBillingMutation(kind,context,storage);
 if(previous){if(JSON.stringify(previous.body)!==JSON.stringify(input))throw new BillingClientError('idempotency_conflict',409);return previous;}
 const requestKey=createKey();if(!uuid.test(requestKey))throw new BillingClientError('billing_mutation_input_invalid');
 const attempt:BillingMutationAttempt=Object.freeze({version:1,product:billingProduct,kind,organizationId:context.organizationId,actorUserId:context.userId,
 sessionId:context.sessionId,origin:context.origin,requestKey,body:Object.freeze(input),stage:'prepared'});persist(attempt,storage);return attempt;
}
const commonErrors:Record<string,number>={invalid_organization_id:400,authentication_required:401,current_session_required:401,
 origin_denied:403,owner_required:403,owner_membership_required:403,organization_not_found:404};
const refundErrors:Record<string,number>={invalid_refund_request:400,paid_period_not_found:404,refund_amount_exceeded:409};
const cancelErrors:Record<string,number>={invalid_cancel_request:400,subscription_not_found:404};
function knownError(value:unknown,kind:BillingMutationKind,status:number){
 const code=object(value).error;if(typeof code!=='string')return {code:'billing_result_unknown',precommit:false};
 const map={...commonErrors,...(kind==='refund'?refundErrors:cancelErrors)};
 if(map[code]===status)return {code,precommit:true};
 if(status===409&&['idempotency_conflict','refund_in_progress','refund_state_changed'].includes(code))return {code,precommit:false};
 if(status===503&&code==='blocked_integration')return {code,precommit:false};
 return {code:'billing_result_unknown',precommit:false};
}
function receipt(value:unknown,attempt:BillingMutationAttempt,status:number):BillingMutationReceipt{
 const result=object(value);
 if(attempt.kind==='refund'&&(status===200||status===201)&&exactKeys(result,['id','state'])&&uuid.test(String(result.id))&&result.state==='requested')
 return {kind:'refund',id:result.id as string,state:'requested'};
 if(attempt.kind==='cancel-renewal'&&status===200&&exactKeys(result,['subscriptionId','state','renewalStopped'])
 &&result.subscriptionId===(attempt.body as CancelBody).subscriptionId&&result.state==='canceled'&&result.renewalStopped===true)
 return {kind:'cancel-renewal',subscriptionId:result.subscriptionId as string,state:'canceled',renewalStopped:true};
 throw new BillingClientError('billing_result_unknown',status);
}
function clearVerified(attempt:BillingMutationAttempt,storage:BillingMutationStorage){
 const current=readStored(attempt.kind,attemptContext(attempt),storage);
 if(!current||JSON.stringify(current)!==JSON.stringify(attempt))throw new BillingClientError('billing_mutation_metadata_invalid');
 try{const key=billingMutationStorageKey(attempt.kind,attemptContext(attempt));storage.removeItem(key);if(storage.getItem(key)!==null)throw new Error('unverified_storage');}
 catch{throw new BillingClientError('billing_retry_storage_unavailable');}
}
export async function submitBillingMutation(attempt:BillingMutationAttempt,context:BillingMutationContext,storage:BillingMutationStorage,
 fetcher:typeof fetch=fetch):Promise<BillingMutationReceipt>{
 const valid=readBillingMutation(JSON.stringify(attempt));if(!valid)throw new BillingClientError('billing_mutation_metadata_invalid');bound(valid,context);
 const current=restoreBillingMutation(valid.kind,context,storage);
 if(!current||JSON.stringify({...current,stage:'prepared'})!==JSON.stringify({...valid,stage:'prepared'}))throw new BillingClientError('billing_mutation_metadata_invalid');
 const locks=inFlight.get(storage)??new Set<string>(),key=billingMutationStorageKey(valid.kind,context);
 if(locks.has(key))throw new BillingClientError('billing_mutation_in_progress');locks.add(key);inFlight.set(storage,locks);
 const unknown:BillingMutationAttempt=Object.freeze({...current,stage:'unknown'});
 try{
 // Persist before fetch: a reload/crash during the request must retain the original UUID and body.
 persist(unknown,storage);let response:Response;
 try{response=await fetcher(valid.kind==='refund'?'/v1/subscription/refunds':'/v1/subscription/billing/cancel',{
 method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-organization-id':valid.organizationId,'idempotency-key':valid.requestKey},
 body:JSON.stringify(valid.body)});}catch{throw new BillingClientError('billing_result_unknown');}
 let value:unknown;try{value=await response.json();}catch{throw new BillingClientError('billing_result_unknown',response.status);}
 if(!response.ok){const error=knownError(value,valid.kind,response.status);
 // A subsequent 4xx cannot establish that a previous unknown request never committed.
 if(current.stage==='prepared'&&error.precommit)clearVerified(unknown,storage);
 throw new BillingClientError(error.code,response.status);}
 const result=receipt(value,valid,response.status);clearVerified(unknown,storage);return result;
 }finally{locks.delete(key);}
}
