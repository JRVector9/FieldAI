import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';

const image = 'postgres:17.11';
const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;
const shaPattern = /^[0-9a-f]{64}$/;

const queries = {
  agent: `select json_build_object(
    'organizationCount',(select count(*) from ap.organizations),
    'inquiryCount',(select count(*) from ap.inquiries),
    'media',coalesce((select json_agg(row_to_json(ref) order by ref.store,ref.key)
      from (select 'inquiry'::text as store,object_key as key,sha256,
        byte_size as "byteSize" from ap.inquiry_attachments where state='ready') ref),'[]'::json)
  ) from pg_namespace where nspname='ap'
    and not exists (select 1 from pg_namespace where nspname='field')`,
  field: `select json_build_object(
    'organizationCount',(select count(*) from field.organizations),
    'inquiryCount',(select count(*) from field.inquiries),
    'reservationCount',(select count(*) from field.reservations),
    'media',coalesce((select json_agg(row_to_json(ref) order by ref.store,ref.key)
      from (select 'inquiry'::text as store,object_key as key,sha256,
          byte_size as "byteSize" from field.inquiry_attachments where state='ready'
        union all select 'inquiry',object_key,sha256,byte_size
          from field.external_request_attachments where state='copied'
        union all select 'site',object_key,sha256,byte_size
          from field.site_assets where state='ready') ref),'[]'::json)
  ) from pg_namespace where nspname='field'
    and not exists (select 1 from pg_namespace where nspname='ap')`,
};

function child(file, args, stdoutFile) {
  return new Promise((resolveChild, rejectChild) => {
    const process = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let stream;
    let processDone = false;
    let streamDone = !stdoutFile;
    const complete = () => {
      if (processDone && streamDone)
        resolveChild(stdoutFile ? '' : Buffer.concat(chunks).toString('utf8').trim());
    };
    if (stdoutFile) {
      stream = createWriteStream(stdoutFile, { flags: 'wx', mode: 0o600 });
      stream.once('finish', () => { streamDone = true; complete(); });
      stream.once('error', error => { process.kill(); rejectChild(error); });
      process.stdout.pipe(stream);
    } else process.stdout.on('data', chunk => chunks.push(chunk));
    let stderr = '';
    process.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
    process.once('error', rejectChild);
    process.once('close', code => {
      if (code !== 0) { rejectChild(new Error(`${file} exited ${code}: ${stderr.trim()}`)); return; }
      processDone = true;
      complete();
    });
  });
}

async function digest(path) {
  const sha = createHash('sha256');
  for await (const chunk of createReadStream(path)) sha.update(chunk);
  return sha.digest('hex');
}

function validRef(ref, product) {
  return ref && typeof ref === 'object'
    && (ref.store === 'inquiry' || (product === 'field' && ref.store === 'site'))
    && typeof ref.key === 'string' && keyPattern.test(ref.key)
    && typeof ref.sha256 === 'string' && shaPattern.test(ref.sha256)
    && Number.isSafeInteger(ref.byteSize) && ref.byteSize > 0 && ref.byteSize <= 4 * 1024 * 1024;
}

function cleanRefs(refs, product) {
  if (!Array.isArray(refs) || refs.some(ref => !validRef(ref, product)))
    throw new Error('backup contains an invalid media reference');
  const unique = new Set(refs.map(ref => `${ref.store}/${ref.key}`));
  if (unique.size !== refs.length) throw new Error('backup contains duplicate media references');
  return refs.toSorted((a, b) => `${a.store}/${a.key}`.localeCompare(`${b.store}/${b.key}`));
}

async function restoredSnapshot(dumpPath, product) {
  const name = `fieldai-restore-${randomUUID().slice(0, 12)}`;
  let started = false;
  try {
    await child('docker', ['run', '-d', '--rm', '--network', 'none', '--name', name,
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
    started = true;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await child('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
        ready = true;
        break;
      } catch { await new Promise(resolveDelay => setTimeout(resolveDelay, 100)); }
    }
    if (!ready) throw new Error('isolated PostgreSQL 17 did not become ready');
    await child('docker', ['cp', dumpPath, `${name}:/tmp/database.dump`]);
    await child('docker', ['exec', name, 'createdb', '-U', 'postgres', 'restorecheck']);
    await child('docker', ['exec', name, 'pg_restore', '-U', 'postgres', '-d', 'restorecheck',
      '--exit-on-error', '--no-owner', '--no-acl', '/tmp/database.dump']);
    const version = Number(await child('docker', ['exec', name, 'psql', '-U', 'postgres',
      '-d', 'restorecheck', '-At', '-c', 'show server_version_num']));
    if (version < 170000 || version >= 180000) throw new Error('restore is not PostgreSQL 17');
    const result = await child('docker', ['exec', name, 'psql', '-U', 'postgres',
      '-d', 'restorecheck', '-At', '-v', 'ON_ERROR_STOP=1', '-c', queries[product]]);
    if (!result) throw new Error(`restored database does not contain only ${product} product schema`);
    const summary = JSON.parse(result);
    return { ...summary, media: cleanRefs(summary.media, product) };
  } finally {
    if (started) await child('docker', ['stop', name]).catch(() => undefined);
  }
}

function mediaPath(root, ref) {
  const path = resolve(root, ref.key);
  if (!path.startsWith(resolve(root) + sep)) throw new Error('media path escapes product root');
  return path;
}

async function verifiedMediaFile(path, ref) {
  const info = await stat(path);
  if (!info.isFile() || info.size !== ref.byteSize || await digest(path) !== ref.sha256)
    throw new Error(`media_unavailable: ${ref.store}/${ref.key}`);
}

export async function createProductBackup({ product, sourceContainer, database, user, mediaRoots, output }) {
  if (!queries[product]) throw new Error('product must be agent or field');
  if (!isAbsolute(output) || resolve(output) === '/' || !sourceContainer || !database || !user)
    throw new Error('absolute output and source container/database/user are required');
  let created = false;
  try {
    await mkdir(output, { mode: 0o700 });
    created = true;
    const dumpPath = join(output, 'database.dump');
    await child('docker', ['exec', sourceContainer, 'pg_dump', '-U', user, '-d', database,
      '-Fc', '--no-owner', '--no-acl'], dumpPath);
    const snapshot = await restoredSnapshot(dumpPath, product);
    for (const ref of snapshot.media) {
      const root = mediaRoots[ref.store];
      if (!root) throw new Error(`missing ${product} ${ref.store} media root`);
      const source = mediaPath(root, ref);
      if (!(await realpath(source)).startsWith((await realpath(root)) + sep))
        throw new Error('media path escapes product root');
      await verifiedMediaFile(source, ref);
      const destination = join(output, 'media', ref.store, ref.key);
      await mkdir(resolve(destination, '..'), { recursive: true, mode: 0o700 });
      await writeFile(destination, await readFile(source), { flag: 'wx', mode: 0o600 });
      await verifiedMediaFile(destination, ref);
    }
    const manifest = { formatVersion: 'fieldai-product-backup.v1', product,
      createdAt: new Date().toISOString(), postgresMajor: 17, snapshot,
      dumpSha256: await digest(dumpPath) };
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 });
    return manifest;
  } catch (error) {
    if (created) await rm(output, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyProductBackup({ product, directory }) {
  if (!queries[product]) throw new Error('product must be agent or field');
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.formatVersion !== 'fieldai-product-backup.v1' || manifest.product !== product
      || manifest.postgresMajor !== 17 || !shaPattern.test(manifest.dumpSha256))
    throw new Error('backup manifest product or version does not match');
  const dumpPath = join(directory, 'database.dump');
  if (await digest(dumpPath) !== manifest.dumpSha256) throw new Error('database dump SHA-256 mismatch');
  const restored = await restoredSnapshot(dumpPath, product);
  if (JSON.stringify(restored) !== JSON.stringify(manifest.snapshot))
    throw new Error('restored database differs from backup manifest');
  for (const ref of restored.media)
    await verifiedMediaFile(join(directory, 'media', ref.store, ref.key), ref);
  return { product, organizationCount: restored.organizationCount,
    inquiryCount: restored.inquiryCount, reservationCount: restored.reservationCount ?? null,
    mediaCount: restored.media.length };
}
