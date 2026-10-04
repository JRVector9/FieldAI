import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

test('all AP offline CLIs reject every non-live production profile before database or filesystem work', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'agent-cli-profile-'));
  for (const [file, flag] of [
    ['oauth-lifecycle-cli.ts', '--baseline-quiesced'], ['revocation-checkpoint-cli.ts', '--quiesced'],
    ['revocation-restore-cli.ts', '--offline-restored'], ['retention-checkpoint-cli.ts', '--quiesced'],
    ['retention-restore-cli.ts', '--offline-restored'],
  ]) for (const profile of ['', 'mock', 'sandbox', 'livve']) {
    const env = { ...process.env, NODE_ENV: 'production', AP_PROFILE: profile,
      AP_DATABASE_URL: 'this is not a database URL', AP_REVOCATION_JOURNAL_DIRECTORY: resolve(root, 'revocations'),
      AP_RETENTION_JOURNAL_DIRECTORY: resolve(root, 'retention') };
    await assert.rejects(promisify(execFile)(process.execPath, ['--import', 'tsx', `src/${file}`, flag!], {
      cwd: resolve(import.meta.dirname, '..'), env }), /AP_PROFILE must be live in production/, `${file}: ${profile || 'unset'}`);
  }
  assert.deepEqual(await readdir(root), []);
});
