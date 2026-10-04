// 조직 삭제 유예(deletion_scheduled) 중 사업자 화면에 보여 줄 공통 안내 문구와 판별 함수.
// 화면 컴포넌트(CSS import)와 분리해 단위 검수에서 그대로 불러올 수 있게 한다.
export const DELETION_SCHEDULED_OWNER_MESSAGE = "이 사업장은 삭제 예정입니다. 새 체험·결제·연결을 시작할 수 없습니다. 사이트 제작·AI 생성·정보 승인·새 문의·예약도 제한됩니다. 기존 기록의 열람·정리는 계속할 수 있습니다. 취소는 계정·조직 삭제 화면에서 할 수 있습니다.";

// 서버가 403(이용 상태 거절) 또는 409(체험·결제·연결 시작 거절)로 deletion_scheduled를 돌려줬는지 판별한다
export function isDeletionScheduledError(status: number, data: unknown): boolean {
  return (status === 403 || status === 409) && typeof data === "object" && data !== null
    && (data as { error?: unknown }).error === "deletion_scheduled";
}

// 구독 응답의 access(reason)로 삭제 예정 사업장인지 판별한다
export function isDeletionScheduledAccess(access: unknown): boolean {
  return typeof access === "object" && access !== null && (access as { reason?: unknown }).reason === "deletion_scheduled";
}

export function ownerFailureNotice(status: number, data: unknown, fallback: string): string {
  return isDeletionScheduledError(status, data) ? DELETION_SCHEDULED_OWNER_MESSAGE : fallback;
}
