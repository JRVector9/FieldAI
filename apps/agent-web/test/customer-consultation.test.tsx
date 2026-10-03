import assert from "node:assert/strict";
import test, { before } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
require.extensions[".css"] = () => {};
let PublicKnowledgePage: typeof import("../src/agent-public").PublicKnowledgePage;
let ServiceSelect: typeof import("../src/agent-public").ServiceSelect;
let unsupportedInquiryPhotoMessage: typeof import("../src/agent-public").unsupportedInquiryPhotoMessage;
let DELETION_SCHEDULED_MESSAGE: string;
before(async () => {
  ({ PublicKnowledgePage, ServiceSelect, unsupportedInquiryPhotoMessage, DELETION_SCHEDULED_MESSAGE } = await import("../src/agent-public.js"));
});

// 사진 형식 거절(415)은 재시도 안내 없이 다른 형식을 고르게 하고, 삭제 예정 사업장은 접수 중지 사유를 보여 준다.
test("AP photo 415 copy maps the HEIC hint without retry wording, and deletion_scheduled has its own copy", () => {
  assert.match(unsupportedInquiryPhotoMessage("heic_unsupported"), /HEIC 사진은 지원하지 않습니다/);
  assert.match(unsupportedInquiryPhotoMessage(null), /지원하지 않는 사진 형식/);
  for (const hint of ["heic_unsupported", null]) assert.doesNotMatch(unsupportedInquiryPhotoMessage(hint), /다시 시도/);
  assert.equal(DELETION_SCHEDULED_MESSAGE, "이 사업장은 삭제 예정이라 새 접수를 받지 않습니다.");
});

test("AP link offers AI guidance and keeps direct human submission visible", () => {
  const html = renderToStaticMarkup(<PublicKnowledgePage id="00000000-0000-4000-8000-000000000001" publicId="dep_testlink" />);
  assert.match(html, /AI에 질문/);
  assert.match(html, /사람에게 문의/);
});

test("approved services with the same name remain separately selectable", () => {
  const html = renderToStaticMarkup(<ServiceSelect services={[{ name: "상담", description: "방문" },
    { name: "상담", description: "전화" }]} selectedIndex={1} onSelect={() => {}} />);
  assert.match(html, /<option value="0">상담 · 방문<\/option>/);
  assert.match(html, /<option value="1" selected="">상담 · 전화<\/option>/);
});
