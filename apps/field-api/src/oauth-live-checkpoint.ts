import { open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { Pool } from 'pg';
import { lifecycleJournalFromEnvironment } from './oauth-lifecycle-journal.js';
import { FieldRevocationJournal } from './revocation-journal.js';
import { withLiveBaselinePlan } from './oauth-live-baseline.js';

export async function exportLiveCheckpoint(kind:'lifecycle'|'revocation',args:string[]) {
  const mode=kind==='lifecycle'?'--checkpoint-quiesced':'--quiesced';
  const confirmed=args.find(a=>a.startsWith('--confirm-database='))?.slice('--confirm-database='.length);
  if(args.length!==4||new Set(args).size!==4||args[0]!==mode||!args.includes('--confirm-product=field')
    ||!args.includes('--confirm-writers-stopped')||!/^[a-f0-9]{64}$/.test(confirmed??''))
    throw new Error('live checkpoint requires --confirm-product=field --confirm-database=<fingerprint> --confirm-writers-stopped');
  const active=process.env.FIELD_DATABASE_URL,journal=lifecycleJournalFromEnvironment();
  const output=process.env[kind==='lifecycle'?'FIELD_OAUTH_LIFECYCLE_CHECKPOINT_OUTPUT':'FIELD_REVOCATION_CHECKPOINT_OUTPUT'];
  if(!active||!journal||!output||!isAbsolute(output))throw new Error('own database, existing journal/key and absolute protected checkpoint output required');
  const root=await realpath(resolve(process.env.FIELD_REVOCATION_JOURNAL_DIRECTORY!));await realpath(journal.root);
  const destination=resolve(await realpath(dirname(output)),basename(output)),subpath=relative(root,destination);
  if(!subpath||(!subpath.startsWith('../')&&subpath!=='..'))throw new Error('checkpoint output must be outside the journal');
  const native=new FieldRevocationJournal(root,process.env.FIELD_REVOCATION_JOURNAL_SECRET!);
  const pool=new Pool({connectionString:active,application_name:'field-oauth-checkpoint-cli',connectionTimeoutMillis:5000,max:1,
    options:'-c statement_timeout=15000 -c lock_timeout=1000'});
  try {await withLiveBaselinePlan(pool,journal,native,async plan=>{
    if(plan.databaseFingerprint!==confirmed)throw new Error('database confirmation mismatch');
    const data=await (kind==='lifecycle'?journal:native).checkpoint();
    const file=await open(destination,'wx',0o600);try{await file.writeFile(data);await file.sync();}finally{await file.close();}
    const directory=await open(dirname(destination),'r');try{await directory.sync();}finally{await directory.close();}
  });}finally{await pool.end();}
  process.stdout.write(`field ${kind} checkpoint exported; protect separately\n`);
}
