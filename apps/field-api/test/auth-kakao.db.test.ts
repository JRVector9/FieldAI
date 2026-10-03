import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { symmetricEncrypt } from 'better-auth/crypto';
import { Pool } from 'pg';

// 카카오 공급사 등록은 auth.ts 로드 시점에 정해지므로 import 전에 sandbox 프로필과 합성 키를 넣는다.
// 실제 카카오와 통신하지 않는다: 토큰·사용자 정보 엔드포인트는 아래 fetch 대역으로만 응답한다.
process.loadEnvFile(resolve('../../infra/field/.env'));
process.env.FIELD_PROFILE = 'sandbox';
delete process.env.FIELD_SMTP_URL;
delete process.env.FIELD_MAIL_FROM;
process.env.FIELD_KAKAO_CLIENT_ID = 'synthetic-field-kakao-client';
process.env.FIELD_KAKAO_CLIENT_SECRET = 'synthetic-field-kakao-secret';
const { auth, authPool } = await import('../src/auth.js');
const { createFieldApp } = await import('../src/app.js');
const { kakaoProviderConfig, kakaoTwoFactorReturnUrl } = await import('../src/kakao-provider.js');
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
const base = process.env.FIELD_AUTH_BASE_URL!;
const webOrigin = process.env.FIELD_PUBLIC_WEB_ORIGIN!;
const users: string[] = [];

type KakaoProfile = { id: number; kakao_account: { email?: string; is_email_valid?: boolean; is_email_verified?: boolean; profile?: { nickname?: string } } };
let kakaoProfile: KakaoProfile | null = null;
const tokenRequests: URLSearchParams[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === 'https://kauth.kakao.com/oauth/token') {
    tokenRequests.push(new URLSearchParams(String(init?.body ?? '')));
    return Response.json({ access_token: `synthetic-access-${randomUUID()}`, token_type: 'bearer', expires_in: 600 });
  }
  if (url === 'https://kapi.kakao.com/v2/user/me') return Response.json(kakaoProfile);
  if (/kakao\.com/.test(url)) throw new Error(`unexpected Kakao request: ${url}`);
  return realFetch(input, init);
}) as typeof fetch;

after(async () => {
  globalThis.fetch = realFetch;
  await pool.query('delete from field.email_outbox where "to" = any($1::text[])', [users]);
  await pool.query('delete from "user" where email = any($1::text[])', [users]);
  await Promise.all([pool.end(), authPool.end()]);
});

type Jar = Map<string, string>;
function store(jar: Jar, response: Response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair = '', ...attributes] = header.split(';');
    const index = pair.indexOf('=');
    const name = pair.slice(0, index).trim(), value = pair.slice(index + 1).trim();
    if (!value || attributes.some(attribute => /^\s*max-age=0\s*$/i.test(attribute))) jar.delete(name);
    else jar.set(name, value);
  }
  return response;
}
const cookie = (jar: Jar) => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
async function call(jar: Jar, path: string, body?: unknown) {
  const response = await auth.handler(new Request(`${base}/api/auth${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin: base, cookie: cookie(jar), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  return store(jar, response);
}
const session = (jar: Jar) => auth.api.getSession({ headers: new Headers({ cookie: cookie(jar) }) });
function syntheticKakao(email: string, verified = true): KakaoProfile {
  users.push(email);
  return { id: Number.parseInt(randomBytes(5).toString('hex'), 16),
    kakao_account: { email, is_email_valid: verified, is_email_verified: verified, profile: { nickname: '합성 카카오 사용자' } } };
}
// 웹과 같은 요청(sign-in/social) → 카카오 인가 주소 확인 → 콜백(합성 code)까지 진행하고 콜백 응답을 돌려준다.
async function kakaoLogin(jar: Jar, profile: KakaoProfile,
  urls: { callbackURL: string; errorCallbackURL: string } = { callbackURL: '/workspace', errorCallbackURL: '/workspace?auth_error=kakao' }) {
  kakaoProfile = profile;
  const start = await call(jar, '/sign-in/social', { provider: 'kakao', ...urls });
  assert.equal(start.status, 200, await start.clone().text());
  const authorize = new URL((await start.json() as { url: string }).url);
  assert.equal(`${authorize.origin}${authorize.pathname}`, 'https://kauth.kakao.com/oauth/authorize');
  assert.equal(authorize.searchParams.get('client_id'), 'synthetic-field-kakao-client');
  assert.equal(authorize.searchParams.get('redirect_uri'), `${webOrigin}/api/auth/callback/kakao`);
  assert.equal(authorize.searchParams.get('scope'), 'account_email profile_nickname');
  const callback = await call(jar, `/callback/kakao?code=synthetic-code&state=${encodeURIComponent(authorize.searchParams.get('state')!)}`);
  assert.equal(callback.status, 302, await callback.clone().text());
  return callback.headers.get('location');
}
const accounts = async (email: string) => (await pool.query<{ providerId: string; accountId: string }>(
  `select a."providerId", a."accountId" from account a join "user" u on u.id = a."userId" where u.email = $1 order by a."providerId"`, [email])).rows;

test('Field Kakao provider state: blocked without keys, refused in mock with keys, partial keys refuse boot', () => {
  assert.deepEqual(kakaoProviderConfig({ FIELD_PROFILE: 'sandbox' }), { state: 'blocked_integration' });
  assert.deepEqual(kakaoProviderConfig({ FIELD_PROFILE: 'live' }), { state: 'blocked_integration' });
  assert.deepEqual(kakaoProviderConfig({ FIELD_PROFILE: 'mock' }), { state: 'mock_forbidden' });
  assert.throws(() => kakaoProviderConfig({ FIELD_PROFILE: 'mock', FIELD_KAKAO_CLIENT_ID: 'x' }), /real_kakao_provider_forbidden_in_mock/);
  assert.throws(() => kakaoProviderConfig({ FIELD_PROFILE: 'mock', FIELD_KAKAO_CLIENT_SECRET: 'x' }), /real_kakao_provider_forbidden_in_mock/);
  assert.throws(() => kakaoProviderConfig({ FIELD_PROFILE: 'sandbox', FIELD_KAKAO_CLIENT_ID: 'x' }), /incomplete_FIELD_kakao_configuration/);
  assert.throws(() => kakaoProviderConfig({ FIELD_PROFILE: 'live', FIELD_KAKAO_CLIENT_SECRET: 'x' }), /incomplete_FIELD_kakao_configuration/);
  // AP 키는 Field 설정에 영향을 주지 않는다.
  assert.deepEqual(kakaoProviderConfig({ FIELD_PROFILE: 'sandbox', AP_KAKAO_CLIENT_ID: 'x', AP_KAKAO_CLIENT_SECRET: 'y' }), { state: 'blocked_integration' });
  assert.equal(kakaoProviderConfig({ FIELD_PROFILE: 'sandbox', FIELD_KAKAO_CLIENT_ID: 'x', FIELD_KAKAO_CLIENT_SECRET: 'y' }).state, 'configured');
  assert.equal(auth.options.account?.accountLinking?.enabled, false, '동일 이메일 자동 병합 금지');
});

test('Field GET /v1/auth/providers reports the boot-time Kakao state without exposing keys', async () => {
  const configured = createFieldApp(async () => undefined);
  const saved = { id: process.env.FIELD_KAKAO_CLIENT_ID, secret: process.env.FIELD_KAKAO_CLIENT_SECRET, profile: process.env.FIELD_PROFILE };
  try {
    const response = await configured.inject({ url: '/v1/auth/providers' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { kakao: 'configured' });
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.ok(!response.body.includes('synthetic-field-kakao'), 'client id/secret are not exposed');
    delete process.env.FIELD_KAKAO_CLIENT_ID; delete process.env.FIELD_KAKAO_CLIENT_SECRET;
    const blocked = createFieldApp(async () => undefined);
    assert.deepEqual((await blocked.inject({ url: '/v1/auth/providers' })).json(), { kakao: 'blocked_integration' });
    await blocked.close();
    process.env.FIELD_PROFILE = 'mock';
    const mock = createFieldApp(async () => undefined);
    assert.deepEqual((await mock.inject({ url: '/v1/auth/providers' })).json(), { kakao: 'mock_forbidden' });
    await mock.close();
    process.env.FIELD_KAKAO_CLIENT_ID = saved.id;
    assert.throws(() => createFieldApp(async () => undefined), /real_kakao_provider_forbidden_in_mock/);
  } finally {
    process.env.FIELD_KAKAO_CLIENT_ID = saved.id; process.env.FIELD_KAKAO_CLIENT_SECRET = saved.secret; process.env.FIELD_PROFILE = saved.profile;
    await configured.close();
  }
});

test('Field Kakao sign-in creates a separate Kakao-only account and session for a new verified email', async () => {
  const email = `field-kakao-${randomUUID()}@example.invalid`;
  const jar: Jar = new Map();
  const profile = syntheticKakao(email);
  assert.equal(await kakaoLogin(jar, profile), '/workspace');
  const current = await session(jar);
  assert.equal(current?.user.email, email);
  assert.equal(current?.user.emailVerified, true);
  assert.deepEqual(await accounts(email), [{ providerId: 'kakao', accountId: String(profile.id) }]);
  // 토큰 교환은 client_secret_post로 합성 키를 보낸다.
  assert.equal(tokenRequests.at(-1)?.get('client_secret'), 'synthetic-field-kakao-secret');
  // 같은 카카오 계정의 재로그인은 같은 사용자로 들어온다(새 사용자 생성 없음).
  const again: Jar = new Map();
  assert.equal(await kakaoLogin(again, profile), '/workspace');
  assert.equal((await session(again))?.user.id, current?.user.id);
  assert.equal((await pool.query('select count(*)::int as n from "user" where email=$1', [email])).rows[0].n, 1);
});

test('Field Kakao sign-in never merges into an existing email/password account with the same email', async () => {
  const email = `field-kakao-existing-${randomUUID()}@example.invalid`;
  users.push(email);
  const password = `${randomBytes(18).toString('base64url')}A1!`;
  assert.equal((await call(new Map(), '/sign-up/email', { email, password, name: 'Synthetic Field email user' })).status, 200);
  // 로컬 이메일도 인증된 상태로 둔다. 기본 better-auth라면 자동 연결되는 조건이므로 거부 원인은 연결 비활성뿐이다.
  await pool.query('update "user" set "emailVerified"=true where email=$1', [email]);
  const jar: Jar = new Map();
  assert.equal(await kakaoLogin(jar, syntheticKakao(email)), '/workspace?auth_error=kakao&error=account_not_linked');
  assert.equal(await session(jar), null, 'no session for the refused Kakao login');
  assert.deepEqual((await accounts(email)).map(row => row.providerId), ['credential'], 'no kakao account row was attached');
  assert.equal((await pool.query('select count(*)::int as n from "user" where email=$1', [email])).rows[0].n, 1);
  // 이메일 로그인은 영향 없이 그대로 동작한다.
  assert.equal((await call(new Map(), '/sign-in/email', { email, password })).status, 200);
});

test('Field Kakao sign-in refuses to create an account from an unverified Kakao email', async () => {
  const email = `field-kakao-unverified-${randomUUID()}@example.invalid`;
  const jar: Jar = new Map();
  const location = new URL((await kakaoLogin(jar, syntheticKakao(email, false)))!, webOrigin);
  assert.equal(location.pathname, '/workspace');
  assert.equal(location.searchParams.get('auth_error'), 'kakao');
  assert.equal(location.searchParams.get('error'), 'kakao_email_unverified');
  assert.equal(await session(jar), null);
  assert.equal((await pool.query('select count(*)::int as n from "user" where email=$1', [email])).rows[0].n, 0);
});

test('Field Kakao sign-in for a 2FA user issues no session until the TOTP challenge passes', async () => {
  const email = `field-kakao-2fa-${randomUUID()}@example.invalid`;
  const profile = syntheticKakao(email);
  assert.equal(await kakaoLogin(new Map(), profile), '/workspace');
  const userId = (await pool.query<{ id: string }>('select id from "user" where email=$1', [email])).rows[0]!.id;
  // 등록 절차 대신 플러그인과 같은 방식(서버 비밀값으로 암호화)으로 TOTP 비밀값을 넣는다.
  const secret = randomBytes(20).toString('hex');
  const encrypted = await symmetricEncrypt({ key: (await auth.$context).secretConfig, data: secret });
  await pool.query(`insert into "twoFactor"(id, secret, "backupCodes", "userId", verified) values ($1,$2,$3,$4,true)`,
    [randomUUID(), encrypted, encrypted, userId]);
  await pool.query('update "user" set "twoFactorEnabled"=true where id=$1', [userId]);

  const jar: Jar = new Map();
  assert.equal(await kakaoLogin(jar, profile), `${webOrigin}/workspace?two_factor=kakao`);
  assert.equal(await session(jar), null, 'Kakao callback must not leave a session before 2FA');
  assert.equal((await pool.query('select count(*)::int as n from session where "userId"=$1', [userId])).rows[0].n, 1,
    'only the earlier pre-2FA session exists; the challenged login session was deleted');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(secret, 'utf8')).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  const code = String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
  const passed = await call(jar, '/two-factor/verify-totp', { code });
  assert.equal(passed.status, 200, await passed.clone().text());
  const current = await session(jar);
  assert.equal(current?.user.id, userId);
  assert.equal((current?.session as { twoFactorVerified?: boolean } | undefined)?.twoFactorVerified, true);
});

// 카카오 전용 계정을 만든 뒤 플러그인과 같은 방식(서버 비밀값으로 암호화)으로 TOTP 비밀값을 넣어 2단계 인증 계정으로 만든다.
async function kakaoTwoFactorUser(email: string) {
  const profile = syntheticKakao(email);
  assert.equal(await kakaoLogin(new Map(), profile), '/workspace');
  const userId = (await pool.query<{ id: string }>('select id from "user" where email=$1', [email])).rows[0]!.id;
  const secret = randomBytes(20).toString('hex');
  const encrypted = await symmetricEncrypt({ key: (await auth.$context).secretConfig, data: secret });
  await pool.query(`insert into "twoFactor"(id, secret, "backupCodes", "userId", verified) values ($1,$2,$3,$4,true)`,
    [randomUUID(), encrypted, encrypted, userId]);
  await pool.query('update "user" set "twoFactorEnabled"=true where id=$1', [userId]);
  return { profile, userId };
}

test('Field Kakao 2FA from the connect sign-in page returns to that page with the signed OAuth query and no session', async () => {
  const email = `field-kakao-2fa-connect-${randomUUID()}@example.invalid`;
  const { profile, userId } = await kakaoTwoFactorUser(email);
  // 연결 로그인 화면의 서명된 OAuth 쿼리를 흉내 낸 값. 서명 검증은 웹이 continue를 호출할 때 OAuth 공급자가 한다.
  const connect = '/connect/sign-in?client_id=synthetic-client&scope=openid%20offline_access&exp=4102444800&sig=synthetic-sig';
  const jar: Jar = new Map();
  const location = new URL((await kakaoLogin(jar, profile, { callbackURL: connect, errorCallbackURL: `${connect}&auth_error=kakao` }))!);
  assert.equal(location.origin, new URL(webOrigin).origin);
  assert.equal(location.pathname, '/connect/sign-in');
  assert.equal(location.searchParams.get('two_factor'), 'kakao');
  assert.equal(location.searchParams.get('client_id'), 'synthetic-client');
  assert.equal(location.searchParams.get('scope'), 'openid offline_access');
  assert.equal(location.searchParams.get('exp'), '4102444800');
  assert.equal(location.searchParams.get('sig'), 'synthetic-sig');
  assert.equal(await session(jar), null, 'Kakao callback must not leave a session before 2FA');
  assert.equal((await pool.query('select count(*)::int as n from session where "userId"=$1', [userId])).rows[0].n, 1,
    'only the earlier pre-2FA session exists; the challenged login session was deleted');
});

test('Field Kakao 2FA started with a non-connect callbackURL falls back to the workspace challenge', async () => {
  const email = `field-kakao-2fa-fallback-${randomUUID()}@example.invalid`;
  const { profile } = await kakaoTwoFactorUser(email);
  const jar: Jar = new Map();
  assert.equal(await kakaoLogin(jar, profile, { callbackURL: '/connect/select?client_id=x', errorCallbackURL: '/workspace?auth_error=kakao' }),
    `${webOrigin}/workspace?two_factor=kakao`);
  assert.equal(await session(jar), null);
  // 다른 origin·해석 불가 주소·경로 우회는 콜백 전 단계와 무관하게 순수 함수에서도 작업 공간으로 떨어진다(open redirect 금지).
  const fallback = `${webOrigin}/workspace?two_factor=kakao`;
  for (const callbackURL of [undefined, 42, 'https://evil.example/connect/sign-in?sig=x', '//evil.example/connect/sign-in',
    'javascript:alert(1)', '/connect/sign-in-evil', '/connect/sign-in/../select', '/workspace?x=1'])
    assert.equal(kakaoTwoFactorReturnUrl(callbackURL, webOrigin), fallback, String(callbackURL));
  assert.equal(kakaoTwoFactorReturnUrl(`${webOrigin}/connect/sign-in?a=1#frag`, webOrigin), `${webOrigin}/connect/sign-in?a=1&two_factor=kakao`);
  assert.equal(kakaoTwoFactorReturnUrl('/connect/sign-in?a=1&two_factor=other', webOrigin), `${webOrigin}/connect/sign-in?a=1&two_factor=kakao`);
  // 같은 origin이어도 userinfo는 복귀 주소에 남기지 않는다.
  assert.equal(kakaoTwoFactorReturnUrl(`${webOrigin.replace('://', '://u:p@')}/connect/sign-in?a=1`, webOrigin), `${webOrigin}/connect/sign-in?a=1&two_factor=kakao`);
});
