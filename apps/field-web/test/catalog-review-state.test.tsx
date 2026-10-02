import assert from "node:assert/strict";
import test from "node:test";
import { catalogReviewNeeded } from "../src/catalog-review-state";

test("catalog review opens only for a changed-catalog response, not for current-catalog shapes", () => {
  const review = { expectedRevision: 2, previousCatalogRevision: 1, currentCatalogRevision: 2, previousService: {}, services: [] };
  assert.equal(catalogReviewNeeded(200, review), true);
  assert.equal(catalogReviewNeeded(200, { reviewRequired: false }), false);
  assert.equal(catalogReviewNeeded(200, { current: true }), false);
  assert.equal(catalogReviewNeeded(200, { ...review, reviewRequired: false }), false);
  assert.equal(catalogReviewNeeded(409, { error: "catalog_current" }), false);
  assert.equal(catalogReviewNeeded(200, null), false);
});
