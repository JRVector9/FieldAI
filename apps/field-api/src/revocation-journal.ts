import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

export type FieldRevocationEntry = { version: 1; product: 'field'; id: string; createdAt: string;
  organizationId: string; targetKind: 'selection' | 'connection'; targetId: string;
  selectionId: string | null; source: 'owner' | 'remote'; revocationId: string | null };
type Intent = Omit<FieldRevocationEntry, 'version' | 'product' | 'id' | 'createdAt'>;
type Checkpoint = { version: 1; product: 'field'; purpose: 'revocation-checkpoint'; createdAt: string;
  entries: { id: string; sha256: string }[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class FieldRevocationJournal {
  constructor(private readonly root: string, private readonly secret: string) {
    if (secret.length < 24) throw new Error('Field revocation journal secret must be at least 24 characters');
  }
  private seal(data: string) {
    return JSON.stringify({ data, signature: createHmac('sha256', this.secret).update('field-revocation-v1\0').update(data).digest('hex') });
  }
  private unseal(envelope: string): unknown {
    const value = JSON.parse(envelope) as { data?: unknown; signature?: unknown };
    if (typeof value.data !== 'string' || typeof value.signature !== 'string' || !/^[a-f0-9]{64}$/.test(value.signature))
      throw new Error('invalid Field revocation envelope');
    const expected = createHmac('sha256', this.secret).update('field-revocation-v1\0').update(value.data).digest();
    if (!timingSafeEqual(expected, Buffer.from(value.signature, 'hex'))) throw new Error('Field revocation signature mismatch');
    return JSON.parse(value.data);
  }
  async append(intent: Intent) {
    const entry: FieldRevocationEntry = { ...intent, version: 1, product: 'field', id: randomUUID(), createdAt: new Date().toISOString() };
    this.validate(entry);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const temp = resolve(this.root, `${entry.id}.tmp`), destination = resolve(this.root, `${entry.id}.json`);
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(this.seal(JSON.stringify(entry))); await file.sync(); } finally { await file.close(); }
    await rename(temp, destination);
    const directory = await open(this.root, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    return entry;
  }
  private validate(entry: FieldRevocationEntry) {
    if (!entry || entry.version !== 1 || entry.product !== 'field' || !uuid.test(entry.id)
      || !uuid.test(entry.organizationId) || !uuid.test(entry.targetId)
      || !['selection','connection'].includes(entry.targetKind) || !['owner','remote'].includes(entry.source)
      || (entry.selectionId !== null && !uuid.test(entry.selectionId))
      || (entry.revocationId !== null && !uuid.test(entry.revocationId))
      || (entry.targetKind === 'selection' && (entry.selectionId !== entry.targetId || entry.revocationId !== null))
      || !Number.isFinite(Date.parse(entry.createdAt))) throw new Error('invalid Field revocation entry');
  }
  async read(): Promise<FieldRevocationEntry[]> {
    // 복원/검수에서는 없는 디렉터리를 빈 원장으로 간주하지 않는다.
    const entries = [];
    for (const name of (await readdir(this.root)).filter(n => n.endsWith('.json')).sort()) {
      if (!uuid.test(name.slice(0, -5))) throw new Error('invalid Field revocation filename');
      const entry = this.unseal(await readFile(resolve(this.root, name), 'utf8')) as FieldRevocationEntry;
      this.validate(entry);
      if (entry.id !== name.slice(0, -5)) throw new Error('Field revocation filename mismatch');
      entries.push(entry);
    }
    return entries;
  }
  async checkpoint() {
    const entries = await this.read();
    const value: Checkpoint = { version: 1, product: 'field', purpose: 'revocation-checkpoint', createdAt: new Date().toISOString(),
      entries: entries.map(e => ({ id: e.id, sha256: createHash('sha256').update(JSON.stringify(e)).digest('hex') })) };
    return this.seal(JSON.stringify(value));
  }
  async verifiedEntries(checkpoint: string) {
    const value = this.unseal(checkpoint) as Checkpoint;
    if (!value || value.version !== 1 || value.product !== 'field' || value.purpose !== 'revocation-checkpoint'
      || !Number.isFinite(Date.parse(value.createdAt)) || !Array.isArray(value.entries)
      || value.entries.some(e => !e || !uuid.test(e.id) || !/^[a-f0-9]{64}$/.test(e.sha256))
      || new Set(value.entries.map(e => e.id)).size !== value.entries.length) throw new Error('invalid Field revocation checkpoint');
    const entries = await this.read();
    if (entries.length !== value.entries.length || entries.some((entry, i) => entry.id !== value.entries[i]?.id
      || createHash('sha256').update(JSON.stringify(entry)).digest('hex') !== value.entries[i]?.sha256))
      throw new Error('Field revocation journal does not match the trusted checkpoint');
    return entries;
  }
}

export function fieldRevocationJournalFromEnvironment() {
  const root = process.env.FIELD_REVOCATION_JOURNAL_DIRECTORY, secret = process.env.FIELD_REVOCATION_JOURNAL_SECRET;
  return root && secret ? new FieldRevocationJournal(root, secret) : undefined;
}

export async function recordFieldRevocation(journal: Pick<FieldRevocationJournal, 'append'> | undefined, intent: Intent) {
  if (!journal) throw Object.assign(new Error('Field revocation journal unavailable'), { statusCode: 503 });
  // 호출자의 native 대상 row lock과 UUID별 원자 파일 교체를 사용한다.
  // 전역 lock을 대상 lock 뒤에 잡으면 선택 권한 회수와 연결 회수가 서로 기다릴 수 있다.
  try { await journal.append(intent); }
  catch { throw Object.assign(new Error('Field revocation journal unavailable'), { statusCode: 503 }); }
}
