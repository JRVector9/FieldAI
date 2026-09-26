import type { FastifyInstance } from 'fastify';
import type { BusinessRuntime } from './business.js';
import { aiEntitlement } from './ai-entitlement.js';

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

export function registerAgentUsageRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get('/v1/usage/summary', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const header = request.headers['x-organization-id'];
    if (header !== undefined && (typeof header !== 'string' || !uuid.test(header)))
      return reply.code(400).send({ error: 'invalid_organization_id' });
    const member = await runtime.pool.query<{ organization_id: string }>(
      `select organization_id from ap.memberships
       where user_id = $1 and ($2::uuid is null or organization_id = $2::uuid)
       order by created_at limit 1`, [userId, header ?? null]);
    const organizationId = member.rows[0]?.organization_id;
    if (!organizationId) return reply.code(404).send({ error: 'organization_not_found' });
    const period = currentUtcMonth();
    const [ai, work] = await Promise.all([
      runtime.pool.query<{ customer_answers: string; owner_tests: string; recorded_calls: string;
        input_tokens: string; output_tokens: string; customer_input_tokens: string;
        customer_output_tokens: string; owner_input_tokens: string; owner_output_tokens: string }>(
        `select count(*) filter(where l.lane='customer_message' and r.status='completed')::text customer_answers,
         count(*) filter(where l.lane='owner_test' and r.status='completed')::text owner_tests,
         count(*) filter(where l.state='consumed')::text recorded_calls,
         coalesce(sum(l.input_tokens) filter(where l.state='consumed'),0)::text input_tokens,
         coalesce(sum(l.output_tokens) filter(where l.state='consumed'),0)::text output_tokens,
         coalesce(sum(l.input_tokens) filter(where l.state='consumed' and l.lane='customer_message'),0)::text customer_input_tokens,
         coalesce(sum(l.output_tokens) filter(where l.state='consumed' and l.lane='customer_message'),0)::text customer_output_tokens,
         coalesce(sum(l.input_tokens) filter(where l.state='consumed' and l.lane='owner_test'),0)::text owner_input_tokens,
         coalesce(sum(l.output_tokens) filter(where l.state='consumed' and l.lane='owner_test'),0)::text owner_output_tokens
         from ap.ai_usage_ledger l left join ap.ai_runs r on r.id=l.run_id
         where l.organization_id=$1 and l.reserved_at>=$2 and l.reserved_at<$3`,
        [organizationId, period.start, period.end]),
      runtime.pool.query<{ inquiries: string; accepted_field_requests: string;
        unknown_field_requests: string }>(
        `select
           (select count(*) from ap.inquiries where organization_id = $1 and mode = 'human'
             and created_at >= $2 and created_at < $3)::text as inquiries,
           (select count(*) from ap.field_action_requests where organization_id = $1
             and state = 'accepted_external' and created_at >= $2 and created_at < $3)::text
             as accepted_field_requests,
           (select count(*) from ap.field_action_requests where organization_id = $1
             and state = 'delivery_unknown' and created_at >= $2 and created_at < $3)::text
             as unknown_field_requests`, [organizationId, period.start, period.end]),
    ]);
    const entitlement=await aiEntitlement(runtime.pool,organizationId);
    const testLimit=runtime.testDailyLimit??Number(process.env.AP_TEST_DAILY_LIMIT??20);
    const model = ai.rows[0]!;
    const operations = work.rows[0]!;
    reply.header('Cache-Control', 'private, no-store');
    return { product: 'agent', organizationId, period,
      entitlement:{unitPolicy:'model_call_v1',overage:'blocked_without_explicit_purchase',mode:entitlement.access.mode,periodId:entitlement.periodId,endsAt:entitlement.access.endsAt,graceEndsAt:entitlement.access.graceEndsAt,customer:entitlement.customer,ownerTest:{budgetPolicy:'rolling_24h',dailyLimit:Number.isSafeInteger(testLimit)&&testLimit>0&&testLimit<=1000?testLimit:null,separateFromCustomer:true}},
      ai: { customerAnswers: count(model.customer_answers), ownerTests: count(model.owner_tests),
        recordedCalls: count(model.recorded_calls), inputTokens: count(model.input_tokens),
        outputTokens: count(model.output_tokens),
        customerInputTokens: count(model.customer_input_tokens),
        customerOutputTokens: count(model.customer_output_tokens),
        ownerInputTokens: count(model.owner_input_tokens),
        ownerOutputTokens: count(model.owner_output_tokens) },
      work: { inquiries: count(operations.inquiries),
        acceptedFieldRequests: count(operations.accepted_field_requests),
        unknownFieldRequests: count(operations.unknown_field_requests) } };
  });
}
