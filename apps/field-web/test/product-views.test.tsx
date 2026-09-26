import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldPreviewContent } from "../src/field-preview";
import { screens } from "../src/screens";

test("Field contact setup separates direct inquiry and both reservation methods", () => {
  const screen = screens.owner.find(item => item.id === "F-O05");
  assert.ok(screen);
  const html = renderToStaticMarkup(<FieldPreviewContent screen={screen} />);
  assert.match(html, /직접 문의/);
  assert.match(html, /희망시간 제출형/);
  assert.match(html, /시간표 선택형/);
  assert.match(html, /AP 연결은 선택/);
});

test("Field direct inquiry explains guest access without phone-only disclosure", () => {
  const screen = screens.customer.find(item => item.id === "F-C04");
  assert.ok(screen);
  const html = renderToStaticMarkup(<FieldPreviewContent screen={screen} />);
  assert.match(html, /비회원 문의/);
  assert.match(html, /별도 확인키/);
  assert.match(html, /사진 첨부/);
});
