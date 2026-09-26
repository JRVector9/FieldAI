"use client";

import { useEffect, useState } from "react";

export function PrivateInquiryPhoto({ inquiryId, attachmentId, receiptKey, label }: {
  inquiryId: string; attachmentId: string; receiptKey?: string; label: string;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | null = null;
    const path = receiptKey ? `/v1/inquiries/${inquiryId}/attachments/${attachmentId}`
      : `/v1/owner/inquiries/${inquiryId}/attachments/${attachmentId}`;
    void fetch(path, { credentials: "same-origin", signal: controller.signal,
      headers: receiptKey ? { authorization: `Bearer ${receiptKey}` } : {} })
      .then(async response => {
        if (!response.ok) throw new Error('image_unavailable');
        url = URL.createObjectURL(await response.blob());
        if (controller.signal.aborted) URL.revokeObjectURL(url);
        else setSource(url);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [attachmentId, inquiryId, receiptKey]);
  if (failed) return <span>첨부 사진을 불러오지 못했습니다.</span>;
  if (!source) return <span>첨부 사진을 불러오는 중입니다.</span>;
  return <figure className="inquiry-private-photo"><img src={source} alt={label} />
    <figcaption><a href={source} download={`field-inquiry-${attachmentId}.webp`}>사진 저장</a></figcaption></figure>;
}
