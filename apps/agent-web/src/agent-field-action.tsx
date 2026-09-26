"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type Service = { id: string; name: string; description: string; bookingMode: "request" | "slot" };
type Connection = { connectionId: string; fieldOrganizationId?: string; businessName?: string;
  state: string; services: Service[] };
type Availability = { catalogRevision: number; policyRevision: number; timezone: string;
  service: Service & { durationMinutes: number; priceAmount: number | null };
  slots: { startAt: string; endAt: string }[] };
type Preview = Availability & { conditionsHash: string; customer: { name: string; phone: string } };
type Action = { actionRequestId: string; kind: "inquiry" | "reservation_request"; state: string; serviceName: string;
  priceAmount: number | null; reservationId: string | null; error: string | null };
type InquiryAttachment = { id: string; messageId: string; byteSize: number; width: number; height: number };
type Handoff = { actionRequestId: string; code: string; handoffUrl: string;
  reservationId: string; expiresAt: string };
type ReservationFeed = { state: string; revision: number; events: Array<{
  eventId: string; eventType: string; state: string; occurredAt: string;
  notificationState: "blocked_integration" | "not_applicable";
  startAt?: string }> };
type RequestDetails = { mode: "inquiry"; timezone: string }
  | { mode: "preferred"; preferredTimeText: string; timezone: string }
  | { mode: "slot"; startAt: string; timezone: string };
const newKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
async function api(path: string, receiptKey: string, method = "GET", body?: unknown,
  headers?: Record<string, string>) {
  const response = await fetch(path, { method, credentials: "same-origin",
    headers: { authorization: `Bearer ${receiptKey}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
function actionLabel(state: string, error?: string | null, kind?: Action["kind"]) {
  if (state === "rejected" && error === "field_subscription_ended")
    return "Field 체험이 종료되어 새 요청을 접수하지 않습니다. 기존 상담과 예약은 확인할 수 있습니다.";
  switch (state) {
    case "accepted_external": return kind === "inquiry"
      ? "Field에 문의 접수됨 · 사업자 응답 대기" : "Field에 요청 접수됨 · 예약 확정 전";
    case "delivery_unknown": return "전달 결과 확인 중 · 새 요청을 만들지 마세요";
    case "sending": return "Field에 전달 중";
    case "rejected": return "Field가 접수하지 않음 · 조건을 다시 확인하세요";
    default: return state;
  }
}
function reservationLabel(state: string) {
  const labels: Record<string, string> = { requested: "요청 접수", proposed: "시간 제안",
    customer_accepted: "고객 제안 수락", confirmed: "예약 확정", change_requested: "변경 요청",
    change_proposed: "변경 시간 제안", change_accepted: "변경 제안 수락",
    cancel_requested: "취소 요청", canceled: "취소됨", rejected: "거절됨",
    expired: "기한 만료", completed: "방문 완료", no_show: "미방문" };
  return labels[state] ?? state;
}

export function AgentFieldAction({ inquiryId, receiptKey, initialSummary = '', externalReady = false }: {
  inquiryId: string; receiptKey: string; initialSummary?: string; externalReady?: boolean;
}) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionIssues, setConnectionIssues] = useState<string[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [kind, setKind] = useState<"reservation_request" | "inquiry">("reservation_request");
  const [date, setDate] = useState("");
  const [startAt, setStartAt] = useState("");
  const [preferredTimeText, setPreferredTimeText] = useState("");
  const [summary, setSummary] = useState(initialSummary);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [requestDetails, setRequestDetails] = useState<RequestDetails | null>(null);
  const [consent, setConsent] = useState(false);
  const [actions, setActions] = useState<Action[]>([]);
  const [attachments, setAttachments] = useState<InquiryAttachment[]>([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [reservationFeeds, setReservationFeeds] = useState<Record<string, ReservationFeed>>({});
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const loadedInquiry = useRef<{ inquiryId: string; receiptKey: string } | null>(null);
  const connection = connections.find(item => item.connectionId === connectionId);
  const service = connection?.services.find(item => item.id === serviceId);

  useEffect(() => {
    let active = true;
    const inquiryChanged = loadedInquiry.current?.inquiryId !== inquiryId
      || loadedInquiry.current?.receiptKey !== receiptKey;
    loadedInquiry.current = { inquiryId, receiptKey };
    setConnections([]); setConnectionIssues([]); setConnectionId(""); setServiceId("");
    if (inquiryChanged) setActions([]);
    setPreview(null); setAvailability(null); setConsent(false); attempt.current = null;
    if (inquiryChanged) { setAttachments([]); setSelectedAttachmentIds([]); }
    setHandoff(null);
    setReservationFeeds({});
    setLoadError("");
    void Promise.allSettled([
      api(`/v1/inquiries/${inquiryId}/field-services`, receiptKey),
      api(`/v1/inquiries/${inquiryId}/field-actions`, receiptKey),
      api(`/v1/inquiries/${inquiryId}`, receiptKey),
    ]).then(([servicesResult, historyResult, inquiryResult]) => {
      if (!active) return;
      const found = servicesResult.status === "fulfilled" ? servicesResult.value : null;
      const history = historyResult.status === "fulfilled" ? historyResult.value : null;
      const inquiry = inquiryResult.status === "fulfilled" ? inquiryResult.value : null;
      if (found?.status === 200) {
        const listed = (found.data as { connections?: Connection[] }).connections ?? [];
        const available = listed
          .filter(item => item.state === "available" && item.services.length > 0);
        setConnectionIssues(listed.filter(item => item.state !== "available").map(item => item.state));
        setConnections(available);
        setConnectionId(available[0]?.connectionId ?? "");
        setServiceId(available[0]?.services[0]?.id ?? "");
      }
      if (history?.status === 200)
        setActions((history.data as { actions?: Action[] }).actions ?? []);
      if (inquiry?.status === 200) {
        const current = (inquiry.data as { attachments?: InquiryAttachment[] }).attachments ?? [];
        setAttachments(current);
        setSelectedAttachmentIds(previous => previous.filter(id => current.some(item => item.id === id)));
      }
      if (found?.status !== 200 || history?.status !== 200 || inquiry?.status !== 200)
        setLoadError("Field 연결 정보를 불러오지 못했습니다. 기존 전달 기록은 남아 있으며 다시 조회할 수 있습니다.");
    });
    return () => { active = false; };
  }, [inquiryId, receiptKey, reloadVersion]);

  function resetPreview() { setPreview(null); setRequestDetails(null); setConsent(false); attempt.current = null; }
  async function refreshAttachments() {
    try {
      const result = await api(`/v1/inquiries/${inquiryId}`, receiptKey);
      if (result.status !== 200) { setNotice("문의 사진 목록을 열지 못했습니다."); return; }
      const current = (result.data as { attachments?: InquiryAttachment[] }).attachments ?? [];
      setAttachments(current);
      setSelectedAttachmentIds(previous => previous.filter(id => current.some(item => item.id === id)));
      resetPreview();
      setNotice(`AP 문의 사진 ${current.length}개를 확인했습니다. 전달할 사진을 직접 선택해 주세요.`);
    } catch { setNotice("문의 사진 목록을 열지 못했습니다."); }
  }
  async function loadAvailability(reason: "initial" | "changed" = "initial") {
    if (!connectionId || !serviceId || (service?.bookingMode === "slot" && !date)) return;
    setBusy(true); setNotice(reason === "changed"
      ? "Field 조건이 바뀌었습니다. 이전 동의를 해제하고 현재 가격·시간을 다시 확인합니다."
      : "Field의 현재 시간과 조건을 확인합니다.");
    setAvailability(null); resetPreview();
    if (reason === "changed") setStartAt("");
    const url = `/v1/inquiries/${inquiryId}/field-connections/${connectionId}/services/${serviceId}/availability`
      + (date && service?.bookingMode === "slot" ? `?date=${encodeURIComponent(date)}` : "");
    try {
      const result = await api(url, receiptKey);
      if (result.status !== 200) {
        setAvailability(null); setNotice(`Field의 현재 조건을 확인하지 못했습니다 (${result.status}).`);
      } else { setAvailability(result.data as Availability);
        setNotice(reason === "changed"
          ? "Field 조건이 변경됐습니다. 표시된 현재 가격·시간을 확인한 뒤 전달 내용을 다시 확인하고 동의해 주세요."
          : "현재 조건을 확인했습니다. 전달 내용을 확인해 주세요."); }
    } catch { setAvailability(null); setNotice("Field의 현재 조건 응답을 받지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function checkTerms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!availability || !connectionId || !serviceId) return;
    const details: RequestDetails = kind === "inquiry"
      ? { mode: "inquiry", timezone: availability.timezone }
      : availability.service.bookingMode === "slot"
        ? { mode: "slot", startAt, timezone: availability.timezone }
        : { mode: "preferred", preferredTimeText: preferredTimeText.trim(), timezone: availability.timezone };
    if ((details.mode === "slot" && !details.startAt)
      || (details.mode === "preferred" && !details.preferredTimeText)) return;
    setBusy(true); setNotice("제출 직전 Field 조건을 다시 확인합니다."); resetPreview();
    try {
      const result = await api(`/v1/inquiries/${inquiryId}/field-availability`, receiptKey, "POST",
        { connectionId, serviceId, request: details });
      if (result.status === 200) {
        setPreview(result.data as Preview); setRequestDetails(details);
        setNotice("조건을 확인했습니다. 고객 정보와 전달 항목을 보고 동의해 주세요.");
      } else if (result.status === 409) await loadAvailability("changed");
      else { setAvailability(null); setNotice(`현재 조건을 확인하지 못했습니다 (${result.status}).`); }
    } catch { setAvailability(null); setNotice("Field 조건 확인 응답을 받지 못했습니다. 다시 확인해 주세요."); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!preview || !requestDetails || !consent || !connectionId || !serviceId) return;
    const body = { connectionId, serviceId, kind, request: requestDetails,
      summary: summary.trim(), expectedServiceRevision: preview.catalogRevision,
      expectedPolicyRevision: preview.policyRevision, conditionsHash: preview.conditionsHash,
      attachmentIds: selectedAttachmentIds, consent: true };
    if (!body.summary) { setNotice("전달 요약을 입력해 주세요."); return; }
    const fingerprint = JSON.stringify(body);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: newKey() };
    setBusy(true); setNotice("Field에 요청을 전달합니다. 결과가 불분명하면 같은 요청 ID를 조회합니다.");
    try {
      const result = await api(`/v1/inquiries/${inquiryId}/field-actions`, receiptKey, "POST", body,
        { "idempotency-key": attempt.current.key });
      if (result.status === 201 || result.status === 200 || result.status === 202) {
        const action = result.data as Action;
        setActions(previous => [action, ...previous.filter(item => item.actionRequestId !== action.actionRequestId)]);
        setNotice(actionLabel(action.state, action.error, action.kind));
        if (action.state === "accepted_external") { attempt.current = null; resetPreview(); }
      } else if (result.status === 409 && (result.data as { error?: string }).error === "service_conditions_changed") {
        await loadAvailability("changed");
      } else if (result.status === 409 && (result.data as { error?: string }).error === "prior_delivery_unknown") {
        const actionId = (result.data as { actionRequestId?: string }).actionRequestId;
        setNotice("이전 전달 결과가 확인되지 않았습니다. 해당 요청을 먼저 조회해 주세요.");
        if (actionId) await reconcile(actionId);
      } else setNotice(result.status === 409 ? "Field 조건이 바뀌었거나 이미 다른 내용으로 제출했습니다. 다시 확인해 주세요."
        : `Field 요청을 전달하지 못했습니다 (${result.status}).`);
    } catch { setNotice("전달 응답을 받지 못했습니다. 같은 버튼을 다시 누르면 같은 제출 키로 확인합니다."); }
    finally { setBusy(false); }
  }
  async function reconcile(actionId: string) {
    setBusy(true); setNotice("Field에 원래 요청 ID의 수신 여부를 확인합니다.");
    try {
      const result = await api(`/v1/inquiries/${inquiryId}/field-actions/${actionId}/reconcile`, receiptKey, "POST");
      if (result.status === 200 || result.status === 202) {
        const action = result.data as Action;
        setActions(previous => [action, ...previous.filter(item => item.actionRequestId !== action.actionRequestId)]);
        setNotice(actionLabel(action.state, action.error, action.kind));
      } else setNotice(`수신 결과를 확인하지 못했습니다 (${result.status}). 다시 조회해 주세요.`);
    } catch { setNotice("Field 응답을 받지 못했습니다. 같은 요청 ID로 나중에 다시 조회해 주세요."); }
    finally { setBusy(false); }
  }
  async function issueHandoff(actionId: string) {
    setBusy(true); setHandoff(null); setNotice("Field 예약 접근 코드를 발급합니다.");
    try {
      const result = await api(`/v1/inquiries/${inquiryId}/field-actions/${actionId}/handoff`,
        receiptKey, "POST");
      if (result.status === 201) {
        setHandoff({ ...(result.data as Omit<Handoff, "actionRequestId">), actionRequestId: actionId });
        setNotice("5분 안에 Field 화면에서 코드를 교환해 예약 확인키를 받으세요.");
      } else setNotice(result.status === 403 ? "Field 고객 접근 권한에 새 사업자 동의가 필요합니다."
        : result.status === 429 ? "접근 코드를 여러 번 발급했습니다. 잠시 뒤 다시 시도해 주세요."
          : `Field 접근 코드를 발급하지 못했습니다 (${result.status}).`);
    } catch { setNotice("Field 접근 코드 응답을 받지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  async function syncReservation(actionId: string) {
    setBusy(true); setNotice("Field 예약 상태를 확인하고 AP 기록에 반영합니다.");
    try {
      const result = await api(`/v1/inquiries/${inquiryId}/field-actions/${actionId}/sync-events`,
        receiptKey, "POST");
      if (result.status === 200) {
        const feed = result.data as ReservationFeed;
        setReservationFeeds(previous => ({ ...previous, [actionId]: feed }));
        setNotice(`Field 예약 상태: ${reservationLabel(feed.state)}. AP의 고객 외부 알림 발송 결과는 별도로 확인해야 합니다.`);
      } else setNotice(result.status === 403 ? "Field 사건 조회에 사업자 재동의가 필요합니다."
        : `Field 예약 상태를 확인하지 못했습니다 (${result.status}). 이전 확인 상태를 유지합니다.`);
    } catch { setNotice("Field 예약 상태 응답을 받지 못했습니다. 이전 확인 상태를 유지합니다."); }
    finally { setBusy(false); }
  }

  if (!connections.length && !connectionIssues.length && !actions.length && !loadError && !externalReady) return null;
  return <section className="special-panel" aria-label="Field 외부 요청">
    {externalReady && !connections.length && !connectionIssues.length && !loadError &&
      <p>현재 요청 가능한 Field 연결이 없습니다. 아직 Field에 전달되지 않았습니다. 위 확인키로 AP 대화를 열어 사람에게 문의할 수 있습니다.</p>}
    <h2>Field에 별도 문의·예약 요청</h2>
    <p>AP의 대화는 여기에 남고, Field 사업장에는 아래에 동의한 정보만 전달됩니다. 예약 확정은 Field 사업자가 합니다.</p>
    {loadError && <div className="state-message" role="alert"><p>{loadError}</p>
      <button type="button" disabled={busy} onClick={() => setReloadVersion(value => value + 1)}>다시 불러오기</button>
    </div>}
    {connectionIssues.length > 0 && !loadError && <div className="state-message" role="status">
      {connectionIssues.includes("field_facts_unavailable") &&
        <p>Field 현재 정보를 확인하지 못했습니다. 잠시 뒤 다시 확인해 주세요.</p>}
      {connectionIssues.includes("field_reauthorization_required") &&
        <p>일부 Field 연결은 사업자 재동의가 필요합니다. 해당 연결로는 요청할 수 없습니다.</p>}
      {connectionIssues.some(state => state !== "field_facts_unavailable"
        && state !== "field_reauthorization_required") &&
        <p>일부 Field 연결을 사용할 수 없습니다. 사업자에게 연결 상태 확인을 요청해 주세요.</p>}
      <p>AP 문의와 기존 전달 기록은 계속 확인할 수 있습니다.</p>
      <button type="button" disabled={busy} onClick={() => setReloadVersion(value => value + 1)}>Field 정보 다시 확인</button>
    </div>}
    {notice && <p role="status" className="state-message">{notice}</p>}
    {actions.length > 0 && <div className="knowledge-source"><h3>전달 기록</h3><ul>{actions.map(action =>
      <li key={action.actionRequestId}><strong>{action.serviceName}</strong> · {actionLabel(action.state, action.error, action.kind)}
        <p className="agent-action-request-id">AP 요청 ID: <code>{action.actionRequestId}</code></p>
        {reservationFeeds[action.actionRequestId] && <p>Field 현재 상태: {reservationLabel(reservationFeeds[action.actionRequestId]!.state)}
          {reservationFeeds[action.actionRequestId]!.events.some(event => event.notificationState === "blocked_integration")
            ? " · AP 고객 외부 알림 미발송" : ""}</p>}
        {action.state === "delivery_unknown" || action.state === "sending"
          ? <button type="button" disabled={busy} onClick={() => void reconcile(action.actionRequestId)}>원래 요청 ID로 확인</button> : null}
        {action.state === "accepted_external" && action.reservationId
          ? <><button type="button" disabled={busy} onClick={() => void syncReservation(action.actionRequestId)}>
              Field 예약 상태 확인</button>
            <button type="button" disabled={busy} onClick={() => void issueHandoff(action.actionRequestId)}>
              Field 예약 접근 코드 발급</button></> : null}
      </li>)}</ul></div>}
    {handoff && <div className="customer-banner"><h3>Field 예약 접근 코드</h3>
      <p>이 코드는 5분 동안 한 번만 사용할 수 있습니다. 전화번호나 예약 ID만으로는 예약을 열 수 없습니다.</p>
      <code>{handoff.code}</code><p>Field에서 교환하면 별도의 예약 확인키가 발급됩니다. 재교환 시 이전 Field 확인키는 폐기됩니다.</p>
      <p><a href={handoff.handoffUrl} target="_blank" rel="noopener noreferrer">Field에서 코드 교환하기</a></p>
    </div>}
    {connections.length > 0 && !loadError && <><div className="form-fields">
      <div className="knowledge-source"><h3>Field에 전달할 AP 문의 사진</h3>
        <p>사진은 선택한 것만 별도 동의로 전달합니다. Field의 접수 후 비공개 복사 상태는 Field 사업자가 확인합니다.</p>
        <button type="button" disabled={busy} onClick={() => void refreshAttachments()}>사진 목록 새로고침</button>
        {attachments.length === 0 ? <p>현재 첨부된 사진이 없습니다.</p> : <ul>{attachments.map((item, index) =>
          <li key={item.id}><label><input type="checkbox" checked={selectedAttachmentIds.includes(item.id)}
            disabled={busy || (!selectedAttachmentIds.includes(item.id) && selectedAttachmentIds.length >= 5)}
            onChange={event => { setSelectedAttachmentIds(previous => event.target.checked
              ? [...previous, item.id] : previous.filter(id => id !== item.id)); resetPreview(); }} />
            문의 사진 {index + 1} · {item.width}×{item.height}</label></li>)}</ul>}
      </div>
      <label>Field 사업장<select value={connectionId} onChange={event => {
        const next = connections.find(item => item.connectionId === event.target.value);
        setConnectionId(event.target.value); setServiceId(next?.services[0]?.id ?? "");
        setAvailability(null); resetPreview();
      }}>{connections.map(item => <option key={item.connectionId} value={item.connectionId}>{item.businessName}</option>)}</select></label>
      <label>서비스<select value={serviceId} onChange={event => {
        setServiceId(event.target.value); setAvailability(null); setStartAt(""); resetPreview();
      }}>{connection?.services.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>전달 종류<select value={kind} onChange={event => {
        setKind(event.target.value as typeof kind); resetPreview();
      }}><option value="reservation_request">예약 요청</option><option value="inquiry">일반 문의</option></select></label>
      {service?.bookingMode === "slot" && <label>날짜<input type="date" value={date} onChange={event => {
        setDate(event.target.value); setAvailability(null); setStartAt(""); resetPreview();
      }} /></label>}
      <button type="button" disabled={busy || !service || (service.bookingMode === "slot" && !date)}
        onClick={() => void loadAvailability()}>현재 가격·시간 확인</button>
    </div>
    {availability && <form className="form-fields" onSubmit={event => void checkTerms(event)}>
      <p><strong>{availability.service.name}</strong> · 가격 {availability.service.priceAmount === null
        ? "별도 확인" : `${availability.service.priceAmount.toLocaleString()}원`} · 소요 {availability.service.durationMinutes}분</p>
      {kind === "reservation_request" && (availability.service.bookingMode === "slot"
        ? <label>요청 시간<select required value={startAt} onChange={event => { setStartAt(event.target.value); resetPreview(); }}>
          <option value="">시간을 선택해 주세요</option>{availability.slots.map(slot =>
            <option key={slot.startAt} value={slot.startAt}>{new Date(slot.startAt).toLocaleString("ko-KR", { timeZone: availability.timezone })}</option>)}</select></label>
        : <label>희망 시간<textarea required maxLength={500} value={preferredTimeText}
          onChange={event => { setPreferredTimeText(event.target.value); resetPreview(); }} /></label>)}
      <label>전달 요약<textarea required maxLength={5000} value={summary}
        onChange={event => { setSummary(event.target.value); resetPreview(); }} /></label>
      <button type="submit" disabled={busy || (kind === "reservation_request" && availability.service.bookingMode === "slot" && !startAt)}>
        제출 조건 확인</button>
    </form>}
    {preview && <div className="customer-banner"><h3>고객 전달 내용 확인</h3>
      <p>받는 곳: {connection?.businessName} (Field) · {preview.service.name}</p>
      <p>이름: {preview.customer.name} · 연락처: {preview.customer.phone}</p>
      <p>가격: {preview.service.priceAmount === null ? "별도 확인" : `${preview.service.priceAmount.toLocaleString()}원`}
        · 소요: {preview.service.durationMinutes}분 · 시간/요약: {requestDetails?.mode === "slot"
          ? new Date(requestDetails.startAt).toLocaleString("ko-KR", { timeZone: preview.timezone })
          : requestDetails?.mode === "preferred" ? requestDetails.preferredTimeText : summary}</p>
      <p>서비스 조건 {preview.catalogRevision}번 · 예약 정책 {preview.policyRevision}번. Field가 접수 후 사업자가 확정합니다.</p>
      <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
        표시된 이름·연락처·서비스·{kind === "reservation_request" ? "요청 시간" : "문의 요약"}
        {selectedAttachmentIds.length ? `·선택한 사진 ${selectedAttachmentIds.length}개` : ""}를 Field 사업장에 전달하는 데 동의합니다.</label>
      <button type="button" disabled={busy || !consent} onClick={() => void submit()}>Field에 요청 전달</button>
    </div>}</>}
  </section>;
}
