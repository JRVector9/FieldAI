import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { fieldIntegratorGrant } from './integrator-auth.js';
import { inspectStoredApGrant, refreshStoredApGrant } from './ap-connector.js';
import { integratorAvailability } from './bookings.js';
import { recordFieldRevocation } from './revocation-journal.js';
import { registerExternalRequestPublicRoutes } from './external-request-public-routes.js';
import { registerApWebhookInbox } from './ap-webhook-inbox.js';
import { organizationDeletionScheduled } from './subscription-access.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedScopes = new Set(['field.facts.read', 'field.availability.read',
  'field.requests.create', 'field.requests.read', 'field.customer_access.create',
  'field.proposals.respond', 'field.notification_route.read']);
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const eventSecretPattern = /^[A-Za-z0-9_-]{43}$/;
function fieldEventKey(tokenKey: Buffer) {
  return createHash('sha256').update(tokenKey).update('field-ap-event-route-v1').digest();
}
function sealEventSecret(value: string, tokenKey: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', fieldEventKey(tokenKey), iv);
  return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]);
}
export function unsealApEventSecret(data: Buffer, tokenKey: Buffer) {
  const decipher = createDecipheriv('aes-256-gcm', fieldEventKey(tokenKey), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(12, -16)), decipher.final()]).toString('utf8');
}
type Client = { clientId: string; name: string | null; scopes: string[] };

async function session(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime) {
  const actor = await runtime.resolveSession?.(request.headers);
  if (!actor) { reply.code(401).send({ error: 'authentication_required' }); return null; }
  return actor;
}

async function client(runtime: FieldBusinessRuntime, clientId: unknown): Promise<Client | null> {
  if (typeof clientId !== 'string' || clientId.length < 1 || clientId.length > 200
    || !process.env.FIELD_AUTH_BASE_URL) return null;
  const result = await runtime.pool.query<Client>(
    `select c."clientId", c.name, c.scopes from "oauthClient" c
     join "oauthClientResource" cr on cr."clientId" = c."clientId"
     where c."clientId" = $1 and cr."resourceId" = $2
       and c."clientSecret" is not null
       and (c."applicationType" = 'web' or ($3::boolean and c."applicationType" = 'native'))
       and coalesce(c.disabled, false) = false`,
    [clientId, new URL('/integrations/v1', process.env.FIELD_AUTH_BASE_URL).toString(),
      process.env.FIELD_PROFILE === 'mock'],
  );
  return result.rows[0] ?? null;
}

export function registerFieldIntegratorRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  // 공개 계약 preview.9 경로(Field ID 조회·고객 제안 결정·알림 경로·AP 사건 수신함)도 같은 통합 모듈에서 등록한다.
  registerExternalRequestPublicRoutes(app, runtime);
  registerApWebhookInbox(app, runtime);
  app.get<{ Querystring: { clientId?: string } }>('/integrations/v1/authorization/options', async (request, reply) => {
    const actor = await session(request, reply, runtime);
    if (!actor) return reply;
    const selectedClient = await client(runtime, request.query.clientId);
    if (!selectedClient) return reply.code(404).send({ error: 'client_not_available' });
    const organizations = await runtime.pool.query<{ id: string; name: string; catalog_revision: number | null }>(
      `select o.id, o.name, (select max(revision) from field.catalog_releases
          where organization_id = o.id) as catalog_revision
       from field.organizations o join field.memberships m on m.organization_id = o.id
       where m.user_id = $1 and m.role = 'owner' order by o.created_at`, [actor.userId],
    );
    return reply.header('Cache-Control', 'no-store').send({
      client: { id: selectedClient.clientId, name: selectedClient.name,
        scopes: selectedClient.scopes.filter(scope => allowedScopes.has(scope)) },
      organizations: organizations.rows.map(row => ({ id: row.id, name: row.name,
        catalogRevision: row.catalog_revision })),
    });
  });

  app.post('/integrations/v1/authorization/selections', async (request, reply) => {
    const actor = await session(request, reply, runtime);
    if (!actor) return reply;
    const body = object(request.body);
    const clientId = body?.clientId;
    const organizationId = body?.organizationId;
    const scopes = body?.scopes;
    if (!uuid.test(String(organizationId)) || !Array.isArray(scopes) || scopes.length < 1
      || scopes.some(scope => !allowedScopes.has(scope)) || new Set(scopes).size !== scopes.length)
      return reply.code(400).send({ error: 'invalid_selection' });
    const selectedClient = await client(runtime, clientId);
    if (!selectedClient) return reply.code(404).send({ error: 'client_not_available' });
    if (scopes.some(scope => !selectedClient.scopes.includes(scope)))
      return reply.code(403).send({ error: 'scope_not_registered' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const owned = await db.query(
        `select 1 from field.memberships where organization_id = $1 and user_id = $2
           and role = 'owner' for share`, [organizationId, actor.userId]);
      if (!owned.rows[0]) { await db.query('rollback'); return reply.code(404).send({ error: 'organization_not_found' }); }
      // H1: 삭제 예약·완료 조직은 새 통합 선택(grant)을 만들지 않는다.
      if (await organizationDeletionScheduled(db, organizationId as string)) {
        await db.query('rollback'); return reply.code(409).send({ error: 'deletion_scheduled' });
      }
      const id = randomUUID();
      await db.query(
        `insert into field.oauth_selections(id, session_id, actor_user_id, client_id,
           organization_id, requested_scopes, selection_expires_at)
         values ($1,$2,$3,$4,$5,$6::text[],now() + interval '5 minutes')`,
        [id, actor.id, actor.userId, clientId, organizationId, scopes]);
      await db.query(
        `insert into field.outbox(id, organization_id, event_type, aggregate_id, payload)
         values ($1,$2,'field.integration.selection.created',$3,$4::jsonb)`,
        [randomUUID(), organizationId, id, JSON.stringify({ selectionId: id, clientId })]);
      await db.query('commit');
      return reply.header('Cache-Control', 'no-store').code(201).send({ id,
        organizationId, scopes, expiresInSeconds: 300 });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.get<{ Querystring: { clientId?: string } }>('/integrations/v1/authorization/current', async (request, reply) => {
    const actor = await session(request, reply, runtime);
    if (!actor) return reply;
    if (typeof request.query.clientId !== 'string' || !request.query.clientId)
      return reply.code(400).send({ error: 'client_id_required' });
    const found = await runtime.pool.query<{ id: string; client_id: string; client_name: string | null;
      organization_id: string; organization_name: string; requested_scopes: string[] }>(
      `select s.id, s.client_id, c.name as client_name, s.organization_id,
         o.name as organization_name, s.requested_scopes
       from field.oauth_selections s join field.organizations o on o.id = s.organization_id
       join "oauthClient" c on c."clientId" = s.client_id
       where s.session_id = $1 and s.actor_user_id = $2 and s.client_id = $3
         and s.revoked_at is null and s.selection_expires_at > now()
       order by s.created_at desc limit 1`, [actor.id, actor.userId, request.query.clientId],
    );
    const row = found.rows[0];
    if (!row) return reply.code(404).send({ error: 'selection_not_found' });
    return reply.header('Cache-Control', 'no-store').send({ id: row.id, clientId: row.client_id,
      clientName: row.client_name, organizationId: row.organization_id,
      organizationName: row.organization_name, scopes: row.requested_scopes });
  });

  app.post<{ Params: { id: string } }>('/integrations/v1/authorization/selections/:id/revoke', async (request, reply) => {
    const actor = await session(request, reply, runtime);
    if (!actor) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'selection_not_found' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const selected = await db.query<{ organization_id: string; revoked_at: Date | null }>(
        `select s.organization_id,s.revoked_at from field.oauth_selections s
         join field.memberships m on m.organization_id = s.organization_id
         where s.id = $1 and s.actor_user_id = $2 and m.user_id = $2 and m.role = 'owner'
         for update of s`, [request.params.id, actor.userId]);
      if (!selected.rows[0]) { await db.query('rollback'); return reply.code(404).send({ error: 'selection_not_found' }); }
      if (!selected.rows[0].revoked_at) await recordFieldRevocation(runtime.revocationJournal, {
        targetKind: 'selection', targetId: request.params.id, organizationId: selected.rows[0].organization_id,
        selectionId: request.params.id, source: 'owner', revocationId: null });
      const changed = await db.query(
        'update field.oauth_selections set revoked_at = now() where id = $1 and revoked_at is null returning id',
        [request.params.id]);
      if (changed.rowCount) {
        await db.query('update "oauthAccessToken" set revoked = now() where "referenceId" = $1 and revoked is null',
          [request.params.id]);
        await db.query('update "oauthRefreshToken" set revoked = now() where "referenceId" = $1 and revoked is null',
          [request.params.id]);
        await db.query('delete from "oauthConsent" where "referenceId" = $1', [request.params.id]);
        await db.query(
          `insert into field.outbox(id, organization_id, event_type, aggregate_id, payload)
           values ($1,$2,'field.integration.selection.revoked',$3,$4::jsonb)`,
          [randomUUID(), selected.rows[0].organization_id, request.params.id,
            JSON.stringify({ selectionId: request.params.id })]);
      }
      await db.query('commit');
      return reply.header('Cache-Control', 'no-store').send({ revoked: true });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.get('/integrations/v1/me', async (request, reply) => {
    const grant = await fieldIntegratorGrant(request, reply, runtime);
    if (!grant) return reply;
    return reply.header('Cache-Control', 'private, no-store').send({
      grantId: grant.id, organizationId: grant.organization_id,
      scopes: grant.requested_scopes.filter(scope => grant.token_scopes.includes(scope)
        && grant.consent_scopes.includes(scope)), state: 'active',
    });
  });

  app.get('/integrations/v1/capabilities', async (request, reply) => {
    const grant = await fieldIntegratorGrant(request, reply, runtime);
    if (!grant) return reply;
    const permitted = (scope: string) => grant.requested_scopes.includes(scope)
      && grant.token_scopes.includes(scope) && grant.consent_scopes.includes(scope);
    return reply.header('Cache-Control', 'private, no-store').send({
      organizationId: grant.organization_id, schemaVersion: '1.0',
      capabilities: { 'facts.read': permitted('field.facts.read'),
        'availability.read': permitted('field.availability.read'),
        'request.create': permitted('field.requests.create'),
        'customer_access.create': permitted('field.customer_access.create'),
        'proposal.respond': permitted('field.proposals.respond') },
    });
  });

  app.get('/integrations/v1/facts', async (request, reply) => {
    const grant = await fieldIntegratorGrant(request, reply, runtime, 'field.facts.read');
    if (!grant) return reply;
    const found = await runtime.pool.query<{ id: string; revision: number; content_hash: string;
      approved_at: string; content: Record<string, unknown> }>(
      `select id, revision, content_hash, approved_at, content
       from field.catalog_releases where organization_id = $1
       order by revision desc limit 1`, [grant.organization_id],
    );
    const row = found.rows[0];
    if (!row) return reply.code(404).send({ error: 'approved_facts_not_found' });
    const content = row.content;
    const services = Array.isArray(content.services) ? content.services : [];
    return reply.header('Cache-Control', 'private, no-store').send({
      organizationId: grant.organization_id, releaseId: row.id, revision: row.revision,
      contentHash: row.content_hash, publishedAt: row.approved_at,
      businessName: content.businessName, introduction: content.introduction,
      region: content.region, openingHours: content.openingHours,
      faqs: Array.isArray(content.faqs) ? content.faqs : [],
      services: services.map(value => {
        const service = object(value) ?? {};
        return { id: service.id, name: service.name, description: service.description,
          bookingMode: service.bookingMode, durationMinutes: service.durationMinutes,
          priceAmount: service.priceAmount };
      }),
    });
  });

  app.get<{ Querystring: { serviceId?: string; date?: string } }>('/integrations/v1/availability', async (request, reply) => {
    const grant = await fieldIntegratorGrant(request, reply, runtime, 'field.availability.read');
    if (!grant) return reply;
    const result = await integratorAvailability(runtime, grant.organization_id,
      request.query.serviceId ?? '', request.query.date);
    return reply.header('Cache-Control', 'private, no-store')
      .code(result.status).send('error' in result ? { error: result.error } : result.body);
  });

  app.post<{ Params: { id: string } }>('/integrations/v1/connections/:id/bind', async (request, reply) => {
    const grant = await fieldIntegratorGrant(request, reply, runtime, 'field.facts.read');
    if (!grant) return reply;
    const config = runtime.apConnector;
    if (!config?.reverseClientId) return reply.code(503).send({ error: 'blocked_integration' });
    if (grant.client_id !== config.reverseClientId)
      return reply.code(403).send({ error: 'client_not_allowed' });
    const body = object(request.body);
    if (!uuid.test(request.params.id) || !uuid.test(String(body?.apGrantId))
      || !uuid.test(String(body?.apOrganizationId)) || !uuid.test(String(body?.apAgentId))
      || body?.fieldGrantId !== grant.id || !uuid.test(String(body.eventKeyId))
      || typeof body.eventSecret !== 'string' || !eventSecretPattern.test(body.eventSecret)
      || body.routeGeneration !== 1) return reply.code(400).send({ error: 'invalid_binding' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const found = await db.query<{ organization_id: string; initiator_user_id: string;
        ap_issuer: string; ap_client_id: string; ap_grant_id: string; ap_organization_id: string;
        ap_agent_id: string; access_token_cipher: Buffer; refresh_token_cipher: Buffer;
        access_expires_at: Date;
        status: string; field_grant_id: string | null; field_client_id: string | null;
        event_key_id: string | null; event_secret_cipher: Buffer | null; route_generation: number | null }>(
        `select organization_id, initiator_user_id, ap_issuer, ap_client_id, ap_grant_id,
          ap_organization_id, ap_agent_id, access_token_cipher, refresh_token_cipher, access_expires_at,
          status, field_grant_id, field_client_id,
          event_key_id, event_secret_cipher, route_generation
         from field.ap_connections where id = $1 and organization_id = $2 for update`,
        [request.params.id, grant.organization_id]);
      const connection = found.rows[0];
      if (!connection) { await db.query('rollback'); return reply.code(404).send({ error: 'connection_not_found' }); }
      if (connection.initiator_user_id !== grant.actor_user_id) {
        await db.query('rollback');
        return reply.code(403).send({ error: 'actor_not_allowed' });
      }
      if (connection.ap_grant_id !== body.apGrantId || connection.ap_organization_id !== body.apOrganizationId
        || connection.ap_agent_id !== body.apAgentId || connection.ap_issuer !== config.issuer
        || connection.ap_client_id !== config.clientId) {
        await db.query('rollback');
        return reply.code(409).send({ error: 'connection_scope_mismatch' });
      }
      if (connection.status === 'review_required' && connection.field_grant_id === grant.id
        && connection.field_client_id === grant.client_id) {
        let sameSecret = false;
        try {
          const oldSecret = connection.event_secret_cipher
            ? unsealApEventSecret(connection.event_secret_cipher, config.tokenKey) : '';
          sameSecret = oldSecret.length === body.eventSecret.length
            && timingSafeEqual(Buffer.from(oldSecret), Buffer.from(body.eventSecret));
        } catch { /* An unreadable stored key cannot be silently replaced. */ }
        if (connection.event_key_id !== body.eventKeyId || connection.route_generation !== 1 || !sameSecret) {
          await db.query('rollback'); return reply.code(409).send({ error: 'event_route_conflict' });
        }
        await db.query('commit');
        return reply.header('Cache-Control', 'no-store').send({ connectionId: request.params.id,
          status: 'review_required', fieldOrganizationId: grant.organization_id, fieldGrantId: grant.id });
      }
      if (connection.status !== 'pending_field_consent') {
        await db.query('rollback');
        return reply.code(409).send({ error: 'connection_state_conflict' });
      }
      let accessCipher = connection.access_token_cipher;
      if (connection.access_expires_at.getTime() <= Date.now() + 30_000) {
        let refreshed: Awaited<ReturnType<typeof refreshStoredApGrant>>;
        try { refreshed = await refreshStoredApGrant(config, connection.refresh_token_cipher); }
        catch { refreshed = null; }
        if (!refreshed) {
          await db.query("update field.ap_connections set status = 'degraded', updated_at = now() where id = $1",
            [request.params.id]);
          await db.query('commit');
          return reply.code(503).send({ error: 'ap_grant_refresh_unknown' });
        }
        accessCipher = refreshed.accessCipher;
        await db.query(`update field.ap_connections set access_token_cipher = $2,
          refresh_token_cipher = $3,
          access_expires_at = now() + ($4::text || ' seconds')::interval,
          updated_at = now() where id = $1`,
        [request.params.id, refreshed.accessCipher, refreshed.refreshCipher, refreshed.expiresIn]);
      }
      let apGrant: Record<string, unknown> | null;
      try { apGrant = await inspectStoredApGrant(config, accessCipher); }
      catch { apGrant = null; }
      if (!apGrant) {
        await db.query("update field.ap_connections set status = 'degraded', updated_at = now() where id = $1",
          [request.params.id]);
        await db.query('commit');
        return reply.code(503).send({ error: 'ap_grant_unavailable' });
      }
      if (apGrant.grantId !== connection.ap_grant_id
        || apGrant.organizationId !== connection.ap_organization_id
        || apGrant.agentId !== connection.ap_agent_id || apGrant.state !== 'active'
        || !Array.isArray(apGrant.scopes)
        || !['ap.agent.read', 'ap.conversations.read']
          .every(scope => (apGrant.scopes as string[]).includes(scope))) {
        await db.query("update field.ap_connections set status = 'degraded', updated_at = now() where id = $1",
          [request.params.id]);
        await db.query('commit');
        return reply.code(409).send({ error: 'ap_grant_scope_changed' });
      }
      await db.query(`update field.ap_connections set status = 'review_required',
        field_grant_id = $2, field_actor_user_id = $3, field_client_id = $4,
        event_key_id = $5, event_secret_cipher = $6, route_generation = 1,
        bound_at = now(), updated_at = now() where id = $1`,
      [request.params.id, grant.id, grant.actor_user_id, grant.client_id,
        body.eventKeyId, sealEventSecret(body.eventSecret, config.tokenKey)]);
      await db.query('commit');
      return reply.header('Cache-Control', 'no-store').send({ connectionId: request.params.id,
        status: 'review_required', fieldOrganizationId: grant.organization_id, fieldGrantId: grant.id });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
