import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { agentRevocationJournalFromEnvironment } from '../src/revocation-journal.js';
import { createAgentApp } from '../src/app.js';
import { approvedConnectorFacts } from '../src/agents.js';
import { deliverFieldConnectionRevokeOnce } from '../src/field-connection-revoke-worker.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
if (!/^\/fieldai_agent_(?:test|target)_[a-f0-9]+$/.test(new URL(process.env.AP_DATABASE_URL ?? '').pathname))
  throw new Error('AP connection test requires an isolated database for retained AI usage');
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4311';
const fieldIssuer = 'http://127.0.0.1:4321/api/auth';

async function actor() {
  const email = `reverse-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string, body: object) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify(body),
  }));
  assert.equal((await post('/sign-up/email', { email, password, name: 'AP owner' })).status, 200);
  const signed = await post('/sign-in/email', { email, password });
  assert.equal(signed.status, 200);
  return { email, cookie: signed.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('AP BFF accepts a separate Field grant only for the AP actor and pending connection', async () => {
  const owner = await actor();
  const outsider = await actor();
  const apOrganizationId = randomUUID();
  const apAgentId = randomUUID();
  const fieldOrganizationId = randomUUID();
  const fieldGrantId = randomUUID();
  const fieldServiceId = randomUUID();
  const fieldConnectionId = randomUUID();
  const apGrantId = randomUUID();
  const ownerSession = await auth.api.getSession({ headers: new Headers({ cookie: owner.cookie }) });
  assert.ok(ownerSession);
  let tokenCalls = 0;
  let bindCalls = 0;
  let revokeCalls = 0;
  let remoteRevokeDown = true;
  let eventKeyId = '';
  let eventSecret = '';
  let sentRevocationId = '';
  // 해제 발신마다 받은 서명 버전 헤더와 그 버전 원문으로 계산한 서명 일치 여부(호출 뒤 단언한다)
  const revokeSignatures: { version: string | null; valid: boolean }[] = [];
  // 발신기가 fetcher 예외를 'retry'로 삼키므로 stub 안의 단언 실패를 기록해 호출 뒤 원인을 드러낸다
  let revokeStubError: unknown;
  let factsCalls = 0;
  let refreshFails = false;
  // refresh 응답을 붙잡아 두는 관문. 갱신 중에 다른 요청이 같은 refresh token을 다시 쓰지 않는지(임대 CAS) 확인한다
  let refreshGate: Promise<void> | null = null;
  let refreshEntered: (() => void) | null = null;
  let wrongFactsOrganization = false;
  let factsUnavailable = false;
  let fieldProbeUnavailable = false;
  let waitForFacts: (() => Promise<void>) | null = null;
  let factsRevision = 3;
  let factsHash = 'a'.repeat(64);
  let changeDuringGeneration = false;
  let capabilityMode: 'valid' | 'wrong_org' | 'bad_version' | 'unavailable' = 'valid';
  const seenFacts: { id: string; text: string }[][] = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url === `http://127.0.0.1:4321/integrations/v1/connections/${fieldConnectionId}/revoke`
      && init?.method === 'POST') {
      revokeCalls++;
      const headers = init.headers as Record<string, string>;
      const revocationId = headers['x-revocation-id'];
      try {
        assert.ok(revocationId);
        assert.equal(headers['x-key-id'], eventKeyId);
        // 발신 버전 2는 `v2:ap->field.` 방향 접두사, 1(전환 기간)은 버전 헤더와 접두사가 없는 원문으로 서명한다.
        // fetcher 안의 단언 실패는 발신기가 전송 실패(retry)로 삼키므로 결과를 기록해 호출 뒤 단언한다
        const version = headers['x-signature-version'] ?? null;
        revokeSignatures.push({ version, valid: headers['x-signature'] === createHmac('sha256',
          Buffer.from(eventSecret, 'base64url')).update(`${version === '2' ? 'v2:ap->field.' : ''}${
          headers['x-timestamp']}.${revocationId}.${fieldConnectionId}.revoke`).digest('hex') });
        assert.equal(sentRevocationId === '' || sentRevocationId === revocationId, true);
      } catch (error) { revokeStubError ??= error; throw error; }
      sentRevocationId = revocationId;
      if (remoteRevokeDown) throw new Error('Field unavailable');
      return Response.json({ connectionId: fieldConnectionId, status: 'revoked', revocationId });
    }
    if (url === `${fieldIssuer}/oauth2/token`) {
      tokenCalls++;
      if (new URLSearchParams(String(init?.body)).get('grant_type') === 'refresh_token') {
        if (refreshFails) return Response.json({ error: 'invalid_grant' }, { status: 400 });
        refreshEntered?.();
        if (refreshGate) await refreshGate;
        assert.equal(new URLSearchParams(String(init?.body)).get('refresh_token'),
          'field-refresh-synthetic-secret');
        return Response.json({ access_token: 'field-access-rotated-secret',
          refresh_token: 'field-refresh-rotated-secret', token_type: 'Bearer', expires_in: 600,
          scope: 'offline_access field.facts.read field.availability.read field.requests.create field.requests.read field.customer_access.create' });
      }
      return Response.json({ access_token: 'field-access-synthetic-secret',
        refresh_token: 'field-refresh-synthetic-secret', token_type: 'Bearer', expires_in: 600,
        scope: 'offline_access field.facts.read field.availability.read field.requests.create field.requests.read field.customer_access.create' });
    }
    if (url === 'http://127.0.0.1:4321/integrations/v1/me') {
      if (fieldProbeUnavailable) return Response.json({ error: 'unavailable' }, { status: 503 });
      return Response.json({
      grantId: fieldGrantId, organizationId: fieldOrganizationId,
      scopes: ['field.facts.read', 'field.availability.read', 'field.requests.create', 'field.requests.read',
        'field.customer_access.create'], state: 'active',
      });
    }
    if (url === 'http://127.0.0.1:4321/integrations/v1/capabilities') {
      if (capabilityMode === 'unavailable') return Response.json({ error: 'unavailable' }, { status: 503 });
      return Response.json({ organizationId: capabilityMode === 'wrong_org' ? randomUUID() : fieldOrganizationId,
        schemaVersion: capabilityMode === 'bad_version' ? '2.0' : '1.0',
        capabilities: { 'facts.read': true, 'availability.read': false,
          'request.create': false, 'customer_access.create': false, 'proposal.respond': false } });
    }
    if (url === 'http://127.0.0.1:4321/integrations/v1/facts') {
      factsCalls++;
      if (factsUnavailable) return Response.json({ error: 'unavailable' }, { status: 503 });
      if (waitForFacts) await waitForFacts();
      assert.ok(['Bearer field-access-synthetic-secret', 'Bearer field-access-rotated-secret'].includes(
        init?.headers && 'authorization' in init.headers
          ? String(init.headers.authorization) : ''));
      return Response.json({ organizationId: wrongFactsOrganization ? randomUUID() : fieldOrganizationId,
        releaseId: randomUUID(),
        revision: factsRevision, contentHash: factsHash, publishedAt: new Date().toISOString(),
        businessName: '공개된 Field 사업장', introduction: '공개 소개', region: '서울',
        openingHours: '09:00-18:00', services: [{ id: fieldServiceId,
          name: 'AP 상담', description: 'Field에서 승인한 상담 설명',
          bookingMode: 'request', durationMinutes: 30, priceAmount: 50000 }],
        faqs: [{ question: '방문 전 준비는?', answer: '상담 내용을 미리 적어주세요.' }],
        contactPhone: '010-9999-9999', internalNote: 'not-for-connector' });
    }
    if (url === `http://127.0.0.1:4321/integrations/v1/connections/${fieldConnectionId}/bind`
      && init?.method === 'POST') {
      bindCalls++;
      const body = JSON.parse(String(init.body)) as { apGrantId: string; apOrganizationId: string;
        eventKeyId: string; eventSecret: string; routeGeneration: number };
      assert.equal(body.apGrantId, apGrantId);
      assert.equal(body.apOrganizationId, apOrganizationId);
      assert.match(body.eventKeyId, /^[0-9a-f-]{36}$/);
      assert.match(body.eventSecret, /^[A-Za-z0-9_-]{43}$/);
      eventKeyId = body.eventKeyId;
      eventSecret = body.eventSecret;
      assert.equal(body.routeGeneration, 1);
      return Response.json({ connectionId: fieldConnectionId, status: 'review_required',
        fieldOrganizationId, fieldGrantId });
    }
    throw new Error(`Unexpected Field request ${url}`);
  };
  const runtime = {
    pool,
    revocationJournal: agentRevocationJournalFromEnvironment(),
    resolveUserId: async (headers: import('node:http').IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    resolveSession: async (headers: import('node:http').IncomingHttpHeaders) => {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
      return session ? { id: session.session.id, userId: session.user.id } : null;
    },
    fieldConnector: { issuer: fieldIssuer, clientId: 'registered-field-client',
      clientSecret: 'server-only-field-secret', tokenKey: randomBytes(32),
      redirectUri: `${base}/v1/connections/field/callback`, webOrigin: 'http://localhost:3001', fetcher },
    modelProvider: { model: 'synthetic-field-source', generate: async (request: {
      facts: { id: string; text: string }[] }) => {
      seenFacts.push(request.facts);
      if (changeDuringGeneration) {
        changeDuringGeneration = false;
        assert.ok(request.facts.some(fact => fact.id === `field:service:${fieldServiceId}`));
        factsRevision = 4;
        factsHash = 'b'.repeat(64);
        return { output: { answer: 'Field 상담을 제공합니다.',
          evidenceIds: [`field:service:${fieldServiceId}`], unknowns: [],
          handoffRecommended: false }, inputTokens: 10, outputTokens: 5,
        responseId: `synthetic-field-source-${seenFacts.length}` };
      }
      return { output: { answer: '상담을 안내합니다.', evidenceIds: ['business'],
        unknowns: [], handoffRecommended: false }, inputTokens: 10, outputTokens: 5,
        responseId: `synthetic-field-source-${seenFacts.length}` };
    } },
    testDailyLimit: 20,
  };
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, runtime);
  const standalone = createAgentApp(async () => undefined, auth.handler, base, undefined,
    { pool, resolveUserId: runtime.resolveUserId, resolveSession: runtime.resolveSession });
  try {
    await pool.query('insert into ap.organizations(id, owner_user_id, name) values ($1,$2,$3)',
      [apOrganizationId, ownerSession.user.id, '역방향 AP 조직']);
    await pool.query("insert into ap.memberships(organization_id,user_id,role) values ($1,$2,'owner')",
      [apOrganizationId, ownerSession.user.id]);
    await pool.query(`insert into ap.knowledge_drafts(organization_id,content,updated_by)
      values ($1,$2::jsonb,$3)`, [apOrganizationId,
      JSON.stringify({ businessName: '역방향 AP 조직', introduction: '', services: [], faqs: [] }),
      ownerSession.user.id]);
    await pool.query(`insert into ap.agent_drafts(organization_id,agent_id,content,updated_by)
      values ($1,$2,$3::jsonb,$4)`, [apOrganizationId, apAgentId,
      JSON.stringify({ name: 'Field 연결 AP AI', tone: 'clear', guideScope: '',
        handoffText: '담당자가 확인합니다.' }), ownerSession.user.id]);
    const nativeDraft = await app.inject({ method: 'PUT', url: '/v1/knowledge/draft',
      headers: { cookie: owner.cookie, 'x-organization-id': apOrganizationId },
      payload: { expectedRevision: 0, businessName: '역방향 AP 조직', introduction: 'AP 직접 소개',
        services: [{ name: 'AP 상담', description: '직접 입력한 상담' }], faqs: [] } });
    assert.equal(nativeDraft.statusCode, 200, nativeDraft.body);
    const nativeRelease = await app.inject({ method: 'POST', url: '/v1/knowledge/releases',
      headers: { cookie: owner.cookie, 'x-organization-id': apOrganizationId },
      payload: { expectedRevision: 1 } });
    assert.equal(nativeRelease.statusCode, 201, nativeRelease.body);
    const registered = await auth.handler(new Request(`${base}/api/auth/oauth2/create-client`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: owner.cookie },
      body: JSON.stringify({ client_name: 'First leg mock Field client',
        redirect_uris: ['http://127.0.0.1:4399/callback'], application_type: 'native',
        token_endpoint_auth_method: 'client_secret_basic',
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
        scope: 'openid offline_access ap.agent.read ap.conversations.read' }),
    }));
    assert.equal(registered.status, 201, await registered.clone().text());
    const apClientId = (await registered.json() as { client_id: string }).client_id;
    await pool.query(`insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,
      organization_id,agent_id,requested_scopes,selection_expires_at)
      values ($1,$2,$3,$4,$5,$6,$7::text[],now() + interval '5 minutes')`,
    [apGrantId, ownerSession.session.id, ownerSession.user.id, apClientId,
      apOrganizationId, apAgentId, ['ap.agent.read', 'ap.conversations.read']]);
    await pool.query(`insert into "oauthConsent"("id","clientId","userId","referenceId","resources",
      "scopes","createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,now(),now())`,
    [randomUUID(), apClientId, ownerSession.user.id, apGrantId,
      JSON.stringify([`${base}/integrations/v1`]), JSON.stringify(['offline_access', 'ap.agent.read', 'ap.conversations.read'])]);
    await pool.query(`insert into "oauthRefreshToken"("id","token","clientId","userId","referenceId",
      "resources","scopes","expiresAt","createdAt")
      values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,now() + interval '1 hour',now())`,
    [randomUUID(), randomBytes(32).toString('base64url'), apClientId, ownerSession.user.id,
      apGrantId, JSON.stringify([`${base}/integrations/v1`]),
      JSON.stringify(['offline_access', 'ap.agent.read', 'ap.conversations.read'])]);
    const payload = { fieldConnectionId, apGrantId };
    const path = '/v1/connections/field/start';
    assert.equal((await standalone.inject({ method: 'POST', url: path,
      headers: { cookie: owner.cookie }, payload })).statusCode, 503);
    assert.equal((await app.inject({ method: 'POST', url: path,
      headers: { cookie: outsider.cookie }, payload })).statusCode, 404);
    const started = await app.inject({ method: 'POST', url: path,
      headers: { cookie: owner.cookie }, payload });
    assert.equal(started.statusCode, 201, started.body);
    const authorization = new URL(started.json().authorizationUrl as string);
    assert.equal(authorization.origin, 'http://127.0.0.1:4321');
    assert.equal(authorization.pathname, '/api/auth/oauth2/authorize');
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    assert.match(authorization.searchParams.get('scope') ?? '', /field\.facts\.read/);
    assert.match(authorization.searchParams.get('scope') ?? '', /field\.availability\.read/);
    assert.match(authorization.searchParams.get('scope') ?? '', /field\.requests\.create/);
    assert.match(authorization.searchParams.get('scope') ?? '', /field\.requests\.read/);
    assert.match(authorization.searchParams.get('scope') ?? '', /field\.customer_access\.create/);
    const state = authorization.searchParams.get('state');
    assert.ok(state);
    const callback = (params: URLSearchParams) => app.inject({
      url: `/v1/connections/field/callback?${params}` });
    assert.equal((await callback(new URLSearchParams({ state, code: 'wrong-issuer',
      iss: 'https://evil.example.test' }))).statusCode, 400);
    const denied = await callback(new URLSearchParams({ state, error: 'access_denied', iss: fieldIssuer }));
    assert.equal(denied.statusCode, 303);
    assert.match(denied.headers.location ?? '', /result=denied/);
    assert.equal(tokenCalls, 0);
    const retried = await app.inject({ method: 'POST', url: path,
      headers: { cookie: owner.cookie }, payload });
    assert.equal(retried.statusCode, 201);
    const retryState = new URL(retried.json().authorizationUrl as string).searchParams.get('state');
    assert.ok(retryState);
    // Field client 등록에 preview.9 scope가 없으면 authorize가 invalid_scope로 돌아온다. 기본 scope로 한 번만 다시 시작한다
    const scopeRefused = await callback(new URLSearchParams({ state: retryState, error: 'invalid_scope', iss: fieldIssuer }));
    assert.equal(scopeRefused.statusCode, 303, scopeRefused.body);
    const fallback = new URL(scopeRefused.headers.location ?? 'http://invalid.local');
    assert.equal(fallback.origin, 'http://127.0.0.1:4321');
    assert.equal(fallback.pathname, '/api/auth/oauth2/authorize');
    const fallbackScopes = fallback.searchParams.get('scope')?.split(' ') ?? [];
    assert.deepEqual(fallbackScopes, ['openid', 'offline_access', 'field.facts.read', 'field.availability.read',
      'field.requests.create', 'field.requests.read', 'field.customer_access.create']);
    const fallbackState = fallback.searchParams.get('state');
    assert.ok(fallbackState);
    assert.notEqual(fallbackState, retryState);
    // 기본 scope 동의도 invalid_scope면 다시 시작하지 않는다(무한 재시작 금지)
    assert.equal((await callback(new URLSearchParams({ state: fallbackState, error: 'invalid_scope',
      iss: fieldIssuer }))).statusCode, 400);
    assert.equal(tokenCalls, 0);
    const completed = await callback(new URLSearchParams({ state: fallbackState, code: 'approved-code', iss: fieldIssuer }));
    assert.equal(completed.statusCode, 303, completed.body);
    const destination = new URL(completed.headers.location ?? 'http://invalid.local');
    assert.equal(destination.searchParams.get('result'), 'review_required');
    assert.equal(destination.searchParams.get('connectionId'), fieldConnectionId);
    assert.equal(tokenCalls, 1);
    assert.equal(bindCalls, 1);
    const replay = await callback(new URLSearchParams({ state: fallbackState, code: 'approved-code', iss: fieldIssuer }));
    assert.equal(replay.headers.location, completed.headers.location);
    assert.equal(tokenCalls, 1);
    assert.equal(bindCalls, 1);
    const listing = await app.inject({ url: '/v1/connections/field', headers: { cookie: owner.cookie } });
    assert.equal(listing.statusCode, 200);
    assert.equal(listing.json().connections[0].fieldOrganizationId, fieldOrganizationId);
    assert.equal(listing.json().connections[0].status, 'review_required');
    // 기본 scope로 만든 연결은 제안 응답·알림 경로 scope가 없음을 표시한다
    assert.equal(listing.json().connections[0].scopeState, 'scope_missing');
    assert.deepEqual(listing.json().connections[0].missingScopes,
      ['field.proposals.respond', 'field.notification_route.read']);
    const capabilitiesPath = `/v1/connections/field/${fieldConnectionId}/capabilities`;
    assert.equal((await app.inject({ url: capabilitiesPath,
      headers: { cookie: outsider.cookie } })).statusCode, 404);
    const capabilities = await app.inject({ url: capabilitiesPath,
      headers: { cookie: owner.cookie } });
    assert.equal(capabilities.statusCode, 200, capabilities.body);
    assert.deepEqual(capabilities.json().capabilities, {
      'facts.read': true, 'availability.read': false,
      'request.create': false, 'customer_access.create': false, 'proposal.respond': false,
    });
    capabilityMode = 'wrong_org';
    assert.equal((await app.inject({ url: capabilitiesPath,
      headers: { cookie: owner.cookie } })).statusCode, 502);
    capabilityMode = 'bad_version';
    assert.equal((await app.inject({ url: capabilitiesPath,
      headers: { cookie: owner.cookie } })).statusCode, 409);
    capabilityMode = 'unavailable';
    assert.equal((await app.inject({ url: capabilitiesPath,
      headers: { cookie: owner.cookie } })).statusCode, 502);
    capabilityMode = 'valid';
    assert.doesNotMatch(listing.body, /synthetic-secret|server-only-field-secret/);
    const cipher = await pool.query<{ access_token_cipher: Buffer; refresh_token_cipher: Buffer }>(
      'select access_token_cipher, refresh_token_cipher from ap.field_connections where id = $1',
      [fieldConnectionId]);
    assert.ok(cipher.rows[0]);
    assert.doesNotMatch(cipher.rows[0].access_token_cipher.toString(), /field-access-synthetic-secret/);
    assert.doesNotMatch(cipher.rows[0].refresh_token_cipher.toString(), /field-refresh-synthetic-secret/);
    const factsPath = `/v1/connections/field/${fieldConnectionId}/facts`;
    assert.equal((await app.inject({ url: factsPath,
      headers: { cookie: outsider.cookie } })).statusCode, 404);
    const preview = await app.inject({ url: factsPath, headers: { cookie: owner.cookie } });
    assert.equal(preview.statusCode, 200, preview.body);
    assert.equal(preview.json().state, 'pending_review');
    assert.equal(preview.json().facts.businessName, '공개된 Field 사업장');
    assert.deepEqual(preview.json().facts.faqs,
      [{ question: '방문 전 준비는?', answer: '상담 내용을 미리 적어주세요.' }]);
    assert.doesNotMatch(preview.body, /internalNote|contactPhone|not-for-connector/);
    assert.equal(factsCalls, 1);
    const syncPath = `/v1/connections/field/${fieldConnectionId}/sync`;
    assert.equal((await app.inject({ method: 'POST', url: syncPath,
      headers: { cookie: outsider.cookie } })).statusCode, 404);
    const firstSync = await app.inject({ method: 'POST', url: syncPath,
      headers: { cookie: owner.cookie } });
    assert.equal(firstSync.statusCode, 201, firstSync.body);
    assert.equal(firstSync.json().state, 'pending_review');
    assert.equal(firstSync.json().sourceRevision, 3);
    const sourceId = firstSync.json().sourceId as string;
    const repeated = await app.inject({ method: 'POST', url: syncPath,
      headers: { cookie: owner.cookie } });
    assert.equal(repeated.statusCode, 200, repeated.body);
    assert.equal(repeated.json().sourceId, sourceId);
    assert.equal(repeated.json().outcome, 'unchanged');
    const approvePath = `/v1/connections/field/${fieldConnectionId}/source/approve`;
    const approval3 = { expectedSourceRevision: 3, expectedContentHash: 'a'.repeat(64) };
    assert.equal((await app.inject({ method: 'POST', url: approvePath,
      headers: { cookie: outsider.cookie }, payload: approval3 })).statusCode, 404);
    factsRevision = 4;
    factsHash = 'b'.repeat(64);
    const changedBeforeApproval = await app.inject({ method: 'POST', url: approvePath,
      headers: { cookie: owner.cookie }, payload: approval3 });
    assert.equal(changedBeforeApproval.statusCode, 409, changedBeforeApproval.body);
    assert.equal(changedBeforeApproval.json().error, 'source_version_changed');
    factsRevision = 3;
    factsHash = 'a'.repeat(64);
    factsUnavailable = true;
    const unavailableApproval = await app.inject({ method: 'POST', url: approvePath,
      headers: { cookie: owner.cookie }, payload: approval3 });
    assert.equal(unavailableApproval.statusCode, 502, unavailableApproval.body);
    factsUnavailable = false;
    const approved = await app.inject({ method: 'POST', url: approvePath,
      headers: { cookie: owner.cookie }, payload: approval3 });
    assert.equal(approved.statusCode, 201, approved.body);
    assert.equal(approved.json().state, 'current');
    assert.equal(approved.json().approvedSourceRevision, 3);
    const approvedAgain = await app.inject({ method: 'POST', url: approvePath,
      headers: { cookie: owner.cookie }, payload: approval3 });
    assert.equal(approvedAgain.statusCode, 200, approvedAgain.body);
    assert.equal(approvedAgain.json().outcome, 'unchanged');
    const afterApproval = await app.inject({ url: `/v1/connections/field/${fieldConnectionId}/source`,
      headers: { cookie: owner.cookie } });
    assert.equal(afterApproval.json().approvedSourceRevision, 3);
    assert.equal(afterApproval.json().state, 'current');
    const publishPath = `/v1/connections/field/${fieldConnectionId}/source/publish`;
    const mappingPath = `/v1/connections/field/${fieldConnectionId}/source/mapping-options`;
    assert.equal((await app.inject({ url: mappingPath,
      headers: { cookie: outsider.cookie } })).statusCode, 404);
    const mappingOptions = await app.inject({ url: mappingPath, headers: { cookie: owner.cookie } });
    assert.equal(mappingOptions.statusCode, 200, mappingOptions.body);
    assert.equal(mappingOptions.json().nativeReleaseId, nativeRelease.json().releaseId);
    assert.equal(mappingOptions.json().services[0].name, 'AP 상담');
    const publishInput = { expectedSourceRevision: 3, expectedContentHash: 'a'.repeat(64),
      expectedNativeReleaseId: nativeRelease.json().releaseId as string,
      includeBusinessIntroduction: true, includeFaqs: true, includedServiceIds: [fieldServiceId],
      serviceMappings: [{ fieldServiceId, nativeServiceIndex: 0, priority: 'field' }] };
    const unresolved = await app.inject({ method: 'POST', url: publishPath,
      headers: { cookie: owner.cookie }, payload: { ...publishInput, serviceMappings: [] } });
    assert.equal(unresolved.statusCode, 409, unresolved.body);
    assert.equal(unresolved.json().error, 'source_mapping_conflict');
    assert.equal((await app.inject({ method: 'POST', url: publishPath,
      headers: { cookie: outsider.cookie }, payload: publishInput })).statusCode, 404);
    const published = await app.inject({ method: 'POST', url: publishPath,
      headers: { cookie: owner.cookie }, payload: publishInput });
    assert.equal(published.statusCode, 201, published.body);
    assert.equal(published.json().knowledgeRevision, 2);
    const connectorRelease = await pool.query<{ source_kind: string; draft_revision: number;
      content: { businessName: string; introduction: string;
        services: { name: string }[]; sourceFacts: { id: string; text: string }[] } }>(
      'select source_kind, draft_revision, content from ap.knowledge_releases where id = $1',
      [published.json().releaseId]);
    assert.equal(connectorRelease.rows[0]?.source_kind, 'connector');
    assert.equal(connectorRelease.rows[0]?.draft_revision, 1);
    assert.equal(connectorRelease.rows[0]?.content.businessName, '역방향 AP 조직');
    assert.equal(connectorRelease.rows[0]?.content.services.length, 0);
    assert.equal(connectorRelease.rows[0]?.content.sourceFacts.length, 3);
    assert.ok(connectorRelease.rows[0]?.content.sourceFacts.some(fact =>
      fact.text.includes('방문 전 준비는?') && fact.text.includes('상담 내용을 미리 적어주세요.')));
    assert.doesNotMatch(JSON.stringify(connectorRelease.rows[0]?.content), /50000|09:00-18:00/);
    const publicKnowledge = await app.inject({ url: `/v1/public/organizations/${apOrganizationId}` });
    assert.equal(publicKnowledge.statusCode, 200, publicKnowledge.body);
    assert.doesNotMatch(publicKnowledge.body, /sourceFacts|공개된 Field 사업장|Field 상담|직접 입력한 상담/);
    const publishedAgain = await app.inject({ method: 'POST', url: publishPath,
      headers: { cookie: owner.cookie }, payload: publishInput });
    assert.equal(publishedAgain.statusCode, 200, publishedAgain.body);
    assert.equal(publishedAgain.json().releaseId, published.json().releaseId);
    assert.equal((await approvedConnectorFacts(pool, published.json().releaseId)).length, 3);
    const nativePriority = await app.inject({ method: 'POST', url: publishPath,
      headers: { cookie: owner.cookie }, payload: { ...publishInput,
        serviceMappings: [{ fieldServiceId, nativeServiceIndex: 0, priority: 'native' }] } });
    assert.equal(nativePriority.statusCode, 201, nativePriority.body);
    const nativePriorityContent = await pool.query<{ content: {
      services: { name: string; description: string }[]; sourceFacts: { id: string }[] } }>(
      'select content from ap.knowledge_releases where id = $1', [nativePriority.json().releaseId]);
    assert.equal(nativePriorityContent.rows[0]?.content.services[0]?.description, '직접 입력한 상담');
    assert.equal(nativePriorityContent.rows[0]?.content.sourceFacts.length, 2);
    const separate = await app.inject({ method: 'POST', url: publishPath,
      headers: { cookie: owner.cookie }, payload: { ...publishInput,
        serviceMappings: [{ fieldServiceId, priority: 'separate' }] } });
    assert.equal(separate.statusCode, 201, separate.body);
    const separateContent = await pool.query<{ content: {
      services: { name: string }[]; sourceFacts: { id: string }[] } }>(
      'select content from ap.knowledge_releases where id = $1', [separate.json().releaseId]);
    assert.equal(separateContent.rows[0]?.content.services[0]?.name, 'AP 상담');
    assert.equal(separateContent.rows[0]?.content.sourceFacts.length, 3);
    const backToField = await app.inject({ method: 'POST', url: publishPath,
      headers: { cookie: owner.cookie }, payload: publishInput });
    assert.equal(backToField.statusCode, 201, backToField.body);
    const backToFieldContent = await pool.query<{ content: {
      services: { name: string }[]; sourceFacts: { id: string }[] } }>(
      'select content from ap.knowledge_releases where id = $1', [backToField.json().releaseId]);
    assert.equal(backToFieldContent.rows[0]?.content.services.length, 0);
    assert.equal(backToFieldContent.rows[0]?.content.sourceFacts.length, 3);
    const currentMapping = await app.inject({ url: mappingPath, headers: { cookie: owner.cookie } });
    assert.equal(currentMapping.statusCode, 200, currentMapping.body);
    assert.deepEqual(currentMapping.json().currentSelection.serviceMappings,
      [{ fieldServiceId, priority: 'field', nativeServiceIndex: 0 }]);
    await pool.query("update ap.knowledge_sources set fetched_at = now() - interval '25 hours' where id = $1",
      [sourceId]);
    assert.deepEqual(await approvedConnectorFacts(pool, published.json().releaseId), []);
    await pool.query('update ap.knowledge_sources set fetched_at = now() where id = $1', [sourceId]);
    const revisedDraft = await app.inject({ method: 'PUT', url: '/v1/knowledge/draft',
      headers: { cookie: owner.cookie, 'x-organization-id': apOrganizationId },
      payload: { expectedRevision: 1, businessName: '역방향 AP 조직', introduction: '수정한 AP 소개',
        services: [{ name: 'AP 상담', description: '직접 수정한 상담' }], faqs: [] } });
    assert.equal(revisedDraft.statusCode, 200, revisedDraft.body);
    const revisedNative = await app.inject({ method: 'POST', url: '/v1/knowledge/releases',
      headers: { cookie: owner.cookie, 'x-organization-id': apOrganizationId },
      payload: { expectedRevision: 2 } });
    assert.equal(revisedNative.statusCode, 201, revisedNative.body);
    assert.equal(revisedNative.json().revision, 6);
    assert.deepEqual(await approvedConnectorFacts(pool, revisedNative.json().releaseId), []);
    const staleNative = await app.inject({ method: 'POST', url: publishPath,
      headers: { cookie: owner.cookie }, payload: publishInput });
    assert.equal(staleNative.statusCode, 409, staleNative.body);
    assert.equal(staleNative.json().error, 'native_knowledge_release_changed');
    publishInput.expectedNativeReleaseId = revisedNative.json().releaseId;
    const republished = await app.inject({ method: 'POST', url: publishPath,
      headers: { cookie: owner.cookie }, payload: publishInput });
    assert.equal(republished.statusCode, 201, republished.body);
    assert.equal(republished.json().knowledgeRevision, 7);
    const reconnected = await pool.query<{ draft_revision: number; content: { introduction: string } }>(
      'select draft_revision, content from ap.knowledge_releases where id = $1',
      [republished.json().releaseId]);
    assert.equal(reconnected.rows[0]?.draft_revision, 2);
    assert.equal(reconnected.rows[0]?.content.introduction, '수정한 AP 소개');
    const agentDraft = await app.inject({ method: 'PUT', url: '/v1/agents/draft',
      headers: { cookie: owner.cookie, 'x-organization-id': apOrganizationId },
      payload: { expectedRevision: 0, name: 'Field 연결 AP AI', tone: 'clear', guideScope: '',
        handoffText: '담당자가 확인합니다.' } });
    assert.equal(agentDraft.statusCode, 200, agentDraft.body);
    const agentRelease = await app.inject({ method: 'POST', url: '/v1/agents/releases',
      headers: { cookie: owner.cookie, 'x-organization-id': apOrganizationId },
      payload: { expectedRevision: 1, expectedKnowledgeRevision: 7 } });
    assert.equal(agentRelease.statusCode, 201, agentRelease.body);
    const deployment = await app.inject({ method: 'POST', url: '/v1/deployments',
      headers: { cookie: owner.cookie, 'x-organization-id': apOrganizationId },
      payload: { kind: 'link' } });
    assert.equal(deployment.statusCode, 201, deployment.body);
    assert.equal((await app.inject({ method: 'POST',
      url: `/v1/deployments/${deployment.json().id}/activate`,
      headers: { cookie: owner.cookie, 'x-organization-id': apOrganizationId } })).statusCode, 200);
    const guest = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${deployment.json().publicId}/engagements` });
    assert.equal(guest.statusCode, 201, guest.body);
    const guestCookie = guest.headers['set-cookie']?.toString().split(';')[0];
    assert.ok(guestCookie?.startsWith('ap_consult_session='));
    const ownerTest = () => app.inject({ method: 'POST', url: '/v1/agents/test',
      headers: { cookie: owner.cookie, 'x-organization-id': apOrganizationId },
      payload: { question: '어떤 상담을 하나요?' } });
    assert.equal((await ownerTest()).statusCode, 200);
    assert.equal(seenFacts.at(-1)?.filter(fact => fact.id.startsWith('field:')).length, 3);
    await pool.query("update ap.knowledge_sources set fetched_at = now() - interval '25 hours' where id = $1",
      [sourceId]);
    assert.equal((await ownerTest()).statusCode, 200);
    assert.equal(seenFacts.at(-1)?.filter(fact => fact.id.startsWith('field:')).length, 3);
    changeDuringGeneration = true;
    const changedDuringAnswer = await ownerTest();
    assert.equal(changedDuringAnswer.statusCode, 200, changedDuringAnswer.body);
    assert.equal(changedDuringAnswer.json().answer, '');
    assert.deepEqual(changedDuringAnswer.json().evidenceIds, []);
    assert.equal(changedDuringAnswer.json().handoffRecommended, true);
    factsRevision = 3;
    factsHash = 'a'.repeat(64);
    changeDuringGeneration = true;
    const guestChangedDuringAnswer = await app.inject({ method: 'POST',
      url: `/v1/engagements/${guest.json().id}/messages`, headers: { cookie: guestCookie },
      payload: { question: 'Field 상담은 무엇인가요?' } });
    assert.equal(guestChangedDuringAnswer.statusCode, 200, guestChangedDuringAnswer.body);
    assert.equal(guestChangedDuringAnswer.json().answer, '');
    assert.deepEqual(guestChangedDuringAnswer.json().evidenceIds, []);
    assert.equal(guestChangedDuringAnswer.json().handoffRecommended, true);
    assert.deepEqual((await app.inject({ url: `/v1/engagements/${guest.json().id}`,
      headers: { cookie: guestCookie } })).json().messages.map(
      (message: { actor: string }) => message.actor), ['customer']);
    const beforeChangedEvent = await ownerTest();
    assert.equal(beforeChangedEvent.statusCode, 200, beforeChangedEvent.body);
    assert.equal(seenFacts.at(-1)?.filter(fact => fact.id.startsWith('field:')).length, 0);
    assert.equal(beforeChangedEvent.json().handoffRecommended, true);
    factsUnavailable = true;
    const duringFieldOutage = await ownerTest();
    assert.equal(duringFieldOutage.statusCode, 200, duringFieldOutage.body);
    assert.equal(seenFacts.at(-1)?.filter(fact => fact.id.startsWith('field:')).length, 0);
    assert.equal(duringFieldOutage.json().handoffRecommended, true);
    factsUnavailable = false;
    fieldProbeUnavailable = true;
    const duringGrantProbeOutage = await ownerTest();
    assert.equal(duringGrantProbeOutage.statusCode, 200, duringGrantProbeOutage.body);
    assert.equal(duringGrantProbeOutage.json().handoffRecommended, true);
    assert.equal((await pool.query<{ status: string }>(
      'select status from ap.field_connections where id = $1', [fieldConnectionId]))
      .rows[0]?.status, 'review_required');
    // 사업자 경로(degrade 기본값)에서도 Field 일시 장애(5xx)는 연결을 degraded로 바꾸지 않는다
    const ownerDuringProbeOutage = await app.inject({ url: factsPath, headers: { cookie: owner.cookie } });
    assert.equal(ownerDuringProbeOutage.statusCode, 503, ownerDuringProbeOutage.body);
    assert.equal((await pool.query<{ status: string }>(
      'select status from ap.field_connections where id = $1', [fieldConnectionId]))
      .rows[0]?.status, 'review_required');
    fieldProbeUnavailable = false;
    const guestFallback = await app.inject({ method: 'POST',
      url: `/v1/engagements/${guest.json().id}/messages`, headers: { cookie: guestCookie },
      payload: { question: 'AP 상담은 무엇인가요?' } });
    assert.equal(guestFallback.statusCode, 200, guestFallback.body);
    assert.equal(guestFallback.json().answer, '상담을 안내합니다.');
    assert.equal(guestFallback.json().handoffRecommended, true);
    assert.equal(seenFacts.at(-1)?.filter(fact => fact.id.startsWith('field:')).length, 0);
    const newer = await app.inject({ method: 'POST', url: syncPath,
      headers: { cookie: owner.cookie } });
    assert.equal(newer.statusCode, 201, newer.body);
    assert.equal(newer.json().sourceRevision, 4);
    assert.deepEqual(await approvedConnectorFacts(pool, republished.json().releaseId), []);
    assert.equal((await ownerTest()).statusCode, 200);
    assert.equal(seenFacts.at(-1)?.filter(fact => fact.id.startsWith('field:')).length, 0);
    assert.equal((await app.inject({ method: 'POST', url: approvePath,
      headers: { cookie: owner.cookie }, payload: approval3 })).statusCode, 409);
    factsRevision = 3;
    factsHash = 'a'.repeat(64);
    const older = await app.inject({ method: 'POST', url: syncPath,
      headers: { cookie: owner.cookie } });
    assert.equal(older.statusCode, 200, older.body);
    assert.equal(older.json().outcome, 'ignored_older');
    factsRevision = 4;
    factsHash = 'c'.repeat(64);
    const conflict = await app.inject({ method: 'POST', url: syncPath,
      headers: { cookie: owner.cookie } });
    assert.equal(conflict.statusCode, 409, conflict.body);
    assert.equal(conflict.json().error, 'integrity_conflict');
    const conflictReplay = await app.inject({ method: 'POST', url: syncPath,
      headers: { cookie: owner.cookie } });
    assert.equal(conflictReplay.statusCode, 409);
    const sourceEvents = await pool.query<{ event_type: string }>(
      'select event_type from ap.outbox where aggregate_id = $1 order by occurred_at', [sourceId]);
    assert.equal(sourceEvents.rowCount, 9);
    assert.equal(sourceEvents.rows.filter(row => row.event_type === 'knowledge.source.approved').length, 1);
    assert.equal(sourceEvents.rows.filter(row => row.event_type === 'knowledge.source.integrity_conflict').length, 1);
    const source = await app.inject({ url: `/v1/connections/field/${fieldConnectionId}/source`,
      headers: { cookie: owner.cookie } });
    assert.equal(source.statusCode, 200, source.body);
    assert.equal((await app.inject({ url: `/v1/connections/field/${fieldConnectionId}/source`,
      headers: { cookie: outsider.cookie } })).statusCode, 404);
    assert.equal(source.json().state, 'integrity_conflict');
    assert.equal(source.json().sourceRevision, 4);
    assert.equal(source.json().contentHash, 'b'.repeat(64));
    assert.equal(source.json().approvedSourceRevision, 3);
    assert.equal((await app.inject({ method: 'POST', url: approvePath,
      headers: { cookie: owner.cookie }, payload: { expectedSourceRevision: 4,
        expectedContentHash: 'b'.repeat(64) } })).statusCode, 409);
    assert.doesNotMatch(source.body, /internalNote|contactPhone|not-for-connector/);
    assert.equal((await pool.query('select 1 from ap.knowledge_releases where organization_id = $1',
      [apOrganizationId])).rowCount, 7);
    await pool.query(`update "oauthClient" set scopes = scopes || '["ap.sources.refresh"]'::jsonb
      where "clientId" = $1`, [apClientId]);
    await pool.query(`update ap.oauth_selections set requested_scopes =
      array_append(requested_scopes,'ap.sources.refresh') where id = $1`, [apGrantId]);
    await pool.query(`update "oauthConsent" set scopes = scopes || '["ap.sources.refresh"]'::jsonb
      where "referenceId" = $1`, [apGrantId]);
    const delegatedToken = async (scopes: string[]) => {
      const token = randomBytes(32).toString('base64url');
      await pool.query(`insert into "oauthAccessToken"
        ("id","token","clientId","userId","referenceId","resources","scopes","expiresAt","createdAt")
        values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,now() + interval '10 minutes',now())`,
      [randomUUID(), createHash('sha256').update(token).digest('base64url'), apClientId,
        ownerSession.user.id, apGrantId, JSON.stringify([`${base}/integrations/v1`]),
        JSON.stringify(scopes)]);
      return { authorization: `Bearer ${token}` };
    };
    const readOnlyBearer = await delegatedToken(['ap.agent.read']);
    const refreshBearer = await delegatedToken(['ap.agent.read', 'ap.sources.refresh']);
    const sourceMetadata = await app.inject({
      url: `/integrations/v1/connections/${fieldConnectionId}/source`, headers: refreshBearer });
    assert.equal(sourceMetadata.statusCode, 200);
    assert.equal(sourceMetadata.json().sourceRevision, 4);
    assert.equal(sourceMetadata.json().state, 'integrity_conflict');
    assert.doesNotMatch(sourceMetadata.body, /internalNote|contactPhone|services|businessName/);
    const refreshPath = `/integrations/v1/connections/${fieldConnectionId}/source-refreshes`;
    const refreshKey = randomBytes(32).toString('base64url');
    assert.equal((await app.inject({ method: 'POST', url: refreshPath,
      payload: { expectedSourceRevision: 4 } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: refreshPath,
      headers: { ...readOnlyBearer, 'idempotency-key': refreshKey },
      payload: { expectedSourceRevision: 4 } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST',
      url: `/integrations/v1/connections/${randomUUID()}/source-refreshes`,
      headers: { ...refreshBearer, 'idempotency-key': refreshKey },
      payload: { expectedSourceRevision: 4 } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: refreshPath,
      headers: { ...refreshBearer, 'idempotency-key': refreshKey },
      payload: { expectedSourceRevision: 3 } })).statusCode, 409);
    const queuedRefresh = await app.inject({ method: 'POST', url: refreshPath,
      headers: { ...refreshBearer, 'idempotency-key': refreshKey },
      payload: { expectedSourceRevision: 4 } });
    assert.equal(queuedRefresh.statusCode, 202, queuedRefresh.body);
    assert.equal(queuedRefresh.json().state, 'pending');
    assert.match(queuedRefresh.json().operationId, /^[0-9a-f-]{36}$/);
    const replayedRefresh = await app.inject({ method: 'POST', url: refreshPath,
      headers: { ...refreshBearer, 'idempotency-key': refreshKey },
      payload: { expectedSourceRevision: 4 } });
    assert.equal(replayedRefresh.statusCode, 202);
    assert.equal(replayedRefresh.json().operationId, queuedRefresh.json().operationId);
    assert.equal((await app.inject({ method: 'POST', url: refreshPath,
      headers: { ...refreshBearer, 'idempotency-key': refreshKey },
      payload: { expectedSourceRevision: 5 } })).statusCode, 409);
    assert.equal((await app.inject({ url: `${refreshPath}/${queuedRefresh.json().operationId}`,
      headers: refreshBearer })).json().state, 'pending');
    const { processFieldSourceRefreshOnce } = await import('../src/source-refresh-worker.js');
    factsRevision = 5;
    factsHash = 'd'.repeat(64);
    factsUnavailable = true;
    assert.equal(await processFieldSourceRefreshOnce(runtime), 'retry');
    const pendingRetry = await app.inject({ url: `${refreshPath}/${queuedRefresh.json().operationId}`,
      headers: refreshBearer });
    assert.equal(pendingRetry.statusCode, 200);
    assert.equal(pendingRetry.json().state, 'retry');
    assert.equal((await pool.query<{ source_revision: number }>(
      'select source_revision from ap.knowledge_sources where id = $1', [sourceId])).rows[0]?.source_revision, 4);
    factsUnavailable = false;
    await pool.query('update ap.source_refresh_jobs set next_attempt_at = now() where id = $1',
      [queuedRefresh.json().operationId]);
    assert.equal(await processFieldSourceRefreshOnce(runtime), 'completed');
    const finishedRefresh = await app.inject({ url: `${refreshPath}/${queuedRefresh.json().operationId}`,
      headers: refreshBearer });
    assert.equal(finishedRefresh.statusCode, 200);
    assert.equal(finishedRefresh.json().state, 'completed');
    assert.equal(finishedRefresh.json().sourceRevision, 5);
    assert.equal((await pool.query<{ source_revision: number; approved_source_revision: number;
      state: string }>('select source_revision,approved_source_revision,state from ap.knowledge_sources where id = $1',
      [sourceId])).rows[0]?.state, 'pending_review');
    assert.equal((await pool.query<{ count: string }>(
      'select count(*)::text as count from ap.knowledge_releases where organization_id = $1',
      [apOrganizationId])).rows[0]?.count, '7');
    assert.equal(await processFieldSourceRefreshOnce(runtime), 'empty');
    const factsEventId = randomUUID();
    const factsReleaseId = randomUUID();
    const factsChanged = { spec_version: '1.0', event_id: factsEventId,
      event_type: 'field.facts.changed', source_product: 'field', connection_id: fieldConnectionId,
      aggregate_type: 'facts', aggregate_id: factsReleaseId, aggregate_version: 6,
      occurred_at: new Date().toISOString(), correlation_id: factsReleaseId,
      route_generation: 1, data: { resource_id: factsReleaseId, status: 'approved',
        source_revision: 6 } };
    const factsRaw = JSON.stringify(factsChanged);
    const factsHeaders = (raw: string, eventId = factsEventId,
      timestamp = String(Math.floor(Date.now() / 1000))) => ({
      'content-type': 'application/vnd.field-event+json', 'x-event-id': eventId,
      'x-key-id': eventKeyId, 'x-timestamp': timestamp, 'x-signature-version': '2',
      'x-signature': createHmac('sha256', Buffer.from(eventSecret, 'base64url'))
        .update(Buffer.concat([Buffer.from(`v2:field->ap.${timestamp}.${eventId}.`), Buffer.from(raw)]))
        .digest('hex'),
    });
    const factsEventPath = '/integrations/v1/field-events';
    assert.equal((await app.inject({ method: 'POST', url: factsEventPath,
      headers: factsHeaders(factsRaw, factsEventId, String(Math.floor(Date.now() / 1000) - 600)),
      payload: factsRaw })).statusCode, 401);
    const receivedFacts = await app.inject({ method: 'POST', url: factsEventPath,
      headers: factsHeaders(factsRaw), payload: factsRaw });
    assert.equal(receivedFacts.statusCode, 202, receivedFacts.body);
    assert.equal((await app.inject({ method: 'POST', url: factsEventPath,
      headers: factsHeaders(factsRaw), payload: factsRaw })).statusCode, 202);
    const changedFactsRaw = JSON.stringify({ ...factsChanged, aggregate_version: 7,
      data: { ...factsChanged.data,
      source_revision: 7 } });
    assert.equal((await app.inject({ method: 'POST', url: factsEventPath,
      headers: factsHeaders(changedFactsRaw), payload: changedFactsRaw })).statusCode, 409);
    const { processFieldFactsEventOnce } = await import('../src/field-facts-events.js');
    assert.equal(await processFieldFactsEventOnce(pool), 'scheduled');
    assert.equal(await processFieldFactsEventOnce(pool), 'empty');
    factsRevision = 6;
    factsHash = 'e'.repeat(64);
    assert.equal(await processFieldSourceRefreshOnce(runtime), 'completed');
    assert.equal((await pool.query<{ source_revision: number; approved_source_revision: number;
      state: string }>(`select source_revision,approved_source_revision,state
      from ap.knowledge_sources where id = $1`, [sourceId])).rows[0]?.source_revision, 6);
    assert.equal((await pool.query<{ count: string }>(
      'select count(*)::text as count from ap.knowledge_releases where organization_id = $1',
      [apOrganizationId])).rows[0]?.count, '7');
    const oldFactsEvent = { ...factsChanged, event_id: randomUUID(), aggregate_version: 5,
      data: { ...factsChanged.data, source_revision: 5 } };
    const oldFactsRaw = JSON.stringify(oldFactsEvent);
    assert.equal((await app.inject({ method: 'POST', url: factsEventPath,
      headers: factsHeaders(oldFactsRaw, oldFactsEvent.event_id),
      payload: oldFactsRaw })).statusCode, 202);
    assert.equal(await processFieldFactsEventOnce(pool), 'ignored');
    assert.equal(await processFieldSourceRefreshOnce(runtime), 'empty');
    const withdrawnEvent = { ...factsChanged, event_id: randomUUID(), aggregate_version: 7,
      data: { ...factsChanged.data, source_revision: 7 } };
    const withdrawnRaw = JSON.stringify(withdrawnEvent);
    await pool.query(`update ap.memberships set role = 'viewer'
      where organization_id = $1 and user_id = $2`, [apOrganizationId, ownerSession.user.id]);
    try {
      assert.equal((await app.inject({ method: 'POST', url: factsEventPath,
        headers: factsHeaders(withdrawnRaw, withdrawnEvent.event_id),
        payload: withdrawnRaw })).statusCode, 401);
    } finally {
      await pool.query(`update ap.memberships set role = 'owner'
        where organization_id = $1 and user_id = $2`, [apOrganizationId, ownerSession.user.id]);
    }
    factsRevision = 4;
    factsHash = 'b'.repeat(64);
    await pool.query("update ap.field_connections set access_expires_at = now() - interval '1 minute' where id = $1",
      [fieldConnectionId]);
    const beforeRotation = await pool.query<{ refresh_token_cipher: Buffer }>(
      'select refresh_token_cipher from ap.field_connections where id = $1', [fieldConnectionId]);
    // 동시에 만료 토큰을 확인해도 refresh token은 한 번만 사용한다(재사용 시 Field가 토큰 계열을 무효화함).
    // 첫 갱신 응답을 붙잡은 동안 임대가 잡혀 있고, 두 번째 요청은 refresh를 다시 부르지 않고 기다린다
    let releaseRefresh!: () => void;
    refreshGate = new Promise<void>(resolveGate => { releaseRefresh = resolveGate; });
    const refreshStarted = new Promise<void>(resolveStarted => { refreshEntered = resolveStarted; });
    const tokenCallsBeforeRotation = tokenCalls;
    const rotating = Promise.all([
      app.inject({ url: factsPath, headers: { cookie: owner.cookie } }),
      app.inject({ url: factsPath, headers: { cookie: owner.cookie } })]);
    await refreshStarted;
    await new Promise(resolveWait => setTimeout(resolveWait, 600));
    assert.equal(tokenCalls, tokenCallsBeforeRotation + 1, 'only one request may spend the refresh token');
    assert.ok((await pool.query<{ lease: Date | null }>('select token_refresh_lease_until as lease from ap.field_connections where id = $1',
      [fieldConnectionId])).rows[0]?.lease, 'refresh lease is held during the Field call');
    releaseRefresh();
    refreshGate = null; refreshEntered = null;
    const [rotated, concurrentRotation] = await rotating;
    assert.equal((await pool.query<{ lease: Date | null }>('select token_refresh_lease_until as lease from ap.field_connections where id = $1',
      [fieldConnectionId])).rows[0]?.lease, null, 'lease is cleared after the rotated token is saved');
    assert.equal(rotated.statusCode, 200, rotated.body);
    assert.equal(concurrentRotation.statusCode, 200, concurrentRotation.body);
    assert.equal(tokenCalls, 2);
    assert.ok(factsCalls >= 8);
    const afterRotation = await pool.query<{ refresh_token_cipher: Buffer; status: string }>(
      'select refresh_token_cipher, status from ap.field_connections where id = $1', [fieldConnectionId]);
    assert.notDeepEqual(afterRotation.rows[0]?.refresh_token_cipher,
      beforeRotation.rows[0]?.refresh_token_cipher);
    assert.equal(afterRotation.rows[0]?.status, 'review_required');
    wrongFactsOrganization = true;
    const wrongSource = await app.inject({ url: factsPath, headers: { cookie: owner.cookie } });
    assert.equal(wrongSource.statusCode, 502);
    assert.equal(wrongSource.json().error, 'invalid_field_facts');
    wrongFactsOrganization = false;
    await pool.query("update ap.field_connections set access_expires_at = now() - interval '1 minute' where id = $1",
      [fieldConnectionId]);
    refreshFails = true;
    const failed = await app.inject({ url: factsPath, headers: { cookie: owner.cookie } });
    assert.equal(failed.statusCode, 503, failed.body);
    assert.equal(failed.json().error, 'field_grant_refresh_unknown');
    assert.equal((await pool.query<{ status: string }>(
      'select status from ap.field_connections where id = $1', [fieldConnectionId])).rows[0]?.status,
    'degraded');
    // degraded 연결도 다시 확인할 수 있고, 거절이 계속되면 degraded로 남는다
    const degradedRetry = await app.inject({ url: factsPath, headers: { cookie: owner.cookie } });
    assert.equal(degradedRetry.statusCode, 503, degradedRetry.body);
    assert.equal(tokenCalls, 4);
    assert.equal((await pool.query<{ status: string }>(
      'select status from ap.field_connections where id = $1', [fieldConnectionId])).rows[0]?.status,
    'degraded');
    assert.equal((await app.inject({ url: `/v1/connections/field/${fieldConnectionId}/source`,
      headers: { cookie: owner.cookie } })).statusCode, 200);
    const revokePath = `/v1/connections/field/${fieldConnectionId}/revoke`;
    assert.equal((await app.inject({ method: 'POST', url: revokePath,
      headers: { cookie: outsider.cookie } })).statusCode, 404);
    refreshFails = false;
    // 재검증에 성공하면 degraded 연결이 review_required로 복구된다
    await pool.query(`update ap.field_connections set access_expires_at = now() + interval '10 minutes'
      where id = $1`, [fieldConnectionId]);
    const restored = await app.inject({ url: factsPath, headers: { cookie: owner.cookie } });
    assert.equal(restored.statusCode, 200, restored.body);
    assert.equal((await pool.query<{ status: string }>(
      'select status from ap.field_connections where id = $1', [fieldConnectionId])).rows[0]?.status,
    'review_required');
    await pool.query(`update ap.field_connections set status = 'review_required',
      access_expires_at = now() + interval '10 minutes' where id = $1`, [fieldConnectionId]);
    const raceRefresh = await app.inject({ method: 'POST', url: refreshPath,
      headers: { ...refreshBearer, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { expectedSourceRevision: 6 } });
    assert.equal(raceRefresh.statusCode, 202, raceRefresh.body);
    factsRevision = 7;
    factsHash = 'f'.repeat(64);
    let signalFactsStarted!: () => void;
    let releaseFacts!: () => void;
    const factsStarted = new Promise<void>(resolve => { signalFactsStarted = resolve; });
    const factsReleased = new Promise<void>(resolve => { releaseFacts = resolve; });
    waitForFacts = async () => { signalFactsStarted(); await factsReleased; };
    const processing = processFieldSourceRefreshOnce(runtime);
    await factsStarted;
    let revoked;
    try {
      revoked = await app.inject({ method: 'POST', url: revokePath,
        headers: { cookie: owner.cookie } });
    } finally {
      releaseFacts();
      waitForFacts = null;
    }
    assert.equal(await processing, 'blocked');
    assert.equal(revoked.statusCode, 200, revoked.body);
    assert.equal(revoked.json().localStatus, 'revoked');
    const clearedTokens=(await pool.query('select access_token_cipher,refresh_token_cipher from ap.field_connections where id=$1',[fieldConnectionId])).rows[0];
    assert.deepEqual(clearedTokens,{access_token_cipher:null,refresh_token_cipher:null});
    assert.equal(revoked.json().remoteState, 'pending');
    assert.equal((await pool.query<{ state: string }>(
      'select state from ap.source_refresh_jobs where id = $1',
      [raceRefresh.json().operationId])).rows[0]?.state, 'blocked');
    assert.equal((await pool.query<{ source_revision: number; state: string }>(
      'select source_revision,state from ap.knowledge_sources where id = $1',
      [sourceId])).rows[0]?.source_revision, 6);
    assert.equal((await pool.query<{ count: string }>(
      'select count(*)::text as count from ap.knowledge_source_snapshots where source_id = $1 and source_revision = 7',
      [sourceId])).rows[0]?.count, '0');
    assert.deepEqual(await approvedConnectorFacts(pool, republished.json().releaseId), []);
    assert.equal((await pool.query<{ state: string }>(
      'select state from ap.knowledge_sources where connection_id = $1',
      [fieldConnectionId])).rows[0]?.state, 'revoked');
    assert.equal((await pool.query<{ count: string }>(
      'select count(*)::text as count from ap.knowledge_releases where organization_id = $1',
      [apOrganizationId])).rows[0]?.count, '7');
    const revokedAgain = await app.inject({ method: 'POST', url: revokePath,
      headers: { cookie: owner.cookie } });
    assert.equal(revokedAgain.statusCode, 200);
    assert.equal(revokedAgain.json().revocationId, revoked.json().revocationId);
    // 전환 기간 발신 버전 1: 버전 헤더 없이 v1 원문으로 서명한다(이번 시도는 Field 장애로 재시도)
    process.env.AP_EVENT_SIGNATURE_SEND_VERSION = '1';
    try {
      const firstRevoke = await deliverFieldConnectionRevokeOnce(pool, runtime.fieldConnector);
      assert.ifError(revokeStubError);
      assert.equal(firstRevoke, 'retry');
    } finally { delete process.env.AP_EVENT_SIGNATURE_SEND_VERSION; }
    assert.equal(revokeCalls, 1);
    assert.deepEqual(revokeSignatures, [{ version: null, valid: true }]);
    await pool.query(`update ap.field_remote_revocations set next_attempt_at = now()
      where connection_id = $1`, [fieldConnectionId]);
    remoteRevokeDown = false;
    // 기본 발신 버전 2: X-Signature-Version: 2와 방향 접두사 원문으로 서명한다
    const retriedRevoke = await deliverFieldConnectionRevokeOnce(pool, runtime.fieldConnector);
    assert.ifError(revokeStubError);
    assert.equal(retriedRevoke, 'acked');
    assert.equal(revokeCalls, 2);
    assert.deepEqual(revokeSignatures, [{ version: null, valid: true }, { version: '2', valid: true }]);
    assert.equal(sentRevocationId, revoked.json().revocationId);
    assert.equal(await deliverFieldConnectionRevokeOnce(pool, runtime.fieldConnector), 'empty');
  } finally {
    await Promise.all([app.close(), standalone.close()]);
  }
});
