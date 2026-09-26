import { ProductHome } from "@fieldai/ui";
import { FieldHome } from "../field-home";

export const dynamic = "force-dynamic";

export default function Home() {
  if (process.env.APP_PROFILE === "design_preview") return <ProductHome product="Field" tagline="내 사업의 자리가 되는 사이트." lead="사업 정보를 입력하고 나만의 사이트를 직접 만드세요." previewHref="/preview/owner/start" workspaceHref="/workspace" previewOnly highlights={[]} />;
  return <FieldHome />;
}
