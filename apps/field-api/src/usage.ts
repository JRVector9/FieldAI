import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { fieldAiEntitlement } from './ai-entitlement.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const count = (value: string) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('usage_count_out_of_range');
  return result;
};

function currentUtcMonth() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function registerFieldUsageRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get('/v1/usage/summary', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const header = request.headers['x-organization-id'];
    if (header !== undefined && (typeof header !== 'string' || !uuid.test(header)))
      return reply.code(400).send({ error: 'invalid_organization_id' });
    const member = await runtime.pool.query<{ organization_id: string }>(
      `select organization_id from field.memberships
       where user_id = $1 and ($2::uuid is null or organization_id = $2::uuid)
       order by created_at limit 1`, [userId, header ?? null]);
    const organizationId = member.rows[0]?.organization_id;
    if (!organizationId) return reply.code(404).send({ error: 'organization_not_found' });
    const period = currentUtcMonth();
    const [siteAi, work] = await Promise.all([
      runtime.pool.query<{ job_requests: string; recorded_calls: string;
        input_tokens: string; output_tokens: string }>(
        `select count(*)::text as job_requests,
           count(*) filter (where provider_response_id is not null and input_tokens is not null
             and output_tokens is not null)::text as recorded_calls,
           coalesce(sum(input_tokens) filter (where provider_response_id is not null
             and input_tokens is not null and output_tokens is not null), 0)::text as input_tokens,
           coalesce(sum(output_tokens) filter (where provider_response_id is not null
             and input_tokens is not null and output_tokens is not null), 0)::text as output_tokens
         from (
           select e.reserved_at as created_at,e.provider_response_id,e.input_tokens,e.output_tokens
             from field.ai_entitlements e where e.organization_id=$1
           union all
           select j.created_at,j.provider_response_id,j.input_tokens,j.output_tokens
             from field.site_generation_jobs j where j.organization_id=$1
               and not exists(select 1 from field.ai_entitlements e where e.job_id=j.id)
         ) model_usage where created_at >= $2 and created_at < $3`,
        [organizationId, period.start, period.end]),
      runtime.pool.query<{ direct_inquiries: string; public_reservations: string; reservation_messages: string;
        manual_reservations: string; external_reservations: string }>(
        `select
           (select count(*) from field.inquiries where organization_id = $1 and is_test = false
             and created_at >= $2 and created_at < $3)::text as direct_inquiries,
           (select count(*) from field.reservations where organization_id = $1
             and source = 'public' and created_at >= $2 and created_at < $3)::text as public_reservations,
           (select count(*) from field.reservation_messages m
             join field.reservations r on r.id = m.reservation_id
             where m.organization_id = $1 and r.source = 'public'
               and m.created_at >= $2 and m.created_at < $3)::text as reservation_messages,
           (select count(*) from field.reservations where organization_id = $1
             and source = 'owner_manual' and created_at >= $2 and created_at < $3)::text as manual_reservations,
           (select count(*) from field.reservations where organization_id = $1
             and source = 'external_ap' and created_at >= $2 and created_at < $3)::text as external_reservations`,
        [organizationId, period.start, period.end]),
    ]);
    const model = siteAi.rows[0]!;
    const operations = work.rows[0]!;
    reply.header('Cache-Control', 'private, no-store');
    return { product: 'field', organizationId, period, entitlement: await fieldAiEntitlement(runtime.pool, organizationId),
      siteAi: { jobRequests: count(model.job_requests), recordedCalls: count(model.recorded_calls),
        inputTokens: count(model.input_tokens), outputTokens: count(model.output_tokens) },
      work: { directInquiries: count(operations.direct_inquiries),
        publicReservations: count(operations.public_reservations),
        reservationMessages: count(operations.reservation_messages),
        manualReservations: count(operations.manual_reservations),
        externalReservations: count(operations.external_reservations) } };
  });
}
