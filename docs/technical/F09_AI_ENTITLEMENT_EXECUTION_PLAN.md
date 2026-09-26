# F09.AI-ENTITLEMENT — Field 제작 AI 제공량 (2026-09-27)

- Task / Product / Owner: F09.AI-ENTITLEMENT / Field / root. State: implemented, 아래 범위 local verified·소스 동결. 중앙 runtime·commit 체크는 후속이다. HEAD75ec07d, 기존44[x] 유지. 이번 신규 내부 범위만 구현한다.
- Files: apps/field-api/migrations/000072_ai_entitlements.sql; src/ai-entitlement.ts, site-generation.ts, usage.ts 및 필요 worker 접점; test/ai-entitlement.db.test.ts. 기존 결제/환불·AP·OAuth 모듈과 적용migration은 수정하지 않는다. 화면 연결이 필요하면 기존 owner billing 구조의 제공량 값만 API로 표시하고 새 표시에는 `(추가)`를 붙인다.
- Requirements / QA / Gate: Field3.3/3.8, 보안5.4, B02/B04/B11, QA43~46/113/126/146의 해당 사용량/격리/동의/복구 범위. 새 초과청구 없음. 실LLM/PG/전체QA·사용자화면 검수는 별도다.

## 승인 경제값과 단위

- `model_call_v1`: 유효한 providerResponseId와 input/output token 사용량이 확인된 자체 제작 호출1건=1unit. token 합계는 별도 실제 공급사 실적이며 가격/청구액으로 변환하지 않는다.
- 승인 billing consent의 included_ai_units와 원래 paid billing_period를 사용한다. UTC 달력월 사용 기록과 실제 구독 기간 제공량을 구분한다. grace는 직전 paid 기간의 남은 제공량만 사용하며 새 제공량을 충전하지 않는다. 다음 기간이 실제 paid가 된 뒤에만 새로운 quota를 쓴다.
- Field 제작 AI는 사업자의 productive 기능이며 자체 Field 제공량 대상이다. AP 고객/테스트 비용과 크레딧을 공유하지 않는다. trial/mock 미설정은 기존 일일20회/활성job 규칙을 유지한다.

## 원장/실행/복구

- own organization/job/period의 불변 binding, job ID당 한 원장, reserved→dispatched→consumed/released/unknown. reserved/dispatched/unknown/consumed를 모두한도에 계산한다. own org 잠금과 현재 기간/환불 접근 재검사로 동시 초과를 차단한다.
- queued 접수 때1unit 예약한다. queue outage는 원래job 유지/재조정이고 새 ID로 같은 모델을 호출하지 않는다. 기존 queued job에 원장이 없으면 worker dispatch 전에 현재 기간을 바인딩한다.
- 확실한 호출 전 취소·모델 변경·권한/기간 종료는 release. 명시적인 provider HTTP400/401/403/404/422/429 거절만 release. timeout/5xx/응답 parse·usage 유실은 unknown에 보존하고 원job을 재발송하지 않는다.
- 실제 유효 usage를 받은 호출은 invalid plan/stale/이미취소 여부와 무관하게 원기간에 소비/실적을 기록한다. 늦은 결과는 현재 접근 재검사 후 초안에 적용 가능한 제안으로만 노출한다. abandoned dispatched job은 unknownhold를 보존한다. 적용/공개는 기존 명시 검수 경로를 유지한다.

## 검수/완료 체크

- [x] 한도1의 실제 유료 승인 fixture에서 호출1번 소비 후 두번째 접수429 red→green
- [x] queued 취소와 확정 미발송/확정 provider거절 release, timeout/usage유실 unknownhold·재발송0
- [x] grace/새paid기간·기존 queued 바인딩·완전 환불/권한 변경 호출 직전 차단
- [x] 중복 worker 실행·취소/늦은 usage·abandoned 복구·다른 조직 원장 사용 거부와 own 제품 DB 격리
- [x] 자체 usage 조회/고정 제공량 화면 연결, 관련 type/lint/build·독립read-only CLI 검토
- [x] 중앙 runtime 적용·원장/인계/일지·코드 commit과 완료 체크

Exact commands: `node /tmp/field-ai-entitlement-run-db.mjs`(own UUID PostgreSQL17 fixture 생성/자체마이그레이션/새 test만 실행/자체DB정리); `pnpm --filter @fieldai/field-api typecheck`; scoped `pnpm exec eslint` 실제 변경 파일; `pnpm --filter @fieldai/field-api build`; `git diff --check`. 실제 결과는 다음 기록을 따른다. 무관한 전체 회귀를 반복하지 않는다.

## 최종 자체 결과 / 동결

- `node /tmp/field-ai-entitlement-run-db.mjs > /tmp/field-ai-entitlement-repair15-current.log 2>&1` **98969 terminalexit0 15/15 fail0 skip0**. 합성 provider, Node24.18.0, own UUID PostgreSQL17. 현재 quota/release/unknown/권한/latecost/refund/grace/legacy/currentperiod binding/중복worker·불변원장·원문삭제실적 및 실제 admin SQL/redaction/허용overview 감사와 실제 adapter completed refusal를 검사했다.
- Field API type **62308 exit0**, 최종 scoped root eslint **24471 exit0**(`/tmp/c03-root-ai-repair-lint.log`), Field API build **4249 exit0**(`/tmp/c03-field-ai-repair-build.log`). 중앙 OAuth/server 후속 변경을 포함하는 전체 최종 type/lint와 최신 managed build는 root 통합 시 별도로 실행한다.
- 독립 보완 CLI **41684 terminalexit0**, `/tmp/field-ai-entitlement-repair-review-result.md`: **남은 actionable P1/P2 없음, confidence0.90**. 최초31725의 legacy queue P2.96와 알려진 adapter 비용 유실 P2.91 보완 및 late-paid backfill/원문 삭제/trial·paid 한도/unknown hold/owner quota row를 확인했다. 정적 검토이고 테스트·브라우저를 실행한 것이 아니다.
- 추가 source: Field `field-openai.ts`의 safe usage error, 양 owner billing quota row, Field billing usage의 own siteAi 계약과 FieldUsage 실제 access 안내. 양 billing-client의 정책문구 줄바꿈은 별도 완료 UI 세부 ID에 TASKS 사유를 먼저 기록했고 관리자 consumer 양12/12에 검수했다. 고정 배치·색·메뉴/reference는 변경하지 않았다.
- 실패 보존: 86149 11/12는 shared fixture worker가 다른 조직의 provider credential을 집어 renewal blocked≠paid였고 own UUID fixture로 격리한 뒤 기대 paid를 유지했다. 24846 source purge/latepaid red와33002 completed refusal 소비0≠1 보완 후 최종15/15. 45990의 oldqueued 예약1 기대는 검토된 dispatch binding 정책에 맞춰 전기간/grace/latepaid 실제 이력을 강화해 queued 미바인딩→현기간 실제소비를 검사했다. 원래 비용/한도 조건을 버그에 맞춰 완화하지 않았다.
- 중간66608 7/7,77311 13/13과 작성 중 whole type9961 exit2·감사23514는 이력이며 최종 전체 서비스 통과로 승계하지 않는다. 실 LLM/청구/원가·전체 E2E/320px/모든역할·최종 사용자 화면·출시는 미검수다.

## 실패/미검수

- 독립31725 terminalexit0: P2 rawconf0.96 legacy queued가migration에서oldperiod에결박되어새paid직전미발송job이오류종료; P2 rawconf0.91 completed refusal/JSON실패의유효provider ID/usage를adapter가throw전에유실. 최종남은2P2/reviewconfidence0.89. 전자는migration에서미발송legacy queued를제외하고dispatch시에현기간바인딩, 후자는신규 safe usage error와worker의실제소비기록으로보완한다. 추가경로src/field-openai.ts 및자체adapter/native검사, F03.ADAPTER의기존[x]는보존한다.
- 삭제된sourcejob 뒤월별기록된호출0≠1 및늦게paid된renewal에기존grace소비귀속이바뀌는두사례 실제24846 exit1에서재현했다. ledger+미바인딩source를집계하고 `paid_at<=실제호출시점`을backfill에추가한다. 미상/토큰비용메타는원문수명과독립으로보존하며quota 없는trial/mock에도자체costmetadata만기록한다(기존일일한도/청구정책유지). 제공량daily20는trial/mock에만적용하고paid/grace는승인quota를적용한다.
- 중앙 Field관리자 실제native6677 exit1 13/14: 감사resource billing_overview가23514로500≠200. 담당agent가허용범주overview를사용하는최소수정으로회복중이며schema제약을완화하지않는다. whole type9961 exit2는타소유admin parser의작성중redtest필드오류였다. 이단계에전체통과를주장하지않는다.

최초 native68135 terminalexit1 **0/7 fail7**: 한도 소진 뒤202≠429, requester membership 제거 후 calls1≠0, entitlement 조회필드없음. 구현 후66608 terminalexit0 **7/7 fail0/skip0**, /tmp/field-ai-entitlement-green.log; API type6096 exit0. 아직 전기간/환불/legacy/동시 helper와 독립 CLI 검수는 남는다. 근거보다 넓게 통과를 주장하지 않는다.

착수파일 discovery에서 추측한000063_billing_plans.sql와복수billing-refunds test경로가 없어 exit1을 관찰했다. 실제 `rg --files`로000063_paid_billing.sql 및billing-refund.db.test.ts를 확인했다. 운영DB/공급사/전체서비스 검수의 실패 또는 통과를 뜻하지 않는다.

## 중앙 적용 완료 — a974b90 (2026-09-27)

Root가 마지막 source의 whole type97507·lint58007 exit0 및 launcher최소repair scopedlint/syntax0을 확인했다. old43912 Ctrl+C terminalexit1, first31268의compiledCLI mockprofile 누락exit1을보존한다. 명시ownprofile전달 후 **managed83305** 최신 양API/webbuild·AP81/Field73마이그레이션·quiesced기준선·Fieldroute-keyworker local_reconciliation을반영했다. 실제runtime-evidence exit0: 양ready/workspace/admin200, 보호API401, AP SSR 두홈링크, ownbaseline각1·receiptAP3/Field1. controller35492/Fieldworker36190각1·같은parent 확인. 원장TASKS49[x]/9[ ]·인계/coverage/audit/phase에체크하고sourcecommit **a974b90**으로저장했다.

전체LLM/PG/MFA/발송/DNS/TLS·운영restore·전체E2E·사용자최종UI/기기/동선/출시는미검수다. 고정reference변경없음. source미상원장을초기화하거나새UUID재발송하지않는다. 적용schemaAP81/Field73은동결하고필요한추가schema만AP82/Field74부터조율한다. 재현한새오류없이는이미끝난집중검수/구현을반복하지않는다.
