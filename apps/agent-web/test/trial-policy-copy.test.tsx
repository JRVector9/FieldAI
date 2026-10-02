import assert from "node:assert/strict";
import test from "node:test";
import { trialPolicyCopy } from "../src/trial-policy-copy";

test("AP trial copy says local mock only for the mock policy", () => {
  const copy = trialPolicyCopy({ consentVersion: "mock-trial-v1", days: 14, source: "mock" });
  assert.match(copy.offer, /로컬 mock 전용 14일/);
  assert.equal(copy.consent, "14일 체험(로컬 검수용)을 시작하는 데 동의합니다.");
});

test("AP configured trial copy uses the configured days without mock wording", () => {
  const copy = trialPolicyCopy({ consentVersion: "trial-2026-10", days: 30, source: "configured" });
  assert.equal(copy.offer, "30일 무료 체험, 카드 등록 없음, 자동 유료 전환 없음.");
  assert.equal(copy.consent, "30일 무료 체험을 시작하는 데 동의합니다.");
  assert.doesNotMatch(copy.offer + copy.consent, /mock|로컬/);
});

test("AP unavailable trial policy shows the blocked reason and no consent to start", () => {
  const copy = trialPolicyCopy({ consentVersion: null, days: null, source: "unavailable" });
  assert.match(copy.offer, /승인되지 않아/);
  assert.equal(copy.consent, null);
});
