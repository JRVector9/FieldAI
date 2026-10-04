import type { Pool } from 'pg';
import { applyAccountDeletion, applyOrganizationDeletionCleanup } from './account-deletion-apply.js';
import { assertAccountDeletionServing, deletionEntryApplied, persistDeletionReceipt, type AgentAccountDeletionJournal } from './account-deletion-journal.js';

export async function reapplyAccountDeletionJournal(runtime: { pool: Pool; journal: AgentAccountDeletionJournal; checkpoint: string }) {
  const entries = await runtime.journal.verifiedEntries(runtime.checkpoint);
  const db = await runtime.pool.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'"); await db.query("set local statement_timeout='30s'");
    const namespaces = (await db.query("select nspname from pg_namespace where nspname in ('ap','field')")).rows.map(row => row.nspname);
    if (!namespaces.includes('ap') || namespaces.includes('field')) throw new Error('account deletion restore requires isolated agent database');
    await db.query("select pg_advisory_xact_lock(hashtext('ap-account-deletion-restore'))");
    // Check all bindings before applying any target; an old backup may contain
    // another email/owner for the same id. Such a mismatch requires operator recovery.
    for (const entry of entries) {
      if (entry.targetKind === 'account') {
        const row = (await db.query('select email from "user" where id=$1 for update',[entry.targetId])).rows[0];
        if (row && row.email !== entry.anonymousEmail && runtime.journal.emailFingerprint(row.email) !== entry.sourceEmailHmac)
          throw new Error('account_deletion_restore_binding_conflict');
      } else {
        const row = (await db.query('select owner_user_id from ap.organizations where id=$1 for update',[entry.targetId])).rows[0];
        if (row && row.owner_user_id !== entry.ownerUserId) throw new Error('organization_deletion_restore_binding_conflict');
      }
    }
    let applied = 0;
    for (const entry of entries) {
      // Replay remains idempotent. A trusted latest checkpoint was checked
      // before DB access, including approved intents with a lost original commit.
      if ((await db.query('select 1 from ap.deletion_restore_audit where entry_id=$1',[entry.id])).rowCount
        && await deletionEntryApplied(db,entry)) continue;
      let present: boolean;
      if (entry.targetKind === 'account') {
        const removed = await applyAccountDeletion(db,entry,runtime.journal); present = removed !== null;
        if (present) await db.query(`insert into ap.account_deletion_audit(id,user_id,mode,removed,executed_at)
          values($1,$2,'anonymized',$3::jsonb,$4) on conflict(user_id) do nothing`,[entry.requestId,entry.targetId,JSON.stringify(removed),entry.createdAt]);
      } else {
        present = Boolean((await db.query('select 1 from ap.organizations where id=$1',[entry.targetId])).rowCount);
        if (present) {
          await applyOrganizationDeletionCleanup(db,entry.targetId,new Date(entry.createdAt),entry.memberUserIds);
          await db.query(`update ap.organization_deletion_requests set status='executed',executed_at=$2,
            steps=steps||jsonb_build_object('restoredCleanupApplied',true),last_error=null
            where id=$1 and organization_id=$3 and status='scheduled'`,[entry.requestId,entry.createdAt,entry.targetId]);
        }
      }
      await persistDeletionReceipt(db,entry);
      await db.query('insert into ap.deletion_restore_audit(entry_id,target_kind,target_id,outcome) values($1,$2,$3,$4) on conflict(entry_id) do nothing',
        [entry.id,entry.targetKind,entry.targetId,present?'applied':'target_absent']);
      await db.query('insert into ap.deletion_replay_audit(entry_id,outcome) values($1,$2)',[entry.id,present?'applied':'target_absent']);
      applied++;
    }
    // Verify the same transaction's current state, not only historical receipts.
    for (const entry of entries) if (!await deletionEntryApplied(db,entry)) throw new Error('AP deleted target recovery required');
    await db.query('commit');
    await assertAccountDeletionServing(db as unknown as Pool,runtime.journal);
    return { product:'agent',applied,entries:entries.length };
  } catch(error) { await db.query('rollback'); throw error; }
  finally { db.release(); }
}
