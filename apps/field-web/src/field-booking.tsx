"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { requestJson, type BookingPolicy, type Catalog, type Reservation,
  type ReservationEventDeliveries, type ManualReservationContacts, type Service, type FallbackCandidate, type FallbackInput } from "./field-api";
import { FieldRequestFallback, fallbackSubmission } from "./FieldRequestFallback";
import { FieldFallbackReview } from "./FieldFallbackReview";
import { FieldReceivedWorkRecord } from "./FieldReceivedWorkRecord";
import { ReceiptRotationPanel } from "./receipt-rotation";
import { PrivateReservationPhoto } from "./private-reservation-photo";
import { FieldReceipt } from "./field-receipt";
import { FieldRetentionNotice } from "./FieldRetentionNotice";
import { consumeReceiptHandoff } from "./receipt-handoff";
import { messageSubmissionFingerprint } from "./pending-message-submission";
import { clearPendingReservationMessage, readPendingReservationMessage,
  writePendingReservationMessage, type PendingReservationMessage } from "./pending-reservation-message";
import { clearPendingPublicSubmission, publicSubmissionFingerprint, readPendingPublicSubmission,
  writePendingPublicSubmission, type PendingPublicSubmission } from "./pending-public-submission";

const weekdays = [
  ["mon", "월"], ["tue", "화"], ["wed", "수"], ["thu", "목"],
  ["fri", "금"], ["sat", "토"], ["sun", "일"],
] as const;
const newPolicy = (): BookingPolicy => ({
  revision: 0, timezone: "Asia/Seoul",
  weekly: {}, closedDates: [], specialDates: {},
  beforeMinutes: 0, afterMinutes: 0, minLeadMinutes: 60, horizonDays: 30,
});
const formatTime = (value: string, timezone: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(value));
const stateLabels: Record<string, string> = {
  requested: "신청 접수", proposed: "시간 제안", customer_accepted: "고객 수락",
  confirmed: "확정", change_requested: "변경 요청", change_proposed: "변경 시간 제안",
  change_accepted: "변경 제안 수락", cancel_requested: "취소 요청", completed: "완료",
  canceled: "취소", rejected: "거절", expired: "만료", no_show: "노쇼 기록",
};
const stateLabel = (state: string) => stateLabels[state] ?? state;
type CalendarWeek = { from: string; to: string; timezone: string; reservations: Reservation[];
  blocks: { id: string; label: string; startAt: string; endAt: string }[];
  pending: Reservation[]; pendingHasMore: boolean };
const dayInZone = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
const shiftDay = (day: string, amount: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (day: string) => {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shiftDay(day, -(weekday === 0 ? 6 : weekday - 1));
};
const timeInZone = (value: string, timezone: string) => new Intl.DateTimeFormat("ko-KR", {
  timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value));
const eventDeliveryLabels: Record<string, string> = {
  pending_reconciliation: "전달 원장 대조 대기", pending: "전달 대기", sending: "전달 중",
  retry: "재시도 대기", blocked: "전달 중단 · 운영 확인 필요", acked: "AP 수신 응답 받음",
};
const apProcessingLabels: Record<string, string> = {
  not_requested: "AP 처리 확인 전", unavailable: "AP 상태 확인 불가",
  reauthorization_required: "연결 재승인 필요", invalid_response: "AP 응답 형식 오류",
  received: "AP 수신 원장 저장", pending_gap: "앞선 사건 처리 대기",
  processed: "AP 사건 반영", rejected: "AP 처리 거부 · 운영 확인 필요",
};
const customerNoticeLabels: Record<string, string> = {
  not_created: "알림 생성 전", not_applicable: "고객 알림 대상 아님",
  blocked_integration: "고객 외부 알림 미발송 · 공급사 미연결",
};
const randomSubmissionKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const maxBookingPhotos = 5;
const maxBookingPhotoBytes = 8 * 1024 * 1024;
function selectedBookingPhotos(files: FileList | null) {
  const selected = Array.from(files ?? []);
  if (selected.length > maxBookingPhotos) return { selected: [], error: "사진은 최대 5장까지 선택할 수 있습니다." };
  if (selected.some(file => file.size > maxBookingPhotoBytes))
    return { selected: [], error: "사진은 장당 8MB 이하로 선택해 주세요." };
  return { selected, error: "" };
}
async function uploadBookingPhoto(reservationId: string, receiptKey: string, photo: File) {
  if (photo.size > maxBookingPhotoBytes) return 413;
  const response = await fetch(`/v1/reservations/${reservationId}/attachments`, {
    method: "POST", credentials: "same-origin",
    headers: { authorization: `Bearer ${receiptKey}`, "content-type": "application/octet-stream" },
    body: photo, signal: AbortSignal.timeout(30_000),
  });
  return response.status;
}
function SelectedBookingPhoto({ file }: { file: File }) {
  const preview = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = preview.current;
    if (image) image.src = url;
    return () => { if (image) image.removeAttribute("src"); URL.revokeObjectURL(url); };
  }, [file]);
  return <li><img ref={preview} alt="" /><span>{file.name}</span></li>;
}
function SelectedBookingPhotos({ photos }: { photos: File[] }) {
  if (!photos.length) return null;
  return <ul className="field-selected-inquiry-photos" aria-label="선택한 예약 사진">
    {photos.map((file, index) => <SelectedBookingPhoto key={`${file.name}-${file.lastModified}-${index}`} file={file} />)}
  </ul>;
}
type ReservationNotificationRoute = {
  connectionStatus: string; state: "awaiting_consent" | "consented" | "withdrawn" | "active" | "suspended";
  routeGeneration: number; customerConsentedAt: string | null; customerWithdrawnAt: string | null;
  activatedAt: string | null; customerAccessAvailable?: boolean; revocationAcknowledged?: boolean;
  transferPending?: boolean; pendingTransferId?: string | null; pendingRevision?: number | null;
  pendingStartedAt?: string | null;
};
type OwnerMutationAttempt = { reservationId: string; expectedRevision: number;
  eventType: string; detail: Record<string, string>; label: string };
type CustomerMutationAttempt = { expectedRevision: number; eventType: string;
  detail: Record<string, string | number>; label: string;
  catalogReview?: { serviceId: string; startAt?: string; preferredTimeText?: string } };

export function PublicBookingPanel({ catalog, onServiceChange, onTimeChange, onReceiptChange }: {
  catalog: Catalog; onServiceChange?: (id: string) => void; onTimeChange?: (summary: string) => void;
  onReceiptChange?: (receipt: { id: string; receiptKey: string }) => void;
}) {
  const [serviceId, setServiceId] = useState(catalog.services[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<{ startAt: string; endAt: string }[]>([]);
  const [startAt, setStartAt] = useState("");
  const [availabilityState, setAvailabilityState] = useState<"idle" | "loading" | "ready" | "empty" | "unconfigured" | "failed">("idle");
  const [availabilityRevision, setAvailabilityRevision] = useState(0);
  const [timezone, setTimezone] = useState("Asia/Seoul");
  const [preferred, setPreferred] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredWindow, setPreferredWindow] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [visitRegion, setVisitRegion] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [fallback, setFallback] = useState<FallbackInput | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; receiptKey: string } | null>(null);
  const [status, setStatus] = useState("");
  const [slotConflict, setSlotConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingSubmission = useRef<PendingPublicSubmission | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryRevision, setRecoveryRevision] = useState(0);
  const pendingScope = `reservation:${catalog.organizationId}`;
  const service = catalog.services.find(item => item.id === serviceId);
  const preferredTimeText = [preferredDate && `희망 날짜 ${preferredDate}`,
    preferredWindow && `희망 시간대 ${preferredWindow}`, preferred.trim()].filter(Boolean).join(" · ");
  useEffect(() => {
    if (service?.bookingMode === "slot") onTimeChange?.(startAt ? formatTime(startAt, timezone) : "");
    else onTimeChange?.([preferredDate, preferredWindow].filter(Boolean).join(" · ")
      || (preferred.trim() ? "직접 입력한 희망 시간" : ""));
  }, [service?.bookingMode, startAt, timezone, preferredDate, preferredWindow, preferred, onTimeChange]);
  useEffect(() => {
    const attempt = readPendingPublicSubmission(pendingScope) ?? pendingSubmission.current;
    if (!attempt) return;
    let active = true;
    pendingSubmission.current = attempt;
    setHasPending(true); setRecovering(true);
    setStatus("이전 예약 요청의 저장 결과를 확인하고 있습니다.");
    void requestJson(`${attempt.path}/recover`, "GET", undefined, undefined,
      { "idempotency-key": attempt.idempotencyKey, "x-receipt-key": attempt.receiptKey })
      .then(result => {
        if (!active) return;
        if (result.status === 200) {
          clearPendingPublicSubmission(pendingScope); pendingSubmission.current = null;
          setHasPending(false); setReceipt(result.data as { id: string; receiptKey: string });
          onReceiptChange?.(result.data as { id: string; receiptKey: string });
          setStatus("새로고침 전 저장된 예약 요청을 확인했습니다. 새 예약이나 알림은 만들지 않았습니다. 사진을 선택했다면 내 예약 상태에서 다시 첨부해 주세요.");
        } else setStatus(result.status === 404
          ? "이전 예약 요청이 아직 확인되지 않았습니다. 같은 내용을 다시 입력해 재시도하거나 조회를 다시 해 주세요."
          : "이전 예약 결과를 확인하지 못했습니다. 조회를 다시 시도해 주세요.");
      }).catch(() => { if (active) setStatus("이전 예약 결과를 확인하지 못했습니다. 조회를 다시 시도해 주세요."); })
      .finally(() => { if (active) setRecovering(false); });
    return () => { active = false; };
  }, [pendingScope, recoveryRevision, onReceiptChange]);
  useEffect(() => {
    if (service?.bookingMode !== "slot" || !date) {
      setSlots([]); setStartAt(""); setAvailabilityState("idle"); return;
    }
    let active = true;
    setSlots([]); setStartAt(""); setAvailabilityState("loading");
    setStatus("가능 시간을 확인하고 있습니다.");
    void requestJson(`/v1/public/catalog/${catalog.organizationId}/availability?serviceId=${service.id}&date=${date}`)
      .then(result => {
        if (!active) return;
        if (result.status === 200) {
          const data = result.data as { timezone: string; slots: typeof slots };
          setTimezone(data.timezone); setSlots(data.slots); setStartAt("");
          setAvailabilityState(data.slots.length ? "ready" : "empty");
          setStatus(data.slots.length ? "선택한 날의 가능 시간을 확인했습니다." : "선택한 날에 신청 가능한 시간이 없습니다.");
        } else {
          setSlots([]); setStartAt("");
          setAvailabilityState(result.status === 409 ? "unconfigured" : "failed");
          setStatus(result.status === 409 ? "사업자의 예약 시간이 아직 설정되지 않았습니다." : "가능 시간을 불러오지 못했습니다.");
        }
      }).catch(() => {
        if (active) { setSlots([]); setStartAt(""); setAvailabilityState("failed"); setStatus("가능 시간을 불러오지 못했습니다."); }
      });
    return () => { active = false; };
  }, [catalog.organizationId, date, service?.id, service?.bookingMode, availabilityRevision]);
  async function attachBookingPhotos(saved: { id: string; receiptKey: string }, selected: File[]) {
    for (let index = 0; index < selected.length; index++) {
      try {
        const uploaded = await uploadBookingPhoto(saved.id, saved.receiptKey, selected[index]!);
        if (uploaded !== 201 && uploaded !== 200) {
          setPhotos(selected.slice(index));
          setStatus(uploaded === 429
            ? "예약은 저장됐습니다. 이 예약에는 사진을 최대 5장까지 첨부할 수 있습니다. 내 예약 상태에서 기존 사진을 확인해 주세요."
            : `예약은 저장됐지만 사진 ${index + 1}/${selected.length} 첨부에 실패했습니다 (${uploaded}). 남은 사진을 다시 시도할 수 있습니다.`);
          return;
        }
        setPhotos(selected.slice(index + 1));
      } catch {
        setStatus(`예약은 저장됐지만 사진 ${index + 1}/${selected.length} 업로드 응답을 받지 못했습니다. 같은 사진을 다시 첨부하면 기존 저장 건을 확인합니다.`);
        return;
      }
    }
    setStatus(`예약 요청과 사진 ${selected.length}건의 첨부 요청을 Field에서 확인했습니다. 동일한 내용은 한 장으로 저장됩니다. 예약은 사업자 확정 전입니다.`);
  }
  async function retryBookingPhotos() {
    if (!receipt || photos.length === 0) return;
    setBusy(true);
    await attachBookingPhotos(receipt, photos);
    setBusy(false);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service) return;
    if (!requestMessage.trim()) { setStatus("예약 요청 내용을 입력해 주세요."); return; }
    setBusy(true); setStatus("예약 요청을 저장하고 있습니다.");
    let canRecoverAfterReload = false;
    try {
      const payload = {
        serviceId, name, phone, requestMessage: requestMessage.trim(), visitRegion: visitRegion.trim(), consent,
        ...(service.bookingMode === "slot" ? { startAt } : { preferredTimeText }),
        ...fallbackSubmission(fallback),
      };
      const path = `/v1/public/catalog/${catalog.organizationId}/reservations`;
      const digest = await publicSubmissionFingerprint({ path, payload });
      const fingerprint = digest ?? JSON.stringify({ path, payload });
      const previous = (digest ? readPendingPublicSubmission(pendingScope) : null) ?? pendingSubmission.current;
      if (previous && previous.fingerprint !== fingerprint) {
        setStatus("이전 예약 제출 결과가 확인되지 않았습니다. 이전 요청을 먼저 조회하거나 아래에서 명시적으로 포기해 주세요.");
        return;
      }
      const attempt = previous ?? { path, fingerprint, idempotencyKey: randomSubmissionKey(),
        receiptKey: randomSubmissionKey(), createdAt: Date.now() };
      pendingSubmission.current = attempt;
      if (digest) {
        writePendingPublicSubmission(pendingScope, attempt);
        canRecoverAfterReload = readPendingPublicSubmission(pendingScope) !== null;
      }
      setHasPending(true);
      const result = await requestJson(path, "POST", payload,
        undefined, { "idempotency-key": attempt.idempotencyKey, "x-receipt-key": attempt.receiptKey });
      if (result.status === 201 || result.status === 200) {
        pendingSubmission.current = null; clearPendingPublicSubmission(pendingScope); setHasPending(false);
        const saved = result.data as { id: string; receiptKey: string };
        setReceipt(saved);
        onReceiptChange?.(saved);
        setStatus(result.status === 200
          ? "이전 예약 요청을 확인했습니다. 추가 예약은 생성되지 않았습니다."
          : "예약 요청이 저장되었습니다. 사업자 관리실에 처리 알림이 기록됐으며 확정 전입니다.");
        if (photos.length > 0) await attachBookingPhotos(saved, photos);
      } else if (result.status === 409) {
        const error = (result.data as { error?: string }).error;
        if (error === "slot_unavailable" || error === "policy_not_set") {
          clearPendingPublicSubmission(pendingScope); pendingSubmission.current = null; setHasPending(false);
          setSlots([]); setStartAt(""); setAvailabilityState("loading");
          setSlotConflict(error === "slot_unavailable");
          setAvailabilityRevision(value => value + 1);
          setStatus(error === "slot_unavailable"
            ? "선택한 시간이 마감됐습니다. 현재 가능 시간을 다시 확인하고 있습니다."
            : "사업자의 예약 시간이 아직 설정되지 않았습니다.");
        } else setStatus(error === "idempotency_conflict"
          ? "제출 내용이 바뀌었습니다. 이전 예약 결과를 확인해 주세요."
          : "예약 제출 결과를 확인하지 못했습니다. 이전 예약 조회로 원본을 확인해 주세요.");
      }
      else if (result.status === 429 && (result.data as { error?: string }).error === "submission_rate_limited")
        setStatus((result.data as { scope?: string }).scope === 'organization'
          ? "이 사업장에 새 예약·문의가 짧은 시간에 많이 접수되어 잠시 제한됩니다. 입력 내용은 유지했습니다. 잠시 뒤 다시 시도해 주세요."
          : "같은 연락처의 새 예약·문의가 짧은 시간에 여러 건 접수되어 잠시 제한됩니다. 입력 내용은 유지했습니다. 잠시 뒤 다시 시도해 주세요.");
      else if (result.status === 403 && (result.data as { error?: string }).error === "trial_ended")
        setStatus("사업자의 Field 체험이 종료되어 새 예약을 신청할 수 없습니다. 입력 내용은 유지됩니다. 기존 예약은 확인키로 열 수 있습니다.");
      else setStatus(`예약 요청을 저장하지 못했습니다 (${result.status}). 입력 내용은 화면에 남아 있습니다.`);
    } catch { setStatus(canRecoverAfterReload
      ? "응답을 받지 못했습니다. 새로고침하면 기존 예약을 조회하거나 같은 내용을 다시 제출할 수 있습니다."
      : "응답을 받지 못했습니다. 이 브라우저는 임시 시도를 보관하지 못해 현재 화면에서만 같은 내용으로 재시도할 수 있습니다. 새로고침하지 마세요."); }
    finally { setBusy(false); }
  }
  return <section id="reservation" className={receipt ? "special-panel field-success-card" : "special-panel"}>{!receipt && <><h2>예약 요청</h2>
    <p>시간을 선택하거나 희망 시간을 남겨 주세요. 사업자가 확인한 뒤 확정됩니다.</p></>}
    {slotConflict && <p className="customer-banner" role="alert">선택한 시간이 마감되어 요청이 저장되지 않았습니다. 새 시간을 선택해 다시 요청해 주세요.</p>}
    {status && !receipt && <p className="state-message" role="status">{status}</p>}
    {receipt ? <FieldReceipt kind="reservation" businessName={catalog.businessName} id={receipt.id} receiptKey={receipt.receiptKey} notice={status} busy={busy} />
      : <form className="form-fields" onSubmit={event => void submit(event)}>
        {hasPending && <div className="customer-banner"><p>이전 제출 시도를 보관 중입니다. 같은 내용을 다시 입력하면 같은 요청으로 재시도합니다. 다른 내용을 제출하려면 먼저 기존 결과를 확인해 주세요.</p>
          <button type="button" disabled={busy || recovering} onClick={() => setRecoveryRevision(value => value + 1)}>이전 예약 조회</button>
          <button type="button" disabled={busy || recovering} onClick={() => {
            clearPendingPublicSubmission(pendingScope); pendingSubmission.current = null; setHasPending(false);
            setStatus("이전 시도를 포기했습니다. 이미 저장됐을 가능성이 있으므로 새 요청 전에 사업자에게 확인해 주세요.");
          }}>이전 시도 포기하고 새 예약</button></div>}
        <label>서비스<select required value={serviceId} onChange={event => {
          setServiceId(event.target.value); setSlots([]); setStartAt(""); setAvailabilityState("idle"); setSlotConflict(false); setStatus("");
          onServiceChange?.(event.target.value);
        }}><option value="">서비스 선택</option>{catalog.services.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {service && <p>{service.priceAmount === null ? "가격은 사업자와 확인해 주세요." : `승인된 가격 ${service.priceAmount.toLocaleString("ko-KR")}원`} · 소요 {service.durationMinutes}분</p>}
        {service?.bookingMode === "slot" ? <><label>희망 날짜<input required type="date" value={date} onChange={event => {
          setDate(event.target.value); setSlots([]); setStartAt(""); setAvailabilityState("idle"); setSlotConflict(false);
        }} /></label><label>가능 시간<select required value={startAt} onChange={event => { setStartAt(event.target.value); setSlotConflict(false); }}><option value="">시간 선택</option>{slots.map(slot => <option key={slot.startAt} value={slot.startAt}>{formatTime(slot.startAt, timezone)}</option>)}</select></label>
          {(availabilityState === "failed" || availabilityState === "unconfigured" || availabilityState === "empty") && <button type="button" onClick={() => setAvailabilityRevision(value => value + 1)}>가능 시간 다시 확인</button>}</>
          : <><p className="field-booking-preferred-note">희망시간 제출형 · 고른 날짜와 시간대는 요청 내용이며, 실제 가능 여부와 확정 시간은 사업자가 확인합니다.</p><label className="field-booking-preferred-date">희망 날짜<input type="date" value={preferredDate} onChange={event => setPreferredDate(event.target.value)} /></label><label className="field-booking-preferred-window">희망 시간대<select value={preferredWindow} onChange={event => setPreferredWindow(event.target.value)}><option value="">시간대 선택</option><option value="오전 (운영시간 내)">오전 (운영시간 내)</option><option value="오후 (운영시간 내)">오후 (운영시간 내)</option><option value="사업자와 조율">사업자와 조율</option></select></label></>}
        <label>이름<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>연락처<input required type="tel" maxLength={30} value={phone} onChange={event => setPhone(event.target.value)} /></label>
        <label>요청 내용<textarea required maxLength={2000} value={requestMessage} onChange={event => setRequestMessage(event.target.value)} placeholder="서비스 조건이나 요청 사항을 알려 주세요." /></label>
        <label className="booking-visit-region">지역·이용 장소 (선택)<input maxLength={200} value={visitRegion} onChange={event => setVisitRegion(event.target.value)} placeholder="상세 주소는 사업자와 조율할 수 있습니다." /></label>
        {service?.bookingMode === "request" && <label>희망 시간<textarea required={!(preferredDate && preferredWindow)} maxLength={400} value={preferred} onChange={event => setPreferred(event.target.value)} placeholder="날짜와 시간대 대신 자유롭게 쓰거나, 다른 가능한 시간을 알려 주세요." /></label>}
        <label className="inquiry-photo-label"><span aria-hidden="true">▧</span> 사진 첨부 (최대 5장, 장당 8MB)<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy} onChange={event => {
          const result = selectedBookingPhotos(event.currentTarget.files);
          if (result.error) { event.currentTarget.value = ""; setStatus(result.error); return; }
          setPhotos(result.selected); setStatus("");
        }} /><small>{photos.length > 0 ? `${photos.length}장 선택됨 · 예약 저장 후 비공개 첨부` : "눌러서 사진을 선택하세요. 예약 저장 후 비공개 첨부합니다."}</small></label>
        <SelectedBookingPhotos photos={photos} />
        <FieldRequestFallback value={fallback} onChange={setFallback} />
        <label><input required type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> 예약 처리에 필요한 연락처 저장에 동의합니다.</label>
        <button type="submit" disabled={busy || recovering || !service || (service.bookingMode === "slot" && (availabilityState !== "ready" || !startAt))}>예약 요청 제출</button>
        <p>회원가입 없이 접수합니다. 연락처 소유 확인이나 예약 확정을 뜻하지 않습니다.</p>
      </form>}
    {receipt && photos.length > 0 && <div className="customer-banner"><p>예약 요청은 저장됐습니다. 남은 사진 {photos.length}장의 첨부를 같은 예약에서 다시 시도할 수 있습니다.</p><SelectedBookingPhotos photos={photos} /><button type="button" disabled={busy} onClick={() => void retryBookingPhotos()}>남은 사진 첨부 재시도</button><button type="button" disabled={busy} onClick={() => setPhotos([])}>사진 첨부 건너뛰기</button></div>}
  </section>;
}

export function OwnerBookingPanel({ organizationId, releaseRevision, releaseState, focusReservationId, focusReservationToken, manualDialogToken, onReservationsLoaded, onReservationsLoadFailed, onOpenFallbackCandidate }: {
  organizationId: string; releaseRevision: number | null; releaseState: "loading" | "ready" | "failed"; focusReservationId?: string | null;
  focusReservationToken?: string; manualDialogToken?: string | null;
  onReservationsLoaded?: (reservations: Reservation[], nextCursor: string | null) => void;
  onReservationsLoadFailed?: () => void;
  onOpenFallbackCandidate: (candidate: FallbackCandidate) => void;
}) {
  const [policy, setPolicy] = useState<BookingPolicy | null>(null);
  const [closedText, setClosedText] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [nextReservationsCursor, setNextReservationsCursor] = useState<string | null>(null);
  const [olderReservationsState, setOlderReservationsState] = useState<"idle" | "loading" | "failed">("idle");
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [ownerMessageText, setOwnerMessageText] = useState("");
  const [pendingOwnerMessage, setPendingOwnerMessage] = useState<{
    reservationId: string; messageId: string; body: string } | null>(null);
  const [ownerMessageBusy, setOwnerMessageBusy] = useState(false);
  const [ownerMessageStatus, setOwnerMessageStatus] = useState("");
  const [eventDeliveries, setEventDeliveries] = useState<ReservationEventDeliveries | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [manualContacts, setManualContacts] = useState<ManualReservationContacts | null>(null);
  const [ownerNotificationRoute, setOwnerNotificationRoute] = useState<ReservationNotificationRoute | null>(null);
  const [routeActivationStatus, setRouteActivationStatus] = useState("");
  const pendingActivation = useRef<string | null>(null);
  const [manualContactStatus, setManualContactStatus] = useState("");
  const [contactEventId, setContactEventId] = useState("");
  const [contactMethod, setContactMethod] = useState<"phone" | "in_person">("phone");
  const [contactOutcome, setContactOutcome] = useState<"attempted" | "reached">("attempted");
  const [contactConfirmed, setContactConfirmed] = useState(false);
  const pendingContact = useRef<{ fingerprint: string; id: string } | null>(null);
  const selectedReservationId = useRef<string | null>(null);
  const [confirmAt, setConfirmAt] = useState("");
  const [proposalAt, setProposalAt] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [specialDate, setSpecialDate] = useState("");
  const [specialOpen, setSpecialOpen] = useState("");
  const [specialClose, setSpecialClose] = useState("");
  const [blocks, setBlocks] = useState<{ id: string; label: string; startAt: string; endAt: string }[]>([]);
  const [approvedCatalog, setApprovedCatalog] = useState<Catalog | null>(null);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockLabel, setBlockLabel] = useState("");
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  useEffect(() => { if (manualDialogToken) setManualDialogOpen(true); }, [manualDialogToken]);
  const manualDialogRef = useRef<HTMLDialogElement>(null);
  const [manualServiceId, setManualServiceId] = useState("");
  const [manualAt, setManualAt] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const pendingManual = useRef<{ fingerprint: string; key: string } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [calendarDay, setCalendarDay] = useState(() => dayInZone(new Date(), "Asia/Seoul"));
  const [calendar, setCalendar] = useState<CalendarWeek | null>(null);
  const [calendarState, setCalendarState] = useState<"loading" | "ready" | "failed">("loading");
  const [calendarRevision, setCalendarRevision] = useState(0);
  const calendarFrom = mondayOf(calendarDay);
  const calendarTo = shiftDay(calendarFrom, 6);
  const [pendingOwnerMutation, setPendingOwnerMutation] = useState<OwnerMutationAttempt | null>(null);
  useEffect(() => {
    const dialog = manualDialogRef.current;
    if (manualDialogOpen && dialog && !dialog.open) dialog.showModal();
  }, [manualDialogOpen]);
  const load = useCallback(async () => {
    const [policyResult, reservationsResult, blocksResult, catalogResult] = await Promise.all([
      requestJson("/v1/booking-policy"), requestJson("/v1/owner/reservations"),
      requestJson("/v1/owner/blocks"), requestJson(`/v1/public/catalog/${organizationId}`),
    ]);
    if (policyResult.status === 200) {
      const next = policyResult.data as BookingPolicy;
      setPolicy(next); setClosedText(next.closedDates.join(", "));
    } else if (policyResult.status === 404) setPolicy(newPolicy());
    else setStatus("예약 정책을 불러오지 못했습니다.");
    if (reservationsResult.status === 200) {
      const page = reservationsResult.data as { reservations: Reservation[]; nextCursor?: string | null };
      const loaded = page.reservations;
      setReservations(loaded);
      setNextReservationsCursor(page.nextCursor ?? null);
      setOlderReservationsState("idle");
      onReservationsLoaded?.(loaded, page.nextCursor ?? null);
    }
    else { setStatus("예약 요청함을 불러오지 못했습니다."); onReservationsLoadFailed?.(); }
    if (blocksResult.status === 200) setBlocks((blocksResult.data as { blocks: typeof blocks }).blocks);
    if (catalogResult.status === 200) setApprovedCatalog(catalogResult.data as Catalog);
    setCalendarRevision(value => value + 1);
  }, [organizationId, onReservationsLoaded, onReservationsLoadFailed]);
  async function loadOlderReservations() {
    if (!nextReservationsCursor || olderReservationsState === "loading") return;
    setOlderReservationsState("loading");
    try {
      const result = await requestJson(`/v1/owner/reservations?cursor=${encodeURIComponent(nextReservationsCursor)}`);
      if (result.status !== 200) { setOlderReservationsState("failed"); return; }
      const page = result.data as { reservations: Reservation[]; nextCursor?: string | null };
      const ids = new Set(reservations.map(item => item.id));
      const loaded = [...reservations, ...page.reservations.filter(item => !ids.has(item.id))];
      setReservations(loaded);
      setNextReservationsCursor(page.nextCursor ?? null);
      setOlderReservationsState("idle");
      onReservationsLoaded?.(loaded, page.nextCursor ?? null);
    } catch { setOlderReservationsState("failed"); }
  }
  useEffect(() => {
    let active = true;
    setCalendar(null); setCalendarState("loading");
    void requestJson(`/v1/owner/reservations/calendar?from=${calendarFrom}&to=${calendarTo}`)
      .then(result => {
        if (!active) return;
        if (result.status === 200) { setCalendar(result.data as CalendarWeek); setCalendarState("ready"); }
        else setCalendarState("failed");
      }).catch(() => { if (active) setCalendarState("failed"); });
    return () => { active = false; };
  }, [calendarFrom, calendarTo, calendarRevision, organizationId]);
  const loadEventDeliveries = useCallback(async (id: string) => {
    setDeliveryLoading(true); setDeliveryStatus("전달·처리 상태를 확인하고 있습니다.");
    try {
      const result = await requestJson(`/v1/owner/reservations/${id}/event-deliveries`);
      if (selectedReservationId.current !== id) return;
      if (result.status === 200) {
        const deliveries = result.data as ReservationEventDeliveries;
        setEventDeliveries(deliveries);
        setContactEventId(current => current && deliveries.events.some(event => event.eventId === current)
          ? current : deliveries.events.at(-1)?.eventId ?? "");
        setDeliveryStatus("");
      } else setDeliveryStatus(`전달 상태를 조회하지 못했습니다 (${result.status}). 예약 내용은 계속 확인할 수 있습니다.`);
    } catch {
      if (selectedReservationId.current === id) setDeliveryStatus("전달 상태 서버에 연결하지 못했습니다. 예약 내용은 계속 확인할 수 있습니다.");
    } finally {
      if (selectedReservationId.current === id) setDeliveryLoading(false);
    }
  }, []);
  const loadManualContacts = useCallback(async (id: string) => {
    try {
      const result = await requestJson(`/v1/owner/reservations/${id}/manual-contacts`);
      if (selectedReservationId.current !== id) return;
      if (result.status === 200) {
        setManualContacts(result.data as ManualReservationContacts);
        setManualContactStatus("");
      } else setManualContactStatus(`직접 연락 기록을 불러오지 못했습니다 (${result.status}).`);
    } catch {
      if (selectedReservationId.current === id) setManualContactStatus("직접 연락 기록 서버에 연결하지 못했습니다.");
    }
  }, []);
  const loadOwnerNotificationRoute = useCallback(async (id: string) => {
    try {
      const result = await requestJson(`/v1/owner/reservations/${id}/notification-route`);
      if (selectedReservationId.current !== id) return;
      if (result.status === 200) {
        const route = result.data as ReservationNotificationRoute;
        setOwnerNotificationRoute(route);
        if (route.pendingTransferId) pendingActivation.current = route.pendingTransferId;
      }
      else { setOwnerNotificationRoute(null); setRouteActivationStatus(`알림 경로를 확인하지 못했습니다 (${result.status}).`); }
    } catch {
      if (selectedReservationId.current === id) {
        setOwnerNotificationRoute(null); setRouteActivationStatus("알림 경로 서버에 연결하지 못했습니다.");
      }
    }
  }, []);
  const selectReservation = useCallback(async (id: string) => {
    selectedReservationId.current = id;
    setEventDeliveries(null); setDeliveryStatus(""); setDeliveryLoading(false);
    setManualContacts(null); setManualContactStatus(""); setContactEventId("");
    setOwnerNotificationRoute(null); setRouteActivationStatus(""); pendingActivation.current = null;
    setContactConfirmed(false); pendingContact.current = null;
    const result = await requestJson(`/v1/owner/reservations/${id}`);
    if (selectedReservationId.current !== id) return false;
    if (result.status === 200) {
      const reservation = result.data as Reservation;
      setSelected(reservation); setConfirmAt(""); setProposalAt(""); setActionReason("");
      setOwnerMessageText("");
      if (reservation.source === "external_ap") {
        void loadEventDeliveries(id);
        void loadManualContacts(id);
        void loadOwnerNotificationRoute(id);
      }
      return true;
    }
    setStatus(`예약을 열지 못했습니다 (${result.status}).`);
    return false;
  }, [loadEventDeliveries, loadManualContacts, loadOwnerNotificationRoute]);
  async function sendOwnerReservationMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || selected.source !== "public") return;
    if (pendingOwnerMessage && pendingOwnerMessage.reservationId !== selected.id) {
      setOwnerMessageStatus("다른 예약의 답변 결과를 먼저 확인해 주세요."); return;
    }
    const attempt = pendingOwnerMessage ?? { reservationId: selected.id,
      messageId: crypto.randomUUID(), body: ownerMessageText.trim() };
    if (!attempt.body) return;
    setPendingOwnerMessage(attempt); setOwnerMessageBusy(true);
    setOwnerMessageStatus("Field 예약 대화에 답변을 저장하고 있습니다.");
    try {
      const sent = await requestJson(`/v1/owner/reservations/${attempt.reservationId}/messages`,
        "POST", { messageId: attempt.messageId, body: attempt.body });
      if (sent.status !== 201 && sent.status !== 200) {
        setOwnerMessageStatus(`답변 저장 결과를 확인하지 못했습니다 (${sent.status}). 같은 메시지 ID로 다시 확인할 수 있습니다.`);
        setOwnerMessageBusy(false);
        return;
      }
      setOwnerMessageStatus("답변은 Field에 저장됐습니다. 최신 대화를 확인하고 있습니다.");
    } catch { setOwnerMessageStatus("답변 응답을 받지 못했습니다. 같은 내용을 다시 보내면 한 건으로 확인합니다."); }
    try {
      const fresh = await requestJson(`/v1/owner/reservations/${attempt.reservationId}`);
      if (fresh.status !== 200) return;
      const value = fresh.data as Reservation;
      if (selectedReservationId.current === attempt.reservationId) setSelected(value);
      if (!value.messages?.some(message => message.id === attempt.messageId)) return;
      setPendingOwnerMessage(null); setOwnerMessageText("");
      setOwnerMessageStatus("답변이 Field 대화에 저장됐습니다. 고객은 확인키로 읽을 수 있습니다. 외부 알림은 연동 전입니다.");
    } catch { /* 결과 미상: 같은 ID로 재시도한다. */ }
    finally { setOwnerMessageBusy(false); }
  }
  async function openCalendarReservation(id: string) {
    try {
      if (await selectReservation(id))
        document.getElementById("owner-reservation-detail")?.scrollIntoView({ block: "start" });
    } catch { setStatus("예약 상세를 불러오지 못했습니다. 요청 목록에서 다시 열어 주세요."); }
  }
  async function activateNotificationRoute() {
    if (!selected || !ownerNotificationRoute || ownerNotificationRoute.state !== "consented") return;
    pendingActivation.current ??= crypto.randomUUID();
    setBusy(true); setRouteActivationStatus("AP 이전 사건·알림 상태를 대조하고 있습니다.");
    try {
      const result = await requestJson(
        `/v1/owner/reservations/${selected.id}/notification-route/activate`, "POST",
        { transferId: pendingActivation.current });
      if (result.status === 200) {
        pendingActivation.current = null;
        await loadOwnerNotificationRoute(selected.id);
        setRouteActivationStatus("향후 새 예약 사건의 Field 알림 경로가 활성화됐습니다. 이전 사건은 재발송하지 않습니다. 외부 공급사 발송은 아직 확인되지 않았습니다.");
      } else setRouteActivationStatus(result.status === 409
        ? (result.data as { error?: string }).error === "post_snapshot_manual_contact_required"
          ? "AP 대조 기준 뒤에 새 예약 사건이 생겼습니다. 아래 사건별 직접 연락에서 해당 사건의 실제 고객 도달을 기록한 뒤 같은 전환을 다시 시도해 주세요."
          : `전환할 수 없습니다: ${(result.data as { error?: string }).error ?? "이전 사건 또는 동의 상태를 확인하세요"}. 이전 사건은 직접 연락 상태를 확인해 주세요.`
        : `AP 종료 결과를 확인하지 못했습니다 (${result.status}). 같은 전환 요청으로 다시 시도해 주세요.`);
    } catch { setRouteActivationStatus("AP 종료 결과가 불명확합니다. 같은 전환 요청으로 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load().catch(() => { setStatus("예약 서버에 연결하지 못했습니다."); onReservationsLoadFailed?.(); }); }, [load, onReservationsLoadFailed]);
  useEffect(() => {
    if (!focusReservationId) return;
    void selectReservation(focusReservationId).then(() => {
      document.getElementById("owner-reservations")?.scrollIntoView({ block: "start" });
    });
  }, [focusReservationId, focusReservationToken, selectReservation]);
  async function reconcileOwnerMutation(attempt: OwnerMutationAttempt) {
    setBusy(true);
    setStatus(`${attempt.label} 결과를 예약 원장에서 확인하고 있습니다.`);
    try {
      const result = await requestJson(`/v1/owner/reservations/${attempt.reservationId}`);
      if (result.status !== 200) {
        setStatus(`${attempt.label} 결과를 확인할 수 없습니다 (${result.status}). 예약 처리 결과 확인을 다시 눌러 주세요.`);
        return;
      }
      const current = result.data as Reservation;
      if (!Array.isArray(current.events)) {
        setStatus(`${attempt.label} 결과를 확인할 수 없습니다. 예약 처리 기록을 다시 조회해 주세요.`);
        return;
      }
      setReservations(previous => previous.map(item => item.id === current.id ? current : item));
      if (selectedReservationId.current === current.id) setSelected(current);
      const recorded = current.events.some(event => event.revision === attempt.expectedRevision + 1
        && event.actorType === "owner" && event.eventType === attempt.eventType
        && Object.entries(attempt.detail).every(([key, value]) => event.detail[key] === value));
      setPendingOwnerMutation(null);
      if (recorded) setStatus(`${attempt.label} 처리가 예약 기록에서 확인됐습니다. 고객 외부 알림 발송은 별도 상태에서 확인해 주세요.`);
      else if (current.revision === attempt.expectedRevision)
        setStatus(`${attempt.label} 처리가 아직 예약 기록에 없습니다. 같은 화면에서 내용을 확인한 뒤 다시 요청할 수 있습니다.`);
      else setStatus("예약에 다른 변경이 반영됐습니다. 최신 상태와 처리 기록을 확인한 뒤 다시 선택해 주세요.");
    } catch { setStatus(`${attempt.label} 결과를 확인할 수 없습니다. 예약 처리 결과 확인을 다시 눌러 주세요.`); }
    finally { setBusy(false); }
  }
  async function recoverOwnerMutation(attempt: OwnerMutationAttempt) {
    setPendingOwnerMutation(attempt);
    await reconcileOwnerMutation(attempt);
  }
  function applyOwnerReservation(reservation: Reservation) {
    setReservations(previous => previous.map(item => item.id === reservation.id ? reservation : item));
    if (selectedReservationId.current === reservation.id) setSelected(reservation);
  }
  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy) return;
    const closedDates = closedText.split(",").map(value => value.trim()).filter(Boolean);
    setBusy(true); setStatus("예약 정책 저장 중입니다.");
    try {
      const result = await requestJson("/v1/booking-policy", "PUT", {
        expectedRevision: policy.revision, timezone: policy.timezone, weekly: policy.weekly,
        closedDates, specialDates: policy.specialDates, beforeMinutes: policy.beforeMinutes,
        afterMinutes: policy.afterMinutes, minLeadMinutes: policy.minLeadMinutes, horizonDays: policy.horizonDays,
      });
      if (result.status === 200) { setPolicy(result.data as BookingPolicy); setStatus("예약 정책이 저장되었습니다."); }
      else if (result.status === 409) setStatus("정책 버전이 변경됐습니다. 새로고침 후 다시 수정해 주세요.");
      else if (result.status === 400) setStatus("영업일을 하나 이상 선택하고 시작·종료 시간, 휴무일과 숫자 범위를 확인해 주세요.");
      else setStatus(`정책을 저장하지 못했습니다 (${result.status}).`);
    } catch { setStatus("정책 저장 요청을 전달하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!selected) return;
    const expectedStartAt = selected.state === "customer_accepted" || selected.state === "change_accepted"
      ? selected.proposalStartAt : selected.bookingMode === "slot"
        ? selected.requestedStartAt : confirmAt ? new Date(confirmAt).toISOString() : null;
    if (!expectedStartAt) return;
    const attempt: OwnerMutationAttempt = { reservationId: selected.id,
      expectedRevision: selected.revision, eventType: selected.state === "change_accepted"
        ? "field.reservation.changed" : "field.reservation.confirmed",
      detail: { startAt: expectedStartAt }, label: "확정" };
    let acknowledged = false;
    setBusy(true); setStatus("예약 확정 중입니다.");
    try {
      const result = await requestJson(`/v1/owner/reservations/${selected.id}/confirm`, "POST", {
        expectedRevision: selected.revision, expectedCatalogRevision: selected.catalogRevision,
        ...(selected.state === "requested" && selected.bookingMode === "request" ? { startAt: new Date(confirmAt).toISOString() } : {}),
      });
      acknowledged = true;
      if (result.status === 201) { applyOwnerReservation(result.data as Reservation); setStatus(selected.source === "external_ap"
        ? "예약이 확정되어 달력을 점유했습니다. AP 전달·고객 알림 상태는 아래에서 확인해 주세요."
        : "예약이 확정되어 달력을 점유했습니다. 고객 외부 알림은 공급사 미연결로 발송되지 않았습니다."); await load(); await selectReservation(selected.id); }
      else if (result.status === 409) setStatus(`확정하지 못했습니다: ${(result.data as { error?: string }).error ?? "시간 또는 버전 충돌"}. 최신 카탈로그와 달력을 확인해 주세요.`);
      else setStatus(`확정하지 못했습니다 (${result.status}).`);
    } catch {
      if (acknowledged) setStatus("확정 응답은 받았지만 최신 목록을 읽지 못했습니다. 예약을 다시 열어 상태를 확인해 주세요.");
      else await recoverOwnerMutation(attempt);
    }
    finally { setBusy(false); }
  }
  async function propose() {
    if (!selected || !proposalAt) return;
    const startAt = new Date(proposalAt).toISOString();
    const attempt: OwnerMutationAttempt = { reservationId: selected.id, expectedRevision: selected.revision,
      eventType: "field.reservation.proposed", detail: { startAt }, label: "시간 제안" };
    let acknowledged = false;
    setBusy(true); setStatus("새 시간을 제안하고 있습니다.");
    try {
      const result = await requestJson(`/v1/owner/reservations/${selected.id}/proposals`, "POST", {
        expectedRevision: selected.revision, expectedCatalogRevision: selected.catalogRevision,
        startAt,
      });
      acknowledged = true;
      if (result.status === 201) { applyOwnerReservation(result.data as Reservation); setStatus(selected.source === "external_ap"
        ? "새 시간 제안이 저장됐습니다. AP 전달 상태를 아래에서 확인해 주세요. 고객 수락 뒤에도 최종 확정이 필요합니다."
        : "새 시간 제안이 저장되었습니다. 고객 외부 알림은 공급사 미연결로 발송되지 않았으며, 수락 뒤에도 사업자 최종 확정이 필요합니다."); await load(); await selectReservation(selected.id); }
      else setStatus(`시간 제안에 실패했습니다 (${result.status}): ${(result.data as { error?: string }).error ?? ""}`);
    } catch {
      if (acknowledged) setStatus("시간 제안 응답은 받았지만 최신 목록을 읽지 못했습니다. 예약을 다시 열어 확인해 주세요.");
      else await recoverOwnerMutation(attempt);
    }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!selected || !actionReason.trim()) return;
    const attempt: OwnerMutationAttempt = { reservationId: selected.id, expectedRevision: selected.revision,
      eventType: "field.reservation.canceled", detail: { reason: actionReason.trim() }, label: "취소" };
    let acknowledged = false;
    setBusy(true); setStatus("취소 처리 중입니다.");
    try {
      const result = await requestJson(`/v1/owner/reservations/${selected.id}/cancel`, "POST", {
        expectedRevision: selected.revision, reason: actionReason,
      });
      acknowledged = true;
      if (result.status === 200) { applyOwnerReservation(result.data as Reservation); setStatus(selected.source === "owner_manual"
        ? "전화 예약이 취소되고 점유가 해제되었습니다. 고객 자동 알림은 대상이 아닙니다."
        : selected.source === "external_ap"
          ? "예약이 취소되고 점유가 해제됐습니다. AP 전달·고객 알림 상태는 아래에서 확인해 주세요."
        : "예약이 취소되고 점유가 해제되었습니다. 고객 외부 알림은 공급사 미연결로 발송되지 않았습니다."); await load(); await selectReservation(selected.id); }
      else setStatus(`취소에 실패했습니다 (${result.status}).`);
    } catch {
      if (acknowledged) setStatus("취소 응답은 받았지만 최신 목록을 읽지 못했습니다. 예약을 다시 열어 확인해 주세요.");
      else await recoverOwnerMutation(attempt);
    }
    finally { setBusy(false); }
  }
  async function decide(action: "reject" | "expire" | "complete" | "no_show" | "decline_cancel" | "decline_change") {
    if (!selected || !actionReason.trim()) return;
    const attempt: OwnerMutationAttempt = { reservationId: selected.id, expectedRevision: selected.revision,
      eventType: `field.reservation.${action}`, detail: { reason: actionReason.trim() },
      label: ({ reject: "거절", expire: "만료", complete: "완료", no_show: "노쇼",
        decline_cancel: "취소 요청 거절", decline_change: "변경 요청 거절" })[action] };
    let acknowledged = false;
    setBusy(true); setStatus("예약 상태를 처리하고 있습니다.");
    try {
      const result = await requestJson(`/v1/owner/reservations/${selected.id}/decision`, "POST", {
        expectedRevision: selected.revision, action, reason: actionReason,
      });
      acknowledged = true;
      if (result.status === 200) {
        const changed = result.data as Reservation & { delivery?: string };
        applyOwnerReservation(changed);
        setStatus(selected.source === "external_ap"
          ? `예약 상태를 ${stateLabel(changed.state)}으로 기록했습니다. AP 전달·고객 알림 상태는 아래에서 확인해 주세요.`
          : `예약 상태를 ${stateLabel(changed.state)}으로 기록했습니다. ${changed.delivery === "pending"
            ? "고객 외부 알림은 공급사 미연결로 발송되지 않았습니다."
            : "이 처리에는 고객 자동 알림이 없습니다."}`);
        await load(); await selectReservation(selected.id);
      } else setStatus(`상태 처리에 실패했습니다 (${result.status}): ${(result.data as { error?: string }).error ?? ""}`);
    } catch {
      if (acknowledged) setStatus("상태 처리 응답은 받았지만 최신 목록을 읽지 못했습니다. 예약을 다시 열어 확인해 주세요.");
      else await recoverOwnerMutation(attempt);
    }
    finally { setBusy(false); }
  }
  async function block(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("일정을 차단하고 있습니다.");
    try {
      const result = await requestJson("/v1/owner/blocks", "POST", {
        startAt: new Date(blockStart).toISOString(), endAt: new Date(blockEnd).toISOString(), label: blockLabel,
      });
      setStatus(result.status === 201 ? "수동 일정이 저장되어 같은 시간의 예약 확정을 차단합니다."
        : result.status === 409 ? "이미 점유된 시간과 겹칩니다." : `일정 차단에 실패했습니다 (${result.status}).`);
      if (result.status === 201) { setBlockStart(""); setBlockEnd(""); setBlockLabel(""); setManualDialogOpen(false); }
      if (result.status === 201) await load();
    } catch { setStatus("일정 차단 요청을 전달하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function removeBlock(id: string) {
    setBusy(true);
    try {
      const result = await requestJson(`/v1/owner/blocks/${id}`, "DELETE");
      if (result.status === 204) { setStatus("수동 일정 차단을 해제했습니다."); await load(); }
      else setStatus(`수동 일정 해제에 실패했습니다 (${result.status}).`);
    } catch { setStatus("수동 일정 해제를 전달하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function recordManualContact() {
    if (!selected || !contactEventId || !contactConfirmed || manualContacts?.connectionStatus !== "revoked") return;
    const fingerprint = JSON.stringify({ reservationId: selected.id, eventId: contactEventId,
      method: contactMethod, outcome: contactOutcome });
    if (pendingContact.current?.fingerprint !== fingerprint) pendingContact.current = {
      fingerprint, id: crypto.randomUUID(),
    };
    const attempt = pendingContact.current;
    setBusy(true); setManualContactStatus("직접 연락 사실을 기록하고 있습니다.");
    try {
      const result = await requestJson(`/v1/owner/reservations/${selected.id}/manual-contacts`, "POST", {
        contactAttemptId: attempt.id, eventId: contactEventId,
        method: contactMethod, outcome: contactOutcome,
      });
      if (result.status === 201 || result.status === 200) {
        pendingContact.current = null; setContactConfirmed(false);
        await loadManualContacts(selected.id);
        setManualContactStatus(contactOutcome === "reached"
          ? "사업자가 고객과 직접 연락한 사실을 기록했습니다. 자동 발송이나 AP 알림 성공으로 처리하지 않았습니다."
          : "사업자의 직접 연락 시도를 기록했습니다. 고객에게 도달한 것으로 표시하지 않았습니다.");
      } else setManualContactStatus(result.status === 409
        ? "연결 상태나 기록 내용이 달라졌습니다. 예약 상태를 다시 확인해 주세요."
        : `직접 연락 기록을 저장하지 못했습니다 (${result.status}).`);
    } catch { setManualContactStatus("기록 응답을 받지 못했습니다. 같은 내용을 다시 제출하면 기존 기록을 확인합니다."); }
    finally { setBusy(false); }
  }
  async function manual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("전화 예약을 기록하고 있습니다.");
    try {
      const payload = {
        serviceId: manualServiceId, startAt: new Date(manualAt).toISOString(), name: manualName, phone: manualPhone,
      };
      const fingerprint = JSON.stringify({ organizationId, payload });
      if (pendingManual.current?.fingerprint !== fingerprint)
        pendingManual.current = { fingerprint, key: randomSubmissionKey() };
      const result = await requestJson("/v1/owner/reservations/manual", "POST", payload,
        undefined, { "idempotency-key": pendingManual.current.key });
      if (result.status === 201 || result.status === 200) {
        pendingManual.current = null;
        setManualAt(""); setManualName(""); setManualPhone("");
        setStatus(result.status === 200
          ? "기존 전화 예약을 확인했습니다. 추가 예약은 만들지 않았고 고객 자동 알림도 보내지 않았습니다."
          : "전화 예약이 달력에 기록됐습니다. 고객에게 자동 알림을 보내지 않았습니다.");
        try { await load(); }
        catch { setStatus("전화 예약은 기록됐지만 목록을 다시 읽지 못했습니다. 새로고침으로 확인해 주세요."); }
      } else setStatus(`전화 예약 기록에 실패했습니다 (${result.status}): ${(result.data as { error?: string }).error ?? ""}`);
    } catch { setStatus("전화 예약 기록 결과를 확인할 수 없습니다. 입력 내용 그대로 다시 제출하면 같은 요청 키로 기존 예약을 확인합니다."); }
    finally { setBusy(false); }
  }
  const calendarZone = calendar?.timezone ?? policy?.timezone ?? "Asia/Seoul";
  const calendarDateLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", month: "long",
    day: "numeric", weekday: "short" }).format(new Date(`${calendarDay}T12:00:00Z`));
  const agenda = calendar ? [
    ...calendar.reservations.filter(item => item.confirmedStartAt
      && dayInZone(new Date(item.confirmedStartAt), calendarZone) === calendarDay)
      .map(item => ({ kind: "reservation" as const, id: item.id, startAt: item.confirmedStartAt!,
        title: `${item.service.name} · ${item.name}`,
        detail: `${timeInZone(item.confirmedStartAt!, calendarZone)}–${item.confirmedEndAt ? timeInZone(item.confirmedEndAt, calendarZone) : "종료 시간 미정"} · ${stateLabel(item.state)}` })),
    ...calendar.blocks.filter(item => dayInZone(new Date(item.startAt), calendarZone) <= calendarDay
      && dayInZone(new Date(new Date(item.endAt).getTime() - 1), calendarZone) >= calendarDay)
      .map(item => ({ kind: "block" as const, id: item.id, startAt: item.startAt,
        title: item.label, detail: `${timeInZone(item.startAt, calendarZone)}–${timeInZone(item.endAt, calendarZone)} · 수동 일정` })),
  ].sort((left, right) => left.startAt.localeCompare(right.startAt)) : [];
  return <section id="owner-reservations" className="special-panel booking-workspace"><div className="booking-page-heading"><div><h2>예약·일정</h2><p>홈페이지·공유 링크에서 온 요청과 수동 일정을 함께 관리합니다.</p></div><button type="button" onClick={() => setManualDialogOpen(true)}>＋ 수동 일정 등록</button></div>
    {status && <p className="state-message" role="status">{status}</p>}
    {pendingOwnerMutation && <div className="state-message" role="alert"><p>이 예약의 처리 요청 결과를 아직 확인하지 못했습니다. 예약 기록을 다시 읽을 때까지 추가 처리를 보류합니다.</p>
      <button type="button" disabled={busy} onClick={() => void reconcileOwnerMutation(pendingOwnerMutation)}>예약 처리 결과 확인</button></div>}
    <div className="booking-overview-grid"><div className="booking-agenda-card"><div className="booking-day-heading"><button type="button" aria-label="이전 날짜" onClick={() => setCalendarDay(day => shiftDay(day, -1))}>‹</button><h3>{calendarDateLabel}</h3><button type="button" aria-label="다음 날짜" onClick={() => setCalendarDay(day => shiftDay(day, 1))}>›</button></div><label className="booking-date-input">일정 날짜<input type="date" value={calendarDay} onChange={event => setCalendarDay(event.target.value)} /></label><div className="booking-agenda-list">{calendarState === "loading" ? <p role="status">일정을 불러오는 중입니다.</p> : calendarState === "failed" ? <div role="status"><p>일정을 불러오지 못했습니다. 기존 예약 기록은 아래에서 확인할 수 있습니다.</p><button type="button" onClick={() => setCalendarRevision(value => value + 1)}>일정 다시 불러오기</button></div> : agenda.length ? agenda.map(item => <div className="booking-agenda-entry" key={`${item.kind}-${item.id}`}><time>{timeInZone(item.startAt, calendarZone)}</time><div><strong>{item.title}</strong><p>{item.detail}</p>{item.kind === "reservation" && <button type="button" onClick={() => void openCalendarReservation(item.id)}>예약 상세 열기</button>}</div></div>) : <div className="booking-agenda-empty"><span aria-hidden="true">▦</span><h4>확정된 일정이 없습니다.</h4><p>전화로 받은 예약과 개인 일정도 여기에 등록하세요.</p></div>}</div></div>
      <aside className="booking-request-card"><div className="booking-request-heading"><h3>확인할 예약 요청</h3><span>{calendar?.pending.length ?? 0}{calendar?.pendingHasMore ? "+" : ""}건</span></div>{calendarState === "loading" ? <p>요청을 불러오는 중입니다.</p> : calendarState === "failed" ? <p>요청 목록을 확인하지 못했습니다. 아래 최근 예약 목록을 확인해 주세요.</p> : calendar?.pending.length ? <div className="booking-request-list">{calendar.pending.map(item => <article key={item.id}><span>{stateLabel(item.state)}</span><h4>{item.name} · {item.service.name}</h4><p>{item.requestedStartAt ? formatTime(item.requestedStartAt, item.timezone) : item.preferredTimeText || "시간 조율 필요"}</p><p>{item.source === "external_ap" ? "AP 전달" : "홈페이지"}</p><button type="button" onClick={() => void openCalendarReservation(item.id)}>확인·처리</button></article>)}</div> : <p>대기 중인 요청이 없어요.</p>}</aside></div>
    <div className="booking-management-head"><p>승인 카탈로그: {releaseState === "failed" ? "확인 불가" : releaseState === "loading" ? "확인 중" : releaseRevision === null ? "없음" : `${releaseRevision}번`}. 신청은 접수 당시 버전의 서비스·가격·소요 시간을 보관합니다.</p><button type="button" onClick={() => void load()}>예약 기록 새로고침</button></div>
    <details className="booking-policy-details"><summary>영업시간·예약 정책 설정</summary>{policy && <form className="form-fields" onSubmit={event => void savePolicy(event)}><h3>예약 정책 · revision {policy.revision}</h3><p>시간대: {policy.timezone}. 영업일을 직접 선택해 주세요. 기본 영업시간은 자동으로 만들지 않습니다. 종료가 시작보다 이르면 다음 날 종료하는 영업시간입니다. 휴무일에는 전날 밤부터 이어진 슬롯도 받지 않습니다.</p>
      {weekdays.map(([key, label]) => <div key={key} className="booking-weekday"><label><input type="checkbox" checked={Boolean(policy.weekly[key])} onChange={event => setPolicy(current => {
        if (!current) return current;
        const weekly = { ...current.weekly };
        if (event.target.checked) weekly[key] = { open: "", close: "" }; else delete weekly[key];
        return { ...current, weekly };
      })} /> {label}요일</label>{policy.weekly[key] && <><label>시작<input required type="time" value={policy.weekly[key].open} onChange={event => setPolicy(current => current ? { ...current, weekly: { ...current.weekly, [key]: { ...current.weekly[key]!, open: event.target.value } } } : current)} /></label><label>종료<input required type="time" value={policy.weekly[key].close} onChange={event => setPolicy(current => current ? { ...current, weekly: { ...current.weekly, [key]: { ...current.weekly[key]!, close: event.target.value } } } : current)} /></label></>}</div>)}
      <label>휴무일 (YYYY-MM-DD, 쉼표 구분)<input value={closedText} onChange={event => setClosedText(event.target.value)} placeholder="2026-10-03, 2026-10-09" /></label>
      <div className="booking-exceptions"><h4>예외 영업일</h4><div className="booking-weekday"><label>날짜<input type="date" value={specialDate} onChange={event => setSpecialDate(event.target.value)} /></label><label>시작<input type="time" value={specialOpen} onChange={event => setSpecialOpen(event.target.value)} /></label><label>종료<input type="time" value={specialClose} onChange={event => setSpecialClose(event.target.value)} /></label><button type="button" disabled={!specialDate || !specialOpen || !specialClose || specialOpen === specialClose} onClick={() => { setPolicy({ ...policy, specialDates: { ...policy.specialDates, [specialDate]: { open: specialOpen, close: specialClose } } }); setSpecialDate(""); setSpecialOpen(""); setSpecialClose(""); }}>예외일 추가</button></div><ul>{Object.entries(policy.specialDates).map(([day, hours]) => <li key={day}>{day} {hours.open}–{hours.close} <button type="button" onClick={() => { const specialDates = { ...policy.specialDates }; delete specialDates[day]; setPolicy({ ...policy, specialDates }); }}>삭제</button></li>)}</ul></div>
      <label>예약 전 준비·이동 시간(분)<input type="number" min={0} max={1440} value={policy.beforeMinutes} onChange={event => setPolicy({ ...policy, beforeMinutes: Number(event.target.value) })} /></label>
      <label>예약 후 정리·이동 시간(분)<input type="number" min={0} max={1440} value={policy.afterMinutes} onChange={event => setPolicy({ ...policy, afterMinutes: Number(event.target.value) })} /></label>
      <label>최소 신청 여유(분)<input type="number" min={0} max={43200} value={policy.minLeadMinutes} onChange={event => setPolicy({ ...policy, minLeadMinutes: Number(event.target.value) })} /></label>
      <label>신청 가능 기간(일)<input type="number" min={1} max={365} value={policy.horizonDays} onChange={event => setPolicy({ ...policy, horizonDays: Number(event.target.value) })} /></label>
      <button type="submit" disabled={busy}>예약 정책 저장</button>
    </form>}</details>
    <div className="booking-columns"><div><h3>예약 요청 {reservations.length}{nextReservationsCursor ? "+" : ""}건</h3>
      {reservations.length === 0 ? <p>아직 예약 요청이 없습니다.</p> : <ul>{reservations.map(item => <li key={item.id}><button type="button" data-reservation-id={item.id} onClick={() => void selectReservation(item.id)}>{item.name} · {item.service.name} · {stateLabel(item.state)}</button></li>)}</ul>}
      {nextReservationsCursor && <button type="button" disabled={olderReservationsState === "loading"} onClick={() => void loadOlderReservations()}>{olderReservationsState === "loading" ? "이전 예약 불러오는 중" : "이전 예약 더 보기"}</button>}
      {olderReservationsState === "failed" && <p role="alert">이전 예약을 불러오지 못했습니다. 위 버튼으로 다시 시도할 수 있습니다.</p>}
      {selected && <div id="owner-reservation-detail" className="knowledge-source form-fields"><h4>{selected.name} · {selected.service.name}</h4><p>연락처: {selected.phone}</p><p>상태: {stateLabel(selected.state)} · {selected.source === "owner_manual" ? "전화 수동 등록" : selected.source === "external_ap" ? "AP에서 전달된 예약" : "고객 직접 신청"} · 접수 카탈로그 {selected.catalogRevision}번</p><p><a href={`/v1/owner/reservations/${selected.id}/export`}>이 예약 기록 JSON 다운로드</a></p><p>접수 가격: {selected.service.priceAmount === null ? "미정" : `${selected.service.priceAmount.toLocaleString("ko-KR")}원`}</p><p>{selected.bookingMode === "slot" ? `요청 시간: ${selected.requestedStartAt ? formatTime(selected.requestedStartAt, selected.timezone) : "없음"}` : `희망 시간: ${selected.preferredTimeText}`}</p>{selected.requestMessage && <p>고객 요청 내용: {selected.requestMessage}</p>}{selected.visitRegion && <p>지역·이용 장소: {selected.visitRegion}</p>}<FieldFallbackReview fallback={selected.fallback} review={selected.fallbackReview} onOpenCandidate={onOpenFallbackCandidate} />{selected.source === "external_ap" && <FieldReceivedWorkRecord record={selected.receivedRecord} />}
        {selected.attachments?.map((attachment, index) => <PrivateReservationPhoto key={attachment.id} reservationId={selected.id} attachmentId={attachment.id} label={`예약 첨부 사진 ${index + 1}`} />)}
        {selected.changePreferredText && <p>변경 희망: {selected.changePreferredText}</p>}
        {selected.proposalStartAt && <p>제안 시간: {formatTime(selected.proposalStartAt, selected.timezone)} {selected.proposalAcceptedAt ? "· 고객 수락" : "· 고객 확인 전"}</p>}
        {selected.confirmedStartAt && <p>{["canceled", "completed", "no_show"].includes(selected.state) ? "기존 확정 시간" : "현재 확정 시간"}: {formatTime(selected.confirmedStartAt, selected.timezone)}</p>}
        {selected.events && <details><summary>예약 처리 기록 {selected.events.length}건</summary><ol>{selected.events.map(event => <li key={event.revision}>{formatTime(event.occurredAt, selected.timezone)} · {event.actorType === "owner" ? "사업자" : "고객"} · {stateLabel(event.nextState)}{typeof event.detail.reason === "string" ? ` · ${event.detail.reason}` : ""}</li>)}</ol></details>}
        {selected.source === "public" && <section className="field-owner-reservation-thread" aria-label="예약 후속 대화"><h4>고객과 예약 대화</h4>{selected.messages?.length ? <ol>{selected.messages.map(message => <li key={message.id} className={message.sender}><strong>{message.sender === "owner" ? "나 · 사업자" : "고객"}</strong><p>{message.body}</p><small>{formatTime(message.createdAt, selected.timezone)}{message.sender === "owner" ? " · Field 열람 가능 · 외부 알림 연동 전" : ""}</small></li>)}</ol> : <p>아직 추가 메시지가 없습니다.</p>}
          {pendingOwnerMessage && pendingOwnerMessage.reservationId !== selected.id && <p role="alert">다른 예약의 답변 결과가 확인되지 않았습니다. 해당 예약을 다시 열어 확인해 주세요.</p>}
          {ownerMessageStatus && <p role="status" className="state-message">{ownerMessageStatus}</p>}
          <form onSubmit={event => void sendOwnerReservationMessage(event)}><label>고객에게 답변<textarea required maxLength={5000} value={pendingOwnerMessage?.reservationId === selected.id ? pendingOwnerMessage.body : ownerMessageText} readOnly={pendingOwnerMessage?.reservationId === selected.id} onChange={event => setOwnerMessageText(event.target.value)} placeholder="예약에 관한 답변을 입력하세요" /></label><button type="submit" disabled={ownerMessageBusy || busy || (!pendingOwnerMessage && !ownerMessageText.trim()) || Boolean(pendingOwnerMessage && pendingOwnerMessage.reservationId !== selected.id)}>{pendingOwnerMessage?.reservationId === selected.id ? "답변 결과 확인·재시도" : "Field 대화에 답변 저장"}</button></form><p>답변은 이 예약 확인키로 읽을 수 있습니다. 고객 문자·카카오 알림은 공급사 연결 전까지 발송되지 않습니다.</p>
        </section>}
        {selected.source === "external_ap" && <section aria-label="AP 연결 예약 사건 상태"><div className="panel-heading"><h4>AP 전달·처리 상태</h4><button type="button" disabled={deliveryLoading} onClick={() => { void loadEventDeliveries(selected.id); void loadManualContacts(selected.id); void loadOwnerNotificationRoute(selected.id); }}>상태 새로고침</button></div>
          <p>Field 예약 처리와 AP 수신, AP 고객 알림은 각각 다른 상태입니다. AP 수신 응답만으로 고객 발송·열람을 확인할 수 없습니다.</p>
          {ownerNotificationRoute?.connectionStatus === "revoked" && <section className="knowledge-source form-fields" aria-label="향후 예약 알림 경로 전환"><h4>향후 예약 알림 담당</h4>
            <p>현재: {ownerNotificationRoute.state === "active" ? "Field 세대 2" : ownerNotificationRoute.state === "suspended" ? "고객 동의 철회 · 자동 알림 중지" : "AP 세대 1 종료 대기 · 직접 연락 필요"}</p>
            {ownerNotificationRoute.state === "awaiting_consent" && <p>고객이 Field 예약 확인키로 향후 알림 담당 변경에 동의해야 합니다. 사업자가 대신 동의할 수 없습니다.</p>}
            {ownerNotificationRoute.state === "withdrawn" && <p>고객이 동의를 철회했습니다. Field 자동 알림으로 전환할 수 없습니다.</p>}
            {ownerNotificationRoute.state === "consented" && <><p>고객 동의가 저장됐습니다. AP의 이전 사건과 미발송·결과 미상 상태를 검증한 뒤 새 사건부터만 Field가 담당합니다. 실패하면 직접 연락 상태를 확인해 주세요.</p>{ownerNotificationRoute.pendingTransferId && <p>전환 대기 중: AP 종료 결과를 같은 요청으로 다시 확인할 수 있습니다. 대조 기준 사건은 {ownerNotificationRoute.pendingRevision}번이며 그 뒤 사건은 직접 연락 도달 기록이 필요합니다.</p>}<button type="button" disabled={busy || !ownerNotificationRoute.revocationAcknowledged || !ownerNotificationRoute.customerAccessAvailable} onClick={() => void activateNotificationRoute()}>이전 AP 사건 대조·향후 Field 알림 경로 활성화</button>{!ownerNotificationRoute.revocationAcknowledged && <p>상대 제품의 연결 해제 확인을 기다리고 있습니다.</p>}</>}
            {ownerNotificationRoute.state === "active" && <p>이후 새 예약 사건은 Field가 담당합니다. 실제 문자·카카오 공급사 발송 성공은 별도 확인이 필요합니다.</p>}
            {ownerNotificationRoute.state === "suspended" && <p>고객이 향후 알림 동의를 철회했습니다. AP 경로는 자동 복구되지 않습니다.</p>}
            {routeActivationStatus && <p role="status" className="state-message">{routeActivationStatus}</p>}
          </section>}
          {deliveryStatus && <p role="status" className="state-message">{deliveryStatus}</p>}
          {eventDeliveries?.events.length === 0 && <p>아직 전달 상태가 기록된 예약 사건이 없습니다.</p>}
          {eventDeliveries?.hasEarlierEvents && <p>최근 20개 사건만 표시합니다.</p>}
          {eventDeliveries?.events.map(event => <div className="knowledge-source" key={event.eventId}>
            <h4>예약 사건 {event.revision}번 · {stateLabel(event.reservationState)}</h4>
            <p>Field 전달: {eventDeliveryLabels[event.deliveryState] ?? event.deliveryState}{event.attempts > 0 ? ` · 시도 ${event.attempts}회` : ""}</p>
            <p>AP 처리: {apProcessingLabels[event.apState] ?? event.apState}</p>
            <p>AP 고객 알림: {event.customerNotificationState === null ? "상태 확인 전" : customerNoticeLabels[event.customerNotificationState] ?? event.customerNotificationState}</p>
            <p>고객 열람: {event.customerReadState === "not_recorded" ? "열람 확인 없음" : "상태 확인 전"}</p>
            {manualContacts?.contacts.filter(contact => contact.eventId === event.eventId).map(contact =>
              <p key={contact.id}>Field 직접 연락 기록: {contact.method === "phone" ? "전화" : "대면"} · {contact.outcome === "reached" ? "고객에게 도달" : "연락 시도"} · {formatTime(contact.recordedAt, selected.timezone)}</p>)}
          </div>)}
          {manualContactStatus && <p role="status" className="state-message">{manualContactStatus}</p>}
          {manualContacts?.connectionStatus === "revoked" && <section className="knowledge-source form-fields" aria-label="연결 해제 후 직접 연락">
            <h4>AP 연결 해제 · 직접 연락 필요</h4>
            <p>기존 Field 예약과 고객 확인키는 유지됩니다. AP 고객 알림은 더 이상 이 연결로 전달되지 않습니다. 위 사건의 AP 처리·외부 발송 상태를 확인하고 필요한 경우 사업자가 고객에게 직접 연락해 주세요. 전화번호만으로 고객 통지 완료를 뜻하지 않습니다.</p>
            <p>여기에는 실제 시도 또는 도달 사실만 기록합니다. Field 문자·카카오를 보내거나 알림 소유권을 자동으로 바꾸지 않습니다.</p>
            <label>연락할 예약 사건<select value={contactEventId} onChange={event => { setContactEventId(event.target.value); setContactConfirmed(false); }}>
              {eventDeliveries?.events.map(event => <option key={event.eventId} value={event.eventId}>사건 {event.revision}번 · {stateLabel(event.reservationState)}</option>)}</select></label>
            <label>연락 방법<select value={contactMethod} onChange={event => { setContactMethod(event.target.value as "phone" | "in_person"); setContactConfirmed(false); }}><option value="phone">전화</option><option value="in_person">대면</option></select></label>
            <label>결과<select value={contactOutcome} onChange={event => { setContactOutcome(event.target.value as "attempted" | "reached"); setContactConfirmed(false); }}><option value="attempted">연락 시도 · 도달 미확인</option><option value="reached">고객에게 직접 도달</option></select></label>
            <label><input type="checkbox" checked={contactConfirmed} onChange={event => setContactConfirmed(event.target.checked)} /> 선택한 사건에 대해 실제로 표시한 직접 연락을 했습니다.</label>
            <button type="button" disabled={busy || !contactEventId || !contactConfirmed}
              onClick={() => void recordManualContact()}>직접 연락 사실 기록</button>
          </section>}
        </section>}
        {!pendingOwnerMutation && <>{selected.state === "requested" && <>{selected.bookingMode === "request" && <label>바로 확정할 시간 (현재 브라우저 시간대)<input type="datetime-local" value={confirmAt} onChange={event => setConfirmAt(event.target.value)} /></label>}<button type="button" disabled={busy || (selected.bookingMode === "request" && !confirmAt)} onClick={() => void confirm()}>사업자 최종 확정</button></>}
        {(selected.state === "requested" || selected.state === "change_requested") && <><label>고객에게 제안할 새 시간 (현재 브라우저 시간대)<input type="datetime-local" value={proposalAt} onChange={event => setProposalAt(event.target.value)} /></label><button type="button" disabled={busy || !proposalAt} onClick={() => void propose()}>새 시간 제안</button></>}
        {(selected.state === "customer_accepted" || selected.state === "change_accepted") && <button type="button" disabled={busy} onClick={() => void confirm()}>고객 수락 시간 최종 확정</button>}
        {(["confirmed", "cancel_requested", "change_requested", "change_proposed", "change_accepted"] as string[]).includes(selected.state) && <><label>취소 사유<input maxLength={500} value={actionReason} onChange={event => setActionReason(event.target.value)} /></label><button type="button" disabled={busy || !actionReason.trim()} onClick={() => void cancel()}>예약 취소·점유 해제</button></>}
        {(["requested", "proposed", "customer_accepted"] as string[]).includes(selected.state) && <><label>처리 사유<input maxLength={500} value={actionReason} onChange={event => setActionReason(event.target.value)} /></label><button type="button" disabled={busy || !actionReason.trim()} onClick={() => void decide("reject")}>요청 거절</button><button type="button" disabled={busy || !actionReason.trim()} onClick={() => void decide("expire")}>요청 만료 처리</button></>}
        {selected.state === "cancel_requested" && <button type="button" disabled={busy || !actionReason.trim()} onClick={() => void decide("decline_cancel")}>취소 요청 거절·예약 유지</button>}
        {(["change_requested", "change_proposed", "change_accepted"] as string[]).includes(selected.state) && <button type="button" disabled={busy || !actionReason.trim()} onClick={() => void decide("decline_change")}>변경 요청 거절·기존 시간 유지</button>}
        {selected.state === "confirmed" && selected.confirmedEndAt && new Date(selected.confirmedEndAt).getTime() <= Date.now() && <><label>결과 기록 사유<input maxLength={500} value={actionReason} onChange={event => setActionReason(event.target.value)} /></label><button type="button" disabled={busy || !actionReason.trim()} onClick={() => void decide("complete")}>업무 완료 기록</button><button type="button" disabled={busy || !actionReason.trim()} onClick={() => void decide("no_show")}>노쇼 수동 기록</button></>}</>}
      </div>}</div>
      <div><h3>수동 일정 차단</h3><p>전화 예약과 개인 일정이 기존 확정 예약과 겹치지 않도록 기록합니다.</p><button type="button" onClick={() => setManualDialogOpen(true)}>수동 일정 추가</button><ul>{blocks.map(item => <li key={item.id}>{item.label} · {formatTime(item.startAt, policy?.timezone ?? "Asia/Seoul")}–{formatTime(item.endAt, policy?.timezone ?? "Asia/Seoul")} <button type="button" disabled={busy} onClick={() => void removeBlock(item.id)}>해제</button></li>)}</ul>
        <form id="owner-manual-reservation" className="form-fields" onSubmit={event => void manual(event)}><h3>전화 예약 수동 등록</h3><p>사업자가 직접 확인한 전화 예약을 달력에 기록합니다. 고객 동의나 자동 알림을 기록한 것으로 표시하지 않습니다.</p><label>서비스<select required value={manualServiceId} onChange={event => setManualServiceId(event.target.value)}><option value="">서비스 선택</option>{approvedCatalog?.services.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>시간 (현재 브라우저 시간대)<input required type="datetime-local" value={manualAt} onChange={event => setManualAt(event.target.value)} /></label><label>이름<input required maxLength={80} value={manualName} onChange={event => setManualName(event.target.value)} /></label><label>연락처<input required type="tel" maxLength={30} value={manualPhone} onChange={event => setManualPhone(event.target.value)} /></label><button type="submit" disabled={busy || !approvedCatalog}>전화 예약 기록</button></form>
      </div></div>
    {manualDialogOpen && <dialog ref={manualDialogRef} className="booking-manual-dialog" onClose={() => setManualDialogOpen(false)} aria-label="수동 일정 등록"><form className="form-fields" onSubmit={event => void block(event)}><div className="booking-manual-dialog-heading"><h3>수동 일정 등록</h3><button type="button" aria-label="닫기" onClick={() => setManualDialogOpen(false)}>×</button></div><p>모든 서비스가 한 사업자의 시간을 공유합니다. 겹치는 확정 일정이 있으면 저장하지 않습니다.</p><label>일정 제목<input required maxLength={160} value={blockLabel} onChange={event => setBlockLabel(event.target.value)} placeholder="전화 예약 또는 개인 일정" /></label><label>시작 (현재 브라우저 시간대)<input required type="datetime-local" value={blockStart} onChange={event => setBlockStart(event.target.value)} /></label><label>종료 (현재 브라우저 시간대)<input required type="datetime-local" value={blockEnd} onChange={event => setBlockEnd(event.target.value)} /></label><button type="submit" disabled={busy}>일정 등록</button></form></dialog>}
  </section>;
}

export function ReservationPage({ id, initialKey }: { id: string; initialKey?: string }) {
  const [key, setKey] = useState(initialKey ?? "");
  const [issuedKey, setIssuedKey] = useState(initialKey ?? "");
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [customerMessageText, setCustomerMessageText] = useState("");
  const [pendingCustomerMessage, setPendingCustomerMessage] = useState<{ messageId: string; body: string } | null>(null);
  const [pendingMessageRecovery, setPendingMessageRecovery] = useState<PendingReservationMessage | null>(null);
  const [customerMessageBusy, setCustomerMessageBusy] = useState(false);
  const [notificationRoute, setNotificationRoute] = useState<ReservationNotificationRoute | null>(null);
  const [routeConsent, setRouteConsent] = useState(false);
  const [routeWithdrawal, setRouteWithdrawal] = useState(false);
  const pendingRouteConsent = useRef<string | null>(null);
  const pendingRouteWithdrawal = useRef<string | null>(null);
  const [review, setReview] = useState<{ expectedRevision: number; previousCatalogRevision: number;
    currentCatalogRevision: number; previousService: Service; services: Service[] } | null>(null);
  const [reviewServiceId, setReviewServiceId] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [reviewSlots, setReviewSlots] = useState<{ startAt: string }[]>([]);
  const [reviewStartAt, setReviewStartAt] = useState("");
  const [reviewPreferred, setReviewPreferred] = useState("");
  const [reviewConsent, setReviewConsent] = useState(false);
  const [changePreferred, setChangePreferred] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingCustomerMutation, setPendingCustomerMutation] = useState<CustomerMutationAttempt | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (readPendingReservationMessage(id)) return;
    const handoffKey = consumeReceiptHandoff("reservation", id);
    if (!handoffKey) return;
    let active = true;
    setKey(handoffKey); setBusy(true);
    void (async () => {
      try {
        const opened = await requestJson(`/v1/reservations/${id}`, "GET", undefined, handoffKey);
        if (!active) return;
        if (opened.status !== 200) {
          setStatus("예약 요청이 접수됐지만 상태를 자동으로 열지 못했습니다. 위 확인키로 다시 열어 주세요.");
          return;
        }
        const value = opened.data as Reservation;
        setReservation(value);
        const reviewed = await requestJson(`/v1/reservations/${id}/catalog-review`, "GET", undefined, handoffKey);
        if (!active) return;
        if (reviewed.status === 200) {
          const next = reviewed.data as NonNullable<typeof review>;
          setReview(next);
          setReviewServiceId(next.services.some(service => service.id === value.service.id) ? value.service.id : "");
          setReviewPreferred(value.preferredTimeText ?? "");
        }
        if (value.source === "external_ap") {
          const route = await requestJson(`/v1/reservations/${id}/notification-route`, "GET", undefined, handoffKey);
          if (!active) return;
          if (route.status === 200) setNotificationRoute(route.data as ReservationNotificationRoute);
          else setStatus("예약은 열렸지만 알림 담당 경로는 확인하지 못했습니다. 다시 조회해 주세요.");
        }
      } catch { if (active) setStatus("예약 상태를 자동으로 열지 못했습니다. 위 확인키로 다시 열어 주세요."); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    const attempt = readPendingReservationMessage(id);
    if (!attempt) return;
    setKey(attempt.receiptKey);
    setPendingMessageRecovery(attempt);
    void recoverReservationMessage(attempt);
  }, [id]);
  async function recoverReservationMessage(attempt: PendingReservationMessage) {
    setCustomerMessageBusy(true);
    try {
      const result = await requestJson(`/v1/reservations/${id}`, "GET", undefined, attempt.receiptKey);
      if (result.status !== 200) {
        setStatus(`이전 추가 메시지 결과를 확인하지 못했습니다 (${result.status}). 다시 조회하거나 같은 내용을 재입력해 주세요.`);
        return;
      }
      const value = result.data as Reservation;
      setReservation(value);
      if (!value.messages?.some(message => message.id === attempt.messageId)) {
        setStatus("이전 추가 메시지는 아직 예약 대화에 없습니다. 같은 내용을 입력하면 같은 메시지 ID로 재시도합니다.");
        return;
      }
      clearPendingReservationMessage(id);
      setPendingMessageRecovery(null); setPendingCustomerMessage(null); setCustomerMessageText("");
      setStatus("새로고침 전 저장된 추가 메시지를 Field 예약 대화에서 확인했습니다.");
    } catch { setStatus("이전 추가 메시지 결과를 확인하지 못했습니다. 다시 조회해 주세요."); }
    finally { setCustomerMessageBusy(false); }
  }
  function clearPhotoSelection() {
    setPhotos([]);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }
  async function attachPhotos(selected: File[]) {
    let completed = 0;
    let notice = `사진 ${selected.length}건의 첨부 요청을 확인했습니다. 동일한 내용은 한 장으로 비공개 저장됩니다.`;
    for (let index = 0; index < selected.length; index++) {
      try {
        const uploaded = await uploadBookingPhoto(id, key, selected[index]!);
        if (uploaded !== 201 && uploaded !== 200) {
          notice = uploaded === 429
            ? "이 예약에는 사진을 최대 5장까지 첨부할 수 있습니다. 기존 사진을 확인해 주세요."
            : `예약은 저장됐지만 사진 ${index + 1}/${selected.length} 첨부에 실패했습니다 (${uploaded}). 남은 사진을 다시 시도할 수 있습니다.`;
          break;
        }
        completed++;
        setPhotos(selected.slice(index + 1));
      } catch {
        notice = `사진 ${index + 1}/${selected.length} 업로드 응답을 받지 못했습니다. 같은 사진을 다시 첨부하면 기존 저장 건을 확인합니다.`;
        break;
      }
    }
    if (completed === selected.length) clearPhotoSelection();
    setStatus(notice);
    if (completed === 0) return;
    try {
      const refreshed = await requestJson(`/v1/reservations/${id}`, "GET", undefined, key);
      if (refreshed.status === 200) setReservation(refreshed.data as Reservation);
      else setStatus(`${notice} 사진 목록은 다시 확인해 주세요 (${refreshed.status}).`);
    } catch { setStatus(`${notice} 사진 목록은 다시 확인해 주세요.`); }
  }
  async function retryPhotos() {
    if (!reservation || photos.length === 0) return;
    setBusy(true);
    await attachPhotos(photos);
    setBusy(false);
  }
  async function sendCustomerReservationMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reservation || reservation.source !== "public") return;
    const body = pendingCustomerMessage?.body ?? customerMessageText.trim();
    const fingerprint = await messageSubmissionFingerprint({ id, key, body });
    if (pendingMessageRecovery && (pendingMessageRecovery.receiptKey !== key
      || pendingMessageRecovery.fingerprint !== fingerprint)) {
      setStatus("이전 추가 메시지 결과가 확인되지 않았습니다. 같은 내용을 입력해 재시도하거나 이전 결과를 확인해 주세요.");
      return;
    }
    const attempt = pendingCustomerMessage ?? {
      messageId: pendingMessageRecovery?.messageId ?? crypto.randomUUID(), body };
    if (!attempt.body) return;
    const recovery = pendingMessageRecovery ?? (fingerprint ? {
      reservationId: id, receiptKey: key, messageId: attempt.messageId,
      fingerprint, createdAt: Date.now(),
    } : null);
    if (recovery) { setPendingMessageRecovery(recovery); writePendingReservationMessage(recovery); }
    setPendingCustomerMessage(attempt); setCustomerMessageBusy(true);
    setStatus("예약 추가 메시지를 Field에 저장하고 있습니다.");
    try {
      const sent = await requestJson(`/v1/reservations/${id}/messages`, "POST", attempt, key);
      if (sent.status !== 201 && sent.status !== 200) {
        setStatus(`추가 메시지 저장 결과를 확인하지 못했습니다 (${sent.status}). 같은 요청으로 다시 확인해 주세요.`);
        setCustomerMessageBusy(false);
        return;
      }
      setStatus("추가 메시지가 Field에 저장됐습니다. 대화 기록을 확인하고 있습니다.");
    } catch { setStatus("추가 메시지 응답을 받지 못했습니다. 같은 요청으로 다시 확인하면 중복 저장하지 않습니다."); }
    try {
      const fresh = await requestJson(`/v1/reservations/${id}`, "GET", undefined, key);
      if (fresh.status !== 200) return;
      const value = fresh.data as Reservation;
      setReservation(value);
      if (!value.messages?.some(message => message.id === attempt.messageId)) return;
      clearPendingReservationMessage(id);
      setPendingMessageRecovery(null); setPendingCustomerMessage(null); setCustomerMessageText("");
      setStatus("추가 메시지가 Field 예약 대화에 저장됐습니다. 사업자 내부 알림은 기록됐습니다.");
    } catch { /* 결과 미상: 같은 메시지 ID로 재시도한다. */ }
    finally { setCustomerMessageBusy(false); }
  }
  async function loadNotificationRoute(value: Reservation) {
    if (value.source !== "external_ap") { setNotificationRoute(null); return; }
    const result = await requestJson(`/v1/reservations/${id}/notification-route`, "GET", undefined, key);
    if (result.status === 200) setNotificationRoute(result.data as NonNullable<typeof notificationRoute>);
    else { setNotificationRoute(null); setStatus("알림 담당 경로를 확인하지 못했습니다. 예약은 열렸지만 알림 전환 상태는 확인이 필요합니다."); }
  }
  async function changeNotificationRoute(kind: "consent" | "withdraw") {
    if (!reservation || !notificationRoute) return;
    const pending = kind === "consent" ? pendingRouteConsent : pendingRouteWithdrawal;
    pending.current ??= crypto.randomUUID();
    setBusy(true); setStatus("알림 경로 요청을 확인하고 있습니다.");
    try {
      const result = await requestJson(`/v1/reservations/${id}/notification-route/${kind}`, "POST",
        kind === "consent" ? { consentId: pending.current, consent: true }
          : { withdrawalId: pending.current, confirm: true }, key);
      if (result.status === 200 || result.status === 201) {
        setNotificationRoute(result.data as NonNullable<typeof notificationRoute>);
        pending.current = null; setRouteConsent(false); setRouteWithdrawal(false);
        setStatus(kind === "consent"
          ? "향후 Field 알림 담당 변경에 동의했습니다. 사업자의 대조와 전환 전까지는 적용되지 않습니다."
          : "향후 Field 자동 알림 동의를 철회했습니다. 예약 확인과 직접 연락은 유지됩니다.");
      } else if (result.status === 409) {
        setStatus("알림 경로 상태가 바뀌었습니다. 예약을 다시 열어 최신 상태를 확인해 주세요.");
      } else setStatus(`알림 경로 요청을 저장하지 못했습니다 (${result.status}).`);
    } catch { setStatus("알림 경로 요청 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도하거나 예약을 다시 열어 확인해 주세요."); }
    finally { setBusy(false); }
  }
  async function loadCatalogReview(value: Reservation) {
    const result = await requestJson(`/v1/reservations/${id}/catalog-review`, "GET", undefined, key);
    if (result.status === 200) {
      const next = result.data as NonNullable<typeof review>;
      setReview(next);
      setReviewServiceId(next.services.some(service => service.id === value.service.id) ? value.service.id : "");
      setReviewPreferred(value.preferredTimeText ?? "");
      setReviewSlots([]); setReviewStartAt(""); setReviewConsent(false);
    } else setReview(null);
  }
  async function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const result = await requestJson(`/v1/reservations/${id}`, "GET", undefined, key);
      if (result.status === 200) {
        const value = result.data as Reservation;
        setReservation(value); await loadCatalogReview(value); await loadNotificationRoute(value);
      } else {
        setReservation(null); setReview(null); setNotificationRoute(null);
        setStatus(result.status === 429
          ? "확인키 입력이 여러 번 실패했습니다. 잠시 뒤 다시 시도해 주세요."
          : "확인키가 맞지 않거나 예약을 열 수 없습니다.");
      }
    } catch { setStatus("예약 상태를 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function reconcileCustomerMutation(attempt: CustomerMutationAttempt) {
    setBusy(true); setStatus(`${attempt.label} 결과를 예약 기록에서 확인하고 있습니다.`);
    try {
      const result = await requestJson(`/v1/reservations/${id}`, "GET", undefined, key);
      if (result.status !== 200) {
        setStatus(`요청 결과를 확인할 수 없습니다 (${result.status}). 예약 요청 결과 확인을 다시 눌러 주세요.`);
        return;
      }
      const current = result.data as Reservation;
      if (!Array.isArray(current.events)) {
        setStatus("요청 결과를 확인할 수 없습니다. 예약 처리 기록을 다시 조회해 주세요.");
        return;
      }
      const recorded = current.events.some(event => event.revision === attempt.expectedRevision + 1
        && event.actorType === "customer" && event.eventType === attempt.eventType
        && Object.entries(attempt.detail).every(([name, value]) => event.detail[name] === value)
        && (!attempt.catalogReview || (current.revision === attempt.expectedRevision + 1
          && (event.detail.service as { id?: unknown } | undefined)?.id === attempt.catalogReview.serviceId
          && current.service.id === attempt.catalogReview.serviceId
          && current.requestedStartAt === (attempt.catalogReview.startAt ?? null)
          && current.preferredTimeText === (attempt.catalogReview.preferredTimeText ?? null))));
      setReservation(current);
      setPendingCustomerMutation(null);
      if (recorded || current.revision !== attempt.expectedRevision) {
        try { await loadCatalogReview(current); } catch { setReview(null); }
      }
      if (recorded) {
        setChangePreferred(""); setCancelReason("");
        setStatus(`${attempt.label} 처리가 예약 기록에서 확인됐습니다. 외부 알림 발송은 별도 상태에서 확인해 주세요.`);
      } else if (current.revision === attempt.expectedRevision)
        setStatus(`${attempt.label} 처리가 아직 예약 기록에 없습니다. 내용을 확인한 뒤 다시 요청할 수 있습니다.`);
      else setStatus("예약에 다른 변경이 반영됐습니다. 최신 상태와 처리 기록을 확인한 뒤 다시 선택해 주세요.");
    } catch { setStatus("요청 결과를 확인할 수 없습니다. 예약 요청 결과 확인을 다시 눌러 주세요."); }
    finally { setBusy(false); }
  }
  async function action(path: string, extra: Record<string, unknown>, success: string) {
    if (!reservation) return;
    const attempt: CustomerMutationAttempt = {
      expectedRevision: reservation.revision,
      eventType: path === "accept-proposal" ? "field.reservation.proposal_accepted"
        : path === "change-request" ? "field.reservation.change_requested" : "field.reservation.cancel_requested",
      detail: path === "accept-proposal" ? { proposalStartAt: reservation.proposalStartAt ?? "" }
        : path === "change-request" ? { preferredTimeText: String(extra.preferredTimeText).trim() }
          : { reason: String(extra.reason).trim() },
      label: path === "accept-proposal" ? "제안 수락" : path === "change-request" ? "시간 변경 요청" : "취소 요청",
    };
    setBusy(true); setStatus("예약 상태를 갱신하고 있습니다.");
    try {
      const result = await requestJson(`/v1/reservations/${id}/${path}`, "POST", { expectedRevision: attempt.expectedRevision, ...extra }, key);
      if (result.status === 200) {
        const acknowledged = result.data as Reservation;
        setReservation({ ...acknowledged, businessName: reservation.businessName }); setStatus(success); setChangePreferred(""); setCancelReason("");
        try {
          const fresh = await requestJson(`/v1/reservations/${id}`, "GET", undefined, key);
          if (fresh.status === 200) {
            const current = fresh.data as Reservation;
            setReservation(current);
            await loadCatalogReview(current);
          } else setStatus(`${success} 예약 기록 조회는 나중에 다시 열어 확인해 주세요.`);
        } catch { setStatus(`${success} 예약 기록 조회는 나중에 다시 열어 확인해 주세요.`); }
      }
      else if (result.status === 409) setStatus("예약 상태가 바뀌었습니다. 확인키로 다시 열어 최신 상태를 확인해 주세요.");
      else setStatus(`처리하지 못했습니다 (${result.status}).`);
    } catch {
      setPendingCustomerMutation(attempt);
      await reconcileCustomerMutation(attempt);
    }
    finally { setBusy(false); }
  }
  async function loadReviewSlots() {
    if (!reservation || !reviewDate || !reviewServiceId) return;
    setBusy(true); setStatus("변경된 서비스의 가능한 시간을 확인하고 있습니다.");
    try {
      const result = await requestJson(`/v1/public/catalog/${reservation.organizationId}/availability?serviceId=${reviewServiceId}&date=${reviewDate}`);
      if (result.status === 200) { setReviewSlots((result.data as { slots: { startAt: string }[] }).slots); setReviewStartAt(""); setStatus(""); }
      else setStatus("가능한 시간을 불러오지 못했습니다. 날짜와 예약 정책을 확인해 주세요.");
    } catch { setStatus("가능한 시간을 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function acceptCatalogReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reservation || !review || !reviewServiceId || !reviewConsent) return;
    const service = review.services.find(item => item.id === reviewServiceId);
    if (!service) return;
    const attempt: CustomerMutationAttempt = {
      expectedRevision: reservation.revision, eventType: "field.reservation.catalog_reviewed",
      detail: { previousCatalogRevision: review.previousCatalogRevision,
        catalogRevision: review.currentCatalogRevision }, label: "조건 재확인",
      catalogReview: { serviceId: reviewServiceId,
        ...(service.bookingMode === "slot" ? { startAt: reviewStartAt }
          : { preferredTimeText: reviewPreferred.trim() }) },
    };
    setBusy(true); setStatus("변경된 서비스 조건을 다시 제출하고 있습니다.");
    try {
      const result = await requestJson(`/v1/reservations/${id}/review-catalog`, "POST", {
        expectedRevision: attempt.expectedRevision, expectedCatalogRevision: review.currentCatalogRevision,
        serviceId: reviewServiceId, consent: true,
        ...(service.bookingMode === "slot" ? { startAt: reviewStartAt } : { preferredTimeText: reviewPreferred }),
      }, key);
      if (result.status === 200) {
        setReservation({ ...(result.data as Reservation), businessName: reservation.businessName });
        setReview(null); setStatus("변경된 조건을 확인하고 다시 제출했습니다. 사업자가 시간을 재확정해야 합니다.");
        try {
          const fresh = await requestJson(`/v1/reservations/${id}`, "GET", undefined, key);
          if (fresh.status === 200) setReservation(fresh.data as Reservation);
          else setStatus("변경된 조건을 다시 제출했습니다. 예약 기록 조회는 나중에 다시 열어 확인해 주세요.");
        } catch { setStatus("변경된 조건을 다시 제출했습니다. 예약 기록 조회는 나중에 다시 열어 확인해 주세요."); }
      } else if (result.status === 409) setStatus("카탈로그나 예약 상태·시간이 다시 바뀌었습니다. 확인키로 최신 상태를 다시 열어 주세요.");
      else setStatus(`조건을 다시 제출하지 못했습니다 (${result.status}).`);
    } catch {
      setPendingCustomerMutation(attempt);
      await reconcileCustomerMutation(attempt);
    }
    finally { setBusy(false); }
  }
  const selectedReviewService = review?.services.find(service => service.id === reviewServiceId);
  return <div className="site-shell field-reservation-shell"><header className="field-public-header">{reservation?.businessName
    ? <><div><strong>{reservation.businessName}</strong><p>{reservation.service.name} · 비회원 예약</p></div><a href={`/public/${reservation.organizationId}`}>사업 정보 보기</a></>
    : <><a href="/"><Brand product="Field" /></a><span>비회원 예약</span></>}</header><main className="field-reservation-main">
    {!reservation && <div className="field-reservation-entry"><h1>내 예약 상태</h1><p>접수 때 받은 확인키로 엽니다. 전화번호나 알림 링크만으로는 열 수 없습니다.</p></div>}
    {status && <p role="status" className="state-message">{status}</p>}
    {pendingCustomerMutation && <div className="state-message" role="alert"><p>이 예약의 요청 결과를 아직 확인하지 못했습니다. 예약 기록을 다시 읽을 때까지 추가 요청을 보류합니다.</p><button type="button" disabled={busy} onClick={() => void reconcileCustomerMutation(pendingCustomerMutation)}>예약 요청 결과 확인</button></div>}
    {pendingMessageRecovery && <div className="state-message field-reservation-message-recovery" role="alert"><p>이전 추가 메시지의 저장 결과를 확인 중입니다. 다른 내용으로 새 메시지를 보내기 전에 원본을 확인해 주세요.</p><button type="button" disabled={customerMessageBusy} onClick={() => void recoverReservationMessage(pendingMessageRecovery)}>이전 메시지 결과 조회</button><button type="button" disabled={customerMessageBusy} onClick={() => { clearPendingReservationMessage(id); setPendingMessageRecovery(null); setPendingCustomerMessage(null); setCustomerMessageText(""); setStatus("이전 시도를 포기했습니다. 이미 저장됐을 수 있으므로 대화를 확인한 뒤 새 메시지를 보내 주세요."); }}>이전 시도 포기</button></div>}
    {reservation && <section className="field-conversation-card field-reservation-card"><header className="field-conversation-title"><div><h1>{reservation.businessName ? `${reservation.businessName}와의 대화` : `${reservation.service.name} 예약 대화`}</h1><p>{reservation.id} · 연락처 미인증</p></div><span>{stateLabel(reservation.state)}</span></header>
      <div className="field-reservation-summary"><p className="field-reservation-summary-kicker">예약 요청 현황</p><h2>{reservation.service.name}</h2><dl><div><dt>요청 시간</dt><dd>{reservation.requestedStartAt ? formatTime(reservation.requestedStartAt, reservation.timezone) : reservation.preferredTimeText || "사업자와 시간 조율"}</dd></div><div><dt>접수 가격</dt><dd>{reservation.service.priceAmount === null ? "가격 미정" : `${reservation.service.priceAmount.toLocaleString("ko-KR")}원`}</dd></div>{reservation.confirmedStartAt && <div><dt>확정 시간</dt><dd>{formatTime(reservation.confirmedStartAt, reservation.timezone)}</dd></div>}</dl>
        {reservation.proposalStartAt && ["proposed", "customer_accepted", "change_proposed", "change_accepted"].includes(reservation.state) && <div className="field-reservation-proposal"><p>사업자가 제안한 시간</p><strong>{formatTime(reservation.proposalStartAt, reservation.timezone)}</strong>{reservation.proposalAcceptedAt && <span>고객 수락 기록됨 · 사업자 최종 확인 전</span>}</div>}
        {review && <div className="field-reservation-review-alert"><strong>서비스 조건이 변경됐습니다.</strong><p>새 가격·서비스·시간을 검토한 뒤 다시 신청해야 합니다. 현재 요청이 자동 확정되지는 않습니다.</p><button type="button" onClick={() => { toolsRef.current?.setAttribute("open", ""); document.getElementById("field-reservation-review")?.scrollIntoView({ block: "start" }); }}>변경 조건 확인</button></div>}
        {!pendingCustomerMutation && !review && (reservation.state === "proposed" || reservation.state === "change_proposed") && <button className="field-reservation-primary" type="button" disabled={busy} onClick={() => void action("accept-proposal", {}, "제안 시간을 수락했습니다. 사업자의 최종 승인 전에는 확정되지 않습니다.")}>제안 시간 동의</button>}
        {["requested", "proposed", "customer_accepted"].includes(reservation.state) && <p className="field-reservation-unconfirmed">고객의 신청·제안 동의만으로 예약이 확정되지는 않습니다.</p>}
      </div>
      <div className="field-reservation-log"><h2>요청과 처리 기록</h2>{reservation.requestMessage && <div className="field-reservation-event customer"><span>나 · 요청 내용</span><p>{reservation.requestMessage}</p></div>}{reservation.events?.map(event => <div className={`field-reservation-event ${event.actorType}`} key={event.revision}><span>{event.actorType === "owner" ? "사업자" : "나"} · {formatTime(event.occurredAt, reservation.timezone)}</span><p>{stateLabel(event.nextState)}</p></div>)}{!reservation.events && <p>처리 기록을 다시 확인해 주세요.</p>}</div>
      <FieldRetentionNotice retention={reservation.retention} />
      {reservation.source === "public" && <><div className="field-reservation-message-log"><h2>추가 대화</h2>{reservation.messages?.length ? reservation.messages.map(message => <div className={`field-reservation-event ${message.sender}`} key={message.id}><span>{message.sender === "owner" ? "사업자" : "나"} · {formatTime(message.createdAt, reservation.timezone)}</span><p>{message.body}</p>{message.sender === "owner" && <small>{message.notificationState === "blocked_integration" ? "Field에서 열람 가능 · 외부 알림 미발송" : "외부 알림 상태는 별도 확인"}</small>}</div>) : <p>아직 추가 메시지가 없습니다.</p>}</div>
        {!reservation.retention?.workPurgedAt && <form className="field-reservation-composer" onSubmit={event => void sendCustomerReservationMessage(event)}><label>예약 추가 메시지<input required maxLength={5000} value={pendingCustomerMessage ? pendingCustomerMessage.body : customerMessageText} readOnly={Boolean(pendingCustomerMessage)} onChange={event => setCustomerMessageText(event.target.value)} placeholder="추가 내용을 남겨주세요" /></label><button type="submit" disabled={customerMessageBusy || busy || Boolean(pendingCustomerMutation) || (!pendingCustomerMessage && !customerMessageText.trim())}>{pendingCustomerMessage ? "결과 확인·재시도" : "보내기"}</button></form>}</>}
      {reservation.source === "external_ap" && <p className="field-reservation-external-thread">연결된 AP 대화의 원문은 AP에서 이어집니다. 이 화면은 Field 예약 상태만 보여 줍니다.</p>}
      <p className="field-conversation-foot">예약 상태는 Field 원본 기록입니다. 내부 메모와 미확인 외부 알림은 고객 대화로 표시하지 않습니다.</p>
    </section>}
    <details key={reservation ? "loaded" : "entry"} ref={toolsRef} className="field-reservation-tools" open={!reservation}><summary>{reservation ? "확인키·사진·변경·취소 관리" : "확인키로 예약 열기"}</summary><section className="special-panel">{issuedKey && <div className="customer-banner"><strong>Field 예약 확인키</strong><p>지금 이 키를 보관하세요. AP가 중단돼도 Field에서 이 예약을 열 수 있습니다. 새 코드를 교환하면 이전 Field 키는 폐기됩니다.</p><code>{issuedKey}</code><p><a href={`/reservation/${id}`}>나중에 Field 예약 열기</a></p></div>}<form className="form-fields field-reservation-key-form" onSubmit={event => void open(event)}><label>예약 확인키<input required value={key} disabled={Boolean(pendingCustomerMessage || pendingMessageRecovery)} onChange={event => { setKey(event.target.value); setIssuedKey(""); setReservation(null); setNotificationRoute(null); setReview(null); setPendingCustomerMutation(null); clearPhotoSelection(); }} /></label><button type="submit" disabled={busy || !!pendingCustomerMutation || !!pendingCustomerMessage || !!pendingMessageRecovery}>예약 열기</button></form>
      {reservation && <div className="form-fields"><h2>{reservation.service.name} · {stateLabel(reservation.state)}</h2>{!pendingCustomerMutation && !pendingCustomerMessage && !pendingMessageRecovery && <ReceiptRotationPanel path={`/v1/reservations/${id}/receipt-key/rotate`} label="예약" currentKey={key} onRotated={nextKey => { setKey(nextKey); setIssuedKey(nextKey); setReservation(null); setNotificationRoute(null); setReview(null); setPendingCustomerMutation(null); clearPhotoSelection(); setStatus("새 확인키로 예약을 다시 열어 최신 상태를 확인해 주세요."); }} />}<p>접수 가격: {reservation.service.priceAmount === null ? "미정" : `${reservation.service.priceAmount.toLocaleString("ko-KR")}원`}</p><p>요청: {reservation.requestedStartAt ? formatTime(reservation.requestedStartAt, reservation.timezone) : reservation.preferredTimeText}</p>{reservation.requestMessage && <p>내 요청 내용: {reservation.requestMessage}</p>}{reservation.visitRegion && <p>지역·이용 장소: {reservation.visitRegion}</p>}<p>{["canceled", "completed", "no_show"].includes(reservation.state) ? "기존 확정 시간" : "확정"}: {reservation.confirmedStartAt ? formatTime(reservation.confirmedStartAt, reservation.timezone) : "사업자 확인 전"}</p>
        <div className="knowledge-source"><h3>예약 사진</h3>{reservation.attachments ? (reservation.attachments.length ? reservation.attachments.map((attachment, index) => <PrivateReservationPhoto key={attachment.id} reservationId={id} attachmentId={attachment.id} receiptKey={key} label={`예약 첨부 사진 ${index + 1}`} />) : <p>첨부된 사진이 없습니다.</p>) : <p>사진 목록을 다시 확인해 주세요.</p>}<label className="inquiry-photo-label">사진 추가 (최대 5장, 장당 8MB)<input ref={photoInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy || Boolean(reservation.retention?.workPurgedAt)} onChange={event => {
          const result = selectedBookingPhotos(event.currentTarget.files);
          if (result.error) { event.currentTarget.value = ""; setStatus(result.error); return; }
          setPhotos(result.selected); setStatus("");
        }} /></label>{photos.length > 0 && <><p>남은 사진 {photos.length}장 선택됨. 예약에 비공개로 첨부합니다.</p><SelectedBookingPhotos photos={photos} /><button type="button" disabled={busy} onClick={() => void retryPhotos()}>사진 첨부 또는 재시도</button></>}</div>
        {reservation.source === "external_ap" && notificationRoute && <section className="customer-banner" aria-label="예약 알림 담당 경로"><h3>이 예약의 향후 처리 알림</h3>
          {notificationRoute.connectionStatus !== "revoked" && <p>현재 AP 연결 경로가 담당합니다. Field 예약 확인은 이 화면에서 계속할 수 있습니다.</p>}
          {notificationRoute.connectionStatus === "revoked" && notificationRoute.state === "awaiting_consent" && <><p>AP 연결이 해제됐습니다. 이후 예약 처리 알림을 Field가 담당하도록 신청할 수 있습니다. 이미 발생한 알림은 다시 보내지 않으며, 동의만으로 전환되거나 문자가 발송되지는 않습니다.</p><label><input type="checkbox" checked={routeConsent} onChange={event => setRouteConsent(event.target.checked)} /> 이 예약의 향후 처리 알림 담당을 Field로 변경하는 데 동의합니다.</label><button type="button" disabled={busy || !routeConsent} onClick={() => void changeNotificationRoute("consent")}>향후 Field 알림 경로 동의</button></>}
          {notificationRoute.state === "consented" && <><p>고객 동의를 저장했습니다. {notificationRoute.transferPending ? "이전 AP 사건의 종료 결과를 대조하는 중입니다." : "사업자가 이전 AP 사건과 알림 상태를 대조한 뒤 전환해야 합니다."} 그전에는 Field가 고객 알림을 발송하지 않습니다.</p><label><input type="checkbox" checked={routeWithdrawal} onChange={event => setRouteWithdrawal(event.target.checked)} /> 전환 대기 동의를 철회합니다.</label><button type="button" disabled={busy || !routeWithdrawal} onClick={() => void changeNotificationRoute("withdraw")}>동의 철회</button></>}
          {notificationRoute.state === "active" && <><p>이후 새 예약 사건은 Field가 알림을 담당합니다. 외부 문자·카카오의 발송 여부는 별도 알림 상태에서 확인해야 합니다.</p><label><input type="checkbox" checked={routeWithdrawal} onChange={event => setRouteWithdrawal(event.target.checked)} /> 향후 Field 자동 알림 동의를 철회합니다.</label><button type="button" disabled={busy || !routeWithdrawal} onClick={() => void changeNotificationRoute("withdraw")}>향후 알림 동의 철회</button></>}
          {notificationRoute.state === "withdrawn" && <><p>Field 알림 담당 동의를 철회했습니다. 예약 확인은 유지되고 사업자가 필요한 경우 직접 연락합니다.</p><label><input type="checkbox" checked={routeConsent} onChange={event => setRouteConsent(event.target.checked)} /> 이 예약의 향후 처리 알림 담당을 Field로 다시 신청합니다.</label><button type="button" disabled={busy || !routeConsent} onClick={() => void changeNotificationRoute("consent")}>다시 동의</button></>}
          {notificationRoute.state === "suspended" && <p>향후 Field 자동 알림을 중지했습니다. AP 경로가 자동 복구되지는 않습니다. 사업자에게 직접 연락해 주세요.</p>}
        </section>}
        {reservation.changePreferredText && <p>변경 희망: {reservation.changePreferredText}</p>}
        {reservation.proposalStartAt && <p>사업자 제안: {formatTime(reservation.proposalStartAt, reservation.timezone)} {reservation.proposalAcceptedAt ? "· 수락 기록됨" : "· 수락 전"}</p>}
        {reservation.events && <details><summary>예약 처리 기록 {reservation.events.length}건</summary><ol>{reservation.events.map(event => <li key={event.revision}>{formatTime(event.occurredAt, reservation.timezone)} · {event.actorType === "owner" ? "사업자" : "고객"} · {stateLabel(event.nextState)}{typeof event.detail.reason === "string" ? ` · ${event.detail.reason}` : ""}</li>)}</ol></details>}
        {review && !pendingCustomerMutation && <form id="field-reservation-review" className="form-fields" onSubmit={event => void acceptCatalogReview(event)}><h3>서비스 조건 변경 재확인</h3><p>신청 당시 카탈로그 {review.previousCatalogRevision}번에서 승인된 {review.currentCatalogRevision}번으로 변경됐습니다. 기존 신청은 바로 확정되지 않습니다.</p><p>이전: {review.previousService.name} · {review.previousService.durationMinutes}분 · {review.previousService.priceAmount === null ? "가격 미정" : `${review.previousService.priceAmount.toLocaleString("ko-KR")}원`}</p><label>최신 서비스<select required value={reviewServiceId} onChange={event => { setReviewServiceId(event.target.value); setReviewSlots([]); setReviewStartAt(""); }}><option value="">서비스 선택</option>{review.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>{selectedReviewService && <p>새 조건: {selectedReviewService.description || "별도 설명 없음"} · {selectedReviewService.durationMinutes}분 · {selectedReviewService.priceAmount === null ? "가격 미정" : `${selectedReviewService.priceAmount.toLocaleString("ko-KR")}원`} · {selectedReviewService.bookingMode === "slot" ? "시간표 선택" : "희망 시간 제출"}</p>}{selectedReviewService?.bookingMode === "slot" && <><label>새 날짜<input type="date" required value={reviewDate} onChange={event => { setReviewDate(event.target.value); setReviewSlots([]); setReviewStartAt(""); }} /></label><button type="button" disabled={busy || !reviewDate} onClick={() => void loadReviewSlots()}>가능한 시간 보기</button><label>새 시간<select required value={reviewStartAt} onChange={event => setReviewStartAt(event.target.value)}><option value="">시간 선택</option>{reviewSlots.map(slot => <option key={slot.startAt} value={slot.startAt}>{formatTime(slot.startAt, reservation.timezone)}</option>)}</select></label></>}{selectedReviewService?.bookingMode === "request" && <label>희망 시간<textarea required maxLength={500} value={reviewPreferred} onChange={event => setReviewPreferred(event.target.value)} /></label>}<label><input type="checkbox" required checked={reviewConsent} onChange={event => setReviewConsent(event.target.checked)} /> 변경된 서비스·가격·소요 시간과 예약 방식을 확인하고 다시 신청합니다.</label><button type="submit" disabled={busy || !selectedReviewService || !reviewConsent || (selectedReviewService.bookingMode === "slot" ? !reviewStartAt : !reviewPreferred.trim())}>변경 조건 동의·다시 제출</button></form>}
        {!pendingCustomerMutation && reservation.state === "confirmed" && <><label>새 희망 시간<textarea required maxLength={500} value={changePreferred} onChange={event => setChangePreferred(event.target.value)} /></label><button type="button" disabled={busy || !changePreferred.trim()} onClick={() => void action("change-request", { preferredTimeText: changePreferred }, "변경 요청을 저장했습니다. 기존 확정 시간은 사업자 승인 전까지 유지됩니다.")}>시간 변경 요청</button></>}
        {(["requested", "proposed", "customer_accepted", "confirmed", "change_requested", "change_proposed", "change_accepted"] as string[]).includes(reservation.state) && !pendingCustomerMutation && <><label>{reservation.confirmedStartAt ? "취소 요청 사유" : "신청 철회 사유"}<textarea required maxLength={500} value={cancelReason} onChange={event => setCancelReason(event.target.value)} /></label><button type="button" disabled={busy || !cancelReason.trim()} onClick={() => void action("cancel-request", { reason: cancelReason }, reservation.confirmedStartAt ? "취소 요청을 저장했습니다. 사업자 승인 전까지 기존 시간이 유지됩니다." : "예약 신청을 철회했습니다.")}>{reservation.confirmedStartAt ? "취소 요청" : "신청 철회"}</button></>}
      </div>}
    </section></details></main></div>;
}
