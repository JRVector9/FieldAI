import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { FieldFileMediaStore } from '../src/site-media.js';

test('Field mock media survives store restart and cannot read outside its directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'field-media-test-'));
  const key = `${randomUUID()}/${randomUUID()}.webp`;
  const image = Buffer.from('synthetic webp store payload');
  try {
    const first = new FieldFileMediaStore(directory);
    await first.put(key, image);
    const restarted = new FieldFileMediaStore(directory);
    assert.deepEqual(await restarted.get(key), image);
    await assert.rejects(() => restarted.get('../agent/secret.webp'), /invalid Field media key/);
    await restarted.delete(key);
    assert.equal(await first.get(key), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
