import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runner = resolve(root, 'tools/run-db-suite.mjs');
const hook = resolve(root, 'tools/test/db-suite-admin-fault-hook.mjs');
const { Client } = createRequire(runner)('pg');

function localAdminUrl() {
  if (existsSync(resolve(root, 'infra/field/.env')))
    process.loadEnvFile(resolve(root, 'infra/field/.env'));
  const source = new URL(process.env.FIELD_DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(source.hostname)
    || source.port !== '55432' || source.username !== 'field_local'
    || source.pathname !== '/fieldai_field_mock')
    throw new Error('admin integration test requires the local Field mock database URL');
  const adminUrl = new URL(source);
  adminUrl.pathname = '/postgres';
  return adminUrl;
}

async function runFault(phase, signal) {
  const adminUrl = localAdminUrl();
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'db-suite-admin-integration-'));
  let database;
  let output = '';
  let committed = false;
  let timedOut = false;
  try {
    const child = spawn(process.execPath, [runner, 'field'], {
      cwd: root,
      env: {
        ...process.env,
        TMPDIR: tempRoot,
        DB_SUITE_ADMIN_FAULT_PHASE: phase,
        NODE_OPTIONS: `--import=${hook}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let timer;
    let hardTimer;
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      output += chunk.toString();
      database ??= output.match(/DB_SUITE_ADMIN_FAULT_TARGET:(fieldai_field_test_[0-9a-f]{32})/)?.[1];
      if (!committed && output.includes(`DB_SUITE_ADMIN_FAULT_COMMITTED:${database}`)) {
        committed = true;
        child.kill(signal);
      }
    });
    const status = await new Promise((resolveStatus, rejectStatus) => {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        hardTimer = setTimeout(() => {
          child.kill('SIGKILL');
          child.stdout.destroy();
          child.stderr.destroy();
          resolveStatus({ code: null, signal: 'WATCHDOG' });
        }, 3000);
      }, 25000);
      child.once('error', rejectStatus);
      child.once('close', (code, childSignal) => resolveStatus({ code, signal: childSignal }));
    }).finally(() => { clearTimeout(timer); clearTimeout(hardTimer); });
    if (timedOut) throw new Error(`DB suite admin ${phase} child exceeded 25s; preserved resources: ${database ?? 'unknown DB'}, ${tempRoot}`);
    assert.equal(committed, true, output);
    assert.equal(status.code, signal === 'SIGINT' ? 130 : 143, output);
    assert.match(output, new RegExp(`DB suite interrupted by ${signal} while handling Error: ${phase} database .* timed out`));
    assert.equal((output.match(/ in isolated database /g) ?? []).length, phase === 'create' ? 0 : 1, output);
    const journal = output.match(/preserved fieldai_field_test_[0-9a-f]{32} and (\/[^\s]+) for safe recovery/)?.[1];
    assert.ok(journal, output);
    assert.ok(journal.startsWith(`${tempRoot}/`), journal);
    assert.equal(existsSync(journal), true);
    const admin = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 3000 });
    await admin.connect();
    try {
      const result = await admin.query('select 1 from pg_database where datname = $1', [database]);
      assert.equal(result.rowCount, phase === 'create' ? 1 : 0);
    } finally { await admin.end(); }
  } finally {
    if (timedOut) {
      process.stderr.write(`preserved timed-out admin integration resources: ${database ?? 'unknown DB'}, ${tempRoot}\n`);
    } else {
      try {
        if (database) {
          const admin = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 3000 });
          await admin.connect();
          try { await admin.query(`drop database if exists "${database}" with (force)`); }
          finally { await admin.end(); }
        }
      } finally { rmSync(tempRoot, { recursive: true, force: true }); }
    }
  }
}

const enabled = process.env.DB_SUITE_ADMIN_INTEGRATION === '1' && process.platform !== 'win32';
for (const [phase, signal] of [['create', 'SIGTERM'], ['drop', 'SIGINT']]) {
  test(`actual admin ${phase} response fault preserves signal exit, DB, and journal`,
    { skip: enabled ? false : 'requires DB_SUITE_ADMIN_INTEGRATION=1 and POSIX local Field PostgreSQL' },
    () => runFault(phase, signal));
}
