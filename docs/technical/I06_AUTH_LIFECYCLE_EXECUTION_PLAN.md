# I06.AUTH-LIFECYCLE — 내부 인증 수명 관리 (2026-09-27)

Task ID / Product / Owner: I06.AUTH-LIFECYCLE / AP·Field 각각 / public_write, Coordinator=root
State: verified (own backend/restore scope, root integration pending). 착수 HEAD75ec07d, TASKS44[x]/7[ ] 보존. 이 파일 착수 전 status는 중앙 C03 계획 신규 파일만 있었다.

## 읽은 기준과 추가 범위

- AGENTS6.1·TASKS 상단·현 인계·C03 잔여 계획·아키텍처 B01~B12/21개 결정·제품별 연동 경계·계약4.3/4.11·보안5.4/5.5·QA150~155/159, 복원 G-A1/F3/I3를 따른다. QA43~46/113/126/146의 구독·업무 보존은 변경하지 않는다.
- 기존 `[x] I06.NATIVE-REVOKE`, A08/F09.REVOCATION-RESTORE와 설치 PUBLIC-WRITE.FIELD-BFF-UI는 완료 이력이다. 완료 원장·native owner/selection/서명 회수·UI를 재구현하지 않는다.
- **새 누락의 소스 증거:** 현 BetterAuth1.7.5 OAuth provider의 `revokeOpaqueAccessToken`은 token row DELETE, `invalidateRefreshFamily`는 두 deleteMany 호출이다. 설치 소스 `introspect-njKASm3q.mjs:1484~1526`은 concurrent rotation race TODO를 명시한다. 기존 signed 원장은 selection/connection만 지원한다. Field `event_secret_cipher`는 revoke 뒤 복구 조회/route close 때문에 남지만 최종 종료·폐기 원장이 없다. 기존 revoked legacy 행을 signed 원장에 옮기는 절차도 없다. 이 추가 범위만 검수한다.
- 일반 OAuth 표준 endpoint/credential 검증/PKCE/rotation은 기존 검수된 provider가 담당한다. OAuth manage 연결 해제의 신규 공개 계약, 실메일/카카오/MFA와 실제 외부 token 호출은 이번 범위 밖이다.

## 파일 소유 / schema 조율

- 양API 새 `src/oauth-lifecycle-{journal,provider,restore}.ts`, `src/oauth-lifecycle-cli.ts`, `test/oauth-lifecycle.db.test.ts`; 좁은 `src/auth.ts` plugin 등록만. 필요할 때 기존 `revocation-restore.ts`/journal은 legacy baseline 호출만 검토하며 원래 경로를 바꾸지 않는다.
- Field 새 `src/ap-route-key-lifecycle.ts`, 좁은 route key 마무리 관련 원본/검사만. Field 예약·확인키·알림 전환·billing·domain·model·usage·양web/public intent는 수정하지 않는다.
- own UUID runner `tools/run-auth-lifecycle-db-tests.mjs`, 좁은 actual provider HTTP 사례는 테스트 파일에 보존.
- 예약 AP81/Field73 schema 요약을 수정 전 root에 제출했다. 승인 후 자체 metadata-only token/family tombstone·signed receipt·late issuance guard, Field route terminal clock/cipher guard만 추가한다. 기존 적용 migration 수정 금지, root만 managed 적용.
- app/server/package/런처/env/공통 원장·handoff·git/runtime은 root 소유. 필요한 중앙 patch와 exact commands를 이 파일에 제출한다.

## 순서 / 검수 명령 계약

1. 요구·현재 provider/DB/native 회수 근거를 읽고 schema 조율 → 실제 own UUID PG17 실패 사례 작성.
2. 표준 provider의 인증 이후 adapter mutation에 signed fsync 증빙을 선행 연결한다. rotation 정상 동작은 유지, 명시 폐기와 replay family late issuance를 durable tombstone으로 막는다.
3. quiesced legacy baseline·trusted checkpoint/실제 pre-revoke dump→격리 restore·기존 업무/확인키 보존, Field route key 안전한 최종 폐기·반복 복원을 검수한다. 비밀값을 증빙/로그에 넣지 않는다.
4. `node tools/run-auth-lifecycle-db-tests.mjs agent` / `... field` (새 own runner), 실제 실행 전 명령 구현. wrong product/peer DB/env 차단, own UUID clients0 종료 후 own DB만 ordinaryDROP한다.
5. `pnpm --filter @fieldai/agent-api typecheck`, Field equivalent; own paths `pnpm exec eslint ...`; 양API `build`; `git diff --check`. 실제 실행 결과만 체크한다.
6. `codex exec -m gpt-6-sol -c model_reasoning_effort="high" --sandbox read-only` 승인 fallback의 좁은 static review. 실제 명령/결과/raw confidence·수정 red→green을 기록한다. root가 최종 phase journal/commit에 통합한다.

## 완료 체크

- [x] 실제 provider 개별 access/refresh revoke·rotation/replay·잘못된 client·만료·late issuance
- [x] legacy revoked baseline·trusted checkpoint continuity·actual PG17 isolated restore
- [x] Field route key 종료/복원과 기존 예약·원본·확인키 보존
- [x] own type/lint/build·독립 clean 검토
- [x] root managed 적용/중앙 등록·원장/인계·commit
- [ ] 실 인증/외부 공급사·운영 RPO/RTO·최종 사용자 전체 인수 (blocked_integration/미검수)

## 실제 결과 / 실패 / 미실행

- 처음 조사에서 추측한 파일명/지침 glob은 실제 경로를 `rg --files`로 확인해 교정했다. 초기 fixture의 issuer URL에 `/api/auth`가 없어404였고 이를 수정한 뒤 의미 있는 red를 확인했다.
- AP23375/Field52396 각2/2 fail: 표준 access DELETE의 별도 proof 없음, refresh replay 뒤 이전 family late mint 허용. AP1004/Field40034 각2/2 green. 초기 generic adapter 타입 exit2와 refresh 테이블의 NEW.refreshId 접근42703도 실제 실패로 보존하며 수정했다.
- 양제품 실제 새owner선택·PKCE·명시동의와 새family refresh는 AP38242/Field31245 각4/4 exit0. 일반 client/user 영구차단을 만들지 않았다.
- 추가 baseline/복원은 AP54212 5/5·Field3077 6/6 exit0: pre-revoke actual PG17 pg_dump→새 UUID pg_restore에서 active true→native legacy baseline·최신 lifecycle checkpoint 재적용 false, 기존 고객 확인키GET200·cipher null·반복·proof 누락/변조 거부. AP 최초 fixture의 release draft_revision 누락23502는 보완한 실제 실패다.
- **새 추가 오류 근거 / 수정 전 범위:** AP6229/Field16630 exit1의 family 경합에서 advisory 대기를 관찰하지 못했다. SQL trigger는 원래 code ID, signed fence는 code fingerprint로 잠금키가 달랐다. 이 새 lifecycle 코드의 잠금 표현만 같은 fingerprint로 맞춘다. Field route key 기존예약 generation1/unknown 전송 유지→generation2 receipt 후폐기·actual복원 부분은 그 실행에서 통과했다.
- **현재 owner 변경의 provider 발급 누락 근거 / 수정 전 범위:** AP3132/Field67387 exit1은 정상 새 PKCE 이후 membership viewer 변경에도 refresh가200(기대400)이었다. integrator API의 현재 membership 검사는 기존 완료대로 유지한다. 새 provider adapter가 해당 reference의 현재 client/actor/owner를 확인해 기존 invalid_grant 경로로 반환하고, 새 lifecycle 발급 trigger에서 늦은 발급만 차단한다. 기존 native 회수 구현은 변경하지 않는다.
- managed runtime/env·운영 DB·실외부 token·전체 UI/E2E는 실행하지 않았다.

## 추가 범위 — 현재 증거로 재개하는 내부 누락

- own AP56225/Field24409 exit1: missing signed lifecycle directory 및 fsync-only intent/DB rollback에서 introspection200이므로 serving503 경계 추가. provider token/introspect/userinfo + 중앙 실제 Bearer runtime guard만, 기존 native revoke 복구는 허용.
- root 승인: pre-cutover backup의 당시 이미 provider DELETE된 토큰은 현재 revoked행 baseline으로 발견할 수 없으므로 signed metadata-only cutoff+당시 유효 access/refresh fingerprint allowlist를 추가한다. old row 복원 active→inactive actual PG17 검수, cutoff 이후 새 PKCE/명시동의 정상발급도 유지. rawtoken/code/ciphertext 증빙 금지. 미적용 AP81/Field73 자체 수정만.
- 소비자 red: 기존 actual pre-revoke dump에 generic family를 하나 더 넣은 뒤 baseline 전 provider가 과거 DELETE한 상황을 직접 재현한다. 최신 원장 복원 뒤 그 토큰 active=false를 먼저 검수한다.

## 현재 own 검수 결과 (pre-commit HEAD75ec07d, 2026-09-27 KST)

- 환경: Node24.18.0·PG17, `fieldai_agent_test_<UUID>`/`fieldai_field_test_<UUID>` 및 별도 restore UUID. source own loopback ports55431/55432, peer제품env제거. 원본 managedDB는 읽어 credential binding만 확인했고 복사/삭제/원장변경/중앙runtime기동은 하지 않았다. own종료 client0 확인 후 UUID DB만 일반DROP했다.
- `node tools/run-auth-lifecycle-db-tests.mjs agent` handle41179 exit0 **9/9**, Field handle84031 exit0 **10/10**, fail/skip0. 로그 `/tmp/{agent,field}-oauth-lifecycle-cli-green.log`.
- 실제 표준 provider handler: 개별 access/refresh revoke, 잘못된 client·만료·refresh rotation/replay, family 경합 advisorywait+완료후무효/late mint거부, cutoff 뒤 freshowner PKCE/명시동의/refresh200와 현재ownerloss400. provider Request는 실제 plugin이나 in-process이며 browser/TCP OAuth 전체동선은 미실행.
- 실제 PG17 docker pg_dump→별도 UUID pg_restore: revoked source 채택·원본native restore재사용·sourceciphernull, 당시 이미 provider DELETE된 generic access/refresh 복원 active=true→signed cutoff/latest replay active=false. 기존 고객확인키GET200·원본이름/예약보존·반복복원·파일누락/변조/immutable receipt거부.
- Field: revoke ACK 전202/key보존, 기존예약 generation1/unknown 전송 유지, 원본 generation2 AP close receipt 이후200/clock+ciphernull, late cipher POL03, 실제 pre-closebackup→terminalproof반복재적용, 원래예약확인키 유지.
- missing signed dir/fsync-only intent: OAuth serving503, revoke는 복구가능 유지. 자체 loopback Fastify actual HTTP `/integrations/v1/me`에 runtime guard 명시하여 missing/pending503과 원래 tokenrevokednull 불변, 복구후 일반401을 확인. 정상 product선택의200 전체Consumer는 과거 완료범위이므로 반복하지 않았다.
- CLI **실제 child source** `node --import tsx src/oauth-lifecycle-cli.ts --baseline-quiesced`, `--checkpoint-quiesced`, `--offline-restored`: ownUUID baseline반복·protected checkpoint export·별도UUID restore성공·동일activeDB복원거부. baseline 최초signedcutoff고정, 신규consent시 실제issueclock사용. compiled CLI/상시worker는 root managed 단계에서 확인할 범위다.
- own scoped ESLint: `/tmp/oauth-lifecycle-lint2.log`, exit0. 양API type26898/28755 exit0 로그 `/tmp/{agent,field}-oauth-lifecycle-type-final.log`; APIbuild80668/56060 exit0 `/tmp/{agent,field}-oauth-lifecycle-build.log`; `git diff --check` exit0.
- 추가 실패: AP86880 deletedlegacy true≠false meaningfulred. Field69990/42638는 fixture 변수가 앞선 route test안에 들어가 ReferenceError이므로 meaningfulred로 인정하지 않으며 수정후 실제 restoregreen. type4 union/generic signature exit2→type5/최종green. cutovergreen1 AP98676 8/8 exit0·Field42638 fixtureerror exit1, 위치수정+consumer 추가 후 AP46181 9/9·Field81501 10/10 exit0. 예상 missingproof revoke500의 provider errorlog는 synthetic temp path만이며 rawtoken/code/ciphertext를 남기지 않았다.

## 중앙 등록 patch / next exact commands (root 전용)

- 양 business runtime optional `oauthLifecycleGuard?:()=>Promise<void>`; 양 server `assertLifecycleServing(pool,lifecycleJournalFromEnvironment())` closure를 항상설정, integrator bearer syntax 확인뒤 guard실패503 `oauth_lifecycle_unavailable`. 표준OAuth plugin은 own파일에서 token/introspect/userinfo guarding; owner/session/native revoke는 복구경로 유지. root 적용완료 통보를 받았다.
- 양API package `lifecycle:baseline`, `lifecycle:checkpoint`, `lifecycle:restore` 각각 `node dist/oauth-lifecycle-cli.js --baseline-quiesced/--checkpoint-quiesced/--offline-restored`. Field `start:route-keys: node dist/ap-route-key-worker.js`. Field app route1회 + mock-run optional Field route worker1회는 root 등록.
- 기존 own `{AP|FIELD}_REVOCATION_JOURNAL_DIRECTORY/SECRET` 재사용. 신규 env파일/secret변경없음. CLI때만 `{AP|FIELD}_OAUTH_LIFECYCLE_CHECKPOINT_OUTPUT`, `_CHECKPOINT_FILE`, `_RESTORE_DATABASE_URL` 명시. checkpoint는 journal밖 보호경로 wx0600+fsync. 별도 offline UUID restore대상만 허용.
- root는 현재43912 전체 issuer/connector/worker정지확인→숫자순 managedmigrate(AP80/81·Field72/73)·APIbuild→각제품 `node --env-file=infra/{agent|field}/.env apps/{agent|field}-api/dist/oauth-lifecycle-cli.js --baseline-quiesced` 성공뒤 setup/mainAPI시작. baseline실패 nonzero가 boot를중단해야한다. mock/quiesced명시이고 운영auto adoption은 하지 않는다.
- 운영복원은 기존 native 최신checkpoint+기존restore와 **별도** lifecycle 최신checkpoint+restore 모두 필요하다. 외부신뢰latestcheckpoint·전체proof store동시rollback·실RPO/RTO는 이번 synthetic gate가 증명하지 않는다.
- 화면변경없음: 고정 `reference/field_ui_prototype_v3.html` 원본 디자인 고정·완료 화면 반복 조정 금지·새 기능만 `(추가)` 원칙 유지. 기존 연결메뉴에 새 routekey 종료UI를 넣으려면 root가 시안기존배치 안 `(추가)` 표시해야하며 이번 ownerAPI/worker 완료와 UI 인수를 구분한다.

## 독립 검토38794 추가 보완 (수정 전 기록)

- CLI exit0. 원문 /tmp/oauth-lifecycle-audit-result.md, 로그 /tmp/oauth-lifecycle-audit.log. P1 revokedselectionlateissue .96, P1 olderbackup prematurekeydisposal .97, P2 broaddelete unsignednewfamily .94.
- 첫 active-token 주장은 기존 AP68/Field61 native trigger가 이미 revoked로 저장하므로 native부분falsepositive. 해당완료코드변경없음. 새 provider code후 selectionrevoke tokenresponse200 경계만 currentselection/owner lock 및 invalid_grant로 보완한다.
- broaddelete actualprovider refreshreplay의 signed append중 freshfamily 추가 red 뒤 own adapter snapshot rowID삭제로 고정.
- Field older originalroute backup에 latestterminalproof 폐기를 red로 재현. 신규 own helper src/ap-route-key-reconciliation.ts가 runtimeclose/restore에서 ACK/unknown delivery/original예약조건을 검증한다. 미충족restore atomicrollback/key보존/proofpending503. 기존native/예약/도메인파일변경없음.

- 추가 신규 own 동시성경계: runtime API는 connection→close request, worker finalizer는 close request→connection 잠금순서다. pending재시도와 worker 동시실행에서 실제 교착을 주입해 확인하고 같은 connection→request로 통일한다. 원본native lock정책은 수정하지 않는다. 현재owner FORSHARE로 종료승인동안권한변경도직렬화한다.

## Repair 실제 최종 근거 / 기존 완료 보호

- review38794는 exit0이나 clean이 아니다: P1 .96/.97 및 P2 .94 위세지적을 보완했다. 원본native lateSQLactive 주장은 native이미revoked처리하므로그부분falsepositive이고, codeexchange200의새provider경계만 수정한다.
- 신규 meaningfulred AP43816 exit1(11중2fail), Field33861 exit1(12중3fail): 실제 codeafterselectionrevoke200≠400·signedappend동안새family 삭제·실제older originalroutebackup restore가키폐기를거부하지않음. ownprovider는 selection/currentowner FORSHARE부터표준adaptercreate 완료까지 유지, signedsnapshot rowID로만삭제한다. Field runtime/restore는 같은 helper조건을검증한다.
- 수정후 AP34169 **11/11 exit0**·Field36588 **12/12 exit0**. 로그 `/tmp/{agent,field}-oauth-lifecycle-review-green.log`; 타입75554/24012 exit0 `/tmp/{agent,field}-oauth-lifecycle-repair-type.log`.
- 추가 concurrency: sameUUID21710은실패를재현하지못한exit0이므로red근거아님. 신규UUID owner요청과worker를실제잠금경계에서겹친 Field34466 exit1의API500≠409를확인했다. ownfinalizerconnection→request통일·requestbinding재조회·owner FORSHARE 이후 Field74877 **12/12 exit0**, 로그 `/tmp/field-oauth-lifecycle-final-native.log`. ownerloss시pending/key보존도포함. 로그error가syntheticfault인경우실제code와분리한다.
- 최종 own ESLint90118 exit0 `/tmp/oauth-lifecycle-final-lint.log`; API finalbuild1420/11557 exit0 `/tmp/{agent,field}-oauth-lifecycle-final-build.log`. 신규schema AP81/Field73 이외원본적용migration/nativejournal/restore/domain/예약코드 수정없음.
- 좁은 repair independent CLI39658 terminal exit0: 위3수정+newworkerlock만재검토, **No remaining P1/P2, raw confidence .84**. 원문 `/tmp/oauth-lifecycle-repair-result.md`, 로그 `/tmp/oauth-lifecycle-repair-review.log`. read-only이고 reviewer는 테스트/서비스/migration/network를 실행하지 않았다. 해당sandbox targetedgitdiff불가는검토한계이며원문source로확인했다.
- backend/restore 기능이검수완료되어도 existingconnection 화면의 status GET/명시close POST `(추가)` UI는 아직없다. root가 부모 I06 UI잔여로 별도기록한다. 원본디자인고정·완료화면반복조정금지·시안밖새기능만 `(추가)`. 전체시각/동선은사용자최종검수이다.

## 동결 / 다음 coordinator 단계

- 2026-09-27: own 19개 파일 backend/CLI/검사/계획을 동결했다. 현재 active own handle 없음. root만 whole type/lint 1회·managed migration/build/baseline/start·workerready·완료원장/인계·phase commit/ak journal을 수행한다. 신규오류없으면 원본native/설치/완료UI를재개하지않는다.
- migration SHA256: AP81 `0487e8ebfbd78dd21d2b39e7ac5827b14e12530d02bd94e750a5135c78bcf109`; Field73 `73e3cea7d073a84130f8a31f9497fe80007859d48a0c50a747912ad9e05706fb`. managed실제적용은 agent미실행이며 root gate에남긴다.
- Repairred 최초 edit command는 PythonIndentationError로변경되지않았다. 그뒤AP64556/Field31951은기존9/10suite exit0였으므로 red증거로쓰지않는다. 성공한 fixture edit뒤AP43816/Field33861이 meaningfulred다. 현재까지실패/미검수이력보존하며 기대값을bug에맞추지않았다.
- 완료scope: 표준OAuth 일반token/가족회수·currentapproval/owner·늦은발급·signedproof serving·deletedlegacycutoff/baseline/복원·Field backend routekey 승인/보존/종료/원본보존. 미완료scope: rootmanagedcompiledCLI/상시worker·화면 `(추가)` UI·실인증/메일/MFA/카카오/실외부OAuth/운영RPO/RTO·최종사용자전체인수. 실제외부없음 `blocked_integration` 유지.

## 중앙 적용 완료 — a974b90 (2026-09-27)

Root가 마지막 source의 whole type97507·lint58007 exit0 및 launcher최소repair scopedlint/syntax0을 확인했다. old43912 Ctrl+C terminalexit1, first31268의compiledCLI mockprofile 누락exit1을보존한다. 명시ownprofile전달 후 **managed83305** 최신 양API/webbuild·AP81/Field73마이그레이션·quiesced기준선·Fieldroute-keyworker local_reconciliation을반영했다. 실제runtime-evidence exit0: 양ready/workspace/admin200, 보호API401, AP SSR 두홈링크, ownbaseline각1·receiptAP3/Field1. controller35492/Fieldworker36190각1·같은parent 확인. 원장TASKS49[x]/9[ ]·인계/coverage/audit/phase에체크하고sourcecommit **a974b90**으로저장했다.

전체LLM/PG/MFA/발송/DNS/TLS·운영restore·전체E2E·사용자최종UI/기기/동선/출시는미검수다. 고정reference변경없음. source미상원장을초기화하거나새UUID재발송하지않는다. 적용schemaAP81/Field73은동결하고필요한추가schema만AP82/Field74부터조율한다. 재현한새오류없이는이미끝난집중검수/구현을반복하지않는다.
