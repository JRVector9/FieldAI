import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentApp } from '../src/app.js';

test('AP readiness succeeds when its own database responds', async () => {
  const app = createAgentApp(async () => undefined);
  const response = await app.inject('/health/ready');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { product: 'agent', status: 'ready' });
  await app.close();
});

test('AP readiness fails when its own database is unavailable', async () => {
  const app = createAgentApp(async () => { throw new Error('db unavailable'); });
  const response = await app.inject('/health/ready');
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { product: 'agent', status: 'unavailable' });
  await app.close();
});

test('AP auth HTTP route forwards form body and response cookie', async () => {
  const app = createAgentApp(async () => undefined, async (request) => {
    assert.equal(request.method, 'POST');
    assert.equal(await request.text(), 'grant_type=authorization_code');
    return new Response('created', {
      status: 201,
      headers: { 'content-type': 'text/plain', 'set-cookie': 'ap_session=test; HttpOnly' },
    });
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/oauth2/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'grant_type=authorization_code',
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body, 'created');
  assert.match(response.headers['set-cookie']?.toString() ?? '', /ap_session=test/);
  await app.close();
});

// 보안 #1: 5xx 응답에는 DB 오류 문구·SQLSTATE·내부 메시지를 싣지 않는다. 4xx와 보존 종료(PAP01)는 그대로다.
test('AP error responses hide 5xx details and keep 4xx and retention-ended bodies', async () => {
  const app = createAgentApp(async () => undefined);
  app.get('/v1/test/db-error', async () => { throw Object.assign(new Error('invalid byte sequence for encoding "UTF8": 0x00'), { code: '22021' }); });
  app.get('/v1/test/unavailable', async () => { throw Object.assign(new Error('AP revocation journal unavailable'), { statusCode: 503 }); });
  app.get('/v1/test/bad-request', async () => { throw Object.assign(new Error('body is not valid'), { statusCode: 400 }); });
  app.get('/v1/test/retention', async () => { throw Object.assign(new Error('retention work ended'), { code: 'PAP01' }); });
  try {
    const failed = await app.inject('/v1/test/db-error');
    assert.equal(failed.statusCode, 500);
    assert.deepEqual(failed.json(), { error: 'internal_error' });
    assert.doesNotMatch(failed.body, /22021|UTF8/);
    const unavailable = await app.inject('/v1/test/unavailable');
    assert.equal(unavailable.statusCode, 503);
    assert.deepEqual(unavailable.json(), { error: 'internal_error' });
    const badRequest = await app.inject('/v1/test/bad-request');
    assert.equal(badRequest.statusCode, 400);
    assert.equal(badRequest.json().message, 'body is not valid');
    const ended = await app.inject('/v1/test/retention');
    assert.equal(ended.statusCode, 410);
    assert.deepEqual(ended.json(), { error: 'retention_work_ended' });
  } finally { await app.close(); }
});

// P3: 프록시 신뢰 설정은 Field와 같은 규칙(true/false/목록), 요청 수신 제한 시간은 기본 30초·범위 밖 거부다.
test('AP trust proxy and request timeout settings parse like Field and reject invalid values', async () => {
  const { requestTimeoutFromEnvironment, trustProxyFromEnvironment } = await import('../src/app.js');
  assert.equal(trustProxyFromEnvironment(undefined), 'loopback');
  assert.equal(trustProxyFromEnvironment(' '), 'loopback');
  assert.equal(trustProxyFromEnvironment('true'), true);
  assert.equal(trustProxyFromEnvironment('false'), false);
  assert.equal(trustProxyFromEnvironment('10.0.0.0/8,loopback'), '10.0.0.0/8,loopback');
  assert.equal(requestTimeoutFromEnvironment(undefined), 30_000);
  assert.equal(requestTimeoutFromEnvironment('45000'), 45_000);
  for (const invalid of ['999', '600001', '30s', '-1', '1e4'])
    assert.throws(() => requestTimeoutFromEnvironment(invalid), /AP_REQUEST_TIMEOUT_MS is invalid/, invalid);
  const app = createAgentApp(async () => undefined);
  // initialConfig 타입 정의에는 없지만 Fastify가 실제 적용한 값을 담는다
  try { assert.equal((app.initialConfig as { requestTimeout?: number }).requestTimeout, 30_000); } finally { await app.close(); }
});
