# C02 독립 실행·예약 경쟁 검증 계획

> 현재 구현 단계용 계획. 전체 46개 작업은 `TASKS.md`의 선행 관계를 따른다.

**Goal:** AP/Field 기초 API를 서로의 환경변수·DB 없이 실행하고, Field의 동시 시간 점유를 실제 PostgreSQL 제약으로 검증한다.

**Architecture:** `apps/agent-api`와 `apps/field-api`는 별도 package·프로세스·DB URL을 가진다. 각자의 `infra/<product>/compose.mock.yaml`로 별도 PostgreSQL을 시작한다. 두 앱은 서로의 domain/db 코드를 import하지 않는다.

**Tech Stack:** Node 24, TypeScript 5.9.3, pnpm 10.33.4, Fastify 5.12.5, PostgreSQL 17.11, `pg` 8.23.0, `node-pg-migrate` 9.0.0, Node test runner + tsx.

---

## 파일 책임

- 루트 `package.json`, `pnpm-workspace.yaml`, `.node-version`, `tsconfig.base.json`: 실행 버전·workspace·검수 명령.
- `apps/agent-api/src/{app,server}.ts`, `apps/field-api/src/{app,server}.ts`: 제품별 DB readiness와 독립 기동.
- `apps/field-api/src/reservations.ts`: Field 내부 시간 점유 명령. AP에서 import 불가.
- `apps/field-api/migrations/000001_*.sql`: 예약 점유 제약. AP DB에는 적용하지 않는다.
- `infra/{agent,field}/compose.mock.yaml`: 합성 로컬 DB. 다른 프로젝트 컨테이너와 이름·포트·볼륨 분리.
- 제품별 `test/`: 실패/정상 health, 실제 PostgreSQL 동시성.
- `tools/check-import-boundaries.mjs`: 상호 내부 import 탐지. 실패를 non-zero로 반환.

## Task 1: workspace와 검수 기반

- [x] 버전·잠금 파일·제품별 package와 TypeScript 구성을 작성한다.
- [x] `pnpm install --frozen-lockfile`이 실제로 실행되도록 lockfile을 생성한다.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 제품별 build를 실제 코드에 대해 실행했다. 실패 조건 전체의 non-zero 전파 검증은 별도 정식 게이트에 남아 있다.

## Task 2: 제품별 기초 서버 (QA123의 일부)

- [x] DB probe 실패 시 `/health/ready`가 503이라는 테스트를 작성하고 빨간 결과를 실행했다.
- [x] 정상 probe는 200이라는 테스트를 작성했다.
- [x] 제품별 최소 Fastify 서버를 구현하고 두 테스트·typecheck를 실행했다.
- [x] Field URL/키 없이 AP 서버, AP URL/키 없이 Field 서버를 각각 실제 DB와 띄워 HTTP 응답을 검증했다. 이것은 핵심 기능 독립 E2E가 아니라 **기초 서버 독립성**이다.

## Task 3: DB 격리와 import 경계 (QA124의 일부)

- [x] 다른 프로젝트 Docker 컨테이너를 건드리지 않는 별도 compose를 만들었다.
- [x] AP 런타임 계정으로 Field DB 연결이 실패하고 반대도 실패함을 실행했다.
- [x] 상대 내부 경로의 직접 static import를 검사하는 스크립트를 작성해 정상/위반 fixture를 검증했다. 전체 의존 그래프 검사는 남아 있다.

## Task 4: Field 예약 시간 점유 (QA25~34의 기술 spike)

- [x] 동시 `confirm` 두 요청에서 1건만 성공하는 실제 PostgreSQL 테스트를 작성하고 빨간 결과를 봤다.
- [x] Field DB migration에 `btree_gist`와 자원별 `[start-before_buffer, end+after_buffer)` exclusion constraint를 추가했다.
- [x] 같은 Field 트랜잭션에서 상태·점유·outbox를 저장하는 최소 내부 함수를 구현했다.
- [x] 독립된 두 DB 연결로 동시 호출하고 승자 1/충돌 1/점유 1/이벤트 1을 확인했다.

## 후속 spike

외부 origin 위젯, SSE 인계, OAuth code+PKCE 및 교차 token은 로컬 mock에서 부분 spike를 완료했다. 조직/actor 동의와 정식 계약·제품 권한 구현은 남아 있다. 아직 실행 전인 검사 명령은 성공 스텁으로 만들지 않는다.

## 실제 배포 환경 검수 순서

로컬 검사는 타입·도메인 규칙·DB 제약·공개 계약의 빠른 회귀 검사용으로 유지한다. 이미 확인한 mock 흐름을 반복 확장해 서버 적합성의 근거로 삼지 않는다. 현재 저장소에는 목표 서버의 OS/CPU 아키텍처, 컨테이너·배포 플랫폼, 프록시/TLS, 운영 DB·객체 저장소, 백업 구성에 대한 확인 결과가 없다.

1. 다음 구현 단계에 들어갈 때 목표 **개발/검증 서버**의 위 항목과 Node/컨테이너 이미지 실행 조건을 읽기 전용으로 조사하고, 로컬 선택과 차이가 있으면 스택/ADR을 먼저 수정한다. 비밀값은 출력하지 않는다.
2. AP와 Field를 각각 별도 이미지·환경·DB·키로 `sandbox`에 배포해 상대 제품을 내린 상태의 기동, migration, OAuth redirect/cookie, 외부 위젯 origin/CSP, 프록시 경유 SSE 재연결, 큐 재시작·outbox 재처리, 백업 복원을 검수한다. 합성 데이터만 사용한다.
3. 서버에서 실행한 명령·이미지/설정 버전·결과를 제품별로 남긴다. 로컬 통과를 서버 검수나 출시 gate로 승격하지 않는다. 서버 접근/설정이 없으면 해당 항목은 미검증으로 유지한다.

서버 검수 전까지 로컬에서는 변경 부위에 필요한 unit/DB/contract 검사와 제품별 build만 반복한다. 전체 `test:spike:phase1`은 단계 인수나 관련 변경의 회귀가 필요할 때 실행한다.
