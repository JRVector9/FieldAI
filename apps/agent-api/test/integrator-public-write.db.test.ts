import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createAgentApp as createUnobservedApp } from '../src/app.js';
import { observeContractResponses } from '../../../tools/test/integrator-contract.mjs';

// QA158: compare every emitted public success response with the pinned OpenAPI contract.
const createAgentApp: typeof createUnobservedApp = (...args) => {
  const app = createUnobservedApp(...args);
  observeContractResponses(app, 'agent');
  return app;
};

const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
const scopes = ['ap.agent.read', 'ap.connections.create', 'ap.deployments.manage'];
let verified = false;
let authPool: Pool | undefined;
const app = createAgentApp(async () => undefined, undefined, undefined, undefined, {
  pool, resolveUserId: async h => typeof h['x-fixture-actor'] === 'string' ? h['x-fixture-actor'] : null,
  resolveSession: async headers => {
    const imported = await import('../src/auth.js'); authPool = imported.authPool;
    const { fromNodeHeaders } = await import('better-auth/node');
    const session = await imported.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    return session ? { id: session.session.id, userId: session.user.id } : null;
  }, verifyDomain: async () => verified,
});
let base = '';
before(async () => {
  process.env.AP_PROFILE = 'mock';
  base = await app.listen({ host: '127.0.0.1', port: 0 });
});
after(async () => { await app.close(); await pool.end(); if (authPool) await authPool.end(); });

type Fixture = { actor: string; organizationId: string; agentId: string; grantId: string; clientId: string;
  tokenId: string; bearer: string; externalOrganizationId: string; origin: string };
async function fixture(selectedScopes = scopes): Promise<Fixture> {
  const actor = randomUUID();
  const sessionId = randomUUID(), clientId = randomUUID(), grantId = randomUUID(), tokenId = randomUUID();
  const bearer = randomBytes(32).toString('base64url');
  await pool.query(`insert into "user"(id,name,email,"emailVerified") values($1,'API owner',$2,true)`,
    [actor, `${actor}@example.invalid`]);
  await pool.query(`insert into "session"(id,"userId",token,"expiresAt","updatedAt")
    values($1,$2,$3,now()+interval '1 day',now())`, [sessionId, actor, randomUUID()]);
  const headers = { 'x-fixture-actor': actor };
  const org = await app.inject({ method: 'POST', url: '/v1/organizations', headers, payload: { name: '공개 설치 사업장' } });
  assert.equal(org.statusCode, 201, org.body);
  const organizationId = org.json().id as string;
  assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers,
    payload: { expectedRevision: 0, businessName: '공개 설치 사업장', introduction: '승인 정보', services: [], faqs: [] } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers,
    payload: { expectedRevision: 1 } })).statusCode, 201);
  const agent = await app.inject({ method: 'PUT', url: '/v1/agents/draft', headers,
    payload: { expectedRevision: 0, name: '사업 AI', tone: 'clear', guideScope: '승인 정보 안내', handoffText: '담당자가 답변합니다.' } });
  assert.equal(agent.statusCode, 200, agent.body);
  const agentId = agent.json().agentId as string;
  assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/releases', headers,
    payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } })).statusCode, 201);
  await pool.query(`insert into "oauthClient"(id,"clientId","clientSecret",name,scopes,"redirectUris","applicationType")
    values($1,$1,'synthetic-server-only','external BFF',$2,'["https://client.example.test/callback"]','web')`,
    [clientId, JSON.stringify(scopes)]);
  await pool.query(`insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,
    agent_id,requested_scopes,selection_expires_at) values($1,$2,$3,$4,$5,$6,$7,now()+interval '5 minutes')`,
    [grantId, sessionId, actor, clientId, organizationId, agentId, selectedScopes]);
  const resources = JSON.stringify([new URL('/integrations/v1', process.env.AP_AUTH_BASE_URL).toString()]);
  await pool.query(`insert into "oauthConsent"(id,"clientId","userId","referenceId",resources,scopes,"createdAt","updatedAt")
    values($1,$2,$3,$4,$5,$6,now(),now())`, [randomUUID(), clientId, actor, grantId, resources, JSON.stringify(selectedScopes)]);
  await pool.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId",resources,scopes,"expiresAt","createdAt")
    values($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes',now())`,
    [tokenId, createHash('sha256').update(bearer).digest('base64url'), clientId, actor, grantId,
      resources, JSON.stringify(selectedScopes)]);
  return { actor, organizationId, agentId, grantId, clientId, tokenId, bearer,
    externalOrganizationId: randomUUID(), origin: 'https://site.example.test' };
}
const payload = (f: Fixture) => ({ organizationId: f.organizationId, agentId: f.agentId,
  externalOrganizationId: f.externalOrganizationId, origin: f.origin });
async function request(f: Fixture, path: string, body?: object, key?: string, revision?: number) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${f.bearer}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}), ...(revision ? { 'If-Match': `"${revision}"` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() as Record<string, unknown>, etag: response.headers.get('etag') };
}
async function connection(f: Fixture) {
  const r = await request(f, '/integrations/v1/connections', payload(f), randomUUID());
  assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.id as string;
}
async function deployment(f: Fixture, connectionId: string, key = randomUUID()) {
  const r = await request(f, '/integrations/v1/deployments', { connectionId, organizationId: f.organizationId,
    agentId: f.agentId, kind: 'owned_embed', origin: f.origin }, key);
  assert.equal(r.status, 201, JSON.stringify(r.body)); return r;
}

test('public installation creation is scoped, immutable and durable across lost responses and concurrent retries', async () => {
  const f = await fixture(), key = randomUUID();
  const created = await request(f, '/integrations/v1/connections', payload(f), key);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.state, 'installation_only');
  assert.equal(created.body.agentId, f.agentId);
  const own = await request(f, `/integrations/v1/connections/${created.body.id}`);
  assert.equal(own.status, 200, JSON.stringify(own.body));
  assert.equal(own.body.id, created.body.id);
  assert.equal(created.body.retryable, false);
  assert.equal(typeof created.body.request_id, 'string');
  const replay = await request(f, '/integrations/v1/connections', payload(f), key);
  assert.equal(replay.status, 200); assert.equal(replay.body.id, created.body.id);
  const changedBody = await request(f, '/integrations/v1/connections', { ...payload(f), origin: 'https://different.example.test' }, key);
  assert.equal(changedBody.status, 409); assert.equal(changedBody.body.retryable, false);
  assert.equal((await request(f, '/integrations/v1/connections', { ...payload(f), organizationId: randomUUID() }, randomUUID())).status, 404);
  assert.equal((await request(f, '/integrations/v1/connections', { ...payload(f), agentId: randomUUID() }, randomUUID())).status, 404);
  assert.equal((await request(f, '/integrations/v1/connections', payload(f), 'not-a-uuid')).status, 400);
  assert.equal((await request(f, '/integrations/v1/connections', { ...payload(f), scope: 'field.requests.create' }, randomUUID())).status, 400);
  const simultaneousKey = randomUUID();
  const results = await Promise.all(Array.from({ length: 4 }, () => request(f, '/integrations/v1/connections', payload(f), simultaneousKey)));
  assert.equal(new Set(results.map(r => r.body.id)).size, 1);
  assert.equal(results.filter(r => r.status === 201).length, 1);
  const count = await pool.query('select count(*)::int as n from ap.public_installation_connections where selection_id=$1', [f.grantId]);
  assert.equal(count.rows[0].n, 2);
});

test('write scope, current owner, token expiry, consent, client disable and revocation are enforced over real HTTP', async () => {
  for (const scenario of ['scope', 'owner', 'expiry', 'consent', 'disabled', 'revoked', 'audience']) {
    const f = await fixture(scenario === 'scope' ? ['ap.agent.read'] : scopes);
    if (scenario === 'owner') await pool.query("update ap.memberships set role='editor' where organization_id=$1", [f.organizationId]);
    if (scenario === 'expiry') await pool.query('update "oauthAccessToken" set "expiresAt"=now()-interval \'1 minute\' where id=$1', [f.tokenId]);
    if (scenario === 'consent') await pool.query('delete from "oauthConsent" where "referenceId"=$1', [f.grantId]);
    if (scenario === 'disabled') await pool.query('update "oauthClient" set disabled=true where "clientId"=$1', [f.clientId]);
    if (scenario === 'revoked') await pool.query('update ap.oauth_selections set revoked_at=now() where id=$1', [f.grantId]);
    if (scenario === 'audience') await pool.query('update "oauthAccessToken" set resources=\'["https://field.example.test/integrations/v1"]\' where id=$1', [f.tokenId]);
    const r = await request(f, '/integrations/v1/connections', payload(f), randomUUID());
    assert.equal(r.status, scenario === 'scope' ? 403 : 401, scenario);
    assert.equal(r.body.state, 'rejected', scenario);
    assert.equal(typeof r.body.request_id, 'string', scenario);
    assert.equal((await pool.query('select count(*)::int n from ap.public_installation_connections where selection_id=$1', [f.grantId])).rows[0].n, 0);
  }
});

test('owned embed stays pending until proof and explicit activation, revisions and operation replay preserve safety', async () => {
  const f = await fixture(), cid = await connection(f);
  const creationKey = randomUUID();
  const created = await deployment(f, cid, creationKey), did = created.body.id as string;
  const creationReplay = await request(f, '/integrations/v1/deployments', {
    connectionId: cid, organizationId: f.organizationId, agentId: f.agentId,
    kind: 'owned_embed', origin: f.origin }, creationKey);
  assert.equal(creationReplay.status, 200, JSON.stringify(creationReplay.body));
  assert.equal(creationReplay.body.id, did);
  assert.equal(created.body.state, 'pending'); assert.equal(created.body.revision, 1);
  assert.equal(created.etag, '"1"');
  assert.equal((await request(f, `/integrations/v1/deployments/${did}/activate`, {}, randomUUID(), 1)).status, 409);
  assert.equal((await request(f, `/integrations/v1/deployments/${did}/verify`, {}, randomUUID())).status, 428);
  verified = false;
  assert.equal((await request(f, `/integrations/v1/deployments/${did}/verify`, {}, randomUUID(), 1)).status, 409);
  verified = true;
  const proof = await request(f, `/integrations/v1/deployments/${did}/verify`, {}, randomUUID(), 1);
  assert.equal(proof.status, 200); assert.equal(proof.body.revision, 2);
  const activationKey = randomUUID();
  const active = await request(f, `/integrations/v1/deployments/${did}/activate`, {}, activationKey, 2);
  assert.equal(active.status, 200); assert.equal(active.body.state, 'active'); assert.equal(active.body.revision, 3);
  const replay = await request(f, `/integrations/v1/deployments/${did}/activate`, {}, activationKey, 2);
  assert.equal(replay.status, 200); assert.equal(replay.body.revision, 3);
  const staleRevision = await request(f, `/integrations/v1/deployments/${did}/pause`, {}, randomUUID(), 2);
  assert.equal(staleRevision.status, 409); assert.equal(staleRevision.body.retryable, false);
  const paused = await request(f, `/integrations/v1/deployments/${did}/pause`, {}, randomUUID(), 3);
  assert.equal(paused.status, 200); assert.equal(paused.body.state, 'paused');
  const selected = await pool.query('select allowed_deployment_ids from ap.oauth_selections where id=$1', [f.grantId]);
  assert.deepEqual(selected.rows[0].allowed_deployment_ids, []);
  const discovered = await request(f, '/integrations/v1/deployments');
  assert.deepEqual(discovered.body.deployments, []);
  const events = await pool.query("select event_type from ap.outbox where aggregate_id=$1 and event_type='integration.deployment.activated'", [did]);
  assert.equal(events.rowCount, 1);
});

test('another client, grant, organization, origin and native deployment cannot be written through installation manage', async () => {
  const f = await fixture(), other = await fixture();
  const cid = await connection(f), dep = await deployment(f, cid), did = dep.body.id as string;
  assert.equal((await request(other, `/integrations/v1/connections/${cid}`)).status, 404);
  assert.equal((await request(other, `/integrations/v1/deployments/${did}`)).status, 404);
  assert.equal((await request(other, `/integrations/v1/deployments/${did}/pause`, {}, randomUUID(), 1)).status, 404);
  assert.equal((await request(f, '/integrations/v1/deployments', { connectionId: cid, organizationId: f.organizationId,
    agentId: f.agentId, kind: 'owned_embed', origin: 'https://other.example.test' }, randomUUID())).status, 404);
  const native = randomUUID();
  await pool.query("insert into ap.deployments(id,organization_id,public_id,kind,created_by) values($1,$2,$3,'link',$4)",
    [native, f.organizationId, `dep_${randomBytes(24).toString('base64url')}`, f.actor]);
  assert.equal((await request(f, `/integrations/v1/deployments/${native}/pause`, {}, randomUUID(), 1)).status, 404);
  await pool.query('update ap.oauth_selections set revoked_at=now() where id=$1', [f.grantId]);
  assert.equal((await request(f, `/integrations/v1/deployments/${did}/activate`, {}, randomUUID(), 1)).status, 401);
  assert.equal((await pool.query('select status from ap.deployments where id=$1', [did])).rows[0].status, 'paused');
});

test('native changes advance public revision and paid expiry blocks new installation but keeps cleanup pause', async () => {
  const f = await fixture(), cid = await connection(f), dep = await deployment(f, cid), did = dep.body.id as string;
  await pool.query("update ap.deployments set status='paused' where id=$1", [did]);
  const changed = await request(f, `/integrations/v1/deployments/${did}`);
  assert.equal(changed.body.revision, 2);
  assert.equal((await request(f, `/integrations/v1/deployments/${did}/verify`, {}, randomUUID(), 1)).status, 409);
  await pool.query(`insert into ap.trial_subscriptions(id,organization_id,started_at,ends_at,consent_version,started_by)
    values($3,$1,now()-interval '15 days',now()-interval '1 day','mock-trial-v1',$2)`, [f.organizationId, f.actor, randomUUID()]);
  assert.equal((await request(f, '/integrations/v1/connections', payload(f), randomUUID())).status, 403);
  const paused = await request(f, `/integrations/v1/deployments/${did}/pause`, {}, randomUUID(), 2);
  assert.equal(paused.status, 200);
});

test('existing native selection revoke pauses only new public installation deployments and prevents late activation', async () => {
  const f = await fixture(), cid = await connection(f), dep = await deployment(f, cid), did = dep.body.id as string;
  verified = true;
  await request(f, `/integrations/v1/deployments/${did}/verify`, {}, randomUUID(), 1);
  assert.equal((await request(f, `/integrations/v1/deployments/${did}/activate`, {}, randomUUID(), 2)).status, 200);
  const native = randomUUID();
  const approved = await pool.query('select id,knowledge_revision from ap.agent_releases where organization_id=$1', [f.organizationId]);
  await pool.query(`insert into ap.deployments(id,organization_id,public_id,kind,created_by,status,agent_release_id,knowledge_revision)
    values($1,$2,$3,'link',$4,'active',$5,$6)`, [native, f.organizationId, `dep_${randomBytes(24).toString('base64url')}`,
    f.actor, approved.rows[0].id, approved.rows[0].knowledge_revision]);
  await pool.query('update ap.oauth_selections set revoked_at=now() where id=$1', [f.grantId]);
  assert.equal((await pool.query('select status from ap.deployments where id=$1', [did])).rows[0].status, 'paused');
  assert.equal((await pool.query('select status from ap.deployments where id=$1', [native])).rows[0].status, 'active');
  await assert.rejects(pool.query("update ap.deployments set status='active' where id=$1", [did]),
    (e: unknown) => typeof e === 'object' && e !== null && 'code' in e && e.code === '23514');
  assert.equal((await pool.query('select count(*)::int n from ap.public_installation_connections where id=$1', [cid])).rows[0].n, 1);
});


test('new public write scopes require actual registered client, owner selection, PKCE code and explicit OAuth consent', async () => {
  const imported = await import('../src/auth.js'); authPool = imported.authPool;
  const auth = imported.auth, authBase = process.env.AP_AUTH_BASE_URL! + '/api/auth';
  const f = await fixture();
  const email = `public-write-${randomUUID()}@example.invalid`, password = randomBytes(20).toString('base64url')+'A1!';
  const signedUp = await auth.handler(new Request(`${authBase}/sign-up/email`, { method: 'POST',
    headers: { 'content-type': 'application/json', origin: new URL(authBase).origin },
    body: JSON.stringify({ email, password, name: '공개 설치 실제 인가 사업자' }) }));
  assert.equal(signedUp.status, 200, await signedUp.clone().text());
  const actor = (await signedUp.json() as { user: { id: string } }).user.id;
  const signedIn = await auth.handler(new Request(`${authBase}/sign-in/email`, { method: 'POST',
    headers: { 'content-type': 'application/json', origin: new URL(authBase).origin },
    body: JSON.stringify({ email, password }) }));
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  await pool.query("insert into ap.memberships(organization_id,user_id,role) values($1,$2,'owner')", [f.organizationId, actor]);
  const registeredResponse = await auth.handler(new Request(`${authBase}/oauth2/create-client`, { method: 'POST',
    headers: { cookie, origin: new URL(authBase).origin, 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: '일반 외부 설치 BFF', redirect_uris: ['https://external.example.test/callback'],
      application_type: 'web', token_endpoint_auth_method: 'client_secret_basic', grant_types: ['authorization_code'],
      response_types: ['code'], scope: 'openid '+scopes.join(' ') }) }));
  assert.equal(registeredResponse.status, 201, await registeredResponse.clone().text());
  const registered = await registeredResponse.json() as { client_id: string; client_secret: string };
  const selected = await app.inject({ method: 'POST', url: '/integrations/v1/authorization/selections', headers: { cookie },
    payload: { clientId: registered.client_id, organizationId: f.organizationId, agentId: f.agentId, deploymentIds: [], scopes } });
  assert.equal(selected.statusCode, 201, selected.body);
  const verifier = randomBytes(32).toString('base64url');
  const query = new URLSearchParams({ response_type: 'code', client_id: registered.client_id,
    redirect_uri: 'https://external.example.test/callback', scope: 'openid '+scopes.join(' '), state: randomUUID(),
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    resource: new URL('/integrations/v1', process.env.AP_AUTH_BASE_URL).toString() });
  const authorization = await auth.handler(new Request(`${authBase}/oauth2/authorize?${query}`, { headers: { cookie } }));
  assert.equal(authorization.status, 302);
  const location = new URL(authorization.headers.get('location')!, authBase);
  assert.equal(location.pathname, '/consent');
  const consent = await auth.handler(new Request(`${authBase}/oauth2/consent`, { method: 'POST',
    headers: { cookie, origin: new URL(authBase).origin, 'content-type': 'application/json' },
    body: JSON.stringify({ accept: true, oauth_query: location.searchParams.toString() }) }));
  assert.equal(consent.status, 200, await consent.clone().text());
  const callback = new URL((await consent.json() as { url: string }).url);
  const exchange = await auth.handler(new Request(`${authBase}/oauth2/token`, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(registered.client_id+':'+registered.client_secret).toString('base64')}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: registered.client_id,
      redirect_uri: 'https://external.example.test/callback', code: callback.searchParams.get('code')!, code_verifier: verifier }) }));
  assert.equal(exchange.status, 200, await exchange.clone().text());
  const token = await exchange.json() as { access_token: string; scope: string };
  assert.ok(token.scope.includes('ap.connections.create') && token.scope.includes('ap.deployments.manage'));
  const result = await request({ ...f, bearer: token.access_token }, '/integrations/v1/connections', payload(f), randomUUID());
  assert.equal(result.status, 201, JSON.stringify(result.body));
});
