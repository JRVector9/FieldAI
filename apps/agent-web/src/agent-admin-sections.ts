export const agentAdminSections = [
  { id: "operations", title: "AP 관리자 운영 상태", description: "AP 원장의 집계와 전달 대기 상태를 확인합니다." },
  { id: "organizations", title: "AP 조직", description: "AP 사업 조직·매체·구성원 수를 확인합니다." },
  { id: "notifications", title: "AP 발송", description: "AP 소유 사건과 고객 알림의 미연결 상태를 확인합니다." },
  { id: "ai-deployments", title: "AP AI·배포", description: "승인된 사업 AI와 검증된 설치 주소·활성 배포를 구분합니다." },
  { id: "billing", title: "AP 구독·청구", description: "사업자의 플랫폼 구독만 관리합니다. 고객 서비스 대금은 포함하지 않습니다." },
  { id: "audit", title: "AP 신고·감사", description: "운영 조회 기록을 확인합니다." },
] as const;
export type AgentAdminSection = typeof agentAdminSections[number]["id"];
export function isAgentAdminSection(value: string): value is AgentAdminSection {
  return agentAdminSections.some(item => item.id === value);
}

const STOPPED_REASON_LABELS: Record<string, string> = {
  execution_failed: "실행 오류",
  execution_attempts_stopped: "자동 실행 중지",
};
// 멈춘 삭제 요청의 last_error(쉼표 구분 코드, 예: execution_failed:PAN01)를 운영자용 한국어로 바꾼다. 모르는 코드는 그대로 보인다.
export function stoppedDeletionReason(lastError: string | null) {
  if (!lastError) return "사유 기록 없음";
  return lastError.split(",").map(code => {
    const [base, detail] = code.split(":");
    const label = STOPPED_REASON_LABELS[base ?? ""] ?? code;
    return detail && label !== code ? `${label}(${detail})` : label;
  }).join(" · ");
}
