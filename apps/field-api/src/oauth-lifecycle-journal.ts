import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';

export type LifecycleIntent = { kind:'token'|'family'|'route-key'|'legacy-baseline'; targetKey:string;
  clientId:string|null; userId:string|null; referenceId:string|null; codeId:string|null;
  tokenId:string|null; tokenType:'access'|'refresh'|null; tokenFingerprint:string|null;
  connectionId:string|null; organizationId:string|null; keyId:string|null;
  cutoffAt?:string; accessFingerprints?:string[]; refreshFingerprints?:string[] };
export type LifecycleEntry = LifecycleIntent & { version:1; product:'field'; id:string; createdAt:string };
const hex = /^[a-f0-9]{64}$/, uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export const fingerprint = (value:string) => createHash('sha256').update(value).digest('hex');
export const familyKey = (row:{clientId:string;userId?:string|null;referenceId?:string|null;authorizationCodeId?:string|null}) =>
  fingerprint(JSON.stringify([row.clientId,row.userId??null,row.referenceId??null,row.authorizationCodeId??null]));
export const entryHash = (entry:LifecycleEntry) => fingerprint(JSON.stringify(entry));
function validate(entry:LifecycleEntry) {
  const keys=['kind','targetKey','clientId','userId','referenceId','codeId','tokenId','tokenType','tokenFingerprint','connectionId','organizationId','keyId','version','product','id','createdAt'];
  if(entry?.kind==='legacy-baseline')keys.push('cutoffAt','accessFingerprints','refreshFingerprints');
  if (!entry || Object.keys(entry).length!==keys.length || Object.keys(entry).some(k=>!keys.includes(k))
    || entry.version!==1 || entry.product!=='field' || !uuid.test(entry.id) || !hex.test(entry.targetKey)
    || !Number.isFinite(Date.parse(entry.createdAt))) throw new Error('invalid field lifecycle entry');
  for(const field of ['clientId','userId','referenceId','codeId','tokenId','connectionId','organizationId','keyId'] as const)
    if(entry[field]!==null && (typeof entry[field]!=='string'||!entry[field]!.length||entry[field]!.length>512)) throw new Error('invalid lifecycle metadata');
  if(entry.kind==='token') {
    if(!entry.clientId||!entry.tokenId||!['access','refresh'].includes(entry.tokenType??'')||!hex.test(entry.tokenFingerprint??'')
      || entry.targetKey!==fingerprint(`${entry.tokenType}:${entry.tokenFingerprint}`)) throw new Error('invalid token proof');
  } else if(entry.kind==='family') {
    if(!entry.clientId||!entry.userId||entry.targetKey!==familyKey({clientId:entry.clientId,userId:entry.userId,referenceId:entry.referenceId,authorizationCodeId:entry.codeId})) throw new Error('invalid family proof');
  } else if(entry.kind==='legacy-baseline') {
    if(typeof entry.cutoffAt!=='string'||!Number.isFinite(Date.parse(entry.cutoffAt))
      ||entry.targetKey!==fingerprint(`baseline:${entry.cutoffAt}`))throw new Error('invalid legacy baseline');
    for(const values of [entry.accessFingerprints,entry.refreshFingerprints])
      if(!Array.isArray(values)||values.some(v=>typeof v!=='string'||!hex.test(v))||new Set(values).size!==values.length)throw new Error('invalid baseline fingerprints');
    if([entry.clientId,entry.userId,entry.referenceId,entry.codeId,entry.tokenId,entry.tokenType,entry.tokenFingerprint,entry.connectionId,entry.organizationId,entry.keyId].some(v=>v!==null))throw new Error('invalid baseline context');
  } else if(entry.kind==='route-key') {
    if(!uuid.test(entry.connectionId??'')||!uuid.test(entry.organizationId??'')||!uuid.test(entry.keyId??'')
      ||entry.targetKey!==fingerprint(`route:${entry.connectionId}:${entry.keyId}`)) throw new Error('invalid route proof');
  } else throw new Error('invalid lifecycle kind');
}
export class LifecycleJournal {
  constructor(readonly root:string,private readonly secret:string) { if(secret.length<24)throw new Error('lifecycle signing secret too short'); }
  private seal(data:string) { return JSON.stringify({data,signature:createHmac('sha256',this.secret).update('field-oauth-lifecycle-v1\0').update(data).digest('hex')}); }
  private unseal(value:string) {
    const envelope=JSON.parse(value) as {data?:unknown;signature?:unknown};
    if(typeof envelope.data!=='string'||typeof envelope.signature!=='string'||!hex.test(envelope.signature))throw new Error('invalid lifecycle envelope');
    const hash=createHmac('sha256',this.secret).update('field-oauth-lifecycle-v1\0').update(envelope.data).digest();
    if(!timingSafeEqual(hash,Buffer.from(envelope.signature,'hex')))throw new Error('lifecycle signature mismatch');
    return JSON.parse(envelope.data);
  }
  async initialize(pool:Pool) {
    await mkdir(this.root,{recursive:true,mode:0o700});
    const db=await pool.connect();try{await verifyLifecycle(db,this);}finally{db.release();}
  }
  async read():Promise<LifecycleEntry[]> {
    const entries:LifecycleEntry[]=[];
    for(const name of (await readdir(this.root)).filter(n=>n.endsWith('.json')).sort()) {
      if(!uuid.test(name.slice(0,-5)))throw new Error('invalid lifecycle filename');
      const path=resolve(this.root,name),before=await stat(path,{bigint:true});
      if(!before.isFile())throw new Error('invalid lifecycle file');
      const entry=this.unseal(await readFile(path,'utf8')) as LifecycleEntry;validate(entry);
      const after=await stat(path,{bigint:true});
      if(entry.id!==name.slice(0,-5)||before.ino!==after.ino||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs)throw new Error('lifecycle file changed');
      entries.push(entry);
    }
    return entries;
  }
  async append(intent:LifecycleIntent) {
    const entry:LifecycleEntry={...intent,version:1,product:'field',id:randomUUID(),createdAt:new Date().toISOString()};validate(entry);
    const file=await open(resolve(this.root,`${entry.id}.tmp`),'wx',0o600);
    try{await file.writeFile(this.seal(JSON.stringify(entry)));await file.sync();}finally{await file.close();}
    await rename(resolve(this.root,`${entry.id}.tmp`),resolve(this.root,`${entry.id}.json`));
    const directory=await open(this.root,'r');try{await directory.sync();}finally{await directory.close();}
    return entry;
  }
  async checkpoint() {
    const entries=await this.read();return this.seal(JSON.stringify({version:1,product:'field',purpose:'oauth-lifecycle-checkpoint',entries:entries.map(e=>({id:e.id,sha256:entryHash(e)}))}));
  }
  async verifiedEntries(checkpoint:string) {
    const value=this.unseal(checkpoint) as {version:number;product:string;purpose:string;entries:{id:string;sha256:string}[]};
    const entries=await this.read();
    if(!value||value.version!==1||value.product!=='field'||value.purpose!=='oauth-lifecycle-checkpoint'||!Array.isArray(value.entries)
      ||value.entries.length!==entries.length||entries.some((e,i)=>value.entries[i]?.id!==e.id||value.entries[i]?.sha256!==entryHash(e)))throw new Error('lifecycle checkpoint mismatch');
    return entries;
  }
}
export function lifecycleJournalFromEnvironment() {
  const root=process.env.FIELD_REVOCATION_JOURNAL_DIRECTORY,secret=process.env.FIELD_REVOCATION_JOURNAL_SECRET;
  return root&&secret?new LifecycleJournal(resolve(root,'oauth-lifecycle'),secret):undefined;
}
export async function verifyLifecycle(db:PoolClient,journal:LifecycleJournal) {
  const namespaces=(await db.query("select nspname from pg_namespace where nspname in ('ap','field')")).rows.map(r=>r.nspname);
  if(!namespaces.includes('field')||namespaces.includes('ap'))throw new Error('lifecycle requires isolated field database');
  const entries=await journal.read(),hashes=new Map(entries.map(e=>[e.id,entryHash(e)]));
  const receipts=await db.query<{entry_id:string;entry_sha256:string}>('select entry_id,entry_sha256 from field.oauth_lifecycle_receipts');
  if(receipts.rows.some(r=>hashes.get(r.entry_id)!==r.entry_sha256))throw new Error('lifecycle journal continuity lost');
  return entries;
}
export async function persistLifecycle(db:PoolClient,entry:LifecycleEntry) {
  if(entry.kind==='family')await db.query('select pg_advisory_xact_lock(hashtextextended(jsonb_build_array($1::text,$2::text,$3::text,$4::text)::text,771))',[entry.clientId,entry.userId,entry.referenceId,entry.codeId]);
  await db.query(`insert into field.oauth_lifecycle_tombstones(kind,target_key,payload,revoked_at) values($1,$2,$3::jsonb,$4)
    on conflict(kind,target_key) do nothing`,[entry.kind,entry.targetKey,JSON.stringify(entry),entry.createdAt]);
  await db.query('insert into field.oauth_lifecycle_receipts(entry_id,entry_sha256) values($1,$2) on conflict(entry_id) do nothing',[entry.id,entryHash(entry)]);
}
export async function recordLifecycle(pool:Pool,journal:LifecycleJournal|undefined,intents:LifecycleIntent[]) {
  if(!journal)throw new Error('lifecycle journal unavailable');
  const db=await pool.connect();try {
    await db.query('begin');const existing=await verifyLifecycle(db,journal);
    const entries:LifecycleEntry[]=[];
    for(const intent of intents){const prior=existing.find(e=>e.kind===intent.kind&&e.targetKey===intent.targetKey);
      const entry=prior??await journal.append(intent);await persistLifecycle(db,entry);entries.push(entry);}
    await db.query('commit');return entries;
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
}

// Serving needs every durable intent committed and applied. Recovery deliberately uses
// the weaker receipt-subset verifyLifecycle so an fsync-before-commit crash is repairable.
export async function assertLifecycleServing(pool:Pool,journal:LifecycleJournal|undefined) {
  if(!journal)throw new Error('OAuth lifecycle proof unavailable');
  const db=await pool.connect();try{
    const entries=await verifyLifecycle(db,journal);
    const receipts=new Set((await db.query<{entry_id:string}>('select entry_id from field.oauth_lifecycle_receipts')).rows.map(r=>r.entry_id));
    if(entries.some(e=>!receipts.has(e.id)))throw new Error('OAuth lifecycle recovery required');
    for(const e of entries){
      const proof=await db.query('select 1 from field.oauth_lifecycle_tombstones where kind=$1 and target_key=$2',[e.kind,e.targetKey]);
      if(!proof.rowCount)throw new Error('OAuth lifecycle recovery required');
      if(e.kind==='route-key'){
        const pending=await db.query('select 1 from field.ap_connections where id=$1 and (route_key_closed_at is null or event_secret_cipher is not null)',[e.connectionId]);
        if(pending.rowCount)throw new Error('OAuth lifecycle recovery required');
        continue;
      }
      for(const [table,type] of [['oauthAccessToken','access'],['oauthRefreshToken','refresh']] as const){
        if(e.kind==='token'&&e.tokenType!==type)continue;
        const where=e.kind==='token' ? `encode(sha256(convert_to(token,'UTF8')),'hex')=$1`
          :e.kind==='legacy-baseline' ? `"createdAt"<=$1::timestamptz and not(encode(sha256(convert_to(token,'UTF8')),'hex')=any($2::text[]))`
          :`"clientId"=$1 and "userId" is not distinct from $2 and "referenceId" is not distinct from $3 and case when "authorizationCodeId" is null then null else encode(sha256(convert_to("authorizationCodeId",'UTF8')),'hex') end is not distinct from $4`;
        const values:unknown[]=e.kind==='token'?[e.tokenFingerprint]:e.kind==='legacy-baseline'?[e.cutoffAt,type==='access'?e.accessFingerprints:e.refreshFingerprints]:[e.clientId,e.userId,e.referenceId,e.codeId];
        const pending=await db.query(`select 1 from "${table}" where revoked is null and (${where}) limit 1`,values);
        if(pending.rowCount)throw new Error('OAuth lifecycle recovery required');
      }
    }
  }finally{db.release();}
}
