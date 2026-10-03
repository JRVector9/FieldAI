"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Brand } from "@fieldai/ui";
import { kakaoAuthorizeUrl } from "./field-kakao-sign-in";

type Precondition = { code: string; count: number; ok: boolean };
type DeletionRequest = { id: string; status: "scheduled" | "canceled" | "executed"; reason: string | null; requestedAt: string;
  scheduledAt: string; canceledAt: string | null; executedAt: string | null; lastError: string | null };
type OrganizationDeletion = { product: "field"; organization: { id: string; name: string; deleted: boolean }; canManage: boolean;
  coolingDays: number; preconditions: Precondition[]; request: DeletionRequest | null };
type OwnedOrganization = { id: string; name: string; deleted: boolean; deletionStatus: "none" | "scheduled" | "canceled" | "executed";
  scheduledAt: string | null; executedAt: string | null };
type Eligibility = { product: "field"; email: string; eligible: boolean; blockers: string[];
  reauthentication: "password" | "recent_sign_in"; recentSignInMinutes: number; organizations?: OwnedOrganization[] };

// 서버 오류·차단 코드를 사용자 안내 문구로 바꾼다. 알 수 없는 코드는 그대로 숨기지 않고 코드와 함께 알린다.
const MESSAGES: Record<string, string> = {
  paid_subscription_active: "해지되지 않은 유료 구독이 있습니다. 구독·결제에서 먼저 해지해 주세요.",
  connections_active: "AP 연결이 남아 있습니다. 연동 서비스 화면에서 먼저 연결을 해제해 주세요.",
  open_reservations: "완료·취소되지 않은 예약이 있습니다. 예약을 마무리한 뒤 다시 시도해 주세요.",
  blocked_integration: "사이트 사진 저장소에 연결되지 않아 삭제 실행을 기다리고 있습니다.",
  media_permission: "사이트 사진 저장소 권한이 부족해 삭제 실행이 멈췄습니다. 운영자가 저장소 권한을 확인한 뒤 다시 실행합니다.",
  execution_failed: "삭제 실행 중 오류가 나 다시 시도하고 있습니다.",
  execution_attempts_stopped: "자동 실행을 멈췄습니다. 운영자 확인 뒤 다시 실행됩니다.",
  organization_deletion_required: "삭제되지 않은 조직의 owner입니다. 조직 삭제가 끝난 뒤 계정을 삭제할 수 있습니다.",
  admin_membership_required_removal: "플랫폼 관리자 권한이 있는 계정입니다. 운영자에게 권한 해제를 먼저 요청해 주세요.",
  oauth_grants_active: "외부 서비스에 준 접근 권한이 남아 있습니다. 연결을 먼저 해제해 주세요.",
  // 2026-10-03 종합 리뷰 반영: 계정 삭제 차단 사유·취소 불가 코드
  oauth_clients_active: "이 계정이 등록한 외부 연동 client가 아직 활성 상태입니다. client를 먼저 비활성화하거나 운영자에게 요청해 주세요.",
  publisher_membership_required_removal: "제휴 매체 소유자 또는 구성원인 계정입니다. 매체 권한을 먼저 정리해 주세요.",
  deletion_in_progress: "유예 기간이 끝나 삭제가 이미 시작되어 취소할 수 없습니다.",
  reauth_required: "비밀번호 로그인 정보가 없는 계정입니다. 최근 5분 이내 카카오로 다시 로그인한 뒤 진행해 주세요.",
  password_attempts_exceeded: "비밀번호 확인 시도가 많아 15분 동안 제한됩니다. 잠시 뒤 다시 시도해 주세요.",
  confirmation_mismatch: "확인 문구가 일치하지 않습니다.",
  acknowledgements_required: "안내 사항에 모두 동의해야 합니다.",
  invalid_password: "비밀번호가 올바르지 않습니다.",
  owner_required: "조직 owner만 삭제를 요청하거나 취소할 수 있습니다.",
  organization_deleted: "이미 삭제가 실행된 조직입니다.",
  deletion_request_not_found: "취소할 삭제 예약이 없습니다.",
  password_required: "본인 확인을 위해 비밀번호를 입력해 주세요.",
  organization_not_found: "삭제할 조직을 찾지 못했습니다. 조직 owner 계정으로 로그인했는지 확인해 주세요.",
  invalid_organization_id: "선택한 조직 정보를 확인하지 못했습니다. 상태를 새로고침해 조직을 다시 선택해 주세요.",
  account_not_found: "계정 정보를 찾지 못했습니다. 다시 로그인해 주세요.",
  authentication_required: "다시 로그인한 뒤 진행해 주세요.",
  invalid_reason: "삭제 사유는 1,000자 이하로 입력해 주세요.",
};
// execution_failed:<상세 코드>처럼 상세가 붙은 실행 오류는 앞부분으로 조회하고 상세 코드는 괄호로만 보인다.
export const deletionMessage = (code: string) => {
  const [head, detail] = code.split(":", 2);
  if (head === "execution_failed" && detail) return `실행 중 오류가 나 다시 시도합니다 (코드 ${detail}).`;
  return MESSAGES[code] ?? `요청이 거절됐습니다 (${code}).`;
};
const PRECONDITION_LABELS: Record<string, string> = {
  paid_subscription_active: "유료 구독 해지", connections_active: "AP 연결 해제", open_reservations: "진행 중 예약 마무리",
  integration_grants_active: "외부 연동 접근 권한(실행 시 자동 회수)",
};
const date = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
const DELETION_STATUS_LABELS: Record<OwnedOrganization["deletionStatus"], string> = {
  none: "", scheduled: " · 삭제 예약됨", canceled: " · 예약 취소됨", executed: " · 삭제 완료",
};
// 여러 조직의 owner일 때만 삭제 대상 조직 선택지를 보여 준다(추가). 하나뿐이면 선택 없이 그 조직을 쓴다.
export function organizationChoices(eligibility: Pick<Eligibility, "organizations"> | null) {
  const list = eligibility?.organizations ?? [];
  return list.length > 1 ? list : [];
}
// 선택한 조직은 다른 owner 화면과 같은 x-organization-id 헤더로 보낸다.
const organizationHeader = (organizationId: string | null): Record<string, string> =>
  organizationId ? { "x-organization-id": organizationId } : {};

export function FieldAccount() {
  const [organization, setOrganization] = useState<OrganizationDeletion | null>(null);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [notice, setNotice] = useState("삭제 조건을 불러오는 중입니다.");
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [ack, setAck] = useState({ retention: false, subscriptions: false, connections: false });
  const [reason, setReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<string | null>(null);
  const [organizationPassword, setOrganizationPassword] = useState("");
  const [password, setPassword] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [accountAck, setAccountAck] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);
  // 확인 단계 전환·요청 처리 뒤 포커스를 확인 영역·원래 버튼·상태 메시지로 옮긴다(버튼이 사라지면 포커스가 body로 빠지는 문제 방지)
  const reviewRef = useRef<HTMLDivElement>(null);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const [focusTarget, setFocusTarget] = useState<"review" | "reviewButton" | "notice" | null>(null);
  useEffect(() => {
    if (!focusTarget) return;
    const target = { review: reviewRef, reviewButton: reviewButtonRef, notice: noticeRef }[focusTarget].current;
    (target ?? noticeRef.current)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const load = useCallback(async (organizationId: string | null = null) => {
    setBusy(true);
    try {
      const [orgResponse, accountResponse] = await Promise.all([
        fetch("/v1/organizations/current/deletion-requests/current", { credentials: "same-origin", headers: organizationHeader(organizationId) }),
        fetch("/v1/account/deletion-eligibility", { credentials: "same-origin" }),
      ]);
      if (accountResponse.status === 401) { setOrganization(null); setEligibility(null); setNotice("Field에 로그인해 주세요."); return; }
      if (!accountResponse.ok || (!orgResponse.ok && orgResponse.status !== 404)) throw new Error("unavailable");
      setOrganization(orgResponse.ok ? await orgResponse.json() as OrganizationDeletion : null);
      setEligibility(await accountResponse.json() as Eligibility);
      setNotice("");
    } catch { setNotice("삭제 조건을 불러오지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function send(method: "POST" | "DELETE", url: string, body?: object, organizationId: string | null = null) {
    setBusy(true);
    try {
      const response = await fetch(url, { method, credentials: "same-origin",
        headers: { ...organizationHeader(organizationId), ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined });
      const value = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setNotice(deletionMessage(value.error ?? String(response.status))); return false; }
      return true;
    } catch { setNotice("요청 결과를 확인하지 못했습니다. 상태를 새로고침해 실제 상태를 확인해 주세요."); return false; }
    finally { setBusy(false); }
  }

  // 조직을 바꾸면 이전 조직에 입력한 확인 문구·동의를 비우고 그 조직의 삭제 상태를 다시 불러온다.
  async function selectOrganization(organizationId: string) {
    setSelectedOrganization(organizationId); setConfirmText(""); setAck({ retention: false, subscriptions: false, connections: false });
    setReviewing(false); setOrganizationPassword(""); await load(organizationId);
  }
  async function schedule() {
    // 조직 삭제 예약도 계정 삭제와 같은 본인 확인(비밀번호 재입력 또는 최근 카카오 로그인)을 거친다(추가).
    const needsPassword = eligibility?.reauthentication !== "recent_sign_in";
    const scheduled = await send("POST", "/v1/organizations/current/deletion-requests", { confirmText, acknowledgements: ack,
      reason: reason.trim() || undefined, ...(needsPassword ? { password: organizationPassword } : {}) }, selectedOrganization);
    // 성공·실패 모두 입력한 비밀번호는 지우고 확인 단계를 닫는다(실패 시 다시 입력).
    setOrganizationPassword(""); setReviewing(false); setFocusTarget("notice");
    if (scheduled) {
      await load(selectedOrganization); setNotice("조직 삭제를 예약했습니다. 유예 기간 동안 언제든 취소할 수 있습니다.");
    }
  }
  async function cancel() {
    if (await send("DELETE", "/v1/organizations/current/deletion-requests/current", undefined, selectedOrganization)) {
      await load(selectedOrganization); setNotice("조직 삭제 예약을 취소했습니다. 공개 사이트가 다시 보이고 새 문의·예약을 받을 수 있습니다.");
    }
    setFocusTarget("notice");
  }
  // 카카오 전용 계정의 본인 확인: 카카오로 다시 로그인해 새 세션을 만든 뒤 이 화면으로 돌아온다.
  async function reauthWithKakao() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "kakao", callbackURL: "/workspace/account", errorCallbackURL: "/workspace/account?auth_error=kakao" }),
      });
      const target = response.status === 200 ? kakaoAuthorizeUrl(await response.json().catch(() => null)) : null;
      if (target) { window.location.assign(target); return; }
      setNotice("카카오 로그인을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } catch { setNotice("카카오 로그인 요청이 전달되지 않았습니다."); }
    setBusy(false);
  }
  async function deleteAccount() {
    const needsPassword = eligibility?.reauthentication !== "recent_sign_in";
    if (await send("POST", "/v1/account/deletion-requests", { ...(needsPassword ? { password } : {}), confirmText: emailConfirm, acknowledgement: true })) {
      setPassword(""); setAccountDeleted(true); setOrganization(null); setEligibility(null);
      setNotice("계정을 삭제했습니다. 모든 기기에서 로그아웃되었습니다.");
    }
    setFocusTarget("notice");
  }

  const request = organization?.request;
  const scheduled = request?.status === "scheduled";
  const executed = request?.status === "executed" || organization?.organization.deleted;
  const ready = organization?.preconditions.every(item => item.ok) ?? false;
  const choices = organizationChoices(eligibility);
  // 비밀번호가 없는 계정은 최근 로그인 세션이 있어야 하고, 비밀번호 계정은 비밀번호를 입력해야 예약할 수 있다.
  const organizationReauthMissing = eligibility?.reauthentication === "recent_sign_in" && eligibility.blockers.includes("reauth_required");
  const organizationReauthReady = eligibility?.reauthentication === "recent_sign_in" ? !organizationReauthMissing : organizationPassword.length > 0;
  const formComplete = organization ? confirmText === organization.organization.name && ack.retention && ack.subscriptions && ack.connections
    && organizationReauthReady : false;

  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Field" /></a><nav aria-label="작업 메뉴"><a href="/workspace">사업 운영</a><a href="/workspace/subscription">구독·데이터 관리</a></nav></header>
    <main className="feature-section field-account-page"><div className="feature-heading"><p className="eyebrow">Field · 계정</p><h1>계정·조직 삭제 (추가)</h1><p>Field 조직과 계정만 삭제합니다. AP 계정·독립 AI·구독은 별도 제품에서 관리하며 자동으로 삭제되지 않습니다.</p></div>
      <button className="field-account-button" type="button" disabled={busy} onClick={() => void load(selectedOrganization)}>상태 새로고침</button>
      {notice && <p ref={noticeRef} tabIndex={-1} role="status" className="state-message">{notice} {accountDeleted ? <a href="/">처음 화면으로</a> : null}</p>}
      {!accountDeleted && <div className="special-grid">
        <section className="special-panel"><h2>조직 삭제 (추가)</h2>
          {choices.length > 0 && <label>삭제할 조직 선택 (추가)<select value={selectedOrganization ?? organization?.organization.id ?? ""} disabled={busy}
            onChange={event => void selectOrganization(event.target.value)}>
            {choices.map(item => <option key={item.id} value={item.id}>{item.name}{DELETION_STATUS_LABELS[item.deletionStatus] ?? ""}</option>)}
          </select></label>}
          {!organization && eligibility && <p>삭제할 Field 조직이 없습니다.</p>}
          {organization && <>
            <p>조직: <strong>{organization.organization.name}</strong></p>
            <p>삭제를 요청하면 {organization.coolingDays}일 유예 후 실행됩니다. 요청 즉시 공개 사이트가 내려가고 새 사이트 제작·문의·예약 접수가 중지됩니다. 고객은 기존 접수 확인 링크로 계속 열람할 수 있습니다.</p>
            <p>실행 시 사이트 초안·공개본·사진, 사업 소개·서비스·연락처 등 사업자가 입력한 정보와 사업자 알림 연락처를 지우고, 자체 도메인 연결과 구성원을 해제합니다. 다른 Field 조직에 속하지 않은 구성원은 로그인 세션도 종료됩니다. 고객 문의·예약 원본은 보존 정책 기간 동안 유지되고, 청구 원장·감사 기록은 법정 기간 보관합니다. 상호명은 고객 접수 확인을 위해 남습니다.</p>
            <p><a href="/workspace/subscription">삭제 전에 운영 기록을 내려받으세요</a></p>
            {executed && request && <p>삭제 실행 완료: {request.executedAt ? date(request.executedAt) : "기록됨"}</p>}
            {scheduled && request && <><p>삭제 예약됨 · 요청 {date(request.requestedAt)} · 실행 예정 {date(request.scheduledAt)}</p>
              {request.lastError && <p>실행 대기 사유: {request.lastError.split(",").map(deletionMessage).join(" ")}</p>}
              {organization.canManage ? <button className="field-account-button" type="button" disabled={busy} onClick={() => void cancel()}>삭제 예약 취소</button> : <p>취소 권한은 조직 owner에게 있습니다.</p>}</>}
            {!executed && !scheduled && <>
              <h3>삭제 전 확인</h3>
              <ul>{organization.preconditions.map(item => <li key={item.code}>{item.ok ? "충족" : "미충족"} · {PRECONDITION_LABELS[item.code] ?? item.code}{item.ok ? "" : ` (${item.count}건) — ${deletionMessage(item.code)}`}</li>)}</ul>
              {request?.status === "canceled" && request.canceledAt && <p>이전 삭제 예약은 {date(request.canceledAt)}에 취소되었습니다.</p>}
              {!organization.canManage ? <p>조직 삭제는 조직 owner만 요청할 수 있습니다.</p> : <>
                <label>확인을 위해 조직 이름 <strong>{organization.organization.name}</strong>을(를) 그대로 입력하세요<input value={confirmText} onChange={event => setConfirmText(event.target.value)} autoComplete="off" /></label>
                <label className="field-account-consent"><input type="checkbox" checked={ack.retention} onChange={event => setAck({ ...ack, retention: event.target.checked })} /> 고객 문의 원본·청구 원장·감사 기록은 보존 기간 동안 남는다는 것을 이해했습니다.</label>
                <label className="field-account-consent"><input type="checkbox" checked={ack.subscriptions} onChange={event => setAck({ ...ack, subscriptions: event.target.checked })} /> 유료 구독을 해지했고, 삭제 후 환불·재개가 자동으로 이뤄지지 않는다는 것을 이해했습니다.</label>
                <label className="field-account-consent"><input type="checkbox" checked={ack.connections} onChange={event => setAck({ ...ack, connections: event.target.checked })} /> AP 등 외부 연결을 해제했고, 다른 제품의 계정은 따로 삭제해야 한다는 것을 이해했습니다.</label>
                <label>삭제 사유(선택)<textarea value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} /></label>
                {eligibility?.reauthentication === "recent_sign_in"
                  ? <><p>본인 확인 (추가): 비밀번호가 없는 계정은 최근 {eligibility.recentSignInMinutes}분 이내 로그인으로 본인 확인을 대신합니다.{organizationReauthMissing ? " 시간이 지났습니다. 카카오로 다시 로그인한 뒤 진행해 주세요." : ""}</p>
                    {organizationReauthMissing && <p><button className="field-account-button" type="button" disabled={busy} onClick={() => void reauthWithKakao()}>카카오로 다시 로그인</button></p>}</>
                  : <label>본인 확인 비밀번호 재입력 (추가)<input type="password" value={organizationPassword} autoComplete="current-password" onChange={event => setOrganizationPassword(event.target.value)} /></label>}
                {!reviewing ? <p><button ref={reviewButtonRef} className="field-account-button" type="button" disabled={busy || !ready || !formComplete} onClick={() => { setReviewing(true); setFocusTarget("review"); }}>삭제 예약 내용 확인</button></p>
                  : <div ref={reviewRef} tabIndex={-1} role="alert"><p>{organization.coolingDays}일 뒤 <strong>{organization.organization.name}</strong> 조직을 삭제합니다. 그 전까지는 취소할 수 있습니다.</p>
                    <button className="field-account-button" type="button" disabled={busy} onClick={() => void schedule()}>삭제 예약 확정</button> <button className="field-account-button" type="button" disabled={busy} onClick={() => { setReviewing(false); setFocusTarget("reviewButton"); }}>돌아가기</button></div>}
                {!ready && <p>위 조건을 모두 충족해야 삭제를 예약할 수 있습니다.</p>}
              </>}
            </>}
          </>}
        </section>
        <section className="special-panel"><h2>계정 삭제 (추가)</h2>
          {eligibility && <>
            <p>Field 로그인 계정을 삭제합니다. 로그인 정보·2단계 인증·세션을 지우고 이름과 이메일(인증 메일 발송 기록 포함)을 익명 처리합니다. 승인·청구 기록에 남은 계정 식별자는 법정 보존을 위해 익명 상태로 유지됩니다.</p>
            {eligibility.blockers.length > 0 ? <><ul>{eligibility.blockers.map(code => <li key={code}>{deletionMessage(code)}</li>)}</ul>
              {eligibility.blockers.length === 1 && eligibility.blockers[0] === "reauth_required" && <p><button className="field-account-button" type="button" disabled={busy} onClick={() => void reauthWithKakao()}>카카오로 다시 로그인</button></p>}</> : <>
              {eligibility.reauthentication === "recent_sign_in"
                ? <p>비밀번호가 없는 계정은 최근 {eligibility.recentSignInMinutes}분 이내 로그인으로 본인 확인을 대신합니다. 시간이 지나면 카카오로 다시 로그인한 뒤 진행해 주세요.</p>
                : <label>비밀번호 재입력<input type="password" value={password} autoComplete="current-password" onChange={event => setPassword(event.target.value)} /></label>}
              <label>확인을 위해 계정 이메일 <strong>{eligibility.email}</strong>을(를) 입력하세요<input value={emailConfirm} autoComplete="off" onChange={event => setEmailConfirm(event.target.value)} /></label>
              <label className="field-account-consent"><input type="checkbox" checked={accountAck} onChange={event => setAccountAck(event.target.checked)} /> 계정 삭제는 즉시 실행되며 되돌릴 수 없다는 것을 이해했습니다.</label>
              <p><button className="field-account-button" type="button" disabled={busy || (eligibility.reauthentication !== "recent_sign_in" && !password) || !accountAck || emailConfirm.trim().toLowerCase() !== eligibility.email.toLowerCase()} onClick={() => void deleteAccount()}>계정 영구 삭제</button></p>
            </>}
          </>}
        </section>
      </div>}
    </main></div>;
}
