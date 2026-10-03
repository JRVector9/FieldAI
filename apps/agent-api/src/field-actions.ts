import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';
import { fieldResourceForCustomer, type CustomerFieldResource } from './field-connector.js';
import { registerFieldCustomerDecisionRoutes } from './field-customer-decisions.js';
import { rejectExpiredTrial } from './trial-access.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyPattern = /^[A-Za-z0-9_-]{43}$/;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => JSON.stringify(value,
  (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry);
const bodyHash = (value: unknown) => hash(canonical(value));
async function fieldSubmitError(response: Response) {
  if (response.status === 409) return 'service_conditions_changed';
  if (response.status === 403) {
    try {
      if (object(await response.json())?.error === 'trial_ended') return 'field_subscription_ended';
    } catch { /* An invalid Field error body is an authorization failure. */ }
    return 'field_reauthorization_required';
  }
  return 'field_request_rejected';
}
function receiptHash(request: FastifyRequest) {
  const key = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization ?? '')?.[1];
  return key ? hash(key) : null;
}
type Inquiry = { id: string; organization_id: string; customer_name: string;
  customer_phone: string; deployment_id: string };
async function inquiryFor(runtime: BusinessRuntime, id: string, secretHash: string) {
  const found = await runtime.pool.query<Inquiry>(
    `select id,organization_id,customer_name,customer_phone,deployment_id
     from ap.inquiries where id = $1 and visitor_key_hash = $2 and consent_at is not null`,
    [id, secretHash]);
  return found.rows[0] ?? null;
}
function validRequest(value: unknown) {
  const item = object(value);
  if (!item || typeof item.timezone !== 'string' || item.timezone.length > 100) return null;
  if (item.mode === 'inquiry' && Object.keys(item).every(key => ['mode', 'timezone'].includes(key))) return item;
  if (item.mode === 'preferred' && typeof item.preferredTimeText === 'string'
    && item.preferredTimeText.trim() && item.preferredTimeText.length <= 500
    && Object.keys(item).every(key => ['mode', 'preferredTimeText', 'timezone'].includes(key))) return item;
  if (item.mode === 'slot' && typeof item.startAt === 'string'
    && !Number.isNaN(Date.parse(item.startAt))
    && Object.keys(item).every(key => ['mode', 'startAt', 'timezone'].includes(key))) return item;
  return null;
}
type Availability = { organizationId: string; catalogRevision: number; policyRevision: number;
  timezone: string; service: { id: string; name: string; description: string;
    bookingMode: 'slot' | 'request'; durationMinutes: number; priceAmount: number | null };
  date: string | null; slots: { startAt: string; endAt: string }[] };
function validAvailability(value: unknown, organizationId: string, serviceId: string): Availability | null {
  const data = object(value);
  const service = object(data?.service);
  if (!data || data.organizationId !== organizationId
    || !Number.isSafeInteger(data.catalogRevision) || Number(data.catalogRevision) < 1
    || !Number.isSafeInteger(data.policyRevision) || Number(data.policyRevision) < 1
    || typeof data.timezone !== 'string' || !service || service.id !== serviceId
    || typeof service.name !== 'string' || typeof service.description !== 'string'
    || !['slot', 'request'].includes(String(service.bookingMode))
    || !Number.isSafeInteger(service.durationMinutes)
    || (service.priceAmount !== null && (!Number.isSafeInteger(service.priceAmount)
      || Number(service.priceAmount) < 0)) || !Array.isArray(data.slots)) return null;
  return data as Availability;
}
function dayInZone(instant: string, zone: string): string | null {
  try {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: zone,
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  } catch { return null; }
}
async function currentTerms(grant: Extract<CustomerFieldResource, { ok: true }>,
  serviceId: string, details: Record<string, unknown>) {
  const url = new URL(`${grant.apiUrl}/availability`);
  url.searchParams.set('serviceId', serviceId);
  if (details.mode === 'slot') {
    const day = dayInZone(String(details.startAt), String(details.timezone));
    if (!day) return { error: 'invalid_request', statusCode: 400 } as const;
    url.searchParams.set('date', day);
  }
  let response: Response;
  try { response = await grant.transport(url, {
    headers: { authorization: `Bearer ${grant.access}` }, signal: AbortSignal.timeout(8000),
  }); } catch { return { error: 'field_availability_unknown', statusCode: 503 } as const; }
  if (!response.ok) return { error: response.status === 403 ? 'field_reauthorization_required'
    : 'field_availability_unavailable', statusCode: response.status === 403 ? 403 : 503 } as const;
  let availability: Availability | null;
  try { availability = validAvailability(await response.json(), grant.fieldOrganizationId, serviceId); }
  catch { availability = null; }
  if (!availability) return { error: 'invalid_field_availability', statusCode: 502 } as const;
  if (availability.timezone !== details.timezone
    || (details.mode === 'slot' && (availability.service.bookingMode !== 'slot'
      || !availability.slots.some(slot => slot.startAt === details.startAt)))
    || (details.mode === 'preferred' && availability.service.bookingMode !== 'request'))
    return { error: 'service_conditions_changed', statusCode: 409 } as const;
  const conditionsHash = bodyHash({ organizationId: grant.fieldOrganizationId,
    catalogRevision: availability.catalogRevision, policyRevision: availability.policyRevision,
    service: availability.service, timezone: availability.timezone, request: details });
  return { availability, conditionsHash } as const;
}
export type Action = { id: string; organization_id: string; inquiry_id: string; state: string;
  kind: 'inquiry' | 'reservation_request';
  input_hash: string; external_request_id: string | null;
  reservation_id: string | null; error_code: string | null; connection_id: string;
  field_request_body: Record<string, unknown>; field_body_hash: string;
  service_snapshot: { name: string; priceAmount: number | null }; created_at: Date };
function status(row: Action) {
  return { actionRequestId: row.id, kind: row.kind, state: row.state,
    externalRequestId: row.external_request_id, reservationId: row.reservation_id,
    error: row.error_code, serviceName: row.service_snapshot.name,
    priceAmount: row.service_snapshot.priceAmount, createdAt: row.created_at };
}
export type ReservationEvent = { eventId: string; revision: number; eventType: string; state: string;
  occurredAt: string; customerNotificationOwnerProduct: 'ap'; routeGeneration: number;
  startAt?: string; endAt?: string };
export const customerNoticeEvents = new Set(['field.reservation.proposed', 'field.reservation.confirmed',
  'field.reservation.changed', 'field.reservation.canceled', 'field.reservation.reject',
  'field.reservation.expire', 'field.reservation.decline_cancel', 'field.reservation.decline_change']);
// Field 알림 경로 조회 결과. owner/allowed/reason은 Field 계약 값이고, 조회 실패는 route_unknown이다.
// transient는 일시 장애(시간 초과·5xx·/me 확인 불가)로 확인하지 못한 경우이며, 이때는 생략을 기록하지 않고 다음 동기화에서 다시 확인한다.
// cause는 Field를 부르기 전 AP 쪽에서 막힌 원인이다. blocked_integration은 커넥터 미설정(transient와 함께),
// connection_not_available은 AP 연결 조건 불충족(배포 일시중지·동의·owner 멤버십·refresh token 만료 등, 404)이다.
// sync 경로는 cause와 무관하게 기존대로 다루고, push 수신함은 cause로 미루기 여부와 오류 코드를 정한다.
// route_unresolved는 push 수신함이 기한(24시간) 안에 경로를 확인하지 못해 닫을 때만 쓴다.
export type FieldNotificationRoute = { owner: 'ap' | 'field' | null; allowed: boolean;
  reason: 'ap_route_generation_1' | 'route_transfer_pending' | 'field_route_active'
    | 'field_route_suspended' | 'route_unknown' | 'route_unresolved'; transient?: true;
  cause?: 'blocked_integration' | 'connection_not_available' };
const unknownRoute: FieldNotificationRoute = { owner: null, allowed: false, reason: 'route_unknown' };
const transientRoute: FieldNotificationRoute = { ...unknownRoute, transient: true };
// Field 계약의 사유별 owner·allowed 조합(external-request-public-routes 알림 경로 응답). 그 밖의 조합은 route_unknown이다(추가, P2-4)
const routeCombinations: Record<string, { owner: 'ap' | 'field'; allowed: boolean }> = {
  ap_route_generation_1: { owner: 'ap', allowed: true },
  route_transfer_pending: { owner: 'ap', allowed: false },
  field_route_active: { owner: 'field', allowed: false },
  field_route_suspended: { owner: 'field', allowed: false },
};
// 고객 알림을 만들기 직전에 Field 알림 경로를 확인한다. scope가 없는 연결은 확인할 수 없으므로 null(기존 세대 1 AP 규칙)을,
// 확인 시도가 실패하면 이중 발송을 막기 위해 route_unknown을 돌려준다.
export async function readFieldNotificationRoute(runtime: BusinessRuntime, inquiryId: string,
  secretHash: string, action: Pick<Action, 'connection_id' | 'external_request_id' | 'reservation_id'>):
  Promise<FieldNotificationRoute | null> {
  const grant = await fieldResourceForCustomer(runtime, inquiryId, secretHash,
    action.connection_id, 'field.notification_route.read');
  if (!grant.ok) return grant.statusCode === 403 ? null
    : grant.statusCode === 503 ? (grant.error === 'blocked_integration'
      ? { ...transientRoute, cause: 'blocked_integration' } : transientRoute)
    : { ...unknownRoute, cause: 'connection_not_available' };
  let response: Response;
  try {
    response = await grant.transport(
      `${grant.apiUrl}/external-requests/${action.external_request_id}/notification-route`,
      { headers: { authorization: `Bearer ${grant.access}` }, signal: AbortSignal.timeout(8000) });
  } catch { return transientRoute; }
  if (response.status >= 500 || response.status === 429) return transientRoute;
  try {
    const data = response.ok ? object(await response.json()) : null;
    // owner∈{ap,field}·allowed boolean·reason 문자열(64자 이하)을 확인한 뒤 사유와 owner·allowed 조합이 계약과 같은지 본다
    const combination = typeof data?.reason === 'string' && data.reason.length <= 64
      && Object.hasOwn(routeCombinations, data.reason) ? routeCombinations[data.reason] : undefined;
    if (!data || data.externalRequestId !== action.external_request_id
      || data.reservationId !== action.reservation_id
      || (data.owner !== 'ap' && data.owner !== 'field') || ![1, 2].includes(Number(data.generation))
      || typeof data.allowed !== 'boolean' || !combination
      || combination.owner !== data.owner || combination.allowed !== data.allowed) return unknownRoute;
    return { owner: data.owner, allowed: data.allowed,
      reason: data.reason as FieldNotificationRoute['reason'] };
  } catch { return unknownRoute; }
}
export async function recordFieldReservationEvent(db: PoolClient,
  action: Pick<Action, 'id' | 'organization_id' | 'inquiry_id' | 'connection_id' | 'reservation_id'>,
  event: ReservationEvent, route?: FieldNotificationRoute | null) {
  const eventId = randomUUID();
  const outboxId = randomUUID();
  // 경로를 확인했고 AP 발송이 허용되지 않으면(Field 담당·전환 대기·확인 불가) AP 고객 알림을 만들지 않는다
  const skipReason = route && !(route.owner === 'ap' && route.allowed) ? route.reason : null;
  await db.query(`insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload)
    values ($1,$2,'ap.field_reservation.event_recorded',$3,$4::jsonb)`,
  [outboxId, action.organization_id, action.id, JSON.stringify({ actionRequestId: action.id,
    fieldEventId: event.eventId, connectionId: action.connection_id,
    reservationId: action.reservation_id, revision: event.revision,
    eventType: event.eventType, state: event.state, routeGeneration: event.routeGeneration,
    // field_reservation_events 행과 같은 값(Field 사건이 선언한 담당 제품). 실제 생략 여부는 notification_events.suppression_reason에 남긴다
    notificationOwnerProduct: 'ap' })]);
  await db.query(`insert into ap.field_reservation_events
    (id,organization_id,action_request_id,field_event_id,reservation_id,revision,
     event_type,state,occurred_at,route_generation,customer_notification_owner_product,
     start_at,end_at,outbox_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ap',$11,$12,$13)`,
  [eventId, action.organization_id, action.id, event.eventId, action.reservation_id,
    event.revision, event.eventType, event.state, event.occurredAt, event.routeGeneration,
    event.startAt ?? null, event.endAt ?? null, outboxId]);
  if (customerNoticeEvents.has(event.eventType))
    await db.query(`insert into ap.notification_events
      (id,organization_id,outbox_id,inquiry_id,field_reservation_event_id,audience,channel,state,
       suppression_reason)
      values ($1,$2,$3,$4,$5,'customer','kakao',$6,$7)`,
    [randomUUID(), action.organization_id, outboxId, action.inquiry_id, eventId,
      skipReason ? 'not_applicable' : 'blocked_integration', skipReason]);
}
function reservationFeed(value: unknown, action: Action, fieldOrganizationId: string):
  { state: string; revision: number; events: ReservationEvent[] } | null {
  const data = object(value);
  if (!data || data.actionRequestId !== action.id || data.connectionId !== action.connection_id
    || data.organizationId !== fieldOrganizationId
    || data.externalRequestId !== action.external_request_id || data.reservationId !== action.reservation_id
    || !Number.isSafeInteger(data.revision) || Number(data.revision) < 0
    || typeof data.state !== 'string' || !Array.isArray(data.events)
    || data.events.length !== Number(data.revision) + 1 || data.events.length > 1000) return null;
  const events: ReservationEvent[] = [];
  const ids = new Set<string>();
  for (const [revision, value] of data.events.entries()) {
    const event = object(value);
    if (!event || !uuid.test(String(event.eventId)) || ids.has(String(event.eventId))
      || event.revision !== revision || typeof event.eventType !== 'string'
      || !/^field\.reservation\.[a-z_]+$/.test(event.eventType)
      || typeof event.state !== 'string' || event.state.length > 60
      || typeof event.occurredAt !== 'string' || !Number.isFinite(Date.parse(event.occurredAt))
      || event.customerNotificationOwnerProduct !== 'ap' || event.routeGeneration !== 1
      || (event.startAt !== undefined && (typeof event.startAt !== 'string'
        || !Number.isFinite(Date.parse(event.startAt))))
      || (event.endAt !== undefined && (typeof event.endAt !== 'string'
        || !Number.isFinite(Date.parse(event.endAt))))) return null;
    ids.add(event.eventId as string);
    events.push({ eventId: event.eventId as string, revision,
      eventType: event.eventType, state: event.state, occurredAt: event.occurredAt,
      customerNotificationOwnerProduct: 'ap', routeGeneration: 1,
      ...(typeof event.startAt === 'string' ? { startAt: event.startAt } : {}),
      ...(typeof event.endAt === 'string' ? { endAt: event.endAt } : {}) });
  }
  if (events[0]?.eventType !== 'field.reservation.requested'
    || events.at(-1)?.state !== data.state) return null;
  return { state: data.state, revision: data.revision as number, events };
}

async function mirrorReservationEvents(runtime: BusinessRuntime, action: Action,
  feed: { state: string; revision: number; events: ReservationEvent[] },
  route?: FieldNotificationRoute | null) {
  const db = await runtime.pool.connect();
  try {
    await db.query('begin');
    const locked = await db.query<Action>(
      `select * from ap.field_action_requests where id = $1 and inquiry_id = $2
       and state = 'accepted_external' for update`, [action.id, action.inquiry_id]);
    if (!locked.rows[0] || locked.rows[0].external_request_id !== action.external_request_id
      || locked.rows[0].reservation_id !== action.reservation_id) {
      await db.query('rollback'); return { error: 'field_action_changed' } as const;
    }
    const previous = await db.query<{ field_event_id: string; revision: number; event_type: string;
      state: string; route_generation: number; occurred_at: Date;
      start_at: Date | null; end_at: Date | null }>(
      `select field_event_id,revision,event_type,state,route_generation,occurred_at,start_at,end_at
       from ap.field_reservation_events where action_request_id = $1 order by revision`, [action.id]);
    if (previous.rows.length > feed.events.length || previous.rows.some((row, index) => {
      const current = feed.events[index];
      return !current || row.field_event_id !== current.eventId || row.revision !== current.revision
        || row.event_type !== current.eventType || row.state !== current.state
        || row.route_generation !== current.routeGeneration
        || row.occurred_at.getTime() !== Date.parse(current.occurredAt)
        || row.start_at?.getTime() !== (current.startAt ? Date.parse(current.startAt) : undefined)
        || row.end_at?.getTime() !== (current.endAt ? Date.parse(current.endAt) : undefined);
    })) { await db.query('rollback'); return { error: 'field_event_conflict' } as const; }
    for (const event of feed.events.slice(previous.rows.length))
      await recordFieldReservationEvent(db, action, event, route);
    await db.query('commit');
    return { ok: true } as const;
  } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
}
async function advanceAction(runtime: BusinessRuntime, actionId: string, next: string,
  externalRequestId: string | null = null, reservationId: string | null = null,
  errorCode: string | null = null): Promise<Action> {
  const db = await runtime.pool.connect();
  try {
    await db.query('begin');
    const found = await db.query<Action>(
      'select * from ap.field_action_requests where id = $1 for update', [actionId]);
    const current = found.rows[0];
    if (!current) throw new Error('field_action_disappeared');
    if (!['sending', 'delivery_unknown'].includes(current.state) || current.state === next) {
      await db.query('commit'); return current;
    }
    const updated = await db.query<Action>(
      `update ap.field_action_requests set state = $2, external_request_id = $3,
         reservation_id = $4, error_code = $5, updated_at = now()
       where id = $1 returning *`,
      [actionId, next, externalRequestId, reservationId, errorCode]);
    await db.query(`insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload)
      values ($1,$2,$3,$4,$5::jsonb)`,
    [randomUUID(), current.organization_id, `ap.field_action.${next}`, actionId,
      JSON.stringify({ actionRequestId: actionId, inquiryId: current.inquiry_id,
        connectionId: current.connection_id, state: next,
        ...(externalRequestId ? { externalRequestId, reservationId } : {}) })]);
    await db.query('commit');
    return updated.rows[0]!;
  } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
}
function receipt(value: unknown, actionId: string) {
  const row = object(value);
  return row && row.requestId === actionId && row.status === 'requested'
    && uuid.test(String(row.externalRequestId))
    && (row.reservationId === null || uuid.test(String(row.reservationId)))
    ? { externalRequestId: row.externalRequestId as string,
      reservationId: row.reservationId as string | null } : null;
}

export function registerFieldActionRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get<{ Params: { id: string } }>('/v1/inquiries/:id/field-services', async (request, reply) => {
    const secretHash = receiptHash(request);
    if (!secretHash) return reply.code(401).send({ error: 'receipt_key_required' });
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const inquiry = await inquiryFor(runtime, request.params.id, secretHash);
    if (!inquiry) return reply.code(401).send({ error: 'invalid_receipt_key' });
    const found = await runtime.pool.query<{ id: string }>(
      `select c.id from ap.field_connections c
       join ap.oauth_selections s on s.id = c.ap_grant_id
       where c.ap_organization_id = $1 and c.status = 'review_required'
         and s.revoked_at is null and s.allowed_deployment_ids @> array[$2::uuid]
       order by c.created_at desc limit 20`, [inquiry.organization_id, inquiry.deployment_id]);
    const connections: Record<string, unknown>[] = [];
    for (const row of found.rows) {
      const grant = await fieldResourceForCustomer(runtime, inquiry.id, secretHash,
        row.id, 'field.facts.read');
      if (!grant.ok) {
        connections.push({ connectionId: row.id, state: grant.error, services: [] });
        continue;
      }
      try {
        const response = await grant.transport(`${grant.apiUrl}/facts`, {
          headers: { authorization: `Bearer ${grant.access}` }, signal: AbortSignal.timeout(8000),
        });
        const facts = response.ok ? object(await response.json()) : null;
        if (!facts || facts.organizationId !== grant.fieldOrganizationId
          || typeof facts.businessName !== 'string' || !Array.isArray(facts.services))
          throw new Error('invalid_field_facts');
        const services = facts.services.map(object);
        if (services.some(service => !service || !uuid.test(String(service.id))
          || typeof service.name !== 'string' || typeof service.description !== 'string'))
          throw new Error('invalid_field_services');
        connections.push({ connectionId: row.id, fieldOrganizationId: grant.fieldOrganizationId,
          businessName: facts.businessName, state: 'available',
          services: services.map(service => ({ id: service!.id,
            name: service!.name, description: service!.description,
            bookingMode: service!.bookingMode })) });
      } catch { connections.push({ connectionId: row.id, state: 'field_facts_unavailable', services: [] }); }
    }
    return reply.header('Cache-Control', 'private, no-store').send({ connections });
  });

  app.get<{ Params: { id: string; connectionId: string; serviceId: string } }>(
    '/v1/inquiries/:id/field-connections/:connectionId/services/:serviceId/availability',
    async (request, reply) => {
      const secretHash = receiptHash(request);
      if (!secretHash) return reply.code(401).send({ error: 'receipt_key_required' });
      if (!uuid.test(request.params.id) || !uuid.test(request.params.connectionId)
        || !uuid.test(request.params.serviceId))
        return reply.code(404).send({ error: 'service_not_found' });
      const inquiry = await inquiryFor(runtime, request.params.id, secretHash);
      if (!inquiry) return reply.code(401).send({ error: 'invalid_receipt_key' });
      const query = request.query as Record<string, unknown>;
      if (query.date !== undefined && (typeof query.date !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/.test(query.date)))
        return reply.code(400).send({ error: 'invalid_availability_date' });
      const grant = await fieldResourceForCustomer(runtime, inquiry.id, secretHash,
        request.params.connectionId, 'field.availability.read');
      if (!grant.ok) return reply.code(grant.statusCode).send({ error: grant.error });
      const url = new URL(`${grant.apiUrl}/availability`);
      url.searchParams.set('serviceId', request.params.serviceId);
      if (typeof query.date === 'string') url.searchParams.set('date', query.date);
      try {
        const response = await grant.transport(url, {
          headers: { authorization: `Bearer ${grant.access}` }, signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return reply.code(response.status === 400 ? 400 : 503)
          .send({ error: 'field_availability_unavailable' });
        const current = validAvailability(await response.json(), grant.fieldOrganizationId,
          request.params.serviceId);
        if (!current) return reply.code(502).send({ error: 'invalid_field_availability' });
        return reply.header('Cache-Control', 'private, no-store').send(current);
      } catch { return reply.code(503).send({ error: 'field_availability_unknown' }); }
    });

  app.get<{ Params: { id: string } }>('/v1/inquiries/:id/field-actions', async (request, reply) => {
    const secretHash = receiptHash(request);
    if (!secretHash) return reply.code(401).send({ error: 'receipt_key_required' });
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const inquiry = await inquiryFor(runtime, request.params.id, secretHash);
    if (!inquiry) return reply.code(401).send({ error: 'invalid_receipt_key' });
    const result = await runtime.pool.query<Action>(
      `select * from ap.field_action_requests where inquiry_id = $1 order by created_at desc limit 20`,
      [inquiry.id]);
    return reply.header('Cache-Control', 'private, no-store').send({ actions: result.rows.map(status) });
  });

  app.post<{ Params: { id: string; actionId: string } }>(
    '/v1/inquiries/:id/field-actions/:actionId/sync-events', async (request, reply) => {
      const secretHash = receiptHash(request);
      if (!secretHash) return reply.code(401).send({ error: 'receipt_key_required' });
      if (!uuid.test(request.params.id) || !uuid.test(request.params.actionId))
        return reply.code(404).send({ error: 'field_action_not_found' });
      const inquiry = await inquiryFor(runtime, request.params.id, secretHash);
      if (!inquiry) return reply.code(401).send({ error: 'invalid_receipt_key' });
      const found = await runtime.pool.query<Action>(
        `select * from ap.field_action_requests where id = $1 and inquiry_id = $2`,
        [request.params.actionId, inquiry.id]);
      const action = found.rows[0];
      if (!action) return reply.code(404).send({ error: 'field_action_not_found' });
      if (action.state !== 'accepted_external' || action.kind !== 'reservation_request'
        || !action.reservation_id || !action.external_request_id)
        return reply.code(409).send({ error: 'field_reservation_not_accepted' });
      const grant = await fieldResourceForCustomer(runtime, inquiry.id, secretHash,
        action.connection_id, 'field.requests.read');
      if (!grant.ok) return reply.code(grant.statusCode).send({ error: grant.error });
      let response: Response;
      try {
        response = await grant.transport(`${grant.apiUrl}/external-requests/by-source/${action.id}/events`, {
          headers: { authorization: `Bearer ${grant.access}` }, signal: AbortSignal.timeout(8000),
        });
      } catch { return reply.code(503).send({ error: 'field_events_unknown' }); }
      if (!response.ok) return reply.code(response.status === 403 ? 403 : response.status === 404 ? 409 : 503)
        .send({ error: response.status === 403 ? 'field_reauthorization_required'
          : response.status === 404 ? 'field_reservation_mismatch' : 'field_events_unavailable' });
      let feed: ReturnType<typeof reservationFeed>;
      try { feed = reservationFeed(await response.json(), action, grant.fieldOrganizationId); }
      catch { feed = null; }
      if (!feed) return reply.code(502).send({ error: 'invalid_field_events' });
      // 새로 기록할 고객 알림 사건이 있을 때만 Field 알림 경로를 트랜잭션 밖에서 미리 확인한다
      const mirroredCount = Number((await runtime.pool.query<{ count: string }>(
        'select count(*)::text as count from ap.field_reservation_events where action_request_id = $1',
        [action.id])).rows[0]?.count ?? 0);
      const route = feed.events.slice(mirroredCount).some(event => customerNoticeEvents.has(event.eventType))
        ? await readFieldNotificationRoute(runtime, inquiry.id, secretHash, action) : null;
      // 일시 장애로 경로를 확인하지 못하면 사건을 미러링하지 않는다(생략 영구 기록 금지). 다음 동기화가 경로를 다시 확인한다
      if (route?.transient) return reply.code(503).send({ error: 'route_unknown' });
      const mirrored = await mirrorReservationEvents(runtime, action, feed, route);
      if ('error' in mirrored) return reply.code(409).send({ error: mirrored.error });
      const stored = await runtime.pool.query<{ field_event_id: string; revision: number;
        event_type: string; state: string; occurred_at: Date; start_at: Date | null;
        end_at: Date | null; notification_state: string | null }>(
        `select e.field_event_id,e.revision,e.event_type,e.state,e.occurred_at,
          e.start_at,e.end_at,n.state as notification_state
         from ap.field_reservation_events e
         left join ap.notification_events n on n.field_reservation_event_id = e.id
         where e.action_request_id = $1 order by e.revision`, [action.id]);
      return reply.header('Cache-Control', 'private, no-store').send({
        actionRequestId: action.id, reservationId: action.reservation_id,
        state: feed.state, revision: feed.revision,
        events: stored.rows.map(event => ({ eventId: event.field_event_id,
          revision: event.revision, eventType: event.event_type, state: event.state,
          occurredAt: event.occurred_at.toISOString(),
          notificationState: event.notification_state ?? 'not_applicable',
          ...(event.start_at ? { startAt: event.start_at.toISOString() } : {}),
          ...(event.end_at ? { endAt: event.end_at.toISOString() } : {}) })),
      });
    });

  app.post<{ Params: { id: string; actionId: string } }>(
    '/v1/inquiries/:id/field-actions/:actionId/handoff', async (request, reply) => {
      const secretHash = receiptHash(request);
      if (!secretHash) return reply.code(401).send({ error: 'receipt_key_required' });
      if (!uuid.test(request.params.id) || !uuid.test(request.params.actionId))
        return reply.code(404).send({ error: 'field_action_not_found' });
      const inquiry = await inquiryFor(runtime, request.params.id, secretHash);
      if (!inquiry) return reply.code(401).send({ error: 'invalid_receipt_key' });
      const found = await runtime.pool.query<Action>(
        `select * from ap.field_action_requests where id = $1 and inquiry_id = $2`,
        [request.params.actionId, inquiry.id]);
      const action = found.rows[0];
      if (!action) return reply.code(404).send({ error: 'field_action_not_found' });
      if (action.state !== 'accepted_external' || action.kind !== 'reservation_request'
        || !action.external_request_id || !action.reservation_id)
        return reply.code(409).send({ error: 'field_reservation_not_accepted' });
      const grant = await fieldResourceForCustomer(runtime, inquiry.id, secretHash,
        action.connection_id, 'field.customer_access.create');
      if (!grant.ok) return reply.code(grant.statusCode).send({ error: grant.error });
      try {
        const response = await grant.transport(`${grant.apiUrl}/customer-handoffs`, {
          method: 'POST', headers: { authorization: `Bearer ${grant.access}`,
            'content-type': 'application/json' },
          body: JSON.stringify({ connectionId: action.connection_id, actionRequestId: action.id,
            externalRequestId: action.external_request_id, reservationId: action.reservation_id }),
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return reply.code(response.status === 403 ? 403
          : response.status === 429 ? 429 : response.status === 404 ? 409 : 503)
          .send({ error: response.status === 403 ? 'field_reauthorization_required'
            : response.status === 429 ? 'handoff_rate_limited'
              : response.status === 404 ? 'field_reservation_mismatch' : 'field_handoff_unavailable' });
        const data = object(await response.json());
        let destination: URL;
        try { destination = new URL(String(data?.handoffUrl)); }
        catch { return reply.code(502).send({ error: 'invalid_field_handoff' }); }
        if (response.status !== 201 || data?.reservationId !== action.reservation_id
          || typeof data.code !== 'string' || !keyPattern.test(data.code)
          || typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt))
          || destination.pathname !== '/handoff' || destination.search || destination.hash
          || destination.username || destination.password
          || (process.env.AP_PROFILE !== 'mock' && destination.protocol !== 'https:')
          || (process.env.AP_PROFILE === 'mock' && !['http:', 'https:'].includes(destination.protocol)))
          return reply.code(502).send({ error: 'invalid_field_handoff' });
        return reply.headers({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' })
          .code(201).send({ code: data.code, handoffUrl: destination.toString(),
            reservationId: action.reservation_id, expiresAt: data.expiresAt });
      } catch { return reply.code(503).send({ error: 'field_handoff_unknown' }); }
    });

  app.post<{ Params: { id: string } }>('/v1/inquiries/:id/field-availability', async (request, reply) => {
    const secretHash = receiptHash(request);
    if (!secretHash) return reply.code(401).send({ error: 'receipt_key_required' });
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const inquiry = await inquiryFor(runtime, request.params.id, secretHash);
    if (!inquiry) return reply.code(401).send({ error: 'invalid_receipt_key' });
    const body = object(request.body);
    const details = validRequest(body?.request);
    if (!body || !uuid.test(String(body.connectionId)) || !uuid.test(String(body.serviceId)) || !details)
      return reply.code(400).send({ error: 'invalid_availability_request' });
    const grant = await fieldResourceForCustomer(runtime, inquiry.id, secretHash,
      body.connectionId as string, 'field.availability.read');
    if (!grant.ok) return reply.code(grant.statusCode).send({ error: grant.error });
    const terms = await currentTerms(grant, body.serviceId as string, details);
    if (typeof terms.statusCode === 'number')
      return reply.code(terms.statusCode).send({ error: terms.error });
    return reply.header('Cache-Control', 'private, no-store').send({
      connectionId: body.connectionId, ...terms.availability,
      customer: { name: inquiry.customer_name, phone: inquiry.customer_phone },
      conditionsHash: terms.conditionsHash });
  });

  app.post<{ Params: { id: string } }>('/v1/inquiries/:id/field-actions', async (request, reply) => {
    const secretHash = receiptHash(request);
    if (!secretHash) return reply.code(401).send({ error: 'receipt_key_required' });
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const inquiry = await inquiryFor(runtime, request.params.id, secretHash);
    if (!inquiry) return reply.code(401).send({ error: 'invalid_receipt_key' });
    const body = object(request.body);
    const details = validRequest(body?.request);
    const attempt = request.headers['idempotency-key'];
    if (!body || !details || !uuid.test(String(body.connectionId)) || !uuid.test(String(body.serviceId))
      || !['inquiry', 'reservation_request'].includes(String(body.kind))
      || (body.kind === 'inquiry' ? details.mode !== 'inquiry' : details.mode === 'inquiry')
      || typeof body.summary !== 'string' || !body.summary.trim() || body.summary.length > 5000
      || !Number.isSafeInteger(body.expectedServiceRevision)
      || !Number.isSafeInteger(body.expectedPolicyRevision)
      || typeof body.conditionsHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.conditionsHash)
      || body.consent !== true || typeof attempt !== 'string' || !keyPattern.test(attempt))
      return reply.code(400).send({ error: 'invalid_field_action' });
    const attachmentIds = body.attachmentIds === undefined ? [] : body.attachmentIds;
    if (!Array.isArray(attachmentIds) || attachmentIds.length > 5
      || attachmentIds.some(id => typeof id !== 'string' || !uuid.test(id))
      || new Set(attachmentIds).size !== attachmentIds.length)
      return reply.code(400).send({ error: 'invalid_attachment_selection' });
    const inputHash = bodyHash(body);
    const attemptHash = hash(attempt);
    const old = await runtime.pool.query<Action>(
      `select * from ap.field_action_requests where inquiry_id = $1 and submission_key_hash = $2`,
      [inquiry.id, attemptHash]);
    if (old.rows[0]) return old.rows[0].input_hash === inputHash
      ? reply.header('Cache-Control', 'private, no-store').code(200).send(status(old.rows[0]))
      : reply.code(409).send({ error: 'idempotency_conflict' });
    const unresolved = await runtime.pool.query<{ id: string }>(
      `select id from ap.field_action_requests where inquiry_id = $1 and connection_id = $2
         and service_id = $3 and kind = $4 and state in ('sending','delivery_unknown','unresolved') limit 1`,
      [inquiry.id, body.connectionId, body.serviceId, body.kind]);
    if (unresolved.rows[0]) return reply.code(409).send({ error: 'prior_delivery_unknown',
      actionRequestId: unresolved.rows[0].id });
    if (await rejectExpiredTrial(reply, runtime.pool, inquiry.organization_id)) return reply;
    const grant = await fieldResourceForCustomer(runtime, inquiry.id, secretHash,
      body.connectionId as string, 'field.requests.create');
    if (!grant.ok) return reply.code(grant.statusCode).send({ error: grant.error });
    const terms = await currentTerms(grant, body.serviceId as string, details);
    if (typeof terms.statusCode === 'number')
      return reply.code(terms.statusCode).send({ error: terms.error });
    if (body.expectedServiceRevision !== terms.availability.catalogRevision
      || body.expectedPolicyRevision !== terms.availability.policyRevision
      || body.conditionsHash !== terms.conditionsHash)
      return reply.code(409).send({ error: 'service_conditions_changed' });
    if (attachmentIds.length) {
      const selected = await runtime.pool.query<{ id: string }>(
        `select p.id from ap.inquiry_attachments p
         join ap.inquiry_messages m on m.id = p.message_id and m.inquiry_id = p.inquiry_id
         where p.id = any($1::uuid[]) and p.inquiry_id = $2 and p.organization_id = $3
           and p.state = 'ready' and m.actor = 'customer'
           and m.visibility = 'customer'
           and m.delivery_state in ('blocked_integration','not_applicable')`,
        [attachmentIds, inquiry.id, inquiry.organization_id]);
      if (selected.rows.length !== attachmentIds.length)
        return reply.code(404).send({ error: 'attachment_not_found' });
    }
    const actionId = randomUUID();
    const consentId = randomUUID();
    const confirmedAt = new Date().toISOString();
    const fieldBody = { actionRequestId: actionId, connectionId: body.connectionId,
      kind: body.kind, originConversationId: inquiry.id, externalServiceId: body.serviceId,
      expectedServiceRevision: terms.availability.catalogRevision,
      expectedPolicyRevision: terms.availability.policyRevision,
      customer: { name: inquiry.customer_name, phone: inquiry.customer_phone, verified: false },
      request: details, summary: body.summary.trim(), attachmentRefs: attachmentIds,
      consent: { version: 'transfer-v1', recordId: consentId, confirmedAt,
        recipientProduct: 'field', recipientOrganizationId: grant.fieldOrganizationId,
        items: [...(body.kind === 'inquiry' ? ['name', 'phone', 'service', 'summary']
          : ['name', 'phone', 'service', 'requested_time']),
          ...(attachmentIds.length ? ['attachments'] : [])], conditionsHash: terms.conditionsHash },
      source: { provider: 'agent-platform', deploymentId: grant.deploymentId,
        isTest: process.env.AP_PROFILE === 'mock' } };
    const fieldHash = bodyHash(fieldBody);
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const inserted = await db.query<{ id: string }>(
        `insert into ap.field_action_requests
          (id,organization_id,inquiry_id,connection_id,submission_key_hash,input_hash,
           field_body_hash,field_request_body,kind,service_id,service_snapshot,
           consent_record_id,consent_confirmed_at,state)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12,$13,'sending')
         on conflict do nothing returning id`,
        [actionId, inquiry.organization_id, inquiry.id, body.connectionId,
          attemptHash, inputHash, fieldHash, JSON.stringify(fieldBody), body.kind,
          body.serviceId, JSON.stringify(terms.availability.service), consentId, confirmedAt]);
      if (!inserted.rows[0]) {
        await db.query('rollback');
        const existing = await runtime.pool.query<Action>(
          `select * from ap.field_action_requests where inquiry_id = $1 and submission_key_hash = $2`,
          [inquiry.id, attemptHash]);
        if (existing.rows[0]) return existing.rows[0].input_hash === inputHash
          ? reply.code(200).send(status(existing.rows[0]))
          : reply.code(409).send({ error: 'idempotency_conflict' });
        return reply.code(409).send({ error: 'prior_delivery_unknown' });
      }
      await db.query(`insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload)
        values ($1,$2,'ap.field_action.sending',$3,$4::jsonb)`,
        [randomUUID(), inquiry.organization_id, actionId,
          JSON.stringify({ actionRequestId: actionId, inquiryId: inquiry.id, connectionId: body.connectionId })]);
      await db.query('commit');
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
    let accepted: { externalRequestId: string; reservationId: string | null } | null = null;
    let errorCode: string | null = null;
    try {
      const response = await grant.transport(`${grant.apiUrl}/external-requests`, {
        method: 'POST', headers: { authorization: `Bearer ${grant.access}`,
          'content-type': 'application/json', 'x-body-sha256': fieldHash },
        body: JSON.stringify(fieldBody), signal: AbortSignal.timeout(8000),
      });
      if (response.status === 200 || response.status === 201) accepted = receipt(await response.json(), actionId);
      else if (response.status >= 400 && response.status < 500 && response.status !== 429)
        errorCode = await fieldSubmitError(response);
    } catch { /* Outcome is unknown until a by-source read. */ }
    const state = accepted ? 'accepted_external' : errorCode ? 'rejected' : 'delivery_unknown';
    const updated = await advanceAction(runtime, actionId, state,
      accepted?.externalRequestId ?? null, accepted?.reservationId ?? null, errorCode);
    return reply.header('Cache-Control', 'private, no-store')
      .code(updated.state === 'accepted_external' ? 201 : updated.state === 'rejected' ? 409 : 202)
      .send(status(updated));
  });

  app.post<{ Params: { id: string; actionId: string } }>(
    '/v1/inquiries/:id/field-actions/:actionId/reconcile', async (request, reply) => {
      const secretHash = receiptHash(request);
      if (!secretHash) return reply.code(401).send({ error: 'receipt_key_required' });
      if (!uuid.test(request.params.id) || !uuid.test(request.params.actionId))
        return reply.code(404).send({ error: 'field_action_not_found' });
      const inquiry = await inquiryFor(runtime, request.params.id, secretHash);
      if (!inquiry) return reply.code(401).send({ error: 'invalid_receipt_key' });
      const found = await runtime.pool.query<Action>(
        `select * from ap.field_action_requests where id = $1 and inquiry_id = $2`,
        [request.params.actionId, inquiry.id]);
      const action = found.rows[0];
      if (!action) return reply.code(404).send({ error: 'field_action_not_found' });
      // 운영자가 종결한 결과 미상(unresolved)도 종결 상태다. 다시 확인·재전송하지 않는다(추가)
      if (action.state === 'accepted_external' || action.state === 'rejected' || action.state === 'unresolved')
        return reply.header('Cache-Control', 'private, no-store').send(status(action));
      const grant = await fieldResourceForCustomer(runtime, inquiry.id, secretHash,
        action.connection_id, 'field.requests.read');
      if (!grant.ok) return reply.code(grant.statusCode).send({ error: grant.error });
      let external: { externalRequestId: string; reservationId: string | null } | null = null;
      try {
        const response = await grant.transport(
          `${grant.apiUrl}/external-requests/by-source/${action.id}`,
          { headers: { authorization: `Bearer ${grant.access}` }, signal: AbortSignal.timeout(8000) });
        if (response.ok) external = receipt(await response.json(), action.id);
        else if (response.status !== 404) return reply.code(202).send(status(action));
      } catch { return reply.code(202).send(status(action)); }
      if (!external) {
        // by-source 404는 Field 연결 상태 때문에도 나므로 미수신 증거가 아니다(계약: delivery_unknown은 새 업무 생성 금지).
        // 동의가 24시간을 넘으면 재전송하지 않고 결과 미상으로 유지해 고객 재제출로 중복 업무가 생기지 않게 한다
        const consent = object(action.field_request_body.consent);
        const confirmedAt = typeof consent?.confirmedAt === 'string'
          ? Date.parse(consent.confirmedAt) : NaN;
        if (!Number.isFinite(confirmedAt) || confirmedAt < Date.now() - 24 * 60 * 60_000)
          return reply.code(202).send(status(action));
        const writer = await fieldResourceForCustomer(runtime, inquiry.id, secretHash,
          action.connection_id, 'field.requests.create');
        if (!writer.ok) return reply.code(writer.statusCode).send({ error: writer.error });
        try {
          const response = await writer.transport(`${writer.apiUrl}/external-requests`, {
            method: 'POST', headers: { authorization: `Bearer ${writer.access}`,
              'content-type': 'application/json', 'x-body-sha256': action.field_body_hash },
            body: JSON.stringify(action.field_request_body), signal: AbortSignal.timeout(8000),
          });
          if (response.status === 200 || response.status === 201)
            external = receipt(await response.json(), action.id);
          else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            // 인증·연결·멱등 충돌 응답은 Field가 기존 요청을 확인하기 전에 나므로 결과 미상으로 유지한다.
            // 연결과 기존 요청 확인을 통과한 뒤의 명시 거절만 rejected로 기록한다
            const code = object(await response.clone().json().catch(() => null))?.error;
            if (response.status === 401 || (response.status === 403 && code !== 'trial_ended')
              || ['connection_not_found', 'connection_changed', 'idempotency_conflict'].includes(String(code)))
              return reply.code(202).send(status(action));
            const rejected = await advanceAction(runtime, action.id, 'rejected', null, null,
              await fieldSubmitError(response));
            return reply.code(409).send(status(rejected));
          }
        } catch { /* Keep the original action in unknown state. */ }
      }
      if (!external) return reply.code(202).send(status(action));
      const updated = await advanceAction(runtime, action.id, 'accepted_external',
        external.externalRequestId, external.reservationId);
      return reply.header('Cache-Control', 'private, no-store').send(status(updated));
    });

  // 고객의 Field 제안 조회·결정 경로(preview.9 소비)는 같은 확인키 규칙으로 함께 등록한다
  registerFieldCustomerDecisionRoutes(app, runtime);
}
