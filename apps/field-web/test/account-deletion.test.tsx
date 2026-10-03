import assert from "node:assert/strict";
import test from "node:test";
import { deletionMessage } from "../src/field-account";

test("Field deletion blockers map to actionable Korean guidance and unknown codes stay visible", () => {
  assert.match(deletionMessage("open_reservations"), /예약/);
  assert.match(deletionMessage("connections_active"), /AP 연결/);
  assert.match(deletionMessage("organization_deletion_required"), /조직 삭제/);
  assert.equal(deletionMessage("something_new"), "요청이 거절됐습니다 (something_new).");
});

test("Field Kakao-only account deletion asks for a recent Kakao sign-in instead of operator contact", () => {
  assert.match(deletionMessage("reauth_required"), /최근 5분 이내 카카오로 다시 로그인한 뒤 진행/);
  assert.doesNotMatch(deletionMessage("reauth_required"), /운영자에게 문의/);
  assert.match(deletionMessage("password_attempts_exceeded"), /15분/);
  assert.match(deletionMessage("media_permission"), /권한/);
});
