import { readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { createFieldInquiryMediaStore } from './inquiry-media.js';
import { FieldRetentionJournal } from './retention-journal.js';
import { verifyFieldRetentionJournal } from './retention-journal-integrity.js';
import { purgeExpiredInboundRecords, runFieldRetentionJobOnce } from './retention-purge.js';
import { assertProductionProfile } from './production-profile.js';
import { runOrganizationDeletionOnce } from './account-deletion.js';
import { createFieldSiteMediaStore } from './site-media.js';

assertProductionProfile();
const databaseUrl = process.env.FIELD_DATABASE_URL;
const directory = process.env.FIELD_RETENTION_JOURNAL_DIRECTORY;
const secret = process.env.FIELD_RETENTION_JOURNAL_SECRET;
const media = createFieldInquiryMediaStore();
// 조직 삭제 실행은 사이트 사진 저장소가 없으면 blocked_integration으로 남고 재시도한다.
const siteMedia = createFieldSiteMediaStore();
if (!databaseUrl || !directory || !secret || !media)
  throw new Error('Field retention requires its database, private media store and separate journal configuration');
const journal = new FieldRetentionJournal(directory, secret);
// First local setup creates the empty journal. Never recreate a lost existing journal.
await readdir(directory);
await journal.read();
const pool = new Pool({ connectionString: databaseUrl });
const controller = new AbortController();
// 짧은 보존 정리는 매 주기가 아니라 10분마다 한 번 실행한다.
const INBOUND_CLEANUP_INTERVAL_MS = 10 * 60_000;
let lastInboundCleanup = 0;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => controller.abort());
try {
  await pool.query('select 1 from field.work_retention_jobs limit 1');
  await verifyFieldRetentionJournal(pool,journal);
  process.stdout.write('field retention worker ready\n');
  do {
    try {
      // 유예가 끝난 조직 삭제 요청을 같은 주기에 하나씩 실행한다(문의·예약 원본은 아래 보존 작업이 정리).
      const deletion = await runOrganizationDeletionOnce({ pool, siteMedia });
      if (deletion !== 'empty') process.stdout.write(`field organization deletion: ${deletion}\n`);
      if (Date.now() - lastInboundCleanup >= INBOUND_CLEANUP_INTERVAL_MS) {
        const purged = await purgeExpiredInboundRecords(pool);
        lastInboundCleanup = Date.now();
        if (Object.values(purged).some(value => value > 0)) process.stdout.write(`field inbound cleanup: ${JSON.stringify(purged)}\n`);
      }
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
