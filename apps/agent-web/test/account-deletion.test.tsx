import assert from "node:assert/strict";
import test from "node:test";
import { deletionMessage, organizationChoices } from "../src/agent-account";
import { stoppedDeletionReason } from "../src/agent-admin-sections";

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

// 여러 조직 owner(추가): 조직이 둘 이상일 때만 삭제 대상 선택지를 보여 준다.
test("AP organization selector appears only for owners of more than one organization", () => {
  const item = (id: string) => ({ id, name: id, deleted: false, deletionStatus: "none" as const, scheduledAt: null, executedAt: null });
  assert.deepEqual(organizationChoices(null), []);
  assert.deepEqual(organizationChoices({ organizations: [item("a")] }), []);
  assert.deepEqual(organizationChoices({ organizations: [item("a"), item("b")] }).map(entry => entry.id), ["a", "b"]);
  assert.match(deletionMessage("password_required"), /비밀번호/);
});

// 삭제 요청 복구(추가): 멈춘 사유 코드를 운영자용 한국어로 보이고, 모르는 코드는 숨기지 않는다.
test("AP stopped deletion reasons are shown in Korean and unknown codes stay visible", () => {
  assert.equal(stoppedDeletionReason("execution_failed:PAN01,execution_attempts_stopped"), "실행 오류(PAN01) · 자동 실행 중지");
  assert.equal(stoppedDeletionReason("something_new"), "something_new");
  assert.equal(stoppedDeletionReason(null), "사유 기록 없음");
});
