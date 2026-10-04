import { routeKeyReconciliationReason } from './ap-route-key-reconciliation.js';
import { reapplyFieldRevocationJournal } from './revocation-restore.js';
import { recordFieldRevocation, type FieldRevocationJournal } from './revocation-journal.js';
import { familyIntent, tokenIntent } from './oauth-lifecycle-provider.js';
import type { Pool, PoolClient } from 'pg';
import { fingerprint, persistLifecycle, verifyLifecycle, type LifecycleEntry, type LifecycleJournal } from './oauth-lifecycle-journal.js';
import { liveBaselinePlan, lockLiveBaseline, unlockLiveBaseline } from './oauth-live-baseline.js';

export async function applyLifecycleEntry(db:PoolClient,entry:LifecycleEntry) {
  if(entry.kind==='route-key') {
    const found=(await db.query('select organization_id,event_key_id,status from field.ap_connections where id=$1 for update',[entry.connectionId])).rows[0];
    if(found&&(found.organization_id!==entry.organizationId||found.event_key_id!==entry.keyId))throw new Error('route key restore binding mismatch');
    if(found){
      const reason=found.status!=='revoked'?'connection_not_revoked':await routeKeyReconciliationReason(db,entry.connectionId!);
      if(reason)throw new Error(`route key restore requires reconciliation: ${reason}`);
    }
    if(found)await db.query(`update field.ap_connections set route_key_closed_at=coalesce(route_key_closed_at,$2::timestamptz),event_secret_cipher=null where id=$1`,[entry.connectionId,entry.createdAt]);
    return;
  }
  for(const [table,type] of [['oauthAccessToken','access'],['oauthRefreshToken','refresh']] as const) {
    if(entry.kind==='token'&&entry.tokenType!==type)continue;
    const where=entry.kind==='legacy-baseline'
      ? `"createdAt"<=$1::timestamptz and not(encode(sha256(convert_to(token,'UTF8')),'hex')=any($2::text[]))`
      :entry.kind==='token'
      ? `encode(sha256(convert_to(token,'UTF8')),'hex')=$1`
      : `"clientId"=$1 and "userId" is not distinct from $2 and "referenceId" is not distinct from $3
         and case when "authorizationCodeId" is null then null else encode(sha256(convert_to("authorizationCodeId",'UTF8')),'hex') end is not distinct from $4`;
    const values:unknown[]=entry.kind==='legacy-baseline'?[entry.cutoffAt,type==='access'?entry.accessFingerprints:entry.refreshFingerprints]:entry.kind==='token'?[entry.tokenFingerprint]:[entry.clientId,entry.userId,entry.referenceId,entry.codeId];
    await db.query(`update "${table}" set revoked=coalesce(revoked,now())${type==='refresh'?',"rotationReplayResponse"=null,"rotationReplayExpiresAt"=null':''} where ${where}`,values);
  }
}
export async function reapplyLifecycleJournal(pool:Pool,journal:LifecycleJournal,checkpoint:string) {
  const entries=await journal.verifiedEntries(checkpoint),db=await pool.connect();
  try {await db.query('begin');await verifyLifecycle(db,journal);
    for(const entry of entries){await persistLifecycle(db,entry);await applyLifecycleEntry(db,entry);}
    await db.query('commit');return {entries:entries.length};
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
}

// Callers must stop issuer/connector writers before collecting a legacy baseline.
export async function baselineLifecycle(pool:Pool,journal:LifecycleJournal,native:FieldRevocationJournal,
  confirmation?:{databaseFingerprint:string;planDigest:string}) {
  const db=await pool.connect();try{
    await db.query('begin');
    if(confirmation){
      await lockLiveBaseline(db);const plan=await liveBaselinePlan(db,journal,native);
      if(plan.databaseFingerprint!==confirmation.databaseFingerprint)throw new Error('database confirmation mismatch');
      if(plan.planDigest!==confirmation.planDigest)throw new Error('baseline plan changed; run --dry-run again');
    }
    const entries=await verifyLifecycle(db,journal);const nativeEntries=await native.read();
    await db.query('lock table "oauthAccessToken","oauthRefreshToken",field.oauth_selections,field.ap_connections in share row exclusive mode');
    for(const entry of entries){await persistLifecycle(db,entry);await applyLifecycleEntry(db,entry);}
    const selections=await db.query('select id,organization_id from field.oauth_selections where revoked_at is not null');
    const connections=await db.query(`select c.id,c.organization_id as organization_id,c.field_grant_id as selection_id,
      r.id as revocation_id from field.ap_connections c left join field.ap_connection_revocations r on r.connection_id=c.id where c.status='revoked'`);
    for(const row of [...selections.rows.map(r=>({...r,selection_id:r.id,revocation_id:null,kind:'selection' as const})),...connections.rows.map(r=>({...r,kind:'connection' as const}))]) {
      if(nativeEntries.some(e=>e.targetKind===row.kind&&e.targetId===row.id))continue;
      const intent={targetKind:row.kind,targetId:row.id,organizationId:row.organization_id,selectionId:row.selection_id,
        source:'owner' as const,revocationId:row.revocation_id};
      await recordFieldRevocation(native,intent);
    }
    const accesses=await db.query('select id,token,"clientId" as "clientId","userId" as "userId","referenceId" as "referenceId","authorizationCodeId" as "authorizationCodeId" from "oauthAccessToken" where revoked is not null');
    const refreshes=await db.query(`select id,token,"clientId" as "clientId","userId" as "userId","referenceId" as "referenceId","authorizationCodeId" as "authorizationCodeId" from "oauthRefreshToken" where revoked is not null and "rotatedAt" is null`);
    for(const intent of [...accesses.rows.map(r=>tokenIntent(r,'access')),...refreshes.rows.map(familyIntent)]){
      const prior=entries.find(e=>e.kind===intent.kind&&e.targetKey===intent.targetKey),entry=prior??await journal.append(intent);
      if(!prior)entries.push(entry);await persistLifecycle(db,entry);await applyLifecycleEntry(db,entry);
    }
    // One cutover captures all then-valid fingerprints, including absence caused by
    // historical provider DELETE. It never invalidates a newly consented family.
    let baseline=entries.find(e=>e.kind==='legacy-baseline');
    if(!baseline){
      const cutoffAt=(await db.query("select date_trunc('milliseconds',clock_timestamp()) as cutoff")).rows[0].cutoff.toISOString() as string;
      const valid=async(table:string)=>(await db.query(`select encode(sha256(convert_to(token,'UTF8')),'hex') as hash from "${table}" where revoked is null and "expiresAt">$1::timestamptz order by hash`,[cutoffAt])).rows.map(r=>r.hash as string);
      baseline=await journal.append({kind:'legacy-baseline',targetKey:fingerprint(`baseline:${cutoffAt}`),clientId:null,userId:null,referenceId:null,codeId:null,tokenId:null,tokenType:null,tokenFingerprint:null,connectionId:null,organizationId:null,keyId:null,cutoffAt,accessFingerprints:await valid('oauthAccessToken'),refreshFingerprints:await valid('oauthRefreshToken')});
      entries.push(baseline);
    }
    await persistLifecycle(db,baseline);await applyLifecycleEntry(db,baseline);
    await db.query('commit');
    await reapplyFieldRevocationJournal(pool,native,await native.checkpoint());
    return {selections:selections.rowCount,connections:connections.rowCount,entries:entries.length};
  }catch(error){await db.query('rollback');throw error;}finally{try{if(confirmation)await unlockLiveBaseline(db);}finally{db.release();}}
}
