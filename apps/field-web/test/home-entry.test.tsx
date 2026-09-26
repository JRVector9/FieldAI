import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../src/app/page";

test("Field home opens the working workspace before the design preview", () => {
  const html = renderToStaticMarkup(<Home />);
  assert.match(html, /href="\/workspace"[^>]*>내 홈페이지 만들기/);
  assert.match(html, /href="\/preview\/owner\/start">화면 둘러보기/);
  assert.doesNotMatch(html, /현재는 화면 검토 단계입니다|설계 검토용 화면 · 실제 서비스 준비 중/);
});

test("Field live home follows reference v3 hierarchy while sending AI-only visitors to AP", () => {
  const html = renderToStaticMarkup(<Home />);
  assert.match(html, /YOUR BUSINESS\. EVERYWHERE\./);
  assert.match(html, /내 사업의 시작부터/);
  assert.match(html, /고객을 만나는/);
  assert.match(html, /class="field-home-orbit"/);
  assert.match(html, /href="http:\/\/localhost:3001"[^>]*>AI만 도입하기/);
  assert.match(html, /내 홈페이지 만들기/);
});

test("Field design preview home keeps its entry on the non-saving preview", () => {
  const previous = process.env.APP_PROFILE;
  process.env.APP_PROFILE = "design_preview";
  try {
    const html = renderToStaticMarkup(<Home />);
    assert.match(html, /<a class="button primary" href="\/preview\/owner\/start">화면 둘러보기/);
    assert.doesNotMatch(html, /href="\/workspace"/);
    assert.match(html, /화면 검토본 · 실제 데이터 연결 전/);
  } finally {
    if (previous === undefined) delete process.env.APP_PROFILE;
    else process.env.APP_PROFILE = previous;
  }
});
