# 전체 프로젝트 검토·수정 요약 — 2026-10-02 (기준 commit 84af59a → 이번 커밋)

사용자 지시: (1) 제대로 동작하지 않는 부분을 찾아 수정, (2) 덜 된 개발 목록화, (3) 서비스를 실제로 쓸 수 있게 하는 데 필요한 기능 정리. 진단 5개·수정 3개 서브에이전트를 병렬로 실행했고 Coordinator가 통합·재검수했다.

이 폴더의 문서:

| 파일 | 내용 |
|---|---|
| `01_SUMMARY.md` | 이 문서. 수정 내역·검수 결과·결정 필요 사항 |
| `02_DOCS_GAP_AND_SERVICE_READINESS.md` | **(2) 미완료 개발 리스트**와 **(3) 서비스화 필수/권장 기능** 전체 표 |
| `03_AP_CODE_REVIEW.md` | AP 코드 리뷰 원문(P1 7 / P2 8 / P3 16) |
| `04_FIELD_CODE_REVIEW.md` | Field 코드 리뷰 원문(높음 4 / 중간 8 / 낮음 15) |
| `05_RUNTIME_E2E_REPORT.md` | mock 기동·E2E·HTTP 흐름·퍼징·28화면 브라우저 점검 |
| `06_BASELINE_COMMANDS.md` | 수정 전 기준선 명령 결과 |

## 1. 수정 전 상태

- 정적·단위·빌드·Field DB·계약·E2E(AP 8/8, Field 7/7, 매체 2/2)는 모두 통과했다. 즉 "로컬 mock 기능"은 대부분 동작한다.
- 실제 결함은 실행이 아니라 **상태 전이·장애 복구·운영 경계**에 있었다. 아래 2절이 그 목록이다.
- AP DB suite 1건은 테스트 정리 코드의 경쟁 조건(flaky)이었고, `test:security`는 Playwright venv 부재로 미실행이었다.

## 2. 이번에 수정한 결함

### AP (apps/agent-api, apps/agent-web)

| # | 결함 | 수정 |
|---|---|---|
| A1 | 지식/AI를 재승인하면 기존 배포가 최신 release에 묶이지 않아 상담 링크·위젯이 조용히 404가 됨. 화면은 계속 active 표시 | 배포 목록·activate 응답에 `current: boolean` 추가(`deployments.ts`). 웹에 "최신 승인과 연결 끊김" 상태와 "최신 승인으로 다시 연결 (추가)" 버튼(`agent-deploy.tsx`). activate 409 `knowledge_stale`는 "AI 설정 재승인 필요" 안내. 상담 제출 409는 새로고침 안내(`agent-public.tsx`) |
| A2 | 알림 발송 준비가 전역 oldest-100을 고르고 비대상 행을 기록 없이 건너뛰어 100건 쌓이면 전 조직 발송 정지 | 대상 조건을 LIMIT 이전 WHERE로 이동, 수신 불가 행은 `suppressed`로 종결(`notification-delivery-execution.ts`) |
| A3 | `010-1234-5678` 하이픈 번호가 저장은 되지만 발송 비교에서 불일치 | 알림 경계에서 숫자 정규화·휴대전화 검증(`notification-context.ts`, `notification-delivery-routes.ts`). 고객 동의는 새 400 `notification_phone_invalid`, 웹 안내 문구 추가. 문의 원문 번호는 보존 |
| A4 | Field timeout/5xx 한 번에 연결이 영구 `degraded`, 복구 경로 없음 | 확정 인증 실패(400/401/403, grant 불일치)만 degraded. 재검증 성공 시 `review_required` 복귀. 웹에 "Field 권한 다시 확인 (추가)" 버튼(`agent-field-connections.tsx`) |
| A5 | Field 토큰 갱신·`/me` 호출(최대 8초×2) 동안 트랜잭션+`FOR UPDATE` 보유 → 동시 고객 10명이면 pool 고갈로 AP 단독 조직까지 정지(B01 위반) | 네트워크 호출 전 DB 연결 반환. `token_refresh_lease_until` CAS 임대로 한 요청만 갱신(**migration 000082**) |
| A6 | `reconcile`가 Field by-source 404·재전송 4xx·동의 24h 초과를 `rejected`로 바꿔 고객 재제출 시 Field에 예약 중복 생성 | 계약 §(docs/03:179) "delivery_unknown → 새 업무 생성 금지" 준수. Field의 명시 거절만 `rejected`(`field-actions.ts`) |
| A7 | OpenAI timeout 후 `ai_runs`가 `in_progress`로 남아 그 대화의 AI가 영구 409 | 결과 미상도 `failed`/`provider_result_unknown`으로 종결, 과금 unknown 기록은 유지(`customer-consultations.ts`) |
| A8 | 카드 인증 4xx 거절이 영구 `unknown` → 취소·재구독·운영 정리 모두 불가 | issue 4xx(429 제외) → `declined` → `failed`로 종결, 비밀값 삭제. billing_credentials 없는 unknown은 owner 취소 허용(`toss-billing.ts`, `billing-authorization-execution.ts`, `billing-consent-routes.ts`) |
| A9 | `trustProxy` 미설정으로 모든 고객 IP가 Next 서버 주소 → 신고 한도·확인키 잠금이 플랫폼 공용 | `AP_TRUST_PROXY`(기본 `loopback`) |
| A10 | web push lookup이 항상 null이라 결과 미상 행을 1분마다 영구 재조회 | push의 accepted/unknown을 최종 상태로 claim 제외 |
| A11 | 테스트 flake: `retention-purge.db.test.ts` pool.end 직후 drop force | pool error listener 추가 |

### Field (apps/field-api, apps/field-web)

| # | 결함 | 수정 |
|---|---|---|
| F1 | **공개 사이트 기본 주소 루트 404**: `http://<slug>.<base>/`가 404, `/site/<slug>`만 200. 사업자에게 안내되는 주소가 루트 | 테넌트 분기에도 `/`·`/<page>` → `/site/<slug>[/<page>]` rewrite(`proxy.ts`), 테스트 추가 |
| F2 | 자체 도메인을 대표 주소로 쓰는 사이트는 AP 증명 저장·설치 body에 `origin`이 빠져 항상 실패, "공개 사이트 열기"가 `/site/www` | `origin: siteOrigin` 전송, 링크를 실제 slug로(`field-ap-connections.tsx`) |
| F3 | 희망시간 예약: 고객 접수는 정책 없이 받지만 사업자 확정·제안·재검토는 정책 필수 → `policy_not_set`로 확정 불가. 재감사 문서는 완료로 기록 | request 모드는 정책 없으면 Asia/Seoul+겹침만 검사, 30분 격자는 slot 모드만(`bookings.ts`). 공개된 조직의 slot 서비스 승인에 `booking_schedule_not_ready` 검사 추가(`business.ts`), 웹 안내 문구 |
| F4 | 카드 인증 거절 영구 unknown (AP A8과 동일) | 동일 방식. unknown 취소는 공급사 멱등기간(15일) 경과+credential 없음일 때만 |
| F5 | `trustProxy` 미설정 (AP A9와 동일) | `FIELD_TRUST_PROXY`(기본 `loopback`) |
| F6 | 자동저장이 서버 trim 응답으로 로컬 상태를 덮어 입력 중 끝 공백·줄바꿈 삭제 | 저장 성공 시 revision만 갱신(`site-editor.tsx`) |
| F7 | 줄바꿈 든 환불 사유 1건으로 관리자 결제 화면 전체 미표시 (양 제품) | 검증을 API 기준(trim 1~500자)과 일치(`billing-admin-client.ts`) |
| F8 | 취소 요청 거절 시 무효 제안값이 남아 고객이 다른 날짜를 확정으로 오인 | `decline_cancel`도 제안 필드 초기화 |
| F9 | 예약 화면 열 때마다 catalog-review 409 콘솔 오류 | 변경 없음은 200 `{status:'current'}`, 웹은 두 형태 모두 처리(`catalog-review-state.ts`) |
| F10 | 시간표형 예약 목록에 요청 시각 대신 서비스명 반복 | `requestedStartAt`을 사업장 시간대로 표시 |
| F11 | 비활성 버튼에 사유 없음(환불 검토 요청, 캠페인 초안 만들기) | 사유 문구 추가(AGENTS §6) |

## 3. 수정하지 않고 결정을 요청하는 항목

- **Field M1 — 신고로 숨긴 사이트의 신규 문의·예약 접수 차단 여부.** 현재 코드·테스트(`moderation.db.test.ts:101`)·TASKS:198은 "숨김 중에도 신규 직접 접수 유지"를 의도된 결정으로 명시한다. 차단으로 바꾸려면 TASKS 재개 기록과 사용자 승인이 먼저 필요하다. 구현 후 원복했다.
- **trustProxy 배포 조건.** Next 16 외부 rewrite는 `X-Forwarded-For`를 추가하지 않고 클라이언트 헤더를 그대로 넘긴다. 운영에서는 Next 앞단 LB/엣지가 XFF를 append해야 `loopback` 신뢰로 실제 고객 IP가 잡힌다. 이 조건을 배포 문서에 넣어야 한다.
- **`(추가)` 표식.** AGENTS 6.0에 따라 붙인 표식이 사용자 화면에 37곳 이상 노출된다. 운영 고객 화면에도 둘지 결정이 필요하다.

## 4. 리뷰에서 나왔지만 이번 범위 밖으로 남긴 결함

AP P2/P3·Field 중간/낮음 항목 전체는 `03_AP_CODE_REVIEW.md`, `04_FIELD_CODE_REVIEW.md`에 있다. 다음 작업 때 우선 볼 것:

- AP: sandbox/live 로그인 동선 차단(인증 메일 미발송·`trustedOrigins` 비어 있음), 전액 환불 후 `active` 잔존, `past_due` 20건이 갱신 후보 점유, 매체 origin 선점, OAuth 발급 pool 이중 점유, 요청마다 저널 전체 스캔.
- Field: 자체 도메인 DNS 일시 오류에 유효기간 삭제/소유권 해제, 공개 접수 IP 한도·고객 메시지 속도 제한 없음, `PUT /v1/sites/draft` 1MiB 한도, 사진 50장 영구 상한·삭제 없음, `server.ts` 종료 순서, 대문자 Host 404, `reservation-export` 연결 점유.
- 공통: production 가드가 `mock`만 거부(프로필 미설정·오타도 부팅), 웹 `next.config.ts`가 `live`에서 throw.

## 5. (2) 덜 된 개발·(3) 서비스화 필요 기능 — 핵심 요약

전체 표는 `02_DOCS_GAP_AND_SERVICE_READINESS.md`. 결론만 적는다.

**운영(non-mock) 환경에서는 가입부터 진행되지 않는다. 외부 키 부재가 아니라 코드 공백이다.**

1. 웹 live 빌드 차단(`next.config.ts:2` throw) → `/preview`만 막도록 분리
2. 가입 인증 메일·비밀번호 재설정 코드 없음(이메일 어댑터 자체가 없음)
3. 체험(trial)이 mock 전용(`subscription.ts:56`) → non-mock 신규 조직은 전부 403
4. 관리자 MFA 없음 → 관리자 API 전부 503, 플랜 생성 불가 → 결제 불가
5. Dockerfile·CI 0개
6. 템플릿 시작 시 빈 사이트(hero 1개). 카탈로그→섹션 매핑이 LLM 경로에서만 호출
7. HEIC 사진 사실상 거부(sharp heif 미지원), UI는 받는다고 표시
8. 계정·조직 삭제 없음, 고객 폼 개인정보 고지 없음, `/terms`·`/privacy`·사업자 정보 0건

**"10분 홈페이지 + 예약" 필수:** 운영 체험 정책, 사업 정보로 템플릿 자동 구성, 사업 정보 입력을 제작 흐름 안으로, 공개 주소 복사·공유·QR, 연락·예약 단계에서 알림 설정 연결, 개인정보 고지, 공급사 미설정 시 AI 버튼 선비활성.

**"홈페이지 AI 상담" 필수:** AP 체험·인증 경로, OpenAI 키·`AP_CUSTOMER_DAILY_LIMIT`(non-mock 기본 NaN), 배포 활성화 조건에 공급사 준비·테스트 통과, Field 사이트에 AP 위젯 쉬운 설치(현재 수동 3단계+), `human_active` 전이 구현, AI 사용·국외 이전 고지.

**운영자:** 어댑터가 있는 것(OpenAI, Toss, Solapi, web-push, S3)은 계약·키만 필요. 없는 것(이메일, 자체 도메인 TLS edge)은 구현 필요. 인증(메일·MFA·`trustedOrigins`·카카오), 인프라(이미지·배포·TLS 프록시·와일드카드 DNS·시크릿·CI·production에서 live만 허용하는 단일 가드), 관측(로거·PII redaction·Sentry·큐 지표·백업/PITR), 법무(약관·처리방침·사업자 정보·수탁사 고지).

**계약 공백:** docs/03 §4.12의 Field 공개 API 4개(`external-requests/{id}`, `customer-decisions`, `notification-route`, `webhooks/agent`)와 §4.6 상태 7종 중 4종이 코드에 없다. QA160은 전부 `not_run`이고 테스트에 QA ID 참조가 없다.

**권장 착수 순서:** live 빌드 허용·프로필 가드 통일 → 이메일 인증·재설정 → 운영 체험 정책 → 관리자 MFA → 템플릿 자동 구성·문구·HEIC → Dockerfile·CI·로깅·백업 → 약관·처리방침 → 공급사 키 → 카카오 로그인 → human_active·계정 삭제·Field API 4개 → 자체 도메인 edge·웹훅.

## 6. 검수 결과 (수정 후, Mac local mock, Node 24.18.0, PG17 격리 DB)

명령은 `pnpm` 스크립트이며 순차 실행했다. E2E·보안·통합장애 실행기는 `pnpm mock:run`으로 네 서버가 ready인 상태에서 실행했고, Playwright venv는 세션 scratchpad에 새로 만들어 `AP_BROWSER_PYTHON`/`FIELD_BROWSER_PYTHON`으로 전달했다(`/tmp/fieldai-ui-venv`는 더 이상 없다).

| 명령 | exit | 결과 |
|---|---|---|
| `lint` / `typecheck` | 0 / 0 | 경고 없음, 4개 앱 |
| `test:unit` | 0 | agent-api 20, field-api 26, agent-web 57, field-web 101, tools 35 pass / 2 skip(의도된 `DB_SUITE_ADMIN_INTEGRATION`) |
| `build:agent` / `build:field` / `build:web:agent` / `build:web:field` | 0 | |
| `test:db:agent` | 0 | 34파일 141/141 pass (migration 000082 포함) |
| `test:db:field` | 0 | 31파일 160/160 pass |
| `test:contracts` | 0 | 정적 3/3, AP DB 3파일, Field DB 2파일 |
| `test:e2e:agent` | 0 | 9/9 pass, skip 0 |
| `test:e2e:field` | 0 | 7/7 pass, skip 0 |
| `test:e2e:distribution` | 0 | 2/2 pass |
| `test:integration:faults` | 0 | 정적·AP/Field 표적 DB·HTTP/worker 장애 9/9 |
| `test:security` | 0 | 304/304. 첫 실행에서 `tools/spikes/field-tenant-host-http.test.mjs:82`가 테넌트 루트 `/` 404를 단언해 실패 → F1의 의도된 변경이므로 200+홈 HTML 확인으로 기대값 변경, 미존재 slug 루트 404는 유지 |

실행하지 않은 것: `test:independence:*`(상대 제품 컨테이너 정지가 필요하며 이번 변경이 제품 경계·env를 바꾸지 않음), 실 공급사·실기기·운영 게이트. `git status`는 테스트가 추적 파일을 바꾸지 않았다.

## 7. 바꾼 기존 테스트 기대값 (의도 변경에 따른 것, 약화 아님)

| 위치 | 이전 | 이후·이유 |
|---|---|---|
| AP `field-connection.db.test.ts` noRetry | degraded면 409 | degraded 재검증 허용 → 503, 상태 유지 |
| AP `ai-entitlement.db.test.ts` 3곳 | 결과 미상 replay 202, run `in_progress` | run 종결 → 503 `provider_result_unknown`, `failed`. 재POST 0회·unknown 사용량은 그대로 검증 |
| AP·Field `billing-authorization.db.test.ts` | unknown 취소 409 | credential 없는 unknown 취소 허용(Field는 멱등기간 경과 후). 새 테스트로 대체 |
| AP `inquiries.db.test.ts`, Field `business-core`/`bookings.db.test.ts` XFF 검사 | 127.0.0.1 직접 접속 가정 | loopback이 신뢰 프록시가 되어 `remoteAddress: 192.0.2.10`으로 위조 방지 의도 유지, 프록시 경유 고객 분리 assertion 추가 |
| Field `bookings.db.test.ts` 첫 테스트 | 공개 후 정책 없는 slot 승인 201 | 409 `booking_schedule_not_ready` → 정책 설정 → 승인 → 재공개 → 예약 201 |
