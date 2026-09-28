# Field 첫 사용 수리 사후 감사 — 후속 PR 범위

기준 `3ca16ed`/clean main. 기존 F01.CATALOG/F02.EDITOR/F04.BASIC-PUBLISH/F06.INQUIRY/F09.TRIAL의 완료 기록은 보존하고, 소스 및 사후 읽기 전용 리뷰에서 확인된 아래 다섯 경계만 연다. 고정 `reference/field_ui_prototype_v3.html` 배치·색·글자·메뉴는 변경하지 않는다. QA07/09/10/17/70/71/76/79와 R00.QA, Field 단독 B02를 적용한다. 실제 고객/운영 데이터·외부 발송·청구·배포는 변경하지 않는다.

| 로컬 PR 단위 | 소유 파일 | 재현·목표 | 검수 명령 |
| --- | --- | --- | --- |
| PR5 첫 사용 상태·권한 | `apps/field-web/src/field-workspace.tsx`, `apps/field-web/src/site-editor.tsx`, 직접 관련 `apps/field-web/test/*first-use*` | 서비스 0개인데 공개 안내로 넘어가는 동선, editor의 owner 전용 승인/공개 버튼, 첫 100건 뒤 미열람 업무가 있는데 `오늘` 주 행동이 이를 건너뛰는 문제. 추가 재검토에서 `rejectExpiredTrial`은 신규 승인·공개를 403으로 막는데 화면 버튼은 활성화되는 누락 확인. 서버의 기존 빈 카탈로그 허용·승인 권한·체험 정책은 바꾸지 않고 UI 안내/버튼만 맞춘다. | TDD red→green, `pnpm --filter @fieldai/field-web test:unit`, `pnpm typecheck`, `pnpm lint`, `pnpm build:web:field` |
| PR6 공개 제한 시험 문의 | `apps/field-api/src/inquiries.ts`, `apps/field-api/test/site-inquiry-test.db.test.ts`, `apps/field-web/src/field-public.tsx` 및 직접 관련 웹 test | visibility hold 중 직접 URL ownerTest의 GET/POST를 신규 생성 불가로 처리한다. 기존 기록의 조회·동일 요청 재시도는 보존하고, UI에 공개 제한 이유/재확인 경로를 표시한다. 정상 공개/체험 종료/고객 문의 동작 유지. | 격리 DB 회귀 red→green, Field DB suite, Field web unit/typecheck/lint/build |

Coordinator가 순차 구현·리뷰하며 공통 DTO/schema/마이그레이션을 변경하지 않는다. 검수 전후 실제 명령·결과는 이 문서와 `docs/CODEX_HANDOFF.md`에 기록한다. 실패·미실행은 완료로 표시하지 않는다.

## 구현·검수 결과

- [x] PR5 첫 사용 상태·권한 — `2bd2898`, Field 웹92/92·typecheck/lint/build exit0. 전체 사용자 인수는 R00.QA에 남김.
- [x] PR6 공개 제한 시험 문의 — `1e290b9`, 격리 DB 표적1/1·Field 웹 회귀 포함. 전체 DB suite 실패는 아래 별도 gate에 남김.
- [ ] R00.QA/F09 환불 DB 실패 원인·최소 수리·Field 전체 DB suite 재검수.

- PR6 **1e290b9**: 공개 제한 중 ownerTest 신규 조회/제출 409, 기존 기록 조회와 같은 요청 replay 200. 변경 전 격리 DB 회귀는 GET200으로 실패(`/private/tmp/fieldai-post-audit-db-red.log`), 변경 후 독립 UUID DB 표적1/1(`/private/tmp/fieldai-audit-target-db.mjs`) 및 전체 suite의 해당 파일1/1 통과(`/private/tmp/fieldai-post-audit-db-green.log`).
- PR5 **2bd2898**: 서비스0개·cursor 뒤 업무·owner/editor·체험 종료/조회 실패 안내와 버튼을 보완. 웹 표적 회귀의 최초 실패를 확인한 뒤 최종 `pnpm --filter @fieldai/field-web test:unit` **92/92**, root `pnpm typecheck`·`pnpm lint`, `pnpm build:field`·`pnpm build:web:field` exit0. 로그는 `/private/tmp/fieldai-post-audit-{web-unit-final,typecheck-final,lint-final,web-build-final}.log`; API build는 실제 실행 exit0(터미널 출력). 최종 mock Field 재기동 후 API ready/site exact URL200, 비로그인 ownerTest401. `git diff --check` exit0.
- **전체 Field DB gate 실패:** `pnpm test:db:field`를 변경 전 red 회귀 및 API 수정 후 재실행했다. 최종 31파일/31 임시 DB 정리, 28파일 성공·3파일 실패(`ai-entitlement`, `billing-lifecycle`, `billing-refund`), 환불 1건 test180초 timeout, 명령 exit1. 같은 3파일은 변경 전 red suite에서도 실패해 ownerTest 패치와 독립된 현 상태의 문제다. 원인 미확정, R00.QA/F09 후속 PR로 남긴다. 이전 날짜의156/156 pass는 이 최신 실패를 덮지 않는다.
- Chrome/IAB 실제 로그인 화면 조작·모바일/접근성·전체 가입→예약 흐름·실 공급사/운영 승인·AP 제거 Field 독립성은 이번 범위에서 실행하지 않았다. 로컬 mock 외 배포·고객 발송·결제/환불·운영 자료 변경 없음.
