"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { adminSignOutFailure, deletionResumeBlockReason, fieldAdminSections as sections, stoppedAssetDeletionReason, stoppedDeletionReason, type FieldAdminSection } from "./field-admin-sections";
import "./field-admin.css";
import { FieldModerationAdmin } from './FieldModerationAdmin';
import { FieldCustomerSupport } from './FieldCustomerSupport';
import { FieldRetentionAdmin } from './FieldRetentionAdmin';
import { BillingAdmin } from './billing-admin';
import './billing-admin.css';
import { signInOutcome } from './auth-flow';
import { TwoFactorChallenge } from './field-auth-pages';
import { FieldEmailOutboxAdmin } from './FieldEmailOutboxAdmin';

type Overview = {
  product: "field";
  actorUserId: string;
  role: "operator" | "auditor";
  snapshotAt: string;
  counts: {
    organizations: string;
    openInquiries: string;
    blockedCustomerNotifications: string;
    openReservations: string;
    publishedSites: string;
    runningSiteJobs: string;
    pendingOutbox: string;
    memberships: string;
    failedSiteJobs: string;
    activeTrials: string;
    cancelRequestedTrials: string;
    adminReads: string;
  };
  recentIncidents: Array<{
    eventId: string;
    eventType: string;
    occurredAt: string;
    state: "pending" | "blocked_integration";
  }>;
  recentAdminAccesses: Array<{ actorUserId: string; resource: string; accessedAt: string }>;
};

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method, credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

type StoppedDeletion = { id: string; organizationId: string; organizationName: string; requestedAt: string; scheduledAt: string;
  attemptCount: number; executionFailures: number; lastError: string | null; operatorResumes?: { at: string; reason: string }[] };
// 삭제 요청 복구 (추가): 실행 실패 상한·저장소 권한 부족으로 멈춘 조직 삭제 요청을 원인 확인 뒤 operator가 다시 실행한다.
// 다시 실행하면 유예가 끝난 조직의 삭제가 곧바로 진행되므로 사유를 받고, 사유는 요청 행 감사 기록(관리자 목록)에만 남는다.
function OrganizationDeletionRecovery({ role }: { role: "operator" | "auditor" }) {
  const [items, setItems] = useState<StoppedDeletion[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await request("/v1/admin/organization-deletions?status=stopped");
      const value = result.data as { deletions?: StoppedDeletion[] };
      if (result.status !== 200 || !Array.isArray(value.deletions)) throw new Error(`조회 실패 (${result.status})`);
      setItems(value.deletions); setStatus("");
    } catch { setItems(null); setStatus("멈춘 삭제 요청을 불러오지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function resume(id: string) {
    setBusy(true);
    try {
      const result = await request(`/v1/admin/organization-deletions/${id}/resume`, "POST", { reason: (reasons[id] ?? "").trim() });
      if (result.status !== 200) {
        const code = (result.data as { error?: string }).error ?? String(result.status);
        setStatus(code === "invalid_reason" ? "다시 실행 사유를 10~500자로 입력해 주세요." : code === "deletion_not_stopped"
          ? "이미 다시 실행됐거나 멈춘 상태가 아닙니다. 목록을 새로고침합니다." : `다시 실행하지 못했습니다 (${code}).`);
        if (code === "deletion_not_stopped") await load();
        return;
      }
      setReasons(current => { const next = { ...current }; delete next[id]; return next; });
      await load(); setStatus("다시 실행을 예약했습니다. 삭제 작업자가 다음 주기에 실행합니다.");
    } catch { setStatus("다시 실행 결과를 확인하지 못했습니다. 목록을 새로고침해 실제 상태를 확인해 주세요."); }
    finally { setBusy(false); }
  }
  return <section className="special-panel" aria-label="삭제 요청 복구"><h2>삭제 요청 복구 (추가)</h2>
    <p>자동 실행이 멈춘 Field 조직 삭제 요청입니다. 원인(저장소 권한·실행 오류)을 해결한 뒤에만 다시 실행하세요. 다시 실행 사유와 실행한 운영자는 요청 감사 기록에 남고 관리자 목록에서만 보이며, 조직 owner 화면에는 표시되지 않습니다.</p>
    {status && <p role="status" className="state-message">{status}</p>}
    <button type="button" disabled={busy} onClick={() => void load()}>목록 새로고침</button>
    {items && items.length === 0 && <p>멈춘 삭제 요청이 없습니다.</p>}
    {items && items.length > 0 && <div className="field-admin-list">{items.map(item => <article key={item.id}>
      <h3>{item.organizationName}</h3>
      <p>멈춘 사유 {stoppedDeletionReason(item.lastError)} · 실행 실패 {item.executionFailures}회 · 전체 시도 {item.attemptCount}회</p>
      <p>실행 예정 {new Date(item.scheduledAt).toLocaleString("ko-KR")} · 요청 ID {item.id}</p>
      {item.operatorResumes && item.operatorResumes.length > 0 && <p>이전 다시 실행 {item.operatorResumes.length}회 · 마지막 사유 {item.operatorResumes[item.operatorResumes.length - 1]!.reason}</p>}
      {role === "operator" && <label>다시 실행 사유(10~500자)<input value={reasons[item.id] ?? ""} maxLength={500} onChange={event => setReasons({ ...reasons, [item.id]: event.target.value })} /></label>}
      {(() => {
        const blocked = deletionResumeBlockReason({ role, reason: reasons[item.id] ?? "", busy });
        return <><button type="button" disabled={blocked !== null} aria-describedby={blocked ? `resume-block-${item.id}` : undefined} onClick={() => void resume(item.id)}>다시 실행</button>
          {blocked && <p id={`resume-block-${item.id}`}>{blocked}</p>}</>;
      })()}
    </article>)}</div>}
  </section>;
}

type StoppedAssetDeletion = { id: string; siteId: string; organizationId: string; requestedAt: string; attempts: number;
  error: string | null; stoppedAt: string | null };
// 사진 삭제 복구 (추가): 재시도 상한·저장소 권한 부족으로 멈춘 사이트 사진 삭제를 원인 확인 뒤 operator가 다시 실행한다.
function SiteAssetDeletionRecovery({ role }: { role: "operator" | "auditor" }) {
  const [items, setItems] = useState<StoppedAssetDeletion[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await request("/v1/admin/site-asset-deletions?status=stopped");
      const value = result.data as { items?: StoppedAssetDeletion[] };
      if (result.status !== 200 || !Array.isArray(value.items)) throw new Error("unavailable");
      setItems(value.items); setStatus("");
    } catch { setItems(null); setStatus("멈춘 사진 삭제를 불러오지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function resume(id: string) {
    setBusy(true);
    try {
      const result = await request(`/v1/admin/site-asset-deletions/${id}/resume`, "POST", { reason: (reasons[id] ?? "").trim() });
      if (result.status !== 200 && result.status !== 202) {
        const code = (result.data as { error?: string }).error;
        // 이미 다시 실행됐거나 삭제가 끝난 행은 목록을 새로 읽는다
        const stale = result.status === 404 || result.status === 409;
        setStatus(code === "invalid_reason" || code === "invalid_text" ? "다시 실행 사유를 10~500자로 입력해 주세요."
          : result.status === 403 ? "operator 권한이나 2단계 인증 상태를 확인하지 못해 다시 실행하지 않았습니다. 운영 상태를 새로고침해 주세요."
            : stale ? "이미 다시 실행됐거나 멈춘 상태가 아닙니다. 목록을 새로고침합니다."
              : "다시 실행하지 못했습니다. 목록을 새로고침해 실제 상태를 확인해 주세요.");
        if (stale) await load();
        return;
      }
      setReasons(current => { const next = { ...current }; delete next[id]; return next; });
      await load(); setStatus("사진 삭제 다시 실행을 예약했습니다. 삭제 작업자가 다음 주기에 실행합니다.");
    } catch { setStatus("다시 실행 결과를 확인하지 못했습니다. 목록을 새로고침해 실제 상태를 확인해 주세요."); }
    finally { setBusy(false); }
  }
  return <section className="special-panel" aria-label="사진 삭제 복구"><h2>사진 삭제 복구 (추가)</h2>
    <p>자동 삭제가 멈춘 사이트 사진입니다. 사업자 편집기에는 &quot;삭제 지연&quot;으로 표시됩니다. 원인(저장소 권한·응답 실패)을 해결한 뒤에만 다시 실행하세요. 사진 원본은 표시하지 않습니다.</p>
    {status && <p role="status" className="state-message">{status}</p>}
    <button type="button" disabled={busy} onClick={() => void load()}>목록 새로고침</button>
    {items && items.length === 0 && <p>멈춘 사진 삭제가 없습니다.</p>}
    {items && items.length > 0 && <div className="field-admin-list">{items.map(item => <article key={item.id}>
      <h3>사진 ID {item.id}</h3>
      <p>멈춘 사유 {stoppedAssetDeletionReason(item.error)} · 시도 {item.attempts}회</p>
      <p>삭제 요청 {new Date(item.requestedAt).toLocaleString("ko-KR")}{item.stoppedAt ? ` · 멈춤 ${new Date(item.stoppedAt).toLocaleString("ko-KR")}` : ""}</p>
      <p>사이트 ID {item.siteId} · 조직 ID {item.organizationId}</p>
      {role === "operator" && <label>다시 실행 사유(10~500자)<input value={reasons[item.id] ?? ""} maxLength={500} onChange={event => setReasons({ ...reasons, [item.id]: event.target.value })} /></label>}
      {(() => {
        const blocked = deletionResumeBlockReason({ role, reason: reasons[item.id] ?? "", busy });
        return <><button type="button" disabled={blocked !== null} aria-describedby={blocked ? `asset-resume-block-${item.id}` : undefined} onClick={() => void resume(item.id)}>다시 실행</button>
          {blocked && <p id={`asset-resume-block-${item.id}`}>{blocked}</p>}</>;
      })()}
    </article>)}</div>}
  </section>;
}

export function FieldAdmin({ section = "operations" }: { section?: FieldAdminSection }) {
  const [phase, setPhase] = useState<"loading" | "auth" | "totp" | "forbidden" | "mfa" | "failed" | "ready">("loading");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setPhase("loading"); setStatus(""); setOverview(null);
    try {
      const result = await request("/v1/admin/overview");
      if (result.status === 401) { setPhase("auth"); return; }
      if (result.status === 403 && (result.data as { error?: string }).error === "mfa_required") { setPhase("mfa"); return; }
      if (result.status === 403) { setPhase("forbidden"); return; }
      if (result.status !== 200) throw new Error(`조회 실패 (${result.status})`);
      const value = result.data as Overview;
      if (value.product !== "field" || !value.counts || !Array.isArray(value.recentIncidents)
        || !Array.isArray(value.recentAdminAccesses)
        || !["operator", "auditor"].includes(value.role))
        throw new Error("응답 형식 오류");
      setOverview(value); setPhase("ready");
    } catch {
      setPhase("failed"); setStatus("Field 운영 상태를 불러오지 못했습니다. 다시 시도해 주세요.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const result = await request("/api/auth/sign-in/email", "POST", { email, password });
      const outcome = signInOutcome(result.status, result.data);
      if (outcome === "email_not_verified") { setStatus("이메일 주소 확인이 필요합니다. 가입 확인 메일의 링크를 먼저 열어 주세요."); return; }
      if (outcome === "invalid_credentials") { setStatus("이메일 또는 비밀번호가 맞지 않습니다."); return; }
      if (outcome !== "signed_in" && outcome !== "two_factor") { setStatus("로그인하지 못했습니다. 잠시 뒤 다시 시도해 주세요."); return; }
      setPassword("");
      if (outcome === "two_factor") { setPhase("totp"); return; }
      await load();
    } catch { setStatus("인증 서버에 연결하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true); setStatus("");
    try {
      const result = await request("/api/auth/sign-out", "POST", {});
      if (result.status !== 200) { setStatus(adminSignOutFailure(result.status)); return; }
      setOverview(null); setPhase("auth"); setEmail(""); setPassword("");
    } catch { setStatus("로그아웃 응답을 받지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  const current = sections.find(item => item.id === section) ?? sections[0];
  const cards: [string, string][] = overview ? ({
    operations: [["Field 사업 조직", overview.counts.organizations], ["열린 직접 문의", overview.counts.openInquiries],
      ["열린 예약", overview.counts.openReservations], ["고객 알림 미연결", overview.counts.blockedCustomerNotifications],
      ["공개 사이트", overview.counts.publishedSites], ["처리 대기 사건", overview.counts.pendingOutbox]],
    organizations: [["Field 사업 조직", overview.counts.organizations], ["조직 구성원", overview.counts.memberships],
      ["공개 사이트", overview.counts.publishedSites]],
    "site-domains": [["공개 사이트", overview.counts.publishedSites], ["진행 중인 사이트 제작", overview.counts.runningSiteJobs],
      ["실패한 사이트 제작", overview.counts.failedSiteJobs]],
    notifications: [["고객 알림 미연결", overview.counts.blockedCustomerNotifications],
      ["처리 대기 사건", overview.counts.pendingOutbox]],
    billing: [["유효한 체험", overview.counts.activeTrials], ["종료 요청 체험", overview.counts.cancelRequestedTrials]],
    audit: [["관리자 운영 조회", overview.counts.adminReads]],
  } satisfies Record<FieldAdminSection, [string, string][]>)[section] : [];
  const notes: Record<FieldAdminSection, string> = {
    operations: "고객 알림 미연결은 발송 성공이 아닙니다. 예약 요청과 확정은 별도 상태입니다.",
    organizations: "사업체 상세 열람과 권한 변경은 지원 접근 승인·추가 인증을 갖춘 뒤 제공합니다.",
    "site-domains": "실제 DNS·TLS 검증과 자체 도메인 연결은 미연결입니다. 기본 공개 사이트는 별도로 유지합니다.",
    notifications: "실제 발송 공급사가 연결되지 않아 고객 알림은 미연결 상태입니다. 결과 미상 사건을 임의 재발송하지 않습니다.",
    billing: "실결제 공급사와 승인된 Field 가격·청구 원장이 미연결입니다. 체험을 유료 결제로 표시하지 않습니다.",
    audit: "고객정보는 별도 업무·정보 범위·사유·기간에 대해 다른 운영자가 승인한 경우만 확인합니다. 신고 열람 승인과 고객정보 승인은 별도이며 운영 환경 관리자 화면은 2단계 인증을 마친 세션에서만 열립니다.",
  };
  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Field" /></a>
    <nav aria-label="제품 이동"><a href="/workspace">Field 사업자 작업실</a></nav></header>
    <div className="field-admin-layout"><aside className="field-admin-sidebar"><div className="field-admin-identity"><strong>Field 운영실</strong><span>Field 제품 관리자</span></div>
      <nav aria-label="Field 관리자 화면">
        {sections.map(item => <a key={item.id} href={item.id === "operations" ? "/admin" : `/admin/${item.id}`}
          aria-current={section === item.id ? "page" : undefined}>
          {item.title.replace("Field ", "")}</a>)}
      </nav><a href="/admin/mfa">관리자 2단계 인증 설정 (추가)</a><p>고객 원문·연락처는 기본 화면에 표시하지 않습니다.</p></aside>
    <main className="feature-section field-admin-main"><div className="feature-heading"><p className="eyebrow">Field · 제품 관리자</p>
      <h1>{current.title}</h1><p>{current.description} {section === 'audit' ? '기본 화면에는 고객정보가 없습니다. 별도로 승인한 범위·기간 안에서만 열람합니다.' : '고객 원문과 연락처는 표시하지 않습니다.'}</p></div>
      {status && <p role="status" className="state-message">{status}</p>}
      {phase === "loading" && <p role="status">Field 관리자 권한과 운영 상태를 확인하는 중입니다.</p>}
      {phase === "auth" && <section className="special-panel"><h2>Field 관리자 로그인</h2><p>Field 계정과 별도 관리자 권한이 필요합니다.</p>
        <form className="form-fields" onSubmit={event => void signIn(event)}><label>이메일<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label>비밀번호<input type="password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button type="submit" disabled={busy}>Field 관리자 로그인</button></form></section>}
      {phase === "forbidden" && <section className="special-panel"><h2>관리자 권한 없음</h2><p>이 Field 계정에는 Field 관리자 권한이 없습니다. 사업자 권한만으로 운영 상태를 열 수 없습니다.</p>
        <button type="button" disabled={busy} onClick={() => void signOut()}>다른 Field 계정으로 로그인</button></section>}
      {phase === "totp" && <TwoFactorChallenge onVerified={load} onCancel={() => setPhase("auth")} />}
      {phase === "mfa" && <section className="special-panel"><h2>2단계 인증 필요</h2><p>운영 환경의 Field 관리자 화면은 인증 앱(TOTP) 2단계 인증을 마친 로그인 세션에서만 열립니다. 2단계 인증을 아직 켜지 않았다면 설정을 마친 뒤, 이미 켰다면 로그아웃 후 다시 로그인해 인증 코드를 입력해 주세요.</p>
        <a href="/admin/mfa">관리자 2단계 인증 설정 (추가) →</a>
        <button type="button" disabled={busy} onClick={() => void signOut()}>로그아웃 후 다시 로그인</button></section>}
      {phase === "failed" && <button type="button" disabled={busy} onClick={() => void load()}>운영 상태 다시 불러오기</button>}
      {phase === "ready" && overview && <>{section === "billing" ? <><BillingAdmin /><button className="field-admin-signout" type="button" disabled={busy} onClick={() => void signOut()}>Field 관리자 로그아웃</button></> : <section className="field-admin-summary"><div className="field-admin-summary-head"><div><h2>{section === "operations" ? "오늘의 운영 현황" : current.title}</h2><p>Field 관리자 · {overview.role} · 조회 시각 {new Date(overview.snapshotAt).toLocaleString("ko-KR")}</p></div><button type="button" disabled={busy} onClick={() => void load()}>새로고침</button></div>
        <div className="field-admin-stats">{cards.map(([label, count]) => <article key={label}><h3>{label}</h3><strong>{count}</strong><span>건</span></article>)}</div>
        <p className="field-admin-note">{notes[section]}</p>
        <button className="field-admin-signout" type="button" disabled={busy} onClick={() => void signOut()}>Field 관리자 로그아웃</button></section>}
        {(section === "operations" || section === "notifications") && <section className="special-panel" aria-label="최근 대기 사건"><h2>최근 대기 사건</h2>
          <p>사건 유형·시각·상태만 표시합니다. 이 운영 조회는 Field 감사 원장에 기록됩니다.</p>
          {overview.recentIncidents.length === 0 ? <p>현재 표시할 대기 사건이 없습니다.</p>
            : <div className="field-admin-list">{overview.recentIncidents.map(item => <article key={item.eventId}>
              <h3>{item.eventType}</h3><p>{item.state === "blocked_integration" ? "고객 알림 미연결" : "처리 대기"} · {new Date(item.occurredAt).toLocaleString("ko-KR")}</p>
              <p>사건 ID {item.eventId}</p>
            </article>)}</div>}
        </section>}
        {section === "notifications" && <FieldEmailOutboxAdmin />}
        {section === "organizations" && <OrganizationDeletionRecovery role={overview.role} />}
        {section === "organizations" && <SiteAssetDeletionRecovery role={overview.role} />}
        {section === "audit" && <FieldModerationAdmin actorUserId={overview.actorUserId} role={overview.role} />}
        {section === "audit" && <FieldCustomerSupport actorUserId={overview.actorUserId} role={overview.role} />}
        {section === "audit" && <FieldRetentionAdmin actorUserId={overview.actorUserId} role={overview.role} />}
        {section === "audit" && <section className="special-panel" aria-label="최근 관리자 조회"><h2>최근 관리자 조회</h2>
          {overview.recentAdminAccesses.length === 0 ? <p>조회 기록이 없습니다.</p>
            : <div className="field-admin-list">{overview.recentAdminAccesses.map((item, index) => <article key={`${item.actorUserId}-${item.accessedAt}-${index}`}>
              <h3>운영 상태 조회</h3><p>{new Date(item.accessedAt).toLocaleString("ko-KR")}</p>
              <p>운영자 ID {item.actorUserId}</p>
            </article>)}</div>}
        </section>}</>}
    </main><nav className="field-admin-mobile-nav" aria-label="Field 관리자 화면">
      <a href="/admin" aria-current={section === "operations" ? "page" : undefined}>운영</a>
      <a href="/admin/site-domains" aria-current={section === "site-domains" ? "page" : undefined}>제작</a>
      <a href="/admin/notifications" aria-current={section === "notifications" ? "page" : undefined}>발송</a>
      <a href="/admin/audit" aria-current={section === "audit" ? "page" : undefined}>감사</a>
      <details><summary>더보기</summary><div><a href="/admin/organizations" aria-current={section === "organizations" ? "page" : undefined}>사업체</a><a href="/admin/billing" aria-current={section === "billing" ? "page" : undefined}>구독</a><a href="/admin/mfa">2단계 인증 (추가)</a></div></details>
    </nav></div></div>;
}
