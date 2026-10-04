import { open, realpath } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { Pool } from 'pg';
import { verifyAgentRevocationJournal, agentRevocationJournalFromEnvironment } from './revocation-journal.js';
import { lifecycleJournalFromEnvironment } from './oauth-lifecycle-journal.js';
import { liveCheckpointConfirmation, readLiveCheckpoint } from './oauth-live-baseline.js';
import { assertProductionProfile } from './production-profile.js';

assertProductionProfile();
const live=process.env.AP_PROFILE==='live';
const confirmation=live?liveCheckpointConfirmation(process.argv.slice(3)):undefined;
if (process.argv[2]!=='--quiesced' || (!live&&process.env.AP_PROFILE !== 'mock'))
  throw new Error('local checkpoint export requires mock and explicit --quiesced after stopping journal writers');
const journal = agentRevocationJournalFromEnvironment(), output = process.env.AP_REVOCATION_CHECKPOINT_OUTPUT;
if (!journal || !output) throw new Error('existing AP journal/key and protected checkpoint output are required');
const root = await realpath(resolve(process.env.AP_REVOCATION_JOURNAL_DIRECTORY!));
const destination = resolve(await realpath(dirname(resolve(output))), basename(output));
const pathFromJournal = relative(root, destination);
if (!pathFromJournal || (!pathFromJournal.startsWith('../') && pathFromJournal !== '..'))
  throw new Error('checkpoint must be stored outside the revocation journal directory');
const active = process.env.AP_DATABASE_URL;
if (!active) throw new Error('active AP database binding is required for journal continuity');
const url = new URL(active);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!live&&(!['127.0.0.1','localhost'].includes(url.hostname)
  || url.port !== '55431' || url.username !== 'agent_local' || !/^\/fieldai_agent_(mock|test_[a-f0-9]+)$/.test(url.pathname))))
  throw new Error('checkpoint export requires a local AP mock binding');
const pool = new Pool({ connectionString: active });
let data: string;
try {
  if(live){
    const lifecycle=lifecycleJournalFromEnvironment();if(!lifecycle)throw new Error('existing lifecycle journal/key required');
    await realpath(lifecycle.root);
    await readLiveCheckpoint(pool,lifecycle,journal,confirmation!,async()=>{
      await writeCheckpoint(await journal.checkpoint());
    });
  }else{
  const db = await pool.connect();
  try {
    const namespaces = (await db.query("select nspname from pg_namespace where nspname in ('ap','field')")).rows.map(r => r.nspname);
    if (!namespaces.includes('ap') || namespaces.includes('field')) throw new Error('checkpoint requires an isolated AP database');
    await verifyAgentRevocationJournal(db, journal);
    data = await journal.checkpoint();
  } finally { db.release(); }
  }
} finally { await pool.end(); }
if(!live)await writeCheckpoint(data!);
process.stdout.write('AP revocation checkpoint exported; protect it independently and use the latest quiesced export\n');

async function writeCheckpoint(value:string){
  const file = await open(destination, 'wx', 0o600);
  try { await file.writeFile(value); await file.sync(); } finally { await file.close(); }
  const directory = await open(dirname(destination), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
