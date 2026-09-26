"use client";

import { useEffect, useState } from "react";
import { requestJson } from "./field-api";

type Attachment = { id: string; sourceAttachmentId: string; state: string;
  width: number | null; height: number | null; error: string | null };

function CopiedPhoto({ requestId, attachmentId }: { requestId: string; attachmentId: string }) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | null = null;
    void fetch(`/v1/owner/external-requests/${requestId}/attachments/${attachmentId}`,
      { credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("photo_unavailable");
        url = URL.createObjectURL(await response.blob());
        if (controller.signal.aborted) URL.revokeObjectURL(url);
        else setSource(url);
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [requestId, attachmentId]);
  if (failed) return <p>복사된 사진을 불러오지 못했습니다.</p>;
  if (!source) return <p>사진을 불러오는 중입니다.</p>;
  return <figure className="inquiry-private-photo"><img src={source} alt="고객이 Field 전달에 동의한 문의 사진" />
    <figcaption><a href={source} download={`field-external-${attachmentId}.webp`}>사진 저장</a></figcaption></figure>;
}

export function ExternalRequestPhotos({ requestId, organizationId }: {
  requestId: string; organizationId: string;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  async function load() {
    try {
      const result = await requestJson(`/v1/owner/external-requests/${requestId}/attachments`,
        "GET", undefined, undefined, { "x-organization-id": organizationId });
      if (result.status !== 200) throw new Error(String(result.status));
      setAttachments((result.data as { attachments: Attachment[] }).attachments);
      setError("");
    } catch { setError("사진 복사 상태를 확인하지 못했습니다. 다시 조회해 주세요."); }
  }
  useEffect(() => { void load(); }, [requestId, organizationId]);
  return <div className="knowledge-source"><div className="panel-heading"><h4>고객 동의 사진</h4>
    <button type="button" onClick={() => void load()}>사진 상태 새로고침</button></div>
    {error && <p role="status">{error}</p>}
    {attachments.length === 0 && !error && <p>전달된 사진이 없습니다.</p>}
    {attachments.map((item, index) => <div key={item.id}><p>사진 {index + 1}: {
      item.state === "copied" ? "Field에 비공개 복사 완료"
        : item.state === "copy_failed" ? `복사 실패 · 자동 재시도 대기 (${item.error ?? "원인 확인 중"})`
          : "비공개 복사 대기 중"}</p>
      {item.state === "copied" && <CopiedPhoto requestId={requestId} attachmentId={item.id} />}</div>)}
  </div>;
}
