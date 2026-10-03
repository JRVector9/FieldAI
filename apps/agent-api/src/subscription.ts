import { subscriptionAccess } from './subscription-access.js';
import { rejectDeletionScheduled, trialPolicy } from './trial-access.js';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { BusinessRuntime } from './business.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Trial = { id: string; consent_version: string; started_at: Date; ends_at: Date;
  cancel_requested_at: Date | null };

// 체험 행은 승인된 정책으로만 생성되므로 프로필과 무관하게 행 자체를 보여 준다.
function result(organizationId: string, trial: Trial | undefined, policy: ReturnType<typeof trialPolicy>, canManage: boolean) {
  const active = trial && trial.ends_at.getTime() > Date.now();
  return { product: 'agent', organizationId, canManage,
    mode: policy.source === 'mock' ? 'mock_trial' : policy.source === 'configured' ? 'trial' : 'unavailable',
    state: !trial ? (policy.source === 'unavailable' ? 'unavailable' : 'not_started') : active ? 'trialing' : 'trial_ended',
    policy,
    trial: trial ? { id: trial.id, consentVersion: trial.consent_version,
      startedAt: trial.started_at.toISOString(), endsAt: trial.ends_at.toISOString(),
      cancelRequestedAt: trial.cancel_requested_at?.toISOString() ?? null } : null,
    paidCheckout: { state: 'blocked_integration' } };
}

export function registerAgentSubscriptionRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  async function organizationFor(request: FastifyRequest, reply: FastifyReply, owner: boolean) {
    reply.header('Cache-Control', 'private, no-store');
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) { reply.code(401).send({ error: 'authentication_required' }); return null; }
    const header = request.headers['x-organization-id'];
    if (header !== undefined && (typeof header !== 'string' || !uuid.test(header))) {
      reply.code(400).send({ error: 'invalid_organization_id' }); return null;
    }
    const member = await runtime.pool.query<{ organization_id: string; role: string }>(
      `select organization_id,role from ap.memberships where user_id=$1
       and ($2::uuid is null or organization_id=$2::uuid)
       and ($3::boolean=false or role='owner') order by created_at limit 1`,
      [userId, header ?? null, owner]);
    const organizationId = member.rows[0]?.organization_id;
    if (!organizationId) { reply.code(404).send({ error: 'organization_not_found' }); return null; }
    return { organizationId, userId, canManage: member.rows[0]!.role === 'owner' };
  }

  async function getTrial(organizationId: string) {
    const row = await runtime.pool.query<Trial>(
      `select id,consent_version,started_at,ends_at,cancel_requested_at
       from ap.trial_subscriptions where organization_id=$1`, [organizationId]);
    return row.rows[0];
  }

  app.get('/v1/subscription', async (request, reply) => {
    const member = await organizationFor(request, reply, false);
    if (!member) return reply;
    return {...result(member.organizationId, await getTrial(member.organizationId),
      trialPolicy(), member.canManage),access:await subscriptionAccess(runtime.pool,member.organizationId)};
  });

  app.post('/v1/subscription/trial', async (request, reply) => {
    const member = await organizationFor(request, reply, true);
    if (!member) return reply;
    const policy = trialPolicy();
    if (policy.source === 'unavailable')
      return reply.code(503).send({ error: 'trial_policy_not_approved', state: 'blocked_integration' });
    const body = request.body as Record<string, unknown> | null;
    if (!body || body.consentVersion !== policy.consentVersion || body.termsAccepted !== true)
      return reply.code(400).send({ error: 'explicit_trial_consent_required' });
    // 조직 삭제 유예·실행 중에는 체험을 새로 시작하지 않는다(추가). 체험은 삭제 전제 조건이 아니므로 확인과 생성 사이의
    // 경합이 삭제 실행을 막지 않는다. 그래서 별도 트랜잭션 없이 확인한 뒤 기존과 같이 한 문장으로 만든다
    if (await rejectDeletionScheduled(reply, runtime.pool, member.organizationId)) return reply;
    const inserted = (await runtime.pool.query(
      `insert into ap.trial_subscriptions(id,organization_id,consent_version,started_by,ends_at)
       values ($1,$2,$3,$4,now()+make_interval(days => $5::int)) on conflict (organization_id) do nothing returning id`,
      [randomUUID(), member.organizationId, policy.consentVersion, member.userId, policy.days])).rowCount;
    return reply.code(inserted ? 201 : 200)
      .send(result(member.organizationId, await getTrial(member.organizationId), policy, true));
  });

  app.post('/v1/subscription/cancel', async (request, reply) => {
    const member = await organizationFor(request, reply, true);
    if (!member) return reply;
    const policy = trialPolicy();
    if (policy.source === 'unavailable')
      return reply.code(503).send({ error: 'trial_policy_not_approved', state: 'blocked_integration' });
    const updated = await runtime.pool.query(
      `update ap.trial_subscriptions set cancel_requested_at=coalesce(cancel_requested_at,now()),
         cancel_requested_by=coalesce(cancel_requested_by,$2)
       where organization_id=$1 and ends_at>now() returning id`,
      [member.organizationId, member.userId]);
    if (!updated.rowCount) return reply.code(409).send({ error: 'active_trial_not_found' });
    return result(member.organizationId, await getTrial(member.organizationId), policy, true);
  });

}
