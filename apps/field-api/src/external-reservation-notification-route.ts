import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { unsealApEventSecret } from './integrator-routes.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const receiptPattern = /^[A-Za-z0-9_-]{43}$/;
const consentVersion = 'field-reservation-route-v1';
type Source = { reservation_id: string; organization_id: string; connection_id: string;
  visitor_key_hash: string | null; connection_status: string };
type Route = { state: 'consented' | 'withdrawn' | 'active' | 'suspended'; route_generation: number;
  customer_consent_id: string; customer_consented_at: Date; customer_withdrawn_at: Date | null;
  customer_withdrawal_id: string | null; activated_at: Date | null;
  activation_id: string | null; pending_transfer_id: string | null;
  pending_revision: number | null; pending_event_id: string | null;
  pending_customer_consent_id: string | null; pending_started_at: Date | null };

function receiptHash(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const key = header.slice(7);
  return receiptPattern.test(key) ? createHash('sha256').update(key).digest('hex') : null;
}
function authorized(source: Source | undefined, digest: string) {
  return !!source?.visitor_key_hash && timingSafeEqual(
    Buffer.from(source.visitor_key_hash, 'hex'), Buffer.from(digest, 'hex'));
}
function view(source: Source, route?: Route) {
  return { reservationId: source.reservation_id, connectionStatus: source.connection_status,
    state: route?.state ?? 'awaiting_consent', routeGeneration: route?.route_generation ?? 1,
    transferPending: !!route?.pending_transfer_id,
    customerConsentedAt: route?.customer_consented_at.toISOString() ?? null,
    customerWithdrawnAt: route?.customer_withdrawn_at?.toISOString() ?? null,
    activatedAt: route?.activated_at?.toISOString() ?? null };
}
async function sourceFor(db: Pick<PoolClient, 'query'>, reservationId: string, lock: boolean) {
  const found = await db.query<Source>(
    `select r.id as reservation_id,r.organization_id,r.visitor_key_hash,
       w.connection_id,c.status as connection_status
     from field.reservations r
     join field.external_work_requests w on w.reservation_id = r.id
       and w.organization_id = r.organization_id and w.kind = 'reservation_request'
     join field.ap_connections c on c.id = w.connection_id
       and c.organization_id = r.organization_id
     where r.id = $1 and r.source = 'external_ap'
     ${lock ? 'for update of r' : ''}`, [reservationId]);
  return found.rows[0];
}
async function routeFor(db: Pick<PoolClient, 'query'>, reservationId: string, lock: boolean) {
  const found = await db.query<Route>(
    `select state,route_generation,customer_consent_id,customer_consented_at,
       customer_withdrawn_at,customer_withdrawal_id,activated_at,activation_id,
       pending_transfer_id,pending_revision,pending_event_id,pending_customer_consent_id,
       pending_started_at
     from field.external_reservation_notification_routes where reservation_id = $1
     ${lock ? 'for update' : ''}`, [reservationId]);
  return found.rows[0];
}

export function registerExternalReservationNotificationRoute(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  const path = '/v1/reservations/:id/notification-route';
  app.get<{ Params: { id: string } }>(
    '/v1/owner/reservations/:id/notification-route', async (request, reply) => {
      const userId = await runtime.resolveUserId(request.headers);
      if (!userId) return reply.code(401).send({ error: 'authentication_required' });
      if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'reservation_not_found' });
      const found = await runtime.pool.query<Source & { revocation_acked: boolean }>(
        `select r.id as reservation_id,r.organization_id,r.visitor_key_hash,
           w.connection_id,c.status as connection_status,
           (exists(select 1 from field.ap_connection_revocations x
             where x.connection_id = c.id and x.state = 'acked')
            or exists(select 1 from field.ap_received_connection_revocations x
             where x.connection_id = c.id)) as revocation_acked
         from field.reservations r
         join field.external_work_requests w on w.reservation_id = r.id
           and w.organization_id = r.organization_id and w.kind = 'reservation_request'
         join field.ap_connections c on c.id = w.connection_id
         join field.memberships m on m.organization_id = r.organization_id
           and m.user_id = $2 and m.role = 'owner'
         where r.id = $1 and r.source = 'external_ap'`, [request.params.id, userId]);
      const source = found.rows[0];
      if (!source) return reply.code(404).send({ error: 'reservation_not_found' });
      const route = await routeFor(runtime.pool, request.params.id, false);
      return reply.header('Cache-Control', 'private, no-store').send({
        ...view(source, route), customerAccessAvailable: !!source.visitor_key_hash,
        revocationAcknowledged: source.revocation_acked,
        pendingTransferId: route?.pending_transfer_id ?? null,
        pendingRevision: route?.pending_revision ?? null,
        pendingStartedAt: route?.pending_started_at?.toISOString() ?? null });
    });
  app.get<{ Params: { id: string } }>(path, async (request, reply) => {
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'reservation_not_found' });
    const digest = receiptHash(request);
    if (!digest) return reply.code(401).send({ error: 'receipt_required' });
    const source = await sourceFor(runtime.pool, request.params.id, false);
    if (!authorized(source, digest)) return reply.code(404).send({ error: 'reservation_not_found' });
    const route = await routeFor(runtime.pool, request.params.id, false);
    return reply.header('Cache-Control', 'private, no-store').send(view(source!, route));
  });

  app.post<{ Params: { id: string } }>(`${path}/consent`, async (request, reply) => {
    const body = request.body;
    if (!uuid.test(request.params.id) || !body || typeof body !== 'object' || Array.isArray(body))
      return reply.code(400).send({ error: 'invalid_notification_route_consent' });
    const value = body as Record<string, unknown>;
    if (!uuid.test(String(value.consentId)) || value.consent !== true
      || Object.keys(value).some(key => !['consentId', 'consent'].includes(key)))
      return reply.code(400).send({ error: 'invalid_notification_route_consent' });
    const digest = receiptHash(request);
    if (!digest) return reply.code(401).send({ error: 'receipt_required' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const source = await sourceFor(db, request.params.id, true);
      if (!authorized(source, digest)) {
        await db.query('rollback'); return reply.code(404).send({ error: 'reservation_not_found' });
      }
      if (source!.connection_status !== 'revoked') {
        await db.query('rollback'); return reply.code(409).send({ error: 'connection_still_active' });
      }
      const prior = await routeFor(db, request.params.id, true);
      if (prior && prior.customer_consent_id === value.consentId
        && (prior.state === 'consented' || prior.state === 'active')) {
        await db.query('commit');
        return reply.header('Cache-Control', 'private, no-store').send(view(source!, prior));
      }
      if (prior && prior.state !== 'withdrawn') {
        await db.query('rollback'); return reply.code(409).send({ error: 'notification_route_consent_conflict' });
      }
      const saved = await db.query<Route>(prior
        ? `update field.external_reservation_notification_routes set
             state = 'consented',customer_consent_id = $2,
             customer_consented_at = now(),customer_withdrawn_at = null,customer_withdrawal_id = null,
             pending_customer_consent_id = case when pending_transfer_id is not null then $2::uuid else null end
           where reservation_id = $1 returning *`
        : `insert into field.external_reservation_notification_routes
             (reservation_id,organization_id,connection_id,state,customer_consent_id,
              customer_consent_version,customer_consented_at)
           values ($1,$3,$4,'consented',$2,$5,now()) returning *`,
      prior ? [request.params.id, value.consentId]
        : [request.params.id, value.consentId, source!.organization_id,
          source!.connection_id, consentVersion]);
      await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
        values ($1,$2,'field.reservation.notification_route_consented',$3,$4::jsonb)`,
      [randomUUID(), source!.organization_id, request.params.id,
        JSON.stringify({ reservationId: request.params.id, consentId: value.consentId,
          consentVersion })]);
      await db.query('commit');
      return reply.header('Cache-Control', 'private, no-store').code(201).send(view(source!, saved.rows[0]));
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.post<{ Params: { id: string } }>(`${path}/withdraw`, async (request, reply) => {
    const body = request.body;
    if (!uuid.test(request.params.id) || !body || typeof body !== 'object' || Array.isArray(body))
      return reply.code(400).send({ error: 'invalid_notification_route_withdrawal' });
    const value = body as Record<string, unknown>;
    if (!uuid.test(String(value.withdrawalId)) || value.confirm !== true
      || Object.keys(value).some(key => !['withdrawalId', 'confirm'].includes(key)))
      return reply.code(400).send({ error: 'invalid_notification_route_withdrawal' });
    const digest = receiptHash(request);
    if (!digest) return reply.code(401).send({ error: 'receipt_required' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const source = await sourceFor(db, request.params.id, true);
      if (!authorized(source, digest)) {
        await db.query('rollback'); return reply.code(404).send({ error: 'reservation_not_found' });
      }
      const prior = await routeFor(db, request.params.id, true);
      if (!prior) {
        await db.query('rollback'); return reply.code(409).send({ error: 'notification_route_consent_missing' });
      }
      if (prior.customer_withdrawal_id === value.withdrawalId) {
        await db.query('commit');
        return reply.header('Cache-Control', 'private, no-store').send(view(source!, prior));
      }
      if (prior.state === 'withdrawn' || prior.state === 'suspended') {
        await db.query('rollback'); return reply.code(409).send({ error: 'notification_route_withdrawal_conflict' });
      }
      const saved = await db.query<Route>(
        `update field.external_reservation_notification_routes set
           state = case when route_generation = 2 then 'suspended' else 'withdrawn' end,
           customer_withdrawn_at = now(),customer_withdrawal_id = $2
         where reservation_id = $1 returning *`, [request.params.id, value.withdrawalId]);
      await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
        values ($1,$2,'field.reservation.notification_route_withdrawn',$3,$4::jsonb)`,
      [randomUUID(), source!.organization_id, request.params.id,
        JSON.stringify({ reservationId: request.params.id, withdrawalId: value.withdrawalId })]);
      await db.query('commit');
      return reply.header('Cache-Control', 'private, no-store').send(view(source!, saved.rows[0]));
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.post<{ Params: { id: string } }>(
    '/v1/owner/reservations/:id/notification-route/activate', async (request, reply) => {
      const userId = await runtime.resolveUserId(request.headers);
      if (!userId) return reply.code(401).send({ error: 'authentication_required' });
      const body = request.body;
      if (!uuid.test(request.params.id) || !body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).length !== 1
        || !uuid.test(String((body as Record<string, unknown>).transferId)))
        return reply.code(400).send({ error: 'invalid_route_activation' });
      const requestedTransferId = (body as { transferId: string }).transferId;
      type ActivationSource = { organization_id: string; connection_id: string;
        action_request_id: string; connection_status: string; ap_issuer: string;
        event_key_id: string | null; event_secret_cipher: Buffer | null;
        visitor_key_hash: string | null; revision: number; revocation_acked: boolean };
      let source: ActivationSource;
      let event: { id: string; revision: number };
      let transferId: string;
      const config = runtime.apConnector;
      const prepare = await runtime.pool.connect();
      try {
        await prepare.query('begin');
        const selected = await prepare.query<ActivationSource>(
          `select r.organization_id,w.connection_id,w.action_request_id,
             c.status as connection_status,c.ap_issuer,c.event_key_id,c.event_secret_cipher,
             r.visitor_key_hash,r.revision,
             (exists(select 1 from field.ap_connection_revocations x
               where x.connection_id = c.id and x.state = 'acked')
              or exists(select 1 from field.ap_received_connection_revocations x
               where x.connection_id = c.id)) as revocation_acked
           from field.reservations r
           join field.external_work_requests w on w.reservation_id = r.id
             and w.organization_id = r.organization_id and w.kind = 'reservation_request'
           join field.ap_connections c on c.id = w.connection_id
             and c.organization_id = r.organization_id
           join field.memberships m on m.organization_id = r.organization_id
             and m.user_id = $2 and m.role = 'owner'
           where r.id = $1 and r.source = 'external_ap' for update of r`,
          [request.params.id, userId]);
        const candidate = selected.rows[0];
        if (!candidate) {
          await prepare.query('rollback'); return reply.code(404).send({ error: 'reservation_not_found' });
        }
        const route = await routeFor(prepare, request.params.id, true);
        if (route?.state === 'active' && route.activation_id === requestedTransferId) {
          await prepare.query('commit');
          return reply.header('Cache-Control', 'private, no-store').send({
            reservationId: request.params.id, state: 'active', routeGeneration: 2,
            transferId: requestedTransferId });
        }
        if (!route || route.state !== 'consented' || candidate.connection_status !== 'revoked'
          || !candidate.revocation_acked || !candidate.visitor_key_hash) {
          await prepare.query('rollback'); return reply.code(409).send({ error: 'route_activation_not_ready' });
        }
        if (!config || candidate.ap_issuer !== config.issuer || !candidate.event_key_id
          || !candidate.event_secret_cipher) {
          await prepare.query('rollback'); return reply.code(503).send({ error: 'route_close_unavailable' });
        }
        if (route.pending_transfer_id) {
          if (route.pending_customer_consent_id !== route.customer_consent_id
            || route.pending_revision === null || !route.pending_event_id) {
            await prepare.query('rollback'); return reply.code(409).send({ error: 'route_pending_consent_conflict' });
          }
          transferId = route.pending_transfer_id;
          event = { id: route.pending_event_id, revision: route.pending_revision };
        } else {
          const known = await prepare.query<{ id: string; revision: number;
            notification_owner_product: string; route_generation: number;
            delivery_state: string | null }>(
            `select e.id,e.revision,e.notification_owner_product,e.route_generation,
               d.state as delivery_state
             from field.reservation_events e
             left join field.ap_event_deliveries d on d.event_id = e.id
             where e.reservation_id = $1 and e.organization_id = $2 order by e.revision`,
            [request.params.id, candidate.organization_id]);
          if (known.rows.length !== candidate.revision + 1
            || known.rows.some((row, index) => row.revision !== index)) {
            await prepare.query('rollback');
            return reply.code(409).send({ error: 'reservation_event_revision_conflict' });
          }
          let last: typeof known.rows[number] | null = null;
          for (const row of known.rows) {
            if (row.notification_owner_product !== 'ap' || row.route_generation !== 1
              || row.delivery_state !== 'acked') break;
            last = row;
          }
          if (!last) {
            await prepare.query('rollback');
            return reply.code(409).send({ error: 'ap_reconciled_prefix_missing' });
          }
          transferId = requestedTransferId;
          event = last;
          await prepare.query(`update field.external_reservation_notification_routes
            set pending_transfer_id = $2,pending_revision = $3,pending_event_id = $4,
              pending_customer_consent_id = $5,pending_started_at = now()
            where reservation_id = $1`, [request.params.id, transferId, event.revision,
            event.id, route.customer_consent_id]);
        }
        source = candidate;
        await prepare.query('commit');
      } catch (error) { await prepare.query('rollback'); throw error; } finally { prepare.release(); }
      let secret: Buffer;
      try { secret = Buffer.from(unsealApEventSecret(source.event_secret_cipher!,
        config!.tokenKey), 'base64url'); }
      catch { return reply.code(503).send({ error: 'route_close_key_unavailable' }); }
      if (secret.length !== 32) return reply.code(503).send({ error: 'route_close_key_unavailable' });
      const closeBody = { transferId, connectionId: source.connection_id,
        actionRequestId: source.action_request_id, reservationId: request.params.id,
        latestRevision: event.revision, latestEventId: event.id, routeGeneration: 2 };
      const target = new URL('/integrations/v1/notification-routes/close', config!.issuer);
      if (target.protocol !== 'https:' && process.env.FIELD_PROFILE !== 'mock')
        return reply.code(503).send({ error: 'insecure_route_close' });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac('sha256', secret)
        .update(`${timestamp}.${transferId}.${source.connection_id}.${source.action_request_id}`
          + `.${request.params.id}.${event.revision}.${event.id}.route-close`).digest('hex');
      let remote: Response;
      try {
        remote = await (config!.fetcher ?? fetch)(target, { method: 'POST',
          headers: { 'content-type': 'application/json', 'x-key-id': source.event_key_id!,
            'x-timestamp': timestamp, 'x-signature': signature },
          body: JSON.stringify(closeBody), signal: AbortSignal.timeout(8000) });
      } catch { return reply.code(503).send({ error: 'route_close_result_unknown' }); }
      if (!remote.ok) return reply.code(remote.status === 409 ? 409 : 503)
        .send({ error: remote.status === 409 ? 'ap_events_not_reconciled' : 'route_close_unavailable' });
      let receipt: Record<string, unknown> | null = null;
      try { receipt = await remote.json() as Record<string, unknown>; } catch { /* invalid receipt */ }
      if (!receipt || Object.entries(closeBody).some(([key, value]) => receipt![key] !== value)
        || typeof receipt.closedAt !== 'string' || !Number.isFinite(Date.parse(receipt.closedAt)))
        return reply.code(503).send({ error: 'invalid_route_close_receipt' });
      const db = await runtime.pool.connect();
      try {
        await db.query('begin');
        const locked = await db.query<{ revision: number; visitor_key_hash: string | null;
          status: string; state: string; customer_consent_id: string;
          pending_transfer_id: string | null; pending_revision: number | null;
          pending_event_id: string | null; pending_customer_consent_id: string | null }>(
          `select r.revision,r.visitor_key_hash,c.status,n.state,n.customer_consent_id,
             n.pending_transfer_id,n.pending_revision,n.pending_event_id,
             n.pending_customer_consent_id
           from field.reservations r
           join field.ap_connections c on c.id = $2 and c.organization_id = r.organization_id
           join field.external_reservation_notification_routes n on n.reservation_id = r.id
           where r.id = $1 and r.organization_id = $3 for update of r,n`,
          [request.params.id, source.connection_id, source.organization_id]);
        const current = locked.rows[0];
        if (!current || current.revision < event.revision || !current.visitor_key_hash
          || current.status !== 'revoked' || current.state !== 'consented'
          || current.pending_transfer_id !== transferId || current.pending_revision !== event.revision
          || current.pending_event_id !== event.id
          || current.pending_customer_consent_id !== current.customer_consent_id) {
          await db.query('rollback'); return reply.code(409).send({ error: 'route_activation_snapshot_changed' });
        }
        const gap = await db.query<{ id: string; revision: number; notification_owner_product: string;
          route_generation: number; delivery_state: string | null; reached: boolean }>(
          `select e.id,e.revision,e.notification_owner_product,e.route_generation,
             d.state as delivery_state,
             exists(select 1 from field.external_reservation_manual_contacts m
               where m.reservation_id = e.reservation_id and m.event_id = e.id
                 and m.organization_id = e.organization_id and m.outcome = 'reached') as reached
           from field.reservation_events e
           left join field.ap_event_deliveries d on d.event_id = e.id
           where e.reservation_id = $1 and e.organization_id = $2
             and e.revision > $3 and e.revision <= $4 order by e.revision`,
          [request.params.id, source.organization_id, event.revision, current.revision]);
        if (gap.rows.length !== current.revision - event.revision
          || gap.rows.some((row, index) => row.revision !== event.revision + index + 1
            || row.route_generation !== 1
            || (row.notification_owner_product === 'none' && row.delivery_state !== null)
            || (row.notification_owner_product === 'ap'
              && row.delivery_state !== null && row.delivery_state !== 'blocked')
            || !['none', 'ap'].includes(row.notification_owner_product))) {
          await db.query('rollback'); return reply.code(409).send({ error: 'route_activation_gap_conflict' });
        }
        const unreached = gap.rows.filter(row => !row.reached).map(row => row.id);
        if (unreached.length) {
          await db.query('rollback'); return reply.code(409).send({
            error: 'post_snapshot_manual_contact_required', eventIds: unreached });
        }
        await db.query(`update field.external_reservation_notification_routes
          set state = 'active',route_generation = 2,activation_id = $2,
            activated_by_user_id = $3,activated_at = now(),
            ap_closed_revision = $4,ap_closed_event_id = $5,
            pending_transfer_id = null,pending_revision = null,pending_event_id = null,
            pending_customer_consent_id = null,pending_started_at = null
          where reservation_id = $1`,
          [request.params.id, transferId, userId, event.revision, event.id]);
        await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
          values ($1,$2,'field.reservation.notification_route_activated',$3,$4::jsonb)`,
          [randomUUID(), source.organization_id, request.params.id,
            JSON.stringify({ reservationId: request.params.id, transferId, routeGeneration: 2 })]);
        await db.query('commit');
        return reply.header('Cache-Control', 'private, no-store').send({
          reservationId: request.params.id, state: 'active', routeGeneration: 2, transferId });
      } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
    });
}
