import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldPreviewContent } from "../src/field-preview";
import { screens } from "../src/screens";

test("customer booking preview distinguishes both request methods from confirmation", () => {
  const screen = screens.customer.find(item => item.id === "F-C05");
  assert.ok(screen);
  const html = renderToStaticMarkup(<FieldPreviewContent screen={screen} />);
  assert.match(html, /희망시간 제출형/);
  assert.match(html, /시간표 선택형/);
  assert.match(html, /예약 확정 아님/);
  assert.match(html, /서비스 정보와 예약 API 연결 후 이용할 수 있습니다/);
});
