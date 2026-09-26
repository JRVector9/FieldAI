import { resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { Pool } from 'pg';
import { createFieldInquiryMediaStore } from './inquiry-media.js';
import { FieldRetentionJournal } from './retention-journal.js';
import { reapplyFieldRetentionJournal } from './retention-restore.js';

if (!process.argv.includes('--offline-restored')) throw new Error('explicit --offline-restored is required before reapplying deletion records');
const database = process.env.FIELD_RETENTION_RESTORE_DATABASE_URL;
const directory = process.env.FIELD_RETENTION_JOURNAL_DIRECTORY;
const secret = process.env.FIELD_RETENTION_JOURNAL_SECRET;
const restoredMedia = process.env.FIELD_RETENTION_RESTORE_MEDIA_DIRECTORY;
if (!database || !directory || !secret || !restoredMedia || !process.env.FIELD_DATABASE_URL) throw new Error('active Field database binding, separate restored database/media and existing journal are required');
const restoredUrl = new URL(database), currentUrl = new URL(process.env.FIELD_DATABASE_URL);
// 로컬 복원은 다른 이름의 DB를 요구해 localhost/127.0.0.1·URL escape 별칭도 거부한다.
if (decodeURIComponent(restoredUrl.pathname) === decodeURIComponent(currentUrl.pathname))
  throw new Error('restore target must differ from the active Field database');
if (process.env.FIELD_PROFILE !== 'mock') throw new Error('this local restore command requires mock; operational restore credentials and approval are not configured');
if (!process.env.FIELD_INQUIRY_MEDIA_DIRECTORY) throw new Error('active Field private media binding is required');
const activeMediaRoot = await realpath(resolve(process.env.FIELD_INQUIRY_MEDIA_DIRECTORY));
if (await realpath(resolve(restoredMedia)) === activeMediaRoot) throw new Error('restore private media must differ from the active Field private media directory');
process.env.FIELD_INQUIRY_MEDIA_DIRECTORY = restoredMedia;
const media = createFieldInquiryMediaStore()!, journal = new FieldRetentionJournal(directory, secret);
const pool = new Pool({ connectionString: database });
try {
  const result = await reapplyFieldRetentionJournal({ pool, media, journal });
  process.stdout.write(`Field restored deletion journal applied: ${result.applied}; entries: ${result.entries}\n`);
} finally { await pool.end(); }
