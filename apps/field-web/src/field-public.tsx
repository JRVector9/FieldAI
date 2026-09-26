"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { requestJson, type Catalog, type FallbackInput, type Inquiry } from "./field-api";
import { FieldRequestFallback, fallbackSubmission } from "./FieldRequestFallback";
import { PublicBookingPanel } from "./field-booking";
import { FieldReceipt } from "./field-receipt";
import { FieldRetentionNotice } from "./FieldRetentionNotice";
import { consumeReceiptHandoff } from "./receipt-handoff";
import { PrivateInquiryPhoto } from "./private-inquiry-photo";
import { ReceiptRotationPanel } from "./receipt-rotation";
import { inquiryDeliveryLabel } from "./field-notification-label";
import { clearPendingPublicSubmission, publicSubmissionFingerprint, readPendingPublicSubmission,
  writePendingPublicSubmission, type PendingPublicSubmission } from "./pending-public-submission";
import { clearPendingMessageSubmission, messageSubmissionFingerprint, readPendingMessageSubmission,
  writePendingMessageSubmission, type PendingMessageSubmission } from "./pending-message-submission";

const randomSubmissionKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const maxInquiryPhotos = 5;
const maxInquiryPhotoBytes = 8 * 1024 * 1024;
function selectedInquiryPhotos(files: FileList | null) {
  const selected = Array.from(files ?? []);
  if (selected.length > maxInquiryPhotos) return { selected: [], error: "사진은 최대 5장까지 선택할 수 있습니다." };
  if (selected.some(file => file.size > maxInquiryPhotoBytes))
    return { selected: [], error: "사진은 장당 8MB 이하로 선택해 주세요." };
  return { selected, error: "" };
}
const inquiryStateLabels: Record<string, string> = {
  needs_owner: "확인 필요", waiting_customer: "고객 답변 대기", closed: "처리 완료",
};
async function uploadInquiryPhoto(inquiryId: string, messageId: string, receiptKey: string, photo: File) {
  if (photo.size > maxInquiryPhotoBytes) return 413;
  const response = await fetch(`/v1/inquiries/${inquiryId}/messages/${messageId}/attachments`, {
    method: "POST", credentials: "same-origin", headers: {
      authorization: `Bearer ${receiptKey}`, "content-type": "application/octet-stream",
    }, body: photo, signal: AbortSignal.timeout(30_000),
  });
  return response.status;
}

function SelectedInquiryPhoto({ file }: { file: File }) {
  const preview = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = preview.current;
    if (image) image.src = url;
    return () => { if (image) image.removeAttribute("src"); URL.revokeObjectURL(url); };
  }, [file]);
  return <li><img ref={preview} alt="" /><span>{file.name}</span></li>;
}

function SelectedInquiryPhotos({ photos }: { photos: File[] }) {
  if (photos.length === 0) return null;
  return <ul className="field-selected-inquiry-photos" aria-label="선택한 문의 사진">
    {photos.map((file, index) => <SelectedInquiryPhoto key={`${file.name}-${file.lastModified}-${index}`} file={file} />)}
  </ul>;
}

export function PublicCatalogPage({ id }: { id: string }) {
  const [ownerTest, setOwnerTest] = useState<boolean | null>(null);
  const [testGate, setTestGate] = useState<{ siteRevision: number;
    existingTest: { id: string; state: string } | null } | null>(null);
  const [testGateFailed, setTestGateFailed] = useState(false);
  const [testStatus, setTestStatus] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [status, setStatus] = useState("승인된 사업 정보를 확인하고 있습니다.");
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "unpublished" | "failed">("loading");
  const [catalogReload, setCatalogReload] = useState(0);
  const [serviceId, setServiceId] = useState("");
  const [bookingServiceId, setBookingServiceId] = useState("");
  const [bookingTimeSummary, setBookingTimeSummary] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [visitRegion, setVisitRegion] = useState("");
  const [consent, setConsent] = useState(false);
  const [fallback, setFallback] = useState<FallbackInput | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; receiptKey: string } | null>(null);
  const [bookingReceipt, setBookingReceipt] = useState<{ id: string; receiptKey: string } | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const pendingSubmission = useRef<PendingPublicSubmission | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryRevision, setRecoveryRevision] = useState(0);
  const pendingScope = `inquiry:${id}`;
  const [busy, setBusy] = useState(false);
  const [intakeView, setIntakeView] = useState<"inquiry" | "booking">("inquiry");
  useEffect(() => {
    if (receipt) setIntakeView("inquiry");
    else if (bookingReceipt) setIntakeView("booking");
  }, [receipt, bookingReceipt]);
  useEffect(() => {
    const readHash = () => {
      if (receipt || bookingReceipt) return;
      if (window.location.hash === "#reservation") setIntakeView("booking");
      else if (window.location.hash === "#inquiry") setIntakeView("inquiry");
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, [receipt, bookingReceipt]);
  function showIntake(view: "inquiry" | "booking") {
    if (receipt || bookingReceipt) return;
    setIntakeView(view);
    window.history.replaceState(null, "", view === "booking" ? "#reservation" : "#inquiry");
  }
  useEffect(() => {
    const testMode = new URLSearchParams(window.location.search).get("ownerTest") === "1";
    setOwnerTest(testMode);
    setTestGate(null);
    setTestGateFailed(false);
    setTestStatus("");
    if (testMode) {
      void requestJson("/v1/owner/site-inquiry-test", "GET", undefined, undefined,
        { "x-organization-id": id }).then(result => {
        if (result.status === 200) setTestGate(result.data as { siteRevision: number;
          existingTest: { id: string; state: string } | null });
        else {
          setTestGateFailed(true);
          setTestStatus(result.status === 401 ? "사업자 로그인 후 이 화면을 다시 열어 주세요. 테스트 문의는 제출되지 않았습니다."
            : result.status === 404 ? "이 사업장의 테스트 권한이 없습니다. 테스트 문의는 제출되지 않았습니다."
              : result.status === 409 ? "사이트를 먼저 공개한 뒤 테스트해 주세요."
                : `테스트 권한을 확인하지 못했습니다 (${result.status}). 다시 불러와 주세요.`);
        }
      }).catch(() => {
        setTestGateFailed(true);
        setTestStatus("테스트 권한을 확인하지 못했습니다. 다시 불러와 주세요.");
      });
    }
    setCatalog(null);
    setCatalogState("loading");
    setStatus("승인된 사업 정보를 확인하고 있습니다.");
    void requestJson(`/v1/public/catalog/${id}`).then(result => {
      if (result.status === 200) {
        const value = result.data as Catalog;
        setCatalog(value);
        setCatalogState("ready");
        setServiceId(value.services[0]?.id ?? "");
        setBookingServiceId(value.services[0]?.id ?? "");
        setStatus("");
      } else if (result.status === 404) {
        setCatalogState("unpublished");
        setStatus("공개된 사업 정보가 없습니다. 주소나 공개 상태를 확인해 주세요.");
      } else {
        setCatalogState("failed");
        setStatus("사업 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      }
    }).catch(() => {
      setCatalogState("failed");
      setStatus("사업 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    });
  }, [id, catalogReload]);
  useEffect(() => {
    if (ownerTest !== false || !catalog) return;
    const attempt = readPendingPublicSubmission(pendingScope) ?? pendingSubmission.current;
    if (!attempt) return;
    let active = true;
    pendingSubmission.current = attempt;
    setHasPending(true); setRecovering(true);
    setStatus("이전 문의의 저장 결과를 확인하고 있습니다.");
    void requestJson(`${attempt.path}/recover`, "GET", undefined, undefined,
      { "idempotency-key": attempt.idempotencyKey, "x-receipt-key": attempt.receiptKey })
      .then(result => {
        if (!active) return;
        if (result.status === 200) {
          clearPendingPublicSubmission(pendingScope); pendingSubmission.current = null;
          setHasPending(false); setReceipt(result.data as { id: string; receiptKey: string });
          setStatus("새로고침 전 저장된 문의를 확인했습니다. 사진을 선택했다면 내 문의 화면에서 다시 첨부해 주세요.");
        } else setStatus(result.status === 404
          ? "이전 문의가 아직 확인되지 않았습니다. 같은 내용을 다시 입력해 재시도하거나 조회를 다시 해 주세요."
          : "이전 문의 결과를 확인하지 못했습니다. 조회를 다시 시도해 주세요.");
      }).catch(() => { if (active) setStatus("이전 문의 결과를 확인하지 못했습니다. 조회를 다시 시도해 주세요."); })
      .finally(() => { if (active) setRecovering(false); });
    return () => { active = false; };
  }, [ownerTest, catalog, pendingScope, recoveryRevision]);
  async function attachDirectPhotos(saved: { id: string; receiptKey: string }, selected: File[]) {
    try {
      const opened = await requestJson(`/v1/inquiries/${saved.id}`, "GET", undefined, saved.receiptKey);
      const messageId = opened.status === 200 ? (opened.data as Inquiry).messages[0]?.id : undefined;
      if (!messageId) {
        setStatus("문의는 저장됐지만 사진의 첨부 대상을 확인하지 못했습니다. 후속 대화에서 다시 첨부해 주세요.");
        return;
      }
      for (let index = 0; index < selected.length; index++) {
        const uploaded = await uploadInquiryPhoto(saved.id, messageId, saved.receiptKey, selected[index]!);
        if (uploaded !== 201 && uploaded !== 200) {
          setPhotos(selected.slice(index));
          setStatus(`문의는 저장됐습니다. 사진 ${index + 1}/${selected.length} 첨부에 실패했습니다 (${uploaded}). 남은 사진을 다시 시도할 수 있습니다.`);
          return;
        }
        setPhotos(selected.slice(index + 1));
      }
      setStatus(`문의와 사진 ${selected.length}건의 첨부 요청을 Field에서 확인했습니다. 동일한 내용은 한 장으로 저장됩니다. 사업자 관리실에 처리 알림이 기록됐습니다.`);
    } catch { setStatus("문의는 저장됐지만 사진 업로드 응답을 받지 못했습니다. 남은 사진을 같은 문의에 다시 첨부할 수 있습니다."); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("문의 접수 중입니다.");
    let canRecoverAfterReload = false;
    try {
      const payload = { serviceId, name, phone, message,
        ...(visitRegion.trim() ? { visitRegion: visitRegion.trim() } : {}), ...fallbackSubmission(fallback), consent };
      const path = `/v1/public/catalog/${id}/inquiries`;
      const digest = await publicSubmissionFingerprint({ path, payload });
      const fingerprint = digest ?? JSON.stringify({ path, payload });
      const previous = (digest ? readPendingPublicSubmission(pendingScope) : null) ?? pendingSubmission.current;
      if (previous && previous.fingerprint !== fingerprint) {
        setStatus("이전 문의 제출 결과가 확인되지 않았습니다. 이전 요청을 먼저 조회하거나 아래에서 명시적으로 포기해 주세요.");
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
      const result = await requestJson(path, "POST", payload, undefined,
        { 'idempotency-key': attempt.idempotencyKey, 'x-receipt-key': attempt.receiptKey });
      if (result.status === 201 || result.status === 200) {
        pendingSubmission.current = null; clearPendingPublicSubmission(pendingScope); setHasPending(false);
        const saved = result.data as { id: string; receiptKey: string };
        setReceipt(saved);
        setStatus(result.status === 200 ? "이전 문의 접수를 확인했습니다. 새 문의와 알림은 생성되지 않았습니다."
          : "문의가 Field에 저장되었습니다. 사업자 관리실에 처리 알림이 기록됐습니다.");
        if (photos.length > 0) await attachDirectPhotos(saved, photos);
      }
      else if (result.status === 409 && (result.data as { error?: string }).error === 'idempotency_conflict')
        setStatus("이 제출 키로 저장된 내용 또는 확인키가 다릅니다. 입력을 확인해 주세요.");
      else if (result.status === 429 && (result.data as { error?: string }).error === 'submission_rate_limited')
        setStatus((result.data as { scope?: string }).scope === 'organization'
          ? "이 사업장에 새 문의·예약이 짧은 시간에 많이 접수되어 잠시 제한됩니다. 입력 내용은 유지했습니다. 잠시 뒤 다시 시도해 주세요."
          : "같은 연락처의 새 문의가 짧은 시간에 여러 건 접수되어 잠시 제한됩니다. 입력 내용은 유지했습니다. 잠시 뒤 다시 시도해 주세요.");
      else if (result.status === 403 && (result.data as { error?: string }).error === "trial_ended")
        setStatus("사업자의 Field 체험이 종료되어 새 문의를 접수할 수 없습니다. 입력 내용은 유지됩니다. 기존 문의는 확인키로 열 수 있습니다.");
      else setStatus(`문의를 접수하지 못했습니다 (${result.status}). 입력 내용은 화면에 남아 있습니다.`);
    } catch { setStatus(canRecoverAfterReload
      ? "응답을 받지 못했습니다. 새로고침하면 기존 접수를 조회하거나 같은 내용을 다시 제출할 수 있습니다."
      : "응답을 받지 못했습니다. 이 브라우저는 임시 시도를 보관하지 못해 현재 화면에서만 같은 내용으로 재시도할 수 있습니다. 새로고침하지 마세요."); }
    finally { setBusy(false); }
  }
  async function submitTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!testGate || testGate.existingTest || busy) return;
    setBusy(true); setTestStatus("테스트 문의를 내부 기록에 저장하고 있습니다.");
    try {
      const result = await requestJson("/v1/owner/site-inquiry-test", "POST",
        { siteRevision: testGate.siteRevision, serviceId, name, message }, undefined,
        { "x-organization-id": id });
      if (result.status === 201 || result.status === 200) {
        const value = result.data as { id: string; siteRevision: number; state: string };
        if (value.siteRevision !== testGate.siteRevision) {
          setTestStatus("공개 사이트 버전이 바뀌었습니다. 다시 불러온 뒤 확인해 주세요.");
          return;
        }
        setTestGate(current => current ? { ...current,
          existingTest: { id: value.id, state: value.state } } : current);
        setTestStatus(result.status === 200
          ? "이전 테스트 문의를 확인했습니다. 새 기록이나 알림은 만들지 않았습니다."
          : "테스트 문의가 사업 운영의 문의함에 기록됐습니다. 외부 알림과 실적은 생성되지 않았습니다.");
      } else if (result.status === 409) {
        const error = result.data as { error?: string; id?: string };
        if (error.error === "test_already_exists" && error.id)
          setTestGate(current => current ? { ...current,
            existingTest: { id: error.id!, state: "needs_owner" } } : current);
        setTestStatus(error.error === "site_revision_changed"
          ? "공개 사이트 버전이 바뀌었습니다. 다시 불러온 뒤 테스트해 주세요."
          : "이 공개 버전의 테스트 문의가 이미 있습니다. 문의함에서 확인해 주세요.");
      } else if (result.status === 403)
        setTestStatus("사업자의 Field 체험이 종료되어 새 테스트 문의를 만들 수 없습니다.");
      else if (result.status === 401 || result.status === 404) {
        setTestGate(null); setTestGateFailed(true);
        setTestStatus("사업자 세션이나 조직 권한을 확인하지 못했습니다. 다시 로그인해 주세요.");
      } else setTestStatus(`테스트 문의를 저장하지 못했습니다 (${result.status}). 입력은 유지됩니다.`);
    } catch { setTestStatus("테스트 접수 결과를 확인할 수 없습니다. 같은 입력으로 다시 제출하면 기존 기록을 확인합니다."); }
    finally { setBusy(false); }
  }
  async function retryDirectPhotos() {
    if (!receipt || photos.length === 0) return;
    setBusy(true);
    await attachDirectPhotos(receipt, photos);
    setBusy(false);
  }
  const selectedService = catalog?.services.find(item => item.id === serviceId);
  const bookingService = catalog?.services.find(item => item.id === bookingServiceId);
  const summaryService = intakeView === "booking" ? bookingService : selectedService;
  const completed = !!receipt || !!bookingReceipt;
  const businessSummary = catalogState === "ready"
    ? [catalog?.region, catalog?.openingHours].filter(Boolean).join(" · ") || "지역·운영시간 미등록"
    : catalogState === "unpublished" ? "공개된 사업 정보 없음"
      : catalogState === "failed" ? "사업 정보 확인 실패" : "승인 정보를 불러오는 중";
  return <div className="site-shell field-public-shell">
    <header className="field-public-header"><div><strong>{catalog?.businessName ?? "사업 정보"}</strong><p>{businessSummary}</p></div>{completed ? <a href={`/public/${id}`}>홈페이지로</a> : catalog && ownerTest !== null && <a href="#business-summary">사업 정보 보기</a>}</header>
    <main className="field-public-main" data-intake-view={intakeView} data-owner-test={ownerTest ? "true" : "false"} data-complete={completed ? "true" : "false"}>
      <div className="field-public-lead">{!ownerTest && !completed && <nav className="field-public-tabs" aria-label="고객 접수 유형"><button type="button" aria-pressed={intakeView === "inquiry"} onClick={() => showIntake("inquiry")}>일반 문의</button><button type="button" aria-pressed={intakeView === "booking"} onClick={() => showIntake("booking")}>예약 요청</button></nav>}
        <h1>{ownerTest ? "사업자 첫 문의 테스트" : intakeView === "booking" ? "예약을 요청해 주세요." : "궁금한 내용을 남겨주세요."}</h1>
        <p>{ownerTest ? `${catalog?.businessName ?? "사업장"}의 고객 문의 화면을 내부 테스트로 확인합니다.` : intakeView === "booking" ? "요청을 보내면 사업자가 확인한 뒤 확정합니다." : "사업자가 확인하고 같은 대화에서 답변합니다."}</p>
      </div>
      {status && !receipt && <p role="status" className="state-message">{status}</p>}
      {testStatus && <p role="status" className="state-message">{testStatus}</p>}
      {catalogState === "failed" && <button type="button" onClick={() => setCatalogReload(value => value + 1)}>사업 정보 다시 불러오기</button>}
      {ownerTest && testGateFailed && <p><button type="button" onClick={() => setCatalogReload(value => value + 1)}>테스트 권한 다시 확인</button> <a href="/workspace">사업 운영으로 이동</a></p>}
      {ownerTest && !testGate && !testGateFailed && <p role="status">사업자 테스트 권한을 확인하고 있습니다.</p>}
      {catalog && ownerTest !== null && <><div className="field-public-intake-grid">
        <aside className="special-panel field-public-summary" id="business-summary"><h2>{catalog.businessName}</h2><dl><div><dt>선택 서비스</dt><dd>{summaryService?.name ?? "선택 전"}</dd></div><div><dt>가격 안내</dt><dd>{summaryService?.priceAmount === null ? "가격 문의" : summaryService ? `${summaryService.priceAmount.toLocaleString("ko-KR")}원` : "선택 전"}</dd></div>{intakeView === "booking" && <div><dt>희망 시간</dt><dd>{bookingTimeSummary || "선택 전"}</dd></div>}<div><dt>활동 지역</dt><dd>{catalog.region || "미등록"}</dd></div><div><dt>운영시간</dt><dd>{catalog.openingHours || "미등록"}</dd></div></dl><p className="field-public-summary-note">상담과 예약 조건은 사업자가 직접 확인합니다. 예약 요청은 확정 일정이 아닙니다.</p><p className="field-public-summary-foot">외부 알림 공급사가 연결되지 않은 경우 발송 상태를 별도로 안내합니다. 접수 원본은 Field에서 관리합니다.</p></aside>
        <section className={`special-panel field-public-inquiry${receipt ? " field-success-card" : ""}`}>{!receipt && <h2>{ownerTest ? "문의 테스트 작성" : "문의 남기기"}</h2>}
          {ownerTest && <p>사업자만 제출할 수 있습니다. 연락처·고객 동의·예약 점유·외부 알림은 만들지 않습니다. 공개 버전마다 한 번 기록됩니다.</p>}
          {ownerTest && testGate?.existingTest ? <div className="customer-banner"><strong>이 공개 버전의 테스트 문의가 이미 있습니다.</strong><p>문의함에서 내부 기록과 답변을 확인해 주세요.</p><a href="/workspace">문의함에서 보기</a></div>
            : !ownerTest && receipt ? <FieldReceipt kind="inquiry" businessName={catalog.businessName} id={receipt.id} receiptKey={receipt.receiptKey} notice={status} busy={busy} />
              : (!ownerTest || testGate) && <form className="form-fields" onSubmit={event => void (ownerTest ? submitTest(event) : submit(event))}>
                {!ownerTest && hasPending && <div className="customer-banner"><p>이전 제출 시도를 보관 중입니다. 같은 내용을 다시 입력하면 같은 문의로 재시도합니다. 다른 내용을 보내려면 기존 결과를 먼저 확인해 주세요.</p>
                  <button type="button" disabled={busy || recovering} onClick={() => setRecoveryRevision(value => value + 1)}>이전 문의 조회</button>
                  <button type="button" disabled={busy || recovering} onClick={() => {
                    clearPendingPublicSubmission(pendingScope); pendingSubmission.current = null; setHasPending(false);
                    setStatus("이전 시도를 포기했습니다. 이미 저장됐을 가능성이 있으므로 새 문의 전에 사업자에게 확인해 주세요.");
                  }}>이전 시도 포기하고 새 문의</button></div>}
                <label>서비스<select required value={serviceId} onChange={event => setServiceId(event.target.value)}>{catalog.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
                <label>이름<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
                {!ownerTest && <label>연락처<input required type="tel" maxLength={30} value={phone} onChange={event => setPhone(event.target.value)} /></label>}
                <label>문의 내용<textarea required maxLength={5000} value={message} onChange={event => setMessage(event.target.value)} /></label>
                {!ownerTest && <label className="booking-visit-region">지역·이용 장소 (선택)<input maxLength={200} value={visitRegion} onChange={event => setVisitRegion(event.target.value)} placeholder="상세 주소는 사업자와 조율할 수 있습니다." /></label>}
                {!ownerTest && <label className="inquiry-photo-label"><span aria-hidden="true">▧</span> 사진 첨부 (최대 5장, 장당 8MB)<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy} onChange={event => {
                  const result = selectedInquiryPhotos(event.currentTarget.files);
                  if (result.error) { event.currentTarget.value = ""; setStatus(result.error); return; }
                  setPhotos(result.selected); setStatus("");
                }} /><small>{photos.length > 0 ? `${photos.length}장 선택됨 · 본문 저장 후 비공개 첨부` : "눌러서 사진을 선택하세요. 본문 저장 후 비공개 첨부합니다."}</small></label>}
                {!ownerTest && <SelectedInquiryPhotos photos={photos} />}
                {!ownerTest && <FieldRequestFallback value={fallback} onChange={setFallback} />}
                {!ownerTest && <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required /> 문의 처리에 필요한 연락처 저장에 동의합니다.</label>}
                <button type="submit" disabled={busy || recovering || !serviceId}>{ownerTest ? "테스트 문의 제출" : "문의 제출"}</button>
                <p>{ownerTest ? "이 입력은 테스트 원장에만 저장됩니다. 실제 고객 문의를 보려면 공개 고객 주소를 사용하세요." : "회원가입 없이 접수합니다. 번호 소유를 확인한 상태로 표시하지 않습니다."}</p>
              </form>}
        </section>
        {ownerTest === false && <div className="field-public-booking"><PublicBookingPanel catalog={catalog} onServiceChange={setBookingServiceId} onTimeChange={setBookingTimeSummary} onReceiptChange={setBookingReceipt} /></div>}
      </div></>}
      {receipt && photos.length > 0 && ownerTest === false && <section className="special-panel field-public-photo-retry"><p>문의 본문은 저장됐습니다. 남은 사진 {photos.length}장의 첨부를 같은 문의에서 다시 시도할 수 있습니다.</p><SelectedInquiryPhotos photos={photos} /><button type="button" disabled={busy} onClick={() => void retryDirectPhotos()}>남은 사진 첨부 재시도</button></section>}
    </main>
  </div>;
}

export function InquiryPage({ id }: { id: string }) {
  const [key, setKey] = useState("");
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [pendingPhotoMessageId, setPendingPhotoMessageId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const pendingMessage = useRef<PendingMessageSubmission | null>(null);
  const [hasPendingMessage, setHasPendingMessage] = useState(false);
  const [recoveringMessage, setRecoveringMessage] = useState(false);
  useEffect(() => {
    const handoffKey = consumeReceiptHandoff("inquiry", id);
    if (!handoffKey) return;
    let active = true;
    setKey(handoffKey); setBusy(true);
    void requestJson(`/v1/inquiries/${id}`, "GET", undefined, handoffKey)
      .then(result => {
        if (!active) return;
        if (result.status === 200) setInquiry(result.data as Inquiry);
        else setStatus("문의가 접수됐지만 대화를 자동으로 열지 못했습니다. 위 확인키로 다시 열어 주세요.");
      }).catch(() => { if (active) setStatus("대화를 자동으로 열지 못했습니다. 위 확인키로 다시 열어 주세요."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [id]);
  function clearPhotoSelection() {
    setPhotos([]);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }
  useEffect(() => {
    const attempt = readPendingMessageSubmission(id);
    if (!attempt) return;
    pendingMessage.current = attempt;
    setHasPendingMessage(true);
    setKey(attempt.receiptKey);
    void recoverPendingMessage(attempt);
  }, [id]);
  async function recoverPendingMessage(attempt: PendingMessageSubmission) {
    setRecoveringMessage(true);
    setKey(attempt.receiptKey);
    let notice = "이전 추가 질문 결과를 확인하지 못했습니다. 다시 조회하거나 같은 내용을 재입력해 주세요.";
    try {
      const result = await requestJson(`/v1/inquiries/${id}/messages/recover`, "GET", undefined,
        attempt.receiptKey, { 'idempotency-key': attempt.idempotencyKey });
      if (result.status === 200) {
        pendingMessage.current = null; clearPendingMessageSubmission(id); setHasPendingMessage(false);
        setPendingPhotoMessageId((result.data as { messageId: string }).messageId);
        setBody("");
        notice = "새로고침 전 저장된 추가 질문을 확인했습니다. 사진을 선택했다면 아래에서 다시 첨부해 주세요.";
      } else if (result.status === 404)
        notice = "이전 추가 질문은 아직 저장되지 않았습니다. 같은 내용을 다시 입력해 제출하거나 시도를 포기해 주세요.";
      else if (result.status === 401)
        notice = "보관된 확인키가 유효하지 않습니다. 현재 확인키로 문의를 열고 이전 질문을 확인해 주세요.";
    } catch { /* Unknown result keeps the original attempt. */ }
    try {
      const opened = await requestJson(`/v1/inquiries/${id}`, "GET", undefined, attempt.receiptKey);
      if (opened.status === 200) { setInquiry(opened.data as Inquiry); setRefreshNeeded(false); }
      else notice += ` 문의 내용을 다시 불러오지 못했습니다 (${opened.status}).`;
    } catch { notice += " 문의 내용을 다시 불러오지 못했습니다."; }
    setStatus(notice);
    setRecoveringMessage(false);
  }
  function onReceiptRotated(nextKey: string) {
    setKey(nextKey); pendingMessage.current = null; clearPendingMessageSubmission(id);
    setHasPendingMessage(false); setPendingPhotoMessageId(null);
    void requestJson(`/v1/inquiries/${id}`, "GET", undefined, nextKey)
      .then(result => { if (result.status === 200) { setInquiry(result.data as Inquiry); setRefreshNeeded(false); } })
      .catch(() => setStatus("새 확인키는 활성화됐습니다. 문의 내용을 다시 열어 확인해 주세요."));
  }
  async function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const result = await requestJson(`/v1/inquiries/${id}`, "GET", undefined, key);
      if (result.status === 200) { setInquiry(result.data as Inquiry); setRefreshNeeded(false); }
      else {
        setInquiry(null);
        setStatus(result.status === 429
          ? "확인키 입력이 여러 번 실패했습니다. 잠시 뒤 다시 시도해 주세요."
          : "확인키가 맞지 않거나 문의를 열 수 없습니다.");
      }
    } catch { setStatus("문의를 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function refreshInquiry() {
    setBusy(true); setStatus("최신 문의 내용을 확인하고 있습니다.");
    try {
      const result = await requestJson(`/v1/inquiries/${id}`, "GET", undefined, key);
      if (result.status === 200) {
        setInquiry(result.data as Inquiry); setRefreshNeeded(false);
        setStatus("최신 문의 내용을 확인했습니다.");
      } else setStatus(`문의 내용을 다시 불러오지 못했습니다 (${result.status}). 다시 확인해 주세요.`);
    } catch { setStatus("문의 내용을 다시 불러오지 못했습니다. 다시 확인해 주세요."); }
    finally { setBusy(false); }
  }
  async function attachPhotos(messageId: string, selected: File[]) {
    let notice = `사진 ${selected.length}건의 첨부 요청을 확인했습니다. 동일한 내용은 한 장으로 비공개 저장됩니다. 추가 외부 알림은 보내지 않았습니다.`;
    let completed = 0;
    for (let index = 0; index < selected.length; index++) {
      try {
        const uploaded = await uploadInquiryPhoto(id, messageId, key, selected[index]!);
        if (uploaded !== 201 && uploaded !== 200) {
          notice = uploaded === 429
            ? `이 메시지에는 사진을 최대 5장까지 첨부할 수 있습니다. 남은 ${selected.length - index}장은 새 질문을 작성한 뒤 첨부해 주세요.`
            : `질문은 저장됐지만 사진 ${index + 1}/${selected.length} 첨부에 실패했습니다 (${uploaded}). 남은 사진을 다시 시도할 수 있습니다.`;
          break;
        }
        completed++;
        setPhotos(selected.slice(index + 1));
      } catch {
        notice = `질문은 저장됐지만 사진 ${index + 1}/${selected.length}의 업로드 응답을 받지 못했습니다. 같은 사진을 다시 첨부하면 기존 저장 건을 확인합니다.`;
        break;
      }
    }
    if (completed === selected.length) {
      clearPhotoSelection(); setPendingPhotoMessageId(null);
    }
    setStatus(notice);
    if (completed === 0) return;
    try {
      const updated = await requestJson(`/v1/inquiries/${id}`, "GET", undefined, key);
      if (updated.status === 200) { setInquiry(updated.data as Inquiry); setRefreshNeeded(false); }
      else { setRefreshNeeded(true); setStatus(`${notice} 대화 목록 조회에 실패했습니다. 문의 내용을 다시 확인해 주세요.`); }
    } catch { setRefreshNeeded(true); setStatus(`${notice} 대화 목록 조회에 실패했습니다. 문의 내용을 다시 확인해 주세요.`); }
  }
  async function retryPhotos() {
    if (photos.length === 0 || !inquiry) return;
    const messageId = pendingPhotoMessageId ?? inquiry.messages.filter(item => item.sender === "customer").at(-1)?.id;
    if (!messageId) { setStatus("사진을 연결할 고객 메시지가 없습니다."); return; }
    setBusy(true);
    await attachPhotos(messageId, photos);
    setBusy(false);
  }
  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoveringMessage) return;
    setBusy(true);
    let canRecoverAfterReload = false;
    try {
      const details = { id, key, body: body.trim() };
      const fingerprint = await messageSubmissionFingerprint(details) ?? JSON.stringify(details);
      if (pendingMessage.current && (pendingMessage.current.fingerprint !== fingerprint
        || pendingMessage.current.receiptKey !== key)) {
        setStatus("이전 추가 질문 제출 결과가 확인되지 않았습니다. 먼저 이전 질문을 조회하거나 시도를 포기해 주세요.");
        return;
      }
      if (!pendingMessage.current) {
        pendingMessage.current = { inquiryId: id, receiptKey: key,
          idempotencyKey: randomSubmissionKey(), fingerprint, createdAt: Date.now() };
        setHasPendingMessage(true);
      }
      canRecoverAfterReload = /^[0-9a-f]{64}$/.test(fingerprint)
        && writePendingMessageSubmission(pendingMessage.current);
      const result = await requestJson(`/v1/inquiries/${id}/messages`, "POST", { body }, key,
        { 'idempotency-key': pendingMessage.current.idempotencyKey });
      if (result.status === 201 || result.status === 200) {
        pendingMessage.current = null; clearPendingMessageSubmission(id); setHasPendingMessage(false);
        const savedStatus = result.status === 200
          ? "이전 추가 질문을 확인했습니다. 새 메시지와 알림은 생성되지 않았습니다."
          : "추가 질문을 저장했습니다. 사업자 관리실에 처리 알림이 기록됐습니다.";
        setBody(""); setStatus(savedStatus);
        try {
          const updated = await requestJson(`/v1/inquiries/${id}`, "GET", undefined, key);
          if (updated.status === 200) { setInquiry(updated.data as Inquiry); setRefreshNeeded(false); }
          else { setRefreshNeeded(true); setStatus(`${savedStatus} 대화 목록 조회에 실패했습니다. 문의 내용을 다시 확인해 주세요.`); }
        } catch { setRefreshNeeded(true); setStatus(`${savedStatus} 대화 목록 조회에 실패했습니다. 문의 내용을 다시 확인해 주세요.`); }
        if (photos.length > 0) {
          const messageId = (result.data as { messageId?: string }).messageId;
          if (messageId) { setPendingPhotoMessageId(messageId); await attachPhotos(messageId, photos); }
          else setStatus("질문은 저장됐지만 사진을 연결할 메시지를 찾지 못했습니다. 아래에서 다시 첨부해 주세요.");
        }
      } else if (result.status === 409 && (result.data as { error?: string }).error === 'idempotency_conflict')
        setStatus("이 제출 키로 저장된 질문이 다릅니다. 내용을 확인해 주세요.");
      else setStatus(`추가 질문을 저장하지 못했습니다 (${result.status}).`);
    } catch { setStatus(canRecoverAfterReload
      ? "응답을 받지 못했습니다. 새로고침하면 기존 추가 질문을 조회하거나 같은 내용으로 재시도할 수 있습니다."
      : "응답을 받지 못했습니다. 이 브라우저는 임시 시도를 보관하지 못해 현재 화면에서만 같은 내용으로 재시도할 수 있습니다. 새로고침하지 마세요."); }
    finally { setBusy(false); }
  }
  const accessForm = <form className="form-fields" onSubmit={event => void open(event)}><label>접수 확인키<input required value={key} onChange={event => { setKey(event.target.value); setInquiry(null); clearPhotoSelection(); setPendingPhotoMessageId(null); setRefreshNeeded(false); }} /></label><button type="submit" disabled={busy || recoveringMessage}>문의 열기</button></form>;
  return <div className="site-shell field-conversation-shell"><header className="field-public-header">{inquiry?.businessName && inquiry.organizationId
    ? <><div><strong>{inquiry.businessName}</strong><p>{inquiry.service.name} · 비회원 후속 대화</p></div><a href={`/public/${inquiry.organizationId}`}>사업 정보 보기</a></>
    : <><a href="/"><Brand product="Field" /></a><span>비회원 후속 대화</span></>}</header>
    <main className="field-conversation-main">
      {!inquiry && <div className="field-conversation-entry"><h1>내 문의 확인</h1><p>접수 때 받은 확인키로 대화를 엽니다. 전화번호나 알림 링크만으로는 원문을 볼 수 없습니다.</p><section className="special-panel">{accessForm}</section></div>}
      {status && <p role="status" className="state-message">{status}</p>}
      {hasPendingMessage && <div className="customer-banner"><p>이전 추가 질문 제출 시도를 보관 중입니다. 같은 내용을 다시 입력하면 같은 메시지로 재시도합니다.</p><button type="button" disabled={busy || recoveringMessage} onClick={() => { if (pendingMessage.current) void recoverPendingMessage(pendingMessage.current); }}>이전 추가 질문 조회</button><button type="button" disabled={busy || recoveringMessage} onClick={() => { pendingMessage.current = null; clearPendingMessageSubmission(id); setHasPendingMessage(false); setStatus("이전 시도를 포기했습니다. 이미 저장됐을 수 있으므로 새 질문 전에 대화 내용을 확인해 주세요."); }}>이전 시도 포기하고 새 질문</button></div>}
      {inquiry && <section className="field-conversation-card"><header className="field-conversation-title"><div><h1>{inquiry.businessName ? `${inquiry.businessName}와의 대화` : `${inquiry.service.name} 문의 대화`}</h1><p>{inquiry.id} · 연락처 미인증</p>{inquiry.visitRegion && <p>지역·이용 장소: {inquiry.visitRegion}</p>}</div><span>{inquiryStateLabels[inquiry.state] ?? "상태 확인 필요"}</span></header>{inquiry.state === "closed" && !inquiry.retention?.workPurgedAt && <p>처리 완료된 문의도 추가 질문을 남기면 다시 사업자 확인 필요로 열립니다.</p>}
        {refreshNeeded && <div className="field-conversation-refresh"><button type="button" disabled={busy} onClick={() => void refreshInquiry()}>문의 내용 다시 확인</button></div>}
        <ol className="field-conversation-log">{inquiry.messages.filter(message => message.visibility !== "internal").map(message => <li key={message.id} className={message.sender === "owner" ? "owner" : "customer"}><div><strong>{message.sender === "owner" ? "사업자" : "나"}</strong><p>{message.body}</p><small>{inquiryDeliveryLabel(message.sender, message.delivery_state)}</small>{inquiry.attachments.filter(item => item.messageId === message.id).map((attachment, index) => <PrivateInquiryPhoto key={attachment.id} inquiryId={id} attachmentId={attachment.id} receiptKey={key} label={`고객 첨부 사진 ${index + 1}`} />)}</div></li>)}</ol>
        <FieldRetentionNotice retention={inquiry.retention} />
        {!inquiry.retention?.workPurgedAt && <form className="field-conversation-composer" onSubmit={event => void reply(event)}><label className="sr-only" htmlFor="field-conversation-reply">추가 질문</label><textarea id="field-conversation-reply" required maxLength={5000} value={body} onChange={event => setBody(event.target.value)} placeholder="추가 내용을 남겨주세요" /><button type="submit" disabled={busy || recoveringMessage}>추가 질문 저장</button></form>}
        <p className="field-conversation-foot">내부 메모는 고객 대화에 표시하지 않습니다. 외부 알림 발송 상태는 각 메시지에 표시됩니다.</p>
        <details className="field-conversation-tools"><summary>확인키·사진 관리</summary><div><h2>확인키 관리</h2><p>다른 문의를 열 때는 현재 대화를 닫고 새 확인키를 입력합니다.</p><button className="field-conversation-switch-key" type="button" disabled={hasPendingMessage || busy} onClick={() => { setInquiry(null); setKey(""); clearPhotoSelection(); setPendingPhotoMessageId(null); setRefreshNeeded(false); }}>다른 확인키로 열기</button>{hasPendingMessage ? <p>이전 추가 질문 결과를 확인한 뒤 확인키를 교체할 수 있습니다.</p> : <ReceiptRotationPanel path={`/v1/inquiries/${id}/receipt-key/rotate`} label="문의" currentKey={key} onRotated={onReceiptRotated} />}<div className="knowledge-source"><label className="inquiry-photo-label">문의 사진 첨부 (선택, 최대 5장·장당 8MB)<input ref={photoInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy || Boolean(inquiry?.retention?.workPurgedAt)} onChange={event => {
          const result = selectedInquiryPhotos(event.currentTarget.files);
          if (result.error) { event.currentTarget.value = ""; setStatus(result.error); return; }
          setPhotos(result.selected); setStatus("");
        }} /></label>{photos.length > 0 && <><p>남은 사진 {photos.length}장 선택됨. 새 질문을 저장하면 함께 첨부됩니다.</p><SelectedInquiryPhotos photos={photos} /><button type="button" disabled={busy || Boolean(inquiry?.retention?.workPurgedAt)} onClick={() => void retryPhotos()}>사진만 첨부 또는 재시도</button></>}</div></div></details>
      </section>}
    </main></div>;
}
