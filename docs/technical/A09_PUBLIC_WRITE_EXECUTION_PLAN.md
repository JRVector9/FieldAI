# A09.PUBLIC-WRITE — 공개 설치 쓰기 실행 계획 (2026-09-27)

Task ID / Product / Owner: A09.PUBLIC-WRITE / AP 공개 API·Field HTTP consumer / Public API Agent (Coordinator=root)
State: implemented / focused verified; 전체 A09·운영·UI는 미완료

## 착수 근거와 완료 범위 보존

- TASKS 상단 36개[x]/7개[ ]·AGENTS.md6.1·현재 인계와 HEADfc10170를 먼저 확인했다. 공유 worktree의 root billing 변경은 읽기만 한다.
- AP PRD2.10/연동 계약4.3·4.12는 `POST /integrations/v1/connections`와 `POST /integrations/v1/deployments`를 요구하지만 현재 OpenAPI preview.8에는 생성이 없다. 기존 인가·Field 양방향 bind/source/revoke·native 설치는 완료 범위로 유지한다.
- B03~B05/B08~B11, QA86/129/131/132/150, G-A2/G-I1/G-I2의 공개 scope·actor·조직·멱등·설치 경계를 이번 내부 증분에 적용한다. QA 전체/G 전체 통과를 주장하지 않는다.

## 계약 결정 (Coordinator 승인 완료)

- AP OpenAPI preview.9: `ap.connections.create`와 `ap.deployments.manage`를 owner가 별도 선택·동의한다. client가 요청한 외부 조직 UUID는 설치 연결의 caller-side 식별값이며 Field 접근 권한/로그인/예약 동의로 쓰지 않는다.
- connection은 현재 AP grant/client/actor/조직/대표 AI + 외부 조직 UUID + 정확 origin에 고정되는 `installation_only` binding이다. 양방향 정보·예약 연결 상태를 흉내 내지 않는다.
- UUID `Idempotency-Key`의 동일 grant/client/operation/body 재전송은 같은 resource로 복구한다. 변경 body 재사용은409, 다른 조직/AI/연결/기존 native 배포 조작은404.
- deployment는 이 connection의 `owned_embed`만 준비한다. DNS/정확 origin 소유 검증 전 pending이며 명시 활성화 전에 고객 공개하지 않는다. 관리 조회/검증/활성/중지 API는 이 client+grant가 만든 배포만 허용한다.
- 기존 `GET /deployments`의 선택 목록 및 대화 읽기 권한은 생성으로 자동 확장하지 않는다. 새 배포 대화 읽기가 필요하면 owner가 새 배포를 별도 선택/재동의한다. 기존 Field 설치가 선택한 allowedDeploymentIds를 몰래 변경하지 않는다.
- Field 새 consumer는 이 버전의 JSON/HTTP 경로만 사용하며 AP source/domain/DB를 import하지 않는다. 일반 외부 client도 같은 결과/오류를 받는다.

## 소유 경로와 등록 계약

- 수정: `contracts/agent-integrator-v1.openapi.json`, `contracts/CONTRACT_NOTES.md`, `tools/test/agent-integrator-contract.test.mjs`, Coordinator 추가 승인 후 `docs/03_INTEGRATION_CONTRACT.md`의 scope/API표·preview.9 명시(마스터 재생성은 root).
- 신규: `apps/agent-api/migrations/000075_public_write_installations.sql`, `apps/agent-api/migrations/000077_public_write_selection_revoke.sql`, `apps/agent-api/src/integrator-public-write.ts`, `apps/agent-api/test/integrator-public-write.db.test.ts`, `apps/field-api/src/ap-public-write-client.ts`, `apps/field-api/test/ap-public-write-client.test.ts`, `tools/run-public-write-db-tests.mjs`, `tools/spikes/public-write-consumer-http.test.ts`, 본 문서.
- 합의 후 좁은 변경 요청: AP `integrator-auth.ts`(새scope/동일transaction 재검사), `integrator-routes.ts`(선택 scope 2개만), `auth.ts`(인가 allowlist), `deployments.ts`(기존 origin/verification helper export만).
- `app.ts/server.ts/package.json/tools/mock-run.mjs/TASKS/CODEX_HANDOFF/coverage`·다른 agent 경로와 git stage/commit/runtime 재기동은 root 소유다. root가 실행 등록한다: `registerIntegratorPublicWriteRoutes(app, businessRuntime)`.
- Field DB/새migration는 필요하지 않다. AP75는 새 테이블/불변 binding·멱등 원장이다. root가 AP mock DB에 AP75가 실제 적용됐음을 발견했고 현재 pg_catalog의 public_deployment_revision/immutable 함수·4trigger를 대조하여 당시 원본을 동결했다. 회수/late activate 보완은 별도 AP77로 옮겼다. Field DB 변경은 없다. 이미 적용된 migration을 수정하지 않는다.

## 순서와 실제 실행 예정 명령

1. 계약 작성 → `node --test tools/test/agent-integrator-contract.test.mjs`로 scope/path/schema 검사.
2. consumer 계약 및 실제 AP HTTP+PG17 오류/권한 테스트를 먼저 작성하고 미구현404 red를 확인한다.
3. 공개 API와 HTTP consumer 구현 → isolated 자체 UUID DB(실제 PostgreSQL17) + Fastify listen/fetch 검사. API session resolver/권한 fixture와 실제 외부 DNS/PG/발송 검수는 구분한다.
4. `pnpm --filter @fieldai/agent-api typecheck`, `pnpm --filter @fieldai/field-api typecheck`, `pnpm lint`, 양 API build. 무관한 전체QA 반복은 하지 않는다.
5. ak 독립 CLI `gpt-6-sol/high`, read-only 좁은 own diff. 실제 로그/exit 결과·미실행·수정/복구를 본 문서에 기록하고 root에 제출한다.

## 오류·복구·미검수

- revoked/expired/disabledclient/권한삭제/currentowner변경에는401·scope부족403. selection→token/consent/current membership share 잠금과 거래 중 재검사를 통해 회수 후 새 설치를 만들지 않는다.
- DNS 검증 실패/timeout은409 pending으로 유지하며 fake verified/active가 되지 않는다. 소유권 검증 중 회수·중지·moderation 변경은 최종 저장에서 재검사한다.
- 동일 UUID/응답 유실/동시요청은 저장된 결과 조회로 수렴, 신규 resource로 우회하지 않는다. 과거 연결/배포를 삭제하지 않는다.
- backend 선행이므로 새 화면/시안 검수는 하지 않았다. Field 사업자 새 쓰기 UI·별도 재동의 flow·실 DNS/외부client 공급사·최종 시안/QA/G는 root 후속과 구분한다.

## 착수 당시 기록 (이력)

착수 당시 서비스 명령은 미실행이었다. 실제 최신 결과는 아래 제출 기록을 따른다. 계획/파일 읽기는 테스트 통과가 아니다.

## 실제 검수와 제출 — 2026-09-27

Task ID / Product / Owner: A09.PUBLIC-WRITE.CONTRACT-BACKEND / AP + Field HTTP consumer / Public API Agent
State: implemented / focused verified, Coordinator 등록·runtime·UI·최종 인수는 미완료

### 이번 완료 범위

- [x] AP OpenAPI **1.0.0-preview.9**에 owner 별도 동의 scope·설치 전용 연결·owned_embed 생성/조회/검증/활성/중지·UUID 멱등·If-Match·안전 오류를 고정했다. 계약 정적 red(미선언 scope)→1/1 green을 먼저 확인했다. 기존 preview.8 JSON 의미/경로/선택·원본 읽기는 유지한다.
- [x] native 실제 HTTP + 자체 PG17에서 조직/AI/client/grant/actor/consent/현재 membership/만료/회수·권한·동시 UUID 재전송·같은 key 다른 본문·revision/저장된 결과 복구를 확인했다. 배포 생성으로 대화 읽기 목록을 자동 확대하지 않는다.
- [x] Field의 version-pinned HTTP consumer를 구현했다. 일반 외부 client와 같은 API/권한·오류를 사용하며 AP domain/DB import가 없다. mock의 exact `*.localhost` origin 및 실제 HTTPS 기준도 AP에 맞춘다.
- [x] 기존 native selection 회수의 AP75 신규 public binding에 한정한 pause/늦은 활성화 보호를 **AP77**에 추가했다. 다른 native 배포/구독/원본·접수/예약을 삭제하거나 회수하지 않는다.
- [x] Field 실제 HTTP consumer→별도 loopback AP 서버/자체 UUID PG17에서 설치 전용 연결/배포·proof port/활성·scope403·다른 client404·회수401 및 **저장 후 malformed 성공 응답→같은 UUID 복구/원장1개**를 확인했다.
- [x] 신규 strict AP focused runner를 repository `tools/run-public-write-db-tests.mjs`에 저장했다. 다른 product 인자/잘못된 port는 DB 연결 전에 거부한다. 기존 공통 runner/infra는 수정하지 않았다.
- [x] 독립 CLI 리뷰의 P2 3건을 실제 red→수정→검수했고 AP75/77 분리까지 재검토했다. 마지막 read-only audit는 추가 P1/P2 없음이다.
- [x] root 중앙 `app.ts`에 등록한 경로를 native fixture가 직접 사용한다. 수동 등록을 제거한 focused66327 실제7/7 exit0으로 확인했다.
- [ ] Field unit 목록·AP77 managed 반영·실제 신규 경로 상태/양 웹은 Coordinator 통합 검수로 남는다.
- [ ] 기존 시안 배치의 `(추가)` consent 안내·Field 사업자 새 public-write BFF/화면·새 배포 대화 읽기 재동의 사용자 흐름은 남는다. 기존 native Field 설치/양방향 연결을 재구현하지 않는다.
- [ ] real DNS/TLS/외부 client 계약·공급사/전체 QA/G·사용자 최종 시안/동선/실기기는 미실행이다. mock verification port는 실제 외부 DNS 검수가 아니다.

### 명령·환경·실제 결과

Node24.18.0 / AP 소유 PostgreSQL17 loopback55431 / 매 실행 자체 UUID `fieldai_agent_test_<32hex>` / AP schema만 적용 / Field DB·비밀값·서버는 필요하지 않음. 합성 OAuth fixture와 실제 mock 인증/인가 흐름을 구분한다. 실제 mock signup/login→client 등록→owner 조직·AI 선택→PKCE code→명시 OAuth consent→bearer POST를 별도 native case로 검수했다. 새 UI/브라우저나 실 OAuth 공급사 evidence는 아니다. 코드 포함 commit은 아직 **uncommitted on HEADfc10170**, root만 commit한다.

| 실행 명령 | 실제 결과/handle/log |
|---|---|
| `node --test tools/test/agent-integrator-contract.test.mjs` | final exit0,1/1, `/tmp/a09-public-write-contract-final.log` |
| `node tools/run-public-write-db-tests.mjs` | **73668 exit0,7/7 fail0/skip0**, `/tmp/a09-public-write-native-repo-runner.log`; 중앙 등록 후 **66327 exit0,7/7**, `/tmp/a09-public-write-native-central-registration.log` |
| `pnpm --filter @fieldai/field-api exec tsx --test test/ap-public-write-client.test.ts` | final exit0,**5/5 fail0/skip0**, `/tmp/a09-public-write-consumer-final.log` |
| `node --import tsx --test tools/spikes/public-write-consumer-http.test.ts` | **83629 exit0,1/1 fail0/skip0**, `/tmp/a09-public-write-consumer-http-final.log` |
| 양 API `typecheck` | **29470/78274 exit0**, `/tmp/a09-{agent,field}-typecheck-final.log` |
| A09 소유10개 TS/mjs scoped eslint | **73492 exit0**, `/tmp/a09-public-write-lint-final.log` |
| 신규 runner/HTTP harness eslint | **66880 exit0**, `/tmp/a09-public-write-harness-lint.log` |
| 양 API `build` | **34526/80692 exit0**, `/tmp/a09-{agent,field}-build-final.log` |
| AP75 applied catalog 본문/trigger 대조 | exit0, original 함수2/2 본문 일치·trigger4·AP77 미적용, `/tmp/a09-public-write-applied-catalog.log` |
| 신규 runner `field` 인자 / AP port55432 입력 | 각 **예상 거절 exit1**, `/tmp/a09-runner-wrong-{product,port}.log` |

위 결과는 이전 AP29/Field30·전체 QA/대규모 E2E와 합산하지 않는다. 양 제품 전체 lint/typecheck/build/managed runtime은 root가 다른 agent 결과를 함께 통합한 뒤 별도 기록한다.

### 독립 리뷰와 실패 접근

- 최초 `gpt-6-sol/high` **13533 exit0** (`/tmp/a09-public-write-audit-result.md`): P2 3건. (1) Field mock origin 불일치 confidence0.99, (2) malformed 저장 성공 응답을 최종 실패로 분류0.94, (3) 영구409를 retryable true로 분류0.98. 모두 수정/강화검사로 반영했다.
- 마지막 repair **66741 exit0**, `/tmp/a09-public-write-repair-audit-result.md`: **No concrete remaining P1/P2**, raw confidence**0.91**. 자체 테스트/외부 provider 호출/변경 없음인 read-only/static 검토다. 실제 검사는 위 명령 결과다.
- 초기 fixture SQL에서 현재 knowledge_release의 source_kind/draft_revision·trial의 started_by를 잘못 추측해 실패했다. fixture는 현재 native 초안/명시 승인 API로 준비하고 정확 schema로 바꿨다. 이 setup 실패는 기능 red/pass로 세지 않았다.
- native 계약 red는 실제 미구현 POST404≠201이었다. 새 회수 red는 public 배포가 active 상태로 남음이었다. malformed/409 분류도 실제 강화 검사 red를 확인했다. 기대값을 오류에 맞추거나 실패 테스트를 삭제하지 않았다.
- AP75가 실제 mock DB에 이미 적용됐음을 root가 발견한 뒤 pg_catalog를 대조했다. 추가 revoke 함수/guard/trigger를 AP77로 옮겨 적용 당시 원본을 보존했다. agent의 초기 “AP75 mock 미적용” 추정은 틀렸으며 catalog 증거로 정정했다.
- 확장 HTTP 검사 **53870**은 본문1/1 뒤 FORCE DROP이 종료 중 own PG client를 끊는 async uncaughtException으로 **exit1**이었다. 통과로 합산하지 않았다. app/pool close 후 own backend0을 관찰하고 일반 DROP만 쓰는 harness로 보완한 **83629 exit0**이 최종이다. 기존 runtime/운영 DB 삭제·실 카드 청구·고객 발송·배포는 없다.

### 복구와 다음 의존성

- native OAuth/Field 설치 및 원본 데이터는 기존대로 유지한다. 새 API를 root가 미등록 상태로 둘 수 있으며 원장/승인/미상 결과를 삭제해서 rollback하지 않는다.
- SDK 배포 사용을 중단하려면 own 배포 pause 또는 native selection 회수를 사용한다. API token을 상대 로그인으로 전환하지 않는다. expired/revoked/다른 actor는 새 작업·저장된 결과도 읽지 못한다.
- 같은 원래 UUID·target·If-Match/body가 있는 caller intent로 복구한다. 유실 응답을 새 key/connection으로 해결하지 않는다. 영구409는 현재 상태/내용을 새로 확인해야 하며 unchanged retry 허가가 아니다.
- managed 통합/consent 문구/남은 BFF/화면 단계는 `A09_PUBLIC_WRITE_INTEGRATION_PATCH.md`를 따른다. parent A09 전체 출시 완료 대신 이 내부 세부 범위를 체크하고 남은 사용자 흐름·공급사/인수를 보존한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
sed -n '1,100p' TASKS.md
git status --short
git log -3 --oneline
cat docs/technical/A09_PUBLIC_WRITE_INTEGRATION_PATCH.md
node tools/run-public-write-db-tests.mjs
pnpm --filter @fieldai/field-api exec tsx --test test/ap-public-write-client.test.ts
node --import tsx --test tools/spikes/public-write-consumer-http.test.ts
node --test tools/test/agent-integrator-contract.test.mjs
```

완료된 내부 범위를 기억 부재로 다시 만들지 않는다. 추가 UI/BFF/운영 결함을 선택할 때 해당 미완료 ID/범위/요구/명령을 먼저 기록한다.

## 내부 완료 체크와 중앙 반영 (2026-09-27)

- [x] **A09.PUBLIC-WRITE.CONTRACT-BACKEND** preview.9 공개 connection/deployment POST·명시 scope/actor/org/선택AI/exactorigin·UUID/If-Match·own client 배포 verify/activate/pause·selection 회수/늦은 활성화 차단·Field 공개 HTTP consumer·새scope 동의 설명. 코드 **ef0dfd3**, AP75/77·auth/integrator/public write·Field client·OpenAPI/계약03·permanent runner/native HTTP 검사. **66327 AP7/7**, Field5/5·실OAuth/HTTP83629 1/1·계약1/1 exit0; 정적66741 P1/P2 없음/0.91. **새Field durable intent BFF/화면·실DNS·최종 인수는 제외**한다.

managed95896 AP78/Field69·최신 양API/web build/ready·양웹200·새API401·자체workers ready를 root가 실제 확인했다. 현재 TASKS40[x]/7[ ]이며 전체 출시 완료가 아니다. 상세 현재 결과/미실행/다음 명령은 CODEX_HANDOFF.md 상단을 따른다.

## 현재 선택 — A09.PUBLIC-WRITE.FIELD-BFF-UI (2026-09-27)

Task ID / Product / Owner: A09.PUBLIC-WRITE.FIELD-BFF-UI / Field / Public Agent, Coordinator=root
State: in_progress

- 착수 HEAD **9a7fe33**, TASKS40[x]/7[ ]·현재 소유 분할·인계·현재 구현을 읽었다. root의 TASKS/paid 계획 변경은 읽기만 했다. ef0dfd3의 CONTRACT-BACKEND와 native 설치/양방향 동의 완료는 보존한다.
- 적용 요구: B03~B05/B08~B11, Field PRD3.5/3.6, 계약4.11/4.12, QA66/68/86/128/129/130/131/132/150. 이번 검수는 원래 intent/조직/actor/AI/origin/scope·unknown/replay/If-Match·현재 권한·SDK 승인·미연결 직접 경로의 focused 내부 증분이다. 전체 QA/G/실공급사/최종 시각·동선 인수를 통과 처리하지 않는다.
- 신규 소유: Field `migrations/000071_public_write_intents.sql`(착수 예약72→Coordinator 최종71), `src/ap-public-installation-{routes,execution}.ts`, `test/ap-public-installation.db.test.ts`, `tools/run-field-public-write-db-tests.mjs`, `tools/spikes/field-public-installation-http.test.ts`, Field web `src/field-ap-public-installation.tsx`·`test/ap-public-installation.test.tsx`. 기존 own 공개 HTTP client 확장은 가능하나 이번에는 변경하지 않았고 AP 공개 계약/backend는 재구현하지 않는다. 새 CSS 없이 기존 스타일을 사용했다.
- Coordinator 요청 중: 기존 `ap-connector.ts`의 명시 `purpose:'installation'` scope 요청과 새 installation-only 권한 helper, 기존 Field 설치 shell의 새 component mount 및 공개 site resolver의 새 helper 호출. 허가 전 기존 파일은 수정하지 않는다. 공통 app/server/business/package/mock-run/workspace/TASKS/handoff/git/runtime는 root만 수정한다.
- Field71에는 AP OAuth 설치 scope 요청 사실과 Field durable intent/operation을 추가한다. AP PK는 외부 문자열 참조다. 이미 적용된 migration은 수정하지 않는다. managed migration/중앙 runtime은 root만 실행한다. 착수/UUID 검사 당시 파일번호72는 이력이며 root의 아직 미착수 entitlement71 예약 해제 후, managed 미적용인 같은 본문을71로 rename했다. 다음 AI entitlement는 root의 별도 Field72/AP80 범위다.

### Field 내부 API 계약 → consumer 검사 → 구현

1. `POST /v1/sites/ap-public-installations`: 현재 Field owner/session/org와 공개된 정확한 사이트 origin, 선택 AP connection/grant/org/AI, 표시 방식, 명시 설치 준비 승인을 UUID `requestKey`로 먼저 저장한다. 이 요청은 AP 설치/배포 활성화/Field 역방향 동의나 결제가 아니다.
2. `GET /v1/sites/ap-public-installations`: 현재 owner의 own 조직·사이트·actor intent와 pending/unknown 원래 operation key/입력을 반환한다. 토큰/secret/원문은 반환하지 않는다.
3. `POST /v1/sites/ap-public-installations/:id/actions`: `requestKey`, `action(connect|prepare|verify|activate|install|pause)`, `expectedRevision`을 고정한다. 원래 AP 입력·If-Match/Field revision을 operation에 commit한 뒤 공개 HTTP client를 호출한다. 동일 UUID·본문은 저장된 결과/원래 snapshot으로 복구하고 다른 본문은409. pending/unknown 중 새 operation은409로 차단한다.
4. verify는 정확 사이트 origin의 Field 공개 소유 proof만 저장하고 AP 일반 소유 검증을 호출한다. activate와 SDK install은 별도 사용자 승인이다. AP 생성으로 기존 allowedDeploymentIds/대화 권한을 자동 추가하지 않는다. 설치만의 승인은 양방향 connected가 아니다.
5. pause는 Field 표시를 먼저 중지하고 AP pause의 unknown을 원장에 남긴다. 회수/권한 변경은 새 설치와 저장 결과 접근을 차단하며 기존 직접 문의/예약·법정 원본을 유지한다.

### 예정 검수와 실제 증거 기록 원칙

- native red→green: `node tools/run-field-public-write-db-tests.mjs` (Field own UUID PG17 loopback55432, peer env 제거, child 실제 exit, app/pool 종료·own backend0 후 일반 DROP). 합성 own 계정/토큰만 사용한다.
- actual HTTP consumer: `node --import tsx --test tools/spikes/field-public-installation-http.test.ts` (제품별 UUID DB·loopback AP/Field HTTP). 실 DNS/외부 설치/고객 발송이 아니다.
- `pnpm --filter @fieldai/field-api typecheck`, `pnpm --filter @fieldai/field-web typecheck`; own 경로 scoped eslint; 양 Field API/web build. 전체 E2E 반복은 하지 않는다.
- ak `gpt-6-sol/high` read-only 정확 own scope 정적 검토, 지적 시 재현/수정/좁은 재검수와 clean review. 실제 명령/log/exit/실패/미실행은 단계 말미에 추가한다.
- 디자인 원문 `reference/field_ui_prototype_v3.html`의 v2Connect·Field 연결 설정 HTML/CSS를 읽었다. 원본 배치/색/글자/메뉴는 고정하고 새 설치 준비 기능만 기존 panel 안 `(추가)` 표시한다. file:// 보안 거부를 우회하지 않는다. 사용자가 최종 시각/동선을 검수하며 이번 browser 검수는 아직 미실행이다.

- [x] durable intent/API/권한/오류/복구 구현 (native14/14·HTTP1/1 근거, 실제 공급사 제외)
- [x] Field owner 새 component와 root shell 등록 patch (source/타입/빌드, 브라우저 최종 인수는 별도)
- [x] native UUID PG17 red→green·actual HTTP consumer focused 검수
- [x] own type/lint/build focused 검수
- [x] ak 독립 clean 검토 (repair97931 exit0, 남은 P1/P2 없음, raw confidence0.88)
- [ ] 실 DNS/공급사 설치·사용자 최종 시각/동선/전체 QA/G (`blocked_integration` 또는 미실행)

### 실제 결과 — Field BFF/UI 내부 증분

State: implemented / focused verified; 독립 repair review97931 clean, 출시 미완료.

- AP preview.9/공개 backend/native 설치는 변경하지 않았다. 신규 Field own durable intent·단계별 원래 UUID/action/body/AP If-Match snapshot·현재 owner/session/org/actor/grant/AI/exactorigin·refresh·scope/selection 회수·소유 proof·명시 AP activation/SDK 승인·로컬/원격 pause의 분리와 outbox를 연결했다. AP 생성으로 Field reverse consent나 AP conversation 선택 목록을 확대하지 않는다.
- owner component는 기존 설치 panel 마지막 children에 Coordinator가 연결했다. 신규 동작만 `(추가)`, 원문 v2Connect/settings3의 기존 클래스/스타일을 사용한다. 공개 SDK는 새 승인 intent가 매칭되면 own helper가 단독 판정하고, 기존 native SDK row는 기존 resolver를 유지한다. AP 서비스와 관계없는 기존 Field 로컬 중지/직접 문의·예약 코드는 유지한다. 현재 AP 상태와 마지막 확인된 AP 상태를 구별한다.
- Field 새 작업에는 기존 독립 subscriptionAccess를 적용하고 cleanup/상태 확인/원래 결과 회복을 별도로 유지한다. 이 설치 요청 자체가 AI 생성·고객 발송·구독 시작/청구를 하지 않는다.
- actual fixture의 AP DNS verification port는 합성 `verifyDomain`이다. HTTP 통신/DB commit/원래 UUID 복구는 실제 실행했고 실 DNS/외부 설치는 하지 않았다.

| 실제 명령 | 결과 / handle / 로그 |
|---|---|
| `node tools/run-field-public-write-db-tests.mjs` 최초 | **10407 exit1**, 미구현 module8/8 red, `/tmp/field-public-installation-red.log` |
| 동일 native 중앙등록 전 | **8093 exit1**,7/8; 새 SDK resolver 미등록으로apWidget=null, `/tmp/field-public-installation-second.log` |
| 동일 native 중앙등록 후 | **94387 exit0**,12/12 fail0/skip0, `/tmp/field-public-installation-central-native.log` |
| review connection selection 회수 강화 | **39944 exit1**,12중1fail, legacy resolver가새SDK승인row를 먼저 반환해apWidget object≠null, `/tmp/field-public-installation-resolver-fence.log`; root의 새intent 매칭 row 제외 뒤 **10000 exit0**,12/12, `/tmp/field-public-installation-native-final.log` |
| 독립 리뷰3건 재현 native | **80647 exit1**,14중2fail: localpause/noSDKrow 경쟁200≠409·APcommit뒤sessionloss pendingOperation=null, `/tmp/field-public-installation-review-red.log` |
| 최종 focused native | **13971 exit0**,**14/14 fail0/skip0**, `/tmp/field-public-installation-review-native-green.log` |
| `node --import tsx --test tools/spikes/field-public-installation-http.test.ts` | 초기14354 exit0 1/1; 최종 **5557 exit0**,**1/1 fail0/skip0**, `/tmp/field-public-installation-review-http-green.log` |
| `pnpm --filter @fieldai/field-web exec tsx --test test/ap-public-installation.test.tsx` | tenant 선택 red exit1 `/tmp/field-public-installation-ui-choice-red.log` → **95035 exit0**,**1/1**, `/tmp/field-public-installation-ui-choice-green.log` |
| own8개 TS/TSX/mjs scoped eslint | **52536 exit0**, `/tmp/field-public-installation-review-lint.log` |
| Field API / web typecheck | **28314/34351 exit0**, `/tmp/field-public-installation-review-{api,web}-type.log` |
| Field API / web build | **70479/60132 exit0**, `/tmp/field-public-installation-{api,web}-build-final.log` (이후 UI plain text1곳의 캐시 상태 안내만 명확화; 최신 중앙 bundle은 root 근거로 기록) |
| `git diff --check` | 실제 exit0, 소유 파일뿐 아니라 당시 shared diff에 whitespace 오류 없음. 서비스 테스트가 아니다. |

환경은 Node24.18.0/각 제품 own UUID PostgreSQL17: Field127.0.0.1:55432/field_local, actual HTTP는 별도 AP127.0.0.1:55431/agent_local도 사용한다. fixture는 합성 actor/OAuth grant·loopback HTTP의 실제 서버/DB이며 production credential/고객 데이터/실 DNS를 쓰지 않는다. 네트워크 오류 후 새 key가 아니라 원래 key/본문으로 같은 AP row에 수렴함을 실제 AP DB count1로, Field sessionloss 뒤 새 명시 intent도 원래 key replay count2 유지로 확인했다. 일반 공개client 계약은 완료된preview.9 client 그대로다. 새 브라우저 OAuth callback/전체 사용자 시각·동선은 미실행이며 prior native OAuth 완료를 다시 검사한 것이 아니다.

### 독립 정적 검토와 보완

- `codex exec -m gpt-6-sol -c model_reasoning_effort='high' --sandbox read-only ...`: 최초 **22348 terminal exit0**, `/tmp/field-public-installation-audit-result.md`.
- **P1/confidence0.96** local Field pause가 진행중SDK install에 덮임 → root localpause가SDK row 없을 때도 새intent revision을 증가시키고, SDK install최종transaction에서intent revision FOR UPDATE/현재session·owner를 재검사한다. 실패한 이전approval는409/local_visibility_changed, 새명시승인만 허용한다.
- **P2/0.94** AP remote connect 성공 뒤Field session/authority변경을terminal rejected로 저장 → remote write는원래UUID/If-Match unknown으로 보존한다. 동일actor/currentgrant가복구되면 같은key로receipt를 회복한다. install/refresh의 순수조회는 새SDK승인이 필요해terminal rejection을 유지한다.
- **P2/0.97** 다중Field조직 사용자에게다른조직AI 노출 → 응답 organizationId=currentorg·scope·status 필터를 UI선택 consumer에 적용했다.
- 모두 실제 red→위14/14·HTTP1/1·UI1/1 green으로 반영했다. repair **97931 terminal exit0**, `/tmp/field-public-installation-repair-audit-result.md`: **No concrete remaining P1/P2**, raw confidence **0.88**. 두 CLI는 tests/browser/provider를 실행하지 않는다. 리뷰는 migration72 본문을 읽었고 이후71 rename은 위 동일 SHA256으로 확인했다.
- 중간 FieldAPI/웹 typecheck exit2는 sibling/root TDD중간파일 타입 때문이었다. root가해당소유오류를고쳤고 위최종exit0이다. agent가상대파일/기대값을수정하지 않았다.

### 최종 migration 번호/남은 통합

- Coordinator가 미착수 entitlement의 Field71 예약을해제하고 본 scope를 **000071_public_write_intents.sql**로 최종배정했다. managed미적용 상태에서72→71 rename, 본문SHA256 **11b96f3da2c2587da833dbbef2d5c0a31daf2e5f8ec9a844b9527defb0f9df66** before=after 실제일치. 위UUID검사번호72는착수이력으로보존한다. 번호변경만으로 전체회귀를반복하지 않는다. 최초managed적용/pgmigrations catalog는root가확인한다. 다음 Field72/AP80 AI entitlement는이번완료범위에포함하지 않는다.
- root는 중앙등록·legacy 새intent분기·localpause revision fence·mock client등록가능 write scopes를추가했다. 기존 token/consent/selection scopes는 자동확장하지 않는다. managed credential/bootstrap/재기동은 agent가실행하지 않았다.
- code는 **HEAD9a7fe33 위uncommitted sharedworktree**, 포함commit은root가확정한다. root TASKS/handoff/master/runtime/git는수정하지 않았다. 본 실행기록/등록patch를root완료체크근거로제출한다.
- 실 공급사/실 DNS·새purpose 브라우저OAuth/사용자최종화면·동선·전체 QA/G는미실행/`blocked_integration`이다. AP 설치API는기존완료범위, 이번durableBFF/API/component는내부증분이며 전체A09/출시를완료로합산하지 않는다.
