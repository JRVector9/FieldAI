"use client";

import { useCallback, useEffect, useState } from "react";
import { Brand } from "@fieldai/ui";

type Summary = {
  product: "agent";
  period: { start: string; end: string };
  ai: { customerAnswers: number; ownerTests: number; recordedCalls: number;
    inputTokens: number; outputTokens: number; customerInputTokens: number;
    customerOutputTokens: number; ownerInputTokens: number; ownerOutputTokens: number };
  work: { inquiries: number; acceptedFieldRequests: number; unknownFieldRequests: number };
};

export function AgentUsage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState("사용량을 불러오는 중입니다.");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/v1/usage/summary", { credentials: "same-origin" });
      if (response.status === 401) { setSummary(null); setStatus("AP에 로그인해 주세요."); return; }
      if (response.status === 404) { setSummary(null); setStatus("먼저 AP 사업 조직을 만들어 주세요."); return; }
      if (!response.ok) throw new Error("usage_unavailable");
      const value = await response.json() as Summary;
      if (value.product !== "agent") throw new Error("wrong_product");
      setSummary(value); setStatus("");
    } catch { setStatus("사용량을 불러오지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Agent Platform" /></a><nav aria-label="작업 메뉴"><a href="/workspace">사업 정보·문의함</a><a href="/workspace/ai">AI 설정</a></nav></header>
    <main className="feature-section"><div className="feature-heading"><p className="eyebrow">Agent Platform · 사용량</p><h1>이번 달 사용 기록</h1><p>AP 조직의 실제 원장만 집계합니다. 사업자 테스트, 고객 AI 답변, 접수와 Field 전달을 구분합니다.</p></div>
      <button type="button" disabled={busy} onClick={() => void load()}>기록 새로고침</button>
      {status && <p role="status" className="state-message">{status} {status.includes("로그인") || status.includes("조직") ? <a href="/workspace">사업 정보 화면 열기</a> : null}</p>}
      {summary && <><p>집계 기간: {summary.period.start.slice(0, 10)}부터 {summary.period.end.slice(0, 10)} 전까지 (UTC)</p>
        <div className="special-grid"><section className="special-panel"><h2>AI 사용</h2><ul>
          <li>고객 AI 답변 완료: {summary.ai.customerAnswers.toLocaleString()}건</li>
          <li>사업자 테스트 완료: {summary.ai.ownerTests.toLocaleString()}건</li>
          <li>공급사 응답 기록이 있는 호출: {summary.ai.recordedCalls.toLocaleString()}건</li>
          <li>기록된 입력 토큰: {summary.ai.inputTokens.toLocaleString()}</li>
          <li>기록된 출력 토큰: {summary.ai.outputTokens.toLocaleString()}</li>
          <li>고객 상담 입력·출력: {summary.ai.customerInputTokens.toLocaleString()} / {summary.ai.customerOutputTokens.toLocaleString()} 토큰</li>
          <li>사업자 테스트 입력·출력: {summary.ai.ownerInputTokens.toLocaleString()} / {summary.ai.ownerOutputTokens.toLocaleString()} 토큰</li>
        </ul><p>토큰은 공급사 응답 ID와 사용량이 모두 기록된 호출만 합산합니다. 비용이나 청구액이 아닙니다.</p></section>
        <section className="special-panel"><h2>고객 업무</h2><ul>
          <li>사람 문의 접수: {summary.work.inquiries.toLocaleString()}건</li>
          <li>Field 외부 요청 수락: {summary.work.acceptedFieldRequests.toLocaleString()}건</li>
          <li>Field 전달 결과 미상: {summary.work.unknownFieldRequests.toLocaleString()}건</li>
        </ul><p>외부 요청 수락은 예약 확정이나 매출을 뜻하지 않습니다.</p></section></div>
        <section className="special-panel"><h2>구독·청구 상태</h2><p>AP의 승인된 요금과 결제 공급사가 아직 연결되지 않았습니다. 이 기록으로 청구를 시작하거나 금액을 계산하지 않습니다.</p><p><a href="/workspace/subscription">AP 체험·구독 상태 보기</a></p></section>
      </>}
    </main></div>;
}
