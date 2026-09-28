"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { SiteEditorFrame } from "./site-editor-frame";
import { SiteTemplateCards } from "./site-editor-design";
import { requestJson, type Catalog } from "./field-api";
import { SiteRenderer, type SiteDraft, type SitePage, type SiteSection } from "./field-site";
import { isSiteFont, siteFonts, type SiteFont } from './site-fonts';

type Step = "business" | "design" | "pages" | "contact" | "publish";
type Release = { id: string; revision: number; catalog_revision: number; published_at: string };
type GenerationJob = { id: string; status: "queued" | "running" | "proposed" | "applied_to_draft" | "failed" | "canceled" | "stale"; prompt: string; baseRevision: number; catalogRevision: number; proposal: Pick<SiteDraft, "template" | "palette" | "font" | "pages"> | null; inputTokens: number | null; outputTokens: number | null; costStatus: "pending" | "unpriced"; errorCode: string | null };
type SiteAsset = { id: string; state: "ready"; width: number; height: number; byteSize: number; createdAt: string };
const steps: { id: Step; label: string }[] = [
  { id: "business", label: "1 사업 정보" }, { id: "design", label: "2 디자인" },
  { id: "pages", label: "3 편집" }, { id: "contact", label: "4 연락·예약" }, { id: "publish", label: "5 확인·공개" },
];
const kinds: { id: SiteSection["kind"]; label: string }[] = [
  { id: "hero", label: "첫 소개" }, { id: "text", label: "본문" },
  { id: "service_list", label: "서비스 목록" }, { id: "faq", label: "질문·답변" },
];

function resumedPosition(draft: SiteDraft, search: string): { step: Step; pageId: string | null } {
  const params = new URLSearchParams(search);
  const requestedStep = params.get("step");
  const requestedPage = params.get("page");
  return {
    step: steps.find(item => item.id === requestedStep)?.id ?? (draft.revision > 0 ? "pages" : "design"),
    pageId: draft.pages.find(page => page.id === requestedPage)?.id ?? null,
  };
}
export function sitePublishGuidance(state: { restricted: boolean; busy: boolean; dirty: boolean;
  approved: boolean; revision: number; publishedRevision: number | null;
  publishedCatalogRevision: number | null; approvedRevision: number }):
  { reason: string; href: string | null; label: string | null } | null {
  if (state.dirty) return { reason: "변경 내용을 먼저 서버에 저장해 주세요.", href: null, label: null };
  if (state.restricted) return { reason: "사이트 공개가 제한되어 있습니다.", href: "/workspace/moderation", label: "신고·검토 결과 보기" };
  if (!state.approved) return { reason: "사업 정보를 먼저 승인해 주세요.", href: "/workspace?section=services&edit=business&returnTo=publish", label: "사업 정보 입력·승인 열기(추가)" };
  if (state.busy) return { reason: "진행 중인 작업이 끝나면 다시 확인해 주세요.", href: null, label: null };
  if (state.revision === 0) return { reason: "사이트 초안을 먼저 저장해 주세요.", href: null, label: null };
  if (state.publishedRevision === state.revision && state.publishedCatalogRevision !== null && state.approvedRevision > state.publishedCatalogRevision)
    return { reason: "새로 승인한 사업 정보를 반영하려면 사이트 초안을 다시 저장해 주세요.", href: null, label: null };
  if (state.publishedRevision === state.revision) return { reason: "현재 저장본은 이미 공개되었습니다.", href: null, label: null };
  return null;
}
export function siteInquiryTestGuidance(organizationId: string, publishedRevision: number | null,
  restricted: boolean, approvedServiceCount: number): { href: string | null; reason: string | null } {
  if (restricted) return { href: null, reason: "공개 제한 상태에서는 고객 화면을 확인할 수 없습니다." };
  if (publishedRevision === null) return { href: null, reason: "홈페이지를 먼저 공개해 주세요." };
  if (approvedServiceCount === 0) return { href: null, reason: "승인된 서비스가 있어야 테스트 문의를 만들 수 있습니다." };
  return { href: `/public/${encodeURIComponent(organizationId)}?ownerTest=1`, reason: null };
}

export function sameDraftContent(left: SiteDraft, right: SiteDraft) {
  const content = (draft: SiteDraft) => JSON.stringify({
    template: draft.template, palette: draft.palette, font: draft.font,
    pages: draft.pages.map(page => ({ id: page.id, slug: page.slug, title: page.title.trim(),
      sections: page.sections.map(section => ({ id: section.id, kind: section.kind,
        heading: section.heading.trim(), body: section.body.trim(),
        ...(section.assetId ? { assetId: section.assetId, alt: section.alt?.trim() } : {}) })) })),
  });
  return content(left) === content(right);
}

function pagePathError(pages: SitePage[]): string | null {
  if (!pages.some(page => page.slug === "home")) return "홈 페이지 경로는 유지해야 합니다.";
  const paths = new Set<string>();
  for (const page of pages) {
    if (!page.title.trim()) return "페이지 이름을 입력해 주세요.";
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(page.slug))
      return "페이지 주소 경로는 영문 소문자·숫자·하이픈으로 1~40자 입력해 주세요.";
    if (paths.has(page.slug)) return "페이지 주소 경로가 중복됩니다. 서로 다른 경로를 입력해 주세요.";
    paths.add(page.slug);
  }
  return null;
}

export function SiteFontSelect({ font, onChange }: { font: SiteFont | undefined; onChange: (font: SiteFont | undefined) => void }) {
  return <label>사이트 글꼴 (추가)<select value={font ?? ''} onChange={event => {
    const value = event.target.value;
    if (value === '' || isSiteFont(value)) onChange(value || undefined);
  }}><option value="">기존 글자 유지</option>{siteFonts.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>;
}

export function SiteEditor() {
  const [step, setStep] = useState<Step>("design");
  const [site, setSite] = useState<SiteDraft | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [approvedCatalog, setApprovedCatalog] = useState<Catalog | null>(null);
  const [noSite, setNoSite] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed" | "needs_setup">("loading");
  const [visibilityRestricted, setVisibilityRestricted] = useState(false);
  const [publishedRevision, setPublishedRevision] = useState<number | null>(null);
  const [publishedCatalogRevision, setPublishedCatalogRevision] = useState<number | null>(null);
  const [siteOrigin, setSiteOrigin] = useState<string | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "failed" | "conflict">("idle");
  const [conflictDraft, setConflictDraft] = useState<SiteDraft | null>(null);
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState("");
  const editSequence = useRef(0);
  const saveInFlight = useRef(false);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiJob, setAiJob] = useState<GenerationJob | null>(null);
  const [assets, setAssets] = useState<SiteAsset[]>([]);
  const [uploadingSectionId, setUploadingSectionId] = useState<string | null>(null);
  const selectedPageId = site?.pages.find(page => page.id === activePageId)?.id ?? site?.pages[0]?.id;
  const publishGuidance = site && sitePublishGuidance({ restricted: visibilityRestricted, busy, dirty, approved: Boolean(approvedCatalog), revision: site.revision, publishedRevision, publishedCatalogRevision, approvedRevision: approvedCatalog?.revision ?? 0 });
  const inquiryTestGuidance = catalog && siteInquiryTestGuidance(catalog.organizationId, publishedRevision, visibilityRestricted, approvedCatalog?.services.length ?? 0);

  const load = useCallback(async (): Promise<boolean> => {
    setLoadState("loading"); setStatus("");
    const failed = (message: string): false => {
      setLoadState("failed"); setStatus(message);
      return false;
    };
    try {
      const business = await requestJson("/v1/business/draft");
      if (business.status !== 200) {
        if ([401, 403, 404].includes(business.status)) {
          setLoadState("needs_setup");
          setStatus("먼저 Field 계정과 사업 조직을 만들고 로그인해 주세요.");
        } else {
          setLoadState("failed");
          setStatus(`사업 정보를 불러오지 못했습니다 (${business.status}). 서버 상태를 확인하고 다시 시도해 주세요.`);
        }
        return false;
      }
      const businessDraft = business.data as Catalog;
      setCatalog(businessDraft);
      const savedAssets = await requestJson("/v1/sites/assets");
      if (savedAssets.status !== 200)
        return failed(`사진 보관함을 불러오지 못했습니다 (${savedAssets.status}). 다시 시도해 주세요.`);
      setAssets((savedAssets.data as { assets: SiteAsset[] }).assets);
      const approved = await requestJson(`/v1/public/catalog/${businessDraft.organizationId}`);
      if (approved.status !== 200 && approved.status !== 404)
        return failed(`승인된 사업 정보를 불러오지 못했습니다 (${approved.status}). 다시 시도해 주세요.`);
      setApprovedCatalog(approved.status === 200 ? approved.data as Catalog : null);
      const result = await requestJson("/v1/sites/draft");
      if (result.status === 404) { setNoSite(true); setAiJob(null); setLoadState("ready"); return true; }
      if (result.status !== 200) {
        setLoadState("failed");
        setStatus(`사이트 초안을 불러오지 못했습니다 (${result.status}). 다시 시도해 주세요.`);
        return false;
      }
      const value = result.data as SiteDraft;
      const position = resumedPosition(value, window.location.search);
      setStep(position.step); setActivePageId(position.pageId);
      setSite(value); setNoSite(false); setDirty(false); setSaveState("idle"); setConflictDraft(null);
      const live = await requestJson(`/v1/public/sites/${value.slug}`);
      if (live.status !== 200 && live.status !== 404)
        return failed(`공개 사이트 상태를 불러오지 못했습니다 (${live.status}). 다시 시도해 주세요.`);
      setVisibilityRestricted(live.status === 404 && (live.data as { error?: string }).error === "site_visibility_restricted");
      setPublishedRevision(live.status === 200 ? (live.data as { siteRevision: number }).siteRevision : null);
      setPublishedCatalogRevision(live.status === 200 ? (live.data as { catalogRevision: number }).catalogRevision : null);
      setSiteOrigin(live.status === 200 ? (live.data as { siteOrigin: string | null }).siteOrigin : null);
      const history = await requestJson("/v1/sites/releases");
      if (history.status !== 200)
        return failed(`공개 버전 목록을 불러오지 못했습니다 (${history.status}). 다시 시도해 주세요.`);
      setReleases((history.data as { releases: Release[] }).releases);
      const generation = await requestJson("/v1/sites/generation-jobs/latest");
      if (generation.status !== 200)
        return failed(`AI 제작 작업 상태를 불러오지 못했습니다 (${generation.status}). 다시 시도해 주세요.`);
      const job = (generation.data as { job: GenerationJob | null }).job;
      setAiJob(job);
      if (job) setAiPrompt(job.prompt);
      setLoadState("ready");
      return true;
    } catch {
      setLoadState("failed");
      setStatus("Field API에 연결할 수 없습니다. 다시 시도해 주세요.");
      return false;
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!site || loadState !== "ready") return;
    const url = new URL(window.location.href);
    url.searchParams.set("step", step);
    if (selectedPageId) url.searchParams.set("page", selectedPageId);
    else url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [site?.siteId, loadState, step, selectedPageId]);
  useEffect(() => {
    const connected = () => { setOnline(true); setSaveState(current => current === "failed" ? "idle" : current); };
    const disconnected = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => { window.removeEventListener("online", connected); window.removeEventListener("offline", disconnected); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (aiJob?.status !== "queued" && aiJob?.status !== "running") return;
    const timer = window.setInterval(() => {
      void requestJson("/v1/sites/generation-jobs/latest").then(result => {
        if (result.status === 200) setAiJob((result.data as { job: GenerationJob | null }).job);
      }).catch(() => setStatus("AI 작업 상태를 읽지 못했습니다. 초안과 입력은 유지됩니다."));
    }, 2000);
    return () => window.clearInterval(timer);
  }, [aiJob?.status]);
  useEffect(() => {
    if (aiJob?.status === "failed" && aiJob.errorCode === "media_layout_conflict")
      setStatus("현재 사진을 모두 보존할 페이지 또는 섹션 공간이 없어 AI 제안을 적용하지 않았습니다. 기존 초안과 공개 사이트는 유지됩니다.");
  }, [aiJob?.status, aiJob?.errorCode]);

  async function startSite() {
    setBusy(true); setStatus("사이트 초안을 만들고 있습니다.");
    try {
      const result = await requestJson("/v1/sites", "POST");
      if (result.status === 201) {
        setNoSite(false);
        if (await load()) setStatus("기본 주소와 초안이 만들어졌습니다. 디자인과 내용을 편집해 주세요.");
      }
      else setStatus(`사이트 초안을 만들지 못했습니다 (${result.status}).`);
    } catch { setStatus("사이트 생성 요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }
  const markEdited = () => {
    editSequence.current += 1;
    setDirty(true);
    setSaveState(current => current === "conflict" ? current : "idle");
  };
  const change = (patch: Partial<SiteDraft>) => { setSite(current => current ? { ...current, ...patch } : current); markEdited(); };
  const updatePage = (pageId: string, patch: Partial<SitePage>) => {
    if (site) change({ pages: site.pages.map(page => page.id === pageId ? { ...page, ...patch } : page) });
  };
  const updateSection = (pageId: string, sectionId: string, patch: Partial<SiteSection>) => {
    const page = site?.pages.find(item => item.id === pageId);
    if (page) updatePage(pageId, { sections: page.sections.map(section => section.id === sectionId ? { ...section, ...patch } : section) });
  };
  const assignPhoto = (pageId: string, sectionId: string, assetId: string) => {
    setSite(current => current ? { ...current, pages: current.pages.map(page => page.id === pageId
      ? { ...page, sections: page.sections.map(section => {
        if (section.id !== sectionId) return section;
        if (!assetId) {
          const rest = { ...section };
          delete rest.assetId;
          delete rest.alt;
          return rest;
        }
        return { ...section, assetId, alt: section.alt ?? "" };
      }) } : page) } : current);
    markEdited();
  };
  async function uploadPhoto(pageId: string, sectionId: string, file: File) {
    if (file.size > 8 * 1024 * 1024) { setStatus("사진은 파일당 8MB 이하로 선택해 주세요."); return; }
    setBusy(true); setUploadingSectionId(sectionId); setStatus("사진을 서버에 올리고 안전한 형식으로 변환하고 있습니다.");
    try {
      const response = await fetch("/v1/sites/assets", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/octet-stream" }, body: file });
      const data = await response.json().catch(() => ({})) as SiteAsset & { error?: string };
      if (response.status === 201) {
        setAssets(current => [data, ...current]);
        assignPhoto(pageId, sectionId, data.id);
        setStatus("사진이 서버 보관함에 저장됐습니다. 사진 설명을 입력하고 사이트 초안을 저장해 주세요.");
      } else if (response.status === 415) setStatus("이 사진을 읽거나 안전하게 변환하지 못했습니다. JPG·PNG·WebP 또는 지원되는 HEIC 파일로 다시 첨부해 주세요.");
      else if (response.status === 503) setStatus("사진 저장소에 연결할 수 없습니다. 현재 입력은 유지되며 다시 첨부할 수 있습니다.");
      else if (response.status === 429) setStatus("사진 보관 한도에 도달했습니다. 운영 지원이 필요합니다.");
      else setStatus(`사진 업로드에 실패했습니다 (${response.status}). 다시 첨부해 주세요.`);
    } catch { setStatus("사진 업로드 요청이 전달되지 않았습니다. 다시 첨부해 주세요."); }
    finally { setBusy(false); setUploadingSectionId(null); }
  }
  const save = useCallback(async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!site || saveInFlight.current) return;
    const invalidPage = pagePathError(site.pages);
    if (invalidPage) { setSaveState("failed"); setStatus(invalidPage); return; }
    if (site.pages.some(page => page.sections.some(section => section.assetId && !section.alt?.trim()))) {
      setSaveState("failed"); setStatus("사진이 연결된 섹션마다 사진 설명(alt)을 입력해 주세요."); return;
    }
    const snapshot = site;
    const sequence = editSequence.current;
    saveInFlight.current = true;
    setBusy(true); setSaveState("saving"); setStatus("초안을 저장하고 있습니다.");
    try {
      const result = await requestJson("/v1/sites/draft", "PUT", {
        expectedRevision: snapshot.revision, template: snapshot.template, palette: snapshot.palette, font: snapshot.font, pages: snapshot.pages,
      });
      let saved = result.status === 200 ? result.data as SiteDraft : null;
      if (result.status === 409) {
        const latest = await requestJson("/v1/sites/draft");
        if (latest.status === 200 && sameDraftContent(snapshot, latest.data as SiteDraft))
          saved = latest.data as SiteDraft;
        else if (latest.status === 200) {
          setConflictDraft(latest.data as SiteDraft);
          setSaveState("conflict");
          setStatus("다른 수정이 먼저 저장되었습니다. 현재 입력은 유지됩니다. 두 초안을 비교하고 적용할 버전을 선택해 주세요.");
          return;
        } else {
          setSaveState("failed");
          setStatus("최신 서버 초안을 확인하지 못했습니다. 현재 입력은 유지됩니다. 다시 시도해 주세요.");
          return;
        }
      }
      if (saved) {
        const hasNewerEdits = editSequence.current !== sequence;
        setSite(current => current ? hasNewerEdits ? { ...current, revision: saved.revision } : saved : current);
        setDirty(hasNewerEdits);
        setConflictDraft(null);
        setSaveState("idle");
        setStatus(hasNewerEdits
          ? `사이트 초안 ${saved.revision}번 저장 후 추가 입력을 다시 저장합니다.`
          : `사이트 초안 ${saved.revision}번이 저장되었습니다. 공개 상태는 바뀌지 않았습니다.`);
      } else {
        setSaveState("failed");
        setStatus(`저장에 실패했습니다 (${result.status}). 입력 내용은 이 화면에 남아 있습니다. 초안 저장으로 재시도해 주세요.`);
      }
    } catch {
      setSaveState("failed");
      setStatus("저장 요청이 전달되지 않았습니다. 입력 내용은 이 화면에 남아 있습니다. 초안 저장으로 재시도해 주세요.");
    } finally { saveInFlight.current = false; setBusy(false); }
  }, [site]);
  useEffect(() => {
    if (!site || !dirty || busy || !online || saveState !== "idle") return;
    const timer = window.setTimeout(() => { void save(); }, 1000);
    return () => window.clearTimeout(timer);
  }, [site, dirty, busy, online, saveState, save]);
  async function resolveConflict(useMine: boolean) {
    if (!site || !conflictDraft || busy) return;
    setBusy(true);
    try {
      const latest = await requestJson("/v1/sites/draft");
      if (latest.status !== 200) {
        setStatus("서버 최신 초안을 확인하지 못했습니다. 현재 입력을 유지합니다. 다시 시도해 주세요.");
        return;
      }
      const remote = latest.data as SiteDraft;
      if (remote.revision !== conflictDraft.revision || !sameDraftContent(remote, conflictDraft)) {
        setConflictDraft(remote);
        setStatus("서버 초안이 비교하는 동안 다시 바뀌었습니다. 새 서버 내용을 확인하고 선택해 주세요.");
        return;
      }
      if (useMine) {
        if (!window.confirm("서버 초안의 다른 변경을 현재 화면 내용으로 대체하고 다시 저장하시겠습니까?")) return;
        setSite(current => current ? { ...current, revision: remote.revision } : current);
        setDirty(true);
        setSaveState("idle");
        setStatus(`내 입력을 서버 ${remote.revision}번을 기준으로 다시 저장합니다. 다른 편집자의 변경은 대체됩니다.`);
      } else {
        if (!window.confirm("현재 화면의 미저장 입력을 버리고 서버 초안을 사용하시겠습니까?")) return;
        setSite(remote);
        setDirty(false);
        setSaveState("idle");
        setStatus(`서버 초안 ${remote.revision}번을 불러왔습니다. 공개 상태는 바뀌지 않았습니다.`);
      }
      setConflictDraft(null);
    } catch { setStatus("서버 초안을 다시 확인할 수 없습니다. 현재 입력은 유지됩니다."); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!site || dirty) return;
    setBusy(true); setStatus("공개 버전을 만들고 있습니다.");
    try {
      const result = await requestJson("/v1/sites/releases", "POST", { expectedRevision: site.revision });
      if (result.status === 200 || result.status === 201) {
        setPublishedRevision(site.revision);
        setPublishedCatalogRevision((result.data as { catalogRevision: number }).catalogRevision);
        const publicSite = await requestJson(`/v1/public/sites/${site.slug}`).catch(() => null);
        if (!publicSite || publicSite.status !== 200) {
          setLoadState("failed");
          setStatus("공개는 완료됐지만 상태를 다시 읽지 못했습니다. 다시 불러오기로 공개본을 확인해 주세요.");
          return;
        }
        setSiteOrigin((publicSite.data as { siteOrigin: string | null }).siteOrigin);
        const history = await requestJson("/v1/sites/releases").catch(() => null);
        if (!history || history.status !== 200) {
          setLoadState("failed");
          setStatus("공개는 완료됐지만 상태를 다시 읽지 못했습니다. 다시 불러오기로 공개본을 확인해 주세요.");
          return;
        }
        setReleases((history.data as { releases: Release[] }).releases);
        setStatus(`사이트 ${site.revision}번이 공개되었습니다. 카탈로그 ${(result.data as { catalogRevision: number }).catalogRevision}번을 사용합니다.`);
      } else if (result.status === 409) setStatus("초안 충돌 또는 승인된 사업 정보가 없어 공개하지 못했습니다.");
      else setStatus(`공개에 실패했습니다 (${result.status}).`);
    } catch {
      setLoadState("failed");
      setStatus("공개 요청 결과를 확인할 수 없습니다. 다시 불러오기로 서버의 공개 상태를 확인해 주세요.");
    }
    finally { setBusy(false); }
  }
  async function restore(releaseId: string) {
    if (!site || dirty) return;
    setBusy(true); setStatus("디자인 복구 중입니다.");
    try {
      const result = await requestJson("/v1/sites/restore", "POST", { releaseId, expectedRevision: site.revision });
      if (result.status === 200) {
        setSite(result.data as SiteDraft); setDirty(false);
        setStatus("과거 디자인을 새 초안으로 가져왔습니다. 가격과 예약 조건은 현재 카탈로그에 남아 있습니다. 다시 공개하려면 확인해 주세요.");
      } else setStatus(`디자인을 복구하지 못했습니다 (${result.status}).`);
    } catch { setStatus("디자인 복구 요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }
  async function generateSite() {
    if (!site || dirty || !approvedCatalog || !aiPrompt.trim()) return;
    setBusy(true); setStatus("AI 제작 작업을 접수하고 있습니다.");
    try {
      const result = await requestJson("/v1/sites/generation-jobs", "POST", { prompt: aiPrompt.trim(), expectedRevision: site.revision });
      if (result.status === 202) {
        setAiJob({ id: (result.data as { id: string }).id, status: "queued", prompt: aiPrompt.trim(), baseRevision: site.revision, catalogRevision: approvedCatalog.revision, proposal: null, inputTokens: null, outputTokens: null, costStatus: "pending", errorCode: null });
        setStatus("AI가 배치와 색을 제안하는 중입니다. 현재 초안은 그대로 유지됩니다.");
      } else if (result.status === 503 && (result.data as { error?: string }).error === "queue_unavailable") {
        const jobId = (result.data as { jobId?: string }).jobId;
        if (jobId) {
          setAiJob({ id: jobId, status: "queued", prompt: aiPrompt.trim(), baseRevision: site.revision, catalogRevision: approvedCatalog.revision, proposal: null, inputTokens: null, outputTokens: null, costStatus: "pending", errorCode: null });
          setStatus("작업은 서버에 저장됐지만 제작 큐에 연결할 수 없습니다. 복구 후 같은 작업이 전달됩니다. 새 작업을 중복 제출하지 마세요.");
        } else setStatus("제작 큐에 연결할 수 없습니다. 현재 초안은 유지됩니다.");
      } else if (result.status === 503) setStatus("제작 AI 공급사 설정이 없어 생성할 수 없습니다. 템플릿과 직접 편집은 사용할 수 있습니다.");
      else if (result.status === 409) setStatus("초안 또는 카탈로그가 바뀌었거나 진행 중인 작업이 있습니다. 상태를 다시 확인해 주세요.");
      else if (result.status === 429) setStatus("오늘의 AI 생성 한도에 도달했습니다. 템플릿과 직접 편집을 사용할 수 있습니다.");
      else setStatus(`AI 제작 작업을 접수하지 못했습니다 (${result.status}).`);
    } catch { setStatus("AI 제작 요청을 전달하지 못했습니다. 설명과 초안은 유지됩니다."); }
    finally { setBusy(false); }
  }
  async function cancelGeneration() {
    if (!aiJob) return;
    setBusy(true);
    try {
      const result = await requestJson(`/v1/sites/generation-jobs/${aiJob.id}/cancel`, "POST");
      if (result.status === 200) { setAiJob(result.data as GenerationJob); setStatus("AI 작업을 취소했습니다. 현재 초안은 그대로입니다."); }
      else setStatus(`작업을 취소하지 못했습니다 (${result.status}).`);
    } catch { setStatus("취소 요청을 전달하지 못했습니다. 작업 상태를 다시 확인해 주세요."); }
    finally { setBusy(false); }
  }
  async function applyGeneration() {
    if (!site || !aiJob || dirty) return;
    setBusy(true);
    try {
      const result = await requestJson(`/v1/sites/generation-jobs/${aiJob.id}/apply`, "POST");
      if (result.status === 200) {
        setSite({ ...site, ...result.data as SiteDraft }); setAiJob({ ...aiJob, status: "applied_to_draft" }); setDirty(false);
        setStatus("AI 제안을 새 초안에 반영했습니다. 공개 사이트는 바뀌지 않았습니다. 내용을 확인한 뒤 공개해 주세요.");
      } else if (result.status === 409) { setAiJob({ ...aiJob, status: "stale" }); setStatus("생성 이후 초안이나 승인 정보가 변경되었습니다. 최신 내용을 확인하고 다시 생성해 주세요."); }
      else setStatus(`AI 제안을 반영하지 못했습니다 (${result.status}).`);
    } catch { setStatus("AI 제안 반영 요청을 전달하지 못했습니다. 현재 초안은 유지됩니다."); }
    finally { setBusy(false); }
  }
  const currentPage = site?.pages.find(page => page.id === activePageId) ?? site?.pages[0];
  return <SiteEditorFrame step={step} mobileView={mobileView} navigation={loadState === "ready" && site && !noSite ? <nav className="state-switch" aria-label="사이트 제작 단계">{steps.map((item, index) => <button key={item.id} type="button" aria-current={step === item.id ? "step" : undefined} onClick={() => setStep(item.id)}>{step === "pages" ? item.label : <><b aria-hidden="true">{index + 1}</b><span>{item.label.slice(2)}</span></>}</button>)}</nav> : undefined}><div className="feature-heading"><p className="eyebrow">STEP {String(steps.findIndex(item => item.id === step) + 1).padStart(2, "0")} / 05</p><h1>{step === "design" ? "어떤 모습으로 시작할까요?" : step === "business" ? "어떤 일을 하고 계신가요?" : step === "contact" ? "고객과 어떻게 연결할까요?" : step === "publish" ? "고객을 맞이할 준비가 됐어요." : "내 사이트 편집"}</h1><p>초안 저장, 내용 확인, 실제 공개를 순서대로 진행합니다.</p></div>{status && <p role="status" className="state-message">{status}</p>}{loadState === "loading" && <p role="status">사이트 상태를 불러오는 중입니다.</p>}{loadState === "failed" && <button type="button" disabled={busy} onClick={() => void load()}>다시 불러오기</button>}{loadState === "needs_setup" && <p><a href="/workspace">사업 운영에서 계정·조직 설정 열기</a></p>}
    {loadState === "ready" && (noSite ? <section className="special-panel"><h2>빈 시작 화면</h2><p>사업 정보를 입력한 뒤 기본 주소와 사이트 초안을 만들 수 있습니다.</p><button type="button" disabled={busy} onClick={() => void startSite()}>사이트 시작하기</button></section> : site && <><p>기본 주소: <code>{site.slug}</code> · 사이트 저장본 {site.revision}번{dirty ? " · 미저장 변경" : ""} · {saveState === "saving" ? "서버 저장 중" : saveState === "conflict" ? "저장 충돌" : !online && dirty ? "오프라인 · 미저장" : saveState === "failed" ? "저장 실패" : dirty ? "자동 저장 대기" : "서버 저장 완료"} · 공개 {publishedRevision === null ? "전" : `${publishedRevision}번`}</p>
      {step === "business" && <section className="special-panel"><h2>1 사업 정보</h2><p>상호·서비스·가격·예약 방식은 사업 정보에서 관리합니다. 과거 디자인을 복구해도 현재 사업 정보는 유지됩니다.</p><p>현재 승인한 사업 정보: {approvedCatalog ? `${approvedCatalog.revision}번` : "없음"}</p><a href="/workspace?section=services&edit=business&returnTo=site" aria-disabled={dirty || busy} onClick={event => { if (dirty || busy) event.preventDefault(); }}>사업 정보 편집 열기</a>{(dirty || busy) && <p>사이트 변경 내용을 먼저 저장하고 저장 완료를 확인한 뒤 이동해 주세요.</p>}</section>}
      {step === "design" && <section className="special-panel"><h2>2 디자인 선택</h2><p>세 배치는 페이지 구성이 서로 다릅니다.</p><SiteTemplateCards template={site.template} businessName={catalog?.businessName ?? ""} onChange={template => change({ template })} /><div className="site-editor-design-controls"><label>강조 색상 <input type="color" value={site.palette} onChange={event => change({ palette: event.target.value })} /></label><SiteFontSelect font={site.font} onChange={font => change({ font })} /></div><div className="knowledge-source site-editor-ai"><h3>AI로 배치 제안받기</h3><p>AI는 승인된 사업 정보로 템플릿·색·페이지 구성을 제안합니다. 제안은 확인 후 초안에만 반영됩니다.</p><label>원하는 분위기와 구성<textarea value={aiPrompt} maxLength={1000} onChange={event => setAiPrompt(event.target.value)} placeholder="예: 따뜻한 분위기의 한 페이지 소개와 서비스 목록" /></label><button type="button" disabled={busy || dirty || !approvedCatalog || !aiPrompt.trim() || aiJob?.status === "queued" || aiJob?.status === "running" || aiJob?.status === "proposed"} onClick={() => void generateSite()}>AI 제안 생성</button>{dirty && <p>현재 변경을 먼저 저장한 뒤 생성해 주세요.</p>}{!approvedCatalog && <p>먼저 사업 정보를 승인해 주세요. 템플릿 편집은 계속할 수 있습니다.</p>}{aiJob && <div className="state-message" role="status"><strong>AI 작업: {aiJob.status === "queued" ? "대기" : aiJob.status === "running" ? "생성 중" : aiJob.status === "proposed" ? "제안 검토" : aiJob.status === "applied_to_draft" ? "초안 반영" : aiJob.status === "stale" ? "최신 초안과 충돌" : aiJob.status === "canceled" ? "취소" : "실패"}</strong>{aiJob.errorCode && <p>상태 코드: {aiJob.errorCode}</p>}{aiJob.inputTokens !== null && <p>모델 사용량: 입력 {aiJob.inputTokens}·출력 {aiJob.outputTokens} 토큰. 실제 비용은 공급사 정산 전입니다.</p>}{(["queued", "running", "proposed"] as const).includes(aiJob.status as "queued" | "running" | "proposed") && <button type="button" disabled={busy} onClick={() => void cancelGeneration()}>작업 취소</button>}{aiJob.status === "proposed" && aiJob.proposal && <><p>제안: {aiJob.proposal.template} · {aiJob.proposal.pages.length}개 페이지. 현재 초안은 아직 바뀌지 않았습니다.</p><SiteRenderer site={{ ...site, ...aiJob.proposal }} catalog={approvedCatalog ?? catalog!} preview /><button type="button" disabled={busy || dirty} onClick={() => void applyGeneration()}>검토한 제안을 초안에 반영</button></>}{(aiJob.status === "failed" || aiJob.status === "canceled" || aiJob.status === "stale") && <p>설명은 유지됩니다. 필요하면 새 작업을 만들거나 템플릿을 직접 편집하세요.</p>}</div>}</div></section>}
      {step === "pages" && <div className="editor-switch" role="group" aria-label="페이지 편집 화면"><button type="button" aria-pressed={mobileView === "edit"} onClick={() => setMobileView("edit")}>편집</button><button type="button" aria-pressed={mobileView === "preview"} onClick={() => setMobileView("preview")}>미리보기</button></div>}
      {step === "pages" && <section className="special-panel site-editor-inputs"><h2>3 페이지와 내용 편집</h2><p>소개 페이지는 최대 5개입니다. 문의 화면은 별도로 제공됩니다.</p><div className="deployment-options">{site.pages.map(page => <button key={page.id} type="button" aria-pressed={currentPage?.id === page.id} onClick={() => setActivePageId(page.id)}>{page.title}</button>)}<button type="button" disabled={site.pages.length >= 5} onClick={() => { let next = site.pages.length + 1; while (site.pages.some(existing => existing.slug === `page-${next}`)) next += 1; const page = { id: crypto.randomUUID(), slug: `page-${next}`, title: `페이지 ${next}`, sections: [] }; change({ pages: [...site.pages, page] }); setActivePageId(page.id); }}>페이지 추가</button></div>{currentPage && <div className="knowledge-source"><label>페이지 이름<input value={currentPage.title} maxLength={100} onChange={event => updatePage(currentPage.id, { title: event.target.value })} /></label><label>페이지 주소 경로<input value={currentPage.slug} readOnly={currentPage.slug === "home"} pattern="[a-z0-9][a-z0-9-]{0,39}" maxLength={40} onChange={event => updatePage(currentPage.id, { slug: event.target.value })} /></label>{currentPage.slug !== "home" && <button type="button" onClick={() => { change({ pages: site.pages.filter(page => page.id !== currentPage.id) }); setActivePageId(null); }}>페이지 삭제</button>}<h3>섹션</h3>{currentPage.sections.map((section, index) => <div key={section.id} className="knowledge-source" role="group" aria-label={`${index + 1}번 섹션`}><label>구성<select value={section.kind} onChange={event => updateSection(currentPage.id, section.id, { kind: event.target.value as SiteSection["kind"] })}>{kinds.map(kind => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</select></label><label>제목<input value={section.heading} maxLength={200} onChange={event => updateSection(currentPage.id, section.id, { heading: event.target.value })} /></label><label>본문<textarea value={section.body} maxLength={5000} onChange={event => updateSection(currentPage.id, section.id, { body: event.target.value })} /></label><div className="site-photo-controls"><h4>섹션 사진</h4><label>서버 사진 보관함<select value={section.assetId ?? ""} disabled={busy} onChange={event => assignPhoto(currentPage.id, section.id, event.target.value)}><option value="">사진 없음</option>{assets.map((asset, assetIndex) => <option key={asset.id} value={asset.id}>사진 {assets.length - assetIndex} · {asset.width}×{asset.height} · 서버 저장 완료</option>)}</select></label><label>새 사진 업로드<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void uploadPhoto(currentPage.id, section.id, file); }} /></label>{uploadingSectionId === section.id && <p role="status">사진을 변환해 저장하고 있습니다.</p>}{section.assetId && <><img className="site-editor-photo-preview" src={`/v1/sites/assets/${section.assetId}`} alt={section.alt ?? ""} /><label>사진 설명(alt)<input required maxLength={300} value={section.alt ?? ""} onChange={event => updateSection(currentPage.id, section.id, { alt: event.target.value })} placeholder="사진에 보이는 내용을 구체적으로 적어 주세요" /></label><button type="button" disabled={busy} onClick={() => assignPhoto(currentPage.id, section.id, "")}>이 섹션에서 사진 빼기</button><p>초안에서 빼도 이미 공개된 사진은 새 공개본으로 교체할 때까지 유지됩니다.</p></>}</div><div className="preview-action"><button type="button" aria-label={`${index + 1}번 섹션 위로 이동`} disabled={index === 0} onClick={() => { const next = [...currentPage.sections]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; updatePage(currentPage.id, { sections: next }); }}>위로</button><button type="button" aria-label={`${index + 1}번 섹션 아래로 이동`} disabled={index === currentPage.sections.length - 1} onClick={() => { const next = [...currentPage.sections]; [next[index + 1], next[index]] = [next[index]!, next[index + 1]!]; updatePage(currentPage.id, { sections: next }); }}>아래로</button><button type="button" aria-label={`${index + 1}번 섹션 삭제`} onClick={() => updatePage(currentPage.id, { sections: currentPage.sections.filter(item => item.id !== section.id) })}>섹션 삭제</button></div></div>)}<button type="button" disabled={currentPage.sections.length >= 20} onClick={() => updatePage(currentPage.id, { sections: [...currentPage.sections, { id: crypto.randomUUID(), kind: "text", heading: "", body: "" }] })}>섹션 추가</button></div>}</section>}
      {step === "contact" && <section className="special-panel"><h2>4 연락·예약</h2><p>고객은 Field 직접 문의를 사용할 수 있습니다. 승인된 카탈로그의 서비스별 예약 방식은 유지됩니다.</p>{approvedCatalog ? <><p>승인된 기본 방식: {approvedCatalog.defaultBookingMode === "slot" ? "시간표 선택" : "희망 시간 제출"}. 아래는 서비스별로 확정된 방식입니다.</p><ul>{approvedCatalog.services.map(service => <li key={service.id}>{service.name} · {service.bookingMode === "slot" ? "시간표 선택" : "희망 시간 제출"}</li>)}</ul></> : <p>먼저 사업 정보와 서비스를 승인해 주세요.</p>}<p>고객이 직접 문의·예약 요청을 남길 수 있고, 사업자가 관리실에서 최종 확정합니다.</p></section>}
      {step === "publish" && <section className="special-panel">
        <h2>5 확인·공개</h2>
        <p>초안과 카탈로그를 확인한 뒤 사이트 버전을 공개합니다. 다른 제품과 연결하지 않아도 공개할 수 있습니다.</p>
        <p>승인한 사업 정보: {approvedCatalog ? `${approvedCatalog.revision}번` : "없음"}</p>
        {approvedCatalog && publishedCatalogRevision !== null && approvedCatalog.revision > publishedCatalogRevision && <div className="state-message" role="status"><strong>공개 사이트의 사업 정보가 오래되었습니다.</strong><p>새로 승인한 사업 정보 {approvedCatalog.revision}번을 반영하려면 사이트 초안을 다시 저장하고 공개해 주세요.</p><button type="button" disabled={busy || dirty} onClick={() => void save()}>카탈로그 반영용 초안 저장</button></div>}
        {visibilityRestricted && <p role="status">사이트 공개가 제한되었습니다. 초안과 이전 공개 버전·기존 문의·예약은 유지됩니다. <a href="/workspace/moderation">신고·검토 결과와 이의 제출</a>을 확인해 주세요.</p>}
        <button type="button" disabled={visibilityRestricted || busy || dirty || !approvedCatalog || site.revision === 0 || publishedRevision === site.revision} onClick={() => void publish()}>현재 초안 공개</button>
        {publishGuidance && <p role="status">{publishGuidance.reason} {publishGuidance.href && <a href={publishGuidance.href} aria-disabled={dirty || busy} onClick={event => { if (dirty || busy) event.preventDefault(); }}>{publishGuidance.label}</a>}{!publishGuidance.href && (dirty || site.revision === 0 || (publishedRevision === site.revision && publishedCatalogRevision !== null && approvedCatalog && approvedCatalog.revision > publishedCatalogRevision)) && <button type="button" disabled={busy || saveState === "conflict"} onClick={() => void save()}>사이트 초안 저장하기(추가)</button>}</p>}
        {inquiryTestGuidance && <p>{inquiryTestGuidance.href ? <a href={inquiryTestGuidance.href} aria-label="첫 문의 미리 해보기(추가)">첫 문의 미리 해보기(추가)</a> : <button type="button" disabled>첫 문의 미리 해보기(추가)</button>} {inquiryTestGuidance.reason ?? "현재 공개된 사이트로만 내부 테스트 문의를 남깁니다. 실제 고객 알림·실적·예약에는 포함되지 않습니다. 공개 버전마다 한 번만 기록됩니다."}</p>}
        {publishedRevision !== null && siteOrigin && <section className="knowledge-source" role="region" aria-label={siteOrigin.endsWith(".localhost:3002") ? "사이트 개설 완료" : "사이트 공개본 확인"}>
          <h3>{siteOrigin.endsWith(".localhost:3002") ? "로컬 사이트 개설 완료" : "사이트 공개본 생성"}</h3>
          <p>서버에서 사이트 {publishedRevision}번과 고객 주소를 확인했습니다.</p>
          <p>공개 주소: <code style={{ overflowWrap: "anywhere" }}>{siteOrigin}/site/{site.slug}</code></p>
          <p><a href={`${siteOrigin}/site/${site.slug}`}>공개 사이트 열기</a></p>
          <p><a href={`${siteOrigin}/public/${catalog!.organizationId}`}>고객 문의 화면 확인</a></p>
          <p>실제 문의를 제출하면 접수로 기록됩니다. 화면과 이동 경로를 먼저 확인해 주세요.</p>
          <div className="preview-action"><a href="/workspace">사업 운영으로 이동</a><a href="/workspace/integrations">AP 연결 선택하기</a></div>
          <p>AP 연결은 선택입니다. Field 직접 문의와 예약은 별도로 동작합니다.</p>
          {!siteOrigin.endsWith(".localhost:3002") && <p>도메인과 TLS의 실제 운영 검증은 별도로 완료해야 합니다.</p>}
        </section>}
        {publishedRevision !== null && !siteOrigin && <div className="state-message" role="status"><p>공개본은 있지만 고객 주소를 확인하지 못했습니다. 도메인 설정을 확인하고 다시 불러와 주세요.</p><button type="button" disabled={busy} onClick={() => void load()}>공개 주소 다시 확인</button></div>}
        <h3>과거 공개 버전</h3>
        {releases.length ? <ul>{releases.map(release => <li key={release.id}>사이트 {release.revision}번 · 카탈로그 {release.catalog_revision}번 <button type="button" disabled={busy || dirty} onClick={() => void restore(release.id)}>디자인을 새 초안으로 가져오기</button></li>)}</ul> : <p>아직 공개 버전이 없습니다.</p>}
      </section>}
      {saveState === "conflict" && conflictDraft && <section className="special-panel" aria-label="사이트 초안 저장 충돌"><h2>서버 초안과 저장 충돌</h2><p>서버 {conflictDraft.revision}번과 현재 화면의 미저장 입력을 비교해 주세요. 공개 사이트는 바뀌지 않았습니다.</p><details><summary>서버에 저장된 초안 보기</summary><SiteRenderer site={conflictDraft} catalog={approvedCatalog ?? catalog!} preview /></details><div className="preview-action"><button type="button" disabled={busy || !online} onClick={() => void resolveConflict(true)}>내 입력으로 다시 저장</button><button type="button" disabled={busy || !online} onClick={() => void resolveConflict(false)}>서버 초안 사용</button></div><p>내 입력을 선택하면 서버 초안의 변경을 대체합니다. 현재 화면 입력은 아래 미리보기에서 확인할 수 있습니다.</p></section>}
      <div className="preview-action"><button type="button" disabled={busy || saveState === "conflict"} onClick={() => void save()}>초안 저장</button><p>미저장 변경은 공개되지 않습니다.</p></div><section className="special-panel site-editor-preview"><h2>현재 초안 미리보기</h2><p>이 미리보기는 공개되지 않은 내용을 포함합니다. 실제 공개 화면은 공개 링크에서 확인합니다.</p><SiteRenderer site={site} catalog={approvedCatalog ?? catalog!} preview selectedPreviewPageId={currentPage?.id} onPreviewPageChange={setActivePageId} /></section>
    </>)}
  </SiteEditorFrame>;
}
