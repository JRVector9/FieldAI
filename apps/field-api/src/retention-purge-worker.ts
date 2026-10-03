import { readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { createFieldInquiryMediaStore } from './inquiry-media.js';
import { FieldRetentionJournal } from './retention-journal.js';
import { verifyFieldRetentionJournal } from './retention-journal-integrity.js';
import { purgeExpiredInboundRecords, purgeFieldEmailOutbox, runFieldRetentionJobOnce, runIsolatedStep } from './retention-purge.js';
import { assertProductionProfile } from './production-profile.js';
import { runOrganizationDeletionOnce } from './account-deletion.js';
import { createFieldSiteMediaStore, runSiteAssetDeletionOnce } from './site-media.js';

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
    // 단계마다 예외를 따로 잡는다. 조직 삭제·사진 삭제·outbox 정리 중 하나가 실패해도 같은 주기의 다른 단계와 법정 보존 작업은 실행한다.
    let failed = false;
    const step = <T>(name: string, run: () => Promise<T>) => runIsolatedStep(name, run, failedStep => {
      failed = true;
      process.stderr.write(`field ${failedStep} unavailable; no completion claimed\n`);
    });
    // 유예가 끝난 조직 삭제 요청을 같은 주기에 하나씩 실행한다(문의·예약 원본은 아래 보존 작업이 정리).
    const deletion = await step('organization deletion', () => runOrganizationDeletionOnce({ pool, siteMedia }));
    if (deletion !== undefined && deletion !== 'empty') process.stdout.write(`field organization deletion: ${deletion}\n`);
    // 사진 보관함 삭제 요청(state='deleting', 추가)의 저장소 삭제·부재 확인·행 삭제를 같은 주기에 제한된 묶음으로 처리한다.
    const assetDeletion = await step('site asset deletion', () => runSiteAssetDeletionOnce({ pool, siteMedia }));
    if (assetDeletion && Object.values(assetDeletion).some(value => value > 0)) process.stdout.write(`field site asset deletion: ${JSON.stringify(assetDeletion)}\n`);
    if (Date.now() - lastInboundCleanup >= INBOUND_CLEANUP_INTERVAL_MS) {
      // 인증 메일 outbox 익명화·삭제(추가)도 같은 주기에 실행한다. 실패하면 다음 주기에 다시 시도한다.
      const purged = await step('inbound cleanup', async () => ({ ...await purgeExpiredInboundRecords(pool), ...await purgeFieldEmailOutbox(pool) }));
      if (purged) {
        lastInboundCleanup = Date.now();
        if (Object.values(purged).some(value => value > 0)) process.stdout.write(`field inbound cleanup: ${JSON.stringify(purged)}\n`);
      }
    }
    const result = await step('retention', () => runFieldRetentionJobOnce({ pool, media, journal }));
    if (controller.signal.aborted) break;
    if (result !== undefined && (result !== 'empty' || process.argv.includes('--once'))) process.stdout.write(`field retention: ${result}\n`);
    if (process.argv.includes('--once')) { if (failed) process.exitCode = 1; break; }
    if (failed || result === 'empty' || result === 'retry' || result === 'receipt_pending')
      await delay(2000, undefined, { signal: controller.signal }).catch(() => undefined);
  } while (!controller.signal.aborted);
} finally { await pool.end(); }
