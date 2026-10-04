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

// 인증 메일 outbox 보존 규칙(추가):
// - 7일이 지난 발송 완료(sent)·중복 생략(suppressed_duplicate) 인증 메일(verify_email·reset_password)은 수신 주소를 고정 익명 주소로 바꾼다.
//   발송 결과·시각·목적은 감사용으로 남긴다.
// - 30일이 지난 행은 지운다. 단 blocked_integration·failed 행은 운영자가 공급사 장애를 확인할 수 있도록 90일까지 둔다.
// - 한 주기에 각 1000행씩만 처리하고 남은 행은 다음 주기에 이어서 처리한다.
export const EMAIL_OUTBOX_ANONYMIZED_TO = 'redacted@retention.invalid';
export async function purgeAgentEmailOutbox(pool: Pool) {
  const anonymized = (await pool.query(
    `update ap.email_outbox set "to"=$1 where id in (select id from ap.email_outbox
       where state in ('sent','suppressed_duplicate') and purpose in ('verify_email','reset_password') and created_at < now() - interval '7 days'
         and "to"<>$1 order by created_at limit 1000)`, [EMAIL_OUTBOX_ANONYMIZED_TO])).rowCount ?? 0;
  const deleted = (await pool.query(
    `delete from ap.email_outbox where id in (select id from ap.email_outbox
       where created_at < now() - interval '30 days'
         and (state not in ('blocked_integration','failed') or created_at < now() - interval '90 days')
       order by created_at limit 1000)`)).rowCount ?? 0;
  return { anonymized, deleted };
}

// 미인증 가입 정리(추가, 보안 #2): 이메일 인증 없이 48시간이 지난 비밀번호(credential) 전용 계정 중 어떤 조직·매체·관리자
// 소속도 없는 계정을 지워 주소 선점(다른 사람 주소로 가입만 해 두기)으로 실제 주인의 가입이 막히지 않게 한다.
// 세션·credential·2FA·OAuth 행은 FK cascade로 함께 지워진다. 다른 기록이 FK로 참조하는 계정은 건너뛴다(그 행만 되돌림).
// 한 주기에 100명까지 처리한다. mock 프로필은 메일 인증을 요구하지 않으므로 작업자가 호출하지 않는다.
const unverifiedCleanupCursors=new WeakMap<Pool,{at:string;id:string}>();
const UNVERIFIED_CANDIDATE_SQL=`u."emailVerified"=false and u."createdAt"<now()-interval '48 hours'
      and exists(select 1 from "account" a where a."userId"=u.id and a."providerId"='credential')
      and not exists(select 1 from "account" a where a."userId"=u.id and a."providerId"<>'credential')
      and not exists(select 1 from ap.memberships m where m.user_id=u.id)
      and not exists(select 1 from ap.organizations o where o.owner_user_id=u.id)
      and not exists(select 1 from ap.publishers p where p.owner_user_id=u.id)
      and not exists(select 1 from ap.publisher_memberships p where p.user_id=u.id)
      and not exists(select 1 from ap.platform_admin_memberships p where p.user_id=u.id)`;
export async function purgeUnverifiedCredentialUsers(pool: Pool) {
  const cursor=unverifiedCleanupCursors.get(pool);
  const candidates = (await pool.query<{ id: string; at:string }>(`select u.id,u."createdAt"::text as at from "user" u
    where ${UNVERIFIED_CANDIDATE_SQL} and ($1::timestamptz is null or (u."createdAt",u.id)>($1::timestamptz,$2::text))
    order by u."createdAt",u.id limit 100`,[cursor?.at??null,cursor?.id??null])).rows;
  if(!candidates.length){unverifiedCleanupCursors.delete(pool);return 0;}
  let deleted = 0;
  for (const candidate of candidates) {
    const db = await pool.connect();
    try {
      await db.query('begin');
      // 고른 뒤 인증·소속이 생겼으면 지우지 않도록 같은 조건을 잠금 아래 다시 확인한다
      const removed = (await db.query(`delete from "user" u where u.id=$1 and ${UNVERIFIED_CANDIDATE_SQL}`, [candidate.id])).rowCount ?? 0;
      await db.query('commit');
      deleted += removed;
    } catch (error) {
      await db.query('rollback');
      // FK 참조(23503)가 있는 계정은 감사 기록 보존을 위해 남긴다. 그 밖의 오류는 작업자에 알린다
      if ((error as { code?: string }).code !== '23503') throw error;
    } finally { db.release(); }
  }
  // The long-running worker carries the keyset across cycles. An empty page
  // wraps around so newly eligible or newly unreferenced users are reconsidered.
  const last=candidates.at(-1)!;unverifiedCleanupCursors.set(pool,{at:last.at,id:last.id});
  return deleted;
}
