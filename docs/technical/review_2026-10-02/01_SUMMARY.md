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

> 현재 열린 결정은 §13 한 곳에 모았다. 아래는 당시 기록이며 해결된 항목에 **해결** 표시를 붙였다.

- **(열림 → §13) Field M1 — 신고로 숨긴 사이트의 신규 문의·예약 접수 차단 여부.** 현재 코드·테스트(`moderation.db.test.ts:101`)·TASKS:198은 "숨김 중에도 신규 직접 접수 유지"를 의도된 결정으로 명시한다. 차단으로 바꾸려면 TASKS 재개 기록과 사용자 승인이 먼저 필요하다. 구현 후 원복했다.
- **(해결 — `c22b288`: compose가 `*_TRUST_PROXY` 기본값을 제품 네트워크 대역으로 두고, `infra/edge/Caddyfile.example`·`.env.live.example`에 XFF 재작성 조건을 문서화) trustProxy 배포 조건.** Next 16 외부 rewrite는 `X-Forwarded-For`를 추가하지 않고 클라이언트 헤더를 그대로 넘긴다. 운영에서는 Next 앞단 LB/엣지가 XFF를 append해야 `loopback` 신뢰로 실제 고객 IP가 잡힌다. 이 조건을 배포 문서에 넣어야 한다.
- **(열림 → §13) `(추가)` 표식.** AGENTS 6.0에 따라 붙인 표식이 사용자 화면에 37곳 이상 노출된다. 운영 고객 화면에도 둘지 결정이 필요하다.

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

## 8. 1단계 후속 수정 — 2026-10-03 (§4 "범위 밖" 항목 처리)

| # | 결함 | 수정 |
|---|---|---|
| A12 | production 가드가 `mock`만 거부 | 양 제품 `production-profile.ts`의 `assertProductionProfile`: production에서는 프로필이 정확히 `live`여야 부팅. server/auth/worker 진입점 전부 적용 |
| A13 | 전액 환불 후 구독이 `active`로 남아 접근·갱신·재가입 모두 불가 | 마지막 기간 전액 환불 시 `ended`+`terminated_at`, `subscription_ended_by_full_refund` 이벤트, 새 checkout 허용(양 제품 `billing-refund-execution.ts`) |
| A14 | 만료된 `past_due` 20건이 갱신 후보 `limit 20` 점유 | 다음 기간까지 끝난 past_due는 후보 제외(양 제품 `billing-charge-execution.ts`) |
| A15 | dispatch~settle 사이 프로세스 종료로 AI run 영구 `in_progress` | 요청 경로에서 10분 초과 run을 `failed/run_abandoned`로 종결(`customer-consultations.ts`) |
| A16 | OAuth 토큰 발급 시 같은 pool 이중 점유 → 동시 10건+ 교착 | AsyncLocalStorage로 트랜잭션 client 공유(`oauth-lifecycle-provider.ts`) |
| A17 | 매체 origin 검증 전 영구 선점 | 미검증 등록 24h 만료, 검증 행만 unique(**migration 000083**) |
| F12 | `server.ts` 종료 순서(app.close/pool.end 동시) | `shutdown.ts`: app → pool 순차, 멱등, 10초 상한 |
| F13 | 공개 접수 IP 한도·고객 메시지 속도 제한 없음 | (조직, IP-HMAC) 15분 창 20건/메시지 30건, `FIELD_PUBLIC_SUBMISSION_IP_LIMIT`/`FIELD_PUBLIC_MESSAGE_IP_LIMIT`(**migration 000075**) |
| F14 | 사이트 초안 1MiB 기본 한도로 긴 한글 본문 413 | `PUT /v1/sites/draft` 4MiB |
| F15 | 자체 도메인 DNS 일시 오류 1회에 유효기간 삭제·소유권 해제 | 마지막 확정 점검 후 15분 유예, 유예 중 상태 유지·오류만 기록 |
| F16 | 대문자 Host 404 | 소문자 정규화(`custom-domain-host.ts`, `site-route.ts`) |
| F17 | 예약 내보내기가 사진 조회 중 pg client 보유 | commit 후 즉시 반납 |
| F18 | 사진 50장 상한 경합 | 조직 advisory lock 안에서 재계수 |
| T1 | Field `ai-entitlement.db.test.ts` 14건이 DB 컨테이너 시계가 Node보다 느릴 때 403 | fixture 승인 시각을 1초 전으로(제품 코드 변경 없음) |

검수(2026-10-03, 동일 환경): lint/typecheck/unit 35/build 4종/`test:db:agent` 146/146/`test:db:field` 164/164/contracts/`e2e:agent` 9/9/`e2e:field` 7/7/`e2e:distribution` 2/2/`integration:faults` 9/9/`security` 313/313 모두 exit 0. 바뀐 기대값: AP·Field 환불 테스트(전액 환불 후 active→ended), Field custom-domain 3건(유예 경과 시각 설정 추가). 남긴 것: lifecycle 저널 요청마다 전체 스캔(P2-6, 추정 0.5~1일), 사진 삭제 경로, `.well-known/ap-site-verification` 라우트의 Host 소문자화.

## 9. 2단계 — 운영(non-mock) 코드 공백 구현 — 2026-10-03

§5의 착수 순서 1~7을 구현했다. 실 공급사 연결·실 TLS·레지스트리·운영 서버 기동은 여전히 별도다.

| 항목 | 구현 | 주요 파일 | 환경변수 |
|---|---|---|---|
| 웹 live 빌드 | `next.config.ts`의 live throw 제거. live에서는 `/preview*`만 proxy가 404. 홈의 시안 링크는 live에서 숨김 | `apps/*-web/next.config.ts`, `apps/*-web/src/proxy.ts`, `*-home.tsx` | Field live 필수: `FIELD_SITE_BASE_DOMAIN`, `NEXT_PUBLIC_FIELD_WEB_ORIGIN` |
| 이메일 확인·비밀번호 재설정 | 제품별 `email-provider.ts`(mock=outbox 기록, sandbox/live=SMTP, live는 `smtps:`만). better-auth `sendVerificationEmail`/`sendResetPassword` 연결, `trustedOrigins`에 웹 origin. outbox에 저장 시 토큰 `[redacted]`. 웹: `/verify-email`, `/forgot-password`, `/reset-password`, "확인 메일 다시 보내기 (추가)", "비밀번호 찾기 (추가)" | `apps/*-api/src/{auth,email-provider}.ts`, migration AP 000084 / Field 000076, `apps/*-web/src/*-auth-pages.tsx` | `AP_SMTP_URL`, `AP_MAIL_FROM`, `FIELD_SMTP_URL`, `FIELD_MAIL_FROM` (미설정 시 blocked_integration, `/health/ready`의 `integrations.email`) |
| 관리자 2단계 인증 | better-auth `twoFactor`(TOTP+백업코드). `requireAdmin` 공통 게이트: 세션→관리자 멤버십→non-mock은 2FA 사용+2FA로 열린 세션(`session.twoFactorVerified`). 기존 "mock 외 503" 게이트 전부 교체. 웹 "/admin/mfa" 등록 화면 "(추가)", 로그인 TOTP 입력 | `apps/*-api/src/admin-auth.ts`, `admin*.ts`, `retention-routes.ts`, `customer-support.ts`, `*-moderation.ts`, `apps/*-web/src/*AdminMfa.tsx` | 없음 |
| 운영 체험 정책 | sandbox/live에서 `*_TRIAL_CONSENT_VERSION`+`*_TRIAL_DAYS`(1–90)가 있으면 체험 시작 허용, 동의 버전 일치 필수. 체험 행은 모든 프로필에서 인정. GET `/v1/subscription`에 `policy{consentVersion,days,source}` 추가, 웹은 하드코딩 제거 | `apps/*-api/src/{subscription,subscription-access,trial-access}.ts`, `*-subscription.tsx` | `AP_TRIAL_CONSENT_VERSION`, `AP_TRIAL_DAYS`, `FIELD_TRIAL_*` |
| 템플릿 시작 시 실제 사이트 | `POST /v1/sites`가 승인 카탈로그로 hero·소개·서비스·(FAQ)·지역·운영시간·연락 섹션을 결정형 `layoutToSite`로 채움. 카탈로그 없으면 기존 단일 hero. 자동 공개 없음 | `apps/field-api/src/{sites,site-generation}.ts` | 없음 |
| 약관·처리방침·고지 | `/terms`, `/privacy`(양 앱). 운영자 정보는 env, 미설정 시 "운영자 정보 미설정" 표시. 보존기간은 코드 근거만(정책 테이블 → "정책 확정 전"). 공개 고객 폼 3곳에 "개인정보 수집·이용 안내 (추가)" | `apps/*-web/src/legal.tsx`, `app/{terms,privacy}`, `field-public.tsx`, `field-booking.tsx`, `agent-public.tsx` | `NEXT_PUBLIC_LEGAL_*` 7종 |
| 배포 산출물 | 제품별 `Dockerfile.api`(worker 동일 이미지, `--target migrate`)·`Dockerfile.web`, `compose.live.yaml`(db→migrate→api→web/worker, 자격증명 필요 worker는 profile), `.env.live.example`, `infra/edge/Caddyfile.example`, `.github/workflows/ci.yml`(lint/typecheck/unit/DB suite 양쪽/계약/빌드/이미지), ADR 0003 | `infra/`, `.github/`, `.dockerignore`, `docs/04` 5.1.1 | 예시 파일 참조 |

**결정 필요 / 남은 공백** (현재 열린 항목은 §13)
- (열림 → §13) 템플릿 초안에서 소개 문구가 hero 본문과 '소개' 섹션에 두 번 나온다(`layoutToSite` 기존 동작). 한 곳으로 줄일지 결정.
- (해결 — `196befc`, 이미지 868→460MB) API 이미지에 better-auth의 선택 peer로 `next`가 포함된다(약 285MB). lockfile/peer 규칙 변경 필요.
- (해결 — A04, `a5eac8c`) live baseline은 quiesced dry-run/명시 확인/보호 export·격리 live프로필 DB검수 완료. 실제 운영 실행은 C03/C04.
- (해결 — `b5df6af` allow endpoint, `196befc` Caddy edge 어댑터. 실 Caddy/ACME는 공급사 검수로 남음) 사업자 자체 도메인 TLS(Caddy on-demand `ask`)는 Field API에 `?domain=` 형식 endpoint가 없어 초안만.
- (해결 — `196befc` 연결 로그인 2FA·outbox 보존, 실 SMTP는 §13 공급사 항목) OAuth 연결 로그인 화면(`agent-connect.tsx`)은 2FA 확인 미처리. email_outbox의 주소 보존·삭제 정책 없음. 실 SMTP 미시험.
- (열림 → §13) nodemailer 10.0.13(MIT-0, 2026-09-30 배포)은 공급망 검토 권장.

검수(2026-10-03, Mac local mock, Node 24.18.0, PG17 격리 DB, Playwright venv):

| 명령 | exit | 결과 |
|---|---|---|
| `lint` / `typecheck` / `test:unit` | 0 | tools 35, agent-api 27, field-api 36, agent-web 71, field-web 117 |
| `build:agent` / `build:field` / `build:web:agent` / `build:web:field` | 0 | live 프로필 빌드는 B1 보고대로 별도 확인(Field live는 두 env 필수) |
| `test:db:agent` | 0 | 35파일 150/150 (migration 000084 포함) |
| `test:db:field` | 0 | 32파일 169/169 (migration 000076 포함) |
| `test:contracts`, `test:integration:faults` | 0 | 9/9 |
| `test:e2e:agent` / `field` / `distribution` | 0 | 9/9, 7/7, 2/2 |
| `test:security` | 0 | 322/322 |
| Docker 이미지 6개 빌드, 임시 PG로 migrate+live API `/health/ready` 200, compose config, actionlint | 0 | B4 보고. live compose `up`·실 TLS·레지스트리·amd64·GitHub Actions 실제 실행은 미검증 |

첫 실행에서 E2E 3종·보안 1건이 `/health/ready` 본문 deepStrictEqual(`integrations.email` 추가)로 실패해 spike 6곳의 기대값을 `integrations: { email: 'mock' }`로 갱신한 뒤 재실행했다.

## 10. 3단계 — 착수 순서 9~11 구현 + 리뷰 반영 — 2026-10-03

5개 구현 에이전트 병렬 → 제품별 코드 리뷰 2건(`07_PHASE3_AP_CODE_REVIEW.md`, `08_PHASE3_FIELD_CODE_REVIEW.md`) → 제품별 수정 에이전트 2건 순서로 진행했다.

| 항목 | 구현 | 주요 파일 | 비고 |
|---|---|---|---|
| 카카오 로그인(양 제품) | better-auth 내장 `kakao` 공급사, `account.accountLinking.enabled:false`(동일 이메일 자동 병합 금지, B03), 카카오 미인증 이메일 거부, `GET /v1/auth/providers`, 카카오 콜백에도 2FA 적용하는 브리지 플러그인. 웹은 configured일 때만 버튼 활성 | `apps/*-api/src/kakao-provider.ts`, `auth.ts`, `*-kakao-sign-in.tsx` | `AP_KAKAO_CLIENT_ID/SECRET`, `FIELD_KAKAO_*`. mock에 키가 있으면 부팅 거부. 내장 공급사는 PKCE 없음. 실 카카오 미검증 |
| AP `human_active` | `POST /v1/owner/inquiries/:id/take-over`·`/release`(직접 응대 시작/종료 `(추가)`), human_active 중 고객 메시지는 AI run 생성 없이 상태 유지 | `inquiries.ts`, `workspace.tsx` | **AI 재개(human→ai_assisting)는 미구현**(결정 → §13): `ap_inquiries_contact_state_check`가 동의 후 대화를 human 모드로 고정하며, 완화 시 개인정보가 AI 기록으로 흘러감. 결정 필요 |
| Toss 웹훅(양 제품) | `POST /v1/billing/webhooks/toss`: 서명 없는 힌트로만 취급. event_type/order_id/payment_key sha256만 저장, 원장 변경 없음, 결과 미상 건의 `next_attempt_at`만 60초 초과 예약일 때 앞당김, IP 창, 응답 고정 `{received:true}`, 30일 정리 | `billing-webhook.ts`, migration AP 000086 / Field 000079 | 결제 워커 기본 backoff가 60초라 현재는 앞당김 효과 거의 없음(결정 필요 → §13) |
| 계정·조직 삭제(양 제품) | 조직: owner 확인 입력+3개 승인+전제 조건(유료 구독·연결·미결 요청/예약) → 14일 유예(`deletion_scheduled`로 신규 업무 차단, Field 사이트 비공개, AP 배포/캠페인 pause) → 보존 워커가 실행(사이트·지식·카탈로그 내용 삭제/비움, 문의·예약 원본·청구 원장·감사 보존, 알림 수신처 암호문 삭제, 다른 조직 멤버십 없는 사용자만 세션 만료, 자체 도메인 해제). 계정: 비밀번호 재입력(5회/15분) 또는 카카오 전용 계정은 5분 이내 재로그인, 관리자/조직 owner/활성 grant면 거부, user 행은 익명 tombstone, email_outbox 익명화 | `account-deletion.ts`, migration AP 000085 / Field 000077, `*-account.tsx`, `/workspace/account` | 삭제된 조직 owner는 `owner_user_id` unique로 새 조직 생성 불가. 상호명은 보존(법무 검토) |
| Field 공개 API 4개(§4.12) | `GET external-requests/{id}`, `POST .../customer-decisions`(accept/withdraw, 확정 아님), `GET .../notification-route`, `POST webhooks/agent`(HMAC inbox, `connection.revoked` 처리). 계약 preview.9, scope 2개 추가·client 등록 허용 | `external-request-public-routes.ts`, `ap-webhook-inbox.ts`, migration Field 000078, `contracts/field-integrator-v1.openapi.json` | §4.6 상태 4종은 AP ActionRequest 상태표이며 Field `external_work_requests.status`에 넣으면 의미가 틀려 미적용(AP 결정 필요 → §13). AP는 아직 새 경로를 소비하지 않음(해결 — `196befc`) |
| OAuth 선택 행 cascade(H1, 기존 결함) | better-auth가 만료/로그아웃 세션을 삭제하면 `oauth_selections`→연결이 cascade 삭제되어 통합 token 401. `session_id` nullable + `on delete set null` | migration AP 000087 / Field 000080 | 로그아웃 시 access token은 better-auth가 회수, `offline_access` refresh로 지속 |
| 자체 도메인 on-demand TLS | `GET /v1/public/site-hosts/allow?domain=`(tls_pending/connected만 200, 삭제 조직 거부), Caddyfile `on_demand_tls { ask }` | `custom-domain-routes.ts`, `infra/edge/Caddyfile.example` | edge 어댑터 구현체가 없어 운영에서는 여전히 blocked_integration(해결 — `196befc` Caddy edge 어댑터, 실 Caddy/ACME는 미검증) |
| HEIC | sharp가 HEVC를 디코딩하지 못함을 확인. 415 `heic_unsupported`, 선택기 accept에서 제거, 안내 문구. site-editor의 틀린 문구 2곳 수정 | `site-media.ts`, `inquiry-media.ts`, `site-editor.tsx` | 실제 HEIC 변환은 libheif+HEVC 빌드 필요 |
| 구조화 로그·PII 가림 | pino 로거, 헤더/본문 redact, 전화·이메일 마스킹, 라우트 패턴 URL, requestId | `apps/*-api/src/logging.ts`, docs/04 5.6.1 | `AP_LOG_LEVEL`/`FIELD_LOG_LEVEL` |

**리뷰에서 나와 반영한 것:** 웹훅 원문 저장 중단·응답 고정·정리, 계정 삭제 비밀번호 시도 제한, 카카오 전용 계정 삭제 경로, 세션 만료 범위, 삭제 후 PII(outbox·알림 수신처), S3 HeadObject 404/403 구분과 12회 상한, RFC 3339 검증, HMAC 검증 후 잠금, `deletion_scheduled` 웹 문구, 동의 화면 scope 한국어 라벨.

**남긴 것(해결 — 7건 모두 `196befc`, 사진 삭제는 `13bcd31`에서 2단계로 재구성):** 직접 응대 시작/종료 행위자 기록(check 제약 migration 필요), 조직 삭제 예약 재인증, 여러 조직 owner의 삭제 대상 선택, owner 발송 기록 암호문 정리 테스트, 멈춘 삭제 요청의 `next_attempt_at='infinity'` 운영 절차, lifecycle 저널 전체 스캔, 사진 삭제 경로.

검수(2026-10-03, Mac local mock, Node 24.18.0, PG17 격리 DB, Playwright venv):

| 명령 | exit | 결과 |
|---|---|---|
| `lint` / `typecheck` / `test:unit` | 0 | tools 35, agent-api 32, field-api 43, agent-web 78, field-web 125 |
| `build:agent` / `build:field` / `build:web:agent` / `build:web:field` | 0 | |
| `test:db:agent` | 0 | 39파일 164/164 (migration 000085~000087 포함) |
| `test:db:field` | 0 | 35파일 184/184 (migration 000077~000080 포함) |
| `test:contracts`, `test:integration:faults` | 0 | 10/10 |
| `test:e2e:agent` / `field` / `distribution` | 0 | 9/9, 7/7, 2/2 |
| `test:security` | 0 | 351/351 |

실 카카오·토스·S3·SMTP·Caddy 공급사, 독립성 검사(`test:independence:*`), 사용자 최종 화면 테스트는 미실행.

## 11. 4단계 — 남은 작업 구현 + 리뷰 반영 — 2026-10-03

5개 구현 에이전트 병렬 → 제품별 코드 리뷰(`09_PHASE4_AP_CODE_REVIEW.md`, `10_PHASE4_FIELD_CODE_REVIEW.md`) → 제품별 수정 에이전트 순서.

| 항목 | 구현 | 주요 파일 | 비고 |
|---|---|---|---|
| 조직 삭제 예약 재인증·조직 선택·운영자 복구(양 제품) | 예약 시 비밀번호(5회/15분 공유 창) 또는 카카오 5분 재로그인, `x-organization-id`로 삭제 대상 선택(여러 조직 owner), eligibility에 보유 조직 목록, `GET /v1/admin/organization-deletions?status=stopped`·`POST .../:id/resume`(operator, 사유 필수, `steps.operatorResumes` 감사), AP 12회 실패 정지, owner 발송 기록 암호문 정리(AP migration 000089) | `account-deletion.ts`, `admin.ts`, `*-account.tsx`, `*-admin.tsx` | 관리자 화면 "삭제 요청 복구 (추가)" |
| 직접 응대 행위자 기록 | `inquiry_resolution_events`에 `human_takeover`/`human_release`(AP migration 000088) | `inquiries.ts` | |
| 연결(OAuth) 로그인 2FA | `agent-connect.tsx`/`field-connect.tsx`가 `twoFactorRedirect`를 처리하고 동의 흐름을 이어감 | | 연결 화면 카카오 버튼은 서버 2FA 이동 주소가 OAuth 쿼리를 잃어 미적용(남김) |
| AP의 Field 공개 API 소비 | 새 동의 scope 2개, 연결 `scopeState`, `GET /v1/inquiries/:id/field-actions/:actionId`(제안 읽기·30초 캐시·readState), `POST .../customer-decisions`(멱등 키 저장, unknown 처리), 알림 경로 확인 후 생략 사유 기록, 서명 웹훅 발신 outbox(`agent.action.delivery_updated`), AP migration 000090, 고객 화면 "Field 제안 확인/수락/철회 (추가)" | `field-connector.ts`, `field-actions.ts`, `field-customer-decisions.ts`, `field-webhook-sender.ts`, `agent-field-action.tsx` | 같은 연결에 scope를 더하는 재동의 흐름 없음 → 해제 후 재연결 안내 |
| 사이트 사진 삭제 | `DELETE /v1/sites/assets/:id`(초안·모든 릴리스 사용 중이면 409, 저장소 삭제·부재 확인 후 행 삭제), 목록 `inUse`, 편집기 "삭제 (추가)" | `sites.ts`, `site-editor.tsx` | |
| Caddy edge 어댑터 | `FIELD_DOMAIN_EDGE=caddy`: `https://<domain>/.well-known/field-site-health` HTTPS 탐침(SNI·체인 검증), 15분 유예, 공개 health 경로, Caddyfile에 health 경로 프록시 | `custom-domain-edge-caddy.ts`, `custom-domain-*.ts`, `infra/edge/Caddyfile.example` | 실 Caddy·ACME 미검증 |
| 인증 메일 outbox 보존(양 제품) | 30일 삭제(blocked/failed 90일), 7일 지난 sent 인증 메일 수신 주소 익명화 | `retention-purge.ts` | |
| lifecycle 저널 요청당 전체 스캔 제거(양 제품) | 파일 stamp 캐시·인스턴스 재사용·적용 확인 캐시, IMMUTABLE `oauth_token_sha256` 식 인덱스(AP 000091 / Field 000081). 측정: 요청당 파일 읽기 28→0, DB 쿼리 72→1 | `oauth-lifecycle-journal.ts` | |
| API 이미지 슬림화 | `pnpm-workspace.yaml` overrides로 better-auth의 선택 peer `next/react/react-dom` 제외. 이미지 868→460MB | `pnpm-workspace.yaml`, lockfile, ADR 0003 A1 | |
| `.well-known/ap-site-verification` Host 소문자 | | field-web route | |

**리뷰에서 나와 반영한 것:** AP — 고객 결정 결과 미상 영구 차단(서버가 pending 결정을 저장된 키로 먼저 재전송, 401/403/404는 rejected로 종결, 웹 "결과 다시 확인 (추가)"), 알림 경로 일시 장애 시 생략 대신 503으로 다음 sync 재시도, Field client에 새 scope가 없을 때 `invalid_scope` → 기본 scope로 재시도(`scope_set`, migration 000092), lifecycle 캐시 식별값에 `pg_postmaster_start_time`·timeline·60초 상한·readdir 상시, TRUNCATE 가드(POL04), 운영자 재실행 감사의 owner 응답 노출 제거, 웹훅 401 재시도 5회·acked 정리, 연결 2FA 재시도 버튼. Field — 사진 삭제 교착(조직 행 `for key share` 선점, 공개 경로도 동일), Caddy health 응답을 HMAC 증명으로(조직 ID 비노출), TLS 실패 상태 왕복 제거·유예를 DB `checked_at` 기준으로·`last_error` 화면 표시 "(추가)", `site_release_assets(asset_id)` 인덱스+TRUNCATE 가드(migration 000082), lifecycle 캐시 동일 보강, 운영자 감사 노출 제거, UI "(추가)"·비활성 사유·`x-organization-id`, outbox 보존 문서화.

검수(2026-10-03, Mac local mock, Node 24.18.0, PG17 격리 DB, Playwright venv):

| 명령 | exit | 결과 |
|---|---|---|
| `lint` / `typecheck` / `test:unit` | 0 | tools 35, agent-api 32, field-api 48, agent-web 83, field-web 132 |
| `build:agent` / `build:field` / `build:web:agent` / `build:web:field` | 0 | |
| `test:db:agent` | 0 | 41파일 169/169 (migration 000088~000092 포함) |
| `test:db:field` | 0 | 36파일 192/192 (migration 000081~000082 포함) |
| `test:contracts`, `test:integration:faults` | 0 | 10/10 |
| `test:e2e:agent` / `field` / `distribution` | 0 | 9/9, 7/7, 2/2 |
| `test:security` | 0 | 364/364 |
| Docker `Dockerfile.api` 양 제품 | 0 | R5 보고: 이미지 868→460MB, next 미포함, 부팅 거부 정상 |

첫 실행에서 `test:e2e:distribution`·`test:integration:faults`가 `tools/spikes/ap-field-connection-http.test.mjs`의 Field 선택 scope(5개)와 AP 요청 scope(7개) 불일치로 재선택 화면에 가 실패 → spike의 선택 scope와 capabilities 기대값(`proposal.respond: true`)을 갱신해 재실행 통과. 실 Caddy/ACME·카카오·토스·S3·SMTP, 독립성 검사, 사용자 최종 화면 테스트는 미실행.

## 12. 5단계 — 남은 코드 작업 4건 + 리뷰 반영 — 2026-10-03

| 항목 | 구현 | 주요 파일 |
|---|---|---|
| 연결 화면 카카오 로그인 + 2FA 경로 보존(양 제품) | 2FA 브리지가 소셜 로그인의 `callbackURL`(같은 origin의 `/connect/sign-in`만 허용)로 되돌리며 서명 `oauth_query` 유지. 카카오 컴포넌트 `callbackPath`, 복귀 시 카카오 표시 파라미터만 제거. 연결 화면에 카카오 버튼·2FA 후 동의 이어가기 | `kakao-provider.ts`, `*-kakao-sign-in.tsx`, `*-connect.tsx` |
| 사이트 사진 2단계 삭제(Field) | `DELETE /v1/sites/assets/:id` → 짧은 트랜잭션에서 `deleting` 표시 후 202, 저장소 삭제는 보존 워커가 잠금 없이 처리(backoff 30초×2 최대 1시간, 12회·권한 오류 정지). 초안/공개는 `deleting` 참조 409, 공개 조회 404. 편집기 "삭제 요청 (추가)"·"삭제 중/삭제 지연 (추가)". migration 000083 | `sites.ts`, `site-media.ts`, `retention-purge-worker.ts`, `site-editor.tsx` |
| Field→AP push 경로 알림 경로 확인(AP) | 수신함 처리 시 잠금 밖에서 Field 알림 경로를 읽고(배치 캐시), owner field/전환 중이면 `not_applicable`+사유, 일시 장애면 claim 없이 `next_attempt_at`+30초로 미룸. 마이그레이션 없음 | `field-event-inbox.ts`, `field-event-worker.ts` |
| 서명 사건 채널 v2 방향 접두사(양 제품, 계약 AP preview.11 / Field preview.10) | 원문 `v2:<direction>.<ts>.<event_id>.<body>`(해제 채널 포함), `X-Signature-Version: 2`, v1은 `AP_EVENT_SIGNATURE_ACCEPT_V1`/`FIELD_EVENT_SIGNATURE_ACCEPT_V1`(mock/sandbox 기본 true, live 기본 false)일 때만 수용. 반대 방향 서명 401 | `field-signature.ts`, `ap-signature.ts`, 수신기·발신기 전부, `contracts/*`, CONTRACT_NOTES, docs/03 |

**리뷰에서 나와 반영한 것:** AP — 경로 캐시 10초 유효시간·1000개 상한·catch 시 초기화, push 경로 404는 확인키 자체가 없을 때만 영구 생략하고 그 외(배포 일시중지·동의 없음·토큰 만료)는 `received_at` 기준 30초→1시간 backoff로 최대 24시간 미룬 뒤 `route_unresolved`(migration 000093), 커넥터 미설정은 `blocked_integration`으로 구분, 2FA 복귀 URL의 userinfo 제거, 발신 서명 버전 `AP_EVENT_SIGNATURE_SEND_VERSION`. Field — 편집기가 `asset_deleting` 409를 초안 충돌로 오인하던 문제(선택 목록은 ready만, 저장·공개 전용 안내), 발신 서명 버전 `FIELD_EVENT_SIGNATURE_SEND_VERSION`과 docs/03 전환 순서·blocked 재큐 절차, 보존 워커 단계별 try/catch·S3 호출 30초 timeout, 연결 화면 카카오 버튼 문구("카카오로 로그인", 계정·사업장 선행 안내), 삭제 중 사진의 리소스 허용 제외, `.env.live.example` 갱신.

검수(2026-10-03, Mac local mock, Node 24.18.0, PG17 격리 DB, Playwright venv):

| 명령 | exit | 결과 |
|---|---|---|
| `lint` / `typecheck` / `test:unit` | 0 | tools 37, agent-api 32, field-api 51, agent-web 85, field-web 138 |
| `build:agent` / `build:field` / `build:web:agent` / `build:web:field` | 0 | |
| `test:db:agent` | 0 | 42파일 171/171 (migration 000093 포함) |
| `test:db:field` | 0 | 36파일 194/194 (migration 000083 포함) |
| `test:contracts`, `test:integration:faults` | 0 | 12/12 |
| `test:e2e:agent` / `field` / `distribution` | 0 | 9/9, 7/7, 2/2 |
| `test:security` | 0 | 368/368 |

실 Caddy/ACME·카카오·토스·S3·SMTP, 독립성 검사, 사용자 최종 화면 테스트는 미실행.

## 13. 현재 결정 — 열린13건과 해결1건 (2026-10-04, 코드 `a5eac8c`)

TASKS 상단·HANDOFF가 말하는 "결정 필요 항목"은 이 목록이다. §3·§9·§10·§11에 흩어져 있던 항목 중 코드로 해결된 것은 각 절에 **해결** 표시를 붙였고, 아래에는 사용자·운영 결정 또는 외부 계약이 있어야 닫히는 것만 남긴다. 결정 전에는 현재 동작(괄호)을 유지한다.

| # | 결정 | 현재 동작 | 출처 |
|---|---|---|---|
| 1 | AP AI 응대 재개(`human_active` → `ai_assisting`) 허용 여부 | 직접 응대 종료 뒤에도 AI 재개 없음. `ap_inquiries_contact_state_check` 완화 시 동의 후 개인정보가 AI 기록으로 흘러감 | §10 |
| 2 | docs/03 §4.6 상태 4종을 AP ActionRequest 상태표에 둘 위치 | Field `external_work_requests.status`에는 미적용 | §10 |
| 3 | Toss 웹훅 힌트의 결제 worker backoff 앞당김 기준(현재 60초 초과일 때만) | worker 기본 backoff가 60초라 효과 거의 없음 | §10 |
| 4 | 신고로 숨긴 Field 사이트의 신규 문의·예약 접수 차단 여부 | 접수 유지(`moderation.db.test.ts:101`, TASKS 기존 결정) | §3 |
| 5 | `(추가)` 표식을 운영 고객 화면에도 둘지 | AGENTS 6.0대로 표시 | §3 |
| 6 | 운영 체험 정책 값 승인(`*_TRIAL_CONSENT_VERSION`·`*_TRIAL_DAYS`) | 값이 없으면 live 체험 시작이 닫힘 | §9 |
| 7 | 운영자 법적 정보 입력(`NEXT_PUBLIC_LEGAL_*` 7종) | "운영자 정보 미설정" 표시 | §9 |
| 8 | 공급사 키·계약(SMTP·카카오·토스·S3·LLM·솔라피/웹 푸시·DNS/Caddy·레지스트리) | 각 기능 `blocked_integration`. S3가 없으면 retention worker의 사진 파일 삭제 단계도 미실행 | §5·§9 |
| 9 | 계정 삭제 시 사용자가 소유한 OAuth client 처리(삭제 차단 사유로 둘지, 삭제 트랜잭션에서 비활성화·토큰 회수할지) | active owned client는 `oauth_clients_active`로 차단. 복원 시 승인된 과거 삭제의 client/grant를 회수하며 정상 정책 유지 | `17_HOLISTIC_SECURITY.md` |
| 10 | 카카오 전용 계정의 관리자 2FA(`allowPasswordless` 허용 또는 비밀번호 추가 후 등록 안내) | 카카오 전용 계정은 2FA 등록 불가 → 비mock 관리자가 될 수 없음 | `13_HOLISTIC_AP_API.md`·`14_HOLISTIC_FIELD_API.md` |
| 11 | 템플릿 초안의 소개 문구 중복(hero 본문과 '소개' 섹션) | 두 곳에 표시 | §9 |
| 12 | **해결** live 공개 OAuth baseline(사용자 A04 요청) | dry-run·제품/DB/정지 확인·보호 export, 격리DB 검수 `a5eac8c`; 실제 live실행 별도 | §9·A04 |
| 13 | nodemailer 10.0.13 공급망 검토 | 검토 전 | §9 |
| 14 | 같은 연결에 scope를 더하는 재동의 흐름 | 새 scope는 연결 해제 후 재연결로 안내 | §11 |

## 14. 종합 리뷰(놓친 것 점검) + 반영 — 2026-10-03

5개 관점(AP API `13`, Field API `14`, 웹 `15`, 인프라·문서·CI `16`, 보안 `17`)으로 84af59a 이후 전체 변경을 다시 검토했다. Critical/High는 보안에서 0건, 기능 연계에서 다음이 핵심이었다.

| 발견 | 반영 |
|---|---|
| 조직 삭제 유예 중 결제·체험·연결 시작·통합 선택이 막히지 않음(양 제품) | 네 경로 모두 409 `deletion_scheduled`. 웹은 배너와 시작 버튼 숨김, 403/409 문구 통일 |
| 삭제 실행·PII 정리가 S3 필수 retention worker에만 묶여 기본 배포에서 영원히 미실행 | worker가 S3/저널 없이 기동, 미디어 단계만 blocked_integration. compose에서 retention worker 상시 실행 |
| 해제된 연결의 24시간 지난 `delivery_unknown`이 삭제를 영구 차단 | 전제 조건·보존 판단에서 제외, 운영자 종결 `POST /v1/admin/field-actions/:id/close-unknown` → `unresolved`(AP 000094) |
| 조직 삭제가 외부 통합 OAuth grant를 회수하지 않고, 계정 삭제가 매체·OAuth client를 확인하지 않음 | 실행 시 grant 회수(회수 저널 기록), 차단 사유 `publisher_membership_required_removal`·`oauth_clients_active` |
| Field 조직 삭제 실행기가 잠금 아래 S3 I/O | 남은 사진을 `deleting`으로 넘기고 0건일 때만 실행 |
| CI가 고정 컨테이너 이름(`docker exec`)을 전제해 반드시 실패 | compose.mock 기반 DB, e2e job(Playwright+mock:run) 추가 |
| 500 응답에 DB 오류 원문 노출, NUL 문자 미검증 | 5xx `{error:'internal_error'}`, 새 입력 `invalid_text` |
| 인증 링크 자동 로그인(login CSRF), 미인증 선점 계정, better-auth 기본 한도 | `autoSignInAfterVerification:false`, 48시간 미인증 계정 정리, DB 저장 rateLimit, 메일 10분 중복 억제, 요청 timeout 30초, IPv6 /64 창 |
| 웹: 삭제 유예 안내 없음, 원시 오류 코드 노출, 정책 문구 낡음, live `/preview` 링크, 포커스 | 공통 문구 헬퍼, `execution_failed` 매핑, 처리방침 갱신, `NEXT_PUBLIC_APP_PROFILE`, 포커스 이동, 사진 삭제 복구 관리자 패널 |
| 문서·원장: 커밋 해시 누락, 마스터 문서 지연, SHA256SUMS 불일치, 낡은 README/ADR | TASKS 해시·분리, 마스터 재생성(`tools/build_report.py`), SHA 재계산, 문서 갱신, §13 열린 결정 단일 목록 |

**남긴 것:** AP 미해결 요청 종결 관리자 화면(목록 API 없음), 운영자용 메일 outbox 화면, `test:independence` CI job, 기존 자유 입력의 NUL(500 대신 `internal_error`로만 표시), 카카오 전용 관리자 2FA(비밀번호 재설정으로 우회), 삭제 저널 백업 재적용, Field 공개 catalog의 유예 중 노출.

검수(2026-10-03, Mac local mock, Node 24.18.0, PG17 격리 DB, Playwright venv):

| 명령 | exit | 결과 |
|---|---|---|
| `lint` / `typecheck` / `test:unit` | 0 | tools 41(미등록 테스트 2개 포함), agent-api 38, field-api 57, agent-web 94, field-web 145 |
| `build:agent` / `build:field` / `build:web:agent` / `build:web:field` | 0 | |
| `test:db:agent` | 0 | 42파일 177/177 (migration 000094 포함) |
| `test:db:field` | 0 | 36파일 200/200 (migration 000084 포함) |
| `test:contracts`, `test:integration:faults` | 0 | 14/14, 15/15 (customer-decisions·revocation-restore 추가) |
| `test:e2e:agent` / `field` / `distribution` | 0 | 10/10, 8/8, 2/2 (계정 삭제 HTTP spike 추가) |
| `test:security` | 0 | 381/381 (TLS ask·health 404 추가) |

실 Caddy/ACME·카카오·토스·S3·SMTP, GitHub Actions 실제 실행, 독립성 검사, 사용자 최종 화면 테스트는 미실행.

## 15. 남은 작업 전체 목록 — 2026-10-04

코드·결정·외부 검증·문서 유지 작업을 `18_REMAINING_WORK.md`에 ID(A/B/C/D)로 정리했다. 이후 작업은 그 문서 기준으로 시작한다.

## 16. A절 코드·검수 마감 — 2026-10-04

A-01~A-25 내부 완료. 코드 `a5eac8c`, 외부 `a9fea58` 보존 병합 `0507bfc`, 전용 branch `fix/remaining-a-20261004`. 원본 main/서버/공유 원장을 보존했다.

최종 Linux arm64/Node24.18.0/pnpm10.33.4/PG17.11/Chromium153 격리 DIND: 독립성 양방향 exit0(사업자/고객 Chromium 각1/1), E2E AP12·Field11·매체2, 보안 410/410(AP DB49파일191/191·Field DB42파일215/215, UUID DB 전부 제거), 통합 장애 26/26 exit0. Host lint/typecheck/unit408pass·환경 조건skip2, 계약 static14+DB18/UUID9제거·실제 응답43/43, actionlint exit0. API/web4종 build는 새 격리 mock stack 기동에서 exit0.

실 HEIC Linux API Docker2종 build/proof exit0. A18 실제PG red→green과 제한된 최종 재리뷰에 남은 P1/P2 없음. 상세 `19_A_SECTION_IMPLEMENTATION_REVIEW.md`, coverage/phase/handoff. 기존 main a9fea58 GitHub run37196988683 전체 success는 확인했다. B #12(A04)는 해결돼 열린 결정13건. C01 새 CI 실제 Actions·C02공급사·C03live기동·C04운영/PITR/원장checkpoint 동시rollback/RPO/RTO·C05관측·C06실기기/접근성/최종시안·C07약관/HEVC-LGPL/amd64/실폰HEIC·C08외부보안·C09서명전환은 별도 미완료. 정식 인수160 status=not_run을 보존하며 QA31개 test reference만 연결했다.
