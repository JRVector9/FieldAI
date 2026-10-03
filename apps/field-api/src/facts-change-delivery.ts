import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';
import type { ApConnectorConfig } from './ap-connector.js';
import { unsealApEventSecret } from './integrator-routes.js';
import { fieldToApSignature } from './ap-signature.js';

type Claim = { id: string; attempts: number };
type Source = { id: string; connection_id: string; catalog_release_id: string;
  revision: number; approved_at: Date; organization_id: string; ap_issuer: string;
  event_key_id: string | null; event_secret_cipher: Buffer | null;
  route_generation: number | null; connection_status: string; scopes: string[];
  field_actor_user_id: string | null; selection_actor: string | null;
  field_client_id: string | null; selection_client: string | null;
  revoked_at: Date | null };

export async function reconcileFactsChangeDeliveries(pool: Pool): Promise<number> {
  const inserted = await pool.query(`insert into field.facts_change_deliveries
      (id,connection_id,catalog_release_id)
    select gen_random_uuid(),c.id,r.id from field.ap_connections c
    join lateral (select id,revision,approved_at from field.catalog_releases
      where organization_id = c.organization_id order by revision desc limit 1) r on true
    where c.status = 'review_required' and c.event_key_id is not null
      and c.event_secret_cipher is not null and c.route_generation = 1
      and r.approved_at > c.created_at
      and c.scopes @> array['ap.sources.refresh']
      and exists (select 1 from field.outbox o where o.organization_id = c.organization_id
        and o.event_type = 'field.catalog.approved' and o.aggregate_id = r.id::text)
    on conflict (connection_id,catalog_release_id) do nothing`);
  return inserted.rowCount ?? 0;
}

export async function deliverFactsChangeOnce(pool: Pool, config: ApConnectorConfig):
  Promise<'empty' | 'acked' | 'retry' | 'blocked'> {
  const claim = (await pool.query<Claim>(`with candidate as (
      select id from field.facts_change_deliveries
      where (state in ('pending','retry') and next_attempt_at <= now())
         or (state = 'sending' and lease_until <= now())
      order by next_attempt_at,created_at for update skip locked limit 1
    ) update field.facts_change_deliveries d set state = 'sending',
      attempts = d.attempts + 1,lease_until = now() + interval '30 seconds',updated_at = now()
      from candidate where d.id = candidate.id returning d.id,d.attempts`)).rows[0];
  if (!claim) return 'empty';
  const finish = async (state: 'acked' | 'retry' | 'blocked', status: number | null,
    error: string | null, retryAfter?: string | null) => {
    const seconds = retryAfter && /^[1-9][0-9]{0,3}$/.test(retryAfter)
      ? Math.min(3600, Number(retryAfter))
      : Math.ceil(Math.min(300, 2 ** Math.min(claim.attempts, 7)) * (0.75 + Math.random() / 2));
    await pool.query(`update field.facts_change_deliveries set state = $3,
       next_attempt_at = case when $3 = 'retry'
         then now() + ($6::text || ' seconds')::interval else next_attempt_at end,
       lease_until = null,acked_at = case when $3 = 'acked' then now() else acked_at end,
       last_http_status = $4,last_error = $5,updated_at = now()
       where id = $1 and attempts = $2 and state = 'sending'`,
    [claim.id, claim.attempts, state, status, error, seconds]);
    return state;
  };
  const row = (await pool.query<Source>(`select d.id,d.connection_id,d.catalog_release_id,
      r.revision,r.approved_at,r.organization_id,c.ap_issuer,c.event_key_id,
      c.event_secret_cipher,c.route_generation,c.status as connection_status,c.scopes,
      c.field_actor_user_id,s.actor_user_id as selection_actor,
      c.field_client_id,s.client_id as selection_client,s.revoked_at
    from field.facts_change_deliveries d
    join field.catalog_releases r on r.id = d.catalog_release_id
    join field.ap_connections c on c.id = d.connection_id
      and c.organization_id = r.organization_id and r.approved_at > c.created_at
    left join field.oauth_selections s on s.id::text = c.field_grant_id
    where d.id = $1`, [claim.id])).rows[0];
  if (!row || row.connection_status !== 'review_required' || row.revoked_at
    || row.ap_issuer !== config.issuer || row.route_generation !== 1
    || !row.scopes.includes('ap.sources.refresh') || !row.event_key_id
    || !row.event_secret_cipher || !row.field_actor_user_id || !row.field_client_id
    || row.field_actor_user_id !== row.selection_actor
    || row.field_client_id !== row.selection_client)
    return finish('blocked', null, 'facts_event_route_unavailable');
  const target = new URL('/integrations/v1/field-events', config.issuer);
  if (target.protocol !== 'https:' && process.env.FIELD_PROFILE !== 'mock')
    return finish('blocked', null, 'insecure_event_route');
  let secret: Buffer;
  try { secret = Buffer.from(unsealApEventSecret(row.event_secret_cipher, config.tokenKey), 'base64url'); }
  catch { return finish('blocked', null, 'event_secret_unreadable'); }
  if (secret.length !== 32) return finish('blocked', null, 'invalid_event_secret');
  const raw = Buffer.from(JSON.stringify({ spec_version: '1.0', event_id: row.id,
    event_type: 'field.facts.changed', source_product: 'field', connection_id: row.connection_id,
    aggregate_type: 'facts', aggregate_id: row.catalog_release_id,
    aggregate_version: row.revision, occurred_at: row.approved_at.toISOString(),
    correlation_id: row.catalog_release_id, route_generation: row.route_generation,
    data: { resource_id: row.catalog_release_id, status: 'approved',
      source_revision: row.revision } }));
  const timestamp = String(Math.floor(Date.now() / 1000));
  // 발신 버전은 FIELD_EVENT_SIGNATURE_SEND_VERSION으로 정한다(기본 v2, v1은 전환 기간만).
  const signed = fieldToApSignature();
  const signature = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${signed.prefix}${timestamp}.${row.id}.`), raw])).digest('hex');
  let response: Response;
  try { response = await (config.fetcher ?? fetch)(target, { method: 'POST',
    headers: { 'content-type': 'application/vnd.field-event+json',
      'x-event-id': row.id, 'x-key-id': row.event_key_id,
      'x-timestamp': timestamp, ...signed.headers, 'x-signature': signature },
    body: raw, signal: AbortSignal.timeout(8000) }); }
  catch { return finish('retry', null, 'delivery_unknown'); }
  if (response.status === 202) return finish('acked', 202, null);
  if ([400, 401, 403, 409, 413].includes(response.status))
    return finish('blocked', response.status, 'receiver_rejected');
  return finish('retry', response.status, 'receiver_unavailable',
    response.status === 429 ? response.headers.get('retry-after') : null);
}
