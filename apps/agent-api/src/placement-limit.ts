import type { PoolClient } from 'pg';

export async function guardPlacementEngagement(client: PoolClient, organizationId: string) {
  const raw = Number(process.env.AP_PLACEMENT_ENGAGEMENT_DAILY_LIMIT
    ?? (process.env.AP_PROFILE === 'mock' ? 100 : NaN));
  if (!Number.isSafeInteger(raw) || raw < 1 || raw > 100000) return 'budget_not_configured';
  await client.query('select id from ap.organizations where id = $1 for update', [organizationId]);
  const count = await client.query<{ total: string }>(
    `select count(*)::text as total from ap.inquiries where organization_id = $1
     and placement_id is not null and created_at >= now() - interval '24 hours'`, [organizationId],
  );
  return Number(count.rows[0]?.total) >= raw ? 'placement_engagement_limit' : null;
}
