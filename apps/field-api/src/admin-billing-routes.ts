import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { retentionAdminFor } from './retention-routes.js';

// A read-only supplement to the existing price/refund contracts. No provider port is used.
export function registerAdminBillingRoutes(app:FastifyInstance,runtime:FieldBusinessRuntime){
 app.addHook('preValidation',async(request,reply)=>{
  const path=request.url.split('?',1)[0]??'';
  if(request.method!=='POST'||!/^\/v1\/admin\/billing\/(?:plans(?:\/[a-f0-9-]{36}\/(?:approve|retire))?|refunds(?:\/[a-f0-9-]{36}\/(?:review|approve|reject))?)$/i.test(path))return;
  const actor=request.headers['x-admin-billing-actor-id'],expectedSession=request.headers['x-admin-billing-session-id'];
  // Optional for existing API consumers; the new UI always supplies both. These IDs grant no authority.
  if(actor===undefined&&expectedSession===undefined)return;
  if(typeof actor!=='string'||typeof expectedSession!=='string'||actor.length<1||actor.length>200||expectedSession.length<1||expectedSession.length>200||/[\u0000-\u001f]/.test(actor+expectedSession))return reply.code(403).send({error:'billing_admin_binding_invalid'});
  const user=await runtime.resolveUserId(request.headers),session=await runtime.resolveSession?.(request.headers);
  if(user!==actor||!session||session.userId!==actor||session.id!==expectedSession)return reply.code(403).send({error:'billing_admin_binding_invalid'});
 });
 app.get('/v1/admin/billing/overview',async(request,reply)=>{
  const userId=await retentionAdminFor(request,reply,runtime,false);if(!userId)return reply;
  const session=await runtime.resolveSession?.(request.headers);if(!session||session.userId!==userId)return reply.code(401).send({error:'current_session_required'});
  const db=await runtime.pool.connect();try{await db.query('begin');
   const role=(await db.query<{role:string}>('select role from field.platform_admin_memberships where user_id=$1 for share',[userId])).rows[0]?.role;
   if(!['operator','auditor'].includes(role??'')){await db.query('rollback');return reply.code(403).send({error:'admin_membership_required'});}
   const counts=(await db.query(`select
    (select count(*)::text from field.billing_transactions where state in ('pending','processing','unknown','blocked_integration')) as "unconfirmedCharges",
    (select count(*)::text from field.billing_periods p join field.paid_subscriptions s on s.id=p.subscription_id where p.billing_period>0 and p.state='failed' and s.state='past_due') as "renewalFailures",
    (select count(*)::text from field.billing_refunds where state in ('requested','reviewed')) as "refundRequests"`)).rows[0];
   const transactions=(await db.query(`select t.id as "id",s.organization_id as "organizationId",o.name as "organizationName",t.period_id as "periodId",
    p.billing_period as "billingPeriod",p.total_amount as "amount",t.state,t.mode,t.created_at as "createdAt",t.completed_at as "completedAt",t.error_code as "errorCode"
    from field.billing_transactions t join field.billing_periods p on p.id=t.period_id join field.paid_subscriptions s on s.id=p.subscription_id
    join field.organizations o on o.id=s.organization_id order by t.created_at desc,t.id desc limit 100`)).rows;
   const refundExecution=(await db.query(`select id,mode,dispatched_at as "dispatchedAt" from field.billing_refunds order by created_at desc,id desc limit 100`)).rows;
   const current=await runtime.resolveSession?.(request.headers);if(!current||current.id!==session.id||current.userId!==userId){await db.query('rollback');return reply.code(401).send({error:'current_session_required'});}
   await db.query("insert into field.admin_access_audit(actor_user_id,resource) values($1,'overview')",[userId]);await db.query('commit');
   return {product:'field',actorUserId:userId,sessionId:session.id,role,snapshotAt:new Date().toISOString(),counts,transactions,refundExecution};
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
 });
}
