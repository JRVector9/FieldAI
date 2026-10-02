import type { NextConfig } from "next";
// live에서는 /preview 시안만 proxy가 404로 막는다. 테넌트 서브도메인 라우팅과 플랫폼 Host·법적 고지 링크에 필요한 값이 없으면 빌드·기동을 거부한다.
if (process.env.APP_PROFILE === "live") {
  const missing = ["FIELD_SITE_BASE_DOMAIN", "NEXT_PUBLIC_FIELD_WEB_ORIGIN"].filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Field web APP_PROFILE=live requires ${missing.join(", ")}`);
}
const apiBase = process.env.FIELD_API_BASE_URL ?? "http://127.0.0.1:4321";
const config: NextConfig = {
  transpilePackages: ["@fieldai/ui"],
  async headers() {
    return [{source:"/billing/return",headers:[{key:"Referrer-Policy",value:"no-referrer"},
      {key:"Cache-Control",value:"private, no-store"},{key:"X-Robots-Tag",value:"noindex, nofollow"}]}];
  },
  async rewrites() {
    return [
      { source: "/api/auth/:path*", destination: `${apiBase}/api/auth/:path*` },
      { source: "/v1/:path*", destination: `${apiBase}/v1/:path*` },
      { source: "/integrations/:path*", destination: `${apiBase}/integrations/:path*` },
    ];
  },
};
export default config;
