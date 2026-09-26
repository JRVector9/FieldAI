"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { requestJson, type Catalog, type DraftCatalog, type DraftService, type FallbackCandidate, type Inquiry, type Reservation, type ReservationListPage, type Service } from "./field-api";
import { FieldFallbackReview } from "./FieldFallbackReview";
import { FieldReceivedWorkRecord } from "./FieldReceivedWorkRecord";
import { FieldRetentionNotice } from "./FieldRetentionNotice";
import type { ReceivedWorkRecord, WorkRetention } from "./field-api";
import { OwnerBookingPanel } from "./field-booking";
import { OwnerReservationInboxThread } from "./field-owner-reservation-inbox";
import { PrivateInquiryPhoto } from "./private-inquiry-photo";
import { ExternalRequestPhotos } from "./external-request-photos";
import { inquiryDeliveryLabel } from "./field-notification-label";

type Phase = "loading" | "failed" | "auth" | "organization" | "catalog";
type OwnerNotification = { id: string; organizationId: string; targetId: string;
  targetKind: "inquiry" | "reservation" | "external_request" | "moderation_report";
  eventType: string; createdAt: string; readAt: string | null };
type ExternalInquiry = { id: string; service: Service; customerName: string; customerPhone: string;
  retention?: WorkRetention;
  customerVerified: boolean; summary: string; status: "requested"; receivedAt: string; isTest: boolean;
  receivedRecord?: ReceivedWorkRecord | null; fieldWorkState: "open" | "closed"; fieldWorkRevision: number; closedAt: string | null };
type OwnerInquirySummary = { id: string; state: string; customer_name: string;
  service_snapshot: Service; is_test: boolean; test_site_revision: number | null;
  created_at: string; updated_at: string };
type TodayCalendar = { timezone: string; reservations: Reservation[];
  blocks: { id: string; label: string; startAt: string; endAt: string }[] };
type ApConversation = { id: string; state: string; revision: number; deploymentId: string };
type ApMessage = { id: string; sequence: string; actor: "customer" | "owner"; body: string; createdAt: string };
type ApReplyDraft = { body: string; expectedRevision: number;
  state: "pending" | "delivery_unknown" | "revision_conflict" };
const notificationLabels: Record<string, string> = {
  "field.moderation.review": "사업 안내 신고 검토 결과",
  "field.moderation.appeal-decision": "사업 안내 신고 이의 결정",
  "field.inquiry.created": "새 직접 문의",
  "field.inquiry.customer_message": "고객 추가 질문",
  "field.external_request.accepted": "AP에서 전달된 문의",
  "field.reservation.requested": "새 예약 요청",
  "field.reservation.catalog_reviewed": "고객이 새 서비스 조건을 확인함",
  "field.reservation.proposal_accepted": "고객이 제안 시간을 수락함",
  "field.reservation.change_requested": "고객 시간 변경 요청",
  "field.reservation.cancel_requested": "고객 취소 요청",
  "field.booking_message.customer": "예약 고객 추가 메시지",
  "field.booking_message.owner": "예약 사업자 답변",
};
const randomMessageKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
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
function mergeReservations(current: Reservation[], loaded: Reservation[]) {
  const byId = new Map(current.map(item => [item.id, item]));
  for (const item of loaded) byId.set(item.id, item);
  return [...byId.values()].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
}
function validCatalogDraft(catalog: DraftCatalog) {
  return Boolean(catalog.businessName.trim()) && catalog.services.every(service =>
    Boolean(service.name.trim()) && Number.isSafeInteger(service.durationMinutes)
      && service.durationMinutes >= 1 && service.durationMinutes <= 1440
      && (service.priceAmount === null || (Number.isSafeInteger(service.priceAmount)
        && service.priceAmount >= 0 && service.priceAmount <= 1_000_000_000)))
    && (catalog.faqs ?? []).every(faq => Boolean(faq.question.trim()) && Boolean(faq.answer.trim()));
}
function sameCatalogContent(left: DraftCatalog, right: DraftCatalog) {
  const content = (catalog: DraftCatalog) => JSON.stringify({
    businessName: catalog.businessName.trim(), industry: (catalog.industry ?? '').trim(), introduction: catalog.introduction.trim(),
    region: catalog.region.trim(), openingHours: catalog.openingHours.trim(),
    contactPhone: catalog.contactPhone.trim(), defaultBookingMode: catalog.defaultBookingMode,
    services: catalog.services.map(service => ({ id: service.id, name: service.name.trim(),
      description: service.description.trim(), bookingMode: service.bookingMode,
      durationMinutes: service.durationMinutes, priceAmount: service.priceAmount })),
    faqs: (catalog.faqs ?? []).map(faq => ({ question: faq.question.trim(), answer: faq.answer.trim() })),
  });
  return content(left) === content(right);
}
export function FieldWorkspace() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authMode, setAuthMode] = useState<"sign-up" | "sign-in">("sign-up");
  const [activeOwnerSection, setActiveOwnerSection] = useState("today");
  const [todayTaskFilter, setTodayTaskFilter] = useState<"all" | "messages" | "bookings">("all");
  const ownerMainRef = useRef<HTMLElement>(null);
  const [organizationName, setOrganizationName] = useState("");
  const [catalog, setCatalog] = useState<DraftCatalog | null>(null);
  const [releaseRevision, setReleaseRevision] = useState<number | null>(null);
  const [catalogReleaseState, setCatalogReleaseState] = useState<"loading" | "ready" | "failed">("loading");
  const [sitePublicationState, setSitePublicationState] = useState<"loading" | "ready" | "failed" | "restricted">("loading");
  const [sitePublishedRevision, setSitePublishedRevision] = useState<number | null>(null);
  const [sitePublicUrl, setSitePublicUrl] = useState<string | null>(null);
  const [servicesEditorOpen, setServicesEditorOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [catalogSaveState, setCatalogSaveState] = useState<"idle" | "saving" | "failed" | "conflict">("idle");
  const [catalogConflict, setCatalogConflict] = useState<DraftCatalog | null>(null);
  const [catalogStatus, setCatalogStatus] = useState("");
  const [online, setOnline] = useState(true);
  const catalogEditSequence = useRef(0);
  const catalogSaveInFlight = useRef(false);
  const [inbox, setInbox] = useState<OwnerInquirySummary[]>([]);
  const [inboxLoadState, setInboxLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [inboxNextCursor, setInboxNextCursor] = useState<string | null>(null);
  const [olderInboxState, setOlderInboxState] = useState<"idle" | "loading" | "failed">("idle");
  const [externalInquiries, setExternalInquiries] = useState<ExternalInquiry[]>([]);
  const [externalLoadState, setExternalLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [externalNextCursor, setExternalNextCursor] = useState<string | null>(null);
  const [olderExternalState, setOlderExternalState] = useState<"idle" | "loading" | "failed">("idle");
  const [inboxSearch, setInboxSearch] = useState("");
  const [inboxFilter, setInboxFilter] = useState<"all" | "needed" | "ap">("all");
  const [activeInboxKey, setActiveInboxKey] = useState<string | null>(null);
  const lastShownInboxKey = useRef<string | null>(null);
  const [inboxReplyMode, setInboxReplyMode] = useState<"reply" | "note">("reply");
  const [selectedExternalId, setSelectedExternalId] = useState<string | null>(null);
  const [apConversation, setApConversation] = useState<ApConversation | null>(null);
  const [apMessages, setApMessages] = useState<ApMessage[]>([]);
  const [apNextAfter, setApNextAfter] = useState("0");
  const [apReplyBody, setApReplyBody] = useState("");
  const [apReplyDraft, setApReplyDraft] = useState<ApReplyDraft | null>(null);
  const selectedExternalRef = useRef<string | null>(null);
  const [notifications, setNotifications] = useState<OwnerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationLoadState, setNotificationLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [aiInstallationState, setAiInstallationState] = useState<"not_installed" | "active" | "paused" | "unavailable">("not_installed");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsLoadState, setReservationsLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [reservationsNextCursor, setReservationsNextCursor] = useState<string | null>(null);
  const [olderReservationsState, setOlderReservationsState] = useState<"idle" | "loading" | "failed">("idle");
  const onReservationsLoaded = useCallback((loaded: Reservation[], nextCursor: string | null) => {
    setReservations(current => mergeReservations(current, loaded));
    setReservationsNextCursor(nextCursor);
    setReservationsLoadState("ready");
    setOlderReservationsState("idle");
  }, []);
  const onReservationsLoadFailed = useCallback(() => setReservationsLoadState("failed"), []);
  const [focusedReservation, setFocusedReservation] = useState<{ id: string; token: string } | null>(null);
  const [manualDialogToken, setManualDialogToken] = useState<string | null>(null);
  const [todayCalendar, setTodayCalendar] = useState<TodayCalendar | null>(null);
  const [todayCalendarDay, setTodayCalendarDay] = useState("");
  const [todayCalendarState, setTodayCalendarState] = useState<"loading" | "ready" | "failed">("loading");
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [closeFeedback, setCloseFeedback] = useState("");
  const [closeResultUnknown, setCloseResultUnknown] = useState(false);
  const pendingReply = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const pendingNote = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const loadInbox = useCallback(async (cursor?: string) => {
    if (cursor) setOlderInboxState("loading");
    else setInboxLoadState("loading");
    try {
      const result = await requestJson(`/v1/owner/inquiries${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      if (result.status === 200) {
        const page = result.data as { inquiries: OwnerInquirySummary[]; nextCursor?: string | null };
        setInbox(current => {
          if (!cursor) return page.inquiries;
          const ids = new Set(current.map(item => item.id));
          return [...current, ...page.inquiries.filter(item => !ids.has(item.id))];
        });
        setInboxNextCursor(page.nextCursor ?? null);
        setInboxLoadState("ready");
        setOlderInboxState("idle");
      } else {
        if (cursor) setOlderInboxState("failed");
        else {
          setInboxLoadState("failed");
          setStatus("Field 직접 문의함을 불러오지 못했습니다. 서버 상태를 확인해 주세요.");
        }
      }
    } catch {
      if (cursor) setOlderInboxState("failed");
      else {
        setInboxLoadState("failed");
        setStatus("Field 직접 문의함 서버에 연결하지 못했습니다.");
      }
    }
  }, []);
  const loadReservationsForInbox = useCallback(async (cursor?: string) => {
    if (cursor) setOlderReservationsState("loading");
    else setReservationsLoadState("loading");
    try {
      const result = await requestJson(`/v1/owner/reservations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      if (result.status !== 200) {
        if (cursor) setOlderReservationsState("failed");
        else setReservationsLoadState("failed");
        return null;
      }
      const page = result.data as ReservationListPage;
      const loaded = page.reservations;
      setReservations(current => mergeReservations(current, loaded));
      setReservationsNextCursor(page.nextCursor ?? null);
      setReservationsLoadState("ready");
      setOlderReservationsState("idle");
      return loaded;
    } catch {
      if (cursor) setOlderReservationsState("failed");
      else setReservationsLoadState("failed");
      return null;
    }
  }, []);
  const loadExternalInquiries = useCallback(async (organizationId: string, cursor?: string) => {
    if (cursor) setOlderExternalState("loading");
    else setExternalLoadState("loading");
    try {
      const result = await requestJson(`/v1/owner/external-requests${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, "GET", undefined, undefined,
        { "x-organization-id": organizationId });
      if (result.status === 200) {
        const page = result.data as { inquiries: ExternalInquiry[]; nextCursor?: string | null };
        const items = page.inquiries;
        setExternalInquiries(current => {
          const byId = new Map(current.map(item => [item.id, item]));
          for (const item of items) byId.set(item.id, item);
          return [...byId.values()].sort((left, right) =>
            right.receivedAt.localeCompare(left.receivedAt) || right.id.localeCompare(left.id));
        });
        setExternalNextCursor(page.nextCursor ?? null);
        setExternalLoadState("ready");
        setOlderExternalState("idle");
        return items;
      } else {
        if (cursor) setOlderExternalState("failed");
        else {
          setExternalLoadState("failed");
          setStatus("AP 전달 문의를 불러오지 못했습니다. 서버 상태를 확인해 주세요.");
        }
      }
    } catch {
      if (cursor) setOlderExternalState("failed");
      else {
        setExternalLoadState("failed");
        setStatus("AP 전달 문의 서버에 연결하지 못했습니다.");
      }
    }
    return null;
  }, []);
  async function loadApConversation(id: string, organizationId: string, after = "0") {
    try {
      const result = await requestJson(`/v1/owner/external-requests/${id}/conversation?after=${after}`,
        "GET", undefined, undefined, { "x-organization-id": organizationId });
      if (selectedExternalRef.current !== id) return;
      if (result.status !== 200) {
        if (result.status === 403 || result.status === 404 || result.status === 409) {
          setApConversation(null); setApMessages([]);
        }
        setStatus(result.status === 403 ? "AP 대화 답변 권한이 없습니다. AP owner가 새 범위로 다시 동의해야 합니다."
          : `AP 원본 대화를 열지 못했습니다 (${result.status}). 연결과 AP 서버 상태를 확인해 주세요.`);
        return;
      }
      const page = result.data as { conversation: ApConversation; messages: ApMessage[]; nextAfter: string };
      setApConversation(page.conversation);
      setApMessages(current => after === "0" ? page.messages : [...current, ...page.messages]);
      setApNextAfter(page.nextAfter);
      setStatus("AP 원본 대화를 읽었습니다. 이 화면의 메시지는 Field에 복제되지 않습니다.");
    } catch {
      if (selectedExternalRef.current === id)
        setStatus("AP 원본 대화에 연결하지 못했습니다. 작성 중인 답변은 유지됩니다.");
    }
  }
  async function loadApReplyDraft(id: string, organizationId: string) {
    try {
      const result = await requestJson(`/v1/owner/external-requests/${id}/reply-draft`,
        "GET", undefined, undefined, { "x-organization-id": organizationId });
      if (selectedExternalRef.current !== id) return null;
      if (result.status !== 200) {
        setStatus(`AP 답변 초안을 확인하지 못했습니다 (${result.status}).`);
        return null;
      }
      const value = result.data as { draft: ApReplyDraft | null;
        lastAccepted: { expectedRevision: number; messageId: string; delivery: string } | null };
      setApReplyDraft(value.draft);
      if (value.draft) setApReplyBody(value.draft.body);
      return value;
    } catch {
      if (selectedExternalRef.current === id) setStatus("Field에 보관한 AP 답변 초안을 확인하지 못했습니다.");
      return null;
    }
  }
  async function closeReceivedWork(item: ExternalInquiry) {
    if (!catalog || busy) return;
    setBusy(true); setStatus("");
    try {
      const result = await requestJson(`/v1/owner/external-requests/${item.id}/close`, "POST",
        { expectedRevision: item.fieldWorkRevision }, undefined, { "x-organization-id": catalog.organizationId });
      if (result.status !== 200) {
        setStatus(`Field 수신 업무를 종결하지 못했습니다 (${result.status}). 목록을 다시 확인해 주세요.`);
        return;
      }
      const value = result.data as { state: "closed"; revision: number; closedAt: string };
      setExternalInquiries(current => current.map(existing => existing.id === item.id
        ? { ...existing, fieldWorkState: value.state, fieldWorkRevision: value.revision, closedAt: value.closedAt } : existing));
      setStatus("Field 수신 업무의 종결을 확인했습니다. AP 대화 상태는 별도로 유지됩니다.");
    } catch { setStatus("종결 응답을 확인하지 못했습니다. 같은 업무의 종결 버튼으로 결과를 다시 확인해 주세요."); }
    finally { setBusy(false); }
  }

  function selectExternal(item: ExternalInquiry) {
    setActiveInboxKey(`ap:${item.id}`);
    selectedExternalRef.current = item.id;
    setSelectedExternalId(item.id);
    setApConversation(null); setApMessages([]); setApNextAfter("0");
    setApReplyBody(""); setApReplyDraft(null);
    if (catalog) {
      void loadApConversation(item.id, catalog.organizationId);
      void loadApReplyDraft(item.id, catalog.organizationId);
    }
  }
  async function sendApReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalog || !selectedExternalId || !apConversation || apConversation.state === "spam"
      || apConversation.state === "closed" || !apReplyBody.trim()) return;
    const body = apReplyBody.trim();
    if (apReplyDraft && apReplyDraft.state !== "revision_conflict" && apReplyDraft.body !== body) {
      setStatus("이전 답변의 결과가 불명확합니다. 원래 내용을 복원해 같은 제출 키로 재확인해 주세요.");
      return;
    }
    const expectedRevision = apReplyDraft && apReplyDraft.state !== "revision_conflict"
      ? apReplyDraft.expectedRevision : apConversation.revision;
    setBusy(true); setStatus("AP 원본에 답변을 저장 중입니다.");
    try {
      const result = await requestJson(`/v1/owner/external-requests/${selectedExternalId}/replies`, "POST",
        { body, expectedRevision }, undefined, { "x-organization-id": catalog.organizationId });
      if (result.status === 200 || result.status === 201) {
        const saved = result.data as { messageId: string; delivery: string; replayed: boolean };
        setApReplyDraft(null); setApReplyBody("");
        await loadApConversation(selectedExternalId, catalog.organizationId);
        setStatus(saved.delivery === "blocked_integration"
          ? "답변이 AP 원본에 저장됐습니다. 고객 외부 알림은 공급사 미연결로 발송되지 않았습니다."
          : `답변이 AP 원본에 저장됐습니다. 고객 알림 상태: ${saved.delivery}.`);
      } else if (result.status === 503 && (result.data as { error?: string }).error === "reply_delivery_unknown") {
        const stored = await loadApReplyDraft(selectedExternalId, catalog.organizationId);
        if (stored?.lastAccepted?.expectedRevision === expectedRevision && !stored.draft) {
          setApReplyBody("");
          await loadApConversation(selectedExternalId, catalog.organizationId);
          setStatus("AP 원본에 답변이 저장된 것을 확인했습니다. 외부 고객 알림은 별도 상태입니다.");
        } else setStatus("AP 응답이 불명확합니다. 고객 전달 성공으로 처리하지 않았습니다. Field에 보관한 같은 내용으로 다시 제출해 확인해 주세요.");
      }
      else if (result.status === 409 && (result.data as { error?: string }).error === "conversation_spam") {
        await loadApReplyDraft(selectedExternalId, catalog.organizationId);
        await loadApConversation(selectedExternalId, catalog.organizationId);
        setStatus("AP 스팸 분류로 답변을 저장하지 못했습니다. 초안은 유지됩니다. AP 관리실에서 해제한 뒤 원본을 다시 확인해 주세요.");
      } else if (result.status === 409) {
        await loadApReplyDraft(selectedExternalId, catalog.organizationId);
        setStatus("AP 대화가 변경됐거나 제출 내용이 충돌합니다. 초안은 유지됩니다. 원본을 새로고침해 확인해 주세요.");
      } else {
        await loadApReplyDraft(selectedExternalId, catalog.organizationId);
        setStatus(`AP 답변을 저장하지 못했습니다 (${result.status}). 초안은 유지됩니다.`);
      }
    } catch {
      const stored = await loadApReplyDraft(selectedExternalId, catalog.organizationId);
      if (stored?.lastAccepted?.expectedRevision === expectedRevision && !stored.draft) {
        setApReplyBody("");
        await loadApConversation(selectedExternalId, catalog.organizationId);
        setStatus("AP 원본에 답변이 저장된 것을 확인했습니다. 외부 고객 알림은 별도 상태입니다.");
      } else setStatus("AP 응답을 받지 못했습니다. Field에 보관한 같은 초안으로 다시 제출해 확인해 주세요.");
    }
    finally { setBusy(false); }
  }
  const loadNotifications = useCallback(async () => {
    setNotificationLoadState("loading");
    try {
      const result = await requestJson("/v1/owner/notifications");
      if (result.status === 200) {
        const value = result.data as { notifications: OwnerNotification[]; unreadCount: number };
        setNotifications(value.notifications); setUnreadCount(value.unreadCount);
        setNotificationLoadState("ready");
      } else {
        setNotificationLoadState("failed");
        setStatus("Field 처리 알림을 불러오지 못했습니다.");
      }
    } catch {
      setNotificationLoadState("failed");
      setStatus("Field 처리 알림 서버에 연결하지 못했습니다.");
    }
  }, []);
  const loadAiInstallation = useCallback(async () => {
    const result = await requestJson("/v1/sites/ap-installation");
    if (result.status === 404) { setAiInstallationState("not_installed"); return; }
    if (result.status !== 200) { setAiInstallationState("unavailable"); return; }
    const installation = (result.data as { installation: { status: string } | null }).installation;
    setAiInstallationState(installation?.status === "active" ? "active"
      : installation?.status === "paused" ? "paused" : "not_installed");
  }, []);
  const loadTodayCalendar = useCallback(async () => {
    setTodayCalendarState("loading");
    setTodayCalendar(null);
    try {
      const policy = await requestJson("/v1/booking-policy");
      if (policy.status !== 200 && policy.status !== 404) { setTodayCalendarState("failed"); return; }
      const timezone = policy.status === 200 ? (policy.data as { timezone: string }).timezone : "Asia/Seoul";
      const today = dayInZone(new Date(), timezone);
      const from = mondayOf(today);
      const to = shiftDay(from, 6);
      const result = await requestJson(`/v1/owner/reservations/calendar?from=${from}&to=${to}`);
      if (result.status !== 200) { setTodayCalendarState("failed"); return; }
      const value = result.data as TodayCalendar;
      const currentDay = dayInZone(new Date(), value.timezone);
      if (currentDay < from || currentDay > to) { setTodayCalendarState("failed"); return; }
      setTodayCalendar(value);
      setTodayCalendarDay(currentDay);
      setTodayCalendarState("ready");
    } catch { setTodayCalendarState("failed"); }
  }, []);
  const loadCatalogRelease = useCallback(async (organizationId: string) => {
    setCatalogReleaseState("loading");
    setReleaseRevision(null);
    try {
      const result = await requestJson(`/v1/public/catalog/${organizationId}`);
      if (result.status === 200) setReleaseRevision((result.data as Catalog).revision);
      else if (result.status !== 404) { setCatalogReleaseState("failed"); return; }
      setCatalogReleaseState("ready");
    } catch { setCatalogReleaseState("failed"); }
  }, []);
  const loadSitePublication = useCallback(async () => {
    setSitePublicationState("loading");
    setSitePublishedRevision(null);
    setSitePublicUrl(null);
    try {
      const draft = await requestJson("/v1/sites/draft");
      if (draft.status === 404) { setSitePublicationState("ready"); return; }
      if (draft.status !== 200) { setSitePublicationState("failed"); return; }
      const slug = (draft.data as { slug: string }).slug;
      if (!/^field-[0-9a-f]{12}$/.test(slug)) { setSitePublicationState("failed"); return; }
      const released = await requestJson(`/v1/public/sites/${slug}`);
      if (released.status === 404) { setSitePublicationState((released.data as { error?: string }).error === "site_visibility_restricted" ? "restricted" : "ready"); return; }
      if (released.status !== 200) { setSitePublicationState("failed"); return; }
      const value = released.data as { siteRevision: number; siteOrigin: string | null };
      setSitePublishedRevision(value.siteRevision);
      setSitePublicUrl(value.siteOrigin ? `${value.siteOrigin}/site/${slug}` : null);
      setSitePublicationState("ready");
    } catch { setSitePublicationState("failed"); }
  }, []);
  const loadCatalog = useCallback(async () => {
    let result;
    try { result = await requestJson("/v1/business/draft"); }
    catch {
      setStatus("사업 정보를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
      setPhase("failed");
      return;
    }
    if (result.status === 200) {
      setStatus("");
      const value = result.data as DraftCatalog;
      setCatalog(value);
      setDirty(false);
      setCatalogSaveState("idle"); setCatalogConflict(null); setCatalogStatus("");
      setInbox([]); setInboxLoadState("loading"); setInboxNextCursor(null); setOlderInboxState("idle");
      setExternalInquiries([]); setExternalLoadState("loading");
      setExternalNextCursor(null); setOlderExternalState("idle");
      setReservations([]); setReservationsLoadState("loading");
      setReservationsNextCursor(null); setOlderReservationsState("idle");
      setPhase("catalog");
      await Promise.allSettled([loadCatalogRelease(value.organizationId), loadSitePublication(), loadTodayCalendar(),
        loadInbox(), loadExternalInquiries(value.organizationId), loadNotifications(), loadAiInstallation()]);
    } else if (result.status === 404) { setStatus(""); setPhase("organization"); }
    else if (result.status === 401) { setStatus(""); setPhase("auth"); }
    else { setPhase("failed"); setStatus("Field API에서 사업 정보를 불러오지 못했습니다. 다시 시도해 주세요."); }
  }, [loadCatalogRelease, loadSitePublication, loadTodayCalendar, loadInbox, loadExternalInquiries, loadNotifications, loadAiInstallation]);
  const checkSession = useCallback(async () => {
    setPhase("loading"); setStatus("");
    let result;
    try { result = await requestJson("/api/auth/get-session"); }
    catch {
      setStatus("계정 상태를 확인하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
      setPhase("failed");
      return;
    }
    if (result.status === 200 && (result.data as { user?: unknown } | null)?.user) {
      await loadCatalog();
    } else if (result.status === 200 || result.status === 401) {
      setPhase("auth");
    } else {
      setStatus("계정 상태를 확인하지 못했습니다. 인증 서버 상태를 확인하고 다시 시도해 주세요.");
      setPhase("failed");
    }
  }, [loadCatalog]);
  useEffect(() => { void checkSession(); }, [checkSession]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "login") setAuthMode("sign-in");
  }, []);
  useEffect(() => {
    const connected = () => { setOnline(true); setCatalogSaveState(current => current === "failed" ? "idle" : current); };
    const disconnected = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => { window.removeEventListener("online", connected); window.removeEventListener("offline", disconnected); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function authenticate(event: FormEvent<HTMLFormElement>, mode: "sign-in" | "sign-up") {
    event.preventDefault();
    setBusy(true); setStatus("");
    try {
      const result = await requestJson(`/api/auth/${mode}/email`, "POST", mode === "sign-up" ? { email, password, name } : { email, password });
      if (result.status !== 200) { setStatus(`계정 처리에 실패했습니다 (${result.status}).`); return; }
      if (mode === "sign-up") {
        const signedIn = await requestJson("/api/auth/sign-in/email", "POST", { email, password });
        if (signedIn.status !== 200) { setStatus("가입되었습니다. 이메일 확인 후 로그인해 주세요."); return; }
      }
      await loadCatalog();
    } catch { setStatus("인증 요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }
  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const result = await requestJson("/v1/organizations", "POST", { name: organizationName });
      if (result.status === 201) { await loadCatalog(); setActiveOwnerSection("services"); setServicesEditorOpen(true); setStatus("조직이 만들어졌습니다. 사업 정보를 입력해 주세요."); }
      else setStatus(`조직 생성에 실패했습니다 (${result.status}).`);
    } catch { setStatus("조직 생성 요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }
  async function signOut() {
    if (busy || dirty || catalogSaveState === "saving" || (phase === "organization" && organizationName.trim()) || apReplyBody.trim() || replyBody.trim() || noteBody.trim()) return;
    setBusy(true); setStatus("");
    try {
      const result = await requestJson("/api/auth/sign-out", "POST", {});
      if (result.status !== 200) {
        setStatus(`로그아웃하지 못했습니다 (${result.status}). 다시 시도해 주세요.`);
        return;
      }
      window.location.replace("/workspace");
    } catch { setStatus("로그아웃 요청이 전달되지 않았습니다. 현재 세션을 유지합니다."); }
    finally { setBusy(false); }
  }
  const change = (patch: Partial<DraftCatalog>) => {
    setCatalog(current => current ? { ...current, ...patch } : current);
    catalogEditSequence.current += 1;
    setDirty(true);
    setCatalogSaveState(current => current === "conflict" ? current : "idle");
    setCatalogStatus("");
  };
  const updateService = (index: number, patch: Partial<DraftService>) => {
    if (catalog) change({ services: catalog.services.map((item, position) => position === index ? { ...item, ...patch } : item) });
  };
  const updateFaq = (index: number, patch: Partial<DraftCatalog["faqs"][number]>) => {
    if (catalog) change({ faqs: (catalog.faqs ?? []).map((item, position) => position === index ? { ...item, ...patch } : item) });
  };
  function openServiceEditor(id?: string) {
    setServicesEditorOpen(true);
    setEditingServiceId(id ?? null);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.getElementById(id ? `service-editor-${id}` : "owner-catalog");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (id) target?.querySelector("input")?.focus({ preventScroll: true });
    }));
  }
  function addService() {
    if (!catalog || catalog.services.length >= 100) return;
    const id = crypto.randomUUID();
    change({ services: [...catalog.services, { id, name: "", description: "", bookingMode: "inherit", durationMinutes: 30, priceAmount: null }] });
    openServiceEditor(id);
  }
  const save = useCallback(async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!catalog || catalogSaveInFlight.current) return;
    const snapshot = catalog;
    const sequence = catalogEditSequence.current;
    catalogSaveInFlight.current = true;
    setCatalogSaveState("saving"); setCatalogStatus("사업 정보 초안을 서버에 저장하고 있습니다.");
    try {
      const result = await requestJson("/v1/business/draft", "PUT", {
        expectedRevision: snapshot.revision, businessName: snapshot.businessName, industry: snapshot.industry ?? '', introduction: snapshot.introduction,
        region: snapshot.region, openingHours: snapshot.openingHours, contactPhone: snapshot.contactPhone,
        defaultBookingMode: snapshot.defaultBookingMode, services: snapshot.services, faqs: snapshot.faqs ?? [],
      });
      let saved = result.status === 200 ? result.data as DraftCatalog : null;
      if (result.status === 409) {
        const latest = await requestJson("/v1/business/draft");
        if (latest.status === 200 && sameCatalogContent(snapshot, latest.data as DraftCatalog))
          saved = latest.data as DraftCatalog;
        else if (latest.status === 200) {
          setCatalogConflict(latest.data as DraftCatalog);
          setCatalogSaveState("conflict");
          setCatalogStatus("다른 수정이 먼저 저장되었습니다. 현재 입력은 유지됩니다. 서버 초안을 비교하고 적용할 버전을 선택해 주세요.");
          return;
        } else {
          setCatalogSaveState("failed");
          setCatalogStatus("최신 서버 초안을 확인하지 못했습니다. 현재 입력은 유지됩니다. 다시 시도해 주세요.");
          return;
        }
      }
      if (saved) {
        const hasNewerEdits = catalogEditSequence.current !== sequence;
        setCatalog(current => current ? hasNewerEdits ? { ...current, revision: saved.revision } : saved : current);
        setDirty(hasNewerEdits);
        setCatalogConflict(null);
        setCatalogSaveState("idle");
        setCatalogStatus(hasNewerEdits
          ? `사업 정보 초안 ${saved.revision}번 저장 후 추가 입력을 다시 저장합니다.`
          : validCatalogDraft(saved)
            ? `사업 정보 초안 ${saved.revision}번이 저장되었습니다. 고객 공개 전에는 승인이 필요합니다.`
            : `작성 중인 사업 정보 초안 ${saved.revision}번을 서버에 보관했습니다. 필수 값을 채워야 승인할 수 있습니다.`);
      } else {
        setCatalogSaveState("failed");
        setCatalogStatus(`저장에 실패했습니다 (${result.status}). 입력은 유지됩니다. 초안 저장으로 재시도해 주세요.`);
      }
    } catch {
      setCatalogSaveState("failed");
      setCatalogStatus("저장 요청이 전달되지 않았습니다. 입력은 유지됩니다. 초안 저장으로 재시도해 주세요.");
    } finally { catalogSaveInFlight.current = false; }
  }, [catalog]);
  useEffect(() => {
    if (!catalog || !dirty || busy || !online || catalogSaveState !== "idle") return;
    const timer = window.setTimeout(() => { void save(); }, 1000);
    return () => window.clearTimeout(timer);
  }, [catalog, dirty, busy, online, catalogSaveState, save]);
  async function resolveCatalogConflict(useMine: boolean) {
    if (!catalog || !catalogConflict || busy) return;
    setBusy(true);
    try {
      const latest = await requestJson("/v1/business/draft");
      if (latest.status !== 200) {
        setCatalogStatus("서버 최신 초안을 확인하지 못했습니다. 현재 입력을 유지합니다. 다시 시도해 주세요.");
        return;
      }
      const remote = latest.data as DraftCatalog;
      if (remote.revision !== catalogConflict.revision || !sameCatalogContent(remote, catalogConflict)) {
        setCatalogConflict(remote);
        setCatalogStatus("서버 초안이 비교하는 동안 다시 바뀌었습니다. 새 서버 내용을 확인하고 선택해 주세요.");
        return;
      }
      if (useMine) {
        if (!window.confirm("서버 초안의 다른 변경을 현재 화면 내용으로 대체하고 다시 저장하시겠습니까?")) return;
        setCatalog(current => current ? { ...current, revision: remote.revision } : current);
        setDirty(true);
        setCatalogSaveState("idle");
        setCatalogStatus(`내 입력을 서버 ${remote.revision}번을 기준으로 다시 저장합니다. 다른 편집자의 변경은 대체됩니다.`);
      } else {
        if (!window.confirm("현재 화면의 미저장 입력을 버리고 서버 초안을 사용하시겠습니까?")) return;
        setCatalog(remote);
        setDirty(false);
        setCatalogSaveState("idle");
        setCatalogStatus(`서버 사업 정보 초안 ${remote.revision}번을 불러왔습니다. 승인본은 바뀌지 않았습니다.`);
      }
      setCatalogConflict(null);
    } catch { setCatalogStatus("서버 초안을 다시 확인할 수 없습니다. 현재 입력은 유지됩니다."); }
    finally { setBusy(false); }
  }
  async function approve() {
    if (!catalog || catalogReleaseState !== "ready" || dirty || !validCatalogDraft(catalog)) return;
    setBusy(true); setStatus("승인 중입니다.");
    try {
      const result = await requestJson("/v1/catalog/releases", "POST", { expectedRevision: catalog.revision });
      if (result.status === 200 || result.status === 201) {
        setReleaseRevision(catalog.revision); setCatalogReleaseState("ready");
        setStatus(`카탈로그 ${catalog.revision}번이 승인되었습니다. 고객 링크를 확인해 주세요.`);
      } else if (result.status === 409) setStatus("초안 버전이 달라 승인하지 못했습니다.");
      else setStatus(`승인에 실패했습니다 (${result.status}).`);
    } catch { setStatus("승인 요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }
  async function selectInquiry(id: string, preserveDrafts = false) {
    try {
      const result = await requestJson(`/v1/owner/inquiries/${id}`);
      if (result.status === 200) {
        setActiveInboxKey(`field:${id}`);
        setSelected(result.data as Inquiry);
        if (!preserveDrafts) {
          setReplyBody(""); setNoteBody(""); pendingReply.current = null; pendingNote.current = null;
          setCloseFeedback(""); setCloseResultUnknown(false);
        }
        return true;
      }
      setStatus(`문의를 열지 못했습니다 (${result.status}).`);
      return false;
    } catch { setStatus("Field 직접 문의 상세를 열지 못했습니다. 다시 선택해 주세요."); return false; }
  }
  async function refreshCloseState(id: string) {
    if (await selectInquiry(id, true)) {
      setCloseResultUnknown(false);
      setCloseFeedback("현재 Field 문의 상태를 다시 확인했습니다.");
      await loadInbox();
    } else setCloseFeedback("현재 상태를 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  async function closeSelectedInquiry() {
    if (!selected || selected.state === "closed" || closeResultUnknown || selected.revision === undefined) return;
    const id = selected.id;
    setBusy(true); setCloseFeedback("");
    try {
      const result = await requestJson(`/v1/owner/inquiries/${id}/close`, "POST",
        { expectedRevision: selected.revision });
      if (result.status === 200) {
        const value = result.data as { state: string; revision: number };
        setSelected(current => current?.id === id ? { ...current, state: value.state, revision: value.revision } : current);
        setInbox(current => current.map(item => item.id === id ? { ...item, state: value.state } : item));
        setCloseFeedback("처리 완료로 표시했습니다. 고객이 추가 질문을 보내면 다시 확인 필요로 열립니다.");
      } else if (result.status === 409) {
        setCloseFeedback("새 질문이나 답변으로 문의가 변경됐습니다. 현재 상태를 확인해 주세요.");
        await selectInquiry(id, true); await loadInbox();
      } else setCloseFeedback(`처리 완료를 저장하지 못했습니다 (${result.status}). 다시 시도해 주세요.`);
    } catch {
      setCloseResultUnknown(true);
      setCloseFeedback("응답을 받지 못해 처리 결과를 확인할 수 없습니다. 현재 상태를 먼저 조회해 주세요.");
    } finally { setBusy(false); }
  }
  async function openNotification(item: OwnerNotification) {
    if (!item.readAt) {
      const result = await requestJson(`/v1/owner/notifications/${item.id}/read`, "POST");
      if (result.status !== 200) { setStatus("알림 읽음 상태를 저장하지 못했습니다."); return; }
    }
    if (item.organizationId !== catalog?.organizationId) {
      setStatus("이 알림은 다른 Field 조직의 요청입니다. 해당 조직 작업 공간에서 확인해 주세요.");
    } else if (item.targetKind === "moderation_report") {
      window.location.assign('/workspace/moderation');
      return;
    } else if (item.targetKind === "inquiry") {
      showOwnerSection("inbox");
      setInboxFilter("all"); setInboxSearch("");
      await selectInquiry(item.targetId);
    }
    else if (item.targetKind === "external_request") {
      showOwnerSection("inbox");
      setInboxFilter("all"); setInboxSearch("");
      const items = await loadExternalInquiries(item.organizationId);
      const target = items?.find(inquiry => inquiry.id === item.targetId);
      if (target) selectExternal(target);
      else setStatus("전달 문의를 목록에서 찾지 못했습니다. 조회 상태와 연결을 확인해 주세요.");
    } else if (item.eventType === "field.booking_message.customer") {
      const loaded = await loadReservationsForInbox();
      if (loaded?.some(reservation => reservation.id === item.targetId && reservation.source === "public")) {
        showOwnerSection("inbox"); setInboxFilter("all"); setInboxSearch("");
        setActiveInboxKey(`reservation:${item.targetId}`);
      } else {
        showOwnerSection("calendar");
        setFocusedReservation({ id: item.targetId, token: crypto.randomUUID() });
      }
    } else { showOwnerSection("calendar"); setFocusedReservation({ id: item.targetId, token: crypto.randomUUID() }); }
    await loadNotifications();
  }
  async function sendOwnerMessage(event: FormEvent<HTMLFormElement>, kind: "replies" | "notes") {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      const body = kind === "notes" ? noteBody : replyBody;
      const pending = kind === "notes" ? pendingNote : pendingReply;
      const fingerprint = JSON.stringify({ id: selected.id, kind, body: body.trim() });
      if (pending.current?.fingerprint !== fingerprint)
        pending.current = { fingerprint, idempotencyKey: randomMessageKey() };
      const result = await requestJson(`/v1/owner/inquiries/${selected.id}/${kind}`, "POST", { body }, undefined,
        { 'idempotency-key': pending.current.idempotencyKey });
      if (result.status === 201 || result.status === 200) {
        pending.current = null;
        if (kind === "notes") setNoteBody(current => current === body ? "" : current);
        else setReplyBody(current => current === body ? "" : current);
        setStatus(kind === "notes"
          ? result.status === 200 ? "이전에 저장한 내부 메모를 확인했습니다. 고객에게 공개되거나 발송되지 않습니다."
            : "내부 메모를 저장했습니다. 고객에게 공개되거나 발송되지 않습니다."
          : selected.isTest ? "테스트 답변을 내부 기록에 저장했습니다. 고객 알림은 만들지 않았습니다."
            : result.status === 200 ? "이전에 저장한 답변을 확인했습니다. 새 알림은 생성되지 않았습니다."
              : "답변을 저장했습니다. 고객 외부 알림은 공급사 미연결로 발송되지 않았습니다.");
        await selectInquiry(selected.id, true); await loadInbox();
      } else if (result.status === 409 && (result.data as { error?: string }).error === 'idempotency_conflict')
        setStatus("이 제출 키로 저장된 내용이 다릅니다. 내용을 확인해 주세요.");
      else setStatus(`${kind === "notes" ? "메모" : "답변"} 저장에 실패했습니다 (${result.status}).`);
    } catch { setStatus(`응답을 받지 못했습니다. 같은 내용으로 다시 제출하면 기존 ${kind === "notes" ? "메모" : "답변"}을 확인합니다.`); }
    finally { setBusy(false); }
  }

  function showOwnerSection(section: string) {
    setActiveOwnerSection(section);
    setStatus("");
    ownerMainRef.current?.scrollTo({ top: 0 });
    if (section === "today" && catalog) void Promise.allSettled([
      loadInbox(), loadExternalInquiries(catalog.organizationId), loadReservationsForInbox(), loadNotifications(),
      loadCatalogRelease(catalog.organizationId), loadSitePublication(), loadTodayCalendar(),
    ]);
  }
  function openReservationManagement(id: string) {
    showOwnerSection("calendar");
    setFocusedReservation({ id, token: crypto.randomUUID() });
  }
  async function openFallbackCandidate(candidate: FallbackCandidate) {
    if (!catalog || busy) return;
    if (candidate.reservationId) { openReservationManagement(candidate.reservationId); return; }
    setBusy(true);
    try {
      const result = await requestJson(`/v1/owner/external-requests/${candidate.externalRequestId}`,
        "GET", undefined, undefined, { "x-organization-id": catalog.organizationId });
      if (result.status !== 200) {
        setStatus(`기존 수신 문의를 열지 못했습니다 (${result.status}). 원래 직접 요청은 유지됩니다. 다시 시도해 주세요.`);
        return;
      }
      const item = result.data as ExternalInquiry;
      setExternalInquiries(current => current.some(existing => existing.id === item.id) ? current : [item, ...current]);
      setInboxSearch(""); setInboxFilter("all");
      showOwnerSection("inbox"); selectExternal(item);
    } catch { setStatus("기존 수신 문의를 열지 못했습니다. 원래 직접 요청은 유지됩니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  function openBookingPolicy() {
    showOwnerSection("calendar");
    requestAnimationFrame(() => {
      const details = document.querySelector<HTMLDetailsElement>("#owner-reservations .booking-policy-details");
      if (!details) return;
      details.open = true;
      details.scrollIntoView({ behavior: "smooth", block: "start" });
      details.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
    });
  }
  function openManualSchedule() {
    showOwnerSection("calendar");
    setManualDialogToken(crypto.randomUUID());
  }
  const pendingInquiries = inbox.filter(item => item.state === "needs_owner" && !item.is_test).length
    + externalInquiries.filter(item => !item.isTest && item.fieldWorkState !== "closed").length;
  const inquirySummaryState = inboxLoadState === "failed" || externalLoadState === "failed" ? "failed"
    : inboxLoadState === "loading" || externalLoadState === "loading" ? "loading" : "ready";
  const pendingReservations = reservations.filter(item =>
    ["requested", "customer_accepted", "change_accepted", "change_requested", "cancel_requested"].includes(item.state)).length;
  const reservationSummaryState = reservationsLoadState;
  const todayRecordsFailed = inquirySummaryState === "failed" || reservationSummaryState === "failed" || notificationLoadState === "failed";
  const todayRecordsReady = inquirySummaryState === "ready" && reservationSummaryState === "ready" && notificationLoadState === "ready";
  const sitePublicationLabel = sitePublicationState === "restricted" ? "공개 제한" : sitePublicationState === "failed" ? "확인 불가"
    : sitePublicationState === "loading" ? "확인 중" : sitePublishedRevision === null ? "초안" : "공개";
  const sitePublicationDetail = sitePublicationState === "restricted" ? "신고·검토 결과에서 확인" : sitePublicationState === "failed" ? "공개 상태 조회 실패"
    : sitePublicationState === "loading" ? "공개 상태 확인 중"
      : sitePublishedRevision === null ? "공개 전" : `사이트 ${sitePublishedRevision}번`;
  const catalogReleaseLabel = catalogReleaseState === "failed" ? "확인 불가"
    : catalogReleaseState === "loading" ? "확인 중"
      : releaseRevision === null ? "없음" : `${releaseRevision}번`;
  const todayAgenda = todayCalendar && todayCalendarDay ? [
    ...todayCalendar.reservations.filter(item => item.confirmedStartAt
      && dayInZone(new Date(item.confirmedStartAt), todayCalendar.timezone) === todayCalendarDay)
      .map(item => ({ kind: "reservation" as const, id: item.id, at: item.confirmedStartAt!,
        title: `${item.service.name} · ${item.name}`, detail: item.source === "owner_manual" ? "전화 예약" : "확정 예약" })),
    ...todayCalendar.blocks.filter(item => dayInZone(new Date(item.startAt), todayCalendar.timezone) <= todayCalendarDay
      && dayInZone(new Date(new Date(item.endAt).getTime() - 1), todayCalendar.timezone) >= todayCalendarDay)
      .map(item => ({ kind: "block" as const, id: item.id, at: item.startAt,
        title: item.label, detail: "수동 일정" })),
  ].sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id)) : [];
  const inboxEntries = [
    ...inbox.map(item => ({ key: `field:${item.id}`, source: "field" as const, id: item.id,
      name: item.customer_name, service: item.service_snapshot.name,
      preview: item.service_snapshot.name,
      status: item.state === "needs_owner" ? "확인 필요" : item.state === "closed" ? "처리 완료" : "고객 답변 대기",
      time: item.updated_at, isTest: item.is_test })),
    ...externalInquiries.map(item => ({ key: `ap:${item.id}`, source: "ap" as const, id: item.id,
      name: item.customerName, service: item.service.name, preview: item.summary,
      status: item.fieldWorkState === "closed" ? "처리 완료" : "확인 필요", time: item.receivedAt, isTest: item.isTest })),
    ...reservations.filter(item => item.source === "public").map(item => ({
      key: `reservation:${item.id}`, source: "reservation" as const, id: item.id,
      name: item.name, service: item.service.name,
      preview: item.requestMessage || item.preferredTimeText || item.service.name,
      status: ["requested", "customer_accepted", "change_accepted", "change_requested", "cancel_requested"].includes(item.state)
        ? "확인 필요" : item.state === "confirmed" ? "예약 확정" : item.state === "proposed" ? "시간 제안" : "예약 기록",
      time: item.createdAt, isTest: false,
    })),
  ].sort((left, right) => right.time.localeCompare(left.time));
  const todayActionableEntries = inboxEntries.filter(item => item.status === "확인 필요" && !item.isTest
    && (item.source === "field" && inboxLoadState === "ready"
      || item.source === "ap" && externalLoadState === "ready"
      || item.source === "reservation" && reservationsLoadState === "ready"));
  const todayFilteredEntries = todayActionableEntries.filter(item => todayTaskFilter === "all"
    || todayTaskFilter === "bookings" && item.source === "reservation"
    || todayTaskFilter === "messages" && item.source !== "reservation");
  const todayTasks = todayFilteredEntries.slice(0, 6);
  const todayFilterHasMore = todayTaskFilter === "bookings" ? Boolean(reservationsNextCursor)
    : todayTaskFilter === "messages" ? Boolean(inboxNextCursor || externalNextCursor)
      : Boolean(inboxNextCursor || externalNextCursor || reservationsNextCursor);
  const todayFilterFailed = todayTaskFilter === "bookings" ? reservationSummaryState === "failed"
    : todayTaskFilter === "messages" ? inquirySummaryState === "failed" : todayRecordsFailed;
  const todayFilterReady = todayTaskFilter === "bookings" ? reservationSummaryState === "ready"
    : todayTaskFilter === "messages" ? inquirySummaryState === "ready" : todayRecordsReady;
  const searchTerm = inboxSearch.trim().toLocaleLowerCase("ko-KR");
  const visibleInboxEntries = inboxEntries.filter(item =>
    (inboxFilter === "all" || inboxFilter === "ap" && item.source === "ap"
      || inboxFilter === "needed" && item.status === "확인 필요")
    && (!searchTerm || `${item.name} ${item.service} ${item.preview}`.toLocaleLowerCase("ko-KR").includes(searchTerm)));
  const shownInboxKey = visibleInboxEntries.some(item => item.key === activeInboxKey) ? activeInboxKey : null;
  useEffect(() => {
    const previous = lastShownInboxKey.current;
    lastShownInboxKey.current = shownInboxKey;
    if (previous === shownInboxKey || !window.matchMedia("(max-width: 760px)").matches) return;
    const layout = document.querySelector<HTMLElement>("#owner-inbox .field-owner-inbox-layout");
    if (!layout) return;
    if (shownInboxKey) {
      layout.querySelector<HTMLButtonElement>(".field-owner-inbox-thread.active .field-owner-inbox-back")
        ?.focus({ preventScroll: true });
    } else if (previous) {
      const item = [...layout.querySelectorAll<HTMLButtonElement>(".field-owner-inbox-item")]
        .find(button => button.dataset.inboxKey === previous);
      (item ?? layout.querySelector<HTMLInputElement>(".field-owner-inbox-search input"))
        ?.focus({ preventScroll: true });
    }
  }, [shownInboxKey]);

  if (phase === "auth") return <div className="field-auth-shell"><header className="field-home-header"><div className="field-home-wrap field-home-nav"><a href="/"><Brand product="Field" /></a><nav aria-label="서비스 탐색"><a href="/#how-it-works">서비스 소개</a><a href={process.env.NEXT_PUBLIC_AGENT_WEB_URL ?? "http://localhost:3001"}>사업자 AI</a><a href="/preview/owner/start">화면 둘러보기</a></nav><div className="field-home-nav-actions"><button type="button" onClick={() => setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in")}>{authMode === "sign-in" ? "무료로 시작" : "로그인"}</button></div></div></header>
    <main className="field-auth-layout"><section className="field-auth-story"><p className="field-home-kicker">YOUR BUSINESS, YOUR SPACE</p><h1>내 사업의 첫 화면을<br />직접 만들어보세요.</h1><p>개발 지식 없이도 괜찮아요.<br />사업 정보만 준비하면 시작할 수 있어요.</p><ul><li>나만의 사이트와 주소</li><li>AI와 함께 만드는 소개</li><li>고객 문의·예약을 한곳에서</li></ul></section>
      <section className="field-auth-form"><h2>{authMode === "sign-up" ? "내 사업의 새로운 시작." : "내 관리실로 돌아오기."}</h2><p>{authMode === "sign-up" ? "계정을 만들고 홈페이지 개설을 시작하세요." : "Field 계정으로 사업과 예약을 이어서 관리하세요."}</p>
        <button className="field-auth-kakao" type="button" disabled>카카오로 시작하기</button><p className="field-auth-unavailable">카카오 인증은 외부 연동 후 사용할 수 있습니다.</p><div className="field-auth-divider">또는 이메일로</div>
        <form className="form-fields" onSubmit={event => void authenticate(event, authMode)}>
          {authMode === "sign-up" && <label>이름<input required autoComplete="name" placeholder="어떻게 불러드릴까요?" value={name} onChange={event => setName(event.target.value)} /></label>}
          <label>이메일<input type="email" required autoComplete="email" placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label>비밀번호<input type="password" required minLength={8} autoComplete={authMode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button type="submit" disabled={busy}>{authMode === "sign-up" ? "내 홈페이지 시작하기" : "로그인"}</button>
        </form>
        {status && <p role="status" className="state-message">{status}</p>}
        <button className="field-auth-switch" type="button" onClick={() => setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in")}>{authMode === "sign-up" ? "이미 Field 계정이 있나요? 로그인" : "처음이신가요? 무료로 시작"} →</button>
        <p className="field-auth-footnote">로컬 환경에서는 이메일로 바로 시작합니다. 실제 인증 공급사는 기능 테스트 과정에서 연결합니다.</p>
      </section>
    </main></div>;

  return <div className={phase === "catalog" ? "field-owner-shell" : "site-shell"}>
    {phase === "catalog" && catalog ? <><aside className="field-owner-sidebar"><div className="field-owner-side-brand"><a href="/"><Brand product="Field" /></a><span>관리실</span></div><div className="field-owner-tenant"><span aria-hidden="true">{catalog.businessName.trim().slice(0, 1) || "사"}</span><div><strong>{catalog.businessName.trim() || "새 사업체"}</strong><small>서비스 제공자 · 사업자</small></div></div><nav aria-label="사업자 관리실">
      {([['today', '⌂', '오늘', '#owner-today'], ['inbox', '▤', '문의함', '#owner-inquiries'], ['calendar', '▦', '예약·일정', '#owner-reservations'], ['site', '◎', '내 홈페이지', '/workspace/site'], ['ai', '✧', 'AI 상담 연결', '/workspace/integrations'], ['services', '◫', '서비스', '#owner-catalog'], ['notifications', '♧', '알림', '#owner-notifications'], ['more', '⚙', '설정·구독', '#owner-more']] as const).map(([key, icon, label, href]) => <a key={key} className={activeOwnerSection === key ? "active" : ""} href={href} onClick={event => { if (href.startsWith("#")) { event.preventDefault(); showOwnerSection(key); } }}><span aria-hidden="true">{icon}</span>{label}{key === "notifications" && unreadCount > 0 && <b>{unreadCount}</b>}</a>)}
    </nav><div className="field-owner-side-foot"><p>사이트와 직접 문의·예약은 AI 연결 없이도 운영합니다.</p><a href="/preview/owner/overview">화면 검토본 보기 ↗</a></div></aside><header className="field-owner-topbar"><div><span>{catalog.businessName.trim() || "새 사업체"}</span><span aria-hidden="true">›</span><strong>{activeOwnerSection === "today" ? "오늘" : activeOwnerSection === "calendar" ? "예약·일정" : activeOwnerSection === "inbox" ? "문의함" : activeOwnerSection === "services" ? "서비스" : activeOwnerSection === "notifications" ? "알림" : activeOwnerSection === "more" ? "설정·구독" : "관리실"}</strong></div><nav aria-label="빠른 이동">{sitePublicationState === "ready" && sitePublicUrl && <a href={sitePublicUrl}>사이트 보기 ↗</a>}<a href="#owner-notifications" onClick={event => { event.preventDefault(); showOwnerSection("notifications"); }}>알림 {unreadCount > 0 ? unreadCount : ""}</a></nav></header></> : <header className="site-header"><a href="/"><Brand product="Field" /></a><nav aria-label="작업 메뉴"><a href="/workspace/integrations">AI 상담 연결</a><a href="/preview/owner/editor">화면 검토본</a>{phase === "organization" && <button className="field-start-signout" type="button" disabled={busy || Boolean(organizationName.trim())} onClick={() => void signOut()}>로그아웃</button>}</nav></header>}
    <main ref={ownerMainRef} data-section={phase === "catalog" ? activeOwnerSection : undefined} className={phase === "catalog" ? "field-owner-main" : "feature-section"}>{phase !== "catalog" && <div className="feature-heading"><p className="eyebrow">Field · 사업자 관리실</p><h1>사업 운영</h1><p>사업 정보와 직접 문의를 Field에서 관리합니다.</p></div>}
      {phase === "catalog" && catalog && <section className="field-owner-today" id="owner-today"><div className="field-owner-page-heading"><div><h1>내 사업의 오늘</h1><p>고객이 어디에서 오든, 지금 처리할 일부터 확인하세요.</p></div><a href="/workspace/integrations">AI 상담 연결</a></div><div className="field-owner-stats"><article><span>답변할 문의</span><strong>{inquirySummaryState === "failed" ? "—" : inquirySummaryState === "loading" ? "…" : `${pendingInquiries}${inboxNextCursor || externalNextCursor ? "+" : ""}`}</strong><small>{inquirySummaryState === "failed" ? "문의 원장 일부 조회 실패" : inquirySummaryState === "loading" ? "문의 원장 확인 중" : inboxNextCursor || externalNextCursor ? "불러온 문의 기준" : "직접·연결 유입"}</small></article><article><span>확인할 예약</span><strong>{reservationSummaryState === "failed" ? "—" : reservationSummaryState === "loading" ? "…" : `${pendingReservations}${reservationsNextCursor ? "+" : ""}`}</strong><small>{reservationSummaryState === "failed" ? "예약 원장 조회 실패" : reservationSummaryState === "loading" ? "예약 원장 확인 중" : reservationsNextCursor ? "불러온 예약 기준" : "사업자 확인 대기"}</small></article><article><span>오늘 일정</span><strong>{todayCalendarState === "failed" ? "—" : todayCalendarState === "loading" ? "…" : todayAgenda.length}</strong><small>{todayCalendarState === "failed" ? "달력 원장 조회 실패" : todayCalendarState === "loading" ? "오늘 일정 확인 중" : "확정 예약·수동 일정"}</small></article><article><span>홈페이지</span><strong>{sitePublicationLabel}</strong><small>{sitePublicationDetail}</small></article></div>{todayRecordsFailed && <div className="field-owner-today-recovery" role="alert"><p>업무 현황 일부를 확인하지 못했습니다. 실패한 목록을 다시 조회해 주세요.</p>{(inquirySummaryState === "failed" || reservationSummaryState === "failed") && <button type="button" onClick={() => { if (inboxLoadState === "failed") void loadInbox(); if (externalLoadState === "failed") void loadExternalInquiries(catalog.organizationId); if (reservationsLoadState === "failed") void loadReservationsForInbox(); }}>업무 현황 다시 확인</button>}{notificationLoadState === "failed" && <button type="button" onClick={() => void loadNotifications()}>업무 알림 다시 확인</button>}</div>}{todayCalendarState === "failed" && <div className="field-owner-today-recovery" role="alert"><p>오늘 일정을 확인하지 못했습니다.</p><button type="button" onClick={() => void loadTodayCalendar()}>오늘 일정 다시 확인</button></div>}{(sitePublicationState === "failed" || catalogReleaseState === "failed") && <div className="field-owner-today-recovery" role="alert"><p>공개 상태 일부를 확인하지 못했습니다.</p>{sitePublicationState === "failed" && <button type="button" onClick={() => void loadSitePublication()}>홈페이지 공개 상태 다시 확인</button>}{catalogReleaseState === "failed" && <button type="button" onClick={() => void loadCatalogRelease(catalog.organizationId)}>사업 정보 공개 상태 다시 확인</button>}</div>}<div className="field-owner-dashboard"><section><div className="field-owner-card-head"><h2>지금 확인할 일</h2><a href="#owner-inquiries" onClick={event => { event.preventDefault(); showOwnerSection("inbox"); }}>문의함 →</a></div><div className="field-owner-task-filter" role="group" aria-label="오늘 업무 유형">{([["all", "모두"], ["messages", "답변 필요"], ["bookings", "예약 요청"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={todayTaskFilter === key} onClick={() => setTodayTaskFilter(key)}>{label}</button>)}<span>{todayFilteredEntries.length}{todayFilterHasMore ? "+" : ""}건</span></div>{todayTasks.length ? <ul className="field-owner-today-task-list">{todayTasks.map(item => <li key={item.key}>
          <span className="field-owner-today-avatar" aria-hidden="true">{item.name.trim().slice(0, 1)}</span>
          <span className="field-owner-today-task-content"><strong>{item.name} · {item.service}</strong><span>{item.preview}</span><span className="field-owner-today-task-tags"><em>{item.source === "reservation" ? "예약 요청" : "새 문의"}</em><small>{item.source === "ap" ? "AP 전달" : item.source === "reservation" ? "직접 예약" : "내 홈페이지"}</small></span></span>
          <button type="button" aria-label={`${item.name} · ${item.service} 확인`} onClick={() => {
            showOwnerSection("inbox"); setInboxFilter("all"); setInboxSearch("");
            if (item.source === "ap") { const inquiry = externalInquiries.find(current => current.id === item.id); if (inquiry) selectExternal(inquiry); }
            else if (item.source === "reservation") setActiveInboxKey(item.key);
            else void selectInquiry(item.id);
          }}>확인</button>
        </li>)}</ul> : <div className="field-owner-empty"><span aria-hidden="true">▤</span><h3>{todayFilterFailed ? "업무 현황 확인이 필요합니다." : !todayFilterReady ? "업무 현황을 확인하는 중입니다." : todayFilterHasMore ? "이전 요청에 확인할 일이 있을 수 있습니다." : todayTaskFilter === "all" ? "첫 문의를 기다리고 있어요." : "해당 유형에 확인할 일이 없습니다."}</h3><p>{todayFilterFailed ? "조회 실패 항목을 다시 확인한 뒤 문의·예약 현황을 확인하세요." : !todayFilterReady ? "최신 문의·예약을 불러오는 중입니다." : todayFilterHasMore ? "문의함이나 예약 목록에서 이전 항목을 확인하세요." : todayTaskFilter === "bookings" ? "새 예약 요청이 도착하면 여기에 표시됩니다." : todayTaskFilter === "messages" ? "새 문의가 도착하면 여기에 표시됩니다." : sitePublicationState === "ready" && sitePublishedRevision !== null ? "새 문의나 예약 요청이 도착하면 여기에 표시됩니다." : sitePublicationState === "ready" ? "내 사이트를 공개하면 고객이 직접 문의하고 예약을 요청할 수 있습니다." : "홈페이지 공개 상태를 확인한 뒤 고객 화면을 안내하세요."}</p>{todayTaskFilter === "all" && todayRecordsReady && !todayFilterHasMore && <a href="/workspace/site">내 홈페이지 열기</a>}</div>}</section><aside><div className="field-owner-schedule-card"><div className="field-owner-schedule-heading"><h2>오늘의 일정</h2><button type="button" onClick={() => showOwnerSection("calendar")}>전체 →</button></div>{todayCalendarState === "loading" ? <p>오늘 일정을 불러오는 중입니다.</p> : todayCalendarState === "failed" ? <p>일정을 확인하지 못했습니다. 위의 재조회 버튼으로 다시 확인해 주세요.</p> : todayAgenda.length ? <div className="field-owner-schedule-list">{todayAgenda.slice(0, 5).map(item => <div className="field-owner-schedule-entry" key={`${item.kind}:${item.id}`}><time>{todayCalendar && dayInZone(new Date(item.at), todayCalendar.timezone) === todayCalendarDay ? timeInZone(item.at, todayCalendar.timezone) : "계속"}</time><div>{item.kind === "reservation" ? <button type="button" onClick={() => openReservationManagement(item.id)}>{item.title}</button> : <strong>{item.title}</strong>}<small>{item.detail}</small></div></div>)}{todayAgenda.length > 5 && <p>외 {todayAgenda.length - 5}건 · 전체 일정에서 확인</p>}</div> : <p>오늘 예정된 일정이 없습니다.</p>}<button className="field-owner-schedule-add" type="button" onClick={openManualSchedule}>＋ 일정 직접 추가</button></div><div className="field-owner-ai-card"><div className="field-owner-ai-heading"><span aria-hidden="true">✧</span><div><h2>내 사이트 AI 상담</h2><p>별도 Agent Platform 연결</p></div></div><div className="field-owner-ai-facts"><div><span>위젯 상태</span><strong>{aiInstallationState === "active" ? "설치됨" : aiInstallationState === "paused" ? "중지됨" : aiInstallationState === "unavailable" ? "확인 불가" : "연결 전"}</strong></div><div><span>승인 정보</span><strong>AP에서 관리</strong></div><div><span>홈페이지</span><strong>{sitePublicationState === "failed" ? "확인 불가" : sitePublicationState === "loading" ? "확인 중" : sitePublishedRevision === null ? "공개 전" : "공개됨"}</strong></div></div><a href="/workspace/integrations">AI 상담 연결 관리 →</a></div><div className="field-owner-site-card"><h2>내 홈페이지</h2><p>{sitePublicationState === "failed" ? "공개 상태를 확인하지 못했습니다." : sitePublicationState === "loading" ? "공개 상태를 확인하는 중입니다." : sitePublishedRevision === null ? "아직 공개 전입니다." : `사이트 ${sitePublishedRevision}번 공개 중`}</p><a href="/workspace/site">사이트 수정하기 →</a></div></aside></div></section>}
      {status && <p role="status" className="state-message">{status}</p>}
      {phase === "loading" && <p>계정 상태를 확인하고 있습니다.</p>}
      {phase === "failed" && <section className="special-panel"><h2>작업실을 불러오지 못했습니다</h2><p>계정이나 사업 정보를 확인하는 중 오류가 발생했습니다. 다시 연결한 뒤 현재 계정으로 재시도할 수 있습니다.</p><button type="button" onClick={() => void checkSession()}>다시 시도</button></section>}
      {phase === "organization" && <section className="field-owner-start"><p className="field-home-kicker">LET’S BEGIN</p><h1>사장님, 반가워요.<br />어떻게 시작할까요?</h1><p>Field 홈페이지를 만들거나, 별도 Agent Platform에서 AI 상담을 시작할 수 있어요.</p><div className="field-owner-start-options"><section><span className="field-owner-start-icon" aria-hidden="true">◎</span><h2>내 홈페이지 만들기</h2><p>사업 소개부터 직접 문의·예약까지. 사업장을 만든 뒤 사이트를 직접 완성하세요.</p><form className="form-fields" onSubmit={event => void createOrganization(event)}><label>상호<input required maxLength={160} value={organizationName} onChange={event => setOrganizationName(event.target.value)} placeholder="사업체 이름" /></label><button type="submit" disabled={busy}>조직 만들기</button></form>{organizationName.trim() && <p className="field-owner-start-unsaved">작성 중인 내용을 저장하거나 비운 뒤 로그아웃할 수 있습니다.</p>}</section><section><span className="field-owner-start-icon" aria-hidden="true">✧</span><h2>내 사업 AI만 만들기</h2><p>홈페이지가 이미 있다면 별도 Agent Platform에서 상담 AI를 만들고 외부 사이트에 설치하세요.</p><a className="field-owner-start-link" href={process.env.NEXT_PUBLIC_AGENT_WEB_URL ?? "http://localhost:3001"}>사업자 AI 시작하기 →</a></section></div><p className="field-owner-start-note">새 계정에는 예시 문의나 예약을 넣지 않습니다. 가입, 사이트 공개, AI 활성화는 각각 별도 단계입니다.</p></section>}
      {phase === "catalog" && catalog && <section className="field-owner-more" id="owner-more"><h1>설정·구독</h1><p>사업 정보와 사이트, 연락·구독·데이터 설정을 관리합니다.</p><div className="field-owner-more-grid">
        <a href="/workspace/site"><span aria-hidden="true">◎</span>내 홈페이지 편집<b aria-hidden="true">›</b></a>
        <button type="button" onClick={() => showOwnerSection("services")}><span aria-hidden="true">◫</span>사업 정보·서비스<b aria-hidden="true">›</b></button>
        <button type="button" onClick={openBookingPolicy}><span aria-hidden="true">▦</span>영업시간·예약 정책<b aria-hidden="true">›</b></button>
        <button type="button" onClick={() => showOwnerSection("inbox")}><span aria-hidden="true">▤</span>직접 문의·답변<b aria-hidden="true">›</b></button>
        <a href="/workspace/integrations"><span aria-hidden="true">✧</span>AP 상담 AI 연결<b aria-hidden="true">›</b></a>
        <button type="button" onClick={() => showOwnerSection("notifications")}><span aria-hidden="true">♧</span>알림 {unreadCount > 0 ? `${unreadCount}건` : "설정"}<b aria-hidden="true">›</b></button>
        <a href="/workspace/subscription"><span aria-hidden="true">▣</span>구독·운영 데이터<b aria-hidden="true">›</b></a>
        <a href="/workspace/usage"><span aria-hidden="true">▥</span>사용량 보기<b aria-hidden="true">›</b></a>
        <a href="/workspace/moderation"><span aria-hidden="true">!</span>신고·검토 결과<b aria-hidden="true">›</b></a>
      </div><section className="field-owner-more-business"><h2>{catalog.businessName.trim() || "새 사업체"}</h2><p>{catalog.region.trim() || "지역 미등록"} · {catalog.openingHours.trim() || "운영시간 미설정"}</p><div>{catalogReleaseState === "failed" ? "사업 정보 승인 상태 확인 불가" : catalogReleaseState === "loading" ? "사업 정보 승인 상태 확인 중" : releaseRevision === null ? "사업 정보 승인 전" : `사업 정보 ${releaseRevision}번 승인`}{dirty ? " · 화면에 미저장 변경 있음" : catalogReleaseState === "ready" && releaseRevision !== null && releaseRevision !== catalog.revision ? " · 새 초안은 미승인" : ""}</div><p>홈페이지와 직접 문의·예약은 Field에서, 상담 AI는 연결된 AP에서 관리합니다.</p><button type="button" disabled={busy || dirty || catalogSaveState === "saving" || Boolean(apReplyBody.trim()) || Boolean(replyBody.trim()) || Boolean(noteBody.trim())} onClick={() => void signOut()}>로그아웃</button>{(dirty || catalogSaveState === "saving" || apReplyBody.trim() || replyBody.trim() || noteBody.trim()) && <p>작성 중인 내용을 저장하거나 비운 뒤 로그아웃할 수 있습니다.</p>}</section></section>}
      {phase === "catalog" && catalog && <><section className="field-owner-services" id="owner-services"><div className="field-owner-services-heading"><div><h1>서비스</h1><p>사이트와 예약 요청에 사용할 서비스를 관리합니다. AP 상담 정보는 별도 승인 후 반영됩니다.</p></div><button type="button" disabled={catalog.services.length >= 100} onClick={addService}>＋ 서비스 추가</button></div>
        {catalog.services.length === 0 ? <div className="field-owner-services-empty"><h2>등록된 서비스가 없습니다.</h2><p>서비스를 추가해 고객에게 보여 줄 내용과 예약 방식을 입력해 주세요.</p></div> : <div className="field-owner-service-cards">{catalog.services.map(service => <article key={service.id} className="field-owner-service-card"><div className="field-owner-service-icon" aria-hidden="true">◫</div><span className="field-owner-service-state">{catalogReleaseState === "failed" ? "승인 상태 확인 불가" : catalogReleaseState === "loading" ? "승인 상태 확인 중" : releaseRevision === null ? "승인 전 초안" : releaseRevision === catalog.revision && !dirty ? "승인본과 일치" : "미승인 변경"}</span><h2>{service.name.trim() || "서비스 이름 입력 필요"}</h2><p>{service.description.trim() || "서비스 설명을 입력해 주세요."}</p><div className="field-owner-service-facts"><span>{service.durationMinutes > 0 ? `${service.durationMinutes}분` : "소요 시간 입력 필요"}</span><span>{(service.bookingMode === "inherit" ? catalog.defaultBookingMode : service.bookingMode) === "slot" ? "시간표 선택형" : "희망시간 제출형"}</span></div><strong className="field-owner-service-price">{service.priceAmount === null ? "가격 미정" : `${service.priceAmount.toLocaleString("ko-KR")}원`}</strong><button type="button" onClick={() => openServiceEditor(service.id)}>수정·승인 관리</button></article>)}</div>}
        <div className="field-owner-services-foot"><p>서비스 변경은 초안에 저장된 뒤 승인해야 고객 화면에 반영됩니다. 기존 확정 예약의 조건은 유지됩니다.</p><div><button type="button" onClick={() => openServiceEditor()}>사업 정보·공개 관리</button><button type="button" onClick={openBookingPolicy}>영업시간·예약 정책 설정</button></div></div>{catalog.services.length >= 100 && <p>서비스는 최대 100개까지 등록할 수 있습니다.</p>}</section>
      <div className={`special-grid field-owner-catalog-editor${servicesEditorOpen ? " is-open" : ""}`} id="owner-catalog"><section className="special-panel"><div className="panel-heading"><h2>사업 정보 초안</h2><span>revision {catalog.revision}{dirty ? " · 미저장" : ""} · {catalogSaveState === "saving" ? "서버 저장 중" : catalogSaveState === "conflict" ? "저장 충돌" : !online && dirty ? "오프라인 · 미저장" : catalogSaveState === "failed" ? "저장 실패" : dirty ? "자동 저장 대기" : !validCatalogDraft(catalog) ? "서버 저장 완료 · 승인 전 필수 정보" : "서버 저장 완료"}</span></div>{catalogStatus && <p role="status" className="state-message">{catalogStatus}</p>}<form className="form-fields" onSubmit={event => void save(event)}>
        <label>상호<input required maxLength={160} value={catalog.businessName} onChange={event => change({ businessName: event.target.value })} /></label>
        <label>업종<input list="field-business-industries" maxLength={160} placeholder="선택하거나 직접 입력" value={catalog.industry ?? ""} onChange={event => change({ industry: event.target.value })} /></label>
        <datalist id="field-business-industries">{["출장·홈케어", "출장 세차", "레슨·교육", "사진·촬영", "미용·뷰티", "상담·컨설팅", "기타 서비스"].map(industry => <option key={industry} value={industry} />)}</datalist>
        <label>소개<textarea aria-label="소개" maxLength={5000} value={catalog.introduction} onChange={event => change({ introduction: event.target.value })} /></label>
        <label>지역<input maxLength={200} value={catalog.region} onChange={event => change({ region: event.target.value })} /></label>
        <label>운영시간<input maxLength={500} value={catalog.openingHours} onChange={event => change({ openingHours: event.target.value })} /></label>
        <label>연락처<input maxLength={30} value={catalog.contactPhone} onChange={event => change({ contactPhone: event.target.value })} /></label>
        <h3>서비스</h3><label>기본 예약 방식<select value={catalog.defaultBookingMode} onChange={event => change({ defaultBookingMode: event.target.value as DraftCatalog["defaultBookingMode"] })}><option value="request">희망 시간 제출</option><option value="slot">시간표 선택</option></select></label><p>서비스에서 기본 방식 상속을 선택하면 공개 승인 시 현재 기본 방식으로 확정됩니다. 기존 승인본과 예약은 바뀌지 않습니다.</p>{catalog.services.map((service, index) => <div key={service.id} id={`service-editor-${service.id}`} className={`knowledge-source field-owner-service-editor${editingServiceId === service.id ? " is-selected" : ""}`}><label>서비스 이름<input required maxLength={160} value={service.name} onChange={event => updateService(index, { name: event.target.value })} /></label><label>설명<textarea aria-label="서비스 설명" maxLength={2000} value={service.description} onChange={event => updateService(index, { description: event.target.value })} /></label><label>예약 방식<select value={service.bookingMode} onChange={event => updateService(index, { bookingMode: event.target.value as DraftService["bookingMode"] })}><option value="inherit">기본 방식 상속 ({catalog.defaultBookingMode === "slot" ? "시간표 선택" : "희망 시간 제출"})</option><option value="request">희망 시간 제출 고정</option><option value="slot">시간표 선택 고정</option></select></label><label>소요 시간(분)<input type="number" required min={1} max={1440} value={service.durationMinutes} onChange={event => updateService(index, { durationMinutes: Number(event.target.value) })} /></label><label>확정 가격(원, 미정이면 빈칸)<input type="number" min={0} max={1000000000} value={service.priceAmount ?? ""} onChange={event => updateService(index, { priceAmount: event.target.value === "" ? null : Number(event.target.value) })} /></label><button type="button" onClick={() => change({ services: catalog.services.filter((_, position) => position !== index) })}>서비스 삭제</button></div>)}
        <button type="button" disabled={catalog.services.length >= 100} onClick={addService}>서비스 추가</button>
        <div className="field-owner-faq-editor"><h3>자주 묻는 질문</h3><p>질문과 답변은 사업 정보 승인 뒤에만 사이트와 연결한 AP에 공개됩니다.</p>{(catalog.faqs ?? []).map((faq, index) => <div className="knowledge-source" key={index}><label>FAQ 질문 {index + 1}<input maxLength={500} value={faq.question} onChange={event => updateFaq(index, { question: event.target.value })} /></label><label>FAQ 답변 {index + 1}<textarea maxLength={2000} value={faq.answer} onChange={event => updateFaq(index, { answer: event.target.value })} /></label><button type="button" onClick={() => change({ faqs: (catalog.faqs ?? []).filter((_, position) => position !== index) })}>FAQ {index + 1} 삭제</button></div>)}<button type="button" disabled={(catalog.faqs ?? []).length >= 100} onClick={() => change({ faqs: [...(catalog.faqs ?? []), { question: "", answer: "" }] })}>FAQ 추가</button></div>
        <button type="submit" disabled={busy || catalogSaveState === "saving" || catalogSaveState === "conflict"}>초안 저장</button>
      </form>{catalogSaveState === "conflict" && catalogConflict && <div className="knowledge-source" role="region" aria-label="사업 정보 저장 충돌"><h3>사업 정보 저장 충돌</h3><p>서버 {catalogConflict.revision}번과 현재 화면의 미저장 입력을 비교해 주세요. 승인된 고객 정보는 바뀌지 않았습니다.</p><details><summary>서버에 저장된 초안 보기</summary><p><strong>상호:</strong> {catalogConflict.businessName}</p><p><strong>업종:</strong> {catalogConflict.industry || "미등록"}</p><p><strong>소개:</strong> {catalogConflict.introduction}</p><p><strong>지역:</strong> {catalogConflict.region}</p><p><strong>운영시간:</strong> {catalogConflict.openingHours}</p><p><strong>연락처:</strong> {catalogConflict.contactPhone}</p><p><strong>기본 예약 방식:</strong> {catalogConflict.defaultBookingMode === "slot" ? "시간표 선택" : "희망 시간 제출"}</p><ul>{catalogConflict.services.map(service => <li key={service.id}>{service.name} · {service.description} · {service.durationMinutes}분 · {service.priceAmount === null ? "가격 미정" : `${service.priceAmount}원`}</li>)}</ul>{(catalogConflict.faqs ?? []).length > 0 && <><h4>FAQ</h4><ul>{catalogConflict.faqs.map((faq, index) => <li key={index}>{faq.question} · {faq.answer}</li>)}</ul></>}</details><div className="preview-action"><button type="button" disabled={busy || !online} onClick={() => void resolveCatalogConflict(true)}>내 입력으로 다시 저장</button><button type="button" disabled={busy || !online} onClick={() => void resolveCatalogConflict(false)}>서버 초안 사용</button></div><p>내 입력을 선택하면 서버 초안의 변경을 대체합니다. 현재 입력은 위 편집 칸에서 확인할 수 있습니다.</p></div>}</section><aside className="special-panel"><h2>공개 상태</h2><p>승인 버전: {catalogReleaseLabel}</p><p>미저장 변경과 미승인 초안은 고객에게 보이지 않습니다.</p><button type="button" disabled={busy || catalogReleaseState !== "ready" || dirty || catalogSaveState !== "idle" || !validCatalogDraft(catalog) || catalog.revision === 0 || releaseRevision === catalog.revision} onClick={() => void approve()}>현재 초안 승인</button>{!validCatalogDraft(catalog) && <p>상호·서비스 이름·소요 시간과 FAQ 문답을 완성해야 승인할 수 있습니다.</p>}{dirty && <p>변경 내용을 먼저 저장해 주세요.</p>}{catalogReleaseState === "failed" && <p role="alert">사업 정보 승인 상태를 확인하지 못했습니다. <button type="button" onClick={() => void loadCatalogRelease(catalog.organizationId)}>사업 정보 공개 상태 다시 확인</button></p>}{catalogReleaseState === "ready" && releaseRevision !== null && <p><a href={`/public/${catalog.organizationId}`}>고객 문의·예약 화면 열기</a></p>}<p><a href="/workspace/site">사이트 편집·공개 열기</a></p><p><a href="/workspace/usage">실제 사용량 보기</a></p><p><a href="/workspace/subscription">구독·데이터 관리</a></p><p>고객 문의와 예약 요청은 승인된 카탈로그를 사용합니다.</p></aside></div>
      <section id="owner-notifications" className="field-owner-notifications"><div className="field-owner-notifications-heading"><h1>알림 설정</h1><p>확인이 필요한 문의·예약은 관리실에 기록됩니다. 외부 알림은 공급사 연결 후 사용할 수 있습니다.</p></div><div className="field-owner-notifications-grid"><section className="field-owner-notifications-card"><h2>사업자 알림</h2><div className="field-owner-notifications-setting"><strong>사업자 알림 번호</strong><p>업무 알림용 수신 번호는 운영 공급사 연동 단계에서 별도로 등록합니다.</p><button type="button" disabled>번호 등록 · 연동 전</button></div><label className="field-owner-notifications-toggle"><input type="checkbox" disabled />카카오톡 업무 알림 <span>공급사 미연결</span></label><label className="field-owner-notifications-toggle"><input type="checkbox" disabled />웹 푸시 알림 <span>권한·구독 미설정</span></label><p className="field-owner-notifications-note">지금 이 화면에서 설정이나 외부 발송을 완료했다고 표시하지 않습니다. 내부 처리 알림은 아래 이력에서 확인할 수 있습니다.</p></section><aside className="field-owner-notifications-card"><h2>고객 답변 알림</h2><p>Field 직접 문의·예약 고객 알림은 Field가 담당합니다. AP 원본 대화의 고객 알림은 AP가 담당합니다.</p><p>카카오톡 실패 시 문자 대체는 공급사 연동 후 검증합니다. 읽지 않았다는 이유만으로 문자를 중복 발송하지 않습니다.</p><p>현재 외부 발송 상태: <strong>연동 전</strong></p></aside></div><section className="field-owner-notifications-card field-owner-notifications-history"><div className="field-owner-notifications-history-heading"><div><h2>업무 이벤트 이력</h2><p>Field 원장 최근 100건 · 읽지 않음 {notificationLoadState === "ready" ? `${unreadCount}건` : "확인 중"}</p></div><button type="button" onClick={() => void loadNotifications()}>이력 새로고침</button></div>{notificationLoadState === "loading" && notifications.length === 0 && <p role="status">업무 이벤트를 불러오는 중입니다.</p>}{notificationLoadState === "failed" && <div className="field-owner-inbox-warning" role="alert"><p>이력을 확인하지 못했습니다. 기존 이벤트를 0건으로 판단하지 않습니다.</p><button type="button" onClick={() => void loadNotifications()}>다시 확인</button></div>}{notificationLoadState === "ready" && notifications.length === 0 && <p>발생한 업무 이벤트가 없습니다.</p>}{notifications.length > 0 && <ul>{notifications.map(item => <li key={item.id}><button type="button" onClick={() => void openNotification(item)}><span><strong>{notificationLabels[item.eventType] ?? item.eventType}</strong><small>{new Date(item.createdAt).toLocaleString("ko-KR")}</small></span><span>{item.readAt ? "읽음" : "새 알림"} →</span></button></li>)}</ul>}</section></section>
      <OwnerBookingPanel organizationId={catalog.organizationId} releaseRevision={releaseRevision} releaseState={catalogReleaseState} focusReservationId={focusedReservation?.id} focusReservationToken={focusedReservation?.token} manualDialogToken={manualDialogToken} onReservationsLoaded={onReservationsLoaded} onReservationsLoadFailed={onReservationsLoadFailed} onOpenFallbackCandidate={candidate => void openFallbackCandidate(candidate)} />
      <div id="owner-inbox" className="field-owner-inbox"><div className="field-owner-inbox-heading"><h1>문의함</h1><p>고객과의 대화, 필요한 결정까지 한곳에서.</p></div>
        {(inboxLoadState === "loading" || externalLoadState === "loading" || reservationsLoadState === "loading") && inboxEntries.length === 0 && <p role="status">문의·예약 상태를 확인하고 있습니다.</p>}
        {(inboxLoadState === "failed" || externalLoadState === "failed") && <div className="field-owner-inbox-warning" role="alert"><p>{inboxLoadState === "failed" ? "Field 직접 문의" : ""}{inboxLoadState === "failed" && externalLoadState === "failed" ? "와 " : ""}{externalLoadState === "failed" ? "AP 전달 문의" : ""} 상태를 확인하지 못했습니다. 기존 기록을 0건으로 판단하지 않습니다.</p>{inboxLoadState === "failed" && <button type="button" onClick={() => void loadInbox()}>직접 문의 다시 확인</button>}{externalLoadState === "failed" && <button type="button" onClick={() => void loadExternalInquiries(catalog.organizationId)}>AP 전달 문의 다시 확인</button>}</div>}
        {reservationsLoadState === "failed" && <div className="field-owner-inbox-warning" role="alert"><p>Field 직접 예약 목록을 확인하지 못했습니다. 기존 기록을 0건으로 판단하지 않습니다.</p><button type="button" onClick={() => void loadReservationsForInbox()}>직접 예약 다시 확인</button></div>}
        {inboxLoadState === "ready" && externalLoadState === "ready" && reservationsLoadState === "ready" && inboxEntries.length === 0 && <section className="field-owner-inbox-empty"><span aria-hidden="true">▤</span><h2>아직 접수된 문의·예약이 없어요.</h2><p>사이트에서 직접 문의나 예약을 보내면 이곳에 표시됩니다.</p><a href={sitePublicationState === "ready" && sitePublicUrl ? sitePublicUrl : "/workspace/site"}>{sitePublicationState === "ready" && sitePublicUrl ? "고객 사이트 열기" : "사이트 준비하기"}</a></section>}<div className={`field-owner-inbox-layout${inboxEntries.length === 0 ? " is-empty" : ""}${shownInboxKey ? " detail-open" : ""}`}>
      <aside className="field-owner-inbox-list" aria-label="문의·예약 목록"><div className="field-owner-inbox-tools"><label className="field-owner-inbox-search"><span className="sr-only">고객 또는 문의 검색</span><input type="search" placeholder="고객·문의 검색" value={inboxSearch} onChange={event => setInboxSearch(event.target.value)} /></label><div className="field-owner-inbox-filters" aria-label="문의 필터"><button type="button" className={inboxFilter === "all" ? "active" : ""} aria-pressed={inboxFilter === "all"} onClick={() => setInboxFilter("all")}>전체</button><button type="button" className={inboxFilter === "needed" ? "active" : ""} aria-pressed={inboxFilter === "needed"} onClick={() => setInboxFilter("needed")}>확인 필요</button><button type="button" className={inboxFilter === "ap" ? "active" : ""} aria-pressed={inboxFilter === "ap"} onClick={() => setInboxFilter("ap")}>AP 전달</button></div></div><div className="field-owner-inbox-items">{visibleInboxEntries.length === 0 ? <p>검색 결과가 없습니다.</p> : visibleInboxEntries.map(item => <button key={item.key} type="button" data-inbox-key={item.key} className={`field-owner-inbox-item${shownInboxKey === item.key ? " selected" : ""}`} aria-current={shownInboxKey === item.key ? "true" : undefined} onClick={() => { if (item.source === "ap") { const inquiry = externalInquiries.find(current => current.id === item.id); if (inquiry) selectExternal(inquiry); } else if (item.source === "reservation") setActiveInboxKey(item.key); else void selectInquiry(item.id); }}><span className="field-owner-inbox-item-top"><strong>{item.isTest ? "테스트 · " : ""}{item.name}</strong><time dateTime={item.time}>{new Date(item.time).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</time></span><span className="field-owner-inbox-item-preview">{item.preview}</span><span className="field-owner-inbox-item-bottom"><span className={item.status === "확인 필요" ? "needs-owner" : ""}>{item.status}</span><small>{item.source === "ap" ? "AP 전달" : item.source === "reservation" ? "직접 예약" : "직접 문의"}</small></span></button>)}</div>{(inboxFilter !== "ap" && (inboxNextCursor || reservationsNextCursor) || externalNextCursor) && <div className="field-owner-inbox-more">
        {inboxFilter !== "ap" && inboxNextCursor && <><button type="button" disabled={olderInboxState === "loading"} onClick={() => void loadInbox(inboxNextCursor)}>{olderInboxState === "loading" ? "이전 직접 문의 불러오는 중" : "이전 직접 문의 더 보기"}</button>{olderInboxState === "failed" && <p role="alert">이전 직접 문의를 불러오지 못했습니다. 다시 시도해 주세요.</p>}</>}
        {externalNextCursor && <><button type="button" disabled={olderExternalState === "loading"} onClick={() => void loadExternalInquiries(catalog.organizationId, externalNextCursor)}>{olderExternalState === "loading" ? "이전 AP 전달 문의 불러오는 중" : "이전 AP 전달 문의 더 보기"}</button>{olderExternalState === "failed" && <p role="alert">이전 AP 전달 문의를 불러오지 못했습니다. 다시 시도해 주세요.</p>}</>}
        {inboxFilter !== "ap" && reservationsNextCursor && <><button type="button" disabled={olderReservationsState === "loading"} onClick={() => void loadReservationsForInbox(reservationsNextCursor)}>{olderReservationsState === "loading" ? "이전 예약 불러오는 중" : "이전 예약 더 보기"}</button>{olderReservationsState === "failed" && <p role="alert">이전 예약을 불러오지 못했습니다. 다시 시도해 주세요.</p>}</>}
      </div>}</aside>
      <div className="field-owner-inbox-detail">{!shownInboxKey && <section className="field-owner-inbox-prompt"><span aria-hidden="true">▤</span><h2>문의·예약을 선택해 주세요.</h2><p>왼쪽 목록에서 고객 대화와 출처를 확인할 수 있습니다.</p></section>}
      <section id="external-inquiries" className={`special-panel field-owner-inbox-thread${shownInboxKey?.startsWith("ap:") ? " active" : ""}`}><div className="field-owner-inbox-source">AP 상담 · 전달 접수 · AP 원본</div><div className="panel-heading"><button className="field-owner-inbox-back" type="button" onClick={() => setActiveInboxKey(null)} aria-label="문의 목록으로">←</button><h2>AP에서 전달된 문의</h2><button type="button" onClick={() => void loadExternalInquiries(catalog.organizationId)}>새로고침</button></div><p>AP 상담 원문과 답변은 AP에 보관됩니다.</p>
        {externalInquiries.filter(item => item.id === selectedExternalId).map(item => <div key={item.id} className="knowledge-source"><h3>{item.customerName} · {item.service.name}</h3><p>연락처: {item.customerPhone}{item.customerVerified ? " · 확인됨" : " · 본인 확인 전"}</p><p>전달 내용: {item.summary}</p><p>접수 시각: {new Date(item.receivedAt).toLocaleString("ko-KR")}</p><p>Field 접수 상태: {item.status === "requested" ? "사업자 확인 전" : item.status}</p><p>{item.fieldWorkState === "closed" ? `Field 업무 종결됨 · ${item.closedAt ? new Date(item.closedAt).toLocaleString("ko-KR") : "종결 시각 미확인"}` : "Field 업무 처리 중"}</p>{item.fieldWorkState === "open" && <button type="button" disabled={busy} onClick={() => void closeReceivedWork(item)}>Field 수신 업무 종결</button>}<p>Field 수신 업무의 종결은 AP 원본 대화와 별도입니다. 기존 자료와 고객 접근 경로를 유지합니다.</p><FieldRetentionNotice retention={item.retention} /><FieldReceivedWorkRecord record={item.receivedRecord} /><ExternalRequestPhotos requestId={item.id} organizationId={catalog.organizationId} /><button type="button" onClick={() => void loadApConversation(item.id, catalog.organizationId)}>AP 원본 새로고침</button>{apConversation && <><p>AP 원본 상태: {apConversation.state} · revision {apConversation.revision}</p>{apConversation.state === "spam" && <p role="status">AP에서 스팸으로 분류해 답변·알림을 중단했습니다. 원본과 작성 초안은 유지됩니다. AP 관리실에서 해제한 뒤 원본을 새로고침해 주세요.</p>}<ol className="field-owner-inbox-messages">{apMessages.map(message => <li key={message.id} className={message.actor === "owner" ? "mine" : "customer"}><strong>{message.actor === "owner" ? "사업자" : "고객"}</strong><p>{message.body}</p><small>AP #{message.sequence} · {new Date(message.createdAt).toLocaleString("ko-KR")}</small></li>)}</ol>{apMessages.length === 0 && <p>AP 원본 메시지가 없습니다.</p>}{apMessages.length > 0 && apMessages.length % 100 === 0 && <button type="button" onClick={() => void loadApConversation(item.id, catalog.organizationId, apNextAfter)}>다음 메시지 읽기</button>}</>}{apReplyDraft && <p role="status">{apReplyDraft.state === "delivery_unknown" ? "AP 저장 결과 확인 중 · Field에 원래 초안과 제출 키 보관" : apReplyDraft.state === "revision_conflict" ? "AP 대화 변경됨 · 초안 보관, 원본을 새로 확인한 뒤 제출" : "AP 미전송 초안이 Field에 보관됨"}</p>}<form className="form-fields" onSubmit={event => void sendApReply(event)}><label>AP 원본 대화에 답변<textarea required maxLength={5000} value={apReplyBody} onChange={event => setApReplyBody(event.target.value)} /></label><button type="submit" disabled={busy || Boolean(item.retention?.workPurgedAt) || !apConversation || apConversation.state === "closed" || apConversation.state === "spam"}>AP에 답변 저장</button></form>{!apConversation && <p>AP 원본을 열어야 답변을 제출할 수 있습니다. 보관된 초안은 계속 표시됩니다.</p>}<p>AP가 고객 알림을 담당합니다. 외부 발송 여부는 저장과 별도 상태입니다.</p></div>)}</section>
      <section id="owner-inquiries" className={`special-panel field-owner-inbox-thread${shownInboxKey?.startsWith("field:") ? " active" : ""}`}><div className="field-owner-inbox-source">내 홈페이지 · 직접 접수 · Field 원본</div><div className="panel-heading"><button className="field-owner-inbox-back" type="button" onClick={() => setActiveInboxKey(null)} aria-label="문의 목록으로">←</button><h2>Field 직접 문의</h2><button type="button" onClick={() => void loadInbox()}>새로고침</button></div>
        {selected && <div className="knowledge-source"><div className="field-owner-inbox-direct-head"><h3>{selected.isTest ? "테스트 · " : ""}{selected.customerName} · {selected.service.name}</h3>{selected.state === "closed" ? <span>처리 완료</span> : <button type="button" disabled={busy || closeResultUnknown || selected.revision === undefined || Boolean(replyBody.trim() || noteBody.trim())} onClick={() => void closeSelectedInquiry()}>처리 완료</button>}</div>{selected.isTest ? <p>사이트 {selected.testSiteRevision}번 내부 확인 기록입니다. 실제 고객·동의·연락처가 없고 외부 알림·실적·예약 점유에 포함되지 않습니다.</p> : <p>연락처: {selected.customerPhone}</p>}{selected.visitRegion && <p>지역·이용 장소: {selected.visitRegion}</p>}<FieldFallbackReview fallback={selected.fallback} review={selected.fallbackReview} onOpenCandidate={candidate => void openFallbackCandidate(candidate)} /><p>상태: {selected.state === "needs_owner" ? "확인 필요" : selected.state === "waiting_customer" ? "고객 답변 대기" : selected.state === "closed" ? "처리 완료" : "상태 확인 필요"}</p>{selected.state === "closed" && !selected.retention?.workPurgedAt && <p>고객이 기존 확인키로 추가 질문을 남기면 다시 확인 필요로 열립니다.</p>}{Boolean(replyBody.trim() || noteBody.trim()) && selected.state !== "closed" && <p>작성 중인 답변·메모를 저장하거나 비우면 처리 완료를 선택할 수 있습니다.</p>}{closeFeedback && <p role="status" className="field-owner-inbox-close-feedback">{closeFeedback}</p>}{closeResultUnknown && <button type="button" className="field-owner-inbox-close-refresh" disabled={busy} onClick={() => void refreshCloseState(selected.id)}>현재 상태 다시 확인</button>}<p><a href={`/v1/owner/inquiries/${selected.id}/export`}>이 대화 기록 JSON 다운로드</a> · 사진 파일은 각 메시지의 사진 저장을 사용하세요.</p><ol className="field-owner-inbox-messages">{selected.messages.map(message => <li key={message.id} className={message.visibility === "internal" ? "internal" : message.sender === "owner" ? "mine" : "customer"}><strong>{message.visibility === "internal" ? "내부 메모" : message.sender === "owner" ? "사업자" : "고객"}</strong><p>{message.body}</p><small>{message.visibility === "internal" ? "고객 비공개 · 알림 없음" : inquiryDeliveryLabel(message.sender, message.delivery_state)}</small>
          {selected.attachments.filter(item => item.messageId === message.id).map((attachment, index) =>
            <PrivateInquiryPhoto key={attachment.id} inquiryId={selected.id} attachmentId={attachment.id} label={`고객 첨부 사진 ${index + 1}`} />)}</li>)}</ol>
          <FieldRetentionNotice retention={selected.retention} />{selected.retention?.workPurgedAt ? null : selected.state === "closed" ? <p className="field-owner-inbox-closed-note">이 문의는 처리 완료 상태입니다. 고객이 추가 질문을 남기면 다시 답변할 수 있습니다.</p> : <div className="field-owner-inbox-reply-tabs"><button type="button" className={inboxReplyMode === "reply" ? "active" : ""} aria-pressed={inboxReplyMode === "reply"} onClick={() => setInboxReplyMode("reply")}>고객에게 답변</button><button type="button" className={inboxReplyMode === "note" ? "active" : ""} aria-pressed={inboxReplyMode === "note"} onClick={() => setInboxReplyMode("note")}>내부 메모</button></div>}
          {selected.state === "closed" || selected.retention?.workPurgedAt ? null : inboxReplyMode === "reply" ? <form className="form-fields" onSubmit={event => void sendOwnerMessage(event, "replies")}><label>고객에게 답변<textarea required value={replyBody} onChange={event => setReplyBody(event.target.value)} /></label><button type="submit" disabled={busy}>답변 저장</button></form> : <form className="form-fields" onSubmit={event => void sendOwnerMessage(event, "notes")}><label>내부 메모<textarea required value={noteBody} onChange={event => setNoteBody(event.target.value)} /></label><p>고객에게 공개되거나 발송되지 않습니다.</p><button type="submit" disabled={busy}>메모 저장</button></form>}</div>}</section>
      <section id="owner-reservation-inbox-thread" className={`special-panel field-owner-inbox-thread${shownInboxKey?.startsWith("reservation:") ? " active" : ""}`}>
        {activeInboxKey?.startsWith("reservation:") && <OwnerReservationInboxThread key={activeInboxKey} id={activeInboxKey.slice("reservation:".length)} onBack={() => setActiveInboxKey(null)} onManage={openReservationManagement} onOpenFallbackCandidate={candidate => void openFallbackCandidate(candidate)} />}
      </section></div></div></div></>}
    </main>{phase === "catalog" && <nav className="field-owner-mobile-nav" aria-label="모바일 사업자 메뉴"><a href="#owner-today" onClick={event => { event.preventDefault(); showOwnerSection("today"); }}>오늘</a><a href="#owner-inquiries" onClick={event => { event.preventDefault(); showOwnerSection("inbox"); }}>문의</a><a href="#owner-reservations" onClick={event => { event.preventDefault(); showOwnerSection("calendar"); }}>예약</a><a href="/workspace/site">내 사이트</a><a href="#owner-more" onClick={event => { event.preventDefault(); showOwnerSection("more"); }}>더보기</a></nav>}</div>;
}
