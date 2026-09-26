import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicKnowledgePage } from "../src/agent-public";

test("AP link offers AI guidance and keeps direct human submission visible", () => {
  const html = renderToStaticMarkup(<PublicKnowledgePage id="00000000-0000-4000-8000-000000000001" publicId="dep_testlink" />);
  assert.match(html, /AI에 질문/);
  assert.match(html, /사람에게 문의/);
});
