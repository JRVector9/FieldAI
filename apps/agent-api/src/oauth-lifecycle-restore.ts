import { reapplyAgentRevocationJournal } from './revocation-restore.js';
import { recordAgentRevocation, type AgentRevocationJournal } from './revocation-journal.js';
import { familyIntent, tokenIntent } from './oauth-lifecycle-provider.js';
import type { Pool, PoolClient } from 'pg';
import { fingerprint, persistLifecycle, verifyLifecycle, type LifecycleEntry, type LifecycleJournal } from './oauth-lifecycle-journal.js';

export async function applyLifecycleEntry(db:PoolClient,entry:LifecycleEntry) {
  if(entry.kind==='route-key') {
    throw new Error('AP lifecycle has no Field route key');
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

// Local CLI only: callers must stop issuer/connector writers before collecting a legacy baseline.
export async function baselineLifecycle(pool:Pool,journal:LifecycleJournal,native:AgentRevocationJournal) {
  const db=await pool.connect();try{
    await db.query('begin');const entries=await verifyLifecycle(db,journal);const nativeEntries=await native.read();
    await db.query('lock table "oauthAccessToken","oauthRefreshToken",ap.oauth_selections,ap.field_connections in share row exclusive mode');
    for(const entry of entries){await persistLifecycle(db,entry);await applyLifecycleEntry(db,entry);}
    const selections=await db.query('select id,organization_id from ap.oauth_selections where revoked_at is not null');
    const connections=await db.query(`select c.id,c.ap_organization_id as organization_id,c.ap_grant_id as selection_id,
      r.id as revocation_id from ap.field_connections c left join ap.field_remote_revocations r on r.connection_id=c.id where c.status='revoked'`);
    for(const row of [...selections.rows.map(r=>({...r,selection_id:r.id,revocation_id:null,kind:'selection' as const})),...connections.rows.map(r=>({...r,kind:'connection' as const}))]) {
      if(nativeEntries.some(e=>e.targetKind===row.kind&&e.targetId===row.id))continue;
      const intent={targetKind:row.kind,targetId:row.id,organizationId:row.organization_id,selectionId:row.selection_id,
        source:'owner' as const,revocationId:row.revocation_id};
      await recordAgentRevocation(db,native,intent);
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
    await reapplyAgentRevocationJournal(pool,native,await native.checkpoint());
    return {selections:selections.rowCount,connections:connections.rowCount,entries:entries.length};
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
}
