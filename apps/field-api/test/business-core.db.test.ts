import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import type { IncomingHttpHeaders } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
process.env.FIELD_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });

const base = 'http://127.0.0.1:4321';
async function createOwner() {
  const email = `field-owner-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic Field owner' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signedIn = await post('/sign-in/email');
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  return { email, cookie };
}

test('Field catalog keeps both booking modes and publishes only owner-approved facts', async () => {
  const owner = await createOwner();
  const other = await createOwner();
  const app = createFieldApp(
    async () => undefined, auth.handler, base,
    {
      pool,
      resolveUserId: async (headers: IncomingHttpHeaders) =>
        (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    },
  );
  try {
    const denied = await app.inject({ method: 'POST', url: '/v1/organizations', payload: { name: '실제 Field 상호' } });
    assert.equal(denied.statusCode, 401);
    const created = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie: owner.cookie }, payload: { name: '실제 Field 상호' } });
    assert.equal(created.statusCode, 201);
    const organizationId = (created.json() as { id: string }).id;
    const initial = await app.inject({ url: '/v1/business/draft', headers: { cookie: owner.cookie } });
    assert.equal(initial.statusCode, 200);
    assert.equal((initial.json() as { revision: number }).revision, 0);
    assert.equal(initial.json().defaultBookingMode, 'request');
    assert.equal(initial.json().industry, '');
    assert.deepEqual(initial.json().faqs, []);
    const services = [
      { id: randomUUID(), name: '기본 방식 상속', description: '사업장 기본 방식을 따릅니다', bookingMode: 'inherit', durationMinutes: 30, priceAmount: null },
      { id: randomUUID(), name: '시간표 선택형', description: '시간표에서 고릅니다', bookingMode: 'slot', durationMinutes: 60, priceAmount: 50000 },
      { id: randomUUID(), name: '희망 시간 고정', description: '사업장 기본 방식과 별도입니다', bookingMode: 'request', durationMinutes: 45, priceAmount: 30000 },
    ];
    const draft = {
      expectedRevision: 0, businessName: '실제 Field 상호', industry: '사진·촬영', introduction: '사업자가 입력한 소개', region: '서울',
      openingHours: '평일 10:00-18:00', contactPhone: '010-0000-0000', defaultBookingMode: 'request', services,
      faqs: [{ question: '방문 가능 지역은 어디인가요?', answer: '서울입니다.' }],
    };
    const saved = await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: { cookie: owner.cookie }, payload: draft });
    assert.equal(saved.statusCode, 200);
    assert.equal((saved.json() as { revision: number }).revision, 1);
    assert.deepEqual(saved.json().faqs, draft.faqs);
    assert.equal(saved.json().industry, '사진·촬영');
    assert.equal((await app.inject({ url: '/v1/business/draft', headers: { cookie: owner.cookie } })).json().industry,
      '사진·촬영');
    for (const industry of [null, 42, '가'.repeat(161)]) {
      assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft',
        headers: { cookie: owner.cookie }, payload: { ...draft, expectedRevision: 1, industry } })).statusCode, 400);
    }
    assert.equal((saved.json() as { services: typeof services }).services[1]?.bookingMode, 'slot');
    assert.equal((await app.inject({ url: `/v1/public/catalog/${organizationId}` })).statusCode, 404);
    assert.equal((await app.inject({ url: '/v1/business/draft', headers: { cookie: other.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: { cookie: other.cookie }, payload: { expectedRevision: 1 } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: { cookie: owner.cookie }, payload: { expectedRevision: 0 } })).statusCode, 409);
    const approved = await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: { cookie: owner.cookie }, payload: { expectedRevision: 1 } });
    assert.equal(approved.statusCode, 201);
    const releaseId = (approved.json() as { releaseId: string }).releaseId;
    const repeated = await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: { cookie: owner.cookie }, payload: { expectedRevision: 1 } });
    assert.equal(repeated.statusCode, 200);
    assert.equal((repeated.json() as { releaseId: string }).releaseId, releaseId);
    const publicCatalog = await app.inject({ url: `/v1/public/catalog/${organizationId}` });
    assert.equal(publicCatalog.statusCode, 200);
    assert.deepEqual(publicCatalog.json().faqs, draft.faqs);
    assert.equal(publicCatalog.json().industry, '사진·촬영');
    assert.deepEqual(publicCatalog.json().services.map((service: { bookingMode: string }) => service.bookingMode),
      ['request', 'slot', 'request']);
    assert.doesNotMatch(publicCatalog.body, /approvedBy|ownerUserId/);
    const next = await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: { cookie: owner.cookie }, payload: {
      ...draft, expectedRevision: 1, defaultBookingMode: 'slot', industry: '미승인 업종', introduction: '미승인 새 정보',
      faqs: [{ question: '미승인 질문', answer: '아직 공개되지 않았습니다.' }],
    } });
    assert.equal(next.statusCode, 200);
    const stillPublic = await app.inject({ url: `/v1/public/catalog/${organizationId}` });
    assert.doesNotMatch(stillPublic.body, /미승인 새 정보/);
    assert.equal(stillPublic.json().industry, '사진·촬영');
    assert.deepEqual(stillPublic.json().faqs, draft.faqs);
    assert.equal(stillPublic.json().services[0].bookingMode, 'request');
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 2 } })).statusCode, 201);
    const changedPublic = await app.inject({ url: `/v1/public/catalog/${organizationId}` });
    assert.deepEqual(changedPublic.json().services.map((service: { bookingMode: string }) => service.bookingMode),
      ['slot', 'slot', 'request']);
    assert.deepEqual(changedPublic.json().faqs, next.json().faqs);
    assert.equal(changedPublic.json().industry, '미승인 업종');
    const afterApproval = await app.inject({ url: '/v1/business/draft', headers: { cookie: owner.cookie } });
    assert.equal(afterApproval.json().services[0].bookingMode, 'inherit');
    assert.equal(afterApproval.json().defaultBookingMode, 'slot');
    const legacySave = await app.inject({ method: 'PUT', url: '/v1/business/draft',
      headers: { cookie: owner.cookie }, payload: { ...draft, expectedRevision: 2, introduction: '구버전 입력',
        defaultBookingMode: undefined, industry: undefined } });
    assert.equal(legacySave.statusCode, 200);
    assert.equal(legacySave.json().defaultBookingMode, 'slot');
    assert.equal(legacySave.json().industry, '미승인 업종');
    assert.deepEqual(legacySave.json().faqs, draft.faqs);
    const incompleteFaq = await app.inject({ method: 'PUT', url: '/v1/business/draft',
      headers: { cookie: owner.cookie }, payload: { ...draft, expectedRevision: 3,
        faqs: [{ question: '초안 질문', answer: '' }] } });
    assert.equal(incompleteFaq.statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 4 } })).json().error,
    'catalog_incomplete');
    assert.deepEqual((await app.inject({ url: `/v1/public/catalog/${organizationId}` })).json().faqs,
      next.json().faqs);
    const firstRelease = await pool.query<{ content: { services: { bookingMode: string }[] } }>(
      'select content from field.catalog_releases where organization_id = $1 and revision = 1', [organizationId]);
    assert.equal(firstRelease.rows[0]?.content.services[0]?.bookingMode, 'request');
  } finally {
    await app.close();
    await pool.query('DELETE FROM field.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [owner.email]).catch(() => undefined);
    await authPool.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [[owner.email, other.email]]);
  }
});

test('Field legacy catalogs read an unregistered industry without rewriting immutable facts', async () => {
  const owner = await createOwner();
  const app = createFieldApp(async () => undefined, auth.handler, base, {
    pool, resolveUserId: async headers =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  try {
    const organizationId = (await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: owner.cookie }, payload: { name: '구버전 업종 미등록' } })).json().id;
    await pool.query("update field.catalog_drafts set revision = 1, content = content - 'industry' where organization_id = $1",
      [organizationId]);
    const source = (await pool.query('select content from field.catalog_drafts where organization_id = $1',
      [organizationId])).rows[0].content;
    const content = JSON.stringify(source);
    const hash = createHash('sha256').update(content).digest('hex');
    const releaseId = randomUUID();
    await pool.query(`insert into field.catalog_releases
      (id, organization_id, revision, content, content_hash, approved_by)
      select $1, $2, 1, $3::jsonb, $4, owner_user_id from field.organizations where id = $2`,
    [releaseId, organizationId, content, hash]);
    assert.equal((await app.inject({ url: '/v1/business/draft', headers: { cookie: owner.cookie } })).json().industry, '');
    assert.equal((await app.inject({ url: `/v1/public/catalog/${organizationId}` })).json().industry, '');
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 1 } })).json().releaseId, releaseId);
    const stored = (await pool.query('select content, content_hash from field.catalog_releases where id = $1',
      [releaseId])).rows[0];
    assert.equal(stored.content_hash, hash);
    assert.deepEqual(stored.content, source);
    assert.equal(Object.hasOwn(stored.content, 'industry'), false);
    const saved = await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: { cookie: owner.cookie },
      payload: { ...source, expectedRevision: 1, industry: '기타 서비스' } });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().industry, '기타 서비스');
    assert.equal((await app.inject({ url: `/v1/public/catalog/${organizationId}` })).json().industry, '');
  } finally {
    await app.close();
    await pool.query('DELETE FROM field.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)',
      [owner.email]).catch(() => undefined);
    await authPool.query('DELETE FROM "user" WHERE email = $1', [owner.email]);
  }
});

test('Field owner inquiry list raises recent activity beyond 100 without crossing organizations', async () => {
  const first = await createOwner();
  const second = await createOwner();
  const app = createFieldApp(async () => undefined, auth.handler, base, {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  const organizations: string[] = [];
  try {
    for (const account of [first, second]) {
      const created = await app.inject({ method: 'POST', url: '/v1/organizations',
        headers: { cookie: account.cookie }, payload: { name: '문의 페이지 점검' } });
      assert.equal(created.statusCode, 201);
      organizations.push((created.json() as { id: string }).id);
    }
    const ids = Array.from({ length: 103 }, () => randomUUID());
    await pool.query(
      `insert into field.inquiries
        (id, organization_id, catalog_revision, service_id, service_snapshot,
         customer_name, customer_phone, visitor_key_hash, state, consent_at, created_at)
       select id, $1, 1, $3, $4::jsonb, '문의 고객', '01012345678', md5(id::text),
         'needs_owner', now(), '2026-09-26T00:00:00.123456Z'::timestamptz
       from unnest($2::uuid[]) as id`,
      [organizations[0], ids, randomUUID(), JSON.stringify({ name: '현장 상담' })],
    );
    const oldest = await pool.query<{ id: string }>(
      'select id from field.inquiries where organization_id = $1 order by created_at desc, id desc offset 102 limit 1',
      [organizations[0]],
    );
    await pool.query("update field.inquiries set updated_at = now() + interval '1 day' where id = $1", [oldest.rows[0]!.id]);
    const headers = { cookie: first.cookie };
    const firstPage = await app.inject({ url: '/v1/owner/inquiries', headers });
    assert.equal(firstPage.statusCode, 200);
    const firstData = firstPage.json() as { inquiries: { id: string; created_at: string; updated_at: string }[]; nextCursor: string | null };
    assert.equal(firstData.inquiries.length, 100);
    assert.equal(firstData.inquiries[0]?.id, oldest.rows[0]!.id);
    assert.ok(Date.parse(firstData.inquiries[0]!.updated_at) > Date.parse(firstData.inquiries[0]!.created_at));
    assert.ok(firstData.nextCursor);
    const secondPage = await app.inject({
      url: `/v1/owner/inquiries?cursor=${encodeURIComponent(firstData.nextCursor!)}`, headers });
    assert.equal(secondPage.statusCode, 200);
    const secondData = secondPage.json() as typeof firstData;
    assert.equal(secondData.inquiries.length, 3);
    assert.equal(secondData.nextCursor, null);
    const actualIds = [...firstData.inquiries, ...secondData.inquiries].map(item => item.id);
    const ordered = await pool.query<{ id: string }>(
      'select id from field.inquiries where organization_id = $1 order by updated_at desc, id desc', [organizations[0]]);
    assert.deepEqual(actualIds, ordered.rows.map(item => item.id));
    assert.equal(new Set(actualIds).size, 103);
    assert.equal((await app.inject({ url: '/v1/owner/inquiries?cursor=bad', headers })).statusCode, 400);
    assert.equal((await app.inject({
      url: `/v1/owner/external-requests?cursor=${encodeURIComponent(firstData.nextCursor!)}`, headers,
    })).statusCode, 400);
    const otherOwner = await app.inject({
      url: `/v1/owner/inquiries?cursor=${encodeURIComponent(firstData.nextCursor!)}`,
      headers: { cookie: second.cookie } });
    assert.equal(otherOwner.statusCode, 400);
  } finally {
    await app.close();
    if (organizations.length) await pool.query('delete from field.organizations where id = any($1::uuid[])', [organizations]);
    await authPool.query('delete from "user" where email = any($1::text[])', [[first.email, second.email]]);
  }
});

test('Field keeps incomplete service edits in a private draft and refuses to publish them', async () => {
  const owner = await createOwner();
  const app = createFieldApp(async () => undefined, auth.handler, base, {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  try {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: owner.cookie }, payload: { name: '작성 중인 Field 상호' } });
    assert.equal(created.statusCode, 201);
    const organizationId = (created.json() as { id: string }).id;
    const incomplete = { expectedRevision: 0, businessName: '', introduction: '작성 중인 소개',
      region: '', openingHours: '', contactPhone: '', defaultBookingMode: 'request',
      services: [{ id: randomUUID(), name: '', description: '작성 중인 서비스',
        bookingMode: 'inherit', durationMinutes: 0, priceAmount: null }] };
    const saved = await app.inject({ method: 'PUT', url: '/v1/business/draft',
      headers: { cookie: owner.cookie }, payload: incomplete });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json().revision, 1);
    const resumed = await app.inject({ url: '/v1/business/draft', headers: { cookie: owner.cookie } });
    assert.equal(resumed.statusCode, 200);
    assert.equal(resumed.json().businessName, '');
    assert.equal(resumed.json().services[0].name, '');
    assert.equal(resumed.json().services[0].durationMinutes, 0);
    const denied = await app.inject({ method: 'POST', url: '/v1/catalog/releases',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 1 } });
    assert.equal(denied.statusCode, 409);
    assert.equal(denied.json().error, 'catalog_incomplete');
    assert.equal((await app.inject({ url: `/v1/public/catalog/${organizationId}` })).statusCode, 404);
    const complete = await app.inject({ method: 'PUT', url: '/v1/business/draft',
      headers: { cookie: owner.cookie }, payload: { ...incomplete, expectedRevision: 1,
        businessName: '완성된 Field 상호', services: [{ ...incomplete.services[0],
          name: '방문 상담', durationMinutes: 30 }] } });
    assert.equal(complete.statusCode, 200, complete.body);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 2 } })).statusCode, 201);
    const publicCatalog = await app.inject({ url: `/v1/public/catalog/${organizationId}` });
    assert.equal(publicCatalog.json().services[0].name, '방문 상담');
  } finally {
    await app.close();
    await pool.query('DELETE FROM field.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [owner.email]).catch(() => undefined);
    await authPool.query('DELETE FROM "user" WHERE email = $1', [owner.email]);
  }
});

test('Field guest inquiry uses a separate receipt key and owner replies remain pending delivery', async () => {
  const owner = await createOwner();
  const other = await createOwner();
  const app = createFieldApp(async () => undefined, auth.handler, base, {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie: owner.cookie }, payload: { name: '문의 검수 상호' } });
    const organizationId = (organization.json() as { id: string }).id;
    const serviceId = randomUUID();
    const content = {
      expectedRevision: 0, businessName: '문의 검수 상호', introduction: '직접 문의 가능', region: '서울',
      openingHours: '예약 문의', contactPhone: '010-0000-0000',
      services: [{ id: serviceId, name: '상담', description: '상담 서비스', bookingMode: 'request', durationMinutes: 30, priceAmount: null }],
    };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: { cookie: owner.cookie }, payload: content })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: { cookie: owner.cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    const url = `/v1/public/catalog/${organizationId}/inquiries`;
    const payload = { serviceId, name: '비회원 고객', phone: '010-1111-2222', message: '희망 시간 문의', consent: true };
    assert.equal((await app.inject({ method: 'POST', url, payload: { ...payload, consent: false } })).statusCode, 400);
    const submitted = await app.inject({ method: 'POST', url, payload });
    assert.equal(submitted.statusCode, 201);
    const { id, receiptKey } = submitted.json() as { id: string; receiptKey: string };
    assert.match(receiptKey, /^[A-Za-z0-9_-]{40,}$/);
    assert.equal((await app.inject({ url: `/v1/inquiries/${id}?phone=010-1111-2222` })).statusCode, 401);
    const customerView = await app.inject({ url: `/v1/inquiries/${id}`, headers: { authorization: `Bearer ${receiptKey}` } });
    assert.equal(customerView.statusCode, 200);
    assert.equal(customerView.json().organizationId, organizationId);
    assert.equal(customerView.json().businessName, '문의 검수 상호');
    assert.equal((customerView.json() as { messages: { body: string }[] }).messages[0]?.body, '희망 시간 문의');
    const renamedDraft = await app.inject({ method: 'PUT', url: '/v1/business/draft',
      headers: { cookie: owner.cookie }, payload: { ...content, expectedRevision: 1,
        businessName: '공개 전 새 이름' } });
    assert.equal(renamedDraft.statusCode, 200);
    const stillApproved = await app.inject({ url: `/v1/inquiries/${id}`,
      headers: { authorization: `Bearer ${receiptKey}` } });
    assert.equal(stillApproved.json().businessName, '문의 검수 상호');
    const inbox = await app.inject({ url: '/v1/owner/inquiries', headers: { cookie: owner.cookie } });
    assert.equal(inbox.statusCode, 200);
    assert.equal((inbox.json() as { inquiries: unknown[] }).inquiries.length, 1);
    const ownerDetail = await app.inject({ url: `/v1/owner/inquiries/${id}`, headers: { cookie: owner.cookie } });
    assert.equal(ownerDetail.statusCode, 200);
    assert.equal((ownerDetail.json() as { messages: { body: string }[] }).messages[0]?.body, '희망 시간 문의');
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${id}`, headers: { cookie: other.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${id}/replies`, headers: { cookie: other.cookie }, payload: { body: '권한 없는 답변' } })).statusCode, 404);
    const replied = await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${id}/replies`, headers: { cookie: owner.cookie }, payload: { body: '사업자 답변' } });
    assert.equal(replied.statusCode, 201);
    assert.equal((replied.json() as { delivery: string }).delivery, 'pending');
    const afterReply = await app.inject({ url: `/v1/inquiries/${id}`, headers: { authorization: `Bearer ${receiptKey}` } });
    assert.equal((afterReply.json() as { messages: { body: string }[] }).messages.at(-1)?.body, '사업자 답변');
    const readyToClose = await app.inject({ url: `/v1/owner/inquiries/${id}`, headers: { cookie: owner.cookie } });
    const expectedRevision = (readyToClose.json() as { revision: number }).revision;
    assert.ok(Number.isInteger(expectedRevision));
    const closeUrl = `/v1/owner/inquiries/${id}/close`;
    assert.equal((await app.inject({ method: 'POST', url: closeUrl,
      headers: { cookie: other.cookie }, payload: { expectedRevision } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: closeUrl,
      headers: { cookie: owner.cookie }, payload: { expectedRevision: -1 } })).statusCode, 400);
    const [closedA, closedB] = await Promise.all([
      app.inject({ method: 'POST', url: closeUrl, headers: { cookie: owner.cookie }, payload: { expectedRevision } }),
      app.inject({ method: 'POST', url: closeUrl, headers: { cookie: owner.cookie }, payload: { expectedRevision } }),
    ]);
    assert.deepEqual([closedA.statusCode, closedB.statusCode].sort(), [200, 200]);
    assert.equal(closedA.json().state, 'closed');
    assert.equal(closedB.json().revision, expectedRevision + 1);
    assert.equal((await app.inject({ url: `/v1/inquiries/${id}`,
      headers: { authorization: `Bearer ${receiptKey}` } })).json().state, 'closed');
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${id}/replies`,
      headers: { cookie: owner.cookie }, payload: { body: '완료 뒤 답변' } })).statusCode, 409);
    const followedUp = await app.inject({ method: 'POST', url: `/v1/inquiries/${id}/messages`, headers: { authorization: `Bearer ${receiptKey}` }, payload: { body: '고객 추가 질문' } });
    assert.equal(followedUp.statusCode, 201);
    assert.equal((followedUp.json() as { state: string }).state, 'needs_owner');
    assert.equal((await app.inject({ method: 'POST', url: closeUrl,
      headers: { cookie: owner.cookie }, payload: { expectedRevision } })).statusCode, 409);
    const resolution = await pool.query<{ event_type: string; revision: number; actor_user_id: string | null;
      source_message_id: string | null }>(
      `select event_type, revision, actor_user_id, source_message_id
       from field.inquiry_resolution_events where inquiry_id = $1 order by revision`, [id]);
    assert.deepEqual(resolution.rows.map(row => [row.event_type, row.revision]),
      [['closed', expectedRevision + 1], ['reopened', expectedRevision + 2]]);
    assert.ok(resolution.rows[0]?.actor_user_id);
    assert.equal(resolution.rows[0]?.source_message_id, null);
    assert.equal(resolution.rows[1]?.actor_user_id, null);
    assert.equal(resolution.rows[1]?.source_message_id, followedUp.json().messageId);
    const resolutionExport = await app.inject({ url: `/v1/owner/inquiries/${id}/export`,
      headers: { cookie: owner.cookie } });
    assert.deepEqual(resolutionExport.json().resolutionEvents.map((event: { eventType: string }) => event.eventType),
      ['closed', 'reopened']);
    const organizationArchive = await app.inject({
      url: `/v1/owner/organizations/${organizationId}/operations/export`, headers: { cookie: owner.cookie },
    });
    assert.equal(organizationArchive.statusCode, 200);
    assert.deepEqual(organizationArchive.json().inquiries.find((item: { id: string }) => item.id === id)
      .resolutionEvents.map((event: { eventType: string }) => event.eventType), ['closed', 'reopened']);
    const retryReceipt = randomBytes(32).toString('base64url');
    const retryHeaders = { 'idempotency-key': randomBytes(32).toString('base64url'), 'x-receipt-key': retryReceipt };
    const [concurrentA, concurrentB] = await Promise.all([
      app.inject({ method: 'POST', url, headers: retryHeaders, payload }),
      app.inject({ method: 'POST', url, headers: retryHeaders, payload }),
    ]);
    assert.deepEqual([concurrentA.statusCode, concurrentB.statusCode].sort(), [200, 201]);
    const retriedId = concurrentA.json().id as string;
    assert.equal(concurrentB.json().id, retriedId);
    assert.equal(concurrentA.json().receiptKey, retryReceipt);
    assert.equal(concurrentB.json().receiptKey, retryReceipt);
    assert.equal((await app.inject({ method: 'POST', url, headers: retryHeaders, payload })).statusCode, 200);
    const recoverUrl = `${url}/recover`;
    const recovered = await app.inject({ url: recoverUrl, headers: retryHeaders });
    assert.equal(recovered.statusCode, 200);
    assert.equal(recovered.json().id, retriedId);
    assert.equal(recovered.json().receiptKey, retryReceipt);
    assert.equal(recovered.headers['cache-control'], 'no-store');
    assert.equal((await app.inject({ url: recoverUrl, headers: {
      ...retryHeaders, 'idempotency-key': 'weak' } })).statusCode, 400);
    assert.equal((await app.inject({ url: `/v1/public/catalog/${randomUUID()}/inquiries/recover`,
      headers: retryHeaders })).statusCode, 404);
    assert.equal((await app.inject({ url: recoverUrl, headers: {
      ...retryHeaders, 'x-receipt-key': randomBytes(32).toString('base64url') } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url, headers: retryHeaders,
      payload: { ...payload, message: '다른 문의' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url,
      headers: { ...retryHeaders, 'x-receipt-key': randomBytes(32).toString('base64url') }, payload })).statusCode, 409);
    const retryLedger = await pool.query<{ inquiries: string; messages: string; events: string }>(
      `select (select count(*) from field.inquiries where id = $1)::text as inquiries,
        (select count(*) from field.inquiry_messages where inquiry_id = $1)::text as messages,
        (select count(*) from field.outbox where aggregate_id = $1::text)::text as events`, [retriedId]);
    assert.deepEqual(retryLedger.rows[0], { inquiries: '1', messages: '1', events: '1' });
    const followupUrl = `/v1/inquiries/${retriedId}/messages`;
    const followupHeaders = { authorization: `Bearer ${retryReceipt}`,
      'idempotency-key': randomBytes(32).toString('base64url') };
    const [messageA, messageB] = await Promise.all([
      app.inject({ method: 'POST', url: followupUrl, headers: followupHeaders, payload: { body: '재시도 질문' } }),
      app.inject({ method: 'POST', url: followupUrl, headers: followupHeaders, payload: { body: '재시도 질문' } }),
    ]);
    assert.deepEqual([messageA.statusCode, messageB.statusCode].sort(), [200, 201]);
    assert.equal(messageA.json().messageId, messageB.json().messageId);
    const messageRecoverUrl = `${followupUrl}/recover`;
    const messageRecovered = await app.inject({ url: messageRecoverUrl, headers: followupHeaders });
    assert.equal(messageRecovered.statusCode, 200);
    assert.equal(messageRecovered.headers['cache-control'], 'no-store');
    assert.equal(messageRecovered.json().messageId, messageA.json().messageId);
    assert.equal((await app.inject({ url: messageRecoverUrl, headers: {
      ...followupHeaders, 'idempotency-key': randomBytes(32).toString('base64url') } })).statusCode, 404);
    assert.equal((await app.inject({ url: messageRecoverUrl, headers: {
      ...followupHeaders, 'idempotency-key': 'weak' } })).statusCode, 400);
    assert.equal((await app.inject({ url: messageRecoverUrl, headers: {
      ...followupHeaders, authorization: `Bearer ${receiptKey}` } })).statusCode, 401);
    assert.equal((await app.inject({ url: `/v1/inquiries/${randomUUID()}/messages/recover`,
      headers: followupHeaders })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: followupUrl, headers: followupHeaders,
      payload: { body: '변경된 질문' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: followupUrl,
      headers: { ...followupHeaders, authorization: `Bearer ${receiptKey}` },
      payload: { body: '재시도 질문' } })).statusCode, 401);
    const answerUrl = `/v1/owner/inquiries/${retriedId}/replies`;
    const answerHeaders = { cookie: owner.cookie, 'idempotency-key': randomBytes(32).toString('base64url') };
    const [answerA, answerB] = await Promise.all([
      app.inject({ method: 'POST', url: answerUrl, headers: answerHeaders, payload: { body: '재시도 답변' } }),
      app.inject({ method: 'POST', url: answerUrl, headers: answerHeaders, payload: { body: '재시도 답변' } }),
    ]);
    assert.deepEqual([answerA.statusCode, answerB.statusCode].sort(), [200, 201]);
    assert.equal(answerA.json().messageId, answerB.json().messageId);
    assert.equal((await app.inject({ method: 'POST', url: answerUrl, headers: answerHeaders,
      payload: { body: '변경된 답변' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: answerUrl,
      headers: { ...answerHeaders, cookie: other.cookie }, payload: { body: '재시도 답변' } })).statusCode, 404);
    const messageLedger = await pool.query<{ messages: string; events: string }>(
      `select (select count(*) from field.inquiry_messages where inquiry_id = $1)::text as messages,
        (select count(*) from field.outbox where aggregate_id = $1::text)::text as events`, [retriedId]);
    assert.deepEqual(messageLedger.rows[0], { messages: '3', events: '3' });
    const noteUrl = `/v1/owner/inquiries/${retriedId}/notes`;
    const noteHeaders = { cookie: owner.cookie, 'idempotency-key': randomBytes(32).toString('base64url') };
    const beforeNote = (await app.inject({ url: `/v1/owner/inquiries/${retriedId}`,
      headers: { cookie: owner.cookie } })).json().state as string;
    const [noteA, noteB] = await Promise.all([
      app.inject({ method: 'POST', url: noteUrl, headers: noteHeaders, payload: { body: '고객에게 숨긴 운영 메모' } }),
      app.inject({ method: 'POST', url: noteUrl, headers: noteHeaders, payload: { body: '고객에게 숨긴 운영 메모' } }),
    ]);
    assert.deepEqual([noteA.statusCode, noteB.statusCode].sort(), [200, 201]);
    assert.equal(noteA.json().messageId, noteB.json().messageId);
    assert.equal(noteA.json().delivery, 'not_applicable');
    assert.equal((await app.inject({ method: 'POST', url: noteUrl, headers: noteHeaders,
      payload: { body: '바뀐 운영 메모' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: noteUrl,
      headers: { ...noteHeaders, cookie: other.cookie }, payload: { body: '고객에게 숨긴 운영 메모' } })).statusCode, 404);
    const ownerNotes = await app.inject({ url: `/v1/owner/inquiries/${retriedId}`, headers: { cookie: owner.cookie } });
    assert.equal(ownerNotes.json().state, beforeNote);
    assert.equal(ownerNotes.json().messages.filter((item: { visibility: string }) => item.visibility === 'internal').length, 1);
    assert.equal(ownerNotes.json().messages.at(-1).body, '고객에게 숨긴 운영 메모');
    const customerAfterNote = await app.inject({ url: `/v1/inquiries/${retriedId}`,
      headers: { authorization: `Bearer ${retryReceipt}` } });
    assert.doesNotMatch(customerAfterNote.body, /고객에게 숨긴 운영 메모|internal|not_applicable/);
    assert.equal(customerAfterNote.json().messages.length, 3);
    const noteLedger = await pool.query<{ messages: string; events: string }>(
      `select (select count(*) from field.inquiry_messages where inquiry_id = $1)::text as messages,
        (select count(*) from field.outbox where aggregate_id = $1::text)::text as events`, [retriedId]);
    assert.deepEqual(noteLedger.rows[0], { messages: '4', events: '3' });
    const notifications = await app.inject({ url: '/v1/owner/notifications', headers: { cookie: owner.cookie } });
    assert.equal(notifications.statusCode, 200);
    const forRetried = notifications.json().notifications.filter((item: { targetId: string }) => item.targetId === retriedId);
    assert.deepEqual(forRetried.map((item: { eventType: string }) => item.eventType).sort(),
      ['field.inquiry.created', 'field.inquiry.customer_message']);
    assert.equal(notifications.json().unreadCount, 4);
    const notificationId = forRetried[0].id as string;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/notifications/${notificationId}/read`,
      headers: { cookie: other.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/notifications/${notificationId}/read`,
      headers: { cookie: owner.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/notifications/${notificationId}/read`,
      headers: { cookie: owner.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/v1/owner/notifications',
      headers: { cookie: owner.cookie } })).json().unreadCount, 3);
    const eventLedger = await pool.query<{ event_type: string; audience: string; state: string }>(
      `select o.event_type, n.audience, n.state from field.notification_events n
       join field.outbox o on o.id = n.outbox_id where o.aggregate_id = $1
       order by o.event_type`, [retriedId]);
    assert.deepEqual(eventLedger.rows.map(row => [row.event_type, row.audience, row.state]), [
      ['field.inquiry.created', 'owner', 'available'],
      ['field.inquiry.customer_message', 'owner', 'available'],
      ['field.inquiry.owner_reply', 'customer', 'blocked_integration'],
    ]);
    const badReceipt = randomBytes(32).toString('base64url');
    // 신뢰하지 않는 직접 접속자가 X-Forwarded-For를 바꿔도 같은 접속 주소로 잠긴다.
    const directClient = '192.0.2.10';
    for (let attemptNumber = 0; attemptNumber < 5; attemptNumber += 1) {
      const attempt = await app.inject({ url: `/v1/inquiries/${id}`, remoteAddress: directClient,
        headers: { authorization: `Bearer ${badReceipt}`, 'x-forwarded-for': `198.51.100.${attemptNumber + 1}` } });
      assert.equal(attempt.statusCode, 401);
    }
    const limited = await app.inject({ url: `/v1/inquiries/${id}`, remoteAddress: directClient,
      headers: { authorization: `Bearer ${receiptKey}`, 'x-forwarded-for': '203.0.113.20' } });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error, 'receipt_rate_limited');
    assert.ok(Number(limited.headers['retry-after']) > 0);
    // 같은 장비의 웹 프록시가 전달한 다른 고객은 잠긴 접속자 때문에 막히지 않는다.
    assert.equal((await app.inject({ url: `/v1/inquiries/${id}`,
      headers: { authorization: `Bearer ${receiptKey}`, 'x-forwarded-for': '203.0.113.20' } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/inquiries/${retriedId}`,
      headers: { authorization: `Bearer ${retryReceipt}` } })).statusCode, 200);
    const failures = await pool.query<{ failures: number }>(
      "select failures from field.receipt_attempts where target_kind = 'inquiry' and target_id = $1", [id]);
    assert.equal(failures.rows[0]?.failures, 5);
    await pool.query("update field.receipt_attempts set blocked_until = now() - interval '1 second', window_started_at = now() - interval '16 minutes' where target_kind = 'inquiry' and target_id = $1", [id]);
    assert.equal((await app.inject({ url: `/v1/inquiries/${id}`, remoteAddress: directClient,
      headers: { authorization: `Bearer ${badReceipt}` } })).statusCode, 401);
    assert.equal((await pool.query<{ failures: number }>(
      "select failures from field.receipt_attempts where target_kind = 'inquiry' and target_id = $1", [id])).rows[0]?.failures, 1);
    assert.equal((await app.inject({ url: `/v1/inquiries/${id}`, remoteAddress: directClient,
      headers: { authorization: `Bearer ${receiptKey}` } })).statusCode, 200);
    assert.equal(Number((await pool.query<{ count: string }>(
      "select count(*) from field.receipt_attempts where target_kind = 'inquiry' and target_id = $1", [id])).rows[0]!.count), 0);
    const nextReceipt = randomBytes(32).toString('base64url');
    const rotateUrl = `/v1/inquiries/${retriedId}/receipt-key/rotate`;
    const rotateHeaders = { authorization: `Bearer ${retryReceipt}`,
      'idempotency-key': randomBytes(32).toString('base64url') };
    const rotatePayload = { nextReceiptKey: nextReceipt };
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl,
      headers: { ...rotateHeaders, authorization: `Bearer ${receiptKey}` },
      payload: rotatePayload })).statusCode, 401);
    const [rotateA, rotateB] = await Promise.all([
      app.inject({ method: 'POST', url: rotateUrl, headers: rotateHeaders, payload: rotatePayload }),
      app.inject({ method: 'POST', url: rotateUrl, headers: rotateHeaders, payload: rotatePayload }),
    ]);
    assert.deepEqual([rotateA.statusCode, rotateB.statusCode], [200, 200]);
    assert.equal((await app.inject({ url: `/v1/inquiries/${retriedId}`,
      headers: { authorization: `Bearer ${retryReceipt}` } })).statusCode, 401);
    assert.equal((await app.inject({ url: messageRecoverUrl, headers: followupHeaders })).statusCode, 401);
    assert.equal((await app.inject({ url: recoverUrl, headers: retryHeaders })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/inquiries/${retriedId}`,
      headers: { authorization: `Bearer ${nextReceipt}` } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl, headers: rotateHeaders,
      payload: rotatePayload })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url, headers: retryHeaders,
      payload })).statusCode, 409);
    assert.equal(Number((await pool.query<{ count: string }>(
      'select count(*) from field.inquiry_receipt_rotations where inquiry_id = $1', [retriedId])).rows[0]!.count), 1);
    const finalReceipt = randomBytes(32).toString('base64url');
    const nextHeaders = { authorization: `Bearer ${nextReceipt}`,
      'idempotency-key': randomBytes(32).toString('base64url') };
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl, headers: nextHeaders,
      payload: { nextReceiptKey: retryReceipt } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl, headers: nextHeaders,
      payload: { nextReceiptKey: finalReceipt } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl, headers: rotateHeaders,
      payload: rotatePayload })).statusCode, 409);
    assert.equal((await app.inject({ url: `/v1/inquiries/${retriedId}`,
      headers: { authorization: `Bearer ${nextReceipt}` } })).statusCode, 401);
    assert.equal((await app.inject({ url: `/v1/inquiries/${retriedId}`,
      headers: { authorization: `Bearer ${finalReceipt}` } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${retriedId}`,
      headers: { cookie: owner.cookie } })).statusCode, 200);
    assert.equal(Number((await pool.query<{ count: string }>(
      'select count(*) from field.outbox where aggregate_id = $1', [retriedId])).rows[0]!.count), 3);
    const exportUrl = `/v1/owner/inquiries/${retriedId}/export`;
    assert.equal((await app.inject({ url: exportUrl })).statusCode, 401);
    assert.equal((await app.inject({ url: exportUrl, headers: { cookie: other.cookie } })).statusCode, 404);
    await pool.query(
      `insert into field.memberships(organization_id, user_id, role)
       select $1, id, 'editor' from "user" where email = $2`, [organizationId, other.email]);
    assert.equal((await app.inject({ url: exportUrl, headers: { cookie: other.cookie } })).statusCode, 200);
    await pool.query(`update field.memberships set role = 'viewer' where organization_id = $1
      and user_id = (select id from "user" where email = $2)`, [organizationId, other.email]);
    assert.equal((await app.inject({ url: exportUrl, headers: { cookie: other.cookie } })).statusCode, 404);
    const exported = await app.inject({ url: exportUrl, headers: { cookie: owner.cookie } });
    assert.equal(exported.statusCode, 200);
    assert.equal(exported.headers['cache-control'], 'private, no-store');
    assert.match(String(exported.headers['content-disposition']), /attachment; filename="field-inquiry-/);
    assert.equal(exported.json().product, 'field');
    assert.equal(exported.json().inquiry.id, retriedId);
    assert.ok(exported.json().messages.some((item: { body: string; visibility: string }) =>
      item.body === '고객에게 숨긴 운영 메모' && item.visibility === 'internal'));
    assert.doesNotMatch(exported.body, new RegExp(retryReceipt));
    assert.doesNotMatch(exported.body, /visitor_key_hash|submission_key_hash|object_key/);
    const ratePayload = { ...payload, phone: '010-8765-4321' };
    let lastKey = '';
    let lastReceipt = '';
    for (let index = 0; index < 5; index += 1) {
      lastKey = randomBytes(32).toString('base64url');
      lastReceipt = randomBytes(32).toString('base64url');
      assert.equal((await app.inject({ method: 'POST', url,
        headers: { 'idempotency-key': lastKey, 'x-receipt-key': lastReceipt },
        payload: { ...ratePayload, message: `제한 검수 ${index}` } })).statusCode, 201);
    }
    const blocked = await app.inject({ method: 'POST', url,
      payload: { ...ratePayload, phone: '01087654321', message: '여섯 번째 접수' } });
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.json().error, 'submission_rate_limited');
    assert.ok(Number(blocked.headers['retry-after']) > 0);
    assert.equal((await app.inject({ method: 'POST', url,
      headers: { 'idempotency-key': lastKey, 'x-receipt-key': lastReceipt },
      payload: { ...ratePayload, message: '제한 검수 4' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url,
      payload: { ...ratePayload, phone: '010-8765-4322', message: '다른 번호' } })).statusCode, 201);
    const windows = await pool.query<{ subject_hash: string; attempts: number }>(
      'select subject_hash, attempts from field.public_submission_windows where organization_id = $1 and attempts = 5',
      [organizationId]);
    assert.equal(windows.rows.length, 1);
    assert.match(windows.rows[0]!.subject_hash, /^[0-9a-f]{64}$/);
    await pool.query("update field.public_submission_windows set window_started_at = now() - interval '16 minutes' where organization_id = $1 and attempts = 5", [organizationId]);
    assert.equal((await app.inject({ method: 'POST', url,
      payload: { ...ratePayload, message: '제한 만료 뒤 접수' } })).statusCode, 201);
  } finally {
    await app.close();
    await pool.query('delete from field.receipt_attempts where target_kind = $1 and target_id in (select id from field.inquiries where organization_id = (select id from field.organizations where owner_user_id = (select id from "user" where email = $2)))', ['inquiry', owner.email]).catch(() => undefined);
    await pool.query('DELETE FROM field.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [owner.email]).catch(() => undefined);
    await authPool.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [[owner.email, other.email]]);
  }
});
