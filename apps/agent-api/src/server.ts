import { notificationContextFromEnvironment } from './notification-context.js';
import { billingContextFromEnvironment } from './billing-context.js';
import { Pool } from 'pg';
import { fromNodeHeaders } from 'better-auth/node';
import { createAgentApp } from './app.js';
import { auth, authEmail, authPool } from './auth.js';
import { emailDeliveryState } from './email-provider.js';
import { createOpenAIProvider } from './openai.js';
import { createAgentInquiryMediaStore } from './inquiry-media.js';
import { agentRevocationJournalFromEnvironment } from './revocation-journal.js';
import { assertLifecycleServing, lifecycleJournalFromEnvironment } from './oauth-lifecycle-journal.js';
import { fieldConnectorFromEnvironment } from './field-connector.js';
import { assertProductionProfile } from './production-profile.js';
import { createGracefulShutdown } from './shutdown.js';
import { accountDeletionJournalFromEnvironment, assertAccountDeletionServing } from './account-deletion-journal.js';

assertProductionProfile();

const connectionString = process.env.AP_DATABASE_URL;
if (!connectionString) throw new Error('AP_DATABASE_URL is required');

const pool = new Pool({ connectionString });
const revocationJournal = agentRevocationJournalFromEnvironment();
const accountDeletionJournal = accountDeletionJournalFromEnvironment();
await assertAccountDeletionServing(pool,accountDeletionJournal);
const app = createAgentApp(
  async () => { await pool.query('SELECT 1'); },
  auth.handler,
  process.env.AP_AUTH_BASE_URL,
  process.env.AP_PROFILE === 'mock' ? pool : undefined,
  {
    pool,
    billing: billingContextFromEnvironment(),
    notification: notificationContextFromEnvironment(),
    revocationJournal,
    accountDeletionJournal,
    accountDeletionGuard:()=>assertAccountDeletionServing(pool,accountDeletionJournal),
    oauthLifecycleGuard: () => assertLifecycleServing(pool, lifecycleJournalFromEnvironment()),
    resolveUserId: async (headers) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    resolveSession: async (headers) => {
      const current = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
      return current ? { id: current.session.id, userId: current.user.id } : null;
    },
    modelProvider: createOpenAIProvider(),
    inquiryMedia: createAgentInquiryMediaStore(),
    fieldConnector: fieldConnectorFromEnvironment(),
    emailDeliveryState: () => emailDeliveryState(authEmail.provider),
  },
);
app.addHook('onClose', async () => { revocationJournal?.close(); });
const port = Number(process.env.AP_PORT ?? 4311);
const host = process.env.AP_HOST ?? '127.0.0.1';

try {
  await app.listen({ host, port });
  process.stdout.write(`agent-api listening on ${host}:${port}\n`);
} catch (error) {
  await Promise.all([pool.end(), authPool.end()]);
  app.log.error(error);
  process.exitCode = 1;
}

// 종료 순서는 Field와 같다: 앱을 먼저 닫아 처리 중 요청을 마친 뒤 풀을 닫고, 반복 신호는 한 번만, 최대 10초 안에 끝낸다(추가)
const shutdown = createGracefulShutdown({
  closeApp: () => app.close(),
  closePools: [() => pool.end(), () => authPool.end()],
  onError: (error) => app.log.error(error),
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { void shutdown(); });
}
