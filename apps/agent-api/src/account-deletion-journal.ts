import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { open, readdir, readFile, rename, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';

export type AccountDeletionIntent = { targetKind: 'account' | 'organization'; targetId: string; requestId: string;
  ownerUserId: string | null; memberUserIds: string[]; sourceEmailHmac: string | null; anonymousEmail: string | null };
export type AccountDeletionEntry = AccountDeletionIntent & { version: 1; product: 'agent'; id: string; createdAt: string };
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i, hex = /^[a-f0-9]{64}$/;
const userId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512 && !value.includes('\0');
export const deletionEntryHash = (entry: AccountDeletionEntry) => createHash('sha256').update(JSON.stringify(entry)).digest('hex');
function validate(entry: AccountDeletionEntry) {
  const fields = ['targetKind','targetId','requestId','ownerUserId','memberUserIds','sourceEmailHmac','anonymousEmail','version','product','id','createdAt'];
  if (!entry || Object.keys(entry).length !== fields.length || Object.keys(entry).some(k => !fields.includes(k))
    || entry.version !== 1 || entry.product !== 'agent' || !uuid.test(entry.id) || !uuid.test(entry.requestId)
    || !Number.isFinite(Date.parse(entry.createdAt)) || !Array.isArray(entry.memberUserIds)
    || entry.memberUserIds.some(id => !userId(id)) || new Set(entry.memberUserIds).size !== entry.memberUserIds.length)
    throw new Error('invalid AP account deletion journal entry');
  if (entry.targetKind === 'account') {
    if (!userId(entry.targetId) || entry.ownerUserId !== null || entry.memberUserIds.length || !hex.test(entry.sourceEmailHmac ?? '')
      || !/^deleted-[a-f0-9-]{36}@deleted\.invalid$/.test(entry.anonymousEmail ?? '') || !uuid.test(entry.anonymousEmail!.slice(8,44)))
      throw new Error('invalid AP account deletion binding');
  } else if (entry.targetKind !== 'organization' || !uuid.test(entry.targetId) || !userId(entry.ownerUserId)
    || !entry.memberUserIds.includes(entry.ownerUserId) || entry.sourceEmailHmac !== null || entry.anonymousEmail !== null)
    throw new Error('invalid AP organization deletion binding');
}

export class AgentAccountDeletionJournal {
  private cache?: { stamp: string; checkedAt: number; entries: AccountDeletionEntry[] };
  constructor(readonly root: string, private readonly secret: string) {
    if (secret.length < 24) throw new Error('AP account deletion signing secret must be at least 24 characters');
  }
  emailFingerprint(email: string) { return createHmac('sha256', this.secret).update('agent-account-deletion-email-v1\0').update(email.toLowerCase()).digest('hex'); }
  private seal(data: string) { return JSON.stringify({ data, signature: createHmac('sha256', this.secret).update('agent-account-deletion-journal-v1\0').update(data).digest('hex') }); }
  private unseal(value: string) {
    const envelope = JSON.parse(value) as { data?: unknown; signature?: unknown };
    if (typeof envelope.data !== 'string' || typeof envelope.signature !== 'string' || !hex.test(envelope.signature)) throw new Error('invalid deletion journal envelope');
    const expected = createHmac('sha256', this.secret).update('agent-account-deletion-journal-v1\0').update(envelope.data).digest();
    if (!timingSafeEqual(expected, Buffer.from(envelope.signature,'hex'))) throw new Error('AP deletion journal signature mismatch');
    return JSON.parse(envelope.data);
  }
  async stamp() {
    const value = await stat(this.root, { bigint: true });
    if (!value.isDirectory()) throw new Error('AP account deletion journal directory required');
    return `${value.dev}:${value.ino}:${value.mtimeNs}:${value.ctimeNs}`;
  }
  async read(force = false) {
    const stamp = await this.stamp();
    if (!force && this.cache?.stamp === stamp && Date.now() >= this.cache.checkedAt && Date.now() - this.cache.checkedAt < 60_000) return this.cache.entries;
    const names = (await readdir(this.root)).filter(name => name.endsWith('.json')).sort();
    const entries: AccountDeletionEntry[] = [];
    for (const name of names) {
      if (!uuid.test(name.slice(0,-5))) throw new Error('invalid AP deletion journal filename');
      const entry = this.unseal(await readFile(resolve(this.root,name),'utf8')) as AccountDeletionEntry;
      validate(entry); if (entry.id !== name.slice(0,-5)) throw new Error('deletion journal filename mismatch');
      entries.push(entry);
    }
    if (await this.stamp() !== stamp) throw new Error('deletion journal changed during verification');
    if (new Set(entries.map(entry => `${entry.targetKind}:${entry.targetId}`)).size !== entries.length) throw new Error('conflicting approved deletion intents');
    this.cache = { stamp, checkedAt: Date.now(), entries }; return entries;
  }
  async append(intent: AccountDeletionIntent) {
    const existing = (await this.read(true)).find(entry => entry.targetKind === intent.targetKind && entry.targetId === intent.targetId);
    if (existing) {
      if (intent.targetKind === 'organization' && (existing.ownerUserId !== intent.ownerUserId || existing.requestId !== intent.requestId
        || intent.memberUserIds.some(id => !existing.memberUserIds.includes(id)))) throw new Error('organization_deletion_journal_binding_conflict');
      if (intent.targetKind === 'account' && existing.sourceEmailHmac !== intent.sourceEmailHmac) throw new Error('account_deletion_journal_binding_conflict');
      return existing; // approved fsync-before-commit intent is never discarded on retry
    }
    const entry: AccountDeletionEntry = { ...intent, version: 1, product: 'agent', id: randomUUID(), createdAt: new Date().toISOString() };
    validate(entry);
    const temporary = resolve(this.root, `${entry.id}.tmp`), destination = resolve(this.root, `${entry.id}.json`);
    const file = await open(temporary,'wx',0o600);
    try { await file.writeFile(this.seal(JSON.stringify(entry))); await file.sync(); } finally { await file.close(); }
    await rename(temporary,destination);
    const directory = await open(this.root,'r'); try { await directory.sync(); } finally { await directory.close(); }
    this.cache = undefined; return entry;
  }
  async checkpoint() {
    const entries = await this.read(true);
    return this.seal(JSON.stringify({ version:1,product:'agent',purpose:'account-deletion-checkpoint',
      entries:entries.map(entry => ({ id:entry.id,sha256:deletionEntryHash(entry) })) }));
  }
  async verifiedEntries(checkpoint: string) {
    const value = this.unseal(checkpoint) as { version: number; product: string; purpose: string; entries: { id: string; sha256: string }[] };
    const entries = await this.read(true);
    if (!value || value.version !== 1 || value.product !== 'agent' || value.purpose !== 'account-deletion-checkpoint'
      || !Array.isArray(value.entries) || value.entries.length !== entries.length
      || entries.some((entry,i) => value.entries[i]?.id !== entry.id || value.entries[i]?.sha256 !== deletionEntryHash(entry)))
      throw new Error('AP deletion journal does not match trusted checkpoint');
    servingProofs.delete(this); return entries;
  }
}
const journals = new Map<string,AgentAccountDeletionJournal>();
export function accountDeletionJournalFromEnvironment() {
  const root = process.env.AP_RETENTION_JOURNAL_DIRECTORY, secret = process.env.AP_RETENTION_JOURNAL_SECRET;
  if (!root || !secret) return undefined;
  const path = resolve(root,'account-deletion'), key = `${path}\0${secret}`;
  let journal = journals.get(key); if (!journal) { journal = new AgentAccountDeletionJournal(path,secret); journals.set(key,journal); }
  return journal;
}
export async function persistDeletionReceipt(db: PoolClient, entry: AccountDeletionEntry) {
  await db.query(`insert into ap.deletion_journal_receipts(entry_id,entry_sha256,target_kind,target_id)
    values($1,$2,$3,$4) on conflict(entry_id) do nothing`, [entry.id,deletionEntryHash(entry),entry.targetKind,entry.targetId]);
}
const servingProofs = new WeakMap<AgentAccountDeletionJournal,Map<string,{ stamp: string; checkedAt: number }>>();
// A historical replay receipt proves what happened then. The current database
// must still contain the terminal state after any later partial restore.
export async function deletionEntryApplied(db: Pick<Pool,'query'>, entry: AccountDeletionEntry) {
  if (entry.targetKind === 'account') {
    return (await db.query(`select
      not exists(select 1 from "user" u where u.id=$1 and
        (u.email<>$2 or u.name<>'삭제된 사용자' or u."twoFactorEnabled" is true or u."emailVerified" or u.image is not null))
      and not exists(select 1 from "session" where "userId"=$1 and "expiresAt">now())
      and not exists(select 1 from "account" where "userId"=$1)
      and not exists(select 1 from "twoFactor" where "userId"=$1)
      and not exists(select 1 from ap.memberships where user_id=$1)
      and not exists(select 1 from ap.platform_admin_memberships where user_id=$1)
      and not exists(select 1 from ap.publisher_memberships where user_id=$1)
      and not exists(select 1 from "oauthClient" where "userId"=$1 and disabled is distinct from true)
      and not exists(select 1 from "oauthAccessToken" t where t.revoked is null and
        (t."userId"=$1 or t."clientId" in(select "clientId" from "oauthClient" where "userId"=$1)))
      and not exists(select 1 from "oauthRefreshToken" t where (t.revoked is null or t."rotationReplayResponse" is not null or t."rotationReplayExpiresAt" is not null) and
        (t."userId"=$1 or t."clientId" in(select "clientId" from "oauthClient" where "userId"=$1)))
      and not exists(select 1 from "oauthConsent" t where t."userId"=$1 or t."clientId" in(select "clientId" from "oauthClient" where "userId"=$1))
      and not exists(select 1 from ap.oauth_selections s where s.revoked_at is null and
        (s.actor_user_id=$1 or s.client_id in(select "clientId" from "oauthClient" where "userId"=$1))) as clean`,[entry.targetId,entry.anonymousEmail])).rows[0].clean as boolean;
  }
  return (await db.query(`select
    not exists(select 1 from ap.organizations where id=$1 and deleted_at is null)
    and not exists(select 1 from ap.memberships where organization_id=$1)
    and not exists(select 1 from ap.deployments where organization_id=$1 and status='active')
    and not exists(select 1 from ap.campaigns where organization_id=$1 and (state='published' or name<>'[삭제됨]'))
    and not exists(select 1 from ap.oauth_selections where organization_id=$1 and revoked_at is null)
    and not exists(select 1 from ap.field_connections where ap_organization_id=$1 and
      (status<>'revoked' or access_token_cipher is not null or refresh_token_cipher is not null))
    and not exists(select 1 from ap.knowledge_sources where organization_id=$1 and state<>'revoked')
    and not exists(select 1 from ap.knowledge_source_snapshots where source_id in(select id from ap.knowledge_sources where organization_id=$1))
    and not exists(select 1 from ap.knowledge_source_integrity_conflicts where source_id in(select id from ap.knowledge_sources where organization_id=$1))
    and not exists(select 1 from ap.knowledge_drafts where organization_id=$1 and content<>jsonb_build_object('businessName',coalesce(content->>'businessName',''),'introduction','','region','','openingHours','','services','[]'::jsonb,'faqs','[]'::jsonb))
    and not exists(select 1 from ap.knowledge_releases where organization_id=$1 and content<>jsonb_build_object('businessName',coalesce(content->>'businessName',''),'introduction','','region','','openingHours','','services','[]'::jsonb,'faqs','[]'::jsonb))
    and not exists(select 1 from ap.agent_drafts where organization_id=$1 and content<>jsonb_build_object('name','[삭제됨]','tone','clear','guideScope','','handoffText',''))
    and not exists(select 1 from ap.agent_releases where organization_id=$1 and content<>jsonb_build_object('name','[삭제됨]','tone','clear','guideScope','','handoffText',''))
    and not exists(select 1 from ap.ai_runs where organization_id=$1 and kind='owner_test' and (question<>'[삭제됨]' or answer is not null)) as clean`,[entry.targetId])).rows[0].clean as boolean;
}
export async function assertAccountDeletionServing(pool: Pool, journal: AgentAccountDeletionJournal | undefined) {
  if (!journal) {
    if (process.env.AP_PROFILE !== 'mock' || (await pool.query(`select exists(select 1 from ap.account_deletion_audit)
      or exists(select 1 from ap.organization_deletion_requests where status='executed') as present`)).rows[0].present)
      throw new Error('AP deletion journal unavailable; recovery required');
    return;
  }
  const identity = (await pool.query(`select current_database() || ':' || (select oid::text from pg_database where datname=current_database())
    || ':' || pg_postmaster_start_time()::text || ':' || 'ap.deletion_journal_receipts'::regclass::oid::text as identity,
    exists(select 1 from pg_namespace where nspname='ap') and not exists(select 1 from pg_namespace where nspname='field') as isolated,
    (select generation::text from ap.deletion_receipt_epoch where singleton) as receipt_epoch`)).rows[0];
  if(!identity.isolated)throw new Error('AP deletion serving requires isolated agent database');
  if (identity.receipt_epoch === null) throw new Error('AP deletion receipt continuity lost; recovery required');
  const stamp = `${await journal.stamp()}:${identity.receipt_epoch}`;
  const proof = servingProofs.get(journal)?.get(identity.identity);
  if (proof?.stamp === stamp && Date.now() >= proof.checkedAt && Date.now() - proof.checkedAt < 60_000) return;
  const entries = await journal.read(true);
  const receipts = (await pool.query<{entry_id:string;entry_sha256:string;target_kind:string;target_id:string}>('select entry_id,entry_sha256,target_kind,target_id from ap.deletion_journal_receipts')).rows;
  const byId = new Map(entries.map(entry => [entry.id,entry]));
  if (receipts.length !== entries.length || receipts.some(receipt => {
    const entry = byId.get(receipt.entry_id); return !entry || deletionEntryHash(entry) !== receipt.entry_sha256
      || entry.targetKind !== receipt.target_kind || entry.targetId !== receipt.target_id;
  })) throw new Error('AP approved deletion recovery required');
  const missingHistory = (await pool.query(`select exists(select 1 from ap.account_deletion_audit a where not exists(
      select 1 from ap.deletion_journal_receipts r where r.target_kind='account' and r.target_id=a.user_id))
    or exists(select 1 from ap.organization_deletion_requests d where d.status='executed' and not exists(
      select 1 from ap.deletion_journal_receipts r where r.target_kind='organization' and r.target_id=d.organization_id::text)) as present`)).rows[0].present;
  if (missingHistory) throw new Error('AP deletion journal continuity lost; recovery required');
  for (const entry of entries) if (!await deletionEntryApplied(pool,entry)) throw new Error(`AP deleted ${entry.targetKind} recovery required`);
  const proofs = servingProofs.get(journal) ?? new Map(); proofs.set(identity.identity,{ stamp,checkedAt:Date.now() }); servingProofs.set(journal,proofs);
}
