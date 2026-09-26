import { Pool } from 'pg';
import { betterAuth } from 'better-auth';
import { oauthProvider } from '@better-auth/oauth-provider';
import { APIError } from 'better-auth/api';

const databaseUrl = process.env.AP_DATABASE_URL;
const secret = process.env.AP_AUTH_SECRET;
const baseURL = process.env.AP_AUTH_BASE_URL;
if (!databaseUrl || !secret || !baseURL) {
  throw new Error('AP_DATABASE_URL, AP_AUTH_SECRET and AP_AUTH_BASE_URL are required');
}
if (process.env.NODE_ENV === 'production' && process.env.AP_PROFILE === 'mock') {
  throw new Error('mock profile is forbidden in production');
}

export const authPool = new Pool({ connectionString: databaseUrl });
const webOrigin = process.env.AP_PUBLIC_WEB_ORIGIN ?? (process.env.AP_PROFILE === 'mock' ? 'http://localhost:3001' : null);
if (!webOrigin) throw new Error('AP_PUBLIC_WEB_ORIGIN is required for AP OAuth consent');
const resource = new URL('/integrations/v1', baseURL).toString();

export const auth = betterAuth({
  baseURL,
  secret,
  trustedOrigins: process.env.AP_PROFILE === 'mock' ? ['http://localhost:3001', 'http://127.0.0.1:3001'] : [],
  database: authPool,
  emailAndPassword: { enabled: true, requireEmailVerification: process.env.AP_PROFILE !== 'mock' },
  plugins: [
    oauthProvider({
      loginPage: `${webOrigin}/connect/sign-in`,
      consentPage: `${webOrigin}/consent`,
      postLogin: {
        page: `${webOrigin}/connect/select`,
        shouldRedirect: async ({ user, session, scopes }) => {
          const selected = await authPool.query<{ requested_scopes: string[] }>(
            `select requested_scopes from ap.oauth_selections
             where session_id = $1 and actor_user_id = $2 and selection_expires_at > now()
               and revoked_at is null order by created_at desc limit 1`, [session.id, user.id],
          );
          const requested = scopes.filter(scope => scope.startsWith('ap.'));
          const granted = selected.rows[0]?.requested_scopes;
          return !granted || requested.length !== granted.length
            || requested.some(scope => !granted.includes(scope));
        },
        consentReferenceId: async ({ user, session, scopes }) => {
          const selected = await authPool.query<{ id: string; requested_scopes: string[] }>(
            `select id, requested_scopes from ap.oauth_selections
             where session_id = $1 and actor_user_id = $2 and selection_expires_at > now()
               and revoked_at is null order by created_at desc limit 1`, [session.id, user.id],
          );
          const row = selected.rows[0];
          const requested = scopes.filter(scope => scope.startsWith('ap.'));
          if (!row || requested.length !== row.requested_scopes.length
            || requested.some(scope => !row.requested_scopes.includes(scope)))
            throw new APIError('BAD_REQUEST', { error: 'selection_required' });
          return row.id;
        },
      },
      disableJwtPlugin: true,
      scopes: ['openid', 'offline_access', 'ap.agent.read', 'ap.conversations.read',
        'ap.conversations.reply', 'ap.sources.refresh'],
      codeExpiresIn: 60,
      clientRegistrationDefaultResources: [resource],
      clientRegistrationDefaultScopes: ['openid'],
      clientRegistrationAllowedScopes: ['offline_access', 'ap.agent.read', 'ap.conversations.read',
        'ap.conversations.reply', 'ap.sources.refresh'],
      clientPrivileges: ({ user, action }) => action !== 'create' || process.env.AP_PROFILE === 'mock'
        || user?.emailVerified === true,
      resources: [{
        identifier: resource,
        accessTokenTtl: 600,
        allowedScopes: ['offline_access', 'ap.agent.read', 'ap.conversations.read',
          'ap.conversations.reply', 'ap.sources.refresh'],
      }],
    }),
  ],
});
