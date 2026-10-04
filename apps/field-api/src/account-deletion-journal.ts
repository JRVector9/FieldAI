import { createHash,createHmac,randomUUID,timingSafeEqual } from 'node:crypto';
import { open,readdir,readFile,rename,stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool,PoolClient } from 'pg';
import { journalDirectoryFromEnvironment } from './revocation-journal.js';

type Db=Pick<Pool,'query'>;
export type AccountDeletionIntent={targetKind:'account'|'organization';targetId:string;databaseBinding:string;
  requestId:string|null;emailFingerprint:string|null;memberIds:string[];assets:{id:string;objectKey:string}[]};
export type AccountDeletionEntry=AccountDeletionIntent&{version:1;product:'field';id:string;createdAt:string};
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i,hex=/^[a-f0-9]{64}$/;
export const deletionEntryHash=(entry:AccountDeletionEntry)=>createHash('sha256').update(JSON.stringify(entry)).digest('hex');
export class AccountDeletionJournal {
  private cache:{stamp:string;at:number;entries:AccountDeletionEntry[]}|undefined;
  constructor(readonly root:string,private readonly secret:string){if(secret.length<24)throw new Error('Field deletion signing secret too short');}
  emailFingerprint(email:string){return createHmac('sha256',this.secret).update('field-account-deletion-email-v1\0').update(email.toLowerCase()).digest('hex');}
  private seal(data:string){return JSON.stringify({data,signature:createHmac('sha256',this.secret).update('field-account-deletion-v1\0').update(data).digest('hex')});}
  private unseal(raw:string){const value=JSON.parse(raw) as {data?:unknown;signature?:unknown};
    if(typeof value.data!=='string'||typeof value.signature!=='string'||!hex.test(value.signature))throw new Error('invalid deletion envelope');
    const hash=createHmac('sha256',this.secret).update('field-account-deletion-v1\0').update(value.data).digest();
    if(!timingSafeEqual(hash,Buffer.from(value.signature,'hex')))throw new Error('deletion signature mismatch');return JSON.parse(value.data);
  }
  private validate(e:AccountDeletionEntry){
    const keys=['targetKind','targetId','databaseBinding','requestId','emailFingerprint','memberIds','assets','version','product','id','createdAt'];
    if(!e||Object.keys(e).length!==keys.length||Object.keys(e).some(k=>!keys.includes(k))||e.version!==1||e.product!=='field'
      ||!uuid.test(e.id)||!uuid.test(e.databaseBinding)||!['account','organization'].includes(e.targetKind)
      ||typeof e.targetId!=='string'||!e.targetId||e.targetId.length>512||!Number.isFinite(Date.parse(e.createdAt))
      ||!Array.isArray(e.memberIds)||e.memberIds.some(id=>typeof id!=='string'||!id||id.length>512)||new Set(e.memberIds).size!==e.memberIds.length
      ||!Array.isArray(e.assets))throw new Error('invalid deletion entry');
    if(e.targetKind==='account'?(e.requestId!==null||!hex.test(e.emailFingerprint??'')||e.assets.length||e.memberIds.length)
      :(!uuid.test(e.targetId)||!uuid.test(e.requestId??'')||e.emailFingerprint!==null))throw new Error('invalid deletion binding');
    if(new Set(e.assets.map(a=>a.id)).size!==e.assets.length||e.assets.some(a=>Object.keys(a).length!==2||!uuid.test(a.id)
      ||a.objectKey!==`${e.targetId}/${a.id}.webp`))throw new Error('invalid deletion media key');
  }
  async read(force=false){
    const s=await stat(this.root,{bigint:true});if(!s.isDirectory())throw new Error('invalid deletion journal directory');
    const stamp=`${s.dev}:${s.ino}:${s.mtimeNs}:${s.ctimeNs}`,cached=this.cache;
    if(!force&&cached?.stamp===stamp&&Date.now()-cached.at<60_000)return cached.entries;
    const names=(await readdir(this.root)).filter(name=>name.endsWith('.json')).sort(),entries:AccountDeletionEntry[]=[];
    for(const name of names){if(!uuid.test(name.slice(0,-5)))throw new Error('invalid deletion filename');
      const e=this.unseal(await readFile(resolve(this.root,name),'utf8')) as AccountDeletionEntry;this.validate(e);
      if(e.id!==name.slice(0,-5))throw new Error('deletion filename mismatch');entries.push(e);
    }
    this.cache={stamp,at:Date.now(),entries};return entries;
  }
  async append(intent:AccountDeletionIntent){
    const entry:AccountDeletionEntry={...intent,version:1,product:'field',id:randomUUID(),createdAt:new Date().toISOString()};this.validate(entry);
    const path=resolve(this.root,`${entry.id}.tmp`),file=await open(path,'wx',0o600);
    try{await file.writeFile(this.seal(JSON.stringify(entry)));await file.sync();}finally{await file.close();}
    await rename(path,resolve(this.root,`${entry.id}.json`));
    const directory=await open(this.root,'r');try{await directory.sync();}finally{await directory.close();}
    this.cache=undefined;return entry;
  }
  async checkpoint(){const entries=await this.read(true);return this.seal(JSON.stringify({version:1,product:'field',purpose:'account-deletion-checkpoint',entries:entries.map(e=>({id:e.id,sha256:deletionEntryHash(e)}))}));}
  async verifiedEntries(raw:string){const proof=this.unseal(raw),entries=await this.read(true);
    if(!proof||proof.version!==1||proof.product!=='field'||proof.purpose!=='account-deletion-checkpoint'||!Array.isArray(proof.entries)
      ||proof.entries.length!==entries.length||entries.some((e,i)=>proof.entries[i]?.id!==e.id||proof.entries[i]?.sha256!==deletionEntryHash(e)))throw new Error('deletion checkpoint mismatch');return entries;
  }
}
const journals=new Map<string,AccountDeletionJournal>();
export function accountDeletionJournalFromEnvironment(){
  const root=journalDirectoryFromEnvironment('FIELD_RETENTION_JOURNAL_DIRECTORY'),secret=process.env.FIELD_RETENTION_JOURNAL_SECRET;
  if(!root||!secret)return undefined;const path=resolve(root,'account-deletion'),key=`${path}\0${secret}`;
  let journal=journals.get(key);if(!journal){journal=new AccountDeletionJournal(path,secret);journals.set(key,journal);}return journal;
}
export async function deletionDatabaseBinding(db:Db){
  const product=(await db.query("select nspname from pg_namespace where nspname in ('ap','field')")).rows.map(r=>r.nspname);
  if(!product.includes('field')||product.includes('ap'))throw new Error('deletion requires isolated Field database');
  return (await db.query<{id:string}>('select id from field.account_deletion_journal_binding where singleton')).rows[0]!.id;
}
export async function persistDeletionReceipt(db:PoolClient,e:AccountDeletionEntry,stage:'prepared'|'applied'){
  const result=await db.query(`insert into field.account_deletion_receipts(entry_id,entry_sha256,target_kind,target_id,stage)
    values($1,$2,$3,$4,$5) on conflict(entry_id) do update set stage=case when excluded.stage='applied' then 'applied' else field.account_deletion_receipts.stage end
    where field.account_deletion_receipts.entry_sha256=excluded.entry_sha256 and field.account_deletion_receipts.target_kind=excluded.target_kind
      and field.account_deletion_receipts.target_id=excluded.target_id`,
  [e.id,deletionEntryHash(e),e.targetKind,e.targetId,stage]);
  if(!result.rowCount)throw new Error('deletion receipt binding mismatch');
}
const proofs=new WeakMap<AccountDeletionJournal,Map<string,{entries:AccountDeletionEntry[];at:number;state:string}>>();
export async function assertAccountDeletionServing(pool:Db,journal=accountDeletionJournalFromEnvironment()){
  if(!journal)throw new Error('deletion journal unavailable');
  const entries=await journal.read();
  const state=(await pool.query<{identity:string;state:string}>(`select concat_ws(':',d.oid,pg_postmaster_start_time()::text,
    (select id from field.account_deletion_journal_binding)) as identity,
    (select receipt_generation::text from field.account_deletion_journal_binding where singleton) as state
    from pg_database d where datname=current_database()`)).rows[0]!;
  const cache=proofs.get(journal)??new Map();proofs.set(journal,cache);const previous=cache.get(state.identity);
  if(previous?.entries===entries&&previous.state===state.state&&Date.now()-previous.at<60_000)return;
  cache.delete(state.identity);const binding=await deletionDatabaseBinding(pool);
  const receipts=(await pool.query<{entry_id:string;entry_sha256:string;stage:string;target_kind:string;target_id:string}>('select * from field.account_deletion_receipts')).rows;
  const byId=new Map(entries.map(e=>[e.id,e]));
  if(entries.some(e=>e.databaseBinding!==binding)||receipts.some(r=>{
    const e=byId.get(r.entry_id);return !e||deletionEntryHash(e)!==r.entry_sha256||e.targetKind!==r.target_kind||e.targetId!==r.target_id;
  })||entries.some(e=>!receipts.some(r=>r.entry_id===e.id)))throw new Error('deletion recovery required');
  const deletedEmails=new Set(entries.filter(e=>e.targetKind==='account').map(e=>e.emailFingerprint));
  if(deletedEmails.size&&(await pool.query<{to:string}>('select distinct "to" from field.email_outbox')).rows
    .some(row=>deletedEmails.has(journal.emailFingerprint(row.to))))throw new Error('deletion recovery required');
  for(const e of entries){
    const receipt=receipts.find(r=>r.entry_id===e.id)!;
    if(await accountDeletionEntryRequiresRecovery(pool,e,receipt.stage))throw new Error('deletion recovery required');
  }
  cache.set(state.identity,{entries,at:Date.now(),state:state.state});
}

// Both serving and offline replay inspect current data. A durable receipt alone
// cannot prove that a subsequent partial restore kept the deletion applied.
export async function accountDeletionEntryRequiresRecovery(pool:Db,e:AccountDeletionEntry,stage:string){
    if(e.targetKind==='account'){
      const pending=await pool.query(`select 1 where not exists(select 1 from field.account_deletion_audit where user_id=$1)
        or exists(select 1 from "user" u where id=$1 and (email<>$2 or name<>'삭제된 사용자' or "twoFactorEnabled" is true
        or exists(select 1 from "account" where "userId"=$1) or exists(select 1 from "twoFactor" where "userId"=$1)
        or exists(select 1 from "session" where "userId"=$1 and "expiresAt">now()) or exists(select 1 from field.memberships where user_id=$1)
        or exists(select 1 from field.platform_admin_memberships where user_id=$1)))
        or exists(select 1 from "oauthClient" where "userId"=$1 and disabled is distinct from true)
        or exists(select 1 from "oauthAccessToken" t where revoked is null and ("userId"=$1 or exists(select 1 from "oauthClient" c where c."clientId"=t."clientId" and c."userId"=$1)))
        or exists(select 1 from "oauthRefreshToken" t where revoked is null and ("userId"=$1 or exists(select 1 from "oauthClient" c where c."clientId"=t."clientId" and c."userId"=$1)))
        or exists(select 1 from "oauthConsent" t where "userId"=$1 or exists(select 1 from "oauthClient" c where c."clientId"=t."clientId" and c."userId"=$1))`,[e.targetId,`deleted-${e.id}@deleted.invalid`]);
      return stage!=='applied'||!!pending.rowCount;
    }else{
      const pending=await pool.query(`select 1 from field.organizations o where id=$1 and (
        ($3='applied' and (deleted_at is null or exists(select 1 from field.memberships where organization_id=$1)
          or exists(select 1 from field.site_assets where organization_id=$1)
          or exists(select 1 from field.oauth_selections where organization_id=$1 and revoked_at is null)
          or exists(select 1 from field.catalog_drafts where organization_id=$1 and
            (coalesce(content->>'contactPhone','')<>'' or coalesce(content->>'introduction','')<>'' or coalesce(content->'services','[]')<>'[]'::jsonb))
          or exists(select 1 from field.catalog_releases where organization_id=$1 and
            (coalesce(content->>'contactPhone','')<>'' or coalesce(content->>'introduction','')<>'' or coalesce(content->'services','[]')<>'[]'::jsonb))
          or exists(select 1 from field.site_generation_jobs where organization_id=$1 and (prompt<>'[삭제됨]' or proposal is not null or catalog_snapshot<>'{}'::jsonb))
          or exists(select 1 from field.notification_recipients where organization_id=$1 and audience='owner' and (recipient_ciphertext is not null or revoked_at is null))
          or exists(select 1 from field.site_domains where organization_id=$1 and desired_state='active')
          or exists(select 1 from "session" s where "userId"=any($4::text[]) and "expiresAt">now()
            and not exists(select 1 from field.memberships where user_id=s."userId" and organization_id<>$1))))
        or ($3='prepared' and not exists(select 1 from field.organization_deletion_requests where id=$2 and organization_id=$1
          and status='scheduled' and steps ? 'executionStarted'))
        or exists(select 1 from field.site_drafts where site_id in(select id from field.sites where organization_id=$1))
        or exists(select 1 from field.site_releases where site_id in(select id from field.sites where organization_id=$1))
        or exists(select 1 from field.site_assets where organization_id=$1 and state<>'deleting'))`,[e.targetId,e.requestId,stage,e.memberIds]);
      return !!pending.rowCount;
    }
}
