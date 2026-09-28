import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const preload = `
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const mode = process.env.E2E_PREREQUISITE_MODE;
const checked = { env: [], ready: [] };
const originalReadFileSync = fs.readFileSync;
const originalExistsSync = fs.existsSync;
fs.readFileSync = function (path, ...args) {
  const match = String(path).match(/\\/infra\\/(agent|field)\\/\\.env$/);
  if (!match) return originalReadFileSync.call(this, path, ...args);
  const product = match[1];
  checked.env.push(product);
  if (mode !== 'distribution' && product !== mode) throw new Error('OPPOSITE_ENV_READ');
  return product === 'agent'
    ? 'AP_DATABASE_URL=postgresql://agent_local:pw@127.0.0.1:55431/fieldai_agent_mock\\n'
    : 'FIELD_DATABASE_URL=postgresql://field_local:pw@127.0.0.1:55432/fieldai_field_mock\\nFIELD_VALKEY_URL=valkey://127.0.0.1:56332\\n';
};
fs.existsSync = function (path) {
  if (String(path) === '/tmp/e2e-runner-browser') return true;
  return originalExistsSync.call(this, path);
};
childProcess.spawnSync = () => ({ status: 0, signal: null });
syncBuiltinESMExports();
globalThis.fetch = async url => {
  checked.ready.push(String(url));
  const product = String(url).includes(':4311/') ? 'agent'
    : String(url).includes(':4321/') ? 'field' : undefined;
  return { status: 200, json: async () => ({
    product: process.env.E2E_WRONG_IDENTITY === product ? 'wrong-product' : product,
    status: 'ready',
  }) };
};
process.on('exit', () => process.stdout.write('E2E_PREREQUISITES=' + JSON.stringify(checked) + '\\n'));
`;

function run(mode, overrides = {}) {
  const result = spawnSync(process.execPath,
    ['--import', `data:text/javascript;base64,${Buffer.from(preload).toString('base64')}`,
      'tools/run-e2e.mjs', mode], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, E2E_PREREQUISITE_MODE: mode,
        AP_PROFILE: 'mock', FIELD_PROFILE: 'mock', APP_PROFILE: 'mock',
        AP_BROWSER_PYTHON: '/tmp/e2e-runner-browser',
        FIELD_BROWSER_PYTHON: '/tmp/e2e-runner-browser',
        FIELD_DISTRIBUTION_BROWSER_PYTHON: '/tmp/e2e-runner-browser', ...overrides },
    });
  const match = result.stdout.match(/^E2E_PREREQUISITES=(.+)$/m);
  return { result, checked: match ? JSON.parse(match[1]) : null };
}

test('own-product E2E ignores the opposite product profile', () => {
  for (const [mode, overrides] of [
    ['agent', { FIELD_PROFILE: 'live' }],
    ['field', { AP_PROFILE: 'live' }],
  ]) {
    const { result, checked } = run(mode, overrides);
    assert.equal(result.status, 0, `${mode}: ${result.stdout}\n${result.stderr}`);
    assert.deepEqual(checked.env, [mode]);
  }
});

test('own-product E2E still rejects non-mock and wrong API identity', () => {
  for (const mode of ['agent', 'field']) {
    const profile = mode === 'agent' ? 'AP_PROFILE' : 'FIELD_PROFILE';
    const rejectedProfile = run(mode, { [profile]: 'live' });
    assert.equal(rejectedProfile.result.status, 1);
    assert.match(rejectedProfile.result.stderr, /non-mock profile/);
    const wrongIdentity = run(mode, { E2E_WRONG_IDENTITY: mode });
    assert.equal(wrongIdentity.result.status, 1);
    assert.match(wrongIdentity.result.stderr, /not the expected/);
  }
});

for (const [mode, products] of [
  ['agent', ['agent']], ['field', ['field']], ['distribution', ['agent', 'field']],
]) {
  test(`${mode} E2E checks only its required products`, () => {
    const { result, checked } = run(mode);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(checked.env, products);
    assert.deepEqual(checked.ready.toSorted(), products.flatMap(product => product === 'agent'
      ? ['http://127.0.0.1:4311/health/ready', 'http://127.0.0.1:3001/workspace']
      : ['http://127.0.0.1:4321/health/ready', 'http://127.0.0.1:3002/workspace']).toSorted());
  });
}
