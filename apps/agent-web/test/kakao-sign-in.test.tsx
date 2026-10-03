import assert from 'node:assert/strict';
import test from 'node:test';
import { kakaoAuthorizeUrl, kakaoCallbackUrls, kakaoErrorMessage, kakaoProviderStateFrom, kakaoReturnFromSearch,
  kakaoUnavailableReason, searchWithoutKakaoReturn } from '../src/agent-kakao-sign-in';

test('AP Kakao button is enabled only for a configured provider; other states keep an honest reason', () => {
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

test('AP Kakao callback errors map to copy; an existing email account is never merged', () => {
  assert.equal(kakaoErrorMessage('account_not_linked'), '이미 이메일로 가입된 계정입니다. 이메일로 로그인해 주세요.');
  assert.match(kakaoErrorMessage('email_not_found'), /이메일 제공에 동의/);
  assert.match(kakaoErrorMessage('kakao_email_unverified'), /인증되지 않았습니다/);
  assert.match(kakaoErrorMessage('access_denied'), /취소/);
  assert.match(kakaoErrorMessage('state_mismatch'), /실패했습니다/);
  assert.match(kakaoErrorMessage(null), /실패했습니다/);
});

test('AP Kakao return address: error, 2FA challenge and unrelated queries', () => {
  assert.deepEqual(kakaoReturnFromSearch('?auth_error=kakao&error=account_not_linked&error_description=x'),
    { kind: 'error', message: '이미 이메일로 가입된 계정입니다. 이메일로 로그인해 주세요.' });
  assert.deepEqual(kakaoReturnFromSearch('?two_factor=kakao'), { kind: 'two_factor' });
  assert.equal(kakaoReturnFromSearch('?error=account_not_linked'), null, 'only our errorCallbackURL marker is trusted');
  assert.equal(kakaoReturnFromSearch('?mode=login'), null);
});

test('AP Kakao sign-in only navigates to the Kakao authorize origin', () => {
  const url = 'https://kauth.kakao.com/oauth/authorize?client_id=x&state=y';
  assert.equal(kakaoAuthorizeUrl({ url, redirect: true }), url);
  assert.equal(kakaoAuthorizeUrl({ url: 'https://evil.example/oauth/authorize' }), null);
  assert.equal(kakaoAuthorizeUrl({ url: 'javascript:alert(1)' }), null);
  assert.equal(kakaoAuthorizeUrl({}), null);
});

test('AP Kakao return cleanup strips only the Kakao markers and keeps the signed connect query', () => {
  const signed = 'client_id=c1&scope=openid+offline_access&exp=4102444800&sig=s1';
  assert.equal(searchWithoutKakaoReturn(`?${signed}&auth_error=kakao&error=account_not_linked&error_description=x`), `?${signed}`);
  assert.equal(searchWithoutKakaoReturn(`?${signed}&two_factor=kakao`), `?${signed}`);
  assert.equal(new URLSearchParams(searchWithoutKakaoReturn(`?${signed}&two_factor=kakao`)).get('scope'), 'openid offline_access');
  assert.equal(searchWithoutKakaoReturn('?auth_error=kakao&error=access_denied'), '');
  assert.equal(searchWithoutKakaoReturn(''), '');
});

test('AP Kakao callbackPath maps to callback and error URLs; default stays on the workspace', () => {
  assert.deepEqual(kakaoCallbackUrls(undefined, '?client_id=c1&sig=s1'),
    { callbackURL: '/workspace', errorCallbackURL: '/workspace?auth_error=kakao' });
  assert.deepEqual(kakaoCallbackUrls('/connect/sign-in', '?client_id=c1&sig=s1'),
    { callbackURL: '/connect/sign-in?client_id=c1&sig=s1', errorCallbackURL: '/connect/sign-in?client_id=c1&sig=s1&auth_error=kakao' });
  // 이전 카카오 실패 표시가 남아 있어도 다음 시도 주소에는 싣지 않는다.
  assert.deepEqual(kakaoCallbackUrls('/connect/sign-in', '?client_id=c1&sig=s1&auth_error=kakao&error=access_denied'),
    { callbackURL: '/connect/sign-in?client_id=c1&sig=s1', errorCallbackURL: '/connect/sign-in?client_id=c1&sig=s1&auth_error=kakao' });
  assert.deepEqual(kakaoCallbackUrls('/connect/sign-in', ''),
    { callbackURL: '/connect/sign-in', errorCallbackURL: '/connect/sign-in?auth_error=kakao' });
});
