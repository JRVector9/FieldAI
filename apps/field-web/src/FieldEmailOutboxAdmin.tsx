"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

type EmailRow = { id: string; maskedTo: string; purpose: string; state: string; errorCode: string | null;
  createdAt: string; sentAt: string | null };
const states = [
  ['failed', '발송 실패'], ['blocked_integration', '공급사 미연결'], ['pending', '발송 대기'],
  ['sent', 'SMTP 접수 완료'], ['suppressed_duplicate', '중복 발송 억제'], ['all', '전체'],
] as const;
const stateLabel = (value: string) => states.find(([state]) => state === value)?.[1] ?? '상태 확인 필요';

export function EmailOutboxRows({ emails }: { emails: EmailRow[] }) {
  return <div className="field-admin-list">{emails.map(email => <article key={email.id}>
    <h3>{email.purpose === 'verify_email' ? '이메일 확인' : '비밀번호 재설정'} · {stateLabel(email.state)}</h3>
    <p>수신 주소 {email.maskedTo}</p>
    <p>요청 {new Date(email.createdAt).toLocaleString('ko-KR')}{email.sentAt ? ` · SMTP 접수 ${new Date(email.sentAt).toLocaleString('ko-KR')}` : ''}</p>
    {email.errorCode && <p>장애 코드 {email.errorCode}</p>}
  </article>)}</div>;
}

export function FieldEmailOutboxAdmin() {
  const [state, setState] = useState('failed');
  const [emails, setEmails] = useState<EmailRow[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async (before?: string) => {
    const requestId = ++sequence.current;
    setBusy(true); setStatus('');
    if (!before) { setEmails(null); setNextCursor(null); }
    try {
      const query = new URLSearchParams({ state });
      if (before) query.set('before', before);
      const response = await fetch(`/v1/admin/email-outbox?${query}`, { credentials: 'same-origin' });
      const result = await response.json() as { emails?: EmailRow[]; nextCursor?: string | null };
      if (response.status !== 200 || !Array.isArray(result.emails)) throw new Error('email_outbox_unavailable');
      if (requestId !== sequence.current) return;
      const loaded = result.emails;
      setEmails(current => before ? [...(current ?? []), ...loaded.filter(row => !current?.some(old => old.id === row.id))] : loaded);
      setNextCursor(result.nextCursor ?? null);
    } catch {
      if (requestId === sequence.current) setStatus('인증 메일 발송 상태를 불러오지 못했습니다. 다시 시도해 주세요.');
    } finally { if (requestId === sequence.current) setBusy(false); }
  }, [state]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  return <section className="special-panel" aria-label="인증 메일 발송 상태"><h2>인증 메일 발송 상태 (추가)</h2>
    <p>Field 가입 확인·비밀번호 재설정 메일의 처리 상태입니다. SMTP 접수 완료는 고객 수신함 도달을 뜻하지 않습니다. 인증 링크와 메일 본문은 표시하지 않습니다.</p>
    <label>발송 상태 <select value={state} disabled={busy} onChange={event => setState(event.target.value)}>
      {states.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <button type="button" disabled={busy} onClick={() => void load()}>목록 새로고침</button>
    {busy && <p role="status">인증 메일 발송 상태를 확인하고 있습니다.</p>}
    {status && <p className="state-message" role="alert">{status}</p>}
    {emails && emails.length === 0 && <p>선택한 상태의 인증 메일이 없습니다.</p>}
    {emails && <EmailOutboxRows emails={emails} />}
    {nextCursor && <button type="button" disabled={busy} onClick={() => void load(nextCursor)}>이전 인증 메일 더 보기</button>}
  </section>;
}
