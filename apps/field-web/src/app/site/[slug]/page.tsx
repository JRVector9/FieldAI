import { PublicSitePage } from "../../../field-site";
import { publishedSite } from "../site-route";
import { safePublishedSiteMetadata } from "../site-metadata";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return safePublishedSiteMetadata(slug, "home");
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await publishedSite(slug, "home");
  return <PublicSitePage site={site} pageSlug="home" />;
}
