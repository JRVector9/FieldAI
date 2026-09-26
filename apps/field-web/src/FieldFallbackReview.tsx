import type { FallbackCandidate, FallbackReview, RequestFallback } from "./field-api";

export function FieldFallbackReview({ fallback, review, onOpenCandidate }: {
  fallback?: RequestFallback | null; review?: FallbackReview;
  onOpenCandidate: (candidate: FallbackCandidate) => void;
}) {
  if (!fallback) return null;
  return <section className="field-fallback-review" aria-label="AP 재접수 관계">
    <h4>AP 이용 후 새 직접 요청</h4>
    <p>고객이 AP 이용 후 별도로 작성한 요청입니다. AP 장애·이전 접수 여부·동일 고객인지는 확인 전입니다.</p>
    {fallback.actionRequestId ? <p>고객 제공 AP 요청 ID: <code>{fallback.actionRequestId}</code></p>
      : <p>기존 AP 요청 ID가 없어 수신 기록을 대조하지 않았습니다.</p>}
    {review ? <>{review.candidates.length > 0 ? <><p>같은 요청 ID를 가진 기존 수신 기록 · 중복 후보</p>
      <ul>{review.candidates.map(candidate => <li key={candidate.externalRequestId}>
        <strong>{candidate.serviceName}</strong> · {candidate.kind === "inquiry" ? "AP 수신 문의" : "AP 수신 예약"}
        <p>접수: {new Date(candidate.receivedAt).toLocaleString("ko-KR")}</p>
        <button type="button" onClick={() => onOpenCandidate(candidate)}>{candidate.reservationId ? "기존 예약 보기" : "기존 수신 문의 보기"}</button>
      </li>)}</ul><p>자동 병합하거나 취소하지 않았습니다. 기존 기록을 확인하고 고객과 조율해 주세요.</p>
      {review.hasMore && <p>후보가 100건을 넘어 최근 100건만 표시합니다. 문의함·예약 목록에서 나머지 기록도 확인해 주세요.</p>}</>
      : fallback.actionRequestId && <p>현재 이 사업장 수신 기록에서 후보를 찾지 못했습니다. AP에 미접수됐다는 뜻은 아닙니다.</p>}</>
      : <p>중복 후보는 상세 화면을 새로 조회해 확인해 주세요.</p>}
  </section>;
}
