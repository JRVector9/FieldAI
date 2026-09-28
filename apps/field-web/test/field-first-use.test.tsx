import assert from "node:assert/strict";
import test, { before } from "node:test";
import type { DraftCatalog } from "../src/field-api";
require.extensions[".css"] = () => {};
let catalogApprovalIssue: typeof import("../src/field-workspace").catalogApprovalIssue;
let canReturnToSite: typeof import("../src/field-workspace").canReturnToSite;
let firstUseAction: typeof import("../src/field-workspace").firstUseAction;
let ownerPermissionFromSubscription: typeof import("../src/field-workspace").ownerPermissionFromSubscription;
let siteReturnStep: typeof import("../src/field-workspace").siteReturnStep;
before(async () => {
  ({ catalogApprovalIssue, canReturnToSite, firstUseAction, ownerPermissionFromSubscription, siteReturnStep } = await import("../src/field-workspace.js"));
});

const draft: DraftCatalog = {
  organizationId: "org", revision: 1, businessName: "가게", industry: "", introduction: "",
  region: "", openingHours: "", contactPhone: "", defaultBookingMode: "request",
  services: [{ id: "service", name: "작업", description: "", bookingMode: "inherit", durationMinutes: 30, priceAmount: null }],
  faqs: [],
};

test("first action follows saved business approval and site publication, not optional AI", () => {
  const state = { catalog: draft, canManage: true, releaseState: "ready" as const, releaseRevision: null,
    siteState: "ready" as const, siteDraftRevision: 1, sitePublishedRevision: null, sitePublishedCatalogRevision: null, pendingInquiries: 0, pendingReservations: 0 };
  assert.deepEqual(firstUseAction({ ...state, catalog: { ...draft, businessName: "" } }),
    { label: "사업 정보 완성(추가)", href: "#owner-catalog" });
  assert.deepEqual(firstUseAction(state), { label: "사업 정보 승인(추가)", href: "#owner-catalog" });
  assert.deepEqual(firstUseAction({ ...state, releaseRevision: 1 }),
    { label: "홈페이지 확인·공개(추가)", href: "/workspace/site?step=publish" });
  assert.deepEqual(firstUseAction({ ...state, releaseRevision: 1, sitePublishedRevision: 1, sitePublishedCatalogRevision: 1, pendingReservations: 1 }),
    { label: "예약 요청 확인(추가)", href: "#owner-reservations" });
  assert.deepEqual(firstUseAction({ ...state, releaseRevision: 1, sitePublishedRevision: 1, sitePublishedCatalogRevision: 1, pendingInquiries: 1 }),
    { label: "문의 확인(추가)", href: "#owner-inquiries" });
  assert.deepEqual(firstUseAction({ ...state, catalog: { ...draft, businessName: "" }, sitePublishedRevision: 1, sitePublishedCatalogRevision: 1, pendingInquiries: 1 }),
    { label: "문의 확인(추가)", href: "#owner-inquiries" });
  assert.deepEqual(firstUseAction({ ...state, releaseRevision: null, sitePublishedRevision: null, pendingInquiries: 1 }),
    { label: "문의 확인(추가)", href: "#owner-inquiries" });
  assert.deepEqual(firstUseAction({ ...state, siteDraftRevision: null, sitePublishedRevision: null, pendingReservations: 1 }),
    { label: "예약 요청 확인(추가)", href: "#owner-reservations" });
  assert.deepEqual(firstUseAction({ ...state, releaseRevision: 1, siteDraftRevision: 2, sitePublishedRevision: 1, sitePublishedCatalogRevision: 1, pendingReservations: 1 }),
    { label: "예약 요청 확인(추가)", href: "#owner-reservations" });
  assert.deepEqual(firstUseAction({ ...state, releaseRevision: 1, siteDraftRevision: 2, sitePublishedRevision: 1 }),
    { label: "홈페이지 확인·공개(추가)", href: "/workspace/site?step=publish" });
  assert.deepEqual(firstUseAction({ ...state, releaseRevision: 1, siteDraftRevision: 1, sitePublishedRevision: 1, sitePublishedCatalogRevision: 0 }),
    { label: "홈페이지 확인·공개(추가)", href: "/workspace/site?step=publish" });
  assert.deepEqual(firstUseAction({ ...state, catalog: { ...draft, services: [] }, releaseRevision: 1 }),
    { label: "홈페이지 확인·공개(추가)", href: "/workspace/site?step=publish" });
  assert.deepEqual(firstUseAction({ ...state, siteDraftRevision: null, releaseRevision: 1 }),
    { label: "홈페이지 만들기(추가)", href: "/workspace/site?step=business" });
});

test("unknown approval or publication state never claims readiness", () => {
  const state = { catalog: draft, canManage: true, releaseState: "failed" as const, releaseRevision: null,
    siteState: "ready" as const, siteDraftRevision: 1, sitePublishedRevision: null, sitePublishedCatalogRevision: null, pendingInquiries: 0, pendingReservations: 0 };
  assert.deepEqual(firstUseAction(state), { label: "사업 정보 상태 확인(추가)", href: "#owner-catalog" });
  assert.deepEqual(firstUseAction({ ...state, releaseState: "ready", releaseRevision: 1, siteState: "failed" }),
    { label: "홈페이지 상태 확인(추가)", href: "/workspace/site?step=publish" });
});

test("non-owners see permission-aware actions and only the own subscription can grant owner status", () => {
  const state = { catalog: draft, canManage: false, releaseState: "ready" as const, releaseRevision: null,
    siteState: "ready" as const, siteDraftRevision: 1, sitePublishedRevision: null,
    sitePublishedCatalogRevision: null, pendingInquiries: 0, pendingReservations: 0 };
  assert.deepEqual(firstUseAction(state), { label: "사업 정보 승인 대기(추가)", href: "#owner-catalog" });
  assert.deepEqual(firstUseAction({ ...state, releaseRevision: 1 }),
    { label: "홈페이지 공개 상태 확인(추가)", href: "/workspace/site?step=publish" });
  assert.deepEqual(firstUseAction({ ...state, canManage: null }),
    { label: "권한 상태 확인(추가)", href: "/workspace/subscription" });
  assert.deepEqual(firstUseAction({ ...state, canManage: null, dirty: true }),
    { label: "사업 정보 확인(추가)", href: "#owner-catalog" });
  assert.equal(ownerPermissionFromSubscription({ product: "field", organizationId: "org", canManage: true }, "org"), true);
  assert.equal(ownerPermissionFromSubscription({ product: "field", organizationId: "org", canManage: false }, "org"), false);
  assert.equal(ownerPermissionFromSubscription({ product: "agent", organizationId: "org", canManage: true }, "org"), null);
  assert.equal(ownerPermissionFromSubscription({ product: "field", organizationId: "other", canManage: true }, "org"), null);
});

test("return to site waits for the saved business revision to be approved", () => {
  assert.equal(canReturnToSite(false, "idle", "ready", 2, 1), false);
  assert.equal(canReturnToSite(true, "idle", "ready", 2, 2), false);
  assert.equal(canReturnToSite(false, "idle", "ready", 2, 2), true);
});

test("site return retains the step that sent the owner to business editing", () => {
  assert.equal(siteReturnStep("?returnTo=site"), "business");
  assert.equal(siteReturnStep("?returnTo=publish"), "publish");
  assert.equal(siteReturnStep("?returnTo=elsewhere"), null);
});

test("approval explains unsaved and missing required values before enabling approval", () => {
  assert.match(catalogApprovalIssue({ ...draft, businessName: "" }, false, "idle", "ready", null) ?? "", /상호/);
  assert.match(catalogApprovalIssue(draft, true, "idle", "ready", null) ?? "", /저장/);
  assert.equal(catalogApprovalIssue(draft, false, "idle", "ready", null), null);
  assert.match(catalogApprovalIssue(draft, false, "idle", "ready", 1) ?? "", /이미 승인/);
});
