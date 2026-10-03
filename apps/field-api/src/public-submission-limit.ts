import { createHmac } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ipLimitBucket } from './ip-bucket.js';

type SubmissionLimit = { retryAfter: number; scope: 'ip' | 'phone' | 'organization' };

function organizationLimit(): number {
  const raw = process.env.FIELD_PUBLIC_SUBMISSION_ORG_LIMIT;
  const limit = raw === undefined ? 60 : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('FIELD_PUBLIC_SUBMISSION_ORG_LIMIT must be an integer from 1 to 1000');
  }
  return limit;
}

// 접속 IP별 15분 한도. 한 IP가 번호만 바꿔 조직 공용 한도를 소진하지 못하게 조직 한도보다 낮게 둔다.
function ipLimit(name: 'FIELD_PUBLIC_SUBMISSION_IP_LIMIT' | 'FIELD_PUBLIC_MESSAGE_IP_LIMIT', fallback: number): number {
  const raw = process.env[name];
  const limit = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error(`${name} must be an integer from 1 to 1000`);
  }
  return limit;
}

function limitSecret(): string {
  const secret = process.env.FIELD_AUTH_SECRET;
  if (!secret) throw new Error('FIELD_AUTH_SECRET is required for public submission limits');
  return secret;
}

// (조직, IP) 창을 1 증가시키고 한도를 넘으면 남은 시간을 돌려준다. 원문 IP는 저장하지 않는다.
async function consumeIpWindow(client: PoolClient, organizationId: string, domain: string, ip: string,
  limit: number): Promise<SubmissionLimit | null> {
  // IPv6는 /64로 묶어 주소만 바꿔 조직 공용 한도를 소진하지 못하게 한다(ip-bucket.ts).
  const subject = createHmac('sha256', limitSecret()).update(`${domain}\0`).update(ipLimitBucket(ip)).digest('hex');
  const result = await client.query<{ attempts: number; retry_after: number }>(
    `insert into field.public_submission_ip_windows
       (organization_id, subject_hash, attempts, window_started_at, updated_at)
     values ($1, $2, 1, clock_timestamp(), clock_timestamp())
     on conflict (organization_id, subject_hash) do update set
       attempts = case when field.public_submission_ip_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then 1 else least(field.public_submission_ip_windows.attempts + 1, $3::integer + 1) end,
       window_started_at = case when field.public_submission_ip_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then clock_timestamp() else field.public_submission_ip_windows.window_started_at end,
       updated_at = clock_timestamp()
     returning attempts,
       greatest(1, ceil(extract(epoch from (window_started_at + interval '15 minutes' - clock_timestamp())))::integer) as retry_after`,
    [organizationId, subject, limit],
  );
  return result.rows[0]!.attempts > limit ? { retryAfter: result.rows[0]!.retry_after, scope: 'ip' } : null;
}

// 고객 메시지(첨부 포함)는 접수와 별도 창으로 IP별 한도만 둔다.
export function consumePublicMessage(client: PoolClient, organizationId: string, ip: string): Promise<SubmissionLimit | null> {
  return consumeIpWindow(client, organizationId, 'field-public-message-ip-v1', ip,
    ipLimit('FIELD_PUBLIC_MESSAGE_IP_LIMIT', 30));
}

export async function consumePublicSubmission(client: PoolClient, organizationId: string, phone: string,
  ip: string): Promise<SubmissionLimit | null> {
  // IP 창을 번호·조직 창보다 먼저 검사한다.
  const byIp = await consumeIpWindow(client, organizationId, 'field-public-submission-ip-v1', ip,
    ipLimit('FIELD_PUBLIC_SUBMISSION_IP_LIMIT', 20));
  if (byIp) return byIp;
  const secret = limitSecret();
  const subject = createHmac('sha256', secret).update('field-public-submission-v1\0')
    .update(phone.replace(/\D/g, '')).digest('hex');
  const result = await client.query<{ attempts: number; retry_after: number }>(
    `insert into field.public_submission_windows
       (organization_id, subject_hash, attempts, window_started_at, updated_at)
     values ($1, $2, 1, clock_timestamp(), clock_timestamp())
     on conflict (organization_id, subject_hash) do update set
       attempts = case when field.public_submission_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then 1 else least(field.public_submission_windows.attempts + 1, 6) end,
       window_started_at = case when field.public_submission_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then clock_timestamp() else field.public_submission_windows.window_started_at end,
       updated_at = clock_timestamp()
     returning attempts,
       greatest(1, ceil(extract(epoch from (window_started_at + interval '15 minutes' - clock_timestamp())))::integer) as retry_after`,
    [organizationId, subject],
  );
  if (result.rows[0]!.attempts > 5) return { retryAfter: result.rows[0]!.retry_after, scope: 'phone' };
  const limit = organizationLimit();
  const organization = await client.query<{ attempts: number; retry_after: number }>(
    `insert into field.public_submission_organization_windows
       (organization_id, attempts, window_started_at, updated_at)
     values ($1, 1, clock_timestamp(), clock_timestamp())
     on conflict (organization_id) do update set
       attempts = case when field.public_submission_organization_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then 1 else least(field.public_submission_organization_windows.attempts + 1, $2::integer + 1) end,
       window_started_at = case when field.public_submission_organization_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then clock_timestamp() else field.public_submission_organization_windows.window_started_at end,
       updated_at = clock_timestamp()
     returning attempts,
       greatest(1, ceil(extract(epoch from (window_started_at + interval '15 minutes' - clock_timestamp())))::integer) as retry_after`,
    [organizationId, limit],
  );
  return organization.rows[0]!.attempts > limit
    ? { retryAfter: organization.rows[0]!.retry_after, scope: 'organization' } : null;
}
