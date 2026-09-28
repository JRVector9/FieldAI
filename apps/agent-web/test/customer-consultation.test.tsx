import assert from "node:assert/strict";
import test, { before } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
require.extensions[".css"] = () => {};
let PublicKnowledgePage: typeof import("../src/agent-public").PublicKnowledgePage;
let ServiceSelect: typeof import("../src/agent-public").ServiceSelect;
before(async () => {
  ({ PublicKnowledgePage, ServiceSelect } = await import("../src/agent-public.js"));
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
