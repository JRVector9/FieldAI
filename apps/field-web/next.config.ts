import type { NextConfig } from "next";
if (process.env.APP_PROFILE === "live") throw new Error("Field web design preview cannot run with APP_PROFILE=live");
const apiBase = process.env.FIELD_API_BASE_URL ?? "http://127.0.0.1:4321";
const config: NextConfig = {
  transpilePackages: ["@fieldai/ui"],
  async rewrites() {
    return [
      { source: "/api/auth/:path*", destination: `${apiBase}/api/auth/:path*` },
      { source: "/v1/:path*", destination: `${apiBase}/v1/:path*` },
      { source: "/integrations/:path*", destination: `${apiBase}/integrations/:path*` },
    ];
  },
};
export default config;
