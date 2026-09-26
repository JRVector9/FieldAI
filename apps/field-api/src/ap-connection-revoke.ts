import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';
import type { ApConnectorConfig } from './ap-connector.js';
import { unsealApEventSecret } from './integrator-routes.js';

type Claim = { id: string; connection_id: string; attempts: number };
type Source = { ap_issuer: string; status: string; event_key_id: string | null;
  event_secret_cipher: Buffer | null };

export async function deliverApConnectionRevokeOnce(pool: Pool, config: ApConnectorConfig):
  Promise<'empty' | 'acked' | 'retry' | 'blocked'> {
  const selected = await pool.query<Claim>(
    `with candidate as (
       select id from field.ap_connection_revocations
       where (state in ('pending','retry') and next_attempt_at <= now())
          or (state = 'sending' and lease_until <= now())
       order by next_attempt_at,created_at for update skip locked limit 1
     )
     update field.ap_connection_revocations r set state = 'sending',attempts = r.attempts + 1,
       lease_until = now() + interval '30 seconds',updated_at = now()
     from candidate where r.id = candidate.id
     returning r.id,r.connection_id,r.attempts`);
  const claim = selected.rows[0];
  if (!claim) return 'empty';
  const found = await pool.query<Source>(
    `select ap_issuer,status,event_key_id,event_secret_cipher
     from field.ap_connections where id = $1`, [claim.connection_id]);
  const connection = found.rows[0];
  const finish = async (state: 'acked' | 'retry' | 'blocked', status: number | null,
    error: string | null) => {
    const seconds = Math.min(300, 2 ** Math.min(claim.attempts, 8));
    await pool.query(`update field.ap_connection_revocations set state = $3,
      next_attempt_at = case when $3 = 'retry'
        then now() + ($6::text || ' seconds')::interval else next_attempt_at end,
      lease_until = null,acknowledged_at = case when $3 = 'acked' then now() else acknowledged_at end,
      last_http_status = $4,last_error = $5,updated_at = now()
      where id = $1 and attempts = $2 and state = 'sending'`,
    [claim.id, claim.attempts, state, status, error, seconds]);
    return state;
  };
  if (!connection || connection.status !== 'revoked' || !connection.event_key_id
    || !connection.event_secret_cipher || connection.ap_issuer !== config.issuer)
    return finish('blocked', null, 'route_unavailable');
  const target = new URL(`/integrations/v1/connections/${claim.connection_id}/revoke`, config.issuer);
  if (target.protocol !== 'https:' && process.env.FIELD_PROFILE !== 'mock')
    return finish('blocked', null, 'insecure_revoke_route');
  let secret: Buffer;
  try { secret = Buffer.from(unsealApEventSecret(connection.event_secret_cipher,
    config.tokenKey), 'base64url'); }
  catch { return finish('blocked', null, 'route_key_unreadable'); }
  if (secret.length !== 32) return finish('blocked', null, 'invalid_route_key');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${claim.id}.${claim.connection_id}.revoke`).digest('hex');
  let response: Response;
  try {
    response = await (config.fetcher ?? fetch)(target, { method: 'POST',
      headers: { 'x-key-id': connection.event_key_id, 'x-revocation-id': claim.id,
        'x-timestamp': timestamp, 'x-signature': signature },
      signal: AbortSignal.timeout(8000) });
  } catch { return finish('retry', null, 'delivery_unknown'); }
  if (response.status === 200) {
    const body: unknown = await response.json().catch(() => null);
    if (body && typeof body === 'object' && !Array.isArray(body)
      && 'connectionId' in body && body.connectionId === claim.connection_id
      && 'revocationId' in body && body.revocationId === claim.id
      && 'status' in body && body.status === 'revoked') return finish('acked', 200, null);
    return finish('retry', 200, 'invalid_receiver_receipt');
  }
  if ([400, 401, 403, 404, 409].includes(response.status))
    return finish('blocked', response.status, 'receiver_rejected');
  return finish('retry', response.status, 'receiver_unavailable');
}
