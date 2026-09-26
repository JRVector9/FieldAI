"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { type Catalog } from "./field-api";

export type SiteSection = { id: string; kind: "hero" | "text" | "service_list" | "faq"; heading: string; body: string;
  assetId?: string; alt?: string };
export type SitePage = { id: string; slug: string; title: string; sections: SiteSection[] };
export type SiteDraft = {
  siteId: string;
  slug: string;
  revision: number;
  template: "essential" | "editorial" | "warm";
  palette: string;
  pages: SitePage[];
};
export type SiteRelease = Omit<SiteDraft, "revision"> & {
  organizationId: string;
  siteOrigin: string | null;
  apWidget: { publicId: string; mode: "inline" | "floating"; sdkSrc: string } | null;
  siteRevision: number;
  catalogRevision: number;
  latestCatalogRevision: number;
  stale: boolean;
  catalog: Catalog;
};

function ApWidget({ site }: { site: SiteRelease }) {
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = container.current;
    const widget = site.apWidget;
    if (!target || !widget || !site.siteOrigin || window.location.origin !== site.siteOrigin) return;
    const script = document.createElement("script");
    script.src = widget.sdkSrc;
    script.dataset.deployment = widget.publicId;
    script.dataset.mode = widget.mode;
    script.addEventListener("error", () => setError("AI 상담을 열 수 없습니다. 직접 문의를 이용해 주세요."));
    target.append(script);
    return () => target.replaceChildren();
  }, [site.apWidget, site.siteOrigin]);
  return <div ref={container} aria-label="AI 상담 위젯">{error && <p role="status">{error}</p>}</div>;
}

export function SiteRenderer({ site, catalog, preview = false, catalogStale = false, publicPageSlug = "home", selectedPreviewPageId, onPreviewPageChange }: { site: SiteDraft | SiteRelease; catalog: Catalog; preview?: boolean; catalogStale?: boolean; publicPageSlug?: string; selectedPreviewPageId?: string; onPreviewPageChange?: (pageId: string) => void }) {
  const [previewPageSlug, setPreviewPageSlug] = useState("home");
  const current = site.pages.find(page => preview && selectedPreviewPageId ? page.id === selectedPreviewPageId : page.slug === (preview ? previewPageSlug : publicPageSlug))
    ?? (preview ? site.pages[0] : undefined);
  const palette = { "--site-accent": site.palette } as CSSProperties;
  const intakePath = `/public/${"organizationId" in site ? site.organizationId : catalog.organizationId}`;
  return <div className={`field-site ${site.template}`} style={palette}>
    <header className="field-site-header"><div className="field-site-brand"><span className="field-site-brand-mark" aria-hidden="true">{catalog.businessName.trim().slice(0, 1) || "사"}</span><strong>{catalog.businessName}</strong></div><nav aria-label="사이트 페이지">{site.pages.map(page => preview
      ? <button type="button" key={page.id} aria-current={page.id === current?.id ? "page" : undefined} onClick={() => { setPreviewPageSlug(page.slug); onPreviewPageChange?.(page.id); }}>{page.title}</button>
      : <a key={page.id} aria-current={page.id === current?.id ? "page" : undefined} href={page.slug === "home" ? `/site/${site.slug}` : `/site/${site.slug}/${page.slug}`}>{page.title}</a>)}</nav>{preview ? <span className="field-site-header-cta" title="사이트 공개 후 연결됩니다">문의하기</span> : <a className="field-site-header-cta" href={intakePath}>문의하기</a>}</header>
    <main className="field-site-main">{catalogStale && <p className="field-site-stale" role="status">사업 정보가 공개 후 변경되었습니다. 가격·예약 조건은 직접 문의에서 다시 확인해 주세요.</p>}{current?.sections.map(section => <section key={section.id} className={`field-site-section ${section.kind}`}><div className="field-site-section-index">{section.kind === "hero" ? [catalog.industry, catalog.region].filter(Boolean).join(" · ") || "사업 소개" : section.kind === "service_list" ? "서비스" : section.kind === "faq" ? "질문" : "이야기"}</div><div className="field-site-section-body"><h1>{section.heading || catalog.businessName}</h1>{section.body && <p>{section.body}</p>}{section.kind === "faq" && (catalog.faqs ?? []).length > 0 && <dl className="field-site-faqs">{catalog.faqs.map((faq, index) => <div key={index}><dt>{faq.question}</dt><dd>{faq.answer}</dd></div>)}</dl>}{section.assetId && <figure className="field-site-image"><img src={preview ? `/v1/sites/assets/${section.assetId}` : `/v1/public/site-assets/${section.assetId}`} alt={section.alt ?? ""} loading="lazy" /></figure>}{section.kind === "hero" && (preview ? <span className="field-site-hero-cta" title="사이트 공개 후 연결됩니다">예약 요청 · 공개 후 연결</span> : <a className="field-site-hero-cta" href={`${intakePath}#reservation`}>예약 요청 →</a>)}{section.kind === "service_list" && <ul className="field-site-services">{catalog.services.map(service => <li key={service.id}><strong>{service.name}</strong><p>{service.description}</p><small>{catalogStale ? "가격·예약 조건 재확인 필요" : `${service.priceAmount === null ? "가격 문의" : `${service.priceAmount.toLocaleString("ko-KR")}원`} · ${service.bookingMode === "slot" ? "시간표 선택 방식" : "희망 시간 제출 방식"}`}</small>{preview ? <span className="field-site-preview-link">공개 후 예약 연결</span> : <a href={`${intakePath}#reservation`}>예약 요청 →</a>}</li>)}</ul>}</div>{section.kind === "hero" && !section.assetId && <div className="field-site-hero-art" aria-hidden="true"><span>✧</span><small>브랜드 그래픽</small></div>}</section>)}
      <section className="field-site-contact"><h2>문의와 예약</h2><p>{catalogStale ? "사업 정보가 변경됐습니다. 최신 서비스와 가격을 확인한 후 요청해 주세요." : "직접 문의하거나 예약을 요청할 수 있습니다. 예약은 사업자가 확인한 후 확정됩니다."}</p>{preview ? <span>공개 후 문의·예약 버튼이 연결됩니다.</span> : <><a href={intakePath}>직접 문의하기</a> <a href={`${intakePath}#reservation`}>예약 요청하기</a>{"apWidget" in site && site.apWidget && <ApWidget site={site} />}</>}</section>
    </main><footer className="field-site-footer"><span>{catalog.businessName}</span><span>{catalogStale ? "연락처·조건은 문의 화면에서 재확인" : `${catalog.region}${catalog.contactPhone ? ` · ${catalog.contactPhone}` : ""}`}</span></footer>
  </div>;
}

export function PublicSitePage({ site, pageSlug }: { site: SiteRelease; pageSlug: string }) {
  return <SiteRenderer site={site} catalog={site.catalog} catalogStale={site.stale} publicPageSlug={pageSlug} />;
}
