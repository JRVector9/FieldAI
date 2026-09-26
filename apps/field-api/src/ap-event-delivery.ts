import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';
import type { ApConnectorConfig } from './ap-connector.js';
import { unsealApEventSecret } from './integrator-routes.js';

type Claimed = { event_id: string; attempts: number };
type Source = { event_id: string; reservation_id: string; revision: number; event_type: string;
  next_state: string; detail: Record<string, unknown>; occurred_at: Date;
  connection_id: string; action_request_id: string; ap_issuer: string;
  event_key_id: string | null; event_secret_cipher: Buffer | null;
  route_generation: number | null; connection_status: string;
  field_actor_user_id: string | null; selection_actor: string | null;
  field_client_id: string | null; selection_client: string | null;
  revoked_at: Date | null };

export async function reconcileApEventDeliveries(pool: Pool): Promise<number> {
  const added = await pool.query(
    `insert into field.ap_event_deliveries(event_id,connection_id)
     select e.id,w.connection_id from field.reservation_events e
     join field.external_work_requests w on w.reservation_id = e.reservation_id
       and w.kind = 'reservation_request' and w.organization_id = e.organization_id
     join field.ap_connections c on c.id = w.connection_id and c.status = 'review_required'
     where e.notification_owner_product = 'ap' and e.route_generation = 1
       and exists (select 1 from field.outbox o
       where o.aggregate_id = e.reservation_id::text
         and o.event_type like 'field.reservation.%')
     on conflict (event_id) do nothing`,
  );
  return added.rowCount ?? 0;
}

export async function deliverApEventOnce(pool: Pool, config: ApConnectorConfig):
  Promise<'empty' | 'acked' | 'retry' | 'blocked'> {
  const selected = await pool.query<Claimed>(
    `with candidate as (
       select event_id from field.ap_event_deliveries
       where (state in ('pending','retry') and next_attempt_at <= now())
          or (state = 'sending' and lease_until <= now())
       order by next_attempt_at,created_at for update skip locked limit 1
     )
     update field.ap_event_deliveries d set state = 'sending', attempts = d.attempts + 1,
       lease_until = now() + interval '30 seconds',updated_at = now()
     from candidate where d.event_id = candidate.event_id
     returning d.event_id,d.attempts`,
  );
  const claim = selected.rows[0];
  if (!claim) return 'empty';
  const source = await pool.query<Source>(
    `select e.id as event_id,e.reservation_id,e.revision,e.event_type,e.next_state,
       e.detail,e.occurred_at,w.connection_id,w.action_request_id,c.ap_issuer,
       c.event_key_id,c.event_secret_cipher,c.route_generation,c.status as connection_status,
       c.field_actor_user_id,s.actor_user_id as selection_actor,
       c.field_client_id,s.client_id as selection_client,s.revoked_at
     from field.reservation_events e
     join field.external_work_requests w on w.reservation_id = e.reservation_id
     join field.ap_connections c on c.id = w.connection_id
     left join field.oauth_selections s on s.id::text = c.field_grant_id
     where e.id = $1 and w.kind = 'reservation_request'`, [claim.event_id]);
  const row = source.rows[0];
  const finish = async (state: 'acked' | 'retry' | 'blocked', status: number | null,
    error: string | null, retryAfter?: string | null) => {
    const seconds = retryAfter && /^[1-9][0-9]{0,3}$/.test(retryAfter)
      ? Math.min(3600, Number(retryAfter))
      : Math.ceil(Math.min(300, 2 ** Math.min(claim.attempts, 7)) * (0.75 + Math.random() / 2));
    await pool.query(`update field.ap_event_deliveries set state = $3,
       next_attempt_at = case when $3 = 'retry'
         then now() + ($6::text || ' seconds')::interval
         else next_attempt_at end,
       lease_until = null,acked_at = case when $3 = 'acked' then now() else acked_at end,
       last_http_status = $4,last_error = $5,updated_at = now()
       where event_id = $1 and attempts = $2 and state = 'sending'`,
    [claim.event_id, claim.attempts, state, status, error, seconds]);
    return state;
  };
  if (!row || row.connection_status !== 'review_required' || row.revoked_at
    || row.ap_issuer !== config.issuer || !row.event_key_id || !row.event_secret_cipher
    || row.route_generation !== 1 || !row.field_actor_user_id || !row.field_client_id
    || row.field_actor_user_id !== row.selection_actor
    || row.field_client_id !== row.selection_client)
    return finish('blocked', null, 'event_route_unavailable');
  const target = new URL('/integrations/v1/field-events', config.issuer);
  if (target.protocol !== 'https:' && process.env.FIELD_PROFILE !== 'mock')
    return finish('blocked', null, 'insecure_event_route');
  let secret: Buffer;
  try { secret = Buffer.from(unsealApEventSecret(row.event_secret_cipher, config.tokenKey), 'base64url'); }
  catch { return finish('blocked', null, 'event_secret_unreadable'); }
  if (secret.length !== 32) return finish('blocked', null, 'invalid_event_secret');
  const data = { resource_id: row.reservation_id, status: row.next_state,
    ...(typeof row.detail.startAt === 'string' ? { start_at: row.detail.startAt } : {}),
    ...(typeof row.detail.endAt === 'string' ? { end_at: row.detail.endAt } : {}) };
  const raw = Buffer.from(JSON.stringify({ spec_version: '1.0', event_id: row.event_id,
    event_type: row.event_type, source_product: 'field', connection_id: row.connection_id,
    aggregate_type: 'reservation', aggregate_id: row.reservation_id,
    aggregate_version: row.revision, occurred_at: row.occurred_at.toISOString(),
    correlation_id: row.action_request_id, notification_owner_product: 'ap',
    route_generation: row.route_generation, data }));
  if (raw.length > 65_536) return finish('blocked', null, 'event_body_too_large');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.${row.event_id}.`), raw])).digest('hex');
  let response: Response;
  try { response = await (config.fetcher ?? fetch)(target, { method: 'POST',
    headers: { 'content-type': 'application/vnd.field-event+json',
      'x-event-id': row.event_id, 'x-key-id': row.event_key_id,
      'x-timestamp': timestamp, 'x-signature': signature },
    body: raw, signal: AbortSignal.timeout(8000) }); }
  catch { return finish('retry', null, 'delivery_unknown'); }
  if (response.status === 202) return finish('acked', 202, null);
  if ([400, 401, 403, 409, 413].includes(response.status))
    return finish('blocked', response.status, 'receiver_rejected');
  return finish('retry', response.status, 'receiver_unavailable',
    response.status === 429 ? response.headers.get('retry-after') : null);
}
