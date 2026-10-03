import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { isHeicImage, normalizeSiteImage, unsupportedImageError } from '../src/site-media.js';
import { SYNTHETIC_HEIC } from './heic-fixture.js';

test('Field rejects iPhone HEIC with a format hint because the installed sharp cannot decode HEVC', async () => {
  // 설치된 sharp가 HEVC를 해독하게 되면 이 전제가 깨지므로 거부 문구도 함께 다시 검토해야 한다.
  assert.equal(await normalizeSiteImage(SYNTHETIC_HEIC), null);
  assert.equal(isHeicImage(SYNTHETIC_HEIC), true);
  assert.deepEqual(unsupportedImageError(SYNTHETIC_HEIC), { error: 'unsupported_image_format', hint: 'heic_unsupported' });
  const avif = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#f16e50' } }).avif().toBuffer();
  const jpeg = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#f16e50' } }).jpeg().toBuffer();
  for (const supported of [avif, jpeg]) {
    assert.equal(isHeicImage(supported), false);
    assert.ok(await normalizeSiteImage(supported));
  }
  assert.deepEqual(unsupportedImageError(Buffer.from('<svg onload="alert(1)"/>')), { error: 'unsupported_image' });
  assert.deepEqual(unsupportedImageError(undefined), { error: 'unsupported_image' });
});
