"use client";

import { useState } from "react";

export function AgentConsultQr({ url, publicId }: { url: string; publicId: string }) {
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function generate() {
    if (busy) return;
    setBusy(true); setError(false);
    try {
      const QRCode = (await import("qrcode")).default;
      const encoded = await QRCode.toDataURL(url, { width: 320, margin: 4, errorCorrectionLevel: "M" });
      setImage(encoded);
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <section className="agent-consult-qr" aria-label="상담 링크 QR 공유">
    <p>QR을 스캔하면 이 상담 링크로 이동합니다. 인쇄하거나 이미지로 공유할 수 있습니다.</p>
    {!image && <button type="button" disabled={busy} onClick={() => void generate()}>
      {busy ? "QR 이미지 만드는 중" : "QR 코드 만들기"}</button>}
    {error && <p role="alert">QR 이미지를 만들지 못했습니다. 다시 시도하거나 위 상담 링크를 공유해 주세요.</p>}
    {image && <><img src={image} width={320} height={320} alt="상담 링크 QR 코드" />
      <a href={image} download={`ap-consult-${publicId}.png`}>QR 이미지 다운로드</a>
      <p>배포를 중지하면 기존 QR로도 새 상담을 시작할 수 없습니다.</p></>}
  </section>;
}
