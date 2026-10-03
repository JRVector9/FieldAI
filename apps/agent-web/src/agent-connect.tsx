"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { signInOutcome } from "./auth-flow";
import { DELETION_SCHEDULED_OWNER_MESSAGE, isDeletionScheduledError } from "./deletion-scheduled-copy";
import { TwoFactorChallenge } from "./agent-auth-pages";
import { AgentKakaoSignIn } from "./agent-kakao-sign-in";
import "./agent-connect.css";

type Deployment = { id: string; publicId: string; kind: string; origin: string | null };
type Organization = { id: string; name: string; agentId: string; agentName: string;
  agentRevision: number; deployments: Deployment[] };
type Options = { client: { id: string; name: string; scopes: string[] }; organizations: Organization[] };
type Selection = { id: string; clientId: string; clientName: string; organizationName: string;
  agentName: string; deploymentIds: string[]; scopes: string[] };

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) as Record<string, unknown> };
}

function scopeLabel(scope: string) {
  return scope === "ap.connections.create" ? "외부 사이트 설치 연결 생성 (추가)"
    : scope === "ap.deployments.manage" ? "이 외부 서비스가 만든 상담 설치 관리 (추가)" : scope;
}

function oauthQuery() { return window.location.search.slice(1); }
function requestedScopes() {
  return [...new Set((new URLSearchParams(window.location.search).get("scope") ?? "")
    .split(/\s+/).filter(scope => scope.startsWith("ap.")))];
}
function follow(result: { status: number; data: Record<string, unknown> }) {
  if (result.status !== 200 || result.data.redirect !== true || typeof result.data.url !== "string")
    throw new Error(String(result.data.error ?? `OAuth 단계 실패 (${result.status})`));
  window.location.assign(result.data.url);
}

function Shell({ title, children, status }: { title: string; children: React.ReactNode; status: string }) {
  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Agent Platform" /></a></header>
    <main className="feature-section ap-connect"><p className="eyebrow">Agent Platform · 외부 서비스 연결</p>
      <h1>{title}</h1>{status && <p role="status" className="state-message">{status}</p>}{children}</main></div>;
}

export function ConnectSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  // 2단계 인증은 끝났지만 연결 이어 가기에 실패한 상태. 이미 쓴 코드 입력 대신 다시 시도 버튼을 보인다
  const [continueFailed, setContinueFailed] = useState(false);
  useEffect(() => {
    void request("/api/auth/get-session").then(result => {
      if (result.status === 200 && result.data?.user)
        void request("/api/auth/oauth2/continue", "POST", { postLogin: true, oauth_query: oauthQuery() })
          .then(follow).catch(error => setStatus(error.message));
    }).catch(() => setStatus("AP 인증 서버에 연결할 수 없습니다."));
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
    setBusy(true); setContinueFailed(false); setStatus("연결을 계속하고 있습니다.");
    try { await continueConnect(); }
    catch (error) {
      setContinueFailed(true);
      setStatus(error instanceof Error ? error.message : "연결을 계속하지 못했습니다.");
    }
    finally { setBusy(false); }
  }
  return <Shell title="AP 계정으로 로그인" status={status}><p>외부 서비스에 연결할 AP 계정으로 로그인하세요. 가입과 조직 생성은 AP 작업 공간에서 진행합니다.</p>
    {continueFailed ? <div className="ap-connect-actions">
      <button type="button" disabled={busy} onClick={() => void verified()}>다시 시도 (추가)</button></div>
      : twoFactorPending ? <TwoFactorChallenge onVerified={verified} onCancel={() => { setTwoFactorPending(false); setPassword(""); }} />
      : <>{/* 카카오 로그인도 이 연결 화면(서명된 연결 요청 쿼리 포함)으로 돌아와 2단계 인증·연결 이어 가기를 같은 흐름으로 처리한다 */}
      <AgentKakaoSignIn callbackPath="/connect/sign-in" label="카카오로 로그인" onTwoFactor={() => { setStatus(""); setTwoFactorPending(true); }} />
      <p>카카오로 로그인해도 연결할 AP 계정과 조직은 AP 작업 공간에서 먼저 만들어 두어야 합니다.</p>
      <div className="agent-auth-divider">또는 이메일로</div>
      <form className="form-fields ap-connect-form" onSubmit={event => void signIn(event)}>
      <label>이메일<input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>비밀번호<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button type="submit" disabled={busy}>로그인하고 연결 계속</button></form></>}
    <p><a href="/workspace">AP 작업 공간에서 계정 확인</a></p></Shell>;
}

export function ConnectSelect() {
  const [options, setOptions] = useState<Options | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [deployments, setDeployments] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("연결 가능한 AP 조직과 AI를 확인하고 있습니다.");
  useEffect(() => {
    const clientId = new URLSearchParams(window.location.search).get("client_id");
    if (!clientId || requestedScopes().length === 0) { setStatus("AP 접근 범위가 포함된 유효한 연결 요청이 아닙니다."); return; }
    void request(`/integrations/v1/authorization/options?clientId=${encodeURIComponent(clientId)}`)
      .then(result => {
        if (result.status === 401) { window.location.assign(`/connect/sign-in${window.location.search}`); return; }
        if (result.status !== 200) { setStatus("등록된 외부 서비스 정보를 확인하지 못했습니다."); return; }
        const value = result.data as unknown as Options;
        if (requestedScopes().some(scope => !value.client.scopes.includes(scope))) {
          setStatus("외부 서비스에 등록되지 않은 접근 범위가 요청됐습니다."); return;
        }
        setOptions(value); setStatus(value.organizations.length ? "" : "연결할 수 있는 승인 AI가 없습니다. AP 작업 공간에서 사업 정보와 AI를 승인해 주세요.");
      }).catch(() => setStatus("AP 서버에 연결할 수 없습니다."));
  }, []);
  const selected = options?.organizations.find(item => item.id === organizationId);
  function choose(id: string) { setOrganizationId(id); setDeployments([]); }
  function toggle(id: string) { setDeployments(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!options || !selected) return;
    setBusy(true); setStatus("선택한 AP 자원을 기록하고 있습니다.");
    try {
      const saved = await request("/integrations/v1/authorization/selections", "POST", {
        clientId: options.client.id, organizationId: selected.id, agentId: selected.agentId,
        deploymentIds: deployments, scopes: requestedScopes(),
      });
      if (isDeletionScheduledError(saved.status, saved.data)) { setStatus(DELETION_SCHEDULED_OWNER_MESSAGE); return; }
      if (saved.status !== 201) { setStatus(`자원 선택을 저장하지 못했습니다 (${saved.status}). 다시 확인해 주세요.`); return; }
      follow(await request("/api/auth/oauth2/continue", "POST", { postLogin: true, oauth_query: oauthQuery() }));
    } catch (error) { setStatus(error instanceof Error ? error.message : "동의 화면으로 이동하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <Shell title="공유할 조직·AI 선택" status={status}>{options && <>
    <p><strong>{options.client.name}</strong>에서 AP 자원 접근을 요청했습니다. 선택한 조직과 배포만 이 서비스에 보입니다.</p>
    <form className="ap-connect-form form-fields" onSubmit={event => void submit(event)}>
      <label>AP 조직과 승인 AI<select required value={organizationId} onChange={event => choose(event.target.value)}>
        <option value="">조직 선택</option>{options.organizations.map(item => <option key={item.id} value={item.id}>{item.name} · {item.agentName} (승인 {item.agentRevision})</option>)}
      </select></label>
      {selected && <fieldset><legend>접근을 허용할 상담 배포</legend><p>배포를 선택하지 않으면 외부 서비스가 기존 AP 대화를 읽을 수 없습니다.</p>
        {selected.deployments.length ? selected.deployments.map(item => <label className="ap-connect-check" key={item.id}>
          <input type="checkbox" checked={deployments.includes(item.id)} onChange={() => toggle(item.id)} />
          <span>{item.kind === "link" ? "상담 링크"
            : item.kind === "placement_embed" ? "매체 승인 카드" : "외부 위젯"} · {item.publicId}{item.origin ? ` · ${item.origin}` : ""}</span>
        </label>) : <p>활성 배포가 없습니다.</p>}</fieldset>}
      <section aria-label="요청 접근 범위"><h2>요청 접근 범위</h2><ul>{requestedScopes().map(scope => <li key={scope}>{scopeLabel(scope)}</li>)}</ul></section>
      <button type="submit" disabled={busy || !selected}>선택하고 동의 내용 확인</button>
    </form></>}</Shell>;
}

export function ConnectConsent() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("연결 동의 내용을 확인하고 있습니다.");
  useEffect(() => {
    const clientId = new URLSearchParams(window.location.search).get("client_id");
    if (!clientId) { setStatus("유효하지 않은 연결 요청입니다."); return; }
    void request(`/integrations/v1/authorization/current?clientId=${encodeURIComponent(clientId)}`)
      .then(result => {
        if (result.status === 401) { window.location.assign(`/connect/sign-in${window.location.search}`); return; }
        if (result.status !== 200) { setStatus("현재 조직·AI 선택이 만료됐습니다. 연결 요청을 다시 시작해 주세요."); return; }
        const value = result.data as unknown as Selection;
        const scopes = requestedScopes();
        if (scopes.length !== value.scopes.length || scopes.some(scope => !value.scopes.includes(scope))) {
          setStatus("선택한 접근 범위와 외부 서비스 요청이 다릅니다. 연결 요청을 다시 시작해 주세요."); return;
        }
        setSelection(value); setStatus("");
      }).catch(() => setStatus("AP 서버에 연결할 수 없습니다."));
  }, []);
  async function decide(accept: boolean) {
    setBusy(true); setStatus(accept ? "연결을 승인하고 있습니다." : "연결을 거부하고 있습니다.");
    try { follow(await request("/api/auth/oauth2/consent", "POST", { accept, oauth_query: oauthQuery() })); }
    catch (error) { setStatus(error instanceof Error ? error.message : "동의 결과를 전달하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <Shell title="외부 서비스 접근 동의" status={status}>{selection && <div className="ap-connect-form">
    <p><strong>{selection.clientName}</strong>에 다음 AP 자원 접근을 허용하시겠습니까?</p>
    {selection.scopes.includes("ap.sources.refresh") && <p>정보 갱신 범위는 이 연결의 Field 승인 정보를 AP 검토 대기로 가져올 수 있습니다. AP 사업자 승인 없이 고객 AI나 지식을 공개하지 않습니다.</p>}
    {selection.scopes.includes("ap.connections.create") && <p>외부 사이트 설치 연결 (추가): 선택한 AP 조직·AI를 외부 조직과 연결합니다. 상대 서비스 로그인·결제·예약 권한은 포함하지 않습니다.</p>}
    {selection.scopes.includes("ap.deployments.manage") && <p>상담 설치 관리 (추가): 이 외부 서비스가 만든 동일 주소의 설치만 준비·소유 확인·활성화·중지할 수 있습니다. 새 설치의 대화 접근은 별도로 선택해 승인해야 합니다.</p>}
    <dl><dt>조직</dt><dd>{selection.organizationName}</dd><dt>승인 AI</dt><dd>{selection.agentName}</dd>
      <dt>상담 배포</dt><dd>{selection.deploymentIds.length}개</dd><dt>접근 범위</dt><dd>{selection.scopes.map(scopeLabel).join(", ")}</dd></dl>
    <p>동의 후에도 연결 권한을 철회할 수 있습니다. AP 원본과 고객 접근은 AP에 남습니다.</p>
    <div className="ap-connect-actions"><button type="button" disabled={busy} onClick={() => void decide(true)}>접근 허용</button>
      <button type="button" disabled={busy} onClick={() => void decide(false)}>거부</button></div>
  </div>}</Shell>;
}
