# 로컬 기능 검수 현황 — 2026-09-27

## 최신 AP·Field 재감사 보완 검수 — 2026-09-29

재감사 7건의 내부 구현을 PR 단위로 통합했다. AP는 오래된 미처리 문의/알림, 역할별 지식 편집·승인, 동명 서비스 snapshot을 고쳤다. Field는 희망시간 첫 예약, 시간표형 공개 준비 검증, 예약 ACK·고객 알림 상태 문구를 고쳤다. 제품별 E2E runner는 자기 제품만 준비 여부를 확인한다. 환불 DB/Node 시각 차이와 AP 불변 ledger fixture/계약 격리도 수리했다. 최신 코드 HEAD `fb07f42`이며 추가 브라우저/통합 장애/독립성 검수 실행기도 실제 화면·격리 조건에 맞췄다.

- Mac local own PG17: AP 전체 DB34파일136/136·DB34개 제거, Field 전체 DB31파일157/157·DB31개 제거. `pnpm test:unit`: AP API20/20, Field API25/25, AP web55/55, Field web98/98, tools35 pass/2 platform skip. `pnpm test:contracts`: 정적3/3 및 AP3/Field2 격리 DB 파일, DB5개 제거. runner process13/13, E2E 선행조건5/5, lint/typecheck·양 API/web build exit0.
- **Field 전체 브라우저 E2E 7/7 pass** (`/private/tmp/fieldai-field-e2e-all-final3-20260929.log`): AP 미기동 상태에서 첫 가입→사이트 공개→문의·두 예약, 자동 저장, 관리자 권한, 신고·지원 접근, 보존 흐름을 실제 Chromium으로 실행했다. **AP E2E 8/8**, **매체 연동 2/2**도 통과했다(`/private/tmp/fieldai-ap-e2e-final-20260929.log`, `/private/tmp/fieldai-distribution-e2e-20260929.log`). `pnpm test:integration:faults` 정적3/3·AP3/Field2 격리 DB·HTTP1/1 pass; `pnpm test:security` 최초 Field AI 제공량 DB 연결 종료로 exit1 후 같은 파일 단독 및 전체 재실행 exit0(`/private/tmp/fieldai-security-rerun-20260929.log`). 상대 제품 서비스·DB container/port를 실제 중지한 `pnpm test:independence:field`와 `:agent`도 각 own 사업자/고객 Chromium 1/1 포함 exit0(`/private/tmp/fieldai-independence-field-20260929.log`, `/private/tmp/fieldai-independence-agent-20260929.log`). 두 mock 환경을 이후 ready 상태로 복구했다.
- 기존 아래 “최신 Field 첫 사용 사후 감사”의 환불 전체 DB 실패는 **이 보완 전의 이력**이다. 현재 전체 Field DB는 157/157 pass다. 실 모델·결제·고객 발송·도메인/운영·접근성·사용자 최종 인수는 여전히 미완료다.

## 최신 Field 첫 사용 사후 감사 — 2026-09-29

PR5 `2bd2898`의 첫 사용 서비스/목록/권한/체험 안내와 PR6 `1e290b9`의 공개 제한 ownerTest 서버 차단을 구현했다. Field 웹92/92·표적 ownerTest 격리 DB1/1·root lint/typecheck·Field API/web build는 실제 exit0. 최종 `pnpm test:db:field`는 31파일 실행·임시 DB31 제거 중 **3파일 실패(exit1)**: AI 제공량의 전액 환불, billing lifecycle 환불, billing refund 파일이다. 환불 worker의 `empty`/`blocked_integration` 및 180초 test timeout 원인은 미확정이므로 최신 Field 전체 DB 검수를 통과로 표시하지 않는다. 이전156/156은 과거 시점 증거다. 상세 로그/남은 게이트는 `FIELD_FIRST_USE_AUDIT_FOLLOWUP_2026-09-29.md`와 `CODEX_HANDOFF.md` 최신 상단을 따른다.

## 사용자 신고 스타일 보완 — f1f4f0a (2026-09-28)

F02.EDITOR/F04.BASIC-PUBLISH의 실제 디자인 단계에 CSS가 없다는 신고를 원본 v3 wizard와 대조했다. 사이트 wizard4단계·실제 상호 기반 template3개 카드·usage/subscription 버튼·booking 하단 카드/폼·catalog 승인 버튼을 scoped 보완했다. 기존52개[x]/7pending과 완료 API/DB/schema/공개 사이트/pages 레이아웃은 유지한다.

- 실제 `pnpm --filter @fieldai/field-web exec tsx --test test/site-editor-design.test.tsx`: 최초 module 부재 exit1(`/private/tmp/fieldai-design-red.log`), 구현 후3/3 exit0. 실제 상호 escaping/단일 선택/빈 상호 fallback와 pages direct-child 보존을 검사한다.
- 실제 `pnpm --filter @fieldai/field-web test:unit`:76/76·fail0/skip0 exit0(`/private/tmp/fieldai-design-unit.log`), 허용 font/image/editor-preview 등 기존 검사 포함. `typecheck` exit0(`fieldai-design-typecheck.log`), root `pnpm lint` exit0(`fieldai-design-final-lint.log`), `pnpm build:web:field` exit0(`fieldai-design-verified-build.log`), `git diff --check` exit0. Node24.18.0/Next16.3.6/Mac local mock, 소스 commitf1f4f0a.
- 실제 Chrome CUA: 사용자 exact design URL·business/contact/publish/pages·usage/subscription/체험영역·workspace today/inbox/services/notifications/more/domain 확인. DevTools 실제 width320/390/768/1440에서 design 단계의 카드/메뉴 배치 확인. 사업 초안revision1·사이트초안revision0·미승인/미공개/체험미시작을 유지했고 입력/저장/승인/공개/체험/예약/다운로드는 실행하지 않았다. screenshot은 도구 transcript 증거이며 PNG 파일 보관이나 수치 overflow 측정은 아니다.
- 최종 booking/catalog scoped CSS의 시각 재확인과 integrations 정상 재확인은 Chrome `cgWindowNotFound`·Chrome/IAB unavailable로 미실행이다. integrations의 일시 CSS 미로딩 화면은 running Next build 교체 중의 관찰이므로 실제 제품 디자인 결함으로 체크하지 않았다. 최종 재기동 후 해당 route200 및 새 compiled CSS를 실제 GET 확인했다. design console404두 건은 승인 catalog/공개 site 부재에 대응하며 pageerror0 주장하지 않는다.
- 실제 Python read-only 검사 exit0(`/private/tmp/fieldai-design-verification.json`): 변경 전후3개 컴포넌트의 state/API handler prefix 동일, 양 ready200·site/usage/subscription/integrations200, 제공CSS1파일에서 template/wizard/account/booking/catalog 새 규칙 존재. latest managed10995/controller95568의 양제품 정상ready 확인. 이 검사는 브라우저 시각·DB 원장/실공급사/모든 역할·QA160 통과를 대신하지 않는다.

실제 실패/복구/잔여와 정확 명령은 F02_EDITOR_DESIGN_REPAIR_EXECUTION_PLAN 및 CODEX_HANDOFF 최신 섹션을 따른다.

## 현재 내부 완료 checkpoint — 2362761 (2026-09-27)

기존49개 완료 유지, **TASKS52[x]/7[ ]**. 남은 확정 내부3범위 F03.ALLOWED-FONT / I03.SOURCE-SYNC-STATUS / I06.AUTH-LIFECYCLE.UI를 완료했다. 새 상태 표시는 실제 API/원장 값이고 추가 기능만 `(추가)`이며 원본 reference와 기존 플랫폼 CSS는 변경하지 않았다.

- 허용폰트: own Field PG171/1·API2/2·웹2/2. 초안→명시공개→불변릴리스→복구·legacy AI 선택 보존/임의CSS 거부. review .87 clean.
- source상태: 계약2/2·웹2/2·own AP/Field PG17각1/1. snapshot 현재버전 실제수신만 syncedAt, legacy null·잘못된DTO502. review .88 clean.
- key UI: 웹consumer+ownAPI session fence9/9·ownPG17 route-key GET1/1. unknown 원UUID, 현재owner 서버pending UUID·정확한 cancelled receipt 이후 재확인 새UUID. 첫P2 .94/.91 보완, 마지막 .89 clean.
- whole type10588/lint45330 exit0. managed54544 양API/web build·ready200, AP workspace/Field workspace·site·integrations200, 보호source/key401. controller42202/worker44583각1/같은parent. AP81/Field73 유지·새schema없음.
- 추가 read-only 최종 누락 대조에서 이번3개 밖에 새 확정 내부 기능 누락은 없었다. 실행/전체QA160 통과를 뜻하지 않는다. 실공급사/실운영·사용자최종 화면·동선·기기·320px은 별도7부모/게이트 범위다. 전체Task46 verified/상용출시 완료 아님.
- 실제 실패·명령·변경경로·복구는 C03_FINAL_INTERNAL_UI_EXECUTION_PLAN / 각own phase / CODEX_HANDOFF 상단. **아래 checkpoint와 다음작업 문구는 당시 이력이며 현재 작업을 다시 여는 근거가 아니다.**

## 이력 — 내부 완료 checkpoint a974b90 (2026-09-27)

TASKS 상단 **49[x]/9[ ]**가 기준이다. 기존44[x] 유지 후 AP/Field AI 제공량·관리자 구독/청구·일반 OAuth/Field key backend·AP 홈 진입5범위를 추가했다. 디자인 reference/field_ui_prototype_v3.html은 고정하며 신규 요소만 `(추가)`다. 사용자 최종 화면/기기·실 공급사·전체QA/출시는 미검수다.

- AP entitlement own PG17 14/14 + adapter2/2, Field15/15. knownusage/period quota·owner test 분리·unknown/latecost·refund/grace·legacy/source삭제를 연결했다. 독립 AP .87/.92, Field .90 clean. 마지막 Field15에는 실제 Field 관리자 SQL/redaction/allowedoverview 감사도 포함한다.
- 관리자 양웹12/12·중앙양API4/4·AP actualSQL1/1, sessionfence·동일 요청 복구·멀티라인조건을 검수했다. final69462 P1/P2 없음/.91. 기존 고정집계 배치와 backend를 사용하며 가격/환불 신규 기능만 `(추가)`다.
- 일반 lifecycle own AP11/11·Field12/12: token/family·currentowner/lateissue·snapshot삭제·signed cutoff·actual backup/별도restore·originalroute 조정 후 key 폐기·동시 lock 순서·missing proof503. final39658 clean/.84. 첫 review의 nativeactive 주장만 기존trigger 증거로 falsepositive, 새provider200 경계와 실제두발견/교착은 red→green 보완했다. 기존native 완료 파일은 유지했다.
- AP 홈은 기존 안내 문단의 두 링크만 연결했다. static42088 clean/.94, 최신 SSR의 실제두 anchor 확인. CSS/header/reference 변경없음. 클릭/화면/기기 실행검수 아님.
- 중앙 `pnpm typecheck`97507/`pnpm lint`58007 exit0, scoped mock-profile repair lint/syntax exit0·git diff check0. managed83305 최신 양API/web build·AP80/81와Field72/73 실제적용·compiledquiescedbaseline 성공·양ready/workspace/admin200·새보호API401, Field routekeyworker local_reconciliation1개/동일parent. logs /tmp/c03-ai-admin-lifecycle-{managed-repaired,runtime-evidence,process-evidence}.log.
- 실패 보존: old43912 Ctrl+C exit1, first31268 APCLI에명시mockprofile 누락으로 exit1. CLIguard를완화하지않고런처의own profile전달만수정하여83305 기동완료. Field미적용부분을그첫실패에서통과라고기록하지않았다. 공급사/모델은blocked_integration, 실제청구·환불·발송·DNS·운영삭제/배포없음.
- **현재 내부 다음:** Field 허용폰트·AP source의 실제sync 상태/시각 공식계약·기존 연결의route-key 상태/명시close UI. parent외부/최종인수와분리한다. 상세 file/요구/QA/실패/정확 명령은 C03_REMAINING_INTERNAL_EXECUTION_PLAN 및 CODEX_HANDOFF 상단. 이미적용AP81/Field73와이전migration 수정금지, 다음schema AP82/Field74는필요시Coordinator예약.


## 이력 — 내부 완료 checkpoint 5ceec42 (2026-09-27)

TASKS 상단 **44개[x]/7개[ ]**가 기준이다. 디자인 원본 reference/field_ui_prototype_v3.html은 그대로 유지하며 시안에 없는 기능만 `(추가)`다. 완료 기능을 기억 부재로 재작업하지 않는다.

- [x] **A07.F09.BILLING-UI-CALLBACK** 양제품 고정 구독 카드의 승인 플랜/조건·명시 동의·현재 구독/기간·갱신중지·결제/환불 요청/조회, own SDK callback 페이지·URL secret 제거·원래 user/session/org/origin/nonce/customer binding, unknown 같은 UUID/body·context별 재시도와 늦은 화면/SDK 응답 차단. 코드 **5ceec42**, 양웹 billing client/mutation/return/settings·subscription·callback headers와 billingSnapshot currentPlan. focused web 양 **23/23**(callback12+mutation11), 판매중단 원조건 유지 own PG17 각1/1, whole type73437/lint91115 exit0, 최종 root repair2382 P1/P2 없음/confidence0.94. **admin 가격/환불 UI·AI 제공량 강제·실 SDK/PG·사용자 최종 화면/동선 인수는 제외**한다.
- [x] **A07.F09.REFUND-DECLINE.BACKEND** owner 요청→operator 검토→다른 승인→own durable 환불 worker·원 거래/부분합계·unknown GET-only/동일 provider 증거·설정/권한 변경 차단·확정 최초청구 거절과 과거unknown 구분. 코드 **5ceec42**, AP79/Field70·refund/Toss/charge 모듈 및 package/managed worker. own UUID PG17 AP39861/Field3173 각11/11·adapter각2/2, static58435 noP1/P2/confidence moderate(수치없음). 새 guard로 기존 lifecycle fixture 직접UPDATE가 PAB06/PFB06 red인 것은 정당한 요청/검토/다른승인/합성worker 원장으로 보완해 단일case 각1/1 green61750/99164, 원래 접근제한 기대값 유지. **실환불·MFA/법무·admin UI·전체QA/G는 제외**한다.
- [x] **A06.F08.CUSTOMER-CONSENT-PUSH.INTERNAL** 현재 확인키 고객 채널 동의 GET/선택·무번호 재입력 철회·rotation/purge/Org lock 재검사·Field 예약/자체 공개host Origin·같은 source receipt 실패한도, own ServiceWorker/manifest·실제 브라우저 등록/permission/subscription 호출 경로·unknown 구독 유지와 외부SW 충돌 차단. 코드 **5ceec42**, 양API delivery/receipt guard·customer/owner component·push client·public assets·Field proxy/layout. own UUID PG17 AP5/5·Field6/6, owner keyless actualOrigin각1/1, browser model/SW VM각9/9, static96633 noP1/P2/confidence0.88. **실기기 설치/권한/수신·실발송·최종 사용자 인수는 제외**한다.
- [x] **A09.PUBLIC-WRITE.FIELD-BFF-UI** Field own durable intent/원 UUID·If-Match·pending/unknown 복구·explicit 설치 purpose/scopes/현재 owner/org/session·새 SDK 승인·local pause/revision 경쟁 차단·조직별 선택/legacy resolver 분리와 고정 기존 설치 화면. 코드 **5ceec42**, 최종 Field71(미적용72에서 본문동일 rename)·ap connector/BFF/site resolver/component·새 own runner/HTTP consumer, mock client 등록 가능scope만 추가(기존grant 자동확대 없음). native13971 **14/14**·actual Field↔AP HTTP5557 **1/1**·UI tenantconsumer95035 **1/1**, repair97931 noP1/P2/confidence0.88. **실DNS·새 설치 purpose의 browser OAuth·전체 호환/최종 인수는 제외**한다.

- 최신 공통 gate: whole type73437/lint91115 exit0, managed43912가 양API/web 최신 build·AP79/Field70+71 migrate·ready200/양웹200을 실제 확인했다. callback200/no-referrer/private no-store, 새refund/설치API unauth401, own controller26830와 환불workerAP30020/Field30087 각1개/같은parent를 확인했다. logs: /tmp/fixed-design-new-functions-{managed,runtime-evidence,process-evidence}.log. provider/model/domain/push 미연결은blocked_integration이며 실제 청구/환불/고객발송/운영배포/삭제 없음.
- 현재 내부 남음: AI entitlement/기간 제공량·admin 가격/환불 화면, 일반OAuth token/refresh family·legacy/Field routekey. 실제 외부·운영 QA/G·새OAuth browser·모든역할/320px/접근성/사용자 최종 화면·동선은 미검수다. 전체 부모Task/서비스 출시 완료가 아니다.
- 정확한 다음: TASKS 상단과 CODEX_HANDOFF 최신 항목 읽기→git status/log→미완료ID의 파일/요구/QA/명령 기록→기존own model-budget/agents/customer-consultations 및 Fieldsite-generation/usage 대조. AP80/Field72는 새배정이고 기존AP79/Field70/71은적용되어 변경금지. managed43912는동일handle을poll하며 필요없으면재시작하지않는다.


## 이력 — 내부 완료 checkpoint ef0dfd3 (2026-09-27)

TASKS 상단 **40개[x]/7개[ ]**를 따른다. 고정 디자인은 reference/field_ui_prototype_v3.html이며 시안에 없는 기능만 `(추가)`로 표시한다. 원본 시안은 수정하지 않았다. 완료 backend/화면을 기억 부재로 다시 만들지 않는다.

- [x] **A07.F09.RENEW-CANCEL-ACCESS.BACKEND** 원래 KST 기준일의 다음 한 기간 갱신·고정grace/worker 부재 시간 제한·owner/current session/org/Origin/UUID 해지·실제 send/cancel 직렬화·알려진 미발송 취소/unknown 대조·paid/grace/cleanup 접근·기존 업무/export 보존. 코드 **ef0dfd3**, AP73/76·Field67, 각 subscription-access/lifecycle/charge/consent/subscription/trial 모듈·native 검사. own UUID PG17 **70963/78883 각29/29 fail0/skip0 exit0**, 직접 관련 최초청구11 포함, 최종 정적65770 P1/P2 없음/0.87. **확정 HTTP거절·provider 환불·AI 제공량·SDK/결제 UI·실PG는 제외**한다.
- [x] **A06.F08.DELIVERY.INTERNAL** 제품별 encrypted 동의/recipient·durable worker/lease/order/일일 시도 cap·unknown GET 대조/중복 방지·단일 알림 주체·확정 실패/명시 동의 SMS fallback·webpush port/404·410 회수·retention ciphertext 정리·owner 자기설정/철회·기존 이력 보존 UI. 코드 **ef0dfd3**, AP74/78·Field68·notification 모듈/검사·양관리실 component/CSS. own UUID PG17 각13/13+추가 설정/권한 각3/3, adapter 각5/5 exit0; backend7649/0.90·UI39859 재검토 P1/P2 없음. **고객 채널동의 UI/서비스워커·실발송·실기기/최종 화면 인수는 제외**한다.
- [x] **F04.CUSTOM-DOMAIN.INTERNAL** 조직별 주소 등록/소유 TXT·DNS·trusted TLS/Host/site binding·짧은 증거 TTL·대표주소/기본주소 유지·disconnect/reconnect/release generation·own Host tenant/resource/확인키·AP 정확 origin별 설치/증명 보존·고정 시안 주소 UI. 코드 **ef0dfd3**, Field69·custom-domain 모듈/worker/검사·sites/Host/proof·domain-settings. 정상 createFieldApp own UUID PG17 **40510 11/11**, DNS2/2·Host3/3 exit0; 정적11413 P1/P2 없음/high(숫자없음). **실edge/DNS/TLS 공급사·실AP custom origin·사용자 최종 시각/동선 인수는 제외**한다.
- [x] **A09.PUBLIC-WRITE.CONTRACT-BACKEND** preview.9 공개 connection/deployment POST·명시 scope/actor/org/선택AI/exactorigin·UUID/If-Match·own client 배포 verify/activate/pause·selection 회수/늦은 활성화 차단·Field 공개 HTTP consumer·새scope 동의 설명. 코드 **ef0dfd3**, AP75/77·auth/integrator/public write·Field client·OpenAPI/계약03·permanent runner/native HTTP 검사. **66327 AP7/7**, Field5/5·실OAuth/HTTP83629 1/1·계약1/1 exit0; 정적66741 P1/P2 없음/0.91. **새Field durable intent BFF/화면·실DNS·최종 인수는 제외**한다.

- 공통 실제 검사: 전체 typecheck50703·lint12958 exit0. managed95896 최신 양API/web build·AP78/Field69 migrate·양ready200/양웹200·새API401·제품별 자체worker ready. logs: /tmp/parallel-fixed-design-managed-runtime.log·runtime-evidence.log·process-evidence.log. root UI 정적6407 P1/P2 없음/0.86. C02.LOCAL 추가 migration guard 실제canary6/6 exit0; 기존 완료 체크 유지.
- 현재 내부 미완료: 확정HTTP거절/환불/AI제공량/SDK·결제UI, 새Field durable public-write BFF/UI, 고객채널동의UI/서비스워커, 일반OAuth 수명/legacy/route key. 실 공급사/QA/G·최종 사용자 화면/동선/실기기는 별도 미완료다. 전체 부모 Task/출시 완료가 아니다.
- 실패·복구·정적리뷰와 실행된 테스트의 구분·정확한 다음 명령은 CODEX_HANDOFF.md 최신 통합 항목을 따른다. 적용73~78/67~69는 덮어쓰지 않으며 다음schema번호는 실제상태 확인 후 AP79/Field70부터 예약한다.


**이력 — 이전 완료 원장:** TASKS 상단 내부36개[x]/7개[ ]를 따른다. WIDGET-END·PLAN-BASIS·CONSENT-BACKEND·AUTH-ISSUE·FIRST-CHARGE(00c3e0d)는 완료 범위다. PAID 갱신/해지/유예·환불/제공량·접근제한·SDK/UI와 전체QA/실 공급사/최종 인수는 미완료다. 아래 과거 “남음/다음/runtime”은 당시 이력이며 최신 원장/인계가 우선한다.

**2026-09-27 완료 표시 점검:** paid/phase 계획에 남아 있던 완료 동의·fixture 실행·최초 거래/동일 주문 복구·설정 부재/기존 runtime 반영 체크를 위 세부 ID/commit과 현재 소스·기존 검수 로그에 맞췄다. 완료와 미완료가 섞인 항목을 분리했고 SDK callback/갱신/해지/환불/제공량/UI는 미완료로 유지했다. 기존 테스트 결과를 확인한 문서 점검이며 서비스 테스트 재실행/새 기능 완료 추가는 없다. TASKS의36[x]/7[ ]를 유지한다.

## 최신 A07.F09.FIRST-CHARGE — 00c3e0d / 최초 청구 내부 완료 (2026-09-27)

- AP72/Field66·각 charge-execution/worker/native 검사·billing/routes/consent tax 확장·Toss fingerprint/adapter 검사·package·managed 시작·PG 설명/착수 기록24파일. 먼저 period0/transaction/order/request를 저장, 첫 claim에 MID/key fingerprint/고정본문/암호화 billingKey/원래 started_at을 commit한다. 응답 유실은 동일 order GET, 없음 때만 원래 키/본문/멱등창으로 재시도. 키 회전·멱등창 종료2분 전에는 POST 중지/GET 대조 유지, stale claim은 폐기한다.
- 명시 승인 taxFreeAmount만 charge 가능하며 미지정 legacy 가격/동의를 자동 채우지 않는다. 추가값이 없는 이전 idempotency digest는 그대로 복구한다. 실제 원격 DONE의 order/금액/잔액/세금/승인시각 검증 후 첫 기간을 approvedAt+KST 한 달로 확정, paymentKey 암호화와 원장 불변/기간 overlap을 유지한다. 조회된 ABORTED/EXPIRED만 해당 시도 실패 확정. 다른 HTTP 오류는 unknown이며 확정거절/유예·환불/제공량은 후속이다.
- 실제 명령 `node /tmp/ap-billing-charge-run-db.mjs` **97718**, Field equivalent **12549 exit0 각12/12 fail0/skip0** /tmp/{ap,field}-billing-first-charge-final-db.log(새11+관련consent1). 새 파일/각 fixture 별도 UUID PG17, 원래 승인 전 날짜null·paid 한 번·no provider/no tax/stop·동시/만료 lease/stale 결과·응답유실 동일order·키 변경/15일창·금액/날짜 불일치·legacy replay·paid-date/overlap23P01/인접/날짜nullpaid23514·ABORTED를 확인했다. 공급사/auth는 synthetic fixture다. 실제 카드/PG/SDK/UI 증빙이 아니다.
- 실제 adapter `tsx --test test/toss-billing.adapter.test.ts`4250/90058 각3/3(기존2+key fingerprint1), API type34206/18899·lint35728·API build20074/26601 exit0. 최초 native59091/24938 worker부재/면세 미반영 각8 red, port fingerprint 부재 각exit1→위3/3. 90235/12812은 이전 fixture의 미처리 구독이 다음 fixture에서 선택된 blocked red라 새 worker 파일의 각 fixture DB를 추가 격리했다. old checkout digest67416/91857 409≠200 red→항목 없는 legacy digest 보존. 테스트 기대값을 버그에 맞추지 않았다.
- CLI26858 gpt-6-sol/high exit0 /tmp/billing-first-charge-audit-result.md: No concrete P1/P2 findings, confidence0.82. static/read-only·자체 tests/실 공급사 호출/수정 없음. 실제 root12/12와 구분한다.
- 새 managed65775 /tmp/billing-first-charge-managed-runtime.log 양제품build/migrate/ready·양웹200·각 first charge/auth worker ready(blocked_integration)·retention ready. own DB AP000072/Field000066·명시tax/nullable dates/transaction binding11열을 실제 조회했다. controller40439 하나/각 auth42742·42793/firstcharge42743·42794 하나씩 동일parent40439 snapshot. 이전48041은 실제live 확인 뒤 Ctrl+C terminalexit1/ELIFECYCLE로 종료 관찰, 정상0이라고 기록하지 않는다. 적용/커밋72/66 수정 금지·다음 schema73/67. 실 PGkey/가격승인/청구/발송/운영삭제/배포 없음.
- TASKS36[x]/7[ ]이며 FIRST-CHARGE 내부만 완료다. 다음 갱신/해지/유예·HTTP 확정거절 분류·환불/entitlement·SDK callback/owner/admin UI, 전체QA/G/실 공급사/사용자 최종 시각 인수는 계속 미완료다. 이전 기간/키/unknown을 초기화하거나 fake paid로 rollback하지 않는다.

## 최신 A07.F09.AUTH-ISSUE — ed61b70 / 인증 발급 worker 내부 완료 (2026-09-27)

- AP71/Field65·각 billing-authorization-execution/worker·새 native 검사·package start·managed runner·PG 설정 문서13파일. org→구독/인증 잠금, 공급사 호출 전 첫 started_at/120초 lease/claim을 commit한다. 미상은 원래 request_key/authKey/customerKey로만 재시도, 15일 창 종료1분 전부터 자동 발급 중지, 이전 claim의 늦은 결과 폐기. 성공 credential은 제품/구독 purpose AES-GCM이며 일회용 ciphertext를 폐기한다. started_at 불변/시작한 원장 pending·blocked·canceled 환원 차단. 설정 부재/변경 때 미시작 blocked, 시작한 요청 unknown. 구독 active/paid나 카드 청구를 수행하지 않는다.
- 실제 명령: `node /tmp/ap-billing-authorization-run-db.mjs` **6174**, Field equivalent **91110 exit0 각9/9 fail0/skip0** /tmp/{ap,field}-billing-authorization-final-green.log. 새8+직접 관련consent1, 서로 별도 UUID DB에 병렬 실행. worker 자체 CLI --once도 own test DB에서 ready(blocked_integration)/empty exit0. 공급사/계정은 synthetic fixture이며 실 PG/auth/UI evidence가 아니다. 자기 UUID DB만 정리했다. 기존 AP29/Field30·전체QA를 합산하지 않는다.
- 최종 type `pnpm --filter @fieldai/agent-api typecheck`31179 / Field46800, `pnpm lint`49686, `pnpm build:agent`75046 / Field34309 exit0. 최초 worker 부재99942/27952 각6 red, 테스트 tuple type92764/22082 exit2, 같은 DB 병렬 건수21956/48407 exit1을 수정했다. 기존 완료검사의 기대값을 바꾸지 않고 새 파일에 별도 UUID DB를 마련해 최종 병렬9/9로 확인했다.
- 독립 review92981 exit0/P2 1건·raw confidence0.88: 설정 부재/변경 때 만료된 미시작 auth ciphertext를 계속 보존. native95293/67597 blocked≠failed red 후 만료 판단을 설정보다 먼저 처리했다. 최종 repair79675 exit0/남은P1·P2 없음/confidence0.88. 두 검토는 read-only/static이며 자체 테스트/실 공급사 호출/수정 없음.
- runtime: 살아 있는73001 확인 뒤 Ctrl+C terminalexit1/ELIFECYCLE을 관찰했고 정상exit0로 보고하지 않는다. 최신48041 /tmp/billing-authorization-managed-runtime.log 양제품build/migrate/ready·각 인증 worker ready(blocked_integration)·양web200. 실제 own DB AP000071/Field000065/claim_token/next_attempt_at 조회, controller72041 하나와 자체 인증 workers76804/76841 각각 하나/동일parent를 확인했다. 기존71/65는 적용/커밋됐으며 다음 schema는72/66. 실 PG키는 넣지 않았다.
- TASKS[x]는 인증 발급/미상 복구 내부 범위만이다. 첫 청구·같은 주문 결과 조회·갱신/해지/유예·환불/entitlement·실 SDK callback/owner/admin UI·실 PG/최종 사용자 인수는 남는다. 이미 완료한 가격/동의/발급 worker를 다시 만들지 않는다.

## 최신 A07.F09.CONSENT-BACKEND — 코드1a04815 / 인증 대기 backend 완료

- AP70/Field64·각 own consent/context/Toss modules·business/app/server/subscription·package unit 등록·새 native/adapter 검사를 TASKS[x]로 체크했다. owner/current session의 승인 경제값/약관/갱신/첫 승인 시각 정책 동의→UUID복구·org/actor/session/mode/MID/nonce/TTL binding·암호화 authKey pending202·미시작 cancel/secret 폐기. 실제 인증 발급/청구/worker/SDK웹 UI는 아직 없다. pending을 결제 성공으로 주장하지 않는다.
- 실제 own UUID PG17 **84322/76016 exit0 각3/3 fail0/skip0**, /tmp/{ap,field}-paid-consent-final-db.log. 새consent1+유료stub 이동과 직접 관련된 기존trial2만 검사했다. 공급사 fixture port/config의 static import unit 각2/2(/tmp/{ap,field}-toss-static-green.log). 실제 mutation은 synthetic fixture DB에서만 했고 자기UUID DB만 정리했다. root 전체 unit/DB/E2E·실 공급사/UI/QA/G는 미실행이며 이전 전체 AP29/Field30을 합산하지 않는다.
- 마지막 API type25047/75781·lint58419·build62281/60371 exit0. native23026/27493 503≠201·MID6029/31312 202≠409·provider/context 부재 red를 실제 수정했다. 감사92527 gpt-6-sol/high exit0: No concrete P1/P2 defects found. raw confidence 미출력·static/read-only이며 자체 테스트 미실행.
- 최신 managed73001 /tmp/paid-consent-managed-runtime.log에 build/migrate/양API ready·양웹200·신규 API 무인증401·양 retention worker를 확인했고 own DB의 AP000070/Field000064·binding4열을 실제 조회했다. 53591은 Ctrl+C 뒤 terminalexit1/ELIFECYCLE(정상0으로 보고하지 않음)이며 현재 controller74228·자체 worker75278/75296 한 개씩의 snapshot으로 중복 부재를 확인했다. 기존70/64 수정 금지·다음 schema71/65. PG키 부재 checkout503·제작 LLM blocked는 계속 유지된다.

## 최신 A07.F09.PLAN-BASIS — 코드 b639a4d / 내부 저장 기반 완료

- 제품별 AP69/Field63·billing-routes/billing/billing-period·app 등록·native DB/calendar 검사·package unit 등록. 가격 요청/다른 operator 승인/retire·승인 불변·own 최근100 billing 조회·plan과 consent 경제/약관/제공량 binding·기간 유일/겹침 차단·KST 월말 계산을 완료했다. owner 명시 유료 동의나 결제 성공을 구현/검수했다는 뜻이 아니다.
- 실제 집중검사: Node24.18.0/own UUID PG17에서 `node /tmp/ap-paid-run-focused-db.mjs`38087 및 Field75037 **각3/3 fail0/skip0 exit0**, /tmp/{ap,field}-paid-period-overlap-green.log. 각각 새 billing1+변경과 관련된 기존 trial2만 실행했다. calendar95519 각1/1, /tmp/{ap,field}-paid-period-final-green.log. root 전체 unit/DB/E2E/QA/G는 미실행이며 이전 AP29/Field30을 합산하지 않는다.
- 마지막 type60326/21102·lint67398·build63017/63888 exit0. `node tools/check-import-boundaries.mjs` exit0, /tmp/paid-basis-import-boundaries.log. 실제 red consent81570/29885·overlap41766/44669의 missing rejection을 저장 제약으로 수정했다. live test plan 비노출·live 가격 승인503·sandbox admin503은 실제 외부 MFA/가격 gate 미연결 상태다.
- CLI gpt-6-sol/high 첫87487 P2 consent(raw confidence 미출력) 수정, sandbox 권한 우회 제안은 보안5.3/QA157·후속 인증 지시에 따라 보류했다. 두 번째2765 P2 overlap(raw confidence0.94) 수정. 최종 repair4350 exit0 **No remaining P1/P2 finding in the billing period overlap repair**, raw confidence 미출력. 리뷰는 static이며 실제 DB tests는 위 root 실행 결과다.
- managed48590 생존 확인/정상 종료exit0 후 **53591** /tmp/paid-basis-managed-runtime.log 양제품build/migrate/ready·독립 retention worker ready·양웹200, 신규 무인증 price API401. 기준 owner/billing/admin/billing HTML을 실제 Chromium320으로 열고 두 prototype 캡처를 직접 확인했다. 이 backend 단계에서 native billing UI/전체 시각·동선 검수는 하지 않았다. checkout503·실 PG/MFA·provider/worker/환불/제공량/UI는 남는다.

## 이력 — 1차 잔여 대조/회수 단계


**2026-09-26 AP native 회수 단계 최종:** AP74855 29/29·Field52785 30/30·전체 type/lint57153·최신 lint37774 exit0. 실제 Field 미배포 AP independence53496 exit0(own native 회수/token200→401 포함). 세 번째 review62519 P2 package cwd 문제는 AP 생성/기존 journal 경로 절대화·key/파일 보존으로 보완, actual 설정2/2와 마지막 repair review87113 exit0/추가P1/P2 없음. 리뷰 내부 test는 read-only EPERM 미실행이며 root 설정2/2와 구분한다. mock36780 양 API/웹·retention worker ready/health 실제 확인. 전체/C03/A08는 in_progress. 다음은 전체 문서 기능 대조로 남은 범위 확정이며 위젯/일반 OAuth lifecycle·legacy/Field key·유료 구독 원장/외부 발송 adapter·최종 사용자 화면/실 공급사·운영 QA/G는 완료되지 않았다. 자세한 현재 사실은 docs/CODEX_HANDOFF.md 상단 참조. 아래 누적 기록의 이전 handle/미완료는 당시 이력이다.

- **단독 실행 최신 결과:** 재리뷰88411 exit0/P2 1건은 independence launcher가 AP 회수 원장 설정을 누락하던 문제였다. tools/run-independence.mjs own AP 경로/키 allowlist·환경 단위검사 실제 undefined red→2/2, independence-flow의 실제 owner selection revoke/토큰200→401을 추가했다. managed92152 정상 종료130와 Field DB/Valkey compose stop33427 exit0 뒤 pnpm test:independence:agent **53496 exit0**(/tmp/ap-revocation-independent-standalone.log): 실제 Field API/web/DB/Valkey 미배포/포트 부재를 시작·종료 시 확인하고 AP 가입/승인/문의/답변/export/외부 widget/공개 이어가기·native 회수와 owner/guest browser1/1을 확인했다. 모든 AP 기능/실 공급사 완료를 주장하지 않는다. 후속 세 번째 독립 review62519(/tmp/ap-revocation-third-review.log)는 진행 중이며 clean/commit 미확인이다. 양제품 복구 mock36780(/tmp/ap-revocation-standalone-restored-runtime.log)가 현재 기동 중이다. 이전92152/46139/62510/68922는 종료됐고 독립 gate53496의 API/web도 정상 종료됐다.


## 최신 A05.WIDGET-END — 코드 fe6a524 / 내부 세부 완료

- TASKS A05.WIDGET-END를[x]로 기록했다. API 종료410/명시 startNewFrom·현재 종료 ID/활성·타ID409·응답 유실 현재 재조회/새 원본1개·과거 ticket410/S→ticket 잠금·기존 receipt 보존, iframe 입력/AI/조건 초기화·generation별 늦은 답변/조회 오류 폐기를 연결했다. DB migration/Field 코드/공개 cross-product 계약 변경 없음.
- 실제 명령/환경: Node24.18.0·own 격리 PG17, `node /tmp/ap-widget-end-run-focused-db.mjs` **79104 exit0 2/2 fail0/skip0**, /tmp/ap-widget-end-gate-priority-green.log. 이는 변경한 retention-purge/deployments 두 native 파일이며 이전 전체 AP29/29·Field30/30을 재실행하거나 개수를 합산하지 않았다.
- `node --test tools/spikes/ap-widget-ended-http.test.mjs` **6355 exit0 2/2**, /tmp/ap-widget-end-late-transcript-green.log: 실제 native SDK/iframe Chromium320·실제 정리 worker/원장·실제201 뒤 응답 유실·같은 ID 복구·늦은 answer와 transcript 네트워크 오류 두 경우·가로 넘침/pageerror0. 합성 provider·소유 verifier는 fixture이며 실 공급사/DNS 성공 증빙이 아니다. AP 표준 E2E8번째에 등록만 했으며 전체 E2E는 미실행.
- API type14816/lint45013 및 마지막 UI build72657/type70754/lint29628 exit0. CLI gpt-6-sol/high 최종 repair16296 exit0/추가 P1/P2 없음; 리뷰 자체 테스트는 미실행. managed48590 최종 양제품 build/API ready·양웹200. 원 시안 agent/chat을 실제320으로 열어 prototype/native 캡처를 직접 확인했으며 사용자 전체 시각/동선 인수는 미검수다.
- native widget 완료는 전체 C03/A05/QA160/출시 완료가 아니다. 다음 미완료는 유료 billing A07.F09.PAID이며 실 인증/공급사·최종 사용자 테스트/운영 gate는 후속이다. 완료를 기억 부재로 재개하지 않는다.

## 최신 AP native 회수·복원 — a5aee2b 이후 작업트리

최신 리뷰 보완: 첫 독립93162 exit0 P2 3건(잠금40P01·UUID index·전체 원장 재읽기)을 migration68/증분 서명·DB proof cache로 보완했다. watcher 방식은 실제 same-size 변조 즉시200을 놓친98265/99027 red로 폐기했고, 현재 요청마다 전체 파일 inode/크기/mtime/ctime을 직접 대조한다. 변경 파일만 HMAC/hash를 다시 검사하며 checkpoint/restore는 항상 전체 재검증한다. 최종 AP74855 29/29 fail0/skip0 exit0, type/lint57153 exit0, metadata 읽기500entry/10회18.744ms 대 이전361.09ms(전체 서비스 latency 검수 아님). 최신 mock92152 양제품 build/migrate/ready와 retention worker ready. 재리뷰88411 실행 중으로 clean/commit은 아직 미확인이다. 전체 목표/C03는 in_progress다.


AP native owner 연결/선택 회수·검증된 원격 수신을 AP 전용 HMAC/fsync 원장과 불변 ID/hash receipt에 연결했다. migration67은 해제 즉시 access/refresh ciphertext null·재활성화 금지·늦은 OAuth token 발급 직렬화를 적용한다. 실제 해제 전 PG17 dump/별도 restore의 bearer200→회수 재적용401, 고객 문의/확인키 보존·수신 ID 복원·외부 회수 blocked/가짜 ACK 금지·반복0을 검수했다. 최신 checkpoint 필수·원장 유실/변조/추가·namespace/조직 binding 불일치 전체 rollback과 current DB localhost alias/Field port/원장 내부 증빙 출력 거절을 확인했다. AP DB26074 29/29·Field DB52785 30/30 fail0/skip0 exit0, 최종 type25729/lint6277 exit0, 초기 mock 설정1/1·직접 내부 import 경계12312 exit0, 연결 화면 HTML smoke1/1. mock62510 양제품 API/웹 build/migrate/ready·독립 retention worker ready와 양 health를 확인했다. 독립 CLI93162(gpt-6-sol/high)는 진행 중이며 clean을 아직 주장하지 않는다. 일반 OAuth provider의 개별 토큰 삭제/refresh family 수명·양제품 legacy 회수 baseline/Field route key 수명·embed 종료/새 상담·전체 PRD/QA/G/독립 실행·운영 RPO/RTO·외부 공급사/MFA·사용자 최종 화면/동선은 남아 전체/C03 in_progress다.


## 최신 AP 실제 정리 — e89bf2a 이후 작업트리

AP 정리 요청/다른 승인/취소·독립 worker·실제 파일/원문/AI/자체 사본 정리·usage/ID 보존·DB 재저장 차단, 고객 종료/명시적 새 상담을 연결했다. AP migration65/66·Field migration62의 제품별 immutable journal receipt와 signed 원장 대조로 유실·대체·변조/실행 중 폴더 부재 뒤 추가 정리를 차단한다. JSON/사진/archive/지원 읽기는 응답 종료까지 보호하며 photo-only 첨부 목록은 현재 ready ID와 재대조한다. 열린 고객 follow-up410은 원본 재조회/기존 시도 폐기로 종료 안내를 반영한다. AP DB89449 28/28·Field DB17798 30/30 fail0/skip0 exit0, type18900/lint7378 exit0, native HTTP/320px6968 1/1 exit0. 독립 CLI13308 재리뷰 exit0에서 추가 지적 없음. 최신 mock68922 양제품 build/migrate/ready·독립 worker ready와 양 health를 확인했다. AP revoke 독립 원장/복원·Field route key/legacy·전체 문서 기능/QA/G·운영 RPO/RTO·실 공급사/MFA/사용자 최종 화면·동선은 남아 전체/C03 in_progress다.

## 최신 AP 자체 보존 기반 — d717532 이후 작업트리

- AP 자체 migration64/API/domain/관리자 UI: 승인 정책·불변 보류, 실제 종결/재개·legacy 이관, 익명 활동30/문의180/사진90 preview·AI/발송·지원·외부 미확인/미래 예약·기간과 hold를 구분한다. Field 내부/DB를 조회하지 않는다.
- 실제 PG17 AP DB **1325 27/27**, `/tmp/ap-retention-basis-final-db.log`; legacy63→64 별도 DB **1/1**, `/tmp/ap-retention-basis-migration-final.log`. 합성 fixture/임시 DB를 정리했다. 현재 revision 근거 없는 종결을 추정하지 않는다. 107개 metadata microsecond pagination의 중복/누락·cursor org binding을 확인했다.
- 최종 전체 type **61572**·lint **53746 exit0**; managed mock **92132** 양 API/웹 build/ready. AP native HTTP/Chromium320 **71697 1/1**, `/tmp/ap-retention-basis-final-http.log`: 실제 별도 운영자·ACK 유실 같은 요청 확인/단일 정책·승인/보류 해제·preview503/원장503 복구·조작 잠금·가로 넘침 없음/pageerror0. 시안 admin/audit와 실제 캡처를 열었다. 표준 AP E2E7개에 신규 legacy/HTTP 두 검사를 등록했지만 전체 E2E를 실행한 결과는 아니다.
- 미완료: 실제 AP 정리 요청/worker·private 원문/사진/AI/전달 제거·복원 증빙/회수·외부 업무 종결의 공개 계약 한계, Field route key 수명/legacy·운영 복구, 전체 PRD/역할/QA/G·실 공급사/MFA·최종 사용자 시각/동선 인수. 보존 기반과 미리보기는 실제 삭제 완료/전체 C03 Done이 아니다.

## 최신 Field 삭제 원장 누락 검증 — c809c28 이후 작업트리

- 실제 `pnpm test:db:field` **2217 30/30**, `/tmp/field-retention-checkpoint-final-db.log`, 임시 test/restore DB 제거. 기존 실제 PG17 dump/restore에서 missing directory·누락 entry·미대조 추가·checkpoint 변조는 원문/사진을 유지한 채 거절됐다. 별도 checkpoint export/restore CLI로 실제 삭제/원문 제거·반복0/재저장 거절과 기존 미확인 삭제 거절을 확인했다.
- CLI 안전한 대상 구분: 현재 DB localhost alias, active media symlink alias, 잘못된 local port, 원장 안의 checkpoint 출력을 실제 거절했다. 보호된 독립 원장/최신 checkpoint가 필수이며 둘의 동시 과거 교체·legacy 누락/운영 보관 근거는 별도다.
- 최종 typecheck **57849**, lint **78010**, Field API build **90668 exit0**. 새 CLI/복원 함수 변경으로 API/UI/migration/공개 계약 변경 없음. runtime **21041**을 유지하고 양 API ready를 실제 확인했다. 전체 HTTP/브라우저·AP DB/정식 QA/G는 반복하지 않았다. 직전 c809c28의 실제 reference/HTTP 검수와 구분한다.
- 남음: AP 자체 익명30/업무180/사진90 보존·종결/hold·정리/독립 worker/복원, Field route key 수명·legacy 회수 baseline/미확인 삭제 추가 대조·신뢰 checkpoint/원장 동시 과거 교체·운영 공급사 복구, 전체 PRD/역할/QA/G·최종 사용자 인수. 전체 C03/F09 완료를 주장하지 않는다.

## 최신 Field 권한 회수·격리 복원 — e28229f 이후 작업트리

- 실제 Field DB **8959 30/30**, `/tmp/field-revocation-complete-db.log`. 별도 PG17 test/restore DB와 테스트 전용 원장 정리. native 회수 3경로의 인증/반복·서명 실패·원장 실패503/DB rollback, AP ciphertext null/재활성화 거절, 늦은 token 발급/회수 경합을 확인했다.
- 실제 PG17 해제 전 dump→별도 restore, 기존 bearer 200→원장/CLI 적용→401·refresh 회수/동의 제거·원문/확인키 유지·반복0. checkpoint export 실제 CLI도 실행했다. 누락/변조/없는 전체 디렉터리/미대조 추가 entry·AP namespace 혼합·조직/선택 binding 오류 rollback·현재 DB localhost 별칭/잘못된 로컬 port CLI 거절을 확인했다. native 수신 회수 ID/ACK 중복을 복구하고, 백업 이후 원격 회수 intent fixture는 acked 대신 blocked 재대조로 남겼다.
- 실제 HTTP/320px **12875 1/1**, `/tmp/field-revocation-http-verified.log`: 기존 SDK·AP 원문/답변·동의/1회 handoff·수신 업무/예약/알림·Field 명시 회수/원격 장애 retry·AP 시작 회수/고객 기존 경로를 확인했다. 첫 **9294**는 실행 중인 event worker를 알리는 `FIELD_EVENT_WORKERS_RUNNING=1`이 없어 수동 전달이 empty였고 실패했다. 실제 worker 모드로 재실행했으며 ACK 기대값을 낮추지 않았다.
- 최종 typecheck **52968**, lint **45964**, Field build **73538 exit0**; native mock **21041** 양제품 API/웹 ready/Field retention worker ready. 기준 HTML admin/audit를 Chromium 320px로 열고 `/tmp/field-revocation-prototype-320.png`를 실제 확인했다. 이번 변경은 UI 코드 수정이 아니며 사용자 최종 시각/흐름 인수는 미검수다.
- 남음: 전용 route key 종료 수명·legacy 회수 baseline·신뢰 checkpoint/원장 동시 rollback, 기존 삭제 원장 전체 누락/미확인 삭제 결과 추가 대조·운영 보관/복원, AP 자체 보존/정리, 전체 PRD/역할/QA/G·실 공급사·사용자 최종 인수. C03/F09 전체는 in_progress다. 전체 AP DB/표준 E2E/security/independence 명령을 이번 변화로 다시 실행하지 않았다.

## 최신 Field 정리 실행 — c87f14f 이후 작업트리

- 최종 실제 Field DB: **56067 29/29**, `/tmp/field-retention-phase-db-final.log`, 별도 임시 DB 제거. 공개 문의/실제 사진→요청·별도 승인·멱등/권한·파일 실패 재시도·증빙 ACK 실패와 재기록, 원문/파일 부재·receipt/export·DB 재저장/지원 거절, 지원 승인과 삭제의 실제 경합, 예약 원문/이벤트 사유/달력 label·수신 snapshot/늦은 답변, 사진 scope 원문 유지·승인 후 hold, 늦은 복사 claim의 파일 재쓰기0회, Field 환경만으로 standalone worker 실행을 확인했다.
- 실제 복원: 위 DB 검사에서 정리 전 isolated DB의 PG17 dump를 별도 임시 DB에 restore하고 별도 경로에 실제 사진을 복원했다. 서명 원장 재적용 후 파일 부재/원문 제거·tombstone 재저장 거절·반복 적용0, 미확인 intent/손상 서명 거절을 확인했다. 운영 revoke/전체 원장 유실·실 RPO/RTO는 이 검사가 아니다.
- 실제 native HTTP/320px: **73367 1/1**, `/tmp/field-retention-jobs-final-browser.log`. 관리자 요청 ACK 유실/동일 요청, 승인 전 취소·다른 운영자 승인·독립 worker actual deletion/부재·고객 종료 안내/추가 질문 종료, job 원장503 metadata 유지/잠금/복구와 기존 정책/hold/preview/수신 종결 회귀를 확인했다. 가로 넘침/pageerror0. 기준 HTML admin/audit와 `/tmp/field-retention-jobs-320.png`, `/tmp/field-retention-ended-customer-320.png`를 실제 열었다. 전체 시각 인수는 미검수다.
- 전체 typecheck **58010**, lint **99020 exit0**; Python/Node 구문·diff exit0. mock **54477** 양제품 API/웹 build/ready·Field worker ready/합성 completed를 실제 확인했다. 표준 Field E2E7개 중 이 HTTP 검사만 실행했으며 전체 명령/AP DB/전체 회귀/정식 QA/G는 미실행이다.
- 남음: Field revoke 복원·원장 전체 유실/미확인 결과 대조/운영 복구, AP 자체 보존·정리, 전체 명세/역할·G 검수, 실 공급사·법무/MFA·사용자 최종 인수. C03 전체 완료를 주장하지 않는다.

## 최신 Field 보존 기반 — a13510e 이후 작업트리

- 실제 검수: `pnpm test:db:field` **28/28,93261**(`/tmp/field-retention-pagination-green.log`, 임시 DB 제거); `node --test tools/spikes/field-retention-migration.test.mjs` **1/1**(`/tmp/field-retention-migration.log`,58→실제 legacy 자료→59·별도 DB 제거).
- 실제 native HTTP/320px: `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python node --test tools/spikes/field-retention-http.test.mjs` **1/1,36901**(`/tmp/field-retention-recovery-browser.log`); 기존 Field 관리자 **1/1,87655**. 현재 mock85257 양제품 API/웹 build/ready·웹200, 실제 시안 admin/audit와 새 캡처 확인.
- 범위: 정책/다른 승인/immutable 기간·권한/Origin·ACK, 종결/재개·legacy unknown, 미래 예약/수신 예약 원본 기준·양방향 hold/검토 초과, pending 원문 전달·복사/현재 지원 승인, terminal 예약 새 메시지의 활동 시각, 개인정보 없는100개+microsecond cursor105개/조직 binding, preview/원장503 실패 폐기·metadata 유지/잠금/복구, 수신 업무 종결 ACK 복구·원본/확인키 보존·가로 넘침/pageerror0.
- 최종 전체 typecheck37941/lint57228 exit0, 마지막 테스트 타입/등록 ESLint5493·Python/Node 구문/diff exit0. 표준 Field E2E7개 등록 뒤 전체 명령은 이번 변경으로 미실행이다. 아래 a023c67 기록을 현재 전체 회귀 검사로 확대하지 않는다.
- 필수 남음: 실제 정리 job/worker·파일/원문 개인정보 제거 및 소비자 복원/삭제·revoke 원장 재적용, AP 자체 보존 기능·전체 PRD/QA/G. 운영 MFA·법무·실 공급사·사용자 최종 시각/동선은 미검수다. 180/90은 검토 제안이며 mock 정책 승인을 법무/출시 승인으로 주장하지 않는다.

## 범위

- 검사 코드 커밋: `a023c67` (`Recheck Field AP connection and installed deployment state`). 이후 변경은 이 검수 기록이다.
- 환경: 로컬 `mock`, Node 24/pnpm, 제품별 PostgreSQL 17, Field Valkey, Chromium 합성 계정/업무. AP와 Field의 원장·자격증명·세션은 분리한다.
- 시안: `/Users/jr/Desktop/projects/FieldAI/reference/field_ui_prototype_v3.html`.
- 목적: 현재 명령에 포함된 실제 기능·저장·권한·독립성 경로를 확인한다. 전체 요구 완료와 실 공급사/출시 승인의 증거는 아니다.

## 실제 실행 결과

| 명령 | 결과 | 확인 범위 |
|---|---|---|
| `pnpm lint` | exit 0 | 현재 코드 정적 규칙 |
| `pnpm typecheck` | exit 0 | 양제품 API/웹 타입 |
| `pnpm test:unit` | exit 0 | API 각 3개, AP 웹 10개, Field 웹 14개, tools 7개 |
| `pnpm test:db:agent` | 21/21, exit 0 | 별도 임시 AP DB의 도메인/권한·원본·배포·알림 원장·구독 체험. 임시 DB 제거 확인 |
| `pnpm test:db:field` | 21/21, exit 0 | 별도 임시 Field DB의 카탈로그/사이트·직접 문의/예약·충돌·권한·체험. 임시 DB 제거 확인 |
| `pnpm test:contracts` | exit 0 | 공개 OpenAPI 정적 2개와 AP/Field 제공자·소비자 DB 5개 |
| `pnpm test:integration:faults` | exit 0 | 공개 계약, 제공자/소비자 장애 DB, 실제 양제품 HTTP/worker 전달 |
| `pnpm test:e2e:agent` | 3/3, exit 0 | 320px 사업자→상담 링크/외부 위젯→비회원 문의/답변, 매체 조직 복구, 별도 관리자 경로/권한 |
| `pnpm test:e2e:field` | 3/3, exit 0 | 320px 사업자→사이트 공개→직접 문의/두 예약 방식, 자동 저장/공개 경계, 별도 관리자 경로/권한 |
| `pnpm test:e2e:distribution` | 2/2, exit 0 | 매체 조직 복구, 카드 배치→Field 요청/예약·서명 사건·알림 경로·해제/직접 연락·집계 |
| `pnpm test:security` | exit 0 | 직접 cross-product import 차단, 교차 DB 자격증명 거부, 제품별 권한 DB, tenant 공개 경로, 관리자 감사/권한 |
| `pnpm test:independence:agent` | exit 0 | Field 프로세스/DB/Valkey/비밀값 실제 부재에서 AP 가입·승인·외부 위젯·접수/답변/체험 및 320px owner/customer 흐름 |
| `pnpm test:independence:field` | exit 0 | AP 프로세스/DB/비밀값 실제 부재에서 Field 가입·승인·사이트·접수/답변/두 예약·체험 및 320px owner/customer 흐름 |
| `pnpm build:agent`, `pnpm build:field` | exit 0 | 독립 실행 검사와 mock 복구 과정에서 실제 API 빌드 |
| `pnpm build:web:agent`, `pnpm build:web:field` | exit 0 | 독립 실행 검사와 mock 복구 과정에서 실제 Next 빌드 |

독립성 검수 전 전체 mock PTY를 종료하고 상대 compose 컨테이너를 `stop`했다. 볼륨을 삭제하지 않았다. 검사 후 `pnpm mock:run` PTY **53283**으로 양제품 build/ready를 복구했다. 최종 AP 웹 `http://localhost:3001/workspace`, Field 웹 `http://localhost:3002/workspace`의 HTTP 200과 API `127.0.0.1:4311`/`4321`의 제품별 `status:ready`를 실제 확인했다. 세션이 종료됐는지는 HTTP로 먼저 확인한다.

## 문서 대조 결과와 후속 구현

| 요구 | 현재 증거 | 다음 구현 범위 |
|---|---|---|
| Field PRD 3.8: AP 장애 뒤 새 직접 요청의 `fallback_origin`·관계·ID 기반 중복 후보, 전화번호 자동 병합 금지 | 2026-09-26 후속 구현: migration 000055, Field 문의/예약 저장·권한·내보내기, 고객 명시 입력과 사업자 후보 이동. 새 DB 3개 red→전체 Field 24/24. 320px 실제 문의·두 예약·후보 문의/예약 이동·503 재시도 exit 0. 후보는 고객 선언과 같은 Field 조직 수신 ID 대조일 뿐 장애/중복 확인이 아니다. | 마지막 시각 검토로 추가한 후보 버튼 CSS는 다음 mock build 반영. 전체 AP 실제 장애·전체 역할/정식 QA/G와 사용자 최종 인수는 기존 미완료 범위로 유지. |
| AP PRD 2.5: 대표 상담 링크 QR 제공 | 2026-09-26 후속 구현: `AgentConsultQr.tsx`, 활성 링크의 browser PNG 생성/다운로드. 버튼 부재 red→AP 표준 E2E 3/3, 좁은 사업자 HTTP 1/1에서 canvas 실패/재시도·PNG와 실제 320px 표시 이미지의 jsQR 해독·원래 공개 URL·배포 pause 404/re-activate 확인. AP web typecheck/lint/build exit 0. Field 재접수 CSS도 mock 1112 빌드 반영/320px 확인. | 실 휴대전화 카메라·종이 인쇄·사용자 최종 시각/전체 QA/G는 미검수. 외부 QR 서비스·비밀값/고객 정보 전송 없음. |
| C03 고객 표시 상태: 카탈로그 조회 완료와 미등록 값 구분 | 2026-09-26 red→mock 44403의 320px 브라우저 exit 0. 지연/정상 빈 값/404/503·네트워크 실패·재시도, 대상 있는 헤더 링크, 기존 문의·두 예약·후보 흐름 확인. Field web typecheck/lint/build exit 0. | API/DB 변경 없음. 사용자 최종 화면 인수·전체 QA/G는 미검수. |
| AP PRD 2.7: spam 상태는 보존과 별도로 발송 중단 | 2026-09-26 AP migration 000061/owner revision 분류·해제·원본/후속/사진/메모 보존·알림 중단. AP DB 22/22(권한/멱등/경합/감사/내보내기·위임 답변 거절·Field 예약 사건), Field DB 24/24(확정 거절 초안 보존), mock 17560의 AP 사업자 HTTP/브라우저 1/1·양제품 HTTP/브라우저 1/1. Field 화면 spam은 기존 실제 원본 응답의 상태만 주입한 소비자 검사다. typecheck/lint/build exit 0, AP 320px 캡처 확인. | 실 발송 공급사/사용자 최종 인수/전체 QA/G는 미검수. 스팸은 현재 동의 완료 human 상담 원본 대상이며 익명 AI 상담 분류를 구현했다고 주장하지 않는다. |
| AP PRD 2.2 순서 3: native 지역·영업시간 등록 | 2026-09-26 AP business/agents·workspace/public에 선택 native 값을 연결했다. AP DB red→23/23(값 검증/권한/PATCH 보존/승인 전후·구버전 불변 JSONB·owner/customer AI 승인 근거), mock 29076의 320px 사업자 HTTP/브라우저 1/1·자동 저장 HTTP/브라우저 1/1(지역만 바뀐 응답 분실/409, 시간만 바뀐 서버 선택·공개 유지). typecheck/lint/build exit 0. 시안 owner/agent-knowledge 직접 확인. | Field 사실과 자동 병합하지 않는다. 전체 시각/동선·사용자 최종 인수/실 LLM·전체 QA/G는 미검수. |
| Field PRD 3.6: 수신 snapshot 목적·출처·시각·보존기간 | 2026-09-26 migration000056·received-work-record와 원장/상세/exports. Field DB red→24/24(문의/예약 목적·동의·제안180/90·멱등/해제/내보내기·legacy null·목적/JSON null 거부), mock2217 양제품 HTTP/브라우저 1/1(320px 문의/예약 표시·기존 원본/답변/해제/알림). typecheck/lint/build exit 0·320px 캡처 확인. | 정책 상태는 proposed다. 종결시각/보존 연장/자동 정리·법무/운영 정책·공급사·사용자 최종 인수/전체 QA/G는 미완료다. |
| Field PRD 3.2: 셀프 제작 첫 사업 정보의 업종 입력 | 2026-09-26 Field 자체 입력·서버 초안·승인·공개 표시·제작 snapshot 연결. Field DB25/25, 렌더2/2, mock88953 자동 저장/320px1/1·사업자→공개/직접 문의/두 예약1/1. 업종만 수정한 응답 분실/409 두 선택·구버전 보존/미등록·승인본 유지, typecheck/lint/build exit0. 시안 create/business 직접 대조. | AP 공개 facts 계약을 늘리지 않았다. 실제 제작 LLM·전체 시각/흐름·운영/전체 QA/G는 미검수다. |
| Field PRD 3.9 F-A06·QA48/49: 신고/이의 처리·승인 접근 | 2026-09-26 migration000057와 native 신고/공개 snapshot·다른 operator 승인/기간 접근·감사/검토·사이트 제한·사업자 내부 알림/이의/결정/제한 해제. Field DB26/26(session98497), mock46010의 신고 HTTP/320px15625 1/1·기존 관리자19942 1/1, tenant/렌더3/3, typecheck/lint exit0. 자기 승인/auditor/타 actor·타 신고/만료/권한 회수 차단, 다중 제한/원본·신규 직접 접수 유지·멱등/응답 분실·당시 서비스/FAQ/본문·알림 읽음/이동 확인. | 일반 고객 대화·사진의 지원 열람/운영 MFA·신고/이의 정책·법정 보존/복구와 원래 client-IP reverse-proxy 검수는 미완료다. 로컬 peer 기반 신고 한도는 접속자를 합쳐 제한할 수 있다. 표준 Field E2E에 등록했으나 등록 뒤 전체 세트는 미실행이며 이 좁은 결과로 전체 QA49/G를 통과 처리하지 않는다. |
| AP PRD 2.9 AP-A06·QA48/49: AP 신고/이의 처리 | 2026-09-26 migration000062와 native 신고/공개 whitelist snapshot·다른 operator 승인/기간/현재 권한 접근·검토/감사·배포별 hold·owner 내부 알림/읽음/이의/결정. AP DB24/24(session33270), mock10988 신고 HTTP/320px32096 1/1·기존 관리자9826 1/1, typecheck2626/lint17406/build exit0. 실제 PG17 신규 위젯 접수 경합·AI 최종 응답 거절, 복수 hold/owner pause·기존 원본/위젯 사람 인계·직접 접수/다른 배포·기존 고객 새로고침/무권한 복원 차단·ACK 분실/재시도·알림/320px 가로 넘침 확인. | 일반 고객 대화/사진 지원 열람·운영 MFA/IP 신뢰·보존/정리·실 공급사/정식 QA/G/사용자 최종 인수는 미완료다. 원래 peer 기반 신고 한도는 여러 접속자를 합칠 수 있다. 표준 AP E2E4개에 등록했지만 전체 명령은 등록 뒤 미실행이다. 신고 grant는 고객 원문 권한이 아니다. |
| 시안 고객정보 열람 요청·QA49·보안 문서5.3: AP 문의별 승인/사유/기간/감사의 원본 지원 접근 | AP 문의별 native grant/감사·목적/참조/사유·conversation/contact/photos·다른 운영자 승인/기간·현재 양 운영자 membership·회수/만료·header 사진/읽기 뒤 재확인·성공 읽기 감사를 구현했다. AP DB25/25(session86324), 최종 typecheck48647/lint11371 exit0, mock75745 HTTP/320px22877 1/1(ACK 분실·scope별 원본·내부 메모 비노출·실제 사진·queue503 복구·회수/실제8초 기한 폐기·가로 넘침/pageerror0), 기존 AP admin1988 1/1. 시안 request-access 모달 직접 확인. | Field 자체 지원 접근은 아래 행의 별도 native 원장으로 구현했다. AP 원본은 AP 공개 계약만 이용한다. AP의 접수 전 익명 AI 원본은 이 문의 grant 범위가 아니다. 운영 MFA·고객 요청 진위·보존/전체 QA49/G·사용자 최종 시각/동선은 미완료. AP 지원 queue100개+cursor/감사 최근100개, 표준 AP E2E5개 등록 뒤 전체 명령 미실행. 신고 grant/관리자 토큰만으로 고객 원문을 열지 않는다. |
| Field PRD3.6/3.7/3.9 F-A06·QA49: 직접 문의/예약/수신 업무별 지원 접근 | Field migration000058·자체 grant/감사, 업무 종류/ID+org FK·대화/제출/연락처·지역/사진 scope·다른 운영자 승인/최초 기한·현재 양 운영자 권한·회수/만료·파일 읽기 후 재확인. 실제 DB27/27(session15725), 최종 typecheck88434/lint82464 exit0, mock99529 HTTP/320px10485 1/1(업무3종·ACK 분실/동일키·queue503 상세 폐기/목록 유지/복구·scope별 원본/내부 메모 제외·실제 사진/복사 대기 안내·회수/실제8초 종료·원본/점유 보존·가로 넘침/pageerror0), 기존 Field admin10054 1/1. 시안 request-access 모달과 실제 예약/수신 상세 캡처 확인. mock loopback Origin 불일치를 red→green으로 수정하고 외부 Origin 거부를 유지한다. | AP 원문/내부 코드를 조회·복제하지 않는다. Field가 이미 받은 요약/허용 request 필드와 이미 복사된 사진만 읽으며 pending 첨부는409다. 운영 MFA/고객 요청 진위·법정 보존·전체 QA49/G·사용자 최종 시각/동선은 미검수. queue100개+cursor/감사 최근100개, 표준 Field E2E5개 등록 뒤 전체 명령 미실행. 다음 내부 작업은 보존/정리·분쟁 hold와 전체 PRD 누락 대조다. |

이는 전체 PRD의 기능 누락 목록을 완성한 것이 아니다. 현재 표준 검사에서 확인한 경로와 이 문서 대조에서 직접 확인한 누락을 기록한다. 다른 문서 요구는 구현/증빙을 계속 대조해야 한다.

## 계속 남은 검수

- 사용자 최종 시각·동선 인수, 원본 시안과 모든 역할/화면의 대조, 전체 키보드/스크린리더·실 브라우저 200% 확대.
- 실 인증·LLM·카카오/문자/푸시·독립 결제·운영 DNS/TLS·실 객체 저장소/악성코드 검사·백업/보존 정책. 해당 공급사/운영 검수는 `blocked_integration` 또는 미검수이며 로컬 mock 성공으로 통과 처리하지 않는다.
- 정식 QA/G의 실기기·운영 장기 장애·구버전 consumer·복구/보존 증빙. C03과 A/F/I/D 완료/출시 승인은 아직 미증명이다.
