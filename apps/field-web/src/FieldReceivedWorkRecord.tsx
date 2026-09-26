import type { ReceivedWorkRecord } from './field-api';

export function FieldReceivedWorkRecord({ record }: { record?: ReceivedWorkRecord | null }) {
  return <section className="knowledge-source" aria-label="Field 업무 수신 기록"><details>
    <summary>Field 업무 수신 기록</summary>
    {record ? <><p>고객이 업무 처리를 위해 Field에 전달한 기록입니다. AP 대화 원문과 별도로 보관하며 연결 해제로 기존 업무를 삭제하지 않습니다.</p>
      <dl><dt>처리 목적</dt><dd>{record.purpose === 'inquiry_reply' ? '문의 처리·회신'
        : record.purpose === 'reservation_fulfillment' ? '예약 업무 수행·고객 연락' : '이전 기록 · 목적 미기록'}</dd>
        <dt>수신 출처</dt><dd>{record.source.provider === 'agent-platform' ? 'Agent Platform · 고객 동의 후 전달' : record.source.provider}</dd>
        <dt>수신 시각</dt><dd>{new Date(record.receivedAt).toLocaleString('ko-KR')}</dd>
        <dt>보존 기준</dt><dd>{record.retention
          ? `업무 종결 후 ${record.retention.workDays}일 · 사진 ${record.retention.photoDays}일`
          : '이전 기록에는 보존 기준이 기록되지 않았습니다.'}</dd></dl>
      {record.retention?.state === 'proposed' && <p>운영 검수 전 제안 기준입니다. 예정 업무·분쟁·법정 기록은 별도로 검토하며 자동 삭제를 적용하지 않습니다.</p>}
      {!record.retention && <p>보존 목적·기간에 대한 운영 검토가 필요합니다.</p>}
    </> : <p>업무 수신 기록을 확인하지 못했습니다. Field 원본을 다시 조회해 주세요.</p>}
  </details></section>;
}
