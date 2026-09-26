"use client";

import React, { useState } from "react";

export function FieldBookingPreview() {
  const [mode, setMode] = useState<"preferred" | "schedule">("preferred");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  return <div className="special-grid">
    <section className="special-panel"><h2>예약 요청</h2><p>실제 서비스의 설정에 따라 한 가지 예약 방식이 표시됩니다. 여기서는 두 화면을 검토할 수 있습니다.</p>
      <fieldset className="booking-modes"><legend>예약 방식 미리보기</legend><label><input type="radio" name="booking-mode" checked={mode === "preferred"} onChange={() => setMode("preferred")} />희망시간 제출형</label><label><input type="radio" name="booking-mode" checked={mode === "schedule"} onChange={() => setMode("schedule")} />시간표 선택형</label></fieldset>
      <div className="form-fields"><label>서비스<input disabled placeholder="공개된 서비스가 표시됩니다" /></label></div>
      {mode === "preferred" ? <div className="form-fields"><label>희망 날짜<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label><label>희망 시간<input type="time" value={time} onChange={event => setTime(event.target.value)} /></label></div> : <div className="booking-slot-empty"><strong>표시할 수 있는 시간이 없습니다</strong><p>실제 서비스의 시간표와 점유 상태가 연결되면 선택 가능한 시간을 표시합니다.</p></div>}
      <div className="preview-action"><button type="button" disabled>예약 요청</button><p>서비스 정보와 예약 API 연결 후 이용할 수 있습니다. 입력 내용은 저장되지 않습니다.</p></div>
    </section>
    <aside className="special-panel"><h2>요청과 확정</h2><div className="customer-banner"><strong>예약 확정 아님</strong><p>고객이 요청을 제출해도 사업자가 확인하기 전에는 시간이 점유되지 않습니다.</p></div><div className="approval-steps"><div className="approval-step"><span>01</span><div>고객 요청<small>실제 서버에 저장된 뒤 접수로 표시</small></div></div><div className="approval-step"><span>02</span><div>사업자 확인<small>동일 자원·시간 충돌을 최종 검사</small></div></div><div className="approval-step"><span>03</span><div>예약 확정<small>사업자 승인 후에만 확정</small></div></div></div></aside>
  </div>;
}
