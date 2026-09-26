"use client";

import { useEffect, useState } from "react";
import "./distribution-metrics-panel.css";

type Band = "under_5" | "5-9" | "10-19" | "20-49" | "50-99" | "100+";
type Period = { weekStart: string; weekEnd: string; engagements: Band; contacts: Band;
  bookings: Band | "unsupported_unconnected" };
type Metrics = { periods: Period[]; bookingConfirmed: "available" | "unsupported_unconnected";
  revenue: "not_measured" };
const label: Record<Band, string> = {
  under_5: "5건 미만", "5-9": "5~9건", "10-19": "10~19건",
  "20-49": "20~49건", "50-99": "50~99건", "100+": "100건 이상",
};

export function DistributionMetricsPanel({ endpoint }: { endpoint: string }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [status, setStatus] = useState("성과를 불러오는 중입니다.");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { credentials: "same-origin", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(`metrics_${response.status}`);
      const data = await response.json() as Metrics;
      setMetrics(data); setStatus("");
    }).catch(error => {
      if (error instanceof Error && error.name === "AbortError") return;
      setMetrics(null); setStatus("성과를 불러오지 못했습니다. 조직 권한과 AP 서버 상태를 확인해 주세요.");
    });
    return () => controller.abort();
  }, [endpoint]);
  return <section className="special-panel distribution-metrics"><div className="panel-heading"><h2>매체 성과</h2>
    {metrics && <a href={`${endpoint}.csv`}>같은 집계 CSV 받기</a>}</div>
    <p>완료된 UTC 주별 AP 상담 시작·연락처 동의 접수·Field 예약 최초 확정 사건입니다. 5건 미만은 합쳐 숨기며, 미리보기·테스트·식별된 봇은 제외합니다.</p>
    {status && <p role="status">{status}</p>}
    {metrics && <><div className="distribution-metrics-list">{metrics.periods.map(period =>
      <article key={period.weekStart}><h3>{period.weekStart} ~ {period.weekEnd}</h3>
        <p>상담 시작 <strong>{label[period.engagements]}</strong></p>
        <p>연락처 동의 접수 <strong>{label[period.contacts]}</strong></p>
        <p>예약 최초 확정 <strong>{period.bookings === "unsupported_unconnected"
          ? "연동 전 미지원" : label[period.bookings]}</strong></p></article>)}</div>
      <p>예약 확정은 Field가 전달한 최초 확정 사건의 기록이며 현재 예약 상태나 수금을 뜻하지 않습니다. 매출·수금은 측정하지 않습니다.</p></>}
  </section>;
}
