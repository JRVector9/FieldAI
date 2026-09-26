import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';
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
  const messages=(await db.query('select * from ap.inquiry_messages where inquiry_id=$1 order by id',[id])).rows;
  const photos=(await db.query('select * from ap.inquiry_attachments where inquiry_id=$1 order by id',[id])).rows;
  const ai=(await db.query('select * from ap.ai_runs where inquiry_id=$1 order by id',[id])).rows;
  const actions=(await db.query('select * from ap.field_action_requests where inquiry_id=$1 order by id',[id])).rows;
  const events=(await db.query('select e.* from ap.field_reservation_events e join ap.field_action_requests r on r.id=e.action_request_id where r.inquiry_id=$1 order by e.id',[id])).rows;
  // 원본은 서버 안에서만 읽고 불변 기준에는 digest만 남긴다.
  return hash(JSON.stringify([parent,messages,photos,ai,actions,events]));
}
export async function lockRetentionTarget(db: PoolClient, kind: RetentionKind, id: string, org: string) {

  return (await db.query(`select * from ${RETENTION_TABLES[kind]} where id=$1 and organization_id=$2 for update`, [id, org])).rows[0] ?? null;
}

export function registerAgentRetentionPurgeRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get('/v1/admin/retention/jobs', async (request, reply) => {
    if (!await retentionAdminFor(request, reply, runtime, false)) return reply;
    return { jobs: (await runtime.pool.query<RetentionJob>('select * from ap.work_retention_jobs order by created_at desc,id desc limit 100')).rows.map(view) };
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
      await db.query('begin'); await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`ap-retention-job:${user}:${key}`]);
      const old = (await db.query<RetentionJob>('select * from ap.work_retention_jobs where requested_by=$1 and submission_key_hash=$2', [user, key])).rows[0];
      if (old) { await db.query('commit'); return old.request_hash === requestHash ? { id: old.id } : reply.code(409).send({ error: 'idempotency_conflict' }); }
      if (!await lockRetentionTarget(db, kind, b.targetId, b.organizationId)) { await db.query('rollback'); return reply.code(404).send({ error: 'work_not_found' }); }
      await db.query('select id from ap.work_retention_policies where id=$1 for share', [b.policyId]);
      const candidate = (await previewRetention(db, b.organizationId, b.policyId, undefined, { kind, id: b.targetId })).items[0];
      if (!candidate || candidate.revision !== b.expectedRevision || candidate.anchorAt?.toISOString() !== b.expectedAnchorAt) {
        await db.query('rollback'); return reply.code(409).send({ error: 'retention_basis_changed' });
      }
      if (candidate.reason !== 'due' || (b.scope === 'work' ? !candidate.workDue : !candidate.photosDue)) {
        await db.query('rollback'); return reply.code(409).send({ error: candidate.reason });
      }
      const id = randomUUID(), basis = await retentionBasisHash(db, kind, b.targetId);
      await db.query(`insert into ap.work_retention_jobs(id,organization_id,target_kind,target_id,inquiry_id,policy_id,
        scope,expected_revision,expected_anchor_at,basis_hash,requested_by,reason,submission_key_hash,request_hash)
        values($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id,b.organizationId,kind,b.targetId,b.policyId, b.scope, b.expectedRevision, b.expectedAnchorAt, basis, user, reason, key, requestHash]);
      await db.query("insert into ap.work_retention_job_audit(job_id,actor_user_id,action,reason) values($1,$2,'requested',$3)", [id, user, reason]);
      await db.query('commit'); return reply.code(201).send({ id });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
  for (const action of ['approve', 'cancel'] as const) app.post<{ Params: { id: string } }>(`/v1/admin/retention/jobs/:id/${action}`, async (request, reply) => {
    const user = await retentionAdminFor(request, reply, runtime); if (!user) return reply;
    const id = request.params.id, reason = reasonFor(object(request.body).reason);
    if (!uuid.test(id) || !reason) return reply.code(400).send({ error: 'invalid_retention_action' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin'); const job = (await db.query<RetentionJob>('select * from ap.work_retention_jobs where id=$1 for update', [id])).rows[0];
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
        await db.query('select id from ap.work_retention_policies where id=$1 for share', [job.policy_id]);
        await lockRetentionTarget(db, job.target_kind, job.target_id, job.organization_id);
        const candidate = (await previewRetention(db, job.organization_id, job.policy_id, undefined, { kind: job.target_kind, id: job.target_id })).items[0];
        if (!candidate || candidate.reason !== 'due' || await retentionBasisHash(db, job.target_kind, job.target_id) !== job.basis_hash
          || !(await db.query("select 1 from ap.platform_admin_memberships where user_id=$1 and role='operator' for share", [job.requested_by])).rowCount) {
          await db.query('rollback'); return reply.code(409).send({ error: 'retention_basis_changed' });
        }
      }
      const row = (await db.query<RetentionJob>(action === 'approve'
        ? "update ap.work_retention_jobs set state='approved',approved_by=$2,approved_at=clock_timestamp(),approval_reason=$3 where id=$1 returning *"
        : "update ap.work_retention_jobs set state='canceled',canceled_by=$2,canceled_at=clock_timestamp(),cancellation_reason=$3 where id=$1 returning *", [id, user, reason])).rows[0]!;
      await db.query('insert into ap.work_retention_job_audit(job_id,actor_user_id,action,reason) values($1,$2,$3,$4)', [id, user, action === 'approve' ? 'approved' : 'canceled', reason]);
      await db.query('commit'); return action === 'approve' ? { approvedAt: row.approved_at, state: row.state } : { state: row.state };
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
