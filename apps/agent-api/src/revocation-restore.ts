import type { Pool } from 'pg';
import { agentRevocationEntryHash, verifyAgentRevocationJournal, type AgentRevocationJournal } from './revocation-journal.js';

export async function reapplyAgentRevocationJournal(pool: Pool, journal: AgentRevocationJournal, checkpoint: string) {
  const entries = await journal.verifiedEntries(checkpoint);
  const db = await pool.connect();
  try {
    await db.query('begin');
    const namespaces = (await db.query("select nspname from pg_namespace where nspname in ('ap','field')")).rows.map(r => r.nspname);
    if (!namespaces.includes('ap') || namespaces.includes('field')) throw new Error('revocation restore requires an isolated AP database');
    await db.query("select pg_advisory_xact_lock(hashtext('ap-revocation-restore'))");
    await verifyAgentRevocationJournal(db, journal);
    let applied = 0;
    // 전체 원장/namespace 검증 이후 한 transaction으로 처리한다. 중간 오류는 모두 rollback한다.
    for (const entry of entries) {
      if ((await db.query('select 1 from ap.revocation_restore_audit where entry_id=$1', [entry.id])).rowCount) continue;
      let found: boolean;
      if (entry.targetKind === 'connection') {
        const selected = (await db.query(`select ap_organization_id,ap_grant_id from ap.field_connections where id=$1 for update`, [entry.targetId])).rows[0];
        if (selected && (selected.ap_organization_id !== entry.organizationId || (selected.ap_grant_id ?? null) !== entry.selectionId))
          throw new Error('Agent revocation connection binding mismatch');
        found = Boolean(selected);
        if (found) {
          if (entry.source === 'remote' && entry.revocationId) {
            const receipt = (await db.query('select id from ap.field_connection_revocations where connection_id=$1', [entry.targetId])).rows[0];
            if (receipt && receipt.id !== entry.revocationId) throw new Error('Agent revocation receiver receipt mismatch');
            await db.query(`insert into ap.field_connection_revocations(id,connection_id,received_at) values($1,$2,$3::timestamptz)
              on conflict(connection_id) do nothing`, [entry.revocationId, entry.targetId, entry.createdAt]);
          }
          if (entry.source === 'owner' && entry.revocationId) {
            const sender = (await db.query('select id from ap.field_remote_revocations where connection_id=$1', [entry.targetId])).rows[0];
            if (sender && sender.id !== entry.revocationId) throw new Error('AP revocation sender receipt mismatch');
            await db.query(`insert into ap.field_remote_revocations(id,connection_id,state,last_error,created_at)
              values($1,$2,'blocked','restore_remote_reconciliation_required',$3::timestamptz)
              on conflict(connection_id) do nothing`, [entry.revocationId, entry.targetId, entry.createdAt]);
          }
          await db.query(`update ap.field_connections set status='revoked',access_token_cipher=null,refresh_token_cipher=null,updated_at=now() where id=$1`, [entry.targetId]);
          await db.query(`update ap.knowledge_sources set state='revoked',updated_at=now() where connection_id=$1`, [entry.targetId]);
          // 복원만으로 원격 제품의 ACK를 만들거나 네트워크 발송을 재개하지 않는다.
          await db.query(`update ap.field_remote_revocations set state='blocked',lease_until=null,last_error='restore_remote_reconciliation_required',updated_at=now()
            where connection_id=$1 and state<>'acked'`, [entry.targetId]);
        }
      } else found = false;
      if (entry.selectionId) {
        const selection = (await db.query('select organization_id from ap.oauth_selections where id=$1 for update', [entry.selectionId])).rows[0];
        if (selection && selection.organization_id !== entry.organizationId) throw new Error('Agent revocation selection binding mismatch');
        if (entry.targetKind === 'selection') found = Boolean(selection);
        await db.query('update ap.oauth_selections set revoked_at=coalesce(revoked_at,$2::timestamptz) where id=$1', [entry.selectionId, entry.createdAt]);
        await db.query('update "oauthAccessToken" set revoked=coalesce(revoked,$2::timestamptz) where "referenceId"=$1', [entry.selectionId, entry.createdAt]);
        await db.query('update "oauthRefreshToken" set revoked=coalesce(revoked,$2::timestamptz) where "referenceId"=$1', [entry.selectionId, entry.createdAt]);
        await db.query('delete from "oauthConsent" where "referenceId"=$1', [entry.selectionId]);
      }
      await db.query(`insert into ap.revocation_restore_audit(entry_id,organization_id,target_kind,target_id,outcome) values($1,$2,$3,$4,$5)`,
        [entry.id, entry.organizationId, entry.targetKind, entry.targetId, found ? 'applied' : 'target_absent']);
      await db.query('insert into ap.revocation_journal_receipts(entry_id,entry_sha256) values($1,$2) on conflict(entry_id) do nothing',
        [entry.id, agentRevocationEntryHash(entry)]);
      applied++;
    }
    await db.query('commit');
    return { entries: entries.length, applied };
  } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
}
