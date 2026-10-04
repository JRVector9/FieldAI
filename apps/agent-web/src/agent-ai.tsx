"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { DELETION_SCHEDULED_OWNER_MESSAGE, isDeletionScheduledError } from "./deletion-scheduled-copy";

type AgentDraft = {
  organizationId: string; agentId: string; revision: number;
  name: string; tone: "clear" | "warm" | "formal"; guideScope: string; handoffText: string;
};
type AgentRelease = Omit<AgentDraft, "organizationId"> & {
  releaseId: string; draftRevision: number; knowledgeRevision: number;
};
type SaveIssue = { kind: "unknown"; submitted: AgentDraft } | {
  kind: "conflict"; submitted: AgentDraft; remote: AgentDraft;
};
type TestResult = {
  runId: string; answer: string; evidenceIds: string[]; unknowns: string[];
  handoffRecommended: boolean; agentRevision: number; knowledgeRevision: number;
  usage: { inputTokens: number; outputTokens: number };
};
async function requestJson(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method, credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
function sameConfig(left: AgentDraft, right: AgentDraft) {
  return left.name === right.name && left.tone === right.tone
    && left.guideScope === right.guideScope && left.handoffText === right.handoffText;
}

export function AgentAiWorkspace() {
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [release, setRelease] = useState<AgentRelease | null>(null);
  const [knowledgeRevision, setKnowledgeRevision] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<TestResult | null>(null);
  const [status, setStatus] = useState("AI 설정을 확인하고 있습니다.");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed" | "needs_setup">("loading");
  const [busy, setBusy] = useState(false);
  const [saveIssue, setSaveIssue] = useState<SaveIssue | null>(null);
  const load = useCallback(async () => {
    setLoadState("loading"); setStatus("AI 설정을 확인하고 있습니다.");
    try {
      const agent = await requestJson("/v1/agents/draft");
      if (agent.status === 401 || agent.status === 404) {
        setLoadState("needs_setup");
        setStatus("먼저 AP 작업 공간에서 로그인하고 조직을 만들어 주세요.");
        return;
      }
      if (agent.status !== 200) {
        setLoadState("failed"); setStatus(`AI 설정을 불러오지 못했습니다 (${agent.status}). 다시 시도해 주세요.`);
        return;
      }
      const next = agent.data as AgentDraft;
      const [active, knowledge] = await Promise.all([
        requestJson("/v1/agents/releases/latest"),
        requestJson(`/v1/public/organizations/${next.organizationId}`),
      ]);
      if (active.status !== 200 && active.status !== 404) {
        setLoadState("failed"); setStatus(`AI 승인 상태를 불러오지 못했습니다 (${active.status}). 다시 시도해 주세요.`);
        return;
      }
      if (knowledge.status !== 200 && knowledge.status !== 404) {
        setLoadState("failed"); setStatus(`승인 지식을 불러오지 못했습니다 (${knowledge.status}). 다시 시도해 주세요.`);
        return;
      }
      setDraft(next); setDirty(false); setSaveIssue(null);
      setRelease(active.status === 200 ? active.data as AgentRelease : null);
      setKnowledgeRevision(knowledge.status === 200 ? (knowledge.data as { revision: number }).revision : null);
      setLoadState("ready"); setStatus("");
    } catch {
      setLoadState("failed"); setStatus("AP 서버에 연결하지 못했습니다. 다시 시도해 주세요.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function reconcileSave(submitted: AgentDraft) {
    try {
      const result = await requestJson("/v1/agents/draft");
      if (result.status !== 200) throw new Error(`draft status ${result.status}`);
      const remote = result.data as AgentDraft;
      if (sameConfig(remote, submitted)) {
        setDraft(remote); setDirty(false); setSaveIssue(null);
        setStatus(`AI 설정 초안을 저장했습니다. 서버 revision ${remote.revision}번을 확인했습니다. 고객에게 적용하려면 승인이 필요합니다.`);
      } else {
        setSaveIssue({ kind: "conflict", submitted, remote });
        setStatus("AI 설정 저장 충돌: 서버 초안과 내 입력이 다릅니다. 두 버전을 확인하고 선택해 주세요.");
      }
    } catch {
      setSaveIssue({ kind: "unknown", submitted });
      setStatus("AI 설정 저장 상태를 불러오지 못했습니다. 입력을 보존했습니다. 다시 확인해 주세요.");
    }
  }
  async function sendDraftSave(submitted: AgentDraft, expectedRevision: number) {
    setBusy(true); setStatus("AI 설정 저장 중입니다.");
    try {
      const result = await requestJson("/v1/agents/draft", "PUT", {
        expectedRevision, name: submitted.name, tone: submitted.tone,
        guideScope: submitted.guideScope, handoffText: submitted.handoffText,
      });
      if (result.status === 200) {
        setDraft(result.data as AgentDraft); setDirty(false); setSaveIssue(null);
        setStatus("AI 설정 초안을 저장했습니다. 고객에게 적용하려면 승인이 필요합니다.");
      } else if (result.status === 409) {
        await reconcileSave(submitted);
      } else if (result.status >= 500) {
        setSaveIssue({ kind: "unknown", submitted });
        setStatus("AI 설정 저장 결과를 확인할 수 없습니다. 저장 상태 확인으로 서버 초안을 조회해 주세요.");
      } else {
        setStatus(`AI 설정을 저장하지 못했습니다 (${result.status}). 입력 내용은 화면에 남아 있습니다.`);
      }
    } catch {
      setSaveIssue({ kind: "unknown", submitted });
      setStatus("AI 설정 저장 결과를 확인할 수 없습니다. 저장 상태 확인으로 서버 초안을 조회해 주세요.");
    }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busy || saveIssue) return;
    await sendDraftSave(draft, draft.revision);
  }
  async function checkSave() {
    if (!saveIssue || busy) return;
    setBusy(true);
    try { await reconcileSave(saveIssue.submitted); }
    finally { setBusy(false); }
  }
  async function resolveConflict(useLocal: boolean) {
    if (saveIssue?.kind !== "conflict" || busy) return;
    if (useLocal) await sendDraftSave(saveIssue.submitted, saveIssue.remote.revision);
    else {
      setDraft(saveIssue.remote); setDirty(false); setSaveIssue(null);
      setStatus("서버의 AI 설정 초안을 선택했습니다. 고객에게 적용하려면 승인이 필요합니다.");
    }
  }
  async function approve() {
    if (!draft || knowledgeRevision === null || dirty || saveIssue) return;
    setBusy(true); setStatus("AI와 승인 지식을 묶고 있습니다.");
    try {
      const result = await requestJson("/v1/agents/releases", "POST", {
        expectedRevision: draft.revision, expectedKnowledgeRevision: knowledgeRevision,
      });
      if (result.status === 200 || result.status === 201) {
        const active = await requestJson("/v1/agents/releases/latest").catch(() => null);
        if (!active || active.status !== 200) {
          setLoadState("failed");
          setStatus("AI 승인은 완료됐지만 상태를 다시 읽지 못했습니다. 다시 불러오기로 승인 버전을 확인해 주세요.");
          return;
        }
        setRelease(active.data as AgentRelease);
        setStatus("AI 설정과 승인 지식 버전을 묶었습니다. 고객 자동 응답은 별도 활성화 단계가 필요합니다.");
      } else if (isDeletionScheduledError(result.status, result.data)) setStatus(DELETION_SCHEDULED_OWNER_MESSAGE);
      else if (result.status === 409) setStatus("설정 또는 지식 버전이 변경됐습니다. 최신 상태를 확인해 주세요.");
      else setStatus(`AI 설정 승인이 실패했습니다 (${result.status}).`);
    } catch {
      setLoadState("failed");
      setStatus("AI 승인 결과를 확인할 수 없습니다. 다시 불러오기로 서버의 승인 상태를 확인해 주세요.");
    }
    finally { setBusy(false); }
  }
  async function testAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setAnswer(null); setStatus("승인 정보로 답변을 테스트하고 있습니다.");
    try {
      const result = await requestJson("/v1/agents/test", "POST", { question });
      if (result.status === 200) { setAnswer(result.data as TestResult); setStatus("사업자 테스트 결과입니다. 고객 문의·알림은 만들지 않았습니다."); }
      else if (isDeletionScheduledError(result.status, result.data)) setStatus(DELETION_SCHEDULED_OWNER_MESSAGE);
      else if (result.status === 503 && (result.data as { error?: string }).error === "blocked_integration")
        setStatus("실제 모델 공급사 설정이 없어 테스트를 실행할 수 없습니다. 연결 상태: blocked_integration.");
      else if (result.status === 422) setStatus("모델 답변의 근거 또는 숫자를 서버가 거부했습니다. 사람 안내 문구와 승인 지식을 점검해 주세요.");
      else if (result.status === 429) setStatus("오늘의 사업자 테스트 한도를 넘었습니다.");
      else if (result.status === 409) setStatus("승인 AI·지식 버전이 맞지 않습니다. 최신 지식으로 다시 승인해 주세요.");
      else setStatus(`답변 테스트에 실패했습니다 (${result.status}).`);
    } catch { setStatus("테스트 요청을 전달하지 못했습니다. 사용량 상태는 새로고침으로 확인해 주세요."); }
    finally { setBusy(false); }
  }
  const change = (patch: Partial<AgentDraft>) => { setDraft(current => current ? { ...current, ...patch } : current); setDirty(true); };
  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Agent Platform" /></a><nav aria-label="작업 메뉴"><a href="/workspace">사업 정보·문의함</a><a href="/workspace/deployments">상담 배포</a></nav></header>
    <main className="feature-section"><div className="feature-heading"><p className="eyebrow">Agent Platform · AI 설정</p><h1>승인 지식으로 답변 테스트</h1><p>AI 설정 초안과 승인 버전을 분리합니다. 이 테스트는 고객 대화나 문의를 만들지 않습니다.</p></div>
      {status && <p role="status" className="state-message">{status}</p>}
      {loadState === "failed" && <button type="button" disabled={busy} onClick={() => void load()}>다시 불러오기</button>}
      {loadState === "needs_setup" && <p><a href="/workspace">AP 작업 공간 열기</a></p>}
      {loadState === "ready" && draft && <div className="special-grid"><section className="special-panel"><div className="panel-heading"><h2>AI 설정 초안</h2><span>revision {draft.revision}{dirty ? " · 미저장" : ""}</span></div><form className="form-fields" onSubmit={event => void save(event)}><label>AI 이름<input required maxLength={80} disabled={busy || !!saveIssue} value={draft.name} onChange={event => change({ name: event.target.value })} /></label><label>말투<select disabled={busy || !!saveIssue} value={draft.tone} onChange={event => change({ tone: event.target.value as AgentDraft["tone"] })}><option value="clear">명료하게</option><option value="warm">따뜻하게</option><option value="formal">격식 있게</option></select></label><label>안내 범위<textarea maxLength={1000} disabled={busy || !!saveIssue} value={draft.guideScope} onChange={event => change({ guideScope: event.target.value })} /></label><label>사람 연결 안내<textarea required maxLength={500} disabled={busy || !!saveIssue} value={draft.handoffText} onChange={event => change({ handoffText: event.target.value })} /></label><button type="submit" disabled={busy || !!saveIssue}>AI 설정 저장</button></form>{saveIssue?.kind === "unknown" && <div className="knowledge-source" role="region" aria-label="AI 설정 저장 상태"><p>저장 요청의 서버 결과가 확인되지 않았습니다. 같은 요청을 다시 보내기 전에 서버 초안을 확인해 주세요.</p><button type="button" disabled={busy} onClick={() => void checkSave()}>저장 상태 확인</button></div>}{saveIssue?.kind === "conflict" && <div className="knowledge-source" role="region" aria-label="AI 설정 저장 충돌"><h3>AI 설정 저장 충돌</h3><p>내 입력과 서버 {saveIssue.remote.revision}번 초안이 다릅니다.</p><details><summary>서버 초안 보기</summary><p>AI 이름: {saveIssue.remote.name}</p><p>말투: {saveIssue.remote.tone}</p><p>안내 범위: {saveIssue.remote.guideScope || "없음"}</p><p>사람 연결 안내: {saveIssue.remote.handoffText}</p></details><button type="button" disabled={busy} onClick={() => void resolveConflict(true)}>내 입력으로 다시 저장</button><button type="button" disabled={busy} onClick={() => void resolveConflict(false)}>서버 초안 사용</button><p>내 입력을 선택하면 서버 변경을 대체합니다.</p></div>}</section>
        <aside className="special-panel"><h2>승인 상태</h2><p>승인 지식: {knowledgeRevision === null ? "없음" : `${knowledgeRevision}번`}</p><p>AI 승인: {release ? `${release.revision}번 · 지식 ${release.knowledgeRevision}번` : "없음"}</p>{release && knowledgeRevision !== release.knowledgeRevision && <p role="status">지식이 변경됐습니다. 새 버전으로 AI를 다시 승인해야 테스트할 수 있습니다.</p>}<button type="button" disabled={busy || !!saveIssue || dirty || draft.revision === 0 || knowledgeRevision === null || (release?.draftRevision === draft.revision && release.knowledgeRevision === knowledgeRevision)} onClick={() => void approve()}>현재 AI·지식 승인</button><p>모델 공급사 키가 없으면 답변 테스트는 <code>blocked_integration</code>으로 표시됩니다.</p></aside></div>}
      {loadState === "ready" && draft && <section className="special-panel"><h2>사업자 답변 테스트</h2><form className="form-fields" onSubmit={event => void testAnswer(event)}><label>고객 질문 가정<textarea required maxLength={1000} value={question} onChange={event => setQuestion(event.target.value)} placeholder="승인 서비스나 FAQ를 물어보세요. 이름·전화번호는 넣지 마세요." /></label><button type="submit" disabled={busy || !!saveIssue || !release || release.knowledgeRevision !== knowledgeRevision}>승인 지식으로 테스트</button></form>{answer && <div className="knowledge-source"><h3>검증된 테스트 결과</h3>{answer.answer ? <p>{answer.answer}</p> : <p>승인 지식으로 답할 수 없어 사람 연결을 권합니다.</p>}<p>근거: {answer.evidenceIds.length ? answer.evidenceIds.join(", ") : "없음"}</p>{answer.unknowns.length > 0 && <p>미확인: {answer.unknowns.join(", ")}</p>}<p>사람 연결 권장: {answer.handoffRecommended ? "예" : "아니요"}</p><small>지식 {answer.knowledgeRevision}번 · AI {answer.agentRevision}번 · 입력 {answer.usage.inputTokens} / 출력 {answer.usage.outputTokens} 토큰</small></div>}</section>}
    </main></div>;
}
