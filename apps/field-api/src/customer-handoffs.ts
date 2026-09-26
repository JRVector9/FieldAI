import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { fieldIntegratorGrant } from './integrator-auth.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codePattern = /^[A-Za-z0-9_-]{43}$/;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function registerFieldCustomerHandoffRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.post('/integrations/v1/customer-handoffs', async (request, reply) => {
    const grant = await fieldIntegratorGrant(request, reply, runtime, 'field.customer_access.create');
    if (!grant) return reply;
    const body = object(request.body);
    if (!body || !uuid.test(String(body.connectionId)) || !uuid.test(String(body.actionRequestId))
      || !uuid.test(String(body.externalRequestId)) || !uuid.test(String(body.reservationId))
      || Object.keys(body).some(key => !['connectionId', 'actionRequestId',
        'externalRequestId', 'reservationId'].includes(key)))
      return reply.code(400).send({ error: 'invalid_customer_handoff' });
    const webOrigin = process.env.FIELD_PUBLIC_WEB_ORIGIN
      ?? (process.env.FIELD_PROFILE === 'mock' ? 'http://localhost:3002' : null);
    if (!webOrigin) return reply.code(503).send({ error: 'field_web_unavailable' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const found = await db.query<{ id: string }>(
        `select e.id from field.external_work_requests e
         join field.ap_connections c on c.id = e.connection_id
         join field.reservations r on r.id = e.reservation_id and r.organization_id = e.organization_id
         where e.id = $1 and e.action_request_id = $2 and e.connection_id = $3
           and e.reservation_id = $4 and e.kind = 'reservation_request'
           and e.organization_id = $5 and e.client_id = $6
           and e.field_grant_id = $7::uuid and r.source = 'external_ap'
           and c.organization_id = $5 and c.field_grant_id = $7::text
           and c.field_actor_user_id = $8 and c.field_client_id = $6
           and c.status = 'review_required'
         for update of r`,
        [body.externalRequestId, body.actionRequestId, body.connectionId, body.reservationId,
          grant.organization_id, grant.client_id, grant.id, grant.actor_user_id]);
      if (!found.rows[0]) {
        await db.query('rollback'); return reply.code(404).send({ error: 'external_reservation_not_found' });
      }
      const recent = await db.query<{ count: string }>(
        `select count(*)::text as count from field.customer_handoff_codes
         where reservation_id = $1 and issued_at > now() - interval '1 hour'`, [body.reservationId]);
      if (Number(recent.rows[0]?.count ?? 0) >= 5) {
        await db.query('rollback'); return reply.code(429).send({ error: 'handoff_rate_limited' });
      }
      const code = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 5 * 60_000);
      await db.query(`insert into field.customer_handoff_codes
        (id,code_hash,organization_id,external_request_id,reservation_id,expires_at)
        values ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), digest(code), grant.organization_id, body.externalRequestId,
        body.reservationId, expiresAt]);
      await db.query('commit');
      return reply.headers({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' })
        .code(201).send({ code, handoffUrl: new URL('/handoff', webOrigin).toString(),
          expiresAt: expiresAt.toISOString(), reservationId: body.reservationId });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.post('/v1/customer-handoffs/exchange', async (request, reply) => {
    const body = object(request.body);
    if (!body || typeof body.code !== 'string' || !codePattern.test(body.code)
      || Object.keys(body).some(key => key !== 'code'))
      return reply.code(400).send({ error: 'invalid_customer_handoff_code' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const codeHash = digest(body.code);
      const lookup = await db.query<{ reservation_id: string }>(
        'select reservation_id from field.customer_handoff_codes where code_hash = $1', [codeHash]);
      if (!lookup.rows[0]) {
        await db.query('rollback'); return reply.code(404).send({ error: 'handoff_not_found' });
      }
      const reservation = await db.query<{ id: string; source: string }>(
        'select id,source from field.reservations where id = $1 for update', [lookup.rows[0].reservation_id]);
      const found = await db.query<{ id: string; organization_id: string; reservation_id: string;
        used_at: Date | null; expires_at: Date }>(
        `select id,organization_id,reservation_id,used_at,expires_at
         from field.customer_handoff_codes where code_hash = $1 for update`, [codeHash]);
      const row = found.rows[0];
      if (!row || !reservation.rows[0]) {
        await db.query('rollback'); return reply.code(404).send({ error: 'handoff_not_found' });
      }
      if (row.used_at || row.expires_at.getTime() <= Date.now()
        || reservation.rows[0].source !== 'external_ap') {
        await db.query('rollback'); return reply.code(409).send({ error: 'handoff_unavailable' });
      }
      const receiptKey = randomBytes(32).toString('base64url');
      await db.query(`update field.reservations set visitor_key_hash = $2, updated_at = now()
        where id = $1`, [row.reservation_id, digest(receiptKey)]);
      await db.query(`update field.customer_handoff_codes set used_at = now()
        where reservation_id = $1 and used_at is null`, [row.reservation_id]);
      await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
        values ($1,$2,'field.customer_access.granted',$3,$4::jsonb)`,
      [randomUUID(), row.organization_id, row.reservation_id,
        JSON.stringify({ reservationId: row.reservation_id, handoffId: row.id })]);
      await db.query('commit');
      return reply.headers({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' })
        .send({ reservationId: row.reservation_id, receiptKey });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
