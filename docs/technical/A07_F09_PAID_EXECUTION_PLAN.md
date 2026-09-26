# A07.F09.PAID 독립 유료 구독 구현 계획

> For agentic workers: 기존 사용자 지시대로 이 세션에서 execute-plan/TDD를 순차 적용한다. 매 작업 전 TASKS 완료 체크를 읽고 해당 하위 단계 완료 즉시 체크한다. 별도 에이전트나 새 승인 단계는 요청하지 않았다.

**Goal:** AP와 Field 각각 승인된 가격 버전·명시 동의·월 구독 거래·갱신/해지/유예/환불·기능 제한·사업자/관리자 UI를 자체 DB/API/worker에 연결한다. 실 공급사 키/계약 없는 환경은 blocked_integration이며 유료 성공을 모의하지 않는다.

**Architecture:** 현재 제품별 trial은 완료 범위로 유지한다. 제품별 billing 모듈·migration·provider/암호화 키·worker를 독립 추가한다. 동일한 계산/계약 형태라도 다른 제품 domain/DB를 import하지 않는다. 가격/약관/환불/제공량 승인본은 불변이며 동의 당시 plan ID를 구독과 기간 원장이 참조한다. 공급사 결과 미상은 기존 order/transaction을 조회하고 새 청구를 만들지 않는다.

**Tech Stack:** 기존 TypeScript/Fastify/Next·제품별 PostgreSQL17. 추가 결제 SDK 패키지 없이 공식 Toss HTTP adapter와 필요한 카드 인증 JS SDK를 사용한다. 승인된 가격/키가 없으면 기존 서버는 정상 실행하고 결제 버튼은 차단 사유를 표시한다.

## 기준/착수 증거

- HEAD0802a23, git status clean. TASKS 내부 완료32개/미완료7개 중 A07.F09.PAID 선택. subscription.ts 양제품은 trial과 checkout503뿐이며 billing period/plan/transaction 원장은 없다. 이미 완료된 trial/usage/설치/보존/회수는 다시 만들지 않는다.
- 요구: architecture B01~B04/B10~B12·결정17, AP PRD2.8·Field PRD3.8, 보안5.4/5.5·QA43~46/113/126/146·G-A1/G-F3/G-L1. 실제 G 승인/실 공급사는 후속이다.
- 시안 owner/billing과 admin/billing을 실제 file:// Chromium320으로 열었다. /tmp/ap-paid-owner-prototype-320.png와 /tmp/ap-paid-admin-prototype-320.png 직접 확인. 플랜/제공량·기간 사용량·결제 내역, 관리자 결과 확인/유예/환불 검토 흐름을 유지한다. 시안29,000/31,900원은 출시 가격으로 승계하지 않는다.
- 공식 adapter 근거(2026-09-26): [빌링 연동](https://docs.tosspayments.com/guides/v2/billing/integration), [API](https://docs.tosspayments.com/reference), [멱등 헤더](https://docs.tosspayments.com/reference/using-api/authorization). 자체 갱신 scheduler, 같은 orderId 조회, 취소 거래별 원장, 멱등키 유효기간을 반영한다. 빌링 cancels.cancelRequestId는 null이므로 원격 refund를 그 값으로 매핑하지 않는다. 공급사 실제 호출은 미실행이다.

## 1. 제품별 가격/동의/기간 원장과 조회 API

**Files:** 새 AP migration000069_paid_billing.sql·Field000063_paid_billing.sql; 각 src/billing.ts·billing-routes.ts·billing-period.ts; 기존 business.ts/app.ts/subscription.ts/trial-access.ts; 각 test/paid-billing.db.test.ts·billing-period.test.ts. AP 이후 Field의 동일 요구를 자체 소유 경로로 구현한다.

- [x] native plan route404와 승인/권한/멱등/불변 가격·월말 규칙의 실패를 먼저 실행한다. AP24059·Field10713 plan404, AP53054/calendar 부재 실제 red 기록.
- [x] **A07.F09.PLAN-BASIS 완료 checkpoint / b639a4d:** plan 요청/다른 operator 승인/판매 중지·자체 read API와 immutable plan/consent/기간 저장 기반, 월말 계산. 최종 repair4350 exit0/남은P1/P2 없음·focused DB 각3/3·managed53591 migrate/build/ready·양웹200, TASKS도 같은 세부 ID로 체크했다. owner 동의와 결제 성공 범위는 포함하지 않는다.
- [x] **A07.F09.CONSENT-BACKEND / 1a04815:** owner/current session의 명시 plan/terms/자동갱신/첫 승인 시각 정책 동의→한 consent/authorization·동일 UUID 복구, org/actor/session/mode/MID/nonce/TTL binding·암호화 authKey pending202·미시작 cancel/비밀값 폐기와 product-owned Toss/context port. native84322/76016 각3/3·adapter 각2/2·마지막 type/lint/build·독립92527 exit0/추가P1/P2 없음, managed73001 반영. **인증 발급/청구 worker·실 SDK 화면/카드 인증 성공은 포함하지 않는다.**
- [ ] 첫 transaction/period 생성·authorization 발급/청구 실행은 다음 worker 단계다. 한 조직의 동시 활성 구독/미확인 결제는 한 개이며 기존 pending을 fake paid로 바꾸지 않는다.
- [x] 최초 기준일(Asia/Seoul)을 유지해 1월31→2월말→3월31로 계산한다. 실제 기간은 `(subscription_id,billing_period)` 유일하고 계획된 금액/세금·consent version은 수정하지 않는다. 승인 plan과 consent binding·기간 overlap23P01/인접 허용까지 native DB38087/75037 각3/3·calendar95519 각1/1 실제 확인했다. 최초 결제 기준시각 채택은 provider 실행 단계에서 추가한다.
- [ ] 격리 DB에서 owner/editor/외부 org·동의 누락·미승인 plan·불변 원장·현재 상태를 검수한다.

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

### 현재 선택 — A07.F09.AUTH-ISSUE (2026-09-26)

- 착수 근거: HEAD ed196d2, 작업트리 clean, TASKS 34개[x]/7개[ ]. CONSENT-BACKEND(1a04815)는 완료로 유지한다. 이번은 queued authKey를 실제 공급사 billingKey로 발급하는 제품별 worker와 재시작 복구다.
- 범위: 각 새 src/billing-authorization-execution.ts·billing-authorization-worker.ts·test/billing-authorization.db.test.ts, 새 AP71/Field65 migration, 각 package start 명령, managed runner, 환경 설명/완료 원장/인계. 기존 적용 migration은 변경하지 않는다. provider port/동의 API는 재구현하지 않는다.
- 요구/QA: AP PRD2.8·Field3.8·보안5.4/5.5·QA43~46/113/126/146 중 인증 실행/미상 복구. org→subscription/authorization 잠금, 공급사 호출 전 lease/동일 request key 저장, timeout/프로세스 중단은 unknown, 같은 키로만 재시도, 15일 멱등 유효창 이후 자동 재발급 금지. 설정 부재/다른 MID에서는 미시작만 blocked_integration이며 시작한 요청은 unknown을 유지한다.
- 성공은 암호화 credential 저장 및 authorization completed까지다. 구독 active/paid·거래/기간/첫 청구·갱신/환불/제공량/UI/실 PG는 이번 완료에 포함하지 않는다. 어떤 카드 청구도 이 worker에 연결하지 않는다.
- 검수: 각 own UUID PG17에서 새 native 파일의 성공/암호화·동시 worker·lease 만료·응답 유실 동일키·MID/키 부재·원래 TTL/취소·재시도창 초과를 먼저 red로 재현한다. 직접 영향을 받는 consent native 검사만 추가 실행하고 변경 API type/lint/build·read-only 독립 CLI 리뷰를 수행한다. live 호출과 전체 QA/시안 인수는 미실행으로 남긴다.

- [x] **A07.F09.AUTH-ISSUE / ed61b70:** 각 자체 발급 worker·동일키 unknown/만료 lease 복구·암호화 credential·stale claim/멱등창/만료 secret 폐기 완료. 최종 DB6174/91110 각9/9·type/lint/build exit0·repair79675 P1/P2 없음/confidence0.88·managed48041 적용. TASKS35개[x]/7개[ ]·phase/coverage/audit/인계도 동시 체크. **첫 청구/거래/갱신/환불/제공량/UI는 남으며 다음은 첫 청구다.**

### 현재 선택한 미완료 범위 — A07.F09.CONSENT-AUTH (2026-09-26)

- HEAD9734843/status clean·TASKS33[x]/7[ ]를 확인했다. 직전 turn은 PLAN-BASIS 구현/검수/commit·최신 managed53591 반영의 progress다. 이미 체크한 저장 기반/월말/trial/usage/위젯/보존/회수를 재구현하지 않는다.
- 먼저 product-owned Toss HTTP port와 별도 키/암호화 환경 검증, owner checkout의 승인 경제값/약관/자동 갱신/첫 승인 시각 정책 명시 동의→같은 UUID 복구·카드 인증 callback nonce/actor binding→암호화 authKey queued 상태를 구현한다. 신규 raw 카드 입력은 받지 않고 실제 카드 청구는 하지 않는다. queued는 인증 발급/결제 성공이 아니다.
- 파일 범위: 각 src/toss-billing.ts/billing-context.ts/billing-consent-routes.ts·business.ts/server.ts/app.ts/subscription.ts, AP70/Field64 추가 migration(이미 적용한69/63은 변경하지 않음), 각 test/toss-billing.adapter.test.ts/paid-billing-consent.db.test.ts·package unit 등록. 환경 설명/phase/이 인계도 같은 단계에 기록한다. 이후 worker/실행/갱신/환불/제공량/UI는 계속 남은 PAID 범위다.
- 관련 요구/검수: AP PRD2.8·Field3.8·보안5.4/5.5·QA43~46/113/126/146 저장/동의 부분. 각 own UUID PG17 새 consent 파일과 실제 adapter request/response 검사, 변경 범위 type/lint/build·좁은 CLI 리뷰만 실행한다. 외부 Toss HTTP는 fixture fetcher에서만 재현하며 live 호출·가격/MFA/법무·출시 게이트는 미실행이다.

**Files:** 각 src/toss-billing.ts·billing-worker.ts·billing.ts·billing-routes.ts/server.ts; 각 package.json, tools/mock-run.mjs·환경 template; 각 test/toss-billing.adapter.test.ts·paid-billing.db.test.ts.

- [ ] fixture provider를 native runtime에 주입하고 명시 동의→카드 인증 binding→거래 pending→실행 성공/timeout→같은 주문 조회를 먼저 재현한다. 시험 adapter를 runtime fallback으로 넣지 않는다.
- [x] **CONSENT-BACKEND(1a04815)**에서 Toss client/secret/MID·별도 billing 암호화 key와 product/profile 검증 완료. 서버 키/billingKey/authKey는 응답/로그/원본 export에 노출하지 않는다. 원시 카드 번호를 받지 않는다.
- [ ] 같은 요청 ID를 DB에 저장한 뒤 provider 호출하며 crashed processing은 unknown으로 대조한다. 콜백은 결과를 신뢰하지 않고 현재 원격 주문을 조회한다. 금액/통화/MID/order와 저장 요청이 일치해야 paid로 반영한다.
- [ ] 월 갱신은 기존 동의 금액/원래 기준일로 한 기간만 만든다. unknown이면 새 order를 만들지 않는다. 과거 여러 기간을 몰래 묶어 청구하지 않는다. 실패는 승인된 grace 기간/cleanup mode로 구분한다.
- [ ] owner 해지는 아직 시작하지 않은 갱신을 중지하고 남은 paid 기간/기존 문의·예약·export를 유지한다. 이미 processing/unknown인 거래는 결과 확인 대상으로 남긴다. 다른 제품 구독을 호출하지 않는다.
- [ ] 공급사 없는 서버/worker는 blocked_integration이며 정해진 동일 원장을 보존한다. 승인 test plan은 nonproduction test key에서만, live plan은 live 승인에서만 실행한다.

## 3. 환불·제공량·기능 제한

**Files:** 각 billing modules·새 refund/usage 원장 migration, AP customer-consultations.ts/agents.ts, Field site-generation.ts/worker.ts 및 기존 trial-access.ts; 각 native DB 검사.

- [ ] 고객 요청→operator 검토/다른 승인→provider cancel의 금액 상한/중복/timeout·동일 거래 조회를 재현한다.
- [ ] 해지와 환불을 별도 기록한다. 완료 환불의 실제 provider transaction을 저장하며 기존 지불·환불을 덮어쓰지 않는다. 부분 환불 합계는 실제 paid 금액 이하, 미상 환불 중 추가 cancel은 차단한다. 불확실한 cancel를 다른 취소와 임의 매핑하지 않는다.
- [ ] 승인된 제공량과 해당 paid period의 실제 소비/진행 중 예약을 제품별 원장으로 검사한다. 초과는 제한/경고이고 자동 추가 청구가 아니다. 기존 문의/예약 답변·확정·고객 확인키·export는 cleanup 상태에도 유지한다.
- [ ] 환불 전후/유예 만료/worker 부재의 시간 기반 접근을 검수하고 paid가 유효하면 과거 trial 만료만으로 신규 기능을 거절하지 않는다.

## 4. 시안 기반 owner/admin UI·runtime·단계 완료 체크

**Files:** 각 web/src/*-subscription.tsx·새 *Billing.tsx/*BillingAdmin.tsx·admin.tsx/admin-sections.ts·CSS; 필요한 own HTTP/browser fixture와 tools/run-e2e.mjs; TASKS/coverage/audit/PHASE_2_EXECUTION_PLAN/인계/일지.

- [ ] owner/billing의 plan/금액·세금·제공량·별도 동의·현재 paid 기간·다음 갱신·해지·실패 유예·결제/환불 내역/결과 재조회와 admin/billing의 계획 승인·조회/환불 검토를 실제 API에 연결한다.
- [ ] 공급사/가격 부재는 사유와 비활성 버튼으로 표시한다. mock fixture의 paid를 실 결제로 표시하지 않는다. 응답 유실은 저장한 request ID로 대조하고 재시도로 새 청구를 만들지 않는다.
- [ ] 변경 범위 DB/unit·type/lint/build, 좁은 native HTTP/320px 흐름, CLI 독립 리뷰를 실행한다. 무관한 완료 기능/전체 Field/AP 회귀를 이유 없이 반복하지 않는다. 사용자 전체 시안/동선/실 공급사 테스트는 미완료로 구분한다.
- [ ] 실제 살아 있는 managed48041을 확인하고 필요한 시점에만 정상 종료/최신 mock build 반영한다. 완료 하위 범위·코드 commit·실제 검사·미검수/남은 항목을 TASKS/phase/handoff에 체크한다. A07.F09.PAID 전체 체크는1~4 내부 완료 후에만 한다.

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
