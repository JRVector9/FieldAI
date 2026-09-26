# A09.PUBLIC-WRITE — Coordinator 등록 패치 (2026-09-27)

AP 계약/backend 아래 등록 제안은 **완료 이력(ef0dfd3)**이다. 현재 Field BFF/UI의 완료 범위·최종 Field71·실제 결과·root 남은 통합은 이 문서의 **현재 제출 — A09.PUBLIC-WRITE.FIELD-BFF-UI**를 따른다. 공통 파일·managed runtime·git·완료 원장/인계는 Coordinator가 담당한다. 디자인은 `reference/field_ui_prototype_v3.html`에 고정하고 새 기능만 기존 배치 안 `(추가)`로 표시한다.

## 완료 이력 — AP API 등록 (root)

`apps/agent-api/src/app.ts`:

```ts
import { registerIntegratorPublicWriteRoutes } from './integrator-public-write.js';
```

기존 `registerIntegratorRoutes(app, businessRuntime)` 바로 다음에 한 번 등록한다.

```ts
registerIntegratorPublicWriteRoutes(app, businessRuntime);
```

`server.ts`의 BusinessRuntime 기존 pool/verifyDomain/자체 구독 접근을 사용하므로 별도 provider credential·상대 DB·Field worker 등록은 필요 없다. `tools/mock-run.mjs`의 새 서비스/큐 등록도 필요 없다.

## unit 명령 — root 소유

Field API `package.json`의 기존 `test:unit` 대상 목록에 `test/ap-public-write-client.test.ts`를 추가한다. AP 새 `integrator-public-write.db.test.ts`는 기존 DB suite의 `*.db.test.ts` 자동 검색에 포함된다. 집중 native 명령은 own UUID DB runner로 실행하며 mock 서비스 DB에 직접 테스트를 쓰지 않는다.

```bash
node tools/run-public-write-db-tests.mjs
pnpm --filter @fieldai/field-api exec tsx --test test/ap-public-write-client.test.ts
node --import tsx --test tools/spikes/public-write-consumer-http.test.ts
node --test tools/test/agent-integrator-contract.test.mjs
```

Coordinator가 승인한 신규 tools/run-public-write-db-tests.mjs는 자체 UUID DB만 생성/종료 확인 후 정리한다. 인자 있는 호출이나 다른 product/env/host/port/user/dbname은 거부한다. 기존 공통 DB runner/인프라는 변경하지 않는다.

## 이미 적용된 migration 보존

- 실제 own AP mock DB의 AP75가 다른 agent의 잘못된 product 인자 테스트 경로에서 적용된 사실을 Coordinator가 발견했다. `pg_catalog`의 함수 본문2개와 trigger4개를 대조해 AP75를 적용 당시 원본으로 동결했다(`/tmp/a09-public-write-applied-catalog.log`, 실제 exit0).
- 적용 후 발견한 새 public 설치 회수/늦은 활성화 보호는 **AP77**에 분리했다. AP76/78은 다른 작업 소유다. Field migration은 없다.
- 신규 AP75/77의 native 검수는 own UUID PG17 fixture에 적용하여 실시했다. 관리 runtime의 AP77 실제 적용/새 경로 활성화는 root 통합 후 별도 증빙을 남긴다. 관리 runtime 부팅이 전체 기능/출시 인수가 아니다.

## 기존 consent 화면 안내 — root UI 소유, 배치 유지

`apps/agent-web/src/agent-connect.tsx`의 기존 ConnectConsent 설명 위치에서 해당 scope일 때만 기존 문단 형식으로 추가한다. 새로운 카드·메뉴·배치를 만들지 않는다. 제안 문구:

- `ap.connections.create`: **“(추가) 선택한 AP 조직·AI를 외부 서비스의 사이트 설치에 연결합니다. 상대 서비스 로그인, 정보·예약 접근, 구독 결제는 별도 동의가 필요합니다.”**
- `ap.deployments.manage`: **“(추가) 이 외부 서비스가 연결한 사이트 주소의 상담 위젯을 준비·소유 확인·활성화·중지할 수 있습니다. 다른 사이트 배포를 변경하지 않으며 새 배포의 상담 원문 접근은 별도 선택이 필요합니다.”**

Agent는 UI 코드를 수정하거나 시안 화면을 새로 검수하지 않았다. root가 시안을 실제 열어 기존 화면과 비교한 뒤 설명만 적용한다. 사용자 최종 시각·동선 인수는 남는다.

## 착수 이력 — Field 사업자 연결 사용자 흐름

계약/backend 작성 당시 `ApPublicWriteClient`만 있었고 Field BFF/화면 연결은 미구현이었다. 다음 추가 흐름의 내부 구현은 현재 제출 범위에서 완료했다. 기존 AP 설치·양방향 OAuth/bind·Field 정보·예약 완료 범위는 보존한다. 실 DNS/최종 사용자 검수와 새 배포 대화 읽기의 별도 AP 선택/Field 역방향 동의는 구별한다.

1. Field owner 현재 세션/자체 조직과 최근 AP owner의 OAuth grant를 확인한다. 새 scope를 요청하는 client 등록과 별도 owner 재동의가 필요하다. 기존 grant에 권한을 조용히 추가하지 않는다.
2. 첫 호출 전 Field 자체 durable intent에 동일 UUID·AP grant/org/AI/외부 Field 조직/정확 site origin을 저장한다. unknown은 같은 UUID 재조회로 처리한다. token/client secret/원문을 브라우저나 localStorage에 넣지 않는다.
3. client의 createConnection→prepareDeployment는 설치 전용이며 정보·예약 도구를 connected로 표시하지 않는다. 원격 origin proof/명시 activate와 서버 revision을 별도로 표시한다.
4. 신규 배포의 대화 읽기가 필요하면 AP owner가 새 배포를 직접 선택/재동의한다. 기존 `allowed_deployment_ids`/native 설치를 자동 변경하지 않는다.
5. 이 UI/BFF 추가는 시안의 기존 연결·설치 배치에서 `(추가)`로 표시한다. 실 DNS 검증/외부 공급사·최종 QA/G와 구분한다.

## 제출 기준

Coordinator는 등록·managed 최신 build/migrate/HTTP 상태를 확인한 뒤 내부 세부 완료를 원장에 체크한다. 전체 A09 및 최종 사용자 흐름은 별도 남음으로 유지한다. agent가 원장/인계/공통 파일/commit을 변경하지 않는다.

## 완료 이력 — 03 원문·마스터 정합성 (root)

Coordinator 승인 후 `docs/03_INTEGRATION_CONTRACT.md`의 AP scope/API 표와 preview.9 차이를 최소 반영했다. `docs/01_AGENT_PLATFORM_PRD.md`는 변경하지 않았다. root가 `tools/build_report.py`로 마스터를 재생성한다. 다른 agent와 같은 원문을 덮어쓰지 않는다.

- 4.3 AP scope 표: `ap.connections.create` 설치 전용 binding/상대 로그인·정보·예약·청구 권한 제외를 추가한다. `ap.deployments.manage`는 Field와 일반 외부 client에 동등하게 해당 grant가 만든 정확 origin owned_embed 준비/검증/활성/중지만 허용한다.
- 4.12 AP 최소 API 표의 POST connections에 실제 create scope·선택 AI/org/client/grant·externalOrganizationId/정확 origin·UUID 멱등·installation_only 결과를 명시한다. POST deployments의 pending 결과와 관리 GET/verify/activate/pause·If-Match를 추가한다.
- 기존 reply/source refresh의 43자 key 계약은 바꾸지 않는다. preview.9 신규 public 설치 write만 UUID key다. 기존 HMAC 회수와 후속 범용 OAuth revoke를 같은 경로로 완료 처리하지 않는다.
- AP 원본/예약·구독·대화 읽기 선택과 기존 native Field 연결은 유지한다. 이 계약 단계 당시 Field 새 BFF/시안 사용자 흐름은 미완료였으며, 아래 현재 제출의 내부 완료와 남은 최종 인수를 따른다.

**중앙 등록 검수 추가:** root app 자동 등록을 실제 확인하고 native fixture/HTTP harness의 수동 register를 제거했다. `node tools/run-public-write-db-tests.mjs` **66327 exit0,7/7**(`/tmp/a09-public-write-native-central-registration.log`)이 최종 중앙 등록 focused 결과다. 관리 runtime/AP77·UI는 별도 남음이다.
# 현재 제출 — A09.PUBLIC-WRITE.FIELD-BFF-UI 내부 증분 (2026-09-27)

Task ID / Product / Owner: A09.PUBLIC-WRITE.FIELD-BFF-UI / Field / Public Agent (Coordinator=root)
State: implemented / mock focused verified. 포함 commit은 아직 미확정(HEAD9a7fe33 위 shared uncommitted). 전체 A09·실 DNS·최종 사용자 인수는 남는다.

## Coordinator가 이미 반영한 등록/좁은 연결

1. Field `app.ts`에서 `registerApPublicInstallationRoutes(app,businessRuntime)` 1회 등록. native/actual HTTP fixture의 수동 등록은 제거했다.
2. Field `sites.ts` 공개 SDK resolver는 새로운 `publicInstallationFor`를 호출한다. `sdk_approved_at` 매칭 새 intent가 있는 row는 legacy 조회에서 제외하여 current owner/grant/actor/scope/Field selection/정확 origin 검사를 우회하지 않는다. 이전 native SDK row는 기존 방식이다.
3. 기존 Field 로컬 pause transaction은 새 intent revision을 증가시킨다. SDK row가 아직 없어도 오래된 in-flight install 승인을 무효화하며, 신규 module이 최종 `FOR UPDATE`/revision을 재검사한다.
4. Field `field-ap-connections.tsx` 기존 설치 panel 마지막 children에 `FieldApPublicInstallation`을 연결했다. 기존 경고는 `installation.publicIntent`를 구분하고, 신규 component는 설치만의 pending grant를 양방향 connected로 표시하지 않는다.
5. `tools/setup-mock-ap-connector.mjs`는 mock client **등록 가능 scope** 두 개를 허용한다. 기존 selection/consent/token 권한은 자동 확대하지 않는다. 새 `purpose:'installation'` 사용자 승인으로만 새 grant에 부여한다.

## 소유 구현/계약

- 최종 schema: **apps/field-api/migrations/000071_public_write_intents.sql**. Coordinator 미착수 entitlement71 예약 해제 후, 기존72 본문을 그대로 rename했다. before/after SHA256 `11b96f3da2c2587da833dbbef2d5c0a31daf2e5f8ec9a844b9527defb0f9df66`. 아래 실제 UUID 검사는 원래72 번호의 이력이다. managed apply/catalog 확인은 root만 수행한다.
- 신규 Field `src/ap-public-installation-{routes,execution}.ts`, `test/ap-public-installation.db.test.ts`; 좁은 `ap-connector.ts` 새 installation 권한 helper/명시 scope 요청·callback 검증. 기존 authorizedApAccess/양방향 bind/source/native 설치와 AP 공개 contract/backend/HTTP client는 재구현하지 않았다.
- 신규 Field web `src/field-ap-public-installation.tsx`, `test/ap-public-installation.test.tsx`. 기존 panel/클래스/스타일을 사용하고 새 기능만 `(추가)`. 원문 `reference/field_ui_prototype_v3.html`의 v2Connect/settings3를 읽었으며 browser file URL 보안 거부를 우회하지 않았다.
- 신규 runner `tools/run-field-public-write-db-tests.mjs`, 실제 loopback HTTP harness `tools/spikes/field-public-installation-http.test.ts`. strict own product/env/loopback/UUID, app/pool 종료·own backend0 후 일반 DROP. 공통 runner/infra는 수정하지 않았다.
- Field own API: POST/GET `/v1/sites/ap-public-installations`; POST `/:id/actions` with UUID/action/expectedRevision. connection→pending deployment→실 소유 확인 요청→명시 AP activation→별도 SDK 표시 승인. 원래 AP 요청/If-Match·결과 unknown을 DB에 먼저 저장하고 복구한다. pending/unknown에 새 key 우회 금지, body conflict409. AP 새 대화 선택/Field reverse 동의를 추가하지 않는다.
- 원격 write 성공 후 Field authority/session 변경은 원래 UUID의 **unknown**이며 같은 현재 actor/grant로만 복구한다. SDK의 순수 조회/승인 중 local pause/권한 변경은 terminal409 후 새 명시 승인이다. Field 표시 중지는 기존 독립 pause 경로도 제공한다. Field 현재 표시와 마지막 확인된 AP 상태를 구분한다.

## 실제 검수/독립 리뷰

- 최종 native **13971 exit0 14/14 fail0/skip0**, `/tmp/field-public-installation-review-native-green.log`.
- actual Field HTTP→AP HTTP **5557 exit0 1/1**, `/tmp/field-public-installation-review-http-green.log`: commit 후 malformed reply를 원래 key로 count1 복구; 새로운 명시 intent의 AP commit 뒤 Field sessionloss도 unknown409·동일 key 복구 count2 유지. AP revoke401/Field 독립 pause·공개 사이트200도 확인했다. DNS port/사용자·토큰은 합성이다.
- tenant UI consumer **95035 exit0 1/1**; own lint **52536 exit0**; Field API/web type **28314/34351 exit0**; build **70479/60132 exit0**. 실행 명령/초기 실패/중간 타입 오류/전체 로그는 실행계획에 보존했다. UI 캐시 상태 안내 plain text 한 곳의 이후 명확화는 최신 중앙 build 근거로 기록한다.
- 정적 CLI **22348 exit0**의 P1/0.96 localpause 경쟁, P2/0.94 원격 성공 뒤 terminal rejection, P2/0.97 다른 조직 선택 노출은 각각 실제 native/UI red→수정→green. repair **97931 exit0**, 남은 concrete P1/P2 없음, raw confidence **0.88**. `/tmp/field-public-installation-repair-audit-result.md`.

## root 완료 원장/인계 제안과 남은 일

- `[x] A09.PUBLIC-WRITE.FIELD-BFF-UI` **내부 범위**: Field own durable intent BFF/명시 설치 권한 승인·현재 org/actor/grant/AI/origin·원래 UUID/If-Match unknown 복구·proof/activation/SDK 승인·로컬 pause fence·기존 panel 신규 component. 위 source paths/실제 native14+HTTP1+UI1/type/lint/build/clean0.88와 root 포함 commit에 연결한다.
- 기존 `[x] A09.PUBLIC-WRITE.CONTRACT-BACKEND/ef0dfd3`는 유지한다. 전체 A09 parent는 real DNS/TLS/공급사/최종 사용자 시각·동선/전체 QA/G 때문에 미완료다.
- root 전용 남은 통합: 최종 Field71 최초 managed migration/catalog 확인, mock client 등록scope bootstrap 재적용(기존 grant 확대 금지), 최신 source managed build/runtime/ready·새 무인증401, 원장·coverage·인계·master·commit·통합 ak 일지. Agent는 managed runtime/credential/운영 DB·고객 메시지·배포/commit을 실행하지 않았다.
- 새 `purpose:'installation'`의 브라우저 OAuth 승인/콜백·시각/모바일/전체 동선과 실 DNS/외부 고객 상담 설치는 미실행이다. 사용자 최종 검수/공급사 `blocked_integration`을 별도로 남긴다. 이후 AI entitlement는 이번 scope에 포함하지 않은 root Field72/AP80 작업이다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
sed -n '1,95p' TASKS.md
git status --short
git log -3 --oneline
cat docs/technical/A09_PUBLIC_WRITE_EXECUTION_PLAN.md
```

위 focused native/HTTP 검사를 기억 부재로 다시 실행하지 않는다. 새 오류/계약 변화가 있으면 같은 세부 ID에 증거·재개 범위를 먼저 기록한다. root managed 최초 적용은 최신 Field71/Field70/AP79 소스·예약 순서를 확인하고 기존 managed 절차로 실행한다.
