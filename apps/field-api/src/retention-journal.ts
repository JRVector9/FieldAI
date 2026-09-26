import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RetentionKind } from './work-retention.js';

export type RetentionJournalEntry = { version: 1; product: 'field'; id: string; jobId: string; organizationId: string;
  targetKind: RetentionKind; targetId: string; scope: 'photos' | 'work'; action: 'file_prepared' | 'file_deleted' | 'purge_prepared' | 'completed';
  attachmentId?: string; objectKey?: string; createdAt: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type RetentionCheckpoint = { version: 1; product: 'field'; purpose: 'retention-checkpoint'; createdAt: string;
  entries: { id: string; sha256: string }[] };

export class FieldRetentionJournal {
  constructor(private readonly root: string, private readonly secret: string) {
    if (secret.length < 24) throw new Error('Field retention journal secret must be at least 24 characters');
  }
  private signature(data: string) { return createHmac('sha256', this.secret).update('field-retention-journal-v1\0').update(data).digest('hex'); }
  async checkpoint() {
    // 신규 worker의 빈 read와 달리 복원 증빙을 내보낼 때는 기존 디렉터리가 필요하다.
    await readdir(this.root);
    const entries = (await this.read()).sort((a,b) => a.id.localeCompare(b.id));
    const value: RetentionCheckpoint = { version: 1, product: 'field', purpose: 'retention-checkpoint', createdAt: new Date().toISOString(),
      entries: entries.map(e => ({ id: e.id, sha256: createHash('sha256').update(JSON.stringify(e)).digest('hex') })) };
    const data = JSON.stringify(value);
    return JSON.stringify({ data, signature: this.signature(data) });
  }
  async verifiedEntries(checkpoint: string) {
    if (typeof checkpoint !== 'string') throw new Error('trusted Field retention checkpoint is required');
    const envelope = JSON.parse(checkpoint) as { data?: unknown; signature?: unknown };
    if (!envelope || typeof envelope.data !== 'string' || typeof envelope.signature !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.signature)
      || !timingSafeEqual(Buffer.from(envelope.signature,'hex'), Buffer.from(this.signature(envelope.data),'hex')))
      throw new Error('Field retention checkpoint signature mismatch');
    const value = JSON.parse(envelope.data) as RetentionCheckpoint;
    if (!value || value.version !== 1 || value.product !== 'field' || value.purpose !== 'retention-checkpoint'
      || !Number.isFinite(Date.parse(value.createdAt)) || !Array.isArray(value.entries)
      || value.entries.some(e => !e || !uuid.test(e.id) || !/^[a-f0-9]{64}$/.test(e.sha256))
      || new Set(value.entries.map(e => e.id)).size !== value.entries.length) throw new Error('invalid Field retention checkpoint');
    await readdir(this.root);
    const entries = (await this.read()).sort((a,b) => a.id.localeCompare(b.id));
    if (entries.length !== value.entries.length || entries.some((entry,i) => entry.id !== value.entries[i]?.id
      || createHash('sha256').update(JSON.stringify(entry)).digest('hex') !== value.entries[i]?.sha256))
      throw new Error('Field retention journal does not match the trusted checkpoint');
    return entries;
  }
  async append(value: Omit<RetentionJournalEntry, 'version' | 'product' | 'id' | 'createdAt'>) {
    const entry: RetentionJournalEntry = { ...value, version: 1, product: 'field', id: randomUUID(), createdAt: new Date().toISOString() };
    const data = JSON.stringify(entry), envelope = JSON.stringify({ data, signature: this.signature(data) });
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const temporary = resolve(this.root, `${entry.id}.tmp`), destination = resolve(this.root, `${entry.id}.json`);
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(envelope); await file.sync(); } finally { await file.close(); }
    await rename(temporary, destination);
    const directory = await open(this.root, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    return entry;
  }
  async read(): Promise<RetentionJournalEntry[]> {
    let files: string[];
    try { files = await readdir(this.root); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const entries = [];
    for (const name of files.filter(f => f.endsWith('.json')).sort()) {
      if (!uuid.test(name.slice(0, -5))) throw new Error('invalid Field retention journal filename');
      const value = JSON.parse(await readFile(resolve(this.root, name), 'utf8')) as { data?: unknown; signature?: unknown };
      if (typeof value.data !== 'string' || typeof value.signature !== 'string' || !/^[a-f0-9]{64}$/.test(value.signature)
        || !timingSafeEqual(Buffer.from(value.signature, 'hex'), Buffer.from(this.signature(value.data), 'hex'))) throw new Error('Field retention journal signature mismatch');
      const entry = JSON.parse(value.data) as RetentionJournalEntry;
      if (entry.version !== 1 || entry.product !== 'field' || entry.id !== name.slice(0, -5)
        || !uuid.test(entry.jobId) || !uuid.test(entry.organizationId) || !uuid.test(entry.targetId)
        || !['inquiry','reservation','external_request'].includes(entry.targetKind) || !['photos','work'].includes(entry.scope)
        || !['file_prepared','file_deleted','purge_prepared','completed'].includes(entry.action) || !Number.isFinite(Date.parse(entry.createdAt))
        || (['file_prepared','file_deleted'].includes(entry.action)
          ? !entry.attachmentId || !uuid.test(entry.attachmentId) || entry.objectKey !== `${entry.organizationId}/${entry.attachmentId}.webp`
          : entry.objectKey !== undefined || entry.attachmentId !== undefined))
        throw new Error('invalid Field retention journal entry');
      entries.push(entry);
    }
    return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
}
