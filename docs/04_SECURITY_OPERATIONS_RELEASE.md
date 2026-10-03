# 05. 구현 구조·운영·제품별 출시

## 5.1 권장 저장소와 배포

한 monorepo를 관리 편의로 사용할 수 있지만, 제품별 실행·마이그레이션·배포·비밀키는 분리한다. 신규 저장소 설계안이며 기존 코드가 있다면 먼저 조사하고 ADR로 이행한다.

```text
apps/
  agent-web/             # AP 제품홈·관리실·고객상담·publisher·AP admin·BFF/API
  agent-worker/          # AP AI·알림·sync·배포·과금·삭제·이벤트
  field-web/             # Field 제품홈·제작실·사이트·직접문의·예약·Field admin·API
  field-worker/          # Field 사이트생성·공개·알림·과금·connector·삭제
packages/
  agent-domain/          # AP만 import
  agent-db/              # AP migrations/repositories
  field-domain/          # Field만 import
  field-db/              # Field migrations/repositories
  agent-contracts/       # AP 공개 schema/OpenAPI, 독립 버전
  field-contracts/       # Field 공개 schema/OpenAPI, 독립 버전
  generated-clients/     # 계약 기반 HTTP client; domain·DB import 금지
  ui/                    # 디자인 토큰·접근성 부품. 조직/권한·DB 로직 없음
  test-fixtures/         # 합성 데이터만, production 제외
examples/
  external-site/         # Field 코드 없이 AP SDK를 설치하는 최소 외부 사이트
infra/
  agent/                 # AP만 실행 가능한 compose/deploy/backup
  field/                 # Field만 실행 가능한 compose/deploy/backup
  integration/           # 두 제품·서로 다른 origin·오류 주입용 검증 환경
ops/                     # 제품별 runbook·게이트·실행 증빙
```

프레임워크는 TypeScript + 검수된 React/Next 계열 웹·서버, Node Worker, 제품별 PostgreSQL·큐·S3 호환 저장소를 시작안으로 한다. 실제 버전은 구현 시 공식 지원·호환·보안 확인 후 lockfile에 고정한다. 특정 프레임워크의 내부 서버 함수를 제품 간 API로 호출하지 않는다.

같은 Postgres 서버에 두 DB를 둘 수 있지만 런타임 계정은 상대 DB에 CONNECT/쓰기 권한이 없어야 한다. 백업·복구·확장도 따로 수행한다. Redis는 단순 key prefix만으로 격리됐다고 보지 않고 인스턴스 또는 ACL·큐 소비자 권한을 분리한다. 파일은 별도 bucket/policy·키로 분리한다. 별도 서비스가 같은 물리 서버의 공통 장애를 공유한다는 사실은 운영 문서에 남긴다.

각 제품 web/worker는 자기 DB와 인프라만 필요하다. 미연결 상대 URL/토큰은 optional이며 상대 healthcheck 때문에 자기 서비스 readiness를 실패시키지 않는다. 연동 상태는 별도 degraded 지표다. 공통 provider 장애를 제품 상호 의존 장애로 혼동하지 않는다.

### 5.1.1 배포 산출물

현재 저장소의 제품별 배포 산출물은 다음과 같다. 결정 근거와 미검수 범위는 `docs/adr/0003-deployment-artifacts.md`를 따른다.

| 파일 | 내용 |
|---|---|
| `infra/agent/Dockerfile.api`, `infra/field/Dockerfile.api` | 제품별 API·worker 이미지(`pnpm deploy --prod`), `--target migrate` 일회성 migration 이미지 |
| `infra/agent/Dockerfile.web`, `infra/field/Dockerfile.web` | 제품별 Next 웹 이미지(`APP_PROFILE=live` 기본, `NEXT_PUBLIC_*`·rewrite 대상은 빌드 인자) |
| `infra/agent/compose.live.yaml`, `infra/field/compose.live.yaml` | 제품 단독 live 실행(자기 PostgreSQL 17, Field는 Valkey 추가, migrate→api→web·worker) |
| `infra/agent/.env.live.example`, `infra/field/.env.live.example` | 제품별 환경변수 목록(부팅 필수/`blocked_integration`/정책 구분). 실제 `.env.live`는 git 무시 |
| `infra/edge/Caddyfile.example` | TLS 종료·제품별 upstream 분리·X-Forwarded-For 재작성·Field 와일드카드(DNS-01)·Field 사업자 자체 도메인 on-demand TLS(`ask` → `GET /v1/public/site-hosts/allow?domain=`) |
| `.github/workflows/ci.yml` | lint·typecheck·unit, 제품별 DB job, 계약 검사, 이미지 빌드(push 없음) |

production 이미지는 `NODE_ENV=production`이며 `AP_PROFILE`/`FIELD_PROFILE`이 `live`가 아니면 부팅하지 않는다. 각 compose는 상대 제품의 서비스·DB·환경변수를 참조하지 않는다. E2E·보안·독립성·장애 주입 검사, 실제 TLS·레지스트리 push·운영 서버 검수는 이 산출물로 통과 처리하지 않는다.

## 5.2 agent용 런타임 의존 금지선

AP Core CI는 Field 디렉터리와 환경변수를 제외하고 build/migrate/test할 수 있어야 한다. Field Core CI는 AP domain/db를 제외하고 동일 검사를 수행한다. public client 생성물을 읽는 것은 가능하지만 상대 앱 실행이나 마이그레이션이 필수가 되어서는 안 된다.

금지 예: `agent-domain`이 Field 예약 service를 import, AP가 Field users를 JOIN, Field가 AP 조직 존재를 검사해 자기 로그인 허용, AP 설치 SDK가 Field 도메인에서만 발급, AP 위젯이 campaign/publisher 엔터티 없이는 로드되지 않는 것.

AP 입장에서 Field 커넥터는 one adapter implementation이다. `if (provider === 'field')` 분기 자체를 모두 금지할 필요는 없지만, core 도메인의 조직·상담·빌링이 그 provider를 필수로 요구하면 안 된다. provider 전용 매핑은 connector 경계 안에 둔다.

## 5.3 독립 계정·보안

두 제품에 이메일·카카오 로그인을 각각 제공한다. 이메일 소유 확인과 카카오 ID 검증, 명시적 계정 연결, 관리자의 추가 인증, 세션 회수·CSRF·출력 이스케이프·허용 리디렉션 검수를 유지한다. AP 계정/Field 계정이 동일인이라도 membership과 이용 동의는 별도다.

제품별 관리자 권한은 각각 부여한다. 하나의 회사 운영자가 두 콘솔을 사용할 수는 있지만 Field admin 토큰으로 AP 대화 원문을 열지 못한다. 지원 접근은 사유·요청·기간·감사 로그를 요구하며 무제한 impersonate를 제공하지 않는다.

모든 비공개 API·파일·큐 작업·캐시·export·LLM 근거에 조직 scope와 원본 제품을 반영한다. DB RLS만으로 보안이 끝났다고 보지 않고 서비스 권한·DB role·우회 권한·테스트를 함께 둔다. 상대 토큰을 고객의 신원 인증이나 대화 접근용 bearer로 재사용하지 않는다.

## 5.4 두 제품의 구독·비용

| 항목 | 규칙 |
|---|---|
| AP 구독 | AI·상담·기본 설치·사용량·AP 알림. Field 구매 불필요 |
| Field 구독 | 사이트·제작 AI·직접 문의·예약·도메인·Field 알림. AP 구매 불필요 |
| 연결 | 별도 제품 이용 조건과 권한 확인. 연결만으로 청구 없음 |
| 무료 체험 | 각 제품 14일·카드 없이 시작은 제안값. 새 제품 체험을 악용해 기존 제품 크레딧을 충전하지 않음 |
| 독립 가격 | 기존 통합안 29,000원은 자동 승계하지 않음. 가격/세금/제공량/최초 결제일/환불 조건의 승인 plan 필요 |
| 초과 사용량 | 경고·제한·명시적 구매. 동의 없는 초과청구 금지 |
| 묶음 판매 | 후속 계약/정산/혜택 원장으로 다룸. 이번 필수 범위 아님 |
| 고객 서비스 대금 | 두 제품 모두 수령·정산하지 않음 |

과금은 각 제품의 `(subscription_id, billing_period)` 유일 원장과 동의 버전으로 처리한다. 공급사 timeout은 같은 거래 조회 후 해결하며 새 주문으로 이중 청구하지 않는다. 환불/해지는 명확히 구분하고 하나의 제품 해지로 상대를 자동 취소하지 않는다.

PG가 동일 사업자 계약을 사용할 수 있는지, 메시지 발신 주체/채널/템플릿이 두 제품에 적합한지 공급사와 확인한다. 같은 회사이니 승인이 자동 승계된다고 가정하지 않는다. 키와 내부 비용 원장은 계약 형태와 무관하게 제품별이다.

## 5.5 개인정보·약관·보존

AP 회원·Field 회원·AP 상담·Field 직접 상담·고객이 Field에 제출한 작업 스냅샷을 구분해 목적·주체·위탁/제공 관계를 실제 계약으로 검수한다. 제품이 분리되었다는 이유만으로 모든 이동이 반드시 제3자 제공이라고 단정하지도, 같은 회사라는 이유로 고지가 필요 없다고 단정하지도 않는다. 외부 LLM·파일·CDN·로그·백업의 처리 위치·재학습·보존·하위 처리자도 검수한다.

고객에게 전달 목적·대상 사업자·제품·필드·필요 고지와 동의를 명확히 제공한다. 제품 간 공통 고객 번호 DB·고객 프로파일 판매·학습자료 자동 공동 사용은 금지다. AI 고지·광고 표시·소비자 권리·구독 약관은 실제 출시 법령과 계약을 별도 법무 게이트로 확인한다. 이번 문서는 법률 준수 인증이나 법률 의견서가 아니다.

| 데이터 | 보존 시작안 | 중요 조건 |
|---|---|---|
| 접수 없는 익명 AI 대화 | 마지막 활동 후30일 | 통계는 재식별 위험 검수 |
| 정식 문의/업무 요청 | 종결 후180일 | 예정 업무·분쟁·법정 기록은 분리 |
| 고객 사진 | 종결 후90일 | 제품별 수신 사본도 목적·기한 기록 |
| 원문 모델 debug | 기본 저장 안 함 | 예외 접근/기간 제한 |
| 기술 로그 | 마스킹30일 | 인증/고객 비밀값 제외 |
| 감사 로그 | 1년 제안 | 법령·계약 의무별 재설정 |
| 백업 | 제품별 순환30일 제안 | 복원 후 삭제·revoke 원장 재적용 |
| 연결 비밀값 | 해제 즉시 사용 차단·폐기 | 최소 감사메타·분쟁 증빙만 별도 보존 |

법정 거래 기록은 해당 제품의 구독·청구 원장으로 분리 보존한다. 전체 채팅을 무조건 법정 기간 동안 보관하는 방식으로 확대하지 않는다. 상대가 적법하게 수신한 데이터의 삭제 결과는 별도 작업과 증빙으로 관리한다.

## 5.6 운영 목표와 관측

제안 목표: 각 제품 일반 접수 저장 p95 2초(파일/모델 제외), 정상 큐 발송 시도 p95 10초(묶음/공급사 제외), 각 제품 DB RPO15분·객체60분·핵심복구 RTO4시간. 계약상 SLA나 실측 성과가 아니다.

별도 지표: AP 첫 AI 활성화, 외부 사이트 설치 성공, 상담 인계율, 답변 지연, 모델 비용, Field 사이트 공개 완료, 실제 문의 처리, 예약 확정, connector 전달 지연/unknown/중복 차단, 승인 source 최신성, 중복 알림, 서로 독립인 구독 전환·재결제. 매체는 집계만 보고 예약 확정을 실제 매출·수금으로 표시하지 않는다.

AP 장애가 Field 직접 접수 오류율로 번지지 않는지, Field 장애가 AP native 질의를 끊는지 별도 synthetic probe로 확인한다. 제품별 이벤트·로그·원가를 보되 correlation_id로 허용된 장애 추적을 가능하게 한다. 상관 ID에 전화번호를 넣지 않는다.

### 5.6.1 API 구조화 로그와 개인정보 가림

AP API와 Field API는 각자 `apps/agent-api/src/logging.ts`, `apps/field-api/src/logging.ts`로 Fastify(pino) JSON 로그를 표준 출력에 쓴다. 두 제품은 설정 코드를 공유하지 않는다.

| 항목 | 내용 |
|---|---|
| 수준 | `AP_LOG_LEVEL` / `FIELD_LOG_LEVEL` (`fatal`·`error`·`warn`·`info`·`debug`·`trace`·`silent`, 기본 `info`). 그 밖의 값이면 부팅 실패. `node:test` 실행 중(env 미지정)에는 기본 `silent` |
| 요청 로그 | 요청마다 완료 한 줄: `method`, `url`(일치한 라우트 패턴, 없으면 쿼리 문자열을 뗀 경로), `statusCode`, `ms`, `requestId`, `organizationId`(`x-organization-id`가 UUID일 때만). 시작 줄·404 원문 URL 줄은 남기지 않는다 |
| requestId | 들어온 `x-request-id`가 `[A-Za-z0-9._:-]{1,128}`이면 그대로, 아니면 UUID 생성. 전화번호·확인키를 넣지 않는다 |
| 남기지 않는 것 | 요청 본문, 쿼리 문자열, 요청/응답 헤더, 고객 IP·user-agent, 고객 이름·연락처 |
| redact(`[redacted]`) | `req`·`res`·`request`·`headers` 아래 `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-receipt-key`, `x-solapi-secret`, `x-signature`, `x-admin-billing-session-id`, `x-support-access-id`(Field는 `x-field-route-key-session-id` 추가), 그리고 `req.body`·`request.body`·`body` |
| 가림 | 메시지·객체 값·오류 message/stack 속 휴대전화 `01[016789]-?\d{3,4}-?\d{4}` → `010-****-1234`(앞 3자리·끝 4자리만), 이메일 → `a***@domain`, 문장 속 URL 쿼리 삭제 |

가림은 정규식 기반의 2차 방어다. 코드는 고객 입력·비밀값을 로그에 넘기지 않는 것을 1차 원칙으로 한다. 로그 수집·보관 기간(위 표의 기술 로그 30일)·접근 권한·삭제는 로그를 받는 호스트(컨테이너 런타임 로그 드라이버·수집기)의 책임이며 이 저장소는 보관을 구현하지 않는다. worker 진입점은 고정 문구만 `console`로 쓰며 이번 설정의 대상이 아니다.

## 5.7 출시 게이트

| 게이트 | 대상 | 실제로 남길 증빙 |
|---|---|---|
| G-A1 | AP 가입/요금/자체 운영 | Field 미배포 상태에서 자체 가입·실구독·해지·내보내기 |
| G-A2 | AP 외부 설치/사람 응대 | 일반 외부 사이트의 별도 origin·실기기·고객 접수·AP 답변 |
| G-A3 | AP AI/알림/복구 | 실제 LLM, 카카오/문자/푸시 승인·콜백, 원본/파일 복구 |
| G-F1 | Field 단독 제작/도메인 | AP 환경변수 없는 셀프 제작·실제 제작 LLM·기본/자체 도메인 |
| G-F2 | Field 직접 문의/예약 | AP 차단 상태의 두 예약 방식·실알림·수동 일정·동시성 |
| G-F3 | Field 구독/보안/복구 | 실청구·취소·해지·권한·백업/삭제 복원 방지 |
| G-I1 | 공개 연동/권한 | 두 방향 scope·동의·actor·issuer·재인가·revoke 검수 |
| G-I2 | 데이터/업무 전달 | stale 가격·버전 충돌·타임아웃·중복·개인정보 인계 |
| G-I3 | 알림·단절 복구 | 원본별 한 발송 주체·unknown·해제 중 기존 예약·토큰 회수 |
| G-D1 | 홍보·매체 | 사업자/매체의 정확한 버전 승인, 도메인 권한·고지·중지 |
| G-D2 | 성과·프라이버시 | AP만으로 집계, 작은 집단/차분 완화·PII 차단 |
| G-L1 | 실제 운영 계약 | 두 제품 약관/데이터 책임/국외 처리/AI고지·PG·메시지 계약 검수 |
| G-S1 | 전체 최종 인수 | 변경 추적표·모든 적용 QA·제품별 독립/연결 회귀·책임자 승인 |

각 독립 릴리스는 자기 게이트와 공통 법무·보안 적용 항목만으로 판단한다. 예를 들어 AP Core가 G-D1을 기다릴 필요는 없지만 Distribution을 완료했다고 주장할 수는 없다. 전체 Suite 완료는 모든 적용 게이트를 요구한다. credential 없음·법무 검수 미완료·테스트 skip은 통과가 아니다.

## 5.8 마이그레이션 — 이미 구현된 경우만

현재 자료는 기획/시안이므로 운영 DB가 존재한다고 가정하지 않는다. 신규 개발은 두 DB로 시작한다. 기존 v2.0 서버가 실제 존재한다면 먼저 read-only 인벤토리·백업·보존 근거·원본 건수를 확보한다.

1. cross-product schema·mapping·인증·버전 계약을 추가하고 기존 서비스는 즉시 삭제하지 않는다.
2. AP 원본으로 이전할 실제 AI/지식/대화와 Field 원본으로 남길 사이트/직접 문의/예약을 출처와 기능 기준으로 분류한다. 출처 불명 대화를 AI 원본으로 추정하지 않는다.
3. 제품별 조직을 새로 만들되 연결/계약/고지/과금 동의를 마련한다. 기존 카카오 로그인·비밀번호·PG billing key를 몰래 복사해 두 구독을 만들지 않는다.
4. 승인된 공개 정보만 source로 매핑하고 기존 사용자의 초안·중지 상태·예약 스냅샷·대화 권한을 보존한다.
5. 작업 단위 write freeze 또는 검증된 변경 캡처로 이행 경계를 잡는다. 승인 없는 무한 dual write 금지. 건수/hash/권한/정산·알림 책임을 대조한다.
6. 허용된 대상부터 canary 전환, 오류 시 이전 읽기/쓰기 경로로 안전 복귀. 실제 새 메시지·예약을 버리는 DB 전체 롤백 금지.
7. 이전 URL은 원본 권한을 검사하는 안전 전환/안내를 제공한다. 전화번호로 새 세션을 발급하지 않는다.
8. 법적 보존·대조·복구 검수가 끝난 뒤 중복 필드를 제거하고 이행 종료 증빙을 남긴다.

## 5.9 공식 기술 참고자료

확인일 2026-09-24. 아래는 표준/브라우저/벤치마크 확인이며 우리 구현의 승인·보안 인증을 의미하지 않는다. 문서의 구체적인 제품 경계·기간·스키마·알림 소유 규칙은 별도 실행 설계다.

| ID | 출처 | 적용 |
|---|---|---|
| S01 | [RFC 9700 — OAuth 2.0 Security BCP](https://www.rfc-editor.org/rfc/rfc9700.html) | code+PKCE, 정확한 redirect, scope/audience 제한, refresh 보호 |
| S02 | [RFC 7009 — Token Revocation](https://www.rfc-editor.org/rfc/rfc7009) | 토큰 회수 API와 철회 처리 |
| S03 | [MDN — Window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) | exact target origin·수신자 검증 |
| S04 | [MDN — CSP frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors) | 실제 응답 헤더·ancestor 허용 범위 |
| S05 | [MDN — Third-party cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies) | 외부 삽입 세션과 1차 도메인 전환 분리 |
| S06 | [Firsthand — Platform](https://www.firsthand.ai/platform) | 독립 브랜드 AI 생성·배포라는 개념 참고. 기능 동등성/API 계약은 아님 |

기존 PRD의 법령·메시지 단가·구체 라이브러리 선택은 최신 가격/계약 승인이 아니다. 공개 출시의 G-L1 및 제품별 공급사 게이트에서 재확인한다.
