import { ResetPasswordScreen } from "../../agent-auth-pages";

// 일회용 재설정 토큰이 외부로 새지 않도록 Referer를 보내지 않고 검색 노출을 막는다.
export const metadata = { title: "새 비밀번호 설정 — Agent Platform", referrer: "no-referrer", robots: { index: false, follow: false } };
export default function ResetPasswordPage() { return <ResetPasswordScreen />; }
