import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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

async function owner() {
  const email = `field-test-inquiry-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Site test owner' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signedIn = await post('/sign-in/email');
  assert.equal(signedIn.status, 200);
  return { email, cookie: signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('approved site test inquiry stays internal, idempotent, and outside operations totals', async () => {
  const first = await owner();
  const second = await owner();
  const app = createFieldApp(async () => undefined, auth.handler, base, {
    pool, resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  const path = '/v1/owner/site-inquiry-test';
  const headers = { cookie: first.cookie };
  let organizationId = '';
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations', headers,
      payload: { name: '안전 테스트 상호' } });
    assert.equal(organization.statusCode, 201, organization.body);
    organizationId = organization.json().id;
    assert.equal((await app.inject({ url: path })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: path })).statusCode, 401);
    assert.equal((await app.inject({ url: path, headers: { cookie: second.cookie,
      'x-organization-id': organizationId } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: path, headers: { cookie: second.cookie,
      'x-organization-id': organizationId } })).statusCode, 404);
    assert.equal((await app.inject({ url: path, headers })).statusCode, 409);
    const serviceId = randomUUID();
    const catalog = { expectedRevision: 0, businessName: '안전 테스트 상호', introduction: '소개',
      region: '서울', openingHours: '평일', contactPhone: '010-1234-5678', services: [
        { id: serviceId, name: '상담', description: '설명', bookingMode: 'request', durationMinutes: 30,
          priceAmount: 10000 },
      ] };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers,
      payload: catalog })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers,
      payload: { expectedRevision: 1 } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/sites', headers })).statusCode, 201);
    const site = { expectedRevision: 0, template: 'editorial', palette: '#264653', pages: [
      { id: randomUUID(), slug: 'home', title: '홈', sections: [
        { id: randomUUID(), kind: 'hero', heading: '소개', body: '내용' },
      ] },
    ] };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/sites/draft', headers,
      payload: site })).statusCode, 200);
    const testBody = { siteRevision: 1, serviceId, name: '사업자 고객 체험', message: '문의 화면과 사업자 답변을 확인합니다.' };
    assert.equal((await app.inject({ method: 'POST', url: path, headers, payload: testBody })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/sites/releases', headers,
      payload: { expectedRevision: 1 } })).statusCode, 201);
    const latestServiceId = randomUUID();
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers,
      payload: { ...catalog, expectedRevision: 1, services: [
        ...catalog.services, { ...catalog.services[0], id: latestServiceId, name: '추가 상담' },
      ] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers,
      payload: { expectedRevision: 2 } })).statusCode, 201);
    const latestTestBody = { ...testBody, serviceId: latestServiceId };
    const preflight = await app.inject({ url: path, headers });
    assert.equal(preflight.statusCode, 200, preflight.body);
    assert.equal(preflight.json().organizationId, organizationId);
    assert.equal(preflight.json().siteRevision, 1);
    assert.equal(preflight.json().catalogRevision, 2);
    assert.equal(preflight.json().existingTest, null);
    const siteRow = await pool.query<{ id: string; release_id: string }>(
      `select s.id, sr.id as release_id from field.sites s
       join field.site_releases sr on sr.site_id=s.id where s.organization_id=$1`, [organizationId]);
    const siteId = siteRow.rows[0]!.id;
    const reportId = randomUUID();
    await pool.query(
      `insert into field.moderation_reports
       (id,organization_id,site_id,site_release_id,public_snapshot,submission_key_hash,request_hash,
        category,description,consent_version)
       values ($1,$2,$3,$4,'{}'::jsonb,$5,$6,'other','test hold','field-site-report-v1')`,
      [reportId, organizationId, siteId, siteRow.rows[0]!.release_id, randomUUID(), randomUUID()]);
    await pool.query('insert into field.site_visibility_holds(site_id,report_id,created_by) values ($1,$2,$3)',
      [siteId, reportId, 'test-reviewer']);
    const heldPreflight = await app.inject({ url: path, headers });
    assert.equal(heldPreflight.statusCode, 409, heldPreflight.body);
    assert.equal(heldPreflight.json().error, 'site_visibility_restricted');
    const heldSubmission = await app.inject({ method: 'POST', url: path, headers, payload: latestTestBody });
    assert.equal(heldSubmission.statusCode, 409, heldSubmission.body);
    assert.equal(heldSubmission.json().error, 'site_visibility_restricted');
    assert.equal((await pool.query('select 1 from field.inquiries where organization_id=$1', [organizationId])).rowCount, 0);
    await pool.query('update field.site_visibility_holds set released_by=$3,released_at=now() where site_id=$1 and report_id=$2',
      [siteId, reportId, 'test-reviewer']);
    assert.equal((await app.inject({ method: 'POST', url: path, headers,
      payload: { ...latestTestBody, siteRevision: 2 } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: path, headers,
      payload: { ...latestTestBody, serviceId: randomUUID() } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: path, headers,
      payload: { ...latestTestBody, message: ' ' } })).statusCode, 400);
    const outboxBefore = await pool.query<{ count: string }>(
      'select count(*)::text from field.outbox where organization_id=$1', [organizationId]);
    const [created, duplicate] = await Promise.all([
      app.inject({ method: 'POST', url: path, headers, payload: latestTestBody }),
      app.inject({ method: 'POST', url: path, headers, payload: latestTestBody }),
    ]);
    assert.deepEqual([created.statusCode, duplicate.statusCode].sort(), [200, 201],
      `${created.body} ${duplicate.body}`);
    const inquiryId = created.json().id;
    assert.equal(duplicate.json().id, inquiryId);
    assert.equal(created.json().isTest, true);
    assert.equal(created.json().delivery, 'not_applicable');
    assert.equal((await app.inject({ method: 'POST', url: path, headers,
      payload: { ...latestTestBody, message: '다른 메시지' } })).statusCode, 409);
    assert.equal((await app.inject({ url: path, headers })).json().existingTest.id, inquiryId);
    await pool.query('update field.site_visibility_holds set released_by=null,released_at=null where site_id=$1 and report_id=$2',
      [siteId, reportId]);
    assert.equal((await app.inject({ url: path, headers })).json().existingTest.id, inquiryId);
    assert.equal((await app.inject({ method: 'POST', url: path, headers, payload: latestTestBody })).statusCode, 200);
    const stored = await pool.query<{ is_test: boolean; test_site_revision: number; catalog_revision: number;
      service_id: string; consent_at: Date | null; customer_phone: string; customer_name: string; visitor_key_hash: string }>(
      'select is_test,test_site_revision,catalog_revision,service_id,consent_at,customer_phone,customer_name,visitor_key_hash from field.inquiries where id=$1',
      [inquiryId]);
    assert.equal(stored.rows[0]?.is_test, true);
    assert.equal(stored.rows[0]?.test_site_revision, 1);
    assert.equal(stored.rows[0]?.catalog_revision, 2);
    assert.equal(stored.rows[0]?.service_id, latestServiceId);
    assert.equal(stored.rows[0]?.consent_at, null);
    assert.equal(stored.rows[0]?.customer_phone, '');
    assert.equal(stored.rows[0]?.customer_name, testBody.name);
    assert.equal((await pool.query('select 1 from field.outbox where organization_id=$1', [organizationId])).rowCount,
      Number(outboxBefore.rows[0]?.count));
    assert.equal((await pool.query('select 1 from field.reservations where organization_id=$1', [organizationId])).rowCount, 0);
    assert.equal((await pool.query('select 1 from field.occupancies where organization_id=$1', [organizationId])).rowCount, 0);
    const ownerList = await app.inject({ url: '/v1/owner/inquiries', headers });
    assert.equal(ownerList.statusCode, 200);
    assert.equal(ownerList.json().inquiries[0].is_test, true);
    const detail = await app.inject({ url: `/v1/owner/inquiries/${inquiryId}`, headers });
    assert.equal(detail.json().isTest, true);
    assert.equal(detail.json().messages[0].delivery_state, 'not_applicable');
    assert.equal(detail.json().messages[0].body, testBody.message);
    const exported = await app.inject({ url: `/v1/owner/inquiries/${inquiryId}/export`, headers });
    assert.equal(exported.json().inquiry.isTest, true);
    assert.equal(exported.json().inquiry.consentAt, null);
    assert.equal((await app.inject({ url: `/v1/inquiries/${inquiryId}` })).statusCode, 401);
    const usage = await app.inject({ url: '/v1/usage/summary', headers });
    assert.equal(usage.statusCode, 200, usage.body);
    assert.equal(usage.json().work.directInquiries, 0);
    const reply = await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${inquiryId}/replies`,
      headers, payload: { body: '안전한 내부 답변' } });
    assert.equal(reply.statusCode, 201, reply.body);
    assert.equal(reply.json().delivery, 'not_applicable');
    assert.equal((await pool.query('select 1 from field.outbox where organization_id=$1', [organizationId])).rowCount,
      Number(outboxBefore.rows[0]?.count));
  } finally {
    if (organizationId) {
      await pool.query('delete from field.sites where organization_id=$1', [organizationId]);
      await pool.query('delete from field.organizations where id=$1', [organizationId]);
    }
    await pool.query('delete from "user" where email = any($1::text[])', [[first.email, second.email]]);
    await app.close();
  }
});
