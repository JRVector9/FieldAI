import { NextResponse, type NextRequest } from "next/server";
import { customHostMapping, customHostResource, platformHost } from "./custom-domain-host";

const siteSlug = /^field-[0-9a-f]{12}$/;
const sitePage = /^\/site\/([^/]+)(?:\/[^/]+)?\/?$/;
const publicPage = /^\/public\/([^/]+)\/?$/;
const receiptPage = /^\/(?:inquiry|reservation)\/[^/]+\/?$/;
const notFound = () => new Response("Not Found", { status: 404 });
// 설계 시안(/preview)은 고정 예시 데이터라 live 플랫폼 Host에서 노출하지 않는다. mock·sandbox는 기존처럼 허용한다.
const previewBlocked = (path: string) => process.env.APP_PROFILE === "live" && (path === "/preview" || path.startsWith("/preview/"));
const unavailable = () => new Response("사업장 정보를 확인하지 못했습니다. 잠시 뒤 새로고침해 주세요.", {
  status: 503,
  headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
});

export async function proxy(request: NextRequest) {
  const domain = process.env.APP_PROFILE === "live" ? process.env.FIELD_SITE_BASE_DOMAIN : "localhost:3002";
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const suffix = domain ? `.${domain.toLowerCase()}` : "";
  if (!suffix || !host.endsWith(suffix)) {
    if (platformHost(host)) return previewBlocked(request.nextUrl.pathname) ? notFound() : NextResponse.next();
    try {
      const mapping = await customHostMapping(host);
      if (!mapping) return notFound();
      const path = request.nextUrl.pathname;
      if (path.startsWith("/_next/") || path === "/favicon.ico" || path === "/.well-known/ap-site-verification") return NextResponse.next();
      const site = sitePage.exec(path);
      if (site) return site[1] === mapping.slug ? NextResponse.next() : notFound();
      const catalog = /^\/(?:public|v1\/public\/catalog)\/([^/]+)(?:\/(?:availability|inquiries(?:\/recover)?|reservations(?:\/recover)?))?\/?$/.exec(path);
      if (catalog) return catalog[1] === mapping.organizationId ? NextResponse.next() : notFound();
      const report = /^\/v1\/public\/sites\/([^/]+)\/reports$/.exec(path);
      if (report) return report[1] === mapping.slug ? NextResponse.next() : notFound();
      const receipt = /^\/(inquiry|reservation)\/([^/]+)\/?$/.exec(path);
      const workApi = /^\/v1\/(inquiries|reservations)\/([^/]+)(?:\/.*)?$/.exec(path);
      const notification = /^\/v1\/customer\/notification-consents\/(inquiry|reservation)\/([^/]+)\/?$/.exec(path);
      const asset = /^\/v1\/public\/site-assets\/([^/]+)$/.exec(path);
      if (receipt || workApi || notification || asset) {
        const kind = receipt ? receipt[1] === "inquiry" ? "inquiries" : "reservations" : workApi ? workApi[1]! as "inquiries" | "reservations" : notification ? notification[1] === "inquiry" ? "inquiries" : "reservations" : "site-assets";
        const id = receipt?.[2] ?? workApi?.[2] ?? notification?.[2] ?? asset![1]!;
        return await customHostResource(host, kind, id) ? NextResponse.next() : notFound();
      }
      return siteRootRewrite(request, mapping.slug) ?? notFound();
    } catch { return unavailable(); }
  }

  const tenantSlug = host.slice(0, -suffix.length);
  if (!siteSlug.test(tenantSlug)) return notFound();
  const path = request.nextUrl.pathname;
  if (path.startsWith("/_next/") || path.startsWith("/v1/") || path === "/favicon.ico"
    || path === "/.well-known/ap-site-verification") return NextResponse.next();

  const site = sitePage.exec(path);
  if (site) return site[1] === tenantSlug ? NextResponse.next() : notFound();

  const publicCatalog = publicPage.exec(path);
  if (publicCatalog) {
    try {
      const api = process.env.FIELD_API_BASE_URL ?? "http://127.0.0.1:4321";
      const response = await fetch(new URL(`/v1/public/sites/${tenantSlug}`, api), { cache: "no-store" });
      if (response.status === 404) {
        const restricted = await response.json().catch(() => ({})) as { error?: string; organizationId?: string };
        return restricted.error === 'site_visibility_restricted' && restricted.organizationId === publicCatalog[1]
          ? NextResponse.next() : notFound();
      }
      if (!response.ok) return unavailable();
      const published = await response.json() as { organizationId?: string };
      return published.organizationId === publicCatalog[1] ? NextResponse.next() : notFound();
    } catch { return unavailable(); }
  }

  if (receiptPage.test(path)) return NextResponse.next();
  // 기본 사이트 주소(테넌트 루트)도 사용자 도메인과 같이 /와 /<page>를 공개 사이트로 연결한다.
  return siteRootRewrite(request, tenantSlug) ?? notFound();
}

// 사이트 루트·하위 페이지 경로를 /site/<slug>[/<page>]로 rewrite한다. 대상이 아니면 null.
function siteRootRewrite(request: NextRequest, slug: string) {
  const path = request.nextUrl.pathname;
  if (path === "/" || /^\/[a-z0-9][a-z0-9-]{0,39}\/?$/.test(path)
    && !["workspace", "admin", "login", "signup", "start", "api", "v1", "integrations"].includes(path.replaceAll("/", ""))) {
    const target = request.nextUrl.clone();
    target.pathname = `/site/${slug}${path === "/" ? "" : path.replace(/\/$/, "")}`;
    return NextResponse.rewrite(target);
  }
  return null;
}
