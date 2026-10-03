import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import pg from 'pg';

// 조직 삭제 예약(비밀번호 재확인)·예약 중 새 체험 차단·취소를 각 제품 실제 웹 프록시로 검사한다.
// 합성 계정·조직만 만들고 종료 시 지운다. 브라우저 단계는 없다.
// 실행기는 ACCOUNT_DELETION_PRODUCT=agent|field로 자기 제품만 검사한다(비우면 두 제품 모두).
const ONLY = process.env.ACCOUNT_DELETION_PRODUCT;
const PRODUCTS = [
  { name: 'agent', web: 'http://localhost:3001', env: 'infra/agent/.env', database: 'AP_DATABASE_URL', schema: 'ap', port: '55431' },
  { name: 'field', web: 'http://127.0.0.1:3002', env: 'infra/field/.env', database: 'FIELD_DATABASE_URL', schema: 'field', port: '55432' },
].filter(product => !ONLY || product.name === ONLY);

function mockDatabase(product) {
  process.loadEnvFile(resolve(product.env));
  const url = new URL(process.env[product.database]);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, product.port);
  assert.equal(url.username, `${product.name}_local`);
  assert.equal(url.pathname, `/fieldai_${product.name}_mock`);
  return url.href;
}

async function request(web, path, method = 'GET', body, cookie) {
  const response = await fetch(`${web}${path}`, { method, headers: {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(cookie ? { cookie } : {}),
    ...(method === 'GET' ? {} : { origin: web }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { response, data: await response.clone().json().catch(() => ({})) };
}

async function account(product) {
  const email = `deletion-http-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString('base64url')}A1!`;
  const created = await request(product.web, '/api/auth/sign-up/email', 'POST',
    { email, password, name: `${product.name} deletion owner` });
  assert.equal(created.response.status, 200, JSON.stringify(created.data));
  const signed = await request(product.web, '/api/auth/sign-in/email', 'POST', { email, password });
  assert.equal(signed.response.status, 200, JSON.stringify(signed.data));
  const cookie = signed.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.match(cookie, /session_token/);
  return { email, password, cookie };
}

for (const product of PRODUCTS) {
  test(`${product.name} organization deletion: password re-auth schedule, blocked trial start, cancel`, async () => {
    const pool = new pg.Pool({ connectionString: mockDatabase(product) });
    let owner;
    try {
      owner = await account(product);
      const name = `${product.name} 삭제 검수 ${randomUUID().slice(0, 8)}`;
      const organization = await request(product.web, '/v1/organizations', 'POST', { name }, owner.cookie);
      assert.equal(organization.response.status, 201, JSON.stringify(organization.data));

      const before = await request(product.web, '/v1/organizations/current/deletion-requests/current', 'GET', undefined, owner.cookie);
      assert.equal(before.response.status, 200, JSON.stringify(before.data));
      assert.equal(before.data.request, null);
      assert.equal(before.data.canManage, true);
      assert.equal(before.response.headers.get('cache-control'), 'private, no-store');

      const body = { confirmText: name, acknowledgements: { retention: true, subscriptions: true, connections: true } };
      const missing = await request(product.web, '/v1/organizations/current/deletion-requests', 'POST', body, owner.cookie);
      assert.equal(missing.response.status, 400, JSON.stringify(missing.data));
      assert.equal(missing.data.error, 'password_required');
      const wrong = await request(product.web, '/v1/organizations/current/deletion-requests', 'POST',
        { ...body, password: `${owner.password}x` }, owner.cookie);
      assert.equal(wrong.response.status, 403, JSON.stringify(wrong.data));
      assert.equal(wrong.data.error, 'invalid_password');

      const scheduled = await request(product.web, '/v1/organizations/current/deletion-requests', 'POST',
        { ...body, password: owner.password }, owner.cookie);
      assert.equal(scheduled.response.status, 201, JSON.stringify(scheduled.data));
      assert.equal(scheduled.data.request.status, 'scheduled');

      // 삭제 유예 중에는 조직당 1회인 체험을 새로 시작할 수 없다.
      const trial = await request(product.web, '/v1/subscription/trial', 'POST',
        { consentVersion: 'mock-trial-v1', termsAccepted: true }, owner.cookie);
      assert.equal(trial.response.status, 409, JSON.stringify(trial.data));
      assert.match(String(trial.data.error), /deletion_scheduled/);
      const access = await request(product.web, '/v1/subscription', 'GET', undefined, owner.cookie);
      assert.equal(access.response.status, 200);
      assert.equal(access.data.access.reason, 'deletion_scheduled');
      assert.equal(access.data.trial, null);

      const canceled = await request(product.web, '/v1/organizations/current/deletion-requests/current', 'DELETE', undefined, owner.cookie);
      assert.equal(canceled.response.status, 200, JSON.stringify(canceled.data));
      assert.equal(canceled.data.request.status, 'canceled');
      const again = await request(product.web, '/v1/organizations/current/deletion-requests/current', 'DELETE', undefined, owner.cookie);
      assert.equal(again.response.status, 404);
      const after = await request(product.web, '/v1/subscription', 'GET', undefined, owner.cookie);
      assert.notEqual(after.data.access.reason, 'deletion_scheduled');
    } finally {
      try {
        if (owner) {
          const owned = `(select id from ${product.schema}.organizations where owner_user_id = (select id from "user" where email=$1))`;
          await pool.query(`delete from ${product.schema}.organization_deletion_requests where organization_id in ${owned}`, [owner.email]);
          await pool.query(`delete from ${product.schema}.trial_subscriptions where organization_id in ${owned}`, [owner.email]);
          await pool.query(`delete from ${product.schema}.organizations where id in ${owned}`, [owner.email]);
          await pool.query('delete from "user" where email=$1', [owner.email]);
        }
      } finally { await pool.end(); }
    }
  });
}
