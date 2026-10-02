import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4311';

async function user() {
  const email = `publisher-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic publisher' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signIn = await post('/sign-in/email');
  assert.equal(signIn.status, 200);
  return { email, cookie: signIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('publisher domain proof and scoped slots are independent of business organizations', async () => {
  const first = await user();
  const second = await user();
  let dnsMatches = false;
  const checks: { host: string; proof: string }[] = [];
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool, resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    verifyDomain: async (host, proof) => { checks.push({ host, proof }); return dnsMatches; },
  });
  const owned: string[] = [];
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/v1/publishers', payload: { name: '첫 매체' } })).statusCode, 401);
    const created = await app.inject({ method: 'POST', url: '/v1/publishers', headers: { cookie: first.cookie }, payload: { name: '첫 매체' } });
    assert.equal(created.statusCode, 201);
    const publisherId = (created.json() as { id: string }).id;
    owned.push(publisherId);
    assert.equal((await app.inject({ url: '/v1/publishers', headers: { cookie: first.cookie } })).json().publishers.length, 1);
    assert.equal((await app.inject({ url: '/v1/knowledge/draft', headers: { cookie: first.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/publishers/${publisherId}/slots`, headers: { cookie: second.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/domains`, headers: { cookie: first.cookie },
      payload: { origin: 'https://news.example.test/article' } })).statusCode, 400);
    const domain = await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/domains`, headers: { cookie: first.cookie },
      payload: { origin: 'https://news.example.test' } });
    assert.equal(domain.statusCode, 201);
    const domainData = domain.json() as { id: string; verificationProof: string; verifiedUntil: string | null };
    assert.equal(domainData.verifiedUntil, null);
    const domainId = domainData.id;
    const other = await app.inject({ method: 'POST', url: '/v1/publishers', headers: { cookie: second.cookie }, payload: { name: '다른 매체' } });
    assert.equal(other.statusCode, 201);
    const otherPublisherId = (other.json() as { id: string }).id;
    owned.push(otherPublisherId);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${otherPublisherId}/domains`, headers: { cookie: second.cookie },
      payload: { origin: 'https://news.example.test' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/domains/${domainId}/verify`,
      headers: { cookie: second.cookie } })).statusCode, 404);
    const slot = await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots`, headers: { cookie: first.cookie },
      payload: { domainId, name: '기사 본문 카드', format: 'article' } });
    assert.equal(slot.statusCode, 201);
    const slotId = (slot.json() as { id: string }).id;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots/${slotId}/activate`,
      headers: { cookie: first.cookie } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/domains/${domainId}/verify`,
      headers: { cookie: first.cookie } })).statusCode, 409);
    assert.deepEqual(checks, [{ host: 'news.example.test', proof: domainData.verificationProof }]);
    dnsMatches = true;
    const verified = await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/domains/${domainId}/verify`,
      headers: { cookie: first.cookie } });
    assert.equal(verified.statusCode, 200);
    assert.ok((verified.json() as { verifiedUntil: string }).verifiedUntil);
    const active = await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots/${slotId}/activate`,
      headers: { cookie: first.cookie } });
    assert.equal(active.statusCode, 200);
    assert.equal((active.json() as { state: string }).state, 'active');
    assert.equal((await app.inject({ url: `/v1/publishers/${publisherId}/slots`, headers: { cookie: first.cookie } })).json().slots[0].state, 'active');
    await pool.query(`insert into ap.publisher_memberships(publisher_id, user_id, role)
      values ($1, (select id from "user" where email = $2), 'editor')`, [publisherId, second.email]);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots/${slotId}/pause`,
      headers: { cookie: second.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots/${slotId}/pause`,
      headers: { cookie: first.cookie } })).statusCode, 200);
    const beforeRepeat = await pool.query<{ count: string }>('select count(*)::text as count from ap.publisher_outbox where publisher_id = $1', [publisherId]);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots/${slotId}/pause`,
      headers: { cookie: first.cookie } })).statusCode, 200);
    const afterRepeat = await pool.query<{ count: string }>('select count(*)::text as count from ap.publisher_outbox where publisher_id = $1', [publisherId]);
    assert.equal(afterRepeat.rows[0]?.count, beforeRepeat.rows[0]?.count);
    await pool.query("update ap.publisher_domains set verified_until = now() - interval '1 minute' where id = $1", [domainId]);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/slots/${slotId}/activate`,
      headers: { cookie: first.cookie } })).statusCode, 409);
    assert.equal((await app.inject({ url: `/v1/publishers/${publisherId}/slots`, headers: { cookie: second.cookie } })).statusCode, 200);
  } finally {
    await app.close();
    for (const id of owned) await pool.query('delete from ap.publishers where id = $1', [id]);
    await authPool.query('delete from "user" where email = any($1::text[])', [[first.email, second.email]]);
  }
});

test('publisher creation key converges concurrent retries without sharing another owner', async () => {
  const first = await user();
  const second = await user();
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool, resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  const key = randomUUID();
  const submit = (cookie: string, name: string, idempotencyKey: string) => app.inject({
    method: 'POST', url: '/v1/publishers', headers: { cookie }, payload: { name, idempotencyKey },
  });
  try {
    assert.equal((await submit(first.cookie, '첫 매체', 'invalid')).statusCode, 400);
    const responses = await Promise.all([submit(first.cookie, '첫 매체', key), submit(first.cookie, '첫 매체', key)]);
    assert.deepEqual(responses.map(response => response.statusCode).sort(), [200, 201]);
    const ids = responses.map(response => (response.json() as { id: string }).id);
    assert.equal(ids[0], ids[1]);
    const replay = await submit(first.cookie, '첫 매체', key);
    assert.equal(replay.statusCode, 200);
    assert.equal((replay.json() as { id: string }).id, ids[0]);
    assert.equal((await submit(first.cookie, '다른 이름', key)).statusCode, 409);
    const otherOwner = await submit(second.cookie, '다른 매체', key);
    assert.equal(otherOwner.statusCode, 201);
    assert.notEqual((otherOwner.json() as { id: string }).id, ids[0]);
    const count = await pool.query<{ publishers: string; outbox: string }>(
      `select (select count(*)::text from ap.publishers where owner_user_id =
          (select id from "user" where email = $1)) as publishers,
        (select count(*)::text from ap.publisher_outbox where publisher_id = $2) as outbox`,
      [first.email, ids[0]],
    );
    assert.deepEqual(count.rows[0], { publishers: '1', outbox: '1' });
  } finally {
    await app.close();
    await pool.query('delete from ap.publishers where owner_user_id in (select id from "user" where email = any($1::text[]))',
      [[first.email, second.email]]);
    await authPool.query('delete from "user" where email = any($1::text[])', [[first.email, second.email]]);
  }
});

test('unverified publisher origin expires after a day while a verified origin stays claimed', async () => {
  const [first, second, third] = [await user(), await user(), await user()];
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool, resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    verifyDomain: async () => true,
  });
  const owned: string[] = [];
  const origin = `https://squat-${randomUUID()}.example.test`;
  try {
    const create = async (cookie: string) => {
      const created = await app.inject({ method: 'POST', url: '/v1/publishers', headers: { cookie }, payload: { name: '선점 검사 매체' } });
      assert.equal(created.statusCode, 201);
      owned.push(created.json().id as string); return created.json().id as string;
    };
    const [squatter, owner, late] = [await create(first.cookie), await create(second.cookie), await create(third.cookie)];
    const register = (publisherId: string, cookie: string) => app.inject({ method: 'POST', url: `/v1/publishers/${publisherId}/domains`,
      headers: { cookie }, payload: { origin } });
    const squatted = await register(squatter, first.cookie);
    assert.equal(squatted.statusCode, 201);
    // 같은 매체의 중복 등록과 24시간 안의 다른 매체 등록은 막는다
    assert.equal((await register(squatter, first.cookie)).statusCode, 409);
    assert.equal((await register(owner, second.cookie)).statusCode, 409);
    await pool.query("update ap.publisher_domains set created_at = now() - interval '25 hours' where id = $1", [squatted.json().id]);
    // 미검증 등록이 만료되면 실제 소유자가 등록하고 검증한다
    const claimed = await register(owner, second.cookie);
    assert.equal(claimed.statusCode, 201, claimed.body);
    const verified = await app.inject({ method: 'POST', url: `/v1/publishers/${owner}/domains/${claimed.json().id}/verify`,
      headers: { cookie: second.cookie } });
    assert.equal(verified.statusCode, 200, verified.body);
    // 검증된 origin은 오래되어도 계속 점유한다: 만료된 선점 행의 검증과 다른 매체의 새 등록을 거절한다
    await pool.query("update ap.publisher_domains set created_at = now() - interval '25 hours' where id = $1", [claimed.json().id]);
    const stale = await app.inject({ method: 'POST', url: `/v1/publishers/${squatter}/domains/${squatted.json().id}/verify`,
      headers: { cookie: first.cookie } });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().error, 'origin_already_registered');
    const blocked = await register(late, third.cookie);
    assert.equal(blocked.statusCode, 409);
    assert.equal(blocked.json().error, 'origin_already_registered');
    const rows = await pool.query<{ publisher_id: string; verified: boolean }>(
      'select publisher_id, verified_at is not null as verified from ap.publisher_domains where origin = $1 order by created_at', [origin]);
    assert.deepEqual(rows.rows.map(row => [row.publisher_id, row.verified]).sort(), [[owner, true], [squatter, false]].sort());
  } finally {
    await app.close();
    for (const id of owned) await pool.query('delete from ap.publishers where id = $1', [id]);
    await authPool.query('delete from "user" where email = any($1::text[])', [[first.email, second.email, third.email]]);
  }
});
