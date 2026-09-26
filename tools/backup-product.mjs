import { resolve } from 'node:path';
import { createProductBackup } from './product-backup-lib.mjs';

const [product, output, ...rest] = process.argv.slice(2);
if ((product !== 'agent' && product !== 'field') || !output || rest.length)
  throw new Error('usage: node tools/backup-product.mjs agent|field /absolute/new/output-directory');
process.loadEnvFile(resolve(`infra/${product}/.env`));
const field = product === 'field';
const profile = process.env[field ? 'FIELD_PROFILE' : 'AP_PROFILE'];
if (profile && profile !== 'mock')
  throw new Error('this backup command only supports the local mock profile');
const inquiryRoot = process.env[field ? 'FIELD_INQUIRY_MEDIA_DIRECTORY'
  : 'AP_INQUIRY_MEDIA_DIRECTORY'];
const siteRoot = field ? process.env.FIELD_MEDIA_DIRECTORY : undefined;
if (!inquiryRoot || (field && !siteRoot)) throw new Error('product media directory is not configured');
const manifest = await createProductBackup({ product,
  sourceContainer: `fieldai-${product}-mock-db-1`,
  database: field ? 'fieldai_field_mock' : 'fieldai_agent_mock',
  user: field ? 'field_local' : 'agent_local',
  mediaRoots: { inquiry: resolve(inquiryRoot),
    ...(field ? { site: resolve(siteRoot) } : {}) },
  output });
process.stdout.write(`${manifest.product} backup created: ${output}\n`);
