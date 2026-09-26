import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { factsFor, outputFrom, unsupportedNumber, type AgentConfig, type Knowledge } from './agents.js';
import { confirmedConnectorFacts, guardedConnectorAnswer } from './connector-facts-live.js';
import { inspectFieldFacts } from './field-connector.js';
import { consumeFieldPreflight } from './field-preflight-limit.js';
import type { BusinessRuntime } from './business.js';
import { recordInquiryEvent } from './inquiries.js';
import { consumePublicSubmission } from './public-submission-limit.js';
import { submissionAttempt } from './submission-attempt.js';
import { activePlacement } from './placements.js';
import { guardPlacementEngagement } from './placement-limit.js';
import { distributionTrafficClass, recordDistributionEvent, type DistributionTrafficClass } from './distribution-events.js';
import { rejectExpiredTrial } from './trial-access.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idempotencyKey = /^[A-Za-z0-9_-]{43}$/;
const deploymentId = /^dep_[A-Za-z0-9_-]{20,50}$/;
const contactPattern = /(?:\+?\d[\d\s()-]{7,}\d|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;
function inputText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
}
function sessionSecret(request: FastifyRequest): string | null {
  const value = /(?:^|;\s*)ap_consult_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(request.headers.cookie ?? '')?.[1];
  return value ?? null;
}
function firstPartyOrigin() {
  return process.env.AP_PUBLIC_WEB_ORIGIN ?? (process.env.AP_PROFILE === 'mock' ? 'http://localhost:3001' : null);
}
function originAllowed(request: FastifyRequest) {
  const expected = firstPartyOrigin();
  return !!expected && (request.headers.origin === expected || (process.env.AP_PROFILE === 'mock' && !request.headers.origin));
}
function cookie(value: string, maxAge: number) {
  const secure = firstPartyOrigin()?.startsWith('https:') ? '; Secure' : '';
  return `ap_consult_session=${value}; HttpOnly; SameSite=Lax; Path=/v1; Max-Age=${maxAge}${secure}`;
}
type ActiveDeployment = {
  deployment_id: string; organization_id: string; public_id: string;
  kind: 'link' | 'owned_embed' | 'placement_embed'; placement_id: string | null;
  agent_release_id: string; agent: AgentConfig;
  knowledge_release_id: string; knowledge_revision: number; knowledge: Knowledge;
};
async function activeDeployment(pool: Pool | PoolClient, publicId: string, kind?: 'link' | 'owned_embed'): Promise<ActiveDeployment | null> {
  if (!deploymentId.test(publicId)) return null;
  const result = await pool.query<ActiveDeployment>(
    `select d.id as deployment_id, d.organization_id, d.public_id, d.kind, d.placement_id,
       a.id as agent_release_id, a.content as agent,
       k.id as knowledge_release_id, k.revision as knowledge_revision, k.content as knowledge
     from ap.deployments d
     join ap.agent_releases a on a.id = d.agent_release_id
     join ap.knowledge_releases k on k.id = a.knowledge_release_id
     where d.public_id = $1 and ($2::text is null or d.kind = $2) and d.status = 'active'
       and (d.kind = 'link' or d.verified_at is not null)
       and a.id = (select id from ap.agent_releases where organization_id = d.organization_id order by revision desc limit 1)
       and k.id = (select id from ap.knowledge_releases where organization_id = d.organization_id order by revision desc limit 1)`,
    [publicId, kind ?? null],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.kind === 'placement_embed' && (!row.placement_id
      || !(await activePlacement(pool, row.placement_id)))) return null;
  return row;
}
type Conversation = {
  id: string; organization_id: string; state: string; mode: string; automation_paused: boolean;
  revision: number; next_sequence: string; knowledge_release_id: string;
  agent_release_id: string; public_id: string; placement_id: string | null;
  distribution_traffic_class: DistributionTrafficClass;
};
async function session(pool: Pool | PoolClient, request: FastifyRequest, id?: string, lock = false,
  requireActive = true): Promise<Conversation | null> {
  if (id && !uuid.test(id)) return null;
  const bearer = /^Bearer ([A-Za-z0-9_-]{40,64})$/.exec(request.headers.authorization ?? '')?.[1];
  const secret = request.headers.authorization ? null : sessionSecret(request);
  if (!bearer && !secret) return null;
  const result = await pool.query<Conversation>(bearer
    ? `select i.id, i.organization_id, i.state, i.mode, i.automation_paused, i.placement_id,
       i.distribution_traffic_class,
       i.revision, i.next_sequence, i.knowledge_release_id, i.agent_release_id, d.public_id
     from ap.embed_sessions s join ap.inquiries i on i.id = s.conversation_id
     join ap.deployments d on d.id = s.deployment_id
     where s.token_hash = $1 and s.expires_at > now() and s.transferred_at is null
       and i.deployment_id = s.deployment_id
       and d.status = 'active' and d.kind in ('owned_embed', 'placement_embed') and d.verified_at is not null
       and ($2::uuid is null or i.id = $2)
     ${lock ? 'for update of i' : ''}`
    : `select i.id, i.organization_id, i.state, i.mode, i.automation_paused, i.placement_id,
       i.distribution_traffic_class,
       i.revision, i.next_sequence, i.knowledge_release_id, i.agent_release_id, d.public_id
     from ap.inquiries i join ap.deployments d on d.id = i.deployment_id
     where i.consult_session_hash = $1 and i.consult_session_expires_at > now()
       and ($2::uuid is null or i.id = $2)
     ${lock ? 'for update of i' : ''}`,
    [hash((bearer ?? secret)!), id ?? null],
  );
  const row = result.rows[0];
  if (!row || (requireActive && (row.state !== 'ai_assisting' || row.mode !== 'ai'
      || row.automation_paused))) return null;
  if (lock && row.placement_id) await pool.query('select id from ap.placements where id = $1 for share', [row.placement_id]);
  return !requireActive || await activeDeployment(pool, row.public_id) ? row : null;
}
async function publicMessages(pool: Pool | PoolClient, id: string) {
  const result = await pool.query<{ id: string; sequence: string; actor: string; body: string; created_at: string }>(
    `select id, sequence, actor, body, created_at from ap.inquiry_messages
     where inquiry_id = $1 and visibility = 'customer' order by sequence`, [id]);
  return result.rows;
}
type CustomerAiRun = { id: string; question: string; status: 'in_progress' | 'completed' | 'failed' | 'rejected';
  answer: unknown; error_code: string | null; input_tokens: number | null; output_tokens: number | null;
  knowledge_revision: number; result_unknown: boolean };
async function customerAiRun(pool: Pool | PoolClient, inquiryId: string, keyHash: string) {
  const found = await pool.query<CustomerAiRun>(
    `select r.id, r.question, r.status, r.answer, r.error_code, r.input_tokens, r.output_tokens,
       k.revision as knowledge_revision,
       (r.status = 'in_progress' and r.started_at <= now() - interval '5 minutes') as result_unknown
     from ap.ai_runs r join ap.knowledge_releases k on k.id = r.knowledge_release_id
     where r.inquiry_id = $1 and r.kind = 'customer_message' and r.idempotency_key_hash = $2`,
    [inquiryId, keyHash]);
  return found.rows[0] ?? null;
}
function replayCustomerAiRun(reply: FastifyReply, run: CustomerAiRun, question: string) {
  reply.header('Cache-Control', 'no-store');
  if (run.question !== question) return reply.code(409).send({ error: 'idempotency_conflict' });
  if (run.status === 'in_progress')
    return reply.header('Retry-After', run.result_unknown ? '30' : '2').code(202)
      .send({ runId: run.id, state: run.result_unknown ? 'result_unknown' : run.status });
  if (run.status === 'completed')
    return reply.send({ runId: run.id, ...object(run.answer), knowledgeRevision: run.knowledge_revision,
      usage: { inputTokens: run.input_tokens, outputTokens: run.output_tokens }, replayed: true });
  const error = run.error_code ?? 'answer_failed';
  return reply.code(error === 'automation_paused_or_source_changed' ? 409
    : run.status === 'failed' ? 503 : 422).send({ error, runId: run.id, replayed: true });
}
type FieldRequestCandidate = { connection_id: string; actor_user_id: string;
  organization_id: string };
type FieldReadiness = { ready: true; connectionId: string } | {
  ready: false; reason: 'no_connection' | 'field_unavailable' | 'no_services' } | {
  ready: false; reason: 'rate_limited'; retryAfter: number };
async function fieldRequestCandidates(runtime: BusinessRuntime, pool: Pool | PoolClient,
  inquiryId: string, lock = false): Promise<FieldRequestCandidate[]> {
  const config = runtime.fieldConnector;
  if (!config) return [];
  const result = await pool.query<FieldRequestCandidate>(
    `select c.id as connection_id, s.actor_user_id, i.organization_id from ap.inquiries i
       join ap.deployments d on d.id = i.deployment_id and d.organization_id = i.organization_id
       join ap.field_connections c on c.ap_organization_id = i.organization_id
       join ap.oauth_selections s on s.id = c.ap_grant_id
       join ap.memberships m on m.organization_id = i.organization_id
         and m.user_id = s.actor_user_id and m.role = 'owner'
       where i.id = $1 and d.status = 'active' and c.status = 'review_required'
         and c.field_client_id = $2 and c.field_issuer = $3
         and c.initiator_user_id = s.actor_user_id and c.ap_agent_id = s.agent_id
         and s.organization_id = i.organization_id and s.revoked_at is null
         and s.allowed_deployment_ids @> array[i.deployment_id]
         and s.requested_scopes @> array['ap.agent.read','ap.conversations.read']
         and c.scopes @> array['field.facts.read','field.availability.read','field.requests.create']
         and exists (select 1 from "oauthConsent" oc where oc."referenceId" = s.id::text
           and oc."clientId" = s.client_id and oc."userId" = s.actor_user_id
           and oc.scopes @> '["ap.agent.read","ap.conversations.read"]'::jsonb)
         and exists (select 1 from "oauthRefreshToken" t where t."referenceId" = s.id::text
           and t."clientId" = s.client_id and t."userId" = s.actor_user_id
           and t.revoked is null and t."expiresAt" > now())
       order by c.created_at desc limit 20 ${lock ? 'for share of c' : ''}`,
    [inquiryId, config.clientId, config.issuer]);
  return result.rows;
}
async function fieldReadiness(runtime: BusinessRuntime, inquiryId: string): Promise<FieldReadiness> {
  const candidates = await fieldRequestCandidates(runtime, runtime.pool, inquiryId);
  if (!candidates.length) return { ready: false, reason: 'no_connection' };
  const retryAfter = await consumeFieldPreflight(runtime.pool, candidates[0]!.organization_id);
  if (retryAfter !== null) return { ready: false, reason: 'rate_limited', retryAfter };
  let unknown = false;
  let noServices = false;
  for (let offset = 0; offset < candidates.length; offset += 4) {
    const results = await Promise.allSettled(candidates.slice(offset, offset + 4).map(candidate =>
      inspectFieldFacts(runtime, candidate.actor_user_id, candidate.connection_id, {
        degradeOnGrantFailure: false,
        requiredScopes: ['field.facts.read', 'field.availability.read', 'field.requests.create'],
      })));
    for (const [index, result] of results.entries()) {
      if (result.status !== 'fulfilled' || !result.value.ok) { unknown = true; continue; }
      const services = result.value.facts.services;
      if (Array.isArray(services) && services.length > 0) {
        return { ready: true, connectionId: candidates[offset + index]!.connection_id };
      }
      noServices = true;
    }
  }
  return { ready: false, reason: unknown ? 'field_unavailable'
    : noServices ? 'no_services' : 'field_unavailable' };
}
function dailyLimit(runtime: BusinessRuntime) {
  const raw = runtime.customerDailyLimit ?? Number(process.env.AP_CUSTOMER_DAILY_LIMIT
    ?? (process.env.AP_PROFILE === 'mock' ? 100 : NaN));
  return Number.isSafeInteger(raw) && raw >= 1 && raw <= 100000 ? raw : null;
}

export function registerCustomerConsultationRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.post<{ Params: { publicId: string } }>('/v1/public/deployments/:publicId/engagements', async (request, reply) => {
    if (!originAllowed(request)) return reply.code(403).send({ error: 'origin_denied' });
    const link = await activeDeployment(runtime.pool, request.params.publicId);
    if (!link) return reply.code(404).send({ error: 'deployment_not_found' });
    if (link.kind !== 'link' && link.kind !== 'placement_embed')
      return reply.code(404).send({ error: 'deployment_not_found' });
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      if (await rejectExpiredTrial(reply, client, link.organization_id)) {
        await client.query('rollback'); return reply;
      }
      if (link.kind === 'placement_embed') {
        const guard = await guardPlacementEngagement(client, link.organization_id);
        if (guard) { await client.query('rollback'); return reply.code(guard === 'budget_not_configured' ? 503 : 429).send({ error: guard }); }
        await client.query('select id from ap.placements where id = $1 for share', [link.placement_id]);
        const current = await activeDeployment(client, request.params.publicId);
        if (!current || current.placement_id !== link.placement_id) {
          await client.query('rollback'); return reply.code(409).send({ error: 'placement_changed' });
        }
      }
      await client.query(
        `insert into ap.inquiries(id, organization_id, knowledge_release_id, knowledge_revision,
           deployment_id, agent_release_id, placement_id, consult_session_hash, consult_session_expires_at,
           distribution_traffic_class, state, mode, automation_paused)
         values ($1,$2,$3,$4,$5,$6,$7,$8,now() + interval '1 hour',$9,'ai_assisting','ai',false)`,
        [id, link.organization_id, link.knowledge_release_id, link.knowledge_revision,
          link.deployment_id, link.agent_release_id, link.placement_id, hash(secret),
          link.placement_id ? distributionTrafficClass(request.headers, 'preview') : 'unclassified'],
      );
      if (link.placement_id) await recordDistributionEvent(client, id, link.placement_id, 'engagement_started', 'preview');
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
    return reply.headers({ 'Set-Cookie': cookie(secret, 3600), 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer' }).code(201).send({ id, state: 'ai_assisting', knowledgeRevision: link.knowledge_revision });
  });

  app.post('/v1/embed/engagements', async (request, reply) => {
    const bearer = /^Bearer ([A-Za-z0-9_-]{40,64})$/.exec(request.headers.authorization ?? '')?.[1];
    if (!bearer) return reply.code(401).send({ error: 'invalid_embed_session' });
    if (!runtime.modelProvider) return reply.code(503).send({ error: 'blocked_integration' });
    if (!dailyLimit(runtime)) return reply.code(503).send({ error: 'budget_not_configured' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const found = await client.query<{ id: string; conversation_id: string | null; public_id: string;
        distribution_traffic_class: DistributionTrafficClass | null }>(
        `select s.id, s.conversation_id, s.distribution_traffic_class, d.public_id from ap.embed_sessions s
         join ap.deployments d on d.id = s.deployment_id
         where s.token_hash = $1 and s.expires_at > now() and s.transferred_at is null
           and d.kind in ('owned_embed', 'placement_embed') and d.status = 'active' and d.verified_at is not null
         for update of s`, [hash(bearer)]);
      const embed = found.rows[0];
      const deployment = embed && await activeDeployment(client, embed.public_id);
      if (!embed || !deployment) { await client.query('rollback'); return reply.code(401).send({ error: 'invalid_embed_session' }); }
      const id = embed.conversation_id ?? randomUUID();
      if (!embed.conversation_id) {
        if (await rejectExpiredTrial(reply, client, deployment.organization_id)) {
          await client.query('rollback'); return reply;
        }
        if (deployment.placement_id) {
          const guard = await guardPlacementEngagement(client, deployment.organization_id);
          if (guard) { await client.query('rollback'); return reply.code(guard === 'budget_not_configured' ? 503 : 429).send({ error: guard }); }
          await client.query('select id from ap.placements where id = $1 for share', [deployment.placement_id]);
          if (!await activeDeployment(client, embed.public_id)) {
            await client.query('rollback'); return reply.code(409).send({ error: 'placement_changed' });
          }
        }
        await client.query(
          `insert into ap.inquiries(id, organization_id, knowledge_release_id, knowledge_revision,
             deployment_id, agent_release_id, placement_id, consult_session_hash, consult_session_expires_at,
             distribution_traffic_class, state, mode, automation_paused)
           values ($1,$2,$3,$4,$5,$6,$7,$8,now() + interval '1 hour',$9,'ai_assisting','ai',false)`,
          [id, deployment.organization_id, deployment.knowledge_release_id, deployment.knowledge_revision,
            deployment.deployment_id, deployment.agent_release_id, deployment.placement_id,
            hash(randomBytes(32).toString('base64url')), embed.distribution_traffic_class ?? 'unclassified']);
        await recordDistributionEvent(client, id, deployment.placement_id, 'engagement_started',
          embed.distribution_traffic_class ?? 'unclassified');
        await client.query('update ap.embed_sessions set conversation_id = $2 where id = $1', [embed.id, id]);
      }
      await client.query('commit');
      return reply.header('Cache-Control', 'no-store').code(embed.conversation_id ? 200 : 201)
        .send({ id, state: 'ai_assisting', knowledgeRevision: deployment.knowledge_revision });
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.get<{ Params: { publicId: string } }>('/v1/public/deployments/:publicId/engagements/current', async (request, reply) => {
    const row = await session(runtime.pool, request);
    if (!row || row.public_id !== request.params.publicId)
      return reply.header('Cache-Control', 'no-store').send({ engagement: null });
    return reply.header('Cache-Control', 'no-store').send({ engagement: { id: row.id, state: row.state,
      messages: await publicMessages(runtime.pool, row.id) } });
  });

  app.get<{ Params: { id: string } }>('/v1/engagements/:id', async (request, reply) => {
    const row = await session(runtime.pool, request, request.params.id);
    if (!row) return reply.code(401).send({ error: 'consult_session_required' });
    return reply.header('Cache-Control', 'no-store').send({ id: row.id, state: row.state,
      messages: await publicMessages(runtime.pool, row.id) });
  });

  app.get<{ Params: { id: string } }>('/v1/engagements/:id/field-readiness', async (request, reply) => {
    const row = await session(runtime.pool, request, request.params.id);
    if (!row) return reply.header('Cache-Control', 'no-store').code(401)
      .send({ error: 'consult_session_required' });
    const readiness = await fieldReadiness(runtime, row.id);
    if (!readiness.ready && readiness.reason === 'rate_limited')
      return reply.header('Cache-Control', 'no-store')
        .header('Retry-After', readiness.retryAfter).code(429)
        .send({ error: 'field_preflight_rate_limited', scope: 'organization' });
    return reply.header('Cache-Control', 'no-store').send(readiness.ready
      ? { ready: true } : readiness);
  });

  app.get<{ Params: { id: string } }>('/v1/engagements/:id/messages/recover', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !idempotencyKey.test(key))
      return reply.code(400).send({ error: 'invalid_idempotency_key' });
    const row = await session(runtime.pool, request, request.params.id, false, false);
    if (!row) return reply.code(401).send({ error: 'consult_session_required' });
    const run = await customerAiRun(runtime.pool, row.id, hash(key));
    if (!run) return reply.code(404).send({ error: 'ai_attempt_not_found' });
    if (run.status === 'in_progress') reply.header('Retry-After', run.result_unknown ? '30' : '2');
    return reply.send({ state: run.result_unknown ? 'result_unknown' : run.status,
      runId: run.id, question: run.question,
      ...(run.status === 'completed' ? { ...object(run.answer), knowledgeRevision: run.knowledge_revision,
        usage: { inputTokens: run.input_tokens, outputTokens: run.output_tokens } }
        : run.status !== 'in_progress' ? { error: run.error_code ?? 'answer_failed' } : {}) });
  });

  app.post<{ Params: { id: string } }>('/v1/engagements/:id/messages', async (request, reply) => {
    if (!request.headers.authorization && !originAllowed(request)) return reply.code(403).send({ error: 'origin_denied' });
    const question = inputText(object(request.body)?.question, 1000);
    if (!question || contactPattern.test(question)) return reply.code(400).send({ error: 'invalid_question' });
    const key = request.headers['idempotency-key'];
    if (key !== undefined && (typeof key !== 'string' || !idempotencyKey.test(key)))
      return reply.code(400).send({ error: 'invalid_idempotency_key' });
    const keyHash = typeof key === 'string' ? hash(key) : null;
    const initial = await session(runtime.pool, request, request.params.id);
    if (!initial) return reply.code(401).send({ error: 'consult_session_required' });
    if (keyHash) {
      const earlier = await customerAiRun(runtime.pool, initial.id, keyHash);
      if (earlier) return replayCustomerAiRun(reply, earlier, question);
    }
    const provider = runtime.modelProvider;
    if (!provider) return reply.code(503).send({ error: 'blocked_integration' });
    const limit = dailyLimit(runtime);
    if (!limit) return reply.code(503).send({ error: 'budget_not_configured' });
    const link = await activeDeployment(runtime.pool, initial.public_id);
    if (!link || link.agent_release_id !== initial.agent_release_id
        || link.knowledge_release_id !== initial.knowledge_release_id)
      return reply.code(409).send({ error: 'source_changed' });
    const runId = randomUUID();
    let revision: number;
    let history: { role: 'customer' | 'assistant'; text: string }[] = [];
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      await client.query('select id from ap.organizations where id = $1 for update', [initial.organization_id]);
      const row = await session(client, request, request.params.id, true);
      if (!row) { await client.query('rollback'); return reply.code(401).send({ error: 'consult_session_required' }); }
      if (keyHash) {
        const earlier = await customerAiRun(client, row.id, keyHash);
        if (earlier) { await client.query('rollback'); return replayCustomerAiRun(reply, earlier, question); }
      }
      if (await rejectExpiredTrial(reply, client, row.organization_id)) {
        await client.query('rollback'); return reply;
      }
      const count = await client.query<{ daily: string; turns: string; active: string }>(
        `select count(*) filter (where started_at >= now() - interval '24 hours')::text as daily,
           count(*) filter (where inquiry_id = $2)::text as turns,
           count(*) filter (where inquiry_id = $2 and status = 'in_progress')::text as active
         from ap.ai_runs where organization_id = $1 and kind = 'customer_message'`,
        [row.organization_id, row.id],
      );
      if (Number(count.rows[0]?.active)) { await client.query('rollback'); return reply.code(409).send({ error: 'answer_in_progress' }); }
      if (Number(count.rows[0]?.daily) >= limit || Number(count.rows[0]?.turns) >= 12) {
        await client.query('rollback'); return reply.code(429).send({ error: 'customer_ai_limit' });
      }
      const prior = await client.query<{ actor: 'customer' | 'assistant'; body: string }>(
        `select actor,left(body,500) as body from ap.inquiry_messages
         where inquiry_id = $1 and visibility = 'customer'
           and actor in ('customer','assistant')
         order by sequence desc limit 6`, [row.id]);
      history = prior.rows.reverse().map(message => ({ role: message.actor, text: message.body }));
      revision = row.revision + 1;
      await client.query(
        `insert into ap.inquiry_messages(id, inquiry_id, sequence, actor, visibility, body, delivery_state)
         values ($1,$2,$3,'customer','customer',$4,'not_applicable')`,
        [randomUUID(), row.id, row.next_sequence, question],
      );
      await client.query('update ap.inquiries set next_sequence = next_sequence + 1, revision = $2, updated_at = now() where id = $1',
        [row.id, revision]);
      await client.query(
        `insert into ap.ai_runs(id, organization_id, agent_release_id, knowledge_release_id,
           kind, inquiry_id, inquiry_revision, question, status, provider_model, idempotency_key_hash)
         values ($1,$2,$3,$4,'customer_message',$5,$6,$7,'in_progress',$8,$9)`,
        [runId, row.organization_id, link.agent_release_id, link.knowledge_release_id,
          row.id, revision, question, provider.model, keyHash],
      );
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }

    const connector = await confirmedConnectorFacts(runtime, link.knowledge_release_id);
    const facts = factsFor(link.knowledge, connector.facts);
    let generated: Awaited<ReturnType<typeof provider.generate>>;
    try {
      generated = await provider.generate({ question, facts, history,
        agent: link.agent, maxOutputTokens: 768 });
    } catch {
      await runtime.pool.query(
        `update ap.ai_runs set status = 'failed', error_code = 'provider_unavailable', finished_at = now() where id = $1`, [runId]);
      return reply.code(503).send({ error: 'provider_unavailable', runId });
    }
    const output = outputFrom(generated.output);
    const evidence = output?.evidenceIds ?? [];
    const supported = new Set(facts.map(fact => fact.id));
    const inputTokens = Number.isSafeInteger(generated.inputTokens) && generated.inputTokens >= 0 ? generated.inputTokens : null;
    const outputTokens = Number.isSafeInteger(generated.outputTokens) && generated.outputTokens >= 0 ? generated.outputTokens : null;
    const responseId = typeof generated.responseId === 'string' && generated.responseId.length > 0
      && generated.responseId.length <= 200 ? generated.responseId : null;
    const error = !output || inputTokens === null || outputTokens === null || responseId === null
      ? 'invalid_model_output'
      : evidence.some(id => !supported.has(id)) || (output.answer && !evidence.length)
        ? 'unsupported_evidence'
        : output.answer && unsupportedNumber(output.answer, facts.filter(fact => evidence.includes(fact.id)))
          ? 'unsupported_number' : null;
    if (error) {
      await runtime.pool.query(
        `update ap.ai_runs set status = 'rejected', error_code = $2, provider_response_id = $3,
           input_tokens = $4, output_tokens = $5, finished_at = now() where id = $1`,
        [runId, error, responseId, inputTokens, outputTokens]);
      return reply.code(422).send({ error, runId });
    }
    const afterGeneration = evidence.some(id => id.startsWith('field:'))
      ? await confirmedConnectorFacts(runtime, link.knowledge_release_id) : undefined;
    const accepted = guardedConnectorAnswer(output!, connector, afterGeneration);
    const committed = await runtime.pool.connect();
    try {
      await committed.query('begin');
      const row = await committed.query<Conversation>(
        'select id, organization_id, state, mode, automation_paused, revision, next_sequence from ap.inquiries where id = $1 for update',
        [initial.id],
      );
      const latest = await activeDeployment(committed, initial.public_id);
      if (!row.rows[0] || row.rows[0].state !== 'ai_assisting' || row.rows[0].mode !== 'ai'
          || row.rows[0].automation_paused || row.rows[0].revision !== revision
          || latest?.agent_release_id !== link.agent_release_id
          || latest.knowledge_release_id !== link.knowledge_release_id) {
        await committed.query(
          `update ap.ai_runs set status = 'rejected', error_code = 'automation_paused_or_source_changed',
             provider_response_id = $2, input_tokens = $3, output_tokens = $4, finished_at = now() where id = $1`,
          [runId, generated.responseId, generated.inputTokens, generated.outputTokens]);
        await committed.query('commit');
        return reply.code(409).send({ error: 'automation_paused_or_source_changed', runId });
      }
      if (accepted.answer) {
        await committed.query(
          `insert into ap.inquiry_messages(id, inquiry_id, sequence, actor, visibility, body, delivery_state)
           values ($1,$2,$3,'assistant','customer',$4,'not_applicable')`,
          [randomUUID(), initial.id, row.rows[0].next_sequence, accepted.answer],
        );
        await committed.query('update ap.inquiries set next_sequence = next_sequence + 1, revision = revision + 1, updated_at = now() where id = $1',
          [initial.id]);
      }
      const result = { answer: accepted.answer, evidenceIds: accepted.evidenceIds,
        unknowns: accepted.unknowns, handoffRecommended: accepted.handoffRecommended
          || accepted.unknowns.length > 0 || accepted.answer.length === 0 };
      await committed.query(
        `update ap.ai_runs set status = 'completed', answer = $2::jsonb, provider_response_id = $3,
           input_tokens = $4, output_tokens = $5, finished_at = now() where id = $1`,
        [runId, JSON.stringify(result), generated.responseId, generated.inputTokens, generated.outputTokens]);
      await committed.query('commit');
      return reply.header('Cache-Control', 'no-store').send({ runId, ...result,
        knowledgeRevision: link.knowledge_revision,
        usage: { inputTokens: generated.inputTokens, outputTokens: generated.outputTokens } });
    } catch (error) { await committed.query('rollback'); throw error; } finally { committed.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/conversations/:id/submissions/recover', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (request.headers.origin && !originAllowed(request)) return reply.code(403).send({ error: 'origin_denied' });
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'conversation_not_found' });
    const attempt = submissionAttempt(request.headers, {});
    if (!attempt) return reply.code(400).send({ error: 'invalid_submission_key' });
    const found = await runtime.pool.query<{ id: string; state: string }>(
      `select id, state from ap.inquiries where id = $1 and submission_key_hash = $2
       and visitor_key_hash = $3 and consent_at is not null`,
      [request.params.id, attempt.keyHash, attempt.receiptHash]);
    if (!found.rows[0]) return reply.header('Cache-Control', 'no-store')
      .code(404).send({ error: 'conversation_not_found' });
    return reply.header('Cache-Control', 'no-store').send({
      id: found.rows[0].id, receiptKey: attempt.receiptKey,
      state: found.rows[0].state,
      delivery: found.rows[0].state === 'external_ready' ? 'not_applicable' : 'blocked_integration',
    });
  });

  app.post<{ Params: { id: string } }>('/v1/conversations/:id/submissions', async (request, reply) => {
    if (!originAllowed(request)) return reply.code(403).send({ error: 'origin_denied' });
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'conversation_not_found' });
    const body = object(request.body);
    const name = inputText(body?.name, 80);
    const phone = inputText(body?.phone, 30);
    const message = inputText(body?.message, 5000);
    const serviceName = body?.serviceName;
    const destination = body?.destination === 'field' ? 'field' : 'human';
    if (!name || !phone || !/^[+\d()\-\s]{9,30}$/.test(phone) || phone.replace(/\D/g, '').length < 9
        || !message || body?.consent !== true || (serviceName !== undefined
          && (typeof serviceName !== 'string' || serviceName.length > 160))
        || (body?.destination !== undefined && body.destination !== 'field'))
      return reply.code(400).send({ error: 'invalid_submission' });
    const attempt = submissionAttempt(request.headers, { name, phone, message,
      serviceName: serviceName ?? null, ...(destination === 'field' ? { destination } : {}) });
    if (attempt === null) return reply.code(400).send({ error: 'invalid_submission_key' });
    const replay = async () => {
      if (!attempt) return null;
      const result = await runtime.pool.query<{
        id: string; state: string; visitor_key_hash: string; submission_request_hash: string;
      }>(
        `select id, state, visitor_key_hash, submission_request_hash from ap.inquiries
         where id = $1 and submission_key_hash = $2 and consent_at is not null`,
        [request.params.id, attempt.keyHash]);
      const row = result.rows[0];
      if (!row) return null;
      if (row.visitor_key_hash !== attempt.receiptHash || row.submission_request_hash !== attempt.requestHash)
        return reply.code(409).send({ error: 'idempotency_conflict' });
      return reply.header('Cache-Control', 'no-store').code(200).send({ id: row.id,
        receiptKey: attempt.receiptKey, state: row.state,
        delivery: row.state === 'external_ready' ? 'not_applicable' : 'blocked_integration' });
    };
    const previous = await replay();
    if (previous) return previous;
    let readyConnectionId: string | null = null;
    if (destination === 'field') {
      const initial = await session(runtime.pool, request, request.params.id);
      if (!initial) return reply.code(401).send({ error: 'consult_session_required' });
      const readiness = await fieldReadiness(runtime, initial.id);
      if (!readiness.ready && readiness.reason === 'rate_limited')
        return reply.header('Cache-Control', 'no-store')
          .header('Retry-After', readiness.retryAfter).code(429)
          .send({ error: 'field_preflight_rate_limited', scope: 'organization' });
      if (!readiness.ready) return reply.header('Cache-Control', 'no-store')
        .code(readiness.reason === 'field_unavailable' ? 503 : 409)
        .send({ error: readiness.reason === 'no_connection' ? 'field_connection_unavailable'
          : readiness.reason === 'no_services' ? 'field_services_unavailable' : 'field_unavailable' });
      readyConnectionId = readiness.connectionId;
    }
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const row = await session(client, request, request.params.id, true);
      if (!row) {
        await client.query('rollback');
        const result = await replay();
        if (result) return result;
        return reply.code(401).send({ error: 'consult_session_required' });
      }
      if (await rejectExpiredTrial(reply, client, row.organization_id)) {
        await client.query('rollback'); return reply;
      }
      const knowledge = await client.query<{ content: Knowledge }>(
        'select content from ap.knowledge_releases where id = $1', [row.knowledge_release_id]);
      const service = serviceName ? knowledge.rows[0]?.content.services.find(item => item.name === serviceName) : null;
      if (serviceName && !service) { await client.query('rollback'); return reply.code(400).send({ error: 'service_not_found' }); }
      if (destination === 'field' && !(await fieldRequestCandidates(runtime, client, row.id, true))
        .some(candidate => candidate.connection_id === readyConnectionId)) {
        await client.query('rollback');
        return reply.header('Cache-Control', 'no-store').code(409)
          .send({ error: 'field_connection_unavailable' });
      }
      const submissionLimit = await consumePublicSubmission(client, row.organization_id, phone);
      if (submissionLimit !== null) {
        await client.query('rollback');
        return reply.header('Retry-After', submissionLimit.retryAfter).header('Cache-Control', 'no-store')
          .code(429).send({ error: 'submission_rate_limited', scope: submissionLimit.scope });
      }
      const receiptKey = attempt?.receiptKey ?? randomBytes(32).toString('base64url');
      const messageId = randomUUID();
      await client.query(
        `insert into ap.inquiry_messages(id, inquiry_id, sequence, actor, visibility, body, delivery_state)
         values ($1,$2,$3,'customer','customer',$4,$5)`,
        [messageId, row.id, row.next_sequence, message,
          destination === 'field' ? 'not_applicable' : 'blocked_integration'],
      );
      await client.query(
        `update ap.inquiries set customer_name = $2, customer_phone = $3, visitor_key_hash = $4,
           consent_at = now(), submitted_at = now(), service_snapshot = $5::jsonb,
           submission_key_hash = $6, submission_request_hash = $7,
           state = $8, mode = $9, automation_paused = true,
           next_sequence = next_sequence + 1, revision = revision + 1, updated_at = now()
         where id = $1`,
        [row.id, name, phone, hash(receiptKey), service ? JSON.stringify(service) : null,
          attempt?.keyHash ?? null, attempt?.requestHash ?? null,
          destination === 'field' ? 'external_ready' : 'needs_owner',
          destination === 'field' ? 'external' : 'human'],
      );
      if (destination === 'human') {
        await recordInquiryEvent(client, row.organization_id, 'ap.inquiry.created', row.id, messageId);
        await recordDistributionEvent(client, row.id, row.placement_id, 'contact_submitted', row.distribution_traffic_class);
      }
      await client.query('commit');
      return reply.headers({ 'Set-Cookie': cookie('', 0), 'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer' }).code(201).send({ id: row.id, receiptKey,
          state: destination === 'field' ? 'external_ready' : 'needs_owner',
          delivery: destination === 'field' ? 'not_applicable' : 'blocked_integration' });
    } catch (error) {
      await client.query('rollback');
      if (attempt && (error as { code?: string }).code === '23505') {
        const result = await replay();
        if (result) return result;
        return reply.code(409).send({ error: 'idempotency_conflict' });
      }
      throw error;
    } finally { client.release(); }
  });
}
