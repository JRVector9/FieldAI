import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { runIsolatedStep } from '../src/retention-purge.js';

test('a failing retention worker step is reported and does not stop the next steps', async () => {
  const failures: string[] = [];
  const ran: string[] = [];
  const onFailure = (name: string) => failures.push(name);
  // 조직 삭제 단계가 예외를 내도 사진 삭제·법정 보존 단계는 같은 주기에 실행된다.
  const deletion = await runIsolatedStep('organization deletion', async () => { ran.push('organization'); throw new Error('storage down'); }, onFailure);
  const assets = await runIsolatedStep('site asset deletion', async () => { ran.push('assets'); return { deleted: 1 }; }, onFailure);
  const retention = await runIsolatedStep('retention', async () => { ran.push('retention'); return 'completed' as const; }, onFailure);
  assert.equal(deletion, undefined);
  assert.deepEqual(assets, { deleted: 1 });
  assert.equal(retention, 'completed');
  assert.deepEqual(ran, ['organization', 'assets', 'retention']);
  assert.deepEqual(failures, ['organization deletion']);
});

test('the retention worker runs every step through its own isolated step', () => {
  const source = readFileSync(resolve('src', 'retention-purge-worker.ts'), 'utf8');
  for (const name of ['organization deletion', 'site asset deletion', 'inbound cleanup', 'retention'])
    assert.match(source, new RegExp(`step\\('${name}', `));
  // 한 try 블록이 모든 단계를 감싸던 구조로 되돌아가지 않게 한다.
  assert.doesNotMatch(source, /\n {4}try \{/);
});

test('S3 delete and existence checks carry an abort timeout', () => {
  const source = readFileSync(resolve('src', 'site-media.ts'), 'utf8');
  assert.match(source, /new DeleteObjectCommand\([^)]*\),\s*\{ abortSignal: AbortSignal\.timeout\(S3_DELETION_TIMEOUT_MS\) \}/);
  assert.match(source, /new HeadObjectCommand\([^)]*\),\s*\{ abortSignal: AbortSignal\.timeout\(S3_DELETION_TIMEOUT_MS\) \}/);
});
