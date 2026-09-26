import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';
import { recordFieldReservationEvent } from '../src/field-actions.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4311';
async function actor() {
  const email = `distribution-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic distribution actor' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signedIn = await post('/sign-in/email');
  assert.equal(signedIn.status, 200);
  return { email, cookie: signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('approved placement installs on exact publisher origin and hands a direct inquiry into AP without attribution spoofing', async () => {
  const business = await actor();
  const media = await actor();
  const outsider = await actor();
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool, resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    verifyDomain: async () => true,
  });
  const withModel = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool, resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    verifyDomain: async () => true, customerDailyLimit: 5,
    modelProvider: { model: 'synthetic-distribution', generate: async () => ({
      output: { answer: '현장 상담을 제공합니다.', evidenceIds: ['service:0'], unknowns: [], handoffRecommended: false },
      inputTokens: 12, outputTokens: 8, responseId: `synthetic-${randomUUID()}`,
    }) },
  });
  let organizationId = '';
  let publisherId = '';
  try {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie: business.cookie },
      payload: { name: '배포 사업자' } });
    assert.equal(created.statusCode, 201);
    organizationId = created.json().id as string;
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: { cookie: business.cookie }, payload: {
      expectedRevision: 0, businessName: '배포 사업자', introduction: '승인된 안내입니다.',
      services: [{ name: '상담 서비스', description: '현장 상담을 제공합니다.' }], faqs: [],
    } })).statusCode, 200);
    const knowledge = await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: business.cookie },
      payload: { expectedRevision: 1 } });
    assert.equal(knowledge.statusCode, 201);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/agents/draft', headers: { cookie: business.cookie }, payload: {
      expectedRevision: 0, name: '배포 AI', tone: 'clear', guideScope: '승인된 안내', handoffText: '담당자가 답변합니다.',
    } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/releases', headers: { cookie: business.cookie },
      payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } })).statusCode, 201);
    const campaign = await app.inject({ method: 'POST', url: '/v1/campaigns', headers: { cookie: business.cookie },
      payload: { name: '기사 카드', knowledgeReleaseId: knowledge.json().releaseId, serviceIndex: 0 } });
    assert.equal(campaign.statusCode, 201);
    const campaignId = campaign.json().id as string;
    const release = await app.inject({ method: 'POST', url: `/v1/campaigns/${campaignId}/releases`, headers: { cookie: business.cookie },
      payload: { expectedRevision: 1, idempotencyKey: randomUUID(), confirmApprovedFacts: true } });
    assert.equal(release.statusCode, 201);
    const releaseId = release.json().releaseId as string;
    const publisher = await app.inject({ method: 'POST', url: '/v1/publishers', headers: { cookie: media.cookie },
      payload: { name: '기사 매체' } });
    assert.equal(publisher.statusCode, 201);
    publisherId = publisher.json().id as string;
    const domain = await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/domains`, headers: { cookie: media.cookie },
      payload: { origin: 'https://distribution.example.test' } });
    assert.equal(domain.statusCode, 201);
    const domainId = domain.json().id as string;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/domains/${domainId}/verify`,
      headers: { cookie: media.cookie } })).statusCode, 200);
    const slot = await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots`, headers: { cookie: media.cookie },
      payload: { domainId, name: '기사 중간', format: 'article' } });
    assert.equal(slot.statusCode, 201);
    const slotId = slot.json().id as string;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots/${slotId}/activate`,
      headers: { cookie: media.cookie } })).statusCode, 200);
    const placement = await app.inject({ method: 'POST', url: '/v1/placements', headers: { cookie: business.cookie },
      payload: { campaignId, releaseId, slotId, idempotencyKey: randomUUID() } });
    assert.equal(placement.statusCode, 201);
    const placementId = placement.json().id as string;
    const queue = await app.inject({ url: `/v1/publishers/${publisherId}/placements`, headers: { cookie: media.cookie } });
    const contentHash = queue.json().placements[0].contentHash as string;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/placements/${placementId}/approve`,
      headers: { cookie: media.cookie }, payload: { expectedReleaseId: releaseId, expectedContentHash: contentHash } })).statusCode, 200);
    const installPath = `/v1/publishers/${publisherId}/placements/${placementId}/install`;
    assert.equal((await app.inject({ url: `/v1/public/placements/${placementId}` })).json().ctaPath, null);
    assert.equal((await app.inject({ method: 'POST', url: installPath, headers: { cookie: outsider.cookie } })).statusCode, 404);
    const installed = await app.inject({ method: 'POST', url: installPath, headers: { cookie: media.cookie } });
    assert.equal(installed.statusCode, 201);
    const publicId = installed.json().publicId as string;
    assert.match(publicId, /^dep_[A-Za-z0-9_-]{20,50}$/);
    assert.match(installed.json().script as string, /data-deployment=/);
    assert.equal((await app.inject({ url: `/v1/public/placements/${placementId}` })).json().ctaPath,
      `/consult/${publicId}`);
    assert.equal((await app.inject({ method: 'POST', url: installPath, headers: { cookie: media.cookie } })).json().publicId, publicId);
    const emptyMetrics = await app.inject({ url: `/v1/publishers/${publisherId}/metrics`, headers: { cookie: media.cookie } });
    assert.equal(emptyMetrics.statusCode, 200);
    assert.equal(emptyMetrics.json().bookingConfirmed, 'unsupported_unconnected');
    assert.equal(emptyMetrics.json().revenue, 'not_measured');
    assert.equal((await app.inject({ url: `/v1/publishers/${publisherId}/metrics`, headers: { cookie: outsider.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ url: '/v1/distribution/metrics', headers: { cookie: business.cookie } })).statusCode, 200);
    const publicDeployment = await app.inject({ url: `/v1/public/deployments/${publicId}` });
    assert.equal(publicDeployment.statusCode, 200);
    assert.equal(publicDeployment.json().placementId, placementId);
    await pool.query("update ap.publisher_domains set verified_until = now() - interval '1 minute' where id = $1", [domainId]);
    assert.equal((await app.inject({ url: `/v1/public/deployments/${publicId}` })).statusCode, 404);
    await pool.query("update ap.publisher_domains set verified_until = now() + interval '7 days' where id = $1", [domainId]);
    assert.equal((await app.inject({ url: `/v1/public/deployments/${publicId}` })).statusCode, 200);
    assert.equal((await app.inject({ url: `/sdk/v1.js?deployment=${publicId}` })).statusCode, 200);
    assert.equal((await app.inject({ url: `/embed/v1/${publicId}/frame`,
      headers: { referer: 'https://other.example.test/article' } })).statusCode, 403);
    const frame = await app.inject({ url: `/embed/v1/${publicId}/frame`,
      headers: { referer: 'https://distribution.example.test/article' } });
    assert.equal(frame.statusCode, 200);
    assert.match(frame.headers['content-security-policy']?.toString() ?? '', /frame-ancestors https:\/\/distribution\.example\.test/);
    assert.match(frame.body, /현장 상담을 제공합니다\./);
    assert.doesNotMatch(frame.body, /010-2222-3333|customerPhone|receiptKey/);
    const nonce = frame.body.match(/const handshakeNonce = "([^"]+)";/)?.[1];
    assert.ok(nonce);
    const session = await app.inject({ method: 'POST', url: '/v1/embed/sessions', payload: { nonce } });
    assert.equal(session.statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/embed/sessions', payload: { nonce } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/embed/engagements', headers: {
      authorization: `Bearer ${session.json().token}` } })).json().error, 'blocked_integration');
    const handoff = await app.inject({ method: 'POST', url: '/v1/embed/handoffs',
      headers: { authorization: `Bearer ${session.json().token}` },
      payload: { question: '상담 희망 조건을 알려 주세요.', conditions: '다음 주 오후 방문 희망' } });
    assert.equal(handoff.statusCode, 201);
    const ticket = handoff.json().ticket as string;
    assert.equal((await app.inject({ method: 'POST', url: '/v1/embed/continue',
      headers: { origin: 'https://distribution.example.test' }, payload: { ticket } })).statusCode, 403);
    const continued = await app.inject({ method: 'POST', url: '/v1/embed/continue',
      headers: { origin: 'http://localhost:3001' }, payload: { ticket } });
    assert.equal(continued.statusCode, 200);
    const cookies = continued.headers['set-cookie'] as string[];
    const contextCookie = cookies.find(value => value.startsWith('ap_embed_context='))?.split(';')[0];
    const consultCookie = cookies.find(value => value.startsWith('ap_consult_session='))?.split(';')[0];
    assert.ok(contextCookie); assert.ok(consultCookie);
    const context = await app.inject({ url: '/v1/embed/context', headers: { cookie: contextCookie } });
    assert.equal(context.json().question, '상담 희망 조건을 알려 주세요.');
    assert.equal(context.json().conditions, '다음 주 오후 방문 희망');
    assert.equal(context.json().serviceName, '상담 서비스');
    assert.equal(context.json().placementId, placementId);
    const conversationId = context.json().conversationId as string;
    assert.ok(conversationId);
    const submitted = await app.inject({ method: 'POST', url: `/v1/conversations/${conversationId}/submissions`,
      headers: { cookie: consultCookie, origin: 'http://localhost:3001' },
      payload: { name: '방문자', phone: '010-2222-3333', consent: true,
        serviceName: '상담 서비스', message: '안전한 화면에서 문의합니다.', placementId: randomUUID() } });
    assert.equal(submitted.statusCode, 201);
    assert.equal(submitted.json().id, conversationId);
    const stored = await pool.query<{ placement_id: string; customer_phone: string }>(
      'select placement_id, customer_phone from ap.inquiries where id = $1', [conversationId]);
    assert.equal(stored.rows[0]?.placement_id, placementId);
    assert.equal(stored.rows[0]?.customer_phone, '010-2222-3333');
    assert.equal((await app.inject({ method: 'POST', url: '/v1/embed/continue',
      headers: { origin: 'http://localhost:3001' }, payload: { ticket } })).statusCode, 410);
    const preview = await app.inject({ method: 'POST', url: `/v1/public/deployments/${publicId}/engagements`,
      headers: { origin: 'http://localhost:3001' } });
    assert.equal(preview.statusCode, 201);
    assert.equal((await pool.query<{ distribution_traffic_class: string }>(
      'select distribution_traffic_class from ap.inquiries where id = $1', [preview.json().id]))
      .rows[0]?.distribution_traffic_class, 'preview');
    const previousLimit = process.env.AP_PLACEMENT_ENGAGEMENT_DAILY_LIMIT;
    process.env.AP_PLACEMENT_ENGAGEMENT_DAILY_LIMIT = '1';
    try {
      assert.equal((await app.inject({ method: 'POST',
        url: `/v1/public/deployments/${publicId}/engagements` })).statusCode, 429);
      const limitFrame = await withModel.inject({ url: `/embed/v1/${publicId}/frame`,
        headers: { referer: 'https://distribution.example.test/article' } });
      const limitNonce = limitFrame.body.match(/const handshakeNonce = "([^"]+)";/)?.[1];
      assert.ok(limitNonce);
      const limitSession = await withModel.inject({ method: 'POST', url: '/v1/embed/sessions', payload: { nonce: limitNonce } });
      const limitToken = limitSession.json().token as string;
      assert.equal((await withModel.inject({ method: 'POST', url: '/v1/embed/engagements',
        headers: { authorization: `Bearer ${limitToken}` } })).statusCode, 429);
      const limitHandoff = await withModel.inject({ method: 'POST', url: '/v1/embed/handoffs',
        headers: { authorization: `Bearer ${limitToken}` }, payload: { question: '일일 한도 확인' } });
      assert.equal(limitHandoff.statusCode, 201);
      assert.equal((await withModel.inject({ method: 'POST', url: '/v1/embed/continue',
        headers: { origin: 'http://localhost:3001' }, payload: { ticket: limitHandoff.json().ticket } })).statusCode, 429);
    } finally {
      if (previousLimit === undefined) delete process.env.AP_PLACEMENT_ENGAGEMENT_DAILY_LIMIT;
      else process.env.AP_PLACEMENT_ENGAGEMENT_DAILY_LIMIT = previousLimit;
    }
    const aiFrame = await withModel.inject({ url: `/embed/v1/${publicId}/frame`,
      headers: { referer: 'https://distribution.example.test/article' } });
    const aiNonce = aiFrame.body.match(/const handshakeNonce = "([^"]+)";/)?.[1];
    assert.ok(aiNonce);
    const aiSession = await withModel.inject({ method: 'POST', url: '/v1/embed/sessions', payload: { nonce: aiNonce } });
    assert.equal(aiSession.statusCode, 201);
    const aiToken = aiSession.json().token as string;
    const aiStarted = await withModel.inject({ method: 'POST', url: '/v1/embed/engagements',
      headers: { authorization: `Bearer ${aiToken}` } });
    assert.equal(aiStarted.statusCode, 201);
    const aiConversationId = aiStarted.json().id as string;
    const aiAnswer = await withModel.inject({ method: 'POST', url: `/v1/engagements/${aiConversationId}/messages`,
      headers: { authorization: `Bearer ${aiToken}`, origin: 'https://distribution.example.test' },
      payload: { question: '어떤 서비스를 하나요?' } });
    assert.equal(aiAnswer.statusCode, 200);
    const aiHandoff = await withModel.inject({ method: 'POST', url: '/v1/embed/handoffs',
      headers: { authorization: `Bearer ${aiToken}` }, payload: { question: '희망 조건을 확인해 주세요.' } });
    assert.equal(aiHandoff.statusCode, 201);
    const aiContinued = await withModel.inject({ method: 'POST', url: '/v1/embed/continue',
      headers: { origin: 'http://localhost:3001' }, payload: { ticket: aiHandoff.json().ticket } });
    assert.equal(aiContinued.statusCode, 200);
    const aiConsultCookie = (aiContinued.headers['set-cookie'] as string[])
      .find(value => value.startsWith('ap_consult_session='))?.split(';')[0];
    assert.ok(aiConsultCookie);
    assert.equal((await withModel.inject({ url: `/v1/engagements/${aiConversationId}`,
      headers: { cookie: aiConsultCookie } })).json().messages.length, 2);
    const aiSubmitted = await withModel.inject({ method: 'POST', url: `/v1/conversations/${aiConversationId}/submissions`,
      headers: { cookie: aiConsultCookie, origin: 'http://localhost:3001' },
      payload: { name: '두번째 방문자', phone: '010-3333-4444', consent: true,
        serviceName: '상담 서비스', message: 'AI 답변 뒤 사람에게 문의합니다.' } });
    assert.equal(aiSubmitted.statusCode, 201);
    assert.equal((await pool.query<{ placement_id: string }>(
      'select placement_id from ap.inquiries where id = $1', [aiConversationId])).rows[0]?.placement_id, placementId);
    const classifyEmbed = async (headers: Record<string, string>, expected: 'bot' | 'test') => {
      const html = await app.inject({ url: `/embed/v1/${publicId}/frame`,
        headers: { referer: 'https://distribution.example.test/article' } });
      const nextNonce = html.body.match(/const handshakeNonce = "([^"]+)";/)?.[1];
      assert.ok(nextNonce);
      const started = await app.inject({ method: 'POST', url: '/v1/embed/sessions',
        headers, payload: { nonce: nextNonce } });
      assert.equal(started.statusCode, 201);
      const handoff = await app.inject({ method: 'POST', url: '/v1/embed/handoffs',
        headers: { authorization: `Bearer ${started.json().token}` }, payload: { question: '집계 제외 검수' } });
      assert.equal(handoff.statusCode, 201);
      const firstParty = await app.inject({ method: 'POST', url: '/v1/embed/continue',
        headers: { origin: 'http://localhost:3001' }, payload: { ticket: handoff.json().ticket } });
      assert.equal(firstParty.statusCode, 200);
      const contextCookie = (firstParty.headers['set-cookie'] as string[])
        .find(value => value.startsWith('ap_embed_context='))?.split(';')[0];
      assert.ok(contextCookie);
      const context = await app.inject({ url: '/v1/embed/context', headers: { cookie: contextCookie } });
      const marked = await pool.query<{ distribution_traffic_class: string }>(
        'select distribution_traffic_class from ap.inquiries where id = $1', [context.json().conversationId]);
      assert.equal(marked.rows[0]?.distribution_traffic_class, expected);
    };
    await classifyEmbed({ 'user-agent': 'Googlebot' }, 'bot');
    await classifyEmbed({ 'x-ap-test-traffic': 'true' }, 'test');
    const liveEvents = await pool.query<{ event_type: string; total: string }>(
      `select event_type, count(*)::text as total from ap.distribution_events
       where placement_id = $1 and traffic_class = 'live' group by event_type`, [placementId]);
    assert.deepEqual(Object.fromEntries(liveEvents.rows.map(row => [row.event_type, Number(row.total)])),
      { engagement_started: 2, contact_submitted: 2 });
    const currentMonday = new Date();
    currentMonday.setUTCHours(0, 0, 0, 0);
    currentMonday.setUTCDate(currentMonday.getUTCDate() - ((currentMonday.getUTCDay() + 6) % 7));
    const priorThursday = new Date(currentMonday.getTime() - 4 * 86400000).toISOString();
    const priorMonday = new Date(currentMonday.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    await pool.query('update ap.distribution_events set occurred_at = $2 where placement_id = $1',
      [placementId, priorThursday]);
    const metricsPath = `/v1/publishers/${publisherId}/metrics`;
    const small = await app.inject({ url: metricsPath, headers: { cookie: media.cookie } });
    assert.equal(small.statusCode, 200);
    assert.deepEqual(small.json().periods.find((period: { weekStart: string }) => period.weekStart === priorMonday),
      { weekStart: priorMonday, weekEnd: currentMonday.toISOString().slice(0, 10),
        engagements: 'under_5', contacts: 'under_5', bookings: 'unsupported_unconnected' });
    assert.equal((await app.inject({ url: metricsPath })).statusCode, 401);
    assert.equal((await app.inject({ url: metricsPath, headers: { cookie: outsider.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ url: '/v1/distribution/metrics', headers: { cookie: outsider.cookie } })).statusCode, 404);
    const seed = async (trafficClass: string) => {
      const id = randomUUID();
      await pool.query(
        `insert into ap.inquiries(id, organization_id, knowledge_release_id, knowledge_revision,
           deployment_id, agent_release_id, placement_id, consult_session_hash, consult_session_expires_at,
           distribution_traffic_class, state, mode, automation_paused)
         select $1, organization_id, knowledge_release_id, knowledge_revision,
           deployment_id, agent_release_id, placement_id, $2, now() + interval '1 hour',
           $3, 'ai_assisting', 'ai', false from ap.inquiries where id = $4`,
        [id, randomUUID(), trafficClass, conversationId]);
      await pool.query(
        `update ap.inquiries set customer_name = '합성 성과', customer_phone = '010-7777-8888',
          visitor_key_hash = $2, consent_at = now(), submitted_at = now(),
          state = 'needs_owner', mode = 'human', automation_paused = true where id = $1`,
        [id, randomUUID()]);
      await pool.query(
        `insert into ap.distribution_events(inquiry_id, event_type, placement_id, traffic_class, occurred_at)
         values ($1, 'engagement_started', $2, $3, $4), ($1, 'contact_submitted', $2, $3, $4)`,
        [id, placementId, trafficClass, priorThursday]);
      return id;
    };
    const liveInquiries: string[] = [];
    for (let index = 0; index < 3; index++) liveInquiries.push(await seed('live'));
    const excludedInquiries: string[] = [];
    for (const trafficClass of ['preview', 'test', 'bot']) {
      for (let index = 0; index < 5; index++) excludedInquiries.push(await seed(trafficClass));
    }
    const report = await app.inject({ url: metricsPath, headers: { cookie: media.cookie } });
    assert.equal(report.json().periods[0].engagements, '5-9');
    assert.equal(report.json().periods[0].contacts, '5-9');
    assert.equal(report.json().bookingConfirmed, 'unsupported_unconnected');
    assert.equal(report.json().revenue, 'not_measured');
    assert.equal((await app.inject({ url: '/v1/distribution/metrics', headers: { cookie: business.cookie } }))
      .json().periods[0].contacts, '5-9');
    const exported = await app.inject({ url: `${metricsPath}.csv`, headers: { cookie: media.cookie } });
    assert.equal(exported.statusCode, 200);
    assert.match(exported.headers['content-type'] ?? '', /text\/csv/);
    assert.match(exported.body, new RegExp(`${priorMonday},[0-9-]+,5-9,5-9,unsupported_unconnected,not_measured`));
    assert.doesNotMatch(report.body + exported.body, /010-|합성 성과|방문자|안전한 화면|"id"|placementId|inquiryId/);
    assert.equal((await app.inject({ url: '/v1/distribution/metrics.csv',
      headers: { cookie: business.cookie } })).statusCode, 200);
    const confirm = async (inquiryId: string, kind: 'reservation_request' | 'inquiry' = 'reservation_request') => {
      const actionId = randomUUID();
      const reservationId = randomUUID();
      const connectionId = randomUUID();
      await pool.query(`insert into ap.field_action_requests
        (id,organization_id,inquiry_id,connection_id,submission_key_hash,input_hash,field_body_hash,
         field_request_body,kind,service_id,service_snapshot,consent_record_id,consent_confirmed_at,
         state,external_request_id,reservation_id)
        values ($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb,$8,$9,'{}'::jsonb,$10,now(),
          'accepted_external',$11,$12)`,
      [actionId, organizationId, inquiryId, connectionId, randomBytes(32).toString('hex'),
        randomBytes(32).toString('hex'), randomBytes(32).toString('hex'), kind,
        randomUUID(), randomUUID(), randomUUID(), reservationId]);
      const db = await pool.connect();
      try {
        await db.query('begin');
        const action = { id: actionId, organization_id: organizationId, inquiry_id: inquiryId,
          connection_id: connectionId, reservation_id: reservationId };
        await recordFieldReservationEvent(db, action, { eventId: randomUUID(), revision: 1,
          eventType: 'field.reservation.confirmed', state: 'confirmed', occurredAt: priorThursday,
          customerNotificationOwnerProduct: 'ap', routeGeneration: 1 });
        await recordFieldReservationEvent(db, action, { eventId: randomUUID(), revision: 2,
          eventType: 'field.reservation.confirmed', state: 'confirmed', occurredAt: new Date().toISOString(),
          customerNotificationOwnerProduct: 'ap', routeGeneration: 1 });
        await db.query('commit');
      } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
    };
    for (const inquiryId of [conversationId, ...liveInquiries]) await confirm(inquiryId);
    await confirm(await seed('live'));
    for (const inquiryId of excludedInquiries) await confirm(inquiryId);
    await confirm(await seed('live'), 'inquiry');
    const confirmed = await app.inject({ url: metricsPath, headers: { cookie: media.cookie } });
    assert.equal(confirmed.statusCode, 200);
    assert.equal(confirmed.json().bookingConfirmed, 'available');
    assert.equal(confirmed.json().periods[0].bookings, '5-9');
    assert.equal(confirmed.json().revenue, 'not_measured');
    assert.equal((await app.inject({ url: '/v1/distribution/metrics', headers: { cookie: business.cookie } }))
      .json().periods[0].bookings, '5-9');
    const confirmedCsv = await app.inject({ url: `${metricsPath}.csv`, headers: { cookie: media.cookie } });
    assert.match(confirmedCsv.body, new RegExp(`${priorMonday},[0-9-]+,[^,]+,[^,]+,5-9,not_measured`));
    assert.doesNotMatch(confirmed.body + confirmedCsv.body, /010-|합성 성과|방문자|안전한 화면|"id"|placementId|inquiryId/);
    const laterFrame = await withModel.inject({ url: `/embed/v1/${publicId}/frame`,
      headers: { referer: 'https://distribution.example.test/article' } });
    const laterNonce = laterFrame.body.match(/const handshakeNonce = "([^"]+)";/)?.[1];
    assert.ok(laterNonce);
    const laterSession = await withModel.inject({ method: 'POST', url: '/v1/embed/sessions', payload: { nonce: laterNonce } });
    const laterToken = laterSession.json().token as string;
    const laterHandoff = await withModel.inject({ method: 'POST', url: '/v1/embed/handoffs',
      headers: { authorization: `Bearer ${laterToken}` }, payload: { question: '곧 중지될 카드' } });
    assert.equal(laterHandoff.statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/placements/${placementId}/cancel`,
      headers: { cookie: business.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/public/deployments/${publicId}` })).statusCode, 404);
    assert.equal((await app.inject({ url: `/embed/v1/${publicId}/frame`,
      headers: { referer: 'https://distribution.example.test/article' } })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/inquiries/${conversationId}`,
      headers: { authorization: `Bearer ${submitted.json().receiptKey}` } })).statusCode, 200);
    assert.equal((await withModel.inject({ method: 'POST', url: '/v1/embed/handoffs',
      headers: { authorization: `Bearer ${laterToken}` }, payload: { question: '취소 뒤 새 질문' } })).statusCode, 401);
    assert.equal((await withModel.inject({ method: 'POST', url: '/v1/embed/continue',
      headers: { origin: 'http://localhost:3001' }, payload: { ticket: laterHandoff.json().ticket } })).statusCode, 410);
    const after = await app.inject({ url: `/v1/publishers/${publisherId}/placements`, headers: { cookie: media.cookie } });
    assert.doesNotMatch(after.body, /010-2222-3333|010-3333-4444|안전한 화면에서 문의|AI 답변 뒤 사람/);
  } finally {
    await Promise.all([app.close(), withModel.close()]);
    if (organizationId) await pool.query('delete from ap.organizations where id = $1', [organizationId]);
    if (publisherId) await pool.query('delete from ap.publishers where id = $1', [publisherId]);
    await authPool.query('delete from "user" where email = any($1::text[])', [[business.email, media.email, outsider.email]]);
  }
});
