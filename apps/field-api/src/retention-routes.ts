import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { previewRetention, RETENTION_TABLES, type RetentionKind, type RetentionPolicy } from './work-retention.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, min: number, max: number) => typeof value === 'string' && value.trim().length >= min && value.length <= max ? value.trim() : null;
const keyFor = (request: FastifyRequest) => typeof request.headers['idempotency-key'] === 'string' && uuid.test(request.headers['idempotency-key']) ? hash(request.headers['idempotency-key']) : null;
const fail = (reply: FastifyReply, code: number, error: string) => reply.code(code).send({ error });
const kindFor = (value: unknown): RetentionKind | null => typeof value === 'string' && Object.hasOwn(RETENTION_TABLES, value) ? value as RetentionKind : null;
type Hold = { id: string; organization_id: string; target_kind: RetentionKind; target_id: string; reason_code: string;
  reason: string; reference: string; review_due_at: Date; created_by: string; request_hash: string; created_at: Date;
  released_by: string | null; released_at: Date | null; release_reason: string | null };
const policyView = (p: RetentionPolicy) => ({ id: p.id, workDays: p.work_days, photoDays: p.photo_days, reference: p.reference,
  reason: p.reason, requestedBy: p.requested_by, createdAt: p.created_at, approvedBy: p.approved_by,
  approvedAt: p.approved_at, retiredAt: p.retired_at, state: p.retired_at ? 'retired' : p.approved_at ? 'approved' : 'pending' });
const holdView = (h: Hold) => ({ id: h.id, organizationId: h.organization_id, targetKind: h.target_kind, targetId: h.target_id,
  reasonCode: h.reason_code, reason: h.reason, reference: h.reference, reviewDueAt: h.review_due_at, createdBy: h.created_by,
  createdAt: h.created_at, releasedBy: h.released_by, releasedAt: h.released_at, state: h.released_at ? 'released' : 'active' });
async function adminFor(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime, edit = true) {
  reply.headers({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
  if (process.env.FIELD_PROFILE !== 'mock') { fail(reply, 503, 'blocked_integration'); return null; }
  if (request.method !== 'GET' && request.headers.origin !== undefined && ![
    process.env.FIELD_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3002', 'http://localhost:3002', 'http://127.0.0.1:3002',
  ].includes(request.headers.origin)) { fail(reply, 403, 'origin_denied'); return null; }
  const user = await runtime.resolveUserId(request.headers);
  if (!user) { fail(reply, 401, 'authentication_required'); return null; }
  const role = (await runtime.pool.query<{ role: string }>('select role from field.platform_admin_memberships where user_id=$1', [user])).rows[0]?.role;
  if (!role || edit && role !== 'operator') { fail(reply, 403, 'admin_membership_required'); return null; }
  return user;
}
async function audit(db: PoolClient, user: string, action: string, reason: string, fields: {
  policy?: string; hold?: string; org?: string; kind?: string; target?: string; key?: string; requestHash?: string; result?: unknown;
} = {}) {
  await db.query(`insert into field.work_retention_audit(policy_id,hold_id,organization_id,target_kind,target_id,actor_user_id,action,reason,submission_key_hash,request_hash,result)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
  [fields.policy ?? null, fields.hold ?? null, fields.org ?? null, fields.kind ?? null, fields.target ?? null,
    user, action, reason, fields.key ?? null, fields.requestHash ?? null, fields.result ? JSON.stringify(fields.result) : null]);
}
async function replay(db: PoolClient, user: string, key: string, requestHash: string, reply: FastifyReply) {
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`field-retention:${user}:${key}`]);
  const old = (await db.query<{ request_hash: string; result: unknown }>('select request_hash,result from field.work_retention_audit where actor_user_id=$1 and submission_key_hash=$2', [user, key])).rows[0];
  return old ? { value: old.request_hash === requestHash ? old.result : fail(reply, 409, 'idempotency_conflict') } : null;
}

export function registerFieldRetentionRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get('/v1/admin/retention/policies', async (request, reply) => {
    if (!await adminFor(request, reply, runtime, false)) return reply;
    return { policies: (await runtime.pool.query<RetentionPolicy>('select * from field.work_retention_policies order by created_at desc,id desc limit 100')).rows.map(policyView) };
  });
  app.post('/v1/admin/retention/policies', async (request, reply) => {
    const user = await adminFor(request, reply, runtime); if (!user) return reply;
    const b = object(request.body), key = keyFor(request), reference = text(b.reference, 1, 160), reason = text(b.reason, 10, 500);
    if (!key || !reference || !reason || !Number.isInteger(b.workDays) || Number(b.workDays) < 1 || Number(b.workDays) > 3650
      || !Number.isInteger(b.photoDays) || Number(b.photoDays) < 1 || Number(b.photoDays) > Number(b.workDays)) return fail(reply, 400, 'invalid_retention_policy');
    const requestHash = hash(JSON.stringify(['policy', b.workDays, b.photoDays, reference, reason])), db = await runtime.pool.connect();
    try {
      await db.query('begin'); const old = await replay(db, user, key, requestHash, reply);
      if (old) { await db.query('commit'); return old.value; }
      const id = randomUUID();
      await db.query(`insert into field.work_retention_policies(id,work_days,photo_days,reference,reason,requested_by,submission_key_hash,request_hash)
        values($1,$2,$3,$4,$5,$6,$7,$8)`, [id, b.workDays, b.photoDays, reference, reason, user, key, requestHash]);
      await audit(db, user, 'policy_requested', reason, { policy: id, key, requestHash, result: { id } });
      await db.query('commit'); return reply.code(201).send({ id });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
  for (const action of ['approve', 'retire'] as const) app.post<{ Params: { id: string } }>(`/v1/admin/retention/policies/:id/${action}`, async (request, reply) => {
    const user = await adminFor(request, reply, runtime); if (!user) return reply;
    const id = request.params.id, reason = text(object(request.body).reason, 10, 500), key = keyFor(request);
    if (!uuid.test(id) || !reason || !key) return fail(reply, 400, 'invalid_retention_action');
    const db = await runtime.pool.connect(), requestHash = hash(JSON.stringify(['policy', id, action, reason]));
    try {
      await db.query('begin'); const old = await replay(db, user, key, requestHash, reply);
      if (old) { await db.query('commit'); return old.value; }
      const row = (await db.query<RetentionPolicy>('select * from field.work_retention_policies where id=$1 for update', [id])).rows[0];
      if (!row) { await db.query('rollback'); return fail(reply, 404, 'retention_policy_not_found'); }
      if (action === 'approve') {
        if (row.requested_by === user) { await db.query('rollback'); return fail(reply, 403, 'self_approval_denied'); }
        if (row.retired_at) { await db.query('rollback'); return fail(reply, 409, 'retention_policy_retired'); }
        if (row.approved_at) { await db.query('commit'); return row.approved_by === user && row.approval_reason === reason
          ? { approvedAt: row.approved_at } : fail(reply, 409, 'already_approved'); }
        if (!(await db.query("select 1 from field.platform_admin_memberships where user_id=$1 and role='operator'", [row.requested_by])).rowCount) {
          await db.query('rollback'); return fail(reply, 403, 'requester_membership_required');
        }
      } else if (row.retired_at) { await db.query('commit'); return { state: 'retired' }; }
      const current = (await db.query<RetentionPolicy>(action === 'approve'
        ? 'update field.work_retention_policies set approved_by=$2,approved_at=clock_timestamp(),approval_reason=$3 where id=$1 returning *'
        : 'update field.work_retention_policies set retired_by=$2,retired_at=clock_timestamp(),retirement_reason=$3 where id=$1 returning *', [id, user, reason])).rows[0]!;
      const result = action === 'approve' ? { approvedAt: current.approved_at } : { state: 'retired' };
      await audit(db, user, action === 'approve' ? 'policy_approved' : 'policy_retired', reason, { policy: id, key, requestHash, result });
      await db.query('commit'); return result;
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
  app.get('/v1/admin/retention/holds', async (request, reply) => {
    if (!await adminFor(request, reply, runtime, false)) return reply;
    return { holds: (await runtime.pool.query<Hold>('select * from field.work_retention_holds order by created_at desc,id desc limit 100')).rows.map(holdView) };
  });
  app.post('/v1/admin/retention/holds', async (request, reply) => {
    const user = await adminFor(request, reply, runtime); if (!user) return reply;
    const b = object(request.body), kind = kindFor(b.targetKind), key = keyFor(request), reason = text(b.reason, 10, 500), reference = text(b.reference, 1, 160);
    const due = typeof b.reviewDueAt === 'string' && b.reviewDueAt.length <= 40 ? new Date(b.reviewDueAt) : null;
    if (!kind || !key || !reason || !reference || typeof b.targetId !== 'string' || !uuid.test(b.targetId)
      || typeof b.organizationId !== 'string' || !uuid.test(b.organizationId) || typeof b.reasonCode !== 'string' || !['dispute','legal_record','investigation'].includes(b.reasonCode)
      || !due || !Number.isFinite(due.getTime())) return fail(reply, 400, 'invalid_retention_hold');
    const requestHash = hash(JSON.stringify(['hold', kind, b.targetId, b.organizationId, b.reasonCode, reason, reference, due.toISOString()]));
    const db = await runtime.pool.connect();
    try {
      await db.query('begin'); const old = await replay(db, user, key, requestHash, reply);
      if (old) { await db.query('commit'); return old.value; }
      if (!(await db.query(`select 1 from ${RETENTION_TABLES[kind]} where id=$1 and organization_id=$2 for update`, [b.targetId, b.organizationId])).rowCount) {
        await db.query('rollback'); return fail(reply, 404, 'work_not_found');
      }
      const id = randomUUID();
      await db.query(`insert into field.work_retention_holds(id,organization_id,target_kind,target_id,inquiry_id,reservation_id,external_request_id,
        reason_code,reason,reference,review_due_at,created_by,submission_key_hash,request_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, b.organizationId, kind, b.targetId, kind === 'inquiry' ? b.targetId : null, kind === 'reservation' ? b.targetId : null,
        kind === 'external_request' ? b.targetId : null, b.reasonCode, reason, reference, due, user, key, requestHash]);
      await audit(db, user, 'hold_created', reason, { hold: id, org: b.organizationId, kind, target: b.targetId, key, requestHash, result: { id } });
      await db.query('commit'); return reply.code(201).send({ id });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
  app.post<{ Params: { id: string } }>('/v1/admin/retention/holds/:id/release', async (request, reply) => {
    const user = await adminFor(request, reply, runtime); if (!user) return reply;
    const id = request.params.id, reason = text(object(request.body).reason, 10, 500), key = keyFor(request);
    if (!uuid.test(id) || !reason || !key) return fail(reply, 400, 'invalid_retention_action');
    const db = await runtime.pool.connect(), requestHash = hash(JSON.stringify(['release', id, reason]));
    try {
      await db.query('begin'); const old = await replay(db, user, key, requestHash, reply);
      if (old) { await db.query('commit'); return old.value; }
      const row = (await db.query<Hold>('select * from field.work_retention_holds where id=$1 for update', [id])).rows[0];
      if (!row) { await db.query('rollback'); return fail(reply, 404, 'retention_hold_not_found'); }
      if (row.created_by === user) { await db.query('rollback'); return fail(reply, 403, 'self_release_denied'); }
      if (row.released_at) { await db.query('commit'); return row.released_by === user && row.release_reason === reason
        ? { state: 'released' } : fail(reply, 409, 'already_released'); }
      await db.query(`select 1 from ${RETENTION_TABLES[row.target_kind]} where id=$1 and organization_id=$2 for update`, [row.target_id, row.organization_id]);
      await db.query('update field.work_retention_holds set released_by=$2,released_at=clock_timestamp(),release_reason=$3 where id=$1', [id, user, reason]);
      await audit(db, user, 'hold_released', reason, { hold: id, org: row.organization_id, kind: row.target_kind, target: row.target_id, key, requestHash, result: { state: 'released' } });
      await db.query('commit'); return { state: 'released' };
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
  app.get<{ Querystring: { organizationId?: string; policyId?: string; before?: string } }>('/v1/admin/retention/preview', async (request, reply) => {
    const user = await adminFor(request, reply, runtime, false); if (!user) return reply;
    const { organizationId: org, policyId: policy, before } = request.query;
    if (!org || !uuid.test(org) || !policy || !uuid.test(policy)) return fail(reply, 400, 'invalid_retention_preview');
    if (before) {
      try {
        if (before.length > 500) throw new Error('cursor');
        const c = JSON.parse(Buffer.from(before, 'base64url').toString());
        if (!kindFor(c.kind) || !uuid.test(c.id) || typeof c.at !== 'string' || !Number.isFinite(Date.parse(c.at))
          || c.org !== org || c.policy !== policy) throw new Error('cursor');
      } catch { return fail(reply, 400, 'invalid_cursor'); }
    }
    const db = await runtime.pool.connect();
    try {
      await db.query('begin isolation level repeatable read');
      if (!(await db.query('select 1 from field.organizations where id=$1', [org])).rowCount
        || !(await db.query('select 1 from field.work_retention_policies where id=$1', [policy])).rowCount) {
        await db.query('rollback'); return fail(reply, 404, 'retention_subject_not_found');
      }
      const result = await previewRetention(db, org, policy, before);
      await audit(db, user, 'preview_read', '보존 정책 기반 메타데이터 미리보기', { policy, org });
      await db.query('commit'); return result;
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
  app.get('/v1/admin/retention/audit', async (request, reply) => {
    if (!await adminFor(request, reply, runtime, false)) return reply;
    return { events: (await runtime.pool.query(`select id::text,policy_id as "policyId",hold_id as "holdId",organization_id as "organizationId",
      target_kind as "targetKind",target_id as "targetId",actor_user_id as "actorUserId",action,reason,created_at as "createdAt"
      from field.work_retention_audit order by id desc limit 100`)).rows };
  });
  app.post<{ Params: { id: string } }>('/v1/owner/external-requests/:id/close', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const user = await runtime.resolveUserId(request.headers); if (!user) return fail(reply, 401, 'authentication_required');
    const id = request.params.id, expected = object(request.body).expectedRevision, org = request.headers['x-organization-id'];
    if (!uuid.test(id) || !Number.isInteger(expected) || Number(expected) < 0
      || org !== undefined && (typeof org !== 'string' || !uuid.test(org))) return fail(reply, 400, 'invalid_work_closure');
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const row = (await db.query<{ organization_id: string; field_work_state: string; field_work_revision: number; retention_closed_at: Date | null }>(`select e.* from field.external_work_requests e
        where e.id=$1 and e.kind='inquiry' and ($3::uuid is null or e.organization_id=$3)
          and exists(select 1 from field.memberships m where m.organization_id=e.organization_id and m.user_id=$2 and m.role in ('owner','editor')) for update`, [id, user, org ?? null])).rows[0];
      if (!row) { await db.query('rollback'); return fail(reply, 403, 'work_membership_required'); }
      if (row.field_work_state === 'closed' && row.field_work_revision === Number(expected) + 1) {
        await db.query('commit'); return { state: 'closed', revision: row.field_work_revision, closedAt: row.retention_closed_at };
      }
      if (row.field_work_revision !== expected || row.field_work_state !== 'open') { await db.query('rollback'); return fail(reply, 409, 'revision_conflict'); }
      const current = (await db.query<{ field_work_revision: number; retention_closed_at: Date }>(`update field.external_work_requests
        set field_work_state='closed',field_work_revision=field_work_revision+1 where id=$1 returning field_work_revision,retention_closed_at`, [id])).rows[0]!;
      await audit(db, user, 'received_work_closed', '사업자가 Field 수신 업무를 종결함', { org: row.organization_id, kind: 'external_request', target: id });
      await db.query('commit'); return { state: 'closed', revision: current.field_work_revision, closedAt: current.retention_closed_at };
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
