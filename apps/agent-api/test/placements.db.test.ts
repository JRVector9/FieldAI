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
async function actor() {
  const email = `placement-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic actor' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signedIn = await post('/sign-in/email');
  assert.equal(signedIn.status, 200);
  return { email, cookie: signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('publisher approves only the exact current card release and placement state remains scoped', async () => {
  const business = await actor();
  const media = await actor();
  const outsider = await actor();
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool, resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    verifyDomain: async () => true,
  });
  let organizationId = '';
  const publisherIds: string[] = [];
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie: business.cookie }, payload: { name: '배치 사업자' } });
    assert.equal(organization.statusCode, 201);
    organizationId = (organization.json() as { id: string }).id;
    const knowledge = { expectedRevision: 0, businessName: '배치 사업자', introduction: '', services: [
      { name: '서비스 하나', description: '확인된 첫 설명' }, { name: '서비스 둘', description: '확인된 둘째 설명' }], faqs: [] };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: { cookie: business.cookie }, payload: knowledge })).statusCode, 200);
    const approvedKnowledge = await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: business.cookie }, payload: { expectedRevision: 1 } });
    assert.equal(approvedKnowledge.statusCode, 201);
    const knowledgeReleaseId = (approvedKnowledge.json() as { releaseId: string }).releaseId;
    const campaign = await app.inject({ method: 'POST', url: '/v1/campaigns', headers: { cookie: business.cookie },
      payload: { name: '배치 카드', knowledgeReleaseId, serviceIndex: 0 } });
    assert.equal(campaign.statusCode, 201);
    const campaignId = (campaign.json() as { id: string }).id;
    const firstPublish = await app.inject({ method: 'POST', url: `/v1/campaigns/${campaignId}/releases`, headers: { cookie: business.cookie },
      payload: { expectedRevision: 1, idempotencyKey: randomUUID(), confirmApprovedFacts: true } });
    assert.equal(firstPublish.statusCode, 201);
    const releaseOne = (firstPublish.json() as { releaseId: string }).releaseId;
    const publisher = await app.inject({ method: 'POST', url: '/v1/publishers', headers: { cookie: media.cookie }, payload: { name: '뉴스 매체' } });
    assert.equal(publisher.statusCode, 201);
    const publisherId = (publisher.json() as { id: string }).id;
    publisherIds.push(publisherId);
    const domain = await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/domains`, headers: { cookie: media.cookie },
      payload: { origin: 'https://placement.example.test' } });
    assert.equal(domain.statusCode, 201);
    const domainId = (domain.json() as { id: string }).id;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/domains/${domainId}/verify`, headers: { cookie: media.cookie } })).statusCode, 200);
    const slot = await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots`, headers: { cookie: media.cookie },
      payload: { domainId, name: '기사 카드', format: 'article' } });
    assert.equal(slot.statusCode, 201);
    const slotId = (slot.json() as { id: string }).id;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots/${slotId}/activate`, headers: { cookie: media.cookie } })).statusCode, 200);
    const slotTwo = await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots`, headers: { cookie: media.cookie },
      payload: { domainId, name: '사이드 카드', format: 'sidebar' } });
    assert.equal(slotTwo.statusCode, 201);
    const slotTwoId = (slotTwo.json() as { id: string }).id;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots/${slotTwoId}/activate`, headers: { cookie: media.cookie } })).statusCode, 200);
    const slots = await app.inject({ url: '/v1/placement-slots', headers: { cookie: business.cookie } });
    assert.equal(slots.statusCode, 200);
    const ownSlots = (slots.json() as { slots: { id: string; publisherId: string }[] }).slots
      .filter(item => item.publisherId === publisherId).map(item => item.id).sort();
    assert.deepEqual(ownSlots, [slotId, slotTwoId].sort());
    const request = { campaignId, releaseId: releaseOne, slotId, idempotencyKey: randomUUID() };
    assert.equal((await app.inject({ method: 'POST', url: '/v1/placements', payload: request })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/placements', headers: { cookie: outsider.cookie }, payload: request })).statusCode, 404);
    const placed = await app.inject({ method: 'POST', url: '/v1/placements', headers: { cookie: business.cookie }, payload: request });
    assert.equal(placed.statusCode, 201);
    const placementId = (placed.json() as { id: string }).id;
    assert.equal((await app.inject({ method: 'POST', url: '/v1/placements', headers: { cookie: business.cookie }, payload: request })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/placements', headers: { cookie: business.cookie },
      payload: { ...request, slotId: slotTwoId } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/placements', headers: { cookie: business.cookie },
      payload: { ...request, idempotencyKey: randomUUID() } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/public/placements/${placementId}` })).statusCode, 404);
    const mediaQueue = await app.inject({ url: `/v1/publishers/${publisherId}/placements`, headers: { cookie: media.cookie } });
    assert.equal(mediaQueue.statusCode, 200);
    const pending = (mediaQueue.json() as { placements: { id: string; releaseId: string; contentHash: string; card: { serviceName: string } }[] }).placements[0];
    assert.ok(pending);
    assert.equal(pending.id, placementId);
    assert.equal(pending.card.serviceName, '서비스 하나');
    assert.doesNotMatch(mediaQueue.body, /customerPhone|receiptKey|conversation/);
    const otherPublisher = await app.inject({ method: 'POST', url: '/v1/publishers', headers: { cookie: outsider.cookie }, payload: { name: '다른 매체' } });
    assert.equal(otherPublisher.statusCode, 201);
    const otherPublisherId = (otherPublisher.json() as { id: string }).id;
    publisherIds.push(otherPublisherId);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${otherPublisherId}/placements/${placementId}/approve`, headers: { cookie: outsider.cookie },
      payload: { expectedReleaseId: releaseOne, expectedContentHash: pending.contentHash } })).statusCode, 404);
    const outsiderId = (await authPool.query<{ id: string }>('select id from "user" where email = $1', [outsider.email])).rows[0]!.id;
    await pool.query('insert into ap.publisher_memberships(publisher_id, user_id, role) values ($1, $2, $3)',
      [publisherId, outsiderId, 'editor']);
    assert.equal((await app.inject({ url: `/v1/publishers/${publisherId}/placements`, headers: { cookie: outsider.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/placements/${placementId}/approve`, headers: { cookie: outsider.cookie },
      payload: { expectedReleaseId: releaseOne, expectedContentHash: pending.contentHash } })).statusCode, 404);
    const edited = await app.inject({ method: 'PUT', url: `/v1/campaigns/${campaignId}/draft`, headers: { cookie: business.cookie },
      payload: { expectedRevision: 1, name: '새 초안', knowledgeReleaseId, serviceIndex: 1 } });
    assert.equal(edited.statusCode, 200);
    const stillSame = await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/placements/${placementId}/approve`, headers: { cookie: media.cookie },
      payload: { expectedReleaseId: releaseOne, expectedContentHash: pending.contentHash } });
    assert.equal(stillSame.statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/placements/${placementId}/approve`, headers: { cookie: media.cookie },
      payload: { expectedReleaseId: releaseOne, expectedContentHash: '0'.repeat(64) } })).statusCode, 409);
    assert.equal((await app.inject({ url: `/v1/public/placements/${placementId}` })).statusCode, 200);
    const secondPublish = await app.inject({ method: 'POST', url: `/v1/campaigns/${campaignId}/releases`, headers: { cookie: business.cookie },
      payload: { expectedRevision: 2, idempotencyKey: randomUUID(), confirmApprovedFacts: true } });
    assert.equal(secondPublish.statusCode, 201);
    const releaseTwo = (secondPublish.json() as { releaseId: string }).releaseId;
    assert.equal((await app.inject({ url: `/v1/public/placements/${placementId}` })).statusCode, 404);
    const requestTwo = await app.inject({ method: 'POST', url: '/v1/placements', headers: { cookie: business.cookie },
      payload: { campaignId, releaseId: releaseTwo, slotId, idempotencyKey: randomUUID() } });
    assert.equal(requestTwo.statusCode, 201);
    const placementTwoId = (requestTwo.json() as { id: string }).id;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/placements/${placementTwoId}/approve`, headers: { cookie: media.cookie },
      payload: { expectedReleaseId: releaseOne, expectedContentHash: pending.contentHash } })).statusCode, 409);
    const queueTwo = await app.inject({ url: `/v1/publishers/${publisherId}/placements`, headers: { cookie: media.cookie } });
    const next = (queueTwo.json() as { placements: { id: string; contentHash: string }[] }).placements.find(item => item.id === placementTwoId)!;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/placements/${placementTwoId}/approve`, headers: { cookie: media.cookie },
      payload: { expectedReleaseId: releaseTwo, expectedContentHash: next.contentHash } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/public/placements/${placementTwoId}` })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots/${slotId}/pause`, headers: { cookie: media.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/public/placements/${placementTwoId}` })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots/${slotId}/activate`, headers: { cookie: media.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/public/placements/${placementTwoId}` })).statusCode, 200);
    await pool.query("update ap.publisher_domains set verified_until = now() - interval '1 minute' where id = $1", [domainId]);
    assert.equal((await app.inject({ url: `/v1/public/placements/${placementTwoId}` })).statusCode, 404);
    await pool.query("update ap.publisher_domains set verified_until = now() + interval '7 days' where id = $1", [domainId]);
    assert.equal((await app.inject({ url: `/v1/public/placements/${placementTwoId}` })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/placements/${placementTwoId}/cancel`, headers: { cookie: media.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/placements/${placementTwoId}/cancel`, headers: { cookie: business.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/public/placements/${placementTwoId}` })).statusCode, 404);
    const rejectRequest = await app.inject({ method: 'POST', url: '/v1/placements', headers: { cookie: business.cookie },
      payload: { campaignId, releaseId: releaseTwo, slotId: slotTwoId, idempotencyKey: randomUUID() } });
    assert.equal(rejectRequest.statusCode, 201);
    const rejectedId = (rejectRequest.json() as { id: string }).id;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/placements/${rejectedId}/reject`, headers: { cookie: media.cookie },
      payload: { expectedReleaseId: releaseTwo, reason: '위치 정책' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/placements/${rejectedId}/approve`, headers: { cookie: media.cookie },
      payload: { expectedReleaseId: releaseTwo, expectedContentHash: next.contentHash } })).statusCode, 409);
    assert.equal((await app.inject({ url: `/v1/public/placements/${rejectedId}` })).statusCode, 404);
  } finally {
    await app.close();
    if (organizationId) await pool.query('delete from ap.organizations where id = $1', [organizationId]);
    for (const id of publisherIds) await pool.query('delete from ap.publishers where id = $1', [id]);
    await authPool.query('delete from "user" where email = any($1::text[])', [[business.email, media.email, outsider.email]]);
  }
});
