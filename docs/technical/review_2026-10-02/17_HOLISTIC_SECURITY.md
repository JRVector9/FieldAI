# FieldAI 보안 전수 점검 — 84af59a..13bcd31 (AP·Field 4개 앱)

범위: `git diff 84af59a..HEAD` 중 apps/agent-api, apps/field-api, apps/agent-web, apps/field-web의 src와 infra(Caddyfile, compose), CI. 파일은 수정하지 않았음.
검증 방법: 코드 읽기, better-auth 1.7.5·Fastify 5.12.5·Next 16.3.6 설치본 소스 확인, mock 스택 curl 확인(합성 계정 `secprobe-*@example.invalid` 2개와 조직 "Probe Org", "Probe Org2"를 AP mock DB에 만들었음. 남아 있으니 필요하면 정리), `node tools/run-db-suite.mjs agent test/auth-kakao.db.test.ts`(8/8 통과).

결론: **Critical·High 없음.** 확인된 문제는 Low 6건, Info/하드닝 7건임. 아래 1번(500 응답 원문 노출)만 curl로 재현했고, 나머지는 코드 근거임.

---

## 1. 신규·변경 라우트 표

| 제품 | 라우트 | 인증/인가 | 남용 제어 | 판정 |
|---|---|---|---|---|
| AP/Field | GET `/v1/organizations/current/deletion-requests/current` | 세션 + 멤버십(헤더 UUID 검증, 멤버십 join) | – | OK |
| AP/Field | POST `/v1/organizations/current/deletion-requests` | 세션 + owner + 확인문구(조직명) + 3개 동의 + 재인증(비밀번호, 또는 카카오 전용이면 5분 내 새 세션) | 비밀번호 15분 5회(계정 삭제와 공유). curl로 6회째 429 확인 | OK (단, 1번: reason에 NUL을 넣으면 500) |
| AP/Field | DELETE `.../deletion-requests/current` | 세션 + owner(취소이므로 재인증 없음) | – | OK |
| AP/Field | GET `/v1/account/deletion-eligibility` | 세션 | – | OK |
| AP/Field | POST `/v1/account/deletion-requests` | 세션 + 이메일 확인문구 + 차단 사유(owner 조직·관리자·OAuth refresh) + 재인증 | 15분 5회 | OK (7번 참고) |
| AP/Field | GET `/v1/admin/organization-deletions` | `requireAdmin`(operator·auditor, mock이 아니면 MFA 세션) | – | OK |
| AP/Field | POST `/v1/admin/organization-deletions/:id/resume` | `requireAdmin` operator + 사유 10~500자 | – | OK (사유 NUL → 1번) |
| AP | POST `/v1/owner/inquiries/:id/take-over`, `/release` | 세션 + 문의 조직의 owner·editor 멤버십 join + expectedRevision | – | OK |
| AP | GET `/v1/inquiries/:id/field-actions/:actionId` | 확인키 Bearer 43자의 SHA-256을 DB에서 비교 + 동의 완료 문의 | receipt-abuse 가드(경로 패턴 `/v1/inquiries/<uuid>/` 적용) | OK |
| AP | POST `.../field-actions/:actionId/customer-decisions` | 위와 같음 | 위와 같음 | OK |
| AP/Field | GET `/v1/auth/providers`, `/v1/auth/email-delivery` | 공개(의도됨, 상태 문자열만) | 없음(정적 응답) | OK |
| AP/Field | POST `/v1/billing/webhooks/toss` | 공개(Toss는 서명 없음 → 힌트로만 사용하고 금액·상태는 해석하지 않음) | IP별 15분 120회(HMAC 키), bodyLimit 64KB, 60초 이상 남은 lookup만 앞당김 | Low(4번) |
| Field | GET `/v1/public/site-hosts/allow` | 공개(Caddy ask) | 없음 | Low(4번) |
| Field | GET `/.well-known/field-site-health` | 공개, Host 기반 | 없음 | Info(9번) |
| Field | DELETE `/v1/sites/assets/:id` | 세션 + `organizationFor('publish')` + 사용 중 사진 409 + 잠금 순서 | – | OK |
| Field | PUT `/v1/sites/draft` (bodyLimit 4MiB) | 세션 + edit 권한 | 4MiB | Info(11번) |
| Field | GET `/integrations/v1/external-requests/:id` | `fieldIntegratorGrant`(토큰·요청 scope·동의 scope 3중) + 연결·client·actor·grant 바인딩 | – | OK |
| Field | POST `.../external-requests/:id/customer-decisions` | scope `field.proposals.respond` + 바인딩 + 키 화이트리스트 + RFC3339 + 24시간 신선도 + recordId 재사용 금지 + 멱등 | – | OK |
| Field | GET `.../external-requests/:id/notification-route` | scope `field.notification_route.read` + 바인딩 | – | OK |
| Field | POST `/integrations/v1/webhooks/agent` | 연결별 HMAC v2(방향 접두사) + timingSafeEqual + ±300초 + event_id 중복 확인 + 서명 확인 전에는 행 잠금 없음 | 64KB | OK |
| AP | POST `/integrations/v1/field-events` (변경) | v2 접두사 추가 | – | OK |
| Field | POST `/integrations/v1/connections/:id/revoke` (변경) | v2 접두사 | – | OK |
| AP | GET `/v1/connections/field/callback` (변경: invalid_scope 폴백) | state 해시 + iss | – | OK (state를 가진 사람만 기본 scope로 낮출 수 있음) |
| AP/Field | `/api/auth/*`(카카오, twoFactor, 이메일 인증·재설정) | better-auth | better-auth 기본 한도 | Low(5번) |

---

## 2. 발견 사항 (심각도순)

### [Low] 1. 500 응답이 DB 오류 원문과 SQLSTATE를 클라이언트에 그대로 돌려줌 (curl 재현)
- 위치: `apps/agent-api/src/retention-consumers.ts:92-95`, `apps/field-api/src/retention-consumers.ts:37-40`. 둘 다 `setErrorHandler`에서 `reply.send(error)`로 넘기고, Fastify 기본 직렬화가 `message: error.message`를 포함함. 이번에 추가된 텍스트 입력도 NUL(`\u0000`)을 걸러내지 않음: `apps/agent-api/src/account-deletion.ts:202-204`, `apps/field-api/src/account-deletion.ts:171-173`, `apps/*/src/admin.ts:102-103`.
- 재현(AP mock):
  `POST /v1/organizations/current/deletion-requests` 본문에 `"reason":"bad\u0000reason"` →
  `{"statusCode":500,"code":"22021","error":"Internal Server Error","message":"invalid byte sequence for encoding \"UTF8\": 0x00"}`
- 공격 시나리오: 인증된 사용자가 의도적으로 DB 오류를 일으켜 PostgreSQL 오류 문구를 수집함. 제약명·열 이름·형 변환 실패 값이 드러날 수 있음. 앱 내부 오류(`AP_AUTH_SECRET is required…`, `field_grant_refresh_unknown`)도 그대로 나감. 1회성 트랜잭션은 롤백되므로 데이터 손상은 없음.
- 최소 수정: 두 `setErrorHandler`에서 `statusCode >= 500`이면 `{ error: 'internal_error' }`만 보내고 원문은 로그에만 남긴다. 텍스트 검증 공통 함수에서 `/\u0000/`를 거부한다(400).

### [Low] 2. 미인증 이메일 계정이 주소를 선점해 진짜 주인의 카카오 가입을 막음
- 위치: `apps/agent-api/src/auth.ts:44`, `apps/field-api/src/auth.ts:56` (`accountLinking.enabled=false`). 미인증 사용자를 정리하는 경로가 없음(grep 결과 없음).
- 시나리오: 공격자가 피해자 이메일로 이메일/비밀번호 가입만 해 둔다(live에서는 미인증이라 로그인 불가). 이후 피해자가 카카오(인증된 같은 이메일)로 시작하면 `account_not_linked`로 거부되고 이메일 가입도 "이미 존재"가 된다. 비밀번호 재설정으로 되찾을 수는 있지만, 화면 안내는 "이미 이메일로 가입된 계정입니다. 이메일로 로그인"이라 사용자가 막힌다.
- 최소 수정: `emailVerified=false`이고 credential 계정만 있으며 멤버십이 없는 user를 N시간(예: 48시간) 뒤 정리하는 보존 작업을 둔다. 또는 카카오 콜백에서 그런 user를 찾으면 거부 대신 교체/연결하는 훅을 둔다.

### [Low] 3. 이메일 인증 링크 자동 로그인을 통한 login CSRF(세션 고정)
- 위치: `apps/agent-api/src/auth.ts:57`, `apps/field-api/src/auth.ts:69` (`autoSignInAfterVerification: true`). `/verify-email` 화면이 토큰으로 GET `/api/auth/verify-email`을 호출함.
- 시나리오: 공격자가 자기 이메일로 가입하고 받은 인증 링크를 피해자에게 보낸다. 피해자 브라우저가 공격자 계정으로 로그인된다. 피해자가 그 상태에서 사업 정보·Field 연결 동의 등을 입력하면 공격자 조직에 들어간다(카카오 state는 서명 쿠키로 바인딩되어 같은 공격이 막힘. 확인함).
- 최소 수정: `autoSignInAfterVerification: false`로 두고 인증 완료 후 로그인 화면으로 보낸다. 유지하려면 가입한 브라우저에만 있는 쿠키와 바인딩한다.

### [Low] 4. 공개 엔드포인트의 남용 제어 공백
- `/v1/billing/webhooks/toss` (`apps/*/src/billing-webhook.ts`): IP 창이 `request.ip` 전체 주소 기준이라 IPv6 /64 하나로 무한히 바꿔 가며 `billing_webhook_events`와 IP 창 행을 계속 쌓을 수 있다(AP 정리는 주기당 1000행). 최소 수정: IPv6는 /64로 묶어 HMAC하고, 전역 상한(예: 분당 N건 초과 시 기록 생략)을 둔다.
- `/v1/public/site-hosts/allow`, `/.well-known/field-site-health` (`apps/field-api/src/custom-domain-routes.ts:103-132`): 비율 제한이 없고 요청마다 DB 조회가 한 번씩 일어난다. `infra/edge/Caddyfile.example`은 "ask를 공개 인터넷에 노출하지 않는다"고 적었지만 `{$FIELD_API_HOST}` 블록이 4321 전체를 공개하므로 ask도 공개된다. 또 ask는 `connected`가 아닌 `tls_pending`·`error` 도메인에도 `organizationId`를 돌려준다(기존 `/v1/public/site-hosts/:hostname`은 connected만). 최소 수정: API 호스트 블록에서 `handle /v1/public/site-hosts/allow { respond 404 }`. ask는 loopback 전용 리스너나 내부 주소로만 받고, 응답 본문은 200/404만 쓴다(조직 ID 제거).
- 공개 접수 IP 창(`apps/field-api/src/public-submission-limit.ts`)도 IPv6 전체 주소 기준이라 같은 문제가 있다. 조직 공용 한도를 소진시키는 DoS가 가능하다(기존 설계 연장).

### [Low] 5. better-auth 내장 한도만 사용함 (이메일 폭탄, sandbox 무제한)
- 위치: `apps/*/src/auth.ts`에 `rateLimit` 설정이 없음. 설치본 기준 기본값은 `enabled = NODE_ENV==='production'`, memory 저장소, `/sign-in·/sign-up` 10초 3회, `/request-password-reset·/send-verification-email` 60초 3회, two-factor 10초 3회이며 IP 기준임.
- XFF 확인: Caddy가 XFF를 실제 IP 하나로 다시 쓰고, Next rewrite(httpxy)는 `x-forwarded-for ??=`로 덧붙이지 않는다. 그래서 better-auth는 단일 IP를 받는다. 여기는 정상이고 공용 버킷으로 떨어지지 않음.
- 남는 위험: (a) 이메일 주소별 한도가 없어 분산 IP로 특정 주소에 재설정·인증 메일을 반복 발송할 수 있다(email_outbox도 증가). (b) `AP_PROFILE=sandbox`에서는 NODE_ENV가 production이 아니므로 better-auth 한도가 꺼진다(로그인 대입 무제한). (c) 메모리 저장소라 프로세스 재시작이나 다중 인스턴스에서 초기화된다.
- 최소 수정: `rateLimit: { enabled: profile !== 'mock', storage: 'database' }`(또는 Valkey). `sendResetPassword`·`sendVerificationEmail`에서 같은 `to`로 10분 안에 보낸 outbox 행이 있으면 발송을 생략한다(응답은 동일하게 유지).

### [Low] 6. 계정 삭제 후에도 그 사용자가 등록한 OAuth client가 활성으로 남음
- 위치: `apps/agent-api/src/account-deletion.ts:69-80, 313-327` (Field도 같음). 차단 사유는 사용자의 refresh token만 본다. `"oauthClient"."userId"` 소유 client는 비활성화하지 않고, user 행은 익명화만 하므로 cascade도 일어나지 않는다.
- 시나리오: 통합자 계정이 삭제를 요청하면 관리 주체가 사라진(익명화된) client가 다른 조직 grant로 계속 토큰을 발급받는다. 회수하거나 변경할 사람이 없다.
- 최소 수정: 차단 사유 `oauth_clients_owned`를 추가하거나(먼저 이관·비활성화하게 함), 삭제 트랜잭션에서 `update "oauthClient" set disabled=true where "userId"=$1`과 관련 토큰 revoke를 수행한다. 어느 쪽인지는 정책 결정이 필요함.

---

## 3. Info / 하드닝
7. **관리자 MFA 세션 수명**: `requireAdmin`은 `session.twoFactorVerified`만 확인한다(`apps/*/src/admin-auth.ts`). 기본 7일 세션이 슬라이딩으로 갱신되므로 사실상 무기한이다. 삭제 재실행·환불 같은 operator 동작에는 세션 생성 12시간 이내 등 최대 수명이나 step-up 재확인을 권장함.
8. **Field 조직 삭제 실행기의 잠금 보유 시간**: `apps/field-api/src/account-deletion.ts:331-349`가 조직 행과 사진 행을 `FOR UPDATE`로 잡은 채 S3 delete·Head를 최대 50장 × 30초 동안 수행한다. 그 동안 해당 조직 요청이 막힐 수 있다(가용성). 사진 삭제를 site-media 2단계 삭제처럼 잠금 밖으로 빼는 것을 권장함.
9. **site-health 증명값 재사용·SSRF**: 누구나 Caddy catch-all에 Host 헤더를 넣어 허용 도메인의 proof를 받을 수 있다. 하지만 이를 쓰려면 그 도메인의 DNS를 통제해야 하므로 자기 도메인에만 영향이 있다(교차 테넌트 영향 없음). 프로브는 공격자 DNS가 가리키는 임의 IP의 443으로 접속하지만, 공인 체인과 호스트 이름 검증, 고정 경로, 4KB 상한, 결과는 pending/ready만 있어 실익이 거의 없다. 원하면 `lookup`에서 사설·루프백 IP를 거부한다.
10. **AP `/workspace/*` noindex 누락**: Field는 `app/workspace/layout.tsx`에 robots가 있다. AP는 새 `/workspace/account` 등에 없다. 인증 뒤 클라이언트 렌더링이라 실제 노출은 낮다.
11. **요청 시간 제한 없음**: Fastify `requestTimeout` 기본값 0이고, 초안 bodyLimit이 1MiB에서 4MiB로, 업로드는 8MiB다. API 호스트를 Caddy로 직접 열면 느린 본문으로 연결을 고갈시킬 수 있다. `requestTimeout: 30_000` 정도와 Caddy `servers { timeouts { read_body 30s } }`를 권장함.
12. **카카오 PKCE 없음**: better-auth kakao 공급사는 code_verifier를 보내지 않는다. state는 DB와 서명 쿠키 양쪽으로 바인딩되고 client secret이 있는 기밀 클라이언트라 허용 가능하다.
13. **CI 액션 SHA 미고정**: `actions/checkout@v5`, `pnpm/action-setup@v4`. `permissions: contents: read`이고 secret을 쓰지 않아 영향은 작다.

---

## 4. 확인 완료, 문제 없음 (checked, OK)
- **AuthN/AuthZ**
  - 모든 `/v1/admin/*` 라우트(AP 27개, Field 23개)가 `requireAdmin` 또는 `retentionAdminFor`(내부에서 requireAdmin)를 거친다. 비mock은 `user.twoFactorEnabled && session.twoFactorVerified`를 요구한다.
  - `twoFactorVerified`는 `input:false`이고, 세션 생성 훅에서 `/two-factor/verify-totp`·`/verify-backup-code` 경로일 때만 true가 된다. trust-device로 2FA를 생략한 세션과 이메일 인증 자동 로그인 세션은 false로 남아 관리자 접근이 거부된다(fail-closed).
  - `production-profile`로 NODE_ENV=production이면 `*_PROFILE=live`를 강제하므로 mock MFA 우회가 없다.
  - `x-organization-id`는 UUID 검증 후 멤버십 join으로만 반영된다(삭제 라우트, 사진 삭제 `organizationFor('publish')`, take-over owner·editor).
  - 통합자 라우트는 토큰·요청·동의 3중 scope와 `boundRequest`(연결·client·actor·grant·review_required)로 묶인다. Field 토큰은 sha256 다이제스트로 조회한다.
  - 고객 라우트는 Bearer 확인키 SHA-256을 DB에서 비교하고(해시 비교라 타이밍 무관), 동의 완료 문의만 허용하며, receipt-abuse 가드가 적용된다.
- **삭제 안전**
  - 조직·계정 삭제 모두 확인문구, 동의, 재인증, 시도 창(15분 5회, curl로 확인)을 거친다.
  - 실행기는 전제 조건을 다시 검사하고(`for update skip locked`), 한 트랜잭션으로 처리하며, 실패 상한에 걸리면 infinity로 멈춘다.
  - 유예 중에는 공개 사이트·사진·ask·site-health가 숨겨진다.
  - 계정 삭제 시 세션 즉시 만료, twoFactor·verification·credential 삭제, outbox 주소 익명화를 한다. cookieCache·secondaryStorage가 없어 만료가 바로 적용된다.
  - 카카오 전용 계정은 5분 내 새 세션으로만 진행되고, 비밀번호 계정은 recent-sign-in 경로를 탈 수 없다.
- **암호**
  - HMAC 비교는 모두 `timingSafeEqual`이며 길이를 고정한다(서명 64hex 정규식, proof 길이 확인).
  - v2 방향 접두사로 반사가 차단되고, live 기본값은 v1 거부다. v1에서도 body의 source_product 검증 때문에 반사가 불가능하다.
  - `siteHealthSecret`, 비밀번호 창, 웹훅 IP 창은 용도별 라벨로 HMAC 하위 키를 분리한다.
  - email_outbox는 비mock에서 일회용 토큰을 `[redacted]`로 저장한다. 재설정 토큰은 영숫자, 인증 토큰은 URL-safe JWT라 치환이 정확하다.
  - 메일 HTML의 링크는 이스케이프된다. live SMTP는 smtps만 허용한다.
  - TOTP 비밀값·백업코드는 better-auth 기본 암호화로 저장된다. `revokeSessionsOnPasswordReset: true`.
  - 로그는 요청 본문·헤더를 남기지 않는다. 라우트 패턴(`/api/auth/*`)을 쓰므로 재설정 토큰 경로와 쿼리가 남지 않는다. 민감 헤더(authorization, cookie, x-signature, x-receipt-key, x-field-route-key-session-id 등)는 redact되고, 이메일·전화는 마스킹된다.
- **리디렉션/SSRF**
  - better-auth originCheck가 callbackURL·errorCallbackURL·redirectTo를 trustedOrigins로 검증한다. curl로 확인함: 외부 redirectTo는 403, 외부 Origin은 403, verify-email 외부 callbackURL은 403.
  - `kakaoTwoFactorReturnUrl`은 같은 origin이면서 `/connect/sign-in`인 경우만 허용하고 userinfo·hash를 제거한다.
  - 웹의 `kakaoAuthorizeUrl`은 `https://kauth.kakao.com` origin만 따른다.
  - Field·AP 커넥터와 웹훅 발신 URL은 환경 설정값(issuer)으로만 만든다.
  - Field 웹 custom host는 소문자화 후 정규식 검증을 하고, 테넌트 호스트에서 `/api/auth`·`/workspace` 등은 404 또는 테넌트 사이트로 rewrite된다.
- **카카오**
  - 계정 자동 병합이 금지되고, 미인증 카카오 이메일로는 계정을 만들지 않는다.
  - 2FA 사용자는 TOTP 전에는 세션이 없다(DB 테스트 8/8 통과).
  - state가 서명 쿠키로 바인딩되어 login CSRF가 막힌다.
- **XFF**: Caddy가 XFF를 다시 쓰고, Next rewrite는 추가하지 않으며, Fastify trustProxy는 compose 대역만 신뢰한다. API·web 포트는 127.0.0.1에만 바인딩된다.
- **SQL**: 신규 SQL은 모두 매개변수 바인딩이다. 템플릿 보간은 상수 조각(`ASSET_IN_USE_SQL`, `currentBinding`, `blankCatalog`, 화이트리스트 table, lock 절)뿐이다.
- **웹**
  - 신규 코드에 `dangerouslySetInnerHTML`이 없다. TOTP QR은 로컬 `qrcode`로 만든다(외부 전송 없음).
  - reset·verify 화면은 토큰을 읽은 즉시 `history.replaceState`로 지우고, `referrer: no-referrer`와 noindex를 둔다. 카카오 복귀 쿼리도 지운다.
  - live에서 `/preview`는 404다.
- **트랜잭션 정리**: reservation-export는 commit 뒤에 client를 반납한다.
- **기타**: Toss 웹훅 응답 본문은 결과와 무관하게 고정이고, paymentKey는 sha256으로만 저장한다. 조직은 사용자당 1개(unique owner_user_id)라 체험판 남용은 새 인증 계정이 필요하다.
