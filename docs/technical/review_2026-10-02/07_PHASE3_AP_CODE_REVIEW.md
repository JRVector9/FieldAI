# AP(apps/agent-api, apps/agent-web) 미커밋 변경 리뷰 — HEAD c22b288

범위: `git diff HEAD -- apps/agent-api apps/agent-web` + 신규 파일 전체(kakao-provider.ts, account-deletion.ts, billing-webhook.ts, logging.ts, migration 000085/000086, agent-account.tsx, agent-kakao-sign-in.tsx, workspace/account/page.tsx, 신규 테스트). 파일 수정 없음.

## 실행한 검사 (mock 프로필, 로컬 agent-mock DB, 임시 DB 생성 후 삭제)
- `node tools/run-db-suite.mjs agent test/account-deletion.db.test.ts test/auth-kakao.db.test.ts test/billing-webhook.db.test.ts test/inquiry-human-active.db.test.ts` → 9/9 통과
- `node tools/run-db-suite.mjs agent test/inquiries.db.test.ts test/inquiry-attachments.db.test.ts test/inquiry-spam.db.test.ts test/subscription.db.test.ts test/billing-charge.db.test.ts` → 20/20 통과(기존 회귀 없음)
- agent-api `tsx --test test/logging.test.ts test/image-format.test.ts test/billing-webhook.test.ts` → 5/5, agent-web `tsx --test test/account-deletion.test.tsx test/kakao-sign-in.test.tsx` → 5/5
- `tsc --noEmit` agent-api/agent-web 0 오류, `eslint`(AP 변경·신규 파일) 0 오류
- 미실행: 전체 test:db:agent, e2e, independence, 실제 카카오/토스 공급사(blocked_integration)

## 결함 (심각도 순) — Critical/High 없음

### M1. 토스 웹훅이 미인증 원문 payload와 paymentKey를 평문으로 무기한 저장
- `apps/agent-api/src/billing-webhook.ts:81-84` 가 `JSON.stringify(request.body)` 전체와 `payment_key`를 그대로 저장. 서명 없는 공개 엔드포인트이므로 누구나 64KB JSON을 IP당 15분 120건까지 영구 저장시킬 수 있음(IP 분산 시 무제한). 
- 같은 코드베이스는 결제키를 `billing_transactions.payment_key_ciphertext`로 암호화 보관하는데, 웹훅 표는 `payment_key`(000086:6)와 payload 안에 평문으로 둔다. 실제 토스 payload에는 결제·가상계좌 고객 정보가 들어갈 수 있음.
- `ap.billing_webhook_events`, `ap.billing_webhook_ip_windows` 정리 경로가 없음(`grep billing_webhook src` 결과 정리 코드 없음, `*_cleanup_idx`만 존재).
- 최소 수정: payload 컬럼에 원문 대신 파싱한 힌트(event_type, order_id, paymentKey의 sha256)만 저장하고, `payment_key`는 해시로 바꾼다. 보존 작업자(retention-purge-worker 루프)에서 `received_at < now()-interval '30 days'` 이벤트와 `updated_at < now()-interval '1 day'` IP 창을 삭제한다.

### M2. 계정 삭제 비밀번호 재입력에 시도 제한이 없음(비밀번호 확인 창구 + 파괴적 동작)
- `apps/agent-api/src/account-deletion.ts:183-208`: 세션만 있으면 `POST /v1/account/deletion-requests`로 비밀번호를 무제한 시험할 수 있다. better-auth 경로의 rate limit 밖에 있는 Fastify 라우트이고, 맞히면 그 즉시 되돌릴 수 없는 삭제가 실행된다. 탈취한 세션으로 비밀번호를 알아내는 데 쓰일 수 있음.
- 최소 수정: billing-webhook의 `consumeWebhookWindow`와 같은 방식으로 사용자 HMAC 키에 대한 15분 창(예: 5회)을 두고 초과 시 429를 돌려준다. 실패 시도도 창에 반영되도록 비밀번호 검증 전에 별도 커밋으로 소비한다.

### M3. 카카오 전용 계정은 계정 삭제를 할 수 없음(셀프서비스 경로 없음)
- `account-deletion.ts:48,51`: credential 비밀번호가 없으면 `password_unavailable` 차단. 이번 변경으로 `accountLinking.enabled:false` 카카오 전용 계정이 생기므로(auth.ts:44), 카카오 가입자는 조직 삭제는 할 수 있지만 계정 삭제는 영구히 막힌다. 웹 문구(agent-account.tsx:21)는 "운영자에게 문의"뿐인데 운영자 경로도 구현돼 있지 않다.
- 최소 수정: 비밀번호 대신 "최근 재인증" 증빙을 허용한다. 예를 들어 `session.createdAt`이 5분 이내이고 카카오 account가 있으면 통과시키고, 웹은 "카카오로 다시 로그인 후 삭제" 버튼으로 `/api/auth/sign-in/social`(callbackURL=/workspace/account)로 보낸다. 참고로 better-auth two-factor `enable`은 비밀번호가 필요해서 카카오 전용 계정은 TOTP도 켤 수 없다. 2FA 브리지는 지금은 방어 목적일 뿐 실제로 지나가는 경로가 거의 없다(정보).

### L1. 조직 삭제 실행이 모든 구성원의 AP 전체 세션을 만료시킴
- `account-deletion.ts:249-250,272`: 다른 조직에도 속한 editor까지 모든 기기에서 로그아웃된다. 해당 조직 접근은 멤버십 삭제(273행)로 이미 막힌다.
- 최소 수정: `where "userId"=any($1) and not exists(select 1 from ap.memberships m where m."user_id"="session"."userId" and m.organization_id<>$2)`처럼 다른 멤버십이 없는 사용자 세션만 만료시키거나, 현재 동작을 의도로 문서화한다.

### L2. 웹훅으로 미상 결제 조회 backoff를 우회할 수 있음
- `billing-webhook.ts:70-77`: 힌트가 올 때마다 `next_attempt_at=now()`로 당겨진다. order_id를 아는 사람(고객 본인 등)이 IP당 15분 120회까지 토스 lookup을 반복시킬 수 있다(공급사 호출 제한·차단 위험). 응답의 `reconcile_scheduled`/`no_pending_reconciliation`로 해당 주문에 미상 건이 있는지도 알 수 있다.
- 최소 수정: `next_attempt_at > now() + interval '1 minute'`처럼 최소 간격 조건을 추가하고, 응답 outcome은 항상 `received`로 통일한다.

### L3. human_active 중 고객 메시지를 재전송하면 응답 상태가 틀림
- `apps/agent-api/src/inquiries.ts:134`: `messageReplay`는 고객 메시지면 항상 `needs_owner`를 돌려준다. human_active 유지 변경(314행) 이후 같은 Idempotency 재전송은 실제 `human_active`와 다른 값을 받는다.
- 최소 수정: 302-306행의 replay 응답에서 고객 메시지일 때 `state: row.state === 'spam' ? 'spam' : row.state`를 쓴다(row는 이미 FOR UPDATE로 읽었다).

### L4. 직접 응대 시작·종료에 행위자 기록이 없음
- `inquiries.ts:574-578`: 상태와 revision만 바꾸고 `inquiry_resolution_events`/`recordInquiryEvent`/감사 기록을 남기지 않는다. 누가 언제 사람 응대에 들어갔는지 추적할 수 없다(close/spam은 actor_user_id를 기록함, 480·526행).
- 최소 수정: close와 같은 방식으로 `inquiry_resolution_events`에 event_type('taken_over'/'released')을 추가한다. check 제약 확장 migration이 필요하다. 또는 별도 audit insert를 둔다.

### L5. 조직 삭제 실행 실패 원인이 남지 않음
- `account-deletion.ts:281-285`: catch가 오류를 버리고 `last_error='execution_failed'`만 기록한다. 작업자 출력도 `retry`뿐이라 운영자가 원인(트리거 PAN01/PAP01 등)을 알 수 없다.
- 최소 수정: `catch (error)`로 받아 `(error as {code?:string}).code`를 last_error에 함께 저장한다(예: `execution_failed:PAN01`). PII가 없는 code만 남긴다.

### L6. 웹 안내 불일치(작음)
- HEIC 415 힌트가 화면에 나오지 않는다. `agent-public.tsx:85-91` `uploadInquiryPhoto`가 status만 돌려주고, 226·757행은 "다시 시도할 수 있습니다"라고 표시한다. 형식 문제는 재시도로 해결되지 않으므로 415일 때 "HEIC는 지원하지 않습니다. JPG/PNG로 다시 선택해 주세요"로 바꾼다.
- `deletion_scheduled` 403 사유가 공개 상담·문의 화면에 매핑되지 않는다(agent-public.tsx는 `trial_ended`만 처리). 일반 실패 문구가 나온다.
- 삭제가 실행된 조직의 문의에도 고객은 추가 메시지를 계속 보낼 수 있다(`inquiries.ts:287` 게이트 없음). 받을 사람이 없다는 안내가 없다. 보존 원칙상 저장 자체는 맞으므로 안내 문구 정도만 필요하다.
- 계정 화면은 `x-organization-id` 없이 호출하므로 "owner 조직 중 가장 먼저 만든 것"이 대상이다(account-deletion.ts:65-68). 여러 조직의 owner는 대상을 고를 수 없다. 조직 이름 확인 입력으로 오삭제는 막힌다.

### 정보(결함 아님)
- 미인증 이메일/비밀번호 선가입이 같은 이메일의 카카오 로그인을 `account_not_linked`로 막을 수 있다(서비스 방해, 탈취 아님). 피해자는 비밀번호 재설정으로 복구할 수 있다.
- logging: 클라이언트 `x-request-id`를 그대로 신뢰한다(형식 제한 있음, 상관관계 위조 가능). 가림은 휴대폰·이메일만 대상이고 유선번호·이름은 가리지 않는다.

## 확인 결과 문제없음
- **카카오 2FA 브리지**: better-auth 1.7.5 `api/dispatch.mjs`에서 callback이 redirect를 throw해도 after 훅이 실행된다. twoFactor 훅이 세션을 DB에서 삭제하고(`deleteSession`) 쿠키를 만료시킨 뒤 `twoFactorRedirect`를 반환하고, 브리지가 location을 `/workspace?two_factor=kakao`로 바꾼다(mergeResponseHeaders가 location을 덮어씀). kakao 공급사에는 `verifyIdToken`이 없어 `/sign-in/social` idToken 우회 경로도 없다. trust-device 처리는 이메일 로그인과 같다. 세션 `twoFactorVerified`는 callback 경로에서 false다.
- **카카오 계정 생성**: `accountLinking:false`로 동일 이메일 병합이 거부된다. 미인증 카카오 이메일은 user.create 훅에서 FORBIDDEN 처리되고 errorCallbackURL로 이동한다(테스트 확인). mock에 키가 있으면 부팅을 거부하고, 키가 일부만 있으면 오류를 낸다. `/v1/auth/providers`는 상태만 공개한다. 웹은 kauth.kakao.com origin만 따라간다.
- **take-over/release**: 멤버십 join(owner/editor)으로 IDOR 없음. FOR UPDATE와 revision CAS, 재전송 멱등 처리를 확인했다. human_active는 000006/000061/000065 제약에 포함된다. 보존 종료 건은 PAP01→410 전역 처리(retention-consumers.ts:92-95)를 따른다. 사업자 답변 시 waiting_customer 전환은 PRD 01:106 흐름과 일치한다. 생성 중인 AI는 automation_paused 재검사로 폐기된다(테스트 확인).
- **웹훅 신뢰 경계**: payload는 원장을 바꾸지 않고 `next_attempt_at`만 갱신한다. lease를 존중하고, billing_transaction_guard·dispatch_guard와 충돌하지 않는다. mock이 아닌 환경에서 공급사가 없으면 503 blocked_integration을 돌려준다. bodyLimit 64KB(413). 확정은 워커 lookup으로만 이뤄진다(billing-charge 테스트).
- **조직 삭제**: owner 전용이고 이름 확인과 3개 동의를 받는다. 조직 FOR UPDATE와 부분 unique index로 중복 예약을 막는다. 워커(SKIP LOCKED)와 취소(FOR UPDATE)는 직렬화된다. 전제조건 SQL의 컬럼·enum을 migration과 대조했다(field_connections.status 000032, field_action_requests.state 000036, paid_subscriptions.terminated_at 000069). notification_recipient_guard는 revoked_at 갱신을 허용한다. `campaign.paused` outbox 형식은 campaigns.ts:261과 같다. 유예 중 신규 업무는 subscriptionAccess cleanup_only를 통해 rejectExpiredTrial(공개 문의·상담·배포·캠페인 재개)로 차단된다. 기존 subscription·trial 테스트에서 회귀는 없었다.
- **계정 삭제**: owner·관리자·OAuth refresh 차단 조건을 확인했다. `better-auth/crypto` `verifyPassword({hash,password})`의 export와 시그니처가 맞다(scrypt). 세션은 expiresAt=now()로 만료되며, cookieCache·secondaryStorage 미사용이라 즉시 무효가 된다. user 행은 익명 tombstone으로 남고 감사 표를 기록한다. SameSite lax 쿠키와 JSON 본문 요구로 CSRF 위험이 낮다.
- **로깅**: pino 10.3.1은 msg serializer를 적용한다(tools.js:204). `formatters.log`가 serializer보다 먼저 실행된다. err serializer가 message·stack을 가리고 pg `detail`은 출력하지 않는다. URL은 라우트 패턴으로 기록하고 쿼리를 제거한다. Fastify 5.12.5 LogController의 기본 오류 로그도 같은 가림을 거친다.
- **HEIC**: 디코드에 실패한 경우에만 ftyp 브랜드로 판별하고 415 `unsupported_image_format`을 돌려준다. 웹 accept에서 heic/heif를 제거했다.
- **UI 규칙**: 새 기능에는 "(추가)" 표시가 있다(직접 응대 시작/종료, 계정·조직 삭제, 메뉴). 기존 시안의 카카오 버튼에는 표시가 없다(규칙에 맞음). 새 버튼은 모두 실제 API 또는 비활성 사유와 연결된다. 인라인 글꼴 크기 지정은 없다. 웹 경로·본문·상태코드가 API와 일치한다(take-over/release `{expectedRevision}` 200/409, 삭제 201/200/409, 계정 삭제 400/403/409).
