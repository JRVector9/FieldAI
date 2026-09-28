import assert from "node:assert/strict";
import test from "node:test";
import { siteInquiryTestGuidance, siteTestAccessFromResponse, siteTestAccessFromSubscription } from "../src/site-editor";

test("first inquiry trial stays unavailable until an owner has a public site and approved service", () => {
  assert.deepEqual(siteInquiryTestGuidance("org", null, false, 1, true),
    { href: null, reason: "홈페이지를 먼저 공개해 주세요." });
  assert.deepEqual(siteInquiryTestGuidance("org", 2, true, 1, true),
    { href: null, reason: "공개 제한 상태에서는 고객 화면을 확인할 수 없습니다." });
  assert.deepEqual(siteInquiryTestGuidance("org", 2, false, 0, true),
    { href: null, reason: "승인된 서비스가 있어야 테스트 문의를 만들 수 있습니다." });
  assert.deepEqual(siteInquiryTestGuidance("org", 2, false, 1, false),
    { href: null, reason: "현재 이용 상태에서는 새 테스트 문의를 만들 수 없습니다. 구독 상태를 확인해 주세요." });
  assert.deepEqual(siteInquiryTestGuidance("org", 2, false, 1, null),
    { href: null, reason: "이용 상태를 확인하지 못했습니다. 새 테스트 문의를 만들기 전에 다시 확인해 주세요." });
  assert.deepEqual(siteInquiryTestGuidance("org", 2, false, 1, true),
    { href: "/public/org?ownerTest=1", reason: null });
});

test("owner test entitlement accepts only the current Field organization and authoritative access", () => {
  assert.equal(siteTestAccessFromSubscription({ product: "field", organizationId: "org", access: { canStartNew: true } }, "org"), true);
  assert.equal(siteTestAccessFromSubscription({ product: "field", organizationId: "org", access: { canStartNew: false, reason: "trial_ended" } }, "org"), false);
  assert.equal(siteTestAccessFromSubscription({ product: "agent", organizationId: "org", access: { canStartNew: true } }, "org"), null);
  assert.equal(siteTestAccessFromSubscription({ product: "field", organizationId: "other", access: { canStartNew: true } }, "org"), null);
  assert.equal(siteTestAccessFromSubscription({ product: "field", organizationId: "org", access: {} }, "org"), null);
  assert.equal(siteTestAccessFromSubscription(undefined, "org"), null);
  assert.equal(siteTestAccessFromResponse(403, { product: "field", organizationId: "org", access: { canStartNew: true } }, "org"), null);
  assert.equal(siteTestAccessFromResponse(503, { product: "field", organizationId: "org", access: { canStartNew: true } }, "org"), null);
  assert.equal(siteTestAccessFromResponse(200, { product: "field", organizationId: "org", access: { canStartNew: false } }, "org"), false);
});
