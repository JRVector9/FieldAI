import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { requireAdmin } from './admin-auth.js';
import { organizationFor, userFor } from './sites.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const categories = ['inaccurate_information', 'unsafe_content', 'other'];
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 2000) => typeof value === 'string' && value.trim().length > 0
  && value.length <= max ? value.trim() : null;
const keyFor = (request: FastifyRequest) => typeof request.headers['idempotency-key'] === 'string'
  && uuid.test(request.headers['idempotency-key']) ? hash(request.headers['idempotency-key']) : null;
const fail = (reply: FastifyReply, status: number, error: string) => reply.code(status).send({ error });
type Report = { id: string; organization_id: string; site_id: string; revision: number; state: string;
  outcome: string | null; review_summary: string; appeal_message: string | null; appeal_decision: string | null;
  category: string; created_at: Date; updated_at: Date; description: string; public_snapshot: unknown };

async function adminFor(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime, edit = false) {
  return (await requireAdmin(request, reply, runtime, edit ? { role: 'operator' } : {}))?.userId ?? null;
}
async function allowedAccess(db: PoolClient, request: FastifyRequest, reportId: string, user: string) {
  const id = request.headers['x-support-access-id'];
  if (typeof id !== 'string' || !uuid.test(id)) return null;
  return (await db.query<{ id: string; reason: string; expires_at: Date }>(
    `select a.id,a.reason,a.expires_at from field.moderation_access_requests a
     join field.platform_admin_memberships approver on approver.user_id=a.approved_by and approver.role='operator'
     where a.id=$1 and a.report_id=$2 and a.requested_by=$3 and a.expires_at>clock_timestamp()`,
    [id, reportId, user])).rows[0] ?? null;
}
async function event(db: PoolClient, id: string, actor: string | null, action: string, reason: string,
  key?: string, requestHash?: string, result?: unknown) {
  await db.query(`insert into field.moderation_events
    (report_id,actor_user_id,action,reason,submission_key_hash,request_hash,result) values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
  [id, actor, action, reason, key ?? null, requestHash ?? null, result ? JSON.stringify(result) : null]);
}
const summary = (row: Report & { business_name?: string; site_hidden?: boolean }) => ({
  id: row.id, revision: row.revision, state: row.state, category: row.category,
  businessName: row.business_name, outcome: row.outcome, reviewSummary: row.review_summary,
  appealDecision: row.appeal_decision, siteHidden: row.site_hidden ?? false,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

export function registerFieldModerationRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.post<{ Params: { slug: string } }>('/v1/public/sites/:slug/reports', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const value = object(request.body), key = keyFor(request), description = text(value.description);
    if (!key || !description || typeof value.category !== 'string' || !categories.includes(value.category) || value.consent !== true)
      return fail(reply, 400, 'invalid_report');
    const secret = process.env.FIELD_AUTH_SECRET;
    if (!secret) throw new Error('FIELD_AUTH_SECRET is required for report submission limits');
    const requestHash = hash(JSON.stringify([value.category, description, 'field-site-report-v1']));
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const site = (await db.query<{ id: string; organization_id: string; release_id: string; content: unknown; catalog: unknown }>(
        `select s.id,s.organization_id,r.id as release_id,r.content,c.content as catalog from field.sites s
         join lateral (select * from field.site_releases where site_id=s.id order by revision desc limit 1) r on true
         join field.catalog_releases c on c.id=r.catalog_release_id where s.slug=$1 for update of s`,
        [request.params.slug])).rows[0];
      if (!site) { await db.query('rollback'); return fail(reply, 404, 'site_not_found'); }
      const previous = (await db.query<{ id: string; request_hash: string }>(
        'select id,request_hash from field.moderation_reports where site_id=$1 and submission_key_hash=$2', [site.id, key])).rows[0];
      if (previous) {
        await db.query('commit');
        return previous.request_hash === requestHash ? { id: previous.id, state: 'submitted' }
          : fail(reply, 409, 'idempotency_conflict');
      }
      // 신고 제한은 문의/예약 접수 한도와 분리한다.
      for (const [scope, subject, limit] of [['ip', request.ip, 5], ['site', site.id, 20]] as const) {
        const subjectHash = createHmac('sha256', secret).update(`field-report-${scope}-v1\0${subject}`).digest('hex');
        const window = (await db.query<{ attempts: number; retry_after: number }>(
          `insert into field.report_submission_windows(scope,subject_hash,attempts) values ($1,$2,1)
           on conflict(scope,subject_hash) do update set
             attempts=case when field.report_submission_windows.window_started_at<=clock_timestamp()-interval '15 minutes'
               then 1 else least(field.report_submission_windows.attempts+1,$3::integer+1) end,
             window_started_at=case when field.report_submission_windows.window_started_at<=clock_timestamp()-interval '15 minutes'
               then clock_timestamp() else field.report_submission_windows.window_started_at end
           returning attempts,greatest(1,ceil(extract(epoch from(window_started_at+interval '15 minutes'-clock_timestamp())))::int) as retry_after`,
          [scope, subjectHash, limit])).rows[0]!;
        if (window.attempts > limit) {
          await db.query('commit'); return reply.header('Retry-After', window.retry_after).code(429).send({ error: 'report_rate_limited' });
        }
      }
      const id = randomUUID();
      await db.query(`insert into field.moderation_reports
        (id,organization_id,site_id,site_release_id,public_snapshot,submission_key_hash,request_hash,category,description,consent_version)
        values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,'field-site-report-v1')`,
      [id, site.organization_id, site.id, site.release_id, JSON.stringify({ site: site.content, catalog: site.catalog }),
        key, requestHash, value.category, description]);
      await event(db, id, null, 'submitted', '공개 사이트 신고 검토 동의');
      await db.query('commit'); return reply.code(201).send({ id, state: 'submitted' });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  for (const owner of [false, true]) app.get<{ Querystring: { before?: string } }>(
    owner ? '/v1/owner/moderation/reports' : '/v1/admin/reports', async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      const user = owner ? await userFor(request, reply, runtime) : await adminFor(request, reply, runtime);
      if (!user) return reply;
      const org = owner ? await organizationFor(request, reply, runtime, user, 'publish') : null;
      if (owner && !org) return reply;
      const before = request.query.before;
      if (before && !uuid.test(before)) return fail(reply, 400, 'invalid_cursor');
      if (before && !(await runtime.pool.query('select 1 from field.moderation_reports where id=$1 and ($2::uuid is null or organization_id=$2)',
        [before, org?.organization_id ?? null])).rowCount) return fail(reply, 400, 'invalid_cursor');
      const rows = (await runtime.pool.query<Report & { business_name: string; site_hidden: boolean }>(
        `select r.*,o.name as business_name,exists(select 1 from field.site_visibility_holds h
           where h.site_id=r.site_id and h.released_at is null) as site_hidden
         from field.moderation_reports r join field.organizations o on o.id=r.organization_id
         where ($1::uuid is null or r.organization_id=$1) and ($2::uuid is null or (r.created_at,r.id)<
           (select created_at,id from field.moderation_reports where id=$2))
         order by r.created_at desc,r.id desc limit 101`, [org?.organization_id ?? null, before ?? null])).rows;
      return { reports: rows.slice(0, 100).map(row => ({ ...summary(row), ...(owner ? { appealMessage: row.appeal_message } : {}) })),
        nextCursor: rows.length > 100 ? rows[99]!.id : null };
    });

  app.get('/v1/admin/report-access', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if (!await adminFor(request, reply, runtime)) return reply;
    return { requests: (await runtime.pool.query(`select id,report_id as "reportId",requested_by as "requestedBy",
      reason,minutes,approved_by as "approvedBy",expires_at as "expiresAt" from field.moderation_access_requests
      where approved_by is null or expires_at>clock_timestamp() order by created_at desc limit 100`)).rows };
  });
  app.post<{ Params: { id: string } }>('/v1/admin/reports/:id/access', async (request, reply) => {
    const user = await adminFor(request, reply, runtime, true);
    if (!user) return reply;
    const value = object(request.body), reason = text(value.reason, 500), key = keyFor(request);
    if (!uuid.test(request.params.id) || !reason || !key || !Number.isInteger(value.minutes)
      || Number(value.minutes) < 1 || Number(value.minutes) > 60) return fail(reply, 400, 'invalid_access_request');
    const requestHash = hash(JSON.stringify([reason, value.minutes]));
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      if (!(await db.query('select id from field.moderation_reports where id=$1 for update', [request.params.id])).rowCount) {
        await db.query('rollback'); return fail(reply, 404, 'report_not_found');
      }
      const old = (await db.query<{ id: string; request_hash: string }>(`select id,request_hash from field.moderation_access_requests
        where report_id=$1 and requested_by=$2 and submission_key_hash=$3`, [request.params.id, user, key])).rows[0];
      if (old) { await db.query('commit'); return old.request_hash === requestHash ? { id: old.id } : fail(reply, 409, 'idempotency_conflict'); }
      const id = randomUUID();
      await db.query(`insert into field.moderation_access_requests(id,report_id,requested_by,reason,minutes,submission_key_hash,request_hash)
        values ($1,$2,$3,$4,$5,$6,$7)`, [id, request.params.id, user, reason, value.minutes, key, requestHash]);
      await event(db, request.params.id, user, 'access_requested', reason);
      await db.query('commit'); return reply.code(201).send({ id });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
  app.post<{ Params: { id: string } }>('/v1/admin/report-access/:id/approve', async (request, reply) => {
    const user = await adminFor(request, reply, runtime, true);
    if (!user) return reply;
    const reason = text(object(request.body).reason, 500);
    if (!uuid.test(request.params.id) || !reason) return fail(reply, 400, 'invalid_approval');
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const row = (await db.query<{ report_id: string; requested_by: string; approved_by: string | null; expires_at: Date | null }>(
        'select * from field.moderation_access_requests where id=$1 for update', [request.params.id])).rows[0];
      if (!row) { await db.query('rollback'); return fail(reply, 404, 'access_not_found'); }
      if (row.requested_by === user) { await db.query('rollback'); return fail(reply, 403, 'self_approval_denied'); }
      if (row.approved_by) {
        await db.query('commit'); return row.approved_by === user ? { expiresAt: row.expires_at } : fail(reply, 409, 'already_approved');
      }
      const result = await db.query(`update field.moderation_access_requests set approved_by=$2,approval_reason=$3,
        expires_at=clock_timestamp()+minutes*interval '1 minute' where id=$1 returning expires_at as "expiresAt"`,
      [request.params.id, user, reason]);
      await event(db, row.report_id, user, 'access_approved', reason);
      await db.query('commit'); return result.rows[0];
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
  app.get<{ Params: { id: string } }>('/v1/admin/reports/:id', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const user = await adminFor(request, reply, runtime, true);
    if (!user) return reply;
    if (!uuid.test(request.params.id)) return fail(reply, 404, 'report_not_found');
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const access = await allowedAccess(db, request, request.params.id, user);
      if (!access) { await db.query('rollback'); return fail(reply, 403, 'support_access_required'); }
      const report = (await db.query<Report>(`select r.*,exists(select 1 from field.site_visibility_holds h where h.site_id=r.site_id and h.released_at is null) as site_hidden from field.moderation_reports r where r.id=$1`, [request.params.id])).rows[0]!;
      await event(db, report.id, user, 'detail_read', access.reason);
      const events = (await db.query(`select action,actor_user_id as "actorUserId",reason,created_at as "createdAt"
        from field.moderation_events where report_id=$1 order by id desc limit 100`, [report.id])).rows;
      await db.query('commit'); return { ...summary(report), description: report.description,
        publicSnapshot: report.public_snapshot, appealMessage: report.appeal_message, events, accessExpiresAt: access.expires_at };
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  for (const kind of ['review', 'appeal-decision', 'appeal'] as const) app.post<{ Params: { id: string } }>(
    kind === 'appeal' ? '/v1/owner/moderation/reports/:id/appeal' : `/v1/admin/reports/:id/${kind}`, async (request, reply) => {
      const owner = kind === 'appeal';
      const user = owner ? await userFor(request, reply, runtime) : await adminFor(request, reply, runtime, true);
      if (!user) return reply;
      const org = owner ? await organizationFor(request, reply, runtime, user, 'publish') : null;
      if (owner && !org) return reply;
      const value = object(request.body), key = keyFor(request), reason = text(owner ? value.message : value.reason);
      if (!uuid.test(request.params.id) || !key || !reason || !Number.isSafeInteger(value.expectedRevision)
        || Number(value.expectedRevision) < 1 || (!owner && !text(value.summary))) return fail(reply, 400, 'invalid_moderation_action');
      if (kind === 'review' && (typeof value.outcome !== 'string' || !['dismissed', 'correction_requested', 'site_hidden'].includes(value.outcome)))
        return fail(reply, 400, 'invalid_outcome');
      if (kind === 'appeal-decision' && (typeof value.decision !== 'string' || !['upheld', 'overturned'].includes(value.decision)))
        return fail(reply, 400, 'invalid_decision');
      const requestHash = hash(JSON.stringify([kind, value.expectedRevision, reason, text(value.summary), value.outcome, value.decision]));
      const db = await runtime.pool.connect();
      try {
        await db.query('begin');
        const site = (await db.query<{ site_id: string }>(`select r.site_id from field.moderation_reports r
          join field.sites s on s.id=r.site_id where r.id=$1 and ($2::uuid is null or r.organization_id=$2) for update of s`,
        [request.params.id, org?.organization_id ?? null])).rows[0];
        if (!site) { await db.query('rollback'); return fail(reply, 404, 'report_not_found'); }
        const old = (await db.query<{ request_hash: string; result: unknown }>(`select request_hash,result from field.moderation_events
          where report_id=$1 and actor_user_id=$2 and submission_key_hash=$3`, [request.params.id, user, key])).rows[0];
        if (old) { await db.query('commit'); return old.request_hash === requestHash ? old.result : fail(reply, 409, 'idempotency_conflict'); }
        if (!owner && !await allowedAccess(db, request, request.params.id, user)) {
          await db.query('rollback'); return fail(reply, 403, 'support_access_required');
        }
        const row = (await db.query<Report>('select * from field.moderation_reports where id=$1 for update', [request.params.id])).rows[0]!;
        if (row.revision !== value.expectedRevision) { await db.query('rollback'); return fail(reply, 409, 'revision_conflict'); }
        if ((kind === 'review' && row.state !== 'submitted') || (kind === 'appeal' && row.state !== 'reviewed')
          || (kind === 'appeal-decision' && row.state !== 'appealed')) {
          await db.query('rollback'); return fail(reply, 409, 'report_state_conflict');
        }
        if (kind === 'review') {
          await db.query(`update field.moderation_reports set revision=revision+1,state=$2,outcome=$3,review_summary=$4,
            updated_at=clock_timestamp() where id=$1`, [row.id, value.outcome === 'dismissed' ? 'closed' : 'reviewed', value.outcome, text(value.summary)]);
          if (value.outcome === 'site_hidden') await db.query(`insert into field.site_visibility_holds(site_id,report_id,created_by)
            values ($1,$2,$3)`, [row.site_id, row.id, user]);
        } else if (kind === 'appeal') {
          await db.query(`update field.moderation_reports set revision=revision+1,state='appealed',appeal_message=$2,
            updated_at=clock_timestamp() where id=$1`, [row.id, reason]);
        } else {
          await db.query(`update field.moderation_reports set revision=revision+1,state='closed',appeal_decision=$2,
            review_summary=$3,updated_at=clock_timestamp() where id=$1`, [row.id, value.decision, text(value.summary)]);
          if (value.decision === 'overturned') await db.query(`update field.site_visibility_holds set released_by=$2,
            released_at=clock_timestamp() where report_id=$1 and released_at is null`, [row.id, user]);
        }
        const current = (await db.query<Report>(`select r.*,exists(select 1 from field.site_visibility_holds h where h.site_id=r.site_id and h.released_at is null) as site_hidden from field.moderation_reports r where r.id=$1`, [row.id])).rows[0]!;
        const result = summary(current);
        await event(db, row.id, user, kind === 'review' ? 'reviewed' : kind === 'appeal' ? 'appealed' : 'appeal_decided',
          reason, key, requestHash, result);
        const eventId = randomUUID();
        await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
          values ($1,$2,$3,$4,$5::jsonb)`, [eventId, row.organization_id, `field.moderation.${kind}`, row.id,
          JSON.stringify({ reportId: row.id, revision: current.revision })]);
        if (!owner) await db.query(`insert into field.notification_events
          (id,organization_id,outbox_id,target_id,audience,channel,state)
          values ($1,$2,$3,$4,'owner','in_app','available')`, [randomUUID(), row.organization_id, eventId, row.id]);
        await db.query('commit'); return result;
      } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
    });
}
