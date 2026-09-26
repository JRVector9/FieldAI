# A09.PUBLIC-WRITE — Coordinator 등록 패치 (2026-09-27)

Agent 소유 구현은 준비됐으며 공통 파일 수정·운영 runtime 재시작·git 저장·완료 원장/인계 갱신은 Coordinator가 수행한다. 디자인은 `reference/field_ui_prototype_v3.html`에 고정한다. 새 기능 안내는 기존 배치 안에 `(추가)`로 표시하고 새 디자인/메뉴/재배치를 만들지 않는다.

## AP API 등록 — root 소유

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

## 남은 Field 사업자 연결 사용자 흐름

새 `ApPublicWriteClient`는 HTTP 소비자이며 현재 Field BFF/화면에서 자동 호출하지 않는다. 기존 AP 설치·양방향 OAuth/bind·Field 정보·예약 흐름은 완료 범위로 유지한다. Field에서 새 배포 준비를 제공할 때는 다음 추가 흐름만 연결한다.

1. Field owner 현재 세션/자체 조직과 최근 AP owner의 OAuth grant를 확인한다. 새 scope를 요청하는 client 등록과 별도 owner 재동의가 필요하다. 기존 grant에 권한을 조용히 추가하지 않는다.
2. 첫 호출 전 Field 자체 durable intent에 동일 UUID·AP grant/org/AI/외부 Field 조직/정확 site origin을 저장한다. unknown은 같은 UUID 재조회로 처리한다. token/client secret/원문을 브라우저나 localStorage에 넣지 않는다.
3. client의 createConnection→prepareDeployment는 설치 전용이며 정보·예약 도구를 connected로 표시하지 않는다. 원격 origin proof/명시 activate와 서버 revision을 별도로 표시한다.
4. 신규 배포의 대화 읽기가 필요하면 AP owner가 새 배포를 직접 선택/재동의한다. 기존 `allowed_deployment_ids`/native 설치를 자동 변경하지 않는다.
5. 이 UI/BFF 추가는 시안의 기존 연결·설치 배치에서 `(추가)`로 표시한다. 실 DNS 검증/외부 공급사·최종 QA/G와 구분한다.

## 제출 기준

Coordinator는 등록·managed 최신 build/migrate/HTTP 상태를 확인한 뒤 내부 세부 완료를 원장에 체크한다. 전체 A09 및 최종 사용자 흐름은 별도 남음으로 유지한다. agent가 원장/인계/공통 파일/commit을 변경하지 않는다.

## 03 원문·마스터 정합성 — root Coordinator 후속

Coordinator 승인 후 `docs/03_INTEGRATION_CONTRACT.md`의 AP scope/API 표와 preview.9 차이를 최소 반영했다. `docs/01_AGENT_PLATFORM_PRD.md`는 변경하지 않았다. root가 `tools/build_report.py`로 마스터를 재생성한다. 다른 agent와 같은 원문을 덮어쓰지 않는다.

- 4.3 AP scope 표: `ap.connections.create` 설치 전용 binding/상대 로그인·정보·예약·청구 권한 제외를 추가한다. `ap.deployments.manage`는 Field와 일반 외부 client에 동등하게 해당 grant가 만든 정확 origin owned_embed 준비/검증/활성/중지만 허용한다.
- 4.12 AP 최소 API 표의 POST connections에 실제 create scope·선택 AI/org/client/grant·externalOrganizationId/정확 origin·UUID 멱등·installation_only 결과를 명시한다. POST deployments의 pending 결과와 관리 GET/verify/activate/pause·If-Match를 추가한다.
- 기존 reply/source refresh의 43자 key 계약은 바꾸지 않는다. preview.9 신규 public 설치 write만 UUID key다. 기존 HMAC 회수와 후속 범용 OAuth revoke를 같은 경로로 완료 처리하지 않는다.
- AP 원본/예약·구독·대화 읽기 선택과 기존 native Field 연결은 유지한다. Field 새 BFF/시안 사용자 흐름은 미완료 항목으로 보존한다.

**중앙 등록 검수 추가:** root app 자동 등록을 실제 확인하고 native fixture/HTTP harness의 수동 register를 제거했다. `node tools/run-public-write-db-tests.mjs` **66327 exit0,7/7**(`/tmp/a09-public-write-native-central-registration.log`)이 최종 중앙 등록 focused 결과다. 관리 runtime/AP77·UI는 별도 남음이다.
