import "@fieldai/ui/styles.css";
import "@fieldai/ui/preview.css";
import "@fieldai/ui/states.css";
import "../consult.css";
import "../agent-home.css";
import "../agent-public.css";
import "../agent-moderation.css";
export const metadata = { title: "Agent Platform — 독립 AI 상담", description: "외부 사이트에 설치하는 사업 AI 상담 서비스" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
