# Field 사이트 제작 디자인 누락 보완 실행 계획

Task ID / Product / Owner: F02.EDITOR / F04.BASIC-PUBLISH · Field · Coordinator
State: implemented / wizard 및 usage·subscription 시각 검수 verified (기존 내부 완료 이력 유지)

**Goal:** 사용자 신고한 실제 디자인 선택 화면과 같은 원인의 누락을 고정 v3 시안대로 보완한다.
**Architecture:** 기존 SiteEditor의 상태/API를 유지한다. 단계 frame과 실제 상호 기반 템플릿 카드를 작게 분리하고, wizard CSS를 독립 파일로 둔다. pages 단계의 기존 direct-child grid와 public SiteRenderer에는 새 wizard 스타일을 적용하지 않는다.
**Tech Stack:** Next16 / React19 / TypeScript / CSS / node:test / Mac Chrome CUA.

## 범위와 근거

- 원본 `reference/field_ui_prototype_v3.html`: v2WizardFrame/v2StepBar/v2StepTitle/v2TemplateCards/v2Thumb/v2Design; render3에서도 그대로 사용한다.
- 실제 Chrome design/contact/publish에서 기본 회색 버튼 확인. pages는 이미 정상 디자인이다.
- `.state-switch`의 anchor 규칙과 `.deployment-options > div` 규칙이 실제 button에 적용되지 않는다. `.site-editor-pages` 밖에 단계 전용 CSS가 없다.
- Requirements: Field PRD3.2/3.3, AGENTS6.0/6.1. QA55/57/58/61/62: 실제 사업 정보, 최소14px/입력16px, 320px부터 반응형, 편집/미리보기 유지, 승인/공개 구분.
- 계약/schema/migration 변경 없음. 입력·공개·예약·구독 동의 등 실제 사용자 데이터 변경 없이 검수한다.

## 구현 순서 / 파일

- [x] `apps/field-web/test/site-editor-design.test.tsx`: SSR 카드 검사 먼저 실행. 실제 상호 escaping·3개 선택·선택 상태·빈 상호 fallback·frame의 기존 pages direct-child 유지 확인. 명령 `pnpm --filter @fieldai/field-web exec tsx --test test/site-editor-design.test.tsx`; 최초 module 부재 red를 보존한다.
- [x] `apps/field-web/src/site-editor-design.tsx`: `SiteTemplateCards({template,businessName,onChange})`는 SiteDraft template union을 사용하고 `button type="button" aria-pressed`와 실제 상호 thumbnail을 렌더링한다. 정적 template 소개 문구는 예시 디자인 설명으로만 사용하며 사업 사실을 생성하지 않는다.
- [x] `apps/field-web/src/site-editor-frame.tsx`: `SiteEditorFrame({step,mobileView,navigation,children})`는 pages일 때 기존 main 직계 children을 그대로 유지하고 다른 단계에는 sidebar/stage wrapper를 적용한다.
- [x] `apps/field-web/src/site-editor.tsx`: 기존 navigation을 frame prop으로 이동하고 design의 raw deployment-options를 카드로 교체. 다른 상태/handler/조건은 보존한다.
- [x] `apps/field-web/src/site-editor.css` 및 `src/app/layout.tsx`: 시안의 210px sidebar/930px content/3열 template/18px cards/blue selection/16px fields 적용. 820px에서 단계 가로 메뉴,620px에서 카드1열. preview 내부 `.field-site` 제외.
- [x] 다른 Field 실제 화면/소스 조사: workspace/home/admin/public은 기존 scoped 디자인 확인. usage/subscription의 raw button 누락은 기존 task 완료 이력을 유지해 scoped 클래스만 추가한다. 새 기능·API·도메인 경계를 바꾸지 않는다.

추가 실제 조사 근거: `/workspace#owner-reservations`에서 하단 수동 일정 버튼/카드 누락 확인. F07.BOOKING의 기존[x]를 유지하고 `site.css`의 `.booking-columns` scoped card/button/form styles만 추가한다. FieldConnect는 별도 `field-connect.css`가 이미 import되어 있어 변경하지 않는다.

추가 실제 조사 근거: 서비스→사업 정보·공개 관리 펼침에서 승인 버튼 native 스타일 확인. F01.CATALOG의 기존[x]를 유지하고 catalog editor 버튼/공개 관리 링크·문단 간격만 scoped 보완한다.

## 검수 / 완료 절차

- [x] 새 SSR + 기존 font/image/editor-preview 검사를 실행: `pnpm --filter @fieldai/field-web test:unit`.
- [x] `pnpm --filter @fieldai/field-web typecheck`, `pnpm lint`, `pnpm build:web:field`, `git diff --check` 실행.
- [x] 현재 managed listener/controller 확인 후 기존 mock 실행만 사용한다. 새 build 실제 반영·3002 응답을 확인한다. DB/environment/계정은 보존한다.
- [x] CUA Chrome: design/business/contact/publish/pages·usage/subscription/workspace 확인, design320/390/768/1440px 실제 검수.
- [ ] 브라우저 후속 검수: 마지막 booking/catalog 추가CSS 시각 재확인·integrations 정상 재확인. Chrome cgWindowNotFound와 Chrome/IAB browser unavailable로 현재 미실행. 최신 compiled CSS 제공/route200은 확인했다. 관리자/고객 실제 데이터 상태·전체 QA/인수는 별도다.
- [x] TASKS/coverage/잔여 audit/이 계획/인계에 실제 실행 결과와 미실행 범위를 기록하고 로컬 commit 생성. remote publish는 이번 요청 범위에 포함하지 않는다.

Rollback: 이 단계의 frontend markup/CSS만 revert하면 이전 화면으로 복구된다. API/DB/초안 revision은 바뀌지 않는다. 로컬 서버가 종료된 것이 확인되어 기존 `pnpm mock:run`을 session15771로 재기동 중이며 로그는 `/private/tmp/fieldai-design-repair-managed.log`다.

## 실제 완료 근거

코드 commit **f1f4f0a**, 기존 API/state handler prefix 비교 동일. SSR red exit1→3/3 exit0; Field 웹76/76, typecheck·lint·최종build·diff check exit0. 정확 로그/환경/미실행은 LOCAL_FUNCTIONAL_COVERAGE 최신 섹션에 기록했다. 최종 managed session10995/controller95568·양API ready200/Field routes200, `/private/tmp/fieldai-design-verification.json` actual served CSS marker 확인 exit0. 초기15771와 중간2639는 정상종료된 이력이다. 승인/공개·체험/예약/고객 데이터 변경 없이 read-only UI 검수를 했다.
