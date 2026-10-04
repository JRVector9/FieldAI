import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { verifyLifecycle, type LifecycleJournal } from './oauth-lifecycle-journal.js';
import { verifyAgentRevocationJournal, type AgentRevocationJournal } from './revocation-journal.js';

// These are identifiers owned by this product, never supplied by CLI input.
export const liveBaselineTables = [
  '"oauthClient"', '"oauthAccessToken"', '"oauthRefreshToken"', '"oauthConsent"',
  'ap.oauth_selections', 'ap.field_oauth_attempts', 'ap.field_connections',
  'ap.field_remote_revocations', 'ap.field_connection_revocations', 'ap.knowledge_sources',
  'ap.revocation_journal_receipts', 'ap.revocation_restore_audit',
  'ap.oauth_lifecycle_receipts', 'ap.oauth_lifecycle_tombstones',
] as const;
export type LiveBaselinePlan = { product: 'agent'; databaseFingerprint: string; planDigest: string; counts: Record<string, number> };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export async function assertNoLiveBaselineWriters(db: PoolClient) {
  // Catch both active transactions and idle transactions holding a writer lock.
  // The explicit operator confirmation is still required: idle API processes
  // without locks cannot be distinguished from stopped ones by PostgreSQL.
  const writers = await db.query(`select exists(
    select 1 from pg_stat_activity a where a.datname=current_database() and a.pid<>pg_backend_pid()
      and a.backend_type='client backend' and a.state is distinct from 'idle'
    union all
    select 1 from pg_locks l where l.pid<>pg_backend_pid() and l.granted
      and l.database=(select oid from pg_database where datname=current_database())
      and l.relation=any($1::regclass[]) and l.mode in
        ('RowExclusiveLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock')
  ) as present`, [liveBaselineTables]);
  if (writers.rows[0].present) throw new Error('active OAuth writers must be stopped before live baseline');
}

export async function liveBaselineSnapshot(db: PoolClient, journal: LifecycleJournal, native: AgentRevocationJournal): Promise<LiveBaselinePlan> {
  const lifecycle = await verifyLifecycle(db, journal);
  const revocations = await verifyAgentRevocationJournal(db, native);
  await assertNoLiveBaselineWriters(db);
  const databaseFingerprint = await liveDatabaseFingerprint(db);
  const snapshot = createHash('sha256').update(databaseFingerprint);
  const counts: Record<string, number> = {};
  for (const [index, table] of liveBaselineTables.entries()) {
    // Hash in PostgreSQL and stream only hashes in bounded batches. Token,
    // ciphertext and user data never reach the plan output or process logs.
    const token = table === '"oauthAccessToken"' || table === '"oauthRefreshToken"';
    const value = token ? `jsonb_build_array(to_jsonb(t),t."expiresAt">statement_timestamp())` : 'to_jsonb(t)';
    const cursor = `baseline_snapshot_${index}`;
    await db.query(`declare ${cursor} no scroll cursor for select encode(sha256(convert_to(${value}::text,'UTF8')),'hex') as hash from ${table} t order by hash`);
    const digest = createHash('sha256'); let count = 0;
    try {
      for (;;) {
        const rows = (await db.query<{ hash: string }>(`fetch forward 1000 from ${cursor}`)).rows;
        for (const row of rows) digest.update(row.hash);
        count += rows.length; if (rows.length < 1000) break;
      }
    } finally { await db.query(`close ${cursor}`); }
    counts[table.replaceAll('"', '')] = count;
    snapshot.update(JSON.stringify([table, count, digest.digest('hex')]));
  }
  // Both readers verify signatures. Sorting by durable id makes this stable
  // while including every intent; checkpoint createdAt is deliberately absent.
  for (const [name, entries] of [['lifecycle', lifecycle], ['revocations', revocations]] as const) {
    counts[`journal.${name}`] = entries.length;
    snapshot.update(JSON.stringify([name, [...entries].sort((a, b) => a.id.localeCompare(b.id))]));
  }
  await assertNoLiveBaselineWriters(db);
  return { product: 'agent', databaseFingerprint, planDigest: snapshot.digest('hex'), counts };
}

export async function liveDatabaseFingerprint(db: PoolClient) {
  const identity = (await db.query(`select current_database() as database,
    (select oid::text from pg_database where datname=current_database()) as oid,
    current_user as role, inet_server_addr()::text as address, inet_server_port() as port,
    pg_postmaster_start_time()::text as started`)).rows[0];
  return hash(JSON.stringify(['agent', identity]));
}

export function liveCheckpointConfirmation(flags: string[]) {
  const databaseFingerprint = flags.find(f => f.startsWith('--confirm-database='))?.slice('--confirm-database='.length);
  if (flags.length !== 3 || new Set(flags).size !== 3 || !flags.includes('--confirm-product=agent')
    || !flags.includes('--confirm-writers-stopped') || !/^[a-f0-9]{64}$/.test(databaseFingerprint ?? ''))
    throw new Error('live checkpoint requires explicit own product, database and stopped writers confirmation');
  return databaseFingerprint!;
}

export async function readLiveCheckpoint<T>(pool: Pool, journal: LifecycleJournal, native: AgentRevocationJournal,
  confirmation: string, writeProtectedCheckpoint: () => Promise<T>) {
  const db = await pool.connect();
  try {
    await db.query('begin isolation level repeatable read');
    await db.query("set local lock_timeout='1s'"); await db.query("set local statement_timeout='15s'");
    if (!(await db.query("select pg_try_advisory_xact_lock(hashtext('ap-live-oauth-baseline')) as locked")).rows[0].locked)
      throw new Error('another live baseline/checkpoint is already running');
    await db.query(`lock table ${liveBaselineTables.join(',')} in share mode`);
    await verifyLifecycle(db, journal); await verifyAgentRevocationJournal(db, native);
    await assertNoLiveBaselineWriters(db);
    if (await liveDatabaseFingerprint(db) !== confirmation) throw new Error('database confirmation mismatch');
    // The protected file and its directory must be fsynced before releasing
    // the writer fence; otherwise a concurrent baseline can stale the export.
    const data = await writeProtectedCheckpoint();
    await assertNoLiveBaselineWriters(db);
    await db.query('commit'); return data;
  } catch (error) { await db.query('rollback'); throw error; }
  finally { db.release(); }
}

export async function readLiveBaselinePlan(pool: Pool, journal: LifecycleJournal, native: AgentRevocationJournal) {
  const db = await pool.connect();
  try {
    await db.query('begin isolation level repeatable read read only');
    await db.query("set local statement_timeout='15s'");
    const plan = await liveBaselineSnapshot(db, journal, native);
    await db.query('commit'); return plan;
  } catch (error) { await db.query('rollback'); throw error; }
  finally { db.release(); }
}
