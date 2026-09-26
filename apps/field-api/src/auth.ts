import { oauthLifecycleProvider } from './oauth-lifecycle-provider.js';
import { lifecycleJournalFromEnvironment } from './oauth-lifecycle-journal.js';
import { Pool } from 'pg';
import { betterAuth } from 'better-auth';
import { oauthProvider } from '@better-auth/oauth-provider';
import { APIError } from 'better-auth/api';

const databaseUrl = process.env.FIELD_DATABASE_URL;
const secret = process.env.FIELD_AUTH_SECRET;
const baseURL = process.env.FIELD_AUTH_BASE_URL;
if (!databaseUrl || !secret || !baseURL) {
  throw new Error('FIELD_DATABASE_URL, FIELD_AUTH_SECRET and FIELD_AUTH_BASE_URL are required');
}
if (process.env.NODE_ENV === 'production' && process.env.FIELD_PROFILE === 'mock') {
  throw new Error('mock profile is forbidden in production');
}

export const authPool = new Pool({ connectionString: databaseUrl });
const webOrigin = process.env.FIELD_PUBLIC_WEB_ORIGIN
  ?? (process.env.FIELD_PROFILE === 'mock' ? 'http://localhost:3002' : null);
if (!webOrigin) throw new Error('FIELD_PUBLIC_WEB_ORIGIN is required for Field OAuth consent');
const resource = new URL('/integrations/v1', baseURL).toString();

const fieldScopes = [
  'field.facts.read',
  'field.availability.read',
  'field.requests.create',
  'field.requests.read',
  'field.customer_access.create',
  'field.proposals.respond',
  'field.notification_route.read',
  'field.connection.revoke',
];

export const auth = betterAuth({
  baseURL,
  secret,
  trustedOrigins: process.env.FIELD_PROFILE === 'mock' ? ['http://localhost:3002', 'http://127.0.0.1:3002'] : [],
  database: authPool,
  emailAndPassword: { enabled: true, requireEmailVerification: process.env.FIELD_PROFILE !== 'mock' },
  plugins: [
    oauthLifecycleProvider(authPool, lifecycleJournalFromEnvironment()),
    oauthProvider({
      loginPage: `${webOrigin}/connect/sign-in`,
      consentPage: `${webOrigin}/consent`,
      postLogin: {
        page: `${webOrigin}/connect/select`,
        shouldRedirect: async ({ user, session, scopes }) => {
          const selected = await authPool.query<{ requested_scopes: string[] }>(
            `select requested_scopes from field.oauth_selections
             where session_id = $1 and actor_user_id = $2 and selection_expires_at > now()
               and revoked_at is null order by created_at desc limit 1`, [session.id, user.id],
          );
          const requested = scopes.filter(scope => scope.startsWith('field.'));
          const granted = selected.rows[0]?.requested_scopes;
          return !granted || requested.length !== granted.length
            || requested.some(scope => !granted.includes(scope));
        },
        consentReferenceId: async ({ user, session, scopes }) => {
          const selected = await authPool.query<{ id: string; requested_scopes: string[] }>(
            `select id, requested_scopes from field.oauth_selections
             where session_id = $1 and actor_user_id = $2 and selection_expires_at > now()
               and revoked_at is null order by created_at desc limit 1`, [session.id, user.id],
          );
          const row = selected.rows[0];
          const requested = scopes.filter(scope => scope.startsWith('field.'));
          if (!row || requested.length !== row.requested_scopes.length
            || requested.some(scope => !row.requested_scopes.includes(scope)))
            throw new APIError('BAD_REQUEST', { error: 'selection_required' });
          return row.id;
        },
      },
      disableJwtPlugin: true,
      scopes: ['openid', 'offline_access', ...fieldScopes],
      codeExpiresIn: 60,
      clientRegistrationDefaultResources: [resource],
      clientRegistrationDefaultScopes: ['openid'],
      clientRegistrationAllowedScopes: ['offline_access', 'field.facts.read',
        'field.availability.read', 'field.requests.create', 'field.requests.read',
        'field.customer_access.create'],
      clientPrivileges: ({ user, action }) => action !== 'create' || process.env.FIELD_PROFILE === 'mock'
        || user?.emailVerified === true,
      resources: [{
        identifier: resource,
        accessTokenTtl: 600,
        allowedScopes: ['offline_access', ...fieldScopes],
      }],
    }),
  ],
});
