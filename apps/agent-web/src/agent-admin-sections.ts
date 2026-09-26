export const agentAdminSections = [
  { id: "operations", title: "AP 관리자 운영 상태", description: "AP 원장의 집계와 전달 대기 상태를 확인합니다." },
  { id: "organizations", title: "AP 조직", description: "AP 사업 조직·매체·구성원 수를 확인합니다." },
  { id: "notifications", title: "AP 발송", description: "AP 소유 사건과 고객 알림의 미연결 상태를 확인합니다." },
  { id: "ai-deployments", title: "AP AI·배포", description: "승인된 사업 AI와 검증된 설치 주소·활성 배포를 구분합니다." },
  { id: "billing", title: "AP 구독", description: "AP 전용 체험 원장을 확인합니다." },
  { id: "audit", title: "AP 신고·감사", description: "운영 조회 기록을 확인합니다." },
] as const;
export type AgentAdminSection = typeof agentAdminSections[number]["id"];
export function isAgentAdminSection(value: string): value is AgentAdminSection {
  return agentAdminSections.some(item => item.id === value);
}
