import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createAgentApp } from '../src/app.js';
import { dispatchAi, reserveAi } from '../src/ai-entitlement.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
if (!/^\/fieldai_agent_(?:test|target)_[a-f0-9]+$/.test(new URL(process.env.AP_DATABASE_URL ?? '').pathname))
  throw new Error('AP consultation test requires an isolated database for retained AI usage');
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4311';
test('AP link submission uses approved service index when two names match', async () => {
  const email = `consult-index-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const authPost = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic owner' }),
  }));
  assert.equal((await authPost('/sign-up/email')).status, 200);
  const signedIn = await authPost('/sign-in/email');
  const ownerCookie = signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool, resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: ownerCookie }, payload: { name: '동명 상담 서비스' } });
    assert.equal(organization.statusCode, 201);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft',
      headers: { cookie: ownerCookie }, payload: { expectedRevision: 0, businessName: '동명 상담 서비스',
        introduction: '', services: [{ name: '상담', description: '방문' },
          { name: '상담', description: '전화' }], faqs: [] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases',
      headers: { cookie: ownerCookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/agents/draft', headers: { cookie: ownerCookie },
      payload: { expectedRevision: 0, name: '상담 AI', tone: 'clear', guideScope: '', handoffText: '담당자가 답변합니다.' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/releases', headers: { cookie: ownerCookie },
      payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } })).statusCode, 201);
    const deployment = await app.inject({ method: 'POST', url: '/v1/deployments',
      headers: { cookie: ownerCookie }, payload: { kind: 'link' } });
    assert.equal(deployment.statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${deployment.json().id}/activate`,
      headers: { cookie: ownerCookie } })).statusCode, 200);
    const engagement = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${deployment.json().publicId}/engagements` });
    assert.equal(engagement.statusCode, 201);
    const cookie = engagement.headers['set-cookie']?.toString().split(';')[0];
    const body = { serviceName: '상담', serviceIndex: 1, knowledgeRevision: 1,
      name: '고객', phone: '010-1111-2222', message: '전화 상담', consent: true };
    const submitted = await app.inject({ method: 'POST', url: `/v1/conversations/${engagement.json().id}/submissions`,
      headers: { cookie }, payload: body });
    assert.equal(submitted.statusCode, 201, submitted.body);
    const snapshot = await pool.query<{ service_snapshot: { description: string } }>(
      'select service_snapshot from ap.inquiries where id = $1', [engagement.json().id]);
    assert.equal(snapshot.rows[0]?.service_snapshot.description, '전화');
  } finally { await app.close(); }
});
function seal(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]);
}

test('AP link keeps anonymous AI guidance and consented human followup in one conversation', async () => {
  const oldFieldPreflightLimit = process.env.AP_FIELD_PREFLIGHT_ORG_LIMIT;
  const email = `consult-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const authPost = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic owner' }),
  }));
  assert.equal((await authPost('/sign-up/email')).status, 200);
  const signedIn = await authPost('/sign-in/email');
  const ownerCookie = signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const seen: { question: string; facts: { id: string; text: string }[];
    history?: { role: 'customer' | 'assistant'; text: string }[] }[] = [];
  let invalidUsage = false;
  let waitForModel: Promise<void> | null = null;
  let modelEntered: (() => void) | null = null;
  const modelProvider = {
    model: 'synthetic-consult-model',
    generate: async (request: { question: string; facts: { id: string; text: string }[];
      history?: { role: 'customer' | 'assistant'; text: string }[] }) => {
      seen.push({ question: request.question, facts: request.facts, history: request.history });
      modelEntered?.();
      if (waitForModel) await waitForModel;
      return { output: { answer: '상담 서비스를 안내합니다.', evidenceIds: ['service:0'],
        unknowns: [], handoffRecommended: false }, inputTokens: invalidUsage ? -1 : 32, outputTokens: 12,
      responseId: `synthetic-${seen.length}` };
    },
  };
  const objects = new Map<string, Buffer>();
  const fieldTokenKey = randomBytes(32);
  const fieldGrantId = randomUUID();
  const fieldOrganizationId = randomUUID();
  const fieldServiceId = randomUUID();
  let fieldMeUnavailable = false;
  let fieldFactsUnavailable = false;
  let fieldServicesEmpty = false;
  let fieldRequestScopeMissing = false;
  let fieldProbeCalls = 0;
  const fieldFetcher: typeof fetch = async (input, init) => {
    fieldProbeCalls += 1;
    const url = new URL(String(input));
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer synthetic-access');
    if (url.pathname === '/integrations/v1/me') return fieldMeUnavailable
      ? Response.json({ error: 'temporarily_unavailable' }, { status: 503 })
      : Response.json({ grantId: fieldGrantId, organizationId: fieldOrganizationId,
        state: 'active', scopes: ['field.facts.read', 'field.availability.read',
          ...(!fieldRequestScopeMissing ? ['field.requests.create'] : [])] });
    if (url.pathname === '/integrations/v1/facts') return fieldFactsUnavailable
      ? Response.json({ error: 'temporarily_unavailable' }, { status: 503 })
      : Response.json({ organizationId: fieldOrganizationId, releaseId: randomUUID(),
        revision: 1, contentHash: 'a'.repeat(64), publishedAt: new Date().toISOString(),
        businessName: 'Field 검수 사업장', introduction: '', region: '', openingHours: '',
        services: fieldServicesEmpty ? [] : [{ id: fieldServiceId, name: '방문 상담',
          description: '상담 설명', bookingMode: 'request', durationMinutes: 30, priceAmount: null }] });
    throw new Error(`Unexpected synthetic Field request ${url.pathname}`);
  };
  const runtime = { pool, resolveUserId: async (headers: IncomingHttpHeaders) =>
    (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    fieldConnector: { issuer: 'http://127.0.0.1:4321/api/auth', clientId: 'consult-test-field-client',
      clientSecret: 'consult-test-secret', tokenKey: fieldTokenKey,
      redirectUri: `${base}/v1/connections/field/callback`, webOrigin: 'http://localhost:3001',
      fetcher: fieldFetcher },
    inquiryMedia: { put: async (key: string, data: Buffer) => { objects.set(key, data); },
      get: async (key: string) => objects.get(key) ?? null,
      delete: async (key: string) => { objects.delete(key); } } };
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined,
    { ...runtime, modelProvider, customerDailyLimit: 20, testDailyLimit: 1 });
  const disconnected = createAgentApp(async () => undefined, auth.handler, base, undefined, runtime);
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie: ownerCookie }, payload: { name: 'AP 상담 검수' } });
    assert.equal(organization.statusCode, 201);
    const organizationId = organization.json().id as string;
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: { cookie: ownerCookie }, payload: {
      expectedRevision: 0, businessName: 'AP 상담 검수', introduction: '사람 상담도 가능합니다.',
      region: '승인된 AP 지역', openingHours: '평일 09:00–18:00',
      services: [{ name: '상담 서비스', description: '예약 가능 시간은 담당자가 확인합니다.' }], faqs: [],
    } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: ownerCookie },
      payload: { expectedRevision: 1 } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/agents/draft', headers: { cookie: ownerCookie }, payload: {
      expectedRevision: 0, name: '상담 AI', tone: 'clear', guideScope: '승인된 사업 정보', handoffText: '담당자가 답변합니다.',
    } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/releases', headers: { cookie: ownerCookie },
      payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'PATCH', url: '/v1/knowledge/draft', headers: { cookie: ownerCookie },
      payload: { expectedRevision: 1, region: '미승인 비공개 지역', openingHours: '미승인 비공개 시간' } })).statusCode, 200);
    const link = await app.inject({ method: 'POST', url: '/v1/deployments', headers: { cookie: ownerCookie }, payload: { kind: 'link' } });
    assert.equal(link.statusCode, 201);
    const publicId = link.json().publicId as string;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${link.json().id}/activate`, headers: { cookie: ownerCookie } })).statusCode, 200);
    const emptyCurrent = await app.inject({ url: `/v1/public/deployments/${publicId}/engagements/current` });
    assert.equal(emptyCurrent.statusCode, 200);
    assert.deepEqual(emptyCurrent.json(), { engagement: null });
    const started = await app.inject({ method: 'POST', url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(started.statusCode, 201);
    const id = started.json().id as string;
    const cookie = started.headers['set-cookie']?.toString().split(';')[0];
    assert.ok(cookie?.startsWith('ap_consult_session='));
    assert.match(started.headers['set-cookie']?.toString() ?? '', /HttpOnly/);
    assert.equal((await app.inject({ url: `/v1/engagements/${id}/field-readiness` })).statusCode, 401);
    const noConnection = await app.inject({ url: `/v1/engagements/${id}/field-readiness`, headers: { cookie } });
    assert.equal(noConnection.statusCode, 200, noConnection.body);
    assert.deepEqual(noConnection.json(), { ready: false, reason: 'no_connection' });
    assert.equal((await pool.query<{ count: string }>(
      'select count(*)::text as count from ap.field_preflight_organization_windows where organization_id = $1',
      [organizationId])).rows[0]?.count, '0');
    const blockedDirect = await app.inject({ method: 'POST', url: `/v1/conversations/${id}/submissions`,
      headers: { cookie }, payload: { name: '보관 금지 고객', phone: '010-8888-9999',
        message: '연결 없는 직접 요청', consent: true, destination: 'field' } });
    assert.equal(blockedDirect.statusCode, 409, blockedDirect.body);
    assert.equal(blockedDirect.json().error, 'field_connection_unavailable');
    assert.deepEqual((await pool.query<{ customer_name: string | null; customer_phone: string | null; state: string }>(
      'select customer_name, customer_phone, state from ap.inquiries where id = $1', [id])).rows[0],
    { customer_name: null, customer_phone: null, state: 'ai_assisting' });
    const beforeSubmission = await app.inject({ url: '/v1/owner/inquiries', headers: { cookie: ownerCookie } });
    assert.ok(!beforeSubmission.json().inquiries.some((item: { id: string }) => item.id === id));
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${id}`,
      headers: { cookie: ownerCookie } })).statusCode, 404);
    assert.deepEqual((await app.inject({ url: '/v1/owner/notifications', headers: { cookie: ownerCookie } })).json().notifications, []);
    assert.equal((await app.inject({ url: `/v1/engagements/${id}` })).statusCode, 401);
    const answer = await app.inject({ method: 'POST', url: `/v1/engagements/${id}/messages`, headers: { cookie },
      payload: { question: '어떤 서비스를 제공하나요?' } });
    assert.equal(answer.statusCode, 200);
    assert.equal(answer.json().answer, '상담 서비스를 안내합니다.');
    assert.deepEqual(answer.json().evidenceIds, ['service:0']);
    assert.equal(seen.length, 1);
    assert.ok(seen[0]?.facts.some(fact => fact.id === 'service:0'));
    assert.ok(seen[0]?.facts.some(fact => fact.id === 'region' && fact.text === '활동 지역: 승인된 AP 지역'));
    assert.ok(seen[0]?.facts.some(fact => fact.id === 'opening_hours' && fact.text === '영업시간: 평일 09:00–18:00'));
    assert.ok(!seen[0]?.facts.some(fact => fact.text.includes('미승인 비공개')));
    const ownerSession = await auth.api.getSession({ headers: new Headers({ cookie: ownerCookie }) });
    assert.ok(ownerSession);
    const registered = await auth.handler(new Request(`${base}/api/auth/oauth2/create-client`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: ownerCookie },
      body: JSON.stringify({ client_name: 'Consultation Field path test',
        redirect_uris: ['http://127.0.0.1:4399/callback'], application_type: 'native',
        token_endpoint_auth_method: 'client_secret_basic', grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'], scope: 'openid offline_access ap.agent.read ap.conversations.read' }),
    }));
    assert.equal(registered.status, 201, await registered.clone().text());
    const clientId = (await registered.json() as { client_id: string }).client_id;
    const apGrantId = randomUUID();
    const agentId = (await pool.query<{ agent_id: string }>(
      'select agent_id from ap.agent_releases where id = (select agent_release_id from ap.deployments where id = $1)',
      [link.json().id])).rows[0]?.agent_id;
    assert.ok(agentId);
    await pool.query(`insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,
      organization_id,agent_id,allowed_deployment_ids,requested_scopes,selection_expires_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,now() + interval '5 minutes')`,
    [apGrantId, ownerSession.session.id, ownerSession.user.id, clientId,
      organizationId, agentId, [link.json().id], ['ap.agent.read', 'ap.conversations.read']]);
    await pool.query(`insert into "oauthConsent"("id","clientId","userId","referenceId","resources",
      "scopes","createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,now(),now())`,
    [randomUUID(), clientId, ownerSession.user.id, apGrantId,
      JSON.stringify([`${base}/integrations/v1`]),
      JSON.stringify(['offline_access', 'ap.agent.read', 'ap.conversations.read'])]);
    await pool.query(`insert into "oauthRefreshToken"("id","token","clientId","userId","referenceId",
      "resources","scopes","expiresAt","createdAt")
      values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,now() + interval '1 hour',now())`,
    [randomUUID(), randomBytes(32).toString('base64url'), clientId, ownerSession.user.id,
      apGrantId, JSON.stringify([`${base}/integrations/v1`]),
      JSON.stringify(['offline_access', 'ap.agent.read', 'ap.conversations.read'])]);
    const syntheticConnectionId = randomUUID();
    await pool.query(`insert into ap.field_connections(id,ap_grant_id,ap_organization_id,ap_agent_id,
      initiator_user_id,field_issuer,field_client_id,field_grant_id,field_organization_id,
      scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now() + interval '1 hour','review_required')`,
    [syntheticConnectionId, apGrantId, organizationId, agentId, ownerSession.user.id,
      runtime.fieldConnector.issuer, runtime.fieldConnector.clientId, fieldGrantId, fieldOrganizationId,
      ['field.facts.read', 'field.availability.read', 'field.requests.create'],
      seal('synthetic-access', fieldTokenKey), seal('synthetic-refresh', fieldTokenKey)]);
    const ownerTest = await app.inject({ method: 'POST', url: '/v1/agents/test', headers: { cookie: ownerCookie },
      payload: { question: '사업자 테스트는 별도 한도인가요?' } });
    assert.equal(ownerTest.statusCode, 200);
    const anonymous = await app.inject({ url: `/v1/engagements/${id}`, headers: { cookie } });
    assert.deepEqual(anonymous.json().messages.map((message: { actor: string; sequence: string }) => [message.actor, Number(message.sequence)]),
      [['customer', 1], ['assistant', 2]]);
    const external = await app.inject({ method: 'POST', url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(external.statusCode, 201);
    const externalId = external.json().id as string;
    const externalCookie = external.headers['set-cookie']?.toString().split(';')[0];
    const readyPath = await app.inject({ url: `/v1/engagements/${externalId}/field-readiness`,
      headers: { cookie: externalCookie } });
    assert.equal(readyPath.statusCode, 200, readyPath.body);
    assert.deepEqual(readyPath.json(), { ready: true });
    assert.equal((await app.inject({ method: 'POST', url: `/v1/engagements/${externalId}/messages`,
      headers: { cookie: externalCookie }, payload: { question: 'Field에 직접 문의할 수 있나요?' } })).statusCode, 200);
    const externalHeaders = { cookie: externalCookie,
      'idempotency-key': randomBytes(32).toString('base64url'),
      'x-receipt-key': randomBytes(32).toString('base64url') };
    const externalBody = { name: '직접 요청 고객', phone: '010-2345-6789',
      message: 'Field 현재 조건을 확인한 뒤 요청합니다.', consent: true, destination: 'field' };
    async function blockedByField(reason: string, statusCode: number, error: string) {
      const readiness = await app.inject({ url: `/v1/engagements/${externalId}/field-readiness`,
        headers: { cookie: externalCookie } });
      assert.equal(readiness.statusCode, 200, readiness.body);
      assert.deepEqual(readiness.json(), { ready: false, reason });
      const prepared = await app.inject({ method: 'POST',
        url: `/v1/conversations/${externalId}/submissions`, headers: externalHeaders,
        payload: externalBody });
      assert.equal(prepared.statusCode, statusCode, prepared.body);
      assert.equal(prepared.json().error, error);
      const saved = (await pool.query<{ customer_name: string | null;
        customer_phone: string | null; state: string }>(
        'select customer_name,customer_phone,state from ap.inquiries where id = $1',
        [externalId])).rows[0];
      assert.deepEqual(saved, { customer_name: null, customer_phone: null, state: 'ai_assisting' });
    }
    fieldMeUnavailable = true;
    await blockedByField('field_unavailable', 503, 'field_unavailable');
    assert.equal((await pool.query<{ status: string }>(
      'select status from ap.field_connections where id = $1', [syntheticConnectionId])).rows[0]?.status,
    'review_required');
    fieldMeUnavailable = false;
    fieldFactsUnavailable = true;
    await blockedByField('field_unavailable', 503, 'field_unavailable');
    fieldFactsUnavailable = false;
    fieldServicesEmpty = true;
    await blockedByField('no_services', 409, 'field_services_unavailable');
    fieldServicesEmpty = false;
    fieldRequestScopeMissing = true;
    await blockedByField('field_unavailable', 503, 'field_unavailable');
    fieldRequestScopeMissing = false;
    assert.deepEqual((await app.inject({ url: `/v1/engagements/${externalId}/field-readiness`,
      headers: { cookie: externalCookie } })).json(), { ready: true });
    assert.equal((await app.inject({ method: 'POST', url: `/v1/conversations/${externalId}/submissions`,
      headers: externalHeaders, payload: { ...externalBody, consent: false } })).statusCode, 400);
    const externalPrepared = await app.inject({ method: 'POST', url: `/v1/conversations/${externalId}/submissions`,
      headers: externalHeaders, payload: externalBody });
    assert.equal(externalPrepared.statusCode, 201, externalPrepared.body);
    assert.equal(externalPrepared.json().state, 'external_ready');
    assert.equal(externalPrepared.json().delivery, 'not_applicable');
    assert.equal((await app.inject({ method: 'POST', url: `/v1/conversations/${externalId}/submissions`,
      headers: externalHeaders, payload: externalBody })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/conversations/${externalId}/submissions/recover`,
      headers: externalHeaders })).json().state, 'external_ready');
    assert.equal((await app.inject({ url: `/v1/engagements/${externalId}`, headers: { cookie: externalCookie } })).statusCode, 401);
    const externalOpened = await app.inject({ url: `/v1/inquiries/${externalId}`,
      headers: { authorization: `Bearer ${externalPrepared.json().receiptKey}` } });
    assert.equal(externalOpened.statusCode, 200);
    assert.deepEqual(externalOpened.json().messages.map((item: { actor: string }) => item.actor),
      ['customer', 'assistant', 'customer']);
    assert.equal((await pool.query<{ count: string }>(
      'select count(*)::text as count from ap.outbox where aggregate_id = $1', [externalId])).rows[0]?.count, '0');
    assert.ok(!(await app.inject({ url: '/v1/owner/inquiries', headers: { cookie: ownerCookie } })).json()
      .inquiries.some((item: { id: string }) => item.id === externalId));
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${externalId}`,
      headers: { cookie: ownerCookie } })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${externalId}/export`,
      headers: { cookie: ownerCookie } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${externalId}/replies`,
      headers: { cookie: ownerCookie }, payload: { body: '아직 사람 문의가 아닙니다.' } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/conversations/${id}/submissions`,
      payload: { name: '비회원', phone: '010-1234-5678', consent: true, message: '담당자 연락 부탁드립니다.' } })).statusCode, 401);
    const submissionKey = randomBytes(32).toString('base64url');
    const submittedReceipt = randomBytes(32).toString('base64url');
    const submissionHeaders = { 'idempotency-key': submissionKey, 'x-receipt-key': submittedReceipt };
    const submissionBody = { name: '비회원', phone: '010-1234-5678', consent: true, message: '담당자 연락 부탁드립니다.' };
    const submitted = await app.inject({ method: 'POST', url: `/v1/conversations/${id}/submissions`,
      headers: { cookie, ...submissionHeaders }, payload: submissionBody });
    assert.equal(submitted.statusCode, 201);
    assert.equal(submitted.json().id, id);
    const submissionReplay = await app.inject({ method: 'POST', url: `/v1/conversations/${id}/submissions`,
      headers: submissionHeaders, payload: submissionBody });
    assert.equal(submissionReplay.statusCode, 200);
    assert.equal(submissionReplay.json().id, id);
    assert.equal(submissionReplay.json().receiptKey, submittedReceipt);
    const recoveredSubmission = await app.inject({ url: `/v1/conversations/${id}/submissions/recover`,
      headers: submissionHeaders });
    assert.equal(recoveredSubmission.statusCode, 200);
    assert.equal(recoveredSubmission.json().id, id);
    assert.equal(recoveredSubmission.json().receiptKey, submittedReceipt);
    assert.equal((await app.inject({ url: `/v1/conversations/${id}/submissions/recover`,
      headers: { ...submissionHeaders, origin: 'https://foreign.example.invalid' } })).statusCode, 403);
    assert.equal((await app.inject({ url: `/v1/conversations/${randomUUID()}/submissions/recover`,
      headers: submissionHeaders })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/conversations/${id}/submissions/recover`,
      headers: { ...submissionHeaders, 'x-receipt-key': randomBytes(32).toString('base64url') } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/conversations/${id}/submissions`,
      headers: submissionHeaders, payload: { ...submissionBody, message: '다른 내용' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/conversations/${id}/submissions`,
      headers: { ...submissionHeaders, 'x-receipt-key': randomBytes(32).toString('base64url') }, payload: submissionBody })).statusCode, 409);
    assert.deepEqual((await app.inject({ url: '/v1/owner/notifications', headers: { cookie: ownerCookie } })).json()
      .notifications.map((item: { inquiryId: string; eventType: string }) => [item.inquiryId, item.eventType]),
    [[id, 'ap.inquiry.created']]);
    const externalPhoto = await sharp({ create: { width: 6, height: 5, channels: 3,
      background: '#607080' } }).png().toBuffer();
    const externalPhotoHeaders = { authorization: `Bearer ${externalPrepared.json().receiptKey}`,
      'content-type': 'application/octet-stream' };
    const externalAiMessageId = externalOpened.json().messages[0].id as string;
    const externalSummaryMessageId = externalOpened.json().messages[2].id as string;
    assert.equal((await app.inject({ method: 'POST',
      url: `/v1/inquiries/${externalId}/messages/${externalAiMessageId}/attachments`,
      headers: externalPhotoHeaders, payload: externalPhoto })).statusCode, 401);
    const externalPhotoSaved = await app.inject({ method: 'POST',
      url: `/v1/inquiries/${externalId}/messages/${externalSummaryMessageId}/attachments`,
      headers: externalPhotoHeaders, payload: externalPhoto });
    assert.equal(externalPhotoSaved.statusCode, 201, externalPhotoSaved.body);
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${externalId}/attachments/${externalPhotoSaved.json().id}`,
      headers: { cookie: ownerCookie } })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/inquiries/${externalId}/attachments/${externalPhotoSaved.json().id}`,
      headers: { authorization: `Bearer ${externalPrepared.json().receiptKey}` } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST',
      url: `/v1/inquiries/${externalId}/messages/${externalSummaryMessageId}/attachments`,
      headers: externalPhotoHeaders, payload: externalPhoto })).statusCode, 200);
    assert.deepEqual((await app.inject({ url: `/v1/inquiries/${externalId}`,
      headers: externalPhotoHeaders })).json().attachments
      .map((item: { messageId: string }) => item.messageId), [externalSummaryMessageId]);
    const externalHuman = await app.inject({ method: 'POST', url: `/v1/inquiries/${externalId}/messages`,
      headers: { authorization: `Bearer ${externalPrepared.json().receiptKey}` },
      payload: { body: 'Field 연결이 없으면 사람에게 답변 부탁드립니다.' } });
    assert.equal(externalHuman.statusCode, 201);
    assert.equal(externalHuman.json().state, 'needs_owner');
    assert.ok((await app.inject({ url: '/v1/owner/inquiries', headers: { cookie: ownerCookie } })).json()
      .inquiries.some((item: { id: string }) => item.id === externalId));
    const receiptKey = submitted.json().receiptKey as string;
    assert.match(receiptKey, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await app.inject({ url: `/v1/engagements/${id}`, headers: { cookie } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/engagements/${id}/messages`, headers: { cookie },
      payload: { question: '한 번 더' } })).statusCode, 401);
    const ownerList = await app.inject({ url: '/v1/owner/inquiries', headers: { cookie: ownerCookie } });
    const ownerItem = ownerList.json().inquiries.find((item: { id: string }) => item.id === id) as {
      id: string; source_kind: string; has_ai_history: boolean } | undefined;
    assert.deepEqual(ownerItem && [ownerItem.source_kind, ownerItem.has_ai_history], ['link', true]);
    const ownerTranscript = await app.inject({ url: `/v1/owner/inquiries/${id}`,
      headers: { cookie: ownerCookie } });
    assert.equal(ownerTranscript.statusCode, 200);
    assert.equal(ownerTranscript.json().sourceKind, 'link');
    assert.deepEqual(ownerTranscript.json().messages.map((item: { actor: string }) => item.actor),
      ['customer', 'assistant', 'customer']);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${id}/replies`, headers: { cookie: ownerCookie },
      payload: { body: '담당자 답변입니다.' } })).statusCode, 201);
    const receipt = await app.inject({ url: `/v1/inquiries/${id}`, headers: { authorization: `Bearer ${receiptKey}` } });
    assert.equal(receipt.statusCode, 200);
    assert.deepEqual(receipt.json().messages.map((message: { actor: string; sequence: string }) => [message.actor, Number(message.sequence)]),
      [['customer', 1], ['assistant', 2], ['customer', 3], ['owner', 4]]);
    const customerPhoto = await sharp({ create: { width: 5, height: 4, channels: 3, background: '#407090' } }).jpeg().toBuffer();
    const aiQuestionId = receipt.json().messages[0].id as string;
    const submittedMessageId = receipt.json().messages[2].id as string;
    const photoHeaders = { authorization: `Bearer ${receiptKey}`, 'content-type': 'application/octet-stream' };
    assert.equal((await app.inject({ method: 'POST', url: `/v1/inquiries/${id}/messages/${aiQuestionId}/attachments`,
      headers: photoHeaders, payload: customerPhoto })).statusCode, 401);
    const addedPhoto = await app.inject({ method: 'POST',
      url: `/v1/inquiries/${id}/messages/${submittedMessageId}/attachments`,
      headers: photoHeaders, payload: customerPhoto });
    assert.equal(addedPhoto.statusCode, 201);
    assert.equal(objects.size, 2);
    const attached = await app.inject({ url: `/v1/inquiries/${id}`, headers: { authorization: `Bearer ${receiptKey}` } });
    assert.deepEqual(attached.json().attachments.map((item: { messageId: string }) => item.messageId), [submittedMessageId]);
    assert.equal(seen.length, 3);
    assert.ok(!seen[0]?.facts.some(fact => fact.text.includes('사진')));
    const counts = await pool.query<{ run_count: string; inquiry_count: string }>(
      `select (select count(*) from ap.ai_runs where organization_id = $1 and kind = 'customer_message') as run_count,
        (select count(*) from ap.inquiries where organization_id = $1) as inquiry_count`, [organizationId]);
    assert.equal(Number(counts.rows[0]?.run_count), 2);
    assert.equal(Number(counts.rows[0]?.inquiry_count), 2);
    const submittedEvents = await pool.query<{ count: string }>(
      "select count(*)::text as count from ap.outbox where aggregate_id = $1 and event_type = 'ap.inquiry.created'", [id]);
    assert.equal(submittedEvents.rows[0]?.count, '1');
    for (let index = 0; index < 4; index += 1) {
      assert.equal((await app.inject({ method: 'POST',
        url: `/v1/public/organizations/${organizationId}/inquiries`,
        payload: { name: '동일 연락처', phone: submissionBody.phone,
          message: `별도 직접 문의 ${index}`, consent: true } })).statusCode, 201);
    }
    const rateEngagement = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(rateEngagement.statusCode, 201);
    const rateId = rateEngagement.json().id as string;
    const rateCookie = rateEngagement.headers['set-cookie']?.toString().split(';')[0];
    const rateBlocked = await app.inject({ method: 'POST',
      url: `/v1/conversations/${rateId}/submissions`, headers: { cookie: rateCookie },
      payload: { ...submissionBody, phone: '01012345678', message: '여섯 번째 사람 접수' } });
    assert.equal(rateBlocked.statusCode, 429);
    assert.equal(rateBlocked.json().error, 'submission_rate_limited');
    assert.equal((await pool.query<{ count: string }>(
      'select count(*) from ap.inquiries where id = $1 and consent_at is not null', [rateId])).rows[0]?.count, '0');
    assert.equal((await app.inject({ method: 'POST', url: `/v1/conversations/${id}/submissions`,
      headers: submissionHeaders, payload: submissionBody })).statusCode, 200);
    const contextual = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(contextual.statusCode, 201);
    const contextualId = contextual.json().id as string;
    const contextualCookie = contextual.headers['set-cookie']?.toString().split(';')[0];
    const firstContext = await app.inject({ method: 'POST',
      url: `/v1/engagements/${contextualId}/messages`, headers: { cookie: contextualCookie },
      payload: { question: '상담 서비스가 무엇인가요?' } });
    assert.equal(firstContext.statusCode, 200, firstContext.body);
    assert.deepEqual(seen[3]?.history, []);
    const secondContext = await app.inject({ method: 'POST',
      url: `/v1/engagements/${contextualId}/messages`, headers: { cookie: contextualCookie },
      payload: { question: '그 서비스는 예약이 되나요?' } });
    assert.equal(secondContext.statusCode, 200, secondContext.body);
    assert.deepEqual(seen[4]?.history, [
      { role: 'customer', text: '상담 서비스가 무엇인가요?' },
      { role: 'assistant', text: '상담 서비스를 안내합니다.' },
    ]);
    const retrySession = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(retrySession.statusCode, 201);
    const retryId = retrySession.json().id as string;
    const retryCookie = retrySession.headers['set-cookie']?.toString().split(';')[0];
    const retryKey = randomBytes(32).toString('base64url');
    const retryHeaders = { cookie: retryCookie, 'idempotency-key': retryKey };
    const retryQuestion = { question: '응답을 잃은 상담 질문입니다' };
    assert.equal((await app.inject({ url: `/v1/engagements/${retryId}/messages/recover`,
      headers: retryHeaders })).statusCode, 404);
    const seenBeforeRetry = seen.length;
    const acceptedRetry = await app.inject({ method: 'POST', url: `/v1/engagements/${retryId}/messages`,
      headers: retryHeaders, payload: retryQuestion });
    assert.equal(acceptedRetry.statusCode, 200);
    const completedRecovery = await app.inject({ url: `/v1/engagements/${retryId}/messages/recover`,
      headers: retryHeaders });
    assert.equal(completedRecovery.statusCode, 200);
    assert.equal(completedRecovery.json().state, 'completed');
    assert.equal(completedRecovery.json().answer, acceptedRetry.json().answer);
    const replayed = await app.inject({ method: 'POST', url: `/v1/engagements/${retryId}/messages`,
      headers: retryHeaders, payload: retryQuestion });
    assert.equal(replayed.statusCode, 200);
    assert.equal(replayed.json().runId, acceptedRetry.json().runId);
    assert.equal(seen.length, seenBeforeRetry + 1);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/engagements/${retryId}/messages`,
      headers: retryHeaders, payload: { question: '같은 키의 다른 질문' } })).statusCode, 409);
    assert.equal((await app.inject({ url: `/v1/engagements/${retryId}/messages/recover`,
      headers: { 'idempotency-key': retryKey } })).statusCode, 401);
    const retryRows = await pool.query<{ runs: string; messages: string }>(
      `select (select count(*)::text from ap.ai_runs where inquiry_id = $1) as runs,
         (select count(*)::text from ap.inquiry_messages where inquiry_id = $1) as messages`, [retryId]);
    assert.deepEqual(retryRows.rows[0], { runs: '1', messages: '2' });
    const waitingSession = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(waitingSession.statusCode, 201);
    const waitingId = waitingSession.json().id as string;
    const waitingHeaders = { cookie: waitingSession.headers['set-cookie']?.toString().split(';')[0],
      'idempotency-key': randomBytes(32).toString('base64url') };
    let finishWaitingModel: () => void = () => undefined;
    waitForModel = new Promise<void>(resolve => { finishWaitingModel = resolve; });
    const waitingEntered = new Promise<void>(resolve => { modelEntered = resolve; });
    const waitingFirst = app.inject({ method: 'POST', url: `/v1/engagements/${waitingId}/messages`,
      headers: waitingHeaders, payload: { question: '진행 중인 질문' } });
    await waitingEntered;
    let waitingResult: Awaited<typeof waitingFirst> | null = null;
    try {
      const waitingRecovery = await app.inject({ url: `/v1/engagements/${waitingId}/messages/recover`,
        headers: waitingHeaders });
      assert.equal(waitingRecovery.statusCode, 200);
      assert.equal(waitingRecovery.json().state, 'in_progress');
      assert.equal(waitingRecovery.headers['retry-after'], '2');
      const waitingReplay = await app.inject({ method: 'POST',
        url: `/v1/engagements/${waitingId}/messages`, headers: waitingHeaders,
        payload: { question: '진행 중인 질문' } });
      assert.equal(waitingReplay.statusCode, 202);
      assert.equal(waitingReplay.json().runId, waitingRecovery.json().runId);
      await pool.query(`update ap.ai_runs set started_at = now() - interval '6 minutes'
        where id = $1`, [waitingRecovery.json().runId]);
      const unknownRecovery = await app.inject({ url: `/v1/engagements/${waitingId}/messages/recover`,
        headers: waitingHeaders });
      assert.equal(unknownRecovery.statusCode, 200);
      assert.equal(unknownRecovery.json().state, 'result_unknown');
      assert.equal(unknownRecovery.json().question, '진행 중인 질문');
      assert.equal(unknownRecovery.headers['retry-after'], '30');
      const unknownReplay = await app.inject({ method: 'POST',
        url: `/v1/engagements/${waitingId}/messages`, headers: waitingHeaders,
        payload: { question: '진행 중인 질문' } });
      assert.equal(unknownReplay.statusCode, 202);
      assert.equal(unknownReplay.json().state, 'result_unknown');
      assert.equal(unknownReplay.headers['retry-after'], '30');
      assert.equal((await app.inject({ method: 'POST',
        url: `/v1/engagements/${waitingId}/messages`,
        headers: { ...waitingHeaders, 'idempotency-key': randomBytes(32).toString('base64url') },
        payload: { question: '다른 새 질문' } })).json().error, 'answer_in_progress');
    } finally {
      finishWaitingModel(); waitForModel = null; modelEntered = null;
      waitingResult = await waitingFirst;
    }
    assert.equal(waitingResult?.statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/engagements/${waitingId}/messages/recover`,
      headers: waitingHeaders })).json().state, 'completed');
    assert.equal((await pool.query<{ count: string }>(
      'select count(*)::text as count from ap.ai_runs where inquiry_id = $1', [waitingId])).rows[0]?.count, '1');
    const parallelAiSession = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(parallelAiSession.statusCode, 201);
    const parallelAiId = parallelAiSession.json().id as string;
    const parallelAiHeaders = { cookie: parallelAiSession.headers['set-cookie']?.toString().split(';')[0],
      'idempotency-key': randomBytes(32).toString('base64url') };
    const seenBeforeParallelAi = seen.length;
    let finishParallelModel: () => void = () => undefined;
    waitForModel = new Promise<void>(resolve => { finishParallelModel = resolve; });
    const parallelModelEntered = new Promise<void>(resolve => { modelEntered = resolve; });
    const parallelAiPosts = [0, 1].map(() => app.inject({ method: 'POST',
      url: `/v1/engagements/${parallelAiId}/messages`, headers: parallelAiHeaders,
      payload: { question: '동시에 들어온 동일 질문' } }));
    let parallelAiResults: Awaited<(typeof parallelAiPosts)[number]>[] = [];
    try {
      await parallelModelEntered;
      const inProgressReplay = await Promise.race(parallelAiPosts);
      assert.equal(inProgressReplay.statusCode, 202);
    } finally {
      finishParallelModel(); waitForModel = null; modelEntered = null;
      parallelAiResults = await Promise.all(parallelAiPosts);
    }
    assert.deepEqual(parallelAiResults.map(result => result.statusCode).sort(), [200, 202]);
    assert.equal(seen.length, seenBeforeParallelAi + 1);
    assert.deepEqual((await pool.query<{ runs: string; messages: string }>(
      `select (select count(*)::text from ap.ai_runs where inquiry_id = $1) as runs,
         (select count(*)::text from ap.inquiry_messages where inquiry_id = $1) as messages`,
      [parallelAiId])).rows[0], { runs: '1', messages: '2' });
    const failedSession = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(failedSession.statusCode, 201);
    const failedId = failedSession.json().id as string;
    const failedHeaders = { cookie: failedSession.headers['set-cookie']?.toString().split(';')[0],
      'idempotency-key': randomBytes(32).toString('base64url') };
    invalidUsage = true;
    const seenBeforeFailure = seen.length;
    const failedAi = await app.inject({ method: 'POST', url: `/v1/engagements/${failedId}/messages`,
      headers: failedHeaders, payload: { question: '실패 응답도 재실행하지 않습니다' } });
    assert.equal(failedAi.statusCode, 422);
    invalidUsage = false;
    const failedRecovery = await app.inject({ url: `/v1/engagements/${failedId}/messages/recover`,
      headers: failedHeaders });
    assert.equal(failedRecovery.statusCode, 200);
    assert.equal(failedRecovery.json().state, 'rejected');
    assert.equal(failedRecovery.json().error, 'invalid_model_output');
    const failedReplay = await app.inject({ method: 'POST', url: `/v1/engagements/${failedId}/messages`,
      headers: failedHeaders, payload: { question: '실패 응답도 재실행하지 않습니다' } });
    assert.equal(failedReplay.statusCode, 422);
    assert.equal(failedReplay.json().runId, failedAi.json().runId);
    assert.equal(seen.length, seenBeforeFailure + 1);
    const parallel = await app.inject({ method: 'POST', url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(parallel.statusCode, 201);
    const parallelId = parallel.json().id as string;
    const parallelCookie = parallel.headers['set-cookie']?.toString().split(';')[0];
    const parallelHeaders = { cookie: parallelCookie, 'idempotency-key': randomBytes(32).toString('base64url'),
      'x-receipt-key': randomBytes(32).toString('base64url') };
    const parallelBody = { name: '동시 제출', phone: '010-2222-3333', consent: true, message: '한 건만 접수' };
    const [parallelA, parallelB] = await Promise.all([
      app.inject({ method: 'POST', url: `/v1/conversations/${parallelId}/submissions`,
        headers: parallelHeaders, payload: parallelBody }),
      app.inject({ method: 'POST', url: `/v1/conversations/${parallelId}/submissions`,
        headers: parallelHeaders, payload: parallelBody }),
    ]);
    assert.deepEqual([parallelA.statusCode, parallelB.statusCode].sort(), [200, 201]);
    assert.equal(parallelA.json().id, parallelId);
    assert.equal(parallelB.json().id, parallelId);
    const parallelEvents = await pool.query<{ count: string }>(
      "select count(*)::text as count from ap.outbox where aggregate_id = $1 and event_type = 'ap.inquiry.created'", [parallelId]);
    assert.equal(parallelEvents.rows[0]?.count, '1');
    invalidUsage = true;
    const another = await app.inject({ method: 'POST', url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(another.statusCode, 201);
    const anotherCookie = another.headers['set-cookie']?.toString().split(';')[0];
    const badUsage = await app.inject({ method: 'POST', url: `/v1/engagements/${another.json().id}/messages`,
      headers: { cookie: anotherCookie }, payload: { question: '잘못된 사용량 검수' } });
    assert.equal(badUsage.statusCode, 422);
    assert.equal(badUsage.json().error, 'invalid_model_output');
    invalidUsage = false;
    const racing = await app.inject({ method: 'POST', url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(racing.statusCode, 201);
    const racingId = racing.json().id as string;
    const racingCookie = racing.headers['set-cookie']?.toString().split(';')[0];
    let finishModel: () => void = () => undefined;
    waitForModel = new Promise<void>(resolve => { finishModel = resolve; });
    const entered = new Promise<void>(resolve => { modelEntered = resolve; });
    const pendingAnswer = app.inject({ method: 'POST', url: `/v1/engagements/${racingId}/messages`,
      headers: { cookie: racingCookie }, payload: { question: '동시 처리 질문' } });
    await entered;
    const humanTakesOver = await app.inject({ method: 'POST', url: `/v1/conversations/${racingId}/submissions`,
      headers: { cookie: racingCookie }, payload: { name: '경합 고객', phone: '010-5555-6666',
        message: '담당자에게 바로 문의', consent: true } });
    assert.equal(humanTakesOver.statusCode, 201);
    finishModel();
    const suppressed = await pendingAnswer;
    assert.equal(suppressed.statusCode, 409);
    assert.equal(suppressed.json().error, 'automation_paused_or_source_changed');
    const humanTranscript = await app.inject({ url: `/v1/inquiries/${racingId}`,
      headers: { authorization: `Bearer ${humanTakesOver.json().receiptKey}` } });
    assert.deepEqual(humanTranscript.json().messages.map((item: { actor: string }) => item.actor), ['customer', 'customer']);
    const fallback = await disconnected.inject({ method: 'POST',
      url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(fallback.statusCode, 201, fallback.body);
    const fallbackId = fallback.json().id as string;
    const fallbackCookie = fallback.headers['set-cookie']?.toString().split(';')[0];
    const noModel = await disconnected.inject({ method: 'POST',
      url: `/v1/engagements/${fallbackId}/messages`, headers: { cookie: fallbackCookie },
      payload: { question: '사람에게 문의할 수 있나요?' } });
    assert.equal(noModel.statusCode, 503);
    assert.equal(noModel.json().error, 'blocked_integration');
    const fallbackHuman = await disconnected.inject({ method: 'POST',
      url: `/v1/conversations/${fallbackId}/submissions`, headers: { cookie: fallbackCookie },
      payload: { name: '공급사 미연결 고객', phone: '010-7777-9999',
        message: '모델 없이 사람에게 문의', consent: true } });
    assert.equal(fallbackHuman.statusCode, 201, fallbackHuman.body);
    assert.equal(fallbackHuman.json().id, fallbackId);
    const fallbackSource = await pool.query<{ deployment_id: string; mode: string; consent_at: Date | null }>(
      'select deployment_id, mode, consent_at from ap.inquiries where id = $1', [fallbackId]);
    assert.equal(fallbackSource.rows[0]?.deployment_id, link.json().id);
    assert.equal(fallbackSource.rows[0]?.mode, 'human');
    assert.ok(fallbackSource.rows[0]?.consent_at);
    await pool.query('delete from ap.field_preflight_organization_windows where organization_id = $1',
      [organizationId]);
    process.env.AP_FIELD_PREFLIGHT_ORG_LIMIT = '2';
    const limited = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(limited.statusCode, 201, limited.body);
    const limitedId = limited.json().id as string;
    const limitedCookie = limited.headers['set-cookie']?.toString().split(';')[0];
    for (let index = 0; index < 2; index += 1) {
      const allowed = await app.inject({ url: `/v1/engagements/${limitedId}/field-readiness`,
        headers: { cookie: limitedCookie } });
      assert.equal(allowed.statusCode, 200, allowed.body);
      assert.equal(allowed.json().ready, true);
    }
    const callsBeforeLimit = fieldProbeCalls;
    const limitedRead = await app.inject({ url: `/v1/engagements/${limitedId}/field-readiness`,
      headers: { cookie: limitedCookie } });
    assert.equal(limitedRead.statusCode, 429, limitedRead.body);
    assert.equal(limitedRead.json().error, 'field_preflight_rate_limited');
    assert.equal(limitedRead.json().scope, 'organization');
    assert.ok(Number(limitedRead.headers['retry-after']) >= 1);
    const limitedPost = await app.inject({ method: 'POST',
      url: `/v1/conversations/${limitedId}/submissions`, headers: { cookie: limitedCookie },
      payload: { name: '한도 고객', phone: '010-5555-4444', message: 'Field 직접 요청',
        consent: true, destination: 'field' } });
    assert.equal(limitedPost.statusCode, 429, limitedPost.body);
    assert.equal(limitedPost.json().error, 'field_preflight_rate_limited');
    assert.equal(fieldProbeCalls, callsBeforeLimit);
    assert.deepEqual((await pool.query<{ customer_phone: string | null; state: string }>(
      'select customer_phone,state from ap.inquiries where id = $1', [limitedId])).rows[0],
    { customer_phone: null, state: 'ai_assisting' });
    assert.equal((await app.inject({ method: 'POST', url: `/v1/conversations/${externalId}/submissions`,
      headers: externalHeaders, payload: externalBody })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/conversations/${limitedId}/submissions`,
      headers: { cookie: limitedCookie }, payload: { name: '사람 문의 고객', phone: '010-5555-4444',
        message: '사람에게 문의합니다', consent: true } })).statusCode, 201);
    await pool.query(`update ap.field_preflight_organization_windows
      set window_started_at = now() - interval '2 minutes' where organization_id = $1`,
    [organizationId]);
    const recoveredLimit = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(recoveredLimit.statusCode, 201);
    const recoveredCookie = recoveredLimit.headers['set-cookie']?.toString().split(';')[0];
    assert.equal((await app.inject({ url: `/v1/engagements/${recoveredLimit.json().id}/field-readiness`,
      headers: { cookie: recoveredCookie } })).statusCode, 200);
    await pool.query('delete from ap.field_preflight_organization_windows where organization_id = $1',
      [organizationId]);
    const beforeParallel = fieldProbeCalls;
    const parallelReadiness = await Promise.all(Array.from({ length: 3 }, () => app.inject({
      url: `/v1/engagements/${recoveredLimit.json().id}/field-readiness`,
      headers: { cookie: recoveredCookie },
    })));
    assert.deepEqual(parallelReadiness.map(response => response.statusCode).sort(), [200, 200, 429]);
    assert.equal(fieldProbeCalls - beforeParallel, 4);
  } finally {
    if (oldFieldPreflightLimit === undefined) delete process.env.AP_FIELD_PREFLIGHT_ORG_LIMIT;
    else process.env.AP_FIELD_PREFLIGHT_ORG_LIMIT = oldFieldPreflightLimit;
    await Promise.all([app.close(), disconnected.close()]);
  }
});

test('AP abandoned customer AI run is closed after ten minutes without touching usage', async () => {
  const email = `consult-abandoned-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const authPost = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic owner' }),
  }));
  assert.equal((await authPost('/sign-up/email')).status, 200);
  const ownerCookie = (await authPost('/sign-in/email')).headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  let calls = 0;
  const modelProvider = { model: 'synthetic-abandoned-model', generate: async () => {
    calls += 1;
    return { output: { answer: '상담 서비스를 안내합니다.', evidenceIds: ['service:0'], unknowns: [], handoffRecommended: false },
      inputTokens: 32, outputTokens: 12, responseId: `synthetic-abandoned-${calls}` };
  } };
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool, resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    modelProvider, customerDailyLimit: 20,
  });
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: ownerCookie }, payload: { name: '중단 run 상담' } });
    assert.equal(organization.statusCode, 201);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft',
      headers: { cookie: ownerCookie }, payload: { expectedRevision: 0, businessName: '중단 run 상담',
        introduction: '', services: [{ name: '상담', description: '방문' }], faqs: [] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases',
      headers: { cookie: ownerCookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/agents/draft', headers: { cookie: ownerCookie },
      payload: { expectedRevision: 0, name: '상담 AI', tone: 'clear', guideScope: '', handoffText: '담당자가 답변합니다.' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/releases', headers: { cookie: ownerCookie },
      payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } })).statusCode, 201);
    const deployment = await app.inject({ method: 'POST', url: '/v1/deployments',
      headers: { cookie: ownerCookie }, payload: { kind: 'link' } });
    assert.equal(deployment.statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${deployment.json().id}/activate`,
      headers: { cookie: ownerCookie } })).statusCode, 200);
    const engagement = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${deployment.json().publicId}/engagements` });
    assert.equal(engagement.statusCode, 201);
    const inquiryId = engagement.json().id as string;
    const cookie = engagement.headers['set-cookie']?.toString().split(';')[0];
    const key = randomBytes(32).toString('base64url');
    // dispatch까지 기록된 뒤 정산 전에 프로세스가 죽은 run을 재현한다
    const runId = randomUUID();
    const db = await pool.connect();
    try {
      await db.query('begin');
      await db.query(`insert into ap.ai_runs(id, organization_id, agent_release_id, knowledge_release_id, kind, inquiry_id,
          inquiry_revision, question, status, provider_model, idempotency_key_hash, started_at)
        select $1, i.organization_id, i.agent_release_id, i.knowledge_release_id, 'customer_message', i.id, i.revision + 1,
          '중단된 질문', 'in_progress', 'synthetic-abandoned-model', $3, now() - interval '9 minutes' from ap.inquiries i where i.id = $2`,
      [runId, inquiryId, createHash('sha256').update(key).digest('hex')]);
      await reserveAi(db, runId); await dispatchAi(db, runId);
      await db.query('commit');
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
    const recover = () => app.inject({ url: `/v1/engagements/${inquiryId}/messages/recover`, headers: { cookie, 'idempotency-key': key } });
    const ask = (question: string, idempotency = randomBytes(32).toString('base64url')) => app.inject({ method: 'POST',
      url: `/v1/engagements/${inquiryId}/messages`, headers: { cookie, 'idempotency-key': idempotency }, payload: { question } });
    // 10분 전에는 결과 미상으로 유지하고 새 질문을 막는다
    assert.equal((await recover()).json().state, 'result_unknown');
    assert.equal((await ask('새 질문입니다')).json().error, 'answer_in_progress');
    await pool.query(`update ap.ai_runs set started_at = now() - interval '11 minutes' where id = $1`, [runId]);
    const abandoned = await recover();
    assert.equal(abandoned.statusCode, 200);
    assert.equal(abandoned.json().state, 'failed');
    assert.equal(abandoned.json().error, 'run_abandoned');
    const replay = await ask('중단된 질문', key);
    assert.equal(replay.statusCode, 503);
    assert.equal(replay.json().error, 'run_abandoned');
    assert.equal(calls, 0);
    // 사용량 원장은 그대로 두고, 같은 문의의 다음 질문은 다시 처리된다
    assert.equal((await pool.query<{ state: string }>('select state from ap.ai_usage_ledger where run_id = $1', [runId])).rows[0]?.state, 'dispatched');
    const next = await ask('새 질문입니다');
    assert.equal(next.statusCode, 200, next.body);
    assert.equal(calls, 1);
    const run = (await pool.query<{ status: string; error_code: string; finished_at: Date | null }>(
      'select status, error_code, finished_at from ap.ai_runs where id = $1', [runId])).rows[0];
    assert.equal(run?.status, 'failed'); assert.equal(run?.error_code, 'run_abandoned'); assert.ok(run?.finished_at);
  } finally { await app.close(); }
});
