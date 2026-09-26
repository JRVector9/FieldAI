import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify, parseEnv } from 'node:util';
import { test } from 'node:test';

test('first local setup initializes each journal but never recreates a lost keyed journal', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'retention-initialization-'));
  const script = resolve('tools/setup-mock-env.mjs');
  const run = () => promisify(execFile)(process.execPath, [script, 'agent', 'field'], { cwd: root });
  try {
    for (const product of ['agent', 'field']) await mkdir(resolve(root, 'infra', product), { recursive: true });
    await run();
    const keys = [];
    for (const [product, prefix] of [['agent', 'AP'], ['field', 'FIELD']]) {
      const env = parseEnv(await readFile(resolve(root, 'infra', product, '.env'), 'utf8'));
      keys.push(env[`${prefix}_RETENTION_JOURNAL_SECRET`]);
      assert.ok(keys.at(-1));
      assert.ok((await stat(resolve(root, env[`${prefix}_RETENTION_JOURNAL_DIRECTORY`]))).isDirectory());
      await rm(resolve(root, env[`${prefix}_RETENTION_JOURNAL_DIRECTORY`]), { recursive: true });
    }
    await run();
    for (const [index, product] of ['agent', 'field'].entries()) {
      const prefix = product === 'agent' ? 'AP' : 'FIELD';
      const env = parseEnv(await readFile(resolve(root, 'infra', product, '.env'), 'utf8'));
      assert.equal(env[`${prefix}_RETENTION_JOURNAL_SECRET`], keys[index]);
      await assert.rejects(stat(resolve(root, env[`${prefix}_RETENTION_JOURNAL_DIRECTORY`])), { code: 'ENOENT' });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
