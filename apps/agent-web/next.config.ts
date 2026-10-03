import type { NextConfig } from "next";
const apiBase = process.env.AP_API_BASE_URL ?? "http://127.0.0.1:4311";
const config: NextConfig = {
  transpilePackages: ["@fieldai/ui"],
  env: { NEXT_PUBLIC_APP_PROFILE: process.env.APP_PROFILE ?? '' },
  async headers() {
    return [{source:"/billing/return",headers:[{key:"Referrer-Policy",value:"no-referrer"},
      {key:"Cache-Control",value:"private, no-store"},{key:"X-Robots-Tag",value:"noindex, nofollow"}]}];
  },
  async rewrites() {
    return [
      { source: "/api/auth/:path*", destination: `${apiBase}/api/auth/:path*` },
      { source: "/integrations/v1/:path*", destination: `${apiBase}/integrations/v1/:path*` },
      { source: "/v1/:path*", destination: `${apiBase}/v1/:path*` },
      { source: "/sdk/:path*", destination: `${apiBase}/sdk/:path*` },
      { source: "/embed/:path*", destination: `${apiBase}/embed/:path*` },
    ];
  },
};
export default config;
