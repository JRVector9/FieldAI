import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { agentRevocationJournalFromEnvironment } from './revocation-journal.js';
import { reapplyAgentRevocationJournal } from './revocation-restore.js';
import { assertProductionProfile } from './production-profile.js';

assertProductionProfile();
if (!process.argv.includes('--offline-restored')) throw new Error('explicit --offline-restored is required before replaying revocations');
const database = process.env.AP_REVOCATION_RESTORE_DATABASE_URL, active = process.env.AP_DATABASE_URL;
const checkpointFile = process.env.AP_REVOCATION_RESTORE_CHECKPOINT_FILE;
if (!database || !active || !checkpointFile) throw new Error('active database binding, separate restored database and trusted checkpoint are required');
const current = new URL(active), restored = new URL(database);
if (decodeURIComponent(current.pathname) === decodeURIComponent(restored.pathname)) throw new Error('restore target must differ from the active AP database');
if (process.env.AP_PROFILE !== 'mock') throw new Error('local revocation restore requires mock; operational restore approval is not configured');
const localAP = (url: URL) => ['postgres:', 'postgresql:'].includes(url.protocol)
  && ['127.0.0.1','localhost'].includes(url.hostname) && url.port === '55431' && url.username === 'agent_local';
if (!localAP(current) || !localAP(restored) || !/^\/fieldai_agent_(mock|test_[a-f0-9]+)$/.test(current.pathname)
  || !/^\/fieldai_agent_restore_[a-f0-9]+$/.test(restored.pathname))
  throw new Error('revocation restore requires local AP mock bindings and a separate fieldai_agent_restore database');
const journal = agentRevocationJournalFromEnvironment();
if (!journal) throw new Error('existing AP revocation journal and signing key are required');
await realpath(resolve(process.env.AP_REVOCATION_JOURNAL_DIRECTORY!));
const checkpoint = await readFile(checkpointFile, 'utf8');
// 서명/누락을 DB 접속 전에 확인한다.
await journal.verifiedEntries(checkpoint);
const pool = new Pool({ connectionString: database });
try {
  const result = await reapplyAgentRevocationJournal(pool, journal, checkpoint);
  process.stdout.write(`AP restored revocations applied: ${result.applied}; entries: ${result.entries}\n`);
} finally { await pool.end(); }
