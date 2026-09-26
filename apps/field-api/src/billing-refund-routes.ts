import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { retentionAdminFor } from './retention-routes.js';
import { refundHash,refundView,refundEvent,refundSelection,refundOperatorsCurrent,type BillingRefundRecord,type RefundPayment } from './billing-refund.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const text=(v:unknown,min:number,max:number)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max?v.trim():null;
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const fail=(reply:FastifyReply,status:number,error:string)=>reply.code(status).send({error});
async function member(request:FastifyRequest,reply:FastifyReply,runtime:FieldBusinessRuntime,write=false){
 reply.headers({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
 if(write&&(request.headers.origin!==undefined&&request.headers.origin!==(runtime.billing?.webOrigin??process.env.FIELD_PUBLIC_WEB_ORIGIN??'http://localhost:3002')||request.headers['sec-fetch-site']==='cross-site')){fail(reply,403,'origin_denied');return null;}
 const user=await runtime.resolveUserId(request.headers);if(!user){fail(reply,401,'authentication_required');return null;}
 const org=request.headers['x-organization-id'];if(org!==undefined&&(typeof org!=='string'||!uuid.test(org))){fail(reply,400,'invalid_organization_id');return null;}
 const m=(await runtime.pool.query<{organization_id:string;role:string}>('select organization_id,role from field.memberships where user_id=$1 and ($2::uuid is null or organization_id=$2) order by created_at limit 1',[user,org??null])).rows[0];
 if(!m){fail(reply,404,'organization_not_found');return null;}if(write&&m.role!=='owner'){fail(reply,403,'owner_membership_required');return null;}
 const session=await runtime.resolveSession?.(request.headers);if(write&&(!session||session.userId!==user)){fail(reply,401,'current_session_required');return null;}
 return {user,org:m.organization_id,session:session?.id??null,canManage:m.role==='owner'};
}
async function operator(db:PoolClient,user:string){return Boolean((await db.query("select 1 from field.platform_admin_memberships where user_id=$1 and role='operator' for share",[user])).rowCount);}
async function replay(db:PoolClient,actor:string,key:string,digest:string){
 await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`field-billing:${actor}:${key}`]);
 const old=(await db.query<{request_hash:string;result:unknown}>('select request_hash,result from field.billing_requests where actor_user_id=$1 and key_hash=$2',[actor,key])).rows[0];
 return old?{conflict:old.request_hash!==digest,result:old.result}:null;
}
async function record(db:PoolClient,actor:string,key:string,digest:string,result:unknown){await db.query('insert into field.billing_requests(actor_user_id,key_hash,request_hash,result) values($1,$2,$3,$4::jsonb)',[actor,key,digest,JSON.stringify(result)]);}
export function registerBillingRefundRoutes(app:FastifyInstance,runtime:FieldBusinessRuntime){
 app.get('/v1/subscription/refunds',async(request,reply)=>{const m=await member(request,reply,runtime);if(!m)return reply;
 return {product:'field',organizationId:m.org,canManage:m.canManage,refunds:(await runtime.pool.query<BillingRefundRecord>('select * from field.billing_refunds where organization_id=$1 order by created_at desc,id desc limit 100',[m.org])).rows.map(r=>refundView(r))};});
 app.get('/v1/admin/billing/refunds',async(request,reply)=>{if(!await retentionAdminFor(request,reply,runtime,false))return reply;
 const org=object(request.query).organizationId;if(org!==undefined&&!uuid.test(String(org)))return fail(reply,400,'invalid_organization_id');
 return {product:'field',refunds:(await runtime.pool.query<BillingRefundRecord>('select * from field.billing_refunds where ($1::uuid is null or organization_id=$1) order by created_at desc,id desc limit 100',[org??null])).rows.map(r=>refundView(r,true))};});
 for(const admin of [false,true])app.post(admin?'/v1/admin/billing/refunds':'/v1/subscription/refunds',async(request,reply)=>{
 const actor=admin?await retentionAdminFor(request,reply,runtime):null,m=admin?null:await member(request,reply,runtime,true);if(admin?!actor:!m)return reply;
 const b=object(request.body),rawKey=request.headers['idempotency-key'],reason=text(b.reason,10,500),reference=admin?text(b.reference,1,160):null;
 const org=admin?b.organizationId:m!.org,user=admin?actor!:m!.user;
 if(typeof rawKey!=='string'||!uuid.test(rawKey)||!uuid.test(String(org))||!uuid.test(String(b.periodId))||!integer(b.amount,1,1000000000)||!reason||admin&&!reference)return fail(reply,400,'invalid_refund_request');
 const key=refundHash(rawKey),digest=refundHash(JSON.stringify(['refund',org,b.periodId,b.amount,reason,reference,admin?null:m!.session])),db=await runtime.pool.connect();
 try{await db.query('begin');await db.query('select id from field.organizations where id=$1 for update',[org]);
 if(admin?!await operator(db,user):!(await db.query("select 1 from field.memberships where organization_id=$1 and user_id=$2 and role='owner' for share",[org,user])).rowCount){await db.query('rollback');return fail(reply,403,admin?'operator_membership_required':'owner_membership_required');}
 const old=await replay(db,user,key,digest);if(old){await db.query('commit');return old.conflict?fail(reply,409,'idempotency_conflict'):old.result;}
 const p=(await db.query(`select p.*,t.id as transaction_id,t.mode,t.provider_mid,t.provider_key_fingerprint,c.refund_version,c.terms_version
 from field.billing_periods p join field.paid_subscriptions s on s.id=p.subscription_id join field.billing_consents c on c.id=p.consent_id
 join field.billing_transactions t on t.period_id=p.id and t.state='succeeded' and t.payment_key_ciphertext is not null
 where p.id=$1 and s.organization_id=$2 and p.paid_at is not null and p.state in ('paid','refunded') for update of p,t`,[b.periodId,org])).rows[0];
 if(!p){await db.query('rollback');return fail(reply,404,'paid_period_not_found');}
 if(p.total_amount-p.refunded_amount<Number(b.amount)){await db.query('rollback');return fail(reply,409,'refund_amount_exceeded');}
 if((await db.query("select 1 from field.billing_refunds where transaction_id=$1 and state not in ('succeeded','rejected')",[p.transaction_id])).rowCount){await db.query('rollback');return fail(reply,409,'refund_in_progress');}
 if(!p.provider_mid||!/^[a-f0-9]{64}$/.test(p.provider_key_fingerprint??'')){await db.query('rollback');return fail(reply,503,'blocked_integration');}
 const id=randomUUID();await db.query(`insert into field.billing_refunds(id,organization_id,subscription_id,period_id,transaction_id,request_key,amount,reason,requested_by,requested_role,session_id,reference,refund_version,terms_version,mode,provider_mid,provider_key_fingerprint,cancel_reason)
 values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,[id,org,p.subscription_id,p.id,p.transaction_id,randomUUID(),b.amount,reason,user,admin?'operator':'owner',admin?null:m!.session,reference,p.refund_version,p.terms_version,p.mode,p.provider_mid,p.provider_key_fingerprint,`Field subscription refund ${id}`]);
 const result={id,state:'requested'};await record(db,user,key,digest,result);await refundEvent(db,{id,organization_id:String(org),subscription_id:p.subscription_id},'requested',user,reason);await db.query('commit');return reply.code(201).send(result);
 }catch(error){await db.query('rollback');throw error;}finally{db.release();}
 });
 for(const action of ['review','approve','reject'] as const)app.post<{Params:{id:string}}>(`/v1/admin/billing/refunds/:id/${action}`,async(request,reply)=>{
 const actor=await retentionAdminFor(request,reply,runtime);if(!actor)return reply;
 const id=request.params.id,b=object(request.body),rawKey=request.headers['idempotency-key'],reason=text(b.reason,10,500),reference=text(b.reference,1,160);
 if(!uuid.test(id)||typeof rawKey!=='string'||!uuid.test(rawKey)||!reason||action==='review'&&(!reference||!integer(b.taxFreeAmount,0,1000000000)))return fail(reply,400,'invalid_refund_action');
 const key=refundHash(rawKey),digest=refundHash(JSON.stringify(['refund',action,id,reason,action==='review'?[reference,b.taxFreeAmount]:null])),db=await runtime.pool.connect();
 try{await db.query('begin');const candidate=(await db.query<{organization_id:string}>('select organization_id from field.billing_refunds where id=$1',[id])).rows[0];if(!candidate){await db.query('rollback');return fail(reply,404,'refund_not_found');}
 await db.query('select id from field.organizations where id=$1 for update',[candidate.organization_id]);if(!await operator(db,actor)){await db.query('rollback');return fail(reply,403,'operator_membership_required');}
 const old=await replay(db,actor,key,digest);if(old){await db.query('commit');return old.conflict?fail(reply,409,'idempotency_conflict'):old.result;}
 const r=(await db.query<RefundPayment>(`${refundSelection} where r.id=$1 for update of p,t,r`,[id])).rows[0]!;
 if(action==='review'){
 if(r.state!=='requested'){await db.query('rollback');return fail(reply,409,'refund_state_changed');}
 const refundedTax=Number((await db.query("select coalesce(sum(tax_free_amount),0) as n from field.billing_refunds where transaction_id=$1 and state='succeeded'",[r.transaction_id])).rows[0].n);
 const remaining=r.total_amount-r.refunded_amount,taxRemaining=(r.original_tax_free_amount??-1)-refundedTax;
 if(r.amount>remaining||Number(b.taxFreeAmount)>Math.min(r.amount,taxRemaining)||r.amount-Number(b.taxFreeAmount)>remaining-taxRemaining){await db.query('rollback');return fail(reply,409,'refund_amount_exceeded');}
 await db.query("update field.billing_refunds set state='reviewed',reviewed_by=$2,reviewed_at=now(),review_reason=$3,reference=$4,tax_free_amount=$5 where id=$1",[id,actor,reason,reference,b.taxFreeAmount]);
 }else if(action==='approve'){
 if(r.state!=='reviewed'){await db.query('rollback');return fail(reply,409,'refund_state_changed');}
 if(r.reviewed_by===actor||r.requested_role==='operator'&&r.requested_by===actor){await db.query('rollback');return fail(reply,403,'different_approver_required');}
 if(r.mode==='live'){await db.query('rollback');return fail(reply,503,'blocked_integration');}
 if(!await refundOperatorsCurrent(db,{...r,approved_by:actor})){await db.query('rollback');return fail(reply,403,'operator_membership_required');}
 if(r.amount>r.total_amount-r.refunded_amount){await db.query('rollback');return fail(reply,409,'refund_amount_exceeded');}
 await db.query("update field.billing_refunds set state='pending',approved_by=$2,approved_at=now(),approval_reason=$3,next_attempt_at=now() where id=$1",[id,actor,reason]);
 }else{
 if(r.dispatched_at||!['requested','reviewed','pending','blocked_integration'].includes(r.state)){await db.query('rollback');return fail(reply,409,'refund_state_changed');}
 await db.query("update field.billing_refunds set state='rejected',rejected_by=$2,rejected_at=now(),rejection_reason=$3,completed_at=now(),claim_token=null,lease_expires_at=null where id=$1",[id,actor,reason]);
 }
 const current=(await db.query<BillingRefundRecord>('select * from field.billing_refunds where id=$1',[id])).rows[0]!,result=refundView(current,true);await record(db,actor,key,digest,result);await refundEvent(db,current,action,actor,reason);await db.query('commit');return result;
 }catch(error){await db.query('rollback');throw error;}finally{db.release();}
 });
}
