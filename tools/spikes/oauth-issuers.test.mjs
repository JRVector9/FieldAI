import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';

process.loadEnvFile(resolve('infra/agent/.env'));
process.loadEnvFile(resolve('infra/field/.env'));

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  server.close();
  await new Promise((done) => server.once('close', done));
  return port;
}

const configurations = await Promise.all([
  { product: 'agent', prefix: 'AP', scope: 'ap.agent.read' },
  { product: 'field', prefix: 'FIELD', scope: 'field.facts.read' },
].map(async (item) => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const databaseUrl = process.env[`${item.prefix}_DATABASE_URL`];
  const secret = process.env[`${item.prefix}_AUTH_SECRET`];
  assert.ok(databaseUrl && secret);
  return { ...item, port, base, databaseUrl, secret, resource: `${base}/integrations/v1` };
}));

const servers = [];
const pools = configurations.map((config) => new Pool({ connectionString: config.databaseUrl }));
after(async () => {
  await Promise.all(servers.map(async ({ child, closed }) => {
    child.kill('SIGTERM');
    await closed;
  }));
  await Promise.all(pools.map((pool) => pool.end()));
});

async function start(config) {
  const child = spawn(process.execPath, [`apps/${config.product}-api/dist/server.js`], {
    cwd: resolve('.'),
    env: {
      PATH: process.env.PATH,
      [`${config.prefix}_DATABASE_URL`]: config.databaseUrl,
      [`${config.prefix}_AUTH_SECRET`]: config.secret,
      [`${config.prefix}_AUTH_BASE_URL`]: config.base,
      [`${config.prefix}_PORT`]: String(config.port),
      ...(config.product === 'agent' ? { AP_PUBLIC_WEB_ORIGIN: config.base }
        : { FIELD_PUBLIC_WEB_ORIGIN: config.base }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const closed = new Promise((done) => child.once('close', done));
  servers.push({ child, closed });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`${config.product} failed to start: ${stderr}`);
    try {
      const response = await fetch(`${config.base}/health/ready`);
      if (response.status === 200) return;
    } catch { /* wait for server */ }
    await delay(50);
  }
  throw new Error(`${config.product} did not become ready: ${stderr}`);
}

async function postJson(config, path, body, cookie) {
  return fetch(`${config.base}/api/auth${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/json',
      origin: config.base,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function authorization(config, clientId, challenge, state) {
  const url = new URL(`${config.base}/api/auth/oauth2/authorize`);
  for (const [key, value] of Object.entries({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: 'http://127.0.0.1:4399/callback',
    scope: `openid ${config.scope}`,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: config.resource,
  })) url.searchParams.set(key, value);
  return url;
}

async function form(config, path, values, basic) {
  return fetch(`${config.base}/api/auth${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: basic,
    },
    body: new URLSearchParams(values),
  });
}

async function issue(config, pool) {
  const email = `isolation-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const signup = await postJson(config, '/sign-up/email', { email, password, name: 'Synthetic owner' });
  assert.equal(signup.status, 200);
  await pool.query('UPDATE "user" SET "emailVerified" = true WHERE email = $1', [email]);
  const signin = await postJson(config, '/sign-in/email', { email, password });
  assert.equal(signin.status, 200);
  const cookie = signin.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.match(cookie, /session_token/);
  const registration = await postJson(config, '/oauth2/create-client', {
    client_name: `Synthetic ${config.product} client`,
    redirect_uris: ['http://127.0.0.1:4399/callback'],
    application_type: 'native',
    token_endpoint_auth_method: 'client_secret_basic',
    grant_types: ['authorization_code'],
    response_types: ['code'],
    scope: `openid ${config.scope}`,
  }, cookie);
  assert.equal(registration.status, 201);
  const client = await registration.json();
  assert.ok(client.client_id && client.client_secret);
  let organizationId = null;
  if (config.product === 'agent' || config.product === 'field') {
    const current = await pool.query(
      `select u.id as user_id, s.id as session_id from "user" u
       join "session" s on s."userId" = u.id where u.email = $1 order by s."createdAt" desc limit 1`, [email]);
    assert.ok(current.rows[0]);
    organizationId = randomUUID();
    const schema = config.product === 'agent' ? 'ap' : 'field';
    await pool.query(`insert into ${schema}.organizations(id, owner_user_id, name) values ($1,$2,$3)`,
      [organizationId, current.rows[0].user_id, `OAuth issuer synthetic ${schema} organization`]);
    await pool.query(`insert into ${schema}.memberships(organization_id,user_id,role) values ($1,$2,'owner')`,
      [organizationId, current.rows[0].user_id]);
    if (schema === 'ap') await pool.query(
      `insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,
         agent_id,requested_scopes,selection_expires_at)
       values ($1,$2,$3,$4,$5,$6,$7::text[],now() + interval '5 minutes')`,
      [randomUUID(), current.rows[0].session_id, current.rows[0].user_id, client.client_id,
        organizationId, randomUUID(), [config.scope]]);
    else await pool.query(
      `insert into field.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,
         requested_scopes,selection_expires_at)
       values ($1,$2,$3,$4,$5,$6::text[],now() + interval '5 minutes')`,
      [randomUUID(), current.rows[0].session_id, current.rows[0].user_id, client.client_id,
        organizationId, [config.scope]]);
  }
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const authorizationResponse = await fetch(authorization(config, client.client_id, challenge, randomUUID()), {
    redirect: 'manual', headers: { cookie },
  });
  assert.equal(authorizationResponse.status, 200);
  const authorizationResult = await authorizationResponse.json();
  assert.equal(authorizationResult.redirect, true);
  const consentLocation = new URL(authorizationResult.url, config.base);
  assert.match(consentLocation.pathname, /consent/);
  const consentCookie = [cookie, ...authorizationResponse.headers.getSetCookie().map((value) => value.split(';')[0])].join('; ');
  const consent = await postJson(config, '/oauth2/consent', {
    accept: true,
    oauth_query: consentLocation.searchParams.toString(),
  }, consentCookie);
  assert.equal(consent.status, 200);
  const callback = new URL((await consent.json()).url);
  assert.equal(callback.searchParams.get('iss'), `${config.base}/api/auth`);
  const code = callback.searchParams.get('code');
  assert.ok(code);
  const basic = `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64')}`;
  const token = await form(config, '/oauth2/token', {
    grant_type: 'authorization_code',
    client_id: client.client_id,
    redirect_uri: 'http://127.0.0.1:4399/callback',
    code,
    code_verifier: verifier,
  }, basic);
  assert.equal(token.status, 200);
  const accessToken = (await token.json()).access_token;
  assert.ok(accessToken);
  return { email, organizationId, clientId: client.client_id, basic, accessToken };
}

async function introspect(config, credential, accessToken) {
  const response = await form(config, '/oauth2/introspect', {
    token: accessToken,
    client_id: credential.clientId,
  }, credential.basic);
  assert.equal(response.status, 200);
  return response.json();
}

test('AP and Field use separate issuers and reject each other\'s opaque access tokens', async () => {
  await Promise.all(configurations.map((config) => start(config)));
  const issued = [];
  try {
    for (const [index, config] of configurations.entries()) {
      issued.push(await issue(config, pools[index]));
    }
    const [ap, field] = configurations;
    const [apCredential, fieldCredential] = issued;
    const apOwn = await introspect(ap, apCredential, apCredential.accessToken);
    const fieldOwn = await introspect(field, fieldCredential, fieldCredential.accessToken);
    assert.equal(apOwn.active, true);
    assert.equal(fieldOwn.active, true);
    assert.ok(apOwn.aud === ap.resource || (Array.isArray(apOwn.aud) && apOwn.aud.includes(ap.resource)));
    assert.ok(fieldOwn.aud === field.resource || (Array.isArray(fieldOwn.aud) && fieldOwn.aud.includes(field.resource)));
    assert.equal((await introspect(ap, apCredential, fieldCredential.accessToken)).active, false);
    assert.equal((await introspect(field, fieldCredential, apCredential.accessToken)).active, false);
    assert.equal((await fetch(`${field.base}/integrations/v1/me`, {
      headers: { authorization: `Bearer ${apCredential.accessToken}` },
    })).status, 401);
    assert.equal((await fetch(`${ap.base}/integrations/v1/me`, {
      headers: { authorization: `Bearer ${fieldCredential.accessToken}` },
    })).status, 401);
  } finally {
    await Promise.all(issued.map(async (credential, index) => {
      if (credential.organizationId) await pools[index].query(
        `delete from ${configurations[index].product === 'agent' ? 'ap' : 'field'}.organizations where id = $1`,
        [credential.organizationId]);
      await pools[index].query('DELETE FROM "user" WHERE email = $1', [credential.email]);
    }));
  }
});
