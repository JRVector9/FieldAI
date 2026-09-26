import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';
import { rejectExpiredTrial } from './trial-access.js';

type Knowledge = { businessName: string; services: { name: string; description: string }[] };
type Card = { businessName: string; serviceName: string; description: string; advertisementLabel: '광고'; ctaLabel: '상담하기' };
type CampaignRow = { id: string; organization_id: string; name: string; draft_revision: number;
  draft_knowledge_release_id: string; draft_service_index: number; state: string; current_release_id: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const bodyObject = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

async function organization(request: FastifyRequest, reply: FastifyReply, runtime: BusinessRuntime, permission: 'read' | 'edit' | 'approve') {
  const userId = await runtime.resolveUserId(request.headers);
  if (!userId) { reply.code(401).send({ error: 'authentication_required' }); return null; }
  const header = request.headers['x-organization-id'];
  if (header !== undefined && (typeof header !== 'string' || !uuid.test(header))) {
    reply.code(400).send({ error: 'invalid_organization_id' }); return null;
  }
  const result = await runtime.pool.query<{ organization_id: string }>(
    `select m.organization_id from ap.memberships m where m.user_id = $1
       and ($2::uuid is null or m.organization_id = $2::uuid)
       and ($3::text = 'read' or ($3::text = 'edit' and m.role in ('owner', 'editor')) or m.role = 'owner')
       order by m.created_at limit 1`, [userId, header ?? null, permission],
  );
  const organizationId = result.rows[0]?.organization_id;
  if (!organizationId) { reply.code(404).send({ error: 'organization_not_found' }); return null; }
  return { organizationId, userId };
}

function cardFrom(source: Knowledge, index: number): Card | null {
  const service = source.services?.[index];
  if (!source.businessName?.trim() || !service?.name?.trim() || !service.description?.trim()) return null;
  return { businessName: source.businessName, serviceName: service.name,
    description: service.description, advertisementLabel: '광고', ctaLabel: '상담하기' };
}

async function currentSource(client: PoolClient, organizationId: string) {
  const found = await client.query<{ id: string; revision: number; content: Knowledge }>(
    `select id, revision, content from ap.knowledge_releases where organization_id = $1
     order by revision desc limit 1`, [organizationId],
  );
  return found.rows[0] ?? null;
}

function draftInput(body: unknown) {
  const value = bodyObject(body);
  const name = value?.name;
  const knowledgeReleaseId = value?.knowledgeReleaseId;
  const serviceIndex = value?.serviceIndex;
  if (typeof name !== 'string' || !name.trim() || name.length > 160
    || typeof knowledgeReleaseId !== 'string' || !uuid.test(knowledgeReleaseId)
    || typeof serviceIndex !== 'number' || !Number.isSafeInteger(serviceIndex) || serviceIndex < 0) return null;
  return { name: name.trim(), knowledgeReleaseId, serviceIndex };
}

async function campaignFor(client: PoolClient, id: string, organizationId: string, lock = false) {
  const found = await client.query<CampaignRow>(
    `select id, organization_id, name, draft_revision, draft_knowledge_release_id,
      draft_service_index, state, current_release_id from ap.campaigns
     where id = $1 and organization_id = $2${lock ? ' for update' : ''}`, [id, organizationId],
  );
  return found.rows[0] ?? null;
}

export function registerCampaignRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get('/v1/campaigns/sources', async (request, reply) => {
    const actor = await organization(request, reply, runtime, 'read');
    if (!actor) return reply;
    const client = await runtime.pool.connect();
    try {
      const source = await currentSource(client, actor.organizationId);
      return source ? { knowledgeReleaseId: source.id, revision: source.revision,
        businessName: source.content.businessName, services: source.content.services } : { knowledgeReleaseId: null, services: [] };
    } finally { client.release(); }
  });

  app.get('/v1/campaigns', async (request, reply) => {
    const actor = await organization(request, reply, runtime, 'read');
    if (!actor) return reply;
    const found = await runtime.pool.query<CampaignRow>(
      `select id, organization_id, name, draft_revision, draft_knowledge_release_id,
       draft_service_index, state, current_release_id from ap.campaigns
       where organization_id = $1 order by created_at desc`, [actor.organizationId],
    );
    return { campaigns: found.rows.map(row => ({ id: row.id, name: row.name, draftRevision: row.draft_revision,
      knowledgeReleaseId: row.draft_knowledge_release_id, serviceIndex: row.draft_service_index,
      state: row.state, currentReleaseId: row.current_release_id })) };
  });

  app.post('/v1/campaigns', async (request, reply) => {
    const actor = await organization(request, reply, runtime, 'edit');
    if (!actor) return reply;
    const input = draftInput(request.body);
    if (!input) return reply.code(400).send({ error: 'invalid_card_draft' });
    if (await rejectExpiredTrial(reply, runtime.pool, actor.organizationId)) return reply;
    const client = await runtime.pool.connect();
    try {
      const source = await currentSource(client, actor.organizationId);
      if (!source || source.id !== input.knowledgeReleaseId || !cardFrom(source.content, input.serviceIndex))
        return reply.code(409).send({ error: 'approved_source_required' });
      const id = randomUUID();
      await client.query(
        `insert into ap.campaigns(id, organization_id, name, draft_knowledge_release_id,
         draft_service_index, updated_by) values ($1, $2, $3, $4, $5, $6)`,
        [id, actor.organizationId, input.name, source.id, input.serviceIndex, actor.userId],
      );
      return reply.code(201).send({ id, draftRevision: 1, state: 'draft' });
    } finally { client.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/campaigns/:id', async (request, reply) => {
    const actor = await organization(request, reply, runtime, 'read');
    if (!actor) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'not_found' });
    const client = await runtime.pool.connect();
    try {
      const campaign = await campaignFor(client, request.params.id, actor.organizationId);
      if (!campaign) return reply.code(404).send({ error: 'not_found' });
      const latest = await currentSource(client, actor.organizationId);
      const source = await client.query<{ content: Knowledge }>(
        'select content from ap.knowledge_releases where id = $1 and organization_id = $2',
        [campaign.draft_knowledge_release_id, actor.organizationId],
      );
      const draftCard = source.rows[0] ? cardFrom(source.rows[0].content, campaign.draft_service_index) : null;
      const release = campaign.current_release_id ? await client.query<{ content: Card }>(
        'select content from ap.campaign_releases where id = $1 and campaign_id = $2',
        [campaign.current_release_id, campaign.id],
      ) : null;
      const liveCard = release?.rows[0]?.content ?? null;
      const sourceCard = latest && liveCard ? latest.content.services?.find(service => service.name === liveCard.serviceName) : null;
      const exposure = campaign.state === 'published'
        ? sourceCard?.description === liveCard?.description && latest?.content.businessName === liveCard?.businessName
          ? 'public' : 'stale_source' : campaign.state;
      return { id: campaign.id, name: campaign.name, draftRevision: campaign.draft_revision,
        knowledgeReleaseId: campaign.draft_knowledge_release_id, serviceIndex: campaign.draft_service_index,
        draftCard, state: campaign.state, exposure, currentReleaseId: campaign.current_release_id,
        currentCard: liveCard };
    } finally { client.release(); }
  });

  app.put<{ Params: { id: string } }>('/v1/campaigns/:id/draft', async (request, reply) => {
    const actor = await organization(request, reply, runtime, 'edit');
    if (!actor) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'not_found' });
    const input = draftInput(request.body);
    const expectedRevision = bodyObject(request.body)?.expectedRevision;
    if (!input || typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      return reply.code(400).send({ error: 'invalid_card_draft' });
    const client = await runtime.pool.connect();
    try {
      const source = await currentSource(client, actor.organizationId);
      if (!source || source.id !== input.knowledgeReleaseId || !cardFrom(source.content, input.serviceIndex))
        return reply.code(409).send({ error: 'approved_source_required' });
      const saved = await client.query<{ draft_revision: number }>(
        `update ap.campaigns set draft_revision = draft_revision + 1, name = $4,
         draft_knowledge_release_id = $5, draft_service_index = $6, updated_by = $7, updated_at = now()
         where id = $1 and organization_id = $2 and draft_revision = $3 returning draft_revision`,
        [request.params.id, actor.organizationId, expectedRevision, input.name, source.id, input.serviceIndex, actor.userId],
      );
      if (!saved.rows[0]) return reply.code(409).send({ error: 'revision_conflict' });
      return { id: request.params.id, draftRevision: saved.rows[0].draft_revision };
    } finally { client.release(); }
  });

  app.post<{ Params: { id: string } }>('/v1/campaigns/:id/releases', async (request, reply) => {
    const actor = await organization(request, reply, runtime, 'approve');
    if (!actor) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'not_found' });
    const body = bodyObject(request.body);
    const revision = body?.expectedRevision;
    const key = body?.idempotencyKey;
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1
      || typeof key !== 'string' || !uuid.test(key) || body?.confirmApprovedFacts !== true)
      return reply.code(400).send({ error: 'explicit_card_approval_required' });
    const keyHash = hash(key);
    const requestHash = hash(JSON.stringify({ revision, confirmApprovedFacts: true }));
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const campaign = await campaignFor(client, request.params.id, actor.organizationId, true);
      if (!campaign) { await client.query('rollback'); return reply.code(404).send({ error: 'not_found' }); }
      const previous = await client.query<{ id: string; approval_request_hash: string }>(
        'select id, approval_request_hash from ap.campaign_releases where campaign_id = $1 and approval_key_hash = $2',
        [campaign.id, keyHash],
      );
      if (previous.rows[0]) {
        await client.query('commit');
        return previous.rows[0].approval_request_hash === requestHash
          ? reply.code(200).send({ releaseId: previous.rows[0].id, revision })
          : reply.code(409).send({ error: 'idempotency_conflict' });
      }
      if (await rejectExpiredTrial(reply, client, actor.organizationId)) {
        await client.query('rollback'); return reply;
      }
      if (campaign.draft_revision !== revision) {
        await client.query('rollback'); return reply.code(409).send({ error: 'revision_conflict' });
      }
      const existing = await client.query('select id from ap.campaign_releases where campaign_id = $1 and revision = $2', [campaign.id, revision]);
      if (existing.rowCount) { await client.query('rollback'); return reply.code(409).send({ error: 'revision_already_published' }); }
      const source = await currentSource(client, actor.organizationId);
      const card = source?.id === campaign.draft_knowledge_release_id ? cardFrom(source.content, campaign.draft_service_index) : null;
      if (!card || !source) { await client.query('rollback'); return reply.code(409).send({ error: 'approved_source_changed' }); }
      const id = randomUUID();
      const content = JSON.stringify(card);
      await client.query(
        `insert into ap.campaign_releases(id, campaign_id, organization_id, revision,
         knowledge_release_id, service_index, content, content_hash, approved_by,
         approval_key_hash, approval_request_hash)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
        [id, campaign.id, actor.organizationId, revision, source.id, campaign.draft_service_index,
          content, hash(content), actor.userId, keyHash, requestHash],
      );
      await client.query('update ap.campaigns set state = $2, current_release_id = $3, updated_at = now() where id = $1',
        [campaign.id, 'published', id]);
      await client.query('insert into ap.outbox(id, organization_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
        [randomUUID(), actor.organizationId, 'campaign.published', id, JSON.stringify({ campaignId: campaign.id, releaseId: id, revision })]);
      await client.query('commit');
      return reply.code(201).send({ releaseId: id, revision });
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  });

  for (const action of ['pause', 'resume'] as const) {
    app.post<{ Params: { id: string } }>(`/v1/campaigns/:id/${action}`, async (request, reply) => {
      const actor = await organization(request, reply, runtime, 'approve');
      if (!actor) return reply;
      if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'not_found' });
      const expectedReleaseId = bodyObject(request.body)?.expectedReleaseId;
      if (typeof expectedReleaseId !== 'string' || !uuid.test(expectedReleaseId))
        return reply.code(400).send({ error: 'invalid_release_id' });
      const client = await runtime.pool.connect();
      try {
        await client.query('begin');
        const campaign = await campaignFor(client, request.params.id, actor.organizationId, true);
        if (!campaign) { await client.query('rollback'); return reply.code(404).send({ error: 'not_found' }); }
        if (campaign.current_release_id !== expectedReleaseId) {
          await client.query('rollback'); return reply.code(409).send({ error: 'release_conflict' });
        }
        if (action === 'resume') {
          if (campaign.state !== 'published' && await rejectExpiredTrial(reply, client, actor.organizationId)) {
            await client.query('rollback'); return reply;
          }
          const source = await currentSource(client, actor.organizationId);
          const release = await client.query<{ content: Card }>(
            'select content from ap.campaign_releases where id = $1 and campaign_id = $2', [expectedReleaseId, campaign.id],
          );
          const card = release.rows[0]?.content;
          const service = source?.content.services?.find(item => item.name === card?.serviceName);
          if (!card || source?.content.businessName !== card.businessName || service?.description !== card.description) {
            await client.query('rollback'); return reply.code(409).send({ error: 'approved_source_changed' });
          }
        }
        const nextState = action === 'pause' ? 'paused' : 'published';
        if (campaign.state !== nextState) {
          await client.query('update ap.campaigns set state = $2, updated_at = now() where id = $1', [campaign.id, nextState]);
          await client.query('insert into ap.outbox(id, organization_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
            [randomUUID(), actor.organizationId, `campaign.${nextState}`, campaign.id,
              JSON.stringify({ campaignId: campaign.id, releaseId: expectedReleaseId })]);
        }
        await client.query('commit');
        return { id: campaign.id, state: nextState, currentReleaseId: expectedReleaseId };
      } catch (error) { await client.query('rollback'); throw error; }
      finally { client.release(); }
    });
  }

  app.get<{ Params: { id: string } }>('/v1/public/campaigns/:id', async (request, reply) => {
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'not_found' });
    const result = await runtime.pool.query<{ id: string; organization_id: string; content: Card;
      latest_content: Knowledge | null }>(
      `select r.id, c.organization_id, r.content,
        (select k.content from ap.knowledge_releases k where k.organization_id = c.organization_id
         order by k.revision desc limit 1) as latest_content
       from ap.campaigns c join ap.campaign_releases r on r.id = c.current_release_id
       where c.id = $1 and c.state = 'published'`, [request.params.id],
    );
    const row = result.rows[0];
    const service = row?.latest_content?.services?.find(item => item.name === row.content.serviceName);
    if (!row || row.latest_content?.businessName !== row.content.businessName
      || service?.description !== row.content.description) return reply.code(404).send({ error: 'not_found' });
    return { campaignId: request.params.id, releaseId: row.id, organizationId: row.organization_id,
      ...row.content, ctaPath: `/public/${row.organization_id}` };
  });
}
