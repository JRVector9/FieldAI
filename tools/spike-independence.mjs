import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const product = process.argv[2];
if (product !== 'agent' && product !== 'field') throw new Error('usage: node tools/spike-independence.mjs agent|field');
const isAgent = product === 'agent';
process.loadEnvFile(resolve(`infra/${product}/.env`));
const upper = isAgent ? 'AP' : 'FIELD';
const socket = createServer();
socket.listen(0, '127.0.0.1');
await new Promise((done) => socket.once('listening', done));
const address = socket.address();
assert.ok(address && typeof address !== 'string');
const port = address.port;
socket.close();
await new Promise((done) => socket.once('close', done));
const databaseUrl = process.env[`${upper}_DATABASE_URL`];
assert.ok(databaseUrl);

const child = spawn(process.execPath, ['dist/server.js'], {
  cwd: resolve(`apps/${product}-api`),
  env: {
    PATH: process.env.PATH,
    [`${upper}_DATABASE_URL`]: databaseUrl,
    [`${upper}_AUTH_SECRET`]: process.env[`${upper}_AUTH_SECRET`],
    [`${upper}_AUTH_BASE_URL`]: `http://127.0.0.1:${port}`,
    [`${upper}_PUBLIC_WEB_ORIGIN`]: `http://127.0.0.1:${isAgent ? 3001 : 3002}`,
    [`${upper}_PORT`]: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const childExited = new Promise((done) => child.once('close', done));
let stderr = '';
child.stderr.on('data', (chunk) => { stderr += String(chunk); });

try {
  let response;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`${product} exited before readiness: ${stderr}`);
    try {
      response = await fetch(`http://127.0.0.1:${port}/health/ready`);
      if (response.status === 200) break;
    } catch { /* 서버 기동 대기 */ }
    await delay(100);
  }
  assert.equal(response?.status, 200, `${product} server did not become ready`);
  assert.deepEqual(await response.json(), { product, status: 'ready', integrations: { email: 'mock' } });
  process.stdout.write(`${product} API ready with only its own DB and auth settings in the child environment\n`);
} finally {
  child.kill('SIGTERM');
  await childExited;
}
