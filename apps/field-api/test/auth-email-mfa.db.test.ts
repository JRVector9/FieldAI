import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';

// 비mock(sandbox) 인증 설정은 auth.ts 로드 시점에 정해지므로 import 전에 프로필을 바꾼다.
process.loadEnvFile(resolve('../../infra/field/.env'));
process.env.FIELD_PROFILE = 'sandbox';
delete process.env.FIELD_SMTP_URL;
delete process.env.FIELD_MAIL_FROM;
const { auth, authEmail, authPool } = await import('../src/auth.js');
const { createFieldApp } = await import('../src/app.js');
const { emailDeliveryState } = await import('../src/email-provider.js');
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
const blockedProvider = authEmail.provider;
const base = process.env.FIELD_AUTH_BASE_URL!;
const webOrigin = process.env.FIELD_PUBLIC_WEB_ORIGIN!;
const users: string[] = [];
after(async () => {
  authEmail.provider = blockedProvider;
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
// 비mock에서는 better-auth 요청 한도가 켜져 있고(Security #5) 접속 IP별로 센다. 한도와 무관한 시나리오는 요청마다 합성 IP를 준다.
const syntheticIp = () => `198.18.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
async function call(jar: Jar, path: string, body?: unknown, ip = syntheticIp()) {
  const response = await auth.handler(new Request(`${base}/api/auth${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin: base, cookie: cookie(jar), 'x-forwarded-for': ip,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  return store(jar, response);
}
async function signUp(jar: Jar) {
  const email = `field-auth-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(18).toString('base64url')}A1!`;
  users.push(email);
  const response = await call(jar, '/sign-up/email', { email, password, name: 'Synthetic Field auth user' });
  assert.equal(response.status, 200, await response.clone().text());
  return { email, password };
}
const outbox = async (email: string) => (await pool.query<{ purpose: string; state: string; text: string;
  provider_message_id: string | null; error_code: string | null; sent_at: Date | null }>(
  'select purpose,state,text,provider_message_id,error_code,sent_at from field.email_outbox where "to"=$1 order by created_at', [email])).rows;
// 인증 메일은 요청 밖에서 기록·발송된다(M5). 행이 count개가 되고 대기(pending) 행이 없을 때까지 기다린다.
async function settledOutbox(email: string, count: number) {
  for (let waited = 0; waited < 5000; waited += 20) {
    const rows = await outbox(email);
    if (rows.length >= count && rows.every(row => row.state !== 'pending')) return rows;
    await new Promise(done => setTimeout(done, 20));
  }
  throw new Error(`auth email outbox did not settle for ${count} rows`);
}

// RFC 6238 TOTP(SHA-1, 6자리, 30초). otpauth URI의 base32 secret을 그대로 디코딩한다.
function totp(uri: string, at = Date.now()) {
  const secret = new URL(uri).searchParams.get('secret')!;
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase())
    bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

test('Field sandbox sign-up records verify_email as blocked_integration when SMTP is not configured', async () => {
  authEmail.provider = blockedProvider;
  assert.equal(emailDeliveryState(blockedProvider), 'blocked_integration');
  const jar: Jar = new Map();
  const { email, password } = await signUp(jar);
  const rows = await settledOutbox(email, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.purpose, 'verify_email');
  assert.equal(rows[0]!.state, 'blocked_integration');
  assert.equal(rows[0]!.error_code, 'smtp_not_configured');
  assert.equal(rows[0]!.sent_at, null);
  assert.match(rows[0]!.text, new RegExp(`${webOrigin}/verify-email\\?token=\\[redacted\\]`));
  const signIn = await call(new Map(), '/sign-in/email', { email, password });
  assert.equal(signIn.status, 403);
  assert.equal((await signIn.json() as { code?: string }).code, 'EMAIL_NOT_VERIFIED');
});

test('Field sandbox verification and password reset go through the injected provider and web links', async () => {
  const sent: { to: string; text: string }[] = [];
  authEmail.provider = { kind: 'smtp', async send(message) { sent.push(message); return { outcome: 'sent', providerMessageId: `synthetic-${sent.length}` }; } };
  const jar: Jar = new Map();
  const { email, password } = await signUp(jar);
  const verifyRow = (await settledOutbox(email, 1))[0]!;
  assert.equal(verifyRow.state, 'sent');
  assert.equal(verifyRow.provider_message_id, 'synthetic-1');
  assert.ok(verifyRow.sent_at);
  assert.ok(!verifyRow.text.includes(sent[0]!.text.split('token=')[1]!.split('\n')[0]!), 'stored copy must not contain the token');
  const link = new URL(/https?:\/\/\S+/.exec(sent[0]!.text)![0]);
  assert.equal(link.origin, webOrigin);
  assert.equal(link.pathname, '/verify-email');
  const verifyJar: Jar = new Map();
  const verified = await call(verifyJar, `/verify-email?token=${encodeURIComponent(link.searchParams.get('token')!)}`);
  assert.equal(verified.status, 200, await verified.clone().text());
  // Security #3: 인증 링크만으로는 로그인되지 않는다(autoSignInAfterVerification: false). 인증 뒤 직접 로그인한다.
  assert.equal(verifyJar.size, 0, 'verification link must not sign the browser in');
  assert.equal((await call(verifyJar, '/sign-in/email', { email, password })).status, 200);
  const session = await auth.api.getSession({ headers: new Headers({ cookie: cookie(verifyJar) }) });
  assert.equal(session?.user.emailVerified, true);
  assert.equal((session?.session as { twoFactorVerified?: boolean } | undefined)?.twoFactorVerified, false);

  const reset = await call(new Map(), '/request-password-reset', { email });
  assert.equal(reset.status, 200);
  const rows = await settledOutbox(email, 2);
  assert.deepEqual(rows.map(row => [row.purpose, row.state]), [['verify_email', 'sent'], ['reset_password', 'sent']]);
  const resetLink = new URL(/https?:\/\/\S+/.exec(sent[1]!.text)![0]);
  assert.equal(`${resetLink.origin}${resetLink.pathname}`, `${webOrigin}/reset-password`);
  assert.match(rows[1]!.text, /reset-password\?token=\[redacted\]/);
  const newPassword = `${randomBytes(18).toString('base64url')}B2!`;
  const changed = await call(new Map(), '/reset-password', { newPassword, token: resetLink.searchParams.get('token') });
  assert.equal(changed.status, 200, await changed.clone().text());
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: cookie(verifyJar) }) }), null,
    'password reset revokes existing sessions');
  assert.equal((await call(new Map(), '/sign-in/email', { email, password })).status, 401);
  assert.equal((await call(new Map(), '/sign-in/email', { email, password: newPassword })).status, 200);
  // 없는 계정도 같은 응답이며 메일·outbox 행을 만들지 않는다(아래 요청들이 끝난 뒤 다시 확인한다).
  const unknown = `field-auth-missing-${randomUUID()}@example.invalid`;
  assert.equal((await call(new Map(), '/request-password-reset', { email: unknown })).status, 200);
  // M5: 같은 주소·목적으로 10분 안에 다시 요청하면 같은 응답이지만 보내지 않고 suppressed_duplicate만 남긴다.
  assert.equal((await call(new Map(), '/request-password-reset', { email })).status, 200);
  assert.deepEqual((await settledOutbox(email, 3)).at(-1)?.state, 'suppressed_duplicate');
  assert.equal(sent.length, 2, 'duplicate reset mail must not reach the provider');
  // 10분이 지나면 다시 보낸다. 공급사 미연결이면 blocked_integration으로 남는다.
  await pool.query(`update field.email_outbox set created_at=created_at-interval '11 minutes' where lower("to")=lower($1)`, [email]);
  authEmail.provider = blockedProvider;
  assert.equal((await call(new Map(), '/request-password-reset', { email })).status, 200);
  assert.deepEqual((await settledOutbox(email, 4)).at(-1)?.state, 'blocked_integration');
  assert.equal((await outbox(unknown)).length, 0);
});

// Security #5: 비mock에서는 better-auth 요청 한도가 DB("rateLimit", 000084)에 기록되고, 같은 IP의 로그인은 10초 3회 뒤 429다.
test('Field sandbox better-auth rate limit is enabled and stored in the database', async () => {
  authEmail.provider = blockedProvider;
  const ip = syntheticIp();
  const email = `field-auth-limit-${randomUUID()}@example.invalid`;
  const statuses: number[] = [];
  for (let index = 0; index < 4; index += 1)
    statuses.push((await call(new Map(), '/sign-in/email', { email, password: 'wrong-password-123' }, ip)).status);
  assert.deepEqual(statuses.slice(0, 3).every(status => status !== 429), true, String(statuses));
  assert.equal(statuses[3], 429);
  assert.equal((await call(new Map(), '/sign-in/email', { email, password: 'wrong-password-123' })).status !== 429, true,
    'another IP keeps its own bucket');
  const stored = await pool.query<{ count: number }>(`select count from "rateLimit" where key like $1`, [`%${ip}%`]);
  assert.equal(stored.rows[0]?.count, 3);
});

test('Field sandbox admin needs 2FA enrollment and a session established through TOTP; mock is unchanged', async () => {
  authEmail.provider = blockedProvider;
  const jar: Jar = new Map();
  const { email, password } = await signUp(jar);
  await pool.query('update "user" set "emailVerified"=true where email=$1', [email]);
  const userId = (await pool.query<{ id: string }>('select id from "user" where email=$1', [email])).rows[0]!.id;
  const first: Jar = new Map(), older: Jar = new Map();
  assert.equal((await call(first, '/sign-in/email', { email, password })).status, 200);
  assert.equal((await call(older, '/sign-in/email', { email, password })).status, 200);
  // Field 앱 라우트 등록(사용자 도메인 설정)은 mock에서 만들고, 요청 처리 시점의 프로필만 sandbox로 둔다.
  process.env.FIELD_PROFILE = 'mock';
  const app = createFieldApp(async () => undefined, auth.handler, base, {
    pool,
    resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    resolveSession: async headers => {
      const current = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
      return current ? { id: current.session.id, userId: current.user.id } : null;
    },
  });
  process.env.FIELD_PROFILE = 'sandbox';
  const overview = (target: Jar) => app.inject({ url: '/v1/admin/overview', headers: { cookie: cookie(target) } });
  try {
    assert.equal((await overview(first)).json().error, 'admin_membership_required');
    await pool.query(`insert into field.platform_admin_memberships(user_id, role) values ($1,'operator')`, [userId]);
    const denied = await overview(first);
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.json().error, 'mfa_required');

    const enabled = await call(first, '/two-factor/enable', { password });
    assert.equal(enabled.status, 200, await enabled.clone().text());
    const enrollment = await enabled.json() as { totpURI: string; backupCodes: string[] };
    assert.match(enrollment.totpURI, /^otpauth:\/\/totp\/Field:/);
    assert.equal(enrollment.backupCodes.length, 10);
    assert.equal((await overview(first)).json().error, 'mfa_required', 'unverified enrollment grants nothing');
    assert.equal((await call(first, '/two-factor/verify-totp', { code: String((Number(totp(enrollment.totpURI)) + 500_000) % 1_000_000).padStart(6, '0') })).status, 401);
    const confirmed = await call(first, '/two-factor/verify-totp', { code: totp(enrollment.totpURI) });
    assert.equal(confirmed.status, 200, await confirmed.clone().text());
    const allowed = await overview(first);
    assert.equal(allowed.statusCode, 200, allowed.body);
    assert.equal(allowed.json().role, 'operator');
    assert.equal((await pool.query('select count(*)::int as n from field.admin_access_audit where actor_user_id=$1', [userId])).rows[0].n, 1);
    // 2FA 등록 전에 열린 다른 세션은 사용자가 2FA를 켠 뒤에도 관리자 접근을 얻지 못한다.
    assert.equal((await overview(older)).json().error, 'mfa_required');

    const fresh: Jar = new Map();
    const challenge = await call(fresh, '/sign-in/email', { email, password });
    assert.equal(challenge.status, 200);
    assert.equal((await challenge.json() as { twoFactorRedirect?: boolean }).twoFactorRedirect, true);
    assert.equal((await overview(fresh)).statusCode, 401, 'no session before the TOTP challenge');
    const passed = await call(fresh, '/two-factor/verify-totp', { code: totp(enrollment.totpURI) });
    assert.equal(passed.status, 200, await passed.clone().text());
    assert.equal((await overview(fresh)).statusCode, 200);

    process.env.FIELD_PROFILE = 'mock';
    assert.equal((await overview(older)).statusCode, 200, 'mock skips the MFA step but still uses the admin gate');
  } finally {
    process.env.FIELD_PROFILE = 'sandbox';
    await app.close();
  }
});
