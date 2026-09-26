import { Pool } from 'pg';
import { lifecycleJournalFromEnvironment } from './oauth-lifecycle-journal.js';
import { finalizeApRouteKeyRequestsOnce } from './ap-route-key-lifecycle.js';

if(!process.env.FIELD_DATABASE_URL)throw new Error('FIELD_DATABASE_URL is required');
if(process.env.NODE_ENV==='production'&&process.env.FIELD_PROFILE==='mock')throw new Error('mock profile is forbidden in production');
const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL}),journal=lifecycleJournalFromEnvironment();
let stopping=false,wake:(()=>void)|undefined,timer:ReturnType<typeof setTimeout>|undefined;
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{stopping=true;if(timer)clearTimeout(timer);wake?.();});
try{
  if(journal)await journal.initialize(pool);
  process.stdout.write(`Field route-key worker ready (${journal?'local_reconciliation':'blocked_integration'})\n`);
  while(!stopping){
    try{if(journal)await finalizeApRouteKeyRequestsOnce(pool,journal);}
    catch{process.stderr.write('Field route-key reconciliation failed; keys remain protected by the durable proof\n');}
    if(!stopping)await new Promise<void>(resolve=>{wake=resolve;timer=setTimeout(resolve,2000);});
    wake=undefined;timer=undefined;
  }
}finally{await pool.end();}
