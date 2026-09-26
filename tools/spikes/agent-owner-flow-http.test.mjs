import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
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

test('AP owner publishes a link and an independently owned widget, then handles guest inquiries', async () => {
  const ready = await fetch('http://127.0.0.1:4311/health/ready');
  assert.deepEqual(await ready.json(), { product: 'agent', status: 'ready' });
  const workspace = await fetch('http://localhost:3001/workspace');
  assert.equal(workspace.status, 200);
  const email = `ap-owner-flow-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString('base64url')}A1!`;
  const pool = new pg.Pool({ connectionString: database.toString() });
  let proof = '';
  let publicId = '';
  const externalSite = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (request.method === 'PUT' && (path === '/__test/proof' || path === '/__test/deployment')) {
      const chunks = [];
      request.on('data', chunk => chunks.push(chunk));
      request.on('end', () => {
        const value = Buffer.concat(chunks).toString('utf8');
        if (path.endsWith('/proof')) proof = value;
        else if (/^dep_[A-Za-z0-9_-]{20,50}$/.test(value)) publicId = value;
        else { response.writeHead(400).end(); return; }
        response.writeHead(204).end();
      });
      return;
    }
    if (path === '/.well-known/ap-site-verification') {
      response.writeHead(proof ? 200 : 404, { 'content-type': 'text/plain' })
        .end(proof ? `ap-site-verification=${proof}` : '');
      return;
    }
    if (path === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html>
        <html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body><main><h1>독립 외부 사이트</h1><p>이 사이트는 Field를 사용하지 않습니다.</p>
        ${publicId ? `<script async src="http://localhost:3001/sdk/v1.js" data-deployment="${publicId}" data-mode="floating"></script>` : ''}
        </main></body></html>`);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise(resolveListen => externalSite.listen(0, resolveListen));
  const address = externalSite.address();
  assert.ok(address && typeof address !== 'string');
  const siteOrigin = `http://owner-example.localhost:${address.port}`;
  try {
    const { stdout, stderr } = await run(process.env.AP_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python',
      [resolve('tools/spikes/agent-owner-flow-browser.py')], {
        cwd: resolve('.'), timeout: 180_000,
        env: { ...process.env, AP_TEST_OWNER_EMAIL: email, AP_TEST_OWNER_PASSWORD: password,
          AP_TEST_EXTERNAL_SITE_ORIGIN: siteOrigin },
      });
    assert.match(stdout, /AP owner to guest consultation flow: passed/, stderr);
  } finally {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`delete from ap.organizations where owner_user_id =
        (select id from "user" where email = $1)`, [email]);
      await client.query('delete from "user" where email = $1', [email]);
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); await pool.end(); await new Promise(resolveClose => externalSite.close(resolveClose)); }
  }
});
