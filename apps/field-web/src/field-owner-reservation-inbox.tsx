"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { requestJson, type FallbackCandidate, type Reservation } from "./field-api";
import { FieldFallbackReview } from "./FieldFallbackReview";
import { FieldRetentionNotice } from "./FieldRetentionNotice";

type ReplyAttempt = { messageId: string; body: string };

const stateNames: Record<string, string> = {
  requested: "신청 접수", proposed: "시간 제안", customer_accepted: "고객 수락",
  confirmed: "확정", change_requested: "변경 요청", change_proposed: "변경 시간 제안",
  change_accepted: "변경 제안 수락", cancel_requested: "취소 요청", completed: "완료",
  canceled: "취소", rejected: "거절", expired: "만료", no_show: "노쇼 기록",
};
const timeLabel = (value: string, timezone: string) => new Intl.DateTimeFormat("ko-KR", {
  timeZone: timezone, year: "numeric", month: "numeric", day: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "shortOffset",
}).format(new Date(value));

export function OwnerReservationInboxThread({ id, onBack, onManage, onOpenFallbackCandidate }: {
  id: string; onBack: () => void; onManage: (id: string) => void;
  onOpenFallbackCandidate: (candidate: FallbackCandidate) => void;
}) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [replyBody, setReplyBody] = useState("");
  const [pendingReply, setPendingReply] = useState<ReplyAttempt | null>(null);
  const pendingRef = useRef<ReplyAttempt | null>(null);
  const requestNumber = useRef(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const request = ++requestNumber.current;
    setLoadState("loading");
    try {
      const result = await requestJson(`/v1/owner/reservations/${id}`);
      if (request !== requestNumber.current) return false;
      if (result.status !== 200) {
        setLoadState("failed");
        setStatus(`예약 원본을 확인하지 못했습니다 (${result.status}). 다시 조회해 주세요.`);
        return false;
      }
      const next = result.data as Reservation;
      setReservation(next);
      setLoadState("ready");
      const attempt = pendingRef.current;
      if (attempt && next.messages?.some(message => message.id === attempt.messageId)) {
        pendingRef.current = null;
        setPendingReply(null); setReplyBody("");
        setStatus("답변이 Field 예약 대화에 저장됐습니다. 고객은 확인키로 읽을 수 있습니다.");
      }
      return true;
    } catch {
      if (request !== requestNumber.current) return false;
      setLoadState("failed");
      setStatus("예약 원본 서버에 연결하지 못했습니다. 다시 조회해 주세요.");
      return false;
    }
  }, [id]);

  useEffect(() => {
    void load();
    return () => { requestNumber.current += 1; };
  }, [load]);

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reservation || reservation.source !== "public" || busy) return;
    const attempt = pendingRef.current ?? { messageId: crypto.randomUUID(), body: replyBody.trim() };
    if (!attempt.body) return;
    pendingRef.current = attempt;
    setPendingReply(attempt); setBusy(true);
    setStatus("Field 예약 대화에 답변을 저장하고 있습니다.");
    try {
      const sent = await requestJson(`/v1/owner/reservations/${id}/messages`, "POST", attempt);
      if (sent.status !== 200 && sent.status !== 201)
        setStatus(`답변 결과를 확인하지 못했습니다 (${sent.status}). 원본을 조회한 뒤 같은 ID로 재시도할 수 있습니다.`);
    } catch {
      setStatus("답변 응답을 받지 못했습니다. 원본을 조회한 뒤 같은 ID로 재시도할 수 있습니다.");
    }
    const checked = await load();
    if (checked && pendingRef.current === attempt)
      setStatus("아직 예약 원본에서 답변을 확인하지 못했습니다. 같은 ID로 다시 확인·재시도해 주세요.");
    setBusy(false);
  }

  return <section className="field-owner-inbox-reservation" aria-label="직접 예약 대화">
    <div className="field-owner-inbox-source">내 홈페이지 · 직접 예약 · Field 원본</div>
    <div className="panel-heading"><button className="field-owner-inbox-back" type="button" onClick={onBack} aria-label="문의 목록으로">←</button><h2>예약 대화</h2><button type="button" disabled={busy} onClick={() => void load()}>새로고침</button></div>
    {loadState === "loading" && !reservation && <p role="status">예약 원본을 확인하고 있습니다.</p>}
    {loadState === "failed" && <div className="field-owner-inbox-warning" role="alert"><p>예약 원본을 최신 상태로 확인하지 못했습니다. 이전 내용은 참고용입니다.</p><button type="button" onClick={() => void load()}>예약 다시 확인</button></div>}
    {reservation && <><div className="field-owner-reservation-person"><span aria-hidden="true">{reservation.name.slice(0, 1)}</span><div><h3>{reservation.name} <small>고객</small></h3><p>{reservation.phone} · 연락처 미인증</p></div></div>
      <div className="field-owner-reservation-summary"><div><strong>{reservation.service.name}</strong><span>{stateNames[reservation.state] ?? reservation.state}</span></div><p>{reservation.bookingMode === "slot" ? "요청 시간" : "희망 시간"}: {reservation.requestedStartAt ? timeLabel(reservation.requestedStartAt, reservation.timezone) : reservation.preferredTimeText ?? "시간 조율 중"}</p>{reservation.proposalStartAt && <p>제안 시간: {timeLabel(reservation.proposalStartAt, reservation.timezone)}</p>}<button type="button" onClick={() => onManage(id)}>예약 확인·시간 제안</button></div>
      <p className="field-owner-reservation-thread-note">예약 상태 변경은 예약·일정에서 처리합니다. 이 대화와 고객 답변은 Field 원본에 저장됩니다.</p>
      <FieldFallbackReview fallback={reservation.fallback} review={reservation.fallbackReview} onOpenCandidate={onOpenFallbackCandidate} />
      <FieldRetentionNotice retention={reservation.retention} />
      <ol className="field-owner-inbox-messages">{reservation.requestMessage && <li className="customer"><strong>고객 · 예약 요청</strong><p>{reservation.requestMessage}</p><small>{timeLabel(reservation.createdAt, reservation.timezone)}</small></li>}{reservation.messages?.map(message => <li key={message.id} className={message.sender === "owner" ? "mine" : "customer"}><strong>{message.sender === "owner" ? "나 · 사업자" : "고객"}</strong><p>{message.body}</p><small>{timeLabel(message.createdAt, reservation.timezone)}{message.sender === "owner" ? " · Field 열람 가능 · 외부 알림 연동 전" : ""}</small></li>)}{!reservation.requestMessage && !reservation.messages?.length && <li>아직 대화 메시지가 없습니다.</li>}</ol>
      {status && <p className="field-owner-reservation-reply-status" role="status">{status}</p>}
      {reservation.retention?.workPurgedAt ? null : reservation.source === "public" ? <form className="form-fields field-owner-reservation-reply" onSubmit={event => void sendReply(event)}><label>예약 고객에게 답변<textarea required maxLength={5000} value={pendingReply?.body ?? replyBody} readOnly={Boolean(pendingReply)} onChange={event => setReplyBody(event.target.value)} placeholder="예약에 관한 답변을 입력하세요" /></label><button type="submit" disabled={busy || (!pendingReply && !replyBody.trim())}>{pendingReply ? "답변 결과 확인·재시도" : "예약 답변 저장"}</button></form> : <p>AP 출처 예약의 고객 대화는 AP 원본에서 이어집니다.</p>}
      <p className="field-owner-reservation-thread-note">고객은 예약 확인키로 답변을 읽을 수 있습니다. 외부 문자·카카오 알림은 연동 전입니다.</p>
    </>}
  </section>;
}
