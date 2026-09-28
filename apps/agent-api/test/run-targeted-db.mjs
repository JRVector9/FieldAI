import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { run, adminOperation, assertSupportedPlatform, createSuiteSignalGuard,
  finishSuite } from '../../../tools/run-db-suite.mjs';

assertSupportedPlatform();
const root = resolve(import.meta.dirname, '../../..');
const tests = process.argv.slice(2);
if (!tests.length || tests.some(test => !/^test\/[\w-]+\.db\.test\.ts$/.test(test)))
  throw new Error('pass AP database test paths');
process.loadEnvFile(resolve(root, 'infra/agent/.env'));
const source = new URL(process.env.AP_DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(source.hostname) || source.port !== '55431'
  || source.username !== 'agent_local' || source.pathname !== '/fieldai_agent_mock')
  throw new Error('local AP mock database required');
const database = `fieldai_agent_target_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
const admin = new Client({ connectionString: adminUrl.toString() });
const env = { ...process.env, AP_PROFILE: 'mock' };
for (const key of Object.keys(env)) if (key.startsWith('FIELD_')) delete env[key];
const signals = createSuiteSignalGuard();
let created = false;
let preserveDatabase = false;
let failure;
try {
  await adminOperation(admin, 'admin connection', () => admin.connect());
  signals.check();
  try { await adminOperation(admin, `create database ${database}`, () => admin.query(`create database "${database}"`)); }
  catch (error) { preserveDatabase = true; throw error; }
  created = true;
  signals.check();
  const testUrl = new URL(source);
  testUrl.pathname = `/${database}`;
  env.AP_DATABASE_URL = testUrl.toString();
  await run(process.execPath, ['tools/run-migrations.mjs', 'agent'], env, 120000);
  signals.check();
  await run('pnpm', ['--filter', '@fieldai/agent-api', 'exec', 'tsx', '--test', '--test-timeout=180000', ...tests], env, 240000);
} catch (error) {
  failure = error;
  preserveDatabase ||= error.preserveDatabase === true;
} finally {
  try {
    if (preserveDatabase) {
      process.stderr.write(`preserved uncertain test database ${database}\n`);
    } else if (created) {
      await adminOperation(admin, `drop database ${database}`, () => admin.query(`drop database "${database}" with (force)`));
      process.stdout.write(`removed ${database}\n`);
    }
  } catch (error) {
    process.stderr.write(`DROP outcome uncertain; preserved ${database}\n`);
    failure ??= error;
  }
  try {
    if (!admin.connection?.stream?.destroyed) await adminOperation(admin, 'admin disconnect', () => admin.end());
  } catch (error) { failure ??= error; }
  finishSuite(signals, failure);
}
