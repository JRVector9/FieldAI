import type { Pool, PoolClient } from 'pg';
import { fingerprint, verifyLifecycle, type LifecycleJournal } from './oauth-lifecycle-journal.js';
import type { FieldRevocationJournal } from './revocation-journal.js';

const tables=['"oauthAccessToken"','"oauthRefreshToken"','"oauthConsent"','field.oauth_selections',
  'field.ap_connections','field.ap_connection_revocations','field.ap_received_connection_revocations',
  'field.site_ap_installations','field.oauth_lifecycle_receipts','field.oauth_lifecycle_tombstones','field.revocation_restore_audit'];
export type LiveBaselinePlan={product:'field';databaseFingerprint:string;planDigest:string;counts:Record<string,number>};

export async function lockLiveBaseline(db:PoolClient) {
  await db.query("set local lock_timeout='1s'");await db.query("set local statement_timeout='15s'");
  const locked=(await db.query("select pg_try_advisory_lock(hashtext('field-live-oauth-baseline')) as locked")).rows[0].locked;
  if(!locked)throw new Error('another Field baseline is running');
  const writers=async()=>{
    const found=await db.query(`select 1 from pg_locks where pid<>pg_backend_pid()
      and relation=any($1::regclass[]) and mode in ('RowExclusiveLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock') limit 1`,[tables]);
    if(found.rowCount)throw new Error('active OAuth writers; stop Field API and workers before baseline');
  };
  await writers();
  await db.query(`lock table ${tables.join(',')} in share row exclusive mode`);
  await writers();
}
export async function unlockLiveBaseline(db:PoolClient) {
  await db.query("select pg_advisory_unlock(hashtext('field-live-oauth-baseline'))");
}
export async function liveBaselinePlan(db:PoolClient,journal:LifecycleJournal,native:FieldRevocationJournal):Promise<LiveBaselinePlan> {
  const entries=await verifyLifecycle(db,journal),nativeEntries=await native.read();
  const nativeProofs=new Map(nativeEntries.map(entry=>[entry.id,entry]));
  const nativeReceipts=await db.query<{entry_id:string;organization_id:string;target_kind:string;target_id:string}>(
    'select entry_id,organization_id,target_kind,target_id from field.revocation_restore_audit');
  if(nativeReceipts.rows.some(receipt=>{
    const proof=nativeProofs.get(receipt.entry_id);
    return !proof||proof.organizationId!==receipt.organization_id||proof.targetKind!==receipt.target_kind||proof.targetId!==receipt.target_id;
  }))throw new Error('native revocation journal continuity lost');
  const identity=(await db.query(`select current_database() as database,current_user as user,
    (select oid from pg_database where datname=current_database()) as oid,
    inet_server_addr()::text as address,inet_server_port() as port,pg_postmaster_start_time()::text as started`)).rows[0];
  const databaseFingerprint=fingerprint(JSON.stringify({product:'field',...identity}));
  const snapshots:unknown[]=[];const counts:Record<string,number>={};
  for(const table of tables) {
    const state=(await db.query(`select count(*)::int as count,encode(sha256(convert_to(coalesce(string_agg(hash,'' order by hash),''),'UTF8')),'hex') as hash
      from (select encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex') as hash from ${table} t) s`)).rows[0];
    counts[table]=state.count;snapshots.push([table,state.count,state.hash]);
  }
  const planDigest=fingerprint(JSON.stringify({purpose:'field-live-oauth-baseline-v1',databaseFingerprint,snapshots,
    lifecycle:entries,native:nativeEntries}));
  return {product:'field',databaseFingerprint,planDigest,counts};
}
export async function withLiveBaselinePlan<T>(pool:Pool,journal:LifecycleJournal,native:FieldRevocationJournal,action:(plan:LiveBaselinePlan)=>Promise<T>) {
  const db=await pool.connect();
  try {await db.query('begin');await lockLiveBaseline(db);const result=await action(await liveBaselinePlan(db,journal,native));await db.query('rollback');return result;}
  catch(error){await db.query('rollback');throw error;}
  finally {try{await unlockLiveBaseline(db);}finally{db.release();}}
}
export async function inspectLiveBaseline(pool:Pool,journal:LifecycleJournal,native:FieldRevocationJournal) {
  return withLiveBaselinePlan(pool,journal,native,async plan=>plan);
}
