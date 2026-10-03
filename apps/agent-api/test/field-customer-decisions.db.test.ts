import assert from 'node:assert/strict';
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { agentRevocationJournalFromEnvironment } from '../src/revocation-journal.js';
import { createAgentApp } from '../src/app.js';
import { AUTH_REJECT_RETRY_LIMIT, deliverFieldAgentEventOnce, enqueueFieldAgentEvent, NOT_READY_RETRY_LIMIT,
  purgeAckedFieldAgentEvents } from '../src/field-webhook-sender.js';
import { apToFieldSignatureSendVersion } from '../src/field-signature.js';
import { processFieldEventInboxOnce, type FieldRouteCache } from '../src/field-event-inbox.js';

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
// 모의 Field 수신자가 검증하는 서명 버전. 2는 현행(v2 헤더·방향 접두사만), 1은 구버전(버전 헤더 없는 접두사 없는 원문만)이다
let receiverSignatureVersion: 1 | 2 = 2;
// Field 계약(apEventHmac·AgentEventEnvelope)대로 다시 구현한 수신 검증. Field 코드를 import하지 않는다.
function verifyAgentEvent(headers: Headers, raw: Buffer, keyId: string, secret: Buffer) {
  const timestamp = headers.get('x-timestamp') ?? '';
  const eventId = headers.get('x-event-id') ?? '';
  const signature = headers.get('x-signature') ?? '';
  // 발신 기본값은 v2(`v2:ap->field.` 방향 접두사)다. 구버전 수신자는 버전 헤더 없는 v1만 검증한다.
  if (headers.get('content-type') !== 'application/vnd.agent-event+json'
    || headers.get('x-signature-version') !== (receiverSignatureVersion === 2 ? '2' : null)
    || headers.get('x-key-id') !== keyId || !/^\d{10}$/.test(timestamp)
    || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const expected = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${receiverSignatureVersion === 2 ? 'v2:ap->field.' : ''}${timestamp}.${eventId}.`),
      raw])).digest();
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
  let decisionMode: 'ok' | 'lose_after_commit' | 'throw' | 404 | 'proof_expired' = 'ok';
  const decisionBodies: Record<string, unknown>[] = [];
  const storedDecisions = new Map<string, { body: string; result: Record<string, unknown> }>();
  let routeMode: 'ap' | 'field' | 503 | 'bad_combo' = 'ap';
  let routeCalls = 0;
  const events: Array<Record<string, unknown>> = [];
  let webhookMode: 'ok' | 401 | 503 = 'ok';
  const webhookBodies: Buffer[] = [];
  const webhookHeaders: Headers[] = [];
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
      // 계약에 없는 조합(Field 담당인데 AP 세대 1 사유)은 AP가 route_unknown으로 다뤄야 한다
      if (routeMode === 'bad_combo') return Response.json({ externalRequestId: external.externalRequestId,
        reservationId: external.reservationId, owner: 'field', generation: 2, allowed: false, reason: 'ap_route_generation_1' });
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
      // 고객 확인 기록이 Field 신선도(24시간)를 넘겨 저장 전에 거절된 경우
      if (decisionMode === 'proof_expired') return Response.json({ error: 'customer_proof_expired' }, { status: 409 });
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
      webhookHeaders.push(new Headers(init.headers));
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
    // 연결이 제안 응답 권한에 동의했으므로 고객 화면은 수락·철회를 활성화할 수 있다
    assert.equal(view.json().canRespond, true);
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
    // 4-1) 발신 서명 버전(AP_EVENT_SIGNATURE_SEND_VERSION): 기본 2, 1은 전환 기간, 그 밖의 값은 부팅 거부
    assert.equal(apToFieldSignatureSendVersion({}), 2);
    assert.equal(apToFieldSignatureSendVersion({ AP_EVENT_SIGNATURE_SEND_VERSION: '2' }), 2);
    assert.equal(apToFieldSignatureSendVersion({ AP_EVENT_SIGNATURE_SEND_VERSION: '1' }), 1);
    for (const invalid of ['', '3', 'v1', ' 2'])
      assert.throws(() => apToFieldSignatureSendVersion({ AP_EVENT_SIGNATURE_SEND_VERSION: invalid }),
        /invalid_AP_EVENT_SIGNATURE_SEND_VERSION/, invalid);
    // 구버전 Field 수신자(v1만 검증): 기본 v2 발신은 401을 받아도 v1로 자동 전환하지 않고 기존 제한 재시도로 남는다.
    // 운영자가 1로 바꾸면 버전 헤더 없이 접두사 없는 원문으로 서명해 수신된다
    receiverSignatureVersion = 1;
    const transitionDb = await pool.connect();
    let transitionEventId: string;
    try {
      await transitionDb.query('begin');
      transitionEventId = await enqueueFieldAgentEvent(transitionDb, { organizationId,
        connectionId, actionRequestId: actionId, correlationId: randomUUID(),
        status: 'customer_decided_accept', occurredAt: new Date() });
      await transitionDb.query('commit');
    } finally { transitionDb.release(); }
    const transitionRow = async () => (await pool.query<{ state: string; last_http_status: number | null;
      last_error: string | null }>(`select state,last_http_status,last_error from ap.field_agent_event_outbox
      where id = $1`, [transitionEventId])).rows[0];
    try {
      assert.equal(await deliverFieldAgentEventOnce(pool, runtime.fieldConnector), 'retry');
      assert.equal(webhookHeaders.at(-1)?.get('x-event-id'), transitionEventId);
      assert.equal(webhookHeaders.at(-1)?.get('x-signature-version'), '2');
      assert.deepEqual(await transitionRow(), { state: 'retry', last_http_status: 401,
        last_error: 'receiver_auth_rejected' });
      process.env.AP_EVENT_SIGNATURE_SEND_VERSION = '1';
      await pool.query(`update ap.field_agent_event_outbox set next_attempt_at = now() where id = $1`,
        [transitionEventId]);
      assert.equal(await deliverFieldAgentEventOnce(pool, runtime.fieldConnector), 'acked');
      assert.equal(webhookHeaders.at(-1)?.get('x-event-id'), transitionEventId);
      assert.equal(webhookHeaders.at(-1)?.get('x-signature-version'), null);
      assert.deepEqual(await transitionRow(), { state: 'acked', last_http_status: 202, last_error: null });
    } finally {
      delete process.env.AP_EVENT_SIGNATURE_SEND_VERSION;
      receiverSignatureVersion = 2;
    }
    // 4-2) Field 401은 AUTH_REJECT_RETRY_LIMIT번째 시도에서 blocked로 멈춘다(그 전까지는 retry)
    const enqueueEvent = async () => {
      const db = await pool.connect();
      try {
        await db.query('begin');
        const id = await enqueueFieldAgentEvent(db, { organizationId, connectionId, actionRequestId: actionId,
          correlationId: randomUUID(), status: 'customer_decided_accept', occurredAt: new Date() });
        await db.query('commit');
        return id;
      } finally { db.release(); }
    };
    const outboxState = async (id: string) => (await pool.query<{ state: string; attempts: number; last_http_status: number | null;
      last_error: string | null }>(`select state,attempts,last_http_status,last_error from ap.field_agent_event_outbox where id = $1`, [id])).rows[0];
    const rejectedEvent = await enqueueEvent();
    webhookMode = 401;
    try {
      for (let attempt = 1; attempt < AUTH_REJECT_RETRY_LIMIT; attempt++) {
        assert.equal(await deliverFieldAgentEventOnce(pool, runtime.fieldConnector), 'retry', String(attempt));
        await pool.query('update ap.field_agent_event_outbox set next_attempt_at = now() where id = $1', [rejectedEvent]);
      }
      assert.equal(await deliverFieldAgentEventOnce(pool, runtime.fieldConnector), 'blocked');
      assert.deepEqual(await outboxState(rejectedEvent), { state: 'blocked', attempts: AUTH_REJECT_RETRY_LIMIT,
        last_http_status: 401, last_error: 'receiver_rejected' });
      assert.equal(await deliverFieldAgentEventOnce(pool, runtime.fieldConnector), 'empty');
    } finally { webhookMode = 'ok'; }
    // 4-3) degraded 연결의 사건은 복구를 기다려 재시도하되 NOT_READY_RETRY_LIMIT번째 시도에서 blocked로 멈춘다
    const degradedEvent = await enqueueEvent();
    await pool.query("update ap.field_connections set status = 'degraded' where id = $1", [connectionId]);
    try {
      const webhooksBefore = webhookBodies.length;
      assert.equal(await deliverFieldAgentEventOnce(pool, runtime.fieldConnector), 'retry');
      assert.deepEqual(await outboxState(degradedEvent), { state: 'retry', attempts: 1, last_http_status: null,
        last_error: 'connection_not_ready' });
      await pool.query('update ap.field_agent_event_outbox set attempts = $2, next_attempt_at = now() where id = $1',
        [degradedEvent, NOT_READY_RETRY_LIMIT - 2]);
      assert.equal(await deliverFieldAgentEventOnce(pool, runtime.fieldConnector), 'retry');
      await pool.query('update ap.field_agent_event_outbox set next_attempt_at = now() where id = $1', [degradedEvent]);
      assert.equal(await deliverFieldAgentEventOnce(pool, runtime.fieldConnector), 'blocked');
      assert.deepEqual(await outboxState(degradedEvent), { state: 'blocked', attempts: NOT_READY_RETRY_LIMIT,
        last_http_status: null, last_error: 'connection_not_ready_limit' });
      assert.equal(webhookBodies.length, webhooksBefore);
    } finally {
      await pool.query("update ap.field_connections set status = 'review_required' where id = $1", [connectionId]);
    }

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
    // 조회 응답이 응답 권한 없음을 미리 알려 화면이 버튼을 비활성화한다
    assert.equal((await app.inject({ url: viewPath, headers: bearer })).json().canRespond, false);
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

    // 8-1) Field가 고객 확인 기록 만료(customer_proof_expired)로 저장 전에 거절하면 거절로 닫고, 다음 시도는 새 키·새 고객 기록으로 보낸다
    reservation.revision += 1;
    reservation.state = 'change_proposed';
    reservation.proposal = { ...reservation.proposal!, revision: reservation.revision, state: 'awaiting_customer' };
    const expiredRevision = reservation.revision;
    decisionMode = 'proof_expired';
    const expiredProof = await app.inject({ method: 'POST', url: decisionPath, headers: bearer,
      payload: { decision: 'accept', proposalRevision: expiredRevision } });
    assert.equal(expiredProof.statusCode, 409, expiredProof.body);
    assert.equal(expiredProof.json().error, 'customer_proof_expired');
    assert.equal(expiredProof.json().decisionState, 'rejected');
    const expiredRow = (await pool.query<{ state: string; error_code: string; idempotency_key: string; customer_record_id: string }>(
      `select state,error_code,idempotency_key,customer_record_id from ap.field_customer_decisions
       where action_request_id = $1 and decision = 'accept' and proposal_revision = $2`, [actionId, expiredRevision])).rows[0]!;
    assert.deepEqual([expiredRow.state, expiredRow.error_code], ['rejected', 'customer_proof_expired']);
    decisionMode = 'ok';
    const reproved = await app.inject({ method: 'POST', url: decisionPath, headers: bearer,
      payload: { decision: 'accept', proposalRevision: expiredRevision } });
    assert.equal(reproved.statusCode, 201, reproved.body);
    assert.equal(reproved.json().decisionState, 'recorded');
    const reprovedRow = (await pool.query<{ idempotency_key: string; customer_record_id: string }>(
      `select idempotency_key,customer_record_id from ap.field_customer_decisions
       where action_request_id = $1 and decision = 'accept' and proposal_revision = $2`, [actionId, expiredRevision])).rows[0]!;
    assert.notEqual(reprovedRow.idempotency_key, expiredRow.idempotency_key);
    assert.notEqual(reprovedRow.customer_record_id, expiredRow.customer_record_id);
    const lastBody = decisionBodies.at(-1) as { idempotencyKey: string; customerProof: { recordId: string } };
    assert.equal(lastBody.idempotencyKey, reprovedRow.idempotency_key);
    assert.equal(lastBody.customerProof.recordId, reprovedRow.customer_record_id);

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
    // 9-1) 차단(blocked) 행도 마지막 변경 30일 뒤 지운다. 30일이 안 된 행과 대상별 최신 행은 남긴다
    const blockedIds = [await enqueueEvent(), await enqueueEvent(), await enqueueEvent()];
    const blockedVersions = await outboxRows();
    for (const [index, id] of blockedIds.entries())
      await pool.query(`update ap.field_agent_event_outbox set state = 'blocked',lease_until = null,
        updated_at = now() - $2::interval where id = $1`, [id, index === 1 ? '29 days' : '31 days']);
    // 이전 최신 acked 행(31일)과 가장 오래된 blocked 행이 지워진다
    assert.equal(await purgeAckedFieldAgentEvents(pool), 2);
    assert.deepEqual(await outboxRows(), blockedVersions.slice(-2));

    // 10) push 경로(수신함)도 sync 경로처럼 기록 직전 Field 알림 경로를 확인한다
    const reservationId = (await pool.query<{ reservation_id: string }>(
      'select reservation_id from ap.field_action_requests where id = $1', [actionId])).rows[0]!.reservation_id;
    type FeedEvent = { eventId: string; revision: number; eventType: string; state: string; occurredAt: string };
    const feedEvent = (revision: number, eventType: string, state: string): FeedEvent => ({
      eventId: randomUUID(), revision, eventType, state, occurredAt: new Date(realNow()).toISOString() });
    // 서명 수신(202) 뒤 수신함에 남는 행과 같은 값을 직접 넣는다. 수신·서명 검증은 field-actions.db 검수가 다룬다
    const receive = (event: FeedEvent) => pool.query(`insert into ap.field_event_inbox(id,source_product,
      source_event_id,connection_id,action_request_id,reservation_id,revision,event_type,reservation_state,
      occurred_at,route_generation,body_hash) values ($1,'field',$2,$3,$4,$5,$6,$7,$8,$9,1,$10)`,
    [randomUUID(), event.eventId, connectionId, actionId, reservationId, event.revision, event.eventType,
      event.state, event.occurredAt, createHash('sha256').update(event.eventId).digest('hex')]);
    const inboxRow = async (event: FeedEvent) => (await pool.query<{ state: string; error_code: string | null;
      processed: boolean; backed_off: boolean }>(
      `select state,error_code,processed_at is not null as processed,next_attempt_at > now() as backed_off
       from ap.field_event_inbox where source_event_id = $1`, [event.eventId])).rows[0];
    const mirroredCount = async (revision: number) => (await pool.query<{ count: number }>(
      `select count(*)::int as count from ap.field_reservation_events
       where action_request_id = $1 and revision = $2`, [actionId, revision])).rows[0]?.count;
    const deliveryCount = async (revision: number) => (await pool.query<{ count: number }>(
      `select count(*)::int as count from ap.notification_deliveries d
       join ap.notification_events n on n.id = d.notification_id
       join ap.field_reservation_events e on e.id = n.field_reservation_event_id
       where e.action_request_id = $1 and e.revision = $2`, [actionId, revision])).rows[0]?.count;
    const feedEntry = (event: FeedEvent) => ({ ...event, customerNotificationOwnerProduct: 'ap', routeGeneration: 1 });
    // 10-1) Field 담당: not_applicable+사유, AP 발송 행 없음. 같은 예약의 연속 사건은 배치 캐시로 경로를 한 번만 조회한다
    routeMode = 'field';
    const pushed6 = feedEvent(6, 'field.reservation.confirmed', 'confirmed');
    const pushed7 = feedEvent(7, 'field.reservation.changed', 'confirmed');
    await receive(pushed6);
    await receive(pushed7);
    const batchCache = new Map();
    const callsBeforePush = routeCalls;
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector, batchCache), 'processed');
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector, batchCache), 'processed');
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector, batchCache), 'empty');
    assert.equal(routeCalls, callsBeforePush + 1);
    for (const revision of [6, 7]) {
      assert.deepEqual(await notice(revision), { state: 'not_applicable', suppression_reason: 'field_route_active' });
      assert.equal(await deliveryCount(revision), 0);
    }
    assert.deepEqual(await inboxRow(pushed6), { state: 'processed', error_code: null, processed: true, backed_off: false });
    // 10-2) 경로 일시 장애(503): 사건을 claim·미러링하지 않고 백오프한다. 다음 주기에 경로가 정상이면 AP 규칙으로 기록한다
    routeMode = 503;
    const pushed8 = feedEvent(8, 'field.reservation.canceled', 'canceled');
    await receive(pushed8);
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'deferred');
    assert.deepEqual(await inboxRow(pushed8), { state: 'received', error_code: 'route_unknown',
      processed: false, backed_off: true });
    assert.equal(await mirroredCount(8), 0);
    assert.equal(await notice(8), undefined);
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'empty');
    routeMode = 'ap';
    await pool.query(`update ap.field_event_inbox set next_attempt_at = now() where source_event_id = $1`,
      [pushed8.eventId]);
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'processed');
    assert.deepEqual(await notice(8), { state: 'blocked_integration', suppression_reason: null });
    assert.deepEqual(await inboxRow(pushed8), { state: 'processed', error_code: null, processed: true, backed_off: false });
    // 10-3) 새 scope가 없는 연결: 경로를 조회하지 않고 기존 세대 1 규칙으로 기록한다
    await pool.query(`update ap.field_connections set scopes = $2 where id = $1`,
      [connectionId, allScopes.slice(0, 5)]);
    routeMode = 'field';
    const pushed9 = feedEvent(9, 'field.reservation.confirmed', 'confirmed');
    await receive(pushed9);
    const callsBeforeScopelessPush = routeCalls;
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'processed');
    assert.equal(routeCalls, callsBeforeScopelessPush);
    assert.deepEqual(await notice(9), { state: 'blocked_integration', suppression_reason: null });
    await pool.query(`update ap.field_connections set scopes = $2 where id = $1`, [connectionId, allScopes]);
    // 10-4) push로 먼저 기록한 사건을 sync가 다시 보면 중복 기록·경로 재조회가 없다
    routeMode = 'ap';
    events.push(...[pushed6, pushed7, pushed8, pushed9].map(feedEntry));
    const callsBeforeSync = routeCalls;
    const synced = await app.inject({ method: 'POST', url: syncPath, headers: bearer });
    assert.equal(synced.statusCode, 200, synced.body);
    assert.equal(routeCalls, callsBeforeSync);
    for (const revision of [6, 7, 8, 9]) {
      assert.equal(await mirroredCount(revision), 1);
      assert.equal(await noticeCount(revision), 1);
    }
    assert.deepEqual(await notice(6), { state: 'not_applicable', suppression_reason: 'field_route_active' });
    // 10-5) sync로 먼저 기록한 사건이 나중에 push로 와도 같은 event id·revision이면 한 번만 기록된다
    const synced10 = feedEvent(10, 'field.reservation.changed', 'confirmed');
    events.push(feedEntry(synced10));
    assert.equal((await app.inject({ method: 'POST', url: syncPath, headers: bearer })).statusCode, 200);
    assert.equal(await mirroredCount(10), 1);
    const callsBeforeLatePush = routeCalls;
    await receive(synced10);
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'processed');
    assert.equal(routeCalls, callsBeforeLatePush);
    assert.equal(await mirroredCount(10), 1);
    assert.equal(await noticeCount(10), 1);
    assert.deepEqual(await notice(10), { state: 'blocked_integration', suppression_reason: null });
    // 10-6) 경로 캐시 항목은 10초 안에서만 재사용한다. 10초가 지난 항목(AP 허용)은 쓰지 않고 Field 경로를 다시 읽는다
    const externalRequestId = (await pool.query<{ external_request_id: string }>(
      'select external_request_id from ap.field_action_requests where id = $1', [actionId])).rows[0]!.external_request_id;
    const routeKey = `${connectionId}:${externalRequestId}`;
    routeMode = 'field';
    const pushed11 = feedEvent(11, 'field.reservation.changed', 'confirmed');
    await receive(pushed11);
    const staleCache: FieldRouteCache = new Map([[routeKey, { at: Date.now() - 11_000,
      route: { owner: 'ap', allowed: true, reason: 'ap_route_generation_1' } }]]);
    const callsBeforeStale = routeCalls;
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector, staleCache), 'processed');
    assert.equal(routeCalls, callsBeforeStale + 1);
    assert.deepEqual(await notice(11), { state: 'not_applicable', suppression_reason: 'field_route_active' });
    assert.equal(staleCache.get(routeKey)?.route?.reason, 'field_route_active');
    // 10-7) AP 연결 조건 불충족(배포 일시중지 → 404)은 영구 생략하지 않고 미룬다. 간격은 수신 뒤 지난 시간(30초~1시간)이다.
    // 배포를 다시 켜면 AP 고객 알림으로 기록된다
    routeMode = 'ap';
    const deploymentPath = `/v1/deployments/${deploymentId}`;
    assert.equal((await app.inject({ method: 'POST', url: `${deploymentPath}/pause`,
      headers: { cookie: ownerCookie } })).statusCode, 200);
    const pushed12 = feedEvent(12, 'field.reservation.changed', 'confirmed');
    await receive(pushed12);
    const retryDelay = async (event: FeedEvent) => (await pool.query<{ seconds: number }>(
      `select extract(epoch from next_attempt_at - now())::float8 as seconds
       from ap.field_event_inbox where source_event_id = $1`, [event.eventId])).rows[0]!.seconds;
    const callsBeforePaused = routeCalls;
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'deferred');
    assert.deepEqual(await inboxRow(pushed12), { state: 'received', error_code: 'connection_not_available',
      processed: false, backed_off: true });
    const firstDelay = await retryDelay(pushed12);
    assert.ok(firstDelay > 25 && firstDelay <= 30, String(firstDelay));
    assert.equal(await mirroredCount(12), 0);
    assert.equal(await notice(12), undefined);
    for (const [age, expected] of [['5 minutes', 300], ['2 hours', 3600]] as const) {
      await pool.query(`update ap.field_event_inbox set received_at = now() - $2::interval,
        next_attempt_at = now() where source_event_id = $1`, [pushed12.eventId, age]);
      assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'deferred');
      const delay = await retryDelay(pushed12);
      // 간격은 수신 뒤 지난 시간이라 갱신과 조회 사이의 몇 ms만큼 오차가 있다
      assert.ok(Math.abs(delay - expected) < 5, `${age}: ${delay}`);
    }
    assert.equal(routeCalls, callsBeforePaused);
    assert.equal((await app.inject({ method: 'POST', url: `${deploymentPath}/activate`,
      headers: { cookie: ownerCookie } })).statusCode, 200);
    await pool.query(`update ap.field_event_inbox set next_attempt_at = now() where source_event_id = $1`,
      [pushed12.eventId]);
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'processed');
    assert.equal(routeCalls, callsBeforePaused + 1);
    assert.deepEqual(await notice(12), { state: 'blocked_integration', suppression_reason: null });
    assert.deepEqual(await inboxRow(pushed12), { state: 'processed', error_code: null, processed: true, backed_off: false });
    // 10-8) 수신 뒤 24시간이 지나도록 경로를 확인하지 못하면 AP 알림 없이 route_unresolved로 닫는다
    assert.equal((await app.inject({ method: 'POST', url: `${deploymentPath}/pause`,
      headers: { cookie: ownerCookie } })).statusCode, 200);
    const pushed13 = feedEvent(13, 'field.reservation.changed', 'confirmed');
    await receive(pushed13);
    await pool.query(`update ap.field_event_inbox set received_at = now() - interval '25 hours'
      where source_event_id = $1`, [pushed13.eventId]);
    const callsBeforeExpired = routeCalls;
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'processed');
    assert.equal(routeCalls, callsBeforeExpired);
    assert.deepEqual(await notice(13), { state: 'not_applicable', suppression_reason: 'route_unresolved' });
    assert.equal(await deliveryCount(13), 0);
    assert.deepEqual(await inboxRow(pushed13), { state: 'processed', error_code: null, processed: true, backed_off: false });
    assert.equal((await app.inject({ method: 'POST', url: `${deploymentPath}/activate`,
      headers: { cookie: ownerCookie } })).statusCode, 200);
    // 10-9) 워커에 Field 커넥터가 없으면 Field 장애(route_unknown)와 구분해 blocked_integration으로 미룬다
    const pushed14 = feedEvent(14, 'field.reservation.changed', 'confirmed');
    await receive(pushed14);
    const callsBeforeNoConnector = routeCalls;
    assert.equal(await processFieldEventInboxOnce(pool, undefined), 'deferred');
    assert.deepEqual(await inboxRow(pushed14), { state: 'received', error_code: 'blocked_integration',
      processed: false, backed_off: true });
    const noConnectorDelay = await retryDelay(pushed14);
    assert.ok(noConnectorDelay > 25 && noConnectorDelay <= 30, String(noConnectorDelay));
    assert.equal(await mirroredCount(14), 0);
    assert.equal(routeCalls, callsBeforeNoConnector);
    await pool.query(`update ap.field_event_inbox set next_attempt_at = now() where source_event_id = $1`,
      [pushed14.eventId]);
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'processed');
    assert.deepEqual(await notice(14), { state: 'blocked_integration', suppression_reason: null });
    // 10-11) 계약에 없는 owner·allowed·reason 조합은 route_unknown(생략)으로 기록하고 AP 발송을 만들지 않는다
    routeMode = 'bad_combo';
    const pushed15 = feedEvent(15, 'field.reservation.changed', 'confirmed');
    await receive(pushed15);
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'processed');
    assert.deepEqual(await notice(15), { state: 'not_applicable', suppression_reason: 'route_unknown' });
    assert.equal(await deliveryCount(15), 0);
    routeMode = 'ap';
    // 10-12) 처리 중 예외가 난 행은 processing_failed로 미뤄 2초마다 다시 집지 않는다. 원인이 사라지면 처리된다
    await pool.query(`create function ap.synthetic_reject_reservation_event() returns trigger language plpgsql as $f$
      begin raise exception 'synthetic mirror failure'; end $f$`);
    await pool.query(`create trigger synthetic_reject_reservation_event before insert on ap.field_reservation_events
      for each row execute function ap.synthetic_reject_reservation_event()`);
    const pushed16 = feedEvent(16, 'field.reservation.changed', 'confirmed');
    try {
      await receive(pushed16);
      await assert.rejects(processFieldEventInboxOnce(pool, runtime.fieldConnector), /synthetic mirror failure/);
      assert.deepEqual(await inboxRow(pushed16), { state: 'received', error_code: 'processing_failed', processed: false, backed_off: true });
      const failedDelay = await retryDelay(pushed16);
      assert.ok(failedDelay > 25 && failedDelay <= 30, String(failedDelay));
      assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'empty');
    } finally {
      await pool.query('drop trigger synthetic_reject_reservation_event on ap.field_reservation_events');
      await pool.query('drop function ap.synthetic_reject_reservation_event()');
    }
    await pool.query('update ap.field_event_inbox set next_attempt_at = now() where source_event_id = $1', [pushed16.eventId]);
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'processed');
    assert.equal(await mirroredCount(16), 1);
    assert.deepEqual(await inboxRow(pushed16), { state: 'processed', error_code: null, processed: true, backed_off: false });
    // 10-10) 확인키가 아예 없는 상담만 조회 없이 route_unknown(생략)으로 기록한다.
    // 현재 스키마는 접수된 상담(external/human)에 확인키를 요구하므로, 상담 행을 접수 전(ai) 상태로 되돌려 재현한다
    await pool.query(`update ap.inquiries set mode = 'ai', state = 'ai_assisting', automation_paused = false,
      customer_name = null, customer_phone = null, visitor_key_hash = null, consent_at = null
      where id = $1`, [inquiryId]);
    const pushed17 = feedEvent(17, 'field.reservation.changed', 'confirmed');
    await receive(pushed17);
    const callsBeforeKeyless = routeCalls;
    assert.equal(await processFieldEventInboxOnce(pool, runtime.fieldConnector), 'processed');
    assert.equal(routeCalls, callsBeforeKeyless);
    assert.deepEqual(await notice(17), { state: 'not_applicable', suppression_reason: 'route_unknown' });
    assert.equal(await deliveryCount(17), 0);
  } finally {
    Date.now = realNow;
    await app.close();
  }
});
