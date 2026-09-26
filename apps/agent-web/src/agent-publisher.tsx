"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { DistributionMetricsPanel } from "./distribution-metrics-panel";
import "./agent-publisher.css";

type Publisher = { id: string; name: string; role: "owner" | "editor" | "viewer" };
type Domain = { id: string; origin: string; verificationProof: string; verifiedAt: string | null; verifiedUntil: string | null };
type Slot = { id: string; domainId: string; domainOrigin: string; name: string; format: "article" | "sidebar";
  state: "active" | "paused"; domainVerifiedUntil: string | null; available: boolean };
type Placement = { id: string; campaignName: string; releaseId: string; contentHash: string;
  card: { advertisementLabel: "광고"; businessName: string; serviceName: string; description: string; ctaLabel: string };
  slotName: string; origin: string; state: string; available: boolean; installed: boolean; decisionReason: string | null };
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
const validUntil = (date: string | null) => !!date && new Date(date).getTime() > Date.now();

export function AgentPublisher() {
  const [phase, setPhase] = useState<"loading" | "auth" | "ready" | "failed">("loading");
  const [publisherSection, setPublisherSection] = useState<"overview" | "placements" | "requests" | "performance" | "settings">("overview");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [installCodes, setInstallCodes] = useState<Record<string, string>>({});
  const [publisherName, setPublisherName] = useState("");
  const [origin, setOrigin] = useState("");
  const [slotName, setSlotName] = useState("");
  const [slotDomainId, setSlotDomainId] = useState("");
  const [slotFormat, setSlotFormat] = useState<"article" | "sidebar">("article");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const publisherAttempt = useRef<{ name: string; key: string } | null>(null);

  const load = useCallback(async (preferred?: string | null): Promise<boolean> => {
    setPhase("loading"); setNotice("");
    const failed = (message: string) => { setPhase("failed"); setNotice(message); return false; };
    try {
      const list = await api("/v1/publishers");
      if (list.status === 401) { setPhase("auth"); return false; }
      if (list.status !== 200) return failed(`매체 목록을 불러오지 못했습니다 (${list.status}). 다시 시도해 주세요.`);
      const values = (list.data as { publishers: Publisher[] }).publishers;
      const target = values.find(item => item.id === preferred)?.id ?? values[0]?.id ?? null;
      if (!target) {
        setPublishers(values); setSelectedId(null); setDomains([]); setSlots([]); setPlacements([]);
        setPhase("ready"); return true;
      }
      const [domainResult, slotResult, placementResult] = await Promise.all([
        api(`/v1/publishers/${target}/domains`), api(`/v1/publishers/${target}/slots`), api(`/v1/publishers/${target}/placements`),
      ]);
      if ([domainResult, slotResult, placementResult].some(result => result.status === 401)) {
        setPhase("auth"); return false;
      }
      if (domainResult.status !== 200 || slotResult.status !== 200 || placementResult.status !== 200)
        return failed("매체 도메인·광고 위치·배치 요청을 불러오지 못했습니다. 다시 시도해 주세요.");
      const nextDomains = (domainResult.data as { domains: Domain[] }).domains;
      setPublishers(values); setSelectedId(target); setDomains(nextDomains);
      setSlots((slotResult.data as { slots: Slot[] }).slots);
      setPlacements((placementResult.data as { placements: Placement[] }).placements);
      setSlotDomainId(current => nextDomains.some(item => item.id === current) ? current : nextDomains[0]?.id ?? "");
      setPhase("ready"); return true;
    } catch {
      return failed("매체 목록을 불러오지 못했습니다. AP 서버 연결을 확인하고 다시 시도해 주세요.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function authenticate(event: FormEvent<HTMLFormElement>, mode: "sign-in" | "sign-up") {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const result = await api(`/api/auth/${mode}/email`, "POST", mode === "sign-up"
        ? { email, password, name: displayName } : { email, password });
      if (result.status !== 200) { setNotice(`계정 처리에 실패했습니다 (${result.status}). 입력 정보와 인증 상태를 확인해 주세요.`); return; }
      if (mode === "sign-up") {
        const signIn = await api("/api/auth/sign-in/email", "POST", { email, password });
        if (signIn.status !== 200) { setNotice("가입되었습니다. 이메일 확인 후 로그인해 주세요."); return; }
      }
      await load();
    } catch { setNotice("인증 서버에 연결하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function createPublisher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const name = publisherName.trim();
    if (!publisherAttempt.current || publisherAttempt.current.name !== name)
      publisherAttempt.current = { name, key: crypto.randomUUID() };
    try {
      const result = await api("/v1/publishers", "POST", {
        name, idempotencyKey: publisherAttempt.current.key,
      });
      if (result.status === 201 || result.status === 200) {
        publisherAttempt.current = null;
        setPublisherName("");
        const loaded = await load((result.data as { id: string }).id);
        setNotice(loaded ? result.status === 201 ? "매체 조직을 만들었습니다. 도메인을 등록해 소유를 확인하세요."
          : "앞서 만든 매체 조직을 확인했습니다. 도메인을 등록해 소유를 확인하세요."
          : "매체 조직은 생성됐지만 목록을 다시 읽지 못했습니다. 매체 목록을 다시 불러와 확인해 주세요.");
      }
      else setNotice(result.status === 409 ? "같은 제출 키에 다른 매체 이름이 사용됐습니다. 목록을 확인해 주세요."
        : `매체 조직을 만들지 못했습니다 (${result.status}).`);
    } catch { setNotice("매체 조직 생성 결과를 확인할 수 없습니다. 목록을 확인하거나 같은 이름으로 다시 제출해 주세요."); }
    finally { setBusy(false); }
  }

  async function createDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedId) return;
    setBusy(true);
    try {
      const result = await api(`/v1/publishers/${selectedId}/domains`, "POST", { origin });
      if (result.status === 201) {
        setOrigin("");
        const loaded = await load(selectedId);
        setNotice(loaded ? "도메인을 등록했습니다. 표시된 DNS TXT 값을 추가한 뒤 확인하세요."
          : "도메인은 등록됐지만 목록을 다시 읽지 못했습니다. 매체 목록을 다시 불러와 확인해 주세요.");
      }
      else setNotice(result.status === 409 ? "이미 다른 매체에 등록된 origin입니다." : `도메인을 등록하지 못했습니다 (${result.status}). 정확한 HTTPS origin을 입력해 주세요.`);
    } catch { setNotice("도메인 등록 요청의 응답을 받지 못했습니다. 목록을 확인해 주세요."); }
    finally { setBusy(false); }
  }

  async function verifyDomain(id: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const result = await api(`/v1/publishers/${selectedId}/domains/${id}/verify`, "POST");
      if (result.status === 200) {
        const loaded = await load(selectedId);
        setNotice(loaded ? "DNS 소유 확인이 완료되었습니다. 7일 안에 다시 확인해야 위치를 계속 활성화할 수 있습니다."
          : "DNS 소유 확인은 완료됐지만 목록을 다시 읽지 못했습니다. 매체 목록을 다시 불러와 확인해 주세요.");
      }
      else setNotice(result.status === 409 ? "DNS TXT 증명을 찾지 못했습니다. 값과 전파 상태를 확인해 주세요." : `도메인을 확인하지 못했습니다 (${result.status}).`);
    } catch { setNotice("DNS 확인 요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }

  async function createSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedId) return;
    setBusy(true);
    try {
      const result = await api(`/v1/publishers/${selectedId}/slots`, "POST",
        { domainId: slotDomainId, name: slotName, format: slotFormat });
      if (result.status === 201) {
        setSlotName("");
        const loaded = await load(selectedId);
        setNotice(loaded ? "광고 위치를 등록했습니다. 도메인 확인 뒤 활성화하세요."
          : "광고 위치는 등록됐지만 목록을 다시 읽지 못했습니다. 매체 목록을 다시 불러와 확인해 주세요.");
      }
      else setNotice(result.status === 409 ? "이 도메인에 같은 이름의 위치가 있습니다." : `광고 위치를 만들지 못했습니다 (${result.status}).`);
    } catch { setNotice("위치 등록 요청의 응답을 받지 못했습니다. 목록을 확인해 주세요."); }
    finally { setBusy(false); }
  }

  async function changeSlot(slotId: string, action: "activate" | "pause") {
    if (!selectedId) return;
    setBusy(true);
    try {
      const result = await api(`/v1/publishers/${selectedId}/slots/${slotId}/${action}`, "POST");
      if (result.status === 200) {
        const loaded = await load(selectedId);
        setNotice(loaded ? action === "activate" ? "광고 위치를 활성화했습니다. 카드 배치는 별도 승인해야 합니다." : "광고 위치 노출을 중지했습니다."
          : "위치 상태는 변경됐지만 목록을 다시 읽지 못했습니다. 매체 목록을 다시 불러와 확인해 주세요.");
      }
      else setNotice(result.status === 409 ? "도메인 확인이 만료됐습니다. DNS를 다시 확인해 주세요." : `위치 상태를 바꾸지 못했습니다 (${result.status}).`);
    } catch { setNotice("위치 상태 변경의 응답을 받지 못했습니다. 목록을 새로고침해 주세요."); }
    finally { setBusy(false); }
  }

  async function decidePlacement(item: Placement, action: "approve" | "reject" | "suspend") {
    if (!selectedId) return;
    const reason = rejectionReasons[item.id]?.trim() ?? "";
    if (action === "reject" && !reason) { setNotice("거절 사유를 입력해 주세요."); return; }
    setBusy(true);
    try {
      const result = await api(`/v1/publishers/${selectedId}/placements/${item.id}/${action}`, "POST", {
        expectedReleaseId: item.releaseId,
        ...(action === "approve" ? { expectedContentHash: item.contentHash } : {}),
        ...(action === "reject" ? { reason } : {}),
      });
      if (result.status === 200) {
        const loaded = await load(selectedId);
        setNotice(loaded ? action === "approve" ? "표시된 카드 버전의 배치를 승인했습니다. 공개 조건이 유효할 때만 노출됩니다."
          : action === "reject" ? "배치를 거절했습니다." : "매체에서 이 배치의 노출을 중지했습니다."
          : "배치 결정은 저장됐지만 목록을 다시 읽지 못했습니다. 매체 목록을 다시 불러와 확인해 주세요.");
      } else setNotice(result.status === 409 ? "카드 버전이나 상태가 바뀌었습니다. 목록을 새로고침해 검토해 주세요." : `배치 결정을 저장하지 못했습니다 (${result.status}).`);
    } catch { setNotice("배치 결정의 응답을 받지 못했습니다. 목록을 새로고침해 주세요."); }
    finally { setBusy(false); }
  }

  async function installPlacement(item: Placement) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const result = await api(`/v1/publishers/${selectedId}/placements/${item.id}/install`, "POST");
      if (result.status === 201 || result.status === 200) {
        setInstallCodes(current => ({ ...current, [item.id]: (result.data as { script: string }).script }));
        setNotice("이 배치의 설치 코드를 발급했습니다. 표시된 정확한 매체 origin의 승인 위치에 넣으세요.");
      } else setNotice(result.status === 409 ? "배치 공개 조건이나 AP AI 설정을 확인해 주세요. 사업자에게 AI 설정 승인을 요청할 수 있습니다."
        : `설치 코드를 발급하지 못했습니다 (${result.status}).`);
    } catch { setNotice("설치 코드 응답을 받지 못했습니다. 같은 버튼으로 기존 결과를 확인할 수 있습니다."); }
    finally { setBusy(false); }
  }

  const selected = publishers.find(item => item.id === selectedId) ?? null;
  const owner = selected?.role === "owner";
  const editor = owner || selected?.role === "editor";
  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Agent Platform" /></a>
    <nav aria-label="작업 메뉴"><a href="/workspace">사업자</a><a href="/workspace/campaigns">홍보 카드</a></nav></header>
    <main className="feature-section">{phase !== "ready" && <div className="feature-heading"><p className="eyebrow">Agent Platform · 제휴 매체</p><h1>내 매체의 광고 위치를 관리하세요</h1>
      <p>도메인 소유를 확인하고 광고 위치를 활성화합니다. 사업자의 카드 공개와 매체의 배치 승인은 별도입니다.</p></div>}
      {notice && <p role="status" className="state-message">{notice}</p>}
      {phase === "loading" && <p>매체 계정을 확인하는 중입니다.</p>}
      {phase === "failed" && <section className="special-panel"><h2>매체 목록을 다시 확인해 주세요</h2>
        <button type="button" disabled={busy} onClick={() => void load(selectedId)}>매체 목록 다시 불러오기</button></section>}
      {phase === "auth" && <div className="special-grid"><section className="special-panel"><h2>매체 계정 로그인</h2>
        <form className="form-fields" onSubmit={event => void authenticate(event, "sign-in")}><label>이메일<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label>비밀번호<input type="password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button type="submit" disabled={busy}>로그인</button></form></section><section className="special-panel"><h2>계정 만들기</h2><p>AP 계정이며 매체 조직 권한은 사업자 조직과 분리됩니다.</p>
        <form className="form-fields" onSubmit={event => void authenticate(event, "sign-up")}><label>이름<input required value={displayName} onChange={event => setDisplayName(event.target.value)} /></label>
          <label>이메일<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label>비밀번호<input type="password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button type="submit" disabled={busy}>계정 만들기</button></form><p>로컬 mock에서만 즉시 로그인합니다. 운영 인증 공급사는 연결 전입니다.</p></section></div>}
      {phase === "ready" && <div className="publisher-workspace"><nav className="publisher-workspace-nav" aria-label="제휴 매체 관리실"><strong>{selected?.name ?? "새 매체"}</strong><span>Agent Platform · 제휴 매체</span>
        {([['overview', '오늘'], ['placements', '노출 위치'], ['requests', '배치 승인'], ['performance', '집계 성과'], ['settings', '매체 설정']] as const).map(([section, label]) => <button key={section} type="button" aria-current={publisherSection === section ? "page" : undefined} onClick={() => setPublisherSection(section)}>{label}</button>)}
      </nav><div className="publisher-workspace-content">
        {publisherSection === "overview" && <section className="publisher-overview">
          <div className="publisher-section-heading"><h2>콘텐츠와 대화의 연결</h2><p>독자 경험을 해치지 않는 대화형 홍보를 운영하세요.</p></div>
          <div className="publisher-overview-stats">
            <article><span>등록된 매체</span><strong>{publishers.length}</strong><small>AP 매체 조직</small></article>
            <article><span>노출 위치</span><strong>{slots.length}</strong><small>직접 등록한 영역</small></article>
            <article><span>승인 대기</span><strong>{placements.filter(item => item.state === "requested").length}</strong><small>버전별 배치 요청</small></article>
            <article><span>활성 배치</span><strong>{placements.filter(item => item.state === "approved" && item.available && item.installed).length}</strong><small>승인·설치 완료</small></article>
          </div><div className="publisher-overview-panels">
            <section className="special-panel"><h3>배치 검토</h3>
              {placements.filter(item => item.state === "requested").length ? <ul>{placements.filter(item => item.state === "requested").slice(0, 5).map(item => <li key={item.id}>{item.campaignName} · {item.slotName}</li>)}</ul> : <p>검토할 배치 요청이 없습니다.</p>}
              <button type="button" onClick={() => setPublisherSection("requests")}>배치 요청 확인 →</button>
              <p>승인된 홍보 카드 버전만 검토합니다. 고객 대화와 개인정보는 열람할 수 없습니다.</p>
            </section><section className="special-panel"><h3>{selected ? "독자가 보게 될 화면" : "매체 조직 준비"}</h3>
              {selected ? <><p>승인·설치된 배치의 카드 문구를 확인합니다. 문의는 사업자의 접수 경로에서 처리됩니다.</p>
                {placements.filter(item => item.state === "approved" && item.available && item.installed).slice(0, 1).map(item => <div className="publisher-overview-preview" key={item.id}><span>{item.card.advertisementLabel}</span><strong>{item.card.businessName} · {item.card.serviceName}</strong><p>{item.card.description}</p><a href={`/placements/${item.id}`}>승인 카드 열기 →</a></div>)}
                {!placements.some(item => item.state === "approved" && item.available && item.installed) && <p>현재 독자에게 노출 가능한 설치 배치가 없습니다.</p>}
                <button type="button" onClick={() => setPublisherSection("placements")}>노출 위치 보기 →</button></>
                : <><p>매체 조직을 만든 뒤 소유한 사이트의 도메인을 등록하세요.</p><button type="button" onClick={() => setPublisherSection("settings")}>매체 조직 만들기 →</button></>}
            </section>
          </div>
        </section>}
        {publisherSection === "settings" && <><div className="publisher-section-heading"><h2>매체 설정</h2><p>매체 조직과 소유한 웹사이트를 관리합니다.</p></div><div className="special-grid"><section className="special-panel"><div className="panel-heading"><h2>매체 조직</h2><button type="button" disabled={busy} onClick={() => void load(selectedId)}>새로고침</button></div>
        {publishers.length ? <div className="publisher-list">{publishers.map(item => <button type="button" key={item.id} aria-current={item.id === selectedId ? "true" : undefined}
          onClick={() => void load(item.id)}><strong>{item.name}</strong><span>{item.role}</span></button>)}</div> : <p>매체 조직이 없습니다.</p>}
        <form className="form-fields" onSubmit={event => void createPublisher(event)}><label>새 매체 이름<input required maxLength={160} value={publisherName} onChange={event => setPublisherName(event.target.value)} /></label>
          <button type="submit" disabled={busy}>매체 조직 만들기</button></form></section>
        <section className="special-panel"><h2>도메인 등록</h2><p>정확한 HTTPS origin을 등록합니다. 같은 도메인을 다른 매체에 등록할 수 없습니다.</p>
          {selected && owner ? <form className="form-fields" onSubmit={event => void createDomain(event)}><label>매체 사이트 origin<input type="url" required placeholder="https://news.example.com" value={origin} onChange={event => setOrigin(event.target.value)} /></label>
            <button type="submit" disabled={busy}>도메인 등록</button></form> : <p>매체 owner만 도메인을 등록할 수 있습니다.</p>}
          {domains.map(item => <article key={item.id} className="publisher-item"><h3>{item.origin}</h3><p>{validUntil(item.verifiedUntil) ? `검증 유효 · ${new Date(item.verifiedUntil!).toLocaleString("ko-KR")}까지` : "소유 확인 필요"}</p>
            <p>DNS TXT: <code>_ap-publisher.{new URL(item.origin).hostname}</code></p><p>값: <code>ap-publisher-verification={item.verificationProof}</code></p>
            {owner && <button type="button" disabled={busy} onClick={() => void verifyDomain(item.id)}>{validUntil(item.verifiedUntil) ? "DNS 다시 확인" : "DNS 소유 확인"}</button>}</article>)}
        </section></div></>}
        {publisherSection === "placements" && <><div className="publisher-section-heading"><h2>노출 위치</h2><p>직접 관리하는 사이트의 광고 위치만 등록하세요.</p></div>{selected ? <section className="special-panel publisher-slots"><div className="panel-heading"><h2>광고 위치</h2><span>{selected.name}</span></div>
          <p>위치를 활성화해도 사업자 홍보 카드가 자동 게재되지는 않습니다. 정확한 카드 버전의 배치 승인이 필요합니다.</p>
          {editor && domains.length > 0 && <form className="publisher-slot-form" onSubmit={event => void createSlot(event)}>
            <label>도메인<select value={slotDomainId} onChange={event => setSlotDomainId(event.target.value)}>{domains.map(item => <option key={item.id} value={item.id}>{item.origin}</option>)}</select></label>
            <label>위치 이름<input required maxLength={160} value={slotName} onChange={event => setSlotName(event.target.value)} placeholder="기사 본문 카드" /></label>
            <label>형식<select value={slotFormat} onChange={event => setSlotFormat(event.target.value as "article" | "sidebar")}><option value="article">기사 본문</option><option value="sidebar">사이드바</option></select></label>
            <button type="submit" disabled={busy || !slotDomainId}>위치 등록</button></form>}
          {slots.length === 0 ? <p>등록한 광고 위치가 없습니다.</p> : <div className="publisher-slot-list">{slots.map(item => <article key={item.id} className="publisher-item"><div className="panel-heading"><h3>{item.name}</h3><span>{item.format === "article" ? "기사 본문" : "사이드바"}</span></div>
            <p>{item.domainOrigin} · {item.state === "active" ? item.available ? "활성" : "도메인 검증 만료" : "중지"}</p>
            {owner && (item.state === "active" ? <button type="button" disabled={busy} onClick={() => void changeSlot(item.id, "pause")}>위치 중지</button>
              : <button type="button" disabled={busy || !validUntil(item.domainVerifiedUntil)} onClick={() => void changeSlot(item.id, "activate")}>위치 활성화</button>)}
            {!validUntil(item.domainVerifiedUntil) && <p>활성화하려면 이 도메인의 DNS 소유를 확인해 주세요.</p>}</article>)}</div>}
        </section> : <section className="special-panel"><p>먼저 매체 조직을 만들어 주세요.</p><button type="button" onClick={() => setPublisherSection("settings")}>매체 설정 열기</button></section>}</>}
        {publisherSection === "requests" && <><div className="publisher-section-heading"><h2>배치 승인</h2><p>공개된 홍보 카드의 버전과 노출 위치를 확인한 뒤 승인합니다.</p></div>{selected ? <section className="special-panel publisher-placements"><div className="panel-heading"><h2>카드 배치 요청</h2><span>{selected.name}</span></div>
          <p>사업자가 요청한 정확한 카드 버전과 문구를 검토합니다. 승인 전에는 공개되지 않습니다.</p>
          {placements.length === 0 ? <p>접수된 배치 요청이 없습니다.</p> : <div className="publisher-placement-list">{placements.map(item =>
            <article key={item.id} className="publisher-item"><div className="panel-heading"><h3>{item.campaignName} · {item.slotName}</h3>
              <span>{item.state === "requested" ? "검토 대기" : item.state === "approved" ? item.installed ? "설치 코드 발급" : item.available ? "설치 대기" : "노출 보류" :
                item.state === "rejected" ? "거절" : item.state === "suspended" ? "중지" : "사업자 취소"}</span></div>
              <p>{item.origin} · 버전 <code>{item.releaseId}</code></p>
              <div className="publisher-card-preview"><strong>{item.card.advertisementLabel}</strong><p>{item.card.businessName}</p>
                <h4>{item.card.serviceName}</h4><p>{item.card.description}</p><span>{item.card.ctaLabel}</span></div>
              <p>문구 해시: <code>{item.contentHash}</code></p>
              {item.available && <p><a href={`/placements/${item.id}`}>매체 승인 카드 열기</a></p>}
              {item.decisionReason && <p>거절 사유: {item.decisionReason}</p>}
              {owner && item.state === "requested" && <div className="publisher-placement-actions"><button type="button" disabled={busy}
                onClick={() => void decidePlacement(item, "approve")}>이 버전 승인</button>
                <label>거절 사유<input maxLength={500} value={rejectionReasons[item.id] ?? ""}
                  onChange={event => setRejectionReasons(current => ({ ...current, [item.id]: event.target.value }))} /></label>
                <button type="button" disabled={busy || !rejectionReasons[item.id]?.trim()} onClick={() => void decidePlacement(item, "reject")}>거절</button></div>}
              {owner && item.state === "approved" && <button type="button" disabled={busy} onClick={() => void decidePlacement(item, "suspend")}>배치 노출 중지</button>}
              {owner && item.state === "approved" && <><button type="button" disabled={busy || !item.available}
                onClick={() => void installPlacement(item)}>외부 기사 설치 코드</button>
                {installCodes[item.id] && <p>이 위치의 기사 HTML에 넣을 코드: <code>{installCodes[item.id]}</code></p>}</>}
            </article>)}</div>}
        </section> : <section className="special-panel"><p>먼저 매체 조직을 만들어 주세요.</p><button type="button" onClick={() => setPublisherSection("settings")}>매체 설정 열기</button></section>}</>}
        {publisherSection === "performance" && <><div className="publisher-section-heading"><h2>집계 성과</h2><p>승인된 배치의 집계 수치만 표시합니다.</p></div>{selectedId ? <DistributionMetricsPanel endpoint={`/v1/publishers/${selectedId}/metrics`} /> : <section className="special-panel"><p>먼저 매체 조직을 만들어 주세요.</p><button type="button" onClick={() => setPublisherSection("settings")}>매체 설정 열기</button></section>}</>}
      </div></div>}
    </main></div>;
}
