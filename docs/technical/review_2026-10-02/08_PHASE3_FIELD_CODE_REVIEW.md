# Field 리뷰 (HEAD c22b288 + 미커밋 변경) — field-api / field-web / contracts / tools / infra / docs

파일은 수정하지 않았습니다. 기준은 AGENTS.md §2–4·6, docs/03 §4.6·§4.12입니다.

## 실행한 검사 (로컬, mock, 미커밋 작업 트리)
- `node tools/run-db-suite.mjs field` 대상: integrator(2), account-deletion(1), auth-kakao(6), billing-webhook(1), sites(4), custom-domains(13) → 모두 통과
- field-api 단위 테스트: logging, image-format, billing-webhook → 5/5 통과
- field-web `tsx --test test/*.test.tsx` → 123/123 통과
- `tsc --noEmit`: field-api, field-web 통과. `eslint apps/field-api apps/field-web tools`: 출력 없음(통과)
- `node --test tools/test/field-integrator-contract.test.mjs` → 통과
- 실행하지 않은 것: billing-charge.db 전체, e2e, independence, 실제 Caddy·카카오·S3·토스 공급사

## 결함 (심각도 순)

### H1. 세션 삭제가 OAuth 선택 행을 지우고 통합 grant를 끊음. 이번 삭제 기능이 그 범위를 다른 조직까지 넓힘
- 근거
  - `migrations/000019_oauth_selections.sql:3` `session_id ... references "session"(id) on delete cascade`
  - `src/integrator-auth.ts:24`는 `field.oauth_selections`를 join합니다. 선택 행이 사라지면 그 grant의 bearer는 모두 401이 됩니다.
  - better-auth 1.7.5는 secondaryStorage가 없으면 세션을 실제로 지웁니다. 다음 두 경로가 있습니다.
    - get-session이 만료 세션을 만나면 그 행을 삭제합니다(`api/routes/session.mjs:155-162`, `db/internal-adapter.mjs:481` `deleteWithHooks`).
    - sign-out도 같은 경로로 삭제합니다.
- 문제
  - `account-deletion.ts:203-204`와 `:268-269` 주석은 "삭제 대신 즉시 만료로 cascade를 피한다"고 합니다. 하지만 만료된 쿠키로 다음 요청이 오면 better-auth가 행을 지우므로 cascade는 그대로 일어납니다.
  - 조직 삭제 실행(`account-deletion.ts:269`)은 그 조직 **모든 구성원**의 세션을 전역으로 만료합니다. 그 구성원이 owner인 **다른 조직**의 AP 연결 grant가 그 세션으로 만들어졌다면, 그 연결도 다음 접속 때 끊어집니다.
- 기존 결함 의심(범위 밖, 확인 필요)
  - 같은 원인으로 일반 로그아웃, 7일 만료 뒤 재방문, 비밀번호 재설정(`revokeSessionsOnPasswordReset`)도 AP 연결을 끊을 수 있습니다.
  - sign-out 뒤 integrator 호출을 검사하는 테스트는 없습니다.
- 최소 수정
  - (근본) `oauth_selections.session_id`를 nullable로 바꾸고 FK를 `on delete set null`로 교체하는 마이그레이션을 추가합니다. 선택 조회는 이미 `selection_expires_at`로 짧게 제한되어 있습니다.
  - (이번 변경분) 조직 삭제에서 `sessionsRevoked`를 빼거나, 남은 membership이 없는 사용자에게만 적용합니다. membership 삭제만으로 접근은 이미 차단됩니다.

### M1. 삭제 예약·완료된 조직의 자체 도메인에 TLS 발급·갱신이 계속 허용됨
- `src/custom-domain-routes.ts:107-115`의 allow 조건에는 조직 삭제 상태도, `resolvedCustomHost`가 보는 `site_releases` 존재 조건도 없습니다.
- `runOrganizationDeletionOnce`는 `site_domains`를 건드리지 않습니다. 그래서 삭제 후에도 hostname이 claimed·active로 남고, Caddy는 인증서를 계속 갱신합니다. 실제 도메인 주인이 다른 조직에서 같은 도메인을 다시 쓸 수도 없습니다.
- 최소 수정
  - allow 쿼리에 `and not exists(select 1 from field.organization_deletion_requests d where d.organization_id=site_domains.organization_id and d.status in ('scheduled','executed'))`를 추가합니다.
  - 실행 단계에서 해당 조직 도메인을 기존 disconnect 경로와 같은 상태로 전환하고 claim을 해제합니다.

### M2. 카카오로만 가입한 계정은 계정 삭제가 불가능함
- `account-deletion.ts:50,53`은 credential 비밀번호가 없으면 `password_unavailable` 차단을 겁니다. 웹(`field-account.tsx:22`)은 "운영자에게 문의"만 안내합니다.
- 카카오 로그인을 연 상태에서는 셀프 탈퇴 경로가 막힙니다.
- 최소 수정: credential이 없는 계정은 최근 인증 세션(예: `session.createdAt`이 5분 이내, 카카오 재로그인 직후)을 재인증으로 인정합니다.

### M3. 삭제 뒤에도 개인정보가 남아 화면 문구와 어긋남
- 계정 삭제는 `field.email_outbox`의 `"to"` 이메일과 본문(검증·재설정 링크)을 남깁니다(000076). 화면은 "이메일 익명 처리"라고 안내합니다.
- 조직 삭제는 owner `notification_recipients`에 `revoked_at`만 기록하고 `recipient_ciphertext`(연락처)를 남깁니다(`account-deletion.ts:267`). 화면은 "연락처 등 … 지우고"라고 안내합니다(`field-account.tsx:112`).
- 최소 수정: 같은 트랜잭션에서 email_outbox 해당 행을 삭제하거나 가림 처리하고, owner recipient 암호문을 덮어쓰거나 참조가 없으면 삭제합니다.

### M4. S3 삭제 확인이 권한 설정에 따라 영구 재시도에 빠질 수 있음
- `account-deletion.ts:251-252`는 delete 뒤 `get`으로 부재를 확인합니다.
- `FieldS3MediaStore.get`(`site-media.ts:80-89`)은 `NoSuchKey`만 null로 처리합니다. `s3:ListBucket` 권한이 없는 최소 권한 IAM에서는 없는 키에 403 AccessDenied가 옵니다. 그러면 예외 → `execution_failed` → 5분마다 재시도가 끝없이 반복되고 삭제가 실행되지 않습니다.
- 최소 수정: 운영 문서에 ListBucket 필요를 명시합니다. 또는 확인을 HeadObject로 바꾸고 404를 부재로 처리합니다.

### L1. 토스 웹훅이 인증 없는 원문 전체를 보관하고, 존재 여부를 알려 주는 응답을 줌
- `billing-webhook.ts:84`는 `payload`에 원문 전체를 저장합니다. 최대 64KB이고, 보존 정리가 없으며, 가상계좌 고객명 등이 포함될 수 있습니다.
- 응답 `outcome`(`:86`)이 `reconcile_scheduled`인지 `no_pending_reconciliation`인지로 해당 orderId에 미상 결제가 있는지 알 수 있습니다.
- 최소 수정: 파싱한 힌트(eventType·paymentKey·orderId)만 저장하고 응답은 `{received:true}`로 고정합니다.

### L2. 계정 삭제의 비밀번호 재확인에 시도 제한이 없음
- `/v1/account/deletion-requests`(`account-deletion.ts:175-200`)는 better-auth rate limit 밖에 있습니다. 탈취된 세션으로 비밀번호를 대입해 볼 수 있습니다.
- 최소 수정: 사용자별 실패 창을 둡니다. 기존 IP window 패턴을 재사용하면 됩니다.

### L3. 고객 결정의 `confirmedAt` 형식 검증이 느슨함
- `external-request-public-routes.ts:102`는 `Date.parse`만 확인합니다. JS는 해석하지만 PG `timestamptz`가 거부하는 문자열이면, insert(`:169`)에서 500이 납니다.
- 최소 수정: RFC 3339 정규식으로 검사하고 400 `invalid_customer_decision`을 반환합니다.

### L4. AP 사건 수신함의 남는 행과 남용 가능성
- `recorded` 사건을 처리하는 worker도, 보존 정리도 없어 행이 계속 쌓입니다.
- 서명 검증 전에 `ap_connections ... for update`(`ap-webhook-inbox.ts:74-78`)를 잡습니다. 연결 ID와 키 ID를 아는 비인증 호출자가 잠금 경합을 일으킬 수 있습니다. AP는 같은 경로에서 `for share`를 씁니다.
- 최소 수정: 서명 확인까지는 `for share`로 잠그고, 해제 처리 때만 `for update`로 올립니다. 보존 기간을 정의합니다.

### L5. 알림 경로 조회의 세대 2 분기는 실사용에서 도달할 수 없음
- `boundRequest`는 `c.status='review_required'`를 요구합니다. 세대 2 전환은 연결 해제 뒤에 일어나고, 해제 때 토큰도 회수되므로 AP는 404나 401만 받습니다.
- OpenAPI 설명("After a revoked connection … generation 2 belongs to Field")은 AP가 세대 2를 관측할 수 있다고 읽힙니다.
- 최소 수정: 문서에 "연결 유지 중에는 세대 1만 관측된다"를 명시합니다.

### L6. 웹과 API 사이의 작은 불일치
- `deletion_scheduled` 403(`trial-access.ts:8`이 `error: access.reason`으로 보냄)을 field-web 어디에서도 매핑하지 않습니다. 사이트 공개·도메인 등록 같은 화면에서 일반 오류로 보입니다.
- `memberFor`(`account-deletion.ts:66-70`)는 헤더가 없으면 첫 owner 조직을 고르는데, 웹은 헤더를 보내지 않습니다. 여러 조직의 owner는 두 번째 조직부터 삭제할 수 없습니다.

### L7. 테스트·문서 관련 정리
- `test/integrator.db.test.ts`(diff +51행) 주석은 "동적 등록 허용 scope(auth.ts)는 아직 새 scope를 포함하지 않으므로 DB에서 넓힌다"고 합니다. coordinator가 `clientRegistrationAllowedScopes`를 추가한 지금은 주석이 낡았고, 동적 등록 경로 자체는 테스트되지 않습니다.
- Field 동의 화면(`field-connect.tsx:106,138`)은 새 scope `field.proposals.respond`를 원문 문자열로 보여 줍니다. 고객 대신 제안을 수락·철회하는 권한인데 설명이 없습니다(기존 표시 패턴).

### L8. 조직 삭제 예약에 재인증이 없음
- 조직 이름 입력만으로 예약됩니다. 계정 삭제는 비밀번호를 요구합니다.
- 14일 유예와 취소가 있어 위험은 낮지만, owner 2단계 인증 세션이나 비밀번호 재확인을 고려할 만합니다.

## 확인 결과 문제없음
- **bookings.ts 추출**
  - 공개 고객 수락·취소 경로와 상태·revision 조건, `recordEvent`/`outbox` 인자, 반환값이 이전 코드와 동일합니다.
  - 제안 event 유형은 첫 제안과 변경 제안 모두 `field.reservation.proposed`입니다. 그 revision은 제안 상태에서 예약 revision과 일치합니다. 상태 변경 없이 revision만 올리는 갱신은 없습니다.
- **공개 연동 4경로의 인가**
  - `fieldIntegratorGrant`는 token·requested·consent scope를 모두 요구합니다.
  - `boundRequest`는 조직·client·grant·actor·`review_required`에 결합되어 있어, 다른 연결은 안전한 404입니다(테스트로 확인).
  - 고객 결정
    - 연결은 `for share`, 예약 행은 `for update`로 잠근 뒤 멱등 결과를 먼저 확인합니다.
    - 같은 키·같은 본문은 200, 다른 본문은 409, `customer_record_id` 재사용은 409입니다(unique 인덱스).
    - 결과 상태 enum에 confirmed가 없습니다.
    - `decline`은 400, 변경 제안 철회는 409입니다.
- **HMAC 수신함**
  - 서명 형식 `ts.event_id.raw`가 AP `field-event-inbox.ts`, Field 발신기와 같습니다.
  - ±300초 창, `x-event-id`와 본문 일치, `timingSafeEqual`(정규식으로 길이 보장)을 씁니다.
  - event_id PK로 재전송을 막고, body·연결이 다르면 409입니다.
  - `source_product`로 반사 공격을 차단합니다.
  - 해제 처리는 기존 서명 해제 코드를 그대로 추출한 것으로 diff에서 확인했습니다.
- **마이그레이션 000077/078/079**: 코드가 쓰는 컬럼명, 제약(result_revision > proposal_revision, state/processed_at 일관성), FK 대상이 일치합니다. 참조된 billing·site·recipient 컬럼도 존재합니다.
- **계약**: OpenAPI preview.9의 응답 형태와 상태 코드가 구현과 일치합니다. Grant scope enum과 scopes 목록이 일치하고, 계약 테스트를 강화한 부분이 통과합니다.
- **카카오**
  - kakao 공급사에 `verifyIdToken`이 없어 idToken 직접 로그인으로 우회할 수 없습니다.
  - linking 비활성 때 `account_not_linked`가 나고, 미인증 이메일로는 가입이 거부됩니다.
  - 2FA 브리지는 세션을 삭제하고 2FA 쿠키를 둔 뒤 리다이렉트하며, trust-device 경로도 정상입니다.
  - mock에 키가 있거나 키가 하나만 있으면 부팅이 거부됩니다. web은 서버 상태를 기준으로 버튼을 활성·비활성합니다.
- **로그**: redact와 msg 가림이 테스트로 확인됩니다. 실제 호출부는 `server.ts`의 `app.log.error(error)`뿐이고 err serializer로 가려집니다. 요청 줄에는 본문·쿼리·헤더가 없습니다.
- **TLS allow**: IP·포트·배열·기반 도메인·예약 TLD를 거부하고 쓰기가 없습니다. Caddy ask는 loopback으로 호출합니다. 노출되는 organizationId는 기존 `/site-hosts/:hostname`과 같은 수준입니다.
- **토스 웹훅**: mock 외 환경에서 공급사가 없으면 503(성공으로 위장하지 않음)입니다. 원장은 바꾸지 않고 unknown 건의 `next_attempt_at`만 앞당깁니다. 확정은 워커의 lookup으로만 일어납니다(테스트로 확인).
- **조직 삭제**: owner만 예약할 수 있고, 조직 행 잠금과 부분 unique로 중복을 막습니다. 실행 때 전제 조건을 다시 검사합니다. release 삭제가 release_assets cascade보다 먼저 일어나므로 FK 문제가 없습니다. 공개 slug와 asset은 404이고, `subscriptionAccess`는 `to_regclass`로 보호됩니다.
- **HEIC**: ftyp 브랜드로 감지하고 415 응답에 hint를 담습니다. web의 accept에서 HEIC를 제거하고 문구를 매핑했습니다. site-editor의 "영업시간 미설정 시 공개 불가" 문구는 `booking_schedule_not_ready`와 일치합니다.
- **UI**: 새 기능에 `(추가)` 표기가 있고, 버튼에는 API 연결이나 비활성 사유가 있습니다. 인라인 글자 크기 지정은 없습니다.
