import { customDomainContextFromEnvironment } from './custom-domains.js';
import { notificationContextFromEnvironment } from './notification-context.js';
import { billingContextFromEnvironment } from './billing-context.js';
import { Pool } from 'pg';
import { fromNodeHeaders } from 'better-auth/node';
import { createFieldApp } from './app.js';
import { auth, authEmail, authPool } from './auth.js';
import { emailDeliveryState } from './email-provider.js';
import { createFieldOpenAIProvider } from './field-openai.js';
import { FieldSiteQueue } from './site-queue.js';
import { createFieldSiteMediaStore } from './site-media.js';
import { createFieldInquiryMediaStore } from './inquiry-media.js';
import { apConnectorFromEnvironment } from './ap-connector.js';
import { assertLifecycleServing, lifecycleJournalFromEnvironment } from './oauth-lifecycle-journal.js';
import { assertProductionProfile } from './production-profile.js';
import { createGracefulShutdown } from './shutdown.js';

assertProductionProfile();

const connectionString = process.env.FIELD_DATABASE_URL;
if (!connectionString) throw new Error('FIELD_DATABASE_URL is required');

const pool = new Pool({ connectionString });
const siteQueue = process.env.FIELD_VALKEY_URL ? new FieldSiteQueue(process.env.FIELD_VALKEY_URL) : undefined;
const runtime = {
  pool,
  billing: billingContextFromEnvironment(),
  notification: notificationContextFromEnvironment(),
  customDomain: customDomainContextFromEnvironment(),
  oauthLifecycleGuard: () => assertLifecycleServing(pool, lifecycleJournalFromEnvironment()),
  resolveUserId: async (headers: import('node:http').IncomingHttpHeaders) =>
    (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  resolveSession: async (headers: import('node:http').IncomingHttpHeaders) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    return session ? { id: session.session.id, userId: session.user.id } : null;
  },
  siteGenerator: createFieldOpenAIProvider(),
  siteQueue,
  siteMedia: createFieldSiteMediaStore(),
  inquiryMedia: createFieldInquiryMediaStore(),
  apConnector: apConnectorFromEnvironment(),
  emailDeliveryState: () => emailDeliveryState(authEmail.provider),
};
const app = createFieldApp(
  async () => { await pool.query('SELECT 1'); },
  auth.handler,
  process.env.FIELD_AUTH_BASE_URL,
  runtime,
);
const port = Number(process.env.FIELD_PORT ?? 4321);
const host = process.env.FIELD_HOST ?? '127.0.0.1';
app.addHook('onClose', async () => { siteQueue?.close(); });

try {
  await app.listen({ host, port });
  process.stdout.write(`field-api listening on ${host}:${port}\n`);
} catch (error) {
  await Promise.all([pool.end(), authPool.end()]);
  app.log.error(error);
  process.exitCode = 1;
}

const shutdown = createGracefulShutdown({
  closeApp: () => app.close(),
  closePools: [() => pool.end(), () => authPool.end()],
  onError: (error) => app.log.error(error),
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { void shutdown(); });
}
