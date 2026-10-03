import assert from "node:assert/strict";
import test from "node:test";
import { siteDraftSaveConflictNotice, sitePhotoDeleteBlockReason, sitePhotoDeletionBadge, sitePhotoSelectOptions,
  sitePublishConflictMessage } from "../src/site-editor";

const draft = { pages: [{ id: "page", slug: "home", title: "홈", sections: [
  { id: "section", kind: "hero" as const, heading: "소개", body: "", assetId: "used-photo", alt: "작업 사진" },
] }] };
const ready = { draft, dirty: false, busy: false, canManage: true as boolean | null };

test("photo delete is enabled only for an owner, unused, saved photo", () => {
  assert.equal(sitePhotoDeleteBlockReason({ id: "free-photo", inUse: false }, ready), null);
});

test("photo delete names the reason it is disabled", () => {
  assert.equal(sitePhotoDeleteBlockReason({ id: "free-photo", inUse: false }, { ...ready, canManage: null }),
    "삭제 권한을 확인하지 못했습니다. 권한 상태를 다시 확인해 주세요.");
  assert.equal(sitePhotoDeleteBlockReason({ id: "free-photo", inUse: false }, { ...ready, canManage: false }),
    "조직 소유자만 사진을 삭제할 수 있습니다.");
  // 서버가 아직 모르는 미저장 초안의 연결도 삭제를 막는다.
  assert.equal(sitePhotoDeleteBlockReason({ id: "used-photo", inUse: false }, ready),
    "현재 초안의 섹션에서 쓰는 사진입니다. 섹션에서 사진을 빼고 저장한 뒤 삭제할 수 있습니다.");
  assert.equal(sitePhotoDeleteBlockReason({ id: "free-photo", inUse: false }, { ...ready, dirty: true }),
    "변경 내용을 먼저 서버에 저장해 주세요.");
  assert.equal(sitePhotoDeleteBlockReason({ id: "free-photo", inUse: true }, ready),
    "공개 버전 기록에 포함됐거나 저장된 초안에서 쓰는 사진이라 삭제할 수 없습니다.");
  assert.equal(sitePhotoDeleteBlockReason({ id: "free-photo", inUse: false }, { ...ready, busy: true }),
    "진행 중인 작업이 끝나면 삭제할 수 있습니다.");
});

test("a photo whose deletion was requested shows a deleting badge and keeps the request button disabled", () => {
  // 삭제 요청(202) 뒤 작업자가 저장소에서 지울 때까지 "삭제 중 (추가)"로 보이고 다시 요청할 수 없다. 소유자 여부보다 먼저 판정한다.
  const deleting = { id: "free-photo", inUse: false, state: "deleting" as const };
  assert.equal(sitePhotoDeletionBadge(deleting), "삭제 중 (추가)");
  assert.equal(sitePhotoDeleteBlockReason(deleting, ready), "삭제 요청을 처리하고 있습니다. 저장소에서 지워지면 목록에서 빠집니다.");
  assert.equal(sitePhotoDeleteBlockReason(deleting, { ...ready, canManage: false }),
    "삭제 요청을 처리하고 있습니다. 저장소에서 지워지면 목록에서 빠집니다.");
  // 작업자가 멈춘 행(권한 부족·재시도 상한)은 성공처럼 보이지 않게 지연과 운영자 확인을 알린다.
  const stopped = { ...deleting, deletionStopped: true };
  assert.equal(sitePhotoDeletionBadge(stopped), "삭제 지연 (추가)");
  assert.equal(sitePhotoDeleteBlockReason(stopped, ready), "저장소 삭제가 멈춰 운영자 확인이 필요합니다. 이 사진은 초안·공개에 쓸 수 없습니다.");
  // 준비된 사진에는 상태 표시가 없다.
  assert.equal(sitePhotoDeletionBadge({ state: "ready" }), null);
  assert.equal(sitePhotoDeleteBlockReason({ id: "free-photo", inUse: false, state: "ready" }, ready), null);
});

test("section photo select offers only ready photos and keeps an assigned deleting photo visible as disabled", () => {
  const assets = [
    { id: "new", state: "ready" as const, width: 800, height: 600 },
    { id: "gone", state: "deleting" as const, width: 640, height: 480 },
    { id: "old", state: "ready" as const, width: 1200, height: 900 },
  ];
  // 삭제 중 사진은 다른 섹션에서 고를 수 없다. 번호는 보관함 목록과 같게 전체 순서를 따른다.
  assert.deepEqual(sitePhotoSelectOptions(assets, undefined), [
    { id: "new", label: "사진 3 · 800×600 · 서버 저장 완료", disabled: false },
    { id: "old", label: "사진 1 · 1200×900 · 서버 저장 완료", disabled: false },
  ]);
  // 이미 이 섹션에 지정된 삭제 중 사진은 "서버 저장 완료"로 보이지 않고 비활성으로 남는다.
  assert.deepEqual(sitePhotoSelectOptions(assets, "gone")[1], { id: "gone", label: "사진 2 · 640×480 · 삭제 중 (추가)", disabled: true });
});

test("draft save and publish 409 asset_deleting get their own notice instead of the revision conflict copy", () => {
  assert.equal(siteDraftSaveConflictNotice({ error: "asset_deleting" }),
    "삭제 요청한 사진이 초안에 남아 있습니다. 사진을 바꾸거나 제거한 뒤 저장해 주세요.");
  // revision 충돌은 기존 충돌 비교 화면으로 간다.
  assert.equal(siteDraftSaveConflictNotice({ error: "revision_conflict" }), null);
  assert.equal(siteDraftSaveConflictNotice(null), null);
  assert.equal(sitePublishConflictMessage({ error: "asset_deleting" }),
    "공개할 초안에 삭제 요청한 사진이 있어 공개하지 못했습니다. 섹션에서 사진을 바꾸거나 제거해 저장한 뒤 다시 공개해 주세요.");
  assert.equal(sitePublishConflictMessage({ error: "booking_schedule_not_ready" }),
    "시간표 예약에 신청 가능한 영업시간이 없어 공개하지 못했습니다. 예약 정책을 확인해 주세요.");
  assert.equal(sitePublishConflictMessage({ error: "revision_conflict" }), "초안 충돌 또는 승인된 사업 정보가 없어 공개하지 못했습니다.");
});
