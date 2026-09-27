import "@fieldai/ui/styles.css";
import "@fieldai/ui/preview.css";
import "@fieldai/ui/states.css";
import "../site.css";
import "../site-editor.css";
import "../field-moderation.css";
import "../field-support.css";
import "../field-retention.css";
export const metadata = { manifest: "/field-notifications.webmanifest",
  appleWebApp: { capable: true, title: "Field", statusBarStyle: "default" }, title: "Field — 내 사이트와 업무 공간", description: "직접 만드는 사이트와 문의·예약 운영 서비스" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
