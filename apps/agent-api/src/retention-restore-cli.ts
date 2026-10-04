import { resolve } from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { Pool } from 'pg';
import { createAgentInquiryMediaStore } from './inquiry-media.js';
import { AgentRetentionJournal } from './retention-journal.js';
import { reapplyAgentRetentionJournal } from './retention-restore.js';
import { assertProductionProfile } from './production-profile.js';
import { accountDeletionJournalFromEnvironment } from './account-deletion-journal.js';
import { reapplyAccountDeletionJournal } from './account-deletion-restore.js';

assertProductionProfile();
if (!process.argv.includes('--offline-restored')) throw new Error('explicit --offline-restored is required before reapplying deletion records');
const database = process.env.AP_RETENTION_RESTORE_DATABASE_URL;
const directory = process.env.AP_RETENTION_JOURNAL_DIRECTORY;
const secret = process.env.AP_RETENTION_JOURNAL_SECRET;
const restoredMedia = process.env.AP_RETENTION_RESTORE_MEDIA_DIRECTORY;
const checkpointFile = process.env.AP_RETENTION_RESTORE_CHECKPOINT_FILE;
const accountCheckpointFile=process.env.AP_ACCOUNT_DELETION_RESTORE_CHECKPOINT_FILE;
if (!database || !directory || !secret || !restoredMedia || !process.env.AP_DATABASE_URL || !checkpointFile || !accountCheckpointFile)
  throw new Error('active AP database binding, separate restored database/media, existing journal and trusted checkpoint are required');
const restoredUrl = new URL(database), currentUrl = new URL(process.env.AP_DATABASE_URL);
// 로컬 복원은 다른 이름의 DB를 요구해 localhost/127.0.0.1·URL escape 별칭도 거부한다.
if (decodeURIComponent(restoredUrl.pathname) === decodeURIComponent(currentUrl.pathname))
  throw new Error('restore target must differ from the active AP database');
if (process.env.AP_PROFILE !== 'mock') throw new Error('this local restore command requires mock; operational restore credentials and approval are not configured');
const localAgent = (url: URL) => ['postgres:', 'postgresql:'].includes(url.protocol)
  && ['127.0.0.1','localhost'].includes(url.hostname) && url.port === '55431' && url.username === 'agent_local';
if (!localAgent(currentUrl) || !localAgent(restoredUrl) || !/^\/fieldai_agent_(mock|test_[a-f0-9]+)$/.test(currentUrl.pathname)
  || !/^\/fieldai_agent_restore_[a-f0-9]+$/.test(restoredUrl.pathname))
  throw new Error('retention restore requires local AP mock bindings and a separate fieldai_agent_restore database');
if (!process.env.AP_INQUIRY_MEDIA_DIRECTORY) throw new Error('active AP private media binding is required');
const activeMediaRoot = await realpath(resolve(process.env.AP_INQUIRY_MEDIA_DIRECTORY));
if (await realpath(resolve(restoredMedia)) === activeMediaRoot) throw new Error('restore private media must differ from the active AP private media directory');
process.env.AP_INQUIRY_MEDIA_DIRECTORY = restoredMedia;
const media = createAgentInquiryMediaStore()!, journal = new AgentRetentionJournal(directory, secret);
const checkpoint = await readFile(checkpointFile,'utf8');
await journal.verifiedEntries(checkpoint);
const accountJournal=accountDeletionJournalFromEnvironment()!;
const accountCheckpoint=await readFile(accountCheckpointFile,'utf8');
await accountJournal.verifiedEntries(accountCheckpoint);
const pool = new Pool({ connectionString: database });
try {
  const result = await reapplyAgentRetentionJournal({ pool, media, journal, checkpoint });
  const accountResult=await reapplyAccountDeletionJournal({pool,journal:accountJournal,checkpoint:accountCheckpoint});
  process.stdout.write(`AP restored account/organization deletions applied: ${accountResult.applied}; entries: ${accountResult.entries}\n`);
  process.stdout.write(`AP restored deletion journal applied: ${result.applied}; entries: ${result.entries}\n`);
} finally { await pool.end(); }
