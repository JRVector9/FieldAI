import type { Pool, PoolClient } from 'pg';
import { subscriptionAccess } from './subscription-access.js';

type Reservation = { job_id: string; organization_id: string; period_id: string | null;
  state: 'reserved' | 'dispatched' | 'consumed' | 'released' | 'unknown';
  provider_response_id: string | null; input_tokens: number | null; output_tokens: number | null };
type Period = { id: string; included_ai_units: number; ends_at: Date };

async function accessAndPeriod(db: Pool | PoolClient, organizationId: string, at?: Date) {
  const clock = at ?? (await db.query<{ now: Date }>('select clock_timestamp() as now')).rows[0]!.now;
  const access = await subscriptionAccess(db, organizationId, clock);
  if (access.mode !== 'paid' && access.mode !== 'grace') return { access, period: null };
  const mode = ['mock', 'sandbox'].includes(process.env.FIELD_PROFILE ?? '') ? 'test' : 'live';
  const period = (await db.query<Period>(`select p.id,p.included_ai_units,p.ends_at from field.billing_periods p
    join field.paid_subscriptions s on s.id=p.subscription_id join field.billing_plans plan on plan.id=s.plan_id
    where s.organization_id=$1 and s.id=$2 and plan.mode=$3 and p.paid_at is not null
      and p.state='paid' and p.refunded_amount<p.total_amount and p.starts_at<=$4
    order by p.ends_at desc,p.id desc limit 1`, [organizationId, access.subscriptionId, mode, clock])).rows[0] ?? null;
  return { access, period };
}

export async function fieldAiEntitlement(db: Pool | PoolClient, organizationId: string, at?: Date) {
  const { access, period } = await accessAndPeriod(db, organizationId, at);
  const counts = period ? (await db.query<{ consumed: number; reserved: number; unknown: number }>(
    `select count(*) filter(where state='consumed')::int as consumed,
      count(*) filter(where state in ('reserved','dispatched'))::int as reserved,
      count(*) filter(where state='unknown')::int as unknown from field.ai_entitlements where period_id=$1`, [period.id])).rows[0]! : null;
  const consumedUnits = counts?.consumed ?? 0, reservedUnits = counts?.reserved ?? 0, unknownUnits = counts?.unknown ?? 0;
  return { unitPolicy: 'model_call_v1' as const, overage: 'blocked_without_explicit_purchase' as const,
    mode: access.mode, periodId: period?.id ?? null, endsAt: period?.ends_at.toISOString() ?? null,
    graceEndsAt: access.graceEndsAt?.toISOString() ?? null,
    siteAi: { includedUnits: period?.included_ai_units ?? null, consumedUnits, reservedUnits, unknownUnits,
      remainingUnits: period ? Math.max(0, period.included_ai_units - consumedUnits - reservedUnits - unknownUnits) : null } };
}

async function event(db: PoolClient, jobId: string, state: Reservation['state'], reason: string | null = null) {
  await db.query('insert into field.ai_entitlement_events(job_id,event_type,reason) values($1,$2,$3)', [jobId, state, reason]);
}

// Caller holds the own organization lock and transaction; job ID is the durable request identity.
export async function reserveFieldAi(db: PoolClient, organizationId: string, jobId: string, at?: Date): Promise<string | null> {
  const existing = (await db.query<Reservation>('select * from field.ai_entitlements where job_id=$1 for update', [jobId])).rows[0];
  if (existing) return existing.organization_id === organizationId && existing.state === 'reserved' ? null : 'ai_request_terminal';
  const { access, period } = await accessAndPeriod(db, organizationId, at);
  if (!access.canStartNew) return 'reason' in access ? access.reason ?? 'paid_subscription_required' : 'paid_subscription_required';
  if ((access.mode === 'paid' || access.mode === 'grace') && !period) return 'ai_period_unavailable';
  if (period) {
    const used = (await db.query<{ n: number }>(
      "select count(*)::int as n from field.ai_entitlements where period_id=$1 and state<>'released'", [period.id])).rows[0]!.n;
    if (used >= period.included_ai_units) return 'ai_quota_exhausted';
  }
  await db.query(`insert into field.ai_entitlements(job_id,organization_id,period_id,state)
    values($1,$2,$3,'reserved')`, [jobId, organizationId, period?.id ?? null]);
  await event(db, jobId, 'reserved');
  return null;
}

export async function releaseFieldAi(db: PoolClient, jobId: string, reason: string, dispatchedRefusal = false) {
  const changed = await db.query(`update field.ai_entitlements set state='released',reason=$2,completed_at=clock_timestamp()
    where job_id=$1 and (state='reserved' or ($3 and state='dispatched')) returning job_id`, [jobId, reason, dispatchedRefusal]);
  if (changed.rowCount) await event(db, jobId, 'released', reason);
}

export async function markFieldAiUnknown(db: PoolClient, jobId: string, reason: string) {
  const changed = await db.query(`update field.ai_entitlements set state='unknown',reason=$2
    where job_id=$1 and state='dispatched' returning job_id`, [jobId, reason]);
  if (changed.rowCount) await event(db, jobId, 'unknown', reason);
}

export async function dispatchFieldAi(db: PoolClient, organizationId: string, jobId: string): Promise<string | null> {
  const reservationError = await reserveFieldAi(db, organizationId, jobId);
  if (reservationError) return reservationError;
  const { access, period } = await accessAndPeriod(db, organizationId);
  const reservation = (await db.query<Reservation>('select * from field.ai_entitlements where job_id=$1 for update', [jobId])).rows[0];
  if (!access.canStartNew) {
    await releaseFieldAi(db, jobId, 'subscription_access_ended');
    return 'paid_subscription_required';
  }
  if (reservation && reservation.period_id !== (period?.id ?? null)) {
    await releaseFieldAi(db, jobId, 'billing_period_changed');
    return 'ai_period_changed';
  }
  if (reservation) {
    await db.query("update field.ai_entitlements set state='dispatched',dispatched_at=clock_timestamp() where job_id=$1 and state='reserved'", [jobId]);
    await event(db, jobId, 'dispatched');
  }
  return null;
}

export async function consumeFieldAi(db: PoolClient, jobId: string, response: { responseId: string; inputTokens: number; outputTokens: number }) {
  const reservation = (await db.query<Reservation>('select * from field.ai_entitlements where job_id=$1 for update', [jobId])).rows[0];
  if (!reservation) return;
  if (reservation.state === 'consumed') {
    if (reservation.provider_response_id !== response.responseId || reservation.input_tokens !== response.inputTokens
        || reservation.output_tokens !== response.outputTokens) throw new Error('ai_usage_evidence_conflict');
    return;
  }
  if (reservation.state !== 'dispatched' && reservation.state !== 'unknown') throw new Error('ai_usage_not_dispatched');
  await db.query(`update field.ai_entitlements set state='consumed',completed_at=clock_timestamp(),
    provider_response_id=$2,input_tokens=$3,output_tokens=$4,reason=null where job_id=$1`,
    [jobId, response.responseId, response.inputTokens, response.outputTokens]);
  await event(db, jobId, 'consumed');
}

export async function fieldAiCanExpose(db: PoolClient, organizationId: string, jobId: string): Promise<boolean> {
  const { access, period } = await accessAndPeriod(db, organizationId);
  if (!access.canStartNew) return false;
  const reservation = (await db.query<Reservation>('select * from field.ai_entitlements where job_id=$1', [jobId])).rows[0];
  return !reservation || reservation.state === 'consumed' && (reservation.period_id === null || reservation.period_id === period?.id);
}

export function fieldProviderDefinitelyRefused(error: unknown) {
  return error instanceof Error && /^provider_http_(400|401|403|404|422|429)$/.test(error.message);
}
