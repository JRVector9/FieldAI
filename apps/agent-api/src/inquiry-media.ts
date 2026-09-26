import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';

export type AgentInquiryMediaStore = {
  put: (key: string, data: Buffer) => Promise<void>;
  get: (key: string) => Promise<Buffer | null>;
  delete: (key: string) => Promise<void>;
};

const objectKeyPattern = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;
export async function normalizeInquiryImage(input: Buffer) {
  if (!input.length || input.length > 8 * 1024 * 1024) return null;
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

class FileInquiryMediaStore implements AgentInquiryMediaStore {
  constructor(private readonly root: string) {}
  private path(key: string) {
    if (!objectKeyPattern.test(key)) throw new Error('invalid AP inquiry media key');
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

class S3InquiryMediaStore implements AgentInquiryMediaStore {
  constructor(private readonly client: S3Client, private readonly bucket: string) {}
  async put(key: string, data: Buffer) {
    if (!objectKeyPattern.test(key)) throw new Error('invalid AP inquiry media key');
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: 'image/webp' }));
  }
  async get(key: string) {
    if (!objectKeyPattern.test(key)) throw new Error('invalid AP inquiry media key');
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return response.Body ? Buffer.from(await response.Body.transformToByteArray()) : null;
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null;
      throw error;
    }
  }
  async delete(key: string) {
    if (!objectKeyPattern.test(key)) throw new Error('invalid AP inquiry media key');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export function createAgentInquiryMediaStore(): AgentInquiryMediaStore | undefined {
  if (process.env.AP_PROFILE === 'mock') {
    if (!process.env.AP_INQUIRY_MEDIA_DIRECTORY) return undefined;
    return new FileInquiryMediaStore(resolve(process.env.AP_INQUIRY_MEDIA_DIRECTORY));
  }
  const { AP_INQUIRY_S3_BUCKET: bucket, AP_INQUIRY_S3_REGION: region,
    AP_INQUIRY_S3_ACCESS_KEY_ID: accessKeyId, AP_INQUIRY_S3_SECRET_ACCESS_KEY: secretAccessKey,
    AP_INQUIRY_S3_ENDPOINT: endpoint } = process.env;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return undefined;
  return new S3InquiryMediaStore(new S3Client({ region, endpoint, forcePathStyle: Boolean(endpoint),
    credentials: { accessKeyId, secretAccessKey } }), bucket);
}
