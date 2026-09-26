export const fieldAdminSections = [
  { id: "operations", title: "Field 관리자 운영 상태", description: "Field 원장의 집계와 전달 대기 상태를 확인합니다." },
  { id: "organizations", title: "Field 사업체", description: "Field 사업체와 구성원·공개 사이트 수를 확인합니다." },
  { id: "site-domains", title: "Field 제작·도메인", description: "사이트 제작 작업과 승인 공개본을 구분합니다." },
  { id: "notifications", title: "Field 발송", description: "Field 소유 사건과 고객 알림의 미연결 상태를 확인합니다." },
  { id: "billing", title: "Field 구독·청구", description: "사업자의 플랫폼 구독만 관리합니다. 고객 서비스 대금은 포함하지 않습니다." },
  { id: "audit", title: "Field 신고·감사", description: "운영 조회 기록을 확인합니다." },
] as const;
export type FieldAdminSection = typeof fieldAdminSections[number]["id"];
export function isFieldAdminSection(value: string): value is FieldAdminSection {
  return fieldAdminSections.some(item => item.id === value);
}
