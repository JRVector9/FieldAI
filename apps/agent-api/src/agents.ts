import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';
import { rejectExpiredTrial } from './trial-access.js';
import type { AgentFact, AgentModelOutput } from './openai.js';
import { confirmedConnectorFacts, guardedConnectorAnswer } from './connector-facts-live.js';
export { approvedConnectorFacts } from './connector-facts-live.js';

export type AgentConfig = { name: string; tone: 'clear' | 'warm' | 'formal'; guideScope: string; handoffText: string };
export type Knowledge = {
  businessName: string; introduction: string;
  region?: string; openingHours?: string;
  services: { name: string; description: string }[];
  faqs: { question: string; answer: string }[];
};
type AgentRelease = { id: string; agent_id: string; revision: number; content: AgentConfig;
  draft_revision: number; knowledge_release_id: string; knowledge_revision: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const obj = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, max: number, required = false): value is string =>
  typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
const revision = (value: unknown): number | null => {
  const found = obj(value)?.expectedRevision;
  return typeof found === 'number' && Number.isSafeInteger(found) && found >= 0 ? found : null;
};
function configFrom(value: unknown): AgentConfig | null {
  const body = obj(value);
  if (!body || !text(body.name, 80, true) || !['clear', 'warm', 'formal'].includes(body.tone as string)
      || !text(body.guideScope, 1000) || !text(body.handoffText, 500, true)) return null;
  return { name: body.name.trim(), tone: body.tone as AgentConfig['tone'],
    guideScope: body.guideScope.trim(), handoffText: body.handoffText.trim() };
}
async function organizationFor(request: FastifyRequest, reply: FastifyReply, runtime: BusinessRuntime,
  permission: 'read' | 'edit' | 'approve') {
  const userId = await runtime.resolveUserId(request.headers);
  if (!userId) { reply.code(401).send({ error: 'authentication_required' }); return null; }
  const header = request.headers['x-organization-id'];
  if (header !== undefined && (typeof header !== 'string' || !uuid.test(header))) {
    reply.code(400).send({ error: 'invalid_organization_id' }); return null;
  }
  const found = await runtime.pool.query<{ organization_id: string }>(
    `select organization_id from ap.memberships where user_id = $1
       and ($2::uuid is null or organization_id = $2::uuid)
       and ($3::text = 'read' or ($3::text = 'edit' and role in ('owner', 'editor')) or role = 'owner')
     order by created_at limit 1`, [userId, header ?? null, permission],
  );
  const id = found.rows[0]?.organization_id;
  if (!id) { reply.code(404).send({ error: 'organization_not_found' }); return null; }
  return { id, userId };
}
export function factsFor(knowledge: Knowledge, sourceFacts: AgentFact[] = []): AgentFact[] {
  return [
    { id: 'business', text: `상호: ${knowledge.businessName}. 소개: ${knowledge.introduction}` },
    ...(knowledge.region?.trim() ? [{ id: 'region', text: `활동 지역: ${knowledge.region}` }] : []),
    ...(knowledge.openingHours?.trim() ? [{ id: 'opening_hours', text: `영업시간: ${knowledge.openingHours}` }] : []),
    ...knowledge.services.map((item, index) => ({ id: `service:${index}`, text: `서비스: ${item.name}. ${item.description}` })),
    ...knowledge.faqs.map((item, index) => ({ id: `faq:${index}`, text: `질문: ${item.question}. 승인 답변: ${item.answer}` })),
    ...sourceFacts,
  ];
}
export function outputFrom(value: unknown): AgentModelOutput | null {
  const body = obj(value);
  if (!body || !text(body.answer, 3000) || !Array.isArray(body.evidenceIds)
      || body.evidenceIds.length > 20 || body.evidenceIds.some(item => !text(item, 80, true))
      || !Array.isArray(body.unknowns) || body.unknowns.length > 10
      || body.unknowns.some(item => !text(item, 300, true))
      || typeof body.handoffRecommended !== 'boolean') return null;
  return { answer: body.answer.trim(), evidenceIds: body.evidenceIds as string[],
    unknowns: body.unknowns as string[], handoffRecommended: body.handoffRecommended };
}
export function unsupportedNumber(answer: string, facts: AgentFact[]): boolean {
  const approved = new Set(facts.flatMap(fact => (fact.text.match(/\d[\d,.]*/g) ?? [])
    .map(item => item.replace(/[^\d]/g, ''))));
  return (answer.match(/\d[\d,.]*/g) ?? []).some(item => !approved.has(item.replace(/[^\d]/g, '')));
}
async function outbox(client: PoolClient, organizationId: string, eventType: string, id: string, payload: unknown) {
  await client.query('insert into ap.outbox(id, organization_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
    [randomUUID(), organizationId, eventType, id, JSON.stringify(payload)]);
}
async function latestAgentRelease(runtime: BusinessRuntime, organizationId: string) {
  const found = await runtime.pool.query<AgentRelease>(
    'select id, agent_id, revision, draft_revision, content, knowledge_release_id, knowledge_revision from ap.agent_releases where organization_id = $1 order by revision desc limit 1',
    [organizationId]);
  return found.rows[0] ?? null;
}

export function registerAgentRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get('/v1/agents/draft', async (request, reply) => {
    const organization = await organizationFor(request, reply, runtime, 'read');
    if (!organization) return reply;
    const found = await runtime.pool.query<{ agent_id: string; revision: number; content: AgentConfig }>(
      'select agent_id, revision, content from ap.agent_drafts where organization_id = $1', [organization.id]);
    if (!found.rows[0]) return reply.code(404).send({ error: 'agent_draft_not_found' });
    return { organizationId: organization.id, agentId: found.rows[0].agent_id,
      revision: found.rows[0].revision, ...found.rows[0].content };
  });

  app.put('/v1/agents/draft', async (request, reply) => {
    const organization = await organizationFor(request, reply, runtime, 'edit');
    if (!organization) return reply;
    const expected = revision(request.body);
    const config = configFrom(request.body);
    if (expected === null || !config) return reply.code(400).send({ error: 'invalid_agent_draft' });
    const saved = await runtime.pool.query<{ agent_id: string; revision: number }>(
      `update ap.agent_drafts set revision = revision + 1, content = $3::jsonb,
         updated_by = $4, updated_at = now() where organization_id = $1 and revision = $2
       returning agent_id, revision`,
      [organization.id, expected, JSON.stringify(config), organization.userId],
    );
    if (!saved.rows[0]) return reply.code(409).send({ error: 'revision_conflict' });
    return { organizationId: organization.id, agentId: saved.rows[0].agent_id,
      revision: saved.rows[0].revision, ...config };
  });

  app.get('/v1/agents/releases/latest', async (request, reply) => {
    const organization = await organizationFor(request, reply, runtime, 'read');
    if (!organization) return reply;
    const release = await latestAgentRelease(runtime, organization.id);
    if (!release) return reply.code(404).send({ error: 'agent_not_active' });
    return { releaseId: release.id, agentId: release.agent_id, revision: release.revision,
      draftRevision: release.draft_revision,
      knowledgeRevision: release.knowledge_revision, ...release.content };
  });

  app.post('/v1/agents/releases', async (request, reply) => {
    const organization = await organizationFor(request, reply, runtime, 'approve');
    if (!organization) return reply;
    const expected = revision(request.body);
    const knowledgeRevision = obj(request.body)?.expectedKnowledgeRevision;
    if (expected === null || typeof knowledgeRevision !== 'number' || !Number.isSafeInteger(knowledgeRevision)
        || knowledgeRevision < 1) return reply.code(400).send({ error: 'invalid_release_request' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const draft = await client.query<{ agent_id: string; revision: number; content: AgentConfig }>(
        'select agent_id, revision, content from ap.agent_drafts where organization_id = $1 for update', [organization.id]);
      if (!draft.rows[0] || draft.rows[0].revision !== expected || expected === 0) {
        await client.query('rollback'); return reply.code(409).send({ error: 'revision_conflict' });
      }
      const knowledge = await client.query<{ id: string; revision: number }>(
        'select id, revision from ap.knowledge_releases where organization_id = $1 order by revision desc limit 1', [organization.id]);
      if (!knowledge.rows[0] || knowledge.rows[0].revision !== knowledgeRevision) {
        await client.query('rollback'); return reply.code(409).send({ error: 'knowledge_stale' });
      }
      const existing = await client.query<{ id: string; revision: number; draft_revision: number; knowledge_revision: number }>(
        'select id, revision, draft_revision, knowledge_revision from ap.agent_releases where organization_id = $1 order by revision desc limit 1',
        [organization.id]);
      if (existing.rows[0]?.draft_revision === expected
          && existing.rows[0].knowledge_revision === knowledgeRevision) {
        await client.query('commit');
        return reply.code(200).send({ releaseId: existing.rows[0].id,
          revision: existing.rows[0].revision, draftRevision: expected,
          knowledgeRevision: existing.rows[0].knowledge_revision });
      }
      if (await rejectExpiredTrial(reply, client, organization.id)) {
        await client.query('rollback'); return reply;
      }
      const id = randomUUID();
      const releaseRevision = (existing.rows[0]?.revision ?? 0) + 1;
      const content = JSON.stringify(draft.rows[0].content);
      await client.query(
        `insert into ap.agent_releases (id, organization_id, agent_id, revision, draft_revision, content, content_hash,
          knowledge_release_id, knowledge_revision, approved_by)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)`,
        [id, organization.id, draft.rows[0].agent_id, releaseRevision, expected, content,
          createHash('sha256').update(content).digest('hex'), knowledge.rows[0].id,
          knowledgeRevision, organization.userId],
      );
      await outbox(client, organization.id, 'agent.approved', id,
        { agentId: draft.rows[0].agent_id, releaseId: id, knowledgeRevision });
      await client.query('commit');
      return reply.code(201).send({ releaseId: id, revision: releaseRevision,
        draftRevision: expected, knowledgeRevision });
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.post('/v1/agents/test', async (request, reply) => {
    const organization = await organizationFor(request, reply, runtime, 'approve');
    if (!organization) return reply;
    const question = obj(request.body)?.question;
    if (!text(question, 1000, true) || /(?:\+?\d[\d\s-]{8,}\d|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i.test(question))
      return reply.code(400).send({ error: 'invalid_test_question' });
    const release = await latestAgentRelease(runtime, organization.id);
    if (!release) return reply.code(409).send({ error: 'agent_not_active' });
    const knowledge = await runtime.pool.query<{ id: string; revision: number; content: Knowledge }>(
      'select id, revision, content from ap.knowledge_releases where organization_id = $1 order by revision desc limit 1',
      [organization.id]);
    if (!knowledge.rows[0] || knowledge.rows[0].id !== release.knowledge_release_id)
      return reply.code(409).send({ error: 'knowledge_stale' });
    if (!runtime.modelProvider) return reply.code(503).send({ error: 'blocked_integration' });
    const limit = runtime.testDailyLimit ?? Number(process.env.AP_TEST_DAILY_LIMIT ?? 20);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) return reply.code(503).send({ error: 'test_budget_not_configured' });
    const runId = randomUUID();
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      await client.query('select id from ap.organizations where id = $1 for update', [organization.id]);
      if (await rejectExpiredTrial(reply, client, organization.id)) {
        await client.query('rollback'); return reply;
      }
      const usage = await client.query<{ count: string }>(
        `select count(*) from ap.ai_runs where organization_id = $1 and kind = 'owner_test'
         and started_at >= now() - interval '24 hours'`, [organization.id]);
      if (Number(usage.rows[0]!.count) >= limit) {
        await client.query('rollback'); return reply.code(429).send({ error: 'test_daily_limit' });
      }
      await client.query(
        `insert into ap.ai_runs(id, organization_id, agent_release_id, knowledge_release_id,
          kind, question, status, provider_model)
         values ($1, $2, $3, $4, 'owner_test', $5, 'in_progress', $6)`,
        [runId, organization.id, release.id, release.knowledge_release_id,
          question.trim(), runtime.modelProvider.model],
      );
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
    const connector = await confirmedConnectorFacts(runtime, knowledge.rows[0].id);
    const facts = factsFor(knowledge.rows[0].content, connector.facts);
    let generated;
    try {
      generated = await runtime.modelProvider.generate({ question: question.trim(), facts,
        agent: release.content, maxOutputTokens: 768 });
    } catch {
      await runtime.pool.query(
        `update ap.ai_runs set status = 'failed', error_code = 'provider_unavailable', finished_at = now()
         where id = $1`, [runId]);
      return reply.code(503).send({ error: 'provider_unavailable', runId });
    }
    const output = outputFrom(generated.output);
    const supported = new Set(facts.map(fact => fact.id));
    const evidence = output?.evidenceIds ?? [];
    const error = !output || !Number.isSafeInteger(generated.inputTokens)
        || !Number.isSafeInteger(generated.outputTokens) || generated.inputTokens < 0
        || generated.outputTokens < 0 || !text(generated.responseId, 200, true)
      ? 'invalid_model_output'
      : evidence.some(id => !supported.has(id)) || (output.answer && evidence.length === 0)
        ? 'unsupported_evidence'
        : output.answer && unsupportedNumber(output.answer, facts.filter(fact => evidence.includes(fact.id)))
          ? 'unsupported_number' : null;
    if (error) {
      await runtime.pool.query(
        `update ap.ai_runs set status = 'rejected', error_code = $2,
          provider_response_id = $3, input_tokens = $4, output_tokens = $5, finished_at = now()
         where id = $1`, [runId, error, generated.responseId, generated.inputTokens, generated.outputTokens]);
      return reply.code(422).send({ error, runId });
    }
    const afterGeneration = evidence.some(id => id.startsWith('field:'))
      ? await confirmedConnectorFacts(runtime, knowledge.rows[0].id) : undefined;
    const accepted = guardedConnectorAnswer(output!, connector, afterGeneration);
    const result = { answer: accepted.answer, evidenceIds: accepted.evidenceIds,
      unknowns: accepted.unknowns, handoffRecommended: accepted.handoffRecommended
        || accepted.unknowns.length > 0 || accepted.answer.length === 0 };
    const committed = await runtime.pool.connect();
    try {
      await committed.query('begin');
      await committed.query(
        `update ap.ai_runs set status = 'completed', answer = $2::jsonb,
          provider_response_id = $3, input_tokens = $4, output_tokens = $5, finished_at = now()
         where id = $1`, [runId, JSON.stringify(result), generated.responseId,
          generated.inputTokens, generated.outputTokens]);
      await outbox(committed, organization.id, 'agent.test.completed', runId,
        { runId, agentReleaseId: release.id, knowledgeRevision: release.knowledge_revision });
      await committed.query('commit');
    } catch (error) { await committed.query('rollback'); throw error; } finally { committed.release(); }
    return reply.header('Cache-Control', 'no-store').send({ runId, ...result,
      agentRevision: release.revision, knowledgeRevision: release.knowledge_revision,
      usage: { inputTokens: generated.inputTokens, outputTokens: generated.outputTokens } });
  });
}
