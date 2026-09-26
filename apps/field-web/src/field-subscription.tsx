"use client";

import { useCallback, useEffect, useState } from "react";
import { Brand } from "@fieldai/ui";

type Subscription = {
  product: "field";
  organizationId: string;
  canManage: boolean;
  mode: "mock_trial" | "unavailable";
  state: "not_started" | "trialing" | "trial_ended" | "unavailable";
  trial: { id: string; consentVersion: string; startedAt: string; endsAt: string;
    cancelRequestedAt: string | null } | null;
  paidCheckout: { state: "blocked_integration" };
};

const date = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

export function FieldSubscription() {
  const [data, setData] = useState<Subscription | null>(null);
  const [notice, setNotice] = useState("구독 상태를 불러오는 중입니다.");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/v1/subscription", { credentials: "same-origin" });
      if (response.status === 401) { setData(null); setNotice("Field에 로그인해 주세요."); return; }
      if (response.status === 404) { setData(null); setNotice("먼저 Field 사업 조직을 만들어 주세요."); return; }
      if (!response.ok) throw new Error("subscription_unavailable");
      const value = await response.json() as Subscription;
      if (value.product !== "field") throw new Error("wrong_product");
      setData(value); setNotice("");
    } catch { setData(null); setNotice("구독 상태를 불러오지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function post(path: "trial" | "cancel") {
    setBusy(true);
    try {
      const response = await fetch(`/v1/subscription/${path}`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(path === "trial" ? { consentVersion: "mock-trial-v1", termsAccepted: consent } : {}),
      });
      if (!response.ok) {
        setData(null);
        setNotice(`요청이 거절됐습니다 (${response.status}). 상태를 새로고침해 확인해 주세요.`);
        return;
      }
      const value = await response.json() as Subscription;
      if (value.product !== "field") throw new Error("wrong_product");
      setData(value); setNotice(path === "trial" ? "Field 체험이 시작됐습니다." : "체험 종료 예약을 기록했습니다.");
    } catch { setData(null); setNotice("요청 결과를 확인하지 못했습니다. 상태를 새로고침해 실제 체험 상태를 확인해 주세요."); }
    finally { setBusy(false); }
  }

  async function downloadOperations() {
    if (!data?.canManage || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/v1/owner/organizations/${data.organizationId}/operations/export`,
        { credentials: "same-origin" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: string };
        setNotice(error.error === "archive_too_large" ? "한 번에 내려받을 수 있는 범위를 넘었습니다. 운영자에게 분할 내보내기를 요청해 주세요."
          : error.error === "media_unavailable" || error.error === "blocked_integration" ? "저장된 사진을 읽지 못해 묶음 파일을 만들지 않았습니다. 잠시 뒤 다시 시도해 주세요."
            : `기록을 내보내지 못했습니다 (${response.status}). 권한과 서버 상태를 확인해 주세요.`);
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `field-operations-${data.organizationId}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice("Field 운영 기록 파일을 만들었습니다. 고객 개인정보가 포함되므로 안전하게 보관해 주세요.");
    } catch { setNotice("다운로드 요청에 실패했습니다. 연결을 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Field" /></a><nav aria-label="작업 메뉴"><a href="/workspace">사업 운영</a><a href="/workspace/usage">사용량</a></nav></header>
    <main className="feature-section"><div className="feature-heading"><p className="eyebrow">Field · 체험과 구독</p><h1>Field 이용 상태</h1><p>Field 체험과 향후 유료 구독은 AP와 별도로 관리합니다.</p></div>
      <button type="button" disabled={busy} onClick={() => void load()}>상태 새로고침</button>
      {notice && <p role="status" className="state-message">{notice} {notice.includes("로그인") || notice.includes("조직") ? <a href="/workspace">사업 정보 화면 열기</a> : null}</p>}
      {data && <div className="special-grid"><section className="special-panel"><h2>카드 없는 체험</h2>
        {data.mode === "unavailable" && <p>체험 정책이 승인되지 않아 이 환경에서는 시작할 수 없습니다.</p>}
        {data.mode === "mock_trial" && data.state === "not_started" && <><p>로컬 mock 전용 14일 체험 제안입니다. 카드 등록이나 자동 유료 전환은 없습니다.</p>
          {data.canManage ? <><label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> 14일 체험(로컬 검수용)을 시작하는 데 동의합니다.</label><p><button type="button" disabled={busy || !consent} onClick={() => void post("trial")}>Field 체험 시작</button></p>{!consent && <p>시작하려면 위 조건에 동의해 주세요.</p>}</> : <p>시작 권한은 조직 owner에게 있습니다.</p>}</>}
        {data.trial && <><p>시작: {date(data.trial.startedAt)}</p><p>종료: {date(data.trial.endsAt)}</p>
          <p>상태: {data.state === "trialing" ? "체험 중" : "체험 종료"}</p>
          {data.state === "trial_ended" && <p>새 사이트 제작·문의·예약 요청은 중지됩니다. 기존 문의와 예약의 열람·답변·처리, 기록 내보내기 및 연결 해제는 계속할 수 있습니다.</p>}
          {data.trial.cancelRequestedAt ? <p>종료 예약 기록: {date(data.trial.cancelRequestedAt)}</p> : null}
          {data.state === "trialing" && !data.trial.cancelRequestedAt && data.canManage && <button type="button" disabled={busy} onClick={() => void post("cancel")}>체험 종료 예약</button>}
          <p>종료 예약을 해도 남은 체험 기간은 유지됩니다. 체험 종료 시 자동 청구는 없습니다.</p></>}
        </section><section className="special-panel"><h2>유료 구독</h2><p>Field의 독립 가격·세금·갱신·해지 조건과 결제 공급사가 아직 승인되지 않았습니다.</p><button type="button" disabled>유료 구독 준비 중</button><p>현재 결제 신청과 자동 청구는 차단되어 있습니다. AP 계정·연결 승인도 Field 결제를 시작하지 않습니다.</p></section>
        <section className="special-panel"><h2>운영 기록 내보내기</h2><p>Field 사업자 계정·조직 구성원, 체험·AP 연결 상태, 사업 정보·사이트 초안과 공개본·직접 문의·예약, Field가 수신한 외부 업무 요청과 복사 완료한 고객 사진을 JSON 파일 하나에 담습니다. 복사 대기·실패 사진은 상태와 실패 원인을 기록합니다. 인증 비밀과 AP 상담 원문은 포함하지 않습니다.</p>{data.canManage ? <p><button type="button" disabled={busy} onClick={() => void downloadOperations()}>Field 운영 기록·사진 전체 다운로드</button></p> : <p>조직 owner만 묶음 파일을 만들 수 있습니다.</p>}<p>한 번에 각 기록 최대 500건, 외부 첨부 최대 2,500건·전체 64 MiB까지 만들 수 있습니다. 초과하거나 복사 완료 사진을 읽을 수 없으면 파일이 생성되지 않습니다.</p></section></div>}
    </main></div>;
}
