import { notFound } from "next/navigation";
import { AgentAdmin } from "../../../agent-admin";
import { isAgentAdminSection } from "../../../agent-admin-sections";

export const metadata = { robots: { index: false, follow: false } };
export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isAgentAdminSection(section)) notFound();
  return <AgentAdmin section={section} />;
}
