import assert from "node:assert/strict";
import test from "node:test";
import { siteBookingReadiness, sitePublishGuidance, sitePublishPermissionFromSubscription } from "../src/site-editor";

const ready = { restricted: false, busy: false, dirty: false, approved: true,
  canManage: true as boolean | null, canStartNew: true as boolean | null,
  revision: 1, publishedRevision: null as number | null, publishedCatalogRevision: null as number | null,
  approvedRevision: 1 };

test("publish guidance names a concrete repair path without calling a draft public", () => {
  assert.deepEqual(sitePublishGuidance({ ...ready, approved: false }),
    { reason: "사업 정보를 먼저 승인해 주세요.", href: "/workspace?section=services&edit=business&returnTo=publish", label: "사업 정보 입력·승인 열기(추가)" });
  assert.deepEqual(sitePublishGuidance({ ...ready, dirty: true, approved: false }),
    { reason: "변경 내용을 먼저 서버에 저장해 주세요.", href: null, label: null });
  assert.deepEqual(sitePublishGuidance({ ...ready, dirty: true, restricted: true }),
    { reason: "변경 내용을 먼저 서버에 저장해 주세요.", href: null, label: null });
  assert.deepEqual(sitePublishGuidance({ ...ready, dirty: true }),
    { reason: "변경 내용을 먼저 서버에 저장해 주세요.", href: null, label: null });
  assert.deepEqual(sitePublishGuidance({ ...ready, revision: 0 }),
    { reason: "사이트 초안을 먼저 저장해 주세요.", href: null, label: null });
  assert.equal(sitePublishGuidance(ready), null);
  assert.match(sitePublishGuidance({ ...ready, publishedRevision: 1 })?.reason ?? "", /이미 공개/);
  assert.deepEqual(sitePublishGuidance({ ...ready, restricted: true }),
    { reason: "사이트 공개가 제한되어 있습니다.", href: "/workspace/moderation", label: "신고·검토 결과 보기" });
  assert.match(sitePublishGuidance({ ...ready, canManage: false })?.reason ?? "", /소유자/);
  assert.match(sitePublishGuidance({ ...ready, canManage: null })?.reason ?? "", /권한/);
  assert.match(sitePublishGuidance({ ...ready, canStartNew: false })?.reason ?? "", /이용 상태/);
  assert.match(sitePublishGuidance({ ...ready, canStartNew: null })?.reason ?? "", /이용 상태/);
});

test("a newly approved catalog requires a fresh site draft before republishing", () => {
  assert.deepEqual(sitePublishGuidance({ ...ready, publishedRevision: 1, publishedCatalogRevision: 1, approvedRevision: 2 }),
    { reason: "새로 승인한 사업 정보를 반영하려면 사이트 초안을 다시 저장해 주세요.", href: null, label: null });
});

test("site publish permission uses only the matching Field organization", () => {
  assert.equal(sitePublishPermissionFromSubscription({ product: "field", organizationId: "org", canManage: true }, "org"), true);
  assert.equal(sitePublishPermissionFromSubscription({ product: "field", organizationId: "org", canManage: false }, "org"), false);
  assert.equal(sitePublishPermissionFromSubscription({ product: "agent", organizationId: "org", canManage: true }, "org"), null);
  assert.equal(sitePublishPermissionFromSubscription({ product: "field", organizationId: "other", canManage: true }, "org"), null);
});

test("site contact step distinguishes request intake from slot schedule readiness", () => {
  const services = [
    { id: "request", name: "희망시간", description: "", bookingMode: "request" as const, durationMinutes: 30, priceAmount: null },
    { id: "slot", name: "시간표", description: "", bookingMode: "slot" as const, durationMinutes: 30, priceAmount: null },
  ];
  assert.equal(siteBookingReadiness(services, "missing", null).slotReady, false);
  assert.match(siteBookingReadiness(services, "missing", null).message, /시간표.*설정/);
  assert.equal(siteBookingReadiness(services, "failed", null).slotReady, false);
  assert.match(siteBookingReadiness(services, "failed", null).message, /확인하지 못/);
  assert.equal(siteBookingReadiness(services, "ready", { weekly: {}, specialDates: {} }).slotReady, false);
  assert.equal(siteBookingReadiness(services, "ready", {
    weekly: { mon: { open: "10:00", close: "18:00" } }, specialDates: {},
  }).slotReady, true);
  assert.match(siteBookingReadiness([services[0]!], "missing", null).message, /희망시간.*접수/);
});
