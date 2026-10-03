# 04. 공식 연동 계약 — AP ↔ Field

**이 장은 두 제품 개발 에이전트가 먼저 고정할 네트워크 계약이다.** 실제 서버용 OpenAPI와 인증 공급사 설정은 구현 작업 C01/I00에서 이 규칙으로 생성·검증한다. 경로·필드는 계약 설계이며 현재 호출 가능한 서비스 주소가 아니다.

## 4.1 원본과 복제의 경계

| 데이터 | 원본 | 상대가 보관해도 되는 것 |
|---|---|---|
| Field 가입자·사업체·권한 | Field | 명시적으로 연결한 외부 식별자·권한 범위 |
| AP 가입자·사업체·권한 | AP | 명시적으로 연결한 외부 식별자·권한 범위 |
| Field 서비스·가격·운영시간 | Field | 승인·버전·출처가 있는 지식 스냅샷 |
| AP 직접 등록 FAQ·AI 설정 | AP | 권한 있는 설정 조회 결과; Field 원본으로 자동 덮어쓰기 금지 |
| Field 직접 대화·사진 | Field | 원칙적으로 AP 전달 안 함; 사용자가 별도 전달한 업무만 |
| AP 대화·후속 답변·사진 원본 | AP | Field 통합 문의함의 최소 인덱스, 고객이 전달한 업무 스냅샷 |
| 외부 업무 전달 요청 | AP의 ActionRequest | Field가 접수한 external_request와 수신 증빙 |
| 실제 예약·시간 점유 | Field | AP의 상태 미러·외부 요청 ID·합의 조건 |
| 알림·청구·비용 | 발송/판매 책임 제품 | 상관 ID·결과 메타데이터. 잔액 공유 금지 |
| 매체·배치·홍보 집계 | AP | Field 업무에 필요한 유입 라벨, AP 매체에 별도 승인 집계 |

‘원본은 하나’는 모든 개인정보를 한 제품에 모으라는 뜻이 아니다. AP에서 고객이 Field에 전달하기로 확인한 연락처·요약·첨부는 Field 업무 수행 목적의 **수신 기록**으로 남을 수 있다. 그 데이터와 AP 대화 원본의 보존·정정·삭제 책임은 각각 관리한다.

## 4.2 연결 관계와 식별

초기 연결은 하나의 AP 조직·대표 AI와 하나의 Field 사업체를 명시적으로 매핑한다. AP AI는 다른 일반 웹사이트·공유 링크에도 설치할 수 있다. 다중 Field 사업체에 한 AI를 동시에 매핑해 가격/예약을 섞는 기능은 후속이다.

```text
IntegrationBinding
  connection_id                # 두 서버가 합의한 공개 연동 식별자; 인증 비밀값 아님
  provider_client_id           # 검증된 커넥터 앱
  ap_org_id / ap_agent_id       # AP 자체 ID
  external_org_id              # Field 조직 ID, AP에서는 불투명 참조
  allowed_deployment_ids       # 이 연결의 사이트/배포
  approved_scopes_by_direction
  authorizing_subjects         # 각 제품의 동의한 사용자
  consent_versions / grant_ids
  source_mappings / capabilities
  revision / revoked_at / status
```

상호명·이메일·전화번호로 자동 매핑하지 않는다. API body의 tenant_id, agent_id, 외부 조직 ID는 토큰 바인딩을 바꾸는 권한이 아니다. ID가 유효하더라도 연결 범위 밖이면 거부한다. 새 Field 조직 연결·AI 교체는 새 동의와 변경 영향 검토를 거친다. 기존 요청 ID와 과거 귀속은 유지한다.

## 4.3 두 방향의 권한을 따로 승인

**Field가 AP API를 호출하는 권한과 AP가 Field 업무 API를 호출하는 권한은 다르다.** 동일 토큰을 양쪽 서버에서 받아주지 않는다. 제품 로그인과 OAuth 설치 승인은 별개다.

시작안은 양쪽 제품의 검수된 OAuth 2.0 인가 서버를 사용하는 Authorization Code + PKCE(S256)다. 웹 BFF가 비밀 자격·refresh token을 보관하고 브라우저/설치 코드/localStorage에 넣지 않는다. exact redirect URI, 요청별 state·issuer 검사, 최소 scope, 짧은 access token, refresh rotation을 적용한다. 표준 동작은 검수된 서버/라이브러리로 구현하며 임의 token endpoint를 즉석 작성하지 않는다.[S01]

### 단계별 연결

1. Field 소유자가 연결 시작. Field 세션·조직·최근 인증 상태를 확인하고 연결 transaction/nonce 생성.
2. AP 공식 인가 화면에서 AP 로그인 또는 가입, 연결할 조직·AI 선택, Field가 요청하는 AP 권한 승인.
3. Field BFF가 code를 교환하고 AP issuer·audience·subject·조직 범위를 확인. 이때 기본 AI 설치만 활성화할 수 있다.
4. Field 정보를 가져오거나 예약을 연결하려면 AP가 별도 등록된 client로 Field 인가 화면을 연다. 사업자가 **Field 데이터 읽기·요청 전달 권한**을 별도로 승인.
5. 양쪽 서버가 연결 transaction과 선택된 조직·grant를 검증한 뒤 기능별 active 상태를 합의한다. 둘째 승인이 취소되면 설치만 유지하고 Field 정보/예약 도구는 비활성.
6. 승인된 정보 동기화·서비스 매핑·AI 테스트 후 위젯 활성화. 무료 체험/구독 조건은 별도 표시하며 연결 승인으로 자동 결제하지 않음.

단계 2·4는 하나의 안내 마법사로 연결할 수 있지만 서로의 동의를 몰래 생략하지 않는다. 이메일/카카오 로그인은 각 인가 화면의 인증 수단일 뿐 다른 제품에 자동 로그인하는 공통 쿠키가 아니다.

### AP 발급 → Field 보관 토큰의 범위

| Scope | 허용 | 추가 경계 |
|---|---|---|
| ap.agent.read | 선택한 AI의 공개·상태 정보 | AP 전체 조직 조회 불가 |
| ap.connections.create | 선택한 AP 조직·AI와 외부 사이트의 설치 전용 연결 생성/조회 | 상대 로그인·정보·예약·결제 권한을 만들지 않음 |
| ap.sources.refresh | 이 연결의 승인 정보 갱신 요청·원본 검토 상태/수신 시각 읽기 | 임의 source/지식 공개 금지 |
| ap.deployments.manage | Field 및 일반 외부 client의 정확 origin owned_embed 준비·소유 검증·활성·중지 | 현재 client+grant가 만든 설치만 허용, 다른 native/client 배포 조작 불가 |
| ap.conversations.read | 이 연결·배포 또는 넘겨받은 업무에 관련된 대화 | AI의 다른 사이트 대화를 전부 조회하지 않음 |
| ap.conversations.reply | 연결 대화에 동의한 사업자의 직접 답변 | 설치용 백그라운드 credential에는 넣지 않음 |
| ap.events.read | 이 연결 사건·실패 메타데이터 | 매체/타 연결 이벤트 조회 불가 |
| ap.connection.revoke | 이 연결 해제 | AI 전체 삭제·계정 해지 불가 |

사람 답변에는 최근 유효한 **그 사람의 AP 위임 토큰**을 사용한다. Field membership만 존재하는 다른 직원에게 소유자의 AP 토큰을 대리 사용하지 않는다. 초기 소유자 1명 기준이며 후속 직원은 각자 AP membership·권한 연결이 필요하다. 백그라운드 동기화·배포·수신 이벤트용 installation grant는 사람 답변 scope와 분리한다.

### Field 발급 → AP 보관 토큰의 범위

| Scope | 허용 | 금지 |
|---|---|---|
| field.facts.read | 승인된 사업 정보·서비스·가격·FAQ | 사이트 초안·내부 메모·전체 고객 목록 |
| field.availability.read | 서비스별 요청 가능 구간 | 예약자 신원·점유 사유 |
| field.requests.create | 고객이 확인한 문의/예약 요청 생성 | 실제 예약 확정·가격 변경 |
| field.requests.read | 이 연결에서 생성한 작업/제안/결과 | 다른 경로 요청 열람 |
| field.proposals.respond | 고객이 특정 제안에 직접 동의/철회한 결과 전달 | LLM의 임의 수락 |
| field.notification_route.read | 연결된 작업 사건의 현재 알림 책임 조회 | 임의 채널 발송 |
| field.connection.revoke | 이 연결 취소 | Field 사이트·예약·구독 삭제 |

`field.reservations.confirm`, 사이트 공개, Field 관리자, 결제, 원장 SQL 범위는 어떤 AP 도구에도 부여하지 않는다. Field도 AP 조직을 대신해 AI를 임의 공개하지 않는다.

초기 제안값: access token 10분, authorization code 60초·1회, refresh token은 rotation·재사용 탐지·명시 만료. 실제 유효기간은 선택한 인가 서버 제약과 보안 검토 후 고정한다. revoke endpoint·연결 상태 검사를 같이 두고, 단순히 refresh token만 지워 남은 access token을 계속 허용하지 않는다.[S02]

## 4.4 연결 상태와 도구 발견

제품의 단일 `connected=true` 대신 기능별 상태를 가진다.

| 상태 | 의미·동작 |
|---|---|
| pending_ap_consent | AP 권한 승인 전. 기존 Field는 정상 |
| install_only | AP 위젯 사용 가능. Field 데이터/예약 권한 없음 |
| pending_field_consent | 역방향 기능 승인 대기 |
| syncing / review_required | 데이터 동기화·사업자 정보 승인 대기 |
| active | 허용된 기능의 준비 상태 검수 완료 |
| degraded | 일부 API/동기화 실패. 이용 가능한 기능만 표시 |
| suspended / expired | 제재·구독·인가 사유로 해당 연결 기능 제한 |
| revoking / revoked | 로컬 사용 즉시 차단, 원격 폐기 재시도; 업무 원본 보존 |

`GET /integrations/v1/capabilities`는 `facts.read`, `availability.read`, `request.create`, `proposal.respond` 지원 여부와 스키마 버전을 반환한다. AP가 Field 전용 bool/SQL로 판단하지 않는다. 연결이 없는 AI는 기능 발견을 호출할 필요 없이 자체 FAQ·상담만 실행한다. 외부 앱이 예약 기능을 지원하지 않아도 커넥터와 AI가 실패하지 않게 한다.

## 4.5 승인 정보 동기화와 최신성

### 원본과 승인 흐름

Field 변경 승인 → FieldCatalogRelease(version N) + outbox 생성 → signed facts.changed 이벤트 → AP가 해당 연결 API로 snapshot 조회 → source revision/hash 검증 → AP KnowledgeDraft에 변경안 → AP 사업자가 영향 확인 후 승인 → 새 AP KnowledgeRelease.

초기 기본값은 **가져온 변경을 AP에서도 검토 후 활성화**다. 최초 연결 후 모든 미래 가격을 자동 승인하는 정책은 기본으로 켜지 않는다. Field에서 한 승인과 AP 지식 공개 승인은 다른 제품의 별도 행위다. Field 연결 화면에서 AP 변경 검토로 이동하거나 AP의 공식 승인 화면을 사용할 수 있다.

Source 필드:

```text
source_id, provider, connection_id, external_org_id
source_revision, entity_versions, content_hash, published_at
fetched_at, approved_source_revision, ap_knowledge_release_id
state: current | pending_review | stale | unavailable | revoked
```

여기서 source_revision은 외부 제품이 부여한 비교 가능한 버전이고 AP KnowledgeRelease의 버전과 같지 않다. 순서가 뒤집힌 이벤트는 원본 상태를 과거로 돌리지 않는다. 누락된 revision은 snapshot 재조회로 복구한다. 같은 source/version/hash는 멱등, 동일 version+다른 hash는 integrity_conflict로 격리한다.

현재 로컬 AP owner 출처 공개 화면은 `GET /v1/connections/field/{id}/source/mapping-options`로 **최신 AP 직접 승인 공개본**의 서비스 이름·설명과 공개본 ID를 읽고, 별도로 저장된 Field 승인 snapshot과 나란히 보여준다. 선택한 Field 서비스가 AP 서비스와 이름이 같으면 owner가 **별도 서비스**, **AP 설명 우선**, **Field 설명 우선** 중 하나를 명시해야 한다. 서로 다른 이름도 owner가 같은 대상으로 지정할 수 있다. 공개 요청은 선택한 Field service ID, AP 서비스 인덱스/우선순위, `expectedNativeReleaseId`, Field `expectedSourceRevision`/`expectedContentHash`를 전송한다. AP 직접 승인본 또는 Field 버전이 변경되면 409로 재검토를 요구한다. 매핑은 AP `source_selection`에 공개본별로 저장되며 같은 선택의 재시도는 멱등이다. AP 설명 우선이면 Field 서비스 설명을 연결 AI 근거에서 제외하고, Field 설명 우선이면 새 connector KnowledgeRelease에서 대응하는 AP 서비스 설명을 제외한다. 별도 서비스는 두 설명을 출처별로 보존한다. AP 직접 초안·승인 원본은 수정하지 않으며 새 AI 공개는 owner의 별도 승인이 필요하다. 가격·시간·예약 조건은 이 매핑의 정적 AI 근거가 아니다.

현재 로컬 연결의 공식 갱신 경로는 `ap.sources.refresh`를 별도 동의한 Field owner가 AP 공개 `GET /connections/{id}/source`에서 AP 저장/승인 버전을 읽고, 현재 저장 버전을 `expectedSourceRevision`으로 보내 `POST /connections/{id}/source-refreshes`를 호출한다. 요청에는 32바이트 무작위값의 base64url `Idempotency-Key`가 필요하다. AP는 token·client·grant·actor·조직·AI·연결 상태와 버전을 확인하고 내구 작업 ID를 202로 반환한다. 같은 키/요청은 같은 작업으로 돌아오고 다른 버전 재사용 또는 현재 버전 충돌은 409다. `GET /connections/{id}/source-refreshes/{operationId}`로 `pending/retry/completed/blocked`를 조회한다. worker는 Field의 승인 사실을 공개 API로 가져와 AP 검토 초안으로 저장하며, AP 사업자 source 승인과 고객 AI 지식 공개는 별도다. 기존 연결에 갱신 범위가 없으면 재동의가 필요하고, Field 조회 장애는 재시도 상태로 남긴다. 이 경로는 예약 확정이나 자동 가격 승인이 아니다.

AP 읽기 preview.10의 `syncedAt`는 현재 source_id/source_revision에 맞는 AP snapshot의 실제 수신 시각이며 source·snapshot이 없으면 null이다. 같은 버전 재조회·사업자 승인·AI 공개 시각을 뜻하지 않는다. Field 신규 consumer는 preview.9에서 빠진 값을 null로 호환하고 잘못된 시각은 502로 거부한다. 설치 쓰기의 preview.9 고정 subset은 바뀌지 않는다.

현재 로컬 자동 경로는 Field의 승인 카탈로그 release와 같은 트랜잭션의 `field.catalog.approved` outbox를 기준으로, 연결 생성 뒤의 최신 승인 release를 활성 연결별 내구 전송 원장에 재조정한다. Field는 연결별 키로 `field.facts.changed`를 서명해 AP `/integrations/v1/field-events`에 전달한다. 사건에는 연결·release ID, 버전, 승인 시각만 있고 사업 설명·가격·연락처는 없다. AP는 서명·시간창·현재 owner/grant·`ap.sources.refresh` 동의를 확인하고 제품 전체에서 event ID를 멱등 검사해 inbox commit 뒤 202를 준다. 별도 worker가 과거 버전은 무시하고 최신 Field 공개 facts를 다시 읽는 내구 갱신 작업을 만든다. Field 전송 실패/응답 미상은 같은 event ID로 재시도한다. 새 AP source는 `pending_review`이며 기존 승인 버전·고객 AI 공개를 바꾸지 않는다. 연결 전 승인분의 최초 가져오기는 사업자의 명시 갱신/연결 검토 경로를 사용한다. release/outbox와 연결 원장만으로 최신 변경을 재조정하므로 모든 중간 버전의 독립 전달 이력을 보장하지 않는다.

현재 로컬 AP 상담은 연결 지식을 모델 근거에 넣기 직전 Field 공개 facts를 재조회하고 AP 승인 source의 revision/hash와 비교한다. 일치하면 확인 시각을 갱신하고 승인된 소개·서비스 설명만 근거로 사용한다. 불일치·권한 회수·Field 조회 장애에는 그 연결 근거를 제외하고 AP 직접 승인 지식으로 답할 수 있으며, 미확인 Field 정보와 사람 인계를 함께 표시한다. 모델이 연결 근거를 사용해 답변을 만든 경우 고객 저장/표시 직전 한 번 더 확인하고, 그 사이 버전이 바뀌거나 조회가 실패하면 답변 원문과 근거를 버리고 사람 확인으로 전환한다. 상담 중 일시적인 Field `/me` 장애만으로 AP 연결 원장을 영구 `degraded`로 바꾸지 않는다. 이 경로는 실제 모델의 모든 문장 의미를 증명하는 검사가 아니며 가격·예약 조건 수치를 AP 캐시에서 답하지 않는다.

### 가격·가용성의 엄격한 규칙

제품 간 한 DB 트랜잭션은 존재하지 않는다. 일반 소개·FAQ는 승인한 캐시와 마지막 확인 시각으로 안내할 수 있으나, **연결된 서비스의 가격·활성 상태·예약 조건을 수치로 제시하는 응답은 Field에서 현재 entity revision을 재확인**한다.

- Field 현재 버전과 AP가 승인한 버전이 같으면 근거로 사용한다.
- 다르면 새 값을 미승인 상태로 그대로 답하거나 예전 값을 최신이라고 답하지 않는다. 해당 필드는 검토 필요 안내·사람 문의로 전환한다.
- Field 조회가 실패하면 가격/가능 시간 확정 안내를 하지 않는다. AP 전체 상담실과 다른 native 지식은 계속 이용 가능하다.
- 무관한 다른 서비스의 변경은 해당 서비스 entity version이 동일하면 차단할 필요 없다. entity version을 제공하지 않는 커넥터는 전체 snapshot 버전을 엄격 비교한다.
- 최종 요청 제출에는 고객이 본 서비스 버전·조건 hash를 함께 보낸다. Field가 더 새 조건을 갖고 있으면409 `SOURCE_VERSION_CHANGED`로 최신 확인을 요구한다.

카드·사이트에서 가격을 복사한 정적 문구는 stale 검수 대상이다. 연결된 숫자는 가능한 라이브 바인딩으로 렌더하고, 확인 불가 시 ‘가격 확인 필요’로 바꾼다. 어떤 시점에도 전체 외부 사이트의 캐시가 동시에 바뀐다고 보장하지 않는다.

캐시 일반 확인 간격 5분, 소개자료 stale 24시간, 중요값 라이브 재확인은 제안값/실행 정책이다. 실제 주기와 모델 지연·API 부하를 측정하며 중요값 검사를 조용히 생략하는 최적화는 금지한다.

## 4.6 외부 요청과 예약 전달 — 분산 상태 처리

AP `ActionRequest`는 Field의 예약이 아니다. 외부 전달 원장과 예약 원장을 구분한다.

현재 AP 고객 경로는 AP 원본 대화의 별도 확인키를 가진 고객이 Field 서비스를 조회하고 현행 가격·시간·정책을 확인한 뒤 진행한다. AP BFF는 `/v1/inquiries/{id}/field-services`, `/field-connections/{connectionId}/services/{serviceId}/availability`, `/field-availability`로 공개 Field 정보와 최종 조건 hash를 보여준다. 고객은 이름·전화번호·서비스·요청 시간/요약과 수신 Field 사업장을 확인해 동의하고 `/field-actions`에 제출한다. AP 서버는 원본의 연락처·배포 귀속과 동의 시각을 고정한 ActionRequest를 저장한 뒤 공개 Field API로 전송한다. 재시도는 동일 제출 키·action ID·body hash를 사용하며 `/field-actions/{actionId}/reconcile`은 Field의 by-source 결과를 조회한다. Field가 없거나 scope·연결이 맞지 않으면 AP 자체 문의 조회/답변은 그대로 동작한다. 고객은 기존 AP 사람 문의를 보낸 뒤 외부 업무를 제출하거나, AP 상담 링크에서 같은 AI 대화의 이름·번호·AP 저장 동의를 `destination=field`로 제출해 `external_ready`와 별도 확인키를 만들 수 있다. 후자는 AP 사람 문의함·사업자 알림·매체 연락 사건을 만들지 않으며 Field 요청도 아직 전송하지 않는다. 고객이 현행 Field 조건·수신 사업자·전달 항목을 별도로 확인하고 동의한 `/field-actions`만 Field로 보낸다. 연결이 없으면 AP 확인키로 후속 대화를 열어 사람 문의를 명시 제출할 수 있다. 로컬 mock의 합성 AI/320px 경로를 검증했으며 실모델 응답·운영 공급사는 아직 미검수다.

직접 준비 POST가 저장된 뒤 브라우저 응답을 잃으면 고객은 같은 탭의 임시 제출 키·확인키로 읽기 전용 `/submissions/recover`를 호출해 기존 `external_ready` 원본을 찾는다. 임시 저장소에는 사진 바이트를 넣지 않고 선택 여부만 남긴다. 사진을 골랐던 고객은 복구 뒤 같은 화면에서 다시 선택·AP 요약 메시지에 첨부해야 하며, Field 전송 사진도 별도로 선택하고 동의한다. 복구만으로 사람 문의·Field ActionRequest를 새로 만들지 않는다. 이 동작은 로컬 mock의 320px 실제 HTTP/브라우저에서 확인했고 다른 탭/기기의 확인키 전달과 실 객체 저장소 장애는 별도다.

직접 준비 전 익명 상담 세션의 `GET /v1/engagements/{id}/field-readiness`는 현재 활성 배포에 허용된 AP owner 위임·유효한 AP OAuth 동의/refresh·`review_required` Field 연결과 필수 scope를 확인한 뒤 Field 공개 `/me`·승인 `/facts`를 조회한다. 유효한 요청 서비스가 하나 이상인 경우만 `{ready:true}`다. 그 외에는 `{ready:false,reason}`으로 `no_connection`(로컬 위임/연결 없음), `field_unavailable`(현재 Field 권한·응답·사실 미확인), `no_services`(검증된 공개 서비스 0개)를 구분한다. 일시 장애만으로 연결 원장을 영구 `degraded`로 바꾸지 않는다. 연락처·Field 토큰·연결/조직 ID는 반환하지 않고 세션이 없으면 401이며 no-store다. 화면은 직접 준비를 비활성화하고 사유·사람 문의·재확인을 제공한다. `destination=field` POST는 연락처 저장 전에 Field 현행 상태를 다시 확인하고 같은 연결이 AP 트랜잭션 중에도 유효한지 확인한다. 무연결 409 `field_connection_unavailable`, 공개 서비스 0개 409 `field_services_unavailable`, 현재 상태 미확인 503 `field_unavailable`에서는 원본/연락처/알림 원장을 변경하지 않는다. 이미 수락된 같은 제출 키의 복구는 연결 해제 후에도 기존 결과를 반환한다. 사전 응답 뒤에도 Field 상태는 바뀔 수 있으므로 현재 서비스·가격/시간·수신 사업자와 최종 동의는 기존 `/field-services`·`/field-actions`에서 다시 검증한다.

유효한 Field 연결이 있는 익명 상담의 사전 GET과 `destination=field` POST는 Field 외부 조회 전에 AP 전용 조직별 1분 호출 원장을 소비한다. 기본 120회/분이며 `AP_FIELD_PREFLIGHT_ORG_LIMIT`로 1~1000 사이 조정한다. 한도를 넘으면 429 `field_preflight_rate_limited`·`scope=organization`·`Retry-After`를 반환하고 Field를 호출하거나 고객 연락처를 저장하지 않는다. 연결이 없는 AP-only 상담에는 이 한도를 소비하지 않는다. 사람 문의와 이미 수락한 동일 제출 키의 조회/재시도는 계속 처리한다. 여러 서버 인스턴스가 같은 AP DB 원장을 사용하므로 한도 판정은 원자적으로 공유한다. 운영 역프록시/IP 정책과 정상 고객 차단 위험은 별도 출시 검수 항목이다.

현재 로컬 AP 고객 화면은 최종 제출에서 `service_conditions_changed` 409를 받으면 이전 가격/시간 확인 카드·동의·제출 키를 해제하고 Field availability를 다시 조회한다. 새 현재 가격/시간이 오면 이를 보여준 뒤 요청 시간·전달 항목 확인과 고객 동의를 다시 요구한다. 재조회에 실패하면 이전 가격을 계속 표시하거나 자동 제출하지 않는다. 응답 미상·멱등 충돌은 이 조건 변경 처리와 별도로 원래 요청을 조회한다.

현재 로컬 AP 고객 화면은 **제출 조건 사전 확인**에서도 409를 받으면 이전 가격/시간을 지우고 Field availability를 재조회한다. 새 값은 고객의 조건 확인·동의를 다시 거쳐야 하며, Field가 재조회 또는 사전 확인에 실패하면 이전 가격을 현재값처럼 남기지 않는다. AP 원본 문의와 기존 전달 기록은 유지한다.

현재 로컬 고객 화면은 `field-services` 전체 조회가 200이어도 연결별 Field facts 조회가 `field_facts_unavailable`이면 해당 연결의 서비스/가격/전달 양식을 숨기고 현재 정보를 확인할 수 없다는 안내와 재조회 버튼을 표시한다. AP 원본 문의와 이미 저장된 Field 전달 기록은 계속 열 수 있다. 재조회로 Field 현재 정보가 복구된 뒤에만 가격·시간 확인과 새 전달 동의를 진행한다. 이는 연결별 일시 장애 표시이며 Field 연결이 없는 AP 단독 문의에는 표시하지 않는다.

현재 로컬 고객 화면은 같은 목록에 정상 연결과 문제 연결이 함께 있으면 정상 연결의 서비스만 선택지에 두고 현재 가격 확인과 요청을 계속 허용한다. `field_facts_unavailable`은 현재 정보 재조회 안내, `field_reauthorization_required`는 사업자 재동의 필요 안내로 구별하며 고객에게 상대 제품의 OAuth 권한을 대신 부여하지 않는다. 그 외 사용할 수 없는 연결도 별도 사업자 확인 안내를 표시한다. 이 복합 상태는 현재 Chromium에서 목록 응답 주입으로 UI 흐름을 검수했으며 실제 두 연결의 서버 원장 검수는 별도다.

현재 로컬 AP 고객의 Field grant `/me` 조회가 일시 실패하면 그 요청은 `field_grant_unknown`으로 표시하고 연결 원장의 `review_required` 상태를 보존한다. 고객 읽기 한 번으로 연결을 영구 `degraded`로 바꾸지 않으므로 Field 복구 뒤 같은 확인키로 현재 사실을 다시 조회할 수 있다. 재조회가 성공하기 전에는 서비스/가격/업무 제출을 진행하지 않는다. AP owner의 명시 연결 검사·갱신 worker가 실제 권한 실패를 처리하는 기존 경로는 유지한다.

현재 로컬 AP 격리 DB/API 검사는 같은 조직·배포의 실제 AP 연결 원장 세 건에서 정상 연결·Field facts 503·facts scope 없는 연결을 함께 조회한다. 고객 목록은 정상 서비스만 제공하고 실패 연결은 각각 `field_facts_unavailable`/`field_reauthorization_required`와 빈 서비스로 보낸다. 잘못된 고객 확인키 401, 재동의 연결 직접 가용성 조회 403, 다른 연결의 조직 사실을 반환한 가용성 응답 502를 확인했다. 정상 연결의 현행 가격 확인·동의/전달은 계속된다. 이 검사의 Field 전송기는 stub이므로 서로 다른 실제 Field 조직 두 곳의 HTTP 장애 검수는 남는다.

| AP 상태 | 고객에게 표시 | 다음 동작 |
|---|---|---|
| draft / awaiting_customer | 전달 내용을 확인해 주세요 | 고객의 명시 제출 |
| queued / sending | 문의는 저장됐으며 Field 전달 중 | 멱등 전송 |
| accepted_external | Field에 요청 접수됨, 아직 미확정 | 외부 ID 저장·사업자 응대 |
| delivery_unknown | 전달 결과 확인 중 | 원래 요청 ID로 Field 조회, 새 업무 생성 금지 |
| retryable_failure | 전달 지연, 다시 확인 중 | 같은 키로 제한 재시도 |
| rejected | Field가 접수하지 못함/조건 재확인 필요 | 원본 유지·고객 수정/직접 문의 |
| canceled_before_delivery | 고객이 전달 전 취소 | 큐 전송 차단; 이미 수신됐다면 외부 철회 요청 |

```json
{
  "actionRequestId": "00000000-0000-4000-8000-000000000001",
  "connectionId": "00000000-0000-4000-8000-000000000002",
  "kind": "reservation_request",
  "originConversationId": "00000000-0000-4000-8000-000000000003",
  "externalServiceId": "00000000-0000-4000-8000-000000000004",
  "expectedServiceRevision": 7,
  "expectedPolicyRevision": 2,
  "customer": {"name": "테스트 고객", "phone": "01000000000", "verified": false},
  "request": {"mode": "preferred", "timezone": "Asia/Seoul", "preferredTimeText": "2026-10-10 오전"},
  "consent": {"version": "transfer-v1", "recordId": "00000000-0000-4000-8000-000000000005", "confirmedAt": "2026-09-24T10:00:00Z", "recipientProduct": "field", "recipientOrganizationId": "00000000-0000-4000-8000-000000000006", "items": ["name", "phone", "service", "requested_time"], "conditionsHash": "<현행 서비스·정책·요청 조건의 SHA-256>"},
  "summary": "세탁기 청소 일정 문의",
  "attachmentRefs": [],
  "source": {"provider": "agent-platform", "deploymentId": "00000000-0000-4000-8000-000000000007", "isTest": true}
}
```

위 값은 테스트용 예시이며 ID·시각·hash는 실제 요청 값으로 대체한다. 현재 Field 공개 계약의 JSON 필드 이름은 camelCase이고 `x-body-sha256`은 객체 키를 재귀적으로 정렬한 JSON의 SHA-256 hex다. `conditionsHash`는 현행 `{organizationId,catalogRevision,policyRevision,service,timezone,request}`의 같은 방식 hash다. 외부 요청에는 고객 최종 확인의 감사 레코드·body hash를 묶고 인증된 서버 요청으로 전달한다. 이것은 휴대전화 실명 인증 증명이 아니다. `verified=false`는 수신 Field에도 보존한다. 프론트가 보낸 `isTest=false`를 신뢰하지 않고 서버의 테스트 세션에서 결정한다. 고객이 AP 사람 문의 또는 `external_ready`의 마지막 고객 요약 메시지에 사진을 첨부하면, 선택한 ready 사진 UUID 최대 5개만 `attachmentRefs`에 넣고 `consent.items`에 `attachments`를 추가한다. AI 질문은 사진 첨부 대상이 아니다. 고객은 준비 뒤 확인키로 AP 원본을 재열람해 사진을 선택·첨부할 수 있고, Field 전달 사진은 다시 선택·동의한다. Field의 업무 수락은 사진 복사 완료를 뜻하지 않는다. 실제 악성코드 검사·객체 저장소/보존 정책·운영 장애와 정식 검수 전에는 I04 완료로 보지 않는다.

Field 처리:

1. 인증·scope·connection·동의 참조·대상 서비스·최신 조건·외부 요청 hash 검증.
2. `UNIQUE(provider, connection_id, action_request_id)`로 동일 업무를 하나만 수락. 같은 ID·다른 body면409.
3. Field 트랜잭션에 external_work_request·예약 requested·업무 수신 증빙·outbox 저장. 예약은 미확정이므로 점유 없음.
4.201/200 응답에 `external_request_id`, `reservation_id`(해당 시), `status=requested`, `version` 반환.
5. AP는 external ID가 확인된 경우에만 ‘Field 접수 완료’로 전환. 타임아웃은 unknown이며 같은 키로 조회/재시도.
6. 사장님이 Field 자체 승인 API에서 confirm. DB 충돌 검사 후 이벤트 발행. AP는 상태 미러만 갱신.

수신 조회 API는 AP가 저장한 action_request_id로 이미 수락된 건을 찾을 수 있어야 한다. 큐 재시작·이벤트 역순·연속 클릭도 별도 예약을 생성하지 않는다. 인터넷 전체에 exactly-once delivery가 있다고 가정하지 않고 at-least-once 전달과 멱등 업무 처리로 설계한다.

로컬 `mock`에서 Field 체험이 만료되면 **새** 외부 요청은 HTTP 403 `{ "error": "trial_ended", "accessMode": "cleanup_only" }`로 거부한다. 같은 source ID·body의 기존 수신 영수증은 200으로 재확인되고, by-source 조회와 기존 예약 사건·고객 확인키는 유지된다. AP는 이 응답을 재인가 오류와 구분해 `field_subscription_ended`로 기록한다. 실구독 종료 정책·결제 공급사 검수는 별도다.

고객이 선택한 사진의 AP 원본은 AP에 남는다. Field 연결 worker는 자기 DB에 고정된 ActionRequest ID와 사진 UUID로만 `GET /integrations/v1/action-requests/{actionId}/attachments/{attachmentId}`를 호출한다. AP는 `ap.conversations.read` OAuth scope에 더해 현재 grant·actor·연결·배포·고객 동의·해당 ActionRequest의 선택 배열을 확인하고 준비된 WebP 바이트만 응답한다. 외부 body가 지정한 임의 URL을 fetch하지 않는다. Field는 업무 트랜잭션에 선택 사진별 `pending` 원장을 만들고, 바이트 형식·최대 4MB를 다시 검사해 자기 비공개 저장소에 정규화한 뒤 `copied`로 표시한다. 실패는 `copy_failed`와 원인/재시도 시각으로 남기고 본문 접수 성공과 구분한다. Field 사업자는 자기 조직의 복사 상태와 완료된 사본만 열 수 있다. 악성코드 검사기·실 객체 저장소의 ACL/보존/복구는 공급사 환경에서 별도 검수한다.

## 4.7 대화·업무 UI와 고객 접근

AP가 원본인 대화는 Field BFF가 위임 API로 읽는다. 메시지 전송은 AP가 원본 event_id를 발급하고 AP에서 저장·AI 인계·알림을 처리한다. Field는 AP 문장을 자기 DB에서 따로 편집하거나 AP 장애 중 성공 메시지를 생성하지 않는다.

현재 Field 사업자 화면은 `GET /v1/owner/external-requests`로 자기 조직에 수신된 외부 문의의 서비스·고객 연락처·요약·접수 시각을 별도 목록에서 읽는다. `field.external_request.accepted`는 Field 사업자 내부 알림 1건을 만든다. 이 목록은 AP 대화 원본이나 답변 원장이 아니다. 연결을 승인한 Field owner가 문의를 열면 Field BFF가 현재 AP grant·조직·actor·배포·scope를 확인하고 AP 공개 `/integrations/v1/conversations/{id}` 및 `/messages`에서 원본을 읽는다. 답변은 별도로 동의한 `ap.conversations.reply` 범위와 AP revision·멱등 키로 AP 공개 `/replies`에 기록한다. Field DB에는 AP transcript를 저장하지 않으며 AP가 메시지 ID·sequence·outbox·고객 알림 원장을 소유한다. Field는 AP 호출 전에 미전송 답변 본문을 Field 전용 키로 암호화하고 원래 revision·멱등 키를 기록한다. 응답 미상·화면/서버 재시작 뒤에도 같은 원본 요청으로 재확인하며, 다른 본문은 결과 확인 전 거부한다. AP 수락 확인 후 Field 본문을 지우고 message ID·revision·알림 상태만 멱등 영수증으로 남긴다. AP 저장 성공 시에도 고객 외부 알림은 공급사 미연결이면 `blocked_integration`으로 표시한다. 실 알림/결과 동기화는 후속이다. 외부 예약은 Field 자체 예약함에 나타난다.

Field 직접 문의는 Field 원본이며 AP에 자동 이관하지 않는다. 고객 대화는 생성 제품의 상담 도메인에 남긴다. 제품 사이에 HttpOnly 쿠키를 공유하거나 전화번호로 로그인시키지 않는다.

AP에서 Field 예약 요청이 접수된 고객은 자신의 AP 대화 확인키로 ActionRequest를 다시 열고, **유효한 AP 대화 권한 + 정상 양방향 connection + accepted ActionRequest의 연결된 reservation_id**를 AP 서버에서 확인한다. AP는 별도 동의 scope `field.customer_access.create`의 Field 공개 API `POST /integrations/v1/customer-handoffs`에 action/connection/external request/reservation ID를 보낸다. Field는 자체 원장의 동일 조직·grant·외부 요청·예약 일치를 다시 확인하고 5분짜리 32바이트 무작위 1회 코드를 발급한다. 고객은 코드를 URL에 싣지 않고 Field `/handoff` 화면에 입력한다. Field `POST /v1/customer-handoffs/exchange`가 코드를 트랜잭션에서 한 번 소비하고 Field 전용 예약 확인키를 발급한다. 같은 예약의 새 교환은 이전 Field 키를 폐기한다. 코드·Field 키 원문은 DB/outbox에 저장하지 않고, 코드 발급은 예약당 시간당 5회로 제한한다. 이미 교환한 Field 키는 AP grant가 철회되거나 AP가 중단돼도 Field 예약 조회/변경 요청에 사용한다. 알림 링크·전화번호·외부 ID만으로 권한을 발급하지 않는다. 현재 로컬 mock DB·실제 양쪽 HTTP·320px 화면에서 검수했으며 운영 독립성/복구와 정식 QA153/155는 별도다.

정상 연결 시 대화는 AP에서 유지하고 예약 상태·제안 UI는 허용 API를 사용한다. AP 장애/해제 후 새 연락을 위한 Field 후속 스레드가 필요하면 새 원본이라는 사실을 표시하고, 기존에 수신한 업무/예약과만 연결한다. AP 과거 대화 원문을 몰래 복제하지 않는다. 양방향 자동 transcript sync는 제외한다.

## 4.8 알림의 단일 책임

| 사건 | 기록 원본 | 정상 연결의 외부 알림 책임 |
|---|---|---|
| AP 일반 문의 제출/고객 추가 메시지 | AP | AP → 사업자 |
| AP 대화에서 사업자 답변 (AP 화면 또는 Field API) | AP | AP → 고객 |
| Field 직접 문의/답변 | Field | Field |
| AP가 넘긴 Field 예약 요청 수락 | Field 업무 + AP 전환 원장 | AP 한 번. Field 미러 생성에 별도 고객/사업자 알림 중복 금지 |
| 연결 AP 예약의 Field 확정/제안/변경 | Field | AP가 외부 사건을 기록한 뒤 고객 통지 |
| Field 직접 예약의 확정/변경 | Field | Field |
| 각 제품의 결제/보안/서비스 장애 | 해당 제품 | 해당 제품 |

원본 이벤트마다 `notification_owner_product`, `origin_event_id`, `connection_id`, `route_generation`을 저장한다. AP 대화/사용량 알림은 AP 구독에, Field 직접 업무는 Field 구독에 귀속한다. Field가 대신 AP 대화에 답변해도 AP 응답/메시지 비용을 Field 원장에 중복 차감하지 않는다.

현재 로컬 구현은 Field 공개 `GET /integrations/v1/external-requests/by-source/{actionId}/events`를 `field.requests.read`와 현재 조직·client·grant·actor·connection 결합으로 제한한다. 응답은 사건 ID·예약 revision/상태·발생 시각과 승인된 예약 시각만 포함하며 고객 이름·전화·사유·원문은 싣지 않는다. AP 고객의 확인키 수동 동기화는 전체 revision 연속성·ActionRequest/예약/조직/connection을 검사한다. 추가로 초기 양방향 bind가 연결별 HMAC 키를 두 제품에 각자 암호화해 저장하고, Field 전용 worker는 세대 1 예약 사건 원장을 재조정해 PII 없는 서명 사건을 AP에 재시도한다. AP는 서명 확인 후 durable inbox에 기록한 경우에만 202를 반환한다. AP 전용 worker는 action/route/revision을 확인해 역순 사건을 보류하고 AP 사건·고객 알림 원장을 멱등 생성한다. AP 공개 `GET /integrations/v1/events/{id}/delivery`는 현재 `ap.conversations.read` OAuth grant의 client·actor·조직·선택 배포와 연결 사건 소속을 검증한 뒤 AP 수신/처리·고객 알림·열람 기록 유무만 반환한다. Field owner의 자체 예약 상세는 Field 전송 원장을 먼저 읽고, ACK 사건에 대해서만 해당 공개 AP API를 조회한다. AP 응답 장애에도 Field 예약과 로컬 ACK는 조회 가능하며 원격 상태는 `unavailable`이다. 확정·제안·변경·취소 등 사업자 사건의 고객 알림은 공급사 미연결일 때 `blocked_integration`이다. 정상 연결 및 해제 후 세대 2 활성화 전에는 Field가 연결 예약 고객 알림을 따로 만들지 않는다. 오래된 연결에 서명키가 없으면 수동 동기화만 가능하다.

연결 해제 뒤 Field owner는 기존 예약의 ACK 사건에 한해 AP 공개 `GET /integrations/v1/events/{id}/recovery-status`를 조회한다. Field 서버는 자기 owner/예약/connection을 먼저 확인하고, bind 당시 연결별 키로 `timestamp.eventId.connectionId.notification-status`를 HMAC 서명한다. AP는 5분 시간창·키/연결·서명 및 accepted ActionRequest/예약/사건 소속을 검사하며 이미 폐기된 OAuth grant를 다시 열지 않는다. 결과는 수신·처리·고객 알림 원장·열람 상태만 담고 대화 원문·고객 연락처를 담지 않는다. AP가 내려갔거나 사건 조회가 404이면 Field는 로컬 ACK를 보존한 채 원격 상태를 확인 불가로 둔다. 이 읽기 전용 복구는 고객 알림 발송이나 새 route generation 발급이 아니다. 로컬 mock의 양쪽 해제 흐름과 AP API 중단→복구에서 320px 화면을 검수했으며 실제 공급사 미상 발송 결과 조회는 후속이다.

Field→AP 사건이 지연되면 Field는 ‘예약 확정됨·고객 알림 전달 대기’를 표시한다. AP 장애를 이유로 Field가 동일 사건의 SMS를 자동 병행 발송하지 않는다. 원격 수신 ACK는 알림 최종 발송 성공이 아니다. AP가 처리·발송 결과 상태를 기록하고 Field는 정해진 API/이벤트로 조회한다. AP 공개 사건 수신은 연결 row lock을 잡은 트랜잭션 안에서 서명 확인과 durable inbox commit까지 수행한다. 해제와 경쟁할 때 먼저 commit된 수신만 202이고, 해제가 먼저 확정되면 신규 사건을 401로 거부한다. 202를 준 세대 1 inbox 사건은 해제 뒤에도 AP 내부 사건·고객 알림 원장을 멱등 처리해 경로 종료 대조에 포함한다. 이미 종료 영수증이 있는 예약에 늦게 남은 inbox 사건은 `route_closed`로 거부한다. 이 내부 대조는 실제 공급사 발송 허가가 아니다.

연결 예약 사건의 발송 직전 AP는 Field의 알림 route/current generation·연결 상태를 확인한다. 확인할 수 없으면 보류한다. AP 자체 일반 대화의 알림은 Field 확인 없이 처리한다. 이 구분으로 AP 독립 운영을 유지한다.

**연결 해제 시 자동 발송 소유권 전환은 하지 않는다.** 기존 예약은 Field에 남기고 ‘직접 연락/알림 경로 재설정 필요’로 안내한다. Field의 유효한 고객 접근 경로와 필요한 고지/동의를 마련한 뒤 새 generation을 발급해 명시적으로 전환한다. 이전 generation에 속한 queued 이벤트는 폐기/대조 후 처리한다. 이미 공급사에 전달된 미상 메시지는 조회로 정리하고 곧바로 대체 발송하지 않는다. 긴급한 경우 사장님이 전화 등으로 직접 연락한 사실을 기록한다.

현재 로컬 mock에서는 기존 연결 예약 하나씩 다음 경로로 전환한다. 고객은 Field 예약 확인키로 `GET/POST /v1/reservations/{id}/notification-route`의 상태·명시 동의/철회를 사용한다. Field owner는 자기 예약과 고객 동의, 양쪽 해제 ACK를 확인한 뒤 `POST /v1/owner/reservations/{id}/notification-route/activate`를 실행한다. Field는 AP 전달 ACK가 연속된 세대 1 사건의 마지막 ID/revision, 전환 ID, 동의 ID를 AP 호출 전에 자체 DB에 저장하고 연결별 키로 서명해 AP 공개 `POST /integrations/v1/notification-routes/close`에 보낸다. AP는 revoked 연결의 accepted ActionRequest/예약과 해당 세대 1 사건의 연속 처리, 기준을 넘는 inbox 사건 부재, 고객 알림 원장의 `not_applicable` 또는 `blocked_integration`을 대조하고 자기 DB에 종료 영수증을 내구 기록한다. Field 응답 분실·프로세스 재시작·브라우저 새로고침 뒤에는 저장된 전환 ID/기준으로 동일 영수증을 재시도한다. 기준 뒤에 생긴 예약 사건은 AP에 다시 보내거나 Field 고객 자동 알림으로 재발송하지 않고, 사건별 고객 직접 연락 `reached` 기록을 요구한다. Field는 영수증·현재 동의·예약 사건을 재검사한 뒤 세대 2를 활성화한다. 이후 새 Field 사건만 Field 알림 원장에 기록하고 AP 전송 원장에서 제외한다. 고객 동의 철회는 향후 Field 자동 알림을 중지하고 AP 경로를 복구하지 않는다. 이는 로컬 mock 경로의 부분 구현이며 **실제 공급사의 unknown 조회, 발송 직전 Field route 재확인, 구독 종료·삭제 보존·운영 장애 검수**는 남아 있다. 공급사 미연결 상태의 Field 고객 알림도 `blocked_integration`이고 실제 발송 성공이 아니다.

현재 Field owner의 기존 연결 예약 상세는 양쪽 중 어느 쪽에서 연결을 해제했든 AP 원격 사건·고객 알림 상태와 별도로 직접 연락 필요를 표시한다. `GET/POST /v1/owner/reservations/{id}/manual-contacts`는 Field 자체 owner 세션으로만 기존 `external_ap` 예약·사건의 전화/대면 시도 또는 도달 사실을 읽고 기록한다. 활성 연결에서 기록을 거부하고, 해제 뒤 다른 예약 사건·다른 owner를 거부하며, 동일 기록 ID 재시도는 멱등 처리한다. 감사 outbox에는 사건/시도 ID와 결과만 두고 고객 연락처·본문을 싣지 않는다. 담당자 계정이 삭제돼도 사건 기록은 보존한다. 이는 사람이 실제 연락했다고 명시한 업무 기록이며 고객 메시지 자동 전송이나 AP 발송 성공·알림 소유권 변경의 증빙이 아니다. 고객에게 도달했다고 검수하려면 실제 통화/대면 근거와 운영 정책이 추가로 필요하다.

## 4.9 이벤트·멱등·재조정

두 제품은 각각 로컬 업무 commit+outbox를 같은 DB 트랜잭션에 저장한다. 원격 웹훅 수신은 서명 확인 후 inbox 원장에 durable 저장한 뒤202를 반환한다. 아직 저장하지 못하면2xx를 주지 않는다. 업무 처리·알림 생성은 이후 멱등 수행한다.

```json
{
  "spec_version": "1.0",
  "event_id": "11111111-1111-4111-8111-111111111111",
  "event_type": "field.reservation.confirmed",
  "source_product": "field",
  "connection_id": "22222222-2222-4222-8222-222222222222",
  "aggregate_type": "reservation",
  "aggregate_id": "33333333-3333-4333-8333-333333333333",
  "aggregate_version": 3,
  "occurred_at": "2026-09-24T10:05:00Z",
  "correlation_id": "44444444-4444-4444-8444-444444444444",
  "notification_owner_product": "ap",
  "route_generation": 1,
  "data": {"resource_id": "33333333-3333-4333-8333-333333333333", "status": "confirmed"}
}
```

웹훅 payload에는 원문·전화·주소·사진 URL·access token을 넣지 않는다. 필요한 원본은 scope가 있는 API로 조회한다. 등록된 client/connection과 source를 검증하며 body source 문자열을 믿지 않는다. `UNIQUE(source_product,event_id)`로 중복 제거하고 aggregate_version 역행·누락 시 최신 원본을 재조회한다.

`field.facts.changed`는 같은 서명 헤더를 사용하되 `aggregate_type=facts`, `aggregate_id=FieldCatalogRelease ID`, `aggregate_version=source_revision`, `route_generation=1`, `data={resource_id,status:"approved",source_revision}`를 싣는다. 예약 사건의 알림 소유권 필드는 포함하지 않는다. AP의 전역 event ID 수신 원장은 예약/사실 변경 사건 사이의 ID 재사용도 서로 다른 본문이면 409로 거부한다. 202는 내구 수신만 뜻하며 AP source 승인이나 AI 공개 성공을 뜻하지 않는다.

초기 서명 계약은 제품 간 사전 등록된 연결별 secret의 **HMAC-SHA256**이다. 자체 프로젝트 계약이며 RFC와 동일한 메시지 서명 표준이라고 부르지 않는다. `X-Event-Id`, `X-Timestamp`(Unix seconds), `X-Key-Id`, `X-Signature`를 사용하고 서명 원문은 `timestamp + "." + event_id + "." + raw_body_bytes`다. 상수시간 비교, body/header event 일치, ±5분 시간창, 최대 body 크기, 키 교체를 검수한다. 재전송은 같은 event_id와 새 timestamp/서명으로 처리한다. secret은 브라우저에 제공하지 않는다.

현재 Field mock worker는 세대 1의 AP 담당 사건만 내구적 delivery 원장으로 재시도하고 429의 초 단위 Retry-After 또는 지수 backoff+jitter를 적용한다. 응답 분실도 같은 event ID와 새 timestamp/서명으로 재전송한다. 400/401/403/409/413은 blocked로 멈춰 운영 조치가 필요하다. Field 예약 사건 원장과 outbox를 재조정해 worker 재시작 뒤 누락 항목을 복구한다. AP는 rev 누락을 pending_gap으로 보류한다. 정식 재시도 한도·SLA·정기 원본 재조회·키 회전과 전환 중 결과 미상 복구는 후속이다.

## 4.10 위젯·동일 조건 설치

Field는 공개 AP SDK를 설치한다. AP의 서버 프레임 응답은 CSP frame-ancestors로 허용 origin을 제한한다. meta 태그로만 설정하지 않는다.[S04] postMessage는 origin·source·nonce·허용 스키마·크기를 검사하고 부모에 대화/권한 비밀값을 전달하지 않는다.[S03]

일반 외부 사이트와 Field 모두 API 공개키와 세션 범위가 같다. origin 확인만을 사용자 인증이나 서버 abuse 방지로 간주하지 않는다. 공개 세션 발급·비용·사용량 제한과 risk 검사를 같이 수행한다. 설정할 수 있는 URL·redirect는 등록된 HTTPS 경로로 제한하고 SSRF/내부망/metadata 주소 fetch를 금지한다.

`owned_embed` 설치는 campaign_id, publisher_id 없이 동작한다. `partner_card`만 campaign release·publisher approval·slot 검사가 필요하다. Field도 그 구분을 따르며 모든 위젯을 광고로 처리하지 않는다.

AP 사업자가 인가 화면에서 자기 조직의 활성 `placement_embed`를 정확히 선택한 경우, 공개 `GET /integrations/v1/deployments`는 `link`·`owned_embed`와 함께 그 배포를 반환한다(AP 계약 `1.0.0-preview.6`). 이에 따라 해당 매체 승인 카드에서 AP에 접수된 고객도 별도 Field 현재 조건 확인·동의 후 업무를 요청할 수 있다. 매체 배포를 Field 사이트 위젯 설치 대상으로 취급하지 않으며 Field 사이트 설치 후보는 여전히 정확한 소유 origin의 `owned_embed`뿐이다. 매체 카드/배포가 있다는 이유로 Field 권한을 자동 승인하지 않는다.

## 4.11 연결 해제·장애·삭제

| 상황 | AP | Field |
|---|---|---|
| Field 전체 장애 | AP native 상담/다른 사이트는 정상. Field 중요 사실·예약 도구는 중단 | 자체 복구. AP와 무관한 데이터 보호 |
| AP 전체 장애 | 원격 AI/대화 불가를 정확히 표시 | 사이트·직접 문의·달력·기존 예약 정상. AP 전송은 미전송/대기 |
| 연결 revoke | 연결 source/도구/Field 배포·위임 권한 중지; 다른 native/외부 배포는 유지 | 토큰 폐기·원격 읽기/쓰기 차단; 직접 업무·수신 예약 보존 |
| AP 구독 종료 | 신규 AI/배포 제한·기존 상담 정리 | Field 구독·예약은 유지, 알림 경로 재설정 안내 |
| Field 구독 종료 | 다른 사이트의 AP는 유지, Field 신규 업무는 제한 상태 표시 | 자기 종료 정책·기존 예약 정리 |
| 한쪽 삭제 요청 | 해당 제품 원본·권한·법적 보존별 처리 | 이미 적법하게 수신한 원본의 목적·보존을 별도 판단 |

revoke 요청을 받은 서버는 로컬 실행을 먼저 차단하고 원격 폐기 요청을 durable 재시도한다. 원격이 오프라인이라 즉시 모든 토큰이 사라졌다고 표시하지 않는다. 사용 시 연결 상태/만료를 검증하며 유효한 요청도 scope 밖이면 거부한다. 법적 권리·약관상 필요한 양쪽 데이터 정정·삭제 요청은 추적 ID로 분리 전달하고 결과를 기록한다. 상대 동의 없이 전체 조직을 삭제하는 API는 없다.

현재 로컬 양방향 연결 해제는 각 제품 owner 세션의 로컬 API가 자기 연결·source/설치·위임 grant를 먼저 회수하고 `pending/sending/retry/acked/blocked` 원장을 만든다. 별도 worker는 bind 때 양쪽에 저장한 연결별 32바이트 HMAC 키로 `timestamp.revocationId.connectionId.revoke`를 서명하고 상대 공개 `POST /integrations/v1/connections/{id}/revoke`에 `X-Key-Id`, `X-Revocation-Id`, `X-Timestamp`, `X-Signature`를 보낸다. 수신자는 정확한 연결/키, ±5분 시간창, 상수시간 서명 비교와 같은 ID 재전송을 검증한 뒤 200 영수증을 반환한다. 응답 분실은 같은 ID와 새 timestamp/서명으로 재시도한다. 한쪽 원격 회수 실패는 `retry` 또는 `blocked`로 남고 UI는 완료라고 주장하지 않는다. Field 위젯 설치와 새 위임 접근은 중지하되 AP 문의·Field 수신 예약/고객 확인키를 지우지 않는다. 로컬 mock의 AP API 실제 중단 중 Field 해제와 반대 방향 Field API 실제 중단 중 AP 해제를 각각 검수했다. 중단 중 상대 원장은 기존 연결을 유지하고 발신 원장은 `retry`를 표시했으며, API 재시작 뒤 같은 회수 ID로 ACK를 받았다. 두 경우 모두 자체 API·기존 문의/예약 확인키가 계속 작동했다. 이 서명 해제 경로는 현재 OAuth `manage` bearer 경로와 별도이며, OAuth manage 기반 범용 외부 client 해제 계약은 아직 구현되지 않았다. 운영 서버 장애, 재인가·구독 종료·삭제/보존과 알림 전환 중 결과 미상 복구는 후속이다.

Field source가 해제되면 그 값의 AP 사용을 중단한다. 데이터가 공개 정보였다는 이유로 AP native로 조용히 전환하지 않는다. 계속 쓰려면 권리와 최신성을 확인하고 AP 직접 등록·승인 절차로 새 source를 만든다. 다른 native source가 준비돼 있다면 그 범위의 상담은 유지한다.

## 4.12 공개 연동 API 최소 목록

### AP 제공 — Field 및 검증된 외부 통합자가 사용

| 경로 | 권한/필수 입력 | 결과 |
|---|---|---|
| GET /integrations/v1/me | AP 위임 token | 허용 조직·AI·scope·grant 상태 |
| POST /integrations/v1/connections | ap.connections.create, 현재 owner 위임/선택 조직·AI·client·grant, 외부 조직 UUID·정확 origin | installation_only binding, UUID 멱등 영수증 |
| GET /integrations/v1/connections/{id} | ap.connections.create, 같은 client·grant·조직·AI | 설치 전용 연결 상태 |
| GET /integrations/v1/connections/{id}/source | ap.sources.refresh, 현재 연결 | AP 저장/승인 source 버전·검토 상태·현재 snapshot 실제 수신 시각(nullable) |
| POST /integrations/v1/connections/{id}/source-refreshes | ap.sources.refresh, 예상 source 버전 |202 sync_job |
| GET /integrations/v1/connections/{id}/source-refreshes/{operationId} | ap.sources.refresh, 현재 연결 | 갱신 작업 상태·결과 |
| POST /integrations/v1/deployments | ap.deployments.manage, 자기 public 연결·정확 origin·선택 조직/AI, UUID key | owned_embed pending 준비; 검증/명시 활성은 별도 |
| GET /integrations/v1/deployments/{id} | ap.deployments.manage, 이 client+grant가 만든 배포 | 상태·소유 proof·revision/ETag |
| POST /integrations/v1/deployments/{id}/verify / activate / pause | ap.deployments.manage, 자기 배포·UUID key·If-Match | 실제 소유 검증/명시 활성/중지, 충돌409·조건 누락428 |
| GET /integrations/v1/conversations | read, 연결 제한 cursor | 최소 목록·출처·remote 상태 |
| GET /integrations/v1/conversations/{id}/messages | read, 범위·cursor | 원본 sequence |
| POST /integrations/v1/conversations/{id}/replies | user reply, message·revision·idempotency | 원본 message ID·저장/알림 상태 |
| POST /integrations/v1/connections/{id}/revoke | 현재 연결별 HMAC 서명; 범용 manage 동의는 후속 | AP 로컬 회수·서명 영수증 |
| POST /integrations/v1/field-events | 등록 서명·event envelope |202 durable inbox receipt |
| GET /integrations/v1/events/{id}/delivery | 연결 사건 read | processed/notification status |
| GET /integrations/v1/events/{id}/recovery-status | 해제 연결별 HMAC | 기존 사건 수신/처리·알림 상태 재조회 |
| POST /integrations/v1/notification-routes/close | 해제 연결별 HMAC·전환 ID·예약 마지막 사건 | 세대 1 종료 영수증. Field 활성화/발송 성공 아님 |

### Field 제공 — AP 커넥터 및 동일 계약의 외부 앱이 사용

| 경로 | 권한/필수 입력 | 결과 |
|---|---|---|
| GET /integrations/v1/capabilities | Field 위임 token | 이 연결에서 지원/허용된 도구 |
| GET /integrations/v1/facts | field.facts.read, ETag/version | 승인 snapshot·entity version·hash |
| GET /integrations/v1/availability | scope, service_id·revision·from/to | 요청 가능 구간만 |
| POST /integrations/v1/external-requests | create, ActionRequest·consent·idempotency | external_request_id·requested 상태 |
| GET /integrations/v1/external-requests/by-source/{actionId} | read, binding | 타임아웃 뒤 기존 수락 확인 |
| GET /integrations/v1/external-requests/{id} | `field.requests.read`, 연결 리소스 | 최신 상태·revision(ETag)·제안 (preview.9 구현) |
| POST /integrations/v1/external-requests/{id}/customer-decisions | `field.proposals.respond`, exact proposal·customer proof | 동의/철회 상태. 확정 아님 (preview.9 구현) |
| GET /integrations/v1/external-requests/{id}/notification-route | `field.notification_route.read` | 소유 제품·generation·허용 여부 (preview.9 구현) |
| POST /integrations/v1/customer-handoffs | `field.customer_access.create`, AP 확인키·accepted action·연결 예약 | 5분짜리 1회 Field 코드 발급 |
| POST /v1/customer-handoffs/exchange | 1회 고엔트로피 코드 | Field 예약 확인키 발급·이전 키 폐기 |
| POST /integrations/v1/connections/{id}/revoke | 현재 연결별 HMAC 서명; 범용 manage 동의는 후속 | Field 로컬 회수·서명 영수증 |
| POST /integrations/v1/webhooks/agent | 등록 서명 |202 durable inbox receipt (preview.9 구현) |

Field 계약 `field-integrator-v1.openapi.json` **1.0.0-preview.9**에서 위 네 경로를 구현했다. Field ID 조회와 알림 경로 조회는 by-source와 같은 현재 연결·client·actor·grant에서만 열리고 다른 연결의 요청은 404다. 고객 결정은 Field 고객 수락(`proposed→customer_accepted`, `change_proposed→change_accepted`)과 첫 제안의 고객 취소 요청(`proposed→canceled`) 전이를 그대로 재사용하며 예약을 확정하지 않는다. 정확한 현재 제안 revision·원본 대화 ID·24시간 내 고객 결정 기록을 요구하고, 같은 멱등 키·본문은 200 재응답, 다른 본문·같은 고객 기록 재사용은 409다. 제안을 거절하면서 요청을 유지하는 고객 전이가 Field에 없으므로 `decline`은 400 `decision_not_supported`, 변경 제안의 철회는 확정 예약 취소가 되므로 409 `decision_not_supported`다. 알림 경로는 Field 알림 경로 전환 원장에서 계산하며 세대 2 활성/중지는 Field 담당·AP 발송 불가다. AP 사건 수신함은 `application/vnd.agent-event+json` 원문 바이트에 연결별 HMAC(`timestamp.event_id.raw_body`)을 검증한 뒤 `field.ap_webhook_inbox`에 내구 저장하고 202를 반환한다. `connection.revoked`는 `correlation_id`를 AP 해제 ID로 써서 서명 해제 경로와 같은 로컬 회수를 적용하고, 그 외 사건은 기록만 한다. AP 쪽 발신기·고객 결정 BFF/화면과 새 scope 재동의 흐름은 아직 없다.

현재 AP 계약 파일은 `agent-integrator-v1.openapi.json` **1.0.0-preview.10**이며, 설치 쓰기 subset은 preview.9에서 고정된 그대로다. `ap.connections.create`/`ap.deployments.manage`는 client 등록과 AP owner의 조직·AI 선택, 실제 OAuth 동의/token 모두에 명시해야 한다. `externalOrganizationId`는 caller-side 설치 식별값이며 Field actor/조직 동의나 양방향 정보·예약 binding의 증거가 아니다. Field와 일반 외부 client는 같은 경로·scope·origin proof·권한을 사용한다. 현재 Field HTTP consumer 모듈은 이 계약을 소비하지만 사업자 새 BFF/화면 호출과 새 scope 재동의 사용자 흐름은 후속이다.

신규 public 설치 write는 UUID `Idempotency-Key`를 쓰며 기존 reply/source refresh의 43자 base64url key는 유지한다. 같은 client+grant+operation+target/key와 정규 요청 본문/If-Match는 저장된 결과로200 복구하고, 변경 내용 재사용은409 `retryable:false`다. 배포 변경은 quoted revision `If-Match`를 사용하며 native 상태 변경도 revision을 진행한다. owner 위임/token 만료·회수 또는 현재 membership 상실은401, 누락 scope403, 다른 조직/AI/client/grant/native 배포는 안전한404다. 관리 API는 pending·verifiedAt·active·paused를 구분하고 실제 origin 검증 없이 active를 만들지 않는다. 성공 응답은 `request_id`, `operation_id`, `state`, `retryable`을 포함하고 오류는 `request_id`·rejected 상태·재시도 가능 여부를 구분한다. 저장 뒤 응답 유실/형상 오류는 같은 UUID로 복구하고 새 연결/key로 우회하지 않는다.

배포 생성은 기존 `allowed_deployment_ids`와 대화 읽기 권한을 자동 확장하지 않는다. 새 배포 상담 원문은 AP owner의 별도 선택/재동의가 필요하다. 기존 native selection 회수는 해당 grant의 새 public 설치만 paused로 전환하며 다른 native 배포·예약·구독·원본을 보존한다. 이 설치 전용 경로는 기존 양방향 Field bind나 후속 범용 OAuth revoke를 대신하지 않는다.

write의 Idempotency-Key는 제품+client+connection+operation 범위다. 같은 키·다른 body는409. 변경 객체에는 If-Match/expected_revision을 쓴다.400 입력,401 인증,403 권한,404 안전한 미존재,409 충돌/조건 변경,410 해제/만료,429 사용량,503 일시 장애를 명확히 반환한다. 응답은 `request_id`, `operation_id`(비동기), `state`, `retryable`을 포함하고 개인정보를 오류 문구에 넣지 않는다.

### 계약 변경 정책

API major 버전과 event `spec_version`은 문서 release v3.0과 독립이다. enum 추가도 exhaustive client 영향 검토가 필요하다. 호환 가능한 추가는 contract test 후 적용하고 breaking 변경은 새 API major/dual support/이행 계획으로 처리한다. 최소 이전 지원 버전·지원 기간은 계약 정책으로 고정한다. 런타임은 모르는 필드를 조용히 권한으로 취급하지 않는다.

AP+Field 두 코드베이스가 공유할 수 있는 것은 versioned OpenAPI·JSON Schema에서 생성한 클라이언트와 명세다. domain service·repository·DB 타입·내부 ORM 모델은 공유하지 않는다.
