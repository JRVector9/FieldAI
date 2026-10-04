import assert from 'node:assert/strict';
import { test } from 'node:test';

test('a busy or failed outbound queue still gives the inbox one turn every cycle', async () => {
  const { runFieldEventCycle } = await import('../src/field-event-cycle.js');
  const order: string[] = [], errors: unknown[] = [];
  const steps = [async () => { order.push('revoke'); return 'processed'; },
    async () => { order.push('outbox'); throw new Error('supplier unavailable'); },
    async () => { order.push('facts'); return 'empty'; }, async () => { order.push('inbox'); return 'processed'; }];
  for (let i = 0; i < 3; i++) assert.equal(await runFieldEventCycle(steps, () => false, error => errors.push(error)), true);
  assert.deepEqual(order, Array.from({ length: 3 }, () => ['revoke', 'outbox', 'facts', 'inbox']).flat());
  assert.equal(errors.length, 3);
  assert.equal(await runFieldEventCycle([async () => 'empty'], () => false, () => undefined), false);
});

test('shutdown stops before the next queue, even in a busy cycle', async () => {
  const { runFieldEventCycle } = await import('../src/field-event-cycle.js');
  let stopping = false, inbox = 0;
  assert.equal(await runFieldEventCycle([async () => { stopping = true; return 'processed'; }, async () => { inbox++; return 'processed'; }],
    () => stopping, () => undefined), true);
  assert.equal(inbox, 0);
});
