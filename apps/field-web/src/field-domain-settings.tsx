"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { requestJson } from "./field-api";
import { domainErrorLabel } from "./field-domain-errors";
import "./field-domain-settings.css";

type Domain = {
  id: string; hostname: string; state: string; desiredState: string;
  ownership: string; dns: string; tls: string; binding: string; isPrimary: boolean;
  origin: string | null; checkedAt: string | null; error?: string | null;
  verification: { txtName: string; txtValue: string; cnameName: string; cnameTarget: string | null };
};
type Domains = { domains: Domain[]; providerState: string };
function isDomain(value: unknown): value is Domain {
  if (!value || typeof value !== "object") return false;
  const item = value as Domain;
  return [item.id, item.hostname, item.state, item.desiredState, item.ownership, item.dns, item.tls, item.binding].every(value => typeof value === "string")
    && typeof item.isPrimary === "boolean" && (item.origin === null || typeof item.origin === "string")
    && Boolean(item.verification) && [item.verification.txtName, item.verification.txtValue, item.verification.cnameName].every(value => typeof value === "string")
    && (item.verification.cnameTarget === null || typeof item.verification.cnameTarget === "string");
}
const states: Record<string, string> = {
  registered: "등록됨", ownership_pending: "소유권 확인 대기", dns_pending: "DNS 확인 대기",
  tls_pending: "인증서 발급 대기", connected: "연결됨", blocked_integration: "공급사 연결 전",
  unknown: "결과 확인 중", error: "연결 오류", release_pending: "해제 확인 중",
  disconnected: "연결 해제됨", verification_expired: "검증 만료",
};
function requestFailure(result: { status: number; data: { error?: string } }) {
  const errors: Record<string, string> = {
    domain_already_registered: "이미 등록된 주소입니다. 목록에서 확인해 주세요.",
    invalid_domain_registration: "도메인 이름만 입력해 주세요. 예: www.example.com",
    domain_limit_reached: "활성 주소는 최대 5개입니다. 기존 주소를 연결 해제한 뒤 새 주소를 등록해 주세요.",
    trial_ended: "새 도메인을 등록하려면 이용 상태를 확인해 주세요. 기존 주소와 문의·예약 기록은 유지됩니다.",
    paid_subscription_required: "새 도메인을 등록하려면 이용 상태를 확인해 주세요. 기존 주소와 문의·예약 기록은 유지됩니다.",
    site_not_found: "먼저 내 홈페이지를 만든 뒤 주소를 등록해 주세요.",
    idempotency_conflict: "요청 기록과 입력 주소가 다릅니다. 등록 목록을 확인한 뒤 새 주소로 신청해 주세요.",
    domain_not_ready: "연결 완료를 확인한 뒤 대표 주소로 선택해 주세요.",
    domain_release_not_completed: "연결 해제 확인이 끝난 뒤 재연결할 수 있습니다.",
    domain_disconnected: "해제된 주소입니다. 먼저 재연결을 요청해 주세요.",
  };
  if (result.data.error && errors[result.data.error]) return errors[result.data.error]!;
  return result.status >= 400 && result.status < 500
    ? "요청이 거절됐습니다. 현재 계정의 권한과 입력·연결 상태를 확인해 주세요."
    : "요청 결과를 확인하지 못했습니다. 같은 요청이나 상태 조회로 다시 확인해 주세요.";
}

function DomainIcon({ name }: { name: "service" | "globe" | "bell" | "credit" | "shield" }) {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{
    name === "service" ? <><rect x="3" y="6" width="18" height="15" rx="3" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M3 12h18m-11 0v3h4v-3" /></>
      : name === "globe" ? <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" /></>
        : name === "bell" ? <path d="M18 8a6 6 0 0 0-12 0v6l-2 3h16l-2-3ZM10 21h4" />
          : name === "credit" ? <><rect x="2" y="4" width="20" height="16" rx="3" /><path d="M2 9h20M6 15h4" /></>
            : <><path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6Z" /><path d="m8 12 3 3 5-6" /></>
  }</svg>;
}
function Badge({ value }: { value: string }) {
  const ready = ["verified", "ready", "connected"].includes(value);
  return <span className={`badge ${ready ? "green" : "gray"}`}>{ready ? "확인됨" : states[value] ?? "대기"}</span>;
}

export function FieldDomainSettings({ organizationId, onNavigate }: {
  organizationId: string; onNavigate: (section: string) => void;
}) {
  const [data, setData] = useState<Domains | null>(null);
  const [defaultOrigin, setDefaultOrigin] = useState<string | null>(null);
  const [published, setPublished] = useState<boolean | null>(null);
  const [snapshotFresh, setSnapshotFresh] = useState(false);
  const [hostname, setHostname] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const registration = useRef<{ hostname: string; requestKey: string } | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const headers = { "x-organization-id": organizationId };
      const [domains, site] = await Promise.all([
        requestJson("/v1/sites/domains", "GET", undefined, undefined, headers),
        requestJson("/v1/sites/ap-installation", "GET", undefined, undefined, headers),
      ]);
      if (domains.status !== 200 || !Array.isArray(domains.data.domains) || !domains.data.domains.every(isDomain)) throw new Error("domain_unavailable");
      setData(domains.data as Domains);
      setSelectedId(current => domains.data.domains.some((item: Domain) => item.id === current)
        ? current : (domains.data.domains[0]?.id ?? ""));
      setDefaultOrigin(site.status === 200 && typeof site.data.defaultOrigin === "string" ? site.data.defaultOrigin : null);
      setPublished(site.status === 200 && typeof site.data.published === "boolean" ? site.data.published : null);
      setSnapshotFresh(true);
      return true;
    } catch {
      setSnapshotFresh(false);
      setNotice("현재 주소 설정을 확인하지 못했습니다. 표시된 기록은 마지막 확인 상태입니다. 다시 확인해 주세요.");
      return false;
    } finally { setBusy(false); }
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !hostname.trim()) return;
    const normalized = hostname.trim().toLowerCase();
    if (registration.current?.hostname !== normalized) registration.current = { hostname: normalized, requestKey: crypto.randomUUID() };
    setBusy(true); setNotice("");
    try {
      const result = await requestJson("/v1/sites/domains", "POST", registration.current, undefined,
        { "x-organization-id": organizationId });
      if (result.status !== 200 && result.status !== 201) {
        setNotice(requestFailure(result));
        return;
      }
      if (!isDomain(result.data)) { setNotice("등록 응답을 확인하지 못했습니다. 같은 입력으로 다시 확인해 주세요."); return; }
      setSelectedId(result.data.id);
      const receipt = result.data;
      setData(current => ({ providerState: current?.providerState ?? "blocked_integration",
        domains: [...(current?.domains.filter(item => item.id !== receipt.id) ?? []), receipt] }));
      registration.current = null;
      if (await load()) setNotice("주소를 등록했습니다. DNS 설정과 연결 상태를 확인해 주세요.");
    } catch { setNotice("등록 결과가 확인되지 않았습니다. 같은 입력으로 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  async function act(action: "verify" | "primary" | "disconnect" | "reconnect") {
    if (!selectedId || busy) return;
    setBusy(true); setNotice("");
    try {
      const result = await requestJson(`/v1/sites/domains/${selectedId}/${action}`, "POST", {}, undefined,
        { "x-organization-id": organizationId });
      if (result.status !== 200) { setNotice(requestFailure(result)); return; }
      if (!await load()) return;
      setNotice(action === "verify" ? "연결 확인을 요청했습니다. 처리 후 상태를 새로고침해 주세요."
        : action === "primary" ? "대표 주소를 선택했습니다. 기본 주소도 계속 사용할 수 있습니다."
          : action === "disconnect" ? "연결 해제를 요청했습니다. 기존 사이트와 문의·예약은 유지됩니다."
            : "재연결을 요청했습니다. 새 소유권 증명과 연결 상태를 확인해 주세요.");
    } catch { setNotice("결과가 확인되지 않았습니다. 상태를 다시 확인해 주세요."); }
    finally { setBusy(false); }
  }
  const domain = data?.domains.find(item => item.id === selectedId);
  const primaryActive = snapshotFresh && domain?.isPrimary && domain.state === "connected" && Boolean(domain.origin);
  return <section className="field-domain-settings" id="owner-domain">
    <div className="page-heading"><div><h1>주소·도메인</h1><p>기본 주소를 바로 쓰거나, 보유한 도메인을 연결하세요.</p></div></div>
    <div className="settings-layout"><nav className="settings-nav" aria-label="설정 메뉴">
      <button type="button" onClick={() => onNavigate("services")}><DomainIcon name="service" />사업 정보</button>
      <button type="button" className="active" aria-current="page"><DomainIcon name="globe" />주소·도메인</button>
      <button type="button" onClick={() => onNavigate("notifications")}><DomainIcon name="bell" />알림</button>
      <a href="/workspace/subscription"><DomainIcon name="credit" />구독·청구</a>
      <button type="button" onClick={() => onNavigate("more")}><DomainIcon name="shield" />계정·데이터</button>
    </nav><section><div className="card">
      <div className="setting-section"><div className="row-between"><h2>기본 사이트 주소</h2><span className={`badge ${snapshotFresh && published ? "green" : "gray"}`}>{!snapshotFresh || published === null ? "확인 필요" : published ? "공개됨" : "공개 전"}</span></div>
        <p className="small muted">도메인 연결 중에도 공개된 사이트는 이 주소로 접근할 수 있어요.</p>
        <div className="row mt24"><input className="input" value={defaultOrigin ?? "기본 주소 확인 필요"} readOnly aria-label="기본 사이트 주소" />
          <button type="button" className="iconbtn" aria-label="사이트 주소 복사" disabled={!defaultOrigin} onClick={() => {
            if (defaultOrigin) void navigator.clipboard.writeText(defaultOrigin).then(() => setNotice("사이트 주소를 복사했습니다."), () => setNotice("주소를 선택해 직접 복사해 주세요."));
          }}><svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4" /></svg></button></div>
      </div>
      <div className="setting-section"><div className="row-between"><h2>자체 도메인</h2><span className={`badge ${snapshotFresh && domain?.state === "connected" ? "green" : "amber"}`}>{!snapshotFresh ? "현재 상태 확인 필요" : domain ? states[domain.state] ?? "확인 필요" : "등록 전"}</span></div>
        <p className="small muted mt8">이미 보유한 도메인을 연결합니다. 도메인 구매·갱신은 외부에서 진행해 주세요.</p>
        <form className="row mt24" onSubmit={event => void save(event)}><input className="input" value={hostname} onChange={event => setHostname(event.target.value)} placeholder="www.example.com" required disabled={busy} aria-label="연결할 자체 도메인" /><button className="btn btn-secondary" disabled={busy || !data}>저장</button></form>
        {data && data.domains.length > 1 && <label className="field-note mt24">등록 주소 선택 (추가)<select className="input" value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={busy}>{data.domains.map(item => <option key={item.id} value={item.id}>{item.hostname}</option>)}</select></label>}
        {domain && <><p className="field-note mt24">등록 주소: {domain.hostname}</p><div className="dns-grid"><div className="thead">유형</div><div className="thead">이름</div><div className="thead">대상 값</div><div>CNAME</div><div>{domain.verification.cnameName}</div><div>{domain.verification.cnameTarget ?? "연결 대상 확인 필요"}</div><div>TXT</div><div>{domain.verification.txtName}</div><div>{domain.verification.txtValue}</div></div>
          <div className="mt24">{!snapshotFresh && <p className="field-note">마지막으로 확인한 연결 상태</p>}{[["소유권 확인", domain.ownership], ["인증서 발급", domain.tls]].map(([label, value]) => <div className="summary-line" key={label}><span>{label}</span><Badge value={value!} /></div>)}<div className="summary-line"><span>대표 주소 연결</span><span className={`badge ${primaryActive ? "green" : "gray"}`}>{primaryActive ? "연결됨" : domain.isPrimary ? "확인 필요" : "이 주소는 대표 주소 아님"}</span></div></div>
          <button type="button" className="btn btn-primary mt24" disabled={busy || domain.desiredState !== "active"} onClick={() => void act("verify")}><svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 7v5h-5M3 17v-5h5M4 8a9 9 0 0 1 15-3l2 3M3 16l2 3a9 9 0 0 0 15-3" /></svg>연결 상태 확인</button>
          <div className="row wrap mt24"><button type="button" className="btn btn-secondary" disabled={busy || !snapshotFresh || domain.state !== "connected" || !domain.origin || domain.isPrimary} onClick={() => void act("primary")}>{primaryActive ? "대표 주소 사용 중 (추가)" : domain.isPrimary ? "대표 주소 확인 필요 (추가)" : "대표 주소로 사용 (추가)"}</button>
            {domain.desiredState === "active" ? <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void act("disconnect")}>연결 해제 (추가)</button> : <button type="button" className="btn btn-secondary" disabled={busy || domain.state !== "disconnected"} onClick={() => void act("reconnect")}>재연결 (추가)</button>}</div>
          {domain.checkedAt && <p className="field-note mt24">마지막 확인: {new Date(domain.checkedAt).toLocaleString("ko-KR")}</p>}
          {typeof domain.error === "string" && <p className="field-note mt24">확인 결과 (추가): {domainErrorLabel(domain.error)}</p>}
        </>}
        <div className="notice mt24">{data?.providerState === "blocked_integration" ? "도메인 연결 공급사가 설정되지 않았습니다. 주소 등록은 가능하며 연결 완료로 표시하지 않습니다." : "소유권·DNS·인증서와 사이트 연결이 모두 확인되어야 주소가 활성화됩니다."}</div>
        {domain?.origin && <p className="field-note mt24">새 주소의 AI 상담은 별도 AP 설치 승인이 필요합니다. <a href="/workspace/integrations">AI 상담 연결</a></p>}
      </div></div>
      <div className="row mt24"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setNotice(""); void load(); }}>상태 새로고침</button></div>
      {notice && <p role="status" className="notice mt24">{notice}</p>}
    </section></div>
  </section>;
}
