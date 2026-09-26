import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from 'pg';

if (process.argv.length !== 2) throw new Error('usage: node tools/run-field-public-write-db-tests.mjs');
const root = resolve(import.meta.dirname, '..');
process.loadEnvFile(resolve(root, 'infra/field/.env'));
const source = new URL(process.env.FIELD_DATABASE_URL ?? '');
if (source.hostname !== '127.0.0.1' || source.port !== '55432' || source.username !== 'field_local'
  || source.pathname !== '/fieldai_field_mock') throw new Error('Field public installation checks require own local mock DB');
const database = 'fieldai_field_test_' + randomUUID().replaceAll('-', '');
const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect(); let created = false;
try {
  await admin.query(`create database "${database}"`); created = true;
  source.pathname = '/' + database;
  const env = { ...process.env, FIELD_PROFILE: 'mock', FIELD_DATABASE_URL: source.toString(),
    FIELD_PUBLIC_WEB_ORIGIN: 'http://localhost:3002' };
  for (const key of Object.keys(env)) if (key.startsWith('AP_') || key.startsWith('FIELD_AP_')) delete env[key];
  for (const [command, args] of [
    [process.execPath, ['tools/run-migrations.mjs', 'field']],
    ['pnpm', ['--filter', '@fieldai/field-api', 'exec', 'tsx', '--test', 'test/ap-public-installation.db.test.ts']],
  ]) {
    const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.signal || result.status !== 0) throw new Error(`Field public installation check failed: ${result.signal ?? result.status}`);
  }
} finally {
  try {
    if (created) {
      let remaining = 0;
      for (let i = 0; i < 50; i++) {
        remaining = (await admin.query('select count(*)::int n from pg_stat_activity where datname=$1', [database])).rows[0].n;
        if (!remaining) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      if (remaining) throw new Error('own Field test database still has active clients');
      await admin.query(`drop database "${database}"`);
    }
  } finally { await admin.end(); }
}
