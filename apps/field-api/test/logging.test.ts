import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import Fastify from 'fastify';
import { logLevelFromEnvironment, loggingOptionsFromEnvironment, maskLogText, maskLogValue, REDACT_PATHS } from '../src/logging.js';

test('Field log masking keeps only the phone prefix and last four digits and the first email character', () => {
  assert.equal(maskLogText('연락처 010-1234-5678, 01198765432, 016 123 4567'), '연락처 010-****-5678, 011-****-5432, 016-****-4567');
  assert.equal(maskLogText('kim.customer@example.co.kr 로 회신'), 'k***@example.co.kr 로 회신');
  // 패키지 경로(name@1.2.3)는 이메일이 아니다.
  assert.equal(maskLogText('/node_modules/.pnpm/fastify@5.12.5/x.js'), '/node_modules/.pnpm/fastify@5.12.5/x.js');
  assert.equal(maskLogText('GET /v1/inquiries/abc?receipt=secret-key&phone=01012345678 실패'), 'GET /v1/inquiries/abc 실패');
  // 전화번호 모양이 아닌 긴 숫자(시각·ID)는 그대로 둔다.
  assert.equal(maskLogText('id 2010123456789 at 1759000000000'), 'id 2010123456789 at 1759000000000');
  assert.deepEqual(maskLogValue({ customer: { phone: '010-2222-3333', emails: ['lee@example.com'] }, count: 3 }),
    { customer: { phone: '010-****-3333', emails: ['l***@example.com'] }, count: 3 });
});

test('Field log level comes from FIELD_LOG_LEVEL, allows silent and rejects unknown values', () => {
  assert.equal(logLevelFromEnvironment('silent'), 'silent');
  assert.equal(logLevelFromEnvironment('debug'), 'debug');
  assert.throws(() => logLevelFromEnvironment('verbose'), /FIELD_LOG_LEVEL is invalid/);
  assert.ok(REDACT_PATHS.includes('req.headers["authorization"]'));
  assert.ok(REDACT_PATHS.includes('headers["x-receipt-key"]'));
  assert.ok(REDACT_PATHS.includes('req.body'));
});

test('Field request log is one compact line without body, query, headers or customer identifiers', async () => {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({ write(chunk, _encoding, done) { lines.push(...String(chunk).trim().split('\n').map(line => JSON.parse(line))); done(); } });
  const options = loggingOptionsFromEnvironment();
  const app = Fastify({ ...options, logger: { ...(options.logger as object), level: 'info', stream } });
  app.post('/v1/things/:id', async request => {
    request.log.info({ headers: request.headers, contact: 'park@example.com / 010-5555-6666' }, '고객 010-5555-6666 확인');
    return { ok: true };
  });
  app.get('/v1/fail', async () => { throw new Error('저장 실패 customer=010-7777-8888 choi@example.com'); });
  try {
    const organization = '6f0c2a8e-1b2c-4d3e-8f40-5a6b7c8d9e0f';
    const response = await app.inject({ method: 'POST', url: '/v1/things/abc?receipt=top-secret', payload: { phone: '010-9999-0000' },
      headers: { authorization: 'Bearer receipt-secret', cookie: 'session=cookie-secret', 'x-receipt-key': 'receipt-header-secret',
        'x-request-id': 'edge-req-1', 'x-organization-id': organization } });
    assert.equal(response.statusCode, 200);
    assert.equal((await app.inject({ url: '/v1/fail' })).statusCode, 500);
    assert.equal((await app.inject({ url: '/v1/missing?email=a@b.com' })).statusCode, 404);
    const text = JSON.stringify(lines);
    for (const secret of ['receipt-secret', 'cookie-secret', 'receipt-header-secret', 'top-secret', '010-9999-0000',
      '5555-6666', '7777-8888', 'park@', 'choi@', 'a@b.com']) assert.ok(!text.includes(secret), secret);
    const custom = lines.find(line => line.msg === '고객 010-****-6666 확인')!;
    assert.equal(custom.requestId, 'edge-req-1');
    assert.equal(custom.contact, 'p***@example.com / 010-****-6666');
    assert.equal((custom.headers as Record<string, string>).authorization, '[redacted]');
    assert.equal((custom.headers as Record<string, string>)['x-receipt-key'], '[redacted]');
    const completed = lines.filter(line => line.msg === 'request completed');
    assert.equal(completed.length, 3);
    assert.deepEqual({ ...completed[0], time: undefined, ms: undefined, pid: undefined, hostname: undefined },
      { level: 30, time: undefined, pid: undefined, hostname: undefined, requestId: 'edge-req-1', method: 'POST',
        url: '/v1/things/:id', statusCode: 200, ms: undefined, organizationId: organization, msg: 'request completed' });
    assert.equal(typeof completed[0]!.ms, 'number');
    assert.equal(completed[1]!.statusCode, 500);
    assert.equal(completed[2]!.url, '/v1/missing');
    assert.equal(completed[2]!.statusCode, 404);
    assert.match(String(completed[2]!.requestId), /^[0-9a-f-]{36}$/);
    assert.equal(lines.filter(line => line.msg === 'incoming request').length, 0);
    const failed = lines.find(line => line.level === 50)!;
    assert.equal((failed.err as { message: string }).message, '저장 실패 customer=010-****-8888 c***@example.com');
    assert.deepEqual(failed.req, { method: 'GET', url: '/v1/fail' });
  } finally { await app.close(); }
});
