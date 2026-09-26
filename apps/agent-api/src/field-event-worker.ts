import { Pool } from 'pg';
import { processFieldEventInboxOnce } from './field-event-inbox.js';
import { fieldConnectorFromEnvironment } from './field-connector.js';
import { deliverFieldConnectionRevokeOnce } from './field-connection-revoke-worker.js';
import { processFieldSourceRefreshOnce } from './source-refresh-worker.js';
import { processFieldFactsEventOnce } from './field-facts-events.js';

if (process.env.NODE_ENV === 'production' && process.env.AP_PROFILE === 'mock')
  throw new Error('mock profile is forbidden in production');
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
