import type { FastifyReply } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { subscriptionAccess } from './subscription-access.js';

export async function rejectExpiredTrial(reply: FastifyReply, db: Pool | PoolClient, organizationId: string) {
  const access=await subscriptionAccess(db,organizationId);
  if(access.canStartNew)return false;
  reply.header('Cache-Control','no-store').code(403).send({error:access.reason,accessMode:'cleanup_only'});
  return true;
}

// 조직 삭제 예약·실행(또는 삭제 표시) 중에는 유료 결제·체험·연결 같은 새 계약을 시작하지 않는다(추가).
// 호출자는 조직 행을 잠근 트랜잭션 안에서 부른다(삭제 예약 생성도 같은 조직 행을 for update로 잠근다).
export async function rejectDeletionScheduled(reply: FastifyReply, db: Pool | PoolClient, organizationId: string) {
  const blocked = (await db.query<{ blocked: boolean }>(
    `select exists(select 1 from ap.organizations where id=$1 and deleted_at is not null)
       or exists(select 1 from ap.organization_deletion_requests where organization_id=$1 and status in ('scheduled','executed'))
       as blocked`, [organizationId])).rows[0]!.blocked;
  if (!blocked) return false;
  reply.header('Cache-Control', 'no-store').code(409).send({ error: 'deletion_scheduled', accessMode: 'cleanup_only' });
  return true;
}

// 체험 정책. mock은 로컬 고정값, 그 외 프로필은 승인된 동의 버전·기간 env가 모두 있어야 열린다.
export function trialPolicy() {
  if (process.env.AP_PROFILE === 'mock') return { consentVersion: 'mock-trial-v1', days: 14, source: 'mock' as const };
  const consentVersion = process.env.AP_TRIAL_CONSENT_VERSION?.trim() ?? '';
  const rawDays = process.env.AP_TRIAL_DAYS?.trim() ?? '';
  const days = Number(rawDays);
  // 값이 없거나 범위(1–90일)를 벗어나면 임의로 보정하지 않고 정책 미승인으로 닫는다.
  if (consentVersion && consentVersion.length <= 100 && /^[0-9]+$/.test(rawDays) && days >= 1 && days <= 90)
    return { consentVersion, days, source: 'configured' as const };
  return { consentVersion: null, days: null, source: 'unavailable' as const };
}
