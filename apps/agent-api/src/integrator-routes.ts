import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { BusinessRuntime } from './business.js';
import { integratorGrant } from './integrator-auth.js';
import { insertMessage, messageReplay, recordInquiryEvent } from './inquiries.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedScopes = new Set(['ap.agent.read', 'ap.conversations.read',
  'ap.conversations.reply', 'ap.sources.refresh']);
const idempotencyKey = /^[A-Za-z0-9_-]{43}$/;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
type Client = { clientId: string; name: string | null; scopes: string[] };

async function session(request: FastifyRequest, reply: FastifyReply, runtime: BusinessRuntime) {
  const actor = await runtime.resolveSession?.(request.headers);
  if (!actor) { reply.code(401).send({ error: 'authentication_required' }); return null; }
  return actor;
}

async function client(runtime: BusinessRuntime, clientId: unknown): Promise<Client | null> {
  if (typeof clientId !== 'string' || clientId.length < 1 || clientId.length > 200) return null;
  const result = await runtime.pool.query<Client>(
    `select c."clientId", c.name, c.scopes from "oauthClient" c
     join "oauthClientResource" cr on cr."clientId" = c."clientId"
     where c."clientId" = $1 and cr."resourceId" = $2
       and c."clientSecret" is not null
       and (c."applicationType" = 'web' or ($3::boolean and c."applicationType" = 'native'))
       and coalesce(c.disabled, false) = false`,
    [clientId, new URL('/integrations/v1', process.env.AP_AUTH_BASE_URL).toString(),
      process.env.AP_PROFILE === 'mock'],
  );
  return result.rows[0] ?? null;
}

export function registerIntegratorRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get<{ Querystring: { clientId?: string } }>('/integrations/v1/authorization/options', async (request, reply) => {
    const actor = await session(request, reply, runtime);
    if (!actor) return reply;
    const selectedClient = await client(runtime, request.query.clientId);
    if (!selectedClient) return reply.code(404).send({ error: 'client_not_available' });
    const organizations = await runtime.pool.query<{ id: string; name: string; agent_id: string;
      agent_name: string; agent_revision: number }>(
      `select o.id, o.name, a.agent_id, a.content->>'name' as agent_name, a.revision as agent_revision
       from ap.organizations o join ap.memberships m on m.organization_id = o.id
       join lateral (select agent_id, content, revision, knowledge_release_id from ap.agent_releases
         where organization_id = o.id order by revision desc limit 1) a on true
       where m.user_id = $1 and m.role = 'owner'
         and a.knowledge_release_id = (select id from ap.knowledge_releases
           where organization_id = o.id order by revision desc limit 1)
       order by o.created_at`, [actor.userId],
    );
    const deployments = organizations.rows.length ? await runtime.pool.query<{ id: string; organization_id: string;
      public_id: string; kind: string; allowed_origin: string | null }>(
      `select d.id, d.organization_id, d.public_id, d.kind, d.allowed_origin
       from ap.deployments d where d.organization_id = any($1::uuid[])
         and d.kind in ('link', 'owned_embed', 'placement_embed') and d.status = 'active'
       order by d.created_at`, [organizations.rows.map(row => row.id)],
    ) : { rows: [] };
    return reply.header('Cache-Control', 'no-store').send({
      client: { id: selectedClient.clientId, name: selectedClient.name,
        scopes: selectedClient.scopes.filter(scope => allowedScopes.has(scope)) },
      organizations: organizations.rows.map(row => ({ id: row.id, name: row.name,
        agentId: row.agent_id, agentName: row.agent_name, agentRevision: row.agent_revision,
        deployments: deployments.rows.filter(item => item.organization_id === row.id).map(item => ({
          id: item.id, publicId: item.public_id, kind: item.kind, origin: item.allowed_origin,
        })) })),
    });
  });

  app.post('/integrations/v1/authorization/selections', async (request, reply) => {
    const actor = await session(request, reply, runtime);
    if (!actor) return reply;
    const body = object(request.body);
    const clientId = body?.clientId;
    const organizationId = body?.organizationId;
    const agentId = body?.agentId;
    const deploymentIds = body?.deploymentIds;
    const scopes = body?.scopes;
    if (!uuid.test(String(organizationId)) || !uuid.test(String(agentId))
      || !Array.isArray(deploymentIds) || deploymentIds.length > 20
      || deploymentIds.some(id => typeof id !== 'string' || !uuid.test(id))
      || new Set(deploymentIds).size !== deploymentIds.length
      || !Array.isArray(scopes) || scopes.length < 1 || scopes.some(scope => !allowedScopes.has(scope))
      || new Set(scopes).size !== scopes.length)
      return reply.code(400).send({ error: 'invalid_selection' });
    const selectedClient = await client(runtime, clientId);
    if (!selectedClient) return reply.code(404).send({ error: 'client_not_available' });
    if (scopes.some(scope => !selectedClient.scopes.includes(scope)))
      return reply.code(403).send({ error: 'scope_not_registered' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const owned = await db.query(
        `select 1 from ap.memberships m join ap.agent_releases a on a.organization_id = m.organization_id
         where m.organization_id = $1 and m.user_id = $2 and m.role = 'owner'
           and a.agent_id = $3 and a.id = (select id from ap.agent_releases
             where organization_id = $1 order by revision desc limit 1)
           and a.knowledge_release_id = (select id from ap.knowledge_releases
             where organization_id = $1 order by revision desc limit 1)
         for share of m`, [organizationId, actor.userId, agentId],
      );
      if (!owned.rows[0]) { await db.query('rollback'); return reply.code(404).send({ error: 'organization_not_found' }); }
      if (deploymentIds.length) {
        const deployments = await db.query<{ id: string }>(
          `select id from ap.deployments where organization_id = $1 and id = any($2::uuid[])
           and kind in ('link', 'owned_embed', 'placement_embed') and status = 'active'`,
          [organizationId, deploymentIds]);
        if (deployments.rows.length !== deploymentIds.length) {
          await db.query('rollback'); return reply.code(404).send({ error: 'deployment_not_found' });
        }
      }
      const id = randomUUID();
      await db.query(
        `insert into ap.oauth_selections(id, session_id, actor_user_id, client_id,
           organization_id, agent_id, allowed_deployment_ids, requested_scopes, selection_expires_at)
         values ($1,$2,$3,$4,$5,$6,$7::uuid[],$8::text[],now() + interval '5 minutes')`,
        [id, actor.id, actor.userId, clientId, organizationId, agentId, deploymentIds, scopes]);
      await db.query(
        `insert into ap.outbox(id, organization_id, event_type, aggregate_id, payload)
         values ($1,$2,'integration.selection.created',$3,$4::jsonb)`,
        [randomUUID(), organizationId, id, JSON.stringify({ selectionId: id, clientId, agentId })]);
      await db.query('commit');
      return reply.header('Cache-Control', 'no-store').code(201).send({ id,
        organizationId, agentId, deploymentIds, scopes, expiresInSeconds: 300 });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.get<{ Querystring: { clientId?: string } }>('/integrations/v1/authorization/current', async (request, reply) => {
    const actor = await session(request, reply, runtime);
    if (!actor) return reply;
    if (typeof request.query.clientId !== 'string' || !request.query.clientId)
      return reply.code(400).send({ error: 'client_id_required' });
    const found = await runtime.pool.query<{ id: string; client_id: string; organization_id: string;
      client_name: string | null; organization_name: string; agent_id: string; agent_name: string; requested_scopes: string[];
      allowed_deployment_ids: string[] }>(
      `select s.id, s.client_id, c.name as client_name, s.organization_id, o.name as organization_name,
         s.agent_id, a.content->>'name' as agent_name, s.requested_scopes, s.allowed_deployment_ids
       from ap.oauth_selections s join ap.organizations o on o.id = s.organization_id
       join "oauthClient" c on c."clientId" = s.client_id
       join ap.agent_releases a on a.organization_id = s.organization_id and a.agent_id = s.agent_id
       where s.session_id = $1 and s.actor_user_id = $2 and s.client_id = $3 and s.revoked_at is null
         and s.selection_expires_at > now()
       order by s.created_at desc, a.revision desc limit 1`, [actor.id, actor.userId, request.query.clientId],
    );
    const row = found.rows[0];
    if (!row) return reply.code(404).send({ error: 'selection_not_found' });
    return reply.header('Cache-Control', 'no-store').send({ id: row.id, clientId: row.client_id,
      clientName: row.client_name,
      organizationId: row.organization_id, organizationName: row.organization_name,
      agentId: row.agent_id, agentName: row.agent_name,
      deploymentIds: row.allowed_deployment_ids, scopes: row.requested_scopes });
  });

  app.post<{ Params: { id: string } }>('/integrations/v1/authorization/selections/:id/revoke', async (request, reply) => {
    const actor = await session(request, reply, runtime);
    if (!actor) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'selection_not_found' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const selected = await db.query<{ organization_id: string }>(
        `select s.organization_id from ap.oauth_selections s
         join ap.memberships m on m.organization_id = s.organization_id
         where s.id = $1 and s.actor_user_id = $2 and m.user_id = $2 and m.role = 'owner'
         for update of s`, [request.params.id, actor.userId]);
      if (!selected.rows[0]) { await db.query('rollback'); return reply.code(404).send({ error: 'selection_not_found' }); }
      const changed = await db.query(
        'update ap.oauth_selections set revoked_at = now() where id = $1 and revoked_at is null returning id',
        [request.params.id]);
      if (changed.rowCount) {
        await db.query('update "oauthAccessToken" set revoked = now() where "referenceId" = $1 and revoked is null',
          [request.params.id]);
        await db.query('update "oauthRefreshToken" set revoked = now() where "referenceId" = $1 and revoked is null',
          [request.params.id]);
        await db.query('delete from "oauthConsent" where "referenceId" = $1', [request.params.id]);
        await db.query(
          `insert into ap.outbox(id, organization_id, event_type, aggregate_id, payload)
           values ($1,$2,'integration.selection.revoked',$3,$4::jsonb)`,
          [randomUUID(), selected.rows[0].organization_id, request.params.id,
            JSON.stringify({ selectionId: request.params.id })]);
      }
      await db.query('commit');
      return reply.header('Cache-Control', 'no-store').send({ revoked: true });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.get('/integrations/v1/me', async (request, reply) => {
    const grant = await integratorGrant(request, reply, runtime);
    if (!grant) return reply;
    return reply.header('Cache-Control', 'private, no-store').send({
      grantId: grant.id, organizationId: grant.organization_id, agentId: grant.agent_id,
      deploymentIds: grant.allowed_deployment_ids,
      scopes: grant.requested_scopes.filter(scope => grant.token_scopes.includes(scope)
        && grant.consent_scopes.includes(scope)),
      state: 'active',
    });
  });

  app.get('/integrations/v1/agent', async (request, reply) => {
    const grant = await integratorGrant(request, reply, runtime, 'ap.agent.read');
    if (!grant) return reply;
    const result = await runtime.pool.query<{ agent_id: string; revision: number; name: string;
      knowledge_revision: number }>(
      `select agent_id, revision, content->>'name' as name, knowledge_revision
       from ap.agent_releases where organization_id = $1 and agent_id = $2
       order by revision desc limit 1`, [grant.organization_id, grant.agent_id],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send({ error: 'agent_not_found' });
    return reply.header('Cache-Control', 'private, no-store').send({ organizationId: grant.organization_id,
      agentId: row.agent_id, revision: row.revision, name: row.name,
      knowledgeRevision: row.knowledge_revision });
  });

  app.get('/integrations/v1/deployments', async (request, reply) => {
    const grant = await integratorGrant(request, reply, runtime, 'ap.agent.read');
    if (!grant) return reply;
    const found = await runtime.pool.query<{ id: string; public_id: string;
      kind: 'link' | 'owned_embed' | 'placement_embed'; allowed_origin: string | null }>(
      `select d.id, d.public_id, d.kind, d.allowed_origin
       from ap.deployments d join ap.agent_releases a on a.id = d.agent_release_id
       where d.organization_id = $1 and d.id = any($2::uuid[])
         and d.status = 'active' and d.kind in ('link','owned_embed','placement_embed')
         and (d.kind = 'link' or d.verified_at is not null)
         and a.agent_id = $3
         and a.id = (select id from ap.agent_releases where organization_id = $1 order by revision desc limit 1)
         and a.knowledge_release_id = (select id from ap.knowledge_releases
           where organization_id = $1 order by revision desc limit 1)
       order by d.created_at`,
      [grant.organization_id, grant.allowed_deployment_ids, grant.agent_id],
    );
    return reply.header('Cache-Control', 'private, no-store').send({
      deployments: found.rows.map(row => ({ id: row.id, publicId: row.public_id,
        kind: row.kind, origin: row.allowed_origin })),
    });
  });

  app.get<{ Params: { id: string } }>('/integrations/v1/events/:id/delivery', async (request, reply) => {
    const grant = await integratorGrant(request, reply, runtime, 'ap.conversations.read');
    if (!grant) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'event_not_found' });
    const found = await runtime.pool.query<{ source_event_id: string; connection_id: string;
      action_request_id: string; reservation_id: string; revision: number;
      state: string; received_at: Date; processed_at: Date | null; error_code: string | null;
      notification_state: string }>(
      `select i.source_event_id,i.connection_id,i.action_request_id,i.reservation_id,
         i.revision,i.state,i.received_at,i.processed_at,i.error_code,
         case when e.id is null then 'not_created'
           when n.id is null then 'not_applicable' else n.state end as notification_state
       from ap.field_event_inbox i
       join ap.field_action_requests a on a.id = i.action_request_id
         and a.connection_id = i.connection_id and a.reservation_id = i.reservation_id
         and a.organization_id = $2 and a.state = 'accepted_external'
       join ap.field_connections c on c.id = i.connection_id
         and c.ap_grant_id = $3 and c.ap_organization_id = $2
         and c.ap_agent_id = $4 and c.initiator_user_id = $5
         and c.status = 'review_required'
       join ap.inquiries q on q.id = a.inquiry_id and q.organization_id = a.organization_id
         and q.deployment_id = any($6::uuid[])
       left join ap.field_reservation_events e on e.field_event_id = i.source_event_id
         and e.action_request_id = a.id and e.reservation_id = i.reservation_id
       left join ap.notification_events n on n.field_reservation_event_id = e.id
         and n.audience = 'customer'
       where i.source_product = 'field' and i.source_event_id = $1`,
      [request.params.id, grant.organization_id, grant.id, grant.agent_id,
        grant.actor_user_id, grant.allowed_deployment_ids]);
    const row = found.rows[0];
    if (!row) return reply.code(404).send({ error: 'event_not_found' });
    return reply.header('Cache-Control', 'private, no-store').send({
      eventId: row.source_event_id, connectionId: row.connection_id,
      actionRequestId: row.action_request_id, reservationId: row.reservation_id,
      revision: row.revision, receiptState: 'received', processingState: row.state,
      receivedAt: row.received_at.toISOString(), processedAt: row.processed_at?.toISOString() ?? null,
      processingError: row.error_code, customerNotificationState: row.notification_state,
      customerReadState: 'not_recorded',
    });
  });

  app.get('/integrations/v1/conversations', async (request, reply) => {
    const grant = await integratorGrant(request, reply, runtime, 'ap.conversations.read');
    if (!grant) return reply;
    const rows = await runtime.pool.query<{ id: string; deployment_id: string; state: string;
      created_at: string; submitted_at: string | null }>(
      `select i.id, i.deployment_id, i.state, i.created_at, i.submitted_at
       from ap.inquiries i join ap.deployments d on d.id = i.deployment_id
       where i.organization_id = $1 and d.organization_id = $1 and d.status = 'active'
         and i.deployment_id = any($2::uuid[])
         and i.consent_at is not null and i.mode = 'human' order by i.created_at desc limit 50`,
      [grant.organization_id, grant.allowed_deployment_ids],
    );
    return reply.header('Cache-Control', 'private, no-store').send({ conversations: rows.rows.map(row => ({
      id: row.id, deploymentId: row.deployment_id, state: row.state,
      createdAt: row.created_at, submittedAt: row.submitted_at,
    })) });
  });

  app.get<{ Params: { id: string } }>('/integrations/v1/conversations/:id', async (request, reply) => {
    const grant = await integratorGrant(request, reply, runtime, 'ap.conversations.read');
    if (!grant) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'conversation_not_found' });
    const found = await runtime.pool.query<{ id: string; state: string; deployment_id: string;
      revision: number }>(
      `select i.id, i.state, i.deployment_id, i.revision from ap.inquiries i
       join ap.deployments d on d.id = i.deployment_id
       where i.id = $1 and i.organization_id = $2 and d.organization_id = $2
         and d.status = 'active' and i.deployment_id = any($3::uuid[])
         and i.consent_at is not null and i.mode = 'human'`,
      [request.params.id, grant.organization_id, grant.allowed_deployment_ids],
    );
    const conversation = found.rows[0];
    if (!conversation) return reply.code(404).send({ error: 'conversation_not_found' });
    return reply.header('Cache-Control', 'private, no-store').send({ id: conversation.id,
      deploymentId: conversation.deployment_id, state: conversation.state,
      revision: conversation.revision });
  });

  app.get<{ Params: { id: string }; Querystring: { after?: string; limit?: string } }>(
    '/integrations/v1/conversations/:id/messages', async (request, reply) => {
      const grant = await integratorGrant(request, reply, runtime, 'ap.conversations.read');
      if (!grant) return reply;
      if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'conversation_not_found' });
      const after = request.query.after ?? '0';
      const limit = Number(request.query.limit ?? '50');
      if (typeof after !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(after)
        || BigInt(after) > 9223372036854775807n || !Number.isSafeInteger(limit)
        || limit < 1 || limit > 100)
        return reply.code(400).send({ error: 'invalid_cursor' });
      const found = await runtime.pool.query(
        `select 1 from ap.inquiries i join ap.deployments d on d.id = i.deployment_id
         where i.id = $1 and i.organization_id = $2 and d.organization_id = $2
           and d.status = 'active' and i.deployment_id = any($3::uuid[])
           and i.consent_at is not null and i.mode = 'human'`,
        [request.params.id, grant.organization_id, grant.allowed_deployment_ids]);
      if (!found.rows[0]) return reply.code(404).send({ error: 'conversation_not_found' });
      const result = await runtime.pool.query<{ id: string; sequence: string; actor: string;
        body: string; created_at: string }>(
        `select id, sequence, actor, body, created_at from ap.inquiry_messages
         where inquiry_id = $1 and visibility = 'customer' and sequence > $2::bigint
         order by sequence limit $3`, [request.params.id, after, limit]);
      const messages = result.rows.map(row => ({ id: row.id, sequence: row.sequence,
        actor: row.actor, body: row.body, createdAt: row.created_at }));
      return reply.header('Cache-Control', 'private, no-store').send({
        conversationId: request.params.id, messages,
        nextAfter: messages.length ? messages[messages.length - 1]!.sequence : after,
      });
    });

  app.post<{ Params: { id: string } }>('/integrations/v1/conversations/:id/replies', async (request, reply) => {
    const grant = await integratorGrant(request, reply, runtime, 'ap.conversations.reply');
    if (!grant) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'conversation_not_found' });
    const input = object(request.body);
    const body = input?.body;
    const expectedRevision = input?.expectedRevision;
    const key = request.headers['idempotency-key'];
    if (typeof body !== 'string' || !body.trim() || body.length > 5000
      || !Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 0)
      return reply.code(400).send({ error: 'invalid_reply' });
    if (typeof key !== 'string' || !idempotencyKey.test(key))
      return reply.code(400).send({ error: 'invalid_idempotency_key' });
    const normalized = body.trim();
    const digest = (value: string) => createHash('sha256').update(value).digest('hex');
    const attempt = {
      keyHash: digest(`ap:integration:${grant.client_id}:${grant.id}:${request.params.id}:reply:${key}`),
      requestHash: digest(JSON.stringify({ actorUserId: grant.actor_user_id,
        body: normalized, expectedRevision })),
    };
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const selection = await db.query(
        'select id from ap.oauth_selections where id = $1 and revoked_at is null for share', [grant.id]);
      if (!selection.rows[0]) { await db.query('rollback'); return reply.code(401).send({ error: 'invalid_access_token' }); }
      const token = await db.query(
        `select id from "oauthAccessToken" where id = $1 and revoked is null
           and "expiresAt" > now() for share`, [grant.token_id]);
      if (!token.rows[0]) { await db.query('rollback'); return reply.code(401).send({ error: 'invalid_access_token' }); }
      const membership = await db.query(
        `select 1 from ap.memberships where organization_id = $1 and user_id = $2
           and role = 'owner' for share`, [grant.organization_id, grant.actor_user_id]);
      if (!membership.rows[0]) {
        await db.query('rollback'); return reply.code(401).send({ error: 'invalid_access_token' });
      }
      const inquiry = await db.query<{ organization_id: string; state: string;
        next_sequence: string; revision: number }>(
        `select i.organization_id, i.state, i.next_sequence, i.revision
         from ap.inquiries i join ap.deployments d on d.id = i.deployment_id
         where i.id = $1 and i.organization_id = $2 and d.organization_id = $2
           and d.status = 'active' and i.deployment_id = any($3::uuid[])
           and i.consent_at is not null and i.mode = 'human' for update of i,d`,
        [request.params.id, grant.organization_id, grant.allowed_deployment_ids],
      );
      const row = inquiry.rows[0];
      if (!row) { await db.query('rollback'); return reply.code(404).send({ error: 'conversation_not_found' }); }
      const replay = await messageReplay(db, request.params.id, attempt);
      if (replay) {
        await db.query('rollback');
        if ('error' in replay) return reply.code(409).send(replay);
        return reply.header('Cache-Control', 'no-store').code(200).send({
          ...replay, revision: row.revision, replayed: true });
      }
      if (row.state === 'closed') {
        await db.query('rollback'); return reply.code(409).send({ error: 'conversation_closed' });
      }
      if (row.revision !== expectedRevision) {
        await db.query('rollback');
        return reply.code(409).send({ error: 'revision_conflict', currentRevision: row.revision });
      }
      const messageId = await insertMessage(db, request.params.id, row.next_sequence,
        'owner', 'customer', normalized, attempt,
        { actorUserId: grant.actor_user_id, clientId: grant.client_id, grantId: grant.id });
      await db.query("update ap.inquiries set state = 'waiting_customer' where id = $1", [request.params.id]);
      await recordInquiryEvent(db, row.organization_id, 'ap.inquiry.owner_reply', request.params.id, messageId);
      await db.query('commit');
      return reply.header('Cache-Control', 'no-store').code(201).send({ messageId,
        state: 'waiting_customer', delivery: 'blocked_integration', revision: row.revision + 1,
        replayed: false });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
