import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import type { IncomingHttpHeaders } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4311';
async function owner() {
  const email = `deployment-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic deployment owner' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const session = await post('/sign-in/email');
  assert.equal(session.status, 200);
  return { email, cookie: session.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('AP link and owned widget require approved AI, tenant ownership and verified exact origin', async () => {
  const first = await owner();
  const second = await owner();
  const seen: { host: string; proof: string }[] = [];
  let verified = false;
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    verifyDomain: async (host: string, proof: string) => { seen.push({ host, proof }); return verified; },
    customerDailyLimit: 5,
    modelProvider: { model: 'synthetic-owned-widget', generate: async () => ({
      output: { answer: '승인된 안내입니다.', evidenceIds: ['business'], unknowns: [], handoffRecommended: false },
      inputTokens: 12, outputTokens: 6, responseId: `synthetic-${randomUUID()}`,
    }) },
  });
  try {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie: first.cookie },
      payload: { name: '독립 상담 상점' } });
    assert.equal(created.statusCode, 201);
    const organizationId = (created.json() as { id: string }).id;
    const premature = await app.inject({ method: 'POST', url: '/v1/deployments', headers: { cookie: first.cookie },
      payload: { kind: 'link' } });
    assert.equal(premature.statusCode, 409);
    const knowledge = { expectedRevision: 0, businessName: '독립 상담 상점', introduction: '승인된 안내입니다.', services: [], faqs: [] };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: { cookie: first.cookie }, payload: knowledge })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: first.cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    const agent = { expectedRevision: 0, expectedKnowledgeRevision: 1,
      name: '상담 AI', tone: 'clear', guideScope: '', handoffText: '담당자가 답변합니다.' };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/agents/draft', headers: { cookie: first.cookie }, payload: agent })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/releases', headers: { cookie: first.cookie }, payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } })).statusCode, 201);
    const createKey = randomUUID();
    const invalidCreateKey = await app.inject({ method: 'POST', url: '/v1/deployments', headers: { cookie: first.cookie },
      payload: { kind: 'link', idempotencyKey: 'not-a-uuid' } });
    assert.equal(invalidCreateKey.statusCode, 400);
    const firstCreate = await app.inject({ method: 'POST', url: '/v1/deployments', headers: { cookie: first.cookie },
      payload: { kind: 'link', idempotencyKey: createKey } });
    assert.equal(firstCreate.statusCode, 201);
    const replayCreate = await app.inject({ method: 'POST', url: '/v1/deployments', headers: { cookie: first.cookie },
      payload: { kind: 'link', idempotencyKey: createKey } });
    assert.equal(replayCreate.statusCode, 200);
    assert.deepEqual(replayCreate.json(), firstCreate.json());
    const changedCreate = await app.inject({ method: 'POST', url: '/v1/deployments', headers: { cookie: first.cookie },
      payload: { kind: 'owned_embed', origin: 'https://owned.example.test', idempotencyKey: createKey } });
    assert.equal(changedCreate.statusCode, 409);
    const parallelKey = randomUUID();
    const parallelCreates = await Promise.all([0, 1].map(() => app.inject({ method: 'POST', url: '/v1/deployments',
      headers: { cookie: first.cookie }, payload: { kind: 'link', idempotencyKey: parallelKey } })));
    assert.deepEqual(parallelCreates.map(result => result.statusCode).sort(), [200, 201]);
    assert.equal(parallelCreates[0]?.json().id, parallelCreates[1]?.json().id);
    const uniqueRows = await pool.query<{ count: string }>(
      'select count(*)::text as count from ap.deployments where organization_id = $1 and creation_key = $2',
      [organizationId, parallelKey]);
    assert.equal(uniqueRows.rows[0]?.count, '1');
    const link = await app.inject({ method: 'POST', url: '/v1/deployments', headers: { cookie: first.cookie }, payload: { kind: 'link' } });
    assert.equal(link.statusCode, 201);
    const linkId = (link.json() as { id: string }).id;
    const linkPublicId = (link.json() as { publicId: string }).publicId;
    assert.equal((await app.inject({ url: `/v1/public/deployments/${linkPublicId}` })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${linkId}/activate`, headers: { cookie: second.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${linkId}/activate`, headers: { cookie: first.cookie } })).statusCode, 200);
    const publicLink = await app.inject({ url: `/v1/public/deployments/${linkPublicId}` });
    assert.equal(publicLink.statusCode, 200);
    assert.equal((publicLink.json() as { organizationId: string }).organizationId, organizationId);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${linkId}/pause`, headers: { cookie: first.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/public/deployments/${linkPublicId}` })).statusCode, 404);
    const invalidOrigin = await app.inject({ method: 'POST', url: '/v1/deployments', headers: { cookie: first.cookie },
      payload: { kind: 'owned_embed', origin: 'https://owned.example.test/path' } });
    assert.equal(invalidOrigin.statusCode, 400);
    const embedKey = randomUUID();
    const embed = await app.inject({ method: 'POST', url: '/v1/deployments', headers: { cookie: first.cookie },
      payload: { kind: 'owned_embed', origin: 'https://owned.example.test', idempotencyKey: embedKey } });
    assert.equal(embed.statusCode, 201);
    const embedReplay = await app.inject({ method: 'POST', url: '/v1/deployments', headers: { cookie: first.cookie },
      payload: { kind: 'owned_embed', origin: 'https://owned.example.test', idempotencyKey: embedKey } });
    assert.equal(embedReplay.statusCode, 200);
    assert.deepEqual(embedReplay.json(), embed.json());
    const { id, publicId, verificationProof } = embed.json() as { id: string; publicId: string; verificationProof: string };
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${id}/activate`, headers: { cookie: first.cookie } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${id}/verify`, headers: { cookie: first.cookie } })).statusCode, 409);
    assert.deepEqual(seen, [{ host: 'owned.example.test', proof: verificationProof }]);
    verified = true;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${id}/verify`, headers: { cookie: first.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${id}/activate`, headers: { cookie: first.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/sdk/v1.js?deployment=${publicId}` })).statusCode, 200);
    const genericSdk = await app.inject({ url: '/sdk/v1.js' });
    assert.equal(genericSdk.statusCode, 200);
    assert.match(genericSdk.body, /data-deployment/);
    assert.match(genericSdk.body, /data-mode/);
    assert.match(genericSdk.body, /aria-expanded/);
    const allowed = await app.inject({ url: `/embed/v1/${publicId}/frame`, headers: { referer: 'https://owned.example.test/article' } });
    assert.equal(allowed.statusCode, 200);
    assert.match(allowed.headers['content-security-policy']?.toString() ?? '', /frame-ancestors https:\/\/owned\.example\.test/);
    const nonce = allowed.body.match(/const handshakeNonce = "([^"]+)";/)?.[1];
    assert.ok(nonce);
    const session = await app.inject({ method: 'POST', url: '/v1/embed/sessions', payload: { nonce } });
    assert.equal(session.statusCode, 201);
    const sessionToken = (session.json() as { token: string }).token;
    assert.equal((await app.inject({ method: 'POST', url: '/v1/embed/sessions', payload: { nonce } })).statusCode, 409);
    const started = await app.inject({ method: 'POST', url: '/v1/embed/engagements',
      headers: { authorization: `Bearer ${sessionToken}` } });
    assert.equal(started.statusCode, 201);
    const conversationId = started.json().id as string;
    assert.equal((await app.inject({ method: 'POST', url: '/v1/embed/engagements',
      headers: { authorization: `Bearer ${sessionToken}` } })).json().id, conversationId);
    assert.equal((await app.inject({ url: `/v1/engagements/${conversationId}` })).statusCode, 401);
    assert.equal((await app.inject({ url: `/v1/engagements/${conversationId}`,
      headers: { authorization: `Bearer ${randomBytes(32).toString('base64url')}` } })).statusCode, 401);
    const embedAnswer = await app.inject({ method: 'POST', url: `/v1/engagements/${conversationId}/messages`,
      headers: { authorization: `Bearer ${sessionToken}`, origin: 'https://owned.example.test' },
      payload: { question: '어떤 서비스를 제공하나요?' } });
    assert.equal(embedAnswer.statusCode, 200);
    assert.equal(embedAnswer.json().answer, '승인된 안내입니다.');
    const embedded = await app.inject({ url: `/v1/engagements/${conversationId}`,
      headers: { authorization: `Bearer ${sessionToken}` } });
    assert.deepEqual(embedded.json().messages.map((item: { actor: string }) => item.actor), ['customer', 'assistant']);
    const waitPage = await app.inject({ url: '/embed/v1/wait' });
    assert.match(waitPage.body, /\?handoff=1/);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/embed/handoffs',
      headers: { authorization: `Bearer ${sessionToken}` }, payload: { question: '010-1234-5678로 연락 주세요' } })).statusCode, 400);
    assert.equal((await app.inject({ url: '/v1/embed/context' })).statusCode, 401);
    const handoff = await app.inject({ method: 'POST', url: '/v1/embed/handoffs',
      headers: { authorization: `Bearer ${sessionToken}` }, payload: { question: '방문 상담은 몇 분인가요?' } });
    assert.equal(handoff.statusCode, 201);
    const ticket = (handoff.json() as { ticket: string }).ticket;
    assert.equal((await app.inject({ method: 'POST', url: '/v1/embed/continue',
      headers: { origin: 'https://owned.example.test' }, payload: { ticket } })).statusCode, 403);
    const continued = await app.inject({ method: 'POST', url: '/v1/embed/continue',
      headers: { origin: 'http://localhost:3001' }, payload: { ticket } });
    assert.equal(continued.statusCode, 200);
    const firstPartyCookie = continued.headers['set-cookie']?.toString().split(';')[0];
    assert.ok(firstPartyCookie);
    const context = await app.inject({ url: '/v1/embed/context', headers: { cookie: firstPartyCookie } });
    assert.equal(context.statusCode, 200);
    assert.deepEqual(context.json(), { publicId, question: '방문 상담은 몇 분인가요?', conversationId });
    const consultCookie = (continued.headers['set-cookie'] as string[]).find(value => value.startsWith('ap_consult_session='))?.split(';')[0];
    assert.ok(consultCookie);
    assert.equal((await app.inject({ url: `/v1/engagements/${conversationId}`,
      headers: { cookie: consultCookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/engagements/${conversationId}`,
      headers: { authorization: `Bearer ${sessionToken}` } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/embed/handoffs',
      headers: { authorization: `Bearer ${sessionToken}` }, payload: { question: '다시 전환' } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/embed/engagements',
      headers: { authorization: `Bearer ${sessionToken}` } })).statusCode, 401);
    const sameConversation = await app.inject({ method: 'POST', url: `/v1/conversations/${conversationId}/submissions`,
      headers: { cookie: consultCookie, origin: 'http://localhost:3001' },
      payload: { name: '위젯 방문자', phone: '010-2222-3333', consent: true, message: '사람 안내 부탁드립니다.' } });
    assert.equal(sameConversation.statusCode, 201);
    assert.equal(sameConversation.json().id, conversationId);
    const transcript = await app.inject({ url: `/v1/inquiries/${conversationId}`,
      headers: { authorization: `Bearer ${sameConversation.json().receiptKey}` } });
    assert.deepEqual(transcript.json().messages.map((item: { actor: string }) => item.actor), ['customer', 'assistant', 'customer']);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/embed/continue',
      headers: { origin: 'http://localhost:3001' }, payload: { ticket } })).statusCode, 410);
    assert.equal((await app.inject({ url: `/v1/embed/continue?ticket=${ticket}` })).statusCode, 404);
    const freshFrame = await app.inject({ url: `/embed/v1/${publicId}/frame`, headers: { referer: 'https://owned.example.test/article' } });
    const freshNonce = freshFrame.body.match(/const handshakeNonce = "([^"]+)";/)?.[1];
    const freshSession = await app.inject({ method: 'POST', url: '/v1/embed/sessions', payload: { nonce: freshNonce } });
    const directHandoff = await app.inject({ method: 'POST', url: '/v1/embed/handoffs',
      headers: { authorization: `Bearer ${freshSession.json().token}` }, payload: { question: '사람에게 바로 문의' } });
    const directContinue = await app.inject({ method: 'POST', url: '/v1/embed/continue',
      headers: { origin: 'http://localhost:3001' }, payload: { ticket: directHandoff.json().ticket } });
    assert.equal(directContinue.statusCode, 200);
    const directContextCookie = directContinue.headers['set-cookie']?.toString().split(';')[0];
    const directContext = (await app.inject({ url: '/v1/embed/context',
      headers: { cookie: directContextCookie } })).json() as {
        publicId: string; question: string; conversationId: string };
    assert.equal(directContext.publicId, publicId);
    assert.equal(directContext.question, '사람에게 바로 문의');
    assert.match(directContext.conversationId, /^[0-9a-f-]{36}$/);
    const directConsultCookie = (directContinue.headers['set-cookie'] as string[])
      .find(value => value.startsWith('ap_consult_session='))?.split(';')[0];
    assert.ok(directConsultCookie);
    const directCurrent = await app.inject({ url: `/v1/public/deployments/${publicId}/engagements/current`,
      headers: { cookie: directConsultCookie } });
    assert.equal(directCurrent.json().engagement?.id, directContext.conversationId);
    const directSubmission = await app.inject({ method: 'POST',
      url: `/v1/conversations/${directContext.conversationId}/submissions`,
      headers: { cookie: directConsultCookie, origin: 'http://localhost:3001' },
      payload: { name: '직접 인계 고객', phone: '010-3333-4444', consent: true, message: '사람에게 바로 문의' } });
    assert.equal(directSubmission.statusCode, 201);
    assert.equal(directSubmission.json().id, directContext.conversationId);
    const expiryFrame = await app.inject({ url: `/embed/v1/${publicId}/frame`, headers: { referer: 'https://owned.example.test/article' } });
    const expiryNonce = expiryFrame.body.match(/const handshakeNonce = "([^"]+)";/)?.[1];
    const expirySession = await app.inject({ method: 'POST', url: '/v1/embed/sessions', payload: { nonce: expiryNonce } });
    const expiring = await app.inject({ method: 'POST', url: '/v1/embed/handoffs',
      headers: { authorization: `Bearer ${expirySession.json().token}` }, payload: { question: '추가 질문' } });
    assert.equal(expiring.statusCode, 201);
    const expiredTicket = (expiring.json() as { ticket: string }).ticket;
    await pool.query("update ap.embed_handoffs set expires_at = now() - interval '1 second' where ticket_hash = $1",
      [createHash('sha256').update(expiredTicket).digest('hex')]);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/embed/continue',
      headers: { origin: 'http://localhost:3001' }, payload: { ticket: expiredTicket } })).statusCode, 410);
    assert.equal((await app.inject({ url: `/embed/v1/${publicId}/frame`, headers: { referer: 'https://owned.example.test.evil.invalid/' } })).statusCode, 403);
    assert.equal((await app.inject({ url: `/embed/v1/${publicId}/frame` })).statusCode, 403);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: { cookie: first.cookie },
      payload: { ...knowledge, expectedRevision: 1, introduction: '변경한 승인 안내입니다.' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: first.cookie },
      payload: { expectedRevision: 2 } })).statusCode, 201);
    assert.equal((await app.inject({ url: `/v1/public/deployments/${publicId}` })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${id}/activate`, headers: { cookie: first.cookie } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/releases', headers: { cookie: first.cookie },
      payload: { expectedRevision: 1, expectedKnowledgeRevision: 2 } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${id}/activate`, headers: { cookie: first.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/public/deployments/${publicId}` })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${id}/pause`, headers: { cookie: first.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/sdk/v1.js?deployment=${publicId}` })).statusCode, 404);
  } finally {
    await app.close();
    await pool.query('delete from ap.organizations where owner_user_id = (select id from "user" where email = $1)', [first.email]).catch(() => undefined);
    await authPool.query('delete from "user" where email = any($1::text[])', [[first.email, second.email]]);
  }
});
