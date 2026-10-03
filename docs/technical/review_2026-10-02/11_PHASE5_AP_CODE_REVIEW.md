# Review E — AP(apps/agent-api, apps/agent-web) 미커밋 변경 검토 (HEAD 196befc)

범위: `git diff HEAD -- apps/agent-api apps/agent-web` + 신규 `apps/agent-api/src/field-signature.ts`. 파일 수정 없음.

## 실행한 검수
- `tsc --noEmit` agent-api / agent-web: 통과
- eslint(변경 src·test 13개 파일): 위반 0
- `node tools/run-db-suite.mjs agent test/auth-kakao.db.test.ts test/field-customer-decisions.db.test.ts test/field-actions.db.test.ts test/field-connection.db.test.ts test/revocation-restore.db.test.ts`: 12/12 통과 (mock, 격리 DB)
- `npx tsx --test apps/agent-web/test/kakao-sign-in.test.tsx`: 6/6 통과
- `kakaoTwoFactorReturnUrl` 직접 실행(까다로운 입력 14개). 결과는 아래 "확인함, 문제 없음" 참고.

## 발견 사항 (심각도 순)

### M1 (Medium, 알림 정합성) 수신함 경로 캐시에 유효시간이 없어 오래된 경로를 다시 씀
- 위치: `apps/agent-api/src/field-event-worker.ts:16,34-35`, `apps/agent-api/src/field-event-inbox.ts:302-319`
- 캐시 키는 `connection_id:external_request_id`뿐이고 시각·세대 정보가 없다. 비우는 시점은 수신함이 `'empty'`를 돌려줄 때 하나뿐이다. 예외가 나서 catch로 가거나 앞 단계 큐가 `continue`하는 동안에는 비워지지 않는다.
- 큐가 계속 차 있으면(트래픽이 꾸준하거나 다른 큐가 바쁠 때) 처음 조회한 `owner:'ap', allowed:true`가 같은 예약의 뒤 사건에 기한 없이 다시 쓰인다. 그 사이 Field 경로가 `route_transfer_pending`이나 `field_route_active`로 바뀌어도 AP가 `blocked_integration`(발송 대상) 알림을 만든다. 같은 사건을 두 제품이 모두 알릴 수 있어 AGENTS §2 "하나의 사건은 한 제품만" 규칙에 어긋난다. Map 크기에도 상한이 없다.
- 최소 수정: `{ route, at }`로 저장하고 짧은 TTL(예: 10초) 안에서만 재사용한다. catch 경로에서도 `clear()`한다. 테스트 10-1이 요구하는 "같은 배치 2건에 조회 1번"은 TTL 방식으로도 유지된다. 더 보수적으로 가려면 같은 inbox row의 재실행에만 쓰도록 키에 `row.id`를 넣는다.

### M2 (Medium, 동작 회귀·결정 필요) push 경로의 404가 고객 알림을 영구 생략으로 기록함
- 위치: `field-event-inbox.ts:211-213` → `field-actions.ts:142` → `field-connector.ts:229-250`
- push 경로는 `fieldResourceForCustomer`를 그대로 재사용한다. 이 함수의 404(`connection_not_available`) 조건에는 경로와 무관한 AP 내부 상태가 섞여 있다. 배포가 `active`가 아님(일시중지), 문의 `consent_at` 없음, actor의 owner 멤버십 변경, `oauthRefreshToken` 만료, `visitor_key_hash` null(보존 정리)이다.
- 404는 `unknownRoute`가 되어 `notification_events.state='not_applicable', suppression_reason='route_unknown'`으로 기록되고 재시도하지 않는다. HEAD에서는 같은 상황에서 AP 담당 알림을 기록했다. 지금은 배포를 다시 켜도 그 사건의 알림이 복구되지 않는다. Field는 세대 1에서 AP가 담당한다고 보므로 고객이 어느 제품에서도 알림을 받지 못할 수 있다. 주석은 보존 정리 경우만 설명한다.
- 선택지(결정 필요):
  - (a) push 경로에서 `visitor_key_hash`가 null일 때만 `route_unknown`으로 생략하고, 그 밖의 404는 transient처럼 미룬다(`error_code`는 실제 원인으로).
  - (b) 현 동작을 유지하되 사유를 구분해 기록하고 문서·보고에 "영구 생략"을 명시한다.

### L1 (Low, 정직성·운영) 커넥터 미설정을 Field 장애와 같은 코드로 표시하고, 상한 없이 고정 30초로 재시도함
- 위치: `field-event-inbox.ts:214-218`, `field-connector.ts:221`
- 워커에 `fieldConnector`가 없으면(`fieldConnectorFromEnvironment()`이 undefined) 503 `blocked_integration`이 transient로 바뀐다. 고객 알림 사건이 30초마다 영구히 미뤄지고 `error_code='route_unknown'`이 남아 운영자가 Field 장애와 구분할 수 없다. 뒤 revision은 `revision_gap`으로 5초마다 다시 검사된다.
- Field가 응답하지 않으면 사건마다 `/me`와 route 조회에 각각 최대 8초 timeout이 걸린다. 단일 워커라 처리량이 떨어진다. 스핀은 없다.
- 최소 수정: grant 오류 코드를 넘겨 `blocked_integration`과 `route_unknown`을 구분한다. 필요하면 attempts 기반 백오프를 넣는다.

### L2 (Low, nit) 2FA 복귀 URL에 userinfo가 남음
- 위치: `apps/agent-api/src/kakao-provider.ts:52-59`
- `http://user:pw@<webOrigin>/connect/sign-in?..`는 origin이 같아서 통과하고, `user:pw@`가 Location에 그대로 남는다. 다른 origin으로 가지 않으므로 open redirect는 아니다.
- 최소 수정: `target.username = ''; target.password = '';`

## 확인함, 문제 없음
- **Open redirect**: 다음 입력은 모두 `/workspace?two_factor=kakao` fallback으로 떨어진다. `/connect/sign-in/../x`, `//evil.com/...`, `/\evil.com/...`, `\\evil.com/...`, `/connect%2Fsign-in`, `/connect/sign-in%2F..%2Fx`, `http://origin:80/...`(포트 다름), `http://origin./...`, scheme 다름, `javascript:`, `/connect/sign-in-evil`. 대문자 host, 탭 문자, `/connect/%2e%2e/connect/sign-in`은 정규화 뒤 같은 origin의 정확한 경로라 통과하며 안전하다. CRLF는 인코딩된다. hash는 지우고 `two_factor`는 덮어쓴다. `getOAuthState()`는 콜백 after hook에서 값을 돌려준다(DB 테스트로 확인). callbackURL은 sign-in 시 better-auth originCheck를 이미 거친 값이다.
- **서명된 oauth_query 보존**: `verifyOAuthQueryParams`는 URLSearchParams로 파싱·정렬해 canonical 형태로 검증한다. 그래서 서버 `searchParams.set`이나 웹 strip에서 생기는 재인코딩(`%20`→`+`)은 서명에 영향이 없다. 자식 effect가 표시 파라미터를 동기로 지운 뒤 부모의 비동기 get-session→continue가 실행되므로 `two_factor`/`auth_error`가 oauth_query에 섞이지 않는다. errorCallbackURL의 `&auth_error`와 better-auth `appendQueryParams` 조합도 맞다.
- **v2 바이트 문자열**: AP 발신 `v2:ap->field.${ts}.${event_id}.`+raw와 해제 `v2:ap->field.${ts}.${rev}.${conn}.revoke`가 Field 수신(`ap-webhook-inbox.ts`, `ap-connection-revoke-receiver.ts`)과 정확히 같다. Field 발신(`ap-event-delivery.ts`, `facts-change-delivery.ts`, `ap-connection-revoke.ts`)도 AP 수신과 같다. facts와 예약 사건은 한 서명 검사를 공유한다.
- **버전 헤더**: 값이 `'2'`일 때만 v2다. 헤더가 없으면 허용 설정일 때만 v1이다. `'1'`, `'3'`, `''`, 배열(헤더 중복)은 401이다. v1 원문에 v2 헤더를 붙이거나 반대 방향 v2 서명을 보내면 401이다(테스트 있음). 서명은 64 hex 길이를 먼저 확인한 뒤 `timingSafeEqual`로 비교한다. live 기본값은 false이고, production에서는 `AP_PROFILE=live`가 강제된다. 잘못된 설정값은 부팅을 실패시키며(inbox 라우트를 무조건 등록) 시작 로그에 수용 모드를 남긴다. event↔revoke 교차 재사용은 본문이 JSON이어야 해서 불가능하다. route-close·recovery HMAC은 Field→AP 단방향에 고유 접미사라 반사 대상이 없다(preview.11 범위 밖).
- **미루기·재실행**: claim 쿼리가 `next_attempt_at <= now()`를 거르므로 스핀하지 않는다. rollback 전에 쓴 내용이 없다. 재실행 때 잠금 아래에서 상태·세대·종료·revision을 모두 다시 검사한다. 중복 이벤트는 event id·revision 일치로 한 번만 기록된다(10-5). 다중 워커는 skip locked와 상태 조건으로 이중 처리하지 않는다. transient update도 state 조건으로 보호된다. 호출마다 최소 하나의 조회가 진전된다.
- **visitor/receipt 해시**: 로컬 SQL 파라미터로만 쓴다. Field로 보내거나 로그에 남기지 않는다.
- **계약**: OpenAPI preview.11 securitySchemes·헤더 설명, docs/03 §서명·§해제, CONTRACT_NOTES가 구현과 일치한다.
- **UI**: `.agent-auth-divider`는 전역 CSS(14px)에 있다. 카카오 버튼은 공급사 상태를 그대로 표시하고 mock에서는 비활성 사유를 보여 준다. 2FA 취소 뒤 다시 마운트돼도 재처리하지 않는다.
- **기존 테스트 의미**: v1 서명 테스트를 v2로 옮겼고, v1은 전환 설정 on/off 양쪽을 따로 검증한다. 약해진 단언은 없다.
