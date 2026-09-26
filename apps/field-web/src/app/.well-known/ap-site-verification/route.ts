import { NextRequest, NextResponse } from "next/server";
import { customHostMapping } from "../../../custom-domain-host";

async function siteAddress(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const mock = process.env.APP_PROFILE !== "live";
  const domain = mock ? "localhost:3002" : process.env.FIELD_SITE_BASE_DOMAIN;
  const expectedProtocol = mock ? "http:" : "https:";
  const match = domain && new RegExp(`^(field-[0-9a-f]{12})\\.${domain.replaceAll(".", "\\.")}$`).exec(host);
  if (match && request.nextUrl.protocol === expectedProtocol) return { slug: match[1]!, origin: `${expectedProtocol}//${host}`, customHost: "" };
  if (request.nextUrl.protocol !== "https:") return null;
  const custom = await customHostMapping(host);
  return custom ? { slug: custom.slug, origin: custom.origin, customHost: host } : null;
}

export async function GET(request: NextRequest) {
  try {
    const site = await siteAddress(request);
    if (!site) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const api = process.env.FIELD_API_BASE_URL ?? "http://127.0.0.1:4321";
    const address = new URL(`/v1/public/site-verification/${site.slug}`, api);
    if (site.customHost) address.searchParams.set("host", site.customHost);
    const result = await fetch(address, {
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!result.ok) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const proof = await result.json() as { origin?: unknown; proof?: unknown };
    if (proof.origin !== site.origin || typeof proof.proof !== "string" || !/^[A-Za-z0-9_-]{32,64}$/.test(proof.proof))
      return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    return new NextResponse(`ap-site-verification=${proof.proof}`, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch { return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
