import { readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { createFieldInquiryMediaStore } from './inquiry-media.js';
import { FieldRetentionJournal } from './retention-journal.js';
import { verifyFieldRetentionJournal } from './retention-journal-integrity.js';
import { runFieldRetentionJobOnce } from './retention-purge.js';

if (process.env.NODE_ENV === 'production' && process.env.FIELD_PROFILE === 'mock')
  throw new Error('mock profile is forbidden in production');
const databaseUrl = process.env.FIELD_DATABASE_URL;
const directory = process.env.FIELD_RETENTION_JOURNAL_DIRECTORY;
const secret = process.env.FIELD_RETENTION_JOURNAL_SECRET;
const media = createFieldInquiryMediaStore();
if (!databaseUrl || !directory || !secret || !media)
  throw new Error('Field retention requires its database, private media store and separate journal configuration');
const journal = new FieldRetentionJournal(directory, secret);
// First local setup creates the empty journal. Never recreate a lost existing journal.
await readdir(directory);
await journal.read();
const pool = new Pool({ connectionString: databaseUrl });
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => controller.abort());
try {
  await pool.query('select 1 from field.work_retention_jobs limit 1');
  await verifyFieldRetentionJournal(pool,journal);
  process.stdout.write('field retention worker ready\n');
  do {
    try {
      const result = await runFieldRetentionJobOnce({ pool, media, journal });
      if (result !== 'empty' || process.argv.includes('--once')) process.stdout.write(`field retention: ${result}\n`);
      if (process.argv.includes('--once')) break;
      if (result === 'empty' || result === 'retry' || result === 'receipt_pending')
        await delay(2000, undefined, { signal: controller.signal });
    } catch {
      if (controller.signal.aborted) break;
      process.stderr.write('field retention unavailable; no completion claimed\n');
      if (process.argv.includes('--once')) { process.exitCode = 1; break; }
      await delay(2000, undefined, { signal: controller.signal }).catch(() => undefined);
    }
  } while (!controller.signal.aborted);
} finally { await pool.end(); }
