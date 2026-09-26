import { Brand } from "@fieldai/ui";

const agentHome = process.env.NEXT_PUBLIC_AGENT_WEB_URL ?? "http://localhost:3001";

function Icon({ kind }: { kind: "sparkle" | "globe" | "link" | "document" | "chat" }) {
  const paths = {
    sparkle: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" /><path d="m20 16 .7 2.3L23 19l-2.3.7L20 22l-.7-2.3L17 19l2.3-.7L20 16Z" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c-3 3-4 6-4 9s1 6 4 9m0-18c3 3 4 6 4 9s-1 6-4 9" /></>,
    link: <><path d="m10 14 4-4M8 16H6a4 4 0 0 1 0-8h4m4 0h4a4 4 0 0 1 0 8h-4" /></>,
    document: <><path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" /></>,
    chat: <><path d="M4 5h16v12H9l-5 4V5ZM8 10h8M8 14h5" /></>,
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export function FieldHome() {
  return <div className="field-home">
    <header className="field-home-header"><div className="field-home-wrap field-home-nav">
      <a href="/" aria-label="Field 홈"><Brand product="Field" /></a>
      <nav aria-label="서비스 탐색"><a href="#how-it-works">서비스 소개</a><a href={agentHome}>사업자 AI</a><a href="/preview/owner/start">화면 둘러보기</a></nav>
      <div className="field-home-nav-actions"><a href="/workspace?mode=login">로그인</a><a className="field-home-dark-button" href="/workspace">무료로 시작</a></div>
    </div></header>
    <main className="field-home-wrap">
      <section className="field-home-hero" aria-labelledby="field-home-title">
        <div className="field-home-hero-copy">
          <p className="field-home-kicker"><Icon kind="sparkle" /> YOUR BUSINESS. EVERYWHERE.</p>
          <h1 id="field-home-title">내 사업의 시작부터.<br /><span>고객을 만나는<br />모든 순간까지.</span></h1>
          <p className="field-home-lead">내 홈페이지를 만들고, 필요한 AI 상담을 연결하세요.<br />들어온 문의와 예약은 출처를 보며 처리합니다.</p>
          <div className="field-home-actions"><a className="field-home-primary" href="/workspace">내 홈페이지 만들기</a><a className="field-home-secondary" href={agentHome}>AI만 도입하기</a></div>
          <p className="field-home-note">Field와 AI 서비스는 별도 가입·요금 · 고객 서비스 대금은 직접 수령</p>
        </div>
        <div className="field-home-orbit" aria-label="사이트와 AI 상담 연결 흐름">
          <div className="field-home-orbit-top"><span>하나의 사업, 선택해서 연결하는 AI</span><strong>연결된 경험</strong></div>
          <div className="field-home-orbit-main"><span className="field-home-agent-icon"><Icon kind="sparkle" /></span><div><strong>내 사업 AI</strong><p>승인된 정보로 안내하고, 문의를 연결해요.</p></div></div>
          <span className="field-home-orbit-stem" aria-hidden="true" />
          <div className="field-home-orbit-channels"><div><Icon kind="globe" /><span>내 홈페이지</span></div><div><Icon kind="link" /><span>공유 링크</span></div><div><Icon kind="document" /><span>제휴 콘텐츠</span></div></div>
          <p className="field-home-orbit-flow">고객 대화 <span aria-hidden="true">→</span> 출처별 문의함 <span aria-hidden="true">→</span> 예약·운영</p>
        </div>
      </section>
      <div className="field-home-next"><p>사업 정보를 직접 입력해 사이트를 만들고, 고객 화면과 업무 흐름을 확인할 수 있습니다.</p><div><a className="field-home-dark-button" href="/workspace">내 관리실 열기</a><a className="field-home-outline-button" href="/preview/owner/start">화면 둘러보기</a></div></div>
      <section className="field-home-section" id="how-it-works"><div className="field-home-section-heading"><h2>홈페이지에서 시작해,<br />실제 업무까지.</h2><p>사이트 제작과 직접 문의·예약을 Field에서 운영하고, AI 상담은 필요할 때 별도로 연결합니다.</p></div><div className="field-home-feature-grid">
        <article><Icon kind="globe" /><h3>스스로 만드는 내 사이트</h3><p>사업 정보를 입력하고 템플릿·제작 AI로 만드세요. 공개는 직접 확인한 뒤에만 이루어집니다.</p></article>
        <article><Icon kind="sparkle" /><h3>필요할 때 연결하는 AI</h3><p>별도 AI 서비스가 승인된 정보를 바탕으로 안내하고, 동의한 문의를 전달합니다.</p></article>
        <article><Icon kind="chat" /><h3>한곳에서 처리하는 일</h3><p>고객 문의에 답하고 예약을 확정하세요. 직접 접수는 AI 연결 없이도 계속 동작합니다.</p></article>
      </div></section>
      <section className="field-home-section field-home-templates"><div className="field-home-section-heading"><h2>내 사업에 어울리는 첫 화면.</h2><p>서로 다른 구성을 선택하고, 실제 사업 정보와 사진으로 편집할 수 있습니다.</p></div><div className="field-home-template-grid">
        <a href="/workspace/site" className="field-home-template essential"><span className="field-home-template-art"><i /><i /><i /></span><strong>에센셜</strong><small>명료한 소개와 서비스 중심</small></a>
        <a href="/workspace/site" className="field-home-template editorial"><span className="field-home-template-art"><i /><i /><i /></span><strong>에디토리얼</strong><small>큰 사진과 여유로운 구성</small></a>
        <a href="/workspace/site" className="field-home-template warm"><span className="field-home-template-art"><i /><i /><i /></span><strong>웜 스튜디오</strong><small>따뜻한 색감과 부드러운 형태</small></a>
      </div></section>
    </main>
    <footer className="field-home-footer field-home-wrap"><span>field · Field 독립 사이트 제작과 예약 운영</span><a href={agentHome}>별도 AI 서비스 보기 ↗</a></footer>
  </div>;
}
