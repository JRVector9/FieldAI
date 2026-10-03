"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Brand } from "@fieldai/ui";
import { emailDeliveryNotice, emailDeliveryStateFrom, resetPasswordProblem, tokenFromSearch, twoFactorEndpoint,
  verificationNoticeCopy, verifyEmailResult, type EmailDeliveryState } from "./auth-flow";

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method, credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) as unknown };
}

export async function loadEmailDeliveryState(): Promise<EmailDeliveryState> {
  try { const result = await request("/v1/auth/email-delivery"); return emailDeliveryStateFrom(result.status, result.data); }
  catch { return "unknown"; }
}

// 일회용 토큰이 주소창·Referer·기록에 남지 않도록 읽은 즉시 주소에서 지운다.
function useOneTimeToken(path: string) {
  const captured = useRef<string | null | undefined>(undefined);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // 개발 모드에서 effect가 두 번 실행돼도 처음 읽은 토큰을 유지한다.
    if (captured.current === undefined) {
      captured.current = tokenFromSearch(window.location.search);
      window.history.replaceState(null, "", path);
    }
    setToken(captured.current);
  }, [path]);
  return token;
}

function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="agent-auth-shell"><header className="agent-home-header"><div className="agent-home-wrap agent-home-nav"><a href="/"><Brand product="Agent Platform" /></a><nav aria-label="서비스 탐색"><a href="/">서비스 소개</a><a href="/workspace?mode=login">로그인</a></nav></div></header>
    <main className="agent-auth-layout"><section className="agent-auth-story"><p className="agent-home-kicker">YOUR BUSINESS AGENT</p><h1>AP 계정을<br />안전하게 관리하세요.</h1><p>AP 계정은 Field 계정과 별도로 운영됩니다.</p></section>
      <section className="agent-auth-form"><h2>{title}</h2><p>{description}</p>{children}</section></main></div>;
}

// 가입·로그인 화면에서 쓰는 확인 메일 안내와 다시 보내기
export function VerificationEmailNotice({ email, context = "sign_up" }: { email: string; context?: "sign_up" | "sign_in" }) {
  const [state, setState] = useState<EmailDeliveryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void loadEmailDeliveryState().then(setState); }, []);
  async function resend() {
    setBusy(true); setMessage("");
    try {
      const result = await request("/api/auth/send-verification-email", "POST", { email });
      const current = await loadEmailDeliveryState();
      setState(current);
      setMessage(result.status === 200 ? emailDeliveryNotice(current, "verify_email") : `확인 메일 요청을 처리하지 못했습니다 (${result.status}).`);
    } catch { setMessage("확인 메일 요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }
  const copy = verificationNoticeCopy(state, context);
  return <section className="special-panel" aria-live="polite"><h2>{copy.title}</h2>
    <p>{copy.body}</p>
    <p>{email} 주소를 확인한 뒤 로그인할 수 있습니다.</p>
    <button type="button" disabled={busy || state === null || state === "blocked_integration"} onClick={() => void resend()}>확인 메일 다시 보내기 (추가)</button>
    {state === "blocked_integration" && <p>메일 발송 환경이 연결된 뒤 다시 보낼 수 있습니다.</p>}
    {message && <p role="status">{message}</p>}</section>;
}

// 로그인 뒤 better-auth 2단계 인증(twoFactorRedirect) 확인 화면
export function TwoFactorChallenge({ onVerified, onCancel }: { onVerified: () => void | Promise<void>; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = twoFactorEndpoint(code);
    if (!target) { setMessage("인증 앱의 6자리 코드 또는 백업 코드를 입력해 주세요."); return; }
    setBusy(true); setMessage("");
    try {
      const result = await request(target.path, "POST", target.body);
      if (result.status === 200) { setCode(""); await onVerified(); return; }
      setMessage(result.status === 401 ? "인증 코드가 맞지 않거나 확인 시간이 지났습니다. 다시 로그인하거나 새 코드를 입력해 주세요."
        : result.status === 429 || result.status === 400 ? "시도 횟수를 초과했습니다. 잠시 뒤 다시 로그인해 주세요." : "인증하지 못했습니다. 잠시 뒤 다시 로그인해 주세요.");
    } catch { setMessage("인증 요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }
  return <section className="special-panel"><h2>2단계 인증 (추가)</h2><p>인증 앱에 표시된 6자리 코드를 입력해 주세요. 휴대전화를 쓸 수 없으면 백업 코드를 입력할 수 있습니다.</p>
    <form className="form-fields" onSubmit={event => void submit(event)}><label>인증 코드<input autoFocus required inputMode="text" autoComplete="one-time-code" maxLength={40} value={code} onChange={event => setCode(event.target.value)} /></label>
      <button type="submit" disabled={busy}>인증하고 계속하기</button></form>
    {message && <p role="status" className="state-message">{message}</p>}
    <button type="button" className="agent-auth-switch" disabled={busy} onClick={onCancel}>처음부터 다시 로그인 →</button></section>;
}

export function VerifyEmailScreen() {
  const token = useOneTimeToken("/verify-email");
  const [result, setResult] = useState<"checking" | "verified" | "expired" | "invalid" | "failed">("checking");
  useEffect(() => {
    if (token === undefined) return;
    if (token === null) { setResult("invalid"); return; }
    void request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(response => setResult(verifyEmailResult(response.status, response.data)))
      .catch(() => setResult("failed"));
  }, [token]);
  const text = {
    checking: "이메일 주소를 확인하고 있습니다.",
    // 확인 뒤 자동 로그인하지 않는다(autoSignInAfterVerification=false). 로그인 화면으로 안내한다.
    verified: "이메일이 확인됐습니다. 로그인해 주세요.",
    expired: "확인 링크가 만료되었습니다. 로그인 화면에서 확인 메일을 다시 보내 주세요.",
    invalid: "확인 링크가 올바르지 않거나 이미 사용되었습니다. 로그인 화면에서 확인 메일을 다시 보내 주세요.",
    failed: "인증 서버에 연결하지 못했습니다. 잠시 뒤 메일의 링크를 다시 열어 주세요.",
  }[result];
  return <AuthShell title="이메일 주소 확인 (추가)" description="AP 가입을 마무리합니다.">
    <p role="status" className={result === "verified" || result === "checking" ? undefined : "state-message"}>{text}</p>
    {result !== "checking" && <a href="/workspace?mode=login">로그인 화면으로 이동 →</a>}
  </AuthShell>;
}

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<EmailDeliveryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void loadEmailDeliveryState().then(setState); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await request("/api/auth/request-password-reset", "POST", { email });
      setMessage(result.status === 200 ? emailDeliveryNotice(state ?? "unknown", "reset_password") : `재설정 요청을 처리하지 못했습니다 (${result.status}).`);
    } catch { setMessage("재설정 요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }
  return <AuthShell title="비밀번호 찾기 (추가)" description="가입한 이메일로 비밀번호 재설정 링크를 보냅니다.">
    {state === "blocked_integration" && <p className="state-message" role="status">{emailDeliveryNotice(state, "reset_password")}</p>}
    <form className="form-fields" onSubmit={event => void submit(event)}><label>이메일<input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
      <button type="submit" disabled={busy || state === null || state === "blocked_integration"}>재설정 링크 받기</button></form>
    {message && <p role="status" className="state-message">{message}</p>}
    <a className="agent-auth-switch" href="/workspace?mode=login">로그인으로 돌아가기 →</a>
  </AuthShell>;
}

export function ResetPasswordScreen() {
  const token = useOneTimeToken("/reset-password");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = resetPasswordProblem(password, confirmation);
    if (problem || !token) { setMessage(problem ?? "재설정 링크가 올바르지 않습니다."); return; }
    setBusy(true); setMessage("");
    try {
      const result = await request("/api/auth/reset-password", "POST", { newPassword: password, token });
      if (result.status === 200) { setDone(true); setPassword(""); setConfirmation(""); return; }
      setMessage(result.status === 400 ? "재설정 링크가 만료되었거나 이미 사용되었습니다. 비밀번호 찾기를 다시 진행해 주세요." : `비밀번호를 바꾸지 못했습니다 (${result.status}).`);
    } catch { setMessage("재설정 요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }
  return <AuthShell title="새 비밀번호 설정 (추가)" description="새 비밀번호를 저장하면 기존 로그인 세션은 모두 종료됩니다.">
    {token === null && <p className="state-message" role="status">재설정 링크가 올바르지 않습니다. <a href="/forgot-password">비밀번호 찾기</a>를 다시 진행해 주세요.</p>}
    {done ? <><p role="status">비밀번호를 바꿨습니다. 새 비밀번호로 로그인해 주세요.</p><a href="/workspace?mode=login">로그인 화면으로 이동 →</a></>
      : token && <form className="form-fields" onSubmit={event => void submit(event)}>
        <label>새 비밀번호<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label>새 비밀번호 확인<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        <button type="submit" disabled={busy}>비밀번호 저장</button></form>}
    {message && <p role="status" className="state-message">{message}</p>}
  </AuthShell>;
}
