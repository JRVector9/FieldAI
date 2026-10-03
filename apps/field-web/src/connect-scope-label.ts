// 동의 화면 scope 안내. 고객 대신 결정을 전달하는 등 의미가 큰 scope는 한국어 설명을 함께 보인다.
const SCOPE_LABELS: Record<string, string> = {
  "field.proposals.respond": "제안에 대한 고객 결정 전달",
  "field.notification_route.read": "알림 경로 상태 읽기",
};

export function scopeLabel(scope: string) {
  const label = SCOPE_LABELS[scope];
  return label ? `${label} (${scope})` : scope;
}
