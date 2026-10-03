import assert from 'node:assert/strict';
import test from 'node:test';
import { adminMfaState, emailDeliveryNotice, emailDeliveryStateFrom, resetPasswordProblem, signInOutcome,
  tokenFromSearch, totpSecretFromUri, twoFactorEndpoint, verificationNoticeCopy, verifyEmailResult } from '../src/auth-flow';

test('Field email delivery state is honest: blocked_integration never claims a sent mail', () => {
  assert.equal(emailDeliveryStateFrom(200, { product: 'field', state: 'blocked_integration' }), 'blocked_integration');
  assert.equal(emailDeliveryStateFrom(200, { state: 'sent' }), 'unknown');
  assert.equal(emailDeliveryStateFrom(404, {}), 'unknown');
  for (const purpose of ['verify_email', 'reset_password'] as const) {
    assert.match(emailDeliveryNotice('blocked_integration', purpose), /메일 발송 환경이 연결되지 않았습니다/);
    assert.doesNotMatch(emailDeliveryNotice('blocked_integration', purpose), /보냈습니다/);
    assert.match(emailDeliveryNotice('mock', purpose), /실제로 발송되지 않/);
  }
  // 공급사 발송 결과는 화면에서 확인할 수 없으므로 '보냈습니다'로 단정하지 않는다
  assert.match(emailDeliveryNotice('configured', 'verify_email'), /확인 메일 발송을 요청했습니다/);
  for (const purpose of ['verify_email', 'reset_password'] as const)
    assert.doesNotMatch(emailDeliveryNotice('configured', purpose), /보냈습니다/);
});

test('Field sign-in outcome distinguishes 2FA challenge, unverified email and failures', () => {
  assert.equal(signInOutcome(200, { twoFactorRedirect: true, twoFactorMethods: ['totp'] }), 'two_factor');
  assert.equal(signInOutcome(200, { token: 't', user: {} }), 'signed_in');
  assert.equal(signInOutcome(403, { code: 'EMAIL_NOT_VERIFIED' }), 'email_not_verified');
  assert.equal(signInOutcome(403, { code: 'OTHER' }), 'failed');
  assert.equal(signInOutcome(401, { code: 'INVALID_EMAIL_OR_PASSWORD' }), 'invalid_credentials');
});

test('Field one-time tokens, TOTP secret and 2FA code routing are parsed strictly', () => {
  assert.equal(tokenFromSearch('?token=abc.DEF-123_xyz'), 'abc.DEF-123_xyz');
  assert.equal(tokenFromSearch('?token=short'), null);
  assert.equal(tokenFromSearch('?token=<script>alert(1)</script>'), null);
  assert.equal(tokenFromSearch(''), null);
  assert.equal(totpSecretFromUri('otpauth://totp/Field:a%40example.invalid?secret=JBSWY3DPEHPK3PXP&issuer=Field'), 'JBSWY3DPEHPK3PXP');
  assert.equal(totpSecretFromUri('https://example.invalid/?secret=JBSWY3DPEHPK3PXP'), null);
  assert.equal(totpSecretFromUri('not a url'), null);
  assert.deepEqual(twoFactorEndpoint(' 123456 '), { path: '/api/auth/two-factor/verify-totp', body: { code: '123456' } });
  assert.equal(twoFactorEndpoint('abcde-12345')?.path, '/api/auth/two-factor/verify-backup-code');
  assert.equal(twoFactorEndpoint('12'), null);
});

test('Field verify-email, reset-password and admin MFA state helpers', () => {
  assert.equal(verifyEmailResult(200, { status: true, user: null }), 'verified');
  assert.equal(verifyEmailResult(401, { code: 'TOKEN_EXPIRED' }), 'expired');
  assert.equal(verifyEmailResult(401, { code: 'INVALID_TOKEN' }), 'invalid');
  assert.equal(verifyEmailResult(500, {}), 'failed');
  assert.match(resetPasswordProblem('short', 'short') ?? '', /8자 이상/);
  assert.match(resetPasswordProblem('long-enough-1', 'long-enough-2') ?? '', /일치하지 않/);
  assert.equal(resetPasswordProblem('long-enough-1', 'long-enough-1'), null);
  assert.equal(adminMfaState(null), 'signed_out');
  assert.equal(adminMfaState({ user: { twoFactorEnabled: false }, session: {} }), 'not_enrolled');
  assert.equal(adminMfaState({ user: { twoFactorEnabled: true }, session: { twoFactorVerified: false } }), 'session_not_verified');
  assert.equal(adminMfaState({ user: { twoFactorEnabled: true }, session: { twoFactorVerified: true } }), 'verified');
});

// 로그인 경로(email_not_verified)는 그 순간 메일을 보내지 않으므로 발송을 단정하지 않는다
test('Field verification notice copy does not claim a sent mail on the sign-in path', () => {
  const signIn = verificationNoticeCopy('configured', 'sign_in');
  assert.equal(signIn.title, '이메일 주소 확인이 필요합니다');
  assert.doesNotMatch(signIn.body, /보냈습니다|요청했습니다/);
  const signUp = verificationNoticeCopy('configured', 'sign_up');
  assert.equal(signUp.title, '확인 메일 발송을 요청했습니다');
  assert.match(signUp.body, /메일이 오지 않으면 다시 보내기/);
  assert.equal(verificationNoticeCopy('blocked_integration', 'sign_in').title, '메일 발송 환경이 연결되지 않았습니다');
  assert.equal(verificationNoticeCopy(null, 'sign_up').title, '이메일 주소 확인이 필요합니다');
});
