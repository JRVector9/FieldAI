import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { agentRevocationJournalFromEnvironment } from '../src/revocation-journal.js';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const authBase = 'http://127.0.0.1:4311/api/auth';
type ResponseSchema = { $ref?: string; type?: string | string[]; required?: string[];
  properties?: Record<string, ResponseSchema>; additionalProperties?: boolean;
  items?: ResponseSchema; pattern?: string; format?: string; enum?: unknown[] };
type ContractDocument = { paths: Record<string, Record<string, { responses: Record<string,
  { content?: { 'application/json'?: { schema?: ResponseSchema } } }> }>>;
  components: { schemas: Record<string, ResponseSchema> } };
const contract = JSON.parse(readFileSync(resolve('../../contracts/agent-integrator-v1.openapi.json'),
  'utf8')) as ContractDocument;

function assertContract(path: string, method: 'get' | 'post', status: number, value: unknown) {
  const declared = contract.paths[path]?.[method]?.responses?.[String(status)]?.content?.['application/json']?.schema;
  assert.ok(declared, `OpenAPI ${method.toUpperCase()} ${path} ${status}`);
  function check(schema: ResponseSchema, actual: unknown, location: string): void {
    if (schema.$ref) {
      const name = String(schema.$ref).split('/').at(-1);
      assert.ok(name);
      const referenced = contract.components.schemas[name];
      assert.ok(referenced);
      check(referenced, actual, location);
      return;
    }
    if (schema.type === 'object') {
      assert.ok(actual !== null && typeof actual === 'object' && !Array.isArray(actual), location);
      const item = actual as Record<string, unknown>;
      for (const key of schema.required ?? []) assert.ok(key in item, `${location}.${key}`);
      if (schema.additionalProperties === false)
        for (const key of Object.keys(item)) assert.ok(key in (schema.properties ?? {}), `${location}.${key}`);
      for (const [key, entry] of Object.entries(schema.properties ?? {}))
        if (key in item) check(entry, item[key], `${location}.${key}`);
      return;
    }
    if (schema.type === 'array') {
      assert.ok(Array.isArray(actual), location);
      const element = schema.items;
      assert.ok(element, `${location}.items`);
      actual.forEach((item, index) => check(element, item, `${location}[${index}]`));
      return;
    }
    if (Array.isArray(schema.type) && actual === null && schema.type.includes('null')) return;
    if (schema.type === 'integer') assert.ok(Number.isInteger(actual), location);
    else if (schema.type === 'string' || (Array.isArray(schema.type) && schema.type.includes('string'))) {
      assert.equal(typeof actual, 'string', location);
      if (schema.pattern) assert.match(actual as string, new RegExp(schema.pattern), location);
      if (schema.format === 'uuid') assert.match(actual as string, /^[0-9a-f-]{36}$/i, location);
      if (schema.format === 'date-time') assert.ok(!Number.isNaN(Date.parse(actual as string)), location);
    }
    if (schema.enum) assert.ok(schema.enum.includes(actual), location);
  }
  check(declared, value, `${method.toUpperCase()} ${path}`);
}

async function actor() {
  const email = `integrator-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string, payload: object, cookie?: string) => auth.handler(new Request(`${authBase}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:4311',
      ...(cookie ? { cookie } : {}) }, body: JSON.stringify(payload),
  }));
  assert.equal((await post('/sign-up/email', { email, password, name: 'Integrator owner' })).status, 200);
  const signed = await post('/sign-in/email', { email, password });
  assert.equal(signed.status, 200);
  return { email, cookie: signed.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('AP integrator chooses an owned AI and reads only explicitly delegated resources', async () => {
  const owner = await actor();
  const outsider = await actor();
  const app = createAgentApp(async () => undefined, auth.handler, authBase, undefined, {
    pool,
    revocationJournal: agentRevocationJournalFromEnvironment(),
    resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    resolveSession: async headers => {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
      return session ? { id: session.session.id, userId: session.user.id } : null;
    },
  });
  let organizationId = '';
  try {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie: owner.cookie },
      payload: { name: '연동 사업자' } });
    assert.equal(created.statusCode, 201);
    organizationId = created.json().id as string;
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: { cookie: owner.cookie },
      payload: { expectedRevision: 0, businessName: '연동 사업자', introduction: '승인 정보',
        services: [{ name: '상담 서비스', description: '승인된 상담 서비스' }], faqs: [] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    const draft = await app.inject({ method: 'PUT', url: '/v1/agents/draft', headers: { cookie: owner.cookie },
      payload: { expectedRevision: 0, name: '연동 AI', tone: 'clear', guideScope: '승인 안내',
        handoffText: '담당자가 응대합니다.' } });
    assert.equal(draft.statusCode, 200);
    const agentId = draft.json().agentId as string;
    assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/releases',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } })).statusCode, 201);
    const registration = await auth.handler(new Request(`${authBase}/oauth2/create-client`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: owner.cookie,
        origin: 'http://127.0.0.1:4311' },
      body: JSON.stringify({ client_name: '외부 통합자', redirect_uris: ['https://client.example.test/callback'],
        application_type: 'web', token_endpoint_auth_method: 'client_secret_basic',
        grant_types: ['authorization_code'], response_types: ['code'],
        scope: 'openid ap.agent.read ap.conversations.read ap.conversations.reply' }),
    }));
    assert.equal(registration.status, 201, await registration.clone().text());
    const registered = await registration.json() as { client_id: string; client_secret: string };
    const clientId = registered.client_id;
    const localRegistration = await auth.handler(new Request(`${authBase}/oauth2/create-client`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: owner.cookie,
        origin: 'http://127.0.0.1:4311' },
      body: JSON.stringify({ client_name: '로컬 Field BFF',
        redirect_uris: ['http://127.0.0.1:4321/v1/connections/ap/callback'],
        application_type: 'native', token_endpoint_auth_method: 'client_secret_basic',
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
        scope: 'openid offline_access ap.agent.read ap.conversations.read' }),
    }));
    assert.equal(localRegistration.status, 201, await localRegistration.clone().text());
    const localClientId = (await localRegistration.json() as { client_id: string }).client_id;
    assert.equal((await app.inject({ url: `/integrations/v1/authorization/options?clientId=${localClientId}`,
      headers: { cookie: owner.cookie } })).statusCode, 200);
    const options = await app.inject({ url: `/integrations/v1/authorization/options?clientId=${clientId}`,
      headers: { cookie: owner.cookie } });
    assert.equal(options.statusCode, 200);
    assert.ok(options.json().client.scopes.includes('ap.conversations.reply'));
    assert.equal(options.json().organizations[0].id, organizationId);
    assert.equal(options.json().organizations[0].agentId, agentId);
    assert.equal((await app.inject({ url: `/integrations/v1/authorization/options?clientId=${clientId}`,
      headers: { cookie: outsider.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/integrations/v1/authorization/options?clientId=${clientId}` })).statusCode, 401);
    const selectedDeployment = await app.inject({ method: 'POST', url: '/v1/deployments',
      headers: { cookie: owner.cookie }, payload: { kind: 'link' } });
    assert.equal(selectedDeployment.statusCode, 201);
    const deploymentId = selectedDeployment.json().id as string;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${deploymentId}/activate`,
      headers: { cookie: owner.cookie } })).statusCode, 200);
    const badSelection = { clientId, organizationId, agentId, deploymentIds: [deploymentId],
      scopes: ['ap.agent.read', 'ap.conversations.read'] };
    assert.equal((await app.inject({ method: 'POST', url: '/integrations/v1/authorization/selections',
      headers: { cookie: outsider.cookie }, payload: badSelection })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/integrations/v1/authorization/selections',
      headers: { cookie: owner.cookie }, payload: { ...badSelection, scopes: ['field.requests.create'] } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/integrations/v1/authorization/selections',
      headers: { cookie: owner.cookie }, payload: { ...badSelection, deploymentIds: [randomUUID()] } })).statusCode, 404);
    const selection = await app.inject({ method: 'POST', url: '/integrations/v1/authorization/selections',
      headers: { cookie: owner.cookie }, payload: badSelection });
    assert.equal(selection.statusCode, 201, selection.body);
    const selectionId = selection.json().id as string;
    assert.equal((await app.inject({ url: `/integrations/v1/authorization/current?clientId=${clientId}`,
      headers: { cookie: outsider.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ url: `/integrations/v1/authorization/current?clientId=${clientId}`,
      headers: { cookie: owner.cookie } })).json().id, selectionId);

    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const authorizationUrl = new URL(`${authBase}/oauth2/authorize`);
    for (const [key, value] of Object.entries({ response_type: 'code', client_id: clientId,
      redirect_uri: 'https://client.example.test/callback',
      scope: 'openid ap.agent.read ap.conversations.read', state: randomUUID(),
      code_challenge: challenge, code_challenge_method: 'S256',
      resource: 'http://127.0.0.1:4311/integrations/v1' }))
      authorizationUrl.searchParams.set(key, value);
    const authorization = await auth.handler(new Request(authorizationUrl, { headers: { cookie: owner.cookie } }));
    assert.equal(authorization.status, 302);
    const consentUrl = new URL(authorization.headers.get('location') ?? '/', authBase);
    assert.equal(consentUrl.pathname, '/consent');
    const oauthConsent = await auth.handler(new Request(`${authBase}/oauth2/consent`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:4311',
        cookie: owner.cookie },
      body: JSON.stringify({ accept: true, oauth_query: consentUrl.searchParams.toString() }),
    }));
    assert.equal(oauthConsent.status, 200, await oauthConsent.clone().text());
    const consentResult = await oauthConsent.json() as { url: string };
    const callback = new URL(consentResult.url);
    const code = callback.searchParams.get('code');
    assert.ok(code);
    const token = await auth.handler(new Request(`${authBase}/oauth2/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${clientId}:${registered.client_secret}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId,
        redirect_uri: 'https://client.example.test/callback', code, code_verifier: verifier }),
    }));
    assert.equal(token.status, 200, await token.clone().text());
    const accessToken = (await token.json() as { access_token: string }).access_token;
    const bearer = { authorization: `Bearer ${accessToken}` };
    const me = await app.inject({ url: '/integrations/v1/me', headers: bearer });
    assert.equal(me.statusCode, 200);
    assertContract('/integrations/v1/me', 'get', 200, me.json());
    assert.equal(me.json().organizationId, organizationId);
    assert.equal(me.json().agentId, agentId);
    assert.deepEqual(me.json().deploymentIds, [deploymentId]);
    assert.deepEqual(me.json().scopes, ['ap.agent.read', 'ap.conversations.read']);
    assert.equal((await app.inject({ url: '/integrations/v1/agent' })).statusCode, 401);
    const delegatedAgent = await app.inject({ url: '/integrations/v1/agent', headers: bearer });
    assert.equal(delegatedAgent.statusCode, 200, delegatedAgent.body);
    assertContract('/integrations/v1/agent', 'get', 200, delegatedAgent.json());
    assert.equal(delegatedAgent.json().agentId, agentId);
    assert.equal((await app.inject({ url: '/integrations/v1/deployments' })).statusCode, 401);
    const delegatedDeployments = await app.inject({ url: '/integrations/v1/deployments', headers: bearer });
    assert.equal(delegatedDeployments.statusCode, 200, delegatedDeployments.body);
    assertContract('/integrations/v1/deployments', 'get', 200, delegatedDeployments.json());
    assert.deepEqual(delegatedDeployments.json().deployments, [{ id: deploymentId,
      publicId: selectedDeployment.json().publicId, kind: 'link', origin: null }]);
    const otherDeployment = await app.inject({ method: 'POST', url: '/v1/deployments',
      headers: { cookie: owner.cookie }, payload: { kind: 'link' } });
    assert.equal(otherDeployment.statusCode, 201);
    const otherDeploymentId = otherDeployment.json().id as string;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${otherDeploymentId}/activate`,
      headers: { cookie: owner.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/integrations/v1/deployments',
      headers: bearer })).json().deployments.length, 1);
    const knowledge = await pool.query<{ id: string }>(
      'select id from ap.knowledge_releases where organization_id = $1 order by revision desc limit 1',
      [organizationId]);
    const visibleId = randomUUID();
    const hiddenId = randomUUID();
    for (const [id, deployment] of [[visibleId, deploymentId], [hiddenId, otherDeploymentId]]) {
      await pool.query(
        `insert into ap.inquiries(id, organization_id, knowledge_release_id, knowledge_revision,
           customer_name, customer_phone, visitor_key_hash, state, consent_at, deployment_id)
         values ($1,$2,$3,1,'합성 고객','010-9999-9999',$4,'needs_owner',now(),$5)`,
        [id, organizationId, knowledge.rows[0]!.id, randomUUID(), deployment]);
    }
    await pool.query(
      `insert into ap.inquiry_messages(id,inquiry_id,sequence,actor,visibility,body,delivery_state)
       values ($1,$2,1,'customer','customer','공개 질문','not_applicable'),
         ($3,$2,2,'owner','internal','비공개 메모','not_applicable')`,
      [randomUUID(), visibleId, randomUUID()]);
    await pool.query('update ap.inquiries set next_sequence = 3, revision = 2 where id = $1', [visibleId]);
    const conversations = await app.inject({ url: '/integrations/v1/conversations', headers: bearer });
    assert.equal(conversations.statusCode, 200);
    assertContract('/integrations/v1/conversations', 'get', 200, conversations.json());
    assert.deepEqual(conversations.json().conversations.map((item: { id: string }) => item.id), [visibleId]);
    const detail = await app.inject({ url: `/integrations/v1/conversations/${visibleId}`, headers: bearer });
    assert.equal(detail.statusCode, 200);
    assertContract('/integrations/v1/conversations/{id}', 'get', 200, detail.json());
    assert.equal(detail.json().revision, 2);
    assert.equal(detail.json().messages, undefined);
    assert.doesNotMatch(detail.body, /010-9999-9999|비공개 메모|합성 고객/);
    const pageOne = await app.inject({ url: `/integrations/v1/conversations/${visibleId}/messages?after=0&limit=1`,
      headers: bearer });
    assert.equal(pageOne.statusCode, 200);
    assertContract('/integrations/v1/conversations/{id}/messages', 'get', 200, pageOne.json());
    assert.deepEqual(pageOne.json().messages.map((item: { body: string }) => item.body), ['공개 질문']);
    assert.equal(pageOne.json().nextAfter, '1');
    assert.equal((await app.inject({ url: `/integrations/v1/conversations/${visibleId}/messages?after=1&limit=1`,
      headers: bearer })).json().messages.length, 0);
    assert.equal((await app.inject({ method: 'POST', url: `/integrations/v1/conversations/${visibleId}/replies`,
      headers: { ...bearer, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { body: '통합자 답변', expectedRevision: 0 } })).statusCode, 403);
    assert.equal((await app.inject({ url: `/integrations/v1/conversations/${hiddenId}`,
      headers: bearer })).statusCode, 404);

    const replySelection = await app.inject({ method: 'POST',
      url: '/integrations/v1/authorization/selections', headers: { cookie: owner.cookie },
      payload: { ...badSelection, scopes: ['ap.conversations.read', 'ap.conversations.reply'] } });
    assert.equal(replySelection.statusCode, 201);
    const replySelectionId = replySelection.json().id as string;
    const replyVerifier = randomBytes(32).toString('base64url');
    const replyChallenge = createHash('sha256').update(replyVerifier).digest('base64url');
    const replyAuthorizationUrl = new URL(authorizationUrl);
    replyAuthorizationUrl.searchParams.set('scope', 'openid ap.conversations.read ap.conversations.reply');
    replyAuthorizationUrl.searchParams.set('state', randomUUID());
    replyAuthorizationUrl.searchParams.set('code_challenge', replyChallenge);
    assert.match(replyAuthorizationUrl.searchParams.get('scope') ?? '', /ap\.conversations\.reply/);
    const replyAuthorization = await auth.handler(new Request(replyAuthorizationUrl,
      { headers: { cookie: owner.cookie } }));
    assert.equal(replyAuthorization.status, 302);
    const replyConsentUrl = new URL(replyAuthorization.headers.get('location') ?? '/', authBase);
    assert.equal(replyConsentUrl.pathname, '/consent');
    assert.equal(replyConsentUrl.searchParams.get('state'), replyAuthorizationUrl.searchParams.get('state'));
    assert.match(replyConsentUrl.searchParams.get('scope') ?? '', /ap\.conversations\.reply/);
    const replyConsent = await auth.handler(new Request(`${authBase}/oauth2/consent`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:4311',
        cookie: owner.cookie },
      body: JSON.stringify({ accept: true, oauth_query: replyConsentUrl.searchParams.toString() }),
    }));
    assert.equal(replyConsent.status, 200, await replyConsent.clone().text());
    const replyCode = new URL((await replyConsent.json() as { url: string }).url).searchParams.get('code');
    assert.ok(replyCode);
    const replyToken = await auth.handler(new Request(`${authBase}/oauth2/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${clientId}:${registered.client_secret}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId,
        redirect_uri: 'https://client.example.test/callback', code: replyCode,
        code_verifier: replyVerifier }),
    }));
    assert.equal(replyToken.status, 200, await replyToken.clone().text());
    const replyTokenResult = await replyToken.json() as { access_token: string; scope: string };
    assert.match(replyTokenResult.scope, /ap\.conversations\.reply/);
    const replyBearer = { authorization: `Bearer ${replyTokenResult.access_token}` };
    const replyUrl = `/integrations/v1/conversations/${visibleId}/replies`;
    const replyKey = randomBytes(32).toString('base64url');
    const replyHeaders = { ...replyBearer, 'idempotency-key': replyKey };
    assert.equal((await app.inject({ method: 'POST', url: replyUrl, headers: replyHeaders,
      payload: { body: '위임 사업자 답변', expectedRevision: 1 } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: replyUrl,
      headers: { ...replyBearer, 'idempotency-key': 'short' },
      payload: { body: '위임 사업자 답변', expectedRevision: 2 } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: `/integrations/v1/conversations/${hiddenId}/replies`,
      headers: replyHeaders, payload: { body: '허용 안 됨', expectedRevision: 0 } })).statusCode, 404);
    const [posted, concurrentReplay] = await Promise.all([0, 1].map(() => app.inject({
      method: 'POST', url: replyUrl, headers: replyHeaders,
      payload: { body: '위임 사업자 답변', expectedRevision: 2 },
    })));
    assert.ok(posted && concurrentReplay);
    assert.deepEqual([posted.statusCode, concurrentReplay.statusCode].sort(), [200, 201]);
    assertContract('/integrations/v1/conversations/{id}/replies', 'post', posted.statusCode, posted.json());
    assertContract('/integrations/v1/conversations/{id}/replies', 'post', concurrentReplay.statusCode,
      concurrentReplay.json());
    assert.equal(posted.json().messageId, concurrentReplay.json().messageId);
    const replyMessageId = posted.json().messageId as string;
    assert.equal(posted.json().delivery, 'blocked_integration');
    assert.equal(posted.json().revision, 3);
    const replayed = await app.inject({ method: 'POST', url: replyUrl, headers: replyHeaders,
      payload: { body: '위임 사업자 답변', expectedRevision: 2 } });
    assert.equal(replayed.statusCode, 200);
    assert.equal(replayed.json().messageId, replyMessageId);
    assert.equal((await app.inject({ method: 'POST', url: replyUrl, headers: replyHeaders,
      payload: { body: '다른 답변', expectedRevision: 2 } })).statusCode, 409);
    const storedReply = await pool.query<{ external_actor_user_id: string;
      external_client_id: string; external_grant_id: string }>(
      `select external_actor_user_id, external_client_id, external_grant_id
       from ap.inquiry_messages where id = $1`, [replyMessageId]);
    assert.equal(storedReply.rows[0]?.external_client_id, clientId);
    assert.equal(storedReply.rows[0]?.external_grant_id, replySelectionId);
    const effects = await pool.query<{ messages: string; events: string; notifications: string }>(
      `select (select count(*) from ap.inquiry_messages where id = $1)::text as messages,
         (select count(*) from ap.outbox where event_type = 'ap.inquiry.owner_reply'
           and payload->>'sourceMessageId' = $1::text)::text as events,
         (select count(*) from ap.notification_events where source_message_id = $1)::text as notifications`,
      [replyMessageId]);
    assert.deepEqual(effects.rows[0], { messages: '1', events: '1', notifications: '1' });
    const afterReply = await app.inject({ url: `/integrations/v1/conversations/${visibleId}/messages?after=2`,
      headers: replyBearer });
    assert.equal(afterReply.statusCode, 200);
    assert.deepEqual(afterReply.json().messages.map((item: { body: string }) => item.body), ['위임 사업자 답변']);
    const spammed = await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${visibleId}/spam`,
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 3, spam: true } });
    assert.equal(spammed.statusCode, 200);
    const blockedReply = await app.inject({ method: 'POST', url: replyUrl,
      headers: { ...replyBearer, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { body: '스팸 중 위임 답변 차단', expectedRevision: spammed.json().revision } });
    assert.equal(blockedReply.statusCode, 409);
    assert.equal(blockedReply.json().error, 'conversation_spam');
    assertContract('/integrations/v1/conversations/{id}/replies', 'post', 409, blockedReply.json());
    assert.equal((await app.inject({ url: `/integrations/v1/conversations/${visibleId}/messages?after=2`,
      headers: replyBearer })).json().messages.length, 1);
    assert.equal((await app.inject({ method: 'POST', url: `/integrations/v1/authorization/selections/${selectionId}/revoke`,
      headers: { cookie: outsider.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/integrations/v1/authorization/selections/${selectionId}/revoke`,
      headers: { cookie: owner.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/integrations/v1/agent', headers: bearer })).statusCode, 401);
    assert.equal((await app.inject({ url: '/integrations/v1/me', headers: replyBearer })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST',
      url: `/integrations/v1/authorization/selections/${replySelectionId}/revoke`,
      headers: { cookie: owner.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: replyUrl, headers: replyHeaders,
      payload: { body: '위임 사업자 답변', expectedRevision: 2 } })).statusCode, 401);
  } finally {
    await app.close();
    if (organizationId) await pool.query('delete from ap.organizations where id = $1', [organizationId]);
    await authPool.query('delete from "user" where email = any($1::text[])', [[owner.email, outsider.email]]);
  }
});
