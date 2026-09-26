import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from 'pg';

const product = process.argv[2];
if (process.argv.length !== 3 || !['agent','field'].includes(product)) throw new Error('usage: node tools/run-auth-lifecycle-db-tests.mjs agent|field');
const prefix = product === 'agent' ? 'AP' : 'FIELD';
const port = product === 'agent' ? '55431' : '55432';
const username = product === 'agent' ? 'agent_local' : 'field_local';
const root = resolve(import.meta.dirname, '..');
process.loadEnvFile(resolve(root, `infra/${product}/.env`));
const source = new URL(process.env[`${prefix}_DATABASE_URL`] ?? '');
if (source.hostname !== '127.0.0.1' || source.port !== port || source.username !== username
  || source.pathname !== `/fieldai_${product}_mock`) throw new Error('OAuth lifecycle checks require own local mock DB');
const database = `fieldai_${product}_test_` + randomUUID().replaceAll('-', '');
const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect(); let created = false;
try {
  await admin.query(`create database "${database}"`); created = true;
  source.pathname = '/' + database;
  const env = { ...process.env, [`${prefix}_PROFILE`]: 'mock', [`${prefix}_DATABASE_URL`]: source.toString() };
  for (const key of Object.keys(env)) if (key.startsWith(product === 'agent' ? 'FIELD_' : 'AP_') || key.startsWith(`${prefix}_${product === 'agent' ? 'FIELD' : 'AP'}_`)) delete env[key];
  for (const [command, args] of [
    [process.execPath, ['tools/run-migrations.mjs', product]],
    ['pnpm', ['--filter', `@fieldai/${product}-api`, 'exec', 'tsx', '--test', 'test/oauth-lifecycle.db.test.ts']],
  ]) {
    const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.signal || result.status !== 0) throw new Error(`OAuth lifecycle check failed: ${result.signal ?? result.status}`);
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
      if (remaining) throw new Error('own product test database still has active clients');
      await admin.query(`drop database "${database}"`);
    }
  } finally { await admin.end(); }
}
