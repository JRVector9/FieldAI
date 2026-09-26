import { resolve } from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import { FieldFileMediaStore, FieldS3MediaStore, type FieldSiteMediaStore } from './site-media.js';

export function createFieldInquiryMediaStore(): FieldSiteMediaStore | undefined {
  if (process.env.FIELD_PROFILE === 'mock') {
    if (!process.env.FIELD_INQUIRY_MEDIA_DIRECTORY) return undefined;
    return new FieldFileMediaStore(resolve(process.env.FIELD_INQUIRY_MEDIA_DIRECTORY));
  }
  const { FIELD_INQUIRY_S3_BUCKET: bucket, FIELD_INQUIRY_S3_REGION: region,
    FIELD_INQUIRY_S3_ACCESS_KEY_ID: accessKeyId,
    FIELD_INQUIRY_S3_SECRET_ACCESS_KEY: secretAccessKey,
    FIELD_INQUIRY_S3_ENDPOINT: endpoint } = process.env;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return undefined;
  return new FieldS3MediaStore(new S3Client({ region, endpoint, forcePathStyle: Boolean(endpoint),
    credentials: { accessKeyId, secretAccessKey } }), bucket);
}
