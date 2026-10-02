import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';
import { requireAdmin } from './admin-auth.js';
import { retainReadGuardThroughResponse } from './retention-read-guard.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const scopes = ['conversation', 'contact', 'photos'];
const purposes = ['customer_requested_investigation', 'report_investigation', 'security_incident'];
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const text = (value: unknown, min: number, max: number) => typeof value === 'string'
  && value.trim().length >= min && value.length <= max ? value.trim() : null;
const keyFor = (request: FastifyRequest) => typeof request.headers['idempotency-key'] === 'string'
  && uuid.test(request.headers['idempotency-key']) ? hash(request.headers['idempotency-key']) : null;
const fail = (reply: FastifyReply, code: number, error: string) => reply.code(code).send({ error });
type Access = { id: string; inquiry_id: string; organization_id: string; requested_by: string;
  purpose: string; reference: string; reason: string; scopes: string[]; minutes: number; created_at: Date;
  approved_by: string | null; approval_reason: string | null; expires_at: Date | null;
  revoked_by: string | null; revoked_at: Date | null; state: string };
function summary(row: Access) {
  return { id: row.id, inquiryId: row.inquiry_id, organizationId: row.organization_id, requestedBy: row.requested_by,
    purpose: row.purpose, reference: row.reference, reason: row.reason, scopes: row.scopes, minutes: row.minutes,
    approvedBy: row.approved_by, expiresAt: row.expires_at, revokedAt: row.revoked_at, createdAt: row.created_at,
    state: row.revoked_at ? 'revoked' : !row.approved_by ? 'pending' : row.expires_at!.getTime() <= Date.now() ? 'expired' : 'approved' };
}
async function adminFor(request: FastifyRequest, reply: FastifyReply, runtime: BusinessRuntime, edit = true) {
  reply.headers({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
  const origin = request.headers.origin;
  if (request.method !== 'GET' && origin !== undefined && origin !== (process.env.AP_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3001')) {
    fail(reply, 403, 'origin_denied'); return null;
  }
  return (await requireAdmin(request, reply, runtime, edit ? { role: 'operator' } : {}))?.userId ?? null;
}
async function allowed(db: Pool | PoolClient, request: FastifyRequest, user: string, inquiryId: string, scope?: string) {
  const id = request.headers['x-support-access-id'];
  if (typeof id !== 'string' || !uuid.test(id)) return null;
  return (await db.query<Access>(`select a.* from ap.customer_support_access_requests a
    join ap.platform_admin_memberships requester on requester.user_id=a.requested_by and requester.role='operator'
    join ap.platform_admin_memberships approver on approver.user_id=a.approved_by and approver.role='operator'
    where a.id=$1 and a.inquiry_id=$2 and a.requested_by=$3 and a.revoked_at is null
      and a.expires_at>clock_timestamp() and ($4::text is null or $4=any(a.scopes))`, [id, inquiryId, user, scope ?? null])).rows[0] ?? null;
}
async function audit(db: Pool | PoolClient, access: Access, user: string, action: string, attachment?: string,
  key?: string, requestHash?: string, result?: unknown, reason = access.reason) {
  await db.query(`insert into ap.customer_support_audit
    (access_id,inquiry_id,actor_user_id,action,reason,scopes,attachment_id,submission_key_hash,request_hash,result)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
  [access.id, access.inquiry_id, user, action, reason, access.scopes, attachment ?? null, key ?? null, requestHash ?? null,
    result ? JSON.stringify(result) : null]);
}

export function registerCustomerSupportRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get('/v1/admin/support-audit', async (request, reply) => {
    if (!await adminFor(request, reply, runtime, false)) return reply;
    return { events: (await runtime.pool.query(`select id::text,access_id as "accessId",inquiry_id as "inquiryId",
      actor_user_id as "actorUserId",action,reason,scopes,attachment_id as "attachmentId",created_at as "createdAt"
      from ap.customer_support_audit order by id desc limit 100`)).rows };
  });
  app.get<{ Querystring: { before?: string } }>('/v1/admin/support-access', async (request, reply) => {
    if (!await adminFor(request, reply, runtime, false)) return reply;
    const before = request.query.before;
    if (before && (!uuid.test(before) || !(await runtime.pool.query('select 1 from ap.customer_support_access_requests where id=$1', [before])).rowCount))
      return fail(reply, 400, 'invalid_cursor');
    const rows = (await runtime.pool.query<Access>(`select * from ap.customer_support_access_requests
      where $1::uuid is null or (created_at,id)<(select created_at,id from ap.customer_support_access_requests where id=$1)
      order by created_at desc,id desc limit 101`, [before ?? null])).rows;
    return { requests: rows.slice(0, 100).map(summary), nextCursor: rows.length > 100 ? rows[99]!.id : null };
  });
  app.post('/v1/admin/support-access', async (request, reply) => {
    const user = await adminFor(request, reply, runtime);
    if (!user) return reply;
    const value = object(request.body), key = keyFor(request), reason = text(value.reason, 10, 500), reference = text(value.reference, 1, 160);
    const selected = Array.isArray(value.scopes) && value.scopes.length > 0 && value.scopes.length <= 3
      && value.scopes.every(item => typeof item === 'string' && scopes.includes(item))
      && new Set(value.scopes).size === value.scopes.length ? [...value.scopes as string[]].sort() : null;
    if (!key || !reason || !reference || !selected || typeof value.inquiryId !== 'string' || !uuid.test(value.inquiryId)
      || typeof value.purpose !== 'string' || !purposes.includes(value.purpose) || value.minimumNecessary !== true
      || !Number.isInteger(value.minutes) || Number(value.minutes) < 1 || Number(value.minutes) > 60)
      return fail(reply, 400, 'invalid_support_request');
    const requestHash = hash(JSON.stringify([value.inquiryId, value.purpose, reference, reason, selected, value.minutes]));
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`ap-support:${user}:${key}`]);
      const old = (await db.query<Access & { request_hash: string }>(`select * from ap.customer_support_access_requests
        where requested_by=$1 and submission_key_hash=$2`, [user, key])).rows[0];
      if (old) { await db.query('commit'); return old.request_hash === requestHash ? { id: old.id } : fail(reply, 409, 'idempotency_conflict'); }
      const inquiry = (await db.query<{ organization_id: string }>('select organization_id from ap.inquiries where id=$1', [value.inquiryId])).rows[0];
      if (!inquiry) { await db.query('rollback'); return fail(reply, 404, 'inquiry_not_found'); }
      const row = (await db.query<Access>(`insert into ap.customer_support_access_requests
        (id,inquiry_id,organization_id,requested_by,purpose,reference,reason,scopes,minutes,submission_key_hash,request_hash)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [randomUUID(), value.inquiryId, inquiry.organization_id, user, value.purpose, reference, reason, selected, value.minutes, key, requestHash])).rows[0]!;
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
        const row = (await db.query<Access>('select * from ap.customer_support_access_requests where id=$1 for update', [request.params.id])).rows[0];
        if (!row) { await db.query('rollback'); return fail(reply, 404, 'support_access_not_found'); }
        if ((action === 'approve' && row.requested_by === user)
          || (action === 'revoke' && row.requested_by !== user && row.approved_by !== user)) {
          await db.query('rollback'); return fail(reply, 403, action === 'approve' ? 'self_approval_denied' : 'support_access_denied');
        }
        const requestHash = hash(JSON.stringify([action, reason]));
        if (action === 'revoke') {
          const old = (await db.query<{ request_hash: string; result: unknown }>(`select request_hash,result from ap.customer_support_audit
            where access_id=$1 and actor_user_id=$2 and submission_key_hash=$3`, [row.id, user, key])).rows[0];
          if (old) { await db.query('commit'); return old.request_hash === requestHash ? old.result : fail(reply, 409, 'idempotency_conflict'); }
        }
        if (row.revoked_at) { await db.query('rollback'); return fail(reply, 409, 'support_access_revoked'); }
        if (action === 'approve' && row.approved_by) {
          await db.query('commit'); return row.approved_by === user && row.approval_reason === reason
            ? { expiresAt: row.expires_at } : fail(reply, 409, 'already_approved');
        }
        if (action === 'approve' && !(await db.query("select 1 from ap.platform_admin_memberships where user_id=$1 and role='operator'", [row.requested_by])).rowCount) {
          await db.query('rollback'); return fail(reply, 403, 'requester_membership_required');
        }
        const current = (await db.query<Access>(action === 'approve'
          ? `update ap.customer_support_access_requests set approved_by=$2,approval_reason=$3,approved_at=clock_timestamp(),
              expires_at=clock_timestamp()+minutes*interval '1 minute' where id=$1 returning *`
          : `update ap.customer_support_access_requests set revoked_by=$2,revocation_reason=$3,revoked_at=clock_timestamp() where id=$1 returning *`,
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
    const row = (await runtime.pool.query<{ inquiry_id: string }>('select inquiry_id from ap.customer_support_access_requests where id=$1', [request.params.id])).rows[0];
    const access = row && await allowed(runtime.pool, request, user, row.inquiry_id);
    if (!access || access.id !== request.params.id) return fail(reply, 403, 'support_access_required');
    return { expiresAt: access.expires_at, state: 'approved' };
  });
  app.get<{ Params: { id: string } }>('/v1/admin/support/inquiries/:id', async (request, reply) => {
    const user = await adminFor(request, reply, runtime);
    if (!user) return reply;
    if (!uuid.test(request.params.id)) return fail(reply, 403, 'support_access_required');
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const access = await allowed(db, request, user, request.params.id);
      if (!access) { await db.query('rollback'); return fail(reply, 403, 'support_access_required'); }
      const inquiry = (await db.query(`select id,organization_id as "organizationId",state,mode,revision,created_at as "createdAt"
        from ap.inquiries where id=$1 and organization_id=$2`, [access.inquiry_id, access.organization_id])).rows[0];
      const result: Record<string, unknown> = { inquiry, scopes: access.scopes, accessExpiresAt: access.expires_at };
      if (access.scopes.includes('conversation')) result.messages = (await db.query(`select id,sequence,actor,body,delivery_state as "deliveryState",created_at as "createdAt"
        from ap.inquiry_messages where inquiry_id=$1 and visibility='customer' order by sequence`, [access.inquiry_id])).rows;
      if (access.scopes.includes('contact')) result.contact = (await db.query(`select customer_name as "customerName",customer_phone as "customerPhone",
        consent_at as "consentAt",'unverified' as "numberOwnership" from ap.inquiries where id=$1`, [access.inquiry_id])).rows[0];
      if (access.scopes.includes('photos')) result.attachments = (await db.query(`select a.id,a.message_id as "messageId",a.content_type as "contentType",
        a.byte_size as "byteSize",a.width,a.height,a.created_at as "createdAt" from ap.inquiry_attachments a
        join ap.inquiry_messages m on m.id=a.message_id and m.inquiry_id=a.inquiry_id and m.visibility='customer'
        where a.inquiry_id=$1 and a.organization_id=$2 and a.state='ready' order by a.created_at,a.id`, [access.inquiry_id, access.organization_id])).rows;
      if (!await allowed(db, request, user, request.params.id)) {
        await audit(db, access, user, 'read_denied'); await db.query('commit'); return fail(reply, 403, 'support_access_required');
      }
      await audit(db, access, user, 'detail_read');
      await db.query('commit'); return result;
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
  app.get<{ Params: { id: string; attachmentId: string } }>('/v1/admin/support/inquiries/:id/attachments/:attachmentId', async (request, reply) => {
    const user = await adminFor(request, reply, runtime);
    if (!user) return reply;
    const { id, attachmentId } = request.params;
    if (!uuid.test(id) || !uuid.test(attachmentId)) return fail(reply, 403, 'support_access_required');
    const access = await allowed(runtime.pool, request, user, id, 'photos');
    if (!access) return fail(reply, 403, 'support_access_required');
    const row = (await runtime.pool.query<{ object_key: string; sha256: string; byte_size: number }>(`select a.object_key,a.sha256,a.byte_size
      from ap.inquiry_attachments a join ap.inquiry_messages m on m.id=a.message_id and m.inquiry_id=a.inquiry_id and m.visibility='customer'
      where a.id=$1 and a.inquiry_id=$2 and a.organization_id=$3 and a.state='ready'`, [attachmentId, id, access.organization_id])).rows[0];
    if (!row) return fail(reply, 404, 'attachment_not_found');
    if (!runtime.inquiryMedia) { await audit(runtime.pool, access, user, 'photo_unavailable', attachmentId); return fail(reply, 503, 'blocked_integration'); }
    let bytes: Buffer | null;
    try { bytes = await runtime.inquiryMedia.get(row.object_key); } catch { bytes = null; }
    if (!await allowed(runtime.pool, request, user, id, 'photos')) {
      await audit(runtime.pool, access, user, 'read_denied', attachmentId); return fail(reply, 403, 'support_access_required');
    }
    if (!bytes || bytes.length !== row.byte_size || hash(bytes) !== row.sha256) {
      await audit(runtime.pool, access, user, 'photo_unavailable', attachmentId); return fail(reply, 503, 'media_unavailable');
    }
    const guard=await runtime.pool.connect();let retained=false;
    try {
      await guard.query('begin');
      const current=await guard.query(`select a.id from ap.inquiry_attachments a join ap.inquiries i on i.id=a.inquiry_id
        where a.id=$1 and a.inquiry_id=$2 and a.organization_id=$3 and a.state='ready'
          and i.retention_work_purged_at is null for share of i,a`,[attachmentId,id,access.organization_id]);
      if(!current.rowCount||!await allowed(guard,request,user,id,'photos')) return fail(reply,403,'support_access_required');
      await audit(runtime.pool, access, user, 'photo_read', attachmentId);
      retainReadGuardThroughResponse(reply,guard);retained=true;
      return reply.header('X-Content-Type-Options', 'nosniff').type('image/webp').send(bytes);
    } finally {if(!retained){try{await guard.query('rollback');}finally{guard.release();}}}
  });
}
