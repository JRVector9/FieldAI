import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const systemNames = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'USER', 'SHELL', 'TERM', 'CI'];
const systemEnv = Object.fromEntries(systemNames.filter(key => process.env[key] !== undefined)
  .map(key => [key, process.env[key]]));
const settings = {
  agent: { ownPorts: [4311, 3001], apiPort: 4311, webPort: 3001, prefix: 'AP', other: 'field' },
  field: { ownPorts: [4321, 3002], apiPort: 4321, webPort: 3002, prefix: 'FIELD', other: 'agent' },
};

export function oppositePorts(product) {
  if (product === 'agent') return [4321, 3002, 55432, 56332];
  if (product === 'field') return [4311, 3001, 55431];
  throw new Error('product must be agent or field');
}

export function isolatedApiEnvironment(product, source, base = {}) {
  const config = settings[product];
  if (!config) throw new Error('product must be agent or field');
  const required = [`${config.prefix}_DATABASE_URL`, `${config.prefix}_AUTH_SECRET`,
    `${config.prefix}_AUTH_BASE_URL`];
  for (const name of required) if (!source[name]) throw new Error(`${name} is required`);
  const optional = product === 'agent'
    ? ['AP_PUBLIC_WEB_ORIGIN', 'AP_INQUIRY_MEDIA_DIRECTORY']
    : ['FIELD_PUBLIC_WEB_ORIGIN', 'FIELD_VALKEY_URL', 'FIELD_MEDIA_DIRECTORY',
      'FIELD_INQUIRY_MEDIA_DIRECTORY'];
  return { ...base, ...Object.fromEntries([...required, ...optional]
    .filter(name => source[name] !== undefined).map(name => [name, source[name]])),
  [`${config.prefix}_PROFILE`]: 'mock' };
}

function run(file, args, env = systemEnv) {
  const result = spawnSync(file, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0)
    throw new Error(`${file} ${args.join(' ')} failed (${result.signal ?? result.status})`);
}

function output(file, args) {
  const result = spawnSync(file, args, { cwd: root, env: systemEnv, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${file} ${args.join(' ')} failed (${result.status})`);
  return result.stdout.trim();
}

async function portOpen(port) {
  return new Promise(resolvePort => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(400);
    socket.once('connect', () => { socket.destroy(); resolvePort(true); });
    socket.once('error', () => { socket.destroy(); resolvePort(false); });
    socket.once('timeout', () => { socket.destroy(); resolvePort(false); });
  });
}

async function assertOppositeAbsent(product) {
  const other = settings[product].other;
  const containers = output('docker', ['ps', '--filter', `label=com.docker.compose.project=fieldai-${other}-mock`,
    '--format', '{{.ID}}']);
  if (containers) throw new Error(`${other} mock containers are running; stop that product before independence test`);
  for (const port of oppositePorts(product)) {
    if (await portOpen(port)) throw new Error(`${other} endpoint port ${port} is reachable`);
  }
}

function start(name, file, args, cwd, env) {
  const child = spawn(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let failure;
  child.once('error', error => { failure = error; });
  child.stdout.on('data', chunk => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`[${name}] ${chunk}`));
  const exited = new Promise(resolveExit => child.once('close', resolveExit));
  return { name, child, exited, get failure() { return failure; } };
}

async function ready(url, expected, processHandle) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (processHandle.failure) throw processHandle.failure;
    if (processHandle.child.exitCode !== null) throw new Error(`${processHandle.name} exited before ready`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) {
        if (expected) {
          const body = await response.json();
          if (body.product !== expected || body.status !== 'ready') throw new Error('wrong ready service');
        }
        return;
      }
    } catch { /* Startup can take a moment after build. */ }
    await delay(250);
  }
  throw new Error(`${url} did not become ready`);
}

async function stop(handle) {
  if (!handle) return;
  if (handle.child.exitCode !== null) { await handle.exited; return; }
  handle.child.kill('SIGTERM');
  const completed = await Promise.race([handle.exited.then(() => true), delay(5000).then(() => false)]);
  if (!completed) { handle.child.kill('SIGKILL'); await handle.exited; }
}

async function main() {
  const product = process.argv[2];
  const config = settings[product];
  if (!config) throw new Error('usage: node tools/run-independence.mjs agent|field');
  await assertOppositeAbsent(product);
  for (const port of config.ownPorts) if (await portOpen(port))
    throw new Error(`${product} port ${port} is in use; stop the existing app before independence test`);
  const source = parseEnv(readFileSync(resolve(root, `infra/${product}/.env`), 'utf8'));
  const apiEnv = isolatedApiEnvironment(product, source, systemEnv);
  run('docker', ['compose', '--project-name', `fieldai-${product}-mock`, '--env-file',
    `infra/${product}/.env`, '-f', `infra/${product}/compose.mock.yaml`, 'up', '-d', '--wait']);
  run(process.execPath, ['tools/run-migrations.mjs', product]);
  run('pnpm', [`build:${product}`]);
  run('pnpm', [`build:web:${product}`]);
  let api;
  let web;
  const interrupted = signal => {
    void (async () => {
      await stop(web);
      await stop(api);
      process.exit(signal === 'SIGINT' ? 130 : 143);
    })();
  };
  const onInterrupt = () => interrupted('SIGINT');
  const onTerminate = () => interrupted('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  try {
    api = start(`${product} API`, process.execPath,
      [`apps/${product}-api/dist/server.js`], root, apiEnv);
    await ready(`http://127.0.0.1:${config.apiPort}/health/ready`, product, api);
    web = start(`${product} web`, process.execPath,
      ['node_modules/next/dist/bin/next', 'start', '-p', String(config.webPort)],
      resolve(root, `apps/${product}-web`), { ...systemEnv, APP_PROFILE: 'mock' });
    await ready(`http://127.0.0.1:${config.webPort}/workspace`, null, web);
    run(process.execPath, ['tools/spikes/independence-flow.mjs', product], apiEnv);
    run(process.execPath, ['--test', `tools/spikes/${product}-owner-flow-http.test.mjs`]);
    process.stdout.write(`${product} independent owner and guest browser flow passed\n`);
    await assertOppositeAbsent(product);
    process.stdout.write(`${product} independent mock flow passed with opposite service and DB absent\n`);
  } finally {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
    await stop(web);
    await stop(api);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
