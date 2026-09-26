# A07.F09.BILLING-ADMIN-UI — 자체 관리자 구독·청구

## 착수 / 승인 설계 / 소유

- Task/Product/Owner: A07.F09.BILLING-ADMIN-UI / AP·Field 각각 독립 / custom_domain. State: implemented, 아래 범위 local verified·source 동결. 착수 HEAD75ec07d, 기존 TASKS44[x] 및 가격·환불 backend/owner callback 완료를 유지한다. 새 미완료 관리자 consumer만 구현했다. 최신 중앙build/runtime·최종인수/출시는별도다.
- 먼저 읽음: AGENTS6.0/6.1, TASKS 완료 원장, 현재 CODEX_HANDOFF, C03_REMAINING_INTERNAL_EXECUTION_PLAN, architecture B01~B12, AP2.8/2.9·Field3.8/3.9, security5.4/5.5, QA43~46/49/146/147/157/159, 기존 billing/refund/admin/session contract와 시안 adminBilling 원문.
- 사용자 승인된 고정 시안 설계: `reference/field_ui_prototype_v3.html` adminBilling의 집계3개→최근 구독 이벤트 표→unknown 안내 배치·색·글자/모바일 규칙을 유지한다. 실제원장 수/상태로 바인딩하며 가격/환불 관리만 아래 `(추가)` 영역에 넣는다. 신규 디자인/역할 전환/가짜 집계/성공은 만들지 않는다. 사용자 기존 승인과 root 지정 scope에 따라 재승인 질문 없이 구현한다.
- 소유 create: 양웹 `src/billing-admin.tsx`, `src/billing-admin-client.ts`, `src/billing-admin.css`, `test/billing-admin.test.tsx`; 양API `src/admin-billing-routes.ts`, `test/admin-billing.test.ts`. 이 계획.
- root 추가 승인(중앙등록 뒤): 양API 새 `test/admin-billing.db.test.ts`의 own UUID PostgreSQL17 실제 조회SQL/집계/감사 1case 및 기존 synthetic fixture 정상createApp 전환. native 실행용 /tmp runner는 own product URL/UUID만 사용하며 peer env 제거/마이그레이션 실패fallback 금지. migration/backend 재작업 없음.
- 금지: 기존 billing/refund/helper/migration/app/server/package/admin.tsx/admin-sections/workspace/owner UI·usage/OAuth·중앙 TASKS/handoff/coverage/runtime/env/git. root에 중앙 route등록/화면삽입 exact patch를 제출한다. 다른제품 DB/import 없음.

## 계약 / 상태 / 결정

- 기존 GET/POST `/v1/admin/billing/plans`, plan/:id/approve·retire 및 기존 refunds GET/review/approve/reject만 소비한다. 경제값/약관/환불 정책/사유/근거를 명시 입력하고 요청자≠가격 승인자, 환불 검토자·운영자 대행 요청자≠승인자를 UI와 기존 서버에 유지한다. auditor는 조회만 가능하다.
- 새 GET `/v1/admin/billing/overview`는 기존에 없는 redacted 집계·최근 원결제 거래·환불 실행 metadata만 제공한다. 기존 가격/환불 조회 원장을 다시 구현하지 않는다. retentionAdminFor(non-mock MFA blocked), 실제 현재 session/user binding과 현재 membership, 조회 audit/no-store로 보호한다. MFA 성공을 합성하지 않는다.
- 원래 product/user/session/origin/operation/대상UUID/body/멱등UUID를 sessionStorage 최소metadata로 고정한다. unknown은 동일 key/body 재시도, 타context 실행 금지/독립scope 허용. 명시 정확DTO 접수 또는 최초 정확 precommit거절만 해제, 기존unknown과409 상태충돌/in_progress는 보존한다. 카드/provider/auth secret은 metadata에 넣지 않는다. 기존 owner helper 수정 없음.
- read는 currentidentity를 확인하고 늦은 이전 load/action 응답은 현재 화면을 갱신하지 않는다. 요청 접수/다른 승인/worker pending·unknown·succeeded를 구분한다. unknown 거래의 조회 버튼은 원장 GET 새로고침이며 공급사 결과 조회/환불/청구 POST를 새로 만들지 않는다.
- 가격 live승인·환불 live/MFA/PG는 기존 blocked_integration을 표시한다. 결제/예약대금·환불/구독해지·제품별구독은 혼동하지 않는다.

## 집중 검수 / 실행 순서

- [x] native consumer meaningful red: 원장 집계·DTO/제품 binding, auditor/같은운영자 승인 차단, 명시입력·실제endpoint/body, lostresponse→reload 동일UUID/body, 충돌/이전unknown/latecontext 보호.
- [x] 최소 new client/component/CSS·redacted read route 구현→focused green.
- [x] 양제품 최종 types·own lint·중간web/API build 실제결과·독립 gpt-6-sol/high read-only review, 실제결과·실패 보존.
- [x] root exact 등록/화면삽입 patch 제출·정상createApp 확인·파일동결/완료 증거 인계.
- [x] root 최신중앙API/web bundle build·managed/migrate/runtime반영·완료원장/인계/코드포함commit(중앙소유).
- [ ] 실제PG/카드/환불/MFA·사용자최종시각/동선/실기기 및전체QA/G(후속외부gate).

명령: `pnpm --filter @fieldai/agent-web exec tsx --test test/billing-admin.test.tsx`, Field equivalent; 양API `exec tsx --test test/admin-billing.test.ts`; 양제품 API/web typecheck/build; own8source/test와CSS외 eslint, `git diff --check`. read route fixture는 합성 own pool/session/Fastify이며 실제 PG/MFA/provider/금전 호출 없음. 기존 완료 DB/무관 QA/E2E는 반복하지 않는다.

## 실제 결과 / 미실행 / 외부 의존

- 착수 CUA chrome unavailable, nativeChrome cgWindowNotFound. 기존 handoff의 file URL 보안거부 이력에 따라 원시안 브라우저 우회/재시도를 중단하고 로컬 HTML/CSS만 읽었다. browser skill start는 기존CDP 재사용 응답까지였고 파일 navigation/조작/캡처 없음. 시안 브라우저·실기기·사용자 최종 시각/동선 인수는 미실행이다.
- 최초 잘못 추정한 business-workspace test 경로 sed exit1과 자체 adminCSS class rg exit1(일치없음)은 탐색 실패이며 검수 pass가 아니다.
- 이력 — 착수 시점 feature tests/source/build/review 미실행. 공급사/실 PG·환불/카드/MFA·운영 데이터·managed/env/Git 조작 없음. 이후 실제 결과는 아래 최신 기록을 따른다. root 중앙통합/최종 사용자 인수/실외부 출시 gate는 후속이다.

### 실제 집중 검수 / 중간 오류 보존

- 최초 AP web consumer20063c exit1 **0/8**, `/tmp/ap-billing-admin-red.log`, 미구현 feature assertions. 구현 후 AP/Field 각각 **8/8 exit0**(`/tmp/{ap,field}-billing-admin-green.log`). 최초 AP read route9ba443 exit1 **0/3**, `/tmp/ap-admin-billing-read-red.log`; 구현 후 AP/Field 각각 **3/3 exit0**(`/tmp/{ap,field}-admin-billing-read-green.log`). 합성 fetch/sessionStorage와 자체 pool/session/Fastify injection이다. 실제 PG/provider/MFA를 사용하지 않았다.
- read fixture: 현재 session 요구·없음401, 관리자 membership없음/중간회수403, auditor read·nonmockMFA503, no-store/audit, peer SQL/카드/provider secret 컬럼 미조회. web fixture: own product/session DTO, 다른가격/환불승인자, 감사자 변경 금지, 정수경제값/비밀입력/저장실패, 동일body/UUID unknown 및중복전송1회.
- 중간 type AP API b747eb/양web8d7787·6108a1 exit0, owneslintac49a7 exit0. Field API c2f4c3 exit2는 own 파일2개 복사 시 제품별 `FieldBusinessRuntime` 타입 이름 누락이었다. 해당2개만 수정했고 Field type22a46d exit0. 실패를 peer오류로 처리하거나 fallback하지 않았다.
- 추가 latecontext/응답유실 뒤 상태진전 UI native AP671c21 exit1 **8/9**, `/tmp/ap-billing-admin-late-red.log`: 판매중지 접수 뒤 응답유실→GET retired일 때 원UUID 재시도버튼이 state조건 때문에 비활성화됐다. 원장 상태진전은 원UUID replay의 실패 근거가 아니므로 복구버튼은 현재 operator만 재확인하고 같은uuid/body를 사용한다. 기존서버 replay가 상태검사 전에 같은원장receipt를 반환한다. 원 요청 form은 계속 잠가 새 UUID/본문 변경을 막는다.
- 보완 뒤 AP5979d4/Field580506 **각9/9 fail0skip0 exit0**, `/tmp/{ap,field}-billing-admin-final.log`. load는 마지막 현재session과binding을 대조하고 늦은예전session 결과를 거부한다. action후load의notice도 원context와일치할때만표시한다. UI의CSS는시안원문값을접두사로격리해globaldesign변경없음.
- root 등록patch 제출: 양app.ts import `registerAdminBillingRoutes` 및 refund등록뒤1회call; 양관리자billing ready에 BillingAdmin+own CSS import/1회삽입, 기존체험집계는중복노출금지·기존로그아웃/다른section/menu는유지. 양section metadata billing `구독·청구` 및 시안의서비스대금제외description. 중앙소스는child미변경.

### Source 검수와 중앙 연결 대기

- 최신 own eslint28c062 exit0·`git diff --check`880641 exit0. AP web type8eb3b7 exit0. Field web type3d72fc exit2는 own build와 동시실행해 `.next/types/validator.ts`가 생성 중 `routes.js`를 찾지 못한 경합이었다. 양 build 종료 후 Field web type df1bae exit0; 타입/빌드를 앞으로 제품별 순차검수한다.
- 실제 build 양웹 terminal15707/7051 exit0(`/tmp/{ap,field}-billing-admin-build.log`), 양API14756/29146 exit0(`/tmp/{ap,field}-admin-billing-read-build.log`). 아직 중앙 component import/route등록 이전의 검수이며 실제 Next 페이지 연결·중앙 등록검수로 주장하지 않는다. root 정확 patch 뒤 정상createApp fixture와 중앙 bundle 증거를 구분한다.
- 독립 narrow read-only CLI33114 gpt-6-sol/high `/tmp/billing-admin-audit{,-result.md}` 진행 중이다. 결과를 아직 확인하지 않았으며 clean으로 주장하지 않는다. 허용된 own모듈과 정확 기존계약만 읽고 source/DB/provider/runtime/검수 명령을 실행하지 않도록 요청했다.

중앙 삽입 뒤 정확한 후속 명령:

```bash
pnpm --filter @fieldai/agent-api exec tsx --test test/admin-billing.test.ts
pnpm --filter @fieldai/field-api exec tsx --test test/admin-billing.test.ts
pnpm --filter @fieldai/agent-web exec tsx --test test/billing-admin.test.tsx
pnpm --filter @fieldai/field-web exec tsx --test test/billing-admin.test.tsx
# 제품별 build 종료 후 typecheck를 실행하며 동시 .next 재생성을 피한다.
cat /tmp/billing-admin-audit-result.md
```

### 독립 지적과 추가 복구 범위 — 변경 전 기록

- CLI33114 terminal exit0 결과: **P2/confidence0.94**, 현재 GET 최근100개에서 대상을 찾는 `pending()` 때문에 unknown대상이100건밖으로밀리면storage에원UUID/body가남아도reloadUI복구버튼이없어진다. No P1, raw overallconfidence0.86. 실제좁은기능결함으로수용한다. 리뷰는검수/브라우저를실행하지않았으며최초결과를보존한다.
- 추가 범위: ownclient에 현재 product/user/session/origin storage키만 열거하는 `listAdminBillingMutations`를 추가한다. foreigncontext는body를읽거나반환하지않으며 currentcontext ownrecord의원UUID/body를그대로복원한다. UI복구목록을최신100개businesslist와분리하고 oldtarget도현재operator만같은UUID로replay한다. 모호한저장값은삭제/덮어쓰지않는다. 기존ownerhelper/새lookup/migration변경없음.
- meaningful focused red: unknown대상이새snapshot100개밖에없어도정확sameUUID/body복구·원POSTretry, foreigncontextbody미조회; 보완→green뒤좁은read-only재검토. root정상createApp/ownUUIDnative조회추가도최종source증거에포함한다.
- native 실제 SQL 추가 오류(수정 전): root Field own UUID14case6677 exit1 **13/14**, `/tmp/c03-field-entitlement-admin-final14.log`: 새GET에서 `resource='billing_overview'` INSERT가 기존 `admin_access_audit_resource_check`(resource='overview'만허용)23514로실패해500≠200였다. 합성pool3/3은SQLconstraint를실행하지않아미발견했다. 실제migration AP51/Field44확인후 이read-only billingmetadata도기존허용overview감사category로기록하는최소수정을한다. auditconstraint/schema를완화하거나원장을지우지않는다. root원nativecase의실제자원상수를overview로맞춘다.
- 정상createApp synthetic전환뒤67bc85/fa325b exit1 **0/3**은fixture에receiptguard의ownAUTH_SECRET을제공하지않은환경오류다. test process에서명시합성secret만넣고중앙guard를우회하지않는다. operational/env파일을변경하지않는다.

### 실제 복구 / 중앙 등록 / native SQL 검수

- recovery consumer APe67c14 exit1 **9/10** `/tmp/ap-billing-admin-recovery-red.log`→own scoped-key enumeration 구현 후 AP6e7385/Field92551b **각10/10 exit0 fail0skip0**, `/tmp/{ap,field}-billing-admin-recovery-green.log`. currentcontext목록을business100개와독립복구하고 foreigncontextkey의body getItem이한번도실행되지않음을확인했다. 같은원UUID/body확정receipt 뒤에만정확sameattempt를해제한다.
- root 중앙 source 등록·화면삽입을실제로읽어확인했다. syntheticfixture를직접register에서정상createAgentApp/createFieldApp으로전환한뒤own합성AUTH_SECRET명시: APbf680e/Fieldbbd7bf **각3/3 exit0** `/tmp/{ap,field}-admin-billing-central-fixed.log`. 중앙보안guard를우회하지않았다.
- `node /tmp/ap-admin-billing-run-db.mjs` native terminal85884 **exit0 1/1 fail0skip0** `/tmp/ap-admin-billing-native.log`, own UUID PostgreSQL17빈DB→AP own migration·peer env제거·호스트/포트/사용자/UUID제품검사. 새로운 `apps/agent-api/test/admin-billing.db.test.ts`는정상createAgentApp과명시합성본인owner/운영자/다른승인자/감사자 원장으로mixedpaid/갱신failed/unknown거래 및고객환불요청을조회해정확집계1/1/1·redacted전송metadata·allowedoverview감사증가를확인했다. 공급사port/카드/worker/실환불/MFA호출없음. 테스트가만든UUID DB/임시signedjournal만runner가정리하며operational원장은접근/정리하지않았다.
- 최신 web type6a8d6b/098ccd exit0, own11파일eslintd64a4c exit0. AP APItype1a3cb7 exit2는ownnativefixture의Array.from destructuring이undefined로좁혀진4오류 + peeroauth-lifecycle-cli.ts9오류다. ownfixture를명시8개UUID tuple로고쳤다. Field API005e12 exit2는peer同cli9의string|undefined오류뿐이며child수정하지않았다. peer오류를pass로처리하지않고root에전달한다.
- narrow repair read-only CLI98005 `/tmp/billing-admin-repair-audit{,-result.md}` 진행중이다. 최신100밖복구지적과FieldactualSQL감사오류·새APnative증거 및root정확등록경로만추가검토범위로허용했다. 기존review결과는보존한다.

### 두 번째 독립 지적 / 승인된 조건부 session fence — 변경 전 기록

- CLI98005 terminalexit0: prior100밖복구P2해결, 새 **P2/confidence0.87**, 마지막GETidentity검사와POST 사이다른eligibleoperator session으로cookie교체되면POST가다른actor로기록될수있다. 실제race미실행인조건부코드경로지적이며rawoverallconfidence0.84. 원보고서를보존한다.
- root 승인 추가범위: 새UI POST에원래 `X-Admin-Billing-Actor-Id`/`X-Admin-Billing-Session-Id`를항상전송하고own새admin-billing-routes의정확billingPOST범위 preValidation hook에서현재cookie의runtime session/user와정확비교한다. 둘중하나라도존재하면둘다필수·불일치403·실권한은기존MFA/currentrole/다른승인자검사에남긴다. 이헤더는권한부여나로그인토큰이아닌추가fence이며새UI privateconsumer계약이다. 헤더없는기존완료API/native계약을임의변경하지않는다. coordinator 중앙등록은이모듈hook을전체billingPOST범위에1회적용한다.
- meaningful red→green: native합성중앙앱에서세션B쿠키+원래Aexpected헤더는서버기록전403, 부분헤더도403, 정확session헤더는기존POST계약통과; 새client정확두headerassert. ownAPnativeSQL에도현세션mismatch기록없음범위를추가한다.
- multiline 조건은root가수용한actual입력계약불일치다. 기존owner parseBillingPlan의termsText/refundText만LF/CR/tab허용하는exactpatch와focusedcase를root에제출한다. ownadmin은원파서재사용을유지하고해당두body필드만같은제어문자규칙을허용한다. name/version/reference/id/securitysecret검사를완화하지않는다.

### Session fence / multiline 최종 실제 focused 결과

- binding/policy 추가 AP68daf0 exit1 **10/12** `/tmp/ap-billing-admin-binding-policy-red.log`; API2921cb exit1 **3/4** `/tmp/ap-admin-billing-fence-red.log`는다른운영자현재쿠키+원래actor/session expected헤더인데이전POST201이기록되는반례였다. 원기대403과입력계약을유지했다.
- 서버조건부fence·client두header및terms/refundbody문단허용구현후 AP0fbc2a/Fielde50e16 **각4/4 exit0** `/tmp/{ap,field}-admin-billing-fence-green.log`. 정상중앙createApp이므로이전에등록된기존가격POST에도hook이실제로적용됨을검증했다. 헤더없는완료API는그대로이며실currentrole/다른승인자검사에추가fence를붙였다.
- AP own UUIDPG17 `node /tmp/ap-admin-billing-run-db.mjs` **61634 terminalexit0 1/1** `/tmp/ap-admin-billing-native-fenced.log`: 원래조회SQL/집계/overview감사delta와다른expectedactor/session POST403→billingevent개수불변/planretired null을실제로확인했다. operational PG/provider/청구·환불/실MFA는아니다.
- root existingbilling-client exactpolicyText patch 이전에는APc01915 **11/12 exit1** `/tmp/ap-billing-admin-binding-policy-current.log`: body준비는통과했지만실제multiline조건응답파서가거부했다. root가termsText/refundText만LF/CR/tab을허용하는원파서patch를적용했음을읽어확인했고 ownparserfork나roothelper수정은없다.
- latest own web AP3a4084/Fieldfbe235 **각12/12 fail0skip0 exit0**, `/tmp/{ap,field}-billing-admin-final12.log`. 실제 POST두header/unknown403sameUUID유지 및legal조건LF/CR/tab roundtrip·nameLF/NUL거부를확인했다.
- latest 양web typeea856b/5e68d8, 양APItype9e39dc/587fe5 **모두exit0**, own11파일eslint8c805b exit0. 이전ownnativeundefined tuple오류·peercli9작성중타입오류는보존하며최신결과와구분한다. `git diff --check`f3999b exit0.
- 최종 read-only CLI69462는직전98005이후바뀐fence/header/멀티라인조건·exactroot등록만좁게읽는다. 완료100밖복구를다시전면검토하지않는다. 아직결과미확인이며clean주장하지않는다.

## 최종 완료 / 파일 동결 인계

- 최종 narrow CLI **69462 terminalexit0**, `/tmp/billing-admin-fence-final-audit-result.md`를실제로읽음: **Clean — no remaining concrete P1/P2 finding in the specified repair**, rawconfidence **0.91**. source read-only이며검수/브라우저/DB/provider를실행하지않았다. 최초33114의P2.94·repair98005의P2.87과각red/보완근거를위에보존했다.
- 최신자체증거: 양웹 **12/12 exit0**, 정상중앙양API **4/4 exit0**, AP ownUUIDPG17 **1/1 exit0**, 양API/web type모두exit0·owneslint11파일exit0·diffcheckexit0. 소스14경로(웹4×2/APIreadroute+synthetic2×2/APnative1/본계획1)는이증거및clean뒤동결한다. mainTASKS/handoff/coverage/Git/runtime/기존helper/UI를child가수정하지않았다.
- Field 실제SQL/audit증거는root가별도로실행: **98969 terminalexit0 15/15 fail0skip0**, `/tmp/field-ai-entitlement-repair15-current.log`의새adminoverview실SQL·redaction·허용overview감사검수green을root가보고했다. child AP1/1과구분하며15case전체를child가실행했다거나기존완료전체QA를재검수한것으로주장하지않는다.
- 연결patch는root가적용했고중앙app각1회등록·billing전용component/CSS각1회삽입·시안설명/메뉴를read-only확인했다. 가격/환불기존원장·서버권한/다른승인/worker는그대로소비한다. 추가session fence는두expectedheader를보내는새UI경로의extra binding일뿐권한을만들지않고기존header없는API계약을보존한다.
- root package 제안: 양API `test:unit` 기존목록뒤`test/admin-billing.test.ts` 추가. AP DB native목록에`test/admin-billing.db.test.ts` 및현재엄격ownUUIDrunner의선택검사와동일조건추가. 새worker/env/migration필요없음. 웹testglob은기존에새consumer파일을포함한다. child는package를수정하지않았다.
- 중간4build는실제통과했으나최신fence/header·multiline/중앙bundle을포함하는새managedbuild는root 후속이다. .next type/build동시실행실패를보존하고최신중앙build를child가실행한것처럼주장하지않는다. 추가optional검수/review나완료화면재조정은하지않는다.
- 남은외부: 실제Toss/환불/카드/실MFA·생산가격/법무승인·사용자최종고정시안/동선/실기기/전체접근성·전체QA160/G. 실제공급사/operational데이터/배포/청구/환불/발송/삭제를수행하지않았다. 원본reference는불변이며새가격/환불/복구기능만기존디자인안의`(추가)`다.

정확한root다음명령(추가source없다면focused재반복불필요):

```bash
cat /tmp/billing-admin-fence-final-audit-result.md
tail -n 10 /tmp/ap-billing-admin-final12.log
tail -n 10 /tmp/field-billing-admin-final12.log
tail -n 10 /tmp/ap-admin-billing-native-fenced.log
# 중앙runtime/build와현재gate증거·원장/인계/코드포함commit은root가통합한다.
```

## 중앙 적용 완료 — a974b90 (2026-09-27)

Root가 마지막 source의 whole type97507·lint58007 exit0 및 launcher최소repair scopedlint/syntax0을 확인했다. old43912 Ctrl+C terminalexit1, first31268의compiledCLI mockprofile 누락exit1을보존한다. 명시ownprofile전달 후 **managed83305** 최신 양API/webbuild·AP81/Field73마이그레이션·quiesced기준선·Fieldroute-keyworker local_reconciliation을반영했다. 실제runtime-evidence exit0: 양ready/workspace/admin200, 보호API401, AP SSR 두홈링크, ownbaseline각1·receiptAP3/Field1. controller35492/Fieldworker36190각1·같은parent 확인. 원장TASKS49[x]/9[ ]·인계/coverage/audit/phase에체크하고sourcecommit **a974b90**으로저장했다.

전체LLM/PG/MFA/발송/DNS/TLS·운영restore·전체E2E·사용자최종UI/기기/동선/출시는미검수다. 고정reference변경없음. source미상원장을초기화하거나새UUID재발송하지않는다. 적용schemaAP81/Field73은동결하고필요한추가schema만AP82/Field74부터조율한다. 재현한새오류없이는이미끝난집중검수/구현을반복하지않는다.
