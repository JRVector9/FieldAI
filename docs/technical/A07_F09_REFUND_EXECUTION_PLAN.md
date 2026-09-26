# A07.F09.REFUND-DECLINE — 승인 환불·확정 거절 내부 실행 계획

## 착수 / 소유 / 완료 이력

- Task/Product/Owner: A07.F09.REFUND-DECLINE / AP·Field 독립 backend / `/root/custom_domain`.
- State: implemented / verified(아래 own synthetic local 범위). 착수 HEAD9a7fe33, TASKS 내부40[x]/7[ ]. 도메인ef0dfd3 및 가격/동의/인증/최초청구/갱신 완료 이력을 유지한다. 새 미완료 환불·HTTP 확정거절 범위만 구현한다.
- 기존 FIRST-CHARGE·RENEW-CANCEL-ACCESS의 추가 범위 근거: 기존 Toss port는 모든 HTTP 오류를 unknown으로 취급하고 취소 조회 필드를 제공하지 않는다. charge execution은 검증된 최초 요청의 확정 카드 거절을 소비하지 않는다. 이 두 경로만 좁게 확장하며 과거 완료 체크를 되돌리지 않는다.
- 허용 경로: 양 `apps/{agent,field}-api/src/billing-refund{,-routes,-execution,-worker}.ts`, 새 `test/billing-refund.db.test.ts`, `test/toss-billing-refund.adapter.test.ts`, 기존 `src/toss-billing.ts`와 `src/billing-charge-execution.ts`의 오류 소비, AP `migrations/000079_billing_refunds.sql`, Field `migrations/000070_billing_refunds.sql`, 이 계획.
- root 전용: app/server/business runtime/package/mock-run, billing.ts/billing-routes/subscription-access, 웹 UI, 공통 문서/완료 원장/인계/git/서버 재기동. 등록·worker/package patch는 root에 제출한다. AP80/Field71 quota, Field72 public, delivery 파일은 수정하지 않는다.

## 요구 / QA / 게이트

- AP PRD2.8·Field PRD3.8 자체 구독/환불, 보안 운영5.4·5.5 자체 법정 결제 기록 보존; QA43~46(원장·중복·unknown·해지/환불 분리), QA49/146/157(독립 관리자·다른 운영자 승인·실 MFA), QA159(비밀값 미노출).
- 자기 조직 owner UUID 요청(requested) → 운영자 A 명시 검토(reviewed) → 다른 운영자 B 승인(pending) → durable worker. 운영자 대행 요청도 원 요청자/사유/근거를 보존하며 승인자는 대행 요청자·검토자와 달라야 한다. 고객 자신의 조직만 안전한 원장을 조회한다. 승인 당시 양 운영자 현재 권한을 트랜잭션에서 재검사한다. live 관리자 MFA 미연결은 blocked_integration.
- amount/taxFreeAmount는 승인 거래의 남은 잔액·면세 범위 내 명시 정수이며 부분환불 누적은 원결제 이하. 한 payment에 미완료 환불 한 개. 동일 UUID 요청은 body hash 재시도, 충돌은409.
- 환불과 구독/연결 해지를 분리한다. 원결제·동의·거래·환불·감사 원장은 삭제하거나 고객 대화와 함께 정리하지 않는다.

## 공식 계약 확인 / 설계 결정

- 실제 열람(2026-09-27): [Toss core API](https://docs.tosspayments.com/reference), [endpoint 오류](https://docs.tosspayments.com/reference/error-codes), [멱등 header](https://docs.tosspayments.com/reference/using-api/authorization). Billing `/v1/billing/{billingKey}`는 core **카드 자동결제 승인** 표를 적용하며 Brandpay 자동결제 실행 표를 혼용하지 않는다.
- `POST /v1/payments/{paymentKey}/cancel`: amount·taxFreeAmount·KRW·opaque refund UUID를 포함한 cancelReason을 명시, 자체 idempotency UUID·원 MID/키 fingerprint·암호화 paymentKey·본문을 commit한 뒤 호출한다. 외부 공급사 호출 검수는 수행하지 않는다.
- cancels의 고유 transactionKey·DONE·취소시각·정확한 reason/amount/tax와 기존 취소 baseline/전체 잔액/기존 성공 원장을 함께 대조한다. 정상/빌링 cancels.cancelRequestId는 null이므로 연결 근거로 사용하지 않는다. 취소항목 누락·외부 취소·복수 후보·binding 불일치는 성공 추정 금지.
- 전송 전 GET 같은 order로 원결제/기존 환불/잔액을 검증한다. durable dispatched 이후 unknown은 GET만 수행하며 추가 POST하지 않는다. 동일금액·balance 감소만으로 자기 환불을 연결하지 않는다.
- 확정 거절은 core Billing endpoint의 좁은 card-decline code+HTTP status allowlist만 소비한다. 최초 POST의 확정 오류만 실패 처리한다. 이미 unknown이었던 거래의 replay 거절/duplicate/auth/transport/5xx/임의4xx는 unknown으로 보존한다.
- profile/provider/키/MID/암호화 binding이 불충분하면 blocked_integration. 다른 제품의 키/DB/worker/원장을 import하지 않는다.

## 검수 명령 / 환경

- own UUID PostgreSQL17 + 합성 provider, 테스트 DB의 제품/호스트/포트/사용자/UUID 이름을 검증한다. 빈 UUID DB→own migration, peer env 제거. migration 실패에 fallback하지 않는다.
- `node /tmp/ap-billing-refund-run-db.mjs` / `node /tmp/field-billing-refund-run-db.mjs`: 새 native 환불/확정거절 집중 검수. 의미있는 red→green과 실제 로그를 아래 기록한다.
- `pnpm --filter @fieldai/agent-api exec tsx --test test/toss-billing-refund.adapter.test.ts` / Field equivalent.
- 양 API `pnpm --filter @fieldai/{agent,field}-api typecheck`, own lint·build. peer 작업 오류는 해당 소유 agent/root에 전달하고 pass 주장 금지.
- 승인된 ak 독립 CLI `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only`의 좁은 own 경로 검토, P1/P2 보완 후 clean 확인.
- UI는 root 소유이므로 이 backend 단계 시안/브라우저 미검수. 실제 PG 환불/청구·SDK·실기기·전체QA/G·운영 배포/삭제는 미실행이며 사용자 후속 gate다.

## 단계 체크

- [x] 의미있는 adapter/native 실패 재현. AP adapter 실제2/2 fail(unknown≠declined/refund부재), AP native42935 exit1 새 route404/초기decline unknown≠failed. 원 기대값을 유지했다.
- [x] 독립 schema/domain/routes/dual approval/durable refund worker.
- [x] 정확 거래 대조/부분합계/unknown GET-only/권한·보존·키binding.
- [x] core Toss 확정 카드 거절 분류와 최초 charge 소비.
- [x] own 집중 검수·타입/lint/build·독립 review.
- [x] root 등록 patch 제출·중앙 createApp 통합 확인·완료 원장/인계 보고.
- [ ] root worker/package/mock-run 통합·최신 managed 반영(중앙 소유).
- [ ] 실 공급사/실 MFA/법무 환불 정책 승인/사용자 최종 UI 인수(별도 외부 gate).

## 실제 명령 / 결과 / 실패 / 남은 작업

- 착수 read-only: AGENTS6.0/6.1, TASKS/handoff/git 현재상태, own Toss/charge/schema/권한/native fixture를 확인했다. 최초 잘못 추정한 infra migration glob은 zsh no matches; 실제 apps 경로를 rg --files로 확인했다. 테스트 pass로 계산하지 않는다.
- 아직 환불 코드/검수 미실행. 원 DB·operational 공급사·managed 서버·도메인 완료 구현은 변경하지 않았다.


### 실제 중간 검수(2026-09-27)

- adapter AP 실제 red exit1 0/2→구현 focused exit0 2/2. Field34812 exit0 2/2. 합성 fetcher만 사용, Toss 호출 없음.
- native 정상 중앙 createApp(직접 register 없음), `node /tmp/ap-billing-refund-run-db.mjs`57185 / Field45251 **exit0 각각8/8 fail0/skip0**, `/tmp/{ap,field}-billing-refund-green.log`. own UUID PG17, 제품별 emptyDB migration, 합성 provider/고객/운영자/암호화키. 실제 카드 환불이 아니다.
- 확인한 실패/복구: owner 멱등/다른 조직, 선승인409/자기승인403, 부분2회→전액합계/구독 유지, lost response exact GET/POST1회, 다른 reason의 동일금액 취소 미연결/unknown GET-only, provider 부재/원키회전 미발송 block, lookup 대기 중 승인자 회수→미발송 block, 외부 취소 대사 불일치→미발송 block, 환불/원결제 삭제 및 금액 변경 거부, 최초HTTP declined→failed 및 이전 unknown의 replay declined→unknown.
- 타입 첫9561 exit2는 native actor가 randomUUID template literal로 좁혀진 fixture 오류; actor:string 명시 후 AP9883/Field73091 **exit0**. 첫green71803 exit1은 fixture SQL quote 수정 중 구문오류(경제 검수 pass 아님), 정확한 SQL quote만 수정해 위8/8 검수했다.
- 독립 CLI58435 gpt-6-sol/high read-only `/tmp/billing-refund-audit{,-result.md}` 진행 중. 결과 미확인이며 clean으로 주장하지 않는다.
- root 중앙 등록 완료. 아직 worker/package/mock-run 시작은 root 후속이며 기존 managed 환경을 child가 수정/재기동하지 않았다.

### Root 등록/실행 제안

- 양API app.ts: `registerBillingRefundRoutes(app,businessRuntime)` 기존 business runtime block 안1회(이미 root 적용).
- 양API package script `start:billing-refund`: `node dist/billing-refund-worker.js` (기존 charge worker script와 동일), test:db own 목록에 `test/billing-refund.db.test.ts`, focused adapter는 unit 목록에 추가.
- mock-run의 제품별 시작목록에 own refund worker를 기존 charge worker와 나란히1개 추가. 공급사 미설정 ready(blocked_integration), pending 승인건은 원장상 blocked, fake 환불 성공 없음.
- 정확 API: owner GET/POST `/v1/subscription/refunds` POST `{periodId,amount,reason}`; 관리자 GET/POST `/v1/admin/billing/refunds` 대행POST `{organizationId,periodId,amount,reason,reference}`; 관리자 `/:id/review` `{reason,reference,taxFreeAmount}`, `/:id/approve`/`reject` `{reason}`. POST 모두 UUID `Idempotency-Key`.
- owner safe DTO: id/periodId/amount/taxFreeAmount/state/reason/refundVersion/createdAt/reviewedAt/approvedAt/completedAt/errorCode. 관리자 추가 organizationId/requestedRole/requestedBy/reviewedBy/approvedBy/reference/reviewReason/approvalReason. paymentKey/transactionKey/MID/fingerprint/ciphertext를 노출하지 않는다.


### 최종 자체 검수 / 인계

- 추가 요구 확인: 무응답/증거 없는 timeout은 unknown GET-only/미전송 거절 금지, 정수/잔여/면세/Origin/현재 session/owner 강등, 운영자 대행 요청자≠승인자를 집중 검수했다. AP96950/Field39761의 추가검수 exit1 각각7/11(4fail)은 SQL `next_attempt_at=now()`의 PG 마이크로초가 JS millisecond 기준보다 앞선 fixture 경계 문제였다. fixture due를 정확히 `clock_timestamp()-interval '1 second'`로 설정했고 서비스 기대값/unknown 로직은 변경하지 않았다.
- 최종 정상 createApp own UUID PostgreSQL17: AP **39861** / Field **3173** terminal **exit0 각각11/11 fail0/skip0**. 로그 `/tmp/ap-billing-refund-final.log`, `/tmp/field-billing-refund-final.log`. 최초8개 완료를 회귀 목적으로 무관 전체 QA로 늘린 것이 아니며 이 새 환불 범위의 추가 gate를 확인했다.
- 최종 타입 AP55819/Field6070 exit0. 좁은 own eslint22450 exit0(앞55523도0). API build AP84081/Field93837 exit0. 실제 diff check own 기존 Toss/charge 파일 exit0. 추가 tests 변경 뒤 API 구현 변경 없으므로 build 반복하지 않았다.
- 독립 CLI **58435 terminalexit0**, gpt-6-sol/high/read-only, `/tmp/billing-refund-audit-result.md`: **No concrete P1/P2 financial correctness or security findings**, raw confidence **moderate**, 수치 미출력. 코드 수정/DB/provider/network/runtime/test/peer source 검수 없이 정적 검토했다. 자체 native 결과와 별개다.
- 완료된 내부 범위는 위 `[x]`이며 출시/전체QA/G/실MFA·실Toss·법무 승인·UI/실기기 인수가 아니다. root는 TASKS/coverage/audit/mainhandoff를 같은 checkpoint에 갱신하고 코드 포함 commit을 기록한다. child는 중앙 원장/인계/git/managed를 수정하지 않았다.

정확한 다음 명령(root 후속, source 변경 시 필요한 범위만):

```bash
cd /Users/jr/Desktop/projects/FieldAI
sed -n '1,100p' docs/technical/A07_F09_REFUND_EXECUTION_PLAN.md
cat /tmp/billing-refund-audit-result.md
tail -n 20 /tmp/ap-billing-refund-final.log
tail -n 20 /tmp/field-billing-refund-final.log
pnpm --filter @fieldai/agent-api exec tsx --test test/toss-billing-refund.adapter.test.ts
pnpm --filter @fieldai/field-api exec tsx --test test/toss-billing-refund.adapter.test.ts
# 새 source를 고친 경우에만 own native 재검수
node /tmp/ap-billing-refund-run-db.mjs
node /tmp/field-billing-refund-run-db.mjs
```

- 복구: provider 부재/원key fingerprint 변경/현재 승인자 권한 부재/외부 환불 합계 불일치는 미전송 blocked, 설정/권한을 바로잡은 후 같은 환불 원장으로 재claim한다. durable 전송 이후에는 원 payment/order 조회만 하며 새POST·새key·별도환불 생성이나 임의 성공매핑을 하지 않는다. 결과 미상은 실제 supplier 대사 승인이 필요하며 현재 코드가 자동으로 원장을 지우거나 해지하지 않는다.

## 후속 좁은 범위 — owner mutation의 reload/unknown 재시도 metadata (2026-09-27)

- 착수 HEAD9a7fe33/TASKS40[x] 유지, 기존 refund backend 완료 검수는 재작업하지 않는다. root 요청으로 현재 양 billing-settings.tsx의 cancel/refund useRef만 저장하는 경로를 read-only 확인했다. reload가 원 UUID를 잃고 새 요청을 만들 수 있는 구체적 추가 요구다.
- 소유: 양웹 신규 `src/billing-mutation-client.ts`, `test/billing-mutation.test.tsx`, 이 계획만. 기존 settings/client/return/app/package/runtime/원장/인계/git는 root 소유이며 helper 사용 patch만 제출한다. 새로운 UI/디자인/시안 변경 없음.
- QA43~45/146/159: own product/org/user/current session/origin/원래 body/UUID binding, no card/auth/provider secret metadata, unknown 이후 새 UUID/다른본문 금지, reload 원 요청 복구, 타 세션/조직 실행 차단, 실제 환불접수·갱신중지 응답 DTO 검증.
- sessionStorage는 업무 원장이 아니라 이 브라우저 요청의 최소 metadata다. 초기 준비→전송 직전 unknown marker를 저장하고, transport/5xx/잘못된 DTO/409 conflict/in_progress는 UUID를 유지한다. 과거 unknown 뒤 현재 4xx는 최초 요청 미접수를 증명하지 못하므로 유지한다. 정확 접수/갱신중지 DTO 또는 첫 전송의 endpoint별 확정 precommit 거절만 해제한다. 같은 tab 동시 전송도 helper에서 차단한다.
- 검수 명령: `pnpm --filter @fieldai/agent-web exec tsx --test test/billing-mutation.test.tsx`, Field equivalent; own 신규 helper/test eslint; 양웹 typecheck. native web tests는 합성 fetch/storage이며 실제 브라우저/외부/금전/managed 조작이 아니다. 의미있는 focused red→green과 gpt-6-sol/high narrow read-only 검토 결과를 기록한다.
- [x] focused red 재현→metadata helper/DTO/오류 분류/바인딩 구현.
- [x] focused green·타입·독립 좁은 검토 및 root 정확 사용 patch 제출.
- [ ] root 기존 UI helper 연결·사용자 최종 화면 인수(중앙/후속 범위).

### Mutation helper 실제 검수 / root 사용 patch

- 최초 focused AP `/tmp/ap-billing-mutation-red.log` exit1 0/7(새 helper 미구현으로 각 feature assertion 실패). 테스트 삭제/현재 구현에 기대값을 맞추지 않고 helper를 생성했다.
- 구현 뒤 실제 `pnpm --filter @fieldai/agent-web exec tsx --test test/billing-mutation.test.tsx` / Field 동일 exit0 **각7/7 fail0/skip0**, `/tmp/{ap,field}-billing-mutation-green.log`. 합성 sessionStorage/fetch만 사용했다. 잃은 환불 응답→reload 원본문·UUID 복구→정확 requested receipt; 갱신중지 DTO는 canceled+renewalStopped true+같은 subscriptionID; 다른 제품/세션/조직/사용자/origin 차단; 이전unknown 뒤4xx·409·malformed/5xx 유지; 최초 확정precommit400만해제; secret/authority·카드번호 metadata 차단; 저장불가 전송금지; 같은tab중복 전송금지를 확인했다.
- 양웹 typecheck AP92638/Field36226 terminalexit0, 신규4파일 eslint35505 exit0. UI/실 브라우저/전체 unit/기존backend/DB 검수는 재실행하지 않았다.
- 독립 좁은 CLI48568 gpt-6-sol/high/read-only `/tmp/billing-mutation-audit{,-result.md}` 진행 중이며 결과 미확인이다.
- helper exported API: `prepareBillingMutation(kind,body,context,sessionStorage)`, `restoreBillingMutation(kind,context,sessionStorage)`, `submitBillingMutation(attempt,context,sessionStorage)`, `readBillingMutation(raw)`, `billingMutationStorageKey(kind)`. context=`{...await currentBillingIdentity(),organizationId,origin:location.origin}`; kind refund/cancel-renewal; body 기존 own POST와 동일. prepare는 원 요청이 있으면 원 body/UUID만 반환하고 바뀐본문은409, storage 상태를 확인하지 못하면 새 UUID를 만들지 않는다.
- root patch: cancel/refund ref를 `BillingMutationAttempt|null`로 변경하고 두 mutation POST만 prepare→submit으로 대체한다. 명시 receipt 후 ref=null/기존 안내/폼초기화/load 유지. reload/load effect에서 current identity 확인→restore, refund body를 폼에 복구(유니온 body는 `'periodId' in body`로 narrow). 타 binding/metadata 오류에서 저장값 삭제/새 UUID 덮어쓰기 금지. unknown에서는 원본문으로 다시 접수한다. 기존 GET/checkout/callback·디자인은 그대로 유지한다.
- root notice 권장: billing_mutation_binding_invalid(원 계정·세션·조직 창에서 재시도), metadata_invalid(원 요청 metadata 확인필요·새요청 금지), in_progress(같은요청 처리중), input_invalid(명시금액/사유 확인·secret 입력금지), retry_storage_unavailable(재시도 metadata 저장불가로 요청미전송/결과확인필요). helper는 기존 BillingClientError를 사용하므로 notice 통합은 root 소유다.

### Mutation 분류 독립 지적과 실제 근거(보존)

- 최초 CLI48568 terminalexit0은 첫 `refund_amount_exceeded`409 해제를 P2/high로 지적했다(`/tmp/billing-mutation-audit-result.md`). 모든409를 모호한 충돌로 보아야 한다는 해석이었다. 판정을 삭제하지 않고 정확한 요구/endpoint 증거로 재검토한다.
- 실제 요구는 확정 precommit거절 후 해제를 허용하고 **모호한** idempotency_conflict/refund_in_progress409는 유지하는 것이다. own refund-routes.ts43행에서 먼저 기존 UUID replay,49행에서 잔액초과 ROLLBACK→409,52~54행에서만 refund/request insert→commit. 따라서 이전unknown이 없는 최초 amount초과는 원장 미접수이고 금액 수정이 가능해야 한다. unknown 뒤 같은409는 최초 응답을 증명하지 못하므로 metadata를 유지한다(helper111행 stage prepared 조건).
- 기존 native refund11검수 중 amount11001→409 뒤 같은period5500 요청201이 실제 성공해 미완료 환불 원장이 생성되지 않았음을 확인했다. 더 명시적인 web focused 추가 테스트를 작성했고 AP/Field `/tmp/{ap,field}-billing-mutation-classification.log` **exit0 각각8/8 fail0/skip0**(기존7+이 분류1). 기존 구현/source를 바꾸지 않고 최초/이전unknown의 다른 결과를 검증했다.
- root가 이 요구/실제 근거를 확인했고, 좁은 후속 CLI79376에 own route 해당 분기까지 read-only 허용해 재검토를 요청했다. 아직 결과 미확인이다. 잘못된 지적 때문에 모든409를 불명확으로 바꾸거나 고객의 확정 미접수 금액 수정을 영구 차단하지 않는다.


### Mutation 후속 최종 결과

- 후속 read-only CLI **79376 terminalexit0**, `/tmp/billing-mutation-classification-audit-result.md`: **No concrete P1/P2 remains** in prior finding, raw confidence **high**(수치 미출력). 실제 endpoint의 replay→amount rollback→insert 순서와 unknown stage 유지가 원 지적을 반박함을 확인했다. 최초 지적/근거/후속결과를 모두 보존했다. 이 리뷰는 자체 테스트를 실행하지 않았다.
- 최신 own helper native 각8/8, 양웹 타입92638/36226 exit0, 최종 좁은 eslint19555 exit0. source/helper 변경 없이 분류 테스트1개를 추가했고 신규검수8/8만 보고한다. root는 기존UI 연결 완료 및 combined16/16을 별도 보고했으며 이는 child가 실행한 검수가 아니다. 해당 root 총수 이후 새 같은scope 분류1개가 추가됐다.
- 변경 파일은 양웹 신규helper/test4개 + 본 계획이며 root 기존 settings/client/return/app/package/runtime/원장/인계/git를 child가 수정하지 않았다. 금전·외부 호출·managed·UI 디자인 변경도 없다.
- 남은 중앙 게이트: root 최신 UI/전체 통합 타입·완료 원장/인계/commit, 사용자 최종 시안/브라우저/실기기 인수. refund backend의 자체11/11 증거는 유지하며 이번 helper 작업 때문에 다시 DB검수하지 않았다.

## Mutation context isolation 추가 오류 재개(2026-09-27)

- 기존 helper/DTO/unknown 완료 검수·최초 독립검토/409 분류 판정은 보존한다. root 독립 CLI93322의 실제 P2/confidence0.97: 제품+kind 전역 저장키 때문에 orgA unknown이 orgB의 독립된 신규 요청까지 막는 구체적 추가 오류다. 원 attempt를 다른 context에서 실행하지 않는 규칙과 다른 context의 독립 요청은 함께 지원해야 한다.
- 수정 전 범위: 양웹 신규 billing-mutation-client.ts/test만 context별 product/kind/org/user/session/origin 저장키로 격리, v1 legacy는 정확한 원context에서만 migration, 다른 context에서는 legacy를 존치하고 새 scoped 키만 사용한다. 이전 body를 새 user/session UI에 반환하지 않는다. root checkout/기존UI/중앙파일은 수정하지 않는다.
- meaningful red: A의 unknown UUID/body 보존→B 새 body/UUID 접수 독립 허용, B에서 A attempt 직접submit 계속거부, scoped 재조회/legacy exactcontext migration과 다른context legacy 존치. focused 양웹 mutation tests→types/own lint→좁은 read-only 재검토.
- [x] scoped metadata/legacy 호환 red→green.
- [x] 집중 검수·리뷰·root 정확 API patch 및 완료 인계.

### Context isolation 실제 집중 검수 / 사용 변경

- 수정 전 `pnpm --filter @fieldai/agent-web exec tsx --test test/billing-mutation.test.tsx` **exit1 7/10, 3fail**, `/tmp/ap-billing-mutation-scope-red.log`: globalkey가 다른context restore에서binding 오류를 내고 독립B 신규 요청/legacyB 존치를 막는 오류를 실제 재현했다. 같은 A attempt를 B에서submit 거부하는 기대값은 유지하고, 다른context에 대한 독립 prepare/restore의 요구만 문서에 기록한 추가범위대로 바꿨다.
- 수정 후 동일focused 명령 양웹 **exit0 각10/10 fail0/skip0**, `/tmp/{ap,field}-billing-mutation-scope-green.log`. 기존unknown/body/UUID/DTO/precommit/409/secret/동시호출8범위와 추가2 context/legacy범위를 확인했다.
- own 타입 AP86188/Field3300 terminalexit0, own4파일 eslint53200 exit0. source/key변경 뒤 실행한 실제 결과다. backend/DB/무관 완료QA·브라우저·실금전·managed는 재실행/변경하지 않았다.
- key의public 변경은 `billingMutationStorageKey(kind,context)`이다. v2 key는 고정ownproduct/kind + `encodeURIComponent(JSON.stringify([organizationId,userId,sessionId,origin]))`로 만들므로 tuple delimiter/다른제품/다른session이 충돌하지 않는다. prepare/restore/submit signature는 그대로다. private readStored는(kind,context,storage)이며 UI가저장키함수를직접쓰지않으면추가patch없다.
- 같은context UUID/body/stage 보존, 다른context에 원attempt submit거부, restore는없으면null(원다른body미노출), 다른context 신규prepare만해당key생성. legacy는다른context에서존치/미반환하고 정확원context에서copy 확인후 동일legacy만제거. scoped/legacy다른UUID충돌은선택/삭제하지않고metadata_invalid. 저장실패는전송전거부다.
- root 기존UI useEffect는 read-only 확인 결과org변경에서이전폼/ref/목록을clear하고active/load generation을검사하므로 helper가새context에없음을반환한때 이전body를폼에남기지않는다. child는기존UI를수정하지않았다.
- 좁은 read-only CLI43047 gpt-6-sol/high `/tmp/billing-mutation-scope-audit{,-result.md}` 진행 중이며결과미확인이다. 이전검토판정을삭제/대체하지않고추가재개범위의최종결과를뒤에기록한다.

### Scope 재검토43047 및 malformed legacy 실제 보완

- CLI43047 terminalexit0은 P2 네 항목을 제시했다(`/tmp/billing-mutation-scope-audit-result.md`): cross-tab unknown overwrite0.94, cross-tab legacy pointer delete0.90, malformed global legacy의 독립 scoped 차단0.92, refund receipt에 원 body/key 부재0.86. 원 보고서는 보존한다.
- 세 번째는 추가 native로 실제 재현했다: AP `/tmp/ap-billing-mutation-legacy-red.log` exit1 **10/11,1fail**, foreignlegacy의 안전한 A binding은 있으나 body가 malformed일 때 B restore가metadata_invalid였다. safe base metadata로 foreign binding을 먼저 판단하고 body를복원하지않도록수정했다. valid scoped 원UUID는완전히unparseable legacy에서도동일원장으로재시도하며legacy를삭제하지않는다. 빈새scope에binding조차확인불가legacy는원UUID유실추정을피해failclosed한다.
- 수정 뒤 양focused `/tmp/{ap,field}-billing-mutation-legacy-green.log` **exit0 각11/11 fail0/skip0**, own4파일eslint90393 exit0. source는이결과로동결한다. root기존UI/콜백/backend/원장/managed/git는child미변경.
- 최신 own 전체웹타입5445/89211 exit2는 root 작성중 billing-return.test.tsx200의 continueCheckout 미구현/210의6인수오류였다. child는peer파일을수정하지않았다. root는후속87019 전체type/68586lint exit0 및 콜백focused각12/12를실행했다고보고했으며 이는root증거이고child실행으로합산하지않는다.
- 첫째/둘째 지적의 전제는탭간공유storage였다. 실제root는window.sessionStorage를전달한다. 실제열람한 primary [WHATWG HTML Web storage](https://html.spec.whatwg.org/multipage/webstorage.html)12.1/12.2.2는창별sessionStorage와auxiliary창의초기copy를구분하며지속적인cross-tab공유는localStorage의동작이다. 같은Document의준비/이전은await없는동기단계,submit중복은fetch전에현재port/scopedkey별로차단한다. 표준근거는탭동시live공유를상정한지적재판정에만사용하며실브라우저검수로주장하지않는다.
- 넷째는실제ownPOST계약이{id,state:requested}이고원UUID/actor/ownorg/bodydigest가server replay/commit으로결합된점을확인한다. 클라이언트가원계약에없는body/key응답을추정하여필수로요구하면정상접수가항상unknown이된다. HTTP응답은그fetch요청의응답이며provider성공과혼동하지않는다. 이근거로도실결함이남는지는좁은독립재검토75074에확인요청했다. 아직clean판정을주장하지않는다.

### Context repair 최종 독립 검토 / 파일 동결 인계

- 좁은 CLI **75074 terminal exit0**, gpt-6-sol/high/read-only, `/tmp/billing-mutation-scope-repair-audit-result.md`: **Remaining concrete P1/P2 findings: none**, raw confidence **high**(수치 미출력). 실제 결과 파일을 읽어 확인했다. 리뷰는 수정/검수 실행 없이 원 네 지적의 근거와 현재 source를 검토했다.
- 첫째/둘째는 실제 window.sessionStorage의 창별 복사 및 동일 Document의 동기 storage/전송 전 lock 근거로 남지 않는다. 셋째는 safe foreign header와 valid scoped retry 보완으로 해결됐다. 넷째는 실제 요청별 HTTP 응답 및 서버 actor/UUID/body digest 원장 계약에서 구체 오류를 찾지 못했다. 과거 지적과 red/green 근거는 위에 보존한다.
- 최신 자체 focused 검수는 양웹 각각 **11/11 exit0**, own eslint90393 exit0다. 작성 중 root 테스트로 실패한 전체웹 타입5445/89211 기록을 보존하며, root가 이후 보고한 전체type87019/lint68586 exit0 및 콜백각12/12를 child 자체 실행으로 주장하지 않는다.
- 양웹 신규 helper/test 네 파일은 foreign malformed legacy 보완 후 동결했다. 공개 API 변경은 `billingMutationStorageKey(kind,context)`뿐이며 prepare/restore/submit signature는 동일하다. root 현재 UI는 키 함수를 직접 소비하지 않아 추가 patch가 필요 없다. root는 최신 combined 검수·원장/인계·코드 포함 commit을 중앙 범위에서 마무리한다.
- 사용자 최종 화면/동선·실 브라우저/실기기·외부 공급사/MFA/법무 gate는 미실행 후속이다. 완료된 backend/도메인/무관 QA 재검수 및 금전/managed/git 변경은 수행하지 않았다.
