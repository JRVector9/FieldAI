import assert from "node:assert/strict";
import test from "node:test";
import { siteInquiryTestGuidance } from "../src/site-editor";

test("first inquiry trial stays unavailable until an owner has a public site and approved service", () => {
  assert.deepEqual(siteInquiryTestGuidance("org", null, false, 1),
    { href: null, reason: "홈페이지를 먼저 공개해 주세요." });
  assert.deepEqual(siteInquiryTestGuidance("org", 2, true, 1),
    { href: null, reason: "공개 제한 상태에서는 고객 화면을 확인할 수 없습니다." });
  assert.deepEqual(siteInquiryTestGuidance("org", 2, false, 0),
    { href: null, reason: "승인된 서비스가 있어야 테스트 문의를 만들 수 있습니다." });
  assert.deepEqual(siteInquiryTestGuidance("org", 2, false, 1),
    { href: "/public/org?ownerTest=1", reason: null });
});
