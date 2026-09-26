import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';

export type ApConnectorConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  tokenKey: Buffer;
  redirectUri: string;
  webOrigin: string;
  reverseClientId?: string;
  fetcher?: typeof fetch;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requiredScopes = ['ap.agent.read', 'ap.conversations.read'];
const requestedScopes = ['openid', 'offline_access', ...requiredScopes,
  'ap.conversations.reply', 'ap.sources.refresh'];
const tokenScopes = ['offline_access', ...requiredScopes];

function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function seal(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]);
}
function unseal(data: Buffer, key: Buffer) {
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(12, -16)), decipher.final()]).toString('utf8');
}
function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function validConfiguration(config: ApConnectorConfig) {
  if (config.tokenKey.length !== 32 || !config.clientId || !config.clientSecret) return false;
  try {
    const issuer = new URL(config.issuer);
    const callback = new URL(config.redirectUri);
    const web = new URL(config.webOrigin);
    return issuer.pathname.endsWith('/api/auth') && callback.pathname === '/v1/connections/ap/callback'
      && ['http:', 'https:'].includes(issuer.protocol)
      && ['http:', 'https:'].includes(callback.protocol) && ['http:', 'https:'].includes(web.protocol);
  } catch { return false; }
}
function target(config: ApConnectorConfig, result: string, connectionId?: string) {
  const location = new URL('/workspace/integrations', config.webOrigin);
  location.searchParams.set('result', result);
  if (connectionId) location.searchParams.set('connectionId', connectionId);
  return location.toString();
}
function apResource(config: ApConnectorConfig) { return new URL('/integrations/v1', config.issuer).toString(); }

async function authorizedApAccess(runtime: Pick<FieldBusinessRuntime, 'pool' | 'apConnector'>, organizationId: string,
  userId: string, connectionId: string, deploymentId: string | null,
  scope: 'ap.conversations.read' | 'ap.conversations.reply' | 'ap.sources.refresh'):
  Promise<{ token: string; resource: string } | { error: string; status: number }> {
  const config = runtime.apConnector;
  if (!config) return { error: 'blocked_integration', status: 503 };
  const db = await runtime.pool.connect();
  try {
    await db.query('begin');
    const found = await db.query<{ ap_issuer: string; ap_client_id: string; ap_grant_id: string;
      ap_organization_id: string; ap_agent_id: string; allowed_deployment_ids: string[]; scopes: string[];
      access_token_cipher: Buffer; refresh_token_cipher: Buffer; access_expires_at: Date;
      status: string; selection_active: boolean }>(
      `select c.ap_issuer,c.ap_client_id,c.ap_grant_id,c.ap_organization_id,c.ap_agent_id,
         c.allowed_deployment_ids,c.scopes,c.access_token_cipher,c.refresh_token_cipher,
         c.access_expires_at,c.status,
         exists(select 1 from field.oauth_selections s where s.id::text = c.field_grant_id
           and s.organization_id = c.organization_id and s.actor_user_id = c.field_actor_user_id
           and s.revoked_at is null) as selection_active
       from field.ap_connections c
       where c.id = $1 and c.organization_id = $2 and c.initiator_user_id = $3
         and c.field_actor_user_id = $3 for update`, [connectionId, organizationId, userId]);
    const row = found.rows[0];
    if (!row) { await db.query('rollback'); return { error: 'connection_not_found', status: 404 }; }
    if (row.status !== 'review_required' || !row.selection_active
      || row.ap_issuer !== config.issuer || row.ap_client_id !== config.clientId
      || (deploymentId !== null && !row.allowed_deployment_ids.includes(deploymentId))) {
      await db.query('rollback'); return { error: 'connection_not_ready', status: 409 };
    }
    if (!row.scopes.includes(scope)) {
      await db.query('rollback'); return { error: 'ap_scope_not_granted', status: 403 };
    }
    let access = row.access_token_cipher;
    if (row.access_expires_at.getTime() <= Date.now() + 30_000) {
      let refreshed: Awaited<ReturnType<typeof refreshStoredApGrant>>;
      try { refreshed = await refreshStoredApGrant(config, row.refresh_token_cipher); }
      catch { refreshed = null; }
      if (!refreshed) {
        await db.query("update field.ap_connections set status = 'degraded',updated_at = now() where id = $1", [connectionId]);
        await db.query('commit'); return { error: 'ap_grant_refresh_unknown', status: 503 };
      }
      access = refreshed.accessCipher;
      await db.query(`update field.ap_connections set access_token_cipher = $2,refresh_token_cipher = $3,
        access_expires_at = now() + ($4::text || ' seconds')::interval,updated_at = now() where id = $1`,
      [connectionId, access, refreshed.refreshCipher, refreshed.expiresIn]);
    }
    const token = unseal(access, config.tokenKey);
    let response: Response;
    try {
      response = await (config.fetcher ?? fetch)(`${apResource(config)}/me`, {
        headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
      });
    } catch {
      await db.query('commit'); return { error: 'ap_unavailable', status: 503 };
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        await db.query("update field.ap_connections set status = 'degraded',updated_at = now() where id = $1", [connectionId]);
      await db.query('commit'); return { error: 'ap_grant_unavailable', status: 503 };
    }
    const me = asObject(await response.json().catch(() => null));
    const scopes = Array.isArray(me?.scopes) ? me.scopes : [];
    const deployments = Array.isArray(me?.deploymentIds) ? me.deploymentIds : [];
    if (me?.grantId !== row.ap_grant_id || me.organizationId !== row.ap_organization_id
      || me.agentId !== row.ap_agent_id || me.state !== 'active' || !scopes.includes(scope)
      || (deploymentId !== null && !deployments.includes(deploymentId))
      || deployments.length !== row.allowed_deployment_ids.length
      || !deployments.every(id => row.allowed_deployment_ids.includes(id))) {
      await db.query("update field.ap_connections set status = 'degraded',updated_at = now() where id = $1", [connectionId]);
      await db.query('commit'); return { error: 'ap_grant_scope_changed', status: 409 };
    }
    await db.query('commit');
    return { token, resource: apResource(config) };
  } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
}

export function authorizedApConversationAccess(runtime: Pick<FieldBusinessRuntime, 'pool' | 'apConnector'>,
  organizationId: string, userId: string, connectionId: string, deploymentId: string,
  scope: 'ap.conversations.read' | 'ap.conversations.reply') {
  return authorizedApAccess(runtime, organizationId, userId, connectionId, deploymentId, scope);
}

export function authorizedApSourceAccess(runtime: Pick<FieldBusinessRuntime, 'pool' | 'apConnector'>,
  organizationId: string, userId: string, connectionId: string) {
  return authorizedApAccess(runtime, organizationId, userId, connectionId, null, 'ap.sources.refresh');
}

export function apConnectorFromEnvironment(): ApConnectorConfig | undefined {
  const issuer = process.env.FIELD_AP_OAUTH_ISSUER;
  const clientId = process.env.FIELD_AP_CLIENT_ID;
  const clientSecret = process.env.FIELD_AP_CLIENT_SECRET;
  const encodedKey = process.env.FIELD_AP_TOKEN_KEY;
  if (!issuer && !clientId && !clientSecret && !encodedKey) return undefined;
  if (!issuer || !clientId || !clientSecret || !encodedKey) throw new Error('Field AP connector configuration is incomplete');
  const tokenKey = Buffer.from(encodedKey, 'base64url');
  const redirectUri = new URL('/v1/connections/ap/callback',
    process.env.FIELD_AUTH_BASE_URL ?? 'http://127.0.0.1:4321').toString();
  const webOrigin = process.env.FIELD_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3002';
  const config = { issuer, clientId, clientSecret, tokenKey, redirectUri, webOrigin,
    reverseClientId: process.env.FIELD_AP_REVERSE_CLIENT_ID };
  if (!validConfiguration(config)) throw new Error('Field AP connector configuration is invalid');
  if (process.env.FIELD_PROFILE !== 'mock'
    && [issuer, redirectUri, webOrigin].some(value => new URL(value).protocol !== 'https:')) {
    throw new Error('Field AP connector requires HTTPS outside mock');
  }
  return config;
}

export async function inspectStoredApGrant(config: ApConnectorConfig, cipher: Buffer) {
  const transport = config.fetcher ?? fetch;
  const response = await transport(`${apResource(config)}/me`, {
    headers: { authorization: `Bearer ${unseal(cipher, config.tokenKey)}` },
    signal: AbortSignal.timeout(8000),
  });
  return response.ok ? asObject(await response.json()) : null;
}

export async function refreshStoredApGrant(config: ApConnectorConfig, cipher: Buffer) {
  const previous = unseal(cipher, config.tokenKey);
  const transport = config.fetcher ?? fetch;
  const response = await transport(`${config.issuer.replace(/\/$/, '')}/oauth2/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: config.clientId,
      refresh_token: previous }), signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const token = asObject(await response.json());
  if (!token || typeof token.access_token !== 'string' || !token.access_token
    || typeof token.refresh_token !== 'string' || !token.refresh_token
    || token.refresh_token === previous || token.token_type !== 'Bearer'
    || typeof token.expires_in !== 'number' || !Number.isSafeInteger(token.expires_in)
    || token.expires_in < 60 || typeof token.scope !== 'string'
    || !tokenScopes.every(scope => (token.scope as string).split(' ').includes(scope))) return null;
  return { accessCipher: seal(token.access_token, config.tokenKey),
    refreshCipher: seal(token.refresh_token, config.tokenKey), expiresIn: token.expires_in };
}

export type AuthorizedApDeployment = { id: string; publicId: string;
  kind: 'link' | 'owned_embed' | 'placement_embed'; origin: string | null };
export async function authorizedApDeployments(runtime: FieldBusinessRuntime, organizationId: string,
  userId: string, connectionId: string): Promise<{ deployments: AuthorizedApDeployment[] } | { error: string; status: number }> {
  const config = runtime.apConnector;
  if (!config) return { error: 'blocked_integration', status: 503 };
  const db = await runtime.pool.connect();
  try {
    await db.query('begin');
    const found = await db.query<{ initiator_user_id: string; ap_issuer: string; ap_client_id: string;
      ap_grant_id: string; ap_organization_id: string; ap_agent_id: string; allowed_deployment_ids: string[];
      access_token_cipher: Buffer; refresh_token_cipher: Buffer; access_expires_at: Date; status: string }>(
      `select initiator_user_id, ap_issuer, ap_client_id, ap_grant_id, ap_organization_id,
        ap_agent_id, allowed_deployment_ids, access_token_cipher, refresh_token_cipher,
        access_expires_at, status from field.ap_connections
       where id = $1 and organization_id = $2 for update`, [connectionId, organizationId]);
    const row = found.rows[0];
    if (!row || row.initiator_user_id !== userId) {
      await db.query('rollback'); return { error: 'connection_not_found', status: 404 };
    }
    if (row.status !== 'review_required' || row.ap_issuer !== config.issuer || row.ap_client_id !== config.clientId) {
      await db.query('rollback'); return { error: 'connection_not_ready', status: 409 };
    }
    let access = row.access_token_cipher;
    if (row.access_expires_at.getTime() <= Date.now() + 30_000) {
      let refreshed: Awaited<ReturnType<typeof refreshStoredApGrant>>;
      try { refreshed = await refreshStoredApGrant(config, row.refresh_token_cipher); }
      catch { refreshed = null; }
      if (!refreshed) {
        await db.query("update field.ap_connections set status = 'degraded', updated_at = now() where id = $1", [connectionId]);
        await db.query('commit'); return { error: 'ap_grant_refresh_unknown', status: 503 };
      }
      access = refreshed.accessCipher;
      await db.query(`update field.ap_connections set access_token_cipher = $2,
        refresh_token_cipher = $3, access_expires_at = now() + ($4::text || ' seconds')::interval,
        updated_at = now() where id = $1`, [connectionId, access,
        refreshed.refreshCipher, refreshed.expiresIn]);
    }
    const transport = config.fetcher ?? fetch;
    let me: Record<string, unknown> | null;
    let deployments: Record<string, unknown> | null;
    try {
      const headers = { authorization: `Bearer ${unseal(access, config.tokenKey)}` };
      const [meResult, deploymentResult] = await Promise.all([
        transport(`${apResource(config)}/me`, { headers, signal: AbortSignal.timeout(8000) }),
        transport(`${apResource(config)}/deployments`, { headers, signal: AbortSignal.timeout(8000) }),
      ]);
      if (!meResult.ok || !deploymentResult.ok) {
        await db.query('commit');
        return { error: meResult.status === 401 || deploymentResult.status === 401
          ? 'ap_grant_unavailable' : 'ap_deployments_unavailable', status: 503 };
      }
      me = asObject(await meResult.json());
      deployments = asObject(await deploymentResult.json());
    } catch {
      await db.query('commit'); return { error: 'ap_deployments_unavailable', status: 503 };
    }
    const scopes = Array.isArray(me?.scopes) ? me.scopes : [];
    const ids = Array.isArray(me?.deploymentIds) ? me.deploymentIds : [];
    if (!me || me.grantId !== row.ap_grant_id || me.organizationId !== row.ap_organization_id
      || me.agentId !== row.ap_agent_id || me.state !== 'active' || !scopes.includes('ap.agent.read')
      || ids.length !== row.allowed_deployment_ids.length
      || !ids.every(id => typeof id === 'string' && row.allowed_deployment_ids.includes(id))) {
      await db.query("update field.ap_connections set status = 'degraded', updated_at = now() where id = $1", [connectionId]);
      await db.query('commit'); return { error: 'ap_grant_scope_changed', status: 409 };
    }
    if (!Array.isArray(deployments?.deployments)) {
      await db.query('commit'); return { error: 'invalid_ap_deployments', status: 502 };
    }
    const available: AuthorizedApDeployment[] = [];
    for (const entry of deployments.deployments) {
      const value = asObject(entry);
      if (!value || typeof value.id !== 'string' || !uuid.test(value.id)
        || !ids.includes(value.id) || typeof value.publicId !== 'string'
        || !/^dep_[A-Za-z0-9_-]{20,50}$/.test(value.publicId)
        || (value.kind !== 'link' && value.kind !== 'owned_embed' && value.kind !== 'placement_embed')
        || (value.origin !== null && (typeof value.origin !== 'string' || value.origin.length > 253))) {
        await db.query('commit'); return { error: 'invalid_ap_deployments', status: 502 };
      }
      available.push({ id: value.id, publicId: value.publicId,
        kind: value.kind, origin: value.origin });
    }
    await db.query('commit');
    return { deployments: available };
  } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
}

export function registerApConnectorRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get('/v1/connections/ap', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const rows = await runtime.pool.query<{
      id: string; organization_id: string; ap_grant_id: string; ap_organization_id: string; ap_agent_id: string;
      ap_agent_name: string; scopes: string[]; status: string; created_at: Date;
      remote_revoke_state: string | null;
    }>(`select c.id, c.organization_id, c.ap_grant_id, c.ap_organization_id, c.ap_agent_id,
          c.ap_agent_name, c.scopes, c.status, c.created_at,
          r.state as remote_revoke_state
        from field.ap_connections c join field.memberships m on m.organization_id = c.organization_id
        left join field.ap_connection_revocations r on r.connection_id = c.id
        where m.user_id = $1 and m.role = 'owner' order by c.created_at desc`, [userId]);
    return reply.header('Cache-Control', 'private, no-store').send({ connections: rows.rows.map(row => ({
      id: row.id, organizationId: row.organization_id, apGrantId: row.ap_grant_id,
      apOrganizationId: row.ap_organization_id,
      apAgentId: row.ap_agent_id, apAgentName: row.ap_agent_name, scopes: row.scopes,
      status: row.status, remoteRevokeState: row.remote_revoke_state,
      createdAt: row.created_at,
    })) });
  });

  app.post<{ Params: { id: string } }>('/v1/connections/ap/:id/revoke', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'connection_not_found' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const selected = await db.query<{ id: string; organization_id: string; field_grant_id: string | null;
        status: string; event_key_id: string | null; event_secret_cipher: Buffer | null }>(
        `select c.id,c.organization_id,c.field_grant_id,c.status,c.event_key_id,c.event_secret_cipher
         from field.ap_connections c
         join field.memberships m on m.organization_id = c.organization_id
           and m.user_id = $2 and m.role = 'owner'
         where c.id = $1 for update of c`, [request.params.id, userId]);
      const connection = selected.rows[0];
      if (!connection) {
        await db.query('rollback'); return reply.code(404).send({ error: 'connection_not_found' });
      }
      if (connection.status !== 'revoked') {
        await db.query(`update field.ap_connections set status = 'revoked',updated_at = now()
          where id = $1`, [connection.id]);
        await db.query(`update field.site_ap_installations set status = 'paused',updated_at = now()
          where connection_id = $1 and status = 'active'`, [connection.id]);
        if (connection.field_grant_id && uuid.test(connection.field_grant_id)) {
          await db.query(`update field.oauth_selections set revoked_at = now()
            where id = $1 and revoked_at is null`, [connection.field_grant_id]);
          await db.query(`update "oauthAccessToken" set revoked = now()
            where "referenceId" = $1 and revoked is null`, [connection.field_grant_id]);
          await db.query(`update "oauthRefreshToken" set revoked = now()
            where "referenceId" = $1 and revoked is null`, [connection.field_grant_id]);
          await db.query(`delete from "oauthConsent" where "referenceId" = $1`,
            [connection.field_grant_id]);
        }
        if (connection.event_key_id && connection.event_secret_cipher) {
          await db.query(`insert into field.ap_connection_revocations(id,connection_id)
            values ($1,$2) on conflict (connection_id) do nothing`,
          [randomUUID(), connection.id]);
        }
        await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
          values ($1,$2,'field.ap_connection.revoked',$3,$4::jsonb)`,
        [randomUUID(), connection.organization_id, connection.id,
          JSON.stringify({ connectionId: connection.id, remotePending: Boolean(connection.event_key_id) })]);
      }
      const remote = await db.query<{ id: string; state: string }>(
        `select id,state from field.ap_connection_revocations where connection_id = $1`,
        [connection.id]);
      await db.query('commit');
      return reply.header('Cache-Control', 'private, no-store').send({
        connectionId: connection.id, localStatus: 'revoked',
        revocationId: remote.rows[0]?.id ?? null,
        remoteState: remote.rows[0]?.state ?? (connection.event_key_id ? 'manual_required' : 'not_connected'),
      });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.post('/v1/connections/ap/start', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const organizationId = asObject(request.body)?.organizationId;
    if (typeof organizationId !== 'string' || !uuid.test(organizationId))
      return reply.code(400).send({ error: 'invalid_organization_id' });
    const member = await runtime.pool.query(
      "select 1 from field.memberships where organization_id = $1 and user_id = $2 and role = 'owner'",
      [organizationId, userId]);
    if (!member.rowCount) return reply.code(404).send({ error: 'organization_not_found' });
    const config = runtime.apConnector;
    if (!config || !validConfiguration(config)) return reply.code(503).send({ error: 'blocked_integration' });
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    await runtime.pool.query(
      `insert into field.ap_oauth_attempts(id, organization_id, initiator_user_id, state_hash,
         verifier_cipher, expires_at) values ($1,$2,$3,$4,$5,now() + interval '10 minutes')`,
      [randomUUID(), organizationId, userId, hash(state), seal(verifier, config.tokenKey)]);
    const authorization = new URL(`${config.issuer.replace(/\/$/, '')}/oauth2/authorize`);
    for (const [key, value] of Object.entries({ response_type: 'code', client_id: config.clientId,
      redirect_uri: config.redirectUri, scope: requestedScopes.join(' '), state,
      code_challenge: challenge, code_challenge_method: 'S256', resource: apResource(config) })) {
      authorization.searchParams.set(key, value);
    }
    return reply.code(201).header('Cache-Control', 'no-store').send({ authorizationUrl: authorization.toString() });
  });

  app.get('/v1/connections/ap/callback', async (request, reply) => {
    const config = runtime.apConnector;
    if (!config || !validConfiguration(config)) return reply.code(503).send({ error: 'blocked_integration' });
    const query = request.query as Record<string, unknown>;
    const state = query.state;
    if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(state)
      || query.iss !== config.issuer) return reply.code(400).send({ error: 'invalid_oauth_callback' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const found = await db.query<{ id: string; organization_id: string; initiator_user_id: string;
        verifier_cipher: Buffer; status: string; connection_id: string | null; expires_at: Date }>(
        'select * from field.ap_oauth_attempts where state_hash = $1 for update', [hash(state)]);
      const attempt = found.rows[0];
      if (!attempt || attempt.expires_at.getTime() <= Date.now()) {
        await db.query('rollback');
        return reply.code(400).send({ error: 'invalid_oauth_state' });
      }
      if (attempt.status !== 'pending') {
        await db.query('commit');
        const result = attempt.status === 'completed' ? 'pending_field_consent'
          : attempt.status === 'denied' ? 'denied' : 'unknown';
        return reply.redirect(target(config, result, attempt.connection_id ?? undefined), 303);
      }
      if (query.error === 'access_denied') {
        await db.query("update field.ap_oauth_attempts set status = 'denied' where id = $1", [attempt.id]);
        await db.query('commit');
        return reply.redirect(target(config, 'denied'), 303);
      }
      if (typeof query.code !== 'string' || query.code.length > 2048 || !query.code) {
        await db.query('rollback');
        return reply.code(400).send({ error: 'invalid_oauth_callback' });
      }
      const stillOwner = await db.query(
        "select 1 from field.memberships where organization_id = $1 and user_id = $2 and role = 'owner'",
        [attempt.organization_id, attempt.initiator_user_id]);
      if (!stillOwner.rowCount) {
        await db.query('rollback');
        return reply.code(403).send({ error: 'owner_permission_revoked' });
      }
      let token: Record<string, unknown>;
      let me: Record<string, unknown>;
      let agent: Record<string, unknown>;
      try {
        const verifier = unseal(attempt.verifier_cipher, config.tokenKey);
        const transport = config.fetcher ?? fetch;
        const tokenResult = await transport(`${config.issuer.replace(/\/$/, '')}/oauth2/token`, {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded',
            authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}` },
          body: new URLSearchParams({ grant_type: 'authorization_code', code: query.code,
            redirect_uri: config.redirectUri, code_verifier: verifier, resource: apResource(config) }),
          signal: AbortSignal.timeout(8000),
        });
        if (!tokenResult.ok) throw new Error('token_exchange_failed');
        token = asObject(await tokenResult.json()) ?? {};
        if (typeof token.access_token !== 'string' || !token.access_token
          || typeof token.refresh_token !== 'string' || !token.refresh_token
          || token.token_type !== 'Bearer' || typeof token.expires_in !== 'number'
          || token.expires_in < 60 || typeof token.scope !== 'string'
          || !tokenScopes.every(scope => (token.scope as string).split(' ').includes(scope))) {
          throw new Error('invalid_token_response');
        }
        const headers = { authorization: `Bearer ${token.access_token}` };
        const [meResult, agentResult] = await Promise.all([
          transport(`${apResource(config)}/me`, { headers, signal: AbortSignal.timeout(8000) }),
          transport(`${apResource(config)}/agent`, { headers, signal: AbortSignal.timeout(8000) }),
        ]);
        if (!meResult.ok || !agentResult.ok) throw new Error('grant_probe_failed');
        me = asObject(await meResult.json()) ?? {};
        agent = asObject(await agentResult.json()) ?? {};
      } catch {
        await db.query("update field.ap_oauth_attempts set status = 'unknown' where id = $1", [attempt.id]);
        await db.query('commit');
        return reply.redirect(target(config, 'unknown'), 303);
      }
      const meScopes = Array.isArray(me.scopes) ? me.scopes : [];
      if (!uuid.test(String(me.grantId)) || !uuid.test(String(me.organizationId))
        || !uuid.test(String(me.agentId)) || me.state !== 'active'
        || !requiredScopes.every(scope => meScopes.includes(scope))
        || !Array.isArray(me.deploymentIds) || me.deploymentIds.some(value => typeof value !== 'string' || !uuid.test(value))
        || me.organizationId !== agent.organizationId || me.agentId !== agent.agentId
        || typeof agent.name !== 'string' || !agent.name || typeof agent.revision !== 'number'
        || !Number.isSafeInteger(agent.revision) || agent.revision < 1) {
        await db.query("update field.ap_oauth_attempts set status = 'unknown' where id = $1", [attempt.id]);
        await db.query('commit');
        return reply.redirect(target(config, 'unknown'), 303);
      }
      const id = randomUUID();
      await db.query(`insert into field.ap_connections(id, organization_id, initiator_user_id,
        ap_issuer, ap_client_id, ap_grant_id, ap_organization_id, ap_agent_id, ap_agent_name,
        ap_agent_revision, allowed_deployment_ids, scopes, access_token_cipher,
        refresh_token_cipher, access_expires_at, status)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now() + ($15::text || ' seconds')::interval,
          'pending_field_consent')`,
      [id, attempt.organization_id, attempt.initiator_user_id, config.issuer, config.clientId,
        me.grantId, me.organizationId, me.agentId, agent.name, agent.revision,
        me.deploymentIds, me.scopes, seal(token.access_token as string, config.tokenKey),
        seal(token.refresh_token as string, config.tokenKey), token.expires_in]);
      await db.query("update field.ap_oauth_attempts set status = 'completed', connection_id = $2 where id = $1",
        [attempt.id, id]);
      await db.query('commit');
      return reply.redirect(target(config, 'pending_field_consent', id), 303);
    } catch (error) {
      await db.query('rollback');
      throw error;
    } finally { db.release(); }
  });
}
