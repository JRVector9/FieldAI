import type { NextConfig } from "next";
if (process.env.APP_PROFILE === "live") throw new Error("Agent web design preview cannot run with APP_PROFILE=live");
const apiBase = process.env.AP_API_BASE_URL ?? "http://127.0.0.1:4311";
const config: NextConfig = {
  transpilePackages: ["@fieldai/ui"],
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
