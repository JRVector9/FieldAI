import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// A-02 / QA139, QA157, QA159: an unknown delivery can only be administratively closed, never resent.
test('AP unknown delivery panel preserves the unknown outcome and explains operator-only closure', async () => {
  const m = await import('../src/AgentUnknownFieldActions.js').catch(() => null);
  assert.ok(m, 'unknown Field delivery administrator view is missing');
  const item = { id: 'action-id', organizationId: 'org-id', organizationName: '사업장', inquiryId: 'inquiry-id',
    connectionId: 'connection-id', kind: 'inquiry', consentConfirmedAt: '2026-10-02T00:00:00.000Z',
    state: 'delivery_unknown', errorCode: 'field_result_unknown' };
  const html = renderToStaticMarkup(<m.UnknownFieldActionsList items={[item]} role="auditor" reasons={{}}
    busy={false} failed={false} acknowledged={{}} onReason={() => {}} onAcknowledge={() => {}} onClose={() => {}} />);
  assert.match(html, /operator 권한/);
  assert.match(html, /Field.*취소/);
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /재전송|PRIVATE_PAYLOAD|01012345678/);
  assert.match(m.unknownFieldCloseBlockReason({ role: 'operator', reason: '짧음', busy: false, failed: false, acknowledged: true })!, /10~500/);
  assert.match(m.unknownFieldCloseBlockReason({ role: 'operator', reason: '충분히 긴 사유를 입력했습니다', busy: false, failed: false, acknowledged: false })!, /확인/);
  assert.match(m.unknownFieldCloseBlockReason({ role: 'operator', reason: '충분히 긴 사유를 입력했습니다', busy: false, failed: true, acknowledged: true })!, /다시 조회/);
  assert.equal(m.unknownFieldCloseBlockReason({ role: 'operator', reason: '충분히 긴 사유를 입력했습니다', busy: false, failed: false, acknowledged: true }), null);
});

// A-03 / QA02, QA48, QA159: labels separate SMTP acceptance from recipient delivery.
test('AP outbox view uses masked recipients and does not describe SMTP acceptance as mailbox delivery', async () => {
  const m = await import('../src/AgentEmailOutboxAdmin.js').catch(() => null);
  assert.ok(m, 'email delivery administrator view is missing');
  const html = renderToStaticMarkup(<m.EmailOutboxList emails={[{ id: 'email-id', maskedTo: 'p***@e***',
    purpose: 'verify_email', state: 'sent', errorCode: null, createdAt: '2026-10-03T00:00:00.000Z', sentAt: '2026-10-03T00:00:01.000Z' }]} />);
  assert.match(html, /p\*\*\*@e\*\*\*/);
  assert.match(html, /SMTP.*접수/);
  assert.doesNotMatch(html, /수신함 도달 완료|PRIVATE_TOKEN/);
  assert.equal(m.emailStateLabel('blocked_integration'), '메일 공급사 미연결');
});

test('AP administrator logout refusal has actionable Korean text without raw status codes', async () => {
  const m = await import('../src/agent-admin-sections.js');
  assert.ok('adminSignOutFailureMessage' in m, 'logout error copy is missing');
  assert.match(m.adminSignOutFailureMessage as string, /다시 시도/);
  assert.doesNotMatch(m.adminSignOutFailureMessage as string, /status|\(\d{3}\)/);
  assert.equal(m.adminResourceLabel('field_actions'), '미해결 전달 요청 목록 조회');
  assert.equal(m.adminResourceLabel('email_outbox'), '인증 메일 발송 상태 조회');
});
