import { randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

const agentEnvPath = resolve('infra/agent/.env');
const fieldEnvPath = resolve('infra/field/.env');
process.loadEnvFile(agentEnvPath);
let fieldEnv = readFileSync(fieldEnvPath, 'utf8');
if ((statSync(fieldEnvPath).mode & 0o077) !== 0) throw new Error('infra/field/.env must be owner-only (chmod 600)');
// Browser cookies are scoped to host, not port. Keep mock Field on 127.0.0.1
// while AP uses localhost so both independent sessions survive the OAuth trip.
const fieldWebOrigin = 'FIELD_PUBLIC_WEB_ORIGIN=http://127.0.0.1:3002';
if (/^FIELD_PUBLIC_WEB_ORIGIN=http:\/\/localhost:3002$/m.test(fieldEnv)) {
  fieldEnv = fieldEnv.replace(/^FIELD_PUBLIC_WEB_ORIGIN=http:\/\/localhost:3002$/m, fieldWebOrigin);
  writeFileSync(fieldEnvPath, fieldEnv, { mode: 0o600 });
} else if (!/^FIELD_PUBLIC_WEB_ORIGIN=/m.test(fieldEnv)) {
  appendFileSync(fieldEnvPath, `${fieldWebOrigin}\n`, { mode: 0o600 });
}
const fields = ['FIELD_AP_OAUTH_ISSUER', 'FIELD_AP_CLIENT_ID', 'FIELD_AP_CLIENT_SECRET', 'FIELD_AP_TOKEN_KEY'];
const present = fields.filter(field => new RegExp(`^${field}=`, 'm').test(fieldEnv));
if (present.length === fields.length) {
  const clientId = /^FIELD_AP_CLIENT_ID=(.+)$/m.exec(fieldEnv)?.[1];
  if (!clientId || !process.env.AP_DATABASE_URL) throw new Error('AP mock client/database configuration is incomplete');
  const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
  try {
    const updated = await pool.query(`update "oauthClient"
      set scopes = coalesce(scopes, '[]'::jsonb)
        || case when coalesce(scopes, '[]'::jsonb) ? 'ap.conversations.reply'
          then '[]'::jsonb else '["ap.conversations.reply"]'::jsonb end
        || case when coalesce(scopes, '[]'::jsonb) ? 'ap.sources.refresh'
          then '[]'::jsonb else '["ap.sources.refresh"]'::jsonb end
        || case when coalesce(scopes, '[]'::jsonb) ? 'ap.connections.create'
          then '[]'::jsonb else '["ap.connections.create"]'::jsonb end
        || case when coalesce(scopes, '[]'::jsonb) ? 'ap.deployments.manage'
          then '[]'::jsonb else '["ap.deployments.manage"]'::jsonb end,
        "updatedAt" = now()
      where "clientId" = $1 and (not (coalesce(scopes, '[]'::jsonb) ? 'ap.conversations.reply')
        or not (coalesce(scopes, '[]'::jsonb) ? 'ap.sources.refresh')
        or not (coalesce(scopes, '[]'::jsonb) ? 'ap.connections.create')
        or not (coalesce(scopes, '[]'::jsonb) ? 'ap.deployments.manage'))
      returning "clientId"`, [clientId]);
    if (updated.rowCount) process.stdout.write('AP mock client permits reply, source refresh, and installation scopes. Existing grants still require fresh owner consent.\n');
  } finally { await pool.end(); }
  process.stdout.write('Field mock AP connector is configured. Restart Field API to load it.\n');
  process.exit(0);
}
if (present.length) throw new Error('Field mock AP connector has partial configuration; resolve it before setup');
const apiBase = process.env.AP_AUTH_BASE_URL;
const issuer = apiBase ? new URL('/api/auth', apiBase).toString() : '';
const redirectUri = 'http://127.0.0.1:4321/v1/connections/ap/callback';
if (apiBase !== 'http://127.0.0.1:4311') throw new Error('Only the local AP mock issuer is supported');
const email = `field-connector-${randomUUID()}@example.invalid`;
const password = `${randomBytes(32).toString('base64url')}A1!`;
const request = async (path, body, cookie) => fetch(`${issuer}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:4311',
    ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
});
const ready = await fetch(`${issuer}/.well-known/oauth-authorization-server`).catch(() => null);
if (!ready?.ok) throw new Error('Start the current AP mock API on 127.0.0.1:4311 before connector setup');
const signup = await request('/sign-up/email', { email, password, name: 'Local Field connector owner' });
if (!signup.ok) throw new Error(`AP mock connector account creation failed (${signup.status})`);
const signin = await request('/sign-in/email', { email, password });
if (!signin.ok) throw new Error(`AP mock connector sign-in failed (${signin.status})`);
const cookie = signin.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const registration = await request('/oauth2/create-client', {
  client_name: 'Local Field BFF connector',
  redirect_uris: [redirectUri],
  application_type: 'native',
  token_endpoint_auth_method: 'client_secret_basic',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  scope: 'openid offline_access ap.agent.read ap.conversations.read ap.conversations.reply ap.sources.refresh ap.connections.create ap.deployments.manage',
}, cookie);
if (!registration.ok) throw new Error(`AP mock OAuth client registration failed (${registration.status}); restart AP API with current code`);
const client = await registration.json();
if (typeof client.client_id !== 'string' || typeof client.client_secret !== 'string')
  throw new Error('AP mock OAuth registration did not return client credentials');
appendFileSync(fieldEnvPath, `FIELD_AP_OAUTH_ISSUER=${issuer}\nFIELD_AP_CLIENT_ID=${client.client_id}\n`+
  `FIELD_AP_CLIENT_SECRET=${client.client_secret}\nFIELD_AP_TOKEN_KEY=${randomBytes(32).toString('base64url')}\n`,
{ mode: 0o600 });
process.stdout.write('Field mock AP connector configured. Restart Field API to load it. No live provider was contacted.\n');
