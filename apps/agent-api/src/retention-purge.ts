import type { Pool, PoolClient } from 'pg';
import type { AgentInquiryMediaStore } from './inquiry-media.js';
import type { AgentRetentionJournal } from './retention-journal.js';
import { appendAgentRetentionEntry, verifyAgentRetentionJournal } from './retention-journal-integrity.js';
import { lockRetentionTarget, retentionBasisHash, type RetentionJob } from './retention-purge-routes.js';
import { previewRetention, RETENTION_TABLES, type RetentionKind } from './work-retention.js';

const PURGED_BODY = '[보존 기간 종료]';
export const RETENTION_PHOTO_TABLES = {inquiry:{table:'ap.inquiry_attachments',column:'inquiry_id',ready:'ready'}};
export async function removeRetainedPayload(db:PoolClient,_kind:RetentionKind,id:string,at:Date) {
  await db.query('update ap.inquiry_messages set body=$2 where inquiry_id=$1',[id,PURGED_BODY]);
  await db.query('update ap.ai_runs set question=$2,answer=null where inquiry_id=$1',[id,PURGED_BODY]);
  await db.query("update ap.field_action_requests set field_request_body='{}',service_snapshot='{}' where inquiry_id=$1",[id]);
  await db.query("update ap.outbox set payload=jsonb_build_object('retention','purged') where aggregate_id=$1 or aggregate_id in(select id::text from ap.field_action_requests where inquiry_id=$1::uuid)",[id]);
  await db.query(`update ap.inquiries set customer_name=case when customer_name is null then null else $2 end,
    customer_phone=case when customer_phone is null then null else '' end,service_snapshot=null,
    state='closed',automation_paused=true,retention_work_purged_at=coalesce(retention_work_purged_at,$3) where id=$1`,[id,PURGED_BODY,at]);
}

export async function runAgentRetentionJobOnce(runtime: { pool: Pool; media?: AgentInquiryMediaStore; journal?: Pick<AgentRetentionJournal, 'read' | 'append'> }): Promise<'empty' | 'completed' | 'blocked' | 'retry' | 'receipt_pending'> {
  if (runtime.journal) await verifyAgentRetentionJournal(runtime.pool,runtime.journal);
  const db = await runtime.pool.connect(); let job: RetentionJob | undefined;
  const journalBase = () => ({ jobId: job!.id, organizationId: job!.organization_id, targetKind: job!.target_kind, targetId: job!.target_id, scope: job!.scope });
  try {
    await db.query('begin');
    job = (await db.query<RetentionJob>(`select * from ap.work_retention_jobs where (state in ('approved','retry') or state='completed' and last_error='completion_receipt_pending') and next_attempt_at<=clock_timestamp()
      order by next_attempt_at,created_at,id for update skip locked limit 1`)).rows[0];
    if (!job) { await db.query('commit'); return 'empty'; }
    if (job.state === 'completed') {
      if (!runtime.journal) throw new Error('journal_unavailable');
      await appendAgentRetentionEntry(runtime.pool,runtime.journal,{ ...journalBase(), action: 'completed' });
      await db.query('update ap.work_retention_jobs set last_error=null where id=$1', [job.id]);
      await db.query('commit'); return 'completed';
    }
    const policy=(await db.query<{requested_by:string;approved_by:string|null}>('select requested_by,approved_by from ap.work_retention_policies where id=$1 for share',[job.policy_id])).rows[0];
    const parent = await lockRetentionTarget(db, job.target_kind, job.target_id, job.organization_id);
    const candidate = (await previewRetention(db, job.organization_id, job.policy_id, undefined, { kind: job.target_kind, id: job.target_id })).items[0];
    const actors=[...new Set([job.requested_by,job.approved_by,policy?.requested_by,policy?.approved_by].filter((id):id is string=>typeof id==='string'))];
    const roles = (await db.query("select user_id from ap.platform_admin_memberships where user_id=any($1::text[]) and role='operator' order by user_id for share", [actors])).rows;
    const denial = actors.length<2||roles.length!==actors.length ? 'operator_membership_required' : !parent ? 'work_not_found'
      : parent.retention_work_purged_at ? 'work_already_purged' : candidate?.reason !== 'due' ? candidate?.reason ?? 'work_not_found'
        : (job.scope === 'work' ? !candidate.workDue : !candidate.photosDue) ? 'not_due'
          : await retentionBasisHash(db, job.target_kind, job.target_id) !== job.basis_hash ? 'basis_changed'
            : !runtime.media || !runtime.journal ? 'blocked_integration' : null;
    if (denial) {
      await db.query("update ap.work_retention_jobs set state=$2,last_error=$3 where id=$1", [job.id, denial === 'basis_changed' ? 'stale' : 'blocked', denial]);
      await db.query("insert into ap.work_retention_job_audit(job_id,action,reason) values($1,$2,$3)", [job.id, denial === 'basis_changed' ? 'stale' : 'blocked', denial]);
      await db.query('commit'); return 'blocked';
    }
    const source = RETENTION_PHOTO_TABLES[job.target_kind];
    const photos = (await db.query<{ id: string; object_key: string }>(`select id,object_key from ${source.table}
      where ${source.column}=$1 and organization_id=$2 and state=$3 order by id for update`, [job.target_id, job.organization_id, source.ready])).rows;
    for (const photo of photos) {
      // 삭제 전에 의도를 독립 원장에 남긴다. prepared는 파일 부재 확인 증빙이 아니다.
      await appendAgentRetentionEntry(runtime.pool,runtime.journal!,{ ...journalBase(), action: 'file_prepared', attachmentId: photo.id, objectKey: photo.object_key });
      await runtime.media!.delete(photo.object_key);
      if (await runtime.media!.get(photo.object_key) !== null) throw new Error('file_delete_unconfirmed');
      await appendAgentRetentionEntry(runtime.pool,runtime.journal!,{ ...journalBase(), action: 'file_deleted', attachmentId: photo.id, objectKey: photo.object_key });
      await db.query('insert into ap.work_retention_job_audit(job_id,action,reason,attachment_id) values($1,$2,$3,$4)', [job.id, 'file_deleted', 'file_absence_confirmed', photo.id]);
    }
    const at = (await db.query<{ now: Date }>('select clock_timestamp() as now')).rows[0]!.now;
    await db.query(`update ${source.table} set state='purged',object_key=null,sha256=null,byte_size=null,width=null,height=null,purged_at=$3
      where ${source.column}=$1 and organization_id=$2 and state=$4`, [job.target_id, job.organization_id, at, source.ready]);
    await db.query(`update ${RETENTION_TABLES[job.target_kind]} set retention_photos_purged_at=coalesce(retention_photos_purged_at,$2) where id=$1`, [job.target_id, at]);
    if (job.scope === 'work') {
      await removeRetainedPayload(db, job.target_kind, job.target_id, at);
    }
    // 파일 부재와 SQL 정리 준비 뒤 commit 전 기록한다. 사진 없는 업무도 복원 대상이다.
    await appendAgentRetentionEntry(runtime.pool,runtime.journal!,{ ...journalBase(), action: 'purge_prepared' });
    await db.query("update ap.work_retention_jobs set state='completed',completed_at=$2,last_error='completion_receipt_pending',attempt_count=attempt_count+1 where id=$1", [job.id, at]);
    await db.query("insert into ap.work_retention_job_audit(job_id,action,reason) values($1,'completed','native_retention_completed')", [job.id]);
    await db.query('commit');
    await appendAgentRetentionEntry(runtime.pool,runtime.journal!,{ ...journalBase(), action: 'completed' });
    await runtime.pool.query("update ap.work_retention_jobs set last_error=null where id=$1 and state='completed'", [job.id]);
    return 'completed';
  } catch {
    await db.query('rollback');
    if (job) {
      const state = (await runtime.pool.query<{ state: string }>('select state from ap.work_retention_jobs where id=$1', [job.id])).rows[0]?.state;
      if (state === 'completed') {
        await runtime.pool.query("update ap.work_retention_jobs set last_error='completion_receipt_pending',next_attempt_at=clock_timestamp()+interval '30 seconds' where id=$1", [job.id]);
        return 'receipt_pending';
      }
      const retry = await runtime.pool.query(`update ap.work_retention_jobs set state='retry',attempt_count=attempt_count+1,last_error='file_or_journal_unconfirmed',
        next_attempt_at=clock_timestamp()+interval '30 seconds' where id=$1 and state in ('approved','retry') returning id`, [job.id]);
      if (retry.rowCount) await runtime.pool.query("insert into ap.work_retention_job_audit(job_id,action,reason) values($1,'retry','file_or_journal_unconfirmed')", [job.id]);
    }
    return 'retry';
  } finally { db.release(); }
}
