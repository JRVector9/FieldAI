"use client";

import { useCallback, useEffect, useState } from 'react';

type UnknownFieldAction = { id: string; organizationId: string; organizationName: string; inquiryId: string;
  connectionId: string; kind: string; consentConfirmedAt: string; state: string; errorCode: string | null };
type Role = 'operator' | 'auditor';
export function unknownFieldCloseBlockReason(input: { role: Role; reason: string; acknowledged: boolean; busy: boolean; failed: boolean }) {
  if (input.role !== 'operator') return '종결은 operator 권한이 필요합니다. 감사자는 목록만 확인할 수 있습니다.';
  if (input.busy) return '진행 중인 요청이 끝나면 종결할 수 있습니다.';
  if (input.failed) return '목록을 다시 조회한 뒤 실제 상태를 확인해 주세요.';
  if (input.reason.includes('\u0000') || input.reason.trim().length < 10 || input.reason.trim().length > 500)
    return '종결 사유를 10~500자로 입력해 주세요.';
  if (!input.acknowledged) return 'Field 업무 결과를 알 수 없고 새 전달 제한이 유지되는 점을 확인해 주세요.';
  return null;
}

export function UnknownFieldActionsList({ items, role, reasons, acknowledged, busy, failed, onReason, onAcknowledge, onClose }: {
  items: UnknownFieldAction[]; role: Role; reasons: Record<string, string>; acknowledged: Record<string, boolean>;
  busy: boolean; failed: boolean; onReason: (id: string, value: string) => void;
  onAcknowledge: (id: string, value: boolean) => void; onClose: (id: string) => void;
}) {
  return <div className="agent-admin-list">{items.map(item => {
    const blocked = unknownFieldCloseBlockReason({ role, reason: reasons[item.id] ?? '', acknowledged: acknowledged[item.id] ?? false, busy, failed });
    return <article key={item.id}><h3>{item.organizationName}</h3>
      <p>Field 전달 결과 미상 · {item.kind === 'inquiry' ? '문의 전달' : '예약 요청 전달'}</p>
      <p>고객 동의 {new Date(item.consentConfirmedAt).toLocaleString('ko-KR')} · 요청 ID {item.id}</p>
      <p>AP 문의 ID {item.inquiryId} · 연결 ID {item.connectionId}</p>
      <p>종결해도 Field 업무가 취소되지 않습니다. 실제 수신 결과는 미상으로 남고 같은 문의·연결·서비스의 새 전달 제한을 유지합니다.</p>
      {role === 'operator' && <><label>종결 사유(10~500자)<textarea value={reasons[item.id] ?? ''} maxLength={500} disabled={busy || failed}
        onChange={event => onReason(item.id, event.target.value)} /></label>
        <label><input type="checkbox" checked={acknowledged[item.id] ?? false} disabled={busy || failed}
          onChange={event => onAcknowledge(item.id, event.target.checked)} />결과 미상과 새 전달 제한 유지에 동의합니다.</label></>}
      <button type="button" disabled={blocked !== null} aria-describedby={blocked ? `unknown-close-${item.id}` : undefined}
        onClick={() => onClose(item.id)}>미해결로 종결</button>
      {blocked && <p id={`unknown-close-${item.id}`}>{blocked}</p>}
    </article>;
  })}</div>;
}

export function AgentUnknownFieldActions({ role }: { role: Role }) {
  const [items, setItems] = useState<UnknownFieldAction[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [status, setStatus] = useState('');
  const load = useCallback(async (cursor?: string) => {
    setBusy(true);
    try {
      const query = new URLSearchParams({ state: 'delivery_unknown', unreconcilable: 'true', ...(cursor ? { cursor } : {}) });
      const response = await fetch(`/v1/admin/field-actions?${query}`, { credentials: 'same-origin' });
      const value = await response.json() as { product: string; actions?: UnknownFieldAction[]; nextCursor?: string | null };
      if (!response.ok || value.product !== 'agent' || !Array.isArray(value.actions)) throw new Error('queue_unavailable');
      setItems(current => cursor ? [...(current ?? []), ...value.actions!] : value.actions!);
      setNextCursor(value.nextCursor ?? null); setFailed(false); setStatus(''); return true;
    } catch { setFailed(true); setStatus('미해결 전달 목록을 불러오지 못했습니다. 다시 조회해 주세요.'); return false; }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function close(id: string) {
    const reason = (reasons[id] ?? '').trim();
    if (unknownFieldCloseBlockReason({ role, reason, acknowledged: acknowledged[id] ?? false, busy, failed })) return;
    setBusy(true); setStatus('종결 기록을 저장하고 있습니다.');
    try {
      const response = await fetch(`/v1/admin/field-actions/${encodeURIComponent(id)}/close-unknown`, {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) });
      const value = await response.json().catch(() => ({})) as { error?: string; id?: string; state?: string };
      if (response.status === 200 && (value.id !== id || value.state !== 'unresolved'))
        throw new Error('closure_receipt_unconfirmed');
      if (response.status === 200) {
        setReasons(current => { const result = { ...current }; delete result[id]; return result; });
        setAcknowledged(current => { const result = { ...current }; delete result[id]; return result; });
        const refreshed = await load();
        setStatus(refreshed ? '미해결로 종결했습니다. Field 수신 결과는 미상으로 남습니다.' : '종결 기록을 저장했지만 목록을 다시 확인하지 못했습니다. 목록을 새로고침해 주세요.');
      } else if (response.status === 409) {
        await load(); setStatus('현재 요청은 종결 가능한 결과 미상 상태가 아닙니다. 목록을 다시 확인해 주세요.');
      } else setStatus(value.error === 'invalid_reason' || value.error === 'invalid_text'
        ? '종결 사유를 10~500자로 입력해 주세요.' : '종결하지 못했습니다. 관리자 권한과 인증 상태를 확인해 주세요.');
    } catch { await load(); setStatus('종결 응답을 받지 못했습니다. 목록을 다시 조회해 실제 상태를 확인해 주세요.'); }
    finally { setBusy(false); }
  }
  return <section className="special-panel" aria-label="미해결 전달 요청 종결"><h2>미해결 전달 요청 종결 (추가)</h2>
    <p>고객 동의 후 24시간이 지나 수신 결과를 다시 확인할 수 없는 요청입니다. 고객 원문과 연락처는 표시하지 않습니다.</p>
    {status && <p role="status" className="state-message">{status}</p>}
    <button type="button" disabled={busy} onClick={() => void load()}>목록 새로고침</button>
    {items === null && !failed && <p role="status">전달 요청을 불러오고 있습니다.</p>}
    {items?.length === 0 && !failed && <p>종결 가능한 미해결 전달 요청이 없습니다.</p>}
    {items && <UnknownFieldActionsList items={items} role={role} reasons={reasons} acknowledged={acknowledged} busy={busy}
      failed={failed} onReason={(id, value) => setReasons(current => ({ ...current, [id]: value }))}
      onAcknowledge={(id, value) => setAcknowledged(current => ({ ...current, [id]: value }))} onClose={id => void close(id)} />}
    {nextCursor && <button type="button" disabled={busy || failed} onClick={() => void load(nextCursor)}>다음 요청 더 보기</button>}
  </section>;
}
