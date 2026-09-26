import { notFound } from "next/navigation";
import { FieldAdmin } from "../../../field-admin";
import { isFieldAdminSection } from "../../../field-admin-sections";

export const metadata = { robots: { index: false, follow: false } };
export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isFieldAdminSection(section)) notFound();
  return <FieldAdmin section={section} />;
}
