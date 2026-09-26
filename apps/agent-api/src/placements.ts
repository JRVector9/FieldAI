import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';
import { rejectExpiredTrial } from './trial-access.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/i;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type Card = { businessName: string; serviceName: string; description: string; advertisementLabel: '광고'; ctaLabel: '상담하기' };
type Knowledge = { businessName: string; services: { name: string; description: string }[] };
type Placement = { id: string; organization_id: string; campaign_id: string; campaign_release_id: string;
  publisher_id: string; slot_id: string; state: string; request_hash: string; decision_reason: string | null;
  created_at: string; updated_at: string };
type PlacementView = Placement & { content: Card; content_hash: string; campaign_name: string;
  publisher_name: string; slot_name: string; slot_format: string; slot_state: string;
  origin: string; verified_until: string | null; current_release_id: string | null;
  campaign_state: string; knowledge_content: Knowledge | null; embed_ready: boolean };
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

async function authenticated(request: FastifyRequest, reply: FastifyReply, runtime: BusinessRuntime) {
  const id = await runtime.resolveUserId(request.headers);
  if (!id) reply.code(401).send({ error: 'authentication_required' });
  return id;
}

async function businessOwner(request: FastifyRequest, reply: FastifyReply, runtime: BusinessRuntime) {
  const user = await authenticated(request, reply, runtime);
  if (!user) return null;
  const header = request.headers['x-organization-id'];
  if (header !== undefined && (typeof header !== 'string' || !uuid.test(header))) {
    reply.code(400).send({ error: 'invalid_organization_id' }); return null;
  }
  const found = await runtime.pool.query<{ organization_id: string }>(
    `select organization_id from ap.memberships where user_id = $1 and role = 'owner'
       and ($2::uuid is null or organization_id = $2::uuid) order by created_at limit 1`, [user, header ?? null],
  );
  if (!found.rows[0]) { reply.code(404).send({ error: 'organization_not_found' }); return null; }
  return { user, organizationId: found.rows[0].organization_id };
}

async function mediaMember(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply,
  runtime: BusinessRuntime, owner: boolean) {
  const user = await authenticated(request, reply, runtime);
  if (!user) return null;
  if (!uuid.test(request.params.id)) { reply.code(404).send({ error: 'publisher_not_found' }); return null; }
  const found = await runtime.pool.query<{ role: string }>(
    `select role from ap.publisher_memberships where publisher_id = $1 and user_id = $2
     and ($3::boolean = false or role = 'owner')`, [request.params.id, user, owner],
  );
  if (!found.rows[0]) { reply.code(404).send({ error: 'publisher_not_found' }); return null; }
  return { user, publisherId: request.params.id };
}

async function view(client: PoolClient | BusinessRuntime['pool'], placementId: string) {
  const result = await client.query<PlacementView>(
    `select p.*, r.content, r.content_hash, c.name as campaign_name,
       c.current_release_id, c.state as campaign_state,
       pub.name as publisher_name, s.name as slot_name, s.format as slot_format,
       s.state as slot_state, d.origin, d.verified_until,
       exists (select 1 from ap.deployments ed join ap.agent_releases ea on ea.id = ed.agent_release_id
         where ed.placement_id = p.id and ed.status = 'active'
           and ea.id = (select id from ap.agent_releases where organization_id = p.organization_id
             order by revision desc limit 1)
           and ea.knowledge_release_id = (select id from ap.knowledge_releases
             where organization_id = p.organization_id order by revision desc limit 1)) as embed_ready,
       (select k.content from ap.knowledge_releases k where k.organization_id = p.organization_id
        order by k.revision desc limit 1) as knowledge_content
     from ap.placements p
     join ap.campaigns c on c.id = p.campaign_id
     join ap.campaign_releases r on r.id = p.campaign_release_id
     join ap.publishers pub on pub.id = p.publisher_id
     join ap.publisher_slots s on s.id = p.slot_id
     join ap.publisher_domains d on d.id = s.domain_id
     where p.id = $1`, [placementId],
  );
  return result.rows[0] ?? null;
}

function available(row: PlacementView) {
  const card = row.content;
  const knowledge = row.knowledge_content;
  const source = knowledge?.services?.find(item => item.name === card.serviceName);
  return row.state === 'approved' && row.campaign_state === 'published'
    && row.current_release_id === row.campaign_release_id && row.slot_state === 'active'
    && !!row.verified_until && new Date(row.verified_until).getTime() > Date.now()
    && knowledge?.businessName === card.businessName && source?.description === card.description;
}

export async function activePlacement(client: Pool | PoolClient, placementId: string) {
  if (!uuid.test(placementId)) return null;
  const row = await view(client, placementId);
  return row && available(row) ? { id: row.id, organizationId: row.organization_id,
    origin: row.origin, releaseId: row.campaign_release_id, card: row.content } : null;
}

function output(row: PlacementView) {
  return { id: row.id, campaignId: row.campaign_id, campaignName: row.campaign_name,
    releaseId: row.campaign_release_id, contentHash: row.content_hash, card: row.content,
    publisherId: row.publisher_id, publisherName: row.publisher_name,
    slotId: row.slot_id, slotName: row.slot_name, slotFormat: row.slot_format,
    origin: row.origin, state: row.state, available: available(row),
    installed: available(row) && row.embed_ready,
    decisionReason: row.decision_reason, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function record(client: PoolClient, row: Placement, event: string) {
  const payload = JSON.stringify({ placementId: row.id, campaignReleaseId: row.campaign_release_id,
    publisherId: row.publisher_id, slotId: row.slot_id, state: row.state });
  await client.query('insert into ap.outbox(id, organization_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
    [randomUUID(), row.organization_id, `placement.${event}`, row.id, payload]);
  await client.query('insert into ap.publisher_outbox(id, publisher_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
    [randomUUID(), row.publisher_id, `placement.${event}`, row.id, payload]);
}

async function requestConditions(client: PoolClient, campaignId: string, releaseId: string, slotId: string) {
  const result = await client.query<{ campaign_id: string; organization_id: string; campaign_state: string;
    current_release_id: string | null; card: Card; knowledge: Knowledge | null;
    publisher_id: string; slot_state: string; verified_until: string | null }>(
    `select c.id as campaign_id, c.organization_id, c.state as campaign_state, c.current_release_id,
       r.content as card,
       (select k.content from ap.knowledge_releases k where k.organization_id = c.organization_id
        order by k.revision desc limit 1) as knowledge,
       s.publisher_id, s.state as slot_state, d.verified_until
     from ap.campaigns c
     join ap.campaign_releases r on r.id = $2 and r.campaign_id = c.id
     join ap.publisher_slots s on s.id = $3
     join ap.publisher_domains d on d.id = s.domain_id
     where c.id = $1`, [campaignId, releaseId, slotId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const service = row.knowledge?.services?.find(item => item.name === row.card.serviceName);
  if (row.campaign_state !== 'published' || row.current_release_id !== releaseId
    || row.slot_state !== 'active' || !row.verified_until || new Date(row.verified_until).getTime() <= Date.now()
    || row.knowledge?.businessName !== row.card.businessName || service?.description !== row.card.description) return null;
  return row;
}

export function registerPlacementRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get('/v1/placement-slots', async (request, reply) => {
    const actor = await businessOwner(request, reply, runtime);
    if (!actor) return reply;
    const found = await runtime.pool.query<{ id: string; publisher_id: string; publisher_name: string;
      name: string; format: string; origin: string }>(
      `select s.id, s.publisher_id, p.name as publisher_name, s.name, s.format, d.origin
       from ap.publisher_slots s join ap.publishers p on p.id = s.publisher_id
       join ap.publisher_domains d on d.id = s.domain_id
       where s.state = 'active' and d.verified_until > now() order by p.name, s.name`,
    );
    return { slots: found.rows.map(row => ({ id: row.id, publisherId: row.publisher_id,
      publisherName: row.publisher_name, name: row.name, format: row.format, origin: row.origin })) };
  });

  app.get('/v1/placements', async (request, reply) => {
    const actor = await businessOwner(request, reply, runtime);
    if (!actor) return reply;
    const found = await runtime.pool.query<{ id: string }>(
      'select id from ap.placements where organization_id = $1 order by created_at desc limit 100', [actor.organizationId],
    );
    const rows = await Promise.all(found.rows.map(row => view(runtime.pool, row.id)));
    return { placements: rows.filter((row): row is PlacementView => !!row).map(output) };
  });

  app.post('/v1/placements', async (request, reply) => {
    const user = await authenticated(request, reply, runtime);
    if (!user) return reply;
    const body = object(request.body);
    const campaignId = body?.campaignId;
    const releaseId = body?.releaseId;
    const slotId = body?.slotId;
    const key = body?.idempotencyKey;
    if ([campaignId, releaseId, slotId, key].some(value => typeof value !== 'string' || !uuid.test(value)))
      return reply.code(400).send({ error: 'invalid_placement_request' });
    const requestHash = hash(JSON.stringify({ campaignId, releaseId, slotId }));
    const keyHash = hash(key as string);
    const client = await runtime.pool.connect();
    let organizationId: string | null = null;
    try {
      await client.query('begin');
      const membership = await client.query<{ organization_id: string }>(
        `select c.organization_id from ap.campaigns c join ap.memberships m
         on m.organization_id = c.organization_id and m.user_id = $2 and m.role = 'owner'
         where c.id = $1 for update of c`, [campaignId, user],
      );
      organizationId = membership.rows[0]?.organization_id ?? null;
      if (!organizationId) { await client.query('rollback'); return reply.code(404).send({ error: 'campaign_not_found' }); }
      const previous = await client.query<Placement>(
        'select * from ap.placements where organization_id = $1 and request_key_hash = $2', [organizationId, keyHash],
      );
      if (previous.rows[0]) {
        await client.query('commit');
        return previous.rows[0].request_hash === requestHash
          ? reply.code(200).send({ id: previous.rows[0].id, state: previous.rows[0].state })
          : reply.code(409).send({ error: 'idempotency_conflict' });
      }
      const duplicate = await client.query<Placement>(
        'select * from ap.placements where campaign_release_id = $1 and slot_id = $2', [releaseId, slotId],
      );
      if (duplicate.rows[0]) {
        await client.query('commit');
        return reply.code(200).send({ id: duplicate.rows[0].id, state: duplicate.rows[0].state });
      }
      if (await rejectExpiredTrial(reply, client, organizationId)) {
        await client.query('rollback'); return reply;
      }
      const conditions = await requestConditions(client, campaignId as string, releaseId as string, slotId as string);
      if (!conditions || conditions.organization_id !== organizationId) {
        await client.query('rollback'); return reply.code(409).send({ error: 'placement_conditions_changed' });
      }
      const id = randomUUID();
      const inserted = await client.query<Placement>(
        `insert into ap.placements(id, organization_id, campaign_id, campaign_release_id,
         publisher_id, slot_id, request_key_hash, request_hash, requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [id, organizationId, campaignId, releaseId, conditions.publisher_id, slotId, keyHash, requestHash, user],
      );
      await record(client, inserted.rows[0]!, 'requested');
      await client.query('commit');
      return reply.code(201).send({ id, state: 'requested' });
    } catch (error) {
      await client.query('rollback');
      if ((error as { code?: string }).code === '23505') {
        if (!organizationId) throw error;
        const previous = await runtime.pool.query<Placement>(
          `select * from ap.placements where organization_id = $1 and
           (request_key_hash = $2 or (campaign_release_id = $3 and slot_id = $4)) limit 1`,
          [organizationId, keyHash, releaseId, slotId],
        );
        const row = previous.rows[0];
        if (row?.request_hash === requestHash) return reply.code(200).send({ id: row.id, state: row.state });
        return reply.code(409).send({ error: 'idempotency_conflict' });
      }
      throw error;
    } finally { client.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/publishers/:id/placements', async (request, reply) => {
    const actor = await mediaMember(request, reply, runtime, false);
    if (!actor) return reply;
    const found = await runtime.pool.query<{ id: string }>(
      'select id from ap.placements where publisher_id = $1 order by created_at desc limit 100', [actor.publisherId],
    );
    const rows = await Promise.all(found.rows.map(row => view(runtime.pool, row.id)));
    return { placements: rows.filter((row): row is PlacementView => !!row).map(output) };
  });

  async function mediaDecision(request: FastifyRequest<{ Params: { id: string; placementId: string } }>, reply: FastifyReply,
    action: 'approve' | 'reject' | 'suspend') {
    const actor = await mediaMember(request, reply, runtime, true);
    if (!actor) return reply;
    if (!uuid.test(request.params.placementId)) return reply.code(404).send({ error: 'placement_not_found' });
    const body = object(request.body);
    const expectedReleaseId = body?.expectedReleaseId;
    const expectedContentHash = body?.expectedContentHash;
    const reason = body?.reason;
    if (typeof expectedReleaseId !== 'string' || !uuid.test(expectedReleaseId)
      || (action === 'approve' && (typeof expectedContentHash !== 'string' || !sha256.test(expectedContentHash)))
      || (action === 'reject' && (typeof reason !== 'string' || !reason.trim() || reason.length > 500)))
      return reply.code(400).send({ error: 'invalid_decision' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const result = await client.query<Placement>(
        'select * from ap.placements where id = $1 and publisher_id = $2 for update', [request.params.placementId, actor.publisherId],
      );
      const row = result.rows[0];
      if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'placement_not_found' }); }
      if (row.campaign_release_id !== expectedReleaseId) {
        await client.query('rollback'); return reply.code(409).send({ error: 'release_conflict' });
      }
      const nextState = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'suspended';
      if (row.state === nextState) {
        if (action === 'approve') {
          const release = await client.query<{ content_hash: string }>(
            'select content_hash from ap.campaign_releases where id = $1 and campaign_id = $2',
            [row.campaign_release_id, row.campaign_id],
          );
          if (release.rows[0]?.content_hash !== expectedContentHash) {
            await client.query('rollback'); return reply.code(409).send({ error: 'card_or_slot_changed' });
          }
        }
        if (action === 'reject' && row.decision_reason !== (reason as string).trim()) {
          await client.query('rollback'); return reply.code(409).send({ error: 'decision_conflict' });
        }
        await client.query('commit'); return { id: row.id, state: nextState };
      }
      if (action === 'suspend' ? row.state !== 'approved' : row.state !== 'requested') {
        await client.query('rollback'); return reply.code(409).send({ error: 'placement_state_conflict' });
      }
      if (action === 'approve') {
        const release = await client.query<{ content_hash: string }>(
          'select content_hash from ap.campaign_releases where id = $1 and campaign_id = $2',
          [row.campaign_release_id, row.campaign_id],
        );
        const conditions = await requestConditions(client, row.campaign_id, row.campaign_release_id, row.slot_id);
        if (!conditions || release.rows[0]?.content_hash !== expectedContentHash) {
          await client.query('rollback'); return reply.code(409).send({ error: 'card_or_slot_changed' });
        }
      }
      const updated = await client.query<Placement>(
        `update ap.placements set state = $2, decided_by = $3, decided_at = now(),
         decision_reason = $4, updated_at = now() where id = $1 returning *`,
        [row.id, nextState, actor.user, action === 'reject' ? (reason as string).trim() : null],
      );
      await record(client, updated.rows[0]!, nextState);
      await client.query('commit');
      return { id: row.id, state: nextState };
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  }

  for (const action of ['approve', 'reject', 'suspend'] as const) {
    app.post<{ Params: { id: string; placementId: string } }>(`/v1/publishers/:id/placements/:placementId/${action}`,
      (request, reply) => mediaDecision(request, reply, action));
  }

  app.post<{ Params: { id: string; placementId: string } }>(
    '/v1/publishers/:id/placements/:placementId/install', async (request, reply) => {
      const actor = await mediaMember(request, reply, runtime, true);
      if (!actor) return reply;
      if (!uuid.test(request.params.placementId)) return reply.code(404).send({ error: 'placement_not_found' });
      const webOrigin = process.env.AP_PUBLIC_WEB_ORIGIN ?? (process.env.AP_PROFILE === 'mock' ? 'http://localhost:3001' : null);
      if (!webOrigin) return reply.code(503).send({ error: 'public_web_origin_not_configured' });
      const client = await runtime.pool.connect();
      try {
        await client.query('begin');
        const placement = await client.query<Placement>(
          'select * from ap.placements where id = $1 and publisher_id = $2 for update',
          [request.params.placementId, actor.publisherId],
        );
        if (!placement.rows[0]) { await client.query('rollback'); return reply.code(404).send({ error: 'placement_not_found' }); }
        const active = await activePlacement(client, request.params.placementId);
        if (!active) { await client.query('rollback'); return reply.code(409).send({ error: 'placement_not_available' }); }
        const agent = await client.query<{ id: string; knowledge_revision: number; knowledge_release_id: string }>(
          `select id, knowledge_revision, knowledge_release_id from ap.agent_releases
           where organization_id = $1 order by revision desc limit 1`, [active.organizationId],
        );
        const knowledge = await client.query<{ id: string }>(
          'select id from ap.knowledge_releases where organization_id = $1 order by revision desc limit 1',
          [active.organizationId],
        );
        if (!agent.rows[0] || agent.rows[0].knowledge_release_id !== knowledge.rows[0]?.id) {
          await client.query('rollback'); return reply.code(409).send({ error: 'agent_not_ready' });
        }
        const existing = await client.query<{ id: string; public_id: string }>(
          'select id, public_id from ap.deployments where placement_id = $1 for update', [active.id],
        );
        const deployed = existing.rows[0];
        const publicId = deployed?.public_id ?? `dep_${randomUUID().replaceAll('-', '')}`;
        if (deployed) {
          await client.query(
            `update ap.deployments set status = 'active', agent_release_id = $2,
               knowledge_revision = $3, updated_at = now() where id = $1`,
            [deployed.id, agent.rows[0].id, agent.rows[0].knowledge_revision],
          );
        } else {
          await client.query(
            `insert into ap.deployments(id, organization_id, public_id, kind, allowed_origin, verified_at,
               status, agent_release_id, knowledge_revision, created_by, placement_id)
             values ($1,$2,$3,'placement_embed',$4,now(),'active',$5,$6,$7,$8)`,
            [randomUUID(), active.organizationId, publicId, active.origin, agent.rows[0].id,
              agent.rows[0].knowledge_revision, actor.user, active.id],
          );
        }
        await client.query('commit');
        const script = `<script async src="${webOrigin}/sdk/v1.js" data-deployment="${publicId}" data-mode="inline"></script>`;
        return reply.code(deployed ? 200 : 201).send({ placementId: active.id, publicId, origin: active.origin, script });
      } catch (error) { await client.query('rollback'); throw error; }
      finally { client.release(); }
    },
  );

  app.post<{ Params: { id: string } }>('/v1/placements/:id/cancel', async (request, reply) => {
    const user = await authenticated(request, reply, runtime);
    if (!user) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'placement_not_found' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const result = await client.query<Placement>(
        `select p.* from ap.placements p join ap.memberships m
         on m.organization_id = p.organization_id and m.user_id = $2 and m.role = 'owner'
         where p.id = $1 for update of p`, [request.params.id, user],
      );
      const row = result.rows[0];
      if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'placement_not_found' }); }
      if (row.state === 'cancelled') { await client.query('commit'); return { id: row.id, state: row.state }; }
      if (row.state !== 'requested' && row.state !== 'approved' && row.state !== 'suspended') {
        await client.query('rollback'); return reply.code(409).send({ error: 'placement_state_conflict' });
      }
      const updated = await client.query<Placement>(
        `update ap.placements set state = 'cancelled', decided_by = $2, decided_at = now(),
         updated_at = now() where id = $1 returning *`, [row.id, user],
      );
      await record(client, updated.rows[0]!, 'cancelled');
      await client.query('commit');
      return { id: row.id, state: 'cancelled' };
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/public/placements/:id', async (request, reply) => {
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'not_found' });
    const row = await view(runtime.pool, request.params.id);
    if (!row || !available(row)) return reply.code(404).send({ error: 'not_found' });
    const install = await runtime.pool.query<{ public_id: string }>(
      `select d.public_id from ap.deployments d
       join ap.agent_releases a on a.id = d.agent_release_id
       where d.placement_id = $1 and d.status = 'active'
         and a.id = (select id from ap.agent_releases where organization_id = d.organization_id
           order by revision desc limit 1)
         and a.knowledge_release_id = (select id from ap.knowledge_releases
           where organization_id = d.organization_id order by revision desc limit 1)`, [row.id],
    );
    return reply.header('Cache-Control', 'no-store').send({ placementId: row.id, campaignId: row.campaign_id,
      releaseId: row.campaign_release_id, publisherName: row.publisher_name,
      ...row.content, ctaPath: install.rows[0] ? `/consult/${install.rows[0].public_id}` : null });
  });
}
