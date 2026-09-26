import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { previewRetention, RETENTION_TABLES, type RetentionKind } from './work-retention.js';
import { retentionAdminFor } from './retention-routes.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const reasonFor = (value: unknown) => typeof value === 'string' && value.trim().length >= 10 && value.length <= 500 ? value.trim() : null;
export type RetentionJob = { id: string; organization_id: string; target_kind: RetentionKind; target_id: string; policy_id: string;
  scope: 'photos' | 'work'; expected_revision: number; expected_anchor_at: Date; basis_hash: string;
  requested_by: string; reason: string; request_hash: string; state: string; approved_by: string | null; approved_at: Date | null;
  approval_reason: string | null; canceled_by: string | null; cancellation_reason: string | null; attempt_count: number; last_error: string | null; completed_at: Date | null };
const view = (j: RetentionJob) => ({ id: j.id, organizationId: j.organization_id, targetKind: j.target_kind, targetId: j.target_id,
  policyId: j.policy_id, scope: j.scope, revision: j.expected_revision, anchorAt: j.expected_anchor_at, requestedBy: j.requested_by,
  reason: j.reason, state: j.state, approvedBy: j.approved_by, approvedAt: j.approved_at, attemptCount: j.attempt_count,
  error: j.last_error, completedAt: j.completed_at });

export async function retentionBasisHash(db: PoolClient, kind: RetentionKind, id: string): Promise<string | null> {
  const parent = (await db.query(`select * from ${RETENTION_TABLES[kind]} where id=$1`, [id])).rows[0];
  if (!parent) return null;
  const messages = kind === 'inquiry' ? (await db.query('select * from field.inquiry_messages where inquiry_id=$1 order by id', [id])).rows
    : kind === 'reservation' ? (await db.query('select * from field.reservation_messages where reservation_id=$1 order by id', [id])).rows : [];
  const table = kind === 'inquiry' ? 'field.inquiry_attachments' : kind === 'reservation' ? 'field.reservation_attachments' : 'field.external_request_attachments';
  const column = kind === 'inquiry' ? 'inquiry_id' : kind === 'reservation' ? 'reservation_id' : 'external_request_id';
  const photos = (await db.query(`select * from ${table} where ${column}=$1 order by id`, [id])).rows;
  const events = kind === 'reservation' ? (await db.query('select * from field.reservation_events where reservation_id=$1 order by id', [id])).rows : [];
  const occupancies = kind === 'reservation' ? (await db.query('select * from field.occupancies where reservation_id=$1 order by id', [id])).rows : [];
  const related = kind === 'external_request' && parent.reservation_id ? await retentionBasisHash(db, 'reservation', parent.reservation_id as string) : null;
  // 원본은 서버 안에서만 읽고 불변 기준에는 digest만 남긴다.
  return hash(JSON.stringify([parent, messages, photos, events, occupancies, related]));
}
export async function lockRetentionTarget(db: PoolClient, kind: RetentionKind, id: string, org: string) {
  // 연결 예약과 수신 업무는 같은 순서로 잠가 보류/신규 저장과 직렬화한다.
  const linked = (await db.query<{ id: string; reservation_id: string | null }>(`select id,reservation_id from field.external_work_requests
    where organization_id=$1 and (id=$2 and $3='external_request' or reservation_id=$2 and $3='reservation')`, [org, id, kind])).rows;
  const reservations = [...new Set([...(kind === 'reservation' ? [id] : []), ...linked.flatMap(r => r.reservation_id ? [r.reservation_id] : [])])].sort();
  if (reservations.length) await db.query('select id from field.reservations where organization_id=$1 and id=any($2::uuid[]) order by id for update', [org, reservations]);
  if (linked.length) await db.query('select id from field.external_work_requests where organization_id=$1 and id=any($2::uuid[]) order by id for update', [org, linked.map(r => r.id).sort()]);
  return (await db.query(`select * from ${RETENTION_TABLES[kind]} where id=$1 and organization_id=$2 for update`, [id, org])).rows[0] ?? null;
}

export function registerFieldRetentionPurgeRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get('/v1/admin/retention/jobs', async (request, reply) => {
    if (!await retentionAdminFor(request, reply, runtime, false)) return reply;
    return { jobs: (await runtime.pool.query<RetentionJob>('select * from field.work_retention_jobs order by created_at desc,id desc limit 100')).rows.map(view) };
  });
  app.post('/v1/admin/retention/jobs', async (request, reply) => {
    const user = await retentionAdminFor(request, reply, runtime); if (!user) return reply;
    const b = object(request.body), reason = reasonFor(b.reason), rawKey = request.headers['idempotency-key'];
    if (!reason || typeof rawKey !== 'string' || !uuid.test(rawKey) || typeof b.organizationId !== 'string' || !uuid.test(b.organizationId)
      || typeof b.targetId !== 'string' || !uuid.test(b.targetId) || typeof b.policyId !== 'string' || !uuid.test(b.policyId)
      || typeof b.targetKind !== 'string' || !Object.hasOwn(RETENTION_TABLES, b.targetKind) || typeof b.scope !== 'string' || !['work','photos'].includes(b.scope)
      || !Number.isInteger(b.expectedRevision) || typeof b.expectedAnchorAt !== 'string' || !Number.isFinite(Date.parse(b.expectedAnchorAt)))
      return reply.code(400).send({ error: 'invalid_retention_job' });
    const kind = b.targetKind as RetentionKind, key = hash(rawKey), requestHash = hash(JSON.stringify([b.organizationId, kind, b.targetId, b.policyId, b.scope, b.expectedRevision, b.expectedAnchorAt, reason]));
    const db = await runtime.pool.connect();
    try {
      await db.query('begin'); await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`field-retention-job:${user}:${key}`]);
      const old = (await db.query<RetentionJob>('select * from field.work_retention_jobs where requested_by=$1 and submission_key_hash=$2', [user, key])).rows[0];
      if (old) { await db.query('commit'); return old.request_hash === requestHash ? { id: old.id } : reply.code(409).send({ error: 'idempotency_conflict' }); }
      if (!await lockRetentionTarget(db, kind, b.targetId, b.organizationId)) { await db.query('rollback'); return reply.code(404).send({ error: 'work_not_found' }); }
      await db.query('select id from field.work_retention_policies where id=$1 for share', [b.policyId]);
      const candidate = (await previewRetention(db, b.organizationId, b.policyId, undefined, { kind, id: b.targetId })).items[0];
      if (!candidate || candidate.revision !== b.expectedRevision || candidate.anchorAt?.toISOString() !== b.expectedAnchorAt) {
        await db.query('rollback'); return reply.code(409).send({ error: 'retention_basis_changed' });
      }
      if (candidate.reason !== 'due' || (b.scope === 'work' ? !candidate.workDue : !candidate.photosDue)) {
        await db.query('rollback'); return reply.code(409).send({ error: candidate.reason });
      }
      const id = randomUUID(), basis = await retentionBasisHash(db, kind, b.targetId);
      await db.query(`insert into field.work_retention_jobs(id,organization_id,target_kind,target_id,inquiry_id,reservation_id,external_request_id,policy_id,
        scope,expected_revision,expected_anchor_at,basis_hash,requested_by,reason,submission_key_hash,request_hash)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, b.organizationId, kind, b.targetId, kind === 'inquiry' ? b.targetId : null, kind === 'reservation' ? b.targetId : null,
        kind === 'external_request' ? b.targetId : null, b.policyId, b.scope, b.expectedRevision, b.expectedAnchorAt, basis, user, reason, key, requestHash]);
      await db.query("insert into field.work_retention_job_audit(job_id,actor_user_id,action,reason) values($1,$2,'requested',$3)", [id, user, reason]);
      await db.query('commit'); return reply.code(201).send({ id });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
  for (const action of ['approve', 'cancel'] as const) app.post<{ Params: { id: string } }>(`/v1/admin/retention/jobs/:id/${action}`, async (request, reply) => {
    const user = await retentionAdminFor(request, reply, runtime); if (!user) return reply;
    const id = request.params.id, reason = reasonFor(object(request.body).reason);
    if (!uuid.test(id) || !reason) return reply.code(400).send({ error: 'invalid_retention_action' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin'); const job = (await db.query<RetentionJob>('select * from field.work_retention_jobs where id=$1 for update', [id])).rows[0];
      if (!job) { await db.query('rollback'); return reply.code(404).send({ error: 'retention_job_not_found' }); }
      if (action === 'approve' && job.requested_by === user || action === 'cancel' && job.requested_by !== user && job.approved_by !== user) {
        await db.query('rollback'); return reply.code(403).send({ error: 'retention_actor_denied' });
      }
      if (action === 'approve' && job.approved_at) { await db.query('commit'); return job.approved_by === user && job.approval_reason === reason
        ? { approvedAt: job.approved_at, state: job.state } : reply.code(409).send({ error: 'already_approved' }); }
      if (action === 'cancel' && job.state === 'canceled') { await db.query('commit'); return job.canceled_by === user && job.cancellation_reason === reason
        ? { state: 'canceled' } : reply.code(409).send({ error: 'already_canceled' }); }
      if (job.state === 'completed' || action === 'approve' && job.state !== 'pending') { await db.query('rollback'); return reply.code(409).send({ error: 'retention_job_terminal' }); }
      if (action === 'approve') {
        await db.query('select id from field.work_retention_policies where id=$1 for share', [job.policy_id]);
        await lockRetentionTarget(db, job.target_kind, job.target_id, job.organization_id);
        const candidate = (await previewRetention(db, job.organization_id, job.policy_id, undefined, { kind: job.target_kind, id: job.target_id })).items[0];
        if (!candidate || candidate.reason !== 'due' || await retentionBasisHash(db, job.target_kind, job.target_id) !== job.basis_hash
          || !(await db.query("select 1 from field.platform_admin_memberships where user_id=$1 and role='operator' for share", [job.requested_by])).rowCount) {
          await db.query('rollback'); return reply.code(409).send({ error: 'retention_basis_changed' });
        }
      }
      const row = (await db.query<RetentionJob>(action === 'approve'
        ? "update field.work_retention_jobs set state='approved',approved_by=$2,approved_at=clock_timestamp(),approval_reason=$3 where id=$1 returning *"
        : "update field.work_retention_jobs set state='canceled',canceled_by=$2,canceled_at=clock_timestamp(),cancellation_reason=$3 where id=$1 returning *", [id, user, reason])).rows[0]!;
      await db.query('insert into field.work_retention_job_audit(job_id,actor_user_id,action,reason) values($1,$2,$3,$4)', [id, user, action === 'approve' ? 'approved' : 'canceled', reason]);
      await db.query('commit'); return action === 'approve' ? { approvedAt: row.approved_at, state: row.state } : { state: row.state };
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
