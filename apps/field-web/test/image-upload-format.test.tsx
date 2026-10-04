import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEIC_UNSUPPORTED_MESSAGE, IMAGE_UPLOAD_ACCEPT, unsupportedImageMessage } from '../src/image-upload-format.js';

test('Field photo pickers offer HEIC and a decoder failure keeps the honest iPhone fallback', () => {
  assert.equal(IMAGE_UPLOAD_ACCEPT.includes('heic'), true);
  assert.equal(IMAGE_UPLOAD_ACCEPT.includes('heif'), true);
  assert.equal(unsupportedImageMessage({ error: 'unsupported_image_format', hint: 'heic_unsupported' }), HEIC_UNSUPPORTED_MESSAGE);
  assert.match(HEIC_UNSUPPORTED_MESSAGE, /호환성 우선/);
  for (const body of [{ error: 'unsupported_image' }, {}, null, 'heic_unsupported'])
    assert.match(unsupportedImageMessage(body), /JPG·PNG·WebP 파일로 다시 첨부/);
});
