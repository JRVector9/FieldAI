import { billingContextFromEnvironment } from './billing-context.js';
import { Pool } from 'pg';
import { fromNodeHeaders } from 'better-auth/node';
import { createAgentApp } from './app.js';
import { auth, authPool } from './auth.js';
import { createOpenAIProvider } from './openai.js';
import { createAgentInquiryMediaStore } from './inquiry-media.js';
import { agentRevocationJournalFromEnvironment } from './revocation-journal.js';
import { fieldConnectorFromEnvironment } from './field-connector.js';

if (process.env.NODE_ENV === 'production' && process.env.AP_PROFILE === 'mock') {
  throw new Error('mock profile is forbidden in production');
}

const connectionString = process.env.AP_DATABASE_URL;
if (!connectionString) throw new Error('AP_DATABASE_URL is required');

const pool = new Pool({ connectionString });
const revocationJournal = agentRevocationJournalFromEnvironment();
const app = createAgentApp(
  async () => { await pool.query('SELECT 1'); },
  auth.handler,
  process.env.AP_AUTH_BASE_URL,
  process.env.AP_PROFILE === 'mock' ? pool : undefined,
  {
    pool,
    billing: billingContextFromEnvironment(),
    revocationJournal,
    resolveUserId: async (headers) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    resolveSession: async (headers) => {
      const current = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
      return current ? { id: current.session.id, userId: current.user.id } : null;
    },
    modelProvider: createOpenAIProvider(),
    inquiryMedia: createAgentInquiryMediaStore(),
    fieldConnector: fieldConnectorFromEnvironment(),
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

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void Promise.all([app.close(), pool.end(), authPool.end()]).then(() => process.exit(0));
  });
}
