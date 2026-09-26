import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { BusinessRuntime } from './business.js';
import { unsealFieldEventSecret } from './field-connector.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type CloseBody = { transferId: string; connectionId: string; actionRequestId: string;
  reservationId: string; latestRevision: number; latestEventId: string; routeGeneration: 2 };
type Closure = { transfer_id: string; connection_id: string; action_request_id: string;
  reservation_id: string; latest_revision: number; latest_event_id: string;
  route_generation: number; closed_at: Date };
function parseBody(value: unknown): CloseBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 7 || Object.keys(body).some(key => ![
    'transferId', 'connectionId', 'actionRequestId', 'reservationId', 'latestRevision',
    'latestEventId', 'routeGeneration'].includes(key))
    || !uuid.test(String(body.transferId)) || !uuid.test(String(body.connectionId))
    || !uuid.test(String(body.actionRequestId)) || !uuid.test(String(body.reservationId))
    || !uuid.test(String(body.latestEventId)) || !Number.isSafeInteger(body.latestRevision)
    || Number(body.latestRevision) < 0 || body.routeGeneration !== 2) return null;
  return body as CloseBody;
}
function response(row: Closure) {
  return { transferId: row.transfer_id, connectionId: row.connection_id,
    actionRequestId: row.action_request_id, reservationId: row.reservation_id,
    latestRevision: row.latest_revision, latestEventId: row.latest_event_id,
    routeGeneration: row.route_generation, closedAt: row.closed_at.toISOString() };
}

export function registerFieldNotificationRouteClose(app: FastifyInstance, runtime: BusinessRuntime) {
  app.post('/integrations/v1/notification-routes/close', async (request, reply) => {
    const body = parseBody(request.body);
    if (!body) return reply.code(400).send({ error: 'invalid_route_close_body' });
    const keyId = request.headers['x-key-id'];
    const timestamp = request.headers['x-timestamp'];
    const signature = request.headers['x-signature'];
    if (typeof keyId !== 'string' || !uuid.test(keyId)
      || typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp)
      || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
      || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature))
      return reply.code(401).send({ error: 'invalid_route_close_signature' });
    const config = runtime.fieldConnector;
    if (!config) return reply.code(503).send({ error: 'blocked_integration' });
    const selected = await runtime.pool.query<{ event_secret_cipher: Buffer }>(
      `select event_secret_cipher from ap.field_connections
       where id = $1 and event_key_id = $2 and status = 'revoked'
         and event_secret_cipher is not null`, [body.connectionId, keyId]);
    const connection = selected.rows[0];
    if (!connection) return reply.code(401).send({ error: 'invalid_route_close_signature' });
    let secret: Buffer;
    try { secret = Buffer.from(unsealFieldEventSecret(connection.event_secret_cipher,
      config.tokenKey), 'base64url'); }
    catch { return reply.code(503).send({ error: 'route_close_key_unavailable' }); }
    if (secret.length !== 32) return reply.code(503).send({ error: 'route_close_key_unavailable' });
    const signed = `${timestamp}.${body.transferId}.${body.connectionId}.${body.actionRequestId}`
      + `.${body.reservationId}.${body.latestRevision}.${body.latestEventId}.route-close`;
    const expected = createHmac('sha256', secret).update(signed).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      return reply.code(401).send({ error: 'invalid_route_close_signature' });

    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const action = await db.query<{ id: string }>(
        `select a.id from ap.field_action_requests a
         join ap.field_connections c on c.id = a.connection_id
           and c.status = 'revoked' and c.ap_organization_id = a.organization_id
         where a.id = $1 and a.connection_id = $2 and a.reservation_id = $3
           and a.state = 'accepted_external' for update of a`,
        [body.actionRequestId, body.connectionId, body.reservationId]);
      if (!action.rows[0]) {
        await db.query('rollback'); return reply.code(404).send({ error: 'route_close_target_not_found' });
      }
      const prior = await db.query<Closure>(
        `select * from ap.field_notification_route_closures
         where action_request_id = $1 for update`, [body.actionRequestId]);
      if (prior.rows[0]) {
        const row = prior.rows[0];
        if (row.transfer_id !== body.transferId || row.connection_id !== body.connectionId
          || row.reservation_id !== body.reservationId || row.latest_revision !== body.latestRevision
          || row.latest_event_id !== body.latestEventId) {
          await db.query('rollback'); return reply.code(409).send({ error: 'route_already_closed' });
        }
        await db.query('commit');
        return reply.header('Cache-Control', 'no-store').send(response(row));
      }
      const mirror = await db.query<{ id: string; revision: number; event_type: string;
        notification_state: string | null; delivery_unresolved: boolean }>(
        `select e.field_event_id as id,e.revision,e.event_type,n.state as notification_state,
           exists(select 1 from ap.notification_deliveries d where d.notification_id=n.id
             and d.started_at is not null and d.state not in ('sent','failed')) as delivery_unresolved
         from ap.field_reservation_events e
         left join ap.notification_events n on n.field_reservation_event_id = e.id
           and n.audience = 'customer'
         where e.action_request_id = $1 and e.reservation_id = $2
           and e.route_generation = 1 order by e.revision`,
        [body.actionRequestId, body.reservationId]);
      const noticeEvents = new Set(['field.reservation.proposed', 'field.reservation.confirmed',
        'field.reservation.changed', 'field.reservation.canceled', 'field.reservation.reject',
        'field.reservation.expire', 'field.reservation.decline_cancel',
        'field.reservation.decline_change']);
      const complete = mirror.rows.length === body.latestRevision + 1
        && mirror.rows.every((row, index) => row.revision === index
          && (noticeEvents.has(row.event_type)
            ? !row.delivery_unresolved && ['blocked_integration','not_applicable','blocked_limit','sent','failed'].includes(row.notification_state ?? '')
            : row.notification_state === null))
        && mirror.rows.at(-1)?.id === body.latestEventId;
      const pending = await db.query<{ count: string }>(
        `select count(*)::text as count from ap.field_event_inbox
         where action_request_id = $1 and connection_id = $2 and reservation_id = $3
           and (revision > $4 or state <> 'processed')`,
        [body.actionRequestId, body.connectionId, body.reservationId, body.latestRevision]);
      if (!complete || pending.rows[0]?.count !== '0') {
        await db.query('rollback'); return reply.code(409).send({ error: 'route_close_not_reconciled' });
      }
      const saved = await db.query<Closure>(
        `insert into ap.field_notification_route_closures
         (transfer_id,connection_id,action_request_id,reservation_id,latest_revision,
          latest_event_id,route_generation)
         values ($1,$2,$3,$4,$5,$6,2) returning *`,
        [body.transferId, body.connectionId, body.actionRequestId, body.reservationId,
          body.latestRevision, body.latestEventId]);
      await db.query('commit');
      return reply.header('Cache-Control', 'no-store').send(response(saved.rows[0]!));
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
