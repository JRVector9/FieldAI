"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import "./agent-field-connections.css";

type Connection = { id: string; apOrganizationId: string; apAgentId: string;
  fieldOrganizationId: string; scopes: string[]; status: string; createdAt: string;
  remoteRevokeState: string | null };
type FieldFacts = { organizationId: string; revision: number; businessName: string;
  introduction?: string; region?: string; openingHours?: string;
  services: { id: string; name: string; description?: string; priceAmount?: number | null }[];
  faqs?: { question: string; answer: string }[] };
type SavedSource = { connectionId: string; state: string; sourceRevision: number;
  contentHash: string; approvedSourceRevision: number | null;
  approvedAt?: string | null; knowledgeReleaseId?: string | null; facts: FieldFacts };
type ServiceMapping = { fieldServiceId: string; priority: "separate" | "native" | "field";
  nativeServiceIndex?: number };
type MappingOptions = { nativeReleaseId: string; nativeKnowledgeRevision: number;
  services: { index: number; name: string; description: string }[];
  currentSelection: { includeBusinessIntroduction: boolean; includeFaqs?: boolean; includedServiceIds: string[];
    serviceMappings: ServiceMapping[] } | null };
type CapabilityResult = { schemaVersion: string; capabilities: Record<
  "facts.read" | "availability.read" | "request.create" | "customer_access.create"
  | "proposal.respond", boolean> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fieldWorkspaceUrl = new URL("/workspace/integrations",
  process.env.NEXT_PUBLIC_FIELD_WEB_URL ?? "http://127.0.0.1:3002").toString();

async function requestJson(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

export function AgentFieldConnections() {
  const [phase, setPhase] = useState<"loading" | "auth" | "ready">("loading");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [capabilityResults, setCapabilityResults] = useState<Record<string, CapabilityResult>>({});
  const [preview, setPreview] = useState<SavedSource | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [revokeCheckedId, setRevokeCheckedId] = useState("");
  const [includeBusiness, setIncludeBusiness] = useState(false);
  const [includeFaqs, setIncludeFaqs] = useState(false);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [mappingOptions, setMappingOptions] = useState<MappingOptions | null>(null);
  const [serviceChoices, setServiceChoices] = useState<Record<string, string>>({});
  const [fieldConnectionId, setFieldConnectionId] = useState("");
  const [apGrantId, setApGrantId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("AP 계정과 연결 상태를 확인하고 있습니다.");

  async function load() {
    const result = await requestJson("/v1/connections/field");
    if (result.status === 200) {
      setConnections((result.data as { connections: Connection[] }).connections);
      setPhase("ready");
      const outcome = new URLSearchParams(location.search).get("result");
      setStatus(outcome === "review_required" ? "양쪽 제품의 동의와 연결 기록을 확인했습니다. 정보 검토와 사이트 설치는 아직 필요합니다."
        : outcome === "denied" ? "Field 정보 제공 동의가 거부됐습니다. AP 상담과 Field 자체 기능은 계속 이용할 수 있습니다."
          : outcome === "binding_unknown" ? "연결 결과를 확인하지 못했습니다. 다시 동의하기 전에 관리자에게 연결 기록 확인을 요청해 주세요."
            : "Field 정보 제공에는 별도 Field 계정과 사업장 owner의 동의가 필요합니다.");
    } else if (result.status === 401) { setPhase("auth"); setStatus("AP 계정으로 로그인해 주세요."); }
    else { setPhase("ready"); setStatus(`연결 목록을 불러오지 못했습니다 (${result.status}).`); }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setFieldConnectionId(params.get("fieldConnectionId") ?? "");
    setApGrantId(params.get("apGrantId") ?? "");
    void requestJson("/api/auth/get-session").then(result => {
      if (result.status === 200 && (result.data as { user?: unknown } | null)?.user) return load();
      setPhase("auth"); setStatus("AP 계정으로 로그인해 주세요.");
    }).catch(() => { setPhase("auth"); setStatus("AP 인증 서버에 연결할 수 없습니다."); });
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("AP 계정에 로그인하고 있습니다.");
    try {
      const result = await requestJson("/api/auth/sign-in/email", "POST", { email, password });
      if (result.status === 200) await load();
      else setStatus(`로그인하지 못했습니다 (${result.status}). AP 계정을 확인해 주세요.`);
    } catch { setStatus("AP 인증 서버에 연결할 수 없습니다."); }
    finally { setBusy(false); }
  }

  async function start() {
    if (!uuid.test(fieldConnectionId) || !uuid.test(apGrantId)) {
      setStatus("Field의 연결 기록에서 다시 이 화면을 열어 주세요."); return;
    }
    setBusy(true); setStatus("Field 사업장 동의 화면으로 이동할 요청을 준비합니다.");
    try {
      const response = await requestJson("/v1/connections/field/start", "POST", { fieldConnectionId, apGrantId });
      if (response.status === 201) {
        location.assign((response.data as { authorizationUrl: string }).authorizationUrl); return;
      }
      setStatus(response.status === 503 ? "Field 연결 설정이 없습니다. AP 상담 기능은 계속 사용할 수 있습니다."
        : response.status === 404 ? "이 AP 조직의 승인 권한이 없습니다. AP owner 계정과 AI 동의를 확인해 주세요."
          : response.status === 409 ? "이미 연결된 기록입니다. 연결 상태를 확인해 주세요."
            : `Field 동의 시작에 실패했습니다 (${response.status}).`);
    } catch { setStatus("Field 연결 요청을 전달하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function inspect(connectionId: string) {
    setBusy(true); setPreview(null); setReviewConfirmed(false);
    setIncludeBusiness(false); setIncludeFaqs(false); setSelectedServices([]); setMappingOptions(null); setServiceChoices({});
    setStatus("Field의 승인된 사업 정보를 확인하고 있습니다.");
    try {
      const result = await requestJson(`/v1/connections/field/${connectionId}/sync`, "POST");
      if (result.status === 200 || result.status === 201) {
        const saved = await requestJson(`/v1/connections/field/${connectionId}/source`);
        if (saved.status !== 200) throw new Error("source_read_failed");
        setPreview(saved.data as SavedSource);
        const optionsReady = await loadMappingOptions(saved.data as SavedSource);
        setStatus(optionsReady
          ? "Field 승인 정보를 AP 검토 원장에 저장했습니다. AP 고객 상담에는 아직 반영되지 않았습니다."
          : "Field 검토 자료를 저장했습니다. AP 직접 지식을 먼저 승인하면 출처 매핑을 선택할 수 있습니다.");
      } else {
        if (result.status === 409 && (result.data as { error?: string }).error === "integrity_conflict") {
          const saved = await requestJson(`/v1/connections/field/${connectionId}/source`);
          if (saved.status === 200) setPreview(saved.data as SavedSource);
        }
        setStatus(result.status === 409 ? "같은 Field 버전에 서로 다른 내용이 발견됐습니다. 검토가 필요합니다."
          : result.status === 503 ? "Field 권한 확인에 실패했습니다. 연결 상태를 관리자에게 확인해 주세요."
          : result.status === 502 ? "Field 승인 정보를 확인하지 못했습니다. 기존 AP 상담은 계속 이용할 수 있습니다."
            : `Field 정보 조회에 실패했습니다 (${result.status}).`);
      }
      await loadConnections();
    } catch { setStatus("Field 정보 조회에 실패했습니다. 기존 AP 상담은 계속 이용할 수 있습니다."); }
    finally { setBusy(false); }
  }

  async function openSaved(connectionId: string) {
    setBusy(true); setPreview(null); setReviewConfirmed(false);
    setIncludeBusiness(false); setIncludeFaqs(false); setSelectedServices([]); setMappingOptions(null); setServiceChoices({});
    try {
      const saved = await requestJson(`/v1/connections/field/${connectionId}/source`);
      if (saved.status === 200) {
        setPreview(saved.data as SavedSource);
        const optionsReady = await loadMappingOptions(saved.data as SavedSource);
        setStatus(optionsReady ? "AP에 보관된 Field 검토 자료입니다. 현재 Field 값과 다를 수 있습니다."
          : "Field 검토 자료를 열었습니다. AP 직접 지식을 먼저 승인하면 출처 매핑을 선택할 수 있습니다.");
      } else setStatus(saved.status === 404 ? "보관된 Field 검토 자료가 없습니다."
        : `검토 자료를 열지 못했습니다 (${saved.status}).`);
    } catch { setStatus("보관된 검토 자료를 열지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function loadMappingOptions(saved: SavedSource) {
    const result = await requestJson(`/v1/connections/field/${saved.connectionId}/source/mapping-options`);
    if (result.status !== 200) { setMappingOptions(null); return false; }
    const options = result.data as MappingOptions;
    setMappingOptions(options);
    const selection = options.currentSelection;
    if (selection && saved.state === "current") {
      setIncludeBusiness(selection.includeBusinessIntroduction);
      setIncludeFaqs(selection.includeFaqs ?? false);
      setSelectedServices(selection.includedServiceIds);
    }
    const choices: Record<string, string> = {};
    for (const service of saved.facts.services) {
      const previous = selection?.serviceMappings.find(item => item.fieldServiceId === service.id);
      if (previous) choices[service.id] = previous.priority === "separate" ? "separate"
        : `${previous.priority}:${previous.nativeServiceIndex}`;
      else if (!options.services.some(native => native.name.trim().toLocaleLowerCase()
        === service.name.trim().toLocaleLowerCase())) choices[service.id] = "separate";
    }
    setServiceChoices(choices);
    return true;
  }

  async function approveSource() {
    if (!preview || preview.state !== "pending_review" || !reviewConfirmed) return;
    setBusy(true); setStatus("Field 원본 버전과 권한을 다시 확인하고 있습니다.");
    try {
      const result = await requestJson(
        `/v1/connections/field/${preview.connectionId}/source/approve`, "POST",
        { expectedSourceRevision: preview.sourceRevision, expectedContentHash: preview.contentHash });
      if (result.status === 200 || result.status === 201) {
        const saved = await requestJson(`/v1/connections/field/${preview.connectionId}/source`);
        if (saved.status !== 200) throw new Error("source_read_failed");
        setPreview(saved.data as SavedSource);
        await loadMappingOptions(saved.data as SavedSource);
        setReviewConfirmed(false);
        setStatus("Field 정보 출처를 AP에서 검토 승인했습니다. 고객 AI 반영은 아직 필요합니다.");
      } else setStatus(result.status === 409
        ? "Field 원본이 바뀌었거나 충돌했습니다. 최신 정보를 다시 가져와 검토해 주세요."
        : result.status === 502 || result.status === 503
          ? "Field 현재 상태를 확인하지 못해 승인하지 않았습니다."
          : `출처 승인에 실패했습니다 (${result.status}).`);
    } catch { setStatus("Field 출처 승인 결과를 확인하지 못했습니다. 저장 상태를 다시 열어 확인해 주세요."); }
    finally { setBusy(false); }
  }

  async function publishSource() {
    if (!preview || preview.state !== "current" || !mappingOptions
      || (!includeBusiness && !includeFaqs && selectedServices.length === 0)
      || selectedServices.some(id => !serviceChoices[id])) return;
    const serviceMappings = selectedServices.map(fieldServiceId => {
      const choice = serviceChoices[fieldServiceId];
      if (choice === "separate") return { fieldServiceId, priority: "separate" };
      const [priority, index] = choice!.split(":");
      return { fieldServiceId, priority, nativeServiceIndex: Number(index) };
    });
    setBusy(true); setStatus("선택한 Field 설명의 현재 버전과 출처를 다시 확인하고 있습니다.");
    try {
      const result = await requestJson(
        `/v1/connections/field/${preview.connectionId}/source/publish`, "POST",
        { expectedSourceRevision: preview.sourceRevision, expectedContentHash: preview.contentHash,
          expectedNativeReleaseId: mappingOptions.nativeReleaseId,
          includeBusinessIntroduction: includeBusiness, includeFaqs, includedServiceIds: selectedServices,
          serviceMappings });
      if (result.status === 200 || result.status === 201) {
        const saved = await requestJson(`/v1/connections/field/${preview.connectionId}/source`);
        if (saved.status !== 200) throw new Error("source_read_failed");
        setPreview(saved.data as SavedSource);
        await loadMappingOptions(saved.data as SavedSource);
        setStatus("선택한 Field 설명을 AP 지식 공개본으로 만들었습니다. 고객 AI에 반영하려면 AI 설정에서 새 지식 버전을 승인해 주세요.");
      } else {
        const reason = (result.data as { error?: string }).error;
        setStatus(reason === "native_knowledge_release_required"
          ? "먼저 AP 사업 정보에서 직접 입력 지식을 승인해 주세요."
          : reason === "source_mapping_conflict"
            ? "AP 서비스와 겹치는 Field 서비스의 출처 처리 방법을 각각 선택해 주세요."
            : reason === "native_knowledge_release_changed"
              ? "AP 직접 승인 지식이 변경됐습니다. 검토 자료를 다시 열고 매핑을 재확인해 주세요."
            : reason === "source_numeric_review_required"
              ? "선택한 소개·서비스·FAQ에 숫자가 있습니다. 가격·시간 등 중요값은 현재 고객 AI의 정적 근거로 공개할 수 없습니다."
              : result.status === 409 ? "Field 출처가 변경됐습니다. 다시 가져와 검토해 주세요."
                : result.status === 502 || result.status === 503
                  ? "Field 현재 상태를 확인하지 못해 공개하지 않았습니다."
                  : `AP 지식 공개에 실패했습니다 (${result.status}).`);
      }
    } catch { setStatus("공개 결과를 확인하지 못했습니다. 저장 상태를 다시 열어 확인해 주세요."); }
    finally { setBusy(false); }
  }

  async function loadConnections() {
    const result = await requestJson("/v1/connections/field");
    if (result.status === 200) setConnections((result.data as { connections: Connection[] }).connections);
  }

  async function revoke(connectionId: string) {
    if (revokeCheckedId !== connectionId) return;
    setBusy(true); setStatus("AP 연결을 해제하고 Field에 원격 회수를 요청하고 있습니다.");
    try {
      const result = await requestJson(`/v1/connections/field/${connectionId}/revoke`, "POST", {});
      if (result.status === 200) {
        setRevokeCheckedId("");
        setPreview(current => current?.connectionId === connectionId ? null : current);
        await loadConnections();
        setStatus("AP 연결을 해제했습니다. Field 원격 회수 상태를 확인해 주세요. 기존 AP 문의와 Field 예약은 남습니다.");
      } else setStatus(result.status === 404 ? "이 연결의 AP owner 권한을 확인할 수 없습니다."
        : `연결 해제에 실패했습니다 (${result.status}). 다시 상태를 확인해 주세요.`);
    } catch { setStatus("연결 해제 결과를 확인하지 못했습니다. 상태를 새로고침한 뒤 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  async function inspectCapabilities(connectionId: string) {
    setBusy(true); setStatus("Field 공개 기능과 현재 동의를 확인하고 있습니다.");
    try {
      const result = await requestJson(`/v1/connections/field/${connectionId}/capabilities`);
      if (result.status === 200) {
        setCapabilityResults(current => ({ ...current,
          [connectionId]: result.data as CapabilityResult }));
        setStatus("Field 공개 기능을 확인했습니다. 기능 지원과 실제 사이트 설치·업무 연결은 별도 상태입니다.");
      } else {
        setCapabilityResults(current => { const next = { ...current }; delete next[connectionId]; return next; });
        setStatus(result.status === 409 ? "Field 계약 버전이나 연결 상태가 현재 AP와 맞지 않습니다."
          : result.status === 502 || result.status === 503
            ? "Field 기능 상태를 확인하지 못했습니다. 기존 AP 상담과 Field 직접 문의·예약은 계속 이용할 수 있습니다."
            : `Field 기능 조회에 실패했습니다 (${result.status}).`);
      }
    } catch { setStatus("Field 기능 상태를 확인하지 못했습니다."); }
    finally { setBusy(false); }
  }

  const hasReference = uuid.test(fieldConnectionId) && uuid.test(apGrantId);
  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Agent Platform" /></a>
    <nav aria-label="작업 메뉴"><a href="/workspace">사업 정보</a><a href="/workspace/ai">AI 설정</a><a href="/workspace/deployments">상담 배포</a></nav></header>
    <main className="feature-section"><div className="feature-heading"><p className="eyebrow">Agent Platform · 외부 서비스 연결</p>
      <h1>Field 정보 제공 동의</h1><p>AP 조직의 AI와 Field 사업장은 각각 별도 계정으로 승인합니다.</p></div>
      <p role="status" className="state-message">{status}</p>
      {phase === "loading" && <p>계정 상태를 확인하고 있습니다.</p>}
      {phase === "auth" && <section className="special-panel"><h2>AP 계정 로그인</h2><form className="form-fields" onSubmit={event => void signIn(event)}>
        <label>이메일<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label>비밀번호<input type="password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <button type="submit" disabled={busy}>로그인</button></form><p>AP 계정이 없다면 <a href="/workspace">사업 정보 화면</a>에서 만드세요.</p></section>}
      {phase === "ready" && <div className="agent-field-layout"><section className="special-panel"><h2>Field 사업장 승인</h2>
        <p>Field 연결 기록에서 이동한 AP owner만 시작할 수 있습니다. Field 로그인 화면에서 별도 사업장과 공개 정보 읽기 범위를 선택합니다.</p>
        <button type="button" disabled={busy || !hasReference} onClick={() => void start()}>Field 사업장 정보 제공 동의 시작</button>
        {!hasReference && <p>먼저 <a href={fieldWorkspaceUrl}>Field의 연결 기록</a>에서 이어 진행해 주세요.</p>}
        <p>양쪽 동의 뒤에도 승인 정보 검토와 사이트 설치가 끝나기 전까지 상담 연결은 활성화되지 않습니다.</p></section>
        <aside className="special-panel agent-field-connections"><h2>연결 기록</h2>
          <button type="button" disabled={busy} onClick={() => void loadConnections()}>상태 새로고침</button>
          {connections.length === 0 ? <p>아직 Field 연결 기록이 없습니다.</p>
          : <ul>{connections.map(item => { const capability = capabilityResults[item.id]; return <li key={item.id}><strong>AP AI {item.apAgentId}</strong>
            <p>Field 사업장 {item.fieldOrganizationId}</p><p>{item.status === "review_required" ? "양쪽 동의 완료 · 검토 및 설치 대기"
              : item.status === "binding_unknown" ? "연결 결과 확인 필요"
                : item.status === "degraded" ? "Field 권한 확인 필요"
                  : item.status === "revoked" ? "AP 연결 해제됨" : item.status}</p>
            {item.status === "revoked" && <p>Field 원격 회수: {item.remoteRevokeState === "acked" ? "확인됨"
              : item.remoteRevokeState === "blocked" ? "전달 차단 · 관리자 확인 필요"
                : item.remoteRevokeState === "pending" || item.remoteRevokeState === "retry" || item.remoteRevokeState === "sending"
                  ? "확인 대기 · 자동 재시도 중" : "Field 연결 상태 확인 필요"}. 기존 AP 문의와 Field 예약은 유지됩니다.</p>}
            {item.status === "review_required" && <button type="button" disabled={busy}
              onClick={() => void inspect(item.id)}>Field 승인 정보 가져와 검토</button>}
            {item.status === "review_required" && <button type="button" disabled={busy}
              onClick={() => void inspectCapabilities(item.id)}>Field 지원 기능 확인</button>}
            {capability && <div><p>Field 공개 계약 {capability.schemaVersion}</p>
              <ul><li>사업 정보 읽기: {capability.capabilities["facts.read"] ? "지원" : "미지원"}</li>
                <li>예약 가능 시간 읽기: {capability.capabilities["availability.read"] ? "지원" : "아직 미지원"}</li>
                <li>외부 문의·예약 요청: {capability.capabilities["request.create"] ? "지원" : "아직 미지원"}</li>
                <li>Field 예약 고객 접근 인계: {capability.capabilities["customer_access.create"] ? "지원" : "별도 동의 필요"}</li>
                <li>제안 응답: {capability.capabilities["proposal.respond"] ? "지원" : "아직 미지원"}</li></ul></div>}
            <button type="button" disabled={busy} onClick={() => void openSaved(item.id)}>
              보관된 검토 자료 열기</button>
            {item.status !== "revoked" && <div className="agent-field-revoke"><p>해제하면 AP의 Field 정보 조회·업무 전달을 즉시 멈추고 Field에도 연결 해제를 요청합니다. 기존 예약의 고객 확인키는 유지됩니다. 진행 중인 연락은 직접 확인해 주세요.</p>
              <label><input type="checkbox" checked={revokeCheckedId === item.id}
                onChange={event => setRevokeCheckedId(event.target.checked ? item.id : "")} />
                기존 AP 문의와 Field 예약은 남기고 이 연결을 해제합니다.</label>
              <button type="button" disabled={busy || revokeCheckedId !== item.id}
                onClick={() => void revoke(item.id)}>이 연결 해제</button></div>}</li>; })}</ul>}
          {preview && <section aria-label="Field 승인 정보 검토"><h3>{preview.facts.businessName}</h3>
            <p>Field 원본 개정 {preview.sourceRevision} · AP 공개 전 검토 자료</p>
            {preview.state === "integrity_conflict" && <p>같은 원본 버전에서 해시 충돌이 확인되어 승인이 중단됐습니다.</p>}
            {preview.state === "current" && <p>AP 정보 출처 검토 승인 완료 · 고객 AI 반영 대기</p>}
            {preview.knowledgeReleaseId && <p>AP 지식 공개본 생성 완료 · <a href="/workspace/ai">AI 설정에서 새 지식 버전 승인</a></p>}
            {preview.facts.introduction && <p>{preview.facts.introduction}</p>}
            {preview.facts.region && <p>지역: {preview.facts.region}</p>}
            {preview.facts.openingHours && <p>영업시간: {preview.facts.openingHours}</p>}
            {preview.facts.services.length > 0 && <ul>{preview.facts.services.map(service => <li key={service.id}>
              <strong>{service.name}</strong>{service.description && <p>{service.description}</p>}
              {service.priceAmount !== undefined && service.priceAmount !== null
                && <p>Field 공개 가격: {service.priceAmount.toLocaleString()}원 · 실제 조건 재확인 필요</p>}
            </li>)}</ul>}
            {(preview.facts.faqs ?? []).length > 0 && <div><h4>Field 승인 FAQ</h4><dl>{preview.facts.faqs!.map((faq, index) => <div key={index}><dt>{faq.question}</dt><dd>{faq.answer}</dd></div>)}</dl></div>}
            {preview.state === "pending_review" && <div><label><input type="checkbox"
              checked={reviewConfirmed} onChange={event => setReviewConfirmed(event.target.checked)} />
              표시된 Field 원본 개정과 서비스·FAQ를 검토했습니다.</label>
              <button type="button" disabled={busy || !reviewConfirmed}
                onClick={() => void approveSource()}>이 Field 정보 출처 승인</button></div>}
            {preview.state === "current" && <div className="form-fields"><h4>AP 지식으로 공개할 설명 선택</h4>
              <p>가격·영업시간·예약 가능 여부는 고객 AI의 정적 근거에 넣지 않습니다.</p>
              {mappingOptions ? <div className="agent-source-mapping"><p>AP 직접 승인 지식 {mappingOptions.nativeKnowledgeRevision}번째 공개본</p>
                {mappingOptions.services.length > 0 ? <ul>{mappingOptions.services.map(service => <li key={service.index}>
                  <strong>{service.name}</strong><p>{service.description}</p></li>)}</ul>
                  : <p>AP 직접 승인 서비스가 없습니다.</p>}
                <p>같은 서비스라면 어느 설명을 고객 AI에 쓸지 선택하세요. Field 설명 우선은 새 AP 지식 공개본에서 대응하는 AP 설명을 제외합니다. AP 원본 승인본은 유지됩니다.</p>
              </div> : <p>AP 직접 승인 지식이 필요합니다. <a href="/workspace">사업 정보에서 승인</a>해 주세요.</p>}
              <label><input type="checkbox" checked={includeBusiness}
                onChange={event => setIncludeBusiness(event.target.checked)} /> 사업장 소개와 지역</label>
              {(preview.facts.faqs ?? []).length > 0 && <label><input type="checkbox" checked={includeFaqs}
                onChange={event => setIncludeFaqs(event.target.checked)} /> 승인된 FAQ {preview.facts.faqs!.length}건</label>}
              {preview.facts.services.map(service => <div className="agent-service-choice" key={service.id}>
                <label><input type="checkbox" checked={selectedServices.includes(service.id)}
                  onChange={event => setSelectedServices(current =>
                    event.target.checked ? [...current, service.id] : current.filter(id => id !== service.id))} />
                  {service.name} 설명</label>
                {selectedServices.includes(service.id) && mappingOptions && <label>출처 처리
                  <select value={serviceChoices[service.id] ?? ""} onChange={event =>
                    setServiceChoices(current => ({ ...current, [service.id]: event.target.value }))}>
                    <option value="">처리 방법 선택</option>
                    <option value="separate">별도 서비스로 유지 · AP와 Field 설명 모두 사용</option>
                    {mappingOptions.services.map(native => <optgroup key={native.index} label={`AP: ${native.name}`}>
                      <option value={`native:${native.index}`}>AP 설명 우선 · {native.name}</option>
                      <option value={`field:${native.index}`}>Field 설명 우선 · {native.name}</option>
                    </optgroup>)}
                  </select></label>}
              </div>)}
              <button type="button" disabled={busy || !mappingOptions
                || (!includeBusiness && !includeFaqs && selectedServices.length === 0)
                || selectedServices.some(id => !serviceChoices[id])}
                onClick={() => void publishSource()}>선택한 설명을 AP 지식 공개본으로 만들기</button></div>}
            <p>출처 승인과 AP 지식 공개 뒤에도 새 AI 버전의 사업자 승인이 필요합니다. 가격과 예약 조건은 Field 현재값을 별도로 확인해야 합니다.</p>
          </section>}
          <p>AP 상담 링크·외부 위젯은 Field 연결 없이 사용할 수 있습니다.</p></aside></div>}
    </main></div>;
}
