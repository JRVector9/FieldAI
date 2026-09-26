import { PublicSitePage } from "../../../../field-site";
import { publishedSite } from "../../site-route";
import { safePublishedSiteMetadata } from "../../site-metadata";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; page: string }> }) {
  const { slug, page } = await params;
  return safePublishedSiteMetadata(slug, page);
}

export default async function Page({ params }: { params: Promise<{ slug: string; page: string }> }) {
  const { slug, page } = await params;
  const site = await publishedSite(slug, page);
  return <PublicSitePage site={site} pageSlug={page} />;
}
