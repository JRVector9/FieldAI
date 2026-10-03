import { Pool } from 'pg';
import { processFieldEventInboxOnce, type FieldRouteCache } from './field-event-inbox.js';
import { fieldConnectorFromEnvironment } from './field-connector.js';
import { deliverFieldConnectionRevokeOnce } from './field-connection-revoke-worker.js';
import { deliverFieldAgentEventOnce } from './field-webhook-sender.js';
import { processFieldSourceRefreshOnce } from './source-refresh-worker.js';
import { processFieldFactsEventOnce } from './field-facts-events.js';
import { assertProductionProfile } from './production-profile.js';
import { apToFieldSignatureSendVersion } from './field-signature.js';

assertProductionProfile();
if (!process.env.AP_DATABASE_URL) throw new Error('AP_DATABASE_URL is required');

// 잘못된 발신 서명 버전 설정은 여기서 부팅을 멈춘다. 시작 로그에 발신 버전을 남긴다
process.stdout.write(`AP Field event signature send version: ${apToFieldSignatureSendVersion()}\n`);
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
const fieldConnector = fieldConnectorFromEnvironment();
// 같은 예약의 Field 알림 경로 조회를 짧게(항목별 10초) 재사용한다. 큐가 비거나 처리 중 예외가 나면 모두 버린다
const inboxRouteCache: FieldRouteCache = new Map();
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
      if (await processFieldEventInboxOnce(pool, fieldConnector, inboxRouteCache) !== 'empty') continue;
      inboxRouteCache.clear();
    } catch (error) {
      inboxRouteCache.clear();
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
