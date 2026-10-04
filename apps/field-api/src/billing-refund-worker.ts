import { assertAccountDeletionServing } from './account-deletion-journal.js';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { billingContextFromEnvironment } from './billing-context.js';
import { runBillingRefundOnce } from './billing-refund-execution.js';

if(process.env.NODE_ENV==='production'&&process.env.FIELD_PROFILE!=='live')throw new Error('Field billing requires live profile in production');
if(!process.env.FIELD_DATABASE_URL)throw new Error('Field billing requires its own database');
const billing=billingContextFromEnvironment(),pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL});
const controller=new AbortController();
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>controller.abort());
try {
  await pool.query('select provider_mid,claim_token from field.billing_refunds limit 1');
  process.stdout.write(`Field billing refund worker ready (${billing?billing.provider.mode:'blocked_integration'})\n`);
  do {
    await assertAccountDeletionServing(pool);
    try {
      const result=await runBillingRefundOnce({pool,billing});
      if(result!=='empty'||process.argv.includes('--once'))process.stdout.write(`Field billing refund: ${result}\n`);
      if(process.argv.includes('--once'))break;
      await delay(2000,undefined,{signal:controller.signal});
    } catch {
      if(controller.signal.aborted)break;
      process.stderr.write('Field billing refund unavailable; no refund claimed\n');
      if(process.argv.includes('--once')){process.exitCode=1;break;}
      await delay(2000,undefined,{signal:controller.signal}).catch(()=>undefined);
    }
  }while(!controller.signal.aborted);
}finally{await pool.end();}
