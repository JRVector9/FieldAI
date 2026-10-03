import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  // HeadObject로 존재 여부만 확인한다. 404(NotFound/NoSuchKey)는 부재다.
  // S3는 s3:ListBucket 권한이 없으면 없는 키에도 404 대신 403을 돌려주므로, 삭제 확인에는 ListBucket 권한이 필요하다.
  // 403은 부재로 간주하지 않고 MediaPermissionError(media_permission)로 올려 무한 재시도 대신 차단 상태로 멈추게 한다.
  async exists(key: string) {
    if (!objectKeyPattern.test(key)) throw new Error('invalid Field media key');
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
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
