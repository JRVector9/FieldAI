import { open, realpath } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { AgentRetentionJournal } from './retention-journal.js';
import { assertProductionProfile } from './production-profile.js';
import { accountDeletionJournalFromEnvironment } from './account-deletion-journal.js';

assertProductionProfile();
if (!process.argv.includes('--quiesced') || process.env.AP_PROFILE !== 'mock')
  throw new Error('local retention checkpoint export requires mock and explicit --quiesced after stopping journal writers');
const directory = process.env.AP_RETENTION_JOURNAL_DIRECTORY, secret = process.env.AP_RETENTION_JOURNAL_SECRET;
const output = process.env.AP_RETENTION_CHECKPOINT_OUTPUT;
const accountOutput=process.env.AP_ACCOUNT_DELETION_CHECKPOINT_OUTPUT;
if (!directory || !secret || !output || !accountOutput) throw new Error('existing AP deletion journal/key and both protected checkpoint outputs are required');
const root = await realpath(resolve(directory));
const destination = resolve(await realpath(dirname(resolve(output))), basename(output));
const pathFromJournal = relative(root,destination);
if (!pathFromJournal || (!pathFromJournal.startsWith('../') && pathFromJournal !== '..'))
  throw new Error('checkpoint must be stored outside the retention journal directory');
const data = await new AgentRetentionJournal(directory,secret).checkpoint();
const accountJournal=accountDeletionJournalFromEnvironment()!;
const accountData=await accountJournal.checkpoint();
const accountDestination=resolve(await realpath(dirname(resolve(accountOutput))),basename(accountOutput));
const accountPath=relative(root,accountDestination);
if(!accountPath||(!accountPath.startsWith('../')&&accountPath!=='..')||accountDestination===destination)
  throw new Error('account deletion checkpoint must be protected outside the retention journal separately');
const file = await open(destination,'wx',0o600);
try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
const parent = await open(dirname(destination),'r');
try { await parent.sync(); } finally { await parent.close(); }
const accountFile=await open(accountDestination,'wx',0o600);
try{await accountFile.writeFile(accountData);await accountFile.sync();}finally{await accountFile.close();}
const accountParent=await open(dirname(accountDestination),'r');
try{await accountParent.sync();}finally{await accountParent.close();}
process.stdout.write('AP retention checkpoint exported; protect it independently and use the latest quiesced export\n');
