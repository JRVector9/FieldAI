import { recordAgentRevocation } from './revocation-journal.js';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';
import { rejectDeletionScheduled } from './trial-access.js';

export type FieldConnectorConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  tokenKey: Buffer;
  redirectUri: string;
  webOrigin: string;
  fetcher?: typeof fetch;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fieldScopes = ['field.facts.read', 'field.availability.read',
  'field.requests.create', 'field.requests.read', 'field.customer_access.create'];
// preview.9 제안 응답·알림 경로 scope. 새 동의에서 요청하지만 연결 필수 조건은 아니다.
// 없는 연결은 해당 기능만 scope_missing으로 막고 기존 조회·전달은 그대로 둔다.
export const fieldDecisionScopes = ['field.proposals.respond', 'field.notification_route.read'];
const baseFieldScopes = ['field.facts.read'];
const scopes = ['openid', 'offline_access', ...fieldScopes, ...fieldDecisionScopes];
// Field OAuth client 등록에 preview.9 scope가 아직 없으면 authorize가 invalid_scope로 돌아온다. 이때 한 번만 기본 scope로 다시 동의를 시작한다
const baseConsentScopes = ['openid', 'offline_access', ...fieldScopes];
const tokenScopes = ['offline_access', ...baseFieldScopes];
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
export function unsealFieldEventSecret(data: Buffer, tokenKey: Buffer) {
  const key = createHash('sha256').update(tokenKey).update('ap-field-event-route-v1').digest();
  return unseal(data, key);
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function publicFacts(value: unknown, organizationId: string): Record<string, unknown> | null {
  const facts = object(value);
  if (!facts || facts.organizationId !== organizationId
    || !uuid.test(String(facts.releaseId)) || typeof facts.revision !== 'number'
    || !Number.isSafeInteger(facts.revision) || facts.revision < 1
    || typeof facts.contentHash !== 'string' || !/^[a-f0-9]{64}$/i.test(facts.contentHash)
    || typeof facts.publishedAt !== 'string' || Number.isNaN(Date.parse(facts.publishedAt))
    || typeof facts.businessName !== 'string' || !facts.businessName.trim()
    || facts.businessName.length > 160 || typeof facts.introduction !== 'string'
    || facts.introduction.length > 5000 || typeof facts.region !== 'string'
    || facts.region.length > 200 || typeof facts.openingHours !== 'string'
    || facts.openingHours.length > 500 || !Array.isArray(facts.services)
    || facts.services.length > 100) return null;
  const rawFaqs = facts.faqs ?? [];
  if (!Array.isArray(rawFaqs) || rawFaqs.length > 100) return null;
  const faqs: { question: string; answer: string }[] = [];
  for (const value of rawFaqs) {
    const faq = object(value);
    if (!faq || typeof faq.question !== 'string' || !faq.question.trim()
      || faq.question.length > 500 || typeof faq.answer !== 'string'
      || !faq.answer.trim() || faq.answer.length > 2000) return null;
    faqs.push({ question: faq.question.trim(), answer: faq.answer.trim() });
  }
  const services: Record<string, unknown>[] = [];
  const ids = new Set<string>();
  for (const value of facts.services) {
    const service = object(value);
    if (!service || typeof service.id !== 'string' || !uuid.test(service.id)
      || ids.has(service.id) || typeof service.name !== 'string'
      || !service.name.trim() || service.name.length > 160
      || typeof service.description !== 'string' || service.description.length > 2000
      || !['request', 'slot'].includes(String(service.bookingMode))
      || typeof service.durationMinutes !== 'number'
      || !Number.isSafeInteger(service.durationMinutes)
      || service.durationMinutes < 1 || service.durationMinutes > 1440
      || (service.priceAmount !== null && (typeof service.priceAmount !== 'number'
        || !Number.isSafeInteger(service.priceAmount)
        || service.priceAmount < 0 || service.priceAmount > 1_000_000_000))) return null;
    ids.add(service.id);
    services.push({ id: service.id, name: service.name, description: service.description,
      bookingMode: service.bookingMode, durationMinutes: service.durationMinutes,
      priceAmount: service.priceAmount });
  }
  return { organizationId, releaseId: facts.releaseId, revision: facts.revision,
    contentHash: facts.contentHash.toLowerCase(), publishedAt: facts.publishedAt,
    businessName: facts.businessName, introduction: facts.introduction,
    region: facts.region, openingHours: facts.openingHours, services, faqs };
}
function valid(config: FieldConnectorConfig) {
  if (config.tokenKey.length !== 32 || !config.clientId || !config.clientSecret) return false;
  try {
    const issuer = new URL(config.issuer);
    const callback = new URL(config.redirectUri);
    const web = new URL(config.webOrigin);
    return issuer.pathname.endsWith('/api/auth') && callback.pathname === '/v1/connections/field/callback'
      && [issuer, callback, web].every(url => ['http:', 'https:'].includes(url.protocol));
  } catch { return false; }
}
function resource(config: FieldConnectorConfig) { return new URL('/integrations/v1', config.issuer).toString(); }
function target(config: FieldConnectorConfig, result: string, connectionId?: string) {
  const url = new URL('/workspace/integrations', config.webOrigin);
  url.searchParams.set('result', result);
  if (connectionId) url.searchParams.set('connectionId', connectionId);
  return url.toString();
}

// Field가 인증 실패를 확정한 경우(401/403, refresh 거절, grant·조직·scope 불일치)만 나타낸다
class FieldGrantRejected extends Error {}
async function refreshStoredFieldGrant(config: FieldConnectorConfig, cipher: Buffer) {
  const previous = unseal(cipher, config.tokenKey);
  const transport = config.fetcher ?? fetch;
  const response = await transport(`${config.issuer.replace(/\/$/, '')}/oauth2/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: config.clientId,
      refresh_token: previous }), signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    if ([400, 401, 403].includes(response.status)) throw new FieldGrantRejected('field_grant_refresh_rejected');
    return null;
  }
  const token = object(await response.json());
  if (!token || typeof token.access_token !== 'string' || !token.access_token
    || typeof token.refresh_token !== 'string' || !token.refresh_token
    || token.refresh_token === previous || token.token_type !== 'Bearer'
    || typeof token.expires_in !== 'number' || !Number.isSafeInteger(token.expires_in)
    || token.expires_in < 60 || typeof token.scope !== 'string'
    || !tokenScopes.every(scope => (token.scope as string).split(' ').includes(scope))) return null;
  return { access: token.access_token, accessCipher: seal(token.access_token, config.tokenKey),
    refreshCipher: seal(token.refresh_token, config.tokenKey), expiresIn: token.expires_in };
}

type StoredFieldToken = { access_token_cipher: Buffer; refresh_token_cipher: Buffer; access_expires_at: Date };
// 네트워크 호출 동안 DB client와 행 잠금을 쥐지 않는다. 만료 임박 토큰은 짧은 임대(CAS)를 얻은 한 요청만 갱신하고,
// 결과는 이전 refresh token이 그대로일 때만 저장한다. 다른 요청은 갱신 결과를 잠시 기다렸다가 다시 읽는다.
async function currentFieldAccess(runtime: BusinessRuntime, config: FieldConnectorConfig,
  connectionId: string, stored: StoredFieldToken): Promise<string> {
  const deadline = Date.now() + 10_000;
  let token = stored;
  while (token.access_expires_at.getTime() <= Date.now() + 30_000) {
    const claimed = await runtime.pool.query(
      `update ap.field_connections set token_refresh_lease_until = now() + interval '20 seconds'
       where id = $1 and status in ('review_required', 'degraded') and refresh_token_cipher = $2
         and (token_refresh_lease_until is null or token_refresh_lease_until <= now())`,
      [connectionId, token.refresh_token_cipher]);
    if (claimed.rowCount) {
      let rotated: Awaited<ReturnType<typeof refreshStoredFieldGrant>> = null;
      try { rotated = await refreshStoredFieldGrant(config, token.refresh_token_cipher); } finally {
        if (!rotated) await runtime.pool.query(`update ap.field_connections set token_refresh_lease_until = null
          where id = $1 and refresh_token_cipher = $2`, [connectionId, token.refresh_token_cipher]);
      }
      if (!rotated) throw new Error('field_grant_refresh_unknown');
      const saved = await runtime.pool.query(`update ap.field_connections set access_token_cipher = $3,
        refresh_token_cipher = $4, access_expires_at = now() + ($5::text || ' seconds')::interval,
        token_refresh_lease_until = null, updated_at = now()
        where id = $1 and refresh_token_cipher = $2 and status in ('review_required', 'degraded')`,
      [connectionId, token.refresh_token_cipher, rotated.accessCipher, rotated.refreshCipher, rotated.expiresIn]);
      if (!saved.rowCount) throw new Error('field_connection_changed');
      return rotated.access;
    }
    if (Date.now() >= deadline) throw new Error('field_grant_refresh_unknown');
    await new Promise(resolve => setTimeout(resolve, 250));
    const current = (await runtime.pool.query<StoredFieldToken>(
      `select access_token_cipher, refresh_token_cipher, access_expires_at from ap.field_connections
       where id = $1 and status in ('review_required', 'degraded')`, [connectionId])).rows[0];
    if (!current) throw new Error('field_connection_changed');
    token = current;
  }
  return unseal(token.access_token_cipher, config.tokenKey);
}

export function fieldConnectorFromEnvironment(): FieldConnectorConfig | undefined {
  const issuer = process.env.AP_FIELD_OAUTH_ISSUER;
  const clientId = process.env.AP_FIELD_CLIENT_ID;
  const clientSecret = process.env.AP_FIELD_CLIENT_SECRET;
  const encodedKey = process.env.AP_FIELD_TOKEN_KEY;
  if (!issuer && !clientId && !clientSecret && !encodedKey) return undefined;
  if (!issuer || !clientId || !clientSecret || !encodedKey) throw new Error('AP Field connector configuration is incomplete');
  const config = { issuer, clientId, clientSecret, tokenKey: Buffer.from(encodedKey, 'base64url'),
    redirectUri: new URL('/v1/connections/field/callback',
      process.env.AP_AUTH_BASE_URL ?? 'http://127.0.0.1:4311').toString(),
    webOrigin: process.env.AP_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3001' };
  if (!valid(config)) throw new Error('AP Field connector configuration is invalid');
  if (process.env.AP_PROFILE !== 'mock'
    && [config.issuer, config.redirectUri, config.webOrigin]
      .some(value => new URL(value).protocol !== 'https:')) {
    throw new Error('AP Field connector requires HTTPS outside mock');
  }
  return config;
}

export type InspectedFieldFacts = {
  ok: true;
  apOrganizationId: string;
  fieldOrganizationId: string;
  fieldGrantId: string;
  facts: Record<string, unknown>;
};
type FieldFactsInspection = InspectedFieldFacts | {
  ok: false; statusCode: number; error: string; status?: string;
};

type FieldGrantInspection = ({ ok: true; apOrganizationId: string; fieldOrganizationId: string;
  fieldGrantId: string; access: string; apiUrl: string; transport: typeof fetch }
  | { ok: false; statusCode: number; error: string; status?: string });

export type CustomerFieldResource = ({ ok: true; apOrganizationId: string;
  fieldOrganizationId: string; deploymentId: string; access: string;
  apiUrl: string; transport: typeof fetch }
  | { ok: false; statusCode: number; error: string });

export async function fieldResourceForCustomer(runtime: BusinessRuntime, inquiryId: string,
  receiptHash: string, connectionId: string, requiredScope: string): Promise<CustomerFieldResource> {
  const config = runtime.fieldConnector;
  if (!config || !valid(config)) return { ok: false, statusCode: 503, error: 'blocked_integration' };
  // 연결 행을 잠그지 않고 읽는다. Field 호출 동안 pool client를 쥐지 않기 위해서다
  const found = await runtime.pool.query<{ ap_organization_id: string; deployment_id: string;
      field_organization_id: string; field_grant_id: string; scopes: string[];
      access_token_cipher: Buffer; refresh_token_cipher: Buffer; access_expires_at: Date }>(
      `select i.organization_id as ap_organization_id, i.deployment_id,
         c.field_organization_id, c.field_grant_id, c.scopes,
         c.access_token_cipher, c.refresh_token_cipher, c.access_expires_at
       from ap.inquiries i
       join ap.deployments d on d.id = i.deployment_id and d.organization_id = i.organization_id
       join ap.field_connections c on c.id = $3 and c.ap_organization_id = i.organization_id
       join ap.oauth_selections s on s.id = c.ap_grant_id
       join ap.memberships m on m.organization_id = i.organization_id
         and m.user_id = s.actor_user_id and m.role = 'owner'
       where i.id = $1 and i.visitor_key_hash = $2 and i.consent_at is not null
         and d.status = 'active' and c.status = 'review_required'
         and c.field_client_id = $4 and c.field_issuer = $5
         and c.initiator_user_id = s.actor_user_id and c.ap_agent_id = s.agent_id
         and s.organization_id = i.organization_id and s.revoked_at is null
         and s.allowed_deployment_ids @> array[i.deployment_id]
         and s.requested_scopes @> array['ap.agent.read','ap.conversations.read']
         and exists (select 1 from "oauthConsent" oc where oc."referenceId" = s.id::text
           and oc."clientId" = s.client_id and oc."userId" = s.actor_user_id
           and oc.scopes @> '["ap.agent.read","ap.conversations.read"]'::jsonb)
         and exists (select 1 from "oauthRefreshToken" t where t."referenceId" = s.id::text
           and t."clientId" = s.client_id and t."userId" = s.actor_user_id
           and t.revoked is null and t."expiresAt" > now())`,
      [inquiryId, receiptHash, connectionId, config.clientId, config.issuer]);
  const row = found.rows[0];
  if (!row) return { ok: false, statusCode: 404, error: 'connection_not_available' };
  if (!row.scopes.includes(requiredScope))
    return { ok: false, statusCode: 403, error: 'field_reauthorization_required' };
  let access: string;
  try {
    access = await currentFieldAccess(runtime, config, connectionId, row);
    const transport = config.fetcher ?? fetch;
    const response = await transport(`${resource(config)}/me`, {
      headers: { authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(8000),
    });
    const me = response.ok ? object(await response.json()) : null;
    if (!me || me.grantId !== row.field_grant_id
      || me.organizationId !== row.field_organization_id || me.state !== 'active'
      || !Array.isArray(me.scopes)) throw new Error('field_grant_invalid');
    if (!(me.scopes as string[]).includes(requiredScope))
      return { ok: false, statusCode: 403, error: 'field_reauthorization_required' };
  } catch {
    return { ok: false, statusCode: 503, error: 'field_grant_unknown' };
  }
  return { ok: true, apOrganizationId: row.ap_organization_id,
    fieldOrganizationId: row.field_organization_id, deploymentId: row.deployment_id,
    access, apiUrl: resource(config), transport: config.fetcher ?? fetch };
}
async function inspectFieldGrant(runtime: BusinessRuntime, userId: string,
  connectionId: string, degradeOnFailure = true,
  requiredScopes: readonly string[] = baseFieldScopes): Promise<FieldGrantInspection> {
  if (!uuid.test(connectionId)) return { ok: false, statusCode: 400, error: 'invalid_connection_id' };
  const config = runtime.fieldConnector;
  if (!config || !valid(config)) return { ok: false, statusCode: 503, error: 'blocked_integration' };
  // 연결 행을 잠그지 않고 읽는다. Field 호출 동안 pool client를 쥐지 않기 위해서다
  const found = await runtime.pool.query<{ access_token_cipher: Buffer; refresh_token_cipher: Buffer;
    access_expires_at: Date; ap_organization_id: string; field_grant_id: string;
    field_organization_id: string; scopes: string[]; status: string }>(
    `select c.access_token_cipher, c.refresh_token_cipher, c.access_expires_at,
      c.ap_organization_id, c.field_grant_id, c.field_organization_id, c.scopes, c.status
     from ap.field_connections c
     join ap.memberships m on m.organization_id = c.ap_organization_id
     join ap.oauth_selections s on s.id = c.ap_grant_id
     where c.id = $1 and m.user_id = $2 and m.role = 'owner'
       and s.revoked_at is null and s.actor_user_id = c.initiator_user_id
       and exists (select 1 from "oauthRefreshToken" t
         where t."referenceId" = s.id::text and t."clientId" = s.client_id
           and t."userId" = s.actor_user_id and t.revoked is null
           and t."expiresAt" > now())`, [connectionId, userId]);
  const connection = found.rows[0];
  if (!connection) return { ok: false, statusCode: 404, error: 'connection_not_found' };
  // degraded 연결도 다시 확인할 수 있어야 복구된다
  if (connection.status !== 'review_required' && connection.status !== 'degraded')
    return { ok: false, statusCode: 409, error: 'connection_not_ready', status: connection.status };
  const apOrganizationId = connection.ap_organization_id;
  const fieldGrantId = connection.field_grant_id;
  const fieldOrganizationId = connection.field_organization_id;
  const transport = config.fetcher ?? fetch;
  let access: string;
  try {
    access = await currentFieldAccess(runtime, config, connectionId, connection);
    const probe = await transport(`${resource(config)}/me`, {
      headers: { authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(8000),
    });
    if (probe.status === 401 || probe.status === 403) throw new FieldGrantRejected('field_grant_rejected');
    const me = probe.ok ? object(await probe.json()) : null;
    if (!me) throw new Error('field_grant_unknown');
    if (me.grantId !== fieldGrantId || me.organizationId !== fieldOrganizationId
      || me.state !== 'active' || !Array.isArray(me.scopes)
      || !requiredScopes.every(scope => (me.scopes as string[]).includes(scope)
        && connection.scopes.includes(scope))) throw new FieldGrantRejected('field_grant_invalid');
  } catch (error) {
    // 확정 인증 실패만 degraded로 기록한다. timeout·5xx 같은 일시 장애는 상태를 바꾸지 않는다
    if (degradeOnFailure && error instanceof FieldGrantRejected) await runtime.pool.query(
      "update ap.field_connections set status = 'degraded', updated_at = now() where id = $1 and status = 'review_required'",
      [connectionId]);
    return { ok: false, statusCode: 503, error: 'field_grant_refresh_unknown' };
  }
  // 재검증에 성공하면 degraded 연결을 다시 사용 가능 상태로 되돌린다
  if (connection.status === 'degraded') await runtime.pool.query(
    "update ap.field_connections set status = 'review_required', updated_at = now() where id = $1 and status = 'degraded'",
    [connectionId]);
  return { ok: true, apOrganizationId, fieldOrganizationId, fieldGrantId, access,
    apiUrl: resource(config), transport: config.fetcher ?? fetch };
}

export async function inspectFieldFacts(runtime: BusinessRuntime, userId: string,
  connectionId: string, options: { degradeOnGrantFailure?: boolean;
    requiredScopes?: readonly string[] } = {}): Promise<FieldFactsInspection> {
  const grant = await inspectFieldGrant(runtime, userId, connectionId,
    options.degradeOnGrantFailure !== false, options.requiredScopes);
  if (!grant.ok) return grant;
  try {
    const response = await grant.transport(`${grant.apiUrl}/facts`, {
      headers: { authorization: `Bearer ${grant.access}` }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { ok: false, statusCode: 502, error: 'field_facts_unavailable' };
    const facts = publicFacts(await response.json(), grant.fieldOrganizationId);
    if (!facts) {
      return { ok: false, statusCode: 502, error: 'invalid_field_facts' };
    }
    return { ok: true, apOrganizationId: grant.apOrganizationId,
      fieldOrganizationId: grant.fieldOrganizationId, fieldGrantId: grant.fieldGrantId, facts };
  } catch { return { ok: false, statusCode: 502, error: 'field_facts_unavailable' }; }
}

// 동의 시도(state·PKCE)를 저장하고 Field authorize URL을 만든다. base는 preview.9 scope 없이 기본 scope만 요청한다
async function startFieldConsent(db: Pick<PoolClient, 'query'>, config: FieldConnectorConfig,
  input: { fieldConnectionId: string; apGrantId: string; apOrganizationId: string; apAgentId: string;
    userId: string }, scopeSet: 'full' | 'base') {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  await db.query(
    `insert into ap.field_oauth_attempts(id,field_connection_id,ap_grant_id,ap_organization_id,
      ap_agent_id,initiator_user_id,state_hash,verifier_cipher,expires_at,scope_set)
      values ($1,$2,$3,$4,$5,$6,$7,$8,now() + interval '10 minutes',$9)`,
    [randomUUID(), input.fieldConnectionId, input.apGrantId, input.apOrganizationId,
      input.apAgentId, input.userId, hash(state), seal(verifier, config.tokenKey), scopeSet]);
  const authorization = new URL(`${config.issuer.replace(/\/$/, '')}/oauth2/authorize`);
  for (const [key, value] of Object.entries({ response_type: 'code', client_id: config.clientId,
    redirect_uri: config.redirectUri, scope: (scopeSet === 'full' ? scopes : baseConsentScopes).join(' '), state,
    code_challenge: challenge, code_challenge_method: 'S256', resource: resource(config) })) {
    authorization.searchParams.set(key, value);
  }
  return authorization.toString();
}

export function registerFieldConnectorRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get('/v1/connections/field', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const rows = await runtime.pool.query<{ id: string; ap_organization_id: string; ap_agent_id: string;
      field_organization_id: string; scopes: string[]; status: string; created_at: Date;
      remote_revoke_state: string | null }>(
      `select c.id, c.ap_organization_id, c.ap_agent_id, c.field_organization_id,
          c.scopes, c.status, c.created_at,r.state as remote_revoke_state
        from ap.field_connections c
        join ap.memberships m on m.organization_id = c.ap_organization_id
        left join ap.field_remote_revocations r on r.connection_id = c.id
        where m.user_id = $1 and m.role = 'owner' order by c.created_at desc`, [userId]);
    return reply.header('Cache-Control', 'private, no-store').send({ connections: rows.rows.map(row => {
      const missingScopes = fieldDecisionScopes.filter(scope => !row.scopes.includes(scope));
      return { id: row.id, apOrganizationId: row.ap_organization_id, apAgentId: row.ap_agent_id,
        fieldOrganizationId: row.field_organization_id, scopes: row.scopes,
        status: row.status, remoteRevokeState: row.remote_revoke_state,
        // 제안 응답·알림 경로 권한 동의 여부. 없으면 해당 기능만 쓸 수 없다
        scopeState: missingScopes.length ? 'scope_missing' : 'complete', missingScopes,
        createdAt: row.created_at };
    }) });
  });

  app.post<{ Params: { id: string } }>('/v1/connections/field/:id/revoke', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'connection_not_found' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const selected = await db.query<{ id: string; ap_organization_id: string;
        ap_grant_id: string; status: string; event_key_id: string | null;
        event_secret_cipher: Buffer | null }>(
        `select c.id,c.ap_organization_id,c.ap_grant_id,c.status,
          c.event_key_id,c.event_secret_cipher
         from ap.field_connections c
         join ap.memberships m on m.organization_id = c.ap_organization_id
           and m.user_id = $2 and m.role = 'owner'
         where c.id = $1 for update of c`, [request.params.id, userId]);
      const connection = selected.rows[0];
      if (!connection) {
        await db.query('rollback'); return reply.code(404).send({ error: 'connection_not_found' });
      }
      const existingRemote = await db.query<{ id: string }>('select id from ap.field_remote_revocations where connection_id=$1', [connection.id]);
      const intent = await recordAgentRevocation(db, runtime.revocationJournal, { organizationId: connection.ap_organization_id,
        targetKind: 'connection', targetId: connection.id, selectionId: connection.ap_grant_id, source: 'owner',
        revocationId: existingRemote.rows[0]?.id ?? (connection.status !== 'revoked' && connection.event_key_id && connection.event_secret_cipher ? randomUUID() : null) });
      if (connection.status !== 'revoked') {
        await db.query(`update ap.field_connections set status = 'revoked',updated_at = now()
          where id = $1`, [connection.id]);
        await db.query(`update ap.knowledge_sources set state = 'revoked',updated_at = now()
          where connection_id = $1`, [connection.id]);
        await db.query(`update ap.oauth_selections set revoked_at = now()
          where id = $1 and revoked_at is null`, [connection.ap_grant_id]);
        await db.query(`update "oauthAccessToken" set revoked = now()
          where "referenceId" = $1 and revoked is null`, [connection.ap_grant_id]);
        await db.query(`update "oauthRefreshToken" set revoked = now()
          where "referenceId" = $1 and revoked is null`, [connection.ap_grant_id]);
        await db.query(`delete from "oauthConsent" where "referenceId" = $1`, [connection.ap_grant_id]);
        if (connection.event_key_id && connection.event_secret_cipher) {
          await db.query(`insert into ap.field_remote_revocations(id,connection_id)
            values ($1,$2) on conflict (connection_id) do nothing`, [intent.revocationId, connection.id]);
        }
        await db.query(`insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload)
          values ($1,$2,'ap.field_connection.local_revoked',$3,$4::jsonb)`,
        [randomUUID(), connection.ap_organization_id, connection.id,
          JSON.stringify({ connectionId: connection.id, remotePending: Boolean(connection.event_key_id) })]);
      }
      const remote = await db.query<{ id: string; state: string }>(
        `select id,state from ap.field_remote_revocations where connection_id = $1`, [connection.id]);
      await db.query('commit');
      return reply.header('Cache-Control', 'private, no-store').send({
        connectionId: connection.id, localStatus: 'revoked',
        revocationId: remote.rows[0]?.id ?? null,
        remoteState: remote.rows[0]?.state ?? (connection.event_key_id ? 'manual_required' : 'not_connected'),
      });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/connections/field/:id/facts', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const result = await inspectFieldFacts(runtime, userId, request.params.id);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error,
      ...(result.status ? { status: result.status } : {}) });
    return reply.header('Cache-Control', 'private, no-store').send({
      connectionId: request.params.id, fieldGrantId: result.fieldGrantId,
      state: 'pending_review', facts: result.facts,
    });
  });

  app.get<{ Params: { id: string } }>('/v1/connections/field/:id/capabilities', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const grant = await inspectFieldGrant(runtime, userId, request.params.id);
    if (!grant.ok) return reply.code(grant.statusCode).send({ error: grant.error,
      ...(grant.status ? { status: grant.status } : {}) });
    try {
      const response = await grant.transport(`${grant.apiUrl}/capabilities`, {
        headers: { authorization: `Bearer ${grant.access}` }, signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return reply.code(502).send({ error: 'field_capabilities_unavailable' });
      const document = object(await response.json());
      const capabilities = object(document?.capabilities);
      const names = ['facts.read', 'availability.read', 'request.create',
        'customer_access.create', 'proposal.respond'];
      if (!document || document.organizationId !== grant.fieldOrganizationId
        || typeof document.schemaVersion !== 'string' || !capabilities
        || names.some(name => typeof capabilities[name] !== 'boolean')) {
        return reply.code(502).send({ error: 'invalid_field_capabilities' });
      }
      if (document.schemaVersion !== '1.0')
        return reply.code(409).send({ error: 'unsupported_field_capabilities_version' });
      return reply.header('Cache-Control', 'private, no-store').send({
        connectionId: request.params.id, organizationId: grant.fieldOrganizationId,
        schemaVersion: document.schemaVersion,
        capabilities: Object.fromEntries(names.map(name => [name, capabilities[name]])),
      });
    } catch { return reply.code(502).send({ error: 'field_capabilities_unavailable' }); }
  });

  app.post('/v1/connections/field/start', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const body = object(request.body);
    const fieldConnectionId = body?.fieldConnectionId;
    const apGrantId = body?.apGrantId;
    if (typeof fieldConnectionId !== 'string' || !uuid.test(fieldConnectionId)
      || typeof apGrantId !== 'string' || !uuid.test(apGrantId))
      return reply.code(400).send({ error: 'invalid_connection_reference' });
    const own = await runtime.pool.query<{ organization_id: string; agent_id: string }>(
      `select s.organization_id, s.agent_id from ap.oauth_selections s
         join ap.memberships m on m.organization_id = s.organization_id
         where s.id = $1 and s.actor_user_id = $2 and m.user_id = $2 and m.role = 'owner'
           and s.revoked_at is null and s.requested_scopes @> array['ap.agent.read','ap.conversations.read']
           and exists (select 1 from "oauthConsent" oc where oc."referenceId" = s.id::text
             and oc."clientId" = s.client_id and oc."userId" = s.actor_user_id
             and oc.scopes @> '["ap.agent.read","ap.conversations.read"]'::jsonb)
           and exists (select 1 from "oauthRefreshToken" t where t."referenceId" = s.id::text
             and t."clientId" = s.client_id and t."userId" = s.actor_user_id
             and t.revoked is null and t."expiresAt" > now())`, [apGrantId, userId]);
    const selection = own.rows[0];
    if (!selection) return reply.code(404).send({ error: 'ap_grant_not_found' });
    const config = runtime.fieldConnector;
    if (!config || !valid(config)) return reply.code(503).send({ error: 'blocked_integration' });
    const existing = await runtime.pool.query('select 1 from ap.field_connections where id = $1', [fieldConnectionId]);
    if (existing.rowCount) return reply.code(409).send({ error: 'connection_already_bound' });
    // 조직 삭제 유예·실행 중에는 새 Field 연결 동의를 시작하지 않는다. 삭제 예약과 같은 조직 행 잠금 아래에서 확인하고 시도를 기록한다(추가)
    const db = await runtime.pool.connect();
    let authorization: string;
    try {
      await db.query('begin');
      await db.query('select id from ap.organizations where id = $1 for share', [selection.organization_id]);
      if (await rejectDeletionScheduled(reply, db, selection.organization_id)) { await db.query('rollback'); return reply; }
      authorization = await startFieldConsent(db, config, { fieldConnectionId, apGrantId,
        apOrganizationId: selection.organization_id, apAgentId: selection.agent_id, userId }, 'full');
      await db.query('commit');
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
    return reply.code(201).header('Cache-Control', 'no-store').send({ authorizationUrl: authorization });
  });

  app.get('/v1/connections/field/callback', async (request, reply) => {
    const config = runtime.fieldConnector;
    if (!config || !valid(config)) return reply.code(503).send({ error: 'blocked_integration' });
    const query = request.query as Record<string, unknown>;
    const state = query.state;
    if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(state)
      || query.iss !== config.issuer) return reply.code(400).send({ error: 'invalid_oauth_callback' });
    const db = await runtime.pool.connect();
    let connectionId = '';
    let accessToken = '';
    let fieldGrantId = '';
    let fieldOrganizationId = '';
    let apGrantId = '';
    let apOrganizationId = '';
    let apAgentId = '';
    let eventKeyId = '';
    let eventSecret = '';
    try {
      await db.query('begin');
      const found = await db.query<{ id: string; field_connection_id: string; ap_grant_id: string;
        ap_organization_id: string; ap_agent_id: string; initiator_user_id: string;
        verifier_cipher: Buffer; status: string; expires_at: Date; scope_set: 'full' | 'base' }>(
        'select * from ap.field_oauth_attempts where state_hash = $1 for update', [hash(state)]);
      const attempt = found.rows[0];
      if (!attempt || attempt.expires_at.getTime() <= Date.now()) {
        await db.query('rollback');
        return reply.code(400).send({ error: 'invalid_oauth_state' });
      }
      // A-10: consent may finish after deletion was scheduled. Serialize with the organization
      // deletion transaction before replay, scope fallback, or any remote token exchange.
      const organization = (await db.query<{ deleted: boolean }>(
        'select deleted_at is not null as deleted from ap.organizations where id=$1 for share',
        [attempt.ap_organization_id])).rows[0];
      const deletion = organization?.deleted !== false || Boolean((await db.query(
        "select 1 from ap.organization_deletion_requests where organization_id=$1 and status in ('scheduled','executed') limit 1",
        [attempt.ap_organization_id])).rowCount);
      if (deletion) {
        if (attempt.status === 'pending')
          await db.query("update ap.field_oauth_attempts set status='denied' where id=$1", [attempt.id]);
        await db.query('commit');
        return reply.header('Cache-Control', 'no-store').code(409).send({ error: 'deletion_scheduled',
          remoteGrantRevocationRequired: true,
          message: '삭제 예정 AP 조직의 연결을 완료할 수 없습니다. Field에서 이미 승인한 연결 동의를 확인하고 회수해 주세요.' });
      }
      if (attempt.status !== 'pending') {
        await db.query('commit');
        const result = attempt.status === 'denied' ? 'denied' : attempt.status === 'unknown'
          ? 'unknown' : (await runtime.pool.query<{ status: string }>(
            'select status from ap.field_connections where id = $1', [attempt.field_connection_id]))
              .rows[0]?.status ?? 'binding_unknown';
        return reply.redirect(target(config, result, attempt.field_connection_id), 303);
      }
      // Field client 등록에 preview.9 scope가 없어 거절됐다. 이 시도를 닫고 기본 scope로 한 번만 다시 시작한다.
      // 이렇게 만든 연결은 제안 응답·알림 경로 scope가 없어 scopeState='scope_missing'으로 보인다
      if (query.error === 'invalid_scope' && attempt.scope_set === 'full') {
        await db.query("update ap.field_oauth_attempts set status = 'denied' where id = $1", [attempt.id]);
        const authorization = await startFieldConsent(db, config, { fieldConnectionId: attempt.field_connection_id,
          apGrantId: attempt.ap_grant_id, apOrganizationId: attempt.ap_organization_id,
          apAgentId: attempt.ap_agent_id, userId: attempt.initiator_user_id }, 'base');
        await db.query('commit');
        return reply.redirect(authorization, 303);
      }
      if (query.error === 'access_denied') {
        await db.query("update ap.field_oauth_attempts set status = 'denied' where id = $1", [attempt.id]);
        await db.query('commit');
        return reply.redirect(target(config, 'denied'), 303);
      }
      if (typeof query.code !== 'string' || !query.code || query.code.length > 2048) {
        await db.query('rollback');
        return reply.code(400).send({ error: 'invalid_oauth_callback' });
      }
      const stillOwner = await db.query(
        "select 1 from ap.memberships where organization_id = $1 and user_id = $2 and role = 'owner'",
        [attempt.ap_organization_id, attempt.initiator_user_id]);
      if (!stillOwner.rowCount) {
        await db.query('rollback');
        return reply.code(403).send({ error: 'owner_permission_revoked' });
      }
      let token: Record<string, unknown>;
      let me: Record<string, unknown>;
      try {
        const transport = config.fetcher ?? fetch;
        const tokenResponse = await transport(`${config.issuer.replace(/\/$/, '')}/oauth2/token`, {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded',
            authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}` },
          body: new URLSearchParams({ grant_type: 'authorization_code', code: query.code,
            redirect_uri: config.redirectUri, code_verifier: unseal(attempt.verifier_cipher, config.tokenKey),
            resource: resource(config) }), signal: AbortSignal.timeout(8000),
        });
        if (!tokenResponse.ok) throw new Error('token_exchange_failed');
        token = object(await tokenResponse.json()) ?? {};
        if (typeof token.access_token !== 'string' || !token.access_token
          || typeof token.refresh_token !== 'string' || !token.refresh_token
          || token.token_type !== 'Bearer' || typeof token.expires_in !== 'number'
          || token.expires_in < 60 || typeof token.scope !== 'string'
          || !['offline_access', ...fieldScopes].every(scope => (token.scope as string).split(' ').includes(scope))) {
          throw new Error('invalid_token_response');
        }
        const result = await transport(`${resource(config)}/me`, {
          headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(8000),
        });
        if (!result.ok) throw new Error('field_grant_probe_failed');
        me = object(await result.json()) ?? {};
      } catch {
        await db.query("update ap.field_oauth_attempts set status = 'unknown' where id = $1", [attempt.id]);
        await db.query('commit');
        return reply.redirect(target(config, 'unknown', attempt.field_connection_id), 303);
      }
      if (!uuid.test(String(me.grantId)) || !uuid.test(String(me.organizationId))
        || me.state !== 'active' || !Array.isArray(me.scopes)
        || !fieldScopes.every(scope => (me.scopes as string[]).includes(scope))) {
        await db.query("update ap.field_oauth_attempts set status = 'unknown' where id = $1", [attempt.id]);
        await db.query('commit');
        return reply.redirect(target(config, 'unknown', attempt.field_connection_id), 303);
      }
      eventKeyId = randomUUID();
      eventSecret = randomBytes(32).toString('base64url');
      const eventKey = createHash('sha256').update(config.tokenKey).update('ap-field-event-route-v1').digest();
      await db.query(`insert into ap.field_connections(id,ap_grant_id,ap_organization_id,ap_agent_id,
        initiator_user_id,field_issuer,field_client_id,field_grant_id,field_organization_id,scopes,
        access_token_cipher,refresh_token_cipher,access_expires_at,status,
        event_key_id,event_secret_cipher,route_generation)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
          now() + ($13::text || ' seconds')::interval,'pending_binding',$14,$15,1)`,
      [attempt.field_connection_id, attempt.ap_grant_id, attempt.ap_organization_id,
        attempt.ap_agent_id, attempt.initiator_user_id, config.issuer, config.clientId,
        me.grantId, me.organizationId, me.scopes,
        seal(token.access_token as string, config.tokenKey),
        seal(token.refresh_token as string, config.tokenKey), token.expires_in,
        eventKeyId, seal(eventSecret, eventKey)]);
      await db.query("update ap.field_oauth_attempts set status = 'completed' where id = $1", [attempt.id]);
      await db.query('commit');
      connectionId = attempt.field_connection_id;
      accessToken = token.access_token as string;
      fieldGrantId = me.grantId as string;
      fieldOrganizationId = me.organizationId as string;
      apGrantId = attempt.ap_grant_id;
      apOrganizationId = attempt.ap_organization_id;
      apAgentId = attempt.ap_agent_id;
    } catch (error) {
      await db.query('rollback');
      throw error;
    } finally { db.release(); }

    let result = 'binding_unknown';
    try {
      const transport = config.fetcher ?? fetch;
      const bound = await transport(`${resource(config)}/connections/${connectionId}/bind`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ apGrantId, apOrganizationId, apAgentId, fieldGrantId,
          eventKeyId, eventSecret, routeGeneration: 1 }),
        signal: AbortSignal.timeout(8000),
      });
      const body = object(await bound.json().catch(() => null));
      if (bound.ok && body?.connectionId === connectionId && body.status === 'review_required'
        && body.fieldOrganizationId === fieldOrganizationId && body.fieldGrantId === fieldGrantId) {
        result = 'review_required';
      }
    } catch { /* The remote outcome is unknown; no automatic second binding request. */ }
    await runtime.pool.query('update ap.field_connections set status = $2, updated_at = now() where id = $1',
      [connectionId, result]);
    return reply.redirect(target(config, result, connectionId), 303);
  });
}
