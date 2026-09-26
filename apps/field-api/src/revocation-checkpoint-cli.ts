import { open, realpath } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fieldRevocationJournalFromEnvironment } from './revocation-journal.js';

if (!process.argv.includes('--quiesced') || process.env.FIELD_PROFILE !== 'mock')
  throw new Error('local checkpoint export requires mock and explicit --quiesced after stopping journal writers');
const journal = fieldRevocationJournalFromEnvironment(), output = process.env.FIELD_REVOCATION_CHECKPOINT_OUTPUT;
if (!journal || !output) throw new Error('existing Field journal/key and protected checkpoint output are required');
const root = await realpath(resolve(process.env.FIELD_REVOCATION_JOURNAL_DIRECTORY!));
const destination = resolve(await realpath(dirname(resolve(output))), basename(output));
const pathFromJournal = relative(root, destination);
if (!pathFromJournal || (!pathFromJournal.startsWith('../') && pathFromJournal !== '..'))
  throw new Error('checkpoint must be stored outside the revocation journal directory');
const data = await journal.checkpoint();
const file = await open(destination, 'wx', 0o600);
try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
const directory = await open(dirname(destination), 'r');
try { await directory.sync(); } finally { await directory.close(); }
process.stdout.write('Field revocation checkpoint exported; protect it independently and use the latest quiesced export\n');
