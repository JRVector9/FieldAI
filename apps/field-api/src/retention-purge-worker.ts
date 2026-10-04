import { assertAccountDeletionServing } from './account-deletion-journal.js';
import { readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { createFieldInquiryMediaStore } from './inquiry-media.js';
import { FieldRetentionJournal } from './retention-journal.js';
import { verifyFieldRetentionJournal } from './retention-journal-integrity.js';
import { purgeExpiredInboundRecords, purgeFieldEmailOutbox, purgeUnverifiedCredentialUsers, runFieldRetentionJobOnce,
  runIsolatedStep } from './retention-purge.js';
import { assertProductionProfile } from './production-profile.js';
import { runOrganizationDeletionOnce } from './account-deletion.js';
import { createFieldSiteMediaStore, runSiteAssetDeletionOnce } from './site-media.js';
import { fieldRevocationJournalFromEnvironment, journalDirectoryFromEnvironment } from './revocation-journal.js';

assertProductionProfile();
const databaseUrl = process.env.FIELD_DATABASE_URL;
if (!databaseUrl) throw new Error('Field retention worker requires FIELD_DATABASE_URL');
// M4: 문의 사진 저장소·보존 원장이 없어도 기동한다. 조직 삭제 실행·인증 메일 outbox 보존·짧은 창 정리는 항상 돌고,
// 사이트 사진 삭제는 사이트 사진 저장소가 있을 때만, 법정 보존(문의 사진·원장 필요)은 둘 다 있을 때만 돈다.
// 빠진 설정은 주기마다(10분) blocked_integration 한 줄로 알리며 완료를 주장하지 않는다.
const directory = journalDirectoryFromEnvironment('FIELD_RETENTION_JOURNAL_DIRECTORY');
const secret = process.env.FIELD_RETENTION_JOURNAL_SECRET;
const media = createFieldInquiryMediaStore();
const siteMedia = createFieldSiteMediaStore();
// 조직 삭제의 통합 grant 회수는 회수 원장이 있어야 실행한다(없으면 해당 요청만 blocked_integration).
const revocationJournal = fieldRevocationJournalFromEnvironment();
const journal = directory && secret ? new FieldRetentionJournal(directory, secret) : undefined;
if (journal && directory) {
  // First local setup creates the empty journal. Never recreate a lost existing journal.
  await readdir(directory);
  await journal.read();
}
const legalRetention = media && journal ? { media, journal } : undefined;
const pool = new Pool({ connectionString: databaseUrl });
const controller = new AbortController();
// 짧은 보존 정리는 매 주기가 아니라 10분마다 한 번 실행한다.
const INBOUND_CLEANUP_INTERVAL_MS = 10 * 60_000;
let lastInboundCleanup = 0;
let lastBlockedNotice = 0;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => controller.abort());
try {
  await pool.query('select 1 from field.work_retention_jobs limit 1');
  if (journal) await verifyFieldRetentionJournal(pool, journal);
  process.stdout.write('field retention worker ready\n');
  do {
    await assertAccountDeletionServing(pool);
    // 단계마다 예외를 따로 잡는다. 조직 삭제·사진 삭제·outbox 정리 중 하나가 실패해도 같은 주기의 다른 단계와 법정 보존 작업은 실행한다.
    let failed = false;
    const step = <T>(name: string, run: () => Promise<T>) => runIsolatedStep(name, run, failedStep => {
      failed = true;
      process.stderr.write(`field ${failedStep} unavailable; no completion claimed\n`);
    });
    const now = Date.now();
    if (now - lastBlockedNotice >= INBOUND_CLEANUP_INTERVAL_MS) {
      lastBlockedNotice = now;
      if (!siteMedia) process.stderr.write('field site asset deletion: blocked_integration (site media store not configured); skipped\n');
      if (!legalRetention) process.stderr.write('field retention: blocked_integration (inquiry media store or retention journal not configured); skipped\n');
    }
    // 유예가 끝난 조직 삭제 요청을 같은 주기에 하나씩 진행한다(문의·예약 원본은 아래 보존 작업이 정리).
    const deletion = await step('organization deletion', () => runOrganizationDeletionOnce({ pool, siteMedia, revocationJournal }));
    if (deletion !== undefined && deletion !== 'empty') process.stdout.write(`field organization deletion: ${deletion}\n`);
    // 사진 보관함 삭제 요청(state='deleting', 추가)의 저장소 삭제·부재 확인·행 삭제를 같은 주기에 제한된 묶음으로 처리한다.
    if (siteMedia) {
      const assetDeletion = await step('site asset deletion', () => runSiteAssetDeletionOnce({ pool, siteMedia }));
      if (assetDeletion && Object.values(assetDeletion).some(value => value > 0)) process.stdout.write(`field site asset deletion: ${JSON.stringify(assetDeletion)}\n`);
    }
    if (now - lastInboundCleanup >= INBOUND_CLEANUP_INTERVAL_MS) {
      // 인증 메일 outbox 익명화·삭제(추가)와 미인증 선점 계정 정리(비mock)도 같은 주기에 실행한다. 실패하면 다음 주기에 다시 시도한다.
      const purged = await step('inbound cleanup', async () => ({ ...await purgeExpiredInboundRecords(pool), ...await purgeFieldEmailOutbox(pool),
        ...process.env.FIELD_PROFILE === 'mock' ? {} : await purgeUnverifiedCredentialUsers(pool) }));
      if (purged) {
        lastInboundCleanup = now;
        if (Object.values(purged).some(value => value > 0)) process.stdout.write(`field inbound cleanup: ${JSON.stringify(purged)}\n`);
      }
    }
    // 법정 보존 설정이 없으면 건너뛴다(위 blocked_integration 알림). 이때는 다음 주기까지 쉰다.
    const result = legalRetention ? await step('retention', () => runFieldRetentionJobOnce({ pool, ...legalRetention })) : undefined;
    if (controller.signal.aborted) break;
    if (result !== undefined && (result !== 'empty' || process.argv.includes('--once'))) process.stdout.write(`field retention: ${result}\n`);
    if (process.argv.includes('--once')) { if (failed) process.exitCode = 1; break; }
    if (!legalRetention || failed || result === 'empty' || result === 'retry' || result === 'receipt_pending')
      await delay(2000, undefined, { signal: controller.signal }).catch(() => undefined);
  } while (!controller.signal.aborted);
} finally { await pool.end(); }
