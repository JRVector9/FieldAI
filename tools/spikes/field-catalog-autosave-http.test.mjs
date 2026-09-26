import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import pg from 'pg';

const run = promisify(execFile);
const web = 'http://127.0.0.1:3002';

async function request(path, method, body, cookie) {
  const response = await fetch(`${web}${path}`, { method, headers: {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(cookie ? { cookie } : {}),
    ...(method === 'GET' ? {} : { origin: web }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { response, data: await response.clone().json().catch(() => ({})) };
}

test('Field business draft autosave preserves edits and keeps approval separate', async () => {
  const email = `field-catalog-autosave-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString('base64url')}A1!`;
  const pool = new pg.Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  try {
    const signup = await request('/api/auth/sign-up/email', 'POST', { email, password, name: 'Catalog owner' });
    assert.equal(signup.response.status, 200, JSON.stringify(signup.data));
    const login = await request('/api/auth/sign-in/email', 'POST', { email, password });
    assert.equal(login.response.status, 200, JSON.stringify(login.data));
    const cookie = login.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert.match(cookie, /session_token/);
    const org = await request('/v1/organizations', 'POST', { name: 'Field 사업정보 저장 검수' }, cookie);
    assert.equal(org.response.status, 201, JSON.stringify(org.data));
    const { stdout, stderr } = await run(process.env.FIELD_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python',
      ['tools/spikes/field-catalog-autosave-browser.py'], {
        cwd: process.cwd(), timeout: 120000,
        env: { ...process.env, FIELD_TEST_OWNER_EMAIL: email, FIELD_TEST_OWNER_PASSWORD: password,
          FIELD_TEST_ORGANIZATION_ID: org.data.id },
      });
    assert.match(stdout, /Field catalog autosave browser: passed/, stderr);
  } finally {
    await pool.query(`delete from field.organizations where owner_user_id =
      (select id from "user" where email = $1)`, [email]).catch(() => undefined);
    await pool.query('delete from "user" where email = $1', [email]).catch(() => undefined);
    await pool.end();
  }
});
