import assert from 'node:assert/strict';
import test from 'node:test';
import { kakaoAuthorizeUrl, kakaoErrorMessage, kakaoProviderStateFrom, kakaoReturnFromSearch,
  kakaoUnavailableReason } from '../src/field-kakao-sign-in';

test('Field Kakao button is enabled only for a configured provider; other states keep an honest reason', () => {
  assert.equal(kakaoProviderStateFrom(200, { kakao: 'configured' }), 'configured');
  assert.equal(kakaoProviderStateFrom(200, { kakao: 'blocked_integration' }), 'blocked_integration');
  assert.equal(kakaoProviderStateFrom(200, { kakao: 'mock_forbidden' }), 'mock_forbidden');
  assert.equal(kakaoProviderStateFrom(200, { kakao: 'enabled' }), 'unknown');
  assert.equal(kakaoProviderStateFrom(503, { kakao: 'configured' }), 'unknown');
  assert.equal(kakaoProviderStateFrom(200, null), 'unknown');
  assert.equal(kakaoUnavailableReason('configured'), null);
  assert.equal(kakaoUnavailableReason('blocked_integration'), '카카오 인증은 외부 연동 후 사용할 수 있습니다.');
  assert.match(kakaoUnavailableReason('mock_forbidden')!, /mock/);
  assert.match(kakaoUnavailableReason('unknown')!, /확인하지 못했습니다/);
});

test('Field Kakao callback errors map to copy; an existing email account is never merged', () => {
  assert.equal(kakaoErrorMessage('account_not_linked'), '이미 이메일로 가입된 계정입니다. 이메일로 로그인해 주세요.');
  assert.match(kakaoErrorMessage('email_not_found'), /이메일 제공에 동의/);
  assert.match(kakaoErrorMessage('kakao_email_unverified'), /인증되지 않았습니다/);
  assert.match(kakaoErrorMessage('access_denied'), /취소/);
  assert.match(kakaoErrorMessage('state_mismatch'), /실패했습니다/);
  assert.match(kakaoErrorMessage(null), /실패했습니다/);
});

test('Field Kakao return address: error, 2FA challenge and unrelated queries', () => {
  assert.deepEqual(kakaoReturnFromSearch('?auth_error=kakao&error=account_not_linked&error_description=x'),
    { kind: 'error', message: '이미 이메일로 가입된 계정입니다. 이메일로 로그인해 주세요.' });
  assert.deepEqual(kakaoReturnFromSearch('?two_factor=kakao'), { kind: 'two_factor' });
  assert.equal(kakaoReturnFromSearch('?error=account_not_linked'), null, 'only our errorCallbackURL marker is trusted');
  assert.equal(kakaoReturnFromSearch('?mode=login'), null);
});

test('Field Kakao sign-in only navigates to the Kakao authorize origin', () => {
  const url = 'https://kauth.kakao.com/oauth/authorize?client_id=x&state=y';
  assert.equal(kakaoAuthorizeUrl({ url, redirect: true }), url);
  assert.equal(kakaoAuthorizeUrl({ url: 'https://evil.example/oauth/authorize' }), null);
  assert.equal(kakaoAuthorizeUrl({ url: 'javascript:alert(1)' }), null);
  assert.equal(kakaoAuthorizeUrl({}), null);
});
