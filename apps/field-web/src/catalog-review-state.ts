// 카탈로그 재검토 응답: 최신이면 200(현재 상태 표시) 또는 기존 409 catalog_current가 온다. 서비스 목록이 있는 재검토 응답만 화면에 연다.
export function catalogReviewNeeded(status: number, data: unknown) {
  const value = data && typeof data === "object" ? data as { services?: unknown; reviewRequired?: unknown; current?: unknown } : {};
  return status === 200 && Array.isArray(value.services) && value.reviewRequired !== false && value.current !== true;
}
