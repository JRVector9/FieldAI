# AP API(apps/agent-api) 종합 감사 — 84af59a..13bcd31 (6커밋)

범위: `apps/agent-api` 전체 diff(신규 파일은 전문), migration 000082~000093, compose/env 예시 대조. 파일 수정 없음, 테스트 미실행(코드 읽기로 검증).
심각도: P1 = 운영에서 기능이 영구히 막히거나 돈·개인정보 문제, P2 = 기능 간 불일치로 잘못된 상태·우회 필요, P3 = 일관성·문서·위생.

---

## P1

### P1-1. `delivery_unknown`이 영구 상태가 되면서 조직 삭제가 영원히 막힘 (A6 × 조직 삭제)
- A6 이후 reconcile은 동의 24시간이 지나면 아무것도 바꾸지 않고 202를 반환한다(`src/field-actions.ts:680-686`). 연결을 해제하면 `fieldResourceForCustomer`가 실패해 reconcile 자체가 불가능하다(`field-actions.ts:667-669`). 이 상태에서 빠져나가는 운영자/owner 경로가 없다(`grep delivery_unknown` 결과: 상태를 바꾸는 곳은 `advanceAction`뿐).
- 조직 삭제 전제 조건은 `state in ('sending','delivery_unknown')`를 0건으로 요구한다(`src/account-deletion.ts:45`). 예약 시점(`:229-231`)과 실행 시점(`:349-353`, 1시간마다 `blocked`) 모두 막힌다. 고객의 by-source 404가 한 번이라도 있었던 조직은 삭제 요청을 끝낼 수 없다.
- 보존 정책도 같은 행 때문에 `external_pending`으로 영구 보류된다(`src/work-retention.ts:22`).
- 최소 수정: (a) 연결이 `revoked`이고 동의가 24시간을 넘긴 `delivery_unknown`은 전제 조건에서 빼거나, (b) 운영자 전용 `POST /v1/admin/field-actions/:id/close-unknown`(사유 필수, `error_code='operator_closed_unknown'`, 새 업무 생성 금지 계약 유지)을 추가해 `rejected`가 아닌 별도 종결 상태로 닫는다. (b)는 상태 check 제약 migration이 필요하다.

### P1-2. 조직 삭제 실행·PII 보존 정리가 S3 사진 저장소가 있어야만 도는 worker에 묶여 있음
- `runOrganizationDeletionOnce`, `purgeAgentEmailOutbox`(메일 주소 7일 익명화·30/90일 삭제), `purgeBillingWebhookRecords`, `purgeAccountDeletionPasswordWindows`, `purgeAckedFieldAgentEvents`는 `retention-purge-worker.ts`에서만 호출된다(`src/retention-purge-worker.ts:32-47`).
- 이 worker는 S3 사진 저장소와 보존 저널이 없으면 부팅을 거부한다(`:17-19`). compose에서도 `profiles: [retention]`이라 기본으로 뜨지 않는다(`infra/agent/compose.live.yaml:148-151`). `.env.live.example`도 S3를 `[blocked_integration]`(선택)으로 표시한다.
- 결과: 사진 첨부를 쓰지 않는 운영 환경에서는 14일 유예가 지나도 조직 삭제가 실행되지 않는다. 화면에는 계속 `scheduled`가 보인다. 인증 메일 주소 보존 규칙도 적용되지 않는다.
- 최소 수정: 위 5단계를 media 의존이 없는 별도 housekeeping 루프(예: `field-event-worker`처럼 항상 뜨는 worker, 또는 새 `start:housekeeping`)로 옮긴다. 옮기기 전까지는 실행기가 없으면 삭제 예약을 503 `blocked_integration`으로 거절하거나 `/health/ready`에 표시한다.

### P1-3. 삭제 유예(`deletion_scheduled`) 중에도 유료 결제·Field 연결을 새로 시작할 수 있음
- `subscriptionAccess`는 삭제 예약을 유료 구독보다 먼저 확인해 `cleanup_only`를 반환한다(`src/subscription-access.ts:6-10`).
- 그런데 `POST /v1/subscription/checkout`(`src/billing-consent-routes.ts:68-115`)은 삭제 예약 여부를 보지 않고 결제 동의·인증을 만든다. 첫 결제 후 owner는 돈을 냈는데도 접근이 `deletion_scheduled`로 막힌다. 삭제 실행은 `paid_subscription_active`로 1시간마다 `blocked` 상태가 된다.
- `POST /v1/connections/field/start`(`src/field-connector.ts:495-524`)도 같은 이유로 `connections_active` 차단을 만든다.
- 최소 수정: 두 route의 owner 확인 직후 `organization_deletion_requests`의 `scheduled/executed`를 조회하고, 있으면 409 `deletion_scheduled`를 반환한다(`rejectExpiredTrial`과 같은 본문 형태). checkout은 트랜잭션 안 `lockOwner` 뒤에서 다시 확인한다.

---

## P2

### P2-1. AP가 발급한 OAuth grant(외부 통합)가 조직 삭제 전제·실행에서 빠져 계정 삭제가 막힘
- 조직 삭제 전제는 AP→Field 연결(`ap.field_connections`)만 센다(`account-deletion.ts:44`). AP가 외부 client에 발급한 `ap.oauth_selections`/`oauthRefreshToken`은 확인하지도, 실행 때 회수하지도 않는다(`:361-398`).
- 실행 뒤에는 membership이 삭제되어 owner가 grant를 회수할 수 없다(`src/integrator-routes.ts:163-167`가 owner membership을 요구).
- 계정 삭제는 `oauth_grants_active`(살아 있는 refresh token)로 막힌다(`account-deletion.ts:75`). 통합이 refresh를 계속 돌리면 영구히 막힌다.
- 최소 수정: 전제 조건에 `integrator_grants_active`(해당 조직의 `revoked_at is null` selection)를 추가한다. 또는 실행 단계에서 `recordAgentRevocation`(저널)과 함께 selection·token을 회수한다.

### P2-2. 계정 삭제가 매체(Distribution) 소유·구성원을 무시함, 검증된 origin은 영구 점유
- `accountDeletionBlockers`(`account-deletion.ts:69-80`)는 조직 owner·관리자·grant만 본다. `ap.publishers.owner_user_id`, `ap.publisher_memberships`(000022)는 그대로 남는다. 매체 슬롯·카드 노출은 계속되고 관리할 사람이 없다.
- 000083 이후 `verified_at is not null` 행은 origin을 전역 unique로 점유한다. `verified_until`(7일, `src/publishers.ts:193`)이 지나도 `verified_at`을 비우는 경로가 없다(grep 0건). 탈퇴·방치된 매체가 도메인을 영구히 막는다. A17의 "실제 소유자가 등록할 수 있다"는 미검증 행에만 해당한다.
- 최소 수정: blocker `publisher_owner_required`를 추가하고 비owner 매체 membership은 계정 삭제 때 지운다. 부분 unique index 조건을 만료 반영 방식으로 바꾸거나, 만료된 검증 행의 `verified_at`을 해제하는 단계를 둔다.

### P2-3. 계정·조직 삭제가 백업 복원 재적용 원장에 없음
- `docs/04_SECURITY_OPERATIONS_RELEASE.md:102`는 "복원 후 삭제·revoke 원장 재적용"을 요구한다. revoke(`revocation-journal`)와 보존 삭제(`retention-journal`)에는 저널이 있다.
- 계정 익명화(`account-deletion.ts:313-329`)와 조직 삭제 실행(`:399-401`)은 DB 행으로만 남는다. PITR이나 백업 복원을 하면 익명화된 이메일·이름, 지운 지식·연락처 암호문이 되살아난다.
- 최소 수정: 실행 커밋 전에 보존 저널(또는 별도 deletion 저널)에 `{kind:'account'|'organization', id, executedAt}`를 fsync로 append한다. `retention-restore-cli` 재적용 경로에 같은 SQL을 추가한다.

### P2-4. Field 알림 경로 응답의 조합 검증 부재 → 수신함 전체 정지(poison row)
- `readFieldNotificationRoute`는 owner·allowed·reason을 각각만 검증한다(`src/field-actions.ts:156-163`). 예를 들어 `owner:'field', allowed:false, reason:'ap_route_generation_1'`이나 `owner:'ap', allowed:false, reason:'ap_route_generation_1'`이 통과한다.
- `recordFieldReservationEvent`는 그 reason을 `suppression_reason`에 넣는다(`:177`, `:194-198`). 000093 check에 없는 값이라 insert가 실패한다.
- 수신함 처리는 예외 때 행 상태·`next_attempt_at`을 바꾸지 않는다(`src/field-event-inbox.ts:254-259`, `:355`). worker는 2초 뒤 전역 정렬(`order by revision,received_at`)상 같은 첫 행을 다시 집는다(`src/field-event-worker.ts:38-41`). 그 결과 모든 조직의 Field 사건 처리가 멈춘다.
- 현재 Field는 올바른 조합만 보낸다(`apps/field-api/src/external-request-public-routes.ts:201-204`). 그래서 잠재 결함이지만 제품 경계에서는 상대를 신뢰하지 않아야 한다.
- 최소 수정: reason과 owner·allowed 조합을 고정한다(`ap_route_generation_1`⇔ap·true, `route_transfer_pending`⇔ap·false, `field_route_*`⇔field·false). 그 밖의 조합은 `unknownRoute`로 처리한다. 또 수신함 행 처리 예외 시 `error_code`/`next_attempt_at`을 별도 커넥션으로 미룬다.

### P2-5. `scope_missing` 연결에서 고객 결정 버튼이 활성화됨 (API 형태 문제)
- `GET /v1/inquiries/:id/field-actions/:actionId`는 `field.requests.read`(기본 scope)만으로 Field를 읽는다(`src/field-customer-decisions.ts:176-177`). 그래서 `field.proposals.respond`가 없는 연결도 `readState:'current'`와 제안을 반환한다. 클릭하면 POST가 비로소 403 `scope_missing`을 반환한다(`:233-237`).
- 웹은 `readState==='scope_missing'`을 "제안 응답 권한 동의가 없음"으로 표시한다(`apps/agent-web/src/agent-field-action.tsx:59`). 하지만 GET의 `scope_missing`은 실제로 `requests.read`가 없다는 뜻이다(`accessError`, `:27-30`). 의미가 어긋난다. AGENTS §6의 "비활성 사유" 요구도 어긋난다.
- 최소 수정: GET 응답에 `canRespond: connection.scopes.includes('field.proposals.respond')`를 추가한다. 연결 scope는 `field_connections.scopes`에서 읽는다. 웹은 이 값으로 수락/철회를 비활성화하고 사유를 표시한다.

### P2-6. 직접 응대(human_active)가 owner 답변 한 번에 기록 없이 끝남
- `ownerMessage`는 상태와 무관하게 `waiting_customer`로 바꾼다(`src/inquiries.ts:672-673`). `human_release` 사건(000088)이 없고 revision도 올리지 않는다. 그 뒤 고객 후속 메시지는 `needs_owner`가 된다(`:316`). take-over 행위자 원장에 종료가 비어 있고, "직접 응대 중" 의미는 첫 답변까지만 유지된다(`test/inquiry-human-active.db.test.ts:142-145`가 이 동작을 단언).
- 최소 수정: `row.state==='human_active'`이면 답변 뒤에도 `human_active`를 유지한다(고객 메시지 규칙 `:316`과 대칭). 의도가 종료라면 같은 트랜잭션에서 `human_release` 사건(actor=답변자)과 revision+1을 기록한다.

### P2-7. 삭제 실행된 조직에도 고객 메시지가 계속 접수됨
- `GET /v1/inquiries/:id`는 `organizationDeleted`를 반환한다(`inquiries.ts:254-263`). 하지만 `POST /v1/inquiries/:id/messages`(`:289-330`)는 `deleted_at`을 보지 않고 메시지를 저장하고, 받을 사람이 없는 owner 알림 사건(outbox)을 만든다.
- 최소 수정: `for update` 조회에 `join ap.organizations o … o.deleted_at`을 넣고, 삭제됐으면 409 `organization_deleted`를 반환한다.

### P2-8. AP→Field 사건 발신함이 수신함을 굶길 수 있고, blocked 행은 정리되지 않음
- `deliverFieldAgentEventOnce`는 `review_required`가 아닌 연결의 행을 최대 300초 backoff로 무기한 `retry`한다(`src/field-webhook-sender.ts:80`). worker는 이 단계를 수신함보다 먼저 `continue`로 반복한다(`field-event-worker.ts:34`). Field가 내려가 행마다 8초씩 걸리면 고객 알림 수신함 처리가 그만큼 늦어진다.
- `purgeAckedFieldAgentEvents`는 `acked`만 지운다(`:114-121`). `blocked` 행은 영구히 남는다.
- 최소 수정: 한 루프에서 발신함 처리 수를 1건으로 제한하고 이어서 수신함을 처리하거나 순서를 바꾼다. degraded 연결의 행에는 상한(예: 24시간 후 blocked)을 둔다. blocked 행에도 보존 기간을 적용한다.

---

## P3

1. **`retentionAdminFor`가 live에서도 `http://localhost:3001`·`http://127.0.0.1:3001` origin을 허용**(`src/retention-routes.ts:29-31`). 예전에는 mock 전용 게이트 뒤라 무해했지만, MFA 게이트로 바뀌면서 non-mock 경로가 됐다. 결제 플랜·환불·보존 작업의 관리자 변경 경로가 이 함수를 쓴다(`billing-routes.ts:6`, `billing-refund-routes.ts:5`). 수정: localhost 두 개는 `AP_PROFILE==='mock'`일 때만 넣는다.
2. **`POST /v1/admin/organization-deletions/:id/resume`에 Origin 검사가 없음**(`src/admin.ts:96-120`). 다른 관리자 변경 경로(`customer-support.ts:31-33`, `retention-routes.ts:29`)와 다르다. SameSite 쿠키로 완화되지만 일관성을 위해 같은 origin 검사를 넣는다.
3. **카카오 전용 관리자는 2FA를 등록할 수 없음**: `twoFactor()`에 `allowPasswordless`가 없고(`src/auth.ts:35`) 웹 등록 화면은 비밀번호를 요구한다(`agent-web/src/AgentAdminMfa.tsx:38`). 그래서 `requireAdmin`이 계속 `mfa_required`를 반환한다. 비밀번호 재설정을 하면 credential이 생기므로(better-auth `resetPassword`) 우회는 가능하다. 운영 문서나 화면에 이 절차를 안내한다.
4. **AP `server.ts` 종료 순서**: `Promise.all([app.close(), pool.end(), authPool.end()])`(`src/server.ts:57-61`). Field는 F12에서 app→pool 순차 처리로 고쳤지만 AP는 남아 있다.
5. **오프라인 CLI 5종은 `assertProductionProfile`를 호출하지 않음**(`oauth-lifecycle-cli.ts:9`, `retention-checkpoint-cli.ts:5`, `retention-restore-cli.ts:20`, `revocation-checkpoint-cli.ts:6`, `revocation-restore-cli.ts:13`). mock만 허용하므로 live에서는 거부된다. 다만 `NODE_ENV=production`+`AP_PROFILE=mock` 조합은 통과한다. 한 줄씩 추가하면 다른 진입점과 같아진다.
6. **`.env.live.example`에 `AP_LOG_LEVEL`이 없음**: 코드(`src/logging.ts:68-72`)와 docs/04:123은 문서화되어 있다. 그 밖의 `process.env.AP_*` 읽기는 예시 파일 또는 compose 고정값과 모두 맞는다(CLI 전용 값은 주석 블록에 있다).
7. **`subscriptionAccess`가 매 호출마다 `to_regclass` 조회**(`subscription-access.ts:8`): 이전 스키마 migration 테스트를 위한 코드가 모든 요청 경로에 쿼리 한 번을 더한다. 테스트 쪽에서 처리하거나 결과를 모듈 상수로 캐시한다.
8. **오류 코드 불일치**: take-over/release의 상태 불일치는 409 `invalid_inquiry_state`(`inquiries.ts:570-573`), close/spam은 `inquiry_changed`다. 조직 삭제 `confirmText`는 정확히 일치해야 하고(`account-deletion.ts:208`), 계정 삭제는 trim+소문자 비교다(`:306`). 고객 결정의 `blocked_integration`(503)은 `remote_unavailable`로 뭉개진다(`field-customer-decisions.ts:235-237`).
9. **migration 롤백 주석 누락**: 000082, 000086(나머지 10개에는 있음). 000090 `field_agent_event_outbox`의 `blocked` 행에는 보존 규칙이 없다(P2-8).
10. **토스 웹훅 IP 창 120회/15분**(`billing-webhook.ts:7`): 토스는 소수 IP에서 보내므로 거래가 많으면 정상 힌트가 429로 버려진다. 힌트 전용이라 영향은 작다. 결정 필요 사항으로 기록한다.
11. **사용처 없는 export**: `AUTH_REJECT_RETRY_LIMIT`, `DELETION_COOLING_DAYS`, `REAUTH_WINDOW_MINUTES`, `accountDeletionBlockers`, `organizationDeletionPreconditions`, `ownedOrganizations`, `fieldDecisionScopes`, `requestIdFromHeaders`, `SENSITIVE_HEADER_NAMES`, `createBlockedEmailProvider`, `createMockEmailProvider`, `TossWebhookHint`, `KakaoProviderState`, `AdminActor` 등은 같은 파일 안에서만 쓰인다. 기능 영향은 없다. `.orig`/`.rej`·TODO/FIXME·`console.log` 추가는 없다.

---

## 테스트 공백
- A5 토큰 갱신 임대(CAS): 동시 요청 시 Field refresh가 1회만 호출되고 pool을 쥐지 않는지 검증하는 테스트가 없다(`token_refresh_lease` 참조 0건).
- P1-1·P1-3·P2-1·P2-2 교차 시나리오: delivery_unknown + 조직 삭제, 유예 중 checkout/연결 시작, 조직 삭제 후 통합 grant와 계정 삭제(`oauth_grants_active` 참조 0건), 매체 owner 계정 삭제.
- human_active: 테스트가 1개(`inquiry-human-active.db.test.ts:18`)로 정상 흐름 위주다. 다른 조직 사용자·customer 키·editor 권한·spam 상태의 take-over 같은 거부 경로가 없다.
- 고객 결정: `customer_proof_expired` 재키(rekey) 경로, `AUTH_REJECT_RETRY_LIMIT` 경계(5회째 blocked)가 테스트되지 않았다.
- 알림 경로: 잘못된 owner·allowed·reason 조합(P2-4), 수신함 예외 시 다음 행 진행 여부를 검증하지 않는다.
- 로깅: `requestIdFromHeaders`(외부 `x-request-id` 수용 규칙)가 테스트되지 않았다.

---

## 확인했고 문제없는 항목
- 프로덕션 프로필 가드: `server.ts`·`auth.ts`·`field-event-worker.ts`·`retention-purge-worker.ts`는 `assertProductionProfile`을 쓴다. billing worker 3종과 notification worker는 같은 의미의 인라인 검사를 한다. `source-refresh-worker.ts`·`field-connection-revoke-worker.ts`는 진입점이 아닌 모듈이다.
- `test:unit` 목록에 새 비DB 테스트(billing-webhook, production-profile, email-provider.adapter, logging, image-format)가 모두 있다. DB 테스트는 `run-db-suite.mjs`가 `*.db.test.ts`를 자동으로 찾는다.
- worker 등록: 보존 worker에는 삭제 실행·웹훅/시도창·outbox·acked 정리가, field-event-worker에는 발신함·경로 캐시가 등록되어 있다(위치 문제는 P1-2).
- migration 000082~000093: 삭제·재생성하는 제약 이름이 실제 이름과 일치한다. 코드가 쓰는 값과 check 제약이 맞는다(email_outbox 상태와 sent_at, 삭제 요청 상태·시각, 결정 상태와 result_revision, 웹훅 정규식, 시도창 상한 6/1001, suppression reason, 000088 사건 종류). 새 컬럼은 모두 사용된다.
- trustProxy: compose가 `AP_TRUST_PROXY` 기본값을 내부 대역으로 둔다(`compose.live.yaml:22`). edge가 XFF를 덧붙이는 구조에서 `request.ip` 기반 한도(공개 접수·웹훅)가 실제 고객 IP로 잡힌다.
- 로깅: 라우트 패턴 URL, 인증 헤더와 본문 redact, 오류 메시지·스택 마스킹이 적용된다. 새 route 중 본문이나 PII를 로그로 남기는 곳은 없다(`field-event-inbox.ts:78`은 설정값만 기록).
- lifecycle 캐시와 복원 CLI: `verifiedEntries`가 servingProofs를 지우고 강제로 다시 읽는다. 식별값에 postmaster 시작 시각·timeline이 들어가고 최대 유효 시간은 60초다. TRUNCATE 가드(000092)가 있다.
- 서명 v2: Field 사건 수신, 해제 수신·발신, AP→Field 사건 발신이 모두 방향 접두사를 쓴다. route-close는 단방향 전용 접미사라 의도적으로 바꾸지 않았다(`contracts/CONTRACT_NOTES.md:35`).
- sync·push 알림 경로 vs 해제·종료 원장: sync는 `review_required` 연결에서만 동작한다(`field-connector.ts:236`). 발송 실행은 route closure를 확인한다(`notification-delivery-execution.ts:11`). 수신함은 잠금 아래에서 다시 검사한다.
- 계정 삭제 vs outbox 보존: 수신 주소 익명화와 7/30/90일 규칙이 겹쳐도 충돌하지 않는다. 메일 본문에는 주소가 없다(`email-provider.ts:76-88`).
- 웹훅 수신함 vs 삭제: 원문·PII를 저장하지 않으며(sha256·order_id) 삭제 대상이 아니다.
- `/health/ready` 형태(`{product,status,integrations:{email}}`)가 compose healthcheck와 spike 기대값과 맞는다.
- 카카오: `accountLinking:false`, 미인증 이메일 거부, 2FA 복귀 URL의 open redirect·userinfo 차단이 있다. 계정 삭제는 카카오 account 행까지 삭제한다.
- 체험 정책: 체험 행을 프로필과 무관하게 인정하고, 삭제 예약을 유료·체험보다 먼저 판정한다(P1-3은 이 순서를 반영하지 않은 route의 문제).
