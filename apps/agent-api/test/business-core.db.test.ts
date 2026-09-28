import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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
test('mock profile permits local email sign-in without a delivery provider', async () => {
  const email = `mock-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  try {
    const signUp = await auth.handler(new Request(`${base}/api/auth/sign-up/email`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ email, password, name: 'Mock owner' }),
    }));
    assert.equal(signUp.status, 200);
    const signIn = await auth.handler(new Request(`${base}/api/auth/sign-in/email`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ email, password }),
    }));
    assert.equal(signIn.status, 200);
  } finally {
    await authPool.query('DELETE FROM "user" WHERE email = $1', [email]);
  }
});
async function createOwner() {
  const email = `owner-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic owner' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  await authPool.query('UPDATE "user" SET "emailVerified" = true WHERE email = $1', [email]);
  const signedIn = await post('/sign-in/email');
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.match(cookie, /session_token/);
  return { email, cookie };
}

test('AP owner approves a native draft; another owner cannot edit it; public sees only the release', async () => {
  const owner = await createOwner();
  const other = await createOwner();
  const app = createAgentApp(
    async () => undefined, auth.handler, base, undefined,
    {
      pool,
      resolveUserId: async (headers: IncomingHttpHeaders) =>
        (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    },
  );
  try {
    const denied = await app.inject({ method: 'POST', url: '/v1/organizations', payload: { name: '실제 상호' } });
    assert.equal(denied.statusCode, 401);

    const created = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie: owner.cookie }, payload: { name: '실제 상호' } });
    assert.equal(created.statusCode, 201);
    const { id: organizationId } = created.json() as { id: string };
    assert.match(organizationId, /^[0-9a-f-]{36}$/);

    const initial = await app.inject({ url: '/v1/knowledge/draft', headers: { cookie: owner.cookie } });
    assert.equal(initial.statusCode, 200);
    assert.equal((initial.json() as { revision: number }).revision, 0);
    assert.equal(initial.json().region, '');
    assert.equal(initial.json().openingHours, '');

    const draft = {
      expectedRevision: 0, businessName: '실제 상호', introduction: '사업자가 작성한 소개',
      region: ' 서울 강남구·서초구 ', openingHours: ' 평일 09:00–18:00 ',
      services: [{ name: '상담', description: '서비스 설명' }],
      faqs: [{ question: '어디에서 운영하나요?', answer: '서울에서 운영합니다.' }],
    };
    const saved = await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: { cookie: owner.cookie }, payload: draft });
    assert.equal(saved.statusCode, 200);
    assert.equal((saved.json() as { revision: number }).revision, 1);
    assert.equal(saved.json().region, '서울 강남구·서초구');
    assert.equal(saved.json().openingHours, '평일 09:00–18:00');

    const beforeApproval = await app.inject({ url: `/v1/public/organizations/${organizationId}` });
    assert.equal(beforeApproval.statusCode, 404);
    const stale = await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: owner.cookie }, payload: { expectedRevision: 0 } });
    assert.equal(stale.statusCode, 409);

    const otherDraft = await app.inject({ url: '/v1/knowledge/draft', headers: { cookie: other.cookie } });
    assert.equal(otherDraft.statusCode, 404);
    const otherApproval = await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: other.cookie }, payload: { expectedRevision: 1 } });
    assert.equal(otherApproval.statusCode, 404);

    const approved = await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: owner.cookie }, payload: { expectedRevision: 1 } });
    assert.equal(approved.statusCode, 201);
    const release = approved.json() as { releaseId: string; revision: number };
    assert.equal(release.revision, 1);
    const repeated = await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: owner.cookie }, payload: { expectedRevision: 1 } });
    assert.equal(repeated.statusCode, 200);
    assert.equal((repeated.json() as { releaseId: string }).releaseId, release.releaseId);

    const publicView = await app.inject({ url: `/v1/public/organizations/${organizationId}` });
    assert.equal(publicView.statusCode, 200);
    assert.equal((publicView.json() as { businessName: string }).businessName, '실제 상호');
    assert.equal(publicView.json().region, '서울 강남구·서초구');
    assert.equal(publicView.json().openingHours, '평일 09:00–18:00');
    assert.doesNotMatch(publicView.body, /approvedBy|ownerUserId/);

    const nextDraft = await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: { cookie: owner.cookie }, payload: { ...draft, expectedRevision: 1, introduction: '아직 승인하지 않은 문구', region: '미승인 지역', openingHours: '미승인 시간' } });
    assert.equal(nextDraft.statusCode, 200);
    assert.equal((nextDraft.json() as { revision: number }).revision, 2);
    const ownerVersion = await app.inject({ url: '/v1/knowledge/draft', headers: { cookie: owner.cookie } });
    assert.equal(ownerVersion.json().role, 'owner');
    assert.equal(ownerVersion.json().releaseRevision, 1);
    assert.equal(ownerVersion.json().releaseDraftRevision, 1);
    const stillPublic = await app.inject({ url: `/v1/public/organizations/${organizationId}` });
    assert.equal(stillPublic.statusCode, 200);
    assert.doesNotMatch(stillPublic.body, /아직 승인하지 않은 문구/);
    assert.equal(stillPublic.json().region, '서울 강남구·서초구');
    assert.equal(stillPublic.json().openingHours, '평일 09:00–18:00');

    const invalidPublicId = await app.inject({ url: '/v1/public/organizations/------------------------------------' });
    assert.equal(invalidPublicId.statusCode, 404);
    await pool.query(
      `INSERT INTO ap.memberships(organization_id, user_id, role)
       VALUES ($1, (SELECT id FROM "user" WHERE email = $2), 'editor')`,
      [organizationId, other.email],
    );
    const editorCanRead = await app.inject({ url: '/v1/knowledge/draft', headers: { cookie: other.cookie, 'x-organization-id': organizationId } });
    assert.equal(editorCanRead.statusCode, 200);
    assert.equal(editorCanRead.json().role, 'editor');
    const editorCannotApprove = await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: other.cookie, 'x-organization-id': organizationId }, payload: { expectedRevision: 2 } });
    assert.equal(editorCannotApprove.statusCode, 404);
    const editorPatch = await app.inject({ method: 'PATCH', url: '/v1/knowledge/draft', headers: { cookie: other.cookie, 'x-organization-id': organizationId }, payload: { expectedRevision: 2, introduction: '편집자가 보완한 초안' } });
    assert.equal(editorPatch.statusCode, 200);
    assert.equal((editorPatch.json() as { revision: number }).revision, 3);
    assert.equal(editorPatch.json().region, '미승인 지역');
    assert.equal(editorPatch.json().openingHours, '미승인 시간');
    for (const invalid of [{ region: 1 }, { region: null }, { region: '가'.repeat(501) },
      { openingHours: false }, { openingHours: null }, { openingHours: '가'.repeat(1001) }]) {
      const rejected = await app.inject({ method: 'PATCH', url: '/v1/knowledge/draft',
        headers: { cookie: owner.cookie }, payload: { expectedRevision: 3, ...invalid } });
      assert.equal(rejected.statusCode, 400, rejected.body);
    }
    const stalePatch = await app.inject({ method: 'PATCH', url: '/v1/knowledge/draft', headers: { cookie: other.cookie, 'x-organization-id': organizationId }, payload: { expectedRevision: 2, introduction: '오래된 수정' } });
    assert.equal(stalePatch.statusCode, 409);
    await pool.query("update ap.memberships set role = 'viewer' where organization_id = $1 and user_id = (select id from \"user\" where email = $2)",
      [organizationId, other.email]);
    const viewerCanRead = await app.inject({ url: '/v1/knowledge/draft', headers: { cookie: other.cookie, 'x-organization-id': organizationId } });
    assert.equal(viewerCanRead.statusCode, 200);
    assert.equal(viewerCanRead.json().role, 'viewer');
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft',
      headers: { cookie: other.cookie, 'x-organization-id': organizationId },
      payload: { ...draft, expectedRevision: 3 } })).statusCode, 404);
  } finally {
    await app.close();
    await pool.query('DELETE FROM ap.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [owner.email]).catch(() => undefined);
    await authPool.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [[owner.email, other.email]]);
  }
});

test('AP retains incomplete native knowledge privately and rejects approval until required facts are complete', async () => {
  const owner = await createOwner();
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  try {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: owner.cookie }, payload: { name: '작성 중인 AP 조직' } });
    assert.equal(created.statusCode, 201);
    const organizationId = (created.json() as { id: string }).id;
    const incomplete = { expectedRevision: 0, businessName: '', introduction: '작성 중인 소개',
      services: [{ name: '', description: '아직 이름 없음' }],
      faqs: [{ question: '질문 작성 중', answer: '' }] };
    const saved = await app.inject({ method: 'PUT', url: '/v1/knowledge/draft',
      headers: { cookie: owner.cookie }, payload: incomplete });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json().revision, 1);
    const resumed = await app.inject({ url: '/v1/knowledge/draft', headers: { cookie: owner.cookie } });
    assert.equal(resumed.statusCode, 200);
    assert.equal(resumed.json().businessName, '');
    assert.equal(resumed.json().services[0].name, '');
    assert.equal(resumed.json().faqs[0].answer, '');
    const denied = await app.inject({ method: 'POST', url: '/v1/knowledge/releases',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 1 } });
    assert.equal(denied.statusCode, 409);
    assert.equal(denied.json().error, 'knowledge_incomplete');
    assert.equal((await app.inject({ url: `/v1/public/organizations/${organizationId}` })).statusCode, 404);
    const completed = await app.inject({ method: 'PUT', url: '/v1/knowledge/draft',
      headers: { cookie: owner.cookie }, payload: { ...incomplete, expectedRevision: 1,
        businessName: '완성된 AP 상호', services: [{ name: '상담', description: '서비스 설명' }],
        faqs: [{ question: '질문 작성 중', answer: '확인된 답변' }] } });
    assert.equal(completed.statusCode, 200, completed.body);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 2 } })).statusCode, 201);
    const publicView = await app.inject({ url: `/v1/public/organizations/${organizationId}` });
    assert.equal(publicView.statusCode, 200);
    assert.equal(publicView.json().services[0].name, '상담');
    assert.equal(publicView.json().faqs[0].answer, '확인된 답변');
    assert.equal(publicView.json().region, '');
    assert.equal(publicView.json().openingHours, '');
  } finally {
    await app.close();
    await pool.query('DELETE FROM ap.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [owner.email]).catch(() => undefined);
    await authPool.query('DELETE FROM "user" WHERE email = $1', [owner.email]);
  }
});

test('AP reads older native JSONB drafts and immutable releases without inventing region or hours', async () => {
  const owner = await createOwner();
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool, resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  try {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: owner.cookie }, payload: { name: '구버전 AP 조직' } });
    assert.equal(created.statusCode, 201);
    const organizationId = created.json().id as string;
    await pool.query(`update ap.knowledge_drafts set revision = 1,
      content = content - 'region' - 'openingHours' where organization_id = $1`, [organizationId]);
    const resumed = await app.inject({ url: '/v1/knowledge/draft', headers: { cookie: owner.cookie } });
    assert.equal(resumed.json().region, '');
    assert.equal(resumed.json().openingHours, '');
    const approved = await app.inject({ method: 'POST', url: '/v1/knowledge/releases',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 1 } });
    assert.equal(approved.statusCode, 201, approved.body);
    const original = await pool.query<{ content: Record<string, unknown>; content_hash: string }>(
      'select content, content_hash from ap.knowledge_releases where id = $1', [approved.json().releaseId]);
    assert.ok(!('region' in original.rows[0]!.content));
    const publicView = await app.inject({ url: `/v1/public/organizations/${organizationId}` });
    assert.equal(publicView.json().region, '');
    assert.equal(publicView.json().openingHours, '');
    const afterRead = await pool.query(
      'select content, content_hash from ap.knowledge_releases where id = $1', [approved.json().releaseId]);
    assert.deepEqual(afterRead.rows, original.rows);
  } finally {
    await app.close();
    await pool.query('delete from ap.organizations where owner_user_id = (select id from "user" where email = $1)', [owner.email]);
    await authPool.query('delete from "user" where email = $1', [owner.email]);
  }
});
