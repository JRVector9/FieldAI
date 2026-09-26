"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { MODERATION_CATEGORIES, MODERATION_STATES, moderationRequest,
  type ModerationAccess, type ModerationDetail, type ModerationReport } from './agent-moderation';

function AccessCard({ access, actor, operator, busy, locked, approve, open }: { access: ModerationAccess;
  actor: string; operator: boolean; busy: boolean; locked: boolean; approve: (id: string, reason: string) => Promise<void>;
  open: (access: ModerationAccess) => Promise<void> }) {
  const [reason, setReason] = useState('');
  return <article className="agent-moderation-access"><h3>지원 접근</h3><p>신고 ID <code>{access.reportId}</code></p>
    <p>{access.reason} · {access.minutes}분</p><p>신청 운영자 {access.requestedBy}</p>
    {access.approvedBy ? <><p>승인됨 · {new Date(access.expiresAt!).toLocaleString('ko-KR')}까지</p>
      {access.requestedBy === actor && operator && <button type="button" disabled={locked} onClick={() => void open(access)}>승인 접근으로 상세 열기</button>}</>
      : <form className="form-fields" onSubmit={event => { event.preventDefault(); void approve(access.id, reason); }}>
        <label>승인 사유<input maxLength={500} required value={reason} readOnly={locked} onChange={event => setReason(event.target.value)} /></label>
        <button type="submit" disabled={busy || locked || !operator || actor === access.requestedBy}>지원 접근 승인</button>
        {actor === access.requestedBy && <p>자기 승인은 허용되지 않습니다. 다른 운영자의 승인을 기다립니다.</p>}
        {!operator && <p>감사자는 접근 승인과 처리 권한이 없습니다.</p>}
      </form>}</article>;
}

export function AgentModerationAdmin({ actorUserId, role }: { actorUserId: string; role: string }) {
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [accesses, setAccesses] = useState<ModerationAccess[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadState, setLoadState] = useState('loading');
  const [detail, setDetail] = useState<ModerationDetail | null>(null);
  const [activeAccess, setActiveAccess] = useState<ModerationAccess | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [accessReason, setAccessReason] = useState('');
  const [minutes, setMinutes] = useState(15);
  const [outcome, setOutcome] = useState('correction_requested');
  const [decision, setDecision] = useState('upheld');
  const [summary, setSummary] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const pending = useRef(new Map<string, { key: string; body: unknown; access?: string }>());
  const [uncertain, setUncertain] = useState<string | null>(null);
  const load = useCallback(async (before?: string) => {
    setLoadState('loading');
    try {
      const result = await moderationRequest<{ reports: ModerationReport[]; nextCursor: string | null }>(
        `/v1/admin/reports${before ? `?before=${before}` : ''}`);
      const access = await moderationRequest<{ requests: ModerationAccess[] }>('/v1/admin/report-access');
      if (result.status !== 200 || access.status !== 200) throw new Error('unavailable');
      setReports(current => before ? [...current, ...result.data.reports] : result.data.reports);
      setCursor(result.data.nextCursor); setAccesses(access.data.requests); setLoadState('ready');
    } catch { setLoadState('failed'); setStatus('신고 상태를 확인하지 못했습니다. 기존 목록을 0건으로 판단하지 않습니다.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!detail) return;
    const timer = setTimeout(() => { setDetail(null); setActiveAccess(null); setStatus('지원 접근 시간이 만료되었습니다. 다시 승인받아 주세요.'); },
      Math.max(0, Date.parse(detail.accessExpiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [detail]);
  async function open(access: ModerationAccess) {
    setDetail(null); setStatus('');
    try {
      const result = await moderationRequest<ModerationDetail>(`/v1/admin/reports/${access.reportId}`, 'GET', undefined,
        { 'x-support-access-id': access.id });
      if (result.status !== 200) { setActiveAccess(null); setStatus('승인 접근을 확인하지 못했습니다. 기간·권한을 다시 확인해 주세요.'); return; }
      setActiveAccess(access); setDetail(result.data); setSummary(''); setReason('');
    } catch { setStatus('상세를 불러오지 못했습니다. 승인 접근으로 다시 열어 주세요.'); }
  }
  async function send(path: string, body: unknown, access?: string) {
    setBusy(true); setStatus('');
    let attempt = pending.current.get(path);
    if (!attempt) { attempt = { key: crypto.randomUUID(), body, access }; pending.current.set(path, attempt); }
    try {
      const result = await moderationRequest(path, 'POST', attempt.body,
        { 'idempotency-key': attempt.key, ...(access ? { 'x-support-access-id': access } : {}) });
      if (result.status === 200 || result.status === 201) {
        pending.current.delete(path); setUncertain(null); await load(); return true;
      }
      if (result.status >= 500) throw new Error('unknown_result');
      pending.current.delete(path); setUncertain(null);
      if (result.status === 403) { setDetail(null); setActiveAccess(null); }
      setStatus(`저장하지 못했습니다 (${result.status}). 현재 권한·검토 상태를 확인해 주세요.`);
      await load(); return false;
    } catch { setUncertain(path); setStatus('응답을 받지 못했습니다. 같은 버튼을 다시 눌러 기존 처리 결과를 확인해 주세요.'); return false; }
    finally { setBusy(false); }
  }
  async function requestAccess(event: FormEvent) {
    event.preventDefault();
    if (requesting && await send(`/v1/admin/reports/${requesting}/access`, { reason: accessReason, minutes })) {
      setRequesting(null); setAccessReason(''); setStatus('다른 운영자의 승인을 기다립니다.');
    }
  }
  async function act(event: FormEvent) {
    event.preventDefault();
    if (!detail || !activeAccess) return;
    const path = detail.state === 'appealed' ? 'appeal-decision' : 'review';
    if (await send(`/v1/admin/reports/${detail.id}/${path}`, { expectedRevision: detail.revision, outcome, decision, summary, reason }, activeAccess.id))
      await open(activeAccess);
  }
  async function retryUncertain() {
    if (!uncertain) return;
    const path = uncertain, attempt = pending.current.get(path);
    if (!attempt || !await send(path, attempt.body, attempt.access)) return;
    if (path.endsWith('/access')) { setRequesting(null); setAccessReason(''); setStatus('다른 운영자의 승인을 기다립니다.'); }
    if (activeAccess) await open(activeAccess);
  }
  const locked = busy || uncertain !== null;
  return <section className="agent-moderation-panel"><h2>상담 배포 신고</h2>
    <p>신고만으로 자동 정지하지 않습니다. 원문은 다른 운영자가 승인한 사유·기간 안에서만 열 수 있습니다.</p>
    {status && <p role="status">{status}</p>}{uncertain && <button type="button" disabled={busy} onClick={() => void retryUncertain()}>같은 처리 다시 확인</button>}<button type="button" disabled={busy} onClick={() => void load()}>신고 목록 새로고침</button>
    {loadState === 'loading' && <p role="status">신고 상태 확인 중</p>}{loadState === 'failed' && <p role="alert">목록 조회 실패 · 다시 확인해 주세요.</p>}
    {loadState === 'ready' && reports.length === 0 && <p>접수된 신고가 없습니다.</p>}
    {reports.map(report => <article className="agent-moderation-case" key={report.id}><h3>{report.businessName}</h3>
      <p>{MODERATION_CATEGORIES[report.category]} · {MODERATION_STATES[report.state]}</p><p>신고 ID <code>{report.id}</code></p><p>배포 ID <code>{report.publicId}</code></p>
      {report.reviewSummary && <p>{report.reviewSummary}</p>}
      <button type="button" disabled={locked || role !== 'operator'} onClick={() => setRequesting(report.id)}>상세 접근 신청</button>
      {role !== 'operator' && <p>감사자에게 신고 원문 열람 권한은 없습니다.</p>}
    </article>)}{cursor && <button type="button" disabled={busy} onClick={() => void load(cursor)}>이전 신고 더 보기</button>}
    {requesting && <form className="form-fields" onSubmit={event => void requestAccess(event)}><h3>상세 접근 신청</h3>
      <label>지원 접근 사유<input required maxLength={500} value={accessReason} readOnly={locked} onChange={event => setAccessReason(event.target.value)} /></label>
      <label>접근 시간(분)<input required type="number" min={1} max={60} value={minutes} readOnly={locked} onChange={event => setMinutes(Number(event.target.value))} /></label>
      <button type="submit" disabled={busy}>지원 접근 신청</button></form>}
    <h3>지원 접근 승인</h3>{accesses.length === 0 && loadState === 'ready' && <p>현재 승인 요청이 없습니다.</p>}
    {accesses.map(access => <AccessCard key={access.id} access={access} actor={actorUserId} operator={role === 'operator'}
      busy={busy} locked={locked} approve={async (id, approvalReason) => { await send(`/v1/admin/report-access/${id}/approve`, { reason: approvalReason }); }} open={open} />)}
    {detail && <section role="region" aria-label="승인된 신고 상세"><h3>{MODERATION_STATES[detail.state]}</h3>
      <p>열람 승인 종료: {new Date(detail.accessExpiresAt).toLocaleString('ko-KR')}</p><h3>신고 설명</h3><p>{detail.description}</p>
      <details className="agent-moderation-snapshot"><summary>신고 당시 공개 안내</summary>
        <p>신고 접수 시 저장된 승인 문구입니다. 현재 안내와 다를 수 있습니다.</p>
        <p>배포 ID <code>{detail.publicSnapshot.deployment.publicId}</code></p>
        <h3>{detail.publicSnapshot.knowledge.businessName}</h3><p>{detail.publicSnapshot.knowledge.introduction}</p>
        <p>지역: {detail.publicSnapshot.knowledge.region || '미등록'}</p><p>운영시간: {detail.publicSnapshot.knowledge.openingHours || '미등록'}</p>
        <h3>승인 서비스</h3>{detail.publicSnapshot.knowledge.services.map((service, index) => <article key={index}>
          <h4>{service.name}</h4><p>{service.description}</p></article>)}
        <h3>승인 질문·답변</h3>{detail.publicSnapshot.knowledge.faqs.map((faq, index) => <article key={index}>
          <h4>{faq.question}</h4><p>{faq.answer}</p></article>)}
        <p>AI 이름: {detail.publicSnapshot.agent.name}</p><p>사람 문의 안내: {detail.publicSnapshot.agent.handoffText}</p>
      </details>
      {detail.appealMessage && <><h3>사업자 이의</h3><p>{detail.appealMessage}</p></>}
      {['submitted', 'appealed'].includes(detail.state) && <form className="form-fields" onSubmit={event => void act(event)}>
        {detail.state === 'submitted' ? <label>검토 결과<select disabled={locked} value={outcome} onChange={event => setOutcome(event.target.value)}>
          <option value="dismissed">조치 없이 기각</option><option value="correction_requested">사업 안내 수정 요청</option><option value="deployment_restricted">해당 상담 배포만 제한</option></select></label>
          : <label>이의 결정<select disabled={locked} value={decision} onChange={event => setDecision(event.target.value)}><option value="upheld">기존 조치 유지</option><option value="overturned">이의 인용·해당 제한 해제</option></select></label>}
        <p>기존 문의·대화·승인 정보은 유지합니다. 다른 신고의 제한은 해제하지 않습니다.</p>
        <label>사업자에게 전달할 검토 요약<textarea required maxLength={2000} value={summary} readOnly={locked} onChange={event => setSummary(event.target.value)} /></label>
        <label>처리 사유<textarea required maxLength={2000} value={reason} readOnly={locked} onChange={event => setReason(event.target.value)} /></label>
        <button type="submit" disabled={busy}>{detail.state === 'appealed' ? '이의 결정 저장' : '검토 결과 저장'}</button>
      </form>}<details><summary>관리자 처리 감사</summary>{detail.events.map((event, index) => <p key={index}>{event.action} · {event.reason} · {new Date(event.createdAt).toLocaleString('ko-KR')}</p>)}</details>
    </section>}
  </section>;
}

