"use client";

export default function SiteError() {
  return <main className="field-site field-site-error">
    <div className="field-site-main">
      <h1>사이트를 일시적으로 불러오지 못했습니다</h1>
      <p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
      <button type="button" onClick={() => window.location.reload()}>사이트 다시 불러오기</button>
    </div>
  </main>;
}
