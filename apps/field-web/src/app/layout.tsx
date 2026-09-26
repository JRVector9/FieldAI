import "@fieldai/ui/styles.css";
import "@fieldai/ui/preview.css";
import "@fieldai/ui/states.css";
import "../site.css";
export const metadata = { title: "Field — 내 사이트와 업무 공간", description: "직접 만드는 사이트와 문의·예약 운영 서비스" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
