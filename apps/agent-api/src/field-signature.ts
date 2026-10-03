// AP↔Field 연결별 HMAC 서명 원문의 방향 접두사(AP 계약 preview.11, Field 계약 preview.10).
// 같은 연결 키를 양방향이 공유하므로 원문에 방향을 넣어 반대 방향 재전송(반사)을 막는다.
// 제품 독립을 위해 Field 쪽 같은 helper와 공유하지 않고 AP에 따로 둔다.
const AP_TO_FIELD_SIGNATURE_PREFIX = 'v2:ap->field.';
const FIELD_TO_AP_SIGNATURE_PREFIX = 'v2:field->ap.';

// 접두사 없는 v1 서명 수용 여부. 미설정이면 mock/sandbox는 전환 기간으로 허용, 그 외(live)는 거부한다.
export function acceptsV1FieldSignature(env: NodeJS.ProcessEnv = process.env) {
  const value = env.AP_EVENT_SIGNATURE_ACCEPT_V1;
  if (value === 'true' || value === 'false') return value === 'true';
  if (value !== undefined) throw new Error('invalid_AP_EVENT_SIGNATURE_ACCEPT_V1');
  return env.AP_PROFILE === 'mock' || env.AP_PROFILE === 'sandbox';
}

// Field→AP 수신 검증에 쓸 원문 접두사. X-Signature-Version: 2만 v2이고, 헤더가 없으면 v1(허용 시)이다.
// null이면 서명 확인 없이 거부한다.
export function fieldToApSignaturePrefix(version: string | string[] | undefined) {
  if (version === '2') return FIELD_TO_AP_SIGNATURE_PREFIX;
  return version === undefined && acceptsV1FieldSignature() ? '' : null;
}

// AP→Field 발신 서명 버전. 미설정이면 2(방향 접두사·X-Signature-Version: 2)이고, 1은 상대 수신자가 아직 v2를 검증하지 못하는
// 비동시 배포 전환 기간에만 쓴다. 잘못된 값은 부팅을 멈춘다. 상대가 401을 돌려줘도 자동으로 1로 내리지 않는다(다운그레이드 유도 금지).
export function apToFieldSignatureSendVersion(env: NodeJS.ProcessEnv = process.env): 1 | 2 {
  const value = env.AP_EVENT_SIGNATURE_SEND_VERSION;
  if (value === undefined || value === '2') return 2;
  if (value === '1') return 1;
  throw new Error('invalid_AP_EVENT_SIGNATURE_SEND_VERSION');
}

// 발신 서명 원문 접두사와 버전 헤더. v1은 접두사와 버전 헤더가 모두 없다.
export function apToFieldSigning(env: NodeJS.ProcessEnv = process.env):
  { prefix: string; headers: Record<string, string> } {
  return apToFieldSignatureSendVersion(env) === 2
    ? { prefix: AP_TO_FIELD_SIGNATURE_PREFIX, headers: { 'x-signature-version': '2' } }
    : { prefix: '', headers: {} };
}
