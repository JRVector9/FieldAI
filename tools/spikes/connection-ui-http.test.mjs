import assert from 'node:assert/strict';
import { test } from 'node:test';

test('both product workspaces expose their own connection step', async () => {
  const [field, ap] = await Promise.all([
    fetch('http://localhost:3002/workspace/integrations'),
    fetch('http://localhost:3001/workspace/integrations'),
  ]);
  assert.equal(field.status, 200);
  assert.equal(ap.status, 200);
  const fieldHtml = await field.text();
  const apHtml = await ap.text();
  assert.match(fieldHtml, /AI 상담 연결/);
  assert.match(apHtml, /Field 정보 제공 동의/);
});
