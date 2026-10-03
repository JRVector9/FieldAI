import assert from "node:assert/strict";
import test from "node:test";
import { scopeLabel } from "../src/connect-scope-label";

test("Field consent screen labels the proposal decision and notification route scopes in Korean", () => {
  assert.equal(scopeLabel("field.proposals.respond"), "제안에 대한 고객 결정 전달 (field.proposals.respond)");
  assert.equal(scopeLabel("field.notification_route.read"), "알림 경로 상태 읽기 (field.notification_route.read)");
  assert.equal(scopeLabel("field.facts.read"), "field.facts.read");
});
