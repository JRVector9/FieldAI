import { subscriptionAccess } from './subscription-access.js';
import type { Pool, PoolClient } from 'pg';

export type BillingPlan = {
  id: string; mode: 'test' | 'live'; name: string; currency: 'KRW'; total_amount: number;
  supply_amount: number; vat_amount: number; tax_free_amount: number | null; included_ai_units: number; grace_days: number;
  terms_version: string; terms_text: string; refund_version: string; refund_text: string;
  reference: string; requested_by: string; approved_by: string | null; approved_at: Date | null;
  retired_at: Date | null; created_at: Date;
};

export const planView = (p: BillingPlan) => ({ id: p.id, mode: p.mode, name: p.name, currency: p.currency,
  totalAmount: p.total_amount, supplyAmount: p.supply_amount, vatAmount: p.vat_amount, taxFreeAmount: p.tax_free_amount,
  includedAiUnits: p.included_ai_units, graceDays: p.grace_days, interval: 'month', timeZone: 'Asia/Seoul',
  termsVersion: p.terms_version, termsText: p.terms_text, refundVersion: p.refund_version, refundText: p.refund_text,
  reference: p.reference, requestedBy: p.requested_by, approvedBy: p.approved_by, approvedAt: p.approved_at,
  state: p.retired_at ? 'retired' : p.approved_at ? 'approved' : 'pending', createdAt: p.created_at });

export async function billingSnapshot(db: Pool | PoolClient, organizationId: string) {
  const subscriptions = await db.query<{ id: string; plan_id: string; state: string; anchor_at: Date | null;
    cancel_requested_at: Date | null; terminated_at: Date | null }>(
    `select id,plan_id,state,anchor_at,cancel_requested_at,terminated_at from field.paid_subscriptions
     where organization_id=$1 order by created_at desc,id desc limit 1`, [organizationId]);
  const current = subscriptions.rows[0];
  const currentPlan=current ? (await db.query<BillingPlan>(
    "select * from field.billing_plans where id=$1",[current.plan_id])).rows[0] : null;
  const periods = await db.query(
    `select p.id,p.subscription_id as "subscriptionId",p.billing_period as "billingPeriod",p.starts_at as "startsAt",p.ends_at as "endsAt",
       p.total_amount as "totalAmount",p.supply_amount as "supplyAmount",p.vat_amount as "vatAmount",p.tax_free_amount as "taxFreeAmount",p.currency,p.state,
       p.paid_at as "paidAt",p.grace_ends_at as "graceEndsAt",p.refunded_amount as "refundedAmount"
     from field.billing_periods p join field.paid_subscriptions s on s.id=p.subscription_id
     where s.organization_id=$1 order by p.starts_at desc,p.id desc limit 100`, [organizationId]);
  const transactions = await db.query(
    `select t.id,t.period_id as "periodId",t.order_id as "orderId",t.state,t.mode,t.error_code as "errorCode",
       t.created_at as "createdAt",t.completed_at as "completedAt"
     from field.billing_transactions t join field.billing_periods p on p.id=t.period_id
     join field.paid_subscriptions s on s.id=p.subscription_id where s.organization_id=$1
     order by t.created_at desc,t.id desc limit 100`, [organizationId]);
  return { product: 'field', organizationId, currentPlan:currentPlan?planView(currentPlan):null, access:await subscriptionAccess(db,organizationId),subscription: current ? { id: current.id, planId: current.plan_id,
    state: current.state, anchorAt: current.anchor_at, cancelRequestedAt: current.cancel_requested_at,
    terminatedAt: current.terminated_at } : null, periods: periods.rows, transactions: transactions.rows };
}
