import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { link,mkdir,mkdtemp,rm,symlink,unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { S3Client } from '@aws-sdk/client-s3';
import { FieldFileMediaStore, FieldS3MediaStore, MediaPermissionError } from '../src/site-media.js';
import { createRestoredSiteMediaStore } from '../src/restored-site-media.js';

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

test('offline site media rejects overlapping roots, nested symlinks, file symlinks and hard links without touching active bytes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'field-media-confinement-')),active=join(root,'active'),restored=join(root,'restored');
  await mkdir(active);await mkdir(restored);const [org,file]=key.split('/'),activeStore=new FieldFileMediaStore(active);
  try {
    await activeStore.put(key,Buffer.from('ACTIVE'));
    await mkdir(join(active,'nested'));
    await assert.rejects(createRestoredSiteMediaStore(join(active,'nested'),active),/disjoint/);
    await assert.rejects(createRestoredSiteMediaStore(active,active),/disjoint/);
    const store=await createRestoredSiteMediaStore(restored,active);
    await symlink(join(active,org!),join(restored,org!),'dir');
    await assert.rejects(store.delete(key),/not confined/);await assert.rejects(store.exists!(key),/not confined/);
    await unlink(join(restored,org!));await mkdir(join(restored,org!));
    await symlink(join(active,org!,file!),join(restored,org!,file!));
    await assert.rejects(store.delete(key),/not confined/);await assert.rejects(store.get(key),/not confined/);
    await unlink(join(restored,org!,file!));await link(join(active,org!,file!),join(restored,org!,file!));
    await assert.rejects(store.delete(key),/not confined/);await assert.rejects(store.get(key),/not confined/);
    assert.deepEqual(await activeStore.get(key),Buffer.from('ACTIVE'));
    await unlink(join(restored,org!,file!));assert.equal(await store.exists!(key),false);await store.delete(key);
  }finally{await rm(root,{recursive:true,force:true});}
});
