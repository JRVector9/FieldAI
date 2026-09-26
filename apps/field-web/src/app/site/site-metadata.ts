import type { Metadata } from "next";
import type { SiteRelease } from "../../field-site";
import { publishedSite } from "./site-route";

export async function safePublishedSiteMetadata(slug: string, pageSlug: string): Promise<Metadata> {
  let site: SiteRelease;
  try {
    site = await publishedSite(slug, pageSlug);
  } catch {
    return { title: "Field 사이트", robots: { index: false, follow: false } };
  }
  return publishedSiteMetadata(site, pageSlug);
}

export function publishedSiteMetadata(site: SiteRelease, pageSlug: string): Metadata {
  const page = site.pages.find(item => item.slug === pageSlug);
  if (!page) throw new Error("published page is missing");

  const descriptionSource = page.sections.find(section => section.body.trim())?.body
    ?? site.catalog.introduction;
  const description = descriptionSource.replace(/\s+/g, " ").trim().slice(0, 160);
  const path = pageSlug === "home" ? `/site/${site.slug}` : `/site/${site.slug}/${pageSlug}`;
  const canonical = site.siteOrigin ? `${site.siteOrigin}${path}` : undefined;

  return {
    title: `${page.title} | ${site.catalog.businessName}`,
    description,
    alternates: canonical ? { canonical } : undefined,
  };
}
