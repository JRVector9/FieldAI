import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { S3Client } from '@aws-sdk/client-s3';
import { FieldFileMediaStore, FieldS3MediaStore, MediaPermissionError } from '../src/site-media.js';

const key = `${randomUUID()}/${randomUUID()}.webp`;
// S3 오류 형태만 흉내 내는 최소 client. 실제 공급사 호출은 하지 않는다.
const client = (outcome: 'present' | 'not_found' | 'forbidden' | 'other') => ({
  send: async (command: { constructor: { name: string } }) => {
    assert.equal(command.constructor.name, 'HeadObjectCommand');
    if (outcome === 'present') return {};
    const status = outcome === 'not_found' ? 404 : outcome === 'forbidden' ? 403 : 500;
    throw Object.assign(new Error(outcome), { name: outcome === 'not_found' ? 'NotFound' : outcome === 'forbidden' ? 'Forbidden' : 'InternalError',
      $metadata: { httpStatusCode: status } });
  },
}) as unknown as S3Client;

test('Field S3 media existence uses HeadObject: 404 is absent, 403 is a terminal media_permission error', async () => {
  assert.equal(await new FieldS3MediaStore(client('present'), 'bucket').exists(key), true);
  assert.equal(await new FieldS3MediaStore(client('not_found'), 'bucket').exists(key), false);
  await assert.rejects(new FieldS3MediaStore(client('forbidden'), 'bucket').exists(key),
    (error: unknown) => error instanceof MediaPermissionError && error.code === 'media_permission');
  await assert.rejects(new FieldS3MediaStore(client('other'), 'bucket').exists(key),
    (error: unknown) => !(error instanceof MediaPermissionError));
  await assert.rejects(new FieldS3MediaStore(client('present'), 'bucket').exists('../escape.webp'), /invalid Field media key/);
});

test('Field local media store confirms deletion by absence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'field-media-'));
  try {
    const store = new FieldFileMediaStore(root);
    await store.put(key, Buffer.from('image'));
    assert.deepEqual(await store.get(key), Buffer.from('image'));
    await store.delete(key);
    assert.equal(await store.get(key), null);
    await store.delete(key);
  } finally { await rm(root, { recursive: true, force: true }); }
});
