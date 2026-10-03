# Field API 전체 감사 — 84af59a..13bcd31 (apps/field-api)

범위: `git diff 84af59a..HEAD -- apps/field-api`(6커밋, 마이그레이션 000075~000083, 신규 파일 전체 읽음). 파일 수정 없음. DB 조회는 mock DB의 `pgmigrations` 읽기 1회만 했다. 판정은 모두 코드를 읽어서 확인했다(새 테스트는 실행하지 않음, 기존 미등록 단위 테스트 2개만 직접 실행 → 5/5 통과).

## 심각도 순 결과

### H1. 조직 삭제 유예(`scheduled`) 중에도 유료 결제·체험·연결 생성이 열려 있음 → 서비스는 막혔는데 과금되고, 삭제는 끝나지 않음
- `subscriptionAccess`는 삭제 예약을 `cleanup_only/deletion_scheduled`로 막는다(`subscription-access.ts:8-10`). 그런데 아래 진입점은 이 함수도, `organization_deletion_requests`도 보지 않는다.
  - `POST /v1/subscription/checkout`(`billing-consent-routes.ts:70-117`): `lockOwner` 뒤 열린 구독 여부만 검사. 새 `paid_subscriptions`를 만들면 인증 → 결제 워커가 첫 결제와 갱신 결제를 진행한다. 그동안 조직은 신규 업무가 막힌 상태다.
  - `POST /v1/subscription/trial`(`subscription.ts:57-72`): 조직당 1회인 체험 행을 써 버린다.
  - `POST /v1/connections/ap/start`(`ap-connector.ts:420-450`), `POST /integrations/v1/authorization/selections`(`integrator-routes.ts:78-113`): 새 연결과 grant를 만든다.
- 결과: 실행기 전제 조건(`account-deletion.ts:39-51`)이 `paid_subscription_active`/`connections_active`로 1시간마다 `blocked`를 반복한다(`:333-337`). 이 대기는 실행 실패 상한에 들어가지 않아 끝없이 이어지고, 그동안 매달 결제된다.
- 최소 수정: 위 4곳의 트랜잭션 안(checkout은 `lockOwner` 직후. 조직 행 FOR UPDATE라 삭제 예약 생성과 직렬화된다)에서 `select 1 from field.organization_deletion_requests where organization_id=$1 and status in ('scheduled','executed')`이면 409 `organization_deletion_scheduled`로 막는다(또는 `subscriptionAccess(...).reason==='deletion_scheduled'`를 확인). 테스트도 추가한다.

### M1. 조직 삭제가 Field가 발급한 통합 OAuth grant를 확인하지도 회수하지도 않음 → owner 계정 삭제가 막힘
- 전제 조건은 Field→AP `ap_connections`만 센다(`account-deletion.ts:42`). 외부/AP 통합자에게 준 `oauth_selections`·`oauthRefreshToken`·`oauthConsent`는 실행기(`:353-385`)가 건드리지 않는다.
- 삭제 뒤에는 membership이 없어서 owner가 selection을 직접 해제할 수 없다(`integrator-routes.ts:144-147`의 `m.role='owner'` join). 그런데 계정 삭제 차단 조건 `oauth_grants_active`(`account-deletion.ts:61`)는 회수되지 않은 refresh token을 그대로 센다. 그래서 refresh token이 만료될 때까지 계정 삭제가 409다. 토큰은 membership join(`integrator-auth.ts:27-28`) 때문에 이미 쓸 수 없는데도 그렇다.
- 최소 수정: 실행기 트랜잭션에서 해당 조직의 `oauth_selections`를 revoke한다. 같은 `referenceId`의 access/refresh token도 revoke하고, consent를 지우고, `recordFieldRevocation`을 남긴다(`ap-connection-revoke-receiver.ts:30-39`와 같은 패턴). 아니면 전제 조건에 `integration_grants_active`를 추가한다.

### M2. `public_submission_ip_windows`(000075) 정리 단계가 없음
- 정리용 인덱스 `field_public_submission_ip_windows_cleanup_idx(updated_at)`까지 만들었지만, `purgeExpiredInboundRecords`(`retention-purge.ts:35-42`)는 billing 웹훅 창·비밀번호 창·AP inbox만 지운다. 결과적으로 IP-HMAC(가명 처리된 IP 정보) 행이 조직×IP마다 영구히 쌓인다. IPv6를 돌려 쓰면 무한히 커진다.
- 기존 `public_submission_windows`(전화번호 HMAC)도 마찬가지로 정리되지 않는다(이번 범위 이전부터 있던 문제).
- 최소 수정: 같은 함수에 `delete from field.public_submission_ip_windows where updated_at < now() - interval '15 minutes'`를 추가한다(전화번호 창도 같이).

### M3. 조직 삭제 실행이 잠금을 잡은 채 S3 I/O를 함 — 2단계 사진 삭제로 없앤 문제를 그대로 가짐
- `runOrganizationDeletionOnce`는 조직 행 FOR UPDATE(`account-deletion.ts:329`)와 `site_assets` FOR UPDATE(`:331-332`)를 잡은 트랜잭션 안에서, 사진마다 `delete` + `exists`(각 30초 timeout, 최대 50장)를 호출한다(`:346-351`).
- 최악이면 수십 분 동안 조직 행 잠금과 pool 연결 1개를 잡고 있다. 그동안 같은 조직의 outbox FK(KEY SHARE)가 필요한 기존 업무 쓰기(고객 제안 수락·취소, 고객 메시지 등)가 기다린다.
- 최소 수정: 실행 전에 남은 사진을 모두 `state='deleting'`으로 표시해 `runSiteAssetDeletionOnce`에 넘긴다. 실행기는 `site_assets`가 0건일 때만 진행하고, 아니면 `blocked: assets_pending`으로 둔다.

### M4. 삭제·정리 기능이 선택형 `retention` 워커에만 묶여 있음
- 조직 삭제 실행, 사진 2단계 삭제, 인증 메일 outbox 보존, 웹훅·비밀번호 창 정리가 모두 `retention-purge-worker.ts:43-55` 한 곳에 있다. 이 워커는 문의 S3·보존 저널 없이는 시작을 거부하고(`:16-20`), compose에서도 `profiles: [retention]`이다(`infra/field/compose.live.yaml` retention-worker).
- retention profile을 켜지 않은 배포에서는 API가 201/202를 돌려주지만 작업이 영원히 끝나지 않는다. `blocked_integration`처럼 드러나는 표시도 없다.
- 최소 수정: 짧은 정리 단계를 문의 S3·저널이 필요 없는 상시 워커(예: custom-domain/notification처럼 기본 기동)로 분리한다. 최소한 compose 머리말과 `/health/ready` 세부 정보에 이 의존을 드러낸다.

### M5(낮음~중간). 인증 메일 SMTP 전송을 요청 경로에서 기다림 + nodemailer timeout 미설정
- `sendResetPassword`/`sendVerificationEmail`이 `deliverAuthEmail`을 await한다(`auth.ts:62-73`, `email-provider.ts:101`). better-auth 1.7.5는 `advanced.backgroundTasks`가 없으면 `runInBackgroundOrAwait`로 기다린다(`better-auth/dist/api/routes/password.mjs:62-82`. 미존재 계정에는 토큰 생성만 흉내 낸다).
- 문제 1: 응답 시간 차이로 계정이 있는지 추정할 수 있다.
- 문제 2: `createTransport(url)`(`email-provider.ts:69`)이 기본 timeout(socket 10분)이라 SMTP가 지연되면 요청이 몇 분씩 매달린다.
- 최소 수정: `betterAuth({ advanced: { backgroundTasks: { handler: p => void p.catch(() => {}) } } })`를 설정하거나 outbox만 기록하고 전송은 비동기로 한다. 그리고 `createTransport(url, { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 })`로 timeout을 둔다.

### 낮음
- **L1** AP 사건 수신함의 `occurred_at` 검증이 `Date.parse`뿐이다(`ap-webhook-inbox.ts:38`). PG가 거부하는 문자열(예: `"1"`)이 오면 서명 검증을 통과한 뒤 `$9::timestamptz`에서 500이 난다. 같은 기능의 `isRfc3339`(`external-request-public-routes.ts:9-15`)를 재사용하면 된다.
- **L2** 비슷한 경로끼리 오류 코드가 다르다.
  - 카카오 전용 계정의 재인증 부족: 조직 삭제는 403 `reauth_required`(`account-deletion.ts:107`), 계정 삭제는 409 `reauth_required`(`:281`).
  - §4.12 경로: GET은 잘못된 id에 404 `external_request_not_found`(`external-request-public-routes.ts:60`), POST는 400 `invalid_customer_decision` 또는 404 `external_reservation_not_found`(`:101-118`).
- **L3** 관리자 삭제 복구 `POST /v1/admin/organization-deletions/:id/resume`(`admin.ts:94-121`)에는 Origin 검사가 없다. 다른 관리자 쓰기 경로(`retention-routes.ts:26-28`, `customer-support.ts:33-37`)는 검사한다. 그런데 그 허용 목록에는 `http://localhost:3002`·`127.0.0.1:3002`가 들어 있다. 이번 범위에서 mock 전용 503 게이트를 없앴기 때문에 이제 live에서도 이 localhost 허용이 효력을 가진다.
- **L4** 마이그레이션 롤백 주석이 없다: 000075, 000078(`oauthResource.allowedScopes` 데이터 변경 포함. 되돌릴 때 scope 제거 SQL 필요), 000079.
- **L5** `FIELD_LOG_LEVEL`이 `infra/field/.env.live.example`에 없다. `docs/CODEX_HANDOFF.md:29`는 그 파일을 참조하라고 한다. 소스에서 읽는 나머지 `FIELD_*` 운영 변수는 모두 예시 파일에 있다.
- **L6** `test:unit` 누락(이번 범위 이전부터).
  - `test/route-key-ui-fence.test.ts`, `test/site-font.test.ts`는 어떤 스크립트·CI에서도 실행되지 않는다(직접 실행 시 5/5 통과).
  - `site-media.store.test.ts`·`field-openai.adapter.test.ts`는 spike 스크립트에서만 실행된다.
  - 새 파일 `site-media-store.test.ts`와 기존 `site-media.store.test.ts`는 이름이 거의 같고 내용은 다르다.
- **L7** 사용처가 자기 파일뿐인 export: `DELETION_COOLING_DAYS`·`organizationDeletionPreconditions`·`accountDeletionBlockers`·`ownedOrganizations`(account-deletion.ts), `SENSITIVE_HEADER_NAMES`·`requestIdFromHeaders`(logging.ts), `SHUTDOWN_TIMEOUT_MS`, `FIELD_TO_AP_SIGNATURE_PREFIX`, `createMockEmailProvider`·`createBlockedEmailProvider`, `FIELD_SITE_HEALTH_PATH`. 또 테스트 전용 계측 `lifecycleJournalMetrics`가 운영 코드에 있다(`oauth-lifecycle-journal.ts:42`).
- **L8** `subscriptionAccess`가 테스트 편의를 위해 모든 호출에서 `to_regclass` 쿼리를 1회 더 한다(`subscription-access.ts:8`). 운영 핫패스에 쿼리 2개가 추가된다.
- **L9** `resolvedCustomHost`(`custom-domains.ts:52-60`), 곧 `GET /v1/public/site-hosts/:hostname`은 삭제 예약 조직을 거르지 않는다. ask/health(`custom-domain-routes.ts:107-116`)는 거른다. 사이트 본문은 `sites.ts:711`에서 404라 노출되는 것은 slug·조직 ID뿐이다.
- **L10** 사진 삭제가 멈추면(`deletion_next_attempt_at='infinity'`) 운영자 복구 API가 없다. 조직 삭제에는 `admin.ts`의 resume이 있다.
- **L11 (정보)** 카카오 전용 계정은 2FA를 등록할 수 없다. twoFactor `allowPasswordless`가 미설정이라 better-auth `shouldRequirePassword`가 true다. 그래서 비mock 관리자가 될 수 없다. 카카오 2FA 브리지는 비밀번호 재설정으로 credential을 추가한 계정에만 실제로 해당한다. 문서화가 필요하다.

## 보안 관련 테스트 공백
- 삭제 예약 중 checkout·trial·AP 연결 시작·selection 생성이 막히는지(H1. 코드도 없음).
- 계정 삭제 차단 `oauth_grants_active`, `admin_membership_required_removal`, 조직 전제 조건 `connections_active`. 삭제된 조직에 남은 통합 grant(M1).
- AP 수신함 `event_id_conflict`(같은 event_id에 본문이나 연결이 다른 경우), 알림 경로 `route_transfer_pending`·`field_route_suspended` 분기.
- IP 창 정리(M2), 관리자 resume의 cross-origin 거부(L3).

## 확인했고 문제 없음
- **마이그레이션 순서**: node-pg-migrate 9.0.0 runner의 `checkOrder`는 기본으로 켜져 있고(`dist/bundle/index.js:3534-3541,3578`), `tools/run-migrations.mjs`도 끄지 않는다. 따라서 076만 적용된 DB라면 "Not run migration 000075 is preceding already run migration 000076"로 거부된다. 실제로는 000075가 a745058에서 000076(c22b288)보다 먼저 커밋됐다. mock DB `pgmigrations`도 id 75→83이 순서대로 적용돼 있다. 커밋되지 않은 중간 트리로 배포한 DB만 위험하다.
- **check 제약 vs 실제로 쓰는 상태값**: 조직 삭제 status 3종, inbox state/error_code/processed_at, billing 웹훅 outcome/order_id/event_type, site_assets 삭제 상태 check, 고객 결정 result_state가 모두 일치한다. withdraw는 `proposed`에서만 허용되고 이때 `confirmed_start_at`은 null이라 결과는 `canceled`다.
- **v2 서명**: Field→AP 사건·facts·revoke 발신과 수신 2곳(수신함·revoke 수신기)에 방향 접두사가 적용됐다. 반사 서명 401, v1 전환 설정도 테스트가 있다. `notification-status`/`route-close`는 계약상 의도적으로 v1이고(`contracts/CONTRACT_NOTES.md:35`), AP 쪽도 같다.
- **production 가드**: server/auth/worker/retention/ap-event/route-key는 `assertProductionProfile`을 쓴다. billing×3·custom-domain·notification은 같은 효과의 인라인 검사다. CLI 5종은 mock과 로컬 DB 이름을 강제한다.
- **trustProxy**: 기본 loopback, compose에서는 서브넷만 신뢰한다. IP 창은 모두 `request.ip`를 쓰고, 로그에는 IP를 넣지 않는다.
- **2단계 사진 삭제 vs 조직 삭제**: 잠금 순서가 조직→사진으로 같다. 조직 삭제가 먼저 지운 행은 워커가 0행으로 처리한다. `deleting` 사진은 초안·공개·공개 조회·리소스 허용에서 모두 빠진다.
- **자체 도메인 vs 삭제**: ask/health가 삭제 예약·완료 조직을 거부하고, 실행기는 공용 `disconnectSiteDomain`으로 해제한다. 테스트가 있다.
- **scope 목록**: `auth.ts` fieldScopes·clientRegistrationAllowedScopes, `integrator-routes.ts` allowedScopes, `integrator-auth.ts` 타입, 계약 enum, capabilities가 서로 일치한다. `connection.revoke`는 의도적으로 등록 불가다.
- **해제 처리 공유**: 수신함의 `connection.revoked`는 서명 revoke 수신기와 같은 `commitReceivedApRevocation`을 쓴다.
- **메일 outbox**: 계정 삭제는 모든 상태의 주소를 익명화한다. 보존 정리는 7일 지난 sent를 익명화하고 30일/90일 뒤 삭제한다. 비mock에서는 토큰을 가린다.
- **로그**: 마스킹 테스트가 있고, 라우트에서 남기는 로그 문구는 모두 고정 문자열이다.
- **단위 테스트 등록**: 새 단위 테스트 9개는 모두 `test:unit`에 있다.
- **잔여물**: `.orig`·TODO·디버그 출력이 없다(console.log는 변경되지 않은 notification worker에만 있음).
- **`/health/ready`**: `{product,status,integrations?:{email}}` 형태다. compose healthcheck는 product/status만 보므로 호환된다.
- **카탈로그 게이트**: 공개된 사이트가 있을 때만 승인 단계에서 검사하고, 공개 단계에서도 검사한다. 템플릿 시작은 최신 승인 release 값만 쓴다.
