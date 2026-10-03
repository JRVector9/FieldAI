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
// 테스트·측정 전용 계측: 원장 파일 본문을 실제로 읽어 서명 검증한 횟수
export const lifecycleJournalMetrics={fileReads:0};
type CachedLifecycleFile={stamp:string;entry:LifecycleEntry;sha256:string};
export class LifecycleJournal {
  private cache:{stamp:string;entries:LifecycleEntry[];files:Map<string,CachedLifecycleFile>}|undefined;
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
  // 디렉터리·파일 식별값(dev/ino/size/mtime/ctime). 파일 알림은 증빙이 아니므로 매 읽기마다 동기 stat으로 비교한다.
  private async stamp(path:string,directory=false) {
    const value=await stat(path,{bigint:true});
    if(directory?!value.isDirectory():!value.isFile())throw new Error('invalid lifecycle file');
    return `${value.dev}:${value.ino}:${value.size}:${value.mtimeNs}:${value.ctimeNs}`;
  }
  private async readEntry(name:string):Promise<CachedLifecycleFile> {
    const path=resolve(this.root,name),before=await this.stamp(path);
    lifecycleJournalMetrics.fileReads++;
    const entry=this.unseal(await readFile(path,'utf8')) as LifecycleEntry;validate(entry);
    if(entry.id!==name.slice(0,-5)||await this.stamp(path)!==before)throw new Error('lifecycle file changed');
    return {stamp:before,entry:Object.freeze(entry),sha256:entryHash(entry)};
  }
  // 식별값이 그대로인 파일은 이미 검증한 항목을 재사용하고 새·변경 파일만 서명 검증한다.
  // 바뀐 파일의 내용 해시가 검증된 값과 다르면(같은 크기 변조 포함) 즉시 거부한다. force는 모든 서명을 다시 읽는다.
  // 원장 집합이 바뀌면 새 배열을 돌려주므로 호출자는 배열 동일성으로 변경 여부를 판단할 수 있다.
  // 디렉터리 식별값이 같아도 파일 목록은 매번 readdir로 다시 읽는다(디렉터리 시각만으로 추가·삭제를 판단하지 않는다).
  async read(force=false):Promise<LifecycleEntry[]> {
    const previous=this.cache,stamp=await this.stamp(this.root,true),unchanged=!force&&previous?.stamp===stamp;
    const names=(await readdir(this.root)).filter(n=>n.endsWith('.json')).sort();
    if(names.some(name=>!uuid.test(name.slice(0,-5))))throw new Error('invalid lifecycle filename');
    const stamps=await Promise.all(names.map(name=>this.stamp(resolve(this.root,name))));
    // 같은 개수에 모든 이름이 이전 검증 목록에 있으면 같은 집합이다(새 이름은 아래에서 reused=false가 된다).
    const files=new Map<string,CachedLifecycleFile>();let reused=unchanged&&names.length===previous!.files.size;
    for(const [index,name] of names.entries()){
      const known=previous?.files.get(name);
      if(!force&&known&&known.stamp===stamps[index]){files.set(name,known);continue;}
      const value=await this.readEntry(name);reused=false;
      if(known&&known.sha256!==value.sha256)throw new Error('lifecycle journal continuity lost');
      files.set(name,value);
    }
    if(reused&&this.cache===previous)return previous!.entries;
    const entries=[...files.values()].map(file=>file.entry);
    this.cache={stamp,entries,files};
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
    const entries=await this.read(true);return this.seal(JSON.stringify({version:1,product:'field',purpose:'oauth-lifecycle-checkpoint',entries:entries.map(e=>({id:e.id,sha256:entryHash(e)}))}));
  }
  async verifiedEntries(checkpoint:string) {
    const value=this.unseal(checkpoint) as {version:number;product:string;purpose:string;entries:{id:string;sha256:string}[]};
    // 복원은 전체 서명을 다시 확인하고 서빙 적용 확인 캐시도 버린다.
    servingProofs.delete(this);
    const entries=await this.read(true);
    if(!value||value.version!==1||value.product!=='field'||value.purpose!=='oauth-lifecycle-checkpoint'||!Array.isArray(value.entries)
      ||value.entries.length!==entries.length||entries.some((e,i)=>value.entries[i]?.id!==e.id||value.entries[i]?.sha256!==entryHash(e)))throw new Error('lifecycle checkpoint mismatch');
    return entries;
  }
}
// 서버는 요청마다 이 함수를 부르므로 같은 설정이면 같은 인스턴스(검증 캐시)를 재사용한다. 재시작하면 캐시는 비워진다.
const journals=new Map<string,LifecycleJournal>();
export function lifecycleJournalFromEnvironment() {
  const root=process.env.FIELD_REVOCATION_JOURNAL_DIRECTORY,secret=process.env.FIELD_REVOCATION_JOURNAL_SECRET;
  if(!root||!secret)return undefined;
  const path=resolve(root,'oauth-lifecycle'),key=`${path}\0${secret}`;
  let journal=journals.get(key);if(!journal){journal=new LifecycleJournal(path,secret);journals.set(key,journal);}
  return journal;
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
// 적용 확인 캐시(DB 식별값별). tombstone·receipt는 수정·삭제가 막혀 있고 tombstone 대상 토큰은 트리거가 되살리지 못하므로
// 같은 DB에서 적용을 확인한 항목은 다시 열리지 않는다. 원장 배열과 receipt 수가 그대로면 추가 조회 없이 통과하고,
// 바뀌면 receipt 연속성을 다시 확인한 뒤 확인되지 않은 항목만 검사한다. receipt 수가 줄거나 DB/receipt 테이블 oid·서버 시작 시각이
// 바뀌면(복원·같은 oid의 물리 복원·failover) 처음부터 확인한다. 캐시는 최대 60초만 믿고, 지나면 모든 항목을 DB에서 다시 확인한다
// (receipt/tombstone 커밋과 토큰 폐기가 별도 트랜잭션인 사이의 우회·트리거 우회를 주기적으로 잡는다).
export const LIFECYCLE_SERVING_CACHE_MAX_AGE_MS=60_000;
type ServingProof={entries:LifecycleEntry[];receipts:number;applied:Set<string>;verifiedAt:number};
const servingProofs=new WeakMap<LifecycleJournal,Map<string,ServingProof>>();
export async function assertLifecycleServing(pool:Pool,journal:LifecycleJournal|undefined) {
  if(!journal)throw new Error('OAuth lifecycle proof unavailable');
  const db=await pool.connect();try{
    const snapshot=await journal.read();
    const state=(await db.query<{identity:string;receipts:number}>(`select concat_ws(':',d.oid,'field.oauth_lifecycle_receipts'::regclass::oid,
      (select string_agg(nspname,',' order by nspname) from pg_namespace where nspname in ('ap','field')),pg_postmaster_start_time()::text) as identity,
      (select count(*)::int from field.oauth_lifecycle_receipts) as receipts from pg_database d where d.datname=current_database()`)).rows[0]!;
    const proofs=servingProofs.get(journal)??new Map<string,ServingProof>();servingProofs.set(journal,proofs);
    const now=Date.now(),cached=proofs.get(state.identity);
    // 유효 시간이 지난 캐시는 없는 것으로 보고, 적용 확인 기록도 버린 채 모든 항목을 다시 확인한다.
    const known=cached&&now-cached.verifiedAt<LIFECYCLE_SERVING_CACHE_MAX_AGE_MS?cached:undefined;
    if(known?.entries===snapshot&&known.receipts===state.receipts)return;
    proofs.delete(state.identity);
    const reuse=known&&state.receipts>=known.receipts?known:undefined;
    // 전체 확인을 다시 할 때만 유효 시간을 새로 센다(증분 확인은 마지막 전체 확인 시각을 이어 쓴다).
    const applied=reuse?reuse.applied:new Set<string>(),verifiedAt=reuse?reuse.verifiedAt:now;
    const entries=await verifyLifecycle(db,journal);
    const receipts=new Set((await db.query<{entry_id:string}>('select entry_id from field.oauth_lifecycle_receipts')).rows.map(r=>r.entry_id));
    if(entries.some(e=>!receipts.has(e.id)))throw new Error('OAuth lifecycle recovery required');
    for(const e of entries){
      if(applied.has(e.id))continue;
      const proof=await db.query('select 1 from field.oauth_lifecycle_tombstones where kind=$1 and target_key=$2',[e.kind,e.targetKey]);
      if(!proof.rowCount)throw new Error('OAuth lifecycle recovery required');
      if(e.kind==='route-key'){
        const pending=await db.query('select 1 from field.ap_connections where id=$1 and (route_key_closed_at is null or event_secret_cipher is not null)',[e.connectionId]);
        if(pending.rowCount)throw new Error('OAuth lifecycle recovery required');
        // 닫힌 route key는 protect_closed_ap_route_key 트리거가 다시 열지 못하므로 적용 확인으로 기록한다.
        applied.add(e.id);
        continue;
      }
      for(const [table,type] of [['oauthAccessToken','access'],['oauthRefreshToken','refresh']] as const){
        if(e.kind==='token'&&e.tokenType!==type)continue;
        // field.oauth_token_sha256(token)은 000081 식 인덱스와 같은 식이어야 인덱스를 탄다(encode(sha256(convert_to(token,'UTF8')),'hex')와 동일 값).
        const where=e.kind==='token' ? `field.oauth_token_sha256(token)=$1`
          :e.kind==='legacy-baseline' ? `"createdAt"<=$1::timestamptz and not(field.oauth_token_sha256(token)=any($2::text[]))`
          :`"clientId"=$1 and "userId" is not distinct from $2 and "referenceId" is not distinct from $3 and case when "authorizationCodeId" is null then null else encode(sha256(convert_to("authorizationCodeId",'UTF8')),'hex') end is not distinct from $4`;
        const values:unknown[]=e.kind==='token'?[e.tokenFingerprint]:e.kind==='legacy-baseline'?[e.cutoffAt,type==='access'?e.accessFingerprints:e.refreshFingerprints]:[e.clientId,e.userId,e.referenceId,e.codeId];
        const pending=await db.query(`select 1 from "${table}" where revoked is null and (${where}) limit 1`,values);
        if(pending.rowCount)throw new Error('OAuth lifecycle recovery required');
      }
      applied.add(e.id);
    }
    proofs.set(state.identity,{entries:snapshot,receipts:state.receipts,applied,verifiedAt});
  }finally{db.release();}
}
