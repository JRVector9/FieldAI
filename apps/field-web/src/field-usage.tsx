"use client";

import { useCallback, useEffect, useState } from "react";
import { Brand } from "@fieldai/ui";

type Summary = {
  product: "field";
  period: { start: string; end: string };
  siteAi: { jobRequests: number; recordedCalls: number; inputTokens: number; outputTokens: number };
  entitlement?: {mode:string;periodId:string|null;endsAt:string|null;graceEndsAt:string|null;
    siteAi:{includedUnits:number|null;consumedUnits:number;reservedUnits:number;unknownUnits:number;remainingUnits:number|null}};
  work: { directInquiries: number; publicReservations: number; reservationMessages: number;
    manualReservations: number; externalReservations: number };
};

export function FieldUsage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState("사용량을 불러오는 중입니다.");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/v1/usage/summary", { credentials: "same-origin" });
      if (response.status === 401) { setSummary(null); setStatus("Field에 로그인해 주세요."); return; }
      if (response.status === 404) { setSummary(null); setStatus("먼저 Field 사업 조직을 만들어 주세요."); return; }
      if (!response.ok) throw new Error("usage_unavailable");
      const value = await response.json() as Summary;
      if (value.product !== "field") throw new Error("wrong_product");
      setSummary(value); setStatus("");
    } catch { setStatus("사용량을 불러오지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Field" /></a><nav aria-label="작업 메뉴"><a href="/workspace">사업 운영</a><a href="/workspace/site">사이트 편집</a></nav></header>
    <main className="feature-section field-account-page"><div className="feature-heading"><p className="eyebrow">Field · 사용량</p><h1>이번 달 사용 기록</h1><p>Field 조직의 사이트 제작 AI, 직접 문의와 예약 출처를 별도 원장에서 확인합니다.</p></div>
      <button className="field-account-button" type="button" disabled={busy} onClick={() => void load()}>기록 새로고침</button>
      {status && <p role="status" className="state-message">{status} {status.includes("로그인") || status.includes("조직") ? <a href="/workspace">사업 운영 화면 열기</a> : null}</p>}
      {summary && <><p>집계 기간: {summary.period.start.slice(0, 10)}부터 {summary.period.end.slice(0, 10)} 전까지 (UTC)</p>
        <div className="special-grid"><section className="special-panel"><h2>사이트 제작 AI</h2><ul>
          <li>제작 요청: {summary.siteAi.jobRequests.toLocaleString()}건</li>
          <li>공급사 응답 기록이 있는 호출: {summary.siteAi.recordedCalls.toLocaleString()}건</li>
          <li>기록된 입력 토큰: {summary.siteAi.inputTokens.toLocaleString()}</li>
          <li>기록된 출력 토큰: {summary.siteAi.outputTokens.toLocaleString()}</li>
        </ul><p>토큰은 공급사 응답 ID와 사용량이 모두 기록된 호출만 합산합니다. 비용이나 청구액이 아닙니다.</p></section>
        <section className="special-panel"><h2>고객 업무</h2><ul>
          <li>Field 직접 문의: {summary.work.directInquiries.toLocaleString()}건</li>
          <li>공개 고객 예약 요청: {summary.work.publicReservations.toLocaleString()}건</li>
          <li>직접 예약 추가 대화: {summary.work.reservationMessages.toLocaleString()}건</li>
          <li>사업자 수동 예약: {summary.work.manualReservations.toLocaleString()}건</li>
          <li>AP 외부 예약 요청: {summary.work.externalReservations.toLocaleString()}건</li>
        </ul><p>예약 요청 건수는 확정된 예약 수나 매출을 뜻하지 않습니다.</p></section></div>
        <section className="special-panel"><h2>구독·청구 상태</h2>
          <p>현재 이용 상태: {({paid:'유료 기간',grace:'결제 유예',trial:'체험 기간',mock_unconfigured:'로컬 체험 미시작',cleanup_only:'기존 업무 정리'} as Record<string,string>)[summary.entitlement?.mode??'']??'확인되지 않음'}. 사용 기록을 청구액으로 환산하거나 동의 없이 추가 결제하지 않습니다.</p>
          {summary.entitlement?.siteAi.includedUnits!==null&&summary.entitlement?.siteAi.includedUnits!==undefined&&<><h3>결제 기간 AI 제공량 (추가)</h3><p>승인 제공량 {summary.entitlement.siteAi.includedUnits.toLocaleString()}회 · 소비 {summary.entitlement.siteAi.consumedUnits.toLocaleString()}회 · 예약/호출 중 {summary.entitlement.siteAi.reservedUnits.toLocaleString()}회 · 결과 미상 {summary.entitlement.siteAi.unknownUnits.toLocaleString()}회 · 남은 {summary.entitlement.siteAi.remainingUnits?.toLocaleString()}회</p><p>이 제공량은 위 UTC 월 집계와 별개인 실제 구독 기간에 적용됩니다. 유예 중에는 직전 기간의 남은 제공량만 사용합니다.</p></>}
          <p><a href="/workspace/subscription">Field 체험·구독 상태 보기</a></p></section>
      </>}
    </main></div>;
}
