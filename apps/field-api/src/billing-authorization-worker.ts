import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { billingContextFromEnvironment } from './billing-context.js';
import { runBillingAuthorizationOnce } from './billing-authorization-execution.js';

if (process.env.NODE_ENV === 'production' && process.env.FIELD_PROFILE !== 'live')
  throw new Error('Field billing requires live profile in production');
if (!process.env.FIELD_DATABASE_URL) throw new Error('Field billing requires its own database');
const billing = billingContextFromEnvironment();
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
const controller = new AbortController();
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,() => controller.abort());
try {
  await pool.query('select claim_token,next_attempt_at from field.billing_authorizations limit 1');
  process.stdout.write(`Field billing authorization worker ready (${billing ? billing.provider.mode : 'blocked_integration'})\n`);
  do {
    try {
      const result = await runBillingAuthorizationOnce({ pool,billing });
      if (result !== 'empty' || process.argv.includes('--once')) process.stdout.write(`Field billing authorization: ${result}\n`);
      if (process.argv.includes('--once')) break;
      await delay(2000,undefined,{ signal:controller.signal });
    } catch {
      if (controller.signal.aborted) break;
      process.stderr.write('Field billing authorization unavailable; no success claimed\n');
      if (process.argv.includes('--once')) { process.exitCode=1; break; }
      await delay(2000,undefined,{ signal:controller.signal }).catch(() => undefined);
    }
  } while (!controller.signal.aborted);
} finally { await pool.end(); }
