import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { FieldRetentionJournal, RetentionJournalEntry } from './retention-journal.js';

type Journal = Pick<FieldRetentionJournal, 'read' | 'append'>;
const hash = (entry: RetentionJournalEntry) => createHash('sha256').update(JSON.stringify(entry)).digest('hex');

export async function verifyFieldRetentionJournal(pool: Pool, journal: Pick<Journal, 'read'>) {
  // Read durable expectations before files: another worker writes files before its DB receipt.
  const receipts = (await pool.query<{entry_id:string;sha256:string}>('select entry_id,sha256 from field.retention_journal_receipts')).rows;
  const completed = (await pool.query<{id:string;organization_id:string;target_kind:string;target_id:string;scope:string;photos:string[]}>(`
    select j.id,j.organization_id,j.target_kind,j.target_id,j.scope,
      coalesce(array_agg(a.attachment_id::text) filter(where a.action='file_deleted'),array[]::text[]) as photos
    from field.work_retention_jobs j left join field.work_retention_job_audit a on a.job_id=j.id
    where j.state='completed' group by j.id`)).rows;
  const entries = await journal.read();
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const byJob = new Map<string,RetentionJournalEntry[]>();
  for (const entry of entries) {
    const proof=byJob.get(entry.jobId) ?? []; proof.push(entry); byJob.set(entry.jobId,proof);
  }
  if (receipts.some(receipt => !byId.has(receipt.entry_id) || hash(byId.get(receipt.entry_id)!) !== receipt.sha256))
    throw new Error('field_journal_continuity_lost');
  // Existing native completion/file audit facts also protect the first receipt baseline.
  for (const job of completed) {
    const proof = (byJob.get(job.id) ?? []).filter(entry => entry.organizationId===job.organization_id
      && entry.targetKind===job.target_kind && entry.targetId===job.target_id && entry.scope===job.scope);
    if (!proof.some(entry=>entry.action==='purge_prepared') || job.photos.some(id=>!proof.some(entry=>entry.action==='file_deleted' && entry.attachmentId===id)))
      throw new Error('field_journal_continuity_lost');
  }
  // Signed entries written before a DB failure remain evidence; never discard them on retry.
  const recorded = new Set(receipts.map(receipt=>receipt.entry_id));
  for (const entry of entries) if (!recorded.has(entry.id))
    await pool.query('insert into field.retention_journal_receipts(entry_id,sha256) values($1,$2) on conflict(entry_id) do nothing', [entry.id,hash(entry)]);
}

export async function appendFieldRetentionEntry(pool: Pool, journal: Journal, value: Parameters<Journal['append']>[0]) {
  await verifyFieldRetentionJournal(pool,journal);
  const entry = await journal.append(value);
  await pool.query('insert into field.retention_journal_receipts(entry_id,sha256) values($1,$2) on conflict(entry_id) do nothing', [entry.id,hash(entry)]);
  return entry;
}
