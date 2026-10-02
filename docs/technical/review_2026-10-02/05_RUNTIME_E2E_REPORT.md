# FieldAI 로컬 mock 런타임 검수 보고 (commit 84af59a, 2026-10-02, APP/AP/FIELD_PROFILE=mock)

## 실행 요약
- DB 컨테이너 3개(agent db, field db, field queue) healthy. 그대로 실행 중이고 볼륨은 건드리지 않음.
- `pnpm mock:run`(= node tools/mock-run.mjs suite): 기동 성공. 4311·4321 `/health/ready` 200, 3001·3002 `/workspace` 200. 크래시 없음.
  로그에 경고/에러 없음. blocked_integration 안내만 나옴(billing·notification·custom domain worker, Field site AI worker "model not configured").
  검수 뒤 SIGINT로 종료함. 포트는 비었고 DB는 계속 실행 중. 소스 변경 없음(git clean).
- E2E(Playwright venv: scratchpad/venv, 기존 /private/tmp/fieldai-e2e-venv-20260929는 없어서 새로 만듦):
  - `pnpm test:e2e:agent` exit 0 (8개 파일, 전부 pass, skip 0)
  - `pnpm test:e2e:field` exit 0 (7개 파일, 전부 pass, skip 0)
  - `pnpm test:e2e:distribution` exit 0 (2개 파일, pass)
- curl/Node HTTP 흐름(웹 프록시 경유):
  - Field: 가입→조직→카탈로그 초안/승인→사이트 생성→예약정책→사이트 공개→공개 API→직접 문의→요청형·시간표형 예약→사업자 문의 답변→알림. 전 단계 정상.
  - AP: 가입→조직→지식 승인→AI 승인→상담 링크 생성/활성→engagement→AI 질문(503 blocked_integration)→사람 문의 제출→직접 문의→사업자 답변→고객 확인키 열람. 정상.
  - AP owned_embed: 증명 전 verify 409, 증명 후 200, activate, `/sdk/v1.js` 200, frame 200(CSP frame-ancestors=origin). 정상.
- API 퍼징(전체 라우트 Field 157개·AP 168개 × 인증 유무 × 잘못된 id/본문 6종): 5xx 없음. 503 paid_checkout_not_configured만 나왔고 이는 의도된 동작임.
- 브라우저(1280px, 28개 화면, 버튼 클릭 효과 탐지 + 320px 가로 넘침/14px 미만 글자 검사): pageerror·hydration 오류·5xx 없음. 320px 넘침 없음. 14px 미만 글자는 404 기본 페이지에서만 나옴.

## 1. 실제 코드 결함

### D1. Field 기본 사이트 주소(테넌트 호스트 루트)가 404 — 사업자가 복사해 고객에게 주는 주소가 열리지 않음
- 재현: 사이트 공개 후 `GET http://field-<slug>.localhost:3002/` → **404 "Not Found"**. `/home`도 404.
  `/site/field-<slug>`은 200, `/public/<orgId>`도 200.
- 기대: 사이트 기본 주소 루트에서 공개 사이트 홈이 열려야 함. 자체 도메인 분기는 이미 `/`를 `/site/<slug>`로 rewrite함.
- 원인: `apps/field-web/src/proxy.ts:50-76` 테넌트 서브도메인 분기는 `/site/<slug>`, `/public/<id>`, receipt 경로만 허용하고, 그 밖의 경로는 `:76 return notFound()`로 끝남.
  같은 파일 `:40-45` 자체 도메인 분기에는 `/`와 `/<page>`를 `/site/<slug>[/<page>]`로 rewrite하는 로직이 있지만 테넌트 분기에는 없음. live에서 `https://<slug>.<FIELD_SITE_BASE_DOMAIN>/`도 같은 경로를 타므로 운영에서도 404가 남.
- 사용자에게 드러나는 곳:
  - `apps/field-web/src/field-domain-settings.tsx:146-150`: "기본 사이트 주소" 입력칸과 **복사 버튼**이 `defaultOrigin`(루트) 값을 보여주고 복사함. 이 주소를 고객에게 보내면 404.
  - `apps/field-web/src/field-ap-connections.tsx:228`: "Field 공개 사이트 주소: http://field-xxx.localhost:3002"로 루트를 표시함. 옆의 "공개 사이트 열기" 링크는 `/site/<slug>`를 붙이므로 정상.
  - API `GET /v1/public/sites/:slug`의 `siteOrigin/defaultOrigin`(`apps/field-api/src/sites.ts:18-24`)도 루트임.
- 수정 방향(제안): proxy 테넌트 분기에 custom-domain 분기와 같은 `/`·`/<page>` → `/site/<slug>/<page>` rewrite를 추가함. 또는 복사·표시 값을 `${origin}/site/${slug}`로 통일함. rewrite 쪽이 사용자가 기대하는 주소에 맞음.
- E2E에서 놓친 이유: tenant-host 테스트는 `/site/<slug>` 경로와 타 사업장 404 가드만 검사함.

### D2. (경미) 고객 예약 화면에서 정상 상태인데도 매번 409 콘솔 오류
- `GET /v1/reservations/:id/catalog-review` → 카탈로그가 최신이면 `409 {"error":"catalog_current"}`(`apps/field-api/src/bookings.ts:950-951`).
  `apps/field-web/src/field-booking.tsx:964,1117`이 예약 화면을 열 때마다 호출하므로 브라우저 콘솔에 "Failed to load resource 409"가 항상 남음.
- 기능 영향은 없음(UI는 정상 표시). 정상 상태를 오류 코드로 알리는 설계라서 모니터링·콘솔 노이즈가 생김. 200 `{reviewRequired:false}` 같은 응답이 적절함.

### D3. (경미, 데이터 표시) 시간표형 예약의 요청 시각이 사업자 목록에 안 보임
- `apps/field-web/src/field-workspace.tsx:976` `preview: item.requestMessage || item.preferredTimeText || item.service.name`.
  시간표형 예약은 `requestedStartAt`만 있으므로 "오늘/문의함" 목록에 시각 대신 서비스명("펌")이 반복 표시됨. 상세에 들어가야 시각을 볼 수 있음.

### D4. (경미, 계약 일관성) 공급사 미연결 상태의 delivery 값이 제품마다 다름
- AP는 고객 문의·사업자 답변에 `delivery:"blocked_integration"`을 반환함.
- Field는 같은 상황에서 `delivery:"pending"`을 반환하고 메시지 `delivery_state='pending'`으로 저장함(`apps/field-api/src/inquiries.ts:254,306,410,620,631`).
- UI 문구는 두 제품 모두 "미연결·미발송"으로 올바르게 보정함. API/DB 소비자 입장에서는 pending이 "곧 발송"으로 읽힐 수 있음.

## 2. UX 막다른 길 / §6 점검
- 기능 없는 버튼: **발견 못 함.** 클릭 시 네트워크·DOM·URL 변화가 없던 버튼은 모두 아래 셋 중 하나였음.
  - 필수 입력이 빈 form submit. 브라우저 기본 required 검증이 막는 경우로, 예: 문의 제출, AI에 질문, 위젯 등록, 내 홈페이지 시작하기.
  - 이미 선택된 탭(모두, 3 편집, 매체 "오늘").
  - 이미 빈 초안을 다시 비우는 버튼("새 카드 초안").
- 비활성 버튼 사유: 대부분 옆에 사유 문구가 있음(카카오 시작, Field 동의 시작, 체험 시작, 사이트 증명값 저장).
  - 예외 1: AP `/workspace/campaigns` "초안 만들기"는 카드 이름이 비어서 비활성인데 사유 문구가 없음(`apps/agent-web/src/agent-campaigns.tsx`).
  - 예외 2: AP·Field `/workspace/subscription` "환불 검토 요청"은 결제 내역이 없는데도 환불 폼 전체가 보이고, 버튼만 비활성이며 사유 문구가 없음.
- 시각 일관성(고정 디자인 기준 대비, 낮음):
  - AP·Field `/workspace/integrations`, `/workspace/subscription`, `/workspace/campaigns`에 브라우저 기본 스타일 버튼이 섞여 있음(상태 새로고침, AP 계정 연결 시작, 새 카드 초안 등).
  - AP subscription에는 "상태 새로고침"이 두 번 나옴.
  - Field integrations "AP 배포 증명값" 라벨과 입력칸이 붙어 있음.
  - Field 공개 사이트 서비스 카드에서 "희망 시간 제출 방식예약 요청 →"처럼 띄어쓰기가 없음.
  - AP 상담 파일 입력이 "Choose File"(브라우저 기본 영문)으로 표시됨.
  - Field 공개 사이트 본문에 운영시간이 표시되지 않음(문의 화면에만 있음).

## 3. 예상된 blocked_integration (결함 아님)
- AP `POST /v1/agents/test`, `POST /v1/engagements/:id/messages` → 503 blocked_integration(모델 키 없음). 상담 화면은 사람 문의로 대체 경로를 제공함.
- Field site AI worker, 생성 작업은 모델 미설정 상태임.
- 결제: `POST /v1/subscription/checkout`, `.../authorizations/:id/confirm` → 503 paid_checkout_not_configured. billing worker 3종 모두 blocked_integration.
- 고객 외부 알림(카카오·문자): notification worker blocked_integration. UI에 "공급사 연결 전 · 외부 발송 차단"으로 표시됨.
- Field custom domain worker(DNS/TLS) blocked_integration.

## 산출물 (scratchpad)
mock-run.log, e2e-{agent,field,distribution}.log, e2e-exit.txt, field-flow.out, ap-flow.out, ap-embed.out, fuzz-*.out, explore-result-{0,1}.json, shots/*.png
테스트 계정(합성): field-flow.out / ap-flow.out 마지막 줄에 기록됨(example.invalid). E2E 외 수동 계정은 DB에 남아 있음.
