import type { FastifyReply } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { subscriptionAccess } from './subscription-access.js';

export async function rejectExpiredTrial(reply: FastifyReply, db: Pool | PoolClient, organizationId: string) {
  const access=await subscriptionAccess(db,organizationId);
  if(access.canStartNew)return false;
  reply.header('Cache-Control','no-store').code(403).send({error:access.reason,accessMode:'cleanup_only'});
  return true;
}

// 체험 정책. mock은 로컬 고정값, 그 외 프로필은 승인된 동의 버전·기간 env가 모두 있어야 열린다.
export function trialPolicy() {
  if (process.env.FIELD_PROFILE === 'mock') return { consentVersion: 'mock-trial-v1', days: 14, source: 'mock' as const };
  const consentVersion = process.env.FIELD_TRIAL_CONSENT_VERSION?.trim() ?? '';
  const rawDays = process.env.FIELD_TRIAL_DAYS?.trim() ?? '';
  const days = Number(rawDays);
  // 값이 없거나 범위(1–90일)를 벗어나면 임의로 보정하지 않고 정책 미승인으로 닫는다.
  if (consentVersion && consentVersion.length <= 100 && /^[0-9]+$/.test(rawDays) && days >= 1 && days <= 90)
    return { consentVersion, days, source: 'configured' as const };
  return { consentVersion: null, days: null, source: 'unavailable' as const };
}
