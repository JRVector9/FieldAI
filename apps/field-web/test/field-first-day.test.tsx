import assert from "node:assert/strict";
import test, { before } from "node:test";
import { siteInquiryTestGuidance, siteTestAccessFromResponse, siteTestAccessFromSubscription } from "../src/site-editor";

require.extensions[".css"] = () => {};
let ownerTestSubscriptionAccess: typeof import("../src/field-public").ownerTestSubscriptionAccess;
let canSubmitOwnerTest: typeof import("../src/field-public").canSubmitOwnerTest;
let canShowOwnerTestForm: typeof import("../src/field-public").canShowOwnerTestForm;
let checkOwnerTestBeforeSubmit: typeof import("../src/field-public").checkOwnerTestBeforeSubmit;
let ownerTestGateFailureMessage: typeof import("../src/field-public").ownerTestGateFailureMessage;
before(async () => {
  ({ ownerTestSubscriptionAccess, canSubmitOwnerTest, canShowOwnerTestForm, checkOwnerTestBeforeSubmit, ownerTestGateFailureMessage } = await import("../src/field-public.js"));
});

test("held site explains why a bookmarked owner test cannot be submitted", () => {
  assert.match(ownerTestGateFailureMessage(409, { error: "site_visibility_restricted" }), /공개 제한/);
  assert.match(ownerTestGateFailureMessage(409, { error: "site_not_published" }), /먼저 공개/);
});

test("unknown earlier test submit reconciles the site record even when subscription lookup fails", async () => {
  let gateReads = 0;
  const existingTest = { id: "saved", state: "needs_owner" };
  const checked = await checkOwnerTestBeforeSubmit("org",
    async () => { throw new Error("subscription unavailable"); },
    async () => { gateReads += 1; return { status: 200, data: { organizationId: "org", siteRevision: 2, existingTest } }; });
  assert.equal(gateReads, 1);
  assert.deepEqual(checked, { access: null, gate: { siteRevision: 2, existingTest }, gateFailed: false });
  const mismatched = await checkOwnerTestBeforeSubmit("org", async () => false,
    async () => ({ status: 200, data: { organizationId: "other", siteRevision: 2, existingTest } }));
  assert.deepEqual(mismatched, { access: false, gate: null, gateFailed: true });
  const allowed = await checkOwnerTestBeforeSubmit("org", async () => true,
    async () => { throw new Error("gate must not be read before a new POST"); });
  assert.deepEqual(allowed, { access: true, gate: null, gateFailed: false });
});

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

test("bookmarked owner test form requires both its site gate and current Field subscription", () => {
  const gate = { siteRevision: 2, existingTest: null };
  const allowed = { product: "field", organizationId: "org", access: { canStartNew: true } };
  assert.equal(ownerTestSubscriptionAccess(200, allowed, "org"), true);
  assert.equal(canSubmitOwnerTest(gate, true), true);
  assert.equal(canSubmitOwnerTest(gate, false), false);
  assert.equal(canSubmitOwnerTest(gate, null), false);
  assert.equal(canShowOwnerTestForm(gate), true);
  assert.equal(canShowOwnerTestForm(null), false);
  assert.equal(canSubmitOwnerTest(null, true), false);
  assert.equal(canSubmitOwnerTest({ ...gate, existingTest: { id: "old", state: "needs_owner" } }, true), false);
  assert.equal(ownerTestSubscriptionAccess(200, { ...allowed, access: { canStartNew: false } }, "org"), false);
  assert.equal(ownerTestSubscriptionAccess(403, allowed, "org"), null);
  assert.equal(ownerTestSubscriptionAccess(503, allowed, "org"), null);
  assert.equal(ownerTestSubscriptionAccess(200, { ...allowed, product: "agent" }, "org"), null);
  assert.equal(ownerTestSubscriptionAccess(200, { ...allowed, organizationId: "other" }, "org"), null);
  assert.equal(ownerTestSubscriptionAccess(200, { ...allowed, access: {} }, "org"), null);
});
