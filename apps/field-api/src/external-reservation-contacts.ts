import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Source = { id: string; organization_id: string; connection_status: string };
type Contact = { id: string; reservation_id: string; event_id: string;
  actor_user_id: string | null; method: 'phone' | 'in_person'; outcome: 'attempted' | 'reached';
  recorded_at: Date };
function response(row: Contact) {
  return { id: row.id, eventId: row.event_id, method: row.method,
    outcome: row.outcome, recordedAt: row.recorded_at.toISOString() };
}

export function registerExternalReservationContactRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  const path = '/v1/owner/reservations/:id/manual-contacts';
  app.get<{ Params: { id: string } }>(path, async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'reservation_not_found' });
    const source = await runtime.pool.query<Source>(
      `select r.id,r.organization_id,c.status as connection_status
       from field.reservations r
       join field.external_work_requests w on w.reservation_id = r.id
         and w.organization_id = r.organization_id and w.kind = 'reservation_request'
       join field.ap_connections c on c.id = w.connection_id
         and c.organization_id = r.organization_id
       join field.memberships m on m.organization_id = r.organization_id
         and m.user_id = $2 and m.role = 'owner'
       where r.id = $1 and r.source = 'external_ap'`, [request.params.id, userId]);
    if (!source.rows[0]) return reply.code(404).send({ error: 'reservation_not_found' });
    const contacts = await runtime.pool.query<Contact>(
      `select id,reservation_id,event_id,actor_user_id,method,outcome,recorded_at
       from field.external_reservation_manual_contacts
       where reservation_id = $1 and organization_id = $2
       order by recorded_at desc,id desc limit 100`, [request.params.id, source.rows[0].organization_id]);
    return reply.header('Cache-Control', 'private, no-store').send({
      reservationId: request.params.id, connectionStatus: source.rows[0].connection_status,
      contacts: contacts.rows.map(response),
    });
  });

  app.post<{ Params: { id: string } }>(path, async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'reservation_not_found' });
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return reply.code(400).send({ error: 'invalid_manual_contact' });
    const value = body as Record<string, unknown>;
    if (!uuid.test(String(value.contactAttemptId)) || !uuid.test(String(value.eventId))
      || !['phone', 'in_person'].includes(String(value.method))
      || !['attempted', 'reached'].includes(String(value.outcome))
      || Object.keys(value).some(key => !['contactAttemptId', 'eventId', 'method', 'outcome'].includes(key)))
      return reply.code(400).send({ error: 'invalid_manual_contact' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const source = await db.query<Source>(
        `select r.id,r.organization_id,c.status as connection_status
         from field.reservations r
         join field.external_work_requests w on w.reservation_id = r.id
           and w.organization_id = r.organization_id and w.kind = 'reservation_request'
         join field.ap_connections c on c.id = w.connection_id
           and c.organization_id = r.organization_id
         join field.memberships m on m.organization_id = r.organization_id
           and m.user_id = $2 and m.role = 'owner'
         where r.id = $1 and r.source = 'external_ap' for update of c`,
        [request.params.id, userId]);
      const reservation = source.rows[0];
      if (!reservation) {
        await db.query('rollback'); return reply.code(404).send({ error: 'reservation_not_found' });
      }
      if (reservation.connection_status !== 'revoked') {
        await db.query('rollback'); return reply.code(409).send({ error: 'connection_still_active' });
      }
      const event = await db.query<{ id: string }>(
        `select id from field.reservation_events
         where id = $1 and reservation_id = $2 and organization_id = $3`,
        [value.eventId, reservation.id, reservation.organization_id]);
      if (!event.rows[0]) {
        await db.query('rollback'); return reply.code(404).send({ error: 'reservation_event_not_found' });
      }
      const inserted = await db.query<Contact>(
        `insert into field.external_reservation_manual_contacts
          (id,organization_id,reservation_id,event_id,actor_user_id,method,outcome)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing
         returning id,reservation_id,event_id,actor_user_id,method,outcome,recorded_at`,
        [value.contactAttemptId, reservation.organization_id, reservation.id,
          value.eventId, userId, value.method, value.outcome]);
      const contact = inserted.rows[0];
      if (!contact) {
        const prior = await db.query<Contact>(
          `select id,reservation_id,event_id,actor_user_id,method,outcome,recorded_at
           from field.external_reservation_manual_contacts where id = $1`, [value.contactAttemptId]);
        const row = prior.rows[0];
        if (!row || row.reservation_id !== reservation.id || row.event_id !== value.eventId
          || row.actor_user_id !== userId || row.method !== value.method || row.outcome !== value.outcome) {
          await db.query('rollback'); return reply.code(409).send({ error: 'manual_contact_conflict' });
        }
        await db.query('commit');
        return reply.header('Cache-Control', 'private, no-store').send(response(row));
      }
      await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
        values ($1,$2,'field.reservation.manual_contact_recorded',$3,$4::jsonb)`, [randomUUID(),
        reservation.organization_id, reservation.id,
        JSON.stringify({ reservationId: reservation.id, eventId: value.eventId,
          contactAttemptId: contact.id, method: contact.method, outcome: contact.outcome })]);
      await db.query('commit');
      return reply.header('Cache-Control', 'private, no-store').code(201).send(response(contact));
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
