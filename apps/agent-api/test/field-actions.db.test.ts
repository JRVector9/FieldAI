import assert from 'node:assert/strict';
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import sharp from 'sharp';
import { agentRevocationJournalFromEnvironment } from '../src/revocation-journal.js';
import { createAgentApp } from '../src/app.js';
import { processFieldEventInboxOnce } from '../src/field-event-inbox.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4311';
const issuer = 'http://127.0.0.1:4321/api/auth';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => JSON.stringify(value,
  (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry);
const bodyHash = (value: unknown) => digest(canonical(value));
function seal(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]);
}

test('AP customer approves current Field terms once and reconciles an unknown delivery', async () => {
  const email = `field-action-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const authPost = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'AP owner' }),
  }));
  assert.equal((await authPost('/sign-up/email')).status, 200);
  const signed = await authPost('/sign-in/email');
  assert.equal(signed.status, 200);
  const ownerCookie = signed.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const ownerSession = await auth.api.getSession({ headers: new Headers({ cookie: ownerCookie }) });
  assert.ok(ownerSession);
  const tokenKey = randomBytes(32);
  const fieldOrganizationId = randomUUID();
  const fieldServiceId = randomUUID();
  const fieldGrantId = randomUUID();
  const connectionId = randomUUID();
  const unavailableConnectionId = randomUUID();
  const unavailableFieldGrantId = randomUUID();
  const unavailableFieldOrganizationId = randomUUID();
  const reauthorizationConnectionId = randomUUID();
  const eventKeyId = randomUUID();
  const eventSecret = randomBytes(32);
  const service = { id: fieldServiceId, name: 'Field 방문 상담', description: '방문 상담 설명',
    bookingMode: 'request', durationMinutes: 30, priceAmount: 25000 };
  let requestCalls = 0;
  let unknown = false;
  let failBeforeCommit = false;
  let fieldTrialEnded = false;
  let meUnavailable = false;
  let handoffCalls = 0;
  const acceptedBySource = new Map<string, { externalRequestId: string; reservationId: string }>();
  const reservationEvents = new Map<string, Array<Record<string, unknown>>>();
  const photos = new Map<string, Buffer>();
  let eventsUnavailable = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const unavailable = new Headers(init?.headers).get('authorization') === 'Bearer synthetic-unavailable';
    if (url.pathname === '/integrations/v1/me' && meUnavailable && !unavailable)
      return Response.json({ error: 'temporary_unavailable' }, { status: 503 });
    if (url.pathname === '/integrations/v1/me') return Response.json({
      grantId: unavailable ? unavailableFieldGrantId : fieldGrantId,
      organizationId: unavailable ? unavailableFieldOrganizationId : fieldOrganizationId,
      scopes: ['field.facts.read', 'field.availability.read', 'field.requests.create',
        'field.requests.read', 'field.customer_access.create'], state: 'active' });
    if (url.pathname === '/integrations/v1/facts') return unavailable
      ? Response.json({ error: 'field_facts_unavailable' }, { status: 503 }) : Response.json({
      organizationId: fieldOrganizationId, businessName: 'Field 검수 사업장',
      services: [service], revision: 2,
    });
    if (url.pathname === '/integrations/v1/availability') return Response.json({
      organizationId: fieldOrganizationId, catalogRevision: 2, policyRevision: 1,
      timezone: 'Asia/Seoul', service, date: null, slots: [],
    });
    if (url.pathname === '/integrations/v1/external-requests' && init?.method === 'POST') {
      requestCalls++;
      const body = JSON.parse(String(init.body)) as { actionRequestId: string;
        originConversationId: string; consent: { items: string[]; recipientOrganizationId: string } };
      assert.equal(init.headers && 'x-body-sha256' in init.headers
        ? init.headers['x-body-sha256'] : null, bodyHash(body));
      assert.equal(body.consent.recipientOrganizationId, fieldOrganizationId);
      assert.deepEqual(body.consent.items, ['name', 'phone', 'service', 'requested_time',
        ...((body as { attachmentRefs?: string[] }).attachmentRefs?.length ? ['attachments'] : [])]);
      if (fieldTrialEnded) return Response.json({ error: 'trial_ended', accessMode: 'cleanup_only' }, { status: 403 });
      if (failBeforeCommit) throw new Error('request_lost_before_field_commit');
      const ids = { externalRequestId: randomUUID(), reservationId: randomUUID() };
      acceptedBySource.set(body.actionRequestId, ids);
      reservationEvents.set(body.actionRequestId, [{ eventId: randomUUID(), revision: 0,
        eventType: 'field.reservation.requested', state: 'requested',
        occurredAt: new Date().toISOString(), customerNotificationOwnerProduct: 'ap', routeGeneration: 1 }]);
      if (unknown) throw new Error('response_lost_after_field_commit');
      return Response.json({ ...ids, status: 'requested', version: 1,
        requestId: body.actionRequestId, retryable: false }, { status: 201 });
    }
    if (url.pathname.endsWith('/events')) {
      if (eventsUnavailable) return Response.json({ error: 'field_unavailable' }, { status: 503 });
      const actionId = url.pathname.split('/').at(-2)!;
      const ids = acceptedBySource.get(actionId);
      const events = reservationEvents.get(actionId);
      return ids && events ? Response.json({ actionRequestId: actionId,
        externalRequestId: ids.externalRequestId, connectionId, organizationId: fieldOrganizationId,
        reservationId: ids.reservationId,
        state: events.at(-1)?.state, revision: events.at(-1)?.revision, events })
        : Response.json({ error: 'external_request_not_found' }, { status: 404 });
    }
    if (url.pathname.startsWith('/integrations/v1/external-requests/by-source/')) {
      const actionId = url.pathname.split('/').at(-1)!;
      const ids = acceptedBySource.get(actionId);
      return ids ? Response.json({ ...ids, status: 'requested', version: 1,
        requestId: actionId, retryable: false })
        : Response.json({ error: 'external_request_not_found' }, { status: 404 });
    }
    if (url.pathname === '/integrations/v1/customer-handoffs' && init?.method === 'POST') {
      handoffCalls++;
      const body = JSON.parse(String(init.body)) as { connectionId: string; actionRequestId: string;
        externalRequestId: string; reservationId: string };
      assert.equal(body.connectionId, connectionId);
      assert.deepEqual({ externalRequestId: body.externalRequestId, reservationId: body.reservationId },
        acceptedBySource.get(body.actionRequestId));
      return Response.json({ code: randomBytes(32).toString('base64url'),
        handoffUrl: 'http://localhost:3002/handoff', reservationId: body.reservationId,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() }, { status: 201 });
    }
    throw new Error(`Unexpected Field request ${url.pathname}`);
  };
  const runtime = { pool, revocationJournal: agentRevocationJournalFromEnvironment(), resolveUserId: async (headers: import('node:http').IncomingHttpHeaders) =>
    (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  fieldConnector: { issuer, clientId: 'synthetic-field-client', clientSecret: 'synthetic-secret',
    tokenKey, redirectUri: `${base}/v1/connections/field/callback`,
    webOrigin: 'http://localhost:3001', fetcher },
  modelProvider: { model: 'synthetic', generate: async () => ({ output: { answer: '안내합니다.',
    evidenceIds: [], unknowns: [], handoffRecommended: false },
  inputTokens: 1, outputTokens: 1, responseId: randomUUID() }) }, customerDailyLimit: 10,
  inquiryMedia: { put: async (key: string, data: Buffer) => { photos.set(key, data); },
    get: async (key: string) => photos.get(key) ?? null,
    delete: async (key: string) => { photos.delete(key); } } };
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, runtime);
  let organizationId = '';
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: ownerCookie }, payload: { name: 'AP Field 요청 검수' } });
    assert.equal(organization.statusCode, 201, organization.body);
    organizationId = organization.json().id as string;
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft',
      headers: { cookie: ownerCookie }, payload: { expectedRevision: 0,
        businessName: 'AP Field 요청 검수', introduction: 'AP 직접 소개', services: [], faqs: [] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases',
      headers: { cookie: ownerCookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/agents/draft',
      headers: { cookie: ownerCookie }, payload: { expectedRevision: 0, name: '상담 AI',
        tone: 'clear', guideScope: '', handoffText: '담당자가 확인합니다.' } })).statusCode, 200);
    const agent = await app.inject({ method: 'POST', url: '/v1/agents/releases',
      headers: { cookie: ownerCookie }, payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } });
    assert.equal(agent.statusCode, 201, agent.body);
    const link = await app.inject({ method: 'POST', url: '/v1/deployments',
      headers: { cookie: ownerCookie }, payload: { kind: 'link' } });
    assert.equal(link.statusCode, 201, link.body);
    const deploymentId = link.json().id as string;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${deploymentId}/activate`,
      headers: { cookie: ownerCookie } })).statusCode, 200);
    const registered = await auth.handler(new Request(`${base}/api/auth/oauth2/create-client`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: ownerCookie },
      body: JSON.stringify({ client_name: 'Field action synthetic client',
        redirect_uris: ['http://127.0.0.1:4399/callback'], application_type: 'native',
        token_endpoint_auth_method: 'client_secret_basic', grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'], scope: 'openid offline_access ap.agent.read ap.conversations.read' }),
    }));
    assert.equal(registered.status, 201, await registered.clone().text());
    const clientId = (await registered.json() as { client_id: string }).client_id;
    const apGrantId = randomUUID();
    const agentId = (await pool.query<{ agent_id: string }>(
      'select agent_id from ap.agent_releases where id = $1', [agent.json().releaseId])).rows[0]?.agent_id;
    assert.ok(agentId);
    await pool.query(`insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,
      organization_id,agent_id,allowed_deployment_ids,requested_scopes,selection_expires_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,now() + interval '5 minutes')`,
    [apGrantId, ownerSession.session.id, ownerSession.user.id, clientId,
      organizationId, agentId, [deploymentId], ['ap.agent.read', 'ap.conversations.read']]);
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
    const eventReadToken = randomBytes(32).toString('base64url');
    await pool.query(`insert into "oauthAccessToken"("id","token","clientId","userId",
      "referenceId","resources","scopes","expiresAt","createdAt")
      values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,now() + interval '1 hour',now())`,
    [randomUUID(), createHash('sha256').update(eventReadToken).digest('base64url'), clientId,
      ownerSession.user.id, apGrantId, JSON.stringify([`${base}/integrations/v1`]),
      JSON.stringify(['ap.agent.read', 'ap.conversations.read'])]);
    const eventReadHeaders = { authorization: `Bearer ${eventReadToken}` };
    await pool.query(`insert into ap.field_connections(id,ap_grant_id,ap_organization_id,ap_agent_id,
      initiator_user_id,field_issuer,field_client_id,field_grant_id,field_organization_id,
      scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now() + interval '1 hour','review_required')`,
    [connectionId, apGrantId, organizationId, agentId, ownerSession.user.id, issuer,
      runtime.fieldConnector.clientId, fieldGrantId, fieldOrganizationId,
      ['field.facts.read', 'field.availability.read', 'field.requests.create', 'field.requests.read',
        'field.customer_access.create'],
      seal('synthetic-access', tokenKey), seal('synthetic-refresh', tokenKey)]);
    await pool.query(`update ap.field_connections
      set event_key_id = $2, event_secret_cipher = $3, route_generation = 1 where id = $1`,
    [connectionId, eventKeyId, seal(eventSecret.toString('base64url'),
      createHash('sha256').update(tokenKey).update('ap-field-event-route-v1').digest())]);
    await pool.query(`insert into ap.field_connections(id,ap_grant_id,ap_organization_id,ap_agent_id,
      initiator_user_id,field_issuer,field_client_id,field_grant_id,field_organization_id,
      scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now() + interval '1 hour','review_required')`,
    [unavailableConnectionId, apGrantId, organizationId, agentId, ownerSession.user.id, issuer,
      runtime.fieldConnector.clientId, unavailableFieldGrantId, unavailableFieldOrganizationId,
      ['field.facts.read', 'field.availability.read'],
      seal('synthetic-unavailable', tokenKey), seal('synthetic-refresh', tokenKey)]);
    await pool.query(`insert into ap.field_connections(id,ap_grant_id,ap_organization_id,ap_agent_id,
      initiator_user_id,field_issuer,field_client_id,field_grant_id,field_organization_id,
      scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now() + interval '1 hour','review_required')`,
    [reauthorizationConnectionId, apGrantId, organizationId, agentId, ownerSession.user.id, issuer,
      runtime.fieldConnector.clientId, randomUUID(), randomUUID(), [],
      seal('synthetic-reauthorization', tokenKey), seal('synthetic-refresh', tokenKey)]);
    const connectedMetrics = await app.inject({ url: '/v1/distribution/metrics',
      headers: { cookie: ownerCookie } });
    assert.equal(connectedMetrics.statusCode, 200);
    assert.equal(connectedMetrics.json().bookingConfirmed, 'available');
    assert.equal(connectedMetrics.json().periods[0].bookings, 'under_5');
    const started = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${link.json().publicId}/engagements` });
    assert.equal(started.statusCode, 201, started.body);
    const inquiryId = started.json().id as string;
    const consultCookie = started.headers['set-cookie']?.toString().split(';')[0];
    const receiptKey = randomBytes(32).toString('base64url');
    const submission = await app.inject({ method: 'POST', url: `/v1/conversations/${inquiryId}/submissions`,
      headers: { cookie: consultCookie, 'idempotency-key': randomBytes(32).toString('base64url'),
        'x-receipt-key': receiptKey }, payload: { name: '전달 고객', phone: '010-2222-3333',
        message: 'Field 예약 요청', consent: true } });
    assert.equal(submission.statusCode, 201, submission.body);
    const bearer = { authorization: `Bearer ${receiptKey}` };
    const original = await app.inject({ url: `/v1/inquiries/${inquiryId}`, headers: bearer });
    assert.equal(original.statusCode, 200, original.body);
    const messageId = original.json().messages[0].id as string;
    const image = await sharp({ create: { width: 2, height: 2, channels: 3,
      background: '#3388cc' } }).png().toBuffer();
    const uploaded = await app.inject({ method: 'POST',
      url: `/v1/inquiries/${inquiryId}/messages/${messageId}/attachments`,
      headers: { ...bearer, 'content-type': 'application/octet-stream' }, payload: image });
    assert.equal(uploaded.statusCode, 201, uploaded.body);
    const selectedPhotoId = uploaded.json().id as string;
    const discovery = await app.inject({ url: `/v1/inquiries/${inquiryId}/field-services`, headers: bearer });
    assert.equal(discovery.statusCode, 200, discovery.body);
    const listedConnections = discovery.json().connections as Array<{
      connectionId: string; state: string; services: Array<{ id: string }> }>;
    assert.equal(listedConnections.length, 3);
    assert.deepEqual(listedConnections.find(item => item.connectionId === connectionId)?.services,
      [{ id: fieldServiceId, name: service.name, description: service.description,
        bookingMode: service.bookingMode }]);
    assert.equal(listedConnections.find(item => item.connectionId === connectionId)?.state, 'available');
    assert.deepEqual(listedConnections.find(item => item.connectionId === unavailableConnectionId),
      { connectionId: unavailableConnectionId, state: 'field_facts_unavailable', services: [] });
    assert.deepEqual(listedConnections.find(item => item.connectionId === reauthorizationConnectionId),
      { connectionId: reauthorizationConnectionId,
        state: 'field_reauthorization_required', services: [] });
    meUnavailable = true;
    const failedProbe = await app.inject({ url: `/v1/inquiries/${inquiryId}/field-services`, headers: bearer });
    assert.equal(failedProbe.statusCode, 200, failedProbe.body);
    assert.deepEqual((failedProbe.json().connections as Array<{ connectionId: string; state: string;
      services: unknown[] }>).find(item => item.connectionId === connectionId),
    { connectionId, state: 'field_grant_unknown', services: [] });
    assert.equal((await pool.query<{ status: string }>(
      'select status from ap.field_connections where id = $1', [connectionId])).rows[0]?.status,
    'review_required');
    meUnavailable = false;
    const restoredProbe = await app.inject({ url: `/v1/inquiries/${inquiryId}/field-services`, headers: bearer });
    assert.equal(restoredProbe.statusCode, 200, restoredProbe.body);
    assert.equal((restoredProbe.json().connections as Array<{ connectionId: string; state: string }> )
      .find(item => item.connectionId === connectionId)?.state, 'available');
    assert.equal((await app.inject({ url: `/v1/inquiries/${inquiryId}/field-services`,
      headers: { authorization: `Bearer ${randomBytes(32).toString('base64url')}` } })).statusCode, 401);
    assert.equal((await app.inject({
      url: `/v1/inquiries/${inquiryId}/field-connections/${reauthorizationConnectionId}`
        + `/services/${fieldServiceId}/availability`, headers: bearer,
    })).statusCode, 403);
    assert.equal((await app.inject({
      url: `/v1/inquiries/${inquiryId}/field-connections/${unavailableConnectionId}`
        + `/services/${fieldServiceId}/availability`, headers: bearer,
    })).statusCode, 502);
    const rawAvailability = await app.inject({
      url: `/v1/inquiries/${inquiryId}/field-connections/${connectionId}/services/${fieldServiceId}/availability`,
      headers: bearer });
    assert.equal(rawAvailability.statusCode, 200, rawAvailability.body);
    assert.equal(rawAvailability.json().service.priceAmount, 25000);
    const availabilityPath = `/v1/inquiries/${inquiryId}/field-availability`;
    const requested = { mode: 'preferred', preferredTimeText: '다음 주 오전', timezone: 'Asia/Seoul' };
    const previewBody = { connectionId, serviceId: fieldServiceId, request: requested };
    assert.equal((await app.inject({ method: 'POST', url: availabilityPath,
      payload: previewBody })).statusCode, 401);
    const preview = await app.inject({ method: 'POST', url: availabilityPath,
      headers: bearer, payload: previewBody });
    assert.equal(preview.statusCode, 200, preview.body);
    assert.equal(preview.json().service.priceAmount, 25000);
    assert.deepEqual(preview.json().customer, { name: '전달 고객', phone: '010-2222-3333' });
    assert.match(preview.json().conditionsHash, /^[a-f0-9]{64}$/);
    const actionPath = `/v1/inquiries/${inquiryId}/field-actions`;
    const actionBody = { ...previewBody, kind: 'reservation_request', summary: '방문 예약 요청',
      expectedServiceRevision: preview.json().catalogRevision,
      expectedPolicyRevision: preview.json().policyRevision,
      conditionsHash: preview.json().conditionsHash, consent: true };
    const actionHeaders = { ...bearer, 'idempotency-key': randomBytes(32).toString('base64url') };
    assert.equal((await app.inject({ method: 'POST', url: actionPath,
      headers: actionHeaders, payload: { ...actionBody, consent: false } })).statusCode, 400);
    service.priceAmount = 30000;
    const changedBeforeSubmit = await app.inject({ method: 'POST', url: actionPath,
      headers: actionHeaders, payload: actionBody });
    assert.equal(changedBeforeSubmit.statusCode, 409, changedBeforeSubmit.body);
    assert.equal(changedBeforeSubmit.json().error, 'service_conditions_changed');
    assert.equal(requestCalls, 0);
    const revisedPreview = await app.inject({ method: 'POST', url: availabilityPath,
      headers: bearer, payload: previewBody });
    assert.equal(revisedPreview.statusCode, 200, revisedPreview.body);
    assert.equal(revisedPreview.json().service.priceAmount, 30000);
    assert.notEqual(revisedPreview.json().conditionsHash, preview.json().conditionsHash);
    service.priceAmount = 25000;
    const accepted = await app.inject({ method: 'POST', url: actionPath,
      headers: actionHeaders, payload: actionBody });
    assert.equal(accepted.statusCode, 201, accepted.body);
    assert.equal(accepted.json().state, 'accepted_external');
    assert.equal(requestCalls, 1);
    const requestedEvent = reservationEvents.get(accepted.json().actionRequestId)![0]!;
    const webhookEvent = { spec_version: '1.0', event_id: String(requestedEvent.eventId),
      event_type: 'field.reservation.requested', source_product: 'field', connection_id: connectionId,
      aggregate_type: 'reservation', aggregate_id: accepted.json().reservationId,
      aggregate_version: 0, occurred_at: requestedEvent.occurredAt,
      correlation_id: accepted.json().actionRequestId, notification_owner_product: 'ap',
      route_generation: 1, data: { resource_id: accepted.json().reservationId, status: 'requested' } };
    const webhookPath = '/integrations/v1/field-events';
    const webhookRaw = JSON.stringify(webhookEvent);
    const webhookHeaders = (raw: string, timestamp = String(Math.floor(Date.now() / 1000))) => ({
      'content-type': 'application/vnd.field-event+json', 'x-event-id': webhookEvent.event_id,
      'x-key-id': eventKeyId, 'x-timestamp': timestamp,
      'x-signature': createHmac('sha256', eventSecret)
        .update(Buffer.concat([Buffer.from(`${timestamp}.${webhookEvent.event_id}.`), Buffer.from(raw)]))
        .digest('hex') });
    assert.equal((await app.inject({ method: 'POST', url: webhookPath,
      headers: { 'content-type': 'application/vnd.field-event+json' }, payload: webhookRaw })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: webhookPath,
      headers: webhookHeaders(webhookRaw, String(Math.floor(Date.now() / 1000) - 600)),
      payload: webhookRaw })).statusCode, 401);
    const signed = await app.inject({ method: 'POST', url: webhookPath,
      headers: webhookHeaders(webhookRaw), payload: webhookRaw });
    assert.equal(signed.statusCode, 202, signed.body);
    assert.equal((await app.inject({ method: 'POST', url: webhookPath,
      headers: webhookHeaders(webhookRaw), payload: webhookRaw })).statusCode, 202);
    const tampered = JSON.stringify({ ...webhookEvent, data: { ...webhookEvent.data, status: 'confirmed' } });
    assert.equal((await app.inject({ method: 'POST', url: webhookPath,
      headers: webhookHeaders(tampered), payload: tampered })).statusCode, 409);
    assert.equal((await pool.query<{ count: string }>(
      `select count(*)::text as count from ap.field_event_inbox
       where source_event_id = $1`, [webhookEvent.event_id])).rows[0]?.count, '1');
    const deliveryPath = (eventId: string) => `/integrations/v1/events/${eventId}/delivery`;
    assert.equal((await app.inject({ url: deliveryPath(webhookEvent.event_id) })).statusCode, 401);
    const receivedDelivery = await app.inject({ url: deliveryPath(webhookEvent.event_id),
      headers: eventReadHeaders });
    assert.equal(receivedDelivery.statusCode, 200, receivedDelivery.body);
    assert.equal(receivedDelivery.json().receiptState, 'received');
    assert.equal(receivedDelivery.json().processingState, 'received');
    assert.equal(receivedDelivery.json().customerNotificationState, 'not_created');
    assert.equal((await app.inject({ url: deliveryPath(randomUUID()),
      headers: eventReadHeaders })).statusCode, 404);
    assert.equal(await processFieldEventInboxOnce(pool), 'processed');
    assert.equal(await processFieldEventInboxOnce(pool), 'empty');
    const processedDelivery = await app.inject({ url: deliveryPath(webhookEvent.event_id),
      headers: eventReadHeaders });
    assert.equal(processedDelivery.statusCode, 200, processedDelivery.body);
    assert.equal(processedDelivery.json().processingState, 'processed');
    assert.equal(processedDelivery.json().customerNotificationState, 'not_applicable');
    assert.equal(processedDelivery.json().customerReadState, 'not_recorded');
    await pool.query(`update ap.oauth_selections set allowed_deployment_ids = '{}'::uuid[]
      where id = $1`, [apGrantId]);
    assert.equal((await app.inject({ url: deliveryPath(webhookEvent.event_id),
      headers: eventReadHeaders })).statusCode, 404);
    await pool.query(`update ap.oauth_selections set allowed_deployment_ids = array[$2::uuid]
      where id = $1`, [apGrantId, deploymentId]);
    const syncPath = `${actionPath}/${accepted.json().actionRequestId}/sync-events`;
    assert.equal((await app.inject({ method: 'POST', url: syncPath })).statusCode, 401);
    const firstSync = await app.inject({ method: 'POST', url: syncPath, headers: bearer });
    assert.equal(firstSync.statusCode, 200, firstSync.body);
    assert.equal(firstSync.json().revision, 0);
    assert.equal(firstSync.json().events.length, 1);
    assert.equal(firstSync.json().events[0].notificationState, 'not_applicable');
    const confirmedEvent = { eventId: randomUUID(), revision: 1,
      eventType: 'field.reservation.confirmed', state: 'confirmed',
      occurredAt: new Date().toISOString(), customerNotificationOwnerProduct: 'ap', routeGeneration: 1,
      startAt: new Date(Date.now() + 86_400_000).toISOString(),
      endAt: new Date(Date.now() + 88_200_000).toISOString() };
    reservationEvents.get(accepted.json().actionRequestId)!.push(confirmedEvent);
    eventsUnavailable = true;
    assert.equal((await app.inject({ method: 'POST', url: syncPath, headers: bearer })).statusCode, 503);
    eventsUnavailable = false;
    const spamRevision = (await app.inject({ url: `/v1/owner/inquiries/${inquiryId}`,
      headers: { cookie: ownerCookie } })).json().revision as number;
    const spammed = await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${inquiryId}/spam`,
      headers: { cookie: ownerCookie }, payload: { expectedRevision: spamRevision, spam: true } });
    assert.equal(spammed.statusCode, 200, spammed.body);
    const confirmedSync = await app.inject({ method: 'POST', url: syncPath, headers: bearer });
    assert.equal(confirmedSync.statusCode, 200, confirmedSync.body);
    assert.equal(confirmedSync.json().revision, 1);
    assert.equal(confirmedSync.json().events[1].notificationState, 'not_applicable');
    const suppressed = await pool.query<{ suppression_reason: string }>(
      `select n.suppression_reason from ap.notification_events n
       join ap.field_reservation_events e on e.id = n.field_reservation_event_id
       where e.action_request_id = $1`, [accepted.json().actionRequestId]);
    assert.equal(suppressed.rows[0]?.suppression_reason, 'spam');
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${inquiryId}/spam`,
      headers: { cookie: ownerCookie }, payload: { expectedRevision: spammed.json().revision, spam: false } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: syncPath, headers: bearer })).statusCode, 200);
    const mirrored = await pool.query<{ count: string }>(
      'select count(*)::text as count from ap.field_reservation_events where action_request_id = $1',
      [accepted.json().actionRequestId]);
    assert.equal(mirrored.rows[0]?.count, '2');
    const customerNotices = await pool.query<{ count: string }>(
      `select count(*)::text as count from ap.notification_events n
       join ap.field_reservation_events e on e.id = n.field_reservation_event_id
       where e.action_request_id = $1 and n.audience = 'customer'`,
      [accepted.json().actionRequestId]);
    assert.equal(customerNotices.rows[0]?.count, '1');
    assert.doesNotMatch(JSON.stringify(confirmedSync.json()), /010-2222-3333|전달 고객/);
    const validEvents = [...reservationEvents.get(accepted.json().actionRequestId)!];
    reservationEvents.set(accepted.json().actionRequestId, [validEvents[0]!,
      { ...confirmedEvent, revision: 2 }]);
    assert.equal((await app.inject({ method: 'POST', url: syncPath, headers: bearer })).statusCode, 502);
    reservationEvents.set(accepted.json().actionRequestId,
      [validEvents[0]!, { ...confirmedEvent, eventId: randomUUID() }]);
    assert.equal((await app.inject({ method: 'POST', url: syncPath, headers: bearer })).statusCode, 409);
    reservationEvents.set(accepted.json().actionRequestId,
      [validEvents[0]!, { ...confirmedEvent, startAt: new Date(Date.now() + 172_800_000).toISOString() }]);
    assert.equal((await app.inject({ method: 'POST', url: syncPath, headers: bearer })).statusCode, 409);
    reservationEvents.set(accepted.json().actionRequestId, validEvents);
    const handoffPath = `${actionPath}/${accepted.json().actionRequestId}/handoff`;
    assert.equal((await app.inject({ method: 'POST', url: handoffPath })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST',
      url: `${actionPath}/${randomUUID()}/handoff`, headers: bearer })).statusCode, 404);
    const handoff = await app.inject({ method: 'POST', url: handoffPath, headers: bearer });
    assert.equal(handoff.statusCode, 201, handoff.body);
    assert.match(handoff.json().code, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(handoff.json().reservationId, accepted.json().reservationId);
    assert.equal(handoff.json().handoffUrl, 'http://localhost:3002/handoff');
    assert.equal(handoffCalls, 1);
    await pool.query("update ap.field_connections set status = 'degraded' where id = $1", [connectionId]);
    assert.equal((await app.inject({ method: 'POST', url: webhookPath,
      headers: webhookHeaders(webhookRaw), payload: webhookRaw })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: handoffPath, headers: bearer })).statusCode, 404);
    await pool.query("update ap.field_connections set status = 'review_required' where id = $1", [connectionId]);
    const repeated = await app.inject({ method: 'POST', url: actionPath,
      headers: actionHeaders, payload: actionBody });
    assert.equal(repeated.statusCode, 200, repeated.body);
    assert.equal(repeated.json().actionRequestId, accepted.json().actionRequestId);
    assert.equal(requestCalls, 1);
    assert.equal((await app.inject({ method: 'POST', url: actionPath,
      headers: actionHeaders, payload: { ...actionBody, summary: '다른 내용' } })).statusCode, 409);
    const saved = await pool.query<{ state: string; external_request_id: string; reservation_id: string }>(
      'select state,external_request_id,reservation_id from ap.field_action_requests where id = $1',
      [accepted.json().actionRequestId]);
    assert.equal(saved.rows[0]?.state, 'accepted_external');
    assert.ok(saved.rows[0]?.external_request_id);
    const actionEvents = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
      'select event_type,payload from ap.outbox where aggregate_id = $1 order by occurred_at',
      [accepted.json().actionRequestId]);
    assert.deepEqual(actionEvents.rows.map(row => row.event_type),
      ['ap.field_action.sending', 'ap.field_action.accepted_external',
        'ap.field_reservation.event_recorded', 'ap.field_reservation.event_recorded']);
    assert.doesNotMatch(JSON.stringify(actionEvents.rows), /010-2222-3333|전달 고객/);
    const listed = await app.inject({ url: actionPath, headers: bearer });
    assert.equal(listed.statusCode, 200, listed.body);
    assert.equal(listed.json().actions[0].actionRequestId, accepted.json().actionRequestId);
    unknown = true;
    const unknownAction = await app.inject({ method: 'POST', url: actionPath,
      headers: { ...bearer, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { ...actionBody, summary: '두 번째 예약 요청' } });
    assert.equal(unknownAction.statusCode, 202, unknownAction.body);
    assert.equal(unknownAction.json().state, 'delivery_unknown');
    const duplicateDuringUnknown = await app.inject({ method: 'POST', url: actionPath,
      headers: { ...bearer, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { ...actionBody, summary: '세 번째 예약 요청' } });
    assert.equal(duplicateDuringUnknown.statusCode, 409, duplicateDuringUnknown.body);
    assert.equal(requestCalls, 2);
    const resolved = await app.inject({ method: 'POST',
      url: `${actionPath}/${unknownAction.json().actionRequestId}/reconcile`, headers: bearer });
    assert.equal(resolved.statusCode, 200, resolved.body);
    assert.equal(resolved.json().state, 'accepted_external');
    assert.equal(requestCalls, 2);
    const unknownId = unknownAction.json().actionRequestId as string;
    const secondReservationId = resolved.json().reservationId as string;
    const secondRequested = reservationEvents.get(unknownId)![0]!;
    const secondConfirmed = { eventId: randomUUID(), revision: 1,
      eventType: 'field.reservation.confirmed', state: 'confirmed',
      occurredAt: new Date().toISOString(), customerNotificationOwnerProduct: 'ap',
      routeGeneration: 1 };
    reservationEvents.get(unknownId)!.push(secondConfirmed);
    const sendEvent = async (source: Record<string, unknown>) => {
      const envelope = { spec_version: '1.0', event_id: source.eventId,
        event_type: source.eventType, source_product: 'field', connection_id: connectionId,
        aggregate_type: 'reservation', aggregate_id: secondReservationId,
        aggregate_version: source.revision, occurred_at: source.occurredAt,
        correlation_id: unknownId, notification_owner_product: 'ap', route_generation: 1,
        data: { resource_id: secondReservationId, status: source.state } };
      const raw = JSON.stringify(envelope);
      const timestamp = String(Math.floor(Date.now() / 1000));
      return app.inject({ method: 'POST', url: webhookPath, payload: raw,
        headers: { 'content-type': 'application/vnd.field-event+json',
          'x-event-id': String(source.eventId), 'x-key-id': eventKeyId, 'x-timestamp': timestamp,
          'x-signature': createHmac('sha256', eventSecret)
            .update(Buffer.concat([Buffer.from(`${timestamp}.${source.eventId}.`), Buffer.from(raw)]))
            .digest('hex') } });
    };
    assert.equal((await sendEvent(secondConfirmed)).statusCode, 202);
    assert.equal(await processFieldEventInboxOnce(pool), 'deferred');
    assert.equal((await sendEvent(secondRequested)).statusCode, 202);
    assert.equal(await processFieldEventInboxOnce(pool), 'processed');
    await pool.query(`update ap.field_event_inbox set next_attempt_at = now()
      where source_event_id = $1`, [secondConfirmed.eventId]);
    assert.equal(await processFieldEventInboxOnce(pool), 'processed');
    assert.equal((await sendEvent(secondConfirmed)).statusCode, 202);
    assert.equal(await processFieldEventInboxOnce(pool), 'empty');
    const secondMirrored = await pool.query<{ count: string }>(
      `select count(*)::text as count from ap.field_reservation_events
       where action_request_id = $1`, [unknownId]);
    assert.equal(secondMirrored.rows[0]?.count, '2');
    const secondNotices = await pool.query<{ count: string }>(
      `select count(*)::text as count from ap.notification_events n
       join ap.field_reservation_events e on e.id = n.field_reservation_event_id
       where e.action_request_id = $1 and n.audience = 'customer'`, [unknownId]);
    assert.equal(secondNotices.rows[0]?.count, '1');
    const confirmedDelivery = await app.inject({ url: deliveryPath(secondConfirmed.eventId),
      headers: eventReadHeaders });
    assert.equal(confirmedDelivery.statusCode, 200, confirmedDelivery.body);
    assert.equal(confirmedDelivery.json().processingState, 'processed');
    assert.equal(confirmedDelivery.json().customerNotificationState, 'blocked_integration');
    failBeforeCommit = true;
    const unsent = await app.inject({ method: 'POST', url: actionPath,
      headers: { ...bearer, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { ...actionBody, summary: '다시 보내야 할 요청' } });
    assert.equal(unsent.statusCode, 202, unsent.body);
    const unsentId = unsent.json().actionRequestId as string;
    assert.equal(acceptedBySource.has(unsentId), false);
    failBeforeCommit = false;
    unknown = false;
    const resent = await app.inject({ method: 'POST',
      url: `${actionPath}/${unsentId}/reconcile`, headers: bearer });
    assert.equal(resent.statusCode, 200, resent.body);
    assert.equal(resent.json().state, 'accepted_external');
    assert.equal(resent.json().actionRequestId, unsentId);
    assert.equal(requestCalls, 4);
    const selectedPath = `/integrations/v1/action-requests/${accepted.json().actionRequestId}`
      + `/attachments/${selectedPhotoId}`;
    assert.equal((await app.inject({ url: selectedPath })).statusCode, 401);
    assert.equal((await app.inject({ url: selectedPath, headers: eventReadHeaders })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: actionPath,
      headers: { ...bearer, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { ...actionBody, attachmentIds: [selectedPhotoId, selectedPhotoId] } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: actionPath,
      headers: { ...bearer, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { ...actionBody, attachmentIds: [randomUUID()] } })).statusCode, 404);
    const photoAction = await app.inject({ method: 'POST', url: actionPath,
      headers: { ...bearer, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { ...actionBody, summary: '선택한 사진 전달', attachmentIds: [selectedPhotoId] } });
    assert.equal(photoAction.statusCode, 201, photoAction.body);
    const photoPath = `/integrations/v1/action-requests/${photoAction.json().actionRequestId}`
      + `/attachments/${selectedPhotoId}`;
    const bytes = await app.inject({ url: photoPath, headers: eventReadHeaders });
    assert.equal(bytes.statusCode, 200, bytes.body);
    assert.equal(bytes.headers['content-type'], 'image/webp');
    assert.equal(bytes.headers['cache-control'], 'private, no-store');
    assert.equal(bytes.headers['x-content-type-options'], 'nosniff');
    assert.ok(bytes.rawPayload.length > 0);
    assert.equal((await app.inject({ url: photoPath.replace(selectedPhotoId, randomUUID()),
      headers: eventReadHeaders })).statusCode, 404);
    fieldTrialEnded = true;
    const ended = await app.inject({ method: 'POST', url: actionPath,
      headers: { ...bearer, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { ...actionBody, summary: 'Field 체험 만료 후 신규 요청' } });
    assert.equal(ended.statusCode, 409, ended.body);
    assert.equal(ended.json().state, 'rejected');
    assert.equal(ended.json().error, 'field_subscription_ended');
    fieldTrialEnded = false;
    await pool.query(`insert into ap.trial_subscriptions
      (id,organization_id,consent_version,started_by,started_at,ends_at)
      values ($1,$2,'mock-trial-v1',$3,now()-interval '16 days',now()-interval '2 days')`,
    [randomUUID(), organizationId, ownerSession.user.id]);
    const apEnded = await app.inject({ method: 'POST', url: actionPath,
      headers: { ...bearer, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { ...actionBody, summary: 'AP 체험 만료 후 신규 요청' } });
    assert.equal(apEnded.statusCode, 403, apEnded.body);
    assert.equal(apEnded.json().error, 'trial_ended');
    await pool.query('delete from ap.trial_subscriptions where organization_id=$1', [organizationId]);
    const receivedBeforeRevoke = { eventId: randomUUID(), revision: 2,
      eventType: 'field.reservation.changed', state: 'confirmed',
      occurredAt: new Date().toISOString(), customerNotificationOwnerProduct: 'ap',
      routeGeneration: 1 };
    assert.equal((await sendEvent(receivedBeforeRevoke)).statusCode, 202);
    assert.equal((await pool.query<{ state: string }>(
      `select state from ap.field_event_inbox where source_event_id = $1`,
      [receivedBeforeRevoke.eventId])).rows[0]?.state, 'received');
    const raceDb = await pool.connect();
    let racedStatus = 0;
    try {
      await raceDb.query('begin');
      await raceDb.query(`select id from ap.field_connections where id = $1 for update`, [connectionId]);
      const raced = sendEvent({ ...receivedBeforeRevoke, eventId: randomUUID(), revision: 3 });
      await new Promise(resolve => setTimeout(resolve, 40));
      await raceDb.query(`update ap.field_connections set status = 'revoked' where id = $1`, [connectionId]);
      await raceDb.query('commit');
      racedStatus = (await raced).statusCode;
    } finally {
      await raceDb.query('rollback');
      raceDb.release();
      // A committed revocation is permanent; the signed retry below uses the same revoked connection.
    }
    assert.equal(racedStatus, 401, 'revoke must win before an in-flight event is accepted');
    const revocationId = randomUUID();
    const revocationPath = `/integrations/v1/connections/${connectionId}/revoke`;
    const revocationHeaders = (at = String(Math.floor(Date.now() / 1000))) => ({
      'x-key-id': eventKeyId, 'x-revocation-id': revocationId, 'x-timestamp': at,
      'x-signature': createHmac('sha256', eventSecret)
        .update(`${at}.${revocationId}.${connectionId}.revoke`).digest('hex'),
    });
    assert.equal((await app.inject({ method: 'POST', url: revocationPath })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: revocationPath,
      headers: { ...revocationHeaders(), 'x-signature': 'a'.repeat(64) } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: revocationPath,
      headers: revocationHeaders(String(Math.floor(Date.now() / 1000) - 600)) })).statusCode, 401);
    const revoked = await app.inject({ method: 'POST', url: revocationPath,
      headers: revocationHeaders() });
    assert.equal(revoked.statusCode, 200, revoked.body);
    assert.equal((await app.inject({ url: photoPath, headers: eventReadHeaders })).statusCode, 401);
    assert.deepEqual(revoked.json(), { connectionId, status: 'revoked', revocationId });
    assert.equal((await app.inject({ method: 'POST', url: revocationPath,
      headers: revocationHeaders() })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: webhookPath,
      headers: webhookHeaders(webhookRaw), payload: webhookRaw })).statusCode, 401);
    assert.equal((await sendEvent({ ...receivedBeforeRevoke, eventId: randomUUID(), revision: 3 })).statusCode, 401);
    assert.equal(await processFieldEventInboxOnce(pool), 'processed');
    assert.equal((await pool.query<{ state: string }>(
      `select state from ap.field_event_inbox where source_event_id = $1`,
      [receivedBeforeRevoke.eventId])).rows[0]?.state, 'processed');
    assert.equal((await pool.query<{ count: string }>(`select count(*)::text as count
      from ap.inquiries where id = $1`, [inquiryId])).rows[0]?.count, '1');
    assert.equal((await app.inject({ url: deliveryPath(webhookEvent.event_id),
      headers: eventReadHeaders })).statusCode, 401);
    const recoveryPath = (eventId: string) => `/integrations/v1/events/${eventId}/recovery-status`;
    const recoveryHeaders = (eventId: string, at = String(Math.floor(Date.now() / 1000))) => ({
      'x-key-id': eventKeyId, 'x-connection-id': connectionId, 'x-timestamp': at,
      'x-signature': createHmac('sha256', eventSecret)
        .update(`${at}.${eventId}.${connectionId}.notification-status`).digest('hex'),
    });
    assert.equal((await app.inject({ url: recoveryPath(webhookEvent.event_id) })).statusCode, 401);
    assert.equal((await app.inject({ url: recoveryPath(webhookEvent.event_id),
      headers: { ...recoveryHeaders(webhookEvent.event_id), 'x-signature': 'a'.repeat(64) } })).statusCode, 401);
    assert.equal((await app.inject({ url: recoveryPath(webhookEvent.event_id),
      headers: recoveryHeaders(webhookEvent.event_id,
        String(Math.floor(Date.now() / 1000) - 600)) })).statusCode, 401);
    assert.equal((await app.inject({ url: recoveryPath(webhookEvent.event_id),
      headers: { ...recoveryHeaders(webhookEvent.event_id), 'x-connection-id': randomUUID() } })).statusCode, 401);
    assert.equal((await app.inject({ url: recoveryPath(randomUUID()),
      headers: recoveryHeaders(randomUUID()) })).statusCode, 401);
    const unknownEventId = randomUUID();
    assert.equal((await app.inject({ url: recoveryPath(unknownEventId),
      headers: recoveryHeaders(unknownEventId) })).statusCode, 404);
    const recovery = await app.inject({ url: recoveryPath(webhookEvent.event_id),
      headers: recoveryHeaders(webhookEvent.event_id) });
    assert.equal(recovery.statusCode, 200, recovery.body);
    assert.equal(recovery.json().eventId, webhookEvent.event_id);
    assert.equal(recovery.json().connectionId, connectionId);
    assert.equal(recovery.json().processingState, 'processed');
    assert.equal(recovery.json().customerNotificationState, 'not_applicable');
    assert.doesNotMatch(recovery.body, /010-2222-3333|전달 고객|방문 예약 요청/);
    const transferId = randomUUID();
    const closePath = '/integrations/v1/notification-routes/close';
    const closeBody = { transferId, connectionId, actionRequestId: accepted.json().actionRequestId,
      reservationId: accepted.json().reservationId, latestRevision: 1,
      latestEventId: confirmedEvent.eventId, routeGeneration: 2 };
    const closeHeaders = (body: typeof closeBody, at = String(Math.floor(Date.now() / 1000))) => ({
      'x-key-id': eventKeyId, 'x-timestamp': at,
      'x-signature': createHmac('sha256', eventSecret)
        .update(`${at}.${body.transferId}.${body.connectionId}.${body.actionRequestId}`
          + `.${body.reservationId}.${body.latestRevision}.${body.latestEventId}.route-close`)
        .digest('hex'),
    });
    assert.equal((await app.inject({ method: 'POST', url: closePath, payload: closeBody })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: closePath, payload: closeBody,
      headers: { ...closeHeaders(closeBody), 'x-signature': 'a'.repeat(64) } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: closePath, payload: closeBody,
      headers: closeHeaders(closeBody, String(Math.floor(Date.now() / 1000) - 600)) })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: closePath,
      payload: { ...closeBody, latestRevision: 2 }, headers: closeHeaders(closeBody) })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: closePath,
      payload: { ...closeBody, latestEventId: randomUUID() },
      headers: closeHeaders({ ...closeBody, latestEventId: randomUUID() }) })).statusCode, 401);
    await pool.query(`update ap.field_event_inbox set state = 'pending_gap'
      where source_event_id = $1`, [webhookEvent.event_id]);
    assert.equal((await app.inject({ method: 'POST', url: closePath, payload: closeBody,
      headers: closeHeaders(closeBody) })).statusCode, 409);
    await pool.query(`update ap.field_event_inbox set state = 'processed'
      where source_event_id = $1`, [webhookEvent.event_id]);
    const laterInboxId = randomUUID();
    await pool.query(`insert into ap.field_event_inbox
      (id,source_product,source_event_id,connection_id,action_request_id,
       reservation_id,revision,event_type,reservation_state,occurred_at,
       route_generation,body_hash,state)
      values ($1,'field',$2,$3,$4,$5,2,'field.reservation.changed',
        'confirmed',now(),1,$6,'received')`,
    [randomUUID(), laterInboxId, connectionId, closeBody.actionRequestId,
      closeBody.reservationId, digest(laterInboxId)]);
    assert.equal((await app.inject({ method: 'POST', url: closePath,
      payload: closeBody, headers: closeHeaders(closeBody) })).statusCode, 409);
    await pool.query(`delete from ap.field_event_inbox where source_event_id = $1`, [laterInboxId]);
    const closed = await app.inject({ method: 'POST', url: closePath,
      payload: closeBody, headers: closeHeaders(closeBody) });
    assert.equal(closed.statusCode, 200, closed.body);
    assert.deepEqual({ transferId: closed.json().transferId,
      connectionId: closed.json().connectionId,
      reservationId: closed.json().reservationId,
      latestRevision: closed.json().latestRevision,
      latestEventId: closed.json().latestEventId,
      routeGeneration: closed.json().routeGeneration },
    { transferId, connectionId, reservationId: closeBody.reservationId,
      latestRevision: 1, latestEventId: confirmedEvent.eventId, routeGeneration: 2 });
    assert.equal((await app.inject({ method: 'POST', url: closePath,
      payload: closeBody, headers: closeHeaders(closeBody) })).json().closedAt, closed.json().closedAt);
    const otherClose = { ...closeBody, transferId: randomUUID() };
    assert.equal((await app.inject({ method: 'POST', url: closePath,
      payload: otherClose, headers: closeHeaders(otherClose) })).statusCode, 409);
    const lateEventId = randomUUID();
    await pool.query(`insert into ap.field_event_inbox
      (id,source_product,source_event_id,connection_id,action_request_id,
       reservation_id,revision,event_type,reservation_state,occurred_at,
       route_generation,body_hash,state)
      values ($1,'field',$2,$3,$4,$5,2,'field.reservation.changed',
        'confirmed',now(),1,$6,'received')`,
    [randomUUID(), lateEventId, connectionId, closeBody.actionRequestId,
      closeBody.reservationId, digest(lateEventId)]);
    assert.equal(await processFieldEventInboxOnce(pool), 'rejected');
    assert.equal((await pool.query<{ error_code: string }>(
      `select error_code from ap.field_event_inbox where source_event_id = $1`,
      [lateEventId])).rows[0]?.error_code, 'route_closed');
    assert.equal((await pool.query<{ count: string }>(
      `select count(*)::text as count from ap.field_reservation_events
       where action_request_id = $1`, [closeBody.actionRequestId])).rows[0]?.count, '2');
    assert.equal((await pool.query<{ count: string }>(`select count(*)::text as count
      from ap.field_notification_route_closures where reservation_id = $1`,
    [closeBody.reservationId])).rows[0]?.count, '1');
  } finally {
    await app.close();
    if (organizationId) await pool.query('delete from ap.trial_subscriptions where organization_id=$1', [organizationId]);
    await pool.query('delete from ap.field_notification_route_closures where connection_id = $1', [connectionId]);
    if (organizationId) await pool.query('delete from ap.organizations where id = $1', [organizationId]);
    await pool.query('delete from "user" where email = $1', [email]);
  }
});
