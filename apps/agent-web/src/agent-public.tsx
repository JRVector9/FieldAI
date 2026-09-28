"use client";

import { AgentCustomerNotificationConsent } from "./agent-customer-notification-consent";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { AgentRetentionNotice } from './AgentRetentionNotice';
import type { WorkRetention } from './agent-retention';
import { AgentDeploymentReport } from './AgentDeploymentReport';
import { PrivateInquiryPhoto } from "./private-inquiry-photo";
import { AgentFieldAction } from "./agent-field-action";
import { clearPendingPublicSubmission, publicSubmissionFingerprint, readPendingPublicSubmission,
  writePendingPublicSubmission, type PendingPublicSubmission } from "./pending-public-submission";
import { clearPendingMessageSubmission, messageSubmissionFingerprint, readPendingMessageSubmission,
  writePendingMessageSubmission, type PendingMessageSubmission } from "./pending-message-submission";
import { aiQuestionFingerprint, clearPendingAiSubmission, readPendingAiSubmission,
  writePendingAiSubmission, type PendingAiSubmission } from "./pending-ai-submission";

type Knowledge = {
  organizationId: string;
  revision: number;
  businessName: string;
  introduction: string;
  region?: string;
  openingHours?: string;
  services: { name: string; description: string }[];
  faqs: { question: string; answer: string }[];
};
export function ServiceSelect({ services, selectedIndex, onSelect }: {
  services: Knowledge['services']; selectedIndex: number | null; onSelect: (index: number | null) => void;
}) {
  return <label>서비스<select value={selectedIndex === null ? '' : String(selectedIndex)}
    onChange={event => onSelect(event.target.value === '' ? null : Number(event.target.value))}>
    <option value="">일반 문의</option>
    {services.map((service, index) => <option key={index} value={index}>{service.name}
      {services.some((item, position) => position !== index && item.name === service.name)
        ? ` · ${service.description.slice(0, 60) || `${index + 1}번째`}` : ''}</option>)}
  </select></label>;
}
type Inquiry = {
  retention?:WorkRetention;
  id: string;
  state: string;
  service: { name: string } | null;
  messages: { id: string; actor: string; body: string; delivery_state: string }[];
  attachments: { id: string; messageId: string; contentType: "image/webp";
    byteSize: number; width: number; height: number; createdAt: string }[];
};
type Engagement = { retention?:WorkRetention;id: string; state: string; messages: { id: string; actor: string; body: string }[] };
function engagementFrom(value: unknown, id: string): Engagement | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Engagement>;
  if (candidate.id !== id || typeof candidate.state !== "string" || !Array.isArray(candidate.messages)
      || candidate.messages.some(item => !item || typeof item.id !== "string"
        || typeof item.actor !== "string" || typeof item.body !== "string")) return null;
  return candidate as Engagement;
}
const deliveryLabel = (state: string) => state === 'blocked_integration' ? '외부 알림 미연결'
  : state === 'not_applicable' ? '알림 대상 아님' : state;
const inquiryStateLabel = (state: string) => state === 'closed' ? '처리 완료'
  : state === 'spam' ? '알림 중단' : state === 'needs_owner' ? '사업자 확인 필요'
    : state === 'waiting_customer' ? '고객 답변 대기' : state === 'external_ready' ? 'Field 요청 준비' : '직접 응대 중';
const randomSubmissionKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
async function requestJson(path: string, method = "GET", body?: unknown, receiptKey?: string,
  extraHeaders?: Record<string, string>) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(receiptKey ? { authorization: `Bearer ${receiptKey}` } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
function preserveAiQuestionInDraft(current: string, question: string) {
  if (current.includes(question)) return current;
  const next = `${current}${current && !current.endsWith('\n') ? '\n' : ''}${question}`;
  return next.length <= 5000 ? next : current;
}
async function uploadInquiryPhoto(inquiryId: string, messageId: string, receiptKey: string, photo: File) {
  const response = await fetch(`/v1/inquiries/${inquiryId}/messages/${messageId}/attachments`, {
    method: "POST", credentials: "same-origin",
    headers: { authorization: `Bearer ${receiptKey}`, "content-type": "application/octet-stream" },
    body: photo,
  });
  return response.status;
}

function ReceiptRotationPanel({ inquiryId, currentKey, onRotated }: {
  inquiryId: string; currentKey: string; onRotated: (nextKey: string) => void;
}) {
  const [candidate, setCandidate] = useState("");
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = useRef<{ candidate: string; idempotencyKey: string } | null>(null);
  async function rotate() {
    if (!candidate || !copied || done) return;
    setBusy(true); setNotice("새 확인키를 활성화하고 있습니다.");
    if (pending.current?.candidate !== candidate)
      pending.current = { candidate, idempotencyKey: randomSubmissionKey() };
    try {
      const result = await requestJson(`/v1/inquiries/${inquiryId}/receipt-key/rotate`, "POST",
        { nextReceiptKey: candidate }, currentKey,
        { "idempotency-key": pending.current.idempotencyKey });
      if (result.status === 200) {
        onRotated(candidate); setDone(true);
        setNotice("새 확인키가 활성화되고 이전 키가 폐기됐습니다. 아래 새 키를 보관해 주세요.");
      } else if (result.status === 429) setNotice("확인키 입력이 여러 번 실패해 잠시 제한됩니다. 새 키를 보관하고 나중에 다시 시도해 주세요.");
      else if (result.status === 409) setNotice("다른 키 교체와 충돌했습니다. 문의를 새 키로 다시 열어 현재 상태를 확인해 주세요.");
      else if (result.status === 401) setNotice("기존 키가 유효하지 않습니다. 새 키로 문의를 다시 열어 상태를 확인해 주세요.");
      else setNotice(`키를 교체하지 못했습니다 (${result.status}). 새 키를 보관한 채 다시 시도해 주세요.`);
    } catch { setNotice("응답을 받지 못했습니다. 새 키를 보관하고 같은 버튼으로 다시 요청하거나 새 키로 문의를 열어 확인해 주세요."); }
    finally { setBusy(false); }
  }
  return <div className="customer-banner receipt-key-rotation"><h3>접수 확인키 교체</h3>
    <p>새 키를 먼저 보관한 뒤 교체해 주세요. 교체되면 이전 키로 문의·사진을 열 수 없습니다.</p>
    <button type="button" disabled={busy} onClick={() => {
      setCandidate(randomSubmissionKey()); setCopied(false); setDone(false); setNotice(""); pending.current = null;
    }}>새 확인키 생성</button>
    {candidate && <><p>새 확인키</p><code style={{ overflowWrap: "anywhere" }}>{candidate}</code>
      {!done && <><label><input type="checkbox" checked={copied} onChange={event => setCopied(event.target.checked)} /> 새 확인키를 안전한 곳에 복사했습니다.</label>
        <button type="button" disabled={busy || !copied} onClick={() => void rotate()}>기존 키 폐기·새 키 활성화</button></>}</>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}

export function PublicKnowledgePage({ id, initialMessage = "", initialConditions = "", publicId,
  initialServiceName = "", placementId, deploymentRestricted = false }: {
  id: string; initialMessage?: string; initialConditions?: string; publicId?: string;
  initialServiceName?: string; placementId?: string | null; deploymentRestricted?: boolean;
}) {
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
  const [status, setStatus] = useState("승인된 사업 정보를 확인하고 있습니다.");
  const [knowledgeLoadState, setKnowledgeLoadState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [knowledgeReload, setKnowledgeReload] = useState(0);
  const [serviceIndex, setServiceIndex] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState([initialMessage, initialConditions && `희망 조건: ${initialConditions}`]
    .filter(Boolean).join('\n'));
  const messageRef = useRef(message);
  const [overflowAiQuestion, setOverflowAiQuestion] = useState<string | null>(null);
  const [aiQuestion, setAiQuestion] = useState(initialMessage);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const engagementRef = useRef<Engagement | null>(null);
  const engagementLoad = useRef<Promise<void> | null>(null);
  const engagementStart = useRef<Promise<{ status: number; engagement: Engagement | null; error?: string }> | null>(null);
  const [aiStatus, setAiStatus] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [unlistedAiAnswer, setUnlistedAiAnswer] = useState<{ question: string; answer: string } | null>(null);
  const [aiTranscriptBusy, setAiTranscriptBusy] = useState(false);
  const [pendingAiAttempt, setPendingAiAttempt] = useState<PendingAiSubmission | null>(null);
  const [aiRecoveryBusy, setAiRecoveryBusy] = useState(false);
  const [fieldReadiness, setFieldReadiness] = useState<"checking" | "ready" | "no_connection"
    | "field_unavailable" | "no_services" | "rate_limited" | "error">("checking");
  const [fieldReadinessRevision, setFieldReadinessRevision] = useState(0);
  const [consent, setConsent] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; receiptKey: string; state?: string } | null>(null);
  const [previousReceipt, setPreviousReceipt] = useState<{id:string;receiptKey:string;state?:string}|null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const pendingSubmission = useRef<PendingPublicSubmission | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryRevision, setRecoveryRevision] = useState(0);
  const pendingScope = publicId ? `consult:${id}:${publicId}` : `inquiry:${id}`;
  const aiScope = publicId ? `${id}:${publicId}` : "";
  const [busy, setBusy] = useState(false);
  function acceptEngagement(current: Engagement | null) {
    engagementRef.current = current;
    setEngagement(current);
    if (!current?.retention?.workPurgedAt) return;
    clearPendingAiSubmission(aiScope); setPendingAiAttempt(null); setUnlistedAiAnswer(null);
    clearPendingPublicSubmission(pendingScope); pendingSubmission.current = null; setHasPending(false);
    setAiQuestion(""); updateHumanMessage(""); setOverflowAiQuestion(null);
    setName(""); setPhone(""); setPhoto(null); setConsent(false);
    setAiStatus("보존 기간이 종료되었습니다. 새 상담을 시작하면 별도 대화로 접수됩니다.");
  }
  async function startNewConversation() {
    if (!publicId || aiBusy || aiRecoveryBusy || busy) return;
    setAiBusy(true);
    try {
      const result = await requestJson(`/v1/public/deployments/${publicId}/engagements`, "POST");
      if (result.status !== 201) {
        setAiStatus(`새 상담을 시작하지 못했습니다 (${result.status}). 다시 시도해 주세요.`); return;
      }
      if (receipt) setPreviousReceipt(receipt);
      setReceipt(null);
      acceptEngagement({id:(result.data as {id:string}).id,state:'ai_assisting',messages:[]});
      setAiStatus("새 상담을 시작했습니다. 이전 대화와 별도로 저장됩니다.");
    } catch { setAiStatus("새 상담 응답을 확인하지 못했습니다. 다시 조회해 주세요."); }
    finally { setAiBusy(false); }
  }
  function updateHumanMessage(value: string) {
    messageRef.current = value;
    setMessage(value);
  }
  function preserveQuestionForHuman(question: string) {
    const current = messageRef.current;
    const next = preserveAiQuestionInDraft(current, question);
    updateHumanMessage(next);
    setOverflowAiQuestion(next === current && !current.includes(question) ? question : null);
  }
  async function attachDirectPhoto(saved: { id: string; receiptKey: string; state?: string }, selected: File) {
    try {
      const opened = await requestJson(`/v1/inquiries/${saved.id}`, "GET", undefined, saved.receiptKey);
      const messageId = opened.status === 200 ? (opened.data as Inquiry).messages
        .filter(item => item.actor === "customer" && item.delivery_state ===
          (saved.state === 'external_ready' ? 'not_applicable' : 'blocked_integration')).at(-1)?.id : undefined;
      if (!messageId) {
        setStatus("문의는 저장됐지만 사진의 첨부 대상을 확인하지 못했습니다. 내 문의 화면에서 다시 첨부해 주세요.");
        return;
      }
      const uploaded = await uploadInquiryPhoto(saved.id, messageId, saved.receiptKey, selected);
      if (uploaded === 201 || uploaded === 200) {
        setPhoto(null);
        setStatus(saved.state === 'external_ready'
          ? "AP 대화에 사진을 첨부했습니다. Field에 보낼 사진을 아래에서 별도로 선택하고 동의해 주세요."
          : "문의와 사진을 AP에 저장했습니다. 외부 알림은 미연결 상태입니다.");
      } else setStatus(`문의는 저장됐지만 사진 첨부에 실패했습니다 (${uploaded}). 아래에서 다시 시도할 수 있습니다.`);
    } catch { setStatus("문의는 저장됐지만 사진 업로드 응답을 받지 못했습니다. 아래에서 다시 시도할 수 있습니다."); }
  }
  async function retryDirectPhoto() {
    if (!receipt || !photo) return;
    setBusy(true);
    await attachDirectPhoto(receipt, photo);
    setBusy(false);
  }
  useEffect(() => {
    setKnowledge(null);
    setServiceIndex(null);
    setKnowledgeLoadState("loading");
    setStatus("승인된 사업 정보를 확인하고 있습니다.");
    void requestJson(`/v1/public/organizations/${id}`).then(result => {
      if (result.status === 200) {
        const approved = result.data as Knowledge;
        setKnowledge(approved);
        if (initialServiceName) {
          const matches = approved.services.map((service, index) => service.name === initialServiceName ? index : -1)
            .filter(index => index >= 0);
          setServiceIndex(matches.length === 1 ? matches[0]! : null);
        }
        setKnowledgeLoadState("ready");
        setStatus("");
      } else if (result.status === 404) {
        setKnowledgeLoadState("missing");
        setStatus("공개된 사업 정보가 없습니다. 주소나 승인 상태를 확인해 주세요.");
      } else {
        setKnowledgeLoadState("failed");
        setStatus("사업 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      }
    }).catch(() => {
      setKnowledgeLoadState("failed");
      setStatus("사업 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    });
  }, [id, knowledgeReload]);
  useEffect(() => {
    if (knowledgeLoadState === "loading") return;
    const attempt = readPendingPublicSubmission(pendingScope) ?? pendingSubmission.current;
    if (!attempt) return;
    let active = true;
    pendingSubmission.current = attempt;
    setHasPending(true); setRecovering(true);
    setStatus("이전 문의의 저장 결과를 확인하고 있습니다.");
    void requestJson(`${attempt.path}/recover`, "GET", undefined, undefined,
      { "idempotency-key": attempt.idempotencyKey, "x-receipt-key": attempt.receiptKey })
      .then(result => {
        if (!active) return;
        if (result.status === 200) {
          clearPendingPublicSubmission(pendingScope); pendingSubmission.current = null;
          setHasPending(false); setReceipt(result.data as { id: string; receiptKey: string; state: string });
          setStatus((result.data as { state: string }).state === 'external_ready'
            ? attempt.photoSelected
              ? "Field 요청 준비를 복구했습니다. 아직 Field에 전달되지 않았습니다. 이전에 고른 사진은 저장되지 않았습니다. 사진을 다시 선택해 첨부한 뒤 Field 조건과 전달 항목에 별도로 동의해 주세요."
              : "Field 요청 준비를 복구했습니다. 아직 Field에 전달되지 않았습니다. 현재 조건을 확인하고 따로 동의해 주세요."
            : "새로고침 전 저장된 문의를 확인했습니다. 사진을 선택했다면 내 문의 화면에서 다시 첨부해 주세요.");
        } else setStatus(result.status === 404
          ? "이전 문의가 아직 확인되지 않았습니다. 같은 내용을 다시 입력해 재시도하거나 조회를 다시 해 주세요."
          : "이전 문의 결과를 확인하지 못했습니다. 조회를 다시 시도해 주세요.");
      }).catch(() => { if (active) setStatus("이전 문의 결과를 확인하지 못했습니다. 조회를 다시 시도해 주세요."); })
      .finally(() => { if (active) setRecovering(false); });
    return () => { active = false; };
  }, [knowledgeLoadState, pendingScope, recoveryRevision]);
  useEffect(() => {
    if (!publicId) return;
    let active = true;
    const loading = requestJson(`/v1/public/deployments/${publicId}/engagements/current`).then(result => {
      if (active && result.status === 200 && !engagementRef.current) {
        const current = (result.data as { engagement: Engagement | null }).engagement;
        acceptEngagement(current);
      }
    }).catch(() => { if (active) setAiStatus("이전 AI 대화 상태를 읽지 못했습니다. 사람 문의는 사용할 수 있습니다."); });
    engagementLoad.current = loading;
    return () => { active = false; if (engagementLoad.current === loading) engagementLoad.current = null; };
  }, [publicId]);
  useEffect(() => {
    if (!engagement?.id || receipt) return;
    let active = true;
    setFieldReadiness("checking");
    void requestJson(`/v1/engagements/${engagement.id}/field-readiness`).then(result => {
      const data = result.data as { ready?: boolean; reason?: string };
      if (active) setFieldReadiness(result.status === 429
        && (result.data as { error?: string }).error === "field_preflight_rate_limited"
        ? "rate_limited" : result.status !== 200 ? "error" : data.ready ? "ready"
        : data.reason === "no_connection" || data.reason === "field_unavailable"
          || data.reason === "no_services" ? data.reason : "error");
    }).catch(() => { if (active) setFieldReadiness("error"); });
    return () => { active = false; };
  }, [engagement?.id, fieldReadinessRevision, receipt]);
  async function ensureEngagement(deploymentPublicId: string) {
    if (engagementRef.current) return { status: 200, engagement: engagementRef.current };
    if (engagementLoad.current) await engagementLoad.current;
    if (engagementRef.current) return { status: 200, engagement: engagementRef.current };
    if (!engagementStart.current) engagementStart.current = (async () => {
      try {
        const started = await requestJson(`/v1/public/deployments/${deploymentPublicId}/engagements`, "POST");
        if (started.status !== 201) return { status: started.status, engagement: null,
          error: (started.data as { error?: string }).error };
        const current: Engagement = { id: (started.data as { id: string }).id,
          state: "ai_assisting", messages: [] };
        acceptEngagement(current);
        return { status: 201, engagement: current };
      } catch { return { status: 0, engagement: null, error: "network_error" }; }
      finally { engagementStart.current = null; }
    })();
    return engagementStart.current;
  }
  async function refreshAiTranscript(id: string, expected?: { question: string; answer: string }) {
    try {
      const result = await requestJson(`/v1/engagements/${id}`);
      const loaded = result.status === 200 ? engagementFrom(result.data, id) : null;
      if (loaded?.retention?.workPurgedAt) { acceptEngagement(loaded); return true; }
      if (!loaded || (expected && !loaded.messages.some(item => item.actor === (expected.answer ? 'assistant' : 'customer')
          && item.body === (expected.answer || expected.question)))) return false;
      acceptEngagement(loaded);
      setUnlistedAiAnswer(null);
      return true;
    } catch { return false; }
  }
  function clearAiAttempt(attempt: PendingAiSubmission) {
    clearPendingAiSubmission(aiScope);
    setPendingAiAttempt(current => current?.idempotencyKey === attempt.idempotencyKey ? null : current);
  }
  async function recoverAiAttempt(attempt: PendingAiSubmission): Promise<boolean> {
    setAiRecoveryBusy(true);
    try {
      const result = await requestJson(`/v1/engagements/${attempt.engagementId}/messages/recover`,
        "GET", undefined, undefined, { "idempotency-key": attempt.idempotencyKey });
      if (result.status === 410) {
        await refreshAiTranscript(attempt.engagementId); clearAiAttempt(attempt); return true;
      }
      if (result.status === 200) {
        const recovered = result.data as { state?: string; question?: string; answer?: string;
          error?: string; handoffRecommended?: boolean };
        if (typeof recovered.question !== "string") {
          setAiStatus("AI 질문 결과의 형식을 확인하지 못했습니다. 같은 키로 상태를 다시 확인하거나 사람에게 문의해 주세요.");
          return false;
        }
        if (recovered.state === "completed") {
          setOverflowAiQuestion(current => current === recovered.question ? null : current);
          const accepted = { question: recovered.question,
            answer: typeof recovered.answer === "string" ? recovered.answer : "" };
          setAiQuestion(current => current.trim() === accepted.question ? "" : current);
          if (await refreshAiTranscript(attempt.engagementId, accepted)) {
            clearAiAttempt(attempt);
            setAiStatus(recovered.handoffRecommended
              ? "AI 대화를 복구했습니다. 확인되지 않은 내용은 아래에서 사람에게 문의할 수 있습니다."
              : "AI 대화를 복구했습니다. 이어서 질문하거나 사람에게 문의할 수 있습니다.");
          } else {
            setUnlistedAiAnswer(accepted);
            setAiStatus("AI 답변은 저장됐지만 대화 목록을 읽지 못했습니다. 아래 답변을 확인하고 원본 대화를 다시 불러와 주세요.");
          }
          return true;
        } else if (recovered.state === "in_progress") {
          setAiStatus("AI 질문을 처리 중입니다. 잠시 뒤 같은 실행 상태를 다시 확인하거나 사람에게 문의해 주세요.");
        } else if (recovered.state === "result_unknown") {
          preserveQuestionForHuman(recovered.question);
          setAiQuestion(current => current.trim() ? current : recovered.question!);
          setAiStatus("AI 실행 결과 미상입니다. 같은 요청 상태를 다시 확인하거나 아래에서 사람에게 문의해 주세요. 새 AI 질문은 기다려야 합니다.");
        } else if (recovered.state === "failed" || recovered.state === "rejected") {
          preserveQuestionForHuman(recovered.question);
          setAiQuestion(current => current.trim() ? current : recovered.question!);
          clearAiAttempt(attempt);
          setAiStatus(`AI 답변이 확정되지 않았습니다 (${recovered.error ?? recovered.state}). 질문을 사람 문의에서 확인해 주세요.`);
        } else setAiStatus("AI 질문 상태를 확인하지 못했습니다. 다시 확인하거나 사람에게 문의해 주세요.");
      } else if (result.status === 404) {
        setAiStatus("AI 질문 결과를 확인하지 못했습니다. 원래 질문을 같은 내용으로 다시 보내면 같은 키로 처리합니다. 사람 문의도 사용할 수 있습니다.");
      } else setAiStatus("AI 질문 결과를 확인하지 못했습니다. 같은 실행 상태를 다시 확인하거나 사람에게 문의해 주세요.");
      return false;
    } catch {
      setAiStatus("AI 질문 결과를 확인하지 못했습니다. 네트워크를 확인한 뒤 같은 실행 상태를 다시 조회해 주세요. 사람 문의도 사용할 수 있습니다.");
      return false;
    } finally { setAiRecoveryBusy(false); }
  }
  async function retryAiTranscript() {
    const currentId = engagementRef.current?.id ?? pendingAiAttempt?.engagementId;
    if (!currentId || !unlistedAiAnswer) return;
    setAiTranscriptBusy(true);
    try {
      if (await refreshAiTranscript(currentId, unlistedAiAnswer)) {
        if (pendingAiAttempt) clearAiAttempt(pendingAiAttempt);
        setAiStatus("AI 대화 목록을 다시 읽었습니다. 이어서 질문하거나 사람에게 문의할 수 있습니다.");
      } else setAiStatus("AI 대화 목록을 아직 읽지 못했습니다. 수락된 답변은 아래에 남아 있습니다. 다시 불러오거나 사람에게 문의해 주세요.");
    } finally { setAiTranscriptBusy(false); }
  }
  useEffect(() => {
    if (!publicId) return;
    const stored = readPendingAiSubmission(aiScope);
    if (!stored) return;
    setPendingAiAttempt(stored);
    void recoverAiAttempt(stored);
  }, [aiScope, publicId]);
  async function askAi(event?: FormEvent<HTMLFormElement>, selectedQuestion?: string) {
    event?.preventDefault();
    const question = (selectedQuestion ?? aiQuestion).trim();
    if (!publicId || !question || unlistedAiAnswer || deploymentRestricted || engagementRef.current?.retention?.workPurgedAt) return;
    const preserveQuestion = () => preserveQuestionForHuman(question);
    let attempt: PendingAiSubmission | null = null;
    setAiBusy(true); setAiStatus("승인된 정보로 답변을 확인하고 있습니다.");
    try {
      let currentId = pendingAiAttempt?.engagementId ?? engagementRef.current?.id;
      if (!currentId) {
        const started = await ensureEngagement(publicId);
        if (!started.engagement) {
          preserveQuestion();
          setAiStatus(started.status === 403 && started.error === "trial_ended"
            ? "사업자의 AP 체험이 종료되어 새 AI 상담을 시작할 수 없습니다."
            : started.status === 503
            ? "AI 공급사 또는 사용 한도 설정을 사용할 수 없습니다. 아래에서 사람에게 직접 문의할 수 있습니다."
            : `AI 대화를 시작하지 못했습니다 (${started.status}). 사람 문의는 사용할 수 있습니다.`);
          return;
        }
        currentId = started.engagement.id;
      }
      const fingerprint = await aiQuestionFingerprint(question);
      if (!fingerprint) {
        preserveQuestion();
        setAiStatus("안전한 재시도 정보를 만들지 못했습니다. 브라우저 보안 설정을 확인하거나 사람에게 문의해 주세요.");
        return;
      }
      const previous = pendingAiAttempt ?? readPendingAiSubmission(aiScope);
      if (previous && (previous.engagementId !== currentId || previous.fingerprint !== fingerprint)) {
        setAiStatus("이전 AI 질문의 결과가 아직 미확인입니다. 이전 질문을 다시 입력하거나 요청 상태를 먼저 확인해 주세요.");
        return;
      }
      attempt = previous ?? { engagementId: currentId, idempotencyKey: randomSubmissionKey(),
        fingerprint, createdAt: Date.now() };
      if (!previous) {
        writePendingAiSubmission(aiScope, attempt);
        setPendingAiAttempt(attempt);
      }
      const result = await requestJson(`/v1/engagements/${currentId}/messages`, "POST", { question },
        undefined, { "idempotency-key": attempt.idempotencyKey });
      if (result.status === 202) {
        if ((result.data as { state?: string }).state === "result_unknown") {
          preserveQuestion();
          setAiStatus("AI 실행 결과 미상입니다. 같은 요청 상태를 다시 확인하거나 아래에서 사람에게 문의해 주세요. 새 AI 질문은 기다려야 합니다.");
        } else setAiStatus("AI 질문을 처리 중입니다. 같은 실행 상태를 다시 확인하거나 사람에게 문의해 주세요.");
        return;
      }
      if (result.status === 200) {
        setOverflowAiQuestion(current => current === question ? null : current);
        const answer = result.data as { answer?: string; handoffRecommended: boolean; unknowns: string[] };
        const accepted = { question, answer: typeof answer.answer === 'string' ? answer.answer : '' };
        const refreshed = await refreshAiTranscript(currentId, accepted);
        setAiQuestion(current => current.trim() === question ? "" : current);
        if (!refreshed) {
          setUnlistedAiAnswer(accepted);
          setAiStatus("AI 답변은 저장됐지만 대화 목록을 읽지 못했습니다. 아래 답변을 확인하고 원본 대화를 다시 불러와 주세요.");
        } else {
          clearAiAttempt(attempt);
          setAiStatus(answer.handoffRecommended
            ? "확인되지 않은 내용은 담당자가 답변합니다. 아래에서 같은 대화를 사람에게 접수할 수 있습니다."
            : "승인된 사업 정보로 답변했습니다. 이어서 질문하거나 사람에게 문의할 수 있습니다.");
        }
      } else {
        await refreshAiTranscript(currentId);
        if (engagementRef.current?.retention?.workPurgedAt) { clearAiAttempt(attempt); return; }
        preserveQuestion();
        if (result.status >= 500 && !(result.status === 503 && ['blocked_integration',
          'budget_not_configured', 'provider_unavailable'].includes(
            (result.data as { error?: string }).error ?? ''))) {
          setAiStatus(`AI 답변을 제공하지 못했습니다 (${result.status}). 실행 결과를 다시 확인해 주세요. 사람 문의는 사용할 수 있습니다.`);
          return;
        }
        clearAiAttempt(attempt);
        if (result.status === 422) setAiStatus("AI 답변의 근거를 확인하지 못해 표시하지 않았습니다. 사람에게 직접 문의해 주세요.");
        else if (result.status === 429)
          setAiStatus("AI 사용 한도에 도달했습니다. 사람 문의는 계속 사용할 수 있습니다.");
        else if (result.status === 403 && (result.data as { error?: string }).error === "trial_ended")
          setAiStatus("사업자의 AP 체험이 종료되어 새 AI 답변을 제공할 수 없습니다. 기존 대화는 확인할 수 있습니다.");
        else if (result.status === 503)
          setAiStatus("AI 공급사 또는 예산 설정을 사용할 수 없습니다. 아래 사람 문의 초안과 AI 질문 내용을 확인해 주세요.");
        else if (result.status === 409 && (result.data as { error?: string }).error === "automation_paused_or_source_changed")
          setAiStatus("사람 문의가 접수되어 생성 중이던 AI 답변을 표시하지 않았습니다.");
        else setAiStatus(`AI 답변을 제공하지 못했습니다 (${result.status}). 사람 문의는 사용할 수 있습니다.`);
      }
    } catch {
      if (!attempt || !await recoverAiAttempt(attempt)) preserveQuestion();
      if (!attempt) setAiStatus("AI 요청이 전달되지 않았습니다. 아래 사람 문의를 사용할 수 있습니다.");
    }
    finally { setAiBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (engagementRef.current?.retention?.workPurgedAt) { setStatus("새 상담을 시작한 뒤 문의해 주세요."); return; }
    setBusy(true); setStatus("문의 접수 중입니다.");
    const selectedDestination = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement
      && ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value === 'field'
      ? 'field' : 'human';
    let canRecoverAfterReload = false;
    try {
      const stored = readPendingPublicSubmission(pendingScope) ?? pendingSubmission.current;
      if (selectedDestination === 'field' && !stored && fieldReadiness !== 'ready') {
        setStatus("Field 요청 경로를 먼저 확인해 주세요. 사람 문의는 계속 접수할 수 있습니다.");
        return;
      }
      let currentEngagement = engagementRef.current;
      if (publicId && !currentEngagement && !stored) {
        const started = await ensureEngagement(publicId);
        if (!started.engagement) {
          setStatus(started.status === 403 && started.error === "trial_ended"
            ? "사업자의 AP 체험이 종료되어 새 문의를 접수할 수 없습니다. 입력은 유지됩니다."
            : started.status === 404 ? "매체 배치가 중지되어 새 문의를 접수할 수 없습니다."
            : `매체 상담을 시작하지 못했습니다 (${started.status}). 입력은 유지됩니다.`);
          return;
        }
        currentEngagement = started.engagement;
      }
      const path = stored?.path ?? (currentEngagement ? `/v1/conversations/${currentEngagement.id}/submissions`
        : `/v1/public/organizations/${id}/inquiries`);
      const destination = stored?.destination ?? (selectedDestination === 'field' ? 'field' : undefined);
      const selectedService = serviceIndex === null ? null : knowledge?.services[serviceIndex];
      const payload = { serviceName: selectedService?.name, name, phone, message, consent,
        ...(selectedService ? { serviceIndex: serviceIndex!, knowledgeRevision: knowledge!.revision } : {}),
        ...(destination === 'field' ? { destination } : {}) };
      const digest = await publicSubmissionFingerprint({ path, payload });
      const fingerprint = digest ?? JSON.stringify({ path, payload });
      if (stored && stored.fingerprint !== fingerprint) {
        setStatus("이전 문의 제출 결과가 확인되지 않았습니다. 이전 요청을 먼저 조회하거나 아래에서 명시적으로 포기해 주세요.");
        return;
      }
      const attempt = stored ?? { path, ...(destination === 'field' ? { destination } : {}),
        photoSelected: !!photo,
        fingerprint, idempotencyKey: randomSubmissionKey(),
        receiptKey: randomSubmissionKey(), createdAt: Date.now() };
      pendingSubmission.current = attempt;
      if (digest) {
        writePendingPublicSubmission(pendingScope, attempt);
        canRecoverAfterReload = readPendingPublicSubmission(pendingScope) !== null;
      }
      setHasPending(true);
      const result = await requestJson(path, "POST", payload, undefined,
        { 'idempotency-key': attempt.idempotencyKey, 'x-receipt-key': attempt.receiptKey });
      if (result.status === 201 || result.status === 200) {
        pendingSubmission.current = null; clearPendingPublicSubmission(pendingScope); setHasPending(false);
        const saved = result.data as { id: string; receiptKey: string; state: string };
        setReceipt(saved);
        setStatus(saved.state === 'external_ready'
          ? "AP 대화와 연락처를 저장했습니다. 아직 Field에 전달되지 않았습니다. 아래에서 현재 조건을 확인하고 별도로 동의해 주세요."
          : result.status === 200
            ? "이전 문의 접수를 확인했습니다. 새 문의와 알림은 생성되지 않았습니다."
            : "문의가 AP에 저장되어 사업자 관리실에 표시됩니다. 카카오·푸시 알림은 미연결 상태입니다.");
        if (photo) await attachDirectPhoto(saved, photo);
      }
      else if (result.status === 401 && path.startsWith('/v1/conversations/')) {
        engagementRef.current = null;
        setEngagement(null); setStatus("상담 세션이 만료됐습니다. 입력 내용은 유지했습니다. 다시 제출하면 새 상담에서 접수됩니다.");
      }
      else if (result.status === 409 && (result.data as { error?: string }).error === 'idempotency_conflict')
        setStatus("이 제출 키로 저장된 내용 또는 확인키가 다릅니다. 입력을 확인해 주세요.");
      else if (result.status === 429 && (result.data as { error?: string }).error === 'submission_rate_limited')
        setStatus((result.data as { scope?: string }).scope === 'organization'
          ? "이 사업장에 새 문의가 짧은 시간에 많이 접수되어 잠시 제한됩니다. 입력 내용은 유지했습니다. 잠시 뒤 다시 시도해 주세요."
          : "같은 연락처의 새 문의가 짧은 시간에 여러 건 접수되어 잠시 제한됩니다. 입력 내용은 유지했습니다. 잠시 뒤 다시 시도해 주세요.");
      else if (result.status === 429 && (result.data as { error?: string }).error === 'field_preflight_rate_limited') {
        clearPendingPublicSubmission(pendingScope); pendingSubmission.current = null; setHasPending(false);
        setFieldReadiness('rate_limited');
        setStatus("Field 확인 요청이 많아 직접 요청 준비가 잠시 제한됩니다. 연락처는 저장되지 않았습니다. 사람 문의는 계속 사용할 수 있습니다.");
      }
      else if (result.status === 403 && (result.data as { error?: string }).error === "trial_ended")
        setStatus("사업자의 AP 체험이 종료되어 새 문의를 접수할 수 없습니다. 입력 내용은 유지됩니다. 기존 문의는 확인키로 열 수 있습니다.");
      else if ([409, 503].includes(result.status) && ['field_connection_unavailable',
        'field_services_unavailable', 'field_unavailable'].includes(
          (result.data as { error?: string }).error ?? '')) {
        clearPendingPublicSubmission(pendingScope); pendingSubmission.current = null; setHasPending(false);
        const reason = (result.data as { error: string }).error;
        setFieldReadiness(reason === 'field_connection_unavailable' ? 'no_connection'
          : reason === 'field_services_unavailable' ? 'no_services' : 'field_unavailable');
        setStatus("Field 직접 요청을 준비하지 못했습니다. 연락처는 저장되지 않았습니다. 사람 문의를 제출하거나 Field 상태를 다시 확인해 주세요.");
      }
      else setStatus(`문의를 접수하지 못했습니다 (${result.status}). 입력 내용은 화면에 남아 있습니다.`);
    } catch { setStatus(canRecoverAfterReload
      ? "응답을 받지 못했습니다. 새로고침하면 기존 접수를 조회하거나 같은 내용을 다시 제출할 수 있습니다."
      : "응답을 받지 못했습니다. 이 브라우저는 임시 시도를 보관하지 못해 현재 화면에서만 같은 내용으로 재시도할 수 있습니다. 새로고침하지 마세요."); }
    finally { setBusy(false); }
  }
  const businessDetails = knowledge && <section className="agent-public-business-facts" aria-label="승인된 사업 지역·영업시간"><dl>
    <div><dt>활동 지역</dt><dd>{knowledge.region || "미등록"}</dd></div>
    <div><dt>영업시간</dt><dd>{knowledge.openingHours || "미등록"}</dd></div>
  </dl></section>;
  return <div className={publicId ? "site-shell agent-public-shell" : "site-shell"}><header className="site-header"><a href="/"><Brand product="Agent Platform" /></a>{publicId && <div className="agent-public-header-business"><span className="agent-public-symbol" aria-hidden="true">✦</span><span><strong>{knowledge?.businessName ?? "사업자 AI 상담"}</strong><small>사업자 공식 AI 안내</small></span></div>}</header><main className={publicId ? "feature-section agent-public-main" : "feature-section"}><div className={publicId ? "feature-heading agent-public-heading" : "feature-heading"}><p className="eyebrow">{publicId ? "어디에서 오셨든, 여기서 이어가세요." : "Agent Platform · 상담"}</p>{!publicId && <><h1>{knowledge?.businessName ?? "사업 정보"}</h1><p>{knowledge?.introduction}</p>{businessDetails}</>}
    {placementId && <p>광고 · 매체에서 승인한 {initialServiceName} 안내를 보고 오셨습니다. 연락처는 AP에서만 접수합니다.</p>}</div>{status && <p role="status" className="state-message">{status}</p>}
    {knowledgeLoadState === "failed" && <button type="button" onClick={() => setKnowledgeReload(value => value + 1)}>사업 정보 다시 불러오기</button>}
    <AgentRetentionNotice retention={engagement?.retention}/>{engagement?.retention?.workPurgedAt && <button type="button" disabled={deploymentRestricted || aiBusy || aiRecoveryBusy || busy} onClick={() => void startNewConversation()}>새 상담 시작</button>}{deploymentRestricted && <p role="status" className="customer-banner">상담 배포 제한 중 · 기존 대화와 사람 문의는 유지됩니다.</p>}
    {publicId && <section className="special-panel agent-public-chat"><div className="agent-public-chat-top"><span>사업자 AI 안내</span><span>{knowledge?.businessName ?? "사업 정보 확인 중"}</span></div><div className="agent-public-chat-body"><div className="agent-public-intro"><span className="agent-public-symbol" aria-hidden="true">✦</span><div><strong>{knowledge?.businessName ?? "사업자 AI 상담"}</strong><small>{knowledge?.services[0]?.name ?? "승인된 사업 정보 안내"}</small></div></div><h1>궁금한 점을 바로 물어보세요.</h1><p>{knowledge?.introduction || "승인된 사업 정보를 바탕으로 안내합니다."}</p>{businessDetails}{engagement?.messages.length ? <ol className="agent-public-messages" aria-label="AI 상담 대화">{engagement.messages.map(item => <li key={item.id} className={item.actor === "assistant" ? "agent-public-message-ai" : "agent-public-message-customer"}><strong>{item.actor === "assistant" ? "AI 안내" : "나"}</strong><p>{item.body}</p></li>)}</ol> : null}{knowledge?.faqs.length ? <div className="agent-public-quick" aria-label="빠른 질문">{knowledge.faqs.slice(0, 3).map(faq => <button key={faq.question} type="button" disabled={Boolean(engagement?.retention?.workPurgedAt) || deploymentRestricted || !!receipt || aiBusy || aiRecoveryBusy || !!unlistedAiAnswer} onClick={() => { setAiQuestion(faq.question); void askAi(undefined, faq.question); }}>{faq.question}</button>)}</div> : null}{pendingAiAttempt && !unlistedAiAnswer && <div className="customer-banner"><p>이전 AI 질문 결과를 보관 중입니다. 같은 질문을 다시 보내면 동일 실행을 조회합니다. 다른 질문 전에 결과를 확인해 주세요.</p><button type="button" disabled={aiRecoveryBusy || aiBusy} onClick={() => void recoverAiAttempt(pendingAiAttempt)}>AI 요청 상태 다시 확인</button></div>}{unlistedAiAnswer && <div className="customer-banner"><strong>서버가 수락한 AI 답변</strong><p>{unlistedAiAnswer.answer || "확인된 답변이 없습니다. 담당자에게 문의해 주세요."}</p><p>대화 목록을 읽지 못했습니다. 새 질문을 보내기 전에 원본 대화를 다시 확인해 주세요.</p><button type="button" disabled={aiTranscriptBusy} onClick={() => void retryAiTranscript()}>AI 대화 다시 불러오기</button></div>}</div><div className="agent-public-chat-actions"><form className="form-fields agent-public-composer" onSubmit={event => void askAi(event)}><label>질문<textarea disabled={Boolean(engagement?.retention?.workPurgedAt)} required maxLength={1000} rows={1} placeholder="궁금한 내용을 물어보세요" value={aiQuestion} onChange={event => setAiQuestion(event.target.value)} /></label><button type="submit" disabled={Boolean(engagement?.retention?.workPurgedAt) || deploymentRestricted || aiBusy || aiRecoveryBusy || !knowledge || !!receipt || !!unlistedAiAnswer}>AI에 질문 <span aria-hidden="true">→</span></button>{!knowledge && <p>{knowledgeLoadState === "loading" ? "승인된 사업 정보를 불러오는 동안 질문할 수 없습니다." : knowledgeLoadState === "missing" ? "공개된 사업 정보가 없어 질문할 수 없습니다." : "사업 정보를 다시 불러온 뒤 질문할 수 있습니다."}</p>}</form>{aiStatus && <p role="status" className="state-message">{aiStatus}</p>}<a className="agent-public-human-link" href="#human-inquiry">사장님께 문의하기 <span aria-hidden="true">→</span></a></div><p className="agent-public-chat-bottom">AI 답변은 안내이며 예약 확정이 아닙니다. 연락처는 다음 접수 화면에서만 받습니다.</p></section>}
    {previousReceipt && <section className="special-panel" aria-label="이전 문의 확인"><h2>이전 문의 확인</h2><p>새 상담과 별도로 기존 접수번호·처리 이력을 확인할 수 있습니다.</p><a href={`/inquiry/${previousReceipt.id}`}>이전 문의 열기</a><div className="customer-banner"><p>기존 접수 확인키</p><code>{previousReceipt.receiptKey}</code></div></section>}
    {publicId && <p className="agent-public-privacy">일반 질문은 연락처 없이 이용합니다. 실제 문의·예약 요청 때만 이름과 연락처를 남깁니다.</p>}
    <div className={publicId ? "special-grid agent-public-detail-grid" : "special-grid"}><section className="special-panel agent-public-facts"><h2>승인된 안내</h2>{knowledge ? <><h3>서비스</h3>{knowledge.services.length ? <ul>{knowledge.services.map((service, index) => <li key={index}><strong>{service.name}</strong><p>{service.description}</p></li>)}</ul> : <p>등록된 서비스가 없습니다.</p>}<h3>자주 묻는 질문</h3>{knowledge.faqs.length ? <dl>{knowledge.faqs.map(faq => <div key={faq.question}><dt>{faq.question}</dt><dd>{faq.answer}</dd></div>)}</dl> : <p>등록된 질문이 없습니다.</p>}</> : <p>{knowledgeLoadState === "loading" ? "사업 정보를 불러오는 중입니다." : knowledgeLoadState === "missing" ? "공개된 사업 정보가 없습니다." : "사업 정보를 확인하지 못했습니다. 위에서 다시 불러와 주세요."}</p>}<p>확인되지 않은 내용은 사람에게 문의할 수 있습니다.</p></section><section id="human-inquiry" className="special-panel agent-public-human"><h2>{receipt?.state === 'external_ready' ? 'Field 요청 준비' : '사람에게 문의'}</h2>{receipt ? <div className="customer-banner"><strong>접수 확인키</strong><p>이 키는 AP 대화 원문을 다시 열 때 필요합니다. 전화번호나 알림 링크만으로 열 수 없습니다.</p><code>{receipt.receiptKey}</code><p><a href={`/inquiry/${receipt.id}`}>후속 대화 열기</a></p>{receipt.state === 'external_ready' && <p>Field에 전달되지 않았다면 후속 대화에서 사람에게 직접 문의할 수 있습니다.</p>}</div> : engagement?.retention?.workPurgedAt ? <p>기존 대화의 접수가 종료되었습니다. 위에서 새 상담을 시작해 주세요.</p> : <form className="form-fields" onSubmit={event => void submit(event)}>
      {hasPending && <div className="customer-banner"><p>이전 제출 시도를 보관 중입니다. 같은 내용을 다시 입력하면 같은 문의로 재시도합니다. 다른 내용을 보내려면 기존 결과를 먼저 확인해 주세요.</p>
        <button type="button" disabled={busy || recovering} onClick={() => setRecoveryRevision(value => value + 1)}>이전 문의 조회</button>
        <button type="button" disabled={busy || recovering} onClick={() => {
          clearPendingPublicSubmission(pendingScope); pendingSubmission.current = null; setHasPending(false);
          setStatus("이전 시도를 포기했습니다. 이미 저장됐을 가능성이 있으므로 새 문의 전에 사업자에게 확인해 주세요.");
        }}>이전 시도 포기하고 새 문의</button></div>}
      {initialMessage && <p>외부 사이트에서 작성한 질문 초안입니다. 제출 전 내용을 확인해 주세요.</p>}
      {engagement && <p>AI 대화와 같은 AP 원본에 이어집니다.</p>}
      {overflowAiQuestion && !message.includes(overflowAiQuestion) && <div className="customer-banner"><p role="status">문의 초안에 질문을 추가하지 못했습니다. 5,000자 한도에 맞게 문의 내용을 줄인 뒤 다시 넣어 주세요. 질문은 위 AI 입력칸에 남아 있습니다.</p><button type="button" onClick={() => preserveQuestionForHuman(overflowAiQuestion)}>이 질문을 문의 초안에 넣기</button></div>}
      {publicId && engagement && <div className="customer-banner"><p>{fieldReadiness === "ready"
        ? "Field 연결 경로가 설정됐습니다. 실제 서비스·가격·시간은 요청 전에 다시 확인합니다."
        : fieldReadiness === "checking" ? "Field 연결 경로를 확인하고 있습니다."
        : fieldReadiness === "no_connection" ? "현재 Field 직접 요청 경로가 없습니다. 사람 문의는 계속 접수할 수 있습니다."
        : fieldReadiness === "no_services" ? "Field에 현재 공개된 요청 서비스가 없습니다. 사람 문의는 계속 접수할 수 있습니다."
        : fieldReadiness === "field_unavailable" ? "Field의 현재 권한이나 공개 정보를 확인할 수 없습니다. 다시 확인하거나 사람에게 문의해 주세요."
        : fieldReadiness === "rate_limited" ? "Field 확인 요청이 많아 잠시 제한됩니다. 잠시 뒤 다시 확인하거나 사람에게 문의해 주세요."
        : "Field 연결 경로를 확인하지 못했습니다. 다시 확인해 주세요."}</p>
        {fieldReadiness !== "ready" && <button type="button"
          disabled={busy || fieldReadiness === "checking"}
          onClick={() => setFieldReadinessRevision(value => value + 1)}>Field 연결 다시 확인</button>}</div>}
      <ServiceSelect services={knowledge?.services ?? []} selectedIndex={serviceIndex} onSelect={setServiceIndex} />
      <label>이름<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>연락처<input required type="tel" maxLength={30} value={phone} onChange={event => setPhone(event.target.value)} /></label>
      <label>문의 내용<textarea required maxLength={5000} value={message} onChange={event => updateHumanMessage(event.target.value)} /></label>
      <div className="agent-public-photo"><label className="inquiry-photo-label">문의 사진 (선택, 최대 8MB)<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy} onChange={event => setPhoto(event.currentTarget.files?.[0] ?? null)} /></label><p>사진은 AP 대화 원본을 저장한 뒤 비공개로 첨부합니다. AI 분석에 사용하지 않습니다. Field로 보내려면 별도로 선택하고 동의해야 합니다.</p></div>
      <label><input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} /> AP 대화와 요청 준비에 필요한 연락처 저장에 동의합니다.</label>
      <button type="submit" value="human" disabled={busy || recovering || !knowledge || Boolean(engagement?.retention?.workPurgedAt)}>사람 문의 제출</button>
      {publicId && engagement && <><button type="submit" value="field" disabled={busy || recovering || !knowledge || Boolean(engagement?.retention?.workPurgedAt) || fieldReadiness !== "ready"}>Field 요청 준비</button><p>요청 준비만으로 Field에 전달되지 않습니다. 현재 서비스·가격·시간과 수신 사업자를 확인한 뒤 별도로 동의해야 합니다.</p></>}
      {!knowledge && <p>승인된 사업 정보를 불러온 뒤 문의를 접수할 수 있습니다.</p>}
      <p>회원가입·OTP 없이 접수하며, 번호 소유 확인 상태로 표시하지 않습니다.</p></form>}</section></div>
    {receipt?.state === 'external_ready' && <section className="special-panel"><label className="inquiry-photo-label">AP 대화 사진 추가 (선택, 최대 8MB)<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy} onChange={event => setPhoto(event.currentTarget.files?.[0] ?? null)} /></label><p>사진을 AP 원본에 첨부해도 Field에는 자동 전달되지 않습니다. 아래에서 전달 사진을 따로 선택하고 동의해 주세요.</p></section>}
    {receipt && receipt.state !== "external_ready" && <AgentCustomerNotificationConsent kind="inquiry" id={receipt.id} receiptKey={receipt.receiptKey} />}
    {receipt && photo && <section className="special-panel"><p>AP 대화 원본은 저장됐습니다. 선택한 사진 {photo.name}을 첨부하거나 다시 시도할 수 있습니다.</p><button type="button" disabled={busy} onClick={() => void retryDirectPhoto()}>사진 첨부 또는 재시도</button>{receipt.state === 'external_ready' && <button type="button" disabled={busy} onClick={() => setPhoto(null)}>사진 없이 Field 조건 확인</button>}</section>}
    {receipt && (receipt.state !== 'external_ready' || !photo) && <AgentFieldAction inquiryId={receipt.id} receiptKey={receipt.receiptKey}
      initialSummary={receipt.state === 'external_ready' ? message : ''}
      externalReady={receipt.state === 'external_ready'} />}
    {publicId && knowledgeLoadState === 'ready' && <footer><AgentDeploymentReport publicId={publicId} /></footer>}
  </main></div>;
}

export function InquiryPage({ id }: { id: string }) {
  const [key, setKey] = useState("");
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [pendingPhotoMessageId, setPendingPhotoMessageId] = useState<string | null>(null);
  const [fieldAttachmentRevision, setFieldAttachmentRevision] = useState(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const pendingMessage = useRef<PendingMessageSubmission | null>(null);
  const [hasPendingMessage, setHasPendingMessage] = useState(false);
  const [recoveringMessage, setRecoveringMessage] = useState(false);
  function clearPhotoSelection() {
    setPhoto(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }
  useEffect(() => {
    const attempt = readPendingMessageSubmission(id);
    if (!attempt) return;
    pendingMessage.current = attempt;
    setHasPendingMessage(true);
    setKey(attempt.receiptKey);
    void recoverPendingMessage(attempt);
  }, [id]);
  useEffect(() => {
    if (!inquiry?.retention?.workPurgedAt) return;
    clearPendingMessageSubmission(id); pendingMessage.current = null; setHasPendingMessage(false);
    setBody(""); clearPhotoSelection(); setPendingPhotoMessageId(null);
    setStatus("보존 기간이 종료되어 추가 질문과 사진 첨부는 종료되었습니다.");
  }, [id, inquiry?.retention?.workPurgedAt]);
  async function recoverPendingMessage(attempt: PendingMessageSubmission) {
    setRecoveringMessage(true);
    setKey(attempt.receiptKey);
    let notice = "이전 추가 질문 결과를 확인하지 못했습니다. 다시 조회하거나 같은 내용을 재입력해 주세요.";
    try {
      const result = await requestJson(`/v1/inquiries/${id}/messages/recover`, "GET", undefined,
        attempt.receiptKey, { 'idempotency-key': attempt.idempotencyKey });
      if (result.status === 200) {
        pendingMessage.current = null; clearPendingMessageSubmission(id); setHasPendingMessage(false);
        setPendingPhotoMessageId((result.data as { messageId: string }).messageId);
        setBody("");
        notice = "새로고침 전 저장된 추가 질문을 확인했습니다. 사진을 선택했다면 아래에서 다시 첨부해 주세요.";
      } else if (result.status === 404)
        notice = "이전 추가 질문은 아직 저장되지 않았습니다. 같은 내용을 다시 입력해 제출하거나 시도를 포기해 주세요.";
      else if (result.status === 401)
        notice = "보관된 확인키가 유효하지 않습니다. 현재 확인키로 문의를 열고 이전 질문을 확인해 주세요.";
    } catch { /* Unknown result keeps the original attempt. */ }
    try {
      const opened = await requestJson(`/v1/inquiries/${id}`, "GET", undefined, attempt.receiptKey);
      if (opened.status === 200) { setInquiry(opened.data as Inquiry); setRefreshNeeded(false); }
      else notice += ` 문의 내용을 다시 불러오지 못했습니다 (${opened.status}).`;
    } catch { notice += " 문의 내용을 다시 불러오지 못했습니다."; }
    setStatus(notice);
    setRecoveringMessage(false);
  }
  function onReceiptRotated(nextKey: string) {
    setKey(nextKey); pendingMessage.current = null; clearPendingMessageSubmission(id);
    setHasPendingMessage(false); setPendingPhotoMessageId(null);
    void requestJson(`/v1/inquiries/${id}`, "GET", undefined, nextKey)
      .then(result => { if (result.status === 200) { setInquiry(result.data as Inquiry); setRefreshNeeded(false); } })
      .catch(() => setStatus("새 확인키는 활성화됐습니다. 문의 내용을 다시 열어 확인해 주세요."));
  }
  async function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const result = await requestJson(`/v1/inquiries/${id}`, "GET", undefined, key);
      if (result.status === 200) { setInquiry(result.data as Inquiry); setRefreshNeeded(false); }
      else {
        setInquiry(null);
        setStatus(result.status === 429
          ? "확인키 입력이 여러 번 실패했습니다. 잠시 뒤 다시 시도해 주세요."
          : "확인키가 맞지 않거나 문의를 열 수 없습니다.");
      }
    } catch { setStatus("문의를 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function refreshInquiry() {
    setBusy(true); setStatus("최신 AP 문의 내용을 확인하고 있습니다.");
    try {
      const result = await requestJson(`/v1/inquiries/${id}`, "GET", undefined, key);
      if (result.status === 200) {
        setInquiry(result.data as Inquiry); setRefreshNeeded(false);
        setStatus("최신 AP 문의 내용을 확인했습니다.");
      } else setStatus(`AP 문의 내용을 다시 불러오지 못했습니다 (${result.status}). 다시 확인해 주세요.`);
    } catch { setStatus("AP 문의 내용을 다시 불러오지 못했습니다. 다시 확인해 주세요."); }
    finally { setBusy(false); }
  }
  async function attachPhoto(messageId: string, selected: File) {
    let uploaded: number;
    try {
      uploaded = await uploadInquiryPhoto(id, messageId, key, selected);
    } catch { setStatus("질문은 저장됐지만 사진 업로드 응답을 받지 못했습니다. 같은 사진을 다시 첨부하면 기존 저장 건을 확인합니다."); return; }
    if (uploaded !== 201 && uploaded !== 200) {
      setStatus(`질문은 저장됐지만 사진 첨부에 실패했습니다 (${uploaded}). 다시 시도할 수 있습니다.`);
      return;
    }
    clearPhotoSelection(); setPendingPhotoMessageId(null);
    setFieldAttachmentRevision(value => value + 1);
    const savedStatus = inquiry?.state === 'external_ready'
      ? "사진을 AP 대화에 비공개로 저장했습니다. Field에 보낼 사진은 별도로 선택하고 동의해 주세요."
      : inquiry?.state === 'spam' ? "사진을 문의에 비공개로 저장했습니다. 이 문의의 알림은 중단된 상태입니다."
        : "사진을 문의에 비공개로 저장했습니다. 외부 알림은 미연결 상태입니다.";
    setStatus(savedStatus);
    try {
      const updated = await requestJson(`/v1/inquiries/${id}`, "GET", undefined, key);
      if (updated.status === 200) { setInquiry(updated.data as Inquiry); setRefreshNeeded(false); }
      else { setRefreshNeeded(true); setStatus(`${savedStatus} 대화 목록 조회에 실패했습니다. 문의 내용을 다시 확인해 주세요.`); }
    } catch { setRefreshNeeded(true); setStatus(`${savedStatus} 대화 목록 조회에 실패했습니다. 문의 내용을 다시 확인해 주세요.`); }
  }
  async function retryPhoto() {
    if (!photo || !inquiry) return;
    const messageId = pendingPhotoMessageId ?? inquiry.messages.filter(item => item.actor === "customer").at(-1)?.id;
    if (!messageId) { setStatus("사진을 연결할 고객 메시지가 없습니다."); return; }
    setBusy(true);
    await attachPhoto(messageId, photo);
    setBusy(false);
  }
  async function followup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoveringMessage) return;
    setBusy(true);
    let canRecoverAfterReload = false;
    try {
      const details = { id, key, body: body.trim() };
      const fingerprint = await messageSubmissionFingerprint(details) ?? JSON.stringify(details);
      if (pendingMessage.current && (pendingMessage.current.fingerprint !== fingerprint
        || pendingMessage.current.receiptKey !== key)) {
        setStatus("이전 추가 질문 제출 결과가 확인되지 않았습니다. 먼저 이전 질문을 조회하거나 시도를 포기해 주세요.");
        return;
      }
      if (!pendingMessage.current) {
        pendingMessage.current = { inquiryId: id, receiptKey: key,
          idempotencyKey: randomSubmissionKey(), fingerprint, createdAt: Date.now() };
        setHasPendingMessage(true);
      }
      canRecoverAfterReload = /^[0-9a-f]{64}$/.test(fingerprint)
        && writePendingMessageSubmission(pendingMessage.current);
      const result = await requestJson(`/v1/inquiries/${id}/messages`, "POST", { body }, key,
        { 'idempotency-key': pendingMessage.current.idempotencyKey });
      if (result.status === 201 || result.status === 200) {
        pendingMessage.current = null; clearPendingMessageSubmission(id); setHasPendingMessage(false);
        const savedStatus = result.status === 200
          ? "이전 추가 질문을 확인했습니다. 새 메시지와 알림은 생성되지 않았습니다."
          : (result.data as { state?: string }).state === 'spam'
            ? "추가 질문을 AP에 저장했습니다. 이 문의의 알림은 중단된 상태입니다."
            : "추가 질문을 AP에 저장해 사업자 관리실에 표시했습니다. 외부 알림은 미연결 상태입니다.";
        setBody(""); setStatus(savedStatus);
        try {
          const updated = await requestJson(`/v1/inquiries/${id}`, "GET", undefined, key);
          if (updated.status === 200) { setInquiry(updated.data as Inquiry); setRefreshNeeded(false); }
          else { setRefreshNeeded(true); setStatus(`${savedStatus} 대화 목록 조회에 실패했습니다. 문의 내용을 다시 확인해 주세요.`); }
        } catch { setRefreshNeeded(true); setStatus(`${savedStatus} 대화 목록 조회에 실패했습니다. 문의 내용을 다시 확인해 주세요.`); }
        if (photo) {
          const messageId = (result.data as { messageId?: string }).messageId;
          if (messageId) { setPendingPhotoMessageId(messageId); await attachPhoto(messageId, photo); }
          else setStatus("질문은 저장됐지만 사진을 연결할 메시지를 찾지 못했습니다. 아래에서 다시 첨부해 주세요.");
        }
      } else if (result.status === 410) {
        pendingMessage.current=null;clearPendingMessageSubmission(id);setHasPendingMessage(false);
        setInquiry(null);setBody("");clearPhotoSelection();setPendingPhotoMessageId(null);
        await refreshInquiry();
      } else if (result.status === 409 && (result.data as { error?: string }).error === 'idempotency_conflict')
        setStatus("이 제출 키로 저장된 질문이 다릅니다. 내용을 확인해 주세요.");
      else setStatus(`추가 질문을 저장하지 못했습니다 (${result.status}).`);
    } catch { setStatus(canRecoverAfterReload
      ? "응답을 받지 못했습니다. 새로고침하면 기존 추가 질문을 조회하거나 같은 내용으로 재시도할 수 있습니다."
      : "응답을 받지 못했습니다. 이 브라우저는 임시 시도를 보관하지 못해 현재 화면에서만 같은 내용으로 재시도할 수 있습니다. 새로고침하지 마세요."); }
    finally { setBusy(false); }
  }
  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Agent Platform" /></a></header><main className="feature-section"><div className="feature-heading"><p className="eyebrow">Agent Platform · 비회원 후속 대화</p><h1>내 문의 확인</h1><p>접수 때 받은 별도 확인키를 입력해 주세요. 번호나 알림 링크로는 원문을 열 수 없습니다.</p></div>{status && <p role="status" className="state-message">{status}</p>}<section className="special-panel"><form className="form-fields" onSubmit={event => void open(event)}><label>접수 확인키<input required value={key} onChange={event => { setKey(event.target.value); setInquiry(null); clearPhotoSelection(); setPendingPhotoMessageId(null); setRefreshNeeded(false); }} /></label><button type="submit" disabled={busy || recoveringMessage}>문의 열기</button></form>
    {hasPendingMessage&&!inquiry?.retention?.workPurgedAt && <div className="customer-banner"><p>이전 추가 질문 제출 시도를 보관 중입니다. 같은 내용을 다시 입력하면 같은 메시지로 재시도합니다.</p>
      <button type="button" disabled={busy || recoveringMessage} onClick={() => {
        if (pendingMessage.current) void recoverPendingMessage(pendingMessage.current);
      }}>이전 추가 질문 조회</button>
      <button type="button" disabled={busy || recoveringMessage} onClick={() => {
        pendingMessage.current = null; clearPendingMessageSubmission(id); setHasPendingMessage(false);
        setStatus("이전 시도를 포기했습니다. 이미 저장됐을 수 있으므로 새 질문 전에 대화 내용을 확인해 주세요.");
      }}>이전 시도 포기하고 새 질문</button></div>}
    {inquiry && <div><h2>{inquiry.service?.name ?? "일반 문의"} · {inquiryStateLabel(inquiry.state)}</h2><AgentRetentionNotice retention={inquiry.retention}/>{inquiry.state === 'closed'&&!inquiry.retention?.workPurgedAt && <p>처리 완료된 문의도 추가 질문을 남기면 다시 사업자 확인 필요로 열립니다.</p>}{inquiry.state === 'spam' && <p>이 문의는 알림 중단 상태입니다. 추가 메시지는 보존되며 사업자 알림은 발송하지 않습니다.</p>}{refreshNeeded && <button type="button" disabled={busy} onClick={() => void refreshInquiry()}>문의 내용 다시 확인</button>}{hasPendingMessage ? <p>이전 추가 질문 결과를 확인한 뒤 확인키를 교체할 수 있습니다.</p> : <ReceiptRotationPanel inquiryId={id} currentKey={key} onRotated={onReceiptRotated} />}<ol>{inquiry.messages.map(message => <li key={message.id}><strong>{message.actor === "owner" ? "사업자" : message.actor === "assistant" ? "AI" : "고객"}</strong> {message.body} <small>알림 {deliveryLabel(message.delivery_state)}</small>
    {inquiry.attachments.filter(item => item.messageId === message.id).map((attachment, index) =>
      <PrivateInquiryPhoto key={attachment.id} inquiryId={id} attachmentId={attachment.id} receiptKey={key} label={`고객 첨부 사진 ${index + 1}`} />)}</li>)}</ol>{inquiry.state !== "external_ready" && !inquiry.retention?.workPurgedAt && <AgentCustomerNotificationConsent kind="inquiry" id={id} receiptKey={key} />}{!inquiry.retention?.workPurgedAt&&<><form className="form-fields" onSubmit={event => void followup(event)}><label>추가 질문<textarea required maxLength={5000} value={body} onChange={event => setBody(event.target.value)} /></label><button type="submit" disabled={busy || recoveringMessage}>추가 질문 저장</button></form>
    <div className="knowledge-source"><label className="inquiry-photo-label">문의 사진 첨부 (선택, 최대 8MB)<input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy} onChange={event => setPhoto(event.currentTarget.files?.[0] ?? null)} /></label>{photo && <><p>선택한 사진: {photo.name}</p><button type="button" disabled={busy} onClick={() => void retryPhoto()}>사진만 첨부 또는 재시도</button></>}</div></>}
    </div>}</section>{inquiry&&!inquiry.retention?.workPurgedAt && <AgentFieldAction key={`${inquiry.state}:${fieldAttachmentRevision}`}
      inquiryId={id} receiptKey={key} externalReady={inquiry.state === 'external_ready'}
      initialSummary={inquiry.state === 'external_ready'
        ? inquiry.messages.filter(item => item.actor === 'customer').at(-1)?.body ?? '' : ''} />}</main></div>;
}
