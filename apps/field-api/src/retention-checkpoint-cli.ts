import { open, realpath } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { FieldRetentionJournal } from './retention-journal.js';

if (!process.argv.includes('--quiesced') || process.env.FIELD_PROFILE !== 'mock')
  throw new Error('local retention checkpoint export requires mock and explicit --quiesced after stopping journal writers');
const directory = process.env.FIELD_RETENTION_JOURNAL_DIRECTORY, secret = process.env.FIELD_RETENTION_JOURNAL_SECRET;
const output = process.env.FIELD_RETENTION_CHECKPOINT_OUTPUT;
if (!directory || !secret || !output) throw new Error('existing Field deletion journal/key and protected checkpoint output are required');
const root = await realpath(resolve(directory));
const destination = resolve(await realpath(dirname(resolve(output))), basename(output));
const pathFromJournal = relative(root,destination);
if (!pathFromJournal || (!pathFromJournal.startsWith('../') && pathFromJournal !== '..'))
  throw new Error('checkpoint must be stored outside the retention journal directory');
const data = await new FieldRetentionJournal(directory,secret).checkpoint();
const file = await open(destination,'wx',0o600);
try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
const parent = await open(dirname(destination),'r');
try { await parent.sync(); } finally { await parent.close(); }
process.stdout.write('Field retention checkpoint exported; protect it independently and use the latest quiesced export\n');
