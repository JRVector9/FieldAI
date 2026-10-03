import type { Pool, PoolClient } from 'pg';
import type { FieldSiteMediaStore } from './site-media.js';
import type { FieldRetentionJournal } from './retention-journal.js';
import { appendFieldRetentionEntry, verifyFieldRetentionJournal } from './retention-journal-integrity.js';
import { lockRetentionTarget, retentionBasisHash, type RetentionJob } from './retention-purge-routes.js';
import { previewRetention, RETENTION_TABLES, type RetentionKind } from './work-retention.js';

const PURGED_BODY = '[보존 기간 종료]';
export const RETENTION_PHOTO_TABLES = {
  inquiry: { table: 'field.inquiry_attachments', column: 'inquiry_id', ready: 'ready' },
  reservation: { table: 'field.reservation_attachments', column: 'reservation_id', ready: 'ready' },
  external_request: { table: 'field.external_request_attachments', column: 'external_request_id', ready: 'copied' },
};
export async function removeRetainedPayload(db: PoolClient, kind: RetentionKind, id: string, at: Date) {
  if (kind === 'inquiry') {
    await db.query('update field.inquiry_messages set body=$2 where inquiry_id=$1', [id, PURGED_BODY]);
    await db.query(`update field.inquiries set customer_name=$2,customer_phone='',visit_region=null,retention_work_purged_at=coalesce(retention_work_purged_at,$3) where id=$1`, [id, PURGED_BODY, at]);
  } else if (kind === 'reservation') {
    await db.query('update field.reservation_messages set body=$2 where reservation_id=$1', [id, PURGED_BODY]);
    await db.query("update field.reservation_events set detail=jsonb_build_object('retention','purged') where reservation_id=$1", [id]);
    await db.query('update field.occupancies set label=null where reservation_id=$1', [id]);
    await db.query(`update field.reservations set customer_name=$2,customer_phone='',request_message=null,visit_region=null,preferred_time_text=null,
      change_preferred_text=null,retention_work_purged_at=coalesce(retention_work_purged_at,$3) where id=$1`, [id, PURGED_BODY, at]);
  } else await db.query(`update field.external_work_requests set customer_snapshot='{}',request_snapshot='{}',summary=$2,retention_work_purged_at=coalesce(retention_work_purged_at,$3) where id=$1`, [id, PURGED_BODY, at]);
  await db.query("update field.outbox set payload=jsonb_build_object('retention','purged') where aggregate_id=$1", [id]);
}

// 짧은 보존 기간 정리(보존 작업자 주기 단계). 서명 없는 토스 웹훅 힌트·처리 작업자가 없는 AP recorded 사건은 30일,
// IP·비밀번호 시도 창은 15분 창이 끝난 뒤 지운다. 원장·업무 원본은 건드리지 않는다.
export async function purgeExpiredInboundRecords(pool: Pool) {
  const count = async (sql: string) => (await pool.query(sql)).rowCount ?? 0;
  return {
    billingWebhookEvents: await count("delete from field.billing_webhook_events where received_at < now() - interval '30 days'"),
    billingWebhookIpWindows: await count("delete from field.billing_webhook_ip_windows where updated_at < now() - interval '15 minutes'"),
    passwordWindows: await count("delete from field.account_deletion_password_windows where updated_at < now() - interval '15 minutes'"),
    apWebhookInbox: await count("delete from field.ap_webhook_inbox where state = 'recorded' and received_at < now() - interval '30 days'"),
  };
}

// 인증 메일 outbox 보존(추가). 보존 작업자의 짧은 보존 정리 주기(10분)에 함께 실행한다.
// - 7일이 지난 발송 완료(sent) 인증 메일(verify_email·reset_password)은 수신 주소를 고정 익명 주소로 바꾼다.
//   발송 결과·시각·목적은 감사용으로 남긴다.
// - 30일이 지난 행은 지운다. 단 blocked_integration·failed 행은 공급사 장애 확인을 위해 90일까지 둔다.
// - 한 번에 각 1000행씩만 처리하고 남은 행은 다음 주기에 이어서 처리한다.
export const FIELD_EMAIL_OUTBOX_ANONYMIZED_TO = 'redacted@retention.invalid';
export async function purgeFieldEmailOutbox(pool: Pool) {
  // 지울 행을 먼저 지워 곧 삭제될 행을 익명화하지 않는다.
  const deleted = (await pool.query(
    `delete from field.email_outbox where id in (select id from field.email_outbox
       where created_at < now() - interval '30 days'
         and (state not in ('blocked_integration','failed') or created_at < now() - interval '90 days')
       order by created_at limit 1000)`)).rowCount ?? 0;
  const anonymized = (await pool.query(
    `update field.email_outbox set "to"=$1 where id in (select id from field.email_outbox
       where state='sent' and purpose in ('verify_email','reset_password') and created_at < now() - interval '7 days'
         and "to"<>$1 order by created_at limit 1000)`, [FIELD_EMAIL_OUTBOX_ANONYMIZED_TO])).rowCount ?? 0;
  return { emailOutboxAnonymized: anonymized, emailOutboxDeleted: deleted };
}

export async function runFieldRetentionJobOnce(runtime: { pool: Pool; media?: FieldSiteMediaStore; journal?: Pick<FieldRetentionJournal, 'read' | 'append'> }): Promise<'empty' | 'completed' | 'blocked' | 'retry' | 'receipt_pending'> {
  if (runtime.journal) await verifyFieldRetentionJournal(runtime.pool,runtime.journal);
  const db = await runtime.pool.connect(); let job: RetentionJob | undefined;
  const journalBase = () => ({ jobId: job!.id, organizationId: job!.organization_id, targetKind: job!.target_kind, targetId: job!.target_id, scope: job!.scope });
  try {
    await db.query('begin');
    job = (await db.query<RetentionJob>(`select * from field.work_retention_jobs where (state in ('approved','retry') or state='completed' and last_error='completion_receipt_pending') and next_attempt_at<=clock_timestamp()
      order by next_attempt_at,created_at,id for update skip locked limit 1`)).rows[0];
    if (!job) { await db.query('commit'); return 'empty'; }
    if (job.state === 'completed') {
      if (!runtime.journal) throw new Error('journal_unavailable');
      await appendFieldRetentionEntry(runtime.pool,runtime.journal,{ ...journalBase(), action: 'completed' });
      await db.query('update field.work_retention_jobs set last_error=null where id=$1', [job.id]);
      await db.query('commit'); return 'completed';
    }
    await db.query('select id from field.work_retention_policies where id=$1 for share', [job.policy_id]);
    const parent = await lockRetentionTarget(db, job.target_kind, job.target_id, job.organization_id);
    const candidate = (await previewRetention(db, job.organization_id, job.policy_id, undefined, { kind: job.target_kind, id: job.target_id })).items[0];
    const roles = (await db.query("select user_id from field.platform_admin_memberships where user_id=any($1::text[]) and role='operator' order by user_id for share", [[job.requested_by, job.approved_by]])).rows;
    const denial = roles.length !== 2 ? 'operator_membership_required' : !parent ? 'work_not_found'
      : parent.retention_work_purged_at ? 'work_already_purged' : candidate?.reason !== 'due' ? candidate?.reason ?? 'work_not_found'
        : (job.scope === 'work' ? !candidate.workDue : !candidate.photosDue) ? 'not_due'
          : await retentionBasisHash(db, job.target_kind, job.target_id) !== job.basis_hash ? 'basis_changed'
            : !runtime.media || !runtime.journal ? 'blocked_integration' : null;
    if (denial) {
      await db.query("update field.work_retention_jobs set state=$2,last_error=$3 where id=$1", [job.id, denial === 'basis_changed' ? 'stale' : 'blocked', denial]);
      await db.query("insert into field.work_retention_job_audit(job_id,action,reason) values($1,$2,$3)", [job.id, denial === 'basis_changed' ? 'stale' : 'blocked', denial]);
      await db.query('commit'); return 'blocked';
    }
    const source = RETENTION_PHOTO_TABLES[job.target_kind];
    const photos = (await db.query<{ id: string; object_key: string }>(`select id,object_key from ${source.table}
      where ${source.column}=$1 and organization_id=$2 and state=$3 order by id for update`, [job.target_id, job.organization_id, source.ready])).rows;
    for (const photo of photos) {
      // 삭제 전에 의도를 독립 원장에 남긴다. prepared는 파일 부재 확인 증빙이 아니다.
      await appendFieldRetentionEntry(runtime.pool,runtime.journal!,{ ...journalBase(), action: 'file_prepared', attachmentId: photo.id, objectKey: photo.object_key });
      await runtime.media!.delete(photo.object_key);
      if (await runtime.media!.get(photo.object_key) !== null) throw new Error('file_delete_unconfirmed');
      await appendFieldRetentionEntry(runtime.pool,runtime.journal!,{ ...journalBase(), action: 'file_deleted', attachmentId: photo.id, objectKey: photo.object_key });
      await db.query('insert into field.work_retention_job_audit(job_id,action,reason,attachment_id) values($1,$2,$3,$4)', [job.id, 'file_deleted', 'file_absence_confirmed', photo.id]);
    }
    const at = (await db.query<{ now: Date }>('select clock_timestamp() as now')).rows[0]!.now;
    await db.query(`update ${source.table} set state='purged',object_key=null,sha256=null,byte_size=null,width=null,height=null,purged_at=$3
      where ${source.column}=$1 and organization_id=$2 and state=$4`, [job.target_id, job.organization_id, at, source.ready]);
    await db.query(`update ${RETENTION_TABLES[job.target_kind]} set retention_photos_purged_at=coalesce(retention_photos_purged_at,$2) where id=$1`, [job.target_id, at]);
    if (job.scope === 'work') {
      await removeRetainedPayload(db, job.target_kind, job.target_id, at);
    }
    // 파일 부재와 SQL 정리 준비 뒤 commit 전 기록한다. 사진 없는 업무도 복원 대상이다.
    await appendFieldRetentionEntry(runtime.pool,runtime.journal!,{ ...journalBase(), action: 'purge_prepared' });
    await db.query("update field.work_retention_jobs set state='completed',completed_at=$2,last_error='completion_receipt_pending',attempt_count=attempt_count+1 where id=$1", [job.id, at]);
    await db.query("insert into field.work_retention_job_audit(job_id,action,reason) values($1,'completed','native_retention_completed')", [job.id]);
    await db.query('commit');
    await appendFieldRetentionEntry(runtime.pool,runtime.journal!,{ ...journalBase(), action: 'completed' });
    await runtime.pool.query("update field.work_retention_jobs set last_error=null where id=$1 and state='completed'", [job.id]);
    return 'completed';
  } catch {
    await db.query('rollback');
    if (job) {
      const state = (await runtime.pool.query<{ state: string }>('select state from field.work_retention_jobs where id=$1', [job.id])).rows[0]?.state;
      if (state === 'completed') {
        await runtime.pool.query("update field.work_retention_jobs set last_error='completion_receipt_pending',next_attempt_at=clock_timestamp()+interval '30 seconds' where id=$1", [job.id]);
        return 'receipt_pending';
      }
      const retry = await runtime.pool.query(`update field.work_retention_jobs set state='retry',attempt_count=attempt_count+1,last_error='file_or_journal_unconfirmed',
        next_attempt_at=clock_timestamp()+interval '30 seconds' where id=$1 and state in ('approved','retry') returning id`, [job.id]);
      if (retry.rowCount) await runtime.pool.query("insert into field.work_retention_job_audit(job_id,action,reason) values($1,'retry','file_or_journal_unconfirmed')", [job.id]);
    }
    return 'retry';
  } finally { db.release(); }
}
