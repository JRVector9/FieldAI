import assert from "node:assert/strict";
import test from "node:test";
import { sitePhotoDeleteBlockReason } from "../src/site-editor";

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
