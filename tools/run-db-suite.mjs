import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const product = process.argv[2];
const requestedTests = process.argv.slice(3);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  && product !== 'agent' && product !== 'field') {
  process.stderr.write('usage: node tools/run-db-suite.mjs agent|field [test/name.db.test.ts ...]\n');
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

export function selectSuiteTests(available, requested) {
  const names = new Set(available.filter(name => name.endsWith('.db.test.ts')));
  if (!requested.length) return [...names].sort().map(name => `test/${name}`);
  const selected = new Set();
  for (const path of requested) {
    const name = path.startsWith('test/') ? path.slice(5) : '';
    if (!names.has(name) || path !== `test/${name}`) throw new Error(`unknown database test: ${path}`);
    if (selected.has(path)) throw new Error(`duplicate database test: ${path}`);
    selected.add(path);
  }
  return [...selected];
}

export function assertSupportedPlatform(platform = process.platform) {
  if (platform !== 'darwin' && platform !== 'linux')
    throw new Error('DB suite process-group cleanup requires macOS or Linux; Windows is unsupported');
}

export function createSuiteSignalGuard() {
  let signal;
  const onSigint = () => { signal ??= 'SIGINT'; };
  const onSigterm = () => { signal ??= 'SIGTERM'; };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  return {
    check(cause) {
      if (!signal) return;
      const error = new Error(`DB suite interrupted by ${signal}${cause ? ` while handling ${String(cause)}` : ''}`, { cause });
      error.interrupted = true;
      error.exitCode = signal === 'SIGINT' ? 130 : 143;
      throw error;
    },
    close() {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    },
  };
}

export function finishSuite(signals, failure) {
  signals.close();
  signals.check(failure);
  if (failure) throw failure;
}

export async function adminOperation(admin, label, operation, timeoutMs = 30000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          admin.connection?.stream?.destroy();
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export function hasActiveGroup(output, pid) {
  return output.split('\n').some(line => {
    const [group, state] = line.trim().split(/\s+/);
    return Number(group) === pid && state && !state.startsWith('Z');
  });
}

function groupExists(pid) {
  const result = spawnSync('ps', ['-A', '-o', 'pgid=,stat='], { encoding: 'utf8', timeout: 2000 });
  if (result.error || result.status !== 0)
    throw new Error(`cannot inspect child process group ${pid}`, { cause: result.error });
  return hasActiveGroup(result.stdout, pid);
}

async function stopGroup(pid) {
  for (const [signal, waitMs] of [['SIGTERM', 2000], ['SIGKILL', 2000]]) {
    if (!groupExists(pid)) return;
    try { process.kill(-pid, signal); }
    catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    const deadline = Date.now() + waitMs;
    while (groupExists(pid) && Date.now() < deadline)
      await new Promise(resolveWait => setTimeout(resolveWait, 25));
  }
  if (groupExists(pid)) throw new Error(`child process group ${pid} did not terminate; preserving test database`);
}

export async function run(command, args, env, timeout) {
  const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', detached: true });
  let timedOut = false;
  let termination;
  let interruptSignal;
  let interruption;
  const completed = new Promise((resolveResult, rejectResult) => {
    child.once('error', rejectResult);
    child.once('close', (status, signal) => resolveResult({ status, signal }));
  });
  let timer;
  const timed = new Promise((resolveResult, rejectResult) => {
    timer = setTimeout(() => {
      timedOut = true;
      termination = stopGroup(child.pid);
      termination.then(() => resolveResult({ timedOut: true }), rejectResult);
    }, timeout);
  });
  let onSigint;
  let onSigterm;
  const interrupted = new Promise((resolveResult, rejectResult) => {
    const onInterrupt = signal => {
      if (interruption) return;
      interruptSignal = signal;
      interruption = stopGroup(child.pid);
      interruption.then(() => resolveResult({ interrupted: true }), rejectResult);
    };
    onSigint = () => onInterrupt('SIGINT');
    onSigterm = () => onInterrupt('SIGTERM');
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
  });
  let result;
  try {
    try { result = await Promise.race([completed, timed, interrupted]); }
    catch (error) {
      try { if (child.pid && groupExists(child.pid)) error.preserveDatabase = true; }
      catch { error.preserveDatabase = true; }
      throw error;
    }
    finally { clearTimeout(timer); }
    try {
      if (termination) await termination;
      if (interruption) await interruption;
      else if (groupExists(child.pid)) {
        await stopGroup(child.pid);
        throw new Error(`${command} left child processes running`);
      }
    } catch (error) {
      try { if (groupExists(child.pid)) error.preserveDatabase = true; }
      catch { error.preserveDatabase = true; }
      throw error;
    }
    if (interruptSignal || result.interrupted) {
      const error = new Error(`${command} interrupted by ${interruptSignal}`);
      error.interrupted = true;
      error.exitCode = interruptSignal === 'SIGINT' ? 130 : 143;
      throw error;
    }
    if (timedOut || result.timedOut) throw new Error(`${command} ${args.join(' ')} timed out after ${timeout}ms`);
    if (result.signal) throw new Error(`${command} terminated by ${result.signal}`);
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}

async function runSuite(test, env, signals) {
  signals.check();
  await run(process.execPath, [resolve(root, 'tools/run-migrations.mjs'), product], env, 120000);
  signals.check();
  await run('pnpm', ['--filter', `@fieldai/${product}-api`, 'exec', 'tsx', '--test', '--test-timeout=180000', '--test-force-exit', test], env, 240000);
}

async function runIsolatedSuite() {
  assertSupportedPlatform();
  const apiDir = resolve(root, `apps/${product}-api`);
  const tests = selectSuiteTests(readdirSync(resolve(apiDir, 'test')), requestedTests);
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
  const admin = new Client({
    connectionString: adminUrl.toString(),
    connectionTimeoutMillis: 30000,
    statement_timeout: 30000,
  });
  const signals = createSuiteSignalGuard();
  let connected = false;
  let failure;
  const failures = [];
  const prefix = product === 'agent' ? 'AP' : 'FIELD';
  try {
    await adminOperation(admin, 'admin connection', () => admin.connect());
    connected = true;
    signals.check();
    process.stdout.write(`${product}: running ${tests.length} isolated database test files\n`);
    for (const test of tests) {
      signals.check();
      const database = `fieldai_${product}_test_${randomUUID().replaceAll('-', '')}`;
      const journalRoot = mkdtempSync(resolve(tmpdir(), `${product}-suite-journals-`));
      let created = false;
      let preserveResources = false;
      try {
        const childEnv = { ...env };
        for (const kind of ['REVOCATION', 'RETENTION']) {
          const directory = resolve(journalRoot, kind.toLowerCase());
          mkdirSync(directory);
          if (kind === 'RETENTION') mkdirSync(resolve(directory, 'account-deletion'), { mode: 0o700 });
          childEnv[`${prefix}_${kind}_JOURNAL_DIRECTORY`] = directory;
          childEnv[`${prefix}_${kind}_JOURNAL_SECRET`] = `synthetic-${randomUUID()}-${randomUUID()}`;
        }
        try { await adminOperation(admin, `create database ${database}`, () => admin.query(`create database "${database}"`)); }
        catch (error) {
          preserveResources = true; // A lost response cannot prove whether CREATE committed.
          admin.connection.stream.destroy();
          throw error;
        }
        created = true;
        signals.check();
        const testUrl = new URL(source);
        testUrl.pathname = `/${database}`;
        childEnv[settings.key] = testUrl.toString();
        process.stdout.write(`${product}: ${test} in isolated database ${database}\n`);
        try { await runSuite(test, childEnv, signals); }
        catch (error) {
          preserveResources = error.preserveDatabase === true;
          if (preserveResources || error.interrupted) throw error;
          failures.push(test);
          process.stderr.write(`${product}: ${test} failed: ${String(error)}\n`);
        }
      } finally {
        if (preserveResources) {
          process.stderr.write(`${product}: database state uncertain; preserved ${database} and ${journalRoot} for safe recovery\n`);
        } else {
          try {
            if (created) {
              try { await adminOperation(admin, `drop database ${database}`, () => admin.query(`drop database "${database}" with (force)`)); }
              catch (error) {
                process.stderr.write(`${product}: DROP outcome uncertain; preserved ${database} and ${journalRoot} for safe recovery\n`);
                admin.connection.stream.destroy();
                throw error;
              }
              process.stdout.write(`${product}: removed test database ${database}\n`);
            }
          } finally {
            if (admin.connection.stream.destroyed) {
              process.stderr.write(`${product}: preserved ${journalRoot} after admin connection loss\n`);
            } else rmSync(journalRoot, { recursive: true, force: true });
          }
        }
      }
      signals.check();
    }
  } catch (error) {
    failure = error;
  } finally {
    try { if (connected) await adminOperation(admin, 'admin disconnect', () => admin.end()); }
    catch (error) { failure ??= error; }
  }
  finishSuite(signals, failure);
  if (failures.length) throw new Error(`${product}: ${failures.length}/${tests.length} database test files failed: ${failures.join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runIsolatedSuite();
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = error.exitCode ?? 1;
  }
}
