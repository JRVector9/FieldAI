import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import pg from 'pg';

process.loadEnvFile(resolve('infra/agent/.env'));
process.loadEnvFile(resolve('infra/field/.env'));

const products = [
  { name: 'agent', web: 'http://localhost:3001', database: process.env.AP_DATABASE_URL },
  { name: 'field', web: 'http://127.0.0.1:3002', database: process.env.FIELD_DATABASE_URL },
];

function mockDatabase(product) {
  const url = new URL(product.database);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, product.name === 'agent' ? '55431' : '55432');
  assert.equal(url.username, `${product.name}_local`);
  assert.equal(url.pathname, `/fieldai_${product.name}_mock`);
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
  const email = `signout-http-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString('base64url')}A1!`;
  const created = await request(product.web, '/api/auth/sign-up/email', 'POST',
    { email, password, name: `${product.name} session owner` });
  assert.equal(created.response.status, 200, JSON.stringify(created.data));
  const signed = await request(product.web, '/api/auth/sign-in/email', 'POST', { email, password });
  assert.equal(signed.response.status, 200, JSON.stringify(signed.data));
  const cookie = signed.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.match(cookie, /session_token/);
  return { email, cookie };
}

test('AP and Field logout revoke only their own real sessions', async () => {
  const clients = products.map(product => ({ ...product, pool: null, account: null }));
  for (const item of clients) mockDatabase(item);
  try {
    for (const item of clients) {
      item.pool = new pg.Pool({ connectionString: item.database });
      item.account = await account(item);
      const session = await request(item.web, '/api/auth/get-session', 'GET', undefined, item.account.cookie);
      assert.equal(session.response.status, 200);
      assert.equal(session.data.user.email, item.account.email);
    }
    if (process.env.FIELD_SIGNOUT_BROWSER_PYTHON) {
      const output = execFileSync(process.env.FIELD_SIGNOUT_BROWSER_PYTHON,
        [resolve('tools/spikes/account-signout-browser.py')], {
          cwd: resolve('.'), encoding: 'utf8', timeout: 45_000,
          env: { ...process.env, AP_SIGNOUT_COOKIE: clients[0].account.cookie,
            FIELD_SIGNOUT_COOKIE: clients[1].account.cookie },
        });
      assert.match(output, /both products signed out independently/);
    } else {
      for (const item of clients) {
        const signedOut = await request(item.web, '/api/auth/sign-out', 'POST', {}, item.account.cookie);
        assert.equal(signedOut.response.status, 200, JSON.stringify(signedOut.data));
      }
    }
    for (const item of clients) {
      const stale = await request(item.web, '/api/auth/get-session', 'GET', undefined, item.account.cookie);
      assert.equal(stale.response.status, 200);
      assert.equal(stale.data, null, `${item.name} old session must be revoked server-side`);
    }
  } finally {
    for (const item of clients) {
      try {
        if (item.pool && item.account)
          await item.pool.query('delete from "user" where email = $1', [item.account.email]);
      } finally { await item.pool?.end(); }
    }
  }
});
