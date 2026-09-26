import { ProductHome } from "@fieldai/ui";
import { AgentHome } from "../agent-home";
export const dynamic = "force-dynamic";
export default function Home() {
  if (process.env.APP_PROFILE === "design_preview") return <ProductHome product="Agent Platform" tagline="내 사업의 질문에, 더 잘 답하는 AI." lead="사업 정보를 직접 승인하고, 기존 웹사이트에 상담을 설치하세요." previewHref="/preview/owner/start" workspaceHref="/workspace" previewOnly highlights={[{title:"사업 정보를 직접 관리",body:"서비스와 FAQ를 작성하고 검토한 버전만 AI의 근거로 사용합니다."},{title:"기존 사이트에 설치",body:"상담 링크와 위젯을 별도로 설치하고 고객 대화를 AP에서 관리합니다."},{title:"사람에게 이어지는 상담",body:"AI가 답하지 못한 질문은 사업자가 같은 대화에서 이어받습니다."}]} related={{name:"사이트도 직접 만들고 싶다면",description:"Field는 사이트 제작과 직접 문의·예약을 운영하는 별도 제품입니다.",href:process.env.NEXT_PUBLIC_FIELD_WEB_URL ?? "http://127.0.0.1:3002"}} />;
  return <AgentHome />;
}
