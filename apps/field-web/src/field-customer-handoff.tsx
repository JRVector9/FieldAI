"use client";

import { useState, type FormEvent } from "react";
import { Brand } from "@fieldai/ui";
import { requestJson } from "./field-api";
import { ReservationPage } from "./field-booking";

export function FieldCustomerHandoff() {
  const [code, setCode] = useState("");
  const [opened, setOpened] = useState<{ reservationId: string; receiptKey: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function exchange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const result = await requestJson("/v1/customer-handoffs/exchange", "POST", { code: code.trim() });
      if (result.status === 200) {
        const value = result.data as { reservationId: string; receiptKey: string };
        setOpened(value); setCode("");
      } else setStatus(result.status === 409 ? "코드가 만료되었거나 이미 사용되었습니다. AP에서 새 코드를 발급받아 주세요."
        : "코드를 교환하지 못했습니다. AP에서 표시된 코드를 확인해 주세요.");
    } catch { setStatus("Field 응답을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  if (opened) return <ReservationPage id={opened.reservationId} initialKey={opened.receiptKey} />;
  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product="Field" /></a></header>
    <main className="feature-section"><div className="feature-heading"><p className="eyebrow">Field · 고객 예약 접근</p><h1>AP에서 받은 코드 교환</h1><p>AP 대화 확인을 거쳐 발급된 1회 코드를 입력하면 Field 예약 확인키를 받습니다.</p></div>
      <section className="special-panel">{status && <p role="status" className="state-message">{status}</p>}
        <form className="form-fields" onSubmit={event => void exchange(event)}><label>1회 접근 코드<input required minLength={43} maxLength={43} value={code} onChange={event => setCode(event.target.value)} /></label><button type="submit" disabled={busy}>Field 예약 확인키 받기</button></form>
        <p>전화번호나 예약 ID만으로 접근할 수 없습니다. 코드는 5분 동안 한 번만 사용할 수 있습니다.</p>
      </section></main></div>;
}
