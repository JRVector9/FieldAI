# A07.AI-ENTITLEMENT — AP 자체 AI 제공량 실행 계획

Task/Product/Owner: A07.AI-ENTITLEMENT / AP / Delivery Agent
State: implemented / own focused local verified / 착수 HEAD75ec07d·44[x] 보존. 기존 delivery/lifecycle 완료는 재구현/검수하지 않는다.

## 소유/요구/QA/명령

- 소유: AP 새 ai-entitlement.ts·AP000080_ai_entitlement.sql·agents.ts/customer-consultations.ts/usage.ts 및 신규 test/ai-entitlement.db.test.ts·본 전용계획만. Field/웹/billing/refund/OAuth/app/server/package/centraldocs/Git/runtime/env는 root/다른agent 소유로 수정금지.
- 요구: AP2.2/2.3/2.8·보안5.4/5.5·QA43~46/48/113/126/146/159·G-A1/L1. 승인 plan/consent/paidperiod·제품별실제모델소비·inflight동시성·초과호출/초과청구차단·실패/미상/replay·만료/환불/권한을 검수한다. 실제LLM/최종UI/전체E2E/운영출시게이트는 미실행이다.
- 실제명령: own local AP55431/agent_local URL guard→outer UUID testDB/peerenv제거→fixture UUID/migrations→`pnpm --filter @fieldai/agent-api exec tsx --test test/ai-entitlement.db.test.ts`. 신규경로 focused red→green, AP typecheck/lint/build, 승인fallback gpt-6-sol/high 좁은readonlyCLI review/repair. 실제로그/terminalexit과실패는 완료란에 기록한다.

## root 승인 정책/원장

- `model_call_v1`: provider responseId와유효 input/output usage가확인된모델호출1건=1unit. 안전/stale/취소검사로출력이보류돼도실모델소비는 기록한다. tokens는별도실적, provider원가금액/가격은미설정이므로추정/원가0표시/자동초과청구하지않는다.
- AP 고객 paidquota에만billing_period.included_ai_units 사용. owner_test는기존rolling24h daily예산을유지하며customer credits와명시분리한다. trial/mock 기존daily예산동작유지. grace는subscriptionAccess로허용된직전paidperiod의남은quota에귀속하고충전하지않는다.
- period에는현재해당column이없어서 AP80에서immutableconsent로backfill+새INSERT 자동snapshot+이후변경차단을추가한다. 기존billing source를바꾸지 않는다.
- own run_id 유일원장/org/lane/period·limit/unitpolicy binding. reserved/dispatched/consumed/released/unknown을분리하고orglock+period조건으로 reserved+unknown+consumed를포함해한도를막는다.
- dispatch직전 currentaccess/paidperiod/fullrefund와owner/customer권한/현재업무/retention/source 재검사. 이미dispatch한늦은knownusage는원래period에기록하며 현재접근불가 출력은보류한다. 기존legacy currentpaid/grace ai_runs도AP80 자체metadata backfill로knownusage consumed, 나머지unresolved unknown에귀속해quotareset을막는다. AP에는모델재POSTqueue가없고기존customer현재run replay를유지한다.
- 확실한미발송/명시HTTP400/401/403/404/422/429만release, generic timeout/5xx/HTTP200parse·usage유실은unknownhold이다. unknown을시간만으로release/rePOST하지않고늦은validreceipt 정산은같은run 1번만가능하다.

## usage summary root 전달 shape

기존ai/work/UTCmonth preserved. 추가 entitlement: `{unitPolicy:'model_call_v1',overage:'blocked_without_explicit_purchase',mode,periodId,endsAt,graceEndsAt,customer:{includedUnits,consumedUnits,reservedUnits,unknownUnits,remainingUnits},ownerTest:{budgetPolicy:'rolling_24h',dailyLimit,separateFromCustomer:true}}`. 승인/rootField의siteAi별도lane과crossimport없다.

## 현재 체크

- [x] immutableperiod snapshot/ownledger/legacybinding migration
- [x] reserve/dispatch/knownusage/failure/unknown/replay복구 helper
- [x] customer/owner native호출권한·quota연결/summary
- [x] focused actual native/type/lint/build/readonly clean review
- [x] root 결과/미실행/정확commands 제출

## 실제 실행 중간 증거 — 2026-09-27

- HEAD75ec07d/AP mock·Node24.18.0·PostgreSQL17 AP55431에서 ownUUID outer/fixture DB만 생성/제거하며 FIELD_* 제거. 기존 completed QA/전체E2E 재실행은 하지 않았다.
- 최초 synthetic held 동시케이스는 기존 코드에서 둘째 모델도 대기해 runner73748을 Ctrl-C하여 exit130. 둘째 호출 Promise를 보존하고 release후검증하도록 fixture 대기만 수정했다. 이후 실제 behavior red20050 exit1, 0/3: quota200≠429/검수실패후422≠429/unknown replay503≠202. `/tmp/ap-ai-entitlement-red.log`.
- AP80 snapshots+metadata ledger와 reserve/dispatch/settle 연결후77487 exit1 2/3: JS/DB 경계 fixture paidstart가 아직 미래인403. legitimate fixture anchor를1초과거로두어75416 exit0 3/3. 기대값/접근guard는변경하지않았다.
- edge4347 exit1 4/7: missingusage422≠503 actual red, fixture 직접pause는기존constraint23514·deployment에knowledge_id가없어42703. 실제고객human submission API와agentrelease join으로fixture만고쳤고missingusage를unknown503/202로분리.82595 exit0 7/7.
- fullrefund81438 exit1 7/8: fixture resolveSession부재의401. current ownactor sessionport를명시한후6501 exit0 **8/8**, fail0/skip0. `/tmp/ap-ai-entitlement-refund-green2.log`. 원customer refund→operatorreview→다른approve→syntheticrefundworker 증명이며직접refunded_amount UPDATE/guard약화없음.
- type4850/45513 exit0, own5fileeslint23716 exit0, APbuild12557 exit0. `/tmp/ap-ai-entitlement-{type1,type2,lint1,build1}.log`.
- AP80 run_id에는 source ai_runs FK를두지않고 INSERT때ownorg/source/kind/model존재검증후immutableUUID metadata만보존. source run삭제후consumed2유지 actual native검수. UTCmonthly actual provider call/tokens도원장조회로retention 삭제후비용이력을유지하며 원문/provider rawresponseID/권한cap/credential을원장에저장하지않음.
- 검수된추가cases: 승인period snapshot변경PAA01차단; owner lane별도; grace직전period잔량0·기간종료canStart=false; legacyAP79→80 known1+unknown1정산/receipt replay/conflict/원장releasePAA02차단; actualhuman전환/owner demotion늦은출력409과원기간소비; actualfullrefund후새owner403/늦은customer409·monthly소비보존.
- readonly independent CLI84993 gpt-6-sol/high 진행중. 새AI외부키/실LLM조회·원가price설정·사용자최종UI/실기기/전체E2E·출시게이트는미실행이다. 기존modelProvider미설정API는blocked_integration 유지. 새app/server/package/runtime등록은없고root가새migration 적용/요약UI 연결을통합한다.

## 독립 검토 보완 — 실제 red→green

- readonly84993 exit0 gpt-6-sol/high, tokens64,106. P2와rawconfidence: paid에도trial rollingdaily적용(.98), refund check→latepublication 경합(.91), gracecall보다나중paidrenewal로legacy귀속(.92), refund뒤missingusage를currentperiod없음으로terminal422오인(.95). 모두반영했다.
- 27873 exit1 8/11과72076 exit1 **8/12**에서각구체오류를실제재현(`/tmp/ap-ai-entitlement-review{,-race}-red.log`). race는 completion access조회뒤보류한채actualrefundworkflow가먼저끝나는것을검증한실제DB동시성케이스다.
- paid/grace는 periodquota만사용하고trial/mock은기존daily예산을유지한다. 양완료txn은refund와같은org FOR UPDATE를최초에획득한다. legacy는`p.paid_at<=r.started_at`을요구한다. unknown판정은현재접근상태대신불변originalledger.period_id를읽는다.
- 62733 exit0 **12/12**, mockdaily보존별도case 추가후95987 exit0 **13/13 fail0/skip0**. `/tmp/ap-ai-entitlement-review-green.log`, `/tmp/ap-ai-entitlement-final-native.log`.
- ownlint71430 exit0. finalAPtype72946 exit2는타agent작성중oauth-lifecycle-cli.ts9와admin-billing.db.test.ts11/28/29/33의undefinednarrowing만이며own파일오류없음. 해당파일수정금지/parent에전달. build95060/후속readonly9886은진행중이다. 처음4850/45513/12557검사는그당시실제green이력이며현재최종gate로승계하지않는다.

## 추가 scope 재개 근거 — 확인된 provider 실제소비 누락

- 기존 모델/완료ef0dfd3와44[x]는 유지한다. Root Field 실제독립검토의同類문제에따라 AP own openai.ts 원문을읽어 completed body.id+validusage인데refusal/invalidJSON 검사가usage추출보다앞서throw하는구체오류를확인했다. A07 신규실제비용원장정확성의추가범위로 openai.ts와새ai-entitlement.adapter.test.ts, 해당ownnative검사만승인되었다.
- 코드변경전범위/QA: confirmedreceipt는안전한responseID+boundedinput/output tokens만typederror에유지하고raw출력/refusal/원문은오류에복사하지않는다. 모델성공아님/known consumed를구분해신규호출한도에반영한다. HTTP5xx/missingusage는unknown유지, 기존어댑터전체검사와완료기능을이유없이재실행하지않는다.
- 검수예정: own새adapter focused refusal/invalidJSON/error-redaction/native actualcost/red→green→types/lint/build→readonly추가검토. 진행중9886 review는이adapter추가전13개수정본검토이력으로분리한다.


## 최종 검수 증거(최종좁은adapterreview만대기)

- adapter actual red2case0/2 exit1(`/tmp/ap-ai-entitlement-adapter-red.log`)→58390 안의unitcommand exit0 **2/2**(`/tmp/ap-ai-entitlement-adapter-green.log`). native19022 exit1 **13/14**에서실제OpenAI adapter+syntheticfetch refusal가503≠422및knowncost누락을재현→58390 exit0 **14/14 fail0/skip0**(`/tmp/ap-ai-entitlement-known-refusal-green.log`). 실제externalHTTP/LLM은호출하지않았다.
- 최종현재 APtype90391/build84268/own7fileeslint40848 모두 exit0(`/tmp/ap-ai-entitlement-final-{type3,build3,lint3}.log`). 이전72946/95060 exit2는타agent undefined중간상태이력이며해당타파일을임의수정하지않았다.
- broader followup9886 exit0 noP1/P2, rawconfidence.87, tokens70,566(`/tmp/ap-ai-entitlement-review2.log`). 마지막adapterpatch만read-only99649 진행중. 독립검토는static이며실제tests를본agent대신검수했다고주장하지않는다.
- 변경경로9개: AP000080 migration, src/ai-entitlement.ts·agents.ts·customer-consultations.ts·usage.ts·openai.ts, test/ai-entitlement.db.test.ts·ai-entitlement.adapter.test.ts, 본plan. root-only TASKS/coverage/handoff/app/server/package/런타임/Git/다른agent source수정없다.
- root중앙삽입patch없음: 기존route모듈에서ownhelper를import한다. 새AP80 migration은검토완료전실제mock 적용보류를요청했으며 root가필요시에적용한다. approved usage summary shape를root own fixedUI에서연결한다. 실provider/cost화폐값/실LLM/최종UI/모바일/전체E2E/출시승인은여전히미실행/blocked integration이고모델미설정은기존blocked_integration 그대로다.


## 완료/동결/다음 agent 명령

- 최종adapterreadonly99649 exit0 **noP1/P2/rawconfidence.92/tokens38,731**, `/tmp/ap-ai-entitlement-review3-adapter.log`. broader9886 clean.87과함께scope별완료한다. 모든내부phase체크는완료, 실외부/최종인수/전체릴리스는미완료다.
- own코드는동결하고root에exact파일/검수/shape/미검수/등록없음/미커밋을제출했다. Root가 TASKS·인계·coverage와현재미완료세부 A07.AI-ENTITLEMENT만체크하고기존44[x]/원래완료commit을보존한다. 본agent는Git stage/commit/runtime restart/실제mockDB mutation을하지않았다.
- 실패/복구: unknown은원run/원period를초기화하거나모델재POST하지않는다. 확정usage receipt의동일metadata는1회정산되며conflict는거부한다. 이미적용된AP80는이후수정하지않고추가migration으로보완해야한다. 이번migration은backfill존재로임의down/drop하지않고호출정지/원장보존뒤이전consumer로회복한다.
- 모델공급사 없으면blocked_integration. unknown 조회용실provider retrieval 계약/실원가price/외부키/실LLM/최종사용자UI·기기/E2E/출시approval은사용자후속이며이체크가그것을승인하지않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
sed -n '1,100p' TASKS.md
sed -n '1,65p' docs/CODEX_HANDOFF.md
git status --short
git log -3 --oneline
cat docs/technical/A07_AI_ENTITLEMENT_EXECUTION_PLAN.md
# already-done core8/13/14 tests must not restart absent a concrete new bug.
# If a new scoped bug is reproduced, ownUUID runner guards AP55431/agent_local/testDB + removes FIELD_*.
node /tmp/ap-ai-entitlement-run-db.mjs
pnpm --filter @fieldai/agent-api exec tsx --test test/ai-entitlement.adapter.test.ts
pnpm --filter @fieldai/agent-api typecheck
pnpm --filter @fieldai/agent-api build
```

- 마지막adapter단독terminal확인 f111cd exit0 **2/2 fail0skip0**, `/tmp/ap-ai-entitlement-final-adapter.log`(앞선58390 combined명령의unit2/2와구분). 최종diffcheck exit0. AP80 실제 SHA256 `f4aeb53f8d30a1deedd4d96315c7225342bfe6c3e24cb3c227a875ddcd69231b`. 동결파일별manifest `/tmp/ap-ai-entitlement-frozen-sha256.txt`를root가읽어확인한다.

## 중앙 적용 완료 — a974b90 (2026-09-27)

Root가 마지막 source의 whole type97507·lint58007 exit0 및 launcher최소repair scopedlint/syntax0을 확인했다. old43912 Ctrl+C terminalexit1, first31268의compiledCLI mockprofile 누락exit1을보존한다. 명시ownprofile전달 후 **managed83305** 최신 양API/webbuild·AP81/Field73마이그레이션·quiesced기준선·Fieldroute-keyworker local_reconciliation을반영했다. 실제runtime-evidence exit0: 양ready/workspace/admin200, 보호API401, AP SSR 두홈링크, ownbaseline각1·receiptAP3/Field1. controller35492/Fieldworker36190각1·같은parent 확인. 원장TASKS49[x]/9[ ]·인계/coverage/audit/phase에체크하고sourcecommit **a974b90**으로저장했다.

전체LLM/PG/MFA/발송/DNS/TLS·운영restore·전체E2E·사용자최종UI/기기/동선/출시는미검수다. 고정reference변경없음. source미상원장을초기화하거나새UUID재발송하지않는다. 적용schemaAP81/Field73은동결하고필요한추가schema만AP82/Field74부터조율한다. 재현한새오류없이는이미끝난집중검수/구현을반복하지않는다.
