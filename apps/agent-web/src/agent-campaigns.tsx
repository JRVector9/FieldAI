"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { DistributionMetricsPanel } from "./distribution-metrics-panel";
import { DELETION_SCHEDULED_OWNER_MESSAGE, isDeletionScheduledError } from "./deletion-scheduled-copy";
import "./agent-campaigns.css";

type Card = { businessName: string; serviceName: string; description: string; advertisementLabel: "광고"; ctaLabel: "상담하기" };
type Source = { knowledgeReleaseId: string | null; revision?: number; businessName?: string;
  services: { name: string; description: string }[] };
type Campaign = { id: string; name: string; draftRevision: number; knowledgeReleaseId: string;
  serviceIndex: number; state: string; currentReleaseId: string | null };
type Detail = Campaign & { draftCard: Card | null; currentCard: Card | null; exposure: string };
type PlacementSlot = { id: string; publisherName: string; name: string; format: "article" | "sidebar"; origin: string };
type Placement = { id: string; campaignId: string; releaseId: string; slotId: string; publisherName: string; slotName: string;
  state: string; available: boolean; installed: boolean; decisionReason: string | null };

async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

function CardPreview({ card, label }: { card: Card; label: string }) {
  return <article className="campaign-preview" aria-label={label}>
    <div className="campaign-preview-top"><strong>{card.advertisementLabel}</strong><span>{card.businessName}</span></div>
    <div className="campaign-preview-body"><p className="campaign-preview-kicker">SERVICE</p><h3>{card.serviceName}</h3>
      <p>{card.description}</p><span className="campaign-preview-cta">{card.ctaLabel} →</span></div>
  </article>;
}

export function AgentCampaigns() {
  const [source, setSource] = useState<Source | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [placementSlots, setPlacementSlots] = useState<PlacementSlot[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [name, setName] = useState("");
  const [serviceIndex, setServiceIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("승인 정보와 홍보 카드 목록을 불러오는 중입니다.");
  const pendingApproval = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const pendingPlacement = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  const load = useCallback(async (id?: string | null) => {
    const [sources, list, slots, placed] = await Promise.all([
      api("/v1/campaigns/sources"), api("/v1/campaigns"), api("/v1/placement-slots"), api("/v1/placements"),
    ]);
    if (sources.status !== 200 || list.status !== 200) {
      setNotice(sources.status === 401 || sources.status === 404
        ? "AP에 로그인하고 사업 조직을 만든 뒤 홍보 카드를 관리할 수 있습니다."
        : `카드 목록을 불러오지 못했습니다 (${list.status}).`);
      return;
    }
    const nextSource = sources.data as Source;
    const nextCampaigns = (list.data as { campaigns: Campaign[] }).campaigns;
    setSource(nextSource); setCampaigns(nextCampaigns);
    setPlacementSlots(slots.status === 200 ? (slots.data as { slots: PlacementSlot[] }).slots : []);
    setPlacements(placed.status === 200 ? (placed.data as { placements: Placement[] }).placements : []);
    if (slots.status === 200) {
      const values = (slots.data as { slots: PlacementSlot[] }).slots;
      setSelectedSlotId(current => values.some(item => item.id === current) ? current : values[0]?.id ?? "");
    }
    const target = id === undefined ? nextCampaigns[0]?.id ?? null : id;
    setSelectedId(target);
    if (!target) { setDetail(null); setName(""); setServiceIndex(0); setDirty(false); setNotice(""); return; }
    const opened = await api(`/v1/campaigns/${target}`);
    if (opened.status !== 200) { setNotice("선택한 카드를 열지 못했습니다."); return; }
    const value = opened.data as Detail;
    setDetail(value); setName(value.name); setServiceIndex(value.serviceIndex);
    setDirty(false); setConfirmed(false); setNotice("");
  }, []);

  useEffect(() => { void load().catch(() => setNotice("AP 서버에 연결하지 못했습니다.")); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source?.knowledgeReleaseId) return;
    setBusy(true);
    try {
      const created = await api("/v1/campaigns", "POST", { name: name.trim(), knowledgeReleaseId: source.knowledgeReleaseId, serviceIndex });
      if (created.status === 201) {
        await load((created.data as { id: string }).id);
        setNotice("카드 초안을 만들었습니다. 고객에게는 아직 공개되지 않습니다.");
      } else setNotice(isDeletionScheduledError(created.status, created.data) ? DELETION_SCHEDULED_OWNER_MESSAGE
        : created.status === 409 ? "승인 정보가 변경되었습니다. 목록을 새로고침해 주세요." : `카드를 만들지 못했습니다 (${created.status}).`);
    } catch { setNotice("카드 생성 요청의 응답을 받지 못했습니다. 목록을 확인해 주세요."); }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !source?.knowledgeReleaseId) return;
    setBusy(true);
    try {
      const saved = await api(`/v1/campaigns/${detail.id}/draft`, "PUT", {
        expectedRevision: detail.draftRevision, name: name.trim(),
        knowledgeReleaseId: source.knowledgeReleaseId, serviceIndex,
      });
      if (saved.status === 200) { await load(detail.id); setNotice("초안을 저장했습니다. 현재 공개 카드에는 아직 반영되지 않습니다."); }
      else setNotice(saved.status === 409 ? "다른 수정이나 승인 정보 변경이 있습니다. 새로고침해 확인해 주세요." : `초안을 저장하지 못했습니다 (${saved.status}).`);
    } catch { setNotice("저장 응답을 받지 못했습니다. 현재 입력을 유지하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  async function publish() {
    if (!detail || dirty || !confirmed) return;
    const fingerprint = `${detail.id}:${detail.draftRevision}`;
    if (pendingApproval.current?.fingerprint !== fingerprint)
      pendingApproval.current = { fingerprint, idempotencyKey: crypto.randomUUID() };
    setBusy(true);
    try {
      const result = await api(`/v1/campaigns/${detail.id}/releases`, "POST", {
        expectedRevision: detail.draftRevision, idempotencyKey: pendingApproval.current.idempotencyKey,
        confirmApprovedFacts: true,
      });
      if (result.status === 201 || result.status === 200) {
        pendingApproval.current = null;
        await load(detail.id);
        setNotice(result.status === 200 ? "앞서 승인한 카드 버전을 확인했습니다." : "사업자가 승인한 카드 버전을 공개했습니다. 매체 배치는 별도 승인이 필요합니다.");
      } else setNotice(isDeletionScheduledError(result.status, result.data) ? DELETION_SCHEDULED_OWNER_MESSAGE
        : result.status === 409 ? "초안 버전이나 승인 정보가 변경되어 공개하지 못했습니다." : `공개하지 못했습니다 (${result.status}).`);
    } catch { setNotice("공개 요청의 응답을 받지 못했습니다. 같은 버튼으로 재시도하면 기존 승인 결과를 확인합니다."); }
    finally { setBusy(false); }
  }

  async function changeState(action: "pause" | "resume") {
    if (!detail?.currentReleaseId) return;
    setBusy(true);
    try {
      const result = await api(`/v1/campaigns/${detail.id}/${action}`, "POST", { expectedReleaseId: detail.currentReleaseId });
      if (result.status === 200) { await load(detail.id); setNotice(action === "pause" ? "카드 공개를 중지했습니다." : "현재 승인 버전을 다시 공개했습니다."); }
      else setNotice(isDeletionScheduledError(result.status, result.data) ? DELETION_SCHEDULED_OWNER_MESSAGE
        : result.status === 409 ? "카드 버전이나 승인 정보가 바뀌었습니다. 다시 확인해 주세요." : `상태를 변경하지 못했습니다 (${result.status}).`);
    } catch { setNotice("상태 변경 요청의 응답을 받지 못했습니다. 현재 상태를 새로고침해 주세요."); }
    finally { setBusy(false); }
  }

  async function requestPlacement() {
    if (!detail?.currentReleaseId || !selectedSlotId || detail.state !== "published" || detail.exposure !== "public") return;
    const fingerprint = `${detail.id}:${detail.currentReleaseId}:${selectedSlotId}`;
    if (pendingPlacement.current?.fingerprint !== fingerprint)
      pendingPlacement.current = { fingerprint, idempotencyKey: crypto.randomUUID() };
    setBusy(true);
    try {
      const result = await api("/v1/placements", "POST", {
        campaignId: detail.id, releaseId: detail.currentReleaseId, slotId: selectedSlotId,
        idempotencyKey: pendingPlacement.current.idempotencyKey,
      });
      if (result.status === 201 || result.status === 200) {
        pendingPlacement.current = null;
        await load(detail.id);
        setNotice(result.status === 201 ? "배치를 요청했습니다. 매체가 이 카드 버전을 확인해야 노출됩니다." : "이미 접수된 배치를 확인했습니다.");
      } else setNotice(isDeletionScheduledError(result.status, result.data) ? DELETION_SCHEDULED_OWNER_MESSAGE
        : result.status === 409 ? "카드·위치 상태가 변경됐습니다. 새로고침 후 다시 확인해 주세요." : `배치를 요청하지 못했습니다 (${result.status}).`);
    } catch { setNotice("배치 요청의 응답을 받지 못했습니다. 같은 위치에서 재시도하면 기존 요청을 확인합니다."); }
    finally { setBusy(false); }
  }

  async function cancelPlacement(id: string) {
    setBusy(true);
    try {
      const result = await api(`/v1/placements/${id}/cancel`, "POST");
      if (result.status === 200) { await load(detail?.id); setNotice("배치를 취소했습니다. 공개 카드 노출이 중지됩니다."); }
      else setNotice(result.status === 409 ? "배치 상태가 변경됐습니다. 새로고침해 주세요." : `배치를 취소하지 못했습니다 (${result.status}).`);
    } catch { setNotice("취소 요청의 응답을 받지 못했습니다. 목록을 새로고침해 주세요."); }
    finally { setBusy(false); }
  }

  const liveDraftCard = source?.knowledgeReleaseId && source.services[serviceIndex]?.description.trim()
    ? { businessName: source.businessName ?? "", serviceName: source.services[serviceIndex].name,
      description: source.services[serviceIndex].description, advertisementLabel: "광고" as const, ctaLabel: "상담하기" as const }
    : null;
  const needsSourceRefresh = !!detail && detail.knowledgeReleaseId !== source?.knowledgeReleaseId;
  const shownDraft = dirty || needsSourceRefresh ? liveDraftCard : detail?.draftCard ?? null;
  const canPublish = !!detail && !dirty && detail.knowledgeReleaseId === source?.knowledgeReleaseId
    && !!shownDraft && confirmed && !busy
    && !(detail.state === "published" && detail.currentCard?.serviceName === shownDraft.serviceName
      && detail.currentCard.description === shownDraft.description);
  const shownPlacements = placements.filter(item => item.campaignId === detail?.id);
  const selectedSlot = placementSlots.find(item => item.id === selectedSlotId);
  const alreadyPlaced = shownPlacements.some(item => item.releaseId === detail?.currentReleaseId && item.slotId === selectedSlotId);

  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Agent Platform" /></a>
    <nav aria-label="작업 메뉴"><a href="/workspace">사업 정보</a><a href="/workspace/ai">AI 설정</a><a href="/workspace/deployments">상담 배포</a><a href="/publisher">매체 관리</a></nav></header>
    <main className="feature-section"><div className="feature-heading"><p className="eyebrow">Agent Platform · 홍보 카드</p><h1>승인한 정보로 홍보 카드를 만드세요</h1>
      <p>카드 문구는 승인된 서비스에서 가져옵니다. 초안, 사업자 공개, 매체 배치 승인은 각각 별개입니다.</p></div>
      {notice && <p role="status" className="state-message">{notice}</p>}
      <div className="special-grid"><section className="special-panel"><div className="panel-heading"><h2>내 카드</h2><button type="button" disabled={busy} onClick={() => void load(selectedId).catch(() => setNotice("목록을 새로고침하지 못했습니다."))}>새로고침</button></div>
        {!source?.knowledgeReleaseId ? <p>먼저 <a href="/workspace">사업 정보와 서비스를 승인</a>해 주세요.</p> : <p>승인 지식 {source.revision}번 · 서비스 {source.services.length}개</p>}
        {campaigns.length ? <div className="campaign-list">{campaigns.map(item => <button key={item.id} type="button" aria-current={selectedId === item.id ? "true" : undefined}
          onClick={() => void load(item.id).catch(() => setNotice("카드를 열지 못했습니다."))}><strong>{item.name}</strong><span>{item.state === "published" ? "공개" : item.state === "paused" ? "중지" : "초안"} · 초안 v{item.draftRevision}</span></button>)}</div>
          : <p>만든 카드가 없습니다. 아래에서 첫 초안을 만드세요.</p>}
        {source?.knowledgeReleaseId && source.services.length > 0 && <button type="button" disabled={busy} onClick={() => { setSelectedId(null); setDetail(null); setName(""); setServiceIndex(0); setDirty(false); setConfirmed(false); }}>새 카드 초안</button>}
      </section>
      <section className="special-panel"><h2>{detail ? "카드 초안 편집" : "새 카드 초안"}</h2>
        {!source?.services.length ? <p>승인한 서비스에 설명을 입력하면 카드를 만들 수 있습니다.</p>
          : <form className="form-fields" onSubmit={detail ? event => void save(event) : event => void create(event)}>
            <label>관리용 카드 이름<input value={name} required maxLength={160} onChange={event => { setName(event.target.value); setDirty(true); }} /></label>
            <label>홍보할 승인 서비스<select value={serviceIndex} onChange={event => { setServiceIndex(Number(event.target.value)); setDirty(true); }}>
              {source.services.map((service, index) => <option key={`${index}-${service.name}`} value={index} disabled={!service.description.trim()}>{service.name}{!service.description.trim() ? " · 설명 필요" : ""}</option>)}</select></label>
            <p>문구를 바꾸려면 <a href="/workspace">사업 정보</a>에서 서비스를 수정하고 새 지식 버전을 승인하세요. 확인되지 않은 가격·자격·후기는 카드에 추가할 수 없습니다.</p>
            <button type="submit" disabled={busy || !name.trim() || !source.services[serviceIndex]?.description.trim() || (!!detail && !dirty && !needsSourceRefresh)}>{detail ? needsSourceRefresh ? "최신 승인 정보로 초안 저장" : "초안 저장" : "초안 만들기"}</button>
            {/* 카드 이름이 비어 버튼이 비활성일 때 사유를 표시한다 */}
            {!name.trim() && <p>관리용 카드 이름을 입력하면 초안을 만들 수 있습니다.</p>}
          </form>}
      </section></div>
      {(detail || shownDraft) && <div className="special-grid campaign-review"><section className="special-panel"><div className="panel-heading"><h2>초안 미리보기</h2><span>{dirty ? "저장 전 변경" : `초안 v${detail?.draftRevision ?? 1}`}</span></div>
        {shownDraft ? <CardPreview card={shownDraft} label="홍보 카드 초안" /> : <p>최신 승인 서비스를 다시 선택해 주세요.</p>}
        <p>미리보기는 공개 카드와 매체의 기존 승인에 영향을 주지 않습니다.</p></section>
        <section className="special-panel"><h2>공개 상태</h2><p>{detail?.exposure === "stale_source" ? "승인 정보 변경으로 노출 보류" : detail?.state === "published" ? "사업자 공개 중" : detail?.state === "paused" ? "공개 중지" : "공개 전"}</p>
          {detail?.currentCard && <><CardPreview card={detail.currentCard} label="현재 승인 카드" /><p>승인 버전 ID: <code>{detail.currentReleaseId}</code></p>
            {detail.exposure === "public" && <p><a href={`/cards/${detail.id}`}>공개 카드 열기</a></p>}</>}
          {detail && <><label className="campaign-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
            <span>현재 초안의 서비스명·설명이 승인된 지식과 같은지 확인하고 공개에 동의합니다.</span></label>
            <div className="campaign-actions"><button type="button" disabled={!canPublish} onClick={() => void publish()}>현재 초안 승인·공개</button>
              {detail.currentReleaseId && (detail.state === "published"
                ? <button type="button" disabled={busy} onClick={() => void changeState("pause")}>공개 중지</button>
                : <button type="button" disabled={busy || detail.exposure === "stale_source"} onClick={() => void changeState("resume")}>기존 버전 재공개</button>)}</div>
            {dirty && <p>변경 내용을 저장해야 공개할 수 있습니다.</p>}
            {needsSourceRefresh && <p>새 승인 정보가 있습니다. 서비스를 확인하고 초안을 다시 저장하세요.</p>}
            <p>외부 매체에 게재하려면 카드 버전별 별도 배치 승인이 필요합니다.</p></>}
        </section></div>}
      {detail && <section className="special-panel campaign-placements"><div className="panel-heading"><h2>매체 배치</h2><span>카드 버전별 승인</span></div>
        <p>사업자 공개 뒤 위치를 골라 요청하세요. 매체 owner가 화면의 카드 문구와 버전을 확인해 승인해야 노출됩니다.</p>
        <div className="campaign-placement-form"><label>활성 광고 위치<select value={selectedSlotId} onChange={event => setSelectedSlotId(event.target.value)}>
          {placementSlots.length === 0 && <option value="">등록된 활성 위치 없음</option>}
          {placementSlots.map(item => <option key={item.id} value={item.id}>{item.publisherName} · {item.name} ({item.format === "article" ? "기사" : "사이드바"})</option>)}
        </select></label><button type="button" disabled={busy || !selectedSlot || !detail.currentReleaseId || detail.state !== "published" || detail.exposure !== "public" || alreadyPlaced}
          onClick={() => void requestPlacement()}>이 버전 배치 요청</button></div>
        {selectedSlot && <p>선택한 매체: {selectedSlot.origin}. 공개 조건이 바뀌면 승인된 배치도 자동으로 숨겨집니다.</p>}
        {alreadyPlaced && <p>현재 카드 버전과 위치의 요청이 이미 있습니다. 취소한 배치를 다시 올리려면 새 카드 버전이 필요합니다.</p>}
        {detail.state !== "published" && <p>먼저 이 카드를 사업자 공개 상태로 전환해 주세요.</p>}
        {detail.exposure === "stale_source" && <p>승인 정보가 바뀌었습니다. 새 카드 버전을 승인해야 요청할 수 있습니다.</p>}
        {shownPlacements.length === 0 ? <p>요청한 배치가 없습니다.</p> : <div className="campaign-placement-list">{shownPlacements.map(item =>
          <article key={item.id} className="campaign-placement-item"><div className="panel-heading"><h3>{item.publisherName} · {item.slotName}</h3>
            <span>{item.state === "requested" ? "매체 검토 대기" : item.state === "approved" ? item.installed ? "설치 코드 발급" : item.available ? "매체 설치 대기" : "노출 보류" :
              item.state === "rejected" ? "거절" : item.state === "suspended" ? "매체 중지" : "취소"}</span></div>
            <p>카드 버전: <code>{item.releaseId}</code></p>{item.decisionReason && <p>매체 사유: {item.decisionReason}</p>}
            {item.available && <p><a href={`/placements/${item.id}`}>매체 승인 카드 열기</a></p>}
            {(item.state === "requested" || item.state === "approved" || item.state === "suspended") &&
              <button type="button" disabled={busy} onClick={() => void cancelPlacement(item.id)}>배치 취소</button>}</article>)}</div>}
      </section>}
      {source?.knowledgeReleaseId && <DistributionMetricsPanel endpoint="/v1/distribution/metrics" />}
    </main></div>;
}

export function PublicCampaignCard({ id }: { id: string }) {
  const [card, setCard] = useState<(Card & { organizationId: string }) | null>(null);
  const [status, setStatus] = useState("카드를 확인하는 중입니다.");
  useEffect(() => { void api(`/v1/public/campaigns/${id}`).then(result => {
    if (result.status === 200) { setCard(result.data as Card & { organizationId: string }); setStatus(""); }
    else setStatus("이 카드는 공개되지 않았거나 승인 정보가 변경되어 표시할 수 없습니다.");
  }).catch(() => setStatus("카드를 불러오지 못했습니다.")); }, [id]);
  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Agent Platform" /></a></header>
    <main className="feature-section"><div className="feature-heading"><p className="eyebrow">Agent Platform · 홍보</p><h1>사업자 서비스 안내</h1></div>
      {card ? <><CardPreview card={card} label="공개 홍보 카드" /><p className="campaign-public-note">광고 · 사업자 승인 정보에 기반한 안내입니다. 상담 요청은 사업자에게 전달됩니다.</p>
        <a className="campaign-public-link" href={`/public/${card.organizationId}`}>사업자에게 문의하기</a></>
        : <p role="status" className="state-message">{status}</p>}
    </main></div>;
}

export function PublicPlacementCard({ id }: { id: string }) {
  const [card, setCard] = useState<(Card & { publisherName: string; ctaPath: string | null }) | null>(null);
  const [status, setStatus] = useState("매체 승인 카드를 확인하는 중입니다.");
  useEffect(() => { void api(`/v1/public/placements/${id}`).then(result => {
    if (result.status === 200) { setCard(result.data as Card & { publisherName: string; ctaPath: string | null }); setStatus(""); }
    else setStatus("이 배치는 승인되지 않았거나 현재 공개 조건이 맞지 않아 표시할 수 없습니다.");
  }).catch(() => setStatus("배치 카드를 불러오지 못했습니다.")); }, [id]);
  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Agent Platform" /></a></header>
    <main className="feature-section"><div className="feature-heading"><p className="eyebrow">Agent Platform · 매체 승인 카드</p>
      <h1>사업자 서비스 안내</h1><p>매체: {card?.publisherName ?? "확인 중"}</p></div>
      {card ? <><CardPreview card={card} label="매체 승인 홍보 카드" /><p className="campaign-public-note">광고 · 사업자가 공개하고 매체가 정확한 버전을 승인한 안내입니다.</p>
        {card.ctaPath ? <a className="campaign-public-link" href={card.ctaPath}>사업자에게 문의하기</a>
          : <p>매체가 상담 연결 코드를 설치하면 문의할 수 있습니다.</p>}</>
        : <p role="status" className="state-message">{status}</p>}
    </main></div>;
}
