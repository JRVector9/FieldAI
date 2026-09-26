import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const systemNames = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'USER', 'SHELL', 'TERM', 'CI'];
const systemEnv = Object.fromEntries(systemNames.filter(name => process.env[name] !== undefined)
  .map(name => [name, process.env[name]]));

function requireLocalSettings(product) {
  const prefix = product === 'agent' ? 'AP' : 'FIELD';
  const settings = parseEnv(readFileSync(resolve(root, `infra/${product}/.env`), 'utf8'));
  const value = settings[`${prefix}_DATABASE_URL`];
  const database = value ? new URL(value) : null;
  const port = product === 'agent' ? '55431' : '55432';
  if (!database || database.protocol !== 'postgresql:' || database.hostname !== '127.0.0.1'
    || database.port !== port || database.username !== `${product}_local`
    || database.pathname !== `/fieldai_${product}_mock`)
    throw new Error(`${product} security baseline requires this project's local mock PostgreSQL`);
  if (product === 'field') {
    const queue = settings.FIELD_VALKEY_URL ? new URL(settings.FIELD_VALKEY_URL) : null;
    if (!queue || !['redis:', 'valkey:'].includes(queue.protocol)
      || queue.hostname !== '127.0.0.1' || queue.port !== '56332')
      throw new Error('Field security baseline requires this project\'s local mock Valkey');
  }
}

async function requireReady(url, product) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  if (response.status !== 200) throw new Error(`${url} is not ready (${response.status})`);
  if (product) {
    const body = await response.json();
    if (body.product !== product || body.status !== 'ready')
      throw new Error(`${url} is not the expected ${product} API`);
  }
}

function run(label, args, env) {
  process.stdout.write(`local mock security: ${label}\n`);
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0)
    throw new Error(`${label} failed (${result.signal ?? result.status})`);
}

try {
  if (process.env.NODE_ENV === 'production'
    || ['AP_PROFILE', 'FIELD_PROFILE', 'APP_PROFILE'].some(name =>
      process.env[name] && process.env[name] !== 'mock'))
    throw new Error('local mock security baseline cannot run under a non-mock profile');
  requireLocalSettings('agent');
  requireLocalSettings('field');
  const python = process.env.AP_BROWSER_PYTHON ?? process.env.FIELD_BROWSER_PYTHON
    ?? '/tmp/fieldai-ui-venv/bin/python';
  if (!existsSync(python)) throw new Error(`Chromium test Python is unavailable: ${python}`);
  await Promise.all([
    requireReady('http://127.0.0.1:4311/health/ready', 'agent'),
    requireReady('http://127.0.0.1:4321/health/ready', 'field'),
    requireReady('http://127.0.0.1:3001/workspace'),
    requireReady('http://127.0.0.1:3002/workspace'),
  ]);
  const env = { ...systemEnv, AP_BROWSER_PYTHON: python, FIELD_BROWSER_PYTHON: python };
  run('cross-product source import boundary', ['tools/check-import-boundaries.mjs'], env);
  run('separate database credentials', ['tools/check-db-isolation.mjs'], env);
  run('AP isolated database authorization assertions', ['tools/run-db-suite.mjs', 'agent'], env);
  run('Field isolated database authorization assertions', ['tools/run-db-suite.mjs', 'field'], env);
  run('Field tenant origin and public path isolation',
    ['--env-file=infra/field/.env', '--test', 'tools/spikes/field-tenant-host-http.test.mjs'], env);
  run('AP administrator authorization and audit browser flow',
    ['--test', 'tools/spikes/agent-admin-http.test.mjs'], env);
  run('Field administrator authorization and audit browser flow',
    ['--test', 'tools/spikes/field-admin-http.test.mjs'], env);
  process.stdout.write('local mock security baseline: passed; provider, penetration, and release gates remain open\n');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
