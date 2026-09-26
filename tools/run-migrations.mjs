import { resolve } from 'node:path';
import { runner } from 'node-pg-migrate';

const product = process.argv[2];
if (product !== 'agent' && product !== 'field') throw new Error('usage: node tools/run-migrations.mjs agent|field');
process.loadEnvFile(resolve(`infra/${product}/.env`));
const databaseUrl = process.env[product === 'agent' ? 'AP_DATABASE_URL' : 'FIELD_DATABASE_URL'];
if (!databaseUrl) throw new Error(`${product} database URL is required`);
await runner({
  databaseUrl,
  dir: resolve(`apps/${product}-api/migrations`),
  direction: 'up',
  migrationsTable: 'pgmigrations',
  log: () => undefined,
});
process.stdout.write(`${product} migrations applied\n`);
