import assert from "node:assert/strict";
import test from "node:test";
import { deletionMessage, organizationChoices } from "../src/field-account";
import { deletionResumeBlockReason, stoppedAssetDeletionReason, stoppedDeletionReason } from "../src/field-admin-sections";

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

// 여러 조직 owner(추가): 조직이 둘 이상일 때만 삭제 대상 선택지를 보여 준다.
test("Field organization selector appears only for owners of more than one organization", () => {
  const item = (id: string) => ({ id, name: id, deleted: false, deletionStatus: "none" as const, scheduledAt: null, executedAt: null });
  assert.deepEqual(organizationChoices(null), []);
  assert.deepEqual(organizationChoices({ organizations: [item("a")] }), []);
  assert.deepEqual(organizationChoices({ organizations: [item("a"), item("b")] }).map(entry => entry.id), ["a", "b"]);
  assert.match(deletionMessage("password_required"), /비밀번호/);
});

// 삭제 요청 복구(추가): 멈춘 사유 코드를 운영자용 한국어로 보이고, 모르는 코드는 숨기지 않는다.
test("Field stopped deletion reasons are shown in Korean and unknown codes stay visible", () => {
  assert.equal(stoppedDeletionReason("media_permission,execution_attempts_stopped"), "사진 저장소 권한 부족 · 자동 실행 중지");
  assert.equal(stoppedDeletionReason("something_new"), "something_new");
  assert.equal(stoppedDeletionReason(null), "사유 기록 없음");
});

test("stopped deletion resume button names why it is disabled", () => {
  assert.match(deletionResumeBlockReason({ role: "auditor", reason: "충분히 긴 다시 실행 사유입니다", busy: false })!, /operator 권한/);
  assert.match(deletionResumeBlockReason({ role: "operator", reason: "짧음", busy: false })!, /10자 이상/);
  assert.match(deletionResumeBlockReason({ role: "operator", reason: "충분히 긴 다시 실행 사유입니다", busy: true })!, /진행 중/);
  assert.equal(deletionResumeBlockReason({ role: "operator", reason: "  충분히 긴 다시 실행 사유입니다  ", busy: false }), null);
});

// 실행 대기 사유: 상세 코드가 붙은 execution_failed도 앞부분으로 조회한다(원시 코드 노출 금지).
test("Field execution_failed with a detail code maps by prefix to a retry message", () => {
  assert.equal(deletionMessage("execution_failed:PAN01"), "실행 중 오류가 나 다시 시도합니다 (코드 PAN01).");
  assert.match(deletionMessage("execution_failed"), /다시 시도하고 있습니다/);
  for (const code of ["organization_not_found", "invalid_organization_id", "account_not_found"])
    assert.doesNotMatch(deletionMessage(code), /요청이 거절됐습니다|_/);
});

// 사진 삭제 복구(추가): 멈춘 사진 삭제 사유를 운영자용 한국어로 보이고, 모르는 코드는 숨기지 않는다.
test("Field stopped site photo deletion reasons are shown in Korean", () => {
  assert.equal(stoppedAssetDeletionReason("media_unavailable,attempts_stopped"), "사진 저장소 응답 실패 · 자동 재시도 중지");
  assert.equal(stoppedAssetDeletionReason("media_permission"), "사진 저장소 권한 부족");
  assert.equal(stoppedAssetDeletionReason("something_new"), "something_new");
  assert.equal(stoppedAssetDeletionReason(null), "사유 기록 없음");
});
