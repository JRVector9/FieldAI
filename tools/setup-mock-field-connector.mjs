import { randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

const apPath = resolve('infra/agent/.env');
const fieldPath = resolve('infra/field/.env');
const apEnv = readFileSync(apPath, 'utf8');
const fieldEnv = readFileSync(fieldPath, 'utf8');
for (const path of [apPath, fieldPath])
  if ((statSync(path).mode & 0o077) !== 0) throw new Error(`${path} must be owner-only (chmod 600)`);
const fields = ['AP_FIELD_OAUTH_ISSUER', 'AP_FIELD_CLIENT_ID', 'AP_FIELD_CLIENT_SECRET', 'AP_FIELD_TOKEN_KEY'];
const values = Object.fromEntries(apEnv.split('\n').filter(line => line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const present = fields.filter(field => typeof values[field] === 'string');
if (present.length === fields.length) {
  const fieldValues = Object.fromEntries(fieldEnv.split('\n').filter(line => line.includes('='))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  if (values.AP_FIELD_OAUTH_ISSUER !== 'http://127.0.0.1:4321/api/auth'
    || !fieldValues.FIELD_DATABASE_URL)
    throw new Error('Existing connector is not the expected local mock Field client');
  const db = new Client({ connectionString: fieldValues.FIELD_DATABASE_URL });
  await db.connect();
  try {
    const result = await db.query(`select name,scopes,"redirectUris","applicationType"
      from "oauthClient" where "clientId" = $1`, [values.AP_FIELD_CLIENT_ID]);
    const client = result.rows[0];
    const before = ['openid', 'offline_access', 'field.facts.read'];
    const requests = [...before, 'field.availability.read', 'field.requests.create', 'field.requests.read'];
    const after = [...requests, 'field.customer_access.create'];
    if (!client || client.name !== 'Local AP BFF connector'
      || client.applicationType !== 'native'
      || JSON.stringify(client.redirectUris) !== JSON.stringify(['http://127.0.0.1:4311/v1/connections/field/callback'])
      || (![before, requests, after].some(scopes => JSON.stringify(client.scopes) === JSON.stringify(scopes))))
      throw new Error('Existing mock OAuth client differs from the expected registration');
    if (JSON.stringify(client.scopes) !== JSON.stringify(after)) {
      await db.query(`update "oauthClient" set scopes = $2::jsonb, "updatedAt" = now()
        where "clientId" = $1`, [values.AP_FIELD_CLIENT_ID, JSON.stringify(after)]);
      process.stdout.write('Local AP mock client now permits reservation handoff scope. Existing grants remain unchanged; owners must consent again.\n');
    }
  } finally { await db.end(); }
  if (!/^FIELD_AP_REVERSE_CLIENT_ID=/m.test(fieldEnv))
    appendFileSync(fieldPath, `FIELD_AP_REVERSE_CLIENT_ID=${values.AP_FIELD_CLIENT_ID}\n`, { mode: 0o600 });
  process.stdout.write('AP mock Field connector is configured. Restart both APIs to load current code.\n');
  process.exit(0);
}
if (present.length || /^FIELD_AP_REVERSE_CLIENT_ID=/m.test(fieldEnv))
  throw new Error('AP mock Field connector has partial configuration; resolve it before setup');
const issuer = 'http://127.0.0.1:4321/api/auth';
const redirectUri = 'http://127.0.0.1:4311/v1/connections/field/callback';
const ready = await fetch(`${issuer}/.well-known/oauth-authorization-server`).catch(() => null);
if (!ready?.ok) throw new Error('Start the current Field mock API on 127.0.0.1:4321 before connector setup');
const email = `ap-connector-${randomUUID()}@example.invalid`;
const password = `${randomBytes(32).toString('base64url')}A1!`;
const request = async (path, body, cookie) => fetch(`${issuer}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:4321',
    ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
});
const signup = await request('/sign-up/email', { email, password, name: 'Local AP connector owner' });
if (!signup.ok) throw new Error(`Field mock connector account creation failed (${signup.status})`);
const signin = await request('/sign-in/email', { email, password });
if (!signin.ok) throw new Error(`Field mock connector sign-in failed (${signin.status})`);
const cookie = signin.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const registration = await request('/oauth2/create-client', {
  client_name: 'Local AP BFF connector',
  redirect_uris: [redirectUri],
  application_type: 'native',
  token_endpoint_auth_method: 'client_secret_basic',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  scope: 'openid offline_access field.facts.read field.availability.read field.requests.create field.requests.read field.customer_access.create',
}, cookie);
if (!registration.ok)
  throw new Error(`Field mock OAuth client registration failed (${registration.status}); restart Field API with current code`);
const client = await registration.json();
if (typeof client.client_id !== 'string' || typeof client.client_secret !== 'string')
  throw new Error('Field mock OAuth registration did not return client credentials');
appendFileSync(apPath, `AP_FIELD_OAUTH_ISSUER=${issuer}\nAP_FIELD_CLIENT_ID=${client.client_id}\n`+
  `AP_FIELD_CLIENT_SECRET=${client.client_secret}\nAP_FIELD_TOKEN_KEY=${randomBytes(32).toString('base64url')}\n`,
{ mode: 0o600 });
appendFileSync(fieldPath, `FIELD_AP_REVERSE_CLIENT_ID=${client.client_id}\n`, { mode: 0o600 });
process.stdout.write('AP mock Field connector configured. Restart both APIs to load it. No live provider was contacted.\n');
