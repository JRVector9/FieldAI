# AP·Field missed functions implementation plan

> **For agentic workers:** Implement PR slices with failing tests first, then the smallest production change and a focused green run. Keep AP, Field, and test runner branches isolated; Coordinator integrates and reviews.

**Goal:** Repair all seven omissions in `docs/technical/AP_FIELD_FUNCTION_REAUDIT_2026-09-29.md` while preserving AP/Field separation and the fixed Field v3 design.

**Architecture:** AP owns its inquiry/notification pagination, membership roles, and approved service identity. Field owns booking readiness and its notification status display. The E2E runner selects prerequisites by product; strict independence and full-suite checks remain separate. No shared DB/session, new external provider, or visual redesign.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, React/Next.js, Node test runner, pnpm.

---

## Baseline and constraints

- Source `main` `f199687`. Audit documentation is uncommitted at plan start; Coordinator owns `TASKS.md`, `docs/CODEX_HANDOFF.md`, this plan and audit documents.
- Existing unit gate: AP web CSS import failure (53/54), Field web 92/92. Existing Field DB suite: 3 files fail with refund worker `empty`/`blocked_integration`, root cause open. Do not change expected results or skip failing tests.
- Fixed Field UI reference: `reference/field_ui_prototype_v3.html`; new visible features use `(추가)`.
- Use isolated worktrees. AP owns only `apps/agent-api/**`, `apps/agent-web/**`; Field owns only `apps/field-api/**`, `apps/field-web/**`; runner owns only `tools/run-e2e.mjs` and `tools/test/**`; Coordinator owns docs and gate fixes outside those paths.

## PR A — AP work and notification pagination (A02/C03, QA35/41/120)

**Files:** `apps/agent-api/src/inquiries.ts`, focused `apps/agent-api/test/*` DB regression, `apps/agent-web/src/workspace.tsx`, focused `apps/agent-web/test/*`.

1. Add an API regression with 101+ owner inquiries, the older item `needs_owner`, and assert server-provided pending count/preview or a filtered cursor reaches it. Add a separate notification regression with >100 rows and an unread old row. Run each targeted test and observe the expected failure.
2. Implement a bounded query/filtered cursor and explicit continuation for both lists. The `오늘` count and next action must not infer zero from a truncated page or failed fetch. Preserve tenant/membership checks and existing cursor signatures.
3. Run the focused DB/web tests and ensure the 101st inquiry and notification can be opened. Record counts and cleanup of any temporary DB.

## PR B — AP knowledge roles and duplicate service identity (A01/A02/C03, QA22/81/134)

**Files:** `apps/agent-api/src/business.ts`, `inquiries.ts`, `customer-consultations.ts`, `apps/agent-web/src/workspace.tsx`, `agent-public.tsx`, directly related DB/web tests. PR A merges first because it also edits `workspace.tsx`/`inquiries.ts`.

1. Write failing tests for viewer read-only, editor save/no approve, owner approve, including a changed membership after page load. Preserve server 404/authorization.
2. Return current role with the AP draft response or use an existing own membership endpoint; make save/approve controls match permission and explain disabled reasons. New UI labels use `(추가)` if absent from existing design.
3. Write failing DB/web tests with two approved services sharing a name but different descriptions. Use the stable approved-release service index specified by `docs/03_INTEGRATION_CONTRACT.md` through direct form and consultation submission, so the second snapshot remains the second. Preserve already accepted legacy name-only submissions where unambiguous; reject ambiguous name-only input rather than silently selecting the first.
4. Run focused AP DB/web tests, then AP API/web typecheck/build. Do not alter Field domain or connector scope.

## PR C — Field booking readiness and first-use path (F04/F07, QA25/26/66/77)

**Files:** `apps/field-api/src/business.ts`, `sites.ts`, `bookings.ts` only if needed; `apps/field-web/src/site-editor.tsx`, `field-booking.tsx` only if needed; focused DB/web tests. No applied migration edits.

1. Write a failing new-organization regression: approve a request-booking service, publish, then submit a reservation without hidden policy setup. Separately cover slot service with no schedule. Confirm the observed `policy_not_set`/unavailable result.
2. Make request booking usable on first published site with an explicit own policy basis, and ensure slot booking requires a usable schedule before the publish UI declares that mode ready. Preserve deliberate non-booking site publication and owner policy edits. Guide the owner to the existing policy settings in the fixed design; mark new visible action `(추가)`.
3. Run both booking modes through isolated DB and Field web tests; verify client 409 handling still preserves input and reports the server reason.

## PR D — Field customer notification state (F07/F08, QA35~40/149)

**Files:** `apps/field-web/src/field-booking.tsx`, directly related web tests. PR C merges first because `field-booking.tsx` may overlap.

1. Write a failing web test for direct reservation confirm/propose/cancel ACK with `delivery: pending` and assert the UI does not say provider sending failed. Add a separate test for a settled unavailable state if the API exposes one.
2. Render the actual ACK/status distinction. Do not claim provider success from `pending`, and do not change AP-routed notification ownership. Use existing status view/refresh for later delivery state where available.
3. Run Field web tests/typecheck/build.

## PR E — own-product E2E prerequisites (C02/R00.QA, B01/B02/QA121/122/160)

**Files:** `tools/run-e2e.mjs`, a focused `tools/test/*` runner test.

1. Add a failing runner test showing `agent` checks only AP `.env`/API/web and `field` checks only Field prerequisites; distribution/full modes may require both. It must not need live services merely to test the precondition selection.
2. Restrict local settings and ready checks to the selected product without weakening the expected own product identity or mock-only guard. Keep strict opposite-service-absent proof in `test:independence:*`.
3. Run runner tests, contract/import checks and available mock E2E commands. Report prerequisites if services are absent.

## Coordinator integration and existing gates

1. Integrate in order A→B and C→D; PR E is independent. Inspect every diff, contract/schema impact, permissions, idempotency, fixed UI names, and test evidence. Run focused suites, root `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, API/web builds and relevant DB suites.
2. Repair the previously documented AP CSS import unit failure with a failing test/known repro and smallest test-boundary fix. For Field billing DB failures, measure `next_attempt_at`, DB/Node clock, claim lock and `error_code` in an isolated DB before changing code/fixture; rerun the failing files and full Field suite. Keep unrelated provider gates `blocked_integration`.
3. Update `TASKS.md`, coverage/remaining audit and `docs/CODEX_HANDOFF.md` with actual commands, results, commits and remaining external/acceptance gates. Do not check a scope complete on failing or unrun evidence.
