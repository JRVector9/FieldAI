import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
after(async () => { await authPool.end(); });

test('AP OAuth issuer advertises its own authorization endpoint', async () => {
  const response = await auth.handler(new Request('http://127.0.0.1:4311/api/auth/.well-known/oauth-authorization-server'));
  assert.equal(response.status, 200);
  const metadata = await response.json() as { issuer?: string; authorization_endpoint?: string };
  assert.equal(metadata.issuer, 'http://127.0.0.1:4311/api/auth');
  assert.match(metadata.authorization_endpoint ?? '', /\/oauth2\/authorize$/);
});

test('verified AP user can create a scoped OAuth client without Field account', async () => {
  const email = `spike-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const base = 'http://127.0.0.1:4311/api/auth';
  const resource = 'http://127.0.0.1:4311/integrations/v1';
  const organizationId = randomUUID();
  const post = (path: string, body: object, cookie?: string) => auth.handler(new Request(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:4311',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  }));
  try {
    const signup = await post('/sign-up/email', { email, password, name: 'Synthetic owner' });
    assert.equal(signup.status, 200);
    await authPool.query('UPDATE "user" SET "emailVerified" = true WHERE email = $1', [email]);

    const signin = await post('/sign-in/email', { email, password });
    assert.equal(signin.status, 200);
    const cookie = signin.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    assert.match(cookie, /session_token/);

    const registration = await post('/oauth2/create-client', {
      client_name: 'Synthetic external client',
      redirect_uris: ['http://127.0.0.1:4399/callback'],
      application_type: 'native',
      token_endpoint_auth_method: 'client_secret_basic',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'openid offline_access ap.agent.read',
    }, cookie);
    assert.equal(registration.status, 201, await registration.clone().text());
    const client = await registration.json() as { client_id?: string; client_secret?: string };
    assert.ok(client.client_id);
    assert.ok(client.client_secret);
    const clientAuthorization = `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64')}`;
    const current = await auth.api.getSession({ headers: new Headers({ cookie }) });
    assert.ok(current);
    await authPool.query('insert into ap.organizations(id, owner_user_id, name) values ($1,$2,$3)',
      [organizationId, current.user.id, 'OAuth 검수 사업자']);
    await authPool.query("insert into ap.memberships(organization_id,user_id,role) values ($1,$2,'owner')",
      [organizationId, current.user.id]);
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const authorizationUrl = new URL(`${base}/oauth2/authorize`);
    for (const [key, value] of Object.entries({
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: 'http://127.0.0.1:4399/callback',
      scope: 'openid offline_access ap.agent.read',
      state: randomUUID(),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource,
    })) authorizationUrl.searchParams.set(key, value);
    assert.equal((await authPool.query('select 1 from "oauthClientResource" where "clientId" = $1 and "resourceId" = $2',
      [client.client_id, resource])).rowCount, 1);
    const invalidTargetUrl = new URL(authorizationUrl);
    invalidTargetUrl.searchParams.set('resource', 'https://unregistered.example.test/api');
    const invalidTarget = await auth.handler(new Request(invalidTargetUrl, { headers: { cookie } }));
    assert.equal(invalidTarget.status, 302);
    const invalidTargetRedirect = new URL(invalidTarget.headers.get('location') ?? 'http://invalid.local');
    assert.equal(invalidTargetRedirect.searchParams.get('error'), 'invalid_target');
    const noPkceUrl = new URL(authorizationUrl);
    noPkceUrl.searchParams.delete('code_challenge');
    noPkceUrl.searchParams.delete('code_challenge_method');
    const noPkce = await auth.handler(new Request(noPkceUrl, { headers: { cookie } }));
    assert.equal(new URL(noPkce.headers.get('location') ?? 'http://invalid.local').searchParams.get('error'), 'invalid_request');

    const forbiddenScopeUrl = new URL(authorizationUrl);
    forbiddenScopeUrl.searchParams.set('scope', 'field.requests.create');
    const forbiddenScope = await auth.handler(new Request(forbiddenScopeUrl, { headers: { cookie } }));
    assert.equal(new URL(forbiddenScope.headers.get('location') ?? 'http://invalid.local').searchParams.get('error'), 'invalid_scope');

    const authorization = await auth.handler(new Request(authorizationUrl, { headers: { cookie } }));
    assert.equal(authorization.status, 302);
    assert.match(authorization.headers.get('location') ?? '', /connect\/select/);

    const selectionId = randomUUID();
    await authPool.query(
      `insert into ap.oauth_selections(id, session_id, actor_user_id, client_id,
         organization_id, agent_id, requested_scopes, selection_expires_at)
       values ($1,$2,$3,$4,$5,$6,$7::text[],now() + interval '5 minutes')`,
      [selectionId, current.session.id, current.user.id, client.client_id,
        organizationId, randomUUID(), ['ap.agent.read']]);

    const selectionCookie = [cookie, ...authorization.headers.getSetCookie().map((value) => value.split(';')[0])].join('; ');
    const selectionLocation = new URL(authorization.headers.get('location') ?? '/', base);
    const continued = await post('/oauth2/continue', {
      postLogin: true, oauth_query: selectionLocation.searchParams.toString(),
    }, selectionCookie);
    assert.equal(continued.status, 200);
    const continueResult = await continued.json() as { redirect?: boolean; url?: string };
    assert.equal(continueResult.redirect, true);
    assert.match(continueResult.url ?? '', /consent/);

    const consentCookie = [selectionCookie, ...continued.headers.getSetCookie().map((value) => value.split(';')[0])].join('; ');
    const consentLocation = new URL(continueResult.url ?? '/', base);
    const consent = await post('/oauth2/consent', {
      accept: true,
      oauth_query: consentLocation.searchParams.toString(),
    }, consentCookie);
    assert.equal(consent.status, 200);
    const consentResult = await consent.json() as { redirect?: boolean; url?: string };
    assert.equal(consentResult.redirect, true);
    const callbackUrl = new URL(consentResult.url ?? 'http://invalid.local');
    assert.equal(callbackUrl.origin, 'http://127.0.0.1:4399');
    assert.equal(callbackUrl.searchParams.get('iss'), `${base}`);
    const code = callbackUrl.searchParams.get('code');
    assert.ok(code);

    const token = await auth.handler(new Request(`${base}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: clientAuthorization },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: client.client_id,
        redirect_uri: 'http://127.0.0.1:4399/callback',
        code,
        code_verifier: verifier,
      }),
    }));
    assert.equal(token.status, 200);
    const tokenResult = await token.json() as { access_token?: string; refresh_token?: string; scope?: string };
    assert.ok(tokenResult.access_token);
    assert.ok(tokenResult.refresh_token);
    assert.match(tokenResult.scope ?? '', /ap\.agent\.read/);
    assert.match(tokenResult.scope ?? '', /offline_access/);

    const oauthForm = (path: string, values: Record<string, string>) => auth.handler(new Request(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: clientAuthorization },
      body: new URLSearchParams(values),
    }));
    const refresh = await oauthForm('/oauth2/token', {
      grant_type: 'refresh_token', client_id: client.client_id!, refresh_token: tokenResult.refresh_token!,
    });
    assert.equal(refresh.status, 200, await refresh.clone().text());
    const refreshed = await refresh.json() as { access_token?: string; refresh_token?: string; scope?: string };
    assert.ok(refreshed.access_token && refreshed.access_token !== tokenResult.access_token);
    assert.ok(refreshed.refresh_token && refreshed.refresh_token !== tokenResult.refresh_token,
      JSON.stringify({ keys: Object.keys(refreshed), scope: refreshed.scope }));
    assert.match(refreshed.scope ?? '', /ap\.agent\.read/);
    const introspect = () => oauthForm('/oauth2/introspect', {
      token: tokenResult.access_token!,
      client_id: client.client_id!,
    });
    const beforeRevoke = await introspect();
    assert.equal(beforeRevoke.status, 200);
    const tokenMetadata = await beforeRevoke.json() as { active?: boolean; aud?: string | string[] };
    assert.equal(tokenMetadata.active, true);
    assert.ok(tokenMetadata.aud === resource || (Array.isArray(tokenMetadata.aud) && tokenMetadata.aud.includes(resource)));

    const revoke = await oauthForm('/oauth2/revoke', {
      token: tokenResult.access_token,
      client_id: client.client_id,
      token_type_hint: 'access_token',
    });
    assert.equal(revoke.status, 200);
    const afterRevoke = await introspect();
    assert.equal(afterRevoke.status, 200);
    assert.equal((await afterRevoke.json() as { active?: boolean }).active, false);
  } finally {
    await authPool.query('DELETE FROM ap.organizations WHERE id = $1', [organizationId]);
    await authPool.query('DELETE FROM "user" WHERE email = $1', [email]);
  }
});
