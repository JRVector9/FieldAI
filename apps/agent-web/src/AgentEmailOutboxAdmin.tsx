"use client";

import { useCallback, useEffect, useState } from 'react';

type EmailOutbox = { id: string; maskedTo: string; purpose: string; state: string; errorCode: string | null; createdAt: string; sentAt: string | null };
export function emailStateLabel(state: string) {
  return ({ failed: '발송 실패', blocked_integration: '메일 공급사 미연결', pending: '발송 처리 중',
    sent: 'SMTP 서버 접수', suppressed_duplicate: '중복 요청 발송 생략' } as Record<string, string>)[state] ?? '상태 확인 필요';
}
export function EmailOutboxList({ emails }: { emails: EmailOutbox[] }) {
  return <div className="agent-admin-list">{emails.map(item => <article key={item.id}>
    <h3>{item.purpose === 'verify_email' ? '이메일 주소 확인' : '비밀번호 재설정'} · {item.maskedTo}</h3>
    <p>{emailStateLabel(item.state)} · 요청 {new Date(item.createdAt).toLocaleString('ko-KR')}</p>
    {item.sentAt && <p>SMTP 접수 {new Date(item.sentAt).toLocaleString('ko-KR')}</p>}
    {item.errorCode && <p>장애 코드 {item.errorCode}</p>}<p>메일 요청 ID {item.id}</p>
  </article>)}</div>;
}

export function AgentEmailOutboxAdmin() {
  const [state, setState] = useState('failed');
  const [emails, setEmails] = useState<EmailOutbox[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [status, setStatus] = useState('');
  const load = useCallback(async (cursor?: string) => {
    setBusy(true);
    try {
      const query = new URLSearchParams({ ...(state ? { state } : {}), ...(cursor ? { cursor } : {}) });
      const response = await fetch(`/v1/admin/email-outbox?${query}`, { credentials: 'same-origin' });
      const value = await response.json() as { product: string; emails?: EmailOutbox[]; nextCursor?: string | null };
      if (!response.ok || value.product !== 'agent' || !Array.isArray(value.emails)) throw new Error('outbox_unavailable');
      setEmails(current => cursor ? [...(current ?? []), ...value.emails!] : value.emails!);
      setNextCursor(value.nextCursor ?? null); setFailed(false); setStatus('');
    } catch { setFailed(true); setStatus('인증 메일 발송 상태를 불러오지 못했습니다. 다시 조회해 주세요.'); }
    finally { setBusy(false); }
  }, [state]);
  useEffect(() => { setEmails(null); setNextCursor(null); void load(); }, [load]);
  return <section className="special-panel" aria-label="인증 메일 발송 상태"><h2>인증 메일 발송 상태 (추가)</h2>
    <p>수신 주소는 마스킹합니다. 인증 링크와 메일 본문은 표시하지 않습니다. SMTP 서버 접수는 고객 수신함 도달 확인과 다릅니다.</p>
    <label>발송 상태<select value={state} disabled={busy} onChange={event => setState(event.target.value)}>
      <option value="">전체</option>{['failed', 'blocked_integration', 'pending', 'sent', 'suppressed_duplicate'].map(value =>
        <option key={value} value={value}>{emailStateLabel(value)}</option>)}
    </select></label><button type="button" disabled={busy} onClick={() => void load()}>목록 새로고침</button>
    {status && <p role="status" className="state-message">{status}</p>}
    {emails === null && !failed && <p role="status">인증 메일 발송 상태를 불러오고 있습니다.</p>}
    {emails?.length === 0 && !failed && <p>선택한 상태의 인증 메일 요청이 없습니다.</p>}
    {emails && <EmailOutboxList emails={emails} />}
    {nextCursor && <button type="button" disabled={busy || failed} onClick={() => void load(nextCursor)}>다음 메일 요청 더 보기</button>}
  </section>;
}
