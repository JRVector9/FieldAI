# I00 Field 역방향 OAuth 부분 구현 — 2026-09-25

## 범위와 계약

`TASKS.md` I00, 연동 계약 4.2~4.4, QA129~132와 G-I1을 따른다. Field가 독립 issuer/resource server이고 AP는 이후 등록된 일반 외부 BFF client로 Field에 접근한다. 이번 구현은 Field owner의 조직 선택과 `field.facts.read` 동의, 승인 카탈로그 사실 읽기까지다. AP 계정·DB·세션을 Field 인가에 사용하지 않는다.

Field의 Authorization Code + PKCE(S256)는 Better Auth OAuth Provider가 처리한다. Field `/connect/select`에서 현재 Field session의 owner가 사업장을 선택하고 요청 scope를 확인한다. 5분 선택 원장은 session·actor·client·조직·scope를 묶고 OAuth consent reference ID가 된다. `/consent`는 사업장·client·scope를 표시하며 허용/거부한다. 공개 bearer API는 opaque token hash, issuer resource, client, actor, 선택, consent, 현재 owner membership, 만료·철회를 Field DB에서 확인한다. API token은 Field 로그인 쿠키가 아니다.

`GET /integrations/v1/me`는 선택 grant의 조직·실제 scope·상태만, `GET /integrations/v1/facts`는 해당 조직의 최신 승인 `catalog_releases`에서 출처 release ID/revision/hash/승인 시각과 사업·서비스 정보를 반환한다. 초안·연락처·고객·예약·내부 메모는 반환하지 않는다. `POST /integrations/v1/authorization/selections/{id}/revoke`는 Field access/refresh token과 consent를 철회하고 사이트·직접 문의·예약 원본은 유지한다. 현재 구현 경로의 정확한 형상은 `contracts/field-integrator-v1.openapi.json` 미리보기다.

## 실제 검수와 상태

`pnpm test:spike:integrator:field`는 미구현 options 404를 의도한 red로 확인하고, 구현 후 실제 Field PostgreSQL에서 owner/타 사용자·금지 scope, 동의 거부/code 미발급, code+PKCE/동의/token/bearer, 승인 사실만 공개·연락처 제외, 타 사용자 철회 404·철회 뒤 bearer 401을 확인했다. `pnpm test:spike:contracts:field`는 정적 계약 1/1과 provider DB 1/1을 통과했다. `pnpm test:spike:oauth:field` 2/2, 교차 issuer/token의 API 401 검수 1/1, Field 사업/문의 회귀 2/2, lint/typecheck/unit·양쪽 API 빌드·Field 웹 빌드·제품 import/DB 자격증명 격리 exit 0이다. Field 320px Chrome에서 선택→동의→합성 외부 callback code, 가로 넘침 없음·page error 0건을 확인했고 합성 계정/조직을 정리했다. AP/Field 단독 API readiness spike는 각각 자기 DB·인증 설정만 가진 별도 child에서 통과했다.

기존 Field OAuth spike는 resource 수동 연결/즉시 consent를 기대해 새 흐름과 달랐고, selection→continue 동작으로 기대를 갱신했다. 서버 선택 API 기대 테스트는 최초 404로 실패했다. 브라우저 버튼의 터치 높이가 작아 44px로 보강하고 다시 빌드·검수했다. 테스트 실패를 서비스 성공으로 처리하지 않았다.

I00 전체는 `in_progress`다. 실제 AP BFF가 Field client로 code를 교환·보관하고 두 조직을 한 connection에 명시 매핑하는 마법사, Field 나머지 scope·capabilities·양방향 revoke/재인가·보안 심사·정식 QA129~132는 남았다. 거부 후 AP 설치 유지도 실제 두 제품 연결 E2E로 검수해야 한다. 실제 운영 client 심사와 로그인 공급사/도메인은 `blocked_integration`이다. `pnpm test:contracts`, `test:integration:faults`, `test:security`는 통과한 게이트가 아니다.

## Field→AP 첫 승인 추가 — 아직 연결 활성화 전

Field owner 세션이 자기 조직에서 `POST /v1/connections/ap/start`를 호출하면 서버가 state hash와 암호화한 PKCE verifier를 10분 시도로 저장한다. AP issuer/client/redirect는 Field 서버 설정으로 고정하고, AP OAuth에는 `openid offline_access ap.agent.read ap.conversations.read`를 요청한다. AP에서 동의하면 세션 쿠키 없는 Field callback이 state·iss·현재 Field owner membership을 검사해 AP token을 code로 교환한다. AP `/integrations/v1/me`와 `/agent`의 조직·AI·scope·상태를 다시 확인한 뒤 Field의 별도 DB에 AES-256-GCM으로 access/refresh token을 저장한다. Field 화면과 목록에는 token/secret이 없고 상태는 `pending_field_consent`다. 중복 callback은 기존 결과로 돌아가며 token을 재교환하지 않는다. 실패 결과 미상은 `unknown`으로 보존하고 자동 재교환하지 않는다.

AP refresh 발급과 rotation에는 `offline_access`가 client/인가/resource scope 모두에 필요해 AP 기존 resource row migration `000030`을 추가했다. Better Auth 1.7.5의 실제 초기 token 응답 scope에는 `openid`가 빠지고 `offline_access`가 포함되므로 Field는 표준 OIDC 요청과 token 응답 검사를 구분한다. 로컬 AP provider는 HTTP loopback `web` client 등록을 거부해 mock에서만 등록 secret이 있는 `native` client의 AP 선택 API 접근을 허용한다. `sandbox/live`에서는 HTTPS `web` client 등록·심사가 필요하다.

실제 두 mock 서버의 HTTP code 교환과 AP `/me`·`/agent` 확인, Field 암호화 pending 원장·중복 callback을 `pnpm test:spike:ap-field:http` 1/1로 검수했다. Field BFF DB 기대 테스트 404 red→1/1 green, AP refresh 400/rotation red→OAuth 2/2 green을 확인했다. 브라우저는 Field 연결 화면의 320px 비로그인/비활성 상태만 확인했으며 AP 동의 화면에서 돌아오는 전체 브라우저 흐름은 미실행이다. Field 역방향 동의 token을 AP BFF가 보관하고 양쪽 조직·actor를 매핑해 `active`로 만드는 후속 I00/I01이 남는다.

## AP→Field 별도 동의와 양쪽 연결 기록 — 2026-09-25

Field owner의 첫 AP 승인이 `pending_field_consent`가 되면 Field의 연결 목록은 connection ID와 AP grant ID를 AP 연결 화면에 전달한다. 두 ID는 인증 비밀값이 아니며 AP 서버는 현재 AP owner membership·해당 grant의 client/actor/조직·동의와 refresh 유효성을 다시 검사한다. AP BFF는 별도 state hash·암호화 PKCE verifier를 가진 10분 시도를 만들고 Field OAuth에 `openid offline_access field.facts.read`를 요청한다. Field owner는 별도 Field 계정으로 조직·scope를 선택해 동의한다. callback은 issuer/state/actor와 Field 공개 `/me`의 grant·조직·scope를 검사하고 access/refresh를 AP DB의 키로 AES-256-GCM 암호화 저장한다. token은 브라우저·상대 제품 로그인·공유 DB에 넣지 않는다.

AP는 Field bearer로 공개 `POST /integrations/v1/connections/{id}/bind`를 호출한다. Field는 등록된 역방향 AP client만 받고 자신의 Field grant 조직·actor와 기존 `pending_field_consent` 원장, 저장된 AP grant의 AP `/me` 결과를 대조한다. 같은 요청 반복은 같은 결과를 반환한다. 두 원장은 동일 connection ID와 `review_required` 상태를 기록한다. 이 상태는 양쪽 동의가 기록됐다는 뜻이며 Field 정보 sync·AP 지식 승인·위젯 설치·예약 도구 활성 상태가 아니다. 호출 결과가 불명확하면 AP는 `binding_unknown`으로 보존하고 자동 재요청하지 않는다.

Field OAuth 기존 resource에 `offline_access`를 추가한 migration `000021`, Field 연결 binding migration `000022`, AP 연결 원장 migration `000031`을 적용했다. 로컬 mock의 AP BFF client는 `pnpm setup:mock:field-connector`로 Field에 등록하며 secret은 무시된 제품별 `.env`에만 둔다. Better Auth의 HTTP loopback `web` client 제한 때문에 mock에서만 등록된 `native` client를 선택 API에 허용한다. `sandbox/live`의 HTTPS 웹 client 심사와 실제 운영 인증은 별도다.

Field refresh rotation 2/2, AP·Field DB 연결 테스트 각 1/1, 실제 두 API 서버의 양방향 code 교환·bind HTTP 1/1, Field 공개 계약 정적+DB 각 1/1을 실행했다. AP/Field 연결 웹을 빌드해 각 320px Chromium의 HTTP 200·가로 넘침 없음·page error 0건을 확인했다. 전체 브라우저 로그인→두 동의 버튼 경로와 결과 미상 복구·refresh 사용·revoke/재인가·source/deployment 매핑·기능 발견·정식 보안/출시 QA는 미검수다. I00/I01은 모두 `in_progress`이며 운영 승인이 아니다.

## 로컬 두 계정 브라우저 검수와 AP grant 갱신 — 2026-09-25

브라우저 쿠키는 포트별로 분리되지 않는다. 기존 mock에서 AP/Field를 모두 `localhost`로 열면 `better-auth.session_token` 하나를 공유해 Field 로그인 뒤 AP `/get-session`의 user가 사라지는 것을 재현했다. 두 제품의 운영 domain 격리 규칙을 로컬에서도 검증하기 위해 AP 웹은 `localhost:3001`, Field 웹은 `127.0.0.1:3002`를 사용한다. `pnpm setup:mock:ap-connector`는 기존 개발용 Field 웹 origin도 이 주소로 이전한다. 이 설정으로 Chromium 320px에서 Field owner의 AP 연결 시작→AP owner의 조직·AI 선택/동의→Field owner의 사업장 선택/동의→AP/Field `review_required`까지 브라우저 클릭·HTTP/DB 결과를 확인했다. page error와 가로 넘침은 없었고 합성 계정·조직을 삭제했다.

Field가 보관한 AP access token의 만료가 30초 이내면, Field는 저장된 refresh token으로 AP 공개 OAuth token endpoint에 요청한다. AP가 새 access/refresh를 발급하면 두 값을 Field 키로 다시 암호화해 같은 Field DB 원장에 기록하고 AP 공개 `/me`에서 조직·AI·scope가 그대로 유효한지 검사한 후에만 bind를 `review_required`로 끝낸다. refresh 오류나 결과 미상, AP `/me` 실패 또는 권한 변경은 Field 연결을 `degraded`로 보존하고 같은 연결에서 자동 재시도하지 않는다. 별도 새 인가가 필요하며 기존 Field 사이트·직접 문의·예약 원본은 그대로 유지한다. DB 테스트에서 성공 rotation·실패 후 중복 bind 차단, 실제 AP provider를 쓰는 두 서버 HTTP에서 강제 만료→rotation→bind를 확인했다.

양방향 grant/connection 철회·재인가, binding unknown 재조정, Field 사실 sync·설치·업무 요청, 운영 HTTPS client/공급사, 정식 QA/G-I1은 아직 구현/검수 전이다.

## AP 보관 Field grant 갱신과 승인 정보 검토 — 2026-09-25

AP 조직 owner가 `review_required` 연결의 검토 버튼을 누르면 AP 서버는 현재 owner와 AP grant refresh 유효성을 확인한 뒤 Field 공개 `/me`와 `/facts`를 호출한다. Field access token 만료가 30초 이내면 Field OAuth refresh endpoint에서 한 번 회전하고 새 token을 AP DB 키로 암호화 저장한다. Field grant ID·조직·scope 불일치나 갱신 결과 미상은 `degraded`로 보존하고 같은 연결에서 자동 재시도하지 않는다. 다른 조직의 facts 응답은 502로 거부한다. 검토 응답은 `pending_review`이며 AP 공개 지식이나 AI 답변에 쓰지 않는다.

AP migration `000032`, AP DB 테스트 1/1, 실제 양쪽 서버 HTTP에서 Field 카탈로그 승인→AP 만료 token 강제→rotation→검토 조회 1/1, Chromium 320px 두 동의→검토 화면과 가로 넘침/page error 0건을 확인했다. signed event·AP 명시 승인/KnowledgeRelease·중요값 live 재확인, 양방향 revoke·unknown 복구와 정식 QA/G는 남았다.

## I02 AP source snapshot 원장·충돌 격리 — 2026-09-25

AP source 원장은 Field 공개 `/facts` 응답의 허용 필드만 수용한다. AP owner와 유효한 양쪽 grant/조직·scope를 확인한 뒤 `ap.knowledge_sources`에 connection·Field 조직·latest revision/hash와 상태를, `ap.knowledge_source_snapshots`에 불변 승인 원문을 기록한다. Field 서비스별 entity revision은 현재 공개 계약이 제공하지 않으므로 `entity_versions={}`이고 전체 catalog revision을 비교한다. 같은 버전·hash는 멱등, 하위 버전은 최신 포인터를 내리지 않는다. 같은 버전의 다른 hash는 `ap.knowledge_source_integrity_conflicts`에 분리 보관하고 source를 `integrity_conflict`로 두며 outbox에 알린다. 현재 저장만으로 AP native KnowledgeDraft/Release를 덮거나 AI 근거로 사용하지 않는다. Field가 응답에 넣은 contactPhone·내부 메모 등 계약 밖 필드도 버린다.

`POST /v1/connections/field/{id}/sync`는 원격 검증과 저장을, `GET /v1/connections/field/{id}/source`는 AP owner의 저장본 재열람을 담당한다. 후자는 Field API 장애/토큰 degraded여도 기존 AP 자료를 읽을 수 있다. AP DB 기대 테스트의 새 경로 404 red→구현 green 1/1, 실제 별도 두 서버 HTTP에서 서비스·가격 포함 snapshot 1/1, Chromium 320px 저장→새로고침→재열람 1회가 통과했다. KnowledgeRelease/AI 근거 결합, 중요한 가격·운영조건 실시간 확인, signed facts.changed 이벤트/누락 재조정과 정식 QA/G는 아직 남았다.

## I02 AP source 명시 승인 — 2026-09-25

AP owner는 저장본의 정확한 `source_revision`/`content_hash`를 검토하고 확인 표시 후 `POST /v1/connections/field/{id}/source/approve`를 호출한다. AP는 당시 Field 공개 grant/조직/scope와 `/facts`의 최신 revision/hash를 재검증한다. 저장본과 원격이 다르거나 Field API가 응답하지 않으면 승인하지 않는다. `integrity_conflict`도 별도 해결 전에는 승인할 수 없다. 승인 처리 시 actor·시각·승인 source revision·outbox 한 건을 AP 트랜잭션에 기록한다. 반복 요청은 같은 승인으로 돌려준다. Field에 새 승인본이 나타나 sync되면 새 source는 다시 `pending_review`이고 이전 승인 revision은 기록으로 유지된다. AP native 지식과 고객 AI 공개는 아직 변경하지 않는다.

AP migration `000034`, AP DB 기대 테스트 404 red→1/1 green, 실제 두 API HTTP 승인 1/1, Chromium 320px 저장→확인 체크→승인→새로고침 상태 재열람 1회 통과. KnowledgeRelease 합성/AI 근거와 가격·예약 조건의 live 재확인, source mapping, signed event와 정식 QA/G-I2는 남는다.

## I02 승인 Field 설명의 AP KnowledgeRelease·AI 근거 — 2026-09-25

AP migration `000035`는 `knowledge_releases`에 native `draft_revision`과 connector `source_id/revision/hash/selection`을 추가한다. 조직의 `revision`은 공개 순서이고 직접 입력 초안의 `draft_revision`과 별개다. native 공개는 조직 row 잠금 아래 전체 공개 순서를 올린다. Field 설명 공개도 같은 잠금 아래 최신 native 공개본을 바탕으로 원격 Field `/me`·`/facts`와 source 승인 revision/hash를 재검증한다. owner가 사업 소개/지역과 서비스 ID를 명시 선택한다. 직접 입력 서비스와 같은 이름은 409로 중단하고 자동 병합하지 않는다. 같은 source/selection 재시도는 기존 release를 반환한다. Field 가격·영업시간·예약 방식은 AI 정적 근거에 넣지 않고, 숫자가 포함된 설명도 별도 검토 전 거부한다.

새 KnowledgeRelease는 기존 AgentRelease를 자동 갱신하지 않는다. AP owner가 AI 설정에서 새 knowledge revision을 승인해야 고객 배포가 다시 열릴 수 있다. 실제 AI 요청에서는 connector release의 source가 `current`, 같은 승인 revision/hash, 연결 `review_required`, 최근 24시간 확인을 만족할 때만 `sourceFacts`를 전달한다. 조건이 깨지면 native facts만 전달한다. 공개 조직 조회에는 connector 내부 `sourceFacts`를 내보내지 않는다. signed 변경 이벤트·누락 재조정과 가격/예약/시간 중요값의 요청 직전 Field live 조회는 아직 미구현이다.

AP DB 연결 1/1(명시 선택·멱등·native/public revision 분리·AI 근거 current/stale), 기존 사업 지식 2/2·AI 2/2·상담 1/1, 실제 양쪽 mock API HTTP 1/1(지식 공개→AI stale→재승인), Chromium 320px UI 선택·공개·재열람 1회, lint/typecheck/unit/build/import/DB 격리 통과. Git 저장소는 없다.

## I01 Field 공개 기능 발견·AP owner 소비 — 2026-09-25

Field 공개 OAuth bearer `GET /integrations/v1/capabilities`는 `schemaVersion=1.0`과 선택 조직, `facts.read=true`, `availability.read=false`, `request.create=false`, `proposal.respond=false`를 반환한다. 지원 여부는 해당 조직의 동의 scope·승인 카탈로그 존재·설치 상태와 별개다. `/me` scope와 실제 endpoint 응답을 AP가 계속 확인한다. OpenAPI preview의 제공자 응답을 Field DB 계약 테스트로 검증한다.

AP `GET /v1/connections/field/{id}/capabilities`는 AP owner/기존 AP grant와 Field refresh token의 유효성 및 Field `/me` grant·조직·scope를 재검증한 뒤 공개 Field endpoint만 호출한다. 원격 타 조직·잘못된 형식/장애는 502, 지원하지 않는 계약 버전은 409다. 브라우저에 원격 token을 노출하지 않는다. AP 화면은 지원/미지원 기능을 현재 결과로 표시하며 예약/요청을 가능한 기능처럼 제공하지 않는다. Field 정적 계약+DB 각 1/1, AP DB 1/1, 실제 양쪽 서버 HTTP 1/1, Chromium 320px 1회 통과. 기능별 부분 상태·실제 설치·업무 요청과 정식 QA/G는 남는다.
