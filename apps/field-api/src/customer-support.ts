import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const scopes = ['conversation', 'contact', 'photos'];
type TargetKind = 'inquiry' | 'reservation' | 'external_request';
const tables = { inquiry: 'field.inquiries', reservation: 'field.reservations', external_request: 'field.external_work_requests' };
const targetKind = (value: unknown): TargetKind | null => typeof value === 'string' && Object.hasOwn(tables, value) ? value as TargetKind : null;
const purposes = ['customer_requested_investigation', 'report_investigation', 'security_incident'];
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const text = (value: unknown, min: number, max: number) => typeof value === 'string'
  && value.trim().length >= min && value.length <= max ? value.trim() : null;
const keyFor = (request: FastifyRequest) => typeof request.headers['idempotency-key'] === 'string'
  && uuid.test(request.headers['idempotency-key']) ? hash(request.headers['idempotency-key']) : null;
const fail = (reply: FastifyReply, code: number, error: string) => reply.code(code).send({ error });
type Access = { id: string; target_kind: TargetKind; target_id: string; organization_id: string; requested_by: string;
  purpose: string; reference: string; reason: string; scopes: string[]; minutes: number; created_at: Date;
  approved_by: string | null; approval_reason: string | null; expires_at: Date | null;
  revoked_by: string | null; revoked_at: Date | null; state: string };
function summary(row: Access) {
  return { id: row.id, targetKind: row.target_kind, targetId: row.target_id, organizationId: row.organization_id, requestedBy: row.requested_by,
    purpose: row.purpose, reference: row.reference, reason: row.reason, scopes: row.scopes, minutes: row.minutes,
    approvedBy: row.approved_by, expiresAt: row.expires_at, revokedAt: row.revoked_at, createdAt: row.created_at,
    state: row.revoked_at ? 'revoked' : !row.approved_by ? 'pending' : row.expires_at!.getTime() <= Date.now() ? 'expired' : 'approved' };
}
async function adminFor(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime, edit = true) {
  reply.headers({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
  if (process.env.FIELD_PROFILE !== 'mock') { fail(reply, 503, 'blocked_integration'); return null; }
  const origin = request.headers.origin;
  const origins = [process.env.FIELD_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3002', 'http://localhost:3002', 'http://127.0.0.1:3002'];
  if (request.method !== 'GET' && origin !== undefined && !origins.includes(origin)) {
    fail(reply, 403, 'origin_denied'); return null;
  }
  const user = await runtime.resolveUserId(request.headers);
  if (!user) { fail(reply, 401, 'authentication_required'); return null; }
  const member = (await runtime.pool.query<{ role: string }>('select role from field.platform_admin_memberships where user_id=$1', [user])).rows[0];
  if (!member || (edit && member.role !== 'operator')) { fail(reply, 403, 'admin_membership_required'); return null; }
  return user;
}
async function allowed(db: Pool | PoolClient, request: FastifyRequest, user: string, kind: TargetKind, targetId: string, scope?: string) {
  const id = request.headers['x-support-access-id'];
  if (typeof id !== 'string' || !uuid.test(id)) return null;
  return (await db.query<Access>(`select a.* from field.customer_support_access_requests a
    join field.platform_admin_memberships requester on requester.user_id=a.requested_by and requester.role='operator'
    join field.platform_admin_memberships approver on approver.user_id=a.approved_by and approver.role='operator'
    where a.id=$1 and a.target_id=$2 and a.target_kind=$5 and a.requested_by=$3 and a.revoked_at is null
      and a.expires_at>clock_timestamp() and ($4::text is null or $4=any(a.scopes))`, [id, targetId, user, scope ?? null, kind])).rows[0] ?? null;
}
async function audit(db: Pool | PoolClient, access: Access, user: string, action: string, attachment?: string,
  key?: string, requestHash?: string, result?: unknown, reason = access.reason) {
  await db.query(`insert into field.customer_support_audit
    (access_id,target_kind,target_id,actor_user_id,action,reason,scopes,attachment_id,submission_key_hash,request_hash,result)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
  [access.id, access.target_kind, access.target_id, user, action, reason, access.scopes, attachment ?? null, key ?? null, requestHash ?? null,
    result ? JSON.stringify(result) : null]);
}

export function registerFieldCustomerSupportRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get('/v1/admin/support-audit', async (request, reply) => {
    if (!await adminFor(request, reply, runtime, false)) return reply;
    return { events: (await runtime.pool.query(`select id::text,access_id as "accessId",target_kind as "targetKind",target_id as "targetId",
      actor_user_id as "actorUserId",action,reason,scopes,attachment_id as "attachmentId",created_at as "createdAt"
      from field.customer_support_audit order by id desc limit 100`)).rows };
  });
  app.get<{ Querystring: { before?: string } }>('/v1/admin/support-access', async (request, reply) => {
    if (!await adminFor(request, reply, runtime, false)) return reply;
    const before = request.query.before;
    if (before && (!uuid.test(before) || !(await runtime.pool.query('select 1 from field.customer_support_access_requests where id=$1', [before])).rowCount))
      return fail(reply, 400, 'invalid_cursor');
    const rows = (await runtime.pool.query<Access>(`select * from field.customer_support_access_requests
      where $1::uuid is null or (created_at,id)<(select created_at,id from field.customer_support_access_requests where id=$1)
      order by created_at desc,id desc limit 101`, [before ?? null])).rows;
    return { requests: rows.slice(0, 100).map(summary), nextCursor: rows.length > 100 ? rows[99]!.id : null };
  });
  app.post('/v1/admin/support-access', async (request, reply) => {
    const user = await adminFor(request, reply, runtime);
    if (!user) return reply;
    const value = object(request.body), kind = targetKind(value.targetKind), key = keyFor(request), reason = text(value.reason, 10, 500), reference = text(value.reference, 1, 160);
    const selected = Array.isArray(value.scopes) && value.scopes.length > 0 && value.scopes.length <= 3
      && value.scopes.every(item => typeof item === 'string' && scopes.includes(item))
      && new Set(value.scopes).size === value.scopes.length ? [...value.scopes as string[]].sort() : null;
    if (!kind || !key || !reason || !reference || !selected || typeof value.targetId !== 'string' || !uuid.test(value.targetId)
      || typeof value.purpose !== 'string' || !purposes.includes(value.purpose) || value.minimumNecessary !== true
      || !Number.isInteger(value.minutes) || Number(value.minutes) < 1 || Number(value.minutes) > 60)
      return fail(reply, 400, 'invalid_support_request');
    const requestHash = hash(JSON.stringify([kind, value.targetId, value.purpose, reference, reason, selected, value.minutes]));
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`field-support:${user}:${key}`]);
      const old = (await db.query<Access & { request_hash: string }>(`select * from field.customer_support_access_requests
        where requested_by=$1 and submission_key_hash=$2`, [user, key])).rows[0];
      if (old) { await db.query('commit'); return old.request_hash === requestHash ? { id: old.id } : fail(reply, 409, 'idempotency_conflict'); }
      const work = (await db.query<{ organization_id: string }>(`select organization_id from ${tables[kind]} where id=$1`, [value.targetId])).rows[0];
      if (!work) { await db.query('rollback'); return fail(reply, 404, 'work_not_found'); }
      const row = (await db.query<Access>(`insert into field.customer_support_access_requests
        (id,target_kind,target_id,inquiry_id,reservation_id,external_request_id,organization_id,requested_by,purpose,reference,reason,scopes,minutes,submission_key_hash,request_hash)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
      [randomUUID(), kind, value.targetId, kind === 'inquiry' ? value.targetId : null, kind === 'reservation' ? value.targetId : null,
        kind === 'external_request' ? value.targetId : null, work.organization_id, user, value.purpose, reference, reason, selected, value.minutes, key, requestHash])).rows[0]!;
      await audit(db, row, user, 'requested');
      await db.query('commit'); return reply.code(201).send({ id: row.id });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
  for (const action of ['approve', 'revoke'] as const) app.post<{ Params: { id: string } }>(
    `/v1/admin/support-access/:id/${action}`, async (request, reply) => {
      const user = await adminFor(request, reply, runtime);
      if (!user) return reply;
      const reason = text(object(request.body).reason, 10, 500), key = action === 'revoke' ? keyFor(request) : null;
      if (!uuid.test(request.params.id) || !reason || (action === 'revoke' && !key)) return fail(reply, 400, 'invalid_support_action');
      const db = await runtime.pool.connect();
      try {
        await db.query('begin');
        const row = (await db.query<Access>('select * from field.customer_support_access_requests where id=$1 for update', [request.params.id])).rows[0];
        if (!row) { await db.query('rollback'); return fail(reply, 404, 'support_access_not_found'); }
        if ((action === 'approve' && row.requested_by === user)
          || (action === 'revoke' && row.requested_by !== user && row.approved_by !== user)) {
          await db.query('rollback'); return fail(reply, 403, action === 'approve' ? 'self_approval_denied' : 'support_access_denied');
        }
        const requestHash = hash(JSON.stringify([action, reason]));
        if (action === 'revoke') {
          const old = (await db.query<{ request_hash: string; result: unknown }>(`select request_hash,result from field.customer_support_audit
            where access_id=$1 and actor_user_id=$2 and submission_key_hash=$3`, [row.id, user, key])).rows[0];
          if (old) { await db.query('commit'); return old.request_hash === requestHash ? old.result : fail(reply, 409, 'idempotency_conflict'); }
        }
        if (row.revoked_at) { await db.query('rollback'); return fail(reply, 409, 'support_access_revoked'); }
        if (action === 'approve' && row.approved_by) {
          await db.query('commit'); return row.approved_by === user && row.approval_reason === reason
            ? { expiresAt: row.expires_at } : fail(reply, 409, 'already_approved');
        }
        if (action === 'approve' && !(await db.query("select 1 from field.platform_admin_memberships where user_id=$1 and role='operator'", [row.requested_by])).rowCount) {
          await db.query('rollback'); return fail(reply, 403, 'requester_membership_required');
        }
        const current = (await db.query<Access>(action === 'approve'
          ? `update field.customer_support_access_requests set approved_by=$2,approval_reason=$3,approved_at=clock_timestamp(),
              expires_at=clock_timestamp()+minutes*interval '1 minute' where id=$1 returning *`
          : `update field.customer_support_access_requests set revoked_by=$2,revocation_reason=$3,revoked_at=clock_timestamp() where id=$1 returning *`,
        [row.id, user, reason])).rows[0]!;
        const result = action === 'approve' ? { expiresAt: current.expires_at } : { state: 'revoked' };
        await audit(db, current, user, action === 'approve' ? 'approved' : 'revoked', undefined, key ?? undefined, requestHash, result, reason);
        await db.query('commit'); return result;
      } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
    });
  app.get<{ Params: { id: string } }>('/v1/admin/support-access/:id/status', async (request, reply) => {
    const user = await adminFor(request, reply, runtime);
    if (!user) return reply;
    if (!uuid.test(request.params.id)) return fail(reply, 403, 'support_access_required');
    const row = (await runtime.pool.query<{ target_kind: TargetKind; target_id: string }>('select target_kind,target_id from field.customer_support_access_requests where id=$1', [request.params.id])).rows[0];
    const access = row && await allowed(runtime.pool, request, user, row.target_kind, row.target_id);
    if (!access || access.id !== request.params.id) return fail(reply, 403, 'support_access_required');
    return { expiresAt: access.expires_at, state: 'approved' };
  });
  app.get<{ Params: { kind: string; id: string } }>('/v1/admin/support/:kind/:id', async (request, reply) => {
    const user = await adminFor(request, reply, runtime);
    if (!user) return reply;
    const kind = targetKind(request.params.kind), id = request.params.id;
    if (!kind || !uuid.test(id)) return fail(reply, 403, 'support_access_required');
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const access = await allowed(db, request, user, kind, id);
      if (!access) { await db.query('rollback'); return fail(reply, 403, 'support_access_required'); }
      const core = kind === 'external_request'
        ? 'id,status as state,kind as "requestKind",received_at as "createdAt"'
        : kind === 'reservation' ? 'id,state,revision,source,booking_mode as "bookingMode",created_at as "createdAt"'
          : 'id,state,revision,created_at as "createdAt"';
      const work = (await db.query(`select ${core} from ${tables[kind]} where id=$1 and organization_id=$2`, [id, access.organization_id])).rows[0];
      const result: Record<string, unknown> = { work: { ...work, kind }, scopes: access.scopes, accessExpiresAt: access.expires_at };
      if (access.scopes.includes('conversation')) {
        if (kind !== 'external_request') result.messages = (await db.query(kind === 'inquiry'
          ? `select id,sender as actor,body,delivery_state as "deliveryState",created_at as "createdAt"
              from field.inquiry_messages where inquiry_id=$1 and visibility='customer' order by created_at,id`
          : `select id,sender as actor,body,created_at as "createdAt" from field.reservation_messages
              where reservation_id=$1 and organization_id=$2 order by created_at,id`, kind === 'inquiry' ? [id] : [id, access.organization_id])).rows;
        if (kind === 'reservation') result.submission = (await db.query(`select request_message as "requestMessage",preferred_time_text as "preferredTimeText",
          requested_start_at as "requestedStartAt",confirmed_start_at as "confirmedStartAt",confirmed_end_at as "confirmedEndAt",
          proposal_start_at as "proposalStartAt",proposal_end_at as "proposalEndAt",timezone
          from field.reservations where id=$1`, [id])).rows[0];
        if (kind === 'external_request') result.submission = (await db.query(`select summary,
          request_snapshot->>'mode' as mode,request_snapshot->>'startAt' as "requestedStartAt",
          request_snapshot->>'preferredTimeText' as "preferredTimeText",request_snapshot->>'timezone' as timezone
          from field.external_work_requests where id=$1`, [id])).rows[0];
      }
      if (access.scopes.includes('contact')) result.contact = (await db.query(kind === 'external_request'
        ? `select customer_snapshot->>'name' as "customerName",customer_snapshot->>'phone' as "customerPhone",
            consent_confirmed_at as "consentAt",'unverified' as "numberOwnership" from field.external_work_requests where id=$1`
        : `select customer_name as "customerName",customer_phone as "customerPhone",visit_region as "visitRegion",
            consent_at as "consentAt",'unverified' as "numberOwnership" from ${tables[kind]} where id=$1`, [id])).rows[0];
      if (access.scopes.includes('photos')) result.attachments = (await db.query(kind === 'inquiry'
        ? `select a.id,a.message_id as "messageId",a.state,a.content_type as "contentType",a.byte_size as "byteSize",a.width,a.height,a.created_at as "createdAt"
            from field.inquiry_attachments a join field.inquiry_messages m on m.id=a.message_id and m.inquiry_id=a.inquiry_id and m.visibility='customer'
            where a.inquiry_id=$1 and a.organization_id=$2 and a.state='ready' order by a.created_at,a.id`
        : kind === 'reservation'
          ? `select id,state,content_type as "contentType",byte_size as "byteSize",width,height,created_at as "createdAt"
              from field.reservation_attachments where reservation_id=$1 and organization_id=$2 and state='ready' order by created_at,id`
          : `select id,state,'image/webp' as "contentType",byte_size as "byteSize",width,height,created_at as "createdAt"
              from field.external_request_attachments where external_request_id=$1 and organization_id=$2 order by created_at,id`, [id, access.organization_id])).rows;
      if (!await allowed(db, request, user, kind, id)) {
        await audit(db, access, user, 'read_denied'); await db.query('commit'); return fail(reply, 403, 'support_access_required');
      }
      await audit(db, access, user, 'detail_read'); await db.query('commit'); return result;
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
  app.get<{ Params: { kind: string; id: string; attachmentId: string } }>('/v1/admin/support/:kind/:id/attachments/:attachmentId', async (request, reply) => {
    const user = await adminFor(request, reply, runtime);
    if (!user) return reply;
    const { id, attachmentId } = request.params, kind = targetKind(request.params.kind);
    if (!kind || !uuid.test(id) || !uuid.test(attachmentId)) return fail(reply, 403, 'support_access_required');
    const access = await allowed(runtime.pool, request, user, kind, id, 'photos');
    if (!access) return fail(reply, 403, 'support_access_required');
    const row = (await runtime.pool.query<{ object_key: string | null; sha256: string | null; byte_size: number | null; state: string }>(kind === 'inquiry'
      ? `select a.object_key,a.sha256,a.byte_size,a.state from field.inquiry_attachments a
          join field.inquiry_messages m on m.id=a.message_id and m.inquiry_id=a.inquiry_id and m.visibility='customer'
          where a.id=$1 and a.inquiry_id=$2 and a.organization_id=$3 and a.state='ready'`
      : kind === 'reservation'
        ? `select object_key,sha256,byte_size,state from field.reservation_attachments where id=$1 and reservation_id=$2 and organization_id=$3 and state='ready'`
        : `select object_key,sha256,byte_size,state from field.external_request_attachments where id=$1 and external_request_id=$2 and organization_id=$3`,
    [attachmentId, id, access.organization_id])).rows[0];
    if (!row) return fail(reply, 404, 'attachment_not_found');
    if (row.state !== 'ready' && row.state !== 'copied') {
      await audit(runtime.pool, access, user, 'photo_unavailable', attachmentId); return fail(reply, 409, 'attachment_not_copied');
    }
    if (!runtime.inquiryMedia || !row.object_key) { await audit(runtime.pool, access, user, 'photo_unavailable', attachmentId); return fail(reply, 503, 'blocked_integration'); }
    let bytes: Buffer | null;
    try { bytes = await runtime.inquiryMedia.get(row.object_key); } catch { bytes = null; }
    if (!await allowed(runtime.pool, request, user, kind, id, 'photos')) {
      await audit(runtime.pool, access, user, 'read_denied', attachmentId); return fail(reply, 403, 'support_access_required');
    }
    if (!bytes || bytes.length !== row.byte_size || hash(bytes) !== row.sha256) {
      await audit(runtime.pool, access, user, 'photo_unavailable', attachmentId); return fail(reply, 503, 'media_unavailable');
    }
    await audit(runtime.pool, access, user, 'photo_read', attachmentId);
    return reply.header('X-Content-Type-Options', 'nosniff').type('image/webp').send(bytes);
  });
}
