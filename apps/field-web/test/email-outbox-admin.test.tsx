import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// A-03 / QA02, QA157, QA159: 운영자에게 발송 상태와 마스킹 주소만 보이고 새 기능 이름은 (추가)로 표시한다.
test('Field auth email outbox shows failed and blocked status without authentication mail bodies', async () => {
  const feature = await import('../src/FieldEmailOutboxAdmin.js').catch(() => null);
  assert.ok(feature, 'Field authentication email outbox admin panel must exist');
  const html = renderToStaticMarkup(<feature.EmailOutboxRows emails={[
    { id: 'failed', maskedTo: 'p***@e***', purpose: 'verify_email', state: 'failed', errorCode: 'smtp_send_failed', createdAt: '2026-10-04T00:00:00Z', sentAt: null },
    { id: 'blocked', maskedTo: 'b***@e***', purpose: 'reset_password', state: 'blocked_integration', errorCode: 'smtp_not_configured', createdAt: '2026-10-04T00:00:00Z', sentAt: null },
  ]} />);
  assert.match(html, /p\*\*\*@e\*\*\*/);
  assert.match(html, /발송 실패/);
  assert.match(html, /공급사 미연결/);
  assert.match(html, /이메일 확인/);
  assert.match(html, /비밀번호 재설정/);
  assert.doesNotMatch(html, /token=|PRIVATE_|https?:/);
  assert.match(renderToStaticMarkup(<feature.FieldEmailOutboxAdmin />), /인증 메일 발송 상태 \(추가\)/);
});
