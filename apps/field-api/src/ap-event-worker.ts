import { Pool } from 'pg';
import { apConnectorFromEnvironment } from './ap-connector.js';
import { deliverApEventOnce, reconcileApEventDeliveries } from './ap-event-delivery.js';
import { deliverApConnectionRevokeOnce } from './ap-connection-revoke.js';
import { createFieldInquiryMediaStore } from './inquiry-media.js';
import { copyExternalRequestAttachmentOnce } from './external-request-attachment-worker.js';
import { deliverFactsChangeOnce, reconcileFactsChangeDeliveries } from './facts-change-delivery.js';

if (process.env.NODE_ENV === 'production' && process.env.FIELD_PROFILE === 'mock')
  throw new Error('mock profile is forbidden in production');
if (!process.env.FIELD_DATABASE_URL) throw new Error('FIELD_DATABASE_URL is required');
const connector = apConnectorFromEnvironment();
if (!connector) throw new Error('Field AP connector configuration is required');

const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
const inquiryMedia = createFieldInquiryMediaStore();
let stopping = false;
let nextReconcileAt = 0;
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
      if (Date.now() >= nextReconcileAt) {
        await reconcileApEventDeliveries(pool);
        await reconcileFactsChangeDeliveries(pool);
        nextReconcileAt = Date.now() + 5000;
      }
      if (await deliverApConnectionRevokeOnce(pool, connector) !== 'empty') continue;
      if (await deliverFactsChangeOnce(pool, connector) !== 'empty') continue;
      if (await deliverApEventOnce(pool, connector) !== 'empty') continue;
      if (await copyExternalRequestAttachmentOnce(pool, connector, inquiryMedia) !== 'empty') continue;
    } catch (error) {
      process.stderr.write(`Field AP event worker failed: ${String(error)}\n`);
    }
    if (!stopping) await new Promise<void>(resolve => {
      wake = resolve;
      timer = setTimeout(resolve, 2000);
    });
    wake = undefined;
    timer = undefined;
  }
} finally { await pool.end(); }
