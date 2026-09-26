import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { open, stat, readdir, readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

export type AgentRevocationEntry = { version: 1; product: 'agent'; id: string; createdAt: string;
  organizationId: string; targetKind: 'selection' | 'connection'; targetId: string;
  selectionId: string | null; source: 'owner' | 'remote'; revocationId: string | null };
type Intent = Omit<AgentRevocationEntry, 'version' | 'product' | 'id' | 'createdAt'>;
type Checkpoint = { version: 1; product: 'agent'; purpose: 'revocation-checkpoint'; createdAt: string;
  entries: { id: string; sha256: string }[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AgentRevocationJournal {
  private cache: { stamp: string; entries: AgentRevocationEntry[]; hashes: Map<string,string>; files: Map<string,string> } | undefined;
  close() { this.cache = undefined; }
  private async stamp() {
    const value = await stat(this.root, { bigint: true });
    if (!value.isDirectory()) throw new Error('AP revocation directory is unavailable');
    return `${value.dev}:${value.ino}:${value.mtimeNs}:${value.ctimeNs}`;
  }
  private async fileStamp(name: string) {
    const value = await stat(resolve(this.root,name), { bigint: true });
    if (!value.isFile()) throw new Error('invalid AP revocation file');
    return `${value.dev}:${value.ino}:${value.size}:${value.mtimeNs}:${value.ctimeNs}`;
  }
  private async readEntry(name: string) {
    if (!uuid.test(name.slice(0,-5))) throw new Error('invalid Agent revocation filename');
    const before = await this.fileStamp(name);
    const entry = this.unseal(await readFile(resolve(this.root,name),'utf8')) as AgentRevocationEntry;
    this.validate(entry);
    if (entry.id !== name.slice(0,-5)) throw new Error('Agent revocation filename mismatch');
    const after = await this.fileStamp(name);
    if (after !== before) throw new Error('AP revocation file changed during validation');
    return { entry: Object.freeze(entry), stamp: after };
  }
  constructor(private readonly root: string, private readonly secret: string) {
    if (secret.length < 24) throw new Error('Agent revocation journal secret must be at least 24 characters');
  }
  private seal(data: string) {
    return JSON.stringify({ data, signature: createHmac('sha256', this.secret).update('agent-revocation-v1\0').update(data).digest('hex') });
  }
  private unseal(envelope: string): unknown {
    const value = JSON.parse(envelope) as { data?: unknown; signature?: unknown };
    if (typeof value.data !== 'string' || typeof value.signature !== 'string' || !/^[a-f0-9]{64}$/.test(value.signature))
      throw new Error('invalid Agent revocation envelope');
    const expected = createHmac('sha256', this.secret).update('agent-revocation-v1\0').update(value.data).digest();
    if (!timingSafeEqual(expected, Buffer.from(value.signature, 'hex'))) throw new Error('Agent revocation signature mismatch');
    return JSON.parse(value.data);
  }
  async append(intent: Intent) {
    const entry: AgentRevocationEntry = { ...intent, version: 1, product: 'agent', id: randomUUID(), createdAt: new Date().toISOString() };
    this.validate(entry);
    const before = await this.stamp();
    const temp = resolve(this.root, `${entry.id}.tmp`), destination = resolve(this.root, `${entry.id}.json`);
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(this.seal(JSON.stringify(entry))); await file.sync(); } finally { await file.close(); }
    await rename(temp, destination);
    const directory = await open(this.root, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    const after = await this.stamp();
    if (this.cache?.stamp === before) {
      this.cache.entries.push(Object.freeze(entry));
      this.cache.hashes.set(entry.id, agentRevocationEntryHash(entry));
      this.cache.files.set(entry.id, await this.fileStamp(`${entry.id}.json`));
      this.cache.stamp = after;
    } else this.cache = undefined;
    return entry;
  }
  private validate(entry: AgentRevocationEntry) {
    if (!entry || entry.version !== 1 || entry.product !== 'agent' || !uuid.test(entry.id)
      || !uuid.test(entry.organizationId) || !uuid.test(entry.targetId)
      || !['selection','connection'].includes(entry.targetKind) || !['owner','remote'].includes(entry.source)
      || (entry.selectionId !== null && !uuid.test(entry.selectionId))
      || (entry.revocationId !== null && !uuid.test(entry.revocationId))
      || (entry.targetKind === 'connection' && entry.selectionId === null)
      || (entry.source === 'remote' && (entry.targetKind !== 'connection' || entry.revocationId === null))
      || (entry.targetKind === 'selection' && (entry.selectionId !== entry.targetId || entry.revocationId !== null))
      || !Number.isFinite(Date.parse(entry.createdAt))) throw new Error('invalid Agent revocation entry');
  }
  async read(force = false): Promise<AgentRevocationEntry[]> {
    const stamp = await this.stamp();
    // Metadata is checked synchronously with each request; filesystem notifications are not a proof.
    // Unchanged files reuse verified hashes. Checkpoint/restore always reread every signature.
    if (!force && this.cache?.stamp === stamp) {
      const cache = this.cache;
      try {
        for (let offset=0;offset<cache.entries.length;offset+=64) {
          await Promise.all(cache.entries.slice(offset,offset+64).map(async entry => {
            const name=`${entry.id}.json`, current=await this.fileStamp(name);
            if (cache.files.get(entry.id) === current) return;
            const changed=await this.readEntry(name);
            if (cache.hashes.get(entry.id) !== agentRevocationEntryHash(changed.entry)) throw new Error('AP revocation journal continuity lost');
            cache.files.set(entry.id,changed.stamp);
          }));
        }
        if (this.cache !== cache || await this.stamp() !== stamp) return this.read(true);
        return cache.entries;
      } catch (error) { this.cache = undefined; throw error; }
    }
    const entries: AgentRevocationEntry[] = [], files=new Map<string,string>();
    for (const name of (await readdir(this.root)).filter(n => n.endsWith('.json')).sort()) {
      const value=await this.readEntry(name);entries.push(value.entry);files.set(value.entry.id,value.stamp);
    }
    this.cache = { stamp, entries, files, hashes: new Map(entries.map(e => [e.id,agentRevocationEntryHash(e)])) };
    return entries;
  }
  async checkpoint() {
    const entries = (await this.read(true)).slice().sort((a,b)=>a.id.localeCompare(b.id));
    const value: Checkpoint = { version: 1, product: 'agent', purpose: 'revocation-checkpoint', createdAt: new Date().toISOString(),
      entries: entries.map(e => ({ id: e.id, sha256: createHash('sha256').update(JSON.stringify(e)).digest('hex') })) };
    return this.seal(JSON.stringify(value));
  }
  async verifiedEntries(checkpoint: string) {
    const value = this.unseal(checkpoint) as Checkpoint;
    if (!value || value.version !== 1 || value.product !== 'agent' || value.purpose !== 'revocation-checkpoint'
      || !Number.isFinite(Date.parse(value.createdAt)) || !Array.isArray(value.entries)
      || value.entries.some(e => !e || !uuid.test(e.id) || !/^[a-f0-9]{64}$/.test(e.sha256))
      || new Set(value.entries.map(e => e.id)).size !== value.entries.length) throw new Error('invalid Agent revocation checkpoint');
    const entries = (await this.read(true)).slice().sort((a,b)=>a.id.localeCompare(b.id));
    if (entries.length !== value.entries.length || entries.some((entry, i) => entry.id !== value.entries[i]?.id
      || createHash('sha256').update(JSON.stringify(entry)).digest('hex') !== value.entries[i]?.sha256))
      throw new Error('Agent revocation journal does not match the trusted checkpoint');
    return entries;
  }
}

export function agentRevocationJournalFromEnvironment() {
  const root = process.env.AP_REVOCATION_JOURNAL_DIRECTORY, secret = process.env.AP_REVOCATION_JOURNAL_SECRET;
  return root && secret ? new AgentRevocationJournal(root, secret) : undefined;
}


export const agentRevocationEntryHash = (entry: AgentRevocationEntry) => createHash('sha256').update(JSON.stringify(entry)).digest('hex');

type VerifiedProof = { entries: AgentRevocationEntry[]; indexedLength: number; intents: Map<string,AgentRevocationEntry> };
const proofs = new WeakMap<object,Map<string,VerifiedProof>>();
const intentKey = (entry: Pick<AgentRevocationEntry,'targetKind'|'targetId'|'source'>) => `${entry.targetKind}:${entry.targetId}:${entry.source}`;

export async function verifyAgentRevocationJournal(db: import('pg').PoolClient, journal: Pick<AgentRevocationJournal, 'read'>) {
  const database = String((await db.query('select current_database() as database')).rows[0].database);
  const entries = await journal.read();
  const known = proofs.get(journal)?.get(database);
  if (known?.entries === entries) {
    for (let i=known.indexedLength;i<entries.length;i++) known.intents.set(intentKey(entries[i]!),entries[i]!);
    known.indexedLength=entries.length;
    return entries;
  }
  const receipts = await db.query<{ entry_id: string; entry_sha256: string }>('select entry_id,entry_sha256 from ap.revocation_journal_receipts');
  const hashes = new Map(entries.map(e => [e.id, agentRevocationEntryHash(e)]));
  if (receipts.rows.some(r => hashes.get(r.entry_id) !== r.entry_sha256)) throw new Error('AP revocation journal continuity lost');
  const byDatabase = proofs.get(journal) ?? new Map<string,VerifiedProof>();
  byDatabase.set(database,{entries,indexedLength:entries.length,intents:new Map(entries.map(e=>[intentKey(e),e]))});proofs.set(journal,byDatabase);
  return entries;
}

export async function recordAgentRevocation(db: import('pg').PoolClient,
  journal: Pick<AgentRevocationJournal, 'read' | 'append'> | undefined, intent: Intent) {
  if (!journal) throw Object.assign(new Error('AP revocation journal unavailable'), { statusCode: 503 });
  try {
    await verifyAgentRevocationJournal(db, journal);
    const database = String((await db.query('select current_database() as database')).rows[0].database);
    const proof = proofs.get(journal)!.get(database)!;
    const prior = proof.intents.get(intentKey(intent));
    if (prior && (prior.organizationId !== intent.organizationId || prior.selectionId !== intent.selectionId
      || (intent.source === 'remote' && prior.revocationId !== intent.revocationId))) throw new Error('AP revocation intent binding mismatch');
    // A durable intent survives a failed DB commit. Its outgoing UUID remains stable on retry.
    const entry = prior ?? await journal.append(intent);
    await db.query('insert into ap.revocation_journal_receipts(entry_id,entry_sha256) values($1,$2) on conflict(entry_id) do nothing',
      [entry.id, agentRevocationEntryHash(entry)]);
    proof.intents.set(intentKey(entry), entry);
    return entry;
  } catch { throw Object.assign(new Error('AP revocation journal unavailable'), { statusCode: 503 }); }
}
