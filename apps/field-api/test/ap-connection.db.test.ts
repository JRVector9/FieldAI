import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import { deliverApConnectionRevokeOnce } from '../src/ap-connection-revoke.js';
import { deliverFactsChangeOnce, reconcileFactsChangeDeliveries } from '../src/facts-change-delivery.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
process.env.FIELD_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4321';
const issuer = 'http://127.0.0.1:4311/api/auth';
const apOrganizationId = randomUUID();
const apAgentId = randomUUID();
const apGrantId = randomUUID();
const apDeploymentId = randomUUID();
const apConversationId = randomUUID();

async function actor() {
  const email = `ap-connector-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string, body: object) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify(body),
  }));
  assert.equal((await post('/sign-up/email', { email, password, name: 'Field owner' })).status, 200);
  const signed = await post('/sign-in/email', { email, password });
  assert.equal(signed.status, 200);
  return { email, cookie: signed.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('Field BFF stores an AP owner grant after state, issuer, and scope validation', async () => {
  const owner = await actor();
  const outsider = await actor();
  let tokenCalls = 0;
  let refreshCalls = 0;
  let rejectRefresh = false;
  let rejectConversationRead = false;
  let replySpam = false;
  let replyCalls = 0;
  let revokeCalls = 0;
  let remoteRevokeDown = true;
  let revokeTarget = '';
  let revokeSecret = '';
  let bindEventKeyId = '';
  let factsChangeCalls = 0;
  let factsChangeEventId = '';
  let sentRevocationId = '';
  let apRevision = 1;
  const sourceRefreshId = randomUUID();
  let sourceRefreshCalls = 0;
  let refreshConnectionId = '';
  let expectedRefreshKey = '';
  const apReplyId = randomUUID();
  const transport = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url === 'http://127.0.0.1:4311/integrations/v1/field-events'
      && init?.method === 'POST') {
      factsChangeCalls++;
      const headers = init.headers as Record<string, string>;
      const raw = Buffer.from(init.body as Buffer);
      const event = JSON.parse(raw.toString()) as Record<string, unknown>;
      assert.equal(event.event_type, 'field.facts.changed');
      assert.equal(event.source_product, 'field');
      assert.equal(event.aggregate_type, 'facts');
      assert.equal(event.connection_id, refreshConnectionId);
      assert.equal(headers['x-event-id'], event.event_id);
      assert.equal(headers['x-key-id'], bindEventKeyId);
      assert.equal(headers['x-signature'], createHmac('sha256', Buffer.from(revokeSecret, 'base64url'))
        .update(Buffer.concat([Buffer.from(`${headers['x-timestamp']}.${event.event_id}.`), raw]))
        .digest('hex'));
      assert.doesNotMatch(raw.toString(), /010-|priceAmount|introduction|server-only-secret/);
      if (factsChangeEventId) assert.equal(event.event_id, factsChangeEventId);
      else factsChangeEventId = String(event.event_id);
      if (factsChangeCalls === 1) throw new Error('AP facts event receipt lost');
      return Response.json({ received: true }, { status: 202 });
    }
    if (url === revokeTarget && init?.method === 'POST') {
      revokeCalls += 1;
      const headers = init.headers as Record<string, string>;
      const revocationId = headers['x-revocation-id'];
      const connectionId = revokeTarget.split('/').at(-2);
      assert.ok(connectionId && revocationId);
      assert.equal(headers['x-signature'], createHmac('sha256', Buffer.from(revokeSecret, 'base64url'))
        .update(`${headers['x-timestamp']}.${revocationId}.${connectionId}.revoke`).digest('hex'));
      assert.equal(headers['x-key-id'], bindEventKeyId);
      assert.equal(sentRevocationId === '' || sentRevocationId === revocationId, true);
      sentRevocationId = revocationId;
      if (remoteRevokeDown) throw new Error('AP unavailable');
      return Response.json({ connectionId, status: 'revoked', revocationId });
    }
    if (url === `${issuer}/oauth2/token` && init?.method === 'POST') {
      const form = new URLSearchParams(String(init.body));
      if (form.get('grant_type') === 'refresh_token') {
        refreshCalls += 1;
        assert.equal(form.get('refresh_token'), 'ap-refresh-synthetic-secret');
        if (rejectRefresh) return Response.json({ error: 'invalid_grant' }, { status: 400 });
        return Response.json({ access_token: 'ap-access-rotated-secret',
          refresh_token: 'ap-refresh-rotated-secret', token_type: 'Bearer', expires_in: 600,
          scope: 'offline_access ap.agent.read ap.conversations.read ap.conversations.reply ap.sources.refresh' });
      }
      tokenCalls += 1;
      return Response.json({ access_token: 'ap-access-synthetic-secret',
        refresh_token: 'ap-refresh-synthetic-secret', token_type: 'Bearer', expires_in: 600,
        scope: 'offline_access ap.agent.read ap.conversations.read ap.conversations.reply ap.sources.refresh' });
    }
    if (url === 'http://127.0.0.1:4311/integrations/v1/me') return Response.json({
      grantId: apGrantId, organizationId: apOrganizationId, agentId: apAgentId,
      deploymentIds: [apDeploymentId], scopes: ['ap.agent.read', 'ap.conversations.read',
        'ap.conversations.reply', 'ap.sources.refresh'], state: 'active',
    });
    const refreshBase = `http://127.0.0.1:4311/integrations/v1/connections/${refreshConnectionId}`;
    if (refreshConnectionId && url === `${refreshBase}/source` && init?.method !== 'POST')
      return Response.json({ connectionId: refreshConnectionId, sourceRevision: 3,
        approvedSourceRevision: 2, state: 'pending_review' });
    if (refreshConnectionId && url === `${refreshBase}/source-refreshes` && init?.method === 'POST') {
      sourceRefreshCalls++;
      assert.equal((init.headers as Record<string, string>)['idempotency-key'], expectedRefreshKey);
      assert.deepEqual(JSON.parse(String(init.body)), { expectedSourceRevision: 3 });
      return Response.json({ operationId: sourceRefreshId, connectionId: refreshConnectionId,
        expectedSourceRevision: 3, state: 'pending', retryable: true,
        sourceRevision: null, outcome: null, error: null }, { status: 202 });
    }
    if (refreshConnectionId && url === `${refreshBase}/source-refreshes/${sourceRefreshId}`)
      return Response.json({ operationId: sourceRefreshId, connectionId: refreshConnectionId,
        expectedSourceRevision: 3, state: 'completed', retryable: false,
        sourceRevision: 4, outcome: 'updated', error: null });
    if (url === `http://127.0.0.1:4311/integrations/v1/conversations/${apConversationId}`) {
      if (rejectConversationRead) throw new Error('AP conversation timeout');
      return Response.json({ id: apConversationId, deploymentId: apDeploymentId,
        state: replySpam ? 'spam' : 'needs_owner', revision: apRevision });
    }
    if (url === `http://127.0.0.1:4311/integrations/v1/conversations/${apConversationId}/messages?after=0&limit=100`)
      return Response.json({ conversationId: apConversationId, nextAfter: apRevision === 1 ? '1' : '2',
        messages: [{ id: randomUUID(), sequence: '1', actor: 'customer', body: '방문 상담 요청',
          createdAt: new Date().toISOString() },
        ...(apRevision === 1 ? [] : [{ id: apReplyId, sequence: '2', actor: 'owner', body: '가능합니다.',
          createdAt: new Date().toISOString() }])] });
    if (url === `http://127.0.0.1:4311/integrations/v1/conversations/${apConversationId}/replies`
      && init?.method === 'POST') {
      if (replySpam) return Response.json({ error: 'conversation_spam' }, { status: 409 });
      replyCalls += 1;
      assert.equal(init.headers && (init.headers as Record<string, string>)['idempotency-key'], 'a'.repeat(32));
      assert.deepEqual(JSON.parse(String(init.body)), { body: '가능합니다.', expectedRevision: 1 });
      if (replyCalls === 1) { apRevision = 2; throw new Error('AP reply response lost'); }
      return Response.json({ messageId: apReplyId, state: 'waiting_customer', revision: 2,
        delivery: 'blocked_integration', replayed: true }, { status: 200 });
    }
    if (url === 'http://127.0.0.1:4311/integrations/v1/agent') return Response.json({
      organizationId: apOrganizationId, agentId: apAgentId, revision: 1,
      name: '승인 AP AI', knowledgeRevision: 1,
    });
    throw new Error(`Unexpected AP request ${url}`);
  };
  const runtime = {
    pool,
    resolveUserId: async (headers: import('node:http').IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    resolveSession: async (headers: import('node:http').IncomingHttpHeaders) => {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
      return session ? { id: session.session.id, userId: session.user.id } : null;
    },
    apConnector: { issuer, clientId: 'registered-ap-client', clientSecret: 'server-only-secret',
      tokenKey: randomBytes(32), redirectUri: `${base}/v1/connections/ap/callback`,
      webOrigin: 'http://localhost:3002', reverseClientId: '', fetcher: transport },
  };
  const app = createFieldApp(async () => undefined, auth.handler, base, runtime);
  const standalone = createFieldApp(async () => undefined, auth.handler, base,
    { pool, resolveUserId: runtime.resolveUserId, resolveSession: runtime.resolveSession });
  let organizationId = '';
  try {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: owner.cookie }, payload: { name: 'Field 연결 사업장' } });
    assert.equal(created.statusCode, 201);
    organizationId = created.json().id as string;
    const startUrl = '/v1/connections/ap/start';
    const payload = { organizationId };
    assert.equal((await standalone.inject({ method: 'POST', url: startUrl,
      headers: { cookie: owner.cookie }, payload })).statusCode, 503);
    assert.equal((await standalone.inject({ url: '/v1/business/draft',
      headers: { cookie: owner.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: startUrl,
      headers: { cookie: outsider.cookie }, payload })).statusCode, 404);
    const started = await app.inject({ method: 'POST', url: startUrl,
      headers: { cookie: owner.cookie }, payload });
    assert.equal(started.statusCode, 201, started.body);
    const authorize = new URL(started.json().authorizationUrl as string);
    assert.equal(authorize.origin, 'http://127.0.0.1:4311');
    assert.equal(authorize.pathname, '/api/auth/oauth2/authorize');
    assert.equal(authorize.searchParams.get('client_id'), 'registered-ap-client');
    assert.equal(authorize.searchParams.get('redirect_uri'), `${base}/v1/connections/ap/callback`);
    assert.match(authorize.searchParams.get('scope') ?? '', /offline_access/);
    assert.match(authorize.searchParams.get('scope') ?? '', /ap\.conversations\.reply/);
    assert.match(authorize.searchParams.get('scope') ?? '', /ap\.sources\.refresh/);
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
    const state = authorize.searchParams.get('state');
    assert.ok(state);
    const callback = (query: URLSearchParams) => app.inject({ url: `/v1/connections/ap/callback?${query}` });
    assert.equal((await callback(new URLSearchParams({ state: randomBytes(32).toString('base64url'),
      code: 'first-code', iss: issuer }))).statusCode, 400);
    assert.equal((await callback(new URLSearchParams({ state, code: 'first-code',
      iss: 'https://wrong-issuer.example.test' }))).statusCode, 400);
    const denied = await callback(new URLSearchParams({ state, error: 'access_denied', iss: issuer }));
    assert.equal(denied.statusCode, 303);
    assert.match(denied.headers.location ?? '', /result=denied/);
    assert.equal(tokenCalls, 0);
    assert.equal((await app.inject({ url: '/v1/connections/ap',
      headers: { cookie: owner.cookie } })).json().connections.length, 0);

    const retry = await app.inject({ method: 'POST', url: startUrl,
      headers: { cookie: owner.cookie }, payload });
    assert.equal(retry.statusCode, 201);
    const retryState = new URL(retry.json().authorizationUrl as string).searchParams.get('state');
    assert.ok(retryState);
    const completed = await callback(new URLSearchParams({ state: retryState, code: 'second-code', iss: issuer }));
    assert.equal(completed.statusCode, 303, completed.body);
    const target = new URL(completed.headers.location ?? 'http://invalid.local');
    assert.equal(target.origin, 'http://localhost:3002');
    assert.equal(target.searchParams.get('result'), 'pending_field_consent');
    assert.equal(tokenCalls, 1);
    const connectionId = target.searchParams.get('connectionId');
    assert.ok(connectionId);
    refreshConnectionId = connectionId;
    const replay = await callback(new URLSearchParams({ state: retryState, code: 'second-code', iss: issuer }));
    assert.equal(replay.statusCode, 303);
    assert.equal(replay.headers.location, completed.headers.location);
    assert.equal(tokenCalls, 1);
    const ownerView = await app.inject({ url: '/v1/connections/ap', headers: { cookie: owner.cookie } });
    assert.equal(ownerView.statusCode, 200);
    assert.equal(ownerView.json().connections[0].id, connectionId);
    assert.equal(ownerView.json().connections[0].apOrganizationId, apOrganizationId);
    assert.equal(ownerView.json().connections[0].apAgentId, apAgentId);
    assert.equal(ownerView.json().connections[0].status, 'pending_field_consent');
    assert.doesNotMatch(ownerView.body, /synthetic-secret|server-only-secret/);
    assert.equal((await app.inject({ url: '/v1/connections/ap',
      headers: { cookie: outsider.cookie } })).json().connections.length, 0);
    const stored = await pool.query<{ access_token_cipher: Buffer; refresh_token_cipher: Buffer }>(
      'select access_token_cipher, refresh_token_cipher from field.ap_connections where id = $1', [connectionId]);
    assert.ok(stored.rows[0]);
    assert.doesNotMatch(stored.rows[0].access_token_cipher.toString(), /ap-access-synthetic-secret/);
    assert.doesNotMatch(stored.rows[0].refresh_token_cipher.toString(), /ap-refresh-synthetic-secret/);
    const registration = await auth.handler(new Request(`${base}/api/auth/oauth2/create-client`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: owner.cookie },
      body: JSON.stringify({ client_name: 'AP reverse BFF',
        redirect_uris: ['http://127.0.0.1:4311/v1/connections/field/callback'],
        application_type: 'native', token_endpoint_auth_method: 'client_secret_basic',
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
        scope: 'openid offline_access field.facts.read' }),
    }));
    assert.equal(registration.status, 201, await registration.clone().text());
    const clientId = (await registration.json() as { client_id: string }).client_id;
    runtime.apConnector.reverseClientId = clientId;
    const session = await auth.api.getSession({ headers: new Headers({ cookie: owner.cookie }) });
    assert.ok(session);
    const fieldGrantId = randomUUID();
    const bearerToken = randomBytes(32).toString('base64url');
    await pool.query(`insert into field.oauth_selections(id,session_id,actor_user_id,client_id,
      organization_id,requested_scopes,selection_expires_at)
      values ($1,$2,$3,$4,$5,$6::text[],now() + interval '5 minutes')`,
    [fieldGrantId, session.session.id, session.user.id, clientId, organizationId, ['field.facts.read']]);
    await pool.query(`insert into "oauthConsent"("id","clientId","userId","referenceId","resources",
      "scopes","createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,now(),now())`,
    [randomUUID(), clientId, session.user.id, fieldGrantId,
      JSON.stringify([`${base}/integrations/v1`]), JSON.stringify(['offline_access', 'field.facts.read'])]);
    await pool.query(`insert into "oauthAccessToken"("id","token","clientId","userId","referenceId",
      "resources","scopes","expiresAt","createdAt")
      values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,now() + interval '10 minutes',now())`,
    [randomUUID(), createHash('sha256').update(bearerToken).digest('base64url'), clientId,
      session.user.id, fieldGrantId, JSON.stringify([`${base}/integrations/v1`]),
      JSON.stringify(['field.facts.read'])]);
    const bindUrl = `/integrations/v1/connections/${connectionId}/bind`;
    const bindBody = { apGrantId, apOrganizationId, apAgentId, fieldGrantId,
      eventKeyId: randomUUID(), eventSecret: randomBytes(32).toString('base64url'), routeGeneration: 1 };
    revokeTarget = `http://127.0.0.1:4311/integrations/v1/connections/${connectionId}/revoke`;
    revokeSecret = bindBody.eventSecret;
    bindEventKeyId = bindBody.eventKeyId;
    await pool.query("update field.ap_connections set access_expires_at = now() - interval '1 second' where id = $1",
      [connectionId]);
    assert.equal((await app.inject({ method: 'POST', url: bindUrl, payload: bindBody })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: bindUrl,
      headers: { authorization: `Bearer ${bearerToken}` },
      payload: { ...bindBody, apGrantId: randomUUID() } })).statusCode, 409);
    const bound = await app.inject({ method: 'POST', url: bindUrl,
      headers: { authorization: `Bearer ${bearerToken}` }, payload: bindBody });
    assert.equal(bound.statusCode, 200, bound.body);
    assert.deepEqual(bound.json(), { connectionId, status: 'review_required',
      fieldOrganizationId: organizationId, fieldGrantId });
    assert.equal(refreshCalls, 1);
    const rotated = await pool.query<{ access_token_cipher: Buffer; refresh_token_cipher: Buffer;
      access_expires_at: Date }>('select access_token_cipher, refresh_token_cipher, access_expires_at from field.ap_connections where id = $1',
    [connectionId]);
    const rotatedRow = rotated.rows[0];
    const storedRow = stored.rows[0];
    assert.ok(rotatedRow && storedRow);
    assert.ok(rotatedRow.access_expires_at.getTime() > Date.now());
    assert.notDeepEqual(rotatedRow.access_token_cipher, storedRow.access_token_cipher);
    assert.notDeepEqual(rotatedRow.refresh_token_cipher, storedRow.refresh_token_cipher);
    assert.equal((await app.inject({ method: 'POST', url: bindUrl,
      headers: { authorization: `Bearer ${bearerToken}` }, payload: bindBody })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: bindUrl,
      headers: { authorization: `Bearer ${bearerToken}` },
      payload: { ...bindBody, eventSecret: randomBytes(32).toString('base64url') } })).statusCode, 409);
    assert.equal(refreshCalls, 1);
    assert.equal((await app.inject({ url: '/v1/connections/ap',
      headers: { cookie: owner.cookie } })).json().connections[0].status, 'review_required');

    const releaseId = randomUUID();
    await pool.query(`insert into field.catalog_releases
      (id,organization_id,revision,content,content_hash,approved_by)
      values ($1,$2,1,'{}'::jsonb,$3,$4)`, [releaseId, organizationId, 'a'.repeat(64), session.user.id]);
    await pool.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
      values ($1,$2,'field.catalog.approved',$3,$4::jsonb)`, [randomUUID(), organizationId,
      releaseId, JSON.stringify({ organizationId, releaseId, revision: 1 })]);
    assert.equal(await reconcileFactsChangeDeliveries(pool), 1);
    assert.equal(await reconcileFactsChangeDeliveries(pool), 0);
    assert.equal(await deliverFactsChangeOnce(pool, runtime.apConnector!), 'retry');
    assert.equal(factsChangeCalls, 1);
    await pool.query(`update field.facts_change_deliveries set next_attempt_at = now()
      where connection_id = $1`, [connectionId]);
    assert.equal(await deliverFactsChangeOnce(pool, runtime.apConnector!), 'acked');
    assert.equal(factsChangeCalls, 2);
    assert.equal((await pool.query<{ state: string }>(
      'select state from field.facts_change_deliveries where connection_id = $1',
      [connectionId])).rows[0]?.state, 'acked');

    const sourcePath = `/v1/connections/ap/${connectionId}/source-refresh`;
    assert.equal((await app.inject({ url: sourcePath,
      headers: { cookie: outsider.cookie } })).statusCode, 404);
    const sourceState = await app.inject({ url: sourcePath, headers: { cookie: owner.cookie } });
    assert.equal(sourceState.statusCode, 200, sourceState.body);
    assert.equal(sourceState.json().sourceRevision, 3);
    const refreshKey = randomBytes(32).toString('base64url');
    expectedRefreshKey = refreshKey;
    const requestedRefresh = await app.inject({ method: 'POST', url: sourcePath,
      headers: { cookie: owner.cookie, 'idempotency-key': refreshKey },
      payload: { expectedSourceRevision: 3 } });
    assert.equal(requestedRefresh.statusCode, 202, requestedRefresh.body);
    assert.equal(requestedRefresh.json().operationId, sourceRefreshId);
    assert.equal(sourceRefreshCalls, 1);
    const refreshedState = await app.inject({ url: `${sourcePath}/${sourceRefreshId}`,
      headers: { cookie: owner.cookie } });
    assert.equal(refreshedState.statusCode, 200, refreshedState.body);
    assert.equal(refreshedState.json().state, 'completed');
    await pool.query(`update field.ap_connections set scopes = array_remove(scopes,'ap.sources.refresh')
      where id = $1`, [connectionId]);
    assert.equal((await app.inject({ url: sourcePath,
      headers: { cookie: owner.cookie } })).statusCode, 403);
    await pool.query(`update field.ap_connections set scopes = array_append(scopes,'ap.sources.refresh')
      where id = $1`, [connectionId]);

    const externalId = randomUUID();
    await pool.query(`insert into field.external_work_requests(
      id,organization_id,provider,connection_id,client_id,field_grant_id,
      action_request_id,body_hash,origin_conversation_id,source_deployment_id,
      kind,service_id,catalog_revision,policy_revision,service_snapshot,customer_snapshot,
      request_snapshot,summary,consent_record_id,consent_confirmed_at,conditions_hash,is_test,status)
      values($1,$2,'agent-platform',$3,$4,$5,$6,$7,$8,$9,'inquiry',$10,1,1,
        $11::jsonb,$12::jsonb,'{}'::jsonb,'방문 상담 요청',$13,now(),$14,true,'requested')`,
    [externalId, organizationId, connectionId, clientId, fieldGrantId, randomUUID(), 'a'.repeat(64),
      apConversationId, apDeploymentId, randomUUID(), JSON.stringify({ id: randomUUID(), name: '상담' }),
      JSON.stringify({ name: '고객', phone: '01000000000', verified: false }), randomUUID(), 'b'.repeat(64)]);
    const conversationUrl = `/v1/owner/external-requests/${externalId}/conversation`;
    const legacyReceived = await app.inject({ url: `/v1/owner/external-requests/${externalId}`,
      headers: { cookie: owner.cookie } });
    assert.equal(legacyReceived.statusCode, 200);
    assert.equal(legacyReceived.json().receivedRecord.purpose, null);
    assert.equal(legacyReceived.json().receivedRecord.retention, null);
    assert.equal(legacyReceived.json().receivedRecord.consent.items, null);
    const draftUrl = `/v1/owner/external-requests/${externalId}/reply-draft`;
    const replyUrl = `/v1/owner/external-requests/${externalId}/replies`;
    const ownerHeaders = { cookie: owner.cookie, 'x-organization-id': organizationId };
    assert.equal((await app.inject({ url: conversationUrl,
      headers: { cookie: outsider.cookie, 'x-organization-id': organizationId } })).statusCode, 404);
    const opened = await app.inject({ url: conversationUrl, headers: ownerHeaders });
    assert.equal(opened.statusCode, 200, opened.body);
    assert.equal(opened.json().conversation.id, apConversationId);
    assert.equal(opened.json().messages[0].body, '방문 상담 요청');
    rejectConversationRead = true;
    assert.equal((await app.inject({ url: conversationUrl, headers: ownerHeaders })).statusCode, 503);
    rejectConversationRead = false;
    const replyHeaders = { ...ownerHeaders, 'idempotency-key': 'a'.repeat(32) };
    await pool.query(`update field.ap_connections set scopes = array_remove(scopes,'ap.conversations.reply')
      where id = $1`, [connectionId]);
    assert.equal((await app.inject({ method: 'POST', url: replyUrl, headers: replyHeaders,
      payload: { body: '가능합니다.', expectedRevision: 1 } })).statusCode, 403);
    assert.equal(replyCalls, 0);
    await pool.query(`update field.ap_connections set scopes = array_append(scopes,'ap.conversations.reply')
      where id = $1`, [connectionId]);
    const unknownReply = await app.inject({ method: 'POST', url: replyUrl, headers: replyHeaders,
      payload: { body: '가능합니다.', expectedRevision: 1 } });
    assert.equal(unknownReply.statusCode, 503);
    assert.equal(unknownReply.json().error, 'reply_delivery_unknown');
    assert.equal((await app.inject({ url: draftUrl,
      headers: { cookie: outsider.cookie, 'x-organization-id': organizationId } })).statusCode, 404);
    const draft = await app.inject({ url: draftUrl, headers: ownerHeaders });
    assert.equal(draft.statusCode, 200, draft.body);
    assert.deepEqual(draft.json().draft, { body: '가능합니다.', expectedRevision: 1,
      state: 'delivery_unknown' });
    const storedDraft = await pool.query<{ body_cipher: Buffer }>(
      'select body_cipher from field.ap_reply_drafts where external_request_id = $1', [externalId]);
    assert.doesNotMatch(storedDraft.rows[0]!.body_cipher.toString('utf8'), /가능합니다/);
    assert.equal((await app.inject({ method: 'POST', url: replyUrl, headers: replyHeaders,
      payload: { body: '다른 내용입니다.', expectedRevision: 2 } })).statusCode, 409);
    assert.equal(replyCalls, 1);
    const resumed = createFieldApp(async () => undefined, auth.handler, base, runtime);
    const replayReply = await resumed.inject({ method: 'POST', url: replyUrl, headers: ownerHeaders,
      payload: { body: '가능합니다.', expectedRevision: 1 } });
    await resumed.close();
    assert.equal(replayReply.statusCode, 200, replayReply.body);
    assert.equal(replayReply.json().messageId, apReplyId);
    assert.equal(replayReply.json().delivery, 'blocked_integration');
    assert.equal(replyCalls, 2);
    const settled = (await app.inject({ url: draftUrl, headers: ownerHeaders })).json();
    assert.equal(settled.draft, null);
    assert.deepEqual(settled.lastAccepted, { expectedRevision: 1,
      messageId: apReplyId, delivery: 'blocked_integration' });
    const cachedReply = await app.inject({ method: 'POST', url: replyUrl, headers: ownerHeaders,
      payload: { body: '가능합니다.', expectedRevision: 1 } });
    assert.equal(cachedReply.statusCode, 200);
    assert.equal(cachedReply.json().messageId, apReplyId);
    assert.equal(replyCalls, 2);
    assert.equal((await app.inject({ method: 'POST', url: replyUrl, headers: ownerHeaders,
      payload: { body: '다른 답변', expectedRevision: 1 } })).statusCode, 409);
    assert.equal((await app.inject({ url: conversationUrl, headers: ownerHeaders })).json().messages.length, 2);
    replySpam = true;
    const rejectedSpam = await app.inject({ method: 'POST', url: replyUrl,
      headers: { ...ownerHeaders, 'idempotency-key': 'b'.repeat(32) },
      payload: { body: 'AP 스팸 중 보존할 답변 초안', expectedRevision: 2 } });
    assert.equal(rejectedSpam.statusCode, 409);
    assert.equal(rejectedSpam.json().error, 'conversation_spam');
    assert.deepEqual((await app.inject({ url: draftUrl, headers: ownerHeaders })).json().draft,
      { body: 'AP 스팸 중 보존할 답변 초안', expectedRevision: 2, state: 'revision_conflict' });
    assert.equal((await app.inject({ url: conversationUrl, headers: ownerHeaders })).json().conversation.state, 'spam');
    assert.equal(replyCalls, 2);
    replySpam = false;

    const another = await app.inject({ method: 'POST', url: startUrl,
      headers: { cookie: owner.cookie }, payload });
    assert.equal(another.statusCode, 201);
    const anotherState = new URL(another.json().authorizationUrl as string).searchParams.get('state');
    assert.ok(anotherState);
    const anotherCallback = await callback(new URLSearchParams({ state: anotherState,
      code: 'third-code', iss: issuer }));
    assert.equal(anotherCallback.statusCode, 303);
    const anotherId = new URL(anotherCallback.headers.location ?? 'http://invalid.local')
      .searchParams.get('connectionId');
    assert.ok(anotherId);
    await pool.query("update field.ap_connections set access_expires_at = now() - interval '1 second' where id = $1",
      [anotherId]);
    rejectRefresh = true;
    const failedBind = await app.inject({ method: 'POST',
      url: `/integrations/v1/connections/${anotherId}/bind`,
      headers: { authorization: `Bearer ${bearerToken}` }, payload: bindBody });
    assert.equal(failedBind.statusCode, 503);
    assert.equal((await app.inject({ url: '/v1/connections/ap',
      headers: { cookie: owner.cookie } })).json().connections[0].status, 'degraded');
    const callsBeforeReplay = refreshCalls;
    assert.equal((await app.inject({ method: 'POST',
      url: `/integrations/v1/connections/${anotherId}/bind`,
      headers: { authorization: `Bearer ${bearerToken}` }, payload: bindBody })).statusCode, 409);
    assert.equal(refreshCalls, callsBeforeReplay);
    const revokeUrl = `/v1/connections/ap/${connectionId}/revoke`;
    assert.equal((await app.inject({ method: 'POST', url: revokeUrl,
      headers: { cookie: outsider.cookie } })).statusCode, 404);
    const revokedConnection = await app.inject({ method: 'POST', url: revokeUrl,
      headers: { cookie: owner.cookie } });
    assert.equal(revokedConnection.statusCode, 200, revokedConnection.body);
    assert.equal(revokedConnection.json().localStatus, 'revoked');
    assert.equal(revokedConnection.json().remoteState, 'pending');
    assert.equal((await app.inject({ url: conversationUrl, headers: ownerHeaders })).statusCode, 409);
    assert.equal((await pool.query(`select count(*)::integer as count from field.external_work_requests
      where id = $1`, [externalId])).rows[0]?.count, 1);
    const revokedAgain = await app.inject({ method: 'POST', url: revokeUrl,
      headers: { cookie: owner.cookie } });
    assert.equal(revokedAgain.statusCode, 200);
    assert.equal(revokedAgain.json().revocationId, revokedConnection.json().revocationId);
    const listedAfterRevoke = (await app.inject({ url: '/v1/connections/ap',
      headers: { cookie: owner.cookie } })).json().connections;
    assert.equal(listedAfterRevoke.find((item: { id: string }) => item.id === connectionId).status, 'revoked');
    assert.equal(await deliverApConnectionRevokeOnce(pool, runtime.apConnector), 'retry');
    assert.equal(revokeCalls, 1);
    assert.equal((await app.inject({ url: '/v1/connections/ap',
      headers: { cookie: owner.cookie } })).json().connections
      .find((item: { id: string }) => item.id === connectionId).remoteRevokeState, 'retry');
    await pool.query(`update field.ap_connection_revocations set next_attempt_at = now()
      where connection_id = $1`, [connectionId]);
    remoteRevokeDown = false;
    assert.equal(await deliverApConnectionRevokeOnce(pool, runtime.apConnector), 'acked');
    assert.equal(revokeCalls, 2);
    assert.equal(sentRevocationId, revokedConnection.json().revocationId);
    assert.equal(await deliverApConnectionRevokeOnce(pool, runtime.apConnector), 'empty');
    assert.equal((await app.inject({ url: '/v1/connections/ap',
      headers: { cookie: owner.cookie } })).json().connections
      .find((item: { id: string }) => item.id === connectionId).remoteRevokeState, 'acked');
    const incomingRevocationId = randomUUID();
    const incomingRevokePath = `/integrations/v1/connections/${connectionId}/revoke`;
    const incomingHeaders = (at = String(Math.floor(Date.now() / 1000))) => ({
      'x-key-id': bindBody.eventKeyId, 'x-revocation-id': incomingRevocationId,
      'x-timestamp': at, 'x-signature': createHmac('sha256',
        Buffer.from(bindBody.eventSecret, 'base64url'))
        .update(`${at}.${incomingRevocationId}.${connectionId}.revoke`).digest('hex'),
    });
    assert.equal((await app.inject({ method: 'POST', url: incomingRevokePath })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: incomingRevokePath,
      headers: { ...incomingHeaders(), 'x-signature': 'a'.repeat(64) } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: incomingRevokePath,
      headers: incomingHeaders(String(Math.floor(Date.now() / 1000) - 600)) })).statusCode, 401);
    const remoteRevoked = await app.inject({ method: 'POST', url: incomingRevokePath,
      headers: incomingHeaders() });
    assert.equal(remoteRevoked.statusCode, 200, remoteRevoked.body);
    assert.deepEqual(remoteRevoked.json(), { connectionId, status: 'revoked',
      revocationId: incomingRevocationId });
    assert.equal((await app.inject({ method: 'POST', url: incomingRevokePath,
      headers: incomingHeaders() })).statusCode, 200);
  } finally {
    await Promise.all([app.close(), standalone.close()]);
    if (organizationId) await pool.query('delete from field.organizations where id = $1', [organizationId]);
    await pool.query('delete from "user" where email = any($1::text[])', [[owner.email, outsider.email]]);
  }
});
