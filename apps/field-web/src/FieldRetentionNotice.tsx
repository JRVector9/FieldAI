import type { WorkRetention } from './field-api';

export function FieldRetentionNotice({ retention }: { retention?: WorkRetention }) {
  if (!retention?.workPurgedAt && !retention?.photosPurgedAt) return null;
  return <aside className="customer-banner" aria-label="보존 정리 안내" role="status">
    {retention.workPurgedAt ? <><strong>보존 기간이 종료되어 업무 개인정보·대화 원문·고객 사진을 정리했습니다.</strong>
      <p>기존 접수번호와 처리 이력은 확인할 수 있습니다. 이 업무의 추가 메시지와 사진 첨부는 종료되었습니다.</p></>
      : <><strong>보존 기간이 지난 고객 사진을 정리했습니다.</strong><p>업무 원문과 추가 대화는 유지됩니다. 새로 첨부한 사진은 별도로 보존합니다.</p></>}
  </aside>;
}
