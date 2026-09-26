import type { FallbackInput } from "./field-api";

export function fallbackSubmission(value: FallbackInput | null) {
  return value ? { fallback: { origin: value.origin,
    ...(value.actionRequestId?.trim() ? { actionRequestId: value.actionRequestId.trim().toLowerCase() } : {}) } } : {};
}

export function FieldRequestFallback({ value, onChange }: {
  value: FallbackInput | null; onChange: (value: FallbackInput | null) => void;
}) {
  return <details className="field-request-fallback">
    <summary>AP 이용 후 다시 접수하나요? (선택)</summary>
    <p>AP 상담이나 전달 결과를 확인하기 어려워 이 양식에서 새로 접수하는 경우 표시해 주세요.</p>
    <label><input type="checkbox" checked={Boolean(value)} onChange={event =>
      onChange(event.target.checked ? { origin: "ap_customer_reported" } : null)} /> AP 이용 후 새 요청으로 제출합니다.</label>
    {value && <><label>기존 AP 요청 ID (선택)<input maxLength={36} value={value.actionRequestId ?? ""}
      pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
      placeholder="AP 전달 기록의 요청 ID" onChange={event => onChange({ ...value, actionRequestId: event.target.value })} /></label>
      <p>기존 AP 내용은 복사되지 않습니다. 사업자가 이전 접수와 중복일 수 있는지 확인하며, 요청 ID를 몰라도 새로 접수할 수 있습니다.</p></>}
  </details>;
}
