import type { FastifyInstance } from 'fastify';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { twoFactor } from 'better-auth/plugins/two-factor';

// AP 전용 카카오 로그인 설정. Field 카카오 앱·키·세션과 공유하지 않는다(결정 19).
export type KakaoProviderState = 'configured' | 'blocked_integration' | 'mock_forbidden';
export type KakaoProviderConfig =
  | { state: 'configured'; clientId: string; clientSecret: string }
  | { state: 'blocked_integration' | 'mock_forbidden' };

export function kakaoProviderConfig(env: Record<string, string | undefined> = process.env): KakaoProviderConfig {
  const clientId = env.AP_KAKAO_CLIENT_ID, clientSecret = env.AP_KAKAO_CLIENT_SECRET;
  // mock에는 실제 카카오 앱 키를 둘 수 없다(다른 실 공급사와 같은 부팅 거부 규칙).
  if (env.AP_PROFILE === 'mock') {
    if (clientId || clientSecret) throw new Error('real_kakao_provider_forbidden_in_mock');
    return { state: 'mock_forbidden' };
  }
  if (!clientId && !clientSecret) return { state: 'blocked_integration' };
  if (!clientId || !clientSecret) throw new Error('incomplete_AP_kakao_configuration');
  return { state: 'configured', clientId, clientSecret };
}

// better-auth 기본 kakao 공급사 설정. 콜백은 AP 웹 origin(Next rewrite)으로 받아 상태·세션 쿠키가 웹 origin에 남게 한다.
export function kakaoSocialProviders(config: KakaoProviderConfig, webOrigin: string) {
  if (config.state !== 'configured') return {};
  return {
    kakao: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectURI: new URL('/api/auth/callback/kakao', webOrigin).toString(),
      // 필요한 동의 항목만 요청한다(프로필 사진 제외).
      disableDefaultScope: true,
      scope: ['account_email', 'profile_nickname'],
    },
  };
}

const isKakaoCallback = (context: { path?: string; params?: unknown }) =>
  context.path === '/callback/:id' && (context.params as { id?: unknown } | undefined)?.id === 'kakao';

// 카카오가 인증하지 않은 이메일로는 새 AP 계정을 만들지 않는다(남의 이메일 선점 방지).
export function rejectUnverifiedKakaoUser(user: { emailVerified?: boolean | null }, context: { path?: string; params?: unknown } | null) {
  if (context && isKakaoCallback(context) && user.emailVerified !== true)
    throw new APIError('FORBIDDEN', { code: 'kakao_email_unverified', message: 'Kakao email is not verified' });
}

// better-auth twoFactor 플러그인은 이메일 로그인에만 2단계 확인을 건다. 카카오 콜백에도 같은 확인 훅을 재사용하고,
// JSON 응답 대신 AP 웹 2단계 인증 화면으로 보낸다. 세션은 TOTP·백업코드 검증 뒤에만 만들어진다.
export function kakaoTwoFactorBridge(plugin: ReturnType<typeof twoFactor>, webOrigin: string): BetterAuthPlugin {
  const challenge = plugin.hooks.after[0];
  if (!challenge) throw new Error('two_factor_hook_missing');
  return {
    id: 'ap-kakao-two-factor',
    hooks: {
      after: [
        { matcher: isKakaoCallback, handler: challenge.handler },
        {
          matcher: isKakaoCallback,
          handler: createAuthMiddleware(async ctx => {
            const returned = ctx.context.returned as { twoFactorRedirect?: unknown } | undefined;
            if (returned && typeof returned === 'object' && returned.twoFactorRedirect === true)
              throw ctx.redirect(new URL('/workspace?two_factor=kakao', webOrigin).toString());
          }),
        },
      ],
    },
  };
}

// 웹이 카카오 버튼 활성 여부를 정직하게 표시하도록 상태만 공개한다(키 값은 공개하지 않음).
export function registerAuthProviderRoutes(app: FastifyInstance, env: Record<string, string | undefined> = process.env) {
  const state: KakaoProviderState = kakaoProviderConfig(env).state;
  app.get('/v1/auth/providers', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return { kakao: state };
  });
}
