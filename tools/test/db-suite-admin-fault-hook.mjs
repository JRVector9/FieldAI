import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const runner = resolve(dirname(fileURLToPath(import.meta.url)), '../run-db-suite.mjs');
if (process.argv[1] && resolve(process.argv[1]) === runner) {
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, milliseconds, ...args) =>
    originalTimeout(callback, milliseconds === 30000 ? 3000 : milliseconds, ...args);
  const { Client } = createRequire(runner)('pg');
  const originalQuery = Client.prototype.query;
  Client.prototype.query = async function faultedAdminQuery(sql, ...args) {
    const match = typeof sql === 'string'
      && sql.match(/^(create|drop) database "(fieldai_field_test_[0-9a-f]{32})"/);
    if (match && match[1] === process.env.DB_SUITE_ADMIN_FAULT_PHASE) {
      process.stdout.write(`DB_SUITE_ADMIN_FAULT_TARGET:${match[2]}\n`);
      const result = await originalQuery.call(this, sql, ...args);
      process.stdout.write(`DB_SUITE_ADMIN_FAULT_COMMITTED:${match[2]}\n`);
      await new Promise(resolveWait => originalTimeout(resolveWait, 4500));
      return result;
    }
    return originalQuery.call(this, sql, ...args);
  };
}
