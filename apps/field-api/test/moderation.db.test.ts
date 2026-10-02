import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });

test('Field reports require approved timed support access and preserve independent work during scoped moderation', async () => {
  const previous = process.env.FIELD_PROFILE;
  process.env.FIELD_PROFILE = 'mock';
  const users = Array.from({ length: 5 }, () => randomUUID());
  const [owner, operator, approver, auditor, stranger] = users as [string, string, string, string, string];
  const app = createFieldApp(async () => undefined, undefined, undefined, {
    pool, resolveUserId: async headers => typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null,
  });
  const headers = (user: string, key?: string, grant?: string) => ({ 'x-test-user': user,
    ...(key ? { 'idempotency-key': key } : {}), ...(grant ? { 'x-support-access-id': grant } : {}) });
  try {
    for (const user of users) await pool.query('insert into "user"(id,name,email,"emailVerified") values ($1,$2,$3,false)',
      [user, 'Synthetic moderation actor', `${user}@example.invalid`]);
    for (const [user, role] of [[operator, 'operator'], [approver, 'operator'], [auditor, 'auditor']])
      await pool.query('insert into field.platform_admin_memberships(user_id,role) values ($1,$2)', [user, role]);
    const organization = (await app.inject({ method: 'POST', url: '/v1/organizations', headers: headers(owner),
      payload: { name: '신고 검수 사업체' } })).json().id;
    const serviceId = randomUUID();
    const catalog = { businessName: '신고 검수 사업체', industry: '레슨·교육', introduction: '승인 소개',
      region: '서울', openingHours: '평일', contactPhone: '', services: [{ id: serviceId, name: '상담',
        description: '직접 상담', bookingMode: 'request', durationMinutes: 30, priceAmount: null }], expectedRevision: 0 };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: headers(owner), payload: catalog })).statusCode, 200);
    await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: headers(owner), payload: { expectedRevision: 1 } });
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/booking-policy', headers: headers(owner), payload: {
      expectedRevision: 0, timezone: 'Asia/Seoul', weekly: { mon: { open: '10:00', close: '18:00' } },
      beforeMinutes: 0, afterMinutes: 0, minLeadMinutes: 0, horizonDays: 30,
    } })).statusCode, 200);
    await app.inject({ method: 'POST', url: '/v1/sites', headers: headers(owner) });
    const draft = (await app.inject({ url: '/v1/sites/draft', headers: headers(owner) })).json();
    await app.inject({ method: 'PUT', url: '/v1/sites/draft', headers: headers(owner),
      payload: { ...draft, expectedRevision: 0 } });
    const release = await app.inject({ method: 'POST', url: '/v1/sites/releases', headers: headers(owner), payload: { expectedRevision: 1 } });
    assert.equal(release.statusCode, 201);
    const slug = release.json().slug;
    const publicPath = `/v1/public/sites/${slug}`;
    const intake = await app.inject({ method: 'POST', url: `/v1/public/catalog/${organization}/inquiries`,
      payload: { serviceId, name: '기존 고객', phone: '010-3333-4444', message: 'PRIVATE_INQUIRY_SOURCE', consent: true } });
    assert.equal(intake.statusCode, 201);
    const originalReservation = await app.inject({ method: 'POST', url: `/v1/public/catalog/${organization}/reservations`,
      payload: { serviceId, name: '기존 예약 고객', phone: '010-3333-4447', preferredTimeText: '다음 주 오전', consent: true } });
    assert.equal(originalReservation.statusCode, 201);
    const key = randomUUID(), marker = `PRIVATE_REPORT_${randomUUID()}`;
    const reportBody = { category: 'inaccurate_information', description: marker, consent: true };
    const submit = (payload: Record<string, unknown> = reportBody, submittedKey = key) => app.inject({ method: 'POST',
      url: `${publicPath}/reports`, headers: { 'idempotency-key': submittedKey }, payload });
    const submitted = await submit();
    assert.equal(submitted.statusCode, 201, submitted.body);
    const reportId = submitted.json().id;
    assert.doesNotMatch(submitted.body, /PRIVATE_REPORT/);
    assert.equal((await submit()).json().id, reportId);
    assert.equal((await submit({ ...reportBody, description: '다른 내용' })).statusCode, 409);
    assert.equal((await submit({ ...reportBody, consent: false }, randomUUID())).statusCode, 400);
    assert.equal((await submit({ ...reportBody, category: ['other'] }, randomUUID())).statusCode, 400);
    assert.equal((await app.inject({ url: publicPath })).statusCode, 200);
    const reportsPath = `/v1/admin/reports/${reportId}`;
    assert.equal((await app.inject({ url: '/v1/admin/reports' })).statusCode, 401);
    assert.equal((await app.inject({ url: '/v1/admin/reports', headers: headers(owner) })).statusCode, 403);
    const list = await app.inject({ url: '/v1/admin/reports', headers: headers(auditor) });
    assert.equal(list.statusCode, 200);
    assert.doesNotMatch(list.body, /PRIVATE_REPORT|description|subject_hash|request_hash/);
    assert.equal((await app.inject({ url: reportsPath, headers: headers(operator) })).statusCode, 403);
    const accessKey = randomUUID();
    const access = await app.inject({ method: 'POST', url: `${reportsPath}/access`, headers: headers(operator, accessKey),
      payload: { reason: '공개 안내 신고 확인', minutes: 15 } });
    assert.equal(access.statusCode, 201);
    const accessId = access.json().id;
    assert.equal((await app.inject({ method: 'POST', url: `${reportsPath}/access`, headers: headers(operator, accessKey),
      payload: { reason: '공개 안내 신고 확인', minutes: 15 } })).json().id, accessId);
    const approve = (user: string) => app.inject({ method: 'POST', url: `/v1/admin/report-access/${accessId}/approve`,
      headers: headers(user), payload: { reason: '신고 검수 업무 접근 승인' } });
    assert.equal((await approve(operator)).statusCode, 403);
    assert.equal((await approve(auditor)).statusCode, 403);
    assert.equal((await approve(approver)).statusCode, 200);
    assert.equal((await app.inject({ url: reportsPath, headers: headers(approver, undefined, accessId) })).statusCode, 403);
    assert.equal((await app.inject({ url: reportsPath, headers: headers(operator, undefined, accessId) })).json().description, marker);
    assert.doesNotMatch((await app.inject({ url: reportsPath, headers: headers(operator, undefined, accessId) })).body, /PRIVATE_INQUIRY_SOURCE/);
    const reviewKey = randomUUID();
    const reviewBody = { expectedRevision: 1, outcome: 'site_hidden', summary: '공개 안내 정정 전 사이트 공개만 제한', reason: '승인 정보 대조 결과' };
    const review = () => app.inject({ method: 'POST', url: `${reportsPath}/review`, headers: headers(operator, reviewKey, accessId), payload: reviewBody });
    assert.equal((await app.inject({ method: 'POST', url: `${reportsPath}/review`, headers: headers(operator, randomUUID(), accessId),
      payload: { ...reviewBody, outcome: ['site_hidden'] } })).statusCode, 400);
    assert.equal((await review()).statusCode, 200);
    assert.equal((await review()).json().revision, 2);
    const notices = (await app.inject({ url: '/v1/owner/notifications', headers: headers(owner) })).json().notifications;
    const reviewNotices = notices.filter((notice: { eventType: string }) => notice.eventType === 'field.moderation.review');
    assert.equal(reviewNotices.length, 1);
    assert.equal(reviewNotices[0].targetKind, 'moderation_report');
    assert.equal(reviewNotices[0].targetId, reportId);
    assert.equal((await app.inject({ url: publicPath })).statusCode, 404);
    assert.equal((await app.inject({ url: publicPath })).json().organizationId, organization);
    assert.equal((await app.inject({ url: `/v1/public/catalog/${organization}` })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/inquiries/${intake.json().id}`,
      headers: { authorization: `Bearer ${intake.json().receiptKey}` } })).statusCode, 200);
    const existingReservation = await app.inject({ url: `/v1/reservations/${originalReservation.json().id}`,
      headers: { authorization: `Bearer ${originalReservation.json().receiptKey}` } });
    assert.equal(existingReservation.statusCode, 200);
    assert.equal(existingReservation.json().state, 'requested');
    assert.equal((await app.inject({ method: 'POST', url: `/v1/public/catalog/${organization}/inquiries`,
      payload: { serviceId, name: '제한 중 새 문의', phone: '010-3333-4445', message: '직접 문의', consent: true } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/public/catalog/${organization}/reservations`,
      payload: { serviceId, name: '제한 중 새 예약', phone: '010-3333-4446', preferredTimeText: '다음 주 오전', consent: true } })).statusCode, 201);
    assert.equal((await app.inject({ url: '/v1/sites/draft', headers: headers(owner) })).json().revision, 1);
    const rejectedRelease = await app.inject({ method: 'POST', url: '/v1/sites/releases', headers: headers(owner), payload: { expectedRevision: 1 } });
    assert.equal(rejectedRelease.statusCode, 409);
    assert.equal(rejectedRelease.json().error, 'site_visibility_restricted');
    const secondId = (await submit(reportBody, randomUUID())).json().id;
    assert.equal((await app.inject({ url: `/v1/admin/reports/${secondId}`, headers: headers(operator, undefined, accessId) })).statusCode, 403);
    const secondGrant = (await app.inject({ method: 'POST', url: `/v1/admin/reports/${secondId}/access`,
      headers: headers(operator, randomUUID()), payload: { reason: '별도 신고 검토', minutes: 15 } })).json().id;
    await app.inject({ method: 'POST', url: `/v1/admin/report-access/${secondGrant}/approve`, headers: headers(approver), payload: { reason: '별도 검토 승인' } });
    assert.equal((await app.inject({ method: 'POST', url: `/v1/admin/reports/${secondId}/review`,
      headers: headers(operator, randomUUID(), secondGrant), payload: reviewBody })).statusCode, 200);
    const owned = await app.inject({ url: '/v1/owner/moderation/reports', headers: headers(owner) });
    assert.equal(owned.statusCode, 200);
    assert.equal(owned.json().reports[0].siteHidden, true);
    assert.doesNotMatch(owned.body, /PRIVATE_REPORT|description|requested_by|subject_hash/);
    assert.equal((await app.inject({ url: '/v1/owner/moderation/reports', headers: headers(stranger),
      query: { organizationId: organization } })).statusCode, 404);
    const appealKey = randomUUID();
    const appealBody = { expectedRevision: 2, message: '사업자 자료를 수정했습니다.' };
    const appeal = () => app.inject({ method: 'POST', url: `/v1/owner/moderation/reports/${reportId}/appeal`,
      headers: headers(owner, appealKey), payload: appealBody });
    assert.equal((await appeal()).statusCode, 200);
    assert.equal((await appeal()).json().revision, 3);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/moderation/reports/${reportId}/appeal`,
      headers: headers(stranger, randomUUID()), payload: appealBody })).statusCode, 404);
    await pool.query("update field.moderation_access_requests set expires_at = now() - interval '1 second' where id = $1", [accessId]);
    assert.equal((await app.inject({ url: reportsPath, headers: headers(operator, undefined, accessId) })).statusCode, 403);
    const secondAccess = (await app.inject({ method: 'POST', url: `${reportsPath}/access`,
      headers: headers(operator, randomUUID()), payload: { reason: '사업자 이의 검토', minutes: 10 } })).json().id;
    await app.inject({ method: 'POST', url: `/v1/admin/report-access/${secondAccess}/approve`, headers: headers(approver),
      payload: { reason: '이의 검토 승인' } });
    const decideBody = { expectedRevision: 3, decision: 'overturned', summary: '정정 확인 후 해당 제한 해제', reason: '승인 사업 안내 재확인' };
    const decideKey = randomUUID();
    const decide = () => app.inject({ method: 'POST', url: `${reportsPath}/appeal-decision`,
      headers: headers(operator, decideKey, secondAccess), payload: decideBody });
    assert.equal((await app.inject({ method: 'POST', url: `${reportsPath}/appeal-decision`, headers: headers(operator, randomUUID(), secondAccess),
      payload: { ...decideBody, decision: ['overturned'] } })).statusCode, 400);
    assert.equal((await decide()).statusCode, 200);
    assert.equal((await decide()).json().revision, 4);
    assert.equal((await app.inject({ url: publicPath })).statusCode, 404);
    await app.inject({ method: 'POST', url: `/v1/owner/moderation/reports/${secondId}/appeal`,
      headers: headers(owner, randomUUID()), payload: appealBody });
    assert.equal((await app.inject({ method: 'POST', url: `/v1/admin/reports/${secondId}/appeal-decision`,
      headers: headers(operator, randomUUID(), secondGrant), payload: decideBody })).statusCode, 200);
    assert.equal((await app.inject({ url: publicPath })).statusCode, 200);
    assert.equal((await pool.query('select count(*)::int as n from field.site_releases where site_id = $1', [draft.siteId])).rows[0].n, 1);
    const events = (await pool.query('select action from field.moderation_events where report_id = $1', [reportId])).rows;
    for (const action of ['submitted', 'access_requested', 'access_approved', 'detail_read', 'reviewed', 'appealed', 'appeal_decided'])
      assert.ok(events.some(row => row.action === action), action);
    assert.equal(events.filter(row => row.action === 'reviewed').length, 1);
    assert.equal(events.filter(row => row.action === 'appealed').length, 1);
    await pool.query('delete from field.platform_admin_memberships where user_id = $1', [approver]);
    assert.equal((await app.inject({ url: reportsPath, headers: headers(operator, undefined, secondAccess) })).statusCode, 403);
    process.env.FIELD_PROFILE = 'sandbox';
    assert.equal((await app.inject({ url: '/v1/admin/reports', headers: headers(operator) })).json().error, 'mfa_required');
    process.env.FIELD_PROFILE = 'mock';
    for (let i = 0; i < 3; i++) assert.equal((await submit(reportBody, randomUUID())).statusCode, 201);
    assert.equal((await submit(reportBody, randomUUID())).statusCode, 429);
  } finally {
    process.env.FIELD_PROFILE = previous;
    await app.close();
    await pool.query(`delete from field.site_releases r using field.sites s, field.organizations o
      where r.site_id=s.id and s.organization_id=o.id and o.owner_user_id=any($1::text[])`, [users]);
    await pool.query('delete from field.organizations where owner_user_id = any($1::text[])', [users]);
    await pool.query('delete from "user" where id = any($1::text[])', [users]);
    await pool.end();
  }
});
