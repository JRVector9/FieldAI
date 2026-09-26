# C03 남은 내부 기능 — 고정 디자인 실행 계획 (2026-09-27)

State: implemented, focused locally verified. Source2362761에 저장했다. 기준 source a974b90 / documentation d0e0503, 기존 TASKS49[x] 유지 후52[x]/7[ ]. 사용자최종/실공급사/운영QA·출시는 별도다.
사용자 승인 범위: 내부 기능 완성·병렬 작업·로컬 저장. 시안 디자인 고정, 새 기능만 `(추가)`.

## 작업 범위와 소유권

| 세부 ID / Owner | 요구·QA | 변경 경로 / 완료 기준 |
|---|---|---|
| F03.ALLOWED-FONT / custom_domain | Field PRD3.2:17, QA07/12/58/72/73 | Field sites.ts, site-editor.tsx, field-site.tsx와 자체 관련 검사/허용 목록. 기존 폰트는 기본값으로 보존. 허용 폰트 선택→초안 저장→명시 공개→public 렌더→디자인 복구 연결. 자체 사이트 제작 AI는 선택 폰트를 유지. 플랫폼 디자인 변경 없음. |
| I03.SOURCE-SYNC-STATUS / public_write | Field PRD3.5:58/60, QA131/134/152 | AP 공개 source DTO/OpenAPI/동기화 시각 원본, Field ap-source-refresh.ts/field-source-refresh.tsx 및 소비 검사. 실제 저장 시각·nullable 계약을 Coordinator에게 먼저 제안하고 승인 뒤 계약→consumer→구현 순서. 이미 완료한 source 승인/worker 재구현 없음. |
| I06.AUTH-LIFECYCLE.UI / root | I06 부모 내부 부분, QA150/151/153/155 | field-ap-connections.tsx에 작은 별도 route-key component/client 연결. 기존 GET 상태와 POST close를 사용. 현재 owner/session/connection 기준, 명시 확인, 미상 결과에서 원closeId 유지. 기존 backend·migration·worker 동결. |

- 공통 app/빌드/runtime/docs/TASKS는 root만 수정한다. 다른 소유 경로 변경은 먼저 조율한다.
- AP81/Field73는 이미 적용되어 동결. schema가 실제 필요한 경우 AP82/Field74를 별도 승인/예약한다.
- 기준 원본 reference/field_ui_prototype_v3.html, 기존 배치/색/글자/반응형은 변경하지 않는다.
- 외부 공급사/실운영/사용자 최종 화면·동선·기기·320px 인수는 미완료로 유지한다.

## 검수 명령과 제한

코드 전에 최소 관련 검사를 기록하고, 실제 실행 결과/환경/로그를 아래에 남긴다.

- 허용 폰트: own UUID PG17 사이트 저장·공개·복구 및 허용 외 입력 거부를 확인하는 좁은 native 검사. 실행 명령은 기존 own test harness 조사 후 기록.
- 동기화: 고정 계약의 nullable timestamp·legacy 소비·잘못된 DTO와 source 상태를 검수. 원본 시각은 실제 DB 저장 값으로 대조.
- key UI: 좁은 client/consumer 검사로 현재 사용자·session 변경·응답 유실 재조회·같은 closeId 재시도·상태/키 노출 금지를 확인.
- 각 소유 범위 typecheck/lint. 소스 통합 뒤 `pnpm typecheck`, `pnpm lint` 한 번. 독립 읽기 전용 CLI 검토는 이전 승인 fallback gpt-6-sol/high.
- 최신 소스로 managed build와 own ready/SSR를 확인한다. 현재 managed83305는 먼저 종료 결과를 확인한 뒤 교체한다.
- 문서 단계 `/tmp/fieldai-report-venv/bin/python tools/build_report.py`, `tools/check_package.py`, `git diff --check`.

전체 선택적 E2E/QA160/브라우저 디자인 검수는 사용자 최종 검수로 남긴다. CUA file URL 거부를 우회하지 않는다. 실청구·환불·발송·DNS·운영 삭제·배포 없음.

## 결과 원장

### Root 착수 — I06.AUTH-LIFECYCLE.UI

- 기존 완료 backend를 읽은 결과 POST는 현재 owner를 검사하나 화면에서 확인한 actor/session과 요청 시점의 쿠키를 연결하는 검사는 없다. 로그인 교체 직후 새 owner 쿠키로 오래된 화면 확인을 제출할 수 있는 구체적 신규 UI 경합이다.
- 추가 범위: 기존 ap-route-key-lifecycle.ts에 선택적 UI actor/session 헤더 검사를 GET/POST 앞에만 연결한다. 헤더 없는 기존 native 계약/worker/폐기 domain은 유지한다. schema/권한 범위 변경 없음. 이전 I06.AUTH-LIFECYCLE.BACKEND 완료 이력 유지.
- 실제 예정 명령: `pnpm exec tsx --test apps/field-web/test/route-key-client.test.tsx apps/field-api/test/route-key-ui-fence.test.ts`; `pnpm --filter @fieldai/field-web typecheck`; `pnpm --filter @fieldai/field-api typecheck`; 변경 파일 scoped eslint. 원래 native 전체 재실행은 이 헤더 검사 이외 변경이 생길 때만 한다.
- 좁은 independent CLI44498 P2/raw confidence0.94: 새 session/두 탭의 cache 교체가 실제 서버 pending UUID 재시도를 막음. 신규 consumer red를 실제 실행하여 재현했다. Coordinator 추가 범위: own GET의 요청자 일치 boolean만 반환하고 현재 actor의 서버 pending UUID를 우선 재사용한다. 원 요청자 권한이 사라진 pending은 현재 owner의 명시 새 UUID를 기존 backend의 takeover 검사에 제출한다. 원backend 잠금/권한/worker/폐기 조건은 그대로다.
- 신규 boolean SQL 소비 때문에 기존 lifecycle DB 파일의 route-key case에 GET receipt/요청자일치/키원문 비노출 assertion만 추가한다. 자체 UUID runner를 임시 복사해 해당 case 하나만 실행한다. 이전 lifecycle 전체12를 반복 통과 주장하지 않는다.
- 두 번째 정적 review33245 P2/raw confidence0.91: 다른 former owner의 pending 뒤에 현재 actor의 과거 cancelled UUID cache가 남으면 같은 취소 요청을 반복하여 takeover가 막힘. 실제 마지막 새 consumer1개 red(기존6개는 green)로 재현했다. 원 POST의 UUID가 정확히 일치하는 서버 cancelled 영수증과 현재 session 재검사 뒤에만 metadata를 terminal로 기록한다. 재확인/명시 동의를 다시 거친 다음 요청에서 새 UUID를 만든다. unknown 요청은 terminal로 추정하거나 UUID를 바꾸지 않는다. 새 GET/domain/schema 추가 없이 기존 POST receipt를 소비한다.

- [x] F03.ALLOWED-FONT —2362761, own native1/1·API2/2·웹2/2, review .87. 상세own phase.
- [x] I03.SOURCE-SYNC-STATUS —2362761, 계약2/2·웹2/2·ownAP/Field 각1/1, review .88. 상세own phase.
- [x] I06.AUTH-LIFECYCLE.UI —2362761, consumer+API9/9·ownPG17 route-keycase1/1, finalreview .89.
- [x] 통합 type/lint·최신 managed·source2362761·완료 원장52[x]/7[ ]·인계·문서 검수·journal

## 중앙 실제 결과 / 실패와 복구

- `pnpm exec tsx --test apps/field-web/test/route-key-client.test.tsx apps/field-api/test/route-key-ui-fence.test.ts`: 최종9/9 exit0 `/tmp/c03-route-key-ui-cancelled-green.log`. 초기6green→새DTO recoveryred→8green, 정확cancelled 소비 미구현은 실제마지막consumer1red/기존6green→최종9green. 첫review .94의sessioncache 경로는 정적근거이며 초기새DTO red는oldparser가newboolean을거부한결과인점구분. review44498/.94·33245/.91 terminal0 후34899최종clean .89 terminal0. 테스트/브라우저 직접실행이 아닌 정적검토.
- `node /tmp/c03-route-key-ui-db-runner.mjs field`: own UUID PG17·정상앱 actualGET요청자일치/키원문비노출·기존원업무보존 조건,1329 terminalexit0 1/1 skip0. 원 test12전체 재실행 아님. 복사runner 첫CJSnamedimport는DB착수전exit1 `/tmp/c03-route-key-ui-native-launcher-failed.log`, defaultimport 최소보완 후 `/tmp/c03-route-key-ui-native-get.log`.
- whole `pnpm typecheck`10588와 `pnpm lint`45330 각각terminalexit0, `/tmp/c03-final-internal-{typecheck,lint}.log`. 중간Fieldweb78856 typeexit2의ownfixtureundefined·peer작성중오류는각owner보완해wholegreen. API59871/scopedlint18050 terminal0.
- old83305 Ctrl+C terminalexit1을 실제확인후 `pnpm mock:run > /tmp/c03-final-internal-managed.log 2>&1` PTY54544 한개기동. 최신양API/webbuild·ownmigrationAP81/Field73 그대로·compiledlegacy기준선·workerready 확인. 실제공급사는 blocked_integration. 새schema/worker없음.
- `node /tmp/c03-final-internal-runtime-evidence.mjs > /tmp/c03-final-internal-runtime-evidence.log 2>&1` 실제exit0: 양ready200·APworkspace/Fieldworkspace/site/integrations200·보호source/key401·controller42202/keyworker44583각1같은parent. 최초checker HTTP는모두성공했지만프로세스regex에서suite인수누락으로exit1(`/tmp/c03-final-internal-runtime-evidence-failed.log`),실제ps대조후checker만수정. 서버장애/가짜준비로표시하지않음.
- sourcecommit2362761,29files/672insert29delete. stagedcheck/diff0, reference원본/플랫폼CSS 변경없음. 현재owner/session UI추가범위만기존GET/POST앞fence와GET요청자boolean, domain/worker/잠금/원권한 변경없음. 사진/예약/카탈로그/원대화/공개릴리스/unknown원장삭제없음.
- 미실행: browser/최종디자인/실OS폰트/320px/실기기·전체QA160/전체unit/E2E·외부SDK/LLM/MFA/PG/발송/DNS/TLS·운영RPO/RTO/ACL/출시. 기능/권한/원본관점read-only최종대조는새확정누락없음,전체서비스QA통과는아님. 복구는새UI/helper를되돌리되legacyJSON·현재공개본·원예약·원UUID/작업원장을보존한다.
- 문서검수: 원장대조pythonexit0(기존49보존/52[x]·7pending/duplicate0/원본불변), build_report.py exit0(master1872행337468bytes/HTML384086bytes), check_package.py최종exit0(document_package_only/service_tests_executed=false,DAG46/QA160/schema3). 첫checker는인계`[ ]`직후괄호를inline link로해석하여exit1,문구공백만수정해회복(`/tmp/c03-final-internal-check-package-failed.log` 보존). 전체QA160 servicepass아님. diffcheck0, source/docs분리저장. AK journal 실제기록완료(2026-09-27 마지막 내부 기능과 로컬 사용 환경 2362761.md).

## F03.ALLOWED-FONT / custom_domain — 착수·설계·검수

- State: in_progress; source a974b90, 완료49[x] 보존. 요구 Field PRD3.2:17, QA07/12/58/72/73. 기존 시안 HTML/CSS를 로컬로 읽었으며 플랫폼 배치·폰트·CSS는 수정하지 않는다. 원본 file URL 보안 거부 이력에 따라 브라우저 우회/사용자 최종 시각 검수는 하지 않는다.
- Paths: `apps/field-api/src/sites.ts`, 신규 own `site-fonts.ts`, `site-generation.ts`의 선택 폰트 보존 부분; `apps/field-web/src/site-editor.tsx`, `field-site.tsx`, 신규 own `site-fonts.ts`; 신규 API `test/site-font.test.ts`, `test/site-font.db.test.ts`, web `test/site-font.test.tsx`. 중앙 등록/package/schema/runtime/Git/TASKS는 수정하지 않는다.
- Decision: optional `font` JSON 값은 `system-sans`/`system-serif`만 허용한다. absent는 현재 상속 글자를 유지한다. 선택 UI의 기본값은 기존 글자이며 제목은 `사이트 글꼴 (추가)`. 외부 font URL·임의 CSS·공급사 호출은 없다. 명시 공개/복구는 기존 JSON 경로를 사용하고, 제작 AI는 기존 선택 폰트를 보존한다. schema 변경 없음.
- QA: 허용/임의 입력 거부, legacy absent, 저장 응답 유실 비교의 font 차이, 신규 선택·public 렌더 범위, own UUID PG17 draft→불변 공개→변경→복구→재공개, 타조직 권한, AI 제안/적용 보존을 좁게 확인한다. 기존 editor/결제/quota 전체 검수를 반복하지 않는다.
- Commands planned: `pnpm --filter @fieldai/field-api exec tsx --test test/site-font.test.ts`; `/tmp/field-site-font-run-db.mjs`의 own UUID DB/migrate→`pnpm --filter @fieldai/field-api exec tsx --test test/site-font.db.test.ts`; `pnpm --filter @fieldai/field-web exec tsx --test test/site-font.test.tsx`; 두 제품 own `typecheck`, 변경 경로 scoped eslint, `git diff --check`. 독립 narrow Codex CLI gpt-6-sol/high read-only review는 실제 실행 결과를 기록한다. whole QA/E2E/브라우저/실공급사는 미실행.
