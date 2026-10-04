import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { fieldRevocationJournalFromEnvironment } from './revocation-journal.js';
import { reapplyFieldRevocationJournal } from './revocation-restore.js';
import { assertProductionProfile } from './production-profile.js';

assertProductionProfile();
if (!process.argv.includes('--offline-restored')) throw new Error('explicit --offline-restored is required before replaying revocations');
const database = process.env.FIELD_REVOCATION_RESTORE_DATABASE_URL, active = process.env.FIELD_DATABASE_URL;
const checkpointFile = process.env.FIELD_REVOCATION_RESTORE_CHECKPOINT_FILE;
if (!database || !active || !checkpointFile) throw new Error('active database binding, separate restored database and trusted checkpoint are required');
const current = new URL(active), restored = new URL(database);
if (decodeURIComponent(current.pathname) === decodeURIComponent(restored.pathname)) throw new Error('restore target must differ from the active Field database');
if (process.env.FIELD_PROFILE !== 'mock') throw new Error('local revocation restore requires mock; operational restore approval is not configured');
const localField = (url: URL) => ['postgres:', 'postgresql:'].includes(url.protocol)
  && ['127.0.0.1','localhost'].includes(url.hostname) && url.port === '55432' && url.username === 'field_local';
if (!localField(current) || !localField(restored) || !/^\/fieldai_field_(mock|test_[a-f0-9]+)$/.test(current.pathname)
  || !/^\/fieldai_field_restore_[a-f0-9]+$/.test(restored.pathname))
  throw new Error('revocation restore requires local Field mock bindings and a separate fieldai_field_restore database');
const journal = fieldRevocationJournalFromEnvironment();
if (!journal) throw new Error('existing Field revocation journal and signing key are required');
await realpath(resolve(process.env.FIELD_REVOCATION_JOURNAL_DIRECTORY!));
const checkpoint = await readFile(checkpointFile, 'utf8');
// 서명/누락을 DB 접속 전에 확인한다.
await journal.verifiedEntries(checkpoint);
const pool = new Pool({ connectionString: database });
try {
  const result = await reapplyFieldRevocationJournal(pool, journal, checkpoint);
  process.stdout.write(`Field restored revocations applied: ${result.applied}; entries: ${result.entries}\n`);
} finally { await pool.end(); }
