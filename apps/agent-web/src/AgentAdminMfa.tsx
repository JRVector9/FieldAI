"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { adminMfaState, totpSecretFromUri } from "./auth-flow";

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method, credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) as unknown };
}

type Enrollment = { totpURI: string; secret: string; backupCodes: string[]; qr: string | null };

// 관리자 2단계 인증(TOTP) 등록·상태 화면. 비mock 관리자 API는 이 인증으로 시작한 세션만 허용한다.
export function AgentAdminMfa() {
  const [state, setState] = useState<"loading" | "failed" | ReturnType<typeof adminMfaState>>("loading");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // 등록 정보가 나타나면 코드 입력란으로, 오류 문구가 나타나면 그 문구로 포커스를 옮긴다
  const codeRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (enrollment) codeRef.current?.focus(); }, [enrollment]);
  useEffect(() => { if (message) messageRef.current?.focus(); }, [message]);

  const load = useCallback(async () => {
    try {
      const result = await request("/api/auth/get-session");
      setState(result.status === 200 ? adminMfaState(result.data) : result.status === 401 ? "signed_out" : "failed");
    } catch { setState("failed"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function enable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await request("/api/auth/two-factor/enable", "POST", { password });
      const value = result.data as { totpURI?: unknown; backupCodes?: unknown };
      const secret = typeof value.totpURI === "string" ? totpSecretFromUri(value.totpURI) : null;
      if (result.status !== 200 || !secret || !Array.isArray(value.backupCodes)) {
        setMessage(result.status === 400 ? "비밀번호가 맞지 않거나 이미 2단계 인증을 사용 중입니다." : result.status === 401 ? "로그인이 만료됐습니다. 관리자 계정으로 다시 로그인해 주세요." : "2단계 인증을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
        return;
      }
      setPassword("");
      let qr: string | null = null;
      try { qr = await (await import("qrcode")).default.toDataURL(value.totpURI as string, { width: 240, margin: 2, errorCorrectionLevel: "M" }); }
      catch { qr = null; }
      setEnrollment({ totpURI: value.totpURI as string, secret, backupCodes: value.backupCodes.map(String), qr });
    } catch { setMessage("요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await request("/api/auth/two-factor/verify-totp", "POST", { code: code.trim() });
      if (result.status !== 200) { setMessage(result.status === 401 ? "인증 코드가 맞지 않습니다. 인증 앱의 현재 코드를 입력해 주세요." : result.status === 429 ? "시도 횟수를 초과했습니다. 잠시 뒤 다시 시도해 주세요." : "인증하지 못했습니다. 잠시 뒤 다시 시도해 주세요."); return; }
      setCode(""); setEnrollment(null); await load();
    } catch { setMessage("요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true); setMessage("");
    try {
      const result = await request("/api/auth/sign-out", "POST", {});
      if (result.status !== 200) { setMessage("로그아웃하지 못했습니다. 잠시 뒤 다시 시도해 주세요."); return; }
      window.location.replace("/admin");
    } catch { setMessage("로그아웃 요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }

  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Agent Platform" /></a>
    <nav aria-label="제품 이동"><a href="/admin">AP 운영실</a></nav></header>
    <main className="feature-section"><div className="feature-heading"><p className="eyebrow">Agent Platform · 제품 관리자</p>
      <h1>관리자 2단계 인증 설정 (추가)</h1><p>운영 환경의 AP 관리자 화면은 인증 앱(TOTP)으로 2단계 인증을 마친 로그인 세션에서만 열립니다.</p></div>
      {state === "loading" && <p role="status">계정과 2단계 인증 상태를 확인하고 있습니다.</p>}
      {state === "failed" && <section className="special-panel"><h2>상태를 확인하지 못했습니다</h2><p>인증 서버에 연결한 뒤 다시 시도해 주세요.</p><button type="button" onClick={() => void load()}>다시 확인</button></section>}
      {state === "signed_out" && <section className="special-panel"><h2>로그인 필요</h2><p>AP 관리자 계정으로 먼저 로그인해 주세요.</p><a href="/admin">AP 관리자 로그인 →</a></section>}
      {state === "verified" && <section className="special-panel"><h2>2단계 인증 사용 중</h2><p>현재 로그인 세션은 2단계 인증을 마쳤습니다.</p><a href="/admin">AP 운영실로 이동 →</a></section>}
      {state === "session_not_verified" && <section className="special-panel"><h2>2단계 인증 필요</h2><p>2단계 인증은 켜져 있지만 현재 세션은 인증 전에 시작되었습니다. 로그아웃한 뒤 다시 로그인해 인증 코드를 입력해 주세요.</p>
        <button type="button" disabled={busy} onClick={() => void signOut()}>로그아웃 후 다시 로그인</button></section>}
      {state === "not_enrolled" && !enrollment && <section className="special-panel"><h2>2단계 인증 시작</h2><p>현재 비밀번호를 확인한 뒤 인증 앱 등록 정보를 한 번만 보여 드립니다.</p>
        <form className="form-fields" onSubmit={event => void enable(event)}><label>현재 비밀번호<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button type="submit" disabled={busy}>등록 정보 만들기</button></form></section>}
      {state === "not_enrolled" && enrollment && <section className="special-panel"><h2>인증 앱 등록</h2>
        <p>인증 앱으로 QR 코드를 스캔하거나 아래 설정 키를 직접 입력해 주세요. 이 화면을 벗어나면 다시 볼 수 없습니다.</p>
        {enrollment.qr ? <img src={enrollment.qr} width={240} height={240} alt="2단계 인증 앱 등록 QR 코드" /> : <p role="status">QR 이미지를 만들지 못했습니다. 설정 키를 직접 입력해 주세요.</p>}
        <p>설정 키 <code>{enrollment.secret}</code></p>
        <h3>백업 코드</h3><p>휴대전화를 잃어버렸을 때 한 번씩 쓸 수 있습니다. 안전한 곳에 보관해 주세요.</p>
        <ul>{enrollment.backupCodes.map(item => <li key={item}><code>{item}</code></li>)}</ul>
        <form className="form-fields" onSubmit={event => void verify(event)}><label>인증 앱의 6자리 코드<input ref={codeRef} required inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value)} /></label>
          <button type="submit" disabled={busy}>코드 확인하고 사용 시작</button></form></section>}
      {message && <p ref={messageRef} tabIndex={-1} role="status" className="state-message">{message}</p>}
    </main></div>;
}
