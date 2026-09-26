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
