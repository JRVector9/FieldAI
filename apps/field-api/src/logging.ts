import { randomUUID } from 'node:crypto';
import { LogController, type FastifyReply, type FastifyRequest, type FastifyServerOptions } from 'fastify';

// Field 구조화 로그 설정. 요청 본문·헤더·쿼리 문자열은 남기지 않고, 메시지와 객체의 전화번호·이메일은 가린다.
// 로그 보관 기간·접근 권한은 로그를 수집하는 호스트(컨테이너 런타임·수집기)의 책임이다.
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const PHONE_PATTERN = /(?<!\d)(01[016789])[- ]?\d{3,4}[- ]?(\d{4})(?!\d)/g;
const EMAIL_PATTERN = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63})(?![A-Za-z0-9-])/g;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_MASK_DEPTH = 6;
// 인증 수단이 되는 헤더. 헤더를 통째로 기록하는 코드가 생겨도 값이 남지 않게 한다.
export const SENSITIVE_HEADER_NAMES = ['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-receipt-key',
  'x-solapi-secret', 'x-signature', 'x-admin-billing-session-id', 'x-support-access-id', 'x-field-route-key-session-id'] as const;
const HEADER_CONTAINERS = ['req.headers', 'res.headers', 'request.headers', 'headers'];
export const REDACT_PATHS = [
  ...HEADER_CONTAINERS.flatMap(container => SENSITIVE_HEADER_NAMES.map(name => `${container}["${name}"]`)),
  // 요청 본문은 고객 입력이므로 기록하지 않는다.
  'req.body', 'request.body', 'body',
];

export function maskLogText(value: string): string {
  return value.replace(PHONE_PATTERN, '$1-****-$2').replace(EMAIL_PATTERN, '$1***@$2')
    // 로그 문장 안의 URL 쿼리(토큰·확인키가 실릴 수 있음)는 지운다.
    .replace(/(\/[^\s?]*)\?\S*/g, '$1');
}

export function maskLogValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return maskLogText(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_MASK_DEPTH) return '[depth]';
  if (value instanceof Error) return serializeError(value);
  if (Array.isArray(value)) return value.map(item => maskLogValue(item, depth + 1));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, maskLogValue(item, depth + 1)]));
}

function serializeError(error: Error) {
  const extra = error as Error & { code?: unknown; statusCode?: unknown };
  return { type: error.name, message: maskLogText(error.message), stack: maskLogText(error.stack ?? ''),
    code: typeof extra.code === 'string' ? extra.code : undefined,
    statusCode: typeof extra.statusCode === 'number' ? extra.statusCode : undefined };
}

// 경로 매개변수에 토큰이 올 수 있으므로 일치한 라우트 패턴을 우선 쓰고, 없으면 쿼리를 뗀 경로를 쓴다.
function requestPath(request: FastifyRequest) {
  return maskLogText(request.routeOptions?.url ?? request.url.split('?')[0]!);
}
function organizationId(request: FastifyRequest) {
  const selected = request.headers['x-organization-id'];
  return typeof selected === 'string' && UUID_PATTERN.test(selected) ? selected : undefined;
}

// 요청마다 완료 줄 하나(method·경로·상태·ms·requestId·조직)만 남긴다. 고객 식별 정보는 넣지 않는다.
class CompactLogController extends LogController {
  override incomingRequest() {}
  override routeNotFound() {}
  override requestCompleted(error: Error | null | undefined, request: FastifyRequest, reply: FastifyReply) {
    if (this.isLogDisabled(request)) return;
    const line = { method: request.method, url: requestPath(request), statusCode: reply.statusCode,
      ms: Math.round(reply.elapsedTime), organizationId: organizationId(request) };
    if (error) reply.log.error({ ...line, err: error }, 'request errored');
    else reply.log.info(line, 'request completed');
  }
}

export function logLevelFromEnvironment(value = process.env.FIELD_LOG_LEVEL) {
  // node:test 실행 중에는 기본값을 silent로 두어 테스트 출력에 요청 로그가 섞이지 않게 한다.
  if (value === undefined || value === '') return process.env.NODE_TEST_CONTEXT ? 'silent' : 'info';
  if (!(LOG_LEVELS as readonly string[]).includes(value)) throw new Error('FIELD_LOG_LEVEL is invalid');
  return value;
}

export function requestIdFromHeaders(headers: { [name: string]: string | string[] | undefined }) {
  const supplied = headers['x-request-id'];
  return typeof supplied === 'string' && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
}

export function loggingOptionsFromEnvironment(): Pick<FastifyServerOptions, 'logger' | 'logController' | 'genReqId'> {
  return {
    logger: {
      level: logLevelFromEnvironment(),
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      serializers: {
        req: (request: FastifyRequest) => ({ method: request.method, url: requestPath(request) }),
        res: (reply: { statusCode: number }) => ({ statusCode: reply.statusCode }),
        err: serializeError,
        msg: (message: unknown) => typeof message === 'string' ? maskLogText(message) : message,
      },
      formatters: {
        // req/res/err는 위 serializer가 처리하고, 나머지 값은 문자열 속 전화번호·이메일을 가린다.
        log: object => Object.fromEntries(Object.entries(object).map(([key, value]) =>
          [key, key === 'req' || key === 'res' || key === 'err' ? value : maskLogValue(value)])),
      },
    },
    logController: new CompactLogController({ requestIdLogLabel: 'requestId' }),
    genReqId: request => requestIdFromHeaders(request.headers),
  };
}
