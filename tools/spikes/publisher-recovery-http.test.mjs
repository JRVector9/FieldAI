import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import pg from 'pg';

process.loadEnvFile(resolve('infra/agent/.env'));
const run = promisify(execFile);
const database = new URL(process.env.AP_DATABASE_URL);
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.port, '55431');
assert.equal(database.username, 'agent_local');
assert.equal(database.pathname, '/fieldai_agent_mock');

test('AP publisher distinguishes read failure from login and committed organization creation', async () => {
  const ready = await fetch('http://127.0.0.1:4311/health/ready');
  assert.deepEqual(await ready.json(), { product: 'agent', status: 'ready' });
  const email = `ap-publisher-recovery-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString('base64url')}A1!`;
  const origin = `https://pub-${randomUUID()}.example.invalid`;
  const pool = new pg.Pool({ connectionString: database.toString() });
  try {
    const { stdout, stderr } = await run(process.env.AP_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python',
      [resolve('tools/spikes/publisher-recovery-browser.py')], {
        cwd: resolve('.'), timeout: 90_000,
        env: { ...process.env, AP_TEST_PUBLISHER_EMAIL: email, AP_TEST_PUBLISHER_PASSWORD: password,
          AP_TEST_PUBLISHER_ORIGIN: origin },
      });
    assert.match(stdout, /AP publisher first read and post-ACK read recovery: passed/, stderr);
  } finally {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('delete from ap.publishers where owner_user_id = (select id from "user" where email = $1)', [email]);
      await client.query('delete from "user" where email = $1', [email]);
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); await pool.end(); }
  }
});
