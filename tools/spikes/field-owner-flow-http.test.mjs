import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import pg from 'pg';

process.loadEnvFile(resolve('infra/field/.env'));
const run = promisify(execFile);
const database = new URL(process.env.FIELD_DATABASE_URL);
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.port, '55432');
assert.equal(database.username, 'field_local');
assert.equal(database.pathname, '/fieldai_field_mock');

test('Field owner publishes a site and handles guest inquiry and both booking modes', async () => {
  const ready = await fetch('http://127.0.0.1:4321/health/ready');
  assert.deepEqual(await ready.json(), { product: 'field', status: 'ready', integrations: { email: 'mock' } });
  const workspace = await fetch('http://127.0.0.1:3002/workspace');
  assert.equal(workspace.status, 200);
  const email = `field-owner-flow-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString('base64url')}A1!`;
  const pool = new pg.Pool({ connectionString: database.toString() });
  try {
    const { stdout, stderr } = await run(process.env.FIELD_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python',
      [resolve('tools/spikes/field-owner-flow-browser.py')], {
        cwd: resolve('.'), timeout: 120_000,
        env: { ...process.env, FIELD_TEST_OWNER_EMAIL: email, FIELD_TEST_OWNER_PASSWORD: password },
      });
    assert.match(stdout, /Field owner to guest site and booking flow: passed/, stderr);
  } finally {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`delete from field.site_releases sr using field.sites s,
        field.organizations o, "user" u where sr.site_id = s.id
        and s.organization_id = o.id and o.owner_user_id = u.id and u.email = $1`, [email]);
      await client.query(`delete from field.organizations where owner_user_id =
        (select id from "user" where email = $1)`, [email]);
      await client.query('delete from "user" where email = $1', [email]);
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); await pool.end(); }
  }
});
