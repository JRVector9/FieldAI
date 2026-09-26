"use client";

import { useRef, useState } from "react";
import { requestJson } from "./field-api";

const randomKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

export function ReceiptRotationPanel({ path, label, currentKey, onRotated }: {
  path: string; label: "문의" | "예약"; currentKey: string; onRotated: (nextKey: string) => void;
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
      pending.current = { candidate, idempotencyKey: randomKey() };
    try {
      const result = await requestJson(path, "POST", { nextReceiptKey: candidate }, currentKey,
        { "idempotency-key": pending.current.idempotencyKey });
      if (result.status === 200) {
        onRotated(candidate); setDone(true);
        setNotice("새 확인키가 활성화되고 이전 키가 폐기됐습니다. 아래 새 키를 보관해 주세요.");
      } else if (result.status === 429) setNotice("확인키 입력이 여러 번 실패해 잠시 제한됩니다. 새 키를 보관하고 나중에 다시 시도해 주세요.");
      else if (result.status === 409) setNotice(`다른 키 교체와 충돌했습니다. ${label}을 새 키로 다시 열어 현재 상태를 확인해 주세요.`);
      else if (result.status === 401 || result.status === 404) setNotice(`기존 키가 유효하지 않습니다. 새 키로 ${label}을 다시 열어 상태를 확인해 주세요.`);
      else setNotice(`키를 교체하지 못했습니다 (${result.status}). 새 키를 보관한 채 다시 시도해 주세요.`);
    } catch { setNotice(`응답을 받지 못했습니다. 새 키를 보관하고 같은 버튼으로 다시 요청하거나 새 키로 ${label}을 열어 확인해 주세요.`); }
    finally { setBusy(false); }
  }
  return <div className="customer-banner"><h3>{label} 확인키 교체</h3>
    <p>새 키를 먼저 보관한 뒤 교체해 주세요. 교체되면 이전 키로 {label} 내용을 열 수 없습니다.</p>
    <button type="button" disabled={busy} onClick={() => {
      setCandidate(randomKey()); setCopied(false); setDone(false); setNotice(""); pending.current = null;
    }}>새 확인키 생성</button>
    {candidate && <><p>새 확인키</p><code style={{ overflowWrap: "anywhere" }}>{candidate}</code>
      {!done && <><label><input type="checkbox" checked={copied} onChange={event => setCopied(event.target.checked)} /> 새 확인키를 안전한 곳에 복사했습니다.</label>
        <button type="button" disabled={busy || !copied} onClick={() => void rotate()}>기존 키 폐기·새 키 활성화</button></>}</>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
