# UI 계층 전체 점검 — apps/agent-web, apps/field-web (84af59a..13bcd31)

- 범위: 두 web 앱 diff 전체(새 파일 전부 정독), 새로 추가된 API 라우트와 오류 코드와의 대조, AGENTS.md §6·§6.0 규칙, 01_SUMMARY §2·§8–§12.
- 실행 환경: 로컬 mock 스택(AP 3001/4311, Field 3002/4321). Playwright로 320×640 화면 점검. 테스트 계정은 `@example.invalid` 합성 계정만 사용.
- 쓰기 작업: 합성 계정·조직·사이트를 만들고 PNG 2장을 업로드했습니다. 사진 1장은 삭제 요청까지 진행했습니다. 조직 삭제 예약 3건은 모두 다시 취소했습니다. 합성 조직 2곳(AP 1, Field 1)에서 체험이 시작된 상태로 남아 있습니다. 스택 종료나 `next build`는 하지 않았고, 파일도 수정하지 않았습니다.
- 스크린샷: `scratchpad/shots/*.png`. 원본 측정값: `scratchpad/ap1.json`, `fd1.json`, `fd2.json`.

## 심각도 순 결함

### H1. 조직 삭제 유예 중 사업자 화면에 `deletion_scheduled` 안내가 없고, 체험 시작은 계속 열려 있음 (중상)
- **증거(실제 확인):** 합성 AP 조직의 삭제를 예약했습니다. 그 뒤 `GET /v1/subscription`은 `access:{mode:"cleanup_only",reason:"deletion_scheduled"}`를 돌려줍니다.
  - 그런데도 `/workspace/subscription`에는 "로컬 mock 전용 14일 체험 제안"과 [AP 체험 시작] 버튼이 그대로 보였습니다.
  - `POST /v1/subscription/trial`은 **201로 성공**했고, Field도 같은 결과(201)였습니다.
  - `/workspace`에는 "삭제" 관련 안내가 전혀 없었습니다.
- **잘못된 문구가 나오는 위치(코드 확인):** 서버는 `rejectExpiredTrial`로 403 `{error:'deletion_scheduled'}`를 돌려주는데, 화면은 이 코드를 처리하지 않아 원시 상태코드 문구를 보여 줍니다.
  - AP 배포 활성화: `apps/agent-web/src/agent-deploy.tsx:95` → "상태를 변경하지 못했습니다 (403)."
  - Field 공개: `apps/field-web/src/site-editor.tsx:546` → "공개에 실패했습니다 (403)."
  - Field 카탈로그 승인: `apps/field-web/src/field-workspace.tsx:795` → "승인에 실패했습니다 (403)."
  - Field 도메인 등록: `field-domain-settings.tsx`의 `requestFailure`에 해당 키가 없어 "권한…확인" 문구가 나옵니다.
  - `deletion_scheduled`를 처리하는 곳은 공개 고객 폼 3곳뿐입니다.
- **최소 수정:**
  - (a) `agent-subscription.tsx:96`, `field-subscription.tsx:96`에서 `access.reason==='deletion_scheduled'`이면 체험 시작 영역 대신 "조직 삭제 예약 중 — 새 업무 중지, [계정·조직 삭제 (추가)]에서 취소" 배너를 `role="status"`로 보여 줍니다.
  - (b) 위 4곳의 403 분기에 `deletion_scheduled` 문구를 추가합니다(공통 상수 1개).
  - (c) API 공백: `POST /v1/subscription/trial`도 삭제 예약 중에는 거절해야 합니다. 화면 범위 밖이지만 함께 보고합니다.

### H2. AP 사업자 계정 화면이 실행 실패 사유를 원시 코드로 보여 줌 (중)
- AP 보존 작업자는 `last_error`를 `execution_failed:<SQLSTATE>`와 `,execution_attempts_stopped` 형태로 남깁니다(`apps/agent-api/src/account-deletion.ts:417`).
- 그런데 `apps/agent-web/src/agent-account.tsx`의 `MESSAGES`에는 `execution_failed` 키가 없습니다. 그래서 171행이 "실행 대기 사유: **요청이 거절됐습니다 (execution_failed:PAN01).** 자동 실행을 멈췄습니다…"를 출력합니다. 원시 코드가 보이고, "거절"이라는 말도 사실과 다릅니다.
- Field(`field-account.tsx`)에는 `execution_failed`·`media_permission`·`blocked_integration` 키가 있지만, `:` 뒤 상세가 붙은 코드는 Field도 그대로 원시 코드로 나옵니다(현재 Field 작업자는 상세를 붙이지 않아 문제는 없음).
- **최소 수정:** 171행에서 `code.split(":")[0]`로 앞부분만 조회하고, AP `MESSAGES`에 `execution_failed: "삭제 실행 중 오류가 나 다시 시도하고 있습니다."`를 추가합니다.

### H3. 멈춘 사이트 사진 삭제는 화면도 API도 없음 (중)
- 편집기는 `deletionStopped` 사진을 "삭제 지연 (추가)"로 표시하고 "**운영자 확인이 필요합니다**"라고 안내합니다(`site-editor.tsx:58`).
- 그러나 `site_assets.deletion_next_attempt_at='infinity'` 행을 운영자가 보거나 다시 실행할 수단이 없습니다:
  - 관리자 라우트에는 조직 삭제(`/v1/admin/organization-deletions`)만 있습니다.
  - Field 관리자 화면에도 사진 항목이 없습니다.
  - docs에도 운영 절차(runbook)가 없습니다(`deletion_next_attempt_at`로 검색해도 결과 없음).
- 결과적으로 "삭제 지연"이 해소될 길이 없고, 50장 상한도 계속 차지합니다.
- **최소 수정:** `GET /v1/admin/site-asset-deletions?status=stopped`와 `POST …/:id/resume`을 추가하고, `/admin/organizations`의 "삭제 요청 복구 (추가)" 패널에 사진 목록을 붙입니다. 최소한으로는 docs/04에 SQL 운영 절차를 적어 두고, 편집기 문구를 "운영 지원에 문의"로 바꿉니다.

### H4. 메일 발송 결과 확인 없이 "보냈습니다"로 표시 (중, 상태 문구 정직성)
- `deliverAuthEmail`은 SMTP 실패를 삼키고 outbox에 `failed`만 기록합니다(`apps/*-api/src/email-provider.ts:101-106`). 그래서 better-auth 엔드포인트는 항상 200을 돌려줍니다.
- 화면은 `/v1/auth/email-delivery`의 **설정 상태**(`configured`)만 보고 결과를 단정합니다:
  - 제목 "확인 메일을 보냈습니다"(`agent-auth-pages.tsx:59`, `field-auth-pages.tsx:59`)
  - 본문 "확인 메일을 보냈습니다 / 재설정 링크를 보냈습니다"(`apps/*-web/src/auth-flow.ts:18-19`)
- 로그인 화면 경로(`email_not_verified`)는 `sendOnSignIn`이 꺼져 있어 그 순간 아무 메일도 보내지 않는데도 "보냈습니다"로 나옵니다.
- **최소 수정:** 문구를 "확인 메일 발송을 요청했습니다. 몇 분 안에 오지 않으면 다시 보내기를 눌러 주세요."로 바꾸고, 로그인 경로의 제목은 "이메일 주소 확인이 필요합니다"로 고정합니다.

### H5. 개인정보처리방침이 현재 기능과 맞지 않음 (중)
- `apps/agent-web/src/legal.tsx:70`, `apps/field-web/src/legal.tsx:72`에 "**계정 삭제 기능 준비 중.** 그 전까지는 아래 연락처로 요청"이 남아 있습니다. 하지만 `/workspace/account`에서 계정·조직 삭제가 구현돼 있습니다.
- 수집 항목 표(사업자 계정 = 이름·이메일·비밀번호)에 빠진 항목:
  - 카카오 로그인 계정 식별값
  - 2단계 인증 비밀값·백업코드
  - 인증 메일 발송 기록 보존(30일/90일, 7일 뒤 익명화)
- **최소 수정:** 해당 행을 "계정·조직 삭제: 계정 화면에서 요청(조직은 14일 유예)"로 바꾸고, 수집·보존 행 3개를 추가합니다.

### M1. 운영 환경(live)에서 404가 되는 `/preview` 링크가 작업 화면에 남아 있음 (중하)
- 홈 화면만 링크를 숨겼습니다. 아래 위치에는 그대로 남아 있습니다:
  - `apps/agent-web/src/workspace.tsx:605`("화면 검토본 보기", "화면 검토본" 2곳)
  - `apps/field-web/src/field-workspace.tsx:1037`(로그인 화면 "화면 둘러보기"), `:1058`(2곳)
  - `apps/field-web/src/site-editor-frame.tsx:13`
- 이 컴포넌트들은 `"use client"`라서 `process.env.APP_PROFILE`이 브라우저에서 undefined가 됩니다. 홈 화면과 같은 조건문을 그대로 쓰면 숨겨지지 않습니다.
- **최소 수정:** `NEXT_PUBLIC_APP_PROFILE`을 빌드 시 넣거나, 서버 page에서 `preview` prop을 내려 숨깁니다.

### M2. Field 계정 화면에 카카오 재인증 버튼이 없음 (중하)
- AP에는 `reauthWithKakao` 버튼이 있습니다(`agent-account.tsx`, 조직·계정 두 곳).
- Field `field-account.tsx:171-172, 186-187`은 "카카오로 다시 로그인한 뒤 진행해 주세요"라는 문장만 있고 버튼이 없습니다. 카카오 전용 계정은 로그아웃했다가 다시 들어와야만 진행할 수 있습니다.
- **최소 수정:** AP의 `reauthWithKakao`(callbackURL `/workspace/account`)를 그대로 가져와 `reauth_required`일 때 버튼을 표시합니다.

### M3. Field 연결 화면: 2단계 인증 뒤 연결 이어가기가 실패하면 복구할 수 없음 (중하)
- `apps/field-web/src/field-connect.tsx:65-69`의 `verified()`에는 실패 상태와 busy 처리가 없습니다. 실패하면 이미 쓴 코드 입력란만 남고, 다시 입력하면 인증이 실패합니다.
- AP는 `continueFailed`와 "다시 시도 (추가)"로 이미 고쳤습니다(`agent-connect.tsx:51-79`). 01_SUMMARY §11 "연결 2FA 재시도 버튼"이 AP에만 반영된 것입니다.
- **최소 수정:** AP의 `continueFailed` 패턴을 Field에 그대로 적용합니다.

### M4. 고객 화면에 원시 오류 코드가 노출되는 경로
- 고객이 보는 `decisionErrorLabel` 기본 분기(`apps/agent-web/src/agent-field-action.tsx:75`) "Field가 결정을 받지 않았습니다 (code)."에 아래 코드가 그대로 나옵니다.
  - Field가 실제로 돌려주는 코드: `customer_proof_reused`, `customer_proof_mismatch`, `idempotency_conflict`, `invalid_customer_decision`, `external_reservation_not_found`, `field_decision_rejected`
  - AP 자체 코드: `field_reservation_not_accepted`(409), `invalid_receipt_key`(401)
- 같은 파일 `:218` "Field 상태를 확인하지 못했습니다 (401)"은 확인키를 교체한 직후에 실제로 나옵니다.
- **최소 수정:** 위 코드에 한국어 문구를 붙이고, 기본 문구에서는 코드를 숨깁니다(예: "Field가 이 응답을 받지 않았습니다. 제안을 새로 고친 뒤 다시 시도해 주세요.").

### M5. 원시 "(상태코드)" 문구가 나오는 그 밖의 경로 (하)
- 관리자 로그인에서 비밀번호가 틀리면(401) "로그인하지 못했습니다 (401)."이 나옵니다(`agent-admin.tsx:139`, `field-admin.tsx:142`). `signInOutcome`에 이미 `invalid_credentials`가 있으므로 그것을 쓰면 됩니다.
- 2단계 인증 등록 화면의 `(${status})` 문구(`*AdminMfa.tsx:48,64,74`)
- 계정 삭제 화면의 `deletionMessage` 기본 분기("요청이 거절됐습니다 (organization_not_found)" 등: `invalid_organization_id`, `account_not_found`)
- 직접 응대 409 `invalid_inquiry_state`(다른 탭에서 처리 완료한 경우)를 "새 질문이나 답변으로 변경됐습니다"로 안내함(`workspace.tsx:530-532`)
- Field 사진 삭제의 404(`organization_not_found`)를 "조직 소유자만…"으로 추정함(`site-editor.tsx:424`). 문구는 사실상 맞지만 400 `invalid_organization_id`는 `(400)`으로 나옵니다.
- Field 설치 화면의 `site_origin_not_allowed`(409) → "증명값 저장에 실패했습니다 (409)."(`field-ap-connections.tsx` storeProof/install)

### M6. AP 연결 화면의 카카오 버튼 문구가 Field와 다름 (하)
- Field는 리뷰를 반영해 연결 화면에서 `label="카카오로 로그인"`과 "계정·사업장 선행" 안내를 씁니다(`field-connect.tsx:90-91`).
- AP `AgentKakaoSignIn`에는 label prop이 없어 연결 화면(`agent-connect.tsx:89`)에서도 "카카오로 시작하기"(가입처럼 읽히는 문구)가 나오고, 안내 문장도 없습니다.
- **최소 수정:** `agent-kakao-sign-in.tsx:102`에 label prop을 추가하고 연결 화면에서 "카카오로 로그인"을 넘깁니다. 안내 문장 1줄도 추가합니다.

### M7. 접근성: 확인 단계나 대화상자 뒤 포커스가 사라짐 (하)
- **확인(브라우저):** Field 사진 "삭제 요청 (추가)" → `window.confirm` 수락 뒤 `document.activeElement === BODY`였습니다. 눌렀던 버튼이 비활성화되면서 포커스가 빠집니다(`site-editor.tsx:405-428`).
- **코드상 같은 패턴:**
  - 계정 화면 "삭제 예약 내용 확인" → 버튼이 사라지고 `role="alert"` 영역으로 바뀝니다(`agent-account.tsx:187`, `field-account.tsx:174`). [돌아가기]를 눌러도 같습니다.
  - 2단계 인증 등록 정보가 표시될 때(`*AdminMfa.tsx:49`)와 `TwoFactorChallenge`가 열릴 때 입력란으로 포커스가 가지 않습니다.
- **최소 수정:** 처리가 끝나면 `ref.focus()`로 상태 메시지, 확인 영역, 코드 입력란에 포커스를 둡니다. 2단계 인증 입력란에는 `autoFocus`를 줍니다.

### M8. 비활성 사유 표시가 두 제품 간에 다름 (하)
- AP 운영자 "다시 실행"(`agent-admin.tsx:99`)은 사유가 10자 미만이면 비활성인데, 사유 문장이 없고 label "(10~500자)"만 있습니다.
- Field는 `deletionResumeBlockReason`과 `aria-describedby`를 씁니다.
- **최소 수정:** Field 함수를 AP에도 적용합니다.

### M9. 운영자용 메일 발송 상태 화면 없음 (하, 데이터는 있으나 UI 없음)
- `email_outbox.state=failed|blocked_integration`, `error_code`는 쌓이지만 관리자 화면에는 나오지 않습니다. 사용자가 "메일이 안 온다"고 할 때 확인할 곳이 없습니다.
- 관리자 운영 현황 카드에 "인증 메일 실패 n건" 정도라도 추가하는 것을 권합니다.

## 화면에서 쓰지만 존재하지 않는 경로, 또는 바뀐 본문 — 결함 없음
- 새 web fetch는 모두 실제 라우트와 일치합니다:
  - deletion-requests/current GET·DELETE, deletion-requests POST
  - deletion-eligibility, account/deletion-requests
  - admin organization-deletions 목록·resume
  - auth/email-delivery, auth/providers
  - owner take-over/release
  - field-actions GET·customer-decisions POST
  - connections facts 재확인
  - sites/assets DELETE
- 본문 필드명 확인:
  - AP `verification/reauthWindowMinutes`, Field `reauthentication/recentSignInMinutes`가 각 API와 일치합니다.
  - `current`, `scopeState/missingScopes`, `defaultOrigin`, `policy`, `inUse/deletionStopped`, `error`(도메인)도 일치합니다.
- better-auth 경로 8개는 실행 중인 스택에서 404가 아닌 응답(400/401)을 확인했습니다: request-password-reset, reset-password, send-verification-email, two-factor/enable, verify-totp, verify-backup-code, sign-in/social, verify-email.

## 문제없음으로 확인한 항목
- **320×640 가로 스크롤 없음 + 14px 미만 글자 없음 + 라벨 없는 입력 없음** (계산 스타일로 실측)
  - AP: `/workspace/account`, `/admin/mfa`, `/verify-email`(토큰 있음/없음), `/forgot-password`, `/reset-password`(토큰 있음/없음), `/terms`, `/privacy`, `/connect/sign-in`, `/workspace/deployments`, `/workspace/subscription`, `/admin/organizations`, `/`, `/workspace`
  - Field: 위와 같은 목록, 사이트 편집기 3단계 "사진 보관함 (추가)"(사진 2장, 삭제 중 상태 포함), 작업 공간 "주소·도메인"
  - AP Field 제안 패널: 정적 렌더를 AP CSS 위에 주입해 확인했고, 결과 미상 상태도 포함했습니다(`shots/ap-proposal-panel.png`).
  - 새 CSS(`legal.css`, `site-editor.css` 추가분)는 모두 14px 이상입니다.
- **하이드레이션 경고·pageerror 없음.** 콘솔에는 리소스 401/400/403/404만 있었고, 모두 의도된 상태 조회입니다(로그인 전 관리자 화면 403, 잘못된 토큰 401, 카탈로그 미공개 404 등).
- **`(추가)` 표시**
  - 새 기능에는 모두 붙어 있습니다: 비밀번호 찾기, 확인 메일 다시 보내기, 2단계 인증, 계정·조직 삭제, 삭제 요청 복구, 직접 응대 시작/종료, Field 제안 4개 버튼, 다시 시도, Field 권한 다시 확인, 최신 승인으로 다시 연결, 사진 보관함·삭제 요청·삭제 중·삭제 지연, 도메인 확인 결과, 개인정보 안내·약관 링크, 본인 확인.
  - 시안 원본 기능(카카오로 시작하기, 로그인, 기존 구독 화면)에는 붙지 않았습니다.
- **기본 흐름 실제 동작**
  - AP 조직 삭제 예약: 잘못된 비밀번호 → "비밀번호가 올바르지 않습니다." → 정상 예약 → 예약 정보 표시 → 계정 삭제가 `organization_deletion_required` 문구로 막힘 → 취소 문구 정상
  - Field 사진 삭제 요청: 확인창 → 202 → "삭제 중 (추가)"와 비활성 사유 표시 → 섹션 선택 목록에서 제외 → 50장 계수 안내
- **비활성 버튼 사유 표시:** 계정 삭제 조건 충족 여부, 체험 동의, 환불(결제 내역 없음), 홍보 카드 이름, 제안 버튼(현재 상태 미확인·이미 수락·변경 제안), 사진 삭제(권한·초안 사용·미저장·공개 사용), Field 운영자 다시 실행.
- **오류 코드 → 한국어 문구:** 계정 삭제 코드 14종, `mfa_required`, `knowledge_stale`(배포·공개 폼), `notification_phone_invalid`, `heic_unsupported`(AP·Field), `asset_deleting`(초안 저장·공개), `booking_schedule_not_ready`, 도메인 `last_error` 코드 전부, 카카오 콜백 오류, 공개 고객 폼의 `deletion_scheduled`.
- **상태 문구 정직성**
  - "조직 삭제를 예약했습니다"는 201 확인 뒤에만, "계정을 삭제했습니다"는 200 확인 뒤에만 나옵니다.
  - "제안 수락을 Field에 전달했습니다 · 예약 확정은 사업자가"는 recorded 확인 뒤에만, 202는 "결과를 확인하지 못했습니다"로 나옵니다.
  - 사진 삭제 202는 "삭제를 요청했습니다"로 나옵니다.
  - 메일은 mock·미연결 상태를 숨기지 않습니다(H4 예외).
- **알림·결과 영역의 role:** 새 알림과 결과 메시지에 `role="status"`, 삭제 확인 영역에 `role="alert"`, 확인 메일 안내에 `aria-live`가 있습니다.
- **기타**
  - 일회용 토큰을 읽은 즉시 주소창에서 지우고, `referrer: no-referrer`와 noindex가 설정돼 있습니다.
  - 카카오 인가 주소는 kauth.kakao.com만 허용합니다.
  - Host 소문자 처리가 `.well-known/ap-site-verification`, `site-route.ts`, `custom-domain-host.ts`, 프록시에 반영돼 있습니다.
  - 체험 정책 문구는 서버의 `policy`를 쓰고, 동의 버전도 서버 값을 보냅니다.
