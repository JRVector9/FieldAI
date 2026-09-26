# F03.ALLOWED-FONT — Field 허용 글꼴 내부 기능 (2026-09-27)

Task ID / Product / Owner: F03.ALLOWED-FONT / Field / custom_domain
State: implemented; focused locally verified, independent review clean. Source frozen; central web type/managed/commit bookkeeping remains Coordinator-owned.
Base: source a974b90, instructions d0e0503; 완료49[x]와 기존 editor/quota/domain/billing/lifecycle 구현은 보존한다. 중앙 C03_FINAL_INTERNAL_UI_EXECUTION_PLAN의 착수 기록은 이력으로 유지하며 결과는 이 독립 파일에 기록한다(Coordinator의 동시 편집 방지 지시).

## 요구·경로·설계

- Field PRD3.2:17의 허용 폰트, QA07/12/58/72/73 적용. 시안 `reference/field_ui_prototype_v3.html`의 기존 HTML/CSS를 로컬로 읽었다. 플랫폼 색·글자·배치·메뉴·반응형 CSS 변경 없음. 시안에 없는 selector는 기존 디자인 패널 안 `사이트 글꼴 (추가)`다.
- API: `apps/field-api/src/sites.ts`, 새 `site-fonts.ts`, `site-generation.ts`의 font 보존 부분, 새 `test/site-font.test.ts`와 `test/site-font.db.test.ts`.
- Web: `apps/field-web/src/site-editor.tsx`, `field-site.tsx`, 새 `site-fonts.ts`, 새 `test/site-font.test.tsx`.
- optional `font` JSON 값은 `system-sans` 또는 `system-serif`. 기존 absent에는 속성을 추가하지 않고 현재 typography를 상속한다. 외부 font 다운로드/임의 font/CSS를 허용하지 않는다. 선택 폰트는 공개 site root와 별도 고정 폰트가 있던 editorial h1에만 적용한다. 새 옵션은 고딕/명조이며 기본은 기존 글자 유지다.
- `SiteContent` parser가 allowlist를 검증하고 기존 draft/release/restore JSON 경로가 저장한다. 기존 명시 승인/불변 release/revision 충돌/tenant 권한은 그대로 사용한다. 저장 응답 유실 시 내용 비교에 font를 포함해 font만 다른 서버 초안과 동일하다고 오인하지 않는다.
- 제작 AI의 기존 photo 보존 단계는 현재 draft.font도 보존한다. 이전에 저장된 font 없는 AI 제안을 적용할 때도 현재 선택을 보존한다. AI 모델 schema/호출/제공량 원장은 변경하지 않는다.
- schema/migration/DTO 공개 네트워크 계약/app 등록/package/runtime/env/Git 변경 없음. root의 중앙 완료 원장·인계·commit·managed 통합은 별도다.

## 실제 집중 검수

환경: Node24.18.0, own Field PG17 localhost55432/field_local, 매 실행마다 `fieldai_field_test_<UUID>`의 새 synthetic DB만 생성/own migration/검사/종료한다. 외부 공급사·상대 제품 DB 없이 정상 createFieldApp를 사용한다. test UUID user/organization/site만 사용하고 운영 자료/실 font 공급사 호출은 없다.

| 명령 | 실제 결과 / 근거 |
|---|---|
| `pnpm --filter @fieldai/field-api exec tsx --test test/site-font.test.ts` | 최초0/2 red: parser의 font undefined, AI selected font undefined. 구현 뒤 2/2 exit0, `/tmp/field-site-font-unit-green.log` (f0d88b). 허용2종·invalid/null/URL/prototype/CSS 거부·legacy absence·AI 선택 보존. |
| `pnpm --filter @fieldai/field-web exec tsx --test test/site-font.test.tsx` | 최초0/2 red: public font style 없음, selector 없음. 구현 뒤2/2 exit0, `/tmp/field-site-font-web-green.log`; fixture type 수정 뒤 최종2/2 exit0 `/tmp/field-site-font-web-final.log` (04194d). 실제 React SSR로 editorial h1·root 선택, absent/invalid style 없음, selector/label·font-only conflict 비교 확인. |
| `node /tmp/field-site-font-run-db.mjs` | 첫21888 terminalexit1, native0/1 red: 정상PUT응답의 font undefined(`/tmp/field-site-font-native-red.log`). 구현 뒤7083 terminalexit0, 1/1 fail0/skip0(`/tmp/field-site-font-native-green.log`). draft→GET→공개→다른초안→불변공개→invalid 400/revision 유지→다른font 공개→복구초안→재공개, legacyAI apply 보존→absent reset/public, 다른actor GET/PUT404 확인. |
| `pnpm --filter @fieldai/field-api typecheck` | 26541 terminalexit0, `/tmp/field-site-font-api-type.log`. |
| `pnpm --filter @fieldai/field-web typecheck` | 첫12469 terminalexit1: own Catalog fixture faqs 누락과 peer source-sync/key 작성중 오류. own faqs 보완 후73996 terminalexit2(`/tmp/field-site-font-web-type-repaired.log`)는 peer `field-source-sync-status.test.tsx`의 missing module/작성중 인수 타입2개만 남음; own 오류0. 이 제품 전체 typecheck를 green으로 주장하지 않는다. Coordinator가 peer 준비 후 중앙 검수한다. |
| `pnpm exec eslint apps/field-api/src/sites.ts apps/field-api/src/site-fonts.ts apps/field-api/src/site-generation.ts apps/field-api/test/site-font.test.ts apps/field-api/test/site-font.db.test.ts apps/field-web/src/site-editor.tsx apps/field-web/src/field-site.tsx apps/field-web/src/site-fonts.ts apps/field-web/test/site-font.test.tsx` | 69754 terminalexit0, `/tmp/field-site-font-lint.log`. |
| `git diff --check` | f0937f exit0; 다른 병렬 source는 변경하지 않았다. |

Unit/web 최초 red는 실제 tool 출력으로 확인했고 별도 raw log 파일은 저장하지 않았다. Native red/green과 최종 통과는 위 실제 파일에 남겼다. native에 쓰는 임시 launcher는 명시 own UUID DB만 만들며 peer URL/env fallback을 사용하지 않는다.

## 독립 리뷰·실패·잔여

- 승인 fallback `codex exec -m gpt-6-sol -c model_reasoning_effort="high" -s read-only --skip-git-repo-check -C /Users/jr/Desktop/projects/FieldAI -o /tmp/field-site-font-review-result.md - < /tmp/field-site-font-review-prompt.txt > /tmp/field-site-font-review.log 2>&1`:32932 terminalexit0. 실제 최종 파일을 읽었다: **concrete P1/P2 없음, raw confidence0.87**, tokens used57,118. 제한된9source/test 및 own scope의 정적 읽기/targeted diff만; tests/CSS/browser/provider/다른 agent source는 검수하지 않았다. finding/repair/falsepositive는 없음.
- 기존 테스트 삭제/기대값 완화/완료[x] 재검수 없음. native 원장 및 기존 승인·사진·카탈로그·예약 정책 변경 없음. 새 helper/selector를 제거해도 기존 absent JSON/화면을 그대로 사용하는 복구가 가능하다. 공개 release를 삭제/초기화하지 않는다.
- 최종 사용자 시각/동선/320px/실기기/전체 QA/E2E, 실제 LLM/font OS별 모양·실 공급사·운영 인수는 미실행이다. file URL 보안거부를 HTTP/CDP/다른 브라우저로 우회하지 않았다. 내부 검수와 출시 승인 분리.
- 완료 체크: [x] 요구/경로/결정/명령 착수 기록, [x] 실제 red→green API2/2·web2/2·own native1/1, [x] API type/scoped lint, [x] 정적 독립 clean 및 파일 동결. [ ] 중앙 제품 전체 web type/managed/source commit/TASKS/인계, [ ] 사용자 최종 시각·동선·기기/공급사. 기존 완료49개를 다시 열지 않았다.
- [x] 중앙 통합 완료: source2362761, whole type10588/lint45330 exit0, managed54544 latest 양build/ready·Fieldsite200. TASKS52[x]/7[ ]·coverage/audit/인계실제체크. 이전 중앙미완료문구는당시이력이며이제반복하지않는다. 사용자최종시각/동선·기기/실공급사는별도미완료다.
- 다음: source동결을유지하고 사용자최종인수/실공급사지정후속을지원한다. app등록/schema/package patch없음. own diffcheck최종exit0도확인했다.
