"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { retentionRequest, RETENTION_REASONS, RETENTION_ACTIONS,
  type RetentionPolicy, type RetentionHold, type RetentionAudit, type RetentionPreview } from './field-retention';

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div><label htmlFor={id}>{label}</label>{children}</div>;
}
function ActionForm({ id, label, button, locked, send }: { id: string; label: string; button: string; locked: boolean; send: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return <form className="form-fields" onSubmit={event => { event.preventDefault(); send(reason); }}>
    <Field id={id} label={label}><textarea id={id} required minLength={10} maxLength={500} readOnly={locked}
      value={reason} onChange={event => setReason(event.target.value)} /></Field><button type="submit" disabled={locked}>{button}</button></form>;
}

export function FieldRetentionAdmin({ actorUserId, role }: { actorUserId: string; role: string }) {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]), [holds, setHolds] = useState<RetentionHold[]>([]), [events, setEvents] = useState<RetentionAudit[]>([]);
  const [loadState, setLoadState] = useState('loading'), [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  const [uncertain, setUncertain] = useState(false), pending = useRef<{ path: string; body: unknown; key: string } | null>(null);
  const [workDays, setWorkDays] = useState(180), [photoDays, setPhotoDays] = useState(90), [policyReference, setPolicyReference] = useState(''), [policyReason, setPolicyReason] = useState('');
  const [org, setOrg] = useState(''), [policyId, setPolicyId] = useState(''), [preview, setPreview] = useState<RetentionPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false), [previewFailed, setPreviewFailed] = useState(false), previewSequence = useRef(0);
  const [holdOrg, setHoldOrg] = useState(''), [kind, setKind] = useState('inquiry'), [target, setTarget] = useState(''), [code, setCode] = useState('dispute');
  const [holdReference, setHoldReference] = useState(''), [holdReason, setHoldReason] = useState('');
  const [reviewDue, setReviewDue] = useState(() => { const d = new Date(Date.now() + 7 * 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
  const clearPreview = useCallback(() => { previewSequence.current++; setPreview(null); setPreviewFailed(false); setPreviewBusy(false); }, []);
  const load = useCallback(async () => {
    clearPreview(); setLoadState('loading');
    try {
      const [p, h, a] = await Promise.all([
        retentionRequest<{ policies: RetentionPolicy[] }>('/v1/admin/retention/policies'),
        retentionRequest<{ holds: RetentionHold[] }>('/v1/admin/retention/holds'),
        retentionRequest<{ events: RetentionAudit[] }>('/v1/admin/retention/audit'),
      ]);
      if (p.status !== 200 || h.status !== 200 || a.status !== 200 || !Array.isArray(p.data.policies)
        || !Array.isArray(h.data.holds) || !Array.isArray(a.data.events)) throw new Error('unavailable');
      setPolicies(p.data.policies); setHolds(h.data.holds); setEvents(a.data.events); setLoadState('ready');
    } catch { setLoadState('failed'); setStatus('보존 원장을 확인하지 못했습니다. 기존 목록을 유지하며 조작을 잠급니다. 다시 조회해 주세요.'); }
  }, [clearPreview]);
  useEffect(() => { void load(); return () => { previewSequence.current++; }; }, [load]);
  const locked = role !== 'operator' || busy || uncertain || loadState !== 'ready';
  async function send(path: string, body: unknown) {
    if (pending.current || busy) return;
    pending.current = { path, body, key: crypto.randomUUID() }; await deliver();
  }
  async function deliver() {
    const attempt = pending.current; if (!attempt) return;
    setBusy(true); setStatus(''); clearPreview();
    try {
      const response = await retentionRequest<{ error?: string }>(attempt.path, 'POST', attempt.body, attempt.key);
      pending.current = null; setUncertain(false);
      if (![200, 201].includes(response.status)) { setStatus(`처리하지 못했습니다 (${response.data.error ?? response.status}). 원장을 다시 확인해 주세요.`); await load(); return; }
      await load(); setStatus('처리 결과를 확인했습니다.');
    } catch { setUncertain(true); setStatus('응답을 확인하지 못했습니다. 같은 요청 결과를 확인해 주세요. 새 요청을 만들지 않습니다.'); }
    finally { setBusy(false); }
  }
  async function showPreview(before?: string) {
    const current = ++previewSequence.current, prior = preview;
    setPreview(null); setPreviewFailed(false); setPreviewBusy(true);
    try {
      const response = await retentionRequest<RetentionPreview>(`/v1/admin/retention/preview?organizationId=${encodeURIComponent(org)}&policyId=${encodeURIComponent(policyId)}${before ? `&before=${encodeURIComponent(before)}` : ''}`);
      if (response.status !== 200 || response.data.execution !== 'preview_only' || !Array.isArray(response.data.items)) throw new Error('unavailable');
      if (previewSequence.current === current) setPreview(before && prior ? { ...response.data, items: [...prior.items, ...response.data.items] } : response.data);
    } catch { if (previewSequence.current === current) setPreviewFailed(true); }
    finally { if (previewSequence.current === current) setPreviewBusy(false); }
  }
  return <section className="field-retention-panel" aria-label="보존 정책과 분쟁 보류"><h2>보존 정책과 분쟁 보류</h2>
    <p>종결된 Field 업무의 보존 기준을 검토합니다. 180일·사진 90일은 제안값이며 별도 승인이 필요합니다. 미리보기는 삭제 실행이나 삭제 완료 증빙이 아닙니다.</p>
    {status && <p role="status">{status}</p>}
    {loadState === 'loading' && <p role="status">보존 정책·보류 원장을 확인하는 중입니다.</p>}
    <button type="button" disabled={busy || previewBusy || uncertain} onClick={() => { setStatus(''); void load(); }}>보존 상태 다시 조회</button>
    {uncertain && <button type="button" disabled={busy} onClick={() => void deliver()}>같은 요청 결과 확인</button>}
    {role !== 'operator' && <p>감사자는 메타데이터만 조회할 수 있습니다. 정책·보류 변경은 운영자 권한이 필요합니다.</p>}
    {role === 'operator' && <form className="form-fields" aria-label="보존 정책 요청" onSubmit={event => { event.preventDefault();
      void send('/v1/admin/retention/policies', { workDays, photoDays, reference: policyReference, reason: policyReason }); }}>
      <h3>보존 정책 요청</h3>
      <Field id="field-retention-work-days" label="업무 보존 일수"><input id="field-retention-work-days" type="number" required min={1} max={3650} readOnly={locked} value={workDays} onChange={event => setWorkDays(Number(event.target.value))} /></Field>
      <Field id="field-retention-photo-days" label="사진 보존 일수"><input id="field-retention-photo-days" type="number" required min={1} max={workDays} readOnly={locked} value={photoDays} onChange={event => setPhotoDays(Number(event.target.value))} /></Field>
      <Field id="field-retention-policy-reference" label="정책 검토 참조"><input id="field-retention-policy-reference" required maxLength={160} readOnly={locked} value={policyReference} onChange={event => setPolicyReference(event.target.value)} /></Field>
      <Field id="field-retention-policy-reason" label="정책 요청 사유"><textarea id="field-retention-policy-reason" required minLength={10} maxLength={500} readOnly={locked} value={policyReason} onChange={event => setPolicyReason(event.target.value)} /></Field>
      <button type="submit" disabled={locked}>보존 정책 요청</button>
    </form>}
    <h3>최근 보존 정책 · 최대 100개</h3>
    {loadState === 'ready' && !policies.length && <p>등록된 보존 정책이 없습니다.</p>}
    {policies.map(p => <article className="field-retention-policy" key={p.id}><h4>{p.reference}</h4><p>정책 ID {p.id}</p><p>업무 {p.workDays}일 · 사진 {p.photoDays}일 · {p.state === 'approved' ? '승인됨' : p.state === 'retired' ? '중단됨' : '승인 대기'}</p><p>{p.reason}</p>
      {role === 'operator' && p.state === 'pending' && p.requestedBy !== actorUserId && <ActionForm id={`field-retention-approve-${p.id}`} label="정책 승인 사유" button="정책 승인" locked={locked} send={reason => void send(`/v1/admin/retention/policies/${p.id}/approve`, { reason })} />}
      {p.state === 'pending' && p.requestedBy === actorUserId && <p>다른 운영자의 승인이 필요합니다.</p>}
      {role === 'operator' && p.state !== 'retired' && <ActionForm id={`field-retention-retire-${p.id}`} label="정책 중단 사유" button="정책 적용 중단" locked={locked} send={reason => void send(`/v1/admin/retention/policies/${p.id}/retire`, { reason })} />}
    </article>)}
    {role === 'operator' && <form className="form-fields" aria-label="분쟁 보류 등록" onSubmit={event => { event.preventDefault();
      void send('/v1/admin/retention/holds', { organizationId: holdOrg, targetKind: kind, targetId: target, reasonCode: code,
        reference: holdReference, reason: holdReason, reviewDueAt: new Date(reviewDue).toISOString() }); }}>
      <h3>분쟁 보류 등록</h3><p>검토 예정일이 지나도 자동 해제되지 않습니다. 다른 운영자가 검토 사유를 남겨 해제합니다.</p>
      <Field id="field-retention-hold-org" label="보류 조직 ID"><input id="field-retention-hold-org" required readOnly={locked} value={holdOrg} onChange={event => setHoldOrg(event.target.value)} /></Field>
      <Field id="field-retention-hold-kind" label="보류 업무 종류"><select id="field-retention-hold-kind" disabled={locked} value={kind} onChange={event => setKind(event.target.value)}><option value="inquiry">Field 직접 문의</option><option value="reservation">Field 예약</option><option value="external_request">Field 수신 업무</option></select></Field>
      <Field id="field-retention-hold-target" label="보류 업무 ID"><input id="field-retention-hold-target" required readOnly={locked} value={target} onChange={event => setTarget(event.target.value)} /></Field>
      <Field id="field-retention-hold-code" label="보류 종류"><select id="field-retention-hold-code" disabled={locked} value={code} onChange={event => setCode(event.target.value)}><option value="dispute">분쟁</option><option value="legal_record">법정 기록 검토</option><option value="investigation">조사</option></select></Field>
      <Field id="field-retention-hold-review" label="보류 검토 예정 시각"><input id="field-retention-hold-review" type="datetime-local" required readOnly={locked} value={reviewDue} onChange={event => setReviewDue(event.target.value)} /></Field>
      <Field id="field-retention-hold-reference" label="보류 검토 참조"><input id="field-retention-hold-reference" required maxLength={160} readOnly={locked} value={holdReference} onChange={event => setHoldReference(event.target.value)} /></Field>
      <Field id="field-retention-hold-reason" label="보류 사유"><textarea id="field-retention-hold-reason" required minLength={10} maxLength={500} readOnly={locked} value={holdReason} onChange={event => setHoldReason(event.target.value)} /></Field>
      <button type="submit" disabled={locked}>분쟁 보류 등록</button>
    </form>}
    <h3>최근 보류 · 최대 100개</h3>
    {loadState === 'ready' && !holds.length && <p>등록된 보류가 없습니다.</p>}
    {holds.map(h => <article className="field-retention-hold" key={h.id}><h4>{h.reference}</h4><p>보류 ID {h.id}</p><p>{h.targetKind} · 업무 ID {h.targetId}</p><p>{h.state === 'released' ? '해제됨' : '보류 중'} · 검토 예정 {new Date(h.reviewDueAt).toLocaleString('ko-KR')}</p><p>{h.reason}</p>
      {h.state === 'active' && Date.parse(h.reviewDueAt) < Date.now() && <p>검토 예정일 경과 · 보류는 유지됩니다.</p>}
      {role === 'operator' && h.state === 'active' && h.createdBy !== actorUserId && <ActionForm id={`field-retention-release-${h.id}`} label="보류 해제 사유" button="보류 해제" locked={locked} send={reason => void send(`/v1/admin/retention/holds/${h.id}/release`, { reason })} />}
      {h.state === 'active' && h.createdBy === actorUserId && <p>다른 운영자의 해제 검토가 필요합니다.</p>}
    </article>)}
    <form className="form-fields" aria-label="정리 대상 미리보기" onSubmit={event => { event.preventDefault(); void showPreview(); }}><h3>정리 대상 미리보기</h3>
      <Field id="field-retention-preview-org" label="검수 조직 ID"><input id="field-retention-preview-org" required disabled={previewBusy || busy || uncertain} value={org} onChange={event => { setOrg(event.target.value); clearPreview(); }} /></Field>
      <Field id="field-retention-preview-policy" label="미리보기 정책"><select id="field-retention-preview-policy" required disabled={previewBusy || busy || uncertain} value={policyId} onChange={event => { setPolicyId(event.target.value); clearPreview(); }}><option value="">정책 선택</option>{policies.map(p => <option key={p.id} value={p.id}>{p.reference} · {p.workDays}/{p.photoDays}일</option>)}</select></Field>
      <button type="submit" disabled={loadState !== 'ready' || previewBusy || busy || uncertain}>정리 대상 미리보기</button>
    </form>
    {previewBusy && <p role="status">업무·보류·지원 승인 상태를 확인하는 중입니다.</p>}
    {previewFailed && <p role="alert">미리보기를 확인하지 못했습니다. 이전 결과를 폐기했습니다. 다시 조회해 주세요.</p>}
    {preview && <section aria-label="정리 미리보기 결과"><h3>정리 미리보기 결과</h3><p>조회 시각 {new Date(preview.snapshotAt).toLocaleString('ko-KR')} · 삭제 실행 없음</p>
      {!preview.items.length && <p>이 조직에서 조회된 업무가 없습니다.</p>}
      {preview.items.map(w => <article className="field-retention-work" key={`${w.targetKind}:${w.targetId}`}><h4>{w.targetKind} · {w.state}</h4><p>업무 ID {w.targetId}</p><p>{RETENTION_REASONS[w.reason] ?? w.reason}</p><p>종결 기준 {w.closedAt ? new Date(w.closedAt).toLocaleString('ko-KR') : '미확인'}</p>
        {w.workDueAt && <p>업무 기한 {new Date(w.workDueAt).toLocaleString('ko-KR')} · 사진 기한 {new Date(w.photoDueAt!).toLocaleString('ko-KR')}</p>}
        {w.reason === 'due' && <p>{w.workDue ? '업무 정리 검토 대상' : '업무 보존 기간 유지'} · {w.photosDue ? '사진 정리 검토 대상' : '사진 보존 기간 유지'}</p>}
      </article>)}
      {preview.nextCursor && <button type="button" disabled={previewBusy || busy || uncertain} onClick={() => void showPreview(preview.nextCursor!)}>다음 업무 100개</button>}
    </section>}
    <details><summary>최근 보존 감사 · 최대 100개</summary>{events.map(e => <article key={e.id}><h4>{RETENTION_ACTIONS[e.action] ?? e.action}</h4><p>{e.reason}</p><p>{new Date(e.createdAt).toLocaleString('ko-KR')}{e.targetId ? ` · 업무 ${e.targetId}` : ''}</p></article>)}</details>
  </section>;
}
