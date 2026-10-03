// Field 인증 화면(가입 확인·비밀번호 재설정·관리자 2단계 인증) 공용 순수 함수. DOM·네트워크에 의존하지 않는다.
export type EmailDeliveryState = "mock" | "configured" | "blocked_integration" | "unknown";
export type SignInOutcome = "signed_in" | "two_factor" | "email_not_verified" | "invalid_credentials" | "failed";

export function emailDeliveryStateFrom(status: number, data: unknown): EmailDeliveryState {
  const state = (data as { state?: unknown } | null)?.state;
  return status === 200 && (state === "mock" || state === "configured" || state === "blocked_integration") ? state : "unknown";
}

// 메일 공급사 상태를 숨기지 않는다. 미연결이면 "보냈다"고 표시하지 않는다.
export function emailDeliveryNotice(state: EmailDeliveryState, purpose: "verify_email" | "reset_password") {
  if (state === "blocked_integration") return purpose === "verify_email"
    ? "메일 발송 환경이 연결되지 않았습니다. 확인 메일을 보내지 못했으며, 연결 후 다시 보내기를 눌러 주세요."
    : "메일 발송 환경이 연결되지 않았습니다. 지금은 재설정 메일을 보낼 수 없습니다.";
  if (state === "mock") return "로컬(mock) 환경입니다. 메일은 실제로 발송되지 않고 Field 서버 로그와 발송 기록에만 남습니다.";
  if (state === "unknown") return "메일 발송 상태를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  // 공급사 발송 결과는 화면에서 확인할 수 없으므로 "보냈다"가 아니라 "요청했다"로 안내한다
  return purpose === "verify_email"
    ? "확인 메일 발송을 요청했습니다. 메일이 오지 않으면 다시 보내기를 눌러 주세요."
    : "가입된 이메일이면 비밀번호 재설정 링크 발송을 요청했습니다. 링크는 1시간 동안 사용할 수 있으며, 메일이 오지 않으면 다시 요청해 주세요.";
}

// 확인 메일 안내 영역의 제목·본문. 로그인 경로(sign_in)에서는 그 순간 메일을 보내지 않으므로 발송을 단정하지 않는다.
export function verificationNoticeCopy(state: EmailDeliveryState | null, context: "sign_up" | "sign_in") {
  if (state === null) return { title: "이메일 주소 확인이 필요합니다", body: "메일 발송 상태를 확인하고 있습니다." };
  if (state === "blocked_integration") return { title: "메일 발송 환경이 연결되지 않았습니다", body: emailDeliveryNotice(state, "verify_email") };
  if (context === "sign_in") return { title: "이메일 주소 확인이 필요합니다", body: state === "configured"
    ? "가입 확인 메일의 링크를 먼저 열어 주세요. 메일이 없으면 다시 보내기를 눌러 주세요." : emailDeliveryNotice(state, "verify_email") };
  return { title: state === "configured" ? "확인 메일 발송을 요청했습니다" : "이메일 주소 확인이 필요합니다", body: emailDeliveryNotice(state, "verify_email") };
}

export function signInOutcome(status: number, data: unknown): SignInOutcome {
  const value = data as { twoFactorRedirect?: unknown; code?: unknown } | null;
  if (status === 200) return value?.twoFactorRedirect === true ? "two_factor" : "signed_in";
  if (status === 403 && value?.code === "EMAIL_NOT_VERIFIED") return "email_not_verified";
  if (status === 401) return "invalid_credentials";
  return "failed";
}

export function tokenFromSearch(search: string) {
  const token = new URLSearchParams(search).get("token");
  return token && /^[A-Za-z0-9._~-]{8,2048}$/.test(token) ? token : null;
}

// 6자리 숫자는 인증 앱 코드, 그 외 형식은 백업 코드로 보낸다.
export function twoFactorEndpoint(code: string) {
  const value = code.trim();
  if (/^\d{6}$/.test(value)) return { path: "/api/auth/two-factor/verify-totp", body: { code: value } };
  if (/^[A-Za-z0-9-]{6,40}$/.test(value)) return { path: "/api/auth/two-factor/verify-backup-code", body: { code: value } };
  return null;
}

export function totpSecretFromUri(uri: string) {
  try {
    const url = new URL(uri);
    const secret = url.searchParams.get("secret");
    return url.protocol === "otpauth:" && url.hostname === "totp" && secret && /^[A-Z2-7]+=*$/i.test(secret) ? secret : null;
  } catch { return null; }
}

export function verifyEmailResult(status: number, data: unknown): "verified" | "expired" | "invalid" | "failed" {
  if (status === 200 && (data as { status?: unknown } | null)?.status === true) return "verified";
  const code = (data as { code?: unknown } | null)?.code;
  if (code === "TOKEN_EXPIRED") return "expired";
  if (status === 401 || code === "INVALID_TOKEN" || code === "USER_NOT_FOUND") return "invalid";
  return "failed";
}

export function resetPasswordProblem(password: string, confirmation: string) {
  if (password.length < 8) return "새 비밀번호는 8자 이상이어야 합니다.";
  if (password.length > 128) return "새 비밀번호는 128자 이하여야 합니다.";
  if (password !== confirmation) return "새 비밀번호 확인이 일치하지 않습니다.";
  return null;
}

export function adminMfaState(session: unknown): "signed_out" | "not_enrolled" | "session_not_verified" | "verified" {
  const value = session as { user?: { twoFactorEnabled?: unknown }; session?: { twoFactorVerified?: unknown } } | null;
  if (!value?.user) return "signed_out";
  if (value.user.twoFactorEnabled !== true) return "not_enrolled";
  return value.session?.twoFactorVerified === true ? "verified" : "session_not_verified";
}
