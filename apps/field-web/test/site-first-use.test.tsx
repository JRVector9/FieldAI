import assert from "node:assert/strict";
import test from "node:test";
import { sitePublishGuidance } from "../src/site-editor";

const ready = { restricted: false, busy: false, dirty: false, approved: true,
  revision: 1, publishedRevision: null as number | null, publishedCatalogRevision: null as number | null,
  approvedRevision: 1 };

test("publish guidance names a concrete repair path without calling a draft public", () => {
  assert.deepEqual(sitePublishGuidance({ ...ready, approved: false }),
    { reason: "사업 정보를 먼저 승인해 주세요.", href: "/workspace?section=services&edit=business&returnTo=publish", label: "사업 정보 입력·승인 열기" });
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
});

test("a newly approved catalog requires a fresh site draft before republishing", () => {
  assert.deepEqual(sitePublishGuidance({ ...ready, publishedRevision: 1, publishedCatalogRevision: 1, approvedRevision: 2 }),
    { reason: "새로 승인한 사업 정보를 반영하려면 사이트 초안을 다시 저장해 주세요.", href: null, label: null });
});
