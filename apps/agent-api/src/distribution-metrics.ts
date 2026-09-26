import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { BusinessRuntime } from './business.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Scope = { kind: 'business' | 'publisher'; id: string };
type CountRow = { week_start: string; event_type: 'engagement_started' | 'contact_submitted'; total: string };
type BookingCountRow = { week_start: string; total: string };

function weekStart(date: Date) {
  const day = date.getUTCDay();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((day + 6) % 7)));
}

function band(total: number) {
  if (total < 5) return 'under_5';
  if (total < 10) return '5-9';
  if (total < 20) return '10-19';
  if (total < 50) return '20-49';
  if (total < 100) return '50-99';
  return '100+';
}

async function metrics(runtime: BusinessRuntime, scope: Scope) {
  const end = weekStart(new Date());
  const start = new Date(end.getTime() - 8 * 7 * 86400000);
  const [rows, bookings, connection] = await Promise.all([runtime.pool.query<CountRow>(
    `select date_trunc('week', e.occurred_at at time zone 'UTC')::date::text as week_start,
       e.event_type, count(*)::text as total
     from ap.distribution_events e join ap.placements p on p.id = e.placement_id
     where e.traffic_class = 'live' and e.occurred_at >= $2 and e.occurred_at < $3
       and ${scope.kind === 'publisher' ? 'p.publisher_id' : 'p.organization_id'} = $1
    group by 1, 2`, [scope.id, start.toISOString(), end.toISOString()],
  ), runtime.pool.query<BookingCountRow>(
    `select date_trunc('week', first_confirmation.occurred_at at time zone 'UTC')::date::text as week_start,
       count(*)::text as total
     from (select distinct on (e.reservation_id) e.reservation_id, e.occurred_at,
         i.distribution_traffic_class
       from ap.field_reservation_events e
       join ap.field_action_requests a on a.id = e.action_request_id
         and a.organization_id = e.organization_id and a.reservation_id = e.reservation_id
       join ap.inquiries i on i.id = a.inquiry_id and i.organization_id = a.organization_id
       join ap.placements p on p.id = i.placement_id and p.organization_id = i.organization_id
       where e.event_type = 'field.reservation.confirmed' and e.state = 'confirmed'
         and a.kind = 'reservation_request' and a.state = 'accepted_external'
         and ${scope.kind === 'publisher' ? 'p.publisher_id' : 'p.organization_id'} = $1
       order by e.reservation_id, e.occurred_at, e.id) first_confirmation
     where first_confirmation.distribution_traffic_class = 'live'
       and first_confirmation.occurred_at >= $2 and first_confirmation.occurred_at < $3
     group by 1`, [scope.id, start.toISOString(), end.toISOString()],
  ), runtime.pool.query<{ available: boolean }>(
    `select exists (select 1 from ap.field_connections c
       join ap.oauth_selections s on s.id = c.ap_grant_id
       where c.status = 'review_required' and s.revoked_at is null
         and c.scopes @> array['field.requests.create']::text[]
         and ${scope.kind === 'publisher'
    ? `exists (select 1 from ap.placements p where p.publisher_id = $1
             and p.organization_id = c.ap_organization_id)`
    : 'c.ap_organization_id = $1'}) as available`, [scope.id],
  )]);
  const counts = new Map(rows.rows.map(row => [`${row.week_start}:${row.event_type}`, Number(row.total)]));
  const bookingCounts = new Map(bookings.rows.map(row => [row.week_start, Number(row.total)]));
  const bookingConfirmed = connection.rows[0]?.available || bookings.rows.length > 0
    ? 'available' : 'unsupported_unconnected';
  const periods = Array.from({ length: 8 }, (_unused, index) => {
    const from = new Date(end.getTime() - (index + 1) * 7 * 86400000);
    const to = new Date(from.getTime() + 7 * 86400000);
    const key = from.toISOString().slice(0, 10);
    return { weekStart: key, weekEnd: to.toISOString().slice(0, 10),
      engagements: band(counts.get(`${key}:engagement_started`) ?? 0),
      contacts: band(counts.get(`${key}:contact_submitted`) ?? 0),
      bookings: bookingConfirmed === 'available'
        ? band(bookingCounts.get(key) ?? 0) : 'unsupported_unconnected' };
  });
  return { periods, bookingConfirmed, revenue: 'not_measured' };
}

function csv(data: Awaited<ReturnType<typeof metrics>>) {
  return ['week_start,week_end,engagements,contacts,booking_confirmed,revenue',
    ...data.periods.map(row => [row.weekStart, row.weekEnd, row.engagements, row.contacts,
      row.bookings, data.revenue].join(','))].join('\r\n') + '\r\n';
}

async function actor(request: FastifyRequest, reply: FastifyReply, runtime: BusinessRuntime,
  publisherId?: string) {
  const user = await runtime.resolveUserId(request.headers);
  if (!user) { reply.code(401).send({ error: 'authentication_required' }); return null; }
  if (publisherId !== undefined) {
    if (!uuid.test(publisherId)) { reply.code(404).send({ error: 'publisher_not_found' }); return null; }
    const member = await runtime.pool.query(
      'select 1 from ap.publisher_memberships where publisher_id = $1 and user_id = $2', [publisherId, user]);
    if (!member.rows[0]) { reply.code(404).send({ error: 'publisher_not_found' }); return null; }
    return { kind: 'publisher' as const, id: publisherId };
  }
  const header = request.headers['x-organization-id'];
  if (header !== undefined && (typeof header !== 'string' || !uuid.test(header))) {
    reply.code(400).send({ error: 'invalid_organization_id' }); return null;
  }
  const member = await runtime.pool.query<{ organization_id: string }>(
    `select organization_id from ap.memberships where user_id = $1
     and ($2::uuid is null or organization_id = $2::uuid) order by created_at limit 1`, [user, header ?? null]);
  if (!member.rows[0]) { reply.code(404).send({ error: 'organization_not_found' }); return null; }
  return { kind: 'business' as const, id: member.rows[0].organization_id };
}

export function registerDistributionMetricsRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  const business = async (request: FastifyRequest, reply: FastifyReply, exportCsv: boolean) => {
    const scope = await actor(request, reply, runtime);
    if (!scope) return reply;
    const data = await metrics(runtime, scope);
    reply.header('Cache-Control', 'private, no-store');
    if (exportCsv) return reply.header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="ap-distribution-metrics.csv"').send(csv(data));
    return data;
  };
  const publisher = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply,
    exportCsv: boolean) => {
    const scope = await actor(request, reply, runtime, request.params.id);
    if (!scope) return reply;
    const data = await metrics(runtime, scope);
    reply.header('Cache-Control', 'private, no-store');
    if (exportCsv) return reply.header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="ap-distribution-metrics.csv"').send(csv(data));
    return data;
  };
  app.get('/v1/distribution/metrics', (request, reply) => business(request, reply, false));
  app.get('/v1/distribution/metrics.csv', (request, reply) => business(request, reply, true));
  app.get<{ Params: { id: string } }>('/v1/publishers/:id/metrics', (request, reply) => publisher(request, reply, false));
  app.get<{ Params: { id: string } }>('/v1/publishers/:id/metrics.csv', (request, reply) => publisher(request, reply, true));
}
