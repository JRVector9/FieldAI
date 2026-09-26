import type { Pool } from 'pg';

function organizationLimit(): number {
  const raw = process.env.AP_FIELD_PREFLIGHT_ORG_LIMIT;
  const limit = raw === undefined ? 120 : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('AP_FIELD_PREFLIGHT_ORG_LIMIT must be an integer from 1 to 1000');
  }
  return limit;
}

export async function consumeFieldPreflight(pool: Pool, organizationId: string): Promise<number | null> {
  const limit = organizationLimit();
  const result = await pool.query<{ attempts: number; retry_after: number }>(
    `insert into ap.field_preflight_organization_windows
       (organization_id, attempts, window_started_at, updated_at)
     values ($1, 1, clock_timestamp(), clock_timestamp())
     on conflict (organization_id) do update set
       attempts = case when ap.field_preflight_organization_windows.window_started_at
           <= clock_timestamp() - interval '1 minute'
         then 1 else least(ap.field_preflight_organization_windows.attempts + 1,
           $2::integer + 1) end,
       window_started_at = case when ap.field_preflight_organization_windows.window_started_at
           <= clock_timestamp() - interval '1 minute'
         then clock_timestamp() else ap.field_preflight_organization_windows.window_started_at end,
       updated_at = clock_timestamp()
     returning attempts,
       greatest(1, ceil(extract(epoch from
         (window_started_at + interval '1 minute' - clock_timestamp())))::integer) as retry_after`,
    [organizationId, limit],
  );
  return result.rows[0]!.attempts > limit ? result.rows[0]!.retry_after : null;
}
