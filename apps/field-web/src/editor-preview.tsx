"use client";

import React, { useState } from "react";

export function FieldEditorPreview() {
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [title, setTitle] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [contactLabel, setContactLabel] = useState("");
  const [palette, setPalette] = useState("blue");

  return <div className="editor-shell">
    <div className="editor-switch" aria-label="편집 화면 전환">
      <button type="button" aria-pressed={view === "edit"} onClick={() => setView("edit")}>편집</button>
      <button type="button" aria-pressed={view === "preview"} onClick={() => setView("preview")}>미리보기</button>
    </div>
    <div className={`special-grid editor-grid editor-view-${view}`}>
      <section className="special-panel editor-inputs">
        <div className="panel-heading"><h2>내용 편집</h2><span>미저장</span></div>
        <p>작성한 문구를 미리볼 수 있습니다. 현재는 화면 검토 단계입니다.</p>
        <div className="form-fields">
          <label>첫 화면 제목<input value={title} onChange={event => setTitle(event.target.value)} placeholder="실제 사업 제목을 입력해 주세요" /></label>
          <label>소개 문장<input value={introduction} onChange={event => setIntroduction(event.target.value)} placeholder="사업 소개를 입력해 주세요" /></label>
          <label>문의 버튼 문구<input value={contactLabel} onChange={event => setContactLabel(event.target.value)} placeholder="문의 남기기" /></label>
        </div>
        <div className="editor-tools">
          <section><h3>사진과 설명</h3><div className="editor-photo"><span>등록된 사진 없음</span><button type="button" disabled>사진 추가</button></div><label className="editor-alt">사진 설명<input disabled placeholder="사진을 추가한 뒤 입력합니다" /></label><p>사진 설명과 실제 파일 저장은 미디어 API 연결 후 사용할 수 있습니다.</p></section>
          <fieldset><legend>사이트 색상</legend><div className="editor-palette">{([["blue","파란색"],["warm","따뜻한 색"],["charcoal","차콜"]] as const).map(([value,label]) => <label key={value}><input type="radio" name="palette" value={value} checked={palette === value} onChange={() => setPalette(value)} /><span className={`palette-dot ${value}`} />{label}</label>)}</div><p>선택한 색은 이 미리보기에만 반영됩니다.</p></fieldset>
          <section><h3>소개 페이지</h3><div className="editor-row"><span>홈 · 기본 페이지</span><span>초안 없음</span></div><button type="button" disabled>페이지 추가</button><p>최대 5개 소개 페이지의 이름·경로·삭제는 서버 초안 연결 후 이용합니다.</p></section>
          <section><h3>섹션 순서</h3><div className="editor-row"><span>첫 화면 → 서비스 → 문의</span><span>기본 배치</span></div><button type="button" disabled>순서 바꾸기</button><p>섹션 이동·삭제와 필수 문의 버튼 검사는 편집 API 연결 후 이용합니다.</p></section>
        </div>
        <div className="preview-action"><button type="button" disabled>초안 저장</button><p>입력 내용은 저장되지 않습니다. 실제 저장 API 연결 후 사용할 수 있습니다.</p></div>
      </section>
      <aside className="special-panel editor-output">
        <div className="panel-heading"><h2>사이트 미리보기</h2><span>비공개</span></div>
        <p>이 화면의 입력만 즉시 반영합니다. 공개 사이트에는 영향을 주지 않습니다.</p>
        <div className={`site-preview editor-palette-${palette}`} aria-label="사이트 화면 구조"><div className="site-preview-bar"><strong>내 사이트</strong><span>미공개</span></div><div className="site-preview-body"><h3>{title.trim() || "첫 화면 제목"}</h3><p>{introduction.trim() || "소개 문장을 입력하면 이곳에 표시됩니다."}</p><span className="site-preview-cta">{contactLabel.trim() || "문의 남기기"}</span></div></div>
      </aside>
    </div>
  </div>;
}
