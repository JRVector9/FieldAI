import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';

export type AdminActor = { userId: string; role: 'operator' | 'auditor' };

// Field 관리자 공통 게이트: 세션 → 플랫폼 관리자 멤버십 → (mock 외) 2단계 인증으로 시작한 현재 세션.
// better-auth twoFactor 플러그인은 2FA 사용자의 로그인 세션을 TOTP 검증 뒤에만 만든다.
// 2FA 등록 이전에 열린 세션·메일 확인 자동 로그인 세션은 session."twoFactorVerified"=false로 남아 거부된다.
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime,
  options: { role?: 'operator' } = {}): Promise<AdminActor | null> {
  const userId = await runtime.resolveUserId(request.headers);
  if (!userId) { reply.code(401).send({ error: 'authentication_required' }); return null; }
  const role = (await runtime.pool.query<{ role: AdminActor['role'] }>(
    'select role from field.platform_admin_memberships where user_id=$1', [userId])).rows[0]?.role;
  if (!role || options.role === 'operator' && role !== 'operator') {
    reply.code(403).send({ error: 'admin_membership_required' }); return null;
  }
  if (process.env.FIELD_PROFILE === 'mock') return { userId, role };
  // 현재 세션을 확인할 수 없으면 2단계 인증 여부도 증명할 수 없으므로 같은 mfa_required로 거부한다.
  const session = await runtime.resolveSession?.(request.headers);
  const mfa = session && session.userId === userId ? (await runtime.pool.query<{ enabled: boolean | null; verified: boolean }>(
    `select u."twoFactorEnabled" as enabled, s."twoFactorVerified" as verified
       from "session" s join "user" u on u.id = s."userId"
      where s.id = $1 and s."userId" = $2 and s."expiresAt" > now()
        and s."createdAt" <= now() and s."createdAt" > now() - interval '8 hours'`, [session.id, userId])).rows[0] : undefined;
  if (mfa?.enabled !== true || mfa.verified !== true) { reply.code(403).send({ error: 'mfa_required' }); return null; }
  return { userId, role };
}
