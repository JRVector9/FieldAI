import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGracefulShutdown } from '../src/shutdown.js';

test('AP shutdown closes the app before pools, runs once and exits 0', async () => {
  const order: string[] = [];
  const exits: number[] = [];
  let releaseApp!: () => void;
  const shutdown = createGracefulShutdown({
    closeApp: () => new Promise<void>((resolve) => { order.push('app:start'); releaseApp = () => { order.push('app:end'); resolve(); }; }),
    closePools: [async () => { order.push('pool'); }, async () => { order.push('authPool'); }],
    exit: (code) => { exits.push(code); },
  });
  const first = shutdown();
  const second = shutdown();
  await new Promise((resolve) => setImmediate(resolve));
  // 처리 중 요청이 끝나기(app.close 완료) 전에는 풀을 닫지 않는다.
  assert.deepEqual(order, ['app:start']);
  releaseApp();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['app:start', 'app:end', 'pool', 'authPool']);
  assert.deepEqual(exits, [0]);
});

test('AP shutdown still closes pools and exits 1 when a step rejects', async () => {
  const closed: string[] = [];
  const errors: unknown[] = [];
  const exits: number[] = [];
  await createGracefulShutdown({
    closeApp: async () => { throw new Error('app close failed'); },
    closePools: [async () => { closed.push('pool'); throw new Error('pool end failed'); }, async () => { closed.push('authPool'); }],
    exit: (code) => { exits.push(code); },
    onError: (error) => { errors.push(error); },
  })();
  assert.deepEqual(closed, ['pool', 'authPool']);
  assert.equal(errors.length, 2);
  assert.deepEqual(exits, [1]);
});

test('AP shutdown exits 1 after the bounded timeout when a step hangs', async () => {
  const exited = new Promise<number>((resolve) => {
    void createGracefulShutdown({
      closeApp: () => new Promise(() => undefined),
      closePools: [],
      exit: resolve,
      timeoutMs: 20,
    })();
  });
  assert.equal(await exited, 1);
});
