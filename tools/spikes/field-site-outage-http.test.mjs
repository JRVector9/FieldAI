import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createPortServer } from 'node:net';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function openPort() {
  const server = createPortServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return port;
}

test('Field published site explains temporary API failure while preserving 404', { timeout: 30000 }, async () => {
  let upstreamStatus = 503;
  const site = {
    siteId: '11111111-1111-4111-8111-111111111111', slug: 'field-012345abcdef',
    organizationId: '22222222-2222-4222-8222-222222222222', siteOrigin: null, apWidget: null,
    template: 'essential', palette: '#264653', siteRevision: 1, catalogRevision: 1,
    latestCatalogRevision: 1, stale: false,
    pages: [
      { id: 'home', slug: 'home', title: '홈', sections: [{ id: 'hero', kind: 'hero', heading: '회복된 사이트 홈', body: '공개 정보' }] },
      { id: 'services', slug: 'services', title: '서비스', sections: [{ id: 'info', kind: 'text', heading: '회복된 서비스 안내', body: '공개 정보' }] },
    ],
    catalog: { businessName: '합성 사업장', introduction: '공개 소개', region: '서울', contactPhone: '', services: [] },
  };
  const api = createServer((request, response) => {
    if (request.url?.startsWith('/__status/')) {
      upstreamStatus = Number(request.url.slice('/__status/'.length));
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(upstreamStatus, { 'content-type': upstreamStatus === 200 ? 'application/json' : 'text/plain; charset=utf-8' });
    response.end(upstreamStatus === 200 ? JSON.stringify(site) : upstreamStatus === 503 ? 'private upstream error' : 'Not Found');
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const webPort = await openPort();
  const web = spawn(process.execPath, [resolve('apps/field-web/node_modules/next/dist/bin/next'), 'start', '-p', String(webPort)], {
    cwd: resolve('apps/field-web'),
    env: { ...process.env, APP_PROFILE: 'mock', FIELD_API_BASE_URL: `http://127.0.0.1:${api.address().port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  web.stderr.on('data', chunk => { logs = (logs + chunk.toString()).slice(-1500); });
  try {
    const base = `http://127.0.0.1:${webPort}`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (web.exitCode !== null) throw new Error(`Field web exited: ${logs}`);
      try {
        await fetch(`${base}/site/field-012345abcdef`);
        ready = true;
        break;
      } catch { await new Promise(resolveWait => setTimeout(resolveWait, 150)); }
    }
    assert.equal(ready, true, `Field web did not start: ${logs}`);
    for (const path of ['/site/field-012345abcdef', '/site/field-012345abcdef/services']) {
      const response = await fetch(`${base}${path}`);
      const html = await response.text();
      assert.equal(response.status, 500);
      assert.doesNotMatch(html, /private upstream error/);
    }
    const { stdout, stderr } = await run(process.env.FIELD_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python',
      [resolve('tools/spikes/field-site-outage-browser.py'), base, `http://127.0.0.1:${api.address().port}`], {
        cwd: resolve('.'), timeout: 20000,
      });
    assert.match(stdout, /Field site outage browser: passed/, stderr);
    upstreamStatus = 404;
    const missing = await fetch(`${base}/site/field-012345abcdef`);
    assert.equal(missing.status, 404);
    assert.ok(!(await missing.text()).includes('사이트를 일시적으로 불러오지 못했습니다'));
  } finally {
    if (web.exitCode === null) {
      web.kill('SIGTERM');
      await Promise.race([once(web, 'exit'), new Promise(resolveWait => setTimeout(resolveWait, 3000))]);
      if (web.exitCode === null) web.kill('SIGKILL');
    }
    await new Promise((resolveClose, reject) => api.close(error => error ? reject(error) : resolveClose()));
  }
});
