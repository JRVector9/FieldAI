import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { assertPortsFree } from '../mock-run.mjs';

test('mock runner refuses to take an occupied application port', async () => {
  const occupied = createServer();
  occupied.listen(0, '127.0.0.1');
  await new Promise(resolve => occupied.once('listening', resolve));
  const address = occupied.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await assert.rejects(assertPortsFree([{ name: 'AP API', port: address.port }]),
      new RegExp(`AP API port ${address.port} is already in use`));
  } finally {
    occupied.close();
    await new Promise(resolve => occupied.once('close', resolve));
  }
  await assertPortsFree([{ name: 'AP API', port: address.port }]);
});

test('fresh Field mock settings use the separate browser host for OAuth', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'fieldai-mock-env-'));
  try {
    mkdirSync(join(temporary, 'infra/field'), { recursive: true });
    const result = spawnSync(process.execPath,
      [resolve('tools/setup-mock-env.mjs'), 'field'],
      { cwd: temporary, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const content = readFileSync(join(temporary, 'infra/field/.env'), 'utf8');
    assert.match(content, /^FIELD_PUBLIC_WEB_ORIGIN=http:\/\/127\.0\.0\.1:3002$/m);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
