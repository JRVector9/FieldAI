import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { BusinessRuntime } from './business.js';
import { requireAdmin } from './admin-auth.js';
import { retentionAdminFor } from './retention-routes.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function decodeCursor(value:string|undefined) {
  if(value===undefined)return null;
  if(value.length>256||!/^[A-Za-z0-9_-]+$/.test(value))return undefined;
  try {
    const decoded=Buffer.from(value,'base64url');if(decoded.toString('base64url')!==value)return undefined;
    const cursor=JSON.parse(decoded.toString('utf8')) as {at?:unknown;id?:unknown};
    if(!cursor||Object.keys(cursor).length!==2||typeof cursor.id!=='string'||!uuid.test(cursor.id)
      ||typeof cursor.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.at)
      ||cursor.at.startsWith('0000')||!Number.isFinite(Date.parse(cursor.at))
      ||new Date(cursor.at).toISOString()!==cursor.at.slice(0,-4)+'Z')return undefined;
    return {at:cursor.at,id:cursor.id};
  }catch{return undefined;}
}
const encodeCursor=(row:{id:string;cursorAt:string})=>Buffer.from(JSON.stringify({at:row.cursorAt,id:row.id})).toString('base64url');

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
  // A-02: same 24-hour cutoff as close-unknown. Never return customer content or reusable request payloads.
  app.get<{ Querystring: { state?: string; unreconcilable?: string; cursor?: string } }>('/v1/admin/field-actions', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const admin = await requireAdmin(request, reply, runtime);
    if (!admin) return reply;
    if (request.query.state !== 'delivery_unknown' || request.query.unreconcilable !== 'true')
      return reply.code(400).send({ error: 'invalid_filter' });
    const cursor = decodeCursor(request.query.cursor);
    if (cursor === undefined)
      return reply.code(400).send({ error: 'invalid_cursor' });
    const rows = (await runtime.pool.query(`select a.id,a.organization_id as "organizationId",o.name as "organizationName",
        a.inquiry_id as "inquiryId",a.connection_id as "connectionId",a.kind,a.consent_confirmed_at as "consentConfirmedAt",
        a.state,a.error_code as "errorCode",to_char(a.consent_confirmed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "cursorAt"
      from ap.field_action_requests a join ap.organizations o on o.id=a.organization_id
      where a.state='delivery_unknown' and a.consent_confirmed_at<clock_timestamp()-interval '24 hours'
        and ($1::timestamptz is null or (a.consent_confirmed_at,a.id)>($1::timestamptz,$2::uuid))
      order by a.consent_confirmed_at,a.id limit 101`, [cursor?.at ?? null,cursor?.id??null])).rows;
    const page=rows.slice(0,100),actions=page.map(row=>{const action={...row};delete action.cursorAt;return action;});
    await runtime.pool.query("insert into ap.admin_access_audit(actor_user_id,resource) values ($1,'field_actions')", [admin.userId]);
    return { product: 'agent', role: admin.role, actions, nextCursor: rows.length > 100 ? encodeCursor(page.at(-1)!) : null };
  });

  // A-03: email content contains authentication links even in mock. Only masked delivery metadata leaves this API.
  app.get<{ Querystring: { state?: string; cursor?: string } }>('/v1/admin/email-outbox', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const admin = await requireAdmin(request, reply, runtime);
    if (!admin) return reply;
    const state = request.query.state, cursor = decodeCursor(request.query.cursor);
    if (state !== undefined && !['pending', 'sent', 'failed', 'blocked_integration', 'suppressed_duplicate'].includes(state))
      return reply.code(400).send({ error: 'invalid_state' });
    if (cursor === undefined)
      return reply.code(400).send({ error: 'invalid_cursor' });
    const rows = (await runtime.pool.query(`select id,
        case when position('@' in "to")>1 then left(split_part("to",'@',1),1)||'***@'||left(split_part("to",'@',2),1)||'***'
          else '주소 비공개' end as "maskedTo",purpose,state,error_code as "errorCode",created_at as "createdAt",sent_at as "sentAt",
        to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "cursorAt"
      from ap.email_outbox e where ($1::text is null or e.state=$1)
        and ($2::timestamptz is null or (e.created_at,e.id)<($2::timestamptz,$3::uuid))
      order by e.created_at desc,e.id desc limit 101`, [state ?? null,cursor?.at??null,cursor?.id??null])).rows;
    const page=rows.slice(0,100),emails=page.map(row=>{const email={...row};delete email.cursorAt;return email;});
    await runtime.pool.query("insert into ap.admin_access_audit(actor_user_id,resource) values ($1,'email_outbox')", [admin.userId]);
    return { product: 'agent', role: admin.role, emails, nextCursor: rows.length > 100 ? encodeCursor(page.at(-1)!) : null };
  });

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
      from ap.organization_deletion_requests r join ap.organizations o on o.id=r.organization_id
      where r.status='scheduled' and r.next_attempt_at='infinity'::timestamptz order by r.scheduled_at,r.id limit 100`);
    return { product: 'agent', role: admin.role, deletions: rows.rows };
  });

  // 멈춘 조직 삭제 요청 다시 실행(추가). operator만, 사유 필수. 다음 실행 시각을 지금으로 되돌리고 오류·실행 실패 횟수를 초기화한다.
  // 감사: 기존 admin_access_audit는 조회(resource='overview') 전용 check 제약이라, 요청 행 자체의 감사 기록(steps.operatorResumes)에
  // 운영자·시각·사유·직전 오류·직전 실패 횟수를 같은 트랜잭션으로 덧붙인다(전체 기록은 관리자 목록에서만, 조직 구성원 화면에는 시각·직전 오류·실패 횟수만 보인다).
  // 다른 관리자 변경 경로와 같은 Origin 검사(retentionAdminFor)를 거친다(추가).
  app.post<{ Params: { id: string } }>('/v1/admin/organization-deletions/:id/resume', async (request, reply) => {
    const userId = await retentionAdminFor(request, reply, runtime);
    if (!userId) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'deletion_request_not_found' });
    const body = request.body !== null && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    if (typeof body.reason === 'string' && body.reason.includes('\u0000')) return reply.code(400).send({ error: 'invalid_text' });
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 10 || reason.length > 500) return reply.code(400).send({ error: 'invalid_reason' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const row = (await db.query<{ status: string; stopped: boolean }>(
        `select status,next_attempt_at='infinity'::timestamptz as stopped from ap.organization_deletion_requests where id=$1 for update`,
        [request.params.id])).rows[0];
      if (!row) { await db.query('rollback'); return reply.code(404).send({ error: 'deletion_request_not_found' }); }
      if (row.status !== 'scheduled' || !row.stopped) { await db.query('rollback'); return reply.code(409).send({ error: 'deletion_not_stopped' }); }
      const resumed = (await db.query<{ id: string; nextAttemptAt: Date }>(`update ap.organization_deletion_requests set
          next_attempt_at=clock_timestamp(),last_error=null,
          steps=steps||jsonb_build_object('executionFailures',0,'operatorResumes',coalesce(steps->'operatorResumes','[]'::jsonb)
            ||jsonb_build_array(jsonb_build_object('actorUserId',$2::text,'at',clock_timestamp(),'reason',$3::text,
              'previousError',last_error,'previousExecutionFailures',coalesce((steps->>'executionFailures')::int,0))))
        where id=$1 returning id,next_attempt_at as "nextAttemptAt"`, [request.params.id, userId, reason])).rows[0]!;
      await db.query('commit');
      return { product: 'agent', id: resumed.id, status: 'scheduled', nextAttemptAt: resumed.nextAttemptAt.toISOString() };
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  // 결과 미상 Field 전달 운영자 종결(추가, P1-1). 동의 24시간이 지나 reconcile이 더 확인하지 않는 delivery_unknown만
  // operator가 사유(10~500자)와 함께 unresolved(종결)로 닫는다. Field에 새 업무를 만들지 않고, 같은 문의·연결·서비스의
  // 새 전달 금지는 unresolved에도 유지한다(000094 색인). 행위자·사유·시각은 행에, 상태 변경 사건은 outbox에 남긴다.
  app.post<{ Params: { id: string } }>('/v1/admin/field-actions/:id/close-unknown', async (request, reply) => {
    const userId = await retentionAdminFor(request, reply, runtime);
    if (!userId) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'field_action_not_found' });
    const body = request.body !== null && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    if (typeof body.reason === 'string' && body.reason.includes('\u0000')) return reply.code(400).send({ error: 'invalid_text' });
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 10 || reason.length > 500) return reply.code(400).send({ error: 'invalid_reason' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const row = (await db.query<{ organization_id: string; inquiry_id: string; connection_id: string; state: string;
        closable: boolean }>(
        `select organization_id,inquiry_id,connection_id,state,
           consent_confirmed_at<clock_timestamp()-interval '24 hours' as closable
         from ap.field_action_requests where id=$1 for update`, [request.params.id])).rows[0];
      if (!row) { await db.query('rollback'); return reply.code(404).send({ error: 'field_action_not_found' }); }
      if (row.state !== 'delivery_unknown' || !row.closable) {
        await db.query('rollback'); return reply.code(409).send({ error: 'field_action_not_closable', state: row.state });
      }
      const closed = (await db.query<{ closedAt: Date }>(`update ap.field_action_requests set state='unresolved',
          error_code='operator_closed_unknown',closed_by=$2,closed_at=clock_timestamp(),close_reason=$3,updated_at=now()
        where id=$1 returning closed_at as "closedAt"`, [request.params.id, userId, reason])).rows[0]!;
      await db.query(`insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload)
        values ($1,$2,'ap.field_action.unresolved',$3,$4::jsonb)`,
      [randomUUID(), row.organization_id, request.params.id, JSON.stringify({ actionRequestId: request.params.id,
        inquiryId: row.inquiry_id, connectionId: row.connection_id, state: 'unresolved', closedBy: userId })]);
      await db.query('commit');
      return { product: 'agent', id: request.params.id, state: 'unresolved', error: 'operator_closed_unknown',
        closedAt: closed.closedAt.toISOString() };
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
