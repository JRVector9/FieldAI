import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { SiteRelease } from "../../field-site";

export async function publishedSite(slug: string, pageSlug: string): Promise<SiteRelease> {
  const host = (await headers()).get("host") ?? "";
  const domain = process.env.APP_PROFILE !== "live" ? "localhost:3002" : process.env.FIELD_SITE_BASE_DOMAIN;
  if (domain && host.endsWith(`.${domain}`) && host !== `${slug}.${domain}`) notFound();

  const api = process.env.FIELD_API_BASE_URL ?? "http://127.0.0.1:4321";
  const response = await fetch(new URL(`/v1/public/sites/${encodeURIComponent(slug)}`, api), { cache: "no-store" });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`Field public site API failed (${response.status})`);
  const site = await response.json() as SiteRelease;
  if (!Array.isArray(site.pages) || !site.pages.some(page => page.slug === pageSlug)) notFound();
  return site;
}
