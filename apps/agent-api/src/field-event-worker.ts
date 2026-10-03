import { Pool } from 'pg';
import { processFieldEventInboxOnce } from './field-event-inbox.js';
import { fieldConnectorFromEnvironment } from './field-connector.js';
import { deliverFieldConnectionRevokeOnce } from './field-connection-revoke-worker.js';
import { deliverFieldAgentEventOnce } from './field-webhook-sender.js';
import { processFieldSourceRefreshOnce } from './source-refresh-worker.js';
import { processFieldFactsEventOnce } from './field-facts-events.js';
import { assertProductionProfile } from './production-profile.js';

assertProductionProfile();
if (!process.env.AP_DATABASE_URL) throw new Error('AP_DATABASE_URL is required');

const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
const fieldConnector = fieldConnectorFromEnvironment();
let stopping = false;
let wake: (() => void) | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  stopping = true;
  if (timer) clearTimeout(timer);
  wake?.();
});

try {
  while (!stopping) {
    try {
      if (fieldConnector && await deliverFieldConnectionRevokeOnce(pool, fieldConnector) !== 'empty') continue;
      if (fieldConnector && await deliverFieldAgentEventOnce(pool, fieldConnector) !== 'empty') continue;
      if (await processFieldFactsEventOnce(pool) !== 'empty') continue;
      if (fieldConnector && await processFieldSourceRefreshOnce({ pool,
        resolveUserId: async () => null, fieldConnector }) !== 'empty') continue;
      if (await processFieldEventInboxOnce(pool) !== 'empty') continue;
    } catch (error) {
      process.stderr.write(`AP Field event worker failed: ${String(error)}\n`);
    }
    if (!stopping) await new Promise<void>(resolve => {
      wake = resolve;
      timer = setTimeout(resolve, 2000);
    });
    wake = undefined;
    timer = undefined;
  }
} finally { await pool.end(); }
