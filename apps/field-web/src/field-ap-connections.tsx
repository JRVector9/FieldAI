"use client";

import { useCallback, useEffect, useState } from "react";
import { Brand } from "@fieldai/ui";
import { requestJson } from "./field-api";
import { FieldSourceRefresh } from "./field-source-refresh";
import { FieldApPublicInstallation } from "./field-ap-public-installation";

type Connection = { id: string; organizationId: string; apOrganizationId: string;
  apGrantId: string; apAgentId: string; apAgentName: string; scopes: string[];
  status: string; remoteRevokeState: string | null; createdAt: string };
type Deployment = { id: string; publicId: string;
  kind: "link" | "owned_embed" | "placement_embed"; origin: string | null };
type Installation = { connectionId: string; deploymentId: string; publicId: string;
  origin: string; mode: "inline" | "floating"; status: "active" | "paused"; publicIntent?: boolean };
const apWebOrigin = process.env.NEXT_PUBLIC_AGENT_WEB_URL ?? "http://localhost:3001";

export function FieldApConnections() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionState, setConnectionState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [status, setStatus] = useState("Field 사업장과 연결 상태를 확인하고 있습니다.");
  const [busy, setBusy] = useState(false);
  const [siteOrigin, setSiteOrigin] = useState<string | null>(null);
  const [sitePublished, setSitePublished] = useState(false);
  const [siteState, setSiteState] = useState<"idle" | "loading" | "ready" | "no_site" | "failed">("idle");
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [connectionId, setConnectionId] = useState("");
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploymentState, setDeploymentState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [deploymentRefresh, setDeploymentRefresh] = useState(0);
  const [deploymentId, setDeploymentId] = useState("");
  const [proof, setProof] = useState("");
  const [mode, setMode] = useState<"inline" | "floating">("floating");
  const [revokeCheckedId, setRevokeCheckedId] = useState("");

  const loadInstallation = useCallback(async () => {
    setSiteState("loading");
    try {
      const result = await requestJson("/v1/sites/ap-installation");
      if (result.status === 200) {
        const value = result.data as { siteOrigin: string | null; published: boolean;
          installation: Installation | null };
        setSiteOrigin(value.siteOrigin);
        setSitePublished(value.published);
        setInstallation(value.installation);
        setSiteState("ready");
      } else if (result.status === 404 && (result.data as { error?: string }).error === "site_not_found") {
        setSiteOrigin(null);
        setSitePublished(false);
        setInstallation(null);
        setSiteState("no_site");
      } else setSiteState("failed");
    } catch { setSiteState("failed"); }
  }, []);

  const loadConnections = useCallback(async () => {
    setConnectionState("loading");
    try {
      const result = await requestJson("/v1/connections/ap");
      if (result.status !== 200) { setConnectionState("failed"); return; }
      const records = (result.data as { connections: Connection[] }).connections;
      setConnections(records);
      setConnectionId(current => records.some(item => item.id === current && item.status === "review_required")
        ? current : records.find(item => item.status === "review_required")?.id ?? "");
      setConnectionState("ready");
    } catch { setConnectionState("failed"); }
  }, []);

  useEffect(() => {
    const result = new URLSearchParams(location.search).get("result");
    void requestJson("/v1/business/draft")
      .then(business => {
        if (business.status === 401) { setStatus("Field 사업자 로그인이 필요합니다. 사업 운영 화면에서 로그인해 주세요."); return; }
        if (business.status !== 200) { setStatus("먼저 Field 사업장을 만들어 주세요."); return; }
        setOrganizationId((business.data as { organizationId: string }).organizationId);
        setStatus(result === "denied" ? "AP 접근 동의가 거부됐습니다. Field 사이트와 직접 문의·예약은 계속 이용할 수 있습니다."
          : result === "unknown" ? "AP 승인 결과를 확인하지 못했습니다. 새 연결을 시작하기 전에 관리자에게 상태 확인을 요청해 주세요."
            : result === "pending_field_consent" ? "AP 접근이 승인됐습니다. Field 정보 제공의 별도 동의와 양쪽 조직 매핑은 아직 필요합니다."
              : "AP는 별도 계정으로 승인합니다. Field 기능은 연결 여부와 관계없이 동작합니다.");
      }).catch(() => setStatus("Field 서버에 연결할 수 없습니다."));
  }, []);

  useEffect(() => {
    if (organizationId) {
      void loadConnections();
      void loadInstallation();
    }
  }, [organizationId, loadConnections, loadInstallation]);

  useEffect(() => {
    if (connectionState !== "ready" || !connectionId || !siteOrigin || !sitePublished) {
      setDeployments([]); setDeploymentId(""); setDeploymentState("idle"); return;
    }
    let active = true;
    setDeploymentState("loading");
    void requestJson(`/v1/connections/ap/${connectionId}/deployments`).then(result => {
      if (!active) return;
      if (result.status !== 200) { setDeployments([]); setDeploymentState("failed"); return; }
      const allowed = (result.data as { deployments: Deployment[] }).deployments
        .filter(item => item.kind === "owned_embed" && item.origin === siteOrigin);
      setDeployments(allowed);
      setDeploymentId(current => allowed.some(item => item.id === current) ? current : allowed[0]?.id ?? "");
      setDeploymentState("ready");
    }).catch(() => { if (active) { setDeployments([]); setDeploymentState("failed"); } });
    return () => { active = false; };
  }, [connectionId, connectionState, siteOrigin, sitePublished, deploymentRefresh]);

  async function storeProof() {
    setBusy(true);
    try {
      const result = await requestJson("/v1/sites/verification", "POST", { proof: proof.trim() });
      setStatus(result.status === 200 || result.status === 201
        ? "사이트 주소 증명값을 저장했습니다. AP에서 이 배포의 소유 확인과 활성화를 진행해 주세요."
        : `사이트 주소 증명값 저장에 실패했습니다 (${result.status}).`);
    } catch { setStatus("사이트 주소 증명값을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function install() {
    if (!sitePublished || connectionState !== "ready" || deploymentState !== "ready" || !connectionId || !deploymentId) return;
    setBusy(true);
    try {
      const result = await requestJson("/v1/sites/ap-installation", "POST", { connectionId, deploymentId, mode });
      if (result.status === 200 || result.status === 201) {
        setInstallation({ connectionId, deploymentId, publicId: (result.data as { publicId: string }).publicId,
          origin: siteOrigin!, mode, status: "active" });
        setStatus("공개 사이트에 AP 상담 위젯을 설치했습니다. 공개 주소에서 확인해 주세요.");
      } else setStatus(`설치할 수 없습니다 (${result.status}). AP 배포·접근 동의·사이트 주소를 확인해 주세요.`);
    } catch { setStatus("AP 연결 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  async function pause() {
    setBusy(true);
    try {
      const result = await requestJson("/v1/sites/ap-installation/pause", "POST", {});
      if (result.status === 200) {
        setInstallation(current => current ? { ...current, status: "paused" } : current);
        setStatus("Field 공개 사이트에서 AP 상담 위젯을 중지했습니다. 직접 문의와 예약은 계속 열려 있습니다.");
      } else setStatus(`위젯 중지에 실패했습니다 (${result.status}).`);
    } catch { setStatus("위젯 중지를 전달하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function start() {
    if (!organizationId) return;
    setBusy(true); setStatus("AP 승인 페이지로 이동할 연결 요청을 준비합니다.");
    try {
      const response = await requestJson("/v1/connections/ap/start", "POST", { organizationId });
      if (response.status === 201) {
        const authorizationUrl = (response.data as { authorizationUrl: string }).authorizationUrl;
        location.assign(authorizationUrl);
        return;
      }
      setStatus(response.status === 503
        ? "AP 연결 설정이 아직 없습니다. Field 자체 사이트·직접 문의·예약은 계속 이용할 수 있습니다."
        : response.status === 404 ? "이 사업장의 연결 권한이 없습니다. Field owner로 로그인해 주세요."
          : `연결 시작에 실패했습니다 (${response.status}).`);
    } catch { setStatus("연결 요청을 전달하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    if (revokeCheckedId !== id) return;
    setBusy(true); setStatus("Field 연결을 해제하고 AP 회수 요청을 기록하고 있습니다.");
    try {
      const result = await requestJson(`/v1/connections/ap/${id}/revoke`, "POST", {});
      if (result.status !== 200) {
        setStatus(`연결 해제 요청을 저장하지 못했습니다 (${result.status}).`); return;
      }
      const outcome = result.data as { remoteState: string };
      setConnections(current => current.map(item => item.id === id
        ? { ...item, status: "revoked", remoteRevokeState: outcome.remoteState } : item));
      setInstallation(current => current?.connectionId === id ? { ...current, status: "paused" } : current);
      if (connectionId === id) setConnectionId("");
      setRevokeCheckedId("");
      setStatus(outcome.remoteState === "not_connected"
        ? "Field 연결을 해제했습니다. AP와 양방향 연결되기 전이어서 원격 회수 대상이 없습니다."
        : "Field 연결을 즉시 차단했습니다. AP 회수 결과는 아래에서 확인해 주세요. 기존 예약은 유지됩니다.");
    } catch { setStatus("해제 요청의 결과를 확인하지 못했습니다. 연결 기록을 다시 열어 확인해 주세요."); }
    finally { setBusy(false); }
  }

  const selectedInstallation = installation?.status === "active" && installation.connectionId === connectionId;
  const installedDeploymentAvailable = selectedInstallation && deployments.some(item =>
    item.id === installation.deploymentId && item.publicId === installation.publicId);
  const installedConnection = installation && connections.find(item => item.id === installation.connectionId);

  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Field" /></a><nav aria-label="작업 메뉴"><a href="/workspace">사업 운영</a><a href="/workspace/site">사이트 편집</a></nav></header>
    <main className="feature-section"><div className="feature-heading"><p className="eyebrow">Field · 외부 서비스 연결</p><h1>AI 상담 연결</h1><p>Field 사업장과 별도 AP 계정의 AI 접근을 승인합니다.</p></div>
      <p className="state-message" role="status">{status}</p>
      <div className="special-grid"><section className="special-panel"><h2>AP 접근 승인</h2><p>AP에서 조직과 AI를 직접 선택하고 대화 읽기·답변·정보 갱신 범위를 각각 동의합니다. 기존 연결에 필요한 범위가 없으면 다시 승인해야 합니다. 승인이 끝나도 Field 정보 제공 동의와 사이트 설치는 별도 단계입니다.</p>
        <button type="button" disabled={busy || !organizationId} onClick={() => void start()}>AP 계정 연결 시작</button>
        {!organizationId && <p>Field 사업장 owner 계정으로 먼저 로그인해 주세요.</p>}
        <p><a href="/workspace">Field 사업 운영으로 돌아가기</a></p></section>
        <aside className="special-panel"><div className="panel-heading"><h2>연결 기록</h2><button type="button" disabled={busy || !organizationId || connectionState === "loading"} onClick={() => void loadConnections()}>상태 새로고침</button></div>
          {connectionState === "idle" && <p>Field 사업장을 확인한 뒤 연결 기록을 불러옵니다.</p>}
          {connectionState === "loading" && <p role="status">AP 연결 기록을 확인하고 있습니다.</p>}
          {connectionState === "failed" && <div className="state-message" role="alert"><p>연결 목록을 확인하지 못했습니다. 승인된 연결이 없다고 판단하지 않습니다.</p><button type="button" onClick={() => void loadConnections()}>연결 기록 다시 확인</button></div>}
          {connectionState === "failed" && connections.length > 0 && <p>아래 내용은 마지막으로 확인한 연결 기록입니다. 재조회 후 조작할 수 있습니다.</p>}
          {connectionState === "ready" && connections.length === 0 && <p>아직 승인된 AP 연결이 없습니다.</p>}
          {connections.length > 0 && <ul>{connections.map(item => <li key={item.id}><strong>{item.apAgentName}</strong><p>AP 조직 {item.apOrganizationId}</p>
              <p>{item.status === "pending_field_consent" ? "AP 승인 완료 · Field 정보 제공 동의 대기"
                : item.status === "review_required" ? "양쪽 동의 완료 · 정보 검토 및 설치 대기"
                  : item.status === "degraded" ? "AP 권한 확인 실패 · 새 연결 승인 필요"
                    : item.status === "revoked" ? "Field 연결 해제됨" : item.status}</p>
              {item.status === "revoked" && <p>AP 원격 회수: {item.remoteRevokeState === "acked" ? "완료"
                : item.remoteRevokeState === "blocked" ? "차단됨 · 운영 확인 필요"
                  : item.remoteRevokeState === "pending" || item.remoteRevokeState === "retry"
                    || item.remoteRevokeState === "sending" ? "대기 중 · 자동 재시도"
                      : "양방향 연결 전 또는 수동 확인 필요"}. 기존 Field 예약은 유지됩니다.</p>}
              {connectionState === "ready" && item.status === "pending_field_consent" && item.apGrantId && <p><a href={`${apWebOrigin}/workspace/integrations?fieldConnectionId=${encodeURIComponent(item.id)}&apGrantId=${encodeURIComponent(item.apGrantId)}`}>
                AP에서 Field 정보 제공 동의 계속하기</a></p>}{connectionState === "ready" && item.status === "review_required" && <button type="button" onClick={() => setConnectionId(item.id)} aria-pressed={connectionId === item.id}>이 연결로 설치</button>}
              {connectionState === "ready" && item.status === "review_required" && <FieldSourceRefresh connectionId={item.id} scopes={item.scopes} />}
              {connectionState === "ready" && item.status !== "revoked" && <div><label><input type="checkbox" checked={revokeCheckedId === item.id} onChange={event => setRevokeCheckedId(event.target.checked ? item.id : "")} /> 기존 예약과 고객 확인키는 남기고 이 연결을 해제합니다.</label><button type="button" disabled={busy || revokeCheckedId !== item.id} onClick={() => void revoke(item.id)}>이 연결 해제</button></div>}
            </li>)}</ul>}
          <p>Field의 사이트 제작, 직접 문의와 예약은 AP 연결 없이 사용할 수 있습니다.</p></aside></div>
      <section className="special-panel field-ap-installation"><h2>Field 사이트에 AP 상담 설치</h2>
        {siteState === "idle" && <p>Field 사업자 계정과 사이트 상태를 확인한 뒤 설치할 수 있습니다.</p>}
        {siteState === "loading" && <p role="status">사이트 설치 상태를 확인하고 있습니다.</p>}
        {siteState === "failed" && <div className="state-message" role="alert"><p>사이트 설치 상태를 확인하지 못했습니다. 공개 여부나 기존 설치를 추측하지 않습니다.</p><button type="button" onClick={() => void loadInstallation()}>사이트 설치 상태 다시 확인</button></div>}
        {siteState === "no_site" && <p>아직 Field 사이트를 만들지 않았습니다. <a href="/workspace/site">사이트 제작 시작하기</a></p>}
        {siteState === "ready" && !sitePublished && <div className="state-message"><p>사이트 초안 주소: {siteOrigin ? <code>{siteOrigin}</code> : "주소 확인 불가"}</p><p>고객 사이트를 공개한 뒤 AP 배포의 소유 증명과 위젯 설치를 진행할 수 있습니다. AP 계정 연결은 위에서 먼저 시작할 수 있습니다.</p><a href="/workspace/site">사이트 편집·공개 열기</a></div>}
        {siteState === "ready" && sitePublished && !siteOrigin && <div className="state-message" role="alert"><p>사이트는 공개됐지만 설치 주소를 확인하지 못했습니다. 기본 주소 설정을 확인해 주세요.</p><button type="button" onClick={() => void loadInstallation()}>사이트 설치 상태 다시 확인</button></div>}
        {siteState === "ready" && sitePublished && siteOrigin && <><p>Field 공개 사이트 주소: <code>{siteOrigin}</code></p><p><a href={`${siteOrigin}/site/${new URL(siteOrigin).hostname.split(".")[0]}`}>공개 사이트 열기</a></p>
          <ol><li>AP의 <a href={`${apWebOrigin}/workspace/deployments`}>상담 배포 관리</a>에서 위 주소의 소유 사이트 위젯을 만들고 증명값을 복사합니다.</li>
            <li>아래에 증명값을 저장한 뒤 AP에서 소유 확인과 배포 활성화를 진행합니다.</li>
            <li>AP 접근을 다시 승인할 때 활성 배포를 선택하고, 양쪽 동의 후 이 화면에서 설치합니다.</li></ol>
          <label>AP 배포 증명값<input value={proof} onChange={event => setProof(event.target.value)} placeholder="AP 배포의 verification proof" /></label>
          <button type="button" disabled={busy || !/^[A-Za-z0-9_-]{32,64}$/.test(proof.trim())} onClick={() => void storeProof()}>사이트 증명값 저장</button>
          <p>선택한 연결: {connectionId || "없음"}</p>
          {deploymentState === "idle" && <p>위 연결 기록에서 설치할 AP 연결을 선택해 주세요.</p>}
          {deploymentState === "loading" && <p role="status">허용된 AP 위젯 배포를 확인하고 있습니다.</p>}
          {deploymentState === "failed" && <div className="state-message" role="alert"><p>AP 배포 상태를 확인하지 못했습니다. 활성 배포가 없다고 판단하지 않습니다.</p><button type="button" onClick={() => setDeploymentRefresh(value => value + 1)}>AP 배포 다시 확인</button></div>}
          {installation?.status === "active" && !installation.publicIntent && connectionState === "ready" && installedConnection?.status !== "review_required" && <p role="alert" className="state-message">설치된 AP 연결을 현재 사용할 수 없습니다. Field 공개 사이트에서는 이 연결의 위젯을 표시하지 않습니다. 새로 승인된 연결로 설치하거나 아래에서 Field 위젯을 중지해 주세요. 직접 문의와 예약은 계속 열려 있습니다.</p>}
          {connectionState === "ready" && installation?.status === "active" && installedConnection?.status === "review_required" && installedConnection.id !== connectionId && <p>설치된 연결은 다른 AP 연결입니다. <button type="button" onClick={() => setConnectionId(installedConnection.id)}>설치된 연결 선택</button></p>}
          {selectedInstallation && !installation?.publicIntent && deploymentState === "ready" && !installedDeploymentAvailable && <p role="status" className="state-message">설치된 AP 배포를 현재 사용할 수 없습니다. Field 설치 기록은 남아 있습니다. AP 배포와 접근 권한을 확인하거나 아래에서 Field 위젯을 중지해 주세요. 직접 문의와 예약은 계속 열려 있습니다.</p>}
          {deploymentState === "ready" && deployments.length > 0 ? <><label>허용된 AP 위젯 배포<select value={deploymentId} onChange={event => setDeploymentId(event.target.value)}>
            {deployments.map(item => <option key={item.id} value={item.id}>{item.publicId} · {item.origin}</option>)}</select></label>
            <label>표시 방식<select value={mode} onChange={event => setMode(event.target.value as "inline" | "floating")}><option value="floating">화면 구석 버튼</option><option value="inline">본문에 표시</option></select></label>
            <button type="button" disabled={busy || !deploymentId} onClick={() => void install()}>AP 위젯 설치</button></>
            : deploymentState === "ready" && !selectedInstallation && !installation?.publicIntent && <p>이 사이트 주소에 허용된 활성 AP 위젯 배포가 없습니다. AP에서 배포를 활성화하고 접근 동의 때 선택해 주세요.</p>}
          {installation && <p>Field 설치 기록: {installation.publicId} · {installation.status === "active" ? "설치 활성 · AP 배포 상태는 별도 확인" : "Field에서 중지됨"}</p>}
          {installation?.status === "active" && <button type="button" disabled={busy} onClick={() => void pause()}>Field 사이트에서 위젯 중지</button>}
        </>}
        <FieldApPublicInstallation organizationId={organizationId} siteOrigin={siteOrigin}
          published={sitePublished && siteState === "ready"} onInstalled={() => { void loadInstallation(); }} />
      </section>
    </main></div>;
}
