"use client";

import { useRef, useState, type FormEvent } from 'react';
import { MODERATION_CATEGORIES, moderationRequest } from './field-moderation';

export function FieldSiteReport({ slug }: { slug: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<{ key: string; body: unknown } | null>(null);
  const [category, setCategory] = useState('inaccurate_information');
  const [description, setDescription] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [status, setStatus] = useState('');
  const [receipt, setReceipt] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setStatus('');
    pending.current ??= { key: crypto.randomUUID(), body: { category, description, consent } };
    try {
      const response = await moderationRequest<{ id: string }>(`/v1/public/sites/${slug}/reports`, 'POST',
        pending.current.body, { 'idempotency-key': pending.current.key });
      if (response.status === 200 || response.status === 201) {
        setReceipt(response.data.id); pending.current = null; setUnknown(false); setStatus('신고를 접수했습니다. 검토 후 처리하며 신고만으로 자동 정지하지 않습니다.');
      } else if (response.status < 500) {
        pending.current = null; setUnknown(false);
        setStatus(response.status === 429 ? '신고 접수 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.' : `신고를 접수하지 못했습니다 (${response.status}). 입력을 확인해 주세요.`);
      } else throw new Error('unknown_result');
    } catch { setUnknown(true); setStatus('응답을 받지 못했습니다. 같은 신고 다시 확인으로 기존 접수 여부를 확인해 주세요.'); }
    finally { setBusy(false); }
  }
  return <><button className="field-site-report-button" type="button" onClick={() => dialog.current?.showModal()}>공개 사이트 신고</button>
    <dialog ref={dialog} className="field-moderation-dialog" aria-label="공개 사이트 신고"><h2>공개 사이트 신고</h2>
      <p>공개 안내의 문제를 알려주세요. 고객 연락처·비밀번호·대화 원문은 적지 마세요. 신고만으로 사업체를 자동 정지하지 않습니다.</p>
      {status && <p role="status">{status}</p>}{receipt ? <p className="moderation-receipt">접수 ID <code>{receipt}</code></p> :
        <form className="form-fields" onSubmit={event => void submit(event)}>
          <label>신고 분류<select value={category} disabled={busy || unknown} onChange={event => setCategory(event.target.value)}>{Object.entries(MODERATION_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>신고 설명<textarea required maxLength={2000} value={description} readOnly={busy || unknown} onChange={event => setDescription(event.target.value)} /></label>
          <label className="field-moderation-check"><input type="checkbox" required checked={consent} disabled={busy || unknown} onChange={event => setConsent(event.target.checked)} />신고 검토를 위한 내용 제공에 동의합니다.</label>
          <button type="submit" disabled={busy}>{unknown ? '같은 신고 다시 확인' : '신고 제출'}</button>
        </form>}<button type="button" disabled={busy} onClick={() => dialog.current?.close()}>닫기</button>
    </dialog></>;
}
