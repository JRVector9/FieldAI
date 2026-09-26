import { PublicCatalogPage } from "../../../field-public";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicCatalogPage id={id} />;
}
