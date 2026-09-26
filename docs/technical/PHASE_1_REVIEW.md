# 1단계 검토 — 저장소 조사·기술 선택·최소 기술 검증

2026-09-24 로컬 mock 기준. C00은 `implemented`, C01·C02는 `in_progress`다. 이 문서는 기능 출시 승인이 아니라 다음 계약·인프라 구현에 들어가기 전 기술 검증 결과다. Git 저장소가 아직 없어 commit ID는 없다.

## 기준과 실제 변경

`AGENTS.md`, v3.0 마스터/분할 명세, `TASKS.md`, `contracts/`를 기준으로 제품 경계를 고정했다. Chrome에서 `reference/field_ui_prototype_v3.html`의 플랫폼·사업자·고객 및 모바일 시안을 확인했다. 최종 UI는 화이트·밝은 회색·절제된 파란색, 역할별 경로, 홈페이지 제작/AI만 시작 경로, 고객 문의·예약·AI 동선을 반영한다. 시안의 역할 탭·가상 데이터·localStorage는 운영 계정/DB 구조로 쓰지 않는다.

선택 스택과 대안·미검증 사항은 `TECH_STACK.md`, 실행 경계는 `ARCHITECTURE.md`, 조사와 보존 대상은 `C00_INVENTORY.md`에 있다. 실제 두 Fastify API, 별도 PostgreSQL compose·migration, Better Auth issuer, AP mock 위젯·대화 spike, Field 예약 경쟁 spike를 구현했다. 기존 문서·시안·다른 Docker 자산은 삭제하지 않았다.

## 다섯 위험 검증

| 검증 | 실행 결과 | 한계 |
|---|---|---|
| 독립 기초 실행/DB | 상대 DB 중지 시 각 API readiness 성공, 교차 DB 자격증명 `28P01` 거부, 직접 import 검사 성공 | 웹·worker·queue·백업까지 포함한 제품 독립성은 미검증 |
| 별도 origin 설치 | Chrome의 일반 외부 사이트 4381에서 AP iframe 준비·버튼 클릭→AP 1차 도메인 `/embed/v1/received` 표시·새로고침 확인. 4382 origin 거부. nonce·handoff ticket 만료/단회 사용, cookie 세션 바인딩 DB 테스트 성공 | Field 설치·실제 대화·고객 접수 화면·남용 방어 미구현. 현재 받은 화면은 handoff 기술 검증용 |
| OAuth 인가 | AP/Field 각 code+PKCE S256·scope·audience·revoke 성공. 두 실제 HTTP issuer의 상대 opaque token은 inactive | 조직/actor 동의·실제 Kakao·업무 API 권한 middleware 미구현 |
| 메시지/SSE/인계 | AP mock HTTP/PG에서 멱등 POST, live SSE·Last-Event-ID replay, 사람 인계 후 AI commit 억제 성공 | tenant/capability 권한·LLM·다중 인스턴스/프록시 미검증 |
| 예약 경쟁 | Field 실제 PG 동시 확정 2건에서 성공 1·충돌 1, 점유/outbox 각 1건 | 전체 예약 API·권한·변경/취소·두 요청 방식 미구현 |

정확한 실패 접근·명령은 `SPIKE_REPORT.md`에 기록했다. 정식 `test:contracts`, `test:independence:*`, `test:integration:faults`, `test:e2e:*`, `test:security`는 미구현이며 성공으로 표시하지 않는다. 외부 LLM·Kakao·알림·결제·DNS/TLS·객체 저장소는 자격증명/승인이 없어서 `blocked_integration`이다. `NODE_ENV=production AP_PROFILE=mock` AP 부팅은 실제 exit 1로 거부됐다.

재실행 가능한 부분 검증 명령은 `pnpm test:spike:phase1`이다. 2026-09-24 10:18 KST 로컬 mock에서 14개 하위 명령이 모두 exit 0이었다. 실행 시간·각 명령·미포함 범위는 `quality_checks/phase_1_execution.json`에 저장했다. 이 결과를 정식 릴리스 게이트 통과로 해석하지 않는다.

## 로컬 재현

```bash
cd /Users/jr/Desktop/projects/FieldAI
node tools/setup-mock-env.mjs
docker compose --env-file infra/agent/.env -p fieldai-agent-mock -f infra/agent/compose.mock.yaml up -d --wait
docker compose --env-file infra/field/.env -p fieldai-field-mock -f infra/field/compose.mock.yaml up -d --wait
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:agent
pnpm build:field
pnpm test:spike:oauth:agent
pnpm test:spike:oauth:field
pnpm test:spike:oauth:issuers
pnpm test:spike:embed:agent
pnpm test:spike:conversation:agent
pnpm test:spike:db:field
pnpm test:spike:db:isolation
pnpm test:spike:imports
```

서버 확인: `AP_PROFILE=mock node --env-file=infra/agent/.env apps/agent-api/dist/server.js`는 `http://127.0.0.1:4311/health/ready`, `node --env-file=infra/field/.env apps/field-api/dist/server.js`는 `http://127.0.0.1:4321/health/ready`다. 외부 설치 재현은 `node tools/spikes/seed-embed.mjs` 후 `python3 -m http.server 4381 --bind 127.0.0.1 --directory examples/external-site`로 `http://127.0.0.1:4381/`을 연다. 이 설치는 mock 전용이다.

## 다음 단계와 검토 지점

다음은 목표 개발/검증 서버 환경을 읽기 전용으로 확인하고 로컬 스택과 대조한 뒤, C01 실행 OpenAPI·이벤트/권한 계약·consumer test 및 조직/actor 동의, C02 CI·큐·키·복구·정식 독립 검수다. 로컬 14/14는 코드·DB 기술 위험의 부분 검증이고 서버 적합성의 근거는 아니다. 서버 sandbox에서 제품별 이미지·DB·프록시/TLS·SSE·쿠키·OAuth·큐·복구를 별도 검수한다. 자세한 순서는 `C02_EXECUTION_PLAN.md`에 기록했다. 그 뒤 C03 UI와 AP/Field 기능을 `TASKS.md` 선행 관계대로 구현한다. 실제 운영/고객 발송/결제/배포는 별도 게이트다.

사용자가 요청한 단계별 확인을 위해 여기서 1단계 결과를 검토받고 다음 구현 단계로 진행한다. 변경 요청은 기술 결정·계약에 먼저 반영한다.

## C01 AP 외부 설치 handoff 작업 보고

```text
Task ID / Product / Owner: C01 기술 spike / AP / AP Agent (단일 실행)
State: in_progress (handoff 부분 검증 완료, C01 전체 미완료)
Requirements / QA / Gate: AP PRD 2.5~2.6, QA97~102·127~128 일부, 출시 gate 미통과
Changed paths and reasons: apps/agent-api/src/{app,embed}.ts, test/embed.spike.test.ts,
  migrations/000004_first_party_handoff_spike.sql — first-party ticket 교환·세션 검증
Contract / schema / migration changes: mock 전용 spike.first_party_sessions 추가;
  정식 공개 계약 변경 없음
Tests actually run, commands, environment, commit: pnpm test:spike:embed:agent,
  pnpm test:spike:phase1 (14/14), Chrome 외부 4381→AP 4311 클릭·새로고침,
  로컬 mock PostgreSQL, Git commit 없음
Not tested and why: 실제 상담·고객 접수·Field 설치·제3자 쿠키 차단 설정·공급사·
  정식 E2E/보안 gate 미구현
Failure cases and rollback: form target 새 탭은 Origin:null로 거부; AP 탭 자체 POST로 해결.
  mock route는 AP_PROFILE=mock에서만 노출. 문제 시 mock route/migration 전용 검증을 중지하고
  정식 공개 계약·운영 데이터는 변경하지 않음
External approvals still needed: 다음 구현 단계의 사용자 검토, 운영 공급사/배포 승인
Next dependency: C01 실행 계약·조직/actor 동의와 C02 독립 인프라/정식 게이트
```
