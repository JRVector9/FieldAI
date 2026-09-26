import type { Pool } from 'pg';
import type { FieldRevocationJournal } from './revocation-journal.js';

export async function reapplyFieldRevocationJournal(pool: Pool, journal: FieldRevocationJournal, checkpoint: string) {
  const entries = await journal.verifiedEntries(checkpoint);
  const db = await pool.connect();
  try {
    await db.query('begin');
    const namespaces = (await db.query("select nspname from pg_namespace where nspname in ('field','ap')")).rows.map(r => r.nspname);
    if (!namespaces.includes('field') || namespaces.includes('ap')) throw new Error('revocation restore requires an isolated Field database');
    await db.query("select pg_advisory_xact_lock(hashtext('field-revocation-restore'))");
    let applied = 0;
    // 전체 원장/namespace 검증 이후 한 transaction으로 처리한다. 중간 오류는 모두 rollback한다.
    for (const entry of entries) {
      if ((await db.query('select 1 from field.revocation_restore_audit where entry_id=$1', [entry.id])).rowCount) continue;
      let found: boolean;
      if (entry.targetKind === 'connection') {
        const selected = (await db.query(`select organization_id,field_grant_id from field.ap_connections where id=$1 for update`, [entry.targetId])).rows[0];
        if (selected && (selected.organization_id !== entry.organizationId || (selected.field_grant_id ?? null) !== entry.selectionId))
          throw new Error('Field revocation connection binding mismatch');
        found = Boolean(selected);
        if (found) {
          if (entry.source === 'remote' && entry.revocationId) {
            const receipt = (await db.query('select id from field.ap_received_connection_revocations where connection_id=$1', [entry.targetId])).rows[0];
            if (receipt && receipt.id !== entry.revocationId) throw new Error('Field revocation receiver receipt mismatch');
            await db.query(`insert into field.ap_received_connection_revocations(id,connection_id,received_at) values($1,$2,$3::timestamptz)
              on conflict(connection_id) do nothing`, [entry.revocationId, entry.targetId, entry.createdAt]);
          }
          if (entry.source === 'owner' && entry.revocationId) {
            await db.query(`insert into field.ap_connection_revocations(id,connection_id,state,last_error,created_at)
              values($1,$2,'blocked','restore_remote_reconciliation_required',$3::timestamptz)
              on conflict(connection_id) do nothing`, [entry.revocationId, entry.targetId, entry.createdAt]);
          }
          await db.query(`update field.ap_connections set status='revoked',access_token_cipher=null,refresh_token_cipher=null,updated_at=now() where id=$1`, [entry.targetId]);
          await db.query(`update field.site_ap_installations set status='paused',updated_at=now() where connection_id=$1 and status='active'`, [entry.targetId]);
          // 복원만으로 원격 제품의 ACK를 만들거나 네트워크 발송을 재개하지 않는다.
          await db.query(`update field.ap_connection_revocations set state='blocked',lease_until=null,last_error='restore_remote_reconciliation_required',updated_at=now()
            where connection_id=$1 and state<>'acked'`, [entry.targetId]);
        }
      } else found = false;
      if (entry.selectionId) {
        const selection = (await db.query('select organization_id from field.oauth_selections where id=$1 for update', [entry.selectionId])).rows[0];
        if (selection && selection.organization_id !== entry.organizationId) throw new Error('Field revocation selection binding mismatch');
        if (entry.targetKind === 'selection') found = Boolean(selection);
        await db.query('update field.oauth_selections set revoked_at=coalesce(revoked_at,$2::timestamptz) where id=$1', [entry.selectionId, entry.createdAt]);
        await db.query('update "oauthAccessToken" set revoked=coalesce(revoked,$2::timestamptz) where "referenceId"=$1', [entry.selectionId, entry.createdAt]);
        await db.query('update "oauthRefreshToken" set revoked=coalesce(revoked,$2::timestamptz) where "referenceId"=$1', [entry.selectionId, entry.createdAt]);
        await db.query('delete from "oauthConsent" where "referenceId"=$1', [entry.selectionId]);
      }
      await db.query(`insert into field.revocation_restore_audit(entry_id,organization_id,target_kind,target_id,outcome) values($1,$2,$3,$4,$5)`,
        [entry.id, entry.organizationId, entry.targetKind, entry.targetId, found ? 'applied' : 'target_absent']);
      applied++;
    }
    await db.query('commit');
    return { entries: entries.length, applied };
  } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
}
