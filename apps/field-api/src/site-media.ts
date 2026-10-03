import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'pg';
import sharp from 'sharp';

export type FieldSiteMediaStore = {
  put: (key: string, data: Buffer) => Promise<void>;
  get: (key: string) => Promise<Buffer | null>;
  delete: (key: string) => Promise<void>;
  // 삭제 확인용 존재 검사(선택). 없으면 호출자는 get으로 부재를 확인한다.
  exists?: (key: string) => Promise<boolean>;
};

// 저장소 권한 부족으로 존재 여부를 판정할 수 없는 경우. 재시도로 풀리지 않으므로 호출자는 차단 상태로 멈춘다.
export class MediaPermissionError extends Error {
  readonly code = 'media_permission';
  constructor() { super('media_permission'); this.name = 'MediaPermissionError'; }
}

const objectKeyPattern = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;
const maxInputBytes = 8 * 1024 * 1024;
// 설치된 sharp(libheif)는 AVIF만 해독하고 아이폰 HEIC(HEVC)는 해독하지 못한다.
// ISO BMFF ftyp 상자의 브랜드로 HEIC를 알아내 일반 실패 대신 형식 미지원 사유를 돌려준다.
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs']);
export function isHeicImage(input: unknown) {
  if (!Buffer.isBuffer(input) || input.length < 16 || input.toString('latin1', 4, 8) !== 'ftyp') return false;
  const boxEnd = Math.min(input.readUInt32BE(0), input.length, 256);
  if (HEIC_BRANDS.has(input.toString('latin1', 8, 12))) return true;
  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) if (HEIC_BRANDS.has(input.toString('latin1', offset, offset + 4))) return true;
  return false;
}
export function unsupportedImageError(input: unknown) {
  return isHeicImage(input) ? { error: 'unsupported_image_format', hint: 'heic_unsupported' } : { error: 'unsupported_image' };
}
export async function normalizeSiteImage(input: Buffer) {
  if (!input.length || input.length > maxInputBytes) return null;
  try {
    const decoder = sharp(input, { limitInputPixels: 25_000_000, failOn: 'error', animated: false });
    const metadata = await decoder.metadata();
    if (!['jpeg', 'png', 'webp', 'heif'].includes(metadata.format)
        || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) return null;
    const { data, info } = await decoder.rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
    if (!data.length || data.length > 4 * 1024 * 1024) return null;
    return { data, width: info.width, height: info.height };
  } catch { return null; }
}

export class FieldFileMediaStore implements FieldSiteMediaStore {
  constructor(private readonly root: string) {}
  private path(key: string) {
    if (!objectKeyPattern.test(key)) throw new Error('invalid Field media key');
    return resolve(this.root, key);
  }
  async put(key: string, data: Buffer) {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, data, { mode: 0o600 });
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
  async get(key: string) {
    try { return await readFile(this.path(key)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async delete(key: string) {
    try { await unlink(this.path(key)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

// 삭제 작업자의 저장소 삭제·존재 확인 호출 제한 시간. 응답이 없는 호출이 작업 임대(5분)를 넘기지 않게 한다.
const S3_DELETION_TIMEOUT_MS = 30_000;
export class FieldS3MediaStore implements FieldSiteMediaStore {
  constructor(private readonly client: S3Client, private readonly bucket: string) {}
  async put(key: string, data: Buffer) {
    if (!objectKeyPattern.test(key)) throw new Error('invalid Field media key');
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: 'image/webp' }));
  }
  async get(key: string) {
    if (!objectKeyPattern.test(key)) throw new Error('invalid Field media key');
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return response.Body ? Buffer.from(await response.Body.transformToByteArray()) : null;
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null;
      throw error;
    }
  }
  async delete(key: string) {
    if (!objectKeyPattern.test(key)) throw new Error('invalid Field media key');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(S3_DELETION_TIMEOUT_MS) });
  }
  // HeadObject로 존재 여부만 확인한다. 404(NotFound/NoSuchKey)는 부재다.
  // S3는 s3:ListBucket 권한이 없으면 없는 키에도 404 대신 403을 돌려주므로, 삭제 확인에는 ListBucket 권한이 필요하다.
  // 403은 부재로 간주하지 않고 MediaPermissionError(media_permission)로 올려 무한 재시도 대신 차단 상태로 멈추게 한다.
  async exists(key: string) {
    if (!objectKeyPattern.test(key)) throw new Error('invalid Field media key');
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(S3_DELETION_TIMEOUT_MS) });
      return true;
    } catch (error) {
      const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (failure.name === 'NotFound' || failure.name === 'NoSuchKey' || failure.$metadata?.httpStatusCode === 404) return false;
      if (failure.name === 'Forbidden' || failure.name === 'AccessDenied' || failure.$metadata?.httpStatusCode === 403)
        throw new MediaPermissionError();
      throw error;
    }
  }
}

export function createFieldSiteMediaStore(): FieldSiteMediaStore | undefined {
  if (process.env.FIELD_PROFILE === 'mock') {
    if (!process.env.FIELD_MEDIA_DIRECTORY) return undefined;
    return new FieldFileMediaStore(resolve(process.env.FIELD_MEDIA_DIRECTORY));
  }
  const { FIELD_S3_BUCKET: bucket, FIELD_S3_REGION: region, FIELD_S3_ACCESS_KEY_ID: accessKeyId,
    FIELD_S3_SECRET_ACCESS_KEY: secretAccessKey, FIELD_S3_ENDPOINT: endpoint } = process.env;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return undefined;
  return new FieldS3MediaStore(new S3Client({ region, endpoint,
    forcePathStyle: Boolean(endpoint), credentials: { accessKeyId, secretAccessKey } }), bucket);
}

// 사진 보관함 2단계 삭제의 2단계(추가). retention 작업자 주기마다 실행한다.
// 삭제 요청(sites.ts DELETE /v1/sites/assets/:id)은 state='deleting'만 표시하고, 여기서 저장소 객체 삭제 → 부재 확인 → 행 삭제·최종 outbox를 한다.
// 저장소 I/O 동안 어떤 행 잠금도 잡지 않는다: 행은 짧은 UPDATE(skip locked)로 임대 시각만큼 미뤄 두고, I/O가 끝난 뒤 짧은 트랜잭션에서 지운다.
// 작업자가 임대 중에 멈추면 임대가 끝난 뒤 다시 잡힌다(저장소 삭제·부재 확인은 반복해도 같은 결과다).
const SITE_ASSET_DELETION_BATCH = 10;
const SITE_ASSET_DELETION_MAX_ATTEMPTS = 12;
const SITE_ASSET_DELETION_LEASE = '5 minutes';
export type SiteAssetDeletionResult = { deleted: number; retried: number; stopped: number; blocked: number };
export async function runSiteAssetDeletionOnce(runtime: { pool: Pool; siteMedia?: FieldSiteMediaStore }): Promise<SiteAssetDeletionResult> {
  const result: SiteAssetDeletionResult = { deleted: 0, retried: 0, stopped: 0, blocked: 0 };
  const { pool, siteMedia } = runtime;
  // 저장소 설정이 없으면 시도 횟수를 늘리지 않고 blocked_integration을 남긴 채 1시간 뒤 다시 확인한다.
  const claimed = (await pool.query<{ id: string; organization_id: string; object_key: string }>(
    `update field.site_assets a set deletion_next_attempt_at = clock_timestamp() + $2::interval,
       deletion_error = case when $3 then 'blocked_integration' else a.deletion_error end
     from (select id from field.site_assets where state = 'deleting' and deletion_next_attempt_at <= clock_timestamp()
           order by deletion_next_attempt_at, id for update skip locked limit $1) due
     where a.id = due.id returning a.id, a.organization_id, a.object_key`,
    [SITE_ASSET_DELETION_BATCH, siteMedia ? SITE_ASSET_DELETION_LEASE : '1 hour', !siteMedia])).rows;
  if (!siteMedia) { result.blocked = claimed.length; return result; }
  for (const asset of claimed) {
    let code: string | null = null;
    try {
      await siteMedia.delete(asset.object_key);
      const present = siteMedia.exists ? await siteMedia.exists(asset.object_key) : await siteMedia.get(asset.object_key) !== null;
      if (present) code = 'file_delete_unconfirmed';
    } catch (error) { code = error instanceof MediaPermissionError ? 'media_permission' : 'media_unavailable'; }
    if (code) {
      // 권한 부족은 재시도로 풀리지 않으므로 시도 횟수를 그대로 두고 멈춘다. 그 밖의 실패는 30초부터 두 배씩(최대 1시간) 미루고
      // 12회째 실패하면 멈춘다. 멈춘 행은 deletion_next_attempt_at='infinity'와 deletion_error로 운영자가 확인한다(원인 해결 뒤 시각을 되돌린다).
      const stopped = (await pool.query<{ stopped: boolean }>(
        `update field.site_assets set
           deletion_attempts = deletion_attempts + case when $2 = 'media_permission' then 0 else 1 end,
           deletion_error = case when $2 <> 'media_permission' and deletion_attempts + 1 >= $3 then $2 || ',attempts_stopped' else $2 end,
           deletion_next_attempt_at = case when $2 = 'media_permission' or deletion_attempts + 1 >= $3 then 'infinity'::timestamptz
             else clock_timestamp() + least(interval '30 seconds' * power(2, deletion_attempts), interval '1 hour') end
         where id = $1 and state = 'deleting' returning deletion_next_attempt_at = 'infinity'::timestamptz as stopped`,
        [asset.id, code, SITE_ASSET_DELETION_MAX_ATTEMPTS])).rows[0]?.stopped;
      if (stopped) result.stopped += 1; else if (stopped === false) result.retried += 1;
      continue;
    }
    const db = await pool.connect();
    try {
      await db.query('begin');
      // 조직 행 KEY SHARE를 먼저 잡는다. 조직 삭제 실행기(조직 FOR UPDATE → 사진 FOR UPDATE)와 같은 순서라
      // 사진 행을 먼저 지우고 outbox FK 검사로 조직을 기다리는 순환 대기(40P01)가 생기지 않는다.
      await db.query('select 1 from field.organizations where id = $1 for key share', [asset.organization_id]);
      // 조직 삭제 실행기가 먼저 지웠으면 0행이고 최종 이벤트도 내지 않는다(그쪽 실행 기록이 결과다).
      const removed = await db.query("delete from field.site_assets where id = $1 and state = 'deleting'", [asset.id]);
      if (removed.rowCount) {
        const siteId = (await db.query<{ id: string }>('select id from field.sites where organization_id = $1',
          [asset.organization_id])).rows[0]?.id ?? null;
        await db.query(`insert into field.outbox(id, organization_id, event_type, aggregate_id, payload)
          values ($1, $2, 'field.site.asset.deleted', $3, $4::jsonb)`,
        [randomUUID(), asset.organization_id, asset.id, JSON.stringify({ siteId, assetId: asset.id })]);
        result.deleted += 1;
      }
      await db.query('commit');
    } catch (error) {
      await db.query('rollback').catch(() => undefined);
      throw error;
    } finally { db.release(); }
  }
  return result;
}
