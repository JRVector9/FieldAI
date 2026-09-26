import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });

test('external install accepts only its exact origin and handoff is single use', async () => {
  const installationId = `embed-${randomUUID()}`;
  const origin = 'http://127.0.0.1:4381';
  const app = createAgentApp(async () => undefined, undefined, 'http://127.0.0.1:4311', pool);
  try {
    await pool.query(
      'INSERT INTO spike.widget_installations (id, allowed_origin, active) VALUES ($1, $2, true)',
      [installationId, origin],
    );
    const path = `/embed/v1/${installationId}/frame`;
    const allowed = await app.inject({ url: path, headers: { referer: `${origin}/test-page` } });
    assert.equal(allowed.statusCode, 200);
    assert.match(allowed.headers['content-security-policy']?.toString() ?? '', /frame-ancestors 'self' http:\/\/127\.0\.0\.1:4381/);
    const nonce = allowed.body.match(/const handshakeNonce = "([^"]+)";/)?.[1];
    assert.ok(nonce);

    const other = await app.inject({ url: path, headers: { referer: 'http://127.0.0.1:4382/test-page' } });
    assert.equal(other.statusCode, 403);
    const missing = await app.inject({ url: path });
    assert.equal(missing.statusCode, 403);

    const session = await app.inject({ method: 'POST', url: '/embed/v1/sessions', payload: { nonce } });
    assert.equal(session.statusCode, 201);
    const { sessionId, token } = session.json() as { sessionId: string; token: string };
    assert.ok(token);
    const replay = await app.inject({ method: 'POST', url: '/embed/v1/sessions', payload: { nonce } });
    assert.equal(replay.statusCode, 409);

    const unauthorized = await app.inject({ method: 'POST', url: '/embed/v1/handoffs', headers: { authorization: 'Bearer invalid' } });
    assert.equal(unauthorized.statusCode, 401);
    const handoff = await app.inject({ method: 'POST', url: '/embed/v1/handoffs', headers: { authorization: `Bearer ${token}` } });
    assert.equal(handoff.statusCode, 201);
    const { ticket } = handoff.json() as { ticket: string };
    assert.ok(ticket);
    const noCookie = await app.inject({ url: '/embed/v1/received' });
    assert.equal(noCookie.statusCode, 401);
    const crossOrigin = await app.inject({ method: 'POST', url: '/embed/v1/continue', headers: { host: '127.0.0.1:4311', origin }, payload: { ticket } });
    assert.equal(crossOrigin.statusCode, 403);
    const consume = await app.inject({
      method: 'POST', url: '/embed/v1/continue',
      headers: { host: '127.0.0.1:4311', origin: 'http://127.0.0.1:4311', 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ ticket }).toString(),
    });
    assert.equal(consume.statusCode, 303);
    assert.equal(consume.headers.location, '/embed/v1/received');
    assert.equal(consume.headers['cache-control'], 'no-store');
    const setCookie = consume.headers['set-cookie']?.toString() ?? '';
    assert.match(setCookie, /^ap_spike_customer=[A-Za-z0-9_-]{40,64};/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    const cookie = setCookie.split(';')[0];
    assert.ok(cookie);
    const received = await app.inject({ url: '/embed/v1/received', headers: { cookie } });
    assert.equal(received.statusCode, 200);
    assert.match(received.body, /대화 이어가기 준비 완료/);
    const capability = cookie.split('=')[1];
    assert.ok(capability);
    const bound = await pool.query<{ session_id: string }>(
      'SELECT session_id FROM spike.first_party_sessions WHERE token_hash = $1',
      [createHash('sha256').update(capability).digest('hex')],
    );
    assert.equal(bound.rows[0]?.session_id, sessionId);
    const consumeAgain = await app.inject({ method: 'POST', url: '/embed/v1/continue', headers: { host: '127.0.0.1:4311', origin: 'http://127.0.0.1:4311' }, payload: { ticket } });
    assert.equal(consumeAgain.statusCode, 410);
    assert.equal(consumeAgain.headers['set-cookie'], undefined);
    const queryTicket = await app.inject({ url: `/embed/v1/continue?ticket=${ticket}` });
    assert.equal(queryTicket.statusCode, 404);
    const expiring = await app.inject({ method: 'POST', url: '/embed/v1/handoffs', headers: { authorization: `Bearer ${token}` } });
    assert.equal(expiring.statusCode, 201);
    const expiredTicket = (expiring.json() as { ticket: string }).ticket;
    await pool.query('UPDATE spike.widget_handoffs SET expires_at = now() - interval \'1 second\' WHERE ticket_hash = $1', [createHash('sha256').update(expiredTicket).digest('hex')]);
    const expired = await app.inject({ method: 'POST', url: '/embed/v1/continue', headers: { host: '127.0.0.1:4311', origin: 'http://127.0.0.1:4311' }, payload: { ticket: expiredTicket } });
    assert.equal(expired.statusCode, 410);
    assert.equal(expired.headers['set-cookie'], undefined);
  } finally {
    await app.close();
    await pool.query('DELETE FROM spike.widget_installations WHERE id = $1', [installationId]);
    await pool.end();
  }
});
