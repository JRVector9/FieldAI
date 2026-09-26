import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { FieldSiteQueue } from '../src/site-queue.js';

process.loadEnvFile(resolve('../../infra/field/.env'));

test('Field Valkey queue holds one job ID, consumes it once, and rejects a wrong credential', async () => {
  const url = process.env.FIELD_VALKEY_URL;
  assert.ok(url);
  const namespace = `field:test:${randomUUID()}`;
  const queue = new FieldSiteQueue(url, namespace);
  const id = randomUUID();
  try {
    await queue.enqueue(id);
    await queue.enqueue(id);
    assert.equal(await queue.dequeue(1), id);
    assert.equal(await queue.dequeue(1), null);
  } finally { queue.close(); }
  const wrongUrl = new URL(url);
  wrongUrl.password = 'wrong-synthetic-credential';
  const wrong = new FieldSiteQueue(wrongUrl.toString(), `${namespace}:wrong`);
  try { await assert.rejects(() => wrong.enqueue(randomUUID())); }
  finally { wrong.close(); }
});
