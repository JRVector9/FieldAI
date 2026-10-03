import assert from 'node:assert/strict';
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { agentRevocationJournalFromEnvironment } from '../src/revocation-journal.js';
import { createAgentApp } from '../src/app.js';
import { deliverFieldAgentEventOnce, purgeAckedFieldAgentEvents } from '../src/field-webhook-sender.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4311';
const issuer = 'http://127.0.0.1:4321/api/auth';
const allScopes = ['field.facts.read', 'field.availability.read', 'field.requests.create',
  'field.requests.read', 'field.customer_access.create', 'field.proposals.respond',
  'field.notification_route.read'];
function seal(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]);
}
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Field 계약(apEventHmac·AgentEventEnvelope)대로 다시 구현한 수신 검증. Field 코드를 import하지 않는다.
function verifyAgentEvent(headers: Headers, raw: Buffer, keyId: string, secret: Buffer) {
  const timestamp = headers.get('x-timestamp') ?? '';
  const eventId = headers.get('x-event-id') ?? '';
  const signature = headers.get('x-signature') ?? '';
  if (headers.get('content-type') !== 'application/vnd.agent-event+json'
    || headers.get('x-key-id') !== keyId || !/^\d{10}$/.test(timestamp)
    || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const expected = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.${eventId}.`), raw])).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null;
  const body = object(JSON.parse(raw.toString('utf8')));
  const data = object(body?.data);
  const keys = ['spec_version', 'event_id', 'event_type', 'source_product', 'connection_id',
    'aggregate_type', 'aggregate_id', 'aggregate_version', 'occurred_at', 'correlation_id', 'data'];
  if (!body || !data || Object.keys(body).some(key => !keys.includes(key))
    || Object.keys(data).some(key => key !== 'resource_id' && key !== 'status')
    || body.spec_version !== '1.0' || body.source_product !== 'agent_platform'
    || body.event_type !== 'agent.action.delivery_updated' || body.aggregate_type !== 'action'
    || body.event_id !== eventId || !uuid.test(String(body.connection_id))
    || !uuid.test(String(body.aggregate_id)) || !uuid.test(String(body.correlation_id))
    || !Number.isSafeInteger(body.aggregate_version) || Number(body.aggregate_version) < 1
    || !Number.isFinite(Date.parse(String(body.occurred_at))) || data.resource_id !== body.aggregate_id
    || typeof data.status !== 'string' || data.status.length < 1 || data.status.length > 80) return null;
  return body;
}

test('AP customer reads Field proposals, decides once per key, honours notification route and signs Field events', async () => {
  const email = `field-decision-${randomUUID()}@example.invalid`;
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
  const eventKeyId = randomUUID();
  const eventSecret = randomBytes(32);
  const service = { id: fieldServiceId, name: 'Field 방문 상담', description: '방문 상담 설명',
    bookingMode: 'request', durationMinutes: 30, priceAmount: 25000 };
  const proposalStart = new Date(Date.now() + 86_400_000);
  const proposalEnd = new Date(proposalStart.getTime() + 1_800_000);
  // Field 쪽 모의 상태
  let external: { actionRequestId: string; externalRequestId: string; reservationId: string;
    originConversationId: string } | null = null;
  const reservation = { state: 'proposed', revision: 3,
    proposal: { revision: 3, startAt: proposalStart.toISOString(), endAt: proposalEnd.toISOString(),
      state: 'awaiting_customer' as 'awaiting_customer' | 'customer_accepted' } as {
      revision: number; startAt: string; endAt: string; state: string } | null };
  let readMode: 'ok' | 401 | 403 | 404 | 503 | 'throw' = 'ok';
  let readCalls = 0;
  let decisionMode: 'ok' | 'lose_after_commit' | 'throw' | 404 = 'ok';
  const decisionBodies: Record<string, unknown>[] = [];
  const storedDecisions = new Map<string, { body: string; result: Record<string, unknown> }>();
  let routeMode: 'ap' | 'field' | 503 = 'ap';
  let routeCalls = 0;
  const events: Array<Record<string, unknown>> = [];
  let webhookMode: 'ok' | 401 | 503 = 'ok';
  const webhookBodies: Buffer[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/integrations/v1/me') return Response.json({ grantId: fieldGrantId,
      organizationId: fieldOrganizationId, scopes: allScopes, state: 'active' });
    if (url.pathname === '/integrations/v1/availability') return Response.json({
      organizationId: fieldOrganizationId, catalogRevision: 2, policyRevision: 1,
      timezone: 'Asia/Seoul', service, date: null, slots: [] });
    if (url.pathname === '/integrations/v1/external-requests' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { actionRequestId: string; originConversationId: string };
      external = { actionRequestId: body.actionRequestId, externalRequestId: randomUUID(),
        reservationId: randomUUID(), originConversationId: body.originConversationId };
      events.push({ eventId: randomUUID(), revision: 0, eventType: 'field.reservation.requested',
        state: 'requested', occurredAt: new Date().toISOString(),
        customerNotificationOwnerProduct: 'ap', routeGeneration: 1 });
      return Response.json({ externalRequestId: external.externalRequestId,
        reservationId: external.reservationId, status: 'requested', version: 1,
        requestId: body.actionRequestId, retryable: false }, { status: 201 });
    }
    if (url.pathname.endsWith('/events') && external) return Response.json({
      actionRequestId: external.actionRequestId, externalRequestId: external.externalRequestId,
      connectionId, organizationId: fieldOrganizationId, reservationId: external.reservationId,
      state: events.at(-1)?.state, revision: events.at(-1)?.revision, events });
    if (external && url.pathname === `/integrations/v1/external-requests/${external.externalRequestId}`) {
      readCalls++;
      if (readMode === 'throw') throw new Error('field_read_timeout');
      if (readMode !== 'ok') return Response.json({ error: 'synthetic' }, { status: readMode });
      return Response.json({ externalRequestId: external.externalRequestId,
        actionRequestId: external.actionRequestId, connectionId, organizationId: fieldOrganizationId,
        kind: 'reservation_request', status: 'requested', reservationId: external.reservationId,
        state: reservation.state, revision: reservation.revision, proposal: reservation.proposal,
        receivedAt: new Date().toISOString() });
    }
    if (external && url.pathname.endsWith('/notification-route')) {
      routeCalls++;
      if (routeMode === 503) return Response.json({ error: 'unavailable' }, { status: 503 });
      return Response.json({ externalRequestId: external.externalRequestId,
        reservationId: external.reservationId, owner: routeMode,
        generation: routeMode === 'field' ? 2 : 1, allowed: routeMode === 'ap',
        reason: routeMode === 'field' ? 'field_route_active' : 'ap_route_generation_1' });
    }
    if (external && url.pathname.endsWith('/customer-decisions') && init?.method === 'POST') {
      const raw = String(init.body);
      const body = JSON.parse(raw) as { decision: string; proposalRevision: number;
        idempotencyKey: string; customerProof: { recordId: string; confirmedAt: string;
          originConversationId: string } };
      decisionBodies.push(body);
      // 저장 전 실패: 네트워크 단절(throw)·Field가 저장 전에 거절(404)
      if (decisionMode === 'throw') throw new Error('field_decision_timeout_before_store');
      if (decisionMode === 404) return Response.json({ error: 'external_reservation_not_found' }, { status: 404 });
      const prior = storedDecisions.get(body.idempotencyKey);
      if (prior) return prior.body === raw ? Response.json(prior.result)
        : Response.json({ error: 'idempotency_conflict' }, { status: 409 });
      if (body.customerProof.originConversationId !== external.originConversationId)
        return Response.json({ error: 'customer_proof_mismatch' }, { status: 409 });
      if (!['proposed', 'change_proposed'].includes(reservation.state)
        || reservation.revision !== body.proposalRevision)
        return Response.json({ error: 'proposal_mismatch' }, { status: 409 });
      reservation.revision++;
      reservation.state = body.decision === 'accept' ? 'customer_accepted' : 'canceled';
      reservation.proposal = body.decision === 'accept' ? { ...reservation.proposal!, state: 'customer_accepted' } : null;
      const result = { decisionId: randomUUID(), externalRequestId: external.externalRequestId,
        reservationId: external.reservationId, decision: body.decision,
        proposalRevision: body.proposalRevision, state: reservation.state,
        revision: reservation.revision, retryable: false };
      storedDecisions.set(body.idempotencyKey, { body: raw, result });
      if (decisionMode === 'lose_after_commit') throw new Error('response_lost_after_field_commit');
      return Response.json(result, { status: 201 });
    }
    if (url.pathname === '/integrations/v1/webhooks/agent' && init?.method === 'POST') {
      const raw = Buffer.from(init.body as Uint8Array);
      const verified = verifyAgentEvent(new Headers(init.headers), raw, eventKeyId, eventSecret);
      if (!verified) return Response.json({ error: 'invalid_event_signature' }, { status: 401 });
      webhookBodies.push(raw);
      // 401: 서명은 맞지만 Field 시계 오차로 거절된 경우를 흉내 낸다
      if (webhookMode === 401) return Response.json({ error: 'invalid_event_signature' }, { status: 401 });
      if (webhookMode === 503) return Response.json({ error: 'event_route_unavailable' }, { status: 503 });
      return Response.json({ received: true }, { status: 202 });
    }
    throw new Error(`Unexpected Field request ${url.pathname}`);
  };
  const runtime = { pool, revocationJournal: agentRevocationJournalFromEnvironment(),
    resolveUserId: async (headers: import('node:http').IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    fieldConnector: { issuer, clientId: 'synthetic-field-client', clientSecret: 'synthetic-secret',
      tokenKey, redirectUri: `${base}/v1/connections/field/callback`,
      webOrigin: 'http://localhost:3001', fetcher },
    modelProvider: { model: 'synthetic', generate: async () => ({ output: { answer: '안내합니다.',
      evidenceIds: [], unknowns: [], handoffRecommended: false },
    inputTokens: 1, outputTokens: 1, responseId: randomUUID() }) }, customerDailyLimit: 10 };
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, runtime);
  const realNow = Date.now;
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: ownerCookie }, payload: { name: 'AP Field 제안 검수' } });
    assert.equal(organization.statusCode, 201, organization.body);
    const organizationId = organization.json().id as string;
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft',
      headers: { cookie: ownerCookie }, payload: { expectedRevision: 0,
        businessName: 'AP Field 제안 검수', introduction: 'AP 직접 소개', services: [], faqs: [] } })).statusCode, 200);
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
      body: JSON.stringify({ client_name: 'Field decision synthetic client',
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

    // 1) 새 동의 요청은 두 scope를 포함한다
    const start = await app.inject({ method: 'POST', url: '/v1/connections/field/start',
      headers: { cookie: ownerCookie }, payload: { fieldConnectionId: randomUUID(), apGrantId } });
    assert.equal(start.statusCode, 201, start.body);
    const requestedScopes = new URL(start.json().authorizationUrl).searchParams.get('scope')?.split(' ') ?? [];
    assert.ok(requestedScopes.includes('field.proposals.respond'));
    assert.ok(requestedScopes.includes('field.notification_route.read'));

    await pool.query(`insert into ap.field_connections(id,ap_grant_id,ap_organization_id,ap_agent_id,
      initiator_user_id,field_issuer,field_client_id,field_grant_id,field_organization_id,
      scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status,
      event_key_id,event_secret_cipher,route_generation)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now() + interval '1 hour','review_required',$13,$14,1)`,
    [connectionId, apGrantId, organizationId, agentId, ownerSession.user.id, issuer,
      runtime.fieldConnector.clientId, fieldGrantId, fieldOrganizationId, allScopes,
      seal('synthetic-access', tokenKey), seal('synthetic-refresh', tokenKey), eventKeyId,
      seal(eventSecret.toString('base64url'),
        createHash('sha256').update(tokenKey).update('ap-field-event-route-v1').digest())]);
    const ownerList = async () => (await app.inject({ url: '/v1/connections/field',
      headers: { cookie: ownerCookie } })).json().connections
      .find((item: { id: string }) => item.id === connectionId) as { scopeState: string; missingScopes: string[] };
    assert.deepEqual(await ownerList(), { ...(await ownerList()), scopeState: 'complete', missingScopes: [] });

    const started = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${link.json().publicId}/engagements` });
    assert.equal(started.statusCode, 201, started.body);
    const inquiryId = started.json().id as string;
    const consultCookie = started.headers['set-cookie']?.toString().split(';')[0];
    const receiptKey = randomBytes(32).toString('base64url');
    const submission = await app.inject({ method: 'POST', url: `/v1/conversations/${inquiryId}/submissions`,
      headers: { cookie: consultCookie, 'idempotency-key': randomBytes(32).toString('base64url'),
        'x-receipt-key': receiptKey }, payload: { name: '제안 고객', phone: '010-3333-4444',
        message: 'Field 예약 요청', consent: true } });
    assert.equal(submission.statusCode, 201, submission.body);
    const bearer = { authorization: `Bearer ${receiptKey}` };
    const requested = { mode: 'preferred', preferredTimeText: '다음 주 오전', timezone: 'Asia/Seoul' };
    const previewBody = { connectionId, serviceId: fieldServiceId, request: requested };
    const preview = await app.inject({ method: 'POST', url: `/v1/inquiries/${inquiryId}/field-availability`,
      headers: bearer, payload: previewBody });
    assert.equal(preview.statusCode, 200, preview.body);
    const actionPath = `/v1/inquiries/${inquiryId}/field-actions`;
    const accepted = await app.inject({ method: 'POST', url: actionPath,
      headers: { ...bearer, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { ...previewBody, kind: 'reservation_request', summary: '방문 예약 요청',
        expectedServiceRevision: preview.json().catalogRevision,
        expectedPolicyRevision: preview.json().policyRevision,
        conditionsHash: preview.json().conditionsHash, consent: true } });
    assert.equal(accepted.statusCode, 201, accepted.body);
    const actionId = accepted.json().actionRequestId as string;
    const viewPath = `${actionPath}/${actionId}`;
    const decisionPath = `${viewPath}/customer-decisions`;
    const actionState = async () => (await pool.query<{ state: string }>(
      'select state from ap.field_action_requests where id = $1', [actionId])).rows[0]?.state;

    // 2) 제안 조회: 확인키 필수, 30초 캐시, 실패 상태는 마지막 확인값 유지·AP 전달 상태 불변
    assert.equal((await app.inject({ url: viewPath })).statusCode, 401);
    assert.equal((await app.inject({ url: viewPath,
      headers: { authorization: `Bearer ${randomBytes(32).toString('base64url')}` } })).statusCode, 401);
    const view = await app.inject({ url: viewPath, headers: bearer });
    assert.equal(view.statusCode, 200, view.body);
    assert.equal(view.json().state, 'accepted_external');
    assert.equal(view.json().field.readState, 'current');
    assert.equal(view.json().field.state, 'proposed');
    assert.deepEqual(view.json().field.proposal, { revision: 3, startAt: proposalStart.toISOString(),
      endAt: proposalEnd.toISOString(), state: 'awaiting_customer' });
    assert.doesNotMatch(view.body, /010-3333-4444|제안 고객/);
    assert.equal((await app.inject({ url: viewPath, headers: bearer })).json().field.readState, 'current');
    assert.equal(readCalls, 1);
    let offset = 0;
    Date.now = () => realNow() + offset;
    const expectRead = async (mode: typeof readMode, readState: string) => {
      readMode = mode; offset += 31_000;
      const result = await app.inject({ url: viewPath, headers: bearer });
      assert.equal(result.statusCode, 200, result.body);
      assert.equal(result.json().field.readState, readState, String(mode));
      return result.json().field;
    };
    assert.equal((await expectRead(404, 'not_found')).proposal.revision, 3);
    assert.equal((await expectRead(503, 'remote_unavailable')).state, 'proposed');
    assert.equal((await expectRead('throw', 'remote_unavailable')).proposal.revision, 3);
    await expectRead(401, 'connection_invalid');
    await expectRead(403, 'scope_missing');
    await expectRead('ok', 'current');
    assert.equal(await actionState(), 'accepted_external');

    // 3) 고객 결정: 제안 불일치·결과 미상(같은 키 재시도)·기록 완료
    assert.equal((await app.inject({ method: 'POST', url: decisionPath,
      payload: { decision: 'accept', proposalRevision: 3 } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: decisionPath, headers: bearer,
      payload: { decision: 'decline', proposalRevision: 3 } })).statusCode, 400);
    const mismatch = await app.inject({ method: 'POST', url: decisionPath, headers: bearer,
      payload: { decision: 'withdraw', proposalRevision: 9 } });
    assert.equal(mismatch.statusCode, 409, mismatch.body);
    assert.equal(mismatch.json().error, 'proposal_mismatch');
    assert.equal(mismatch.json().decisionState, 'rejected');
    decisionMode = 'lose_after_commit';
    const lost = await app.inject({ method: 'POST', url: decisionPath, headers: bearer,
      payload: { decision: 'accept', proposalRevision: 3 } });
    assert.equal(lost.statusCode, 202, lost.body);
    assert.equal(lost.json().decisionState, 'decision_unknown');
    assert.equal(lost.json().bookingConfirmedBy, 'field_owner');
    // 다른 결정 전에 서버가 결과 미상 결정을 같은 키로 다시 보낸다. 그래도 미상이면 그 결정을 알려 주고 새 결정은 보내지 않는다
    decisionMode = 'throw';
    const blocked = await app.inject({ method: 'POST', url: decisionPath, headers: bearer,
      payload: { decision: 'withdraw', proposalRevision: 3 } });
    assert.equal(blocked.statusCode, 409, blocked.body);
    assert.equal(blocked.json().error, 'prior_decision_unknown');
    assert.equal(blocked.json().decision, 'accept');
    assert.equal(blocked.json().proposalRevision, 3);
    assert.equal(decisionBodies.length, 3);
    assert.deepEqual(decisionBodies[2], decisionBodies[1]);
    assert.equal((await pool.query(`select count(*)::int as count from ap.field_customer_decisions
      where action_request_id = $1 and decision = 'withdraw' and proposal_revision = 3`, [actionId])).rows[0]?.count, 0);
    decisionMode = 'ok';
    const recovered = await app.inject({ method: 'POST', url: decisionPath, headers: bearer,
      payload: { decision: 'accept', proposalRevision: 3 } });
    assert.equal(recovered.statusCode, 200, recovered.body);
    assert.equal(recovered.json().decisionState, 'recorded');
    assert.equal(recovered.json().reservationState, 'customer_accepted');
    assert.equal(decisionBodies.length, 4);
    // 결과 미상 재시도는 새 키를 만들지 않고 같은 본문을 보낸다
    assert.deepEqual(decisionBodies[3], decisionBodies[1]);
    const sent = decisionBodies[1] as { idempotencyKey: string; customerProof: Record<string, string> };
    assert.match(sent.idempotencyKey, uuid);
    assert.equal(sent.customerProof.originConversationId, inquiryId);
    assert.match(String(sent.customerProof.recordId), uuid);
    const replay = await app.inject({ method: 'POST', url: decisionPath, headers: bearer,
      payload: { decision: 'accept', proposalRevision: 3 } });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json().decisionState, 'recorded');
    assert.equal(decisionBodies.length, 4);
    const stored = await pool.query<{ state: string; idempotency_key: string; attempts: number }>(
      `select state,idempotency_key,attempts from ap.field_customer_decisions
       where action_request_id = $1 and decision = 'accept'`, [actionId]);
    assert.equal(stored.rows[0]?.state, 'recorded');
    assert.equal(stored.rows[0]?.idempotency_key, sent.idempotencyKey);
    assert.equal(await actionState(), 'accepted_external');
    const afterDecision = await app.inject({ url: viewPath, headers: bearer });
    assert.equal(afterDecision.json().field.state, 'customer_accepted');
    assert.equal(afterDecision.json().field.proposal.state, 'customer_accepted');
    assert.equal(afterDecision.json().decisions.length, 2);

    // 4) Field 서명 사건: 계약 서명 검증, 일시 장애는 같은 event_id·본문으로 재시도
    const outbox = await pool.query<{ id: string; state: string }>(
      `select id,state from ap.field_agent_event_outbox where aggregate_id = $1`, [actionId]);
    assert.equal(outbox.rows.length, 1);
    // Field 401(시계 오차 가능)은 바로 막지 않고 제한 횟수까지 백오프 재시도한다
    webhookMode = 401;
    assert.equal(await deliverFieldAgentEventOnce(pool, runtime.fieldConnector), 'retry');
    const afterAuthReject = (await pool.query<{ state: string; last_http_status: number; last_error: string }>(
      `select state,last_http_status,last_error from ap.field_agent_event_outbox where id = $1`,
      [outbox.rows[0]!.id])).rows[0];
    assert.deepEqual(afterAuthReject, { state: 'retry', last_http_status: 401, last_error: 'receiver_auth_rejected' });
    await pool.query(`update ap.field_agent_event_outbox set next_attempt_at = now() where id = $1`,
      [outbox.rows[0]!.id]);
    webhookMode = 503;
    assert.equal(await deliverFieldAgentEventOnce(pool, runtime.fieldConnector), 'retry');
    await pool.query(`update ap.field_agent_event_outbox set next_attempt_at = now() where id = $1`,
      [outbox.rows[0]!.id]);
    webhookMode = 'ok';
    assert.equal(await deliverFieldAgentEventOnce(pool, runtime.fieldConnector), 'acked');
    assert.equal(await deliverFieldAgentEventOnce(pool, runtime.fieldConnector), 'empty');
    assert.equal(webhookBodies.length, 3);
    assert.ok(webhookBodies[0]!.equals(webhookBodies[1]!));
    assert.ok(webhookBodies[0]!.equals(webhookBodies[2]!));
    const envelope = JSON.parse(webhookBodies[0]!.toString('utf8')) as Record<string, unknown>;
    assert.equal(envelope.event_id, outbox.rows[0]!.id);
    assert.equal(envelope.aggregate_id, actionId);
    assert.deepEqual(envelope.data, { resource_id: actionId, status: 'customer_decided_accept' });
    assert.doesNotMatch(webhookBodies[0]!.toString('utf8'), /010-3333-4444|제안 고객/);

    // 5) 알림 경로: Field 담당이면 생략, 일시 장애면 미러링하지 않고 다음 동기화에서 재확인, scope 없으면 기존 세대 1 규칙
    const syncPath = `${viewPath}/sync-events`;
    const notice = async (revision: number) => (await pool.query<{ state: string;
      suppression_reason: string | null }>(
      `select n.state,n.suppression_reason from ap.notification_events n
       join ap.field_reservation_events e on e.id = n.field_reservation_event_id
       where e.action_request_id = $1 and e.revision = $2`, [actionId, revision])).rows[0];
    const pushEvent = (revision: number, eventType: string, state: string) => events.push({
      eventId: randomUUID(), revision, eventType, state, occurredAt: new Date().toISOString(),
      customerNotificationOwnerProduct: 'ap', routeGeneration: 1 });
    pushEvent(1, 'field.reservation.proposed', 'proposed');
    routeMode = 'field';
    const routed = await app.inject({ method: 'POST', url: syncPath, headers: bearer });
    assert.equal(routed.statusCode, 200, routed.body);
    assert.equal(routed.json().events[1].notificationState, 'not_applicable');
    assert.deepEqual(await notice(1), { state: 'not_applicable', suppression_reason: 'field_route_active' });
    assert.equal(routeCalls, 1);
    pushEvent(2, 'field.reservation.confirmed', 'confirmed');
    // 경로 일시 장애(503): 생략을 영구 기록하지 않고 사건 미러링도 하지 않는다. 다음 동기화가 다시 확인한다
    routeMode = 503;
    const routeDown = await app.inject({ method: 'POST', url: syncPath, headers: bearer });
    assert.equal(routeDown.statusCode, 503, routeDown.body);
    assert.equal(routeDown.json().error, 'route_unknown');
    assert.equal(await notice(2), undefined);
    const noticeCount = async (revision: number) => (await pool.query<{ count: number }>(
      `select count(*)::int as count from ap.notification_events n
       join ap.field_reservation_events e on e.id = n.field_reservation_event_id
       where e.action_request_id = $1 and e.revision = $2`, [actionId, revision])).rows[0]?.count;
    assert.equal((await pool.query<{ count: number }>(
      `select count(*)::int as count from ap.notification_events n
       join ap.field_reservation_events e on e.id = n.field_reservation_event_id
       where e.action_request_id = $1 and n.suppression_reason = 'route_unknown'`, [actionId])).rows[0]?.count, 0);
    pushEvent(3, 'field.reservation.changed', 'confirmed');
    routeMode = 'ap';
    assert.equal((await app.inject({ method: 'POST', url: syncPath, headers: bearer })).statusCode, 200);
    assert.deepEqual(await notice(2), { state: 'blocked_integration', suppression_reason: null });
    assert.equal(await noticeCount(2), 1);
    assert.deepEqual(await notice(3), { state: 'blocked_integration', suppression_reason: null });
    const routeCallsBefore = routeCalls;
    assert.equal((await app.inject({ method: 'POST', url: syncPath, headers: bearer })).statusCode, 200);
    assert.equal(routeCalls, routeCallsBefore);

    // 6) 새 scope가 없는 기존 연결: 소유자 화면 scope_missing, 고객 결정 403, 알림은 기존 규칙
    await pool.query(`update ap.field_connections set scopes = $2 where id = $1`,
      [connectionId, allScopes.slice(0, 5)]);
    assert.deepEqual(await ownerList(), { ...(await ownerList()), scopeState: 'scope_missing',
      missingScopes: ['field.proposals.respond', 'field.notification_route.read'] });
    reservation.state = 'change_proposed';
    reservation.proposal = { ...reservation.proposal!, revision: reservation.revision, state: 'awaiting_customer' };
    const missing = await app.inject({ method: 'POST', url: decisionPath, headers: bearer,
      payload: { decision: 'accept', proposalRevision: reservation.revision } });
    assert.equal(missing.statusCode, 403, missing.body);
    assert.equal(missing.json().error, 'scope_missing');
    assert.equal(decisionBodies.length, 4);
    pushEvent(4, 'field.reservation.change_proposed', 'change_proposed');
    pushEvent(5, 'field.reservation.canceled', 'canceled');
    const callsBeforeScopeless = routeCalls;
    assert.equal((await app.inject({ method: 'POST', url: syncPath, headers: bearer })).statusCode, 200);
    assert.equal(routeCalls, callsBeforeScopeless);
    assert.deepEqual(await notice(5), { state: 'blocked_integration', suppression_reason: null });
    assert.equal(await actionState(), 'accepted_external');

    // 7) 결과 미상 뒤 다른 revision 결정: 서버가 이전 결정을 같은 키로 먼저 확정하고 새 결정을 보낸다
    await pool.query(`update ap.field_connections set scopes = $2 where id = $1`, [connectionId, allScopes]);
    const decisionRow = async (decision: string, revision: number) => (await pool.query<{ state: string;
      error_code: string | null; idempotency_key: string }>(
      `select state,error_code,idempotency_key from ap.field_customer_decisions
       where action_request_id = $1 and decision = $2 and proposal_revision = $3`,
      [actionId, decision, revision])).rows[0];
    const unknownRevision = reservation.revision;
    decisionMode = 'lose_after_commit';
    const lostAgain = await app.inject({ method: 'POST', url: decisionPath, headers: bearer,
      payload: { decision: 'accept', proposalRevision: unknownRevision } });
    assert.equal(lostAgain.statusCode, 202, lostAgain.body);
    const lostKey = (await decisionRow('accept', unknownRevision))?.idempotency_key;
    // 사업자가 확정 전 다시 변경 제안(Field 쪽 상태)
    reservation.revision += 1;
    reservation.state = 'change_proposed';
    reservation.proposal = { ...reservation.proposal!, revision: reservation.revision, state: 'awaiting_customer' };
    decisionMode = 'ok';
    const bodiesBefore = decisionBodies.length;
    const laterRevision = reservation.revision;
    const later = await app.inject({ method: 'POST', url: decisionPath, headers: bearer,
      payload: { decision: 'accept', proposalRevision: laterRevision } });
    assert.equal(later.statusCode, 201, later.body);
    assert.equal(later.json().decisionState, 'recorded');
    assert.equal(decisionBodies.length, bodiesBefore + 2);
    assert.equal((decisionBodies[bodiesBefore] as { idempotencyKey: string }).idempotencyKey, lostKey);
    assert.deepEqual(await decisionRow('accept', unknownRevision),
      { state: 'recorded', error_code: null, idempotency_key: lostKey });
    assert.equal((await decisionRow('accept', laterRevision))?.state, 'recorded');

    // 8) Field 404(저장 전 거절)는 거절로 닫고, 다음 시도는 새 키로 보내 기록된다
    reservation.revision += 1;
    reservation.state = 'change_proposed';
    reservation.proposal = { ...reservation.proposal!, revision: reservation.revision, state: 'awaiting_customer' };
    const mismatchRevision = reservation.revision;
    decisionMode = 404;
    const notFound = await app.inject({ method: 'POST', url: decisionPath, headers: bearer,
      payload: { decision: 'accept', proposalRevision: mismatchRevision } });
    assert.equal(notFound.statusCode, 409, notFound.body);
    assert.equal(notFound.json().error, 'field_reservation_mismatch');
    assert.equal(notFound.json().decisionState, 'rejected');
    const closed = await decisionRow('accept', mismatchRevision);
    assert.equal(closed?.state, 'rejected');
    assert.equal(closed?.error_code, 'field_reservation_mismatch');
    decisionMode = 'ok';
    const afterNotFound = await app.inject({ method: 'POST', url: decisionPath, headers: bearer,
      payload: { decision: 'accept', proposalRevision: mismatchRevision } });
    assert.equal(afterNotFound.statusCode, 201, afterNotFound.body);
    assert.equal(afterNotFound.json().decisionState, 'recorded');
    const rekeyed = await decisionRow('accept', mismatchRevision);
    assert.equal(rekeyed?.state, 'recorded');
    assert.notEqual(rekeyed?.idempotency_key, closed?.idempotency_key);

    // 9) 수신 확인 행은 30일 뒤 보존 단계에서 지운다. 다음 사건 순번(max+1)이 재사용되지 않도록 action별 최신 행은 남긴다
    const outboxRows = async () => (await pool.query<{ aggregate_version: number }>(
      `select aggregate_version from ap.field_agent_event_outbox where aggregate_id = $1
       order by aggregate_version`, [actionId])).rows.map(row => row.aggregate_version);
    const versions = await outboxRows();
    assert.ok(versions.length >= 3, String(versions));
    await pool.query(`update ap.field_agent_event_outbox set state = 'acked',lease_until = null,
      acknowledged_at = now() - interval '29 days' where aggregate_id = $1`, [actionId]);
    assert.equal(await purgeAckedFieldAgentEvents(pool), 0);
    await pool.query(`update ap.field_agent_event_outbox set acknowledged_at = now() - interval '31 days'
      where aggregate_id = $1`, [actionId]);
    assert.equal(await purgeAckedFieldAgentEvents(pool), versions.length - 1);
    assert.deepEqual(await outboxRows(), [versions.at(-1)]);
  } finally {
    Date.now = realNow;
    await app.close();
  }
});
