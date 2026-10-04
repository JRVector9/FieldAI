import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
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
    for (const key of ['FIELD_RETENTION_JOURNAL_DIRECTORY', 'FIELD_REVOCATION_JOURNAL_DIRECTORY']) {
      assert.ok(isAbsolute(parseEnv(content)[key]), key);
    }
    const settingsPath = join(temporary, 'infra/field/.env');
    const legacy = content.replace(/^FIELD_RETENTION_JOURNAL_DIRECTORY=.*$/m, 'FIELD_RETENTION_JOURNAL_DIRECTORY=infra/field/retention-journal')
      .replace(/^FIELD_REVOCATION_JOURNAL_DIRECTORY=.*$/m, 'FIELD_REVOCATION_JOURNAL_DIRECTORY=infra/field/revocation-journal');
    const proof = join(temporary, 'infra/field/revocation-journal/synthetic-proof');
    writeFileSync(proof, 'keep existing journal');
    writeFileSync(settingsPath, legacy, { mode: 0o600 });
    const upgraded = spawnSync(process.execPath, [resolve('tools/setup-mock-env.mjs'), 'field'], { cwd: temporary, encoding: 'utf8' });
    assert.equal(upgraded.status, 0, upgraded.stderr);
    assert.equal(readFileSync(settingsPath, 'utf8'), content, 'relative path upgrade preserves all original secrets');
    assert.equal(readFileSync(proof, 'utf8'), 'keep existing journal');
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
