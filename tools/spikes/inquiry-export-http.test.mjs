import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';

const products = [
  { name: 'agent', web: 'http://127.0.0.1:3001', database: process.env.AP_DATABASE_URL },
  { name: 'field', web: 'http://127.0.0.1:3002', database: process.env.FIELD_DATABASE_URL },
];

async function request(web, path, method = 'GET', body, cookie) {
  const response = await fetch(`${web}${path}`, { method, headers: {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(cookie ? { cookie } : {}),
    ...(method === 'GET' ? {} : { origin: web }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { response, data: await response.clone().json().catch(() => ({})) };
}

async function account(web, name) {
  const email = `export-http-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString('base64url')}A1!`;
  const signup = await request(web, '/api/auth/sign-up/email', 'POST', { email, password, name });
  assert.equal(signup.response.status, 200, JSON.stringify(signup.data));
  const login = await request(web, '/api/auth/sign-in/email', 'POST', { email, password });
  assert.equal(login.response.status, 200, JSON.stringify(login.data));
  const cookie = login.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.match(cookie, /session_token/);
  return { email, cookie };
}

test('AP and Field owner inquiry JSON downloads cross each own web proxy without sharing sessions', async () => {
  const clients = products.map(product => ({ ...product, pool: new pg.Pool({ connectionString: product.database }),
    account: null, organizationId: null, inquiryId: null }));
  try {
    for (const item of clients) {
      item.account = await account(item.web, `${item.name} export owner`);
      const created = await request(item.web, '/v1/organizations', 'POST',
        { name: `${item.name} 내보내기 검수` }, item.account.cookie);
      assert.equal(created.response.status, 201, JSON.stringify(created.data));
      item.organizationId = created.data.id;
      if (item.name === 'agent') {
        assert.equal((await request(item.web, '/v1/knowledge/draft', 'PUT', {
          expectedRevision: 0, businessName: 'AP 내보내기 검수', introduction: '',
          services: [{ name: '상담', description: '직접 문의' }], faqs: [],
        }, item.account.cookie)).response.status, 200);
        assert.equal((await request(item.web, '/v1/knowledge/releases', 'POST',
          { expectedRevision: 1 }, item.account.cookie)).response.status, 201);
        const submitted = await request(item.web,
          `/v1/public/organizations/${item.organizationId}/inquiries`, 'POST',
          { name: '합성 고객', phone: '010-1234-5678', message: 'AP 대화 기록', consent: true });
        assert.equal(submitted.response.status, 201, JSON.stringify(submitted.data));
        item.inquiryId = submitted.data.id;
      } else {
        const serviceId = randomUUID();
        assert.equal((await request(item.web, '/v1/business/draft', 'PUT', {
          expectedRevision: 0, businessName: 'Field 내보내기 검수', introduction: '',
          region: '서울', openingHours: '평일', contactPhone: '', defaultBookingMode: 'request',
          services: [{ id: serviceId, name: '상담', description: '직접 문의',
            bookingMode: 'request', durationMinutes: 30, priceAmount: null }],
        }, item.account.cookie)).response.status, 200);
        assert.equal((await request(item.web, '/v1/catalog/releases', 'POST',
          { expectedRevision: 1 }, item.account.cookie)).response.status, 201);
        const submitted = await request(item.web,
          `/v1/public/catalog/${item.organizationId}/inquiries`, 'POST',
          { serviceId, name: '합성 고객', phone: '010-1234-5678', message: 'Field 대화 기록', consent: true });
        assert.equal(submitted.response.status, 201, JSON.stringify(submitted.data));
        item.inquiryId = submitted.data.id;
      }
    }
    for (const item of clients) {
      const path = `/v1/owner/inquiries/${item.inquiryId}/export`;
      const other = clients.find(client => client.name !== item.name);
      assert.equal((await request(item.web, path)).response.status, 401);
      assert.equal((await request(item.web, path, 'GET', undefined, other.account.cookie)).response.status, 401);
      const downloaded = await request(item.web, path, 'GET', undefined, item.account.cookie);
      assert.equal(downloaded.response.status, 200, JSON.stringify(downloaded.data));
      assert.match(downloaded.response.headers.get('content-disposition') ?? '', /attachment; filename=/);
      assert.equal(downloaded.response.headers.get('cache-control'), 'private, no-store');
      assert.equal(downloaded.data.product, item.name);
      assert.equal(downloaded.data.inquiry.id, item.inquiryId);
      assert.match(downloaded.data.messages[0].body, /대화 기록/);
      if (item.name === 'agent') {
        const archivePath = `/v1/owner/organizations/${item.organizationId}/inquiries/export`;
        assert.equal((await request(item.web, archivePath)).response.status, 401);
        assert.equal((await request(item.web, archivePath, 'GET', undefined, other.account.cookie)).response.status, 401);
        const archive = await request(item.web, archivePath, 'GET', undefined, item.account.cookie);
        assert.equal(archive.response.status, 200, JSON.stringify(archive.data));
        assert.equal(archive.response.headers.get('cache-control'), 'private, no-store');
        assert.match(archive.response.headers.get('content-disposition') ?? '', /ap-inquiries-/);
        assert.equal(archive.data.organizationId, item.organizationId);
        assert.equal(archive.data.inquiries.length, 1);
        assert.equal(archive.data.inquiries[0].id, item.inquiryId);
        assert.match(archive.data.inquiries[0].messages[0].body, /AP 대화 기록/);
      } else {
        const archivePath = `/v1/owner/organizations/${item.organizationId}/operations/export`;
        assert.equal((await request(item.web, archivePath)).response.status, 401);
        assert.equal((await request(item.web, archivePath, 'GET', undefined, other.account.cookie)).response.status, 401);
        const archive = await request(item.web, archivePath, 'GET', undefined, item.account.cookie);
        assert.equal(archive.response.status, 200, JSON.stringify(archive.data));
        assert.equal(archive.response.headers.get('cache-control'), 'private, no-store');
        assert.match(archive.response.headers.get('content-disposition') ?? '', /field-operations-/);
        assert.equal(archive.data.organization.id, item.organizationId);
        assert.equal(archive.data.inquiries.length, 1);
        assert.equal(archive.data.inquiries[0].id, item.inquiryId);
        assert.match(archive.data.inquiries[0].messages[0].body, /Field 대화 기록/);
      }
    }
  } finally {
    for (const item of clients) {
      if (item.account) {
        await item.pool.query(`delete from ${item.name === 'agent' ? 'ap' : 'field'}.organizations
          where owner_user_id = (select id from "user" where email = $1)`, [item.account.email]).catch(() => undefined);
        await item.pool.query('delete from "user" where email = $1', [item.account.email]).catch(() => undefined);
      }
      await item.pool.end();
    }
  }
});
