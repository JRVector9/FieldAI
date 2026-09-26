# 개발 종료까지 남은 범위 — 2026-09-26 1차 코드 대조

## 현재 내부 완료 checkpoint — a974b90 (2026-09-27)

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


**완료 항목 기준:** `TASKS.md` 상단 체크 원장을 먼저 읽는다. 본 문서의 부모 Task “부분/미완료”는 남은 범위가 있다는 뜻이며, 이미 `[x]`인 세부 구현을 다시 하라는 지시가 아니다. 재개는 AGENTS.md6.1에 따른 구체적 증거/사유가 있을 때만 한다.

**이력 — 2026-09-27 표시 정합성 점검:** 내부36[x]/잔여7[ ] 유지. paid/phase의 오래된 owner 동의/인증 발급/최초 청구 미완료 표시는 기존 PLAN-BASIS·CONSENT-BACKEND·AUTH-ISSUE·FIRST-CHARGE 근거에 맞춰 체크했다. 실 SDK return·갱신/해지/유예·환불/제공량/UI는 별도 미완료다. 과거 “다음” 지시를 현재 작업으로 읽어 완료 기능을 다시 구현하지 않는다. 문서 점검만으로 전체 기능군/QA/G를 통과 처리하지 않는다.


## 기준과 한계

- 1차 대조 기준 commit: **eab1d30** (AP native revocation journal/격리 restore). 후속 A05.WIDGET-END 완료 코드 **fe6a524**와 실제 범위 검수는 아래1행/coverage/인계에 갱신했다. Node24.18.0·로컬 mock PostgreSQL17·Field Valkey8.1.10.
- 사용자 우선순위: 문서 기능을 끝까지 구현해 사용할 로컬 환경을 유지한다. 실 인증/MFA·공급사 연결은 후속, 최종 화면/동선 테스트는 사용자가 한다. 디자인은 `/Users/jr/Desktop/projects/FieldAI/reference/field_ui_prototype_v3.html`로 고정한다. 새 화면 구현 시 HTML/CSS를 기준으로 사용하고 기존 완료 화면을 반복 조정하지 않는다. 새 기능만 `(추가)`로 표기한다.
- v3 architecture B01~B12/21결정, 양제품 PRD, 연동4.11~4.12, 보안5.3~5.7, TASKS 원본 **46개 Task**, QA01~160을 기능군에 대조했다. 아래는 코드/계약을 읽은 인벤토리이며 **46개 완료/160개 통과라는 뜻이 아니다**.
- 이번 대조에서 추가 서비스 테스트/전체 시안 비교는 실행하지 않았다. native 테스트 최신 실제 증빙은 인계 상단: AP29/29·Field30/30·AP 단독 native revoke200→401/브라우저1/1. UI/API 파일이 있다는 이유로 Done 판정하지 않는다.
- 정확한 시간/완료율은 아직 산정하지 않는다. 내부 구현 누락과 공급사 key 부재를 구분하지 않은 기존 “3작업군” 설명을 작은 Task3개로 해석하면 안 된다. 추가 역할/상태별 누락은 계속 이 목록에 기록한다.

## 기능군별 남은 범위 — 내부 완료와 외부/최종 인수 분리

| 순서 | 작업 / 관련 ID·QA | 현재 직접 확인한 근거 | 종료 기준 |
|---|---|---|---|
| 1 | [x] A05.WIDGET-END 내부 완료 / C03,A05,D03·QA17/97~102/119 | 코드 fe6a524: native iframe 종료410/안내·입력/AI/조건 폐기·현재 종료 ID를 확인한 새 상담·유실 응답 재조회·과거 ticket 만료/직렬화. 집중 own PG17 DB2/2·native Chromium320 2/2·최종 repair review 추가 P1/P2 없음·managed48590 반영. | 내부 범위는 완료다. 기존 first-party receipt를 유지하며 전체 역할 시안/사용자 최종 인수·실 외부 설치/기기·전체 QA/G는 별도로 남는다. |
| 2 | 독립 유료 구독 / A07,F09·QA43~46/126/146 | [x] 가격/동의/인증/첫청구·RENEW-CANCEL-ACCESS.BACKEND(ef0dfd3). own PG17 각29/29, 고정 grace·해지 send gate·미발송 취소/unknown·시간 기반 접근. | 확정 HTTP거절·provider 환불/AI제공량·SDK callback/owner/admin UI·실PG/최종 인수. |
| 3 | 알림 / A06,F08·QA35~40/148/149 | [x] DELIVERY.INTERNAL(ef0dfd3): port/ledger/worker/unknown조회·동의/상한/fallback·owner 고정설정UI. 각13/13+추가각3/3·adapter각5/5. | 고객 채널동의 UI/서비스워커·실발송/실기기/최종 인수. |
| 4 | Field 주소 / F04·PRD3.4·QA13~15 | [x] CUSTOM-DOMAIN.INTERNAL(ef0dfd3): 등록/소유/DNS/TLS 증거 상태·Host/release·대표/기본주소·origin별SDK/proof·고정UI. native11/11·DNS2/2·Host3/3. | 실edge/DNS/TLS 공급사·실AP custom origin·최종 화면/동선 인수. |
| 5 | 공개 통합자 / C01,A09·PRD2.10/계약4.12·QA129~133/158 | [x] PUBLIC-WRITE.CONTRACT-BACKEND(ef0dfd3): preview.9/scope/POST/If-Match/idempotency·consumer. AP7/7·Field5/5·실HTTP1/1·계약1/1. | 새Field durable intent BFF/화면·실DNS/최종 인수·후속 범용manage 계약. |
| 6 | 권한 수명과 백업 후 복원 / A08,F09,I06·QA47/150~153 | native 연결/selection 회수는 이번 eab1d30에서 journal/restore 구현. 설치된 OAuth provider의 개별 access row 삭제·refresh rotation/revoke family는 별도다. legacy revoked baseline과 Field route key 종료 수명도 미완료. | 실제 native auth 수명 사건의 durable proof·별도 복원 재적용·legacy 근거·원격 미확인/키 종료·기존 업무/접근 유지. 운영 RPO/RTO와 checkpoint/journal 동시 과거 교체 방지는 운영 게이트. |

순서는 고객이 사용하는 작은 위젯 보완 후 큰 미구현 구독·알림·주소·공개 client 기능을 먼저 완성하고, 기존 회수 보완을 별도 완료 기준으로 끝내기 위한 것이다. 새로운 보안 항목을 임의로 계속 확장하지 않는다. 기능 작업 시작 전 각 범위/QA/명령을 phase plan에 기록한다.

## 외부 연결과 사용자 인수는 별도로 남는다

- **이미 adapter/내부 경로가 있는 항목:** AP 상담 LLM(openai.ts), Field 제작 LLM(field-openai.ts/worker), 양방향 OAuth 연결과 AP 공개 SDK. 실 모델/예산/실 client 설정·공급사 검수는 별도다.
- **내부 구현도 필요한 외부 기능:** 위2~4의 유료 결제·메시지 발송·자체 domain. 현재 상태를 “키만 입력하면 완료”라고 설명하지 않는다.
- **사용자가 후속이라고 지정:** 이메일 소유/카카오·계정 연결/번호 변경·MFA, PG·메시지/푸시·DNS/TLS 등 실제 계약/credential 연결. 외부가 없어서 내부 개발을 멈추지 않으며 출시 gate도 pass 처리하지 않는다.
- **최종 인수:** 모든 역할 시안 일치/동선·모바일320/키보드/스크린리더·실기기, 전체 적용 QA01~160의 제품/환경/commit별 evidence와 독립/연결/매체 회귀. 사용자의 최종 테스트 요청을 유지한다.
- **운영 공개:** 실제 운영 ACL/백업 보관/법무·가격·RPO/RTO·G-A/F/I/D/L/S 승인·배포/rollback. 로컬 코드 구현 종료와 운영 서비스 출시 종료는 서로 다른 완료 지점이다.

## 전체 Task 인벤토리

“내부 구현/로컬 구현”은 해당 native 경로가 존재하고 이전 부분 검수 근거가 있다는 뜻이다. 원 Task의 전체 Done(권한/이벤트/usage/오류/복구/전체 QA/공급사/게이트)은 아직 따로 확인해야 한다.

| Task | 현재 범위 | 직접 대조한 코드/문서 | 남은 것 |
|---|---|---|---|
| C00 | 구현 이력 | C00_INVENTORY.md | 외부 운영 자산 부재·QA115 N/A는 미확인 |
| C01 | 공개write 내부 계약 구현 | preview.9·integrator-public-write·ef0dfd3 | 전체 구버전 호환/범용관리 후속·새Field BFF/UI |
| C02 | 로컬 부분 검수 | tools/mock-run.mjs·run-independence.mjs | 운영 DB/큐/키/파일 ACL·CI/배포 |
| C03 | 부분 | 양제품 web/src·reference HTML·위젯 fe6a524 | 모든 역할/최종 시안 대조·미완료 기능 UI |
| A00 | 로컬 구현 | agent-api/src/auth.ts·business.ts | 이메일 소유·카카오·계정 연결·번호 변경·MFA 후속 |
| A01 | 내부 구현 | business.ts·agents.ts·field-sources.ts | 전체 QA/실 모델 근거 검수 |
| A02 | 내부 구현 | customer-consultations.ts·inquiries.ts·inquiry-attachments.ts | 전체 고객/실기기 인수 |
| A03 | 내부 구현 | inquiries.ts·customer-consultations.ts | 고객 알림동의 UI/실발송·최종 인수 |
| A04 | adapter 구현/외부 미연결 | openai.ts·agents.ts | 실 LLM·모델/예산 설정과 공급사 검수 |
| A05 | 내부 위젯 보완 완료 | deployments.ts·agent-public.tsx·fe6a524 | 실 외부 설치/기기·사용자 최종 인수 |
| A06 | 발송 내부/설정 UI 구현 | notification 모듈·ef0dfd3 | 고객 동의 UI/서비스워커·실발송/기기 |
| A07 | 구독 lifecycle backend 구현 | billing/subscription-access·ef0dfd3 | 확정HTTP거절·환불/AI제공량·SDK/결제UI·실PG |
| A08 | 부분 | admin.ts·customer-support.ts·retention/revocation 모듈 | 일반 OAuth 개별 수명/legacy 증빙·운영 백업/MFA |
| A09 | 공개 write 계약/backend 구현 | integrator-public-write/Field HTTP client·ef0dfd3 | 새Field durable BFF/UI·전체 호환/범용manage 후속 |
| A10 | 미완료 | run-independence.mjs AP mock 실제 통과 | 실 AI/알림/결제 없는 로컬 결과는 전체 실검수 아님 |
| A11 | 미승인 | 보안 문서5.7 | G-A1~3/G-L1 실제 evidence/출시 승인 |
| F00 | 로컬 구현 | field-api/src/auth.ts·business.ts | 실 인증/계정 보안은 후속 |
| F01 | 내부 구현 | business.ts·bookings.ts | 전체 필드/역할 인수 |
| F02 | 내부 구현 | sites.ts·site-media.ts·site-editor.tsx | HEIC/운영 저장소·최종 접근성/시안 |
| F03 | adapter/worker 구현 | field-openai.ts·site-generation.ts·worker.ts | 실 제작 LLM·모델/예산 설정 |
| F04 | 도메인 내부/Host/고정UI 구현 | custom-domain/sites/domain-settings·ef0dfd3 | 실edge/DNS/TLS·실AP custom origin·최종 인수 |
| F05 | 내부 구현 | inquiries.ts·inquiry-attachments.ts | 전체 고객/실기기 인수 |
| F06 | 내부 구현 | inquiries.ts·field-workspace.tsx | 고객 동의 UI/실발송·최종 인수 |
| F07 | 내부 구현 | bookings.ts·reservations.ts·field-booking.tsx | 전체 예약 상태/역할/실기기 최종 인수 |
| F08 | 발송 내부/설정 UI 구현 | notification 모듈·ef0dfd3 | 고객 동의 UI/서비스워커·실발송/기기 |
| F09 | 부분 | billing/subscription-access·admin/support/retention/revocation·ef0dfd3 | 확정HTTP거절·환불/AI제공량·SDK/결제UI·route key/legacy·운영MFA/복구 |
| F10 | 미완료 | run-independence.mjs Field 기존 로컬 증빙 | 실 제작 AI/알림/구독/도메인까지 독립 검수 |
| F11 | 미승인 | 보안 문서5.7 | G-F1~3/G-L1 실제 evidence/출시 승인 |
| I00 | 로컬 구현 | 양제품 auth·integrator·connector | 실 계정/전체 scope·재동의 lifecycle 인수 |
| I01 | 로컬 구현 | 양제품 connector/integrator·source 모듈 | public client 동등 조건/전 scope 대조 |
| I02 | 로컬 구현 | field-sources/source-refreshes·facts-change-delivery | 전체 stale/가격·호환성 QA 증빙 |
| I03 | 내부 구현 | AP deployments/Field origin별SDK·ef0dfd3 | 실custom domain/AP origin·외부 설치/최종 인수 |
| I04 | 로컬 구현 | field-actions·integrator external-requests·customer-handoffs | 실 공급사/전 동의 및 fault QA |
| I05 | 원본 API/단일 알림 주체 내부 구현 | ap-conversations/route-close/notification worker·ef0dfd3 | 실제 공급사 상태/원격ACK 검수 |
| I06 | 부분 | 양제품 revoke worker·route close·revocation restore | 일반 OAuth token 수명/legacy·Field route key 종료 |
| I07 | 부분 검수 | run-integration-faults.mjs·contract/DB tests | 이전 consumer/알 수 없는 필드·enum·정식 전체 fault |
| I08 | 미승인 | 보안 문서5.7 | G-I1~3 실제 evidence·독립 제품 승인 |
| D00 | 로컬 구현 | campaigns.ts | 최종 사업자 카드/승인/시안 인수 |
| D01 | 로컬 구현 | publishers.ts | 실 매체 도메인/권한/파트너 검수 |
| D02 | 로컬 구현 | placements.ts | 최종 정확 버전 승인/보류 인수 |
| D03 | 로컬 구현 | deployments.ts·placements.ts·위젯 fe6a524 | 실 매체/고객 기기·사용자 최종 인수 |
| D04 | 로컬 구현 | distribution-events.ts·distribution-metrics.ts | 전 작은 집단/차분 억제 QA 증빙 |
| D05 | 미완료/미승인 | run-e2e.mjs distribution | G-D1~2/실 매체 인수·독립 릴리스 |
| R00 | 대조 진행 | 본 문서·QA01~160 | 160개 모두의 제품/환경/commit별 실행 evidence 미완성 |
| R01 | 외부 상태 미확인 | C00_INVENTORY.md | 실 서버 존재/부재 증거 없이 N/A 처리 금지 |
| R02 | 미완료 | 전체 v3/사용자 최종 인수 | 로컬 코드 완료·사용자 테스트·공급사/운영 출시 구분 |

## 실제 명령/미실행

- 읽기: `rg --files apps/agent-api/src apps/field-api/src apps/agent-web/src apps/field-web/src`, native `subscription/auth/deployments/sites/integrator-routes` 직접 읽기, 청구/발송 관련 schema/source 검색, 계약 JSON route method 비교, TASKS/QA 표 대조.
- 경로 추정 실패: field-site-editor.tsx·agent-integrator.openapi.yaml은 없었고 실제 목록에서 site-editor.tsx·contracts/agent-integrator-v1.openapi.json을 확인했다. 해당 실패를 구현/검사 통과로 바꾸지 않았다.
- 이번 문서 대조 때문에 DB/E2E/security/contract 전체를 다시 실행하지 않았다. 마지막 코드 단계 실제 결과/리뷰·commit은 docs/CODEX_HANDOFF.md 상단과 해당 로그를 따른다.
- 계속 사용 가능한 환경: managed mock36780, AP http://localhost:3001/workspace / Field http://localhost:3002/workspace, 이번 단계 양 health/ready 실제 확인. 준비 상태가 미연결 공급사의 기능 완료를 뜻하지 않는다.

## 다음 정확한 작업

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -1 --oneline
sed -n '1,78p' TASKS.md
sed -n '1,78p' docs/CODEX_HANDOFF.md
cat docs/technical/A07_F09_PAID_EXECUTION_PLAN.md
cat apps/agent-api/src/billing-routes.ts
cat apps/field-api/src/billing-routes.ts
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
```

A05.WIDGET-END·가격/동의/발급·FIRST-CHARGE(00c3e0d)는 완료다. 현재 다음은 PAID의 갱신/해지/유예다. 첫 청구를 반복하지 않는다. SDK/결제 UI 단계에는 owner/billing/admin/billing을 직접 열고 범위/검수 명령을 기록한다. 이전 “원장/동의/인증/첫 청구 worker 없음”은 당시 상태이며 최신 체크가 우선한다.
