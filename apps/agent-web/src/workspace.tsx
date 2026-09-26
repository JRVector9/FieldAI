"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { AgentNotificationSettings } from "./agent-notification-settings";
import { AgentRetentionNotice } from './AgentRetentionNotice';
import type { WorkRetention } from './agent-retention';
import { PrivateInquiryPhoto } from "./private-inquiry-photo";

type Draft = {
  organizationId: string;
  revision: number;
  releaseRevision?: number | null;
  releaseDraftRevision?: number | null;
  businessName: string;
  introduction: string;
  region: string;
  openingHours: string;
  services: { name: string; description: string }[];
  faqs: { question: string; answer: string }[];
};
type Inquiry = {
  retention?:WorkRetention;
  id: string;
  state: string;
  revision: number;
  sourceKind: string;
  customerName: string;
  customerPhone: string;
  service: { name: string } | null;
  messages: { id: string; sequence: string; actor: string; visibility: string; body: string; delivery_state: string }[];
  attachments: { id: string; messageId: string; contentType: "image/webp";
    byteSize: number; width: number; height: number; createdAt: string }[];
};
type InboxItem = { id: string; state: string; customer_name: string; service_snapshot: { name?: string } | null;
  created_at: string; updated_at: string; source_kind: string; has_ai_history: boolean };
const inquirySourceLabel = (kind: string) => kind === 'link' ? '상담 링크'
  : kind === 'owned_embed' ? '외부 사이트 위젯'
    : kind === 'placement_embed' ? '제휴 매체' : '직접 문의';
const inquiryStateLabel = (state: string) => state === 'needs_owner' ? '확인 필요'
  : state === 'waiting_customer' ? '고객 답변 대기' : state === 'closed' ? '처리 완료'
    : state === 'spam' ? '스팸 · 알림 중단' : '직접 응대 중';
type OwnerNotification = { id: string; inquiryId: string | null; targetKind?: 'inquiry' | 'moderation_report';
  reportId?: string | null; eventType: string; createdAt: string; readAt: string | null };
const notificationLabel = (eventType: string) => eventType === 'ap.moderation.review' ? '사업 안내 신고 검토 결과'
  : eventType === 'ap.moderation.appeal-decision' ? '사업 안내 신고 이의 결정'
    : eventType === 'ap.inquiry.created' ? '새 문의 접수' : '고객 추가 질문';
const deliveryLabel = (state: string) => state === 'blocked_integration' ? '외부 알림 미연결' : state;
const randomMessageKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const completeDraft = (value: Draft) => Boolean(value.businessName.trim()
  && value.services.every(service => service.name.trim())
  && value.faqs.every(faq => faq.question.trim() && faq.answer.trim()));
function sameDraftContent(left: Draft, right: Draft) {
  const content = (value: Draft) => JSON.stringify({ businessName: value.businessName.trim(),
    introduction: value.introduction.trim(),
    region: (value.region ?? '').trim(), openingHours: (value.openingHours ?? '').trim(),
    services: value.services.map(service => ({ name: service.name.trim(), description: service.description.trim() })),
    faqs: value.faqs.map(faq => ({ question: faq.question.trim(), answer: faq.answer.trim() })) });
  return content(left) === content(right);
}

async function jsonRequest(path: string, method = "GET", body?: unknown, extraHeaders?: Record<string, string>) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

export function AgentWorkspace() {
  const [phase, setPhase] = useState<"loading" | "failed" | "auth" | "organization" | "draft">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authMode, setAuthMode] = useState<"sign-up" | "sign-in">("sign-up");
  const [activeSection, setActiveSection] = useState("today");
  const ownerMainRef = useRef<HTMLElement>(null);
  const [organizationName, setOrganizationName] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [releaseRevision, setReleaseRevision] = useState<number | null>(null);
  const [approvedDraftRevision, setApprovedDraftRevision] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "failed" | "conflict">("idle");
  const [conflictDraft, setConflictDraft] = useState<Draft | null>(null);
  const [online, setOnline] = useState(true);
  const editSequence = useRef(0);
  const saveInFlight = useRef(false);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [inboxNextCursor, setInboxNextCursor] = useState<string | null>(null);
  const [inboxLoadState, setInboxLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [inboxLoadingMore, setInboxLoadingMore] = useState(false);
  const [inboxPageError, setInboxPageError] = useState(false);
  const [inboxQuery, setInboxQuery] = useState("");
  const [inboxFilter, setInboxFilter] = useState<"all" | "needed" | "ai">("all");
  const [inboxEditor, setInboxEditor] = useState<"reply" | "note">("reply");
  const [inboxDetailOpen, setInboxDetailOpen] = useState(false);
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null);
  const inboxListRef = useRef<HTMLDivElement>(null);
  const inboxBackRef = useRef<HTMLButtonElement>(null);
  const inboxSearchRef = useRef<HTMLInputElement>(null);
  const inboxRequestSequence = useRef(0);
  const [notifications, setNotifications] = useState<OwnerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationLoadState, setNotificationLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [closeFeedback, setCloseFeedback] = useState("");
  const [closeResultUnknown, setCloseResultUnknown] = useState(false);
  const pendingMessage = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  const loadInbox = useCallback(async (cursor?: string) => {
    const sequence = ++inboxRequestSequence.current;
    if (cursor) { setInboxLoadingMore(true); setInboxPageError(false); }
    else setInboxLoadState("loading");
    try {
      const result = await jsonRequest(`/v1/owner/inquiries${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      if (sequence !== inboxRequestSequence.current) return;
      if (result.status !== 200) throw new Error(`inquiry_list_${result.status}`);
      const value = result.data as { inquiries: InboxItem[]; nextCursor: string | null };
      if (cursor) setInbox(current => {
        const ids = new Set(current.map(item => item.id));
        return [...current, ...value.inquiries.filter(item => !ids.has(item.id))];
      });
      else setInbox(value.inquiries);
      setInboxNextCursor(value.nextCursor);
      setInboxLoadState("ready");
      setInboxPageError(false);
    } catch {
      if (sequence !== inboxRequestSequence.current) return;
      if (cursor) setInboxPageError(true);
      else setInboxLoadState("failed");
    } finally { if (sequence === inboxRequestSequence.current) setInboxLoadingMore(false); }
  }, []);
  useEffect(() => {
    if (inboxDetailOpen && window.matchMedia('(max-width: 760px)').matches) inboxBackRef.current?.focus();
  }, [inboxDetailOpen, selectedInboxId]);

  const loadNotifications = useCallback(async () => {
    setNotificationLoadState("loading");
    try {
      const result = await jsonRequest('/v1/owner/notifications');
      if (result.status !== 200) throw new Error(`notification_list_${result.status}`);
      const value = result.data as { notifications: OwnerNotification[]; unreadCount: number };
      setNotifications(value.notifications);
      setUnreadCount(value.unreadCount);
      setNotificationLoadState("ready");
    } catch {
      setNotificationLoadState("failed");
      setStatus('AP 처리 알림을 불러오지 못했습니다.');
    }
  }, []);

  const loadDraft = useCallback(async () => {
    let result;
    try { result = await jsonRequest("/v1/knowledge/draft"); }
    catch {
      setStatus("사업 정보를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
      setPhase("failed");
      return;
    }
    if (result.status === 200) {
      setStatus("");
      const value = result.data as Draft;
      setDraft(value);
      setDirty(false);
      setSaveState("idle"); setConflictDraft(null);
      setPhase("draft");
      setReleaseRevision(value.releaseRevision ?? null);
      setApprovedDraftRevision(value.releaseDraftRevision ?? null);
      await Promise.allSettled([loadInbox(), loadNotifications()]);
    } else if (result.status === 404) {
      setStatus("");
      setPhase("organization");
    } else if (result.status === 401) {
      setStatus("");
      setPhase("auth");
    } else {
      setStatus("사업 정보를 불러오지 못했습니다. API와 DB 상태를 확인하고 다시 시도해 주세요.");
      setPhase("failed");
    }
  }, [loadInbox, loadNotifications]);

  const checkSession = useCallback(async () => {
    setPhase("loading"); setStatus("");
    let result;
    try { result = await jsonRequest("/api/auth/get-session"); }
    catch {
      setStatus("계정 상태를 확인하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
      setPhase("failed");
      return;
    }
    if (result.status === 200 && (result.data as { user?: unknown } | null)?.user) {
      await loadDraft();
    } else if (result.status === 200 || result.status === 401) {
      setPhase("auth");
    } else {
      setStatus("계정 상태를 확인하지 못했습니다. 인증 서버 상태를 확인하고 다시 시도해 주세요.");
      setPhase("failed");
    }
  }, [loadDraft]);
  useEffect(() => { void checkSession(); }, [checkSession]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "login") setAuthMode("sign-in");
  }, []);
  useEffect(() => {
    const connected = () => { setOnline(true); setSaveState(current => current === "failed" ? "idle" : current); };
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

  async function authenticate(event: FormEvent<HTMLFormElement>, mode: "sign-up" | "sign-in") {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const result = await jsonRequest(`/api/auth/${mode}/email`, "POST", mode === "sign-up"
        ? { email, password, name } : { email, password });
      if (result.status !== 200) {
        setStatus(`계정 처리에 실패했습니다 (${result.status}). 입력 정보와 인증 상태를 확인해 주세요.`);
        return;
      }
      if (mode === "sign-up") {
        const signedIn = await jsonRequest("/api/auth/sign-in/email", "POST", { email, password });
        if (signedIn.status !== 200) {
          setStatus("가입되었습니다. 이메일 확인 후 로그인해 주세요.");
          return;
        }
      }
      await loadDraft();
    } catch {
      setStatus("인증 서버에 연결할 수 없습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const result = await jsonRequest("/v1/organizations", "POST", { name: organizationName });
      if (result.status === 201) {
        await loadDraft();
        setActiveSection("knowledge");
        setStatus("조직이 생성되었습니다. 사업 정보를 입력하고 저장해 주세요.");
      } else setStatus(`조직을 만들지 못했습니다 (${result.status}).`);
    } catch { setStatus("조직 생성 요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    if (busy || dirty || saveState === "saving" || (phase === "organization" && organizationName.trim()) || replyBody.trim() || noteBody.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      const result = await jsonRequest("/api/auth/sign-out", "POST", {});
      if (result.status !== 200) {
        setStatus(`로그아웃하지 못했습니다 (${result.status}). 다시 시도해 주세요.`);
        return;
      }
      window.location.replace("/workspace");
    } catch { setStatus("로그아웃 요청이 전달되지 않았습니다. 현재 세션을 유지합니다."); }
    finally { setBusy(false); }
  }

  const saveDraft = useCallback(async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!draft || saveInFlight.current) return;
    const snapshot = draft;
    const sequence = editSequence.current;
    saveInFlight.current = true;
    setBusy(true); setSaveState("saving");
    setStatus("지식 초안을 서버에 저장하고 있습니다.");
    try {
      const result = await jsonRequest("/v1/knowledge/draft", "PUT", {
        expectedRevision: snapshot.revision,
        businessName: snapshot.businessName,
        introduction: snapshot.introduction,
        region: snapshot.region ?? '',
        openingHours: snapshot.openingHours ?? '',
        services: snapshot.services,
        faqs: snapshot.faqs,
      });
      let saved = result.status === 200 ? result.data as Draft : null;
      if (result.status === 409) {
        const latest = await jsonRequest("/v1/knowledge/draft");
        if (latest.status === 200 && sameDraftContent(snapshot, latest.data as Draft))
          saved = latest.data as Draft;
        else if (latest.status === 200) {
          setConflictDraft(latest.data as Draft);
          setSaveState("conflict");
          setStatus("다른 수정이 먼저 저장되었습니다. 현재 입력은 유지됩니다. 두 초안을 비교하고 선택해 주세요.");
          return;
        } else {
          setSaveState("failed");
          setStatus("서버 최신 초안을 확인하지 못했습니다. 현재 입력은 유지됩니다. 다시 시도해 주세요.");
          return;
        }
      }
      if (saved) {
        const hasNewerEdits = editSequence.current !== sequence;
        setDraft(current => current ? hasNewerEdits ? { ...current, revision: saved.revision } : saved : current);
        setDirty(hasNewerEdits);
        setConflictDraft(null); setSaveState("idle");
        setStatus(hasNewerEdits
          ? `지식 초안 ${saved.revision}번 저장 후 추가 입력을 다시 저장합니다.`
          : `지식 초안 ${saved.revision}번을 서버에 저장했습니다. 공개 버전은 바뀌지 않았습니다.`);
      } else {
        setSaveState("failed");
        setStatus(`저장에 실패했습니다 (${result.status}). 입력은 이 화면에 남아 있습니다. 초안 저장으로 재시도해 주세요.`);
      }
    } catch { setSaveState("failed"); setStatus("저장 요청이 전달되지 않았습니다. 입력은 이 화면에 남아 있습니다. 초안 저장으로 재시도해 주세요."); }
    finally { saveInFlight.current = false; setBusy(false); }
  }, [draft]);
  useEffect(() => {
    if (!draft || !dirty || busy || !online || saveState !== "idle") return;
    const timer = window.setTimeout(() => { void saveDraft(); }, 1000);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, busy, online, saveState, saveDraft]);
  async function resolveConflict(useMine: boolean) {
    if (!draft || !conflictDraft || busy) return;
    setBusy(true);
    try {
      const latest = await jsonRequest("/v1/knowledge/draft");
      if (latest.status !== 200) { setStatus("서버 초안을 확인하지 못했습니다. 현재 입력을 유지합니다."); return; }
      const remote = latest.data as Draft;
      if (remote.revision !== conflictDraft.revision || !sameDraftContent(remote, conflictDraft)) {
        setConflictDraft(remote);
        setStatus("서버 초안이 비교하는 동안 다시 변경됐습니다. 새 내용을 확인하고 선택해 주세요.");
        return;
      }
      if (useMine) {
        if (!window.confirm("서버 초안의 변경을 현재 화면 내용으로 대체하고 다시 저장하시겠습니까?")) return;
        setDraft(current => current ? { ...current, revision: remote.revision } : current);
        setDirty(true); setSaveState("idle");
        setStatus(`내 입력을 서버 ${remote.revision}번 기준으로 다시 저장합니다.`);
      } else {
        if (!window.confirm("현재 화면의 미저장 입력을 버리고 서버 초안을 사용하시겠습니까?")) return;
        setDraft(remote); setDirty(false); setSaveState("idle");
        setStatus(`서버 초안 ${remote.revision}번을 불러왔습니다. 공개 버전은 바뀌지 않았습니다.`);
      }
      setConflictDraft(null);
    } catch { setStatus("서버 초안을 다시 확인할 수 없습니다. 현재 입력은 유지됩니다."); }
    finally { setBusy(false); }
  }

  async function approve() {
    if (!draft || dirty || !completeDraft(draft) || saveState !== "idle") return;
    setBusy(true);
    setStatus("승인 중입니다.");
    try {
      const result = await jsonRequest("/v1/knowledge/releases", "POST", { expectedRevision: draft.revision });
      if (result.status === 201 || result.status === 200) {
        const release = result.data as { revision: number };
        setReleaseRevision(release.revision);
        setApprovedDraftRevision(draft.revision);
        setStatus(`지식 공개 버전 ${release.revision}번이 승인되었습니다.`);
      } else if (result.status === 409) setStatus("초안이 미완성이거나 버전이 달라 승인하지 못했습니다. 내용을 확인해 주세요.");
      else setStatus(`승인에 실패했습니다 (${result.status}).`);
    } catch { setStatus("승인 요청이 전달되지 않았습니다."); }
    finally { setBusy(false); }
  }

  const change = (patch: Partial<Draft>) => {
    setDraft(current => current ? { ...current, ...patch } : current);
    editSequence.current += 1;
    setDirty(true);
    setSaveState(current => current === "conflict" ? current : "idle");
  };
  const updateService = (index: number, patch: Partial<Draft["services"][number]>) => {
    if (!draft) return;
    change({ services: draft.services.map((item, position) => position === index ? { ...item, ...patch } : item) });
  };
  const updateFaq = (index: number, patch: Partial<Draft["faqs"][number]>) => {
    if (!draft) return;
    change({ faqs: draft.faqs.map((item, position) => position === index ? { ...item, ...patch } : item) });
  };
  async function selectInquiry(id: string, preserveDrafts = false) {
    try {
      const result = await jsonRequest(`/v1/owner/inquiries/${id}`);
      if (result.status !== 200) { setStatus(`문의를 열지 못했습니다 (${result.status}).`); return false; }
      setSelected(result.data as Inquiry);
      setSelectedInboxId(id);
      setInboxDetailOpen(true);
      if (!preserveDrafts || (result.data as Inquiry).retention?.workPurgedAt) {
        setReplyBody(""); setNoteBody(""); pendingMessage.current = null; setInboxEditor("reply");
        setCloseFeedback(""); setCloseResultUnknown(false);
      }
      return true;
    } catch { setStatus("문의를 열지 못했습니다. 연결 상태를 확인하고 다시 선택해 주세요."); return false; }
  }
  async function refreshCloseState(id: string) {
    if (await selectInquiry(id, true)) {
      setCloseResultUnknown(false);
      setCloseFeedback("현재 문의 상태를 다시 확인했습니다.");
      await loadInbox();
    } else setCloseFeedback("현재 상태를 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  async function closeSelectedInquiry() {
    if (!selected || selected.state === "closed" || selected.state === "spam" || closeResultUnknown) return;
    const id = selected.id;
    setBusy(true); setCloseFeedback("");
    try {
      const result = await jsonRequest(`/v1/owner/inquiries/${id}/close`, "POST",
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
  async function classifySelectedSpam(spam: boolean) {
    if (!selected || busy || closeResultUnknown) return;
    const id = selected.id;
    setBusy(true); setCloseFeedback("");
    try {
      const result = await jsonRequest(`/v1/owner/inquiries/${id}/spam`, "POST",
        { expectedRevision: selected.revision, spam });
      if (result.status === 200) {
        const value = result.data as { state: string; revision: number };
        setSelected(current => current?.id === id ? { ...current, state: value.state, revision: value.revision } : current);
        setInboxEditor(spam ? "note" : "reply");
        setCloseFeedback(spam ? "스팸으로 분류하고 이 대화의 알림을 중단했습니다. 원본은 보존됩니다."
          : "스팸 분류를 해제했습니다. 과거에 중단한 알림은 다시 보내지 않습니다.");
        await loadInbox(); await loadNotifications();
      } else if (result.status === 409) {
        setCloseFeedback("새 질문이나 답변으로 문의가 변경됐습니다. 현재 상태를 확인해 주세요.");
        await selectInquiry(id, true); await loadInbox();
      } else setCloseFeedback(`스팸 처리를 저장하지 못했습니다 (${result.status}). 다시 시도해 주세요.`);
    } catch {
      setCloseResultUnknown(true);
      setCloseFeedback("응답을 받지 못해 스팸 처리 결과를 확인할 수 없습니다. 현재 상태를 먼저 조회해 주세요.");
    } finally { setBusy(false); }
  }
  function closeInboxDetail() {
    setInboxDetailOpen(false);
    requestAnimationFrame(() => {
      const button = [...(inboxListRef.current?.querySelectorAll<HTMLButtonElement>('button[data-inquiry-id]') ?? [])]
        .find(item => item.dataset.inquiryId === selectedInboxId);
      (button ?? inboxSearchRef.current)?.focus();
    });
  }
  async function openNotification(item: OwnerNotification) {
    if (!item.readAt) {
      const result = await jsonRequest(`/v1/owner/notifications/${item.id}/read`, 'POST');
      if (result.status !== 200) { setStatus('알림 읽음 상태를 저장하지 못했습니다.'); return; }
    }
    if (item.targetKind === 'moderation_report') { window.location.assign('/workspace/moderation'); return; }
    if (!item.inquiryId) { setStatus('업무 대상이 없는 알림입니다. 이력을 다시 확인해 주세요.'); return; }
    showOwnerSection("inbox");
    await selectInquiry(item.inquiryId);
    await loadNotifications();
  }
  async function sendOwnerMessage(event: FormEvent<HTMLFormElement>, kind: "replies" | "notes") {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      const body = kind === "notes" ? noteBody : replyBody;
      const fingerprint = JSON.stringify({ id: selected.id, kind, body: body.trim() });
      if (pendingMessage.current?.fingerprint !== fingerprint)
        pendingMessage.current = { fingerprint, idempotencyKey: randomMessageKey() };
      const result = await jsonRequest(`/v1/owner/inquiries/${selected.id}/${kind}`, "POST", { body },
        { 'idempotency-key': pendingMessage.current.idempotencyKey });
      if (result.status === 201 || result.status === 200) {
        pendingMessage.current = null;
        if (kind === "notes") setNoteBody(current => current === body ? "" : current);
        else setReplyBody(current => current === body ? "" : current);
        setStatus(result.status === 200 ? "이전에 저장한 메시지를 확인했습니다. 새 알림은 생성되지 않았습니다."
          : kind === "notes" ? "내부 메모를 저장했습니다. 고객에게 공개되지 않습니다."
            : "답변을 AP에 저장했습니다. 고객은 확인키로 열람할 수 있고 외부 알림은 미연결 상태입니다.");
        await selectInquiry(selected.id, true); await loadInbox();
      } else if (result.status === 409 && (result.data as { error?: string }).error === 'idempotency_conflict')
        setStatus("이 제출 키로 저장된 메시지가 다릅니다. 내용을 확인해 주세요.");
      else setStatus(`저장에 실패했습니다 (${result.status}).`);
    } catch { setStatus("응답을 받지 못했습니다. 같은 내용으로 다시 제출하면 기존 메시지를 확인합니다."); }
    finally { setBusy(false); }
  }
  function showOwnerSection(section: string) {
    setActiveSection(section);
    setStatus("");
    ownerMainRef.current?.scrollTo({ top: 0 });
    if (section === "today") void Promise.allSettled([loadInbox(), loadNotifications()]);
  }
  const pendingInquiryCount = inbox.filter(item => item.state === "needs_owner").length;
  const todayTasks = inboxLoadState === "ready" ? inbox.filter(item => item.state === "needs_owner").slice(0, 6) : [];
  const todayRecordsFailed = inboxLoadState === "failed" || notificationLoadState === "failed";
  const todayRecordsReady = inboxLoadState === "ready" && notificationLoadState === "ready";
  const filteredInbox = inbox.filter(item => {
    if (inboxFilter === "needed" && item.state !== "needs_owner") return false;
    if (inboxFilter === "ai" && !item.has_ai_history) return false;
    const query = inboxQuery.trim().toLocaleLowerCase();
    return !query || `${item.customer_name} ${item.service_snapshot?.name ?? ""} ${inquiryStateLabel(item.state)} ${inquirySourceLabel(item.source_kind)}`
      .toLocaleLowerCase().includes(query);
  });
  if (phase === "auth") return <div className="agent-auth-shell"><header className="agent-home-header"><div className="agent-home-wrap agent-home-nav"><a href="/"><Brand product="Agent Platform" /></a><nav aria-label="서비스 탐색"><a href="/">서비스 소개</a><a href="/publisher">제휴 매체</a><a href={process.env.NEXT_PUBLIC_FIELD_WEB_URL ?? "http://127.0.0.1:3002"}>홈페이지 제작</a></nav><div className="agent-home-nav-actions"><button type="button" onClick={() => setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in")}>{authMode === "sign-in" ? "무료로 시작" : "로그인"}</button></div></div></header><main className="agent-auth-layout"><section className="agent-auth-story"><p className="agent-home-kicker">YOUR BUSINESS AGENT</p><h1>내 사업을 아는 AI를<br />직접 준비해 보세요.</h1><p>홈페이지를 바꾸지 않아도 괜찮아요.<br />승인한 정보로 상담을 시작할 수 있어요.</p><ul><li>서비스와 자주 묻는 질문 직접 승인</li><li>상담 링크와 기존 사이트 설치</li><li>고객 문의를 AP에서 이어받기</li></ul></section><section className="agent-auth-form"><h2>{authMode === "sign-up" ? "내 사업 AI의 새로운 시작." : "내 상담 관리실로 돌아오기."}</h2><p>{authMode === "sign-up" ? "AP 계정을 만들고 사업자 AI를 준비하세요." : "AP 계정으로 상담과 고객 문의를 이어서 관리하세요."}</p><button className="agent-auth-kakao" type="button" disabled>카카오로 시작하기</button><p className="agent-auth-unavailable">카카오 인증은 외부 연동 후 사용할 수 있습니다.</p><div className="agent-auth-divider">또는 이메일로</div><form className="form-fields" onSubmit={event => void authenticate(event, authMode)}>{authMode === "sign-up" && <label>이름<input required autoComplete="name" placeholder="어떻게 불러드릴까요?" value={name} onChange={event => setName(event.target.value)} /></label>}<label>이메일<input type="email" required autoComplete="email" placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} /></label><label>비밀번호<input type="password" required minLength={8} autoComplete={authMode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} /></label><button type="submit" disabled={busy}>{authMode === "sign-up" ? "내 AI 시작하기" : "로그인"}</button></form>{status && <p role="status" className="state-message">{status}</p>}<button className="agent-auth-switch" type="button" onClick={() => setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in")}>{authMode === "sign-up" ? "이미 AP 계정이 있나요? 로그인" : "처음이신가요? 무료로 시작"} →</button><p className="agent-auth-footnote">로컬 환경에서는 이메일로 바로 시작합니다. 운영 인증 공급사는 기능 테스트 과정에서 연결합니다.</p></section></main></div>;
  if (phase === "organization") return <div className="agent-start-shell"><header className="agent-home-header"><div className="agent-home-wrap agent-home-nav"><a href="/"><Brand product="Agent Platform" /></a><button className="agent-start-logout" type="button" disabled={busy || Boolean(organizationName.trim())} onClick={() => void signOut()}>로그아웃</button></div></header><main className="agent-start-main"><p className="agent-home-kicker">LET’S BEGIN</p><h1>사장님, 반가워요.<br />어떻게 시작할까요?</h1><p className="agent-start-lead">사업 정보를 직접 승인한 뒤 상담 AI를 공유할 수 있어요.</p><div className="agent-start-choices"><section><span aria-hidden="true">✧</span><h2>내 사업 AI만 만들기</h2><p>기존 홈페이지를 그대로 두고, 상담 링크와 외부 위젯으로 고객을 만나세요.</p><h3>첫 조직 만들기</h3><form onSubmit={event => void createOrganization(event)} className="form-fields"><label>상호<input required maxLength={160} value={organizationName} onChange={event => setOrganizationName(event.target.value)} placeholder="사업체 이름" /></label><button type="submit" disabled={busy}>조직 만들기 →</button></form></section><section><span aria-hidden="true">◎</span><h2>홈페이지도 함께 만들기</h2><p>사이트 제작과 예약·문의 운영은 Field에서 시작해 주세요. Field는 별도 계정으로 운영됩니다.</p><a href={process.env.NEXT_PUBLIC_FIELD_WEB_URL ?? "http://127.0.0.1:3002"}>Field에서 홈페이지 만들기 →</a></section></div>{status && <p role="status" className="state-message">{status}</p>}<p className="agent-start-note">가입·사업 정보 승인·AI 활성화는 각각 별도 단계입니다. 예시 문의를 계정에 넣지 않습니다.</p></main></div>;

  return <div className={phase === "draft" ? "agent-owner-shell" : "site-shell"}>
    {phase === "draft" && draft ? <><aside className="agent-owner-sidebar"><div className="agent-owner-side-brand"><a href="/"><Brand product="Agent Platform" /></a><span>관리실</span></div><div className="agent-owner-tenant"><span aria-hidden="true">{draft.businessName.trim().slice(0, 1) || "사"}</span><div><strong>{draft.businessName.trim() || "새 사업체"}</strong><small>Agent Platform 사업자</small></div></div><nav aria-label="AP 사업자 관리실">{([['today', '⌂', '오늘', '#agent-today'], ['inbox', '▤', '문의함', '#agent-inquiries'], ['ai', '✧', '내 사업 AI', '/workspace/ai'], ['knowledge', '◫', '승인 정보', '#agent-knowledge'], ['deployments', '◎', '공유·설치', '/workspace/deployments'], ['campaigns', '▦', '홍보 카드', '/workspace/campaigns'], ['notifications', '♧', '알림', '#agent-notifications'], ['integrations', '⇄', 'Field 연결', '/workspace/integrations'], ['settings', '⚙', '설정·구독', '/workspace/subscription'], ['more', '⋯', '더보기', '#agent-more']] as const).map(([key, icon, label, href]) => <a key={key} href={href} className={activeSection === key ? "active" : ""} onClick={event => { if (href.startsWith("#")) { event.preventDefault(); showOwnerSection(key); } }}><span aria-hidden="true">{icon}</span>{label}{key === "notifications" && unreadCount > 0 && <b>{unreadCount}</b>}</a>)}</nav><div className="agent-owner-side-foot"><p>AI와 고객 대화 원본은 AP에서 관리합니다. Field 연결은 선택입니다.</p><a href="/preview/owner/knowledge">화면 검토본 보기 ↗</a></div></aside><header className="agent-owner-topbar"><div><span>{draft.businessName.trim() || "새 사업체"}</span><span aria-hidden="true">›</span><strong>{activeSection === "today" ? "오늘" : activeSection === "knowledge" ? "승인 정보" : activeSection === "inbox" ? "문의함" : activeSection === "notifications" ? "알림" : "관리실"}</strong></div><nav aria-label="빠른 이동"><a href="#agent-notifications" onClick={event => { event.preventDefault(); showOwnerSection("notifications"); }}>알림 {unreadCount > 0 ? unreadCount : ""}</a></nav></header></> : <header className="site-header"><a href="/"><Brand product="Agent Platform" /></a><nav aria-label="작업 메뉴"><a href="/workspace/integrations">Field 연결</a><a href="/preview/owner/knowledge">화면 검토본</a></nav></header>}
    <main ref={ownerMainRef} data-section={phase === "draft" ? activeSection : undefined} className={phase === "draft" ? "agent-owner-main" : "feature-section"}>{phase !== "draft" && <div className="feature-heading"><p className="eyebrow">Agent Platform · 로컬 작업 환경</p><h1>사업 정보 관리</h1><p>저장한 초안과 고객에게 공개할 승인 버전을 구분합니다.</p></div>}
      {phase === "draft" && draft && <section className="agent-owner-today" id="agent-today"><div className="agent-owner-page-heading"><div><h1>내 사업의 오늘</h1><p>AI 상담과 고객 문의에서 지금 확인할 일을 모았습니다.</p></div><a href="/workspace/ai">내 사업 AI 관리</a></div><div className="agent-owner-stats"><article><span>답변할 문의</span><strong>{inboxLoadState === "failed" ? "—" : inboxLoadState === "loading" ? "…" : `${pendingInquiryCount}${inboxNextCursor ? "+" : ""}`}</strong><small>{inboxLoadState === "failed" ? "문의 목록 조회 실패" : inboxLoadState === "loading" ? "문의 목록 확인 중" : inboxNextCursor ? "불러온 AP 원본 대화 기준" : "AP 원본 대화"}</small></article><article><span>처리 알림</span><strong>{notificationLoadState === "failed" ? "—" : notificationLoadState === "loading" ? "…" : unreadCount}</strong><small>{notificationLoadState === "failed" ? "알림 목록 조회 실패" : notificationLoadState === "loading" ? "알림 목록 확인 중" : "새 문의·고객 질문"}</small></article><article><span>승인 정보</span><strong>{releaseRevision === null ? "초안" : `v${releaseRevision}`}</strong><small>{releaseRevision === null ? "공개 전" : "AP 승인본"}</small></article><article><span>서비스</span><strong>{draft.services.length}</strong><small>직접 등록</small></article></div>{todayRecordsFailed && <div className="agent-owner-today-recovery" role="alert"><p>업무 현황 일부를 확인하지 못했습니다. 실패한 목록을 다시 조회해 주세요.</p>{inboxLoadState === "failed" && <button type="button" onClick={() => void loadInbox()}>문의 현황 다시 확인</button>}{notificationLoadState === "failed" && <button type="button" onClick={() => void loadNotifications()}>처리 알림 다시 확인</button>}</div>}<div className="agent-owner-dashboard"><section><div className="agent-owner-card-head"><h2>지금 확인할 일</h2><a href="#agent-inquiries" onClick={event => { event.preventDefault(); showOwnerSection("inbox"); }}>문의함 →</a></div>{todayTasks.length ? <ul className="agent-owner-today-task-list">{todayTasks.map(item => <li key={item.id}>
        <span className="agent-owner-today-avatar" aria-hidden="true">{item.customer_name.trim().slice(0, 1)}</span>
        <span className="agent-owner-today-task-content"><strong>{item.customer_name} · {item.service_snapshot?.name ?? "일반 문의"}</strong><span>고객 문의를 확인해 주세요.</span><span className="agent-owner-today-task-tags"><em>새 문의</em><small>{inquirySourceLabel(item.source_kind)}</small></span></span>
        <button type="button" aria-label={`${item.customer_name} · ${item.service_snapshot?.name ?? "일반 문의"} 확인`} onClick={() => { showOwnerSection("inbox"); setInboxFilter("all"); setInboxQuery(""); void selectInquiry(item.id); }}>확인</button>
      </li>)}</ul> : <div className="agent-owner-empty"><span aria-hidden="true">▤</span><h3>{todayRecordsFailed ? "업무 현황 확인이 필요합니다." : todayRecordsReady ? "첫 문의를 기다리고 있어요." : "업무 현황을 확인하는 중입니다."}</h3><p>{todayRecordsFailed ? "조회 실패 항목을 다시 확인한 뒤 고객 문의를 확인하세요." : todayRecordsReady ? "승인 정보를 준비한 뒤 상담 링크나 외부 위젯을 공유해 보세요." : "최신 문의와 처리 알림을 불러오는 중입니다."}</p>{todayRecordsReady && <a href="/workspace/deployments">공유·설치 열기</a>}</div>}</section><aside><div className="agent-owner-ai-card"><div className="agent-owner-ai-heading"><span aria-hidden="true">✧</span><div><h2>내 사업 AI</h2><p>별도 승인과 활성화 단계</p></div></div><div className="agent-owner-ai-facts"><div><span>승인 정보</span><strong>{releaseRevision === null ? "없음" : `v${releaseRevision}`}</strong></div><div><span>AI 상태</span><strong>설정에서 확인</strong></div><div><span>Field 연결</span><strong>선택 사항</strong></div></div><a href="/workspace/ai">AI 설정·답변 테스트 →</a></div><div className="agent-owner-site-card"><h2>상담 링크·위젯</h2><p>배포와 허용 사이트를 AP에서 관리합니다.</p><a href="/workspace/deployments">공유·설치 관리 →</a></div></aside></div></section>}
      {status && <p role="status" className="state-message">{status}</p>}
      {phase === "draft" && <div className="preview-action"><button type="button" disabled={busy || dirty || saveState === "saving" || Boolean(replyBody.trim()) || Boolean(noteBody.trim())} onClick={() => void signOut()}>로그아웃</button>{(dirty || saveState === "saving" || replyBody.trim() || noteBody.trim()) && <p>작성 중인 내용을 저장하거나 비운 뒤 로그아웃할 수 있습니다.</p>}</div>}
      {phase === "loading" && <p>계정 상태를 확인하고 있습니다.</p>}
      {phase === "failed" && <section className="special-panel"><h2>작업실을 불러오지 못했습니다</h2><p>계정이나 사업 정보를 확인하는 중 오류가 발생했습니다. 다시 연결한 뒤 현재 계정으로 재시도할 수 있습니다.</p><button type="button" onClick={() => void checkSession()}>다시 시도</button></section>}
      {phase === "draft" && draft && <div className="special-grid" id="agent-knowledge">
        <div className="agent-owner-knowledge-heading"><h1>승인 정보</h1><p>사업 정보 초안을 저장하고 고객에게 공개할 내용을 명시적으로 승인합니다.</p></div>
        <section className="special-panel">
          <div className="panel-heading"><h2>사업 정보 초안</h2><span>서버 revision {draft.revision}{dirty ? " · 미저장 변경" : ""} · {saveState === "saving" ? "서버 저장 중" : saveState === "conflict" ? "저장 충돌" : !online && dirty ? "오프라인 · 미저장" : saveState === "failed" ? "저장 실패" : dirty ? "자동 저장 대기" : !completeDraft(draft) ? "서버 저장 완료 · 승인 전 필수 정보" : "서버 저장 완료"}</span></div>
          <form noValidate onSubmit={event => void saveDraft(event)} className="form-fields">
            <label>상호<input required maxLength={160} value={draft.businessName} onChange={event => change({ businessName: event.target.value })} /></label>
            <label>사업 소개<textarea aria-label="사업 소개" maxLength={5000} value={draft.introduction} onChange={event => change({ introduction: event.target.value })} /></label>
            <label>활동 지역<input maxLength={500} value={draft.region ?? ""} onChange={event => change({ region: event.target.value })} placeholder="예: 서울 강남구·서초구" /></label>
            <label>영업시간<textarea aria-label="영업시간" maxLength={1000} value={draft.openingHours ?? ""} onChange={event => change({ openingHours: event.target.value })} placeholder="확인된 운영 요일·시간·휴무를 입력해 주세요." /></label>
            <p>지역·영업시간은 선택 정보입니다. 등록하지 않은 값은 AI가 추정하지 않으며 승인 전 변경은 고객에게 보이지 않습니다.</p>
            <h3>서비스</h3>
            {draft.services.map((service, index) => <div key={index} className="knowledge-source">
              <label>서비스 이름<input required maxLength={160} value={service.name} onChange={event => updateService(index, { name: event.target.value })} /></label>
              <label>서비스 설명<textarea aria-label="서비스 설명" maxLength={2000} value={service.description} onChange={event => updateService(index, { description: event.target.value })} /></label>
              <button type="button" onClick={() => change({ services: draft.services.filter((_, position) => position !== index) })}>서비스 삭제</button>
            </div>)}
            <button type="button" disabled={draft.services.length >= 50} onClick={() => change({ services: [...draft.services, { name: "", description: "" }] })}>서비스 추가</button>
            <h3>자주 묻는 질문</h3>
            {draft.faqs.map((faq, index) => <div key={index} className="knowledge-source">
              <label>질문<input required maxLength={500} value={faq.question} onChange={event => updateFaq(index, { question: event.target.value })} /></label>
              <label>확인된 답변<textarea aria-label="확인된 답변" required maxLength={3000} value={faq.answer} onChange={event => updateFaq(index, { answer: event.target.value })} /></label>
              <button type="button" onClick={() => change({ faqs: draft.faqs.filter((_, position) => position !== index) })}>질문 삭제</button>
            </div>)}
            <button type="button" disabled={draft.faqs.length >= 100} onClick={() => change({ faqs: [...draft.faqs, { question: "", answer: "" }] })}>질문 추가</button>
            <button type="submit" disabled={busy || saveState === "saving" || saveState === "conflict"}>초안 저장</button>
          </form>
          {saveState === "conflict" && conflictDraft && <div className="knowledge-source" role="region" aria-label="지식 초안 저장 충돌"><h3>지식 초안 저장 충돌</h3><p>서버 {conflictDraft.revision}번과 현재 화면의 미저장 입력을 비교해 주세요. 고객 공개 정보는 바뀌지 않았습니다.</p><details><summary>서버에 저장된 초안 보기</summary><p><strong>상호:</strong> {conflictDraft.businessName}</p><p><strong>사업 소개:</strong> {conflictDraft.introduction}</p><p><strong>활동 지역:</strong> {conflictDraft.region || "미등록"}</p><p><strong>영업시간:</strong> {conflictDraft.openingHours || "미등록"}</p><ul>{conflictDraft.services.map((service, index) => <li key={index}>서비스: {service.name} · {service.description}</li>)}{conflictDraft.faqs.map((faq, index) => <li key={`faq-${index}`}>질문: {faq.question} · {faq.answer}</li>)}</ul></details><div className="preview-action"><button type="button" disabled={busy || !online} onClick={() => void resolveConflict(true)}>내 입력으로 다시 저장</button><button type="button" disabled={busy || !online} onClick={() => void resolveConflict(false)}>서버 초안 사용</button></div><p>내 입력을 선택하면 서버 변경을 대체합니다. 현재 입력은 위 편집 칸에서 확인할 수 있습니다.</p></div>}
        </section>
        <aside className="special-panel"><h2>공개 상태</h2><p>현재 승인 버전: {releaseRevision === null ? "없음" : `${releaseRevision}번`}</p><p>미저장 변경과 미승인 초안은 고객에게 보이지 않습니다.</p><button type="button" disabled={busy || dirty || saveState !== "idle" || !completeDraft(draft) || draft.revision === 0 || draft.revision === approvedDraftRevision} onClick={() => void approve()}>현재 초안 승인</button>{!completeDraft(draft) && <p>상호·서비스 이름·질문과 확인된 답변을 완성해야 승인할 수 있습니다.</p>}{dirty && <p>변경 내용을 먼저 저장해 주세요.</p>}{releaseRevision !== null && <p><a href={`/public/${draft.organizationId}`}>고객 직접 문의 화면 열기</a></p>}<p><a href="/workspace/ai">AI 설정·답변 테스트 열기</a></p><p><a href="/workspace/deployments">상담 링크·사이트 위젯 관리</a></p><p><a href="/workspace/campaigns">홍보 카드 관리</a></p><p><a href="/workspace/usage">실제 사용량 보기</a></p><p><a href="/workspace/subscription">구독·데이터 관리</a></p><p>AI 응대는 별도 활성화 단계가 필요합니다. 이 승인만으로 AI가 고객에게 답변하지 않습니다.</p></aside>
      </div>}
      {phase === "draft" && draft && activeSection === "notifications" && <section id="agent-notifications"><AgentNotificationSettings key={draft.organizationId} organizationId={draft.organizationId}>
        <div className="panel-heading"><p>읽지 않음 {notificationLoadState === "ready" ? `${unreadCount}건` : "확인 중"}</p><button type="button" onClick={() => void loadNotifications()}>알림 새로고침</button></div>{notificationLoadState === "loading" && notifications.length === 0 && <p role="status">처리 알림을 확인하는 중입니다.</p>}{notificationLoadState === "failed" && <div className="agent-owner-today-recovery" role="alert"><p>처리 알림을 확인하지 못했습니다. 기존 알림을 0건으로 판단하지 않습니다.</p><button type="button" onClick={() => void loadNotifications()}>처리 알림 다시 확인</button></div>}{notificationLoadState === "ready" && notifications.length === 0 && <p>처리할 새 알림이 없습니다.</p>}{notifications.length > 0 && <ul>{notifications.map(item => <li key={item.id}><button type="button" onClick={() => void openNotification(item)}>{notificationLabel(item.eventType)} · {item.readAt ? '읽음' : '새 알림'}</button></li>)}</ul>}
      </AgentNotificationSettings></section>}
      {phase === "draft" && <section id="agent-inquiries" aria-label="AP 직접 문의함">
        <div className="agent-inbox-heading"><div><h1>문의함</h1><p>고객과의 대화, 필요한 답변까지 한곳에서.</p></div><button type="button" onClick={() => { void loadInbox(); void loadNotifications(); }}>새로고침</button></div>
        <div className={`agent-inbox-card${inboxDetailOpen && selected ? " detail-open" : ""}`}>
          <aside className="agent-inbox-list" aria-label="AP 문의 목록">
            <div className="agent-inbox-search"><label htmlFor="agent-inbox-search">고객·문의 검색</label><input ref={inboxSearchRef} id="agent-inbox-search" type="search" placeholder="고객·문의 검색" value={inboxQuery} onChange={event => setInboxQuery(event.target.value)} />
              <div className="agent-inbox-filters" role="group" aria-label="문의 상태 필터">
                <button type="button" aria-pressed={inboxFilter === "all"} onClick={() => setInboxFilter("all")}>전체</button>
                <button type="button" aria-pressed={inboxFilter === "needed"} onClick={() => setInboxFilter("needed")}>확인 필요</button>
                <button type="button" aria-pressed={inboxFilter === "ai"} onClick={() => setInboxFilter("ai")}>AI 기록</button>
              </div>
            </div>
            <div className="agent-inbox-items" ref={inboxListRef}>
              {inboxLoadState === "failed" && <div className="agent-inbox-feedback" role="alert"><p>문의 목록을 불러오지 못했습니다. 이전 목록이 있다면 그대로 남아 있습니다.</p><button type="button" onClick={() => void loadInbox()}>목록 다시 시도</button></div>}
              {inboxLoadState === "loading" && <p className="agent-inbox-feedback" role="status">문의 목록을 확인하고 있습니다.</p>}
              {inboxLoadState === "ready" && filteredInbox.length === 0 && <p className="agent-inbox-feedback">{inbox.length === 0 ? "아직 직접 문의가 없습니다." : "현재 검색·필터에 맞는 문의가 없습니다."}</p>}
              {inboxFilter === "ai" && inboxLoadState === "ready" && <p className="agent-inbox-ai-note">고객이 동의하고 접수한 문의의 AI 대화만 표시합니다.</p>}
              {filteredInbox.map(item => <button type="button" key={item.id} data-inquiry-id={item.id} className={`agent-inbox-item${selectedInboxId === item.id ? " selected" : ""}`} aria-current={selectedInboxId === item.id ? "true" : undefined} onClick={() => void selectInquiry(item.id)}>
                <span className="agent-inbox-item-top"><strong>{item.customer_name}</strong><small title="최근 활동">{new Date(item.updated_at).toLocaleDateString('ko-KR')}</small></span>
                <span className="agent-inbox-item-service">{item.service_snapshot?.name ?? "일반 문의"} · {inquirySourceLabel(item.source_kind)}</span>
                <span className={`agent-inbox-badge${item.state === "needs_owner" ? " needed" : ""}`}>{inquiryStateLabel(item.state)}</span>
                {item.has_ai_history && <span className="agent-inbox-badge ai">AI 기록</span>}
              </button>)}
              {inboxNextCursor && inboxLoadState === "ready" && <div className="agent-inbox-page"><p>검색·필터는 불러온 목록 기준입니다.</p><button type="button" disabled={inboxLoadingMore} onClick={() => void loadInbox(inboxNextCursor)}>{inboxLoadingMore ? "이전 문의 확인 중…" : "이전 문의 더 보기"}</button>{inboxPageError && <p role="alert">이전 문의를 불러오지 못했습니다. 같은 버튼으로 다시 시도할 수 있습니다.</p>}</div>}
            </div>
          </aside>
          <div className="agent-inbox-thread" aria-label="선택한 문의 대화">
            {selected ? <>
              <header className="agent-inbox-thread-head"><button ref={inboxBackRef} className="agent-inbox-back" type="button" onClick={closeInboxDetail} aria-label="문의 목록으로">‹</button><span className="agent-inbox-avatar" aria-hidden="true">{selected.customerName.slice(0, 1)}</span><div><h2>{selected.customerName} <small>고객</small></h2><p>{selected.customerPhone} · 연락처 미인증</p></div>{selected.state === "closed" || selected.state === "spam" ? <span className="agent-inbox-badge">{inquiryStateLabel(selected.state)}</span> : <button className="agent-inbox-close" type="button" disabled={busy || closeResultUnknown || Boolean(replyBody.trim() || noteBody.trim())} onClick={() => void closeSelectedInquiry()}>처리 완료</button>}</header>
              <div className="agent-inbox-thread-info"><strong>{selected.service?.name ?? "일반 문의"}</strong><span>AP 원본 대화 · {inquirySourceLabel(selected.sourceKind)} · {inquiryStateLabel(selected.state)}</span><p>{selected.retention?.workPurgedAt ? "보존 기간이 종료되었습니다. 기존 확인 권한과 처리 이력은 유지됩니다." : selected.state === "closed" ? "고객이 확인키로 원본을 읽고 추가 질문을 남기면 다시 확인 필요로 열립니다." : selected.state === "spam" ? "원본을 보존하며 이 대화의 고객·사업자 알림을 중단했습니다.": "고객에게 답변을 저장하면 확인키로 열람할 수 있습니다. 외부 알림은 미연결 상태입니다."}</p>{Boolean(replyBody.trim() || noteBody.trim()) && selected.state !== "closed" && <p>작성 중인 답변·메모를 저장하거나 비우면 처리 완료를 선택할 수 있습니다.</p>}{closeFeedback && <p role="status" className="agent-inbox-close-feedback">{closeFeedback}</p>}{closeResultUnknown && <button type="button" className="agent-inbox-close-refresh" disabled={busy} onClick={() => void refreshCloseState(selected.id)}>현재 상태 다시 확인</button>}<a href={`/v1/owner/inquiries/${selected.id}/export`}>대화 기록 JSON 다운로드</a></div>
              <AgentRetentionNotice retention={selected.retention}/>{!selected.retention?.workPurgedAt&&<div className="agent-inbox-spam-control"><p>{selected.state === "spam" ? "이 대화의 알림을 중단했습니다. 고객의 후속 메시지와 내부 메모는 원본에 보존됩니다." : "스팸으로 분류하면 원본을 보존하고 이 대화의 알림을 중단합니다."}</p><button type="button" disabled={busy || closeResultUnknown || Boolean(replyBody.trim() || noteBody.trim())} onClick={() => void classifySelectedSpam(selected.state !== "spam")}>{selected.state === "spam" ? "스팸 해제" : "스팸으로 분류"}</button>{Boolean(replyBody.trim() || noteBody.trim()) && <p>작성 중인 답변·메모를 저장하거나 비운 뒤 분류를 변경할 수 있습니다.</p>}</div>}
              <div className="agent-inbox-messages">{selected.messages.map(message => <div key={message.id} className={`agent-inbox-message ${message.visibility === "internal" ? "internal" : message.actor === "owner" ? "mine" : ""}`}><strong>{message.visibility === "internal" ? "내부 메모" : message.actor === "owner" ? "사업자" : message.actor === "assistant" ? "AI" : "고객"}</strong><p>{message.body}</p>{message.visibility !== "internal" && message.actor === "owner" && <small>알림 {deliveryLabel(message.delivery_state)}</small>}
                {selected.attachments.filter(item => item.messageId === message.id).map((attachment, index) => <PrivateInquiryPhoto key={attachment.id} inquiryId={selected.id} attachmentId={attachment.id} label={`고객 첨부 사진 ${index + 1}`} />)}</div>)}</div>
              {selected.retention?.workPurgedAt?<p className="agent-inbox-closed-note">보존 기간이 종료되어 새 답변과 내부 메모 작성은 종료되었습니다.</p>:selected.state === "closed" ? <p className="agent-inbox-closed-note">이 문의는 처리 완료 상태입니다. 고객이 추가 질문을 남기면 다시 답변할 수 있습니다.</p> : selected.state === "spam" ? <p className="agent-inbox-closed-note">고객 답변을 저장하려면 먼저 스팸 분류를 해제해 주세요. 내부 메모는 계속 저장할 수 있습니다.</p> : <div className="agent-inbox-editor-tabs" role="group" aria-label="답변 작성 방식"><button type="button" aria-pressed={inboxEditor === "reply"} onClick={() => setInboxEditor("reply")}>고객에게 답변</button><button type="button" aria-pressed={inboxEditor === "note"} onClick={() => setInboxEditor("note")}>내부 메모</button></div>}
              {selected.retention?.workPurgedAt || selected.state === "closed" ? null : selected.state !== "spam" && inboxEditor === "reply" ? <form className="agent-inbox-editor" onSubmit={event => void sendOwnerMessage(event, "replies")}><label htmlFor="agent-inbox-reply">고객에게 답변</label><textarea id="agent-inbox-reply" required maxLength={5000} placeholder="고객에게 전달할 답변을 작성해 주세요." value={replyBody} onChange={event => setReplyBody(event.target.value)} /><div><span>AP에 저장 · 외부 알림 미연결</span><button type="submit" disabled={busy}>답변 저장 →</button></div></form>
                : !selected.retention?.workPurgedAt&&<form className="agent-inbox-editor" onSubmit={event => void sendOwnerMessage(event, "notes")}><label htmlFor="agent-inbox-note">내부 메모</label><textarea id="agent-inbox-note" required maxLength={5000} placeholder="사업자만 보는 메모를 남겨주세요." value={noteBody} onChange={event => setNoteBody(event.target.value)} /><div><span>고객에게 공개되지 않습니다.</span><button type="submit" disabled={busy}>메모 저장 →</button></div></form>}
            </> : <div className="agent-inbox-empty-thread"><span aria-hidden="true">▤</span><h2>문의를 선택해 주세요</h2><p>목록에서 고객 문의를 열면 원본 대화와 답변 작성이 표시됩니다.</p></div>}
          </div>
        </div>
      </section>}
      {phase === "draft" && <section className="agent-owner-more" id="agent-more"><h1>더보기</h1><p>AP 사업 운영 기능과 계정 관리를 엽니다.</p><div><a href="/workspace/deployments">상담 링크·위젯</a><a href="/workspace/campaigns">홍보 카드</a><a href="/workspace/integrations">Field 연결</a><a href="/workspace/usage">사용량</a><a href="/workspace/subscription">구독·데이터 관리</a><a href="/workspace/moderation">신고·검토 결과</a></div></section>}
    </main>
    {phase === "draft" && <nav className="agent-owner-mobile-nav" aria-label="AP 모바일 관리 메뉴"><a href="#agent-today" aria-current={activeSection === "today" ? "page" : undefined} onClick={event => { event.preventDefault(); showOwnerSection("today"); }}>오늘</a><a href="#agent-inquiries" aria-current={activeSection === "inbox" ? "page" : undefined} onClick={event => { event.preventDefault(); showOwnerSection("inbox"); }}>문의</a><a href="/workspace/ai">내 AI</a><a href="#agent-knowledge" aria-current={activeSection === "knowledge" ? "page" : undefined} onClick={event => { event.preventDefault(); showOwnerSection("knowledge"); }}>승인</a><a href="#agent-more" aria-current={activeSection === "more" ? "page" : undefined} onClick={event => { event.preventDefault(); showOwnerSection("more"); }}>더보기</a></nav>}
  </div>;
}
