import type { Pool } from 'pg';
import type { AgentInquiryMediaStore } from './inquiry-media.js';
import type { AgentRetentionJournal } from './retention-journal.js';
import { lockRetentionTarget } from './retention-purge-routes.js';
import { removeRetainedPayload, RETENTION_PHOTO_TABLES } from './retention-purge.js';
import { RETENTION_TABLES } from './work-retention.js';

export async function reapplyAgentRetentionJournal(runtime: { pool: Pool; media: AgentInquiryMediaStore;
  journal: Pick<AgentRetentionJournal, 'verifiedEntries'>; checkpoint: string }) {
  const entries = await runtime.journal.verifiedEntries(runtime.checkpoint);
  const binding = new Map<string, string>();
  for (const entry of entries) {
    const value = JSON.stringify([entry.organizationId, entry.targetKind, entry.targetId, entry.scope]);
    if (binding.has(entry.jobId) && binding.get(entry.jobId) !== value) throw new Error('retention_journal_binding_conflict');
    binding.set(entry.jobId, value);
  }
  const confirmed = new Set(entries.filter(e => e.action === 'file_deleted').map(e => `${e.jobId}:${e.attachmentId}:${e.objectKey}`));
  if (entries.some(e => e.action === 'file_prepared' && !confirmed.has(`${e.jobId}:${e.attachmentId}:${e.objectKey}`)))
    throw new Error('retention_file_intent_unconfirmed');
  if (entries.some(e => e.action === 'completed' && !entries.some(p => p.jobId === e.jobId && p.action === 'purge_prepared')))
    throw new Error('retention_preparation_missing');
  const product = (await runtime.pool.query<{ valid: boolean }>(`select exists(select 1 from pg_namespace where nspname='ap')
    and not exists(select 1 from pg_namespace where nspname='field') as valid`)).rows[0];
  if (!product?.valid) throw new Error('restored_database_must_contain_only_agent');
  let applied = 0;
  // 삭제 확인을 먼저 재적용하고 원문 정리는 그 뒤 적용한다. 실패 시 공개 서버를 시작하지 않는다.
  const ordered = entries.filter(e => e.action !== 'file_prepared').sort((a, b) =>
    Number(a.action !== 'file_deleted') - Number(b.action !== 'file_deleted') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const entry of ordered) {
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`agent-retention-restore:${entry.id}`]);
      const previous = (await db.query('select 1 from ap.retention_restore_audit where journal_entry_id=$1', [entry.id])).rowCount;
      if (previous) { await db.query('commit'); continue; }
      const parent = await lockRetentionTarget(db, entry.targetKind, entry.targetId, entry.organizationId);
      const at = new Date(entry.createdAt), source = RETENTION_PHOTO_TABLES[entry.targetKind];
      if (entry.action === 'file_deleted') {
        // DB에 없는 파일도 복원 경로에서 제거한다. 원장 서명과 org/attachment의 immutable key를 먼저 검사했다.
        const photo = (await db.query<{ organization_id: string; work_id: string }>(`select organization_id,${source.column} as work_id from ${source.table} where id=$1`, [entry.attachmentId])).rows[0];
        if (photo && (photo.organization_id !== entry.organizationId || photo.work_id !== entry.targetId)) throw new Error('retention_photo_binding_conflict');
        await runtime.media.delete(entry.objectKey!);
        if (await runtime.media.get(entry.objectKey!) !== null) throw new Error('restored_file_delete_unconfirmed');
        if (parent) await db.query(`update ${source.table} set state='purged',object_key=null,sha256=null,byte_size=null,width=null,height=null,purged_at=coalesce(purged_at,$3)
          where id=$1 and organization_id=$2`, [entry.attachmentId, entry.organizationId, at]);
      } else if (parent) {
        // A photo-only purge does not cover new photos uploaded after its cutoff.
        const ready = (await db.query<{ id: string }>(`select id from ${source.table} where ${source.column}=$1 and organization_id=$2 and state=$3
          and ($4::boolean or created_at<=$5)`,
          [entry.targetId, entry.organizationId, source.ready, entry.scope==='work', at])).rows;
        if (ready.length) throw new Error('retention_photo_coverage_missing');
        await db.query(`update ${RETENTION_TABLES[entry.targetKind]} set retention_photos_purged_at=coalesce(retention_photos_purged_at,$2) where id=$1`, [entry.targetId, at]);
        if (entry.scope === 'work') await removeRetainedPayload(db, entry.targetKind, entry.targetId, at);
        // 복원된 승인 job은 다시 삭제하지 않는다. 승인 전 백업은 불변 승인 사실을 새로 만들어 넣지 않는다.
        await db.query(`update ap.work_retention_jobs set state=case when approved_at is null then 'blocked' else 'completed' end,
          completed_at=case when approved_at is null then null else coalesce(completed_at,$2) end,last_error='restored_cleanup_applied'
          where id=$1 and state not in ('completed','canceled')`, [entry.jobId, at]);
      }
      await db.query(`insert into ap.retention_restore_audit(journal_entry_id,job_id,organization_id,target_kind,target_id,action,outcome)
        values($1,$2,$3,$4,$5,$6,$7)`, [entry.id, entry.jobId, entry.organizationId, entry.targetKind, entry.targetId, entry.action, parent ? 'applied' : 'work_absent']);
      await db.query('commit'); applied++;
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  }
  return { product: 'agent', applied, entries: entries.length };
}
