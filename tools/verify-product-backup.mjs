import { verifyProductBackup } from './product-backup-lib.mjs';

const [product, directory, ...rest] = process.argv.slice(2);
if ((product !== 'agent' && product !== 'field') || !directory || rest.length)
  throw new Error('usage: node tools/verify-product-backup.mjs agent|field /absolute/backup-directory');
const result = await verifyProductBackup({ product, directory });
process.stdout.write(JSON.stringify({ status: 'passed', ...result }) + '\n');
