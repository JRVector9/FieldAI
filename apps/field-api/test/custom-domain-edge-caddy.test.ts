import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import { createServer as createTcpServer, type AddressInfo, type LookupFunction } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createCaddyDomainEdge, domainEdgeFromEnvironment, httpsSiteHealthProbe, siteHealthProof, type EdgeProbe } from '../src/custom-domain-edge-caddy.js';

const ORGANIZATION_ID = '6f1c2b8e-3d4a-4c5b-9e6f-7a8b9c0d1e2f';
const SECRET = 'synthetic-field-auth-secret-for-edge-tests';
const binding = { hostname: 'shop.example.com', siteId: 'site-1', organizationId: ORGANIZATION_ID,
  requestKey: 'domain-1:1:bind', domainId: 'domain-1', generation: 1 };
// 모든 이름을 로컬 TLS 서버로 보낸다(SNI·인증서 이름 검증은 원래 hostname으로 한다).
const loopback = ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
  if (options?.all) callback(null, [{ address: '127.0.0.1', family: 4 }]);
  else callback(null, '127.0.0.1', 4);
}) as unknown as LookupFunction;

let directory = '';
let healthRequests = 0;
const tls = createHttpsServer({}, (_request, response) => {
  healthRequests += 1;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ ok: true, proof: siteHealthProof(SECRET, 'shop.example.com', ORGANIZATION_ID) }));
});
const silent = createTcpServer(() => undefined);
before(async () => {
  // 신뢰 저장소에 없는 자체 서명 인증서(이름은 정확히 일치)로 서버를 띄운다.
  directory = mkdtempSync(join(tmpdir(), 'field-edge-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=shop.example.com',
    '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem')], { stdio: 'ignore' });
  tls.setSecureContext({ key: readFileSync(join(directory, 'key.pem')), cert: readFileSync(join(directory, 'cert.pem')) });
  await new Promise<void>(resolve => tls.listen(0, '127.0.0.1', resolve));
  await new Promise<void>(resolve => silent.listen(0, '127.0.0.1', resolve));
});
after(async () => {
  await new Promise(resolve => tls.close(resolve));
  await new Promise(resolve => silent.close(resolve));
  rmSync(directory, { recursive: true, force: true });
});

test('Caddy edge probe rejects a self-signed certificate before reading the health response', async () => {
  const probe = httpsSiteHealthProbe({ timeoutMs: 3000, port: (tls.address() as AddressInfo).port, lookup: loopback });
  assert.deepEqual(await probe('shop.example.com'), { ok: false, reason: 'certificate_untrusted' });
  assert.equal(healthRequests, 0);
});

// 유예 판정은 프로세스 메모리 대신 도메인 작업자가 DB(checked_at·last_error)로 하므로(custom-domains.db.test.ts),
// 어댑터는 거절된 인증서를 몇 번 보든 pending만 보고하고 failed를 스스로 만들지 않는다.
test('Caddy edge reports only pending for a rejected certificate and leaves the grace window to the worker', async () => {
  const edge = createCaddyDomainEdge({ secret: SECRET,
    probe: httpsSiteHealthProbe({ timeoutMs: 3000, port: (tls.address() as AddressInfo).port, lookup: loopback }) });
  for (let attempt = 0; attempt < 3; attempt += 1)
    assert.deepEqual(await edge.ensureBinding(binding),
      { hostname: 'shop.example.com', siteId: 'site-1', generation: 1, state: 'pending', certificateExpiresAt: null });
  assert.equal(healthRequests, 0);
});

test('Caddy edge probe times out on a server that never completes the TLS handshake', async () => {
  const probe = httpsSiteHealthProbe({ timeoutMs: 300, port: (silent.address() as AddressInfo).port, lookup: loopback });
  assert.deepEqual(await probe('shop.example.com'), { ok: false, reason: 'timeout' });
});

test('Caddy edge is ready only for the server HMAC proof of the same domain and organization', async () => {
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  let proof = siteHealthProof(SECRET, 'shop.example.com', ORGANIZATION_ID);
  const probe: EdgeProbe = async hostname => {
    assert.equal(hostname, 'shop.example.com');
    return { ok: true, proof, certificateExpiresAt: expiresAt };
  };
  const edge = createCaddyDomainEdge({ probe, secret: SECRET });
  assert.deepEqual(await edge.ensureBinding(binding),
    { hostname: 'shop.example.com', siteId: 'site-1', generation: 1, state: 'ready', certificateExpiresAt: expiresAt });
  // 다른 조직·다른 도메인·다른 비밀값의 증명, 공개 조직 ID를 그대로 돌려주는 위조 응답은 연결하지 않는다.
  for (const forged of [siteHealthProof(SECRET, 'shop.example.com', '00000000-0000-4000-8000-000000000000'),
    siteHealthProof(SECRET, 'other.example.com', ORGANIZATION_ID), siteHealthProof('another-secret', 'shop.example.com', ORGANIZATION_ID),
    ORGANIZATION_ID, '']) {
    proof = forged;
    assert.equal((await edge.ensureBinding(binding)).state, 'pending', forged);
  }
  assert.equal(await edge.removeBinding(binding), true);
});

test('Caddy edge is configured only by FIELD_DOMAIN_EDGE=caddy with a bounded probe timeout', () => {
  assert.equal(domainEdgeFromEnvironment({}), undefined);
  assert.equal(domainEdgeFromEnvironment({ FIELD_DOMAIN_EDGE: '' }), undefined);
  assert.equal(typeof domainEdgeFromEnvironment({ FIELD_DOMAIN_EDGE: 'caddy', FIELD_AUTH_SECRET: SECRET })?.ensureBinding, 'function');
  assert.equal(typeof domainEdgeFromEnvironment({ FIELD_DOMAIN_EDGE: 'caddy', FIELD_AUTH_SECRET: SECRET, FIELD_DOMAIN_EDGE_PROBE_TIMEOUT_MS: '2000' })?.ensureBinding, 'function');
  // 증명 비밀값이 없으면 시작하지 않는다.
  assert.throws(() => domainEdgeFromEnvironment({ FIELD_DOMAIN_EDGE: 'caddy' }), /FIELD_AUTH_SECRET/);
  assert.throws(() => domainEdgeFromEnvironment({ FIELD_DOMAIN_EDGE: 'cloudflare' }), /FIELD_DOMAIN_EDGE/);
  for (const value of ['abc', '0', '1.5', '600000'])
    assert.throws(() => domainEdgeFromEnvironment({ FIELD_DOMAIN_EDGE: 'caddy', FIELD_AUTH_SECRET: SECRET, FIELD_DOMAIN_EDGE_PROBE_TIMEOUT_MS: value }), /TIMEOUT_MS/);
});
