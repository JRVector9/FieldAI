"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { PublicKnowledgePage } from "./agent-public";
import { AgentConsultQr } from "./AgentConsultQr";
import { DELETION_SCHEDULED_OWNER_MESSAGE, isDeletionScheduledError } from "./deletion-scheduled-copy";

type Deployment = { id: string; publicId: string; kind: "link" | "owned_embed";
  origin: string | null; verificationProof: string | null; verifiedAt: string | null;
  status: "pending" | "active" | "paused"; moderationRestricted?: boolean; knowledgeRevision: number | null;
  // 최신 승인 AI·지식에 연결돼 있는지(API 계산값). false면 공개 경로가 열리지 않는다.
  current?: boolean };
type CreateRequest = { kind: Deployment["kind"]; origin?: string; idempotencyKey: string };
async function requestJson(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
// 최신 승인과 연결이 끊긴 활성 배포를 기존 활성화 API로 다시 연결한다.
export function DeploymentReconnect({ id, busy, onReconnect }: { id: string; busy: boolean; onReconnect: (id: string) => void }) {
  return <button type="button" disabled={busy} onClick={() => onReconnect(id)}>최신 승인으로 다시 연결 (추가)</button>;
}
export function AgentDeployments() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [origin, setOrigin] = useState("");
  const [status, setStatus] = useState("설치 상태를 불러오는 중입니다.");
  const [busy, setBusy] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed" | "needs_setup">("loading");
  const [pendingCreate, setPendingCreate] = useState<CreateRequest | null>(null);
  const load = useCallback(async () => {
    setLoadState("loading"); setStatus("설치 상태를 불러오는 중입니다.");
    try {
      const result = await requestJson("/v1/deployments");
      if (result.status === 200 && Array.isArray((result.data as { deployments?: unknown }).deployments)) {
        setDeployments((result.data as { deployments: Deployment[] }).deployments);
        setLoadState("ready"); setStatus(""); return true;
      }
      if (result.status === 401 || result.status === 404) {
        setLoadState("needs_setup"); setStatus("AP에 로그인하고 조직·AI 설정을 승인한 뒤 다시 열어 주세요.");
      } else {
        setLoadState("failed"); setStatus(`배포 목록을 불러오지 못했습니다 (${result.status}). 다시 시도해 주세요.`);
      }
    } catch {
      setLoadState("failed"); setStatus("배포 목록을 불러오지 못했습니다. AP 서버 연결을 확인하고 다시 시도해 주세요.");
    }
    return false;
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function sendCreate(request: CreateRequest) {
    setPendingCreate(request); setBusy(true); setStatus("배포를 만들고 있습니다.");
    try {
      const result = await requestJson("/v1/deployments", "POST", request);
      if (result.status === 200 || result.status === 201) {
        setPendingCreate(null);
        const loaded = await load();
        setStatus(loaded
          ? request.kind === "link" ? "상담 링크를 만들었습니다. 활성화 후 고객에게 전달할 수 있습니다."
            : "설치 주소를 등록했습니다. 소유 증명 뒤 활성화하세요."
          : "배포는 생성됐지만 목록을 다시 읽지 못했습니다. 다시 불러오기로 확인해 주세요.");
      } else if (result.status >= 500) {
        setStatus("배포 생성 결과를 확인할 수 없습니다. 생성 결과 확인으로 같은 요청을 안전하게 다시 확인해 주세요.");
      } else {
        setPendingCreate(null);
        setStatus(isDeletionScheduledError(result.status, result.data) ? DELETION_SCHEDULED_OWNER_MESSAGE
          : result.status === 409 ? "승인 지식·AI 설정 또는 생성 요청 키가 충돌했습니다. 목록을 다시 확인해 주세요."
          : `배포를 만들지 못했습니다 (${result.status}). 정확한 사이트 origin을 입력해 주세요.`);
      }
    } catch { setStatus("배포 생성 결과를 확인할 수 없습니다. 생성 결과 확인으로 같은 요청을 안전하게 다시 확인해 주세요."); }
    finally { setBusy(false); }
  }
  async function create(kind: Deployment["kind"], event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy || loadState !== "ready" || pendingCreate) return;
    await sendCreate({ kind, ...(kind === "owned_embed" ? { origin } : {}), idempotencyKey: crypto.randomUUID() });
  }
  async function action(id: string, kind: "verify" | "activate" | "pause") {
    if (busy || loadState !== "ready" || pendingCreate) return;
    setBusy(true); setStatus("배포 상태를 확인하고 있습니다.");
    try {
      const result = await requestJson(`/v1/deployments/${id}/${kind}`, "POST");
      if (result.status === 200) {
        const loaded = await load();
        setStatus(loaded
          ? kind === "verify" ? "사이트 소유 확인이 완료됐습니다." : kind === "activate" ? "상담 배포를 활성화했습니다." : "상담 배포를 중지했습니다."
          : kind === "activate" ? "상담 배포를 활성화했지만 목록을 다시 읽지 못했습니다. 다시 불러오기로 확인해 주세요."
            : "상태 변경은 완료됐지만 목록을 다시 읽지 못했습니다. 다시 불러오기로 확인해 주세요.");
      } else if (isDeletionScheduledError(result.status, result.data)) setStatus(DELETION_SCHEDULED_OWNER_MESSAGE);
      else if (result.status === 409 && (result.data as { error?: string }).error === 'deployment_moderation_restricted') {
        await load(); setStatus('신고 검토로 해당 상담 배포가 제한되었습니다. 신고·검토 결과를 확인해 주세요.');
      } else if (result.status === 409 && (result.data as { error?: string }).error === 'knowledge_stale') {
        // 지식만 재승인되고 AI 설정은 이전 지식에 묶여 있으면 재연결할 수 없다
        setStatus("지식은 새로 승인됐지만 AI 설정이 이전 지식에 묶여 있습니다. AI 설정을 다시 승인한 뒤 재연결해 주세요.");
      } else if (result.status === 409) setStatus("사이트 소유 증명 또는 최신 AI·지식 승인이 필요합니다. 증명값과 승인 버전을 확인해 주세요.");
      else if (result.status >= 500) {
        setLoadState("failed"); setStatus("배포 상태 변경 결과를 확인할 수 없습니다. 다시 불러오기로 실제 상태를 확인해 주세요.");
      } else setStatus(`상태를 변경하지 못했습니다 (${result.status}).`);
    } catch {
      setLoadState("failed"); setStatus("배포 상태 변경 결과를 확인할 수 없습니다. 다시 불러오기로 실제 상태를 확인해 주세요.");
    }
    finally { setBusy(false); }
  }
  const base = typeof window === "undefined" ? "" : window.location.origin;
  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Agent Platform" /></a><nav aria-label="작업 메뉴"><a href="/workspace">사업 정보</a><a href="/workspace/ai">AI 설정</a></nav></header><main className="feature-section"><div className="feature-heading"><p className="eyebrow">Agent Platform · 상담 배포</p><h1>상담 링크와 소유 사이트 설치</h1><p>승인된 AI·지식 버전에 배포를 연결합니다. 공급사 모델 연결 전에는 승인 정보와 사람 문의로 안내합니다.</p></div>{status && <p role="status" className="state-message">{status}</p>}
    {loadState === "failed" && <button type="button" disabled={busy} onClick={() => void load()}>다시 불러오기</button>}
    {loadState === "needs_setup" && <p><a href="/workspace">AP 작업 공간 열기</a></p>}
    {pendingCreate && <section className="special-panel"><h2>생성 요청 상태</h2><p>배포 생성 결과를 확인할 수 없습니다. 같은 요청 키로 결과를 확인해 주세요.</p><button type="button" disabled={busy} onClick={() => void sendCreate(pendingCreate)}>생성 결과 확인</button></section>}
    {loadState === "ready" && !pendingCreate && <><div className="special-grid"><section className="special-panel"><h2>AP 상담 링크</h2><p>매체·광고 캠페인·Field 계정 없이 사용할 수 있습니다.</p><button type="button" disabled={busy} onClick={() => void create("link")}>상담 링크 만들기</button></section><section className="special-panel"><h2>소유 사이트 위젯</h2><p>사이트의 정확한 origin을 입력합니다. 운영 HTTPS 주소는 DNS TXT, 로컬 Field 사이트는 증명값 공개 뒤 설치 코드를 활성화할 수 있습니다.</p><form className="form-fields" onSubmit={event => void create("owned_embed", event)}><label>사이트 origin<input type="url" required placeholder="https://example.com" value={origin} onChange={event => setOrigin(event.target.value)} /></label><button type="submit" disabled={busy}>위젯 등록</button></form></section></div>
    <section className="special-panel"><h2>배포 목록</h2>{deployments.length === 0 ? <p>만든 상담 배포가 없습니다.</p> : <div className="deployment-list">{deployments.map(item => <article key={item.id} className="knowledge-source"><h3>{item.kind === "link" ? "상담 링크" : "소유 사이트 위젯"} · {item.moderationRestricted ? "검토 제한" : item.status}{item.current === false && " · 최신 승인과 연결 끊김"}</h3>{item.moderationRestricted && <p>상담 배포 제한 중 · 기존 문의와 승인 정보는 유지됩니다. <a href="/workspace/moderation">신고·검토 결과와 이의 제출</a></p>}{item.origin && <p>허용 origin: {item.origin}</p>}{item.verificationProof && !item.verifiedAt && (item.origin && new URL(item.origin).hostname.endsWith(".localhost") ? <p>로컬 사이트의 소유 증명 경로 <code>{item.origin}/.well-known/ap-site-verification</code>에 다음 한 줄을 공개한 뒤 소유 확인을 누르세요. <code>ap-site-verification={item.verificationProof}</code>{item.origin.endsWith(".localhost:3002") && <> Field 사이트라면 AI 상담 연결 화면에 증명값을 저장할 수 있습니다.</>}</p> : <p>DNS TXT: <code>_agent-platform.{new URL(item.origin!).hostname}</code> 값 <code>ap-site-verification={item.verificationProof}</code></p>)}{item.verifiedAt && <p>사이트 소유 확인 완료</p>}{item.status === "active" && !item.moderationRestricted && item.current !== false && <p>승인 지식 {item.knowledgeRevision}번에 연결됨. AI 응답은 공급사 설정과 사용 한도에 따라 제공됩니다.</p>}{item.kind === "link" && item.status === "active" && !item.moderationRestricted && <><p>고객 링크: <a href={`/consult/${item.publicId}`}>{base}/consult/{item.publicId}</a></p><AgentConsultQr url={`${base}/consult/${item.publicId}`} publicId={item.publicId} /></>}{item.kind === "owned_embed" && item.status === "active" && !item.moderationRestricted && <div><p>본문에 표시하는 코드:</p><code>{`<script async src="${base}/sdk/v1.js" data-deployment="${item.publicId}" data-mode="inline"></script>`}</code><p>화면 구석 버튼으로 표시하는 코드:</p><code>{`<script async src="${base}/sdk/v1.js" data-deployment="${item.publicId}" data-mode="floating"></script>`}</code></div>}<div className="form-actions">{item.kind === "owned_embed" && !item.verifiedAt && <button type="button" disabled={busy} onClick={() => void action(item.id, "verify")}>소유 확인</button>}{item.status !== "active" ? <button type="button" disabled={busy || item.moderationRestricted || (item.kind === "owned_embed" && !item.verifiedAt)} onClick={() => void action(item.id, "activate")}>활성화</button> : <button type="button" disabled={busy} onClick={() => void action(item.id, "pause")}>중지</button>}{item.status === "active" && !item.moderationRestricted && item.current === false && <DeploymentReconnect id={item.id} busy={busy} onReconnect={id => void action(id, "activate")} />}</div></article>)}</div>}</section></>}
  </main></div>;
}

export function AgentConsult({ publicId }: { publicId: string }) {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [conditions, setConditions] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [placementId, setPlacementId] = useState<string | null>(null);
  const [status, setStatus] = useState("상담 링크를 확인하고 있습니다.");
  const [lookupFailed, setLookupFailed] = useState(false);
  const [deploymentRestricted, setDeploymentRestricted] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    setOrganizationId(null);
    setLookupFailed(false);
    setDeploymentRestricted(false);
    setStatus("상담 링크를 확인하고 있습니다.");
    void (async () => {
      const result = await requestJson(`/v1/public/deployments/${publicId}`);
      if (result.status === 200) {
        const deployment = result.data as { organizationId: string; placementId?: string; serviceName?: string };
        setPlacementId(deployment.placementId ?? null);
        setServiceName(deployment.serviceName ?? "");
        if (new URLSearchParams(window.location.search).get("handoff") === "1") {
          const context = await requestJson("/v1/embed/context");
          if (context.status === 200 && (context.data as { publicId: string }).publicId === publicId) {
            setQuestion((context.data as { question: string }).question);
            setConditions((context.data as { conditions?: string }).conditions ?? "");
            setServiceName((context.data as { serviceName?: string }).serviceName ?? deployment.serviceName ?? "");
          }
        }
        setOrganizationId(deployment.organizationId); setStatus("");
      }
      else if (result.status === 404) {
        const restored = await requestJson(`/v1/public/deployments/${publicId}/engagements/current`);
        const previous = restored.data as { organizationId?: string; deploymentRestricted?: boolean; engagement?: { id: string } | null };
        if (restored.status === 200 && previous.deploymentRestricted && previous.engagement && previous.organizationId) {
          setDeploymentRestricted(true); setOrganizationId(previous.organizationId); setStatus("");
        } else if (restored.status >= 500) {
          setLookupFailed(true); setStatus("이전 상담 상태를 확인하지 못했습니다. 다시 확인해 주세요.");
        } else setStatus("상담 링크가 중지됐거나 최신 승인 정보가 필요합니다.");
      }
      else {
        setLookupFailed(true);
        setStatus("상담 링크를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      }
    })().catch(() => {
      setLookupFailed(true);
      setStatus("상담 링크를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    });
  }, [publicId, reload]);
  return organizationId ? <PublicKnowledgePage id={organizationId} initialMessage={question} publicId={publicId}
    initialConditions={conditions} initialServiceName={serviceName} placementId={placementId} deploymentRestricted={deploymentRestricted} />
    : <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Agent Platform" /></a></header><main className="feature-section"><h1>상담 링크</h1><p role="status">{status}</p>{lookupFailed && <button type="button" onClick={() => setReload(value => value + 1)}>상담 링크 다시 확인</button>}</main></div>;
}
