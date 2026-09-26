import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import pg from 'pg';

const run = promisify(execFile);
const web = 'http://127.0.0.1:3001';

async function request(path, method, body, cookie) {
  const response = await fetch(`${web}${path}`, { method, headers: {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(cookie ? { cookie } : {}),
    ...(method === 'GET' ? {} : { origin: web }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { response, data: await response.clone().json().catch(() => ({})) };
}

test('AP native knowledge draft survives edits and requires separate complete approval', async () => {
  const email = `ap-knowledge-autosave-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString('base64url')}A1!`;
  const pool = new pg.Pool({ connectionString: process.env.AP_DATABASE_URL });
  try {
    const signup = await request('/api/auth/sign-up/email', 'POST', { email, password, name: 'Knowledge owner' });
    assert.equal(signup.response.status, 200, JSON.stringify(signup.data));
    const login = await request('/api/auth/sign-in/email', 'POST', { email, password });
    assert.equal(login.response.status, 200, JSON.stringify(login.data));
    const cookie = login.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert.match(cookie, /session_token/);
    const org = await request('/v1/organizations', 'POST', { name: 'AP 지식 저장 검수' }, cookie);
    assert.equal(org.response.status, 201, JSON.stringify(org.data));
    const { stdout, stderr } = await run(process.env.AP_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python',
      ['tools/spikes/agent-knowledge-autosave-browser.py'], {
        cwd: process.cwd(), timeout: 120000,
        env: { ...process.env, AP_TEST_OWNER_EMAIL: email, AP_TEST_OWNER_PASSWORD: password,
          AP_TEST_ORGANIZATION_ID: org.data.id },
      });
    assert.match(stdout, /AP knowledge autosave browser: passed/, stderr);
  } finally {
    await pool.query(`delete from ap.organizations where owner_user_id =
      (select id from "user" where email = $1)`, [email]).catch(() => undefined);
    await pool.query('delete from "user" where email = $1', [email]).catch(() => undefined);
    await pool.end();
  }
});
