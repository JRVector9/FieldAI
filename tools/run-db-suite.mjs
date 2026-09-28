import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const product = process.argv[2];
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  && product !== 'agent' && product !== 'field') {
  process.stderr.write('usage: node tools/run-db-suite.mjs agent|field\n');
  process.exit(2);
}

export function createSuiteEnv(product) {
  process.loadEnvFile(resolve(root, `infra/${product}/.env`));
  const env = { ...process.env };
  const otherPrefix = product === 'agent' ? 'FIELD_' : 'AP_';
  for (const key of Object.keys(env)) if (key.startsWith(otherPrefix)) delete env[key];
  env[`${product === 'agent' ? 'AP' : 'FIELD'}_PROFILE`] = 'mock';
  return env;
}

function run(command, args, env, timeout) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', timeout });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command} terminated by ${result.signal}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
}

function runSuite(test, env) {
  run(process.execPath, [resolve(root, 'tools/run-migrations.mjs'), product], env, 120000);
  run('pnpm', ['--filter', `@fieldai/${product}-api`, 'exec', 'tsx', '--test', '--test-timeout=180000', '--test-force-exit', test], env, 240000);
}

async function runIsolatedSuite() {
  const apiDir = resolve(root, `apps/${product}-api`);
  const tests = readdirSync(resolve(apiDir, 'test'))
    .filter(name => name.endsWith('.db.test.ts')).sort().map(name => `test/${name}`);
  if (!tests.length) throw new Error(`${product}: no database tests found`);
  const env = createSuiteEnv(product);
  const settings = product === 'agent'
    ? { key: 'AP_DATABASE_URL', port: '55431', user: 'agent_local' }
    : { key: 'FIELD_DATABASE_URL', port: '55432', user: 'field_local' };
  const source = new URL(env[settings.key] ?? '');
  if (!['127.0.0.1', 'localhost'].includes(source.hostname)
    || source.port !== settings.port || source.username !== settings.user
    || source.pathname !== `/fieldai_${product}_mock`)
    throw new Error(`${product} DB suite requires its local mock PostgreSQL database`);
  const adminUrl = new URL(source);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const failures = [];
  const prefix = product === 'agent' ? 'AP' : 'FIELD';
  try {
    process.stdout.write(`${product}: running ${tests.length} isolated database test files\n`);
    for (const test of tests) {
      const database = `fieldai_${product}_test_${randomUUID().replaceAll('-', '')}`;
      const journalRoot = mkdtempSync(resolve(tmpdir(), `${product}-suite-journals-`));
      let created = false;
      try {
        const childEnv = { ...env };
        for (const kind of ['REVOCATION', 'RETENTION']) {
          const directory = resolve(journalRoot, kind.toLowerCase());
          mkdirSync(directory);
          childEnv[`${prefix}_${kind}_JOURNAL_DIRECTORY`] = directory;
          childEnv[`${prefix}_${kind}_JOURNAL_SECRET`] = `synthetic-${randomUUID()}-${randomUUID()}`;
        }
        await admin.query(`create database "${database}"`);
        created = true;
        const testUrl = new URL(source);
        testUrl.pathname = `/${database}`;
        childEnv[settings.key] = testUrl.toString();
        process.stdout.write(`${product}: ${test} in isolated database ${database}\n`);
        try { runSuite(test, childEnv); }
        catch (error) {
          failures.push(test);
          process.stderr.write(`${product}: ${test} failed: ${String(error)}\n`);
        }
      } finally {
        try {
          if (created) {
            await admin.query(`drop database "${database}" with (force)`);
            process.stdout.write(`${product}: removed test database ${database}\n`);
          }
        } finally { rmSync(journalRoot, { recursive: true, force: true }); }
      }
    }
  } finally {
    await admin.end();
  }
  if (failures.length) throw new Error(`${product}: ${failures.length}/${tests.length} database test files failed: ${failures.join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runIsolatedSuite();
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  }
}
