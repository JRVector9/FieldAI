import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ports = {
  agent: [{ name: 'AP API', port: 4311 }, { name: 'AP web', port: 3001 }],
  field: [{ name: 'Field API', port: 4321 }, { name: 'Field web', port: 3002 }],
};
const baseEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'USER',
  'SHELL', 'TERM', 'CI'].filter(key => process.env[key] !== undefined)
  .map(key => [key, process.env[key]]));
const running = child => child.exitCode === null && child.signalCode === null;

export async function assertPortsFree(services) {
  for (const { name, port } of services) {
    const socket = createServer();
    try {
      await new Promise((resolveListen, rejectListen) => {
        socket.once('error', rejectListen);
        socket.listen(port, '127.0.0.1', resolveListen);
      });
    } catch (error) {
      if (error?.code === 'EADDRINUSE')
        throw new Error(`${name} port ${port} is already in use; stop the existing service yourself before starting mock:run`);
      throw error;
    } finally {
      if (socket.listening) {
        socket.close();
        await new Promise(resolveClose => socket.once('close', resolveClose));
      }
    }
  }
}

async function command(file, args) {
  const child = spawn(file, args, { cwd: root, env: baseEnv, stdio: 'inherit' });
  const code = await new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', resolveExit);
  });
  if (code !== 0) throw new Error(`${file} ${args.join(' ')} exited ${code}`);
}

function configured(product, names) {
  const check = `process.exit(${JSON.stringify(names)}.every(key => process.env[key]) ? 0 : 1)`;
  const result = spawnSync(process.execPath,
    [`--env-file=infra/${product}/.env`, '-e', check],
    { cwd: root, env: baseEnv, stdio: 'ignore' });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1)
    throw new Error(`${product} worker configuration could not be checked`);
  return result.status === 0;
}

function start(name, file, args, env, managed, onUnexpectedExit, cwd = root, critical = true) {
  const child = spawn(file, args, {
    cwd, env: { ...baseEnv, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  managed.push({ name, child, critical });
  child.stdout.on('data', chunk => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`[${name}] ${chunk}`));
  let reported = false;
  const report = error => {
    if (reported) return;
    reported = true;
    onUnexpectedExit(error);
  };
  child.once('error', error => report(new Error(`${name} could not start: ${error.message}`)));
  child.once('exit', (code, signal) => report(new Error(`${name} exited (${code ?? signal})`)));
  return child;
}

async function ready(url, product, managed) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (managed.some(({ child, critical }) => critical && !running(child)))
      throw new Error(`${product} process exited before ${url} became ready`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) {
        if (url.endsWith('/health/ready')) {
          const body = await response.json();
          if (body.product !== product || body.status !== 'ready')
            throw new Error(`${url} belongs to a different service`);
        }
        return;
      }
    } catch { /* Wait for this process to bind. */ }
    await delay(200);
  }
  throw new Error(`${url} did not become ready within 20 seconds`);
}

async function stop(managed) {
  for (const { child } of managed.toReversed()) {
    if (!running(child) || !child.pid) continue;
    child.kill('SIGTERM');
  }
  for (let attempt = 0; attempt < 50 && managed.some(({ child }) => running(child)); attempt += 1)
    await delay(100);
  for (const { child } of managed) {
    if (!running(child) || !child.pid) continue;
    child.kill('SIGKILL');
  }
}

async function prepareMockConnectors() {
  const temporary = [];
  let expectedStop = false;
  let failed;
  try {
    for (const [product, prefix, port] of [
      ['agent', 'AP', 4311], ['field', 'FIELD', 4321],
    ]) {
      start(`${prefix} connector setup API`, process.execPath,
        [`--env-file=infra/${product}/.env`, `apps/${product}-api/dist/server.js`],
        { [`${prefix}_PROFILE`]: 'mock' }, temporary,
        error => { if (!expectedStop) failed = error; });
      await ready(`http://127.0.0.1:${port}/health/ready`, product, temporary);
    }
    if (failed) throw failed;
    await command(process.execPath, ['tools/setup-mock-ap-connector.mjs']);
    if (failed) throw failed;
    await command(process.execPath, ['tools/setup-mock-field-connector.mjs']);
    if (failed) throw failed;
  } finally {
    expectedStop = true;
    await stop(temporary);
  }
}

async function main() {
  const mode = process.argv[2] ?? 'suite';
  if (!['agent', 'field', 'suite'].includes(mode))
    throw new Error('usage: node tools/mock-run.mjs [agent|field|suite]');
  if (process.env.NODE_ENV === 'production')
    throw new Error('mock:run cannot start under NODE_ENV=production');
  const products = mode === 'suite' ? ['agent', 'field'] : [mode];
  await assertPortsFree(products.flatMap(product => ports[product]));
  await command(process.execPath, ['tools/setup-mock-env.mjs', ...products]);
  for (const product of products) {
    await command('docker', ['compose', '--project-name', `fieldai-${product}-mock`,
      '--env-file', `infra/${product}/.env`, '-f', `infra/${product}/compose.mock.yaml`,
      'up', '-d', '--wait']);
    await command(process.execPath, ['tools/run-migrations.mjs', product]);
    await command('pnpm', [`build:${product}`]);
    await command('pnpm', [`build:web:${product}`]);
  }
  if (mode === 'suite') await prepareMockConnectors();

  const managed = [];
  let shuttingDown = false;
  let settle;
  const lifetime = new Promise(resolveLifetime => { settle = resolveLifetime; });
  const shutdown = async error => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
    await stop(managed);
    settle();
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });

  try {
    for (const product of products) {
      if (shuttingDown) break;
      const isAgent = product === 'agent';
      const prefix = isAgent ? 'AP' : 'FIELD';
      const apiPort = isAgent ? 4311 : 4321;
      const webPort = isAgent ? 3001 : 3002;
      const environment = { [`${prefix}_PROFILE`]: 'mock' };
      start(`${prefix} API`, process.execPath,
        [`--env-file=infra/${product}/.env`, `apps/${product}-api/dist/server.js`],
        environment, managed, error => { void shutdown(error); });
      await ready(`http://127.0.0.1:${apiPort}/health/ready`, product, managed);
      start(`${prefix} web`, process.execPath,
        ['node_modules/next/dist/bin/next', 'start', '-p', String(webPort)],
        { APP_PROFILE: 'mock' }, managed, error => { void shutdown(error); },
        resolve(root, `apps/${product}-web`));
      await ready(`http://127.0.0.1:${webPort}/`, product, managed);
      if (isAgent) {
        start('AP retention worker', process.execPath,
          ['--env-file=infra/agent/.env', 'apps/agent-api/dist/retention-purge-worker.js'],
          environment, managed, error => {
            process.stderr.write(`${error.message}; AP core remains ready, retention processing is unavailable\n`);
          }, root, false);
        start('AP event worker', process.execPath,
          ['--env-file=infra/agent/.env', 'apps/agent-api/dist/field-event-worker.js'],
          environment, managed, error => {
            process.stderr.write(`${error.message}; AP core remains ready, event processing is unavailable\n`);
          }, root, false);
      } else {
        start('Field retention worker', process.execPath,
          ['--env-file=infra/field/.env', 'apps/field-api/dist/retention-purge-worker.js'],
          environment, managed, error => {
            process.stderr.write(`${error.message}; Field core remains ready, retention processing is unavailable\n`);
          }, root, false);
        if (configured('field', ['FIELD_AP_OAUTH_ISSUER', 'FIELD_AP_CLIENT_ID',
          'FIELD_AP_CLIENT_SECRET', 'FIELD_AP_TOKEN_KEY']))
          start('Field AP event worker', process.execPath,
            ['--env-file=infra/field/.env', 'apps/field-api/dist/ap-event-worker.js'],
            environment, managed, error => {
              process.stderr.write(`${error.message}; Field core remains ready, connected event delivery is unavailable\n`);
            }, root, false);
        else process.stdout.write('Field AP event worker: blocked_integration (connector not configured)\n');
        if (configured('field', ['FIELD_OPENAI_API_KEY', 'FIELD_OPENAI_MODEL']))
          start('Field site AI worker', process.execPath,
            ['--env-file=infra/field/.env', 'apps/field-api/dist/worker.js'],
            environment, managed, error => {
              process.stderr.write(`${error.message}; Field core remains ready, site AI is unavailable\n`);
            }, root, false);
        else process.stdout.write('Field site AI worker: blocked_integration (model not configured)\n');
      }
    }
    if (shuttingDown) { await lifetime; return; }
    const locations = products.map(product => product === 'agent'
      ? 'AP: http://localhost:3001/workspace'
      : 'Field: http://127.0.0.1:3002/workspace').join(', ');
    process.stdout.write(`Mock services ready. ${locations}. Press Ctrl+C to stop managed processes.\n`);
    await lifetime;
  } catch (error) {
    await shutdown(error);
    await lifetime;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
