import { createHmac, timingSafeEqual } from 'node:crypto';
import { request } from 'node:https';
import type { LookupFunction } from 'node:net';
import type { TLSSocket } from 'node:tls';
import type { DomainEdgeProvider } from './custom-domains.js';

// Caddy on-demand TLS용 edge 어댑터(추가). Caddy는 hostname→사이트 바인딩을 따로 저장하지 않는다.
// 바인딩의 원본은 Field DB이고(allow·site-hosts 조회), Caddy는 ask가 허용한 도메인에만 인증서를 발급한다.
// 이 어댑터는 실제 HTTPS 요청으로 "신뢰 체인 인증서 + Field 상태 응답 + 같은 도메인·조직의 HMAC 증명"을 확인했을 때만 ready를 보고한다.
export const FIELD_SITE_HEALTH_PATH = '/.well-known/field-site-health';
// 상태 경로 증명값. 조직 ID는 공개 조회로 알 수 있으므로 서버 비밀값(FIELD_AUTH_SECRET)에서 용도별 하위 키를 만들어
// HMAC-SHA256(하위 키, 도메인 + ':' + 조직 ID)을 쓴다. Field API 밖에서는 이 값을 만들 수 없다.
export function siteHealthSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.FIELD_AUTH_SECRET;
  if (!secret) throw new Error('FIELD_AUTH_SECRET is required for the site health proof');
  return secret;
}
export function siteHealthProof(secret: string, hostname: string, organizationId: string) {
  const key = createHmac('sha256', secret).update('field-site-health-v1').digest();
  return createHmac('sha256', key).update(`${hostname}:${organizationId}`).digest('hex');
}
function sameProof(actual: string, expected: string) {
  const a = Buffer.from(actual, 'utf8'), b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
export type EdgeProbeResult = { ok: true; proof: string; certificateExpiresAt: string }
  | { ok: false; reason: 'certificate_untrusted' | 'tls_handshake' | 'timeout' | 'health_status' | 'health_body' };
export type EdgeProbe = (hostname: string) => Promise<EdgeProbeResult>;

const CERTIFICATE_ERROR = /CERT|SIGNATURE|ALTNAME|ISSUER/;
const MAX_HEALTH_BODY_BYTES = 4096;

// https://<domain>/.well-known/field-site-health 를 SNI=도메인으로 요청한다. 기본 신뢰 저장소로 체인과 호스트 이름을 검증하므로
// 자체 서명·만료·다른 이름 인증서는 거절된다. lookup·port는 검수에서 로컬 TLS 서버로 보내기 위한 주입점이다.
export function httpsSiteHealthProbe(options: { timeoutMs: number; port?: number; lookup?: LookupFunction }): EdgeProbe {
  return hostname => new Promise(resolve => {
    let settled = false;
    const finish = (result: EdgeProbeResult) => { if (!settled) { settled = true; resolve(result); } };
    const outgoing = request({ hostname, servername: hostname, port: options.port ?? 443, path: FIELD_SITE_HEALTH_PATH, method: 'GET',
      agent: false, rejectUnauthorized: true, lookup: options.lookup, signal: AbortSignal.timeout(options.timeoutMs),
      headers: { accept: 'application/json' } }, response => {
      const socket = response.socket as TLSSocket;
      const certificate = socket.getPeerCertificate();
      if (!socket.authorized || !certificate?.valid_to) { response.destroy(); finish({ ok: false, reason: 'certificate_untrusted' }); return; }
      if (response.statusCode !== 200) { response.resume(); finish({ ok: false, reason: 'health_status' }); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_HEALTH_BODY_BYTES) { response.destroy(); finish({ ok: false, reason: 'health_body' }); }
        else chunks.push(chunk);
      });
      response.on('error', () => finish({ ok: false, reason: 'tls_handshake' }));
      response.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { ok?: unknown; proof?: unknown };
          const expiresAt = new Date(certificate.valid_to);
          if (body?.ok !== true || typeof body.proof !== 'string' || !Number.isFinite(expiresAt.getTime()))
            finish({ ok: false, reason: 'health_body' });
          else finish({ ok: true, proof: body.proof, certificateExpiresAt: expiresAt.toISOString() });
        } catch { finish({ ok: false, reason: 'health_body' }); }
      });
    });
    outgoing.on('error', error => {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      finish({ ok: false, reason: CERTIFICATE_ERROR.test(code) ? 'certificate_untrusted'
        : error.name === 'AbortError' || error.name === 'TimeoutError' || code === 'ABORT_ERR' ? 'timeout' : 'tls_handshake' });
    });
    outgoing.end();
  });
}

// 확인 실패(인증서 거절·핸드셰이크 실패·응답·증명 불일치)는 pending으로만 보고한다. 실패가 얼마나 이어졌는지(유예)는
// 도메인 작업자가 DB(checked_at·last_error)로 판정하므로 여러 작업자·재시작이 같은 시각을 본다.
export function createCaddyDomainEdge(options: { probe: EdgeProbe; secret: string }): DomainEdgeProvider {
  return {
    async ensureBinding(input) {
      const base = { hostname: input.hostname, siteId: input.siteId, generation: input.generation };
      const result = await options.probe(input.hostname);
      if (result.ok && sameProof(result.proof, siteHealthProof(options.secret, input.hostname, input.organizationId)))
        return { ...base, state: 'ready', certificateExpiresAt: result.certificateExpiresAt };
      return { ...base, state: 'pending', certificateExpiresAt: null };
    },
    // Caddy에는 지울 바인딩이 없다. desired_state가 바뀐 순간부터 Field의 ask·site-hosts 조회가 이 hostname을 거부하므로
    // 새 인증서 발급·갱신과 사이트 연결이 멈춘다. 이미 발급된 인증서는 만료까지 Caddy 저장소에 남지만 사이트로 연결되지 않는다.
    async removeBinding() { return true; },
  };
}

// FIELD_DOMAIN_EDGE=caddy일 때만 어댑터를 만든다. 비어 있으면 undefined → 기존 blocked_integration 동작을 유지한다.
export function domainEdgeFromEnvironment(env: NodeJS.ProcessEnv = process.env): DomainEdgeProvider | undefined {
  const kind = env.FIELD_DOMAIN_EDGE;
  if (!kind) return undefined;
  if (kind !== 'caddy') throw new Error('FIELD_DOMAIN_EDGE must be "caddy" or unset');
  const raw = env.FIELD_DOMAIN_EDGE_PROBE_TIMEOUT_MS;
  const timeoutMs = raw === undefined || raw === '' ? 5000 : Number(raw);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 60_000)
    throw new Error('FIELD_DOMAIN_EDGE_PROBE_TIMEOUT_MS must be an integer between 500 and 60000');
  return createCaddyDomainEdge({ probe: httpsSiteHealthProbe({ timeoutMs }), secret: siteHealthSecret(env) });
}
