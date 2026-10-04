import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseEnv } from 'node:util';

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
  // AP도 sandbox 프로필 DB 테스트(auth-email-mfa·auth-kakao)가 웹 origin을 요구한다. 로컬 .env에는 손으로 넣었지만 CI가 새로 만드는 .env에는 없어서 실패했다(2026-10-04 CI 첫 실행).
  if (isAgent && !content.includes('AP_PUBLIC_WEB_ORIGIN=')) {
    appendFileSync(path, 'AP_PUBLIC_WEB_ORIGIN=http://localhost:3001\n', { mode: 0o600 });
  }
  if (!isAgent && !content.includes('FIELD_MEDIA_DIRECTORY=')) {
    appendFileSync(path, 'FIELD_MEDIA_DIRECTORY=infra/field/media\n', { mode: 0o600 });
  }
  if (!isAgent && !content.includes('FIELD_INQUIRY_MEDIA_DIRECTORY=')) {
    appendFileSync(path, 'FIELD_INQUIRY_MEDIA_DIRECTORY=infra/field/inquiry-media\n', { mode: 0o600 });
  }
  if (!isAgent && !content.includes('FIELD_RETENTION_JOURNAL_DIRECTORY=')) {
    appendFileSync(path, `FIELD_RETENTION_JOURNAL_DIRECTORY=${resolve('infra/field/retention-journal')}\n`, { mode: 0o600 });
  }
  function initializeFreshRetentionJournal() {
    const directory = parseEnv(readFileSync(path, 'utf8'))[`${upper}_RETENTION_JOURNAL_DIRECTORY`];
    if (!directory) throw new Error(`${upper} mock journal directory is required before first initialization`);
    const root = resolve(directory);
    if (existsSync(root) && readdirSync(root).length)
      throw new Error(`${upper} existing journal requires its original key; first setup cannot replace it`);
    mkdirSync(root, { recursive: true, mode: 0o700 });
    mkdirSync(resolve(root, 'account-deletion'), { mode: 0o700 });
  }
  if (!isAgent && !content.includes('FIELD_RETENTION_JOURNAL_SECRET=')) {
    initializeFreshRetentionJournal();
    appendFileSync(path, `FIELD_RETENTION_JOURNAL_SECRET=${randomBytes(32).toString('base64url')}\n`, { mode: 0o600 });
  }
  if (!isAgent && !content.includes('FIELD_REVOCATION_JOURNAL_DIRECTORY=')) {
    appendFileSync(path, `FIELD_REVOCATION_JOURNAL_DIRECTORY=${resolve('infra/field/revocation-journal')}\n`, { mode: 0o600 });
  }
  if (!isAgent && !content.includes('FIELD_REVOCATION_JOURNAL_SECRET=')) {
    // AP와 같이 회수 저널 디렉터리를 먼저 만든다. CI처럼 빈 checkout에서는 디렉터리가 없어 lifecycle CLI의 realpath가 ENOENT로 실패했다(2026-10-04 CI e2e).
    const directory = parseEnv(readFileSync(path, 'utf8')).FIELD_REVOCATION_JOURNAL_DIRECTORY;
    if (!directory) throw new Error('Field mock revocation directory is required before first initialization');
    const root = resolve(directory);
    if (existsSync(root) && readdirSync(root).length) throw new Error('Field existing revocation journal requires its original key');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    appendFileSync(path, `FIELD_REVOCATION_JOURNAL_SECRET=${randomBytes(32).toString('base64url')}\n`, { mode: 0o600 });
  }
  if (isAgent && !content.includes('AP_RETENTION_JOURNAL_DIRECTORY=')) {
    appendFileSync(path, `AP_RETENTION_JOURNAL_DIRECTORY=${resolve('infra/agent/retention-journal')}\n`, { mode: 0o600 });
  }
  if (isAgent && !content.includes('AP_RETENTION_JOURNAL_SECRET=')) {
    initializeFreshRetentionJournal();
    appendFileSync(path, `AP_RETENTION_JOURNAL_SECRET=${randomBytes(32).toString('base64url')}\n`, { mode: 0o600 });
  }
  if (isAgent && !content.includes('AP_REVOCATION_JOURNAL_DIRECTORY=')) {
    appendFileSync(path, `AP_REVOCATION_JOURNAL_DIRECTORY=${resolve('infra/agent/revocation-journal')}\n`, { mode: 0o600 });
  }
  if (isAgent) {
    const current = readFileSync(path, 'utf8');
    const directory = parseEnv(current).AP_REVOCATION_JOURNAL_DIRECTORY;
    if (directory && !isAbsolute(directory)) {
      writeFileSync(path, current.replace(/^AP_REVOCATION_JOURNAL_DIRECTORY=.*$/m,
        `AP_REVOCATION_JOURNAL_DIRECTORY=${resolve(directory)}`), { mode: 0o600 });
    }
  }
  if (isAgent && !content.includes('AP_REVOCATION_JOURNAL_SECRET=')) {
    const directory = parseEnv(readFileSync(path, 'utf8')).AP_REVOCATION_JOURNAL_DIRECTORY;
    if (!directory) throw new Error('AP mock revocation directory is required before first initialization');
    const root = resolve(directory);
    if (existsSync(root) && readdirSync(root).length) throw new Error('AP existing revocation journal requires its original key');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    appendFileSync(path, `AP_REVOCATION_JOURNAL_SECRET=${randomBytes(32).toString('base64url')}\n`, { mode: 0o600 });
  }
  if (isAgent && !content.includes('AP_INQUIRY_MEDIA_DIRECTORY=')) {
    appendFileSync(path, 'AP_INQUIRY_MEDIA_DIRECTORY=infra/agent/inquiry-media\n', { mode: 0o600 });
  }
  // Upgrade existing local settings without replacing keys or journal contents.
  for (const kind of ['RETENTION', 'REVOCATION']) {
    const name = `${upper}_${kind}_JOURNAL_DIRECTORY`;
    const current = readFileSync(path, 'utf8');
    const directory = parseEnv(current)[name];
    if (directory && !isAbsolute(directory)) writeFileSync(path,
      current.replace(new RegExp(`^${name}=.*$`, 'm'), `${name}=${resolve(directory)}`), { mode: 0o600 });
  }
}
