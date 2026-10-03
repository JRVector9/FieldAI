import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { requireAdmin } from './admin-auth.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const admin = await requireAdmin(request, reply, runtime);
    if (!admin) return reply;
    const { userId } = admin;
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
    return { product: 'field', actorUserId: userId, role: admin.role, snapshotAt: new Date().toISOString(),
      counts: { ...result.rows[0], adminReads: adminReads.rows[0]?.count ?? '0' },
      recentIncidents: incidents.rows, recentAdminAccesses: accesses.rows };
  });

  // 멈춘 조직 삭제 요청(next_attempt_at=infinity: 실행 실패 상한·저장소 권한 부족) 목록(추가). 운영자·감사자 모두 조회한다.
  app.get<{ Querystring: { status?: string } }>('/v1/admin/organization-deletions', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const admin = await requireAdmin(request, reply, runtime);
    if (!admin) return reply;
    if (request.query.status !== 'stopped') return reply.code(400).send({ error: 'invalid_status' });
    const rows = await runtime.pool.query(`select r.id,r.organization_id as "organizationId",o.name as "organizationName",
        r.requested_at as "requestedAt",r.scheduled_at as "scheduledAt",r.attempt_count as "attemptCount",
        coalesce((r.steps->>'executionFailures')::int,0) as "executionFailures",r.last_error as "lastError",
        coalesce(r.steps->'operatorResumes','[]'::jsonb) as "operatorResumes"
      from field.organization_deletion_requests r join field.organizations o on o.id=r.organization_id
      where r.status='scheduled' and r.next_attempt_at='infinity'::timestamptz order by r.scheduled_at,r.id limit 100`);
    return { product: 'field', role: admin.role, deletions: rows.rows };
  });

  // 멈춘 조직 삭제 요청 다시 실행(추가). operator만, 사유 필수. 다음 실행 시각을 지금으로 되돌리고 오류·실행 실패 횟수를 초기화한다.
  // 감사: 기존 admin_access_audit는 조회(resource='overview') 전용 check 제약이라, 요청 행 자체의 감사 기록(steps.operatorResumes)에
  // 운영자·시각·사유·직전 오류·직전 실패 횟수를 같은 트랜잭션으로 덧붙인다. 이 기록은 관리자 목록에서만 보이고
  // owner·구성원 삭제 상태 응답(account-deletion.ts view)에서는 빠진다.
  app.post<{ Params: { id: string } }>('/v1/admin/organization-deletions/:id/resume', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const admin = await requireAdmin(request, reply, runtime, { role: 'operator' });
    if (!admin) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'deletion_request_not_found' });
    const body = request.body !== null && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 10 || reason.length > 500) return reply.code(400).send({ error: 'invalid_reason' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const row = (await db.query<{ status: string; stopped: boolean }>(
        `select status,next_attempt_at='infinity'::timestamptz as stopped from field.organization_deletion_requests where id=$1 for update`,
        [request.params.id])).rows[0];
      if (!row) { await db.query('rollback'); return reply.code(404).send({ error: 'deletion_request_not_found' }); }
      if (row.status !== 'scheduled' || !row.stopped) { await db.query('rollback'); return reply.code(409).send({ error: 'deletion_not_stopped' }); }
      const resumed = (await db.query<{ id: string; nextAttemptAt: Date }>(`update field.organization_deletion_requests set
          next_attempt_at=clock_timestamp(),last_error=null,
          steps=steps||jsonb_build_object('executionFailures',0,'operatorResumes',coalesce(steps->'operatorResumes','[]'::jsonb)
            ||jsonb_build_array(jsonb_build_object('actorUserId',$2::text,'at',clock_timestamp(),'reason',$3::text,
              'previousError',last_error,'previousExecutionFailures',coalesce((steps->>'executionFailures')::int,0))))
        where id=$1 returning id,next_attempt_at as "nextAttemptAt"`, [request.params.id, admin.userId, reason])).rows[0]!;
      await db.query('commit');
      return { product: 'field', id: resumed.id, status: 'scheduled', nextAttemptAt: resumed.nextAttemptAt.toISOString() };
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
