import { readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { createAgentInquiryMediaStore } from './inquiry-media.js';
import { AgentRetentionJournal } from './retention-journal.js';
import { verifyAgentRetentionJournal } from './retention-journal-integrity.js';
import { purgeAgentEmailOutbox, runAgentRetentionJobOnce } from './retention-purge.js';
import { assertProductionProfile } from './production-profile.js';
import { purgeAccountDeletionPasswordWindows, runOrganizationDeletionOnce } from './account-deletion.js';
import { purgeBillingWebhookRecords } from './billing-webhook.js';
import { purgeAckedFieldAgentEvents } from './field-webhook-sender.js';

assertProductionProfile();
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
      // 유예가 끝난 조직 삭제 요청을 같은 주기에 하나씩 실행한다(문의·예약 원본은 아래 보존 작업이 정리).
      const deletion = await runOrganizationDeletionOnce({ pool });
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
      // AP→Field 서명 사건 발신함의 수신 확인 행은 30일 뒤 지운다
      const ackedEvents = await purgeAckedFieldAgentEvents(pool);
      if (ackedEvents) process.stdout.write(`agent field event outbox cleanup: deleted=${ackedEvents}\n`);
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
