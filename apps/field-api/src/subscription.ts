import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Trial = { id: string; consent_version: string; started_at: Date; ends_at: Date;
  cancel_requested_at: Date | null };

function result(organizationId: string, trial: Trial | undefined, mock: boolean, canManage: boolean) {
  const active = trial && trial.ends_at.getTime() > Date.now();
  return { product: 'field', organizationId, canManage, mode: mock ? 'mock_trial' : 'unavailable',
    state: !mock ? 'unavailable' : !trial ? 'not_started' : active ? 'trialing' : 'trial_ended',
    trial: mock && trial ? { id: trial.id, consentVersion: trial.consent_version,
      startedAt: trial.started_at.toISOString(), endsAt: trial.ends_at.toISOString(),
      cancelRequestedAt: trial.cancel_requested_at?.toISOString() ?? null } : null,
    paidCheckout: { state: 'blocked_integration' } };
}

export function registerFieldSubscriptionRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  async function organizationFor(request: FastifyRequest, reply: FastifyReply, owner: boolean) {
    reply.header('Cache-Control', 'private, no-store');
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) { reply.code(401).send({ error: 'authentication_required' }); return null; }
    const header = request.headers['x-organization-id'];
    if (header !== undefined && (typeof header !== 'string' || !uuid.test(header))) {
      reply.code(400).send({ error: 'invalid_organization_id' }); return null;
    }
    const member = await runtime.pool.query<{ organization_id: string; role: string }>(
      `select organization_id,role from field.memberships where user_id=$1
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
       from field.trial_subscriptions where organization_id=$1`, [organizationId]);
    return row.rows[0];
  }

  app.get('/v1/subscription', async (request, reply) => {
    const member = await organizationFor(request, reply, false);
    if (!member) return reply;
    return result(member.organizationId, await getTrial(member.organizationId),
      process.env.FIELD_PROFILE === 'mock', member.canManage);
  });

  app.post('/v1/subscription/trial', async (request, reply) => {
    const member = await organizationFor(request, reply, true);
    if (!member) return reply;
    if (process.env.FIELD_PROFILE !== 'mock')
      return reply.code(503).send({ error: 'trial_policy_not_approved', state: 'blocked_integration' });
    const body = request.body as Record<string, unknown> | null;
    if (!body || body.consentVersion !== 'mock-trial-v1' || body.termsAccepted !== true)
      return reply.code(400).send({ error: 'explicit_trial_consent_required' });
    const inserted = await runtime.pool.query(
      `insert into field.trial_subscriptions(id,organization_id,consent_version,started_by,ends_at)
       values ($1,$2,$3,$4,now()+interval '14 days') on conflict (organization_id) do nothing returning id`,
      [randomUUID(), member.organizationId, body.consentVersion, member.userId]);
    return reply.code(inserted.rowCount ? 201 : 200)
      .send(result(member.organizationId, await getTrial(member.organizationId), true, true));
  });

  app.post('/v1/subscription/cancel', async (request, reply) => {
    const member = await organizationFor(request, reply, true);
    if (!member) return reply;
    if (process.env.FIELD_PROFILE !== 'mock')
      return reply.code(503).send({ error: 'trial_policy_not_approved', state: 'blocked_integration' });
    const updated = await runtime.pool.query(
      `update field.trial_subscriptions set cancel_requested_at=coalesce(cancel_requested_at,now()),
         cancel_requested_by=coalesce(cancel_requested_by,$2)
       where organization_id=$1 and ends_at>now() returning id`,
      [member.organizationId, member.userId]);
    if (!updated.rowCount) return reply.code(409).send({ error: 'active_trial_not_found' });
    return result(member.organizationId, await getTrial(member.organizationId), true, true);
  });

}
