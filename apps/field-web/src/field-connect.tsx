"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { signInOutcome } from "./auth-flow";
import { TwoFactorChallenge } from "./field-auth-pages";
import { FieldKakaoSignIn } from "./field-kakao-sign-in";
import { scopeLabel } from "./connect-scope-label";
import "./field-connect.css";

type Organization = { id: string; name: string; catalogRevision: number | null };
type Options = { client: { id: string; name: string; scopes: string[] }; organizations: Organization[] };
type Selection = { id: string; clientId: string; clientName: string;
  organizationName: string; scopes: string[] };

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) as Record<string, unknown> };
}
function oauthQuery() { return window.location.search.slice(1); }
function requestedScopes() {
  return [...new Set((new URLSearchParams(window.location.search).get("scope") ?? "")
    .split(/\s+/).filter(scope => scope.startsWith("field.")))];
}
function follow(result: { status: number; data: Record<string, unknown> }) {
  if (result.status !== 200 || result.data.redirect !== true || typeof result.data.url !== "string")
    throw new Error(String(result.data.error ?? `OAuth 단계 실패 (${result.status})`));
  window.location.assign(result.data.url);
}
function Shell({ title, children, status }: { title: string; children: React.ReactNode; status: string }) {
  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Field" /></a></header>
    <main className="feature-section field-connect"><p className="eyebrow">Field · 외부 서비스 연결</p>
      <h1>{title}</h1>{status && <p role="status" className="state-message">{status}</p>}{children}</main></div>;
}

export function FieldConnectSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  useEffect(() => {
    void request("/api/auth/get-session").then(result => {
      if (result.status === 200 && result.data?.user)
        void request("/api/auth/oauth2/continue", "POST", { postLogin: true, oauth_query: oauthQuery() })
          .then(follow).catch(error => setStatus(error.message));
    }).catch(() => setStatus("Field 인증 서버에 연결할 수 없습니다."));
  }, []);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("로그인 중입니다.");
    try {
      const result = await request("/api/auth/sign-in/email", "POST", { email, password });
      if (result.status !== 200) { setStatus("로그인에 실패했습니다. 계정과 비밀번호를 확인해 주세요."); return; }
      // 2단계 인증 계정은 세션이 아직 없으므로 코드 확인 뒤에 원래 연결 동의 흐름을 이어 간다.
      if (signInOutcome(result.status, result.data) === "two_factor") { setStatus(""); setTwoFactorPending(true); return; }
      await continueConnect();
    } catch (error) { setStatus(error instanceof Error ? error.message : "연결을 계속하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function continueConnect() {
    follow(await request("/api/auth/oauth2/continue", "POST", { postLogin: true, oauth_query: oauthQuery() }));
  }
  async function verified() {
    setStatus("연결을 계속하고 있습니다.");
    try { await continueConnect(); }
    catch (error) { setStatus(error instanceof Error ? error.message : "연결을 계속하지 못했습니다."); }
  }
  return <Shell title="Field 계정으로 로그인" status={status}>
    <p>공유할 Field 사업장을 소유한 계정으로 로그인하세요. 계정과 사업장 생성은 Field 작업 공간에서 진행합니다.</p>
    {twoFactorPending ? <TwoFactorChallenge onVerified={verified} onCancel={() => { setTwoFactorPending(false); setPassword(""); }} />
      : <>{/* 카카오 로그인도 이 연결 화면(서명된 연결 요청 쿼리 포함)으로 돌아와 2단계 인증·연결 이어 가기를 같은 흐름으로 처리한다 */}
      <FieldKakaoSignIn callbackPath="/connect/sign-in" label="카카오로 로그인" onTwoFactor={() => { setStatus(""); setTwoFactorPending(true); }} />
      <p>카카오로 로그인해도 연결할 Field 계정과 사업장은 Field 작업 공간에서 먼저 만들어 두어야 합니다.</p>
      <div className="field-auth-divider">또는 이메일로</div>
      <form className="form-fields field-connect-form" onSubmit={event => void signIn(event)}>
      <label>이메일<input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>비밀번호<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button type="submit" disabled={busy}>로그인하고 연결 계속</button></form></>}
    <p><a href="/workspace">Field 작업 공간에서 계정 확인</a></p></Shell>;
}

export function FieldConnectSelect() {
  const [options, setOptions] = useState<Options | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("연결 가능한 Field 사업장을 확인하고 있습니다.");
  useEffect(() => {
    const clientId = new URLSearchParams(window.location.search).get("client_id");
    if (!clientId || requestedScopes().length === 0) { setStatus("Field 접근 범위가 포함된 유효한 연결 요청이 아닙니다."); return; }
    void request(`/integrations/v1/authorization/options?clientId=${encodeURIComponent(clientId)}`)
      .then(result => {
        if (result.status === 401) { window.location.assign(`/connect/sign-in${window.location.search}`); return; }
        if (result.status !== 200) { setStatus("등록된 외부 서비스 정보를 확인하지 못했습니다."); return; }
        const value = result.data as unknown as Options;
        if (requestedScopes().some(scope => !value.client.scopes.includes(scope))) {
          setStatus("외부 서비스에 등록되지 않은 접근 범위가 요청됐습니다."); return;
        }
        setOptions(value);
        setStatus(value.organizations.some(item => item.catalogRevision !== null) ? ""
          : value.organizations.length === 0 ? "연결할 Field 사업장이 없습니다. Field 작업 공간(/workspace)에서 사업장을 만들고 사업 정보를 승인한 뒤 연결 요청을 다시 시작해 주세요."
          : "연결할 승인 사업 정보가 없습니다. Field 작업 공간에서 카탈로그를 승인해 주세요.");
      }).catch(() => setStatus("Field 서버에 연결할 수 없습니다."));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!options || !organizationId) return;
    setBusy(true); setStatus("선택한 Field 사업장을 기록하고 있습니다.");
    try {
      const saved = await request("/integrations/v1/authorization/selections", "POST", {
        clientId: options.client.id, organizationId, scopes: requestedScopes(),
      });
      if (saved.status !== 201) { setStatus(`사업장 선택을 저장하지 못했습니다 (${saved.status}).`); return; }
      follow(await request("/api/auth/oauth2/continue", "POST", { postLogin: true, oauth_query: oauthQuery() }));
    } catch (error) { setStatus(error instanceof Error ? error.message : "동의 화면으로 이동하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <Shell title="공유할 Field 사업장 선택" status={status}>{options && <>
    <p><strong>{options.client.name}</strong>에서 Field 정보 접근을 요청했습니다. 선택한 사업장의 승인 사실만 보입니다.</p>
    <form className="field-connect-form form-fields" onSubmit={event => void submit(event)}>
      <label>Field 사업장<select required value={organizationId} onChange={event => setOrganizationId(event.target.value)}>
        <option value="">사업장 선택</option>{options.organizations.map(item =>
          <option key={item.id} value={item.id} disabled={item.catalogRevision === null}>
            {item.name} · {item.catalogRevision === null ? "승인 정보 없음" : `승인 ${item.catalogRevision}`}
          </option>)}</select></label>
      <section aria-label="요청 접근 범위"><h2>요청 접근 범위</h2><ul>{requestedScopes().map(scope => <li key={scope}>{scopeLabel(scope)}</li>)}</ul></section>
      <button type="submit" disabled={busy || !organizationId}>선택하고 동의 내용 확인</button>
    </form></>}</Shell>;
}

export function FieldConnectConsent() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("연결 동의 내용을 확인하고 있습니다.");
  useEffect(() => {
    const clientId = new URLSearchParams(window.location.search).get("client_id");
    if (!clientId) { setStatus("유효하지 않은 연결 요청입니다."); return; }
    void request(`/integrations/v1/authorization/current?clientId=${encodeURIComponent(clientId)}`)
      .then(result => {
        if (result.status === 401) { window.location.assign(`/connect/sign-in${window.location.search}`); return; }
        if (result.status !== 200) { setStatus("현재 사업장 선택이 만료됐습니다. 연결 요청을 다시 시작해 주세요."); return; }
        const value = result.data as unknown as Selection;
        const scopes = requestedScopes();
        if (scopes.length !== value.scopes.length || scopes.some(scope => !value.scopes.includes(scope))) {
          setStatus("선택한 접근 범위와 외부 서비스 요청이 다릅니다. 연결 요청을 다시 시작해 주세요."); return;
        }
        setSelection(value); setStatus("");
      }).catch(() => setStatus("Field 서버에 연결할 수 없습니다."));
  }, []);
  async function decide(accept: boolean) {
    setBusy(true); setStatus(accept ? "연결을 승인하고 있습니다." : "연결을 거부하고 있습니다.");
    try { follow(await request("/api/auth/oauth2/consent", "POST", { accept, oauth_query: oauthQuery() })); }
    catch (error) { setStatus(error instanceof Error ? error.message : "동의 결과를 전달하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <Shell title="Field 정보 접근 동의" status={status}>{selection && <div className="field-connect-form">
    <p><strong>{selection.clientName}</strong>에 다음 Field 자원 접근을 허용하시겠습니까?</p>
    <dl><dt>사업장</dt><dd>{selection.organizationName}</dd><dt>접근 범위</dt><dd>{selection.scopes.map(scopeLabel).join(", ")}</dd></dl>
    <p>동의 후에도 연결 권한을 철회할 수 있습니다. Field 사이트·직접 문의·예약 원본은 Field에 남습니다.</p>
    <div className="field-connect-actions"><button type="button" disabled={busy} onClick={() => void decide(true)}>접근 허용</button>
      <button type="button" disabled={busy} onClick={() => void decide(false)}>거부</button></div>
  </div>}</Shell>;
}
