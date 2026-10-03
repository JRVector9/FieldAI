import { oauthLifecycleProvider } from './oauth-lifecycle-provider.js';
import { lifecycleJournalFromEnvironment } from './oauth-lifecycle-journal.js';
import { Pool } from 'pg';
import { betterAuth } from 'better-auth';
import { oauthProvider } from '@better-auth/oauth-provider';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { APIError } from 'better-auth/api';
import { assertProductionProfile } from './production-profile.js';
import { authEmailMessage, deliverAuthEmail, emailProviderFromEnvironment, type EmailProvider } from './email-provider.js';
import { kakaoProviderConfig, kakaoSocialProviders, kakaoTwoFactorBridge, rejectUnverifiedKakaoUser } from './kakao-provider.js';

const databaseUrl = process.env.FIELD_DATABASE_URL;
const secret = process.env.FIELD_AUTH_SECRET;
const baseURL = process.env.FIELD_AUTH_BASE_URL;
if (!databaseUrl || !secret || !baseURL) {
  throw new Error('FIELD_DATABASE_URL, FIELD_AUTH_SECRET and FIELD_AUTH_BASE_URL are required');
}
assertProductionProfile();

export const authPool = new Pool({ connectionString: databaseUrl });
const webOrigin = process.env.FIELD_PUBLIC_WEB_ORIGIN
  ?? (process.env.FIELD_PROFILE === 'mock' ? 'http://localhost:3002' : null);
if (!webOrigin) throw new Error('FIELD_PUBLIC_WEB_ORIGIN is required for Field OAuth consent');
const resource = new URL('/integrations/v1', baseURL).toString();
// 인증 메일 포트. 서버는 환경값으로 정하고, DB 테스트만 가짜 공급사로 바꿔 끼운다.
export const authEmail: { provider: EmailProvider } = { provider: emailProviderFromEnvironment() };
const webLink = (path: string, token: string) => {
  const url = new URL(path, webOrigin);
  url.searchParams.set('token', token);
  return url.toString();
};
// TOTP·백업코드 검증 요청에서 만들어진 세션만 관리자 2단계 인증 세션으로 표시한다.
const TWO_FACTOR_SESSION_PATHS = new Set(['/two-factor/verify-totp', '/two-factor/verify-backup-code']);
// 카카오 키가 없으면 공급사를 등록하지 않는다(blocked_integration). mock에 실제 키가 있으면 여기서 부팅 거부.
const kakao = kakaoProviderConfig();
const twoFactorPlugin = twoFactor({ issuer: 'Field' });

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
  trustedOrigins: [...new Set([webOrigin, ...process.env.FIELD_PROFILE === 'mock' ? ['http://localhost:3002', 'http://127.0.0.1:3002'] : []])],
  database: authPool,
  socialProviders: kakaoSocialProviders(kakao, webOrigin),
  // 동일 이메일 자동 병합 금지(결정 19). 이미 이메일로 가입한 주소의 카카오 로그인은 account_not_linked로 거부된다.
  account: { accountLinking: { enabled: false } },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: process.env.FIELD_PROFILE !== 'mock',
    revokeSessionsOnPasswordReset: true,
    // 메일 링크는 Field 웹 화면으로 보낸다. 없는 계정이어도 같은 응답을 주는 better-auth 동작을 유지하려고 예외를 던지지 않는다.
    sendResetPassword: async ({ user, token }) => {
      await deliverAuthEmail(authPool, authEmail.provider, { purpose: 'reset_password', secret: token,
        message: authEmailMessage('reset_password', user.email, webLink('/reset-password', token)) });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }) => {
      await deliverAuthEmail(authPool, authEmail.provider, { purpose: 'verify_email', secret: token,
        message: authEmailMessage('verify_email', user.email, webLink('/verify-email', token)) });
    },
  },
  session: {
    additionalFields: { twoFactorVerified: { type: 'boolean', required: false, defaultValue: false, input: false } },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          rejectUnverifiedKakaoUser(user, context);
          return { data: user };
        },
      },
    },
    session: {
      create: {
        before: async (session, context) => ({
          data: { ...session, twoFactorVerified: TWO_FACTOR_SESSION_PATHS.has(context?.path ?? '') },
        }),
      },
    },
  },
  plugins: [
    twoFactorPlugin,
    kakaoTwoFactorBridge(twoFactorPlugin, webOrigin),
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
        'field.customer_access.create',
        // §4.12 고객 결정·알림 경로 공개 API scope. 외부 통합자가 client 등록 때 직접 요청할 수 있어야 한다(B05)
        'field.proposals.respond', 'field.notification_route.read'],
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
