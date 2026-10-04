import assert from "node:assert/strict";
import test from "node:test";
import { DELETION_SCHEDULED_OWNER_MESSAGE, isDeletionScheduledAccess, isDeletionScheduledError } from "../src/deletion-scheduled-copy";
import { BillingClientError, billingErrorNotice } from "../src/billing-client";
import { previewLinksVisible } from "../src/preview-visibility";

// 조직 삭제 유예 중(deletion_scheduled) 사업자 화면 공통 문구(추가)
test("AP deletion_scheduled refusals (403 access gate or 409 start refusal) map to the shared owner copy", () => {
  assert.match(DELETION_SCHEDULED_OWNER_MESSAGE, /삭제 예정입니다/);
  assert.match(DELETION_SCHEDULED_OWNER_MESSAGE, /새 체험·결제·연결을 시작할 수 없습니다/);
  assert.match(DELETION_SCHEDULED_OWNER_MESSAGE, /계정·조직 삭제 화면/);
  assert.match(DELETION_SCHEDULED_OWNER_MESSAGE, /AI·사업 정보 승인/);
  assert.match(DELETION_SCHEDULED_OWNER_MESSAGE, /홍보/);
  assert.equal(isDeletionScheduledError(403, { error: "deletion_scheduled", accessMode: "cleanup_only" }), true);
  assert.equal(isDeletionScheduledError(409, { error: "deletion_scheduled" }), true);
  assert.equal(isDeletionScheduledError(403, { error: "trial_ended" }), false);
  assert.equal(isDeletionScheduledError(500, { error: "deletion_scheduled" }), false);
  assert.equal(isDeletionScheduledError(409, null), false);
  assert.equal(billingErrorNotice(new BillingClientError("deletion_scheduled", 409)), DELETION_SCHEDULED_OWNER_MESSAGE);
});

test("AP subscription access with reason deletion_scheduled hides new trial/checkout starts", () => {
  assert.equal(isDeletionScheduledAccess({ mode: "cleanup_only", canStartNew: false, reason: "deletion_scheduled" }), true);
  assert.equal(isDeletionScheduledAccess({ mode: "cleanup_only", canStartNew: false, reason: "trial_ended" }), false);
  assert.equal(isDeletionScheduledAccess({ mode: "trial", canStartNew: true }), false);
  assert.equal(isDeletionScheduledAccess(undefined), false);
});

// 클라이언트 컴포넌트의 /preview 링크는 빌드 시 넣은 NEXT_PUBLIC_APP_PROFILE로 live에서 숨긴다
test("AP preview links are hidden only for the live profile", () => {
  assert.equal(previewLinksVisible("live"), false);
  assert.equal(previewLinksVisible("mock"), true);
  assert.equal(previewLinksVisible(""), true);
  assert.equal(previewLinksVisible(undefined), true);
});
