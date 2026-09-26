"use client";

import { useEffect, useState } from "react";
import { requestJson } from "./field-api";

type Source = { sourceRevision: number; approvedSourceRevision: number | null; state: string };
type Attempt = { expectedSourceRevision: number; key: string; operationId: string | null };
type Operation = { state: "pending" | "retry" | "completed" | "blocked";
  sourceRevision: number | null; error: string | null };
const apWebOrigin = process.env.NEXT_PUBLIC_AGENT_WEB_URL ?? "http://localhost:3001";
const keyPattern = /^[A-Za-z0-9_-]{43}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newKey() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function stored(id: string): Attempt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(`field-source-refresh:${id}`) ?? "null") as Attempt | null;
    return value && Number.isSafeInteger(value.expectedSourceRevision)
      && value.expectedSourceRevision >= 0 && keyPattern.test(value.key)
      && (value.operationId === null || uuid.test(value.operationId)) ? value : null;
  } catch { return null; }
}
function remember(id: string, attempt: Attempt | null) {
  try {
    if (attempt) sessionStorage.setItem(`field-source-refresh:${id}`, JSON.stringify(attempt));
    else sessionStorage.removeItem(`field-source-refresh:${id}`);
  } catch { /* Current tab still retains the attempt. */ }
}

export function FieldSourceRefresh({ connectionId, scopes }: { connectionId: string; scopes: string[] }) {
  const [source, setSource] = useState<Source | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const permitted = scopes.includes("ap.sources.refresh");
  async function loadSource() {
    const response = await requestJson(`/v1/connections/ap/${connectionId}/source-refresh`);
    if (response.status !== 200) {
      setStatus(response.status === 403 ? "AP 정보 갱신 권한이 없습니다. AP에서 새 범위에 동의해 주세요."
        : "AP 출처 상태를 확인하지 못했습니다. 다시 확인해 주세요."); return;
    }
    setSource(response.data as Source);
  }
  useEffect(() => {
    if (!permitted) return;
    setAttempt(stored(connectionId));
    void loadSource().catch(() => setStatus("AP 출처 상태에 연결하지 못했습니다."));
  }, [connectionId, permitted]);

  async function requestRefresh() {
    if (!source && !attempt) return;
    const current = attempt ?? { expectedSourceRevision: source!.sourceRevision,
      key: newKey(), operationId: null };
    setAttempt(current); remember(connectionId, current); setBusy(true);
    setStatus("AP에 승인 정보 갱신을 요청하고 있습니다.");
    try {
      const response = await requestJson(`/v1/connections/ap/${connectionId}/source-refresh`, "POST",
        { expectedSourceRevision: current.expectedSourceRevision }, undefined,
        { "idempotency-key": current.key });
      if (response.status === 202) {
        const operationId = (response.data as { operationId: string }).operationId;
        const saved = { ...current, operationId };
        setAttempt(saved); remember(connectionId, saved);
        setStatus("AP에 갱신 작업이 기록됐습니다. 처리 결과를 확인해 주세요. AP 사업자 승인 전에는 고객 AI에 반영되지 않습니다.");
      } else if (response.status === 409) {
        setAttempt(null); remember(connectionId, null);
        setStatus("AP의 출처 버전이 변경됐습니다. 현재 버전을 다시 확인한 뒤 요청해 주세요.");
        await loadSource();
      } else setStatus(response.status === 403 ? "AP 갱신 범위가 승인되지 않았습니다. 다시 연결해 권한을 확인해 주세요."
        : `갱신 요청 결과를 확인하지 못했습니다 (${response.status}). 같은 요청으로 다시 확인해 주세요.`);
    } catch { setStatus("요청 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요."); }
    finally { setBusy(false); }
  }

  async function inspectOperation() {
    if (!attempt?.operationId) return;
    setBusy(true);
    try {
      const response = await requestJson(
        `/v1/connections/ap/${connectionId}/source-refresh/${attempt.operationId}`);
      if (response.status !== 200) {
        setStatus("AP 작업 상태를 확인하지 못했습니다. 같은 작업을 다시 조회해 주세요."); return;
      }
      const operation = response.data as Operation;
      if (operation.state === "completed") {
        setAttempt(null); remember(connectionId, null);
        setStatus(`AP에 출처 ${operation.sourceRevision ?? "?"}번을 가져왔습니다. AP 사업자의 검토·승인과 AI 공개는 별도입니다.`);
        await loadSource();
      } else if (operation.state === "blocked") {
        setAttempt(null); remember(connectionId, null);
        setStatus(`AP 갱신 작업이 중지됐습니다 (${operation.error ?? "원인 확인 필요"}). 연결과 출처 버전을 확인해 주세요.`);
        await loadSource();
      } else setStatus(operation.state === "retry" ? "AP가 Field 조회를 다시 시도할 예정입니다. 잠시 후 상태를 확인해 주세요."
        : "AP 갱신 작업이 대기 중입니다. 잠시 후 상태를 확인해 주세요.");
    } catch { setStatus("AP 작업 상태에 연결하지 못했습니다. 다시 확인해 주세요."); }
    finally { setBusy(false); }
  }

  return <section className="knowledge-source" aria-label="AP 정보 갱신"><h3>AP 정보 갱신</h3>
    {!permitted ? <p>기존 연결에는 정보 갱신 범위가 없습니다. AP 연결을 다시 승인해야 합니다.</p>
      : <><p>AP 저장 버전: {source ? source.sourceRevision || "없음" : "확인 중"} · AP 승인 버전: {source?.approvedSourceRevision ?? "없음"}</p>
        <p>Field의 최신 승인 사업 정보를 AP 검토 대기로 가져옵니다. AP 고객 AI는 자동 변경되지 않습니다.</p>
        <button type="button" disabled={busy || (!source && !attempt)} onClick={() => void requestRefresh()}>
          {attempt ? "같은 갱신 요청 확인" : "AP 정보 갱신 요청"}</button>
        {attempt?.operationId && <button type="button" disabled={busy} onClick={() => void inspectOperation()}>작업 상태 확인</button>}
        <button type="button" disabled={busy} onClick={() => void loadSource()}>AP 출처 버전 다시 확인</button>
        <p><a href={`${apWebOrigin}/workspace/integrations`}>AP에서 변경 내용 검토하기</a></p>
      </>}
    {status && <p role="status">{status}</p>}
  </section>;
}
