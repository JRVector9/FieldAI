import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
export const refundHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export type BillingRefundRecord={id:string;organization_id:string;subscription_id:string;period_id:string;transaction_id:string;request_key:string;
 amount:number;tax_free_amount:number|null;reason:string;requested_by:string;requested_role:string;session_id:string|null;reference:string|null;
 reviewed_by:string|null;review_reason:string|null;reviewed_at:Date|null;approved_by:string|null;approval_reason:string|null;approved_at:Date|null;
 refund_version:string;terms_version:string;mode:string;provider_mid:string;provider_key_fingerprint:string;cancel_reason:string;state:string;
 payment_key_ciphertext:string|null;baseline_keys:string[]|null;baseline_amount:number|null;baseline_tax_free_amount:number|null;
 provider_transaction_hash:string|null;provider_transaction_ciphertext:string|null;provider_canceled_at:Date|null;
 started_at:Date|null;dispatched_at:Date|null;completed_at:Date|null;claim_token:string|null;lease_expires_at:Date|null;next_attempt_at:Date;error_code:string|null;created_at:Date};
export type RefundPayment=BillingRefundRecord&{order_id:string;original_payment_ciphertext:string;original_state:string;total_amount:number;original_tax_free_amount:number|null;
 refunded_amount:number;paid_at:Date;plan_id:string;period_state:string};
export const refundSelection=`select r.*,t.order_id,t.payment_key_ciphertext as original_payment_ciphertext,t.state as original_state,
 p.total_amount,p.tax_free_amount as original_tax_free_amount,p.refunded_amount,p.paid_at,p.plan_id,p.state as period_state
 from field.billing_refunds r join field.billing_transactions t on t.id=r.transaction_id join field.billing_periods p on p.id=r.period_id`;
export function refundView(r:BillingRefundRecord,admin=false){return {id:r.id,periodId:r.period_id,amount:r.amount,taxFreeAmount:r.tax_free_amount,state:r.state,reason:r.reason,
 refundVersion:r.refund_version,createdAt:r.created_at,reviewedAt:r.reviewed_at,approvedAt:r.approved_at,completedAt:r.completed_at,errorCode:r.error_code,
 ...(admin?{organizationId:r.organization_id,requestedRole:r.requested_role,requestedBy:r.requested_by,reviewedBy:r.reviewed_by,approvedBy:r.approved_by,
 reference:r.reference,reviewReason:r.review_reason,approvalReason:r.approval_reason}: {})};}
export async function refundEvent(db:PoolClient,r:{id:string;organization_id:string;subscription_id:string},event:string,actor:string|null=null,reason:string|null=null){
 await db.query(`insert into field.billing_events(organization_id,subscription_id,actor_user_id,event_type,payload) values($1,$2,$3,$4,$5::jsonb)`,
 [r.organization_id,r.subscription_id,actor,`refund_${event}`,JSON.stringify({refundId:r.id,...(reason?{reason}: {})})]);
}
export async function refundOperatorsCurrent(db:PoolClient,r:BillingRefundRecord){
 const ids=[r.reviewed_by,r.approved_by,...(r.requested_role==='operator'?[r.requested_by]:[])];
 if(ids.some(id=>!id)||r.reviewed_by===r.approved_by||r.requested_role==='operator'&&r.requested_by===r.approved_by)return false;
 const operators=(await db.query("select user_id from field.platform_admin_memberships where user_id=any($1::text[]) and role='operator' order by user_id for share",[ids])).rows;
 return new Set(operators.map(r=>r.user_id)).size===new Set(ids).size;
}
