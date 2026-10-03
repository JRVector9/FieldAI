# AP 파트 리뷰 (HEAD b5df6af + 커밋 안 된 변경) — apps/agent-api, apps/agent-web, pnpm-workspace/lock

검토 범위: `git diff HEAD`(수정 21개 파일)와 새 파일 9개(전체 정독). Field 쪽은 계약 확인용으로만 읽음(`external-request-public-routes.ts`, `ap-webhook-inbox.ts`, `contracts/field-integrator-v1.openapi.json` preview.9).
직접 실행한 검사(격리 DB, `node tools/run-db-suite.mjs agent …`):
- field-customer-decisions 1/1, account-deletion 6/6, oauth-lifecycle 13/13, inquiry-human-active 1/1, email-outbox-retention 1/1 통과
- agent-web `field-proposal`·`account-deletion` 단위 테스트 6/6 통과
- `tsc --noEmit`(agent-api, agent-web)와 변경 경로 eslint는 출력 없이 통과

아래 결함은 테스트로 잡히지 않는 경로를 코드에서 직접 따라가 확인한 것입니다.

---

## 결함 (심각도 순)

### 1. [높음] 고객 결정이 "결과 미상"으로 영구히 막힐 수 있음 — UI·API 어디에서도 풀 수 없음
- `apps/agent-api/src/field-customer-decisions.ts:157-164`: 같은 action에 `pending` 결정이 하나라도 있으면, 다른 (결정, revision) 요청은 전부 409 `prior_decision_unknown`으로 거절됩니다.
- 이 pending을 푸는 방법은 같은 (decision, proposalRevision)을 다시 보내는 것뿐입니다. 그런데 웹(`apps/agent-web/src/agent-field-action.tsx:90,109`, `decide()` 218)은 **현재 제안의 revision**만 보냅니다. 409 본문에 담긴 `decision`·`proposalRevision`도 쓰지 않습니다.
- 재현 경로:
  1. rev N 수락 요청이 타임아웃(202, pending) — 실제로는 Field에 저장됨
  2. 사업자가 확정한 뒤 변경 제안(rev M)을 보냄
  3. 고객이 rev M 수락을 누르면 계속 409가 납니다. 안내 문구("같은 버튼을 다시 눌러 주세요")대로 해도 풀리지 않습니다.
- 첫 수락 뒤 상태가 `customer_accepted`가 되면 수락 버튼이 비활성(`acceptBlocked`)이 됩니다. 그래서 "이전 수락 결과를 확인하지 못했습니다" 배너가 영구히 남습니다.
- 관련 원인 `:252-257`: Field 401/403/404는 Field가 **저장 전에 확실히 거절한** 경우인데도 `keep()`으로 pending을 유지합니다. 404 `external_reservation_not_found`는 영구 오류여서 해당 action의 모든 결정을 막습니다.
- 최소 수정 (둘 다 권장):
  - (a) 새 결정 전에 서버가 남은 pending 행을 저장된 키·본문으로 먼저 재전송해서 해소합니다. Field는 같은 키에 200 재응답, 미저장이면 `proposal_mismatch`/`customer_proof_expired`로 응답합니다. 또는 웹이 409 본문의 `decision`·`proposalRevision`으로 재확인 버튼을 제공합니다.
  - (b) 401/403/404 응답은 `state='rejected'`(error_code는 이유 코드)로 닫고, 403·401은 같은 키로 재시도 가능하게 합니다(`customer_proof_expired`처럼 재키 허용).

### 2. [중간~높음] 알림 경로를 일시적으로 확인하지 못하면 AP 고객 알림을 영구히 생략함 — 두 제품 모두 알림을 보내지 않음
- `apps/agent-api/src/field-actions.ts:137-153`: 아래 경우는 모두 `route_unknown`으로 처리됩니다.
  - `fieldResourceForCustomer`가 403 외의 이유로 실패: 503(`/me` 타임아웃·연결 일시 장애), 404
  - Field route 응답이 5xx이거나 타임아웃
- 그 결과 `:161,183`에서 `notification_events`가 `not_applicable`/`route_unknown`으로 **한 번만** 기록되고 끝납니다.
- 이 행을 다시 평가하는 코드가 없습니다(`grep route_unknown` 결과 이 파일뿐). 사건 미러링도 1회라서 다시 시도되지 않습니다.
- 실제 경로가 세대 1(AP 담당)이었다면 Field도 보내지 않으므로, "하나의 사건은 한 제품만 알림" 규칙이 "어느 제품도 보내지 않음"으로 깨집니다.
- 활성 연결에서는 사실상 항상 세대 1(AP 허용)입니다. 세대 2 전환은 연결 해제 뒤에만 생깁니다. 그래서 이 확인이 실제로 바꾸는 결과는 대부분 "일시 장애 → 영구 생략"입니다.
- 수정: 확인 실패는 `unknown`(재확인 대기) 상태로 남기고, 다음 sync나 작업자가 경로를 다시 읽어 `blocked_integration` 또는 생략으로 확정해야 합니다. 대안으로, 경로 확인에 실패하면 미러링 자체를 rollback하고 503을 돌려 다음 sync에서 다시 시도하게 합니다.
- 부수 불일치(낮음):
  - `:168`의 outbox payload는 `notificationOwnerProduct:'field'`인데, 같은 트랜잭션의 `field_reservation_events.customer_notification_owner_product`(`:173`)는 항상 `'ap'`입니다.
  - push 경로(`field-event-inbox.ts:269`)는 경로를 보지 않고 Field 사건의 `notification_owner_product`만 믿습니다. 그래서 `route_transfer_pending` 생략은 pull 경로에서만 일어납니다.

### 3. [중간] 새 동의에서 preview.9 scope를 항상 요청함 — Field OAuth client 등록이 갱신되지 않은 환경에서는 신규 연결이 모두 실패
- `apps/agent-api/src/field-connector.ts:23`이 authorize `scope`에 `field.proposals.respond`·`field.notification_route.read`를 항상 넣습니다.
- better-auth oauth-provider 1.7.5 authorize(`authorize-*.mjs:5556-5562`)는 요청 scope가 `client.scopes`에 없으면 즉시 `invalid_scope`로 redirect합니다.
- 현재 mock DB는 `tools/setup-mock-field-connector.mjs`가 갱신했지만, sandbox/live에 등록된 기존 client는 갱신되지 않습니다. 이 상태로 AP를 먼저 배포하면 "필수 아님"이라고 적힌 scope 때문에 **모든 신규 Field 연결**이 막힙니다.
- 수정 방안: 배포 순서(Field client scope 갱신 → AP 배포)를 ADR/릴리스 게이트에 명시합니다. 또는 callback이 `invalid_scope`를 받으면 기본 scope로 다시 요청하게 합니다.

### 4. [중간] lifecycle 서빙 검사 캐시가 같은 oid의 물리 복원·failover와 트리거 우회를 놓침
- `apps/agent-api/src/oauth-lifecycle-journal.ts:158-164`의 빠른 통과 조건: `(DB oid, receipts 테이블 oid, namespace) + journal 배열 동일 + receipt 수 동일`.
- 토큰 폐기는 `oauth-lifecycle-provider.ts:27-29`에서 **receipt/tombstone 커밋(tx1)과 토큰 revoke(tx2)가 별도 트랜잭션**입니다.
- tx1만 반영된 시점으로 물리 복제본 failover나 PITR이 일어나면 다음이 모두 같습니다.
  - DB·테이블 oid
  - receipt 수
  - journal
- 이때 캐시는 추가 조회 없이 통과합니다. revoke되지 않은 토큰이 남아 있어도 서빙이 계속되고, 기존 코드는 매 요청마다 이를 잡았습니다.
- 운영자가 `DISABLE TRIGGER`나 `session_replication_role=replica`로 POL02를 우회한 경우도 마찬가지로 잡지 못합니다.
- 기존 테스트의 복원 시나리오는 pg_restore로 **새 DB**(새 oid)에 복원하는 경우만 다룹니다.
- 수정: identity에 `pg_postmaster_start_time()`을 추가합니다. 가능하면 `pg_control_checkpoint().timeline_id`도 넣습니다. 그리고 캐시에 최대 유효 시간(예: 30~60초)을 두어 전체 검사를 주기적으로 강제합니다.
- 보조(낮음): `:76-77`은 디렉터리 stamp가 같으면 `readdir`를 건너뜁니다. 디렉터리 mtime 해상도가 낮은 FS(일부 네트워크/컨테이너 볼륨)에서는 같은 틱에 추가된 파일을 놓칠 수 있습니다. 비용이 작으니 `readdir`는 항상 실행하고, 파일별 stamp 재사용만 유지하는 편이 안전합니다.
- 같은 크기 변조는 정상 차단됩니다. 파일 ctime/ino 변경 → 다시 읽기 → sha 비교로 `continuity lost`가 납니다. 서명 없는 변조는 `unseal`에서 실패합니다.

### 5. [낮음] 운영자 재실행 감사(운영자 userId·사유 원문)가 조직의 모든 구성원에게 노출됨
- `apps/agent-api/src/admin.ts:111-115`가 `steps.operatorResumes`에 `actorUserId`·`reason`을 넣습니다.
- `account-deletion.ts:29`의 `view()`는 `steps`를 그대로 반환합니다. `GET /v1/organizations/current/deletion-requests/current`는 owner가 아닌 구성원(memberFor)에게도 이 값을 돌려줍니다.
- 수정: 고객용 view에서는 `operatorResumes`의 actorUserId·reason을 빼고 `{at, previousError}` 정도만 노출합니다.

### 6. [낮음] AP→Field 서명 사건 발신기
- `field-webhook-sender.ts:99`: Field 401은 시계 오차(±5분)에서도 발생하는데, 영구 `blocked` 처리됩니다. 시간 오차와 키 불일치를 구분하기 어렵다면 401은 제한 횟수만큼 retry하는 편이 안전합니다.
- 양방향(Field→AP 사건, AP→Field 사건)이 같은 연결 비밀과 같은 서명식(`ts.event_id.raw`)을 씁니다. 반사 공격은 현재 `source_product` 검사로만 막힙니다(AP `field-event-inbox.ts:33`, Field `ap-webhook-inbox.ts:31`). 서명 문자열에 방향 접두사를 넣어 분리하면 더 안전합니다(계약 변경 필요, 후속).
- `acked` 행의 보존·정리 단계가 없습니다(PII는 없음).

### 7. [낮음] 연결 로그인 2단계 인증 뒤 이어 가기에 실패하면 복구 버튼이 없음
- `apps/agent-web/src/agent-connect.tsx:72-76`: 코드 확인은 성공했는데 `oauth2/continue`가 실패하면, 이미 쓴 2FA 입력 폼만 남습니다.
- 새로고침하면 mount 시 `get-session`에서 이어지므로 치명적이지 않습니다. 실패 시 "연결 계속" 버튼을 보여 주거나 `twoFactorPending`을 해제하는 것이 좋습니다.

### 8. [참고] email outbox 보존
- `retention-purge.ts`는 `sent` 행만 7일 뒤 익명화합니다. `blocked_integration`/`failed` 행은 수신 주소를 90일 보존합니다(의도된 정책으로 보임).
- 비 mock 환경에서는 본문 토큰이 `[redacted]`이고 본문에 주소가 없어 추가 PII는 없습니다.

---

## 확인 결과 문제 없음 (checked, OK)
- **x-organization-id IDOR**: `memberFor`는 `m.user_id=$1` 멤버십 조인과 `o.deleted_at is null`을 거치고, 쓰기는 `canManage`(owner)일 때만 허용합니다. 실행 완료 분기는 `owner_user_id=$1`과 선택 ID를 함께 조건으로 씁니다.
- **ownedOrganizations**: `owner_user_id`가 unique라 다중 owner 조직은 멤버십 owner만 해당합니다. 타인 조직은 노출되지 않습니다.
- **재인증**: 계정 삭제와 조직 삭제가 같은 HMAC 시도 창(15분 5회)을 공유합니다. 카카오 전용 계정은 현재 세션의 생성 시각 5분 이내 조건으로 확인합니다. 형식 검사(1~1024자)도 같습니다.
- **운영자 재실행 권한**: `requireAdmin({role:'operator'})`, `for update`, `scheduled`+`infinity`일 때만 허용, 사유 10~500자, 같은 트랜잭션에서 감사 기록.
- **12회 실행 실패 중지**: `steps.executionFailures`만 세서, 전제 조건 대기(blocked, 1시간)와 섞이지 않습니다. `infinity`는 claim 조건(`<= clock_timestamp()`)에서 빠집니다.
- **000089 guard**: 000078 대비 owner + 삭제된 조직의 암호문 삭제 분기만 추가됐습니다. 종료 상태 불변, started 바인딩, provider_id, DELETE 금지 조건은 그대로입니다.
  - 삭제 실행에서 `deleted_at`을 먼저 기록하므로 순서가 맞습니다.
  - `processing`은 항상 `started_at`이 있어 claim 중인 행과 경합하지 않습니다(EvalPlanQual로 제외됨).
- **000088**: 새 두 종류는 actor 필수·source_message 없음 규칙을 따르고, `unique(inquiry_id,revision)`과 `revision+1`이 일치합니다. 재전송은 rollback되어 중복 기록이 생기지 않습니다.
- **000090 ↔ 코드 열**: 열·check(`recorded` ⇔ 결과 3필드, `rejected` ⇒ error_code)가 코드와 일치합니다. `notification_events_check`의 새 분기는 `field_reservation_event_id` not null을 요구하고, 코드도 항상 채웁니다.
- **결정 본문 계약**: `{decision, proposalRevision, customerProof{recordId, confirmedAt, originConversationId}, idempotencyKey}`가 Field 허용 키와 정확히 같습니다.
  - 재시도 시 DB에 저장된 ms 정밀도 시각으로 같은 본문 해시가 만들어집니다.
  - 24시간 만료는 같은 키 우선 확인 → `customer_proof_expired` → AP 재키 순서로 처리되어 문제 없습니다.
  - customerProof는 확인키를 가진 고객의 POST에서만 만들어지고, 위조할 입력 필드가 없습니다(본문은 decision/proposalRevision만 허용).
- **확인키 권한**: 새 GET·POST 모두 `visitor_key_hash`, `consent_at`, `action.inquiry_id`를 확인하고, 그 뒤에 캐시를 사용합니다(캐시 키는 action ID).
- **사건 envelope**: `AgentEventEnvelope`(spec 1.0, `agent_platform`, action/aggregate 일치, `data.resource_id=aggregate_id`, status ≤ 80자), `X-Event-Id/X-Key-Id/X-Timestamp/X-Signature`, content-type, 202 `{received:true}`가 Field 구현과 일치합니다.
  - 본문은 ID와 상태만 담고 PII는 없습니다.
  - aggregate_version은 action 행 잠금과 unique로 보호됩니다.
- **알림 경로 응답 검증**: owner/allowed/reason/generation, `field && allowed` 거부, scope 없는 연결은 null(세대 1)로 처리합니다. Field 구현과 일치합니다.
- **scopeState/missingScopes**: 연결 목록과 웹 안내(review_required + scope_missing일 때만, "(추가)" 표기)가 일치합니다.
- **000091**: IMMUTABLE 래퍼가 기존 식과 같은 값을 냅니다. 조회식이 인덱스 식과 정확히 같습니다. 트리거 함수의 식은 바뀌지 않았습니다.
- **journal 인스턴스 재사용**: path+secret을 키로 쓰고, `verifiedEntries`에서 서빙 확인 캐시를 비웁니다. checkpoint와 복원은 `force`로 모든 서명을 다시 확인합니다.
- **pnpm override**: `better-auth>next/react/react-dom: '-'`는 pnpm 10.33.4에서 지원됩니다. lock 파일 반영도 일치합니다. 웹 앱은 better-auth를 import하지 않고, API는 `next`/`react` 진입점을 쓰지 않습니다.
- **UI 규칙**: 새 기능에 "(추가)" 표기가 있습니다. 비활성 버튼에는 사유 문구가 있고, "AP는 예약을 확정하지 않음" 안내가 있습니다. 결과 미상은 성공으로 표시하지 않습니다.
- **기존 테스트 의미 변화 없음**: 삭제된 기대값이 없습니다. 조직 삭제 confirm 객체에 password가 추가된 것뿐입니다.
