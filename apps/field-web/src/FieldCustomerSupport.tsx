"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { SUPPORT_ACTIONS, SUPPORT_KINDS, SUPPORT_PHOTO_STATES, SUPPORT_SUBMISSION_LABELS, SUPPORT_PURPOSES, SUPPORT_SCOPES, SUPPORT_STATES, supportRequest,
  type SupportAccess, type SupportAudit, type SupportDetail } from './field-support';

function AccessCard({ access, actor, operator, locked, send, open }: { access: SupportAccess;
  actor: string; operator: boolean; locked: boolean; send: (path: string, body: unknown) => Promise<boolean>;
  open: (access: SupportAccess) => Promise<void> }) {
  const [approvalReason, setApprovalReason] = useState(''), [revocationReason, setRevocationReason] = useState('');
  return <article className="field-support-access"><h3>{SUPPORT_STATES[access.state]}</h3>
    <p>접근 ID <code>{access.id}</code></p><p>{SUPPORT_KINDS[access.targetKind]} · 업무 ID <code>{access.targetId}</code></p>
    <p>{SUPPORT_PURPOSES[access.purpose]} · 조사 참조 {access.reference}</p><p>{access.reason}</p>
    <p>허용 범위: {access.scopes.map(scope => SUPPORT_SCOPES[scope]).join(' · ')}</p><p>신청 운영자 <code>{access.requestedBy}</code></p>
    {access.expiresAt && <p>열람 종료: {new Date(access.expiresAt).toLocaleString('ko-KR')}</p>}
    {access.state === 'pending' && <form className="form-fields" onSubmit={event => {
      event.preventDefault(); void send(`/v1/admin/support-access/${access.id}/approve`, { reason: approvalReason });
    }}><div><label htmlFor={`field-support-approve-${access.id}`}>열람 승인 사유</label><textarea id={`field-support-approve-${access.id}`} required minLength={10} maxLength={500} readOnly={locked}
      value={approvalReason} onChange={event => setApprovalReason(event.target.value)} /></div>
      <button type="submit" disabled={locked || !operator || actor === access.requestedBy}>열람 승인</button>
      {actor === access.requestedBy && <p>자기 승인은 허용되지 않습니다. 다른 운영자의 승인을 기다립니다.</p>}
    </form>}
    {access.state === 'approved' && actor === access.requestedBy && operator && <button type="button" disabled={locked}
      onClick={() => void open(access)}>승인 범위 열람</button>}
    {['pending', 'approved'].includes(access.state) && operator && (actor === access.requestedBy || actor === access.approvedBy)
      && <form className="form-fields" onSubmit={event => { event.preventDefault();
        void send(`/v1/admin/support-access/${access.id}/revoke`, { reason: revocationReason });
      }}><div><label htmlFor={`field-support-revoke-${access.id}`}>승인 회수 사유</label><textarea id={`field-support-revoke-${access.id}`} required minLength={10} maxLength={500} readOnly={locked}
        value={revocationReason} onChange={event => setRevocationReason(event.target.value)} /></div>
        <button type="submit" disabled={locked}>열람 승인 회수</button></form>}
    {!operator && <p>감사자는 고객정보 열람·승인·회수 권한이 없습니다.</p>}
  </article>;
}

export function FieldCustomerSupport({ actorUserId, role }: { actorUserId: string; role: string }) {
  const [requests, setRequests] = useState<SupportAccess[]>([]), [events, setEvents] = useState<SupportAudit[]>([]);
  const [cursor, setCursor] = useState<string | null>(null), [loadState, setLoadState] = useState('loading');
  const [targetKind, setTargetKind] = useState('inquiry'), [targetId, setTargetId] = useState(''), [purpose, setPurpose] = useState('customer_requested_investigation');
  const [reference, setReference] = useState(''), [reason, setReason] = useState(''), [minutes, setMinutes] = useState(15);
  const [selectedScopes, setSelectedScopes] = useState(['conversation']), [minimumNecessary, setMinimumNecessary] = useState(false);
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState<string | null>(null);
  const [activeAccess, setActiveAccess] = useState<SupportAccess | null>(null), [detail, setDetail] = useState<SupportDetail | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const pending = useRef(new Map<string, { key: string; body: unknown }>());
  const sequence = useRef(0), url = useRef<string | null>(null), checking = useRef(false);
  const clearDetail = useCallback(() => {
    sequence.current++; setDetail(null); setActiveAccess(null);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null; setPhotoUrl(null);
  }, []);
  useEffect(() => () => { sequence.current++; if (url.current) URL.revokeObjectURL(url.current); }, []);
  const load = useCallback(async (before?: string) => {
    clearDetail(); setLoadState('loading');
    try {
      const [result, audit] = await Promise.all([
        supportRequest<{ requests: SupportAccess[]; nextCursor: string | null }>(`/v1/admin/support-access${before ? `?before=${before}` : ''}`),
        supportRequest<{ events: SupportAudit[] }>('/v1/admin/support-audit'),
      ]);
      if (result.status !== 200 || audit.status !== 200) throw new Error('unavailable');
      setRequests(current => before ? [...current, ...result.data.requests] : result.data.requests);
      setCursor(result.data.nextCursor); setEvents(audit.data.events); setLoadState('ready');
    } catch { setLoadState('failed'); setStatus('지원 접근 상태를 확인하지 못했습니다. 목록을 0건으로 판단하지 않습니다. 다시 확인해 주세요.'); }
  }, [clearDetail]);
  useEffect(() => { void load(); }, [load]);
  const checkAuthority = useCallback(async () => {
    if (!activeAccess || checking.current) return;
    const current = sequence.current; checking.current = true;
    try {
      const response = await supportRequest(`/v1/admin/support-access/${activeAccess.id}/status`, 'GET', undefined,
        { 'x-support-access-id': activeAccess.id });
      if (sequence.current === current && response.status !== 200) {
        clearDetail(); setStatus('열람 승인이 회수·만료되었거나 권한을 확인할 수 없어 상세를 닫았습니다.');
      }
    } catch { if (sequence.current === current) { clearDetail(); setStatus('열람 권한을 확인하지 못해 상세와 사진을 닫았습니다. 다시 승인 상태를 확인해 주세요.'); } }
    finally { checking.current = false; }
  }, [activeAccess, clearDetail]);
  useEffect(() => {
    if (!detail) return;
    const expiry = setTimeout(() => { clearDetail(); setStatus('열람 시간이 만료되었습니다. 다시 승인받아 주세요.'); },
      Math.max(0, Date.parse(detail.accessExpiresAt) - Date.now()));
    const interval = setInterval(() => void checkAuthority(), 10000);
    const focus = () => { if (document.visibilityState === 'visible') void checkAuthority(); };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    return () => { clearTimeout(expiry); clearInterval(interval); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [detail, checkAuthority, clearDetail]);
  async function open(access: SupportAccess) {
    clearDetail(); setStatus('');
    const current = sequence.current;
    try {
      const result = await supportRequest<SupportDetail>(`/v1/admin/support/${access.targetKind}/${access.targetId}`, 'GET', undefined,
        { 'x-support-access-id': access.id });
      if (sequence.current !== current) return;
      if (result.status !== 200 || Date.parse(result.data.accessExpiresAt) <= Date.now()) {
        setStatus('승인 범위를 열지 못했습니다. 기간·현재 권한·승인 회수를 확인해 주세요.'); return;
      }
      setActiveAccess(access); setDetail(result.data);
    } catch { if (sequence.current === current) setStatus('고객정보를 불러오지 못했습니다. 승인 범위 열람으로 다시 확인해 주세요.'); }
  }
  async function photo(id: string) {
    if (!detail || !activeAccess) return;
    const current = sequence.current;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null; setPhotoUrl(null); setBusy(true); setStatus('');
    try {
      const response = await fetch(`/v1/admin/support/${detail.work.kind}/${detail.work.id}/attachments/${id}`, {
        credentials: 'same-origin', cache: 'no-store', headers: { 'x-support-access-id': activeAccess.id },
      });
      if (sequence.current !== current) return;
      if (response.status === 403) { clearDetail(); setStatus('사진 열람 권한이 종료되어 상세를 닫았습니다.'); return; }
      if (response.status !== 200 || !response.headers.get('content-type')?.startsWith('image/webp')) {
        setStatus('사진을 읽지 못했습니다. 공급사 연결·파일 상태를 확인하고 다시 시도해 주세요.'); return;
      }
      const blob = await response.blob();
      if (sequence.current !== current) return;
      if (Date.parse(detail.accessExpiresAt) <= Date.now()) { clearDetail(); setStatus('열람 시간이 만료되었습니다. 다시 승인받아 주세요.'); return; }
      url.current = URL.createObjectURL(blob); setPhotoUrl(url.current);
    } catch { if (sequence.current === current) setStatus('사진 응답을 받지 못했습니다. 업무 사진 보기로 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  async function send(path: string, body: unknown) {
    clearDetail(); setBusy(true); setStatus('');
    let attempt = pending.current.get(path);
    if (!attempt) { attempt = { key: crypto.randomUUID(), body }; pending.current.set(path, attempt); }
    try {
      const result = await supportRequest(path, 'POST', attempt.body, { 'idempotency-key': attempt.key });
      if (result.status === 200 || result.status === 201) {
        pending.current.delete(path); setUncertain(null); await load();
        if (path === '/v1/admin/support-access') setStatus('다른 운영자의 승인을 기다립니다.');
        return true;
      }
      if (result.status >= 500) throw new Error('unknown_result');
      pending.current.delete(path); setUncertain(null); setStatus(`처리하지 못했습니다 (${result.status}). 현재 권한·승인 상태를 확인해 주세요.`);
      await load(); return false;
    } catch { setUncertain(path); setStatus('응답을 받지 못했습니다. 같은 요청 결과 확인으로 기존 처리를 확인해 주세요.'); return false; }
    finally { setBusy(false); }
  }
  async function requestAccess(event: FormEvent) {
    event.preventDefault();
    await send('/v1/admin/support-access', { targetKind, targetId, purpose, reference, reason, minutes, scopes: selectedScopes, minimumNecessary });
  }
  const locked = busy || uncertain !== null, operator = role === 'operator';
  return <section className="field-support-panel" role="region" aria-label="고객정보 지원 접근"><h2>고객정보 지원 접근</h2>
    <p>Field가 유지하는 문의·예약·수신 업무 자료에 대한 조사입니다. 필요한 범위·사유·기간을 정하고 다른 운영자의 승인을 받습니다. 신고 열람 승인은 고객정보 권한이 아닙니다.</p>
    {status && <p role="status">{status}</p>}{uncertain && <button type="button" disabled={busy} onClick={() => {
      const attempt = pending.current.get(uncertain); if (attempt) void send(uncertain, attempt.body);
    }}>같은 요청 결과 확인</button>}
    <button type="button" disabled={busy} onClick={() => void load()}>지원 접근 새로고침</button>
    {loadState === 'loading' && <p role="status">지원 접근 확인 중</p>}{loadState === 'failed' && <p role="alert">지원 접근 조회 실패 · 기존 목록은 현재 권한의 증거가 아닙니다.</p>}
    {operator ? <form className="form-fields" onSubmit={event => void requestAccess(event)}><h3>고객정보 열람 사유</h3>
      <div><label htmlFor="field-support-kind">업무 종류</label><select id="field-support-kind" disabled={locked} value={targetKind} onChange={event => setTargetKind(event.target.value)}>
        {Object.entries(SUPPORT_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <label>업무 ID<input required readOnly={locked} value={targetId} onChange={event => setTargetId(event.target.value)} /></label>
      <div><label htmlFor="field-support-purpose">목적</label><select id="field-support-purpose" disabled={locked} value={purpose} onChange={event => setPurpose(event.target.value)}>
        {Object.entries(SUPPORT_PURPOSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <label>조사 참조<input required maxLength={160} readOnly={locked} value={reference} onChange={event => setReference(event.target.value)} /></label>
      <p>고객 요청·신고·사고 기록의 참조를 적어 주세요. 입력만으로 요청의 진위가 확인되지는 않습니다.</p>
      <div><label htmlFor="field-support-reason">구체적인 열람 사유</label><textarea id="field-support-reason" required minLength={10} maxLength={500} readOnly={locked} value={reason} onChange={event => setReason(event.target.value)} /></div>
      <fieldset disabled={locked}><legend>필요한 정보 범위</legend>{Object.entries(SUPPORT_SCOPES).map(([value, label]) => <label key={value}>
        <input type="checkbox" checked={selectedScopes.includes(value)} onChange={event => setSelectedScopes(current => event.target.checked ? [...current, value] : current.filter(scope => scope !== value))} /> {label}</label>)}</fieldset>
      <label>열람 시간(분)<input required type="number" min={1} max={60} readOnly={locked} value={minutes} onChange={event => setMinutes(Number(event.target.value))} /></label>
      <label><input type="checkbox" disabled={locked} checked={minimumNecessary} onChange={event => setMinimumNecessary(event.target.checked)} /> 필요한 정보만 제한적으로 확인하겠습니다.</label>
      <button type="submit" disabled={locked || !minimumNecessary || selectedScopes.length === 0}>열람 승인 요청</button>
    </form> : <p>감사자는 승인 요청과 고객정보 열람을 할 수 없습니다.</p>}
    <h3>열람 승인 요청</h3>{loadState === 'ready' && requests.length === 0 && <p>지원 접근 요청이 없습니다.</p>}
    {requests.map(access => <AccessCard key={access.id} access={access} actor={actorUserId} operator={operator}
      locked={locked || loadState !== 'ready'} send={send} open={open} />)}
    {cursor && <button type="button" disabled={busy} onClick={() => void load(cursor)}>이전 지원 접근 더 보기</button>}
    {detail && <section className="field-support-detail" role="region" aria-label="승인된 고객정보"><h3>승인된 고객정보</h3>
      <p>{SUPPORT_KINDS[detail.work.kind]} · 업무 ID <code>{detail.work.id}</code> · {detail.work.state}</p>
      <p>승인 범위: {detail.scopes.map(scope => SUPPORT_SCOPES[scope]).join(' · ')}</p><p>열람 종료: {new Date(detail.accessExpiresAt).toLocaleString('ko-KR')}</p>
      <button type="button" disabled={busy} onClick={() => void checkAuthority()}>열람 권한 다시 확인</button>
      <button type="button" onClick={clearDetail}>고객정보 닫기</button>
      {detail.contact && <div><h4>고객 이름·연락처·방문 지역</h4><p>{detail.contact.customerName || '미등록'} · {detail.contact.customerPhone || '미등록'}</p>
        {detail.contact.visitRegion && <p>방문 지역: {detail.contact.visitRegion}</p>}<p>번호 소유 미확인 · 동의 시각 {detail.contact.consentAt ? new Date(detail.contact.consentAt).toLocaleString('ko-KR') : '미기록'}</p></div>}
      {detail.messages && <div><h4>고객 공개 대화·제출 내용</h4><p>내부 메모·확인키는 제공하지 않습니다.</p>
        {detail.messages.map(message => <article key={message.id}><strong>{message.actor === 'customer' ? '고객' : message.actor === 'assistant' ? 'AI' : '사업자'}</strong><p>{message.body}</p></article>)}</div>}
      {detail.work.kind === 'external_request' && <p>Field가 받은 업무 자료입니다. AP 대화 원문은 포함하지 않으며, 이미 Field에 복사된 사진만 읽습니다.</p>}
      {detail.submission && <div><h4>고객 제출 내용·예약 시간</h4>{Object.entries(detail.submission).filter(([, value]) => value !== null && value !== '').map(([key, value]) =>
        <p key={key}><strong>{SUPPORT_SUBMISSION_LABELS[key] ?? key}</strong> · {value}</p>)}</div>}
      {detail.attachments && <div><h4>업무 사진</h4>{detail.attachments.length === 0 && <p>첨부된 고객 공개 사진이 없습니다.</p>}
        {detail.attachments.map(attachment => <article key={attachment.id}><p>사진 ID <code>{attachment.id}</code> · {SUPPORT_PHOTO_STATES[attachment.state] ?? attachment.state}{attachment.width && attachment.height ? ` · ${attachment.width}×${attachment.height}` : ''}</p>
          {['ready', 'copied'].includes(attachment.state) ? <button type="button" disabled={busy} onClick={() => void photo(attachment.id)}>업무 사진 보기</button> : <p>아직 Field에서 읽을 수 있는 사진이 아닙니다. 이 화면은 외부 원본을 새로 복사하지 않습니다.</p>}</article>)}
        {photoUrl && <img className="field-support-photo" src={photoUrl} alt="승인된 업무 사진" />}</div>}
    </section>}
    <details className="field-support-audit"><summary>최근 지원 열람 감사</summary><p>최근100개 요청·승인·회수·읽기 기록입니다. 원문·사진·연락처는 감사 목록에 복사하지 않습니다.</p>
      {events.map(event => <article key={event.id}><strong>{SUPPORT_ACTIONS[event.action] ?? event.action}</strong><p>{event.reason}</p>
        <p>{SUPPORT_KINDS[event.targetKind]} · 업무 ID <code>{event.targetId}</code> · 운영자 <code>{event.actorUserId}</code></p><p>{new Date(event.createdAt).toLocaleString('ko-KR')}</p></article>)}</details>
  </section>;
}
