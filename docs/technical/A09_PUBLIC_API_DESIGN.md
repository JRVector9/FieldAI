# A09 AP 공식 통합자 인가·공개 API 설계 — 2026-09-24

## 현재 작업 범위

`TASKS.md` A09, AP PRD 2.10, 연동 계약 4.2~4.5, QA129~133을 따른다. AP가 자체 인가 서버·리소스 서버다. Field는 일반 통합자와 같은 HTTP 계약으로 접근하며 AP 내부 코드·DB를 import하지 않는다. 현재 작동 범위는 등록된 BFF client의 Authorization Code + PKCE(S256), AP owner가 고른 조직·대표 AI·기존 배포, `ap.agent.read`·`ap.conversations.read` 공개 읽기, `ap.conversations.reply` 사람 답변, `ap.sources.refresh` 검토용 source 갱신 요청이다. 설치 관리·나머지 운영 scope, 전체 QA/출시 게이트는 이어 구현하며 A09 전체를 완료로 표시하지 않는다.

## 2026-09-25 source refresh 증분

AP 공개 OpenAPI preview.7에 source 현재 버전 GET·갱신 POST·작업 상태 GET을 추가했다. 43자 base64url 멱등 키와 예상 AP 저장 버전으로 AP durable job을 만들고, worker가 Field 공개 facts를 재조회해 기존 AP 지식 source의 `pending_review`로 저장한다. 같은 키의 응답 분실은 작업 하나로 수렴한다. `ap.sources.refresh` 없는 token·기존 연결은 거부하고, Field owner BFF는 자기 연결/조직/actor를 재검사한다. 자동 사업자 승인이나 고객 AI 공개는 없다. 기존 OAuth resource DB의 허용 범위는 새 설정만으로 갱신되지 않아 `000054_oauth_resource_source_refresh_scope.sql`로 기존 AP resource에 범위를 추가했다. 실제 운영 client는 별도 등록·재동의가 필요하다.

## 2026-09-25 Field 승인 변경 사건 증분

AP 공개 OpenAPI preview.8은 `/integrations/v1/field-events`에 예약 사건과 별도로 최소 `field.facts.changed` envelope를 받는다. 같은 연결별 HMAC 검증·5분 시간창을 적용하고 현재 owner·grant·scope·동의를 확인한다. 제품 전체 event ID 수신 원장으로 다른 종류의 사건까지 중복/본문 충돌을 구분하고, 사실 변경 inbox는 수신 뒤 내구 갱신 작업을 만든다. worker는 Field 공개 facts를 다시 읽고 AP source를 `pending_review`로 저장한다. 해제와 저장이 경합하면 connection row 잠금/재검사로 해제 후 source 재활성화를 막는다. Field 전송 실패는 연결별 내구 원장에 남고 승인 release/outbox에서 최신 상태를 재조정한다. AP 사업자 승인·AI 지식 공개는 자동 수행하지 않는다.

## 2026-09-25 AP 상담의 연결 근거 확인 증분

AP owner 테스트와 고객 AI는 승인된 connector release의 Field 사실을 모델에 전달하기 전 공식 Field facts API로 revision/hash를 확인한다. 생성된 문장이 `field:*` 근거를 사용하면 저장/표시 전 다시 확인한다. 확인 실패에는 AP native 지식과 사람 인계 안내를 유지하며 Field 근거 답변은 보류한다. 한 번의 AI 답변용 Field `/me` 장애는 연결 원장을 `degraded`로 바꾸지 않고 그 답변에만 반영한다. 실제 동일 버전 확인은 source의 `fetched_at`을 갱신한다. 숫자·가격·예약 조건은 connector AI 근거에 싣지 않는다.

## 흐름과 권한 경계

1. AP Better Auth OAuth Provider가 client 등록, exact redirect URI, code+PKCE, 동의, token/refresh/revoke를 담당한다. AP resource만 client에 연결하고 Field scope를 허용하지 않는다. client secret은 BFF에서만 사용하며 브라우저/SDK에 내보내지 않는다.
2. OAuth authorize는 해당 session에 유효한 선택이 없을 때 `/connect/select`에 들른다. 로그인한 owner가 실제 AP membership의 조직·대표 AI와 기존 배포만 선택한다. AP DB의 짧은 수명 selection 행에는 session ID, actor ID, client ID, 조직 ID, AI ID, 허용 배포 ID, 선택한 scope, 만료·폐기를 기록한다. 상호명·이메일로 조직을 자동 고르지 않는다. 기존 선택의 짧은 유효기간 안에 다른 연결 요청이 오면 동의 화면은 client/scope 일치 여부를 확인하고, 최종 resource API는 token의 client와 선택 client 일치를 재검사한다.
3. OAuth Provider의 `postLogin.consentReferenceId`가 현재 session의 selection ID를 code/token `referenceId`로 바인딩한다. 별도 `/consent` 화면이 client 이름·선택 조직/AI·요청 scope를 보여 주고 명시 동의/거부를 OAuth Provider endpoint로 전달한다. 취소는 token을 발급하지 않는다.
4. AP 공개 API는 AP issuer가 만든 opaque access token의 해시, 만료·revoke·client/resource/scope/user/reference ID를 자기 DB에서 확인한다. 선택 행의 client/actor, 현재 AP membership, 현재 승인 AI ID와 조회 배포의 조직·활성·철회 상태를 재확인한다. 상대 제품 token 또는 API token을 AP 로그인 쿠키로 바꾸지 않는다.
5. `GET /integrations/v1/agent`는 선택한 AI의 현재 승인 버전·최소 공개 상태만, `GET /integrations/v1/conversations` 및 `/{id}`는 선택된 배포에 속한 AP 원본의 최소 인덱스·현재 revision만 제공한다. 고객 공개 메시지는 별도 cursor 경로로 읽는다. 내부 메모·확인키·사진·전화·타 채널 대화는 제외한다. 무권한/타 조직은 동일한 404를 반환한다.

## 검사와 미완료

DB 검수는 등록→선택→동의→code 교환→bearer 공개 조회, 조직/배포/scope 위조, 타 사용자 철회, 선택 외 배포·내부 메모/연락처 비노출, 철회 후 거부를 확인했다. 답변 scope를 별도 선택한 code/token으로만 원본에 사람 답변을 쓰고, revision 충돌·재시도 중복·선택 외 원본·고객 공개 cursor·감사 필드·outbox/알림 원장을 확인했다. 기존 OAuth resource에 저장된 scope 목록이 갱신되지 않아 새 답변 권한이 누락되던 문제는 `000029` migration으로 수정했다. `pnpm test:spike:contracts:agent`는 OpenAPI 미리보기의 정적 검사와 AP 실제 응답 형상 검사를 통과했다. 별도 OAuth spike에서 PKCE·잘못된 resource/scope·token revoke와 AP/Field issuer 교차 거부를 확인했다. Chrome 320px에서 조직·AI·배포·scope 명시와 허용 후 callback을 확인했다. 거부 버튼·새로고침 후 선택·refresh 재사용, 다른 client의 악의적 동시 인가, 정식 공격 검수는 미실행이다. 실제 두 제품 연결, 역방향 Field 동의, 운영 client 심사, 설치 관리·source/event/revoke scope, 완성된 양방향 OpenAPI/consumer test도 미완료다.

## 구현된 공개 원본 API 계약

- `GET /integrations/v1/me`: AP access token의 선택 ID, 조직 ID, AI ID, 허용 배포 ID, 실제 token과 선택 양쪽에 있는 AP scope, `active` 상태를 반환한다. AP 이메일·조직 전체 회원 목록은 반환하지 않는다.
- `GET /integrations/v1/conversations/{id}/messages?after=<sequence>&limit=<1..100>`: 선택된 활성 배포의 고객 동의 대화만 읽는다. `after`는 배타적 양의 sequence(기본 0)이며 고객에게 공개된 메시지만 오름차순 반환한다. 내부 메모·고객 연락처·확인키·사진은 없다. 선택 밖 ID는 404다.
- `POST /integrations/v1/conversations/{id}/replies`: 사람의 AP authorization-code 위임 token에 `ap.conversations.reply`가 있어야 한다. body는 `{body,expectedRevision}`(1~5000자·정수), `Idempotency-Key`는 43자 base64url이다. 선택된 활성 배포/동의 원본의 현재 revision을 잠근 뒤 비교하며 stale 또는 닫힌 대화는 409다. 같은 client+grant+대화+키+본문/expectedRevision 재전송은 이전 message ID/전달 상태로 200 복구하고 같은 키·다른 본문은 409다. 새 답변은 AP 원본 message, revision/sequence, AP outbox·고객 알림 원장을 한 AP DB transaction에서 기록한다. 공급사 미연결이면 `delivery=blocked_integration`이고 실제 발송 성공은 주장하지 않는다.
- OAuth `ap.conversations.reply`는 읽기 scope와 별개로 명시 선택한다. 브라우저/설치 SDK에서 BFF client secret·refresh token을 다루지 않는다. 이 경로는 Field가 자신의 계정만으로 AP owner를 사칭하는 방법이 아니다.
