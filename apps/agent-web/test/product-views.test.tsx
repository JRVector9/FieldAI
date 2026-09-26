import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentPreviewContent } from "../src/agent-preview";
import { screens } from "../src/screens";

test("AP knowledge screen separates native drafts and connector review", () => {
  const screen = screens.owner.find(item => item.id === "AP-O02");
  assert.ok(screen);
  const html = renderToStaticMarkup(<AgentPreviewContent screen={screen} />);
  assert.match(html, /직접 입력 · 초안/);
  assert.match(html, /외부 정보 검토/);
  assert.match(html, /승인 전 고객 응대에 반영되지 않습니다/);
});

test("AP safe submission screen explains the unverified phone and separate access key", () => {
  const screen = screens.customer.find(item => item.id === "AP-C02");
  assert.ok(screen);
  const html = renderToStaticMarkup(<AgentPreviewContent screen={screen} />);
  assert.match(html, /미인증 번호/);
  assert.match(html, /별도 접수 확인키/);
  assert.match(html, /사진 첨부/);
});
