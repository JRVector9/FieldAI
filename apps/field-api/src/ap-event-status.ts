import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { authorizedApConversationAccess } from './ap-connector.js';
import { unsealApEventSecret } from './integrator-routes.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Source = { organization_id: string; connection_id: string; action_request_id: string;
  source_deployment_id: string; initiator_user_id: string; connection_status: string;
  ap_issuer: string; event_key_id: string | null; event_secret_cipher: Buffer | null };
type LocalEvent = { id: string; revision: number; event_type: string; next_state: string;
  occurred_at: Date; delivery_state: string | null; attempts: number | null;
  acked_at: Date | null; last_http_status: number | null; last_error: string | null };
type ApState = { apState: string; apReceiptState: string | null;
  customerNotificationState: string | null; customerReadState: string | null;
  apProcessedAt: string | null };

function validApStatus(value: unknown, source: Source, reservationId: string, event: LocalEvent) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.eventId !== event.id || item.connectionId !== source.connection_id
    || item.actionRequestId !== source.action_request_id || item.reservationId !== reservationId
    || item.revision !== event.revision || item.receiptState !== 'received'
    || !['received', 'pending_gap', 'processed', 'rejected'].includes(String(item.processingState))
    || !['not_created', 'not_applicable', 'blocked_integration'].includes(String(item.customerNotificationState))
    || item.customerReadState !== 'not_recorded'
    || (item.processedAt !== null && (typeof item.processedAt !== 'string'
      || !Number.isFinite(Date.parse(item.processedAt))))) return null;
  return { apState: item.processingState as string, apReceiptState: 'received',
    customerNotificationState: item.customerNotificationState as string,
    customerReadState: 'not_recorded', apProcessedAt: item.processedAt as string | null };
}

export function registerApEventStatusRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get<{ Params: { id: string } }>('/v1/owner/reservations/:id/event-deliveries', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'reservation_not_found' });
    const source = await runtime.pool.query<Source>(
      `select w.organization_id,w.connection_id,w.action_request_id,w.source_deployment_id,
         c.initiator_user_id,c.status as connection_status,c.ap_issuer,
         c.event_key_id,c.event_secret_cipher
       from field.external_work_requests w
       join field.reservations r on r.id = w.reservation_id
         and r.organization_id = w.organization_id and r.source = 'external_ap'
       join field.ap_connections c on c.id = w.connection_id
         and c.organization_id = w.organization_id
       join field.memberships m on m.organization_id = w.organization_id
         and m.user_id = $2 and m.role = 'owner'
       where w.reservation_id = $1 and w.kind = 'reservation_request'`,
      [request.params.id, userId]);
    const connection = source.rows[0];
    if (!connection) return reply.code(404).send({ error: 'reservation_not_found' });
    const found = await runtime.pool.query<LocalEvent>(
      `select e.id,e.revision,e.event_type,e.next_state,e.occurred_at,
         d.state as delivery_state,d.attempts,d.acked_at,d.last_http_status,d.last_error
       from field.reservation_events e
       left join field.ap_event_deliveries d on d.event_id = e.id
         and d.connection_id = $2
       where e.reservation_id = $1 and e.organization_id = $3
       order by e.revision desc limit 21`,
      [request.params.id, connection.connection_id, connection.organization_id]);
    const page = found.rows.slice(0, 20).reverse();
    const remote = new Map<string, ApState>();
    const acknowledged = page.filter(event => event.delivery_state === 'acked');
    if (acknowledged.length && runtime.apConnector) {
      if (connection.connection_status === 'revoked') {
        let secret: Buffer | null = null;
        if (connection.ap_issuer === runtime.apConnector.issuer && connection.event_key_id
          && connection.event_secret_cipher) {
          try { secret = Buffer.from(unsealApEventSecret(connection.event_secret_cipher,
            runtime.apConnector.tokenKey), 'base64url'); }
          catch { /* The local ACK remains available when the recovery key is unavailable. */ }
        }
        if (secret?.length === 32 && connection.event_key_id) {
          const config = runtime.apConnector;
          await Promise.all(acknowledged.map(async event => {
            let status: ApState = { apState: 'unavailable', apReceiptState: null,
              customerNotificationState: null, customerReadState: null, apProcessedAt: null };
            try {
              const target = new URL(`/integrations/v1/events/${event.id}/recovery-status`, config.issuer);
              if (target.protocol !== 'https:' && process.env.FIELD_PROFILE !== 'mock')
                throw new Error('insecure_recovery_route');
              const timestamp = String(Math.floor(Date.now() / 1000));
              const signature = createHmac('sha256', secret)
                .update(`${timestamp}.${event.id}.${connection.connection_id}.notification-status`)
                .digest('hex');
              const response = await (config.fetcher ?? fetch)(target, {
                headers: { 'x-key-id': connection.event_key_id!,
                  'x-connection-id': connection.connection_id, 'x-timestamp': timestamp,
                  'x-signature': signature }, signal: AbortSignal.timeout(4000),
              });
              if (response.ok) status = validApStatus(await response.json(), connection,
                request.params.id, event) ?? { ...status, apState: 'invalid_response' };
            } catch { /* No remote result is inferred from an unreachable AP. */ }
            remote.set(event.id, status);
          }));
        }
      } else if (connection.initiator_user_id === userId) {
        const access = await authorizedApConversationAccess(runtime, connection.organization_id, userId,
          connection.connection_id, connection.source_deployment_id, 'ap.conversations.read');
        if ('error' in access) {
          for (const event of acknowledged) remote.set(event.id, { apState: access.status === 403 || access.status === 409
            ? 'reauthorization_required' : 'unavailable', apReceiptState: null,
            customerNotificationState: null, customerReadState: null, apProcessedAt: null });
        } else {
        await Promise.all(acknowledged.map(async event => {
          let status: ApState = { apState: 'unavailable', apReceiptState: null,
            customerNotificationState: null, customerReadState: null, apProcessedAt: null };
          try {
            const response = await (runtime.apConnector?.fetcher ?? fetch)(
              `${access.resource}/events/${event.id}/delivery`, {
                headers: { authorization: `Bearer ${access.token}` }, signal: AbortSignal.timeout(4000),
              });
            if (response.status === 401 || response.status === 403)
              status = { ...status, apState: 'reauthorization_required' };
            else if (response.ok) status = validApStatus(await response.json(), connection,
              request.params.id, event) ?? { ...status, apState: 'invalid_response' };
          } catch { /* Keep local delivery evidence and show AP as unavailable. */ }
          remote.set(event.id, status);
        }));
        }
      }
    }
    return reply.header('Cache-Control', 'private, no-store').send({
      reservationId: request.params.id, hasEarlierEvents: found.rows.length > 20,
      events: page.map(event => ({ eventId: event.id, revision: event.revision,
        eventType: event.event_type, reservationState: event.next_state,
        occurredAt: event.occurred_at.toISOString(),
        deliveryState: event.delivery_state ?? 'pending_reconciliation',
        attempts: event.attempts ?? 0, acknowledgedAt: event.acked_at?.toISOString() ?? null,
        lastHttpStatus: event.last_http_status, lastError: event.last_error,
        ...(remote.get(event.id) ?? { apState: event.delivery_state === 'acked'
          ? 'unavailable' : 'not_requested', apReceiptState: null,
          customerNotificationState: null, customerReadState: null, apProcessedAt: null }) })),
    });
  });
}
