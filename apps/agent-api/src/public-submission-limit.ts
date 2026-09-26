import { createHmac } from 'node:crypto';
import type { PoolClient } from 'pg';

type SubmissionLimit = { retryAfter: number; scope: 'phone' | 'organization' };

function organizationLimit(): number {
  const raw = process.env.AP_PUBLIC_SUBMISSION_ORG_LIMIT;
  const limit = raw === undefined ? 60 : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('AP_PUBLIC_SUBMISSION_ORG_LIMIT must be an integer from 1 to 1000');
  }
  return limit;
}

export async function consumePublicSubmission(client: PoolClient, organizationId: string, phone: string): Promise<SubmissionLimit | null> {
  const secret = process.env.AP_AUTH_SECRET;
  if (!secret) throw new Error('AP_AUTH_SECRET is required for public submission limits');
  const subject = createHmac('sha256', secret).update('ap-public-submission-v1\0')
    .update(phone.replace(/\D/g, '')).digest('hex');
  const result = await client.query<{ attempts: number; retry_after: number }>(
    `insert into ap.public_submission_windows
       (organization_id, subject_hash, attempts, window_started_at, updated_at)
     values ($1, $2, 1, clock_timestamp(), clock_timestamp())
     on conflict (organization_id, subject_hash) do update set
       attempts = case when ap.public_submission_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then 1 else least(ap.public_submission_windows.attempts + 1, 6) end,
       window_started_at = case when ap.public_submission_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then clock_timestamp() else ap.public_submission_windows.window_started_at end,
       updated_at = clock_timestamp()
     returning attempts,
       greatest(1, ceil(extract(epoch from (window_started_at + interval '15 minutes' - clock_timestamp())))::integer) as retry_after`,
    [organizationId, subject],
  );
  if (result.rows[0]!.attempts > 5) return { retryAfter: result.rows[0]!.retry_after, scope: 'phone' };
  const limit = organizationLimit();
  const organization = await client.query<{ attempts: number; retry_after: number }>(
    `insert into ap.public_submission_organization_windows
       (organization_id, attempts, window_started_at, updated_at)
     values ($1, 1, clock_timestamp(), clock_timestamp())
     on conflict (organization_id) do update set
       attempts = case when ap.public_submission_organization_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then 1 else least(ap.public_submission_organization_windows.attempts + 1, $2::integer + 1) end,
       window_started_at = case when ap.public_submission_organization_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then clock_timestamp() else ap.public_submission_organization_windows.window_started_at end,
       updated_at = clock_timestamp()
     returning attempts,
       greatest(1, ceil(extract(epoch from (window_started_at + interval '15 minutes' - clock_timestamp())))::integer) as retry_after`,
    [organizationId, limit],
  );
  return organization.rows[0]!.attempts > limit
    ? { retryAfter: organization.rows[0]!.retry_after, scope: 'organization' } : null;
}
