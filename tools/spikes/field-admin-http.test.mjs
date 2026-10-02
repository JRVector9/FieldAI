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

test('Field admin route opens an aggregate overview only for a separate Field operator', async () => {
  const ready = await fetch('http://127.0.0.1:4321/health/ready');
  assert.deepEqual(await ready.json(), { product: 'field', status: 'ready', integrations: { email: 'mock' } });
  const accounts = Array.from({ length: 2 }, () => ({
    email: `field-admin-browser-${randomUUID()}@example.invalid`,
    password: `${randomBytes(18).toString('base64url')}A1!`,
  }));
  const pool = new pg.Pool({ connectionString: database.toString() });
  const organizationId = randomUUID(), eventId = randomUUID();
  const privateMarker = `private-admin-${randomUUID()}`;
  try {
    for (const account of accounts) {
      const response = await fetch('http://localhost:3002/api/auth/sign-up/email', {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3002' },
        body: JSON.stringify({ ...account, name: 'Synthetic Field admin browser' }),
      });
      assert.equal(response.status, 200);
    }
    const actor = (await pool.query('select id from "user" where email = $1', [accounts[1].email])).rows[0].id;
    await pool.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)',
      [organizationId, actor, 'Synthetic Field admin browser']);
    await pool.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload,occurred_at)
      values ($1,$2,'synthetic.admin.pending','private-aggregate',$3,now() + interval '1 year')`,
      [eventId, organizationId, { customerPhone: privateMarker }]);
    await run(process.execPath, [resolve('tools/mock-field-admin.mjs'), 'grant', accounts[1].email],
      { cwd: resolve('.'), timeout: 15_000 });
    const { stdout, stderr } = await run(process.env.FIELD_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python',
      [resolve('tools/spikes/field-admin-browser.py')], {
        cwd: resolve('.'), timeout: 90_000,
        env: { ...process.env, FIELD_TEST_NORMAL_EMAIL: accounts[0].email,
          FIELD_TEST_NORMAL_PASSWORD: accounts[0].password, FIELD_TEST_ADMIN_EMAIL: accounts[1].email,
          FIELD_TEST_ADMIN_PASSWORD: accounts[1].password, FIELD_TEST_INCIDENT_ID: eventId,
          FIELD_TEST_PRIVATE_MARKER: privateMarker },
      });
    assert.match(stdout, /Field admin membership and aggregate mobile overview: passed/, stderr);
    const audit = await pool.query(`select actor_user_id,count(*)::int as count from field.admin_access_audit
      where actor_user_id = any(select id from "user" where email = any($1::text[]))
      group by actor_user_id`, [accounts.map(item => item.email)]);
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].actor_user_id, actor);
    assert.ok(audit.rows[0].count >= 2);
    await run(process.execPath, [resolve('tools/mock-field-admin.mjs'), 'revoke', accounts[1].email],
      { cwd: resolve('.'), timeout: 15_000 });
    const membership = await pool.query(`select count(*)::int as count from field.platform_admin_memberships
      where user_id = (select id from "user" where email = $1)`, [accounts[1].email]);
    assert.equal(membership.rows[0].count, 0);
  } finally {
    await pool.query('delete from field.organizations where id = $1', [organizationId]);
    await pool.query('delete from "user" where email = any($1::text[])', [accounts.map(item => item.email)]);
    await pool.end();
  }
});
