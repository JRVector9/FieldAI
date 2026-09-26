import React, { type ReactNode } from "react";

export type Screen = {
  id: string;
  slug: string;
  title: string;
  description: string;
  group?: string;
  state?: string;
  kind?: "overview" | "form" | "list" | "flow";
  fields?: string[];
  points?: string[];
  primary?: string;
  columns?: string[];
  metrics?: string[];
  emptyTitle?: string;
  emptyBody?: string;
};

export type Role = "owner" | "customer" | "media" | "admin";
export type PreviewState = "empty" | "error" | "disconnected" | "permission" | "limit" | "stale";

export function Brand({ product }: { product: "Agent Platform" | "Field" }) {
  return <span className="brand"><span aria-hidden="true" className="brand-mark"><i /><i /><i /><i /></span><span>{product === "Field" ? "field" : "agent"}</span></span>;
}

export function PreviewBadge() {
  return <span className="preview-badge">화면 검토본 · 실제 데이터 연결 전</span>;
}

export function ProductHome({ product, tagline, lead, highlights, previewHref, related, workspaceHref, previewOnly = false }: {
  product: "Agent Platform" | "Field";
  tagline: string;
  lead: string;
  highlights: { title: string; body: string }[];
  previewHref: string;
  related?: { name: string; description: string; href: string };
  workspaceHref: string;
  previewOnly?: boolean;
}) {
  return <div className="site-shell">
    <header className="site-header"><Brand product={product} /><nav aria-label="제품 탐색"><a href="#features">서비스 소개</a>{!previewOnly && <a href={workspaceHref}>작업 시작</a>}<a href={previewHref}>화면 둘러보기</a></nav></header>
    <main>
      <section className="hero"><div className="hero-copy">{previewOnly && <PreviewBadge />}<p className="eyebrow">{product === "Field" ? "나만의 사이트와 업무 공간" : "내 사업을 위한 독립 AI 상담"}</p><h1>{tagline}</h1><p className="hero-lead">{lead}</p><div className="hero-actions">{previewOnly ? <a className="button primary" href={previewHref}>화면 둘러보기 <span aria-hidden="true">↗</span></a> : <><a className="button primary" href={workspaceHref}>작업 시작 <span aria-hidden="true">↗</span></a><a className="button" href={previewHref}>화면 둘러보기 <span aria-hidden="true">↗</span></a></>}<span className="supporting-copy">{previewOnly ? "화면 검토본입니다. 입력 내용은 저장되지 않습니다" : "현재 로컬 기능 검수 중입니다"}</span></div></div><div className="hero-visual" aria-hidden="true"><div className="visual-top"><span className="visual-dot"/><span className="visual-dot"/><span className="visual-dot"/></div><div className="visual-body"><div className="visual-side"><span/><span/><span/><span/></div><div className="visual-main"><span className="visual-caption">{product === "Field" ? "내 사이트" : "내 사업 AI"}</span><span className="visual-title"/><span className="visual-subtitle"/><div className="visual-cards"><span/><span/></div><span className="visual-line"/><span className="visual-line short"/></div></div></div></section>
      <section className="feature-section" id="features"><div className="feature-heading"><p className="eyebrow">서비스 구성</p><h2>필요한 일에 집중할 수 있도록</h2></div><div className="feature-grid">{highlights.map((item, index) => <article className="feature" key={item.title}><span className="feature-index">0{index + 1}</span><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>{related && <div className="related-product"><div><strong>{related.name}</strong><p>{related.description}</p></div><a href={related.href}>별도 제품 보기 <span aria-hidden="true">↗</span></a></div>}</section>
    </main><footer className="site-footer"><Brand product={product} /><span>{previewOnly ? "설계 검토용 화면 · 실제 데이터 연결 전" : "로컬 기능 검수 중 · 외부 연동 준비 중"}</span></footer>
  </div>;
}

function StateBadge({ children }: { children: ReactNode }) { return <span className="state-badge">{children}</span>; }

export function PreviewWorkspace({ product, role, roleLabel, screens, current, previewState = "empty", children }: {
  product: "Agent Platform" | "Field";
  role: Role;
  roleLabel: string;
  screens: Screen[];
  current: Screen;
  previewState?: PreviewState;
  children?: ReactNode;
}) {
  const path = (screen: Screen) => `/preview/${role}/${screen.slug}`;
  const mobile = product === "Field" && role === "owner"
    ? ["today", "inbox", "bookings", "site"]
    : product === "Agent Platform" && role === "owner"
      ? ["ai", "inbox", "install"]
      : screens.slice(0, 4).map(screen => screen.slug);
  const reviewRoles: { role: Role; label: string; first: string }[] = product === "Field"
    ? [{role:"owner",label:"사업자",first:"start"},{role:"customer",label:"고객",first:"site"},{role:"admin",label:"관리자",first:"operations"}]
    : [{role:"owner",label:"사업자",first:"start"},{role:"customer",label:"고객",first:"chat"},{role:"media",label:"매체",first:"operations"},{role:"admin",label:"관리자",first:"operations"}];
  const stateOptions = [{id:"empty",label:"기본"},{id:"error",label:"오류"},{id:"disconnected",label:"미연결"},{id:"permission",label:"권한 거부"},{id:"limit",label:"한도"},{id:"stale",label:"동기화 지연"}] as const;
  const messages = {
    empty: null,
    error: ["정보를 불러오지 못했습니다", "서버 상태를 확인하고 다시 시도해 주세요. 입력 중인 내용은 저장 완료로 표시하지 않습니다."],
    disconnected: ["외부 서비스가 연결되지 않았습니다", "이 제품의 직접 업무는 계속 이용할 수 있습니다. 외부 데이터는 0건으로 표시하지 않습니다."],
    permission: ["이 화면을 볼 권한이 없습니다", "현재 제품의 조직과 역할을 확인해 주세요. 다른 제품의 세션으로 접근할 수 없습니다."],
    limit: ["현재 이용 한도에 도달했습니다", "새 작업은 잠시 제한됩니다. 이미 접수된 대화와 예약의 처리 경로는 유지됩니다."],
    stale: ["최근 변경의 반영을 기다리고 있습니다", "마지막 확인 시각과 원본 버전을 대조한 뒤 중요한 값은 다시 확인합니다."],
  } as const;
  return <div className="preview-root">
    <div className="preview-strip"><PreviewBadge /><nav className="review-roles" aria-label="검토할 역할">{reviewRoles.map(item => <a key={item.role} href={`/preview/${item.role}/${item.first}`} aria-current={role === item.role ? "page" : undefined}>{item.label}</a>)}</nav><a className="preview-home" href="/">{product} 홈으로</a></div>
    <div className="app-layout">
      <aside className="sidebar"><a href="/" className="sidebar-brand"><Brand product={product} /></a><div className="workspace-identity"><span className="avatar">{roleLabel.charAt(0)}</span><span><strong>{roleLabel} 화면</strong><small>데이터 미연결</small></span></div><nav aria-label={`${roleLabel} 메뉴`} className="side-nav">{screens.map(screen => <a key={screen.slug} href={path(screen)} className={screen.slug === current.slug ? "active" : ""} aria-current={screen.slug === current.slug ? "page" : undefined}>{screen.title}</a>)}</nav><div className="sidebar-bottom">화면 구조 검토용 경로입니다.<br/>저장·공개·발송은 아직 동작하지 않습니다.</div></aside>
      <div className="app-main"><header className="app-top"><div className="breadcrumb"><span>{roleLabel}</span><span aria-hidden="true">/</span><strong>{current.title}</strong></div><StateBadge>{current.id}</StateBadge></header><main className="app-content"><div className="content-width"><div className="page-head"><div><p className="eyebrow">{product} · {roleLabel}</p><h1>{current.title}</h1><p>{current.description}</p></div><StateBadge>{current.state ?? "설계 검토"}</StateBadge></div><nav className="state-switch" aria-label="검토할 상태">{stateOptions.map(item => <a key={item.id} href={`${path(current)}${item.id === "empty" ? "" : `?state=${item.id}`}`} aria-current={previewState === item.id ? "page" : undefined}>{item.label}</a>)}</nav>{messages[previewState] && <div className="state-message" role="status"><strong>{messages[previewState][0]}</strong><p>{messages[previewState][1]}</p><small>검토용 상태 예시 · 실제 서버 결과 아님</small></div>}{children ?? <ScreenContent screen={current} />}</div></main></div>
    </div><nav className="mobile-nav" aria-label="모바일 주요 메뉴">{mobile.map(slug => { const screen = screens.find(item => item.slug === slug); return screen ? <a key={slug} href={path(screen)} aria-current={slug === current.slug ? "page" : undefined}>{screen.title}</a> : null; })}<details className="mobile-more"><summary aria-current={!mobile.includes(current.slug) ? "page" : undefined}>더보기</summary><div className="mobile-more-list">{screens.map(screen => <a key={screen.slug} href={path(screen)} aria-current={screen.slug === current.slug ? "page" : undefined}>{screen.title}</a>)}</div></details></nav>
  </div>;
}

export function ScreenContent({ screen }: { screen: Screen }) {
  const fields = screen.fields ?? [];
  const points = screen.points ?? [];
  return <div className="screen-grid"><section className="main-panel" aria-label={`${screen.title} 내용`}>
    {screen.kind === "form" ? <>
      <div className="panel-heading"><h2>입력 항목</h2><span>서버 저장 전</span></div>
      <div className="form-fields">{fields.map((field, index) => <label key={field}>{field}<input type="text" placeholder={index === 0 ? "실제 정보를 입력해 주세요" : `${field} 입력`} /></label>)}</div>
      <div className="preview-action"><button type="button" disabled>{screen.primary ?? "저장하기"}</button><p>API와 권한 연결 후 사용할 수 있습니다. 입력 내용은 저장되지 않습니다.</p></div>
    </> : screen.kind === "flow" ? <>
      <div className="panel-heading"><h2>진행 단계</h2><span>검토용 경로</span></div>
      <ol className="flow-list">{points.map((point, index) => <li key={point}><span>{String(index + 1).padStart(2, "0")}</span><strong>{point}</strong></li>)}</ol>
      <div className="preview-action"><button type="button" disabled>{screen.primary ?? "계속하기"}</button><p>실제 데이터와 연결되면 다음 단계로 이동합니다.</p></div>
    </> : <>
      <div className="panel-heading"><h2>{screen.title}</h2><span>실제 데이터 연결 전</span></div>
      {screen.metrics && <div className="summary-grid">{screen.metrics.map(label => <div key={label}><span>{label}</span><strong>—</strong><small>데이터 연결 전</small></div>)}</div>}
      {screen.columns && <div className="list-columns" aria-label="목록 항목">{screen.columns.map(column => <span key={column}>{column}</span>)}</div>}
      <div className="empty-state"><span className="empty-mark" aria-hidden="true">○</span><h3>{screen.emptyTitle ?? (screen.kind === "list" ? "아직 표시할 항목이 없습니다" : "이곳에서 업무를 시작합니다")}</h3><p>{screen.emptyBody ?? (screen.kind === "list" ? "실제 데이터가 연결되면 이 목록에 표시됩니다." : "실제 계정과 데이터가 연결되면 현재 상태와 다음 작업을 보여줍니다.")}</p></div>
      {screen.primary && <div className="preview-action"><button type="button" disabled>{screen.primary}</button><p>기능 연결 후 사용할 수 있습니다.</p></div>}
    </>}
  </section><aside className="info-panel"><h2>이 화면에서 확인할 것</h2><ul>{(points.length && screen.kind !== "flow" ? points : screen.kind === "flow" ? ["각 단계의 저장·오류 상태", "이전 단계로 돌아가도 입력 유지", "완료 전 공개되지 않음"] : ["실제 데이터만 표시", "제품별 권한 확인", "오류와 빈 상태 구분"]).map(point => <li key={point}>{point}</li>)}</ul><div className="info-note"><strong>현재 상태</strong><p>이 화면은 디자인 검토본입니다. 서버 상태와 연결되지 않았습니다.</p></div></aside></div>;
}
