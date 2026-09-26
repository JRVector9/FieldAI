import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import pg from 'pg';

const products = [
  { name: 'agent', web: 'http://localhost:3001', database: process.env.AP_DATABASE_URL },
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
  const email = `usage-http-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString('base64url')}A1!`;
  const signUp = await request(web, '/api/auth/sign-up/email', 'POST', { email, password, name });
  assert.equal(signUp.response.status, 200);
  const signIn = await request(web, '/api/auth/sign-in/email', 'POST', { email, password });
  assert.equal(signIn.response.status, 200);
  const cookie = signIn.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.match(cookie, /session_token/);
  return { email, cookie };
}

test('both product usage screens show own real work records without a charge amount', async () => {
  const clients = products.map(product => ({ ...product,
    pool: new pg.Pool({ connectionString: product.database }), account: null, organizationId: null }));
  try {
    for (const item of clients) {
      item.account = await account(item.web, `${item.name} usage owner`);
      const created = await request(item.web, '/v1/organizations', 'POST',
        { name: `${item.name} 사용량 검수` }, item.account.cookie);
      assert.equal(created.response.status, 201);
      item.organizationId = created.data.id;
      const empty = await request(item.web, '/v1/usage/summary', 'GET', undefined, item.account.cookie);
      assert.equal(empty.response.status, 200);
      assert.equal(empty.data.product, item.name);
      if (item.name === 'agent') {
        assert.equal(empty.data.work.inquiries, 0);
        assert.equal((await request(item.web, '/v1/knowledge/draft', 'PUT', {
          expectedRevision: 0, businessName: 'AP 사용량 검수', introduction: '',
          services: [{ name: '상담', description: '직접 문의' }], faqs: [],
        }, item.account.cookie)).response.status, 200);
        assert.equal((await request(item.web, '/v1/knowledge/releases', 'POST',
          { expectedRevision: 1 }, item.account.cookie)).response.status, 201);
        const submitted = await request(item.web,
          `/v1/public/organizations/${item.organizationId}/inquiries`, 'POST',
          { name: '합성 고객', phone: '010-1234-5678', message: 'AP 사용량 확인', consent: true });
        assert.equal(submitted.response.status, 201);
      } else {
        assert.equal(empty.data.work.directInquiries, 0);
        const serviceId = randomUUID();
        assert.equal((await request(item.web, '/v1/business/draft', 'PUT', {
          expectedRevision: 0, businessName: 'Field 사용량 검수', introduction: '',
          region: '서울', openingHours: '평일', contactPhone: '', defaultBookingMode: 'request',
          services: [{ id: serviceId, name: '상담', description: '직접 문의',
            bookingMode: 'request', durationMinutes: 30, priceAmount: null }],
        }, item.account.cookie)).response.status, 200);
        assert.equal((await request(item.web, '/v1/catalog/releases', 'POST',
          { expectedRevision: 1 }, item.account.cookie)).response.status, 201);
        const submitted = await request(item.web,
          `/v1/public/catalog/${item.organizationId}/inquiries`, 'POST',
          { serviceId, name: '합성 고객', phone: '010-1234-5678', message: 'Field 사용량 확인', consent: true });
        assert.equal(submitted.response.status, 201);
      }
      const result = await request(item.web, '/v1/usage/summary', 'GET', undefined, item.account.cookie);
      assert.equal(result.response.status, 200);
      assert.equal(result.response.headers.get('cache-control'), 'private, no-store');
      assert.equal(item.name === 'agent' ? result.data.work.inquiries : result.data.work.directInquiries, 1);
      assert.equal(result.data.billingAmount, undefined);
      assert.equal((await request(item.web, '/v1/usage/summary')).response.status, 401);
    }
    for (const item of clients) {
      const other = clients.find(client => client.name !== item.name);
      assert.equal((await request(item.web, '/v1/usage/summary', 'GET', undefined,
        other.account.cookie)).response.status, 401);
    }
    const browserPython = process.env.FIELD_USAGE_BROWSER_PYTHON;
    if (browserPython) {
      const output = execFileSync(browserPython, [resolve('tools/spikes/usage-browser.py')], {
        cwd: resolve('.'), encoding: 'utf8', timeout: 45_000,
        env: { ...process.env, AP_USAGE_COOKIE: clients[0].account.cookie,
          FIELD_USAGE_COOKIE: clients[1].account.cookie },
      });
      assert.match(output, /both usage screens passed/);
    }
  } finally {
    for (const item of clients) {
      try {
        if (item.account) {
          await item.pool.query(`delete from ${item.name === 'agent' ? 'ap' : 'field'}.organizations
            where owner_user_id = (select id from "user" where email = $1)`, [item.account.email]);
          await item.pool.query('delete from "user" where email = $1', [item.account.email]);
        }
      } finally { await item.pool.end(); }
    }
  }
});
