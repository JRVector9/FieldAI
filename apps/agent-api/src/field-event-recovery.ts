import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { BusinessRuntime } from './business.js';
import { unsealFieldEventSecret } from './field-connector.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerFieldEventRecoveryRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get<{ Params: { id: string } }>('/integrations/v1/events/:id/recovery-status', async (request, reply) => {
    const eventId = request.params.id;
    const keyId = request.headers['x-key-id'];
    const connectionId = request.headers['x-connection-id'];
    const timestamp = request.headers['x-timestamp'];
    const signature = request.headers['x-signature'];
    if (!uuid.test(eventId) || typeof keyId !== 'string' || !uuid.test(keyId)
      || typeof connectionId !== 'string' || !uuid.test(connectionId)
      || typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp)
      || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
      || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature))
      return reply.code(401).send({ error: 'invalid_recovery_signature' });
    const config = runtime.fieldConnector;
    if (!config) return reply.code(503).send({ error: 'blocked_integration' });
    const selected = await runtime.pool.query<{ event_secret_cipher: Buffer }>(
      `select event_secret_cipher from ap.field_connections
       where id = $1 and event_key_id = $2 and status = 'revoked'
         and event_secret_cipher is not null`, [connectionId, keyId]);
    const connection = selected.rows[0];
    if (!connection) return reply.code(401).send({ error: 'invalid_recovery_signature' });
    let secret: Buffer;
    try { secret = Buffer.from(unsealFieldEventSecret(connection.event_secret_cipher,
      config.tokenKey), 'base64url'); }
    catch { return reply.code(503).send({ error: 'recovery_key_unavailable' }); }
    if (secret.length !== 32) return reply.code(503).send({ error: 'recovery_key_unavailable' });
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${eventId}.${connectionId}.notification-status`).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      return reply.code(401).send({ error: 'invalid_recovery_signature' });
    const found = await runtime.pool.query<{ source_event_id: string; connection_id: string;
      action_request_id: string; reservation_id: string; revision: number;
      state: string; received_at: Date; processed_at: Date | null; error_code: string | null;
      notification_state: string }>(
      `select i.source_event_id,i.connection_id,i.action_request_id,i.reservation_id,
         i.revision,i.state,i.received_at,i.processed_at,i.error_code,
         case when e.id is null then 'not_created'
           when n.id is null then 'not_applicable' else n.state end as notification_state
       from ap.field_event_inbox i
       join ap.field_action_requests a on a.id = i.action_request_id
         and a.connection_id = i.connection_id and a.reservation_id = i.reservation_id
         and a.state = 'accepted_external'
       join ap.field_connections c on c.id = i.connection_id
         and c.id = $2 and c.status = 'revoked'
         and c.ap_organization_id = a.organization_id
       left join ap.field_reservation_events e on e.field_event_id = i.source_event_id
         and e.action_request_id = a.id and e.reservation_id = i.reservation_id
       left join ap.notification_events n on n.field_reservation_event_id = e.id
         and n.audience = 'customer'
       where i.source_product = 'field' and i.source_event_id = $1`,
      [eventId, connectionId]);
    const row = found.rows[0];
    if (!row) return reply.code(404).send({ error: 'event_not_found' });
    return reply.header('Cache-Control', 'no-store').send({
      eventId: row.source_event_id, connectionId: row.connection_id,
      actionRequestId: row.action_request_id, reservationId: row.reservation_id,
      revision: row.revision, receiptState: 'received', processingState: row.state,
      receivedAt: row.received_at.toISOString(), processedAt: row.processed_at?.toISOString() ?? null,
      processingError: row.error_code, customerNotificationState: row.notification_state,
      customerReadState: 'not_recorded',
    });
  });
}
