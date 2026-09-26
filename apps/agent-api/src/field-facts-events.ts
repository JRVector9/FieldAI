import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

type Pending = { id: string; source_event_id: string; connection_id: string;
  source_revision: number };
type Connection = { ap_grant_id: string; ap_organization_id: string };

export async function processFieldFactsEventOnce(pool: Pool):
  Promise<'empty' | 'scheduled' | 'ignored' | 'blocked'> {
  const db = await pool.connect();
  try {
    await db.query('begin');
    const row = (await db.query<Pending>(`select id,source_event_id,connection_id,source_revision
      from ap.field_facts_event_inbox where state = 'received'
      order by received_at for update skip locked limit 1`)).rows[0];
    if (!row) { await db.query('commit'); return 'empty'; }
    const connection = (await db.query<Connection>(`select c.ap_grant_id,c.ap_organization_id
      from ap.field_connections c
      join ap.oauth_selections s on s.id = c.ap_grant_id
      join ap.memberships m on m.organization_id = c.ap_organization_id
        and m.user_id = c.initiator_user_id and m.role = 'owner'
      where c.id = $1 and c.status = 'review_required' and s.revoked_at is null
        and s.organization_id = c.ap_organization_id and s.agent_id = c.ap_agent_id
        and s.actor_user_id = c.initiator_user_id
        and s.requested_scopes @> array['ap.sources.refresh']
        and exists (select 1 from "oauthConsent" oc where oc."referenceId" = s.id::text
          and oc."clientId" = s.client_id and oc."userId" = s.actor_user_id
          and oc.scopes @> '["ap.sources.refresh"]'::jsonb)
        and exists (select 1 from "oauthRefreshToken" t where t."referenceId" = s.id::text
          and t."clientId" = s.client_id and t."userId" = s.actor_user_id
          and t.revoked is null and t."expiresAt" > now())
      for update of c`, [row.connection_id])).rows[0];
    if (!connection) {
      await db.query(`update ap.field_facts_event_inbox set state = 'blocked',
        error_code = 'connection_or_grant_unavailable',processed_at = now() where id = $1`,
      [row.id]);
      await db.query('commit'); return 'blocked';
    }
    const current = (await db.query<{ source_revision: number }>(
      'select source_revision from ap.knowledge_sources where connection_id = $1',
      [row.connection_id])).rows[0]?.source_revision ?? 0;
    if (row.source_revision <= current) {
      await db.query(`update ap.field_facts_event_inbox set state = 'ignored',
        processed_at = now() where id = $1`, [row.id]);
      await db.query('commit'); return 'ignored';
    }
    const jobId = randomUUID();
    const keyHash = createHash('sha256').update(`field-facts-event:${row.source_event_id}`).digest('hex');
    const inserted = await db.query<{ id: string }>(`insert into ap.source_refresh_jobs
      (id,connection_id,ap_grant_id,organization_id,expected_source_revision,idempotency_key_hash)
      values ($1,$2,$3,$4,$5,$6)
      on conflict (connection_id,idempotency_key_hash) do nothing returning id`,
    [jobId, row.connection_id, connection.ap_grant_id,
      connection.ap_organization_id, current, keyHash]);
    const effectiveJobId = inserted.rows[0]?.id ?? (await db.query<{ id: string }>(
      `select id from ap.source_refresh_jobs where connection_id = $1 and idempotency_key_hash = $2`,
      [row.connection_id, keyHash])).rows[0]?.id;
    if (!effectiveJobId) throw new Error('source_refresh_job_missing');
    if (inserted.rowCount) await db.query(`insert into ap.outbox
      (id,organization_id,event_type,aggregate_id,payload)
      values ($1,$2,'knowledge.source.refresh_requested',$3,$4::jsonb)`,
    [randomUUID(), connection.ap_organization_id, effectiveJobId,
      JSON.stringify({ operationId: effectiveJobId, connectionId: row.connection_id,
        sourceEventId: row.source_event_id, expectedSourceRevision: current })]);
    await db.query(`update ap.field_facts_event_inbox set state = 'scheduled',
      refresh_job_id = $2,processed_at = now() where id = $1`, [row.id, effectiveJobId]);
    await db.query('commit'); return 'scheduled';
  } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
}
