"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import "./field-notification-settings.css";
import { browserPushEnvironment, inspectNotificationPush, prepareNotificationPush, changeNotificationPush, type PushChangeResult } from "./field-notification-push-client";

type Delivery = { id: string; channel: string; state: string; updated_at: string; fallback_of: string | null };
type Settings = {
  deliveries: Delivery[]; dailyAttemptLimit: number; canManage: boolean; storageState: string;
  providerState: string; pushState: string; pushPublicKey: string | null;
  ownerConsent: { maskedPhone: string | null; kakao: boolean; push: boolean };
};
const deliveryStates: Record<string, string> = {
  pending: "발송 대기", processing: "결과 확인 중", accepted: "공급사 접수 · 수신·열람 미확인",
  unknown: "결과 미상 · 재발송하지 않고 대조 중", sent: "발송 확인 · 열람 미확인",
  failed: "확정 실패", blocked_integration: "공급사 연결 전", blocked_limit: "일일 시도 상한에 도달",
  suppressed: "현재 동의·업무 상태로 발송 중단",
};
async function request(path: string, organizationId: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method, credentials: "same-origin", cache: "no-store",
    headers: { "x-organization-id": organizationId, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}
function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return code === "current_session_required" || code === "authentication_required" ? "로그인을 다시 확인한 뒤 저장해 주세요."
    : code === "notification_phone_required" || code === "invalid_notification_consent" ? "카카오 업무 알림을 받을 휴대전화 번호를 확인해 주세요."
      : code === "push_permission_denied" ? "브라우저 알림 권한이 허용되지 않았습니다. 브라우저 설정에서 확인해 주세요."
        : code === "notification_configuration_missing" ? "알림 저장 환경이 연결되지 않았습니다. 공급사 연결 전 상태입니다."
          : code === "push_key_mismatch" ? "이 브라우저의 기존 구독이 현재 푸시 키와 다릅니다. 기존 사이트 구독을 정리한 뒤 다시 연결해 주세요."
          : code === "invalid_push_subscription" ? "이 브라우저의 푸시 구독을 저장할 수 없습니다. 구독 설정을 확인해 주세요."
            : code === "organization_not_found" ? "현재 사업체의 소유자 권한을 확인해 주세요."
              : "저장 결과를 확인하지 못했습니다. 현재 저장 상태를 다시 확인해 주세요.";
}

export function FieldNotificationSettings({ organizationId, defaultPhone = "", children }: {
  organizationId: string; defaultPhone?: string; children?: ReactNode;
}) {
  const phoneId = useId(), limitId = useId();
  const [data, setData] = useState<Settings | null>(null);
  const [phone, setPhone] = useState("");
  const [kakao, setKakao] = useState(false), [push, setPush] = useState(false);
  const [dailyLimit, setDailyLimit] = useState("0"), [costAccepted, setCostAccepted] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(""), [notice, setNotice] = useState("");
  const [browserPushReason, setBrowserPushReason] = useState("브라우저 푸시 환경을 확인 중입니다.");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = generation.current;
    setLoading(true); setLoadError("");
    try {
      const result = await request("/v1/owner/notification-deliveries", organizationId);
      if (result.status !== 200 || !Array.isArray(result.data.deliveries) || !result.data.ownerConsent
        || typeof result.data.canManage !== "boolean") throw new Error("settings_unavailable");
      if (current !== generation.current) return false;
      const value = result.data as Settings;
      setData(value); setPhone(value.ownerConsent.kakao ? "" : defaultPhone);
      setKakao(value.ownerConsent.kakao); setPush(value.ownerConsent.push);
      setDailyLimit(String(value.dailyAttemptLimit)); setCostAccepted(false);
      return true;
    } catch {
      if (current === generation.current) { setData(null); setLoadError("알림 설정과 이력을 확인하지 못했습니다. 다시 확인해 주세요."); }
      return false;
    } finally { if (current === generation.current) setLoading(false); }
  }, [organizationId, defaultPhone]);
  useEffect(() => {
    generation.current += 1; setData(null); setNotice(""); setBusy(false);
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh]);
  useEffect(() => {
    let alive = true;
    if (data) void inspectNotificationPush(data).then(value => { if (alive) setBrowserPushReason(value.reason); });
    return () => { alive = false; };
  }, [data]);
  async function preparePush() {
    if (busy || !canManage) return;
    const current = generation.current; setBusy(true); setNotice("");
    const result = await prepareNotificationPush();
    if (current !== generation.current) return;
    const currentPush = data ? await inspectNotificationPush(data) : null;
    if (current !== generation.current) return;
    if (currentPush) setBrowserPushReason(currentPush.reason);
    if (current === generation.current) { setNotice(result.state === "ready" ? "이 브라우저의 푸시 서비스 워커를 준비했습니다. 알림 권한·구독 저장·실제 발송은 별도입니다." : result.reason); setBusy(false); }
  }
  const canManage = data?.canManage === true;
  const pushReason = !data ? (loading ? "웹 푸시 설정을 확인 중입니다." : "웹 푸시 설정을 확인하지 못했습니다.") : data.pushState !== "configured" || !data.pushPublicKey
    ? "웹 푸시 공급사·VAPID가 연결되지 않았습니다." : browserPushReason;
  const providerLabel = !data ? (loading ? "확인 중" : "현재 확인 불가") : data.providerState === "configured" ? "카카오 공급사 설정됨 · 실 발송 검수 별도" : "카카오 공급사 연결 전 · 외부 발송 차단";

  async function saveSettings(event: FormEvent) {
    event.preventDefault(); if (!data || !canManage || busy || loading) return;
    const current = generation.current, cleanPhone = phone.replace(/[\s()-]/g, "");
    if (kakao && cleanPhone && !/^01[016789]\d{7,8}$/.test(cleanPhone)) { setNotice("카카오 업무 알림을 받을 휴대전화 번호를 확인해 주세요."); return; }
    if (kakao && !cleanPhone && !data.ownerConsent.kakao) { setNotice("카카오 업무 알림을 받을 휴대전화 번호를 입력해 주세요."); return; }
    if (push && !data.ownerConsent.push && pushReason) { setNotice(pushReason); return; }
    setBusy(true); setNotice(""); let phoneSaved = false;
    async function savePhone() {
      if (current !== generation.current) return false;
      const saved = await request("/v1/owner/notification-consent", organizationId, "POST", {
        ...(kakao && cleanPhone ? { phone: cleanPhone } : {}), kakao, sms: false, consentVersion: "notification-v1",
      });
      if (saved.status !== 200) throw new Error(saved.data.error); phoneSaved = true;
      return current === generation.current;
    }
    try {
      let pushResult: PushChangeResult = { outcome: "confirmed" };
      if (push !== data.ownerConsent.push || push && !pushReason) {
        // Permission is requested from this submit action before saving the phone settings.
        pushResult = await changeNotificationPush({ enabled: push, pushState: data.pushState, pushPublicKey: data.pushPublicKey }, async body => {
          if (current !== generation.current) return { outcome: "rejected" };
          if (!await savePhone()) return { outcome: "rejected" };
          try {
            const result = await request("/v1/owner/push-subscriptions", organizationId, "POST", body);
            return result.status === 200 ? { outcome: "confirmed" } : {
              outcome: [400, 401, 403, 404, 429, 503].includes(result.status) ? "rejected" : "unknown", error: result.data.error,
            };
          } catch { return { outcome: "unknown" }; }
        });
      } else await savePhone();
      if (current !== generation.current) return;
      const refreshed = await refresh();
      if (current !== generation.current) return;
      const currentPush = await inspectNotificationPush(data, browserPushEnvironment());
      if (current !== generation.current) return;
      setBrowserPushReason(currentPush.reason);
      setNotice(pushResult.outcome === "unknown" ? `${phoneSaved ? "카카오 설정은 저장됐습니다. " : ""}푸시 저장 결과는 미상입니다. 실제 브라우저 구독을 유지하며 현재 설정을 다시 확인해 주세요.`
        : pushResult.outcome === "rejected" ? `${phoneSaved ? "카카오 설정은 저장됐습니다. " : ""}웹 푸시 설정: ${errorMessage(new Error(pushResult.error))}`
        : pushResult.cleanup === "failed" ? "서버의 푸시 동의 철회를 확인했습니다. 이 브라우저 구독 정리는 완료하지 못했습니다. 브라우저 사이트 설정을 확인해 주세요."
        : refreshed ? "설정을 저장했습니다. 실제 발송·수신·열람은 아래 이력에서 따로 확인합니다." : "설정 저장 응답을 받았지만 현재 상태를 다시 조회하지 못했습니다. 다시 확인해 주세요.");
    } catch (error) {
      if (current !== generation.current) return;
      const message = errorMessage(error); await refresh();
      if (current === generation.current) { const currentPush = await inspectNotificationPush(data); if (current === generation.current) { setBrowserPushReason(currentPush.reason); setNotice(phoneSaved ? `카카오 설정은 저장됐습니다. 웹 푸시 설정: ${message}` : message); } }
    } finally { if (current === generation.current) setBusy(false); }
  }
  async function saveLimit(event: FormEvent) {
    event.preventDefault(); if (!data || !canManage || busy || loading || !costAccepted) return;
    const limit = Number(dailyLimit), current = generation.current;
    if (!Number.isInteger(limit) || limit < 0 || limit > 1000) { setNotice("일일 시도 상한은 0~1000 사이의 정수로 입력해 주세요."); return; }
    setBusy(true); setNotice("");
    try {
      const result = await request("/v1/owner/notification-limit", organizationId, "PUT", { dailyAttemptLimit: limit, costLimitAccepted: true });
      if (result.status !== 200) throw new Error(result.data.error);
      if (current !== generation.current) return;
      const refreshed = await refresh();
      if (current === generation.current) setNotice(refreshed ? "일일 시도 상한을 저장했습니다. 공급사 연결 전에는 외부 발송이 차단됩니다." : "상한 저장 응답을 받았지만 현재 상태를 다시 조회하지 못했습니다. 다시 확인해 주세요.");
    } catch (error) { if (current === generation.current) { const message = errorMessage(error); await refresh(); if (current === generation.current) setNotice(message); } }
    finally { if (current === generation.current) setBusy(false); }
  }
  return <div className="field-notification-settings" aria-busy={loading || busy}>
    <header className="page-heading"><div><h1>알림 설정</h1><p>확인이 필요한 문의·예약만 카카오톡과 웹 푸시로 알려드립니다.</p></div></header>
    {loadError && <div className="v3-soft mb24" role="alert"><p>{loadError}</p><button className="btn btn-secondary mt16" type="button" disabled={loading || busy} onClick={() => void refresh()}>다시 확인</button></div>}
    {notice && <p className="v3-soft mb24" role="status">{notice}</p>}
    <div className="v3-grid2">
      <form className="v3-card v3-form-stack" onSubmit={event => void saveSettings(event)}>
        <div className="field"><label htmlFor={phoneId}>사업자 알림 번호</label><input id={phoneId} className="input" name="phone" inputMode="tel" autoComplete="tel" maxLength={30} value={phone} placeholder={data?.ownerConsent.maskedPhone ?? "휴대전화 번호"} disabled={loading || busy || !canManage} required={kakao && !data?.ownerConsent.kakao} onChange={event => setPhone(event.target.value)} />{data?.ownerConsent.maskedPhone && <p className="field-note">저장된 번호: {data.ownerConsent.maskedPhone} · 변경할 때만 입력하세요.</p>}</div>
        <label className="v3-check"><input type="checkbox" name="kakao" checked={kakao} disabled={loading || busy || !canManage || data?.storageState !== "configured" && !data?.ownerConsent.kakao} onChange={event => setKakao(event.target.checked)} />카카오톡 업무 알림</label>
        <label className="v3-check"><input type="checkbox" name="push" checked={push} disabled={loading || busy || !canManage || Boolean(pushReason) && !data?.ownerConsent.push} onChange={event => setPush(event.target.checked)} />웹 푸시 알림</label>
        <div className="v3-soft">카카오 템플릿·발신번호·푸시 권한·플랫폼 승인은 운영 연동에서 검증합니다.<p className="mt8">공급사 상태 (추가): {loading ? "확인 중" : providerLabel}</p>{pushReason && <p className="mt8">{pushReason}</p>}{data && !canManage && <p className="mt8">알림 설정과 비용 상한은 사업체 소유자만 변경할 수 있습니다.</p>}<p className="mt8">웹 푸시 구독 (추가): 새 브라우저 구독을 저장하면 이전 사업자 구독을 대체합니다.</p><button className="btn btn-secondary btn-small mt16" type="button" disabled={loading || busy || !canManage} onClick={() => void preparePush()}>웹 푸시 준비 (추가)</button>{data?.ownerConsent.push && !pushReason && <p className="mt8">설정 저장을 누르면 이 브라우저의 실제 구독을 다시 연결합니다. 이전 브라우저 구독을 대체할 수 있습니다.</p>}</div>
        <button className="btn btn-primary" type="submit" disabled={loading || busy || !data || !canManage}>{busy ? "저장 중…" : "설정 저장"}</button>
      </form>
      <aside className="v3-card"><h2>고객 답변 알림</h2><p className="mt16">카카오톡 우선 → 발송 실패 시 문자</p><p className="mt8">읽지 않은 메시지를 문자로 중복 발송하지 않습니다.</p><p className="v3-note-plain">사업자에게 자동 SMS 대체는 제공하지 않습니다.</p>
        <p className="v3-note-plain">고객의 문자 대체 동의가 있고 공급사가 카카오 미사용으로 확정한 경우에만 문자를 보냅니다. 결과 미상은 재발송하지 않습니다.</p>
        <form className="v3-form-stack additional-settings" onSubmit={event => void saveLimit(event)}><h3>일일 시도 상한 (추가)</h3><div className="field"><label htmlFor={limitId}>하루 최대 발송 시도 수</label><input id={limitId} className="input" type="number" min="0" max="1000" step="1" required disabled={loading || busy || !canManage} value={dailyLimit} onChange={event => setDailyLimit(event.target.value)} /><p className="field-note">0이면 새 발송을 차단합니다. 결과 미상도 시도 수에 포함됩니다.</p></div><label className="v3-check"><input type="checkbox" checked={costAccepted} disabled={loading || busy || !canManage} onChange={event => setCostAccepted(event.target.checked)} />이 상한 내 유료 발송 시도에 동의합니다.</label><button className="btn btn-secondary" type="submit" disabled={loading || busy || !canManage || !costAccepted}>상한 저장 (추가)</button></form>
      </aside>
    </div>
    <section className="v3-card mt24"><h2>업무 이벤트 이력</h2>{children ?? <p className="muted mt24">관리실 업무 알림 이력을 함께 확인하세요.</p>}
      <div className="additional-settings"><div className="row-between"><h3>공급사 발송 이력 (추가)</h3><button className="btn btn-secondary btn-small" type="button" disabled={loading || busy} onClick={() => void refresh()}>새로고침</button></div><p className="v3-note-plain">최근 100건 · 저장·접수·발송·열람 상태는 서로 다릅니다. 새로고침은 발송 상태만 조회합니다.</p>{loading && <p className="muted mt24" role="status">설정과 발송 이력을 확인 중입니다.</p>}{!loading && data?.deliveries.length === 0 && <p className="muted mt24">발송 원장에 기록된 시도가 없습니다.</p>}{data?.deliveries.map(item => <div className="v3-list-row" key={item.id}><div className="grow"><strong>{item.channel === "kakao" ? "카카오톡" : item.channel === "sms" ? "문자" : "웹 푸시"}{item.fallback_of ? " · 확정 실패 대체" : ""}</strong><p>{deliveryStates[item.state] ?? "상태 확인 필요"}</p><p>{new Date(item.updated_at).toLocaleString("ko-KR")}</p></div></div>)}</div>
    </section>
  </div>;
}
