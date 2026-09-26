import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { createProductBackup, verifyProductBackup } from '../product-backup-lib.mjs';

const run = promisify(execFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function docker(...args) {
  return (await run('docker', args, { maxBuffer: 1024 * 1024 })).stdout.trim();
}

async function fixture(t, product) {
  const directory = await mkdtemp(join(tmpdir(), `fieldai-backup-${product}-`));
  const container = `fieldai-backup-source-${randomUUID().slice(0, 12)}`;
  t.after(async () => {
    await docker('stop', container).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  });
  await docker('run', '-d', '--rm', '--network', 'none', '--name', container,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17.11');
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await docker('exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres');
      ready = true;
      break;
    } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(ready, 'fixture PostgreSQL 17 should become ready');
  await docker('exec', container, 'createdb', '-U', 'postgres', 'source');
  const orgId = randomUUID();
  const refs = (product === 'field' ? ['inquiry', 'inquiry', 'site'] : ['inquiry'])
    .map((store, index) => {
      const key = `${orgId}/${randomUUID()}.webp`;
      const bytes = Buffer.from(`synthetic ${product} ${store} ${index}`);
      return { store, key, bytes, sha256: sha256(bytes), byteSize: bytes.length };
    });
  const roots = { inquiry: join(directory, 'inquiry'), site: join(directory, 'site') };
  for (const ref of refs) {
    const path = join(roots[ref.store], ref.key);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, ref.bytes);
  }
  const common = product === 'agent'
    ? 'create schema ap; create table ap.organizations(id text); create table ap.inquiries(id text);'
      + 'create table ap.inquiry_attachments(object_key text,sha256 text,byte_size integer,state text);'
      + `insert into ap.organizations values ('${orgId}'); insert into ap.inquiries values ('one');`
      + `insert into ap.inquiry_attachments values ('${refs[0].key}','${refs[0].sha256}',${refs[0].byteSize},'ready');`
    : 'create schema field; create table field.organizations(id text); create table field.inquiries(id text);'
      + 'create table field.reservations(id text);'
      + 'create table field.inquiry_attachments(object_key text,sha256 text,byte_size integer,state text);'
      + 'create table field.external_request_attachments(object_key text,sha256 text,byte_size integer,state text);'
      + 'create table field.site_assets(object_key text,sha256 text,byte_size integer,state text);'
      + `insert into field.organizations values ('${orgId}'); insert into field.inquiries values ('one');`
      + `insert into field.reservations values ('one');`
      + `insert into field.inquiry_attachments values ('${refs[0].key}','${refs[0].sha256}',${refs[0].byteSize},'ready');`
      + `insert into field.external_request_attachments values ('${refs[1].key}','${refs[1].sha256}',${refs[1].byteSize},'copied');`
      + `insert into field.site_assets values ('${refs[2].key}','${refs[2].sha256}',${refs[2].byteSize},'ready');`;
  await docker('exec', container, 'psql', '-U', 'postgres', '-d', 'source',
    '-v', 'ON_ERROR_STOP=1', '-c', common);
  return { directory, container, roots, refs };
}

for (const product of ['agent', 'field']) {
  test(`${product} backup restores only its own PostgreSQL 17 schema and referenced media`, async t => {
    const source = await fixture(t, product);
    const output = join(source.directory, 'complete');
    const manifest = await createProductBackup({ product, sourceContainer: source.container,
      database: 'source', user: 'postgres', mediaRoots: source.roots, output });
    assert.equal(manifest.product, product);
    assert.equal(manifest.snapshot.organizationCount, 1);
    assert.equal(manifest.snapshot.inquiryCount, 1);
    assert.equal(manifest.snapshot.media.length, source.refs.length);
    assert.equal((await verifyProductBackup({ product, directory: output })).mediaCount,
      source.refs.length);
    await assert.rejects(verifyProductBackup({ product: product === 'agent' ? 'field' : 'agent',
      directory: output }), /product or version/);
    const first = source.refs[0];
    await writeFile(join(output, 'media', first.store, first.key), 'corrupted');
    await assert.rejects(verifyProductBackup({ product, directory: output }), /media_unavailable/);
    await writeFile(join(output, 'media', first.store, first.key), first.bytes);
    const dump = await readFile(join(output, 'database.dump'));
    dump[0] ^= 1;
    await writeFile(join(output, 'database.dump'), dump);
    await assert.rejects(verifyProductBackup({ product, directory: output }), /database dump SHA-256 mismatch/);
    assert.ok((await stat(join(output, 'manifest.json'))).isFile());
    assert.ok((await readFile(join(output, 'database.dump'))).length > 0);
  });

  test(`${product} missing source media leaves no completed backup`, async t => {
    const source = await fixture(t, product);
    await rm(join(source.roots[source.refs[0].store], source.refs[0].key));
    const output = join(source.directory, 'incomplete');
    await assert.rejects(createProductBackup({ product, sourceContainer: source.container,
      database: 'source', user: 'postgres', mediaRoots: source.roots, output }), /ENOENT|media_unavailable/);
    await assert.rejects(stat(output), /ENOENT/);
  });

  test(`${product} rejects a source database from the other product`, async t => {
    const other = product === 'agent' ? 'field' : 'agent';
    const source = await fixture(t, other);
    const output = join(source.directory, 'wrong-product');
    await assert.rejects(createProductBackup({ product, sourceContainer: source.container,
      database: 'source', user: 'postgres', mediaRoots: source.roots, output }), /exited 1|does not contain/);
    await assert.rejects(stat(output), /ENOENT/);
  });

  test(`${product} rejects media symlinks outside its file root`, async t => {
    const source = await fixture(t, product);
    const first = source.refs[0];
    const original = join(source.roots[first.store], first.key);
    const external = join(source.directory, 'outside.webp');
    await writeFile(external, first.bytes);
    await rm(original);
    await symlink(external, original);
    const output = join(source.directory, 'symlink');
    await assert.rejects(createProductBackup({ product, sourceContainer: source.container,
      database: 'source', user: 'postgres', mediaRoots: source.roots, output }), /media path escapes/);
    await assert.rejects(stat(output), /ENOENT/);
  });
}
