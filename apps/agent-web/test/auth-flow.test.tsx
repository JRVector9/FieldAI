import assert from 'node:assert/strict';
import test from 'node:test';
import { adminMfaState, emailDeliveryNotice, emailDeliveryStateFrom, resetPasswordProblem, signInOutcome,
  tokenFromSearch, totpSecretFromUri, twoFactorEndpoint, verifyEmailResult } from '../src/auth-flow';

test('AP email delivery state is honest: blocked_integration never claims a sent mail', () => {
  assert.equal(emailDeliveryStateFrom(200, { product: 'agent', state: 'blocked_integration' }), 'blocked_integration');
  assert.equal(emailDeliveryStateFrom(200, { state: 'sent' }), 'unknown');
  assert.equal(emailDeliveryStateFrom(404, {}), 'unknown');
  for (const purpose of ['verify_email', 'reset_password'] as const) {
    assert.match(emailDeliveryNotice('blocked_integration', purpose), /메일 발송 환경이 연결되지 않았습니다/);
    assert.doesNotMatch(emailDeliveryNotice('blocked_integration', purpose), /보냈습니다/);
    assert.match(emailDeliveryNotice('mock', purpose), /실제로 발송되지 않/);
  }
  assert.match(emailDeliveryNotice('configured', 'verify_email'), /확인 메일을 보냈습니다/);
});

test('AP sign-in outcome distinguishes 2FA challenge, unverified email and failures', () => {
  assert.equal(signInOutcome(200, { twoFactorRedirect: true, twoFactorMethods: ['totp'] }), 'two_factor');
  assert.equal(signInOutcome(200, { token: 't', user: {} }), 'signed_in');
  assert.equal(signInOutcome(403, { code: 'EMAIL_NOT_VERIFIED' }), 'email_not_verified');
  assert.equal(signInOutcome(403, { code: 'OTHER' }), 'failed');
  assert.equal(signInOutcome(401, { code: 'INVALID_EMAIL_OR_PASSWORD' }), 'invalid_credentials');
});

test('AP one-time tokens, TOTP secret and 2FA code routing are parsed strictly', () => {
  assert.equal(tokenFromSearch('?token=abc.DEF-123_xyz'), 'abc.DEF-123_xyz');
  assert.equal(tokenFromSearch('?token=short'), null);
  assert.equal(tokenFromSearch('?token=<script>alert(1)</script>'), null);
  assert.equal(tokenFromSearch(''), null);
  assert.equal(totpSecretFromUri('otpauth://totp/Agent%20Platform:a%40example.invalid?secret=JBSWY3DPEHPK3PXP&issuer=Agent%20Platform'), 'JBSWY3DPEHPK3PXP');
  assert.equal(totpSecretFromUri('https://example.invalid/?secret=JBSWY3DPEHPK3PXP'), null);
  assert.equal(totpSecretFromUri('not a url'), null);
  assert.deepEqual(twoFactorEndpoint(' 123456 '), { path: '/api/auth/two-factor/verify-totp', body: { code: '123456' } });
  assert.equal(twoFactorEndpoint('abcde-12345')?.path, '/api/auth/two-factor/verify-backup-code');
  assert.equal(twoFactorEndpoint('12'), null);
});

test('AP verify-email, reset-password and admin MFA state helpers', () => {
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
