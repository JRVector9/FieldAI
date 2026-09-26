import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldPreviewContent } from "../src/field-preview";
import { screens } from "../src/screens";

test("Field editor offers a mobile edit and preview switch with an unsaved notice", () => {
  const screen = screens.owner.find(item => item.id === "F-O04");
  assert.ok(screen);
  const html = renderToStaticMarkup(<FieldPreviewContent screen={screen} />);
  assert.match(html, /aria-label="편집 화면 전환"/);
  assert.match(html, />편집</);
  assert.match(html, />미리보기</);
  assert.match(html, /입력 내용은 저장되지 않습니다/);
});

test("Field editor shows the required photo, alt text, palette, page and section controls", () => {
  const screen = screens.owner.find(item => item.id === "F-O04");
  assert.ok(screen);
  const html = renderToStaticMarkup(<FieldPreviewContent screen={screen} />);
  for (const label of ["사진 추가", "사진 설명", "사이트 색상", "소개 페이지", "섹션 순서"]) {
    assert.ok(html.includes(label), `${label} control is missing`);
  }
});
