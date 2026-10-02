import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { SiteRelease } from "../../field-site";
import { customHostMapping, platformHost } from "../../custom-domain-host";

export async function publishedSite(slug: string, pageSlug: string): Promise<SiteRelease> {
  // 대문자 Host도 같은 사이트로 판정하도록 소문자로 맞춘다.
  const host = ((await headers()).get("host") ?? "").toLowerCase();
  const domain = process.env.APP_PROFILE !== "live" ? "localhost:3002" : process.env.FIELD_SITE_BASE_DOMAIN;
  if (domain && host.endsWith(`.${domain}`) && host !== `${slug}.${domain}`) notFound();

  const api = process.env.FIELD_API_BASE_URL ?? "http://127.0.0.1:4321";
  const tenant = domain && host === `${slug}.${domain}`;
  let customHost = "";
  if (!tenant && !platformHost(host)) {
    const mapping = await customHostMapping(host);
    if (!mapping || mapping.slug !== slug) notFound();
    customHost = host;
  }
  const address = new URL(`/v1/public/sites/${encodeURIComponent(slug)}`, api);
  if (customHost) address.searchParams.set("host", customHost);
  const response = await fetch(address, { cache: "no-store" });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`Field public site API failed (${response.status})`);
  const site = await response.json() as SiteRelease;
  if (!Array.isArray(site.pages) || !site.pages.some(page => page.slug === pageSlug)) notFound();
  return site;
}
