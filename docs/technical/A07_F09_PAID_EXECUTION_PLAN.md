# A07.F09.PAID 독립 유료 구독 구현 계획

> For agentic workers: 기존 사용자 지시대로 이 세션에서 execute-plan/TDD를 순차 적용한다. 매 작업 전 TASKS 완료 체크를 읽고 해당 하위 단계 완료 즉시 체크한다. 현재 사용자가 병렬 에이전트를 명시 승인했으며 root가 파일 소유 범위와 통합을 조율한다.

**Goal:** AP와 Field 각각 승인된 가격 버전·명시 동의·월 구독 거래·갱신/해지/유예/환불·기능 제한·사업자/관리자 UI를 자체 DB/API/worker에 연결한다. 실 공급사 키/계약 없는 환경은 blocked_integration이며 유료 성공을 모의하지 않는다.

**Architecture:** 현재 제품별 trial은 완료 범위로 유지한다. 제품별 billing 모듈·migration·provider/암호화 키·worker를 독립 추가한다. 동일한 계산/계약 형태라도 다른 제품 domain/DB를 import하지 않는다. 가격/약관/환불/제공량 승인본은 불변이며 동의 당시 plan ID를 구독과 기간 원장이 참조한다. 공급사 결과 미상은 기존 order/transaction을 조회하고 새 청구를 만들지 않는다.

**Tech Stack:** 기존 TypeScript/Fastify/Next·제품별 PostgreSQL17. 추가 결제 SDK 패키지 없이 공식 Toss HTTP adapter와 필요한 카드 인증 JS SDK를 사용한다. 승인된 가격/키가 없으면 기존 서버는 정상 실행하고 결제 버튼은 차단 사유를 표시한다.

## 기준/착수 증거

**현재 상태(2026-09-27):** TASKS40[x]/7[ ]. PLAN-BASIS·CONSENT-BACKEND·AUTH-ISSUE·FIRST-CHARGE·RENEW-CANCEL-ACCESS.BACKEND(ef0dfd3)는 완료다. 다음 내부 범위는 확정HTTP거절·provider 환불/AI제공량·SDK callback/owner/admin UI이며 기존 완료를 반복하지 않는다.

- HEAD0802a23, git status clean. TASKS 내부 완료32개/미완료7개 중 A07.F09.PAID 선택. subscription.ts 양제품은 trial과 checkout503뿐이며 billing period/plan/transaction 원장은 없다. 이미 완료된 trial/usage/설치/보존/회수는 다시 만들지 않는다.
- 요구: architecture B01~B04/B10~B12·결정17, AP PRD2.8·Field PRD3.8, 보안5.4/5.5·QA43~46/113/126/146·G-A1/G-F3/G-L1. 실제 G 승인/실 공급사는 후속이다.
- 시안 owner/billing과 admin/billing을 실제 file:// Chromium320으로 열었다. /tmp/ap-paid-owner-prototype-320.png와 /tmp/ap-paid-admin-prototype-320.png 직접 확인. 플랜/제공량·기간 사용량·결제 내역, 관리자 결과 확인/유예/환불 검토 흐름을 유지한다. 시안29,000/31,900원은 출시 가격으로 승계하지 않는다.
- 공식 adapter 근거(2026-09-26): [빌링 연동](https://docs.tosspayments.com/guides/v2/billing/integration), [API](https://docs.tosspayments.com/reference), [멱등 헤더](https://docs.tosspayments.com/reference/using-api/authorization). 자체 갱신 scheduler, 같은 orderId 조회, 취소 거래별 원장, 멱등키 유효기간을 반영한다. 빌링 cancels.cancelRequestId는 null이므로 원격 refund를 그 값으로 매핑하지 않는다. 공급사 실제 호출은 미실행이다.

## 1. 제품별 가격/동의/기간 원장과 조회 API

**Files:** 새 AP migration000069_paid_billing.sql·Field000063_paid_billing.sql; 각 src/billing.ts·billing-routes.ts·billing-period.ts; 기존 business.ts/app.ts/subscription.ts/trial-access.ts; 각 test/paid-billing.db.test.ts·billing-period.test.ts. AP 이후 Field의 동일 요구를 자체 소유 경로로 구현한다.

- [x] native plan route404와 승인/권한/멱등/불변 가격·월말 규칙의 실패를 먼저 실행한다. AP24059·Field10713 plan404, AP53054/calendar 부재 실제 red 기록.
- [x] **A07.F09.PLAN-BASIS 완료 checkpoint / b639a4d:** plan 요청/다른 operator 승인/판매 중지·자체 read API와 immutable plan/consent/기간 저장 기반, 월말 계산. 최종 repair4350 exit0/남은P1/P2 없음·focused DB 각3/3·managed53591 migrate/build/ready·양웹200, TASKS도 같은 세부 ID로 체크했다. owner 동의와 결제 성공 범위는 포함하지 않는다.
- [x] **A07.F09.CONSENT-BACKEND / 1a04815:** owner/current session의 명시 plan/terms/자동갱신/첫 승인 시각 정책 동의→한 consent/authorization·동일 UUID 복구, org/actor/session/mode/MID/nonce/TTL binding·암호화 authKey pending202·미시작 cancel/비밀값 폐기와 product-owned Toss/context port. native84322/76016 각3/3·adapter 각2/2·마지막 type/lint/build·독립92527 exit0/추가P1/P2 없음, managed73001 반영. **인증 발급/청구 worker·실 SDK 화면/카드 인증 성공은 포함하지 않는다.**
- [x] **AUTH-ISSUE(ed61b70)·FIRST-CHARGE(00c3e0d)**에서 첫 transaction/period 생성·authorization 발급·첫 청구/동일order 미상 복구 완료. 한 조직의 동시 활성 구독/미확인 결제는 한 개이며 기존 pending을 fake paid로 바꾸지 않는다.
- [x] 최초 기준일(Asia/Seoul)을 유지해 1월31→2월말→3월31로 계산한다. 실제 기간은 `(subscription_id,billing_period)` 유일하고 계획된 금액/세금·consent version은 수정하지 않는다. 승인 plan과 consent binding·기간 overlap23P01/인접 허용까지 native DB38087/75037 각3/3·calendar95519 각1/1 실제 확인했다. 최초 결제 기준시각 채택도 FIRST-CHARGE(00c3e0d)의 원격 승인시각 검증/기간 확정으로 완료했으며 실제 월 갱신은 아래 미완료 범위다.
- [x] **PLAN-BASIS·CONSENT-BACKEND·FIRST-CHARGE의 native backend 범위:** 격리 DB에서 owner/editor/외부 org·동의 누락·미승인 plan·불변 원장·현재 상태를 검수했다. basis38087/75037 각3/3, consent84322/76016 각3/3, first-charge97718/12549 각12/12의 기존 로그와 해당 native 테스트가 근거다. 이번 문서 대조에서 테스트를 재실행하지 않았다. 실 SDK/로그인/전체 사용자 동선 검수는4절에 남는다.

핵심 저장 계약:

```sql
-- 각 제품 schema 안에 별도로 만든다.
unique (subscription_id, billing_period)
check (total_amount = supply_amount + vat_amount)
check (currency = 'KRW' and total_amount > 0)
exclude using gist (subscription_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
-- 승인 후 price/terms/refund/offering 값 변경과 paid period의
-- subscription/amount/consent 변경은 trigger로 거절한다.
```

기간 겹침 차단은 각 제품 DB의 PostgreSQL17 btree_gist를 사용한다. [공식 범위 제약](https://www.postgresql.org/docs/17/rangetypes.html#RANGETYPES-CONSTRAINT), [btree_gist 설치 권한](https://www.postgresql.org/docs/17/btree-gist.html). AP에는 새로 마련하고 Field의 기존 예약 extension과 같은 DB 설치를 재사용한다. 운영 migration 권한/공급사는 후속 gate다. 두 제품 DB를 공유하지 않는다.

대표 native red:

```ts
const response = await app.inject({ method: 'POST', url: '/v1/admin/billing/plans',
  headers: { 'x-test-user': operator, 'idempotency-key': randomUUID() },
  payload: { name: '합성 테스트 구독', mode: 'test', totalAmount: 11000,
    supplyAmount: 10000, vatAmount: 1000, graceDays: 3, includedAiUnits: 500,
    termsVersion: 'synthetic-terms-v1', termsText: '합성 명시 동의 조건',
    refundVersion: 'synthetic-refund-v1', refundText: '합성 검수용 환불 조건',
    reference: 'SYNTHETIC-ONLY' } });
assert.equal(response.statusCode, 201, response.body);
```

## 2. 실제 provider port/거래 실행·미상 복구·갱신/해지

### 완료 checkpoint — A07.F09.RENEW-CANCEL-ACCESS.BACKEND (2026-09-27)

- 착수 HEADfc10170/clean·TASKS36[x]/7[ ]·managed65775 live. 직전 체크 정합성 commit은 progress. FIRST-CHARGE00c3e0d의 완료를 보존하며 실제 period0 전용 claim/paid 미반영 trial-access에 갱신·시간 기반 접근을 추가한다.
- Files: AP000073_billing_lifecycle.sql/Field000067_billing_lifecycle.sql; 각 billing-charge-execution/worker·billing-consent-routes·billing·subscription·trial-access, 새 subscription-access.ts·test/billing-lifecycle.db.test.ts. 기존 적용72/66와 공개 cross-product 계약은 변경하지 않는다.
- Requirements/QA: B01~B04/B10~B12·AP PRD2.8/Field3.8·보안5.4/5.5·QA43~46/113/126/146 해당 내부 부분. 제품별 own worker/DB/권한만 사용. 가격 판매 중지도 기존 동의 갱신을 바꾸지 않는다.
- Decisions: 원래 anchor+index의 다음 한 기간만 생성하고 기간 전체가 지난 미수금은 자동 몰아 청구하지 않는다. grace는 예정 period start+동의 graceDays로 고정해 worker 부재/재시도로 연장하지 않는다. 결제 승인시각은 거래에 보존하되 갱신으로 anchor/기간을 이동하지 않는다. owner/current session·Origin·UUID idempotency·org→sub/tx lock 해지로 미시작 원장을 취소하고 시작한 processing/unknown은 같은 주문 대조로 유지한다. 남은 paid 기간/기존 업무/확인키/export는 보존한다. 종료된 paid나 nonmock 미구독은 신규 업무만 거절하며 유효 paid/grace는 과거 trial 만료보다 우선한다. mock 체험 미시작의 기존 로컬 동작은 유지한다.
- Verification: 새 native 파일을 각 fixture own UUID PG17에 실행한다. 실패 먼저 확인 후 월말/동시/응답 유실·같은order·해지 선후·늦은 승인·고정grace/worker부재·미수기간/원장불변·권한/Origin/멱등을 구현한다. 직접 확장한 first-charge 파일만 관련 회귀에 포함한다. `node /tmp/{ap,field}-billing-lifecycle-run-db.mjs`, 각 API typecheck/build, `pnpm lint`, 좁은 read-only CLI 검토. tests는 synthetic provider, 실 PG/전체 QA/시안/UI는 미실행.
- Failure/rollback: 실패/unknown은 기존 transaction/request를 유지하고 새 주문을 생성하지 않는다. 적용 migration을 되돌리거나 원장을 삭제하지 않는다. 다음 HTTP 확정거절/환불/AI 제공량/SDK·UI 단계와 실 PG gate는 미완료로 남긴다.
- Review repair 추가 근거: CLI21200 P1(0.96) lookup 중 해지 뒤 POST 경합은 native3calls≠2로 재현해 구독별 send/cancel gate로 직렬화했다. 후속85028 P2(0.94)는 claim 뒤 실제 POST 전에 해지된 **미발송** 거래를 unknown으로 영구 보존해 새 가입을 막는 경우다. native81822/44662 unknown≠canceled를 재현했다. 당시 미커밋/미적용73/67의 추가 계획이었으나 AP73 적용 사고 이후 dispatch tracking은 새AP76으로 분리했고 Field67에 유지했다. ef0dfd3/managed95896에 반영됐으며 적용73~78/67~69를 덮어쓰지 않는다. 기존72/66 원장의 version0은 이미 호출됐을 수 있어 unknown을 유지하고, version1+marker 없음의 중지 거래만 로컬 미발송 실패/기간 취소로 닫는다. 외부 응답 불확실을 확정 실패로 바꾸지 않는다.
- [x] **A07.F09.RENEW-CANCEL-ACCESS.BACKEND** 원래 KST 기준일의 다음 한 기간 갱신·고정grace/worker 부재 시간 제한·owner/current session/org/Origin/UUID 해지·실제 send/cancel 직렬화·알려진 미발송 취소/unknown 대조·paid/grace/cleanup 접근·기존 업무/export 보존. 코드 **ef0dfd3**, AP73/76·Field67, 각 subscription-access/lifecycle/charge/consent/subscription/trial 모듈·native 검사. own UUID PG17 **70963/78883 각29/29 fail0/skip0 exit0**, 직접 관련 최초청구11 포함, 최종 정적65770 P1/P2 없음/0.87. **확정 HTTP거절·provider 환불·AI 제공량·SDK/결제 UI·실PG는 제외**한다.

### 완료 이력 — A07.F09.FIRST-CHARGE (2026-09-27)

- 착수: HEAD76a094a/status clean·TASKS35[x]/7[ ]·managed48041 실제 live를 확인했다. 직전 AUTH-ISSUE 구현/검수/체크/커밋은 progress다. 가격/동의/인증 발급은 완료로 유지하며 남은 첫 청구와 같은 주문 결과 대조만 추가한다.
- 새 schema: AP72/Field66, 가격/동의/기간의 명시 taxFreeAmount(미지정 legacy는 null/자동 청구 차단), 첫 period0의 승인 전 날짜 null→원격 approvedAt 최초 한 번 확정, 기간 겹침/경제값 불변 유지, 거래의 MID/API key fingerprint/claim·첫 시작 불변. 적용69~71/63~65는 수정하지 않는다.
- **완료 ID 추가 범위/근거:** PLAN-BASIS(b639a4d)와 CONSENT-BACKEND(1a04815)의 기존 체크는 유지한다. 최초 청구 연결에 필요한 명시 면세 snapshot/owner 대조·Toss port의 비밀키 fingerprint만 확장한다. 현재 plan/consent에는 면세값이 없고 모든 공급사 호출의 멱등성은 API key까지 묶인다([공식 헤더](https://docs.tosspayments.com/reference/using-api/authorization)). VAT로 면세를 추정하거나 키 회전 뒤 같은 멱등키로 재청구하지 않기 위한 새 범위다. 기존 승인 가격을 자동 수정/채움하지 않는다. 기존 가격 요청은 면세 미지정으로 보존하며 새 명시 버전만 청구 가능하다.
- 경로: 각 billing-charge-execution.ts·billing-charge-worker.ts·test/billing-charge.db.test.ts와 새 migration, 기존 billing/routes/consent 및 Toss metadata·package·managed worker 시작, 해당 port/config 검사와 기록 문서. 공개 cross-product 계약/다른 제품 domain·DB·UI는 변경하지 않는다.
- 요구/검수: AP PRD2.8·Field3.8·보안5.4/5.5·QA43~46/113/126/146 첫 거래/미상 복구 부분. native 승인 plan→동의→인증발급→period/transaction pending→durable claim→fixture charge/timeout→같은 order 조회를 먼저 red로 재현한다. 동시/미시작 stop·MID/key 변경·암호문·stale result·금액/세금/날짜 불일치·15일창을 own UUID PG17에 검사한다. supplier HTTP는 synthetic fetcher만 사용하며 실제 카드 청구/PG·UI·전체 QA는 미실행이다.
- 다음 갱신/해지/유예·확정 오류 분류·환불/entitlement·SDK callback/owner/admin UI는 별도 남은 PAID다. 이번 active/paid 반영은 해당 원격 DONE 검증에만 한정하며 production fixture/fake 성공은 없다.

- [x] **A07.F09.FIRST-CHARGE / 00c3e0d:** 최초 거래/기간/명시tax·동일order 조회·원래 키/본문/시작시각·멱등창/stale fencing·실 승인시각 한 번 확정 완료. native97718/12549 각12/12·port 각3/3·type/lint/build·CLI26858 P1/P2 없음(confidence0.82), managed65775 적용. TASKS36[x]/7[ ]·관련 문서를 같은 checkpoint로 체크. **갱신/해지/유예/환불/제공량/UI/실PG는 남는다.**

### 완료 이력 — A07.F09.AUTH-ISSUE (2026-09-26)

- 착수 근거: HEAD ed196d2, 작업트리 clean, TASKS 34개[x]/7개[ ]. CONSENT-BACKEND(1a04815)는 완료로 유지한다. 이번은 queued authKey를 실제 공급사 billingKey로 발급하는 제품별 worker와 재시작 복구다.
- 범위: 각 새 src/billing-authorization-execution.ts·billing-authorization-worker.ts·test/billing-authorization.db.test.ts, 새 AP71/Field65 migration, 각 package start 명령, managed runner, 환경 설명/완료 원장/인계. 기존 적용 migration은 변경하지 않는다. provider port/동의 API는 재구현하지 않는다.
- 요구/QA: AP PRD2.8·Field3.8·보안5.4/5.5·QA43~46/113/126/146 중 인증 실행/미상 복구. org→subscription/authorization 잠금, 공급사 호출 전 lease/동일 request key 저장, timeout/프로세스 중단은 unknown, 같은 키로만 재시도, 15일 멱등 유효창 이후 자동 재발급 금지. 설정 부재/다른 MID에서는 미시작만 blocked_integration이며 시작한 요청은 unknown을 유지한다.
- 성공은 암호화 credential 저장 및 authorization completed까지다. 구독 active/paid·거래/기간/첫 청구·갱신/환불/제공량/UI/실 PG는 이번 완료에 포함하지 않는다. 어떤 카드 청구도 이 worker에 연결하지 않는다.
- 검수: 각 own UUID PG17에서 새 native 파일의 성공/암호화·동시 worker·lease 만료·응답 유실 동일키·MID/키 부재·원래 TTL/취소·재시도창 초과를 먼저 red로 재현한다. 직접 영향을 받는 consent native 검사만 추가 실행하고 변경 API type/lint/build·read-only 독립 CLI 리뷰를 수행한다. live 호출과 전체 QA/시안 인수는 미실행으로 남긴다.

- [x] **A07.F09.AUTH-ISSUE / ed61b70:** 각 자체 발급 worker·동일키 unknown/만료 lease 복구·암호화 credential·stale claim/멱등창/만료 secret 폐기 완료. 최종 DB6174/91110 각9/9·type/lint/build exit0·repair79675 P1/P2 없음/confidence0.88·managed48041 적용. TASKS35개[x]/7개[ ]·phase/coverage/audit/인계도 동시 체크. **첫 청구/거래/갱신/환불/제공량/UI는 남으며 다음은 첫 청구다.**

### 착수 이력 — A07.F09.CONSENT-AUTH (2026-09-26)

- HEAD9734843/status clean·TASKS33[x]/7[ ]를 확인했다. 직전 turn은 PLAN-BASIS 구현/검수/commit·최신 managed53591 반영의 progress다. 이미 체크한 저장 기반/월말/trial/usage/위젯/보존/회수를 재구현하지 않는다.
- 먼저 product-owned Toss HTTP port와 별도 키/암호화 환경 검증, owner checkout의 승인 경제값/약관/자동 갱신/첫 승인 시각 정책 명시 동의→같은 UUID 복구·카드 인증 callback nonce/actor binding→암호화 authKey queued 상태를 구현한다. 신규 raw 카드 입력은 받지 않고 실제 카드 청구는 하지 않는다. queued는 인증 발급/결제 성공이 아니다.
- 파일 범위: 각 src/toss-billing.ts/billing-context.ts/billing-consent-routes.ts·business.ts/server.ts/app.ts/subscription.ts, AP70/Field64 추가 migration(이미 적용한69/63은 변경하지 않음), 각 test/toss-billing.adapter.test.ts/paid-billing-consent.db.test.ts·package unit 등록. 환경 설명/phase/이 인계도 같은 단계에 기록한다. 이후 worker/실행/갱신/환불/제공량/UI는 계속 남은 PAID 범위다.
- 관련 요구/검수: AP PRD2.8·Field3.8·보안5.4/5.5·QA43~46/113/126/146 저장/동의 부분. 각 own UUID PG17 새 consent 파일과 실제 adapter request/response 검사, 변경 범위 type/lint/build·좁은 CLI 리뷰만 실행한다. 외부 Toss HTTP는 fixture fetcher에서만 재현하며 live 호출·가격/MFA/법무·출시 게이트는 미실행이다.

**Files:** 각 src/toss-billing.ts·billing-worker.ts·billing.ts·billing-routes.ts/server.ts; 각 package.json, tools/mock-run.mjs·환경 template; 각 test/toss-billing.adapter.test.ts·paid-billing.db.test.ts.

- [x] **CONSENT-BACKEND·AUTH-ISSUE·FIRST-CHARGE:** fixture provider를 native runtime에 주입하고 명시 동의→인증 binding→인증 발급→거래 pending→실행 성공/timeout→같은 주문 조회를 재현했다. auth6174/91110 각9/9·first-charge97718/12549 각12/12의 기존 결과이며 fixture는 테스트 주입에만 있다. 실 SDK/카드 인증 사용자 동선은4절 미완료다.
- [x] **CONSENT-BACKEND(1a04815)**에서 Toss client/secret/MID·별도 billing 암호화 key와 product/profile 검증 완료. 서버 키/billingKey/authKey는 응답/로그/원본 export에 노출하지 않는다. 원시 카드 번호를 받지 않는다.
- [x] **AUTH-ISSUE·FIRST-CHARGE:** 같은 요청 ID/claim을 DB에 저장한 뒤 provider를 호출하고, crashed processing/응답 유실은 원래 요청/같은 order로 대조한다. 금액/통화/MID/order/세금/승인시각을 검증해야 paid로 반영한다. 위 native 검사와 ed61b70/00c3e0d가 근거다.
- [x] **BILLING-UI-CALLBACK / 5ceec42 내부:** SDK return 페이지의 현재 session/org/state 대조와 인증 결과 재조회 동선을 연결했다. 공급사 실제SDK 인수는미실행이다. callback query만으로 인증/결제 성공을 표시하지 않는다.
- [x] **RENEW-CANCEL-ACCESS.BACKEND / ef0dfd3:** 월 갱신은 기존 동의 금액/원래 기준일로 한 기간만 만든다. unknown이면 새 order를 만들지 않는다. 과거 여러 기간을 몰래 묶어 청구하지 않는다. 실패는 승인된 grace 기간/cleanup mode로 구분한다.
- [x] **RENEW-CANCEL-ACCESS.BACKEND / ef0dfd3:** owner 해지는 아직 시작하지 않은 갱신을 중지하고 남은 paid 기간/기존 문의·예약·export를 유지한다. 이미 processing/unknown인 거래는 결과 확인 대상으로 남긴다. 다른 제품 구독을 호출하지 않는다.
- [x] **CONSENT-BACKEND·AUTH-ISSUE·FIRST-CHARGE의 현재 서버/worker:** 공급사 부재는 blocked_integration, 이미 시작한 요청은 unknown으로 유지하며 같은 원장을 보존한다. product/profile/MID/키 binding 및 test/live 설정 분리를 구현·검수했다. managed65775의 각 auth/first-charge worker도 blocked_integration ready다. 향후 갱신/환불 worker의 동일 조건 검수와 실 공급사 검수는 미완료다.

## 3. 환불·제공량·기능 제한

**Files:** 각 billing modules·새 refund/usage 원장 migration, AP customer-consultations.ts/agents.ts, Field site-generation.ts/worker.ts 및 기존 trial-access.ts; 각 native DB 검사.

- [x] **REFUND-DECLINE.BACKEND / 5ceec42:** 고객 요청→operator 검토/다른 승인→합성 provider cancel의 금액 상한/중복/timeout·동일 거래 조회를 own PG17에서 재현했다. 실환불은미실행이다.
- [x] **REFUND-DECLINE.BACKEND / 5ceec42 내부:** 해지와 환불을 별도 기록한다. 완료 환불의 실제 provider transaction을 저장하며 기존 지불·환불을 덮어쓰지 않는다. 부분 환불 합계는 실제 paid 금액 이하, 미상 환불 중 추가 cancel은 차단한다. 불확실한 cancel를 다른 취소와 임의 매핑하지 않는다.
- [x] **A07/F09.AI-ENTITLEMENT / a974b90 내부:** 승인된 제공량과 해당 paid period의 실제 소비/진행 중 예약을 제품별 원장으로 검사했다. 초과는 제한/경고이고 자동 추가 청구가 아니다. 기존 문의/예약 답변·확정·고객 확인키·export는 cleanup 상태에도 유지한다.
- [x] **RENEW-CANCEL-ACCESS.BACKEND / ef0dfd3:** 저장된 환불 상태/유예 만료/worker 부재·mode의 시간 기반 접근 검수 각29/29. 실제 provider 환불 실행/대조는 위 미완료 항목에 남는다.

## 4. 시안 기반 owner/admin UI·runtime·단계 완료 체크

**Files:** 각 web/src/*-subscription.tsx·새 *Billing.tsx/*BillingAdmin.tsx·admin.tsx/admin-sections.ts·CSS; 필요한 own HTTP/browser fixture와 tools/run-e2e.mjs; TASKS/coverage/audit/PHASE_2_EXECUTION_PLAN/인계/일지.

- [x] **BILLING-UI-CALLBACK / 5ceec42 내부:** owner/billing의 승인 plan/금액·세금·제공량·별도 동의·현재 paid 기간·갱신중지·실패 유예·결제/환불 요청/내역/재조회를 own API에 연결했다.
- [x] **BILLING-ADMIN-UI / a974b90 내부:** admin/billing의 가격 요청/다른승인·판매중단·환불검토/다른승인화면을 실제 own API에 연결했다.
- [x] **BILLING-UI-CALLBACK / 5ceec42 내부:** 공급사/가격 부재는 실제사유/API거절과 신청제한으로 표시한다. mock fixture의 paid를 실 결제로 표시하지 않는다. 응답 유실은 저장한 request ID로 대조하고 재시도로 새 청구를 만들지 않는다.
- [x] **a974b90 내부:** 변경 범위 focused DB/consumer·type/lint/build·좁은 HTTP ready/auth 경계·CLI 독립 리뷰를 실행했다.
- [ ] 좁은 native browser/320px·전체 사용자 화면/동선은 사용자 최종 인수에 남긴다. 무관한 완료 기능/전체 Field/AP 회귀를 이유 없이 반복하지 않는다. 사용자 전체 시안/동선/실 공급사 테스트는 미완료로 구분한다.
- [x] **FIRST-CHARGE까지 runtime/완료 기록:** managed65775에 최신 build/migrate/각 worker를 반영하고 TASKS/phase/handoff에 00c3e0d·실제 검수·미검수/남은 항목을 기록했다. 이번 완료 표시 점검에서도 같은 session의 생존을 확인했으며 재시작하지 않았다.
- [x] **a974b90까지 내부:** 갱신/해지/환불/제공량/owner·admin UI의 각 범위 검수·runtime 반영·완료 체크를 추가했다. A07.F09.PAID 전체 체크는1~4 내부 완료 후에만 한다.

## 검수 명령

```bash
# 각 제품 native DB 파일만 own UUID PG17에 실행하는 focused runner 사용
pnpm --filter @fieldai/agent-api exec tsx --test test/paid-billing.db.test.ts
pnpm --filter @fieldai/field-api exec tsx --test test/paid-billing.db.test.ts
pnpm --filter @fieldai/agent-api exec tsx --test test/billing-period.test.ts test/toss-billing.adapter.test.ts
pnpm --filter @fieldai/field-api exec tsx --test test/billing-period.test.ts test/toss-billing.adapter.test.ts
pnpm typecheck
pnpm lint
pnpm build:agent
pnpm build:field
pnpm build:web:agent
pnpm build:web:field
```

아직 실행하지 않은 명령을 pass로 표시하지 않는다. 실결제·실 공급사 callback/계약·가격/세금/법무·G-A1/F3/L1은 후속 blocked_integration/미승인이다.

### 갱신/해지 추가 증거 보완 (2026-09-27, 진행 중)

- CLI85028 P2 confidence0.94와 실제81822/44662 red로 확인한 claim→POST 전 해지 경합: 새 추적 원장만 실제 dispatch 직전 증거를 기록하고 확실한 미발송은 취소/종료한다. 기존 worker started 원장은 version0으로 유지/unknown 조회한다. 양제품 own UUID PG17 focused35546/9335 exit0 각27/27 fail0/skip0. 최종 repair audit/중앙 UI/runtime 검수는 아직이다.
- AP73은 own mock에 이미 적용되어 동결. 뒤에 추가한 dispatch schema는 새AP76으로 분리했다. Field67은 own mock 미적용이므로 원본에 추가 유지. AP74/75도 적용돼 보완은 delivery78/public77로 분리한다. UI는 고정 시안, 새 기능만 `(추가)`이며 배치/스타일 재설계하지 않는다.

- CLI11284 terminalexit0/P2 confidence0.94: 기간 종료 직전 시작한 lookup이 종료 후 빈 결과를 반환하면 시작snapshot now로 갱신POST 가능. 새 native에서 실제 lookup 기다림 중 종료경계를 넘는 추가red를 재현하고 send gate에서 원래기간/15일멱등창을 현재elapsed clock으로 재확인한다. 양제품28/28은 이 새경계추가 전 검수이며 최종repair는 아직이다.

### 갱신/해지 최종 완료 근거 — ef0dfd3 (2026-09-27)

- 실제 own UUID PG17 최종70963/78883 각29/29 exit0 fail0/skip0, /tmp/{ap,field}-billing-expiry-gate-final.log. 네 경합/중단/만료 지적은 실제red 후 수정했고 최종65770 read-only review P1/P2 없음/confidence0.87. 전체 typecheck50703·lint12958 및 managed95896 최신 양API/web build·AP78/Field69 적용/ready 확인.
- 전체 paid UI/실SDK/실PG·provider 환불/AI제공량·확정HTTP거절·QA/G는 미완료다. 과거 진행 중/다음 기록은 당시 이력이며 이 checkpoint와 TASKS를 우선한다.

## 현재 후속 범위 — BILLING-UI-CALLBACK / AI-ENTITLEMENT (2026-09-27)

- State: in_progress, Product AP/Field, Owner root. 착수 HEAD9a7fe33/clean·TASKS40[x]/7[ ]·managed95896 실제 live 확인. 기존 가격/동의/인증/청구/lifecycle는 완료 유지.
- Files: 양web 기존 subscription component 및 새 billing client/model/UI/callback, app/billing/return, 필요 시 admin billing 삽입. entitlement는 새 own helper/native 검사·agents/site-generation/usage와 필요 시 AP80/Field71. 신규refund/Toss/charge오류 및 AP79/Field70은 별도 Refund Agent 소유, 중앙 app/server/package/runtime는 root만 통합한다.
- Requirements/QA: AP2.8/Field3.8·보안5.4/5.5·QA43~46/113/126/146·UI14/16px·고정 owner/admin billing 구조. 명시 승인 가격/조건·자동갱신 동의·현재 own session/org/SDK state binding·pending/unknown/paid 구분·같은UUID 복구·남은paid/기존업무 보존. 시안 예시가격을 채택하지 않는다.
- Verification: 카드 복귀 parsing/session/org/state binding·URL secret 제거·응답 유실 동일intent/confirm 복구를 focused web unit 및 own native HTTP로 먼저 실패 재현한다. 모델 제공량은 승인 period/진행 중 예약/동시한도·실제소비/실패해제·다른제품미접근을 own UUID PG17로 확인한다. 관련 변경 type/lint/build·독립 read-only review·최신managed 반영. 사용자 최종 화면/동선/실SDK/실PG는 미실행으로 남긴다.
- Failure/recovery: callback query만으로 성공 표시 금지, 일회용 authKey/customerKey/state를 로그/URL export에 두지 않는다. 동일인증/같은조직/원래session으로만 queued 저장하며 재시도에서 새checkout/order 생성 금지. provider 없으면 실제 비활성 사유·blocked_integration. 기존 원장/unknown 유지.

- UI 추가 범위/근거: 판매가 중단된 기존 승인 플랜도 현재 구독의 이름·금액·제공량으로 표시해야 한다. 양 billingSnapshot에 org별 current plan projection만 추가하고 기존 paid-billing native에 판매중단 후 원래 조건 유지 assert를 먼저 추가한다. 기존 PLAN-BASIS 완료 이력은 유지, migration/경제값/승인 정책 변경 없음. 검수는 own UUID PG17의 해당 단일 파일만이다.

- Root static93322 P2/conf0.96 checkout·P2/conf0.97 mutation: productwide 한metadata key가 다른로그인/조직의새요청까지막음. 동일원요청binding은보존하면서 context별key/authorization receipt lookup으로격리한다. 기존unknown파기·자동새UUID금지, 서로다른account/org의독립새요청은허용. 집중nativeweb red→green 및narrowrepair로확인한다.

- Root repair41864 P2/conf0.92: org전환 중 늦은checkout응답이 이전attempt를현재화면에넣고SDK를열수있음. view epoch/currentorg fencing 및 SDK loader완료후 guard, originalcontext receipt는 scoped저장보존. 늦은checkout/SDK focused red→green 후같은좁은scope재검토. 관련늦은refund/cancel/read결과도현재view에만UI반영, backend이미접수된자체원장은보존한다.

## 현재 통합 완료 — 5ceec42 (2026-09-27)

- [x] BILLING-UI-CALLBACK 내부/API·metadata재시도: 양웹23/23(callback12+mutation11), own retiredplannative각1/1, rootwholetype73437/lint91115, final2382 noP1P2/.94. rootSDK/실기기/user최종미실행.
- [x] REFUND-DECLINE.BACKEND 내부: native각11/11+adapter2/2, operator현재권한/다른승인/부분합계/timeout/원키회전/미상GET-only, owner요청UI/mutation소비. fullrefundlifecyclefixture는정당원장단일case각1/1 red→green, 원래기대값유지.
- [x] 최신managed43912에양build/AP79·Field70+71 migrate/ready·ownrefundworker각1개·callback200/privacyheaders·protectedAPI401반영, TASKS44[x]와phase/coverage/audit/handoff/보고서증거기록. 코드5ceec42.
- [x] **a974b90 내부:** AI-ENTITLEMENT actualpaidperiod제공량/모델inflight·usage 및admin가격/환불UI 완료. AP80/Field72 실제적용·보존, 마지막schemaAP81/Field73.
- [ ] 실제 SDK/PG/MFA·최종 사용자화면/320px·전체QA/G별도미검수. 해당 완료 내부 기능은 다시 구현하지 않는다.

## 중앙 적용 완료 — a974b90 (2026-09-27)

Root가 마지막 source의 whole type97507·lint58007 exit0 및 launcher최소repair scopedlint/syntax0을 확인했다. old43912 Ctrl+C terminalexit1, first31268의compiledCLI mockprofile 누락exit1을보존한다. 명시ownprofile전달 후 **managed83305** 최신 양API/webbuild·AP81/Field73마이그레이션·quiesced기준선·Fieldroute-keyworker local_reconciliation을반영했다. 실제runtime-evidence exit0: 양ready/workspace/admin200, 보호API401, AP SSR 두홈링크, ownbaseline각1·receiptAP3/Field1. controller35492/Fieldworker36190각1·같은parent 확인. 원장TASKS49[x]/9[ ]·인계/coverage/audit/phase에체크하고sourcecommit **a974b90**으로저장했다.

전체LLM/PG/MFA/발송/DNS/TLS·운영restore·전체E2E·사용자최종UI/기기/동선/출시는미검수다. 고정reference변경없음. source미상원장을초기화하거나새UUID재발송하지않는다. 적용schemaAP81/Field73은동결하고필요한추가schema만AP82/Field74부터조율한다. 재현한새오류없이는이미끝난집중검수/구현을반복하지않는다.
