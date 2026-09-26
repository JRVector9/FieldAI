import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const suites = {
  agent: [
    ['AP owner, external widget, and guest consultation', 'agent-owner-flow-http.test.mjs'],
    ['AP publisher recovery', 'publisher-recovery-http.test.mjs'],
    ['AP administrator routes and permission boundary', 'agent-admin-http.test.mjs'],
    ['AP report, approved support access, and owner appeal', 'agent-moderation-http.test.mjs'],
    ['AP customer support scopes, private photos, and authority expiry', 'agent-customer-support-http.test.mjs'],
    ['AP retention legacy closure evidence migration', 'agent-retention-migration.test.mjs'],
    ['AP native retention policy approval, inquiry holds, and administrator recovery', 'agent-retention-http.test.mjs'],
  ],
  field: [
    ['Field owner, public site, inquiry, and two booking modes', 'field-owner-flow-http.test.mjs'],
    ['Field site autosave and release boundary', 'field-site-autosave-http.test.mjs'],
    ['Field administrator routes and permission boundary', 'field-admin-http.test.mjs'],
    ['Field report, approved support access, and owner appeal', 'field-moderation-http.test.mjs'],
    ['Field customer support scopes, owned snapshots, and private photo expiry', 'field-customer-support-http.test.mjs'],
    ['Field retention legacy closure migration and immutable policy basis', 'field-retention-migration.test.mjs'],
    ['Field retention policies, holds, job cancellation/approval, independent purge worker and ended receipt', 'field-retention-http.test.mjs'],
  ],
  distribution: [
    ['AP publisher recovery', 'publisher-recovery-http.test.mjs'],
    ['AP placement to Field booking, signed event, and weekly metrics',
      'ap-field-connection-http.test.mjs'],
  ],
};
const mode = process.argv[2];
const systemNames = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'USER', 'SHELL', 'TERM', 'CI'];
const systemEnv = Object.fromEntries(systemNames.filter(name => process.env[name] !== undefined)
  .map(name => [name, process.env[name]]));

function localSettings(product) {
  const prefix = product === 'agent' ? 'AP' : 'FIELD';
  const settings = parseEnv(readFileSync(resolve(root, `infra/${product}/.env`), 'utf8'));
  const database = settings[`${prefix}_DATABASE_URL`];
  const dbUrl = database ? new URL(database) : null;
  const dbPort = product === 'agent' ? '55431' : '55432';
  if (!dbUrl || dbUrl.protocol !== 'postgresql:' || dbUrl.hostname !== '127.0.0.1'
    || dbUrl.port !== dbPort || dbUrl.username !== `${product}_local`
    || dbUrl.pathname !== `/fieldai_${product}_mock`)
    throw new Error(`${product} E2E requires this project's local mock PostgreSQL database`);
  if (product === 'field') {
    const queue = settings.FIELD_VALKEY_URL;
    const queueUrl = queue ? new URL(queue) : null;
    if (!queueUrl || !['redis:', 'valkey:'].includes(queueUrl.protocol)
      || queueUrl.hostname !== '127.0.0.1'
      || queueUrl.port !== '56332')
      throw new Error('Field E2E requires this project\'s local mock Valkey');
  }
}

async function ready(url, product) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  if (response.status !== 200) throw new Error(`${url} is not ready (${response.status})`);
  if (product) {
    const body = await response.json();
    if (body.product !== product || body.status !== 'ready')
      throw new Error(`${url} is not the expected ${product} API`);
  }
}

function run(label, filename, env) {
  process.stdout.write(`local mock E2E: ${label}\n`);
  const result = spawnSync(process.execPath,
    ['--test', `tools/spikes/${filename}`], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0)
    throw new Error(`${label} failed (${result.signal ?? result.status})`);
}

try {
  if (!Object.hasOwn(suites, mode))
    throw new Error('usage: node tools/run-e2e.mjs [agent|field|distribution]');
  if (process.env.NODE_ENV === 'production'
    || ['AP_PROFILE', 'FIELD_PROFILE', 'APP_PROFILE'].some(name =>
      process.env[name] && process.env[name] !== 'mock'))
    throw new Error('local mock E2E cannot run under a non-mock profile');
  localSettings('agent');
  localSettings('field');
  const python = process.env.FIELD_DISTRIBUTION_BROWSER_PYTHON
    ?? process.env.AP_BROWSER_PYTHON ?? process.env.FIELD_BROWSER_PYTHON
    ?? '/tmp/fieldai-ui-venv/bin/python';
  if (!existsSync(python)) throw new Error(`Chromium test Python is unavailable: ${python}`);
  await Promise.all([
    ready('http://127.0.0.1:4311/health/ready', 'agent'),
    ready('http://127.0.0.1:4321/health/ready', 'field'),
    ready('http://127.0.0.1:3001/workspace'),
    ready('http://127.0.0.1:3002/workspace'),
  ]);
  const env = {
    ...systemEnv,
    AP_BROWSER_PYTHON: python,
    FIELD_BROWSER_PYTHON: python,
  };
  if (mode === 'distribution') {
    env.FIELD_EVENT_WORKERS_RUNNING = '1';
    env.FIELD_DISTRIBUTION_E2E = '1';
    env.FIELD_DISTRIBUTION_BROWSER_PYTHON = python;
  }
  for (const [label, filename] of suites[mode]) run(label, filename, env);
  process.stdout.write(`local mock E2E ${mode}: passed; external-provider and release gates remain open\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
