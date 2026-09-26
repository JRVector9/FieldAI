import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

const requested = process.argv.slice(2);
if (requested.some(product => product !== 'agent' && product !== 'field'))
  throw new Error('usage: node tools/setup-mock-env.mjs [agent] [field]');
for (const product of requested.length ? [...new Set(requested)] : ['agent', 'field']) {
  const path = resolve(`infra/${product}/.env`);
  const isAgent = product === 'agent';
  const upper = isAgent ? 'AP' : 'FIELD';
  if (!existsSync(path)) {
    const password = randomBytes(24).toString('base64url');
    const user = isAgent ? 'agent_local' : 'field_local';
    const port = isAgent ? 55431 : 55432;
    const db = `fieldai_${product}_mock`;
    writeFileSync(path, `${upper}_MOCK_DB_PASSWORD=${password}\n${upper}_DATABASE_URL=postgresql://${user}:${password}@127.0.0.1:${port}/${db}\n`, { mode: 0o600 });
    process.stdout.write(`Created infra/${product}/.env for synthetic local tests\n`);
  }
  const content = readFileSync(path, 'utf8');
  if (!content.includes(`${upper}_AUTH_SECRET=`)) {
    appendFileSync(path, `${upper}_AUTH_SECRET=${randomBytes(32).toString('base64url')}\n`, { mode: 0o600 });
  }
  if (!content.includes(`${upper}_AUTH_BASE_URL=`)) {
    appendFileSync(path, `${upper}_AUTH_BASE_URL=http://127.0.0.1:${isAgent ? 4311 : 4321}\n`, { mode: 0o600 });
  }
  if (!isAgent && !content.includes('FIELD_MOCK_VALKEY_PASSWORD=')) {
    const password = randomBytes(24).toString('base64url');
    appendFileSync(path, `FIELD_MOCK_VALKEY_PASSWORD=${password}\nFIELD_VALKEY_URL=valkey://:${password}@127.0.0.1:56332/0\n`, { mode: 0o600 });
  }
  if (!isAgent && !content.includes('FIELD_PUBLIC_WEB_ORIGIN=')) {
    appendFileSync(path, 'FIELD_PUBLIC_WEB_ORIGIN=http://127.0.0.1:3002\n', { mode: 0o600 });
  }
  if (!isAgent && !content.includes('FIELD_MEDIA_DIRECTORY=')) {
    appendFileSync(path, 'FIELD_MEDIA_DIRECTORY=infra/field/media\n', { mode: 0o600 });
  }
  if (!isAgent && !content.includes('FIELD_INQUIRY_MEDIA_DIRECTORY=')) {
    appendFileSync(path, 'FIELD_INQUIRY_MEDIA_DIRECTORY=infra/field/inquiry-media\n', { mode: 0o600 });
  }
  if (!isAgent && !content.includes('FIELD_RETENTION_JOURNAL_DIRECTORY=')) {
    appendFileSync(path, 'FIELD_RETENTION_JOURNAL_DIRECTORY=infra/field/retention-journal\n', { mode: 0o600 });
  }
  if (!isAgent && !content.includes('FIELD_RETENTION_JOURNAL_SECRET=')) {
    appendFileSync(path, `FIELD_RETENTION_JOURNAL_SECRET=${randomBytes(32).toString('base64url')}\n`, { mode: 0o600 });
  }
  if (!isAgent && !content.includes('FIELD_REVOCATION_JOURNAL_DIRECTORY=')) {
    appendFileSync(path, 'FIELD_REVOCATION_JOURNAL_DIRECTORY=infra/field/revocation-journal\n', { mode: 0o600 });
  }
  if (!isAgent && !content.includes('FIELD_REVOCATION_JOURNAL_SECRET=')) {
    appendFileSync(path, `FIELD_REVOCATION_JOURNAL_SECRET=${randomBytes(32).toString('base64url')}\n`, { mode: 0o600 });
  }
  if (isAgent && !content.includes('AP_INQUIRY_MEDIA_DIRECTORY=')) {
    appendFileSync(path, 'AP_INQUIRY_MEDIA_DIRECTORY=infra/agent/inquiry-media\n', { mode: 0o600 });
  }
}
