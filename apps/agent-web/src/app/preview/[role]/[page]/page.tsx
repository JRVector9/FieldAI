import { notFound } from "next/navigation";
import { PreviewWorkspace, type PreviewState, type Role } from "@fieldai/ui";
import { screens } from "../../../../screens";
import { AgentPreviewContent } from "../../../../agent-preview";

export const dynamic = "force-dynamic";
const labels: Record<Role, string> = {owner:"사업자",customer:"고객",media:"제휴 매체",admin:"AP 관리자"};
export default async function PreviewPage({params,searchParams}:{params:Promise<{role:string;page:string}>;searchParams:Promise<{state?:string}>}) {
  if (process.env.APP_PROFILE === "live") notFound();
  const {role,page} = await params;
  if (!(role in screens)) notFound();
  const currentRole = role as Role;
  const current = screens[currentRole].find(screen => screen.slug === page);
  if (!current) notFound();
  const {state} = await searchParams;
  const previewState = (["error","disconnected","permission","limit","stale"] as PreviewState[]).find(item => item === state) ?? "empty";
  return <PreviewWorkspace product="Agent Platform" role={currentRole} roleLabel={labels[currentRole]} screens={screens[currentRole]} current={current} previewState={previewState}><AgentPreviewContent screen={current}/></PreviewWorkspace>;
}
