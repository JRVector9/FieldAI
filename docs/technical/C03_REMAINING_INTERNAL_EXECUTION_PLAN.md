# C03 잔여 내부 기능 — 병렬 실행 계획 (2026-09-27)

## 착수와 범위

- Objective: v3 문서의 내부 기능을 끝까지 연결하고 독립 로컬 환경에 반영한다. State: in_progress. 착수 HEAD75ec07d/status clean, 직전 goal turn은 코드/문서 commit과 실제 ready 확인으로 progress다.
- 완료 기준 원장: TASKS 상단44[x]/7[ ]. 기존 완료 범위를 기억 부재로 다시 만들지 않는다. 이번 미완료 세부 범위는 아래 네 개다.
- 디자인: reference/field_ui_prototype_v3.html 고정. 새 기능 이름만 `(추가)`. root가 중앙 등록·공통 화면 접점·runtime·Git·원장·인계를 관리한다.
- 외부 인증/MFA/LLM/PG/발송/DNS/TLS와 사용자 최종 화면/동선/실기기 검수는 후속이다. 실제 외부 청구·환불·고객 발송·운영 삭제/배포는 수행하지 않는다.

## 소유 파일과 충돌 방지

| 세부 작업 | Owner | 쓰기 범위 | Schema |
|---|---|---|---|
| A07.AI-ENTITLEMENT | delivery | AP 신규 ai-entitlement 모듈·agents/customer-consultations/usage 및 직접 관련 native 검사·전용 계획 | AP80 |
| F09.AI-ENTITLEMENT | root | Field 신규 ai-entitlement 모듈·site-generation/worker/usage 및 직접 관련 native 검사·전용 계획 | Field72 |
| A07.F09.BILLING-ADMIN-UI | custom_domain | 양웹 새 billing-admin component/client/CSS·새 전용 admin billing 조회 모듈/routes/검사(필요할 때), 전용 계획 | migration 없음; 필요하면 root에 요청 |
| I06.AUTH-LIFECYCLE | public_write | 양API 일반 OAuth/token/refresh family/legacy 회수·Field route key의 관련 자체 파일/검사·전용 계획 | AP81/Field73; 내용 변경 전 root에 요약 |

agents는 app/server/package, 기존 billing/refund/domain 모듈, 다른 범위 사용량/모델 파일, TASKS/인계/coverage/audit/이 중앙 계획, Git/runtime/env를 수정하지 않는다. API 중앙 등록/admin section 삽입은 필요한 정확한 patch를 root에 제출한다. migration 번호80/72와81/73은 서로 예약하며 적용 이전 파일만 수정한다. 실제 런타임 적용은 root가 한 번 통합한다.

## 요구/QA/게이트

- AP2.8·Field3.8: 명시 승인 플랜/불변 경제값·제품별 사용량·결제 기간·실적과 테스트 분리·한도/초과 보호.
- AP2.2/2.3·Field3.3: 승인 정보 모델 입력·자체 모델/큐·실제 소비·실패/미상/취소 후 복구. 공유 크레딧/peer DB 의존 없음.
- 보안5.4/5.5·연동4.3/4.11·QA43~46/113/126/146 및 관련 token 회수 QA: own session/org/Origin, 다른 승인자, 권한 변경/만료/회수 즉시 차단, 비밀값 미노출, 기존 업무/원본/고객 접근 보존.
- G-A1/F3/L1 및 실 인증/공급사 출시 게이트는 미검수/blocked_integration을 유지한다. 160개 QA 전체 통과를 주장하지 않는다.

## 실행/검수

1. 담당자가 원문 요구와 현재 소스를 읽고 전용 계획에 세부 ID/경로/실제 명령을 먼저 적는다.
2. 의미 있는 변경 사례를 own UUID PostgreSQL17/합성 provider 또는 좁은 web consumer로 실제 red→green 검수한다. 유료 승인 period/inflight/동시성·한도·실소비·실패해제·기간 종료/환불·중복·늦은 결과를 포함한다.
3. 수정 범위 typecheck/lint/build와 read-only 독립 CLI 검토를 진행한다. 실제 실패/수정/false positive/남은 미검수 및 raw confidence를 기록한다. 이미 완료된 무관한 테스트/전체 E2E는 반복하지 않는다.
4. root가 제출 patch/소유 파일을 통합하고 최종 type/lint·최신 build/migrate/managed 준비 상태를 확인한다. 같은 살아 있는 handle을 timeout만으로 재기동하지 않는다.
5. 실제 증거가 확보된 내부 세부 ID만 `[x]`로 기록하고 원장·각 계획·coverage·audit·인계/일지·생성 보고서·Git에 저장한다. 전체 목표/출시는 별도다.

## 현재 체크

- [x] AP AI entitlement와 승인 기간의 실제 모델 사용량 연결
- [x] Field AI entitlement와 작업 접수/worker 소비/복구 연결
- [x] 자체 관리자 가격/환불 검토/다른 승인 화면
- [x] 일반 OAuth/token/refresh family와 legacy/Field route key 수명/복원
- [x] root 통합·변경 검수·runtime 반영·완료 원장/인계/커밋

## 중앙 접점과 마지막 내부 대조 (2026-09-27)

- Root가 양 app에 관리자 read route를 각1회, Field app에 route-key lifecycle을1회 등록했다. 양 admin shell은 기존 billing 배치를 새 실제 원장 component로 바인딩하며 가격/환불 신규 기능만 `(추가)`다. Owner billing에는 기존 사용량 카드 안에 period quota row만 추가한다.
- Root central 경로 추가: 양 `business.ts` optional oauthLifecycleGuard, `integrator-auth.ts`의 실제 Bearer 직전 proof check, `server.ts` own guard 구성, 양 API package의 CLI/unit 명령, root package의 좁은 lifecycle 명령, `tools/mock-run.mjs` Field route-key worker 단일 등록. 일반 세션/native 회수/복구 API는 유지한다. 공급사 없으면 successful proof/발송/결제를 만들지 않는다.
- **Mock boot baseline 변경 전 범위:** 살아 있는 이전 전체 managed issuer/connector/worker 정지 확인 후 own migrate/API build 직후, 새 setup API보다 먼저 기존 journal 설정이 있는 own 제품의 lifecycle CLI `--baseline-quiesced`를 실행한다. 첫 signed cutoff/유효 opaque fingerprint는 유지하고 반복시 새 cutoff로 바꾸지 않는다. fsync-only intent는 persist/apply로 복구한다. 실패는 boot non-zero이며 설정 부재 skip은 검수 통과가 아니다. 운영 부팅/production 자동 baseline은 만들지 않는다. 기존 원문/토큰을 삭제하지 않는다.
- AP source와 관리자 source는 각각 담당자 clean 후 동결했다. delivery/custom_domain은 이후 AP/Field PRD 기능에 대한 읽기 전용 잔여 대조만 한다. 실 인증/공급사/최종 인수는 내부 누락으로 세지 않으며 완료 기능을 다시 구현·검수하지 않는다.

## 명령 계약

각 담당자는 먼저 `rg --files`로 실제 test/runner 경로를 찾는다. own UUID native runner는 다른 제품 .env/DB를 읽지 않는다. 중앙 검수는 `pnpm typecheck`, `pnpm lint`, `git diff --check`; runtime 반영은 현재43912의 terminal 종료 확인 후 `pnpm mock:run` 한 번이다. 문서 수정 후 `/tmp/fieldai-report-venv/bin/python tools/build_report.py`와 `tools/check_package.py`를 실행한다. 미실행 명령은 pass로 기록하지 않는다.

## 후속 내부 누락 — 읽기 전용 대조에서 확인 (2026-09-27)

이번 네 범위와 기존44[x]는 다시 만들지 않는다. 아래 세 범위는 source 변경/테스트 전이며 별도 실행 계획에서 소유 경로·요구/QA·명령을 먼저 기록한다.

| 세부 ID | 요구와 현재 근거 | 다음 최소 범위 |
|---|---|---|
| C03.AP-HOME-LINKS | AP-P01(PRD:124)의 외부 설치·요금 진입이 agent-home.tsx에 없음. deployments/subscription 자체 화면은 이미 있음 | 고정 홈 안에 기존 두 경로 진입만 추가. 새 결제/설치 구현 없음. 모바일에서 감춰지는 header nav만 쓰지 말고 기존 본문 스타일 안의 접근 경로도 유지 |
| F03.ALLOWED-FONT | Field PRD3.2:17의 허용 폰트가 sites.ts SiteContent/파서·site-editor·field-site DTO/렌더에 없음 | 허용 목록·초안/공개 JSON·기존 편집 패널 선택 `(추가)`·public 렌더. 플랫폼 디자인 변경 없음 |
| I03.SOURCE-SYNC-STATUS | Field PRD3.5:58/60. ap-source-refresh.ts는 stale/pending_review/current를 반환하지만 field-source-refresh.tsx는 revision만 표시, 공개 source DTO에 실제 syncedAt 없음 | 기존 패널 상태 표시 `(추가)`·실제 증거가 있는 nullable 동기화 시각의 공식 계약→consumer→구현 순서. 원본 복제/가짜 최신 시각 없음 |

delivery/custom_domain이 읽기 전용으로 대조했고 코드·문서·Git 수정이나 새 검수를 하지 않았다. owner 비공개 후보는 B10에 역할 요구가 없고 관리자 site_visibility_holds 동작이 구현되어 있어 확정 누락에서 제외했다. 실 인증/공급사·사용자 최종 UI/기기·전체QA/운영은 이 세 내부 누락과 별도다. 전체 목표 완료로 표시하지 않는다.


### C03.AP-HOME-LINKS — 최소 접점 착수

- Product/Owner: AP/root. State: in_progress. 요구 AP-P01, 공개 진입·AP 단독 경로에 해당한다. 변경 파일은 apps/agent-web/src/agent-home.tsx의 기존 본문 하단 안내 문단뿐이다. 현재 두 Next /workspace/deployments, /workspace/subscription page가 기존 AgentDeployments/AgentSubscription을 반환하며 해당 컴포넌트의 own 인증 API를 사용하는 것을 읽었다.
- 데스크톱에만 보이는 header nav/기존 CSS·배치·시안 원본은 수정하지 않는다. 기존14px 안내 문단 안에 실제 두 진입 링크 (추가)만 넣는다. 새 설치/가격/backend/로그인/구독 기능을 재구현하지 않는다.
- 검수: 정확 두 route source/anchor 확인, AP web type·중앙 최신 build, 좁은 읽기 전용 정적 검토. 가역적인 링크 변경의 구현을 그대로 복제하는 테스트는 쓰지 않는다. 최종 사용자 화면/클릭/기기는 사용자에게 남긴다.
- 실패 이력: 큰문장 apply_patch가 B10 표현 불일치로 verification 실패해 source 수정 없이 종료됐다. 실제 원문/Next route를 rg discovery로 읽은 뒤 이 범위를 기록했다. 추측한 src 없는 route 경로/agent-owner-sections 파일은 존재하지 않아 exit2이며 검수 pass로 기록하지 않는다.
- 좁은 독립 CLI42088 terminalexit0, `/tmp/c03-ap-home-links-review-result.md`: concrete P1/P2 없음/confidence0.94. 기존 own 인증 API를 사용하는 실제 두 destination·모바일 header가 없어도 남는 본문 진입·`(추가)`를 읽기 전용으로 확인했다. 테스트·브라우저를 실행한 것은 아니다. 최신 전체 type/build·runtime 반영은 후속이다.

## 중앙 최초 기동 실패 / 환경 전달 최소 보완

- 현재43912 실제 Ctrl+C terminalexit1을 확인한 뒤 새 managed31268을1회기동했다. AP migration/API build 후 compiled lifecycle CLI가 `AP_PROFILE` 명시 부재로 local-mock guard에 거부되어 terminalexit1. `/tmp/c03-ai-admin-lifecycle-managed.log`. Field migrate/web/API는 아직 실행 전이며 서비스 준비 완료를 주장하지 않는다.
- 수정 전 범위: `tools/mock-run.mjs`의 command helper에 optional environment를 받아 기존 baseEnv와 합치고, mock-only baseline 호출에 own AP/FIELD_PROFILE=mock만 명시한다. 기존 명령 default/production 금지/secret 보호는 그대로다. CLI guard를 완화하거나 .env의 비밀값을 출력하지 않는다. 새 source SQL/API/디자인 수정 없음.
- 검수는 syntax/scoped lint와 실제 compiled CLI·managed 전체 기동으로 한다. 실패가 non-zero로 전달된 것을 보존한다. 적용된 migration은 수정하지 않고, 현재 종료한31268은 timeout재기동이 아니라 이 재현 오류 수정 후 새1개만 시작한다.

## 중앙 적용 완료 — a974b90 (2026-09-27)

Root가 마지막 source의 whole type97507·lint58007 exit0 및 launcher최소repair scopedlint/syntax0을 확인했다. old43912 Ctrl+C terminalexit1, first31268의compiledCLI mockprofile 누락exit1을보존한다. 명시ownprofile전달 후 **managed83305** 최신 양API/webbuild·AP81/Field73마이그레이션·quiesced기준선·Fieldroute-keyworker local_reconciliation을반영했다. 실제runtime-evidence exit0: 양ready/workspace/admin200, 보호API401, AP SSR 두홈링크, ownbaseline각1·receiptAP3/Field1. controller35492/Fieldworker36190각1·같은parent 확인. 원장TASKS49[x]/9[ ]·인계/coverage/audit/phase에체크하고sourcecommit **a974b90**으로저장했다.

전체LLM/PG/MFA/발송/DNS/TLS·운영restore·전체E2E·사용자최종UI/기기/동선/출시는미검수다. 고정reference변경없음. source미상원장을초기화하거나새UUID재발송하지않는다. 적용schemaAP81/Field73은동결하고필요한추가schema만AP82/Field74부터조율한다. 재현한새오류없이는이미끝난집중검수/구현을반복하지않는다.

- [x] C03.AP-HOME-LINKS / a974b90: 기존 안내의 실제 두 진입·static42088·whole type/build·SSR 확인. 디자인/CSS/header변경없음.
- [x] F03.ALLOWED-FONT: 2362761 완료. ownPG171/1·API2/2·웹2/2, review .87. 세부 F03_ALLOWED_FONT_EXECUTION_PLAN.
- [x] I03.SOURCE-SYNC-STATUS: 2362761 완료. 공개preview.10→consumer·actualsnapshot시각, 계약2/2·웹2/2·ownAP/Field각1/1, review .88. 세부 I03_SOURCE_SYNC_STATUS_EXECUTION_PLAN.
- [x] I06.AUTH-LIFECYCLE.UI: 2362761 완료. 실제GET/명시POST·sessionfence·unknown원UUID·ownpending/cancelled복구, consumer+API9/9·ownPG171/1, finalreview .89. 세부 C03_FINAL_INTERNAL_UI_EXECUTION_PLAN.
- [ ] 실공급사·실운영·전체QA/사용자최종UI/기기/동선 인수는 부모/게이트 범위로 유지. latestmanaged54544·whole type10588/lint45330 exit0이며 이미 끝난 집중검수/구현을 반복하지 않는다.
