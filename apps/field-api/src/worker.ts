import { assertAccountDeletionServing } from './account-deletion-journal.js';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { createFieldOpenAIProvider } from './field-openai.js';
import { FieldSiteQueue } from './site-queue.js';
import { reconcileQueuedSiteJobs, runSiteGenerationJob } from './site-generation.js';
import { assertProductionProfile } from './production-profile.js';

assertProductionProfile();
const databaseUrl = process.env.FIELD_DATABASE_URL;
const queueUrl = process.env.FIELD_VALKEY_URL;
const siteGenerator = createFieldOpenAIProvider();
if (!databaseUrl || !queueUrl || !siteGenerator)
  throw new Error('FIELD_DATABASE_URL, FIELD_VALKEY_URL and Field model credentials are required');

const pool = new Pool({ connectionString: databaseUrl });
const siteQueue = new FieldSiteQueue(queueUrl);
const runtime = { pool, siteQueue, siteGenerator, resolveUserId: async () => null };
let stopping = false;
let reconciling = false;
const timer = setInterval(() => {
  if (reconciling || stopping) return;
  reconciling = true;
  void reconcileQueuedSiteJobs(runtime).catch(() => process.stderr.write('field generation queue reconciliation failed\n'))
    .finally(() => { reconciling = false; });
}, 5000);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { stopping = true; clearInterval(timer); siteQueue.close(); });
}

try {
  await reconcileQueuedSiteJobs(runtime);
  process.stdout.write('field site generation worker ready\n');
  while (!stopping) {
    await assertAccountDeletionServing(pool);
    try {
      const id = await siteQueue.dequeue(1);
      if (id) await runSiteGenerationJob(runtime, id);
    } catch {
      if (!stopping) {
        process.stderr.write('field generation queue unavailable; retrying\n');
        await delay(2000);
      }
    }
  }
} finally {
  clearInterval(timer);
  siteQueue.close();
  await pool.end();
}
