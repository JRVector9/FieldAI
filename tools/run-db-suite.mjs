import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const product = process.argv[2];
if (product !== 'agent' && product !== 'field') {
  process.stderr.write('usage: node tools/run-db-suite.mjs agent|field\n');
  process.exit(2);
}

const apiDir = resolve(root, `apps/${product}-api`);
const tests = readdirSync(resolve(apiDir, 'test'))
  .filter(name => name.endsWith('.db.test.ts')).sort().map(name => `test/${name}`);
if (!tests.length) {
  process.stderr.write(`${product}: no database tests found\n`);
  process.exit(2);
}

const env = { ...process.env };
const otherPrefix = product === 'agent' ? 'FIELD_' : 'AP_';
for (const key of Object.keys(env)) if (key.startsWith(otherPrefix)) delete env[key];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command} terminated by ${result.signal}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
}

function runSuite() {
  run(process.execPath, [resolve(root, 'tools/run-migrations.mjs'), product]);
  process.stdout.write(`${product}: running ${tests.length} database test files\n`);
  run('pnpm', ['--filter', `@fieldai/${product}-api`, 'exec', 'tsx', '--test', ...tests]);
}

async function runIsolatedSuite() {
  process.loadEnvFile(resolve(root, `infra/${product}/.env`));
  const settings = product === 'agent'
    ? { key: 'AP_DATABASE_URL', port: '55431', user: 'agent_local' }
    : { key: 'FIELD_DATABASE_URL', port: '55432', user: 'field_local' };
  const source = new URL(process.env[settings.key] ?? '');
  if (!['127.0.0.1', 'localhost'].includes(source.hostname)
    || source.port !== settings.port || source.username !== settings.user
    || source.pathname !== `/fieldai_${product}_mock`)
    throw new Error(`${product} DB suite requires its local mock PostgreSQL database`);
  const database = `fieldai_${product}_test_${randomUUID().replaceAll('-', '')}`;
  const adminUrl = new URL(source);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  let created = false;
  const revocationRoot = mkdtempSync(resolve(tmpdir(), `${product}-suite-revocations-`));
  if (revocationRoot) {
    env[`${product === 'agent' ? 'AP' : 'FIELD'}_REVOCATION_JOURNAL_DIRECTORY`] = revocationRoot;
    env[`${product === 'agent' ? 'AP' : 'FIELD'}_REVOCATION_JOURNAL_SECRET`] = `synthetic-${randomUUID()}-${randomUUID()}`;
  }
  try {
    await admin.query(`create database "${database}"`);
    created = true;
    source.pathname = `/${database}`;
    env[settings.key] = source.toString();
    process.stdout.write(`${product}: isolated test database ${database}\n`);
    runSuite();
  } finally {
    if (revocationRoot) rmSync(revocationRoot, { recursive: true, force: true });
    try {
      if (created) {
        await admin.query(`drop database "${database}" with (force)`);
        process.stdout.write(`${product}: removed test database ${database}\n`);
      }
    } finally { await admin.end(); }
  }
}

try {
  await runIsolatedSuite();
} catch (error) {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
}
