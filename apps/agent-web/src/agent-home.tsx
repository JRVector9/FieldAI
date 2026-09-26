import { Brand } from "@fieldai/ui";

const fieldUrl = process.env.NEXT_PUBLIC_FIELD_WEB_URL ?? "http://127.0.0.1:3002";

export function AgentHome() {
  return <div className="agent-home">
    <header className="agent-home-header"><div className="agent-home-wrap agent-home-nav"><a href="/" aria-label="Agent Platform 홈"><Brand product="Agent Platform" /></a><nav aria-label="서비스 탐색"><a href="#agent-intro">서비스 소개</a><a href="/publisher">제휴 매체</a><a href={fieldUrl}>홈페이지 제작</a></nav><div className="agent-home-nav-actions"><a href="/workspace">로그인</a><a className="agent-home-dark-button" href="/workspace">무료로 시작</a></div></div></header>
    <main className="agent-home-main agent-home-wrap" id="agent-intro"><p className="agent-home-kicker">YOUR BUSINESS AGENT</p><h1>홈페이지가 없어도,<br />내 사업을 아는 AI.</h1><p className="agent-home-lead">사업 정보를 한 번 등록하고, 상담 링크와 외부 사이트 설치로 고객과 만나세요.</p>
      <div className="agent-home-choices"><section><span className="agent-home-icon" aria-hidden="true">✧</span><h2>사이트 교체 없이 시작</h2><p>기존 홈페이지는 그대로 두고 승인된 서비스·FAQ를 바탕으로 독립 상담 페이지를 만듭니다.</p><a className="agent-home-primary" href="/workspace">내 AI 만들기 →</a></section><section><span className="agent-home-icon" aria-hidden="true">▤</span><h2>문의와 상담을 한곳으로</h2><p>어디에서 시작된 대화인지 확인하고 같은 AP 관리실에서 답변과 고객 문의를 이어받습니다.</p><a className="agent-home-secondary" href="/preview/owner/start">사업자 관리실 체험 →</a></section></div>
      <p className="agent-home-note">사이트 제작과 직접 예약 운영은 별도 Field 제품에서 시작할 수 있습니다. <a href={fieldUrl}>Field 보기 ↗</a></p>
    </main>
  </div>;
}
