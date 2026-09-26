"use client";

import { useState } from "react";
import { writeReceiptHandoff } from "./receipt-handoff";

export function FieldReceipt({ kind, businessName, id, receiptKey, notice, busy }: {
  kind: "inquiry" | "reservation"; businessName: string; id: string; receiptKey: string; notice: string;
  busy: boolean;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const reservation = kind === "reservation";
  async function copyKey() {
    try {
      await navigator.clipboard.writeText(receiptKey);
      setCopyStatus("확인키를 복사했습니다. 안전한 곳에 보관해 주세요.");
    } catch {
      setCopyStatus("자동 복사를 사용할 수 없습니다. 아래 확인키를 직접 선택해 보관해 주세요.");
    }
  }
  return <div className="field-receipt-content">
    <span className="field-receipt-mark" aria-hidden="true">✓</span>
    <h1>{reservation ? "예약 요청을 보냈어요." : "문의가 접수되었어요."}</h1>
    <p className="field-receipt-intro">{businessName} 사업자가 내용을 확인합니다.<br />{reservation
      ? "아직 예약이 확정된 상태는 아닙니다."
      : "같은 대화에서 답변을 확인할 수 있습니다."}</p>
    <div className="field-receipt-key-box"><div className="field-receipt-number"><span>접수번호</span><strong>{id}</strong></div>
      <div className="field-receipt-secret"><strong>다른 브라우저에서 사용할 접수 확인키</strong><code>{receiptKey}</code>
        <button type="button" onClick={() => void copyKey()}>확인키 복사</button></div>
      <p>확인키는 다른 사람과 공유하지 마세요. 전화번호나 알림 링크만으로 원문을 열 수 없습니다.</p>
      {copyStatus && <p role="status">{copyStatus}</p>}
    </div>
    {notice && <p className="field-receipt-notice" role="status">{notice}</p>}
    {busy ? <p className="field-receipt-wait" role="status">선택한 사진의 첨부 결과를 확인하고 있습니다. 잠시만 기다려 주세요.</p>
      : <a className="field-receipt-open" href={reservation ? `/reservation/${id}` : `/inquiry/${id}`}
      onClick={() => writeReceiptHandoff(kind, id, receiptKey)}>
      {reservation ? "내 예약 상태 확인하기" : "내 문의 확인하기"} <span aria-hidden="true">→</span>
    </a>}
  </div>;
}
