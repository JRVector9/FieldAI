import type { FastifyInstance } from 'fastify';
import type { BusinessRuntime } from './business.js';
import { requireAdmin } from './admin-auth.js';

type AdminCounts = {
  organizations: string;
  openInquiries: string;
  blockedCustomerNotifications: string;
  activeDeployments: string;
  publisherOrganizations: string;
  pendingOutbox: string;
  memberships: string;
  approvedAgentOrganizations: string;
  verifiedOwnedEmbeds: string;
  activeTrials: string;
  cancelRequestedTrials: string;
};

type AdminIncident = {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  state: 'pending' | 'blocked_integration';
};

export function registerAgentAdminRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get('/v1/admin/overview', async (request, reply) => {
    const admin = await requireAdmin(request, reply, runtime);
    if (!admin) return reply;
    const { userId } = admin;
    const result = await runtime.pool.query<AdminCounts>(`
      select
        (select count(*)::text from ap.organizations) as "organizations",
        (select count(*)::text from ap.inquiries where state not in ('closed', 'spam')) as "openInquiries",
        (select count(*)::text from ap.notification_events
          where audience = 'customer' and state = 'blocked_integration') as "blockedCustomerNotifications",
        (select count(*)::text from ap.deployments where status = 'active' and not moderation_restricted) as "activeDeployments",
        (select count(*)::text from ap.publishers) as "publisherOrganizations",
        (select count(*)::text from ap.outbox o where delivered_at is null
          and not exists (select 1 from ap.notification_events n where n.outbox_id = o.id
            and n.state = 'not_applicable')) as "pendingOutbox",
        (select count(*)::text from ap.memberships) as "memberships",
        (select count(distinct organization_id)::text from ap.agent_releases) as "approvedAgentOrganizations",
        (select count(*)::text from ap.deployments
          where kind = 'owned_embed' and verified_at is not null) as "verifiedOwnedEmbeds",
        (select count(*)::text from ap.trial_subscriptions where ends_at > now()) as "activeTrials",
        (select count(*)::text from ap.trial_subscriptions
          where cancel_requested_at is not null) as "cancelRequestedTrials"
    `);
    const incidents = await runtime.pool.query<AdminIncident>(`
      select o.id::text as "eventId", o.event_type as "eventType",
        o.occurred_at as "occurredAt",
        case when n.audience = 'customer' and n.state = 'blocked_integration'
          then 'blocked_integration' else 'pending' end as "state"
      from ap.outbox o
      left join ap.notification_events n on n.outbox_id = o.id
      where (o.delivered_at is null or (n.audience = 'customer' and n.state = 'blocked_integration'))
        and (n.state is null or n.state <> 'not_applicable')
      order by o.occurred_at desc, o.id desc limit 20
    `);
    await runtime.pool.query(
      `insert into ap.admin_access_audit(actor_user_id, resource) values ($1, 'overview')`, [userId],
    );
    const adminReads = await runtime.pool.query<{ count: string }>(
      'select count(*)::text as count from ap.admin_access_audit',
    );
    const accesses = await runtime.pool.query<{
      actorUserId: string; resource: string; accessedAt: Date;
    }>(`select actor_user_id as "actorUserId", resource, accessed_at as "accessedAt"
      from ap.admin_access_audit order by id desc limit 20`);
    return { product: 'agent', actorUserId: userId, role: admin.role, snapshotAt: new Date().toISOString(),
      counts: { ...result.rows[0], adminReads: adminReads.rows[0]?.count ?? '0' },
      recentIncidents: incidents.rows, recentAdminAccesses: accesses.rows };
  });
}
