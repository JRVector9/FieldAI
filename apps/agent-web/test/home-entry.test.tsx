import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../src/app/page";

test("AP home opens its own working workspace before the design preview", () => {
  const html = renderToStaticMarkup(<Home />);
  assert.match(html, /<a class="agent-home-primary" href="\/workspace">내 AI 만들기/);
  assert.match(html, /href="\/preview\/owner\/start">사업자 관리실 체험/);
  assert.doesNotMatch(html, /현재는 화면 검토 단계입니다|설계 검토용 화면 · 실제 서비스 준비 중/);
});

test("AP design preview home keeps its entry on the non-saving preview", () => {
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
