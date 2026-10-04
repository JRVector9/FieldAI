# 계약 예제 사용 안내

이 디렉터리는 연동 명세의 **JSON Schema·합성 예제**와 구현 중인 AP/Field 공개 API의 `agent-integrator-v1.openapi.json`·`field-integrator-v1.openapi.json` 미리보기를 제공합니다. Field 미리보기 preview.10(preview.9 + 서명 방향 접두사)에는 현재 동작하는 bearer 읽기, 승인된 FAQ와 명시 binding 경로, Field ID 요청 상태 조회·고객 제안 결정(확정 아님)·알림 경로 조회·AP 서명 사건 수신함이, AP 미리보기 preview.11(preview.10 + 서명 방향 접두사)에는 명시 scope를 가진 설치 전용 connection·owned_embed 공개 생성/관리와 연결별 source 버전·갱신 요청/상태, Field 서명 `facts.changed` 수신, 연결 해제 후 서명된 사건 상태 복구 조회와 예약별 세대 1 종료 영수증이 포함됩니다. 정보 동기화·설치·업무 요청을 포함한 완성 OpenAPI 또는 SDK가 아니며 실제 서명 검증은 각 제품 서버 구현에서 수행합니다.

- event_envelope: 웹훅 최소 메타데이터 계약. 서명/인가/원본 조회는 서버 별도 검증입니다.
- 위 세 `*.schema.json`·`*.example.json`은 2026-09-24 **설계용** 예제다(`tools/build_contract_examples.py`). 실제 서버 사건 envelope(uuid `event_id`, `notification_owner_product`·`route_generation` 등)와 다르며, 실제 계약은 두 `*.openapi.json`과 docs/03을 따른다.
- action_request: 고객 확인 후 외부 문의/예약 요청. 예약 확정 권한이 아닙니다.
- knowledge_snapshot: 승인된 외부 사실. 예제 hash의 0은 형식 확인용으로 실제 내용 무결성 검증 값이 아닙니다.
- task_graph / acceptance_catalog: 46개 작업과160개 인수 명세의 기계 판독본입니다.

타임존·번호·날짜·요청의 실제 의미, 고객 동의 진위, 조직 매핑, 스코프, source hash, end>start, 서비스 소요시간, 전화번호 유효성, 예약 충돌은 schema 통과와 별도로 서버에서 확인해야 합니다. 테스트 전화번호로 외부 메시지를 발송하지 마세요.

Schema/example 검사는 문서 패키지 품질 검사이며 서비스 인수 테스트 통과가 아닙니다. `pnpm test:spike:contracts:agent`와 `pnpm test:spike:contracts:field`는 각 미리보기의 정적 검사와 실제 제품 DB/API 제공자 검사를 실행합니다. `pnpm test:contracts`는 현재 정적 계약과 제품별 DB 소비자 검사를 로컬에서 실행하고, `pnpm test:spike:ap-field:http`는 별도 두 mock 서버의 양방향 OAuth·Field bind·source refresh·서명된 Field 정보 변경을 검수합니다. 운영 공급사·버전 호환성·전체 소비자 계약/출시 게이트는 C01에서 계속 검수해야 합니다.


## AP preview.9 공개 설치 쓰기

- `ap.connections.create`와 `ap.deployments.manage`는 기존 scope에 자동 부여하지 않는다. 등록 client, owner가 선택한 AP 조직/AI 및 실제 OAuth consent/token 모두에서 필요한 scope를 확인한다. 기존 Field 연결은 새 권한이 필요할 때 재동의한다.
- `POST /integrations/v1/connections`는 AP 설치 전용 `installation_only` binding이다. caller-side externalOrganizationId와 exact origin은 Field 로그인·정보/예약 접근 또는 양방향 bind의 증거가 아니다.
- 공개 `POST /deployments`·관리 GET·verify/activate/pause는 이 client와 grant가 만든 owned_embed만 다룬다. origin 검증 전 pending, 실제 검증 후에도 명시 activate 전 pending이다. native/다른 client/선택 외 조직이나 AI 조작은404, 누락 scope403, expired/revoked grant401이다.
- 신규 write UUID `Idempotency-Key`는 client+grant+operation+target에 묶인다. 같은 key+내용/If-Match는 저장된 결과로200 복구, 변경 내용은409다. 수정은 quoted revision `If-Match` 필수(없으면428), current revision 충돌409다. native 배포 상태 변경도 public revision을 진행한다. 영구409 충돌은 retryable false다.
- 생성으로 기존 대화 읽기 배포 선택을 확장하지 않는다. 새 배포 상담 원문은 owner가 별도 선택/동의한다. 기존 selection 회수는 그 grant의 public 설치만 paused로 전환하고 다른 native 배포·예약·구독·원본을 보존한다.
- Field의 `ap-public-write-client.ts`는 preview.9 HTTP만 소비한다. 일반 외부 client와 동일 API/권한이며 AP domain/DB를 import하지 않는다. 저장 뒤 미상/응답 형상 오류는 같은 UUID로 복구하며 새 UUID/자동 retry를 만들지 않는다. caller가 원래 UUID를 지속 저장해야 한다.
- 내부 계약/native HTTP/PG17/합성 DNS port 검수와 실 외부 DNS·Field 사업자 새 UI/BFF·공급사/출시 QA는 분리한다. public API와 consumer 모듈 구현은 최종 운영 인수 완료가 아니다.

## AP preview.10 출처 수신 상태 읽기

- source GET의 `syncedAt`는 현재 `source_id`/`source_revision`에 맞는 AP source snapshot의 실제 `fetched_at`만 읽는 nullable RFC3339 metadata다. 같은revision heartbeat·owner 승인·AP 지식/AI 공개시각을 뜻하지 않는다. source나맞는snapshot이없으면null이며now/updated_at/source.fetched_at/원격publishedAt로채우지않는다.
- Field BFF의 신규consumer는 preview.9의missing syncedAt을legacy null로호환하지만 present malformedtimestamp는502로거부한다. 상태와시각은readonly이며자동승인이나고객AI반영을의미하지않는다.
- preview.9의publicwrite endpoint subset/UUID/If-Match/scope/origin 계약은변경없다. 설치용 `ap-public-write-client.ts`는그고정subset을계속소비하며source GET을사용하지않으므로version/client변경없음. 이미리보기는전체SDK/실외부/버전호환출시승인을뜻하지않는다.

## AP preview.11 / Field preview.10 서명 방향 접두사

- 사건·연결 해제 HMAC은 bind 때 양쪽에 저장한 같은 연결 키를 쓴다. 원문 `v2:<direction>.<timestamp>.<event_id>.<raw_body>`(해제는 `v2:<direction>.<timestamp>.<revocation_id>.<connection_id>.revoke`)에 방향을 넣고 `X-Signature-Version: 2`를 보낸다. Field→AP(`/integrations/v1/field-events`, AP 해제 수신)는 `field->ap`, AP→Field(`/integrations/v1/webhooks/agent`, Field 해제 수신)는 `ap->field`다. 반대 방향 v2 서명은 401이다.
- 발신자는 기본 v2로 서명한다. Field 발신 버전은 `FIELD_EVENT_SIGNATURE_SEND_VERSION`(`1`|`2`, 미설정 `2`, 다른 값은 worker 시작 실패)이고 `1`은 구버전 수신자가 남은 전환 기간에만 쓴다. AP 발신 버전도 같은 규칙으로 `AP_EVENT_SIGNATURE_SEND_VERSION`(`1`|`2`, 미설정 `2`, 다른 값은 부팅 실패)을 따른다(`apps/agent-api/src/field-signature.ts`, AP→Field 사건·해제 발신). 401에 v1로 자동 하향하지 않는다. 배포 순서와 blocked 재큐 절차는 `docs/03_INTEGRATION_CONTRACT.md` 서명 계약 절을 따른다. 헤더·접두사 없는 v1은 전환 기간에만 받는다: AP `AP_EVENT_SIGNATURE_ACCEPT_V1`, Field `FIELD_EVENT_SIGNATURE_ACCEPT_V1`. 미설정이면 mock/sandbox `true`, live `false`이고 다른 값은 부팅 실패다. 시작 로그에 수용 모드를 남긴다. 버전 헤더가 `2` 외 값이거나 v1 원문에 v2 헤더를 붙이면 401이다.
- 복구 조회(`notification-status`)·알림 경로 종료(`route-close`)는 Field→AP 단방향 전용 원문 접미사라 이번 버전에서 바꾸지 않았다.
- 서명 helper는 제품마다 따로 둔다(`apps/agent-api/src/field-signature.ts`, `apps/field-api/src/ap-signature.ts`). 상대 제품 코드를 import하지 않는다. 전환 기간 종료(live에서 v1 허용 해제 확인)는 운영 승인 대상이며 이 미리보기는 출시 승인이 아니다.

## 2026-10-04 A-21 응답 스키마 정정

- AP `FieldNotificationRouteClosure`의 `allOf`가 `additionalProperties:false`인 요청 스키마를 확장해 필수 `closedAt`까지 금지했다. UUID DB consumer 검사 `test/field-actions.db.test.ts`의 실제 200 응답과 `QA149/QA158` 계약 단위 검사에서 재현했다(첫 실패 로그 `/private/tmp/fieldai-a21-field-actions-first-20261004.log`). 기존 7개 종료 식별값과 `closedAt`을 명시한 object 스키마로 정정하며 다른 필드는 계속 거부한다.
- 기존 API·문서에 이미 있는 응답을 정확히 검증하는 정정이며 wire shape·DTO·scope·상태 전이 변경은 없다. AP `1.0.0-preview.11`/Field `1.0.0-preview.10` pin은 유지한다. 실제 응답 대조는 Ajv2020+형식 검증과 `test:contracts`의 전 경로·2xx status/media coverage gate로 확인한다.
