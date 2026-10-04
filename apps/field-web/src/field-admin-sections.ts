export const fieldAdminSections = [
  { id: "operations", title: "Field 관리자 운영 상태", description: "Field 원장의 집계와 전달 대기 상태를 확인합니다." },
  { id: "organizations", title: "Field 사업체", description: "Field 사업체와 구성원·공개 사이트 수를 확인합니다." },
  { id: "site-domains", title: "Field 제작·도메인", description: "사이트 제작 작업과 승인 공개본을 구분합니다." },
  { id: "notifications", title: "Field 발송", description: "Field 소유 사건과 고객 알림의 미연결 상태를 확인합니다." },
  { id: "billing", title: "Field 구독·청구", description: "사업자의 플랫폼 구독만 관리합니다. 고객 서비스 대금은 포함하지 않습니다." },
  { id: "audit", title: "Field 신고·감사", description: "운영 조회 기록을 확인합니다." },
] as const;
export type FieldAdminSection = typeof fieldAdminSections[number]["id"];
export function adminSignOutFailure(status: number) {
  if (status === 403) return '로그아웃 보안 확인에 실패했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.';
  if (status === 429) return '요청이 많아 로그아웃을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  return '로그아웃하지 못했습니다. 다시 시도해 주세요.';
}
export function isFieldAdminSection(value: string): value is FieldAdminSection {
  return fieldAdminSections.some(item => item.id === value);
}

const STOPPED_REASON_LABELS: Record<string, string> = {
  execution_failed: "실행 오류",
  media_permission: "사진 저장소 권한 부족",
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

// 멈춘 삭제 요청 "다시 실행" 버튼의 비활성 사유(추가). null이면 누를 수 있다.
export function deletionResumeBlockReason(input: { role: "operator" | "auditor"; reason: string; busy: boolean }) {
  if (input.role !== "operator") return "다시 실행은 operator 권한이 필요합니다. 감사자는 목록만 확인할 수 있습니다.";
  if (input.busy) return "진행 중인 요청이 끝나면 다시 실행할 수 있습니다.";
  if (input.reason.trim().length < 10) return "다시 실행 사유를 10자 이상 입력해 주세요.";
  return null;
}

const ASSET_DELETION_REASON_LABELS: Record<string, string> = {
  media_permission: "사진 저장소 권한 부족",
  media_unavailable: "사진 저장소 응답 실패",
  file_delete_unconfirmed: "파일 삭제 확인 실패",
  blocked_integration: "사진 저장소 미연결",
  attempts_stopped: "자동 재시도 중지",
};
// 멈춘 사이트 사진 삭제의 error(쉼표 구분 코드, 예: media_unavailable,attempts_stopped)를 운영자용 한국어로 바꾼다(추가). 모르는 코드는 그대로 보인다.
export function stoppedAssetDeletionReason(error: string | null) {
  if (!error) return "사유 기록 없음";
  return error.split(",").map(code => ASSET_DELETION_REASON_LABELS[code] ?? code).join(" · ");
}
