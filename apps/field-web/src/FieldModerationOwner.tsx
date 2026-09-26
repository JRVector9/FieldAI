"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { MODERATION_CATEGORIES, MODERATION_STATES, moderationRequest, type ModerationReport } from './field-moderation';

function OwnerCase({ report, refresh }: { report: ModerationReport; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ key: string; body: unknown } | null>(null);
  const [unknown, setUnknown] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setStatus('');
    pending.current ??= { key: crypto.randomUUID(), body: { expectedRevision: report.revision, message } };
    try {
      const result = await moderationRequest(`/v1/owner/moderation/reports/${report.id}/appeal`, 'POST', pending.current.body,
        { 'idempotency-key': pending.current.key });
      if (result.status === 200) { pending.current = null; setUnknown(false); setMessage(''); setStatus('이의가 저장되었습니다. 검토 결과를 다시 확인해 주세요.'); await refresh(); }
      else if (result.status < 500) { pending.current = null; setUnknown(false); setStatus(`이의를 저장하지 못했습니다 (${result.status}). 입력은 유지합니다.`); await refresh(); }
      else throw new Error('unknown_result');
    } catch { setUnknown(true); setStatus('응답을 받지 못했습니다. 같은 이의를 다시 제출해 저장 여부를 확인해 주세요.'); }
    finally { setBusy(false); }
  }
  return <article className="field-moderation-case"><h2>{MODERATION_CATEGORIES[report.category]}</h2>
    <p>{MODERATION_STATES[report.state]}</p><p>신고 ID <code>{report.id}</code></p>
    {report.siteHidden && <p>사이트 공개 제한 중 · 기존 문의·예약·초안은 유지됩니다.</p>}
    {report.reviewSummary && <p>{report.reviewSummary}</p>}{report.appealMessage && <p>제출한 이의: {report.appealMessage}</p>}
    {report.appealDecision && <p>{report.appealDecision === 'overturned' ? '이의 인용' : '기존 조치 유지'}</p>}
    {status && <p role="status">{status}</p>}
    {report.state === 'reviewed' && <form className="form-fields" onSubmit={event => void submit(event)}>
      <label>이의 내용<textarea required maxLength={2000} value={message} readOnly={busy || unknown} onChange={event => setMessage(event.target.value)} /></label>
      <button type="submit" disabled={busy}>{unknown ? '같은 이의 다시 확인' : '이의 제출'}</button></form>}
  </article>;
}
export function FieldModerationOwner() {
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState('loading');
  const load = useCallback(async (before?: string) => {
    setState('loading');
    try {
      const result = await moderationRequest<{ reports: ModerationReport[]; nextCursor: string | null }>(
        `/v1/owner/moderation/reports${before ? `?before=${before}` : ''}`);
      if (result.status === 401 || result.status === 404) { setState('auth'); setReports([]); return; }
      if (result.status !== 200) throw new Error('unavailable');
      setReports(current => before ? [...current, ...result.data.reports] : result.data.reports);
      setCursor(result.data.nextCursor); setState('ready');
    } catch { setState('failed'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <main className="field-moderation-owner"><nav><a href="/workspace">사업자 작업실</a><a href="/workspace/site">사이트 편집</a></nav>
    <h1>신고·검토 결과</h1><p>사업체 소유자만 결과를 확인하고 이의를 제출합니다. 신고 원문과 신고자 정보는 제공하지 않습니다.</p>
    <button type="button" onClick={() => void load()}>검토 결과 다시 확인</button>
    {state === 'loading' && <p role="status">검토 결과 확인 중</p>}{state === 'auth' && <p>사업체 소유자 계정으로 <a href="/workspace">로그인</a>해 주세요.</p>}
    {state === 'failed' && <p role="alert">조회에 실패했습니다. 기존 결과를 0건으로 판단하지 않습니다.</p>}
    <section className="field-moderation-panel">{state === 'ready' && reports.length === 0 && <p>검토 중인 신고가 없습니다.</p>}
      {reports.map(report => <OwnerCase key={report.id} report={report} refresh={load} />)}
      {cursor && <button type="button" onClick={() => void load(cursor)}>이전 검토 더 보기</button>}</section>
  </main>;
}
