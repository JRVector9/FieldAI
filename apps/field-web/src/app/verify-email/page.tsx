import { VerifyEmailScreen } from "../../field-auth-pages";

// 일회용 확인 토큰이 외부로 새지 않도록 Referer를 보내지 않고 검색 노출을 막는다.
export const metadata = { title: "이메일 주소 확인 — Field", referrer: "no-referrer", robots: { index: false, follow: false } };
export default function VerifyEmailPage() { return <VerifyEmailScreen />; }
