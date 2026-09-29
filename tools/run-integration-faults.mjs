import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const systemNames = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'USER', 'SHELL', 'TERM', 'CI'];
const systemEnv = Object.fromEntries(systemNames.filter(name => process.env[name] !== undefined)
  .map(name => [name, process.env[name]]));

function localSettings(product) {
  const prefix = product === 'agent' ? 'AP' : 'FIELD';
  const settings = parseEnv(readFileSync(resolve(root, `infra/${product}/.env`), 'utf8'));
  const database = settings[`${prefix}_DATABASE_URL`];
  const dbUrl = database ? new URL(database) : null;
  const dbPort = product === 'agent' ? '55431' : '55432';
  if (!dbUrl || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== dbPort
    || dbUrl.username !== `${product}_local` || dbUrl.pathname !== `/fieldai_${product}_mock`)
    throw new Error(`${product} fault checks require this project's local mock database`);
  if (product === 'field') {
    const queue = settings.FIELD_VALKEY_URL;
    const queueUrl = queue ? new URL(queue) : null;
    if (!queueUrl || queueUrl.hostname !== '127.0.0.1' || queueUrl.port !== '56332')
      throw new Error('Field fault checks require this project\'s local mock Valkey');
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

function run(label, file, args, env = systemEnv) {
  process.stdout.write(`fault suite: ${label}\n`);
  const result = spawnSync(file, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0)
    throw new Error(`${label} failed (${result.signal ?? result.status})`);
}

try {
  localSettings('agent');
  localSettings('field');
  await Promise.all([
    ready('http://127.0.0.1:4311/health/ready', 'agent'),
    ready('http://127.0.0.1:4321/health/ready', 'field'),
    ready('http://127.0.0.1:3001/workspace'),
    ready('http://127.0.0.1:3002/workspace'),
  ]);
  run('public OpenAPI contracts', process.execPath, ['--test',
    'tools/test/agent-integrator-contract.test.mjs',
    'tools/test/field-integrator-contract.test.mjs']);
  for (const [product, files] of [
    ['agent', ['field-actions.db.test.ts', 'field-connection.db.test.ts', 'integrator.db.test.ts']],
    ['field', ['ap-connection.db.test.ts', 'integrator.db.test.ts']],
  ]) {
    run(`${product} provider/consumer fault assertions`, process.execPath,
      ['tools/run-db-suite.mjs', product, ...files.map(name => `test/${name}`)]);
  }
  run('two-product HTTP and worker delivery', process.execPath,
    ['--test', 'tools/spikes/ap-field-connection-http.test.mjs'],
    { ...systemEnv, FIELD_EVENT_WORKERS_RUNNING: '1' });
  process.stdout.write('fault suite: local mock checks passed; operational fault and release gates remain open\n');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
