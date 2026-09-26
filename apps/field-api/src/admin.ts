import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';

type AdminCounts = {
  organizations: string;
  openInquiries: string;
  openReservations: string;
  blockedCustomerNotifications: string;
  publishedSites: string;
  runningSiteJobs: string;
  pendingOutbox: string;
  memberships: string;
  failedSiteJobs: string;
  activeTrials: string;
  cancelRequestedTrials: string;
};

type AdminIncident = {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  state: 'pending' | 'blocked_integration';
};

export function registerFieldAdminRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get('/v1/admin/overview', async (request, reply) => {
    if (process.env.FIELD_PROFILE !== 'mock')
      return reply.code(503).send({ error: 'blocked_integration' });
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const member = await runtime.pool.query<{ role: 'operator' | 'auditor' }>(
      'select role from field.platform_admin_memberships where user_id = $1', [userId],
    );
    if (!member.rows[0]) return reply.code(403).send({ error: 'admin_membership_required' });
    const result = await runtime.pool.query<AdminCounts>(`
      select
        (select count(*)::text from field.organizations) as "organizations",
        (select count(*)::text from field.inquiries where state <> 'closed' and is_test = false) as "openInquiries",
        (select count(*)::text from field.reservations
          where state not in ('completed', 'canceled', 'rejected', 'expired')) as "openReservations",
        (select count(*)::text from field.notification_events
          where audience = 'customer' and state = 'blocked_integration') as "blockedCustomerNotifications",
        (select count(distinct site_id)::text from field.site_releases) as "publishedSites",
        (select count(*)::text from field.site_generation_jobs
          where status in ('queued', 'running')) as "runningSiteJobs",
        (select count(*)::text from field.outbox where delivered_at is null) as "pendingOutbox",
        (select count(*)::text from field.memberships) as "memberships",
        (select count(*)::text from field.site_generation_jobs where status = 'failed') as "failedSiteJobs",
        (select count(*)::text from field.trial_subscriptions where ends_at > now()) as "activeTrials",
        (select count(*)::text from field.trial_subscriptions
          where cancel_requested_at is not null) as "cancelRequestedTrials"
    `);
    const incidents = await runtime.pool.query<AdminIncident>(`
      select o.id::text as "eventId", o.event_type as "eventType",
        o.occurred_at as "occurredAt",
        case when n.audience = 'customer' and n.state = 'blocked_integration'
          then 'blocked_integration' else 'pending' end as "state"
      from field.outbox o
      left join field.notification_events n on n.outbox_id = o.id
      where o.delivered_at is null
        or (n.audience = 'customer' and n.state = 'blocked_integration')
      order by o.occurred_at desc, o.id desc limit 20
    `);
    await runtime.pool.query(
      `insert into field.admin_access_audit(actor_user_id, resource) values ($1, 'overview')`, [userId],
    );
    const adminReads = await runtime.pool.query<{ count: string }>(
      'select count(*)::text as count from field.admin_access_audit',
    );
    const accesses = await runtime.pool.query<{
      actorUserId: string; resource: string; accessedAt: Date;
    }>(`select actor_user_id as "actorUserId", resource, accessed_at as "accessedAt"
      from field.admin_access_audit order by id desc limit 20`);
    return { product: 'field', actorUserId: userId, role: member.rows[0].role, snapshotAt: new Date().toISOString(),
      counts: { ...result.rows[0], adminReads: adminReads.rows[0]?.count ?? '0' },
      recentIncidents: incidents.rows, recentAdminAccesses: accesses.rows };
  });
}
