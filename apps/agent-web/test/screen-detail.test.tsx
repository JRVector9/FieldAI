import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScreenContent } from "@fieldai/ui";

test("an empty operations list keeps its own columns and empty guidance", () => {
  const html = renderToStaticMarkup(<ScreenContent screen={{
    id: "AP-A03", slug: "notifications", title: "발송", description: "알림 처리",
    kind: "list", columns: ["사건", "발송 상태", "최근 시도"],
    emptyTitle: "발송 기록이 없습니다", emptyBody: "실제 발송 시도와 결과가 여기에 표시됩니다.",
  }} />);
  assert.match(html, /발송 상태/);
  assert.match(html, /발송 기록이 없습니다/);
  assert.match(html, /실제 발송 시도와 결과/);
});
