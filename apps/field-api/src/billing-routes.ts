import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
// Non-mock administration stays blocked until real admin MFA is connected (QA157).
import { retentionAdminFor as adminFor } from './retention-routes.js';
import { billingSnapshot, planView, type BillingPlan } from './billing.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number, min = 1) => typeof value === 'string' && value.trim().length >= min && value.length <= max ? value.trim() : null;
const integer = (value: unknown, min: number, max: number) => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;

async function memberFor(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime, owner = false) {
  reply.headers({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
  const user = await runtime.resolveUserId(request.headers);
  if (!user) { reply.code(401).send({ error: 'authentication_required' }); return null; }
  const org = request.headers['x-organization-id'];
  if (org !== undefined && (typeof org !== 'string' || !uuid.test(org))) {
    reply.code(400).send({ error: 'invalid_organization_id' }); return null;
  }
  const row = (await runtime.pool.query<{ organization_id: string; role: string }>(
    `select organization_id,role from field.memberships where user_id=$1 and ($2::uuid is null or organization_id=$2)
     and (not $3::boolean or role='owner') order by created_at limit 1`, [user, org ?? null, owner])).rows[0];
  if (!row) { reply.code(404).send({ error: 'organization_not_found' }); return null; }
  return { userId: user, organizationId: row.organization_id, canManage: row.role === 'owner' };
}

async function replay(db: PoolClient, actor: string, key: string, requestHash: string) {
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`field-billing:${actor}:${key}`]);
  const old = (await db.query<{ request_hash: string; result: unknown }>(
    'select request_hash,result from field.billing_requests where actor_user_id=$1 and key_hash=$2', [actor, key])).rows[0];
  return old ? { conflict: old.request_hash !== requestHash, value: old.result } : null;
}
async function record(db: PoolClient, actor: string, key: string, requestHash: string, result: unknown,
  planId: string, event: string, reason: string) {
  await db.query('insert into field.billing_requests(actor_user_id,key_hash,request_hash,result) values($1,$2,$3,$4::jsonb)',
    [actor, key, requestHash, JSON.stringify(result)]);
  await db.query('insert into field.billing_events(plan_id,actor_user_id,event_type,payload) values($1,$2,$3,$4::jsonb)',
    [planId, actor, event, JSON.stringify({ reason })]);
}

export function registerFieldBillingRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get('/v1/subscription/plans', async (request, reply) => {
    if (!await memberFor(request, reply, runtime)) return reply;
    const mode = ['mock','sandbox'].includes(process.env.FIELD_PROFILE ?? '') ? 'test' : 'live';
    const plans = await runtime.pool.query<BillingPlan>(
      'select * from field.billing_plans where mode=$1 and approved_at is not null and retired_at is null order by created_at desc,id desc', [mode]);
    return { product: 'field', plans: plans.rows.map(planView) };
  });
  app.get('/v1/subscription/billing', async (request, reply) => {
    const member = await memberFor(request, reply, runtime); if (!member) return reply;
    return { ...await billingSnapshot(runtime.pool, member.organizationId), canManage: member.canManage };
  });
  app.get('/v1/admin/billing/plans', async (request, reply) => {
    if (!await adminFor(request, reply, runtime, false)) return reply;
    return { product: 'field', plans: (await runtime.pool.query<BillingPlan>(
      'select * from field.billing_plans order by created_at desc,id desc limit 100')).rows.map(planView) };
  });
  app.post('/v1/admin/billing/plans', async (request, reply) => {
    const actor = await adminFor(request, reply, runtime); if (!actor) return reply;
    const b = object(request.body), name = text(b.name, 100), termsVersion = text(b.termsVersion, 100), termsText = text(b.termsText, 8000, 10),
      refundVersion = text(b.refundVersion, 100), refundText = text(b.refundText, 8000, 10), reference = text(b.reference, 160);
    const rawKey = request.headers['idempotency-key'];
    if (typeof rawKey !== 'string' || !uuid.test(rawKey) || !name || !termsVersion || !termsText || !refundVersion || !refundText || !reference
      || !['test','live'].includes(String(b.mode)) || !integer(b.totalAmount, 1, 1000000000) || !integer(b.supplyAmount, 0, 1000000000)
      || !integer(b.vatAmount, 0, 1000000000) || Number(b.totalAmount) !== Number(b.supplyAmount) + Number(b.vatAmount)
      || b.taxFreeAmount !== undefined && (!integer(b.taxFreeAmount,0,Number(b.totalAmount)) || Number(b.vatAmount)!==Math.round((Number(b.totalAmount)-Number(b.taxFreeAmount))/11))
      || !integer(b.graceDays, 0, 30) || !integer(b.includedAiUnits, 1, 10000000))
      return reply.code(400).send({ error: 'invalid_billing_plan' });
    const key = hash(rawKey), requestHash = hash(JSON.stringify(['plan', b.mode, name, b.totalAmount, b.supplyAmount, b.vatAmount,
      b.includedAiUnits, b.graceDays, termsVersion, termsText, refundVersion, refundText, reference, ...(b.taxFreeAmount === undefined ? [] : [b.taxFreeAmount])])), db = await runtime.pool.connect();
    try {
      await db.query('begin'); const old = await replay(db, actor, key, requestHash);
      if (old) { await db.query('commit'); return reply.code(old.conflict ? 409 : 200).send(old.conflict ? { error: 'idempotency_conflict' } : old.value); }
      const id = randomUUID();
      await db.query(`insert into field.billing_plans(id,mode,name,total_amount,supply_amount,vat_amount,included_ai_units,grace_days,
        terms_version,terms_text,refund_version,refund_text,reference,requested_by,tax_free_amount) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [id, b.mode, name, b.totalAmount, b.supplyAmount, b.vatAmount, b.includedAiUnits, b.graceDays, termsVersion, termsText, refundVersion, refundText, reference, actor, b.taxFreeAmount ?? null]);
      await record(db, actor, key, requestHash, { id }, id, 'plan_requested', reference);
      await db.query('commit'); return reply.code(201).send({ id });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
  for (const action of ['approve','retire'] as const) app.post<{ Params: { id: string } }>(`/v1/admin/billing/plans/:id/${action}`, async (request, reply) => {
    const actor = await adminFor(request, reply, runtime); if (!actor) return reply;
    const id = request.params.id, rawKey = request.headers['idempotency-key'], reason = text(object(request.body).reason, 500, 10);
    if (!uuid.test(id) || typeof rawKey !== 'string' || !uuid.test(rawKey) || !reason)
      return reply.code(400).send({ error: 'invalid_billing_plan_action' });
    const key = hash(rawKey), requestHash = hash(JSON.stringify([action, id, reason])), db = await runtime.pool.connect();
    try {
      await db.query('begin'); const old = await replay(db, actor, key, requestHash);
      if (old) { await db.query('commit'); return reply.code(old.conflict ? 409 : 200).send(old.conflict ? { error: 'idempotency_conflict' } : old.value); }
      const plan = (await db.query<BillingPlan>('select * from field.billing_plans where id=$1 for update', [id])).rows[0];
      if (!plan) { await db.query('rollback'); return reply.code(404).send({ error: 'plan_not_found' }); }
      if (action === 'approve' && plan.requested_by === actor) { await db.query('rollback'); return reply.code(403).send({ error: 'different_approver_required' }); }
      if (action === 'approve' && plan.mode === 'live') {
        await db.query('rollback'); return reply.code(503).send({ error: 'live_price_approval_not_configured', state: 'blocked_integration' });
      }
      if (action === 'approve' && (plan.approved_at || plan.retired_at) || action === 'retire' && plan.retired_at) {
        await db.query('rollback'); return reply.code(409).send({ error: 'plan_state_changed' });
      }
      const updated = (await db.query<BillingPlan>(action === 'approve'
        ? 'update field.billing_plans set approved_by=$2,approved_at=now() where id=$1 returning *'
        : 'update field.billing_plans set retired_at=now() where id=$1 returning *', action === 'approve' ? [id, actor] : [id])).rows[0]!;
      const value = planView(updated); await record(db, actor, key, requestHash, value, id, `plan_${action}`, reason);
      await db.query('commit'); return value;
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
