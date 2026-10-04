import type { Pool } from 'pg';
import { anonymizeFieldAccount,completeFieldOrganizationDeletion } from './account-deletion.js';
import { accountDeletionEntryRequiresRecovery,deletionDatabaseBinding,deletionEntryHash,persistDeletionReceipt,type AccountDeletionJournal } from './account-deletion-journal.js';
import type { FieldSiteMediaStore } from './site-media.js';

export async function reapplyFieldAccountDeletions(runtime:{pool:Pool;journal:AccountDeletionJournal;checkpoint:string;siteMedia?:FieldSiteMediaStore}){
  const entries=await runtime.journal.verifiedEntries(runtime.checkpoint),binding=await deletionDatabaseBinding(runtime.pool);
  if(entries.some(e=>e.databaseBinding!==binding))throw new Error('deletion database binding mismatch');
  let applied=0;
  // Organization approval predates the owner's account anonymization; recover site
  // cleanup first. Historic paid/open-work preconditions are not re-evaluated.
  for(const e of [...entries].sort((a,b)=>Number(a.targetKind==='account')-Number(b.targetKind==='account')||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))){
    const db=await runtime.pool.connect();
    try {
      await db.query('begin');await db.query('select pg_advisory_xact_lock(hashtextextended($1,866))',[e.id]);
      const prior=(await db.query<{stage:string;entry_sha256:string}>('select stage,entry_sha256 from field.account_deletion_receipts where entry_id=$1',[e.id])).rows[0];
      if(prior&&prior.entry_sha256!==deletionEntryHash(e))throw new Error('deletion receipt binding mismatch');
      let recovery=prior?.stage!=='applied'||await accountDeletionEntryRequiresRecovery(db,e,prior.stage);
      if(!recovery&&e.targetKind==='account')recovery=(await db.query<{to:string}>('select distinct "to" from field.email_outbox')).rows.some(r=>runtime.journal.emailFingerprint(r.to)===e.emailFingerprint);
      if(!recovery&&e.targetKind==='organization')for(const asset of e.assets){
        if(!runtime.siteMedia)throw new Error('deletion restore site media required');
        if(runtime.siteMedia.exists?await runtime.siteMedia.exists(asset.objectKey):await runtime.siteMedia.get(asset.objectKey)!==null)recovery=true;
      }
      if(!recovery){await db.query('commit');continue;}
      const at=new Date(e.createdAt);
      if(e.targetKind==='account'){
        const user=(await db.query<{email:string}>('select email from "user" where id=$1 for update',[e.targetId])).rows[0];
        const anonymous=`deleted-${e.id}@deleted.invalid`;
        if(user&&runtime.journal.emailFingerprint(user.email)!==e.emailFingerprint&&user.email!==anonymous)throw new Error('deletion account binding mismatch');
        await anonymizeFieldAccount(db,e.targetId,user?.email??anonymous,anonymous,e.id);
        const addresses=(await db.query<{to:string}>('select distinct "to" from field.email_outbox')).rows.filter(r=>runtime.journal.emailFingerprint(r.to)===e.emailFingerprint).map(r=>r.to);
        if(addresses.length)await db.query(`update field.email_outbox set "to"=$2,text='[삭제됨]',html=case when html is null then null else '[삭제됨]' end where "to"=any($1::text[])`,[addresses,anonymous]);
      }else{
        await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`field-site-assets:${e.targetId}`]);
        const org=(await db.query('select 1 from field.organizations where id=$1 for update',[e.targetId])).rowCount;
        const restored=(await db.query<{id:string;object_key:string}>('select id,object_key from field.site_assets where organization_id=$1 order by id for update',[e.targetId])).rows;
        // A media backup can retain signed photos even if its DB has no org row.
        // Confirm every signed/restored object is absent before writing a receipt.
        if(restored.some(a=>a.object_key!==`${e.targetId}/${a.id}.webp`))throw new Error('deletion media binding mismatch');
        const objects=new Set([...e.assets.map(a=>a.objectKey),...restored.map(a=>a.object_key)]);
        if(objects.size&&!runtime.siteMedia)throw new Error('deletion restore site media required');
        for(const key of objects){await runtime.siteMedia!.delete(key);
          if(runtime.siteMedia!.exists?await runtime.siteMedia!.exists(key):await runtime.siteMedia!.get(key)!==null)throw new Error('restored deletion media unconfirmed');}
        if(org){
          await db.query('delete from field.site_releases where site_id in(select id from field.sites where organization_id=$1)',[e.targetId]);
          await db.query('delete from field.site_drafts where site_id in(select id from field.sites where organization_id=$1)',[e.targetId]);
          await db.query('delete from field.site_assets where organization_id=$1',[e.targetId]);
          // A backup before the request needs a recovery audit row, never a new
          // consent or notification. The signed decision is its authorization.
          await db.query(`insert into field.organization_deletion_requests(id,organization_id,requested_by,confirmation,status,
            requested_at,scheduled_at,next_attempt_at,executed_at) values($1,$2,'restored-approved-decision',$3::jsonb,'executed',
            $4::timestamptz-interval '14 days',$4,$4,$4) on conflict(id) do nothing`,[e.requestId,e.targetId,JSON.stringify({deletionProof:e.id}),at]);
          // Prevent resumed charging/connector delivery from an older backup while
          // retaining the historical billing and original customer work rows.
          await db.query('update field.paid_subscriptions set terminated_at=coalesce(terminated_at,$2),cancel_requested_at=coalesce(cancel_requested_at,$2) where organization_id=$1',[e.targetId,at]);
          await db.query(`update field.ap_connections set status='revoked',access_token_cipher=null,refresh_token_cipher=null where organization_id=$1`,[e.targetId]);
          await db.query(`update field.ap_connection_revocations set state='blocked',last_error='restore_remote_reconciliation_required',lease_until=null
            where connection_id in(select id from field.ap_connections where organization_id=$1) and state<>'acked'`,[e.targetId]);
          await completeFieldOrganizationDeletion(db,{id:e.requestId!,organization_id:e.targetId,steps:{}},{},e.memberIds,at,true);
        }
      }
      await persistDeletionReceipt(db,e,'applied');await db.query('commit');applied++;
    }catch(error){await db.query('rollback');throw error;}finally{db.release();}
  }
  return {product:'field',entries:entries.length,applied};
}
