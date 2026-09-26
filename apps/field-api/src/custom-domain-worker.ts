import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { customDomainContextFromEnvironment } from './custom-domains.js';
import { runCustomDomainOnce } from './custom-domain-execution.js';

if(process.env.NODE_ENV==='production'&&process.env.FIELD_PROFILE!=='live')throw new Error('Field domain worker requires live profile in production');
if(!process.env.FIELD_DATABASE_URL)throw new Error('Field domain worker requires its own database');
const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL}),context=customDomainContextFromEnvironment();
const controller=new AbortController();
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>controller.abort());
try{
  await pool.query('select hostname,generation from field.site_domains limit 1');
  process.stdout.write(`Field custom domain worker ready (${context.edge?'configured':'blocked_integration'})\n`);
  do{
    try{
      const result=await runCustomDomainOnce({pool,context});
      if(result!=='empty'||process.argv.includes('--once'))process.stdout.write(`Field custom domain: ${result}\n`);
      if(process.argv.includes('--once'))break;
      await delay(result==='empty'?5000:500,undefined,{signal:controller.signal});
    }catch{
      if(controller.signal.aborted)break;
      process.stderr.write('Field custom domain unavailable; verification remains incomplete\n');
      if(process.argv.includes('--once')){process.exitCode=1;break;}
      await delay(5000,undefined,{signal:controller.signal}).catch(()=>undefined);
    }
  }while(!controller.signal.aborted);
}finally{await pool.end();}
