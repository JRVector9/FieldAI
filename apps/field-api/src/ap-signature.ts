// AP↔Field 연결별 HMAC 서명 원문의 방향 접두사(Field 계약 preview.10, AP 계약 preview.11).
// 같은 연결 키를 양방향이 공유하므로 원문에 방향을 넣어 반대 방향 재전송(반사)을 막는다.
// 제품 독립을 위해 AP 쪽 같은 helper와 공유하지 않고 Field에 따로 둔다.
export const FIELD_TO_AP_SIGNATURE_PREFIX = 'v2:field->ap.';
const AP_TO_FIELD_SIGNATURE_PREFIX = 'v2:ap->field.';

// Field→AP 발신 서명 버전(FIELD_EVENT_SIGNATURE_SEND_VERSION). 미설정이면 2다.
// 1은 아직 v2를 검증하지 못하는 AP 수신자가 남은 전환 기간에만 쓴다. '1'/'2' 외 값은 워커 시작을 멈춘다.
// 401을 받아도 v1로 자동 하향하지 않는다(기존 재시도·blocked 처리 유지, 운영자가 명시적으로 전환한다).
export function fieldSignatureSendVersion(env: NodeJS.ProcessEnv = process.env): 1 | 2 {
  const value = env.FIELD_EVENT_SIGNATURE_SEND_VERSION;
  if (value === undefined || value === '2') return 2;
  if (value === '1') return 1;
  throw new Error('invalid_FIELD_EVENT_SIGNATURE_SEND_VERSION');
}

// 발신 서명 원문 접두사와 버전 헤더. v1은 접두사와 X-Signature-Version 헤더가 모두 없다.
export function fieldToApSignature(env: NodeJS.ProcessEnv = process.env): { prefix: string; headers: Record<string, string> } {
  return fieldSignatureSendVersion(env) === 2
    ? { prefix: FIELD_TO_AP_SIGNATURE_PREFIX, headers: { 'x-signature-version': '2' } }
    : { prefix: '', headers: {} };
}

// 접두사 없는 v1 서명 수용 여부. 미설정이면 mock/sandbox는 전환 기간으로 허용, 그 외(live)는 거부한다.
export function acceptsV1ApSignature(env: NodeJS.ProcessEnv = process.env) {
  const value = env.FIELD_EVENT_SIGNATURE_ACCEPT_V1;
  if (value === 'true' || value === 'false') return value === 'true';
  if (value !== undefined) throw new Error('invalid_FIELD_EVENT_SIGNATURE_ACCEPT_V1');
  return env.FIELD_PROFILE === 'mock' || env.FIELD_PROFILE === 'sandbox';
}

// AP→Field 수신 검증에 쓸 원문 접두사. X-Signature-Version: 2만 v2이고, 헤더가 없으면 v1(허용 시)이다.
// null이면 서명 확인 없이 거부한다.
export function apToFieldSignaturePrefix(version: string | string[] | undefined) {
  if (version === '2') return AP_TO_FIELD_SIGNATURE_PREFIX;
  return version === undefined && acceptsV1ApSignature() ? '' : null;
}
