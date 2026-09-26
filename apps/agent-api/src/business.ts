import { createHash, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { AgentModelProvider } from './openai.js';
import type { AgentInquiryMediaStore } from './inquiry-media.js';
import type { FieldConnectorConfig } from './field-connector.js';
import { rejectExpiredTrial } from './trial-access.js';

export type BusinessRuntime = {
  pool: Pool;
  resolveUserId: (headers: IncomingHttpHeaders) => Promise<string | null>;
  resolveSession?: (headers: IncomingHttpHeaders) => Promise<{ id: string; userId: string } | null>;
  modelProvider?: AgentModelProvider;
  testDailyLimit?: number;
  customerDailyLimit?: number;
  verifyDomain?: (host: string, proof: string) => Promise<boolean>;
  inquiryMedia?: AgentInquiryMediaStore;
  fieldConnector?: FieldConnectorConfig;
};

type Service = { name: string; description: string };
type Faq = { question: string; answer: string };
type Content = { businessName: string; introduction: string; services: Service[]; faqs: Faq[] };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function shortText(value: unknown, max: number, required = false): string | null {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) return null;
  return value.trim();
}

function contentFrom(value: Record<string, unknown>, allowIncomplete = false): Content | null {
  const businessName = shortText(value.businessName, 160, !allowIncomplete);
  const introduction = shortText(value.introduction, 5000);
  if (businessName === null || introduction === null || !Array.isArray(value.services)
      || !Array.isArray(value.faqs) || value.services.length > 50 || value.faqs.length > 100) return null;
  const services: Service[] = [];
  const faqs: Faq[] = [];
  for (const item of value.services) {
    const entry = object(item);
    const name = shortText(entry?.name, 160, !allowIncomplete);
    const description = shortText(entry?.description, 2000);
    if (name === null || description === null) return null;
    services.push({ name, description });
  }
  for (const item of value.faqs) {
    const entry = object(item);
    const question = shortText(entry?.question, 500, !allowIncomplete);
    const answer = shortText(entry?.answer, 3000, !allowIncomplete);
    if (question === null || answer === null) return null;
    faqs.push({ question, answer });
  }
  return { businessName, introduction, services, faqs };
}

function expectedRevision(body: unknown): number | null {
  const value = object(body)?.expectedRevision;
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0 ? value : null;
}

async function authenticatedUser(request: FastifyRequest, reply: FastifyReply, runtime: BusinessRuntime) {
  const userId = await runtime.resolveUserId(request.headers);
  if (!userId) reply.code(401).send({ error: 'authentication_required' });
  return userId;
}

async function organizationFor(request: FastifyRequest, reply: FastifyReply, runtime: BusinessRuntime, userId: string, permission: 'read' | 'edit' | 'approve') {
  const header = request.headers['x-organization-id'];
  if (header !== undefined && (typeof header !== 'string' || !uuidPattern.test(header))) {
    reply.code(400).send({ error: 'invalid_organization_id' });
    return null;
  }
  const result = await runtime.pool.query<{ organization_id: string }>(
    `select m.organization_id from ap.memberships m
      where m.user_id = $1 and ($2::uuid is null or m.organization_id = $2::uuid)
        and ($3::text = 'read' or ($3::text = 'edit' and m.role in ('owner', 'editor')) or m.role = 'owner')
      order by m.created_at limit 1`, [userId, header ?? null, permission],
  );
  const organizationId = result.rows[0]?.organization_id;
  if (!organizationId) reply.code(404).send({ error: 'organization_not_found' });
  return organizationId ?? null;
}

export function registerBusinessRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.post('/v1/organizations', async (request, reply) => {
    const userId = await authenticatedUser(request, reply, runtime);
    if (!userId) return reply;
    const name = shortText(object(request.body)?.name, 160, true);
    if (name === null) return reply.code(400).send({ error: 'invalid_name' });
    const id = randomUUID();
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const created = await client.query(
        'insert into ap.organizations(id, owner_user_id, name) values ($1, $2, $3) on conflict (owner_user_id) do nothing returning id',
        [id, userId, name],
      );
      if (!created.rowCount) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'organization_exists' });
      }
      await client.query("insert into ap.memberships(organization_id, user_id, role) values ($1, $2, 'owner')", [id, userId]);
      await client.query(
        'insert into ap.knowledge_drafts(organization_id, content, updated_by) values ($1, $2::jsonb, $3)',
        [id, JSON.stringify({ businessName: name, introduction: '', services: [], faqs: [] }), userId],
      );
      await client.query(
        `insert into ap.agent_drafts(organization_id, agent_id, content, updated_by)
         values ($1, $2, $3::jsonb, $4)`,
        [id, randomUUID(), JSON.stringify({ name: `${name} AI`, tone: 'clear', guideScope: '',
          handoffText: '확인되지 않은 사항은 담당자가 답변합니다.' }), userId],
      );
      await client.query(
        'insert into ap.outbox(id, organization_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
        [randomUUID(), id, 'organization.created', id, JSON.stringify({ organizationId: id })],
      );
      await client.query('commit');
      return reply.code(201).send({ id });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/v1/knowledge/draft', async (request, reply) => {
    const userId = await authenticatedUser(request, reply, runtime);
    if (!userId) return reply;
    const organizationId = await organizationFor(request, reply, runtime, userId, 'read');
    if (!organizationId) return reply;
    const draft = await runtime.pool.query<{ revision: number; content: Content }>(
      'select revision, content from ap.knowledge_drafts where organization_id = $1', [organizationId],
    );
    const release = await runtime.pool.query<{ revision: number; draft_revision: number }>(
      `select revision, draft_revision from ap.knowledge_releases
       where organization_id = $1 order by revision desc limit 1`, [organizationId],
    );
    return { organizationId, revision: draft.rows[0]!.revision, ...draft.rows[0]!.content,
      releaseRevision: release.rows[0]?.revision ?? null,
      releaseDraftRevision: release.rows[0]?.draft_revision ?? null };
  });

  const saveDraft = async (request: FastifyRequest, reply: FastifyReply, partial: boolean) => {
    const userId = await authenticatedUser(request, reply, runtime);
    if (!userId) return reply;
    const organizationId = await organizationFor(request, reply, runtime, userId, 'edit');
    if (!organizationId) return reply;
    const body = object(request.body);
    const revision = expectedRevision(body);
    let nextBody = body;
    if (partial && body && revision !== null) {
      const current = await runtime.pool.query<{ revision: number; content: Content }>(
        'select revision, content from ap.knowledge_drafts where organization_id = $1', [organizationId],
      );
      if (current.rows[0]?.revision !== revision) return reply.code(409).send({ error: 'revision_conflict' });
      nextBody = { ...current.rows[0].content, ...body };
    }
    const content = nextBody && contentFrom(nextBody, true);
    if (revision === null || !content) return reply.code(400).send({ error: 'invalid_draft' });
    const saved = await runtime.pool.query<{ revision: number }>(
      `update ap.knowledge_drafts set revision = revision + 1, content = $3::jsonb,
         updated_by = $4, updated_at = now()
       where organization_id = $1 and revision = $2 returning revision`,
      [organizationId, revision, JSON.stringify(content), userId],
    );
    if (!saved.rowCount) return reply.code(409).send({ error: 'revision_conflict' });
    return { organizationId, revision: saved.rows[0]!.revision, ...content };
  };
  app.put('/v1/knowledge/draft', (request, reply) => saveDraft(request, reply, false));
  app.patch('/v1/knowledge/draft', (request, reply) => saveDraft(request, reply, true));

  app.post('/v1/knowledge/releases', async (request, reply) => {
    const userId = await authenticatedUser(request, reply, runtime);
    if (!userId) return reply;
    const organizationId = await organizationFor(request, reply, runtime, userId, 'approve');
    if (!organizationId) return reply;
    const revision = expectedRevision(request.body);
    if (revision === null) return reply.code(400).send({ error: 'invalid_revision' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      await client.query('select id from ap.organizations where id = $1 for update', [organizationId]);
      const draft = await client.query<{ revision: number; content: Content }>(
        'select revision, content from ap.knowledge_drafts where organization_id = $1 for update', [organizationId],
      );
      if (!draft.rows[0] || revision !== draft.rows[0].revision || revision === 0) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'revision_conflict' });
      }
      const existing = await client.query<{ id: string; revision: number; draft_revision: number }>(
        `select id, revision, draft_revision from ap.knowledge_releases
         where organization_id = $1 order by revision desc limit 1`,
        [organizationId],
      );
      if (existing.rows[0]?.draft_revision === revision) {
        await client.query('commit');
        return reply.code(200).send({ releaseId: existing.rows[0].id,
          revision: existing.rows[0].revision });
      }
      if (await rejectExpiredTrial(reply, client, organizationId)) {
        await client.query('rollback'); return reply;
      }
      if (!contentFrom(object(draft.rows[0].content) ?? {})) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'knowledge_incomplete' });
      }
      const id = randomUUID();
      const releaseRevision = (existing.rows[0]?.revision ?? 0) + 1;
      const content = JSON.stringify(draft.rows[0].content);
      const hash = createHash('sha256').update(content).digest('hex');
      await client.query(
        `insert into ap.knowledge_releases
          (id, organization_id, revision, draft_revision, source_kind, content, content_hash, approved_by)
          values ($1, $2, $3, $4, 'native', $5::jsonb, $6, $7)`,
        [id, organizationId, releaseRevision, revision, content, hash, userId],
      );
      await client.query(
        'insert into ap.outbox(id, organization_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
        [randomUUID(), organizationId, 'knowledge.approved', id,
          JSON.stringify({ organizationId, releaseId: id, revision: releaseRevision,
            draftRevision: revision })],
      );
      await client.query('commit');
      return reply.code(201).send({ releaseId: id, revision: releaseRevision,
        draftRevision: revision });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  });

  app.get<{ Params: { id: string } }>('/v1/public/organizations/:id', async (request, reply) => {
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'not_found' });
    const result = await runtime.pool.query<{ revision: number; content: Content }>(
      `select revision, content from ap.knowledge_releases where organization_id = $1
       order by revision desc limit 1`, [request.params.id],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'not_found' });
    const content = result.rows[0].content;
    return { organizationId: request.params.id, revision: result.rows[0].revision,
      businessName: content.businessName, introduction: content.introduction,
      services: content.services, faqs: content.faqs };
  });
}
