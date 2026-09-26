import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
const validId = (value: string) => /^[A-Za-z0-9_-]{1,100}$/.test(value);
const validOrigin = (value: string) => {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch { return false; }
};

export function registerEmbedSpikeRoutes(app: FastifyInstance, pool: Pool) {
  app.get<{ Params: { installationId: string } }>('/embed/v1/:installationId/frame', async (request, reply) => {
    const { installationId } = request.params;
    if (!validId(installationId)) return reply.code(400).send({ error: 'INVALID_INSTALLATION' });
    const installation = await pool.query<{ allowed_origin: string }>(
      'SELECT allowed_origin FROM spike.widget_installations WHERE id = $1 AND active = true',
      [installationId],
    );
    const installationRow = installation.rows[0];
    if (!installationRow) return reply.code(404).send({ error: 'INSTALLATION_NOT_FOUND' });
    const allowedOrigin = installationRow.allowed_origin;
    if (!validOrigin(allowedOrigin)) return reply.code(500).send({ error: 'INVALID_ORIGIN_CONFIGURATION' });
    let actualOrigin: string;
    try { actualOrigin = new URL(request.headers.referer ?? '').origin; }
    catch { return reply.code(403).send({ error: 'ORIGIN_DENIED' }); }
    if (actualOrigin !== allowedOrigin) return reply.code(403).send({ error: 'ORIGIN_DENIED' });

    const handshakeNonce = randomToken();
    await pool.query(
      `INSERT INTO spike.widget_nonces (nonce_hash, installation_id, parent_origin, expires_at)
       VALUES ($1, $2, $3, now() + interval '2 minutes')`,
      [hash(handshakeNonce), installationId, allowedOrigin],
    );
    const scriptNonce = randomToken();
    const script = `
      const installationId = ${JSON.stringify(installationId)};
      const allowedOrigin = ${JSON.stringify(allowedOrigin)};
      const handshakeNonce = ${JSON.stringify(handshakeNonce)};
      let started = false;
      let sessionToken;
      let pendingTab;
      let pendingTicket;
      let handoffReady = false;
      const deliverTicket = () => {
        if (!pendingTab || !pendingTicket || !handoffReady) return;
        pendingTab.postMessage({ type: 'fieldai:handoff-ticket', ticket: pendingTicket }, window.location.origin);
        pendingTicket = undefined;
      };
      window.addEventListener('message', (event) => {
        if (event.source !== pendingTab || event.origin !== window.location.origin ||
            event.data?.type !== 'fieldai:handoff-ready') return;
        handoffReady = true;
        deliverTicket();
      });
      window.addEventListener('message', async (event) => {
        if (event.source !== window.parent || event.origin !== allowedOrigin ||
            event.data?.type !== 'fieldai:embed-init' || event.data?.installationId !== installationId || started) return;
        started = true;
        const response = await fetch('/embed/v1/sessions', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nonce: handshakeNonce }),
        });
        if (response.ok) {
          sessionToken = (await response.json()).token;
          document.getElementById('status').textContent = '상담 준비 완료';
          document.getElementById('continue').disabled = false;
        } else {
          document.getElementById('status').textContent = '상담 연결 실패';
        }
      });
      document.getElementById('continue').addEventListener('click', async () => {
        if (!sessionToken) return;
        const target = 'ap-handoff-' + crypto.randomUUID();
        const tab = window.open('/embed/v1/wait', target);
        if (!tab) {
          document.getElementById('status').textContent = '새 창을 열 수 없습니다';
          return;
        }
        pendingTab = tab;
        pendingTicket = undefined;
        handoffReady = false;
        document.getElementById('continue').disabled = true;
        try {
          const response = await fetch('/embed/v1/handoffs', {
            method: 'POST', headers: { authorization: 'Bearer ' + sessionToken },
          });
          if (!response.ok) throw new Error('HANDOFF_FAILED');
          const { ticket } = await response.json();
          pendingTicket = ticket;
          deliverTicket();
        } catch {
          tab.close();
          document.getElementById('status').textContent = '상담 화면 연결 실패';
          document.getElementById('continue').disabled = false;
        }
      });`;
    reply.headers({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': `default-src 'none'; frame-ancestors 'self' ${allowedOrigin}; script-src 'nonce-${scriptNonce}'; style-src 'nonce-${scriptNonce}'; connect-src 'self'`,
    });
    return reply.send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style nonce="${scriptNonce}">body{font:16px -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;color:#1d1d1f;background:#fff;padding:16px}#status{border:1px solid #e7eaf0;border-radius:12px;padding:16px;min-height:48px}button{margin-top:12px;min-height:44px;font:inherit}</style></head><body><div id="status" role="status">상담 연결 중</div><button id="continue" type="button" disabled>AP에서 대화 이어가기</button><script nonce="${scriptNonce}">${script}</script></body></html>`);
  });

  app.get<{ Querystring: { id?: string } }>('/embed/v1/loader.js', async (request, reply) => {
    const id = request.query.id;
    if (!id || !validId(id)) return reply.code(400).send({ error: 'INVALID_INSTALLATION' });
    const installation = await pool.query(
      'SELECT 1 FROM spike.widget_installations WHERE id = $1 AND active = true', [id],
    );
    if (!installation.rowCount) return reply.code(404).send({ error: 'INSTALLATION_NOT_FOUND' });
    reply.headers({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    return reply.send(`(() => { const script = document.currentScript; const endpoint = new URL(script.src); const frame = document.createElement('iframe'); frame.title = '사업자 AI 상담'; frame.referrerPolicy = 'origin'; frame.style.cssText = 'width:100%;min-height:140px;border:0'; frame.src = endpoint.origin + '/embed/v1/' + encodeURIComponent(${JSON.stringify(id)}) + '/frame'; frame.addEventListener('load', () => frame.contentWindow.postMessage({ type: 'fieldai:embed-init', installationId: ${JSON.stringify(id)} }, endpoint.origin)); script.insertAdjacentElement('afterend', frame); })();`);
  });

  app.post<{ Body: { nonce?: string } }>('/embed/v1/sessions', async (request, reply) => {
    const nonce = request.body?.nonce;
    if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(nonce)) {
      return reply.code(400).send({ error: 'INVALID_NONCE' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const used = await client.query<{ installation_id: string; parent_origin: string }>(
        'DELETE FROM spike.widget_nonces WHERE nonce_hash = $1 AND expires_at > now() RETURNING installation_id, parent_origin',
        [hash(nonce)],
      );
      const usedNonce = used.rows[0];
      if (!usedNonce) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'NONCE_EXPIRED_OR_USED' });
      }
      const token = randomToken();
      const sessionId = randomUUID();
      await client.query(
        `INSERT INTO spike.widget_sessions (id, token_hash, installation_id, parent_origin, expires_at)
         VALUES ($1, $2, $3, $4, now() + interval '24 hours')`,
        [sessionId, hash(token), usedNonce.installation_id, usedNonce.parent_origin],
      );
      await client.query('COMMIT');
      return reply.code(201).send({ sessionId, token });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  });

  app.post('/embed/v1/handoffs', async (request, reply) => {
    const bearer = /^Bearer ([A-Za-z0-9_-]{40,64})$/.exec(request.headers.authorization ?? '');
    const bearerToken = bearer?.[1];
    if (!bearerToken) return reply.code(401).send({ error: 'INVALID_SESSION' });
    const session = await pool.query<{ id: string }>(
      `SELECT s.id FROM spike.widget_sessions s
       JOIN spike.widget_installations i ON i.id = s.installation_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND i.active = true`,
      [hash(bearerToken)],
    );
    const sessionRow = session.rows[0];
    if (!sessionRow) return reply.code(401).send({ error: 'INVALID_SESSION' });
    const ticket = randomToken();
    await pool.query(
      `INSERT INTO spike.widget_handoffs (ticket_hash, session_id, expires_at)
       VALUES ($1, $2, now() + interval '1 minute')`,
      [hash(ticket), sessionRow.id],
    );
    return reply.code(201).send({ ticket });
  });

  app.get('/embed/v1/wait', async (_request, reply) => {
    const scriptNonce = randomToken();
    reply.headers({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${scriptNonce}'; connect-src 'self'`,
    });
    const script = `
      const status = document.getElementById('status');
      if (!window.opener) status.textContent = '상담 연결을 시작할 수 없습니다';
      else {
        const receiveTicket = async (event) => {
          if (event.source !== window.opener || event.origin !== window.location.origin ||
              event.data?.type !== 'fieldai:handoff-ticket' ||
              typeof event.data?.ticket !== 'string' ||
              !/^[A-Za-z0-9_-]{40,64}$/.test(event.data.ticket)) return;
          window.removeEventListener('message', receiveTicket);
          const ticket = event.data.ticket;
          try {
            const response = await fetch('/embed/v1/continue', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ ticket }), credentials: 'same-origin',
            });
            if (!response.ok || new URL(response.url).pathname !== '/embed/v1/received') throw new Error('HANDOFF_FAILED');
            window.location.replace('/embed/v1/received');
          } catch { status.textContent = '상담 연결 실패'; }
        };
        window.addEventListener('message', receiveTicket);
        window.opener.postMessage({ type: 'fieldai:handoff-ready' }, window.location.origin);
      }`;
    return reply.send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AP 상담 연결</title></head><body><main><p id="status">상담 화면 연결 중</p></main><script nonce="${scriptNonce}">${script}</script></body></html>`);
  });

  app.post('/embed/v1/continue', async (request, reply) => {
    const expectedOrigin = `${request.protocol}://${request.headers.host}`;
    if (request.headers.origin !== expectedOrigin) return reply.code(403).send({ error: 'ORIGIN_DENIED' });
    const ticket = typeof request.body === 'string'
      ? new URLSearchParams(request.body).get('ticket')
      : (request.body as { ticket?: unknown } | undefined)?.ticket;
    if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(ticket)) {
      return reply.code(400).send({ error: 'INVALID_TICKET' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const consumed = await client.query<{ session_id: string }>(
        `UPDATE spike.widget_handoffs h SET consumed_at = now()
         WHERE h.ticket_hash = $1 AND h.consumed_at IS NULL AND h.expires_at > now()
           AND EXISTS (SELECT 1 FROM spike.widget_sessions s
             JOIN spike.widget_installations i ON i.id = s.installation_id
             WHERE s.id = h.session_id AND s.expires_at > now() AND i.active = true)
         RETURNING h.session_id`,
        [hash(ticket)],
      );
      const consumedRow = consumed.rows[0];
      if (!consumedRow) {
        await client.query('ROLLBACK');
        return reply.code(410).send({ error: 'TICKET_EXPIRED_OR_USED' });
      }
      const capability = randomToken();
      await client.query(
        `INSERT INTO spike.first_party_sessions (token_hash, session_id, expires_at)
         VALUES ($1, $2, now() + interval '24 hours')`,
        [hash(capability), consumedRow.session_id],
      );
      await client.query('COMMIT');
      const secure = request.protocol === 'https' ? '; Secure' : '';
      reply.headers({
        'Set-Cookie': `ap_spike_customer=${capability}; HttpOnly; SameSite=Lax; Path=/embed/v1/received; Max-Age=86400${secure}`,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Location': '/embed/v1/received',
      });
      return reply.code(303).send();
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  });

  app.get('/embed/v1/received', async (request, reply) => {
    reply.headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    const capability = /(?:^|;\s*)ap_spike_customer=([A-Za-z0-9_-]{40,64})(?:;|$)/.exec(request.headers.cookie ?? '')?.[1];
    if (!capability) return reply.code(401).send({ error: 'SESSION_REQUIRED' });
    const result = await pool.query(
      `SELECT 1 FROM spike.first_party_sessions f
       JOIN spike.widget_sessions s ON s.id = f.session_id
       JOIN spike.widget_installations i ON i.id = s.installation_id
       WHERE f.token_hash = $1 AND f.expires_at > now() AND s.expires_at > now() AND i.active = true`,
      [hash(capability)],
    );
    if (!result.rowCount) return reply.code(401).send({ error: 'SESSION_REQUIRED' });
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.send('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AP 상담 연결</title></head><body><main><h1>대화 이어가기 준비 완료</h1></main></body></html>');
  });
}
