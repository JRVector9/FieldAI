# AP(독립 AI 플랫폼) 읽기 전용 코드 리뷰 — 2026-10-02, main 84af59a

- 범위: `apps/agent-api`(Fastify+pg, migrations 000001~000081), `apps/agent-web`. 파일 수정 없음.
- 방법: 4개 영역(과금·Field 연동·배포/분배·문의/알림)을 병렬로 검토하고, 아래 항목은 모두 직접 코드 경로를 다시 읽어 확인했다.
- 테스트 재현은 하지 않았다(DB fixture 구성 비용 때문). lint, typecheck, test도 실행하지 않았다.

---

## P1 — 핵심 동선이 실제로 멈추거나, 계약을 위반하거나, 복구 경로가 없는 결함

### P1-1. 지식이나 AI를 재승인하면 모든 상담 링크와 위젯이 조용히 404가 된다. 배포 화면은 계속 "활성"으로 보이고 재연결 버튼이 없다
- **위치**
  - `apps/agent-api/src/deployments.ts:180-199`의 `active()`
  - `apps/agent-api/src/customer-consultations.ts:50-66`의 `activeDeployment()`
  - `apps/agent-web/src/agent-deploy.tsx:98`
- **원인**
  - 공개 경로는 모두 두 조건을 요구한다. `d.agent_release_id`가 조직의 **최신** agent release여야 하고, 그 knowledge release가 **최신** knowledge release여야 한다.
  - `POST /v1/knowledge/releases`(`business.ts:192`)와 `POST /v1/agents/releases`는 기존 배포를 다시 바인딩하지 않는다.
  - `GET /v1/deployments`의 `output()`(`deployments.ts:81`)은 현재 유효한지 여부를 내려주지 않는다.
  - 웹은 `status==='active'`이면 "중지" 버튼만 보여주고, 재바인딩을 하는 "활성화" 버튼은 숨긴다.
- **사용자 시나리오**
  1. 사업자가 FAQ 한 줄을 고치고 "지식 공개 승인"을 누른다(완료 문구만 표시된다).
  2. 그 즉시 고객용 `/consult/{id}`는 "상담 링크가 중지됐거나 최신 승인 정보가 필요합니다"를 보여주고, 외부 사이트 위젯은 빈 iframe이 된다.
  3. 배포 화면에는 여전히 "active · 승인 지식 N번에 연결됨"이 표시된다.
  4. AI를 다시 승인해도 복구되지 않는다. 배포마다 "중지"를 누른 뒤 "활성화"를 눌러야 하는데, 이 방법은 화면 어디에도 안내되지 않는다.
- **최소 수정**
  - 배포 목록에 `current` 값을 추가한다(`active()`와 같은 조건).
  - `current=false`이면 "최신 승인으로 다시 연결" 버튼을 보여주고, 이 버튼은 기존 `POST /v1/deployments/:id/activate`를 호출한다(이 API가 이미 재바인딩한다).
  - 지식 승인 완료 문구에도 "배포 재연결 필요"를 표시한다.

### P1-2. 알림 발송 준비 쿼리가 막혀 전 조직의 카카오·SMS·푸시가 멈출 수 있다
- **위치:** `apps/agent-api/src/notification-delivery-execution.ts:19-35`의 `prepare()`
- **원인**
  - 전역 쿼리가 `order by n.created_at,n.id limit 100`으로 가장 오래된 100건을 고른다. 조건은 "동의 수신자가 있고 delivery 행이 없는 이벤트"다.
  - 발송 대상이 아닌 행은 아무 기록 없이 `continue`로 건너뛴다. 해당하는 경우:
    - `!s.eligible` — spam, `not_applicable`, purged, AI 모드, route closed
    - 수신자 unseal 실패
    - 전화번호 형식 불일치
    - membership 필터에서 탈락
  - 이 상태 판정이 WHERE 절이 아니라 `eligible` 계산식 안에만 있어서, 건너뛴 행은 다음 루프에서도 계속 같은 100건 안에 다시 잡힌다.
- **시나리오**
  - 푸시나 카카오에 동의한 사업자의 spam 문의에 고객이 계속 글을 쓴다. 이렇게 `not_applicable` owner 이벤트가 쌓이거나, 아래 P2-1의 하이픈 전화번호 건이 쌓인다.
  - 약 100건이 쌓이면 그보다 새로운 알림은 **모든 조직에서** delivery 행이 생기지 않는다.
  - 이때 오류도 경고도 나오지 않는다.
- **최소 수정:** 검사한 모든 행에 종결 표시를 남긴다(`suppressed` delivery 행이나 `delivery_prepared_at` 마커). 또는 eligibility 조건을 `LIMIT` 이전 WHERE 절로 옮긴다.

### P1-3. Field 일시 장애 한 번이면 Field 연결이 영구 `degraded`가 되고 복구 경로가 없다
- **위치:** `apps/agent-api/src/field-connector.ts:281-303`의 `inspectFieldGrant`
- **원인**
  - catch-all이 모든 오류에서 `status='degraded'`로 바꾼다. 네트워크 timeout, `/me` 5xx, refresh 실패가 모두 포함된다.
  - `degradeOnFailure` 기본값은 true다. 백그라운드 `source-refresh-worker.ts:52`와 소유자 `/facts`·`/capabilities`·`/sync`·`/source/approve`·`/source/publish`가 이 기본값으로 호출한다.
  - 다시 `review_required`로 돌아가는 경로는 OAuth callback(`:625-630`) 하나뿐이다.
  - 같은 연결로 `/start`를 다시 하면 `connection_already_bound` 409가 난다.
- **시나리오**
  - `facts.changed` 갱신 작업 중 Field가 8초 timeout을 한 번 낸다.
  - 이후 고객 Field 서비스·예약 전달이 사라지고, Field 예약 사건 수신이 401이 되며, inbox가 30초마다 영구히 연기된다.
  - 사업자 화면에는 "Field 권한 확인 필요"와 해제 버튼만 남는다.
  - 이는 CODEX_HANDOFF 설계 결정 "일시 장애에서 영구 degraded를 기록하지 않는" 원칙과 충돌한다.
- **최소 수정:** 확정적 인증 실패일 때만 degraded로 바꾼다(`/me` 401/403, grant·조직·scope 불일치). timeout과 5xx는 상태를 바꾸지 않고 503만 반환한다. worker는 `degradeOnFailure=false`로 호출한다. 재검증에 성공하면 degraded에서 review_required로 되돌리는 경로를 추가한다.

### P1-4. Field 네트워크 호출 중에 pool client와 행 잠금을 쥐고 있어, Field가 느려지면 AP 전체가 멈춘다
- **위치**
  - `field-connector.ts:172-237`의 `fieldResourceForCustomer`
  - `field-connector.ts:246-309`의 `inspectFieldGrant`
- **원인**
  - 두 함수 모두 `pool.connect()` → `begin` → `... for update of c` 다음에 token refresh(8s)와 `/me`(8s)를 호출하고, 그 뒤에야 commit한다.
  - 호출하는 곳은 고객 AI 메시지마다 2회(`connector-facts-live.ts:58`), 익명 `GET /v1/engagements/:id/field-readiness`, 고객 `field-actions` 경로 전부다.
  - `server.ts:20`의 Pool은 기본 max 10이고 connectionTimeout이 없다.
- **시나리오**
  - Field가 응답하지 않는 동안 한 연결에 대한 요청들이 행 잠금에서 직렬화된다. 대기 중인 요청마다 client를 하나씩 점유한다.
  - 동시 방문자 약 10명이면 pool이 고갈되고, Field와 무관한 AP 단독 조직의 상담·문의·관리 API까지 모두 멈춘다.
  - 이는 B01("AP는 Field 없이 동작")을 위반한다.
- **최소 수정:** 토큰은 잠금 없이 읽고, 네트워크 I/O 전에 client를 반환한다. refresh 결과를 저장할 때만 짧게 잠그고 다시 읽는다. Pool에 `connectionTimeoutMillis`를 설정하고 Field 호출 동시성에 상한을 둔다.

### P1-5. `reconcile`이 결과 미상 요청을 `rejected`로 바꿔 중복 예약 요청을 유발한다
- **위치:** `apps/agent-api/src/field-actions.ts:599-627`
- **원인**
  - Field의 by-source 조회가 404를 주면 "미수신"으로 보고 재POST한다. 재POST가 4xx(429 제외)를 주면 `rejected`로 만든다.
  - 동의 시각이 24시간을 넘었으면 재POST 없이 바로 `rejected`(`transfer_consent_expired`)로 만든다.
  - 그런데 Field by-source(`apps/field-api/src/bookings.ts:629-637`)는 Field 쪽 `ap_connections.status`가 `review_required`가 아니기만 해도 404를 준다. Field create 역시 replay 조회보다 연결 상태를 먼저 검사한다.
  - 따라서 404는 "Field가 받지 않았다"는 증거가 아니다.
- **시나리오**
  1. Field가 요청을 접수했지만 응답이 유실되어 AP에는 `delivery_unknown`으로 남는다.
  2. 그 사이 Field 쪽 연결이 degraded가 되거나 회수가 진행 중이다.
  3. 고객이 "원래 요청 ID로 확인"을 누르면 상태가 `rejected`("Field가 접수하지 않음")가 된다.
  4. 고객이 다시 제출하면 Field에 같은 예약 요청이 두 건 생긴다.
  - 이는 계약 "delivery_unknown → 새 업무 생성 금지"를 위반한다.
- **최소 수정:** reconcile 경로에서는 연결·동의 관련 404와 409를 `delivery_unknown`으로 유지한다. `rejected`는 첫 전송이거나, Field가 "유효한 binding에서 미존재"를 명시 코드로 응답할 때만 기록한다.

### P1-6. 유료 플랜에서 OpenAI timeout이나 5xx가 한 번 나면 그 대화의 AI가 영구 잠기고 보존 정리도 막힌다
- **위치**
  - `ai-entitlement.ts:52-57`의 `failAi`: 유료 기간이 있는 run이 dispatch 후 비확정 오류를 내면 `unknown=true`를 반환한다.
  - `customer-consultations.ts:480-484`: 이 경우 `ai_runs.status='in_progress'`, `finished_at=null`로 남긴다.
- **원인**
  - 이 run을 정리하는 worker나 sweeper가 없다.
  - 같은 문의의 다음 메시지는 `active` 개수 검사(`:427-432`)에 걸려 영구히 409 `answer_in_progress`가 된다.
  - 같은 키로 replay하면 202 `result_unknown`이 계속 반환되고, 웹은 계속 "기다려 달라"고 안내한다.
  - 보존 정리 쿼리(`work-retention.ts`)도 이 문의를 계속 pending으로 본다.
  - dispatch와 settle 사이에 프로세스가 죽어도 같은 상태가 된다.
- **시나리오:** 유료 고객의 대화가 OpenAI 지연 한 번으로 AI 응답을 더 받지 못하게 되고, 데이터 정리도 막힌다.
- **최소 수정:** 과금(unknown ledger)은 유지한다. 대신 run은 `failed`/`provider_result_unknown`으로 종결하거나, active 개수에서 일정 시간이 지난 unknown run을 제외한다. 또는 sweeper를 추가한다.

### P1-7. 카드 인증(billingKey 발급) 단계의 확정 거절이 `unknown`으로 영구히 남아, 그 조직은 다시 구독할 수 없다
- **위치**
  - `billing-authorization-execution.ts:82-96`
  - `toss-billing.ts:37-42`: `declined` 분류는 `operation==='charge'`일 때만 적용된다.
- **원인**
  - `provider.issue()`의 오류를 모두 `catch {}`로 삼킨 뒤 `unknown`(`authorization_provider_result_unknown`)으로 만든다. Toss의 확정 4xx도 여기에 포함된다.
  - DB 가드(000071)는 `failed` 전이를 허용하지만, 이 전이를 쓰는 코드가 없다.
  - 빠져나갈 경로가 모두 막혀 있다.
    - 인증 취소 API는 `unknown`이면 409를 준다(`billing-consent-routes.ts:158`).
    - 구독 종료 처리는 미결 authorization이 있으면 종료하지 않는다(`billing-charge-execution.ts:118`).
    - 새 checkout은 `open_subscription_exists` 409가 된다.
    - 운영자 정리 API도 없다.
- **시나리오:** 카드 창을 마친 뒤 Toss가 카드를 거절하면, 해당 사업자는 AP 유료 구독을 영구히 시작할 수 없다.
- **최소 수정:** issue 호출의 HTTP 비정상 응답은 `failed`로 처리하고 ciphertext를 정리한다. transport 오류와 timeout만 unknown으로 둔다. 종료 처리와 취소 API는 `failed`를 종결 상태로 인정한다.

---

## P2 — 특정 조건에서 기능이 깨지거나 거짓 상태를 보여주는 결함

### P2-1. 고객이 하이픈을 넣어 입력한 번호는 알림 동의가 "저장됨"으로 표시되지만 발송되지 않는다
- **위치**
  - 문의 저장: `inquiries.ts:161-164,225`는 `/^[+\d()\-\s]{9,30}$/` 형식을 허용하고 입력값을 그대로 저장한다.
  - 수신자 저장: `notification-delivery-routes.ts:47`이 `customer_phone`을 그대로 seal한다.
  - 발송 준비: `notification-delivery-execution.ts:29`가 `/^01[016789]\d{7,8}$/`에 맞지 않으면 건너뛴다.
- **시나리오**
  - 고객이 `010-1234-5678`로 문의하고 카카오 알림을 켠다.
  - 화면에는 "동의 저장 확인"(200 `consented`)이 나온다.
  - 사업자 답변 알림은 오지 않고, 해당 이벤트는 P1-2의 적체 원인이 된다.
- **수정:** 저장하거나 seal할 때 숫자만 남기도록 정규화한다. 휴대폰 번호 형식이 아니면 동의 요청을 400으로 거절한다.

### P2-2. 신고 한도와 확인키 잠금이 프록시 IP 기준이라 전 사용자가 하나의 버킷을 공유한다
- **위치**
  - `deployment-moderation.ts:105`: `request.ip` 기준 5회/15분
  - `receipt-abuse.ts:19`: `request.ip` 기준
  - `app.ts:50`: `Fastify()`에 `trustProxy`가 없다.
  - 모든 브라우저 요청은 Next rewrite(`agent-web/next.config.ts`)를 거쳐 들어오므로 `request.ip`는 항상 Next 서버 IP다.
- **시나리오**
  - 플랫폼 전체에서 15분 안에 신고 5건이 들어오면, 그 뒤 모든 고객의 "상담 배포 신고"가 429가 된다.
  - 문의 ID(`/inquiry/{id}` URL에 노출됨)를 아는 사람이 틀린 키를 몇 번 보내면, 올바른 키를 가진 실제 고객도 15분간 429를 받고, 이를 반복할 수 있다.
- **수정:** 알려진 프록시 hop에 한해 `trustProxy`를 설정하고 X-Forwarded-For를 전달한다. 또는 IP를 잠금 키에서 빼고 대상별 한도만 사용한다.

### P2-3. sandbox·live 인증 동선이 막혀 있다(설정 결합)
- **위치:** `apps/agent-api/src/auth.ts:26-28`
- **원인 1: 확인 메일이 발송되지 않는다**
  - mock이 아니면 `requireEmailVerification: true`다.
  - 그런데 `emailVerification.sendVerificationEmail`이 어디에도 설정되어 있지 않다(grep 결과 0건).
- **시나리오 1:** 가입 후 웹(`workspace.tsx:263-266`)이 "가입되었습니다. 이메일 확인 후 로그인해 주세요."를 보여준다. 확인 메일은 발송되지 않으므로 로그인이 영구히 불가능하다. 결과적으로 가짜 안내가 된다.
- **원인 2: 웹 origin이 신뢰 목록에 없다**
  - mock이 아니면 `trustedOrigins: []`다.
  - better-auth 1.7.5의 `formCsrfMiddleware`와 `validateOrigin`은 브라우저 POST의 Origin이 baseURL origin이거나 trustedOrigins에 있어야 통과시킨다.
  - `AP_PUBLIC_WEB_ORIGIN`(웹)이 `AP_AUTH_BASE_URL`과 다르면 로그인·로그아웃·OAuth consent POST가 403 `INVALID_ORIGIN`이 된다.
- **수정**
  - 메일 공급사가 없으면 가입을 `blocked_integration`으로 명시하고 UI에서 비활성화한다.
  - `trustedOrigins`에 `AP_PUBLIC_WEB_ORIGIN`을 추가한다.

### P2-4. 알림·과금·Field 쪽 미결 상태에 탈출구가 없다
- **web push `unknown` 무한 polling**
  - `notification-web-push.ts:20`의 `lookup()`은 항상 null을 반환한다.
  - 그래서 `unknown` 행이 1분마다 재claim되고(`notification-delivery-execution.ts:82-83`) 끝나지 않는다.
  - claim이 `order by o.id limit 1`이라 id가 작은 조직의 적체가 다른 조직의 발송을 지연시킨다.
- **결제 `unknown` 장기 정체**
  - `billing-charge-execution.ts:235-242`에서 결제가 `unknown`으로 남으면 종료 처리(`:116-117`)가 막힌다.
  - 운영자 정리 API가 없으므로 해지 후 재구독할 수 없다.
- **전액 환불 후 구독 정지 상태 불일치**
  - 전액 환불되면 period가 `refunded`가 되어 `prepareRenewal`(`:67-70`) 후보에서 영구히 빠진다.
  - 그런데 `paid_subscriptions.state`는 `active` 그대로다.
  - 결과적으로 접근은 `cleanup_only`, 갱신은 일어나지 않고, 재가입은 `open_subscription_exists`가 된다. 정책을 명시해야 한다.
- **`prepareRenewal` 고착**
  - 기간이 지난 `past_due` 행이 후보 쿼리에 계속 남고, `limit 20`의 앞자리를 차지한다.
  - 장기 worker 중단 뒤에는 다른 구독의 갱신이 준비되지 않는다.
- **`binding_unknown` 막다른 길**
  - 위치는 `field-connector.ts:615-631`이다.
  - Field bind는 같은 키로 멱등이지만 AP에는 재확인 경로가 없다.
  - Field 쪽은 연결이 성립되었는데 AP가 사건을 401로 거절하는 상태로 고정된다.

### P2-5. OAuth token 발급 wrapper가 pool 교착을 일으킬 수 있다
- **위치:** `oauth-lifecycle-provider.ts:38-53`
- **원인:** `authPool` client로 tx를 열고 `FOR SHARE`를 잡은 상태에서 `adapter.create`를 호출한다. `adapter.create`는 같은 `authPool`(기본 max 10)에서 client를 하나 더 요청한다.
- **결과:** 동시 token 발급이 10건 이상이면 서로 pool을 기다리며 `/oauth2/token`이 무기한 대기한다.
- **수정:** 같은 client에서 검사와 insert를 하거나, 검사 후 commit하고 나서 create를 호출한다.

### P2-6. lifecycle 증빙 검사가 요청마다 전체 스캔을 한다
- **위치:** `oauth-lifecycle-journal.ts:118-142`
- **원인:** 모든 integrator 요청과 `/oauth2/token`·`introspect`·`userinfo`에서 저널 파일 전체를 다시 읽는다. 그리고 엔트리마다 index 없는 `encode(sha256(convert_to(token)))` 비교로 token 테이블을 스캔한다.
- **결과:** 데이터가 늘수록 지연이 선형으로 증가하고, 결국 Field 쪽 8초 timeout을 유발한다.

### P2-7. 매체 origin을 검증 없이 선점할 수 있다
- **위치:** `publishers.ts:146-169`, `migrations/000022_publisher_core.sql:21`의 `origin text not null unique`
- **원인:** DNS 검증 전부터 origin이 전역 unique이고, 미검증 행을 만료·삭제하는 경로가 없다.
- **시나리오:** 누군가 `https://news.example.com`을 먼저 등록해 두면, 실제 소유자는 영구히 409 `origin_already_registered`를 받는다.
- **수정:** unique 조건을 `verified_at is not null`인 행에만 거는 부분 unique로 바꾸거나, 미검증 행을 일정 시간 뒤 만료시킨다.

### P2-8. 재승인 뒤 기존 AI 상담에서 서비스를 선택해 제출하면 처리되지 않은 409가 난다
- **위치**
  - `customer-consultations.ts:643-648`: 대화에 고정된 release 기준으로 검증한다.
  - `agent-public.tsx:239-249,538-541`: 최신 공개 release의 `knowledgeRevision`을 전송한다.
- **결과**
  - `409 knowledge_stale`가 나는데 웹에는 이 응답을 처리하는 분기가 없어 "(409)"만 표시된다. 재시도해도 같은 오류가 난다.
  - P1-1과 같은 원인(재승인 시 재바인딩 부재)에서 파생된다.

---

## P3 — 낮은 영향(모두 코드로 확인)
- **배치 중복 확인이 다른 조직의 배치를 노출한다**
  - 위치: `placements.ts:198-204`. 중복 확인이 조직 범위 없이 `campaign_release_id, slot_id`만으로 조회한다.
  - 결과: 다른 조직 배치의 id와 상태를 200으로 받을 수 있다.
  - 수정: 조회 조건에 `organization_id`와 `campaign_id`를 추가한다.
- **신고로 제한된 배치가 계속 노출된다**
  - 위치: `placements.ts:62-67,408-416`. `moderation_restricted`를 검사하지 않는다.
  - 결과: 제한된 배치에도 "설치 코드 발급"과 공개 카드의 CTA가 계속 보이고, 클릭하면 404가 된다.
- **`field-actions.ts:19`의 409 매핑**
  - 모든 Field 409를 `service_conditions_changed`로 바꾼다.
  - 그래서 UI가 연결이나 동의 문제를 설명하지 못하고 가용시간 재조회만 반복한다.
- **`agent-field-action.tsx:201-220`의 rejected 응답 처리**
  - 409 응답 본문의 `rejected` 액션을 목록에 반영하지 않는다.
  - `field_subscription_ended` 안내도 표시되지 않는다.
- **integrator 선택 회수가 Field 연결로 이어지지 않는다**
  - 위치: `integrator-routes.ts:156-189`
  - 회수해도 `field_connections`가 갱신되지 않고 원격 회수도 큐에 들어가지 않는다. 목록에는 연결이 살아 있는 것처럼 보인다.
- **`agent-field-connections.tsx:127`의 오류 문구:** `/sync`의 모든 409를 무결성 충돌 문구로 표시한다.
- **Field 측 회수 상태 오표시**
  - 위치: `field-connector.ts:341-346`
  - Field가 먼저 회수한 연결이 "상태 확인 필요"로 표시된다.
  - 양쪽이 동시에 회수하면 "관리자 확인 필요"가 된다.
- **callback 500:** `field-connector.ts:630`에서 bind 도중 revoke가 commit되면 PAP02 trigger 때문에 redirect 대신 500이 난다.
- **production 가드가 좁다**
  - 위치: `server.ts:13`
  - `NODE_ENV=production`에서 `AP_PROFILE` 미설정이나 `sandbox`여도 부팅된다. mock만 거부한다.
- **비 mock에서 체험 만료 오류 코드 불일치**
  - 비 mock 환경의 `rejectExpiredTrial`은 `paid_subscription_required`를 반환한다.
  - 공개 위젯은 `trial_ended`만 처리하므로 고객에게 일반 "(403)"이 표시된다.
- **결제 상태 문구가 고정되어 있다**
  - `subscription.ts:17`의 `paidCheckout:{state:'blocked_integration'}`가 고정값이다.
  - `agent-usage.tsx:53`은 유료 조직에도 "결제 공급사 미연결"을 표시한다.
  - 사용량 집계는 UTC 월 기준이고, 과금 기간은 Asia/Seoul 기준이다.
- **만료된 `awaiting` authorization에서 재개할 수 없다**
  - 서버는 만료로 전이시키지 않고, 웹은 cancel API를 호출하지 않는다.
  - 30분이 지나면 "이어가기"를 눌러도 카드 창이 열리지 않는다.
- **결제 거절 후 재시도나 카드 변경 경로가 없다:** `past_due` 상태에서는 해지 후 재가입만 가능하다.
- **API로 `tax_free_amount=null` 플랜을 checkout할 수 있다**
  - 위치: `billing-consent-routes.ts:98`
  - 웹은 막지만 API는 허용한다. 이후 청구가 모두 `billing_tax_policy_not_configured`로 막힌다.
- **신고 snapshot에 Field 사실이 빠진다**
  - 위치: `deployment-moderation.ts:124-131`
  - AI가 사용한 Field `sourceFacts`가 저장되지 않아, 운영자가 오정보 신고를 판단하기 어렵다.
- **관리자 origin 검사 불일치(mock 한정)**
  - `customer-support.ts:32`는 `AP_PUBLIC_WEB_ORIGIN` 하나만 허용한다.
  - 같은 역할의 `retention-routes.ts`는 localhost와 127.0.0.1을 모두 허용한다.
- **알림 다음 페이지가 접힌다:** 알림을 열면(`openNotification`) 1페이지만 다시 불러와 이미 불러온 다음 페이지가 사라진다.

---

## 정보 — 버그는 아니지만 출시 판단에 필요한 연쇄 차단
- mock이 아닌 환경의 상태
  - 관리자 API는 전부 503이다(`admin.ts`, `retentionAdminFor`, `deployment-moderation`, `customer-support`). 그래서 실판매 플랜과 환불을 승인할 수 없다.
  - 체험은 mock 전용이다.
  - 그 결과 sandbox와 live의 신규 조직은 `subscriptionAccess` 결과가 `cleanup_only`(`paid_subscription_required`)가 되어 아무 작업도 시작할 수 없다.
- `apps/agent-web/next.config.ts:2`는 `APP_PROFILE=live`에서 즉시 throw한다. 즉 AP 웹은 live로 실행할 수 없다(디자인 preview 전제).
- 다중 조직 사용자에 대한 대비가 없다.
  - 조직 선택은 `x-organization-id`가 없으면 `created_at` 기준 첫 membership으로 정해지고, 권한 등급별로 서로 다른 조직이 선택될 수 있다.
  - owner 문의 목록은 모든 조직을 합쳐 보여준다.
  - 다만 현재 초대 API가 없어(`memberships` insert는 조직 생성 시 owner 1건뿐) 실제로 발생하지는 않는다. editor·viewer 역할도 제품 동선으로는 생성할 수 없다.

---

## 재감사(AP_FIELD_FUNCTION_REAUDIT_2026-09-29) AP 4건 — 현재 코드로 모두 해결 확인
- **(a) '오늘' 업무가 첫 100건만 반영되던 문제:** 해결됐다. `inquiries.ts:353-373`이 별도 `needs_owner` 쿼리(`count(*) over()`, `limit 6`)를 쓰고, 웹은 `pendingCount`와 `pendingPreview`를 사용한다.
- **(b) 지식 저장·승인 조작이 역할과 무관하게 활성화되던 문제:** 해결됐다.
  - GET `/v1/knowledge/draft`가 `role`을 반환한다.
  - `workspace.tsx`가 역할에 따라 조작을 비활성화하고, 저장·승인 직전에 역할을 다시 조회한다.
  - 서버의 `organizationFor`가 권한을 강제한다.
- **(c) 100건 이후 알림을 읽을 수 없던 문제:** 해결됐다. keyset cursor와 "이전 알림 더 보기"가 추가됐다(위 P3의 경미한 페이지 접힘은 남음).
- **(d) 동명 서비스 식별 문제:** 해결됐다.
  - `ServiceSelect`가 index 기준이고, `serviceIndex`와 `knowledgeRevision`을 전송한다.
  - 서버의 `approvedService`가 index로 식별하고, index 없이 동명이면 `service_ambiguous`를 반환한다.
  - 범위 밖으로 `campaigns.ts:134,252,282`와 `placements.ts:84,134`는 아직 이름으로 서비스를 찾는다.

## 확인 결과 정상인 영역(커버리지)
- **웹 ↔ API 계약:** 웹의 모든 `/v1`, `/integrations`, `/api/auth` 호출 약 150건을 route 정의와 대조했다. 경로·메서드·본문·헤더(`x-organization-id`, `idempotency-key`) 불일치는 없다. Next rewrite도 `/v1`, `/integrations/v1`, `/api/auth`, `/sdk`, `/embed`를 모두 포함한다.
- **SQL ↔ migration:** 검토한 모든 쿼리의 테이블·컬럼명이 000001~000081과 일치한다.
- **트랜잭션:** 모든 begin 블록에 catch rollback과 finally release가 있다.
- **고객 접근 권한:** 확인키 hash와 문의 id를 결합해 검사한다. 번호나 링크만으로는 접근할 수 없다. 내부 메모는 고객에게서 제외된다.
- **조직 범위:** owner·editor 경로는 membership join을 쓰고, integrator 경로는 grant, 조직, actor, 배포에 결합된다.
- **worker 동시성:** 알림, 과금, 환불, Field inbox·facts·refresh·revoke, 보존 정리 worker 모두 `FOR UPDATE SKIP LOCKED`와 claim token/lease로 fence한다.
  - 결과 미상 상태에서 재발송하지 않는다(lookup만 수행, 카카오→SMS 전환은 확정 3104일 때만).
  - 이중 결제나 이중 환불 경로는 발견하지 못했다.
- **Field 사건 서명:** HMAC, 300초 시간창, `timingSafeEqual`, event ID/본문 hash 충돌 409, revision gap 연기를 확인했다.
- **구독 게이팅:** 신규 작업을 만드는 경로는 모두 같은 `subscriptionAccess.canStartNew`를 쓴다. 기존 작업 처리 경로(답변, 종료 등)는 의도적으로 게이팅하지 않는다. 경로 간 불일치는 없다.
- **AI 응답:** 승인된 release와 실시간 확인된 connector 사실만 입력한다. evidence ID 존재를 검사하고, 근거 없는 숫자를 거절하며, tool 없는 structured output을 쓴다. 모델 미설정 시 503 `blocked_integration`이고 고정 답변은 없다.
- **AGENTS.md §2:** link와 owned_embed 경로는 campaign, placement, Field 테이블에 의존하지 않는다. embed spike route는 business runtime이 있으면 등록되지 않는다.
- **프로필 가드:** server, auth, worker는 production에서 mock을 거부한다. 알림·과금 context는 production에서 live만 허용한다. mock에서 실제 공급사 env를 넣으면 부팅에 실패한다.
- **UI 버튼:** 검토한 화면의 버튼은 실제 API를 호출하거나 비활성 사유를 표시한다. 가짜 성공 표시는 P2-3의 가입 안내 하나만 발견했다.
