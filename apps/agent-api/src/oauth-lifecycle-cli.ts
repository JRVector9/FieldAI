import { open, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { Pool } from 'pg';
import { lifecycleJournalFromEnvironment } from './oauth-lifecycle-journal.js';
import { baselineLifecycle, reapplyLifecycleJournal } from './oauth-lifecycle-restore.js';
import { AgentRevocationJournal } from './revocation-journal.js';

const mode=process.argv[2];
if(process.argv.length!==3||!['--baseline-quiesced','--checkpoint-quiesced','--offline-restored'].includes(mode??'')||process.env.AP_PROFILE!=='mock')
  throw new Error('local lifecycle CLI requires mock and an explicit quiesced/offline mode');
const active=process.env.AP_DATABASE_URL;
if(!active)throw new Error('explicit own active database binding required');
const current=new URL(active);
const own=(url:URL)=>['postgres:','postgresql:'].includes(url.protocol)&&['127.0.0.1','localhost'].includes(url.hostname)&&url.port==='55431'&&url.username==='agent_local';
if(!own(current)||!/^\/fieldai_agent_(mock|test_[a-f0-9]+)$/.test(current.pathname))throw new Error('own local agent database required');
const journal=lifecycleJournalFromEnvironment();if(!journal)throw new Error('existing own journal/key required');
const root=await realpath(resolve(process.env.AP_REVOCATION_JOURNAL_DIRECTORY!));
const native=new AgentRevocationJournal(root,process.env.AP_REVOCATION_JOURNAL_SECRET!);
if(mode==='--offline-restored'){
  const target=process.env.AP_OAUTH_LIFECYCLE_RESTORE_DATABASE_URL,file=process.env.AP_OAUTH_LIFECYCLE_CHECKPOINT_FILE;
  if(!target||!file)throw new Error('separate restored database and latest protected checkpoint required');
  const restored=new URL(target);
  if(!own(restored)||!/^\/fieldai_agent_restore_[a-f0-9]+$/.test(restored.pathname)||decodeURIComponent(restored.pathname)===decodeURIComponent(current.pathname))throw new Error('separate own local restore database required');
  const checkpointPath=await realpath(resolve(file)),subpath=relative(root,checkpointPath);
  if(!subpath||(!subpath.startsWith('../')&&subpath!=='..'))throw new Error('restore checkpoint must be protected outside the journal');
  const checkpoint=await readFile(checkpointPath,'utf8');await journal.verifiedEntries(checkpoint);
  const pool=new Pool({connectionString:target});try{const result=await reapplyLifecycleJournal(pool,journal,checkpoint);process.stdout.write(`agent lifecycle restore entries: ${result.entries}\n`);}finally{await pool.end();}
}else{
  const pool=new Pool({connectionString:active});let data:string|undefined;
  try{await journal.initialize(pool);
    if(mode==='--baseline-quiesced'){await baselineLifecycle(pool,journal,native);process.stdout.write('agent legacy lifecycle baseline recorded; export both native and lifecycle latest checkpoints\n');}
    else data=await journal.checkpoint();
  }finally{await pool.end();}
  if(data){
    const output=process.env.AP_OAUTH_LIFECYCLE_CHECKPOINT_OUTPUT;if(!output)throw new Error('protected checkpoint output required');
    const destination=resolve(await realpath(dirname(resolve(output))),basename(output)),subpath=relative(root,destination);
    if(!subpath||(!subpath.startsWith('../')&&subpath!=='..'))throw new Error('checkpoint output must be outside the journal');
    const file=await open(destination,'wx',0o600);try{await file.writeFile(data);await file.sync();}finally{await file.close();}
    const directory=await open(dirname(destination),'r');try{await directory.sync();}finally{await directory.close();}
    process.stdout.write('agent lifecycle checkpoint exported; protect separately\n');
  }
}
