import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
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
  const email = `campaign-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const request = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Campaign owner' }),
  }));
  assert.equal((await request('/sign-up/email')).status, 200);
  await authPool.query('UPDATE "user" SET "emailVerified" = true WHERE email = $1', [email]);
  const signedIn = await request('/sign-in/email');
  assert.equal(signedIn.status, 200);
  return { email, cookie: signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('AP card draft, owner approval, source hold and pause keep public release safe', async () => {
  const first = await owner();
  const other = await owner();
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool, resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  let organizationId = '';
  try {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie: first.cookie }, payload: { name: '확인된 상호' } });
    assert.equal(created.statusCode, 201);
    organizationId = (created.json() as { id: string }).id;
    const knowledge = { expectedRevision: 0, businessName: '확인된 상호', introduction: '',
      services: [{ name: '방문 상담', description: '현장 방문 상담을 제공합니다.' }], faqs: [] };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: { cookie: first.cookie }, payload: knowledge })).statusCode, 200);
    const approved = await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: first.cookie }, payload: { expectedRevision: 1 } });
    assert.equal(approved.statusCode, 201);
    const knowledgeReleaseId = (approved.json() as { releaseId: string }).releaseId;
    const draftPayload = { name: '가을 카드', knowledgeReleaseId, serviceIndex: 0 };
    assert.equal((await app.inject({ method: 'POST', url: '/v1/campaigns', payload: draftPayload })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/campaigns', headers: { cookie: other.cookie }, payload: draftPayload })).statusCode, 404);
    const card = await app.inject({ method: 'POST', url: '/v1/campaigns', headers: { cookie: first.cookie }, payload: draftPayload });
    assert.equal(card.statusCode, 201);
    const cardId = (card.json() as { id: string }).id;
    assert.equal((await app.inject({ url: `/v1/public/campaigns/${cardId}` })).statusCode, 404);
    const edited = await app.inject({ method: 'PUT', url: `/v1/campaigns/${cardId}/draft`, headers: { cookie: first.cookie },
      payload: { expectedRevision: 1, ...draftPayload, name: '수정한 카드' } });
    assert.equal(edited.statusCode, 200);
    assert.equal((await app.inject({ method: 'PUT', url: `/v1/campaigns/${cardId}/draft`, headers: { cookie: first.cookie },
      payload: { expectedRevision: 1, ...draftPayload } })).statusCode, 409);
    const approval = { expectedRevision: 2, idempotencyKey: randomUUID(), confirmApprovedFacts: true };
    assert.equal((await app.inject({ method: 'POST', url: `/v1/campaigns/${cardId}/releases`, headers: { cookie: first.cookie },
      payload: { ...approval, confirmApprovedFacts: false } })).statusCode, 400);
    await pool.query(`insert into ap.memberships(organization_id, user_id, role)
      values ($1, (select id from "user" where email = $2), 'editor')`, [organizationId, other.email]);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/campaigns/${cardId}/releases`,
      headers: { cookie: other.cookie, 'x-organization-id': organizationId }, payload: approval })).statusCode, 404);
    const published = await app.inject({ method: 'POST', url: `/v1/campaigns/${cardId}/releases`, headers: { cookie: first.cookie }, payload: approval });
    assert.equal(published.statusCode, 201);
    const releaseId = (published.json() as { releaseId: string }).releaseId;
    const retry = await app.inject({ method: 'POST', url: `/v1/campaigns/${cardId}/releases`, headers: { cookie: first.cookie }, payload: approval });
    assert.equal(retry.statusCode, 200);
    assert.equal((retry.json() as { releaseId: string }).releaseId, releaseId);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/campaigns/${cardId}/releases`, headers: { cookie: first.cookie },
      payload: { ...approval, expectedRevision: 1 } })).statusCode, 409);
    const publicCard = await app.inject({ url: `/v1/public/campaigns/${cardId}` });
    assert.equal(publicCard.statusCode, 200);
    assert.match(publicCard.body, /"advertisementLabel":"광고"/);
    assert.match(publicCard.body, /현장 방문 상담을 제공합니다/);
    assert.doesNotMatch(publicCard.body, /가을 카드|수정한 카드|approvedBy|idempotencyKey/);
    const newerKnowledge = { ...knowledge, expectedRevision: 1, services: [{ name: '방문 상담', description: '설명이 변경되었습니다.' }] };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: { cookie: first.cookie }, payload: newerKnowledge })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/public/campaigns/${cardId}` })).statusCode, 200);
    const newerRelease = await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: first.cookie }, payload: { expectedRevision: 2 } });
    assert.equal(newerRelease.statusCode, 201);
    assert.equal((await app.inject({ url: `/v1/public/campaigns/${cardId}` })).statusCode, 404);
    const refreshed = await app.inject({ method: 'PUT', url: `/v1/campaigns/${cardId}/draft`, headers: { cookie: first.cookie },
      payload: { expectedRevision: 2, ...draftPayload, knowledgeReleaseId: (newerRelease.json() as { releaseId: string }).releaseId } });
    assert.equal(refreshed.statusCode, 200);
    const newerPublication = await app.inject({ method: 'POST', url: `/v1/campaigns/${cardId}/releases`, headers: { cookie: first.cookie },
      payload: { expectedRevision: 3, idempotencyKey: randomUUID(), confirmApprovedFacts: true } });
    assert.equal(newerPublication.statusCode, 201);
    const newerReleaseId = (newerPublication.json() as { releaseId: string }).releaseId;
    const republished = await app.inject({ url: `/v1/public/campaigns/${cardId}` });
    assert.equal(republished.statusCode, 200);
    assert.match(republished.body, /설명이 변경되었습니다/);
    const paused = await app.inject({ method: 'POST', url: `/v1/campaigns/${cardId}/pause`, headers: { cookie: first.cookie }, payload: { expectedReleaseId: newerReleaseId } });
    assert.equal(paused.statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/public/campaigns/${cardId}` })).statusCode, 404);
    const releaseCount = await pool.query<{ count: string }>('select count(*)::text as count from ap.campaign_releases where campaign_id = $1', [cardId]);
    assert.equal(releaseCount.rows[0]?.count, '2');
  } finally {
    await app.close();
    if (organizationId) await pool.query('DELETE FROM ap.organizations WHERE id = $1', [organizationId]);
    await authPool.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [[first.email, other.email]]);
  }
});
