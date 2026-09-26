import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const runner = new URL('../run-migrations.mjs', import.meta.url).href;
for (const [product, ownKey, peerKey] of [
  ['agent', 'AP_DATABASE_URL', 'FIELD_DATABASE_URL'],
  ['field', 'FIELD_DATABASE_URL', 'AP_DATABASE_URL'],
]) {
  for (const mode of ['peer-only', 'no-explicit-database', 'own-explicit-database']) {
    test(`${product} migration selection: ${mode}`, () => {
      const env = { ...process.env };
      for (const key of Object.keys(env)) if (key.startsWith('AP_') || key.startsWith('FIELD_')) delete env[key];
      if (mode === 'peer-only') {
        env[ownKey] = '';
        env[peerKey] = 'postgresql://synthetic@example.invalid/synthetic_test';
      }
      if (mode === 'own-explicit-database') env[ownKey] = 'postgresql://synthetic@example.invalid/synthetic_test';
      // Stop before any env file or DB connection; importing the actual runner verifies ordering.
      const script = `process.argv[2]=${JSON.stringify(product)};
        process.loadEnvFile=()=>{throw Error('ENV_READ_CANARY')};
        try {await import(${JSON.stringify(runner)});} catch(error){process.stderr.write(error.message);process.exitCode=73;}`;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' });
      assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 73);
      assert.match(result.stderr, mode === 'peer-only' ? /explicit own database URL is required when the peer database is configured/ : /ENV_READ_CANARY/);
      if (mode === 'peer-only') assert.doesNotMatch(result.stderr, /ENV_READ_CANARY/);
    });
  }
}
