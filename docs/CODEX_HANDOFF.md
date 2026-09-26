# CODEX 인수인계 — 2026-09-26

## 사용자 지정 기준 시안 — 작업 재개 시 필수 확인

- **사용자 지정 화면·기능·동선 구현 기준 시안(필수 참조):** `/Users/jr/Desktop/projects/FieldAI/reference/field_ui_prototype_v3.html`
- 저장소 기준 경로: [reference/field_ui_prototype_v3.html](../reference/field_ui_prototype_v3.html). 후속 에이전트도 이 파일을 화면·동선 구현 기준으로 사용하며, 인수인계 갱신 시 이 시안 경로를 상단에 유지한다.
- 화면·기능 구현 중에도 해당 역할의 시안을 수시로 다시 확인한다. 경로 기록만으로 시안을 확인했다고 보고하지 말고, 실제 열어 본 화면과 비교 범위를 작업 기록에 남긴다.
- 화면·동선 작업은 이 HTML을 직접 열어 해당 역할·화면을 확인하고 실제 AP/Field 화면과 대조한다. 시안의 통합 계정·공유 데이터 표현은 `AGENTS.md`와 v3.0 개발 문서의 독립 제품 경계에 맞춰 해석한다.
- **사용자 요청:** `CODEX_HANDOFF.md`에 위 시안 경로를 계속 남긴다. 이 섹션은 인계파일 상단에 유지하고, 화면 구현을 재개할 때 `/Users/jr/Desktop/projects/FieldAI/reference/field_ui_prototype_v3.html`을 직접 연 뒤 해당 화면·기능·동선을 비교한다.

## 필수 사용자 지침 — 완료 체크/재작업 금지 (2026-09-26)

- 사용자가 **“완료된 작업은 체크하고, 에이전트가 잊고 같은 작업을 다시 하지 않도록 반드시 지켜”**라고 명시했다.
- 작업 재개 전에 `TASKS.md` 상단 **완료 체크 — 재작업 방지 기준**을 먼저 읽는다. 이 목록이 완료 세부 ID의 기준 원장이다. 상세 규칙은 `AGENTS.md`6.1. 기억 부재/compaction으로 완료 항목을 재구현·검수 반복하지 않는다.
- 최초 체크 정리는 현재 로그/AP29·Field30/commit/source와 기존 evidence로 로컬 완료31개[x]/잔여8개[ ]를 기록했다. 위젯(fe6a524) 완료 당시32개[x]/7개[ ]였고, **A07.F09.PLAN-BASIS(b639a4d)** 추가로 현재 **33개[x]/7개[ ]**다. 아래 최신 단계와 TASKS 원장이 우선한다. 전체 부모Task/QA160/출시를 완료 처리한 것은 아니다. phase plan에서 이미 구현된 AP native 회수5개가 아직 `[ ]`였던 것을 실제 결과에 맞춰 `[x]`로 수정했다.
- 신규 오류/요구변경/현재상태 불일치가 확인됐을 때만 같은 완료 ID에 재개 사유·증거·추가 범위를 먼저 기록한다. 이전 완료 근거/commit은 삭제하지 않는다.
- 변경 파일: AGENTS.md·TASKS.md·PHASE_2_EXECUTION_PLAN·DEVELOPMENT_REMAINING_AUDIT·이 인계. 문서 변경으로 서비스 테스트 재실행 없음, diff 체크만 수행. 현재 mock36780 양 ready/생존을 실제 재확인했다.
- 원래 진행 목표는 계속 전체 v3/C03 로컬 기능이다. 체크 정리 당시 다음은 A05.WIDGET-END였으며 현재 진행 상태는 바로 아래 별도 세부 작업 기록을 따른다.

## 현재 인수인계 — A07.F09.PLAN-BASIS 완료 (2026-09-26)

- **Objective / Task / Product / Owner / State:** 전체 v3/C03 기능과 사용 가능한 로컬 환경 구축은 active/in_progress. 이번은 A07.F09.PLAN-BASIS / AP와 Field 각 자체 소유 경로 / 순차 Coordinator·AP·Field / implemented 및 아래 내부 범위 verified. 직전 goal 턴은 위젯/체크의 progress였고 이번도 실제 코드·검수·런타임·완료 체크의 progress다. main A07.F09.PAID 전체·QA160·출시는 미완료다.
- **완료/코드 commit:** **b639a4d**, 가격 버전 요청→다른 operator 승인→판매 중지, 승인 불변·제품별 자체 조회, immutable consent/plan snapshot·기간 중복/겹침 차단, 원래 KST 일시를 유지한 월말 계산. TASKS33[x]/7[ ]·paid plan/phase/coverage/audit를 같은 checkpoint에 갱신했다. 이 ID를 기억 부재로 재작업하지 않는다. owner 유료 동의/카드 인증/결제 성공·worker/갱신/해지/유예/환불/제공량/UI는 포함하지 않는다.
- **Modified paths / requirements:** AP migration69·Field63, 각 src/billing-routes.ts/billing.ts/billing-period.ts·app.ts·test/paid-billing.db.test.ts/billing-period.test.ts·package unit script. TASKS·새 A07_F09_PAID_EXECUTION_PLAN·PHASE_2_EXECUTION_PLAN·LOCAL_FUNCTIONAL_COVERAGE·DEVELOPMENT_REMAINING_AUDIT·이 인계/옵시디언. AP PRD2.8·Field3.8·보안5.4/5.5·QA43~46/113/126/146의 저장 기반 부분이며 해당 QA/G 전체 pass가 아니다. 공개 cross-product 계약/SDK/scopes 변경 없음.
- **Key decisions:** AP/Field DB/domain/가격/identity/이벤트를 공유하지 않는다. 통합 제안29,000/31,900원을 가격으로 승계/seed하지 않는다. 승인 가격/약관/환불/제공량은 새 불변 버전, `(subscription_id,billing_period)` 유일하며 같은 구독의 `[start,end)` overlap은 DB exclusion으로 거절한다. 기간 상관은 승인 plan과 consent snapshot을 검증한다. 판매 중지는 새 가입만 막고 기존 원장 유지. non-mock admin/MFA와 live 가격 승인 미연결은503/blocked_integration이며 mock 승인을 live 승인으로 바꾸지 않는다. 제공량은 현재 저장만 했으며 사용량 제한 구현은 다음 단계다.
- **Tests actually run / environment:** Node24.18.0·각 own UUID PG17. focused runners `/tmp/ap-paid-run-focused-db.mjs` **38087**, Field equivalent **75037 exit0 각각3/3 fail0/skip0** (/tmp/{ap,field}-paid-period-overlap-green.log: 새billing1+관련기존trial2). calendar `tsx --test test/billing-period.test.ts` **95519 각1/1** (/tmp/{ap,field}-paid-period-final-green.log). 마지막 API type **60326/21102**, lint **67398**, API build **63017/63888 exit0**, import boundary command exit0(/tmp/paid-basis-import-boundaries.log). 이전 AP29/Field30을 재실행하거나 새 pass 개수에 합산하지 않았다. package unit에 calendar를 등록했지만 root 전체 unit/DB/E2E/security/QA/G는 미실행이다.
- **Failures / independent review:** 초기 plan404/calendar 부재 red 뒤 구현. review87487 exit0/P2 consent snapshot 불일치(raw confidence 미출력)는 실제81570/29885 missing rejection red→guard/각3green으로 보완. sandbox admin 우회 권고는 보안5.3/QA157·사용자 인증 후속 지시에 따라 미반영했으며 두 번째2765도 이를 정상 미연결 의존성으로 확인했다. 2765 exit0/P2 overlap(raw confidence0.94)은41766/44669 red→Exclusion/위38087·75037 green으로 보완. 최종 gpt-6-sol/high **4350 exit0**, /tmp/paid-period-overlap-repair-review.log: **No remaining P1/P2 finding in the billing period overlap repair** (raw confidence 미출력). 리뷰 자체는 static·DB tests 미실행이며 root 검수와 구분한다. 리뷰 안의 /dev/fd diff EPERM은 Python 정규화 static 비교로 대체했다.
- **Current environment / schema:** 확인된48590 정상 종료exit0 뒤 **managed53591**, /tmp/paid-basis-managed-runtime.log. 양제품build/migrate/API ready·양웹200·독립 retention worker ready. 현재 AP http://localhost:3001/workspace / Field http://localhost:3002/workspace. 신규 price API 무인증401, 실제 own managed DB에서 AP000069/Field000063 적용과 기간 unique/exclusion을 조회했다(/tmp/paid-basis-managed-schema-check.log). 이제69/63은 적용/커밋됐으므로 수정하지 않고 추가 schema는 **AP70/Field64**로 만든다. Field 제작 모델 미설정은 blocked_integration 유지. observation timeout으로 중복 기동하지 않는다.
- **Reference / not tested:** owner/billing/admin/billing 기준 HTML을 실제 Chromium320으로 열고 /tmp/ap-paid-{owner,admin}-prototype-320.png를 직접 확인했다. 이번 backend 기반에는 native billing UI를 추가하지 않았고 전체 시각/동선/실기기·사용자 최종 테스트는 미완료다. 실 Toss 호출/카드 청구/메시지/운영 삭제/외부 배포 없음. 시험 DB/fixture는 자기 UUID만 정리했다. 실제 가격/세금/법무/MFA/PG 계약·키와 G-A1/F3/L1은 별도 외부 승인이다.
- **Next dependency / rollback:** 남은 A07.F09.PAID의 **owner 명시 동의→제품별 Toss port/인증/거래 worker→동일 주문 unknown 복구·갱신/해지→환불/제공량→시안 UI** 순서로 계속한다. 가격 기반·trial/usage/위젯/보존/회수를 다시 만들지 않는다. 미래 결제 결과는 원격 주문/금액/통화/MID 확인 후에만 반영하며 현재 checkout503을 fake paid로 바꾸지 않는다. 승인 원장/기존 기록을 삭제·변조하는 rollback은 하지 않는다. 같은 product 내부 보완 schema는 새 migration으로 추가한다.

### 다음 에이전트의 정확한 명령 — 저장 기반은 완료 범위

```bash
cd /Users/jr/Desktop/projects/FieldAI
sed -n '1,82p' TASKS.md
sed -n '1,72p' docs/CODEX_HANDOFF.md
git status --short
git log -2 --oneline
cat docs/technical/A07_F09_PAID_EXECUTION_PLAN.md
cat apps/agent-api/src/subscription.ts
cat apps/agent-api/src/billing-routes.ts
cat apps/field-api/src/billing-routes.ts
rg -n 'BusinessRuntime|resolveUserId|createAgentApp|createFieldApp' apps/agent-api/src/business.ts apps/field-api/src/business.ts apps/agent-api/src/server.ts apps/field-api/src/server.ts
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
```

새 owner 동의/provider 범위·관련QA·파일·명령을 plan에 기록하고 그 행동의 native 실패부터 구현한다. 이미 끝난 가격/월말/위젯 검수를 무관하게 다시 실행하지 않는다. 필요한 새 native paid 검사는 위 own UUID focused runner로 실행하고 실 PG는 연결 전 blocked 상태를 유지한다. 현재53591을 확인해 유지하고 최신 build가 필요한 경우에만 정상 종료/기동한다. 아래 착수/이전 환경은 당시 이력이다.

## 이력 — A07.F09.PAID 착수 (2026-09-26)

- 목표는 전체 v3/C03 로컬 기능이며 active다. 이전 턴은 위젯 fe6a524와 완료 체크0802a23의 실제 progress였고, 현재 작업 시작 전 TASKS 완료32개/미완료7개·git status clean·HEAD0802a23을 확인했다. 새 미완료 A07.F09.PAID만 선택했다.
- 실행 계획: docs/technical/A07_F09_PAID_EXECUTION_PLAN.md 및 phase 마지막 착수 범위. 먼저 제품별 가격/동의/기간 원장·native API, 다음 provider/worker·갱신/해지/미상·환불/제공량·시안 UI. v3 승인 범위대로 순차 실행하며 완료된 trial/usage/위젯/보존/회수를 다시 구현하지 않는다.
- 시안 owner/billing/admin/billing을 실제 Chromium320으로 열고 /tmp/ap-paid-owner-prototype-320.png /tmp/ap-paid-admin-prototype-320.png를 직접 확인했다. 통합 제안금액을 최종 가격으로 승계하지 않는다. 공식 Toss API/멱등 header를 조회했지만 실 공급사 호출/결제는 미실행이다.
- 현재 부분 구현: AP69/Field63의 제품별 plan/subscription/consent/period/transaction/authorization/credential/request/event schema와 각 billing-routes/billing/billing-period·app 등록·DB/calendar 검사. plan 요청/다른 operator 승인/판매 중지·승인 불변/동일 key409·월말 원래 KST 기준일·own 최근100 billing 조회만 실제 연결했다. owner 유료 동의/PG/worker/환불/제공량/UI는 아직 미구현이며 A07.F09.PAID 전체를 체크하지 않는다. live 가격 승인은 미구현 MFA/운영 승인 대신 mock 승인하지 않고503으로 남긴다.
- 실제 검사: AP53054/month calculator 부재 red→1/1(/tmp/ap-paid-period-green.log), native24059 plan404 red→최종77913 exit0 3/3(/tmp/ap-paid-basis-final-db.log: 새1+기존관련trial2). Field native10713 plan404 red→최종45417 exit0 3/3(/tmp/field-paid-basis-final-db.log), calendar red→1/1(/tmp/field-paid-period-green.log). 모두 own UUID PG17 DB/명시 합성 fixture이며 생성한 DB만 정리했다. 원장 중복/변조·test plan live 노출 차단·live 승인503·가격 retire 뒤 기존period 보존, provider 부재 checkout503/구독0을 확인했다. 아직 유료 동의를 검수했다고 주장하지 않는다.
- 추가 실제 수정/검수: 독립87487 exit0의 P2 동의/승인 plan 불일치를 AP81570/Field29885 실제 red로 확인한 뒤 consent_guard로 승인/판매 가능·subscription/금액/세금/약관/환불/제공량/유예 snapshot binding을 보완했다. green11231/83629 각3/3. non-mock admin은 실제 MFA 미연결(보안5.3·QA157·AUTH.LIVE)로503을 유지하며 sandbox 우회 권고는 반영하지 않았다. 후속2765 exit0의 P2 기간 overlap(raw confidence0.94)은41766/44669 red→각 자체 btree_gist exclusion으로 **38087/75037 exit0 각3/3**, /tmp/{ap,field}-paid-period-overlap-green.log. 겹침23P01·인접 기간 허용·기존 consent 변조 거절을 실제 확인했다. 이 검수는 기존 완료 기능 전체 재실행이 아니다.
- 빌드/타입 당시 기록: basis build63017/63888·repair type92001/99292·lint76003 exit0. 최종 static calendar95519 exit0 각1/1, /tmp/{ap,field}-paid-period-final-green.log. 제품 경계 명령 exit0(/tmp/paid-basis-import-boundaries.log). package unit 계약에 calendar를 등록했으며 루트 전체 unit는 실행하지 않았다. 후속 최종 type60326/21102·lint67398·repair4350도 exit0로 완료했고 현재 완료 기록은 위를 따른다.
- 현재 리뷰/환경: gpt-6-sol/high overlap repair4350(/tmp/paid-period-overlap-repair-review.log) 진행 중. 코드 기준0802a23 이후 미커밋이며 실제 live/API 돈 청구는 없다. managed48590은 실제 생존/양ready를 재확인했고 이전 위젯 코드로 계속 실행 중이다. 새69/63은 managed DB에 아직 적용하지 않았다. 이번 추가 migration은 격리 UUID fixture에만 적용/정리한 새 미커밋 파일이며 기존 적용 migration은 변경하지 않았다. 남은 concrete issue→**A07.F09.PLAN-BASIS만 완료 체크/commit**→provider/worker·owner 동의 단계로 계속한다. main A07.F09.PAID 전체는[ ] 유지. 과거 검사나 managed handle을 timeout만으로 중복 시작하지 않는다.

## 현재 인수인계 — A05.WIDGET-END 완료 (2026-09-26)

- **현재 목표/상태:** 전체 v3/C03 로컬 기능을 끝까지 구현해 사용할 환경을 유지한다. 전체 목표는 active/in_progress. 이번 미완료 세부 A05.WIDGET-END만 implemented/로컬 verified로 끝냈고 **TASKS 내부 세부32개[x]/잔여7개[ ]**다. 완료된 설치·보존·회수 범위를 재구현하지 않았다. 다음 ID는 A07.F09.PAID다.
- **코드 commit/변경:** **fe6a524**, customer-consultations.ts·deployments.ts·retention-purge.db.test.ts·tools/run-e2e.mjs·새 ap-widget-ended-http.test.mjs/ap-widget-ended-browser.py. 완료 체크/phase/coverage/audit/이 인계와 옵시디언 위젯 일지도 갱신한다. 공개 cross-product 계약·schema/migration·Field 코드 변경 없음. AP PRD2.5~2.7/보안5.5·QA17/97~102/119 로컬 범위다.
- **완료/결정:** 인증한 현재 종료 conversation에만 startNewFrom을 허용한다. 활성·타ID/재시도409, implicit 종료410은 provider/예산 gate보다 먼저 확인한다. 새 익명 원본/이벤트는 명시 동작만 생성하고 응답 유실은 GET current로 같은 ID를 채택한다. 사람 문의는 모델 미설정에도 유지하고 실제 AI 성공은 모의하지 않는다. 이전 질문/조건/AI/미소비 ticket는 혼용하지 않는다. reset TX에서 과거 ticket 만료, 생성/소비 session→ticket 잠금으로 직렬화. iframe에는 receipt를 수집하지 않고 기존 first-party 확인키 접근을 유지한다.
- **실제 DB/검수:** Node24.18.0/own 격리 PG17, `node /tmp/ap-widget-end-run-focused-db.mjs` **79104 exit0 2/2 fail0/skip0**, /tmp/ap-widget-end-gate-priority-green.log. 종료/read metadata/POST/recover410·provider undefined/limit0에도 종료410·활성/타ID409·과거ticket410/전달 없음·새원본1개·retry 중복0을 확인했다. 마지막 API type14816/lint45013 exit0. 마지막 UI build72657/type70754/lint29628 exit0. 기존 AP전체29/Field30을 재실행하거나 개수를 합산하지 않았다.
- **실제 UI/시안:** `node --test tools/spikes/ap-widget-ended-http.test.mjs` **6355 exit0 2/2**, /tmp/ap-widget-end-late-transcript-green.log. native SDK/iframe·실제 정리 worker/own 원장·실제commit201 뒤 응답 유실→동일ID 복구·늦은 answer/transcript 네트워크 오류 폐기·입력/대화 초기화·무overflow/pageerror0. 합성 model/ownership verifier는 테스트 fixture다. 원 시안 `agent/chat`을 실제 Chromium320에서 열어 /tmp/ap-widget-end-prototype-320.png와 native /tmp/ap-widget-ended-320.png를 직접 확인했다. AP 표준 E2E8번째에 등록만 했으며 전체 E2E/사용자 최종 시각·동선 인수는 미실행.
- **실패/복구:** implicit 종료200 red68909, 새 버튼 hidden CSS red81212, 과거ticket가 새 대화를 전달200 red67915, bearer 종료질문401 red64853, 늦은 transcript 실패의 stale 안내 red57265, 미설정 provider가 종료보다503 red58484를 실제 재현해 수정했다. 최초 browser31726은 fixture origin/responseId 오류이며 기능 red로 주장하지 않는다. 모델/외부 key 미설정은 blocked 상태 그대로다. 새 상담 실패는 이전 종료 상태를 유지해 재조회/재시도한다. 기존 종료 원본/확인키/usage·보존 원장은 롤백으로 되살리지 않는다. 운영 자료 삭제·실 발송/청구/배포 없음, own 합성 UUID DB/파일만 정리했다.
- **최종 리뷰:** ak의 이전 gpt-5.6 미지원 기록에 따라 gpt-6-sol/high 사용. 처음 `codex review -m`은 현재 CLI 옵션 오류exit2로 검토 미실행, 이후 -c model/review_model로 실행했다. review18114 exit0/P1 1·P2 1: GET retention 부재(P1/raw confidence 미출력)는 등록된 retention-consumers preSerialization과 실제 bearer GET assertion으로 반증하여 기존 공통 처리를 재작성하지 않았다. bearer401(P2)은 실제 수정. 두 번째46246 exit0/P2 1인 gate 우선순위도 실제 red→green. 최종 독립 repair **16296 exit0**, /tmp/ap-widget-end-gate-repair-review.log: **No concrete remaining P1/P2 findings**. 리뷰 자체 수정/테스트 미실행이며 root의 위 실제 검사와 구분한다. raw confidence는 모든 리뷰에서 미출력이다.
- **현재 로컬 환경:** 기존36780 정상 종료130, 중간32741 정상 종료exit0 후 **48590** /tmp/ap-widget-end-final-managed-runtime.log가 최신 양제품build/ready/worker·양웹200으로 실행 중이다. AP http://localhost:3001/workspace / Field http://localhost:3002/workspace. Field 제작 모델 미설정 blocked_integration 유지. 이전 handle을 재사용하거나 timeout만으로 중복 기동하지 않는다.
- **남음:** A07.F09.PAID→발송/자체domain/publicwrite→OAuth lifecycle 순서. 자체 native billing 원장/adapter부터 문서와 시안에 맞춰 구현한다. 실 인증/MFA/LLM/PG/발송/DNS/TLS·사용자 최종 시각/동선/실기기·전체 적용 QA/G/운영 RPO/RTO는 별도 미완료다. 이번 내부 완료는 전체 C03/A05/QA160/출시 완료가 아니다.

### 다음 에이전트의 정확한 명령 — 완료 재작업 금지

```bash
cd /Users/jr/Desktop/projects/FieldAI
sed -n '1,62p' TASKS.md
git status --short
git log -2 --oneline
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
rg -n '구독|유료|갱신|해지|유예|환불|결제' docs/01_AGENT_PLATFORM_PRD.md docs/02_FIELD_PRD.md docs/04_SECURITY_OPERATIONS_RELEASE.md docs/06_REQUIREMENTS_QA.md
rg --files apps/agent-api/src apps/field-api/src apps/agent-api/migrations apps/field-api/migrations | rg 'subscription|billing|trial'
sed -n '1,180p' apps/agent-api/src/subscription.ts
sed -n '1,180p' apps/field-api/src/subscription.ts
rg -n '구독|요금|결제|환불' reference/field_ui_prototype_v3.html
```

A07.F09.PAID 범위/관련QA/검수 명령을 phase plan에 먼저 적고 구현한다. 위젯/보존/회수를 다시 구현하지 않는다. 현재48590 환경은 유지하고 새 코드 반영이 필요한 경우에만 실제 생존 확인/정상 종료 후 `pnpm mock:run`을 실행한다. 아래 누적 기록의 완료 전/이전 runtime 문구는 당시 이력이다.

## 이력 — 개발 종료 범위 대조 (2026-09-26, 위젯 완료 전)

- **목표/결과:** 전체 v3 기능/사용 가능한 로컬 환경 구축은 계속 active/in_progress다. 사용자의 종료 시점 질문에 대해 TASKS46개·QA160의 기능군과 양제품 PRD/계약을 코드와 대조한 `docs/technical/DEVELOPMENT_REMAINING_AUDIT.md`를 작성했다. 46개 완료/160개 통과나 최종 누락 확정을 주장하지 않는다.
- **확인된 내부 누락6묶음:** native widget 종료/새 상담, 양제품 유료 billing 원장/상태·PG adapter, 양제품 메시지 발송/콜백/unknown·SMS fallback/webpush, Field 자체 domain 상태/등록/검증, PRD 최소 public POST connection/deployment·scope 계약 차이, 일반 OAuth lifecycle/legacy/Field route key 종료. 앞의 “3작업군”은 작은3개 Task/시간/완료율이 아니다. 단순 외부 key 연결만으로2~4가 완성되는 현재 상태도 아니다.
- **코드 단계 저장:** AP native 회수/복원 29files는 **eab1d30**으로 커밋, 실제 직후 git status clean. 코드 검사/리뷰 사실은 바로 아래 완료 단계 기록. 이후 현재 변경은 이 audit/진행/phase plan/인계 문서뿐이다.
- **검수/제한:** 이 단계는 read-only 코드/문서 대조이며 추가 DB/E2E/시안/기능 테스트는 미실행. 시안 경로는 위에 보존한다. 실 인증/MFA/외부 공급사·사용자 최종 화면 인수·운영 QA/G는 후속이며 내부 구현 중단/전체 완료 처리 근거로 사용하지 않는다.
- **변경 파일:** 새 DEVELOPMENT_REMAINING_AUDIT·TASKS/status/coverage/PHASE_2_EXECUTION_PLAN/이 인계·옵시디언 native 회수 일지 commit 기록. PRD/공개 계약/schema/API 변경 없음.
- **현재 환경:** mock36780과 양 ready 유지. timeout으로 재기동하지 않는다. 다음은 audit 순서1의 deployments.ts native widget 종료/새 대화 흐름을 시안 직접 확인→범위/QA/명령 기록→최소 구현, 이후 billing/발송/주소/public client 기능을 순차 완료한다. 작은 proof 검토만 끝없이 반복하지 않는다.

## 현재 인수인계 — AP native 회수·격리 복원 (2026-09-26, 단계 구현 완료)

- **목표/상태:** 전체 v3.0/C03 기능을 독립 AP/Field 로컬 서비스로 완성한다. 직전 HEAD a5aee2b 이후 이번 native 회수/복원 단계는 implemented/부분 verified다. **전체/C03/A08는 in_progress**이고 출시 승인/전체 인수가 아니다. 단계 commit은 `git log -1 --oneline`으로 확인한다. 시안 경로는 상단에 유지한다.
- **파일/요구:** AP PRD2.5/2.9·연동4.11·보안5.5·QA47/129~133/150~153/157/160의 로컬 부분. AP migration67/68, 새 revocation-journal/restore/restore-cli/checkpoint-cli·native DB 검사, business/server·field-connector·field-connection-revoke·integrator-routes·API package. 기존 native DB fixture 3개, tools/run-db-suite·setup-mock-env·run-independence·independence-flow·초기 설정/환경 검사, gitignore·진행/계획/TASKS/coverage/runbook/이 인계. 공개 DTO/scope 변경/Field 내부 import·DB 접근 없음.
- **설계:** 대상 lock·owner 권한 또는 검증 HMAC 뒤 최소 metadata intent를 AP 전용 HMAC/fsync 원장에 쓰고 DB commit한다. 원장/불변 ID/hash receipt 대조 실패503/rollback, fsync 후 DB 실패 의도는 같은 outgoing UUID로 채택한다. access/refresh ciphertext 즉시 null·연결/selection/token 재활성화 금지. 새 migration68은 provider revoked 쓰기를 parent lock에서 제외하고 active UPDATE는 NOWAIT55P03, INSERT는 selection share lock으로 발급/회수를 직렬화한다. UUID ref는 검증 후 indexed cast한다. 기존 적용 migration을 덮어쓰지 않았다.
- **복원:** 원장 밖 최신 protected checkpoint의 전체 ID/hash/signature·DB receipt·AP-only namespace·모든 org/selection/target binding을 검사한 뒤 단일 TX로 회수한다. 수신 ID 복원·미확인 outgoing은 blocked/reconciliation_required, 새 ACK/네트워크 발송 없음. 고객 문의/확인키·기존 Field 예약/양제품 구독을 유지한다. local mock 전용 CLI는 활성 DB localhost/URL alias·Field port·원장 안 출력 거절. --quiesced/--offline-restored는 실제 writer 중단을 대신하지 않는다.
- **성능 결정:** OS watcher는 same-size 변조 즉시200 red로 폐기했다. 현재 매 요청 전체 파일 inode/size/mtime/ctime을64개 병렬 대조하고 변경 파일만 HMAC/hash 재검사한다. DB receipt/intent index는 동일 validated snapshot/DB에서 재사용, checkpoint/restore는 항상 전체 검증. 합성500entry/10warm read는361.09ms→18.744ms(/tmp/ap-revocation-read-metadata.log)이며 전체 HTTP latency/운영 성능 인증이 아니다. metadata 대조는 O(N)이다.
- **실제 검사:** Node24.18.0·local mock PG17·a5aee2b 이후 작업트리. AP `pnpm test:db:agent` **74855 exit0,29/29 fail0/skip0** /tmp/ap-revocation-metadata-cache-db.log. Field shared runner 변경 검수 **52785 exit0,30/30** /tmp/ap-revocation-runner-field.log. 전체 typecheck/lint **57153 exit0**, 최신 MJS lint **37774 exit0** /tmp/ap-revocation-package-path-lint.log. 실제 PG17 dump/별도 restore·bearer200→401·원본/확인키 유지·repeat0·원장 missing/tamper/추가/namespace/binding rollback·CLI 부정 대상·late mint 경합·orphan intent dedup·즉시 동일크기 변조 첫/두 요청503/파일 복구200을 확인했다. 자기 UUID DB/fixture만 정리했다.
- **실제 독립 실행:** own 설정 allowlist 누락은 unit red→2/2. runtime92152 정상 종료130·Field API/web/DB/Valkey 실제 stop33427 뒤 `pnpm test:independence:agent` **53496 exit0**, /tmp/ap-revocation-independent-standalone.log. 반대 제품 컨테이너/포트 부재를 시작/종료에 확인하고 자체 가입/승인/문의/답변/export·외부 widget/handoff/이어가기·owner selection revoke/token200→401·owner/guest browser1/1을 확인했다. 모든 AP 기능/실 공급사 완료를 주장하지 않는다. import 경계12312 exit0·연결 화면 HTML smoke1/1은 실제 클릭 검사와 구분한다.
- **리뷰:** ak 지정 gpt-5.6/high는 이전 실제 계정 미지원400 때문에 현재 gpt-6-sol/high 사용. 첫93162 exit0/P2 3건(40P01·UUID index·전 원장 재읽기), 재리뷰88411 exit0/P2 1건(독립 env 누락), 세 번째62519 exit0/P2 1건(package cwd 상대 원장 경로)을 수정했다. 마지막 경로 보완은 신규/기존 env를 같은 절대 경로로 정규화하며 key/기록 유지·유실 keyed 폴더 재생성 금지. 실제 설정 red→**2/2 exit0** /tmp/ap-revocation-package-path-green.log, /var와/private/var canonical fixture 보완. 수정 독립 검토 **87113 exit0**, /tmp/ap-revocation-path-repair-review.log: **No remaining P1/P2 finding for the repair**. 해당 read-only 리뷰의 node test는 EPERM/mkdtemp로 미실행이고 root에서 실제 실행한2/2만 pass다. raw confidence는 미출력.
- **실패/복구:** fixture /v1/business/draft404→실제 /v1/knowledge/draft, cipher null61905·journal장애200/89997·restore/CLI부재64375/22677 red를 보완했다. 영구회수15184 fixture는 재활성화를 삭제하고 동일 revoked 연결의 서명 retry 유지. token parent/child40P01와provider revoke57014 red81459→새68. watcher/cache orphan4≠3·ES toSorted type 오류·signature 두번째200/98265·즉시첫200/99027은 실제 실패로 기록하고 watcher 제거. 후속 lint 성공으로 이전 type 실패를 pass 처리하지 않았다. 회수 rollback으로 권한/비밀값을 되살리지 않는다. 운영 자료 삭제/실 메시지/청구/배포 없음.
- **현재 환경:** managed mock **36780**, /tmp/ap-revocation-standalone-restored-runtime.log. 양 API/웹 build/migrate/ready·독립 retention worker ready, 이번 기록 때 AP4311/Field4321 health/ready 모두 실제 ready. AP http://localhost:3001/workspace, Field http://localhost:3002/workspace. Field 컨테이너는 mock 재기동으로 복구됐다. 이전92152/46139/62510/68922와 독립 gate 서버는 종료 상태다. AP mock에67/68 적용됨, 다음 migration69. 최신 ignored AP env 경로를 정규화했으며 서버가 가리키는 실제 폴더/키는 동일하다. Field 제작 LLM model 미설정 blocked_integration.
- **미검수/남음:** 이 backend 단계에서 새 시안 비교/전체 UI QA를 수행하지 않았다. 일반 OAuth provider의 개별 access 삭제/refresh family lifecycle 복원·양제품 legacy baseline·Field route key 종료/미확인 대조, native widget 종료/새 상담/이전 receipt, 전체 문서 기능 누락·구독 유료 상태/발송 공급사 adapter·정식 QA/G·운영 proof/DB 동시 과거 교체/RPO/RTO·실 인증/MFA/외부 공급사·사용자 최종 화면 인수가 남는다. **사용자 “개발 종료까지 얼마나?” 후 다음은 전체 기능 대조로 실제 남은 목록을 확정하는 작업이다. 작은 보안 단계만 무한 반복하지 않는다.** 세 작업군을 작은 Task3개/시간 추정으로 해석하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -1 --oneline
cat docs/01_AGENT_PLATFORM_PRD.md
cat docs/02_FIELD_PRD.md
cat apps/agent-api/src/subscription.ts
cat apps/field-api/src/subscription.ts
rg --files apps/agent-api/src apps/field-api/src apps/agent-web/src apps/field-web/src
rg -n 'blocked_integration|paid_checkout_not_configured|delivery_state' apps/agent-api/src apps/field-api/src
sed -n '277,475p' apps/agent-api/src/deployments.ts
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
```

36780을 생존 확인해 유지한다. UI 작업은 상단 reference HTML을 직접 열고 비교한다. native 위젯 renderer는 deployments.ts이며 embed.ts는 spike fixture다. 최신 코드 반영이 필요할 때만 확인된 managed process를 정상 종료 후 pnpm mock:run한다. 단순 timeout으로 중복 실행하지 않는다.

## 현재 인수인계 — AP 실제 정리·양제품 원장 연속성 단계 (2026-09-26)

- **현재 목표/상태:** C03 전체 기능을 독립 AP/Field 로컬 서비스로 끝까지 연결한다. 이번 보존 실행/복원·소비자 오류 상태는 구현과 부분 검수를 마친 단계이며 전체/C03/A08/F09는 `in_progress`다. 출시/사용자 최종 인수 완료를 주장하지 않는다. 직전 HEAD `e89bf2a`, 단계 커밋은 `git log -1 --oneline`으로 확인한다. 시안 경로는 상단에 유지한다.
- **완료/설계:** AP 자체 정책/org/업무/scope/revision/anchor/digest·UUID 멱등 요청→다른 운영자 승인→승인 전 취소→실행 직전 정책/현재 권한/hold/지원/AI/발송·외부 미확인/기한 재검사를 연결했다. AP private 파일 delete/부재 확인과 HMAC/fsync 원장 뒤 원문/연락/AI/자체 외부 제출 사본/outbox payload를 제거하고 사용량/감사/기존 ID/확인키를 유지한다. 미확인은 retry, DB 완료 후 증빙 실패는 receipt_pending이다. 사진-only는 업무/새 사진/대화를 유지한다. DB tombstone이 원문 재저장을 거절한다. 제품별 immutable signed entry ID/SHA-256 receipt와 native completed/file-deleted 감사 대조로 원장 일부/전체 유실·폴더 대체/실행 중 부재를 다음 job/각 append 전 차단한다. 원장 read/append는 없는 directory를 자동 초기화하지 않는다. 초기 mock 설정의 최초 key 생성만 빈 directory를 만든다. 복원에는 별도 최신 protected checkpoint가 계속 필수다.
- **변경 경로:** AP migration65/66, 새 retention purge routes/purge/worker/journal/journal-integrity/consumers/read-guard/restore/restore-cli/checkpoint-cli와 native purge DB 검사; app/customer-consultations/customer-support/inquiry-attachments/inquiry-archive/work-retention/API package. AP 웹 새 AgentRetentionNotice, 기존 AgentRetentionAdmin/agent-retention·workspace·agent-public·consult.css. Field migration62·각 자체 retention-journal/journal-integrity/purge/worker와 retention-purge DB 검사, revocation restore 검사의 자기 DB 정리. mock-run/setup-mock-env·새 mock-retention-initialization 검사·기존 AP retention HTTP/browser·gitignore·진행/계획/TASKS/coverage/runbook/이 인계. Field/AP domain·DB·key·journal은 공유하지 않는다. 공개 요청 DTO/scope/token 추가는 없지만 AP 공개 읽기의 종료 metadata/410은 소비자에게 적용된다.
- **UI/소비자:** JSON·사진·전체 archive·승인 지원 사진의 read lock을 응답 finish/close/error까지 유지한다. 정리 경합 때 원문/사진 응답을 막으며 photo-only에서는 현재 ready 사진 ID만 남긴다. 고객/사업자 종료 안내·추가 입력/사진/전달 차단, 익명 명시적 새 상담과 이전 receipt 분리, 열린 고객 follow-up410 뒤 draft/retry 폐기·실제 문의 재조회, 관리자 ACK 유실 동일 UUID/본문 복구·503 metadata 유지/조작 잠금·취소/다른 승인을 연결했다. 실제320px에서 확인키 교체 버튼의 기본 browser 크기를 발견해 그 패널에만 본문16px 상속/44px 높이·기존 색/테두리를 적용했다.
- **실제 검수:** Node24.18.0/로컬 mock PG17·HEAD e89bf2a 이후 작업 트리. AP **89449 28/28 fail0/skip0 exit0** `/tmp/ap-retention-fifth-fixes-db.log`, Field **17798 30/30 fail0/skip0 exit0** `/tmp/field-retention-graceful-cleanup-db.log`; 각 test/restore DB는 자신의 UUID만 정리했다. 실제 PG17 dump/별도 restore·삭제 재적용/repeat0·누락/추가/변조/미확인 의도·CLI 현재 DB/media alias/원장 내부 출력 거절, 새 사진 유지, job/권한/보류/stale/retry/증빙 재시도·사용량·DB 재저장 차단, response pause에서 NOWAIT55P03/worker 대기, JSON·파일·사진 metadata 경합, own-env worker를 확인했다. 전체 type **18900**, lint **7378 exit0** `/tmp/retention-fifth-fixes-{type,lint}.log`, 최초 mock 초기화 **1/1 exit0**. 이 type/lint 뒤의 최종 패널 CSS/class는 아래 실제 mock build와 독립 CLI 검토에 포함했다.
- **실제 환경/브라우저:** 최종 managed **mock68922** `/tmp/ap-retention-final-style-runtime.log`의 양 API/웹 build/migrate/ready·AP/Field retention worker ready와 양 health/ready를 확인했다. 직전37513은 생존 확인 후 정상 종료130했다. 이전8177/7002/75895/92132/44087/77527도 종료됐고 다시 사용하지 않는다. AP http://localhost:3001/workspace, Field http://localhost:3002/workspace. native HTTP/Chromium320 **6968 1/1 exit0** `/tmp/ap-retention-sixth-http.log`: 실제 요청/다른 승인/worker completed·파일 부재·ACK 복구/취소/jobs503·열린 고객410 뒤 종료 안내/입력 비노출·익명 종료/새 ID·pageerror0/가로 넘침 없음. 이는 마지막 패널 CSS 전37513의 기능 결과이며 CSS 변경으로 전 기능 검사를 반복하지 않았다. 최신 build는 CSS를 반영했다. 제작 LLM model 미설정은 `blocked_integration`이며 내부 개발 중단 사유가 아니다.
- **시안/실패:** 기준 HTML `#admin/audit`를 실제 Chromium320으로 열고 `/tmp/ap-retention-execution-prototype-320.png`와 실제 policy/고객 화면을 비교한 이번 단계 기록을 유지한다. 최종 열린 고객의 종료 전환 screenshot `/tmp/ap-retention-ended-customer-320.png`도 직접 열었다. 전체 시각 동일/사용자 최종 인수는 미완료다. photo/archive 원본 경합19995/92857·새 사진 복원71397·JSON 경합75337·원장 부재85541/67300·일부 기록 유실97265·사진 metadata17577(1≠0)·열린 고객 UI66912(종료 안내 없음)를 실제 red→수정/검수했다. Field50168은29/30, revocation restore의 administrator command57P01 실패였다. 두 테스트의 자기 UUID restore DB FORCE DROP을 제거한 뒤 위17798이30/30 통과했다. server 종료 경합은 가설이며 간헐적 종료의 모든 원인을 입증했다고 주장하지 않는다. 실패/미실행을 pass로 바꾸지 않았다.
- **독립 검토:** `ak` 지정 gpt-5.6/high은 계정 미지원400으로28153 exit1이며 성공이 아니다. 기존 CLI 설정 gpt-6-sol/high으로 검토했다. 여섯 번째 **13308 exit0**, `/tmp/ap-retention-execution-sixth-review.log`: **No actionable regressions were found**. 원문 raw confidence는 미출력이다.

| 검토 발견 | level / raw confidence | 반영/근거 |
|---|---|---|
| 사진-only 이후 새 사진의 복원 coverage | P1 / 미출력 | cutoff를 구분하고 새 사진 유지 actual DB 확인 |
| 사진/archive 응답 전 lock 해제·JSON 경합 | P1/P2 / 미출력 | response 종료까지 lock·실제 느린 읽기/55P03 검수 |
| bearer embed 종료 metadata·새 상담의 이전 receipt | P2 / 미출력 | native bearer read/새 상담 UI, 활성 receipt와 이전 접근 분리 |
| 원장 부재/비워짐/append 재생성 | P1 / 미출력 | 제품별 immutable receipt와 완료/파일 감사 대조·strict FS, actual red→양제품 green |
| photo-only stale 사진 목록·고객410 뒤 stale UI | P2 / 미출력 | ready ID 대조·원본 재조회/시도 폐기, actual API/UI red→green |
| completed proof의 반복 전체 journal 탐색 | P2 / 미출력 | 작업별 index, 양제품 native DB·type/lint 검수 |

- **남음/미검수/복구:** AP 자체 connection/OAuth revoke 독립 원장·복원, Field route key 수명/legacy 회수 baseline·미확인 대조, embed 위젯 보존 종료/새 상담의 실제 UI, 이전 receipt가 있는 동일 페이지의 별도 UI 경우, 전체 PRD/역할/QA/G·전체 표준 E2E/security/independence, protected proof/DB/journal 동시 과거 교체·운영 RPO/RTO·실 공급사/MFA·최종 사용자 화면/동선은 남는다. 정리 원문을 rollback으로 되살리지 않으며 tombstone/원장/ID를 유지한다. 이번 검사는 합성 자료만 사용했고 실제 운영 삭제/고객 발송/청구/배포는 하지 않았다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -1 --oneline
sed -n '1,60p' docs/CODEX_HANDOFF.md
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
rg --files apps/agent-api/src apps/agent-api/migrations | rg 'revoke|connection|oauth|integrator'
cat apps/agent-api/src/field-connection-revoke.ts
cat apps/agent-api/src/field-connection-revoke-worker.ts
cat apps/agent-api/src/integrator-routes.ts
cat docs/technical/LOCAL_BACKUP_RUNBOOK.md
```

현재68922를 실제 확인해 유지한다. 새 build가 필요한 경우에만 확인된 managed process를 정상 종료하고 `pnpm mock:run`을 실행한다. 관찰 timeout은 재시작 근거가 아니다. native 검수는 `pnpm test:db:agent`, `pnpm test:db:field`, `pnpm typecheck`, `pnpm lint`, `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python node --test tools/spikes/agent-retention-http.test.mjs`이며 이미 끝난 검사를 무관하게 반복하지 않는다. AP migration65/66·Field62는 적용됐으므로 새 schema 변경은 다음 migration으로 만든다. 추정했던 Field000061_connection_revocation_facts.sql은 없고 실제 파일은000061_revocation_restore.sql이다.

## 최신 인수인계 — C03/A08 AP 실제 정리·독립 worker·복원 (2026-09-26)

- **목표/상태:** 시안과 v3.0 전체 기능의 독립 AP/Field 로컬 서비스 구현을 계속한다. `e89bf2a` 이후 AP 실제 정리 단계의 코드/부분 검수이며 C03/전체 목표는 `in_progress`다. 최종 커밋은 `git log -1 --oneline`으로 확인한다. 시안 경로는 위 상단에 유지한다.
- **완료된 부분/설계:** immutable policy/org/inquiry/scope/revision/anchor/digest 요청·UUID 멱등 재요청→다른 운영자 승인→승인 전 취소, 현재 정책/운영 권한/분쟁 보류·지원/AI/발송·외부 미확인/기한의 실행 직전 재검사, AP 자체 PG/private file/독립 HMAC 원장 worker를 연결했다. 파일 삭제와 부재 확인 뒤 원문·연락처·AI 질문/답변·AP 자체 외부 제출 사본/outbox payload를 정리하고 사용량·접수번호·감사·확인키 권한을 유지한다. 파일 미확인은 retry, DB 완료 뒤 증빙 실패는 receipt_pending이다. 사진만 정리한 문의에는 원문/새 대화를 유지한다. 종료 원문 재저장은 native DB에서 거절한다. 다른 제품 자료를 직접 읽거나 지우지 않는다.
- **변경 파일:** AP migration65, 새 `src/retention-{purge-routes,purge,purge-worker,journal,consumers,restore,restore-cli,checkpoint-cli,read-guard}.ts`와 `test/retention-purge.db.test.ts`; 기존 AP `app.ts`, `customer-consultations.ts`, `work-retention.ts`, `inquiry-attachments.ts`, `inquiry-archive.ts`, package. AP 웹 새 `AgentRetentionNotice.tsx`, 기존 `AgentRetentionAdmin.tsx`, `agent-public.tsx`, `agent-retention.{ts,css}`, `workspace.tsx`; mock-run/setup-mock-env·gitignore·기존 AP retention HTTP/browser, phase plan/진행/coverage/backup runbook/TASKS/이 인계. Field domain/DB·공개 연동 계약 변경 없음.
- **실제 검수:** 리뷰 수정 후 최종 `pnpm test:db:agent` **50658 28/28 fail0/skip0**, `/tmp/ap-retention-review-fixes-db.log`, 격리 PG17 test/restore DB 제거. 실제 파일 삭제·사진 scope/추가 대화·승인 후 hold·기준 변경 stale·파일 미확인 retry·증빙 실패 재시도·익명 AI 원문 제거/토큰 사용량 유지·종료 조회/POST410·명시적 새 상담을 확인했다. 실제 PG17 dump/restore 후 원문/파일 정리 재적용/반복0, directory/entry 누락·미대조 추가·checkpoint 변조·미확인 의도 거절, checkpoint export/restore CLI 반복0·현재 DB localhost alias/현재 파일 경로/원장 내부 출력 거절, AP 설정만 있는 별도 worker `--once` 실행을 확인했다. 리뷰 수정 후 전체 typecheck **53402**, lint **2230 exit0**(`/tmp/ap-retention-review-fixes-{type,lint}.log`).
- **실제 UI/환경:** 확인된 mock92132를 정상 종료130한 뒤 **75895**(`/tmp/ap-retention-execution-managed-runtime.log`)로 양 API/웹 build/migrate/ready·AP/Field retention worker ready를 확인했다. focused native HTTP/Chromium320 **25823 1/1**, `/tmp/ap-retention-execution-browser.log`: 정책/hold 기존 흐름, 정리 요청 ACK 유실 같은UUID/본문 복구·단일 요청, 승인 전 취소·다른 운영자 승인·관리 worker 실제 completed/파일 부재, jobs503 목록 보존/조작 잠금/복구·고객 종료 안내/추가 질문 비노출·pageerror0/가로 넘침 없음. AP http://localhost:3001/workspace, Field http://localhost:3002/workspace. 제작 LLM은 model 미설정 `blocked_integration`이다.
- **시안 확인:** 실제 기준 HTML `#admin/audit`의 `신고·권한·감사`를 Chromium320으로 다시 열었다. `/tmp/ap-retention-execution-prototype-320.png`, 실제 `/tmp/ap-retention-ended-customer-320.png`와 `/tmp/ap-retention-policy-320.png`를 직접 열어 비교했다. 정리 UI는 PRD/보안5.5에 필요한 추가 기능이며 전체 시각 일치/사용자 최종 동선 인수 완료를 주장하지 않는다.
- **실패/복구:** 최초 정리 API404·restore 모듈 부재·정리 익명 GET401 red를 구현했다. 같은 전화 fixture429는 고유 번호로 수정했다. 느린 파일 조회가 정리 완료 뒤 원 사진200을 반환하던 red19995와 전체 archive가 원문/사진200을 내보내던 red92857을 실제 재현해 최종 authority/tombstone 조회·archive 변경409 재시도로 수정했다. 새 schema/UI의 HTTP 부재 red를 새 managed build로 반영했다. 롤백으로 정리된 원문을 되살리지 않으며 tombstone/독립 원장/기존 ID를 보존한다. 실제 운영 자료 삭제·배포/청구/고객 발송 없음; 합성 fixture만 정리했다.
- **리뷰:** `ak` 지정 `gpt-5.6/high` CLI 검토28153은 계정 모델 미지원400으로 exit1(`/tmp/ap-retention-execution-codex-review.log`)이며 검토 성공이 아니다. 기존 설정 `gpt-6-sol/high` 독립 검토41770(`/tmp/ap-retention-execution-default-review.log`)는 P1 1개/P2 2개를 보고했다(raw confidence 미출력). 사진 scope 후 새 사진의 복원 coverage, 응답 전 사진/전체 archive 잠금 해제를 모두 반영했다. 실제 새 사진 경로 red71397→수정 후 새 사진 유지·onSend 지연에서 parent NOWAIT55P03/worker 대기·응답 완료 후 정리 완료를 DB50658에서 확인했다. 응답 finish/close/error까지 read transaction을 유지하는 AP 자체 helper를 추가했다. 재검토91495(`/tmp/ap-retention-execution-rereview.log`) 진행 중이며 clean 결과는 아직 기록하지 않는다.
- **리뷰 수정 반영 환경:** mock75895를 실제 생존 확인 후 정상 종료130하고 **7002**(`/tmp/ap-retention-execution-reviewed-runtime.log`)로 양제품 build/ready·AP/Field 정리 worker를 반영했다. 후속 인계는7002를 현재 환경으로 사용한다. 이전75895/92132를 다시 poll하거나 중복 시작하지 않는다.
- **남은 작업/미검수:** AP 자체 연결/OAuth revoke 독립 원장·복원 재적용, Field route key 종료 수명/legacy 회수 baseline·신뢰 proof 동시 과거 교체/운영 RPO/RTO, 전체 PRD/역할/QA/G 요구 대조와 전체 표준 E2E/security/independence, 외부 업무 종결의 공개 계약 한계, 실 공급사/MFA/최종 사용자 인수는 남는다. 본문 사용량/개인정보 정리 검사가 법무·운영 인증을 대체하지 않는다. 외부 미연결은 내부 개발 중단 사유가 아니다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -1 --oneline
sed -n '1,45p' docs/CODEX_HANDOFF.md
cat docs/technical/LOCAL_BACKUP_RUNBOOK.md
rg --files apps/agent-api/src apps/agent-api/migrations | rg 'revoke|connection|oauth|integrator'
cat apps/agent-api/src/field-connection-revoke.ts
cat apps/agent-api/src/integrator-routes.ts
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
```

mock7002의 생존을 실제 확인해 유지한다. 새 build 반영이 필요한 경우에만 확인된 프로세스를 정상 종료 후 `pnpm mock:run`으로 반영한다. 관찰 timeout은 중복 기동 근거가 아니다. 변경 검수 명령은 `pnpm test:db:agent`, `pnpm typecheck`, `pnpm lint`, `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python node --test tools/spikes/agent-retention-http.test.mjs`이며 현재 결과로 전체 C03 완료를 주장하지 않는다.

## 최신 인수인계 — C03/A08 AP 자체 보존 기반 (2026-09-26)

- **목표/상태:** 전체 기능을 독립 AP/Field 로컬 서비스로 연결하는 목표를 유지한다. AP 보존 정책·실제 종결 시각·분쟁 보류·메타데이터 미리보기와 관리자 UI는 이번 단계의 구현/실제 부분 검수 progress다. 실제 정리 job/worker/원문·사진·AI payload 제거/복원은 다음 필수 작업이며 C03/A08/전체 목표는 in_progress다. 직전 HEAD d717532 이후 커밋은 git log로 확인한다.
- **수정 범위/요구:** AP migration64, retention-routes/work-retention/app·retention DB 검사, AgentRetentionAdmin/agent-retention 타입·CSS/admin 연결, focused HTTP/browser/legacy migration와 E2E 등록, phase plan/TASKS/status/coverage/이 인계. AP PRD2.5/2.7·보안5.5·QA46/47/49/119/157/159 로컬 일부. Field 내부/DB·공개 연동 계약은 바꾸지 않는다.
- **설계/완료:** 실제 state 전환만 종결 clock을 기록하고 재개하면 비운다. legacy는 현재 closed/revision과 일치하는 사건만 이관한다. 익명30/정식180/사진90은 제안값이며 정책 요청→다른 operator 승인/중단을 거친다. 정책/보류 사실·해제 이력은 DB 불변, 기한 지난 hold는 자동 해제하지 않는다. 메타데이터 preview는 최근 활동/실제 종결·AI/발송 대기·현재 승인 지원·외부 업무 미확인/미래 예약/보류를 구분하고 AP 자체 받은 원장만 사용한다. 공개 정보 원문/고객 연락처·확인키/AI 질문/사진 키를 preview에 넣지 않는다. 외부 수신 문의의 종결은 현재 AP 원장에 검증 근거가 없어 unresolved를 유지한다.
- **실제 검수:** 최종 `pnpm test:db:agent` **1325 27/27**(`/tmp/ap-retention-basis-final-db.log`, 별도 PG17 test DB 제거): real close/retry clock/reopen, 정책/멱등/권한/Origin·hold 불변/다른 운영자 해제, 익명 마지막 활동30일/AI pending/사진90 vs문의180/종결 미확인·발송 unknown/지원 pending vs승인·회원권 회수/만료/외부 결과 미상·예약 미래/105 microsecond fixture+기존2개 pagination 총107개 무중복·org cursor binding. legacy **1/1**(`/tmp/ap-retention-basis-migration-final.log`)은63까지 실제 별도 DB→current revision/불일치/무사건→64·원문 불변/재개·새 종결/반복 clock을 확인했다. 전체 typecheck **61572**·lint **53746 exit0**(`/tmp/ap-retention-basis-date-{type,lint}.log`).
- **실제 UI/환경:** 기존 **21041**을 실제 생존 확인 후 정상 종료130하고 새 managed mock **92132**(`/tmp/ap-retention-basis-final-runtime.log`)으로 양제품 API/웹 build/migration/ready를 확인했다. native HTTP/Chromium320 **71697 1/1**(`/tmp/ap-retention-basis-final-http.log`): 실제 별도 계정/권한·정책 ACK 유실 같은UUID/본문·단일 요청, 별도 승인/보류 해제, preview503 폐기/목록503 metadata 유지·조작 잠금/재조회·가로 넘침 없음/pageerror0. AP http://localhost:3001/workspace, Field http://localhost:3002/workspace, AP 관리자 /admin/audit. 제작 LLM model 미설정 blocked_integration은 외부 후속이다. 기준 HTML `#admin/audit`를 실제 열고 `/tmp/ap-retention-prototype-320.png`와 `/tmp/ap-retention-basis-320.png`를 열었다. 사용자 최종 시각/동선 인수와 전체 표준 E2E7개/security/independence/정식 QA/G는 이번 변경으로 미실행이다.
- **실패/복구:** old UI 영역 부재 red37924, 보류 기존 사유 덮어쓰기 Missing rejection44273→불변 trigger. 새 fixture의 sequence/visibility와 legacy source_kind/draft_revision 누락, 공개 제출 키에 receipt가 필요했던400을 native 모델/계약에 맞춰 수정했다. 시안 탐색의 exact heading 실패는 실제 `신고·권한·감사` 화면을 열어 확인했다. 이전 코드 rollback에 신규 원장을 삭제할 필요가 없으며 실제 정리 worker가 없는 이번 단계에서 데이터/파일 제거는 없다. 테스트가 만든 합성 계정/조직·별도 DB만 정리했다. 운영 자료/실 계정 삭제·배포/청구/발송 없음.
- **다음 필수 작업:** AP 실제 정리 요청/다른 승인/취소·독립 worker·사진/대화/연락/AI/외부 전달 private payload 정리·usage/audit ID 유지·소비자 tombstone/권한·독립 삭제/회수 복원 증빙을 native schema/각 reader·late writer부터 조사해 이어간다. Field route key 종료 수명/legacy 회수 baseline·운영 복구/신뢰 proof 동시 과거 교체·전체 PRD/역할/QA/G·실 공급사/MFA·최종 사용자 인수는 남는다. 외부 미연결을 내부 개발 중단 사유로 쓰지 않는다. 시안 경로는 상단에 유지한다.
- **마지막 보완/현재 소스:** cursor2월31일이 DB500이던 실제 red **66808**→UTC6자리 microsecond/canonical 달력 검증→최종 DB **1325 27/27**, non-mock 관리자503도 확인했다. 처음 runtime72730/UI78317 검수 후72730을 생존 확인/정상 종료130하고 최종92132로 반영했다. 최종 HTTP71697은 기존 UI와 live invalid_cursor400을 확인했고 `/tmp/ap-retention-policy-320.png`를 직접 열었다. 전체 type61572/lint53746 뒤 마지막 변경 HTTP 파일의 focused ESLint도 exit0이다. E2E legacy1/1 결과는 migration64 변경이 없는 동일 소스 결과이며 무관한 반복을 하지 않았다.
- **정리 소비자 조사:** `inquiry-archive.ts`는 고객 contact/messages/photos export를, `customer-consultations.ts`는 AI history/question/answer와 늦은 완료를, `field-actions.ts`는 고객 contact/consent·field_request_body와 사진 ref 전달을, `inquiry-attachments.ts`는 ready 사진·동의된 action 사진 읽기를, `customer-support.ts`는 승인된 contact/messages/사진 읽기를 담당한다. 삭제는 parent만 가리는 방식으로 끝낼 수 없다. 다음 migration65부터 native nullable/tombstone·late writer/각 reader/usage 원장 보존을 같은 작업 범위에 묶어야 한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
rg --files apps/agent-api/src apps/agent-api/migrations | rg 'inquir|consult|field-action|support|retention|ai|usage|notification'
cat apps/agent-api/src/work-retention.ts
cat apps/agent-api/migrations/000064_work_retention_basis.sql
cat apps/agent-api/src/inquiry-attachments.ts
cat apps/agent-api/src/customer-consultations.ts
cat apps/agent-api/src/field-actions.ts
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:db:agent
pnpm typecheck
pnpm lint
node --test tools/spikes/agent-retention-migration.test.mjs
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python node --test tools/spikes/agent-retention-http.test.mjs
```

runtime92132은 생존 확인 후 유지하며 관찰 timeout만으로 재시작하지 않는다. 새 API/UI 반영이 필요할 때만 확인된 프로세스를 정상 종료하고 `pnpm mock:run`을 실행한다. preview의 부분 검수를 실제 삭제·전체 보존/기능 완료로 바꾸지 않는다.

## 최신 인수인계 — C03/F09 Field 삭제 원장 누락 검증 (2026-09-26)

- **목표/상태:** 전체 v3.0/C03 기능을 실제 독립 AP/Field 로컬 서비스로 끝까지 연결한다. 직전 c809c28는 회수/격리 복원 실제 검수·커밋 progress다. 이번 삭제 checkpoint도 progress이고 **AP 자체 보존/정리·Field route key 수명/legacy 회수 baseline/미확인 삭제 추가 대조·신뢰 checkpoint/원장 동시 과거 교체·운영 복구/전체 PRD/역할/QA/G·최종 사용자 시각/동선·실 공급사는 남아 전체/C03/F09 in_progress**다. 커밋은 git log로 확인한다. 기준 시안 경로는 상단에 유지한다.
- **파일/요구:** 보안5.5·QA47/46/119/157/159 로컬 부분. Field `src/retention-{journal,restore,restore-cli}.ts`, 새 `src/retention-checkpoint-cli.ts`, 기존 `test/retention-purge.db.test.ts`/API package; phase plan/backup runbook/handoff/coverage/status/TASKS. UI/API route·migration/AP DB/domain·공개 계약 변경 없음.
- **설계/완료:** Field 삭제 원장 밖에 보관한 최신 quiesced `retention-checkpoint`가 restore 함수와 CLI의 필수 입력이다. 전체 entry ID/canonical 내용 SHA-256을 HMAC 서명해 대조한 뒤 기존 미확인 file intent/job binding/사진 coverage를 검사한다. directory 전체 부재·한 entry 누락·미대조 추가·변조/회수 checkpoint 혼용은 파일/DB 변경 전에 실패한다. fresh worker의 read()는 새 환경 빈 원장만 허용하며 restore 성공으로 쓰지 않는다. CLI는 별도 local Field restore DB/현재 DB명 alias/active media realpath alias를 확인하고 checkpoint 출력은 journal 밖 새0600 파일이다. worker/API의 기존 append/read 동작과 현재 서비스는 바꾸지 않았다.
- **실제 검수:** 최초 **44378** Missing expected rejection으로 없는 원장이 빈 restore 성공이던 버그를 재현했다. **79627** 30/30 후 실제 CLI 대상/출력 부정 검사를 추가했고 최종 `pnpm test:db:field` **2217 30/30**(`/tmp/field-retention-checkpoint-final-db.log`, 별도 test/restore DB 제거). 실제 PG17 dump/restore·원 사진 복원 후 missing directory/entry 누락/추가 미대조/checkpoint 변조가 원문/사진을 유지한 채 거절됐다. 별도 checkpoint export/restore CLI 실제 적용으로 파일 부재/원문 제거·repeat0/재저장 거절, 미확인 intent 거절을 확인했다. active DB localhost alias/active media symlink alias/잘못된 local port/journal 안 출력도 실제 거절했다. 전체 typecheck **57849**, lint **78010**, Field build **90668 exit0**(`/tmp/field-retention-checkpoint-{final-type,final-lint,build}.log`), diff check exit0.
- **미검수/제한:** 기존 최신 checkpoint와 journal을 함께 과거로 바꾸거나 legacy 기록 자체가 없던 것을 이 검사가 탐지한다고 주장하지 않는다. 운영 보관 공급사/RPO/RTO·결과 미상 삭제의 추가 대조/route key 수명·legacy 회수 baseline은 남는다. 실제 운영 승인/자료 삭제/배포·청구·발송 없음. 테스트가 만든 synthetic 자료만 정리했다. 전체 HTTP/브라우저/AP DB/security/independence/정식 QA/G는 restore-only 변화로 반복하지 않았다. 시각/동선 기준 파일은 직전 c809c28에서 실제 Chromium admin/audit를 열어 확인한 범위이며 이번에는 UI 수정이 없다.
- **현재 환경:** 확인된 **21041**(`/tmp/field-revocation-native-runtime.log`)을 그대로 유지했다. API/UI/worker의 사용하는 append/read 경로에 변화가 없어 재기동하지 않았다. AP http://localhost:3001/workspace, Field http://localhost:3002/workspace; 양 API ready를 실제 재확인했다. build90668은 새 복원 CLI를 반영한다. 제작 LLM model 미설정 blocked_integration은 외부 후속이며 내부 작업 중단 사유가 아니다.
- **다음 작업:** AP 자체 보존 기반을 먼저 실제 native schema/소비자에서 조사·범위/QA/명령 기록 후 구현한다. 접수 없는 익명 대화30일/정식 문의180일/사진90일은 승인을 받은 자체 정책으로 분리하고 실제 종결/활동·분쟁 hold/예정 외부 업무·AI/전달/지원 pending을 대조해야 한다. 현재 AP 익명·정식 문의는 별도 테이블이 아니라 `ap.inquiries`의 mode/consent/submitted/contact state로 표현된다(`000011_customer_consultations.sql`). embed_sessions/first_party_handoffs가 같은 inquiry를 연결한다(`000012_embed_consultations.sql`). 기존 closed/reopened 원장은 migration59에 있으며 spam은 별도 보존 정책이 아닌 발송 중단 상태(migration61)다. AP 자체 retention 파일은 없고 다음 migration64부터 사용한다. Field 내부 retention 모듈을 AP가 import하지 않는다. UI/API/domain/DB/권한/감사/실행 worker/consumer/복원까지 이어가며 단순 정책/미리보기를 전체 기능 완료로 대체하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -2 --oneline
cat apps/agent-api/migrations/000011_customer_consultations.sql
cat apps/agent-api/migrations/000012_embed_consultations.sql
cat apps/agent-api/migrations/000059_inquiry_resolution_events.sql
cat apps/agent-api/migrations/000061_inquiry_spam.sql
cat apps/agent-api/migrations/000063_customer_support_access.sql
cat apps/agent-api/migrations/000036_field_action_requests.sql
rg --files apps/agent-api/migrations apps/agent-api/src apps/agent-web/src | rg '/[^/]*(agent|run|inquir|customer|support|admin|retention)[^/]*$'
rg -n 'ai_runs|field_action_requests|consent_at|submitted_at|state.*closed' apps/agent-api/src/customer-consultations.ts apps/agent-api/src/inquiries.ts
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:db:field
pnpm typecheck
pnpm lint
```

파일 목록에서 정확한 경로를 확인한 뒤 읽는다. 탐색에서 옛 이름 `000010_agents.sql`/`000036_field_actions.sql`이 없어 실패했으며 실제 파일은 `000007_agents.sql`/`000036_field_action_requests.sql`이다. runtime21041은 생존 확인 후 유지하고 timeout만으로 재기동하지 않는다. 전체 기능 목표/상단 시안 경로를 보존한다.

## 최신 인수인계 — C03/F09 Field 권한 회수·격리 복원 (2026-09-26)

- **현재 목표/상태:** 전체 v3.0/C03 기능을 실제 사용할 수 있는 독립 AP/Field 로컬 환경으로 끝까지 연결한다. e28229f 이후 이번 회수/복원 단계는 progress다. **전용 route key 수명·legacy 회수 baseline·신뢰 checkpoint/원장 동시 rollback·삭제 원장 전체 누락/운영 복구, AP 자체 보존·전체 PRD/역할/QA/G·사용자 최종 시각/동선·실 공급사는 남아 C03/F09/전체 목표 in_progress**다. 커밋은 `git log -1 --oneline`으로 확인한다. 상단 시안 경로를 유지한다.
- **범위/수정 파일:** 보안5.5·Field PRD3.6~3.9·QA47/150/151/153/157의 로컬 부분. 새 Field migration000061, `src/revocation-{journal,restore,restore-cli,checkpoint-cli}.ts`, `test/revocation-restore.db.test.ts`. 기존 Field app/business/ap-connector/integrator-routes/ap-connection-revoke-receiver·AP 연결 DB 검사/API package, mock env·격리 DB runner/.gitignore, phase plan/TASKS/DEVELOPMENT_STATUS/LOCAL_FUNCTIONAL_COVERAGE/LOCAL_BACKUP_RUNBOOK/이 인계. AP domain/DB/공개 계약·UI 코드 변경 없음.
- **완료/설계:** native owner 연결/선택 회수와 인증된 AP 서명 회수 수신 3경로는 대상 lock/권한 검증 후 Field 서명/fsync 원장을 먼저 쓰고 DB를 commit한다. 기록 실패는503이며 성공이 아니다. commit 미확인 의도도 복원에서는 보수적으로 회수한다. 성공 반복은 같은 DB 회수 ID/결과를 돌려주며 원장 추가가 없다. Field 전용 directory/key는 mock setup에 추가됐고 값은 출력/커밋하지 않았다. DB suite는 별도 임시 원장/키를 사용한다. 원문/연락처/토큰/route key가 journal에 들어가지 않는다.
- **DB/키 결정:** 회수 AP access/refresh ciphertext는 null이 되고 revoked 연결/selection/token의 재활성화를 거절한다. 새 token INSERT의 selection share lock으로 발급 미commit 행을 회수 쿼리에서 빠뜨리는 실제 경합을 막는다. provider의 이미 회수된 token timestamp 갱신은 최초 값으로 유지한다. event route key는 durable 원격 회수/서명 ACK 재시도용으로 유지하며 일반 AP 조회/도구에서는 revoked 연결을 차단한다. **전용 키의 종료 수명/legacy baseline은 미완료**다. migration61은 현재 mock에 적용됐으므로 이후 SQL 변경은 새 migration으로 한다. 회수 비밀값을 롤백으로 되살리지 않는다.
- **복원/완전성:** 원장 밖의 최신 quiesced checkpoint에 전체 entry ID/내용 hash를 별도 서명해 보관한다. missing/tampered/추가 미대조 entry·없는 전체 directory·실제 AP namespace 혼합·조직/선택 binding 오류는 전체 변경 전에 실패하거나 transaction rollback한다. 별도 Field DB/로컬 mock binding만 허용하고 active DB 이름의 localhost/URL escape 별칭을 거절한다. native 선택/access/refresh/동의·연결/설치 차단, 수신 회수 ID/중복 ACK와 백업 후 outbound 의도의 blocked 재대조 상태를 복원한다. 새 remote ACK/자동 네트워크 발송은 만들지 않는다. 기존 업무/고객 key/예약·구독을 보존한다. 기존 삭제 replay와 회수 replay를 모두 수행해야 한다. checkpoint+원장 동시 과거 교체, legacy 회수 누락, 운영 보관 공급사/RPO/RTO를 인증하지 않는다.
- **실제 검수:** 최종 `pnpm test:db:field` **8959 30/30**(`/tmp/field-revocation-complete-db.log`), 임시 test/restore DB·원장 제거. 실제 해제 전 PG17 dump/restore→기존 bearer200→checkpoint export/restore CLI→401·refresh/동의 제거·ciphertext null·재활성화 거절·원문/확인키 유지·반복0, 서명/누락/미대조/whole directory/AP namespace/binding rollback·active alias/잘못된 port 거절·수신 ACK·outbound blocked를 확인했다. outbound restore 의도 한 건은 합성 journal fixture이며 native outgoing revoke/retry는 기존 실제 연결 DB/HTTP 검사에서 확인했다. 최종 전체 typecheck **52968**, lint **45964**, Field build **73538 exit0**(`/tmp/field-revocation-complete-{type,lint,build}.log`), diff check exit0.
- **실제 HTTP/시안:** 새 mock **21041** 양제품 API/웹 build/ready·Field retention worker ready. 양제품 native HTTP/320px **12875 1/1**(`/tmp/field-revocation-http-verified.log`): SDK/원문/답변·동의/1회 handoff·기존 업무/예약/고객 알림과 명시 회수/원격 장애 durable retry·AP 시작 회수를 확인했다. 첫9294는 실행 중 event worker flag 누락으로 수동 delivery가 empty였고 실패했으며 `FIELD_EVENT_WORKERS_RUNNING=1`로 기존 자동 처리 검사를 실행했다. 기준 HTML admin/audit를 Chromium320으로 열고 `/tmp/field-revocation-prototype-320.png`를 실제 열었다. 사용자 최종 UI/동선 인수와 전체 AP DB/표준 E2E/security/independence/공급사 QA/G는 이번 변경으로 미실행이다.
- **실패 접근:** 최초35414는 회수 뒤 ciphertext Buffer vsnull red. 새 fixture44717의 catalog_drafts 부재409를 native 초기 초안으로 고쳤다.64485 journal 실패200 vs503 red→기록 연결.14109는 새 fixture의 불필요한 outgoing pending을 기존 전역 worker가 집은 충돌→fixture route 제거.26076 늦은 token 경합 red→share lock.47445는 agent namespace 가정을 실제 ap로 수정했다.31325 local port CLI guard,95693 수신 ID,36876 outbound intent 복원 부재를 실제 red→green으로 고쳤다. journal 전역 lock을 대상 lock 뒤에 잡는 방식은 selection/connection 간 역순 대기를 만들 수 있어 사용하지 않고 UUID별 파일 원자 교체/native 대상 lock을 사용한다. 예상값을 버그에 맞춰 낮추지 않았다.
- **현재 환경:** 54477 생존 확인 후 새 빌드 반영을 위해 Ctrl+C/exit1 정상 종료했고 현재 **21041**(`/tmp/field-revocation-native-runtime.log`)만 유지한다. AP http://localhost:3001/workspace, Field http://localhost:3002/workspace. 양 API ready를 마지막에 실제 확인했다. 제작 LLM은 model 미설정 blocked_integration. 합성 테스트 회수/복원만 실행했으며 실 사용자 회수·운영 자료 삭제/배포·청구·발송 없음. 최신 restore-only 변경은 Field build73538에 반영했고 API 경로는 HTTP12875 검수 때와 같다.
- **남은 동일 단계/다음 의존성:** Field 전용 event route key 종료 수명·legacy 회수 baseline·삭제 원장의 전체 ID/hash checkpoint/유실·미확인 결과 대조를 조사하고 native 동작/복원 증빙까지 연결한다. checkpoint/원장 동시 과거 교체·운영 보관/실 복구 게이트는 별도다. 이후 AP 익명30/업무180/사진90의 AP 자체 정책·종결/hold/정리·독립 worker·복원과 전체 PRD/역할/QA/G를 요구별로 대조한다. 전체 기능 목표를 회수 subset으로 축소하지 않는다. 외부 credential 없음은 계속 가능한 내부 작업의 중단 사유가 아니다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -2 --oneline
sed -n '1,40p' docs/CODEX_HANDOFF.md
cat docs/technical/LOCAL_BACKUP_RUNBOOK.md
cat apps/field-api/src/retention-journal.ts
cat apps/field-api/src/retention-restore-cli.ts
cat apps/field-api/src/revocation-journal.ts
cat apps/field-api/src/ap-connection-revoke.ts
rg -n 'event_secret_cipher|event_key_id|revoked|retention' apps/field-api/src/ap-connection-revoke-receiver.ts apps/field-api/migrations
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:db:field
pnpm typecheck
pnpm lint
# 21041이 실행 중인 현재 환경에서 관련 연동 HTTP 검수 명령:
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python FIELD_DISTRIBUTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python node --test tools/spikes/ap-field-connection-http.test.mjs
```

확인된 runtime21041을 유지한다. 관찰 timeout만으로 재기동하지 않는다. CLI export는 쓰기를 중단한 독립 journal에서만 실행하며 신뢰 checkpoint 자체를 DB 과거 백업으로 대체하지 않는다. 시안은 인계 상단에 계속 보존한다.

## 최신 인수인계 — C03/F09 Field 정리 실행·독립 worker·삭제 원장 재적용 (2026-09-26)

- **현재 목표/상태:** 전체 v3.0/C03 기능을 실제 사용할 수 있는 독립 AP/Field 로컬 환경으로 끝까지 연결한다. `c87f14f` 이후 이번 구현은 progress이며 **revoke 원장/전체 원장 유실·운영 복원·AP 보존/전체 PRD·QA·G/사용자 최종 시각·동선은 남아 전체 목표/F09/C03은 in_progress**다. 커밋은 `git log -1 --oneline`으로 확인한다.
- **요구/수정 파일:** Field PRD3.6~3.9 F-A06·보안5.5·QA46/49/119/157/159의 로컬 부분. 새 migration60, `src/retention-{purge-routes,purge,purge-worker,journal,consumers,restore,restore-cli}.ts`, `test/retention-purge.db.test.ts`; 기존 app/bookings/retention-routes/work-retention/external-request-attachment-worker·integrator DB 검사/Field API package. 웹 새 FieldRetentionNotice, 기존 FieldRetentionAdmin/field-retention.{ts,css}/field-api/field-public/field-booking/field-workspace/field-owner-reservation-inbox/external-request-photos. mock-run/setup-mock-env/E2E 등록/retention HTTP·browser/.gitignore 및 실행 계획/TASKS/DEVELOPMENT_STATUS/coverage/backup runbook/이 인계. AP 내부/DB/공개 계약 변경 없음.
- **완료/결정:** UUID 멱등키·native kind/id/org/승인 policy·scope photos/work·revision/anchor와 원문/메시지·사진/예약 사건·점유·연결 예약 digest에 묶인 불변 요청→다른 operator 승인→취소를 구현했다. 실행 직전 현재 정책/양 운영자 membership을 잠가 확인하고 업무·연결 예약/수신을 정해진 순서로 잠근다. hold·현재 지원·전달·기한·basis 변경은 blocked/stale다. non-mock 운영 MFA gate는503 유지다. 독립 worker는 Field PG/private files/journal만 사용하며 AP/Valkey/제작 LLM 환경이 없는 실제 프로세스로 ready/empty였다. mock:run에 별도 관리 프로세스로 등록했다.
- **원문/소비자:** 실제 immutable 사진을 delete→get 부재 확인 뒤 photo purged/null metadata로 남긴다. work는 문의/예약 이름·전화·지역/선호시간/제출/메시지·내부 메모, 예약 이벤트 사유/달력 label, 수신 customer/request snapshot·summary/outbox 원문을 제거한다. 업무/예약/처리/감사 ID와 확인키 권한은 유지하며 키 교체도 가능하다. DB parent/child/지원 승인/수신 답변 제약과 API410이 재저장을 거절한다. 늦은 복사는 파일 쓰기 전 현재 parent/claim을 잠가 이미 완료/정리된 사진을 다시 쓰지 않는다. 관리자 job 요청/별도 승인/취소·조회 실패 metadata 유지/잠금·ACK 재확인과 고객/사업자 종료 안내를 연결했다. 사진 scope는 원문/새 대화를 유지한다.
- **독립 원장/복원:** Field만의 HMAC entry·700/600 파일·fsync/atomic rename을 사용한다. file_prepared는 의도, file_deleted는 실제 부재 확인이다. SQL 준비 뒤 commit 전 purge_prepared, commit 후 completed를 기록한다. 마지막 기록 실패는 실제 completed + completion_receipt_pending으로 구분하고 다음 처리 때 증빙만 재기록한다. PG17 dump를 별도 임시 DB에 실제 restore하고 별도 경로에 원래 사진을 복원한 뒤, 삭제 원장 재적용·파일 부재/원문 제거/재저장 거절·반복0을 확인했다. 미확인 의도/손상 서명·job 바인딩·다른 제품 DB·사진 증빙 누락은 성공이 아니다. 로컬 restore CLI는 현재 DB와 다른 이름/실제 파일 경로를 요구하며 localhost 별칭도 실제 거절했다. **revoke 재적용·원장 전체 유실/누락 감지·실 운영 보관/복구를 완료했다고 주장하지 않는다.**
- **실제 DB/정적 검사:** 최초87481 원문 재저장 Missing rejection→SQL 보호 **42685 29/29**. 마지막 증빙 실패24406 retry/receipt_pending red→5453 29/29. standalone 모듈 부재62361→38859 29/29. restore 첫17551은 get 반환 Buffer를 .data로 잘못 읽은 fixture 오류→56231 실제 restore 후 모듈 부재 red→50020 29/29. 수신 늦은 답변78868 rejection 부재·늦은 복사51556 put1 vs0→66762 29/29. 실제 지원 승인 경합9223 29/29·사진 scope/승인 후 hold33304 29/29. **최종 `pnpm test:db:field` 56067 29/29**(`/tmp/field-retention-phase-db-final.log`, 모든 임시 DB/restore DB 제거), 전체 typecheck **58010 exit0**(`/tmp/field-retention-phase-type.log`), lint **99020/78685 exit0**, Python/Node 구문/diff exit0. 마지막 CLI 보완 `pnpm build:field` **96874 exit0**와 현재 DB alias 지정 CLI **expected exit1**(`/tmp/field-retention-cli-active-db-denied.log`)를 실제 실행했다.
- **실제 HTTP/시안:** 초기 old UI 실행 원장 부재72258 red→79382 양제품 build/ready에서 job 라벨7645 red. 선택 항목이 감싼 label의 accessible name에 섞인 것을 Chromium exact0/partial1로 재현하고 label/id를 분리했다. 최종 **54477**에서 native HTTP/320px **73367 1/1**(`/tmp/field-retention-jobs-final-browser.log`): 정책/hold/preview/수신 종결 회귀, job ACK 유실/동일 요청·승인 전 취소/다른 승인·worker 실제 completed/파일 부재, 고객 원문 미표시/추가 질문 종료, job503 metadata 유지/잠금/복구·가로 넘침/pageerror0. 실제 reference HTML admin/audit를 다시 열고 `/tmp/field-retention-execution-prototype-320.png`, 실제 `/tmp/field-retention-jobs-320.png`/`field-retention-ended-customer-320.png`를 열었다. 표준 Field E2E7개 중 해당 HTTP 검사만 실행했고 전체/AP DB/정식 QA/G는 이번 변경으로 미실행이다.
- **현재 환경/복구:** mock85257 확인 후 정상 종료,79382 새 빌드/ready 확인 후 UI 수정 반영을 위해 정상 종료, 현재 **54477**(`/tmp/field-retention-execution-final-runtime.log`) 양 API ready/웹 ready·Field retention worker ready 및 합성 job completed를 실제 확인했다. AP http://localhost:3001/workspace, Field http://localhost:3002/workspace, 관리자 /admin/audit. 제작 LLM은 model 미설정 blocked_integration이다. 실행한 정리는 테스트가 만든 합성 업무/사진뿐이며 운영/실 사용자 삭제·배포/청구/발송 없음. 롤백으로 제거된 원문/파일을 되살릴 수 없고 tombstone/독립 원장/기존 원장 ID를 보존한다. 기존 코드가 purged 사진을 ready로 오인하지 않도록 호환 검토가 필요하다.
- **다음 필수 작업:** 같은 F09 범위의 Field 연결/token revoke 독립 기록·복원 재적용과 원장 완전성/미확인 결과 대조를 이어간다. Field native revoke/membership/token 경로와 기존 migration/consumer를 먼저 실제 파일로 조사하고 범위/QA/명령을 기록한다. 이후 AP 익명30/업무180/사진90의 AP 자체 정책·종결·hold·정리/독립 worker/복원, 전체 PRD/역할·명령/G를 요구별로 대조한다. 사용자 최종 시각·동선과 공급사/운영 MFA/법무는 미완료다. 외부 미연결 상태는 전체 내부 작업 중단 사유로 쓰지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -2 --oneline
sed -n '1,36p' docs/CODEX_HANDOFF.md
cat docs/technical/LOCAL_BACKUP_RUNBOOK.md
cat apps/field-api/src/retention-journal.ts
cat apps/field-api/src/retention-restore.ts
rg --files apps/field-api/src apps/field-api/migrations | rg 'revoke|connection|integrator|oauth'
rg -n 'revoke|revoked|access_token_cipher|refresh_token_cipher' apps/field-api/src apps/field-api/migrations
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
```

mock54477은 생존을 확인하고 유지한다. 관찰 timeout만으로 중복 기동하지 않는다. 빌드 반영 때에만 확인된 프로세스를 정상 종료/재기동한다. 시안 경로는 상단에 유지한다. 전체 기능 목표를 삭제 실행 subset으로 축소하지 않는다.

## 최신 인수인계 — C03/F09 Field 보존·종결·분쟁 보류 기반 (2026-09-26)

- **현재 목표/상태:** 시안/v3.0 전체 기능을 끝까지 연결하고 실제 사용할 수 있는 독립 AP/Field 로컬 환경을 유지한다. a13510e 기반 작업트리의 이번 단계는 정책·종결/재개 시각·보류·미리보기 UI/API/DB/권한/감사/복구를 연결한 progress다. 실제 정리 job/worker·개인정보/사진 제거·소비자/복원 원장 재적용은 필수로 남아 C03/F09/전체 목표는 미완료다. 단계 커밋은 `git log -1 --oneline`으로 확인한다.
- **수정 파일/요구:** Field PRD3.6/3.7/3.8/3.9 F-A06·보안5.5·QA46/49/119/157/159 관련 로컬 부분. 새 `apps/field-api/migrations/000059_work_retention_basis.sql`, `src/work-retention.ts`, `src/retention-routes.ts`, `test/retention.db.test.ts`; 기존 API `src/{app,bookings}.ts`. 새 웹 `src/FieldRetentionAdmin.tsx`, `src/field-retention.{ts,css}`, 기존 `src/{field-admin,field-workspace}.tsx`/`src/app/layout.tsx`. 새 `tools/spikes/field-retention-{http.test.mjs,browser.py,migration.test.mjs}`, 기존 `tools/run-e2e.mjs`; 실행 계획/TASKS/DEVELOPMENT_STATUS/LOCAL_FUNCTIONAL_COVERAGE/이 인계. AP 내부/DB·제품 간 공개 계약 변경 없음.
- **완료/설계:** 실제 active→terminal 전환만 DB clock으로 종결 시각을 기록하고 재개 시 제거한다. legacy는 현재 revision/state와 일치하는 실제 종결 사건만 backfill하고 updated_at을 추정 근거로 쓰지 않는다. 수신 문의는 Field own open/closed·revision과 owner/editor 종결 API/UI를 가지며 AP 원본/공개 requested status·알림을 바꾸지 않는다. 수신 예약은 Field 예약 종결을 읽는다. immutable1~3650일 work/photo<=work·참조/사유/UUID 멱등 정책→다른 operator 승인→중단, native3종/org FK hold(dispute/legal_record/investigation)→다른 operator의 사유 해제·기한 초과 자동 해제 없음, 별도 감사 원장을 연결했다. 180/90은 제안이며 mock 별도 승인은 법무/출시 인증이 아니다. non-mock admin은 MFA 미연결503이다.
- **미리보기/복구:** native 업무 metadata만100개+microsecond cursor로 조회한다. 미승인 정책/활성 업무/종결 근거 없음/미래 일정·점유/양방향 연결 예약 hold·현재 지원 승인/고객 전달·수신 복사·미수락 답변 대기/최근 메시지·사진 activity/업무·사진 기한을 구분한다. 입력 실패를 빈 성공으로 바꾸지 않는다. UI는 요청 ACK 분실 때 같은 UUID/본문을 재사용하고, 목록503 때 metadata 유지·조작 잠금·기존 preview 폐기·재조회를 제공한다. preview503도 이전 결과를 폐기한다. owner 종결은 같은 expectedRevision 재전송으로 최초 clock을 보존한다. Field 수신 목록/대기 집계에서 native 종결을 반영하며 고객 원문/확인키·사진·예약/원장·점유를 정리하지 않았다.
- **실제 검사:** 최초64044는 공개 fixture에 UUID submission key를 넣어400이었고 기존43자 계약에 맞춰 헤더를 제공하지 않도록 수정했다. `pnpm test:db:field` POST404 red **22865**→종결/정책/hold/권한/Origin·멱등·원본 보존 **76337 28/28**, 수신 복사 대기·수신 예약 미래/종결 기준·연결 예약의 hold·terminal 후 새 메시지 **80683 28/28**, 최종 cursor105개/microsecond 중복·누락 없음/조직 binding까지 **93261 28/28**(`/tmp/field-retention-pagination-green.log`, 각각 임시 DB 제거). `node --test tools/spikes/field-retention-migration.test.mjs` **1/1**(`/tmp/field-retention-migration.log`,58까지 별도 DB→실제 legacy fixture→59·current revision backfill/불일치/무사건 null/원본 불변/재개·새 종결/immutable 거부·임시 DB 제거). 최신 전체 **typecheck37941/lint57228 exit0**; 변경 검사/등록 ESLint5493, Python/Node 구문/diff exit0. 새 native 모듈의 AP 내부/DB 참조 rg 매치 없음(exit1).
- **실제 HTTP/320px:** region 부재 **79185** red→mock **85257**에서 최종 **36901 1/1**(`/tmp/field-retention-recovery-browser.log`): 정책 ACK 분실/동일 요청·다른 승인/자기 승인 비노출, 보류/다른 해제, preview503 폐기/복구, 원장503 metadata 유지/잠금/복구, Field 수신 업무 종결 ACK 분실/최초 결과 재확인, 원본 불변·가로 넘침/pageerror0. 기존 **Field 관리자87655 1/1**(`/tmp/field-retention-admin.log`). Field 표준 E2E7개로 등록했으나 이번 턴 전체 명령은 미실행. AP DB/전체 회귀·정식 QA/G를 이번 Field 변경으로 다시 검수했다고 주장하지 않는다.
- **실패/수정:** 첫 SQL의 없는 change_end_at은 실제 proposal_end_at/occupancy와 대조해 수정했다. 고객 문의 메시지 pending을 고객 발송으로 오인하던 preview 조건은 sender=owner로 한정했다. owner DTO missing red25955/7561을 확인해 Field 종결 필드를 추가했다. 첫 browser79826은 없는 /workspace/inbox로 접근했으며 실제 /workspace→모바일 문의 링크로 고쳤다. migration 검사 lint unused alias와 pagination TS7022는 실제 응답 구조/미사용 변수 제거로 고쳤다. 실패 기대값을 현재 결함에 맞추지 않았다.
- **시안/제한:** 기준 HTML의 admin/audit를 실제320px로 열어 감사 기록/모바일 메뉴를 확인했다. `/tmp/field-retention-prototype-admin-320.png`와 실제 `/tmp/field-retention-policy-320.png`/`field-retention-admin-320.png`를 열었다. 시안에 없는 보존 세부 기능은 PRD/보안5.5에 맞춰 추가했다. 전체 화면 일치/사용자 최종 동선 인수·운영 MFA/법무/실 공급사·전체 PRD/QA/G는 미완료다. 기존 법정 청구 기록을 전체 대화 보존으로 확대하지 않는다.
- **현재 환경/복구:** mock99529 생존 확인→Ctrl+C terminal exit1, 새81708 양제품 build/ready→확인 후 Ctrl+C exit130, 최종 **85257**(`/tmp/field-retention-final-runtime.log`) 양제품 build/migrate/ready. 마지막 양 API ready·양 웹200 실제 확인. AP http://localhost:3001/workspace, Field http://localhost:3002/workspace, Field 관리자 http://localhost:3002/admin/audit. Field 제작 LLM worker는 model 미설정 blocked_integration이다. 코드 롤백은 기존 원문/확인키·점유/사진·정책/hold/감사 열을 보존한다. 운영 배포/청구/고객 발송/실 고객·운영 데이터 삭제 없음; 검수에서 생성한 임시 DB/합성 계정/자료만 정리했다.
- **다음 필수 작업:** 미리보기 결과/기한·현재 정책/hold·지원/전달/권한을 실행 직전에 재확인하는 Field 정리 job 요청/다른 승인/독립 worker, 실제 파일 삭제 확인/재시도·부분 실패, 개인정보 제거/tombstone·기존 receipt/export/support 소비자·수신 복사 재생성 방지, 복원 후 삭제/revoke 원장 재적용을 구현한다. AP 익명30/접수180/사진90은 AP 자체 원장/worker로 별도 구현한다. 삭제 메타데이터만 추가하고 보존 전체를 완료로 축소하지 않는다. 실제 사용자 자료 정리는 별도 운영 권한 없이 수행하지 않고 격리된 합성 fixture로만 검수한다. 이후 전체 문서 기능/역할·명령/G를 요구별로 대조한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -2 --oneline
sed -n '1,36p' docs/CODEX_HANDOFF.md
sed -n '71,88p' docs/04_SECURITY_OPERATIONS_RELEASE.md
cat apps/field-api/src/work-retention.ts
cat apps/field-api/src/retention-routes.ts
cat apps/field-api/src/external-request-attachment-worker.ts
cat docs/technical/LOCAL_BACKUP_RUNBOOK.md
rg -n 'visitor_key|customer_name|customer_snapshot|body|object_key|delivered_at' apps/field-api/src/{inquiries,bookings,reservation-export,operations-archive,customer-support}.ts
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
```

새 정리 실행 단계의 파일/요구/QA/명령을 먼저 기록하고 실제 격리 DB/파일에서 승인·보류 경합·기한·실패/재시도·복원 및 소비자 상태의 red부터 시작한다. 별도 retention worker는 제작 LLM/상대 제품 서버/비밀값에 의존하지 않아야 한다. mock85257은 현재 생존을 확인하고 build 반영 때만 정상 재시작한다. 상단 시안 경로를 유지한다.

## 최신 인수인계 — C03/F09 Field 업무별 고객정보 지원 열람 (2026-09-26)

- **현재 목표/상태:** 시안/v3.0 문서의 전체 독립 AP/Field 기능을 완성하고 실제 사용할 수 있는 로컬 환경을 유지한다. 직전 목표 턴은 AP 지원 접근 `cb98923` 구현/검수/커밋의 progress였다. 이번 Field 지원 접근도 로컬 구현/검수했지만 전체 C03/F09·모든 PRD/QA/G·실 공급사/사용자 최종 인수는 미완료다. `cb98923` 기반 작업트리에서 검수했고 이 단계 커밋은 `git log -1 --oneline`으로 확인한다.
- **요구/파일:** Field PRD3.6/3.7/3.9 F-A06·보안5.3·QA05/49/119/157/159 관련 로컬 부분. 새 migration000058, `src/customer-support.ts`, `test/customer-support.db.test.ts`, 기존 `src/app.ts`; 웹 새 `FieldCustomerSupport.tsx`, `field-support.{ts,css}`, `field-admin.tsx`/root layout; 새 `tools/spikes/field-customer-support-{http.test.mjs,browser.py}`, E2E 등록·계획/현황/TASKS/coverage/이 파일. AP 내부/DB·제품 간 공개 계약 변경 없음.
- **완료/설계:** Field own inquiry/reservation/external_request를 targetKind+targetId로 구분하고 해당 nullable FK 하나+org composite FK로 묶었다. 목적/조사 참조/10~500자 사유·1~60분·conversation/contact/photos·최소 정보 선언·actor UUID 멱등 신청→다른 operator 승인/최초 종료 시각 보존→승인 범위 열람→신청자/승인자 회수를 연결했다. 자기 승인/auditor·타 actor/업무 종류·ID·현재 양 운영자 membership 회수·명시 회수/만료·신고 grant 재사용을 거부한다. 비 mock은 운영 인증 미연결503이다. mock에서 Field 로그인과 같은 정확한 localhost:3002/127.0.0.1:3002와 설정 origin만 허용하며 외부 Origin은403이다.
- **원본/감사:** 공개 고객 문의 메시지·Field 예약 제출/대화·수신 요약/request whitelist만 읽는다. contact는 이름/전화/동의 시각/방문 지역이며 번호 소유는 미확인이다. 내부 메모/확인키/원본 AP 대화/토큰·source 내부 mapping을 제외한다. 수신 업무는 AP 연결 해제 뒤에도 이미 Field가 받은 자료만 읽고 remote AP 호출/신규 복사를 하지 않는다. photos는 Field의 private 파일, 현재 grant/기한·membership·hash/용량을 읽기 뒤 다시 확인한다. pending/copy_failed는 상태 안내/bytes409다. 성공 상세/사진 읽기·신청/승인/회수·파일 오류/지연 권한 종료는 Field 감사 원장이다. 문의·예약 상태/점유/원본/고객 권한·outbox/알림/LLM 사용량을 변경하지 않는다.
- **웹/복구:** `/admin/audit`의 별도 구역에 업무 선택·신청·다른 운영자 승인·scope별 상세/사진·회수·감사를 제공한다. ACK 분실은 같은 요청 key/body로 확인한다. 목록 실패는 원문/Blob 폐기·기존 metadata 보존/조작 잠금·재조회이며0건 성공으로 처리하지 않는다. 기한 timer·10초/focus/명시 권한 확인·다른 업무 선택/unmount 시 상세/Blob을 폐기하고 늦은 사진 응답이 다시 열지 않게 한다. 목록100개+cursor/감사 최근100개다.
- **실제 검사:** 최초 DB83712는 예약 정책 fixture 미설정409였다. 실제 policy와 예약 메시지 UUID 계약에 맞춰 POST404 red **20583**→Field DB27/27 **80128**. 실제 origin403 browser95595/진단85309·DB25865 red→주소 처리 수정 뒤 **`pnpm test:db:field`15725 27/27**(`/tmp/field-customer-support-origin-green.log`, 임시 DB 제거). native 업무3종·FK/범위/actor·자기 승인/auditor·현재 양 운영자 권한·만료/회수·멱등·외부 Origin 거부·지연 사진 회수403·감사·원본/점유/outbox 불변·해제된 수신 자료·pending409를 포함한다. 최종 **typecheck88434/lint82464 exit0**. 최신 mock99529에서 **HTTP/320px10485 1/1**(`/tmp/field-customer-support-origin-browser.log`): native 두 운영자·ACK 분실/동일 요청 복구·업무3종/scope별 자료·내부 메모 제외·실제 사진/대기 안내·queue503 폐기/목록 보존/복구·회수·실제8초 종료/사진 폐기·가로 넘침/pageerror0. 기존 **Field 관리자10054 1/1**(`/tmp/field-customer-support-admin.log`). 표준 Field E2E5개 등록 뒤 전체 명령 미실행. AP DB/전체 기능을 이 Field 변경으로 다시 검사하지 않았다.
- **마지막 정적/환경 확인:** 대기 첨부의 byteSize null을 정확히 표현한 뒤 전체 typecheck88434(`/tmp/field-customer-support-final-static.log`) exit0. E2E 등록/타입 파일 ESLint34426, 변경 Python/Node 구문·diff exit0, 새 Field 지원 파일에 AP 내부/DB 경계 참조 rg 매치 없음(exit1). 마지막 양 웹 HTTP200·양 API ready를 실제 확인했다.
- **실패/수정:** 초기 typecheck17716의 옛 detail.inquiry.state는 Field work.state로 고쳤다. UI 부재52169 red 이후95595는 ACK 후 성공 안내 대기 실패였다. 응답 실측85309에서 원래 POST403 origin_denied를 확인했고 Field auth의 두 mock trustedOrigins/실 env의127.0.0.1을 대조했다. DB25865에 정확한 localhost/127 origin 허용 단언을 넣어 red 확인 후 이 두 origin만 추가했으며 외부 Origin403 단언/승인·권한 검사를 유지했다. 최초 POST의 실제201을 ACK 분실 검사에도 단언해 잘못된 거부 응답을 성공 저장으로 가정하지 않는다. 검사 기대값을 제품 결함에 맞추지 않았다.
- **시안/제한:** 기준 HTML의 request-access 실제 모달을320px Chromium에서 다시 열어 목적3개·사유·최소 정보 선언을 확인했다. `/tmp/field-prototype-customer-support-320.png`, 실제 `/tmp/field-customer-support-{reservation,received}-320.png`를 열었다. 실제 캡처는 승인 상세/첨부 상태 범위이며 전체 화면 일치/최종 시각 인수나 외부 공급사 검수 증거가 아니다. 고객 요청 진위·운영 MFA·법정 보존/정리/분쟁 hold·정식 QA/G·실 공급사와 모든 PRD/역할 기능 누락 대조는 남는다. AP 접수 전 익명 AI 원본은 AP 문의 grant 범위가 아니다.
- **현재 환경:** mock75745는 live 확인 후 Ctrl+C exit130, mock72393은 live 확인 후 Ctrl+C로 terminal exit1을 확인하고 새 mock **99529**를 띄웠다(`/tmp/field-customer-support-origin-runtime.log`). 양제품 API/웹 build/ready 실제 확인. AP http://localhost:3001/workspace, Field http://localhost:3002/workspace. Field 제작 LLM worker는 model 미설정 `blocked_integration`이다. 운영 배포/실 고객 열람·청구/발송/운영 데이터 삭제 없음. 코드 롤백으로 기존 원본/확인키/Field 수신 자료를 지우지 않고 새 grant/감사를 보존한다.
- **다음 확정 내부 작업/명령:** `git status --short`, `git log -2 --oneline`, `sed -n '1,34p' docs/CODEX_HANDOFF.md`, `sed -n '71,88p' docs/04_SECURITY_OPERATIONS_RELEASE.md`, `cat apps/field-api/src/received-work-record.ts`, `rg -n 'closed|completed|canceled|rejected|expired|state.*closed' apps/field-api/src/{inquiries,bookings}.ts`, `rg -n 'retention|cleanup|hold' apps/agent-api/src apps/field-api/src`, `curl -fsS http://127.0.0.1:4311/health/ready`, `curl -fsS http://127.0.0.1:4321/health/ready`. 보존180/사진90·익명30·감사1년은 제안이므로 임의 운영 정책/삭제로 확정하지 않는다. 제품별 정책/종결시각·분쟁 hold/정리 preview·승인·증빙의 실제 누락을 조사하고 파일/요구/QA/명령을 먼저 기록한다. 실제 사용자/운영 자료를 정리하지 않고 합성 fixture로 구현/검수하며 전체 목표를 축소하지 않는다. mock99529는 실제 생존을 확인하고 build 반영 때만 정상 재시작한다. 상단 시안 경로를 유지한다.

## 최신 인수인계 — C03/A08 AP 고객정보 지원 열람 (2026-09-26)

- **현재 목표/상태:** 문서/시안의 전체 기능을 독립 AP/Field 로컬 서비스로 연결한다. AP 문의 원본의 지원 접근은 로컬 구현/검수했으며 C03/A08 전체는 `in_progress`다. `9f08208` 기반 작업트리에서 검수했고 이 단계 커밋은 `git log -1 --oneline`으로 확인한다.
- **요구/파일:** AP PRD2.9 AP-A06·보안5.3·QA05/49/119/157/159 관련 로컬 부분. AP 새 migration000063, `src/customer-support.ts`, `test/customer-support.db.test.ts`, `src/app.ts`; 웹 새 `AgentCustomerSupport.tsx`, `agent-support.{ts,css}`, 기존 `agent-admin.tsx`/root layout; 새 `tools/spikes/agent-customer-support-{http.test.mjs,browser.py}`, E2E 등록·계획/현황/TASKS/coverage/인계. Field 코드/DB·제품 간 공개 계약 변경 없음.
- **완료/설계:** 문의별 목적·조사 참조·사유·1~60분·conversation/contact/photos·최소 정보 선언·멱등 신청, 다른 operator 승인, 자기 승인/auditor 거부, 최초 기한을 연장하지 않는 승인 재확인, 신청자/승인자 회수, 현재 양 운영자 membership/타 actor·타 inquiry/만료 검사, 모든 성공 상세·사진 읽기의 감사와 파일 오류/지연 중 회수 감사를 연결했다. 신고 grant를 고객 원본 권한으로 쓰지 않는다. 공개 고객 메시지만 읽고 내부 메모/확인키/object key/파일 hash를 응답에서 제외한다. contact의 번호 소유권은 미확인이다. photos는 별도 header 승인 GET, hash/용량·파일 읽기 후 권한 재확인으로 제공한다. 고객 권한/원본을 변경하지 않고 원문 복제·LLM 전송·발송/청구를 만들지 않는다. non-mock은 운영 인증 미연결503이다.
- **웹/복구:** `/admin/audit`의 별도 지원 접근 구역에서 신청→다른 운영자 승인→선택 범위/사진→회수한다. 요청 ACK 분실은 같은 키/본문으로 결과를 확인한다. 목록 조회 실패는 기존 metadata를 유지하되 조작을 잠그고 열린 원문/사진을 폐기한다. 기한 timer·10초 상태/focus 재확인·명시 재확인·선택/unmount 시 Blob URL과 상세를 폐기하며 늦은 응답이 다시 열지 않게 한다. 승인 목록은100개+cursor, 감사 화면은 최근100개다.
- **실제 검사:** AP DB route404 red39091→audit route404 red58118→**25/25 session86324**(`/tmp/agent-customer-support-initial-green.log`, 임시 DB 제거). 다른 조직 문의/actor·타 범위·자기 승인/auditor·기한/현재 승인자 membership·멱등·원본 불변·사진 읽기 도중 회수403·감사/고객 원본 계속 접근을 포함한다. 최종 `pnpm typecheck` **48647**/`pnpm lint` **11371** exit0. 최신 mock75745의 native 계정/실제 문의·사진 HTTP/320px browser **22877 1/1**(`/tmp/agent-customer-support-label-browser.log`): ACK 분실/같은 요청·공개 대화만/연락처+사진만·내부 메모 비노출·queue503 상세 폐기/목록 유지/복구·별도 운영자 회수·실제8초 기한 종료 뒤 원문/사진 폐기·가로 넘침/pageerror0. 기존 AP 관리자 **1988 1/1**. AP 표준 E2E는5개로 등록했으며 등록 뒤 전체 명령은 미실행이다. 변경 Python/Node 구문·`git diff --check` exit0, 신규 AP 파일의 Field 경계 참조 rg 매치 없음(exit1). 마지막 양 웹 HTTP200·양 API ready 실제 확인.
- **실패한 접근/수정:** DB76674의 만료 fixture가 승인 시각보다 앞서 expires_at만 바꿔 CHECK를 위반했다. 과거 approved_at도 함께 구성했고 DB 제약을 완화하지 않았다. 화면 부재12181 red 뒤36135는 동일 안내 문구의 두 paragraph를 모호하게 선택해 실패했고 정확한 상태 문구로 지정했다. 확장49269는 사유 textarea를 label 내부에 둬 입력 뒤 접근성 이름이 변하는 실제 결함이었다(정확 label 매치1→0). 고정 htmlFor/id로 사유/승인·회수 사유/목적을 연결했고 동일 사유 재입력까지 최종22877에서 통과했다. 실패 기대값을 제품 버그에 맞추지 않았다.
- **시안/미검수:** 기준 HTML의 `actions['request-access']()` 모달을 실제320px Chromium에서 열어 세 목적·사유·최소 범위 선언을 확인하고 `/tmp/agent-prototype-customer-support-320.png`를 열었다. 실제 `/tmp/agent-customer-support-photo-320.png`도 열었다. 승인 목록/기간/범위는 문서 요구를 추가한 것이며 전체 시각 일치/사용자 최종 인수로 주장하지 않는다. Field 자체 원본/사진 지원 접근·보존/정리·전체 PRD/QA/G·운영 MFA·고객 요청 진위 확인·실 공급사는 남는다.
- **현재 환경/복구:** mock10988/51181은 실제 생존 확인 후 Ctrl+C exit130으로 종료했다. 현재 mock **75745** live poll 확인, `/tmp/agent-customer-support-label-runtime.log`, 양제품 API/웹 build/ready. AP http://localhost:3001/workspace, Field http://localhost:3002/workspace. Field 제작 LLM은 model 미설정 `blocked_integration`다. 새 승인/감사 원장은 보존하며 코드 롤백으로 원본/확인키/고객 경로를 삭제하지 않는다. 운영 배포/실 고객 열람·청구/발송/운영 삭제 없음.
- **다음 정확한 명령:** `git status --short`, `git log -2 --oneline`, `sed -n '1,28p' docs/CODEX_HANDOFF.md`, `sed -n '46,52p' docs/04_SECURITY_OPERATIONS_RELEASE.md`, `rg -n 'F-A06|고객정보|지원 접근' docs/02_FIELD_PRD.md apps/field-api/src/admin.ts apps/field-web/src/field-admin.tsx`, `rg --files apps/field-api/migrations apps/field-api/src apps/field-api/test | rg 'inquir|attach|admin|moderation|booking'`, `curl -fsS http://127.0.0.1:4311/health/ready`, `curl -fsS http://127.0.0.1:4321/health/ready`. 다음 Field 지원 접근 범위/요구/QA/명령을 먼저 기록하고 자기 제품 DB/세션/사진 API로 구현한다. mock75745를 실제 확인하며 코드 build 반영 때만 정상 재시작한다. 상단 시안 경로를 유지한다.

## 최신 인수인계 — C03/A08 AP 신고·검토·이의 (2026-09-26)

- **현재 목표/상태:** 시안v3/v3.0 문서의 전체 독립 AP/Field 기능을 완성해 사용할 수 있는 로컬 환경을 유지한다. 이 AP 신고 기능은 로컬 구현/검수했으나 A08/C03 전체·전체 PRD/QA/G·사용자 최종 시각/동선·실 공급사/출시는 미완료다. Owner는 AP 순차 실행이며 전체 Task는 `in_progress`다. 직전 커밋 `5bfe05e` 이후 작업트리 검수; 이 단계 커밋은 `git log -1 --oneline`으로 확인한다.
- **요구/파일:** AP PRD2.9 AP-A06/AP-O05/AP-C01, B01/03/04/10, QA05/48/49/119/157/159 관련 로컬 부분. 새 `apps/agent-api/migrations/000062_deployment_moderation.sql`, `src/deployment-moderation.ts`, `test/moderation.db.test.ts`; 기존 `src/{app,admin,deployments,customer-consultations,integrator-routes,inquiries}.ts`. 웹 새 `src/{AgentDeploymentReport,AgentModerationAdmin,AgentModerationOwner}.tsx`, `src/agent-moderation.{ts,css}`, `src/app/workspace/moderation/page.tsx`; 기존 `src/{agent-admin,agent-deploy,agent-public,workspace}.tsx`, `src/agent-public.css`, `src/app/layout.tsx`. 새 `tools/spikes/agent-moderation-{http.test.mjs,browser.py}`, `tools/run-e2e.mjs`와 계획/현황/TASKS/coverage/이 파일. Field 내부 코드/DB·제품 간 공개 계약 변경 없음.
- **완료/설계:** 공개 deployment 신고·동의/UUID 멱등·AP HMAC peer/배포 제한 원장, 불변 승인 공개 whitelist snapshot을 저장한다. guideScope/token/확인키/고객 원문을 복사하지 않는다. operator는 사유/1~60분 접근을 신청하고 다른 operator가 승인한다. 자기 승인/auditor/타 actor·타 신고·만료/현재 approver 권한 회수·비 mock MFA 미연결을 차단한다. 승인된 신고 설명/공개 서비스·FAQ/사업자 이의만 상세로 읽고 접근/처리 이유를 감사에 남긴다. 신고별 hold와 파생 deployment flag는 owner status와 별도이며 deployment→report 잠금으로 갱신한다. 한 신고의 이의 인용은 해당 hold만 풀고 다른 hold/owner pause를 유지한다.
- **기존 업무/경합:** 신규 공개/SDK/AI/외부 설치 후보와 held activate를 차단하되 기존 원본/직접 문의/다른 배포·Field 직접 업무는 보존한다. 링크·위젯 접수/위젯 session·continue·최종 AI 저장은 배포 잠금 후 현재 상태를 확인한다. 이미 대화를 가진 위젯 session만 제한 중 사람 인계를 허용한다. 동일 publicId의 실제 HttpOnly 상담 session을 확인한 경우만 공개404 뒤 기존 고객 화면을 복원하고 새 AI 질문은 비활성화한다. 무권한/다른 배포로 복원하지 않는다. 실제 PG17 대기 중 제한을 확정하고 신규 접수409를 검수했다. 최종 AI 거절은 assistant 답변을 원본에 저장하지 않으며 실제 사용량 증빙은 보존한다.
- **알림/스키마:** 기존 inquiry notification FK는 nullable로 확장하고 moderation_report_id를 추가해 정확히 하나의 업무 대상을 CHECK한다. 신고 알림은 owner/in_app/available만 허용하고 가짜 문의/고객 외부 발송을 만들지 않는다. native 트랜잭션에 최소 outbox와 내부 알림을 쓰며 workspace에서 읽음 후 이의 화면으로 이동한다.
- **실제 검사:** 최신 `pnpm test:db:agent` **24/24(session33270)**, `/tmp/agent-moderation-embed-green.log`, 임시 DB 제거. 권한/기간/멱등/다중 hold·owner pause·원본/사람 문의/직접 접수·위젯 실제 PG17 경합/기존 인계·AI 최종 응답 거절/알림 포함. `pnpm typecheck` **2626**, `pnpm lint` **17406** exit0. 최신 mock **10988** 양제품 API/웹 build/ready에서 `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python node --test tools/spikes/agent-moderation-http.test.mjs` **32096 1/1**(`/tmp/agent-moderation-complete-browser.log`): 신고/검토 ACK 분실·동일키 복구·당시 서비스/FAQ·알림 읽음/이동·이의/해제·제한 중 기존 상담 새로고침/AI 비활성/사람 접수·무권한 복원 차단·320px 가로 넘침/pageerror0. 기존 AP 관리자 **9826 1/1**. Python/Node 구문/import boundary/diff exit0. AP 표준 E2E에4개 등록했으나 전체 명령은 등록 뒤 미실행이다. Field 전체 검사를 이 AP 변경으로 다시 실행하지 않았다.
- **실패/수정:** 초기 route404 red53182, 잘못된 helper 인자 typecheck34940/미사용 인자 lint63268를 수정했다. 실제 위젯 경합7835 23/24(제한 확정 뒤201), 기존 위젯 인계47312 23/24(401), 기존 상담 새로고침17889 0/1을 재현해 경합 검사/유효 원본 경로로 수정했다. inject overload 타입27109는 Promise 응답 타입으로 수정했다. 브라우저26062는 업무 흐름 뒤 가로 넘침으로 실패했다. 같은 사업명320px 진단 width346/viewport320과 실제 캡처에서 헤더 내부 이름 span이 원인이었으며 min-width0으로 최종32096 통과. 초기 동일 파일 Delete+Add patch는 적용 전 거절돼 Update로 바꿨다. 실패 검사를 삭제하거나 버그에 기대값을 맞추지 않았다.
- **시안/미검수:** 기준 HTML을 직접 열어 `agent/chat`, `admin/audit`320px을 다시 확인했고 `/tmp/agent-prototype-{consult,audit}-320.png`, 실제 `/tmp/agent-moderation-{admin,owner,existing-customer}-320.png`를 열었다. 실제 v3audit는 감사 카드이며 과거 신고/지원 모달은 source 비교다. 사용자 최종 시각/동선 인수나 전체 화면 일치 완료로 보고하지 않는다. 원래 client-IP reverse-proxy 신뢰는 미검수이며 로컬 peer 한도가 여러 고객을 합칠 수 있다. 운영 MFA/일반 고객 대화·사진 지원 접근·보존/정리/실 공급사/정식 QA/G는 남는다. 신고 grant는 고객 원문 권한이 아니다.
- **복구/현재 환경:** 제한 enforcement 없는 이전 코드로 즉시 롤백하면 제한을 우회할 수 있으므로 현재 제한 경로를 유지한다. 증거/원본/승인 release를 삭제하지 않는다. 실제 생존을 확인한 이전 mock30515/30618은 Ctrl+C exit130으로 종료했고 최신 mock **10988**만 유지한다(`/tmp/agent-moderation-complete-runtime.log`). AP http://localhost:3001/workspace, Field http://localhost:3002/workspace. Field 제작 LLM worker는 모델 미설정 `blocked_integration`. 운영 배포/청구/실 고객 발송/운영 데이터 삭제 없음.
- **다음 확정 내부 작업:** 시안 `request-access`와 QA49/보안 문서5.3의 고객 원본/사진 지원 열람은 아직 별도 grant/API/화면이 없다. AP 문의별 목적/사유·대화/사진 scope·다른 운영자 승인/기간·현재 권한/감사·mock/운영 인증 경계를 설계하고 native DB/API/UI로 구현한다. Field F09는 자기 원장/권한으로 별도 구현하고 AP 원본을 복제/내부 import하지 않는다. 전체 문서 기능 누락 조사를 계속 유지한다.
- **다음 정확한 명령:** `git status --short`, `git log -2 --oneline`, `sed -n '1,34p' docs/CODEX_HANDOFF.md`, `cat apps/agent-api/migrations/000050_platform_admin.sql`, `cat apps/agent-api/migrations/000051_admin_access_audit.sql`, `cat apps/agent-api/migrations/000006_inquiries.sql`, `cat apps/agent-api/migrations/000017_inquiry_attachments.sql`, `sed -n '46,52p' docs/04_SECURITY_OPERATIONS_RELEASE.md`, `sed -n '60,61p' docs/06_REQUIREMENTS_QA.md`, `rg -n 'request-access|고객정보 열람' reference/field_ui_prototype_v3.html`, `curl -fsS http://127.0.0.1:4311/health/ready`, `curl -fsS http://127.0.0.1:4321/health/ready`. 다음 Task 범위/요구/QA/DB·명령을 계획에 먼저 기록한다. mock10988을 실제 확인 후 유지하며 코드 반영 때만 정상 재시작한다. 표준 AP 신고 peer5건/15분 한도를 임의 삭제/완화하지 않는다. 상단 시안 경로를 계속 보존한다.

## 최신 인수인계 — C03/F09 Field 신고·검토·이의 (2026-09-26)

- **현재 목표:** 기준 시안/v3.0 문서의 전체 AP/Field 기능을 끝까지 구현하고 사용할 수 있는 로컬 환경을 유지한다. 전체 PRD/QA·사용자 최종 시각/동선·실 공급사/출시는 미완료다. 이 단계는 Field 신고 기능의 로컬 구현/검수이며 전체 C03/F09는 `in_progress`다.
- **완료/변경 파일:** Field migration `000057_site_moderation.sql`, 새 API `src/site-moderation.ts`, 새 DB `test/moderation.db.test.ts`; 기존 `src/{app,admin,sites,notifications}.ts`. 웹 새 `src/{FieldSiteReport,FieldModerationAdmin,FieldModerationOwner}.tsx`, `src/field-moderation.{ts,css}`, `src/app/workspace/moderation/page.tsx`; 기존 `src/{field-site,field-admin,field-workspace,site-editor}.tsx`, `src/proxy.ts`, `src/app/layout.tsx`, `test/tenant-proxy.test.tsx`. 새 `tools/spikes/field-moderation-{http.test.mjs,browser.py}`, `tools/run-e2e.mjs`와 실행 계획/현황/TASKS/coverage/이 파일. 공개 신고→별도 운영자 승인→당시 공개 문구 검토→사유/공개 제한→내부 알림/읽음/사업자 이의→결정/제한 해제를 연결했다. 직전 코드 커밋은 `4ca067d`; 이 단계 변경은 다음 커밋 기록으로 확인한다.
- **설계/계약:** Field DB/identity만 사용하며 AP 코드/DB·제품 간 공개 계약 변경 없음. 신고는 명시 검토 동의/UUID 멱등키, 공개 site/catalog snapshot을 저장하며 고객 대화는 복사하지 않는다. 목록/owner 결과에 신고 설명·IP/고객 원문을 보내지 않는다. Operator가 사유·1~60분을 신청하고 다른 operator가 승인한다. 자기 승인/auditor·타 actor/타 신고·기간 만료·현재 approver membership 회수·비 mock MFA 미연결을 차단한다. 지원 접근 ID는 현재 세션/신고에 묶인 header이며 로그인 토큰/URL 권한이 아니다. 접근/처리 사유·멱등 응답·감사와 최소 outbox/owner in_app 알림을 native 트랜잭션에 남긴다.
- **제한/원본:** site→report 잠금 순서와 report별 hold로 공개 사이트/공개 사진/새 사이트 release 우회를 막는다. 이의 인용은 해당 hold만 풀며 다른 신고 hold는 유지한다. 원본 공개 release·초안·기존 문의/예약/확인키·신규 직접 접수는 보존한다. 같은 사업장 호스트의 직접 intake는 restricted404의 비공개가 아닌 organizationId로 자기 조직만 허용한다. workspace/editor는 공개 제한과 초안을 구분하고 owner 결과로 연결한다. 신고 접수만으로 자동 정지하지 않고 외부 고객 발송·실 청구를 만들지 않는다.
- **실제 검사:** PG17 `pnpm test:db:field` 최종26/26(session **98497**, `/tmp/field-moderation-final-db.log`, 임시 DB 제거), 잘못된 분류 배열500 red7318→400 포함. 자기 승인/auditor/타 actor·타 신고/기간·approver 회수/비 mock 차단, 다중 hold·멱등/revision·원본/신규 문의/예약·알림/감사를 검사했다. `pnpm typecheck`85251/`pnpm lint`60748 exit0. mock **46010** 양제품 API/웹 build/ready 후 최종 `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python node --env-file=infra/field/.env --test tools/spikes/field-moderation-http.test.mjs` **15625 1/1**(신고/검토 ACK 분실·동일키 복구·당시 서비스/50,000원/FAQ/페이지 문구·알림 읽음/이동·이의/복구·320px 가로 넘침/pageerror0). 기존 관리자 HTTP/브라우저19942 1/1, tenant proxy+site image3/3, Python/Node 구문/diff exit0. E2E 목록 등록 후 전체 Field E2E는 미실행; 새 HTTP의 로컬 DB 주소 보호/자체 env 읽기는 등록 뒤 추가했고 Node 구문/변경 ESLint로 확인했다.
- **실패 접근/수정:** 초기 fixture 삭제 FK가 route404 red를 가렸고 site_release부터 정리했다. 새 child component의 CSS import가 기존 Node SSR을 깨뜨려 root layout으로 전역 import를 옮겼다. 예약 보존 검사 fixture의 실제 booking policy를 먼저 설정했다. owner 내부 알림 누락 red를 native in_app 기록으로 구현했다. 검토 ACK 분실 재시도 후 상세가 이전 상태에 머문 버그를 승인 상세 재조회로 고쳤다. 대기 안내 텍스트 두 곳·알림 링크의 읽지 않음 건수 때문에 검사 선택자가 실패했고 실제 DOM에 맞췄다. 신고 당시 서비스 표시 누락 red86824→최종15625 green. 중간 DB60103의 기존 AP 연결 검사 retry/acked 실패는 원인 미확정/기대값·코드 미수정이며 최종98497에서 동일 검사가 통과했다. 실패 테스트를 삭제하거나 버그에 기대값을 맞추지 않았다.
- **시안/미검수:** 실제 v3 `admin/audit`를320px에서 열었지만 해당 v3 함수는 감사 카드만 표시한다. 과거 adminAudit/report-detail/request-access 모달은 HTML source로 확인했으며 실제 클릭했다고 주장하지 않는다. `/tmp/field-prototype-moderation-320.png`, 실제 `/tmp/field-moderation-{admin,owner}-320.png`를 열었다. 운영 reverse proxy의 원래 client-IP 신뢰는 미검수다. Fastify peer를 HMAC하므로 로컬 Next rewrite의 여러 접속자가 IP 한도를 공유할 수 있으며 임의 전달 헤더 우회는 넣지 않았다. 지원 접근은 신고 설명/공개 문구/사업자 이의에 한정하고 일반 고객 대화/사진 상세 열람은 미구현이다. 신고 access queue는 최근100개 pending/unexpired 요청이며 전체 역사 페이지가 아니다. 운영 MFA·신고/이의 정책/보존 종결·hold/정리·전체 PRD/QA/G·실 공급사·사용자 최종 인수는 남아 있다.
- **복구/현재 환경:** 제한 활성 상태에서 이전 코드로 즉시 롤백하면 제한을 우회할 수 있으므로 제한 enforcement를 유지해야 한다. 신고 증거·공개 release·예약·원문을 삭제하지 않는다. 확인한 이전 mock31940/31151은 Ctrl+C exit130으로 종료했고 현재 mock **46010**을 유지한다(`/tmp/field-moderation-complete-runtime.log`). AP http://localhost:3001/workspace, Field http://localhost:3002/workspace. 양 API ready 실제 확인; Field 자체 LLM worker는 model 미설정 `blocked_integration`. 운영 배포·실 고객 발송·청구·운영 삭제 없음.
- **남은 확정 내부 작업:** AP A08/C03 native 신고 원장/처리 API가 없으므로 다음 구현이다. AP의 보고 대상은 자체 deployment/public consultation이며 위험 배포 범위만 제한하고 원본/다른 배포·standalone AI와 Field 직접 업무를 보존해야 한다. Field domain/DB를 import하지 않는다. 전체 PRD 기능 누락 조사와 위 보존/지원 접근도 계속 남아 있다.
- **다음 정확한 명령:** `git status --short`, `git log -3 --oneline`, `cat apps/agent-api/migrations/000009_deployments.sql`, `cat apps/agent-api/migrations/000050_platform_admin.sql`, `cat apps/agent-api/migrations/000051_admin_access_audit.sql`, `sed -n '1,220p' apps/agent-api/src/deployments.ts`, `rg -n "status = 'active'|status='active'|deployment.*paused" apps/agent-api/src`, `sed -n '120,142p' docs/01_AGENT_PLATFORM_PRD.md`, `sed -n '59,61p' docs/06_REQUIREMENTS_QA.md`, `curl -fsS http://127.0.0.1:4311/health/ready`, `curl -fsS http://127.0.0.1:4321/health/ready`. mock46010이 실제 살아 있으면 유지한다. 다음 Task 파일/요구/QA/스키마·명령을 먼저 계획에 기록한다. 표준 `pnpm test:e2e:field`는 이제4개 경로이며 실행 전 동일 peer 신고5건/15분 한도를 고려한다. 한도 상태를 임의 삭제/완화하지 않는다. 상단 시안 경로를 계속 보존한다.

## 최신 인수인계 — C03/F01·F02 Field 업종 입력 (2026-09-26)

- **현재 목표:** 기준 HTML/v3.0 문서의 전체 AP/Field 독립 기능을 끝까지 구현해 사용할 수 있는 환경을 유지한다. 전체 기능/QA·사용자 최종 시각·동선/실 공급사·출시는 미완료다.
- **완료/파일:** Field API `src/business.ts`, `src/field-openai.ts`, 기존 `test/{business-core,site-generation}.db.test.ts`; 웹 `src/field-api.ts`, `src/{field-workspace,field-site}.tsx`, 기존 `test/site-image.test.tsx`; 기존 `tools/spikes/{field-catalog-autosave,field-owner-flow}-browser.py`, 실행 계획/현황/TASKS/coverage/인계. 직접 업종 입력·제안 목록·자동 저장/충돌/재개·owner 승인·공개 사이트·제작 AI 승인 snapshot을 연결했다. 직전 코드/문서 커밋 `19a21aa`. 이 단계도 아래 변경을 커밋한다.
- **설계:** 선택 문자열 industry 최대160자, 새 사업체/구버전 누락 빈 값·자동 선택 없음. null/숫자/초과400. 구버전 PUT에서 업종 누락은 기존 값을 보존하며 revision 조건 갱신한다. 과거 불변 승인본/해시를 다시 쓰지 않는다. 미승인 업종은 공개·제작 모델에 전달하지 않는다. Field 자체 JSONB를 쓰고 migration/AP 코드·DB·제품 간 공개 facts 계약 변경 없음.
- **실제 검사:** Field DB22/25 red→`pnpm test:db:field`25/25(session47139), 임시 DB 제거. 업종 값/권한/승인 전후/구버전 원본·요청 보존/제작 snapshot 검사 포함. Field 사이트 렌더 red→2/2. 전체 typecheck84722/lint29562 exit0. mock **88953** 양제품 API/웹 build/ready와 양 API ready 실제 확인. `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python node --env-file=infra/field/.env --test tools/spikes/field-catalog-autosave-http.test.mjs` 최종28560 1/1(업종만 수정한 응답 분실·409두 선택/재개/공개본 유지), `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http` 최종43752 1/1(공개 업종·기존 사진/FAQ/직접 문의/두 예약·충돌/확인키). Python 구문/diff exit0. 시안 create/business와 `/tmp/field-industry-320.png`를 실제 열었다. 공급사 실제 LLM은 검사하지 않았으며 generation DB는 명시 합성 모델이다. 전체 보안/독립성/정식 E2E 세트는 이번 변경 뒤 반복하지 않았다.
- **실패/수정:** 기존 자동 저장 스크립트가 접힌 편집기 진입을 생략해 입력을 찾지 못했다. 실제 사업 정보·공개 관리 버튼을 눌러 기존 흐름을 유지했다. 기존 고정 승인1/2번 단언은 자동 저장 revision 증가 때문에 실패했으며 서버에 실제 저장된 revision과 승인 표시가 일치하도록 수정했다. 시안의 select[name=industry]는 없으므로 실제 data-business 속성을 확인했다. 제품 버그에 맞춰 기대값을 낮추거나 실패 검사를 삭제하지 않았다.
- **남은 확정 누락:** 양제품 관리자 admin.ts는 GET overview만 제공하며 신고 저장/검토/이의 업무 API·원장이 없다. Field 신고·감사 화면도 조회 감사만 표시한다. Field PRD3.9/F-A06, F09/C03, QA48/49/157에 따라 Field 자체 신고 접수·운영 처리 사유·감사/사업자 이의를 먼저 구현하고 AP A08은 별도 원장·권한으로 구현한다. 필요하면 제한 범위를 별도 계약/설계로 정하며 신고만으로 자동 전체 정지를 만들지 않는다. 보존 종결/hold/정리, 전체 PRD·QA/G와 실 인증/LLM/발송/결제/도메인/백업은 여전히 미완료다.
- **복구/환경:** 코드 롤백 시 새 JSONB 업종 값은 남는다. 과거 승인본·예약·원본을 삭제하지 않는다. 이전 mock2217을 살아 있음을 확인한 뒤 Ctrl+C로 exit130 종료했고 새 mock88953만 유지한다. AP http://localhost:3001/workspace, Field http://localhost:3002/workspace. 운영 배포·청구·실 고객 발송·운영 삭제 없음.
- **다음 정확한 명령:** `git status --short`, `git log -3 --oneline`, `sed -n '238,256p' TASKS.md`, `sed -n '59,61p' docs/06_REQUIREMENTS_QA.md`, `cat apps/field-api/migrations/000043_platform_admin.sql`, `cat apps/field-api/migrations/000044_admin_access_audit.sql`, `sed -n '1,105p' apps/field-api/src/admin.ts`, `sed -n '126,167p' apps/field-web/src/field-admin.tsx`, `curl -fsS http://127.0.0.1:4321/health/ready`. 88953이 살아 있으면 유지한다. 신고 Task의 정확 파일/요구/QA/명령과 스키마를 기록하고 실제 DB/브라우저 red부터 진행한다. 상단 기준 시안 경로를 계속 보존한다.

## 최신 인수인계 — C03/I04·F-O09 Field 업무 수신 기록 (2026-09-26)

- **현재 목표:** 시안/v3.0 전체 기능을 실제 AP/Field 독립 로컬 서비스로 완성한다. C03 전체·사용자 최종 시각/동선·실 공급사/운영 검수는 미완료다.
- **구현/파일:** Field nullable migration `000056_received_work_policy.sql`, 새 `src/received-work-record.ts`, API `src/{bookings,reservation-export,operations-archive}.ts`, 기존 integrator/connection DB 검사; 웹 새 `FieldReceivedWorkRecord.tsx`, `field-api.ts`, `field-workspace.tsx`, `field-booking.tsx`; 기존 external inquiry/event delivery 브라우저, 양제품 HTTP 검사와 실행 계획. 아직 미커밋이다. AP 코드/DB·공개 계약 변경 없음.
- **설계:** 신규 수신과 같은 트랜잭션에 처리 목적·검증한 transfer-v1 동의 필드·문서 보존 제안 정책(업무 종결 후180일/사진90일)을 저장한다. 실제 수신 시각·출처는 기존 열을 읽고 최초 멱등 기록을 유지한다. legacy 정책은 null로 남기며 소급 동의/목적·운영 승인을 만들지 않는다. 사업자만 수신 문의/예약 상세와 개별/전체 export에서 확인하고, 연결 해제 뒤 Field 수신 업무를 보존한다. 보존 상태는 proposed이며 종결시각/보존 연장/삭제 worker·법무 승인은 완료가 아니다.
- **실제 검사:** Field DB 22/24 red→최종 `pnpm test:db:field` 24/24(session 8998), 임시 DB 제거. 신규 inquiry/reservation 목적/동의·180/90·재시도/해제/내보내기·기존 정책 null·SQL 목적/JSON null 거부 포함. typecheck(session 52440), lint(85760/28548), 마지막 변경 test ESLint, Python 구문·Node 구문·diff exit 0. mock **2217** 양제품 API/웹 build/ready·양 API ready 확인. 최종 양제품 HTTP/브라우저 **93811** 1/1 exit 0(320px 문의/예약 기록·기존 위젯/원본 답변/스팸 소비/해제/알림). 이전 90829는 새 문의/예약 표시를 통과했지만 AP native 영업시간을 금지하는 오래된 단언에서 실패했다. `/tmp/field-received-work-320.png`를 열어 수신 기록 상세를 확인했다. 이번 필드 변경 뒤 독립성/전체 security/unit/E2E 표준 명령은 반복하지 않았으며 과거 검수와 구분한다.
- **실패/수정:** 기존 수신 정책/표시 부재 red를 확인했다. AP native 지역/영업시간 도입 뒤 기존 연동 검사는 모든 KnowledgeRelease에서 openingHours 키 자체가 없어야 한다고 가정했다. AP 직접 승인본 값이 connector release에서 보존되는지 명시 비교하고, 외부 sourceFacts에는 Field 시간/가격/연락처가 복사되지 않는 기존 금지를 강화했다. 제품 버그에 맞춰 기대값을 낮춘 것이 아니다.
- **남은 작업:** 전체 PRD별 누락 조사와 실제 기능 증빙을 계속한다. Field PRD 3.2의 업종 입력은 business Catalog/parseCatalog/사업 정보 UI에 없는 것으로 확인됐다. 다음 구현은 Field 자체 초안/승인/제작 snapshot의 업종 입력·재개와 기존 JSONB 미등록 호환이다. AP 공개 facts 계약은 임의로 늘리지 않는다. 실 공급사/출시 승인/보존 자동 정리·신고/이의/전체 PRD·QA/G는 미완료다.
- **복구/다음 명령:** nullable 열은 코드 롤백 시 보존하며 기존 기록을 삭제하지 않는다. `git status --short`, `git log -3 --oneline`, `sed -n '29,67p' apps/field-api/src/business.ts`, `sed -n '931,945p' apps/field-web/src/field-workspace.tsx`, `rg -n 'SiteGenerationCatalog|catalog_snapshot|catalogSnapshot' apps/field-api/src/site-generation.ts apps/field-api/src/site-ai.ts`, `curl -fsS http://127.0.0.1:4311/health/ready`, `curl -fsS http://127.0.0.1:4321/health/ready`. 파일/요구/QA/명령을 기록한 뒤 업종 입력/저장 단언을 red 확인한다. mock **2217**이 살아 있으면 유지한다. 상단 시안 경로를 보존한다.

## 최신 인수인계 — C03/A01·A02 AP native 지역·영업시간 (2026-09-26)

- **현재 목표:** 문서 전체 기능을 AP/Field 독립 로컬 서비스로 완성하고 사용자 검수를 위한 사용 환경을 유지한다. 전체 C03/실 공급사/사용자 최종 시각·동선 인수는 미완료다.
- **완료/파일:** AP `src/{business,agents}.ts`, `test/{business-core,agents,customer-consultations}.db.test.ts`, 웹 `src/{workspace,agent-public}.tsx`, `agent-public.css`, 기존 owner/knowledge-autosave 브라우저와 실행 계획/현황/TASKS/coverage/인계. 지역(500자)/영업시간(1000자) 선택값을 입력·저장·승인·공개 표시·AI 근거에 연결했다. 직전 스팸 기능 커밋은 `06e7314`다.
- **설계:** AP 기존 native JSONB·revision·owner 승인을 사용하며 미등록을 추정하지 않는다. 구버전 누락은 빈 값으로 읽고 새 승인본 해시를 쓰되 기존 불변 승인본은 수정하지 않는다. PATCH는 다른 값을 보존하며 미승인 수정은 고객 표시·AI 근거에 넣지 않는다. Field connector 정보와 자동 병합하지 않는다. migration·Field 코드/DB·제품 간 공개 계약 변경 없음.
- **실제 검사:** PG17 신규 단언 red(18/23)→`pnpm test:db:agent` 최종 23/23(session 53863), 임시 DB 제거. 전체 typecheck(session 8640)/lint(session 9741), Python 구문/diff exit 0. 320px 활동 지역 입력 부재 red→mock **29076** 양제품 API/웹 build/ready에서 AP 사업자 HTTP/브라우저(session 38555) 1/1, `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python node --env-file=infra/agent/.env --test tools/spikes/agent-knowledge-autosave-http.test.mjs`(48865) 1/1. 지역만 바뀐 응답 분실/409 내 입력 비교, 시간만 바뀐 409 서버 선택·공개본 유지 포함. 시안 `owner/agent-knowledge`를 Chromium 320px에서 실제 열었다. `/tmp/agent-native-knowledge-320.png`는 종료 시 공개 상태 영역으로 입력 전체의 시각 인수 증거는 아니다.
- **실패 접근:** 탐색에서 존재하지 않는 옛 test/schema 경로를 읽으려 한 뒤 rg 파일 목록으로 정확 경로를 찾았다. 시안의 `agent/knowledge`는 존재하지 않아 routes로 확인하고 `owner/agent-knowledge`를 열었다. 기능 검사 실패는 기존 필드/근거 부재 red였고 기대값을 완화하지 않았다.
- **남은 작업:** 전체 PRD·역할별 실제 기능/증빙 대조를 계속한다. 다음 조사 대상은 Field PRD 3.6의 외부 업무 수신 snapshot 목적·출처·보존기간이다. 현재 external_work_requests에 수신 시각/고객·업무 snapshot/consent는 있으나 목적·보존 정책은 아직 확인해야 한다. 운영 보존 정책/실 공급사·정식 QA/G·최종 사용자 인수는 미완료다.
- **복구:** 코드 롤백 시 JSONB 새 값은 남지만 표시/AI 근거 사용이 중단된다. 원본·승인본 해시를 바꾸지 않는다. 운영 배포·청구·실 고객 발송·운영 삭제 없음.
- **다음 정확한 명령:** `git status --short`, `git log -2 --oneline`, `cat apps/field-api/migrations/000025_external_work_requests.sql`, `sed -n '465,580p' apps/field-api/src/bookings.ts`, `rg -n 'retention|purpose|external_work_requests' apps/field-api/src/operations-archive.ts docs/04_SECURITY_OPERATIONS_RELEASE.md`, `curl -fsS http://127.0.0.1:4311/health/ready`, `curl -fsS http://127.0.0.1:4321/health/ready`. mock **29076**가 살아 있으면 유지한다. 상단 시안 경로를 계속 보존한다.

## 최신 인수인계 — C03/A06 AP 스팸 분류·알림 중단 (2026-09-26)

- **현재 목표:** 전체 문서 기능을 AP/Field 독립 로컬 서비스로 완성한다. 이번 범위는 AP PRD 2.7의 스팸 분류·해제, 원본/증빙 보존, 알림 중단과 Field 소비자의 답변 거절 처리다. C03 전체와 사용자 최종 화면·동선 인수는 미완료다.
- **구현/파일:** AP migration `000061_inquiry_spam.sql`, `src/{inquiries,inquiry-attachments,integrator-routes,field-notification-route-close,admin}.ts`, 새 `test/inquiry-spam.db.test.ts`, 기존 integrator/field-actions DB 검사; AP 웹 `src/{workspace,agent-public}.tsx`, `agent-home.css`; Field API `ap-conversations.ts`/DB 검사, 웹 `field-workspace.tsx`; 기존 AP owner/Field external inquiry 브라우저와 실행 계획. 아직 미커밋이다.
- **설계:** AP owner/editor가 현재 revision으로 명시 분류/해제한다. 고객 후속 메시지·사진·내부 메모·확인키·기존 예약을 유지한다. spam 동안 신규 알림은 `not_applicable`/내부 이유 `spam`이며 과거 알림을 되살리지 않는다. AP는 공개 답변을 409로 거절하고 Field는 초안을 보존한다. 기존 공개 string state/알림 상태 계약을 사용하며 Field DB/schema·연결 권한 변경 없음.
- **실제 검사:** AP DB 최종 22/22(session 92460), Field DB 최종 24/24(session 85640), 전체 typecheck(session 5432)/lint(session 87435) exit 0. 임시 DB 제거 확인. mock **17560**에서 양제품 API/웹 build/ready, API readiness 실제 확인. 최종 AP 사업자 HTTP/브라우저 **70728** 1/1(응답 분실·현재 상태 조회·분류/후속 사진/원본/메모/해제/신규 알림), 양제품 HTTP/브라우저 **87239** 1/1(기존 위젯·예약·해제·알림과 Field spam 소비자 상태 주입/초안 유지) exit 0. 실제 저장 거절/알림 원장은 별도 PG17 검사로 확인했다. AP 320px 캡처 `/tmp/agent-inquiry-spam-320.png`를 열었다.
- **실패/수정:** 최초 migration의 옛 constraint 이름을 실제 후속 schema에 맞춰 고쳤다. spam 사진을 넓게 허용한 접근은 기존 AI 사전동의 사진 권한 검사를 실패시켜 폐기했다. 해당 고객 메시지의 spam 알림 증거가 있는 경우만 허용해 기존 권한 검사를 유지했다. 두 사진 때문에 모호해진 브라우저 선택자는 원래 대상 메시지 안의 사진으로 한정했다. Field의 확정 저장 거절을 결과 미상으로 저장하던 경로는 기존 revision_conflict 초안 상태로 수정했다.
- **남은 작업:** 다음 확인된 AP PRD 2.2 누락은 AP native 사업 지식의 지역/영업시간 입력·저장·공개·AI 근거다. 현재 business Content/웹 Draft/agents NativeKnowledge에는 없으며 Field 연결 데이터와 구분해 구현해야 한다. 실 공급사·전체 PRD/QA/G는 미완료다. 이번 스팸 분류는 동의 완료 human 원본 대상이며 익명 AI 상담 분류까지 구현했다고 주장하지 않는다.
- **복구:** 스팸 행/감사/중단 알림을 보존한다. 기존 코드로 즉시 롤백하면 spam 상태를 잘못 다룰 수 있으므로 스팸 기능/행 처리와 배포 순서를 먼저 검토한다. 운영 배포·청구·실 고객 발송·운영 삭제 없음.
- **다음 정확한 명령:** `git status --short`, `git log -1 --oneline`, `sed -n '12,20p' docs/01_AGENT_PLATFORM_PRD.md`, `rg -n 'type Content|contentFrom|NativeKnowledge|지역|영업시간' apps/agent-api/src/business.ts apps/agent-api/src/agents.ts apps/agent-web/src/workspace.tsx`, `curl -fsS http://127.0.0.1:4311/health/ready`, `curl -fsS http://127.0.0.1:4321/health/ready`. native 지식 Task의 파일/요구/QA/명령을 기록하고 actual DB/브라우저 단언부터 추가한다. mock **17560**을 timeout만으로 중복 기동하지 않는다. 상단 시안 경로를 유지한다.

## 최신 인수인계 — C03/F-C04 공개 사업 정보 조회 상태 (2026-09-26)

- **현재 목표:** 시안/v3.0 문서의 기능을 실제 AP/Field 독립 로컬 서비스로 끝까지 연결한다. C03 전체·사용자 최종 화면/동선·실 공급사/G는 미완료다.
- **완료/수정:** `apps/field-web/src/field-public.tsx`의 조회 상태를 loading/ready/unpublished/failed로 구분했다. 정상 빈 지역/운영시간은 미등록, 404는 공개 정보 없음, 실패는 재시도다. 대상 없는 헤더 링크는 숨긴다. `tools/spikes/field-request-fallback-browser.py`와 실행 계획/현황/TASKS/coverage/이 파일을 갱신했다. API/DB/공개 계약 변경 없음.
- **실제 검사:** 기존 빈 값 fixture 헤더 단언 red→mock **44403**의 320px 지연/404/503·네트워크 실패/재시도와 기존 문의·두 예약·후보 이동 exit 0. Field web typecheck·전체 lint·Python 구문·diff exit 0, 양제품 API/웹 build/ready. 캡처 `/tmp/field-fallback-customer-320.png`를 열었다. 이전 mock 1112는 확인 후 Ctrl+C로 정상 종료했다.
- **실패/복구:** 기존 빈 문자열 fallback은 로딩 여부와 관계없이 로딩을 표시했다. 상태 분리로 수정; 코드 롤백만 필요하며 데이터 변경 없음.
- **남은 내부 작업:** AP PRD 2.7의 spam 상태/발송 중단이 현재 CHECK/API/UI에 없다. 보존/원본·고객 추가 메시지는 유지하면서 사업자의 명시 분류·복구와 알림 중단을 구현한다. 실 공급사·운영 배포/청구/발송/삭제 없음.
- **다음 명령:** `git status --short`, `sed -n '102,110p' docs/01_AGENT_PLATFORM_PRD.md`, `cat apps/agent-api/migrations/000006_inquiries.sql apps/agent-api/migrations/000013_notification_events.sql`, `rg -n 'recordInquiryEvent|ownerMessage' apps/agent-api/src/inquiries.ts`. 로컬 서버는 AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`; HTTP로 먼저 현재 상태를 확인한다. 상단 기준 시안 경로는 유지한다.

## 최신 인수인계 — C03/A05 AP 상담 링크 QR 공유 (2026-09-26)

- **현재 목표:** 전체 v3.0 기능을 시안 기준의 실제 AP/Field 서비스에 연결하고 사용 가능한 독립 로컬 환경을 유지한다. 사용자 최종 디자인/흐름과 실 공급사 연동은 이후다. 전체 완료는 미증명이다.
- **완료 작업:** 활성 AP 상담 링크를 브라우저에서 QR PNG로 생성/다운로드한다. QR에는 AP 공개 상담 URL만 포함한다. 생성 실패에 기존 링크/재시도를 유지한다. pending/paused에는 QR 공유를 숨기고, 출력된 QR도 원래 공개 배포 상태 검사로 신규 상담을 차단한다. 이전 Field 재접수 후보 버튼의 44px/CSS를 새 mock 빌드에 반영해 실제 화면을 다시 확인했다.
- **수정 파일:** 새 `apps/agent-web/src/AgentConsultQr.tsx`, `src/{agent-deploy.tsx,agent-public.css}`, `apps/agent-web/package.json`, `pnpm-lock.yaml`; `tools/spikes/agent-owner-flow-browser.py`, 새 `tools/spikes/decode-consult-qr.mjs`; 실행 계획·상태·TASKS·coverage·이 파일. API/schema/migration/제품 간 공개 계약 변경 없음.
- **핵심 설계:** `qrcode@1.5.4`를 클릭할 때 동적 import해 browser PNG를 만든다. `@types/qrcode@1.5.6`, 해독 전용 dev `jsqr@1.4.0`/`pngjs@7.0.0`을 registry 실제 조회 버전으로 고정했다. 외부 QR 사이트·Field·고객 확인키/개인정보를 사용하지 않는다. 인쇄물의 URL은 서버 배포 상태를 계속 따르며 고객 권한을 추가하지 않는다.
- **실제 검사/환경:** 코드 `c9c475d` 이후 작업트리, 로컬 PG17/Field Valkey/mock/Chromium. 기존 활성 링크에 QR 버튼이 없어 AP 사업자 브라우저 0/1 red. 새 `pnpm mock:run` **1112** 양제품 API/웹 build/ready 후 `pnpm test:e2e:agent` 3/3. canvas 최초 실패→링크 유지/재시도, 다운로드 PNG 및 320px 실제 표시 이미지의 별도 jsQR 해독/정확한 공개 URL, pause QR 비노출+공개 API 404→재활성화를 포함한 `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python node --test tools/spikes/agent-owner-flow-http.test.mjs` 1/1. AP web typecheck·lint·변경 Python/Node 구문·diff exit 0. 새 mock의 Field 재접수 브라우저도 exit 0. 캡처 `/tmp/agent-consult-qr-owner-320.png`, `/tmp/field-fallback-owner-320.png`를 열었다. 마지막 양 웹 HTTP 200·양 API ready 확인.
- **실패한 접근:** QR 기능 부재 red 외 제품 검사 실패 없음. 웹 도구의 npm registry 메타데이터 페이지 접근은 실패해 `pnpm view`로 정확한 버전을 조회했다. QR 구현/해독 방법은 공식 저장소 문서를 읽었다.
- **남은 작업:** 다음 실제 화면 상태 결함은 Field 카탈로그가 정상 로드됐는데 지역·운영시간 빈 값이면 헤더가 계속 `승인 정보를 불러오는 중`인 것이다. 새 고객 캡처와 `field-public.tsx` 빈 문자열 fallback에서 확인했다. 정상 미등록/로딩/조회 실패를 구분하고 현재 합성 빈 값 fixture로 검수한다. 전체 문서 기능·역할 대조/사용자 최종 시각·동선/200%·전체 접근성/실 QR 카메라·인쇄/정식 QA/G는 아직 미증명이다. 실 인증·LLM·알림·결제·DNS/TLS·객체 저장소/백업 공급사는 `blocked_integration` 또는 미검수. 운영 배포/청구/고객 발송/운영 삭제 없음.
- **다음 에이전트 정확한 명령:**

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -2 --oneline
sed -n '1,33p' docs/CODEX_HANDOFF.md
rg -n '승인 정보를 불러오는 중' apps/field-web/src/field-public.tsx
sed -n '95,125p' tools/spikes/field-request-fallback-browser.py
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
```

빈 값 헤더 Task의 파일/요구/QA/명령을 계획에 기록하고, 현재 고객 폼이 정상 로드된 상태에서 헤더의 거짓 로딩 표시 단언을 red 확인한 뒤 수정한다. mock **1112**는 살아 있으면 그대로 사용하고 코드 빌드 반영 때에만 그 확인된 세션을 정상 종료/재기동한다. timeout만으로 중복 실행하지 않는다. AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`; 위 시안 경로를 유지한다.

## 최신 인수인계 — C03/F05·F06·F07/I06 AP 대체 직접 요청 (2026-09-26)

- **현재 목표:** 시안 v3와 전체 v3.0 문서의 실제 기능을 완성하고 AP/Field 독립 로컬 환경을 유지한다. 사용자 최종 디자인/동선과 실 공급사 연결은 이후다. 전체 목표/C03 완료는 미증명이다.
- **완료 작업:** Field 공개 문의·두 예약 방식에 고객이 명시한 AP 재접수 출처/선택적 기존 요청 ID/선언 시각을 저장한다. 기존 원문·확인키를 복사하지 않고 새 요청·알림 사건으로 처리한다. 사업자만 같은 조직의 Field 수신 기록에서 ID 기반 중복 후보를 보고 기존 문의/예약 상세로 이동한다. 공개 고객 조회에는 후보가 없고 개별/사업장 내보내기에 선언을 보존한다. AP 전달 기록은 참고할 요청 ID를 표시한다.
- **수정 파일:** Field migration `000055_public_request_fallback.sql`; 새 API `src/public-request-fallback.ts`, 새 DB `test/public-request-fallback.db.test.ts`; API `src/{inquiries,bookings,reservation-export,operations-archive}.ts`; Field 웹 `src/{field-api,field-public,field-booking,field-workspace,field-owner-reservation-inbox}.ts/tsx`, 새 `src/{FieldRequestFallback,FieldFallbackReview}.tsx`, `src/site.css`; AP 웹 `src/agent-field-action.tsx`, `src/agent-public.css`; `tools/spikes/{field-request-fallback-browser,field-action-browser}.py`; 계획/현황/검수/이 파일. AP DB/제품 간 공개 계약 변경 없음.
- **핵심 설계:** `fallback.origin='ap_customer_reported'`는 고객 제공 정보다. AP 장애·접수·동일 고객·중복 확정이 아니다. 요청 ID만으로 고객 권한을 주지 않는다. Field의 own `external_work_requests` 조직+ID 인덱스만 사용하고 AP DB/network 조회 없이 후보를 만든다. 전화번호로 병합하지 않는다. 기존 fallback 없는 payload hash는 유지하고 같은 키의 선언/ID 변경은 409다. nullable 새 DB 컬럼은 코드 롤백 시 남겨 기록을 보존한다.
- **실제 검사:** 작업트리(`d3a44aa` 기반), 로컬 PG17/Field Valkey/mock/Chromium. 새 DB 3개가 저장/검증/후보 부재 red→`pnpm test:db:field` 24/24(별도 임시 DB 제거). Field 재접수 폼과 AP 요청 ID 표시 부재를 320px red로 확인. 새 mock **45321** 양 API/웹 build/ready에서 `/tmp/fieldai-ui-venv/bin/python tools/spikes/field-request-fallback-browser.py` 최종 exit 0(문의·두 예약·기존 후보 문의/예약 이동·503 재시도, 가로 넘침/pageerror 0). `pnpm test:e2e:field` 3/3, `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1, `pnpm typecheck`, `pnpm lint`, 변경 Python 구문, diff exit 0. 양 웹 200·양 API ready를 확인했다. 시안 320px 고객 문의/사업자 문의함과 새 캡처를 열었다.
- **실패한 접근:** 최초 합성 후보 fixture는 같은 연결+action ID에 두 종류를 넣어 기존 unique 제약으로 거부됐고 별도 합성 연결로 수정했다. 새 검사 select의 정확 라벨/옛 하단 메뉴 클래스/모바일 목록에 바로 클릭은 현재 DOM·목록 복귀 동선과 달랐으며 조사 후 검사 선택자를 고쳤다. AP HTTP 명령에 `FIELD_BROWSER_PYTHON`을 생략한 첫 실행은 HTTP만 검사했으므로 브라우저 증거로 쓰지 않는다.
- **남은 작업:** 마지막 화면 캡처에서 후보 버튼이 기본 브라우저 스타일인 것을 보고 44px 높이·테두리·키보드 초점 CSS를 추가했다. 이 CSS는 다음 mock build에서 반영한다. 다음 확인된 내부 누락은 AP PRD 2.5 상담 링크 QR 공유(`agent-deploy.tsx`는 URL만 표시, QR 코드 없음). 그 외 전체 PRD/역할 화면 대조, 사용자 최종 시각·동선·정식 QA/G는 미완료다. 실 인증/LLM/알림/결제/DNS/TLS/저장소/백업은 `blocked_integration` 또는 미검수; 운영 배포·청구·고객 발송·운영 삭제 없음.
- **다음 에이전트 정확한 명령:**

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -1 --oneline
sed -n '1,32p' docs/CODEX_HANDOFF.md
sed -n '69,78p' docs/01_AGENT_PLATFORM_PRD.md
sed -n '90,97p' apps/agent-web/src/agent-deploy.tsx
rg -n 'QR|qrCode|qrcode|qr-code' apps/agent-web/src apps/agent-api/src
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
```

`rg` 매치 없음은 QR 미구현 확인이다. QR 작업의 파일 범위·요구/QA·명령을 먼저 계획에 기록한다. mock **45321**가 실제 live이면 코드 반영 재시작 때 해당 세션을 정상 종료한 뒤 `pnpm mock:run`으로 빌드한다. timeout만으로 중복 실행하지 않는다. 로컬 AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`; 위 시안 경로를 유지한다.

## 최신 인수인계 — C03 로컬 핵심 기능 회귀 감사 (2026-09-26)

- **현재 목표:** 시안 v3와 v3.0 문서의 기능을 끝까지 구현하고 실제 사용할 수 있는 AP/Field 독립 로컬 환경을 유지한다. 사용자 최종 시각/동선 검수와 실 공급사 연동은 이후다. 전체 목표와 C03 완료는 미증명이다.
- **완료 작업:** 코드 `a023c67`에서 AGENTS 검수 명령 계약의 로컬 기능/DB/계약/장애/보안/독립성/빌드를 실제 재실행했다. 검사에 포함된 경로는 모두 통과했다. 두 제품을 실제로 각각 상대 서비스·DB 없이 검수하고 양제품 mock을 복구했다. `docs/technical/LOCAL_FUNCTIONAL_COVERAGE.md`에 범위·제약·새 누락 요구를 기록했다.
- **수정 파일:** 새 `docs/technical/LOCAL_FUNCTIONAL_COVERAGE.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 제품 코드/API/DB/schema/공개 계약 변경 없음.
- **핵심 설계 결정:** 현재 green 명령은 자신이 단언하는 경로의 증거다. 전체 PRD 기능 완료를 뜻하지 않는다. Field PRD 3.8의 AP 장애 후 새 직접 문의/예약 `fallback_origin`·원요청 관계/중복 후보 요구는 아직 코드가 없어 다음 내부 구현으로 남긴다. 전화번호만으로 자동 병합하거나 AP 원문/미전송 입력을 몰래 복사하지 않는다.
- **실제 검사/환경/커밋:** 로컬 PG17·Field Valkey·mock·Chromium, 코드 `a023c67`. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. `pnpm test:db:agent`, `pnpm test:db:field` 각 21/21·별도 임시 DB 제거. `pnpm test:contracts`, `pnpm test:integration:faults`, `pnpm test:security` exit 0. `pnpm test:e2e:agent` 3/3, `pnpm test:e2e:field` 3/3, `pnpm test:e2e:distribution` 2/2. mock PTY 23141 종료/상대 compose `stop` 뒤 `pnpm test:independence:agent`, `pnpm test:independence:field` 각각 exit 0(상대 서비스/DB/비밀값 부재·320px 실제 owner/customer 흐름). 양 API·웹 build는 독립 검사와 최종 mock 복구에서 exit 0. 새 mock PTY **53283** 양제품 build/ready. 이 기록 커밋은 `git log -1 --oneline`으로 확인한다.
- **실패한 접근:** 이번 표준 검사에서 제품/검사 실패는 없었다. 검사 pass만으로 전체 기능 완료를 추정하지 않고 문서 대조를 추가했고, `fallback_origin` 등 미구현 요구를 발견했다.
- **남은 작업:** 우선 Field PRD 3.8 AP 대체 직접 새 요청의 출처/관계 기록과 사업자 중복 후보(자기 조직의 요청 ID 기준, 전화번호 자동 병합 금지)를 구현한다. 그 밖의 문서 요구/실제 역할 화면 대조, 사용자 최종 디자인·동선, 전체 접근성/정식 QA/G가 남아 있다. 실 인증/LLM/알림/결제/DNS/TLS/객체 저장소/악성코드 검사/백업 공급사는 `blocked_integration` 또는 미검수다. 운영 배포·청구·고객 발송·운영 데이터 삭제 없음.
- **다음 에이전트 정확한 명령:**

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -1 --oneline
cat docs/technical/LOCAL_FUNCTIONAL_COVERAGE.md
sed -n '98,109p' docs/02_FIELD_PRD.md
rg -n 'fallback_origin|fallbackOrigin|중복 후보' apps packages
sed -n '201,300p' apps/field-api/src/inquiries.ts
rg -n 'app.post|requestBody|customerName|preferredTime' apps/field-api/src/bookings.ts apps/field-web/src/field-booking.tsx
```

`rg`의 매치 없음(exit 1)은 현재 미구현 확인이다. 다음 작업 시작 전에 정확한 파일 범위·요구/QA·명령을 계획에 기록한다. 로컬 mock **53283**가 살아 있으면 AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`다. HTTP로 현재 상태를 먼저 확인하고 세션이 없을 때만 `pnpm mock:run`으로 띄운다. 위 시안 절대경로는 유지한다.

## 최신 인수인계 — C03/I03 Field AP 연결·설치 재확인 (2026-09-26)

- **현재 목표:** 위 절대경로의 시안과 v3.0 개발 문서에 맞춰 실제 기능을 끝까지 연결하고 로컬에서 사용할 수 있는 AP/Field 독립 환경을 유지한다. 사용자 최종 디자인·동선 인수와 실 공급사 연동은 이후다. C03 전체/출시 승인은 미완료다.
- **완료 작업:** Field 사업장 조회와 AP 연결 목록 조회를 분리했다. 목록 503/네트워크 실패를 실제 0건과 구분하고 이전 기록은 보존하되 재조회 전 연결 조작을 멈춘다. 설치 기록 active와 AP 활성 배포 가용성을 별도 표시하며, 해당 배포가 현재 후보에서 사라졌거나 연결이 revoked인 경우 사용 불가와 Field 중지 경로를 안내한다. 직접 문의·예약은 유지한다.
- **수정 파일:** `apps/field-web/src/field-ap-connections.tsx`, `tools/spikes/field-installation-state-browser.py`, `tools/spikes/ap-field-connection-http.test.mjs`, `docs/technical/{PHASE_2_EXECUTION_PLAN,PHASE_2_UI_REVIEW}.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API/DB migration/제품 간 공개 계약 변경 없음.
- **핵심 설계 결정:** Field 설치 `active`는 자체 원장 상태다. AP 후보 GET 200에서 해당 배포가 없거나 연결 GET 200에서 해당 연결이 사용 가능하지 않을 때에만 현재 사용 불가를 표시한다. AP 조회 실패에는 중지/부재를 추측하지 않는다. 다른 연결이 선택되면 설치된 연결을 명시적으로 다시 선택할 수 있다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock. 연결 목록 503 주입 시 거짓 빈 목록 0/1 red, 연결 revoked인데 설치 active인 경우 별도 안내 timeout red→새 mock **23141** 최종 `/tmp/fieldai-ui-venv/bin/python tools/spikes/field-installation-state-browser.py` exit 0(320px, 연결/사이트/AP 후보 실패·재시도, 후보 제거/해제, 가로 넘침/pageerror 0). `FIELD_EVENT_WORKERS_RUNNING=1 pnpm test:spike:ap-field:http` 1/1은 실제 AP 배포 pause→Field 후보 제외/AP 공개 404/Field 사이트 200→activate 후보 복귀와 기존 양방향 연결을 확인했다. `pnpm --filter @fieldai/field-web typecheck`, `pnpm lint`, Python `py_compile`, Node `--check`, `git diff --check` exit 0. `pnpm mock:run` PTY **23141**에서 양제품 build/ready. 커밋은 `git log -1 --oneline`으로 확인한다.
- **실패한 접근:** 첫 브라우저 실행은 이전 mock PTY가 종료되어 `ERR_CONNECTION_REFUSED`였고 현 세션으로 재기동한 뒤에만 코드 red를 판정했다. 종전 초기 `Promise.all`은 연결 목록 장애를 사업장 화면 상태와 묶었고, 목록 실패를 `아직 승인된 AP 연결이 없습니다`로 렌더링했다. 종전 설치 화면은 자체 active 기록만 남겨 현재 AP 배포/연결 부재를 별도로 알려주지 않았다.
- **남은 작업:** C03 다른 실제 역할/화면의 기능·시안 대조, 사용자 최종 디자인·동선 검토, 정식 QA/G. 운영 DNS/TLS·실 인증/LLM/발송/결제/백업 공급사는 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 이번 검사는 Field 설치/연결 상태와 실제 AP 배포 중지/재활성화의 로컬 mock 경로에 한정한다.
- **다음 에이전트 정확한 명령:**

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -1 --oneline
sed -n '1,38p' docs/CODEX_HANDOFF.md
curl -s -o /dev/null -w '%{http_code}' http://localhost:3002/workspace
/tmp/fieldai-ui-venv/bin/python tools/spikes/field-installation-state-browser.py
FIELD_EVENT_WORKERS_RUNNING=1 pnpm test:spike:ap-field:http
```

mock PTY **23141**가 살아 있으면 AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`다. HTTP를 먼저 확인하고 세션이 없을 때만 `pnpm mock:run`으로 재기동한다. 화면 작업에는 위 시안 절대경로를 직접 사용한다.

## 최신 인수인계 — C03/I03 Field 사이트 AP 설치 상태 (2026-09-26)

- **현재 목표:** 위 절대경로의 시안과 v3.0 문서에 맞춰 AP/Field 독립 서비스의 실제 기능을 완성한다. 사용자는 최종 디자인·동선 및 외부 공급사 연동을 직접 확인할 예정이다. C03 전체와 출시 승인은 미완료다.
- **완료 작업:** Field AP 설치 조회가 사이트 공개본 존재 여부를 `published`로 반환한다. 설치 화면은 초안 주소/공개 주소/조회 실패를 구분한다. 초안에서도 AP 계정 연결을 시작할 수 있으나 사이트 증명/위젯 설치는 공개 뒤에만 노출한다. AP 배포 후보 503과 정상 빈 목록을 구분하고 재시도한다.
- **수정 파일:** `apps/field-api/src/sites.ts`, `apps/field-api/test/sites.db.test.ts`, `apps/field-web/src/field-ap-connections.tsx`, 새 `tools/spikes/field-installation-state-browser.py`, `docs/technical/{PHASE_2_EXECUTION_PLAN,PHASE_2_UI_REVIEW}.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. AP 코드/공개 계약/DB migration 변경 없음.
- **핵심 설계 결정:** 공개 판단은 Field의 `site_releases` 원장이다. 설치/배포 조회 실패를 미개설·미공개·배포 없음으로 추측하지 않는다. 설치 기록의 `active`는 Field 설치 상태이며 AP 배포 활성 여부는 별도 조회다. Field 직접 문의·예약은 AP 없이 유지한다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock. Field DB 테스트에서 초안 `published` 누락 `undefined !== false` red→`pnpm test:spike:sites:field` 최종 2/2 green. 새 320px 브라우저 검사는 기존 초안 라벨 부재 red→`/tmp/fieldai-ui-venv/bin/python tools/spikes/field-installation-state-browser.py` exit 0(초안/설치 조회 503→재시도/AP 배포 조회 503→정상 빈 목록, 가로 넘침·pageerror 0). `pnpm --filter @fieldai/field-api build`, `pnpm --filter @fieldai/field-web typecheck`, `pnpm lint`, 변경 Python `py_compile` exit 0. 새 `pnpm mock:run` PTY **86290**에서 AP/Field API·웹 build/ready, `FIELD_EVENT_WORKERS_RUNNING=1 pnpm test:spike:ap-field:http` 1/1. 커밋은 `git log -1 --oneline`으로 확인한다.
- **실패한 접근:** 종전 설치 API는 초안에도 사이트 주소만 반환해 UI가 이를 공개 주소로 해석했다. 종전 UI는 비정상 GET을 미개설/배포 없음처럼 보이게 했다. DB 및 브라우저 검사를 먼저 실패시킨 뒤 수정했다.
- **남은 작업:** C03 다른 역할·화면의 시안/기능 검수, 사용자 최종 시각·동선 인수, 정식 QA/G. 실 인증·LLM·알림·결제·DNS/TLS·백업 공급사는 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 이 검사는 Field AP 설치 상태와 기존 연결 HTTP 경로에 한정한다.
- **다음 에이전트 정확한 명령:**

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -1 --oneline
sed -n '1,34p' docs/CODEX_HANDOFF.md
pnpm test:spike:sites:field
/tmp/fieldai-ui-venv/bin/python tools/spikes/field-installation-state-browser.py
FIELD_EVENT_WORKERS_RUNNING=1 pnpm test:spike:ap-field:http
```

로컬 mock PTY **86290**가 살아 있으면 AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`다. 먼저 HTTP 200을 확인하고 종료되었을 때만 `pnpm mock:run`으로 다시 띄운다. 위 시안 절대경로를 화면 작업 때마다 직접 대조한다.

## 최신 인수인계 — C03/QA57·119 AP/Field 사업자 키보드 초점 (2026-09-26)

- **현재 목표:** 위 시안과 v3.0 문서대로 AP/Field 독립 제품의 기능을 로컬에서 끝까지 사용할 수 있게 한다. 사용자는 최종 디자인·동선/외부 연동을 직접 확인할 예정이다. C03 전체/출시 승인은 미증명이다. 새 mock PTY **2358**: AP 웹 `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field 웹 `http://localhost:3002/workspace`/API `127.0.0.1:4321`.
- **완료 작업:** `reference/field_ui_prototype_v3.html`을 Chromium에서 `FieldPrototype.seedDemo()`→`owner/today` 320px으로 열어 하단 메뉴를 다시 확인했다(`/tmp/field-prototype-keyboard-320.png`). 실제 신규 조직의 사업자 폼에서 키보드 Tab 초점이 하단 메뉴에 가리는 AP/Field 결함을 고쳤다. 각 제품의 모바일 작업실 스크롤 영역에 하단 초점 여유를 주었다.
- **수정 파일:** `apps/agent-web/src/agent-home.css`, `apps/field-web/src/site.css`, 새 `tools/spikes/{agent-owner-keyboard-browser,field-owner-keyboard-browser}.py`, `docs/technical/{PHASE_2_EXECUTION_PLAN,PHASE_2_UI_REVIEW}.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API/DB/migration·제품 간 공개 계약 변경 없음.
- **핵심 설계 결정:** 고정된 66px 하단 메뉴와 작업실 내부 스크롤 구조를 유지하고, 760px 이하에서 스크롤 컨테이너에 100px 하단 여유를 적용한다. 시안의 통합 역할 전환은 제품별 화면에 복제하지 않는다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock. 실제 320px Field 첫 입력 하단 687px/하단 메뉴 시작 654px, AP 사업 소개 하단 691px/메뉴 654px에서 제품별 브라우저 검사 각 0/1 red. 새 mock **2358** 양제품 build/ready 뒤 AP/Field 각각 320px·390px Tab 초점이 보이고 하단 메뉴 Enter로 AP 오늘→문의, Field 오늘→예약에 이동하는 검사가 exit 0. `pnpm --filter @fieldai/agent-web typecheck`, `pnpm --filter @fieldai/field-web typecheck`, `pnpm lint`, 변경 Python `py_compile` exit 0. 이 변경 커밋은 `git log -1 --oneline`으로 확인한다.
- **실패한 접근:** 첫 CSS 전체 줄 교체 patch는 현재 파일 한 줄과 정확히 일치하지 않아 적용되지 않았다. 같은 위치에 모바일 전용 규칙을 별도 삽입해 수정했다. 탐색용 Tab 위치 즉시 측정은 CSS smooth scroll 완료 전 좌표를 읽어 오탐이 있었고, 400ms 뒤 측정으로 실제 가림을 구분했다.
- **남은 작업:** C03 나머지 실제 경로의 기능·시안 대조, 전체 역할 키보드/스크린리더·실 200% 확대, 사용자 최종 시각·동선 인수, 정식 QA/G. 실 인증·LLM·알림·결제·DNS/TLS·백업 공급사는 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 이번 검사는 신규 사업자 초기 폼과 모바일 메뉴 경로에 한정한다.
- **다음 에이전트 정확한 명령:**

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short --branch
git log -2 --oneline
sed -n '1,14p' docs/technical/PHASE_2_EXECUTION_PLAN.md
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
/tmp/fieldai-ui-venv/bin/python tools/spikes/agent-owner-keyboard-browser.py
/tmp/fieldai-ui-venv/bin/python tools/spikes/field-owner-keyboard-browser.py
```

서버가 종료됐으면 `pnpm mock:run`으로 재시작한다. 다음 기능 Task도 실행 계획 맨 위에 파일 범위·요구/QA·명령을 먼저 적는다.

## 최신 인수인계 — C03/I04 AP Field 전달 기록 부분 장애 복구 (2026-09-26)

- **현재 목표:** 위 시안과 v3.0 문서대로 AP/Field 별도 제품의 기능을 로컬에서 끝까지 사용할 수 있게 한다. 사용자는 최종 화면 디자인·동선/외부 연동을 직접 확인할 예정이다. C03 전체/출시 승인은 아직 미증명이다. 로컬 mock PTY **7578**의 AP 웹 `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field 웹 `http://localhost:3002/workspace`/API `127.0.0.1:4321` 네 HTTP 200을 실제 확인했다.
- **완료 작업:** AP 고객 확인키의 Field 전달 기록이 이력 GET 503 중에도 화면에 남도록 했다. 같은 문의·확인키 재조회는 마지막으로 읽은 기록/사진을 유지하고, 문의/확인키 변경은 폐기한다. 새 업무에 필요한 Field 서비스·가격/시간·동의와 사건 현황은 재조회 때 초기화하며, 사진 목록이 정상 응답하면 현재 ID에 남은 선택만 유지한다. 시안 v3의 고객 후속·예약 경로를 다시 확인했다.
- **수정 파일:** `apps/agent-web/src/agent-field-action.tsx`, `tools/spikes/field-action-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API/DB/migration·제품 간 공개 계약 변경 없음.
- **핵심 설계 결정:** 일시 실패는 이미 읽은 동일 고객 전달 기록을 지우는 근거가 아니다. 새 조건/동의는 이전 값으로 제출하지 못하게 초기화한다. 제품별 원본·권한 경계는 기존 그대로다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock. 기존 요청이 있는 320px 브라우저에서 전달 이력 503 뒤 `Field 예약 상태 확인`이 사라져 0/1 red, 수정 뒤 최종 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1(전달 화면·외부 위젯·원본 답변·해제·알림). `pnpm --filter @fieldai/agent-web typecheck`, `pnpm lint`, 변경 Python `py_compile` exit 0. 새 `pnpm mock:run` PTY 7578 양제품 build/ready·네 HTTP 200. 이 변경 커밋은 `git log -1 --oneline`으로 확인한다. 앞선 로컬 `pnpm test:contracts`, `pnpm test:integration:faults`, `pnpm test:security`는 각각 exit 0이었으나 이번 UI 수정 뒤 재실행하지 않았다.
- **실패한 접근:** 첫 전체 green 시도는 이미 실행 중인 mock Field 이벤트 worker를 검사에 알리지 않아 수동 revoke 함수가 자동 처리된 원장을 `empty`로 읽고 실패했다. 제품 오류가 아닌 검사 실행 환경 경합으로 확인하고 `FIELD_EVENT_WORKERS_RUNNING=1`을 명시한 최종 전체 검사를 통과했다.
- **남은 작업:** C03의 다른 실제 기능/화면과 시안 대조, 200% 확대·전체 키보드/스크린리더, 사용자 최종 시각·동선 인수, 요구사항별 정식 QA/G. 실 인증·LLM·알림·결제·DNS/TLS·백업 공급사는 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 독립성 전체 명령은 현재 두 로컬 서버를 유지하기 위해 이번 단계에서 실행하지 않았다.
- **다음 에이전트 정확한 명령:**

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short --branch
git log -2 --oneline
sed -n '1,13p' docs/technical/PHASE_2_EXECUTION_PLAN.md
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
```

서버가 종료됐으면 `pnpm mock:run`으로 재시작한 뒤 검사한다. 다음 기능 Task도 실행 계획 맨 위에 파일 범위·요구/QA·명령을 먼저 적는다.

## 최신 인수인계 — C03/A00/F00 홈 로그인 진입·분배 E2E (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`와 docs의 AP/Field 독립 제품 기능을 끝까지 구현해 로컬에서 사용할 수 있게 한다. 사용자는 최종 화면 디자인·동선/실 외부 연동을 직접 확인할 예정이다. C03 전체 완료와 출시 승인은 아직 미증명이다. 새 mock PTY **1896**: AP 웹 `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field 웹 `http://localhost:3002/workspace`/API `127.0.0.1:4321`; 양 API ready·양 웹 HTTP 200을 실제 재확인했다.
- **완료 작업:** 시안 원본 HTML을 실제 Chromium에서 `FieldPrototype.seedDemo()`→`owner/today`로 열어 1440/320px 캡처 `/tmp/field-reference-today-{1440,320}.png`를 만들었다. 실제 Field 업무 `/tmp/field-today-task-320.png`, 기존 서비스/고객 예약 시안·실제 캡처도 열어 대조했다. AP 홈의 기존 계정 `로그인`이 가입 폼으로 향하는 오류를 고쳤다. Field 홈과 양제품 작업실은 이미 `?mode=login`을 지원했다. 오래된 Field 분배 연결 브라우저 검사들이 시안형 업무 화면으로 이동하지 않고 숨긴 패널/옛 제목을 찾던 문제를 현재 모바일 문의·예약/고객 접힘 도구 동선에 맞췄다.
- **수정 파일:** `apps/agent-web/src/agent-home.tsx`, 신규 `tools/spikes/auth-entry-browser.py`, `tools/spikes/{field-action-browser,field-connection-revoke-browser,field-connection-revoke-status-browser,field-event-delivery-browser,field-external-inquiry-browser,field-external-photo-browser,field-manual-contact-browser,field-notification-route-browser}.py`, `docs/technical/{PHASE_2_EXECUTION_PLAN.md,PHASE_2_UI_REVIEW.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 제품별 API·DB/migration·로그인 세션·공개 계약 변경 없음.
- **핵심 설계 결정:** 시안의 통합 역할 전환은 검토 도구이며 실제 AP/Field 계정·배포는 독립이다. Field의 오늘 네 번째 카드는 AP 소유 외부 배포 수치가 아니라 Field 홈페이지 공개 상태다. 기존 로그인/가입 쿼리 분기를 재사용하고, E2E는 사용자가 누르는 모바일 메뉴와 문의 목록에서 상세를 연다. 기존 예약 확인키/권한/사건 경로는 변경하지 않는다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock. 새 320px 홈 진입 검사에서 AP `로그인`→가입 제출 버튼으로 0/1 red, 새 빌드 뒤 AP/Field 로그인·무료 시작 4경로 1/1. 변경 전 같은 mock에서 `pnpm test:e2e:agent` 3/3·`pnpm test:e2e:field` 3/3 exit 0. `pnpm test:e2e:distribution`은 예전 UI 선택자에서 여러 번 non-zero(로그인 중복 이름, 숨긴 예약/문의, 옛 예약 제목, 접힌 고객 도구)였고 최종 재실행은 publisher 1/1+AP 배치→Field 예약/원본 답변/해제/알림 경로 1/1, 합계 2/2 exit 0. 최종 `pnpm mock:run` PTY 1896 양 API/웹 build/ready; `pnpm --filter @fieldai/agent-web typecheck`, `pnpm lint`, 변경 Python `py_compile`, `git diff --check` exit 0. 커밋 해시는 `git log -1 --oneline`으로 확인한다.
- **실패한 접근:** Field 홈 자체도 `?mode=login`을 무시한다고 처음 의심했으나 코드 조사 결과 이미 반영돼 있었다. AP 홈 링크만 잘못됐다. 분배 E2E는 옛 UI의 모든 섹션 상시 표시와 옛 버튼/제목을 가정해 단계별로 중단됐으며 기능 API 실패로 취급하지 않았다. 실제 메뉴·목록·접힘 상태를 반영한 최종 전체 검사는 통과했다.
- **남은 작업:** C03의 다른 실제 기능/화면과 시안 대조, 200% 확대·전체 키보드/스크린리더, 사용자 최종 시각·동선 인수, 요구사항별 정식 QA/G. 인증·LLM·알림·결제·DNS/TLS·백업 실 공급사는 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 다음 기능 Task는 파일 범위·요구/QA·명령을 실행 계획 맨 위에 기록한 뒤 진행한다.
- **다음 에이전트 정확한 명령:**

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short --branch
git log -2 --oneline
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,17p' docs/technical/PHASE_2_EXECUTION_PLAN.md
/tmp/fieldai-ui-venv/bin/python tools/spikes/auth-entry-browser.py
pnpm test:e2e:distribution
```

서버가 종료됐으면 먼저 `pnpm mock:run`으로 재시작한다. 긴 분배 검사는 약 2분이며 실 공급사/출시 검수와 다르다.

## 최신 인수인계 — C03/F-O12 AP 연결 FAQ 선택 화면 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 v3 문서대로 AP/Field 독립 제품의 기능·화면을 로컬에서 사용할 수 있게 한다. 사용자는 최종 시각·동선 테스트와 실 외부 연동을 직접 진행한다. 이 단계는 AP 연결 화면과 FAQ 선택 검수이며 전체 C03/제품 완료는 미증명이다. 로컬 mock PTY **27712**: AP `http://localhost:3001/workspace`, API `127.0.0.1:4311`; Field `http://localhost:3002/workspace`, API `127.0.0.1:4321`. 양 API `/health/ready`와 양 웹 `/workspace`는 각각 ready/HTTP 200을 실제 확인했다.
- **완료 작업:** Field 승인 FAQ를 포함한 별도 AP/Field 양방향 연결 뒤 AP owner의 source 가져오기·검토·승인·FAQ 선택·AP 지식 공개 및 재진입 유지 흐름을 실제 브라우저로 확인했다. 1440px에서 연결 시작 카드가 긴 검토 카드 높이로 늘고 320px 작업 버튼이 44px 미만인 화면 결함을 고쳤다. AP 연결 화면은 최대 920px 세로 카드, 연결별 기록 카드, 44px 이상 버튼, FAQ 문답 카드로 구성한다. 이전 최초 Git 커밋 `3446330`은 이미 저장됐다.
- **수정 파일:** `apps/agent-web/src/{agent-field-connections.tsx,agent-field-connections.css}`, `tools/spikes/ap-field-connection-browser.py`, `docs/technical/{PHASE_2_EXECUTION_PLAN.md,PHASE_2_UI_REVIEW.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 이번 단계의 API/DB/migration/공개 계약 변경 없음.
- **핵심 설계 결정:** AP와 Field 별도 조직/동의/원장은 유지한다. AP는 보관된 Field 사실을 명시 검토하고 선택한 FAQ만 AP 지식 공개본에 포함한다. 화면은 연결 시작과 긴 검토 기록을 세로로 배치해 양쪽 카드가 서로의 높이에 영향을 주지 않도록 한다. 320px 행동 버튼의 실제 목표 높이를 브라우저에서 확인한다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock, 새 서버 PTY **27712**의 양 API/웹 build/ready. 실제 AP/Field 양방향 연결 브라우저는 시각 수정 전 1/1 두 차례(FAQ 가져오기·owner 승인·선택·공개·재진입). 버튼 높이 신규 assertion 0/1 red 뒤 수정하고 `/tmp/fieldai-ui-venv/bin/python tools/spikes/ap-field-connection-browser.py` 최종 1/1(320px 버튼 ≥44px·1440px 시작 카드 <500px·320px 문서 가로 넘침 0·pageerror 0). `/tmp/field-ap-faq-{320,1440}.png`를 열어 배치·FAQ 문답·줄바꿈을 확인했다. `pnpm --filter @fieldai/agent-web typecheck`, `pnpm lint`, `git diff --check` exit 0. 이번 변경 커밋 해시는 `git log -1 --oneline`으로 확인한다.
- **실패한 접근:** 기존 공통 `special-grid`의 두 열은 긴 오른쪽 검토 카드에 맞춰 왼쪽 시작 카드까지 늘렸다. 버튼은 브라우저 기본 높이에 머물러 320px 높이 assertion이 실패했다. 전용 레이아웃·버튼 CSS 적용 후 같은 전체 연결 검사가 통과했다.
- **남은 작업:** 다른 시안 역할/기능·오류 경로와 200% 확대·전체 키보드/스크린리더, 사용자 시각·동선/최종 인수, 제품별 정식 QA/G. 실 인증/LLM/알림 공급사/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 다음 단계 시작 전 파일 범위·요구/QA·명령을 실행 계획 맨 위에 기록하고 시안과 실제 화면을 대조한다.
- **다음 에이전트 정확한 명령:**

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short --branch
git log -2 --oneline
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,20p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm --filter @fieldai/agent-web typecheck
pnpm lint
/tmp/fieldai-ui-venv/bin/python tools/spikes/ap-field-connection-browser.py
```

서버가 내려갔으면 `pnpm mock:run`을 먼저 실행한다. 실 공급사 연결·최종 사용자 검사는 이 명령의 성공으로 대체하지 않는다.

## 최신 인수인계 — C03/F-O12 Field 승인 FAQ와 최초 Git 저장 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 v3 문서대로 AP/Field 독립 제품의 UI·기능을 로컬 사용 가능하게 완성한다. 사용자는 시각·동선/최종 인수 테스트와 실 외부 연동을 이후 직접 진행한다. C03/F-O12는 구현됐으나 전체 C03/제품 완료는 미증명이다. 새 mock PTY **47796**: AP 웹 `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field 웹 `http://localhost:3002/workspace`/API `127.0.0.1:4321`; 두 API `/health/ready`와 두 웹 `/workspace` HTTP 200.
- **완료 작업:** Field 사업 정보 초안에 구조화 FAQ 입력/자동 저장/충돌 비교·명시 승인, 승인 당시 문답의 공개 사이트 질문 섹션 표시, 승인 facts 계약 preview.8을 연결했다. AP는 Field facts FAQ를 별도 source 검토 원장으로 가져오고 owner가 선택한 문답을 AP 지식 공개본·새 AI 승인 경로에 넣는다. 구 릴리스/요청에 없는 FAQ는 빈 배열로 읽는다. 기존 문의·두 예약 흐름을 유지한다. 사용자 요청에 따라 이 폴더에 없던 Git 저장소를 `main`으로 초기화했다.
- **수정 파일:** Field `apps/field-api/src/{business,integrator-routes}.ts`, `test/{business-core,integrator}.db.test.ts`, `apps/field-web/src/{field-api,field-workspace,field-site}.ts(x)`와 `site.css`, `test/site-image.test.tsx`; AP `apps/agent-api/src/{field-connector,field-sources}.ts`, `test/field-connection.db.test.ts`, `apps/agent-web/src/agent-field-connections.tsx`; 공개 계약 `contracts/{field-integrator-v1.openapi.json,CONTRACT_NOTES.md}`, `tools/test/field-integrator-contract.test.mjs`, `tools/spikes/field-owner-flow-browser.py`; `.gitignore`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/{PHASE_2_EXECUTION_PLAN,PHASE_2_UI_REVIEW}.md`, 이 파일. DB migration 없음.
- **핵심 설계 결정:** `(question, answer)` 최대 100쌍·500/2000자. 비어 있는 문답도 비공개 초안에는 저장하지만 승인 시 거절한다. Field 사이트는 사이트 공개 때 고정된 승인 카탈로그를 사용한다. AP는 공개 HTTP facts만 받으며 source 검토·FAQ 선택·지식 공개·AI 승인 단계를 유지한다. 숫자가 든 Field FAQ를 AP 정적 상담 근거로 쓰는 일은 기존 중요값 검수 규칙이 보류한다. 제품별 domain/DB/로그인·원문을 공유하지 않는다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock. 정적 계약 red 0/1→green 1/1, Field 카탈로그 red 3/4→카탈로그+facts 격리 DB 5/5, AP Field 소비 red 0/1→격리 DB 1/1. `pnpm --filter @fieldai/field-api build`, `pnpm --filter @fieldai/agent-api build`, 양 웹 `typecheck`, `pnpm lint`, Python 구문 exit 0. `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http`는 FAQ 버튼 부재 red 뒤 최종 1/1 두 차례(FAQ 입력→승인→사이트 공개·고객 문답, 기존 문의/두 예약). `/tmp/field-faq-{320,1440}.png`을 열어 문답 카드/줄바꿈을 확인했고 320px 문서 가로 넘침 0. 최종 `pnpm mock:run` PTY 47796 양제품 API·웹 build/ready, 네 HTTP 200. 최초 Git 커밋은 이 문서와 함께 저장하며 해시는 `git log -1 --oneline`으로 확인한다.
- **실패한 접근:** 처음에는 Field 초안/공개 계약에 FAQ가 없어 각 red가 실패했다. 브라우저 red는 `FAQ 추가` 버튼 부재였다. FAQ 섹션을 넣은 뒤 기존 브라우저 검사의 섹션 수 기대값 두 곳이 실패해 새 공개 구조대로 고쳤다. 이전 mock 프로세스는 턴 중단 시 종료돼 새 PTY 47796으로 재시작했다.
- **남은 작업:** AP 연결 선택 UI의 실제 브라우저 인수, 다른 시안 역할/기능·오류 경로, 200% 확대·전체 키보드/스크린리더, 사용자 시각·동선/최종 인수, 제품별 정식 QA/G. 실 인증/LLM/알림 공급사/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 전체 C03 완료 주장은 하지 않는다.
- **다음 에이전트 정확한 명령:** 아래 명령으로 Git/서버를 확인하고 다음 Task의 파일 범위·요구/QA·검사 명령을 실행 계획 맨 위에 적는다. 서버가 종료됐으면 `pnpm mock:run`으로 다시 시작한다. 시안과 실제 화면을 수시로 비교한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -1 --oneline
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,16p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm --filter @fieldai/field-web typecheck
pnpm lint
```

## 최신 인수인계 — C03/F-O08 Field 오늘 업무 유형 필터 (2026-09-26)

- **현재 목표:** 시안 v3와 docs대로 AP/Field 독립 제품의 실제 UI·기능을 로컬 사용 가능하게 완성한다. 사용자는 디자인·동선과 최종 인수 테스트를 마지막에 직접 한다. 최신 mock PTY **98099** 실행 중: AP `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field `http://localhost:3002/workspace`/API `127.0.0.1:4321`; 네 HTTP 200. C03/F-O08 `in_progress`.
- **완료 작업:** Field Today `지금 확인할 일`에 시안 v3의 `모두/답변 필요/예약 요청` 탭을 연결했다. Field 직접 문의·AP 전달 문의·직접 예약 후보를 정상 조회 상태에서 모은 뒤 유형 필터를 적용해 최근 6건을 표시한다. 탭별 건수/추가 페이지 `+`, 유형별 빈 상태·이전 요청 가능성을 구분하고 기존 원본 상세로 연다. 앞 단계의 실제 오늘 일정/수동 일정 카드와 사이트 공개 상태 분리도 유지한다.
- **수정 파일:** `apps/field-web/src/{field-workspace.tsx,site.css}`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/{PHASE_2_EXECUTION_PLAN.md,PHASE_2_UI_REVIEW.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API/DB/migration/제품 간 계약 변경·Git 커밋 없음.
- **핵심 설계 결정:** 최근 6건 제한보다 유형 필터를 먼저 적용한다. AP 전달 건은 Field 외부 요청 요약과 Field 권한만 사용하고 AP 원본 대화/DB를 복사하지 않는다. 조회 실패 출처는 Today 업무 항목에서 제외하며 기존 실패·재시도 안내는 유지한다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock, 커밋 없음. 실제 직접 문의가 있는 320px Today에 `답변 필요` 버튼이 없어 브라우저 0/1 red. 수정 후 `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http` 최종 1/1(문의만 있을 때/예약 접수 뒤 세 탭 포함·제외, 기존 사이트 공개·수동 일정·비회원 문의/두 예약 전체 흐름). 첫 green 실행도 1/1, 스크린샷/가로 넘침 assertion 추가 후 최종 1/1. `pnpm --filter @fieldai/field-web typecheck`, `pnpm lint`, `python3 -m py_compile tools/spikes/field-owner-flow-browser.py` exit 0. `pnpm mock:run` PTY 98099 양제품 migration/API·웹 build/ready, 양 API `/health/ready`/양 웹 `/workspace` 200. `/tmp/field-today-filter-320.png`을 원본 시안과 대조하고 가로 넘침 0 확인. AP 전체 브라우저는 이 변경 뒤 미실행.
- **실패한 접근:** 기존 Today는 확인 필요 항목을 전체에서 6건으로 잘라 유형별 선택이 없었다. 시안의 탭을 실제 문의가 있는 브라우저에서 찾지 못하는 red로 확인했다. 유형별 필터 뒤에 6건 제한을 옮겨 최근 항목 한 종류가 다른 종류를 밀어내지 않게 했다.
- **남은 작업:** 시안 전 역할의 남은 기능/오류 경로, 네이티브 200% 확대·전체 키보드/스크린리더, 사용자 디자인·동선/최종 인수, 제품별 정식 QA/G. 실 인증/LLM/알림 공급사/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 전체 C03/제품 완료 미증명.
- **다음 에이전트 정확한 명령:** 아래로 로컬 상태를 확인하고 다음 Task의 파일 범위·요구/QA·검사 명령을 실행 계획 맨 위에 먼저 기록한다. 원본 시안과 실제 화면을 수시 비교한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,24p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm --filter @fieldai/field-web typecheck
pnpm lint
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
```

## 최신 인수인계 — C03/F-O08/F-O10 Field 오늘 일정 원장 (2026-09-26)

- **현재 목표:** 시안 v3와 docs의 화면·업무를 AP/Field 독립 제품으로 로컬에서 사용할 수 있게 완성한다. 사용자는 디자인·동선과 최종 인수 테스트를 마지막에 직접 한다. 최신 mock PTY **94263** 실행 중: AP `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field `http://localhost:3002/workspace`/API `127.0.0.1:4321`; 네 HTTP 200. C03/F-O08/F-O10 `in_progress`.
- **완료 작업:** Field 오늘 세 번째 집계를 전체 확정 예약 수에서 예약 정책 시간대의 `오늘 일정`으로 바꾸고, 기존 Field 주간 달력 API의 확정 예약·전화 예약·수동 시간 차단을 시간순 목록으로 표시했다. 예약 항목은 기존 상세, `전체`는 예약·일정, `일정 직접 추가`는 기존 수동 일정 dialog로 연결한다. 달력 503은 0건 대신 `—`/재시도다. 미래 확정 전화 예약은 오늘 수치에 포함하지 않는다.
- **수정 파일:** `apps/field-web/src/{field-workspace.tsx,field-booking.tsx,site.css}`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/{PHASE_2_EXECUTION_PLAN.md,PHASE_2_UI_REVIEW.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API/DB/migration/제품 간 계약 변경·Git 커밋 없음.
- **핵심 설계 결정:** Today 일정은 예약 목록 첫 페이지가 아닌 Field 소유 주간 달력 원장을 기준으로 한다. 정책 시간대가 없을 때 기본 `Asia/Seoul`이고, 실패한 정책/달력 조회는 확인 불가로 처리한다. 기존 달력의 수동 일정·예약 충돌 규칙과 dialog를 재사용한다. AP 예약/DB는 포함하지 않는다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock, 커밋 없음. 실제 오늘 수동 일정 1건을 넣어도 기존 화면 `확정 일정 0 · 수동 일정은 별도`인 브라우저 0/1 red. 최종 `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http` 1/1(오늘 1→삭제 0, 달력 GET 503→재시도, 직접 추가 dialog, 미래 날짜 확정 전화 예약 오늘 0, 기존 사이트 공개·비회원 문의/두 예약 전체 흐름). `pnpm --filter @fieldai/field-web typecheck`, `pnpm lint`, `python3 -m py_compile tools/spikes/field-owner-flow-browser.py` exit 0. `pnpm mock:run` PTY 94263 양제품 migration/API·웹 build/ready, 양 API `/health/ready`/양 웹 `/workspace` 200. 320px 일정 카드 캡처 `/tmp/field-today-schedule-320.png`을 원본 시안과 대조했고 문서 가로 넘침 0. AP 전체 브라우저는 이 변경 뒤 미실행.
- **실패한 접근:** 기존 집계는 첫 페이지 예약 목록의 모든 `confirmed`만 세어 날짜를 구분하지 않고 수동 시간 차단을 누락했다. 오늘 수동 일정 red로 이를 확인했다. 구현 후 브라우저 전체 흐름은 첫 실행과 미래 예약 assertion 추가 후 최종 실행 모두 1/1.
- **남은 작업:** 시안 전 역할의 남은 기능/오류 경로, 네이티브 200% 확대·전체 키보드/스크린리더, 사용자 디자인·동선/최종 인수, 제품별 정식 QA/G. 실 인증/LLM/알림 공급사/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 전체 C03/제품 완료 미증명. 다음 후보는 오늘 목록의 남은 시안 필터/업무 상태와 다른 역할 화면을 실제 API·권한과 대조한다.
- **다음 에이전트 정확한 명령:** 아래로 로컬 상태를 확인하고 다음 기능 Task의 파일 범위·요구/QA·검사 명령을 실행 계획 맨 위에 먼저 기록한다. 원본 시안과 실제 화면을 수시 비교한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,22p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm --filter @fieldai/field-web typecheck
pnpm lint
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
```

## 최신 인수인계 — C03/F-O08 Field 공개 카탈로그·홈페이지 상태 분리 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 docs의 화면/기능을 AP·Field 별도 제품으로 로컬에서 사용할 수 있게 완성한다. 사용자는 디자인·동선 및 최종 인수 테스트를 마지막에 직접 한다. 최신 mock PTY **40396** 실행 중: AP `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field `http://localhost:3002/workspace`/API `127.0.0.1:4321`; 네 HTTP 200. C03/F-O08 `in_progress`.
- **완료 작업:** Field 사업 정보 승인만 해도 Today 홈페이지가 `공개`로 보이던 오류를 바로잡았다. 사이트 초안 slug와 실제 `/v1/public/sites/:slug` 공개본을 따로 읽어 Today·AI·사이트 카드, 상단 사이트 보기 링크와 사이트 공개 후 빈 업무 안내에 반영했다. 카탈로그 공개본은 서비스 승인/예약 버전에만 사용한다. 카탈로그/사이트 조회 실패는 각각 `확인 불가`와 재시도로 표시하고, 승인 상태 확인 실패 때 카탈로그 승인 버튼을 막는다.
- **수정 파일:** `apps/field-web/src/{field-workspace.tsx,field-booking.tsx}`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/{PHASE_2_EXECUTION_PLAN.md,PHASE_2_UI_REVIEW.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API/DB/migration/제품 간 계약 변경·Git 커밋 없음.
- **핵심 설계 결정:** Field 공개 카탈로그와 공개 사이트는 별개의 승인/공개 원장이다. 404만 미공개로 해석하고 503/연결 실패는 확인 불가로 둔다. 링크는 공개 사이트 응답의 `siteOrigin`까지 확인한 뒤 제공한다. 제품 간 상태 동기화나 AP DB는 사용하지 않는다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock, 커밋 없음. 사업 정보 승인 직후 공개 전인데 Today `홈페이지 공개 · 승인 1번`인 실제 320px 브라우저 0/1 red. 수정 뒤 `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http` 최종 1/1(사업 정보 승인→사이트 공개, 각 공개 GET 503→200, 실제 비회원 문의·두 예약/복구 전체). `pnpm --filter @fieldai/field-web typecheck`, `pnpm lint`, `python3 -m py_compile tools/spikes/field-owner-flow-browser.py` exit 0. `pnpm mock:run` PTY 40396 양제품 migration/API·웹 build/ready, 두 API `/health/ready`와 두 웹 `/workspace` HTTP 200. 시안 1440px와 기존 실제 화면, 최신 320px 업무 캡처를 대조했다. AP 전체 브라우저는 이 변경 뒤 미실행.
- **실패한 접근:** 기존에는 `/v1/public/catalog` 응답 하나로 사이트 공개까지 단정했다. 첫 수정 후 브라우저 0/1은 공개 상태 구현이 아니라 접힌 서비스 화면의 문구에 가시성 assertion을 건 검사 경로 오류였다. 서비스 메뉴를 열고 확인하도록 고쳐 최종 1/1로 끝났다.
- **남은 작업:** 시안 전 역할의 남은 기능/오류 경로, 네이티브 200% 확대·전체 키보드/스크린리더, 사용자 디자인·동선/최종 인수, 제품별 정식 QA/G. 실 인증/LLM/알림 공급사/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 전체 C03/제품 완료 미증명. 다음 화면 대조 후보: Field 오늘의 `확정 일정`은 전체 확정 예약 수이므로 시안의 `오늘 일정`과 의미가 다르며 수동 일정도 포함하지 않는다. 현재 구현/문서 요구를 확인한 뒤 별도 Task로 시작한다.
- **다음 에이전트 정확한 명령:** 아래로 로컬 상태를 확인하고 다음 Task의 파일 범위·요구/QA·검사 명령을 실행 계획 맨 위에 먼저 기록한다. 시안/PRD와 실제 화면을 계속 대조한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,18p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm --filter @fieldai/field-web typecheck
pnpm lint
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
```

## 최신 인수인계 — C03/F-O08 Field 오늘 알림 조회 실패 (2026-09-26)

- **현재 목표:** 원본 시안 v3와 docs에 맞춘 AP/Field 기능을 로컬에서 사용 가능하게 완성한다. 사용자 디자인·동선/최종 인수 테스트는 마지막에 직접 진행한다. 최신 mock PTY **7851** 실행 중: AP `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field `http://localhost:3002/workspace`/API `127.0.0.1:4321`; 양 API `/health/ready`·양 웹 `/workspace` HTTP 200. C03/F-O08 `in_progress`.
- **완료 작업:** Field 오늘 화면에서 내부 알림 GET 실패를 문의·예약 조회와 별도로 표시하고 `업무 알림 다시 확인`으로 재조회한다. 실패 중 `첫 문의를 기다리고 있어요`라고 단정하지 않는다. 문의·예약 원장이 정상이라면 그 숫자는 유지한다. 앞 단계의 열린 탭 오늘 재진입→새 문의/예약 갱신은 유지한다.
- **수정 파일:** `apps/field-web/src/field-workspace.tsx`, `docs/technical/{PHASE_2_EXECUTION_PLAN.md,PHASE_2_UI_REVIEW.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 저장소 밖 임시 검사 `/tmp/fieldai-c03-today-recovery.py`는 외부 문의/예약/알림 503을 포함하도록 변경했다. API/DB/migration/계약 변경·Git 커밋 없음.
- **핵심 설계 결정:** Field 알림은 Field 자기 원장 GET/읽음 상태로 처리하고 AP 고객 원본/알림과 합치지 않는다. 각 원장의 실패를 해당 데이터의 0건으로 해석하지 않는다. Today의 업무 행은 실제 문의·예약 원장 기준이며 알림 실패 경고는 그 위에 별도로 둔다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock, 커밋 없음. 320px 브라우저에서 알림 GET 503 시 경고/재시도 없음·거짓 첫 문의 문구 red, 수정 뒤 `/tmp/fieldai-ui-venv/bin/python /tmp/fieldai-c03-today-recovery.py` 외부 문의·예약·알림 각각 503→200 및 가로 넘침 0 exit 0. `pnpm --filter @fieldai/field-web typecheck`, `pnpm lint` exit 0. `pnpm mock:run` PTY 7851 양제품 migration/API·웹 build/ready·네 HTTP 200. `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http` 1/1(실제 320px 사업자→사이트 공개→직접 문의/두 예약, 열린 탭 새 문의·예약 재조회). AP 전체 흐름은 이번 최종 빌드에서 다시 실행하지 않았고 직전 mock 76683에서 1/1이었다.
- **실패한 접근:** 알림 조회 실패를 하단 전체 `status`에만 적으면 Today의 집계/빈 화면에서 실패를 놓친다. 503 주입으로 확인한 뒤 Today 회복 영역에 연결했다.
- **남은 작업:** 시안 전 역할의 나머지 기능/오류 경로, 실제 네이티브 200% 확대·전체 키보드/스크린리더, 사용자 디자인·동선/최종 인수, 제품별 정식 QA/G. 실 인증/LLM/알림 공급사/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 전체 C03/제품 완료 미증명.
- **다음 에이전트 정확한 명령:** 아래 상태를 확인하고 다음 기능 Task의 파일 범위·요구/QA·검사 명령을 실행 계획 맨 위에 기록한다. 시안/PRD와 실제 화면·업무를 함께 대조한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,16p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm --filter @fieldai/field-web typecheck
pnpm lint
/tmp/fieldai-ui-venv/bin/python /tmp/fieldai-c03-today-recovery.py
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
```

## 최신 인수인계 — C03/A02/F-O08 열린 오늘 화면 재조회 (2026-09-26)

- **현재 목표:** 시안 v3와 docs대로 AP/Field 실제 기능을 로컬에서 사용할 수 있게 완성한다. 사용자는 화면 디자인·동선과 최종 인수 테스트를 마지막에 직접 확인한다. 최신 mock PTY **76683** 실행 중: AP `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field `http://localhost:3002/workspace`/API `127.0.0.1:4321`; 두 API `/health/ready`·두 웹 `/workspace` HTTP 200. C03/A02/F-O08 `in_progress`.
- **완료 작업:** AP·Field 사업자 작업실을 열어 둔 동안 별도 고객이 문의를 접수한 뒤에도 ‘오늘’ 메뉴를 다시 누르면 해당 제품 최신 원장을 읽는다. AP는 자기 문의·처리 알림, Field는 직접 문의·AP 전달 요약·직접 예약·내부 알림을 제품별 GET으로 갱신한다. 직전 단계의 실제 업무 행/실패 표시·재시도는 유지한다.
- **수정 파일:** `apps/agent-web/src/workspace.tsx`, `apps/field-web/src/field-workspace.tsx`, `tools/spikes/{agent-owner-flow-browser.py,field-owner-flow-browser.py}`, `docs/technical/{PHASE_2_EXECUTION_PLAN.md,PHASE_2_UI_REVIEW.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API/DB/migration/제품 간 공개 계약 변경 없음, Git 저장소/커밋 없음.
- **핵심 설계 결정:** 푸시/폴링을 새로 도입하지 않고 사업자가 오늘을 명시적으로 선택할 때 현재 조직의 원장을 다시 조회한다. Field의 AP 전달 요약은 Field 자체 GET이며 AP 원본 대화와 인증을 복제하지 않는다. 각 조회는 기존 loading/failed/ready 및 실패 재시도를 사용한다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock, 커밋 없음. 제품별 전체 320px 브라우저 검사에 고객 접수 전 열린 사업자 모니터 탭을 추가했다. 제출 뒤 같은 탭의 오늘 재진입에서 옛 0건·고객 이름 없음으로 양제품 red, 수정 뒤 양제품 1/1 green(새 고객 업무 항목과 기존 사업자→고객 상세/예약 전체 흐름). Field 동일 열린 탭에서 새 직접 예약 제출 뒤 확인할 예약 1건·고객 이름 표시도 추가 실행으로 확인했다. `pnpm typecheck`, `pnpm lint` exit 0. `pnpm mock:run` PTY 76683 양제품 migration/API·웹 build/ready, 두 API `/health/ready`·두 웹 `/workspace` HTTP 200. 사용자 최종 테스트/정식 QA 전체는 실행하지 않았다.
- **실패한 접근:** 기존 `showOwnerSection("today")`는 메뉴 상태·스크롤만 바꾸어 이미 열린 브라우저의 목록을 갱신하지 않았다. 새 브라우저/새로고침에서만 최신 항목이 보이던 검사는 실제 사용 동선을 놓쳤다. 열린 탭 재진입 검사로 재현해 조회를 연결했다.
- **남은 작업:** 시안 전 역할의 남은 기능/오류 경로, 실제 브라우저 네이티브 200% 확대·전체 키보드/스크린리더, 사용자 디자인·동선·최종 인수, 제품별 정식 QA/G. 장기 대기 자동 갱신/푸시는 이번 단계에서 미구현. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 전체 C03/제품 완료 미증명.
- **다음 에이전트 정확한 명령:** 아래로 로컬 상태를 확인하고 다음 기능 Task의 파일 범위·요구/QA·검사 명령을 실행 계획 맨 위에 먼저 기록한다. 원본 시안과 실제 화면을 수시로 대조한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,14p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm typecheck
pnpm lint
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:agent-owner-flow:http
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
```

## 최신 인수인계 — C03/A02 AP 오늘 실제 업무·양제품 모바일 제목 (2026-09-26)

- **현재 목표:** 원본 시안 v3와 docs대로 두 독립 제품의 화면·기능을 사용 가능한 로컬 API/DB에 연결한다. 사용자는 디자인·동선과 최종 인수 테스트를 마지막에 직접 할 예정이다. 최신 mock PTY **65366** 실행 중: AP `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field `http://localhost:3002/workspace`/API `127.0.0.1:4321`; 두 API `/health/ready`와 두 웹 `/workspace` HTTP 200. C03/A02는 `in_progress`.
- **완료 작업:** AP 오늘 업무에서 알림 제목 대신 실제 AP owner 문의 원장의 확인 필요 최근 최대 6건을 고객/서비스/출처와 함께 보여주고 기존 상세로 연다. AP 처리 알림은 별도 알림 화면의 원장/읽음 흐름에 둔다. 문의/알림 필수 GET loading·failed·ready를 구분해 실패 시 거짓 0건/첫 문의 문구를 막고 실패한 목록의 재시도를 제공한다. 시안/실제 320px 업무 행 대조에서 AP/Field 고객·서비스 제목 줄임표가 확인되어 두 제품 모두 줄바꿈으로 읽히게 고쳤다. Field 오늘 실제 업무/장애 복구는 아래 이전 최신 단계에서 구현했다.
- **수정 파일:** `apps/agent-web/src/{workspace.tsx,agent-home.css}`, `apps/field-web/src/site.css`, `tools/spikes/{agent-owner-flow-browser.py,field-owner-flow-browser.py}`, `docs/technical/{PHASE_2_EXECUTION_PLAN.md,PHASE_2_UI_REVIEW.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 임시 장애 브라우저 검사 `/tmp/fieldai-c03-ap-today-recovery.py`, `/tmp/fieldai-c03-today-recovery.py`; 모바일 캡처 `/tmp/{agent,field}-today-task-320.png`. AP/Field API·DB/계약 변경 없음, Git 저장소/커밋 없음.
- **핵심 설계 결정:** AP 오늘 업무의 기준은 AP 원본 문의의 `needs_owner`다. 알림 실패 여부는 별도 집계로 나타내고, AP가 Field 예약·DB·로그인을 흡수하지 않는다. Field는 자기 직접 예약과 외부 AP 전달 요약을 자체 권한으로 표시한다. 업무 제목은 말줄임 대신 여러 줄을 허용하며 카드 폭을 넘기지 않는다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock, 커밋 없음. AP 고객 문의 1건/오늘 알림 제목만 표시 red→실제 고객 이름/서비스·상세 이동 green. `/tmp/fieldai-c03-ap-today-recovery.py` 문의 503에서 거짓 첫 문의 red→최종 문의/알림 503→재시도→0 at 320px exit 0. AP/Field 각 업무 제목 `scrollWidth > clientWidth` red→최종 `<=` green. 최종 `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:agent-owner-flow:http` 1/1, `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http` 1/1(양쪽 실제 사업자→고객 전체 업무), `/tmp/fieldai-ui-venv/bin/python /tmp/fieldai-c03-{ap-,}today-recovery.py` 각각 exit 0, `pnpm --filter @fieldai/agent-web typecheck`, `pnpm lint` exit 0. `pnpm mock:run` PTY 65366 양제품 migration/API·웹 build/ready 및 네 HTTP 200. Field web typecheck는 직전 JSX 단계에서 exit 0이고 최종 단계는 CSS만 변경했다.
- **실패한 접근:** AP 오늘에 알림 제목만 쓰면 고객/서비스가 나타나지 않아 실제 브라우저 assertion이 실패했다. AP 문의 503은 문의 카드 자체는 `—`였으나 빈 카드가 `첫 문의를 기다리고 있어요`라고 잘못 말했다. 처리 알림의 GET 실패는 0건으로 남았다. 첫 업무 행 CSS는 제목을 줄임표로 가려 양제품 320px에서 검사가 실패했다. 각각 원장 기반 항목·상태/재시도·줄바꿈으로 수정했고 최종 검사는 통과했다.
- **남은 작업:** 사용자 디자인/동선 최종 확인, 시안 전 역할의 나머지 기능/오류 경로, 네이티브 200% 확대/스크린리더/전체 키보드, 제품별 정식 QA/G. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. C03/전체 제품 완료는 미증명.
- **다음 에이전트 정확한 명령:** 현재 서버와 변경 결과를 아래 명령으로 확인한다. 다음 Task의 파일 범위·요구/QA·검사 명령을 실행 계획 맨 위에 기록하고 원본 시안과 실제 화면을 수시로 비교한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,20p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm --filter @fieldai/agent-web typecheck
pnpm lint
/tmp/fieldai-ui-venv/bin/python /tmp/fieldai-c03-ap-today-recovery.py
/tmp/fieldai-ui-venv/bin/python /tmp/fieldai-c03-today-recovery.py
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:agent-owner-flow:http
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
```

## 최신 인수인계 — C03/F-O08 Field 오늘 실제 업무·부분 조회 장애 복구 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 docs에 맞춰 AP/Field 기능을 로컬 실제 API/DB에 연결한다. 사용자가 디자인·동선과 최종 인수 테스트를 마지막에 직접 확인한다. 최신 mock PTY **85881** 실행 중: AP `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field `http://localhost:3002/workspace`/API `127.0.0.1:4321`; 두 API `/health/ready`·두 웹 `/workspace` HTTP 200. C03은 `in_progress`.
- **완료 작업:** Field 오늘 카드의 직접 문의/AP 전달 문의/예약 필수 GET loading·failed·ready를 구분한다. 한 원장이 실패하면 해당 집계는 `—`와 재시도, loading은 `…`, ready만 실제 건수·이전 페이지 `+`를 보인다. 빈 상태의 `첫 문의를 기다리고 있어요`는 필수 원장이 모두 조회됐을 때만 표시한다. 원본 시안 v3 `owner/today` 1440px과 실제 화면을 캡처 대조해, 오늘의 업무 카드가 고객 업무 대신 알림 제목만 보이던 차이를 찾았다. 이제 통합 문의함 원장에서 실제 확인 필요 직접 문의/AP 전달/직접 예약을 최근순 최대 6건 표시하고 기존 상세로 연다. 내부 테스트와 조회 실패 출처의 캐시는 실제 업무 목록에 넣지 않는다.
- **수정 파일:** `apps/field-web/src/{field-workspace.tsx,site.css}`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 임시 브라우저 검사 `/tmp/fieldai-c03-today-recovery.py`, 시안/실제 캡처 `/tmp/fieldai-{reference,actual}-today.png`, 모바일 캡처 `/tmp/field-today-task-320.png`. Field API/DB·AP 계약은 변경하지 않았다. `.git`/커밋 없음.
- **핵심 설계 결정:** 오늘 업무는 notification 이력이 아니라 원본 제품별 문의/예약 조회를 기준으로 한다. AP 전달 요청은 Field가 접수한 외부 요청의 요약만 표시하고 AP 원문/로그인/DB를 복제하거나 우회하지 않는다. 시안의 외부 배포 카드는 AP 소유이므로 Field에서는 홈페이지 공개 상태를 유지한다. 알림 이력/읽음은 기존 Field 알림 화면에 남는다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock, 커밋 없음. `/tmp/fieldai-c03-today-recovery.py`는 변경 전 외부 GET 503→0건 red, 첫 수정 후 실패 중 `첫 문의를 기다리고 있어요` 문구 red, 최종 320px GET 503/재시도→200 두 원장 exit 0. `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http`는 실제 고객 문의가 오늘 업무에 없다는 red 후 최종 1/1 green(오늘 이름·서비스·상세 열기/복귀, 사이트 공개·직접 문의/두 예약). 320px 문서 가로 넘침 0. `pnpm --filter @fieldai/field-web typecheck`, `pnpm lint` exit 0. 최종 `pnpm mock:run` PTY 85881 양제품 migration/API·웹 build/ready 및 네 HTTP 200. 이전 단계의 52개 화면/확대 근사 검사는 이번 변경 뒤 다시 실행하지 않았다.
- **실패한 접근:** `/health`는 API 경로가 아니어서 404였고 `/health/ready`가 200이다. 오늘 업무 상세를 새로 열고 기존 브라우저 흐름이 바로 숨은 목록을 조작해 한 번 timeout이 났다. 실제 `문의 목록으로` 복귀를 검사 순서에 넣은 최종 전체 실행은 통과했다. 시안의 합쳐진 역할/외부 배포를 Field 내부 기능으로 옮기는 접근은 제품 경계와 충돌해 적용하지 않았다.
- **남은 작업:** 시안 전 역할의 나머지 기능 차이와 오류 상태, 실제 200% 확대/스크린리더/전체 키보드, 제품별 정식 QA/G·사용자 최종 시각/동선/기능 인수. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. C03/전체 기능 완료를 주장하지 않는다.
- **다음 에이전트 정확한 명령:** 아래로 현재 상태를 확인하고, 다음 Task의 파일 범위·요구/QA·검사 명령을 실행 계획 맨 위에 먼저 적는다. 시안을 수시로 실제 브라우저와 대조하고 고객 업무 흐름을 한 기능씩 연결한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,28p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm --filter @fieldai/field-web typecheck
pnpm lint
/tmp/fieldai-ui-venv/bin/python /tmp/fieldai-c03-today-recovery.py
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
```

## 최신 인수인계 — C03 실제 화면 글자 크기·확대 근사 점검 (2026-09-26)

- **현재 목표:** C03의 실제 기능을 끝까지 연결하고 사용 가능한 로컬 mock 환경을 유지한다. 사용자 디자인/동선·최종 인수 검수는 아직 하지 않았으며 외부 공급사는 이후에 연결한다. 최신 mock PTY **92540** 실행 중: AP `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field `http://localhost:3002/workspace`/API `127.0.0.1:4321`; 두 API `/health/ready`와 두 웹 `/workspace` HTTP 200. C03은 `in_progress`.
- **완료 작업:** 실제 AP/Field 사업자 화면의 선택 입력이 브라우저 기본 13.3px로 표시되던 것을 공통 폼에서 16px로 지정했다. Field 고객 대화 보조 문구 13px은 14px로 올렸다. 실제 가입→조직 생성 후 모바일 사업자 주요 내부 섹션과 AP 6개/Field 4개 별도 작업 경로를 320/390px 및 640px CSS zoom 2 근사로 조사했다. 비저장 검토본 52개 경로도 320px/같은 확대 근사로 조사했다.
- **수정 파일:** `packages/ui/src/styles.css`, `apps/field-web/src/site.css`, `docs/technical/{PHASE_2_EXECUTION_PLAN.md,PHASE_2_UI_REVIEW.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 임시 조사 스크립트 `/tmp/fieldai-c03-audit.py`, `/tmp/fieldai-c03-live-audit.py`는 저장소 밖이며 별도 Git 커밋 없음(저장소에 `.git` 없음).
- **핵심 설계 결정:** 실제 입력값을 가진 `select`에 공통 16px을 적용하고 radio/checkbox/color 제어의 자체 계산 글자 크기는 텍스트 입력 크기 기준에서 제외한다. 화면에 보이지 않도록 0px로 지정한 `일정 날짜` 레이블도 보이는 글자 검사에서는 제외하되 입력은 별도로 16px을 확인했다. 제품별 데이터/API 경계는 변경하지 않았다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock, 커밋 없음. 변경 전 실제 화면 스캔에서 AP AI 말투·Field 기본 예약 방식/수동 예약 서비스 `select` 13.3333px, CSS에서 Field 고객 대화 보조 문구 13px을 확인했다. `pnpm mock:run` PTY 92540 양제품 migration/API·웹 build/ready, 네 HTTP 상태 200. `/tmp/fieldai-ui-venv/bin/python /tmp/fieldai-c03-live-audit.py` 최종 `findings: []`: 실제 AP/Field 사업자 주요 경로 320/390px·CSS zoom 2 근사에서 보이는 글자 <14px·텍스트 입력/선택 <16px·문서 가로 넘침·pageerror 0. `/tmp/fieldai-ui-venv/bin/python /tmp/fieldai-c03-audit.py` 최종 52개 검토 경로 HTTP 200·같은 글자/입력/가로 넘침 위반 0. `pnpm lint`, `pnpm typecheck` exit 0. 실제 브라우저 네이티브 확대 200%, 스크린리더/전체 키보드, 사용자 최종 검수는 미실행.
- **실패한 접근:** 첫 동적 스캔은 radio/color 선택기의 제어 자체 font-size와 시각적으로 숨긴 `일정 날짜` 레이블 0px을 텍스트 입력/보이는 글자 위반으로 잘못 세었다. 검사 범위를 보이는 문자와 텍스트 입력으로 고친 뒤 최종 0건. 실제 CSS 결함은 수정 전/후 빌드에서 재확인했다.
- **남은 작업:** C03의 사용자 시각·동선 확인, 실제 브라우저 확대 200%/전체 키보드·스크린리더, 역할별 실제 업무 동선의 넓은 QA57/58/119, 전체 문서 기능·정식 QA/G. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 사용자 목표의 기능 완료는 아직 증명되지 않았다.
- **다음 에이전트 정확한 명령:** 아래로 상태를 확인한다. 다음 기능 작업 전 파일 범위·요구/QA·명령을 실행 계획 맨 위에 기록한다. 우선 현재 실제 업무 화면에서 남은 동작/오류 경로를 조사해 구현한다. 사용자 디자인 확인이 없었다는 사실과 실 공급사 미연결을 유지해 보고한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,16p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm lint
pnpm typecheck
pnpm test:e2e:agent
pnpm test:e2e:field
pnpm test:e2e:distribution
```

## 최신 인수인계 — C03/A02/F-O09 오래된 문의 재개 노출 (2026-09-26)

- **현재 목표:** 시안 v3와 docs대로 AP/Field 화면·기능을 로컬 실제 API/DB에 연결한다. 사용자 최종 인수 테스트와 외부 공급사 연동은 이후에 한다. 최신 mock PTY **92325** 실행 중: AP `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field `http://localhost:3002/workspace`/API `127.0.0.1:4321`; 두 API `/health/ready`·두 웹 HTTP 200. C03/A02/F-O09는 `in_progress`.
- **완료 작업:** 100건 뒤의 오래된 문의에 고객 새 질문이 오면 AP/Field 사업자 목록 첫 페이지로 나타나도록 제품별 owner 문의 GET의 키셋 정렬을 `updated_at,id`로 바꿨다. 원래 `created_at`은 그대로 응답/저장하고 최근 활동 시각을 별도 응답·UI 목록 시간에 반영했다. Field 목록 새로고침 성공은 첫 페이지를 서버 결과로 교체해 오래된 항목을 남기지 않는다. 각 제품에 최근 활동 index를 추가했다. AP/Field 원본/DB는 계속 분리한다.
- **수정 파일:** `apps/agent-api/migrations/000060_inquiry_activity_order.sql`, `apps/field-api/migrations/000054_inquiry_activity_order.sql`, `apps/{agent-api,field-api}/src/inquiries.ts`, `apps/agent-api/test/inquiries.db.test.ts`, `apps/field-api/test/business-core.db.test.ts`, `apps/agent-web/src/workspace.tsx`, `apps/field-web/src/field-workspace.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 접수 시각을 변경해 순서를 맞추지 않고, 이미 메시지/완료 트랜잭션에서 갱신되는 각 제품 `updated_at`을 활동 정렬 기준으로 쓴다. `(updated_at,id)` 마이크로초 DB 커서와 제품별 index가 100건 경계를 맡는다. 새 고객 활동은 서버 재조회 뒤 보이며 현재 열린 목록을 푸시로 갱신하지 않는다. 페이지 순회 중 다른 문의 활동이 이동하면 첫 페이지 새로고침에서 보이는 일반적인 실시간 목록 동작이다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock, 커밋 없음. 103건 중 접수순 마지막 건의 활동을 올린 새 assertion에서 변경 전 `pnpm test:db:agent`/`:field` 각각 20/21 red, 변경 뒤 각각 21/21 green(첫 항목, 100+3 경계, 다른 계정 커서, 접수 시각 보존). `pnpm lint`, `pnpm typecheck`, AP web unit 10/10·Field web unit 14/14 exit 0. 새 `pnpm mock:run` PTY 92325 양제품 migration/API/웹 build/ready·두 API `/health/ready`/두 웹 HTTP 200. `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:agent-owner-flow:http` 1/1, `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http` 1/1(320px 실제 사업자→고객 업무). 103건 자체의 UI 조작은 이번 단계에서 미실행.
- **실패한 접근:** 기존 `created_at` 목록은 새 활동이 있어도 과거 문의를 첫 페이지에 올리지 못해 두 제품 DB에서 각각 1건씩 실패했다. 접수 시각 자체를 수정하면 원본 의미가 변하므로 적용하지 않았다. 새 index/정렬로 최종 검사 통과.
- **남은 작업:** 103건 실제 브라우저 목록→과거 완료 문의→고객 재개→첫 페이지 새로고침/필터 경로, 200% 확대·스크린리더·전체 키보드, 시안 전체 기능 감사·정식 QA/G·사용자 최종 인수. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 전체 제품 완료 아님.
- **다음 에이전트 정확한 명령:** 아래로 현재 로컬 상태를 확인한다. 다음 구현의 파일 범위·요구/QA·명령을 실행 계획 맨 위에 기록한 뒤 시안을 수시로 비교한다. 사용자 최종 인수/실 공급사를 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,18p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm test:db:agent
pnpm test:db:field
pnpm lint
pnpm typecheck
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:agent-owner-flow:http
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
```

## 최신 인수인계 — C03/F-O09 Field 직접 문의 처리 완료·고객 재개 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 docs에 맞춰 AP/Field 화면·기능을 실제 로컬 API/DB에 연결한다. 사용자 최종 인수 테스트와 실 외부 연동은 이후에 한다. 최신 mock PTY **18991** 실행 중: AP `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field `http://localhost:3002/workspace`/API `127.0.0.1:4321`; 두 API `/health/ready`와 두 웹 HTTP 200. C03/F-O09는 `in_progress`.
- **완료 작업:** Field 직접 문의의 owner/editor `처리 완료`, 고객 확인키로 완료 원문 열람·추가 질문 재개를 DB/API/UI로 연결했다. 완료 POST 응답 유실 시 현재 상태 GET으로 복구한다. 상태 사건은 한 건/조직 JSON 내보내기에 남는다. 기존 Field 사업자→사이트 공개→직접 문의·두 예약 브라우저 흐름의 오래된 화면 선택자를 현행 시안형 UI에 맞춰 최종 전체 통과시켰다. 사진·예약/AP 전달 원본 경계는 유지했다.
- **수정 파일:** `apps/field-api/migrations/000053_inquiry_resolution_events.sql`, `apps/field-api/src/{inquiries.ts,operations-archive.ts}`, `apps/field-api/test/business-core.db.test.ts`, `apps/field-web/src/{field-api.ts,field-workspace.tsx,field-public.tsx,site.css}`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 캡처 `/tmp/field-inbox-closed-{320,1440}.png`. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 완료는 Field 직접 문의에만 적용하고 AP 전달 문의는 AP 원본 API에 맡긴다. owner 완료와 고객 질문은 Field 문의 행 잠금 및 revision으로 순서를 정한다. 같은 완료 재시도는 별도 사건/알림 없이 수렴하고 오래된 revision은 409다. 고객 재개는 메시지·상태 사건·기존 사업자 알림 의도를 한 트랜잭션으로 저장한다. 완료만으로 고객 메시지나 발송 의도를 만들지 않는다. 기존 확인키는 재개 접근을 위해 유효하다. 사이트 편집의 고정 상태 토스트가 버튼 입력을 가로막아 pointer 이벤트를 해제했다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock, 커밋 없음. `pnpm test:db:field` 구현 전 20/21 red(`revision` 없음), 최종 21/21 green(조직/권한·잘못된/오래된 revision·중복 완료·고객 재개·원장/내보내기). `pnpm --filter @fieldai/field-web test:unit` 14/14, `pnpm lint`, `pnpm typecheck`, Python `-m py_compile` exit 0. `pnpm mock:run` PTY 18991 양제품 migration/build/ready, 두 API `/health/ready`·두 웹 HTTP 200. `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http` 최종 1/1: 실제 320px 사업자 완료 응답 유실→GET 복구→고객 완료 원문/추가 질문→사업자 재조회, 사이트 공개·직접 문의/사진·두 예약·변경/취소·서비스 조건 재확인. 320/1440px 완료 캡처를 시안과 대조했고 320px 가로 넘침 0·pageerror 없음.
- **실패한 접근:** 첫 Field DB 검사는 신규 revision 부재로 의도대로 red였다. 전체 브라우저 검사의 중간 실행 세 번은 현행 예약 UI와 다른 `제안 시간 수락` 문구, 접힌 예약 관리 도구의 숨은 입력, 두 곳에 중복 표시되는 조건 재확인 시간 선택자 때문에 실패했다. 스크립트를 현재 사용자 동작/접근 가능한 정확한 이름에 맞춘 최종 실행은 1/1 통과했다. API `/health`는 정의된 경로가 아니라 404였으며 `/health/ready`가 200이다.
- **남은 작업:** 실제 저장 100건 이상 Field 직접 문의의 과거 페이지→완료/재개 E2E(목록 정렬은 위 최신 단계에서 보정됨). 200% 확대·스크린리더/전체 키보드, 시안 전체 기능 감사·제품별 정식 QA/G·사용자 최종 인수도 남았다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 전체 C03 목표 완료 아님.
- **다음 에이전트 정확한 명령:** 아래로 로컬 상태를 확인한다. 다음 작업을 시작하기 전 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md` 맨 위에 기록한다. 시안의 남은 차이를 직접 열어 비교하고 한 기능씩 API/DB까지 연결한다. 사용자 최종 인수/실 공급사 검수를 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,18p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm test:db:field
pnpm --filter @fieldai/field-web test:unit
pnpm lint
pnpm typecheck
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
```

## 최신 인수인계 — C03/A02 AP 문의 처리 완료·고객 재개 (2026-09-26)

- **현재 목표:** 시안 v3와 docs대로 AP/Field 기능·화면을 실제 API/DB에 연결하고 사용 가능한 로컬 mock 서비스를 유지한다. 사용자 최종 인수 테스트와 실 외부 연동은 나중에 한다. 최신 mock PTY **87846** 실행 중: AP `http://localhost:3001/workspace`/API `127.0.0.1:4311`, Field `http://localhost:3002/workspace`/API `127.0.0.1:4321`; 두 API `/health/ready`와 두 웹 `/workspace` HTTP 200. C03/A02는 `in_progress`.
- **완료 작업:** AP 문의함의 사업자 `처리 완료`를 owner/editor·고객 동의 human 문의의 revision 조건부 API와 화면에 연결했다. 동일 revision 재시도는 완료 사건을 중복 기록하지 않으며, 고객은 기존 확인키로 완료 원문을 읽고 추가 질문을 보내 `needs_owner`로 연다. 완료/재개 사건은 AP 전용 테이블과 한 건/조직 JSON 내보내기에 보존한다. 완료는 고객 발송/알림 의도를 만들지 않고, 추가 질문만 기존 AP 사업자 알림 의도를 만든다. 완료 요청의 응답 유실은 화면에서 현재 상태를 재조회해 복구한다.
- **수정 파일:** `apps/agent-api/migrations/000059_inquiry_resolution_events.sql`, `apps/agent-api/src/{inquiries.ts,inquiry-archive.ts}`, `apps/agent-api/test/inquiries.db.test.ts`, `apps/agent-web/src/{workspace.tsx,agent-home.css,agent-public.tsx}`, `tools/spikes/agent-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 임시 캡처 `/tmp/agent-inbox-closed-{320,1440}.png`. Field 코드/DB·제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** PRD 2.7의 완료 후 고객 질문 재개를 우선하며 고객 확인키를 완료 때 무효화하지 않는다. owner 완료와 고객 질문은 동일 AP 문의 행을 잠가 순서를 정하고 revision으로 오래된 완료 요청을 409로 막는다. 사건은 외부 발송 outbox와 분리해 AP 감사 테이블에 기록한다. 완료 뒤 사업자 답변 폼은 닫고 고객 재개 뒤 다시 표시한다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock, 커밋 없음. `pnpm test:db:agent` 구현 전 20/21 red(`revision` 없음), 최종 21/21 green(다른 조직 404/잘못된 revision 400/중복 완료·오래된 완료 409/고객 확인키 재개/상태 사건·내보내기). `pnpm --filter @fieldai/agent-web test:unit` 10/10, `pnpm lint`, `pnpm typecheck` exit 0. `pnpm mock:run` PTY 87846 양제품 migration/build/ready, 두 API/웹 HTTP 200. `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:agent-owner-flow:http` 최종 1/1: 실제 320px 사업자 완료 POST 응답 분실→상태 재조회→고객 완료 원문 열람/재개→사업자 재조회·추가 메시지 및 기존 파일 흐름. 320/1440px 완료 화면 캡처를 시안과 대조했고 320px 가로 넘침 0, 브라우저 pageerror 없음.
- **실패한 접근:** 첫 AP DB 검사는 신규 상세 revision 필드가 없어 의도대로 실패했다. 이후 최종 검사는 통과했다. 완료를 외부 고객 알림 사건으로 만들거나 완료 시 확인키를 폐기하면 PRD의 재개/접근 조건을 어겨 적용하지 않았다.
- **남은 작업:** 실제 저장 100건 이상 AP 문의→이전 페이지→고객 재개 E2E, 200% 확대·스크린리더/전체 키보드, 시안 전체 기능 감사와 제품별 정식 QA/G·사용자 최종 인수. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. 전체 C03 목표 완료 아님.
- **다음 에이전트 정확한 명령:** 다음 작업 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md` 맨 위에 먼저 기록한다. 아래로 현재 로컬 서버와 AP 흐름을 확인하고 시안의 다음 기능 차이를 조사한다. 사용자 최종 인수/실 공급사는 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,18p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm test:db:agent
pnpm --filter @fieldai/agent-web test:unit
pnpm lint
pnpm typecheck
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:agent-owner-flow:http
```

## 최신 인수인계 — C03/A02 AP 문의함 동의된 AI 이력·유입 출처 (2026-09-26)

- **현재 목표:** 시안 v3와 docs대로 AP/Field 기능·화면을 연결해 사용 가능한 로컬 mock 서비스를 유지한다. 사용자 최종 인수 테스트와 실제 외부 연동은 이후에 한다. mock PTY **66320** 실행 중, AP `localhost:3001`/API `127.0.0.1:4311`, Field `localhost:3002`/API `127.0.0.1:4321`, 양 API `/health/ready`와 양 웹 `/workspace` HTTP 200. C03/A02는 `in_progress`.
- **완료 작업:** AP owner 문의함의 `AI 기록` 탭은 고객이 동의하고 접수한 human 문의 중 AI 답변 원문이 있는 건만 표시한다. 목록·상세에 실제 AP 배포의 link/owned_embed/placement_embed 또는 직접 문의 출처를 표시한다. 익명 AI 세션(`consent_at=null,mode=ai`)과 Field 직접 준비만 된 원본(`mode=external`)은 계속 owner 목록/상세에서 제외된다. 기존 100건 키셋·권한·답변·메모·모바일 복귀는 유지한다.
- **수정 파일:** `apps/agent-api/src/inquiries.ts`, `apps/agent-api/test/{customer-consultations.db.test.ts,inquiries.db.test.ts}`, `apps/agent-web/src/{workspace.tsx,agent-home.css}`, `tools/spikes/agent-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 합성 스크립트 `/tmp/agent-inbox-pages-smoke.py`와 세 화면 캡처는 임시 파일. AP owner GET 하위 호환 필드 외 DB migration/Field/제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 시안의 AI 탭을 모든 익명 상담 원문 노출로 해석하지 않았다. 기존 AP PRD의 고객 동의·접수 경계와 `customer-consultations.db.test.ts`의 접수 전 비노출을 우선했다. `has_ai_history`는 접수된 원본의 assistant 메시지 존재, `source_kind`는 AP 서버의 deployment kind이며 고객 입력에 의존하지 않는다. 필터는 이미 불러온 문의 기준이라고 표시한다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock, 커밋 없음. `pnpm test:db:agent`는 새 필드 전 19/21 red, 구현 후 21/21 green(익명 owner 상세 404, 접수 뒤 동일 ID의 AI 질문·답변/출처, 직접 문의 출처). AP web unit 10/10, `pnpm lint`, `pnpm typecheck` exit 0. `pnpm mock:run` PTY 66320 양제품 build/ready, 양 API/웹 HTTP 200. `/tmp/fieldai-ui-venv/bin/python /tmp/agent-inbox-pages-smoke.py` exit 0: 합성 AI 필터 35건·출처/원문, 100→103/초기·추가 503 복구, 320px 목록↔대화 초점·가로 넘침 0·pageerror 0. `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:agent-owner-flow:http` 실제 로컬 가입→AP 링크/외부 위젯→고객 문의→사업자 답변·메모/서로 다른 유입 출처→고객 재열람·내보내기 1/1. 실모델 답변/출시 게이트 증거는 아니다.
- **실패한 접근:** 필드 추가 전 두 AP DB 검사가 의도대로 `source_kind`/`has_ai_history` 부재로 실패했다. 구현 뒤 최종 검사는 통과했다. 시안의 익명 AI 전체 대화를 owner에게 보이는 접근은 고객 접수 전 비노출 조건에 어긋나 적용하지 않았다.
- **남은 작업:** AP 문의의 처리 완료/후속 고객 질문 상태 전환, 실제 저장 대량 문의 E2E, 200% 확대/스크린리더/전체 키보드·시안 전체 기능 감사/정식 QA/G·사용자 최종 테스트. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; 운영 배포·고객 발송·청구 없음. C03 전체 목표 완료 아님.
- **다음 에이전트 정확한 명령:** 다음 작업 파일/요구/QA/명령을 실행 계획 맨 위에 기록하고 아래로 상태를 검증한다. 우선 AP 문의 `closed` 상태와 고객 재개를 문서/DB/API/UI에서 비교한다. 실 공급사/사용자 최종 검수는 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,17p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm test:db:agent
pnpm --filter @fieldai/agent-web typecheck
/tmp/fieldai-ui-venv/bin/python /tmp/agent-inbox-pages-smoke.py
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:agent-owner-flow:http
```

## 최신 인수인계 — C03/A02 AP 사업자 문의함 시안·100건 이후 탐색 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 docs에 맞춰 AP/Field 화면·기능을 연결하고 사용 가능한 로컬 환경을 유지한다. 사용자 최종 인수 테스트와 실 외부 연동은 나중에 한다. 최신 로컬 mock PTY **78359** 실행 중: AP `http://localhost:3001`, Field `http://localhost:3002`, API `127.0.0.1:4311/4321`; 양 API `/health/ready` 200·양 웹 `/workspace` 200 실제 확인. C03/A02는 `in_progress`.
- **완료 작업:** AP owner 문의 목록의 100건 제한을 계정 결합 `(created_at,id)` 마이크로초 키셋 `nextCursor`로 해소했다. 잘못된/다른 계정 커서는 400이다. 시안 v3 사업자 문의함의 왼쪽 검색·상태 필터/목록과 오른쪽 원본 대화·답변/메모를 실제 AP API에 연결했다. 초기/추가 페이지 503을 빈 목록으로 오인하지 않고 재시도하며 읽은 목록은 보존한다. 320px에서 대화 열기→목록 복귀 시 초점을 이동/복구한다. 부분 대시보드 집계에 `+`/조회 실패 상태를 표시한다. 연락처는 미인증, 외부 알림은 미연결로 표기한다. 오래된 AP 단위 검사 CSS import와 화면 텍스트 단언, 전체 사업자→고객 브라우저 검사의 구 화면 선택자를 실제 UI에 맞게 정리했다.
- **수정 파일:** `apps/agent-api/src/inquiries.ts`, `apps/agent-api/test/inquiries.db.test.ts`, `apps/agent-web/src/{workspace.tsx,agent-home.css,agent-public.tsx,app/layout.tsx}`, `apps/agent-web/test/home-entry.test.tsx`, `tools/spikes/agent-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 임시 합성 브라우저 `/tmp/agent-inbox-pages-smoke.py`, 캡처 `/tmp/agent-inbox-{desktop,mobile-detail,mobile-list}.png`. AP 내부 owner GET의 하위 호환 응답 추가 외 DB migration·제품 간 계약·Field 코드 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 기존 첫 100건과 응답 필드를 보존하고 PostgreSQL UTC 마이크로초 문자열·UUID를 커서에 넣는다. AP user ID를 커서에 묶되 페이지마다 현재 membership/role로 다시 검사한다. 웹 검색·필터는 불러온 목록 기준임을 표시하고, 더 보기 실패 시 기존 항목을 삭제하지 않는다. AP 원문은 AP API에서만 읽고 Field에 복제하지 않는다. 공개 상담 스타일은 Next 레이아웃이 로드해 실제 페이지와 Node 단위 검사의 렌더 책임을 분리한다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17/Field Valkey/mock, 커밋 없음. `pnpm test:db:agent`는 API 구현 전 새 목록 검사로 20/21 red(`nextCursor` 없음), 최종 21/21 green(동일 마이크로초 103건, 중복·계정/오류). AP web unit 첫 실행 8/10 실패(CSS import/구 CTA), 수정 후 10/10; `pnpm test:unit`, `pnpm lint`, `pnpm typecheck` exit 0. `pnpm mock:run` PTY 78359 양제품 build/ready, 양 API ready·웹 200. `/tmp/fieldai-ui-venv/bin/python /tmp/agent-inbox-pages-smoke.py` exit 0: 합성 100→103, 첫/추가 페이지 503 재시도, 검색·필터·상세/320px 초점·복귀, 가로 넘침 0·pageerror 0. `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:agent-owner-flow:http` 최종 1/1: 실제 가입→상담 링크/독립 외부 위젯→고객 문의→사업자 답변·메모→고객 재열람/내보내기. 이 브라우저 검사는 테스트 조직/로컬 mock이며 실 공급사 검수가 아니다.
- **실패한 접근:** 초기 AP DB 검사는 예상대로 커서 없음으로 red. AP web unit은 이전부터 공개 상담 CSS 직접 import와 오래된 홈 CTA 단언 때문에 8/10; 페이지 CSS 위치와 의도한 workspace/시안 링크 단언을 고쳐 10/10. AP 전체 브라우저 검사의 처음 4회는 시안형 공개 상담의 사업명 표시 위치, AI 질문 카드, `빠른 질문`과 질문 입력의 중복 라벨, 직접 문의 링크의 별도 헤더를 옛 선택자로 찾다가 실패했다. 실제 화면 역할에 맞춰 선택자를 수정해 마지막 전체 1/1 통과했다. 제품 기능 실패로 취급하지 않았으며 실패 명령도 위에 남겼다.
- **남은 작업:** 실제 저장 100건 이상 AP 고객 문의→사업자 이전 페이지→답변/고객 열람 전체 E2E, 200% 확대·스크린리더/전체 키보드 경로, 시안 전체 화면의 추가 기능 감사와 제품별 정식 QA/G, 사용자 최종 인수 검수. 외부 인증/LLM/알림/결제/DNS/TLS/백업은 계약·credential 부재로 `blocked_integration`. 운영 배포·고객 발송·청구 없음. C03 전체 목표와 A02를 완료 처리하지 않는다.
- **다음 에이전트 정확한 명령:** 다음 작업의 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md` 맨 위에 먼저 기록한다. 아래 명령으로 서버와 AP 문의함 상태를 확인하고 시안의 320/1440px을 다시 대조한다. 실제 저장 대량 E2E와 전체 접근성/정식 QA·실 공급사를 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,18p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm test:db:agent
pnpm test:unit
pnpm lint
pnpm typecheck
/tmp/fieldai-ui-venv/bin/python /tmp/agent-inbox-pages-smoke.py
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:agent-owner-flow:http
```

## 최신 인수인계 — C03/F-O09 Field 직접·AP 전달 문의 100건 이후 탐색 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 docs에 맞춰 AP/Field 화면·기능을 끝까지 연결하고 사용 가능한 로컬 환경을 유지한다. 사용자 최종 인수 테스트와 실 외부 연동은 나중에 한다. 최신 로컬 mock PTY **27863** 실행 중: AP `http://localhost:3001`, Field `http://localhost:3002`, API `127.0.0.1:4311/4321` 양쪽 `/health/ready` 실제 확인. C03/F-O09는 `in_progress`.
- **완료 작업:** Field owner 직접 문의와 AP 전달 문의 목록의 100건 한계를 각각 조직·목록 종류를 바인딩한 키셋 `nextCursor`로 해소했다. PostgreSQL 마이크로초 접수/수신 시각과 UUID를 커서에 보존하고 잘못된/다른 조직/다른 목록 커서를 400으로 거절한다. 문의함에서 각 출처별 이전 문의 더 보기/503 재시도를 제공하고 기존 항목을 ID 병합으로 보존한다. 첫 로드에서 이전 계정의 문의 목록·커서를 초기화한다. AP 대화 원문은 계속 AP API에서 조회하며 Field에 복제하지 않는다. 320px 제목 단어 중간 줄바꿈을 줄였다.
- **수정 파일:** 신규 `apps/field-api/src/owner-list-cursor.ts`, `apps/field-api/src/inquiries.ts`, `apps/field-api/src/bookings.ts`, `apps/field-api/test/business-core.db.test.ts`, `apps/field-api/test/integrator.db.test.ts`, `apps/field-web/src/field-workspace.tsx`, `apps/field-web/src/site.css`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 임시 브라우저 `/tmp/field-inbox-pages-smoke.py`, 캡처 `/tmp/field-inbox-pages-320.png`. API 응답에 다음 커서만 추가했고 DB migration·AP API/DB·제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 첫 100건과 기존 응답 필드를 유지한 채 `(created_at|received_at,id)` 내림차순에서 101번째로 다음 페이지 존재를 판단한다. JS Date 밀리초 손실을 피하도록 UTC 마이크로초 문자열을 SQL에서 만들어 커서에 기록한다. 종류별 커서를 분리해 Field 직접 문의 커서를 AP 전달 목록에 쓰지 못하게 한다. 웹은 직접/AP/예약 커서를 별도로 보관하고 페이지 실패 시 이미 읽은 목록을 지우지 않는다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17/Valkey/mock, Git/커밋 없음. `pnpm test:db:field`는 구현 전 두 새 테스트 `nextCursor` 부재로 19/21 red, 구현 후 기존 AP fixture 2건을 1건으로 가정한 검사 오류 20/21을 수정해 최종 21/21 통과(동일 마이크로초 103건, 순서·중복·조직·목록 종류/오류). `pnpm --filter @fieldai/field-api build`, `pnpm --filter @fieldai/field-web typecheck`, 변경 API/검사/웹 `pnpm exec eslint ...` exit 0, Field web unit 14/14. `pnpm mock:run` PTY 27863 양제품 build/ready·양 API ready. `/tmp/fieldai-ui-venv/bin/python /tmp/field-inbox-pages-smoke.py` exit 0: 합성 직접/AP 문의 각각 100→103, 첫 추가 조회 503→재시도, 오래된 상세/모바일 초점, 320px 가로 넘침 0·pageerror 0. `/tmp/fieldai-ui-venv/bin/python /tmp/field-owner-reservation-pages-smoke.py` 기존 예약 100→103/503 복구·320px 초점 회귀 exit 0. 합성 브라우저 응답은 실제 저장 E2E의 증거가 아니다.
- **실패한 접근:** 새 API 전 두 DB 검사는 예상대로 `nextCursor` 없음으로 실패했다. API 구현 후 AP 기존 fixture가 2건인 것을 1건으로 계산해 두 번째 페이지 5건을 4건으로 기대하는 검사 오류가 나왔고 실제 총건수 기준으로 고쳤다. 새 320px 캡처에서 직접 문의 제목이 단어 중간에 끊겨 CSS를 조정하고 새 빌드/브라우저로 확인했다. 최종 DB/빌드/브라우저 검사는 통과했다.
- **남은 작업:** 실제 저장 100건 이상 고객 문의/예약→사업자 문의함/답변→고객 열람 전체 E2E, 200% 확대·스크린리더/전체 키보드 경로, 제품별 전체 보안/정식 QA/G·사용자 최종 인수 검수. 외부 인증/LLM/알림/결제/DNS/TLS/백업은 계약·credential이 없어 `blocked_integration`. 운영 배포·고객 발송·청구 없음. 전체 C03 목표는 완료 처리하지 않는다.
- **다음 에이전트 정확한 명령:** 다음 작업 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md` 맨 위에 먼저 기록한다. 서버 ready를 확인하고 실제 저장 흐름과 시안 320/1440px을 다시 대조한다. 실 공급사·사용자 최종 검수를 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,15p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm test:db:field
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-api/src/owner-list-cursor.ts apps/field-api/src/inquiries.ts apps/field-api/src/bookings.ts apps/field-api/test/business-core.db.test.ts apps/field-api/test/integrator.db.test.ts apps/field-web/src/field-workspace.tsx
/tmp/fieldai-ui-venv/bin/python /tmp/field-inbox-pages-smoke.py
/tmp/fieldai-ui-venv/bin/python /tmp/field-owner-reservation-pages-smoke.py
```

## 최신 인수인계 — C03/F-O09·QA57/119 Field 모바일 문의함 초점 이동 (2026-09-26)

- **현재 목표:** 시안 v3와 docs에 맞는 AP/Field 화면·기능을 끝까지 연결한다. 사용자가 최종 인수 테스트와 실 외부 연동을 직접 할 예정이다. 최신 로컬 mock PTY **88115** 실행 중: AP `http://localhost:3001`, Field `http://localhost:3002`, API `127.0.0.1:4311/4321` 양쪽 `/health/ready`를 실제로 확인했다. C03/F-O09는 `in_progress`.
- **완료 작업:** Field 사업자 문의함 모바일 320px에서 예약·직접 문의·AP 전달 항목을 열 때 숨겨지는 목록 버튼 대신 활성 대화의 뒤로 버튼에 초점을 둔다. 뒤로 돌아오면 해당 목록 항목으로 초점을 복구하고 필터/재조회로 항목이 없으면 검색 입력으로 복귀한다. 데스크톱 선택/검색/답변 초점은 강제로 바꾸지 않는다.
- **수정 파일:** `apps/field-web/src/field-workspace.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 임시 브라우저 검사 `/tmp/field-owner-reservation-pages-smoke.py`, `/tmp/field-inbox-ui-smoke.py`의 초점 단언을 확장했다. API/DB/schema/제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 시안의 모바일 목록↔대화 전환은 화면을 숨기므로 React가 바꾼 `shownInboxKey`와 DOM을 기준으로 이동한다. 현재 활성 대화의 뒤로 버튼과 이전 선택 항목의 `data-inbox-key`만 찾는다. 760px 초과에서는 기존 초점을 보존한다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17/Valkey/mock, 커밋 없음. `/tmp/fieldai-ui-venv/bin/python /tmp/field-owner-reservation-pages-smoke.py`는 수정 전 복귀 초점 부재로 exit 1(red), 수정 뒤 exit 0: 예약 100→103건/첫 503→재시도·103번째 상세·모바일 목록↔대화 초점, 320px 가로 넘침 0·pageerror 0. `/tmp/fieldai-ui-venv/bin/python /tmp/field-inbox-ui-smoke.py` exit 0: 직접 문의/AP 전달 목록·상세/필터와 320px 뒤로/재열기 초점, 가로 넘침 0·pageerror 0. `pnpm --filter @fieldai/field-web typecheck`, `pnpm exec eslint apps/field-web/src/field-workspace.tsx` exit 0, `pnpm --filter @fieldai/field-web test:unit` 14/14. `pnpm mock:run` PTY 88115 양제품 build/ready·양 API ready. 이 단계의 합성 브라우저 응답은 실제 저장/권한 E2E의 증거가 아니다.
- **실패한 접근:** 첫 구현 뒤 두 스모크가 각각 초기 더 보기 버튼/직접 문의 대화 초점의 비동기 렌더 직전 단언에서 실패했다. DOM 상태를 기다린 후 단언하도록 임시 검사를 수정했고 두 검사를 순차 실행해 통과했다. 기능 수정 전 모바일 복귀 초점 부재는 실제 red였다.
- **남은 작업:** 200% 확대·스크린리더/전체 키보드 경로, 실제 저장 예약→문의함→답변·고객 열람 E2E, 제품별 전체 보안/정식 QA/G·사용자 최종 인수 검수. 외부 인증/LLM/알림/결제/DNS/TLS/백업은 계약·credential이 없어 `blocked_integration`. 운영 배포·고객 발송·청구 없음. 전체 C03 목표는 완료 처리하지 않는다.
- **다음 에이전트 정확한 명령:** 다음 작업 파일 범위/요구/QA/명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md` 맨 위에 기록한다. 아래 명령으로 서버와 본 단계 상태를 확인하고, 실제 저장 흐름과 시안 320/1440px을 다시 대조한다. 미실행·실공급사 검수는 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,13p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-web/src/field-workspace.tsx
/tmp/fieldai-ui-venv/bin/python /tmp/field-owner-reservation-pages-smoke.py
/tmp/fieldai-ui-venv/bin/python /tmp/field-inbox-ui-smoke.py
```

## 최신 인수인계 — C03/F07·F-O09 Field 예약 목록 100건 이후 탐색 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 docs에 맞는 AP/Field 실제 기능을 끝까지 연결한다. 사용자가 최종 인수 테스트와 실 외부 연동을 직접 할 예정이다. C03/F07/F-O09는 `in_progress`. 로컬 mock PTY **48138** 실행 중이며 AP `http://localhost:3001`, Field `http://localhost:3002`, API `127.0.0.1:4311/4321` 양쪽 `/health/ready`를 실제로 확인했다.
- **완료 작업:** Field owner 예약 GET의 최근 100건 한계를 조직 범위의 고정 100건 키셋 페이지/`nextCursor`로 해소했다. `(created_at,id)` 내림차순, PostgreSQL 마이크로초 시각을 커서에 보존, 다른 조직/형식 오류 커서는 400. 사업자 문의함과 예약·일정 양쪽에 이전 예약 더 보기/503 뒤 재시도를 연결했다. 문의함 목록은 시안 v3처럼 독립 스크롤하여 오래된 예약을 눌러도 오른쪽 상세가 바로 보인다. 아직 다음 페이지가 있으면 오늘 화면·예약 목록에 부분 집계 `+`를 표시한다. AP 출처 예약은 Field 직접 대화 목록에서 제외한다.
- **수정 파일:** `apps/field-api/src/bookings.ts`, `apps/field-api/test/bookings.db.test.ts`, `apps/field-web/src/field-api.ts`, `apps/field-web/src/field-booking.tsx`, `apps/field-web/src/field-workspace.tsx`, `apps/field-web/src/site.css`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API 응답에 선택적 다음 커서 추가만 했고 migration·AP·제품 간 계약 변경 없음. Git 저장소/커밋 없음. 임시 브라우저 검사 `/tmp/field-owner-reservation-pages-smoke.py`, 캡처 `/tmp/field-owner-reservation-pages-{1440,320}.png`.
- **핵심 설계 결정:** 첫 페이지는 기존 100건으로 하위 호환하고 101번째 존재로 다음 커서만 노출한다. 커서에 조직 ID를 넣어 다른 조직에서 거부한다. JS Date의 밀리초 변환은 DB 마이크로초를 잘라 누락을 만들 수 있어 SQL UTC 마이크로초 문자열을 커서에 직접 기록한다. Field 두 화면은 페이지를 ID로 병합하며 실패 시 이미 읽은 예약을 유지한다. 시안의 문의함처럼 목록·대화 스크롤 영역을 분리한다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17/Valkey/mock, Git/커밋 없음. `pnpm test:db:field`는 구현 전 19/20(red, `nextCursor` 없음), 구현 후 20/20 통과(103건 동일 마이크로초 시각·순서·중복 없음·다른 조직/잘못된 커서). `pnpm --filter @fieldai/field-api build`, `pnpm --filter @fieldai/field-web build`, `pnpm --filter @fieldai/field-web typecheck`, 변경 TS/TSX `pnpm exec eslint ...` exit 0. `pnpm --filter @fieldai/field-web test:unit` 14/14. 새 `pnpm mock:run` PTY 48138 양제품 build/ready, 양 API ready. `/tmp/fieldai-ui-venv/bin/python /tmp/field-owner-reservation-pages-smoke.py` exit 0: 합성 페이지 100→103, 첫 503 뒤 재시도, 103번째 상세 화면 내 표시, 예약·일정 100→103, 320px 가로 넘침 0·pageerror 0. `/tmp/fieldai-ui-venv/bin/python /tmp/field-inbox-ui-smoke.py` 기존 직접/AP 문의함 흐름 exit 0. 합성 브라우저 응답은 실제 저장 E2E의 증거가 아니다.
- **실패한 접근:** 첫 DB 검사는 기능 부재로 실패했다. 첫 브라우저 스모크는 320px에서 숨겨진 데스크톱 예약 메뉴를 눌러 timeout이 났고 모바일 메뉴로 검사 경로를 고쳤다. 첫 103번째 예약 캡처는 전체 페이지가 긴 목록을 따라 스크롤되어 상세가 화면 위에 남았다. 시안의 내부 스크롤을 적용하고 상세가 viewport에 있는지 재검사해 통과했다. `pnpm --filter @fieldai/field-web lint`는 패키지에 스크립트가 없어 exit 1; 루트 `pnpm exec eslint`로 변경 파일을 검사해 exit 0.
- **남은 작업:** 실제 저장 예약→101건 이상→양 화면 탐색/답변 전체 E2E, 200% 확대·키보드/스크린리더·전체 보안/정식 QA/G, 사용자 최종 인수 테스트. 외부 인증/LLM/알림/결제/DNS/TLS/백업은 계약·credential이 없어 `blocked_integration`. 운영 배포·고객 발송·청구 없음. C03/F07/F-O09 및 전체 제품 목표는 완료 처리하지 않는다.
- **다음 에이전트 정확한 명령:** 다음 작업 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md` 맨 위에 먼저 기록한다. 로컬 서버가 살아 있는지 아래 ready 명령으로 확인한다. 이후 실제 저장 예약 전체 흐름을 검수할 때 제품별 DB/권한과 고객 확인키를 사용하고 합성 브라우저 결과와 구분한다. 실 공급사/사용자 최종 테스트를 통과 처리하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,14p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm test:db:field
pnpm --filter @fieldai/field-web test:unit
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-api/src/bookings.ts apps/field-api/test/bookings.db.test.ts apps/field-web/src/field-api.ts apps/field-web/src/field-booking.tsx apps/field-web/src/field-workspace.tsx
/tmp/fieldai-ui-venv/bin/python /tmp/field-owner-reservation-pages-smoke.py
/tmp/fieldai-ui-venv/bin/python /tmp/field-inbox-ui-smoke.py
```

## 최신 인수인계 — C03/F07·F-O09 Field 사업자 문의함 직접 예약 대화 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 docs대로 AP/Field 화면·기능을 끝까지 연결한다. 사용자 최종 인수 테스트와 실 외부 공급사 연동은 나중에 한다. 최신 mock PTY **15330** 실행 중: AP `http://localhost:3001`, Field `http://localhost:3002`, API `127.0.0.1:4311/4321` 양쪽 ready 확인.
- **완료 작업:** 기존 Field 사업자 문의함의 직접 문의/AP 전달 목록에 `source=public` 직접 예약을 추가했다. 예약을 고르면 owner 세션·조직 권한의 Field GET으로 고객 요청·추가 메시지와 사업자 답변을 읽고, 같은 메시지 ID의 Field POST/원문 대조로 답변한다. 예약 제안·확정 등 상태 변경은 기존 예약·일정 화면으로 이동한다. 고객 추가 메시지 내부 알림은 목록에 있는 직접 예약이면 문의함 대화로 연다. 예약 목록·상세 GET 실패는 빈 기록이 아닌 재시도 안내로 표시하며 기존 문의/AP 출처 흐름을 유지한다. 1440/320px 시안/실제 이미지를 대조했고 모바일 제목을 한 줄로 맞췄다.
- **수정 파일:** `apps/field-web/src/field-workspace.tsx`, 신규 `apps/field-web/src/field-owner-reservation-inbox.tsx`, `apps/field-web/src/field-booking.tsx`, `apps/field-web/src/site.css`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Field/AP API·DB/schema·제품 간 계약 변경 없음. Git 저장소/커밋 없음. 임시 비교/브라우저 검사는 `/tmp/field-owner-reservation-inbox-smoke.py`와 `/tmp/field-owner-reservation-inbox-{reference,actual}-{1440,320}.png`.
- **핵심 설계 결정:** 목록에서 예약·일정으로만 보내는 방식은 시안의 문의함 대화와 맞지 않아, 문의함 오른쪽에 독립 예약 대화 컴포넌트를 배치했다. 고객 요청/추가 메시지는 대화, 예약 상태·제안은 별도 처리 정보로 구분한다. AP 출처 예약은 Field 직접 대화 목록에서 제외하며 AP 원본·알림 소유권을 유지한다. 초기 예약 목록은 기존 예약 패널 GET 결과를 공유해 중복 조회를 피하고, 문의함 오류 재시도/알림 이동 때만 별도 GET을 쓴다. 최근 100건 밖 예약은 현재 owner 목록 API가 내주지 않으므로 이 화면에서 찾을 수 없다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock, 커밋 없음. `/tmp/fieldai-ui-venv/bin/python /tmp/field-owner-reservation-inbox-smoke.py`는 구현 전 예약 항목 부재로 red, 최종 exit 0: 합성 목록·상세 GET 503→재시도, 답변 POST 응답 유실 뒤 GET에 원문 1건 확인(POST 1), AP 출처 예약 목록 제외, 320px 목록 복귀/관리 화면 이동, 고객 메시지 알림→문의함 상세, 가로 넘침 0·pageerror 0. `/tmp/fieldai-ui-venv/bin/python /tmp/field-inbox-ui-smoke.py` 기존 직접 문의/AP 전달 상세·필터·모바일 복귀 exit 0. `pnpm --filter @fieldai/field-web test:unit` 14/14, `pnpm --filter @fieldai/field-web typecheck`, 변경 TSX ESLint exit 0. 최종 `pnpm mock:run` PTY **15330** 양제품 API/웹 build·ready, 양 API `/health/ready` ready. 합성 브라우저 응답은 실제 저장/권한 증거가 아니다. 이 단계에는 API/DB 수정이 없어 Field DB 전체 검사는 재실행하지 않았다.
- **실패한 접근:** 임시 스모크가 구형 첫 조직 문구를 기다려 timeout 났고 현재 화면 제목으로 고쳤다. 첫 red는 실제 기능 부재였다. 예약 관리 화면까지 연 뒤 동일 본문이 숨겨진 달력 상세와 문의함 양쪽에 있어 Playwright strict locator가 실패했고 문의함 영역으로 범위를 한정했다. 컴파일/최종 브라우저 검사의 제품 오류는 없었다.
- **남은 작업:** 실제 저장 예약→문의함→사업자 답변→고객 열람 전체 E2E, 최근 100건 밖 예약 탐색/페이지 처리, 200% 확대·키보드/스크린리더, 전체 보안·정식 QA/G·사용자 최종 검수는 남았다. 실 인증/LLM/외부 알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F07/F-O09 `in_progress`. 운영 배포/고객 발송/청구 없음.
- **다음 에이전트 정확한 명령:** 다음 범위의 파일·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md` 맨 위에 기록한다. 살아 있는 mock **15330**을 ready로 확인하고 시안/실제 1440/320px을 비교한다. API/DB를 바꿀 때는 제품별 격리 검사와 계약/권한 경계를 다시 확인한다. 미실행 검사/실 공급사를 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,22p' docs/technical/PHASE_2_EXECUTION_PLAN.md
/tmp/fieldai-ui-venv/bin/python /tmp/field-owner-reservation-inbox-smoke.py
/tmp/fieldai-ui-venv/bin/python /tmp/field-inbox-ui-smoke.py
pnpm --filter @fieldai/field-web test:unit
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-web/src/field-workspace.tsx apps/field-web/src/field-owner-reservation-inbox.tsx apps/field-web/src/field-booking.tsx
```

## 최신 인수인계 — C03/F07 Field 직접 예약 추가 대화 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 docs의 AP/Field 화면·기능을 계속 맞춘다. 고객·사업자/매체/관리자 시안을 수시로 대조한다. 사용자가 최종 인수 테스트와 실 외부 연동을 나중에 한다. 최신 로컬 mock PTY **61671** 실행 중: AP `http://localhost:3001`, Field `http://localhost:3002`, API `127.0.0.1:4311/4321`; 두 API ready 확인.
- **완료 작업:** Field `source=public` 예약의 추가 메시지/사업자 답변을 Field 원장·확인키/owner 조직 권한 POST·GET·알림 outbox/상태·월 사용량·예약/조직 내보내기에 연결했다. 예약 상태 revision과 점유/확정은 메시지로 변경하지 않는다. 고객 예약 제목을 시안의 “사업장과의 대화”로 맞추고 중앙 카드·추가 말풍선/입력, 사업자 예약 상세 답변을 1440/320px에서 확인했다. 고객 POST 응답 유실은 같은 메시지 ID로 재조회·재시도하고 새로고침 시 1시간 세션 메타데이터로 원본을 복구한다. `external_ap` 예약은 Field 메시지 작성을 거절하고 AP 대화 원본을 사용한다.
- **수정 파일:** `apps/field-api/migrations/000051_reservation_messages.sql`, 신규 `000052_reservation_message_notification_preserve_external.sql`, `apps/field-api/src/{bookings.ts,reservation-export.ts,operations-archive.ts,usage.ts}`, `apps/field-api/test/{bookings.db.test.ts,usage.db.test.ts}`, `apps/field-web/src/{field-api.ts,field-booking.tsx,field-usage.tsx,field-workspace.tsx,site.css}`, 신규 `apps/field-web/src/pending-reservation-message.ts`, `apps/field-web/test/pending-reservation-message.test.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. AP domain/API/DB·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 예약 원문은 Field DB만 소유한다. 고객은 예약 확인키, 사업자는 Field owner 세션·조직으로만 접근한다. client UUID 재제출은 동일 actor/본문이면 같은 원본 200, 내용이 다르면 409이며 시간/총량 상한을 둔다. 고객 글은 사업자 내부 알림을 제공하고 사업자 답변은 고객이 Field에서 읽을 수 있지만 실제 외부 발송은 `blocked_integration`이다. 원본/알림 상태를 export/usage에 반영한다. 고객 브라우저는 원문 대신 확인키·메시지 ID·본문 해시만 잠시 저장한다. AP 출처 예약과 Field 직접 예약은 대화/알림 발송 주체를 섞지 않는다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock, 커밋 없음. 신규 DB 예약/사용량 red→green; `pnpm test:db:field` 격리 DB 19/19 exit 0(최종 Field DB 코드 뒤), `pnpm --filter @fieldai/field-api build` exit 0, `pnpm --filter @fieldai/field-web exec tsx --test test/pending-reservation-message.test.tsx` 1/1 exit 0, `pnpm --filter @fieldai/field-web typecheck`·변경 TS/TSX ESLint exit 0. 최종 `pnpm mock:run` PTY **61671** 양제품 migration/API/웹 build·ready, 양 API `/health/ready` ready. `/tmp/fieldai-ui-venv/bin/python /tmp/field-reservation-message-ui-smoke.py` 최종 exit 0: 합성 고객 1440/320px POST 201/ACK 유실·GET 503→새로고침 대조, 3 POST·가로 넘침 0·pageerror 0, `external_ap` 작성 버튼 없음. `/tmp/fieldai-ui-venv/bin/python /tmp/field-reservation-owner-message-ui-smoke.py` exit 0: 합성 사업자 답변 POST 1, 320px 가로 넘침 0·pageerror 0. 캡처 `/tmp/field-reservation-message-{320,1440}.png`, `/tmp/field-reservation-owner-message-{320,1440}.png`; 시안 캡처 `/tmp/field-reservation-followup-reference-{320,1440}.png`와 대조. 합성 화면은 실제 저장/권한 증거가 아니며 그 부분은 격리 DB 검사 범위다.
- **실패한 접근:** migration 000051의 audience CHECK 교체가 기존 `field.external_request.accepted`를 빠뜨려 첫 Field 전체 DB 검사 18/19 실패. 적용된 migration을 재작성하지 않고 000052로 기존 알림 audience를 보존해 19/19 통과했다. 새로고침 복구 첫 Chromium 검사는 정상 UUID를 거절하는 검사식 때문에 실패했고 UUID 4·12자리 그룹을 수정, 브라우저 재실행과 단위 검사 1/1로 확인했다. 사업자 임시 브라우저 스크립트는 textarea와 목록의 같은 본문 선택이 겹쳐 목록 선택자로 고친 뒤 통과했다.
- **남은 작업:** 다른 시안 화면/업무 흐름의 실제 데이터·시각 차이를 계속 대조한다. 고객/사업자 실제 전체 예약 E2E, 200% 확대·키보드/스크린리더, 전체 계약/보안·정식 QA/G·사용자 최종 인수 테스트는 남았다. 실 인증/LLM/외부 알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F07 `in_progress`. 운영 배포/고객 발송/청구 없음.
- **다음 에이전트 정확한 명령:** 다음 UI/기능 범위를 정해 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일/요구·QA/명령을 먼저 기록한다. mock **61671**이 살아 있으면 아래 ready로 확인하고 시안/실제 1440/320px을 비교한다. 서비스가 중단됐으면 `pnpm mock:run`을 새 PTY로 실행한다. 최종 인수/공급사 검사를 실행하지 않았다면 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,24p' docs/technical/PHASE_2_EXECUTION_PLAN.md
/tmp/fieldai-ui-venv/bin/python /tmp/field-reservation-message-ui-smoke.py
/tmp/fieldai-ui-venv/bin/python /tmp/field-reservation-owner-message-ui-smoke.py
pnpm --filter @fieldai/field-web exec tsx --test test/pending-reservation-message.test.tsx
pnpm --filter @fieldai/field-web typecheck
pnpm test:db:field
```

## 최신 인수인계 — C03/F07 Field 고객 예약 후속 상태·제안 화면 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 docs대로 AP/Field 화면과 기능을 계속 연결한다. 사용자가 최종 인수 테스트와 외부 공급사 연동을 나중에 한다. 현재 로컬 mock PTY **13041** 실행 중: AP `http://localhost:3001`, Field `http://localhost:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** 시안 예약 대화와 기존 Field 예약 후속 화면을 1440/320px 비교했다. 고객 확인키 GET에 접수 당시 승인 사업장명을 추가하고 사업명·상태 배지·요청/접수 가격·제안 시간·실제 요청 본문/예약 사건을 중앙 카드에 표시한다. 제안 시간 동의는 기존 Field API에 연결하고 사업자 확정 전 상태를 명시한다. 확인키/사진/조건 재검수/변경·취소/알림 경로는 접이식 영역에 유지한다.
- **수정 파일:** `apps/field-api/src/bookings.ts`, `apps/field-api/test/bookings.db.test.ts`, `apps/field-web/src/{field-api.ts,field-booking.tsx,site.css}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. AP/DB migration/제품 간 계약 변경 없음. Git 저장소/커밋 없음. 임시 비교/스모크는 `/tmp/field-reservation-followup-{compare,smoke}.py`.
- **핵심 설계 결정:** 이름은 해당 예약의 `catalog_revision` 승인본 스냅샷으로 표시한다. 확인키가 맞는 Field GET만 사업장명을 응답한다. 예약 사건은 상태 기록으로만 보여 주며 원장에 없는 사업자 메시지나 발송 성공을 만들어 내지 않는다. 제안 수락 POST 응답 뒤 GET 동안 제목 이름을 유지하고, 수락 상태는 최종 예약 확정으로 표시하지 않는다. 시안의 예약 안 추가 자유 메시지는 현재 예약 원장/API가 없어 다음 기능 범위다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/field-web typecheck`, `pnpm exec eslint apps/field-web/src/field-booking.tsx apps/field-web/src/field-api.ts apps/field-api/src/bookings.ts apps/field-api/test/bookings.db.test.ts` exit 0. 직전 `pnpm --filter @fieldai/field-api build` exit 0, 이번 `pnpm mock:run` PTY **13041**에서 양제품 migration/API/웹 build·ready exit 0; 양 API `/health/ready` ready, Field 예약 URL 200. `pnpm test:db:field` 격리 Field DB 19/19 exit 0, 기존 예약의 승인 당시 이름이 새 승인 상호로 바뀌지 않는 단언 포함. `/tmp/fieldai-ui-venv/bin/python /tmp/field-reservation-followup-compare.py` exit 0, 시안/실제 1440/320px 캡처와 가로 넘침 0·pageerror 0. `/tmp/fieldai-ui-venv/bin/python /tmp/field-reservation-followup-smoke.py` exit 0: 합성 320px 제안 POST 200/409 각 1회·신청/확정 상태·관리 영역 열기·가로 넘침 0·pageerror 0. 캡처 `/tmp/field-reservation-followup-{reference,actual}-{1440,320}.png`. 합성 브라우저 응답은 실제 저장/권한 증거가 아니다.
- **실패한 접근:** 앱 컴파일·DB·최종 합성 화면 검사의 실패 없음. 비교 스크립트는 새 카드 제목/사업명에 맞춰 대기 조건을 수정했다. 최종 결과 미상 네트워크/새 UI의 전체 실제 예약 흐름은 이번 단계에서 재실행하지 않았다.
- **남은 작업:** 시안의 예약 안 추가 자유 메시지를 Field 직접 예약 원장/고객·사업자 권한/알림 상태/복구까지 구현하고, 다른 화면도 시안과 계속 대조한다. 200% 확대·키보드/스크린리더, 전체 E2E/계약/보안·정식 QA/G·사용자 최종 인수 테스트는 남았다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F07 `in_progress`. 운영 배포/고객 발송/청구 없음.
- **다음 에이전트 정확한 명령:** 다음 기능 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 현재 mock 세션이 살아 있으면 ready를 확인한다. 예약 메시지 기능을 시작할 때 Field 직접 예약과 AP 출처 대화를 구분하고 이중 발송을 만들지 않는다. 미실행 검사를 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
/tmp/fieldai-ui-venv/bin/python /tmp/field-reservation-followup-compare.py
/tmp/fieldai-ui-venv/bin/python /tmp/field-reservation-followup-smoke.py
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-web/src/field-booking.tsx apps/field-web/src/field-api.ts apps/field-api/src/bookings.ts apps/field-api/test/bookings.db.test.ts
pnpm test:db:field
# 사용자 최종 인수 테스트 단계
pnpm test:spike:field-owner-flow:http
pnpm test:security
```

## 최신 인수인계 — C03/F05·F06 Field 고객 후속 문의 대화 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 docs 기능을 제품별 서비스에 계속 연결한다. 사용자가 최종 인수 테스트/외부 공급사 연동을 나중에 한다. 로컬 mock PTY **30112** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** 시안 `customer/conversation`과 실제 Field 문의 대화를 1440/320px 비교했다. 확인키 인증 GET에 접수 당시 승인 카탈로그 사업명·Field 조직 ID를 추가해 고객 헤더/대화 제목에 사용하고, 접수 ID·연락처 미인증·짧은 상태 배지를 표시했다. 고객/사업자 원문, 내부 메모 비노출, 추가 질문/사진/결과 미상 복구는 유지했다. 접수 완료 뒤 사진 첨부 중에는 후속 링크를 잠시 감춰 파일 유실 이동을 막고 완료/실패 뒤 다시 열었다. 직전 접수 완료/후속 확인키 이동은 아래 인수인계에 있다.
- **수정 파일:** `apps/field-api/src/inquiries.ts`, `apps/field-api/test/business-core.db.test.ts`, `apps/field-web/src/{field-api.ts,field-public.tsx,field-booking.tsx,field-receipt.tsx,receipt-handoff.ts,site.css}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. AP/DB migration/제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 고객 대화 제목은 해당 접수의 `catalog_revision`에 연결된 승인 사업명으로 고정한다. 현재 미승인 사업 초안이나 AP 사업명을 섞지 않는다. 사업명/조직 ID는 올바른 확인키로 원문을 열 때만 응답하며, 고객 화면은 서버 응답이 없는 합성/구형 형태에서는 서비스명 제목으로 대체한다. 고객 사진 첨부 요청은 30초 뒤 결과 미상으로 풀어 같은 원본에서 재시도할 수 있게 했다. 실제 30초 네트워크 정지는 이번 스모크에서 재현하지 않았다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/field-api build`, `pnpm --filter @fieldai/field-web typecheck`, `pnpm exec eslint apps/field-api/src/inquiries.ts apps/field-api/test/business-core.db.test.ts apps/field-web/src/field-api.ts apps/field-web/src/field-public.tsx`, 마지막 `pnpm exec eslint apps/field-web/src/field-receipt.tsx apps/field-web/src/field-public.tsx apps/field-web/src/field-booking.tsx` exit 0. `pnpm test:db:field` 격리 Field DB 19/19, 기존 확인키·권한/사업자 답변과 새 승인 사업명/미승인 변경 뒤 이름 불변 단언 통과. 최종 `pnpm mock:run` PTY **30112** 양제품 migration/build/ready·양 API `/health/ready` ready. `/tmp/fieldai-ui-venv/bin/python /tmp/field-conversation-compare.py` 시안/합성 GET 1440/320px 비교 exit 0, 320px 가로 넘침 0·pageerror 0·배지 한 줄 표시를 이미지 확인했다. 최종 `/tmp/fieldai-ui-venv/bin/python /tmp/field-receipt-smoke.py`도 exit 0로 문의/예약 201·503·사진 첨부 지연 중 이동 차단과 503 뒤 재시도·후속 GET을 확인했다. 캡처 `/tmp/field-conversation-{reference,actual}-{1440,320}.png`. 전체 E2E/보안·사용자 최종 검수는 미실행.
- **실패한 접근:** 컴파일/DB/합성 대화 스모크 실패 없음. 기존 대화 제목이 서비스명뿐이고 접수번호/사업명 없는 구조라 시안과 달랐다. 모바일 긴 상태 배지가 제목 아래로 내려가 짧은 배지/제목 너비를 조정했다.
- **남은 작업:** 예약 후속 상태 화면과 다른 역할 화면을 시안과 계속 대조한다. 200% 확대·키보드/스크린리더, 전체 E2E/계약/보안·정식 QA/G·사용자 최종 검수는 남았다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F05/F06 `in_progress`. 운영 배포/고객 발송/청구 없음.
- **다음 에이전트 정확한 명령:** 다음 작업 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 현재 mock 세션이 살아 있으면 ready를 확인하고, 없으면 `pnpm mock:run`을 새 세션으로 실행한다. 미실행 검사를 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,50p' docs/technical/PHASE_2_EXECUTION_PLAN.md
/tmp/fieldai-ui-venv/bin/python /tmp/field-conversation-compare.py
/tmp/fieldai-ui-venv/bin/python /tmp/field-receipt-smoke.py
pnpm --filter @fieldai/field-api build
pnpm --filter @fieldai/field-web typecheck
pnpm test:db:field
# 사용자 최종 인수 테스트 단계
pnpm test:spike:field-owner-flow:http
pnpm test:security
```

## 최신 인수인계 — C03/F05·F07 Field 고객 접수 완료 화면 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 docs의 화면/기능을 독립 AP/Field 서비스에 끝까지 연결한다. 사용자가 최종 인수 테스트와 외부 공급사 연동을 나중에 수행한다. 이 단계의 mock PTY는 **93077**이었고 현재 실행 세션은 맨 위 인수인계에 기록한다.
- **완료 작업:** 시안 `customer/success`와 현행 문의 접수 후 화면을 1440/320px 비교했다. 문의·예약이 실제 201/200·복구 응답을 받은 뒤 전용 중앙 완료 카드에 서버 접수 ID/확인키·상태 안내·후속 링크를 보여 준다. 같은 탭 후속 링크는 확인키를 2분 만료·1회 소비 세션 값으로 전달하고 Field 문의/예약 원본 GET을 실행한다. 사진 업로드 실패 재시도와 수동 확인키 입력을 유지한다.
- **수정 파일:** `apps/field-web/src/field-public.tsx`, `apps/field-web/src/field-booking.tsx`, `apps/field-web/src/site.css`, 신규 `apps/field-web/src/field-receipt.tsx`, `apps/field-web/src/receipt-handoff.ts`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. API·DB migration·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 성공 카드는 Field 서버의 접수 응답이 있을 때만 나타난다. 예약 요청은 확정이 아니고 알림 공급사 발송 성공을 주장하지 않는다. 확인키를 URL/공유 링크에 넣지 않으며 탭 저장소를 쓸 수 없거나 후속 조회가 실패하면 고객이 완료 화면의 키를 복사·입력할 수 있다. 시안의 로컬 대화 원장은 Field 원본 GET으로 대체했다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/field-web typecheck`, `pnpm exec eslint apps/field-web/src/field-public.tsx apps/field-web/src/field-booking.tsx apps/field-web/src/field-receipt.tsx apps/field-web/src/receipt-handoff.ts` exit 0. 최종 `pnpm mock:run` PTY **93077** 양제품 migration/build/ready·양 API `/health/ready` ready. `/tmp/fieldai-ui-venv/bin/python /tmp/field-success-compare.py`의 시안/실제 문의 완료 1440/320px 캡처를 대조했다. `/tmp/fieldai-ui-venv/bin/python /tmp/field-receipt-smoke.py` 최종 exit 0: 합성 승인 카탈로그에서 문의/예약 POST 201·503의 1440/320px 완료·실패 분리, 320px 사진 첨부 503 뒤 재시도, 문의/예약 완료 링크→확인키 인증 Field GET·키 1회 삭제, 가로 넘침 0·pageerror 0. 캡처 `/tmp/field-success-{reference,actual}-{1440,320}.png`, `/tmp/field-reservation-success-{1440,320}.png`. 합성 결과는 실제 저장/권한 증거가 아니다. 전체 E2E/DB/계약/보안·정식 QA/사용자 최종 인수 테스트는 이번 변경 뒤 미실행.
- **실패한 접근:** 시스템 `python3 /tmp/field-success-compare.py`는 Playwright 미설치로 `ModuleNotFoundError`였고 기존 UI 가상환경의 Python으로 재실행해 통과했다. 첫 UI는 폼 안 작은 확인키 배너라 시안의 독립 완료 화면과 달라 새 카드로 교체했다. 앱의 최종 빌드/합성 스모크 실패는 없다.
- **남은 작업:** 다른 역할 화면과 docs 기능을 시안과 계속 대조한다. 200% 확대·키보드/스크린리더, 실제 Field 저장→대화/예약 확정·제품별 독립·전체 DB/계약/보안·정식 QA/G·사용자 최종 검수는 남았다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F05/F07 `in_progress`. 운영 배포/고객 발송/청구 없음.
- **다음 에이전트 정확한 명령:** 다음 작업의 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. mock PTY가 살아 있으면 ready를 확인하고, 없으면 `pnpm mock:run` 새 세션을 실행한다. 미실행 검사를 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,45p' docs/technical/PHASE_2_EXECUTION_PLAN.md
rg -n 'function leadSuccess3|function customerConversation3' reference/field_ui_prototype_v3.html
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-web/src/field-public.tsx apps/field-web/src/field-booking.tsx apps/field-web/src/field-receipt.tsx apps/field-web/src/receipt-handoff.ts
/tmp/fieldai-ui-venv/bin/python /tmp/field-receipt-smoke.py
# 사용자 최종 인수 테스트 단계
pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm test:security
```

## 최신 인수인계 — C03/F07 Field 고객 희망시간 예약 (2026-09-26)

- **현재 목표:** 시안 v3와 docs 기능을 독립 AP/Field 서비스에 끝까지 연결한다. 사용자가 최종 인수 테스트·외부 공급사 연동을 나중에 수행한다. 로컬 mock PTY **43869** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** Field 공개 고객 예약 화면을 시안 v3와 1440/320px 비교했다. 희망시간 제출형에 날짜·시간대 선택을 추가하고 기존 자유 입력을 유지했다. 두 입력 형태 모두 Field 기존 `preferredTimeText` 요청으로 접수되며 공개 요약에 희망 시간이 반영된다. 시간표 선택형의 현재 가능 시간/사업자 확정 흐름은 유지했다. 직전 AP 상담 링크 시안 정합은 아래 인수인계에 있다.
- **수정 파일:** `apps/field-web/src/field-booking.tsx`, `apps/field-web/src/field-public.tsx`, `apps/field-web/src/site.css`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. API·DB migration·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 날짜·시간대는 요청 선호일 뿐 가용성/확정 보증이 아니다. 기존 자유 문장만으로도 신청할 수 있어 이전 입력/테스트 흐름을 유지한다. 고객 요약은 구조화된 희망 시간 또는 ‘직접 입력’ 상태만 보여 주고 자유 문장 원문은 요약에 복제하지 않는다. Field 서비스 승인본의 예약 방식과 서버 제출 계약을 그대로 사용한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/field-web typecheck`, `pnpm exec eslint apps/field-web/src/field-booking.tsx apps/field-web/src/field-public.tsx` exit 0. 최종 `pnpm mock:run` PTY **43869** 양제품 migration/build/ready, 양 API `/health/ready` ready. `/tmp/field-booking-compare.py`에서 시안/실제 1440/320px 캡처를 대조했고 `/tmp/field-preferred-time-smoke.py`의 합성 승인 카탈로그/예약 POST 503으로 구조화 선택 1440/320px와 기존 자유 입력 320px의 `preferredTimeText` 정확한 요청 각 1회·요약·가로 넘침 0·pageerror 0, 최종 exit 0. 캡처 `/tmp/field-booking-reference-{1440,320}.png`, `/tmp/field-booking-actual-{1440,320}.png`. 합성 응답은 실제 저장/확정/DB·권한 증거가 아니다. 전체 E2E/DB/계약/보안·정식 QA/사용자 인수 테스트는 이번 변경 뒤 미실행.
- **실패한 접근:** 첫 임시 스모크에서 부분 일치 `연락처` 라벨이 전화 입력과 동의 체크박스 설명에 모두 걸려 Playwright strict locator 오류였다. 정확 일치 선택자로 고친 최종 실행은 exit 0. 제품 오류는 확인되지 않았다.
- **남은 작업:** 다른 고객/사업자/매체/관리자 화면과 docs 기능을 시안과 계속 비교하고 끊긴 흐름을 연결한다. 200% 확대·키보드/스크린리더, 실제 예약 저장/확정·제품별 독립·전체 DB/계약/보안·정식 QA/G·사용자 최종 검수는 남아 있다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F07 `in_progress`. 운영 배포/고객 발송/청구 없음.
- **다음 에이전트 정확한 명령:** 다음 작업 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. mock PTY가 살아 있으면 ready를 확인하고, 없으면 `pnpm mock:run` 새 세션으로 시작한다. 미실행 검사를 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,55p' docs/technical/PHASE_2_EXECUTION_PLAN.md
rg -n 'function intake3|function publicBooking' reference/field_ui_prototype_v3.html
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-web/src/field-booking.tsx apps/field-web/src/field-public.tsx
/tmp/fieldai-report-venv/bin/python /tmp/field-preferred-time-smoke.py
# 사용자 최종 인수 테스트 단계
pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm test:security
```

## 최신 인수인계 — C03/A02·A05 AP 고객 상담 링크 (2026-09-26)

- **현재 목표:** 시안 v3와 docs 기능을 독립 AP/Field 서비스에 끝까지 연결한다. 사용자가 최종 인수 테스트와 외부 공급사 연동을 나중에 수행한다. 로컬 mock PTY **28386** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** AP 비회원 상담 링크 `/consult/[publicId]`를 시안의 사업자 헤더·중앙 대화 카드·승인 FAQ 빠른 질문·질문 입력·사람 문의 버튼으로 구성했다. 사진 입력을 사람 문의 양식으로 옮겼다. 1440/320px 실제 화면을 시안과 이미지 대조했다. 기존 상담 결과 미상 복구·사람 문의 접수·선택적 Field 요청 로직은 유지했다.
- **수정 파일:** `apps/agent-web/src/agent-public.tsx`, 신규 `apps/agent-web/src/agent-public.css`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. AP/Field API·DB migration·공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 빠른 질문은 AP의 서버 승인 FAQ에서만 만들고 기존 멱등 AI 경로로 즉시 제출한다. 질문만으로 이름/연락처를 요구하지 않고 사람 문의에서만 접수한다. 사진은 AP 비공개 원본 첨부이며 AI 분석이나 Field 자동 전달을 하지 않는다. 시안의 Field 홈페이지 링크는 AP 단독 사업장에 실제 URL이 없으므로 임의로 만들지 않았다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/agent-web typecheck`, `pnpm exec eslint apps/agent-web/src/agent-public.tsx` exit 0. 최종 `pnpm mock:run` PTY **28386** 양제품 migration/build/ready와 양 API `/health/ready` ready. 임시 `/tmp/ap-public-compare.py`로 시안/실제 1440/320px 캡처를 대조했고 최종 `/tmp/ap-public-quick-submit-smoke.py`의 합성 승인 지식/AI 공급사 503으로 두 폭 FAQ 선택→AI 질문 POST 1회·공급사 503 때 사람 문의 초안 보존·사람 문의 앵커·사진 입력·가로 넘침 0·pageerror 0, exit 0. 캡처 `/tmp/ap-public-reference-{1440,320}.png`, `/tmp/ap-public-actual-{1440,320}.png`. 합성 응답은 실제 AI/접수/DB·권한 증거가 아니다. 전체 E2E/DB/계약/보안·정식 QA/사용자 인수 테스트는 이번 변경 뒤 미실행.
- **실패한 접근:** 기존 별도 사진 패널과 긴 안내/접수 그리드는 시안의 질문→사람 문의 흐름을 가려 재배치했다. 이번 변경의 컴파일/브라우저 스모크 실패는 없었다.
- **남은 작업:** 다른 고객 화면과 역할별 업무 기능을 시안과 계속 비교해 연결한다. 200% 확대·키보드/스크린리더, 실제 AP 상담→접수·제품별 독립·전체 DB/계약/보안·정식 QA/G·사용자 최종 검수는 남아 있다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/A02/A05 `in_progress`. 운영 배포/고객 발송/청구 없음.
- **다음 에이전트 정확한 명령:** 다음 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 현재 mock PTY가 살아 있으면 ready를 확인하고, 없으면 `pnpm mock:run` 새 세션을 실행한다. 미실행 검사는 통과로 적지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,55p' docs/technical/PHASE_2_EXECUTION_PLAN.md
rg -n '^function agentPublic3|^function publicContact|^function inquiryForm' reference/field_ui_prototype_v3.html
pnpm --filter @fieldai/agent-web typecheck
pnpm exec eslint apps/agent-web/src/agent-public.tsx
/tmp/fieldai-report-venv/bin/python /tmp/ap-public-quick-submit-smoke.py
# 사용자 최종 인수 테스트 단계
pnpm test:spike:agent-owner-flow:http
pnpm test:security
```

## 최신 인수인계 — C03/F09 Field 관리자 화면 (2026-09-26)

- **현재 목표:** 시안 v3와 docs 기능을 독립 AP/Field 서비스에 끝까지 연결한다. 사용자 최종 인수 테스트와 외부 공급사 연동은 마지막 단계다. 로컬 mock PTY **6199** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** Field 관리자 화면을 시안 구조의 데스크톱 사이드 메뉴·Field 실제 사업체/문의/예약/공개 사이트/사건 집계 카드·대기 사건/감사 목록으로 정리했다. 모바일 하단 운영/제작/발송/감사와 더보기의 사업체/구독으로 이동한다. 기존 Field 관리자 인증/권한 없음/MFA 미연결 차단·감사 원장·고객 원문 비노출은 유지했다. 직전 AP 관리자/매체/Field 설정 단계는 아래 인수인계에 있다.
- **수정 파일:** `apps/field-web/src/field-admin.tsx`, 신규 `apps/field-web/src/field-admin.css`, 시안 맞춤 제목 조정 `apps/agent-web/src/agent-admin.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. AP/Field API·DB migration·계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** Field 관리자 수치는 Field `/v1/admin/overview`에서만 가져온다. AP 관리자 세션/수치와 공유하지 않는다. 시안의 가상 DNS/청구/고객 발송/관리 조작을 운영 성공으로 표시하지 않고 추가 인증 미연결 차단을 유지한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/agent-web typecheck`, `pnpm --filter @fieldai/field-web typecheck`, `pnpm exec eslint apps/agent-web/src/agent-admin.tsx apps/field-web/src/field-admin.tsx` exit 0. 최종 `pnpm mock:run` PTY **6199** 양제품 migration/build/ready, 양 API `/health/ready` ready. 임시 `/tmp/field-admin-layout-smoke.py`의 합성 Field 관리자 GET으로 Chromium 1440/320px 실제 React 화면 집계·제작/감사/사업체 이동, 가로 넘침 0·pageerror 0, 최종 exit 0. 같은 최종 빌드에서 `/tmp/ap-admin-layout-smoke.py`도 exit 0. 별도 비인증 각 `/admin` 로그인 요구 확인. Field 캡처 `/tmp/field-admin-actual-{1440,320}.png`와 시안 `/tmp/ap-admin-reference-{1440,320}.png`. 합성 응답은 실제 관리자 권한/DB 증거가 아니다. 전체 관리자/DB/보안·정식 QA/사용자 인수 테스트는 이 변경 뒤 미실행.
- **실패한 접근:** 이번 Field 단계의 컴파일/기동/임시 스모크 실패는 없었다. 이전 AP 관리자 임시 스모크의 모바일 링크 선택자 timeout은 아래 단계에 기록했다.
- **남은 작업:** 다른 고객/역할 화면과 문서 기능을 시안과 계속 대조해 연결한다. 200% 확대·키보드 전체 경로·스크린리더, 제품별 독립·전체 DB/계약/보안·정식 QA/G·사용자 최종 검수는 남아 있다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F09 `in_progress`. 운영 배포/고객 발송/청구 없음.
- **다음 에이전트 정확한 명령:** 다음 범위/요구/QA/명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 현재 mock PTY가 살아 있으면 ready를 확인하고, 없으면 `pnpm mock:run`을 새 세션으로 실행한다. 미실행 검사는 통과로 적지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,65p' docs/technical/PHASE_2_EXECUTION_PLAN.md
rg -n '^function adminExtension3|^function agentPublic3' reference/field_ui_prototype_v3.html
pnpm --filter @fieldai/agent-web typecheck
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/agent-web/src/agent-admin.tsx apps/field-web/src/field-admin.tsx
# 사용자 최종 인수 테스트 단계
pnpm test:spike:admin:agent:http
pnpm test:spike:admin:field:http
pnpm test:security
```

## 최신 인수인계 — C03/A10 AP 관리자 화면 (2026-09-26)

- **현재 목표:** 시안 v3와 docs 기능을 독립 AP/Field 서비스에 끝까지 연결한다. 사용자 최종 인수 테스트와 외부 공급사 연동은 마지막 단계다. 로컬 mock PTY **31228** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** AP 관리자 화면을 시안의 관리실 구조와 비교해 데스크톱 사이드 메뉴·실제 API 집계 카드·대기 사건/감사 목록으로 정리했다. 320px 하단 메뉴에서 운영/AI/발송/감사, 더보기에서 조직/구독으로 이동한다. 기존 AP 관리자 로그인·권한 없음·추가 인증 차단·감사 원장·고객 원문/연락처 비노출은 유지했다. 직전 AP 매체 화면 인수인계는 아래에 있다.
- **수정 파일:** `apps/agent-web/src/agent-admin.tsx`, 신규 `apps/agent-web/src/agent-admin.css`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. AP/Field API·DB migration·계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 시안의 가상 사업체/발송/결제/긴급 조작은 운영 성공으로 표시하지 않는다. AP 관리자 API의 집계·상태·사건 ID·감사 메타데이터만 렌더한다. 제품별 관리자 권한과 MFA 미연결 차단은 기존 그대로 둔다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/agent-web typecheck`, `pnpm exec eslint apps/agent-web/src/agent-admin.tsx` exit 0. 최종 `pnpm mock:run` PTY **31228** 양제품 migration/build/ready. 임시 `/tmp/ap-admin-layout-smoke.py`의 합성 `/v1/admin/overview` 응답으로 Chromium 1440/320px 실제 React 화면의 집계·사건·감사·모바일 더보기→조직 이동, 가로 넘침 0·pageerror 0, 최종 exit 0. 같은 브라우저의 비인증 `/admin`은 로그인 요구. 시안/실제 캡처: `/tmp/ap-admin-reference-{1440,320}.png`, `/tmp/ap-admin-actual-{1440,320}.png`. 합성 응답은 실제 관리자 권한/DB 증거가 아니다. 전체 관리자/DB/보안·정식 QA/사용자 인수 테스트는 이 변경 뒤 미실행.
- **실패한 접근:** 첫 임시 스모크는 모바일 하단 메뉴로 바뀐 뒤 이전 `신고·감사` 링크를 선택해 timeout이 났다. 실제 `감사` 링크/더보기 경로로 점검 스크립트를 고쳐 최종 exit 0. 애플리케이션 오류는 확인되지 않았다.
- **남은 작업:** Field 관리자 및 다른 고객/역할 화면을 시안과 계속 대조하고 문서 기능을 연결한다. 전체 200% 확대·키보드/스크린리더, 독립·DB/계약/보안·정식 QA/G·사용자 최종 검수는 남아 있다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/A10 `in_progress`. 운영 배포/고객 발송/청구 없음.
- **다음 에이전트 정확한 명령:** 다음 작업 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 현재 mock PTY가 살아 있으면 ready를 확인하고, 없으면 `pnpm mock:run` 새 세션으로 시작한다. 미실행 검사를 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,55p' docs/technical/PHASE_2_EXECUTION_PLAN.md
rg -n '^function adminExtension3|^function adminOverview' reference/field_ui_prototype_v3.html
pnpm --filter @fieldai/agent-web typecheck
pnpm exec eslint apps/agent-web/src/agent-admin.tsx
# 사용자 최종 인수 테스트 단계
pnpm test:spike:admin:agent:http
pnpm test:db:agent
pnpm test:security
```

## 최신 인수인계 — C03/D01~D04 AP 제휴 매체 화면 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html` 및 docs의 기능을 독립 AP/Field 서비스에 계속 구현한다. 사용자 최종 인수 테스트와 외부 공급사/매체 연결은 마지막 단계다. 로컬 mock PTY **97778** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** AP 제휴 매체의 조직/도메인/위치/배치/성과 한 페이지를 시안 v3의 오늘·노출 위치·배치 승인·집계 성과·매체 설정 5개 화면으로 나눴다. 실제 AP 조직·도메인·위치·배치 승인·성과 API와 권한 경로는 유지했다. 개요 수치와 배치 카드·독자 화면 카드는 실제 AP 데이터를 사용하고, 활성 배치는 승인·공개 가능·설치를 모두 충족해야 센다. 모바일 5개 메뉴를 2행으로 모두 보인다. 이전 매체 복구·집계 브라우저 스크립트는 새 메뉴 이동을 사용한다. 직전 Field 설정 화면 인수인계는 바로 아래에 있다.
- **수정 파일:** `apps/agent-web/src/{agent-publisher.tsx,agent-publisher.css}`, `tools/spikes/{publisher-recovery-browser.py,distribution-metrics-browser.py}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. 이번 매체 단계 AP/Field API·DB migration·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 매체는 AP 공개 배치/광고 소재만 검토하며 고객 대화·개인정보를 보지 않는다. 시안의 가상 기사 대신 실제 승인·설치 배치가 있을 때만 그 카드와 링크를 보여 준다. DNS 미확인·미설치·노출 보류를 활성 배치로 세지 않는다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/agent-web typecheck`, `pnpm exec eslint apps/agent-web/src/agent-publisher.tsx`, `python3 -m py_compile tools/spikes/publisher-recovery-browser.py tools/spikes/distribution-metrics-browser.py` exit 0. 최종 `pnpm mock:run` PTY **97778** 양제품 migration/build/ready와 양 API `/health/ready` ready. 임시 `/tmp/ap-publisher-sections-smoke.py`의 실제 신규 mock AP 계정/매체 조직 Chromium 1440/320px에서 5개 메뉴·조직 생성·노출 위치·배치 빈 상태·집계 화면 이동, 두 폭 가로 넘침 0·pageerror 0, 최종 exit 0. 시안/실제 캡처: `/tmp/ap-publisher-reference-{1440,320}.png`, `/tmp/ap-publisher-actual-{1440,320}.png`. 실제 DNS/배치 승인·외부 기사·집계값 전체 E2E/DB/계약/보안·정식 QA/사용자 인수 테스트는 이 변경 뒤 미실행.
- **실패한 접근:** 이번 매체 단계의 컴파일/기동/임시 스모크 실패는 없었다. 시안의 가상 독자 기사 카드와 로컬 배치 성공 상태는 실제 연결·승인 증거가 없어 그대로 옮기지 않았다. 이전 Field 설정 단계의 임시 스모크 locator/비동기 대기 수정은 아래에 기록했다.
- **남은 작업:** 다른 고객/관리자 화면과 docs 기능을 시안과 대조하고 끊긴 업무 경로를 계속 연결한다. 200% 확대·키보드 전체 경로·스크린리더, 제품별 독립·전체 DB/계약/보안·정식 QA/G와 사용자 최종 검수는 남아 있다. 실 인증/LLM/알림/결제/DNS/TLS/백업·제휴 매체 계약은 `blocked_integration`; C03/D01~D04 `in_progress`. 운영 배포/광고 노출/고객 발송/청구 없음.
- **다음 에이전트 정확한 명령:** 다음 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록하고 기준 시안과 실제 역할별 화면을 비교한다. 현재 PTY가 살아 있으면 ready를 확인하고, 없으면 `pnpm mock:run`으로 새로 띄운다. 미실행 검사를 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,55p' docs/technical/PHASE_2_EXECUTION_PLAN.md
rg -n '^function publisher3|^function adminExtension3' reference/field_ui_prototype_v3.html
pnpm --filter @fieldai/agent-web typecheck
pnpm exec eslint apps/agent-web/src/agent-publisher.tsx
python3 -m py_compile tools/spikes/publisher-recovery-browser.py tools/spikes/distribution-metrics-browser.py
# 사용자 최종 인수 테스트 단계
pnpm test:spike:publisher-recovery:http
pnpm test:e2e:distribution
pnpm test:contracts
pnpm test:security
```

## 최신 인수인계 — C03/F01/F08 Field 설정·구독 메뉴 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`과 개발 문서의 기능을 독립 AP/Field 서비스에 계속 구현한다. 사용자 최종 인수 테스트와 외부 공급사 연동은 마지막 단계다. 로컬 mock PTY **64331** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** Field 데스크톱 `설정·구독`과 모바일 `더보기`를 동일 설정 화면으로 연결했다. 시안 v3 `owner/settings`의 2열 카드·사업체 요약을 실제 Field 데이터/업무 경로로 옮겼다. 사이트 편집·서비스·예약 정책·직접 문의·AP 상담 연결·알림·Field 구독/운영 데이터·사용량의 8개 카드가 실제 화면으로 이동한다. 사업체 카드에 초안/승인 상태와 로그아웃을 배치했다. 기존 Field 브라우저 스크립트의 옛 카드 버튼 이름을 갱신했다.
- **수정 파일:** `apps/field-web/src/{field-workspace.tsx,site.css}`, `tools/spikes/{field-catalog-autosave-browser.py,field-owner-flow-browser.py}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. Field/AP API·DB migration·계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 시안의 AP 홍보/매체/AI 메뉴를 Field 소유 기능으로 복제하지 않고, Field 운영 경로와 별도 AP 연결 경로를 보여 준다. 사업 정보는 실제 Field 서버 초안과 승인 revision을 구분한다. 미연결 공급사나 유료 청구가 성공한 것처럼 표시하지 않는다.
- **실제 검사/환경/커밋:** 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/field-web typecheck`, `pnpm exec eslint apps/field-web/src/field-workspace.tsx`, `python3 -m py_compile tools/spikes/field-catalog-autosave-browser.py tools/spikes/field-owner-flow-browser.py` exit 0. 최종 `pnpm mock:run` PTY **64331** 양제품 migration/build/ready; 두 API `/health/ready` 응답 `ready`. 임시 `/tmp/field-settings-smoke.py`의 실제 신규 mock 조직 Chromium 1440/320px에서 카드 8개·예약 정책 펼침·서비스 화면·구독 화면 이동, 두 폭 가로 넘침 0·pageerror 0, 최종 exit 0. 시안/실제 캡처: `/tmp/field-settings-reference-{1440,320}.png`, `/tmp/field-settings-actual-{1440,320}.png`. 전체 사용자 인수/E2E/DB/계약/보안·정식 QA와 나머지 카드의 깊은 업무 흐름은 이 변경 뒤 미실행.
- **실패한 접근:** 첫 임시 스모크에서 `서비스` 제목을 전역으로 찾으니 제목이 2개라 Playwright strict locator 오류가 났다. `#owner-services h1`로 한정했다. 다음 실행에서는 예약 정책 `requestAnimationFrame`을 기다리기 전에 `open`을 읽어 false로 기록했다. 명시적으로 열린 상태를 기다리도록 바꾼 최종 실행은 exit 0. 애플리케이션 오류로 단정하지 않는다.
- **남은 작업:** 다른 고객/매체/관리자 화면과 문서 기능을 시안과 대조하고 끊긴 업무 경로를 계속 연결한다. 200% 확대·키보드 전체 경로·스크린리더, 제품별 독립·전체 DB/계약/보안·정식 QA/G와 사용자의 최종 검수는 남아 있다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F01/F08 `in_progress`. 운영 배포/고객 발송/청구 없음.
- **다음 에이전트 정확한 명령:** 다음 작업 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록하고 시안 화면과 실제 역할별 업무 흐름을 대조한다. 현재 PTY가 살아 있으면 ready를 확인하고, 없으면 `pnpm mock:run`으로 새로 띄운다. 최종 검사 미실행을 통과로 쓰지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
sed -n '1,45p' docs/technical/PHASE_2_EXECUTION_PLAN.md
rg -n '^function settings3|^function ownerView3' reference/field_ui_prototype_v3.html
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-web/src/field-workspace.tsx
python3 -m py_compile tools/spikes/field-catalog-autosave-browser.py tools/spikes/field-owner-flow-browser.py
# 사용자 최종 인수 테스트 단계
FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm test:contracts
pnpm test:security
pnpm test:e2e:field
```

## 최신 인수인계 — C03/F08 Field 사업자 알림 화면 (2026-09-26)

- **현재 목표:** 시안 v3와 개발 문서의 기능을 독립 AP/Field 서비스에 계속 구현한다. 사용자 화면/흐름 최종 검수와 외부 공급사 연동은 마지막에 수행한다. 로컬 mock PTY **60270** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** Field 사업자 알림 메뉴를 시안 v3의 사업자 알림·고객 답변 알림·업무 이벤트 카드로 바꿨다. 실제 Field 원장 최근 100건과 기존 읽음 API를 이력에 연결하고 목록 조회의 로딩/실패/빈 상태를 분리했다. 카카오·푸시·수신 번호 설정은 공급사와 저장 경로가 없어 비활성 사유를 표시한다. Field 직접 업무와 AP 원본 대화의 고객 알림 주체를 구분한다. 직전 서비스 카드/편집 단계는 바로 아래 인수인계에 있다.
- **수정 파일:** `apps/field-web/src/{field-workspace.tsx,site.css}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. Field API/DB migration·AP/제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 외부 공급사/웹 푸시 권한 없이 시안의 설정 저장 성공이나 외부 발송을 흉내 내지 않는다. 실제 내부 알림 원장만 조회/읽음 처리한다. 알림 목록 GET 오류는 이력 0건과 구분하고 기존 목록이 있으면 오류와 함께 보존한다. 같은 고객 사건의 제품별 발송 주체는 기존 경계를 유지한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/field-web typecheck`, `pnpm exec eslint apps/field-web/src/field-workspace.tsx` exit 0. 최종 `pnpm mock:run` **60270** 양제품 migration/build/ready. 실제 빈 mock 사업장의 알림 화면을 시안 1440px과 대조하고 320px에서 외부 설정 2개 비활성·빈 이력·가로 넘침 0·pageerror 0을 확인했다. 합성 알림 목록 GET 503을 320px 브라우저에 주입했을 때 오류가 보이고 빈 상태가 숨겨졌으며, 주입 제거·재시도로 빈 상태 복귀(가로 넘침 0·pageerror 0)를 확인했다. 캡처: `/tmp/field-notifications-prototype.png`, `/tmp/field-notifications-current-1440.png`, `/tmp/field-notifications-current-320.png`. 실제 이벤트 선택/읽음·외부 공급사 설정/발송, 전체 E2E/DB/계약/보안·정식 QA/사용자 인수 테스트는 이 변경 뒤 미실행이다.
- **실패한 접근:** 이번 알림 단계의 컴파일/기동/점검 실패는 없었다. 시안의 저장 버튼은 현재 서버 저장 경로가 없어 그대로 옮기면 거짓 성공이 되므로 공급사 연결 전 비활성 상태와 이유로 표현했다.
- **남은 작업:** 실제 내부 업무 이벤트 선택/읽음과 고객/사업자 외부 발송 경로는 전체 검수/공급사 연결 시 확인한다. 다른 고객/매체/관리자 시안과 문서 기능, 200% 확대·키보드/스크린리더, 제품별 독립·전체 DB/계약/보안·정식 QA/G·사용자 최종 검수가 남았다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F08 `in_progress`. 운영 배포/발송/청구 없음.
- **다음 에이전트 정확한 명령:** ready 확인 후 시안·계획/TASKS/Field PRD/QA를 읽고 다음 파일 범위·요구/QA·명령을 계획에 먼저 기록한다. mock PTY가 없으면 `pnpm mock:run` 새 세션으로 재시작한다. 미실행 검사는 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
sed -n '1,35p' docs/technical/PHASE_2_EXECUTION_PLAN.md
rg -n 'function ownerNotifications3' reference/field_ui_prototype_v3.html
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-web/src/field-workspace.tsx
# 사용자 최종 인수 테스트 단계
FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm test:contracts
pnpm test:security
pnpm test:e2e:field
```

## 최신 인수인계 — C03/F01 Field 사업자 서비스 카드·편집 (2026-09-26)

- **현재 목표:** 시안 v3와 개발 문서의 기능을 독립 AP/Field 서비스에 계속 구현한다. 사용자 화면/흐름 최종 검수와 외부 공급사 연동은 마지막에 수행한다. 로컬 mock PTY **79824** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** Field 서비스 메뉴를 카드 중심으로 바꿔 실제 서버 초안의 이름·설명·소요시간·확정 가격·예약 방식을 보여준다. 승인 전/미승인 변경/승인본과 일치를 구분하고 AP 정보는 별도 승인으로 안내한다. 서비스 추가/수정은 기존 사업 정보 자동 저장·충돌·승인 폼으로 이동한다. 신규 조직은 사업 정보 입력을 바로 열고 재방문은 카드부터 표시한다. 영업시간·예약 정책 버튼은 달력의 실제 정책 입력을 펼친다.
- **수정 파일:** `apps/field-web/src/{field-workspace.tsx,site.css}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. Field API/DB migration·AP/제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 카드 값은 Field 원장 초안에서만 읽으며 미승인 값을 공개 중이라고 표시하지 않는다. `priceAmount=null`은 `가격 미정`, 숫자는 확정 가격으로 표현하고 시안의 임의 `원부터`를 넣지 않는다. AP 상담 정보는 Field 공개와 별도 검수/승인이다. 서비스별 `inherit` 예약 방식은 현재 Field 기본 방식으로 해석하되 기존 확정 예약 스냅샷은 유지한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/field-web typecheck`, `pnpm exec eslint apps/field-web/src/field-workspace.tsx` exit 0. 최종 `pnpm mock:run` **79824** 양제품 migration/build/ready. 최신 시안 `owner/services` 1440px과 실제 화면을 비교했다. 실제 새 mock 사업자 1440/320px에서 신규 조직 후 사업 정보 입력 열림, 서비스 추가→이름/설명/60분/35,000원/시간표형 카드 갱신→Field 서버 초안 GET 반영→새로고침 후 카드 재표시·편집 폼/입력 초점, 320px 정책 설정→달력 정책 펼침·가로 넘침 0·pageerror 0을 확인했다. 캡처: `/tmp/field-services-prototype.png`, `/tmp/field-services-current-1440.png`, `/tmp/field-services-current-320.png`. 실제 서비스 승인→공개 사이트/예약 조건 전체 흐름, 전체 E2E/DB/계약/보안·정식 QA/사용자 인수 테스트는 이 변경 뒤 미실행이다.
- **실패한 접근:** 편집 버튼 직후 DOM 표시만 기다린 첫 초점 측정은 두 `requestAnimationFrame` 실행 전이어서 false였다. 120ms 뒤 같은 입력에 초점이 있는 것을 확인했다. 코드 컴파일/기동 오류는 없었다.
- **남은 작업:** 서비스 변경 승인→고객 공개/예약 조건을 실제 전체 흐름에서 검수하고, 나머지 고객/매체/관리자 화면과 문서 기능을 연결한다. 200% 확대·키보드/스크린리더, 제품 독립/전체 DB/계약/보안·정식 QA/G와 사용자 최종 검수가 남았다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F01 `in_progress`. 운영 배포/발송/청구 없음.
- **다음 에이전트 정확한 명령:** ready 확인과 아래 시안/계획/TASKS/Field PRD/QA를 읽고 다음 파일 범위·요구/QA·검사 명령을 계획에 먼저 기록한다. mock PTY가 없으면 `pnpm mock:run`을 새 세션으로 시작한다. 미실행 검사를 통과로 보고하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
sed -n '1,28p' docs/technical/PHASE_2_EXECUTION_PLAN.md
rg -n 'function ownerServices3' reference/field_ui_prototype_v3.html
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-web/src/field-workspace.tsx
# 사용자 최종 인수 테스트 단계
FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm test:contracts
pnpm test:security
pnpm test:e2e:field
```

## 최신 인수인계 — C03/F05/I05 Field 사업자 문의함 실제 목록·상세 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`을 수시로 확인하며 독립 AP/Field 기능을 문서대로 연결한다. 사용자 최종 인수 테스트와 외부 공급사 연동은 마지막에 한다. 로컬 mock PTY **69685** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** Field 사업자 문의함의 실제 데이터가 있을 때 시안 v3의 검색·상태 필터·좌측 목록/우측 대화 상세 구조를 적용했다. 직접 문의와 AP 전달은 같은 목록에서 출처를 구분하고, 상세·답변은 기존 원본/권한 API를 각각 사용한다. Field 답변/내부 메모는 탭으로 전환하고 320px 상세에는 목록 복귀 버튼을 둔다. 직전 빈 상태와 부분 조회 실패·재시도 UI는 아래 인수인계에 있다.
- **수정 파일:** `apps/field-web/src/{field-workspace.tsx,site.css}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. API/DB migration·AP 코드·제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 단일 화면 목록 키는 `field:`/`ap:`로 구분하고 원본 데이터를 서로 복제하지 않는다. 필터/검색에서 선택 항목이 사라지면 이전 상세도 숨긴다. AP 원본을 열어야 답변할 수 있는 기존 제한, 연락처 본인 확인 전 표시, 직접 문의의 비공개 메모·알림 경계를 유지한다. 시안의 `AI` 탭은 Field에서 실재하는 AP 전달 출처 필터로 표시했다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/field-web typecheck`, `pnpm exec eslint apps/field-web/src/field-workspace.tsx` exit 0. 최종 `pnpm mock:run` **69685** 양제품 migration/build/ready. 최신 시안의 데이터가 있는 `owner/inbox`를 직접 열어 목록 너비·출처 안내를 대조했다. 합성 직접 문의 1건/AP 전달 1건의 목록·상세 GET 응답을 브라우저에 주입해 1440px Field 상세/답변·메모 전환, AP 필터/상세, 검색 0건 시 이전 상세 숨김, 320px 상세→목록 복귀·가로 넘침 0·pageerror 0을 확인했다. 실제 빈 mock 조직에서도 320px 빈 상태·가로 넘침 0·pageerror 0. 화면 캡처: `/tmp/field-inbox-prototype-nonempty.png`, `/tmp/field-inbox-nonempty-1440.png`, `/tmp/field-inbox-ap-320.png`. 이 응답 주입은 실제 문의 저장/권한·AP 연결/장애 검사가 아니다. 실제 문의→답변, 전체 E2E/DB/계약/보안·정식 QA·사용자 인수 테스트는 미실행이다.
- **실패한 접근:** 첫 합성 AP 사진 목록 응답을 API의 `attachments` 형식과 다르게 만들어 브라우저 오류가 났다. 점검 데이터만 수정해 같은 화면 시나리오를 재실행했고 exit 0이었다. 코드의 실제 사진 응답 형식은 변경하지 않았다.
- **남은 작업:** 실제 두 출처 문의/답변과 접수·알림 상태, 200% 확대·키보드/스크린리더, 나머지 고객/매체/관리자 시안/기능 정합, 독립성·전체 DB/계약/보안·정식 QA/G와 사용자 인수 테스트. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F05/I05 `in_progress`. 운영 배포/발송/청구 없음.
- **다음 에이전트 정확한 명령:** ready 확인 후 최신 시안/계획/TASKS/Field PRD/QA를 읽고 다음 범위·요구/QA·검사 명령을 계획에 먼저 기록한다. mock PTY가 없으면 `pnpm mock:run` 새 세션으로 재시작한다. 미실행 검사는 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
sed -n '1,40p' docs/technical/PHASE_2_EXECUTION_PLAN.md
rg -n 'function ownerInbox|function ownerView3' reference/field_ui_prototype_v3.html
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-web/src/field-workspace.tsx
# 사용자 최종 인수 테스트 단계
FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm test:contracts
pnpm test:security
pnpm test:e2e:field
```

## 최신 인수인계 — C03/F05/I05 Field 사업자 문의함 빈 상태 (2026-09-26)

- **현재 목표:** 시안 v3와 개발 문서에 맞는 독립 AP/Field 서비스 화면·기능을 계속 연결한다. 사용자 최종 화면/흐름 인수 테스트와 외부 공급사 연동은 마지막에 수행한다. 로컬 mock PTY **45818** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** Field 사업자 문의 메뉴에 시안 v3의 제목·빈 상태 카드·다음 행동을 붙였다. 승인된 카탈로그가 없으면 사이트 준비, 있으면 실제 고객 문의 링크로 이동한다. 데이터가 있으면 기존 Field 직접 문의/AP 전달 문의의 목록·상세·답변 기능은 출처별 카드에 유지한다. 두 목록이 정상 조회된 경우에만 빈 상태를 표시하고, 실패한 출처에는 오류와 재시도를 보여준다. 직전 단계의 예약·일정 일자별 UI/owner API/수동 일정 모달은 바로 아래 인수인계에 있다.
- **수정 파일:** `apps/field-web/src/{field-workspace.tsx,site.css}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. API/DB migration·AP 코드·제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 실제 빈 조직에 시안 샘플 고객 데이터를 넣지 않는다. Field 직접 문의 원본과 AP 상담 원본을 합치지 않고, 각 출처의 기존 권한/API를 유지한다. AP 또는 Field 목록 조회 실패를 전체 문의 0건으로 오인하지 않도록 각 조회 상태와 재시도를 분리한다. 시안의 첫 문의 행동은 실제 승인 상태에 맞는 링크로 분기한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/field-web typecheck`, `pnpm exec eslint apps/field-web/src/field-workspace.tsx` exit 0. 최종 `pnpm mock:run` **45818** 양제품 migration/build/ready; 이어서 양 API ready HTTP 200을 재확인했다. 새 mock 사업자의 실제 작업실 문의함을 1440px 시안 이미지와 비교했고 320px 빈 상태·다음 행동 `사이트 준비하기`·가로 넘침 0·pageerror 0을 확인했다. 320px 브라우저 AP 목록 GET에 합성 503을 넣었을 때 오류 경고가 나오고 빈 카드가 숨겨졌으며, 주입 제거·재시도로 빈 카드가 돌아왔다(가로 넘침 0·pageerror 0). 실제 AP 장애·실제 문의 생성/답변, AP 전달 문의와 Field 직접 문의가 함께 있을 때의 화면/권한, 전체 E2E/DB/계약/보안·정식 QA·사용자 인수 테스트는 이번 변경 뒤 미실행이다.
- **실패한 접근:** 이번 문의함 단계의 컴파일/기동 오류는 없었다. 직전 예약 단계에서는 구형 주간 시안 구조를 최신 v3 일자별 구조로 교정했고, 외부 API로 넣은 차단이 열린 화면에 바로 표시되지 않아 명시 새로고침 경로로 확인했다.
- **남은 작업:** 사업자 문의함에 실제 직접 문의/AP 전달이 함께 있을 때의 목록·상세 레이아웃, 나머지 고객/매체/관리자 시안과 실제 상태 연결을 계속 대조한다. 실제 고객 문의/예약·사진→사업자 처리→고객 확인, 200% 확대·키보드/스크린리더, 제품별 독립·전체 DB/계약/보안·정식 QA/G와 사용자 인수 테스트는 남았다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F05/F07/I05 `in_progress`. 운영 배포/발송/청구 없음.
- **다음 에이전트 정확한 명령:** 아래 ready 확인 후 시안 최신 v3/계획/TASKS/Field PRD/QA를 읽고 다음 범위·요구/QA·검사 명령을 계획에 먼저 기록한다. mock PTY가 없으면 `pnpm mock:run` 새 세션으로 재시작한다. 미실행 검사는 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
sed -n '1,80p' docs/technical/PHASE_2_EXECUTION_PLAN.md
sed -n '1,115p' docs/02_FIELD_PRD.md
rg -n 'function ownerView3|function calendar3' reference/field_ui_prototype_v3.html
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-web/src/field-workspace.tsx
# 사용자 최종 인수 테스트 단계
FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm test:contracts
pnpm test:security
pnpm test:e2e:field
```

## 최신 인수인계 — C03/F07 Field 사업자 예약·일정 시안 v3 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html` 최신 화면과 개발 문서에 맞는 독립 AP/Field 서비스를 계속 완성한다. 최종 화면/흐름 인수 테스트와 외부 공급사 연동은 사용자가 마지막에 직접 수행한다. 로컬 mock PTY **95034** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** Field 사업자 `예약·일정`에 일자별 일정 카드, 이전/다음 날짜·날짜 입력, 확정 예약/수동 차단, 진행 중 요청 카드와 실제 상세 열기를 연결했다. 새 owner 전용 7일 범위 API가 Field DB의 정책 시간대·확정 시각/수동 차단·진행 중 요청을 읽는다. 수동 일정 버튼은 실제 차단 등록 모달을 열고, 정책/기존 예약 처리 기능을 유지했다.
- **수정 파일:** `apps/field-api/src/bookings.ts`, `apps/field-web/src/{field-booking.tsx,site.css}`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. DB migration·AP 코드·제품 간 공개 계약은 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 최신 시안 v3의 `calendar3()`을 기준으로 일자별 화면을 구성한다. 내부 읽기는 7일 범위를 한 번에 가져와 같은 주 안의 날짜 이동에 재사용하고, 최대 500건 초과는 413으로 불완전 일정을 성공처럼 표시하지 않는다. 대기 요청은 수동/확정 점유와 분리한다. 사업장 시간대를 API 필터와 UI 날짜 표시의 기준으로 사용한다.
- **실제 검사/환경/커밋:** 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/field-api build`, `pnpm --filter @fieldai/field-web typecheck`, `pnpm exec eslint apps/field-api/src/bookings.ts apps/field-web/src/field-booking.tsx`, `python3 -m py_compile tools/spikes/field-owner-flow-browser.py` exit 0. 최종 `pnpm mock:run` **95034**에서 양제품 migration/build/ready. 실제 mock owner의 달력 GET 200/Asia/Seoul/빈 상태, 잘못된 8일 범위 400; 별도 mock owner 수동 차단 POST 201→범위 GET 200/1건→320px 화면 새로고침 후 표시. 최종 320px 실제 모달에서 수동 일정 등록→닫힘→일자 선택→일정 표시·가로 넘침 0·pageerror 0. 시안과 실제 1440px 이미지를 대조하고 320px 다음 날짜 이동도 확인했다. 실제 고객 예약 제출·사업자 확정까지 이어지는 전체 E2E, DB/계약/보안/정식 QA와 사용자 인수 테스트는 이 변경 뒤 미실행이다.
- **실패한 접근:** 처음 구형 `ownerCalendar()`의 주간 막대를 참고했다. 최신 v3 `calendar3()`과 이미지 대조 후 일자별 카드로 교정했다. 수동 차단을 브라우저 외부 API로 넣은 첫 UI 점검은 이미 열린 화면의 오래된 데이터로 30초 timeout이었고, API에는 정상 저장돼 있었다. UI의 예약 기록 새로고침 뒤 같은 일정이 표시됐다.
- **남은 작업:** 최신 시안의 다른 사업자/고객/매체/관리자 화면과 실제 상태 연결을 계속 대조한다. 실제 예약·사진/문의 제출→사업자 처리→고객 확인, 200% 확대·키보드/스크린리더, 전체 E2E/DB/계약/보안·정식 QA/G와 사용자 시각 검토는 남았다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F07 `in_progress`. 운영 배포/발송/청구 없음.
- **다음 에이전트 정확한 명령:** 아래 ready 확인과 시안/계획 읽기 후 다음 파일 범위·요구/QA·검사 명령을 계획에 먼저 적는다. mock PTY가 없으면 `pnpm mock:run`을 새 세션에서 시작한다. 사용자 최종 검사 전 미실행 항목은 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
sed -n '1,100p' docs/technical/PHASE_2_EXECUTION_PLAN.md
sed -n '1,120p' docs/02_FIELD_PRD.md
rg -n 'function calendar3' reference/field_ui_prototype_v3.html
pnpm --filter @fieldai/field-api build
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-api/src/bookings.ts apps/field-web/src/field-booking.tsx
# 사용자 최종 인수 테스트 단계
FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm test:contracts
pnpm test:security
pnpm test:e2e:field
```

## 최신 인수인계 — C03/F05 Field 직접 문의 이용 장소 (2026-09-26)

- **현재 목표:** 시안 v3와 개발 문서에 맞는 독립 AP/Field 기능·사용 환경을 계속 완성한다. 사용자 화면/흐름 최종 확인과 실제 제출·연동 인수 테스트는 마지막에 사용자가 수행한다. 로컬 mock PTY **45302** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** Field 직접 문의에 시안의 선택 ‘지역·이용 장소’를 추가하고 공개 제출→Field 문의 원장→고객 확인키/사업자 상세→한 건/전체 JSON export까지 연결했다. 장소를 비운 제출은 기존 payload/멱등 해시를 보존한다. 앞선 단계의 예약 요청 내용/장소/사진 구현은 아래 인수인계에 기록되어 있다.
- **수정 파일:** `apps/field-api/migrations/000050_inquiry_visit_region.sql`, `apps/field-api/src/{inquiries,operations-archive}.ts`, `apps/field-web/src/{field-api,field-public,field-workspace}.ts(x)`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. 이번 단계 AP/제품 간 계약은 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 입력 장소는 고객 진술이며 사업자의 승인 활동 지역이나 확정 방문 주소로 표시하지 않는다. 기존 문의와 사업자 첫 문의 테스트의 장소는 `null`이다. 고객이 장소를 비우면 새 필드를 공개 POST에 넣지 않아 응답 분실 재시도 해시를 이전 버전과 같게 둔다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/field-api build`, `pnpm --filter @fieldai/field-web typecheck`, 변경 TS/TSX ESLint exit 0. 새 `pnpm mock:run` **45302**에서 Field migration 000050 및 양제품 API/웹 build·ready. 실제 승인 카탈로그 Chromium 320px 문의 화면에서 새 입력 표시·가로 넘침 0·pageerror 0. 실제 문의 제출/원장/권한/export·DB/계약/보안/전체 E2E·정식 QA는 이번 변경 뒤 미실행이다. 직전 예약 단계에서는 mock **97897** migration 000048·000049/빌드·네 URL HTTP 200과 예약 사진 5장 선택·6장 거절 UI를 확인했다.
- **실패한 접근:** 기존 직접 문의 화면/원장에는 장소 필드가 없어 시안 입력을 저장/재열람할 수 없었다. 이번 단계의 컴파일·기동 오류는 없었다.
- **남은 작업:** 실제 문의·예약 제출, 사진 업로드/중복/부분 실패·확인키/사업자 권한·export와 AP 없는 Field 흐름은 사용자 최종 검수가 필요하다. AP 상담/위젯·매체/관리자 등 나머지 시안과 문서 기능, 200%/접근성, DB/계약/보안·정식 QA/G는 남았다. 실 인증/LLM/알림/결제/DNS/TLS/백업은 `blocked_integration`; C03/F05/F07 `in_progress`. 운영 배포/발송/청구 없음.
- **다음 에이전트 정확한 명령:** 아래 ready 확인 뒤 최신 계획/TASKS/Field PRD/QA/시안을 읽는다. 다음 파일 범위·요구/QA·명령을 계획에 먼저 쓰고 기능 구현을 계속한다. 사용자 최종 테스트 전 미실행 항목은 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm --filter @fieldai/field-api build
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-api/src/inquiries.ts apps/field-api/src/operations-archive.ts apps/field-web/src/field-api.ts apps/field-web/src/field-public.tsx apps/field-web/src/field-workspace.tsx
# 사용자 최종 테스트 단계
FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm test:contracts
pnpm test:security
pnpm test:e2e:field
```

## 최신 인수인계 — C03/F07 Field 예약 요청 내용·지역·사진 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`을 수시로 확인하며 AP/Field 기능을 사용할 수 있는 환경까지 완성한다. 사용자는 화면 디자인/흐름 최종 확인·인수 테스트와 외부 연동을 나중에 직접 한다. 로컬 mock PTY **97897** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** Field 예약 요청에 내용(필수 UI, 2,000자)·지역/이용 장소(선택, 200자)를 Field DB·공개 POST·고객 확인키/사업자 상세·한 건/전체 JSON export에 연결했다. 예약 사진은 Field 전용 비공개 원장/파일과 고객 확인키 POST/GET·사업자 owner/editor GET, 최대 5장·장당 8MiB·WebP/EXIF 정규화·중복 200·부분 업로드 재시도, 상세 화면/내보내기까지 구현했다. 기존 문의 사진과 제품 간 원본은 변경하지 않았다.
- **수정 파일:** `apps/field-api/migrations/{000048_reservation_request_context,000049_reservation_attachments}.sql`, `apps/field-api/src/{app,bookings,reservation-attachments,reservation-export,operations-archive}.ts`, `apps/field-web/src/{field-api,field-booking,private-reservation-photo}.ts(x)`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. AP 코드/DB·제품 간 연동 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 기존 API 호출의 멱등 요청 해시는 새 필드가 없을 때 이전 JSON 모양을 유지한다. 새 필드가 있으면 정규화한 값을 해시에 포함한다. AP 전달/사업자 수동 예약의 새 필드는 `null`이고, 직접 고객 요청만 값을 저장한다. 사진 바이트는 Field 비공개 media store에 두고 예약 row lock/조직 FK·확인키 또는 membership으로 제한한다. 예약 접수 ACK와 각 사진 저장 ACK는 별도 상태이며 선택한 파일은 브라우저 현재 메모리에서만 유지한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. `pnpm --filter @fieldai/field-api build`, `pnpm --filter @fieldai/field-web typecheck`, 변경 TS/TSX ESLint, `python3 -m py_compile tools/spikes/field-owner-flow-browser.py` exit 0. 최종 `pnpm mock:run` **97897**에서 Field migration 000048·000049 포함 양제품 migration/build/ready, 양 API ready/양 웹 workspace HTTP 200. 실제 승인 카탈로그의 Chromium 320px에서 예약 새 입력 2개·사진 5장 미리보기/6장 거절, 가로 넘침 0·pageerror 0. 실제 예약 POST/사진 업로드·권한·중복·내보내기/전체 DB/E2E·정식 QA는 이번 변경 뒤 미실행이다.
- **실패한 접근:** 기존 예약 폼은 시간·이름·연락처만 받아 시안의 요청 내용/지역/사진을 서버에 전달할 수 없었다. API에는 해당 컬럼과 예약 사진 권한 경로가 없어 UI만 추가해서는 저장·조회가 불가능했다. 이번 단계의 컴파일/기동 실패는 없었다.
- **남은 작업:** 사용자 최종 인수 테스트에서 실제 예약 제출·사진 5장/부분 실패/응답 분실·고객/사업자 권한·한 건/전체 export와 AP 없는 Field 독립 흐름을 검증해야 한다. 예약 사진 실 S3/HEIC·보존/복구, AP 상담/위젯·매체/관리자 등 시안 전체, 200%/키보드/스크린리더, DB/계약/보안·정식 QA/G는 남았다. 인증/LLM/알림/결제/DNS/TLS/백업 공급사는 `blocked_integration`, C03/F07 `in_progress`. 운영 발송/청구/배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready 확인 후 `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md` C03/F07, Field PRD/QA, 시안을 읽는다. 다음 파일 범위·요구/QA·명령을 계획에 먼저 기록하고 남은 기능을 연결한다. 미실행 검사를 통과로 보고하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm --filter @fieldai/field-api build
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-api/src/app.ts apps/field-api/src/bookings.ts apps/field-api/src/reservation-attachments.ts apps/field-api/src/reservation-export.ts apps/field-api/src/operations-archive.ts apps/field-web/src/field-api.ts apps/field-web/src/field-booking.tsx apps/field-web/src/private-reservation-photo.tsx
python3 -m py_compile tools/spikes/field-owner-flow-browser.py
# 사용자 최종 테스트 단계
FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm test:contracts
pnpm test:security
pnpm test:e2e:field
```

## 최신 인수인계 — C03/F05 Field 문의 사진 최대 5장 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`을 수시로 대조하며 독립 AP/Field 실제 화면과 기능을 맞춘다. 사용자 최종 인수 테스트·외부 연동은 이후 직접 진행한다. 로컬 mock PTY **45065** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** Field 직접 문의/확인키 후속 대화에서 최대 5장·장당 8MiB를 선택하고 로컬 썸네일로 확인한다. 고객 메시지 저장 뒤 각 사진을 Field 비공개 API에 순차 첨부하며, 성공분은 선택에서 제거하고 실패/응답 미상의 남은 사진을 같은 문의에서 재시도한다. 서버의 중복 내용 200을 성공으로 처리한다.
- **수정 파일:** `apps/field-web/src/field-public.tsx`, `apps/field-web/src/site.css`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. API/DB/schema/제품 간 계약/AP 코드는 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 기존 Field 서버가 고객 메시지당 5장 제한·동일 내용 멱등 200·8MiB 제한을 제공하므로 계약 변경 없이 UI에서 다중 선택과 순차 업로드를 연결했다. 문의 본문 저장 ACK와 사진 저장 ACK를 다른 상태로 표시한다. 썸네일은 현재 브라우저의 object URL만 쓰고 언마운트 때 해제하며 파일 바이트를 장기 저장하지 않는다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. 승인 카탈로그의 Chromium 320px에서 2/5장 선택·6장 거절, 미리보기 5개 로드·가로 넘침 0·pageerror 0; 기존 1440/390/320px 문의/예약 탭·`#reservation`도 가로 넘침 0·pageerror 0. 최종 `pnpm --filter @fieldai/field-web typecheck`, `pnpm exec eslint apps/field-web/src/field-public.tsx`, `pnpm --filter @fieldai/field-web build` exit 0. 최종 `pnpm mock:run` **45065** 양 API/웹 build·ready, 네 ready/workspace URL HTTP 200. 실제 제출/첨부/부분 실패 E2E·DB/계약/보안·정식 QA는 이번 변경 뒤 미실행이다.
- **실패한 접근:** 기존 단일 `File` UI가 시안의 5장을 선택할 수 없었다. 다중 파일로 바꾼 첫 typecheck는 `noUncheckedIndexedAccess`에 따른 배열 인덱스 `File | undefined` 두 곳에서 exit 2였고, 반복문 경계 내 접근임을 명시해 수정했다.
- **남은 작업:** 실제 사진 업로드/일부 실패/응답 분실·HEIC/실 객체 저장소 검증, 예약 요청의 시안 내용/지역/사진과 실제 API 범위 차이 검토, AP 상담/위젯·매체·관리자 등 나머지 시안/기능 정합, 200%·키보드/스크린리더, 전체 E2E·DB/계약/보안·정식 QA/G. 인증/LLM/알림/결제/DNS/TLS/백업 공급사는 `blocked_integration`, C03/F05 `in_progress`. 운영 발송/청구/배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready 확인 후 최신 계획·TASKS C03/F05/F07·Field PRD/QA·시안을 읽고 다음 파일 범위/요구/명령을 계획에 기록한다. 사용자 최종 테스트 전에는 미실행 항목을 통과로 기록하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm --filter @fieldai/field-web typecheck
pnpm exec eslint apps/field-web/src/field-public.tsx
pnpm --filter @fieldai/field-web build
# 사용자 최종 테스트 단계
FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm test:contracts
pnpm test:security
pnpm test:e2e:field
```

## 최신 인수인계 — C03 Field 고객 후속 대화 시안 정합 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`을 수시 비교하며 독립 AP/Field 실제 화면과 기능을 맞춘다. 사용자는 최종 인수 테스트와 외부 연동을 나중에 직접 한다. 로컬 mock PTY **73675** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** Field 고객이 확인키로 연 후속 문의를 시안의 제목·상태 카드, 고객/사업자 말풍선, 추가 질문 입력, 메시지별 전달 상태로 재배치했다. 확인키 교체·다른 키 열기·사진 재첨부는 접이식 관리 영역에서 유지한다. API의 raw 문의 상태는 고객용 한국어로 표시하고 `visibility=internal` 메시지는 화면에서 제외한다.
- **수정 파일:** `apps/field-web/src/{field-public.tsx,site.css}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. 이번 단계 API/DB/schema/계약/AP 코드 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 원본/권한/확인키 검사는 기존 Field API만 사용한다. 후속 대화 화면은 열람 전 키 입력과 열람 뒤 대화 UI를 구분한다. 내부 메모 방어를 고객 UI에도 명시적으로 둔다. 사진/키 관리는 사라지지 않고 접어 두며 실제 알림 성공으로 오해하지 않게 전달 상태를 보인다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. 기준 대화 시안과 실제 React 화면에 합성 GET 응답을 넣은 Chromium 1440/390/320px 이미지를 비교했고 가로 넘침 0·pageerror 0·합성 내부 메모 표시 0. 이는 실제 확인키 인증/제출 검사가 아니다. 최종 Field web typecheck/변경 TSX ESLint exit 0, 최종 `pnpm mock:run` **73675** 양 API/웹 build·ready 및 네 ready/workspace URL HTTP 200. 전체 실제 제출·확인키 교체/사진 E2E, DB/계약/보안·접근성은 이번 UI 변경 뒤 미실행이다.
- **실패한 접근:** 이전 실제 후속 화면은 확인키 입력·메시지 목록·추가 질문을 범용 한 패널에 이어 붙여 시안의 대화 구조가 없었다. 첫 변경 화면에 raw `needs_owner`가 보이고 320px 제목과 상태가 좁게 붙어, 고객용 상태 매핑과 작은 화면의 제목 줄바꿈을 추가했다.
- **남은 작업:** AP 상담/위젯, Field 예약 후속 대화·다른 고객 템플릿, 매체·각 제품 관리자 등 나머지 시안 화면과 실제 상태 정합; 200% 확대·키보드/스크린리더; 문의/예약 제출·확인키/사진·전체 브라우저 회귀·DB/계약/보안·정식 QA/G. 실 인증/LLM/알림/결제/DNS/TLS/백업 공급사는 `blocked_integration`, C03/F06 `in_progress`. 운영 발송/청구/배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready 확인 후 최신 `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md` C03, 시안 HTML을 읽는다. 다음 화면의 파일 범위·요구/QA·명령을 먼저 계획에 기록하고 1440/390/320px을 대조한다. 사용자 최종 테스트 전에는 미실행 검사를 통과로 보고하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm --filter @fieldai/field-web typecheck
pnpm --filter @fieldai/field-web exec eslint src/field-public.tsx src/field-booking.tsx
# 사용자 최종 테스트 단계
FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:unit
pnpm test:e2e:field
pnpm test:e2e:agent
pnpm test:e2e:distribution
```

## 최신 인수인계 — C03 Field 고객 문의·예약 접수 시안 정합 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`을 계속 대조해 독립 AP/Field의 실제 화면과 기능을 맞춘다. 사용자는 최종 인수 테스트와 실 공급사 연동을 나중에 직접 한다. 로컬 mock PTY **25525** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** Field 고객 직접 문의/예약을 한 화면의 긴 연속 폼에서 시안형 접수 탭, 입력/사업 요약 2열과 모바일 1열로 재배치했다. 실제 승인 카탈로그의 사업명·지역·운영시간·서비스·가격을 표시하며 예약 서비스 선택도 요약에 반영한다. `#reservation` 링크는 예약 탭을 연다. 사진 선택 영역을 시안형으로 정리했고 기존 비회원 제출/확인키 로직은 유지했다.
- **수정 파일:** `apps/field-web/src/{field-public.tsx,field-booking.tsx,site.css}`, `tools/spikes/{field-owner-flow-browser.py,field-tenant-host-browser.py}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. 이번 단계 API/DB/schema/계약/AP 코드 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 문의와 예약 폼은 탭을 바꿔도 컴포넌트를 언마운트하지 않아 현재 입력과 예약 확인 상태가 유지된다. 요약은 실제 승인 값만 사용한다. 공개 사이트의 slug가 이 카탈로그 응답에는 없어서 없는 홈페이지 URL을 만들지 않고 같은 접수 화면의 사업 요약으로 이동시킨다. 고객 가입/OTP는 추가하지 않는다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. 실제 승인 카탈로그의 Chromium 1440/390/320px 문의/예약 화면과 기준 이미지를 비교했다. 탭 이동·`#reservation` 직접 링크, 가로 넘침 0·pageerror 0. `pnpm --filter @fieldai/field-web typecheck`, 변경 TSX ESLint, Field 브라우저 스크립트 2종 `py_compile` exit 0. 최종 `pnpm mock:run` **25525** 양 API/웹 build·ready, 네 ready/workspace URL HTTP 200. 실제 문의/예약 제출 및 응답 미상/확인키 전체 E2E, DB/계약/보안·접근성은 이번 UI 변경 뒤 미실행이다.
- **실패한 접근:** 이전 실제 고객 화면은 사업 정보·문의·예약을 한 페이지에 쌓아 시안의 접수 유형 선택과 입력/요약 구도가 없었다. 예약 요약 초기 시도는 선택 값을 모르는 일반 문구여서 실제 예약 서비스 상태를 부모로 전달해 고쳤다. 사진 선택은 브라우저 기본 영문 파일 버튼이 보였고 라벨형 선택 구역으로 바꿨다.
- **남은 작업:** AP 상담/위젯·Field 다른 고객 템플릿/후속 대화·매체·각 제품 관리자 등 나머지 시안과 실제 상태 정합, 320px/200%·키보드/스크린리더, 전체 브라우저 회귀·DB/계약/보안·정식 QA/G. Field 브라우저 스크립트 2종은 새 탭에 맞췄지만 Python 구문만 확인했다. 인증/LLM/알림/결제/DNS/TLS/백업 실 공급사는 `blocked_integration`; C03/F06/F07 `in_progress`. 운영 발송/청구/배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready를 확인하고 최신 `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md` C03, 시안 HTML을 읽는다. 다음 화면의 파일/요구/QA/명령을 계획에 먼저 기록하고 1440/390/320px 시안·실제 이미지를 대조한다. 사용자 최종 테스트 전에는 미실행 검사를 통과로 보고하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm --filter @fieldai/field-web typecheck
pnpm --filter @fieldai/field-web exec eslint src/field-public.tsx src/field-booking.tsx
python3 -m py_compile tools/spikes/field-owner-flow-browser.py tools/spikes/field-tenant-host-browser.py
# 사용자 최종 테스트 단계
FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:unit
pnpm test:e2e:field
pnpm test:e2e:agent
pnpm test:e2e:distribution
```

## 최신 인수인계 — C03 AP 가입·첫 조직·사업자 관리실 시안 정합 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`을 수시로 대조해 AP/Field 화면과 실제 기능을 맞춘다. 사용자 최종 인수 테스트와 실 공급사 연결은 나중에 수행한다. 로컬 mock PTY **67710** 실행 중: AP `http://localhost:3001`, Field `http://127.0.0.1:3002`, API `127.0.0.1:4311/4321`.
- **완료 작업:** AP 가입을 왼쪽 설명/오른쪽 실제 이메일 가입으로, 신규 조직을 AP AI 시작 카드와 별도 Field 제작 카드로 바꿨다. AP 사업자 관리실은 시안형 오늘 카드·사이드바·모바일 하단 메뉴와 승인 정보/문의함/알림/더보기 화면 전환이다. 오늘 수치는 AP 원본 문의·알림·승인 revision·초안 서비스에서만 읽는다. 카카오 버튼은 미연동 이유와 함께 비활성이다.
- **수정 파일:** `apps/agent-web/src/{workspace.tsx,agent-home.css}`, `tools/spikes/{agent-owner-flow-browser.py,agent-knowledge-autosave-browser.py,account-signout-browser.py}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. 이번 단계 API/DB/schema/계약/Field 코드 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 시안의 시각 구조를 AP에 적용하되 Field 제작은 별도 제품 링크다. Field 계정·예약·업무 원본을 AP 안에 만들거나 성공으로 표시하지 않는다. 승인 정보와 AI 활성화는 별도이며 오늘 AI 상태는 설정에서 확인하도록 안내한다. UI 메뉴는 긴 한 페이지의 폼을 숨기고 현재 화면만 보이게 한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock. 실제 AP 계정 가입→조직 생성→오늘/승인 정보 이동을 Chromium 1440/390/320px에서 확인했고 가로 넘침 0, `pageerror` 0. `pnpm --filter @fieldai/agent-web typecheck`, 변경 TSX ESLint, AP 브라우저 스크립트 3종 `py_compile` exit 0. `pnpm mock:run` **67710** 양 API/웹 build·ready; 네 API ready/웹 workspace URL HTTP 200. 전체 사업자→고객 E2E, DB/계약/보안, 최종 인수 테스트는 이번 UI 변경 뒤 미실행이다.
- **실패한 접근:** 이전 AP 가입은 일반 카드 두 개, 조직은 화면 전체 폭의 단일 폼, 사업자 정보/문의는 긴 같은 페이지여서 시안과 차이가 컸다. 모바일 승인 정보 첫 배치는 제목·상태가 좁게 줄바꿈되고 추가 버튼에 브라우저 기본 스타일이 남아 있었으며, 후속 CSS와 실제 스크린샷 재확인으로 수정했다.
- **남은 작업:** AP 고객 상담·외부 위젯, Field 문의/예약과 기타 템플릿, 매체·각 제품 관리자 등 나머지 시안 화면의 실제 데이터/상태 정합; 320px/200% 확대·키보드/스크린리더; 전체 기능/회귀·DB/계약/보안·정식 QA/G. 새 메뉴에 맞춘 AP 스크립트는 Python 구문만 확인했으므로 사용자 최종 테스트 단계에 실행한다. 운영 인증·LLM·알림·결제·DNS/TLS/백업 공급사는 `blocked_integration`, C03/A01/A03은 `in_progress`. 운영 발송/청구/배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready를 확인하고 `docs/technical/PHASE_2_EXECUTION_PLAN.md`의 최신 AP 시안 섹션, `TASKS.md` C03, 기준 HTML을 읽는다. 다음 화면의 수정 전 파일/QA/검사 명령을 계획에 기록하고 기준/실제 1440/390/320px을 비교한다. 사용자의 최종 테스트 시점 전에는 미실행 검사를 통과로 보고하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm --filter @fieldai/agent-web typecheck
pnpm --filter @fieldai/agent-web exec eslint src/workspace.tsx
python3 -m py_compile tools/spikes/agent-owner-flow-browser.py tools/spikes/agent-knowledge-autosave-browser.py tools/spikes/account-signout-browser.py
# 사용자 최종 테스트 단계
AP_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:agent-owner-flow:http
pnpm test:unit
pnpm test:e2e:agent
pnpm test:e2e:field
pnpm test:e2e:distribution
```

## 최신 인수인계 — C03 시안 v3 화면 정합과 예약 충돌 복구 (2026-09-26)

- **현재 목표:** `reference/field_ui_prototype_v3.html`의 화면/기능을 수시 비교하며 v3.0 문서의 독립 AP·Field 서비스를 완성한다. 사용자는 최종 인수 테스트와 외부 공급사 연동을 나중에 직접 수행한다. 로컬 mock PTY **25148**: AP `http://localhost:3001/`, Field `http://127.0.0.1:3002/`, API `127.0.0.1:4311/4321`. 두 API ready/두 웹 홈 HTTP 200.
- **완료 작업:** Field 홈·가입·가입 후 선택·사업자 오늘/메뉴를 시안과 비교해 재배치했다. 메뉴는 오늘/문의/예약/서비스/알림/더보기로 화면 전환하며 문의·예약 수치는 실제 Field API 목록, AI 상태는 Field의 AP 위젯 설치 API를 사용한다. 사이트 편집기는 좌측 입력/우측 실제 미리보기와 모바일 전환/하단 저장 행, 고객 기본 템플릿은 사업체 표식·2열 소개·서비스 카드·Field 직접 문의/예약 링크다. AP 첫 화면은 AI 단독 소개/두 선택 카드이며 Field 제작은 별도 주소다. 시간표 예약 확정 409 `slot_unavailable`/`policy_not_set`은 이전 슬롯·제출 키 해제 후 현재 가능 시간을 재조회한다.
- **수정 파일:** `apps/field-web/src/app/page.tsx`, `apps/field-web/src/{field-home.tsx,field-workspace.tsx,field-booking.tsx,field-site.tsx,site.css}`, `apps/field-web/test/home-entry.test.tsx`, `apps/agent-web/src/app/{page.tsx,layout.tsx}`, `apps/agent-web/src/{agent-home.tsx,agent-home.css}`, `tools/spikes/{field-owner-flow-browser.py,field-catalog-autosave-browser.py,account-signout-browser.py}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. 제품 API/DB/schema/계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 시안의 구도와 문구를 따르되 단일 계정·역할 전환·localStorage 업무 원장은 복사하지 않는다. AP/Field 세션과 DB는 분리한다. 공개 전 초안은 접수 가능한 사이트로 표시하지 않고 AP 위젯 설치를 실제 AI 응답 성공으로 해석하지 않는다. 사이트 장식에 임의 가격·사진·후기·경력을 만들지 않는다. 확정 실패 409만 새 시간 선택으로 풀고 저장 결과 미상/멱등 충돌은 복구 장벽을 유지한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock, Git 없음. 기준/실제 홈·가입·사업자·편집기·고객 기본 템플릿·AP 홈을 Chromium 1440/390/320px 이미지로 비교했다. 주요 화면 가로 넘침 0, Field 가입→조직 생성→메뉴 이동/모바일 편집→미리보기와 AP CTA href를 확인했다. 초기 Field 홈 unit red 2건→구현 뒤 13/13 green은 후속 사업자/사이트 변경 **전** 결과다. 예약 409 브라우저는 재조회 timeout red→수정 직후 전체 Field owner/guest 실제 HTTP 1/1(약 49초)이며 이 역시 후속 화면 변경 전 결과다. 최종 Field/AP web `typecheck`, 변경 TSX ESLint, 브라우저 스크립트 3종 `py_compile`, AP web build exit 0. 새 `pnpm mock:run` **25148** 양제품 build·ready, 네 HTTP 200. 후속 변경된 전체 E2E/단위/DB/계약/보안은 재실행하지 않았다.
- **실패한 접근:** 기존 Field 홈/사업자/편집기와 AP 홈은 범용 페이지·긴 폼 배치라 시안과 크게 달랐다. 실제 스크린샷 비교로 수정했다. 예약 첫 409는 결과 미상처럼 키를 붙잡아 새 슬롯 선택/availability 조회가 막혔고 320px red로 확인했다.
- **남은 작업:** 새 화면을 포함한 AP/Field 전체 사업자→고객 회귀; AP 사업자 내부, Field 문의·예약, 고객·매체·각 관리자 전체 시안 정합/기능; 320px/200% 확대·키보드/스크린리더; 문서 잔여 기능과 실 인증/LLM/알림/결제/DNS/TLS/백업·정식 QA/G. 스크립트 3종은 새 UI에 맞췄지만 Python 구문만 확인했으므로 사용자 최종 테스트 단계에서 실행한다. 공급사 미연결은 `blocked_integration`, C03/F03/F04/F07은 `in_progress`. 운영 발송/청구/배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready 확인 후 `docs/technical/PHASE_2_EXECUTION_PLAN.md` 최신 시안 섹션·`TASKS.md` C03·시안 HTML을 읽는다. 다음 화면을 시안과 나란히 비교하고 수정 전 범위/QA/검사 명령을 실행 계획에 기록한다. 전체 회귀는 사용자 요청대로 최종 테스트 단계에 모으고 미실행을 통과로 보고하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/
curl -I http://127.0.0.1:3002/
pnpm --filter @fieldai/agent-web typecheck
pnpm --filter @fieldai/field-web typecheck
/tmp/fieldai-report-venv/bin/python -m py_compile tools/spikes/field-owner-flow-browser.py tools/spikes/field-catalog-autosave-browser.py tools/spikes/account-signout-browser.py
# 사용자 최종 테스트 단계
FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:spike:catalog-autosave:http
pnpm test:spike:signout:http
pnpm test:unit
pnpm test:e2e:agent
pnpm test:e2e:field
pnpm test:e2e:distribution
```

## 최신 인수인계 — C03/F07/QA26 Field 가능 시간 조회 실패 복구 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 디자인 기준의 독립 AP·Field 기능을 끝까지 연결해 사용할 수 있는 환경을 만든다. 기능을 먼저 완성하고 사용자 디자인/흐름 확인은 이후다. 로컬 mock PTY **17759** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API `127.0.0.1:4311/4321`; 네 ready/workspace endpoint HTTP 200.
- **완료 작업:** Field 고객의 시간표 예약 가능 시간 조회가 실패/미설정/빈 결과일 때 같은 날짜·서비스를 다시 확인할 수 있다. 서비스/날짜 변경 또는 재조회 시작 시 이전 슬롯과 선택을 즉시 지우고 새 조회 성공 전 제출을 막는다. 고객 이름·연락처·동의는 남고 접수와 사업자 확정은 별도다.
- **수정 파일:** `apps/field-web/src/field-booking.tsx`, `tools/spikes/field-owner-flow-browser.py`, `docs/02_FIELD_PRD.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `docs/CODEX_HANDOFF.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터/report. Field/AP API·DB/schema/제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** Field 공개 availability 조회의 `idle/loading/ready/empty/unconfigured/failed` 화면 상태와 재조회 revision을 분리한다. 날짜/서비스가 바뀌는 이벤트에서 이전 옵션을 바로 지워 효과 실행 전에도 옛 슬롯을 제출할 수 없게 한다. 조회는 현재 조건만 사용하고 미확정 예약은 점유/확정으로 표시하지 않는다.
- **실제 검사/환경/커밋:** 제품별 로컬 PostgreSQL 17·Field Valkey·mock, Git 없음. `FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http`의 첫 503 후 재조회 버튼 부재는 timeout red(exit 1). 수정 뒤 동일 명령 1/1(49초), 추가 지연 GET의 이전 슬롯/제출 차단을 더해 전체 1/1(49초). `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·Python `py_compile` exit 0. `pnpm mock:run` **17759** 양 API/웹 build·ready, 네 HTTP ready/workspace 200. `tools/build_report.py` exit 0, `tools/check_package.py`는 문서 패키지만 passed/exit 0(46 tasks·160 QA, 서비스 테스트 아님). 이 UI/브라우저 변경 뒤 제품 DB·계약·보안 전체 명령은 재실행하지 않았다.
- **실패한 접근:** 기존 화면은 첫 GET 503에서 슬롯을 비웠지만 같은 날짜 재조회 버튼이 없어서 날짜를 바꿔야 했다. 선택했던 슬롯도 새 조회 시작까지 남아 있었다. 브라우저 red와 지연 GET 검수로 확인하고 수정했다.
- **남은 작업:** C03 화면 공통 템플릿·실제 데이터 상태·전체 접근성(200% 확대/키보드/스크린리더)과 사용자 시각 검토; F07 실알림·복구·정식 QA25~34/G-F2; I01~I08 잔여와 실 인증/LLM/알림/결제/DNS/TLS/백업·정식 QA/G. 공급사 자격증명/계약 부재는 `blocked_integration`; C03/F07은 `in_progress`. 운영 발송/청구/배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready를 확인하고 `TASKS.md` C03/F07·`docs/02_FIELD_PRD.md` 3.7·QA25~34, `apps/field-web/src/field-booking.tsx`와 현재 브라우저 검사를 읽는다. 다음 기능 결함의 파일/QA/검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 제품별 DB/domain/identity를 유지하고 실 공급사 성공을 mock으로 통과 표시하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/A05/QA24 AI 실패 질문 초안 포화 복구 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 디자인 기준의 독립 AP·Field 기능을 끝까지 연결해 사용할 수 있는 환경을 만든다. 사용자 디자인/흐름 확인은 기능 다음이다. 로컬 mock PTY **41820** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API `127.0.0.1:4311/4321`.
- **완료 작업:** AP 상담 링크에서 AI 질문 실패/결과 미상 시 사람 문의 초안이 5,000자 한도로 질문을 받지 못하면 누락 안내와 재추가 버튼을 표시한다. 기존 초안/AI 질문은 유지하고 고객이 내용을 줄인 뒤 같은 질문을 한 번 더할 수 있다. 초안에 실제 추가되지 않았는데 추가됐다고 말하던 공급사 오류 안내도 바로잡았다. AP/Field DB/API/권한/제품 간 계약은 바뀌지 않았다.
- **수정 파일:** `apps/agent-web/src/agent-public.tsx`, `tools/spikes/{agent-field-same-page-browser.py,ap-field-connection-http.test.mjs}`, `docs/{01_AGENT_PLATFORM_PRD.md,CODEX_HANDOFF.md,technical/PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터/report. Git 저장소/커밋 없음.
- **핵심 설계 결정:** AI 실패 질문 원문은 현재 화면의 AI 입력에서만 유지하고 브라우저 장기 원장에 추가하지 않는다. 최신 사람 문의 입력을 ref에 동기화해 비동기 AI 응답이 사용자가 수정한 초안을 덮지 않는다. 자동 추가가 실제로 실패한 경우에만 누락 배너를 띄우며, 재추가가 성공하면 배너를 제거한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock 연결, Git 없음. 신규 320px Chromium에서 4,990자 초안+AI 질문/공급사 503의 누락 안내 timeout red. 수정 뒤 첫 전체 HTTP 검사는 기존의 부정확한 문구 단언에서 실패했으나 초안 값 검사는 유지한 채 문구만 갱신했다. 최종 `pnpm mock:run` **41820** 양 API/웹 build/ready, `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1(112초): 긴 초안 유지→축소→질문 한 번 추가, 기존 AP/Field 연결·사진·위젯·사건·해제. `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·Python `py_compile` exit 0. 실제 모델 공급사 성공을 모의 서비스로 표시하지 않는다. 이 UI/브라우저 변경 뒤 제품 DB·계약·보안 명령은 재실행하지 않았다.
- **실패한 접근:** 기존 helper는 5,000자를 넘으면 초안을 그대로 반환했지만, 화면은 누락을 안내하지 않았다. 신규 브라우저 red로 확인했다. 첫 수정 뒤 기존 문구 단언 실패를 테스트 값 검사는 유지한 채 고쳤다.
- **남은 작업:** 실제 모델 정상 응답→사람/Field 인계는 공급사 자격증명이 없어 `blocked_integration`; 공급사 상태 조회·중단 실행 수동 해결, C03 실제 데이터/키보드·200% 확대·스크린리더/사용자 디자인 검토, I01~I08 잔여, 실 인증/알림/결제/DNS/TLS/백업·정식 QA/G. C03/A05는 `in_progress`; 운영 발송/청구/배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready를 확인하고 `TASKS.md` C03/A05, AP PRD 2.6, QA24, `agent-public.tsx`의 실패 질문 보존과 사람 문의 제출을 읽는다. 다음 파일 범위·QA·검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 실제 모델 설정이 없다면 정식 성공을 주장하지 않고 다른 C03 기능/복구 경로를 이어간다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm lint
pnpm typecheck
pnpm test:unit
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A05/C03/QA21·24 오래된 AI 실행 결과 미상 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 디자인 기준의 독립 AP·Field 기능을 끝까지 연결해 사용할 수 있는 환경을 만든다. 기능 구현을 먼저 진행하고 사용자 디자인/흐름 확인은 이후다. 로컬 mock PTY **26057** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API `127.0.0.1:4311/4321`.
- **완료 작업:** AP 고객 AI 실행이 5분 이상 `in_progress`면 같은 키 recover/POST가 `result_unknown`을 알린다. AP 링크는 새로고침 후 서버의 질문을 사람 문의 초안에 보존하고, 외부 iframe은 명시 재조회와 AP 사람 문의 경로를 제공한다. 실행 원장과 사용량을 임의로 종료하거나 재시작하지 않는다. 다른 키의 AI 질문은 기존 실행 중 409로 차단하며, 원래 모델이 늦게 완료되면 같은 키에서 완료 답변을 읽는다.
- **수정 파일:** `apps/agent-api/src/{customer-consultations,deployments}.ts`, `apps/agent-api/test/customer-consultations.db.test.ts`, `apps/agent-web/src/agent-public.tsx`, `tools/spikes/{agent-field-same-page-browser.py,field-ap-widget-browser.py}`, `docs/{01_AGENT_PLATFORM_PRD.md,CODEX_HANDOFF.md,technical/PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터/report. DB migration, Field 내부와 제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** AP DB의 실행 `started_at`·상태로 조회 시점의 5분 경과를 계산한다. `result_unknown`은 저장 상태가 아니므로 완료를 덮어쓰지 않는다. 같은 키 replay는 202와 30초 `Retry-After`, 새 키는 기존 active 실행이 차단한다. 공급사 상태 조회/취소 API가 없는 동안 고객의 안전한 경로는 같은 실행 상태 재조회와 AP 사람 문의다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock, Git 없음. 6분 전 실행의 recover가 기존 `in_progress`로 나와 AP DB red; AP 링크 320px `result_unknown` 주입도 안내 timeout red. 수정 후 `pnpm test:spike:consultations:agent` 1/1, `pnpm test:db:agent` 20/20(진행→미상→늦은 완료·새 키 차단, `Retry-After` 2/30초). `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·Python `py_compile` exit 0. 최종 `pnpm mock:run` **26057** 양 API/웹 build/ready. `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1(114초): AP 링크의 새로고침 미상→사람 초안→재조회 완료, iframe의 미상→재조회→원본 답변과 기존 양제품 흐름. `pnpm test:contracts` 정적 2/2+제품 DB 5/5, `pnpm test:security` import/교차 DB credential·AP 20/20·Field 19/19·tenant/양 관리자 exit 0. 문서 재생성·`tools/check_package.py` 통과(scope 문서만), 양 API/웹 endpoint HTTP 200. 브라우저 AI 응답은 합성 주입이다.
- **실패한 접근:** 이전 구현은 5분 이상 경과한 실행도 계속 `in_progress`로 표시해 고객이 중단 가능성을 알 수 없었다. API/브라우저 red로 확인하고 DB status를 강제 종료하지 않는 조회 상태를 추가했다.
- **남은 작업:** 실 공급사 종료 상태 조회/수동 해결·운영 타임아웃 정책, 실제 모델 정상 답변→사람/Field 인계, C03 실제 데이터·접근성·사용자 디자인 검토, I01~I08 잔여, 실 인증/LLM/알림/결제/DNS/TLS/백업·정식 QA/G. 공급사 credential/계약 부재는 `blocked_integration`; A05/C03는 `in_progress`. 운영 고객 발송/청구/배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready와 검사 결과를 확인하고 AP PRD 2.6, QA21/24, `apps/agent-api/src/customer-consultations.ts`의 `customerAiRun`/recover, AP 링크·iframe 결과 미상 분기를 읽는다. 다음 단계 파일 범위·QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 실제 모델 연결 전에는 중단 실행을 자동 재실행/성공 처리하지 않는다. 다른 C03 고객 핵심 경로 또는 준비된 공급사 연동을 이어간다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:spike:consultations:agent
pnpm lint
pnpm typecheck
pnpm test:unit
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm test:security
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A05/C03/QA21·24 AI 질문 응답 분실 멱등 복구 (2026-09-25)

- **현재 목표:** v3.0 개발 명세와 `reference` 디자인을 기준으로 독립 AP·Field 기능을 연결해 사용할 수 있는 환경을 만든다. 사용자 디자인/흐름 확인은 기능 다음이다. 로컬 전체 mock PTY **61826** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API `127.0.0.1:4311/4321`.
- **완료 작업:** AP 상담 AI 질문에 대화별 해시 멱등 키를 추가했다. 같은 키/질문 POST는 완료 답변·진행 202·확정 실패를 재사용하고 다른 질문은 409다. 유효 상담 세션의 recover GET으로 응답 분실 뒤 실행 상태를 조회한다. AP 링크는 원문 없이 키/질문 SHA-256을 탭에 임시 보관해 새로고침 복구하고, 외부 iframe은 결과 미상에 같은 키 재시도·상태 재조회 버튼을 제공한다. 답변 수락 뒤 원본 목록이 실패하거나 200이지만 답변을 아직 포함하지 않으면 임시 답변을 표시하고 원본 복구 전 중복 질문을 막는다. 사람 문의 경로는 유지한다.
- **수정 파일:** `apps/agent-api/migrations/000058_customer_ai_idempotency.sql`, `apps/agent-api/src/{customer-consultations,deployments}.ts`, `apps/agent-api/test/customer-consultations.db.test.ts`, `apps/agent-web/src/{agent-public.tsx,pending-ai-submission.ts}`, `tools/spikes/{agent-field-same-page-browser.py,field-ap-widget-browser.py,ap-field-connection-http.test.mjs}`, `docs/{01_AGENT_PLATFORM_PRD.md,CODEX_HANDOFF.md,technical/PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터/report. Field 내부 변경과 제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** AP 조직 행 잠금 안에서 키를 재검사하고 실행을 기록해 다중 API 요청의 동일 키 경쟁을 한 모델 실행으로 수렴시킨다. DB에는 키 해시만 두며 브라우저 임시 원장에도 질문 원문을 저장하지 않는다. 진행 중/조회 장애를 성공으로 표현하지 않는다. 확정 실패는 같은 키로 모델을 다시 실행하지 않으므로 새 질문을 하려면 새 키가 필요하다. 프로세스가 모델 실행 중 중단되면 남은 `in_progress`를 자동 성공·재시도로 처리하지 않는다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock 연결, Git 없음. 신규 recover DB 404 red, iframe 신규 브라우저 복구 안내 timeout red. 대화 GET 200에서 답변 누락도 조기 완료로 처리해 timeout red. `pnpm test:spike:consultations:agent` 1/1, `pnpm test:db:agent` 20/20. 후속 동시 동일 키 POST 검사도 1/1·보안 명령 AP 20/20으로 확인: POST 200/202·모델 1회·AI run 1건·원본 메시지 2건. 완료/진행/거절 recover, 무세션 401, 다른 질문 409도 검증했다. `pnpm lint`·`pnpm typecheck`·`pnpm test:unit` exit 0, 최종 위젯 수정 후 lint/typecheck·Python 구문 exit 0. 최종 `pnpm mock:run` **61826** 양 API/웹 build/ready. `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1(105초): 320px 링크 ACK 유실→첫 recover 503→새로고침 복구, iframe ACK 유실→첫 recover 503→명시 재조회→답변 빠진 목록 200→원본 복구 및 기존 양제품 기능. `pnpm test:contracts` 정적 2/2+제품 DB 5/5, `pnpm test:security` 교차 import/DB credential·AP 20/20·Field 19/19·tenant/양 관리자 exit 0. 문서 재생성·`tools/check_package.py` 통과(scope 문서만), 양 API/웹 endpoint HTTP 200. 브라우저 AI 응답은 합성 주입이다.
- **실패한 접근:** 기존 AI POST는 응답 유실 후 같은 질문을 다시 보내면 실행/사용량이 중복될 수 있었고 상태 조회 API가 404였다. 외부 위젯도 결과 미상 안내가 없어 신규 검사가 timeout이었다. 첫 수정 뒤에는 목록 GET 200만으로 임시 답변을 지워, 답변 누락 200 브라우저 검사에서 다시 red였다. 원본에 동일 AI 답변이 나타나야만 해제하도록 고쳤다. 시스템 기본 Python에는 Playwright가 없어 프로젝트 venv를 사용한다.
- **남은 작업:** 중단된 `in_progress` 실행의 시간초과·운영자 복구 정책, 실모델 정상 답변→사람/Field 인계, C03 실제 데이터/키보드·200% 확대·스크린리더/사용자 디자인 검토, I01~I08 잔여, 실 인증/LLM/알림/결제/DNS/TLS/백업·정식 QA/G. 공급사 credential/계약 부재는 `blocked_integration`; A05/C03는 `in_progress`. 운영 고객 발송/청구/배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready/검사를 확인하고 AP PRD 2.6, TASKS A05/C03, QA21/24, `apps/agent-api/src/customer-consultations.ts`의 AI POST/recover와 `apps/agent-web/src/agent-public.tsx`의 복구 UI를 읽는다. 다음 파일 범위·QA·검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 우선 오래된 `in_progress` 실행의 안전한 결과 미상 정책과 사업자 대응 경로를 구현하거나, 실제 모델 credential이 제공되면 정상 답변→사람/Field 인계를 별도 검수한다. 제품별 DB/identity/queue/secret을 유지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:spike:consultations:agent
pnpm lint
pnpm typecheck
pnpm test:unit
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm test:security
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/QA21·24 AI 답변 원본 재조회 복구 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인 기준으로 AP·Field 독립 서비스 기능을 끝까지 연결해 사용할 수 있는 환경을 만든다. 사용자 디자인/흐름 확인은 기능 다음이다. 로컬 전체 mock PTY **5260** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API `127.0.0.1:4311/4321`.
- **완료 작업:** AP 상담의 AI 답변 POST 200 뒤 대화 GET이 실패해도 수락 답변을 임시 패널에 표시한다. 원본 목록의 같은 답변을 확인할 때까지 AI 재질문을 막고 사람 문의를 유지한다. 고객의 명시 재조회 200은 임시 답변을 서버 원본 메시지로 교체한다. 200 응답의 대화 ID/메시지 형태가 틀리면 복구로 처리하지 않는다.
- **수정 파일:** `apps/agent-web/src/agent-public.tsx`, `tools/spikes/{agent-field-same-page-browser.py,ap-field-connection-http.test.mjs}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계 및 재생성 마스터/report. 제품별 API/DB/공개 계약/Field 내부 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** POST 200은 AP API가 원본 메시지를 commit한 후 반환하므로 답변 본문을 고객에게 즉시 보여줄 수 있다. 후속 GET은 별도 실패로 다루며, 그 실패를 AI POST 실패처럼 표현하지 않는다. 재조회가 실제 같은 답변을 담을 때만 임시 표시를 제거한다. 브라우저 주입은 UI 상태 검수로, AP DB 합성 모델 검사는 API 저장 검수로 분리한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock 연결, Git 없음. 신규 320px 검사에서 합성 POST 200/GET 503 때 수락 답변 표시 timeout red. 수정 뒤 `pnpm lint`·`pnpm typecheck`·`pnpm test:unit` exit 0, `pnpm test:spike:consultations:agent` 1/1은 실제 API POST 200→GET 고객/assistant 원본을 확인했다. `pnpm mock:run` **5260** 양제품 API/웹 build/ready. 정리된 과거 fixture ID의 단독 Chromium 검사는 제목 timeout으로 실패했으며 코드 결과를 뜻하지 않는다. 새 배포를 만드는 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http`는 1/1(103.2초), 320px 수락 답변/GET 실패/재조회 200·기존 Field 사진/위젯/사건/해제 통과. 브라우저 POST/GET은 합성 응답이며 실제 공급사 검수 아님.
- **실패한 접근:** 기존 화면은 GET 실패 시 AI 답변을 보이지 않게 하고 성공 안내만 표시했다. 신규 red로 재현했다. 이전 임시 배포 ID로 단독 browser green을 시도했으나 fixture 정리로 실패해 전체 검사에서 새 배포를 만들었다. 테스트를 삭제하거나 기대값을 낮추지 않았다.
- **남은 작업:** AI POST 성공 후 응답 자체가 유실되는 경우의 원본 조회/멱등 복구, 실제 모델 응답 중 사람·Field 인계, 사람 초안 5000자 포화 안내, C03 실제 데이터/키보드·200% 확대·스크린리더/사용자 디자인 검토, I01~I08 잔여, 실 인증/LLM/알림/결제/DNS/TLS/백업·정식 QA/G. 공급사 credential/계약 부재는 `blocked_integration`; C03는 `in_progress`. 고객 발송/청구/운영 배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready를 확인하고 AP PRD 2.6, TASKS C03/A05, QA21/24, `apps/agent-web/src/agent-public.tsx`의 `askAi`와 `apps/agent-api/src/customer-consultations.ts`의 POST/GET을 읽는다. 새 단계의 파일 범위·QA·검사 명령을 실행 계획에 먼저 기록한다. 우선 AI POST가 서버에 저장됐으나 응답을 잃은 경우 중복 모델 호출을 막고 원본을 복구한다. 제품별 DB/domain/세션은 유지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:spike:consultations:agent
pnpm lint
pnpm typecheck
pnpm test:unit
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/QA24 AI 실패 질문의 사람 문의 초안 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인 기준으로 AP·Field 독립 서비스 기능을 끝까지 연결해 사용할 수 있는 환경을 만든다. 사용자 디자인/흐름 확인은 기능 다음이다. 로컬 전체 mock PTY **42212** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API `127.0.0.1:4311/4321`.
- **완료 작업:** AP 상담 AI 대화 시작 503, 답변 근거 거절 422, 네트워크 중단, 서버 500 및 기타 실패 때 고객 질문을 같은 화면 사람 문의 초안에 보존한다. 기존 초안은 지우지 않고 같은 질문 재시도는 중복하지 않는다. 실패한 AI 질문 입력은 남고, 성공 시 요청 중 고객이 새로 적은 질문은 지우지 않는다. 고객은 기존 AP 세션에서 사람 문의 또는 준비된 Field 경로를 이어갈 수 있다.
- **수정 파일:** `apps/agent-web/src/agent-public.tsx`, `tools/spikes/agent-field-same-page-browser.py`, `tools/spikes/ap-field-connection-http.test.mjs`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계 및 재생성 마스터/report. API/DB/제품 간 계약/Field 내부 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 요청 시작 시 질문을 캡처하고 실패 경로에서만 사람 초안에 추가한다. 기존 내용이 있으면 줄바꿈으로 붙이고 포함된 같은 질문은 다시 추가하지 않는다. 초안 최대 5000자를 넘기지 않으며 이 경우 AI 입력란에 질문이 유지된다. AI 성공 응답 후 새 입력을 덮어쓰지 않는다. 오류 상태의 브라우저 응답 주입은 UI 검수로만 간주하고 공급사 정상 응답을 모의 성공으로 기록하지 않는다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey·mock 연결, Git 없음. 신규 320px Chromium 검사는 대화 시작 503에서 사람 초안이 비어 red였다. 수정 후 첫 새 mock **66339** 전체 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1(103.5초). 기존 초안/중복 검사 추가와 helper 보정 뒤 최종 새 mock **42212** 양제품 API/웹 build·ready, 같은 전체 HTTP/320px 1/1(103.8초). 시작 503·답변 422·네트워크 중단·서버 500은 브라우저 응답 주입이며 실제 AP→Field 요청/사진/위젯/해제 경로도 전체 검사에서 통과했다. 첫 수정 후 `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·Python `py_compile` exit 0, 최종 helper/검사 수정 후 lint/typecheck/py_compile exit 0. 마지막 수정 뒤 unit/제품 DB/계약/보안 명령은 별도 재실행하지 않았다.
- **실패한 접근:** 기존 화면은 503 시작 오류에서 AI 입력만 남기고 사람 초안을 비워 두었다. 브라우저 red로 확인했고, 오류 분기를 공통 보존 경로로 바꿨다. 검사를 삭제하거나 기대값을 낮추지 않았다.
- **남은 작업:** 실모델 정상 답변→같은 화면 사람/Field 인계, 모델 응답 성공 후 대화 조회 실패 복구, 사람 초안 5000자 포화 시 명확한 안내, C03 실제 데이터/키보드·200% 확대·스크린리더/사용자 디자인 검토, I01~I08 잔여, 실 인증/LLM/알림/결제/DNS/TLS/백업·정식 QA/G. 공급사 credential/계약 부재는 `blocked_integration`; C03는 `in_progress`. 고객 발송/청구/운영 배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready를 확인하고 AP PRD 2.6, TASKS C03, QA24, `apps/agent-web/src/agent-public.tsx`의 `askAi`/대화 조회를 읽는다. 새 단계의 파일 범위·QA·검사 명령을 실행 계획에 먼저 기록한다. 우선 성공한 AI 답변 뒤 대화 조회가 실패하는 경우와 실모델 응답 중 화면 인계/Field 경로를 검수한다. DB/domain/세션을 합치지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm lint
pnpm typecheck
pnpm test:unit
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I04/C03/QA143 익명 Field 사전 조회 한도 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인 기준의 AP·Field 독립 서비스를 기능 끝까지 연결해 사용할 수 있는 환경으로 만든다. 사용자 화면 디자인/흐름 확인은 기능 이후다. 로컬 전체 mock PTY **13869** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API `127.0.0.1:4311/4321`.
- **완료 작업:** 익명 AP 상담의 Field 사전 GET/직접 준비 POST가 실제 Field `/me`·`/facts`를 호출하기 전에 제품별 AP DB의 조직별 1분 한도를 소비한다. 기본 120건, 설정 가능 1~1000. 초과하면 429·`Retry-After`/화면 안내를 반환하며 고객 연락처·대화 상태/알림을 바꾸지 않는다. 연결 없는 AP-only 상담/사람 문의와 이미 수락된 같은 제출 키의 복구는 제한하지 않는다.
- **수정 파일:** `apps/agent-api/migrations/000057_field_preflight_organization_windows.sql`, `apps/agent-api/src/{field-preflight-limit,customer-consultations}.ts`, `apps/agent-api/test/customer-consultations.db.test.ts`, `apps/agent-web/src/agent-public.tsx`, `tools/spikes/{agent-field-same-page-browser.py,ap-field-connection-http.test.mjs}`, `docs/{03_INTEGRATION_CONTRACT.md,CODEX_HANDOFF.md,technical/PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터/report. Field 내부 DB/API 및 제품 간 공개 DTO 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** AP 조직 1분 행의 `INSERT ... ON CONFLICT DO UPDATE`로 여러 API 인스턴스의 동시 조회를 원자적으로 제한한다. 연결 후보가 없는 경우 한도를 소비하지 않고, 유효 연결의 실제 외부 조회 직전에만 소비한다. 조직 전체 한도가 특정 고객의 정상 직접 요청을 잠시 막을 수 있으므로 사람 문의를 별도 유지한다. 429는 Field 장애 상태와 구분하며 기존 수락 제출 키 조회는 원장 소비보다 먼저 처리한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock 연결/합성 계정, Git 없음. 신규 상담 검사는 migration 전 42P01 red. migration/API/UI 뒤 `pnpm test:spike:consultations:agent` 1/1·`pnpm test:db:agent` 20/20/임시 DB 삭제. 합성 한도 2에서 정상 GET 2개→세 번째 GET/직접 POST 429·Field 호출 수 불변·PII null/`ai_assisting`, 기존 수락 키 200·사람 문의 201·1분 경과 뒤 회복 200. 동시 GET 3개는 200/200/429, Field `/me`·`/facts` 총 4회. `pnpm mock:run` **13869** 양 API/웹 build/ready. `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1(320px 429 안내/재조회 응답 주입·정상 직접 Field 요청/사진·기존 SDK/사건/해제). `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·Python `py_compile` exit 0, `pnpm test:contracts` 정적 2/2+제품 DB 5/5, `pnpm test:security` import/교차 DB credential/AP 20/20/Field 19/19/tenant/양 관리자 exit 0.
- **실패한 접근:** 기존 공개 사전 조회는 익명 요청마다 Field API를 반복 호출할 수 있었다. 신규 검사는 원장 표가 없어 red였고, migration 뒤 한도/경쟁 검사까지 통과했다. 기존 기능 검사를 삭제하거나 기대값을 낮추지 않았다.
- **남은 작업:** 운영 역프록시/IP별 남용 정책·실부하와 조직 한도에 의한 정상 고객 차단 정책, 실제 Field 장기 장애·두 실제 조직 OAuth/부분 장애, 실모델 응답 중 Field route/화면 인계, 실 객체 저장소·악성코드/보존/복구, C03 사용자 디자인/흐름·200% 확대·키보드/스크린리더, I01~I08 잔여, 실 인증/LLM/알림/결제/DNS/TLS/백업·정식 QA/G. 공급사 credential/계약 부재는 `blocked_integration`; C03/I04는 `in_progress`. 고객 발송/청구/운영 배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready 확인 후 `TASKS.md` C03/I04와 `docs/03_INTEGRATION_CONTRACT.md` 4.6, QA16/143, 공개 상담·Field preflight 한도를 읽는다. 다음 파일 범위·QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 우선 실모델 응답 중 직접 Field 경로/화면 인계 또는 C03 실제 데이터/접근성 핵심 경로를 검수한다. 제품별 DB/domain/세션을 합치지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:db:agent
pnpm test:contracts
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm test:security
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I04/C03/QA143 Field 현행 상태 사전 확인 (2026-09-25)

- **현재 목표:** v3.0 개발 문서와 `reference` 디자인 기준의 AP·Field 독립 서비스를 기능 끝까지 연결해 사용할 수 있는 환경으로 만든다. 사용자의 디자인/흐름 검토는 기능 다음이다. 로컬 전체 mock PTY **82858** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API `127.0.0.1:4311/4321`.
- **완료 작업:** 익명 AP 상담이 Field 연결 메타데이터뿐 아니라 현재 Field 공개 `/me`의 필수 scope와 승인 `/facts`의 실제 서비스 1개 이상을 연락처 저장 전에 확인한다. 무연결 `no_connection`, Field 권한/응답/사실 미확인 `field_unavailable`, 공개 서비스 0개 `no_services`를 고객 화면에서 구분하고 직접 준비를 막는다. 서버 직접 POST도 409/503으로 PII·대화 상태·알림 원장을 변경하기 전에 거절하며, 사람 문의/이미 수락된 제출 키 복구는 유지한다.
- **수정 파일:** `apps/agent-api/src/{customer-consultations,field-connector}.ts`, `apps/agent-api/test/customer-consultations.db.test.ts`, `apps/agent-web/src/agent-public.tsx`, `tools/spikes/{agent-field-same-page-browser.py,ap-field-connection-http.test.mjs}`, `docs/{03_INTEGRATION_CONTRACT.md,CODEX_HANDOFF.md,technical/PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터/report. Field 내부 API/DB, 제품 간 공개 DTO·migration 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 후보 연결은 현재 배포·AP owner/OAuth 동의/refresh·Field facts/availability/request scope로 제한한다. 기존 Field grant/facts 검사에 필수 scope 옵션과 일시 장애에서 영구 degraded를 기록하지 않는 조회 모드를 재사용한다. 사전 GET은 no-store boolean/reason만 보내고 토큰·연결/조직 ID·PII를 공개하지 않는다. POST는 Field를 AP DB 트랜잭션 밖에서 조회한 뒤 동일 연결의 AP 위임이 트랜잭션 안에서도 유효한지 행 잠금으로 다시 확인한다. 제품 간 원자성은 가정하지 않으며 Field 현재 조건/수신 사업자/최종 동의는 기존 `/field-actions`에서 재검증한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock 연결/합성 계정, Git 없음. 신규 reason 단언은 기존 API `{ready:false}`에서 red. 변경 뒤 `pnpm test:spike:consultations:agent` 1/1, `pnpm test:db:agent` 20/20·임시 DB 삭제. Field 합성 `/me` 503·facts 503·서비스 0·요청 scope 누락에서 조회 reason/POST 503 또는 409·PII null/`ai_assisting`, 장애 후 연결 `review_required`, 정상 회복 뒤 201/멱등 재시도를 확인했다. 새 mock **82858** 양제품 API/웹 build/ready, `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1(320px 정상 직접 Field 요청·사진/동의/전달, 장애·서비스 없음 안내/재조회 브라우저 응답 주입, 기존 양제품 SDK/사건/해제). `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·Python `py_compile` exit 0, `pnpm test:contracts` 정적 2/2+제품 DB 5/5, `pnpm test:security` import/교차 DB credential/AP 20/20/Field 19/19/tenant/양 관리자 exit 0.
- **실패한 접근:** 이전 사전 조회는 AP DB 연결이 존재하면 Field 현재 상태와 공개 서비스 수를 확인하지 않아 고객이 연락처를 입력한 뒤 Field 요청 불가를 알 수 있었다. 새 검사 자체의 실패는 없었고 기존 구현을 red로 확인한 뒤 바꿨다. 검사를 삭제하거나 기대값을 낮추지 않았다.
- **남은 작업:** 익명 사전 조회의 운영 호출량/남용 제한, 실제 Field 서버 장기 장애와 서로 다른 두 조직 OAuth/부분 장애, 실모델 응답 중 Field route/화면 인계, 실 객체 저장소·악성코드/보존/복구, C03 사용자 디자인/흐름·200% 확대·키보드/스크린리더, I01~I08 잔여, 실 인증/LLM/알림/결제/DNS/TLS/백업·정식 QA/G. 공급사 credential/계약 부재는 `blocked_integration`; C03/I04는 `in_progress`. 고객 발송/청구/운영 배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready 확인 후 `TASKS.md` C03/I04, `docs/03_INTEGRATION_CONTRACT.md` 4.6, QA16/143, AP 공개 상담 사전 조회와 Field grant 검사를 읽는다. 다음 파일 범위·QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 다음 우선순위는 공개 사전 조회 호출량/남용 제한 또는 실모델 응답 중 직접 Field 경로 인계다. 제품별 DB/domain/세션을 합치지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:db:agent
pnpm test:contracts
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm test:security
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I04/C03/QA16 연락처 제출 전 Field 경로 확인 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인에 맞는 AP·Field 독립 서비스를 기능 끝까지 연결해 사용할 수 있게 만든다. 사용자 화면 디자인/흐름 확인은 기능 이후다. 로컬 전체 mock PTY **54308** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API `127.0.0.1:4311/4321`.
- **완료 작업:** 익명 AP AI 상담 세션이 고객 연락처 제출 전에 현재 배포에 허용된 Field 직접 요청 경로의 설정을 읽는다. 연결 없음/조회 실패에서는 연락처 입력란 위에 사유/재확인을 보이고 Field 준비 버튼을 막으며 사람 문의를 제공한다. API 직접 POST도 연결 경로가 없으면 409로 고객명·번호·상태/알림 원장 변경 전에 거절한다. 연결되면 기존 `external_ready`/사진·Field 현행 조건/별도 동의·전달이 동작한다. 이전에 수락된 동일 제출 키의 복구는 새 연결 검사의 앞에서 처리된다.
- **수정 파일:** `apps/agent-api/src/customer-consultations.ts`, `apps/agent-api/test/customer-consultations.db.test.ts`, `apps/agent-web/src/agent-public.tsx`, `tools/spikes/{agent-field-same-page-browser.py,ap-field-connection-http.test.mjs}`, `docs/{03_INTEGRATION_CONTRACT.md,CODEX_HANDOFF.md,technical/PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터/report. Field 내부 코드/DB, 제품 간 DTO·migration 변경 없음. Git 저장소/커밋 없음.
- **핵심 결정:** `/v1/engagements/{id}/field-readiness`는 기존 익명 상담 세션을 확인하고 현재 AP DB의 활성 배포·owner·OAuth 동의/refresh·Field 연결과 필수 scope **설정 여부**만 no-store boolean으로 공개한다. 연결 ID/토큰/PII를 내보내지 않는다. POST는 같은 검사를 트랜잭션 내에서 연락처/한도 원장 저장 전에 다시 한다. 이 결과는 Field 실시간 가동/현행 서비스·가격·시간 보증이 아니며 기존 Field facts/availability/최종 동의 검사가 별도로 필요하다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock 연결/합성 계정, Git 없음. 신규 API가 404인 AP 상담 격리 DB red → 구현 후 `pnpm test:spike:consultations:agent` 1/1, `pnpm test:db:agent` 20/20·임시 DB 삭제. 무연결 세션 401/false/직접 POST 409·PII null·`ai_assisting`, 연결된 scope/위임 true/직접 POST 201·재시도 200을 확인했다. 전체 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http`는 첫 실행 exit 1(사진 성공 뒤 교체된 과거 상태 문구 대기), 검사 순서 보정 후 **58262**에서 1/1. 안내를 연락처 입력란 위로 옮긴 뒤 최종 `pnpm mock:run` **54308** 양제품 API/웹 build/ready·같은 전체 HTTP/320px 1/1(무연결 사람 문의·연결 후 사진/Field 접수·기존 SDK/사건/해제). 최종 `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·Python `py_compile` exit 0, `pnpm test:contracts` 정적 2/2+제품 DB 5/5, `pnpm test:security` import/교차 DB credential/AP 20/20/Field 19/19/tenant/양 관리자 exit 0.
- **실패한 접근:** 기존 화면/API는 Field 연결이 없어도 연락처를 `external_ready`로 저장한 뒤에야 연결 부재를 보였다. 새 검사의 첫 전체 브라우저 실패는 사진 업로드 후 상태 문구가 바뀌었는데 이전 문구를 기다리는 테스트 타이밍이었다. 미전송 검증은 ActionRequest 0건으로 유지하고 안내 문구의 검사 시점을 바꿨다. 기대값/기능 조건을 낮추거나 검사를 삭제하지 않았다.
- **남은 작업:** 사전 연결 설정만 확인하므로 연락처 저장 전 Field `/me`/facts의 실시간 장애·0 서비스 처리, 실모델 응답 중 Field route/화면 인계, 서로 다른 실제 Field 조직 OAuth/부분 장애, 실 객체 저장소·악성코드/보존/복구, C03 사용자 디자인/흐름·200% 확대·키보드/스크린리더, I01~I08 잔여, 실 인증/LLM/알림/결제/DNS/TLS/백업·정식 QA/G. 공급사 credential/계약 부재는 `blocked_integration`; C03/I04는 `in_progress`. 고객 발송/청구/운영 배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready 확인 후 `TASKS.md` I04/C03, `docs/03_INTEGRATION_CONTRACT.md` 4.6, QA16/143, AP `customer-consultations.ts`·`field-actions.ts`를 읽는다. 다음 파일 범위·QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 우선 Field 실시간 장애/서비스 0건에서 사전 화면이 오해 없이 동작하도록 하거나 실모델 답변 중 direct Field route 전환을 검수한다. 제품별 DB/domain/세션을 합치지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:db:agent
pnpm test:contracts
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm test:security
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I04/C03/QA16 직접 Field 준비 응답 분실·사진 재선택 (2026-09-25)

- **현재 목표:** v3.0 개발 문서와 `reference` 디자인 기준의 AP·Field 독립 서비스를 기능 끝까지 연결해 사용할 수 있는 환경으로 만든다. 사용자 디자인/흐름 검토는 기능 다음이다. 로컬 전체 mock PTY **17073** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API `127.0.0.1:4311/4321`.
- **완료 작업:** AP 상담 링크의 `destination=field` 준비 POST 201을 서버에 저장한 뒤 브라우저 응답만 끊어도 같은 탭 새로고침에서 읽기 전용 `/submissions/recover`로 기존 `external_ready` ID/확인키를 찾는다. 처음 고른 사진은 브라우저가 복원할 수 없음을 알리고, 고객이 같은 AP 화면에서 다시 선택해 마지막 직접 준비 요약 메시지에 첨부한다. Field 현재 조건/사진 전달 항목을 별도로 확인·동의한 뒤에만 Field 요청/복사를 만든다. AP 원본은 1건, 준비 직후 사람 문의 사건/Field ActionRequest 0건이다.
- **수정 파일:** `apps/agent-web/src/{agent-public.tsx,pending-public-submission.ts}`, `tools/spikes/{agent-field-same-page-browser.py,ap-field-connection-http.test.mjs}`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일과 재생성 마스터/report. AP/Field 서버 runtime·제품 간 DTO·DB migration 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 탭 임시 제출 원장에는 무작위 제출/확인키·경로·입력 fingerprint와 사진 선택 여부 boolean만 둔다. 파일 바이트나 연락처 원문을 넣지 않는다. 복구는 기존 확인키/제출 키의 서버 hash를 검증하는 읽기 경로이며 중복 POST가 아니다. 사진 재첨부는 복구된 AP 원본 확인키를 사용하고 Field에는 별도 최종 동의 전까지 전달하지 않는다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock 연결/합성 계정, Git 없음. 실제 320px Chromium의 준비 POST 응답 분실→새로고침에서 복구 자체는 성공했으나 사진 재선택 안내/입력이 없어 전체 HTTP exit 1/time out red. UI 수정과 새 mock **89316** 빌드/ready 뒤에는 사진 성공 안내가 상태를 바꾼 뒤 과거 미전송 문구를 찾는 테스트 순서 문제로 두 번 exit 1; 미전송 안내를 사진 업로드 전 확인하게 고친 뒤 새 mock **17073** 빌드/ready에서 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1(응답 분실·동일 원본/확인키·사진 재선택·Field 복사/사업자 열람과 기존 양제품 경로). `pnpm lint`·`pnpm typecheck`·`pnpm test:unit` exit 0, `pnpm test:db:agent` 20/20·격리 DB 삭제, `pnpm test:contracts` 정적 2/2+제품 DB 5/5, `pnpm test:security` exit 0(import·교차 DB credential·AP 20/20·Field 19/19·tenant·양 관리자). 실 공급사/객체 저장소/정식 QA/G는 미검수.
- **실패한 접근:** 기존 브라우저 복구는 파일 객체를 잃은 뒤 사진을 다시 고르는 UI가 없었다. 첫 수정 후 테스트가 사진 성공 안내가 표시된 시점에 이전 미전송 상태 문구를 계속 기다리는 오류가 있어 검사 순서를 고쳤다. 기대값/기능 조건을 낮추거나 테스트를 삭제하지 않았다.
- **남은 작업:** 실제 모델 응답 중 Field route/화면 인계, Field 연결 0건을 고객 연락처 저장 전에 안내, 서로 다른 두 Field 조직의 실제 OAuth/부분 장애, 실 객체 저장소·악성코드/보존/복구, C03 사용자 디자인/흐름·200% 확대·키보드/스크린리더, I01~I08 잔여와 실 인증/LLM/알림/결제/DNS/TLS/백업·정식 QA/G. 공급사 credential/계약 부재는 `blocked_integration`; C03/I04는 `in_progress`. 고객 발송/청구/운영 배포 없음.
- **다음 에이전트 정확한 명령:** 아래 ready를 확인하고 `TASKS.md` I04/C03, `docs/03_INTEGRATION_CONTRACT.md` 4.6, QA16/141, AP 고객 상담/Field action 코드를 읽는다. 다음 파일 범위·QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 다음 우선순위는 Field 연결 0건을 고객 연락처 제출 전에 알리는 실제 API/UI 경로 또는 실모델 응답 중 direct Field route 전환이다. 제품별 DB/domain/로그인을 합치지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:db:agent
pnpm test:contracts
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm test:security
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I04/C03/QA141 직접 Field 요청 사진 (2026-09-25)

- **현재 목표:** v3.0 개발 명세와 `reference` 디자인에 맞는 AP·Field 독립 서비스의 기능을 끝까지 연결해 사용할 수 있는 환경으로 만든다. 사용자 디자인/흐름 검토는 기능 다음이다. 로컬 전체 mock PTY **82435** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API `127.0.0.1:4311/4321`.
- **완료 작업:** AP 상담 링크의 `external_ready` 고객 요약 메시지에 확인키로 비공개 사진을 첨부한다. 익명 AI 질문에는 계속 첨부할 수 없다. 고객은 Field에 보낼 ready 사진을 별도로 선택하고 현재 조건/수신 사업자/전달 항목에 동의한다. AP 인증 복사 API는 action·연결·위임·동의 항목을 검사하고 Field는 자체 저장소에 복사한다. AP 사업자 사진 조회는 사람 문의 전 404다. AP 후속 `/inquiry/{id}` 화면에서 확인키로 재열람한 뒤 사진을 다시 고르면 동일 요약 메시지에 붙이고 Field 목록에 반영한다. Field 사업자 인증 열람까지 320px 실 HTTP에서 확인했다.
- **수정 파일:** `apps/agent-api/src/{inquiry-attachments,field-actions}.ts`, `apps/agent-api/test/customer-consultations.db.test.ts`, `apps/agent-web/src/agent-public.tsx`, `tools/spikes/{agent-field-same-page-browser.py,ap-field-connection-http.test.mjs}`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일과 재생성 마스터/report. Field 내부 코드/DB, 제품 간 DTO·DB migration 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** `not_applicable` 고객 메시지 전체에 업로드를 열지 않고, `external_ready`의 `next_sequence - 1` 마지막 요약에만 허용한다. Field 전송은 기존 ready attachment UUID 최대 5개와 `consent.items=attachments`를 재사용한다. Field에 전송한 사진 원문을 AP/Field DB 간 직접 import/복제하지 않고 인증 HTTP 복사 worker에 맡긴다. 사진 업로드가 실패하면 AP 본문과 확인키를 보존하고 같은 사진 재시도 또는 명시적 사진 제외를 선택할 수 있다. 새로고침으로 파일 객체는 복원하지 않으며 고객이 재선택한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock 연결/합성 계정, Git 없음. `pnpm test:spike:consultations:agent`는 기존 업로드 401 red→수정 뒤 1/1; `pnpm test:db:agent` 20/20·격리 DB 삭제. `pnpm lint`, `pnpm typecheck` exit 0. 새 `pnpm mock:run` **91668** 양제품 API/웹 build·ready 뒤 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1: 직접 준비 사진→고객 선택/동의→Field 복사/사업자 열람. 재열람 사진 검사 추가 후 기존 후속 화면 timeout red; 고친 뒤 새 mock **82435** build/ready에서 같은 전체 HTTP/320px 1/1(즉시·재열람 사진 모두). `pnpm test:contracts` 정적 2/2+제품 DB 5/5. 최종 `pnpm test:security` exit 0(import 경계·교차 DB credential 거부·AP 20/20·Field 19/19·tenant·양 관리자). 실 S3/HEIC·악성코드 검사·파일 보존·POST 응답 분실 주입·실모델/공급사·정식 QA/G는 미실행.
- **실패한 접근:** 기존 AP 사진 업로드는 `delivery_state='blocked_integration'`만 받아 직접 준비의 요약 `not_applicable`을 401로 거부했다. 이후 후속 화면은 같은 상태의 요약을 사진 대상으로 찾지 못해 320px timeout red였다. DB/인증 경계와 후속 대상 선택을 각각 수정하고 원 검사를 통과시켰다. 검사를 삭제하거나 기대값을 낮추지 않았다.
- **남은 작업:** 실제 모델 응답 중 Field 경로/route 전환, Field 연결 0건을 연락처 저장 전에 안내, 직접 준비 POST 응답 분실 복구 브라우저 검수, 서로 다른 실제 Field 조직의 연결/부분 장애, 실 객체 저장소·악성코드·보존/복구, C03 사용자 디자인/흐름·200% 확대·키보드/스크린리더, I01~I08 잔여와 실 인증/LLM/알림/결제/DNS/TLS/백업·정식 QA/G. credential·공급사 계약 부재는 `blocked_integration`; C03/I04는 `in_progress`. 고객 발송/청구/운영 배포는 하지 않았다.
- **다음 에이전트 정확한 명령:** 아래 ready부터 확인하고 `TASKS.md` I04/C03, `docs/03_INTEGRATION_CONTRACT.md` 4.6, QA16/141/148, AP 고객 상담/Field action/사진 코드를 읽는다. 다음 파일 범위·QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 우선 직접 Field 준비의 응답 분실·재조회 시 사진 선택 복구 또는 실제 모델 응답 중 경로 전환을 red→green으로 처리한다. 제품별 DB/domain/세션을 합치지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:db:agent
pnpm test:contracts
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm test:security
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I04/C03/QA16 AI 대화→직접 Field 요청 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인에 맞는 AP·Field 독립 기능을 실제 사용할 수 있게 완성한다. 사용자는 기능 연결을 먼저, 디자인/흐름 검토를 나중에 원한다. 전체 로컬 mock PTY **20145** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API `127.0.0.1:4311/4321`. 네 URL 모두 마지막 curl HTTP 200.
- **완료 작업:** AP 상담 링크에서 AI 대화 원본을 사람 문의로 먼저 접수하지 않고 `destination=field`로 연락처·AP 저장 동의·별도 확인키를 저장한다. `ap.inquiries`는 `mode=external,state=external_ready`; AP 사람 문의함/알림·매체 연락 사건과 Field ActionRequest는 준비만으로 생기지 않는다. 고객이 같은 화면에서 Field 현행 조건·수신 사업자·전달 항목을 확인하고 별도 동의할 때 기존 Field ActionRequest로 전달한다. Field 연결이 없으면 확인키로 AP 후속 대화를 열어 고객이 명시적으로 사람 문의를 제출할 수 있다. AP 공개 integrator의 일반 대화 조회/답변에는 준비만 된 원본을 노출하지 않는다.
- **수정 파일:** `apps/agent-api/migrations/000056_external_ready.sql`, `apps/agent-api/src/{customer-consultations,inquiries,integrator-routes}.ts`, `apps/agent-api/test/customer-consultations.db.test.ts`, `apps/agent-web/src/{agent-public,agent-field-action,pending-public-submission}.tsx`(pending helper는 `.ts`), `tools/spikes/{agent-field-same-page-browser.py,ap-field-connection-http.test.mjs}`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일, 재생성 마스터/report. Field DB/API/계약 DTO는 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 결정:** AP AI 원본과 고객 확인키는 유지하되 `external` 모드가 AI 생성을 멈추고 사람 문의 이벤트를 만들지 않는다. 고객 연락처 저장 동의와 Field 전달 동의는 다른 단계다. Field request는 기존 현재 조건 hash·scope·멱등·unknown 보호를 그대로 사용한다. 사진이 선택되면 화면에서 직접 준비 버튼을 비활성화한다. 직접 준비 사진은 후속 작업이며 사람 문의 사진 경로는 유지한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey·mock OAuth/합성 계정, Git 없음. `pnpm test:spike:consultations:agent`는 기존 API에서 `needs_owner` red → 수정 후 1/1. 추가 fixture 때문에 기존 합성 호출 수/인덱스 기대가 두 차례 실패해 새 검수 건수를 반영했고 최종 1/1. `pnpm test:db:agent` 20/20·격리 DB 삭제, `pnpm test:contracts` 정적 2/2+제품 DB 5/5, `pnpm lint`·`pnpm typecheck` exit 0. `pnpm mock:run` PTY **20145**는 양 API·웹 build/migrations/ready 완료. `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1 두 번: 320px 직접 준비 직후 Field actions 0건→현재 조건/별도 동의→실제 Field 접수와 기존 양제품 경로. `pnpm test:security` exit 0: import 경계·교차 DB credential 거부·AP 20/20·Field 19/19·tenant·양 관리자. 네 ready/workspace URL curl HTTP 200. 실모델 고객 화면 응답·운영 공급사·정식 QA/G는 실행하지 않았다.
- **실패한 접근:** 기존 `/submissions`는 추가 `destination`을 무시하고 무조건 사람 문의로 전환해 red였다. 새 경계 구현 뒤 합성 테스트의 이전 호출 수/배열 인덱스 기대를 새 추가 AI 질문에 맞게 고쳤다. 기능 기대를 낮추거나 검사를 삭제하지 않았다.
- **남은 작업:** 직접 준비의 사진 선택/인증 복사, 실제 모델 응답 중 화면 인계와 route 전환, Field 연결 0건에서 연락처 제출 전 가용성 안내, 두 Field 조직 실 HTTP 장애, C03 사용자 디자인/흐름·200% 확대·키보드/스크린리더, I01~I08 잔여, 실제 인증/LLM/알림/결제/DNS·백업/복구와 정식 QA/G. 공급사 credential·계약 부재는 `blocked_integration`, C03/I04는 `in_progress`. 고객 발송/청구/운영 배포 없음.
- **다음 에이전트 정확한 명령:** 중복 mock 기동 없이 아래 ready를 먼저 확인하고 `TASKS.md` I04, `docs/03_INTEGRATION_CONTRACT.md` 4.6, QA16/139/141/143, AP 상담/사진/Field action 코드를 읽는다. 다음 작업 파일/QA/명령은 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 적는다. 직접 준비의 사진 전달 또는 실제 모델 응답 중 route 인계를 red→green으로 진행하고, AP/Field 원본·DB·로그인을 합치지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:db:agent
pnpm test:contracts
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm test:security
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/I04/QA136·143 고객 Field grant 일시 장애 복구 (2026-09-25)

- **현재 목표:** v3.0 개발 명세와 `reference` 디자인에 맞춰 AP·Field 독립 서비스를 기능 끝까지 사용할 수 있게 구현한다. 사용자 디자인/흐름 검토와 전체 출시 게이트는 남았다. 전체 로컬 mock PTY **49757** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API 4311/4321. 네 endpoint HTTP 200.
- **완료 작업:** AP 고객이 Field 연결 서비스를 읽는 순간 Field grant `/me`가 일시 503이면 그 조회는 `field_grant_unknown`/빈 서비스로 제한하고 AP 연결 `review_required`는 보존한다. Field 복구 후 같은 고객 확인키로 다시 조회하면 현행 facts의 `available` 서비스가 돌아온다. 고객 읽기 한 번으로 연결을 영구 `degraded`로 저장하던 문제를 고쳤다. AP owner 명시 연결 검사·worker의 기존 영구 상태 처리와 권한/조직 검증은 유지했다.
- **수정 파일:** `apps/agent-api/src/field-connector.ts`, `apps/agent-api/test/{field-actions,field-connection}.db.test.ts`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일과 재생성된 `AI_Field_Service_Operator_Final_Development_Plan_v3.0.md`/report. 공개 계약/schema/DB migration/Field 앱 코드는 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 고객 조회는 매번 Field `/me`·facts를 확인하되 일시 읽기 실패를 AP 연결 전체의 영구 상태 변경으로 기록하지 않는다. 실패 중에는 현행 서비스/가격/업무 제출을 허용하지 않는다. token rotation이 성공했으나 다음 `/me`가 실패한 경우 새 token 보관을 위해 기존 트랜잭션 commit은 유지한다. 사업자 명시 검사/worker의 `degraded` 경로는 변경하지 않는다.
- **실제 검사/환경/커밋:** 제품별 PostgreSQL 17·Field Valkey 로컬 mock/합성 계정, Git 없음. AP 격리 DB의 `/me` 503→상태 보존/재조회 복구 검사가 기존 코드에서 19/20 red(실제 `degraded`)였다. 수정 뒤 `pnpm test:db:agent` 20/20·격리 DB 삭제. 새 `pnpm mock:run` PTY **49757** 양 API/웹 build·ready 뒤 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1/320px 브라우저. 첫 `pnpm test:security`는 기존 AP 연결 테스트의 합성 조직 cleanup에서 facts inbox→source refresh job FK 23503으로 exit 1. `field-connection.db.test.ts`가 inbox를 먼저 정리하게 고친 뒤 전체 `pnpm test:security` exit 0(import/교차 DB credential 거부·AP 20/20·Field 19/19·tenant 1/1·AP/Field 관리자 각 1/1). 최종 `pnpm lint`·`pnpm typecheck` exit 0. 네 ready/workspace URL curl HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py`는 문서 패키지만 passed/exit 0이며 서비스 테스트를 수행하지 않는다. 운영 장기 장애·실공급사·정식 QA136/143/G-I2는 실행하지 않았다.
- **실패한 접근:** 기존 고객 권한 조회의 공통 catch가 `/me` 일시 503도 `degraded`로 commit해 재조회에서 연결을 숨겼다. 별도 red로 확인한 후 고객 조회의 그 상태 변경만 제거했다. 첫 보안 검사의 FK 오류는 제품 코드가 아니라 합성 cleanup 순서 문제였고 inbox 선삭제로 해결했다. 실패 기대값을 낮추거나 검사를 삭제하지 않았다.
- **남은 작업:** C03의 사용자 디자인/흐름·200% 확대·키보드/스크린리더, I04 AI 대화 중 직접 외부 요청/실제 두 Field 조직 HTTP·운영 장애, I02 실모델 의미, I01/I03~I08 잔여 연동, 실 인증·LLM·메시지·결제·DNS/TLS·백업/복구와 전체 QA/G. 공급사 credential/계약 부재는 `blocked_integration`; C03/I04는 `in_progress`다. 고객 발송/청구/배포는 하지 않았다.
- **다음 에이전트 정확한 명령:** mock **49757**을 중복 기동하지 않고 아래 ready를 확인한다. `TASKS.md` C03/I04, `docs/01_AGENT_PLATFORM_PRD.md` 2.6, `docs/03_INTEGRATION_CONTRACT.md` 4.5~4.6, QA16/136/139~143/156, `apps/agent-web/src/{agent-public,agent-field-action}.tsx`, `apps/agent-api/src/{customer-consultations,field-actions}.ts`를 읽는다. 다음 작업의 파일/QA/명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. AI 상담 중 직접 Field 업무 요청의 원본/고객 동의 경계를 구현하거나 실제 두 Field 조직 OAuth/HTTP 장애를 검수한다. 같은 DB 검사는 순차 실행하고 제품 간 DB/domain 직접 import 금지.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:db:agent
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm test:security
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/I04/QA143 AP 실제 다중 연결 원장·부분 장애 격리 (2026-09-25)

- **현재 목표:** v3.0 개발 명세와 `reference` 디자인대로 AP·Field 독립 서비스를 기능 끝까지 사용할 수 있게 구현한다. 사용자 디자인/흐름 검토와 전체 출시 게이트는 남았다. 전체 로컬 mock PTY **28985** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API 4311/4321. 네 endpoint HTTP 200.
- **완료 작업:** 격리 AP DB에 같은 조직·배포의 실제 Field 연결 원장 세 건(정상, Field facts 503, facts scope 누락)을 만들고 고객 `/field-services`로 조회했다. 정상 연결만 서비스가 있고 25,000원 현재 확인→고객 동의/전달을 진행한다. 다른 두 연결은 각각 `field_facts_unavailable`/`field_reauthorization_required`와 빈 서비스다. 잘못된 고객 확인키 401, 권한 없는 연결 직접 가용성 조회 403, 다른 연결의 조직 사실을 보낸 가용성 응답 502를 확인했다.
- **수정 파일:** `apps/agent-api/test/field-actions.db.test.ts`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일과 재생성된 `AI_Field_Service_Operator_Final_Development_Plan_v3.0.md`/report. 제품 runtime/API/공개 계약 schema/DB migration/Field 앱 코드는 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 설계 결정:** AP 고객 목록은 연결별 결과를 독립적으로 보존한다. 브라우저 응답 주입만으로 끝내지 않고 AP 실제 연결 원장/고객 API를 추가 검증했다. Field 전송은 제품 DB 검사의 stub이고 실제 서로 다른 Field 두 조직의 공개 HTTP까지 증명했다고 주장하지 않는다. 이미 정상 동작하는 API를 테스트 통과를 위해 불필요하게 수정하지 않았다.
- **실제 검사/환경/커밋:** 제품별 PostgreSQL 17·Field Valkey 로컬 mock 중 AP **별도 격리 테스트 DB**, Git 없음. 첫 `pnpm test:db:agent` 20/20/격리 DB 삭제는 세 연결의 목록/정상 요청을 검증했다. 직접 우회 401/403/502 단언을 추가한 뒤 최종 `pnpm test:db:agent` 20/20/격리 DB 삭제. 마지막 `pnpm lint`·`pnpm typecheck` exit 0. 네 ready/workspace URL curl HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py`는 문서 패키지만 passed/exit 0이며 서비스 테스트를 수행하지 않는다. 이번 단계에서 전체 양제품 HTTP/실 두 Field 조직/운영 장기 장애·정식 QA143/G-I2는 실행하지 않았다.
- **실패한 접근:** 이번 새 회귀는 기존 AP API에서 첫 실행부터 통과해 실패한 코드 접근이 없다. 브라우저 주입 근거만으로 서버 원장 동작을 단정할 수 없어 격리 DB/API 검사를 추가했다. 검사를 약화하거나 삭제하지 않았다.
- **남은 작업:** 실제 서로 다른 Field 조직 두 곳의 OAuth 연결과 한쪽 서버 장애를 포함한 공개 HTTP, C03 사용자 디자인/흐름·200% 확대·키보드/스크린리더, I04 AI 대화 중 직접 요청/운영 장애, I02 실모델 의미, I01/I03~I08 잔여 연동, 실 인증·LLM·메시지·결제·DNS/TLS·백업/복구와 전체 QA/G. 공급사 credential/계약 부재는 `blocked_integration`; C03/I04는 `in_progress`다. 고객 발송/청구/배포는 하지 않았다.
- **다음 에이전트 정확한 명령:** mock **28985**를 중복 기동하지 않고 아래 ready를 확인한다. `TASKS.md` C03/I04, `docs/03_INTEGRATION_CONTRACT.md` 4.5~4.6, QA119/136/143/156 및 `tools/spikes/ap-field-connection-http.test.mjs`, `apps/agent-api/src/{field-actions,field-connector}.ts`를 읽는다. 새 작업의 파일/QA/명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 적는다. 다음 우선순위는 실제 두 Field 조직의 OAuth/공개 HTTP 부분 장애 또는 C03 고객 흐름의 남은 기능이다. 같은 DB 검사는 순차 실행하고 제품 간 DB/domain import를 금지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:db:agent
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C02/C03/A10/F10 상대 제품 부재의 독립 실행 재검수 (2026-09-25)

- **현재 목표:** v3.0 개발 명세와 `reference` 디자인에 맞춰 AP·Field 독립 서비스를 기능 끝까지 사용할 수 있게 구현한다. 사용자 디자인/흐름 검토와 전체 출시 게이트는 남았다. 전체 로컬 mock PTY **28985** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API 4311/4321. 네 endpoint HTTP 200.
- **완료 작업:** 전체 mock을 종료하고 양쪽 compose를 볼륨 삭제 없이 내렸다. Field 컨테이너·API/웹/DB/Valkey 포트가 실제 없는 상태에서 AP 단독 가입·승인·owned 외부 위젯·고객 접수·사업자 답변/확인키·mock trial을 실행했다. AP 컨테이너·API/웹/DB 포트가 없는 상태에서 Field 단독 가입·사이트 공개·직접 문의·사업자 응답·두 예약 방식·mock trial을 실행했다. 각각 320px owner/guest 브라우저 흐름을 포함한다. 종료 후 두 제품 전체 mock을 다시 기동했다.
- **수정 파일:** 제품 코드/API/계약/schema/DB migration 변경 없음. `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일과 재생성된 `AI_Field_Service_Operator_Final_Development_Plan_v3.0.md`/report만 갱신. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 독립성은 빈 fixture나 환경값 제거만으로 대체하지 않고 상대 compose 컨테이너와 endpoint 포트가 없는 상태에서 검증한다. `docker compose down`은 `-v` 없이 실행해 로컬 모의 데이터 볼륨을 보존한다. 로컬 mock 가입/체험 검사를 실공급사·운영 독립성 또는 출시 게이트로 승격하지 않는다.
- **실제 검사/환경/커밋:** 제품별 PostgreSQL 17·Field Valkey 로컬 mock, Git 없음. `pnpm test:independence:agent` exit 0: 상대 컨테이너/포트 부재, AP 자체 owner/guest 흐름 및 Chromium 320px 1/1. AP compose 정리 뒤 `pnpm test:independence:field` exit 0: 상대 컨테이너/포트 부재, Field owner/guest 문의·두 예약 흐름 및 Chromium 320px 1/1. 두 runner는 시작/종료 시 상대 부재를 검사한다. 새 `pnpm mock:run` PTY **28985** 양 API/웹 build·ready와 네 ready/workspace URL HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py`는 문서 패키지만 passed/exit 0이며 서비스 테스트를 수행하지 않는다. 이번 단계에서 lint/typecheck·전체 DB/계약/보안·실 공급사/운영 장애/정식 QA121~124/143 및 G-A/G-F는 실행하지 않았다.
- **실패한 접근:** 이번 독립 검수에는 실패한 명령이나 코드 접근이 없었다. 기존 전체 mock을 켠 채 독립 명령을 돌리면 상대 부재 조건을 만족하지 못하므로, runner 코드를 확인한 뒤 순차 종료·compose 정리·제품별 실행을 수행했다.
- **남은 작업:** 실제 두 연결의 서버 원장/한쪽 연결 장애 검수, C03 사용자 디자인/흐름·200% 확대·키보드/스크린리더, I04 AI 대화 중 직접 요청/운영 장애, I02 실모델 의미, I01/I03~I08 잔여 연동, 실 인증·LLM·메시지·결제·DNS/TLS·백업/복구와 전체 QA/G. 공급사 credential/계약 부재는 `blocked_integration`; 관련 Task는 `in_progress`다. 고객 발송/청구/배포는 하지 않았다.
- **다음 에이전트 정확한 명령:** mock **28985**를 중복 기동하지 않고 아래 ready를 확인한다. `TASKS.md` C03/I04, `docs/03_INTEGRATION_CONTRACT.md` 4.5~4.6, QA119/136/143/156 및 `apps/agent-api/src/{field-actions,field-connector}.ts`, `tools/spikes/ap-field-connection-http.test.mjs`를 읽는다. 다음 작업의 파일/QA/명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 실제 두 연결의 원장/권한·일부 Field 연결 장애를 DB/HTTP로 검수하거나, C03 고객 핵심 흐름의 잔여 기능을 구현한다. 제품 간 DB/domain 직접 import 금지, 동일 DB 검사는 순차 실행.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/I04/QA143 다중 Field 연결 일부 장애·권한 안내 (2026-09-25)

- **현재 목표:** v3.0 개발 명세와 `reference` 디자인에 맞춰 AP/Field 독립 서비스를 기능 끝까지 사용할 수 있게 구현한다. 사용자 디자인/흐름 최종 검토와 전체 출시 게이트는 남았다. 로컬 mock PTY **77720** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API 4311/4321. 네 endpoint HTTP 200.
- **완료 작업:** AP 고객 Field 서비스 목록에 정상 연결과 `field_facts_unavailable`·`field_reauthorization_required`가 함께 있으면 정상 연결 서비스만 선택·현재 조건 확인·동의·전달할 수 있다. 문제 연결 서비스는 숨기고 일시 사실 조회 장애와 사업자 재동의 필요를 구별해 안내한다. AP 원본 문의와 기존 Field 전달 기록은 계속 보인다. 복합 목록은 기존 실제 한 연결 응답에 두 상태를 브라우저에서 추가해 UI만 검수했다.
- **수정 파일:** `apps/agent-web/src/agent-field-action.tsx`, `tools/spikes/field-action-browser.py`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일과 재생성된 `AI_Field_Service_Operator_Final_Development_Plan_v3.0.md`/report. 제품 API/계약 schema/DB migration/Field 내부 코드 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 각 연결의 상태를 다른 연결의 사용 가능성과 독립적으로 취급한다. 정상 연결만 서비스 선택지로 넘기고 문제 연결은 facts 장애/권한 재동의/기타 확인 필요로 분류한다. 고객에게 상대 제품 OAuth 권한을 대신 부여하지 않으며 원본/이전 기록 접근은 유지한다.
- **실제 검사/환경/커밋:** 제품별 PostgreSQL 17·Field Valkey 로컬 mock/합성 계정, Git 없음. 정상+문제 연결을 합친 320px 브라우저의 사업자 재동의 문구 timeout red/전체 HTTP exit 1 확인. `pnpm lint`·`pnpm typecheck` exit 0. 새 `pnpm mock:run` PTY **77720** 양 API/웹 build·ready. `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http`는 정상 연결 선택/현행 조건 확인·고객 동의/실제 전달과 다른 연결/사건/해제 브라우저 1/1 exit 0. 네 ready/workspace URL curl HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py`는 문서 패키지만 passed/exit 0이며 서비스 테스트를 수행하지 않는다. **실제 두 Field 연결**의 DB/HTTP 경합·전체 DB/보안/독립성·운영 장애·정식 QA143/G-I2는 이번 단계에서 미실행이다.
- **실패한 접근:** 이전 UI는 모든 `state !== available`을 하나의 사실 조회 장애 수로 취급해 재동의 필요를 임시 장애처럼 표시했다. 브라우저 red 뒤 문제 상태 문자열을 분리해 안내를 수정했다. 문제 연결에 가짜 이전 서비스가 있어도 선택지에 넣지 않는 검사를 유지했다.
- **남은 작업:** 실제 둘 이상의 연결 원장과 한 연결 장애의 서버 검수, C03 사용자 디자인/흐름·200% 확대·키보드/스크린리더, I04 AI 대화 중 직접 요청/운영 장애, I02 실모델 의미·장기 장애, I01/I03~I08 잔여 연동, 실 인증·LLM·메시지·결제·DNS/TLS·백업/복구와 전체 QA/G. 공급사 credential/계약 부재는 `blocked_integration`; C03/I04는 `in_progress`다. 고객 발송/청구/배포는 하지 않았다.
- **다음 에이전트 정확한 명령:** mock **77720**을 중복 기동하지 않고 아래 ready를 확인한다. `TASKS.md` C03/I04와 `docs/03_INTEGRATION_CONTRACT.md` 4.5~4.6, QA119/136/143/156, `apps/agent-api/src/{field-actions,field-connector}.ts`, `tools/spikes/ap-field-connection-http.test.mjs`를 읽는다. 다음 작업의 파일/QA/검수 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 우선 실제 두 연결의 서버 원장 또는 AP/Field 원본별 장애 독립성을 제품별 독립 명령/실제 네트워크 차단으로 검수한다. 같은 DB 검사는 순차 실행하고 제품 간 DB/domain 직접 import를 금지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm test:independence:agent
pnpm test:independence:field
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/I04/QA156 제출 조건 사전 확인 변경·장애 복구 (2026-09-25)

- **현재 목표:** v3.0 개발 명세와 `reference` 디자인을 따라 AP/Field 독립 서비스를 기능 끝까지 사용할 수 있게 구현한다. 사용자 디자인/흐름 검토와 전체 출시 게이트는 남았다. 로컬 mock PTY **92114** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API 4311/4321. 네 endpoint HTTP 200.
- **완료 작업:** AP 고객이 Field 현재 가격·시간을 읽고 제출 조건 사전 확인 POST에서 409를 받으면 오래된 availability를 지운 후 Field 현재 조건을 다시 읽는다. 변경된 가격/시간을 새로 표시하며 이전 확인 카드·동의·제출 키는 재사용하지 않는다. 사전 확인 503/응답 예외는 이전 가격을 숨긴다. 최종 전달 409 재확인과 AP 원본 문의·이전 전달 기록은 유지한다.
- **수정 파일:** `apps/agent-web/src/agent-field-action.tsx`, `tools/spikes/field-action-browser.py`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일과 재생성된 `AI_Field_Service_Operator_Final_Development_Plan_v3.0.md`/report. 제품 API·계약 schema·DB migration·Field 내부 코드는 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 사전 조건 확인과 최종 전달 모두 Field revision 변화에 따른 409를 현재값 재조회로 연결한다. 조회 실패는 AP 저장/화면의 과거 가격을 현재로 표시할 근거가 아니다. 새 조건은 고객의 별도 확인/동의를 요구하고 AP는 Field 예약을 확정하지 않는다.
- **실제 검사/환경/커밋:** 제품별 PostgreSQL 17·Field Valkey 로컬 mock/합성 계정, Git 없음. 구 웹 빌드에서 320px 브라우저 사전 확인 409→45,000원 재조회가 timeout red/전체 HTTP exit 1. `pnpm lint`·`pnpm typecheck` exit 0. 새 `pnpm mock:run` PTY **92114**는 양 API/웹 build·ready. `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http`는 사전 확인 409→45,000원, 후속 확인 503→가격 제거, 다시 50,000원 조회/확인, 최종 전달 409→60,000원 재조회/재동의, 양제품 연결·사건·해제 브라우저 1/1 exit 0. 검사 강화 뒤 같은 전체 명령 1/1 재통과. 네 ready/workspace URL curl HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py`는 문서 패키지만 passed/exit 0이며 서비스 테스트를 수행하지 않는다. 이번 단계에서 전체 DB/보안/독립성·운영 장기 장애·정식 QA156/G-I2는 실행하지 않았다.
- **실패한 접근:** 기존 사전 확인 409 분기는 안내 문구만 바꾸고 기존 availability를 남겨 변경된 가격을 다시 보여주지 못했다. 이를 실제 320px 브라우저 timeout red로 확인했다. red 뒤 기존 Field 현재 조회 함수에 연결하고 실패 시 availability를 지웠다. 테스트 기대값을 현재 버그에 맞추지 않았다.
- **남은 작업:** C03 사용자 디자인/흐름·200% 확대·키보드/스크린리더, I04 다중 Field 연결 일부 장애와 AI 대화 중 직접 요청·운영 네트워크 변형, I02 실모델 의미·장기 장애, I01/I03~I08 잔여 연동, 실 인증·LLM·메시지·결제·DNS/TLS·백업/복구와 전체 QA/G. 공급사 credential/계약 부재는 `blocked_integration`; C03/I04는 `in_progress`다. 고객 발송/청구/배포는 하지 않았다.
- **다음 에이전트 정확한 명령:** mock **92114**를 중복 기동하지 않고 아래 ready를 확인한다. `TASKS.md` C03/I04, `docs/03_INTEGRATION_CONTRACT.md` 4.5~4.6, QA119/136/143/156, `apps/agent-web/src/agent-field-action.tsx` 및 `apps/agent-api/src/field-actions.ts`를 읽는다. 새 파일 범위/QA/명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 우선 다중 연결 중 한 연결 facts 장애가 있어도 정상 연결 요청은 가능하고 실패 연결은 과거 가격을 노출하지 않는지 검수한다. 같은 DB 검사는 순차 실행하고 제품 간 DB/domain 직접 import는 금지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/I04/QA143 Field 연결 정보 부분 장애 고객 안내 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 디자인에 맞춰 AP·Field 독립 서비스를 기능 끝까지 사용할 수 있게 구현한다. 사용자 디자인/흐름 최종 확인과 전체 출시 게이트는 남았다. 로컬 mock PTY **53354** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API 4311/4321. 네 endpoint HTTP 200.
- **완료 작업:** AP 고객의 `/field-services`가 200이어도 연결별 Field 사실 조회가 `field_facts_unavailable`이면 현재 Field 서비스·가격·전달 양식을 숨기고 장애 안내와 재조회 버튼을 표시한다. AP 원본 문의와 이미 저장된 Field 전달 기록은 계속 열 수 있다. 복구 뒤 현재 조건을 다시 확인하고 동의해 전달한다. 연결이 없는 AP 단독 문의에는 Field 패널을 표시하지 않는다.
- **수정 파일:** `apps/agent-web/src/agent-field-action.tsx`, `tools/spikes/field-action-browser.py`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일과 재생성된 `AI_Field_Service_Operator_Final_Development_Plan_v3.0.md`/report. API/계약 schema/DB migration/Field 내부 코드는 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 전체 목록의 성공과 연결별 Field 사실 조회 성공을 구분한다. 실패한 연결은 stale 가격이나 서비스로 진행시키지 않는다. 기존 ActionRequest/예약 상태 조회는 Field 현재 카탈로그 조회 실패와 독립이며 AP 원본은 항상 유지한다. 재조회가 복구된 후에만 새 조건 확인 및 고객 동의를 받는다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey mock/합성 계정, Git 없음. 320px Chromium에서 연결별 200+`field_facts_unavailable` 주입 후 안내 문구 timeout red 확인. 새 빌드 `pnpm mock:run` PTY **53354**에서 양 API/웹 build·ready. `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http`는 부분 장애→복구→현행 조건 확인→동의/실제 전달과 다른 연결/해제 흐름 1/1, exit 0. `pnpm lint`·`pnpm typecheck` exit 0. 네 ready/workspace URL curl HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py`는 **문서 패키지만** passed/exit 0이며 서비스 테스트를 실행하지 않는다. 이번 단계에서 전체 DB/보안/독립성·운영 장기 장애·정식 QA143/G-I2는 실행하지 않았다.
- **실패한 접근:** 첫 테스트 주입은 `route.fetch()`의 응답 완료 전에 단언해 Playwright `TargetClosedError`가 났다. 응답 대기를 추가한 뒤 기존 UI에서 장애 안내 부재의 실제 red를 확인했다. 기존 UI의 200 목록 분기는 `available`만 남기고 실패 연결을 버려 패널을 숨겼다. 기대값을 버그에 맞추지 않았다.
- **남은 작업:** C03 사용자 디자인/흐름 검토 및 접근성 전체 검사, I02 실모델 의미/장기 장애, I04 연결별 다중 부분 장애·최종 조건 갱신 추가 변형·AI 대화 중 직접 요청, I01/I03~I08 잔여 연동, 실 인증·LLM·메시지·결제·DNS/TLS·백업/복구 및 전체 QA/G. 외부 credential/계약 부재는 `blocked_integration`; C03/I04는 `in_progress`다. 고객 발송/청구/배포는 하지 않았다.
- **다음 에이전트 정확한 명령:** 아래 ready를 먼저 확인하고 mock **53354**를 중복 기동하지 않는다. `TASKS.md` C03/I04, `docs/03_INTEGRATION_CONTRACT.md` 4.5~4.6, QA119/136/143/156과 `apps/agent-web/src/agent-field-action.tsx`, `apps/agent-api/src/field-actions.ts`를 읽는다. 다음 작업의 파일/QA/검수 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 우선 다중 연결의 부분 장애에서 정상 연결이 계속 요청 가능하고 실패 연결은 stale 값 없이 재조회되는지 검수한 뒤 남은 고객 흐름 기능을 진행한다. 같은 DB 검사는 순차 실행하고 제품 간 DB/domain import를 금지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/I04/QA156 Field 조건 변경 고객 재확인 (2026-09-25)

- **현재 목표:** 개발 명세 v3.0과 `reference` 디자인대로 AP/Field 독립 기능을 끝까지 구현해 사용할 환경을 마련한다. 사용자 디자인/흐름 최종 확인은 아직이다. 로컬 mock PTY **47268** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API 4311/4321. 네 endpoint HTTP 200. 전체 Task/출시 완료는 아니다.
- **완료 작업:** AP 고객이 Field 최종 요청 제출에서 `service_conditions_changed` 409를 받으면 이전 조건 카드·고객 동의·제출 키·가용성을 지우고 Field 현재 availability를 다시 조회한다. 새 가격/시간을 표시하고 요청/전달 항목을 재확인·재동의해야 제출할 수 있다. 새 조회 실패 시 예전 조건을 현재로 표시하지 않는다. AP 서버가 가격 변경 뒤 구 조건 hash로의 제출을 전송 전에 409로 거부하는 DB 회귀를 추가했다.
- **수정 파일:** `apps/agent-web/src/agent-field-action.tsx`, `tools/spikes/field-action-browser.py`, `apps/agent-api/test/field-actions.db.test.ts`, `docs/{03_INTEGRATION_CONTRACT.md,technical/PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일 및 재생성 마스터. 제품 간 schema/DB migration/Field 내부 코드 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 최종 제출의 조건 변경은 결과 미상/멱등 충돌과 구별한다. 조건 변경은 고객의 과거 동의를 자동 연장하지 않는다. AP의 원본 상담/문의와 Field 예약 확정 권한은 분리한다. 최신 가격·시간은 AP 저장 snapshot이 아니라 Field availability의 현재 응답으로 다시 표시한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey mock/합성 계정, Git 없음. Chromium 320px의 최종 제출 409→새 60,000원 조건 표시 timeout red 확인. `pnpm test:spike:field-actions:agent` 1/1은 25,000→30,000원 변경 뒤 구 hash 409/외부 전송 0건/새 hash를 확인. `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http`는 320px 고객 재조회·재동의·실제 전달과 전체 연결/사건/해제 브라우저를 포함해 1/1, page error 0·가로 넘침 없음. `pnpm lint`·`pnpm typecheck` exit 0. 새 `pnpm mock:run` **47268** 양 API/웹 build·ready 후 네 endpoint HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py`는 문서 패키지만 exit 0. 이번 단계에서 전체 `pnpm test:security`·독립성/실공급사/운영 장애·정식 QA156/G-I2는 실행하지 않았다.
- **실패한 접근:** 기존 UI는 최종 조건 409 뒤 과거 확인/동의 카드를 남겨 브라우저 red가 났다. 첫 UI 수정 뒤 `FIELD_BROWSER_PYTHON=...`만 지정한 전체 HTTP 명령은 고객 검사를 통과했으나, 실행 중인 mock 자동 Field worker를 테스트 수동 처리로 가정해 revoke worker가 이미 처리한 사건에서 `empty`/`acked` 경합으로 실패했다. `tools/mock-run.mjs`의 worker 기동과 검사 runner의 플래그를 확인해 `FIELD_EVENT_WORKERS_RUNNING=1`을 지정한 전체 명령으로 통과했다. 테스트 기대값을 버그에 맞추지 않았다.
- **남은 작업:** C03 사용자 디자인/흐름 검토, I02 실제 모델 의미 검증·연결 중요값 AI 답변 및 장기 장애, I04 운영 네트워크/권한 회수·고객 조건 갱신 추가 변형, I01/I03~I08 잔여 연동과 실 인증·LLM·알림·결제·DNS/TLS·백업/복구/전체 QA/G. 외부 credential/계약 부재는 `blocked_integration`, C03/I04는 `in_progress`다.
- **다음 에이전트 정확한 명령:** mock **47268**을 중복 기동하지 않고 아래 ready를 확인한다. `TASKS.md` C03/I02/I04와 `docs/03_INTEGRATION_CONTRACT.md` 4.5~4.6, QA136/141/156, `apps/agent-api/src/{customer-consultations,connector-facts-live,field-actions}.ts`와 `apps/agent-web/src/agent-field-action.tsx`를 읽는다. 다음 파일/QA/검수 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 다음 우선순위는 Field 중요값의 AI 안내/사용자 확인과 Field 장애 중 AP 원본 독립성 경계, 이후 C03 전체 사용 흐름의 남은 기능이다. 동일 DB 검사는 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:spike:field-actions:agent
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I02/QA134 AP·Field 서비스 출처 매핑과 로컬 서버 (2026-09-25)

- **현재 목표:** 개발 명세 v3.0과 `reference` 디자인에 맞춰 AP/Field 독립 서비스를 기능 끝까지 구현한다. 사용자 화면 디자인/흐름 확인은 아직이다. 전체 로컬 mock PTY **45262** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API 4311/4321. 네 endpoint HTTP 200. 전체 Task/출시 완료는 아니다.
- **완료 작업:** AP owner의 `mapping-options` 읽기 API는 최신 native 승인 서비스·공개본 ID와 현재 선택을 제공한다. Field 서비스가 AP 이름과 겹치면 별도/AP 설명 우선/Field 설명 우선 중 명시 선택해야 한다. `publish`는 native 공개본 ID와 Field revision/hash를 고정하고 선택별 connector KnowledgeRelease의 native 서비스와 Field AI 사실을 구성한다. 기존 native 원본/초안은 보존하며 새 AI release 승인은 별도다. 같은 선택의 재시도는 200 멱등, 버전 변경은 409다. 320px 연결 화면에서 중복 처리 필수·공개·재열람을 확인했다.
- **수정 파일:** `apps/agent-api/src/field-sources.ts`, `apps/agent-api/test/field-connection.db.test.ts`, `apps/agent-web/src/{agent-field-connections.tsx,agent-field-connections.css}`, `tools/spikes/ap-field-connection-browser.py`, `docs/{03_INTEGRATION_CONTRACT.md,technical/PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일 및 재생성 마스터. DB migration/Field 내부·공개 OpenAPI 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 서비스 매핑은 AP의 지식 공개본에만 기록하고 Field DB를 읽거나 변경하지 않는다. AP 우선은 중복 Field 서비스 AI 설명을 제외하고, Field 우선은 connector 공개본의 대응 AP 설명을 제외하며 답변 시 Field facts의 실시간 revision/hash 확인을 계속 사용한다. 별도는 출처 접두어로 구별한다. 가격·예약 수치는 정적 지식에 포함하지 않는다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey mock/합성 계정, Git 없음. AP DB 매핑 API 부재 404 red→`pnpm test:spike:field-connection:agent` 1/1 green, `pnpm test:db:agent` 20/20/격리 DB 삭제. `pnpm test:spike:ap-field:http` 1/1, `/tmp/fieldai-report-venv/bin/python tools/spikes/ap-field-connection-browser.py` Chromium 320px 1/1(page error 0·가로 넘침 없음), `pnpm test:contracts` 정적 2/2+DB 5/5, `pnpm test:integration:faults` 정적 2/2·AP 3/3·Field 2/2·두 서버 HTTP/worker 1/1, `pnpm test:e2e:agent` 3/3, `pnpm test:security` import/교차 DB credential 차단·AP 20/20·Field 19/19·tenant/양 관리자 각 1/1, `pnpm lint`·`pnpm typecheck` exit 0. 새 `pnpm mock:run` **45262** 양 API/웹 build·ready 후 네 endpoint HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py`는 문서 패키지만 exit 0. 운영 공급사/실모델·정식 QA134/G-I2는 미실행이다.
- **실패한 접근:** 첫 매핑 옵션 조회는 404 red였다. 첫 멱등 비교는 PostgreSQL JSONB 객체 키 순서 차이로 같은 선택에 201을 반환해 정규화된 배열 비교로 수정했다. TypeScript의 source rows undefined 오류와 UI 선택 문자열 undefined 오류도 수정했다. 시스템 `python3`에는 Playwright가 없어 브라우저 명령은 실패했고 위 report venv 명령으로 재실행해 통과했다. 검사를 삭제하거나 기대값을 버그에 맞추지 않았다.
- **남은 작업:** I02의 실제 모델 의미 검증·중요 가격/예약 조건의 상담 안내 직전 live 확인/사용자 재확인, 운영 장기 장애/키 회전/권한 변화, I01/I03~I08 잔여 연동, C03 사용자 디자인/접근성 확인, 전체 QA/G, 실제 인증·LLM·알림·결제·DNS/TLS·백업/복구. 공급사 credential/계약 부재는 `blocked_integration`, I02는 `in_progress`다.
- **다음 에이전트 정확한 명령:** mock **45262**를 중복 기동하지 않고 아래 ready를 확인한다. `TASKS.md` I02/I04와 `docs/03_INTEGRATION_CONTRACT.md` 4.5~4.6, QA136~140/156 및 `apps/agent-api/src/{connector-facts-live,field-actions}.ts`를 읽는다. 다음 작업의 파일/QA/명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 우선 Field 가격·활성·예약 조건의 AI/고객 화면 live 재확인과 버전 변경시 안전한 사용자 재확인을 공개 계약/DB 검사부터 진행한다. 제품 간 DB/domain import를 금지하고 같은 DB 검사는 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:db:agent
pnpm test:contracts
pnpm test:integration:faults
pnpm test:e2e:agent
pnpm test:security
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I02/QA136 AP 상담 Field 근거 확인 (2026-09-25)

- **현재 목표:** 개발 명세 v3.0·`reference` 디자인에 맞는 AP/Field 독립 서비스를 기능 끝까지 구현한다. 사용자 화면 디자인/흐름 검토는 아직이다. 전체 로컬 mock PTY **56421** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321. 두 웹·API HTTP 200. 전체 Task/운영 출시는 미완료다.
- **완료 작업:** AP owner AI 테스트와 비회원 상담이 connector KnowledgeRelease의 Field facts를 모델 근거로 쓰기 전 공식 Field facts API에서 revision/hash를 재확인한다. 사전 불일치·장애·권한 회수 때 Field 근거를 제외하고 AP native 답변과 Field 미확인/사람 인계를 유지한다. 생성된 답변이 Field 근거를 사용하면 고객 저장/표시 직전 다시 확인해 변경 중 원문 노출을 막는다. 오래된 fetched_at은 동일 live 버전 검증 후 갱신한다. 답변용 Field `/me` 일시 장애는 연결 원장을 영구 degraded로 만들지 않는다.
- **수정 파일:** `apps/agent-api/src/{connector-facts-live,field-connector,agents,customer-consultations}.ts`, `apps/agent-api/test/field-connection.db.test.ts`, `docs/{03_INTEGRATION_CONTRACT.md,technical/A09_PUBLIC_API_DESIGN.md,technical/PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일 및 재생성 마스터. 제품 간 OpenAPI/schema·DB migration·Field 앱/DB 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** AP 승인 source의 서비스 설명만 Field 공개 HTTP의 현재 revision/hash와 일치할 때 사용한다. 답변에 가격·시간·예약 숫자를 AP 캐시에서 싣지 않는다. native AP 지식과 고객 사람 문의는 Field 장애와 분리한다. 답변용 상태 확인은 한 번의 공급사 장애를 연결 해제로 취급하지 않으며, 관리용 명시 동기화·worker의 기존 장애 기본값은 그대로다. 202/event 전달과 상담 시 live 조회는 서로 다른 안전 장치다.
- **실제 검사/환경/커밋:** 제품별 PostgreSQL 17·Field Valkey 로컬 mock/합성 계정, Git 없음. `pnpm test:db:agent` 최종 20/20/격리 DB 삭제. `pnpm test:contracts` 정적 2/2+DB 5/5, `pnpm test:integration:faults` 정적 2/2·AP 3/3·Field 2/2·양제품 HTTP/worker 1/1, `pnpm test:e2e:agent` 3/3, `pnpm test:security` 제품 간 import/DB credential 차단·AP 20/20·Field 19/19·tenant 1/1·양 관리자 브라우저 각 1/1, `pnpm lint`·`pnpm typecheck` exit 0. 새 `pnpm mock:run` **56421**은 두 API/웹 build·ready, 마지막 확인에서 네 endpoint 200. 실제 모델·운영 장기 단절·공급사/전체 QA136/G-I2는 미검수다.
- **실패한 접근:** 기존 AP AI가 Field 정보가 바뀌어도 cached `field:*` 2건을 모델에 보낸 19/20 red를 확인했다. 공용 `inspectFieldFacts`를 그대로 매 답변에 사용하자 `/me` 503 한 번에 연결 원장이 degraded가 되는 19/20 red였고, 읽기 전용 답변 검사는 상태를 유지하도록 분리했다. 최초 helper는 cached 24시간 제한을 live 확인보다 먼저 검사해 25시간 후 동일 승인 버전도 계속 비활성화한 19/20 red였으며, live 비교 뒤 확인 시각을 갱신하도록 바꿨다. 실패한 검사를 삭제하거나 기대값을 버그에 맞추지 않았다.
- **남은 작업:** I02 source mapping 명시 수정/중복 해결 UX, Field 중요값의 운영 네트워크 장애·실모델 의미 검수와 stale 대체, I01/I03~I08 미완료 연동, A/F 기능과 실제 인증/LLM/알림/결제/DNS/TLS·백업/복구/출시 QA/G. 실제 공급사 credential/계약 부재는 `blocked_integration`, I02는 `in_progress`다.
- **다음 에이전트 정확한 명령:** mock **56421**을 중복 기동하지 않고 아래 ready를 확인한다. `TASKS.md` I02, 연동 계약 4.5, QA134~138, `apps/agent-api/src/field-sources.ts`와 AP/Field owner 연결 화면을 읽는다. 다음 작업의 파일 범위·QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. source mapping 중복 해결을 명시 승인 UX와 공개 API/DB 검사부터 진행하고 제품 간 DB/domain 직접 import를 금지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:db:agent
pnpm test:contracts
pnpm test:integration:faults
pnpm test:e2e:agent
pnpm test:security
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I02/I07 Field 사실 변경 서명 사건과 로컬 서버 (2026-09-25)

최종 AP 수신 권한 보강 뒤 `pnpm test:security` 전체를 다시 실행해 제품 간 import 금지·교차 DB credential 차단·AP 20/20·Field 19/19·tenant 1/1·양 관리자 브라우저 각 1/1, exit 0을 확인했다.

- **현재 목표:** v3.0 개발 명세와 `reference` 디자인을 따라 AP·Field 독립 기능을 끝까지 구현해 사용할 수 있는 환경을 마련한다. 사용자 화면 디자인/흐름 검토는 아직이다. 전체 mock PTY **95318** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API 4311/4321. 전체 Task/QA/운영 출시는 미완료다.
- **완료 작업:** Field 승인 카탈로그 release/outbox에서 활성 연결별 최신 변경을 내구 delivery 원장으로 재조정한다. 연결별 HMAC `field.facts.changed`를 AP 공개 API에 재시도하고 AP는 서명·시간창·현재 owner/grant/scope/동의를 검사해 전역 event ID 영수증 및 사실 inbox에 commit한 뒤 202를 준다. AP worker가 최신 Field 공개 facts를 다시 읽는 내구 source refresh를 만들고 AP source를 `pending_review`에 저장한다. 중복/역순·응답 미상·권한 회수/해제·승인 source/AI 버전 불변을 로컬에서 확인했다.
- **수정 파일:** `contracts/{agent-integrator-v1.openapi.json,CONTRACT_NOTES.md}`, `tools/test/agent-integrator-contract.test.mjs`, `apps/agent-api/migrations/000055_field_facts_event_inbox.sql`, `apps/agent-api/src/{field-event-inbox,field-event-worker,field-facts-events}.ts`, `apps/agent-api/test/field-connection.db.test.ts`, `apps/field-api/migrations/000047_facts_change_deliveries.sql`, `apps/field-api/src/{ap-event-worker,facts-change-delivery}.ts`, `apps/field-api/test/ap-connection.db.test.ts`, `tools/spikes/ap-field-connection-http.test.mjs`, `docs/{03_INTEGRATION_CONTRACT.md,technical/A09_PUBLIC_API_DESIGN.md,technical/PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일 및 재생성 마스터. 직전 phase의 AP 해제 경합 수정 `apps/agent-api/src/field-sources.ts`도 현재 작업 상태에 포함된다. Git 저장소/커밋 없음.
- **핵심 설계 결정:** Field 승인 commit은 AP 장애와 독립이다. 사건에는 원문/가격/연락처 없이 release ID·revision만 넣고 AP는 공개 facts API로 다시 읽는다. 최신 release/outbox 재조정으로 누락을 복구하며 연결 전 승인분은 명시 최초 갱신을 사용한다. AP 사업자 source 승인·KnowledgeRelease·고객 AI 공개는 자동 실행하지 않는다. Field 전송 202는 AP durable 수신일 뿐 source 승인 완료가 아니다. 제품 간 DB·내부 domain import는 없다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey mock, 실제 HTTP/Chromium 320px, Git 없음. 계약 schema 부재, AP 사실 사건 거부, Field delivery 모듈 부재를 red로 확인했다. 최종 `pnpm test:db:agent` 20/20·`pnpm test:db:field` 19/19(격리 DB 삭제), `pnpm test:contracts` 정적 2/2+DB 5/5, `pnpm test:integration:faults` 정적 2/2·AP 3/3·Field 2/2·양제품 HTTP/worker 1/1, 최종 새 빌드 `pnpm test:spike:ap-field:http` 수동/`FIELD_EVENT_WORKERS_RUNNING=1` 자동 각 1/1, 기존 연결 브라우저 1/1/page error 0, `pnpm lint`·`pnpm typecheck` exit 0. `pnpm test:security`는 마지막 AP 수신 권한 보강 전에 import/DB credential 차단·AP 20/20·Field 19/19·tenant·양 관리자 각 1/1로 exit 0이었고 보강 뒤 AP 20/20을 다시 실행했다. 최종 `pnpm mock:run` **95318**은 양 API/웹 build·ready, 네 HTTP endpoint 200이다. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py`는 문서 패키지 범위만 exit 0이다. 실 운영 서버/공급사·정식 QA/G-I는 실행하지 않았다.
- **실패한 접근:** 사실 사건 DB 검사의 초기 400/401, 같은 event ID의 유효하지 않은 변경 body 400/409, 첫 Field delivery 모듈 import 실패, worker의 release subquery `approved_at` 누락, HTTP 테스트 프로세스 `AP_PROFILE=mock` 누락을 원인에 맞게 수정했다. owner 역할 회수 검사의 첫 `member` 값은 schema check에 맞지 않아 `viewer`로 바꿔 실제 202/401 red를 확인한 뒤 수신기 검사를 강화했다. 실패를 통과로 보고하거나 버그에 맞게 기대값을 낮추지 않았다.
- **남은 작업:** I02 중요 가격/활성/예약 조건 live 재확인·source mapping 편집/중복 해결 UI·운영 장기 장애/키 회전, I01 전체 capabilities·설치, I03~I08 추가 연동, A09 운영 client/공식 API 완성, C03 사용자 디자인 검토, 양 제품 실제 인증/모델/메시지/결제/DNS/TLS·백업/복구·전체 QA/G 게이트. 외부 credential/계약 부재는 `blocked_integration`, I02/I07은 `in_progress`다.
- **다음 에이전트 정확한 명령:** mock **95318**을 중복 기동하지 말고 아래 ready를 먼저 확인한다. `TASKS.md` I02와 연동 계약 4.5, QA135~140, `apps/agent-api/src/{field-sources,source-refresh-worker}.ts`, `apps/field-api/src/facts-change-delivery.ts`를 읽는다. 다음 작업의 파일 범위·QA/게이트·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 적는다. 우선 중요값 live 재확인/안전한 stale 대체와 source mapping 충돌 UX를 공개 계약/검사부터 구현한다. 같은 DB 검사는 순차 실행하고 Field/AP 제품 경계를 유지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:db:agent
pnpm test:db:field
pnpm test:spike:ap-field:http
pnpm test:contracts
pnpm test:integration:faults
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A09/I02/I06/I07 갱신 중 AP 해제 경합 (2026-09-25)

- **현재 목표:** v3.0·`reference` 기준 AP/Field 독립 서비스를 기능 끝까지 사용할 수 있게 계속 구현한다. 디자인·흐름 사용자 검토는 아직이다. 전체 mock PTY **14173**: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API 4311/4321. 전체 Task/QA/출시 게이트는 미완료다.
- **완료 작업:** Field facts HTTP 대기 중 AP owner가 연결을 해제해도 갱신 worker가 새 검토 source를 저장하던 경합을 재현·수정했다. AP source 저장은 connection row 잠금과 현재 조직·Field grant·AP grant·상태 검사 후에만 실행한다. 해제가 먼저 commit되면 갱신 job은 blocked, source revoked와 이전 revision은 보존되며 신규 snapshot은 없다.
- **수정 파일:** `apps/agent-api/test/field-connection.db.test.ts`, `apps/agent-api/src/field-sources.ts`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일 및 재생성 마스터. AP 공개 계약·migration·Field 앱/DB 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 해제 경로와 source 저장 경로가 같은 AP connection row를 먼저 잠그므로 commit 순서를 직렬화한다. 실 Field HTTP 호출을 DB 잠금 안으로 옮기지 않고 응답 후 저장 직전에 재검사한다. 기존 source/예약/원본을 삭제하지 않는다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey mock, Git 없음. 새 AP 격리 DB 경합은 기존 코드 `completed`로 19/20 red, 수정 뒤 `pnpm test:db:agent` 20/20/임시 DB 삭제. `pnpm test:contracts` 정적 2/2+DB 5/5, `pnpm test:integration:faults` 정적 2/2·AP 3/3·Field 2/2·양제품 HTTP/worker 1/1, `pnpm lint`·`pnpm typecheck` exit 0. 새 `pnpm mock:run` **14173**은 양 API/웹 build·ready. 실 운영 단절·공급사/정식 QA/G-I는 미실행이다.
- **실패한 접근:** 기존 `source-refresh-worker`의 요청 시작 전 연결 검사만으로 해제 경합이 막힐 것이라는 가정은 red 검사에서 틀렸다. source 저장 자체에 잠금/재검사를 추가했다. 실패 기대값을 성공으로 바꾸거나 테스트를 삭제하지 않았다.
- **남은 작업:** I02 signed `facts.changed` 발행·누락 재조정, 중요값 라이브 재확인·source mapping 수정 UI; A09 나머지 공식 scope/운영 client; I06 실제 해제·발송 미상/보존; C03 사용자 검토·접근성; 실공급사·독립 운영/복구·전체 출시 게이트. 외부 credential/계약 부재는 `blocked_integration`; 관련 Task는 `in_progress`다.
- **다음 에이전트 정확한 명령:** mock **14173**을 중복 기동하지 않는다. 먼저 ready와 Field catalog release outbox/연결 event 경계를 읽고, I02 `facts.changed`/누락 재조정의 파일 범위·QA135/138/140·명령을 실행 계획에 적는다. 기존 AP/Field 내부 직접 import 없이 공개 계약/서명 경로로 구현한다. DB/양제품 HTTP 테스트는 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:db:agent
pnpm test:contracts
pnpm test:integration:faults
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A09/I02/C03 AP 공식 정보 갱신과 로컬 서버 (2026-09-25)

- **현재 목표:** v3.0 개발 문서와 `reference` 디자인대로 AP·Field 독립 기능을 계속 완성한다. 사용자 시각/흐름 확인은 아직이다. 로컬 전체 mock PTY **28891**을 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`, API 4311/4321로 실행한다. 46개 Task·160개 QA/출시 게이트는 미완료다.
- **완료 작업:** AP OpenAPI preview.7에 `ap.sources.refresh`와 현재 source·갱신 요청·작업 상태 계약을 추가했다. AP의 인증된 연결별 예상 버전/무작위 멱등 키 내구 작업과 worker가 Field 공개 사실을 재조회해 AP 검토 초안으로 저장한다. Field owner BFF와 320px 연결 화면이 scope/actor/조직/연결을 확인하고 결과 미상 때 같은 키를 재사용한다. 기존 OAuth resource 허용 범위는 `000054` migration으로 갱신했다. AP 검토/고객 AI 공개는 별도 행위다.
- **수정 파일:** `contracts/{agent-integrator-v1.openapi.json,CONTRACT_NOTES.md}`, `tools/test/agent-integrator-contract.test.mjs`, `apps/agent-api/migrations/{000053_source_refresh_jobs.sql,000054_oauth_resource_source_refresh_scope.sql}`, `apps/agent-api/src/{auth,integrator-auth,integrator-routes,source-refreshes,source-refresh-worker,field-sources,field-event-worker,app}.ts`, `apps/agent-api/test/field-connection.db.test.ts`, `apps/field-api/src/{ap-connector,ap-source-refresh,app}.ts`, `apps/field-api/test/ap-connection.db.test.ts`, `apps/agent-web/src/agent-connect.tsx`, `apps/field-web/src/{field-source-refresh,field-ap-connections}.tsx`, `tools/setup-mock-ap-connector.mjs`, `tools/spikes/{ap-field-connection-http.test.mjs,ap-field-connection-browser.py}`, `docs/{03_INTEGRATION_CONTRACT.md,technical/A09_PUBLIC_API_DESIGN.md,technical/PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일 및 재생성 마스터. Git 저장소/커밋 없음.
- **핵심 설계 결정:** Field는 AP 공개 HTTP 계약만 사용하며 AP DB/내부 domain을 import하지 않는다. 갱신 권한은 새 OAuth 동의가 필요하고 기존 연결에 자동 부여하지 않는다. source 버전 충돌은 409, 응답 분실은 같은 멱등 키/작업 ID로 복구, Field 조회 502/503은 worker 재시도다. 새 Field 정보는 `pending_review`이며 승인 source/AI 버전을 자동 바꾸지 않는다. 운영 client 재등록·재동의는 별도다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PostgreSQL 17·Field Valkey mock, 실제 HTTP/Chromium 320px, Git 없음. 계약 scope/경로·AP GET/POST·Field OAuth 요청의 부재 red를 먼저 확인했다. 최종 `pnpm test:db:agent` 20/20·`pnpm test:db:field` 19/19(제품별 임시 DB 삭제), `pnpm test:contracts` 정적 2/2+제품별 DB 5/5, `pnpm test:spike:connection-ui:http` 1/1, `pnpm test:spike:ap-field:http` 1/1, `/tmp/fieldai-ui-venv/bin/python tools/spikes/ap-field-connection-browser.py` 1/1(가로 넘침 없음/page error 0), `pnpm test:security` import/교차 DB 차단·AP 20/20·Field 19/19·tenant 1/1·양 관리자 1/1, `pnpm lint`·`pnpm typecheck` exit 0. 최종 `pnpm mock:run` **28891**은 양 API/웹 build 후 API ready·두 작업실 HTTP 200, `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0·`tools/check_package.py`는 문서 범위 46 Task/160 QA만 exit 0이다. 변경 뒤 외부 공급사나 운영 배포 검수는 하지 않았다.
- **실패한 접근:** 새 범위는 auth 설정과 mock OAuth client에만 넣었을 때 저장된 `oauthResource.allowedScopes`가 예전 목록이라 새 연결 token에서도 빠졌다. 기존 resource를 갱신하는 `000054` migration 적용 후 DB 값과 새 OAuth 브라우저를 재검사했다. 첫 브라우저 단언의 ‘아직 미지원’ 문구는 현행 `request.create` 지원과 달라 수정했다. 작업 완료 직후 조회 버튼이 사라질 때 검사 루프가 버튼을 다시 찾는 경쟁은 상태 반영 대기를 넣어 해결했다. 초기 red와 이 브라우저 실패는 통과로 보고하지 않는다.
- **남은 작업:** A09의 남은 설치/운영 scope·공개 계약 버전 호환 및 client 심사, I02 실공급사/장애·권한 전체 QA129~133/140, C03 사용자 디자인/접근성 확인, 상대 제품 중단 독립성 새 범위 회귀, 실모델·인증·알림·결제·DNS/TLS·백업/복구·운영 출시 게이트. 공급사 credential/계약 부재는 `blocked_integration`, A09/I02/C03은 `in_progress`다.
- **다음 에이전트 정확한 명령:** 현재 mock **28891**을 중복 기동하지 않는다. 먼저 서버 ready와 A09/I02/C03 현재 기록을 확인하고 다음 Task의 파일 범위·요구/QA/명령을 실행 계획에 적는다. 다음 우선순위는 공식 AP 통합자 남은 scope/운영 client 계약 또는 source refresh 재인가/해제 fault 검수다. AP/Field DB를 쓰는 통합 검사는 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:spike:ap-field:http
pnpm test:db:agent
pnpm test:db:field
pnpm test:contracts
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/A10/F10/I07/D05 로컬 표준 기능 검수 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`대로 AP·Field 기능을 끝까지 완성해 사용할 수 있는 환경을 둔다. 디자인/흐름의 사용자 검토는 아직이다. 전체 mock PTY **11532** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321.
- **완료 작업:** 실행 중인 AP/Field API ready 확인, 양제품/매체 표준 브라우저 E2E, 연결 장애, 보안 기본 검수를 실행했다. 간헐적 Field 격리 DB 테스트 종료 FK 오류를 합성 테스트 데이터 정리 순서로 고쳤다.
- **수정 파일:** `apps/field-api/test/integrator.db.test.ts`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일, 재생성 마스터. 제품 런타임·schema/migration·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** Field 실제 조직/연결 삭제 정책이나 FK cascade를 변경하지 않았다. 단일 격리 DB 테스트가 직접 만든 `ap_event_deliveries`를 자기 connection 범위에서 먼저 지우고 합성 조직을 정리한다. 테스트 실패는 실제 보안 명령 실패로 non-zero 전파한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey mock **11532**, Chromium/HTTP, Git 없음. `pnpm test:e2e:agent` 3/3, `pnpm test:e2e:field` 3/3, `pnpm test:e2e:distribution` 2/2, `pnpm test:integration:faults` 정적 계약 2/2·AP DB 3/3·Field DB 2/2·HTTP/worker 1/1, 수정 후 `pnpm test:security` import/DB credential 경계·AP 격리 DB 20/20·Field 19/19·tenant 1/1·양 관리자 브라우저 각 1/1, `pnpm lint`·`pnpm typecheck` 모두 exit 0. 임시 DB는 제품별로 삭제됐다.
- **실패한 접근:** 첫 `pnpm test:security`는 AP 20/20 뒤 Field 18/19와 `ap_event_deliveries_connection_id_fkey` 23503으로 exit 1. 이어 단독 `pnpm test:db:field`는 19/19로 통과해 합성 조직 cascade 정리 순서의 간헐성을 확인했다. 테스트 finally에서 연결별 합성 전달 사건을 먼저 정리해 전체 보안 명령을 다시 통과했다.
- **남은 작업:** 디자인/흐름 사용자 확인, 46개 Task와 160개 QA의 미완료 항목, 반대 제품 중단 독립성 재검사, S3/HEIC·데이터 보존/복구·실인증/모델/알림/결제/DNS/TLS, 운영 장애/침투·출시 게이트. 공급사 의존은 `blocked_integration`이며 로컬 검수를 출시 승인으로 해석하지 않는다.
- **다음 에이전트 정확한 명령:** mock **11532**을 중복 기동하지 않는다. 다음 Task 시작 전 범위·요구/QA/게이트·명령을 실행 계획에 추가하고 검수한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:e2e:agent
pnpm test:e2e:field
pnpm test:e2e:distribution
pnpm test:integration:faults
pnpm test:security
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A02/F05/C03 후속 사진 재첨부와 같은 파일 재선택 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`대로 AP/Field 기능을 끝까지 완성해 사용할 수 있는 환경을 만든다. 사용자 디자인·흐름 확인은 후속이다. 전체 로컬 mock 서버 PTY **11532** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321. 전체 46개 Task·출시 게이트 완료를 주장하지 않는다.
- **완료 작업:** 응답 분실→새로고침으로 복구된 AP/Field 고객 추가 질문에 로컬 PNG를 다시 선택해 원래 메시지 ID의 비공개 사진 한 건으로 저장하는 실제 브라우저 검수를 추가했다. 이어 같은 PNG를 다음 질문에 재선택해 새 메시지에 별도 첨부할 수 있도록 후속 대화 화면의 파일 input 상태를 업로드 성공·확인키 변경 시 초기화했다. 고객 사진 바이트를 탭 저장소에 보관하지 않는다.
- **수정 파일:** `apps/agent-web/src/agent-public.tsx`, `apps/field-web/src/field-public.tsx`, `tools/spikes/agent-owner-flow-browser.py`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일, 재생성 마스터. API/DB migration·AP↔Field 계약·교차 import 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 브라우저 `File` 상태를 null로 만든 뒤에도 `<input type=file>`의 선택값은 남는다. 같은 파일을 다시 선택했을 때 `change`가 발생하지 않는 문제를 원천에서 해결하기 위해 파일 input ref의 `value`를 성공/키 변경 시 비운다. 업로드 실패 시에는 파일을 유지해 재시도할 수 있다.
- **실제 검사/환경/커밋:** 제품별 로컬 PostgreSQL 17·Field Valkey mock **11532**, Chromium 320px, Git 없음. 새 브라우저 검사는 AP/Field에서 복구 메시지 사진 첨부 뒤 같은 PNG 두 번째 선택 시 업로드 미시작으로 각각 exit 1 red. AP 진단 단언은 `선택한 사진` UI 상태 미갱신으로 red. 최종 `pnpm test:spike:agent-owner-flow:http` 1/1·`pnpm test:spike:field-owner-flow:http` 1/1 green: 복구 메시지의 `messageId`와 첨부 `messageId` 일치·고객 비공개 이미지, 같은 PNG를 다음 질문에 재선택해 새 첨부. `pnpm lint`, `pnpm typecheck` exit 0, `pnpm mock:run` 양 API/웹 build·API ready·작업실 HTTP 200. Python 브라우저 스크립트의 최종 실행 자체가 구문/동작 검사를 수행했다. 이번 UI 수정 뒤 DB·unit은 재실행하지 않았다.
- **실패한 접근:** 최초 새 검수는 이전 사진 첨부 성공 뒤 파일 input에 같은 PNG가 남아 있어 다음 선택이 React 상태를 바꾸지 못했다. 업로드 POST가 없었고 10초 업로드 이벤트 대기에서 실패했다. 진단 단언으로 원인을 좁힌 뒤 파일 input 초기화 한 가지를 적용해 전체 흐름을 다시 통과했다. 실고객 발송·청구·운영 배포·운영 데이터 삭제 없음.
- **남은 작업:** 실 S3/HEIC·사진 보존/복구, 닫힌 탭·타 기기에서 확인키 미보관 고객 지원 정책, 실공급사 인증/모델/알림/결제·DNS/TLS, C03 사용자 시각·흐름/200% 확대·스크린리더·전체 키보드, 독립 운영·복구·정식 QA/G. 관련 Task는 `in_progress`, 공급사 의존은 `blocked_integration`이다.
- **다음 에이전트 정확한 명령:** 실행 중 세션 **11532**을 중복 기동하지 않는다. 다음 Task 전 파일 범위·요구/QA/게이트·명령을 실행 계획에 기록한다. 서버 상태와 인접 로컬 기능을 확인하고 다음 구현 가능 항목을 진행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:agent-owner-flow:http
pnpm test:spike:field-owner-flow:http
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A02/A03/F05/F06 후속 질문 새로고침 복구 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`대로 AP/Field 기능을 끝까지 완성해 사용할 수 있는 환경을 만든다. 사용자 디자인·흐름 확인은 후속이다. 전체 로컬 mock 서버 PTY **46615** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321. 46개 Task의 전체 완료·출시 승인은 아니다.
- **완료 작업:** AP/Field 비회원 추가 질문의 첫 POST가 원장에 저장된 뒤 응답을 잃어도 같은 탭 새로고침에서 원본 메시지 ID를 확인한다. 제품별 읽기 전용 `GET /v1/inquiries/:id/messages/recover`는 현재 확인키 Bearer와 제출 키 해시 및 고객 공개 메시지 조건을 검사하고, 모든 응답에 no-store를 둔다. 잘못된/교체된 확인키 401, 틀린 제출 키 404, 약한 키 400이다. 탭 `sessionStorage`에는 1시간 동안 문의 ID·현재 확인키·제출 키·본문 SHA-256만 보관하고 원문/사진 바이트는 저장하지 않는다. 404/503·네트워크 미상에서 시도를 보존하며 같은 본문만 같은 키로 재시도하고, 다른 본문 제출·확인키 교체는 결과 확인 전 차단한다. 확인된 메시지 ID는 사진을 다시 선택해 첨부할 경로에 연결한다.
- **수정 파일:** `apps/agent-api/src/inquiries.ts`, `test/inquiries.db.test.ts`, `apps/agent-web/src/{agent-public,pending-message-submission}.tsx/ts`; `apps/field-api/src/inquiries.ts`, `test/business-core.db.test.ts`, `apps/field-web/src/{field-public,pending-message-submission}.tsx/ts`; `tools/spikes/{agent-owner-flow-browser,field-owner-flow-browser}.py`; `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일, 재생성 마스터. 제품별 공개 API 경로 1개씩 추가. Migration·AP↔Field 연결 계약·교차 import 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 이전 제출의 고객 본문을 브라우저에 저장하지 않는다. 조회 성공은 서버의 기존 메시지와 멱등 원장을 읽어 확인하며, 조회 장애에서는 새 제출 키를 만들지 않는다. 확인키를 입력창에서 바꿨더라도 명시 재조회가 저장된 원래 키를 복원한다. 미확정 질문은 확인키 교체를 막는다. 저장소/crypto를 쓸 수 없는 환경은 현재 화면의 같은 본문 재시도만 안내한다.
- **실제 검사/환경/커밋:** 로컬 제품별 PostgreSQL 17·Field Valkey mock **46615**, Chromium 320px, Git 없음. 격리 DB 신규 경로 404 red(AP 19/20·Field 18/19) → 최종 `pnpm test:db:agent` 20/20·`pnpm test:db:field` 19/19. 두 브라우저 신규 임시 기록 부재 red → 최종 `pnpm test:spike:agent-owner-flow:http` 1/1·`pnpm test:spike:field-owner-flow:http` 1/1. 둘 다 POST commit/ACK 분실→새로고침→메시지 한 건, 임시 기록의 원문 부재/성공 뒤 삭제. Field는 복구 GET 503→수정 내용 추가 POST 0건, 확인키 교체 차단, 다른 키 입력 후 명시 재조회로 원래 키 복원을 통과했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:tenant-host:http` 1/1, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, Python `py_compile` exit 0. `pnpm mock:run`이 양 API/웹을 새 코드로 빌드했고 두 API ready·두 작업실 HTTP 200이다.
- **실패한 접근:** 첫 Field 브라우저 503 검사에서 미확정 시 확인키 교체 버튼이 살아 있어 red였다. 미확정 상태에서는 교체 패널을 숨기고, 재조회 시 입력된 다른 확인키를 원래 키로 되돌리도록 수정해 전체 브라우저를 다시 통과했다. 구현 전 브라우저 검사는 AP/Field 모두 임시 저장값 부재로 red였다. 실고객 메시지 발송·청구·운영 배포·운영 데이터 삭제 없음.
- **남은 작업:** 새로고침 뒤 사진 재선택·복구된 메시지에 재첨부하는 별도 브라우저 검수, 닫힌 탭·타 기기에서 확인키 미보관 고객 지원 정책, 실공급사 인증/모델/알림/결제·DNS/TLS/저장소, C03 사용자 시각·흐름/200% 확대·스크린리더·전체 키보드, 독립 운영·복구·정식 QA/G. Task는 `in_progress`, 공급사 의존은 `blocked_integration`이다.
- **다음 에이전트 정확한 명령:** 실행 중 세션 **46615**을 중복 기동하지 않는다. 다음 Task 전 파일 범위·요구/QA/게이트·명령을 실행 계획에 기록한다. 서버 상태를 확인하고 다음 로컬 구현 가능 항목을 진행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:db:agent
pnpm test:db:field
pnpm test:spike:agent-owner-flow:http
pnpm test:spike:field-owner-flow:http
pnpm test:spike:tenant-host:http
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A02/A03/F05/F07 공개 접수 새로고침 복구 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`대로 AP/Field 기능을 끝까지 완성해 사용 가능한 환경을 만든다. 사용자 디자인·흐름 확인은 후속이다. 전체 로컬 mock 서버 PTY **56038** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321. 46개 Task의 전체 완료·출시 승인은 아니다.
- **완료 작업:** AP 직접 문의·상담 사람 인계, Field 직접 문의·예약의 첫 공개 제출이 DB에 저장된 뒤 응답을 잃어도 같은 탭 새로고침으로 원본 ID와 현재 유효 확인키를 찾는다. 네 공개 read-only `/recover` GET은 조직/대화 ID 및 제출 키·확인키의 두 해시를 요구한다. 틀린/교체된 키는 404, 약한 키는 400, AP 다른 Origin은 403이며 모든 GET 응답은 no-store다. 화면은 1시간 이내 탭 `sessionStorage`에 경로·무작위 키 두 개·입력 SHA-256만 보존하고 고객 입력 원문은 저장하지 않는다. 조회 미상에서는 같은 입력만 동일 키로 재시도하고 다른 입력은 이전 시도를 명시 포기해야 한다. 성공 뒤 임시 시도는 삭제한다. 저장소를 사용할 수 없는 브라우저는 현재 화면에서만 재시도할 수 있다고 안내한다.
- **수정 파일:** AP `apps/agent-api/src/{inquiries,customer-consultations}.ts`, `test/{inquiries,customer-consultations}.db.test.ts`, `apps/agent-web/src/{agent-public,pending-public-submission}.tsx/ts`; Field `apps/field-api/src/{inquiries,bookings}.ts`, `test/{business-core,bookings}.db.test.ts`, `apps/field-web/src/{field-public,field-booking,pending-public-submission}.tsx/ts`; `tools/spikes/{agent-owner-flow-browser,field-owner-flow-browser}.py`; `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, 이 파일, 재생성 마스터. Migration·제품 간 연결 계약·교차 import 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 브라우저는 요청 원문을 저장하지 않는다. GET은 기존 POST 멱등 원장과 현재 확인키 해시를 읽으므로 키 교체 뒤 이전 시도를 통한 재노출이 없다. 새로운 로그인/OTP를 요구하지 않는다. 조회 404/503에서는 원본 생성 미확정 상태를 보존하며 자동 신규 POST를 만들지 않는다. 별도 탭/기기는 고객이 보관한 확인키 경로를 쓴다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PostgreSQL 17·Field Valkey mock **56038**, 320px Chromium, Git 없음. AP 상담·Field 예약 API는 구현 전 404 red; AP/Field 직접 문의 API red는 기존 테스트 정리 FK 실패가 가렸다. 최종 격리 `pnpm test:db:agent` 20/20·`pnpm test:db:field` 19/19. `pnpm test:spike:agent-owner-flow:http` 1/1과 `pnpm test:spike:field-owner-flow:http` 1/1은 POST commit/ACK 분실→새로고침→동일 확인키/원본 회복, Field 복구 GET 503 중 수정 입력 추가 POST 0건→명시 재조회 회복을 확인했다. 임시 보관값에 연락처·문의 원문이 없고 성공 뒤 삭제됨, 320px 가로 넘침 없음. `pnpm test:spike:tenant-host:http` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, Python `py_compile` exit 0. `pnpm mock:run`이 양 API/웹을 새 코드로 빌드했고 제품별 ready·두 `/workspace` HTTP 200.
- **실패한 접근:** 신규 직접 문의 GET 404 red 뒤 기존 테스트의 실패 정리가 조직 FK를 남겨 23503으로 원래 실패를 가렸다. 격리 DB 최종 검사와 다른 두 경로의 명시 404 red로 구분했다. 이 red 실행이 mock DB에 남긴 AP/Field 합성 상호·owner 조직 각 1건은 이메일 `@example.invalid`와 정확한 테스트 상호를 조회한 뒤 트랜잭션으로 정리했다. 초기 브라우저 정상 복구 뒤 조회 장애와 다른 입력을 추가 검수했다. 고객 실발송·청구·운영 배포/실제 운영 데이터 삭제 없음.
- **남은 작업:** A02/F05 후속 메시지/사진 제출의 새로고침 복구, 탭 종료·다른 기기에서 확인키를 보관하지 못한 고객 지원 정책, 실공급사 인증/모델/알림/결제·실 DNS/TLS/저장소, C03 사용자 시각/흐름·200% 확대/스크린리더/전체 키보드, 독립 운영·복구·정식 QA/G. 관련 Task는 `in_progress`, 공급사 의존은 `blocked_integration`이다.
- **다음 에이전트 정확한 명령:** 실행 중 세션 **56038**을 중복 기동하지 않는다. 다음 Task 전 파일 범위·요구/QA/게이트·명령을 실행 계획에 기록한다. 서버 ready와 격리 검수 확인 후 로컬에서 가능한 다음 기능을 진행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:db:agent
pnpm test:db:field
pnpm test:spike:agent-owner-flow:http
pnpm test:spike:field-owner-flow:http
pnpm test:spike:tenant-host:http
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A02/F05/F07 공개 접수 조직 전체 상한 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`대로 AP/Field 기능을 끝까지 완성해 사용 가능한 환경을 만든다. 사용자 디자인·흐름 확인은 후속이다. 전체 로컬 mock 서버 PTY **36783** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321. 46개 Task는 여전히 부분 구현/미검수 상태이며 출시 승인이 아니다.
- **완료 작업:** 제품별 공개 신규 접수에 기존 정규화 연락처 5건/15분과 별도의 조직 전체 기본 60건/15분을 모두 적용했다. AP 직접 문의·상담 인계, Field 직접 문의·예약이 각 제품 안에서 한 원장을 공유한다. 제품별 환경변수로 조직 상한을 1~1000 조정한다. 거절된 요청은 트랜잭션 롤백으로 원장·원본·알림을 추가하지 않고 429 `scope`/`Retry-After`를 반환한다. 이미 저장된 멱등 제출은 한도 이후에도 200으로 복구하고 고객 화면은 두 제한 원인을 구별한다. Field 내부 사업자 테스트 문의는 한도 대상이 아니다.
- **수정 파일:** AP migration `apps/agent-api/migrations/000052_public_submission_organization_windows.sql`, `src/{public-submission-limit,inquiries,customer-consultations}.ts`, `test/inquiries.db.test.ts`, `apps/agent-web/src/agent-public.tsx`; Field migration `apps/field-api/migrations/000046_public_submission_organization_windows.sql`, `src/{public-submission-limit,inquiries,bookings}.ts`, `test/bookings.db.test.ts`, `apps/field-web/src/{field-public,field-booking}.tsx`; `.env.example`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, 이 파일, 재생성 마스터. 공개 AP↔Field 계약·서로의 DB import 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 제품마다 한 조직 한도를 별도 PG 표에 두고 연락처 한도 뒤 같은 트랜잭션에서 직렬 소비한다. 기본 60건은 로컬 안전 기본값이며 실공급사 가격·고객 유입량에 따른 운영 상한 승인은 별도다. 조직 전체 상한은 공격자가 정상 고객을 차단할 수 있으므로 신고·DoS 운영 대응과 실제 부하 검수는 출시 게이트에 남긴다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PostgreSQL 17·Field Valkey mock **36783**, Git 없음. 두 DB 테스트는 새 원장 미존재 42P01로 red 후 최종 AP 20/20·Field 19/19 green. AP 신규 번호 허용→조직 429·멱등 200·만료 복구, Field 예약→직접 문의 공유 429와 만료를 확인했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:agent`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. `pnpm test:e2e:agent` 3/3, `pnpm test:e2e:field` 3/3. 양 API `/health/ready` 제품별 200, 두 `/workspace` HTTP 200. 새 429 UI 문구의 별도 320px 오류 주입 검사는 미실행.
- **실패한 접근:** Field 조직 상한 테스트를 카탈로그 예약 방식이 희망 시간에서 시간표로 바뀐 뒤 실행해 요청 자체가 400이었다. 유효한 희망 시간 공개본 단계로 테스트를 이동해 green을 확인했다. 고객 발송·청구·삭제·운영 배포 없음.
- **남은 작업:** 조직 상한의 실부하/요금·신고/DoS·운영 설정 검수, 429 UI 별도 320px 주입, 기존 C03 사용자 시각/흐름·200% 확대/스크린리더/전체 키보드, 공급사 인증/모델/알림/결제·실 DNS/TLS/저장소, 독립 운영·복구/정식 QA/G. 공급사 의존은 `blocked_integration`; Task는 `in_progress`다.
- **다음 에이전트 정확한 명령:** 실행 중인 세션 **36783**을 중복 기동하지 않는다. 다음 Task 전 파일 범위·요구/QA/게이트·명령을 실행 계획에 기록한다. 로컬 서버를 먼저 확인하고 다음 로컬 구현 항목을 진행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:db:agent
pnpm test:db:field
pnpm test:e2e:agent
pnpm test:e2e:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/F02/F04/F05 고객처럼 첫 문의 테스트 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`대로 AP/Field 기능을 끝까지 완성해 사용 가능한 환경을 만든다. 사용자 디자인·흐름 확인은 후속이다. 전체 로컬 mock 서버 PTY **89466** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321. 46개 Task implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 개설 완료의 첫 문의 테스트를 사업자 플랫폼 공개 고객 화면의 전용 모드로 연결했다. 서비스·이름·내용을 고객 화면에서 입력하고 Field API는 사업자 세션·조직·현재 사이트 공개 revision·최신 승인 카탈로그 서비스를 검증한다. 비로그인/타 조직의 테스트·실문의·예약 제출은 테스트 모드에서 닫힌다. 같은 입력/버전은 한 test 원본으로 수렴하고 바뀐 입력은 409다. 전화·고객 동의·확인키·outbox/외부 알림·실적·일정 점유는 없으며 문의함/답변·내보내기 test 표시를 유지한다. 실제 고객 폼은 기존 경로로 동작한다.
- **수정 파일:** `apps/field-api/src/inquiries.ts`, `test/site-inquiry-test.db.test.ts`; `apps/field-web/src/site-editor.tsx`, `src/field-public.tsx`; `tools/spikes/field-owner-flow-browser.py`; `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 신규 migration·AP·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 사업자 테스트는 고객 공개 화면의 서비스·이름·내용 입력을 사용하되 플랫폼 세션의 owner 권한으로만 제출한다. 실제 고객 연락처/동의/사진·예약은 테스트 모드에서 숨긴다. 사이트 revision은 최신 공개본, 서비스는 실제 고객 문의 화면처럼 최신 승인 카탈로그로 검증한다. 공개 버전당 한 건이며 동일 입력만 재시도 가능하다. 검증 자기 수신처·실발송 공급사 부재로 QA69 전체는 `blocked_integration`이다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PostgreSQL 17·Field Valkey mock **89466**, 320px Chromium, Git 없음. Field 임시 DB는 신규 GET 404로 18/19 red → 최종 19/19 green(권한/공개/revision/서비스·최신 승인 카탈로그, 병렬 201/200 같은 ID, 변경 409, 무발송·무실적·무점유). 기존 320px 브라우저는 테스트 링크 없음으로 red → 최종 `pnpm test:spike:field-owner-flow:http` 1/1 green: 비로그인 테스트 모드의 실제 제출/예약 차단, 사업자 테스트 입력→POST 201 commit/ACK 분실→동일 200·문의함 내부 답변, 기존 비회원 실제 문의·두 예약. `pnpm test:spike:tenant-host:http` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python 구문 검사 exit 0, 양제품 build·API ready/웹 HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/check_package.py`는 `document_package_only` 범위에서 통과했다.
- **실패한 접근:** 테스트 입력 해시만 기존 `submission_request_hash`에 넣었더니 짝 칼럼을 요구하는 DB 제약 23514를 만났다. 서비스·이름·첫 메시지 비교로 재시도 계약을 구현했다. 공개 뒤 새 승인 카탈로그를 사용한 고객 화면과 이전 사이트 카탈로그를 사용한 테스트 API가 달랐고 DB red로 확인해 최신 승인본으로 맞췄다. 첫 새 브라우저는 201 ACK 분실 뒤 정상 200 복구 문구를 201 문구로 기대해 실패했고 검사를 고쳤다. 고객 실발송·청구·삭제 없음.
- **남은 작업:** QA69 검증 자기 수신처/실발송 공급사, C03 사용자 시각/흐름·200% 확대/스크린리더/전체 키보드, Field 실 DNS/TLS·사진 저장소/AI, AP/Field 실알림·인증/결제와 A10/F10/D05 독립 운영/출시 증빙. Task는 `in_progress` 또는 `planned`; 공급사 의존은 `blocked_integration`.
- **다음 에이전트 정확한 명령:** 실행 중 서버를 중복 기동하지 않는다. 다음 작업 전 파일 범위·요구/QA·검사 명령을 실행 계획에 기록한다. 서버 상태와 격리 검수를 확인하고 문서상 다음 로컬 구현 가능 항목을 진행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:db:field
pnpm test:spike:field-owner-flow:http
pnpm test:spike:tenant-host:http
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/F04/F05/F06 Field 안전한 내부 첫 문의 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`대로 AP/Field 기능을 끝까지 완성해 사용 가능한 환경을 만든다. 사용자 디자인·흐름 확인은 후속이다. 전체 로컬 mock 서버 PTY **90580** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321. 46개 Task implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 승인 사이트 버전별 사업자 인증의 내부 테스트 문의 생성·중복/응답 분실 복구. DB `is_test`/사이트 revision, 동의 null·전화 빈값·비노출 확인키. 생성/사업자 답변에 outbox·고객 알림 없음, 실제 문의 사용량·관리자 미종결 집계·예약 점유 제외. 사업자 문의함/단일 JSON·운영 보관에 테스트 표시. 실제 고객 공개 폼은 실제 접수로 유지한다.
- **수정 파일:** `apps/field-api/migrations/000045_site_inquiry_tests.sql`, `src/inquiries.ts`, `src/usage.ts`, `src/admin.ts`, `src/operations-archive.ts`, `test/site-inquiry-test.db.test.ts`; `apps/field-web/src/site-editor.tsx`, `src/field-workspace.tsx`, `src/field-api.ts`; `tools/spikes/field-owner-flow-browser.py`; `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. AP/제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 내부 테스트는 공개 사이트 revision 하나에 문의 한 건만 생성하고, 고객 전화/동의/외부 수신처를 사용하지 않는다. 같은 revision의 병렬/응답 분실 POST는 같은 ID로 수렴한다. 테스트 답변은 기록만 하고 발송 사건을 만들지 않는다. 실제 고객 폼 경로는 테스트 경로로 바꾸지 않는다. 검증된 자기 수신처·실발송 공급사가 없으므로 QA69 전체는 `blocked_integration`이다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PostgreSQL 17·Field Valkey mock **90580**, 320px Chromium, Git 없음. 신규 Field 격리 DB는 경로 404로 18/19 red → 수정 후 19/19 green(인증·타조직·공개 전 거부, 병렬 201/200 같은 ID, DB flag/동의·전화/무발송/사용량·점유/내보내기). 전체 `pnpm test:spike:field-owner-flow:http` 1/1은 테스트 POST commit/ACK 분실→같은 원본 회복, 문의함 테스트 답변, 기존 사업자→비회원 실문의·두 예약 완료. `pnpm test:spike:tenant-host:http` 1/1, `pnpm test:security` 로컬 기본 검수 exit 0(AP 임시 DB 20/20·Field 19/19·tenant/두 관리자), `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python 구문 검사 exit 0, 양 API/웹 build·ready·작업실 HTTP 200, 무인증 새 POST 401. 문서 패키지 검사는 `/tmp/fieldai-report-venv/bin/python tools/check_package.py`로 `document_package_only` 통과했으며 서비스 검사를 대체하지 않는다.
- **실패한 접근:** 첫 구현 뒤 테스트 정리가 site release→catalog release FK 순서를 어겨 실제 결과를 가렸고 정리 순서를 수정했다. 첫 전체 브라우저는 테스트 답변 뒤 비동기 저장이 끝나기 전에 다음 문의를 제출해 실패했으며 버튼 활성/선택 완료를 기다리도록 고쳤다. 기본 `python3 tools/check_package.py`는 `jsonschema` 미설치로 exit 1이라 보고서 venv를 사용했다. 고객 실발송·청구·삭제 없음.
- **남은 작업:** QA69의 검증 자기 수신처/실발송 공급사·공개 고객 폼을 통한 안전 테스트, C03 사용자 시각/흐름·200% 확대/스크린리더/전체 키보드, Field 실 DNS/TLS·사진 저장소/AI, AP/Field 실알림·인증/결제와 A10/F10/D05 독립 운영/출시 증빙. Task는 `in_progress` 또는 `planned`; 공급사 의존은 `blocked_integration`.
- **다음 에이전트 정확한 명령:** 실행 중 서버를 중복 기동하지 않는다. 작업 전 새 파일 범위·요구/QA·검사 명령을 실행 계획에 기록한다. 아래로 서버 상태와 격리 검수를 확인하고 C03/다음 선행 기능을 진행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:db:field
pnpm test:spike:field-owner-flow:http
pnpm test:spike:tenant-host:http
pnpm lint
pnpm typecheck
pnpm test:unit
```

## 최신 인수인계 — C03/F02/F04 Field 개설 완료·다음 행동 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`대로 AP/Field 기능을 끝까지 완성해 사용 가능한 환경을 만든다. 사용자 디자인·흐름 확인은 후속이다. 전체 mock 세션 **4479** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321. 46개 Task implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 확인·공개 단계의 서버 승인 공개본/tenant 주소를 로컬 개설 완료 카드에 연결했다. 공개 사이트·고객 문의 화면·사업 운영·선택 AP 연결을 실제 링크로 제공한다. 주소 미확인/공개 결과 미상에서는 완료와 고객 링크를 숨기고 재조회한다. 비 mock 도메인은 DNS/TLS 검수 전 운영 완료라고 표시하지 않는다.
- **수정 파일:** `apps/field-web/src/site-editor.tsx`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Field API/DB/migration·AP·계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 완료 표시는 POST 응답만 아니라 Field 공개 GET으로 revision·주소를 재확인한 뒤 연다. QA69의 테스트 문의는 server test flag/검증 수신처가 없어 실제 문의 제출을 테스트 성공으로 포장하지 않고, 실제 접수된다고 명시한다. AP 연결은 선택 경로다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PG17·Field Valkey mock **4479**, 320px Chromium, Git 없음. 기존 전체 Field 브라우저는 공개 확인 뒤 완료 카드 부재로 exit 1 red. 수정 후 `pnpm test:spike:field-owner-flow:http` 1/1은 공개 GET 실패·POST 결과 미상 완료 숨김, 정상 tenant/고객/운영/AP 링크, null 주소 주입→완료 숨김/재조회 복구, 사업자→비회원 문의·두 예약 전체를 통과했다. `pnpm test:spike:tenant-host:http` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python `py_compile` exit 0, 양 API/웹 빌드·ready/작업실 HTTP 200. `tools/check_package.py`는 `document_package_only` 통과로 서비스 검사를 대체하지 않는다.
- **실패한 접근:** 기존 편집 단계에는 공개본 링크 한 개만 있었고 완료/다음 행동이 없었다. 고객 실발송·청구·삭제 없음.
- **남은 작업:** QA69 서버 test flag/검증 수신처/실적·일정 제외, C03 사용자 시각/흐름·200% 확대/스크린리더/전체 키보드, Field 실 DNS/TLS·사진 저장소/AI, 제품별 실알림·인증/결제·A10/F10/D05 독립 운영/출시 증빙. Task 상태는 `in_progress` 또는 `planned`, 공급사 의존은 `blocked_integration`.
- **다음 에이전트 정확한 명령:** 실행 중 서버를 중복 기동하지 않는다. 다음 기능 전 파일 범위·요구/QA·검사 명령을 실행 계획에 기록한다. Field 실제 문의를 테스트라고 표기하지 말고 QA69는 원장·수신처·실적/점유 경계를 함께 구현한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:field-owner-flow:http
pnpm test:spike:tenant-host:http
pnpm lint
pnpm typecheck
pnpm test:unit
```

## 최신 인수인계 — C02/C03 로컬 보안 표준 명령 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`대로 AP/Field 기능을 끝까지 완성해 사용 가능한 환경을 만든다. 사용자 디자인·흐름 확인은 후속이다. 전체 mock 세션 **24533** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321. 46개 Task implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** 미구현 `pnpm test:security`를 로컬 mock 전용 표준 실행 명령으로 교체했다. 고정 로컬 DB/queue/제품 API·웹 준비를 확인한 뒤 import 경계, 양방향 교차 DB credential 거부, 제품별 임시 DB 전체 검사, tenant HTTP 및 두 관리자 320px 권한·조회 감사 브라우저를 순서대로 실행한다. 자식 실패는 상위 non-zero다.
- **수정 파일:** `tools/run-security.mjs`, `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 제품 API/DB/migration/웹/계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 표준 명령의 통과 범위를 로컬 mock 권한·격리 baseline으로 출력한다. 외부 공급사, 침투, 운영 배포, 전체 QA/G 보안 승인으로 승격하지 않는다. 검사 대상 DB URL/계정/포트를 고정하고 자식에게 제품 비밀값 환경변수를 넘기지 않는다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PG17·Field Valkey 전체 mock **24533**, 320px Chromium, Git 없음. 기존 `pnpm test:security`는 placeholder exit 2. 새 명령 exit 0: import 경계, 양쪽 자기 DB 연결/상대 자격증명 28P01 차단, AP 격리 DB 20/20·Field 18/18/정리, Field tenant HTTP 1/1·AP/Field 관리자 HTTP/브라우저 각 1/1. `NODE_ENV=production node tools/run-security.mjs`는 의도된 exit 1; fake 하위 `pnpm` exit 7은 runner exit 1과 임시 AP DB 정리 확인. `node --check tools/run-security.mjs`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0, 양 API ready·웹 HTTP 200. `tools/check_package.py`는 `document_package_only` 통과이며 서비스 검사를 대체하지 않는다. 웹 코드는 변경하지 않아 빌드/재시작하지 않았다.
- **실패한 접근:** 기존 명령은 하위 검사를 실행하지 않는 자리표시자였다. 실제 고객 메시지 발송·청구·삭제 없음.
- **남은 작업:** C03 사용자 시각/흐름·200% 확대/스크린리더/키보드 전체, 제품별 실모델·알림·인증/결제·DNS/백업·관리자 MFA/조치/복구, A10/F10/D05 독립 운영 및 전체 QA/G 보안/출시 증빙. 공급사 의존은 `blocked_integration`.
- **다음 에이전트 정확한 명령:** 실행 중 서버를 중복 기동하지 않는다. 다음 기능 전 파일 범위·요구/QA·검사 명령을 실행 계획에 기록한다. 표준 보안 명령은 로컬 baseline만 검증한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:security
pnpm lint
pnpm typecheck
pnpm test:unit
```

## 최신 인수인계 — C03/F04 Field 공개 사이트 장애 화면·회복 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`대로 AP/Field 기능을 끝까지 완성해 사용 가능한 환경을 만든다. 사용자 디자인·흐름 확인은 후속이다. 전체 mock 세션 **24533** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321. 46개 Task implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 공개 사이트 홈/하위 URL에서 Field API 503·네트워크 실패 시 320px 고객 브라우저에 일시 장애 안내·같은 URL 새로고침을 표시한다. API 회복 후 승인 콘텐츠로 돌아오고 404 미공개/없는 페이지는 404로 남는다. 비공개 upstream 본문은 표시하지 않는다.
- **수정 파일:** `apps/field-web/src/app/site/error.tsx`, `site-metadata.ts`, `[slug]/page.tsx`, `[slug]/[page]/page.tsx`, `apps/field-web/src/site.css`, `tools/spikes/field-site-outage-http.test.mjs`, `field-site-outage-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API/DB/migration/제품 간 계약·AP 코드 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** metadata 조회 실패는 일반 제목/noindex로 처리해 페이지 오류 경계에 도달하게 한다. 404 여부는 페이지에서 판단한다. Next error `reset()`은 실제 서버 조회를 재실행하지 않아 버튼은 현재 주소 전체 새로고침을 사용한다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PG17·Field Valkey 전체 mock **24533**, 별도 포트의 실제 Next/가짜 503→200/404 API·320px Chromium, Git 없음. 기존 빌드는 500 안내 부재로 red; 오류 화면만 추가해도 metadata 오류로 red; metadata 수정 뒤 `reset()` 미재조회로 red. 최종 `node --test tools/spikes/field-site-outage-http.test.mjs` 1/1은 홈·하위 페이지 장애→버튼→회복된 공개 콘텐츠/원래 URL, 404, 비공개 본문 비노출, 가로 넘침 없음/버튼 글자 14px 이상을 통과했다. 새 전체 mock에서 `pnpm test:spike:tenant-host:http` 1/1, `pnpm test:spike:field-owner-flow:http` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `node --check`·Python `py_compile` exit 0, 양제품 빌드·ready. `tools/check_package.py`는 `document_package_only`로 통과했으며 서비스 테스트를 대체하지 않는다.
- **실패한 접근:** 초기 오류 컴포넌트만으로 metadata 오류를 포착하지 못했다. Next `reset()`은 같은 공개 사이트 API를 재조회하지 않았다. metadata fallback과 전체 새로고침으로 해결했다. 고객 실발송·청구·삭제 없음.
- **남은 작업:** C03 공통 템플릿·사용자 시각/흐름·200% 확대/스크린리더/전체 키보드, Field 실 DNS/TLS·사진 저장소/AI, AP/Field 실알림·인증/결제·A10/F10/D05 독립 운영/출시 증빙, 관리자 관리 조치/MFA/복구. 관련 Task `in_progress` 또는 `planned`, 공급사 의존은 `blocked_integration`.
- **다음 에이전트 정확한 명령:** 서버가 살아 있으면 중복 기동하지 않는다. 다음 기능 전 파일 범위·요구/QA·검사 명령을 실행 계획에 기록한다. 아래 상태를 확인하고 C03 남은 경로를 진행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://localhost:3002/workspace
node --test tools/spikes/field-site-outage-http.test.mjs
pnpm test:spike:tenant-host:http
pnpm test:spike:field-owner-flow:http
pnpm lint
pnpm typecheck
pnpm test:unit
```

## 최신 인수인계 — C03/F04/F05 Field tenant 공개 문의 장애 상태 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`대로 AP/Field 기능을 완성해 사용 가능한 환경을 만든다. 사용자 화면 디자인·흐름 확인은 후속이다. 전체 mock 서버 세션 **37244** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321. 46개 Task implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field tenant 호스트 `/public/:organizationId`의 소유 확인에서 공개 사이트 404/조직 불일치는 404를 유지하고, Field API 장애·네트워크 단절은 HTTP 503/no-store/새로고침 안내로 구분한다. 오류 본문에 상대 tenant/상류 비공개 내용을 넣지 않는다.
- **수정 파일:** `apps/field-web/src/proxy.ts`, `apps/field-web/test/tenant-proxy.test.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API/DB/migration/제품 간 계약·AP 코드 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 실제 Field API 404만 미공개 사이트로 해석한다. 나머지 조회 실패는 소유 확인을 통과시키지 않으면서 재시도 가능한 503으로 반환한다. 기존 조직 불일치 차단 경계는 그대로다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PostgreSQL 17·Field Valkey mock **37244**, Git 없음. 신규 Next proxy unit은 기존 Field 웹 11/12 exit 1 red(기대한 503, 실제 404), 수정 후 12/12 green. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. 새 mock에서 양제품 API/웹 build·ready, 작업실 HTTP 200, `pnpm test:spike:tenant-host:http` 실제 tenant 소유/차단 1/1 exit 0. 서버 간 Field API 장애 실제 HTTP 주입은 실행하지 않았다.
- **실패한 접근:** 기존 구현은 모든 공개 사이트 API 실패를 404로 취급해 일시 장애 때 없는 tenant처럼 보였다. 사용자 데이터 발송·청구·삭제 없음.
- **남은 작업:** C03 사용자 시각/흐름·200% 확대/스크린리더 전체 검수, Field DNS/TLS, AP/Field 실모델·알림·인증/결제와 A10/F10/D05 독립 운영/출시 증빙, 관리자 관리 조치/MFA/복구. 관련 Task는 `in_progress` 또는 `planned`, 공급사 의존은 `blocked_integration`.
- **다음 에이전트 정확한 명령:** 서버가 살아 있으면 중복 기동하지 않는다. 다음 기능 시작 전 파일 범위·요구/QA·명령을 실행 계획에 기록한다. 아래로 상태를 확인하고 새 기능/검수 범위를 진행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://localhost:3002/workspace
pnpm test:spike:tenant-host:http
pnpm lint
pnpm typecheck
pnpm test:unit
```

## 최신 인수인계 — C03/A05 AP 고객 상담 링크 조회 장애 복구 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`대로 AP/Field 기능을 완성해 사용 가능한 환경을 만든다. 사용자 화면 디자인·흐름 확인은 후속이다. 전체 mock 서버 세션 **70387** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321. 46개 Task implemented 1·in_progress 36·planned 9·verified 0으로 유지한다.
- **완료 작업:** AP 고객 상담 링크 첫 배포 조회 503·네트워크 오류를 404 비활성 링크와 구분하고 명시 재조회로 기존 상담을 연다. 앞 단계의 공개 사업 정보 503 재조회와 연속으로 실제 고객 흐름을 통과했다.
- **수정 파일:** `apps/agent-web/src/agent-deploy.tsx`, `tools/spikes/agent-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API/DB/migration/계약·Field 코드 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 정확한 404에만 중지/미승인 안내를 표시한다. 503·네트워크 실패에서는 같은 배포 GET을 재시도하며 고객 정보를 다른 저장소/제품으로 옮기지 않는다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PG17·Field Valkey mock, 합성 사업자/고객·320px Chromium, Git 없음. mock **68851**에서 배포 GET 503 주입 뒤 상태 오표시로 전체 브라우저 exit 1 red. 새 mock **70387** 첫 재검사는 재조회 뒤 공개 정보 GET보다 앞선 테스트 단언으로 exit 1; 응답 문구를 기다리도록 검사 순서를 고쳤다. 최종 `pnpm test:spike:agent-owner-flow:http` 1/1 green은 링크 503→재조회→공개 정보 503→재조회→사람 문의/외부 위젯·후속 전체 흐름을 포함한다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python `py_compile` exit 0, 양 API/웹 build·ready. DB/독립성/Distribution 전체 검사는 UI 전용 변경으로 다시 실행하지 않았다.
- **실패한 접근:** 첫 신규 브라우저 검사는 재조회 클릭 직후 후속 GET 실행 여부를 단언해 요청의 비동기 시점에 실패했다. 대기 대상을 후속 오류 상태로 변경했고 기대 동작은 유지했다. 실고객 발송·청구·삭제 없음.
- **남은 작업:** C03 사용자 시각/흐름·200% 확대/스크린리더 전체 검수, A05 실도메인/제3자 쿠키 강제 차단·실모델, 실알림/인증/결제/DNS·A10/F10/D05 독립 운영/출시 증빙, 관리자 관리 조치/MFA/복구. 관련 Task는 `in_progress` 또는 `planned`, 공급사 의존은 `blocked_integration`.
- **다음 에이전트 정확한 명령:** 서버가 살아 있으면 중복 기동하지 않는다. 다음 기능 시작 전 파일 범위·관련 요구/QA·검사 명령을 실행 계획에 기록한다. 고객 상담 링크/공개 정보의 404·503 구분과 재조회 경로를 유지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:agent-owner-flow:http
pnpm test:spike:field-owner-flow:http
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/A05/F05 고객 공개 정보 조회 장애 복구 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`대로 AP/Field 기능을 완성해 사용 가능한 환경을 만든다. 사용자 화면 디자인·흐름 확인은 후속이다. 전체 mock 서버 세션 **68851** 실행 중: AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace`, API 4311/4321. 46개 Task implemented 1·in_progress 36·planned 9·verified 0으로 유지한다.
- **완료 작업:** AP 상담/직접 문의 및 Field 고객 직접 문의의 첫 공개 정보 GET 503·네트워크 오류를 404 미공개 상태와 분리하고 화면 재조회를 추가했다. 재조회 성공 뒤 기존 고객 문의/예약이 이어진다. AP 승인 안내/AI 질문 제한 문구는 로딩·미공개·실패를 구분한다.
- **수정 파일:** `apps/agent-web/src/agent-public.tsx`, `apps/field-web/src/field-public.tsx`, `tools/spikes/agent-owner-flow-browser.py`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 제품 API/DB/migration/공개 계약·상대 제품 코드 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 공개 정보 확인 전 고객 문의 제출을 막는다. 정확한 404에만 ‘공개 정보 없음’을 표시하고 일시 장애에는 같은 GET을 명시 재시도한다. 고객 입력/계정·원본·권한을 브라우저 로컬 저장소로 옮기지 않는다.
- **실제 검사/환경/커밋:** 로컬 양제품 PostgreSQL 17·Field Valkey mock, 합성 사업자/고객·320px Chromium, Git 없음. 이전 mock **81531**에서 AP/Field 첫 공개 정보 GET 503 주입 시 일시 장애 문구/재조회 부재로 전체 브라우저 각각 exit 1 red. 새 mock **55374**에서 AP/Field 전체 경로 각 1/1 green. AP 장애 뒤 남은 ‘불러오는 중’ 문구는 추가 단언 exit 1 red였고 수정 후 최종 mock **68851**의 `pnpm test:spike:agent-owner-flow:http` 1/1 green. Field 변경 코드는 **55374**에서 1/1 green, 최종 서버에서 동일 코드 재빌드·ready. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `python3 -m py_compile tools/spikes/agent-owner-flow-browser.py tools/spikes/field-owner-flow-browser.py` exit 0; 두 API ready·웹 workspace HTTP 200. UI 전용 변경으로 DB/독립성/Distribution 전체 검사는 이 단계에서 다시 실행하지 않았다.
- **실패한 접근:** 첫 UI 변경 뒤 AP 승인 안내가 실패를 계속 로딩으로 설명했다. 추가 브라우저 단언으로 red를 확인한 뒤 네 가지 로드 상태를 분리했다. 고객 실발송·청구·삭제 없음.
- **남은 작업:** C03 사용자 시각/흐름·200% 확대/스크린리더 전체 검수, AP/Field 실모델·알림·인증/결제/DNS 공급사와 A10/F10/D05 독립 운영/출시 증빙, 관리자 관리 조치·MFA/복구. 관련 Task `in_progress` 또는 `planned`, 공급사 의존은 `blocked_integration`.
- **다음 에이전트 정확한 명령:** 서버가 살아 있으면 중복 기동하지 않는다. 다음 Task 시작 전 파일 범위·요구/QA·검사 명령을 실행 계획에 기록한다. 고객 공개 404/네트워크/503·재조회와 고객 흐름을 계속 유지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:agent-owner-flow:http
pnpm test:spike:field-owner-flow:http
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/A10/F10/D05 로컬 E2E 명령과 서버 상태 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference`를 기준으로 AP·Field를 기능까지 완성해 사용 가능한 환경을 만든다. 사용자 화면 디자인·흐름 확인은 후속이다. 전체 mock 서버 세션 **81531**이 AP `http://localhost:3001/workspace`·Field `http://localhost:3002/workspace`, API 4311/4321에서 실행 중이다. 46개 Task는 implemented 1·in_progress 36·planned 9·verified 0으로 유지한다.
- **완료 작업:** 세 표준 `test:e2e:*` 자리표시자를 실제 로컬 mock E2E runner로 교체했다. AP 사업자/매체/관리자, Field 사업자/자동 저장/관리자, 매체 카드→Field 확정·서명 사건·집계/CSV를 합성 계정/실 브라우저로 검수했다. 양제품 API와 웹 준비·제품 식별, 정확한 로컬 PG17 DB와 Field Valkey URL, 비 mock 프로필 차단을 선행한다. 자식 실패는 상위 non-zero다.
- **수정 파일:** `tools/run-e2e.mjs`, `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 제품 API/DB/migration/웹/공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 표준 E2E 통과는 실행 중인 로컬 mock 기능 검수라는 범위를 출력/문서에 명시한다. 외부 공급사, 독립 운영 배포, 정식 QA/G 통과 근거로 승격하지 않는다. 양제품을 모두 요구하는 것은 관리자 교차 세션·배포/매체 연결 경로를 검사하기 위해서이며, 반대 제품 부재 검수는 기존 `test:independence:*` 명령이다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PostgreSQL 17·Field Valkey·전체 mock **81531**·합성 계정/Chromium, Git 없음. 기존 `pnpm test:e2e:agent` exit 2. 최종 `pnpm test:e2e:agent` 3/3, `pnpm test:e2e:field` 3/3, `pnpm test:e2e:distribution` 2/2 exit 0. Distribution에는 실제 mock worker 사건 전달·예약 확정 5건·완료 주 구간 집계/CSV 320px 브라우저가 포함된다. `NODE_ENV=production node tools/run-e2e.mjs agent` 의도된 exit 1, `node --check tools/run-e2e.mjs`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. 이 단계에서 DB·독립성·실공급사 테스트는 다시 실행하지 않았다.
- **실패한 접근:** runner 첫 시도는 Field mock queue URL의 `valkey:` scheme을 받지 않아 exit 1이었다. `redis:`와 `valkey:`를 정확한 로컬 포트 검증 하에 허용해 고쳤다.
- **남은 작업:** A10/F10/D05 실공급사·독립 운영 배포/출시 증빙, A08/F09 관리자 조치·MFA·복구, C03 사용자 시각/흐름·스크린리더/200% 전체 QA, 실모델/알림/결제/DNS. 관련 Task는 `in_progress` 또는 `planned`, 공급사 의존은 `blocked_integration`이다.
- **다음 에이전트 정확한 명령:** 실행 중인 서버를 중복 기동하지 않는다. 다음 기능 Task 시작 전 실행 계획에 파일 범위·관련 요구/QA·명령을 기록한다. 주요 화면 후속 구현은 사용자 시각 확인을 기다리되, 기능 결함/상태 경계는 계속 개선한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://localhost:3002/workspace
pnpm test:e2e:agent
pnpm test:e2e:field
pnpm test:e2e:distribution
pnpm lint
pnpm typecheck
pnpm test:unit
```

## 최신 인수인계 — A08/F09/C03 양제품 관리자 6개 실제 화면 (2026-09-25)

- **현재 목표:** `reference`와 v3.0 문서대로 독립 AP/Field 기능을 완성해 로컬에서 사용할 수 있게 한다. 사용자 디자인·흐름 평가는 후속이다. 전체 mock 세션 **81531** 실행 중: AP `http://localhost:3001/workspace`·`http://localhost:3001/admin`, Field `http://127.0.0.1:3002/workspace`·`http://localhost:3002/admin`, API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** AP/Field 각 6개 관리자 URL을 실제 제품별 원장 집계와 연결했다. 조직/구성원, AP 승인 AI·검증 설치, Field 사이트 제작/실패, 발송 대기/미연결, 유효 체험/종료 요청, 최근 관리자 운영 조회를 분리했다. 실청구·DNS/지원 상세는 미연결 사유를 표시한다. 320px/390px 메뉴/키보드·권한·noindex·잘못된 경로 404를 검수했다.
- **수정 파일:** `apps/agent-api/src/admin.ts`, `apps/field-api/src/admin.ts`, 양제품 `test/admin.db.test.ts`, `apps/agent-web/src/agent-admin.tsx`·`agent-admin-sections.ts`·`app/admin/page.tsx`·`app/admin/[section]/page.tsx`, 같은 Field 웹 파일, 양제품 `tools/spikes/*-admin-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Schema/migration·제품 간 계약·상대 DB/세션/worker 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 기존 제품별 보호된 overview API에 실제 집계를 추가해 6화면에서 같은 권한/MFA 경계를 사용한다. 경로 정의·검증은 Next 서버/클라이언트가 공유하는 순수 모듈에 둔다. audit metadata는 관리자 actor ID·시각만 보여주며 고객 정보와 payload는 제외한다. 미연결 공급사/관리 조치는 실제 처리된 것으로 표시하지 않는다.
- **실제 검사/환경/커밋:** 로컬 양제품 PostgreSQL 17·Field Valkey mock, 합성 관리자/일반 계정·320/390px Chromium, Git 없음. 신규 DB 단언은 이전 API에서 AP 19/20·Field 17/18 exit 1 red. 최종 `pnpm test:db:agent` 20/20·`pnpm test:db:field` 18/18은 제품별 임시 DB에서 통과·삭제. 이전 웹은 AP `/admin/organizations`·Field `/admin/site-domains` HTTP 404 red. 첫 mock **46872**의 동적 경로는 client 함수의 서버 호출로 500이어서 순수 경로 모듈로 고쳤다. 새 mock **81531**의 `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:agent:http`와 `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:field:http` 각 1/1은 양제품 6경로·집계/감사·일반 계정 403·상대 세션 401·320px 가로 넘침/14px 미만 0·390px Enter·noindex·invalid 404. Field tenant 호스트 관리자 경로 404. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0, 양 API/웹 build·ready·새 경로 HTTP 200. `tools/check_package.py`는 `document_package_only` 통과이며 서비스 검사는 별도 명령으로 실행했다.
- **실패한 접근:** client 컴포넌트에서 export한 경로 검증 함수를 서버 페이지가 호출해 두 제품 동적 경로가 500을 냈다. 서버/클라이언트 공용 순수 모듈로 이동해 해결했다. 실제 고객 발송·청구·삭제 없음.
- **남은 작업:** 관리자 조직 상세/권한 변경·알림 unknown 복구/실발송·AI/도메인 장애 조치·실청구·신고/지원 접근 승인/사유/기간·MFA/전체 감사, C03 사용자 시각/흐름·스크린리더/200% 전체 검수, 정식 QA/G. A08/F09/C03은 `in_progress`; 공급사와 실인증은 `blocked_integration`.
- **다음 에이전트 정확한 명령:** 서버가 살아 있으면 중복 기동하지 않는다. 다음 Task 시작 전 실행 계획에 파일 범위·요구/QA·명령을 남긴다. 관리자 조치는 각 제품의 MFA·승인·사유/기간·감사 경계를 함께 구현한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/admin/organizations
curl -I http://localhost:3002/admin/site-domains
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:agent:http
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:field:http
pnpm test:db:agent
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A08/F09/C03 관리자 대기 사건 조회·열람 감사 (2026-09-25)

- **현재 목표:** `reference`와 v3.0 문서대로 AP/Field 기능을 완성해 로컬에서 사용할 수 있게 한다. 사용자 디자인·흐름 확인은 후속이다. 전체 mock 세션 **98932** 실행 중: AP `http://localhost:3001/workspace`·`http://localhost:3001/admin`, Field `http://127.0.0.1:3002/workspace`·`http://localhost:3002/admin`, API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** 양제품 관리자는 자기 제품 대기 outbox/고객 알림 미연결 최신 최대 20건의 ID·유형·시각·상태만 본다. 고객 비공개 payload/aggregate ID·원문/연락처를 반환하지 않는다. 성공한 운영 조회는 AP/Field 별도 감사 원장에 actor·resource·시각을 남긴다. 긴 사건 유형의 320px 줄바꿈을 고쳤다.
- **수정 파일:** `apps/agent-api/migrations/000051_admin_access_audit.sql`, `apps/field-api/migrations/000044_admin_access_audit.sql`, `apps/agent-api/src/admin.ts`, `apps/field-api/src/admin.ts`, 양제품 `test/admin.db.test.ts`, `apps/agent-web/src/agent-admin.tsx`, `apps/field-web/src/field-admin.tsx`, 양제품 `tools/spikes/*-admin-browser.py`·`*-admin-http.test.mjs`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 제품 간 계약/상대 DB·세션·worker 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 운영 목록은 outbox와 고객 알림 상태를 읽되 payload·aggregate ID·조직/고객 상세는 제외한다. 최근 20건만 반환하고 성공한 overview 조회만 감사한다. 일반 계정·비 mock은 기존 403/MFA 미연결 503으로 차단하며 감사에 성공 접근으로 남지 않는다. 재발송/재처리는 구현하지 않았다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PostgreSQL 17·Field Valkey mock, 합성 계정/사건·320px Chromium, Git 없음. 신규 DB 검사는 기존 `recentIncidents` 누락으로 AP 19/20·Field 17/18 exit 1 red; AP 첫 red는 테스트 정리 FK 오류가 원인을 가려 정리 순서를 바로잡고 다시 red를 확인했다. 최종 `pnpm test:db:agent` 20/20·`pnpm test:db:field` 18/18은 각 임시 DB에서 통과·삭제됐다. 새 mock **45681** AP 브라우저는 긴 사건 유형에서 320px 문서 폭 383px red. 새 전체 mock **98932**의 `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:agent:http`와 `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:field:http` 각 1/1은 합성 사건, 비공개 값 제외, 일반 계정/상대 제품 접근 차단, 관리자 조회 감사와 320px 넘침 없음을 확인했다. `pnpm lint`, 최종 `pnpm typecheck`, `pnpm test:unit`, Node `--check`·Python `py_compile` exit 0; 양 API/웹 build·ready.
- **실패한 접근:** AP 합성 조직 cleanup에서 사용자 FK가 먼저 삭제되어 테스트 의도보다 앞서 실패했으며 순서를 수정했다. UI는 실제 AP 대기 사건의 긴 `event_type`을 줄바꿈하지 못해 320px 넘침이 생겼고 사건 유형에 `overflowWrap`을 적용했다. 실제 고객 발송·청구·삭제 없음.
- **남은 작업:** AP/Field 관리자 관리 조치/지원 접근 승인·사유/기간·전체 감사, MFA 및 실 인증, 고객 알림 공급사/unknown 복구, C03 전체 사용자 시각/흐름·키보드/스크린리더/확대, 실결제/LLM/DNS·정식 QA/G. A08/F09/C03은 `in_progress`; 외부 공급사는 `blocked_integration`.
- **다음 에이전트 정확한 명령:** 서버가 살아 있으면 중복 기동하지 않는다. 다음 Task 전 실행 계획에 파일 범위·요구/QA·명령을 기록한다. 관리 조치를 진행하면 사유/승인/기간/감사와 제품별 MFA 경계를 먼저 설계한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/admin
curl -I http://localhost:3002/admin
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:agent:http
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:field:http
pnpm test:db:agent
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F09/C03 Field 관리자 첫 실제 경로와 양제품 관리자 세션 격리 (2026-09-25)

- **현재 목표:** `reference`와 v3.0 문서 기준으로 독립 AP/Field 기능을 완성해 로컬에서 사용할 수 있게 한다. 사용자 시각·흐름 검토는 후속이다. 전체 mock 세션 **27508** 실행 중: AP `http://localhost:3001/workspace`, `http://localhost:3001/admin`; Field `http://127.0.0.1:3002/workspace`, `http://localhost:3002/admin`; API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 전용 관리자 membership/migration, Field 운영 집계 API/화면, 명시적 로컬 mock 권한 grant/revoke 및 320px 브라우저 검사를 추가했다. 일반 Field 계정을 거부하고 제품별 관리자 세션으로 상대 제품 운영 API에 접근하면 401이다. 앞선 AP DB 검사 임시 DB 격리와 AP 관리자 경로도 현재 빌드에서 유지된다.
- **수정 파일:** `apps/field-api/migrations/000043_platform_admin.sql`, `apps/field-api/src/admin.ts`, `apps/field-api/src/app.ts`, `apps/field-api/test/admin.db.test.ts`, `apps/field-web/src/field-admin.tsx`, `apps/field-web/src/app/admin/page.tsx`, `tools/mock-field-admin.mjs`, `tools/spikes/field-admin-browser.py`, `tools/spikes/field-admin-http.test.mjs`, `tools/spikes/agent-admin-browser.py`, `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. AP 앱/DB/세션·제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** Field 관리자 membership은 Field 사업자 조직 권한과 별도이며 Field DB에만 있다. 조회는 운영 집계 건수만 반환하고 고객 PII/원문을 반환하지 않는다. MFA가 없는 비 mock 환경은 `blocked_integration` 503으로 닫는다. 로컬 권한 CLI는 정확한 Field mock PG17 DB만 허용한다. 두 제품 세션·DB·관리자 권한은 서로 사용하지 않는다.
- **실제 검사/환경/커밋:** 로컬 양제품 PostgreSQL 17·Field Valkey mock, 합성 계정과 320px Chromium, Git 없음. 신규 Field DB 검사는 기존 API 404로 17/18 red, 최종 `pnpm test:db:field` 18/18·임시 DB 삭제. 새 전체 mock **27508**에서 `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:field:http` 1/1, `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:agent:http` 1/1은 각 제품의 일반 계정 거부·operator 집계·PII 비노출·320px 넘침 없음·권한 철회와 상대 제품 401을 확인했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `node --check tools/mock-field-admin.mjs`, Python `py_compile` exit 0. `pnpm mock:run` 양 API/웹 build·ready, 두 `/admin` HTTP 200.
- **실패한 접근:** 기존 Field API는 운영 경로가 없어서 신규 검사가 404로 red였다. 과거 AP DB 검사는 지속 mock DB에서 실행됐으며 직전 단계에서 임시 DB로 수정했다. 실제 고객 발송·청구·삭제 없음.
- **남은 작업:** AP/Field 관리자 MFA·관리 조치/감사·운영 runbook/보존·복구, C03 전체 시각/키보드/스크린리더/확대 및 사용자 검토, 실 인증/모델/알림/결제/DNS 공급사·정식 QA/G. F09/C03 및 관련 제품 작업은 `in_progress`; 운영 연동은 `blocked_integration`.
- **다음 에이전트 정확한 명령:** 서버가 살아 있으면 중복 기동하지 않는다. 다음 작업 전 실행 계획에 파일 범위·요구/QA·검사 명령을 쓴다. 관리자 조치를 진행한다면 AP/Field 각각 승인 범위·감사·MFA 경계를 먼저 고정한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/admin
curl -I http://localhost:3002/admin
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:agent:http
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:field:http
pnpm test:db:agent
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C02/I07 AP DB 격리·A08/C03 AP 관리자 첫 실제 경로 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 문서에 맞춰 AP/Field 기능을 완성하고 로컬에서 사용 가능하게 한다. 사용자 화면·흐름 확인은 후속이다. 전체 mock 세션 **82350** 실행 중: AP `http://localhost:3001/workspace`와 `http://localhost:3001/admin`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321. `TASKS.md` 46개 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** AP 표준 DB 검사를 작업 중인 mock DB에서 임시 PG17 DB로 옮겼고 성공·실패 시 정리한다. AP 전용 관리자 membership/migration, 집계만 제공하는 API, `/admin` 화면, 명시적 로컬 mock grant/revoke 및 320px 브라우저 검사를 추가했다. 일반 AP 계정은 관리자 화면에 접근하지 못한다.
- **수정 파일:** `tools/run-db-suite.mjs`, `apps/agent-api/migrations/000050_platform_admin.sql`, `apps/agent-api/src/admin.ts`, `apps/agent-api/src/app.ts`, `apps/agent-api/test/admin.db.test.ts`, `apps/agent-web/src/agent-admin.tsx`, `apps/agent-web/src/app/admin/page.tsx`, `tools/mock-agent-admin.mjs`, `tools/spikes/agent-admin-browser.py`, `tools/spikes/agent-admin-http.test.mjs`, `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Field 앱/DB/세션·제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** AP 관리자 권한은 일반 사업자 조직 membership과 별도다. overview는 AP DB의 건수만 반환한다. 외부 MFA가 없는 비 mock 환경은 `blocked_integration` 503으로 닫는다. mock 권한 부여 CLI는 정확한 로컬 AP mock DB에서 기존 사용자에게만 적용한다. AP/Field DB 검사는 각자 별도 임시 DB에서 수행하고 `finally` 정리한다.
- **실제 검사/환경/커밋:** 로컬 양제품 PostgreSQL 17·Field Valkey mock, 합성 AP 계정과 320px Chromium, Git 없음. AP 관리자 DB 검사는 구현 전 404 red, 이후 최종 `pnpm test:db:agent` 20/20·임시 DB 삭제. Field `pnpm test:db:field` 17/17·임시 DB 삭제. 의도한 AP child exit 7 주입에서 runner exit 1·임시 DB 잔여 0. 기존 웹 `/admin` 404 red 후 새 전체 mock **82350**에서 최종 `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:agent:http` 1/1: 일반 계정 거부, operator 집계, 이메일 비노출, 320px 넘침 없음. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `node --check` exit 0. 양 API ready, AP `/admin`·Field `/workspace` HTTP 200.
- **실패한 접근:** 기존 AP DB runner는 지속 mock DB에서 검사했다. 이전 기록의 ‘격리 AP DB’ 표현은 이 수정 전 상태에는 정확하지 않다. 첫 관리자 브라우저 재검사는 동일 문구가 제목/본문에 있어 strict locator가 실패했고 제목 selector로 수정했다. 실제 고객 발송·청구·삭제 없음.
- **남은 작업:** Field 관리자 실제 라우트·독립 권한, AP/Field 관리자 MFA/조치/감사·운영 runbook·보존/삭제·복원, C03 전체 시각/키보드/스크린리더/확대 및 사용자 검토, 실 공급사/정식 QA/G. A08/C03/C02/I07은 `in_progress`; 운영 연동은 `blocked_integration`.
- **다음 에이전트 정확한 명령:** 먼저 서버가 살아 있는지 확인하고 살아 있으면 중복 기동하지 않는다. 다음 Task 전에 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA·검사 명령을 기록한다. Field 관리자를 진행한다면 Field 관리자 권한·MFA 차단 기준과 `/admin` 상태 범위를 먼저 정한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/admin
curl -I http://127.0.0.1:3002/workspace
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:admin:agent:http
pnpm test:db:agent
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — D01/C03 AP 매체 조직 생성 응답 분실·중복 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 AP/Field 독립 서비스 기능을 완성하고 사용할 수 있는 로컬 환경을 유지한다. 사용자 시각·흐름 검토는 후속이다. 전체 mock **40020** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** AP 매체 조직 생성에 사용자별 선택 UUID 제출 키를 적용했다. 같은 키/정규화 이름의 병렬·반복 POST는 201/200 같은 ID와 생성 outbox 한 건으로 수렴한다. 다른 이름 재사용은 409, 다른 사용자 키는 독립이다. 매체 화면은 POST 응답 분실에서 입력·키를 보존해 같은 버튼으로 재시도한다.
- **수정 파일:** `apps/agent-api/migrations/000049_publisher_creation_idempotency.sql`, `apps/agent-api/src/publishers.ts`, `apps/agent-api/test/publishers.db.test.ts`, `apps/agent-web/src/agent-publisher.tsx`, `tools/spikes/publisher-recovery-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Field 앱/DB·공개 제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 제출 키는 매체 owner별 DB 유일 제약으로 보관하고 기존 키가 있으면 이름을 비교한다. insert 충돌은 첫 트랜잭션 commit을 기다린 뒤 같은 행을 읽어 복구한다. ACK 분실은 실패 확정이 아니라 결과 미상으로 안내한다. 키는 브라우저 현재 입력에만 보관하고 매체 원장은 AP DB가 소유한다.
- **실제 검사/환경/커밋:** 로컬 AP PostgreSQL 17/Field Valkey mock, 합성 매체 계정·320px Chromium, Git 없음. 기존 API의 격리 `pnpm test:db:agent`는 invalid 키에도 201을 반환해 18/19 exit 1 red. 기존 mock **34901** 웹의 새 `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:publisher-recovery:http`는 조직 POST 201 commit 뒤 ACK 분실의 결과 미상 안내가 없어 exit 1 red. 새 전체 mock **40020** 최종 브라우저 1/1은 같은 입력 재시도→조직 한 건 및 앞선 가입/조회 장애·도메인/위치 경로를 통과했다. 격리 AP DB 19/19은 병렬·충돌/타 사용자/생성 사건 한 건, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python `py_compile` exit 0. `pnpm mock:run` 양 API/웹 build·ready, 두 `/workspace` HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/check_package.py`는 `document_package_only` 통과이며 서비스 검사는 별도 명령으로 실행했다.
- **실패한 접근:** 기존 API는 전달된 제출 키를 무시했고 병렬 요청은 조직을 두 개 만들 수 있었다. 기존 웹은 응답 분실 뒤 같은 키를 유지하지 않았다. 실제 매체 DNS 변경·고객 발송·결제·삭제 없음.
- **남은 작업:** C03의 사용자 시각/흐름·전체 키보드/스크린리더/확대·실제 AP/Field 관리자 운영실, D01 실 DNS·매체 관리/QA92/119/G-D1. 인증·LLM·알림·결제·DNS 공급사/운영 자격은 `blocked_integration`; D01/C03 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **40020**이 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA·검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:publisher-recovery:http
pnpm test:db:agent
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/D01 AP 매체 관리 조회 장애·생성 ACK 분리 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 AP/Field 독립 서비스 기능을 완성하고 사용할 수 있는 로컬 환경을 유지한다. 사용자 시각·흐름 검토는 후속이다. 전체 mock **34901** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** AP 매체 첫 목록/선택 매체 세부 목록 조회 실패를 인증 401과 구별하고 명시 재조회한다. 조직·도메인·광고 위치·배치 결정 POST ACK 뒤 목록 조회 장애는 저장 성공과 조회 실패로 나누어 안내한다. 320px 신규 매체 계정에서 조직 한 건, 등록 도메인/광고 위치를 확인했다.
- **수정 파일:** `apps/agent-web/src/agent-publisher.tsx`, `tools/spikes/publisher-recovery-browser.py`, `tools/spikes/publisher-recovery-http.test.mjs`, `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. AP API/DB/migration·Field 앱/공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** POST 201/200 응답은 이미 서버 처리의 증거이므로 후속 GET 실패가 이를 취소하지 않는다. 여러 세부 목록은 전부 성공한 뒤 화면에 반영하며, 장애 때 기존 화면을 조작 가능 상태로 남기지 않고 재조회한다. 401일 때만 로그인 화면으로 보낸다.
- **실제 검사/환경/커밋:** 로컬 AP PostgreSQL 17/Field Valkey mock, 합성 매체 계정·320px Chromium, Git 없음. 기존 mock **33647**에서 새 `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:publisher-recovery:http`는 첫 목록 503 뒤 오류/재조회 화면이 없어 exit 1 red. 새 전체 mock **34901**의 최종 같은 명령 1/1은 목록 503→재시도/401, 조직 생성 POST 201→목록 503→재조회·원본 한 건, 세부 목록 503→재조회, HTTPS origin 도메인/광고 위치 등록과 가로 넘침 없음. 격리 `pnpm test:db:agent` 18/18, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python `py_compile`, Node `--check` exit 0. `pnpm mock:run` 양 API/웹 build·ready, 두 `/workspace` HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/check_package.py`는 `document_package_only` 통과이며 서비스 검사는 별도 명령으로 실행했다.
- **실패한 접근:** 기존 초기 GET 503은 `loading`에 머물거나 네트워크 예외를 로그인 화면으로 보냈다. 조직 POST 201 뒤 GET 실패는 생성 요청 응답 실패로 안내할 수 있었다. 실제 매체 DNS 변경·고객 메시지 발송·결제·삭제 없음.
- **남은 작업:** C03 전체 고객/사업자/매체/관리자 320/390px·키보드/스크린리더/200% 확대 및 사용자 디자인/흐름 검토, D01 실 DNS·매체 운영/관리자·QA92/119/G-D1. 인증·LLM·알림·결제·DNS 자격은 `blocked_integration`; C03/D01 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **34901**이 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA·검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:publisher-recovery:http
pnpm test:db:agent
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/F02 Field 섹션 키보드 편집·공개 순서 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 AP/Field 독립 서비스 기능을 완성하고 사용할 수 있는 로컬 환경을 유지한다. 사용자 시각·흐름 검토는 후속이다. 전체 mock **33647** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 사이트 편집의 섹션별 그룹과 위로·아래로·삭제 버튼에 대상 번호를 붙였다. 320px에서 키보드 Enter로 순서 변경·삭제하고 Field 서버 초안, 승인 공개본, 고객 화면의 같은 순서를 확인했다. 기존 사업자→직접 문의·두 예약 흐름도 유지했다.
- **수정 파일:** `apps/field-web/src/site-editor.tsx`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Field API/DB/migration·AP 앱/공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 섹션은 기존 Field 초안의 ID·순서를 그대로 사용하고, 키보드 조작 대상만 화면·접근성 이름으로 구별한다. 순서 변경은 서버 자동 저장/명시 저장 뒤에만 공개할 수 있다. Field 사업장 tenant·문의 CTA는 기존 공개 경로를 유지한다.
- **실제 검사/환경/커밋:** 로컬 Field PostgreSQL 17/Valkey mock, 합성 사업자·고객과 320px Chromium, Git 없음. 기존 빌드는 `2번 섹션 위로 이동` 접근성 이름이 없어 `FIELD_OWNER_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http` exit 1 red. 새 전체 mock **33647**의 최종 같은 명령 1/1은 두 섹션 순서 변경·임시 섹션 삭제·서버 초안/공개본/실제 고객 화면 순서와 문의/예약 경로를 포함한다. 격리 `pnpm test:db:field` 17/17, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python `py_compile` exit 0. `pnpm mock:run` 양 API/웹 build·ready, 두 `/workspace` HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/check_package.py`는 `document_package_only` 통과이며 서비스 검사는 별도 명령으로 실행했다.
- **실패한 접근:** 기존 버튼의 접근성 이름은 모든 섹션에 `위로`·`아래로`·`섹션 삭제`로 반복돼 대상이 구별되지 않았다. 새 검사는 첫 대상 버튼을 찾지 못해 red였다. 실제 고객 발송·결제·삭제 없음.
- **남은 작업:** C03 전체 화면의 키보드·스크린리더·200% 확대 및 사용자 디자인/흐름 검토, F02 HEIC/실객체 저장소·실도메인과 QA57~59/119/G-F1. 인증·LLM·알림·결제·DNS 공급사/운영 자격은 `blocked_integration`; C03/F02 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **33647**이 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA·검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
FIELD_OWNER_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A02/C03 AP 고객 후속 대화·사진 저장 뒤 조회 단절 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 AP/Field 독립 서비스 기능을 완성하고 사용할 수 있는 로컬 환경을 유지한다. 사용자 디자인/흐름 확인은 후속이다. 전체 mock **53435** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** AP 비회원 고객의 추가 질문 POST 201/200 ACK 및 후속 사진 업로드 201/200 ACK 뒤 각각 원본 대화 GET이 끊겨도 저장 성공을 유지한다. 같은 AP 확인키의 ‘문의 내용 다시 확인’으로 서버 원본 메시지·비공개 사진을 읽는다. POST 응답 자체가 끊긴 질문/사진은 기존 제출 키 또는 파일 hash 재시도 경로를 유지한다.
- **수정 파일:** `apps/agent-web/src/agent-public.tsx`, `tools/spikes/agent-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. AP API/DB/migration·Field 앱/DB·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** AP 원본 대화의 POST ACK와 보조 GET 결과를 분리한다. ACK 전에는 제출 키/사진을 보관해 재시도할 수 있게 하고, ACK 뒤에는 새 POST를 만들지 않고 AP 확인키로 GET을 재시도한다. Field 원본이나 세션을 사용하지 않는다.
- **실제 검사/환경/커밋:** 로컬 AP PostgreSQL 17·Field Valkey mock, 합성 AP owner·비회원과 320px Chromium, Git 없음. 기존 웹은 질문 POST 201 ACK→문의 GET 단절에서 저장 성공/재조회 버튼이 없어 `AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:agent-owner-flow:http` exit 1 red. AP 웹 수정 후 전체 브라우저 1/1. 이어 실제 PNG 업로드 201 ACK→GET 단절도 기존 웹에서 사진 저장 성공/재조회가 없어 같은 명령 exit 1 red. 최종 새 전체 mock **53435**에서 같은 명령 1/1은 두 단절 경로의 원본 메시지·비공개 이미지/첨부 각 한 건, 일반 외부 소유 위젯·상담 링크 전체를 포함한다. 격리 `pnpm test:db:agent` 18/18, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python `py_compile` exit 0. `pnpm mock:run`에서 양 API/웹 build·ready, 두 `/workspace` HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/check_package.py`는 `document_package_only` 통과이며 서비스 검사는 별도 명령으로 실행했다.
- **실패한 접근:** AP 고객 화면도 POST 성공 뒤 대화 GET 예외를 ‘응답을 받지 못했습니다’ 또는 ‘사진 응답을 받지 못했습니다’로 합쳐 표시했다. 이미 질문 제출 키/사진 파일은 지운 상태여서 그 재시도 안내가 맞지 않았다. 실제 고객 발송·결제·삭제 없음.
- **남은 작업:** A02/A03/F05/F06 정식 QA20/41/143·실알림/운영 복구, C03 화면/접근성 검토와 전체 제품 작업/출시 게이트. 인증·LLM·알림·결제·DNS 자격은 `blocked_integration`; A02/A03/C03 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **53435**가 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA·검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
AP_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:agent-owner-flow:http
FIELD_OWNER_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:agent
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F05/C03 Field 후속 사진 저장 뒤 조회 단절 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 독립 AP/Field 기능을 완성하고 사용할 수 있는 로컬 환경을 유지한다. 사용자 디자인/흐름 검토는 후속이다. 전체 mock **97844** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 고객 후속 질문의 비공개 사진 업로드가 201/200 ACK된 뒤 대화 GET이 끊겨도 업로드 성공을 유지한다. 같은 확인키의 ‘문의 내용 다시 확인’으로 원본 메시지·사진을 읽는다. 업로드 응답 자체를 잃으면 원래 파일/메시지 ID를 보관해 hash 기반 재시도가 가능하다.
- **수정 파일:** `apps/field-web/src/field-public.tsx`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Field API/DB/migration·AP 앱/DB·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 사진 POST ACK와 뒤따르는 대화 GET을 다른 결과로 표시한다. POST ACK 전에만 파일을 보존해 재업로드가 필요할 수 있음을 알리고, ACK 뒤에는 사진 저장을 확정한 채 목록만 재조회한다. 비공개 사진은 원본 확인키로만 읽는다.
- **실제 검사/환경/커밋:** 로컬 Field PostgreSQL 17/Valkey mock, 합성 owner·고객과 320px Chromium, Git 없음. 기존 웹은 실제 PNG 첨부 201 ACK 뒤 대화 GET 네트워크 단절에서 사진 저장 성공/명시 재조회가 없어 `FIELD_OWNER_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http` exit 1 red. 새 전체 mock **97844**의 최종 같은 명령 1/1은 201 ACK→GET 단절→재조회·실제 비공개 이미지/첨부 한 건, 앞선 후속 질문 저장·예약/조건 재동의·사이트/운영 파일까지 통과했다. 격리 `pnpm test:db:field` 17/17, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python `py_compile` exit 0. `pnpm mock:run`에서 양 API/웹 build·ready, 두 `/workspace` HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/check_package.py`는 `document_package_only` 통과이며 서비스 검사는 별도 명령으로 실행했다.
- **실패한 접근:** 기존 `attachPhoto`의 큰 try/catch는 업로드 ACK 뒤 GET 단절을 ‘사진 응답을 받지 못했습니다’로 표시했고 이미 파일을 지운 상태라 재첨부 안내도 맞지 않았다. 실제 외부 고객 발송·결제·삭제 없음.
- **남은 작업:** F05/F06 정식 QA20/41/143·실알림/운영 복구와 C03 화면 흐름/접근성 검토, 다른 제품 작업/출시 게이트. 인증·LLM·알림·결제·DNS 자격은 `blocked_integration`; F05/C03 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **97844**가 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA·검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
FIELD_OWNER_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F05/F06/C03 Field 후속 질문 저장 뒤 조회 단절 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 독립 AP/Field 기능을 완성하고 사용할 수 있는 로컬 환경을 유지한다. 사용자 디자인/흐름 검토는 후속이다. 전체 mock **26784** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 비회원 고객의 추가 질문 POST가 201/200으로 저장됐으면 이어지는 대화 GET 네트워크 단절을 POST 실패로 오인하지 않는다. 저장 성공 안내와 확인키 기반 ‘문의 내용 다시 확인’ 버튼을 제공하고 서버 원본 메시지를 다시 읽는다.
- **수정 파일:** `apps/field-web/src/field-public.tsx`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Field API/DB/migration·AP 앱/DB·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 질문 POST ACK와 보조 GET의 결과를 분리한다. 제출 키는 서버 ACK 뒤에만 해제하고, 조회 장애는 새 POST를 만들지 않고 같은 확인키의 GET으로 복구한다. 선택 사진은 질문 저장과 별도 업로드 상태다.
- **실제 검사/환경/커밋:** 로컬 Field PostgreSQL 17/Valkey mock, 합성 owner·고객 및 320px Chromium, Git 없음. 기존 웹은 질문 POST 201 뒤 문의 GET 단절에서 기대 저장 성공·재조회 버튼이 없어 `FIELD_OWNER_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http` exit 1 red. 새 전체 mock **26784**의 최종 같은 명령 1/1은 POST ACK→GET 단절→명시 재조회·고객 메시지 한 건 및 기존 사이트/문의·두 예약/조건 재동의/운영 파일을 포함한다. 격리 `pnpm test:db:field` 17/17, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python `py_compile` exit 0. `pnpm mock:run`에서 양 API/웹 build·ready.
- **실패한 접근:** 기존 화면의 큰 try/catch는 POST 성공 뒤 GET 예외까지 ‘응답을 받지 못했습니다’로 처리했고, 이미 본문/제출 키를 지운 상태라 사용자가 같은 메시지의 복구 경로를 알 수 없었다. 실제 고객 메시지 발송·결제·삭제 없음.
- **남은 작업:** Field 후속 사진 업로드 201 뒤 보조 GET 단절의 성공/조회 오류 분리, F05/F06 QA17~20/41/143과 실알림/운영 복구·정식 G-F2, 다른 제품 작업/출시 게이트. 인증·LLM·알림·결제·DNS 자격은 `blocked_integration`; F05/F06/C03 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **26784**가 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA·검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
FIELD_OWNER_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F07/C03 Field 변경 조건 재확인 결과 미상 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 AP/Field 독립 서비스 기능을 완성하고 사용할 수 있는 로컬 환경을 유지한다. 사용자 디자인/흐름 검토는 후속이다. 전체 mock **16996** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 고객이 새 카탈로그 가격/서비스/시간에 동의하는 `review-catalog` POST 응답을 잃으면 결과 미상으로 보류하고, 확인키로 원본 예약 사건을 재조회한다. 사건 revision+1·고객 actor·유형·카탈로그 revision·서비스 ID와 현재 요청 시간을 대조한다. 첫 GET 장애 동안 추가 예약 요청을 닫고 명시 재조회한다. POST ACK 후 예약 GET만 실패한 경우에는 저장 성공과 조회 오류를 구분한다.
- **수정 파일:** `apps/field-web/src/field-booking.tsx`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Field API/DB/migration·AP 앱/DB·제품 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** `catalog_reviewed` 사건은 가격 동의 시각과 선택 서비스는 담지만 고객 요청 시간은 담지 않는다. 따라서 같은 revision의 현재 서버 예약이 선택 서비스/시간과 일치할 때만 이 시도의 반영을 확정한다. 그 사이 추가 변경이 있으면 다른 변경으로 안내한다. 조회 실패 중에는 입력과 재확인 조작을 보류하고, 같은 revision으로 확인되면 기존 입력을 유지한다. 실제 알림 발송 성공으로 표시하지 않는다.
- **실제 검사/환경/커밋:** 로컬 Field PostgreSQL 17/Valkey mock, 합성 사업자·고객과 320px Chromium, Git 없음. 첫 두 브라우저 실패는 조건 재확인 textarea의 정확한 접근성 이름 선택자 문제였고 form 내부 textarea로 검사 범위를 고쳤다. 기존 웹의 재확인 POST commit/ACK 분실→첫 예약 GET 503은 결과 확인 경로가 없어 `FIELD_OWNER_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http` exit 1 red. 새 전체 mock **16996**의 최종 같은 명령 1/1은 가격 변경 승인→고객 재동의 ACK 분실→첫 GET 503→재조회/사건 한 건과 기존 전체 사이트/문의/두 예약·owner/고객 처리 복구·운영 파일을 확인한다. `pnpm test:db:field` 17/17(격리 DB), `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python `py_compile` exit 0. `pnpm mock:run`이 양 API/웹 build exit 0 후 ready, 두 `/workspace` HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/check_package.py`는 `document_package_only` 통과이며 서비스 검사는 별도 명령으로 실행했다.
- **실패한 접근:** 기존 고객 화면은 POST ACK 분실을 ‘조건 재확인 요청을 전달하지 못했습니다’로 단정하고, POST 성공 뒤 보조 GET 예외도 같은 문구로 처리했다. 실제 공급사 발송·청구·삭제 없음.
- **남은 작업:** F07 실제 알림 공급사·남용/비용 상한/운영 복구·정식 QA25~34/G-F2, C03 사용자 디자인/흐름 검토와 전체 접근성, 다른 제품 작업/출시 게이트. 실인증/LLM/알림/결제/DNS 자격은 `blocked_integration`; F07/C03 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **16996**이 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA/검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
FIELD_OWNER_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F07/C03 Field 고객 예약 요청 결과 미상 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 독립 AP/Field 기능을 완성하고 사용할 수 있는 로컬 환경을 만든다. 사용자 화면 디자인/흐름 확인은 후속이다. 전체 mock **19020** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 고객의 제안 시간 수락·시간 변경·취소 요청 POST 응답 분실을 결과 미상으로 처리한다. 확인키로 서버 원본 예약 사건의 시작 revision+1, 고객 actor, 유형, 입력 시간/사유를 재조회해 반영/미반영/다른 변경을 구분한다. 예약 GET 장애 중에는 후속 조작을 숨기고 명시 재조회한다. POST ACK 뒤 보조 조회만 실패하면 저장 성공과 조회 오류를 분리한다.
- **수정 파일:** `apps/field-web/src/field-booking.tsx`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Field API/DB/migration·AP 앱·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 상태 이름만으로 요청 반영을 단정하지 않고 불변 예약 사건의 revision·actor·유형·입력을 대조한다. 조회 실패는 중복 POST를 자동 실행하지 않으며 버튼을 닫는다. 서버 revision이 그대로면 고객이 내용을 확인한 뒤 다시 요청할 수 있다. 예약 처리와 외부 알림 발송은 별도 상태다.
- **실제 검사/환경/커밋:** 로컬 Field PostgreSQL 17/Valkey mock, 합성 사업자·고객, 320px Chromium, Git 없음. 기존 웹의 제안 수락 POST commit/ACK 분실→예약 GET 503에서 결과 미상/재조회 UI가 없어 `FIELD_OWNER_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http` exit 1 red. 새 전체 mock **19020**의 최종 같은 명령 1/1은 고객의 제안 수락·시간 변경·취소 각각 ACK 분실→첫 GET 503→수동 재조회·사건 한 건과 기존 사업자 네 처리 경로·사이트/문의/두 예약/운영 파일을 확인한다. `pnpm test:db:field` 17/17(격리 DB), `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python `py_compile` exit 0. `pnpm mock:run`이 양 API/웹 build exit 0 후 두 API ready·두 웹 `/workspace` HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/check_package.py`는 `document_package_only` 통과이며 서비스 검사는 별도 명령으로 실행했다.
- **실패한 접근:** 기존 고객 화면은 ACK 분실을 ‘요청을 전달하지 못했습니다’로 오인하고 보조 GET 예외까지 POST 실패로 처리했다. 테스트에서 첫 GET 503 후 결과 확인 경로가 없어 red였고, 사건 재조회로 수정했다. 실제 고객 메시지·결제·삭제 없음.
- **남은 작업:** Field 서비스 조건 재확인 POST의 동일한 응답 분실 복구, F07 실제 알림/남용·비용 상한/운영 복구와 QA25~34/G-F2, C03 사용자 디자인/흐름 검토·인증 뒤 접근성 전체. 실인증/LLM/알림/결제/DNS 자격은 `blocked_integration`; F07/C03 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **19020**이 살아 있으면 중복 기동하지 않는다. 다음 Task 시작 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA·검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
FIELD_OWNER_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F07/C03 Field 예약 처리 결과 미상 재조회 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 독립 AP/Field 기능을 완성하고 사용할 수 있는 로컬 환경을 만든다. 사용자 화면 디자인/흐름 승인은 후속이다. 전체 mock **82869** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field owner의 예약 확정·시간 제안·취소·결정 POST 응답 분실을 결과 미상으로 다룬다. 예약 원본 사건의 시작 revision+1, 유형, 사업자 actor, 입력된 시간/사유를 재조회해 처리 반영/미반영/다른 변경을 구분한다. 예약 GET 장애 중에는 처리 버튼을 닫고 명시 재조회한다. POST ACK 이후 목록 조회 오류는 별도 안내한다.
- **수정 파일:** `apps/field-web/src/field-booking.tsx`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Field API/DB/migration·AP 앱·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** UI가 네트워크 예외만으로 처리 미수행을 단정하지 않는다. 확정 결과를 표시할 때 현재 상태만 비교하지 않고 불변 예약 사건의 revision/유형/입력을 대조한다. 조회 실패 동안 같은 예약의 상태 조작을 닫으며, 원장 revision이 그대로면 같은 입력으로 다시 요청할 수 있다. 외부 고객 알림은 예약 처리와 별도로 확인한다.
- **실제 검사/환경/커밋:** 로컬 Field PostgreSQL 17/Valkey mock, 합성 사업자·비회원과 320px Chromium, Git 없음. 기존 웹은 확정 POST commit 뒤 ACK 분실·예약 GET 503에서 기대 복구 UI가 없어 `pnpm test:spike:field-owner-flow:http` exit 1 red. 최종 같은 320px 전체 사업자/고객 브라우저 1/1: 확정·제안·취소·거절 각각 ACK 분실→첫 예약 GET 503→수동 재조회→원본 사건 한 건 확인. `pnpm test:db:field` 17/17(격리 DB), `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. 새 `pnpm mock:run` **82869**에서 양 API/웹 build exit 0.
- **실패한 접근:** 기존 화면은 응답 분실을 ‘요청 미전달’로 표시했다. 첫 수정 후 typecheck는 상태 변수를 고객 컴포넌트에 둔 실수로 exit 2였고 owner로 이동해 통과했다. 첫 취소 확장 브라우저는 선택한 예약의 비동기 로드 전에 사유를 입력해 버튼이 다시 비활성화됐고, 예약 제목을 기다린 뒤 전체 1/1 통과. 실제 고객 발송·청구·삭제 없음.
- **남은 작업:** F07 실알림·남용/비용 상한·운영 복구와 정식 QA25~34/G-F2, C03 사용자 디자인/흐름 검토·인증 뒤 200%/키보드 전체/스크린리더. 실인증/LLM/알림/결제/DNS 자격은 `blocked_integration`; F07/C03 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **82869**가 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA/검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:web:field
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F07/C03 Field 전화 예약 중복·응답 분실 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 독립 AP/Field 기능을 완성하고 사용할 수 있는 로컬 환경을 만든다. 사용자 화면 디자인/흐름 승인은 후속이다. 전체 mock **79052** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field owner 전화 예약 수동 등록에 필수 제출 키와 정규화 본문 hash를 저장한다. 병렬/반복 같은 요청은 원래 예약 ID를 돌려주고 예약·점유·사건/outbox를 중복 만들지 않는다. 웹은 POST 응답 분실을 결과 미상으로 안내하고 같은 입력·키를 재사용해 복구한다.
- **수정 파일:** `apps/field-api/src/bookings.ts`, `apps/field-api/test/{bookings,subscription}.db.test.ts`, `apps/field-web/src/field-booking.tsx`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. 기존 DB 유일 열을 사용해 migration 없음. AP 앱/DB·공개 제품 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** Field 조직 owner 인증 뒤 조직+제출 키로 짧은 PG transaction lock을 잡고 기존 예약을 확인한 다음 최신 서비스/시간/체험을 검사한다. 기존 키는 만료나 시간표 변경 뒤에도 조회된다. 같은 키/다른 본문은 409, 키 누락 400. UI는 확정된 200/201에만 입력을 지우고 재조회 실패를 POST 결과 미상과 구별한다.
- **실제 검사/환경/커밋:** 로컬 독립 Field PostgreSQL 17 임시 DB·전체 mock Valkey, 합성 owner/예약과 320px Chromium, Git 없음. DB 신규 단언은 기존 코드의 동일 키 병렬 201/409로 exit 1 red. 기존 웹의 POST commit 후 ACK 분실은 결과 미상 문구 부재로 exit 1 red. 최종 `pnpm test:db:field` 17/17(동일 ID/점유·사건·outbox 각 1, 무인증/타조직/본문 충돌, 만료 뒤 기존 200·새 403); `pnpm test:spike:field-owner-flow:http` 1/1(신규 사업자 전체 기능·전화 예약 실제 복구). `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. 새 `pnpm mock:run` **79052**에서 양 API/웹 build exit 0.
- **실패한 접근:** 기존 전화 예약은 제출 키를 저장하지 않아 commit 뒤 ACK 분실 재시도가 점유 충돌 409였다. 첫 수정 뒤 만료 DB 검사는 새 필수 키 없이 400이 되어 fixture를 업데이트했다. 첫 green 브라우저는 목록 JSON의 `name` 필드를 `customerName`으로 읽는 검사 오기로 실패해 수정 후 1/1 통과했다. 실제 고객 발송·청구/삭제 없음.
- **남은 작업:** F07 전화번호 회전 남용·조직 비용 상한, 실제 알림/복구·정식 QA25~34/G-F2. C03 사용자 화면 디자인/흐름 검토 및 인증 뒤 200%·키보드 전체/스크린리더. 실인증/LLM/알림/결제/DNS는 `blocked_integration`; 제품 작업은 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **79052**가 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA/검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:db:field
pnpm test:spike:field-owner-flow:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I04/C03 AP 고객 Field 전달 기록 장애 중 새 업무 차단 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 독립 AP/Field 기능을 완성하고 사용할 수 있는 로컬 환경을 만든다. 사용자 화면 디자인/흐름 승인은 후속이다. 전체 mock **49780** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321 ready. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** AP 고객의 Field 외부 요청 화면에서 필수 서비스/ActionRequest 기록/문의 첨부 조회 중 하나라도 실패하면 새 요청 양식을 숨긴다. 같은 화면 재조회 성공 뒤에만 조건 확인과 동의·제출을 다시 연다.
- **수정 파일:** `apps/agent-web/src/agent-field-action.tsx`, `tools/spikes/field-action-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API/domain/DB/migration·공개 제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 기록 조회 실패를 기록 없음으로 취급해 새 Field 요청을 허용하지 않는다. 필수 조회 오류 중에는 기존 기록 재조회 버튼과 오류를 유지하면서 새 요청 양식만 닫는다. 재조회 성공 뒤 현재 Field 조건/별도 고객 동의가 필요하다.
- **실제 검사/환경/커밋:** 로컬 양 PostgreSQL 17·Field Valkey mock, 합성 연결/예약/고객과 320px Chromium, Git 없음. 기존 빌드에서 서비스 GET 503 뒤 재시도 중 기록 GET 503을 주입하니 새 조건 버튼이 나타나 `pnpm test:spike:ap-field:http` exit 1 red. 수정 뒤 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. `pnpm mock:run` 새 세션 **49780**에서 양 API ready·두 `/workspace` HTTP 200.
- **실패한 접근:** 기존 양식은 `connections.length`만 검사해 ActionRequest 기록 GET 503이어도 새 제출을 열었다. 회귀 검사의 red 뒤 조회 오류를 함께 검사했다. 실제 고객 메시지/청구/삭제 없음.
- **남은 작업:** I04 실모델 응답 중 화면 인계·route 전환/AP 처리 결과 조회·실 객체 저장소/악성코드 검사·revoke/장기 장애/정식 QA139~145/G-I1~I2. C03 사용자 시각/흐름 검토와 인증 뒤 200%·키보드 전체/스크린리더. 실제 인증/LLM/알림/결제/DNS 자격은 `blocked_integration`; I04/C03 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **49780**가 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA/검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:web:agent
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A07/F09/C03 양제품 체험 상태·결과 미상 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 AP/Field 독립 서비스를 기능부터 완성하고 사용할 수 있는 로컬 환경을 만든다. 사용자 화면 디자인/흐름 승인은 후속이다. 전체 mock **5390** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321 ready. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** 두 제품 체험/구독 화면의 GET 실패가 이전 상태를 남겨 조작할 수 있던 문제를 고쳤다. 체험 시작/종료 POST의 응답 분실은 결과 미상으로 표시하고, 서버 재조회 전까지 이전 체험 카드를 숨긴다. 명시 HTTP 거절과 응답 분실을 구분한다. 상태 새로고침은 키보드 Enter로 복구된다.
- **수정 파일:** `apps/agent-web/src/agent-subscription.tsx`, `apps/field-web/src/field-subscription.tsx`, `tools/spikes/{subscription-browser.py,subscription-http.test.mjs}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API/domain/DB/migration·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 구독 GET/POST 오류 뒤 오래된 `data`로 조작하지 않는다. 서버가 확정 거절한 응답은 상태 코드를, 응답을 못 받은 요청은 결과 미상을 표시한다. 사용자가 동일 제품 세션으로 GET 재조회해야 서버 상태에 맞는 버튼을 다시 보여준다. AP/Field trial은 독립 원장을 유지하고 결제 성공을 모의하지 않는다.
- **실제 검사/환경/커밋:** 로컬 두 PG17·Field Valkey mock, 합성 AP/Field owner 및 320px Chromium, Git 없음. GET 503 뒤 카드 잔존은 exit 1 red; 시작 POST commit 뒤 응답 분실의 결과 미상 안내 누락도 exit 1 red였다. 최종 `FIELD_SUBSCRIPTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:subscription:http` 1/1은 두 제품 GET 503/시작·종료 POST 응답 분실→키보드 Enter 재조회, 체험 종료 후 기존 업무 접근을 포함한다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:web:agent`, `pnpm build:web:field` exit 0. 새 mock **5390**에서 양 API ready·두 구독 웹 HTTP 200. 별도 640px/CSS 200% 비로그인 주요 8경로는 가로 넘침/14px 미만/JS 오류 0이며 인증 뒤 전체 경로 검수는 아니다.
- **실패한 접근:** 처음의 Playwright `networkidle` 시간 초과는 AP 구독 HTTP 200/GET 401 정상 응답·렌더링, 이후 `domcontentloaded` 검사로 페이지 문제가 아님을 확인했다. 실제 구독 UI 오류는 기존 데이터 잔존·POST 결과 단정이었다. 운영 결제/메시지 발송/데이터 삭제 없음.
- **남은 작업:** A07/F09 실청구·가격 동의·갱신/환불/정리 모드/보존, C03 인증 뒤 200%·키보드 전체/스크린리더·사용자 디자인 확인, 정식 QA42~46/57/58/119/G. 실제 인증/LLM/알림/결제/DNS 자격은 `blocked_integration`. 제품 작업과 C03은 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **5390**가 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA/명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
FIELD_SUBSCRIPTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:subscription:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:web:agent
pnpm build:web:field
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A08/C03 AP 계정·체험·사업 설정 기록 파일 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 AP/Field 독립 서비스를 기능부터 완성하고 로컬에서 사용할 수 있게 한다. 사용자 화면/흐름 검토는 후속이다. 전체 mock **98525** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321 ready. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** AP owner의 기존 직접 문의·사진 파일에 owner 계정/구성원, 자체 체험 시작·종료 예약, 지식·AI 초안/승인본, 상담 링크/소유 위젯 배포 메타데이터를 추가했다. AP 구독 화면에 범위를 표시하고 320px 신규 사업자의 실제 다운로드 파일에서 확인했다.
- **수정 파일:** `apps/agent-api/src/inquiry-archive.ts`, `apps/agent-api/test/inquiry-attachments.db.test.ts`, `apps/agent-web/src/agent-subscription.tsx`, `tools/spikes/agent-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Field 앱/DB·AP migration·제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 기존 인증된 `/v1/owner/organizations/:id/inquiries/export` 경로/파일 이름은 유지하고 JSON에 사업 설정을 추가했다. 같은 AP 조직 repeatable-read 스냅샷에서 명시 허용 열만 읽는다. 구성원/지식·AI 승인/배포 각 500건 상한, 최종 64 MiB와 owner 재권한·SHA-256 감사는 유지한다. 인증 비밀·고객 확인키·배포 소유 증명값은 출력하지 않는다. 완전한 account/연동/매체 아카이브로 주장하지 않는다.
- **실제 검사/환경/커밋:** 로컬 AP PostgreSQL 17·Field Valkey mock, 합성 owner/editor/체험/소유 위젯, 320px Chromium, Git 없음. 새 계정 단언은 기존 코드에서 exit 1 red였다. 최종 `pnpm test:spike:attachments:agent` 1/1, `pnpm test:db:agent` 18/18(격리 임시 DB), `pnpm test:spike:export:http` 1/1, `pnpm test:spike:agent-owner-flow:http` 1/1(실제 다운로드 필드 확인), `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports` exit 0. 새 `pnpm mock:run` 세션 **98525**의 양 API ready·웹 `/workspace` 200.
- **실패한 접근:** 기존 JSON에는 계정/체험/지식·AI·배포가 없었다. red 확인 뒤 허용 필드만 추가했다. 실운영 데이터 복제/삭제·고객 발송·결제 없음.
- **남은 작업:** A08 전체 account/OAuth/매체·청구 사건과 대용량 분할 archive, 실보존/삭제/복구·신고/관리자 운영실 및 QA47~49/157/G-A3. F09 동일 운영 범위, C03 사용자 시각/흐름·접근성 전체. 인증/LLM/알림/결제/DNS 자격은 `blocked_integration`; 정식 E2E/security/출시 게이트 미완료, A08/C03 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **98525**가 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA/명령을 쓴다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:attachments:agent
pnpm test:db:agent
pnpm test:spike:export:http
pnpm test:spike:agent-owner-flow:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F09/C03 Field 계정·체험·AP 연결 메타데이터 운영 파일 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 명세대로 AP/Field 독립 서비스를 기능부터 완성하고 로컬에서 사용할 수 있게 한다. 사용자 시각/흐름 검토는 후속이다. 전체 mock 세션 **39559** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321 ready. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field owner의 기존 조직 운영 파일에 owner 계정, 구성원/역할, 자체 체험 시작·종료 예약, AP 연결의 AI/배포 scope·상태 및 양방향 해제 시각을 추가했다. Field 구독 화면에서 포함 범위를 설명한다. 앞서 포함한 사이트·문의·예약·외부 수신 요청/사진은 유지한다.
- **수정 파일:** `apps/field-api/src/operations-archive.ts`, `apps/field-api/test/inquiry-attachments.db.test.ts`, `apps/field-web/src/field-subscription.tsx`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. AP 앱/DB·Field migration·제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 조직 owner만 repeatable-read 스냅샷을 만들고 출력 필드는 명시 allowlist로 고른다. 구성원·AP 연결은 각각 500건에서 멈추며 마지막 64 MiB 크기와 감사/재권한 검사를 유지한다. OAuth 토큰 암호문, client 비밀, 인증 계정/세션/비밀번호, AP 상담 원문은 export하지 않는다. 조직-owner FK 관계가 깨져 계정을 읽지 못하면 부분 파일을 내보내지 않는다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey mock, 합성 owner/editor/체험·AP 연결, 320px Chromium, Git 없음. 신규 계정 단언으로 focused DB exit 1 red; 첫 typecheck/Field API build는 nullable 계정 타입으로 exit 2 뒤 수정했다. 최종 `pnpm test:spike:attachments:field` 1/1, `pnpm test:db:field` 17/17(격리 임시 DB), `pnpm test:spike:export:http` 1/1, `pnpm test:spike:field-owner-flow:http` 1/1(실제 다운로드 계정/구성원 확인), `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports` exit 0. 새 `pnpm mock:run` 세션 **39559**의 양 API ready·웹 `/workspace` 200.
- **실패한 접근:** 기존 JSON에는 계정/체험/연결 메타데이터가 없었다. 타입 검사의 optional 결과는 DB 불변식을 검사해 해결했다. 실운영 데이터 복제/삭제·고객 발송·결제 없음.
- **남은 작업:** F09 전체 계정/연동 사건 원장·대용량 분할 archive, 실구독/청구·해지/정리·보존/삭제/복구·관리자/신고 및 QA42~49/113/146/157/G-F3. C03 사용자 시각/흐름·접근성 전체. 실제 인증/LLM/알림/결제/DNS 자격은 `blocked_integration`, 정식 E2E/security/출시 게이트 미완료; F09/C03 `in_progress`.
- **다음 에이전트 정확한 명령:** mock **39559**가 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA/명령을 쓴다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:attachments:field
pnpm test:db:field
pnpm test:spike:export:http
pnpm test:spike:field-owner-flow:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03 양제품 작업실 첫 조회 실패 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인과 개발 계획 v3.0대로 독립 AP/Field 서비스를 기능부터 완성하고 사용할 수 있는 환경을 만든다. 사용자 화면/흐름 확인은 후속이다. 로컬 전체 mock **85209** 실행 중: AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`; API 4311/4321. 46개 작업 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** AP/Field 사업자 작업실의 세션 GET 503 및 인증된 사업 초안 GET 503을 비로그인·첫 조직과 분리했다. 오류 화면에 재시도 버튼을 두고 같은 세션으로 다시 조회해 초안을 복구한다. 일반 세션 없음/401과 초안 404 전이는 유지한다.
- **수정 파일:** `apps/agent-web/src/workspace.tsx`, `apps/field-web/src/field-workspace.tsx`, `tools/spikes/{agent-owner-flow,field-owner-flow}-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. API/domain/DB/migration/제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 확정된 미로그인 응답만 로그인 화면으로 보내며, 실패 응답과 fetch 예외는 재시도 가능한 `failed` 상태로 둔다. 재시도는 세션 확인을 먼저 하고 인증된 경우 사업 초안을 다시 읽는다. 초안 조회 성공 뒤 보조 문의함/알림 조회는 전체 화면을 로그인으로 되돌리지 않는다.
- **실제 검사/환경/커밋:** 로컬 PostgreSQL 17·Field Valkey mock, 320px Chromium, Git 없음. 양제품 owner 브라우저 회귀를 추가한 뒤 기존 빌드에서 세션 GET 503 때문에 각 exit 1 red(오류 화면 부재)를 확인했다. 최종 `pnpm test:spike:agent-owner-flow:http` 1/1, `pnpm test:spike:field-owner-flow:http` 1/1은 세션·사업 초안 GET 503 각각의 오류→재시도와 이후 AP 외부 위젯/문의·Field 사이트/문의/두 예약 방식을 포함한다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:web:agent`, `pnpm build:web:field` exit 0. `pnpm mock:run` 세션 **85209**에서 양 API ready, 두 웹 `/workspace` 200.
- **실패한 접근:** 기존 화면은 GET 503을 로그아웃처럼 표시해 실제로 로그인된 사용자의 초안 복구 경로가 없었다. 회귀 검사의 처음 실패는 의도한 red이며 수정 후 green이다. 실고객 데이터 삭제/메시지 발송/청구 없음.
- **남은 작업:** C03 사용자 화면·흐름 검토, 네트워크 단절·200% 확대/키보드 전체/스크린리더 및 QA57/58/119 전체 증빙. F09 전체 계정/연동 기록·대용량 archive/보존/삭제/복구와 실구독, 나머지 제품별/연결 기능·정식 E2E/security/출시 게이트. 인증/LLM/발송/결제/DNS 자격은 `blocked_integration`; C03과 제품 작업은 `in_progress`다.
- **다음 에이전트 정확한 명령:** 현재 mock **85209**가 살아 있으면 중복 기동하지 않는다. 다음 Task 시작 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA/명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -I http://localhost:3001/workspace
curl -I http://127.0.0.1:3002/workspace
pnpm test:spike:agent-owner-flow:http
pnpm test:spike:field-owner-flow:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:web:agent
pnpm build:web:field
```

## 최신 인수인계 — F09/C03 Field 수신 외부 요청·복사 사진 운영 파일 (2026-09-25)

- **현재 목표:** `reference` 디자인·개발 계획 v3.0대로 AP/Field 독립 서비스를 기능부터 완성하고 사용할 수 있는 환경을 구축한다. 사용자 화면/흐름 검토는 후속이다. 전체 mock 세션 **11909**가 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`를 실행 중이다. 46개 작업은 implemented 1·in_progress 36·planned 9·verified 0이다.
- **완료 작업:** Field 조직 owner의 운영 파일에 Field가 공개 계약으로 수신한 외부 문의/예약 요청 전체를 추가했다. 외부 요청의 고객·서비스·업무 snapshot과 출처/동의/상태, copied 사진의 실제 Field 저장소 바이트·크기/SHA-256, pending/copy_failed의 상태/실패 코드를 포함한다. 기존 예약별 요약 연결과 직접 문의·사이트/예약 기록을 유지한다. 다른 제품 원본 상담·OAuth 비밀·객체 키는 제외하고 사진 ID가 서로 같아도 저장소 종류별로 구분한다. copied 사진 누락/손상은 503으로 파일·감사 생성을 막는다.
- **수정 파일:** `apps/field-api/src/operations-archive.ts`, `apps/field-api/test/inquiry-attachments.db.test.ts`, `apps/field-web/src/field-subscription.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. Field DB migration·AP 앱/DB·제품 간 공개 계약/분할 PRD·마스터 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** Field 수신 사본은 예약과 연결되지 않은 `inquiry`도 Field 소유 기록이므로 organization-scoped repeatable-read export에 포함한다. 외부 요청 500건·첨부 2,500건·전체 64 MiB로 제한한다. copied 사진만 Field inquiry 파일 저장소에서 검증하며 pending/failed 바이트를 성공으로 위장하지 않는다. 생성 감사의 media_count에는 실제로 담긴 copied 사진만 포함한다. 출력에는 명시적 허용 필드만 둔다. 기존 JSON formatVersion v1에 `externalRequests`를 추가하고 예약 `externalSources`는 유지한다.
- **실제 검사/환경/커밋:** 로컬 Field PostgreSQL 17·Valkey, 합성 조직/사진과 320px Chromium, Git 없음. `pnpm test:spike:attachments:field` 최종 1/1은 owner/editor/타 조직·복사 완료/대기/실패·사진 UUID 중복·손상·감사 미생성을 포함한다. `pnpm test:db:field` 17/17(별도 임시 DB), `pnpm test:spike:export:http` 1/1(양제품 실제 웹 프록시), `pnpm test:spike:field-owner-flow:http` 1/1(새 사업자→공개 사이트→문의/두 예약→운영 파일 다운로드), `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·`pnpm build:field`·`pnpm build:web:field`·`pnpm test:spike:imports` exit 0. 최종 mock 세션 **11909**에서 양 API ready·두 `/workspace` HTTP 200. 문서 패키지 검사 exit 0의 범위는 `document_package_only`이며 서비스 검사는 별도 명령으로 실행했다.
- **실패한 접근:** 새 `externalRequests` 단언은 기존 파일에 필드가 없어 exit 1 red였다. mock Field worker가 합성 pending 사진을 즉시 처리해 상태 단언이 흔들려 테스트 fixture의 `next_attempt_at`만 미래로 고정했다. 이어 `errorCode` 누락 exit 1 red를 확인하고 명시 필드로 추가했다. 실제 운영 데이터 복제/삭제·고객 발송·청구는 수행하지 않았다.
- **남은 작업:** F09 전체 계정·연동 후속 상태와 대용량 분할 archive, 실구독·해지/정리·보존/삭제/복구·관리자/신고 및 QA42~49/113/146/157/G-F3. C03 사용자 화면/흐름 확인과 200% 확대·키보드 전체/스크린리더. 실제 인증/LLM/알림/결제/DNS 공급사는 `blocked_integration`, 정식 E2E/security/출시 게이트 미완료. F09/C03은 `in_progress`다.
- **다음 에이전트 정확한 명령:** mock 세션 **11909**가 살아 있으면 중복 기동하지 않는다. 다음 Task 시작 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA/게이트·검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:attachments:field
pnpm test:db:field
pnpm test:spike:export:http
pnpm test:spike:field-owner-flow:http
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C02/A08/F09 로컬 mock 제품별 백업·격리 복원 (2026-09-25)

- **현재 목표:** `reference` 디자인·개발 계획 v3.0대로 AP/Field 독립 서비스를 완성한다. 기능을 우선 구현하며 사용자 화면/흐름 검토는 후속이다. 전체 mock 세션 **87716**의 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`가 계속 실행 중이며 두 API `/health/ready`가 응답했다. 46개 작업은 implemented 1·in_progress 36·planned 9·verified 0이다.
- **완료 작업:** 로컬 mock 제품별 `pg_dump -Fc`와 참조 사진을 새 출력 디렉터리에 복사하고 덤프·사진의 길이/SHA-256·제품 스키마를 독립 PG17에서 검증하는 CLI와 사용 runbook을 추가했다. `manifest.json`은 모든 검증 뒤 마지막에 생성한다. 누락/손상/다른 제품 스키마/저장소 밖 심볼릭 링크는 거절하고 이번에 만든 불완전 출력은 정리한다. 현재 서비스 자료는 복제하지 않고 신규 합성 자료만 사용했다.
- **수정 파일:** `tools/{product-backup-lib,backup-product,verify-product-backup}.mjs`, `tools/spikes/product-backup.test.mjs`, 루트 `package.json`, `docs/technical/{LOCAL_BACKUP_RUNBOOK,PHASE_2_EXECUTION_PLAN}.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일. AP/Field 앱·DB migration·제품 공개 계약/분할 PRD·마스터는 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 설계 결정:** AP와 Field는 별도 mock 컨테이너/DB/파일 루트를 쓴다. 덤프를 신뢰하지 않고 `--network none`의 새 `postgres:17.11` 컨테이너에 복원해 제품 스키마·사진 참조를 확인한다. 출력 디렉터리는 신규/0700, 덤프·사진·manifest는 0600이다. Field의 직접 문의·복사된 외부 요청 사진·사이트 사진을 각 제품의 원본 저장소에서 해시 검증한다. 이 도구는 로컬 파일 mock 전용이며 운영 S3/DB 복원이나 삭제 원장 재적용 수단이 아니다.
- **실제 검사/환경/커밋:** Docker PostgreSQL 17.11 임시 source/restore 컨테이너와 합성 파일. `pnpm test:backup:mock` 최종 8/8: 각 제품의 정상 복원, 누락 사진, 변조 덤프·사진, 다른 제품 DB, 루트 밖 심볼릭 링크 거절. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 세 백업 스크립트 `node --check` exit 0. `.env`에는 profile 값이 없어 조건부 검사로 고친 뒤 기존 `/tmp` 출력을 지정한 AP/Field CLI는 예상한 `EEXIST` exit 1로 종료해 현재 DB를 읽지 않았다. `curl -fsS http://127.0.0.1:4311/health/ready` 및 `:4321/health/ready`는 각각 `ready`; 두 웹 `/workspace` HTTP 200. 문서 패키지 검사 `document_package_only` 통과. 실제 mock 백업 CLI와 운영 복구는 미실행. Git 없음.
- **실패한 접근:** 첫 합성 검사 4/4는 PostgreSQL 이미지 초기화 단계에서 소켓 `pg_isready`가 잠깐 성공한 직후 서버가 재시작해 `createdb`가 연결 실패했다. TCP `pg_isready -h 127.0.0.1`로 최종 서버 준비를 확인하도록 고쳐 8/8 재실행 통과했다. 제품/사진 손상 거절은 의도한 실패 사례로 검증했다.
- **남은 작업:** C02 제품별 운영 백업 자동화·실서버 DB/객체 ACL·CI; A08/F09 실보존/삭제/revoke 재적용·분할 아카이브/관리자·독립 실청구/정리 모드; QA47/123/146·RPO/RTO/G-A3/G-F3 전체. C03 사용자 시각/흐름 승인과 접근성 전체. 실제 인증/LLM/알림/결제/DNS 공급사는 `blocked_integration`; 정식 E2E/security/출시 게이트 미완료. 세 Task는 `in_progress`다.
- **다음 에이전트 정확한 명령:** mock 세션 **87716**이 살아 있으면 다시 기동하지 않는다. 다음 작업 시작 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·요구/QA·검사 명령을 쓴다. 아래 백업 검사는 합성 자료만 생성한다. 실제 mock 백업 CLI는 데이터 소유 범위를 확인한 뒤 `docs/technical/LOCAL_BACKUP_RUNBOOK.md`에 따라 별도 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:backup:mock
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F09/C03 Field 조직 운영 기록 묶음 내보내기 (2026-09-25)

- **현재 목표:** `reference` 디자인과 개발 계획 v3.0대로 AP/Field를 독립적으로 사용할 수 있게 완성한다. 기능 구현을 우선하고 사용자 시각/흐름 승인은 아직 남아 있다. 전체 로컬 mock 세션 **87716**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace` 실행 중이다. 작업 46개는 implemented 1·in_progress 36·planned 9·verified 0이다.
- **완료 작업:** Field 조직 owner가 자기 사업정보·사이트 초안/공개본/사진·직접 문의/메모/사진·예약/상태 사건/알림/수동 차단/허용된 외부 출처 메타데이터를 JSON 한 파일로 받는다. Field 구독·데이터 화면에 실제 버튼·413/503 이유를 연결했다. 파일 생성은 500건·64 MiB 상한, 사진 바이트/SHA-256 불일치 또는 누락은 503, 성공 생성은 Field 전용 감사 원장에 남긴다. 무인증/editor/타 조직은 접근 불가다.
- **수정 파일:** `apps/field-api/migrations/000042_operations_archive_audit.sql`, `apps/field-api/src/{app,operations-archive}.ts`, `apps/field-api/test/inquiry-attachments.db.test.ts`, `apps/field-web/src/{field-subscription,field-workspace}.tsx`, `tools/spikes/{inquiry-export-http.test.mjs,field-owner-flow-browser.py}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. AP 코드/DB·제품 간 공개 계약·분할 PRD/마스터 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** Field DB repeatable-read 읽기에서 조직 owner를 확인하고 AP 상담 원문·확인키·객체 키·grant/토큰을 응답에 넣지 않는다. Field가 원본인 운영 기록만 필드별로 내보내고 예약에 연결된 AP 업무는 허용된 출처 메타데이터만 둔다. 사이트/문의 사진은 각 Field 전용 저장소에서 읽고 전부 검증한다. 감사 기록 직전 owner membership을 재확인한다. 생성 파일은 계정/결제·연동 업무 수신 사본 전체의 법적 백업으로 주장하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock Field PG17·Valkey/320px Chromium, Git 없음. 신규 경로는 `pnpm test:spike:attachments:field`에서 404로 exit 1 red, 최종 1/1 green(두 문의/예약 사건/문의·사이트 실제 사진 바이트/해시, 무인증/타 조직/editor, 손상 503/추가 감사 없음). `pnpm test:db:field` 17/17(격리 시험 DB), `pnpm test:spike:export:http` 1/1(양제품 실제 웹 프록시), `pnpm test:spike:field-owner-flow:http` 1/1(신규 사업자→사이트/직접 문의/두 예약 방식→320px 화면 버튼 실제 파일·내용/overflow/page error 0). `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·`pnpm build:web:field`·`pnpm test:spike:imports`·`pnpm test:spike:db:isolation`·Python `py_compile`·JS `node --check` exit 0. `pnpm mock:run` 세션 87716의 AP/Field API·웹 build/ready 및 두 웹 `/workspace` HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/check_package.py` exit 0은 `document_package_only`이며 서비스 테스트는 실행하지 않는다.
- **실패한 접근:** 신규 API가 없던 DB 검사는 무인증 요청에 404를 받아 예상 401과 달라 red였다. 기능 구현 뒤 컴파일·DB/웹 경로는 통과했다. 운영 공급사나 AP 원본을 모의 성공으로 채우지 않았다.
- **남은 작업:** Field F09 실구독·해지/정리·전체 계정/연동 업무 수신 사본과 대용량 분할·보존/삭제/백업 복구·제품별 관리자/신고·QA42~49/113/146/157/G-F3. C03 사용자 시각 검토와 200% 확대/키보드 전체/스크린리더 검수. 실제 메일/모델/알림/결제/DNS 자격과 계약은 `blocked_integration`; 전체 E2E/security/출시 게이트 미완료. F09/C03은 `in_progress`이며 실고객 발송·청구·외부 배포·운영 데이터 삭제 없음.
- **다음 에이전트 정확한 명령:** 세션 **87716**가 살아 있으면 mock을 중복 기동하지 않는다. 다음 Task의 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 쓴다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:attachments:field
pnpm test:spike:export:http
pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A08/C03 AP 조직 문의·사진 묶음 내보내기 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 개발 명세에 맞춰 독립 AP/Field 서비스를 완성한다. 현재 기능 구현 우선이며 사용자 화면 승인과 출시 게이트는 남아 있다. 전체 로컬 mock 세션 **24840**가 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`를 실행 중이다. 46개 작업은 implemented 1·in_progress 36·planned 9·verified 0이다.
- **완료 작업:** AP owner가 한 조직의 모든 직접 문의·고객/사업자 메시지·내부 메모·고객 사진 원본 WebP 바이트를 JSON(base64)로 묶어 다운로드한다. AP 구독·데이터 화면에 실제 버튼과 413/503 오류 이유를 연결했다. AP 생성 감사 원장에 actor/조직/건수/바이트/SHA-256을 남긴다. 한 요청은 500건·64 MiB 상한이며 사진 누락/손상은 파일 없이 503이다. 비회원·타 조직·editor는 접근 불가다.
- **수정 파일:** `apps/agent-api/migrations/000048_inquiry_archive_audit.sql`, `apps/agent-api/src/{app,inquiry-archive}.ts`, `apps/agent-api/test/inquiry-attachments.db.test.ts`, `apps/agent-web/src/{workspace,agent-subscription}.tsx`, `tools/spikes/{inquiry-export-http.test.mjs,agent-owner-flow-browser.py}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. Field 코드/DB·제품 간 공개 계약·분할 PRD/마스터 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 읽기 범위를 owner의 AP 조직에 한정하고 repeatable-read 스냅샷으로 문의/메시지/첨부 메타데이터를 고정한다. 저장소 사진은 크기/SHA-256 검증 후 전부 포함한다. 감사 INSERT 시 owner membership을 다시 확인한다. JSON 응답에 확인키 해시·객체 키·제출 키가 들어가지 않도록 필드를 명시한다. 대용량 비동기/분할 export와 계정·배포·청구 데이터는 아직 포함하지 않아 A08의 전체 아카이브로 주장하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17·Field Valkey, 320px Chromium, Git 없음. `pnpm test:spike:attachments:agent` 신규 경로 404로 exit 1 red, 최종 1/1 green(두 문의·사진 실제 바이트·타 조직/editor/무인증·손상 503·감사 한 건). `pnpm test:db:agent` 18/18, `pnpm test:spike:export:http` 1/1, `pnpm test:spike:agent-owner-flow:http` 1/1(사업자 가입→외부 위젯→비회원 문의→구독 화면 실제 다운로드·JSON 내용·320px overflow/page error 0), `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·`pnpm build:web:agent`·`pnpm test:spike:imports`·Python `py_compile` exit 0. `pnpm mock:run` 세션 24840가 AP/Field API·웹 build 후 ready, 두 웹 `/workspace` HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/check_package.py`는 `document_package_only` 통과이며 서비스 검사는 하지 않는다.
- **실패한 접근:** 첫 typecheck에서 `Map.groupBy`가 현재 TypeScript lib에 없어 실패해 표준 Map 반복으로 바꿨다. editor 거절 검사에서 임시로 부여한 membership을 제거하지 않아 뒤의 기존 개별 사진 타 조직 거절 기대가 200으로 실패했고, 검수 후 membership을 되돌린 뒤 전체 DB 검사를 재통과했다.
- **남은 작업:** A08 전체 계정/배포/청구 데이터 아카이브, 500건·64 MiB 초과 비동기/분할, 보존·삭제/백업/복원·신고·관리자 접근 감사, QA47~49/157 및 출시 G-A3. Field F09는 별도다. 실모델/메일·알림/결제/DNS 공급사는 `blocked_integration`이고 정식 E2E·security/출시 게이트도 미완료다. A08/C03은 `in_progress`; 실고객 발송·청구·외부 배포·운영 데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **24840**가 살아 있으면 `pnpm mock:run`을 중복 기동하지 않는다. 다음 Task의 파일 범위·QA/게이트·검수 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:attachments:agent
pnpm test:spike:export:http
pnpm test:spike:agent-owner-flow:http
pnpm test:db:agent
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A05/C03 AP 상담 배포 생성·상태 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인·v3.0 개발 명세대로 AP/Field를 독립 사용 가능한 서비스로 완성한다. 기능 구현 우선, 사용자 화면/흐름 검토는 단계별로 남아 있다. 전체 로컬 mock 세션 **40524**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace` 실행 중. 46개 작업 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** AP 상담 링크/소유 위젯 생성 POST의 결과가 미상이어도 같은 요청 키로 한 배포를 조회·재시도한다. 첫 배포 목록 GET 실패를 ‘배포 없음’으로 표시하지 않고 조작을 닫아 같은 화면에서 재시도한다. 활성화 POST 성공 뒤 목록 조회만 실패한 경우와 POST 응답 자체가 사라진 경우를 구별하고 최신 목록으로 복구한다.
- **수정 파일:** AP 내부 migration `apps/agent-api/migrations/000047_deployment_creation_idempotency.sql`, `apps/agent-api/src/deployments.ts`, `apps/agent-api/test/deployments.db.test.ts`, `apps/agent-web/src/agent-deploy.tsx`, `tools/spikes/agent-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. Field 앱/DB·공개 SDK/제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** AP 소유 생성 API에 선택적 UUID `idempotencyKey`를 추가해 기존 클라이언트를 유지한다. `ap.deployments`의 `(organization_id, creation_key)` 유일 제약이 동시 요청을 수렴시킨다. 같은 키+kind/origin이면 기존 row 200, 다른 내용이면 409다. 배포 종류/origin만으로 중복을 추측하지 않는다. UI는 pending 키를 같은 화면에서 보존하고 새 POST 대신 동일 키를 보낸다. POST 결과와 뒤이은 GET 결과를 별도로 다룬다.
- **실제 검사/환경/커밋:** 로컬 AP PG17·Valkey/320px Chromium. 기존 AP DB의 `pnpm test:spike:deployments:agent`는 같은 키 반복이 201로 exit 1 red; 기존 AP 웹의 `pnpm test:spike:agent-owner-flow:http`는 첫 목록 GET 503 뒤 빈 목록이 보여 exit 1 red. migration/API/UI 변경 뒤 전체 mock **40524**의 최종 신규 사업자→일반 외부 사이트 위젯→비회원 문의/답변 브라우저 1/1: GET 503 재시도, 링크 생성 POST commit 뒤 응답 분실→같은 키 두 POST/링크 한 건, 활성화 POST 성공 뒤 목록 GET 503→재조회, 소유 위젯 활성화 POST commit 뒤 응답 분실→목록 재조회·설치 코드 복구. `pnpm test:db:agent` 18/18(키 반복/동시 요청/잘못된 키/위젯 재시도 포함), 최종 `pnpm test:spike:deployments:agent` 1/1, Field 연결 소비자 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1, `pnpm lint`·`pnpm typecheck`·`pnpm test:unit` exit 0, Python `py_compile` exit 0. 별도 임시 AP PG17 DB에 47개 migration을 처음부터 적용해 새 `creation_key uuid`를 확인하고 그 DB를 정리했다. 양 API/웹 build와 mock ready 확인. Git 없음.
- **실패한 접근:** 이전 POST는 매번 새 ID를 만들고 응답 분실을 ‘전달되지 않았다’고 잘못 단정했다. 목록 조회 장애도 빈 배열을 그대로 렌더링했다. 종류/origin을 영구 유일하게 만들면 정상적인 여러 배포를 막고, 목록만 추측해 복구하면 기존 배포와 새 배포를 구별할 수 없어 요청 키를 채택했다.
- **남은 작업:** 실 DNS/TLS·외부 도메인/iframe 정책 검수, 공급사 LLM/인증·알림/결제, C03 역할별 200% 확대/키보드/스크린리더·사용자 디자인 검토, 표준 E2E·QA/G 전체. 페이지 재로드를 넘는 생성 키 보존은 미구현이며 목록에서 실제 배포를 확인할 수 있다. A05/C03은 `in_progress`; 운영 고객 발송·청구·외부 배포·실데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **40524**가 살아 있으면 mock을 중복 기동하지 않는다. 다음 Task 전에 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·검수 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:deployments:agent
pnpm test:spike:agent-owner-flow:http
pnpm test:db:agent
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03 Field 작업실 주 동작 스타일 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인·v3.0 개발 명세대로 AP/Field를 독립 사용 가능한 서비스로 완성한다. 기능 구현 우선, 사용자 화면/흐름 검토는 단계별로 남아 있다. 전체 로컬 mock 세션 **82723**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace` 실행 중. 46개 작업 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** 실제 Field 가입/로그인 화면의 주 제출 버튼이 브라우저 기본 회색으로 남던 C03 문제를 고쳤다. AP 로컬에 있던 공통 폼 제출 버튼/체크박스 스타일을 데이터 접근 없는 공유 UI CSS로 옮겨 두 제품에 적용했다.
- **수정 파일:** `packages/ui/src/states.css`, `apps/agent-web/src/consult.css`, `docs/technical/evidence/c03-field-workspace-before.png`·`c03-field-workspace-after-320.png`·`c03-field-workspace-after-640.png`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. API/domain/DB migration·공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 같은 `.site-shell .feature-section .form-fields` 제출 동작은 무상태 공통 스타일로 관리한다. 버튼의 활성·비활성·키보드 초점은 구분하며 48px 높이·16px 글자를 유지한다. 공개 Field 사이트 고유 디자인은 `.field-site` 선택자로 별도다.
- **실제 검사/환경/커밋:** 기존 mock의 640px Chromium에서 두 차례 Field 버튼 `rgb(239,239,239)`·2px outset·radius 0, AP 버튼 `rgb(22,87,159)`·경계 없음·radius 10px을 재현하고 [수정 전 화면](technical/evidence/c03-field-workspace-before.png)을 저장했다. 새 전체 mock **82723** 양 API/웹 build·ready 뒤 [Field 320px](technical/evidence/c03-field-workspace-after-320.png)·[Field 640px](technical/evidence/c03-field-workspace-after-640.png) 화면과 AP/Field 각각 320·640px 계산 스타일을 확인했다: 배경 `rgb(22,87,159)`·높이 48px·글자 16px·키보드 초점 윤곽선, 가로 넘침 없음, JS 예외 0. `pnpm test:spike:agent-owner-flow:http`·`pnpm test:spike:field-owner-flow:http` 각 1/1, `pnpm lint`·`pnpm typecheck`·`pnpm test:unit` exit 0. Git 없음.
- **실패한 접근:** AP 전용 `consult.css`에 공통 폼 스타일을 둔 이전 구조에서 Field는 UA 기본 버튼으로 표시됐다. CUA 대화형 브라우저는 이 환경에서 unavailable이어서 기존 프로젝트 Chromium/Playwright를 사용했다. QA 스킬의 Git 커밋 단계는 Git 저장소가 없어 실행할 수 없었다.
- **남은 작업:** 사용자 reference 디자인/흐름 승인, C03 역할별 200% 확대·키보드 전체 경로·스크린리더, 실 LLM/인증·알림/결제 공급사, DNS/TLS·복구·보안, 표준 E2E·QA/G 전체. C03은 `in_progress`; 운영 고객 발송·청구·외부 배포·실데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **82723**이 살아 있으면 mock을 중복 기동하지 않는다. 다음 Task 전에 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·검수 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:agent-owner-flow:http
pnpm test:spike:field-owner-flow:http
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A04/C03 AP AI 설정 초안 저장 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인·v3.0 개발 명세대로 AP/Field를 독립 사용 가능한 서비스로 완성한다. 기능 구현 우선, 사용자 화면/흐름 검토는 단계별로 남아 있다. 전체 로컬 mock 세션 **19010**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace` 실행 중. 46개 작업 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** AP AI 설정 초안 PUT의 응답이 사라진 결과 미상 상태에서 입력을 보존하고 GET으로 서버 초안/revision을 확인한다. GET 장애는 같은 화면에서 다시 시도한다. 서버 버전과 내 입력이 다르면 명시적으로 내 입력 재저장 또는 서버 초안 사용을 선택한다. 해결 전 승인·사업자 답변 테스트를 막는다.
- **수정 파일:** `apps/agent-web/src/agent-ai.tsx`, `tools/spikes/agent-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. AP API/DB migration·Field 앱·공개 제품 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** PUT 응답 분실/5xx는 저장 성공도 미전달도 단정하지 않는다. 먼저 자기 조직의 서버 초안을 읽어 보낸 네 필드와 비교한다. 정확히 일치하면 서버 revision으로 화면을 복구하고 새 PUT을 보내지 않는다. 다르면 편집 입력을 잠시 보존하고 서버 초안을 보여준 뒤 사용자가 원본 대체 여부를 결정한다. 409도 같은 비교 경로로 복구한다.
- **실제 검사/환경/커밋:** 로컬 AP PG17·Valkey, 320px Chromium. 기존 mock 웹의 `pnpm test:spike:agent-owner-flow:http`는 AI 설정 PUT commit 뒤 응답 분실에 결과 미상 안내가 없어 exit 1 red. 새 전체 mock 세션 **19010**의 최종 전체 브라우저 1/1 green: PUT 응답 분실→상태 GET 503→재조회 revision 복원·중복 PUT 없음, 다른 actor 수정 뒤 409에서 내 입력 재저장, 두 번째 409에서 서버 초안 선택, 이전 AI 승인 POST 미상/GET 장애 복구, 일반 외부 사이트 위젯→비회원 문의·사업자 답변까지 확인. `pnpm test:db:agent` 18/18, `pnpm lint`·`pnpm typecheck`·`pnpm test:unit` exit 0, Python `py_compile` exit 0. 양 API/웹 build와 mock ready 확인. Git 없음.
- **실패한 접근:** 이전 화면은 저장 PUT 네트워크 예외에서 ‘요청 미전달’을 표시했고 과거 revision을 유지했다. 성공한 저장을 그대로 재시도하면 409가 나며, GET 없이 강제로 revision을 올려 쓰면 다른 작업자의 변경을 덮을 수 있다.
- **남은 작업:** 실 LLM/인증·알림/결제 공급사, DNS/TLS·복구·보안, C03 역할별 200% 확대/키보드/스크린리더/사용자 디자인 검토, 표준 E2E·QA/G 전체. A04/C03은 `in_progress`; 운영 고객 발송·청구·외부 배포·실데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **19010**이 살아 있으면 mock을 중복 기동하지 않는다. 다음 Task 전에 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·검수 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:agent-owner-flow:http
pnpm test:db:agent
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A04/C03 AP AI 승인 조회·응답 분실 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인·v3.0 개발 명세대로 AP/Field를 독립 사용 가능한 서비스로 완성한다. 기능 구현 우선, 사용자 화면/흐름 검토는 단계별로 남아 있다. 전체 로컬 mock 세션 **81965**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace` 실행 중. 46개 작업 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** AP AI 설정 화면은 필수 승인 AI·승인 지식 GET 장애를 ‘없음’으로 표시하지 않고 같은 화면에서 재시도한다. 승인 POST 서버 commit 뒤 응답 분실은 결과 미상으로 표시하고 추가 POST 없이 최신 release를 조회한다. POST 성공 뒤 release GET만 실패하면 승인 완료와 재조회 필요를 구별한다.
- **수정 파일:** `apps/agent-web/src/agent-ai.tsx`, `tools/spikes/agent-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. AP API/DB migration·Field 앱·공개 제품 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 초안·승인 release·공개 지식 조회가 모두 정상 응답(존재 또는 예상된 404)일 때만 조작을 연다. 일시 오류에서는 기존 값을 빈 상태로 단정하지 않는다. 승인 POST 응답 미확인은 서버 결과 미상으로 처리하고 GET으로 복구한다. POST 200/201 뒤 GET 장애에서는 승인 성공 사실을 유지한다. 실제 모델 미설정은 `blocked_integration`이다.
- **실제 검사/환경/커밋:** 로컬 AP PG17·Valkey, 320px Chromium. 기존 웹의 `pnpm test:spike:agent-owner-flow:http`는 첫 release GET 503 뒤 오류 표시 부재로 exit 1 red. 새 mock **81965**의 최종 같은 전체 브라우저 1/1 green: release GET 503·지식 GET 503 각각 재시도, 첫 승인 POST commit 뒤 응답 분실→revision 1 재조회·추가 POST 없음, 다음 승인 POST 성공 뒤 release GET 503→revision 2 재조회, 일반 외부 사이트 위젯·비회원 문의·사업자 답변까지 완료. `pnpm test:db:agent` 18/18, `pnpm test:spike:knowledge-autosave:http` 1/1, `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1, `pnpm lint`·`pnpm typecheck`·`pnpm test:unit` exit 0, Python 브라우저 검사 `py_compile` exit 0. 양 API/웹 build 성공, 양 API `/health/ready` 정상·양 웹 `/workspace` HTTP 200. Git 없음.
- **실패한 접근:** 이전 AP AI 화면은 release/지식 조회의 모든 비200을 null로 바꿔 ‘승인 없음’을 보여줬다. 승인 POST 응답이 사라지면 ‘요청이 전달되지 않았다’고 잘못 단정했다. UI 상태만 복구하는 이번 범위에서 실모델·발송·출시 게이트를 통과 처리하지 않았다.
- **남은 작업:** 실 LLM/인증·알림/결제 공급사, DNS/TLS·복구·보안, C03 역할별 200% 확대/키보드/스크린리더/사용자 디자인 검토, 표준 E2E·QA/G 전체. A04/C03은 `in_progress`; 운영 고객 발송·청구·외부 배포·실데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **81965**가 살아 있으면 mock을 중복 기동하지 않는다. 다음 Task 전에 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·검수 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:agent-owner-flow:http
pnpm test:spike:knowledge-autosave:http
pnpm test:db:agent
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F02/F04/C03 공개 상태 조회 실패 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인·v3.0 개발 명세대로 AP/Field를 별도 제품으로 실제 사용할 수 있게 완성한다. 기능 구현을 우선하며 사용자 시각/흐름 확인은 단계별로 남아 있다. 전체 로컬 mock 세션 **17539**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace` 실행 중. 46개 작업 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 사이트 편집 첫 로드에서 사진·승인 카탈로그·공개 사이트·릴리스 목록·AI 작업 조회 실패를 빈 상태로 표시하지 않는다. 모든 필수 조회가 성공해야 실제 편집·공개·복구 화면을 열고, 실패 시 같은 화면에서 재시도한다. 공개 POST 성공 뒤 후속 GET이 실패해도 공개 완료 사실과 재조회 필요를 구분한다. 공개 POST의 응답만 사라지면 결과 미상으로 표시하고 새 POST 없이 서버 상태를 다시 읽는다.
- **수정 파일:** `apps/field-web/src/site-editor.tsx`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. Field API·DB migration·AP 코드·공개 제품 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 공개 카탈로그·공개 사이트의 404만 미승인/미공개로 인정한다. 다른 조회 실패는 편집기를 `failed`에 두고 조작을 숨긴다. 공개 POST의 200/201은 확정된 결과로 기록하며, 그 뒤의 상태/릴리스 재조회 실패는 공개 요청 실패로 덮지 않는다. POST 응답이 사라지면 성공·실패를 단정하지 않고 GET으로 확인한다. 전체 재조회가 성공할 때까지 공개 상태를 다시 단정하지 않는다.
- **실제 검사/환경/커밋:** Field mock PG17·Valkey/320px Chromium. 기존 빌드의 `pnpm test:spike:field-owner-flow:http`는 공개 사이트 GET 503 뒤 오류 문구 부재로 exit 1 red. 조회 상태 수정 후 mock **11515**에서 공개 GET·릴리스 GET 각각 503→재조회와 전체 신규 사업자→사이트/고객 문의/두 예약 경로 1/1 green. 공개 POST 성공 뒤 첫 공개 GET 네트워크 단절을 추가하자 기존 문구가 ‘요청 미전달’이라 exit 1 red. POST 결과와 후속 조회를 분리한 mock **56824**에서 같은 전체 브라우저 1/1 green. 두 번째 공개 POST 서버 commit 뒤 응답 분실은 기존 문구가 ‘요청 미전달’이라 exit 1 red. 최종 mock **17539**에서 전체 브라우저 1/1 green: 새 공개 revision·릴리스 한 건·추가 공개 POST 없는 재조회와 이전 GET 장애/고객 문의·두 예약 경로 모두 확인. 같은 단계에서 사이트 자동 저장/320px 1/1, tenant host 1/1, Field 독립 임시 DB 17/17, 최종 `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. 최종 양 API/웹 build 통과·API ready·웹 HTTP 200, mock-run PID 24852. `check_package.py`는 `document_package_only` 통과(서비스 검사 아님). Git 없음.
- **실패한 접근:** 이전 구현은 필수 GET의 비200 응답을 빈 사진/승인/공개/릴리스로 바꾸었고, 공개 POST 뒤 상태 GET의 네트워크 예외가 바깥 catch로 전파되어 ‘공개 요청 미전달’ 메시지를 냈다. POST 응답 분실도 동일 문구로 처리해 commit 여부를 잘못 단정했다. 표준 `test:e2e:*` 명령을 기존 일부 mock 브라우저 검사에만 연결하면 전체 출시 E2E 게이트를 과장하므로 이번 범위에서 바꾸지 않았다.
- **남은 작업:** 실 LLM/알림/결제/인증 공급사, 실 DNS/TLS·미디어 저장소/복구, C03 전체 역할별 200% 확대·키보드/스크린리더/사용자 시각 검토, 표준 E2E/보안/출시 QA/G. 이 단계의 브라우저 통과를 전체 G-F1 승인으로 보지 않는다. F02/F04/C03은 `in_progress`; 운영 발송·청구·외부 배포·실데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **17539**가 살아 있으면 mock을 중복 실행하지 않는다. 다음 Task 전에 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·검수 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:field-owner-flow:http
pnpm test:spike:site-autosave:http
pnpm test:spike:tenant-host:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F02/C03 초기 조회 복구·C02/I07 Field DB 검수 격리 (2026-09-25)

- **현재 목표:** `reference` 디자인과 개발 문서 v3.0에 맞춰 AP·Field를 별도 제품으로 실제 사용할 수 있게 완성한다. 사용자가 기능 구현을 우선하고 화면·흐름은 단계별로 확인하기로 했다. 전체 로컬 mock 세션 **76315**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace` 실행 중. 46개 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 사이트 편집의 첫 사업 정보/사이트 초안 조회 실패를 계정 부재와 분리해 화면 내 재시도를 제공한다. 표준 Field DB 검사는 실행 중인 사건 worker와 공유 delivery 행을 소비하지 않도록 로컬 mock PG17에 전용 임시 DB를 생성·migration·검사·정리한다.
- **수정 파일:** `apps/field-web/src/site-editor.tsx`, `tools/spikes/field-site-autosave-browser.py`, `tools/run-db-suite.mjs`, `README.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. Field API/worker·DB migration·AP 코드·공개 제품 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 편집기는 `loading`·`failed`·`needs_setup`·`ready`를 분리하고 첫 GET의 5xx/네트워크 실패에서 같은 화면 재시도를 허용한다. 401/403/404 사업 정보는 계정/조직 설정 안내로 둔다. DB runner는 `fieldai_field_mock` 로컬 DB에서만 UUID 임시 DB를 만들고 자식 migration/검사에 그 URL을 전달하며 성공·실패 모두 자신이 생성한 DB만 정리한다. AP DB runner와 런타임 큐 동작은 유지한다.
- **실제 검사/환경/커밋:** 기존 웹에서 사업 정보 GET 503을 주입한 `pnpm test:spike:site-autosave:http`는 재시도 버튼 부재로 exit 1 red. 새 mock **76315**에서 양 API/웹 build·ready 후 해당 320px Chromium/PG17 검사는 사업 정보와 사이트 초안 GET 각각 503→재시도, 기존 자동 저장/409/모바일 전환·재개를 1/1 통과했다. Field 사업자 전체 브라우저 1/1, tenant host 1/1. 이전 공유 mock DB의 첫 `pnpm test:db:field`는 16/17(`acked` 대신 `empty`), 재실행 17/17이었다. 격리 runner 적용 후 worker 활성 상태에서 `pnpm test:db:field` 연속 2회 각 17/17, 변경된 AP 분기 `pnpm test:db:agent` 18/18. `PATH=/usr/bin:/bin`으로 `pnpm`을 제거한 의도된 실패는 exit 1·임시 DB 정리. PG `fieldai_field_test_%` 잔여 0, `node --check tools/run-db-suite.mjs`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0, 양 API ready·두 웹 `/workspace` HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/check_package.py`는 `document_package_only` 통과(서비스 검사 아님). Git 없음.
- **실패한 접근:** 기존 편집기는 사업 정보 조회 503을 계정 없음으로 오인했고 초안 실패에 재시도 경로가 없었다. Field DB 검사는 실행 중 worker와 같은 원장의 due delivery를 경쟁해, 자기 connection의 row 수로 좁힌 이전 단언만으로도 ACK/empty 경합을 막지 못했다. 같은 명령의 재시도 성공만으로 안정화됐다고 보지 않고 테스트 DB를 분리했다.
- **남은 작업:** F02/C03 전체 화면의 사용자 시각/키보드/스크린리더/200% 확대, 실제 미디어·DNS/TLS, 실모델/인증 공급사·발송·결제, 양쪽 운영 복구/보안과 정식 QA/G. `test:contracts` 등 기존 개별 spike는 이 임시 DB 격리 대상이 아니다. F02/C02/C03/I07은 `in_progress`; 운영 발송·청구·외부 배포·실데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **76315**가 살아 있으면 mock을 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·명령을 먼저 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:site-autosave:http
pnpm test:spike:field-owner-flow:http
pnpm test:spike:tenant-host:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C02/C03 양제품 단독 실제 화면 흐름 (2026-09-25)

- **현재 목표:** `reference`와 v3.0 개발 문서대로 AP·Field를 독립 사용 가능한 서비스로 완성한다. 기능을 우선 연결하며 사용자 시각/흐름 승인은 아직이다. 전체 로컬 mock 세션 **29965**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace` 실행 중. 46개 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** 표준 제품별 독립 실행 명령에 각 제품의 320px 합성 사업자/고객 전체 브라우저 경로를 추가했다. AP/Field 각각 상대 제품 서버·DB·큐 부재를 유지한 채 자기 가입→공개/설치→고객 접수→답변/예약까지 검수한다.
- **수정 파일:** `tools/run-independence.mjs`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. 기존 `tools/spikes/agent-owner-flow-http.test.mjs`·`field-owner-flow-http.test.mjs` 및 브라우저 파일을 재사용했다. 제품 앱·DB migration·공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** `test:independence:*`는 반대 제품의 환경변수 제거뿐 아니라 컨테이너·API/웹/DB/큐 포트 부재를 시작/종료에 확인하고, 자기 빌드/PG17/HTTP 업무 뒤 실제 UI를 검수한다. UI 자식 검사는 기존 non-zero 전파 함수로 실행한다. 합성 계정 정리는 기존 각 검수가 수행한다.
- **실제 검사/환경/커밋:** 전체 mock 세션 74654를 종료하고 `docker compose --project-name fieldai-agent-mock --env-file infra/agent/.env -f infra/agent/compose.mock.yaml stop`으로 AP DB를 볼륨 보존 중지했다. `pnpm test:independence:field` exit 0: AP 컨테이너/포트 부재, Field 자체 migration/API·웹 build/PG17/HTTP, 320px 새 사업자→사이트 공개→직접 문의·답변→두 예약 방식/확정 1/1. Field DB/Valkey를 볼륨 보존 중지한 `pnpm test:independence:agent` exit 0: Field 컨테이너/포트 부재, AP 자체 migration/API·웹 build/PG17/HTTP 외부 사이트 위젯, 320px 사업자→상담 링크/일반 외부 위젯→고객 접수·답변 1/1. 전체 mock **29965**로 복구해 양 API ready·두 웹 `/workspace` HTTP 200. `node --check tools/run-independence.mjs`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. Git 없음.
- **실패한 접근:** 새 독립 검수에서 실패 없음. 앞선 명령은 독립 HTTP 경로는 증명했지만 같은 조건의 실제 브라우저 화면은 검사하지 않았다.
- **남은 작업:** 실 LLM/알림/결제·DNS/TLS/실기기, 관리자 실제 경로와 C03 전체 접근성, 정식 QA121~124/출시 게이트. 로컬 단독 브라우저 성공을 완전 출시 승인으로 간주하지 않는다. C02/C03 및 연결 제품 작업은 `in_progress`; 운영 발송·청구·외부 배포/실데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **29965**가 살아 있으면 mock을 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·검수 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
node --check tools/run-independence.mjs
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F02/C03 Field 사이트 초안 작업 위치 재개 (2026-09-25)

- **현재 목표:** `reference`와 v3.0 개발 문서대로 AP·Field를 독립 사용 가능한 서비스로 완성한다. 기능을 우선 연결하며 사용자 시각/흐름 승인은 아직이다. 전체 로컬 mock 세션 **74654**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace` 실행 중. 46개 작업 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 사이트 편집기에서 URL의 허용된 제작 단계/저장된 페이지 ID를 새로고침 후 복원한다. 별도 브라우저의 일반 편집 URL은 서버 draft revision이 있으면 편집 단계로 진입해 저장 내용을 읽는다. 잘못된 페이지 ID는 홈으로 대체한다.
- **수정 파일:** `apps/field-web/src/site-editor.tsx`, `tools/spikes/field-site-autosave-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. Field API·DB migration·AP 코드/공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** URL에는 작업 위치(step/page ID)만 저장하고 초안/공개 내용·권한은 Field 서버에 둔다. URL 값을 draft의 실제 페이지와 정해진 단계 목록으로 검증한다. 저장된 초안은 일반 URL에서도 편집 단계로 이어진다. 미저장 입력은 기기 간 동기화한다고 주장하지 않는다.
- **실제 검사/환경/커밋:** 기존 서버의 `pnpm test:spike:site-autosave:http`는 서버 revision 16이 유지된 새로고침에서 디자인 단계로 초기화되어 exit 1 red. 수정 후 전체 mock **74654**의 양 API/웹 build·ready. 최종 같은 검사 1/1은 320px 페이지 4·저장 제목 재개, 잘못된 page URL의 홈 대체, 별도 로그인 브라우저에서 편집 단계/서버 초안 내용, 기존 자동 저장 실패·충돌·공개본 비노출을 통과. `pnpm test:spike:field-owner-flow:http` 1/1, `pnpm test:spike:tenant-host:http` 1/1, `pnpm test:db:field` 17/17, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. Git 없음.
- **실패한 접근:** 이전 편집 화면은 화면 단계/선택 페이지를 React 메모리 상태에만 두어 새로고침 후 무조건 디자인/홈으로 돌아왔다. 서버 초안 자체는 보존됐다.
- **남은 작업:** C03 역할별 실제 모바일·200% 확대·키보드/스크린리더 전체, F02/QA61 전체 기기 재개/업로드 장애, 실인증/모델/알림/결제·DNS/TLS와 정식 QA/G. F02/C03은 `in_progress`; 운영 고객 발송·청구·외부 배포/실데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **74654**가 살아 있으면 mock을 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·검수 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:site-autosave:http
pnpm test:spike:field-owner-flow:http
pnpm test:spike:tenant-host:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F04/C03 Field 승인 사이트 페이지별 검색 메타데이터 (2026-09-25)

- **현재 목표:** `reference`와 개발 문서 v3.0에 맞게 AP·Field를 독립 사용 가능한 서비스로 완성한다. 기능을 우선 연결하며 사용자 시각/흐름 승인은 아직이다. 전체 로컬 mock 세션 **3216**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace` 실행 중. 46개 작업 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 승인 사이트의 홈/하위 페이지별 문서 제목·설명·tenant canonical, Field 작업실/검토본 noindex/nofollow를 연결했다. 미승인/없는 페이지와 다른 사업장은 기존 404를 유지한다.
- **수정 파일:** `apps/field-web/src/app/site/site-metadata.ts`(신규), `site/[slug]/page.tsx`, `site/[slug]/[page]/page.tsx`, `app/workspace/layout.tsx`(신규), `app/preview/[role]/[page]/page.tsx`, `tools/spikes/field-tenant-host-http.test.mjs`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. Field API·DB migration·AP 코드/공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 검색 메타데이터는 공개 API가 반환한 승인 release만 사용한다. canonical은 요청 Host를 신뢰하지 않고 Field 서버가 구성한 `siteOrigin`이 있을 때만 낸다. 편집실·mock 검토본에는 검색 비노출을 선언한다. noindex는 인증/승인 검사를 대체하지 않는다.
- **실제 검사/환경/커밋:** 기존 서버에서 `pnpm test:spike:tenant-host:http`는 모든 페이지 공통 제목으로 exit 1 red. 수정 후 전체 mock **3216**의 양 API/웹 build·ready. 최종 tenant host HTTP/320px Chromium 1/1은 홈/서비스 제목·설명·canonical, 플랫폼 URL에서도 tenant canonical, 작업실/검토본 noindex, 미승인/교차 tenant 404를 통과. `pnpm test:spike:field-owner-flow:http` 1/1, `pnpm test:spike:site-autosave:http` 1/1, `pnpm test:db:field` 17/17, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. Git 없음.
- **실패한 접근:** 기존 공통 Field 메타데이터는 사이트/페이지별 내용을 나타내지 않았다. 실 DNS/TLS·검색엔진 색인 및 전체 QA79/G-F1은 이번 로컬 검수 대상이 아니다.
- **남은 작업:** C03 역할별 실제 모바일/접근성 전체, F04 자체 도메인 DNS/TLS·공개/복구 운영, 실인증/모델/알림/결제와 정식 QA/G. F04/C03은 `in_progress`; 운영 발송·청구·외부 배포/실데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **3216**가 살아 있으면 mock을 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·검수 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:tenant-host:http
pnpm test:spike:field-owner-flow:http
pnpm test:spike:site-autosave:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F02/C03 Field 모바일 페이지 편집·미리보기 전환 (2026-09-25)

- **현재 목표:** `reference` 디자인과 개발 문서 v3.0에 맞춰 AP·Field를 독립 사용 가능한 서비스로 완성한다. 기능을 먼저 연결하며 사용자 시각/흐름 승인은 아직이다. 전체 로컬 mock 세션 **9358**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`가 실행 중이다. 46개 작업 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 실제 편집기의 페이지 단계에서 모바일 편집/초안 미리보기 전환을 연결했다. 숨긴 입력은 mounted 상태로 유지하고, 미리보기 페이지 메뉴와 편집 페이지를 불변 ID로 동기화한다. 데스크톱에서는 둘 다 보인다.
- **수정 파일:** `apps/field-web/src/site-editor.tsx`, `field-site.tsx`, `site.css`, `tools/spikes/field-site-autosave-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. Field API·DB migration·AP 코드·공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 화면 전환은 CSS 표시만 바꾸고 입력/저장 상태를 재생성하지 않는다. 미리보기 페이지 선택은 변경 가능한 slug 대신 사이트 페이지 ID로 제어한다. 데스크톱의 기존 편집/미리보기 동시 표시를 유지한다.
- **실제 검사/환경/커밋:** 전환 버튼이 없어 `pnpm test:spike:site-autosave:http` exit 1 red. 수정 후 mock 세션 **9358**에서 두 API/웹 build·ready. 최종 같은 검사 1/1은 320px 버튼·키보드 Enter·페이지 선택·미저장 입력 왕복·자동 저장/네트워크 실패/충돌/공개본 비노출·가로 넘침/page error 0과 1440px 동시 표시 통과. `pnpm test:spike:field-owner-flow:http` 1/1, `pnpm test:db:field` 17/17, `pnpm test:spike:tenant-host:http` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. AP·Field API `/health/ready`는 `ready`, AP `/workspace`와 Field `/workspace/site` HTTP 200. Git 없음.
- **실패한 접근:** 기존 실제 편집기는 모바일 초안 미리보기를 맨 아래에만 놓아 전환 버튼 검사가 실패했다. 편집/미리보기의 페이지 선택 상태도 별개였다. 앱 동작을 수정해 검수를 통과했다.
- **남은 작업:** C03 전체 화면의 시각 검토·200% 확대·전체 키보드/스크린리더, F02 실제 DNS/TLS/미디어 저장소, 실인증/모델/발송/결제와 정식 QA/G. F02/C03은 `in_progress`; 운영 고객 발송·청구·배포/실데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **9358**가 살아 있으면 mock을 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:site-autosave:http
pnpm test:spike:field-owner-flow:http
pnpm test:spike:tenant-host:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C02/A05/C03 Field 부재 AP 외부 위젯 단독 검수 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 개발 문서대로 AP·Field의 기능을 각각 독립 사용 가능한 수준으로 완성한다. 사용자 시각/흐름 승인은 아직이며 기능을 우선 연결한다. 전체 `pnpm mock:run` 세션 **82695**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`가 다시 실행 중이다. 46개 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** AP 표준 단독 실행의 기존 가입·승인·직접 문의/답변·mock 체험 검수에, Field가 실제 없는 상태의 일반 외부 사이트 소유 증명→위젯 활성화→고객 AP 사람 인계/접수→사업자 답변·고객 확인키 열람을 추가했다. 별도 로컬 HTTP 사이트는 AP만 사용한다. 전체 mock을 검수 후 복구했다.
- **수정 파일:** `tools/spikes/independence-flow.mjs`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. 앱 런타임·DB migration·공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 독립 검사는 반대 제품의 환경변수 제거만으로 대체하지 않는다. runner가 Field 컨테이너와 API/웹/DB/큐 포트 부재를 시작·종료에 확인한 상태에서 AP 자체 빌드/DB/웹/HTTP 업무를 실행한다. 외부 사이트 증명은 mock의 실제 `/.well-known/ap-site-verification` HTTP 응답이며 임의 성공 fixture가 아니다. 모델 미설정 상태는 사람 인계만 검수한다.
- **실제 검사/환경/커밋:** 전체 mock 세션 88287을 정상 종료, `docker compose --project-name fieldai-field-mock --env-file infra/field/.env -f infra/field/compose.mock.yaml stop`로 Field DB/Valkey를 볼륨 보존 정지했다. `pnpm test:independence:agent` exit 0은 Field 컨테이너/포트 부재에서 AP 자신의 migration/API·웹 build, 가입·mock trial·지식/AI 승인, HTTP 외부 소유 증명 409→200, iframe nonce/세션/인계·AP 원본 고객 문의/사업자 답변/확인키를 통과했다. 이후 `pnpm mock:run` 세션 **82695**로 복구해 양 API `/health/ready`가 `ready`, 양 웹 `/workspace` HTTP 200. `node --check tools/spikes/independence-flow.mjs`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. `tools/check_package.py`는 문서 패키지만 passed이며 서비스 검사가 아니다. Git 없음.
- **실패한 접근:** 이번 단계에서 새 실패 없음. 앞 단계의 AP 위젯 인계 404 수정이 Field 부재 환경에서도 유지되는지를 검수 범위로 확장했다.
- **남은 작업:** AP 단독 실모델/고객 알림/유료 구독·실 HTTPS/DNS·독립 실기기, Field 단독/연동의 전체 운영 검수, C03 시각/키보드/스크린리더와 출시 QA/G. 이번 독립 검사는 HTTP 업무이며 320px 전체 브라우저는 직전 전체 mock 검수다. C02/A05/C03은 `in_progress`; 운영 고객 발송·청구·배포/실데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **82695**가 살아 있으면 mock을 중복 실행하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·검수 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:agent-owner-flow:http
pnpm test:db:agent
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A05/C03 일반 외부 사이트 위젯 셀프 설치·문의 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 문서대로 AP·Field를 각각 독립 서비스로 완성한다. 기능 구현을 우선하며 사용자 시각 검토는 아직이다. 로컬 전체 `pnpm mock:run` 세션 **88287**에 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`가 실행 중이다. 46개 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** 새 AP 사업자가 일반 외부 사이트를 직접 등록·소유 확인·위젯 활성화하고, 고객이 그 사이트의 SDK iframe에서 AP 사람 문의로 넘어가 접수·사업자 답변·확인키를 이용한다. 별도 세션 없는 고객의 위젯 직접 문의 링크도 AP 자체 직접 접수로 동작한다. 로컬 소유 증명 안내를 API 검증 방식에 맞췄다. 모델 미설정은 계속 차단 상태로 표시한다.
- **수정 파일:** `apps/agent-web/src/agent-deploy.tsx`, `apps/agent-api/src/deployments.ts`, `apps/agent-api/test/deployments.db.test.ts`, `tools/spikes/agent-owner-flow-http.test.mjs`·`agent-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. 제품 간 공개 계약·DB migration·Field 앱 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 소유 위젯의 모델 미설정 인계도 AP 공개 배포의 승인·소유 상태를 재검사한 뒤 AP 원본 상담과 first-party 고객 세션을 만든다. 모델 답변을 가정하지 않는다. 위젯의 비상 직접 링크는 위젯 세션이 없어도 작동하는 AP 공개 직접 문의를 연다. mock 외부 사이트의 증명값은 독립 HTTP 서버가 제공하며 Field 기능을 사용하지 않는다.
- **실제 검사/환경/커밋:** 첫 320px 검사는 로컬 사이트에 DNS TXT 안내가 나와 exit 1 red였다. 화면 수정 뒤 증명 전 verify 409/게시 후 성공, 위젯·handoff까지 진행했으나 고객 문의 404 red였다. 소유 위젯 직접 인계의 AP 원본·세션 누락을 AP DB 검사에서도 red로 확인하고 수정해 1/1 green. 다음 새 비회원 context에서 위젯 직접 문의 링크 제출 404 red를 확인하고 공개 직접 접수 URL로 수정했다. 최종 세션 **88287**의 `pnpm test:spike:agent-owner-flow:http` 1/1은 AP 링크와 독립 외부 사이트 설치·모델 차단·인계/직접 링크 문의·사업자 답변/확인키를 통과했다. `pnpm test:db:agent` 18/18, 최종 `pnpm test:spike:deployments:agent` 1/1, `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1, 최종 lint/typecheck/unit exit 0, 양 API ready와 두 API/웹 build·`/workspace` HTTP 200. `tools/check_package.py`는 문서 패키지만 passed이고 서비스 검사는 실행하지 않는다. Git 없음.
- **실패한 접근:** UI는 로컬 일반 사이트에 DNS TXT를 안내했다. 소유 위젯의 AI 미사용 인계에는 AP 상담 원본/쿠키가 없어 사람 제출이 404였다. 위젯의 직접 링크는 세션이 없는 고객도 열 수 있지만 위젯 전용 상담 URL이라 제출이 404였다. 각각 실제 원인에 맞게 수정했다.
- **남은 작업:** 실 Field 미배포 AP 단독 검수의 이번 경로, 실 HTTPS/DNS 소유 증명·제3자 쿠키/다중 ancestor·실모델/알림/결제·운영 보안/복구, C03 전체 시각/키보드/스크린리더 및 QA/G. A05/C03은 `in_progress`다. 운영 고객 발송·청구·배포/실데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **88287**이 살아 있으면 mock을 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·관련 QA/게이트·검수 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:agent-owner-flow:http
pnpm test:spike:deployments:agent
pnpm test:db:agent
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F05/F06/C03 문의 작성 초안 보존·C02/I07 Field DB 검사 경합 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 개발 문서대로 AP·Field를 별도 제품으로 완성한다. 기능을 먼저 연결하며 사용자 시각 검토는 아직이다. 전체 `pnpm mock:run` 세션 **32481**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`가 실행 중이다. 46개 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 사업자 답변 응답 중 입력한 비공개 메모가 사라지는 실제 웹 결함을 수정했다. 저장 후 같은 문의 재조회에서 미제출 작성칸을 보존하고, 제출한 칸도 요청 중 내용이 바뀌었으면 유지한다. Field DB 사건 검사의 전역 삽입 건수 단언을 자기 합성 연결의 delivery 3건/멱등 및 전환 후 미전달 사건 단언으로 바꿨다. 두 제품 전체 사업자→비회원 웹 경로가 각각 통과했다.
- **수정 파일:** `apps/field-web/src/field-workspace.tsx`, `tools/spikes/field-owner-flow-browser.py`, `apps/field-api/test/integrator.db.test.ts`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. Field API 런타임·DB migration·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 문의를 새로 선택할 때 작성칸을 초기화하고 저장 후 같은 문의를 다시 읽을 때는 초안을 유지한다. DB 검사는 공유 mock PG에서 다른 worker의 정상 삽입 시각에 의존하지 않고 자기 합성 connection/event의 상태를 단언한다.
- **실제 검사/환경/커밋:** Field 답변 API의 서버 commit 후 응답을 보류한 320px Chromium에서 메모 textarea가 빈 문자열이 되는 exit 1 red를 재현했다. 수정 후 세션 **32481**에서 `pnpm test:spike:field-owner-flow:http` 1/1은 가입·사이트 공개·직접 문의/비공개 메모·두 예약 방식/확정/확인키와 가로 넘침/page error 0을 확인했다. `pnpm test:spike:agent-owner-flow:http` 1/1도 재실행했다. 첫 `pnpm test:db:field`는 worker가 선삽입해 16/17(기대 3, 실제 1)이었고 무수정 재실행은 17/17이었다. 검사 수정 후 worker를 켠 채 전체 Field DB 17/17을 연속 3회 통과했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. 양 API `/health/ready` 응답 `ready`, 양 웹 `/workspace` HTTP 200. `tools/check_package.py`는 문서 패키지 범위만 `passed`이며 서비스 검사는 실행하지 않는다. Git 없음.
- **실패한 접근:** Field의 기존 `selectInquiry` 저장 후 호출은 답변·메모를 모두 비웠다. DB 검사의 `reconcileApEventDeliveries` 전역 반환값은 같은 PG의 worker와 경합해 일정하지 않았다. 검수 범위를 실제 소유 연결의 상태로 고쳤다.
- **남은 작업:** AP/Field의 다른 작성 중 응답 경계와 전체 C03 접근성·사용자 시각 검토, 실인증/모델/알림/결제/DNS/TLS·보존/복구, 운영 독립성/장애와 정식 QA/게이트. 관련 작업은 `in_progress`다. 운영 발송·청구·배포/실데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **32481**이 살아 있으면 mock을 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:field-owner-flow:http
pnpm test:spike:agent-owner-flow:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A00/A01/A02/A03/A05/C03 AP 가입→상담 링크→비회원 사람 문의 (2026-09-25)

- **현재 목표:** `reference`와 v3.0 개발 문서에 맞춰 AP·Field를 각각 독립 사용 가능한 서비스로 완성한다. 사용자 화면 디자인/흐름의 시각 승인은 아직 없고 기능을 먼저 연결 중이다. 전체 `pnpm mock:run` 세션 **7764**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`가 실행 중이다. 46개 작업 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** 새 AP 사업자 계정/조직의 지식·AI 별도 승인→상담 링크 활성화→별도 비회원의 모델 미설정 차단/사람 문의→사업자 AP 원본 답변·비공개 메모→고객 확인키 재열람을 한 브라우저 경로로 검수했다. 320px 배포 카드의 긴 상담 URL 줄바꿈을 고쳤다. 답변 저장 응답 중 작성한 메모 초안이 재조회 때 지워지던 문제를 고쳐 다른 입력을 유지한다.
- **수정 파일:** `apps/agent-web/src/consult.css`, `apps/agent-web/src/workspace.tsx`, 신규 `tools/spikes/agent-owner-flow-http.test.mjs`·`tools/spikes/agent-owner-flow-browser.py`, `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. Field 앱/DB·AP DB migration·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** AP 모델 키 미설정은 차단 상태로 표시하고 같은 상담 링크의 사람 문의를 유지한다. 공개 고객은 별도 브라우저 context·확인키를 사용한다. 사업자가 문의를 새로 선택하면 작성칸을 초기화하되, 저장 후 같은 문의를 갱신할 때는 다른 미제출 본문을 보존한다. 제출한 칸도 요청 후 내용이 바뀌었으면 보존한다. URL 줄바꿈은 고객 상담 링크에만 적용한다.
- **실제 검사/환경/커밋:** 첫 실행은 Playwright regex 링크 선택자 오류였다. 다음 실제 320px AP 배포 카드에서 긴 URL의 오른쪽 끝 433px을 확인해 CSS를 수정했다. 답변 응답을 보류한 동안 메모를 입력한 검사에서는 저장 후 메모 값이 빈 문자열이 되는 red를 재현했다. `selectInquiry` 저장 후 초안 보존과 조건부 입력 비우기로 수정한 새 mock 세션 **7764**의 `pnpm test:spike:agent-owner-flow:http` 1/1은 전체 AP 가입/승인/링크/비회원 문의/답변/비공개 메모/확인키 경로, 320px 가로 넘침/page error 0을 확인했다. `pnpm test:db:agent` 18/18, `pnpm test:spike:knowledge-autosave:http` 1/1, `pnpm test:spike:signout:http` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. AP/Field API ready, 두 API/웹 build 완료. Git 없음.
- **실패한 접근:** 긴 상담 URL이 줄바꿈되지 않았고, `selectInquiry`를 성공 후 다시 호출할 때 두 작성칸과 멱등 키를 모두 비웠다. 별도 브라우저 검수 선택자 실수는 앱 결함과 구분해 수정했다.
- **남은 작업:** 현재 AP end-to-end는 Field가 켜진 mock에서 실행됐으므로 실제 Field 미배포 독립성은 별도 명령의 근거를 사용한다. AP/Field의 다른 작성 중 응답 경계·전체 C03 화면/접근성, 실인증/모델/외부 알림/결제/DNS/TLS·보존/복구와 출시 QA/G가 남아 있다. 운영 고객 발송·청구·배포/데이터 삭제는 수행하지 않았다. 작업은 `in_progress`다.
- **다음 에이전트 정확한 명령:** 세션 **7764**가 살아 있으면 mock을 중복 실행하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·요구/QA·검수 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:agent-owner-flow:http
pnpm test:db:agent
pnpm test:spike:knowledge-autosave:http
pnpm test:spike:signout:http
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F07/C03 두 예약 방식의 비회원 접수와 사업자 확정 (2026-09-25)

- **현재 목표:** `reference`와 v3.0 문서 기준 AP·Field 독립 서비스 기능을 완성한다. 사용자 화면 디자인/흐름 시각 검토는 아직 받지 않았고 기능을 먼저 연결 중이다. 로컬 전체 `pnpm mock:run` 세션 **73050**에 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`가 실행 중이다. 46개 작업 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** 신규 Field 사업자 가입·사이트 2페이지 공개·비회원 직접 문의/사업자 답변 경로에 희망시간형과 시간표형 두 서비스를 승인하고 예약 영업일 정책을 저장하는 단계를 더했다. 별도 비회원 브라우저가 각각 미확정 신청을 만들고 사업자만 최종 확정했다. 고객은 각각 별도 확인키로 확정 상태를 다시 읽었다. 요청형 10시를 확정한 뒤 다른 서비스의 10시 시간표가 빠지고 11시는 신청 가능한 것을 확인했다.
- **수정 파일:** `tools/spikes/field-owner-flow-http.test.mjs`, `tools/spikes/field-owner-flow-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. 직전 단계에서 신규 검수 명령을 추가한 `package.json`은 유지했다. 앱 코드·DB migration·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 제품 자체 Field 고객/사업자 화면을 사용하고 별도 고객 browser context·확인키로 상태를 열었다. 시간표의 영업일은 사업자가 명시 저장하며, 신청과 사업자 확정을 분리했다. 실공급사 알림 성공은 추정하지 않는다. 검수 합성 데이터는 정확한 Field mock DB와 소유 이메일로 제한해 정리한다.
- **실제 검사/환경/커밋:** 확장 후 첫 red는 두 번째 서비스 `예약 방식`의 정확 label locator 0건이었다. 진단 출력에서 서비스 이름 두 개는 유지되고 부분 label은 3건임을 확인했다. 다음 red는 고객 예약 `서비스` select의 같은 문제, 마지막 red는 DOM에 붙은 네이티브 option을 visible로 기다린 검사 오류였다. 해당 행/select와 attached 상태로 바로잡은 최종 `pnpm test:spike:field-owner-flow:http` 1/1은 Field PG17·320px Chromium의 두 예약 방식/확정/확인키/공유 점유 및 기존 가입·공개·문의 전체를 통과했고 가로 넘침/page error 0이다. `pnpm test:db:field` 17/17, tenant-host 1/1, site-autosave 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. AP/Field API `/health/ready` 각 `ready`. Git 없음.
- **실패한 접근:** 정확 label 검색은 이 JSX의 label 내부 option 텍스트와 합쳐져 일치하지 않았고, 네이티브 option은 DOM에 있어도 visible 상태가 아니다. 데이터 유실이나 예약 API 오류는 이번 경로에서 발견되지 않았다.
- **남은 작업:** F07의 동시성·변경/취소·실알림 포함 전체 QA25~34/G-F2 운영 검수, 사용자 시각·키보드/스크린리더, 실 DNS/TLS·인증·모델·결제·발송·보존/복구, 다른 전체 제품/출시 게이트. 운영 고객 발송·청구·배포/데이터 삭제는 수행하지 않았다. F07/C03은 `in_progress`다.
- **다음 에이전트 정확한 명령:** 세션 **73050**이 살아 있으면 mock을 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:field-owner-flow:http
pnpm test:db:field
pnpm test:spike:tenant-host:http
pnpm test:spike:site-autosave:http
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F02/F04/F05/F06/C03 신규 사업자→비회원 대화 실화면 경로 (2026-09-25)

- **현재 목표:** `reference`와 v3.0 개발 문서에 맞춰 AP·Field를 각각 독립 사용 가능한 서비스로 완성한다. 사용자 화면 디자인/흐름 시각 검토는 아직 없고 기능 연결을 우선한다. 로컬 `pnpm mock:run` 세션 **73050**은 계속 실행 중이며 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`다. 46개 작업 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** 새 Field 사용자·조직의 사업 정보 승인→사이트 2페이지 편집/공개→독립 비회원 브라우저의 tenant 공개 사이트 방문/직접 문의→사업자 원본 답변→고객 확인키 재열람까지 한 실제 화면 경로로 검수했다. 검수 시작 전에 Field mock PG17 사용자·포트·DB와 API 준비 상태를 제한하고, 검사 뒤 합성 사이트 공개본·조직·계정을 정리한다. 새 루트 검수 명령을 추가했다.
- **수정 파일:** 신규 `tools/spikes/field-owner-flow-http.test.mjs`, `tools/spikes/field-owner-flow-browser.py`, `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. 앱 코드·DB migration·AP/Field 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 사업자는 Field 세션만 사용하고 고객은 별도 브라우저 context에서 공개 tenant URL과 별도 문의 확인키만 사용한다. 공개 전 초안을 고객으로 읽지 않는다. 비회원 원문과 사업자 답변은 Field에서 보관하며 공급사 알림 성공을 가정하지 않는다. 합성 테스트의 정리는 정확한 이메일 소유 조직으로 제한한다.
- **실제 검사/환경/커밋:** 초기 `pnpm test:spike:field-owner-flow:http` 두 번 exit 1은 검사 locator가 `본문` 구성 select/입력, `연락처` 입력/동의 checkbox를 함께 찾은 오류였다. locator 수정 후 전체 명령 1/1, Field PG17·320px Chromium의 가입·승인·공개·직접 문의·사업자 답변·고객 확인키 재열람, 두 브라우저 가로 넘침/page error 0. `pnpm test:spike:tenant-host:http` 1/1, `pnpm test:spike:site-autosave:http` 1/1, `pnpm test:db:field` 17/17, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. AP/Field `/health/ready` 각각 `ready`. 세션 **73050** 살아 있음. Git 없음.
- **실패한 접근:** Playwright의 부분 일치 label은 같은 단어가 들어간 select·checkbox까지 선택했다. 입력 role과 정확한 label로 좁혔다. 서비스 결함은 이번 검사에서 발견되지 않았다.
- **남은 작업:** F02/F04/F05/F06/C03의 전체 요구와 정식 QA/G, 사용자 시각/키보드/스크린리더 검토, 실 DNS/TLS, 실인증·모델·외부 발송·결제·보존/복구. 실제 고객 발송·청구·운영 배포/데이터 삭제는 수행하지 않았다. 이후 기능 작업은 새 Task 범위로 계획에 먼저 기록한다.
- **다음 에이전트 정확한 명령:** 세션 **73050**이 살아 있으면 mock을 중복 시작하지 않는다. 다음 Task 시작 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA/게이트·명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:field-owner-flow:http
pnpm test:spike:tenant-host:http
pnpm test:spike:site-autosave:http
pnpm test:db:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F02/C03 페이지 경로 중복·선택 복구 (2026-09-25)

- **현재 목표:** `reference`와 v3.0 개발 문서대로 AP·Field를 독립 사용 가능한 기능까지 완성한다. 기능을 우선 구현하고 사용자 화면 디자인/흐름 검토는 아직 받지 않았다. 전체 `pnpm mock:run` 세션 **73050**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`가 실행 중이다. 46개 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 편집기에서 중간 페이지 삭제 후 재추가가 기존 경로를 중복 생성하지 않는다. 수동으로 페이지 경로를 바꿀 때 현재 페이지 선택을 불변 ID로 유지한다. 중복·잘못된 경로와 빈 페이지 이름은 서버 전송 전에 오류를 표시하고 입력을 보존하며, 수정 후 자동 저장한다.
- **수정 파일:** `apps/field-web/src/site-editor.tsx`, `tools/spikes/field-site-autosave-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. Field API·DB migration·AP/제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 새 기본 page 번호는 현재 slug 집합에 없을 때까지 올린다. 편집 선택은 slug가 아닌 페이지 UUID로 고정한다. 브라우저 검증은 기존 Field API 검증의 친절한 선행 오류이며 서버의 검증을 없애지 않는다.
- **실제 검사/환경/커밋:** 첫 `pnpm test:spike:site-autosave:http` red는 검사 locator의 모호한 `페이지 2` 선택으로 exit 1, locator를 편집 목록에 한정했다. 다음 red에서 삭제 뒤 `page-3` 중복이 실제로 발생했고, 자동 번호 수정 뒤 수동 `page-3` 입력이 기존 페이지를 선택하는 red를 확인했다. 최종 mock 세션 **73050**에서 양 API/웹 build·ready, `pnpm test:spike:site-autosave:http` 1/1은 320px Chromium/실 PG17에서 재추가 `page-4`, 서버 저장 slug 유일성, 수동 중복·형식 오류에서 API PUT 없음·현재 입력 유지, 수정 뒤 저장, 기존 지연/응답분실/오프라인/충돌 흐름과 가로 넘침/page error 0을 확인했다. `pnpm test:spike:tenant-host:http` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. Git 없음.
- **실패한 접근:** 기존 `pages.length + 1`은 중간 삭제 시 기존 번호를 재사용했다. slug를 선택키로 쓰면 중복·빈 경로 편집 중 다른 페이지로 넘어갔다. 번호 후보 확인, ID 선택, 저장 전 오류 표시로 바로잡았다.
- **남은 작업:** F02/QA60 전체 페이지 한도·키보드/접근성/서비스 상세, 실 DNS/TLS·미디어 보존/복구, 실인증/모델/발송/결제, C03 사용자 시각 검토와 전체 출시 게이트. F02/C03 전체 완료로 처리하지 않는다. 실제 고객 발송·청구·운영 배포/데이터 삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **73050**이 살아 있으면 중복 mock을 시작하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·QA·명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:site-autosave:http
pnpm test:spike:tenant-host:http
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F02/F04/C03 공개 사이트 다중 페이지 경로 (2026-09-25)

- **현재 목표:** `reference`와 v3.0 개발 문서대로 AP·Field를 독립 사용 가능한 기능까지 완성한다. 화면 디자인/흐름의 사용자 검토는 아직 없으며 기능을 우선 연결한다. 전체 `pnpm mock:run` 세션 **23289**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`가 실행 중이다. 46개 중 implemented 1·in_progress 36·planned 9·verified 0.
- **완료 작업:** Field 공개 사이트의 두 번째 이후 소개 페이지를 `/site/{siteSlug}/{pageSlug}` 실제 URL로 열 수 있다. 승인본을 서버에서 읽고 페이지 존재를 확인하므로 없는 페이지·미승인 초안 페이지는 404다. 공개 메뉴는 링크여서 직접 접속·새로고침·브라우저 뒤로/앞으로를 유지한다. 편집 미리보기의 로컬 페이지 전환과 고객 문의/예약 CTA는 유지했다.
- **수정 파일:** `apps/field-web/src/field-site.tsx`, `apps/field-web/src/site.css`, `apps/field-web/src/proxy.ts`, `apps/field-web/src/app/site/[slug]/page.tsx`, 신규 `apps/field-web/src/app/site/site-route.ts`·`apps/field-web/src/app/site/[slug]/[page]/page.tsx`, `tools/spikes/field-tenant-host-http.test.mjs`, `tools/spikes/field-tenant-host-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. AP 코드·제품 간 계약·DB migration 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 공개 경로는 Field 공개 API의 최신 승인 SiteRelease만 조회한다. 서버 조회로 없는 페이지를 404로 처리하고 공개 링크는 사이트 slug와 페이지 slug를 고정한다. tenant 호스트 검사는 기존 사이트 소유 경계를 그대로 적용한다. API 장애는 없는 페이지로 위장하지 않고 서버 오류로 남긴다.
- **실제 검사/환경/커밋:** 기존 서버의 두 번째 공개 페이지 URL은 404여서 `pnpm test:spike:tenant-host:http` exit 1 red. 최종 mock 세션 **23289**에서 AP/Field API·웹 build·ready, `pnpm test:spike:tenant-host:http` 1/1은 두 별도 Field 조직/실 PG17과 320px Chromium에서 tenant/platform 공개 경로, 미승인/없는 페이지와 교차 tenant 404, 내부 링크·새로고침·뒤로/앞으로·문의 CTA, 가로 넘침/page error 0을 확인했다. `pnpm test:spike:sites:field` 2/2, 최종 빌드의 `pnpm test:spike:site-autosave:http` 1/1. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:web:field` exit 0. Git 없음.
- **실패한 접근:** 기존 공개 `SiteRenderer`는 페이지 버튼과 `useState`만 사용해 편집 slug가 주소에 반영되지 않았고 서버에 하위 라우트가 없어 404였다. 공개 메뉴를 실제 링크로 분리했다. 첫 리팩터링에서 미리보기 페이지 삭제 후 첫 페이지 fallback이 사라질 수 있음을 확인해 미리보기에서만 fallback을 복원하고 최종 빌드/브라우저를 다시 검사했다.
- **남은 작업:** QA09/60의 전체 페이지 한도·키보드/모바일·서비스 상세 검수, 실 DNS/TLS·미디어 저장소/복구, 실모델·인증·알림·결제·보존/복구, C03 시각 검토와 전체 출시 게이트. 이번 결과로 F02/F04/C03 전체를 완료 처리하지 않는다. 실제 고객 발송·청구·운영 배포/데이터 삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **23289**가 살아 있으면 중복 mock을 시작하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·QA·명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:tenant-host:http
pnpm test:spike:site-autosave:http
pnpm test:spike:sites:field
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A00/F00/C03 제품별 실제 로그아웃 (2026-09-25)

- **현재 목표:** `reference`와 v3.0 개발 문서에 맞춰 AP·Field를 독립 운영 가능한 기능까지 완성한다. 사용자가 요청한 로컬 서버는 전체 `pnpm mock:run` 세션 **41360**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`로 실행 중이다. 46개 중 implemented 1·in_progress 36·planned 9·verified 0이며 사용자 디자인 시각 승인은 아직 없다.
- **완료 작업:** 두 사업자 작업 화면에 자기 제품의 Better Auth `POST /api/auth/sign-out`을 연결했다. 미저장 조직명·초안·답변/메모 또는 저장 중에는 로그아웃 버튼을 막고 사유를 표시한다. 문의 답변/메모의 성공이 확인된 뒤 입력을 비워 버튼이 계속 잠기지 않게 했다. 요청 실패 시 세션을 유지하고 오류를 표시한다.
- **수정 파일:** `apps/agent-web/src/workspace.tsx`, `apps/field-web/src/field-workspace.tsx`, 신규 `tools/spikes/account-signout-http.test.mjs`, `tools/spikes/account-signout-browser.py`, 루트 `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. API·DB migration·공개 제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** API 토큰이나 반대 제품 계정은 로그아웃에 사용하지 않는다. 제품별 세션 쿠키를 각자의 서버에서 폐기하고 같은 작업 화면을 재로딩해 로그인 상태를 다시 읽는다. 실패를 로컬 표시만 로그아웃으로 바꾸지 않는다.
- **실제 검사/환경/커밋:** 구현 전 `FIELD_SIGNOUT_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:signout:http`는 AP 버튼 부재로 exit 1 red. 최종 전체 mock 세션 **41360**에서 AP/Field API·웹 build와 양 API ready, 두 `/workspace` HTTP 200. 같은 명령 1/1 green은 별도 합성 계정/실 PG17·320px Chromium에서 미저장 조직명 버튼 비활성→비우면 활성, AP 종료 후 Field 세션 유지, Field 종료, 원래 두 cookie 재사용 시 세션 200 `null`, 가로 넘침/page error 0을 확인했다. 합성 계정은 정리됐다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `/tmp/fieldai-report-venv/bin/python tools/check_package.py` exit 0. 패키지 검사는 문서 범위만 검사한다. Git 없음.
- **실패한 접근:** 기존 문의 답변/메모 폼은 저장 성공 뒤 입력을 유지해 새 미저장 보호가 로그아웃을 계속 비활성화할 수 있었다. 성공/멱등 재확인 응답에서만 입력을 비우고 최종 빌드·브라우저 검사를 다시 실행했다.
- **남은 작업:** 실메일·카카오 인증, 운영 세션/MFA·전체 기기 회수, C03 시각/키보드/스크린리더 검토, 실모델·외부 알림·청구·도메인·보존/복구, 독립/보안/출시 게이트. 이번 작업은 A00/F00/C03 전체 완료가 아니다. 실제 고객 발송·청구·운영 배포/데이터 삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 세션 **41360**과 준비 응답을 먼저 확인하고 살아 있으면 새 mock을 중복 시작하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·QA·명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
FIELD_SIGNOUT_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:signout:http
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/A00/F00/I00 로그아웃 세션 null 표시 (2026-09-25)

- **현재 목표:** `reference`와 v3.0 명세대로 AP/Field를 독립적으로 사용 가능한 로컬 서비스까지 완성한다. 사용자가 로컬 서버 기동을 요청했고 현재 전체 `pnpm mock:run` 세션 **16918**에서 AP `http://localhost:3001/workspace`, Field `http://127.0.0.1:3002/workspace`를 제공한다. 46개 중 implemented 1·in_progress 36·planned 9·verified 0; 사용자 디자인 시각 승인은 아직 없다.
- **완료 작업:** AP/Field 비로그인 세션 API의 정상 HTTP 200 JSON `null`을 다섯 작업/연결 로그인 화면에서 로그아웃으로 처리한다. AP Chrome 화면에서 실제 나타난 거짓 “인증 서버에 연결할 수 없습니다”를 없앴다. 실제 네트워크 오류 분기는 그대로 유지한다.
- **수정 파일:** `apps/agent-web/src/{workspace,agent-field-connections,agent-connect}.tsx`, `apps/field-web/src/{field-workspace,field-connect}.tsx`, 신규 `tools/spikes/auth-session-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. API·DB migration·공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 인증되지 않은 `get-session`의 `null`은 정상 결과다. 세션 객체 접근에 optional chaining을 적용하고 기존 실제 fetch 예외만 접속 오류로 표시한다. 계정 자동 생성이나 다른 제품 세션 공유는 없다.
- **실제 검사/환경/커밋:** Chrome AP 작업 화면에서 거짓 오류를 관찰했고 curl AP 웹/직접 API는 각 200 `null`; 신규 320px Chromium 브라우저 검사는 수정 전 AP 화면에서 exit 1 red. 수정 뒤 새 전체 mock 세션 **16918**에서 AP/Field API·웹 build/ready, 로그아웃 AP 작업·연결·동의, Field 작업·동의 5/5 green(200/null, 거짓 오류 0, page error 0, 가로 넘침 0). `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1은 로그인 후 기존 위젯·예약·인계·해제 전체 흐름을 재검수했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. Git 없음.
- **실패한 접근:** `response.json().catch`는 유효한 JSON `null`을 `{}`로 바꾸지 않는다. 코드가 세션 객체로 단언해 `.user`를 읽다가 TypeError를 내고 이를 네트워크 장애로 표시했다. 세션 응답을 null-safe로 읽게 했다. IAB/Chrome 브라우저 전용 제어는 이 환경에서 사용 불가였지만 native Chrome의 새 탭에서 AP 화면을 열어 증상을 관찰했다.
- **남은 작업:** 실메일/카카오 인증과 운영 세션/MFA, C03 전체 접근성·사용자 디자인 검토, I07 운영 장애·키 회전·구버전 호환, AP/Field 실모델·알림·결제·도메인·보존/복구, 전체 QA/출시 게이트. 실제 고객 발송·청구·운영 배포/데이터 삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 현재 세션 **16918**이 살아 있으면 중복 mock을 시작하지 않는다. 새 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·QA·명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
/tmp/fieldai-ui-venv/bin/python tools/spikes/auth-session-browser.py
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm test:integration:faults
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I07 로컬 연결 장애 표준 명령 (2026-09-25)

- **현재 목표:** `reference`와 개발 명세 v3.0대로 AP·Field를 독립적으로 사용할 수 있게 끝까지 구현한다. 사용자가 로컬 서버 기동을 요청했고 현재 `pnpm mock:run` 세션 **36104**가 살아 있다. API 두 준비 응답과 AP `http://localhost:3001/workspace`·Field `http://127.0.0.1:3002/workspace` HTTP 200을 실제 확인했다. 화면 시각 승인은 아직 없다. 46개 중 implemented 1·in_progress 36·planned 9·verified 0이고 I07은 `in_progress`다.
- **완료 작업:** `pnpm test:integration:faults`의 exit 2 placeholder를 로컬 mock 실제 검사로 교체했다. 두 제품의 정확한 mock PG/Field Valkey 대상과 두 API 제품/ready·웹 200을 선확인한다. 공개 OpenAPI 정적 2건, AP/Field 제공자·소비자 DB fault 5건, 별도 API/worker 실제 양방향 HTTP 1건을 순차 실행한다. 각 하위 명령 실패/종료는 상위 실패로 전파한다.
- **수정 파일:** `tools/run-integration-faults.mjs` 신규, 루트 `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 인수인계. AP·Field 런타임/DB migration·제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 실행 중인 서비스를 임의로 중단/재기동하지 않는다. 합성 테스트가 실운영 DB를 건드리지 않도록 loopback 주소뿐 아니라 제품별 mock 사용자·DB 이름·포트와 Field Valkey 포트를 확인한다. AP/Field DB 검사는 각자 `.env`를 읽는 기존 테스트를 그대로 쓰고 runner child에는 상대 제품 secret을 전달하지 않는다. 전체 I07/운영 출시 통과로 확대하지 않는다.
- **실제 검사/환경/커밋:** 변경 전 `pnpm test:integration:faults`는 exit 2 red. 정확한 mock 포트 제한을 추가한 마지막 버전으로 표준 명령 exit 0: 정적 2/2, AP DB 3/3, Field DB 2/2, 양쪽 실제 HTTP/worker 1/1. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. 로컬 AP/Field API `/health/ready` ready·두 웹 `/workspace` HTTP 200을 확인했다. 별도 서버 중단·운영 공급사·키 회전/구 consumer는 이 명령에서 미검수. Git 없음.
- **실패한 접근:** 기존 표준 명령은 의도적인 `not implemented` exit 2로 종료됐다. 새 명령은 실제 하위 테스트를 실행하며 mock 서버가 없거나 정확한 자기 mock DB/Valkey가 아니면 시작 전 실패한다. 하위 실패 전파는 코드 경로로 확인했고 일부러 서버를 중단하는 실패 실행은 하지 않았다.
- **남은 작업:** I07 복수 origin·운영 중단/지연·키 회전·구버전 consumer, 전체 QA131/132/140/158/159·G-I1~I3; 모든 제품의 실인증·모델·알림·결제·도메인·보존/복구, C03 사용자 디자인/접근성 검토, R00~R02 및 출시 증빙. 실제 고객 발송·청구·운영 배포/데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 현재 세션 **36104**와 준비 응답을 먼저 확인하고 살아 있으면 새 mock을 중복 시작하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·QA·명령을 기록한다. 이번 명령은 두 제품이 실행 중일 때 아래와 같다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:integration:faults
pnpm lint
pnpm typecheck
pnpm test:unit
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/I04 고객 Field 조회 실패 복구 (2026-09-25)

- **현재 목표:** `reference` 디자인·v3.0 문서대로 AP/Field를 독립 사용 가능한 로컬 서비스로 완성한다. 화면 시각 승인은 아직 없으며 46개 중 implemented 1·in_progress 35·planned 10·verified 0이다. C03/I04는 `in_progress`다.
- **완료 작업:** AP 고객 Field 전달 패널의 서비스·전달 기록·문의 사진을 독립 조회로 처리한다. 첫 서비스 목록이 503이어도 성공한 기존 전달 기록을 표시하고 오류·재시도 버튼을 노출한다. 같은 고객 확인키로 다시 조회하며 새 외부 요청은 자동으로 만들지 않는다.
- **수정 파일:** `apps/agent-web/src/agent-field-action.tsx`, `tools/spikes/field-action-browser.py`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. API·DB migration·공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 한 조회 실패가 다른 성공 응답의 기록을 버리지 않도록 `Promise.allSettled`를 사용한다. 세 조회 중 하나라도 실패하면 오류를 표시한다. 실제 무연결 200/빈 목록은 기존처럼 패널을 숨긴다. 재시도는 조회만 반복하고 고객의 Field 전달 동의를 재사용하거나 제출하지 않는다.
- **실제 검사/환경/커밋:** 첫 서비스 목록만 Playwright에서 503으로 바꾼 양방향 실제 HTTP/browser 검사는 기존 패널 숨김 때문에 10초 timeout·exit 1 red였다. 수정 후 `pnpm mock:run` 세션 **36104**에서 AP/Field API·웹 build, 양쪽 ready. `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1 green은 320px 오류 표시·기존 기록·재시도, 예약 상태·새 전달·Field 1회 코드·기존 해제 흐름을 수행했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. 실 Field 서버 중지/장기 장애·정식 QA119/143/G-I2는 미실행이다. Git 없음.
- **실패한 접근:** 기존 `Promise.all`은 응답 코드 503을 reject하지 않고 `found.status === 200`만 건너뛰어, 연결/기록이 비어 있을 때 패널 자체를 반환하지 않았다. 조회 결과를 각각 반영하고 실패를 화면에 표시했다.
- **남은 작업:** C03 사용자 디자인·키보드/스크린리더 전체 검토, I04 장기/실서버 장애·실모델 응답 중 인계·route 전환·운영 공급사/보존, AP/Field 인증·알림·결제·DNS/TLS·독립 릴리스와 전체 QA/G. 실제 고객 발송·청구·배포/데이터 삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 현재 전체 mock 세션 **36104**가 살아 있으면 중복 기동하지 않는다. 새 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·QA·명령을 기록한다. 아래로 현재 서비스와 이번 경로를 재검수한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
```

## 최신 인수인계 — D04 매체 유입 Field 예약의 실제 연결 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 문서 기준 AP/Field를 각자 독립적으로 사용할 수 있게 만들고, 선택 연결/배포 기능을 끝까지 구현한다. 사용자 화면 디자인·흐름의 시각 승인은 아직 없으며 전체 46개 작업은 implemented 1·in_progress 35·planned 10·verified 0이다. D04는 계속 `in_progress`다.
- **완료 작업:** AP owner가 자기 활성 매체 승인 배포(`placement_embed`)를 Field에 정확히 선택·동의할 수 있다. AP 공개 배포 계약 enum을 `1.0.0-preview.6`으로 확장하고 Field 소비자가 새 종류를 읽게 했다. Field 자기 사이트 설치는 `owned_embed`만 받는다. 선택적 실제 HTTP 검수는 매체 카드→AP `live` 문의 5건→Field 현재 조건/고객 동의/예약 수락→Field owner 확정→서명 사건 AP 처리→사업자/매체 완료 주 집계·CSV와 320px 매체 화면을 통과했다.
- **수정 파일:** `contracts/agent-integrator-v1.openapi.json`, `tools/test/agent-integrator-contract.test.mjs`, `apps/agent-api/src/integrator-routes.ts`, `apps/agent-web/src/agent-connect.tsx`, `apps/field-api/src/ap-connector.ts`, `apps/field-api/test/sites.db.test.ts`, `apps/field-web/src/field-ap-connections.tsx`, `tools/spikes/ap-field-connection-http.test.mjs`, 신규 `tools/spikes/distribution-metrics-browser.py`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계와 분할 문서에서 재생성한 마스터. DB migration 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 인가 선택은 AP owner·동일 조직·활성 배포에 한정하고 매체 배포를 자동 공유하지 않는다. Field는 AP 공개 계약의 배포 종류를 파싱하지만 매체 배포를 Field 사이트 위젯 설치 대상으로 쓰지 않는다. 8개 완료 UTC 주만 보고하고 5건 미만을 억제한다. 실 사건을 받은 뒤 이번 검수에서만 AP mirror의 시각을 지난주로 조정해 `5-9` 구간을 관찰했다. 제품 간 DB 접근은 검수 도구만 사용하며 런타임은 공개 HTTP/서명 계약을 유지한다.
- **실제 검사/환경/커밋:** AP 공개 계약 enum 검사와 양방향 HTTP는 각각 enum 누락, OAuth 선택 404로 red였다. 수정 뒤 새 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_DISTRIBUTION_E2E=1 FIELD_DISTRIBUTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1(실 AP/Field API·별도 PG17/Field Valkey·worker, 5개 확정 ACK/처리, JSON/CSV `5-9`, 매체 PII 비노출, 320px 가로 넘침 없음/page error 0). 기존 `FIELD_EVENT_WORKERS_RUNNING=1 pnpm test:spike:ap-field:http` 1/1. `pnpm test:db:agent` 15파일 18/18, `pnpm test:db:field` 10파일 17/17, `pnpm test:spike:sites:field` 2/2, `pnpm test:contracts` 정적 2/2·DB 5/5, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 새 mock 세션 **57645**에서 양쪽 API/웹 build와 ready, 합성 HTTP 계정 양 DB 0명. Git 없음.
- **실패한 접근:** 새 매체 배포가 먼저 생성되자 기존 fixture의 `deployments[0]`이 Field 사이트 배포라는 가정이 깨져 ID 불일치였다. 예약 시작 UTC 09시는 한국 18시로 영업시간 밖이라 `slot_unavailable` 409였고 UTC 01~05시로 고쳤다. 브라우저 주 검색은 이전 주 종료일과 대상 주 시작일을 동시에 찾아 strict selector가 실패해 시작일 뒤 ` ~`를 함께 찾았다. 각각 수정 뒤 전체 HTTP/browser를 다시 실행했다.
- **남은 작업:** 실제 매체 도메인 DNS/TLS·외부 공급사, 원래 Field 발생 시각이 완료 주에 들어오는 운영 검수, 고도화 봇·복수 역할 차분 공격, QA104~107/G-D2 정식 판정. AP/Field 실인증·모델·발송·결제·도메인·보존/복구와 C03 사용자 디자인/접근성 검토, 전체 독립/연동/출시 게이트도 남는다. 실제 고객 발송·청구·운영 배포/데이터 삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 현재 `pnpm mock:run` 세션 57645가 살아 있으면 재기동하지 않는다. 새 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·요구/QA·명령을 기록한다. 사용한 검수 명령은 아래와 같다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_DISTRIBUTION_E2E=1 FIELD_DISTRIBUTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
FIELD_EVENT_WORKERS_RUNNING=1 pnpm test:spike:ap-field:http
pnpm test:db:agent
pnpm test:db:field
pnpm test:contracts
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — D04 Field 예약 최초 확정의 AP 배포 집계 (2026-09-25)

- **현재 목표:** `reference` 디자인과 v3.0 문서 기준 두 독립 제품을 로컬에서 사용 가능한 기능까지 완성한다. 사용자 화면 시각 검토는 아직 받지 않았다. 전체 46개 작업 중 implemented 1·in_progress 35·planned 10·verified 0이며 D04도 `in_progress`다.
- **완료 작업:** AP가 이미 수신·처리한 Field 예약 확정 원장을 배포 문의의 `live` placement에 연결해 완료 UTC 주 8개별 최초 확정 예약 수를 `under_5` 등 구간값으로 사업자/매체 JSON·CSV에 제공한다. 동일 예약의 재확정, 미리보기/테스트/식별된 봇, 예약 이외 ActionRequest를 제외한다. 현재 연결과 해당 기간의 과거 확정 사건이 모두 없으면 미지원으로 표시하고 매출·수금은 측정하지 않는다.
- **수정 파일:** `apps/agent-api/src/distribution-metrics.ts`, `apps/agent-api/test/{distribution,field-actions}.db.test.ts`, `apps/agent-web/src/distribution-metrics-panel.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계. DB migration·공개 AP/Field 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 새 제품 간 이벤트/DB 공유를 만들지 않고 AP의 기존 인증된 `field_reservation_events` mirror를 읽는다. 첫 `confirmed` 시각 기준 한 예약 한 건이며 취소 뒤에도 역사적 확정 사건으로 남는다. 연결 여부는 AP grant가 유효하고 Field 요청 scope가 있는 현재 연결로 확인하되, 해제 후 기간 내 과거 사건도 집계한다. 응답과 CSV에 예약 ID·고객 PII를 내보내지 않는다.
- **실제 검사/환경/커밋:** 신규 집계 기대는 구현 전 `unsupported_unconnected` red. 이후 `pnpm test:spike:distribution:agent` 1/1, `pnpm test:spike:field-actions:agent` 1/1, `pnpm test:db:agent` 15파일 18/18, `pnpm test:contracts` 정적 2/2·제공자/소비자 DB 5/5, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. mock 세션 **13199**에서 AP/Field API·웹 build와 두 API `/health/ready` ready. Git 없음.
- **실패한 접근:** 새 `bookings` 필드를 추가한 뒤 기존 완료 주 응답의 deep equality 기대가 한 번 실패했다. 미연결 기간의 명시 상태를 기대에 포함하고 전체 DB 검사를 재실행했다. 공급사 성공이나 출시 완료로 간주하지 않았다.
- **남은 작업:** 실제 Field 예약→서명 사건→AP 배포 성과의 단일 HTTP/browser E2E, 새 사업자/매체 화면의 320px/시각 검토, 복수 역할 차분 공격·실매체 운영/QA107/G-D2 검수. AP/Field 실인증·모델·발송·결제·DNS/TLS, 전체 독립/연동/출시 QA도 남는다.
- **다음 에이전트 정확한 명령:** 현재 mock 세션 13199가 살아 있으면 중복 기동하지 않는다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·요구/QA·명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:distribution:agent
pnpm test:spike:field-actions:agent
pnpm test:db:agent
pnpm test:contracts
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
```

## 최신 인수인계 — I04 AP 문의 사진 선택·Field 비공개 수신 (2026-09-25)

- **현재 목표:** v3.0·`reference`의 AP/Field 독립 서비스를 로컬에서 실제 사용 가능한 기능까지 연결한다. 기능을 계속 구현하되 화면 시각 검토는 사용자가 아직 하지 않았다. `TASKS.md`는 46개 중 implemented 1·in_progress 35·planned 10·verified 0이며 I04는 `in_progress`다.
- **완료 작업:** 고객이 AP 원본 문의의 준비된 사진 최대 5개를 Field 전달 화면에서 골라 별도로 동의한다. AP ActionRequest에 선택 UUID와 동의 항목을 고정하고, 현재 OAuth grant·actor·연결·배포·선택 ID가 일치할 때만 공개 API가 WebP 원본 바이트를 제공한다. Field는 본문을 먼저 멱등 접수하고 자체 DB의 사진별 pending 원장과 별도 worker로 비공개 사본을 만든다. 실패 상태·재시도와 자기 조직 사업자의 목록/인증 사진 열람을 연결했다. 임의 URL은 받거나 fetch하지 않으며 AP 원본 대화는 Field에 복제하지 않는다.
- **수정 파일:** `contracts/{agent-integrator-v1,field-integrator-v1}.openapi.json`, `tools/test/{agent-integrator-contract,field-integrator-contract}.test.mjs`, `apps/agent-api/src/{field-actions,inquiry-attachments}.ts`, `apps/agent-api/test/field-actions.db.test.ts`, `apps/agent-web/src/agent-field-action.tsx`, `apps/field-api/src/{bookings,ap-connector,ap-event-worker,app,external-request-attachments,external-request-attachment-worker}.ts`, `apps/field-api/migrations/000041_external_request_attachments.sql`, `apps/field-api/test/integrator.db.test.ts`, `apps/field-web/src/{external-request-photos,field-workspace}.tsx`, `tools/spikes/{agent-field-same-page-browser.py,ap-field-connection-http.test.mjs,field-external-photo-browser.py}`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계와 재생성 마스터/HTML. Git 저장소/커밋 없음.
- **핵심 설계 결정:** AP가 고객 확인키로 선택한 같은 문의 사진만 ActionRequest의 불변 body에 둔다. Field는 자기 DB에 저장된 action/attachment ID만 AP 공개 OAuth API에 전달한다. 업무 수락 응답과 사진 복사 결과를 분리하고 `pending/copying/copied/copy_failed`를 추적한다. Field 수신 바이트는 스트리밍 4MB 상한과 WebP 재정규화를 거쳐 자체 저장소에 기록한다. 연결 해제 뒤 AP 사진 API는 더 이상 열리지 않지만 이미 복사된 Field 사본은 수신 업무의 별도 보존 대상이다.
- **실제 검사/환경/커밋:** 계약 기대의 AP 경로 부재·Field 최대 0개 red를 확인한 뒤 정적 2/2 green. `pnpm test:spike:field-actions:agent` 1/1, `pnpm test:spike:integrator:field` 1/1(첫 503 실패→동일 원장 재시도→사본/권한 확인), `pnpm test:contracts` 정적 2/2·DB 5/5, `pnpm test:db:agent` 15파일 18/18, `pnpm test:db:field` 10파일 17/17, `pnpm test:unit`, `pnpm lint`, `pnpm typecheck`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 최종 mock 세션 **11480**의 AP/Field API·웹 재빌드·ready 뒤 `FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1: 기존 AI 실패 대체/직접 접수/동시 세션과 새 사진 업로드·선택 동의→Field worker `copied`→사업자 인증 다운로드, 320px 가로 넘침 없음/page error 0. 이후 Field 사업자 320px 이미지 표시·상태·저장 링크를 같은 명령으로 추가 검수해 전체 1/1 재통과했다. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `check_package.py`는 `document_package_only` 통과(서비스 QA 아님). Git 없음.
- **실패한 접근:** Field DB 테스트의 새 변수 이름이 기존 이름과 충돌하여 첫 tsx 변환이 실패했고 이름을 분리했다. AP DB 테스트는 해제 뒤 OAuth token 자체가 폐기되므로 기대한 404 대신 401을 반환해 실제 권한 계약에 맞게 검수 기대를 수정했다. 실제 HTTP 두 번은 검사 스크립트가 Field 외부 요청 ID를 SELECT하지 않아 다운로드 경로에 `undefined`를 사용했다. SELECT를 수정하고 양방향 전체 검사를 두 번 다시 통과했다. 업무 실패나 공급사 성공으로 오인하지 않았다.
- **남은 작업:** 실 S3/HEIC·악성코드 검사/보존·revoke 경쟁과 장기 장애·사진 복사 운영 재조정, I04의 실모델 응답 중 사람 인계와 route 전환/AP 결과 조회, I05/I06~I08, AP/Field 실 인증/모델/알림/결제/DNS/TLS, 사용자 디자인/접근성 검토, 정식 QA/G/R02. 실제 고객 메시지 발송·청구·운영 배포/데이터 삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 현재 전체 mock 세션 11480의 두 `/health/ready`를 확인한 뒤 이어서 작업한다. 재기동은 해당 세션만 정상 종료한 후 한다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·QA·검수 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:contracts
pnpm test:db:agent
pnpm test:db:field
FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A05/I04 상담 링크 직접 사람 접수·동시 세션 (2026-09-25)

- **현재 목표:** v3.0·`reference`에 따라 AP/Field 독립 기능을 로컬에서 실제 사용 가능한 환경까지 완성한다. 사용자 화면 시각 검토는 기능 구현의 대기 조건이 아니다. `TASKS.md`는 46개 중 implemented 1·in_progress 35·planned 10·verified 0; A05/I04는 `in_progress`다.
- **완료 작업:** 고객이 AP 상담 링크에서 AI 버튼을 누르지 않고 사람 문의를 제출해도 활성 배포의 상담 세션/원본 ID에 접수하며, 같은 화면의 연결된 Field 외부 요청까지 이어진다. AI 질문과 사람 제출이 거의 동시에 세션을 시작할 때 초기 현재 세션 조회·생성 promise와 원본을 공유한다. 사람 접수 후 늦은 AI 응답의 409에는 AI가 표시되지 않았다고 알린다. 배포 없는 AP 조직 `/public/{id}` 직접 문의는 자체 경로를 유지한다.
- **수정 파일:** `apps/agent-web/src/agent-public.tsx`, `tools/spikes/agent-field-same-page-browser.py`, `tools/spikes/ap-field-connection-http.test.mjs`, `docs/01_AGENT_PLATFORM_PRD.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 인수인계와 재생성 마스터. AP/Field API·DB schema·공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 상담 배포 `publicId`가 있으면 AI 사용 여부와 무관하게 사람 접수 전에 같은 세션을 확보한다. 동시 버튼은 하나의 진행 중 세션 생성 약속을 기다린다. `publicId`가 없으면 기존 AP 직접 문의를 보낸다. 세션 조회/시작이 실패하면 입력을 보존하고 실패를 표시하며 다른 배포로 조용히 우회하지 않는다. Field 동의와 전송은 기존 별도 ActionRequest 절차를 사용한다.
- **실제 검사/환경/커밋:** 기존 빌드에서 `FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http`는 AI 미사용 직접 접수 뒤 Field 패널 부재로 red(exit 1)였다. 새 `pnpm mock:run` 세션 **94753**에서 AP/Field API·웹 build, 네 서버 ready. 같은 실제 양방향 HTTP/Chromium 320px fixture는 AI 실패 대체·직접 접수·지연된 세션 생성 중 AI/사람 동시 제출의 세 경로에서 AP 배포 귀속/동의, Field 외부 문의의 동일 원본 ID, 세션 POST 1회, 가로 넘침 없음/page error 0을 확인해 1/1 green. `pnpm test:db:agent` 15개 파일 18/18, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. `build_report.py` exit 0·`check_package.py`는 `document_package_only` 통과(서비스 QA 아님). 실모델 공급사는 설정하지 않았고 브라우저의 AI 요청은 실제 503이었다. Git 없음.
- **실패한 접근:** 기존 웹은 `placementId`가 있을 때만 사람 제출 전에 상담 세션을 시작했다. 일반 link 직접 제출은 AP의 배포 없는 직접 문의가 되어 Field 연결 패널이 비었고, 새 브라우저 검사가 이를 재현했다. 세션 확보를 모든 활성 상담 `publicId`에 적용하고 AI/사람 시작을 공유해 재검수했다.
- **남은 작업:** 고객이 실모델 응답 생성 중일 때의 실제 화면 인계 검수, I04 첨부 인증 복사·전달 실패 상태, route 전환/운영 장애와 실모델·발송·PG/DNS/TLS·정식 QA/G. C03 시각/접근성 검토와 전체 출시 판정도 남는다.
- **다음 에이전트 정확한 명령:** 세션 94753이 실행 중이면 새 mock을 중복 시작하지 않는다. 다음 Task의 경로·요구/QA·검사를 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 이번 흐름을 다시 검수할 때 아래 명령을 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm test:db:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I04 AP 상담 화면의 Field 문의 이어가기 (2026-09-25)

- **현재 목표:** v3.0·`reference` 기준 AP/Field의 독립 기능을 로컬에서 사용할 수 있게 끝까지 연결한다. 화면 시각 검토는 기능 구현의 대기 조건이 아니다. `TASKS.md` 46개 중 implemented 1·in_progress 35·planned 10·verified 0이며 I04는 `in_progress`다.
- **완료 작업:** 모델/예산이 없는 AP 상담 링크에서도 익명 원본을 생성하고 AI 메시지는 실제 503 상태로 둔다. 실패 질문은 수정 가능한 사람 문의 초안에 남긴다. 고객 동의 접수 뒤 같은 AP 원본 ID·link 배포 귀속·확인키를 사용해 같은 화면의 Field 외부 요청을 연다. 고객이 Field 현재 조건/전달 내용을 확인하고 별도 동의한 일반 문의는 “사업자 응답 대기”로 구분한다. Field에는 허용된 요청 요약/원본 ID만 전달한다.
- **수정 파일:** `apps/agent-api/src/customer-consultations.ts`, `apps/agent-api/test/customer-consultations.db.test.ts`, `apps/agent-web/src/agent-public.tsx`, `apps/agent-web/src/agent-field-action.tsx`, `tools/spikes/ap-field-connection-http.test.mjs`, 신규 `tools/spikes/agent-field-same-page-browser.py`, `docs/01_AGENT_PLATFORM_PRD.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 인수인계와 재생성 마스터. DB schema와 제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 상담 세션 생성은 모델 공급사와 분리하지만 실제 AI 메시지는 기존 공급사/예산 검사로 차단한다. 그래서 공급사 미설정이 사람 접수와 활성 배포의 Field 연결을 끊지 않는다. 고객 동의 전에는 Field로 전송하지 않으며 AP 원문을 복제하지 않는다. 미연결 AP 문의는 기존대로 Field 패널을 표시하지 않는다. Field 일반 문의 수락과 예약 확정의 문구를 구분한다.
- **실제 검사/환경/커밋:** 모델 없는 원본 생성은 503 red였고 수정 후 AP 집중 DB 1/1·전체 AP DB 15개 파일 18/18 green. 새 `pnpm mock:run` 세션 **64953**에서 AP/Field API·웹 build와 네 서버 ready. `FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1은 실제 PostgreSQL 17 두 개·Field Valkey·Chromium 320px에서 AI 503→질문 보존→같은 AP 원본의 사람 접수→Field 현재 조건/별도 동의/일반 문의 수락, 양쪽 DB ID 대응·가로 넘침 없음/page error 0을 확인했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:contracts`(정적 2/2·DB 5/5), `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. `build_report.py` exit 0, `check_package.py`는 `document_package_only` 통과(서비스 QA 아님). Git 없음.
- **실패한 접근:** 첫 브라우저 fixture는 상담 link 대신 `owned_embed` 배포로 `/consult`를 열어 404였다. 별도 link를 발급하고 OAuth 허용 배포에 포함했다. 그다음 모델/예산 선차단으로 세션 생성이 503인 제품 문제를 찾아, 메시지 응답 차단은 유지하면서 원본 생성을 허용했다. 브라우저 테스트의 연락처 label 중복, 성공 문구 중복, status 접근성 이름 가정은 정확한 selector로 수정해 전체 흐름을 재실행했다.
- **남은 작업:** 실모델이 응답 중일 때 사람 인계와 Field 전달의 경쟁, 첨부 인증 복사, route 전환·AP 처리 결과 조회, revoke/장애, 실모델·고객 알림·실 PG/DNS/TLS와 운영 독립성·정식 QA139~145/148~149/153/155/G-I1~I2. C03의 사용자 시각/접근성 검토와 나머지 전체 출시 gate도 미검수다.
- **다음 에이전트 정확한 명령:** 세션 64953이 살아 있으면 중복 mock을 띄우지 않는다. 새 Task 범위·QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 이번 단계 결과를 재검수하거나 다음 I04 작업을 시작할 때 아래 명령을 사용한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:db:agent
FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:contracts
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C02 AP/Field 실제 단독 검수 명령 (2026-09-25)

- **현재 목표:** v3.0·`reference` 기준 AP/Field의 독립 기능을 실제 사용 가능한 로컬 환경까지 완성한다. 화면 시각 검토는 기능 구현의 대기 조건이 아니다. `TASKS.md` 46개 중 implemented 1·in_progress 35·planned 10·verified 0; C02는 계속 `in_progress`다.
- **완료 작업:** 문서의 `pnpm test:independence:agent`와 `:field` placeholder를 실제 로컬 단독 검수로 교체했다. 반대 compose 컨테이너/포트가 남아 있으면 비파괴적으로 실패한다. 각 명령은 자기 DB·인증/Field 큐 설정만 API 자식에게 전달하고 자기 migration·API/웹 build→실제 웹 프록시 가입·조직·체험·승인·직접 업무를 실행한다. AP는 고객 문의/답변/JSON 기록과 SDK, Field는 사이트 공개·문의/답변·예약/JSON 기록을 확인한다. 합성 계정·API/웹 자식은 정리하고 DB 볼륨은 유지한다.
- **수정 파일:** `tools/run-independence.mjs`, `tools/spikes/independence-flow.mjs`, `tools/test/independence-runner.test.mjs`, 루트 `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 인수인계. API·DB migration·제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 검수 명령은 사용 중인 반대 제품을 자동 중지하지 않는다. 사전 검사에서 Docker project와 반대 API/웹/DB·Field Valkey 포트를 확인한다. API 자식 환경은 allowlist이며 제품 간 OAuth connector·상대 DB·모델 secret을 전달하지 않는다. 명령은 로컬 mock 코어 경로만 검사하므로 실모델·실발송·PG·DNS/TLS나 OS 수준 egress ACL을 통과했다고 표시하지 않는다.
- **실제 검사/환경/커밋:** 두 명령 기존 exit 2 red; runner 단위 모듈 부재 red→2/2 green. 전체 mock 세션 43113을 종료하고 Field DB·Valkey를 `docker compose ... stop`한 상태에서 AP 단독 명령 exit 0, AP DB도 stop한 상태에서 Field 단독 명령 exit 0. 각각 실제 자기 PostgreSQL 17·Field Valkey(해당 시), API/웹 build·HTTP 업무를 수행했다. 초기 AP 검사 503 오류 코드 기대 불일치와 초기 Field 검사 합성 사이트 공개본 FK 정리 순서 실패는 수정 후 전체 재실행 green. 실패 뒤 남은 Field 합성 계정 1명은 정확한 email/조직을 조회해 사이트→체험→조직→계정 순으로 트랜잭션 정리했다. 최종 AP/Field 합성 계정 각 0명. 전체 mock 재기동 세션 **98257**, 양쪽 `/health/ready` ready. 전체 suite가 떠 있는 상태에서 Field 독립 명령은 반대 컨테이너 감지로 exit 1, 기존 양쪽 서버 ready 유지. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(tools 7/7 포함), import·DB credential 격리 exit 0. `build_report.py` exit 0·`check_package.py` `document_package_only` 통과(서비스 QA 아님). Git 없음.
- **실패한 접근:** 첫 AP flow는 실제 503 `paid_checkout_not_configured`를 일반 `blocked_integration`으로 기대했다. 첫 Field flow는 조직 삭제 전 사이트 공개본을 지우지 않아 FK 23503으로 실패했다. 현재 테스트는 실제 503 의미와 FK 순서에 맞고, 정리가 완료돼야 성공을 출력한다.
- **남은 작업:** 실 공급사 AI/알림·유료 구독/PG·실 DNS/TLS·독립 OS/서버 네트워크 ACL·백업/복구·전체 QA121~124/G-A1/G-F1는 미검수다. C02의 AP 전용 큐/CI도 남는다. 표준 fault/E2E/security 명령과 C03 시각/접근성·전체 R02도 남는다. 이번 로컬 검사를 제품 전체 `verified`/출시로 표시하지 않는다.
- **다음 에이전트 정확한 명령:** 현재 전체 mock 세션 98257의 상태를 먼저 확인한다. 독립 명령을 다시 실행할 때는 세션 98257만 Ctrl+C로 종료하고 아래 순서로 반대 compose를 `stop`한다. 끝나면 전체 mock을 다시 기동한다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·QA·명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
# 독립 명령 재검사가 필요한 경우, 실행 중인 mock:run 세션을 Ctrl+C로 종료한 뒤:
docker compose --project-name fieldai-field-mock --env-file infra/field/.env -f infra/field/compose.mock.yaml stop
pnpm test:independence:agent
docker compose --project-name fieldai-agent-mock --env-file infra/agent/.env -f infra/agent/compose.mock.yaml stop
pnpm test:independence:field
pnpm mock:run
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F07/F09 Field 예약 한 건의 정리 기록 (2026-09-25)

- **현재 목표:** v3.0·`reference` 기준 AP/Field 독립 기능을 실제 사용할 수 있는 로컬 환경으로 완성한다. 사용자 화면 시각 검토는 기능 구현의 대기 조건이 아니다. `TASKS.md` 46개 중 implemented 1·in_progress 35·planned 10·verified 0이며 F07/F09는 여전히 `in_progress`다.
- **완료 작업:** Field owner가 자기 조직의 기존 예약 한 건을 `/v1/owner/reservations/:id/export`에서 JSON으로 다운로드한다. 예약 스냅샷, revision 순서 사건, Field 알림 기록, 허용된 AP 출처 메타데이터만 포함한다. 무인증/타 조직을 거부하고 mock 체험 만료 뒤에도 기존 예약을 내보낸다. 사업자 예약 상세 링크를 연결했다. AP 원본 대화·고객 확인키 hash·OAuth 비밀은 포함하지 않는다.
- **수정 파일:** `apps/field-api/src/{reservation-export,app}.ts`, `apps/field-api/test/{subscription,integrator}.db.test.ts`, `apps/field-web/src/field-booking.tsx`, `tools/spikes/{subscription-http.test.mjs,subscription-browser.py}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 인수인계와 재생성 마스터. DB migration·제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** owner membership과 요청 조직을 Field DB에서 검사한다. 한 repeatable-read/read-only snapshot 안에서 내보낼 필드만 명시 선택한다. Field 자체 알림 원장 상태를 있는 그대로 제공하며 AP 고객 발송/열람 성공으로 추정하지 않는다. 다운로드는 한 예약의 정리 기록으로 전체 계정/사진 아카이브·보존/복구 정책을 대체하지 않는다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PostgreSQL 17·Field Valkey. 기존 예약/외부 AP 예약 DB 두 검사는 신규 경로 404 red, 구현 후 관련 3/3·`pnpm test:db:field` 10개 파일 17/17 green. `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. `pnpm mock:run` 새 빌드/기동 세션 **43113**에서 양쪽 API·웹 build가 통과했다. `FIELD_SUBSCRIPTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:subscription:http` 1/1은 실제 웹 프록시 예약 접수→mock 만료→JSON 다운로드·교차 제품 세션 401과 320px 사업자 화면의 파일 다운로드를 확인했다. 양쪽 API ready, 합성 계정 잔여 각 0명. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0·`check_package.py` `document_package_only` 통과(서비스 QA 아님). Git 없음.
- **실패한 접근:** 첫 실제 브라우저 실행은 Field 작업 화면으로 이동한 뒤 이전 구독 화면의 문구를 기다린 검수 스크립트 순서 오류로 non-zero였다. 문구 확인을 이동 앞으로 옮긴 뒤 전체 HTTP/브라우저 1/1 green을 얻었다. API나 데이터 실패가 아니었다.
- **남은 작업:** 전체 계정/첨부 파일 아카이브·실보존/복구/운영실, 실구독/PG와 모델·메시지·DNS/TLS·사진 공급사, C03 사용자 시각/접근성 검토, 표준 독립/장애/E2E/보안 명령과 QA/G/R02는 미완료다. 이번 export를 F09 전체 완료나 출시 승인으로 표시하지 않는다.
- **다음 에이전트 정확한 명령:** 전체 mock 세션 43113 상태 확인 후 작업한다. 새 빌드/재기동이 필요하면 해당 세션만 Ctrl+C로 종료한다. 다음 Task 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·요구/QA·검사 명령을 적는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:db:field
FIELD_SUBSCRIPTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:subscription:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C01/C02 표준 DB·공개 계약 검사 명령 (2026-09-25)

- **현재 목표:** v3.0·`reference` 기준 AP/Field 독립 기능과 연결을 실제 사용할 수 있는 로컬 환경으로 완성한다. 화면 시각 검토는 기능 작업을 막지 않는다. `TASKS.md` 46개 중 implemented 1·in_progress 35·planned 10·verified 0. 이번 C01/C02 부분 검수도 `in_progress`다.
- **완료 작업:** 문서 필수 명령 `pnpm test:db:agent`, `pnpm test:db:field`, `pnpm test:contracts`의 placeholder를 실행 가능한 검사로 바꿨다. 제품별 DB 명령은 자기 migration과 자기 제품의 모든 `*.db.test.ts`를 자동 발견해 실행하며 상대 제품 환경변수를 child에서 제거한다. 계약 명령은 AP/Field 공개 OpenAPI 정적 검사와 AP/Field integrator 제공자·양쪽 연결·AP Field Action 소비자 DB 검사를 실행한다. 매체 슬롯 테스트의 전역 개수 가정을 자기 매체의 정확한 slot ID 검사로 수정했다.
- **수정 파일:** `tools/run-db-suite.mjs`, `package.json`, `apps/agent-api/test/placements.db.test.ts`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 인수인계. 제품 API·DB migration·공개 계약 형식 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 새 DB 테스트가 추가되면 `test:db:*`에서 빠지지 않도록 이름 패턴으로 찾는다. child의 상대 제품 `FIELD_` 또는 `AP_` 변수를 제거하되 테스트는 각자 자기 `infra/<product>/.env`를 읽는다. 계약 검사는 현존 구현의 정적·DB provider/consumer 부분만 담당하며 전체 fault/E2E/실공급사 계약을 포함하지 않는다. 실패는 그대로 non-zero로 전파한다.
- **실제 검사/환경/커밋:** 세 placeholder가 각각 exit 2인 red를 확인. 로컬 제품별 PostgreSQL 17·Field Valkey 환경에서 `pnpm test:db:field` 10개 파일·17/17. `pnpm test:db:agent` 첫 실행은 17/18 fail non-zero, 테스트 가정 수정 뒤 15개 파일·18/18. `pnpm test:contracts` OpenAPI 정적 2/2+DB 제공자/소비자 5/5 exit 0. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 두 API `/health/ready` 응답. 기존 전체 mock 세션 **31010**은 서비스 코드 변경이 없어 재기동하지 않았다. 이 문서 갱신 후 분할 문서 마스터 재생성·패키지 검사 명령은 아래와 같다. Git 없음.
- **실패한 접근:** AP 전체 DB 첫 실행에서 `placements.db.test.ts`가 모든 매체의 활성 slot 수를 2로 가정해 3을 받았다. 공개 슬롯 API는 전체 활성 매체를 보여주므로 코드 동작 오류가 아니며, 해당 합성 매체의 정확한 두 슬롯을 검사하도록 고쳐 전체 green을 얻었다. 실패를 skip하거나 서비스 기대 동작을 바꾸지 않았다.
- **남은 작업:** `test:independence:*`, `test:integration:faults`, 제품별 E2E·보안 등 나머지 표준 명령은 여전히 placeholder다. C01 전체 버전·오류 계약 및 소비자 호환, C02 실제 상대 DB/비밀값/서버 없는 독립 실행·AP 전용 큐·ACL/백업/CI, 공급사·요금/PG·도메인/실모델·전체 QA/G/R02도 미검수다.
- **다음 에이전트 정확한 명령:** 전체 mock 세션 31010의 준비 상태를 먼저 확인한다. 현재 세션이 실행 중이면 중복 `pnpm mock:run`을 시작하지 않는다. 다음 작업 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·QA·검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:db:agent
pnpm test:db:field
pnpm test:contracts
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A07/F09 mock 체험 만료의 신규 업무 제한 (2026-09-25)

- **현재 목표:** v3.0·`reference` 기준 AP/Field 독립 기능을 로컬에서 실제 사용할 수 있게 연결한다. 화면 시각 검토는 기능 작업의 대기 조건이 아니다. `TASKS.md`는 46개 중 implemented 1·in_progress 35·planned 10·verified 0이며 A07/F09는 여전히 `in_progress`다.
- **완료 작업:** 로컬 mock의 자기 제품 trial 종료 시 새 AP 직접 문의·상담/AI·배포·지식/AI/홍보 공개, 새 Field 직접 문의·공개/외부/수동 예약·사이트/제작 AI를 403 `trial_ended`/`cleanup_only`로 제한했다. 기존 멱등 제출 영수증, 문의·예약 열람/답변/확정·기록 내보내기·연결 해제 경로는 유지했다. Field 외부 요청 공개 계약에 종료 오류를 명시하고 AP ActionRequest가 이를 재인가 실패와 구별해 `field_subscription_ended`로 저장한다. 제품별 종료 화면과 고객 제출 오류 문구를 연결했다.
- **수정 파일:** `apps/agent-api/src/{trial-access,inquiries,deployments,customer-consultations,business,agents,campaigns,placements,field-actions}.ts`, `apps/agent-api/test/{subscription,field-actions}.db.test.ts`; `apps/field-api/src/{trial-access,inquiries,bookings,sites,site-generation,business}.ts`, `apps/field-api/test/subscription.db.test.ts`; `apps/agent-web/src/{agent-subscription,agent-public,agent-field-action}.tsx`, `apps/field-web/src/{field-subscription,field-public,field-booking}.tsx`; `contracts/field-integrator-v1.openapi.json`, `tools/test/field-integrator-contract.test.mjs`, `tools/spikes/{subscription-http.test.mjs,subscription-browser.py}`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 인수인계, 재생성 마스터. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 현재 체험과 제한은 mock만 적용한다. 자기 DB의 `ends_at`만 보고 상대 제품 구독·DB를 참조하지 않는다. trial 원장이 없는 기존 조직은 이전 동작을 유지한다. 기존 수락 업무의 같은 키 replay를 신규 요청 제한보다 먼저 판단한다. 기존 고객/사업자 정리와 법정 보존 접근을 체험 종료로 폐기하지 않는다. 실구독·정리 기간·가격/PG는 미승인 상태다.
- **실제 검사/환경/커밋:** AP/Field 만료 DB에서 새 접수 예상 403 대비 201 red→green. 기존 AI 대화 신규 사람 접수와 AP 원본 신규 Field ActionRequest도 201 red→403 green. Field 계약 검사 403 설명 부재 red→green, AP 소비자 DB의 `field_reauthorization_required` red→`field_subscription_ended` green. 로컬 제품별 PostgreSQL 17·Field Valkey에서 AP 영향 DB 11/11·Field 영향 DB 13/13·마지막 AP 상담/배포/embed/Field Action 회귀 6/6·Field 계약 1/1. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 새 `pnpm mock:run` 재빌드/기동 세션 **31010**에서 두 API `/health/ready`와 두 `/workspace/subscription` HTTP 200. `FIELD_SUBSCRIPTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:subscription:http` 1/1은 두 별도 계정/조직·승인 정보·체험 시작/종료 예약/만료→실제 웹 proxy 신규 문의 403, 320px 종료 안내/가로 넘침 없음/page error 0을 마지막 빌드에서 재확인했다. 합성 계정 잔여 AP/Field 각 0명을 조회했다. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0·`check_package.py`는 `document_package_only` 통과(서비스 QA 아님). Git 없음.
- **실패한 접근:** 첫 HTTP 만료 fixture는 `ends_at`만 과거로 바꿔 DB의 `ends_at > started_at` 제약에 걸렸다. 시작/종료/취소 시각을 함께 15일 이동해 통과했다. DB 접수 fixture에서 PoolClient를 Pool처럼 사용해 내부 `.connect()`가 실패한 것도 실제 Pool을 가진 별도 fixture로 수정했다. 기존 업무·사용자 데이터를 삭제하지 않았다.
- **남은 작업:** 실제 승인 plan version·가격/세금 동의·PG 청구 원장/갱신/해지/환불·크레딧/초과 한도·실운영 정리/보존 정책, 전체 계정/사진 아카이브·운영 복구, 실모델/발송/도메인/인증 공급사와 독립 서버·QA/G·R02. 현재 mock 구현을 운영 승인이나 QA42~46 전체 통과로 표시하지 않는다.
- **다음 에이전트 정확한 명령:** 현재 전체 mock 세션 31010을 상태 확인한다. 새 실행 전 해당 세션만 Ctrl+C로 정상 종료한다. 다음 기능 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·QA·검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:subscription:agent
pnpm test:spike:subscription:field
pnpm test:spike:field-actions:agent
node --test tools/test/field-integrator-contract.test.mjs
FIELD_SUBSCRIPTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:subscription:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A07/F09 제품별 카드 없는 mock 체험 (2026-09-25)

- **현재 목표:** v3.0·`reference` 디자인 기준 AP·Field 독립 기능과 연결을 실제 사용 가능한 환경까지 구현한다. 화면 시각 검토는 기능 작업을 멈추지 않는다. `TASKS.md` 46개 중 implemented 1·in_progress 35·planned 10·verified 0이며 A07/F09도 `in_progress`다.
- **완료 작업:** 제품별 `trial_subscriptions` PG 원장, 자기 세션·membership으로만 조회하는 `GET /v1/subscription`, owner의 명시 동의 `POST /trial`과 종료 예약 `POST /cancel`, 유료 `POST /checkout`의 `blocked_integration` 503을 만들었다. 로컬 mock에서 조직별 1회 14일 체험·중복 시작 같은 ID·만료 후 재시작 차단, 종료 예약 뒤 기간 유지, 다른 제품 세션 401을 구현했다. 두 제품 `/workspace/subscription` 화면·사용량 화면 진입 링크를 연결했다. 운영 가격/PG·자동 결제 성공을 만들지 않았다.
- **수정 파일:** AP `apps/agent-api/migrations/000046_trial_subscriptions.sql`, `src/{subscription,app}.ts`, `test/subscription.db.test.ts`, `apps/agent-web/src/agent-subscription.tsx`, `app/workspace/subscription/page.tsx`, `agent-usage.tsx`; Field `apps/field-api/migrations/000040_trial_subscriptions.sql`, `src/{subscription,app}.ts`, `test/subscription.db.test.ts`, `apps/field-web/src/field-subscription.tsx`, `app/workspace/subscription/page.tsx`, `field-usage.tsx`; `tools/spikes/{subscription-http.test.mjs,subscription-browser.py}`, `package.json`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, 이 인수인계와 재생성 마스터. 제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 14일은 승인 전 제안값이라 `AP_PROFILE=mock`/`FIELD_PROFILE=mock`에서만 시작한다. 별도 제품 DB의 unique organization과 DB 시각으로 한번만 시작하며 카드/금액/청구 데이터는 저장하지 않는다. 비 mock 시작과 모든 유료 checkout은 503이고, 연결 승인만으로 구독이 생기지 않는다. 현재 체험 상태는 실제 신규 업무 권한을 제한하지 않으며 기존 문의/예약 정리 접근도 그대로다.
- **실제 검사/환경/커밋:** 신규 API 경로 각 404 red→`pnpm test:spike:subscription:agent`와 `:field` 각 DB 1/1 green. 두 검사는 무인증 401·타 조직 404·role 제한·명시 동의·14일/만료·중복·종료 예약 멱등·비 mock 원장 미생성·유료 503을 확인한다. 로컬 AP/Field PG17·Field Valkey 전체 `pnpm mock:run`을 새 세션 **26764**에서 기동했다. 새 빌드에서 `FIELD_SUBSCRIPTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:subscription:http` 1/1: 각자 실제 가입/조직→320px 화면에서 동의 체크·시작 버튼 클릭→DB 상태, 웹 proxy·교차 쿠키 401·유료 503·종료 예약, page error 0/가로 넘침 없음을 확인했다. 합성 계정 잔여 0명. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 양쪽 API/웹 build, 기존 사용량 실제 HTTP 1/1, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 마지막 `/health/ready` 양쪽 ready, 두 `/workspace/subscription` HTTP 200. `build_report.py` exit 0·`check_package.py`의 `document_package_only` 통과(서비스 QA 아님). Git 없음.
- **실패한 접근:** 신규 route 부재에서 두 DB 검사는 404였다. 구현 후 각각 통과. 실유료 정책/PG 부재를 성공 mock으로 대체하지 않았다. 고객/운영 데이터 삭제 없음.
- **남은 작업:** A07/F09 승인 plan version·세금/동의·실 PG 결제/청구 기간 유일 원장/timeout 대조·갱신/해지/환불·크레딧/초과 한도, 체험 만료 후 신규 업무 제한과 기존 원본/예약 정리 모드, 전체 계정 export/보존/복구·관리자 운영, C03 시각/접근성, 실제 공급사/도메인·보안/독립/출시 QA/G 및 R02. 이번 mock 체험을 운영 승인이나 QA42~46 전체 통과로 표시하지 않는다.
- **다음 에이전트 정확한 명령:** 현재 전체 mock 세션 26764를 상태 확인한 뒤 이어서 작업한다. 재기동은 그 세션을 정상 종료한 후 한다. 다음 기능 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·QA·검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
pnpm test:spike:subscription:agent
pnpm test:spike:subscription:field
FIELD_SUBSCRIPTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:subscription:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm build:web:agent
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A07/F09 제품별 사용량 API·화면 (2026-09-25)

- **현재 목표:** v3.0·`reference` 디자인 기준 AP·Field 독립 기능과 연결을 실제 사용 가능한 환경까지 구현한다. 화면 시각 검토는 기능 작업을 멈추지 않는다. `TASKS.md` 46개 중 implemented 1·in_progress 35·planned 10·verified 0이다. A07/F09는 사용량 부분 구현으로 `in_progress`이며 최종 출시/인수는 남는다.
- **완료 작업:** 두 제품에 자기 세션/membership·DB 범위의 `/v1/usage/summary`와 `/workspace/usage`를 연결했다. AP는 이번 UTC 월 고객 AI/사업자 테스트 완료·공급사 응답과 토큰의 채널별 합계, 사람 문의와 Field 전달 수락/미상을 표시한다. Field는 제작 AI 작업/기록된 모델 토큰, 직접 문의와 공개/수동/AP 외부 예약 출처를 표시한다. provider response ID 및 양쪽 토큰이 있는 호출만 토큰 합계에 넣는다. 실제 작업 화면에 진입 링크를 추가했다. 청구액·가짜 결제 성공을 만들지 않는다.
- **수정 파일:** `apps/agent-api/src/{usage,app}.ts`, `apps/agent-api/test/usage.db.test.ts`, `apps/field-api/src/{usage,app}.ts`, `apps/field-api/test/usage.db.test.ts`, `apps/agent-web/src/agent-usage.tsx`, `apps/agent-web/src/app/workspace/usage/page.tsx`, `apps/agent-web/src/workspace.tsx`, `apps/field-web/src/field-usage.tsx`, `apps/field-web/src/app/workspace/usage/page.tsx`, `apps/field-web/src/field-workspace.tsx`, `tools/spikes/{usage-http.test.mjs,usage-browser.py}`, 루트 `package.json`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, 이 인수인계. DB migration과 제품 간 공개 HTTP 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 제품마다 자기 원본 테이블만 읽는다. UTC 월 시작/끝을 응답에 명시하고 소유 조직을 membership으로 먼저 확정한다. 모델 호출 중 응답/토큰이 기록된 것만 원가 분석용 사용량으로 보여주되 이를 가격·크레딧·청구로 해석하지 않는다. AP 사업자 테스트 토큰과 고객 상담 토큰을 별도 집계한다. 두 화면은 401/404/응답 실패를 구분하며 데이터를 브라우저 원장으로 저장하지 않는다.
- **실제 검사/환경/커밋:** 신규 AP·Field API 각 404 red→`pnpm test:spike:usage:agent` 1/1·`:field` 1/1 green. 두 조직 격리 fixture의 무인증 401·타 조직 404, 전월 제외, 실패 호출 토큰 제외, AP 채널별/Field 예약 출처별 수치, `private,no-store`와 청구액 비노출을 확인했다. 로컬 AP/Field PG17·Field Valkey의 새 API/웹을 전체 `pnpm mock:run` 세션 91403으로 실행 중이다. `FIELD_USAGE_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:usage:http` 1/1은 실제 두 계정/조직·공개 문의→각 웹 프록시 사용량·교차 제품 쿠키 401·320px 작업 화면→사용량 화면 1건·가로 넘침 없음/page error 0을 검수했다. 합성 계정 잔여 AP/Field 각 0명. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 양쪽 API/웹 build, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0·`check_package.py`는 `document_package_only` 통과(서비스 테스트 아님). Git 없음.
- **실패한 접근:** 신규 경로가 없던 첫 API 검사는 각 404였다. 구현 뒤 위 검사 통과. 가격/PG 데이터가 없으므로 임의 금액이나 결제 성공을 넣지 않았다. 이번 범위에서 고객/운영 데이터 삭제 없음.
- **남은 작업:** A07/F09의 독립 plan version 승인·체험·실구독/갱신/해지·크레딧/초과 한도·정리 모드·공급사 unknown/환불/원가 대조, 사용량 UI 강제 503 및 정식 독립 QA, 전체 C03 시각/접근성 검토·운영 환경/출시 게이트. AP·Field 알림/인증/모델·S3/DNS/TLS와 전체 R02도 남는다. 이번 사용량 검사를 `verified`/출시 승인으로 올리지 않는다.
- **다음 에이전트 정확한 명령:** 현재 전체 mock이 떠 있으므로 먼저 상태를 확인한다. 재기동은 실행 중인 세션을 정상 종료한 뒤 수행한다. 다음 기능 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 변경 범위·QA·검사 명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -fsS http://localhost:3001/workspace/usage
curl -fsS http://127.0.0.1:3002/workspace/usage
pnpm test:spike:usage:agent
pnpm test:spike:usage:field
FIELD_USAGE_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:usage:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm build:web:agent
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C02/I00 로컬 전체 mock 양방향 connector 준비 (2026-09-25)

- **현재 목표:** v3.0·`reference` 기준으로 AP/Field 독립 기능과 공식 연결을 실제 사용할 수 있는 환경까지 구현한다. 화면 시각 검토는 기능 작업의 대기 조건이 아니다. `TASKS.md` 46개 중 implemented 1·in_progress 34·planned 11·verified 0이다. 이번 C02/I00도 `in_progress`이며 전체 출시/인수는 남는다.
- **완료 작업:** 전체 `pnpm mock:run`이 두 제품의 자체 compose/migration/API·웹 build 뒤 두 API를 임시 기동해 기존 AP/Field 로컬 OAuth client 도구를 순서대로 실행하고, 새 환경 설정으로 최종 API·웹·구성된 사건 worker를 시작한다. 신규 Field mock env의 OAuth 웹 origin은 AP와 다른 `127.0.0.1:3002`다. 제품별 단독 실행은 반대 제품 client 준비를 건너뛴다. Owner별 조직 연결/동의는 화면에서 그대로 수행한다.
- **수정 파일:** `tools/mock-run.mjs`, `tools/setup-mock-env.mjs`, `tools/test/mock-run.test.mjs`, `tools/spikes/mock-connector-bootstrap.test.mjs`, `package.json`, `README.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/CODEX_HANDOFF.md`. 제품 API/웹 업무 코드·DB migration·공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** OAuth client 생성은 두 제품의 공개 OAuth endpoint를 사용하는 기존 mock 전용 등록 도구를 재사용한다. 임시 API를 종료한 뒤 `.env`를 새로 읽는 최종 API를 기동한다. local issuer/DB 경계와 각 제품별 비밀값 파일 권한을 유지한다. 전체 실행만 두 제품을 연결 준비하며 실제 grant/scope는 자동 발급하지 않는다.
- **실제 검사/환경/커밋:** 새 Field env 웹 origin 누락 unit red→2/2 green. 실제 로컬 두 PG17·Field Valkey에서 새 전체 `pnpm mock:run` 임시 AP/Field API readiness·기존 client 설정 검사·최종 재기동, 양쪽 `/health/ready`·OAuth issuer·`/workspace` HTTP 200. `FIELD_EVENT_WORKERS_RUNNING=1 pnpm test:spike:ap-field:http` 1/1. AP-only는 AP API/웹 200·Field API/웹 미기동, Field-only는 반대로 200·AP API/웹 미기동; 각 Ctrl+C 뒤 재기동 가능했고 전체 suite 세션 33894로 다시 실행 중이다. `pnpm test:spike:mock-connectors` 1/1은 별도 임시 owner-only env에서 실제 AP/Field OAuth API에 새 client를 등록하고 해당 합성 owner/client를 cascade 정리했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0·`check_package.py`는 `document_package_only` 통과(서비스 테스트 아님). 신규 빈 DB·볼륨의 전체 runner 최초 시작은 실행하지 않았다. 단독 검사에 반대 제품 DB 컨테이너와 기존 connector credential은 남아 있어 정식 무배포 독립 QA는 아니다. Git 없음.
- **실패한 접근:** Field 신규 env에는 OAuth 웹 origin이 없어 첫 단위 검사가 red였다. 첫 실행 env 생성에 `127.0.0.1:3002`를 넣고 통과했다. 런타임 전체 연결 검사에서 실패는 없었다. 기존 제품/고객 데이터를 삭제하지 않았다.
- **남은 작업:** 신규 빈 DB/볼륨의 전체 runner 최초 시작, 실제 상대 DB·secret 제거 독립 검수, mock 기동 중단/부분 설정 실패 복구, AP 전용 큐·운영 ACL/백업/CI, 실제 인증/모델/메시지·결제/DNS/TLS, 공식 QA/출시 게이트. 이 로컬 mock은 `verified`나 운영 출시가 아니다.
- **다음 에이전트 정확한 명령:** 현재 전체 suite가 떠 있으므로 우선 상태를 확인한다. 새로운 `pnpm mock:run`은 현재 suite를 정상 종료한 뒤 실행한다. 새 기능 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위·QA·명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -fsS http://localhost:3001/workspace
curl -fsS http://127.0.0.1:3002/workspace
FIELD_EVENT_WORKERS_RUNNING=1 pnpm test:spike:ap-field:http
pnpm test:spike:mock-connectors
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C02/C03 로컬 mock 제품별 실행 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인에 따라 AP·Field를 독립적으로 사용할 수 있는 기능과 환경을 완성한다. 사용자는 시각 검토보다 기능 구현을 먼저 진행하도록 지시했다. 문서상 5단계 중 4단계 진행 중이며 2·3단계 잔여 및 5단계 최종 인수가 있다. `TASKS.md`는 46개 중 implemented 1·in_progress 34·planned 11·verified 0이다.
- **완료 작업:** `pnpm mock:run`/`:agent`/`:field`로 로컬 제품별 DB·Field Valkey compose, migration, API/웹 빌드, 해당 제품 API·웹과 구성된 사건 worker를 재현 가능하게 시작한다. 포트가 이미 사용 중이면 기존 프로세스를 건드리지 않고 중지한다. Ctrl+C는 명령이 띄운 자식만 내리고 DB/큐 컨테이너·볼륨을 보존한다. 제품별 자식은 자기 `.env`만 로드한다. 공급사 credential 없는 Field 제작 AI worker는 `blocked_integration`으로 표시한다. 현재 전체 mock은 별도 실행 세션 98123에서 떠 있다.
- **수정 파일:** `tools/mock-run.mjs`, `tools/test/mock-run.test.mjs`, `tools/setup-mock-env.mjs`, 루트 `package.json`, `README.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/CODEX_HANDOFF.md`. API/웹 업무 코드·DB migration·제품 간 HTTP 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 제품 모드에서는 해당 제품만 setup/compose/migration/build/기동한다. 기존 포트를 자동 채택하거나 다른 프로세스를 종료하지 않는다. 모델/연결 credential이 없는 worker는 시작하지 않고 차단 상태를 알린다. 구성된 사건/AI worker가 나중에 종료돼도 자동 전달 불가만 알리고 독립 API·웹은 유지한다. 비밀값은 각 제품의 `node --env-file` 자식에만 전달하고 supervisor의 자식 기본 환경에서 제품 비밀값을 제외한다. `next start`를 직접 자식으로 실행해 일반 Ctrl+C가 모든 프로세스에 전달되게 한다. 처음 연결할 때 OAuth mock client 설정은 기존 `setup:mock:*` 별도 절차다.
- **실제 검사/환경/커밋:** 점유 socket 테스트 red(모듈 부재)→`tools/test/mock-run.test.mjs` 1/1 green. 기존 4311 점유 시 `pnpm mock:run:agent` nonzero와 명시 오류, 기존 API 유지. 실제 전체 mock 시작에서 두 PG17·Field Valkey healthy, migration·제품별 API/웹 build, AP 4311/3001·Field 4321/3002 readiness/`/workspace` 200, AP/Field 사건 worker 프로세스 실행, Field 모델 worker 미설정 표시. Ctrl+C 후 네 포트 해제·PG 컨테이너 유지. AP 단독은 Field 웹/API 없이 준비 200, Field 단독은 AP 웹/API 없이 준비 200; 각 종료 후 포트 해제. Field 사건 worker TERM의 첫 전체 종료 red→코어 유지 수정 뒤 두 API readiness·웹 200 green. 전체 mock 재기동 후 두 readiness·웹 200 및 두 사건 worker 프로세스를 다시 확인했다. 재기동한 전체 mock에서 `pnpm test:spike:knowledge-autosave:http` 1/1, `pnpm test:spike:catalog-autosave:http` 1/1, `pnpm test:spike:tenant-host:http` 1/1, 관련 합성 계정 잔여 0개를 확인했다. 격리 임시 디렉터리의 `setup-mock-env.mjs agent`는 Field env를 만들지 않고 AP env 권한 600. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:independence:agent`, `pnpm test:spike:independence:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `check_package.py`는 문서 패키지만 통과했다. 두 API 단독 spike는 상대 서비스/비밀값 없는 child API 검사이며 전체 제품/상대 DB 컨테이너 미배포 정식 독립 QA는 아니다. Git 없음.
- **실패한 접근:** 첫 supervisor는 자식들을 분리 프로세스 그룹으로 실행해 `pnpm` Ctrl+C 뒤 AP/Field 웹·API·worker 여섯 개가 남았다. 이 작업에서 생성한 PID만 TERM 정리하고 분리 실행을 제거했으며 Next도 직접 자식으로 시작했다. 재검사에서 Ctrl+C 뒤 네 포트가 비었다. 첫 worker 정책은 Field 사건 worker를 TERM하면 전체 코어를 내리는 red였다. 선택 worker 종료 후에도 두 API/web이 200을 유지하고 자동 전달 불가가 로그에 남도록 고쳤다. 포트 충돌 명령의 초기 출력은 stack trace였고 명시 오류만 출력하도록 수정했다. 고객/운영 데이터를 삭제하지 않았다.
- **남은 작업:** 외부 공급사와 실제 모델·인증·메시지/결제, DNS/TLS, AP 전용 큐·운영 ACL/백업/복구, OAuth client 최초 설정/재동의, 전체 제품 범위의 AP-only/Field-only 서버/DB 미배포 검사, C01 계약·공식 테스트·접근성·5단계 R02/출시 게이트. mock 실행 성공을 `verified`/출시 승인으로 올리지 않는다.
- **다음 에이전트 정확한 명령:** 현재 서비스가 떠 있으므로 아래 준비/HTTP로 상태를 확인한다. 새 기능 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA·명령을 기록한다. 현재 프로세스가 정상 종료된 뒤 `pnpm mock:run`으로 재시작할 수 있고, 사용 중 포트에서는 이 명령이 안전하게 오류를 낸다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
curl -fsS http://localhost:3001/workspace
curl -fsS http://127.0.0.1:3002/workspace
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:independence:agent
pnpm test:spike:independence:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
pnpm mock:run
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03 제품 홈의 실제 작업 진입 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인에 맞춰 독립 AP·Field의 기능과 사용 가능한 로컬 환경을 완성한다. 사용자는 화면 시각 검토보다 기능 연결을 먼저 진행하도록 지시했다. 5단계 중 4단계 진행 중이며 2·3단계 잔여와 5단계 최종 인수가 남았다. `TASKS.md` 46개는 implemented 1·in_progress 34·planned 11·verified 0이다.
- **완료 작업:** 로컬 mock의 AP와 Field 홈 기본 `작업 시작` 버튼을 각각의 실제 `/workspace`에 연결했다. 비저장 화면 시안은 `화면 둘러보기` 링크로 유지한다. `APP_PROFILE=design_preview`에서는 비저장 시안을 기본으로 표시한다. 홈의 상태 문구를 프로필에 맞게 구분하고, 두 제품의 320px mock 홈→작업 화면 이동을 확인했다.
- **수정 파일:** `packages/ui/src/index.tsx`, `apps/agent-web/src/app/page.tsx`, `apps/field-web/src/app/page.tsx`, `apps/{agent,field}-web/test/home-entry.test.tsx`, `docs/technical/{PHASE_2_EXECUTION_PLAN,PHASE_2_UI_REVIEW}.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, `docs/CODEX_HANDOFF.md`, 재생성한 마스터 Markdown/HTML. API·DB migration·제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 공통 홈 컴포넌트는 실제 작업 경로와 시안 경로를 별도 prop으로 받는다. mock 기본 CTA는 제품 자체 workspace이고 시안은 명시적인 보조 링크다. API 없는 `design_preview`는 시안만 기본 진입이다. 홈을 요청 시 렌더링해 시작 시 환경 프로필을 실제 응답에 반영한다. 기존 `APP_PROFILE=live` 출시 차단은 유지한다.
- **실제 검사/환경/커밋:** 두 홈 SSR 검사에서 구현 전 기본 CTA `/preview` red, 다음 시안 모드 `/workspace` red를 각각 확인하고 AP·Field 각 2/2 green. 초기 정적 빌드로 띄운 실제 AP 시안 서버 3011에서도 잘못된 `/workspace` red를 확인했다. 홈 요청 시 렌더링 뒤 같은 빌드의 mock AP/Field 3001/3002는 `/workspace`, 시안 AP/Field 3011/3012는 `/preview` 기본 링크와 비저장 표시를 실제 HTTP로 확인했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:web:agent`, `pnpm build:web:field` exit 0. Chromium 320px mock 각 홈→각 `/workspace` 이동, 홈 가로 넘침 없음/page error 0. 분할 문서 변경 뒤 마스터 재생성과 문서 범위 검사 실행. Git 없음.
- **실패한 접근:** 구현 전 기본 CTA가 비저장 시안이라 두 검사에서 `/workspace`가 없었다. 공통 홈만 바꾼 첫 구현은 시안 모드의 목적지를 분리하지 못했고, 정적 빌드는 실행 프로필을 반영하지 않아 실제 AP 시안 서버에서도 `/workspace`가 보였다. 프로필별 표시와 요청 시 렌더링을 추가해 같은 빌드의 실제 응답을 재검사했다. 운영 공급사 연결/배포 실패 검사는 이번 범위에 없다.
- **남은 작업:** 실제 작업 화면의 전체 역할별 기능/접근성·시각 검토, 200% 확대/스크린리더, AP/Field 독립 운영 환경과 실제 인증·모델·알림·결제/DNS/TLS, 백업/보존/복구, C01/C02 공식 계약·독립/장애/보안/E2E 및 5단계 R02가 남는다. 이번 로컬 홈 진입 검사는 C03 전체나 출시 gate를 완료시키지 않는다.
- **다음 에이전트 정확한 명령:** 새 기능 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA·검사 명령을 기록한다. 현재 홈 동작은 아래 명령으로 재검사한다. 실제 320px 브라우저 검사는 mock 웹 프로세스와 `/tmp/fieldai-ui-venv`가 필요하다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm --filter @fieldai/agent-web exec tsx --test test/home-entry.test.tsx
pnpm --filter @fieldai/field-web exec tsx --test test/home-entry.test.tsx
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:web:agent
pnpm build:web:field
curl -fsS http://127.0.0.1:3001/
curl -fsS http://127.0.0.1:3002/
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C03/F04 Field 사업장 호스트 공개 경로 격리 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인에 맞춰 독립 AP·Field의 기능과 로컬 사용 환경을 완성한다. 화면 시각 검토를 대기 조건으로 두지 않고 기능을 연결한다. 문서상 5단계 중 4단계 진행 중이며 2·3단계 잔여와 5단계 최종 인수가 남았다. 46개 작업의 상태는 implemented 1·in_progress 34·planned 11·verified 0이다.
- **완료 작업:** Field 사업장별 호스트의 서버 요청에서 승인 사이트 slug와 공개 문의 조직 ID를 확인한다. 다른 조직 사이트/공개 문의, 관리실·플랫폼 루트는 404이며 같은 조직의 사이트→직접 문의·예약 시작은 열린다. 기존 확인키 문의·예약 재방문, 공개 API·정적 자산, AP 사이트 소유 증명과 플랫폼 호스트는 유지한다. 두 합성 조직을 실제 Field 웹/API에 만들어 HTTP·320px Chromium으로 확인하고 합성 계정을 정리했다.
- **수정 파일:** `apps/field-web/src/proxy.ts`, `tools/spikes/field-tenant-host-http.test.mjs`, `tools/spikes/field-tenant-host-browser.py`, `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, `docs/CODEX_HANDOFF.md`. Field API/DB migration, AP, 제품 간 공개 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 페이지가 렌더링된 뒤 클라이언트에서 숨기는 방식 대신 Field 웹 proxy가 호스트를 먼저 검사한다. `/public/:id`는 Field 공개 API의 해당 승인 site slug에 속하는 조직 ID와 비교하고 조회 실패 시 404로 닫는다. 확인키 재방문 경로는 기존 확인키 권한 검사를 사용한다. 로컬 사업장 호스트와 플랫폼 호스트가 같은 포트인 구성이므로 현재 플랫폼 리다이렉트는 사용하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock PostgreSQL 17, Field API 4321·웹 3002, Chromium 320px. 변경 전 두 조직 HTTP에서 A 사업장 호스트의 B `/public`이 200인 red. 변경 뒤 `pnpm test:spike:tenant-host:http` 1/1은 자기/타 조직 사이트·공개 문의, 관리실·루트, 플랫폼 호스트, AP well-known 소유 증명, 브라우저 문의·예약 시작/가로 넘침 없음/page error 0을 확인했다. `pnpm test:spike:sites:field` 2/2, `pnpm test:spike:site-autosave:http` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:web:field` exit 0. 테스트 정리 수정 후 재실행 1/1, 합성 잔여 계정 0개. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `check_package.py`는 문서 범위만 통과했다. Field API readiness·웹 `/workspace` HTTP 200. Git 없음.
- **실패한 접근:** Node fetch에 지정한 사용자 `Host` 헤더가 실제 URL 호스트를 바꾸지 않아 테스트를 `http://field-<slug>.localhost:3002`로 수정했다. 확인키 화면을 플랫폼 호스트로 보내는 307은 로컬 Next 웹의 같은 포트 응답에서 `Location`이 상대 경로로 바뀌어 철회했다. 공개 호스트 경계의 선행 200 red는 proxy 검사로 해결했다. 테스트의 조직 삭제가 site release→catalog release FK에 막혔지만 기존 `catch`가 숨겨 합성 계정 10개가 누적됐다. site release→조직→계정 순서의 트랜잭션 정리로 고치고 해당 합성 10개를 제거했다.
- **남은 작업:** 실제 DNS/TLS/자체 도메인과 프록시 구성, 확인키 화면의 사업장 호스트 노출 정책, 전체 키보드·스크린리더/200% 확대와 QA51/65/67/79·G-F1 정식 판정. AP/Field 실제 인증·모델·알림·구독/청구, 객체 저장·백업/보존/복구, C01/C02 공식 계약·독립/장애/보안/E2E, 5단계 R02가 남는다. 이번 검사는 mock 환경만 확인했고 출시 승인이나 `verified`를 주장하지 않는다.
- **다음 에이전트 정확한 명령:** 새 기능 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA·검사 명령을 기록한다. 현재 경계 재검사는 Field mock API/웹과 Python Playwright 환경을 실행한 뒤 아래 명령을 사용한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:tenant-host:http
pnpm test:spike:sites:field
pnpm test:spike:site-autosave:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:web:field
curl -fsS http://127.0.0.1:4321/health/ready
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A01 AP 직접 지식 초안 자동 저장·승인 분리 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인에 맞춰 AP·Field 독립 서비스를 실제 사용할 수 있도록 기능·환경을 완성한다. 화면 시각 검토는 기능 연결의 대기 조건이 아니다. 문서의 5단계 중 4단계 진행 중이며 `TASKS.md`는 총 46개, implemented 1·in_progress 34·planned 11·verified 0이다.
- **완료 작업:** AP owner의 상호·소개·서비스·FAQ 직접 입력을 마지막 변경 약 1초 뒤 서버 초안에 저장한다. 미완성 상호/서비스/질문/답변도 비공개 초안에 남겨 재접속 후 이어 쓴다. 승인 API는 완성도를 다시 검사하고 미완성은 409로 거부한다. 저장 응답이 늦어도 후속 입력을 보존하고 응답 분실의 동일 서버 내용을 재조회한다. 오프라인/실패는 미저장 표시, 실제 409는 서버/내 입력을 비교해 명시 선택한다. 기존 고객 공개 지식은 별도 승인 전 유지한다. AP owner 초안 응답에 최신 공개 release 번호와 해당 직접 입력 초안 번호를 별도로 제공해 UI 승인 가능 판정에 사용한다.
- **수정 파일:** `apps/agent-api/src/business.ts`, `apps/agent-api/test/business-core.db.test.ts`, `apps/agent-web/src/workspace.tsx`, `tools/spikes/agent-knowledge-autosave-http.test.mjs`, `tools/spikes/agent-knowledge-autosave-browser.py`, `package.json`, `docs/01_AGENT_PLATFORM_PRD.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 인수인계와 재생성된 마스터 문서. Field 내부/공개 연동 계약·DB migration은 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 설계 결정:** AP native draft의 PUT/PATCH는 입력 중 미완성을 허용하고 KnowledgeRelease 생성 시 strict 검증한다. 기존 `expectedRevision`과 서버 DB를 원장으로 사용한다. 공개 release revision은 connector 게시로도 증가할 수 있으므로 draft revision과 숫자 일치를 승인 상태로 취급하지 않는다. 늦은 응답은 입력 순번으로 판정하며 진짜 409는 자동 덮어쓰지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP PostgreSQL 17, 새 AP API 4311·웹 3001, Chromium 320px. `pnpm test:spike:business:agent` 3/3, `pnpm test:spike:knowledge-autosave:http` 1/1(지연 응답/후속 입력, 미완성 재접속/승인 차단, 요청 실패/응답 분실/오프라인, 409 양방향 선택, 공개본 불변, 가로 넘침 없음/page error 0), `pnpm test:spike:agents:agent` 2/2, `pnpm test:spike:integrator:agent` 1/1. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports` exit 0. 새 프로세스의 API readiness·웹 `/workspace` HTTP 200. 문서 마스터 재생성 및 `check_package.py` 문서 범위 통과(서비스 테스트 아님). 합성 AP 브라우저 검사 사용자 잔여 0명. 커밋 없음.
- **실패한 접근과 조치:** 첫 DB 검사는 미완성 초안 PUT 400 `invalid_draft` red였고 parser의 초안/공개 검증을 분리했다. 첫 브라우저 검사는 자동 PUT 부재로 8초 timeout red였고 저장 타이머·충돌 흐름을 연결했다. owner 응답의 release/draft 번호가 없어 DB 검사에서 `undefined !== 1` red였고 최신 release 메타데이터 조회를 추가했다. 변경 뒤 각 검사를 재실행해 통과했다.
- **남은 작업:** 실제 AP 인증·모델·알림/결제 공급사, 외부 source 변경/충돌 전체 검수, 상담/AI 의미 품질, 백업/보존/복구, 운영 독립 환경·정식 QA/G 게이트. AP/Field 둘 다 제공자 credential 없는 mock 결과이며 `verified`나 출시 승인으로 올리지 않았다. 운영 고객 메시지/청구/배포는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 다음 기능 시작 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·관련 QA·검사 명령을 기록한다. 다음은 현재 기능 재검사 명령이다. 브라우저 검사는 AP API/웹 mock 프로세스와 `/tmp/fieldai-ui-venv`가 필요하다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:business:agent
pnpm test:spike:knowledge-autosave:http
pnpm test:spike:agents:agent
pnpm test:spike:integrator:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:3001/workspace
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F01/F02 사업정보·서비스 초안 자동 저장 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인에 따라 독립 AP·Field를 실제 사용할 수 있는 서비스로 완성한다. 사용자 지시에 따라 화면 시각 검토를 대기 조건으로 두지 않고 기능 연결을 진행한다. 문서의 5단계 중 4단계 기능 연결 중이며 2·3단계 검토 잔여와 5단계 인수가 남았다. `TASKS.md` 46개는 implemented 1, in_progress 34, planned 11, verified 0이다.
- **완료 작업:** Field 사업정보와 서비스 입력을 마지막 변경 약 1초 뒤 Field 서버 초안에 저장한다. 저장 중 추가 입력은 다음 revision으로 보존하고, 서버 반영 후 응답만 분실되면 동일 내용 재조회로 복구한다. 오프라인·요청 실패는 미저장으로 표시한다. 실제 409는 서버/내 입력을 비교해 명시적으로 선택한다. 빈 상호·서비스명·소요시간 0도 비공개 초안에 저장·재접속 후 재개하며, 완성 전 승인은 Field API가 거부한다. 고객 공개본은 별도 승인 전 유지한다. 소개/서비스 설명의 접근성 이름은 입력값과 무관하게 고정했다.
- **수정 파일:** `apps/field-api/src/business.ts`, `apps/field-api/test/business-core.db.test.ts`, `apps/field-web/src/field-workspace.tsx`, `tools/spikes/field-catalog-autosave-http.test.mjs`, `tools/spikes/field-catalog-autosave-browser.py`, `package.json`, `docs/02_FIELD_PRD.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 인수인계와 재생성된 마스터 문서. 제품 간 공개 HTTP 계약·DB migration은 변경하지 않았다. Git 저장소/커밋은 없다.
- **핵심 설계 결정:** Field 비공개 초안 저장은 미완성을 허용하고 release 시 같은 초안을 엄격하게 검증한다. 기존 `expectedRevision` 충돌 계약을 유지한다. 브라우저의 입력 순번과 서버 revision을 분리해 늦은 응답이 최신 입력을 덮지 않게 한다. 실제 타 편집자 충돌은 자동 덮어쓰지 않는다. 클라이언트 저장소를 원장으로 사용하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock PostgreSQL 17, Field API 4321·웹 3002, Chromium 320px. `pnpm test:spike:catalog-autosave:http` 1/1: 지연 응답/후속 입력, 빈 서비스 저장·새로고침 재개·승인 차단, 실패/응답 분실·오프라인, 실제 409/두 방향 선택, 고객 승인본 불변, 가로 넘침 없음/page error 0. `pnpm test:spike:business:field` 3/3, `pnpm test:spike:bookings:field` 3/3, `pnpm test:spike:sites:field` 2/2, 기존 `pnpm test:spike:site-autosave:http` 1/1, `pnpm test:spike:imports`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field` exit 0. 사이트 자동 저장 브라우저 회귀는 Field API 미완성 초안 변경 전에 실행했다. 이후 Field API readiness와 웹 `/workspace` HTTP 200, 문서 마스터 재생성 및 `check_package.py` 문서 범위 통과를 확인했다. 커밋 없음.
- **실패한 접근과 조치:** 처음 브라우저 검사는 자동 PUT 부재로 8초 timeout red였다. 채운 textarea의 label 조회가 0개인 문제는 DOM 확인 후 안정된 `aria-label`로 수정했다. 빈 서비스명 저장은 최초 Field API 400 및 브라우저 미저장 red였고, 미완성 초안 저장/승인 검증 분리로 해결했다. 승인 직후 공개 GET을 너무 이르게 읽은 검사는 승인 버전 변경을 기다리도록 고쳤다.
- **남은 작업:** 실제 인증·모델·알림 공급사, 실 도메인/TLS, 구독/청구, 보존·백업·복구, AP/Field 양방향 공개 계약·정식 독립/장애/E2E/보안 검수 및 적용 QA/G 게이트. 200% 확대·키보드/스크린리더 전체 시각 검토도 남는다. 운영 고객 데이터·실 메시지·청구·배포는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 새 기능 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA·검사 명령을 기록한다. 현재 변경은 다음 명령으로 재검사할 수 있다. 서비스는 `infra/field/.env`의 mock 설정과 별도 API/웹 프로세스가 필요하다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:business:field
pnpm test:spike:catalog-autosave:http
pnpm test:spike:bookings:field
pnpm test:spike:sites:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
curl -fsS http://127.0.0.1:4321/health/ready
curl -fsS http://127.0.0.1:3002/workspace
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F02 사이트 초안 자동 저장·충돌 복구 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인대로 독립 AP·Field의 실제 사용 가능한 기능과 환경을 완성한다. 총 5단계 중 4단계 기능 구현 중, 2·3단계 잔여와 5단계 인수가 남았다. 46개 작업의 상태는 implemented 1, in_progress 34, planned 11, verified 0이며 사용자 화면 시각 검토보다 기능 연결을 우선한다.
- **완료 작업:** Field 사이트 편집에 마지막 입력 약 1초 뒤 서버 자동 저장, 저장 중 추가 입력의 후속 revision 저장, 응답 분실 뒤 동일 서버 내용 대조, 오프라인/요청 실패 미저장 안내·수동 재시도, 409 충돌의 서버 초안 미리보기와 양방향 명시 선택, 미저장 화면 이탈 경고를 추가했다. 충돌에서 내 입력을 선택하면 최신 서버 revision을 다시 확인하고 덮어쓰기 확인을 받은 뒤 저장한다. 서버 초안을 선택할 때도 이탈 확인을 받는다. 공개는 별도 명시 버튼으로 유지한다.
- **수정 파일:** `apps/field-web/src/site-editor.tsx`, `tools/spikes/{field-site-autosave-http.test.mjs,field-site-autosave-browser.py}`, `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/CODEX_HANDOFF.md`. Field API·migration·제품 간 공개 HTTP 계약은 변경하지 않았다. 분할 문서 변경 뒤 마스터 Markdown/HTML 재생성 대상이다. Git 저장소/커밋 없음.
- **핵심 설계 결정:** 서버의 기존 `expectedRevision`을 사용하고 브라우저를 원장으로 삼지 않는다. PUT 응답이 늦을 때 입력 순번을 비교해 최신 입력을 보존하고 반환된 revision만 갱신한다. 409에서 서버 초안이 전송 snapshot과 같으면 응답 분실로 판정해 중복 PUT을 하지 않는다. 실제 다른 편집자의 변경은 자동 병합/덮어쓰지 않고 사용자가 두 버전을 본 뒤 선택한다. 실패·오프라인은 저장 완료로 표시하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock Field PostgreSQL 17·API 4321·웹 3002, Chromium 320px. 신규 브라우저 검사는 구현 전 첫 자동 PUT이 없어 8초 timeout red였다. 구현 뒤 `pnpm test:spike:site-autosave:http` 1/1: 지연 저장 중 후속 입력/DB 다음 revision, 요청 전 실패와 수동 재시도, 서버 commit 뒤 응답 분실에서 같은 revision 회수, 오프라인 미저장→복귀 자동 저장, 실제 다른 편집자의 409/서버 원본 유지/두 방향 선택, 미공개 사이트 404, 320px 가로 넘침 없음/page error 0. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:web:field`, `pnpm test:spike:sites:field` 2/2 exit 0. 새 Field 웹 빌드를 재시작하고 Field API readiness·웹 경로 HTTP 200 확인. 문서 `build_report.py` exit 0, `check_package.py` 문서 범위 통과(서비스 테스트 아님). Git 없음.
- **실패 접근:** 첫 브라우저 검사는 사이트 편집 화면에 직접 이메일 폼이 있다고 가정해 로그인 locator timeout이었고, 별도 인증 API 로그인으로 고쳤다. 이후 `미저장 변경` 문구가 두 곳에 있어 strict locator 실패를 기준 revision 행으로 좁혔다. 실패 표시 기대 문구도 실제 상태 레이블로 좁힌 뒤 재실행 통과했다. 기능 red는 자동 PUT 없음이었다.
- **미검수/남은 작업:** Field 사업정보 초안의 자동 저장, 새로고침/브라우저 종료 뒤 미전송 입력의 복구 정책, 충돌 시 세부 필드 병합, 운영 네트워크/부하·실 객체 저장·실 도메인/TLS, 접근성 전체·정식 QA62/G-F1. AP/Field 실제 인증·모델·알림·구독/청구, 보존/백업/복구, 전체 계약·보안·장애/E2E/R02도 남는다. 운영 고객 데이터 복제/삭제·실 발송·청구·배포는 하지 않았다.
- **다음 에이전트 정확한 명령:** 새 기능 작업 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 변경 파일·요구/QA·검사 명령을 기록한다. 현행 결과는 아래로 재검사할 수 있다. 문서 분할 원문을 바꾸면 마스터를 재생성한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:site-autosave:http
pnpm test:spike:sites:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:web:field
curl -fsS http://127.0.0.1:4321/health/ready
curl -fsS http://127.0.0.1:3002/workspace/site
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A08/F09 직접 문의 대화 기록 내보내기 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인에 맞춰 독립 AP·Field 서비스를 실제로 사용할 수 있게 기능을 완성한다. 문서상 총 5단계에서 4단계 기능 구현 중이고 2·3단계 잔여 검수, 5단계 최종 인수가 남았다. `TASKS.md` 46개 중 implemented 1, in_progress 34, planned 11, verified 0이다. 화면 시각 검토보다 기능 연결을 우선하는 사용자 지시가 유효하다.
- **완료 작업:** AP와 Field 각각의 사업자 직접 문의 한 건을 owner/editor가 JSON 파일로 내려받는 API와 웹 링크를 추가했다. 메시지에는 고객·사업자·내부 메모가 포함되고 첨부는 메타데이터와 기존 인증 다운로드 경로를 기록한다. 다른 조직/viewer는 404, 비로그인 및 다른 제품 세션은 401이다. 확인키·토큰·객체 저장 키를 출력하지 않는다. Field export에 AP 원본은 포함하지 않는다. 두 제품의 API와 웹은 새 빌드로 로컬 실행 중이다.
- **수정 파일:** `apps/agent-api/src/inquiries.ts`, `apps/agent-api/test/{inquiries,inquiry-attachments}.db.test.ts`, `apps/agent-web/src/workspace.tsx`; `apps/field-api/src/inquiries.ts`, `apps/field-api/test/{business-core,inquiry-attachments}.db.test.ts`, `apps/field-web/src/field-workspace.tsx`; `tools/spikes/inquiry-export-http.test.mjs`, `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/CODEX_HANDOFF.md`. migration/제품 간 HTTP 계약 변경은 없다. 분할 문서 변경 후 마스터 Markdown/HTML을 재생성한다. Git 저장소/커밋은 없다.
- **핵심 설계 결정:** 기존 사업자 문의 상세의 owner/editor 권한을 내보내기에도 적용한다. 한 문의의 일관된 snapshot을 read-only repeatable-read transaction으로 읽는다. JSON은 제품·formatVersion·시각을 명시하고 `private, no-store`·`attachment`·`nosniff`를 설정한다. 사진 파일 묶음과 전체 계정 백업/정리 모드는 별도이며, 미결정 가격과 결제 공급사를 성공 상태로 모의하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17. 구현 전 신규 경로 404 red, editor 권한 404 red 확인. 구현 뒤 `pnpm test:spike:inquiries:agent` 1/1, `pnpm test:spike:business:field` 2/2, `pnpm test:spike:attachments:agent` 1/1, `pnpm test:spike:attachments:field` 1/1. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:agent`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, `pnpm test:spike:independence:agent`, `pnpm test:spike:independence:field` exit 0. 새 빌드 AP/Field API 4311/4321·웹 3001/3002를 재시작해 각 readiness/루트 HTTP 200, `pnpm test:spike:export:http` 1/1 통과: 실제 웹 프록시에서 양쪽 JSON 다운로드·교차 쿠키/무인증 401 확인. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `check_package.py`는 문서 패키지만 통과했으며 서비스 테스트는 실행하지 않는다. Git 없음.
- **실패 접근:** 구현 전 404는 의도한 선행 red다. 초기 owner 전용 구현에 editor 기대가 404로 실패해 기존 상세 권한과 같은 owner/editor로 수정한 뒤 다시 통과했다. 공급사 연동이나 운영 배포 실패는 이번 범위에서 발생하지 않았다.
- **미검수/남은 작업:** 전체 계정/사진 파일 아카이브, 구독 종료 뒤 정리 모드, 보존/삭제·백업/복구·관리자/신고, 실제 청구/인증/알림/모델/DNS/TLS/객체 저장소, 화면 시각·접근성 전체, 공식 계약·장애/보안/E2E와 R02 출시 게이트. 이번 JSON 링크의 320px 브라우저 시각 검토와 실 운영 부하 검사는 실행하지 않았다. AP/Field 문의 원본 및 합성 외 운영 데이터의 내보내기/삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 현재 제품별 독립 검사를 아래 명령으로 다시 실행할 수 있다. 다음 기능 작업의 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 실 가격/공급사 없이 A07/F09 청구를 완료로 표시하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:inquiries:agent
pnpm test:spike:business:field
pnpm test:spike:attachments:agent
pnpm test:spike:attachments:field
pnpm test:spike:export:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
pnpm test:spike:independence:agent
pnpm test:spike:independence:field
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A02/F05/F07 공개 제출 남용 제한 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인에 맞춰 AP·Field를 독립적으로 사용할 수 있는 기능을 완성한다. 문서상 5단계 중 4단계 기능 구현 중이며 2·3단계 잔여 및 5단계 최종 인수가 있다. `TASKS.md` 46개 중 implemented 1, in_progress 32, planned 13, verified 0이다. 사용자는 화면 시각 검토보다 기능 연결을 우선하기로 했다.
- **완료 작업:** AP 공개 직접 문의와 AI 상담 사람 인계, Field 공개 직접 문의와 예약 요청의 새 접수를 제품별 조직·정규화 전화번호 기준 15분 5건으로 제한한다. 6번째는 429·`Retry-After`이며 기존 수락 요청의 같은 멱등 키 replay는 200으로 복구한다. Field 문의·예약은 Field 원장 한도를 공유하고 AP와 Field DB는 분리한다. 카운트와 원본/outbox는 같은 트랜잭션으로 처리해 중복·실패·거부 요청이 한도를 소비하지 않는다. 전화번호는 각 제품 비밀값의 용도 분리 HMAC으로 원장에 저장한다. Field 예약 연락처 유효성도 문의와 동일하게 검사하고 세 고객 화면에 429 안내를 추가했다.
- **수정 파일:** AP `apps/agent-api/migrations/000045_public_submission_windows.sql`, `apps/agent-api/src/{public-submission-limit,inquiries,customer-consultations}.ts`, `apps/agent-api/test/{inquiries,customer-consultations}.db.test.ts`, `apps/agent-web/src/agent-public.tsx`; Field `apps/field-api/migrations/000039_public_submission_windows.sql`, `apps/field-api/src/{public-submission-limit,inquiries,bookings}.ts`, `apps/field-api/test/{business-core,bookings}.db.test.ts`, `apps/field-web/src/{field-public,field-booking}.tsx`; `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/CODEX_HANDOFF.md`. 분할 문서에서 마스터 Markdown/HTML 재생성. 공개 제품 간 HTTP 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 결정:** 프록시가 아직 신뢰 설정되지 않아 `request.ip`를 모든 고객에 공유할 수 있으므로 연락처·조직 단위로 먼저 제한한다. 서로 다른 번호와 조직은 독립적이다. 수락된 replay를 제한보다 먼저 확인한다. 전화번호만 바꾸는 악용과 대상 번호를 일부러 소진하는 행위는 이 한도로 해결되지 않으며 신고/이의·조직 비용 상한·운영 프록시 정책은 별도다. 만료 원장 정리 작업도 남는다. 실제 알림 성공·청구는 모의하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17과 합성 API 테스트. 선행 AP 문의·Field 문의·Field 예약 DB 테스트에서 각각 6번째 201≠기대 429 red 확인; 구현 뒤 `pnpm test:spike:inquiries:agent` 1/1, `pnpm test:spike:consultations:agent` 1/1, `pnpm test:spike:business:field` 2/2, `pnpm test:spike:bookings:field` 3/3 통과. 표기 정규화, replay, 다른 번호, 만료 뒤 복구, Field 예약→문의 한도 공유, AP 문의/Field 예약의 8건 동시 접수 중 5건 저장을 검사했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:agent`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, `pnpm test:spike:independence:agent`, `pnpm test:spike:independence:field` exit 0. 양쪽 API를 새 빌드로 재시작한 뒤 readiness 200, 웹 3001/3002 루트 200 확인. 브라우저 320px 제한 안내는 이번 단계에서 실행하지 않았다. Git 없음.
- **실패 접근:** 첫 테스트 편집에서 기존 `limited` 변수와 이름이 충돌해 변환 실패, `ratePayload`로 수정했다. 첫 서버 재기동에서 mock profile 없이 실행해 OAuth 웹 origin 필수 오류가 발생했고, `AP_PROFILE=mock`·`FIELD_PROFILE=mock`을 명시해 재기동했다. `nohup` 백그라운드 실행은 이 환경에서 유지되지 않아 세션 명령으로 시작했다. 선행 6번째 201은 의도한 기능 red였다.
- **미검수/남은 작업:** 사용자 화면 시각 검토·320px/키보드 429 안내, 실제 프록시/부하/공격 방어·전화번호 회전·신고/이의·조직 비용 상한·만료 원장 정리·정식 QA19/25/48/G-A2/G-F2. A07/F09 독립 구독·실 청구, A06/F08 실 알림, 실 인증·모델·DNS/TLS/객체 저장·복구, 공식 계약/장애/보안/E2E 및 전체 출시 게이트. 실제 고객 발송·청구·운영 배포/삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 아래 명령으로 현재 코드와 mock API 상태를 확인한다. 다음 기능 범위는 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일·QA·명령을 먼저 기록한다. 실 공급사/가격 승인 없는 성공 표시는 금지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:inquiries:agent
pnpm test:spike:consultations:agent
pnpm test:spike:business:field
pnpm test:spike:bookings:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm build:web:agent
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
pnpm test:spike:independence:agent
pnpm test:spike:independence:field
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A04 고객 AI 연속 대화 문맥 (2026-09-25)

- **현재 목표:** 문서 v3.0과 `reference` 디자인에 맞춰 AP·Field를 독립적으로 사용할 수 있는 기능까지 완성한다. 화면 사용자 시각 검토는 아직 없으며 기능 구현을 우선한다. `TASKS.md` 46개 중 implemented 1, in_progress 32, planned 13, verified 0이다.
- **완료 작업:** AP 고객 상담의 모델 호출이 같은 AP 원본 대화의 앞선 공개 고객 질문/AI 답변 최근 6개를 각 500자 이내로 순서대로 읽어 문맥 데이터로 전달한다. 현재 질문을 history에 중복하지 않고 사업자/내부/다른 대화 메시지를 제외한다. Responses adapter는 `conversationHistory`와 `approvedFacts`를 분리하고 `store:false`·도구 없음, 근거/숫자/사용량 검사를 유지한다. 첫 질문과 두 번째 질문을 합성 provider로 확인했다.
- **수정 파일:** AP `apps/agent-api/src/{customer-consultations,openai}.ts`, `apps/agent-api/test/{customer-consultations.db,openai.adapter}.test.ts`; `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/CODEX_HANDOFF.md`. 분할 원문 변경 시 마스터 Markdown/HTML 재생성. Migration·공개 HTTP 계약·Field 내부 코드는 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 결정:** 모델 문맥의 유일한 입력 원본은 서버의 같은 inquiry 메시지 원장이다. 브라우저가 history를 보내거나 공급사 `previous_response_id`/저장 상태에 의존하지 않는다. 대화 기록은 질문 지시·승인 사실이 아니라고 모델 지침에 명시하고 서버가 승인 지식의 근거 ID/숫자를 계속 검사한다. lock 내 history snapshot 이후 모델 호출 동안 DB transaction은 유지하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP PostgreSQL 17, API 4311, 합성 model provider. `pnpm test:spike:consultations:agent` 1/1, `pnpm --filter @fieldai/agent-api exec tsx --test test/openai.adapter.test.ts` 1/1, `pnpm test:spike:agents:agent` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, `pnpm test:spike:independence:agent` exit 0. AP API를 새 빌드로 재시작했다. Git 없음.
- **실패 접근:** 첫 고객 DB 기대에서 history가 `undefined`라 red, 첫 adapter 검사에서 `conversationHistory`가 없어서 red였다. 두 경로 구현 후 전체를 다시 실행해 green. 실제 AP model/credential은 로컬 환경에 미설정이므로 실제 모델 응답/브라우저 두 턴을 성공으로 주장하지 않는다.
- **미검수/남은 작업:** A04 실제 모델 문맥 품질·의미적 근거/원가·사용량 복구·정식 QA22~24/117, A07/F09 구독·청구, A06/F08 실 알림, 운영 인증/DNS/TLS·복구, I06 공급사 발송 직전 경로 검증, C03 사용자 화면 검토 및 전체 출시 gate. 실제 고객 발송·청구·운영 배포·삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 다음 핵심 기능 범위의 파일·QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 현재 결과 확인 명령은 아래다. 분할 문서를 바꾸면 마스터를 다시 생성한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:consultations:agent
pnpm test:spike:agents:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
pnpm test:spike:independence:agent
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I06 AP inbox 202 뒤 연결 해제 재조정 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 디자인의 독립 AP·Field 서비스를 기능까지 완성한다. 46개 작업 중 implemented 1, in_progress 32, planned 13, verified 0이며 I06도 출시 완료 상태가 아니다.
- **완료 작업:** AP가 유효 연결에서 서명 Field 사건을 inbox에 202로 받은 뒤 연결이 해제돼도 AP worker가 이미 받은 세대 1 사건을 내부 사건/고객 알림 원장으로 처리한다. AP 수신은 connection row `for share` lock을 잡은 트랜잭션에서 검증·commit하므로 해제가 먼저 완료된 새 사건은 401이다. 예약별 종료 영수증 뒤 남은 inbox 사건은 `route_closed`로 거부하고 새 알림을 만들지 않는다. 실제 고객 공급사 발송은 여전히 하지 않는다.
- **수정 파일:** `apps/agent-api/src/field-event-inbox.ts`, `apps/agent-api/test/field-actions.db.test.ts`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/{I06_NOTIFICATION_ROUTE_TRANSFER_DESIGN.md,PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/CODEX_HANDOFF.md`, 분할 원문에서 재생성한 마스터 Markdown/HTML. AP/Field 공개 HTTP 계약 본문·migration은 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 결정:** 해제 시 이미 202를 준 AP inbox를 버리지 않고 처리해 기존 ACK의 뜻을 지킨다. 수신/해제 순서를 AP connection row lock으로 직렬화한다. 해제 뒤 새 수신은 허용하지 않으며 종료된 예약에 대한 늦은 inbox는 처리하지 않는다. AP 내부 원장 처리와 실제 카카오/문자 공급사 발송은 별개다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17, 별도 API/worker, 웹 3001/3002, Chromium 320px. `pnpm test:spike:field-actions:agent` 1/1, `pnpm test:spike:integrator:field` 1/1, 정적 공개 계약 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, `pnpm test:spike:independence:agent`, `pnpm test:spike:independence:field` exit 0. AP API/worker를 새 빌드로 재시작한 뒤 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http`와 `FIELD_REVOKE_ORIGIN=ap` 변형 실제 HTTP·320px 브라우저 각 1/1. 이 HTTP 검사는 기존 전체 연결 회귀이며 정확한 ACK/해제 경계는 AP DB 테스트에서 검증했다. Git 없음.
- **실패 접근:** 기존 worker는 해제 뒤 202 inbox를 `deferred`로 반복 보류했다. lock 없는 수신은 해제와 경쟁한 새 사건에 202를 반환했다. 종료 영수증 뒤 늦은 inbox도 `processed`였다. 각각 red를 확인한 뒤 수정해 green으로 재검사했다.
- **미검수/남은 작업:** 실제 공급사 `unknown` 조회와 발송 직전 AP↔Field 현재 경로 재확인, 구독 종료·삭제/보존, 운영 키·장애 복구, 정식 QA/G-I3 및 공식 `test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security` 게이트. AP/Field Core·Distribution의 실 인증/모델/알림/결제/DNS/TLS도 남았다. 사용자 디자인 시각 검토는 아직 없다. 고객 발송·청구·운영 배포·삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 아래 명령으로 현행 검사와 서비스 상태를 확인한다. 다음 범위는 AP 고객 알림 실제 발송 직전의 route/revoke 재확인 또는 I06 구독/보존 정책이다. 작업 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA·명령을 기록하고 문서 분할 원문을 고친 뒤 마스터를 재생성한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
ps -axo pid,command | rg 'apps/(agent|field)-api/dist/(server|field-event-worker|ap-event-worker)\.js|next-server'
pnpm test:spike:field-actions:agent
pnpm test:spike:integrator:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
pnpm test:spike:independence:agent
pnpm test:spike:independence:field
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
FIELD_REVOKE_ORIGIN=ap FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I06 전환 ID 내구 복구·예약 사건 대조 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 디자인에 맞는 독립 AP·Field 서비스를 기능까지 완성한다. 문서의 5단계 중 2·3단계는 일부 구현/검토, 4단계 진행 중, 5단계 최종 인수는 미완료다. `TASKS.md` 46개 중 implemented 1, in_progress 32, planned 13, verified 0이다.
- **완료 작업:** Field는 AP 종료 호출 전에 전환 ID·동의 ID·AP 전달 ACK의 연속 마지막 사건/revision을 자체 DB에 기록한다. 응답 분실 또는 Field 서버/사업자 화면 재시작 뒤 같은 ID/기준으로 영수증을 복구한다. 해제 뒤 AP에 미전달된 사건과 전환 중 추가된 사건은 각 사건의 직접 연락 `reached` 기록 전 Field 세대 2 활성화를 거부한다. `attempted`는 부족하다. 동의 철회 동안 활성화를 막고 재동의 뒤 저장된 전환 ID를 재사용한다. AP는 종료 기준을 넘는 inbox 사건이 있으면 거부한다. Field worker는 해제 연결의 신규 AP delivery를 생성하지 않는다.
- **수정 파일:** Field `apps/field-api/migrations/000038_notification_route_pending_transfer.sql`, `src/{external-reservation-notification-route,ap-event-delivery}.ts`, `test/integrator.db.test.ts`, 웹 `apps/field-web/src/field-booking.tsx`; AP `apps/agent-api/src/field-notification-route-close.ts`, `test/field-actions.db.test.ts`; `tools/spikes/{ap-field-connection-http.test.mjs,field-notification-route-browser.py}`; `docs/{03_INTEGRATION_CONTRACT.md,technical/I06_NOTIFICATION_ROUTE_TRANSFER_DESIGN.md,technical/PHASE_2_EXECUTION_PLAN.md,CODEX_HANDOFF.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터 Markdown/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** AP 종료 기준은 Field 예약 현재 revision이 아니라 AP 전달 ACK의 연속 prefix다. 원격 호출 동안 Field 예약 row를 오래 잠그지 않고 준비/확정 두 트랜잭션으로 나눈다. 기준 뒤 사건은 직접 연락 도달로 보정하며 자동 발송 성공으로 표시하지 않는다. `pendingTransferId`는 owner 조회에만 노출한다. AP 종료 API 본문/서명 형식은 유지했다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17, 별도 API 4311/4321·worker, Field 웹 3002, Chromium 320px. `pnpm test:spike:integrator:field` 1/1, `pnpm test:spike:field-actions:agent` 1/1, `node --test tools/test/agent-integrator-contract.test.mjs tools/test/field-integrator-contract.test.mjs` 2/2, `pnpm test:spike:bookings:field` 3/3, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:field`, import/DB 격리 및 AP-only/Field-only spike exit 0. 새 빌드로 재시작 뒤 `FIELD_ROUTE_RESTART=1 FIELD_TEST_AP_SERVER_PID=82942 FIELD_TEST_FIELD_SERVER_PID=82952 FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1: AP 중단→Field 전환 503/저장 ID→Field 중단·재시작 뒤 같은 ID→AP 재시작→320px 화면 활성화. `FIELD_REVOKE_ORIGIN=ap FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http`도 1/1. Git 없음.
- **실패 접근:** 첫 Field DB 검사는 메모리 전환 ID가 재시작 뒤 사라져 실패했다. 해제 뒤 미전달 사건을 예약 최신 revision으로 AP 종료 기준에 포함한 구현도 기대 2/실제 3으로 실패했다. ACK 연속 prefix로 고친 뒤 재검사했다. 실제 브라우저 복구 검사는 고객 동의 완료 상태를 별도 분기로 확인한다.
- **미검수/남은 작업:** 실제 공급사 `unknown` 조회와 발송 직전 AP↔Field route 재확인, 구독 종료·법정 보존/삭제, 운영 키 회전/장애 복구·정식 QA146/148~155/G-I1/G-I3. AP/Field Core·Distribution과 공식 `test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security` 게이트, 실 인증/모델/알림/결제/DNS/TLS도 남는다. 사용자 시각 검토는 아직 없다. 실제 고객 메시지·청구·운영 배포·삭제는 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 아래 명령으로 저장소/서비스/검사를 확인한다. 다음 I06 범위는 공급사 발송 직전 경로 재확인/unknown과 구독·보존 정책의 계약·테스트를 먼저 고정한다. 새 작업 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일/QA/명령을 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
ps -axo pid,command | rg 'apps/(agent|field)-api/dist/(server|field-event-worker|ap-event-worker)\.js|next-server'
pnpm test:spike:field-actions:agent
pnpm test:spike:integrator:field
pnpm test:spike:bookings:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
pnpm test:spike:independence:agent
pnpm test:spike:independence:field
FIELD_REVOKE_ORIGIN=ap FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I06 기존 연결 예약별 알림 세대 2 전환 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인의 AP·Field 독립 서비스를 실제 사용할 수 있게 완성한다. 문서는 5단계 최종 R02까지이며 `TASKS.md` 46개 중 implemented 1, in_progress 32, planned 13, verified 0이다. 현재 I06은 로컬 부분 구현이고 출시/공급사 검수는 미완료다.
- **완료 작업:** Field 고객의 유효 예약 확인키로 연결 해제 뒤 해당 예약의 향후 알림 담당 변경에 동의·철회하는 API/320px 화면을 만들었다. Field owner는 양쪽 해제 ACK·고객 동의를 보고 명시 전환한다. Field 서버는 마지막 예약 사건·revision·전환 ID를 연결별 HMAC으로 AP 공개 API에 보내고, AP는 이전 세대 사건 연속 처리와 고객 알림 `not_applicable`/`blocked_integration`을 대조한 후 자기 DB에 세대 1 종료 영수증을 보존한다. Field는 영수증·동의·예약 revision을 재확인해 예약별 세대 2를 켠다. 이후 새 Field 사건은 Field 고객 알림 원장만 만들고 AP 전달 원장에서는 제외한다. 고객 철회 뒤에는 자동 Field 알림을 중지하며 AP 경로는 자동 복구하지 않는다. 실제 발송은 하지 않았다.
- **수정 파일:** Field `apps/field-api/migrations/{000036_external_reservation_notification_routes,000037_reservation_event_notification_route}.sql`, `src/{app,external-reservation-notification-route,bookings,ap-event-delivery}.ts`, `test/integrator.db.test.ts`; AP `apps/agent-api/migrations/000044_field_notification_route_closures.sql`, `src/{app,field-notification-route-close}.ts`, `test/field-actions.db.test.ts`; Field 웹 `apps/field-web/src/field-booking.tsx`; 공개 `contracts/agent-integrator-v1.openapi.json`, `contracts/CONTRACT_NOTES.md`, `tools/test/agent-integrator-contract.test.mjs`; E2E `tools/spikes/{ap-field-connection-http.test.mjs,field-notification-route-browser.py,field-event-delivery-browser.py}`; `docs/{03_INTEGRATION_CONTRACT.md,technical/I06_NOTIFICATION_ROUTE_TRANSFER_DESIGN.md,technical/PHASE_2_EXECUTION_PLAN.md,CODEX_HANDOFF.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터 Markdown/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** 세대 전환은 연결 전체가 아닌 Field 예약 하나에 적용한다. 고객 동의는 Field 확인키와 동의 ID가 필요하고 AP 종료와 분리한다. AP HMAC 서명 원문은 `timestamp.transferId.connectionId.actionRequestId.reservationId.latestRevision.latestEventId.route-close`, 5분 시간창이며 동일 ID/본문 재시도만 같은 영수증이다. AP는 Field 원본을 직접 읽지 않고 자기 inbox/예약 사건·알림 원장만 대조한다. Field 예약 사건 insert trigger가 담당 제품/세대를 고정한다. 이전 사건을 다시 Field 알림으로 만들지 않으며 외부 공급사 미연결은 `blocked_integration`이다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17, Field Valkey worker, API 4311/4321, 웹 3001/3002, Chromium 320px. `pnpm test:spike:integrator:field` 고객 route 404 red→1/1 green·owner 전환 404 red→1/1 green; `pnpm test:spike:field-actions:agent` AP 종료 404 red→1/1 green; `node --test tools/test/agent-integrator-contract.test.mjs` 1/1; `pnpm test:spike:bookings:field` 3/3; `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, `pnpm test:spike:independence:agent`, `pnpm test:spike:independence:field` exit 0. 새 API·웹 빌드로 재시작한 후 `FIELD_EVENT_WORKERS_RUNNING=1 pnpm test:spike:ap-field:http` 1/1과 Field 시작/ AP 시작 해제의 `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python` 포함 실제 HTTP+320px 전체 각 1/1. 고객 동의→owner 전환→고객 상태, 후속 예약 취소의 Field 세대 2 `blocked_integration`/AP 미전달을 확인했다. Git 없음.
- **실패 접근/원인:** AP 종료 DB 검사는 첫 신규 경로 404 red였다. 영수증 테이블 FK 때문에 합성 조직 삭제가 실패해 테스트 정리에 영수증 삭제를 추가했다. Field 활성화 DB도 404 red였다. E2E 새 SQL 단언은 존재하지 않는 `ap_event_deliveries.id`를 읽어 실패해 `event_id`로 수정하고 재실행했다. 브라우저 전체 검사는 Field 웹을 빌드한 뒤 이전 Next 서버가 오래된 JS를 서빙해 기존 로그인 화면 스크립트가 시간 초과했다. 기존 웹 프로세스를 새 빌드로 재시작한 뒤 양방향 전체를 다시 실행해 통과했다. 브라우저 스크립트 기본 대기를 10초로 줄여 실패 지점을 드러냈다.
- **미검수/남은 작업:** Field 프로세스 중단 또는 화면 새로고침 뒤 전환 ID·AP 영수증 내구 재조정, AP 세대 1 종료와 Field 세대 2 활성화 사이 예약 revision 경쟁, 실제 공급사의 `unknown` 조회·AP 발송 직전 Field current route 재확인, 구독 종료·삭제/보존·재인가, 운영 서버 fault 및 정식 QA/G-I3가 남았다. AP/Field Core·Distribution과 공식 `test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security` 게이트, 실 인증/모델/알림/결제/DNS/TLS 공급사도 남았다. 사용자 디자인 시각 검토는 아직 없다. 고객 메시지 발송·청구·운영 배포·삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 아래로 저장소/서비스/테스트를 확인한다. 다음 I06 작업은 전환 ID를 Field DB에 내구 보존하고 AP 응답 분실/Field 재시작·예약 revision 경쟁을 보정하되 기존 예약 업무를 무기한 잠그지 않는 설계를 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. AP 공개 계약→제공자/Field 소비자 red→green→실제 두 서버 장애 검수 순서다. AP/Field 내부 DB/module import 금지, 실제 공급사 미연결 상태를 발송 성공으로 처리하지 않는다. `docs/03_INTEGRATION_CONTRACT.md`를 바꾸면 마스터를 재생성한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
ps -axo pid,command | rg 'apps/(agent|field)-api/dist/(server|field-event-worker|ap-event-worker)\.js|next-server'
pnpm test:spike:field-actions:agent
pnpm test:spike:integrator:field
node --test tools/test/agent-integrator-contract.test.mjs
pnpm lint
pnpm typecheck
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
FIELD_REVOKE_ORIGIN=ap FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I06 해제 뒤 AP 사건·고객 알림 상태 복구 조회 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 화면에 맞춰 독립 AP·Field 기능을 끝까지 연결해 사용할 수 있게 한다. `TASKS.md` 총 46개: implemented 1, in_progress 32, planned 13, verified 0. I06과 출시/공급사 검수는 미완료다.
- **완료 작업:** 해제된 연결의 기존 Field 예약에서 AP OAuth grant를 다시 열지 않고 ACK 사건의 AP 수신·처리·고객 알림 상태를 재조회한다. Field owner/예약 소속 확인 뒤 Field 서버가 연결별 키로 사건 ID를 서명하고 AP 공개 읽기 전용 endpoint가 서명/연결/ActionRequest/예약/사건 소속을 검사한다. AP 장애/404는 고객 미발송으로 추론하지 않고 Field 로컬 ACK와 `unavailable`을 보여준다. 양방향 해제 후 실제 HTTP·320px 예약 화면에서 AP `processed`와 고객 `blocked_integration`을 확인했다.
- **수정 파일:** AP `apps/agent-api/src/{field-event-recovery,app}.ts`, `test/field-actions.db.test.ts`; Field `apps/field-api/src/ap-event-status.ts`, `test/integrator.db.test.ts`; `contracts/{agent-integrator-v1.openapi.json,CONTRACT_NOTES.md}`, `tools/test/agent-integrator-contract.test.mjs`, `tools/spikes/{ap-field-connection-http.test.mjs,field-manual-contact-browser.py}`, `docs/{03_INTEGRATION_CONTRACT.md,technical/PHASE_2_EXECUTION_PLAN.md,CODEX_HANDOFF.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터 Markdown/HTML. DB migration/제품 간 내부 import 없음. Git 저장소/커밋 없음.
- **핵심 결정:** AP 복구 조회는 폐기된 OAuth token 대신 기존 연결별 32바이트 HMAC 키를 사용하며 `timestamp.eventId.connectionId.notification-status`·5분 시간창을 검증한다. API는 `1.0.0-preview.3`의 별도 경로이고 PII/원문·발송 기능이 없다. AP가 사건을 모르는 404와 네트워크 실패는 모두 Field 표시에서 확인 불가로 남긴다. 로컬 ACK는 원격 처리나 고객 발송 성공이 아니다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PG17, API 4311/4321, 웹 3001/3002, 별도 worker. `pnpm test:spike:field-actions:agent` 새 경로 404 red→서명/권한·PII 검수 1/1 green. `pnpm test:spike:integrator:field` 해제 후 `reauthorization_required` red→상태 복구/장애 ACK 보존 1/1 green. `node --test tools/test/agent-integrator-contract.test.mjs` 새 계약 경로 누락 red→1/1 green. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 새 빌드로 양쪽 API를 재시작한 뒤 Field 시작/AP 시작의 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http`, `FIELD_REVOKE_ORIGIN=ap FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 각 1/1. `FIELD_REVOKE_OUTAGE=ap FIELD_TEST_AP_SERVER_PID=48497 FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1; PID는 그 검수 중 종료/교체됐으므로 재사용하면 안 된다. 마지막 AP/Field readiness 200, API PID는 재확인 필요. Git 없음.
- **실패 접근:** 첫 Field 소비자 검사 기대가 재시도 차단된 사건의 배열 순서를 가정해 실패했다. 실제 사건별 delivery 상태에 따라 ACK 사건만 AP 복구 상태를 기대하도록 고쳐 전체 재실행했다. 초기 404/재인가 실패는 의도한 red 검사였다.
- **남은 작업:** I06 명시적 새 알림 경로/route generation 전환과 AP 발송 직전 Field route 확인, AP 공급사 unknown 조회/대체발송 금지, 구독 종료·삭제/보존·재인가. I04/I05 나머지, I07/I08과 AP/Field Core·Distribution 전체 검수, 실 인증/모델/알림/결제/DNS/TLS·운영 서버 및 공식 QA/G gate, 사용자 화면 시각 검토. 실제 고객 메시지·청구·운영 배포/삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 아래 명령으로 현재 상태를 확인한다. 다음 구현은 I06 명시적 알림 경로 전환의 계약/고객 접근·동의/unknown 처리 기준을 읽고 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 경로·QA·검사 명령을 먼저 기록한다. 제품 간 DB/module 공유 금지, 공급사 결과 미상은 발송 성공으로 표시하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
ps -axo pid,command | rg 'apps/(agent|field)-api/dist/(server|field-event-worker|ap-event-worker)\.js'
pnpm test:spike:field-actions:agent
pnpm test:spike:integrator:field
node --test tools/test/agent-integrator-contract.test.mjs
pnpm lint
pnpm typecheck
sed -n '204,225p' docs/03_INTEGRATION_CONTRACT.md
sed -n '80,84p' TASKS.md
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I06 양방향 실제 API 중단·재시작 회수 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 화면에 맞춰 독립 AP·Field의 기능을 끝까지 연결해 사용할 수 있게 한다. `TASKS.md`는 총 46개 중 implemented 1, in_progress 32, planned 13, verified 0이다. I06은 여전히 부분 구현이며 출시 승인이 아니다.
- **완료 작업:** 로컬 mock에서 AP API 프로세스를 실제 중단한 상태로 Field owner 연결 해제→Field 원격 `retry`/AP 미회수→AP 재시작 후 같은 회수 ID ACK를 확인했다. 반대 방향 Field API 중단→AP owner 해제→AP 원격 `retry`/Field 미회수→Field 재시작 뒤 같은 ID ACK도 확인했다. 두 방향 모두 자체 제품 API와 기존 AP 문의/Field 예약 확인키가 유지됐으며 320px 대기/완료 화면과 최종 source/grant/위젯 회수를 검수했다.
- **수정 파일:** `tools/spikes/ap-field-connection-http.test.mjs`, `tools/spikes/{field-connection-revoke-browser.py,field-connection-revoke-status-browser.py,agent-field-connection-revoke-browser.py,agent-field-connection-revoke-status-browser.py}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `docs/03_INTEGRATION_CONTRACT.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/CODEX_HANDOFF.md`, 재생성 마스터 Markdown/HTML. 제품 API·DB·계약 파일은 이 단계에서 바꾸지 않았다. Git 저장소/커밋 없음.
- **핵심 결정:** 장애 검사는 명시한 PID의 mock API 명령·로컬 DB host를 확인한 다음에만 해당 서버를 SIGTERM한다. HTTP 연결 거부로 실제 비가용을 검증하고 `finally`에서 같은 빌드/환경으로 되살린다. 재시도 상태와 동일 회수 ID를 DB·HTTP·320px 화면에서 분리 확인한다. 이 증빙은 로컬 프로세스 장애에 한정되며 운영 서버·공급사 성공이나 자동 알림 소유권 전환을 주장하지 않는다.
- **실제 테스트/환경/커밋:** 로컬 mock AP/Field PG17, API 4311/4321, 웹 3001/3002, 양쪽 별도 worker. `FIELD_REVOKE_OUTAGE=ap FIELD_TEST_AP_SERVER_PID=90492 FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 최종 1/1, `FIELD_REVOKE_OUTAGE=field FIELD_REVOKE_ORIGIN=ap FIELD_TEST_FIELD_SERVER_PID=56174 FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1. 두 명령의 PID는 검수 시점 값으로 현재 재사용 불가하다. `node --check tools/spikes/ap-field-connection-http.test.mjs`, Python 두 스크립트 `py_compile`, `pnpm lint`, `pnpm typecheck` exit 0. Git 없음.
- **실패 접근:** 첫 AP 장애 전체 검사에서 복구 상태 브라우저가 Field 연결 화면에서 로그인 폼을 찾아 timeout됐다. Field 작업 화면에서 로그인 뒤 연결 화면으로 이동하게 고쳐 전체 재실행 통과했다. 다음 단계에서 실제 비가용을 비 200이 아닌 HTTP 연결 실패로 강화하고 AP 방향 전체를 다시 실행해 통과했다.
- **남은 작업:** I06 route generation/새 알림 경로와 발송 직전 소유자 재확인, 구독 종료·삭제/보존·재인가, AP 발송 결과 미상 확인. I04/I05 잔여, I07/I08, 실 인증/AI/알림/결제/DNS/TLS, 운영 서버 격리·복구 및 공식 fault/security/E2E/QA·출시 gate, 사용자 화면 시각 검토. 실제 고객 발송/청구/운영 배포/데이터 삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 아래 명령으로 현재 서버와 계약·작업 상태를 확인한다. 다음 I06 route generation/알림 소유자 전환 범위는 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일·QA·명령을 먼저 기록하고 공개 계약→양쪽 소비자 검사→각 제품 구현 순서로 진행한다. 한 제품이 다른 제품 DB/module을 직접 읽지 않는다. 정식 공급사 성공을 mock으로 처리하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
ps -axo pid,command | rg 'apps/(agent|field)-api/dist/(server|field-event-worker|ap-event-worker)\.js'
sed -n '1,105p' TASKS.md
sed -n '260,276p' docs/03_INTEGRATION_CONTRACT.md
sed -n '1,55p' docs/technical/PHASE_2_EXECUTION_PLAN.md
pnpm lint
pnpm typecheck
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I06 해제 뒤 기존 Field 예약 직접 연락 기록 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 화면에 맞춰 독립 AP·Field 기능을 끝까지 연결하고 사용할 수 있는 환경을 만든다. `TASKS.md`는 46개 중 implemented 1, in_progress 32, planned 13, verified 0이다. I06과 전체 제품 검수/출시는 아직 미완료다.
- **완료 작업:** 양쪽 중 어느 owner가 연결을 해제해도 Field가 기존 수신 예약/고객 확인키를 보존한다. Field owner는 기존 예약의 각 원본 사건에 대한 실제 전화·대면 연락 시도 또는 고객 도달을 별도 내구 원장에 기록·조회한다. 활성 연결은 기록을 거부하고 타 조직/예약 사건을 숨긴다. 동일 시도 ID/내용 재시도는 같은 영수증, 변경된 결과는 409다. 예약 화면은 AP 수신/처리/고객 알림과 이 수동 기록을 구분하며 새로고침 뒤에도 보인다. 알림 원장이나 route generation은 바꾸지 않는다.
- **수정 파일:** Field `apps/field-api/migrations/{000034_external_reservation_contacts,000035_manual_contact_actor_retention}.sql`, `src/{external-reservation-contacts,app}.ts`, `test/integrator.db.test.ts`; Field 웹 `apps/field-web/src/{field-api,field-booking}.tsx`; `tools/spikes/{ap-field-connection-http.test.mjs,field-manual-contact-browser.py}`, `docs/{03_INTEGRATION_CONTRACT.md,technical/PHASE_2_EXECUTION_PLAN.md,CODEX_HANDOFF.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터 Markdown/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** 수동 연락 기록은 Field 원본 업무의 별도 사건이며 Field나 AP의 자동 고객 알림 성공으로 취급하지 않는다. 예약 사건 ID에 묶고 연락처/본문은 이 원장·outbox에 복제하지 않는다. 담당자 계정 삭제는 actor 참조만 null로 만들고 연락 사건을 유지한다. 실행 전 AP 발송 미상 여부를 사업자가 확인하도록 화면에 안내하지만 공급사 결과 확인·route generation 전환은 아직 구현되지 않았다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PG17, API 4311/4321, 웹 3001/3002, 별도 worker. 신규 GET 404 red→`pnpm test:spike:integrator:field` 1/1 green; 활성 연결 409, 타인/타 사건 404, 동일 제출/다른 결과, owner 삭제 뒤 사건 보존. `pnpm test:spike:bookings:field` 3/3. Field 시작과 AP 시작 해제 각각 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http`, `FIELD_REVOKE_ORIGIN=ap FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 최종 1/1; 320px 화면에서 정확한 기존 예약 선택·연락 시도 저장·새로고침 복구, Field 고객 알림 0건/AP 알림 수 불변. 두 HTTP/브라우저 검사는 actor FK 보존 migration `000035` 직전에 실행됐고, 이 migration 적용 후 Field DB 1/1·`pnpm lint`·`pnpm typecheck`·`pnpm test:unit`(AP API 3/Field API 3/AP 웹 8/Field 웹 9/도구 3)·`pnpm build:field`·`pnpm build:web:field`·import/DB 격리 exit 0. 새 Field API/worker를 빌드 뒤 다시 시작했다. Git 없음.
- **실패 접근:** 첫 전체 HTTP/브라우저 검사에서 동명이인 예약 두 건 중 최신 행을 선택해 UI 연락 기록은 보였으나 검사 대상 예약의 DB 수가 0이었다. 버튼에 정확한 예약 ID를 결합하고 브라우저가 그 행을 선택하게 수정해 양방향 전체를 재실행했다. 신규 API 전 404 red도 기록했다.
- **남은 작업:** I06의 명시적 새 알림 경로/route generation 전환, 실제 API 중단→재시작 내구 회수, 구독 종료·보존/삭제/재인가, AP 발송 결과 미상 조회와 provider 발송 직전 소유자 재확인. I04/I05 잔여, I07/I08, 실 인증/AI/알림/결제/DNS/TLS, 정식 보안·복구/QA·출시 gate 및 사용자 시각 검토. 실제 고객에게 연락/문자 발송, 청구, 운영 배포, 데이터 삭제는 하지 않았다. 정식 `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`는 미실행이다.
- **다음 에이전트 정확한 명령:** 아래 명령과 현행 코드/DB 상태를 확인하고 `TASKS.md` I04~I07, 연동 계약 4.8/4.11~4.12, QA148~155/G-I3를 읽는다. 다음 범위는 route generation/알림 경로 또는 실제 API 중단→재시작 회수 검수다. `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일·QA·명령을 먼저 기록한다. 한 제품의 원장이나 모듈을 다른 제품이 직접 조회하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pgrep -fl 'apps/(agent|field)-api/dist/(server|field-event-worker|ap-event-worker)' || true
pnpm test:spike:integrator:field
pnpm test:spike:bookings:field
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
FIELD_REVOKE_ORIGIN=ap FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I06 양방향 연결 해제 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 시안의 AP·Field 독립 서비스를 기능까지 완성한다. `TASKS.md`는 46개 중 implemented 1, in_progress 32, planned 13, verified 0이다. I06은 양방향 해제의 부분 구현으로, 운영 출시 상태가 아니다.
- **완료 작업:** Field owner와 AP owner 각각의 명시 해제 API·화면이 자기 연결과 source/설치·위임 grant를 즉시 차단한다. 제품별 내구 원장·독립 worker가 연결별 HMAC 서명 해제를 상대 공개 HTTP에 재시도한다. 수신자는 키/서명/시간창·동일 ID 재전송을 검사해 로컬 연결·grant/Field 설치를 회수한다. AP 문의 원본·Field 수신 예약/고객 확인키는 보존하고 원격 상태를 pending/retry/acked/blocked로 구분한다.
- **수정 파일:** AP `apps/agent-api/migrations/{000042_field_connection_revocations,000043_field_remote_revocations}.sql`, `src/{field-connection-revoke,field-connection-revoke-worker,field-connector,field-event-worker,app}.ts`, `test/{field-actions,field-connection}.db.test.ts`, `apps/agent-web/src/{agent-field-connections.tsx,agent-field-connections.css}`; Field `apps/field-api/migrations/{000032_ap_connection_revocations,000033_ap_received_connection_revocations}.sql`, `src/{ap-connection-revoke,ap-connection-revoke-receiver,ap-connector,ap-event-worker,app}.ts`, `test/ap-connection.db.test.ts`, `apps/field-web/src/{field-ap-connections.tsx,site.css}`; 공개 `contracts/{agent,field}-integrator-v1.openapi.json`와 정적 계약 검사, `tools/spikes/{ap-field-connection-http.test.mjs,field-connection-revoke-browser.py,agent-field-connection-revoke-browser.py}`, `docs/{03_INTEGRATION_CONTRACT.md,technical/PHASE_2_EXECUTION_PLAN.md,CODEX_HANDOFF.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터 Markdown/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** 양쪽 내부 DB/module/session은 분리하고 기존 bind의 연결별 32바이트 HMAC 키로만 server-to-server 해제를 인증한다. 각 제품은 로컬 차단 뒤 원격 영수증을 기다리며 ACK를 받기 전 원격 완료를 표시하지 않는다. OAuth `manage` 범용 외부 client 해제는 아직 미구현이다. 연결 예약 고객 알림 소유권은 자동 전환하지 않으며 고객에게 임의 대체 문자를 보내지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17, API 4311/4321, 웹 3001/3002, 양쪽 별도 사건 worker. Field/AP DB 제공자·소비자 각 `pnpm test:spike:ap-connection:field`, `pnpm test:spike:field-connection:agent`, `pnpm test:spike:field-actions:agent` 1/1, 공개 정적 계약 2/2. `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http`와 `FIELD_REVOKE_ORIGIN=ap FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 최종 각 1/1; 320px owner 해제→반대쪽 원격 ACK·가로 넘침 없음/page error 0, Field 설치 중지·OAuth access token 폐기, 기존 Field 예약 확인키/AP 문의 보존. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(AP API 3/Field API 3/AP 웹 8/Field 웹 9/도구 3), `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Git 없음.
- **실패 접근:** 선행 DB/계약 경로는 404 또는 누락으로 red 확인 후 구현해 green. 첫 Field UI browser는 로그인 대기 부족 timeout과 긴 public ID의 320px 넘침을 찾아 대기/줄바꿈을 고쳤다. 추가 실 HTTP DB 단언은 UUID/text 조인 오류로 한 번 실패했고 검사 SQL만 수정해 양방향 전체를 재실행했다.
- **남은 작업:** I06 route generation 전환·새 알림 경로/구독 종료/삭제·보존, 실제 상대 API 프로세스 중단→재시작 회수, 재인가/키 회전. I04/I05 미완료 범위와 I07/I08, AP/Field 실 인증/AI/알림/구독/DNS/TLS, 정식 QA/보안/복구/출시 gate, 사용자 시각 검토. 실제 고객 발송·청구·운영 배포·데이터 삭제는 수행하지 않았다. 정식 `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`와 운영 환경 검수는 미실행이다.
- **다음 에이전트 정확한 명령:** 아래 명령으로 로컬 상태를 확인한다. `TASKS.md` I04~I07, `docs/03_INTEGRATION_CONTRACT.md` 4.8~4.12, QA146/150~159를 읽고 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 다음 변경 경로·QA·명령을 먼저 적는다. I06의 route generation/알림 소유권 전환은 기존 미상 고객 발송을 대체 성공으로 처리하지 말고 계약/양쪽 DB 테스트부터 진행한다. AP/Field 내부 DB/module을 교차 참조하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pgrep -fl 'apps/(agent|field)-api/dist/(server|field-event-worker|ap-event-worker)' || true
pnpm test:spike:field-connection:agent
pnpm test:spike:ap-connection:field
pnpm test:spike:field-actions:agent
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
FIELD_REVOKE_ORIGIN=ap FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I05 Field 예약 사건 전달·AP 처리 상태 조회 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인의 독립 AP·Field 서비스를 기능까지 완성한다. `TASKS.md` 46개 중 `implemented` 1, `in_progress` 31, `planned` 14, `verified` 0. 이번 I05 보강은 부분 구현이며 운영 출시는 아니다.
- **완료 작업:** AP 공개 OAuth `GET /integrations/v1/events/{id}/delivery`가 현재 `ap.conversations.read` grant, client/actor/조직/AI/선택 배포/연결 및 ActionRequest·예약 사건 소속을 확인해 AP 수신·처리·고객 알림·열람 기록 상태만 제공한다. Field owner `GET /v1/owner/reservations/{id}/event-deliveries`가 Field 자체 예약/전송 원장을 읽고 ACK 사건에 한해 AP 공개 API를 조회한다. AP 장애에도 Field 예약·로컬 ACK는 보이며 원격 상태는 `unavailable`이다. Field 예약 화면에서 연결 예약 출처와 Field 전달/AP 처리/고객 알림/열람을 분리하고 상태를 새로고침한다. 직접 예약에는 AP 조회가 없다.
- **수정 파일:** `apps/agent-api/src/integrator-routes.ts`, `test/field-actions.db.test.ts`; `apps/field-api/src/{ap-event-status,app}.ts`, `test/integrator.db.test.ts`; `apps/field-web/src/field-api.ts`, `field-booking.tsx`; `contracts/agent-integrator-v1.openapi.json`, `tools/test/agent-integrator-contract.test.mjs`, `tools/spikes/{ap-field-connection-http.test.mjs,field-event-delivery-browser.py}`, `docs/{03_INTEGRATION_CONTRACT.md,technical/PHASE_2_EXECUTION_PLAN.md,CODEX_HANDOFF.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터 Markdown/HTML. Git 저장소·커밋 없음.
- **핵심 결정:** Field 전송 `acked`는 AP inbox 수신 응답이며 AP 처리/고객 발송/고객 열람과 다르다. AP 원본 대화·고객 PII는 Field 상태 조회에 복제하지 않는다. Field 예약 상세 로딩과 원격 AP 상태 조회를 분리한다. 기존 `ap.conversations.read` 동의만 사용하고 현재 권한·배포를 매 조회에 재검증한다. Field 직접 예약의 알림 상태는 기존 Field 원장만 따른다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17, API 4311/4321, 웹 3001/3002, 별도 AP/Field 사건 worker. 신규 AP DB 기대 404, 정적 계약 경로 누락, Field BFF DB 기대 404를 red로 확인한 뒤 `pnpm test:spike:field-actions:agent` 1/1, `pnpm test:spike:integrator:field` 1/1, AP 정적 계약 1/1 green. AP DB는 타 사건/선택 배포 제외 404, revoke 401; Field DB는 타인 404, AP 503 시 로컬 ACK 보존 확인. `pnpm test:spike:integrator:agent`·`pnpm test:spike:ap-connection:field` 각 1/1. 최종 Field 웹 build/restart 뒤 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 실제 두 서버·worker HTTP 1/1: rev0/확정 rev1 ACK·processed, 고객 알림 `not_applicable`/`blocked_integration`, 고객 읽음 `not_recorded`. Chromium 320px 사업자 예약 상세/상태 새로고침은 가로 넘침 없음/page error 0. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(AP API 3/Field API 3/AP 웹 8/Field 웹 9/도구 3), `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py` passed(`document_package_only`, `service_tests_executed=false`). Git 없음.
- **실패 접근·복구:** 구현 전 각 신규 경로·계약을 실패 기대값으로 확인하고 해당 제공자/소비자 구현 뒤 재실행했다. AP DB 검사 중 백그라운드 worker가 수신 직후 사건을 처리하면 수신 전 기대값과 경합하므로 해당 worker를 중지하고 DB 검사를 실행한 뒤 새 빌드로 다시 시작했다. 그 외 미해결 실패 없음.
- **남은 작업/외부 승인:** I04 AI 대화 중 직접 업무 제출·첨부 인증 복사; I05 route 전환과 발송 직전 재확인; I06~I08 양방향 revoke, 재인가, 키 회전, 장애 재조정과 계약/fault 회귀. AP/Field 독립 구독·실 인증/LLM/알림/DNS/TLS 공급사, 보안/복구/QA·출시 게이트와 사용자 시각 검토는 남았다. 실제 고객 발송·읽음·청구·배포·데이터 삭제는 하지 않았다. 정식 `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security` 및 운영 서버 검수는 미실행이다.
- **다음 에이전트 정확한 명령:** 아래 상태/검사를 확인하고 `TASKS.md` I04~I07, 연동 계약 4.8~4.11, QA148~159를 읽는다. 다음 범위는 I06의 revoke/route 전환과 발송 직전 소유자 재확인이다. `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 경로·QA·명령을 먼저 기록하고 공개 계약→양쪽 DB 소비자 검사→실제 두 서버 장애 검수 순서로 진행한다. AP/Field 내부 DB/module 공유나 실 발송 성공 모의는 금지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pgrep -fl 'field-event-worker|ap-event-worker|apps/(agent|field)-api/dist/server' || true
pnpm test:spike:field-actions:agent
pnpm test:spike:integrator:field
pnpm test:spike:integrator:agent
pnpm test:spike:ap-connection:field
FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I04/I05 Field 서명 예약 사건 자동 전달 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인 기준 AP·Field 기능을 끝까지 연결해 로컬에서 사용할 수 있게 한다. 사용자 화면 시각 검토는 아직 하지 않았으며 기능 구현을 우선한다. `TASKS.md` 총 46개: C00 `implemented` 1, `in_progress` 31, `planned` 14, `verified` 0. I04/I05는 아직 `in_progress`이고 출시 승인이 아니다.
- **완료 작업:** 양방향 OAuth bind에 연결별 `eventKeyId`/32바이트 secret/route generation 1을 포함하고 두 제품이 각자 다른 목적 키로 암호화한다. Field의 외부 예약 원본 사건과 outbox를 재조정해 Field 전용 `ap_event_deliveries` 원장/worker가 PII 없는 사건을 HMAC-SHA256으로 AP 공개 HTTP에 전달한다. 202는 durable AP inbox 수락으로만 기록하며 결과 미상·429/일시 장애에는 같은 event ID와 새 timestamp/서명으로 재시도한다. AP는 64KiB/엄격한 envelope·시간창 ±5분·키/연결/본문 서명 확인 후 `field_event_inbox`에 저장한다. AP 전용 worker는 ActionRequest/예약/route/revision을 확인해 역순 사건을 보류하고 기존 AP 예약 사건/고객 알림 원장을 한 트랜잭션으로 멱등 생성한다. 실 고객 발송은 하지 않고 `blocked_integration`으로 남긴다. 기존 고객 수동 `sync-events`도 유지한다.
- **수정 파일:** AP `apps/agent-api/migrations/000039_field_event_route.sql`, `000040_field_event_inbox.sql`, `000041_field_event_inbox_retry.sql`, `src/{field-connector,field-actions,field-event-inbox,field-event-worker,app}.ts`, `package.json`, `test/{field-connection,field-actions}.db.test.ts`; Field `apps/field-api/migrations/000030_ap_event_route.sql`, `000031_ap_event_deliveries.sql`, `src/{integrator-routes,ap-event-delivery,ap-event-worker}.ts`, `package.json`, `test/{ap-connection,integrator}.db.test.ts`; `contracts/{agent,field}-integrator-v1.openapi.json`, `tools/test/{agent,field}-integrator-contract.test.mjs`, `tools/spikes/ap-field-connection-http.test.mjs`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/{03_INTEGRATION_CONTRACT.md,technical/PHASE_2_EXECUTION_PLAN.md,CODEX_HANDOFF.md}`와 재생성 마스터 Markdown/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** AP/Field는 상대 DB/module/secret/worker를 공유하지 않는다. 연결별 비밀은 server-to-server bind에서만 전달하고 브라우저에 주지 않는다. Field `reservation_events`와 동일 트랜잭션 outbox가 사건 원본이며 `ap_event_deliveries`는 전송 상태, AP inbox는 수신 상태, AP `field_reservation_events`는 처리 상태다. 202·processed·고객 공급사 발송·읽음은 서로 다르다. Field는 AP 장애 시 고객 문자를 대신 자동 발송하지 않는다. 기존 키 없는 연결은 수동 동기화만 가능하다. route generation 1만 구현되어 키 회전/route 전환은 후속이다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17, 별도 API 4311/4321. Field bind의 바뀐 키 replay는 기존 200→기대 409 red 후 `pnpm test:spike:ap-connection:field` 1/1 green, AP bind 키 누락은 `binding_unknown` red 후 `pnpm test:spike:field-connection:agent` 1/1 green. `pnpm test:spike:integrator:field` 1/1은 서명 3건·PII 비노출·응답 분실 뒤 동일 ID 재시도·grant revoke blocked. `pnpm test:spike:field-actions:agent` 1/1은 잘못된/만료 서명, 중복 202, 같은 ID 다른 본문 409, 역순 rev 보류→처리, 알림 한 건. `node --test tools/test/agent-integrator-contract.test.mjs tools/test/field-integrator-contract.test.mjs` 2/2. API를 새 빌드로 재시작한 `pnpm test:spike:ap-field:http` 실제 HTTP 1/1은 rev0/확정 rev1의 서명 전달과 수동 조회 중복 방지를 확인했다. 두 전용 worker 실행 뒤 `FIELD_EVENT_WORKERS_RUNNING=1 pnpm test:spike:ap-field:http` 실제 HTTP 1/1에서 두 사건이 자동 `acked`/`processed`가 됐다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(AP API 3/Field API 3/AP 웹 8/Field 웹 9/도구 3), `pnpm build:agent`, `pnpm build:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 브라우저와 정식 gate는 이번 변경 뒤 실행하지 않았다.
- **실패 접근·복구:** AP inbox migration `000040`이 로컬 DB에 이미 적용되어 `next_attempt_at` 추가는 적용 전 migration 수정 대신 새 `000041`로 분리했다. 중간 `pnpm typecheck`는 DB 테스트의 미확정 event ID를 header에 사용해 실패했고 문자열 변환 후 통과했다. 새 Field/AP webhook 경로의 외부 HTTP 검수 전 구 API 프로세스를 종료하고 최신 빌드로 다시 시작했다. 공급사 장애는 Field DB 합성 fetcher의 ACK 분실로 검수했으며 실제 API 프로세스 중단 중 재전송은 미검수다.
- **남은 작업:** I04 AI 대화 중 직접 ActionRequest 제출, 첨부 인증 복사/scan; I05 Field 화면의 AP inbox 처리·고객 발송 결과 조회; I06/I07 revoke/route 전환·키 회전·지연/장애/서명 재생 운영 검수; AP 발송 직전 Field 현재 route 확인과 실 알림 공급사. worker의 정식 retry 한도/SLA·대규모 backlog 성능, 서버 배포 설정/재시작/모니터링, 실 인증/모델/결제/DNS/TLS와 전체 정식 QA/G gate는 남았다. 이번 변경 뒤 320px 브라우저는 다시 실행하지 않았다. 고객 발송·청구·배포·삭제는 하지 않았다.
- **다음 에이전트 정확한 명령:** 먼저 아래 명령으로 현재 로컬 상태를 재확인한다. `TASKS.md` I04~I07, `docs/03_INTEGRATION_CONTRACT.md` 4.8~4.11, QA148~159를 읽고 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 새 작업 범위/QA/검사 명령을 적는다. 다음 우선순위는 Field 사업자 사건 전달/미발송 결과 조회와 AP 처리 결과 API, 또는 I06 양방향 revoke/route 전환이다. 공개 계약→제공자/소비자 테스트→제품별 구현 순서로 진행한다. 별도 제품 DB/module import와 가짜 실 발송/출시 pass는 금지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:field-actions:agent
pnpm test:spike:integrator:field
pnpm test:spike:field-connection:agent
pnpm test:spike:ap-connection:field
pnpm build:agent
pnpm build:field
AP_PROFILE=mock node --env-file=infra/agent/.env apps/agent-api/dist/field-event-worker.js
FIELD_PROFILE=mock node --env-file=infra/field/.env apps/field-api/dist/ap-event-worker.js
FIELD_EVENT_WORKERS_RUNNING=1 pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I04/I05 연결 예약 사건 조회·AP 알림 원장 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인에 맞춰 독립 AP·Field의 기능을 실제 사용할 수 있게 완성한다. 사용자의 화면 디자인 검토 전에도 기능 구현을 진행한다. `TASKS.md` 46개 중 C00 `implemented` 1, `in_progress` 31, `planned` 14, `verified` 0이다. I04/I05는 계속 부분 구현이고 운영 출시 승인이 아니다.
- **완료 작업:** Field 공개 `GET /integrations/v1/external-requests/by-source/{actionId}/events`가 현재 조직/client/grant/actor/connection과 `field.requests.read`를 확인하고 연결 예약의 rev0부터 최신 사건까지 ID·revision·상태·시각만 제공한다. 이름·전화·요약·취소 사유를 반환하지 않는다. Field 확정/제안/취소 등 연결 예약의 고객 알림 표지를 AP 담당으로 일관되게 기록하고 Field 고객 알림 원장을 만들지 않는다. AP는 고객 대화 확인키의 `POST /v1/inquiries/{id}/field-actions/{actionId}/sync-events`에서 공개 HTTP로 사건을 읽고 전체 revision·원본 ID·조직/connection/예약을 검사해 자기 사건/outbox 원장에 한 번만 저장한다. 확정 등 사업자 사건의 AP 고객 알림 원장은 한 건만 `blocked_integration`으로 만들고, 화면에는 Field 예약 상태와 외부 알림 미발송을 분리해 표시한다. 서명 webhook/자동 실행이 아닌 고객 수동 상태 확인이다.
- **수정 파일:** Field `apps/field-api/src/bookings.ts`, `test/integrator.db.test.ts`; AP `apps/agent-api/migrations/000038_field_reservation_events.sql`, `src/field-actions.ts`, `test/field-actions.db.test.ts`, `apps/agent-web/src/agent-field-action.tsx`; `contracts/field-integrator-v1.openapi.json`, `tools/test/field-integrator-contract.test.mjs`, `tools/spikes/{ap-field-connection-http.test.mjs,field-action-browser.py}`; `docs/{03_INTEGRATION_CONTRACT.md,technical/PHASE_2_EXECUTION_PLAN.md,CODEX_HANDOFF.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터 Markdown/HTML. Git 저장소가 없어 커밋 없음.
- **핵심 결정:** Field `reservation_events`가 원본이며 AP가 Field 내부 DB나 모듈을 읽지 않는다. `field.requests.read`와 현재 양방향 동의가 있어야 수동 동기화한다. AP 원장은 `(field_event_id)` 및 `(action_request_id,revision)`을 유일하게 보관하고 동일 사건 재조회와 누락/원본 충돌을 구분한다. 원본 사유·고객 연락처는 AP 사건 payload에 복제하지 않는다. 현재 초기 `route_generation=1`을 보관하지만 route 전환/발송 직전 재확인은 미구현이다. Field→AP 조회 성공과 고객 공급사 발송 성공은 다르며 실제 발송하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17, API 4311/4321·웹 3001/3002. Field 제공자 새 API 404 red 후 `pnpm test:spike:contracts:field` 정적 1/1+DB 1/1 green(401/403·rev0/확정/취소·PII/사유 비노출). AP 새 sync 404 red 후 `pnpm test:spike:field-actions:agent` 1/1 green(중복 알림 1건, revision 누락 502, 사건 ID/예약 시각 충돌 409, Field 503, 고객 알림 blocked). `pnpm test:spike:bookings:field` 3/3, `pnpm test:spike:ap-field:http` 실제 양쪽 HTTP 1/1, `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 실제 HTTP+320px Chromium 전체 1/1: Field 확정→AP 동기화/중복 방지, Field 고객 알림 0, AP blocked 한 건과 화면 표시, 고객 1회 인계·Field 독립 키 및 AP 위임 답변. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(AP API 3/Field API 3/AP 웹 8/Field 웹 9/도구 3), `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Git 없음.
- **실패 접근과 복구:** 새 Field/AP 경로는 각각 404 red를 확인했다. 실제 브라우저 첫 3회는 기존 확정 action의 접수 문구를 새 action 완료로 착각해 기존 handoff를 열었고 기대했던 새 요청 화면을 기다리다 시간 초과됐다. 새 action 목록 수 증가를 기다리고 새 행의 handoff를 누르도록 고쳐 전체 1/1 통과했다. AP/Field API와 AP 웹을 최신 코드로 다시 시작했다.
- **미검수/남은 작업:** I04/I05의 signed webhook inbox ACK/자동 재전송·백그라운드 누락 재조정, AP 발송 직전 Field route/current generation 확인, Field 사업자 화면의 사건 전달/공급사 결과 조회, revoke/route 전환·부분 장애, AI 대화 중 직접 ActionRequest 제출·첨부 인증 copy/scan이 남았다. `route_generation=1`은 초기 기록값뿐이다. 실 인증/모델/알림/결제/DNS/TLS 공급사·운영 서버와 정식 `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`/QA/G gate는 미실행·미완료다. 이번 변경 후 Field 웹 build는 실행하지 않았다. 고객 발송·청구·배포를 하지 않았다.
- **다음 에이전트 정확한 명령:** `TASKS.md` I04~I07, `docs/03_INTEGRATION_CONTRACT.md` 4.8~4.9와 QA148~155를 읽고 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 다음 범위/경로/검사 명령을 먼저 적는다. 우선 Field outbox→서명 webhook→AP durable inbox/202→멱등 처리와 주기적 누락 재조정, 또는 Field 사업자 사건/알림 결과 조회를 완성한다. 연결별 secret/키 회전·route generation·현재 권한을 공개 계약으로 설계하고 AP/Field 내부 DB/module import를 하지 않는다. mock DB 테스트와 실제 두 서버 HTTP를 실행하되 정식 출시 gate로 주장하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:contracts:field
pnpm test:spike:field-actions:agent
pnpm test:spike:bookings:field
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I05 AP 답변 초안·응답 미상 재시작 복구 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 디자인대로 AP·Field 독립 서비스를 실제 사용할 수 있게 완성한다. 화면 디자인/흐름의 사용자 검토는 아직 하지 않았고 기능 연결을 우선한다. `TASKS.md` 46개 중 implemented 1, in_progress 31, planned 14, verified 0. I05는 계속 부분 구현이며 출시 승인이 아니다.
- **완료 작업:** Field는 AP 원본에 답변하기 전에 미전송 본문 암호문·원래 AP revision·멱등 키를 Field DB에 보관한다. AP 호출 결과가 미상이면 다른 본문/새 키를 거부하고 같은 제출을 재시도한다. 새 Field API 인스턴스와 320px 브라우저 새로고침 뒤에도 초안이 복원된다. AP가 수락하면 Field 본문 암호문을 제거하고 AP message ID/revision/알림 상태만 멱등 영수증으로 남긴다. Field→브라우저 응답만 분실된 경우 영수증을 조회해 AP 저장을 확인한다. AP 원본 대화는 여전히 Field에 복제하지 않는다.
- **수정 파일:** `apps/field-api/migrations/000029_ap_reply_drafts.sql`, `apps/field-api/src/ap-conversations.ts`, `apps/field-api/test/ap-connection.db.test.ts`, `apps/field-web/src/field-workspace.tsx`, `tools/spikes/{ap-field-connection-http.test.mjs,field-external-inquiry-browser.py}`, `docs/{03_INTEGRATION_CONTRACT.md,technical/PHASE_2_EXECUTION_PLAN.md,CODEX_HANDOFF.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성 마스터 Markdown/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** Field의 자료는 AP transcript가 아닌 미전송 초안 한 건이다. 본문은 Field AP connector 키에서 목적을 분리한 AES-GCM 키로 암호화하고, 수락 뒤 복호화 가능한 본문을 지운다. AP 원본에 먼저 도달하기 전 Field DB에 초안을 commit한다. 같은 문의의 미결 초안은 하나만 허용하고 AP의 멱등 키를 재사용한다. 수락 영수증은 본문 HMAC·원래 revision·AP message ID/알림 상태를 보존해 Field 응답 분실 시 중복 AP 답변을 막는다. 하나의 AP revision에 다른 본문을 보내려 하면 409다. Field는 고객 알림을 재발송하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17, API 4311/4321·웹 3001/3002, Chromium 320px. `pnpm test:spike:ap-connection:field` 1/1(타 actor 거부, 암호문, 합성 AP 응답 분실→다른 내용 409→새 앱 인스턴스 동일 키 replay→본문 삭제/같은 응답 캐시), `pnpm test:spike:integrator:agent` 1/1, `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 실제 두 서버 HTTP+320px 1/1(로컬 reply scope 제거로 실패 재현→새로고침 초안 복원→scope 복원 뒤 같은 제출 성공, Field→브라우저 응답 분실 후 AP 영수증 확인). `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(AP API 3, Field API 3, AP 웹 8, Field 웹 9, 도구 3), `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Git 없음.
- **실패 접근과 복구:** 새 draft GET 기대 테스트는 404 red였고 migration/API 뒤 green. 실제 AP 응답 분실은 Field DB 테스트의 synthetic fetcher로 재현했다. 브라우저는 첫 단계에서 scope 403으로 서버 초안 보관/새로고침을, 다음 단계에서 서버 응답만 분실시켜 AP 수락 영수증을 검사했다. 새로운 회귀 실패는 없었다.
- **미검수/남은 작업:** I05 예약 후속 사건/알림 소유·결과 조회, 양방향 revoke/부분 장애·actor 변경, 암호화 키 회전/영수증 보존 정책과 정식 QA144/145/148/149/G-I2. I04 AI 대화 중 직접 제출·첨부 인증 복사·예약 확정/제안/변경 사건→AP 단일 고객 알림이 남았다. 실 인증/모델/알림/결제/DNS/TLS 공급사, 서버 운영 검수, 공식 `test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`는 미실행/미구현 gate다. 서비스 출시/고객 발송/청구는 하지 않았다.
- **다음 에이전트 정확한 명령:** `TASKS.md` I04/I05/I06, `docs/03_INTEGRATION_CONTRACT.md` 4.6~4.9, QA144~155를 읽는다. 다음 작업의 경로·요구/QA·검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 우선 I04 연결 예약 확정/제안/변경 사건→AP 원장·단일 고객 알림 경로 또는 I05 알림 결과 조회를 공개 HTTP 계약부터 연결한다. AP/Field 내부 DB/module을 서로 import하지 않는다. 실 공급사/출시 gate를 통과 처리하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:ap-connection:field
pnpm test:spike:integrator:agent
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I05 Field의 AP 원본 위임 답변 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 디자인대로 AP·Field 독립 서비스를 실제 사용할 수 있게 완성한다. 5단계 최종 R02까지 진행 중이며 `TASKS.md` 46개 중 `implemented` 1, `in_progress` 31, `planned` 14, `verified` 0이다. 이번 I05는 부분 구현이며 출시/고객 발송 승인이 아니다.
- **완료 작업:** Field owner가 수신한 AP 외부 문의에서 원본 대화와 고객 공개 메시지를 Field BFF→AP 공개 OAuth API로 읽는다. 별도 `ap.conversations.reply` 동의·현재 grant/조직/actor/배포/Field 양방향 결합을 확인한 뒤 AP 원본에 revision+멱등 키로 답변한다. AP가 메시지 ID/sequence/outbox/고객 알림 원장을 부여하며 Field DB는 AP transcript를 복제하지 않는다. 응답 미상인 열린 화면에서 답변 초안·원래 revision·제출 키를 보존해 같은 제출로 확인한다. AP 저장과 고객 외부 알림 `blocked_integration`을 따로 표시한다.
- **수정 파일:** Field `apps/field-api/src/{ap-connector,ap-conversations,app}.ts`, `test/ap-connection.db.test.ts`, 웹 `apps/field-web/src/{field-workspace,field-ap-connections}.tsx`, `tools/{setup-mock-ap-connector.mjs,spikes/ap-field-connection-http.test.mjs,spikes/field-external-inquiry-browser.py}`, `docs/{03_INTEGRATION_CONTRACT.md,technical/PHASE_2_EXECUTION_PLAN.md,CODEX_HANDOFF.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 재생성 마스터 Markdown/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** 외부 문의 snapshot은 AP 원문이 아니다. 원본 읽기와 쓰기는 오직 AP 공개 API를 사용한다. Field owner가 직접 양쪽 consent를 진행한 연결만 답변한다. mock client에 등록 가능한 scope를 확대하되 기존 OAuth grant/token/consent는 자동 확장하지 않는다. AP 503/응답 미상은 성공이 아니며 원래 idempotency key/body/revision을 유지한다. 브라우저를 닫거나 새로고침한 뒤 초안/키 복구는 아직 미구현이므로 정식 QA145 완료로 주장하지 않는다. Field는 AP 답변 고객 알림을 발송하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17, API 4311/4321·웹 3001/3002, Chromium 320px. `pnpm test:spike:ap-connection:field` 1/1(타 actor/읽기 실패/scope 거부/합성 AP 응답 분실+같은 키 재시도), `pnpm test:spike:integrator:agent` 1/1, `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 실제 양쪽 서버 HTTP+브라우저 1/1(AP 메시지/단일 고객 notification 원장, 화면 초안 유지/재시도/미발송 표시). `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(AP API 3, Field API 3, AP web 8, Field web 9, 도구 3), `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Git 없음.
- **실패 접근과 복구:** 새 Field route 첫 `typecheck`는 error union의 optional status로 실패했고 404/401/403 반환 분기를 보정해 통과했다. 실제 HTTP 첫 검사는 합성 AP inquiry에 고객 메시지가 없어 원본 메시지 단언이 실패했고 AP 고객 공개 API로 메시지를 먼저 추가한 뒤 통과했다. Field API 재시작을 `FIELD_PROFILE` 없이 시도하자 HTTPS 정책으로 부팅을 거부했고 `FIELD_PROFILE=mock`으로 정상 시작했다. 브라우저 초안 유지 뒤 AP revision 변경을 고려해 원래 revision/key를 보존하도록 고쳤고 실제 320px 검사를 재실행했다.
- **미검수/남은 작업:** I05 열린 화면 밖 초안/제출 키 복구, AP 예약 후속 사건의 AP 알림 경로·single owner 상태/수신·provider success/read 분리, 양방향 revoke/장애·actor 변경, 정식 QA144/145/148/149/G-I2. I04 AI 대화 중 직접 업무 제출·첨부 인증 copy/scan·예약 후속 알림도 남았다. 실제 인증/모델/알림/결제/DNS/TLS 공급사와 운영 서버 검수, 공식 `test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`는 미실행/미구현 게이트다. 문서 패키지 재생성/검수는 아래 명령으로 확인한다.
- **다음 에이전트 정확한 명령:** `TASKS.md` I04~I06, `docs/03_INTEGRATION_CONTRACT.md` 4.6~4.9, QA144/145/148~155를 읽는다. 다음 범위/QA/명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 적는다. 우선 Field AP 답변의 서버 보관 미전송 초안/unknown 재조정 또는 I04 연결 예약 확정/제안/변경 사건→AP 단일 고객 알림을 구현한다. AP/Field 내부 DB/module import는 금지하며 실 공급사/출시 상태를 통과 처리하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:ap-connection:field
pnpm test:spike:integrator:agent
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I04 AP 고객의 Field 예약 접근 인계 (2026-09-25)

- **현재 목표:** v3.0 개발 명세와 `reference` 디자인대로 AP·Field 독립 서비스를 사용할 수 있게 기능을 완성한다. 사용자는 화면 시각 검토보다 기능 완성을 먼저 요청했다. `TASKS.md`는 46개 중 `implemented` 1, `in_progress` 30, `planned` 15, `verified` 0이다. I04는 여전히 부분 구현이다.
- **완료 작업:** AP 원본 대화 확인키를 가진 고객이 accepted Field 예약의 1회 접근 코드를 요청한다. AP는 양쪽 정상 연결·별도 `field.customer_access.create` 동의·ActionRequest/예약 결합을 재검사한다. Field 공개 API는 자체 외부 요청/연결/조직/grant/예약 ID를 대조한 뒤 5분짜리 32바이트 무작위 코드를 발급한다. Field 고객 `/handoff` 화면에서 코드를 한 번 교환하면 Field 예약 확인키를 받는다. 같은 예약의 새 교환은 이전 Field 확인키를 폐기하고 새 키를 표시한다. 코드 발급은 예약당 1시간 5회다. Field grant를 철회한 뒤에도 이미 교환한 Field 예약 확인키로 조회된다. Field 공개 capability에 고객 인계 지원 여부를 추가했다.
- **수정 파일:** `apps/field-api/migrations/{000027_customer_handoff_codes,000028_customer_handoff_scope}.sql`, `apps/field-api/src/{auth,integrator-auth,integrator-routes,customer-handoffs,app}.ts`, `apps/field-api/test/integrator.db.test.ts`, `apps/field-web/src/{field-customer-handoff,field-booking,app/handoff/page.tsx}`, `apps/agent-api/src/{field-connector,field-actions}.ts`, `apps/agent-api/test/{field-actions,field-connection}.db.test.ts`, `apps/agent-web/src/{agent-field-action,agent-field-connections}.tsx`, `contracts/field-integrator-v1.openapi.json`, `tools/{setup-mock-field-connector.mjs,test/field-integrator-contract.test.mjs,spikes/ap-field-connection-http.test.mjs,spikes/field-action-browser.py}`, `docs/{03_INTEGRATION_CONTRACT.md,technical/PHASE_2_EXECUTION_PLAN.md,CODEX_HANDOFF.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 재생성 마스터 Markdown/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** 고객 Field 권한은 전화번호/예약 ID·상대 제품 로그인 토큰이 아니다. AP 대화 확인키로 AP 서버가 현재 연결을 확인하고, Field도 별도 grant와 자신이 수신한 동일 예약을 검증한다. 1회 코드·Field 확인키 원문은 URL/query/DB/outbox에 넣지 않는다. Field 확인키는 Field 예약의 해시로만 보관되어 AP가 중단돼도 Field API에서 사용된다. AP 응답 분실 후 코드를 다시 발급할 수 있으나 시간당 제한한다. Field 새 코드 교환은 기존 Field 키를 회전하므로 고객 화면에서 이를 고지한다. `mock` client의 허용 scope만 확대했고 과거 동의는 자동 확대하지 않았다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17, Field Valkey는 이 경로에서 사용하지 않음, API 4311/4321·웹 3001/3002. `pnpm test:spike:integrator:field` 1/1(타 예약/무권한/만료/중복·동시 교환/회전/5회 제한/Field grant 철회 후 기존 키), `pnpm test:spike:field-actions:agent` 1/1(원본 확인키/accepted action/연결 악화), `pnpm test:spike:field-connection:agent` 1/1, `pnpm test:spike:contracts:field` 정적 1/1+제공자 DB 1/1, `pnpm test:spike:bookings:field` 3/3. `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 실제 OAuth 재동의→AP/Field 공개 HTTP 예약·문의·코드 발급/교환→Field 확인키 예약 조회, Chromium 320px 고객·사업자 화면 1/1. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 두 API/웹 build, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, 두 `test:spike:independence:*` readiness exit 0. 실제 AP API를 중지한 상태의 해당 외부 예약 후속 조회는 아직 미실행이다. Git 없음.
- **실패 접근과 복구:** Field OAuth 새 scope 등록은 처음 `invalid_scope` 400 red였고, OAuth resource의 기존 DB 허용 목록에 `000028` migration을 적용해 토큰 포함으로 복구했다. Field handoff SQL은 text/uuid 비교 500 red 후 명시 cast로 통과했다. AP 신규 handoff 경로는 404 red→API/화면 구현 green. 실제 양쪽 HTTP 첫 시도는 새 scope를 Field owner가 선택하지 않아 `/connect/select`로 돌아갔고 선택 범위를 수정해 재실행 통과했다. Field 정적 계약 검사는 고객 교환 경로가 OAuth 401을 요구하지 않아 실패했고 공개 1회 교환의 보안 계약에 맞게 검증을 분리했다.
- **미검수/남은 작업:** I04의 AI 대화 중 직접 업무 제출, 첨부의 인증 copy/scan, Field 예약 확정/제안/변경의 AP 사건 전달과 단일 고객 알림, revoke/부분 장애·운영 독립성, 정식 QA139~145/153/155/G-I1~I2. I05의 AP 원본 위임 대화/답변, I06~I08과 각 Core·매체·전체 출시 게이트도 남았다. 실 인증/모델/알림/청구/도메인 공급사와 운영 서버 검수는 미실행. `pnpm test:contracts`, `pnpm test:integration:faults`, `pnpm test:e2e:*`, `pnpm test:security`는 아직 구현 게이트이며 통과로 주장하지 않는다. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py` passed(`document_package_only`, `service_tests_executed=false`).
- **다음 에이전트 정확한 명령:** 먼저 문서 패키지를 재생성/검수하고 `TASKS.md` I04/I05, `docs/03_INTEGRATION_CONTRACT.md` 4.6~4.9, `docs/06_REQUIREMENTS_QA.md` QA139~145/148~155를 읽는다. 다음 작업 후보는 I05 Field 사업자가 AP 원본 대화를 위임 API로 읽고 답변하는 경로다. AP 대화 원문은 Field DB에 복제하지 않고 AP가 message ID/sequence/outbox를 발급한다. Field 답변 실패는 미전송으로 보관하며 성공 표시하지 않는다. 또는 I04 Field 예약 후속 사건을 AP 원장/알림 소유로 연결한다. 착수 전에 변경 경로·QA·검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 적고 제품별 DB 테스트를 순차 실행한다. 기존 mock OAuth grant는 새 scope가 없을 수 있어 새 Field owner 동의가 필요하다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
pnpm test:spike:contracts:field
pnpm test:spike:field-actions:agent
pnpm test:spike:field-connection:agent
pnpm test:spike:bookings:field
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
```

## 이전 인수인계 — I04 Field 사업자의 AP 전달 문의 수신 목록 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 디자인대로 AP·Field 독립 서비스를 실제 사용할 수 있게 기능을 연결한다. `TASKS.md` 46개 중 `implemented` 1, `in_progress` 30, `planned` 15, `verified` 0. 사용자는 화면 시각 검토보다 기능 완성을 우선 요청했다. I04는 아직 전체 완료 상태가 아니다.
- **완료 작업:** AP가 동의받아 Field에 보낸 외부 `inquiry`는 Field 원장에 수신되고 owner/editor의 별도 `/v1/owner/external-requests` 목록에서 서비스·고객 연락처·요약·접수 시각·테스트 여부를 볼 수 있다. Field 직접 문의 원본에 복제하지 않았다. `field.external_request.accepted` outbox가 사업자 내부 notification 한 건을 만들며 이전 outbox도 migration에서 멱등 보충한다. 같은 ActionRequest 재전송은 새 원장/알림을 만들지 않는다. Field 사업자 화면의 알림에서 외부 문의 목록을 연다. 예약은 기존 Field 예약함에 남는다.
- **수정 파일:** `apps/field-api/migrations/000026_external_inquiry_owner_notifications.sql`, `apps/field-api/src/{bookings,notifications}.ts`, `apps/field-api/test/integrator.db.test.ts`, `apps/field-web/src/field-workspace.tsx`, `tools/spikes/{ap-field-connection-http.test.mjs,field-external-inquiry-browser.py}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `docs/03_INTEGRATION_CONTRACT.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일, 재생성 마스터 Markdown/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** Field 수신 문의의 고객 전달 snapshot만 Field 사업자에게 보인다. AP 원본 대화·답변은 AP API 소유이고 Field 직접 문의 원본에 복제하지 않는다. 현재 Field 화면은 답변 전송 성공을 표시하지 않으며 I05 위임 대화/답변 작업을 기다린다. Field 사업자 알림은 원장 outbox당 하나이며 고객 외부 알림 공급사와 별개다. 조회는 Field 조직 membership과 owner/editor 역할로 제한한다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17, Valkey는 이번 경로에 사용하지 않음, API 4311/4321·웹 3001/3002. Field owner 조회 API 미구현 404 red 후 `pnpm test:spike:integrator:field` 1/1 green(문의/예약 분리·타인/무인증 거부·알림 한 번·동일 본문 replay), `pnpm test:spike:bookings:field` 3/3. `pnpm lint`, `pnpm typecheck`, `pnpm build:field`, `pnpm build:web:field` exit 0. Field API/웹을 재시작한 뒤 `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 실제 OAuth→AP 고객 문의/예약→Field owner 목록, Chromium 320px 고객·Field 사업자 화면, 가로 넘침/page error 없이 1/1 통과. AP 원장 최종 변경 뒤 `pnpm test:unit`, `pnpm build:agent`, import 경계도 통과(이후 AP 코드 변경 없음). `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0 및 `tools/check_package.py` passed(`document_package_only`, `service_tests_executed=false`). Git 없음.
- **실패 접근과 복구:** 신규 Field owner 조회 기대가 404로 실패한 것을 먼저 확인하고 API·migration·화면을 연결해 통과했다. 현재 작업에서 다른 실패 접근 없음.
- **미검수/남은 작업:** I04의 Field 예약 고객 안전한 capability handoff(QA153/155), AI 대화에서 직접 외부 업무 제출, 첨부 인증 copy/scan, 확정/변경 이벤트·알림 소유, revoke/장애 조정이 남는다. I05 AP 원본 위임 대화 조회/답변과 전송 실패 보존(QA144/145), I06~I08 및 Core/매체/최종 출시 검수도 남았다. 정식 `pnpm test:contracts`, `pnpm test:integration:faults`, `pnpm test:e2e:*`, `pnpm test:security`와 실 공급사/운영 서버 검수는 미실행이다. 실제 고객 발송·청구·배포는 하지 않았다.
- **다음 에이전트 정확한 명령:** `TASKS.md` I04/I05, `docs/03_INTEGRATION_CONTRACT.md` 4.6~4.8, `docs/06_REQUIREMENTS_QA.md` QA139~145/153/155를 읽는다. Field 예약의 AP 고객 후속 접근은 별도 AP 확인키와 정상 connection·연결 reservation을 서버 간 확인한 1회 Field audience capability로 구현한다. 전화번호/예약 ID만으로 발급하거나 AP/Field DB를 공유하지 않는다. 또는 I05 AP 원본 위임 답변으로 진행할 때에는 Field 실패가 성공 발송으로 보이지 않게 한다. 시작 전 파일·QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 적고 제품별 DB 검사를 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
pnpm test:spike:integrator:field
pnpm test:spike:bookings:field
pnpm test:spike:field-actions:agent
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
```

## 최신 인수인계 — I04 AP 고객 동의·ActionRequest 전달 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 디자인의 AP·Field 독립 서비스를 실제 사용할 수 있도록 기능을 연결한다. 사용자는 시각 검토보다 기능 완성을 먼저 요청했다. `TASKS.md`의 46개 중 `implemented` 1, `in_progress` 30, `planned` 15, `verified` 0. 현재 I04는 일부 동작하지만 전체 완료 상태가 아니다.
- **완료 작업:** AP 비회원 원본 문의의 43자 확인키로 Field 서비스 목록·현행 가격/시간표/예약 조건을 조회한다. 고객이 수신 Field 조직, 연락처, 전달 항목, 현행 조건을 확인하고 명시 동의하면 AP `field_action_requests` 원장과 outbox를 기록하고 공개 Field API로 같은 ActionRequest ID/본문 hash를 전송한다. Field는 미확정 `requested` 예약으로 수신한다. 응답을 잃은 AP는 `delivery_unknown`으로 표시하고 새 업무를 막는다. 원래 ID의 Field by-source 조회로 접수 여부를 확인하며 권위 있는 404라면 같은 ID/본문만 다시 보낸다. 고객 화면에 이 상태와 재조회 동작을 연결했다.
- **수정 파일:** `apps/agent-api/migrations/{000036_field_action_requests,000037_field_action_unknown_guard}.sql`, `apps/agent-api/src/{field-connector,field-actions,app}.ts`, `apps/agent-api/test/field-actions.db.test.ts`, `apps/agent-web/src/{agent-field-action,agent-public}.tsx`, `tools/spikes/{ap-field-connection-http.test.mjs,field-action-browser.py}`, `package.json`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일. Git 저장소/커밋은 없다.
- **핵심 결정:** AP 원본 대화 확인키로 권한을 확인하고 양쪽 owner 동의·Field OAuth scope·선택 배포·조직을 공개 HTTP로 재검증한다. AP와 Field의 DB·session·비밀값은 공유하지 않는다. Field 최신 가격/정책 revision의 조건 hash를 제출 직전에 재검사한다. AP `accepted_external`은 Field 접수이며 예약 확정이 아니다. `sending`/`delivery_unknown` 동안 동일 대화·연결·서비스·업무 종류의 새 ActionRequest를 DB 부분 유일 제약으로 차단한다. Outbox에는 고객 연락처를 넣지 않는다. 첨부 인증 복사는 아직 없고 Field 수신은 첨부 참조를 명시 거부한다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17, API 4311/4321, 웹 3001/3002. `pnpm test:spike:field-actions:agent` 1/1, `pnpm test:spike:consultations:agent` 1/1, `pnpm test:spike:field-connection:agent` 1/1, `pnpm test:spike:inquiries:agent` 1/1, `pnpm test:spike:bookings:field` 3/3. AP API 재시작 후 최종 `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1은 실제 두 API·두 웹·양방향 OAuth·AP→Field 요청과 Field DB `requested`·Chromium 320px 고객 동의/접수 표시를 확인했다. 최종 `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm test:spike:imports` exit 0. `pnpm test:spike:db:isolation`과 AP 웹 build는 고객 UI 변경 후 앞서 통과했고 이후 해당 경로의 코드 변경은 없었다. 문서 재생성·`tools/check_package.py` passed(`document_package_only`, `service_tests_executed=false`). Git 없음.
- **실패 접근과 복구:** AP 고객 신규 경로는 처음 404 red였다. 결과 미상 중 다른 키의 새 업무가 202로 받아들여져 red였고 `000037` 부분 유일 제약과 409 처리를 추가했다. 서비스 목록/원시 가용성·원래 고객 연락처·권위 있는 404 뒤 재전송·AP 접수 outbox도 각 실패 기대를 확인하고 구현해 DB 검사 green으로 만들었다.
- **미검수/남은 작업:** I04의 Field 외부 문의 owner 목록/응답, AP 고객→Field 예약 원본 접근의 안전한 capability handoff, AI 대화 중 별도 AP 사람 문의 없이 직접 ActionRequest, 첨부 인증 copy/scan, 확정/변경 이벤트와 단일 알림 소유, revoke/부분 장애 조정이 남았다. I05~I08과 독립 Core/매체/최종 인수도 미완료. 정식 `pnpm test:contracts`, `pnpm test:integration:faults`, `pnpm test:e2e:*`, `pnpm test:security`, 실 공급사/운영 검수는 실행하지 않았다. 생산 환경 출시는 하지 않았다.
- **다음 에이전트 정확한 명령:** 먼저 아래 명령으로 현재 프로세스를 확인한다. AP API가 마지막 `field-actions.ts` 변경 전 코드로 구동 중일 수 있으므로 해당 프로세스만 중지하고 `AP_PROFILE=mock`으로 다시 시작한다. `pnpm test:spike:ap-field:http`와 정적 검사를 재실행한다. `docs/03_INTEGRATION_CONTRACT.md` 4.6~4.8, QA139~145/153/155, `TASKS.md` I04/I05를 읽고 Field 외부 문의 owner 처리와 Field 예약 고객 handoff를 제품별 공개 계약으로 구현한다. 변경 범위·QA·검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 적는다. 두 제품 DB 테스트를 동시에 실행하지 않는다. 분할 문서를 변경했으므로 `tools/build_report.py`로 마스터를 재생성하고 `tools/check_package.py`를 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
lsof -nP -iTCP:4311 -iTCP:4321 -iTCP:3001 -iTCP:3002 -sTCP:LISTEN
pnpm test:spike:field-actions:agent
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — I04 Field 외부 요청 수신 기반 (2026-09-25)

- **현재 목표:** v3.0 개발 명세와 `reference` 디자인대로 AP·Field 독립 서비스를 사용 가능하게 기능 연결한다. 사용자는 화면 디자인 검토보다 기능 완성을 우선 요청했다. `TASKS.md` 46개 중 C00 `implemented` 1, `in_progress` 30, `planned` 15, `verified` 0. 이번 범위는 I04 중 Field 공개 수신 기반이며 I04 전체 완료는 아니다.
- **완료 작업:** Field OAuth scope `field.availability.read`로 현행 승인 서비스의 가격·예약 방식·정책 revision·시간표를 조회한다. 별도 `field.requests.create/read` 동의로 공개 `POST /integrations/v1/external-requests`와 `GET /integrations/v1/external-requests/by-source/{actionId}`를 추가했다. 수신 시 Field grant·connection·배포·고객 전달 동의 대상/항목/시각·body hash·최신 서비스/정책 revision·조건 hash/슬롯을 검사한다. 동일 ActionRequest/본문은 이전 ID로 200, 내용 변경은 409. Field 외부 요청 snapshot과 예약 `requested`·예약 event·outbox를 한 Field DB transaction에 저장한다. Field owner의 외부 예약 확정/제안은 고객 알림을 Field에 중복 생성하지 않는다. AP 새 OAuth 연결은 네 scope를 신청하고 mock 등록 client의 허용 scope를 안전하게 확대했다. 기존 사용자 동의는 보존한다. 첨부 참조는 현재 409로 명시 거부한다.
- **수정 파일:** `apps/field-api/migrations/000025_external_work_requests.sql`, `apps/field-api/src/{auth,bookings,integrator-auth,integrator-routes}.ts`, `apps/field-api/test/integrator.db.test.ts`, `apps/agent-api/src/field-connector.ts`, `apps/agent-api/test/field-connection.db.test.ts`, `contracts/field-integrator-v1.openapi.json`, `tools/test/field-integrator-contract.test.mjs`, `tools/setup-mock-field-connector.mjs`, `tools/spikes/ap-field-connection-http.test.mjs`, `docs/03_INTEGRATION_CONTRACT.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 재생성 마스터 Markdown/HTML, 이 파일. Git 저장소·커밋 없음.
- **핵심 결정:** AP ActionRequest는 Field 예약과 별도이며 Field가 `requested` 접수 뒤 자체 승인한다. 기존 수신의 동일 본문 재전송은 고객 동의 24시간 경과 후에도 재조회한다. 새 업무만 신선한 동의를 요구한다. 가격·예약 조건은 제출 순간 Field 공개 승인본/정책으로 다시 검사한다. 수신 본문/오류는 고객에게 확인키 권한을 주지 않는다. Field 고객 접근 인계는 아직 구현하지 않았다. 서로의 DB·session·도메인 module 공유 없음.
- **실제 검사/환경/커밋:** 로컬 mock Field/AP PG17, API 4311/4321·웹 3001/3002. `pnpm test:spike:contracts:field` 정적 1/1+Field DB 1/1(가용성/별도 scope/수신/멱등/동의·revision·배포·권한 거부/by-source/예약 snapshot·outbox), `pnpm test:spike:bookings:field` 3/3, `pnpm test:spike:field-connection:agent` 1/1. `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 실제 OAuth/설치 HTTP와 Chromium 320px 1/1; **실제 외부 요청 POST는 이 검수에 포함되지 않는다.** 최종 코드에서 `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field` exit 0. 문서 패키지 `/tmp/fieldai-report-venv/bin/python tools/check_package.py` passed(`service_tests_executed=false`). `000025` migration 실제 적용. Git 없음.
- **실패 접근과 복구:** 새 수신 경로는 구현 전 404 red. 처음 구현 뒤 capability 기대가 false이고 TypeScript의 consent.items 타입이 unknown이어서 DB/typecheck 실패, capability 응답과 타입 좁힘 후 통과. 만료 동의 후 동일 본문 재전송은 처음 409 red였고 기존 요청 조회를 만료 검사 앞에 두어 200 green. owner 확정 시 Field 고객 알림 1건 red였고 외부 요청의 알림 소유 표시를 확정/제안에 적용해 0건 green. 계약은 신규 scope 부재로 red 뒤 OpenAPI 추가로 green. AP 연결 새 scope 기대 DB 테스트 red→green. 실제 HTTP 첫 재실행은 기존 scope만 선택해 Field `/connect/select`로 가서 실패했고 선택을 확대했다. 다음 실행은 기존 capability=false 기대와 충돌했고 true로 갱신해 재실행 통과. 서버 재시작 첫 시도는 mock profile 변수 없이 부팅 실패, `AP_PROFILE=mock`/`FIELD_PROFILE=mock`으로 부팅했다.
- **미검수/남은 작업:** AP 등록 mock OAuth client는 네 scope를 허용하지만 **기존 Field grant는 facts-only**이며 새 Field owner 동의가 필요하다. AP `ActionRequest` 원장·고객 명시 확인·현재 가용성 조회/조건 재확인·공개 HTTP 전송·결과 미상 시 by-source 조정, Field owner의 외부 문의 목록 및 고객 접근 인계, 실제 외부 요청 HTTP/고객 320px 브라우저, 이벤트/알림 소유·revoke/장애, QA139~142/153/155/G-I1~I2가 남았다. `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`와 실 공급사/운영 검수 미실행이다.
- **다음 에이전트 정확한 명령:** `AGENTS.md`, `TASKS.md` I04, `docs/03_INTEGRATION_CONTRACT.md` 4.5~4.7/4.12, `docs/06_REQUIREMENTS_QA.md` QA139~142/153/155, `docs/technical/PHASE_2_EXECUTION_PLAN.md` I04를 읽는다. AP 새 OAuth 연결은 네 scope를 신청하며 mock client도 허용하지만 이전 grant는 그대로다. AP DB 테스트를 red로 만든 뒤 ActionRequest/동의·unknown 원장과 Field 공개 availability/requests client를 구현한다. AP/Field DB 테스트는 각 제품별로 순차 실행하고 실제 두 서버 외부 요청 HTTP/고객 브라우저를 검수한다. Field 첨부 전달·고객 확인키를 임의 성공 처리하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:integrator:field
pnpm test:spike:bookings:field
pnpm test:spike:contracts:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm test:spike:field-connection:agent
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
```

## 최신 인수인계 — I03 Field 공개 사이트의 AP SDK 설치 (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference` 디자인을 기준으로 AP·Field 독립 서비스를 사용할 수 있게 기능을 끝까지 연결한다. `TASKS.md` 46개 중 C00 `implemented` 1, `in_progress` 29, `planned` 16, `verified` 0. 사용자는 화면 시각 검토보다 기능 연결을 먼저 진행하라고 했다.
- **완료 작업:** AP OAuth bearer `GET /integrations/v1/deployments`는 grant가 명시 선택한 활성 link/owned embed만 현재 AI·지식 release 기준으로 반환한다. Field는 사업장별 mock origin과 1일 소유 증명값을 공개하고, Next well-known 경로는 그 사업장 호스트에서만 증명한다. AP 일반 소유 사이트 검증은 mock `.localhost` origin에서 공개 well-known을 읽고 운영 HTTPS는 기존 DNS TXT를 유지한다. Field owner는 실제 AP grant의 조직·AI·scope·선택 배포를 공개 HTTP로 재검증하고 정확한 origin의 owned embed만 설치/중지한다. 공개 사이트는 AP의 일반 `/sdk/v1.js`·public deployment ID를 로드한다. Field 직접 문의·예약은 그대로 사용한다.
- **수정 파일:** `apps/agent-api/src/{integrator-routes,deployments}.ts`, `apps/agent-api/test/integrator.db.test.ts`, `contracts/agent-integrator-v1.openapi.json`, `tools/test/agent-integrator-contract.test.mjs`, `apps/field-api/migrations/000024_site_ap_installation.sql`, `apps/field-api/src/{ap-connector,sites}.ts`, `apps/field-api/test/sites.db.test.ts`, `apps/field-web/src/app/.well-known/ap-site-verification/route.ts`, `apps/field-web/src/app/site/[slug]/page.tsx`, `apps/field-web/src/{field-site,field-ap-connections,site-editor}.tsx`, `apps/agent-web/src/agent-deploy.tsx`, `tools/spikes/{ap-field-connection-http.test.mjs,field-ap-widget-browser.py}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, 이 파일. Git 저장소/커밋 없음.
- **핵심 결정:** 로컬 공유 웹 호스트의 경로만으로는 한 사업장이 다른 사업장의 위젯 origin을 재사용할 수 있어 `field-<12hex>.localhost:3002`를 mock 사업장별 origin으로 사용한다. 운영에서는 `FIELD_SITE_BASE_DOMAIN` 아래 HTTPS와 실제 DNS/TLS 증명이 필요하다. 기존 빈 deployment OAuth grant는 자동 확대하지 않으며 배포 활성화 후 새 동의에서 선택한다. AP/Field DB·identity/비밀값은 공유하지 않는다. Field 설치 원장과 AP 위젯 활성 여부는 서로 다른 제품 상태이며 AP release 변경 후 SDK가 stale 배포를 거부한다.
- **실제 검사/환경/커밋:** 로컬 mock PG17, AP/Field API 4311/4321, 웹 3001/3002. AP 계약 정적+DB 1/1, AP 배포 DB 1/1, Field 사이트 DB 2/2(권한·타 배포/호스트·중복·중지), Field AP 연결 DB 1/1. `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http`는 실제 OAuth 두 방향→소유 증명→배포 선택/설치 HTTP 1/1와 Chromium 320px SDK 버튼/iframe·직접 문의/예약·타 사업장 호스트 404를 통과했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:agent`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Git 없음.
- **실패 접근과 복구:** AP 계약 JSON 편집 초기에 닫는 괄호 누락으로 정적 계약 검사 실패 후 고쳐 통과했다. 실제 HTTP 검수 첫 실행은 새 Field 사이트 공개본이 카탈로그를 참조해 합성 조직 정리에서 FK 오류가 났고 사이트를 먼저 삭제하도록 고쳐 재실행 통과했다. 그 실패 실행에서 남은 AP/Field 합성 조직·계정은 정확한 ID/이메일/이름을 확인해 삭제했다. 테스트 실행 중 외부 고객 데이터·메시지·청구는 사용하지 않았다.
- **미검수/남은 작업:** I03 운영 DNS/TLS·실사이트/실모델, AP 배포 중지·revoke·장애 전파의 owner 재조정 UX와 정식 QA86/94/128·G-I1. I01 source/deployment 세부 매핑·부분연결, I02 signed 변경 이벤트/중요값 live 확인, I04~I08, 실제 인증·알림·결제·도메인 공급사와 정식 계약/보안/E2E/출시 gate. `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`는 실행하지 않았다.
- **다음 에이전트 정확한 명령:** 먼저 `AGENTS.md`, `TASKS.md` I04와 `docs/03_INTEGRATION_CONTRACT.md` 4.6~4.8, AP/Field PRD의 비회원 접수·예약, QA139~145/153~155를 읽는다. 작업 경로/QA/명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 기록한다. I04 고객 동의→AP ActionRequest→Field 공개 요청을 API 계약/멱등/unknown/수신 snapshot부터 설계·구현하고 Field가 자체 예약을 확정하도록 유지한다. 제품별 DB 테스트는 순차 실행한다. 현재 mock 프로세스가 살아 있을 수 있으므로 4311/4321/3001/3002 listener를 먼저 확인한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:contracts:agent
pnpm test:spike:sites:field
FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:spike:imports
pnpm test:spike:db:isolation
```

## 최신 인수인계 — I01 Field 공개 기능 발견·AP 연결별 조회 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인 기준 AP·Field 독립 서비스를 실제 사용할 수 있도록 기능을 완성한다. `TASKS.md` 46개 중 C00 `implemented` 1, `in_progress` 28, `planned` 17, `verified` 0. 실제 고객 발송·청구·운영 출시는 수행하지 않았다.
- **완료 작업:** Field 공개 OAuth bearer `GET /integrations/v1/capabilities`를 추가했다. 계약 버전 1.0과 사실 읽기 true, 아직 구현되지 않은 가용성 조회/업무 요청/제안 응답 false를 반환한다. AP owner 전용 `GET /v1/connections/field/{id}/capabilities`는 AP 동의·조직과 보관 Field grant를 재검증하고 Field 공개 `/me`/`capabilities`로 결과를 가져온다. 타 조직·형식·지원하지 않는 버전·장애를 성공으로 취급하지 않는다. AP 연결 화면에서 지원/미지원 항목을 보여준다.
- **수정 파일:** `apps/field-api/src/integrator-routes.ts`, `apps/field-api/test/integrator.db.test.ts`, `contracts/field-integrator-v1.openapi.json`, `tools/test/field-integrator-contract.test.mjs`, `apps/agent-api/src/field-connector.ts`, `apps/agent-api/test/field-connection.db.test.ts`, `apps/agent-web/src/agent-field-connections.tsx`, `tools/spikes/{ap-field-connection-http.test.mjs,ap-field-connection-browser.py}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, `docs/technical/{PHASE_2_EXECUTION_PLAN,I00_FIELD_REVERSE_AUTH_DESIGN}.md`, 이 파일, 재생성 마스터/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** 공개 기능 지원은 OAuth 동의·카탈로그 존재·사이트 설치 및 실제 업무 사용 가능성과 다른 차원이다. 현재 구현되지 않은 Field integrator 업무 endpoint는 `false`로 광고한다. AP는 Field 내부 코드·DB를 사용하지 않고 양쪽 grant 확인 뒤 공개 HTTP만 호출한다. 기능 조회 장애가 AP 또는 Field 자체 상담/문의/예약을 막지 않는다. 알 수 없는 계약 버전은 409로 거부한다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17.11, API 4311/4321, 웹 3001/3002. Field 제공자·AP 소비자 새 DB 테스트 각각 404 red→green 1/1, `pnpm test:spike:contracts:field` 정적 1/1+Field DB 1/1, `pnpm test:spike:field-connection:agent` 1/1. `pnpm test:spike:ap-field:http` 실제 두 서버 1/1(양방향 OAuth→기능 조회). `/tmp/fieldai-report-venv/bin/python tools/spikes/ap-field-connection-browser.py` Chromium 320px 기능 버튼·지원/미지원 표시 및 기존 출처 흐름, page error 0·가로 넘침 없음. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Git 없음.
- **실패 접근과 복구:** 새 Field/AP API 기대 테스트는 구현 전 각각 404 red. 첫 UI `pnpm typecheck`는 map으로 읽은 기능 결과가 undefined일 가능성을 좁히지 않아 exit 2였고, 원소별 변수로 좁힌 뒤 exit 0. 검수의 합성 계정/조직은 종료 때 정리했다.
- **미검수/남은 작업:** I01의 source/deployment/resource 매핑, 설치만/부분연결 상태, 권한 변경·연결 해제 조정과 정식 QA130/133/134. I03 Field 사이트의 공식 AP SDK 설치에는 정확한 site origin 소유 증명과 AP 배포 선택이 필요하다. I02 signed 변경 이벤트·중요값 live 확인, I04~I08, 실제 인증/모델/알림/청구/도메인 공급사와 정식 계약/보안/E2E/출시 gate가 남는다. `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`는 이번에 실행하지 않았다.
- **다음 에이전트 정확한 명령:** `TASKS.md` I01/I03과 `docs/03_INTEGRATION_CONTRACT.md` 4.4~4.6, Field PRD 3.1·3.3, QA86/94/128, `apps/agent-api/src/deployments.ts`, `apps/field-web/src/{field-ap-connections,field-site}.tsx`, `apps/field-api/src/sites.ts`를 읽는다. 다음 범위·QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. Field 사이트의 정확한 origin 소유 검증을 공개 계약으로 해결하고 AP의 일반 외부사이트 SDK와 동일한 설치 경로를 사용한다. Field 자체 사이트·직접 문의·예약은 AP 없이 유지한다. 같은 제품 DB/migration 검사는 순차 실행하고 API·웹 프로세스 상태를 확인한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:contracts:field
pnpm test:spike:field-connection:agent
pnpm test:spike:ap-field:http
/tmp/fieldai-report-venv/bin/python tools/spikes/ap-field-connection-browser.py
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I02 Field 설명의 AP 지식 공개·AI 근거 (2026-09-25)

- **현재 목표:** v3.0 문서와 `reference` 디자인 기준으로 AP·Field 독립 서비스를 사용할 수 있는 기능까지 완성한다. `TASKS.md` 총 46개: C00 `implemented` 1, `in_progress` 28, `planned` 17, `verified` 0. 운영 출시·실고객 발송·청구는 하지 않았다.
- **완료 작업:** AP owner가 승인 Field source의 사업 소개/지역·서비스 설명을 별도로 선택해 새 AP KnowledgeRelease를 만든다. 공개 직전 Field grant·조직·revision/hash 재검증, native 지식 보존, 같은 서비스명 충돌 거부, 멱등 재요청, 출처 메타데이터/outbox를 구현했다. AP 직접 입력 초안 revision과 조직 전체 지식 공개 revision을 분리했다. Field 가격/영업시간/예약 조건과 숫자가 든 Field 설명은 정적 AI 근거에서 제외한다. AI는 출처 current/승인 revision/hash/연결 상태·24시간 freshness를 만족할 때만 Field 설명을 받는다. 새 지식 release 뒤 사업자가 AI release를 다시 승인해야 한다. AP 웹은 공개 항목 선택과 재승인 경로를 보여준다.
- **수정 파일:** `apps/agent-api/migrations/000035_connector_knowledge_release.sql`, `apps/agent-api/src/{business,field-sources,agents,customer-consultations}.ts`, `apps/agent-api/test/field-connection.db.test.ts`, `apps/agent-web/src/agent-field-connections.tsx`, `tools/spikes/{ap-field-connection-http.test.mjs,ap-field-connection-browser.py}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, `docs/technical/{PHASE_2_EXECUTION_PLAN,I00_FIELD_REVERSE_AUTH_DESIGN}.md`, 이 파일, 재생성 마스터/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** source 승인, AP KnowledgeRelease, AgentRelease는 각각 별도 owner 행동이다. connector 공개본은 최신 native 공개본을 합성하되 native 초안 자체를 변경하지 않는다. 고객 AI의 Field 사실은 저장된 공개본만으로 무조건 사용하지 않고 AP source 원장의 상태와 최신성으로 제한한다. 중요 가격·예약·영업시간은 별도 live Field 확인 경로가 생기기 전 AI 정적 근거에서 완전히 제외한다. 공개 조직 API는 connector 내부 sourceFacts를 반환하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PG17.11, API 4311/4321, 웹 3001/3002. 신규 AP DB 경로 404 red→`pnpm test:spike:field-connection:agent` 1/1 green(출처·멱등·버전·native 갱신·AI current/stale·공개 제외). `pnpm test:spike:business:agent` 2/2, `pnpm test:spike:agents:agent` 2/2, `pnpm test:spike:consultations:agent` 1/1. `pnpm test:spike:ap-field:http` 실제 별도 서버 1/1(출처 공개→기존 AI stale→재승인). `/tmp/fieldai-report-venv/bin/python tools/spikes/ap-field-connection-browser.py` Chromium 320px 선택·공개·새로고침 재열람, page error 0·가로 넘침 없음. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Git 없음.
- **실패 접근과 복구:** 공개 API 기대 DB 테스트는 구현 전 404 red였다. 첫 신규 테스트는 수동 생성 조직에 지식 초안이 없어 404였고 테스트 fixture를 채운 뒤 의도한 404 red를 확인했다. JSONB 선택 필드 순서는 안정적이지 않아 객체 직렬화 비교 대신 정규화된 선택 값 비교로 멱등성을 구현했다. 합성 계정/조직은 HTTP/브라우저 검사 뒤 정리했다.
- **미검수/남은 작업:** I02 signed `facts.changed` 이벤트·누락/역순 재조정, source mapping 충돌의 선택 수정 UX, Field 중요값(가격·예약·영업시간/활성)의 요청 직전 live 조회와 stale 대체, revoke·권한 변경/장애 조정, 정식 QA134~138/156·G-I2. I00/I01 잔여 및 I03~I08, 실제 인증·모델·메시지·결제·도메인 공급사와 정식 계약/보안/E2E/출시 gate는 남는다. `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`는 이번에 실행하지 않았다.
- **다음 에이전트 정확한 명령:** `TASKS.md` I02/I03과 `docs/03_INTEGRATION_CONTRACT.md` 4.5~4.7, QA135~138/156, `apps/agent-api/src/{field-connector,field-sources,agents}.ts`, `apps/field-api/src/integrator-routes.ts`를 읽는다. 다음 범위/QA/검수 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. signed Field 변경 알림/누락 재조정 또는 중요값 live 확인을 공개 HTTP 계약과 consumer test부터 설계한다. AP/Field 내부 import·DB 공유 없이 구현한다. 같은 제품 migration/DB 검사는 순차 실행하고 실제 mock API·웹 프로세스를 먼저 확인한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:field-connection:agent
pnpm test:spike:ap-field:http
/tmp/fieldai-report-venv/bin/python tools/spikes/ap-field-connection-browser.py
pnpm test:spike:business:agent
pnpm test:spike:agents:agent
pnpm test:spike:consultations:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I02 AP owner의 Field 출처 명시 승인 (2026-09-25)

- **현재 목표:** v3.0·`reference` 기준 독립 AP/Field 서비스를 사용할 수 있는 기능까지 구현한다. `TASKS.md` 46개 중 C00 `implemented`, 28개 `in_progress`, 17개 `planned`, `verified` 0개. 운영 출시/고객 발송/청구는 수행하지 않는다. 사용자 시각 검토는 기능 진행의 대기 조건이 아니다.
- **완료 작업:** AP owner가 Field source snapshot의 정확한 revision/hash와 서비스 내용을 확인하고 명시 승인한다. AP 서버는 Field 공개 `/me`·`/facts`에서 grant/조직/scope와 현행 revision/hash를 승인 직전 재검증한다. 다른 owner·원격 변경/장애·source hash 충돌·낡은 요청은 거부한다. 승인 actor/시각/source revision과 AP outbox를 한 트랜잭션에 기록하고 같은 요청은 멱등 응답한다. 새 Field 버전은 다시 `pending_review`. AP KnowledgeRelease·고객 AI에는 아직 반영하지 않는다.
- **수정 파일:** `apps/agent-api/migrations/000034_field_source_approval.sql`, `apps/agent-api/src/field-sources.ts`, `apps/agent-api/test/field-connection.db.test.ts`, `apps/agent-web/src/agent-field-connections.tsx`, `tools/spikes/{ap-field-connection-http.test.mjs,ap-field-connection-browser.py}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, `docs/technical/{PHASE_2_EXECUTION_PLAN,I00_FIELD_REVERSE_AUTH_DESIGN}.md`, 이 파일과 재생성 마스터/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** 출처 검토 승인과 AP 지식 공개/AI 활성화는 다른 상태다. 현재 `knowledge_sources.state=current`는 원본 버전의 AP 검토 승인만 의미하고 `ap_knowledge_release_id`는 null이다. 승인 직전 원격 재조회는 교차 제품 DB 트랜잭션을 만들지 않으며, 그 직후 변경될 가능성은 다음 단계의 stale/live 재확인으로 다룬다. 고객에게 Field 가격을 최신이라고 안내하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PG17.11, API 4311/4321·웹 3001/3002. `pnpm test:spike:field-connection:agent` 1/1(권한/원격 변경/장애/멱등/outbox·새 버전·충돌), `pnpm test:spike:ap-field:http` 실제 두 서버 1/1(승인 서비스/가격 source→AP 명시 승인, native 지식 release 수 불변), Chromium 320px 두 동의→source 저장→검토 체크→승인→새로고침/재열람, page error 0·가로 넘침 없음. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Git 없음.
- **실패 접근과 복구:** 신규 승인 API는 구현 전 기대 DB 테스트에서 404 red였고 migration/API 구현 후 green. 승인 직전 Field 버전 변경은 409, Field 장애는 502로 확인했으며 승인 원장은 바뀌지 않았다. 합성 계정/조직은 검수 뒤 정리. 실제 운영 데이터/외부 고객 메시지/결제는 건드리지 않았다.
- **미검수/남은 작업:** I02 새 AP KnowledgeRelease와 AI 근거에 승인 source를 안전하게 합성하고 native 중복 source mapping·가격/영업시간/활성 상태 live 재확인·stale 대체, signed facts.changed 이벤트/누락 재조정. I01 capabilities, I00 양방향 revoke/재인가/unknown 조정, I03~I08 및 실제 인증/모델/알림/결제/도메인 공급사, 정식 QA/G 게이트. `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`는 정식 통과한 게이트가 아니다.
- **다음 에이전트 정확한 명령:** `TASKS.md` I02, 연동 계약 4.5, AP PRD 2.3, `apps/agent-api/src/{business,agents,customer-consultations,field-sources}.ts`, `apps/agent-api/migrations/{000005_business_core,000033_field_source_snapshots,000034_field_source_approval}.sql`을 읽는다. 다음 범위/QA/검수 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. native draft revision과 AP release revision이 현재 동일하다는 제약을 보존/명시적으로 변경하면서 승인 connector 사실을 별도 source attribution과 함께 새 AP KnowledgeRelease/AI 근거로 합성한다. 가격/예약 조건은 live Field 재확인 없이는 AI 근거에 넣지 않는다. AP/Field 내부 import나 DB 공유를 하지 않는다. 같은 AP DB migration/tests는 순차 실행한다. API/웹 서비스 실행 상태를 먼저 확인한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:field-connection:agent
pnpm test:spike:ap-field:http
/tmp/fieldai-report-venv/bin/python tools/spikes/ap-field-connection-browser.py
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I02 Field source snapshot·충돌 격리 (2026-09-25)

- **현재 목표:** v3.0·`reference` 기준 독립 AP/Field 서비스를 사용할 수 있는 기능까지 구현한다. `TASKS.md` 46개 중 C00 `implemented`, 28개 `in_progress`, 17개 `planned`, `verified` 0개. 운영 출시/고객 발송/청구는 수행하지 않는다. 사용자의 시각 검토를 기능 진행 대기 조건으로 두지 않는다.
- **완료 작업:** AP owner의 Field 공개 facts 조회를 AP 전용 `KnowledgeSource`와 불변 snapshot 원장으로 저장한다. source revision/hash 멱등, 하위 revision 무시, 동일 revision 다른 hash 격리/`integrity_conflict`/outbox를 구현했다. Field 응답의 사업·서비스 허용 필드만 AP 응답/DB에 보관하고 예기치 않은 전화번호·메모는 제거한다. AP 화면에서 저장 후 새로고침해도 owner가 보관 자료를 재열람한다. 기존 native KnowledgeDraft/Release·고객 AI는 변경하지 않아 미승인 정보가 공개되지 않는다.
- **수정 파일:** `apps/agent-api/migrations/000033_field_source_snapshots.sql`, `apps/agent-api/src/{field-connector,field-sources,app}.ts`, `apps/agent-api/test/field-connection.db.test.ts`, `apps/agent-web/src/agent-field-connections.tsx`, `tools/spikes/{ap-field-connection-http.test.mjs,ap-field-connection-browser.py}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, `docs/technical/{PHASE_2_EXECUTION_PLAN,I00_FIELD_REVERSE_AUTH_DESIGN}.md`, 이 파일과 재생성 마스터/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** Field service entity revision은 현재 공개 facts가 제공하지 않으므로 `entity_versions={}`와 catalog 전체 revision을 사용한다. source ID는 connection에 명시 바인딩하며 이메일/상호 일치로 병합하지 않는다. 같은 revision 다른 hash는 정상 최신값으로 채택하지 않는다. AP source 원장 저장은 지식 승인이나 최신 가격 보증이 아니다. AP와 Field의 내부 import/DB 공유 없음.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PG17.11, API 4311/4321, 웹 3001/3002. AP DB 연결 1/1(타 owner·첫/중복/상위/하위 버전·hash 충돌·저장본 권한/보존·미승인 공개 차단), 실제 두 서버 HTTP 1/1(Field 승인 서비스와 가격→AP source 저장), Chromium 320px 두 동의→저장→새로고침→보관본 재열람, page error 0·가로 넘침 없음. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Git 없음.
- **실패 접근과 복구:** source API 추가 전 DB 기대 테스트는 404 red였다. Field 모의 응답에 전화번호/내부 메모를 추가한 첫 테스트는 AP가 원문을 그대로 돌려줘 red였고 공개 계약 필드만 검증/정규화하도록 수정해 green. 테스트용 합성 계정·조직은 각 회차에 정리했다. 실제 운영 데이터/외부 고객 발송/결제 없음.
- **미검수/남은 작업:** I02 명시 AP source 승인과 새 KnowledgeRelease/AI 근거 결합, native/connector 중복 mapping UI, signed facts.changed 이벤트/버전 누락 재조회, 중요 가격·영업시간·활성 상태 live 재확인과 stale 대체. I01 capabilities/source/deployment 매핑, I00 양방향 revoke/재인가/unknown 조정, I03~I08 및 공급사/정식 QA/G 게이트. `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`는 구현된 정식 통과 게이트가 아니다.
- **다음 에이전트 정확한 명령:** `TASKS.md` I02, 연동 계약 4.5, AP PRD 2.3, `apps/agent-api/src/{business,agents,customer-consultations,field-sources}.ts`와 QA134~138을 읽는다. 먼저 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일/QA/명령을 기록한다. AP source 승인과 KnowledgeRelease/AI 근거 설계 시 native 지식 원본을 덮어쓰거나 가격을 승인만으로 최신이라 말하지 않는다. 승인 직전 Field source revision/hash를 공개 API에서 재검증하고 중복 서비스 mapping을 명시 검토한다. 같은 AP DB migration/tests는 순차 실행한다. API 4311/4321·웹 3001/3002 프로세스부터 확인한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:field-connection:agent
pnpm test:spike:ap-field:http
/tmp/fieldai-report-venv/bin/python tools/spikes/ap-field-connection-browser.py
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I00/I02 AP 보관 Field grant 갱신·승인 정보 검토 (2026-09-25)

- **현재 목표:** v3.0·`reference` 기준 AP/Field 독립 서비스를 사용할 수 있는 기능까지 구현한다. `TASKS.md` 46개 중 C00 `implemented`, 28개 `in_progress`, 17개 `planned`, `verified` 0개. 사용자 화면 시각 검토는 기능 구현의 대기 조건이 아니며 운영 출시·청구는 수행하지 않는다.
- **완료 작업:** AP BFF가 보관한 Field access token 만료 시 Field 공개 OAuth refresh endpoint에서 access/refresh를 회전하고 AP 키로 암호화 저장한다. AP owner/기존 AP grant, Field 공개 `/me`의 grant·조직·scope와 `/facts`의 조직을 확인한다. 갱신 실패·결과 미상은 `degraded`로 기록해 자동 재시도를 막는다. AP 연결 화면에서 Field 승인 카탈로그를 owner 전용 `pending_review`로 읽는다. AP 지식/AI 고객 답변에는 반영하지 않는다.
- **수정 파일:** `apps/agent-api/migrations/000032_field_connection_degraded.sql`, `apps/agent-api/src/field-connector.ts`, `apps/agent-api/test/field-connection.db.test.ts`, `apps/agent-web/src/agent-field-connections.tsx`, `tools/spikes/{ap-field-connection-http.test.mjs,ap-field-connection-browser.py}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, `docs/technical/{PHASE_2_EXECUTION_PLAN,I00_FIELD_REVERSE_AUTH_DESIGN}.md`, 이 파일 및 재생성 마스터/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** 현재 Field facts 조회는 검토용 실시간 읽기다. AP native 지식 초안을 덮어쓰거나 source가 승인됐다고 표시하지 않는다. AP와 Field는 서로의 내부 코드/DB/session 없이 공개 HTTP만 사용한다. `degraded`는 공급사/권한 상태 확인 전 재시도 불가이고 각 제품 자체 기능 장애를 뜻하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PG17.11, API 4311/4321, 웹 3001/3002. AP DB 연결 테스트 1/1(타 owner 차단, 만료 rotation, 다른 조직 facts 거부, 실패 뒤 degraded/재시도 차단), 실제 두 서버 HTTP 1/1(Field 카탈로그 승인→양방향 동의→AP token 만료 강제/회전→facts 조회), Chromium 320px 두 동의→검토 버튼/원본 개정·미반영 표시, page error 0·가로 넘침 없음. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Git 없음.
- **실패 접근과 복구:** 새 AP facts 경로는 구현 전 DB 테스트 404 red였다. 첫 실제 HTTP는 오래된 AP API 프로세스로 새 경로 404였고 mock AP API를 재시작해 통과했다. 첫 브라우저 검수는 `next build` 이전에 실행 중이던 AP `next start`가 오류 화면을 표시했고, 새 빌드로 AP 웹을 재시작해 통과했다. 합성 계정·조직은 매 테스트 뒤 정리했다.
- **미검수/남은 작업:** I02 source snapshot·revision/hash 충돌·역순 이벤트·signed facts.changed·AP 명시 지식 승인/KnowledgeRelease·중요값 실시간 재확인. I01 capabilities·source/deployment 매핑, I00 양방향 revoke/재인가 및 `binding_unknown` 조정, I03~I08, 실제 모델/인증/메시지/결제/도메인 공급사, 정식 QA/G 게이트. `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`는 구현/통과한 정식 게이트가 아니다.
- **다음 에이전트 정확한 명령:** `TASKS.md` I01/I02, 연동 계약 4.4~4.5, QA134~138과 AP 지식 release 제약을 읽는다. `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 다음 Task 경로/QA/명령을 먼저 기록한다. Field 공개 capabilities와 AP source snapshot 원장, revision/hash 멱등·충돌·역순 차단을 먼저 설계/구현한다. native AP 초안을 덮어쓰지 않고 명시 AP 승인 전 고객 AI 공개를 막는다. 동일 AP DB migration/tests는 순차 실행한다. API 4311/4321·웹 3001/3002 상태를 먼저 확인한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:field-connection:agent
pnpm test:spike:ap-field:http
/tmp/fieldai-report-venv/bin/python tools/spikes/ap-field-connection-browser.py
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I00 만료 AP grant 회전·전체 브라우저 연결 (2026-09-25)

- **현재 목표:** v3.0·reference 기준 AP/Field 독립 서비스를 실제 사용할 수 있는 기능까지 구현한다. 이번 단계는 I00의 브라우저 두 동의 흐름과 Field 보관 AP grant 갱신이다. `TASKS.md` 46개 중 1 `implemented`, 27 `in_progress`, 18 `planned`, `verified` 0개. 사용자의 시각 검토는 기능 구현 대기 조건이 아니며 운영 출시/청구를 하지 않는다.
- **완료 작업:** Playwright Chromium 320px 한 브라우저에서 Field owner→AP owner 조직·AI 선택/동의→Field owner 사업장 선택/동의→두 제품 `review_required`를 실제 화면 클릭과 서버 기록으로 확인했다. mock 두 웹이 모두 `localhost`이면 같은 `better-auth.session_token` 쿠키가 포트별로 분리되지 않아 AP 세션이 사라지는 것을 재현했다. Field 웹 origin/안내 주소를 `127.0.0.1:3002`, AP를 `localhost:3001`로 분리하고 기존 mock `.env`도 등록 도구로 이전했다. Field에 보관된 AP access token이 만료되면 AP 공개 OAuth refresh endpoint에서 refresh rotation하고 새 access/refresh를 암호화 저장한 뒤 AP 공개 `/me`를 재검증한다. 실패·결과 미상은 `degraded`에 머물고 같은 연결을 자동 재시도하지 않는다.
- **수정 파일:** `apps/field-api/migrations/000023_ap_connection_degraded.sql`, `apps/field-api/src/{ap-connector,integrator-routes}.ts`, `apps/field-api/test/ap-connection.db.test.ts`, `apps/field-web/src/field-ap-connections.tsx`, `apps/agent-web/src/{agent-field-connections.tsx,app/page.tsx}`, `tools/setup-mock-ap-connector.mjs`, `tools/spikes/{ap-field-connection-http.test.mjs,ap-field-connection-browser.py}`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/{PHASE_2_EXECUTION_PLAN,I00_FIELD_REVERSE_AUTH_DESIGN}.md`, 이 파일과 재생성 마스터/HTML. 무시된 `infra/field/.env`의 `FIELD_PUBLIC_WEB_ORIGIN`을 127 주소로 이전했으며 파일 권한은 600. Git 저장소/커밋 없음.
- **핵심 결정:** 로컬 mock에서도 제품별 browser host를 나눠 독립 쿠키를 검증한다. 운영에서는 제품별 HTTPS domain을 사용한다. Field의 AP token refresh는 현재 bind 중 같은 Field connection row 잠금에서 한 번 실행한다. refresh가 성공하면 새 암호화 credential을 저장하고 AP 권한을 다시 확인한다. 원격 결과가 불명확할 때 재호출로 연결 성공을 주장하지 않는다. `degraded`는 기존 Field 자체 서비스 장애나 AP 설치 완료를 뜻하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PG17.11, API 4311/4321, 웹 3001/3002. 동일 localhost 두 로그인 재현에서 AP 세션이 두 번째 로그인 후 사라지고 `better-auth.session_token`이 1개인 것을 확인했다. 분리 host로 실제 전체 브라우저 OAuth 320px 3회 통과(마지막은 저장소의 `tools/spikes/ap-field-connection-browser.py`, 양쪽 상태 `review_required`, page error 0, 가로 넘침 없음), 합성 계정/조직 정리. `pnpm test:spike:ap-connection:field` 1/1, `pnpm test:spike:ap-field:http` 실제 AP refresh rotation 포함 1/1, `pnpm test:spike:oauth:agent` 2/2, `pnpm test:spike:contracts:field` 정적+DB 각 1/1, `pnpm test:spike:connection-ui:http` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:agent`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, `pnpm test:spike:independence:agent`, `pnpm test:spike:independence:field` exit 0. 전 단계 `pnpm build:agent`도 통과했으나 이번 코드 변경 뒤 다시 실행하지 않았다. Git 없음.
- **실패 접근과 복구:** 첫 쿠키 진단 스크립트는 null 세션 응답을 dict로 가정해 Python 예외였고 null을 허용해 재실행한 결과 충돌을 확인했다. Field refresh 성공 기대 테스트는 기존 `ap_grant_refresh_required` 503으로 red, 실패 상태 기대 테스트는 `pending_field_consent`로 red였으며 구현/새 migration 후 green. 새 DB 테스트의 TypeScript nullable row 오류로 첫 `pnpm typecheck`가 exit 2였고 row 존재 검사 후 exit 0. 외부 운영 데이터 삭제/고객 발송/결제/배포 없음.
- **미검수/남은 작업:** AP가 보관한 Field token 만료 시 rotation/조회, 양방향 revoke·재인가, Field/AP `binding_unknown` 원격 결과 재조정, I01의 source/deployment 매핑·capabilities와 I02~I08, 실제 모델/인증/알림/결제/도메인 공급사, 정식 `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`와 QA/G 게이트. 현재 browser 검수는 로컬 mock이고 운영 인증/HTTPS client 검수가 아니다.
- **다음 에이전트 정확한 명령:** `TASKS.md` I00/I01/I02, 연동 계약 4.2~4.5, QA129~138을 읽고 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 다음 Task의 경로/QA/검수 명령을 기록한다. AP가 보관한 Field refresh rotation과 양방향 revoke/원격 결과 재조정을 다음으로 구현한다. 제품 간 DB/import 없이 공개 HTTP 계약만 쓴다. 같은 제품 DB migration/tests는 순차 실행한다. API 4311/4321·웹 3001/3002 실행 상태를 먼저 확인한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm setup:mock:ap-connector
pnpm setup:mock:field-connector
pnpm test:spike:ap-connection:field
pnpm test:spike:field-connection:agent
pnpm test:spike:ap-field:http
/tmp/fieldai-report-venv/bin/python tools/spikes/ap-field-connection-browser.py
pnpm test:spike:oauth:agent
pnpm test:spike:contracts:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm build:web:agent
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
pnpm test:spike:independence:agent
pnpm test:spike:independence:field
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I00/I01 양방향 OAuth·명시 binding (2026-09-25)

- **현재 목표:** v3.0 명세와 `reference/field_ui_prototype_v3.html`을 기준으로 AP와 Field를 별도 서비스로 구현하고, 최종적으로 실제 사용 가능한 기능을 완성한다. 사용자의 시각 검토는 기능 구현의 대기 조건이 아니다. `TASKS.md`는 46개 중 C00 `implemented`, 27개 `in_progress`, 18개 `planned`, `verified` 0개다. I00/I01은 부분 구현이며 출시/청구 승인 상태가 아니다.
- **완료 작업:** Field→AP 첫 OAuth 승인 뒤 Field 연결 목록의 connection ID·AP grant ID에서 AP 연결 화면으로 이동한다. AP owner의 세션·조직·기존 grant/consent를 서버가 확인하고 Field OAuth code+PKCE를 별도 시작한다. Field owner가 별도 사업장과 `field.facts.read`를 승인하면 AP는 issuer/state/actor와 Field `/me`의 grant·조직·scope를 검증하고 access/refresh를 AP DB 전용 키로 암호화 보관한다. AP는 Field 공개 bind API를 Field bearer로 호출하며, Field는 신규 Field grant/actor/조직과 자기 pending 원장 및 저장된 AP grant의 공개 `/me`를 대조한다. 양쪽 원장은 동일 connection ID와 `review_required`; 정보 sync·설치·예약 도구는 아직 활성화하지 않는다. 결과 미상은 `binding_unknown`이며 자동 재시도하지 않는다. 로컬 mock Field OAuth refresh rotation, 역방향 client 등록 도구, AP/Field 연결 화면을 추가했다.
- **수정 파일:** `apps/field-api/migrations/{000021_oauth_resource_offline_access.sql,000022_ap_connection_binding.sql}`, `apps/field-api/src/{auth,integrator-routes,ap-connector,business,server}.ts`, `apps/field-api/test/{oauth.spike,integrator.db,ap-connection.db}.test.ts`; `apps/agent-api/migrations/000031_field_connection_oauth.sql`, `apps/agent-api/src/{app,business,server,field-connector}.ts`, `apps/agent-api/test/field-connection.db.test.ts`; `apps/field-web/src/field-ap-connections.tsx`, `apps/agent-web/src/{workspace,agent-field-connections}.tsx`, `apps/agent-web/src/app/workspace/integrations/page.tsx`; `tools/setup-mock-field-connector.mjs`, `tools/spikes/{ap-field-connection-http,connection-ui-http}.test.mjs`, `tools/test/field-integrator-contract.test.mjs`, `contracts/{field-integrator-v1.openapi.json,CONTRACT_NOTES.md}`, `package.json`, `TASKS.md`, `README.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/{PHASE_2_EXECUTION_PLAN,I00_FIELD_REVERSE_AUTH_DESIGN}.md`, 이 파일과 재생성 마스터/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** 제품별 issuer/DB/session/client secret/token 암호화 키를 유지하고 공개 HTTP 계약만 사용한다. Field의 bind는 등록된 역방향 AP client에만 열며 현재 actor·조직과 저장된 AP grant를 재확인한다. 연결 ID/선택 ID는 권한이 아니고 서버의 동의 검증이 필수다. mock HTTP loopback의 Better Auth 제약으로 개발용 `native` client를 Field 선택 API에서도 mock 한정 허용했다. Field 공개 OpenAPI는 현재 제공자 일부의 `preview.2`이며 운영 전체 계약/게이트가 아니다. `review_required`를 `active`로 취급하지 않는다.
- **실제 검사/환경/커밋:** 로컬 mock AP/Field PostgreSQL 17.11과 별도 API 4311/4321·웹 3001/3002. AP/Field DB 연결 테스트 각 1/1, `pnpm test:spike:oauth:agent`·`oauth:field` 각 2/2, `pnpm test:spike:ap-field:http` 양방향 별도 서버 1/1, `pnpm test:spike:connection-ui:http` 1/1, `pnpm test:spike:contracts:field` 정적+DB 각 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:agent`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, `pnpm test:spike:independence:agent`, `pnpm test:spike:independence:field` exit 0. Playwright Chromium 320px에서 AP/Field 연결 경로 각각 HTTP 200·가로 넘침 없음·page error 0건. 화면 검사는 비로그인 상태만이며 전체 두 동의 브라우저 흐름은 미실행. Git 없음.
- **실패 접근과 복구:** Field refresh scope는 기존 client/resource에 없어 등록 400 red였고 설정+`000021` 뒤 rotation까지 green. AP reverse/Field bind 신규 기대 테스트는 각각 404 red 후 구현 green. Field bind migration의 최초 상태 제약 이름이 실제 이름과 달라 migration 실패했고 `ap_connections_status_check`로 수정 후 통과. 양방향 HTTP 테스트는 Field owner 연결 목록에 AP grant ID가 없어 실패했고 소유자에게만 해당 ID를 반환한 뒤 통과. AP 연결 UI의 최초 HTTP 테스트는 경로 404 red, 구현/빌드/재기동 후 green. Field 계약 검사는 bind 경로 누락 red 후 preview.2로 수정해 green. CUA 브라우저는 제공되지 않아 기존 Python Playwright Chromium으로 320px 표시만 검사했다. 운영 원본/고객 메시지/청구/배포는 수행하지 않았다.
- **미검수/남은 작업:** 브라우저 로그인→AP 선택·동의→Field 선택·동의→양쪽 원장 전체 클릭 흐름, access 만료 시 refresh/rotation 저장, grant/connection 양방향 revoke·재인가, binding unknown 조회·복구, source/deployment 매핑·capabilities, 정보 동기화·승인·Field 위젯 설치·업무 요청·알림 경로, 공급사 인증/모델/메시지/결제/도메인, 정식 `test:contracts`·`test:integration:faults`·`test:e2e:*`·`test:security`와 QA/G 게이트. 사용 가능한 로컬 기본 AP/Field 기능은 이전 단계 범위로 동작하지만 전체 제품·연동은 미완료다.
- **다음 에이전트 정확한 명령:** 아래 명령으로 실행 상태를 재확인한다. `TASKS.md` I00/I01, `docs/03_INTEGRATION_CONTRACT.md` 4.2~4.5, `docs/technical/I00_FIELD_REVERSE_AUTH_DESIGN.md`, QA129~138을 읽고 다음 Task 범위·QA·검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 이어 양방향 grant refresh/revoke와 binding unknown 재조정 및 전체 브라우저 흐름을 구현·검수한다. 제품 간 내부 import나 DB 직접 접근은 하지 않는다. 동일 제품 DB migration/tests는 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm setup:mock:ap-connector
pnpm setup:mock:field-connector
pnpm test:spike:field-connection:agent
pnpm test:spike:ap-connection:field
pnpm test:spike:ap-field:http
pnpm test:spike:connection-ui:http
pnpm test:spike:contracts:field
pnpm test:spike:oauth:agent
pnpm test:spike:oauth:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm build:web:agent
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
pnpm test:spike:independence:agent
pnpm test:spike:independence:field
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I00 Field→AP 첫 인가·암호화 보관 (2026-09-24)

- **현재 목표:** v3.0과 `reference/field_ui_prototype_v3.html`에 맞는 독립 AP/Field 서비스와 공식 양방향 연결을 사용 가능한 환경까지 구현한다. 사용자 화면 시각 검토는 기능 진행의 대기 조건이 아니다. `TASKS.md`는 총 46개 중 C00 `implemented`, 26개 `in_progress`, 19개 `planned`, `verified` 0개다. I00의 첫 인가만 부분 구현했고 출시·청구 승인은 아니다.
- **완료 작업:** Field owner가 `/workspace/integrations`에서 자기 Field 조직으로 AP 연결을 시작한다. Field 서버가 state hash와 암호화 PKCE verifier를 보관하고 AP 등록 client에 `openid offline_access ap.agent.read ap.conversations.read`를 요청한다. AP owner의 별도 조직/AI/scope 동의 뒤 Field callback은 state·issuer·owner membership·AP `/me`/`agent`를 검증하고 access/refresh token을 Field 키로 AES-256-GCM 암호화해 `pending_field_consent`로 보관한다. 거부·중복 callback·결과 미상을 구분한다. AP refresh rotation을 위해 `offline_access`를 client/resource 설정 및 기존 resource migration에 추가했다. 로컬 mock AP client 등록 도구와 두 실제 서버 간 HTTP 계약 검수를 추가했다. Field 사업/사이트/직접 문의/예약은 AP 설정 없이 계속된다.
- **수정 파일:** `apps/agent-api/src/{auth,integrator-routes}.ts`, `apps/agent-api/migrations/000030_oauth_resource_offline_access.sql`, `apps/agent-api/test/{oauth.spike,integrator.db}.test.ts`; `apps/field-api/src/{app,business,server,ap-connector}.ts`, `apps/field-api/migrations/000020_ap_connection_oauth.sql`, `apps/field-api/test/ap-connection.db.test.ts`; `apps/field-web/src/{field-ap-connections.tsx,field-workspace.tsx,app/workspace/integrations/page.tsx}`; `tools/{setup-mock-ap-connector.mjs,spikes/ap-field-connection-http.test.mjs}`, `package.json`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/{PHASE_2_EXECUTION_PLAN.md,I00_FIELD_REVERSE_AUTH_DESIGN.md}`, 이 파일과 재생성 마스터/HTML. 로컬 mock `infra/field/.env`에는 client secret/암호화 키가 추가됐으며 Git 추적 대상이 아니다. Git 저장소/커밋 없음.
- **핵심 설계 결정:** Field client 설정은 서버 env로 고정하고 브라우저에 AP token·client secret을 제공하지 않는다. AP 로그인 쿠키/DB는 Field 권한이 아니며 Field session도 AP 권한이 아니다. AP 첫 승인은 연결 완료가 아니라 `pending_field_consent`다. AP resource token 응답에는 실제로 `openid`가 없어서 `offline_access`+AP scope만 응답에서 검증한다. 로컬 HTTP mock에서 Better Auth `web` client 등록이 400이므로 mock에서만 secret이 등록된 `native` client를 AP 조직 선택 API에서 허용한다. 운영 환경은 HTTPS `web` client 심사가 필요하다. callback 재시도 중 교환 결과가 모호하면 자동 재시도 없이 `unknown`으로 남긴다.
- **실제 검사/환경/커밋:** 로컬 AP/Field PostgreSQL 17.11, Field Valkey mock, AP API 4311/웹 3001, Field API 4321/웹 3002. `pnpm test:spike:oauth:agent` 2/2, `test:spike:integrator:agent` 1/1, `test:spike:oauth:field` 2/2, `test:spike:integrator:field` 1/1, `test:spike:ap-connection:field` 1/1, `test:spike:ap-field:http` 1/1 exit 0. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. AP/Field API를 현재 코드로 재기동하고 `pnpm setup:mock:ap-connector`로 mock client를 등록했다. Field 웹을 재빌드/재기동해 `/workspace/integrations` HTTP 200; Playwright Chromium 320px 비로그인 안내·버튼 비활성·가로 넘침 없음·page error 0건을 확인했다. 실제 두 서버 HTTP 테스트는 AP 조직/AI·Field 조직을 합성 생성 후 정리했다. Git 없음.
- **실패 접근과 복구:** Field BFF 기대 테스트의 최초 404는 의도한 red였다. AP `offline_access`는 처음 등록 400, 다음에는 초기 refresh가 있으나 rotation에서 refresh 누락으로 red였고 provider/resource 설정과 migration 후 green. Better Auth mock HTTP loopback의 `web` client 등록은 400으로 실패해 mock 전용 `native` client를 선택 API에 한정 허용했다. HTTP 시험에서 Node fetch의 OAuth authorize 응답은 302가 아닌 `{redirect:true,url}` 200이어서 시험이 둘 다 수용하게 수정했다. 실제 브라우저 navigation 302 여부는 아직 직접 검수하지 않았다. mock 등록 도구의 첫 well-known 경로는 AP base에 `/api/auth`가 빠져 실패했고 수정 후 등록했다. AP/Field DB 원본/운영 데이터 삭제 없음, 합성 계정/조직만 테스트에서 정리했다.
- **미검수/남은 작업:** AP BFF가 Field 역방향 code/token을 보관하는 두 번째 승인, 양쪽 조직·AI·actor·connection 매핑/활성화, refresh 사용/rotation 저장·revoke/재인가·만료/키 회전/unknown 복구, 운영 client 심사, 실제 브라우저 전체 AP 동의→Field 귀환 및 320px 로그인 화면, C01 완성 OpenAPI/consumer tests와 I01~I08가 남는다. `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`는 정식 구현/통과 전이다. 실인증/AI/알림/결제/도메인 공급사와 QA129~133/G-I1은 `blocked_integration` 또는 미검수다.
- **다음 에이전트 정확한 명령:** 먼저 아래 명령으로 현재 증거를 재확인하고 `TASKS.md` I00/I01, `docs/03_INTEGRATION_CONTRACT.md` 4.2~4.5, 두 제품 PRD, `docs/technical/I00_FIELD_REVERSE_AUTH_DESIGN.md`, QA129~138을 읽는다. 다음 선택 Task의 경로·QA·검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 기록한 후 AP BFF가 Field provider에 명시 동의받는 역방향 token 보관·양쪽 조직/actor binding을 구현한다. 제품 간 내부 import 없이 공개 HTTP만 사용한다. 같은 제품 DB migration/tests는 순차 실행한다. 실행 중인 AP 4311·Field 4321·웹 3001/3002 포트를 확인하고 재기동한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:oauth:agent
pnpm test:spike:integrator:agent
pnpm test:spike:oauth:field
pnpm test:spike:integrator:field
pnpm test:spike:ap-connection:field
pnpm test:spike:ap-field:http
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — I00 Field 역방향 OAuth·승인 사실 읽기 (2026-09-24)

- **현재 목표:** v3.0·`reference/field_ui_prototype_v3.html` 기준 AP/Field 독립 기능과 공식 연동을 실제 사용할 수 있는 환경까지 연결한다. 화면 시각 검토는 기능 진행의 대기 조건이 아니다. 46개 중 C00 `implemented`, 26개 `in_progress`, 19개 `planned`, `verified` 0개다. I00은 부분 구현이며 출시/청구 승인이 아니다.
- **완료 작업:** Field 자체 issuer에 owner 사업장 선택·scope 동의/거부 화면과 5분 selection 원장, OAuth reference 바인딩을 추가했다. `field.facts.read` bearer `/me`·`/facts`는 Field token hash·resource·client·actor·selection·consent·현재 owner membership을 검사해 승인 카탈로그의 release ID/revision/hash와 최소 사업·서비스 정보만 반환한다. 연락처·초안·고객 원본은 제외한다. owner의 selection revoke는 access/refresh token·consent를 폐기하되 Field 사이트·문의·예약을 보존한다. 현재 제공자 경로의 Field OpenAPI 미리보기·정적/DB 응답 검사와 320px 웹 인가 흐름을 추가했다. AP 내부 코드·DB를 Field에서 사용하지 않았다.
- **수정 파일:** `apps/field-api/migrations/000019_oauth_selections.sql`, `apps/field-api/src/{auth,app,business,server,integrator-auth,integrator-routes}.ts`, `apps/field-api/test/{integrator.db,oauth.spike}.test.ts`, `apps/field-web/{next.config.ts,src/field-connect.tsx,src/field-connect.css,src/app/connect/sign-in/page.tsx,src/app/connect/select/page.tsx,src/app/consent/page.tsx}`, `contracts/{field-integrator-v1.openapi.json,CONTRACT_NOTES.md}`, `tools/test/field-integrator-contract.test.mjs`, `tools/{spikes/oauth-issuers.test.mjs,spike-independence.mjs}`, `package.json`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/{I00_FIELD_REVERSE_AUTH_DESIGN.md,TECH_STACK.md,PHASE_2_EXECUTION_PLAN.md}`, 이 파일과 재생성 마스터/HTML. Git 저장소/커밋 없음.
- **핵심 결정:** Field 위임 동의는 AP 설치 동의와 별개이며 Field 로그인 세션을 AP token으로 대체하지 않는다. 현재 Field에서 발급 가능한 업무 API scope는 `field.facts.read`만 공개했고, 승인된 Field 카탈로그의 revision/hash를 제공해 후속 AP source 검수에 사용한다. 사람 답변은 AP 위임 token 경계에 남는다. OpenAPI 파일은 제공자 일부의 미리보기다. 완성된 양방향 binding/consumer 계약이 아니다. 독립 readiness spike는 사용 중인 고정 포트가 아닌 자체 임시 포트 child로 수정해 기존 서버의 200을 오인하지 않는다.
- **실제 검사/환경/커밋:** 로컬 Field PostgreSQL 17.11, mock API 4321/웹 3002. 새 options API의 404 red(exit 1) 뒤 `pnpm test:spike:contracts:field` 정적 1/1+DB 1/1, `pnpm test:spike:oauth:field` 2/2, `pnpm test:spike:oauth:issuers` 1/1(실제 상대 token API 401 포함), `pnpm test:spike:business:field` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, `pnpm test:spike:independence:agent`, `pnpm test:spike:independence:field` exit 0. `/tmp/i00_browser_check.py`로 Chrome 320px 사업장 선택→동의→합성 HTTPS callback code, overflow 없음·page error 0건을 확인했다. 44px 버튼 보강 뒤 재실행했고 합성 계정/사업장 각 2건을 정리했다. Field API 4321 readiness·웹 3002 `/connect/select` HTTP 200. AP API 4311의 이전 프로세스가 새 답변 경로에 404를 반환해 현재 코드로 재시작했고 readiness 200·무인증 답변 401을 확인했다. Git 없음.
- **실패 접근·복구:** 최초 기대 DB 테스트는 없는 options 404로 의도한 red. 기존 Field OAuth spike는 수동 resource 연결과 즉시 consent를 기대해 새 자동 resource·선택 후 continue 흐름에 맞게 고쳤다. `FIELD_PUBLIC_WEB_ORIGIN`은 비-mock 인가 화면의 필수 설정이며 교차 issuer 독립 child에 각 제품의 자체 origin을 명시했다. 첫 320px 시각 검사에서 버튼 높이가 작아 44px로 보강하고 브라우저를 다시 실행했다. 기존 독립 spike의 고정 포트는 이미 실행 중인 서버를 자기 child로 오인할 수 있어 임시 포트로 고쳤다.
- **미검수/남은 작업:** AP BFF가 등록 Field client로 code를 교환·서버에 보관하는 실제 연결 마법사, AP/Field 조직·AI·actor/connection ID의 명시 binding, Field availability/request/revoke 및 AP 남은 관리 scope, 양방향 revoke/재인가·fault/consumer tests가 남는다. QA129~132/G-I1은 부분 근거뿐이다. 실제 이메일/카카오·모델·알림·청구·도메인 공급사는 `blocked_integration`; 정식 `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`는 미완성/미통과다. 운영 출시를 수행하지 않았다.
- **다음 에이전트 정확한 명령:** 아래 명령으로 결과를 재확인하고 `TASKS.md` I00/I01, `docs/03_INTEGRATION_CONTRACT.md` 4.2~4.5, `docs/technical/I00_FIELD_REVERSE_AUTH_DESIGN.md`, QA129~138을 읽는다. `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 다음 계약/경로/검수 명령을 기록한다. 다음은 AP가 Field 외부 client로 동의 code를 안전하게 받아 자신의 BFF에 보관하고 양쪽 조직 binding을 합의하는 I00/I01 경로다. 제품 내부 import 금지, 각 DB migration/test는 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/run-migrations.mjs field
pnpm test:spike:contracts:field
pnpm test:spike:oauth:field
pnpm test:spike:oauth:issuers
pnpm test:spike:business:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
pnpm test:spike:independence:field
pnpm test:spike:independence:agent
FIELD_PROFILE=mock node --env-file=infra/field/.env --import tsx apps/field-api/src/server.ts
APP_PROFILE=mock pnpm --filter @fieldai/field-web start
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — A09 AP 위임 답변·OpenAPI 미리보기 (2026-09-24)

- **현재 목표:** v3.0·`reference/field_ui_prototype_v3.html` 기준 AP/Field 독립 기능과 공식 연결을 사용 가능한 환경까지 구현한다. 화면 시각 검토는 기능 진행의 대기 조건이 아니다. 전체 46개 중 C00 `implemented`, 25개 `in_progress`, 20개 `planned`, `verified` 0개다. A09는 부분 구현이며 출시/청구 승인이 아니다.
- **완료 작업:** AP bearer `/me`, 선택된 활성 배포의 고객 공개 메시지 cursor, AP 원본 대화의 위임 사람 답변을 구현했다. `ap.conversations.reply`는 OAuth 선택·access token·consent 모두에서 확인한다. 답변은 예상 revision·멱등 키·현재 owner membership·token/선택 철회와 배포 상태를 검사한 뒤 AP 메시지·actor/client/grant 감사 값·outbox·고객 알림 원장을 한 DB 트랜잭션에 기록한다. 고객 공급사 발송은 `blocked_integration`이다. AP 공개 경로의 OpenAPI 미리보기와 정적+제공자 DB 응답 검사를 추가했다. 기존 resource row의 scope 갱신 migration을 추가했다. Field 코드·DB는 변경하지 않았다.
- **수정 파일:** `apps/agent-api/migrations/{000028_integrator_reply_audit.sql,000029_oauth_resource_reply_scope.sql}`, `apps/agent-api/src/{auth,integrator-auth,integrator-routes,inquiries}.ts`, `apps/agent-api/test/integrator.db.test.ts`, `contracts/{agent-integrator-v1.openapi.json,CONTRACT_NOTES.md}`, `tools/test/agent-integrator-contract.test.mjs`, `package.json`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/{A09_PUBLIC_API_DESIGN.md,PHASE_2_EXECUTION_PLAN.md}`, 이 파일 및 재생성 마스터 문서/HTML. Git 저장소와 커밋 없음.
- **핵심 결정:** Field도 일반 AP 외부 client와 같은 HTTPS·위임 계약을 써야 한다. AP owner의 인가 token만 사람 답변에 쓰고 상대 제품 로그인으로 대체하지 않는다. 대화 상세는 메타데이터/revision, 메시지는 제한된 cursor로 나눈다. 같은 재시도 키·본문은 한 원본 메시지로 복구하며 변경 본문은 409다. `agent-integrator-v1.openapi.json`은 현재 제공자 일부 경로의 미리보기다. 완성된 C01 양방향 계약/소비자 검수가 아니다.
- **실제 검사/환경/커밋:** 로컬 AP PostgreSQL 17.11, mock profile. `/me`·답변 기대값의 404 red 후 구현 green. `pnpm test:spike:contracts:agent` 정적 1/1+DB 1/1, `pnpm test:spike:oauth:agent` 2/2, `pnpm test:spike:oauth:issuers` 1/1, `pnpm test:spike:inquiries:agent` 1/1, `pnpm test:unit`, `pnpm lint`, `pnpm typecheck`, `pnpm build:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 앞 단계 Chrome 320px 인가→callback 검수는 통과했으나 이번 답변 API의 브라우저 UI 검수는 하지 않았다. 로컬 경로에 `.git`이 없어 커밋 ID 없음.
- **실패 접근·복구:** 새 reply scope를 auth 설정에만 추가했을 때 기존 `oauthResource.allowedScopes` 행이 read-only 상태라 실제 token은 답변 scope를 받지 못했다(테스트 403). `000029`로 기존 행을 갱신한 뒤 통과했다. 테스트의 효과 조회는 `text=uuid` 비교 오류였고 명시 cast로 수정했다. 새 schema 응답 검사 작성 중 TS의 `any`/optional item 오류와 Promise.all 결과의 undefined 가능성을 고쳐 lint/typecheck를 재실행했다. 실패 테스트의 기대값은 버그에 맞춰 바꾸지 않았다.
- **미검수/남은 작업:** A09 source refresh·배포 관리·사건/connection revoke scope, 악의적 동시 인가/refresh, 운영 client 심사, 완성된 양방향 OpenAPI/Field 소비자 테스트·정식 QA129~133이 남는다. I00~I08 Field connector, A07/A08·F09, 양쪽 단독/연동/보안/출시 게이트도 남는다. 실제 모델·인증 메일·알림·청구·도메인 공급사는 자격증명/계약이 없어 `blocked_integration`으로 취급한다. `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`는 통과한 정식 게이트가 아니다.
- **다음 에이전트 정확한 명령:** 아래 명령으로 상태를 확인하고 `TASKS.md` A09, `docs/03_INTEGRATION_CONTRACT.md` 4.2~4.4, AP PRD 2.10, QA129~133을 읽는다. 다음 A09 세부 범위·파일·검수 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. AP의 source refresh·배포 관리·revoke 및 Field I00 역방향 OAuth를 각 제품의 공개 HTTP 경계로 구현한다. 동일 AP DB를 쓰는 spike는 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/run-migrations.mjs agent
pnpm test:spike:contracts:agent
pnpm test:spike:oauth:agent
pnpm test:spike:oauth:issuers
pnpm test:spike:inquiries:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — A09 AP 공식 통합자 인가·공개 읽기 (2026-09-24)

- **현재 목표:** v3.0 명세와 `reference/field_ui_prototype_v3.html` 기준으로 AP/Field 독립 서비스의 기능·공식 연동·매체 배포를 사용할 수 있는 환경까지 연결한다. 사용자의 시각 검토는 기능 진행의 대기 조건이 아니다. 문서 46개 중 C00 `implemented`, 25개 `in_progress`, 20개 `planned`, `verified` 0개다. A09는 부분 구현이고 출시/청구 승인이 아니다.
- **완료 작업:** AP OAuth Provider에 AP resource 기본 연결, code+PKCE, 조직·승인 AI·활성 배포 선택과 동의 화면을 연결했다. 선택은 짧은 수명의 AP DB 행으로 세션·actor·client·조직·AI·scope·배포에 묶는다. 공개 bearer API는 opaque token 해시·resource·scope·client·actor/reference·owner membership·현재 승인 AI·배포 귀속을 검사한다. 선택 배포의 동의된 AP 대화 인덱스·고객 공개 메시지와 최소 AI 상태만 반환하고 내부 메모·연락처·확인키는 제외한다. owner는 선택 권한을 철회해 access/refresh token과 consent를 폐기할 수 있다. AP/Field 내부 import는 추가하지 않았다.
- **수정 파일:** `apps/agent-api/migrations/000027_oauth_selections.sql`, `apps/agent-api/src/{auth,app,business,server,integrator-auth,integrator-routes}.ts`, `apps/agent-api/test/{integrator.db,oauth.spike}.test.ts`, `apps/agent-web/src/{agent-connect.tsx,agent-connect.css,app/connect/sign-in/page.tsx,app/connect/select/page.tsx,app/consent/page.tsx}`, `apps/agent-web/next.config.ts`, `tools/spikes/oauth-issuers.test.mjs`, `package.json`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/{A09_PUBLIC_API_DESIGN.md,PHASE_2_EXECUTION_PLAN.md}`, 이 파일 및 재생성 마스터 문서. Field 코드·DB 변경 없음. Git 저장소/커밋 없음.
- **핵심 결정:** AP가 자기 issuer와 DB로 외부 client를 인가하고 Field도 일반 외부 client와 동일한 HTTP 계약을 사용한다. 사람 세션은 client token으로 대체하지 않는다. 대화 조회는 동의된 AP 원본 중 선택된 활성 배포만 허용한다. 배포가 중지되면 통합자 조회는 404/목록 제외이나 기존 AP 고객 접근 원본은 보존한다. 선택 철회는 원본을 삭제하지 않는다. 현재 공개 범위는 `ap.agent.read`, `ap.conversations.read`만이며 나머지 scope는 성공 모의 처리하지 않는다.
- **실제 검사/환경/커밋:** 로컬 AP PostgreSQL 17.11, `AP_PROFILE=mock` API 4311/웹 3001, 합성 HTTPS callback. 구현 전 `pnpm test:spike:integrator:agent`는 새 경로 404로 의도한 red(exit 1), 구현 후 1/1 exit 0. 타 owner·미등록 scope·타 배포 선택 거부, 동의/code/token/bearer, 선택 외 배포 404, 고객 공개 메시지만 반환, 타 사용자 철회 404·철회 후 401을 검사했다. `pnpm test:spike:oauth:agent` 2/2, `pnpm test:spike:oauth:issuers` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. `/tmp/fieldai-report-venv/bin/python /tmp/a09_browser_check.py`로 Chrome 320px에서 AP 조직·배포 선택→동의→합성 외부 callback code, 넘침 없음·page error 0건을 확인했다. 합성 계정·조직 2건을 정리했다. `/tmp/fieldai-report-venv/bin/python tools/build_report.py`·`tools/check_package.py` exit 0이며 후자는 `document_package_only`다. 커밋 ID 없음.
- **실패 접근·복구:** OAuth spike 첫 재실행은 자동 resource 연결 뒤 오래된 `invalid_target` 기대와 postLogin 선택 화면 반복으로 실패했다. 실제 선택 후에만 `shouldRedirect`를 건너뛰게 하고 잘못된 별도 resource를 검사해 통과했다. 교차 issuer 첫 실행은 독립 AP 프로세스에 `AP_PUBLIC_WEB_ORIGIN`이 없어 부팅 실패했으며 해당 합성 설정을 명시해 통과했다. 첫 브라우저 스크립트는 fieldset을 label로 찾아 checkbox 대기 시간 초과였고 checkbox role 선택으로 재실행 통과했다. 이 세 실패를 성공으로 숨기지 않는다. 철회는 선택과 OAuth credential만 폐기하며 원본 복구/삭제를 수행하지 않는다.
- **미검수/남은 작업:** A09의 source refresh·배포 관리·사람 답변·사건/connection revoke scope, client 운영 심사·공식 OpenAPI/consumer test·전체 동시 인가/refresh 공격, 동의 거부 UI·새로고침 상태·정식 QA129~133은 미완료다. A07/A08·F09·I00~I08·A/F 단독 출시/Distribution 최종 게이트·R00~R02도 남는다. 실제 모델/인증 메일/알림/청구/도메인 공급사는 `blocked_integration`으로 취급한다. 정식 `pnpm test:contracts`, `test:integration:faults`, `test:e2e:*`, `test:security`는 구현된 통과 게이트가 아니다.
- **다음 에이전트 정확한 명령:** `TASKS.md` A09와 `docs/03_INTEGRATION_CONTRACT.md` 4.2~4.4, `docs/technical/A09_PUBLIC_API_DESIGN.md`, QA129~133을 읽고 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 다음 A09 세부 범위·명령을 먼저 기록한다. AP 서비스 4311/웹 3001 포트를 확인한다. A09 공식 OpenAPI·scope별 API/consumer test를 완료하고, 이후 I00 Field 역방향 인가를 별도 제품 코드에서 시작한다. AP DB를 사용하는 spike 명령은 병렬 실행하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/run-migrations.mjs agent
pnpm test:spike:integrator:agent
pnpm test:spike:oauth:agent
pnpm test:spike:oauth:issuers
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
AP_PROFILE=mock node --env-file=infra/agent/.env --import tsx apps/agent-api/src/server.ts
pnpm --filter @fieldai/agent-web start
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — D04 AP 매체 성과·개인정보 보호 집계 (2026-09-24)

- **현재 목표:** v3.0 명세와 `reference/field_ui_prototype_v3.html`을 따라 독립 AP/Field, 공식 연동, 매체 배포의 기능을 사용 가능한 환경까지 연결한다. 사용자 화면 디자인 검토는 기능 작업의 대기 조건이 아니다. 총 46개 중 C00 `implemented`, 24개 `in_progress`, 21개 `planned`, `verified` 0개다. D04는 로컬 부분 기능이며 G-D2/출시 승인이 아니다.
- **완료 작업:** AP 배치 문의 시작과 고객 동의 접수를 같은 DB 트랜잭션에서 배치 사건으로 한 번씩 기록한다. 기존 D03 문의는 출처를 증명할 수 없어 `unclassified`로 이관하고 공개 집계에서 제외한다. AP 공개 미리보기·mock 명시 테스트·알려진 크롤러 UA를 분류하고 제외한다. 매체와 사업자는 각자 membership 전체 범위에 대한 완료 UTC 주 8개의 상담/접수 구간값을 JSON과 CSV로 조회한다. 0~4건은 `under_5`, 그 이상도 5~9/10~19/20~49/50~99/100+ 구간만 제공한다. 임의 날짜·개별 배치/사업자 필터·정확 합계·원본 ID는 제공하지 않는다. Field 예약 확정은 `unsupported_unconnected`, 매출·수금은 `not_measured`로 표시한다. AP 사업자·매체 화면에 성과 패널과 CSV 링크를 연결했다.
- **수정 파일:** `apps/agent-api/migrations/000026_distribution_events.sql`, `apps/agent-api/src/{distribution-events,distribution-metrics,app,customer-consultations,deployments}.ts`, `apps/agent-api/test/distribution.db.test.ts`, `apps/agent-web/src/{distribution-metrics-panel.tsx,distribution-metrics-panel.css,agent-campaigns.tsx,agent-publisher.tsx}`, `docs/technical/{D04_DISTRIBUTION_METRICS_DESIGN.md,PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일 및 재생성 마스터 문서. Field 코드·DB 변경 없음. Git 저장소·커밋 없음.
- **핵심 결정:** 신뢰 가능한 노출 사건 없이 카드 조회/reload를 성과 수치로 만들지 않는다. AP 문의와 같은 transaction의 사건만 출처로 사용하며 중복을 `(inquiry_id,event_type)`으로 막는다. 완료 UTC 주와 고정 scope·넓은 구간을 사용해 작은 집단/인접 필터 차감을 완화한다. 매체에 고객 연락처·질문·사진·접수키·개별 문의 ID를 제공하지 않는다. 봇 UA 분류는 완전한 부정 트래픽 방어가 아니므로 실운영 검수 전 출시 근거로 쓰지 않는다. Field 확정 사건의 수신·권한·중복 처리는 공식 연동 작업 이후다.
- **실제 검사/환경:** 로컬 AP PostgreSQL 17.11, mock API 4311/웹 3001. API 기대값을 먼저 넣은 `pnpm test:spike:distribution:agent`는 404로 의도한 red(exit 1), 구현 후 1/1 exit 0이다. 실제 AP 상담 원본 2건의 사건, AP 미리보기/명시 테스트/Googlebot 분류, 비인증·다른 회원 차단, 5건 미만 억제·완료 주와 5~9 구간, 제외 합성 사건 15건 무영향, JSON/CSV 동일·PII 차단·예약/수금 미지원 상태를 검사했다. `pnpm test:spike:placements:agent`, `pnpm test:spike:deployments:agent`, `pnpm test:spike:consultations:agent` 각 1/1 exit 0. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. `/tmp/fieldai-report-venv/bin/python /tmp/fieldai-distribution-metrics-browser.py`로 분리 HTTPS origin Chrome 320px에서 매체·사업자 패널/CSV, 외부 카드→AP 동의 접수, 철회 후 기존 원본, 부모 DOM PII 비노출, 가로 넘침 없음·page error 0건을 확인하고 합성 계정/조직을 정리했다. AP API는 특별 합성 origin 없이 `AP_PROFILE=mock`으로 다시 실행 중이다.
- **실패 접근·복구:** 처음 404는 TDD red다. 브라우저 실행 시 `python` 명령은 없었고 `python3`에는 Playwright가 없어 각각 exit 127/1이었다. 기존 검수 venv의 Python으로 재실행해 통과했다. 사건 추가는 문의 transaction과 함께 rollback된다. CSV·JSON은 원본 ID/PII를 포함하지 않고 별도 백업/삭제 정책이 정해지기 전 실제 운영 데이터를 삭제하지 않는다.
- **미검수/남은 작업:** 실제 제휴 도메인/기사 게재, 정식 봇·중복 트래픽 판별, 복수 역할·지연 정정 차분 공격, 실제 Field 예약 확정 사건, QA104~107 전체/G-D2와 D05 출시 검수는 남았다. 공급사 AI/알림/청구·공식 OAuth/양방향 연동·각 제품 운영/복구·정식 계약/독립/fault/E2E/보안 게이트도 남았다. `test:e2e:distribution` 등 정식 명령은 아직 구현 게이트이며 통과로 기록하지 않는다.
- **다음 에이전트 정확한 명령:** D05는 A10 독립 실검수 의존이 있어 지금 완료할 수 없다. 다음은 `TASKS.md` A09와 `docs/03_INTEGRATION_CONTRACT.md`, AP PRD 공개 API/인가 부분을 읽고 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 A09 파일 범위·QA129~133·명령을 기록한다. AP/Field 내부 import 없이 공식 client 등록·인가·scope·동의·공개 조회 계약을 테스트 red부터 구현한다. 실행 중인 AP API 4311/웹 3001은 포트를 확인하고 새 코드로 재기동한다. AP migration 포함 spike는 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
node tools/run-migrations.mjs agent
pnpm test:spike:distribution:agent
pnpm test:spike:placements:agent
pnpm test:spike:deployments:agent
pnpm test:spike:consultations:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
AP_PROFILE=mock node --env-file=infra/agent/.env --import tsx apps/agent-api/src/server.ts
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — D03 AP 외부 기사 카드·안전 접수 전환 (2026-09-24)

- **현재 목표:** v3.0 명세와 `reference/field_ui_prototype_v3.html`을 따라 독립 AP/Field, 공식 연동, 매체 배포의 기능을 사용 가능한 환경까지 연결한다. 화면 시각 검토는 기능 작업의 대기 조건이 아니다. 총 46개 중 C00 `implemented`, 23개 `in_progress`, 22개 `planned`, `verified` 0개다. D03은 로컬 부분 구현 상태이며 출시 승인은 아니다.
- **완료 작업:** 승인 배치를 검증된 매체 HTTPS origin의 AP iframe 설치 코드로 연결했다. 매체 owner만 코드를 발급하고 반복 요청은 같은 배포를 반환한다. 광고 카드에는 승인 문구만 표시하며 고객 질문·희망 조건·선택 서비스는 짧은 1회 ticket으로 AP 첫 상담 화면에 옮긴다. 실모델 미설정에서는 AI 성공을 표시하지 않고 사람 문의로 전환한다. 고객 동의 접수는 AP 원본에 서버가 확인한 placement ID를 기록한다. 배치 취소·slot 중지·DNS 만료 후 새 접근은 거부하고 기존 확인키 원본은 유지한다. 매체 API/문서에는 고객 연락처·사진·확인키·원문을 반환하지 않는다. 조직별 배치 대화 시작 24시간 한도를 추가했다.
- **수정 파일:** `apps/agent-api/migrations/{000024_placement_embed.sql,000025_handoff_conditions.sql}`, `apps/agent-api/src/{placements,placement-limit,deployments,customer-consultations}.ts`, `apps/agent-api/test/distribution.db.test.ts`, `apps/agent-web/src/{agent-publisher,agent-deploy,agent-public,agent-campaigns}.tsx`, `package.json`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, `docs/technical/{D03_EXTERNAL_CARD_DESIGN.md,D02_PLACEMENT_DESIGN.md,PHASE_2_EXECUTION_PLAN.md}`, 이 파일 및 재생성 마스터 문서. Field 코드·DB는 변경하지 않았다. Git 저장소·커밋 ID는 없다.
- **핵심 결정:** 설치 코드 발급은 실제 제휴 기사 게재 증빙과 별개로 표시한다. 고객 placement 귀속은 요청 body가 아니라 AP 배포·세션에서만 정한다. AP 기본 상담 위젯에는 배치/매체 의존성을 추가하지 않았다. iframe은 정확한 origin의 `frame-ancestors`와 Referer를 확인하며 기존 AP nonce→session→ticket 경로를 사용한다. 배치별 대화 시작은 조직 잠금 아래 제한하고 sandbox/live의 한도 미설정은 `budget_not_configured`로 차단한다. 외부 모델·알림 공급사가 없으면 `blocked_integration`을 유지한다.
- **실제 검사/환경:** 로컬 AP PostgreSQL 17.11, mock API 4311/웹 3001, 합성 AP/매체 분리 HTTPS origin. 선행 `pnpm --filter @fieldai/agent-api exec tsx --test test/distribution.db.test.ts`는 설치 API 404로 의도한 red(exit 1), 구현 후 `pnpm test:spike:distribution:agent` 1/1 exit 0이다. 설치 권한/재시도, origin/CSP, DNS 만료, nonce와 handoff 1회, 배치 ID 위조 무시, 질문·조건·서비스 보존, AI 미설정 및 합성 AI 대화의 AP 원본 접수, 철회·기존 조회, 세 시작 경로의 24시간 한도를 검사했다. `pnpm test:spike:deployments:agent`, `pnpm test:spike:consultations:agent`, `pnpm test:spike:placements:agent`, `pnpm test:spike:publishers:agent`, `pnpm test:spike:campaigns:agent` 각각 1/1 exit 0. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 별도 origin Playwright Chrome에서 카드→질문·조건·서비스 AP 인계→동의 접수, 부모 DOM 개인정보 비노출, 320px 넘침 없음·page error 0건, 철회 후 새 접근 거부·기존 확인키 조회를 확인했다. 합성 계정/조직은 정리했다.
- **실패 접근·복구:** 구현 전 404는 TDD red다. 첫 `pnpm typecheck`는 `deployments.ts`의 nullable `session.rows[0]`로 exit 2였고 명시 검증 뒤 통과했다. 첫 브라우저 실행은 Playwright APIRequestContext가 합성 HTTPS 이름을 직접 DNS 조회해 실패했으며 로컬 프록시 검수 URL로 수정해 재실행 통과했다. 배치 철회는 AP 원본 삭제로 처리하지 않는다.
- **미검수/남은 작업:** 실 제휴 매체 DNS/TLS와 기사 게재, 제3자 쿠키 강제 차단·중첩 ancestor 브라우저, 실제 AI/외부 알림, D04 개인정보 없는 성과 집계, 정식 QA97~103/118와 Distribution gate가 남았다. 전체 46개 작업의 정식 계약·독립·fault/E2E·보안·복구·청구·공급사·출시 검수는 완료되지 않았다. `test:e2e:distribution` 등 정식 명령은 아직 구현 게이트이며 통과로 기록하지 않는다.
- **다음 에이전트 정확한 명령:** 먼저 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 D04 변경 범위·QA104~107·검사 명령을 기록한다. `TASKS.md` D04와 `docs/03_INTEGRATION_CONTRACT.md`, `docs/06_REQUIREMENTS_QA.md`를 읽고 source event·데모 제외·작은 집단/차분 억제 조건을 설계한다. AP 4311/웹 3001은 실행 중일 수 있으므로 포트를 확인한다. 특별한 합성 origin 없이 일반 로컬 사용 시 AP API는 아래 `AP_PROFILE=mock` 명령으로 실행한다. 같은 AP DB migration을 포함한 spike 검사는 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
node tools/run-migrations.mjs agent
pnpm test:spike:distribution:agent
pnpm test:spike:placements:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
AP_PROFILE=mock node --env-file=infra/agent/.env --import tsx apps/agent-api/src/server.ts
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — D02 AP 정확한 카드 버전 배치 승인 (2026-09-24)

- **현재 목표:** v3.0 명세와 `reference/field_ui_prototype_v3.html`을 따라 AP/Field 독립 기능, 공식 연동, 매체 배포를 사용할 수 있는 환경으로 연결한다. 사용자 시각 검토는 기능 작업을 멈추는 조건이 아니다. 총 46개 중 C00 implemented, 22개 in_progress, 23개 planned, verified 0개다. D02는 `in_progress`이고 운영 출시는 승인되지 않았다.
- **완료 작업:** AP 사업자 owner가 현재 공개 카드 release를 활성·검증된 매체 slot에 요청하고, 매체 owner가 정확한 release ID와 문구 hash를 보고 승인/거절/중지하며 사업자 owner가 취소한다. 배치 release/slot은 DB에서 고정된다. 공개 API와 `/placements/[id]` AP 미리보기는 현재 카드 release, 승인 지식, slot 활성, 도메인 검증, 승인 상태를 매번 재검사한다. 새 카드 release·slot 중지·DNS 만료·취소는 기존 배치를 숨긴다. AP 사업/매체 outbox에 ID/상태만 기록하고 요청 키는 중복 제출을 복구한다. 사업자/매체 웹에 실제 요청/검토 목록과 상태를 연결했다.
- **수정 파일:** `apps/agent-api/migrations/000023_placements.sql`, `apps/agent-api/src/{app,placements}.ts`, `apps/agent-api/test/placements.db.test.ts`, `apps/agent-web/src/{agent-campaigns.tsx,agent-campaigns.css,agent-publisher.tsx,agent-publisher.css,app/placements/[id]/page.tsx}`, `package.json`, `docs/technical/{D02_PLACEMENT_DESIGN.md,PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일 및 재생성 마스터 Markdown/HTML. Field 코드·DB 변경 없음. Git 저장소·커밋 없음.
- **핵심 결정:** 사업자 공개와 매체의 정확 버전 승인을 별도 상태로 유지한다. 동일 release/slot은 한 번만 요청할 수 있고 취소 후 재배치에는 새 release가 필요하다. 매체 editor는 목록 조회만 가능하고 결정은 owner만 한다. 공개 가능한 상태가 바뀌면 기존 승인 기록은 보존하되 노출을 즉시 보류한다. AP 공개 페이지는 현재 승인 흐름의 미리보기이며 제휴 외부 사이트 설치·광고 대화는 D03이다.
- **실제 검사/환경:** 로컬 AP PostgreSQL 17.11, `AP_PROFILE=mock` API 4311/웹 3001. 새 API 전 `pnpm --filter @fieldai/agent-api exec tsx --test test/placements.db.test.ts`는 404로 의도한 red(exit 1), 구현 후 `pnpm test:spike:placements:agent` 1/1 exit 0. 무인증/타 사업·타 매체·매체 editor 결정 거부, 재시도 key/body 충돌, 초안 수정 뒤 기존 release 승인, 새 release 뒤 기존 배치 404, 잘못된 hash/release 409, slot 중지·재활성, DNS 만료·재확인, 취소/거절을 검수했다. D00/D01 회귀 `pnpm test:spike:campaigns:agent`·`pnpm test:spike:publishers:agent` 각 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome 두 합성 계정 320px에서 사업자 카드 공개→매체 slot 활성→배치 요청→매체 승인→AP 공개 카드→사업자 취소와 공개 404→200→404, 가로 넘침 없음·page error 0건 확인. 합성 계정·조직 정리.
- **실패 접근·복구:** 초기 404는 TDD red다. 첫 `pnpm typecheck`는 테스트 배열 첫 항목의 nullable 처리 누락 5건으로 exit 2, `assert.ok`를 추가해 통과했다. 브라우저 앞선 두 실행은 닫힌 `<option>`이 visible이길 기다린 스크립트 오류로 실패했고, 버튼 활성 상태 대기로 고쳐 재실행했다. 실제 320px 사업자 화면은 긴 매체 origin으로 가로 넘침이 발생해 `.campaign-placements`의 줄바꿈을 수정하고 320px 재실행 통과했다. 배치 취소/중지는 원장을 지우지 않고 공개 조회에서 숨긴다. 운영 데이터 삭제·고객 발송·청구는 하지 않았다.
- **미검수/남은 작업:** A09 공식 통합자 API/OAuth, D03 실제 외부 기사 카드·AP 광고 상담 전환, D04 성과, 실매체 DNS/TLS·운영 관리자, 정식 QA90~96과 Distribution gate. 전체 46개 task·160개 QA의 정식 계약/DB/독립/fault/E2E/보안/복구·실공급사/청구/출시 검수는 미완료다. 공급사 credential/계약 부재 경로는 `blocked_integration`이다.
- **다음 에이전트 정확한 명령:** 다음 작업 파일 범위·요구/QA·검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 기록한 뒤 D03 설계·테스트를 시작한다. AP 4311/3001 서버는 실행 중일 수 있으므로 포트를 확인하고 새 코드로 재기동한다. AP API는 `AP_PROFILE=mock node --env-file=infra/agent/.env --import tsx apps/agent-api/src/server.ts`, 웹은 `pnpm --filter @fieldai/agent-web start`다. 같은 AP DB migration을 포함한 spike 테스트는 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
node tools/run-migrations.mjs agent
pnpm test:spike:placements:agent
pnpm test:spike:campaigns:agent
pnpm test:spike:publishers:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — D01 AP 매체 조직·도메인·광고 위치 (2026-09-24)

- **현재 목표:** 사용자 지시대로 v3.0·`reference/field_ui_prototype_v3.html` 기준 AP/Field 기능을 끝까지 연결해 사용할 수 있는 환경을 만든다. C03 시각 검토는 기능 개발의 대기 조건이 아니다. 총 46개 작업 중 C00 implemented, 21개 in_progress, 24개 planned, verified 0개다. D01은 `in_progress`이며 최종 출시/인수는 미완료다.
- **완료 작업:** AP 계정에 매체 조직·owner/editor/viewer membership을 사업 조직과 별도로 만들고 HTTPS origin 등록, DNS TXT 소유 확인, 7일 유효기간, article/sidebar 광고 위치 등록·활성/중지, 매체 outbox 사건 기록을 구현했다. 매체 사용자 화면 `/publisher`를 실제 AP API/DB에 연결했다. 검증 전·만료 후 위치 활성화는 거부한다. 카드 배치 승인은 아직 만들지 않아 D00 공개 카드가 자동 노출되지 않는다.
- **수정 파일:** `apps/agent-api/migrations/000022_publisher_core.sql`, `apps/agent-api/src/{app,publishers}.ts`, `apps/agent-api/test/publishers.db.test.ts`, `apps/agent-web/src/{agent-publisher.tsx,agent-publisher.css,agent-campaigns.tsx,app/publisher/page.tsx}`, `package.json`, `docs/technical/{D01_MEDIA_DESIGN.md,PHASE_2_EXECUTION_PLAN.md}`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일, 재생성 마스터 Markdown/HTML. Field 코드·DB·공개 제품 간 계약 변경 없음. Git 저장소·커밋 없음.
- **핵심 결정:** AP 인증 사용자 하나가 사업/매체 조직에 각각 가입할 수 있지만 권한 원장은 분리한다. 매체 owner만 도메인 소유 확인과 slot 활성/중지를, owner/editor만 slot 등록을 수행한다. 동일 HTTPS origin은 현재 한 매체 조직에만 등록한다. 실제 DNS는 `_ap-publisher.<host>` TXT 값 `ap-publisher-verification=<proof>`로 확인하고 7일 후 만료한다. slot 조회의 `available`은 현재 검증 만료를 반영한다. 활성/중지 같은 상태 반복은 새 사건을 만들지 않는다. A09 OAuth 외부 client·D02 정확한 카드 버전 배치는 후속이다.
- **실제 검사/환경:** 로컬 AP PostgreSQL 17.11, `AP_PROFILE=mock` API 4311/웹 3001. 선행 `pnpm --filter @fieldai/agent-api exec tsx --test test/publishers.db.test.ts`는 새 라우트 404로 의도한 red(exit 1), 구현 후 `pnpm test:spike:publishers:agent` 1/1 exit 0. 무인증 401, 타 매체/사업 조직 권한 404, 중복 origin 409, DNS 거부/주입 검증 성공, 검증 만료, owner/editor 구분, 위치 중지 사건 멱등을 확인했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome 320px에서 조직→도메인→위치, 실제 DNS 기록 없는 합성 도메인의 검증 실패, mock DB 검증 상태 주입 뒤 UI 활성/중지, 가로 넘침 없음·page error 0건. 검수용 계정/조직 정리. 문서 `build_report.py`·`check_package.py` exit 0이며 후자는 문서 패키지만 검사했다.
- **실패 접근·복구:** 새 API 구현 전 404는 의도한 TDD 실패다. 브라우저 첫 실행은 비동기 목록 새로고침 완료 전 활성화 버튼을 읽어 실패했고 버튼 활성 상태를 기다리도록 검수 스크립트를 고쳐 재실행 통과했다. DNS가 없으면 409를 표시하고 검증 상태를 적지 않는다. 실제 매체 도메인의 DNS 검수 성공을 주장하지 않는다. slot 중지는 과거 배치 기록을 자동 변경하지 않으며 향후 D02에서 public serving이 `available`/정확한 승인 버전을 검사해야 한다.
- **미검수/남은 작업:** A09 공식 통합자 OAuth/API, D02 사업자 요청과 매체의 정확 버전 승인, D03 실제 외부 노출/상담, 실제 매체 DNS/TLS·운영 관리자, 도메인 장기 소유 재확인/분쟁 처리, 정식 QA92/94/95·Distribution gate가 남았다. 전체 46개 작업의 정식 계약/DB/독립/fault/E2E/보안/복구·실공급사/청구/출시 검수는 미완료다. 자격증명/계약 부재는 `blocked_integration`이다.
- **다음 에이전트 정확한 명령:** 다음 작업의 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 같은 AP DB migration을 포함한 spike 테스트는 순차 실행한다. AP 4311/3001 서버가 실행 중일 수 있으므로 포트를 확인하고 새 코드로 재기동한다. 현재 AP API는 `AP_PROFILE=mock node --env-file=infra/agent/.env --import tsx apps/agent-api/src/server.ts`, 웹은 `pnpm --filter @fieldai/agent-web start`로 기동했다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
node tools/run-migrations.mjs agent
pnpm test:spike:publishers:agent
pnpm test:spike:campaigns:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — D00 AP 홍보 카드 초안·공개 (2026-09-24)

- **현재 목표:** v3.0 문서와 `reference/field_ui_prototype_v3.html` 기준으로 AP/Field 독립 기능을 끝까지 연결해 사용할 수 있는 환경을 만든다. 화면 시각 검토는 기능 구현의 대기 조건이 아니다. 총 46개 작업 중 C00 implemented, 20개 in_progress, 25개 planned, verified 0개다. D00은 `in_progress`이며 전체 출시 게이트는 미완료다.
- **완료 작업:** AP의 승인 지식 release를 선택한 홍보 카드 초안, 사업자 owner의 명시 확인·revision/멱등 공개, 불변 카드 release, 공개 중지·재공개, 공개 카드 `광고` 표시와 AP 직접 문의 링크를 구현했다. 지식 승인으로 상호/서비스 설명이 바뀌면 기존 공개 카드가 보류되고, 최신 승인 지식으로 초안을 저장·새 버전 승인하면 다시 공개된다. 매체 배치 승인이나 Field 예약을 카드/기본 상담 위젯에 연결하지 않았다.
- **수정 파일:** `apps/agent-api/migrations/{000020_campaign_cards.sql,000021_campaign_source_delete_order.sql}`, `apps/agent-api/src/{app,campaigns}.ts`, `apps/agent-api/test/campaigns.db.test.ts`, `apps/agent-web/src/{agent-campaigns.tsx,agent-campaigns.css,workspace.tsx,app/workspace/campaigns/page.tsx,app/cards/[id]/page.tsx}`, `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일, 재생성 마스터 Markdown/HTML. Field 코드·DB·공개 연동 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 결정:** 승인 KnowledgeRelease의 상호·서비스명·설명만 카드 내용에 사용하고 가격·자격·후기·AI 광고 문구를 자동 생성하지 않는다. 사용자는 승인 사실을 체크해야 하며 owner만 공개할 수 있다. 초안 수정은 공개 release를 바꾸지 않는다. 승인 키는 해시만 저장하고 같은 키/본문은 200, 다른 본문은 409다. 공개 API는 매 요청에 최신 승인 지식의 해당 문구를 확인해 달라지면 404로 노출을 보류한다. 기존 release는 삭제하지 않고 새 버전으로 재승인한다. 지식 FK는 조직 삭제 시 참조 순서를 위해 지연 제약으로 보강했다.
- **실제 검사/환경:** 로컬 AP PostgreSQL 17.11, `AP_PROFILE=mock`, AP API 4311/웹 3001. 선행 `pnpm --filter @fieldai/agent-api exec tsx --test test/campaigns.db.test.ts`는 카드 라우트 404로 의도한 red(exit 1). 구현 후 `pnpm test:spike:campaigns:agent` 1/1 exit 0. 무인증/타 조직·editor 공개 거부, 초안 공개 분리, 승인 재시도/충돌, source 변경 보류·새 release 재승인, 중지·release 보존을 검수했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome 320px에서 신규 카드 생성→공개→초안 수정 중 공개본 유지→중지(404), 지식 승인 변경→최신 초안 저장→재공개(200), 가로 넘침 없음·page error 0건. 합성 계정/조직 2건 정리. `/tmp/fieldai-report-venv/bin/python tools/build_report.py`와 `tools/check_package.py` exit 0, 후자는 `document_package_only`다.
- **실패 접근·복구:** API 첫 green 실행에서 조직 정리가 지식 release FK 순서에 걸려 실패했고 000021 지연 제약 migration 후 통과했다. 첫 브라우저 실행은 재기동 AP 서버에 `AP_PROFILE=mock` 누락으로 인증 origin 403, 다음은 테스트 선택자가 제목/설명을 함께 매칭해 실패했다. 프로필과 선택자를 고쳐 전체 흐름을 재실행했다. 카드 발행 응답 분실 시 브라우저는 같은 승인 키를 보유해 재시도하고 공개/중지 상태는 서버에서 다시 확인한다. release를 지우거나 기존 승인 내용을 임의 롤백하지 않는다.
- **미검수/남은 작업:** D00의 AI 홍보 문구/검토 정책, AP 구조화 가격 source, 정식 QA87~91·복구/운영 게이트. D01/D02 매체 조직·위치와 정확한 카드 버전 배치 승인, D03~D05 외부 유입·성과/출시가 남았다. 46개 작업의 정식 DB/계약/독립/fault/E2E/보안 검수, 외부 인증·LLM·알림·청구/실도메인도 미완료다. 공급사 credential/계약 부재는 `blocked_integration`이며 출시 승인 아님.
- **다음 에이전트 정확한 명령:** 다음 Task의 변경 경로·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 같은 AP DB migration/spike 테스트는 순차 실행한다. AP 4311/3001 서버가 실행 중일 수 있으므로 재기동 전 포트를 확인한다. 현재 AP API는 `AP_PROFILE=mock node --env-file=infra/agent/.env --import tsx apps/agent-api/src/server.ts`, 웹은 `pnpm --filter @fieldai/agent-web start`로 기동했다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
node tools/run-migrations.mjs agent
pnpm test:spike:campaigns:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A02/F05/F07 비회원 확인키 폐기·교체 (2026-09-24)

- **현재 목표:** v3.0·`reference` 기준 AP/Field 독립 기능을 끝까지 연결해 사용할 수 있는 환경을 만든다. 사용자 시각 검토는 기능 개발의 대기 조건이 아니다. 전체 46개 작업·160개 QA와 출시 게이트는 미완료이며 C00 implemented, 19개 in_progress, 26개 planned다. A02/F05/F07은 계속 `in_progress`다.
- **완료 작업:** AP 문의·Field 문의·Field 예약의 비회원 고객이 현 확인키로 새 키를 등록하면 이전 키가 바로 원문·사진·후속 처리 권한을 잃는다. 브라우저는 32바이트 무작위 새 키를 활성화 전에 보여주고 보관 확인을 요구한다. 동시 동일 교체·응답 분실 뒤 같은 제출을 한 감사 기록으로 복구하며, 키가 또 바뀐 과거 교체 요청은 성공으로 오인하지 않는다. 폐기된 접수 키의 초기 제출 재시도로 원문 키가 다시 노출되지 않는다. 사업자 권한·원본 상태·예약 사건/알림은 유지한다.
- **수정 파일:** AP `apps/agent-api/migrations/000019_inquiry_receipt_rotations.sql`, `apps/agent-api/src/{app,receipt-rotation}.ts`, `apps/agent-api/test/{inquiries,inquiry-attachments}.db.test.ts`, `apps/agent-web/src/agent-public.tsx`; Field `apps/field-api/migrations/000018_receipt_rotations.sql`, `apps/field-api/src/{app,receipt-rotation}.ts`, `apps/field-api/test/{business-core,bookings,inquiry-attachments}.db.test.ts`, `apps/field-web/src/{field-public,field-booking,receipt-rotation}.tsx`; `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일 및 재생성 마스터 Markdown/HTML. 제품 간 내부 import·공개 연동 계약 변경 없음. Git 저장소·커밋 없음.
- **핵심 결정:** 각 제품의 기존 `visitor_key_hash`만 트랜잭션 중 원본 행 잠금 아래 교체한다. 제품별 회전 기록은 해당 문의/예약을 FK로 참조하고 요청 키·이전/다음 확인키의 SHA-256 해시만 저장한다. 새 키 원문은 고객 브라우저가 보관하며 API 응답/DB/outbox에 넣지 않는다. `Idempotency-Key`+같은 이전/다음 키 요청만 200 재시도하고, 후속 회전으로 폐기된 기록은 409다. 기존 키나 과거 키를 다시 다음 키로 쓰지 못한다. 키 교체는 업무 사건·발송 이벤트가 아니다. 응답 분실 뒤 현재 페이지에서 같은 요청을 재시도할 수 있지만 브라우저 새로고침 전에 키를 복사하지 않고 분실한 경우 자동 복구는 하지 않는다.
- **실제 검사/환경:** 로컬 AP/Field PostgreSQL 17.11, `AP_PROFILE=mock`/`FIELD_PROFILE=mock`, AP 4311/3001·Field 4321/3002. 선행 `pnpm test:spike:inquiries:agent`, `pnpm test:spike:business:field`, `pnpm test:spike:bookings:field`는 교체 경로 404의 의도한 red(exit 1). 구현 뒤 각각 1/1·2/2·3/3 exit 0. 다른 문의/잘못된 키, 병렬 같은 요청, 동일 재시도, 과거 키 재사용 거부, 후속 교체 뒤 오래된 요청 거부, 원본/사업자 접근과 outbox·예약 사건 불변을 검수했다. AP/Field 사진 접근 회귀 `pnpm test:spike:attachments:agent`·`pnpm test:spike:attachments:field` 각 1/1에서 구키 사진 401·신키 사진 200, AP 상담 `pnpm test:spike:consultations:agent` 1/1. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 두 API/웹 빌드, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome에서 AP 문의 교체 200 응답을 브라우저에만 실패시킨 뒤 같은 입력으로 복구했고, Field 문의·예약을 교체해 기존 키 거부·새 키 재열람·새로고침, 320px 넘침 없음·page error 0건을 확인했다. 합성 계정·조직/실패 원장은 정리했다.
- **실패 접근·복구:** 3개 선행 API 404는 의도한 TDD red다. 구현 후 브라우저 첫 실행 통과. 교체 요청/응답 불명은 고객 화면에 새 키와 같은 요청 재시도 안내를 남긴다. 회전 코드 되돌림은 새 API만 제거하고 현재 활성화된 키 해시는 보존해야 하므로 migration/원본 키를 임의 롤백하지 않는다. 운영 데이터 삭제·고객 메시지 발송·청구는 하지 않았다.
- **미검수/남은 작업:** 새 키 생성의 외부 클라이언트 품질, 브라우저 새로고침 뒤 키 분실 지원, 실제 프록시/보안 운영·감사 보존/복구, 일반 비회원 접수 남용, AP 최초 브라우저 범위 HttpOnly 세션, 정식 QA19 전체/G-A2/G-F2. AP/Field 인증·실 AI/알림/결제, 공식 연동·매체 및 전체 정식 DB/계약/독립/fault/E2E/보안/출시 게이트도 미완료다. 외부 공급사 credential/계약 부재 경로는 `blocked_integration`이며 운영 출시 승인 아님.
- **다음 에이전트 정확한 명령:** 다음 Task의 변경 경로·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 같은 제품 DB migration을 수행하는 spike 테스트는 순차 실행한다. AP 4311/3001, Field 4321/3002 서버가 실행 중일 수 있으므로 재기동 전 포트를 확인한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
node tools/run-migrations.mjs agent
node tools/run-migrations.mjs field
pnpm test:spike:inquiries:agent
pnpm test:spike:attachments:agent
pnpm test:spike:consultations:agent
pnpm test:spike:business:field
pnpm test:spike:bookings:field
pnpm test:spike:attachments:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm build:web:agent
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — A02 AP 비회원 확인키 실패 제한 (2026-09-24)

- **현재 목표:** v3.0·`reference` 기준 독립 AP/Field의 기능을 끝까지 연결해 사용할 수 있는 환경을 만든다. 사용자 화면 시각 검토는 기능 개발의 대기 조건이 아니다. 전체 46개 작업·160개 QA·출시 게이트는 미완료이며 C00 implemented, 19개 in_progress, 26개 planned다. A02는 계속 `in_progress`다.
- **완료 작업:** AP 고객 문의 원본·후속 메시지·사진 경로의 잘못된 확인키를 문의 ID와 서버 확인 접속 주소 단위로 센다. 15분 내 5회면 15분간 429/`Retry-After`를 반환하며 정상 접근은 실패 기록을 지운다. 위조 `X-Forwarded-For`로 제한을 우회하지 못하고 다른 문의·사업자 API·직접 접수 멱등 재시도는 유지한다. AP 고객 화면에는 차단 안내를 따로 표시한다.
- **수정 파일:** `apps/agent-api/migrations/000018_receipt_attempts.sql`, `apps/agent-api/src/{app,receipt-abuse}.ts`, `apps/agent-api/test/inquiries.db.test.ts`, `apps/agent-web/src/agent-public.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일 및 재생성 마스터 Markdown/HTML. Field 코드/DB·제품 간 공개 계약 변경 없음. Git 저장소·커밋 없음.
- **핵심 결정:** AP 실패 원장에 확인키/IP 원문 대신 `AP_AUTH_SECRET`을 도메인 분리해 만든 HMAC과 문의 UUID만 기록한다. JSON 확인키 오류 401/404만 누적하고, 2xx 고객 응답은 같은 접속 주소의 실패 기록을 지운다. 없는 문의 ID도 횟수 제한할 수 있게 FK를 두지 않았으며 하루 넘은 기록은 간헐적으로 정리한다. 프록시 뒤 공유 IP나 신뢰 프록시 설정은 실제 배포에서 별도 확인한다. Field 비밀키·DB·런타임 코드를 사용하지 않는다.
- **실제 검사/환경:** 로컬 AP PostgreSQL 17.11, `AP_PROFILE=mock`, API 4311/웹 3001. 선행 `pnpm test:spike:inquiries:agent`는 5회 실패 뒤 올바른 키가 200인 의도한 red(exit 1), 구현 후 1/1 exit 0. 문의 GET·후속 POST·사진 GET/POST를 함께 센다. 다른 문의 접근, 위조 헤더, 15분 만료 후 실패 1회 초기화·정상 접근 뒤 원장 삭제도 테스트했다. `pnpm test:spike:attachments:agent` 1/1, `pnpm test:spike:consultations:agent` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome 320px에서 합성 문의의 5회 오류 뒤 429 안내, 넘침 없음·page error 0건을 확인하고 합성 계정·조직·실패 원장을 정리했다. AP `/health/ready`와 웹 루트는 HTTP 200이었다.
- **실패 접근·복구:** DB red는 의도한 TDD 실패였다. 브라우저 검사는 첫 실행에 통과했다. 훅을 되돌리면 제한을 중지할 수 있으며 추가 테이블은 문의 원본을 변경하지 않는다. 운영 데이터 복제·삭제·외부 발송은 수행하지 않았다.
- **미검수/남은 작업:** AP/Field 확인키 폐기·재발급, 일반 비회원 접수 rate limit·남용, 실제 프록시별 접속 주소·공유 IP, AP 최초 브라우저 범위 세션, 새로고침 뒤 분실 응답 복구, 실알림/AI·정식 QA19/41/G-A2. 전체 정식 DB/계약/독립/fault/E2E/보안 게이트 및 AP/Field 구독·연동·매체·최종 인수는 미완료다. 외부 credential/계약 부재 부분은 `blocked_integration`이며 운영 출시 승인이 아니다.
- **다음 에이전트 정확한 명령:** 다음 Task의 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 기록한다. 같은 AP DB migration을 사용하는 spike 명령은 순차 실행한다. AP 4311/3001, Field 4321/3002 로컬 프로세스가 실행 중일 수 있으므로 재기동 전 포트를 확인한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
node tools/run-migrations.mjs agent
pnpm test:spike:inquiries:agent
pnpm test:spike:attachments:agent
pnpm test:spike:consultations:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — F05/F07 Field 비회원 확인키 실패 제한 (2026-09-24)

- **현재 목표:** v3.0·`reference` 기준 AP/Field 독립 기능을 이어 연결해 사용할 수 있는 환경을 만든다. 사용자 시각 검토는 기능 개발의 대기 조건이 아니다. 전체 46개 작업·160개 QA·출시 게이트는 미완료이며 C00 implemented, 19개 in_progress, 26개 planned다. F05/F07은 여전히 `in_progress`다.
- **완료 작업:** Field 고객 문의·예약의 확인키 API에서 같은 원본·접속 주소의 잘못된 확인키가 15분 내 5회면 15분간 429/`Retry-After`를 반환한다. 정상 접근은 실패 기록을 지우고 다른 대상은 이용할 수 있다. 문의·예약 고객 화면에서 차단 상태를 따로 안내한다. 위조 `X-Forwarded-For`가 제한을 우회하지 못하는 것을 확인했다.
- **수정 파일:** `apps/field-api/migrations/000017_receipt_attempts.sql`, `apps/field-api/src/{app,receipt-abuse}.ts`, `apps/field-api/test/{business-core,bookings}.db.test.ts`, `apps/field-web/src/{field-public,field-booking}.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일 및 재생성 마스터 Markdown/HTML. AP 코드/DB·제품 간 공개 계약 변경 없음. Git 저장소·커밋 없음.
- **핵심 결정:** 확인키 원문·IP 원문을 실패 원장에 저장하지 않고 Field 인증 비밀키의 HMAC과 대상 UUID/종류만 저장한다. JSON의 확인키 오류 401/404만 센다. 성공한 확인키 고객 접근은 원장을 지우며 존재하지 않는 대상도 제한할 수 있게 실패 원장에 FK를 두지 않는다. 오래된 행은 대상 경로 요청에서 시간 간격을 두고 정리한다. Fastify가 확인한 `request.ip`만 사용하고 임의 `X-Forwarded-For`는 믿지 않는다. 프록시가 모든 고객을 한 접속 주소로 합치는 실제 배포에서는 신뢰 프록시 구성을 별도로 검수해야 한다. 제출 rate limit·확인키 폐기/재발급은 이 범위에 없다.
- **실제 검사/환경:** 로컬 Field PostgreSQL 17.11, `FIELD_PROFILE=mock`, API 4321/웹 3002. 선행 `pnpm test:spike:business:field`·`pnpm test:spike:bookings:field`는 5회 실패 후 정상 키에 200을 줘 의도한 red(exit 1); 구현 뒤 각각 2/2·3/3 exit 0. 위조 헤더·15분 경과 뒤 실패 횟수 초기화를 추가한 뒤에도 통과했다. 사진 접근 회귀 `pnpm test:spike:attachments:field` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome에서 합성 문의·예약을 각각 5회 틀린 뒤 고객 화면 429 문구, 320px 넘침 없음, page error 0건 확인. 합성 계정·조직·실패 원장을 정리했다. Field `/health/ready`와 웹 루트는 HTTP 200이다.
- **실패 접근과 복구:** 의도한 TDD red 외에 첫 브라우저 스크립트의 예약용 잘못된 키가 형식 조건을 만족하지 못해 404 예상 대신 401 `receipt_required`를 받았다. 유효 형식의 잘못된 키로 바꾸어 같은 흐름을 재실행했고 통과했다. 서비스 로직/테스트 기대를 결함에 맞춰 완화하지 않았다. 문제 발생 시 훅을 되돌리면 새 제한을 중지할 수 있고, DB 테이블은 기존 문의·예약 원본을 건드리지 않는다. 운영 데이터 삭제는 하지 않는다.
- **미검수/남은 작업:** 일반 비회원 제출 rate limit·IP/조직 단위 남용, 실제 프록시 신뢰/공유 IP 검수, 확인키 폐기·재발급, AP 확인키 방어, 새로고침 뒤 응답 분실 복구, 실공급사 알림·정식 QA19/25/40/G-F2. 정식 DB/계약/독립/fault/E2E/보안 게이트와 AP/Field 구독·연동·매체·최종 인수도 남는다. credential/계약 부재 경로는 `blocked_integration`이며 운영 출시 승인이 아니다.
- **다음 에이전트 정확한 명령:** 다음 선택 Task의 파일 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 같은 Field DB migration을 쓰는 spike 테스트는 순차 실행한다. AP 4311/3001, Field 4321/3002 로컬 프로세스가 실행 중일 수 있으므로 재기동 전 포트를 확인한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
node tools/run-migrations.mjs field
pnpm test:spike:business:field
pnpm test:spike:bookings:field
pnpm test:spike:attachments:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — F07 Field DST 전환 슬롯 (2026-09-24)

- **현재 목표:** v3.0·`reference` 기준 AP/Field 독립 기능을 끝까지 연결해 사용할 수 있는 환경을 만든다. 화면 시각 검토는 기능 개발의 대기 조건이 아니다. 전체 46개 작업·160개 QA·출시 게이트는 미완료이며 C00 implemented, 19개 in_progress, 26개 planned다. F07은 여전히 `in_progress`다.
- **완료 작업:** Field 시간표가 DST 가을 반복 현지 시각을 두 실제 ISO instant로 제시하고 봄에 존재하지 않는 현지 시각은 건너뛴다. 실제 경과 시간으로 서비스 소요와 영업 종료를 비교한다. 모호한 영업 시작은 첫 순간, 종료는 마지막 순간을 사용하며 없는 경계는 다음 유효 분으로 이동한다. 신청 기간은 현지 달력 날짜로 계산하고 고객 선택에는 GMT offset을 표시한다. 서로 다른 반복 01:00 두 건을 실제 예약·확정할 수 있다.
- **수정 파일:** `apps/field-api/src/bookings.ts`, `apps/field-api/test/bookings.db.test.ts`, `apps/field-web/src/field-booking.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일 및 재생성 마스터 Markdown/HTML. DB schema·AP 코드/DB·제품 간 계약 변경 없음. Git 저장소·커밋 없음.
- **핵심 결정:** 현지 시각→UTC는 후보 0·1·2개로 다룬다. 슬롯 시작 후보는 실제 영업 UTC 경계와 비교하고 종료는 시작 instant에 서비스 소요 분을 더해 평가한다. 반복 영업 경계 선택 규칙을 고정하고 없는 경계는 최대 6시간 안의 다음 유효 분으로 옮기며 그날이 통째로 없으면 슬롯을 내지 않는다. 점유·완충은 기존 절대 시간 범위를 유지한다. IANA 시간대에서의 현지 날짜와 일정 기간을 24시간 경과 시간으로 혼동하지 않는다.
- **실제 검사/환경:** 로컬 Field PostgreSQL 17.11, `FIELD_PROFILE=mock`, API 4321/웹 3002. 선행 `pnpm test:spike:bookings:field`는 두 번째 뉴욕 가을 01:00 누락 red(exit 1), 기간 검수 추가 뒤 봄 전환에서 하루 초과 허용 red(exit 1). 수정 후 3/3 exit 0. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports` exit 0. Playwright Chrome 320px에서 `2026-11-01` 01:00 GMT-4와 GMT-5의 별도 표시, 두 실제 시간의 신청·사업자 확정, 넘침 없음·page error 0건 확인. 합성 계정·조직은 정리했다.
- **실패 접근:** 기존 단일 UTC 변환은 반복 시각 하나를 버렸고, 24시간 덧셈으로 기간을 구하면 DST 봄에는 하루를 더 허용했다. 선행 테스트가 각각 이를 보여줘 후보 변환/현지 달력 기간 계산으로 바꿨다. 테스트 기대값을 결함에 맞춰 낮추지 않았다.
- **미검수/남은 작업:** F07 일반 남용 rate limit·확인키 반복 추측 방어, 일정 제안/정책 변경 경쟁의 전체 복구, 실알림·정식 QA25~34/G-F2. 이번 DST 증빙은 뉴욕 2026 전환과 로컬 mock이며 전체 IANA 시간대/실서버 시계 운영 검수는 아니다. Field F08 공급사/F09 구독, AP 실모델/결제, A09/I00 공식 연결, D/R와 정식 DB/계약/독립/fault/E2E/보안 게이트도 남는다. 외부 credential/계약 부재 경로는 `blocked_integration`이다.
- **다음 에이전트 정확한 명령:** 다음 Task의 경로·요구/QA·검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. AP 4311/3001, Field 4321/3002 로컬 프로세스가 실행 중일 수 있으니 재기동 전 포트를 확인한다. 같은 Field DB migration을 실행하는 spike 명령은 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
pnpm test:spike:bookings:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — F01/F07 Field 기본 예약 방식 상속 (2026-09-24)

- **현재 목표:** v3.0 문서와 `reference` 디자인 기준으로 AP/Field 독립 기능을 끝까지 연결해 사용할 수 있는 환경을 만든다. 화면 시각 검토는 기능 개발의 대기 조건이 아니다. 총 46개 작업·160개 QA·출시 게이트는 미완료다. C00 implemented, 19개 in_progress, 26개 planned이며 이번 F01/F07도 `in_progress`다.
- **완료 작업:** Field 카탈로그 초안에 기본 예약 방식 `request/slot`과 서비스별 `inherit/request/slot` 선택을 추가했다. 신규 서비스는 상속으로 시작한다. 승인 시 상속을 실제 방식으로 확정한 공개 snapshot을 만들고, 고객 사이트·예약 요청·원장에는 확정된 방식만 사용한다. 기본값이 바뀐 미승인 초안은 공개본을 바꾸지 않고 기존 예약도 이전 서비스 snapshot을 유지한다. 기존 초안/공개본의 명시 방식은 보존한다.
- **수정 파일:** `apps/field-api/src/business.ts`, `apps/field-api/test/{business-core,bookings}.db.test.ts`, `apps/field-web/src/{field-api,field-workspace,site-editor}.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일 및 재생성 마스터 Markdown/HTML. DB migration·AP 내부 코드/DB·제품 간 계약 변경 없음. Git 저장소·커밋 없음.
- **핵심 결정:** 상속 여부는 Field 카탈로그 초안 JSON에 남기고, 승인 공개본의 각 서비스 `bookingMode`는 반드시 `request` 또는 `slot`으로 고정한다. 이전 카탈로그에 없는 `defaultBookingMode`는 `request`로 보충하되 명시 서비스 값은 바꾸지 않는다. 새 필드를 생략한 구버전 편집 요청은 현재 초안의 기본값을 유지한다. 새 승인 release의 content/hash는 확정된 서비스 기준이며 이전 release는 그대로 둔다. 고객 제출과 예약 snapshot은 현재 승인본을 쓰고 재시도는 최초 예약 원본을 보존한다. 새 DB migration이나 공통 제품 타입 공유는 필요하지 않았다.
- **실제 검사/환경:** 로컬 Field PostgreSQL 17.11, `FIELD_PROFILE=mock`, API 4321/웹 3002. 선행 `pnpm test:spike:business:field`에서 기본값 누락 red(exit 1), 수정 뒤 2/2 exit 0. 구버전 요청의 기본값 보존도 잘못 `request`로 되돌아가는 red(exit 1) 후 2/2 exit 0. `pnpm test:spike:bookings:field` 2/2, `pnpm test:spike:sites:field` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports` exit 0. Playwright Chrome에서 사업자 상속/명시 초안 저장→승인, 고객의 slot/request 입력 분기, 상속 slot 예약 snapshot, 320/390px 넘침 없음·page error 0건을 확인했다. 합성 계정·조직은 정리했다.
- **실패 접근:** 초기 브라우저 스크립트가 부분 라벨 `예약 방식`으로 기본 설정 선택까지 포함해 엉뚱한 서비스를 수정했다. 정확한 서비스 카드 locator로 고쳤다. 이후 `<option>`은 숨겨진 DOM 요소라 visible 대기가 timeout이었고 attached 대기로 수정했다. 연락처 label 부분 일치도 checkbox까지 포함해 role textbox로 수정했다. 동일 제품 흐름은 최종 재실행 통과했다. 서버 테스트 기대값을 버그에 맞춰 완화하지 않았다.
- **미검수/남은 작업:** F07 DST 중복/없는 현지 시간, 확인키 반복 추측/남용·rate limit, 실알림·복구와 정식 QA25~34/77/G-F2. Field F08 실공급사·F09 구독, AP 실모델/결제, A09/I00 공식 연결과 D/R 작업도 남는다. 정식 DB/계약/독립/fault/E2E/보안 게이트는 미실행이며 공급사 credential/계약 부재 경로는 `blocked_integration`이다. 이 기능은 로컬 mock 부분 검수이며 출시 승인이 아니다.
- **다음 에이전트 정확한 명령:** 다음 Task의 경로·요구/QA·검사 명령을 먼저 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 기록한다. AP 4311/3001, Field 4321/3002 로컬 프로세스가 실행 중일 수 있으니 재기동 전 포트를 확인한다. 같은 Field DB migration을 실행하는 spike 명령은 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
pnpm test:spike:business:field
pnpm test:spike:bookings:field
pnpm test:spike:sites:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — F08 Field 문의·예약 처리 알림 (2026-09-24)

- **현재 목표:** v3.0 문서와 `reference` 디자인에 맞춰 AP/Field 독립 기능을 계속 연결해 로컬에서 사용할 수 있는 환경을 만든다. 사용자 지시에 따라 시각 검토는 기능 개발의 대기 조건이 아니다. 전체 46개 작업·160개 QA·출시 게이트는 미완료이며 F08은 `in_progress`다. 현재 C00 implemented, 19개 in_progress, 26개 planned다.
- **완료 작업:** Field 문의 생성/고객 추가 질문과 예약 요청·고객 수락/변경·취소 요청의 사업자 처리 알림을 Field outbox 사건에 1:1로 연결했다. owner/editor가 내부 목록·전체 미열람 수를 조회하고 사용자별 읽음을 저장한 뒤 원본 문의/예약을 연다. 기존 outbox도 멱등 보충한다. 내부 메모·수동 일정은 무알림이고 고객 대상 사건은 발송 성공 대신 `blocked_integration` 원장으로 남긴다.
- **수정 파일:** `apps/field-api/migrations/000016_notification_events.sql`, `apps/field-api/src/{app,notifications}.ts`, `apps/field-api/test/{business-core,bookings}.db.test.ts`, `apps/field-web/src/{field-workspace,field-booking,field-public}.tsx`, `apps/field-web/src/field-notification-label.ts`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일 및 재생성 마스터 Markdown/HTML. AP 내부 코드/DB·제품 간 계약 변경 없음. Git 저장소·커밋 없음.
- **핵심 결정:** 알림은 Field DB outbox insert 트리거의 동일 트랜잭션에서 기록하고 `outbox_id` 유일 제약으로 중복을 막는다. event type을 명시적으로 허용하고 고객 예약 사건은 `payload.notification='pending'`일 때만 기록한다. 사업자 사건은 `in_app/available`, 고객 외부 사건은 `kakao/blocked_integration`이다. 화면에는 기존 원본 메시지의 `pending`을 실제 발송 대기로 오해하지 않도록 내부 기록 또는 외부 미연결·미발송으로 표시한다. 원장에 연락처·본문·사진·확인키를 복제하지 않는다. 실공급사 전송/콜백·결과 미상·대체발송은 이 구현에 없다.
- **실제 검사/환경:** 로컬 Field PostgreSQL 17.11, `FIELD_PROFILE=mock`, API 4321/웹 3002. 선행 `pnpm test:spike:business:field`는 알림 GET 404 red(exit 1), 수정 후 2/2 exit 0. `pnpm test:spike:bookings:field` 2/2, `pnpm test:spike:attachments:field` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 문구 수정 뒤 `pnpm lint`, `pnpm typecheck`, `pnpm build:web:field`도 exit 0. 기존 outbox 알림 대상의 누락/대상 불일치 SQL 각각 0건. Playwright Chrome에서 합성 고객 문의·예약을 만들어 사업자 알림 2건, 해당 원본 이동, 미열람 2→0, 사업자 답변 뒤 고객/사업자 양쪽의 외부 미발송 표시, 320/390px 넘침 없음, page error 0건 확인. 합성 계정·조직은 정리했다.
- **실패 접근:** 최초 브라우저 합성 조직에 예약 정책을 만들지 않아 예약 요청이 `policy_not_set`으로 거절됐다. 테스트 설정에 예약 정책을 추가한 뒤 동일 흐름이 통과했다. 서비스 로직 또는 기대값을 변경해 통과시킨 것은 아니다. 선행 API 404는 의도한 TDD red였다.
- **미검수/남은 작업:** F08 실제 카카오/문자/푸시 공급사·콜백/unknown·대체발송·한도/보존/복구·정식 QA35~40/G-F2. Field F07 DST·기본 방식 상속·남용 방어, AP/Field 구독·공식 연결·매체·실모델, 전체 정식 DB/계약/독립/fault/E2E/보안 게이트도 미완료다. 공급사 credential/계약 부재 경로는 `blocked_integration`이다. 현재 내부 알림은 로컬 mock 검수 결과이며 운영 출시 승인 아님.
- **다음 에이전트 정확한 명령:** 다음 선택 Task의 변경 경로·요구/QA·검사 명령을 먼저 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 기록한다. AP 4311/3001, Field 4321/3002 로컬 프로세스가 실행 중일 수 있으므로 재기동 전 포트를 확인한다. 같은 Field DB migration을 쓰는 spike 테스트는 순차 실행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
node tools/run-migrations.mjs field
pnpm test:spike:business:field
pnpm test:spike:bookings:field
pnpm test:spike:attachments:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — A02 AP 비공개 고객 문의 사진 (2026-09-24)

- **현재 목표:** v3.0·reference UI에 맞춰 AP/Field 독립 기능을 끝까지 연결해 사용할 수 있는 환경을 만든다. 화면 디자인 검토는 기능 작업의 대기 조건이 아니다. 46개 작업·160개 QA와 출시 게이트는 미완료이며 A02는 `in_progress`다.
- **완료 작업:** AP 직접 문의와 AI 상담 후 사람 접수의 고객 메시지에 비공개 사진을 첨부하고, 고객 확인키·AP 조직 사업자/편집자 권한으로 재열람한다. 이미지 실제 형식 검사/WebP·EXIF 제거, 8MiB·25M pixel·출력 4MiB/2000px·메시지당 5장, 저장 해시 검사를 적용했다. 같은 메시지/정규화 사진은 한 자산 ID로 복구한다. 본문 저장 후 사진 실패 시 본문과 선택 파일을 남기고 재시도한다. 고객·사업자 화면은 인증 fetch/Blob URL로 이미지를 표시한다. AI 질문 메시지는 첨부 대상에서 제외한다.
- **수정 파일:** `apps/agent-api/package.json`, `pnpm-lock.yaml`, `apps/agent-api/migrations/000017_inquiry_attachments.sql`, `apps/agent-api/src/{app,business,server,inquiries,inquiry-attachments,inquiry-media}.ts`, `apps/agent-api/test/{inquiry-attachments,customer-consultations}.db.test.ts`, `apps/agent-web/src/{agent-public,workspace,private-inquiry-photo,consult.css}`, `.env.example`, `.gitignore`, `tools/setup-mock-env.mjs`, `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일 및 재생성 마스터 Markdown/HTML. Field 코드/DB·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 결정:** 사진 메타데이터는 AP DB에서 문의/조직/고객 메시지를 참조하고 bytes는 AP 전용 mock 비공개 디렉터리 또는 AP S3 설정을 쓴다. 확인키 원문·사진 bytes·EXIF/원본 파일명은 DB/outbox/모델/매체에 넣지 않는다. 사람 제출 후 `blocked_integration` 전달 상태인 고객 메시지만 첨부 가능하므로 익명 AI 질문에 사진을 붙이지 않는다. 인증 GET은 `private, no-store`·`nosniff`와 SHA-256 검사를 한다. 파일/DB 사이 crash orphan 정리와 보존 삭제는 별도 운영 작업이다.
- **실제 검사/환경:** 로컬 AP PostgreSQL 17.11, `AP_PROFILE=mock`, API 4311/웹 3001. 선행 raw 첨부 DB 테스트는 업로드 경로 404 red(exit 1), 수정 뒤 `pnpm test:spike:attachments:agent` 1/1 exit 0. `pnpm test:spike:consultations:agent` 1/1, `pnpm test:spike:inquiries:agent` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Chrome에서 직접 문의 본문/사진 첫 201 응답 분실→재시도 복구, 고객/사업자 사진 열람·후속 질문 사진, 320/390px 넘침 없음·page error 0건을 확인했다. AI→사람 인계의 사진은 합성 모델 DB 테스트에서 AI 질문 첨부 거부·제출 메시지 첨부 허용/모델 입력 분리를 확인했다. 합성 계정·조직·파일은 정리했다.
- **실패 접근:** 선행 404는 의도한 TDD red. 상담 테스트 확장 중 기존 사업자 모델 테스트 호출을 세지 않아 `seen.length` 1 기대가 2로 실패했고 실제 호출 수에 맞게 테스트를 수정한 뒤 재실행 통과했다. Chrome 첫 스크립트는 후속 질문 사업자 알림까지 한 건으로 잘못 기대해 수정 후 통과했다. 제품 버그에 맞춰 기대값을 완화한 것은 아니다.
- **미검수/남은 작업:** AP·Field 확인키 반복 추측/남용 방어, 새로고침 뒤 분실 응답 복구, AP 사진 실 S3/HEIC 서버 codec·파일 보존/복구, 실제 AI/알림 공급사, 정식 QA18/20/41/112·전체 DB/계약/독립/보안/e2e 게이트. AP 구독/공식 연결/매체와 Field 자체 도메인/구독/알림도 미완료. credential/계약 부재 경로는 `blocked_integration`이다.
- **다음 에이전트 정확한 명령:** 다음 Task의 변경 경로·요구/QA·검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 같은 AP DB migration을 실행하는 spike 명령은 순차 실행한다. API/웹은 로컬 실행 중일 수 있다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
pnpm test:spike:attachments:agent
pnpm test:spike:inquiries:agent
pnpm test:spike:consultations:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — F06 Field 사업자 내부 메모 (2026-09-24)

- **현재 목표:** v3.0·reference UI에 맞춰 AP/Field 독립 기능을 이어 구현해 사용할 수 있는 환경을 만든다. C03 시각 검토는 기능 작업의 대기 조건이 아니다. 46개 작업·160개 QA와 출시 게이트는 미완료이며 F06은 `in_progress`다.
- **완료 작업:** Field 사업자/편집자가 자기 조직 문의에 내부 메모를 남기고 조회한다. 고객 확인키 API/화면은 메모 원문·전달 상태를 받지 않는다. 메모는 고객 알림/outbox와 문의 상태를 바꾸지 않으며 응답 분실·동시 제출 때 같은 메시지 ID를 200으로 복구한다. 사업자 화면에서 고객 답변과 내부 메모의 입력·표시·재시도 안내를 분리했다.
- **수정 파일:** `apps/field-api/migrations/000015_inquiry_message_visibility.sql`, `apps/field-api/src/inquiries.ts`, `apps/field-api/test/business-core.db.test.ts`, `apps/field-web/src/{field-api,field-workspace}.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일 및 재생성 마스터 Markdown/HTML. AP 코드/DB·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 결정:** Field 메시지에 `visibility='customer'|'internal'`을 추가하고 기존 행은 `customer` 기본값으로 유지한다. DB는 내부 메모가 사업자 작성/`not_applicable` 전달 상태일 때만 허용한다. 고객 GET은 SQL에서 `visibility='customer'`만 조회한다. 메모는 문의 행 잠금 아래 저장하지만 상태/outbox를 변경하지 않는다. 메모의 재시도 해시는 작성자·본문·내부 공개 범위를 포함하고 기존 답변의 해시는 호환한다. AP 원본이나 사진 경로에는 손대지 않았다.
- **실제 검사/환경:** 로컬 Field PostgreSQL 17.11·Valkey 8.1.10, `FIELD_PROFILE=mock`, API 4321/웹 3002. 선행 `pnpm test:spike:business:field`는 메모 경로 404 red(exit 1) 후 최종 2/2 exit 0. `pnpm test:spike:attachments:field` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome에서 메모 첫 201 응답 분실→재시도 200, 사업자 표시·고객 API/화면 비노출·문의 상태 불변, 320/390px 넘침 없음·page error 0건 확인. 합성 계정·조직·사진 파일 정리.
- **실패 접근:** 메모 API 404는 의도한 TDD red다. 브라우저 첫 실행은 통과했다. 이전 사진 단계의 파일 입력 386px 넘침 수정은 직전 인수인계에 남겼다.
- **미검수/남은 작업:** Field 확인키 반복 추측/남용 제한, 페이지 새로고침 뒤 분실 응답 복구, 실제 알림·사진 보존/복구·실 S3/HEIC·정식 QA. AP 고객 사진·구독/공식 연결/매체와 Field 자체 도메인/구독도 미완료다. 정식 DB/계약/독립/보안/e2e 게이트와 운영 공급사 검수는 미실행이며 credential/계약 부재 경로는 `blocked_integration`이다.
- **다음 에이전트 정확한 명령:** 다음 Task의 경로·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 같은 Field DB migration을 실행하는 spike 명령은 순차 실행한다. 로컬 API/웹은 실행 중일 수 있다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:business:field
pnpm test:spike:attachments:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — F05/F06 Field 비공개 문의 사진 (2026-09-24)

- **현재 목표:** v3.0·reference UI 기준으로 AP/Field 독립 기능을 이어 구현해 사용할 수 있는 환경을 만든다. 사용자 지시에 따라 모델 가격 조회는 이 개발 작업에서 제외한다. C03 화면 시각 검토는 기능 작업의 대기 조건이 아니다. 46개 작업·160개 QA와 출시 게이트는 미완료이며 F05/F06은 `in_progress`다.
- **완료 작업:** Field 고객이 첫 직접 문의와 후속 질문에 사진을 첨부하고 확인키로 재열람한다. 사업자/편집자는 자기 조직 문의 사진을 읽는다. 실제 이미지로 형식을 확인하고 WebP 변환·EXIF 제거·용량/치수/5장 제한을 적용했다. 사이트 공개 사진과 저장소/경로를 분리했다. 본문 저장 후 사진 실패는 본문을 남기고 같은 파일 재첨부로 복구한다. 같은 메시지의 동일 정규화 사진은 한 자산 ID를 200으로 반환한다. 고객/사업자 웹에서 비공개 이미지와 모바일 입력을 확인했다.
- **수정 파일:** `apps/field-api/migrations/{000013_inquiry_attachments,000014_inquiry_attachment_dedupe}.sql`, `apps/field-api/src/{app,business,server,inquiries,inquiry-attachments,inquiry-media}.ts`, `apps/field-api/test/inquiry-attachments.db.test.ts`, `apps/field-web/src/{field-api,field-public,field-workspace,private-inquiry-photo,site.css}`, `.env.example`, `.gitignore`, `tools/setup-mock-env.mjs`, `package.json`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일 및 재생성 마스터 Markdown/HTML. AP 코드/DB·제품 간 계약은 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 결정:** 사진 메타데이터는 Field DB에서 문의/고객 메시지/조직을 참조하고 bytes는 Field 문의 전용 비공개 mock 디렉터리 또는 별도 S3 설정에 둔다. 원본 파일명/EXIF는 보관하지 않는다. 확인키 원문은 DB에 넣지 않고 해시로 조회하며, 사업자는 Field membership으로 접근한다. 이미지 GET은 `private, no-store`·`nosniff`와 저장 SHA-256 검사를 쓴다. 공개 사이트 자산 경로는 이 객체를 제공하지 않는다. 사진 첨부와 본문 저장은 별도 작업이므로 첨부 실패를 본문 실패로 표시하지 않는다. 사진 파일/DB 간 crash orphan 정리와 보존 기간 삭제는 별도 운영 작업이다.
- **실제 검사/환경:** 로컬 Field PostgreSQL 17.11·Valkey 8.1.10, `FIELD_PROFILE=mock`, API 4321/웹 3002. 선행 `pnpm test:spike:attachments:field`는 경로 404 red와 중복 재첨부 201 red(exit 1)를 거쳐 최종 1/1 exit 0. `pnpm test:spike:business:field` 2/2, `pnpm test:spike:sites:field` 2/2, `pnpm test:spike:bookings:field` 2/2, `pnpm test:spike:media:field` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome에서 본문 첫 201 응답 분실→200, 사진 첫 201 응답 분실→200 동일 ID, 고객·사업자 사진 열람, 후속 질문 사진/답변, 320/390px 넘침 없음·page error 0건을 확인했다. 합성 계정·조직·파일은 정리했다.
- **실패 접근:** 선행 API 404·중복 201은 의도한 TDD red다. 브라우저 첫 320px 검수는 사진 파일 입력의 기본 너비 때문에 전체 386px 넘침으로 실패했다. DOM에서 입력 오른쪽 386px을 확인하고 label/입력의 폭을 제한해 같은 흐름을 재실행해 통과했다. 사업자 사진 로딩 비동기는 브라우저 검사에서 표시 완료를 기다리도록 고쳤다.
- **미검수/남은 작업:** F05/F06 내부 메모·확인키 반복 추측/남용 제한·새로고침 후 분실 응답 복구. 문의 사진의 실 S3/HEIC codec·파일/DB crash orphan·90일 보존 삭제/복구, Field F08 실알림, 정식 QA18/20/41/112/143와 전체 정식 DB/계약/독립/보안/e2e 게이트는 미완료다. AP 고객 사진, 구독/공식 연결/매체, Field 자체 도메인/구독 및 출시 게이트도 남는다. 외부 credential/계약 부재 경로는 `blocked_integration`이다.
- **다음 에이전트 정확한 명령:** 다음 Task의 경로·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 같은 Field DB migration을 실행하는 spike 명령은 순차 실행한다. API/웹은 로컬 실행 중일 수 있다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
pnpm test:spike:attachments:field
pnpm test:spike:business:field
pnpm test:spike:bookings:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 이전 인수인계 — F05/F06 Field 후속 질문·답변 재시도 복구 (2026-09-24)

- **현재 목표:** v3.0과 reference UI에 맞춰 AP/Field 기능을 계속 구현해 사용할 수 있는 환경을 만든다. C03 화면 검토는 기능 작업의 대기 조건이 아니다. 전체 46개 작업·160개 QA와 출시 게이트는 미완료이며 F05/F06은 `in_progress`다.
- **완료 작업:** Field 직접 접수에 이어 고객 추가 질문·사업자 답변도 응답 분실/병렬 제출 뒤 같은 메시지 ID를 200으로 복구한다. 같은 키의 다른 본문/작성자는 409, 다른 확인키/조직 세션은 권한 단계에서 거부한다. 같은 사건의 메시지·상태·outbox는 한 번만 기록한다. 웹은 같은 입력 재시도 키를 메모리에 보존하고 복구 문구를 보여준다.
- **수정 파일:** `apps/field-api/migrations/000012_message_submission_keys.sql`, `apps/field-api/src/inquiries.ts`, `apps/field-api/test/business-core.db.test.ts`, `apps/field-web/src/{field-public,field-workspace}.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일과 재생성 마스터 Markdown/HTML. AP 코드/DB·제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 결정:** `field.inquiry_messages`에 nullable 키/요청 해시와 `(inquiry_id, submission_key_hash)` 유일 제약을 둔다. 기존 무헤더 API는 유지한다. 문의 행을 잠근 뒤 확인키/조직 권한과 키를 검사하고 새 메시지·상태·outbox를 한 Field DB 트랜잭션에 기록한다. 키/확인키 원문은 DB·URL·outbox에 넣지 않는다. 외부 발송은 기존 `pending`이며 성공 처리하지 않는다.
- **실제 검사/환경:** 로컬 Field PostgreSQL 17.11·Valkey 8.1.10, `FIELD_PROFILE=mock`, API 4321/웹 3002. 선행 `pnpm test:spike:business:field`에서 고객 질문 동시 제출이 201 두 건인 red(exit 1) 후 2/2 exit 0. `pnpm test:spike:bookings:field` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(Field 웹 9/9·AP 웹 8/8), `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome에서 Field 직접 접수·고객 질문·사업자 답변 각각 첫 201 응답을 브라우저에만 실패시킨 뒤 재시도 200/총 메시지 3건, 고객 320px·사업자 390px 넘침/page error 0건을 확인했다. 검수 계정/조직을 정리했다. 마지막 AP/Field API readiness와 두 웹 루트는 각각 HTTP 200이었다. `/tmp/fieldai-report-venv/bin/python tools/build_report.py`·`tools/check_package.py` exit 0; 후자는 `document_package_only`이고 서비스 QA가 아니다.
- **실패 접근:** 선행 병렬 고객 질문 DB red는 의도한 TDD 실패다. 이번 메시지 단계의 브라우저 첫 실행은 통과했다. 이전 F05 직접 접수 브라우저 선택자 모호성은 직전 인수인계에 기록되어 있다.
- **미검수/남은 작업:** Field 고객 사진·사업자 내부 메모, 새로고침 뒤 분실 응답 복구, 확인키 반복 추측/남용 제한, 실제 알림 공급사/결과 미상·복구와 정식 QA. AP 구독/공식 연결/매체, Field 자체 도메인/구독 및 전체 출시 게이트도 미완료다. 외부 credential/계약 부재 부분을 성공으로 처리하지 않는다.
- **다음 에이전트 정확한 명령:** 다음 Task 범위·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. 동일 Field DB migration을 실행하는 spike 명령은 순차 실행한다. API/웹은 로컬에서 실행 중일 수 있다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:business:field
pnpm test:spike:bookings:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F05 Field 단독 직접 문의 재시도 복구 (2026-09-24)

- **현재 목표:** v3.0과 reference UI에 맞춰 두 독립 제품의 기능을 이어 구현해 사용할 수 있는 환경을 만든다. 화면 디자인 검토는 기능 작업의 대기 조건이 아니다. 46개 작업·160개 QA 및 출시 게이트는 미완료이며 F05/F06은 `in_progress`다.
- **완료 작업:** Field 비회원 직접 문의에 조직별 재시도 키·요청 해시·별도 확인키를 적용했다. 응답이 사라져도 같은 입력으로 다시 제출하면 원래 문의 ID·확인키를 200으로 복구하고 다른 본문/확인키는 409로 거부한다. 병렬 제출은 문의/첫 메시지/outbox를 한 건씩만 남긴다. 키 없는 기존 API도 유지한다. Field 고객 화면은 두 256-bit 키를 제출 시도 동안 재사용하고 복구 상태를 표시한다. 긴 확인키의 320px 줄바꿈을 보강했다.
- **수정 파일:** `apps/field-api/migrations/000011_inquiry_submission_keys.sql`, `apps/field-api/src/inquiries.ts`, `apps/field-api/test/business-core.db.test.ts`, `apps/field-web/src/{field-public.tsx,site.css}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일과 재생성 마스터 Markdown/HTML. AP 코드/DB·제품 간 계약은 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 결정:** Field 문의 원장에 `(organization_id, submission_key_hash)` 유일 제약과 nullable 요청 해시를 둔다. 키·확인키 원문은 DB·outbox·URL에 저장하지 않고 해시만 저장한다. 최신 카탈로그 검사 전에 같은 제출 복구를 확인한다. 문의·원문·outbox는 Field DB 한 트랜잭션에 기록한다. 실제 Field 외부 알림은 기존처럼 `pending`이며 발송 성공을 모의하지 않는다.
- **실제 검사/환경:** 로컬 Field PostgreSQL 17.11·Valkey 8.1.10, `FIELD_PROFILE=mock`, API 4321/웹 3002. 선행 `pnpm test:spike:business:field`는 동시 제출 201 두 건인 red(exit 1) 후 2/2 exit 0. `pnpm test:spike:bookings:field` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(Field 웹 9/9·AP 웹 8/8), `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome 320px에서 첫 201 응답을 브라우저에만 실패시킨 뒤 재시도 200·동일 문의/확인키·원문 한 건, 가로 넘침/page error 0건을 확인했다. 검수 계정/조직을 정리하고 최신 Field mock API/웹을 기동했다.
- **실패 접근:** 브라우저 검수 첫 시도는 같은 공개 페이지의 문의·예약 양식 모두에 `이름` 입력이 있어 Playwright 선택자가 모호해 실패했다. 문의 form 범위를 지정한 뒤 재실행 통과했다. 선행 동시 제출 DB red는 의도한 TDD 실패다.
- **미검수/남은 작업:** Field 고객 후속 질문/사업자 답변의 재시도 멱등, 새로고침 뒤 응답 분실 복구, 사진 첨부·내부 메모, 확인키 반복 추측/남용 제한, 실제 알림 공급사/콜백·복구와 정식 QA. AP 구독/공식 연결/매체, Field 자체 도메인/구독 및 전체 출시 게이트도 미완료다. 실공급사 계약/credential 부재를 성공으로 처리하지 않는다.
- **다음 에이전트 정확한 명령:** 아래 DB 명령은 순차 실행한다. 다음 작업 시작 전에 경로·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 기록한다. API/웹은 로컬 실행 중일 수 있다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:business:field
pnpm test:spike:bookings:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A02/A03 AP 후속 질문·답변 재시도 복구 (2026-09-24)

- **현재 목표:** v3.0과 reference UI에 맞춰 AP/Field 기능을 이어 구현해 사용할 수 있는 환경을 만든다. C03 화면 디자인 확인은 기능 작업의 대기 조건이 아니다. 전체 46개 작업·160개 QA 및 출시 게이트는 미완료이며 A02/A03은 `in_progress`다.
- **완료 작업:** AP 고객 추가 질문과 사업자 답변/내부 메모가 응답 분실이나 병렬 제출 뒤에도 같은 원본 메시지 ID를 200으로 복구한다. 다른 본문/종류/작성자의 같은 키는 409로 막는다. 확인키/사업자 조직 권한 검사 뒤에만 재시도 조회한다. 하나의 고객 질문·사업자 답변은 각각 outbox/알림 원장 한 건이고 내부 메모에는 알림이 없다. 고객/사업자 웹은 같은 입력 시 무작위 제출 키를 재사용하며 복구 상태를 안내한다.
- **수정 파일:** `apps/agent-api/migrations/000016_message_submission_keys.sql`, `apps/agent-api/src/{inquiries,submission-attempt}.ts`, `apps/agent-api/test/inquiries.db.test.ts`, `apps/agent-web/src/{agent-public,workspace}.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일과 재생성 마스터 Markdown/HTML. Field 내부 코드/DB/큐와 제품 간 계약은 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 결정:** `ap.inquiry_messages`에 nullable 키/요청 해시 쌍과 `(inquiry_id, submission_key_hash)` 유일 제약을 둔다. 기존 헤더 없는 API는 계속 동작한다. 문의 행 잠금 아래 권한을 확인하고 기존 메시지를 읽은 다음, 없으면 메시지·상태·outbox·알림을 같은 트랜잭션에 쓴다. 원문·확인키·재시도 키는 outbox/URL에 넣지 않는다. 외부 고객 발송은 계속 `blocked_integration`이다.
- **실제 검사/환경:** 로컬 AP PostgreSQL 17.11, `AP_PROFILE=mock`, API 4311/웹 3001. 새 DB 테스트 선행 red는 고객 질문 동시 제출이 201 두 건인 실패(exit 1)였고 이후 `pnpm test:spike:inquiries:agent` 1/1 exit 0. `pnpm test:spike:consultations:agent` 1/1, `pnpm test:spike:deployments:agent` 1/1, `pnpm test:spike:agents:agent` 2/2, `pnpm test:spike:business:agent` 2/2 exit 0. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(AP 웹 8/8·Field 웹 9/9), `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome에서 고객 질문과 사업자 답변의 첫 201 응답을 브라우저에만 실패시켜 재시도 200/총 3개 원문/고객 질문 사업자 알림 1건을 확인했다. 고객 320px·사업자 390px 가로 넘침 없음, page error 0건. 합성 계정/조직은 정리했고 일반 mock API/웹을 다시 기동했다.
- **실패 접근:** `python` 명령과 기본 `python3`에는 Playwright가 없어서 `/tmp/fieldai-ui-venv/bin/python`을 사용했다. 첫 브라우저 시도는 AP 서버를 `AP_PROFILE=mock` 없이 기동해 Better Auth origin 403이었으며, mock 프로필로 재시작 후 성공했다. 선행 중복 저장 red는 의도된 TDD 결과다.
- **미검수/남은 작업:** 새로고침 뒤 응답 분실 제출키 복구, 고객 사진 첨부, 확인키 반복 추측/남용 제한, 보존/복구, 실제 공급사 AI·알림, AP 구독·공식 연결·매체 및 Field 남은 기능. 정식 `pnpm test:db:*`/contracts/independence/faults/e2e/security와 출시 게이트는 stub/미실행으로 통과 처리하지 않는다. 공급사 credential/계약이 없는 기능은 `blocked_integration`이다.
- **다음 에이전트 정확한 명령:** 먼저 아래 검사를 실행하고 다음 범위·요구/QA·검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 기록한다. DB migration을 실행하는 spike 명령은 순차 실행한다. API/웹은 로컬 실행 중일 수 있다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:inquiries:agent
pnpm test:spike:consultations:agent
pnpm test:spike:deployments:agent
pnpm test:spike:agents:agent
pnpm test:spike:business:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A02 AP 직접·AI 인계 접수 재시도 복구 (2026-09-24)

- **현재 목표:** v3.0과 reference UI에 맞춰 AP/Field 기능을 이어 구현해 사용할 수 있는 환경을 구축한다. C03 화면 검토는 기능 작업의 대기 조건이 아니다. 전체 46개 작업·160개 QA와 출시 게이트는 미완료이며 A02/A03·A06은 `in_progress`다.
- **완료 작업:** AP 비회원 직접 문의와 AI 대화 후 사람 접수에 조직별 재시도 키·요청 해시·별도 확인키를 적용했다. 응답이 사라져도 같은 시도는 동일 문의 ID·확인키를 200으로 돌려주고, 다른 본문/확인키는 409로 막는다. 병렬 제출도 한 문의와 한 outbox/사업자 알림 사건만 남긴다. 기존 키 없는 API 클라이언트 경로는 유지한다. 웹은 한 제출 시도의 두 256-bit 키를 메모리에 재사용하며 응답 분실 후 다시 제출할 수 있다. 320px 확인키 줄바꿈도 보정했다.
- **수정 파일:** `apps/agent-api/migrations/000015_inquiry_submission_keys.sql`, `apps/agent-api/src/{submission-attempt,inquiries,customer-consultations}.ts`, `apps/agent-api/test/{inquiries,customer-consultations}.db.test.ts`, `apps/agent-web/src/{agent-public.tsx,consult.css}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일 및 재생성 마스터 Markdown/HTML. Field 내부 코드/DB·제품 간 계약은 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 결정:** 키와 확인키는 43자 base64url 무작위 값으로 받고 해시만 AP DB에 저장한다. `(organization_id, submission_key_hash)` 유일 제약과 요청 해시가 동시 요청/다른 내용의 재사용을 구분한다. 재시도 성공은 최신 지식 release가 바뀌거나 AI 상담 쿠키가 접수 뒤 없어져도 이미 기록된 같은 원본을 먼저 반환한다. 확인키·재시도 키를 URL/outbox에 넣지 않는다. 실알림 공급사 상태는 `blocked_integration` 그대로다.
- **실제 검사/환경:** 로컬 AP PostgreSQL 17.11, `AP_PROFILE=mock`, AP API 4311/웹 3001. 새 DB 테스트는 중복 문의 두 건을 만드는 red를 확인한 뒤 `pnpm test:spike:inquiries:agent` 1/1, `pnpm test:spike:consultations:agent` 1/1, `pnpm test:spike:deployments:agent` 1/1, `pnpm test:spike:agents:agent` 2/2, `pnpm test:spike:business:agent` 2/2 exit 0. 최종 소스에서 `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(AP 웹 8/8·Field 웹 9/9 포함), `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome에서 직접 문의와 합성 AI→사람 접수 각각 첫 201 응답을 받은 뒤 네트워크만 실패시켜 재시도 200/동일 ID·확인키/사업자 알림 한 건을 확인했다. 마지막 320px 반복 검사에서 가로 넘침과 page error는 0건이었다. 합성 provider·계정·조직은 정리하고 일반 API를 복구했다.
- **실패 접근:** 선행 테스트에서 같은 키 병렬 제출이 두 건 201로 기록되는 red를 확인했다. 테스트 SQL의 UUID/text 비교 오류는 `$1::text`로 바로잡았다. 첫 브라우저 검사에서 긴 확인키가 너비 342px까지 넘쳐 CSS 줄바꿈을 넣고 세 번 재검수했다.
- **미검수/남은 작업:** 고객/사업자 후속 메시지의 재시도 멱등, 페이지 새로고침 후 분실 응답 복구, 사진 첨부, 확인키 반복 추측/남용 제한, 보존/복구, 실제 공급사 알림/AI, 정식 QA/독립/보안/출시 게이트. `pnpm test:db:*` 등 정식 명령은 아직 stub이므로 통과로 보고하지 않는다. 외부 공급사 credential/계약 부재 부분은 `blocked_integration`이다.
- **다음 에이전트 정확한 명령:** 먼저 아래 검사를 순차 수행한다. DB migration을 실행하는 spike 명령은 서로 병렬로 돌리지 않는다. 다음 작업의 경로·요구/QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:inquiries:agent
pnpm test:spike:consultations:agent
pnpm test:spike:deployments:agent
pnpm test:spike:agents:agent
pnpm test:spike:business:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A06 AP 내부 처리 알림·외부 전달 미연결 (2026-09-24)

- **현재 목표:** v3.0과 reference UI에 맞춰 기능을 끝까지 구현해 사용할 수 있는 환경을 구축한다. 화면 디자인 검토는 기능 구현의 대기 조건이 아니다. 전체 46개 작업·160개 QA/출시 게이트는 미완료이고 A06은 `in_progress`다.
- **완료 작업:** AP 직접 문의/AI→사람 접수/고객 추가 질문을 AP outbox와 알림 사건에 한 DB 트랜잭션으로 기록했다. 사업자/편집자는 자기 조직의 새 문의·추가 질문을 관리 화면에서 열고 사용자별 읽음을 남긴다. AI 질문과 내부 메모에는 알림 사건을 만들지 않는다. 사업자 답변은 AP 원본에 저장되어 고객 확인키로 읽을 수 있고, 공급사 없는 카카오/문자는 `blocked_integration`으로 응답·메시지에 표시한다. 기존 outbox 문의 사건 3건을 원문 복제 없이 멱등 보충해 누락 0건을 확인했다.
- **수정 파일:** `apps/agent-api/migrations/{000013_notification_events,000014_notification_backfill}.sql`, `apps/agent-api/src/{inquiries,customer-consultations}.ts`, `apps/agent-api/test/{inquiries,customer-consultations}.db.test.ts`, `apps/agent-web/src/{workspace,agent-public}.tsx`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일과 재생성 마스터 Markdown/HTML. Field 내부 코드/DB/큐는 변경하지 않았다. Git 저장소/커밋 없음.
- **핵심 결정:** AP notification_event는 outbox ID가 유일한 단일 사건 원장이고 source message ID만 보유한다. owner/editor 내부 알림은 조직 membership으로 조회하고 read 원장은 사용자별이다. 고객 외부 알림 원장은 공급사 미연결 상태로만 생성하며 가짜 발송/대체 성공을 만들지 않는다. 기존 outbox의 메시지 ID를 추측하지 않고 null로 보충한다. 일반 문의·알림 원장 삽입은 같은 DB commit이므로 실패 시 모두 rollback된다.
- **실제 검사/환경:** 로컬 AP PostgreSQL 17.11, `AP_PROFILE=mock`, 일반 API 4311/웹 3001. 새 내부 알림 API는 선행 404 red(exit 1), 구현 뒤 `pnpm test:spike:inquiries:agent` 1/1, `pnpm test:spike:consultations:agent` 1/1, `pnpm test:spike:deployments:agent` 1/1, `pnpm test:spike:agents:agent` 2/2, `pnpm test:spike:business:agent` 2/2 exit 0. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(AP 웹 8/8·Field 웹 9/9 포함), `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome 320px에서 비회원 접수→사업자 알림 1건/읽음→사업자 답변→고객 확인키 열람/외부 알림 미연결, 가로 넘침 없음·page error 0건을 확인하고 합성 계정/조직을 정리했다. 일반 AP API readiness 200/웹 200. `/tmp/fieldai-report-venv/bin/python tools/build_report.py`와 `tools/check_package.py` exit 0; 후자는 `document_package_only`이며 서비스 검수가 아니다.
- **실패 접근:** 신규 알림 API 404 red를 확인했다. 이전 outbox 3건에 원장이 없는 상태를 조회로 확인한 후 별도 보충 migration을 적용했다. 기존 사업자 답변의 `pending`은 실제 발송 증거가 아니어서 새 메시지는 `blocked_integration`으로 표시한다. 기존 메시지의 과거 전달 상태는 추측해 수정하지 않았다.
- **미검수/남은 작업:** 실제 AP 카카오/문자/웹 푸시 공급사·발신자/템플릿 승인, 콜백 서명/역순/중복·unknown 결과 조회와 한 주체 대체발송, 발송 사용량·한도/남용·워커/큐 재시작·백업 복구. 고객 사진/접수 중복 방지, AP 구독·관리자/공식 연결·매체, Field 남은 기능과 전체 정식 QA/게이트. 외부 credential/계약이 없으므로 A06 출시 증빙은 `blocked_integration`이다.
- **다음 에이전트 정확한 명령:** 먼저 아래 명령으로 현재 상태를 확인한다. AP API 4311/웹 3001, Field API 4321/웹 3002가 로컬 실행 중일 수 있다. 다음 범위·QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 적고, 공급사 없이 발송 성공을 모의하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:inquiries:agent
pnpm test:spike:consultations:agent
pnpm test:spike:deployments:agent
pnpm test:spike:agents:agent
pnpm test:spike:business:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A05 소유 사이트 위젯 AI·동일 대화 전환 (2026-09-24)

- **현재 목표:** v3.0 개발 문서와 reference UI대로 AP/Field 기능을 이어 구현해 사용할 수 있는 로컬 환경을 만든다. A05는 `in_progress`이며 46개 작업·160개 QA/출시 게이트는 미완료다.
- **완료 작업:** 승인된 `owned_embed` iframe이 제3자 쿠키 없이 짧은 bearer 세션으로 AP AI 대화를 시작하고 질문·검증된 AI 답변을 AP 원본 `inquiries`/`inquiry_messages`에 기록한다. 일회용 ticket을 AP 1차 도메인에서 교환하면 같은 conversation ID에 새 HttpOnly 상담 쿠키를 붙이고 embed bearer의 접근을 끊는다. 사람 문의는 동일 ID에 동의 후 접수하고, AI 공급사 미설정 시 직접 사람 문의 전환을 유지한다. 링크와 위젯은 동일 AI 검증/한도/최신 승인/인계 경합 엔진을 사용한다. 일반 SDK는 `data-deployment`와 `data-mode=inline|floating`을 지원하며 관리 화면에 두 설치 코드를 표시한다.
- **수정 파일:** `apps/agent-api/migrations/000012_embed_consultations.sql`, `apps/agent-api/src/{customer-consultations,deployments}.ts`, `apps/agent-api/test/deployments.db.test.ts`, `apps/agent-web/src/{agent-deploy.tsx,consult.css}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일 및 재생성 마스터 Markdown/HTML. Field 코드/DB·공개 제품 간 계약 변경 없음. Git 저장소/커밋 없음.
- **핵심 결정:** embed 세션 하나에 AP 대화 하나를 결합한다. iframe은 bearer를 메모리에만 보유하고 연락처를 받지 않는다. 전환 완료 시 DB의 `transferred_at`으로 bearer를 무효화하고 새 AP 1차 상담 쿠키의 해시만 원본 대화에 기록한다. ticket 재사용/다중 전환은 거부한다. 공급사 합성 답변은 테스트 전용 서버에만 있다.
- **실제 검사/환경:** 로컬 AP PostgreSQL 17.11, `AP_PROFILE=mock`. `pnpm test:spike:deployments:agent`는 신규 embed engagement 404 red와 일반 SDK 404 red(exit 1) 후 1/1 green, `pnpm test:spike:consultations:agent` 1/1, `pnpm test:spike:inquiries:agent` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome에서는 검수 전용 합성 provider와 `https://owned.example.test`/`https://ap.example.test` 분리 origin을 로컬 라우트로 구성해 실제 SDK iframe→AI 질문/답변→팝업 ticket→같은 대화 ID 사람 접수·원문 sequence, floating 열기/닫기·재열기를 확인했다. 320px 가로 넘침 없음, page error 0건. 일반 서버/웹 복구 후 320px 관리 화면의 두 설치 코드도 확인했다. 합성 소유 증명은 DB에서 테스트용으로만 표시했고 검수 계정/조직/DB를 정리했다. 일반 AP API 4311 readiness 200. `/tmp/fieldai-report-venv/bin/python tools/build_report.py`와 `tools/check_package.py` exit 0; 후자는 `document_package_only`다.
- **실패 접근:** 새 API가 없는 초기 DB 테스트 404와 일반 SDK가 없는 초기 DB 테스트 404를 확인했다. 둘 다 구현 후 통과했다.
- **미검수/남은 작업:** 실제 소유 도메인 DNS/TLS 설치, 다중 ancestor·제3자 쿠키 강제 차단 브라우저/접근성, 실모델·연속 대화 문맥·예산·남용 방지·중복 요청 복구·30일 보존/삭제, AP 실알림/구독·관리자/공식 연동·매체, Field 남은 기능 및 전체 정식 QA/출시 게이트. 현재 A05를 완료로 표시하지 않는다.
- **다음 에이전트 정확한 명령:** 먼저 아래 검사를 순차 수행하고 현재 소스/프로세스/문서를 확인한다. AP API 4311/웹 3001, Field API 4321/웹 3002는 로컬 실행 중일 수 있다. 다음 Task의 파일 범위·QA·검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 적고, 공급사 없는 `blocked_integration`을 유지한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:deployments:agent
pnpm test:spike:consultations:agent
pnpm test:spike:inquiries:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — A04/A05 AP 고객 AI 상담과 동일 원본 사람 접수 (2026-09-24)

- **현재 목표:** 사용자 지시대로 v3.0과 reference UI에 맞춰 기능을 끝까지 구현해 사용할 수 있는 환경을 만든다. C03 시각 검토는 기능 작업의 대기 조건이 아니며, 전체 46개 작업·160개 QA/출시 게이트는 미완료다. A02~A05는 `in_progress`다.
- **완료 작업:** AP 활성 link 배포에서 고객이 짧은 HttpOnly 상담 세션을 시작하고 승인 지식으로 AI 질문을 할 수 있는 API/화면을 연결했다. 고객 질문·검증한 AI 답변·명시 동의 후 사람 접수·사업자 답변은 같은 `ap.inquiries.id`와 증가하는 `ap.inquiry_messages.sequence`에 남는다. 접수 전 익명 대화는 사업자 문의함에 보이지 않고 최종 접수 때만 outbox 사건을 만든다. 고객 세션은 접수 후 대화 읽기 권한이 아니며 별도 확인키가 필요하다. 모델 출력의 근거 ID·임의 숫자·사용량을 검사하고 공급사 부재/오류 중 직접 문의를 유지한다. 생성 중 사람 접수와 승인 출처 변경은 AI 답변 저장을 거부한다. 고객/사업자 AI 한도를 분리했다. 외부 iframe handoff는 `?handoff=1` 표시로 AP 1차 화면에서만 context를 조회하며 직링크의 불필요한 401 요청을 없앴다. 320px 상담 화면 체크박스·제출 버튼도 정리했다.
- **수정 파일:** `apps/agent-api/migrations/000011_customer_consultations.sql`, `apps/agent-api/src/{app,agents,business,customer-consultations,deployments,inquiries}.ts`, `apps/agent-api/test/customer-consultations.db.test.ts`, `apps/agent-api/test/customer-consultation.browser-fixture.ts`, `apps/agent-api/test/deployments.db.test.ts`, `apps/agent-web/src/{agent-public,agent-deploy}.tsx`, `apps/agent-web/src/consult.css`, `apps/agent-web/src/app/layout.tsx`, `apps/agent-web/test/customer-consultation.test.tsx`, `package.json`, `.env.example`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, 이 파일 및 재생성 마스터 Markdown/HTML. Field 코드/DB와 제품 간 계약은 변경하지 않았다. Git 저장소/커밋은 없다.
- **핵심 결정:** 기존 AP 문의 원장을 접수 전 `ai_assisting` 상태로 확장해 원문 ID가 갈라지지 않게 했다. 익명 권한은 서버 DB의 세션 해시·만료와 AP 1차 도메인 쿠키에 묶고, 접수 후에는 확인키 권한으로 전환한다. 모델 호출 중 DB 트랜잭션을 잡지 않고 완료 시 revision·automation_paused·최신 배포/지식 release를 다시 검사한다. 일반 서버에서 고정 모델 답변을 넣지 않는다. 합성 provider는 `apps/agent-api/test/`의 브라우저 검수 전용이다.
- **실제 테스트/환경:** AP 로컬 PostgreSQL 17.11, `AP_PROFILE=mock`, 일반 API 4311/웹 3001, 별도 테스트에서만 합성 provider. 선행 고객 상담 API는 404 red, 익명 대화 사업자 노출 red, 잘못된 모델 사용량 500 red, 사업자 테스트 한도에 고객 사용량이 합산되는 429 red, handoff 표시 누락 red를 확인했다. 수정 후 순차 `pnpm test:spike:consultations:agent` 1/1, `pnpm test:spike:inquiries:agent` 1/1, `pnpm test:spike:agents:agent` 2/2, `pnpm test:spike:deployments:agent` 1/1, `pnpm test:spike:business:agent` 2/2 모두 exit 0. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(AP 웹 8/8 포함), `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. `pnpm test:spike:independence:agent`는 상대 제품 env 없는 AP API readiness만 확인해 exit 0이며 정식 독립 게이트가 아니다. Playwright Chrome에서 320px 가로 넘침 없이 모델 미설정 503→사람 접수, 검수 전용 합성 모델로 질문→AI 답변→같은 대화 ID 사람 접수/확인키 조회를 확인했다. 두 브라우저 경로의 page error 0건. 합성 API는 중지하고 일반 API를 재시작했으며 생성 계정/조직/DB 데이터는 정리했다. `/tmp/fieldai-report-venv/bin/python tools/build_report.py`와 `tools/check_package.py` exit 0; 후자는 `document_package_only`다.
- **실패 접근과 수정:** 브라우저 첫 검수는 `127.0.0.1:3001`과 허용 `localhost:3001`의 origin 차이로 403이었고 문서화한 localhost 주소로 다시 검사했다. 브라우저 선택자의 연락처/동의 라벨 중복을 `exact=True`로 좁혔다. 초기 320px 스크린샷은 체크박스가 크게 세로 배치돼 AP 전용 CSS로 수정 후 재검수했다. 등록하지 않은 공급사를 성공으로 취급하지 않았다.
- **미검수/남은 작업:** 실제 LLM 키/응답·품질/비용, 고객 연속 대화 문맥, 중복 요청/응답 분실 복구, 익명 세션 발급 남용 제한, 30일 보존·삭제, 고객 사진, 외부 iframe 내부 AI 세션과 제3자 쿠키 차단, 자체 도메인 실제 설치, AP 독립 알림/구독/관리자·공식 연동/매체/전체 보안/E2E/출시 게이트. UI의 API/모델 오류 경로는 검수했지만 G-A3/QA117은 통과가 아니다.
- **다음 에이전트 정확한 명령:** 먼저 현재 소스·프로세스·계약/TASKS를 다시 확인하고 다음 Task의 파일 범위·QA·검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 기록한다. AP DB migration을 포함한 spike 명령은 순차 실행한다. 현재 AP API 4311/웹 3001과 Field API 4321/웹 3002가 로컬 실행 중일 수 있으므로 포트·프로세스를 먼저 확인한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
docker compose --project-name fieldai-agent-mock --env-file infra/agent/.env -f infra/agent/compose.mock.yaml up -d --wait
pnpm test:spike:consultations:agent
pnpm test:spike:inquiries:agent
pnpm test:spike:agents:agent
pnpm test:spike:deployments:agent
pnpm test:spike:business:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F02/F03 사진 보존 AI 배치와 모바일 제작 단계 (2026-09-24)

- **현재 목표:** v3.0 개발 문서와 `reference/field_ui_prototype_v3.html`에 맞춰 화면 검토를 대기 조건으로 삼지 않고 기능을 끝까지 구현한다. 전체 46개 작업·160개 QA와 운영 출시는 미완료다. 이번 F02/F03은 `in_progress`다.
- **완료 작업:** Field 제작 AI의 합성 배치 제안에 기존 초안의 사진 자산 ID와 alt를 합쳤다. 같은 slug/섹션 종류의 위치에 유지하고, 위치가 없으면 기존 사진 섹션 또는 사진 페이지를 보존한다. 최대 5페이지·페이지당 20섹션 제한으로 모두 보존할 수 없으면 `media_layout_conflict`로 실패하고 초안·공개본을 바꾸지 않는다. 병합된 제안이 DB에 저장되므로 화면 미리보기와 적용 결과가 같다. 320px 제작 단계 버튼의 텍스트 줄바꿈을 없애고 단계 내 가로 스크롤을 허용했다.
- **수정 파일:** `apps/field-api/src/site-generation.ts`, `apps/field-api/test/site-generation.db.test.ts`, `apps/field-web/src/{site-editor.tsx,site.css}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 이 파일과 재생성한 마스터 Markdown/HTML. 이번 보강에 AP 경로·DB, 제품 간 계약·migration 변경은 없다. Git 저장소/커밋 없음.
- **핵심 결정:** 이미 사업자가 업로드한 사진을 AI 레이아웃 제안이 묵시적으로 삭제하지 않는다. 사진을 보존할 수 없으면 생성 작업만 실패 처리하며 초안 revision은 그대로다. 제안 결과를 생성 시점의 초안 revision에 묶고 적용 전 재검증한다. 모델 호출과 실제 비용은 합성 테스트로 대신 승인하지 않는다.
- **실제 명령/결과:** Field PostgreSQL 17.11/Valkey 8.1.10, `FIELD_PROFILE=mock`, 합성 모델 응답. 새 DB 테스트는 사진 자산 ID가 제안에서 `undefined`가 되는 red(exit 1)였다. 수정 뒤 `pnpm test:spike:generation:field` 3/3, `pnpm test:spike:sites:field` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm build:field`, `pnpm build:web:field` exit 0. 브라우저 Playwright Chrome에서 최신 Field API 4321/웹 3002를 재시작한 뒤 합성 계정의 업로드→alt→저장→새로고침→공개 사진 경로를 390/320px로 확인했다. 320px 전체 가로 넘침 없음, 공개 화면 콘솔 오류 0건, 검수 계정/DB 자산/파일 정리. `/tmp/fieldai-report-venv/bin/python tools/build_report.py`, `tools/check_package.py` exit 0; 후자는 `document_package_only`이고 서비스 QA가 아니다.
- **실패 접근:** 수정 전 제안이 사진 ID를 떨어뜨리는 red를 확인했다. 기존 모바일 버튼은 좁은 화면에서 글자가 세로로 접혔고 CSS를 수정해 브라우저로 재검수했다.
- **미검수/남은 작업:** 실 모델 응답과 AI 사진 배치 품질, 공급사 S3/HEIC·백업/복구·정식 QA54/55/63/64, 자체 도메인·접근성, AP 상담 AI/알림/청구, Field 실알림/청구, 공식 연동·매체·전체 게이트. 이번 사진 보존 테스트는 synthetic이며 출시 승인이 아니다.
- **다음 에이전트 정확한 명령:** 아래를 순차 실행한다. 같은 Field DB migration 포함 spike 명령을 병렬 실행하지 않는다. 다음 작업 전 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일 범위·QA·검사 명령을 적는다. 현재 Field API 4321/웹 3002는 로컬에서 실행 중이고 실제 키가 없어 Field AI worker는 실행하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
docker compose --project-name fieldai-field-mock --env-file infra/field/.env -f infra/field/compose.mock.yaml up -d --wait
pnpm test:spike:generation:field
pnpm test:spike:sites:field
pnpm test:spike:media:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F02/F04 Field 사이트 사진·alt·공개 자산 (2026-09-24)

- **현재 목표:** 사용자 지시대로 v3.0과 `reference/field_ui_prototype_v3.html`에 맞는 기능을 화면 검토 대기 없이 끝까지 구현해 사용할 수 있는 환경을 만든다. F02/F04는 여전히 `in_progress`이며 전체 46개 작업·160개 QA와 출시 게이트는 완료되지 않았다.
- **완료 작업:** Field 사업자/편집자가 사이트 섹션 사진을 업로드하고 서버 보관함에서 재선택하며 alt를 입력한 뒤 초안을 저장·공개할 수 있다. Field API는 업로드 입력을 8MiB/25M pixel로 제한하고 JPEG/PNG/WebP 또는 decoder가 지원하는 HEIF를 읽어 방향 보정·최대 2000px WebP·EXIF 제거를 수행한다. Field DB에 조직/상태/해시/크기/차원/object key를 기록한다. 초안 저장은 Field 소유 ready 자산과 alt를 검사한다. 공개 트랜잭션은 자산 참조를 릴리스와 묶고, 공개 API는 최신 공개본 자산만 제공한다. 초안에서 사진을 제거해도 기존 공개본 파일을 바로 삭제하지 않는다. 저장 객체의 SHA-256이 DB 기록과 다르면 503으로 막는다. 사진 없는 사이트 경로도 유지한다. 일반 Field readiness는 미디어 저장소가 없어도 동작한다.
- **수정 파일:** `apps/field-api/migrations/000010_site_assets.sql`, `apps/field-api/src/{app,business,server,sites,site-media}.ts`, `apps/field-api/test/{sites.db,site-media.store}.test.ts`, `apps/field-api/package.json`, `apps/field-web/src/{site-editor,field-site,site.css}`, `apps/field-web/test/site-image.test.tsx`, `tools/setup-mock-env.mjs`, `.env.example`, `.gitignore`, 루트 `package.json`/`pnpm-lock.yaml`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, `docs/technical/{PHASE_2_EXECUTION_PLAN,TECH_STACK}.md`, 이 파일과 재생성 마스터 Markdown/HTML. AP 코드/DB, 고객 문의 첨부, 제품 간 계약은 변경하지 않았다. Git 저장소/커밋은 없다.
- **핵심 결정:** Field 전용 media store 인터페이스를 둔다. `mock`은 `FIELD_MEDIA_DIRECTORY`의 전용 비공개 디렉터리에 원자 저장한다. `sandbox/live`는 Field 전용 S3 bucket/region/credential가 없으면 업로드 경로를 `blocked_integration`으로 표시한다. 파일은 DB bytea나 브라우저 localStorage 원장에 넣지 않는다. AP 파일/토큰은 사용하지 않는다. S3 실제 bucket/IAM/백업은 아직 검수하지 않았으며 코드 경로만 있다. `sharp` 0.35.4는 [공식 출력 문서](https://sharp.pixelplumbing.com/api-output/)의 기본 메타데이터 제거 동작과 [libheif 보안 패치 공지](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c)를 확인하고 pin했다. `@aws-sdk/client-s3` 3.1139.0을 pin했다. HEIC decoder 가용성은 서버별로 확인해야 한다.
- **실제 명령/결과:** 로컬 Field PostgreSQL 17.11·Valkey 8.1.10, `FIELD_PROFILE=mock`, `APP_PROFILE=design_preview`. 순차 `pnpm test:spike:sites:field` 2/2, `pnpm test:spike:media:field` 1/1, `pnpm test:spike:generation:field` 2/2, `pnpm test:spike:worker:field` 1/1(내부 `pnpm build:field` exit 0), `pnpm test:spike:business:field` 2/2, `pnpm test:spike:bookings:field` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(Field 웹 사진 렌더 테스트 포함), `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, `pnpm build:web:field` 모두 최종 exit 0. Field 웹 3002→API 4321 HTTP 사진 업로드 201→초안 200→공개 201→공개 WebP 조회 200. Playwright Chrome 390/320px에서 업로드→alt→초안 저장→새로고침·사진 유지→공개 이미지 표시, 320px 가로 넘침 없음, 공개 화면 콘솔 오류 0건. 검수 생성 계정·조직·DB 자산·파일은 정리했다. 최신 코드로 Field API/웹 재시작 후 브라우저 흐름 재실행 exit 0. `/tmp/fieldai-report-venv/bin/python tools/build_report.py`, `tools/check_package.py` exit 0; 후자는 `document_package_only` 46 작업·160 QA이며 서비스 게이트가 아니다.
- **실패 접근과 수정:** 첫 업로드/보관함 테스트는 각각 404 red였다. 저장 객체를 바꿔도 공개 API가 200으로 응답하는 테스트는 red였고 해시 검증 후 503이 됐다. 첫 브라우저 320px 검사에서 새 사진 선택 그리드가 420px까지 가로로 넘쳤고 최소 폭을 줄여 재검수했다. 브라우저 콘솔 초기 404는 사이트 공개 전에 편집 화면이 공개본을 조회한 예상 상태였고, 공개 후 오류는 0건이었다. 최종 lint 전 테스트의 미사용 조직 변수로 한 차례 exit 1이었으며 수정 후 lint/typecheck exit 0.
- **미검수/남은 작업:** 실 S3 공급사/Field 전용 bucket·IAM·암호화 키·장애·백업/복구, 실제 서버 HEIC codec, 이미지 악성 입력 확장 검수와 고객 비공개 첨부 정책, 오래된 공개본/미사용 사진 정리, 사업 정보 첫 단계의 사진 입력 및 AI 배치 변경 시 사진 보존, 자체 도메인 DNS/TLS, 접근성 전체와 정식 QA05/56/74/124. AP 고객 AI·알림·구독, Field 실알림·구독, 공식 연동·매체·R02도 남았다. `mock` 로컬 사진 성공을 G-F1 또는 출시 승인으로 표시하지 않는다.
- **다음 에이전트 정확한 명령:** 아래를 순서대로 실행한다. 동일 Field DB migration 포함 명령은 병렬로 실행하지 않는다. 다음 Task 범위/요구/QA/명령은 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다. Field API/웹은 현재 로컬에서 실행 중이며 worker는 실제 모델 자격증명이 없어 실행하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
docker compose --project-name fieldai-field-mock --env-file infra/field/.env -f infra/field/compose.mock.yaml up -d --wait
pnpm test:spike:sites:field
pnpm test:spike:media:field
pnpm test:spike:generation:field
pnpm test:spike:worker:field
pnpm test:spike:business:field
pnpm test:spike:bookings:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — F07 비회원 예약 재시도 멱등 (2026-09-24)

- **현재 목표:** 사용자가 요청한 대로 화면 시각 검토를 대기 조건으로 두지 않고 v3.0 기능을 끝까지 구현해 사용할 수 있는 환경을 만든다. 이번 F07 보강은 `in_progress`이며 전체 46개 작업·160개 QA와 출시 게이트는 미완료다. 모델 단가 비교는 사용자가 실수라고 명시했으므로 작업 범위가 아니다.
- **완료 작업:** 비회원 예약 브라우저가 한 제출 시도에 32바이트 무작위 `Idempotency-Key`와 확인키를 만들고, 응답 분실 뒤 같은 입력으로 재시도할 때 동일 키를 보낸다. Field DB는 조직별 제출 키 해시 유일 제약과 요청 해시를 저장한다. 동시 중복 요청/재시도는 예약·처리 이벤트·outbox를 한 건만 만들고 동일 예약과 확인키를 200으로 복구한다. 다른 본문/확인키에 같은 키를 쓰면 409 `idempotency_conflict`다. 승인 카탈로그가 이후 바뀌어도 기존 동일 제출은 복구된다. 키 없는 기존 API는 이전 동작을 유지한다. 확인키·재시도 키는 URL이나 outbox에 넣지 않는다.
- **수정 파일:** `apps/field-api/migrations/000009_reservation_submission_keys.sql`, `apps/field-api/src/bookings.ts`, `apps/field-api/test/bookings.db.test.ts`, `apps/field-web/src/{field-api.ts,field-booking.tsx}`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `README.md`, 이 파일, 재생성한 마스터 Markdown/HTML. AP 코드·DB/제품 간 계약은 변경하지 않았다. Git 저장소/커밋은 없다.
- **설계 결정:** 조직+키 해시를 PostgreSQL 유일 인덱스로 제한해 별도 Valkey/프로세스 락에 의존하지 않는다. client가 충분히 무작위인 확인키를 재전송하여 서버는 원문 secret을 DB에 보관하지 않고 해시만으로 동일 응답을 복구한다. 제출 본문은 정규화한 필드의 SHA-256 해시로 비교한다. 동일 시도 안에서만 키를 유지하는 웹 메모리 ref를 쓰므로 새로고침을 가로지른 복구는 아직 구현되지 않았다. 예약 정책·서비스가 바뀐 뒤에도 이미 접수된 같은 시도를 확인할 수 있게 기존 키 조회를 신규 검증보다 먼저 한다.
- **실제 명령/결과:** 로컬 `FIELD_PROFILE=mock`, Field PostgreSQL 17.11/Valkey 8.1.10. 선행 `pnpm test:spike:bookings:field`는 새 테스트가 동시 요청 201 두 건으로 red(exit 1)였고, 구현 뒤 재실행 2/2 exit 0. 테스트 범위는 동시 같은 키 1개 원장/이벤트/outbox, 잃은 응답 재시도, 새 카탈로그 공개 뒤 복구, 다른 본문·확인키 409, 약한 키 400이다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. DB 격리는 두 제품의 자기 DB 접속 성공/상대 자격증명 거부(28P01)였다. 로컬 Field API와 웹을 최신 코드로 재시작해 각각 `4321 /health/ready`와 `3002 /workspace` 200을 확인했다. 웹 3002→API 4321 실제 HTTP 프록시에서 합성 예약 201→동일 키 재시도 200, 동일 ID/확인키와 outbox 1건을 검증하고 이 검사의 합성 예약만 삭제했다. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py` exit 0 (`document_package_only`, 46 작업/160 QA; 서비스 QA 아님).
- **실패 접근/수정:** 새 테스트의 최초 201 두 건은 예상한 red였다. 첫 `pnpm typecheck`는 테스트에서 `Promise.all` 배열 요소가 undefined일 수 있다는 TypeScript 오류로 exit 2였고 명시 요소 확인 후 재실행 exit 0. 비밀키/알림 공급사는 사용하지 않았고 실제 고객 메시지는 발송하지 않았다.
- **미검수/남은 작업:** 브라우저 새로고침 뒤 재시도 키 보존, 일반 남용 rate limit/확인키 반복 추측 방어, DST 중복 시각·서비스 기본 예약 방식 상속, 실알림/보존/복구와 정식 QA25~34. F02 사진/alt, F04 자체 도메인, AP 고객 AI·알림·구독, Field F08/F09, 공식 연동·매체·R02와 전체 독립/보안/E2E 게이트도 남았다. 공급사 자격증명 없는 실제 모델·알림/결제는 `blocked_integration`이며 mock 검수를 출시 승인으로 취급하지 않는다.
- **다음 에이전트 정확한 명령:** 아래를 순서대로 실행하고 다음 Task의 경로/요구/QA/검사 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 적는다. 동일 Field DB migration을 포함한 spike 명령끼리는 병렬 실행하지 않는다. Field API/웹은 현재 로컬 프로세스에서 실행 중이며 worker는 모델 자격증명 부재로 실행하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
docker compose --project-name fieldai-field-mock --env-file infra/field/.env -f infra/field/compose.mock.yaml up -d --wait
pnpm test:spike:bookings:field
pnpm test:spike:business:field
pnpm test:spike:sites:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — C02/F03 Field Valkey 큐와 별도 worker (2026-09-24)

- **현재 목표:** 사용자 지시대로 C03 화면 검토를 기능 구현의 대기 조건으로 삼지 않고 v3.0 최종 서비스까지 진행한다. 이번 단계 C02/F03은 `in_progress`다. 전체 46개 작업·160개 QA와 출시 게이트는 여전히 완료되지 않았다.
- **완료 작업:** Field mock 전용 Valkey 8.1.10 인스턴스와 독립 비밀값/AOF를 추가했다. Field 제작 AI 작업은 Field PostgreSQL queued 원장을 commit한 뒤 `iovalkey` 0.4.0 큐에 UUID만 전달한다. Field API에서 모델 실행 polling을 제거하고 별도 `worker.ts` 프로세스가 큐 ID를 DB queued→running으로 원자 claim한다. enqueue 실패는 `queue_unavailable`+job ID로 알리고, worker가 queued DB 작업을 주기적으로 재조정해 다시 큐에 넣는다. 중복 ID·worker 재시작도 같은 작업에 모델 호출을 반복하지 않는다. 60초 이상 오래된 running은 결과 미상 실패로 보존하고 자동 재호출하지 않는다. 작업 기록 모델과 worker 모델이 다르면 `model_changed`로 실패시킨다. Field 웹은 공급사 미설정과 큐 장애를 구분한다. 일반 Field API readiness는 Valkey와 무관하다.
- **수정 파일:** `infra/field/compose.mock.yaml`, `tools/setup-mock-env.mjs`, `apps/field-api/src/{business,server,site-generation,site-queue,worker}.ts`, `apps/field-api/test/{site-generation.db,site-queue.integration,worker.integration}.test.ts`, `apps/field-api/test/worker-fetch.fixture.mjs`, `apps/field-api/package.json`, `apps/field-web/src/site-editor.tsx`, `.env.example`, `package.json`, `pnpm-lock.yaml`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/{PHASE_2_EXECUTION_PLAN,TECH_STACK}.md`, `docs/adr/0002-valkey-postgres-baseline.md`, 이 파일과 재생성 마스터 Markdown/HTML. AP 내부 코드·DB·계약은 변경하지 않았다. Git 저장소/커밋은 없다.
- **핵심 결정:** Field 큐는 AP와 별도 인스턴스로 시작한다. Valkey에는 ID만 저장하고 PG가 작업·사용량·승인 초안 원본이다. 큐의 동일 ID 삽입은 Valkey Lua `SET NX`+`LPUSH`로 원자 중복 제거하며, DB queued→running claim이 최종 모델 호출 멱등 경계다. 프로세스가 모델 호출 도중 죽으면 비용 결과를 알 수 없으므로 재시작 후 자동 호출하지 않고 사업자가 새 작업을 명시 요청한다. Field API는 큐가 없어도 일반 기능을 유지한다. 모델 키가 없으면 worker는 부팅 실패하고 AI 생성은 `blocked_integration`이다.
- **실제 명령/결과:** 로컬 PostgreSQL 17.11·Valkey 8.1.10, `FIELD_PROFILE=mock`, test 전용 합성 Responses fixture. `docker compose --project-name fieldai-field-mock --env-file infra/field/.env -f infra/field/compose.mock.yaml up -d --wait`로 DB·큐 healthy. 최종 순차 `pnpm test:spike:generation:field` 2/2, `pnpm test:spike:worker:field` 1/1, `pnpm test:spike:queue:field` 1/1, `pnpm test:spike:sites:field` 1/1, `pnpm test:spike:business:field` 2/2, `pnpm test:spike:bookings:field` 1/1 모두 exit 0. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`(worker 테스트 명령 내부), `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 별도 worker 프로세스 검수는 **AP 환경변수를 제거한 child**에서 대기→제안→적용과 오래된 running의 결과 미상 실패를 확인했다. 실제 Field 큐 컨테이너 중지 시 Field API `/health/ready`와 웹 `/workspace/site`는 200이었고 재시작 후 큐 healthy. 같은 큐 객체의 중지→enqueue 실패→재시작 후 enqueue 성공을 수동 검수했다. 공급사 키 없는 실제 worker 시작은 예상대로 exit 1이었다. 마스터 재생성 및 `tools/check_package.py` exit 0; 패키지 검사 scope는 `document_package_only`(46 작업·160 QA)다.
- **실패 접근과 수정:** 첫 mock Valkey healthcheck는 `VALKEYCLI_AUTH`를 읽지 않아 unhealthy였고 해당 이미지의 `REDISCLI_AUTH`로 수정했다. 첫 큐 클라이언트는 성공한 연결 Promise를 계속 보관해 서버 재시작 후 enqueue가 실패했다. 연결 완료 시 Promise를 비워 같은 객체의 복구 성공을 재검수했다. 선행 API 큐 미전달과 임의 작업 ID claim 테스트는 각각 예상대로 red였으며 구현 후 green이다. 모델 설정이 다른 worker가 기존 작업을 제안하던 버그도 red 후 `model_changed` 실패로 수정했다.
- **미검수/남은 작업:** 실 OpenAI 자격증명·응답·원가/가격 대조, 실제 서버 Valkey ACL/백업/장애·복구, AP 별도 큐와 상대 큐 자격증명 거부, 제품별 CI/정식 AP-only·Field-only/보안/E2E, Field F02 사진/alt·F04 자체 도메인, F07 보호·F08/09 알림·구독, AP 고객 AI·알림·구독, 공식 연동·매체·R02. 로컬 큐/worker 합성 검수를 G-F1 통과나 출시 승인으로 표시하지 않는다.
- **다음 에이전트 정확한 명령:** 아래를 순서대로 실행한다. 먼저 `TASKS.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`와 실제 파일/프로세스를 확인하고 다음 Task의 파일 범위·요구/QA·명령을 계획에 기록한다. 동일 DB migration이 포함된 spike 명령은 병렬 실행하지 않는다. 공급사 키가 없으면 실모델 검수는 `blocked_integration`을 유지한다. `README.md`의 네 일반 프로세스는 로컬에서 실행 중이며 Field worker는 키가 없어 실행하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
docker compose --project-name fieldai-field-mock --env-file infra/field/.env -f infra/field/compose.mock.yaml up -d --wait
pnpm test:spike:generation:field
pnpm test:spike:worker:field
pnpm test:spike:queue:field
pnpm test:spike:sites:field
pnpm test:spike:business:field
pnpm test:spike:bookings:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — Field F03 제작 AI 제안 (2026-09-24)

- **현재 목표:** 사용자 지시대로 화면 시각 검토 대기 없이 v3.0 기능을 계속 구현해 사용할 수 있는 환경을 만든다. 이번 단계 F03은 `in_progress`이며 46개 작업 전체와 출시 게이트는 미완료다. 모델 단가 비교는 실수로 요청된 것이므로 작업 목표에 포함하지 않는다.
- **완료 작업:** Field 단독 OpenAI Responses 어댑터를 만들고 `FIELD_OPENAI_API_KEY`/`FIELD_OPENAI_MODEL`을 AP와 분리했다. 모델은 제한된 JSON으로 템플릿·색·페이지/섹션 배치만 고른다. 화면에 들어가는 상호·소개·서비스는 승인 Field 카탈로그에서 서버가 채워, 모델이 숫자·자격·후기 내용을 만들어 넣지 못한다. DB의 단일 활성 작업이 queued→running→proposed/failed/canceled/stale→applied_to_draft를 기록한다. 사업자가 제안을 확인하고 적용해야 사이트 초안 revision이 증가하고, 생성 중 직접 편집·카탈로그 변경 시 오래된 결과는 적용되지 않는다. 유효하지 않은 모델 배치나 진행 중 취소도 응답 토큰 사용량을 한 번 기록한다. 실비용은 공급사 정산 전 `unpriced`다. 공급사 미설정 시 API 503 `blocked_integration`과 템플릿 직접 편집 화면을 제공한다.
- **수정 파일:** `apps/field-api/migrations/000008_site_generation.sql`, `apps/field-api/src/{app,business,server,sites,site-generation,field-openai}.ts`, `apps/field-api/test/{site-generation.db,field-openai.adapter}.test.ts`, `apps/field-web/src/site-editor.tsx`, `.env.example`, `package.json`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, 이 인수인계와 재생성한 마스터 문서. AP 파일·제품 간 계약은 변경하지 않았다. Git 저장소/커밋은 없다.
- **설계 결정:** AP와 분리된 Field DB·모델 키·작업 원장을 사용한다. 생성 중 모델 호출은 Field API 프로세스의 DB polling 처리기가 claim하며, 모델 호출 후 자동 공개하지 않는다. 서버 재시작으로 중단된 running 작업은 60초 후 `result_unknown_after_restart` 실패로 남겨 자동 재호출/중복 차감을 피한다. 이는 아직 Valkey 기반 worker/실제 복구 검수의 대체가 아니다. AI 출력은 제한된 배치 JSON만 허용하고 실제 문구는 승인 카탈로그에서 만든다. `store:false`, 도구 없음, 출력 상한을 사용한다. [OpenAI 공식 Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)와 [Responses create](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)를 확인했다.
- **실제 테스트/환경:** 로컬 Field PostgreSQL 17.11, `FIELD_PROFILE=mock`, 합성 모델/계정. 최초 DB 테스트는 생성 경로 404 red, 추가 유효하지 않은 출력의 사용량은 `null !== 24` red였다. 수정 후 `pnpm test:spike:generation:field` 2/2, `pnpm test:spike:sites:field` 1/1, `pnpm test:spike:business:field` 2/2, `pnpm test:spike:bookings:field` 1/1, `pnpm test:unit`의 기존 제품/화면 단위 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, `pnpm build:field`, `pnpm build:web:field`는 최종 실행에서 exit 0. 로컬 API를 새 코드로 재시작해 `/health/ready` 200, 인증 없는 생성 상태 경로 401을 확인했다. Chrome에서 새 합성 Field 계정/조직→사업 정보·서비스 승인→사이트 시작→AI 설명 입력→설정 없음 안내를 확인하고 합성 계정·사이트·조직을 삭제했다. AP/Field API·웹의 HTTP readiness/화면은 모두 200이다. `/tmp/fieldai-report-venv/bin/python tools/build_report.py`와 `tools/check_package.py` exit 0; 후자는 문서 패키지 검사(46 task/160 QA)만 수행했다. 실모델 호출·청구액·Valkey worker·재시작/공급사 장애·정식 DB/독립/e2e/security QA는 미실행이다.
- **실패 접근과 수정:** 첫 로컬 API 재시작에서 Fastify `onClose` 훅을 listen 뒤 등록해 예외 처리 경로가 pool을 닫았다. 훅을 listen 전에 등록하고 다시 시작해 readiness 200을 확인했다. 생성 결과가 유효하지 않을 때 토큰 수가 빠지는 것을 테스트로 발견해 배치 검증 전에 사용량을 기록하도록 변경했다. `typecheck`에서 테스트의 deferred callback 타입이 두 차례 실패했고 명시 함수 타입으로 고쳐 통과했다. Field business/booking spike를 동시에 실행하자 migration advisory lock 경쟁으로 business 쪽이 실패했다. 명령을 순차 재실행해 business 2/2와 booking 1/1이 통과했다. 같은 DB migration 명령은 병렬 실행하지 않는다.
- **남은 작업:** F03 실모델·실사용량/가격 대조, Valkey 기반 전용 worker/중단 복구·운영 한도, F02 사진/alt와 실제 생성/직접 수정 통합, C03 시각/접근성 사용자 검토, F07 남은 보호/복구, F08/F09와 AP 고객 AI/알림/구독, 공식 연결·매체·전체 QA·출시 게이트. F03은 `verified`나 출시 승인 상태가 아니다.
- **다음 에이전트 정확한 명령:** `cd /Users/jr/Desktop/projects/FieldAI`; 현재 상태를 `TASKS.md`, 이 파일, `docs/technical/PHASE_2_EXECUTION_PLAN.md`에서 읽는다. DB가 내려갔다면 `node tools/setup-mock-env.mjs`와 `docker compose --project-name fieldai-field-mock --env-file infra/field/.env -f infra/field/compose.mock.yaml up -d --wait`를 실행한다. 다음 작업의 파일 범위·요구/QA·명령을 계획에 먼저 기록한 뒤 F03 worker 복구/Valkey 또는 F02 미디어 등 문서 선행 의존을 따른다. 서버가 내려가면 README의 Field API/웹 실행 명령을 사용한다. 실제 모델 키가 없으면 공급사 검수는 `blocked_integration`으로 남긴다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:generation:field
pnpm test:spike:sites:field
pnpm test:spike:business:field
pnpm test:spike:bookings:field
pnpm test:unit
pnpm lint
pnpm typecheck
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

## 최신 인수인계 — Field F07 자정 영업·조건 재동의 (2026-09-24)

- **현재 목표:** 사용자 요청대로 화면 검토 대기 없이 v3.0 기능을 계속 구현한다. F07은 `in_progress`이고 예약 전체/정식 QA·출시는 미완료다. AP A05도 `in_progress`다.
- **완료 작업:** 예약 정책의 `22:00→02:00` 같은 다음 날 종료를 허용하고, 영업 시작일 밤과 다음 날짜 새벽의 슬롯을 제공한다. 명시 휴무일은 이전 영업에서 넘어온 그 날짜 시작 슬롯도 감춘다. 신청 뒤 승인 카탈로그 변경으로 확정이 멈춘 고객은 확인키로 기존 서비스 snapshot과 최신 서비스/가격/소요시간을 비교하고 재동의한다. 서비스 삭제 시 고객이 현재 승인 서비스를 대체 선택한다. 새 조건 재제출은 기존 제안/수락을 지우고 신청 상태로 되돌리며 DB revision·이벤트·outbox를 남긴다. 이미 확정된 예약의 원래 서비스 snapshot은 변경하지 않는다. Field 고객 확인 화면에 재동의 폼과 새 시간 선택을 추가했다.
- **수정 파일:** `apps/field-api/src/bookings.ts`, `apps/field-api/test/bookings.db.test.ts`, `apps/field-web/src/field-booking.tsx`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, 이 파일과 재생성 마스터 문서. migration/공개 제품 간 계약 변경은 없고 Git 저장소/커밋도 없다.
- **설계 결정:** 야간 영업의 슬롯은 시작 날짜별로 반환하고, 다음 날짜에는 전날 야간 영업의 이른 슬롯을 별도 노출한다. 고객의 새 조건 동의는 예약 receipt capability+CAS revision+최신 카탈로그 revision으로 검사한다. 가격·소요시간·예약 방식 변경을 반영할 때 기존 미확정 시간 제안은 무효화한다. 확정 예약의 snapshot과 점유는 이전 조건대로 보존한다.
- **실제 테스트/환경:** 로컬 Field PostgreSQL 17.11, `FIELD_PROFILE=mock`. `pnpm test:spike:bookings:field`에서 자정 정책 400 red와 카탈로그 재확인 404 red를 확인한 뒤 최종 1/1 green. 동시 확정/점유·제안/변경/취소 회귀 외에 가격 변경 재동의, 서비스 삭제 대체/방식 전환, revision 재시도 차단, 자정 전후/다음 날짜/휴무를 실행했다. `pnpm test:spike:business:field` 2/2, `pnpm test:spike:sites:field` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm build:field`, `pnpm build:web:field`, 기존 Field API를 중지한 `pnpm test:spike:independence:field`가 최종 exit 0. Chrome에서 합성 고객 예약의 기존 10,000원/30분과 새 15,000원/45분을 확인→동의·재제출→가격/처리 이력 갱신, 콘솔 출력 없음을 검수했고 합성 fixture는 삭제했다. 기존 고객/사업자 왕복은 앞 단계에서 검수했다. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py`는 `document_package_only` 46 tasks/160 QA로 통과했다.
- **실패 접근과 수정:** 선행 테스트는 예상대로 400/404였다. 재동의 API 구현 첫 `pnpm typecheck`/`pnpm build:field`에서 nullable `start`가 2회 오류를 냈고, ISO 값을 별도 변수로 좁혀 통과했다. 운영 API에서 실제 고객 메시지 발송을 성공으로 처리하지 않았다.
- **남은 작업:** F07 DST 중복/누락 시각, 서비스 기본 예약 방식 상속, 중복 제출/idempotency·rate limit/확인키 반복 방어, 정책 변경/제안 경쟁의 전체 복구, 실알림/보존·복구, 정식 QA25~34·독립/보안/E2E 게이트. AP A04 실모델, A05 실제 소유 도메인/고객 AI·대화 원본, 양 제품 알림·구독·연동/매체/출시도 남는다.
- **다음 에이전트 정확한 명령:** Field DB가 중지돼 있으면 `node tools/setup-mock-env.mjs`와 `docker compose --project-name fieldai-field-mock --env-file infra/field/.env -f infra/field/compose.mock.yaml up -d --wait`부터 실행한다. 아래 명령으로 현재 코드를 확인하고, F07 남은 범위나 다음 Task를 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 파일/QA/명령으로 먼저 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:bookings:field
pnpm test:spike:business:field
pnpm test:spike:sites:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

로컬 서버가 내려갔으면 `README.md`의 API·웹 명령으로 다시 올린다. 현재 Field `http://localhost:3002/workspace`, AP `http://localhost:3001/workspace`/`workspace/deployments`는 로컬 mock 프로세스로 실행할 수 있다. Field 독립 spike 실행 전에는 기존 4321 API를 중지한다.

## 이전 인수인계 — AP A05 상담 링크·소유 사이트 설치 (2026-09-24)

- **현재 목표:** 사용자 지시에 따라 기능 구현을 계속해 AP/Field를 각각 사용할 수 있는 환경으로 만든다. A05는 `in_progress`다. AP 고객 AI 자동 답변·실모델/실도메인/정식 QA와 전체 46개 작업·출시 게이트는 미완료다.
- **완료 작업:** AP 전용 `ap.deployments`와 handoff 원장을 만들었다. 사업자는 승인 AI·지식을 토대로 AP 단독 상담 링크를 발급·중지하고, owned widget origin을 등록해 DNS TXT로 소유를 확인한 뒤 활성화한다. 공개 SDK는 배포 ID만 사용하고 iframe은 정확한 Referer origin·CSP `frame-ancestors`에 묶인다. iframe의 질문 초안은 nonce→단기 세션→1회 ticket→AP 1차 화면 HttpOnly cookie context로 옮긴다. 고객 이름·전화·동의는 기존 AP 직접 문의 양식에서만 제출하며, iframe은 전화/이메일 패턴을 거부한다. 최신 지식·AI release와 달라진 배포는 공개 조회에서 중단된다. AP 웹 `/workspace/deployments`, `/consult/{publicId}`를 연결했다.
- **수정 파일:** `apps/agent-api/migrations/{000009_deployments,000010_deployment_handoffs}.sql`, `apps/agent-api/src/{app,business,deployments}.ts`, `apps/agent-api/test/deployments.db.test.ts`, `apps/agent-web/next.config.ts`, `apps/agent-web/src/{agent-deploy,agent-public,agent-ai,workspace}.tsx`, `apps/agent-web/src/app/{workspace/deployments,consult/[id]}/page.tsx`, `.env.example`, `package.json`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, 이 파일과 재생성 마스터 문서. Git 저장소/커밋 없음.
- **핵심 결정:** 운영 `ap.*` 원장은 과거 `spike.*` 설치 원장과 분리한다. AP 전용 공개 링크/위젯에 Field·campaign·publisher 의존성을 두지 않는다. 운영은 `AP_PUBLIC_WEB_ORIGIN`의 공개 https 주소가 필요하고 로컬 mock만 `http://localhost:3001`을 기본값으로 쓴다. DNS 증명은 `_agent-platform.{host}`의 `ap-site-verification={proof}` TXT 값으로 확인한다. 공개 스크립트에는 비밀키를 넣지 않는다. 외부 iframe에서 연락처를 요구하지 않는다. 현재 고객 자동 답변은 활성화하지 않고 사람 문의로 연결한다.
- **실제 테스트/환경:** 로컬 AP PostgreSQL 17.11, `AP_PROFILE=mock`. A05 API 테스트는 404 red 후 `pnpm test:spike:deployments:agent` 1/1 green. 같은 AP DB에서 business/inquiries/agents/OpenAI adapter/deployments/기존 embed·conversation spike 통합 명령 8/8 exit 0. `pnpm typecheck`, `pnpm lint`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, 기존 AP API 중지 후 `pnpm test:spike:independence:agent` exit 0. Chrome에서 사업자 링크 발급·활성화→고객 비회원 문의 저장, 별도 origin 합성 사이트의 실제 JS SDK iframe→새 창→AP `/v1/embed/context` 200을 확인했다. 합성 origin fixture는 DNS 검증을 우회해 **로컬 DB에 테스트 전용으로만 삽입**했고 이후 삭제·로컬 테스트 서버 중지했다. 실제 DNS/https 설치·제3자 쿠키 차단·다중 ancestor·정식 QA/보안/E2E는 미실행이다.
- **실패 접근과 수정:** 첫 AP 서버 재시작은 기존 `spike` frame과 새 운영 frame 경로가 중복되어 `FST_ERR_DUPLICATED_ROUTE`로 실패했다. 실제 business runtime에는 운영 frame만 등록하고, spike 단독 테스트 앱에는 기존 frame을 유지하도록 분기했다. 재시작 및 두 경로 테스트는 통과했다. 브라우저의 기존 캐시 경로는 쿼리 문자열로 새 페이지를 열어 확인했다.
- **남은 작업:** A05 실소유 도메인 검증·외부 사이트 설치/Origin 및 다중 ancestor·제3자 쿠키 차단·접근성, 외부 질문/대화 원본·AI 답변/사람 인계 통합, 배포별 제출 attribution·남용 방어/청소·복구. A04 실제 모델 검수, A06 실알림, A07 구독, Field 남은 기능, 연동/매체/정식 QA·출시 게이트가 남는다. 로컬 테스트는 운영 승인 근거가 아니다.
- **다음 에이전트 정확한 명령:** 아래를 순서대로 실행한다. DB가 중지돼 있으면 `node tools/setup-mock-env.mjs`와 `docker compose --project-name fieldai-agent-mock --env-file infra/agent/.env -f infra/agent/compose.mock.yaml up -d --wait` 후 검수한다. 다음 Task 또는 A05 잔여 범위의 파일·QA·검수 명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 먼저 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:deployments:agent
pnpm test:spike:agents:agent
pnpm test:spike:business:agent
pnpm test:spike:inquiries:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

서버가 내려갔다면 `README.md`의 AP API·웹 실행 명령을 사용한다. `http://localhost:3001/workspace/deployments`는 AP 로컬 로그인/조직·지식·AI 승인 뒤 열린다. 독립 spike를 다시 실행할 때는 먼저 4311 포트의 기존 AP API를 중지한다.

## 이전 인수인계 — AP A04 AI 설정·사업자 테스트 (2026-09-24)

- **현재 목표:** 사용자 지시에 따라 화면 검토 대기 없이 v3.0의 기능을 이어 구현해 사용 가능한 독립 AP/Field 환경을 만든다. A04는 `in_progress`이고 공급사 키/모델 미설정으로 실제 AI 검수는 `blocked_integration`이다. 46개 작업과 출시 게이트는 미완료다.
- **완료 작업:** AP 전용 `agent_drafts`, `agent_releases`, `ai_runs` 및 migration/backfill을 추가했다. 조직 권한과 revision CAS로 AI 설정 초안을 저장하고, owner가 최신 승인 지식에 묶어 승인한다. 사업자 질문 테스트는 승인 근거만 모델에 전달하며 JSON Schema·`store:false`·도구 없음·출력 토큰 상한을 사용한다. 응답 구조, 근거 ID, 근거에 없는 숫자, 토큰 사용량을 서버에서 검사한다. 로컬 공급사 미설정은 503 `blocked_integration`이며 실제 고객 문의·알림은 만들지 않는다. AP `/workspace/ai`에서 저장·승인·테스트/오류 상태를 볼 수 있다.
- **수정 파일:** `apps/agent-api/migrations/{000007_agents,000008_agent_release_rebinding}.sql`, `apps/agent-api/src/{app,business,server,agents,openai}.ts`, `apps/agent-api/test/{agents.db,openai.adapter}.test.ts`, `apps/agent-web/src/{agent-ai,workspace}.tsx`, `apps/agent-web/src/app/workspace/ai/page.tsx`, `.env.example`, `package.json`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, 이 인수인계, 재생성한 마스터 문서. Git 저장소가 없어 commit ID는 없다.
- **설계 결정:** AP 모델 설정은 `AP_OPENAI_API_KEY`와 명시 `AP_OPENAI_MODEL`을 모두 요구한다. Field 제작 AI와 DB/세션/secret을 공유하지 않는다. 테스트 질문에서 전화·이메일을 거부하며 기본 고객 대화와 분리한다. provider 없는 상태를 성공으로 모의 처리하지 않는다. 근거 ID와 숫자 검사만으로 의미상 모든 허위 주장을 판별할 수 없으므로 실제 모델·도메인 검수 전 QA22~24 전체 통과로 보지 않는다.
- **실제 테스트/환경:** 로컬 AP PostgreSQL 17.11, `AP_PROFILE=mock`. 선행 API 테스트는 404 red였다. 구현 후 `pnpm test:spike:agents:agent` 2/2, `pnpm typecheck`, `pnpm lint`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:business:agent` 2/2, `pnpm test:spike:inquiries:agent` 1/1, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, 기존 AP API를 중지한 상태의 `pnpm test:spike:independence:agent`는 각각 exit 0. Chrome `agbrowse`에서 새 합성 AP 계정/조직→지식 초안/승인→AI 설정 저장/승인→질문 테스트의 `blocked_integration`을 확인했고 콘솔 출력은 없었다. 실제 공급사 호출·정식 `test:db:*`/contracts/faults/e2e/security는 미실행이다.
- **실패 접근과 수정:** 기존 AP 웹 서버/브라우저 캐시가 새 `/workspace/ai` 경로를 404로 보여 서버 재시작과 쿼리 문자열을 붙인 새 탐색 후 실제 페이지를 확인했다. 기존 브라우저 세션이 만료되어 새 로컬 합성 계정을 만들었다. 실제 API 키 부재는 정상 `blocked_integration`으로 유지했다.
- **남은 작업:** A04 실제 공급사 응답·예산/비용 검수·의미적 근거 검수/복구와 고객 대화 통합, A05 기본 외부 위젯 및 사람 인계, F07 정책·재동의·보호/복구, Field 제작 AI·실알림·구독, 공식 연결·매체·정식 QA/출시 게이트. 현재 사업자 AI 테스트는 고객 서비스 자동 답변이 아니다.
- **다음 에이전트 정확한 명령:** 아래 순서로 현재 코드·DB를 확인한다. AP DB가 중지돼 있으면 `node tools/setup-mock-env.mjs`와 `docker compose --project-name fieldai-agent-mock --env-file infra/agent/.env -f infra/agent/compose.mock.yaml up -d --wait`를 먼저 실행한다. 다음 구현은 `TASKS.md` 의존에 따라 A05 또는 F07 남은 범위를 정하고 파일·QA·명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 기록한 뒤 시작한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:agents:agent
pnpm test:spike:business:agent
pnpm test:spike:inquiries:agent
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:web:agent
pnpm test:spike:imports
pnpm test:spike:db:isolation
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

현재 로컬 프로세스가 내려갔다면 `README.md`의 네 프로세스 실행 명령으로 AP/Field API·웹을 다시 올린다. `http://localhost:3001/workspace/ai`는 AP 로그인/조직 생성·승인 지식 뒤 열린다. AP 독립 spike를 다시 실행할 때는 4311 포트의 기존 AP API를 먼저 중지해 포트 중복에 의한 거짓 양성을 막는다.

## 이전 인수인계 — Field F07 예약 기본 흐름 (2026-09-24)

- **현재 목표:** 사용자 지시에 따라 화면 시각 검토 대기 없이 v3.0 문서의 기능을 끝까지 구현하고 사용 가능한 환경을 만든다. 현재 로컬 mock 기능 검수 단계이며 46개 작업 전체·출시 게이트는 미완료다. `TASKS.md`의 F07은 `in_progress`다.
- **완료 작업:** Field 전용 예약 정책(시간대, 주간/예외 영업일, 휴무일, 버퍼, 최소 여유·기간), 시간표형/희망시간형 비회원 신청, 별도 확인키 조회, 사업자 제안→고객 수락→사업자 최종 확정, 변경 요청과 기존 점유를 보존한 원자적 교체, 취소/철회, 거절/명시 만료/완료/수동 노쇼 기록, 수동 일정 차단/해제, 전화 예약 수동 등록, 처리 이력과 outbox를 연결했다. 확정과 수동 일정은 Field PostgreSQL `tstzrange` 배타 제약으로 같은 조직 자원에 충돌한다. 사이트 공개 화면은 고객 예약 경로로 연결된다. 전화 예약은 고객 동의·자동 알림이 있었다고 기록하지 않는다.
- **수정 파일:** `apps/field-api/migrations/000006_bookings.sql`, `000007_booking_lifecycle.sql`, `apps/field-api/src/app.ts`, `bookings.ts`, `apps/field-api/test/bookings.db.test.ts`, 루트 `package.json`의 `test:spike:bookings:field`, `apps/field-web/src/field-api.ts`, `field-booking.tsx`, `field-public.tsx`, `field-site.tsx`, `field-workspace.tsx`, `site.css`, `apps/field-web/src/app/reservation/[id]/page.tsx`, `TASKS.md`, `README.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, 이 파일. 문서 마스터/HTML은 마지막에 `tools/build_report.py`로 재생성한다.
- **설계 결정:** 미확정 요청/제안/고객 수락은 점유하지 않는다. `confirmed`·수동 일정만 같은 조직 자원을 점유한다. 확정 시 현재 승인 카탈로그 revision을 재확인하며 오래된 요청은 409 `catalog_stale`로 멈춘다. 변경 확정은 기존 점유 행을 트랜잭션 안에서 새 범위로 UPDATE하고 DB 제약 실패 시 전체 롤백한다. 원래 가격·소요시간은 접수 서비스 스냅샷에 남긴다. 고객 원문 조회는 전화번호가 아닌 256비트 별도 확인키가 필요하며 응답 `no-store`를 준다. 문자/카카오는 발송하지 않고 `pending`/outbox로만 남긴다.
- **실제 테스트/환경/커밋:** 로컬 Field PostgreSQL 17.11, `FIELD_PROFILE=mock`. `pnpm test:spike:bookings:field`는 예약 API 404 red 후 1/1 green; 수정 후 반복 실행도 exit 0. 범위는 정책 CAS/휴무, 두 방식, 같은 슬롯 복수 요청, 동시 확정 1건만 성공, DB 충돌, 제안·수락, 변경 교체 실패 시 기존 점유 보존, 취소/전화 예약, stale 카탈로그, 처리 이력이다. `pnpm typecheck`, `pnpm lint`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:unit`, `pnpm test:spike:business:field` 2/2, `pnpm test:spike:sites:field` 1/1, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, `pnpm test:spike:independence:field`는 최신 코드에서 각각 exit 0. Field 단독 기초 검사는 기존 API를 중지한 뒤 자식 환경에 Field DB/인증만 넣어 실행했고 이후 API를 다시 시작했다. Chrome에서 고객 시간표 신청→확인키 조회→사업자 제안→고객 수락→사업자 확정→고객 변경·취소 요청→사업자 취소 승인→고객 이력 조회를 확인했다. `agbrowse console` 출력 없음. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py`는 `document_package_only`로 통과(46 task, 160 QA). Git 저장소/커밋 없음.
- **실패 접근과 수정:** 첫 확정 충돌이 `slot_unavailable`로 반환되어 정책 유효성 검사와 PostgreSQL 최종 충돌 판정을 분리했다. `booking_policy` UPSERT의 CAS 업데이트가 실행되지 않는 SQL 형태를 초기 INSERT/후속 UPDATE로 나눴다. TypeScript의 배열 분해 `undefined` 오류를 수정했다. 취소 후 화면의 기존 시간을 “현재 확정”으로 표시하던 문구를 “기존 확정 시간”으로 고쳤다. 선행 red와 중간 lint/typecheck 실패는 최종 green으로 재검증했다.
- **미검증/남은 작업:** 자정 넘는 영업/시간대 DST, 서비스 기본 예약 방식 상속, 카탈로그 조건 변경 후 고객의 중요값 재확인·재동의, 중복 제출/idempotency·rate limit·확인키 반복 방어, 실알림·보존/복구, 정식 `test:db:field`·independence·faults·e2e·security 및 QA25~34 전체/출시 게이트는 미구현·미실행이다. 공급사 연동은 `blocked_integration`; 이 F07 부분 기능을 완료나 출시 승인으로 표시하지 않는다. AP AI/설치, Field 제작 AI/결제, 양방향 공식 연결, Distribution 등 나머지 작업도 미완료다.
- **다음 에이전트 정확한 명령:** 아래를 순서대로 실행해 현재 상태를 확인한다. DB가 중지돼 있으면 먼저 `node tools/setup-mock-env.mjs`와 `docker compose --project-name fieldai-field-mock --env-file infra/field/.env -f infra/field/compose.mock.yaml up -d --wait`를 실행한다. 코드 시작 전 F07 남은 범위 또는 다음 Task의 파일/QA/명령을 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 기록한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:spike:bookings:field
pnpm test:spike:business:field
pnpm test:spike:sites:field
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:field
pnpm build:web:field
pnpm test:spike:imports
pnpm test:spike:independence:field
/tmp/fieldai-report-venv/bin/python tools/build_report.py
/tmp/fieldai-report-venv/bin/python tools/check_package.py
```

다음 구현은 F07의 자정 영업·재동의/보호·복구를 먼저 마무리하고, AP A04 이후 AI/설치와 Field F03/F08/F09를 각각 독립 제품 경계에서 진행한다. 실제 API·DB·세션은 제품 간 공유하지 않는다.

## 이전 인수인계 — Field 기본 사이트 공개까지 기능 연결 (2026-09-24)

- **현재 목표:** 사용자 지시에 따라 화면 시각 검토 대기 없이 v3.0 문서의 기능을 구현해 사용 가능한 환경을 구축한다. 현재는 AP A00~A03과 Field F00/F01/F02/F04/F05/F06의 부분 구현 단계이며 46개 작업 전체·운영 출시는 미완료다.
- **완료 작업:** AP 별도 PostgreSQL 17에 조직·membership·직접 지식 초안/승인 release·비회원 직접 문의·확인키·메시지 sequence·사업자 답변/내부 메모·후속 대화·outbox를 만들고 세션/권한/revision API를 연결했다. Field 별도 DB에 조직·카탈로그 초안/승인 release·두 예약 방식·명시 가격, 비회원 직접 문의·확인키·사업자 문의함/답변·고객 후속 대화·outbox를 만들었다. Field 사이트 초안/승인 릴리스·Essential/Editorial/Warm 배치·최대 5개 소개 페이지·기본 slug 공개·디자인 초안 복구와 카탈로그 stale 표시를 추가했다. 두 제품 로컬 mock 가입은 메일 공급사 없이 가능하지만 production mock 시작은 차단한다. AP/Field `/workspace`와 각 제품 고객 `/public/{organizationId}`·`/inquiry/{inquiryId}`를 실제 API에 연결했고, Field `/workspace/site`·`/site/{slug}`도 연결했다. `README.md`에 로컬 실행 명령을 적었다.
- **수정 파일:** AP `apps/agent-api/{migrations/000005_business_core.sql,migrations/000006_inquiries.sql,src/{app,auth,business,inquiries,server}.ts,test/{business-core,inquiries}.db.test.ts}`, Field `apps/field-api/{migrations/000003_business_core.sql,migrations/000004_inquiries.sql,migrations/000005_sites.sql,src/{app,auth,business,inquiries,sites,server}.ts,test/{business-core,sites}.db.test.ts}`, 두 웹 앱의 `next.config.ts`·`src/app/page.tsx`·신규 작업/고객 경로와 클라이언트, `apps/field-web/src/{field-site,site-editor,site.css}`, `packages/ui/src/index.tsx`, `package.json`, `.env.example`, `README.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/PHASE_2_EXECUTION_PLAN.md`, 이 파일과 재생성 마스터. Git 저장소가 없어 commit ID는 없다.
- **설계 결정:** AP/Field DB·세션·계정·API는 분리했고 서로 내부 코드를 import하지 않는다. 공개 API는 승인 release만 읽고 초안은 조직 membership이 필요하다. 각 제품의 직접 문의 원문은 해당 제품 DB에만 있으며 전화번호만으로 열지 못하고 256비트 별도 확인키가 필요하다. AP 내부 메모는 고객 조회에서 제외하고 메시지는 대화별 sequence를 갖는다. 사업자 답변과 고객 질문은 저장과 발송을 분리해 알림을 `pending`으로 표시한다. 가격·서비스·운영 정보는 사용자 입력만 저장한다. 검토용 `/preview` 화면과 실제 로컬 `/workspace` 화면은 분리했다.
- **실제 테스트/환경:** 2026-09-24 로컬 PostgreSQL 17.11의 AP 55431·Field 55432에서 `pnpm test:spike:business:agent` 2/2, `pnpm test:spike:inquiries:agent` 1/1, `pnpm test:spike:business:field` 2/2, `pnpm test:spike:sites:field` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:agent`, `pnpm build:web:field`, `pnpm test:spike:db:isolation`, `pnpm test:spike:imports`, `pnpm test:spike:independence:agent`, `pnpm test:spike:independence:field` 실행 시 exit 0. AP/Field `NODE_ENV=production`+`mock` 시작은 예상대로 각각 exit 1. Chrome `agbrowse`에서 AP 가입→승인→비회원 문의→사업자 메모/답변→고객 확인키 재조회, Field 가입→서비스/가격 승인→비회원 문의→확인키 조회→사업자 답변→고객 후속 질문과 사이트 초안 생성→Editorial/다중 페이지 편집→공개→공개 페이지 이동을 실제 HTTP/DB로 확인했다. 공개 사이트 320px iframe에서 `scrollWidth=316, innerWidth=316`, 콘솔 오류 없음. 두 제품에 합성 브라우저 계정/조직이 로컬 mock DB에 남아 있다.
- **실패 접근과 조치:** 선행 AP/Field 기능 테스트는 API 404로 red였다. AP 잘못된 UUID 조회가 500이던 것을 엄격한 UUID 검증으로 404로 바꿨다. 편집자 승인과 부분 PATCH가 미구현이어서 권한·부분 수정 로직을 고쳤다. Field 사업자 문의 상세·사이트 공개 목록·stale 필드는 404/미정의 red를 확인하고 구현했다. 사이트 테스트 합성 데이터 삭제에서 site release→catalog release FK가 남아 실패해 테스트의 사이트 우선 정리 순서를 고쳤다. CUA 브라우저 선택은 `iab`·Chrome 모두 사용 불가여서 기존 `browser` 스킬의 `agbrowse`로 검수했다.
- **남은 작업:** AP A02/A03의 첨부·AI→사람 인계 경쟁·남용 방지와 A04/A05 실제 AI·기본 외부 설치, Field F02/F04의 사진/alt·자체 도메인·복구/접근성, F03 제작 AI와 F07 예약 실행, F05/F06의 첨부·내부 메모·남용/중복 방지, 양 제품의 실메일/카카오·실알림·구독·Valkey 큐·복구, 공식 연동/매체/전체 QA. C03 200% 확대·키보드 전체·스크린리더·사용자 디자인 검토도 남았다. 정식 `test:db:*`, contracts, independence, faults, e2e, security와 공급사 gate는 구현/실행 전이며 출시 승인으로 표시하지 않는다.
- **정확한 다음 명령:** `cd /Users/jr/Desktop/projects/FieldAI`; `pnpm test:spike:business:agent`; `pnpm test:spike:inquiries:agent`; `pnpm test:spike:business:field`; `pnpm test:spike:sites:field`; `pnpm lint`; `pnpm typecheck`. 서버가 내려갔으면 `README.md`의 로컬 기능 작업 환경 순서대로 두 DB·migration·API·웹을 실행한다. AP `http://localhost:3001/workspace`, Field `http://localhost:3002/workspace` 및 `/workspace/site`에서 확인한다. 다음 기능은 `TASKS.md` 선행 순서와 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 범위/QA/명령을 기록한 뒤 Field F07의 테스트 red부터 시작한다. `TASKS.md`나 분할 원문 변경 뒤 `/tmp/fieldai-report-venv/bin/python tools/build_report.py` 및 `/tmp/fieldai-report-venv/bin/python tools/check_package.py`를 실행한다.

아래 C03 2차 화면 검수 기록은 이 기능 연결 이전의 이력이다.

## 최신 인수인계 — C03 2차 화면 검수 (2026-09-24)

- **현재 목표:** `reference/field_ui_prototype_v3.html`와 v3.0 명세에 맞춰 AP/Field 화면 검토본을 마감하고 사용자 화면 확인 뒤 각 제품 기능을 연결한다. C03은 `in_progress`이며 운영 서비스·출시 승인이 아니다.
- **완료 작업:** 모바일 더보기에서 역할별 모든 화면에 접근하도록 바꿨다. Field 편집에 모바일 편집/미리보기 전환, 입력·색상 즉시 반영, 사진·alt·페이지·섹션 순서의 비활성 조작 위치를 넣었다. Field 고객 예약에 희망시간 제출형/시간표 선택형을 분리했다. AP 지식 초안/외부 검토, AP 안전 접수, Field 직접 문의·연락/예약 설정, 매체·각 제품 관리자 및 목록의 업무별 빈 상태를 보강했다. AP 22개·Field 30개 경로의 HTTP 200/화면 ID를 확인했다.
- **수정 파일:** `packages/ui/src/{index.tsx,states.css}`, `apps/agent-web/src/{screens.ts,agent-preview.tsx}`, `apps/field-web/src/{screens.ts,field-preview.tsx,editor-preview.tsx,booking-preview.tsx}`, 두 웹 앱의 `package.json`·`test/*.test.tsx`, `docs/technical/{PHASE_2_EXECUTION_PLAN,PHASE_2_UI_REVIEW}.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성한 마스터 Markdown/HTML, 이 파일. 공개 API·DB·migration은 변경하지 않았다.
- **핵심 설계:** 공통 UI에는 데이터 접근이 없다. 로컬 편집 입력과 색상은 검토본 메모리 안에서만 바뀌며 저장 성공을 주장하지 않는다. 사진·페이지·발송·공개·접수·예약 요청/확정은 API 전 비활성이다. 목록 지표의 `—`는 0건이 아니라 미연결을 뜻한다. AP와 Field 계정·원본·권한은 여전히 분리된다.
- **실제 검사:** 최종 `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm build:web:agent`, `pnpm build:web:field` exit 0. 새 UI 단위 테스트 AP 7개·Field 8개는 red 확인 후 구현·green 확인했다. 두 로컬 웹 서버 52개 화면 HTTP 200/화면 ID 확인. headless Chrome iframe CSS viewport로 52개 경로를 각각 320px에서 검사해 모두 `scrollWidth=320`·표시 글자 최소 14px. 주요·새 상세 화면은 390/768/1440px 넘침 없음. Chrome에서 Field 편집 입력·색상 반영과 모바일 전환 후 유지, 예약 방식 전환, 키보드 Enter로 더보기 메뉴 열기·Field 사업자 16개 링크 확인. `/tmp/fieldai-report-venv/bin/python tools/build_report.py`와 `tools/check_package.py` exit 0; 후자는 `document_package_only` 검사다. Git repo/commit 없음.
- **실패와 조치:** UI 테스트의 React classic transform 오류는 테스트 렌더링 파일에 React import를 넣어 해결했다. 모바일 경로 누락 테스트가 예상대로 실패해 전체 메뉴를 추가했다. AP AI·고객 상담의 320px 가로 넘침 13px은 특수 패널 최소 너비를 수정하고 재검사했다. `typecheck`는 테스트의 `screens[role][0]` undefined 가능성 및 색상 배열 추론 때문에 실패해 타입을 바로잡고 통과했다. Field 첫 빌드도 같은 색상 타입 오류로 실패했고 수정 후 통과했다. CUA Chrome 모바일 도구 상태가 비어 보여 `browser` 스킬의 `agbrowse`로 독립 로컬 브라우저 검수를 이어갔다.
- **남은 작업:** 사용자 화면 검토, 공통 템플릿 중심 화면의 추가 상세화, 200% 확대·키보드 전체 순회·스크린리더, 실제 서버 상태·입력 검증 연결. C03 전체/QA57·58·119는 아직 `verified`가 아니다. 다음 기능 단계는 AP A00/A01/A02/A03 및 Field F00~F07, C01 계약과 C02 독립 Valkey/운영 검수는 병행 의존이다. 공급사 게이트와 R02는 남았다.
- **정확한 다음 명령:** `cd /Users/jr/Desktop/projects/FieldAI`; 검토 서버가 내려갔으면 `pnpm build:web:agent && pnpm build:web:field` 후 각 터미널에서 `APP_PROFILE=design_preview pnpm --filter @fieldai/agent-web start`, `APP_PROFILE=design_preview pnpm --filter @fieldai/field-web start`. `http://localhost:3001/preview/owner/knowledge`, `http://localhost:3002/preview/owner/editor`, `http://localhost:3002/preview/customer/booking`을 검토한다. 코드 검사는 `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports`. 기능 연결을 승인받으면 `pnpm test:spike:business:agent`로 선행 AP DB 테스트의 red를 먼저 확인한다.

아래 `최신 인수인계 — C03 화면 검토본`은 직전 기록이며 위 2차 검수로 갱신되었다.

## 최신 인수인계 — C03 화면 검토본 (2026-09-24)

- **현재 목표:** 사용자 지시에 따라 `reference/field_ui_prototype_v3.html`와 v3.0 문서의 제품별 화면을 먼저 완성·검수한 뒤 AP/Field 기능을 연결한다. C03은 `in_progress`, A/F 기능은 planned. 전체 완료는 R02와 적용 출시 게이트다.
- **완료 작업:** PostgreSQL 17·Valkey 기준을 ADR 0002와 스택 문서에 반영했다. `docs/technical/PHASE_2_EXECUTION_PLAN.md`을 화면 우선으로 바꾸고, `PRODUCT.md`에 제품 UI 맥락을 기록했다. `apps/agent-web`, `apps/field-web`에 별도 Next 앱을 만들고 `packages/ui`에 데이터 접근 없는 공통 UI를 구현했다. AP 22개·Field 30개 역할별 경로와 제품 홈, 일부 주요 화면의 전용 레이아웃 및 검토용 상태 전환을 만들었다. `APP_PROFILE=live` 검토본 빌드를 차단한다. 검토 경로·미실행 항목은 `docs/technical/PHASE_2_UI_REVIEW.md`에 있다.
- **수정 경로:** `apps/{agent-web,field-web}/`, `packages/ui/`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `package.json`, `eslint.config.mjs`, `.env.example`, `README.md`, `PRODUCT.md`, `docs/technical/{PHASE_2_EXECUTION_PLAN,PHASE_2_UI_REVIEW,TECH_STACK}.md`, `docs/adr/{0001-independent-runtime,0002-valkey-postgres-baseline}.md`, `TASKS.md`, `DEVELOPMENT_STATUS.md`, 재생성된 마스터 Markdown·HTML, 이 파일. 직전 API 우선 계획에서 `apps/agent-api/test/business-core.db.test.ts`와 `package.json`의 `test:spike:business:agent`를 선행 작성했으나 아직 실행하지 않았다.
- **핵심 설계:** AP/Field 웹·DB·세션은 독립이다. 화면 상단 역할 링크는 명시적인 `design_preview` 경로에만 있다. 비활성 행동에 이유를 표시하며 예시 오류·미연결·권한·한도·동기화 지연은 실제 서버 결과가 아님을 밝힌다. API 연결 전 저장·공개·예약·AI 응답·발송 성공을 표시하지 않는다. Valkey 연결은 첫 비동기 업무 시 검증한다.
- **실제 검사:** 로컬에서 `pnpm install`, `pnpm build:web:agent`, `pnpm build:web:field`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports` exit 0. `APP_PROFILE=live pnpm build:web:agent`와 `APP_PROFILE=live pnpm build:web:field`는 의도한 차단으로 exit 1. Chrome에서 양쪽 홈·사업자 시작, Field 디자인 라디오 변경과 320px 화면, AP AI 설정과 `?state=error` 화면을 확인했다. `/tmp/fieldai-report-venv/bin/python tools/build_report.py`와 `tools/check_package.py` exit 0, 후자는 문서 패키지만 검사했다. Git repo/commit 없음.
- **실패와 해결:** 첫 `pnpm install`은 존재하지 않는 `@types/react@19.2.19`로 실패해 19.3.0으로 고쳤다. 첫 웹 빌드는 공통 UI 패키지의 React 타입 미선언으로 실패해 패키지 devDependency를 추가했다. 첫 lint는 Next `.next` 생성물을 읽어 실패해 ignore를 추가했다. 재실행은 위와 같이 성공했다. Chrome 기기 툴바의 너비 입력은 첫 시도에 1320으로 붙었고 전체 선택 후 320으로 수정해 확인했다.
- **남은 작업:** C03 전체 52개 화면의 상세 구성, 390/768/1440px·200% 확대·키보드·스크린리더 검수, UI 상태 문구 점검. 선행 AP DB 테스트의 red 확인은 기능 연결 단계에서 수행한다. 이후 A/F/API/DB/권한/이벤트, C01 실행 계약, C02 Valkey·독립 배포·복구, I/D/R 트랙과 공급사 게이트가 남았다.
- **정확한 다음 명령:** `cd /Users/jr/Desktop/projects/FieldAI`; `pnpm install --frozen-lockfile`; `pnpm build:web:agent`; `pnpm build:web:field`; `APP_PROFILE=design_preview pnpm --filter @fieldai/agent-web start`; 다른 터미널에서 `APP_PROFILE=design_preview pnpm --filter @fieldai/field-web start`; Chrome에서 `http://localhost:3001`, `http://localhost:3002` 확인. 코드 검사는 `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports`. API 단계 시작 명령은 `pnpm test:spike:business:agent`이며 우선 실패를 확인한다. TASKS 변경 후 `/tmp/fieldai-report-venv/bin/python tools/build_report.py`, 이어 `tools/check_package.py`를 실행한다.

아래의 이전 기록 중 ‘후속 단계는 사용자 검토를 기다린다’는 문구는 작성 당시 상태다. 이후 사용자가 다음 단계 진행과 화면 우선 순서를 지시했다.

## 현재 목표

`AGENTS.md`, v3.0 분할 명세, `TASKS.md`에 따라 독립 제품 Agent Platform(AP)과 Field를 실제 구현·검수한다. 현재 단계는 C00 저장소 조사와 C01/C02 기술 선택·고위험 검증이다. 전체 46개 작업과 출시 검수는 완료되지 않았다.

현재 1단계 spike의 외부 위젯→AP first-party 브라우저 handoff를 보강·검증했다. 후속 단계의 제품 기능 구현은 사용자 단계 검토를 기다린다.

후속 1단계 기록 대조에서 `docs/technical/TECH_STACK.md`의 빌드 상태와 객체 테스트 버킷 상태, `docs/technical/ARCHITECTURE.md`의 미구현 rate limit·도메인 소유 검증 표현을 실제 범위에 맞춰 고쳤다. 코드 변경은 없었다. `/tmp/fieldai-report-venv/bin/python tools/check_package.py`를 다시 실행해 문서 패키지 검사 exit 0을 확인했다. 사용자에게 요청한 단계 검토의 답변은 아직 없다.

사용자가 로컬과 서버 환경 차이로 인한 과잉 로컬 검수의 효용을 질문했다. `docs/technical/C02_EXECUTION_PLAN.md`, `PHASE_1_REVIEW.md`, `DEVELOPMENT_STATUS.md`에 다음 단계의 서버 환경 조사→sandbox 검수 순서를 명시했다. 로컬 spike 14/14를 서버 적합성으로 해석하지 않는다. 목표 서버의 실제 플랫폼·OS·프록시·DB·백업 구성은 아직 확인하지 않았다. 이번 변경은 문서만이며 서버 접속·배포·새 서비스 테스트는 실행하지 않았다.

사용자는 최종 서비스가 `reference/field_ui_prototype_v3.html`의 디자인과 v3.0 문서의 기능·운영 기준을 충족해야 하며, 작업을 단계별로 완성한 뒤 결과를 확인하고 다음 단계로 진행하길 요청했다. `docs/technical/PHASE_1_REVIEW.md`에 C00·기술 선택·5개 최소 spike 결과를 정리했다. **다음 구현 단계는 사용자 검토 후 진행한다.** C01/C02 task 전체가 완료됐다는 뜻은 아니다.

## 완료·진행 작업

- C00: 초기 저장소는 문서·시안 패키지이며 Git, 서비스 코드, lockfile, migration, CI가 없음을 확인했다. 기존 문서·시안·ZIP과 관련 없는 Docker 자산을 보존했다. 외부 운영 자산 및 QA115/116은 미확인이다.
- C01/C02 진행: Node 24/TypeScript/pnpm, 제품별 Fastify·PostgreSQL, Better Auth, SQL migration 기반 workspace와 분리된 두 API를 만들었다. AP/Field의 자체 DB readiness와 AP 인증 라우트를 연결했다.
- 실제 로컬 PostgreSQL에서 AP와 Field 각각 별도 issuer의 OAuth authorization code + PKCE S256 + consent + scoped opaque token + introspection + revocation 흐름을 검증했다. 이 테스트는 합성 사용자/클라이언트/리소스를 쓴다.
- 두 서버를 별도 프로세스·포트·환경으로 띄운 실제 HTTP 검사에서 AP/Field 토큰을 각각 발급하고 상대 issuer의 introspection이 `active: false`를 반환함을 확인했다. 업무 API 권한 middleware까지 검증한 것은 아니다.
- AP `mock` 프로필에 별도 origin 위젯 loader/iframe, 설치 허용 origin, 일회용 대화 세션 nonce·handoff ticket 경로를 추가했다. Chrome에서 일반 외부 사이트 4381의 `상담 준비 완료`, 미허용 사이트 4382의 `ORIGIN_DENIED`를 확인했다. 같은 1단계에서 외부 위젯 버튼→AP 1차 도메인 `/embed/v1/received` 화면·새로고침과 DB 바인딩된 HttpOnly cookie까지 검증했다. 실제 대화·고객 접수 화면은 없다.
- AP `mock` 프로필에 대화 기술 검증 경로를 추가했다. 실제 PostgreSQL·HTTP에서 멱등 메시지 POST, SSE live/replay와 `Last-Event-ID` 복구, 사람 인계 후 오래된 AI commit 억제를 검증했다. 고객·사업자 권한과 실제 LLM은 없다.
- `reference/field_ui_prototype_v3.html`을 Chrome에서 열어 플랫폼/사업자/고객 및 모바일 시안을 확인했다. 화이트·밝은 회색·절제된 파란색, 역할별 화면, 사업자 첫 경로, 고객 사이트의 문의/예약/AI 경로를 UI 후속 기준으로 유지한다. 시안의 통합 계정·샘플 데이터·localStorage는 운영 구현 기준이 아니다.
- 실제 Field PostgreSQL에서 동일 자원·시간 예약의 동시 확정 두 건 중 한 건만 성공하고 occupancy/outbox가 한 건씩 생김을 검증했다. 현재 예약 로직은 `spike` 스키마 내부 함수이며 HTTP·권한·전체 도메인은 아직 없다.
- DB별 자격증명의 교차 접근 거부와 상대 DB를 중지한 상태의 기초 API readiness를 실행 검증했다. 완성 제품의 독립성을 증명하지는 않는다.
- 제품 간 직접 static import 차단 검사와 단위 테스트를 추가했다. 동적 import·전체 의존 그래프 검사는 남아 있다.
- `AGENTS.md`가 요구하는 정식 검수 명령 중 미구현 항목은 명시적으로 exit 2로 실패한다. `test:spike:*`만 현재 부분 검수다.

## 생성·수정 파일

- 문서: `TASKS.md`, `DEVELOPMENT_STATUS.md`, `docs/technical/{C00_INVENTORY,TECH_STACK,ARCHITECTURE,SPIKE_REPORT,C02_EXECUTION_PLAN,PHASE_1_REVIEW}.md`, `docs/adr/0001-independent-runtime.md`, 이 파일. TASKS 변경 후 마스터 Markdown과 HTML을 재생성했다.
- Workspace: `.gitignore`, `.node-version`, `.env.example`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `eslint.config.mjs`.
- AP: `apps/agent-api/{package.json,tsconfig*.json,src/{app,server,auth,embed,conversation-spike}.ts,migrations/{000001_auth,000002_embed_spike,000003_conversation_spike,000004_first_party_handoff_spike}.sql,test/{health,oauth.spike,embed.spike,conversation.spike}.test.ts}`. 이번 보강은 `src/{app,embed}.ts`, 새 migration, `test/embed.spike.test.ts`를 수정했다.
- Field: `apps/field-api/{package.json,tsconfig*.json,src/{app,server,auth,reservations}.ts,migrations/{000001_spike_reservations,000002_auth}.sql,test/{health,oauth.spike,reservations.db}.test.ts}`.
- 인프라·검사: `infra/{agent,field}/compose.mock.yaml`, `tools/{require-implementation,setup-mock-env,run-migrations,check-db-isolation,spike-independence,check-import-boundaries,verify-phase-1}.mjs`, `tools/test/import-boundaries.test.mjs`, `tools/check_package.py`, `tools/requirements-docs.txt`, `quality_checks/phase_1_execution.json`.
- 교차 issuer 검사: `tools/spikes/oauth-issuers.test.mjs`, 루트 `package.json`의 `test:spike:oauth:issuers`.
- 외부 설치 예제: `examples/external-site/index.html`, `tools/spikes/seed-embed.mjs`. `.env.example`에 `AP_PROFILE` 표기.
- 기존 제품 명세·계약·UI 원본은 수정하지 않았다. `TASKS.md`에 C00/C01/C02의 실제 상태를 기록했다.

## 핵심 설계 결정

- AP/Field는 별도 서버·DB·자격증명·migration으로 실행한다. 단일 monorepo 안에서도 제품 간 도메인/DB 코드를 직접 import하지 않는다.
- Better Auth OAuth provider는 JWT access token을 비활성화하고 opaque token과 introspection을 사용한다. 개별 token revoke 효력을 검증하기 위해서다.
- OAuth client의 resource 접근은 client 생성만으로 부여되지 않는다. 테스트에서 별도 `oauthClientResource` 연결을 관리자 역할로 합성 설정했다. 실제 조직·actor 승인 UI와 권한 모델은 미구현이다.
- 예약 중복 방지는 Field DB의 GiST exclusion constraint로 시작했다. 확정 상태, 점유, outbox를 한 트랜잭션으로 기록한다.
- mock DB 비밀값은 로컬 `infra/*/.env`에 무작위 생성하고 Git에서 제외한다. 실제 외부 연동 credential은 없다.
- 위젯 ticket은 URL query로 전송하지 않는다. 외부 AP iframe과 새 AP 탭은 정확한 origin/source의 `postMessage`로 ticket을 넘기고, 새 탭이 AP origin에서 JSON POST로 단회 소비한다. DB는 원 위젯 세션에 바인딩된 별도 first-party capability hash를 저장한다. mock 로컬 HTTP에서만 Secure 없는 cookie를 허용하며 production에서 mock profile은 부팅 거부된다.

## 실제 실행 검사와 결과

- `pnpm test:unit`: 성공. AP readiness·인증 라우트 전달, Field readiness, import boundary 단위 검사.
- `pnpm typecheck`: 성공.
- `pnpm test:spike:oauth:agent`: 성공. 실제 AP PostgreSQL migration과 2개 인증 흐름 테스트.
- `pnpm test:spike:oauth:field`: 성공. 실제 Field PostgreSQL migration과 2개 인증 흐름 테스트.
- `pnpm test:spike:oauth:issuers`: 성공. 실제 두 HTTP 서버에서 자기 토큰 active, 상대 제품 토큰 inactive.
- `pnpm test:spike:embed:agent`: 성공. AP PostgreSQL 허용/거부 origin, CSP, 세션 nonce 단회 사용, handoff ticket 만료·단회 사용, 다른 origin POST 거부, first-party cookie·원 세션 바인딩.
- `pnpm test:spike:conversation:agent`: 성공. 실제 DB/HTTP의 메시지 멱등, SSE live/replay, 사람 인계 후 AI commit 억제.
- Chrome 수동 검증: `AP_PROFILE=mock` AP API 4311, 합성 외부 사이트 4381/4382. 4381 iframe 준비·버튼 클릭→AP `/embed/v1/received` 표시·새로고침 유지, 4382 `ORIGIN_DENIED`. 검사 후 임시 API/사이트 서버와 Chrome 검증 탭은 종료했다.
- `AP_PROFILE=mock NODE_ENV=production node --env-file=infra/agent/.env apps/agent-api/dist/server.js`: 예상대로 exit 1. 정식 CI gate 전체는 미구현.
- `pnpm test:spike:db:field`: 성공. 실제 Field PostgreSQL 동시 예약 트랜잭션 테스트.
- `pnpm test:spike:db:isolation`: 성공. 각자 연결 성공, 교차 credential 거부 `28P01`.
- `pnpm test:spike:independence:agent` / `pnpm test:spike:independence:field`: 각각 상대 DB를 중지한 상태에서 성공. Field auth 추가 후 Field-only를 재검증했다.
- `pnpm test:spike:phase1`: 2026-09-24 10:18 KST 로컬 mock에서 14/14 부분 명령 성공. `quality_checks/phase_1_execution.json`에 명령별 exit code 기록. 정식 independence/E2E/security/외부 공급사 검사는 포함되지 않음.
- `/tmp/fieldai-report-venv/bin/python tools/build_report.py`: 성공. `TASKS.md`에서 마스터 Markdown/HTML을 재생성.
- `/tmp/fieldai-report-venv/bin/python tools/build_report.py`와 `tools/check_package.py`: 이번 `TASKS.md` C01 상태 갱신 후 다시 성공. 마스터 1370줄·134292 bytes, 문서 패키지 범위 46개 DAG/160개 QA/3개 JSON Schema 검사. 서비스 검사는 포함되지 않음.
- 외부 Kakao, 메일, LLM, 알림, PG, DNS/TLS, 객체 저장소와 종단간/보안/장애 정식 게이트는 미실행 또는 `blocked_integration`이다. Git 저장소/커밋이 없어서 commit ID 없음.

## 실패한 접근과 조치

- TDD 초기 구현 전 readiness/import/예약/auth 라우트 테스트는 의도대로 실패했고 구현 후 통과했다.
- OAuth 테스트에서 client 생성 HTTP 201을 200으로 예상했고, consent 요청 body의 `oauth_query` 누락 및 redirect 응답 형태를 잘못 예상했다. 실제 응답에 맞춰 수정했다.
- public client는 introspection을 수행할 수 없어 confidential BFF client로 검증했다.
- 등록 직후 client의 resource 사용을 기대했으나 `invalid_target`이 나왔다. 공식 문서대로 관리자가 resource 연결을 별도 설정한 후 검증했다.
- 문서 보고서 생성·검사는 초기 Python 환경에 `markdown_it`과 `jsonschema`가 없어 실패했다. `/tmp/fieldai-report-venv`에 `tools/requirements-docs.txt` 버전을 설치하고 재실행했다. 문서 검사기가 새 `node_modules`의 Markdown까지 따라가면서 실패한 문제는 생성물 디렉터리 제외로 수정했다.
- Field auth 추가 직후 독립 검사에 자체 auth secret/base URL을 누락하여 자식 서버가 조기 종료했다. 검사기의 종료 리스너 경합이 원인을 숨겨 exit 13이 발생했다. 제품 자체 설정만 전달하고 종료 대기를 생성 직후 등록했다. 상대 DB 중지 상태의 Field-only 재검사는 성공했고, 잘못된 base URL 음성 검사는 구체적 원인과 exit 1을 냈다.
- 실제 HTTP OAuth flow는 직접 `auth.handler` 호출과 달리 302 대신 200 `redirect` JSON을 반환했다. 교차 issuer 테스트가 처음에는 302를 기대해 실패했고, 실제 반환 계약을 확인해 JSON URL을 따라가도록 수정한 후 성공했다.
- AP embed 테스트는 라우트 구현 전에 404로 실패했고 구현 후 성공했다. 초기 embed 구현은 TypeScript의 배열 원소·정규식 캡처 nullable 오류로 빌드가 실패했으며 행/캡처 존재 검사 후 빌드에 성공했다.
- 대화 spike 테스트는 구현 전 POST 404로 실패했고 구현 후 성공했다.
- first-party handoff spike 테스트는 구현 전 `/embed/v1/received` 404로 실패했고 구현 후 성공했다. 초기 브라우저 form target 새 탭 POST는 Chrome이 `Origin: null`을 보내 AP의 origin 검사에 거부됐다. Origin 검사를 유지하고 AP 새 탭 자체에서 같은 origin POST하도록 바꿔 Chrome에서 성공했다.

## 남은 작업

1. 최소 기술 검증 5개는 모두 로컬 부분 spike를 수행했다. C01/C02의 조직/actor 동의, 실행 OpenAPI·consumer test, 제품별 큐·키·CI·복구 검수는 남아 있다. 외부 설치는 실제 대화·고객 접수·Field 설치·남용 방어까지 확대 전 여전히 부분 spike다.
2. 마스터 HTML의 브라우저 시각 검사는 현 환경에서 아직 미실행이다. 필요 시 `tools/check_report.py`의 Linux Chromium 고정 경로를 환경에 맞춰 설정해 검사한다.
3. C01 계약 실행 검수, C02 정식 독립 게이트, 이후 A/F/I/D/R 작업과 UI/API/DB/권한/이벤트/운영을 전부 구현·검수한다. 현재 구현을 출시 가능으로 표시하지 않는다.

## 다음 실행 명령

먼저 사용자에게 `docs/technical/PHASE_1_REVIEW.md`의 1단계 결과를 검토받는다. 다음 단계 승인 후 C01 실행 계약·권한, C02 인프라 격리를 `TASKS.md` 의존 순서로 시작한다. 아래 명령은 현재 로컬 부분 spike의 재검증용이며 정식 게이트가 아니다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm test:spike:imports
pnpm test:spike:oauth:agent
pnpm test:spike:oauth:field
pnpm test:spike:oauth:issuers
pnpm test:spike:embed:agent
pnpm test:spike:conversation:agent
pnpm test:spike:db:field
pnpm test:spike:db:isolation
pnpm test:spike:phase1
```

문서 재생성/검사는 `python3 -m venv /tmp/fieldai-report-venv`, `/tmp/fieldai-report-venv/bin/pip install -r tools/requirements-docs.txt`, `/tmp/fieldai-report-venv/bin/python tools/build_report.py`, `/tmp/fieldai-report-venv/bin/python tools/check_package.py` 순서로 실행한다.

로컬 mock DB가 중지되어 있으면 먼저 `node tools/setup-mock-env.mjs`를 실행하고, 각 제품에 대해 `docker compose --env-file infra/<product>/.env -p fieldai-<product>-mock -f infra/<product>/compose.mock.yaml up -d --wait`로 시작한다. DB를 중지하는 독립성 검사는 `tools/spike-independence.mjs`와 compose 이름을 먼저 읽고 타 서비스/자산을 건드리지 않게 실행한다.
