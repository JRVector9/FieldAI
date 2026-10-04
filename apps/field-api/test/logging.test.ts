import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import Fastify from 'fastify';
import { logLevelFromEnvironment, loggingOptionsFromEnvironment, maskLogText, maskLogValue, REDACT_PATHS } from '../src/logging.js';
import { createFieldApp } from '../src/app.js';

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

// Security #1: 5xx는 DB 오류 문구·SQLSTATE 대신 고정 코드만 돌려주고, 4xx(형식·크기)는 그대로 둔다.
test('Field 5xx responses hide internal error details while 4xx keep their code', async () => {
  const app = createFieldApp(async () => undefined);
  app.get('/synthetic/db-error', async () => {
    throw Object.assign(new Error('invalid byte sequence for encoding "UTF8": 0x00'), { code: '22021' });
  });
  app.get('/synthetic/unavailable', async () => { throw Object.assign(new Error('Field revocation journal unavailable'), { statusCode: 503 }); });
  app.post('/synthetic/body', async () => ({ ok: true }));
  try {
    const failed = await app.inject('/synthetic/db-error');
    assert.equal(failed.statusCode, 500);
    assert.deepEqual(failed.json(), { error: 'internal_error' });
    assert.doesNotMatch(failed.body, /22021|UTF8|0x00/);
    const unavailable = await app.inject('/synthetic/unavailable');
    assert.deepEqual([unavailable.statusCode, unavailable.json()], [503, { error: 'internal_error' }]);
    const malformed = await app.inject({ method: 'POST', url: '/synthetic/body', headers: { 'content-type': 'application/json' }, payload: '{' });
    assert.equal(malformed.statusCode, 400);
    assert.equal(malformed.json().code, 'FST_ERR_CTP_INVALID_JSON_BODY');
  } finally { await app.close(); }
});

// Security #11: 요청 전체 제한 시간은 기본 30초이고 FIELD_REQUEST_TIMEOUT_MS로 바꾼다. 범위 밖 값은 기동을 멈춘다.
test('Field request timeout defaults to 30 seconds and validates FIELD_REQUEST_TIMEOUT_MS', async () => {
  const previous = process.env.FIELD_REQUEST_TIMEOUT_MS;
  try {
    delete process.env.FIELD_REQUEST_TIMEOUT_MS;
    const app = createFieldApp(async () => undefined);
    assert.equal(app.server.requestTimeout, 30_000);
    await app.close();
    process.env.FIELD_REQUEST_TIMEOUT_MS = '15000';
    const configured = createFieldApp(async () => undefined);
    assert.equal(configured.server.requestTimeout, 15_000);
    await configured.close();
    for (const invalid of ['0', '999', 'abc', '600001'])
      assert.throws(() => { process.env.FIELD_REQUEST_TIMEOUT_MS = invalid; createFieldApp(async () => undefined); }, /FIELD_REQUEST_TIMEOUT_MS/);
  } finally {
    if (previous === undefined) delete process.env.FIELD_REQUEST_TIMEOUT_MS; else process.env.FIELD_REQUEST_TIMEOUT_MS = previous;
  }
});

test('Field rejects NUL in decoded text before handlers and preserves binary bodies',async()=>{
  let calls=0;
  const app=createFieldApp(async()=>undefined,async()=>{calls++;return Response.json({ok:true});});
  app.post('/synthetic/text/:id',async()=>{calls++;return {ok:true};});
  app.post('/synthetic/binary',async request=>{calls++;return {bytes:[...(request.body as Buffer)]};});
  try {
    for(const request of [
      {method:'POST' as const,url:'/synthetic/text/abc',payload:{message:'hello\0there'}},
      {method:'POST' as const,url:'/synthetic/text/abc',payload:{nested:[{message:'\0'}]}},
      {method:'POST' as const,url:'/synthetic/text/abc',payload:{['bad\0key']:'hello'}},
      {method:'POST' as const,url:'/synthetic/text/abc?message=%00',payload:{}},
      {method:'POST' as const,url:'/synthetic/text/%00',payload:{}},
      {method:'POST' as const,url:'/api/auth/sign-in/email',headers:{'content-type':'application/x-www-form-urlencoded'},payload:'email=hello%00example&password=x'},
    ]){
      const response=await app.inject(request);assert.equal(response.statusCode,400,request.url);assert.deepEqual(response.json(),{error:'invalid_text'});
    }
    assert.equal(calls,0);
    const binary=await app.inject({method:'POST',url:'/synthetic/binary',headers:{'content-type':'application/octet-stream'},payload:Buffer.from([1,0,2])});
    assert.equal(binary.statusCode,200);assert.deepEqual(binary.json(),{bytes:[1,0,2]});assert.equal(calls,1);
    assert.equal((await app.inject({method:'POST',url:'/synthetic/text/abc',payload:{message:'한글🙂'}})).statusCode,200);
  }finally{await app.close();}
});
