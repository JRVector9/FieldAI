"use client";

import { useEffect, useRef, useState } from "react";

// Field 카카오 로그인 버튼. 서버가 알려준 공급사 상태로만 활성화하고, 미연결이면 기존 비활성 안내를 유지한다.
export type KakaoProviderState = "loading" | "configured" | "blocked_integration" | "mock_forbidden" | "unknown";
const KAKAO_AUTHORIZE_ORIGIN = "https://kauth.kakao.com";

export function kakaoProviderStateFrom(status: number, data: unknown): KakaoProviderState {
  const state = (data as { kakao?: unknown } | null)?.kakao;
  return status === 200 && (state === "configured" || state === "blocked_integration" || state === "mock_forbidden") ? state : "unknown";
}

export function kakaoUnavailableReason(state: KakaoProviderState) {
  if (state === "configured") return null;
  if (state === "mock_forbidden") return "로컬(mock) 환경에서는 카카오 인증을 사용하지 않습니다. 이메일로 시작해 주세요.";
  if (state === "unknown") return "카카오 인증 상태를 확인하지 못했습니다. 이메일로 시작하거나 잠시 뒤 다시 시도해 주세요.";
  return "카카오 인증은 외부 연동 후 사용할 수 있습니다.";
}

// better-auth 콜백 오류 코드(error 쿼리)를 사용자 문구로 바꾼다.
export function kakaoErrorMessage(code: string | null) {
  if (code === "account_not_linked") return "이미 이메일로 가입된 계정입니다. 이메일로 로그인해 주세요.";
  if (code === "email_not_found") return "카카오 계정의 이메일 제공에 동의해야 시작할 수 있습니다.";
  if (code === "kakao_email_unverified") return "카카오 계정 이메일이 인증되지 않았습니다. 카카오에서 이메일을 인증한 뒤 다시 시도해 주세요.";
  if (code === "access_denied") return "카카오 로그인이 취소되었습니다.";
  return "카카오 로그인에 실패했습니다. 잠시 뒤 다시 시도해 주세요.";
}

// 카카오에서 돌아온 주소를 해석한다. 오류·2단계 인증 대기 표시는 한 번만 읽고 그 표시만 주소에서 지운다.
export function kakaoReturnFromSearch(search: string): { kind: "error"; message: string } | { kind: "two_factor" } | null {
  const params = new URLSearchParams(search);
  if (params.get("auth_error") === "kakao") return { kind: "error", message: kakaoErrorMessage(params.get("error")) };
  if (params.get("two_factor") === "kakao") return { kind: "two_factor" };
  return null;
}

// 카카오 복귀 표시(auth_error·error·error_description·two_factor)만 지우고 나머지 쿼리(특히 서명된 연결 요청 쿼리)는 남긴다.
const KAKAO_RETURN_PARAMS = ["auth_error", "error", "error_description", "two_factor"];
export function searchWithoutKakaoReturn(search: string) {
  const params = new URLSearchParams(search);
  for (const key of KAKAO_RETURN_PARAMS) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

// 카카오 로그인 뒤 돌아올 주소. callbackPath가 없으면 기존처럼 작업 공간으로, 있으면 그 화면의 현재 쿼리를 그대로 붙여 돌아온다.
export function kakaoCallbackUrls(callbackPath: string | undefined, search: string) {
  if (!callbackPath) return { callbackURL: "/workspace", errorCallbackURL: "/workspace?auth_error=kakao" };
  const rest = searchWithoutKakaoReturn(search);
  const callbackURL = `${callbackPath}${rest}`;
  return { callbackURL, errorCallbackURL: `${callbackURL}${rest ? "&" : "?"}auth_error=kakao` };
}

// 카카오 인가 주소로만 이동한다(서버 응답이 다른 곳을 가리키면 따르지 않음).
export function kakaoAuthorizeUrl(data: unknown) {
  const url = (data as { url?: unknown } | null)?.url;
  if (typeof url !== "string") return null;
  try { return new URL(url).origin === KAKAO_AUTHORIZE_ORIGIN ? url : null; } catch { return null; }
}

// label: 연결 화면처럼 기존 계정 로그인만 안내할 곳에서 버튼 문구를 바꾼다(기본은 시작하기).
export function FieldKakaoSignIn({ onTwoFactor, callbackPath, label = "카카오로 시작하기" }: { onTwoFactor: () => void; callbackPath?: string; label?: string }) {
  const [state, setState] = useState<KakaoProviderState>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const handled = useRef(false);
  useEffect(() => {
    if (!handled.current) {
      handled.current = true;
      const returned = kakaoReturnFromSearch(window.location.search);
      if (returned) {
        window.history.replaceState(null, "", `${window.location.pathname}${searchWithoutKakaoReturn(window.location.search)}`);
        if (returned.kind === "error") setMessage(returned.message);
        else onTwoFactor();
      }
    }
    let active = true;
    fetch("/v1/auth/providers", { credentials: "same-origin" })
      .then(async response => kakaoProviderStateFrom(response.status, await response.json().catch(() => null)))
      .catch(() => "unknown" as const)
      .then(next => { if (active) setState(next); });
    return () => { active = false; };
    // 돌아온 주소는 첫 표시 때 한 번만 처리한다(onTwoFactor는 상위의 고정 setter를 호출한다).
  }, []);

  async function start() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "kakao", ...kakaoCallbackUrls(callbackPath, window.location.search) }),
      });
      const target = response.status === 200 ? kakaoAuthorizeUrl(await response.json().catch(() => null)) : null;
      if (target) { window.location.assign(target); return; }
      setMessage(kakaoErrorMessage(null));
    } catch { setMessage("카카오 로그인 요청이 전달되지 않았습니다."); }
    setBusy(false);
  }

  const reason = kakaoUnavailableReason(state);
  return <>
    <button className="field-auth-kakao" type="button" disabled={state !== "configured" || busy} onClick={() => void start()}>{label}</button>
    {reason && state !== "loading" && <p className="field-auth-unavailable">{reason}</p>}
    {message && <p role="status" className="state-message">{message}</p>}
  </>;
}
