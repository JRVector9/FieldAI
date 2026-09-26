import { Pool } from 'pg';
import { fromNodeHeaders } from 'better-auth/node';
import { createAgentApp } from '../src/app.js';
import { auth, authPool } from '../src/auth.js';

if (process.env.AP_PROFILE !== 'mock' || process.env.NODE_ENV === 'production')
  throw new Error('synthetic consultation fixture is allowed only in local mock tests');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
const app = createAgentApp(async () => { await pool.query('select 1'); }, auth.handler,
  process.env.AP_AUTH_BASE_URL, pool, {
    pool,
    resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    customerDailyLimit: 100,
    modelProvider: { model: 'synthetic-browser-fixture', async generate() {
      return { output: { answer: '상담 서비스를 안내합니다.', evidenceIds: ['service:0'],
        unknowns: [], handoffRecommended: false }, inputTokens: 32, outputTokens: 12,
      responseId: 'synthetic-browser-fixture' };
    } },
  });
await app.listen({ host: '127.0.0.1', port: 4311 });
process.stdout.write('synthetic AP consultation fixture listening on 4311\n');
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void Promise.all([app.close(), pool.end(), authPool.end()]).then(() => process.exit(0));
  });
}
