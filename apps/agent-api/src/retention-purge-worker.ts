import { readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { createAgentInquiryMediaStore } from './inquiry-media.js';
import { AgentRetentionJournal } from './retention-journal.js';
import { verifyAgentRetentionJournal } from './retention-journal-integrity.js';
import { purgeAgentEmailOutbox, purgeUnverifiedCredentialUsers, runAgentRetentionJobOnce } from './retention-purge.js';
import { assertProductionProfile } from './production-profile.js';
import { purgeAccountDeletionPasswordWindows, runOrganizationDeletionOnce } from './account-deletion.js';
import { purgeBillingWebhookRecords } from './billing-webhook.js';
import { purgeAckedFieldAgentEvents } from './field-webhook-sender.js';
import { agentRevocationJournalFromEnvironment } from './revocation-journal.js';
import { accountDeletionJournalFromEnvironment, assertAccountDeletionServing } from './account-deletion-journal.js';

assertProductionProfile();
const databaseUrl = process.env.AP_DATABASE_URL;
if (!databaseUrl) throw new Error('AP retention worker requires AP_DATABASE_URL');
const directory = process.env.AP_RETENTION_JOURNAL_DIRECTORY;
const secret = process.env.AP_RETENTION_JOURNAL_SECRET;
// 저널 경로와 비밀값은 함께 있어야 한다. 하나만 있으면 설정 오류로 부팅을 거부한다
if (Boolean(directory) !== Boolean(secret))
  throw new Error('AP retention journal directory and secret must be configured together');
const media = createAgentInquiryMediaStore();
// 사진 저장소·보존 저널이 없어도 조직 삭제 실행·메일 outbox 보존·웹훅/시도 창 정리·수신 확인 사건 정리는 항상 돈다(추가, P1-2).
// 문의 원본·사진 보존 작업(media 의존)만 둘이 모두 설정됐을 때 실행하고, 아니면 blocked_integration으로 알린다.
const journal = directory && secret && media ? new AgentRetentionJournal(directory, secret) : undefined;
if (journal && directory) {
  // A lost existing journal is not a fresh service. Initial setup creates the empty directory.
  await readdir(directory);
  await journal.read();
}
// 조직 삭제 실행이 외부 통합 권한을 회수할 때 쓰는 회수 저널(API와 같은 설정). 없으면 회수가 필요한 삭제만 보류된다
const revocationJournal = agentRevocationJournalFromEnvironment();
const accountDeletionJournal = accountDeletionJournalFromEnvironment();
// media 의존 단계 미설정 안내는 이 간격에 한 번만 남긴다
const BLOCKED_LOG_INTERVAL_MS = 60 * 60_000;
let blockedLoggedAt = 0;
const once = process.argv.includes('--once');
const pool = new Pool({ connectionString: databaseUrl });
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => controller.abort());
try {
  await pool.query('select 1 from ap.work_retention_jobs limit 1');
  if (journal) await verifyAgentRetentionJournal(pool, journal);
  await assertAccountDeletionServing(pool,accountDeletionJournal);
  process.stdout.write(`agent retention worker ready (media retention: ${journal ? 'configured' : 'blocked_integration'})\n`);
  do {
    try {
      // 유예가 끝난 조직 삭제 요청을 같은 주기에 하나씩 실행한다(문의·예약 원본은 아래 보존 작업이 정리).
      await assertAccountDeletionServing(pool,accountDeletionJournal);
      const deletion = await runOrganizationDeletionOnce({ pool, revocationJournal,accountDeletionJournal });
      if (deletion !== 'empty') process.stdout.write(`agent organization deletion: ${deletion}\n`);
      // 토스 웹훅 수신 기록(30일)·만료된 IP 창과 계정 삭제 비밀번호 시도 창을 같은 주기에 정리한다.
      const webhook = await purgeBillingWebhookRecords(pool);
      const passwordWindows = await purgeAccountDeletionPasswordWindows(pool);
      if (webhook.events || webhook.windows || passwordWindows)
        process.stdout.write(`agent webhook/attempt cleanup: events=${webhook.events} windows=${webhook.windows} passwordWindows=${passwordWindows}\n`);
      // 인증 메일 outbox 보존 규칙(retention-purge.ts 주석)을 같은 주기에 적용한다.
      const emailOutbox = await purgeAgentEmailOutbox(pool);
      if (emailOutbox.anonymized || emailOutbox.deleted)
        process.stdout.write(`agent email outbox cleanup: anonymized=${emailOutbox.anonymized} deleted=${emailOutbox.deleted}\n`);
      // 48시간 넘게 인증하지 않은 비밀번호 전용·무소속 계정을 지운다(주소 선점 방지). mock은 메일 인증을 요구하지 않으므로 제외한다
      if (process.env.AP_PROFILE !== 'mock') {
        const unverified = await purgeUnverifiedCredentialUsers(pool);
        if (unverified) process.stdout.write(`agent unverified account cleanup: deleted=${unverified}\n`);
      }
      // AP→Field 서명 사건 발신함의 수신 확인·차단 행은 30일 뒤 지운다
      const ackedEvents = await purgeAckedFieldAgentEvents(pool);
      if (ackedEvents) process.stdout.write(`agent field event outbox cleanup: deleted=${ackedEvents}\n`);
      let result: Awaited<ReturnType<typeof runAgentRetentionJobOnce>> | 'blocked_integration' = 'blocked_integration';
      if (journal && media) {
        result = await runAgentRetentionJobOnce({ pool, media, journal });
        if (result !== 'empty' || once) process.stdout.write(`agent retention: ${result}\n`);
      } else if (once || Date.now() - blockedLoggedAt >= BLOCKED_LOG_INTERVAL_MS) {
        blockedLoggedAt = Date.now();
        process.stdout.write('agent retention: media retention blocked_integration (private media store or retention journal not configured)\n');
      }
      if (once) break;
      if (result === 'empty' || result === 'retry' || result === 'receipt_pending' || result === 'blocked_integration')
        await delay(2000, undefined, { signal: controller.signal });
    } catch {
      if (controller.signal.aborted) break;
      process.stderr.write('agent retention unavailable; no completion claimed\n');
      if (once) { process.exitCode = 1; break; }
      await delay(2000, undefined, { signal: controller.signal }).catch(() => undefined);
    }
  } while (!controller.signal.aborted);
} finally { await pool.end(); }
