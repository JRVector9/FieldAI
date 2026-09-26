import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { consumePublicSubmission } from './public-submission-limit.js';
import { fieldIntegratorGrant } from './integrator-auth.js';
import { rejectExpiredTrial } from './trial-access.js';
import { reservationAttachments } from './reservation-attachments.js';
import { decodeOwnerListCursor, encodeOwnerListCursor } from './owner-list-cursor.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type Hours = { open: string; close: string };
type Policy = {
  revision: number; timezone: string; weekly: Record<string, Hours>;
  closed_dates: string[]; special_dates: Record<string, Hours>;
  before_minutes: number; after_minutes: number; min_lead_minutes: number; horizon_days: number;
};
type Service = { id: string; name: string; description: string; bookingMode: 'request' | 'slot'; durationMinutes: number; priceAmount: number | null };
type Release = { revision: number; content: { services: Service[] } };
type Reservation = {
  id: string; organization_id: string; catalog_revision: number; service_id: string;
  service_snapshot: Service; booking_mode: 'request' | 'slot'; customer_name: string;
  customer_phone: string; visitor_key_hash: string | null; preferred_time_text: string | null;
  request_message: string | null; visit_region: string | null;
  requested_start_at: Date | null; confirmed_start_at: Date | null; confirmed_end_at: Date | null;
  proposal_start_at: Date | null; proposal_end_at: Date | null; proposal_accepted_at: Date | null;
  change_preferred_text: string | null; source: 'public' | 'owner_manual' | 'external_ap';
  submission_key_hash: string | null; submission_request_hash: string | null;
  timezone: string; state: string; revision: number; created_at: Date;
};
const obj = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const canonicalJson = (value: unknown): string => JSON.stringify(value,
  (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry);
const bodyHash = (value: unknown) => hash(canonicalJson(value));
const sqlError = (error: unknown, code: string) => obj(error)?.code === code;

function parseHours(value: unknown): Hours | null {
  const item = obj(value);
  if (!item || typeof item.open !== 'string' || typeof item.close !== 'string'
      || !timePattern.test(item.open) || !timePattern.test(item.close) || item.open === item.close) return null;
  return { open: item.open, close: item.close };
}
function parsePolicy(value: unknown): Omit<Policy, 'revision'> | null {
  const body = obj(value);
  if (!body || typeof body.timezone !== 'string' || body.timezone.length > 100) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: body.timezone }); } catch { return null; }
  const weekly = obj(body.weekly);
  if (!weekly || Object.keys(weekly).some(key => !weekdays.includes(key as typeof weekdays[number]))) return null;
  const parsedWeekly: Record<string, Hours> = {};
  for (const [key, entry] of Object.entries(weekly)) {
    const hours = parseHours(entry);
    if (!hours) return null;
    parsedWeekly[key] = hours;
  }
  const closed = body.closedDates ?? [];
  if (!Array.isArray(closed) || closed.length > 366 || closed.some(item => typeof item !== 'string' || !validDay(item))) return null;
  const special = obj(body.specialDates ?? {});
  if (!special || Object.keys(special).length > 366) return null;
  const parsedSpecial: Record<string, Hours> = {};
  for (const [key, entry] of Object.entries(special)) {
    const hours = parseHours(entry);
    if (!validDay(key) || !hours) return null;
    parsedSpecial[key] = hours;
  }
  if (Object.keys(parsedWeekly).length === 0 && Object.keys(parsedSpecial).length === 0) return null;
  if (!integer(body.beforeMinutes, 0, 1440) || !integer(body.afterMinutes, 0, 1440)
      || !integer(body.minLeadMinutes, 0, 43200) || !integer(body.horizonDays, 1, 365)) return null;
  return { timezone: body.timezone, weekly: parsedWeekly, closed_dates: closed as string[],
    special_dates: parsedSpecial, before_minutes: body.beforeMinutes, after_minutes: body.afterMinutes,
    min_lead_minutes: body.minLeadMinutes, horizon_days: body.horizonDays };
}
function validDay(value: string): boolean {
  if (!dayPattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function localParts(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}
function localToUtcCandidates(day: string, hhmm: string, zone: string): Date[] {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const [hour, minute] = hhmm.split(':').map(Number) as [number, number];
  const nominal = Date.UTC(year, month - 1, date, hour, minute);
  const offsets = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const sample = nominal + hours * 3_600_000;
    const parts = localParts(new Date(sample), zone);
    const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second));
    offsets.add(wall - sample);
  }
  return [...offsets].map(offset => new Date(nominal - offset)).filter(candidate => {
    const parts = localParts(candidate, zone);
    return `${parts.year}-${parts.month}-${parts.day}` === day
      && `${parts.hour}:${parts.minute}` === hhmm && parts.second === '00';
  }).sort((left, right) => left.getTime() - right.getTime());
}
function boundaryInstant(day: string, hhmm: string, zone: string, edge: 'open' | 'close'): Date | null {
  const [hour, minute] = hhmm.split(':').map(Number) as [number, number];
  const base = Date.parse(`${day}T00:00:00Z`) + (hour * 60 + minute) * 60_000;
  for (let shift = 0; shift <= 360; shift += 1) {
    const wall = new Date(base + shift * 60_000);
    const candidates = localToUtcCandidates(wall.toISOString().slice(0, 10),
      `${String(wall.getUTCHours()).padStart(2, '0')}:${String(wall.getUTCMinutes()).padStart(2, '0')}`, zone);
    if (candidates.length) return edge === 'open' ? candidates[0]! : candidates.at(-1)!;
  }
  return null;
}
function localDay(date: Date, zone: string) {
  const parts = localParts(date, zone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function iso(value: Date | null) { return value?.toISOString() ?? null; }
function publicReservation(row: Reservation) {
  return { id: row.id, organizationId: row.organization_id, catalogRevision: row.catalog_revision,
    service: row.service_snapshot, bookingMode: row.booking_mode, name: row.customer_name,
    phone: row.customer_phone, preferredTimeText: row.preferred_time_text,
    requestMessage: row.request_message, visitRegion: row.visit_region,
    requestedStartAt: iso(row.requested_start_at), confirmedStartAt: iso(row.confirmed_start_at),
    confirmedEndAt: iso(row.confirmed_end_at), proposalStartAt: iso(row.proposal_start_at),
    proposalEndAt: iso(row.proposal_end_at), proposalAcceptedAt: iso(row.proposal_accepted_at),
    changePreferredText: row.change_preferred_text, source: row.source,
    timezone: row.timezone, state: row.state,
    revision: row.revision, createdAt: row.created_at.toISOString() };
}
async function ownerOrganization(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime) {
  const userId = await runtime.resolveUserId(request.headers);
  if (!userId) { reply.code(401).send({ error: 'authentication_required' }); return null; }
  const header = request.headers['x-organization-id'];
  if (header !== undefined && (typeof header !== 'string' || !uuid.test(header))) {
    reply.code(400).send({ error: 'invalid_organization_id' }); return null;
  }
  const membership = await runtime.pool.query<{ organization_id: string }>(
    `select organization_id from field.memberships where user_id = $1 and role = 'owner'
       and ($2::uuid is null or organization_id = $2::uuid) order by created_at limit 1`, [userId, header ?? null],
  );
  if (!membership.rows[0]) { reply.code(404).send({ error: 'organization_not_found' }); return null; }
  return { id: membership.rows[0].organization_id, userId };
}
async function operatorOrganization(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime) {
  const userId = await runtime.resolveUserId(request.headers);
  if (!userId) { reply.code(401).send({ error: 'authentication_required' }); return null; }
  const header = request.headers['x-organization-id'];
  if (header !== undefined && (typeof header !== 'string' || !uuid.test(header))) {
    reply.code(400).send({ error: 'invalid_organization_id' }); return null;
  }
  const membership = await runtime.pool.query<{ organization_id: string }>(
    `select organization_id from field.memberships where user_id = $1 and role in ('owner', 'editor')
       and ($2::uuid is null or organization_id = $2::uuid) order by created_at limit 1`,
    [userId, header ?? null]);
  if (!membership.rows[0]) { reply.code(404).send({ error: 'organization_not_found' }); return null; }
  return { id: membership.rows[0].organization_id, userId };
}
async function policyFor(client: Pick<PoolClient, 'query'>, organizationId: string): Promise<Policy | null> {
  const result = await client.query<Policy>('select * from field.booking_policies where organization_id = $1', [organizationId]);
  return result.rows[0] ?? null;
}
async function releaseFor(client: Pick<PoolClient, 'query'>, organizationId: string): Promise<Release | null> {
  const result = await client.query<Release>(
    'select revision, content from field.catalog_releases where organization_id = $1 order by revision desc limit 1', [organizationId],
  );
  return result.rows[0] ?? null;
}
export async function availableSlots(client: Pick<PoolClient, 'query'>, organizationId: string, policy: Policy, service: Service,
  day: string, ignoreOccupancy = false, now = new Date()) {
  const today = localDay(now, policy.timezone);
  const maxDay = new Date(Date.parse(`${today}T00:00:00Z`) + policy.horizon_days * 86_400_000)
    .toISOString().slice(0, 10);
  if (day < today || day > maxDay || policy.closed_dates.includes(day)) return [];
  const minutes = (value: string) => {
    const [hour, minute] = value.split(':').map(Number) as [number, number];
    return hour * 60 + minute;
  };
  const hoursFor = (value: string) => {
    if (policy.closed_dates.includes(value)) return null;
    const weekday = weekdays[new Date(`${value}T12:00:00Z`).getUTCDay()];
    return policy.special_dates[value] ?? policy.weekly[weekday!] ?? null;
  };
  const previousDay = new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const hours = hoursFor(day);
  const previousHours = hoursFor(previousDay);
  const intervals: { open: number; close: number; openAt: Date; closeAt: Date }[] = [];
  if (hours) {
    const open = minutes(hours.open);
    const close = minutes(hours.close);
    const closingDay = close < open ? new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : day;
    const openAt = boundaryInstant(day, hours.open, policy.timezone, 'open');
    const closeAt = boundaryInstant(closingDay, hours.close, policy.timezone, 'close');
    if (openAt && closeAt && closeAt > openAt)
      intervals.push({ open, close: close < open ? close + 1440 : close, openAt, closeAt });
  }
  if (previousHours && minutes(previousHours.close) < minutes(previousHours.open)) {
    const openAt = boundaryInstant(previousDay, previousHours.open, policy.timezone, 'open');
    const closeAt = boundaryInstant(day, previousHours.close, policy.timezone, 'close');
    if (openAt && closeAt && closeAt > openAt)
      intervals.push({ open: 0, close: minutes(previousHours.close), openAt, closeAt });
  }
  if (intervals.length === 0) return [];
  const occupancy = ignoreOccupancy ? { rows: [] as { lower_at: Date; upper_at: Date }[] } : await client.query<{ lower_at: Date; upper_at: Date }>(
    `select lower(occupied) as lower_at, upper(occupied) as upper_at
     from field.occupancies where organization_id = $1
       and occupied && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
    [organizationId, new Date(Date.parse(`${day}T00:00:00Z`) - 3 * 86_400_000).toISOString(),
      new Date(Date.parse(`${day}T00:00:00Z`) + 4 * 86_400_000).toISOString()],
  );
  const slots: { startAt: string; endAt: string }[] = [];
  const seen = new Set<string>();
  for (const interval of intervals) {
    const first = Math.ceil(interval.open / 30) * 30;
    for (let minute = first; minute < 1440 && minute < interval.close; minute += 30) {
      const candidates = localToUtcCandidates(day,
        `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`, policy.timezone);
      for (const start of candidates) {
        if (start < interval.openAt || start.getTime() < now.getTime() + policy.min_lead_minutes * 60_000) continue;
        const end = new Date(start.getTime() + service.durationMinutes * 60_000);
        if (end > interval.closeAt) continue;
        const rangeStart = start.getTime() - policy.before_minutes * 60_000;
        const rangeEnd = end.getTime() + policy.after_minutes * 60_000;
        if (occupancy.rows.some(row => row.lower_at.getTime() < rangeEnd && row.upper_at.getTime() > rangeStart)) continue;
        const key = start.toISOString();
        if (!seen.has(key)) { seen.add(key); slots.push({ startAt: key, endAt: end.toISOString() }); }
      }
    }
  }
  return slots.sort((left, right) => left.startAt.localeCompare(right.startAt));
}

export async function integratorAvailability(runtime: FieldBusinessRuntime, organizationId: string,
  serviceId: string, date?: string) {
  if (!uuid.test(serviceId) || (date !== undefined && !validDay(date)))
    return { status: 400, error: 'invalid_availability_request' } as const;
  const release = await releaseFor(runtime.pool, organizationId);
  if (!release) return { status: 404, error: 'catalog_not_found' } as const;
  const service = release.content.services.find(item => item.id === serviceId);
  if (!service) return { status: 404, error: 'service_not_found' } as const;
  const policy = await policyFor(runtime.pool, organizationId);
  if (!policy) return { status: 409, error: 'policy_not_set' } as const;
  if (service.bookingMode === 'slot' && !date)
    return { status: 400, error: 'date_required' } as const;
  return { status: 200, body: { organizationId, catalogRevision: release.revision,
    policyRevision: policy.revision, timezone: policy.timezone,
    service, date: date ?? null, slots: date && service.bookingMode === 'slot'
      ? await availableSlots(runtime.pool, organizationId, policy, service, date) : [] } } as const;
}
function validInstant(value: unknown): Date | null {
  if (typeof value !== 'string' || !/Z$|[+-]\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function decodeReservationCursor(value: unknown): { organizationId: string; createdAt: string; id: string } | null {
  if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = obj(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    const createdAt = decoded?.createdAt;
    const parsedInstant = validInstant(createdAt);
    if (!decoded || !uuid.test(String(decoded.organizationId)) || !uuid.test(String(decoded.id))
      || typeof createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(createdAt)
      || !parsedInstant || parsedInstant.toISOString().slice(0, 19) !== createdAt.slice(0, 19)) return null;
    return { organizationId: decoded.organizationId as string, createdAt, id: decoded.id as string };
  } catch { return null; }
}
function encodeReservationCursor(organizationId: string, row: Reservation & { cursor_created_at: string }): string {
  return Buffer.from(JSON.stringify({ organizationId, createdAt: row.cursor_created_at, id: row.id }))
    .toString('base64url');
}
async function outbox(client: PoolClient, organizationId: string, eventType: string, aggregateId: string, payload: unknown) {
  await client.query('insert into field.outbox(id, organization_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
    [randomUUID(), organizationId, eventType, aggregateId, JSON.stringify(payload)]);
}
async function recordEvent(client: PoolClient, row: Reservation, nextState: string, eventType: string,
  actorType: 'customer' | 'owner', actorUserId: string | null, detail: unknown, revision: number) {
  await client.query(
    `insert into field.reservation_events
      (id, reservation_id, organization_id, revision, actor_type, actor_user_id, event_type, previous_state, next_state, detail)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [randomUUID(), row.id, row.organization_id, revision, actorType, actorUserId,
      eventType, revision === 0 ? null : row.state, nextState, JSON.stringify(detail)],
  );
}
async function ownerNotificationDelivery(client: PoolClient, row: Reservation) {
  if (row.source === 'public') return 'pending';
  if (row.source !== 'external_ap') return 'not_applicable';
  const found = await client.query<{ connection_status: string; route_state: string | null }>(
    `select c.status as connection_status,n.state as route_state
     from field.external_work_requests w
     join field.ap_connections c on c.id = w.connection_id
     left join field.external_reservation_notification_routes n on n.reservation_id = w.reservation_id
     where w.reservation_id = $1 and w.kind = 'reservation_request'`, [row.id]);
  if (found.rows[0]?.route_state === 'active') return 'pending';
  return found.rows[0]?.connection_status === 'review_required'
    ? 'handled_by_ap' : 'manual_contact_required';
}
function receiptHash(request: FastifyRequest): string | null {
  const bearer = request.headers.authorization;
  if (!bearer?.startsWith('Bearer ')) return null;
  const key = bearer.slice(7);
  return /^[A-Za-z0-9_-]{43}$/.test(key) ? hash(key) : null;
}
async function visitorReservation(client: Pick<PoolClient, 'query'>, id: string, request: FastifyRequest): Promise<Reservation | null> {
  const keyHash = receiptHash(request);
  if (!keyHash) return null;
  const result = await client.query<Reservation>('select * from field.reservations where id = $1 for update', [id]);
  const row = result.rows[0];
  return row?.visitor_key_hash && timingSafeEqual(Buffer.from(row.visitor_key_hash, 'hex'), Buffer.from(keyHash, 'hex'))
    ? row : null;
}
async function eventsFor(client: Pick<PoolClient, 'query'>, reservationId: string) {
  const result = await client.query<{
    revision: number; actor_type: string; event_type: string; previous_state: string | null;
    next_state: string; detail: Record<string, unknown>; occurred_at: Date;
  }>(
    `select revision, actor_type, event_type, previous_state, next_state, detail, occurred_at
     from field.reservation_events where reservation_id = $1 order by revision`, [reservationId],
  );
  return result.rows.map(row => ({ revision: row.revision, actorType: row.actor_type,
    eventType: row.event_type, previousState: row.previous_state, nextState: row.next_state,
    detail: row.detail, occurredAt: row.occurred_at.toISOString() }));
}

async function messagesFor(client: Pick<PoolClient, 'query'>, reservationId: string) {
  const result = await client.query<{
    id: string; sender: 'customer' | 'owner'; body: string; created_at: Date;
    notification_state: string | null;
  }>(
    `select m.id,m.sender,m.body,m.created_at,n.state as notification_state
     from field.reservation_messages m
     left join field.notification_events n on n.outbox_id = m.outbox_id
     where m.reservation_id = $1 order by m.created_at,m.id`, [reservationId],
  );
  return result.rows.map(row => ({ id: row.id, sender: row.sender, body: row.body,
    createdAt: row.created_at.toISOString(), notificationState: row.notification_state }));
}

export function registerBookingRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  const postMessage = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply,
    sender: 'customer' | 'owner') => {
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'reservation_not_found' });
    const body = obj(request.body);
    if (!body || !uuid.test(String(body.messageId)) || !text(body.body, 5000))
      return reply.code(400).send({ error: 'invalid_message' });
    const messageId = String(body.messageId);
    const content = (body.body as string).trim();
    const operator = sender === 'owner' ? await ownerOrganization(request, reply, runtime) : null;
    if (sender === 'owner' && !operator) return reply;
    if (sender === 'customer' && !receiptHash(request))
      return reply.code(401).send({ error: 'receipt_required' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const reservation = sender === 'customer'
        ? await visitorReservation(client, request.params.id, request)
        : (await client.query<Reservation>(
          'select * from field.reservations where id = $1 and organization_id = $2 for update',
          [request.params.id, operator!.id])).rows[0] ?? null;
      if (!reservation) {
        await client.query('rollback');
        return reply.code(404).send({ error: 'reservation_not_found' });
      }
      if (reservation.source !== 'public') {
        await client.query('rollback');
        return reply.code(409).send({ error: 'reservation_thread_unavailable' });
      }
      const existing = await client.query<{
        reservation_id: string; sender: string; actor_user_id: string | null; body: string;
        notification_state: string | null;
      }>(`select m.reservation_id,m.sender,m.actor_user_id,m.body,n.state as notification_state
          from field.reservation_messages m
          left join field.notification_events n on n.outbox_id = m.outbox_id
          where m.id = $1`, [messageId]);
      if (existing.rows[0]) {
        await client.query('rollback');
        const prior = existing.rows[0];
        if (prior.reservation_id !== reservation.id || prior.sender !== sender || prior.body !== content
          || prior.actor_user_id !== (operator?.userId ?? null))
          return reply.code(409).send({ error: 'message_id_conflict' });
        return reply.code(200).send({ messageId, notificationState: prior.notification_state,
          delivery: prior.notification_state });
      }
      const count = await client.query<{ total: string; recent: string }>(
        `select count(*)::text as total,
          count(*) filter (where sender = $2 and created_at > now() - interval '1 hour')::text as recent
         from field.reservation_messages where reservation_id = $1`, [reservation.id, sender]);
      if (Number(count.rows[0]?.total ?? 0) >= 200 || Number(count.rows[0]?.recent ?? 0) >= 30) {
        await client.query('rollback');
        return reply.code(429).send({ error: 'message_limit_reached' });
      }
      const eventId = randomUUID();
      await client.query(
        `insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
         values ($1,$2,$3,$4,$5::jsonb)`,
        [eventId, reservation.organization_id, `field.booking_message.${sender}`, reservation.id,
          JSON.stringify({ messageId })],
      );
      await client.query(
        `insert into field.reservation_messages
           (id,reservation_id,organization_id,sender,actor_user_id,body,outbox_id)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [messageId, reservation.id, reservation.organization_id, sender, operator?.userId ?? null,
          content, eventId],
      );
      await client.query('commit');
      const delivery = sender === 'owner' ? 'blocked_integration' : 'available';
      return reply.code(201).send({ messageId, notificationState: delivery, delivery });
    } catch (error) {
      await client.query('rollback');
      if (sqlError(error, '23505')) return reply.code(409).send({ error: 'message_id_conflict' });
      throw error;
    } finally { client.release(); }
  };
  app.post('/integrations/v1/external-requests', async (request, reply) => {
    const grant = await fieldIntegratorGrant(request, reply, runtime, 'field.requests.create');
    if (!grant) return reply;
    const body = obj(request.body);
    const customer = obj(body?.customer);
    const requestDetails = obj(body?.request);
    const consent = obj(body?.consent);
    const source = obj(body?.source);
    const digest = request.headers['x-body-sha256'];
    if (!body || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)
      || digest !== bodyHash(body) || !uuid.test(String(body.actionRequestId))
      || !uuid.test(String(body.connectionId)) || !uuid.test(String(body.originConversationId))
      || !uuid.test(String(body.externalServiceId))
      || (body.kind !== 'reservation_request' && body.kind !== 'inquiry')
      || !integer(body.expectedServiceRevision, 1, 1_000_000_000)
      || !integer(body.expectedPolicyRevision, 1, 1_000_000_000)
      || !customer || !text(customer.name, 80) || !text(customer.phone, 30)
      || !/^[+\d()\-\s]{9,30}$/.test(customer.phone)
      || customer.phone.replace(/\D/g, '').length < 9 || typeof customer.verified !== 'boolean'
      || !requestDetails || !text(body.summary, 5000)
      || !Array.isArray(body.attachmentRefs) || !consent || consent.version !== 'transfer-v1'
      || !uuid.test(String(consent.recordId)) || typeof consent.confirmedAt !== 'string'
      || !Number.isFinite(Date.parse(consent.confirmedAt))
      || consent.recipientProduct !== 'field' || consent.recipientOrganizationId !== grant.organization_id
      || typeof consent.conditionsHash !== 'string' || !/^[a-f0-9]{64}$/.test(consent.conditionsHash)
      || !Array.isArray(consent.items) || !source || source.provider !== 'agent-platform'
      || !uuid.test(String(source.deploymentId)) || typeof source.isTest !== 'boolean')
      return reply.code(400).send({ error: 'invalid_external_request' });
    const attachmentRefs = body.attachmentRefs as unknown[];
    if (attachmentRefs.length > 5 || attachmentRefs.some(id => typeof id !== 'string' || !uuid.test(id))
      || new Set(attachmentRefs).size !== attachmentRefs.length)
      return reply.code(400).send({ error: 'invalid_attachment_refs' });
    const requiredItems = body.kind === 'reservation_request'
      ? ['name', 'phone', 'service', 'requested_time'] : ['name', 'phone', 'service', 'summary'];
    if (attachmentRefs.length) requiredItems.push('attachments');
    const consentItems = consent.items as unknown[];
    if (consentItems.length !== requiredItems.length
      || !requiredItems.every(item => consentItems.includes(item)))
      return reply.code(400).send({ error: 'invalid_transfer_consent' });
    const confirmedAt = Date.parse(consent.confirmedAt);
    const connectionId = body.connectionId as string;
    const actionRequestId = body.actionRequestId as string;
    const bound = await runtime.pool.query<{ id: string }>(
      `select id from field.ap_connections where id = $1 and organization_id = $2
       and field_grant_id = $3 and field_client_id = $4 and field_actor_user_id = $5
       and status = 'review_required' and $6::uuid::text = any(allowed_deployment_ids)`,
      [connectionId, grant.organization_id, grant.id, grant.client_id,
        grant.actor_user_id, source.deploymentId]);
    if (!bound.rows[0]) return reply.code(404).send({ error: 'connection_not_found' });
    const previous = await runtime.pool.query<{ id: string; body_hash: string; reservation_id: string | null;
      status: string }>(
      `select id, body_hash, reservation_id, status from field.external_work_requests
       where provider = 'agent-platform' and connection_id = $1 and action_request_id = $2`,
      [connectionId, actionRequestId]);
    const replay = (row: typeof previous.rows[number]) => row.body_hash === digest
      ? reply.header('Cache-Control', 'private, no-store').code(200).send({
        externalRequestId: row.id, reservationId: row.reservation_id, status: row.status,
        version: 1, requestId: actionRequestId, retryable: false })
      : reply.code(409).send({ error: 'idempotency_conflict' });
    if (previous.rows[0]) return replay(previous.rows[0]);
    if (confirmedAt > Date.now() + 5 * 60_000 || confirmedAt < Date.now() - 24 * 60 * 60_000)
      return reply.code(409).send({ error: 'transfer_consent_expired' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      if (await rejectExpiredTrial(reply, db, grant.organization_id)) {
        await db.query('rollback'); return reply;
      }
      const currentBinding = await db.query(
        `select 1 from field.ap_connections where id = $1 and organization_id = $2
         and field_grant_id = $3 and status = 'review_required' for share`,
        [connectionId, grant.organization_id, grant.id]);
      if (!currentBinding.rowCount) {
        await db.query('rollback'); return reply.code(409).send({ error: 'connection_changed' });
      }
      const release = await releaseFor(db, grant.organization_id);
      const service = release?.content.services.find(item => item.id === body.externalServiceId);
      const policy = await policyFor(db, grant.organization_id);
      if (!release || !service || !policy) {
        await db.query('rollback'); return reply.code(404).send({ error: 'service_not_available' });
      }
      if (release.revision !== body.expectedServiceRevision || policy.revision !== body.expectedPolicyRevision) {
        await db.query('rollback'); return reply.code(409).send({ error: 'service_revision_changed' });
      }
      if (requestDetails.timezone !== policy.timezone) {
        await db.query('rollback'); return reply.code(409).send({ error: 'service_conditions_changed' });
      }
      let start: Date | null = null;
      let preferred: string | null = null;
      if (body.kind === 'reservation_request' && service.bookingMode === 'slot') {
        if (requestDetails.mode !== 'slot' || typeof requestDetails.startAt !== 'string'
          || Object.keys(requestDetails).some(key => !['mode', 'startAt', 'timezone'].includes(key))) {
          await db.query('rollback'); return reply.code(400).send({ error: 'invalid_slot_request' });
        }
        start = validInstant(requestDetails.startAt);
        if (!start || !(await availableSlots(db, grant.organization_id, policy, service,
          localDay(start, policy.timezone))).some(slot => slot.startAt === start!.toISOString())) {
          await db.query('rollback'); return reply.code(409).send({ error: 'slot_unavailable' });
        }
      } else if (body.kind === 'reservation_request') {
        if (requestDetails.mode !== 'preferred' || !text(requestDetails.preferredTimeText, 500)
          || Object.keys(requestDetails).some(key => !['mode', 'preferredTimeText', 'timezone'].includes(key))) {
          await db.query('rollback'); return reply.code(400).send({ error: 'invalid_preferred_request' });
        }
        preferred = requestDetails.preferredTimeText.trim();
      } else if (requestDetails.mode !== 'inquiry'
        || Object.keys(requestDetails).some(key => !['mode', 'timezone'].includes(key))) {
        await db.query('rollback'); return reply.code(400).send({ error: 'invalid_inquiry_request' });
      }
      const expectedConditions = bodyHash({ organizationId: grant.organization_id,
        catalogRevision: release.revision, policyRevision: policy.revision,
        service, timezone: policy.timezone, request: requestDetails });
      if (expectedConditions !== consent.conditionsHash) {
        await db.query('rollback'); return reply.code(409).send({ error: 'service_conditions_changed' });
      }
      const reservationId = body.kind === 'reservation_request' ? randomUUID() : null;
      if (reservationId) {
        await db.query(`insert into field.reservations(id,organization_id,catalog_revision,service_id,
          service_snapshot,booking_mode,customer_name,customer_phone,visitor_key_hash,
          preferred_time_text,requested_start_at,timezone,state,consent_at,source)
          values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,null,$9,$10,$11,'requested',$12,'external_ap')`,
        [reservationId, grant.organization_id, release.revision, service.id, JSON.stringify(service),
          service.bookingMode, customer.name.trim(), customer.phone.trim(), preferred,
          start, policy.timezone, consent.confirmedAt]);
      }
      const externalRequestId = randomUUID();
      const inserted = await db.query(`insert into field.external_work_requests
        (id,organization_id,provider,connection_id,client_id,field_grant_id,action_request_id,
         body_hash,origin_conversation_id,source_deployment_id,kind,service_id,catalog_revision,
         policy_revision,service_snapshot,customer_snapshot,request_snapshot,summary,
         consent_record_id,consent_confirmed_at,conditions_hash,is_test,reservation_id,status)
        values ($1,$2,'agent-platform',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,
          $15::jsonb,$16::jsonb,$17,$18,$19,$20,$21,$22,'requested')
        on conflict (provider,connection_id,action_request_id) do nothing returning id`,
      [externalRequestId, grant.organization_id, connectionId, grant.client_id, grant.id,
        actionRequestId, digest, body.originConversationId, source.deploymentId, body.kind,
        service.id, release.revision, policy.revision, JSON.stringify(service),
        JSON.stringify({ name: customer.name.trim(), phone: customer.phone.trim(), verified: customer.verified }),
        JSON.stringify(requestDetails), body.summary.trim(), consent.recordId, consent.confirmedAt,
        consent.conditionsHash, process.env.FIELD_PROFILE === 'mock' ? true : source.isTest, reservationId]);
      if (!inserted.rowCount) {
        await db.query('rollback');
        const existing = await runtime.pool.query<{ id: string; body_hash: string;
          reservation_id: string | null; status: string }>(
          `select id,body_hash,reservation_id,status from field.external_work_requests
           where provider = 'agent-platform' and connection_id = $1 and action_request_id = $2`,
          [connectionId, actionRequestId]);
        return existing.rows[0] ? replay(existing.rows[0])
          : reply.code(409).send({ error: 'submission_retry_failed' });
      }
      for (const sourceAttachmentId of attachmentRefs) {
        await db.query(`insert into field.external_request_attachments
          (id,organization_id,external_request_id,source_attachment_id)
          values ($1,$2,$3,$4)`,
        [randomUUID(), grant.organization_id, externalRequestId, sourceAttachmentId]);
      }
      if (reservationId) {
        await db.query(`insert into field.reservation_events
          (id,reservation_id,organization_id,revision,actor_type,event_type,previous_state,next_state,detail)
          values ($1,$2,$3,0,'customer','field.reservation.requested',null,'requested',$4::jsonb)`,
        [randomUUID(), reservationId, grant.organization_id,
          JSON.stringify({ externalRequestId, connectionId, serviceId: service.id })]);
      }
      await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
        values ($1,$2,$3,$4,$5::jsonb)`,
      [randomUUID(), grant.organization_id,
        reservationId ? 'field.reservation.requested' : 'field.external_request.accepted',
        reservationId ?? externalRequestId,
        JSON.stringify({ externalRequestId, reservationId, connectionId,
          ...(reservationId ? { notification: 'handled_by_ap' } : {}) })]);
      await db.query('commit');
      return reply.header('Cache-Control', 'private, no-store').code(201).send({
        externalRequestId, reservationId, status: 'requested', version: 1,
        requestId: actionRequestId, retryable: false });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.get<{ Params: { actionId: string } }>('/integrations/v1/external-requests/by-source/:actionId',
    async (request, reply) => {
      const grant = await fieldIntegratorGrant(request, reply, runtime, 'field.requests.read');
      if (!grant) return reply;
      if (!uuid.test(request.params.actionId)) return reply.code(404).send({ error: 'external_request_not_found' });
      const found = await runtime.pool.query<{ id: string; reservation_id: string | null; status: string }>(
        `select e.id,e.reservation_id,e.status from field.external_work_requests e
         join field.ap_connections c on c.id = e.connection_id
         where e.action_request_id = $1 and e.organization_id = $2 and e.client_id = $3
           and c.field_grant_id = $4 and c.field_actor_user_id = $5
           and c.status = 'review_required'`,
        [request.params.actionId, grant.organization_id, grant.client_id, grant.id, grant.actor_user_id]);
      const row = found.rows[0];
      if (!row) return reply.code(404).send({ error: 'external_request_not_found' });
      return reply.header('Cache-Control', 'private, no-store').send({
        externalRequestId: row.id, reservationId: row.reservation_id,
        status: row.status, version: 1, requestId: request.params.actionId, retryable: false });
    });

  app.get<{ Params: { actionId: string } }>('/integrations/v1/external-requests/by-source/:actionId/events',
    async (request, reply) => {
      const grant = await fieldIntegratorGrant(request, reply, runtime, 'field.requests.read');
      if (!grant) return reply;
      if (!uuid.test(request.params.actionId)) return reply.code(404).send({ error: 'external_request_not_found' });
      const found = await runtime.pool.query<{ id: string; connection_id: string;
        reservation_id: string; state: string; revision: number }>(
        `select e.id, e.connection_id, e.reservation_id, r.state, r.revision
         from field.external_work_requests e
         join field.ap_connections c on c.id = e.connection_id
         join field.reservations r on r.id = e.reservation_id
         where e.action_request_id = $1 and e.organization_id = $2 and e.client_id = $3
           and e.kind = 'reservation_request' and r.organization_id = e.organization_id
           and r.source = 'external_ap' and c.organization_id = e.organization_id
           and c.field_grant_id = $4 and c.field_actor_user_id = $5
           and c.status = 'review_required'`,
        [request.params.actionId, grant.organization_id, grant.client_id, grant.id, grant.actor_user_id]);
      const row = found.rows[0];
      if (!row) return reply.code(404).send({ error: 'external_request_not_found' });
      const events = await runtime.pool.query<{ id: string; revision: number; event_type: string;
        next_state: string; detail: Record<string, unknown>; occurred_at: Date }>(
        `select id, revision, event_type, next_state, detail, occurred_at
         from field.reservation_events where organization_id = $1 and reservation_id = $2
         order by revision`, [grant.organization_id, row.reservation_id]);
      return reply.header('Cache-Control', 'private, no-store').send({
        actionRequestId: request.params.actionId, externalRequestId: row.id,
        connectionId: row.connection_id, organizationId: grant.organization_id,
        reservationId: row.reservation_id,
        state: row.state, revision: row.revision,
        events: events.rows.map(event => ({ eventId: event.id, revision: event.revision,
          eventType: event.event_type, state: event.next_state,
          occurredAt: event.occurred_at.toISOString(),
          customerNotificationOwnerProduct: 'ap', routeGeneration: 1,
          ...(typeof event.detail.startAt === 'string' ? { startAt: event.detail.startAt } : {}),
          ...(typeof event.detail.endAt === 'string' ? { endAt: event.detail.endAt } : {}),
        })),
      });
    });

  app.get<{ Querystring: { cursor?: string } }>('/v1/owner/external-requests', async (request, reply) => {
    const operator = await operatorOrganization(request, reply, runtime);
    if (!operator) return reply;
    const rawCursor = request.query.cursor;
    const cursor = rawCursor === undefined ? null
      : decodeOwnerListCursor(rawCursor, operator.id, 'external_request');
    if (rawCursor !== undefined && !cursor)
      return reply.code(400).send({ error: 'invalid_external_request_cursor' });
    const result = await runtime.pool.query<{ id: string; service_snapshot: Service;
      customer_snapshot: { name: string; phone: string; verified: boolean };
      summary: string; status: string; received_at: Date; is_test: boolean; cursor_timestamp: string }>(
      `select id,service_snapshot,customer_snapshot,summary,status,received_at,is_test,
         to_char(received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_timestamp
       from field.external_work_requests
       where organization_id = $1 and kind = 'inquiry'
       ${cursor ? 'and (received_at,id) < ($2::timestamptz,$3::uuid)' : ''}
       order by received_at desc, id desc limit 101`,
      cursor ? [operator.id, cursor.timestamp, cursor.id] : [operator.id]);
    const page = result.rows.slice(0, 100);
    return reply.header('Cache-Control', 'private, no-store').send({
      inquiries: page.map(row => ({ id: row.id, service: row.service_snapshot,
        customerName: row.customer_snapshot.name, customerPhone: row.customer_snapshot.phone,
        customerVerified: row.customer_snapshot.verified, summary: row.summary,
        status: row.status, receivedAt: row.received_at.toISOString(), isTest: row.is_test })),
      nextCursor: result.rows.length > 100
        ? encodeOwnerListCursor(operator.id, 'external_request', page[page.length - 1]!.cursor_timestamp,
          page[page.length - 1]!.id) : null,
    });
  });

  app.get('/v1/booking-policy', async (request, reply) => {
    const owner = await ownerOrganization(request, reply, runtime);
    if (!owner) return reply;
    const policy = await policyFor(runtime.pool, owner.id);
    if (!policy) return reply.code(404).send({ error: 'policy_not_set' });
    return policyResponse(policy);
  });

  app.put('/v1/booking-policy', async (request, reply) => {
    const owner = await ownerOrganization(request, reply, runtime);
    if (!owner) return reply;
    const body = obj(request.body);
    const next = parsePolicy(body);
    if (!body || !integer(body.expectedRevision, 0, 1_000_000_000) || !next) return reply.code(400).send({ error: 'invalid_policy' });
    const values = [owner.id, next.timezone, JSON.stringify(next.weekly), JSON.stringify(next.closed_dates),
      JSON.stringify(next.special_dates), next.before_minutes, next.after_minutes, next.min_lead_minutes,
      next.horizon_days, owner.userId];
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const result = body.expectedRevision === 0
        ? await client.query<Policy>(
        `insert into field.booking_policies (organization_id, revision, timezone, weekly, closed_dates,
          special_dates, before_minutes, after_minutes, min_lead_minutes, horizon_days, updated_by)
         values ($1, 1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10)
         on conflict (organization_id) do nothing returning *`, values)
        : await client.query<Policy>(
        `update field.booking_policies set revision = revision + 1, timezone = $2, weekly = $3::jsonb,
          closed_dates = $4::jsonb, special_dates = $5::jsonb, before_minutes = $6,
          after_minutes = $7, min_lead_minutes = $8, horizon_days = $9, updated_by = $10, updated_at = now()
         where organization_id = $1 and revision = $11 returning *`, [...values, body.expectedRevision]);
      if (!result.rows[0]) { await client.query('rollback'); return reply.code(409).send({ error: 'revision_conflict' }); }
      await outbox(client, owner.id, 'field.booking_policy.updated', owner.id,
        { organizationId: owner.id, revision: result.rows[0].revision });
      await client.query('commit');
      return policyResponse(result.rows[0]);
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.get<{ Params: { id: string }; Querystring: { serviceId?: string; date?: string } }>(
    '/v1/public/catalog/:id/availability', async (request, reply) => {
      const { id } = request.params;
      const { serviceId, date } = request.query;
      if (!uuid.test(id) || !serviceId || !uuid.test(serviceId) || !date || !validDay(date))
        return reply.code(400).send({ error: 'invalid_availability_request' });
      const release = await releaseFor(runtime.pool, id);
      if (!release) return reply.code(404).send({ error: 'catalog_not_found' });
      const service = release.content.services.find(item => item.id === serviceId);
      if (!service || service.bookingMode !== 'slot') return reply.code(404).send({ error: 'slot_service_not_found' });
      const policy = await policyFor(runtime.pool, id);
      if (!policy) return reply.code(409).send({ error: 'policy_not_set' });
      return { organizationId: id, catalogRevision: release.revision, policyRevision: policy.revision,
        timezone: policy.timezone, date, slots: await availableSlots(runtime.pool, id, policy, service, date) };
    },
  );

  app.get<{ Params: { id: string } }>('/v1/public/catalog/:id/reservations/recover', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'reservation_not_found' });
    const submittedKey = request.headers['idempotency-key'];
    const submittedReceipt = request.headers['x-receipt-key'];
    if (typeof submittedKey !== 'string' || typeof submittedReceipt !== 'string'
      || !/^[A-Za-z0-9_-]{43}$/.test(submittedKey) || !/^[A-Za-z0-9_-]{43}$/.test(submittedReceipt))
      return reply.code(400).send({ error: 'invalid_submission_key' });
    const found = await runtime.pool.query<{ id: string; state: string }>(
      `select id, state from field.reservations where organization_id = $1
       and submission_key_hash = $2 and visitor_key_hash = $3 and consent_at is not null`,
      [request.params.id, hash(submittedKey), hash(submittedReceipt)]);
    if (!found.rows[0]) return reply.header('Cache-Control', 'no-store')
      .code(404).send({ error: 'reservation_not_found' });
    return reply.header('Cache-Control', 'no-store').send({ id: found.rows[0].id,
      receiptKey: submittedReceipt, state: found.rows[0].state, delivery: 'pending' });
  });

  app.post<{ Params: { id: string } }>('/v1/public/catalog/:id/reservations', async (request, reply) => {
    const organizationId = request.params.id;
    const body = obj(request.body);
    if (!uuid.test(organizationId) || !body || typeof body.serviceId !== 'string' || !uuid.test(body.serviceId)
        || !text(body.name, 80) || !text(body.phone, 30)
        || !/^[+\d()\-\s]{9,30}$/.test(body.phone as string)
        || (body.phone as string).replace(/\D/g, '').length < 9 || body.consent !== true)
      return reply.code(400).send({ error: 'invalid_reservation' });
    const submittedKey = request.headers['idempotency-key'];
    const submittedReceipt = request.headers['x-receipt-key'];
    const hasSubmissionKey = submittedKey !== undefined || submittedReceipt !== undefined;
    if (hasSubmissionKey && (typeof submittedKey !== 'string' || typeof submittedReceipt !== 'string'
        || !/^[A-Za-z0-9_-]{43}$/.test(submittedKey) || !/^[A-Za-z0-9_-]{43}$/.test(submittedReceipt)))
      return reply.code(400).send({ error: 'invalid_submission_key' });
    if ((body.startAt !== undefined && typeof body.startAt !== 'string')
        || (body.preferredTimeText !== undefined && typeof body.preferredTimeText !== 'string')
        || (body.requestMessage !== undefined && !text(body.requestMessage, 2000))
        || (body.visitRegion !== undefined
          && (typeof body.visitRegion !== 'string' || body.visitRegion.length > 200)))
      return reply.code(400).send({ error: 'invalid_reservation' });
    const requestMessage = body.requestMessage === undefined ? null : (body.requestMessage as string).trim();
    const visitRegion = body.visitRegion === undefined ? null : (body.visitRegion as string).trim() || null;
    const submissionKeyHash = hasSubmissionKey ? hash(submittedKey as string) : null;
    const requestPayload: Record<string, unknown> = { serviceId: body.serviceId,
      name: (body.name as string).trim(), phone: (body.phone as string).trim(),
      startAt: body.startAt ?? null, preferredTimeText: body.preferredTimeText === undefined
        ? null : (body.preferredTimeText as string).trim() };
    if (body.requestMessage !== undefined) requestPayload.requestMessage = requestMessage;
    if (body.visitRegion !== undefined) requestPayload.visitRegion = visitRegion;
    const requestHash = hasSubmissionKey ? hash(JSON.stringify(requestPayload)) : null;
    const replay = async () => {
      const existing = await runtime.pool.query<Reservation>(
        'select * from field.reservations where organization_id = $1 and submission_key_hash = $2',
        [organizationId, submissionKeyHash],
      );
      const row = existing.rows[0];
      if (!row) return false;
      if (row.submission_request_hash !== requestHash || row.visitor_key_hash !== hash(submittedReceipt as string))
        return reply.code(409).send({ error: 'idempotency_conflict' });
      return reply.header('Cache-Control', 'no-store').code(200)
        .send({ ...publicReservation(row), receiptKey: submittedReceipt, delivery: 'pending' });
    };
    if (submissionKeyHash) {
      const result = await replay();
      if (result) return result;
    }
    const release = await releaseFor(runtime.pool, organizationId);
    if (!release) return reply.code(404).send({ error: 'catalog_not_found' });
    const service = release.content.services.find(item => item.id === body.serviceId);
    if (!service) return reply.code(404).send({ error: 'service_not_found' });
    const policy = await policyFor(runtime.pool, organizationId);
    if (!policy) return reply.code(409).send({ error: 'policy_not_set' });
    const start = body.startAt === undefined ? null : validInstant(body.startAt);
    const preferred = body.preferredTimeText === undefined ? null : body.preferredTimeText;
    if (service.bookingMode === 'slot') {
      if (!start || preferred !== null) return reply.code(400).send({ error: 'invalid_slot_request' });
      const day = localDay(start, policy.timezone);
      const slots = await availableSlots(runtime.pool, organizationId, policy, service, day);
      if (!slots.some(slot => slot.startAt === start.toISOString())) return reply.code(409).send({ error: 'slot_unavailable' });
    } else if (!text(preferred, 500) || start) return reply.code(400).send({ error: 'invalid_preferred_time' });
    const id = randomUUID();
    const receiptKey = hasSubmissionKey ? submittedReceipt as string : randomBytes(32).toString('base64url');
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      if (await rejectExpiredTrial(reply, client, organizationId)) {
        await client.query('rollback'); return reply;
      }
      const submissionLimit = await consumePublicSubmission(client, organizationId, body.phone as string);
      if (submissionLimit !== null) {
        await client.query('rollback');
        return reply.header('Retry-After', submissionLimit.retryAfter).header('Cache-Control', 'no-store')
          .code(429).send({ error: 'submission_rate_limited', scope: submissionLimit.scope });
      }
      const created = await client.query<Reservation>(
        `insert into field.reservations (id, organization_id, catalog_revision, service_id, service_snapshot,
          booking_mode, customer_name, customer_phone, visitor_key_hash, preferred_time_text,
          requested_start_at, timezone, state, consent_at, submission_key_hash, submission_request_hash,
          request_message, visit_region)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, 'requested', now(), $13, $14, $15, $16)
         on conflict (organization_id, submission_key_hash) do nothing returning *`,
        [id, organizationId, release.revision, service.id, JSON.stringify(service), service.bookingMode,
          body.name.trim(), body.phone.trim(), hash(receiptKey), preferred, start, policy.timezone,
          submissionKeyHash, requestHash, requestMessage, visitRegion],
      );
      if (!created.rows[0]) {
        await client.query('rollback');
        const result = await replay();
        if (result) return result;
        return reply.code(409).send({ error: 'submission_retry_failed' });
      }
      await outbox(client, organizationId, 'field.reservation.requested', id,
        { reservationId: id, catalogRevision: release.revision, notification: 'pending' });
      await recordEvent(client, created.rows[0]!, 'requested', 'field.reservation.requested', 'customer', null,
        { catalogRevision: release.revision, serviceId: service.id }, 0);
      await client.query('commit');
      return reply.header('Cache-Control', 'no-store').code(201).send({ ...publicReservation(created.rows[0]!), receiptKey, delivery: 'pending' });
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/reservations/:id', async (request, reply) => {
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'reservation_not_found' });
    const keyHash = receiptHash(request);
    if (!keyHash) return reply.code(401).send({ error: 'receipt_required' });
    const result = await runtime.pool.query<Reservation & { business_name: string }>(
      `select r.*, coalesce(c.content->>'businessName', o.name) as business_name
       from field.reservations r
       join field.organizations o on o.id = r.organization_id
       left join field.catalog_releases c on c.organization_id = r.organization_id
         and c.revision = r.catalog_revision
       where r.id = $1`, [request.params.id]);
    const row = result.rows[0];
    if (!row?.visitor_key_hash || !timingSafeEqual(Buffer.from(row.visitor_key_hash, 'hex'), Buffer.from(keyHash, 'hex')))
      return reply.code(404).send({ error: 'reservation_not_found' });
    reply.header('Cache-Control', 'no-store');
    return { ...publicReservation(row), businessName: row.business_name,
      events: await eventsFor(runtime.pool, row.id),
      messages: row.source === 'public' ? await messagesFor(runtime.pool, row.id) : [],
      attachments: await reservationAttachments(runtime.pool, row.id) };
  });

  app.post<{ Params: { id: string } }>('/v1/reservations/:id/messages',
    (request, reply) => postMessage(request, reply, 'customer'));

  app.get<{ Params: { id: string } }>('/v1/reservations/:id/catalog-review', async (request, reply) => {
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'reservation_not_found' });
    if (!receiptHash(request)) return reply.code(401).send({ error: 'receipt_required' });
    const row = await visitorReservation(runtime.pool, request.params.id, request);
    if (!row) return reply.code(404).send({ error: 'reservation_not_found' });
    if (!['requested', 'proposed', 'customer_accepted'].includes(row.state))
      return reply.code(409).send({ error: 'review_not_allowed' });
    const release = await releaseFor(runtime.pool, row.organization_id);
    if (!release || release.revision <= row.catalog_revision)
      return reply.code(409).send({ error: 'catalog_current' });
    return reply.headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).send({
      reservationId: row.id, expectedRevision: row.revision, previousCatalogRevision: row.catalog_revision,
      currentCatalogRevision: release.revision, previousService: row.service_snapshot,
      services: release.content.services,
    });
  });

  app.post<{ Params: { id: string } }>('/v1/reservations/:id/review-catalog', async (request, reply) => {
    const body = obj(request.body);
    if (!uuid.test(request.params.id) || !body || !integer(body.expectedRevision, 0, 1_000_000_000)
        || !integer(body.expectedCatalogRevision, 1, 1_000_000_000)
        || typeof body.serviceId !== 'string' || !uuid.test(body.serviceId) || body.consent !== true)
      return reply.code(400).send({ error: 'invalid_catalog_review' });
    if (!receiptHash(request)) return reply.code(401).send({ error: 'receipt_required' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const row = await visitorReservation(client, request.params.id, request);
      if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'reservation_not_found' }); }
      if (row.revision !== body.expectedRevision || !['requested', 'proposed', 'customer_accepted'].includes(row.state)) {
        await client.query('rollback'); return reply.code(409).send({ error: 'revision_conflict' });
      }
      const release = await releaseFor(client, row.organization_id);
      if (!release || release.revision !== body.expectedCatalogRevision || release.revision <= row.catalog_revision) {
        await client.query('rollback'); return reply.code(409).send({ error: 'catalog_stale' });
      }
      const service = release.content.services.find(item => item.id === body.serviceId);
      if (!service) { await client.query('rollback'); return reply.code(409).send({ error: 'service_removed' }); }
      const policy = await policyFor(client, row.organization_id);
      if (!policy) { await client.query('rollback'); return reply.code(409).send({ error: 'policy_not_set' }); }
      let start: Date | null = null;
      let preferred: string | null = null;
      if (service.bookingMode === 'slot') {
        start = body.startAt === undefined && row.booking_mode === 'slot'
          ? row.requested_start_at : validInstant(body.startAt);
        const desiredStart = start?.toISOString();
        if (!start || !(await availableSlots(client, row.organization_id, policy, service,
          localDay(start, policy.timezone))).some(slot => slot.startAt === desiredStart)) {
          await client.query('rollback'); return reply.code(409).send({ error: 'slot_unavailable' });
        }
      } else {
        preferred = body.preferredTimeText === undefined && row.booking_mode === 'request'
          ? row.preferred_time_text : typeof body.preferredTimeText === 'string' ? body.preferredTimeText.trim() : null;
        if (!preferred || preferred.length > 500) {
          await client.query('rollback'); return reply.code(400).send({ error: 'preferred_time_required' });
        }
      }
      const updated = await client.query<Reservation>(
        `update field.reservations set catalog_revision = $2, service_id = $3, service_snapshot = $4::jsonb,
          booking_mode = $5, preferred_time_text = $6, requested_start_at = $7, timezone = $8,
          proposal_start_at = null, proposal_end_at = null, proposal_accepted_at = null,
          state = 'requested', revision = revision + 1, updated_at = now()
         where id = $1 returning *`,
        [row.id, release.revision, service.id, JSON.stringify(service), service.bookingMode,
          preferred, start, policy.timezone]);
      const next = updated.rows[0]!;
      await recordEvent(client, row, 'requested', 'field.reservation.catalog_reviewed', 'customer', null,
        { previousCatalogRevision: row.catalog_revision, catalogRevision: release.revision,
          previousService: row.service_snapshot, service, consentAt: new Date().toISOString(),
          previousProposalInvalidated: row.proposal_start_at !== null }, next.revision);
      await outbox(client, row.organization_id, 'field.reservation.catalog_reviewed', row.id,
        { reservationId: row.id, revision: next.revision, notification: 'pending' });
      await client.query('commit');
      return reply.header('Cache-Control', 'no-store').send({ ...publicReservation(next), delivery: 'pending' });
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.get<{ Querystring: { cursor?: string } }>('/v1/owner/reservations', async (request, reply) => {
    const owner = await ownerOrganization(request, reply, runtime);
    if (!owner) return reply;
    const rawCursor = request.query.cursor;
    const cursor = rawCursor === undefined ? null : decodeReservationCursor(rawCursor);
    if (rawCursor !== undefined && (!cursor || cursor.organizationId !== owner.id))
      return reply.code(400).send({ error: 'invalid_reservation_cursor' });
    const result = await runtime.pool.query<Reservation & { cursor_created_at: string }>(
      `select *, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_created_at
       from field.reservations where organization_id = $1
       ${cursor ? 'and (created_at, id) < ($2::timestamptz, $3::uuid)' : ''}
       order by created_at desc, id desc limit 101`,
      cursor ? [owner.id, cursor.createdAt, cursor.id] : [owner.id],
    );
    const page = result.rows.slice(0, 100);
    return reply.header('Cache-Control', 'private, no-store').send({
      reservations: page.map(publicReservation),
      nextCursor: result.rows.length > 100 ? encodeReservationCursor(owner.id, page[page.length - 1]!) : null,
    });
  });

  app.get<{ Querystring: { from?: string; to?: string } }>('/v1/owner/reservations/calendar', async (request, reply) => {
    const owner = await ownerOrganization(request, reply, runtime);
    if (!owner) return reply;
    const { from, to } = request.query;
    if (!from || !to || !validDay(from) || !validDay(to)
        || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) !== 6 * 86_400_000)
      return reply.code(400).send({ error: 'invalid_calendar_week' });
    const policy = await runtime.pool.query<{ timezone: string }>(
      'select timezone from field.booking_policies where organization_id = $1', [owner.id]);
    const timezone = policy.rows[0]?.timezone ?? 'Asia/Seoul';
    const [bookings, manualBlocks, pending] = await Promise.all([
      runtime.pool.query<Reservation>(
        `select * from field.reservations
         where organization_id = $1 and confirmed_start_at is not null
           and (confirmed_start_at at time zone $2)::date between $3::date and $4::date
           and state <> 'canceled'
         order by confirmed_start_at, id limit 501`, [owner.id, timezone, from, to]),
      runtime.pool.query<{ id: string; label: string | null; start_at: Date; end_at: Date }>(
        `select id,label,lower(occupied) as start_at,upper(occupied) as end_at
         from field.occupancies where organization_id = $1 and source = 'manual'
           and upper(occupied) > ($2::date::timestamp at time zone $4)
           and lower(occupied) < (($3::date + interval '1 day') at time zone $4)
         order by lower(occupied),id limit 501`, [owner.id, from, to, timezone]),
      runtime.pool.query<Reservation>(
        `select * from field.reservations where organization_id = $1
           and state in ('requested','proposed','customer_accepted','change_requested',
                         'change_proposed','change_accepted','cancel_requested')
         order by created_at desc,id desc limit 101`, [owner.id]),
    ]);
    if (bookings.rows.length > 500 || manualBlocks.rows.length > 500)
      return reply.code(413).send({ error: 'calendar_week_too_large' });
    return reply.header('Cache-Control', 'private, no-store').send({ from, to, timezone,
      reservations: bookings.rows.map(publicReservation),
      blocks: manualBlocks.rows.map(row => ({ id: row.id, label: row.label ?? '수동 일정',
        startAt: row.start_at.toISOString(), endAt: row.end_at.toISOString() })),
      pending: pending.rows.slice(0, 100).map(publicReservation),
      pendingHasMore: pending.rows.length > 100 });
  });

  app.get<{ Params: { id: string } }>('/v1/owner/reservations/:id', async (request, reply) => {
    const owner = await ownerOrganization(request, reply, runtime);
    if (!owner) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'reservation_not_found' });
    const found = await runtime.pool.query<Reservation>(
      'select * from field.reservations where id = $1 and organization_id = $2', [request.params.id, owner.id]);
    const row = found.rows[0];
    if (!row) return reply.code(404).send({ error: 'reservation_not_found' });
    reply.header('Cache-Control', 'no-store');
    return { ...publicReservation(row), events: await eventsFor(runtime.pool, row.id),
      messages: row.source === 'public' ? await messagesFor(runtime.pool, row.id) : [],
      attachments: await reservationAttachments(runtime.pool, row.id) };
  });

  app.post<{ Params: { id: string } }>('/v1/owner/reservations/:id/messages',
    (request, reply) => postMessage(request, reply, 'owner'));

  app.post<{ Params: { id: string } }>('/v1/owner/reservations/:id/proposals', async (request, reply) => {
    const owner = await ownerOrganization(request, reply, runtime);
    if (!owner) return reply;
    const body = obj(request.body);
    const start = validInstant(body?.startAt);
    if (!uuid.test(request.params.id) || !body || !start
        || !integer(body.expectedRevision, 0, 1_000_000_000)
        || !integer(body.expectedCatalogRevision, 1, 1_000_000_000))
      return reply.code(400).send({ error: 'invalid_proposal' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const found = await client.query<Reservation>(
        'select * from field.reservations where id = $1 and organization_id = $2 for update', [request.params.id, owner.id]);
      const row = found.rows[0];
      if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'reservation_not_found' }); }
      if ((row.state !== 'requested' && row.state !== 'change_requested') || row.revision !== body.expectedRevision) {
        await client.query('rollback'); return reply.code(409).send({ error: 'revision_conflict' });
      }
      const release = await releaseFor(client, owner.id);
      if (!release || release.revision !== row.catalog_revision || release.revision !== body.expectedCatalogRevision) {
        await client.query('rollback'); return reply.code(409).send({ error: 'catalog_stale' });
      }
      const policy = await policyFor(client, owner.id);
      if (!policy || !(await availableSlots(client, owner.id, policy, row.service_snapshot,
        localDay(start, policy.timezone), true)).some(slot => slot.startAt === start.toISOString())) {
        await client.query('rollback'); return reply.code(409).send({ error: 'slot_unavailable' });
      }
      const nextState = row.state === 'change_requested' ? 'change_proposed' : 'proposed';
      const end = new Date(start.getTime() + row.service_snapshot.durationMinutes * 60_000);
      const updated = await client.query<Reservation>(
        `update field.reservations set state = $2, revision = revision + 1,
          proposal_start_at = $3, proposal_end_at = $4, proposal_accepted_at = null, updated_at = now()
         where id = $1 returning *`, [row.id, nextState, start, end]);
      await recordEvent(client, row, nextState, 'field.reservation.proposed', 'owner', owner.userId,
        { startAt: start.toISOString(), endAt: end.toISOString() }, updated.rows[0]!.revision);
      const delivery = await ownerNotificationDelivery(client, row);
      await outbox(client, owner.id, 'field.reservation.proposed', row.id,
        { reservationId: row.id, revision: updated.rows[0]!.revision, notification: delivery });
      await client.query('commit');
      return reply.code(201).send({ ...publicReservation(updated.rows[0]!), delivery });
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.post<{ Params: { id: string } }>('/v1/reservations/:id/accept-proposal', async (request, reply) => {
    const body = obj(request.body);
    if (!uuid.test(request.params.id) || !body || !integer(body.expectedRevision, 0, 1_000_000_000))
      return reply.code(400).send({ error: 'invalid_acceptance' });
    if (!receiptHash(request)) return reply.code(401).send({ error: 'receipt_required' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const row = await visitorReservation(client, request.params.id, request);
      if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'reservation_not_found' }); }
      if ((row.state !== 'proposed' && row.state !== 'change_proposed') || row.revision !== body.expectedRevision) {
        await client.query('rollback'); return reply.code(409).send({ error: 'revision_conflict' });
      }
      const nextState = row.state === 'change_proposed' ? 'change_accepted' : 'customer_accepted';
      const updated = await client.query<Reservation>(
        `update field.reservations set state = $2, revision = revision + 1,
          proposal_accepted_at = now(), updated_at = now() where id = $1 returning *`, [row.id, nextState]);
      await recordEvent(client, row, nextState, 'field.reservation.proposal_accepted', 'customer', null,
        { proposalStartAt: iso(row.proposal_start_at) }, updated.rows[0]!.revision);
      await outbox(client, row.organization_id, 'field.reservation.proposal_accepted', row.id,
        { reservationId: row.id, revision: updated.rows[0]!.revision, notification: 'pending' });
      await client.query('commit');
      return { ...publicReservation(updated.rows[0]!), delivery: 'pending' };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.post<{ Params: { id: string } }>('/v1/reservations/:id/change-request', async (request, reply) => {
    const body = obj(request.body);
    if (!uuid.test(request.params.id) || !body || !integer(body.expectedRevision, 0, 1_000_000_000)
        || !text(body.preferredTimeText, 500)) return reply.code(400).send({ error: 'invalid_change_request' });
    if (!receiptHash(request)) return reply.code(401).send({ error: 'receipt_required' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const row = await visitorReservation(client, request.params.id, request);
      if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'reservation_not_found' }); }
      if (row.state !== 'confirmed' || row.revision !== body.expectedRevision) {
        await client.query('rollback'); return reply.code(409).send({ error: 'revision_conflict' });
      }
      const updated = await client.query<Reservation>(
        `update field.reservations set state = 'change_requested', revision = revision + 1,
          change_preferred_text = $2, proposal_start_at = null, proposal_end_at = null,
          proposal_accepted_at = null, updated_at = now() where id = $1 returning *`,
        [row.id, body.preferredTimeText.trim()]);
      await recordEvent(client, row, 'change_requested', 'field.reservation.change_requested', 'customer', null,
        { preferredTimeText: body.preferredTimeText.trim() }, updated.rows[0]!.revision);
      await outbox(client, row.organization_id, 'field.reservation.change_requested', row.id,
        { reservationId: row.id, revision: updated.rows[0]!.revision, notification: 'pending' });
      await client.query('commit');
      return { ...publicReservation(updated.rows[0]!), delivery: 'pending' };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.post<{ Params: { id: string } }>('/v1/reservations/:id/cancel-request', async (request, reply) => {
    const body = obj(request.body);
    if (!uuid.test(request.params.id) || !body || !integer(body.expectedRevision, 0, 1_000_000_000)
        || !text(body.reason, 500)) return reply.code(400).send({ error: 'invalid_cancel_request' });
    if (!receiptHash(request)) return reply.code(401).send({ error: 'receipt_required' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const row = await visitorReservation(client, request.params.id, request);
      if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'reservation_not_found' }); }
      const allowed = ['requested', 'proposed', 'customer_accepted', 'confirmed',
        'change_requested', 'change_proposed', 'change_accepted'];
      if (!allowed.includes(row.state) || row.revision !== body.expectedRevision) {
        await client.query('rollback'); return reply.code(409).send({ error: 'revision_conflict' });
      }
      const hasOccupancy = row.confirmed_start_at !== null;
      const nextState = hasOccupancy ? 'cancel_requested' : 'canceled';
      const updated = await client.query<Reservation>(
        `update field.reservations set state = $2, revision = revision + 1,
          updated_at = now() where id = $1 returning *`, [row.id, nextState]);
      await recordEvent(client, row, nextState, 'field.reservation.cancel_requested', 'customer', null,
        { reason: body.reason.trim() }, updated.rows[0]!.revision);
      await outbox(client, row.organization_id, 'field.reservation.cancel_requested', row.id,
        { reservationId: row.id, revision: updated.rows[0]!.revision, notification: 'pending' });
      await client.query('commit');
      return { ...publicReservation(updated.rows[0]!), delivery: 'pending' };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.post<{ Params: { id: string } }>('/v1/owner/reservations/:id/confirm', async (request, reply) => {
    const owner = await ownerOrganization(request, reply, runtime);
    if (!owner) return reply;
    const body = obj(request.body);
    if (!uuid.test(request.params.id) || !body || !integer(body.expectedRevision, 0, 1_000_000_000)
        || !integer(body.expectedCatalogRevision, 1, 1_000_000_000))
      return reply.code(400).send({ error: 'invalid_confirmation' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const found = await client.query<Reservation>(
        'select * from field.reservations where id = $1 and organization_id = $2 for update', [request.params.id, owner.id],
      );
      const reservation = found.rows[0];
      if (!reservation) { await client.query('rollback'); return reply.code(404).send({ error: 'reservation_not_found' }); }
      if (!['requested', 'customer_accepted', 'change_accepted'].includes(reservation.state)
          || reservation.revision !== body.expectedRevision) {
        await client.query('rollback'); return reply.code(409).send({ error: 'revision_conflict' });
      }
      const release = await releaseFor(client, owner.id);
      if (!release || release.revision !== reservation.catalog_revision || release.revision !== body.expectedCatalogRevision) {
        await client.query('rollback'); return reply.code(409).send({ error: 'catalog_stale' });
      }
      const policy = await policyFor(client, owner.id);
      if (!policy) { await client.query('rollback'); return reply.code(409).send({ error: 'policy_not_set' }); }
      const acceptedProposal = reservation.state === 'customer_accepted' || reservation.state === 'change_accepted';
      const start = acceptedProposal ? reservation.proposal_start_at
        : reservation.booking_mode === 'slot' ? reservation.requested_start_at : validInstant(body.startAt);
      if (!start || (acceptedProposal && body.startAt !== undefined)
          || (reservation.booking_mode === 'slot' && body.startAt !== undefined)) {
        await client.query('rollback'); return reply.code(400).send({ error: 'invalid_confirmation_time' });
      }
      const day = localDay(start, policy.timezone);
      const slots = await availableSlots(client, owner.id, policy, reservation.service_snapshot, day, true);
      if (!slots.some(slot => slot.startAt === start.toISOString())) {
        await client.query('rollback'); return reply.code(409).send({ error: 'slot_unavailable' });
      }
      const end = new Date(start.getTime() + reservation.service_snapshot.durationMinutes * 60_000);
      const occupiedStart = new Date(start.getTime() - policy.before_minutes * 60_000);
      const occupiedEnd = new Date(end.getTime() + policy.after_minutes * 60_000);
      if (reservation.state === 'change_accepted') {
        const swapped = await client.query(
          `update field.occupancies set occupied = tstzrange($2::timestamptz, $3::timestamptz, '[)')
           where reservation_id = $1 and organization_id = $4`,
          [reservation.id, occupiedStart, occupiedEnd, owner.id],
        );
        if (!swapped.rowCount) { await client.query('rollback'); return reply.code(409).send({ error: 'occupancy_missing' }); }
      } else {
        await client.query(
          `insert into field.occupancies (id, organization_id, reservation_id, source, occupied, created_by)
           values ($1, $2, $3, 'reservation', tstzrange($4::timestamptz, $5::timestamptz, '[)'), $6)`,
          [randomUUID(), owner.id, reservation.id, occupiedStart, occupiedEnd, owner.userId],
        );
      }
      const updated = await client.query<Reservation>(
        `update field.reservations set state = 'confirmed', revision = revision + 1,
          confirmed_start_at = $2, confirmed_end_at = $3, updated_at = now()
         where id = $1 returning *`, [reservation.id, start, end],
      );
      const delivery = await ownerNotificationDelivery(client, reservation);
      await outbox(client, owner.id, 'field.reservation.confirmed', reservation.id,
        { reservationId: reservation.id, revision: updated.rows[0]!.revision, notification: delivery });
      await recordEvent(client, reservation, 'confirmed', reservation.state === 'change_accepted'
        ? 'field.reservation.changed' : 'field.reservation.confirmed', 'owner', owner.userId,
      { startAt: start.toISOString(), endAt: end.toISOString(), catalogRevision: release.revision }, updated.rows[0]!.revision);
      await client.query('commit');
      return reply.code(201).send({ ...publicReservation(updated.rows[0]!), delivery });
    } catch (error) {
      await client.query('rollback');
      if (sqlError(error, '23P01')) return reply.code(409).send({ error: 'time_conflict' });
      throw error;
    } finally { client.release(); }
  });

  app.post('/v1/owner/blocks', async (request, reply) => {
    const owner = await ownerOrganization(request, reply, runtime);
    if (!owner) return reply;
    const body = obj(request.body);
    const start = validInstant(body?.startAt);
    const end = validInstant(body?.endAt);
    if (!start || !end || start >= end || end.getTime() - start.getTime() > 30 * 86_400_000
        || (body?.label !== undefined && !text(body.label, 160)))
      return reply.code(400).send({ error: 'invalid_block' });
    const id = randomUUID();
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into field.occupancies (id, organization_id, source, label, occupied, created_by)
         values ($1, $2, 'manual', $3, tstzrange($4::timestamptz, $5::timestamptz, '[)'), $6)`,
        [id, owner.id, body?.label ?? null, start, end, owner.userId],
      );
      await outbox(client, owner.id, 'field.calendar.blocked', id, { blockId: id });
      await client.query('commit');
      return reply.code(201).send({ id, startAt: start.toISOString(), endAt: end.toISOString() });
    } catch (error) {
      await client.query('rollback');
      if (sqlError(error, '23P01')) return reply.code(409).send({ error: 'time_conflict' });
      throw error;
    } finally { client.release(); }
  });

  app.get('/v1/owner/blocks', async (request, reply) => {
    const owner = await ownerOrganization(request, reply, runtime);
    if (!owner) return reply;
    const result = await runtime.pool.query<{ id: string; label: string; start_at: Date; end_at: Date }>(
      `select id, label, lower(occupied) as start_at, upper(occupied) as end_at
       from field.occupancies where organization_id = $1 and source = 'manual'
       order by lower(occupied) desc limit 100`, [owner.id]);
    return { blocks: result.rows.map(row => ({ id: row.id, label: row.label,
      startAt: row.start_at.toISOString(), endAt: row.end_at.toISOString() })) };
  });

  app.delete<{ Params: { id: string } }>('/v1/owner/blocks/:id', async (request, reply) => {
    const owner = await ownerOrganization(request, reply, runtime);
    if (!owner) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'block_not_found' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const deleted = await client.query(
        `delete from field.occupancies where id = $1 and organization_id = $2 and source = 'manual' returning id`,
        [request.params.id, owner.id]);
      if (!deleted.rowCount) { await client.query('rollback'); return reply.code(404).send({ error: 'block_not_found' }); }
      await outbox(client, owner.id, 'field.calendar.block_removed', request.params.id,
        { blockId: request.params.id });
      await client.query('commit');
      return reply.code(204).send();
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.post<{ Params: { id: string } }>('/v1/owner/reservations/:id/cancel', async (request, reply) => {
    const owner = await ownerOrganization(request, reply, runtime);
    if (!owner) return reply;
    const body = obj(request.body);
    if (!uuid.test(request.params.id) || !body || !integer(body.expectedRevision, 0, 1_000_000_000)
        || !text(body.reason, 500)) return reply.code(400).send({ error: 'invalid_cancellation' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const found = await client.query<Reservation>(
        'select * from field.reservations where id = $1 and organization_id = $2 for update', [request.params.id, owner.id]);
      const row = found.rows[0];
      if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'reservation_not_found' }); }
      if (!['confirmed', 'cancel_requested', 'change_requested', 'change_proposed', 'change_accepted'].includes(row.state)
          || row.revision !== body.expectedRevision) {
        await client.query('rollback'); return reply.code(409).send({ error: 'revision_conflict' });
      }
      await client.query('delete from field.occupancies where reservation_id = $1 and organization_id = $2', [row.id, owner.id]);
      const updated = await client.query<Reservation>(
        `update field.reservations set state = 'canceled', revision = revision + 1,
          updated_at = now() where id = $1 returning *`, [row.id]);
      await recordEvent(client, row, 'canceled', 'field.reservation.canceled', 'owner', owner.userId,
        { reason: body.reason.trim() }, updated.rows[0]!.revision);
      const delivery = await ownerNotificationDelivery(client, row);
      await outbox(client, owner.id, 'field.reservation.canceled', row.id,
        { reservationId: row.id, revision: updated.rows[0]!.revision, notification: delivery });
      await client.query('commit');
      return { ...publicReservation(updated.rows[0]!), delivery };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.post<{ Params: { id: string } }>('/v1/owner/reservations/:id/decision', async (request, reply) => {
    const owner = await ownerOrganization(request, reply, runtime);
    if (!owner) return reply;
    const body = obj(request.body);
    const action = body?.action;
    const actions = ['reject', 'expire', 'complete', 'no_show', 'decline_cancel', 'decline_change'];
    if (!uuid.test(request.params.id) || !body || !integer(body.expectedRevision, 0, 1_000_000_000)
        || !actions.includes(action as string) || !text(body.reason, 500))
      return reply.code(400).send({ error: 'invalid_decision' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const found = await client.query<Reservation>(
        'select * from field.reservations where id = $1 and organization_id = $2 for update', [request.params.id, owner.id]);
      const row = found.rows[0];
      if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'reservation_not_found' }); }
      const allowed = action === 'reject' || action === 'expire'
        ? ['requested', 'proposed', 'customer_accepted']
        : action === 'decline_cancel' ? ['cancel_requested']
          : action === 'decline_change' ? ['change_requested', 'change_proposed', 'change_accepted']
            : ['confirmed'];
      if (!allowed.includes(row.state) || row.revision !== body.expectedRevision) {
        await client.query('rollback'); return reply.code(409).send({ error: 'revision_conflict' });
      }
      if ((action === 'complete' || action === 'no_show')
          && (!row.confirmed_end_at || row.confirmed_end_at.getTime() > Date.now())) {
        await client.query('rollback'); return reply.code(409).send({ error: 'reservation_not_ended' });
      }
      const nextState = action === 'decline_cancel' || action === 'decline_change' ? 'confirmed'
        : action === 'complete' ? 'completed' : action === 'no_show' ? 'no_show'
          : action === 'expire' ? 'expired' : 'rejected';
      const updated = await client.query<Reservation>(
        `update field.reservations set state = $2, revision = revision + 1,
          proposal_start_at = case when $3 then null else proposal_start_at end,
          proposal_end_at = case when $3 then null else proposal_end_at end,
          proposal_accepted_at = case when $3 then null else proposal_accepted_at end,
          updated_at = now() where id = $1 returning *`,
        [row.id, nextState, action === 'decline_change']);
      const eventType = `field.reservation.${action}`;
      await recordEvent(client, row, nextState, eventType, 'owner', owner.userId,
        { reason: body.reason.trim() }, updated.rows[0]!.revision);
      const notification = action === 'no_show' || action === 'complete' ? 'not_applicable'
        : await ownerNotificationDelivery(client, row);
      await outbox(client, owner.id, eventType, row.id,
        { reservationId: row.id, revision: updated.rows[0]!.revision, notification });
      await client.query('commit');
      return { ...publicReservation(updated.rows[0]!), delivery: notification };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.post('/v1/owner/reservations/manual', async (request, reply) => {
    const owner = await ownerOrganization(request, reply, runtime);
    if (!owner) return reply;
    const body = obj(request.body);
    const start = validInstant(body?.startAt);
    if (!body || !start || typeof body.serviceId !== 'string' || !uuid.test(body.serviceId)
        || !text(body.name, 80) || !text(body.phone, 30))
      return reply.code(400).send({ error: 'invalid_manual_reservation' });
    const submittedKey = request.headers['idempotency-key'];
    if (typeof submittedKey !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(submittedKey))
      return reply.code(400).send({ error: 'invalid_submission_key' });
    const submissionKeyHash = hash(submittedKey);
    const requestHash = bodyHash({ serviceId: body.serviceId, startAt: start.toISOString(),
      name: body.name.trim(), phone: body.phone.trim() });
    const replay = (row: Reservation) => row.source === 'owner_manual'
      && row.submission_request_hash === requestHash
      ? reply.header('Cache-Control', 'no-store').code(200)
        .send({ ...publicReservation(row), delivery: 'not_applicable' })
      : reply.code(409).send({ error: 'idempotency_conflict' });
    const old = await runtime.pool.query<Reservation>(
      'select * from field.reservations where organization_id = $1 and submission_key_hash = $2',
      [owner.id, submissionKeyHash]);
    if (old.rows[0]) return replay(old.rows[0]);
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${owner.id}:${submissionKeyHash}`]);
      const locked = await client.query<Reservation>(
        'select * from field.reservations where organization_id = $1 and submission_key_hash = $2',
        [owner.id, submissionKeyHash]);
      if (locked.rows[0]) {
        await client.query('rollback'); return replay(locked.rows[0]);
      }
      if (await rejectExpiredTrial(reply, client, owner.id)) {
        await client.query('rollback'); return reply;
      }
      const release = await releaseFor(client, owner.id);
      const service = release?.content.services.find(item => item.id === body.serviceId);
      const policy = await policyFor(client, owner.id);
      if (!release || !service || !policy) {
        await client.query('rollback'); return reply.code(409).send({ error: 'catalog_or_policy_not_ready' });
      }
      if (!(await availableSlots(client, owner.id, policy, service, localDay(start, policy.timezone), true))
        .some(slot => slot.startAt === start.toISOString())) {
        await client.query('rollback'); return reply.code(409).send({ error: 'slot_unavailable' });
      }
      const end = new Date(start.getTime() + service.durationMinutes * 60_000);
      const id = randomUUID();
      const inserted = await client.query<Reservation>(
        `insert into field.reservations (id, organization_id, catalog_revision, service_id, service_snapshot,
          booking_mode, customer_name, customer_phone, timezone, state, source, confirmed_start_at,
          confirmed_end_at, submission_key_hash, submission_request_hash)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, 'confirmed', 'owner_manual', $10, $11, $12, $13)
         on conflict (organization_id, submission_key_hash) do nothing
         returning *`,
        [id, owner.id, release.revision, service.id, JSON.stringify(service), service.bookingMode,
          body.name.trim(), body.phone.trim(), policy.timezone, start, end,
          submissionKeyHash, requestHash],
      );
      if (!inserted.rows[0]) {
        await client.query('rollback');
        const collided = await runtime.pool.query<Reservation>(
          'select * from field.reservations where organization_id = $1 and submission_key_hash = $2',
          [owner.id, submissionKeyHash]);
        return collided.rows[0] ? replay(collided.rows[0])
          : reply.code(409).send({ error: 'submission_retry_failed' });
      }
      await client.query(
        `insert into field.occupancies (id, organization_id, reservation_id, source, occupied, created_by)
         values ($1, $2, $3, 'reservation', tstzrange($4::timestamptz, $5::timestamptz, '[)'), $6)`,
        [randomUUID(), owner.id, id,
          new Date(start.getTime() - policy.before_minutes * 60_000),
          new Date(end.getTime() + policy.after_minutes * 60_000), owner.userId],
      );
      await recordEvent(client, inserted.rows[0]!, 'confirmed', 'field.reservation.manual_recorded',
        'owner', owner.userId, { startAt: start.toISOString(), consent: 'not_recorded' }, 0);
      await outbox(client, owner.id, 'field.reservation.manual_recorded', id,
        { reservationId: id, notification: 'not_applicable' });
      await client.query('commit');
      return reply.code(201).send({ ...publicReservation(inserted.rows[0]!), delivery: 'not_applicable' });
    } catch (error) {
      await client.query('rollback');
      if (sqlError(error, '23P01')) return reply.code(409).send({ error: 'time_conflict' });
      throw error;
    } finally { client.release(); }
  });
}

function policyResponse(policy: Policy) {
  return { revision: policy.revision, timezone: policy.timezone, weekly: policy.weekly,
    closedDates: policy.closed_dates, specialDates: policy.special_dates,
    beforeMinutes: policy.before_minutes, afterMinutes: policy.after_minutes,
    minLeadMinutes: policy.min_lead_minutes, horizonDays: policy.horizon_days };
}
