# Field 리뷰 E — 미커밋 변경(HEAD 196befc 기준) / Field·계약·docs·tools

범위: `git diff HEAD -- apps/field-api apps/field-web contracts docs tools` + 신규 `000083_site_asset_two_phase_deletion.sql`, `ap-signature.ts`(전체 읽음), AP `field-signature.ts`와 AP 발신·수신 서명 줄은 바이트 비교용으로 함께 읽음. 파일은 수정하지 않았다.

## 실행한 검사 (로컬 mock, 격리 DB)
- `node tools/run-db-suite.mjs field test/sites.db.test.ts test/auth-kakao.db.test.ts test/account-deletion.db.test.ts test/ap-connection.db.test.ts test/integrator.db.test.ts test/revocation-restore.db.test.ts` → 6+8+5+1+2+1 = 23/23 통과
- `tsx --test apps/field-web/test/kakao-sign-in.test.tsx test/site-photo-delete.test.tsx` → 9/9 통과
- `node --test tools/test/field-integrator-contract.test.mjs tools/test/agent-integrator-contract.test.mjs` → 5/5 통과
- field-api·field-web `tsc --noEmit` 오류 0, 변경된 Field 소스 7개 eslint 오류 0
- 미실행: 전체 `test:db:field`, e2e, `integration:faults`, 실 카카오/S3

## 결론
Critical/High 결함은 없다. 네 채널 서명 원문은 양 방향 모두 바이트 단위로 일치하고, 2FA 복귀 주소에도 open redirect가 없다. 사진 2단계 삭제의 참조 경쟁(초안 저장·공개·복원·AI 반영)도 잠금으로 막혀 있다. 고쳐야 할 것은 Medium 2건(웹이 새 409를 잘못 해석, v2 전환에 발신 측 전환 수단 없음)과 Low 몇 건이다.

---

## Medium

### M1. 편집기가 `409 asset_deleting`을 초안 충돌로 잘못 처리하고, 섹션 사진 선택에 '삭제 중' 사진을 그대로 보여 준다 (web↔API 불일치)
- `apps/field-web/src/site-editor.tsx:599` 섹션 사진 `<select>`는 `assets.map(...)`으로 모든 사진을 옵션으로 보여 준다. `state:"deleting"` 사진도 "사진 N · W×H · **서버 저장 완료**"로 표시된다(정직성 문제). 고르면 미리보기 `<img src=/v1/sites/assets/:id>`는 404다(`sites.ts` 소유자 GET이 `a.state='ready'`로 막음).
- 그 상태에서 저장하면 `PUT /v1/sites/draft`가 `409 {error:'asset_deleting'}`를 돌려준다(`sites.ts:543-546`). 그런데 `site-editor.tsx:426`은 모든 409를 revision 충돌로 보고 최신 초안을 다시 읽는다. 내용이 다르므로 "다른 수정이 먼저 저장되었습니다… 두 초안을 비교" 충돌 화면을 띄운다. 실제 원인은 삭제 요청된 사진인데 엉뚱한 안내가 나간다.
- 다른 탭에서 삭제를 요청한 사진이 이 탭의 미저장 초안에 남아 있는 경우에도 같은 경로를 탄다.
- 공개 409 `asset_deleting`(`sites.ts:602-605`)도 `site-editor.tsx:522-524`에서 "초안 충돌 또는 승인된 사업 정보가 없어"로 뭉뚱그려진다.
- 최소 수정:
  - select 옵션을 `asset.state === "ready"`로 거른다. 단, 현재 섹션에 이미 지정된 id는 남기고 '삭제 중'으로 표시한다.
  - `saveDraft`의 409 분기 첫 줄에서 `(result.data as {error?:string}).error === "asset_deleting"`을 먼저 확인하고, "삭제 요청된 사진이 섹션에 있습니다. 사진을 빼고 저장해 주세요"로 `failed` 처리한다. 충돌 화면으로 보내지 않는다.
  - 공개 409도 같은 코드를 따로 안내한다.

### M2. v2 서명으로 바꿨는데 발신 측 전환 수단이 없다. 비동시 배포 때 사건·연결 해제가 `blocked`로 멈춘다 (운영 전환·무결성)
- 발신기 5곳(Field `ap-event-delivery.ts:100-103`, `facts-change-delivery.ts:90-93`, `ap-connection-revoke.ts:54-56`, AP 발신 2곳)은 무조건 `v2:`로 서명한다. 구버전 수신자는 헤더를 무시하고 v1 원문으로 검증하므로 401을 낸다.
- Field 발신기는 401을 `blocked`로 확정한다(`ap-event-delivery.ts:110`, `facts-change-delivery.ts:100`, `ap-connection-revoke.ts:71`). AP도 같다.
- 두 제품은 따로 배포되는 구조라(AGENTS §2) 어느 쪽을 먼저 올려도 그 사이에 나간 사건과 **연결 해제 요청**이 `blocked`에 머문다. 해제가 전달되지 않으면 상대 쪽 연결이 계속 살아 있어 보안 영향이 있다.
- 수신 측 `*_ACCEPT_V1`은 "구버전 발신자 → 신버전 수신자" 방향만 해결한다. "신버전 발신자 → 구버전 수신자" 방향은 막을 방법이 없다.
- 현재 live 배포가 없으므로 지금 피해는 없다. 하지만 docs/03·CONTRACT_NOTES가 말하는 "전환 기간"은 실제로는 동시 배포 아니면 수동 재큐를 뜻한다.
- 최소 수정 (둘 중 하나):
  - (a) 발신 버전 env(`FIELD_EVENT_SIGNATURE_SEND_VERSION=1|2`, 기본 2, live에서 1은 전환 기간만)를 추가하고 배포 순서 runbook을 문서화한다(양쪽 수신 v1 허용 → 양쪽 발신 v2 → v1 허용 해제).
  - (b) 최소한 docs/03에 "동시 배포 + blocked 사건/해제 재큐 절차"를 명시하고 재큐 경로가 있는지 확인한다.

---

## Low

- **L1. 보존 워커가 한 try 블록 안에서 모든 단계를 실행한다**
  - 위치: `retention-purge-worker.ts:36-56`
  - `runOrganizationDeletionOnce`나 `runSiteAssetDeletionOnce`가 예외를 내면(`site-media.ts:199-201`에서 최종 트랜잭션 오류를 다시 던짐) 같은 주기의 법정 보존 작업 `runFieldRetentionJobOnce`가 건너뛰어진다.
  - S3 delete/head 호출에 timeout이 없어 최대 10건의 순차 I/O가 보존 작업을 늦출 수 있다. 5분 임대를 넘기면 다른 워커가 같은 행을 다시 잡는다. 결과는 안전하지만(최종 삭제는 `state='deleting'` rowCount로 한 번만 이벤트 발행) `deletion_attempts`가 두 번 늘 수 있다.
  - 수정: 단계마다 try/catch를 따로 두고, siteMedia 호출에 `AbortSignal.timeout`을 건다.
- **L2. 연결 화면의 카카오 버튼은 묵시적 가입이다**
  - 위치: `field-connect.tsx:97`
  - 새 카카오 사용자는 연결 로그인 화면에서 바로 Field 계정이 만들어진다. 같은 화면 문구 "계정과 사업장 생성은 Field 작업 공간에서 진행합니다"(`field-connect.tsx:71`)와 맞지 않는다. 이후 조직 선택 화면은 비어 있다.
  - 수정: 문구를 고치거나, 연결 경로에서 묵시적 가입을 막는다.
- **L3. 문서·원장 미갱신 (AGENTS §6.1)**
  - `contracts/CONTRACT_NOTES.md:3`은 아직 "AP 미리보기 preview.10"이라고 쓴다. 지금은 preview.11이다.
  - `docs/technical/review_2026-10-02/01_SUMMARY.md:260,262`에 `REVIEW_FIX_R5`, `VERIFICATION_R6` placeholder가 남아 있다.
  - `TASKS.md:5`의 "남긴 것"에 이번에 구현한 4건이 그대로 있다.
  - `docs/CODEX_HANDOFF.md:15`의 사진 삭제 잠금 순서 설명이 예전 것이다(현재는 sites FOR SHARE + 2단계 삭제).
  - `infra/field/.env.live.example`에 `FIELD_EVENT_SIGNATURE_ACCEPT_V1`이 없다.
- **L4. 공개 409 `asset_deleting` 안내가 뭉뚱그려져 있다.** M1과 함께 고치면 된다.
- **nit**
  - `custom-domain-routes.ts:140` site-assets 리소스 확인이 `deleting` 행에도 `allowed`를 준다. 실제 GET은 404라 피해는 없다.
  - `kakaoTwoFactorReturnUrl`은 같은 host의 userinfo(`https://u@host/connect/sign-in`)를 그대로 둔다. `target.username = target.password = ''` 정도면 된다.

---

## 확인했고 문제없는 것
- **서명 원문 일치**: 4채널 × 양방향을 문자 단위로 비교했다. 접두사는 순수 ASCII임을 `od -c`로 확인했다.
  - AP 사건 발신 `v2:ap->field.${ts}.${eventId}.`+raw ↔ Field 수신 `ap-webhook-inbox.ts:99`
  - AP 해제 발신 `…${claim.id}.${claim.connection_id}.revoke`(대상 경로 `/connections/${connection_id}/revoke`) ↔ Field 수신 `ap-connection-revoke-receiver.ts:85` (connectionId는 URL 파라미터)
  - Field 사건·facts 발신 `v2:field->ap.` ↔ AP `field-event-inbox.ts`
  - Field 해제 발신 ↔ AP `field-connection-revoke.ts:48`
  - 헤더 이름 `x-signature-version: '2'`도 일치한다.
- **v1/v2 판정**:
  - 헤더 배열·빈 값·'3'은 null → 401. v1 원문에 v2 헤더를 붙여도 401. 반대 방향 v2도 401.
  - 버전 헤더는 서명 바이트에 들어가지 않지만 접두사가 바뀌므로 헤더 위조는 소용없다.
  - v1 허용 모드에서도 새 발신자는 v1을 만들지 않으므로 반사가 불가능하다.
  - 사건/해제/복구 조회(`notification-status`)/알림 경로 종료(`route-close`) 사이의 교차 충돌도 불가능하다(raw는 JSON이어야 하고 접미사가 다름). 복구 조회·경로 종료는 Field→AP 단방향이라 바꾸지 않은 것이 맞다.
  - 잘못된 env 값은 `registerApWebhookInbox`에서 부팅을 멈춘다. 해제 수신기와 같은 블록에서 등록된다(`app.ts:90,95`).
  - live 기본값 false는 `production-profile.ts`의 live 강제와 맞물린다.
- **OpenAPI·정적 테스트**: 두 문서의 version, securityScheme 설명, `X-Signature-Version` 파라미터(enum ['2'], optional)가 코드 동작과 일치한다. docs/03의 원문 정의도 일치한다.
- **카카오 2FA 복귀**:
  - 같은 origin + `/connect/sign-in` 정확 일치만 허용한다. `//evil`, `\\evil`, `javascript:`, `..` 정규화, `-evil` 접미사, 다른 scheme은 모두 workspace로 보낸다.
  - `getOAuthState().callbackURL`은 서버 state에서 복원되며 sign-in 때 trustedOrigins 검사를 거친다.
  - URLSearchParams 재직렬화(`%20`→`+`)는 oauth-provider의 `canonicalizeOAuthQueryParams`가 파싱 후 정규화하므로 서명을 깨지 않는다. 추가 파라미터는 서명을 깨지만, 웹이 continue 전에 `auth_error/error/error_description/two_factor`를 지운다(자식 effect가 부모의 get-session보다 먼저 실행됨).
  - 세션은 TOTP 뒤에만 생긴다(테스트 통과).
- **삭제 경쟁 (재참조 불가)**:
  - 초안 PUT: 사진 FOR SHARE를 먼저 잡으면 DELETE의 FOR UPDATE가 기다린 뒤 별도 문장 스냅샷으로 초안을 보고 409를 낸다. DELETE가 먼저면 PUT의 FOR SHARE가 갱신된 행(`deleting`)을 다시 읽고 409를 낸다.
  - 공개: sites FOR UPDATE ↔ DELETE sites FOR SHARE로 직렬화되고, 이제 `client`(트랜잭션 안)로 조회한다. 예전 pool 조회보다 개선됐다.
  - 복원: 릴리스 사진은 `site_release_assets`에 있으니 항상 in_use라 `deleting`이 될 수 없다.
  - AI 반영: `layoutToSite`는 assetId를 만들지 않는다. `preserveSitePhotos`는 base_revision 초안의 사진만 옮기고 apply는 revision이 같을 때만 허용하므로, 반영 결과의 사진은 현재 초안 사진의 부분집합이다.
- **잠금 순서와 교착**:
  - 조직 삭제 실행기(org FOR UPDATE → assets FOR UPDATE → drafts/releases 삭제)와 DELETE(org KEY SHARE 먼저) 사이에 순환이 없다. 초안 PUT(sites SHARE → assets SHARE)과도, 워커 claim(skip locked)·실패 UPDATE(단일 문장)·최종 트랜잭션(org KEY SHARE 먼저)과도 순환이 없다.
  - 실행기는 `deleting` 행도 함께 지우고(테스트 2건), 워커의 최종 delete가 0행이면 이벤트를 내지 않는다.
- **migration 000083**:
  - `site_assets_state_check`는 000010 자동 이름과 일치한다(격리 DB 적용 성공).
  - 일관성 CHECK와 코드 전이(요청 시 두 시각 설정, 워커는 next만 변경, `infinity` 허용)가 일치한다.
  - partial index는 claim 쿼리와 맞는다. 롤백 주석도 있다.
- **backoff·정지**: SET 식은 이전 값 기준이라 30s·2^n·최대 1h가 맞고, 12회째 정지와 `media_permission` 시 attempts 유지·정지가 맞다. 저장소가 없으면 attempts를 늘리지 않고 1h 뒤로 미루며, 요청 단계에서도 503 `blocked_integration`을 낸다.
- **상한·조회**: 상한은 `deleting` 행을 포함해 센다(UI 문구 있음). 공개 GET, 소유자 GET, 운영 보관 내보내기는 `ready`만 본다. outbox 순서는 `deletion_requested` → `deleted`이고 소비자는 없다.
- **200→202**: 다른 호출자(tools/spikes/e2e/web)가 없다. 기존 테스트는 202·워커 의미로 바꿨으며 약화는 아니다. 예전 503 저장소 실패 단언은 워커 재시도 단언으로 옮겨졌다.
- **UI**: "삭제 요청 (추가)", "삭제 중 (추가)", "삭제 지연 (추가)" 표기와 비활성 사유가 있고 badge·placeholder는 14px다. 카카오 버튼은 시안에 있는 기능이라 (추가)를 붙이지 않은 것이 맞다. 버튼 스타일은 전역 `site.css`에서 로드된다.
