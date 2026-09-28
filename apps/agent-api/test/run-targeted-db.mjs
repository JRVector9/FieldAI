import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from 'pg';

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
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
};
let created = false;
try {
  await admin.connect();
  await admin.query(`create database "${database}"`);
  created = true;
  const testUrl = new URL(source);
  testUrl.pathname = `/${database}`;
  env.AP_DATABASE_URL = testUrl.toString();
  run(process.execPath, ['tools/run-migrations.mjs', 'agent']);
  run('pnpm', ['--filter', '@fieldai/agent-api', 'exec', 'tsx', '--test', '--test-timeout=180000', ...tests]);
} finally {
  if (created) {
    await admin.query(`drop database "${database}" with (force)`);
    process.stdout.write(`removed ${database}\n`);
  }
  await admin.end();
}
