import assert from "node:assert/strict";
import test from "node:test";
import { deletionMessage } from "../src/agent-account";

test("AP deletion blockers map to actionable Korean guidance and unknown codes stay visible", () => {
  assert.match(deletionMessage("paid_subscription_active"), /유료 구독/);
  assert.match(deletionMessage("connections_active"), /Field 연결/);
  assert.match(deletionMessage("admin_membership_required_removal"), /관리자 권한/);
  assert.equal(deletionMessage("something_new"), "요청이 거절됐습니다 (something_new).");
});

test("AP Kakao-only accounts are told to sign in again within 5 minutes instead of contacting an operator", () => {
  assert.match(deletionMessage("reauth_required"), /최근 5분 이내 카카오로 다시 로그인한 뒤 진행/);
  assert.doesNotMatch(deletionMessage("reauth_required"), /운영자/);
  assert.match(deletionMessage("password_attempts_exceeded"), /15분/);
});
