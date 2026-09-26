import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

// A09 focused AP native check only; never default an unknown product to AP.
if (process.argv.length !== 2) throw new Error('usage: node tools/run-public-write-db-tests.mjs');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(resolve(root, 'infra/agent/.env'));
const source = new URL(process.env.AP_DATABASE_URL ?? '');
if (source.hostname !== '127.0.0.1' || source.port !== '55431' || source.username !== 'agent_local'
  || source.pathname !== '/fieldai_agent_mock') throw new Error('public write tests require own local AP mock PostgreSQL only');
const database = 'fieldai_agent_test_' + randomUUID().replaceAll('-', '');
const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
const journal = mkdtempSync(resolve(tmpdir(), 'ap-public-write-revocations-'));
let created = false;
try {
  await admin.query(`create database "${database}"`); created = true;
  source.pathname = '/' + database;
  const env = { ...process.env, AP_PROFILE: 'mock', AP_DATABASE_URL: source.toString(),
    AP_REVOCATION_JOURNAL_DIRECTORY: journal, AP_REVOCATION_JOURNAL_SECRET: 'synthetic-' + randomUUID() };
  for (const key of Object.keys(env)) if (key.startsWith('FIELD_') || key.startsWith('AP_FIELD_')) delete env[key];
  for (const [command, args] of [
    [process.execPath, ['tools/run-migrations.mjs', 'agent']],
    ['pnpm', ['--filter', '@fieldai/agent-api', 'exec', 'tsx', '--test', 'test/integrator-public-write.db.test.ts']],
  ]) {
    const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.signal || result.status !== 0) throw new Error(`public write focused check failed: ${result.signal ?? result.status}`);
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
      if (remaining) throw new Error('own public write test database has live clients after child exit');
      await admin.query(`drop database "${database}"`);
    }
  } finally {
    await admin.end();
    rmSync(journal, { recursive: true, force: true });
  }
}
