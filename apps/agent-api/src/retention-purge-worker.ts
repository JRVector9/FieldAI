import { readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { createAgentInquiryMediaStore } from './inquiry-media.js';
import { AgentRetentionJournal } from './retention-journal.js';
import { verifyAgentRetentionJournal } from './retention-journal-integrity.js';
import { runAgentRetentionJobOnce } from './retention-purge.js';

if (process.env.NODE_ENV === 'production' && process.env.AP_PROFILE === 'mock')
  throw new Error('mock profile is forbidden in production');
const databaseUrl = process.env.AP_DATABASE_URL;
const directory = process.env.AP_RETENTION_JOURNAL_DIRECTORY;
const secret = process.env.AP_RETENTION_JOURNAL_SECRET;
const media = createAgentInquiryMediaStore();
if (!databaseUrl || !directory || !secret || !media)
  throw new Error('AP retention requires its database, private media store and separate journal configuration');
const journal = new AgentRetentionJournal(directory, secret);
// A lost existing journal is not a fresh service. Initial setup creates the empty directory.
await readdir(directory);
await journal.read();
const pool = new Pool({ connectionString: databaseUrl });
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => controller.abort());
try {
  await pool.query('select 1 from ap.work_retention_jobs limit 1');
  await verifyAgentRetentionJournal(pool,journal);
  process.stdout.write('agent retention worker ready\n');
  do {
    try {
      const result = await runAgentRetentionJobOnce({ pool, media, journal });
      if (result !== 'empty' || process.argv.includes('--once')) process.stdout.write(`agent retention: ${result}\n`);
      if (process.argv.includes('--once')) break;
      if (result === 'empty' || result === 'retry' || result === 'receipt_pending')
        await delay(2000, undefined, { signal: controller.signal });
    } catch {
      if (controller.signal.aborted) break;
      process.stderr.write('agent retention unavailable; no completion claimed\n');
      if (process.argv.includes('--once')) { process.exitCode = 1; break; }
      await delay(2000, undefined, { signal: controller.signal }).catch(() => undefined);
    }
  } while (!controller.signal.aborted);
} finally { await pool.end(); }
