# FieldAI 문서 대 구현 갭 보고서 (2026-10-02, HEAD 84af59a, 읽기 전용)

기준 자료는 다음과 같습니다.
- 원장: TASKS.md 상단 52[x]/7[ ] 원장과 그 이후 2026-09-29 재감사 수리분.
- 문서: docs/00~06, technical 감사 문서.
- 코드: `apps/*/src`, `migrations`, `test`, `tools/spikes`.

판정 방식은 다음과 같습니다.
- 5개 영역(AP PRD, Field PRD, 연동/QA, 공급사/인프라, UI/온보딩)을 병렬로 대조했습니다.
- 핵심 주장은 코드에서 직접 재확인했습니다.
- 분류 "구현+테스트"는 **로컬 mock과 격리 PG17 기준**입니다. 실제 공급사나 실제 기기에서 검증했다는 뜻이 아닙니다.

---

## 결론 요약

1. **내부 테스트는 매우 두껍지만, 운영 프로필(sandbox/live)에서는 가입부터 진행되지 않습니다.**
   - 막는 요인은 외부 키 부재만이 아닙니다. 아래는 **코드 공백**입니다.
     - 웹 live 빌드가 차단되어 있습니다.
     - 인증 메일 발송 코드가 없습니다.
     - 체험(trial)이 mock 전용입니다.
     - 관리자 기능 전체가 mock 전용입니다(MFA 미구현).
     - 배포 산출물(Dockerfile/CI)이 0개입니다.
2. **"10분 홈페이지"의 결과물이 빈 사이트입니다.** 템플릿 경로는 상호 제목 hero 섹션 1개만 만들고 본문은 비어 있습니다. 카탈로그로 섹션을 채우는 매핑은 LLM 경로에서만 호출됩니다.
3. **문서가 실제보다 앞선 곳이 있습니다.**
   - `DEVELOPMENT_STATUS.md:7`에 "현재 확정 내부 누락은 없으며"라고 적혀 있습니다. 실제로는 아래 내부 누락이 확인됩니다.
     - Field 공개 API 4개
     - §4.6 상태 5종
     - human_active 상태
     - 계정 삭제
     - 이벤트 키 교체
     - HEIC 처리
   - `acceptance_catalog.json`의 QA 160개는 모두 `not_run`입니다. 테스트 코드에 QA ID 참조가 없어 추적성이 없습니다.

---

# 산출물 1 — 미완료/덜 된 개발 리스트

분류 범례:
- **구현+테스트**
- **구현만**: 테스트 없음
- **부분**
- **미구현**
- **BI**: blocked_integration, 즉 외부 공급사가 필요함
- **운영게이트**

실사용을 막는 순서로 정렬했습니다.

## 1-A. 실사용 차단: 공급사 키와 무관한 내부 코드 공백 (최우선)

| # | 항목 | 분류 | 근거 | 필요한 작업 |
|---|---|---|---|---|
| 1 | 웹앱을 live로 빌드할 수 없음 | 미구현 | `apps/agent-web/next.config.ts:2`, `apps/field-web/next.config.ts:2`가 `APP_PROFILE=live`이면 throw합니다. Field 테넌트 Host 라우팅(`field-web/src/proxy.ts`, `site-route.ts`)은 live에서만 `FIELD_SITE_BASE_DOMAIN`을 읽습니다. | "design preview"용 throw를 제거하고, live에서는 `/preview`만 막도록 분리해야 합니다. 이것이 없으면 운영 서브도메인 사이트를 띄울 수 없습니다. |
| 2 | 가입 인증 메일 발송이 없어 운영 가입자가 로그인할 수 없음 | 미구현 | `agent-api/src/auth.ts:28`, `field-api/src/auth.ts:38`은 non-mock에서 `requireEmailVerification:true`입니다. 그런데 `sendVerificationEmail`·`sendResetPassword`가 0건이고 메일 어댑터도 없습니다. | Better Auth `emailVerification.sendVerificationEmail`과 비밀번호 재설정을 연결하고, 메일 공급사 어댑터를 제품별로 만들어야 합니다. |
| 3 | 체험이 mock 전용이라 운영에서는 결제 전 모든 신규 업무가 403 | 미구현(정책 대기) | `agent-api/src/subscription.ts:56,72`, `field-api/src/subscription.ts:56,72`는 non-mock에서 503 `trial_policy_not_approved`입니다. 각 `subscription-access.ts:21-27`은 non-mock+미결제를 `cleanup_only`로 처리합니다. 그래서 지식 승인, 사이트 생성·공개, 고객 문의 접수가 막힙니다. | 운영용 체험 정책(동의 버전, 기간)을 승인받아 live 경로를 열어야 합니다. 아니면 첫 화면에서 결제 선행을 고지해야 합니다. |
| 4 | 관리자 MFA가 없어 운영 관리자 기능 전체가 503. 판매 플랜을 만들 수 없어 결제도 불가 | 미구현 | `admin.ts:27`(양 제품), `retention-routes.ts:28`(플랜 생성 `POST /v1/admin/billing/plans` 포함), `customer-support.ts:30`, `deployment-moderation.ts:41`, `site-moderation.ts:22`, `billing-routes.ts:5` 주석 "until real admin MFA". twoFactor/totp 0건(QA157). | TOTP 또는 WebAuthn MFA를 구현하고, mock 게이트를 MFA 검사로 바꿔야 합니다. |
| 5 | 배포 산출물 없음 | 미구현 | Dockerfile 0개, `.github/workflows` 없음, IaC 없음. `infra/*/compose.mock.yaml`만 있습니다. | 아래 산출물 2의 인프라 항목을 참고하세요. |
| 6 | Field 템플릿 시작 결과가 빈 사이트 | 부분 | `field-api/src/sites.ts:404-406`은 `pages:[{home, sections:[{hero, heading:상호, body:''}]}]`만 만듭니다. `layoutToSite`(`site-generation.ts:31`, :48-54는 hero/소개/서비스/지역/운영시간)는 LLM 결과 적용(:314)에서만 호출됩니다. | `POST /v1/sites`에서 승인 카탈로그와 결정형 `layoutToSite`로 기본 섹션을 채워야 합니다. 서비스 목록·FAQ 섹션 포함입니다. |
| 7 | iPhone HEIC 업로드가 사실상 거부(415)되는데 UI는 지원한다고 표시 | 부분(문서·UI 과장) | `site-media.ts:19-21`은 sharp `heif`를 허용합니다. 그러나 설치된 sharp의 heif 입력은 `fileSuffix:[".avif"]`뿐이고 HEVC 디코더가 없습니다(직접 확인). `site-editor.tsx:348`은 `accept="image/heic"`이고 "지원" 문구가 있습니다. HEIC 테스트가 없습니다(QA20). | libheif+HEVC 빌드, 클라이언트 측 변환, 또는 명시적 미지원 안내 중 하나가 필요합니다. 실제 HEIC fixture 테스트도 필요합니다. |
| 8 | 계정·조직 삭제 | 미구현 | AP-O09·F-O16은 "삭제"를 요구합니다. `deleteUser`가 설정되어 있지 않고 `/v1/account` 같은 경로가 없습니다. 보존 purge는 관리자용뿐입니다. | owner 탈퇴, 조직 삭제 요청 API와 UI가 필요합니다. 기존 보존·예약 유지 규칙과 연결해야 합니다. |
| 9 | 공개 고객 폼에 개인정보 수집·이용 고지가 없음 | 미구현 | `field-public.tsx`, `field-booking.tsx`, AP `agent-public.tsx`에서 "개인정보" 문자열이 0건입니다. | 수집 항목·목적·보존기간 고지와 동의 문구가 필요합니다. |
| 10 | `trustedOrigins`가 non-mock에서 `[]`, Fastify `trustProxy`·logger 없음 | 부분 | `field-api/src/auth.ts:37`, `agent-api/src/auth.ts:26`, `app.ts:49-50`(양 제품). | 웹 origin이 별도라면 CSRF 거부 가능성이 있으니 운영 origin을 설정해야 합니다. 프록시 뒤 IP와 rate limit을 위해 `trustProxy`가 필요합니다. |

## 1-B. AP 제품 (docs/01) 대조

| PRD 위치 | 요구 | 분류 | 근거 / 부족한 점 |
|---|---|---|---|
| 2.2-1, AP-P01 | 홈: 만들기·설치·**요금**·매체·로그인 | 부분 | `agent-home.tsx:7-10`. 공개 요금 안내가 없습니다. 로그인이 필요한 `/workspace/subscription` 링크만 있습니다. |
| 2.2-2, AP-O01 | 이메일 **또는 카카오** 가입, 조직·체험 생성 | 부분 / BI | 이메일+비밀번호만 됩니다. 카카오 버튼은 `disabled`(`workspace.tsx:567`)이고 `socialProviders`가 없습니다. 체험은 1-A #3과 같습니다. |
| 2.2-3, 2.3 | 지식 초안 자동 저장, revision, 승인본, source 메타, 'Field에서 관리' | 구현+테스트 | `business.ts:189-192`, `field-sources.ts:128-274` / `business-core.db`, `field-connection.db`. |
| 2.2-4~6, AP-O03 | AgentDraft, 격리 테스트, 활성화 | 구현+테스트(실 LLM은 BI) | `agents.ts:91-180`. 활성화 조건에 "테스트 통과"가 없습니다(`deployments.ts:152`). 그래서 LLM 키 없이도 배포가 활성화되고, 고객은 차단 문구만 봅니다. |
| 2.4 | 구조화 답변, `tools:[]`, 버전 고정 | 구현+테스트(fetch stub) | `openai.ts:29-98`은 실제 `api.openai.com/v1/responses`를 호출할 수 있습니다. 실제 모델 E2E(QA117)는 BI입니다. |
| 2.5 | 링크·QR·floating/inline SDK, 소유 확인 | 구현+테스트 | `deployments.ts:45,52,210,223`. 운영 host/TLS는 BI입니다. 소유 확인이 well-known 파일 또는 DNS TXT라서 비개발자에게 어렵습니다. |
| 2.5 제휴, AP-O07, AP-M01~05 | 카드·매체·배치·집계 | 구현+테스트 | campaigns/publishers/placements/distribution-metrics. 다만 QA89(허위 가격 대조), QA114(제휴 종료 일괄 회수)는 부분입니다. |
| 2.6 L91-100 | handoff, 비회원 접수, 확인키, Idempotency-Key·recover·5분 result_unknown | 구현+테스트 | `customer-consultations.ts:125-380`. |
| 2.6 L97 | 5,000자 초안 초과 처리 | 구현만 | `agent-public.tsx:79-83,623`. 테스트가 없습니다. |
| 2.7 L106 | `ai_assisting→needs_owner→human_active→waiting_customer→closed` | **부분** | enum에는 있습니다. 그러나 `human_active`를 설정하는 코드가 src에 0건입니다(직접 확인). 답변 시 바로 `waiting_customer`로 바뀝니다(`inquiries.ts:613`). 사람 응대 진입의 원자 전이가 없습니다. |
| 2.7 L108 | 원문·내부 메모 분리, 스팸 발송 중단 | 구현+테스트 | `inquiries.ts`, `inquiry-spam.db`. |
| 2.8 알림 | 사업자 카카오·푸시, 고객 카카오→SMS | 구현만 / BI | Solapi 실제 어댑터(`notification-provider.ts:14-60`), web-push(`notification-web-push.ts`)가 있습니다. 실제 발송 검수는 없습니다. |
| 2.8 구독 | 체험·유료·해지·export | 부분 / BI | Toss 실제 어댑터(`toss-billing.ts`)와 worker 3종이 있습니다. 1-A #3, #4 때문에 운영 경로가 막혀 있습니다. **Toss 웹훅 수신 0건**(주문 GET 조회로 복구), 세금계산서·현금영수증 0건입니다. |
| AP-O09 | 구독·계정·데이터: export·**삭제** | 부분 | export만 있습니다(`agent-subscription.tsx:65,103`). 1-A #8을 참고하세요. |
| AP-A01~06 | 관리자 6개 화면 | 부분 | 화면은 있지만 non-mock에서 503입니다. 조직 화면은 개수 조회만 하고 권한 관리는 없습니다. |
| 2.10 API | 경로 이름 | (누락 아님) | PRD 표와 실제 이름이 다릅니다. 예: `/v1/agents/{id}/activate`→`/v1/agents/releases`, `handoffs`→`/v1/embed/handoffs`, `action-requests`→`/v1/inquiries/:id/field-actions`, cancel→`/v1/subscription/billing/cancel`. PRD 2.10 표를 실제 경로로 갱신해야 합니다. |

## 1-C. Field 제품 (docs/02) 대조

| PRD 위치 | 요구 | 분류 | 근거 / 부족한 점 |
|---|---|---|---|
| 3.2 흐름 | 홈→가입→빈 시작→5단계→오늘 | 부분 | "1 사업 정보" 단계가 편집기 밖입니다(`site-editor.tsx:539` → `/workspace?section=services`). 카탈로그 승인을 따로 해야 하고 화면 이동이 약 8~10회입니다. |
| 3.2 사업 정보 | 상호·업종·서비스·지역·소개·운영시간·연락처·**사진** | 부분 | 카탈로그에 사진 필드가 없습니다(`business.ts:40-106`). 운영시간은 자유 텍스트이고, 시간표 예약 정책에서 다시 입력해야 합니다. |
| 3.2 디자인 | 템플릿 또는 AI, 실제 상호·서비스로 생성 | 부분 / BI | 1-A #6. AI는 배치만 고르고 문구는 생성하지 않습니다. 키가 없으면 `worker.ts:11-13`이 부팅을 거부하고 API는 503입니다. 버튼은 사전 비활성화 없이 눌린 뒤 실패합니다. |
| 3.2 3개 배치 "동일 레이아웃 아님"(QA55) | | **부분(UI 문구 과장)** | 마크업은 하나이고 CSS만 다릅니다(`field-site.tsx:59`, `site.css:32-77`). 그런데 `site-editor.tsx:540`은 "세 배치는 페이지 구성이 서로 다릅니다"라고 표시합니다. 렌더 차이 테스트가 없습니다. |
| 3.2 최대 5페이지 시작안 | 서비스·소개·사례·FAQ 시작안 | 부분 | 페이지 수 제한은 구현+테스트입니다. 시작안이 없고 빈 "페이지 N"만 추가됩니다. 갤러리 섹션도 없습니다. |
| 3.2 편집 | 글·사진·alt·색·폰트·페이지·섹션 순서·AI 수정 | 구현+테스트 | 섹션 단위 AI 수정은 없고 전체 재배치만 됩니다. `editor-preview.test.tsx`는 시안 컴포넌트를 테스트하며, 실제 `SiteEditor`를 테스트하지 않습니다. |
| 3.2 연락·예약 | 문의·전화·두 예약 방식·**사업자 카카오/푸시 설정** | 부분 | 이 단계는 읽기 전용 설명뿐입니다. 알림 설정(`field-notification-settings.tsx`)으로 가는 링크도 없습니다. 시간표형 안내문(`site-editor.tsx:101` "사이트 공개는 계속할 수 있습니다")은 실제 공개 차단(`bookingPublishBlocked` L170)과 **모순**됩니다. |
| 3.2 확인·공개 | 기본 주소, **모바일 확인**, 필수 정보 | 부분 | 모바일 미리보기 프레임이 없습니다. 공개 주소는 `<code>`로만 보이고 복사·공유·QR이 없습니다. |
| 3.3 | 자동 저장·충돌·AI 작업 7상태·복구 | 구현+테스트 | `site-editor.tsx:355-409`, `site-generation.ts:95-352`, `sites.ts:551`. |
| 3.4 slug | 기본 주소 | 부분 | `https://field-<12hex>.<base>/site/<slug>`입니다. slug는 난수 고정이라 바꿀 수 없고, 테넌트 루트 `/`는 404입니다. 고객 문의 URL은 `/public/<orgUUID>`입니다. |
| 3.4 자체 도메인 | 등록·TXT·DNS·TLS·대표 URL | 내부 구현+테스트 / **BI** | DNS 확인은 실제 `node:dns`입니다. `DomainEdgeProvider` 구현체가 없고 env에서 edge를 주입하지 않습니다(`custom-domains.ts:4-25`, `custom-domain-execution.ts:52-54`). 그래서 항상 blocked입니다. |
| 3.4 사진 저장 | 공개·비공개 분리, EXIF 제거 | 구현+테스트(S3는 BI) | `site-media.ts:79-93`: mock은 로컬 디스크, 그 외는 S3입니다. 미설정이면 503입니다. CDN이 없습니다. |
| 3.5 AP 연결 화면 | 기존 계정 연결 / **AI 서비스에 가입** / **AI 테스트** / **AP 관리실 열기** / 마지막 동기화 / 요금 분리 안내 | 부분 | `field-ap-connections.tsx:192`에는 가입·AI 테스트·관리실 열기·요금 분리 안내가 없습니다. 원클릭 설치가 없어 수동 3단계 이상입니다. |
| 3.6 | 직접 문의와 외부 AI 출처 구분, 장애를 0건으로 표시하지 않음 | 구현+테스트 | `field-workspace.tsx`, `ap-conversations.ts`. |
| 3.7 | 두 예약 방식·버퍼·휴무·상태 머신·GiST 겹침 배제 | 구현+테스트 | `bookings.ts`, `000006_bookings.sql`. 단 동시 확정 테스트(QA29)는 `spike.*` 스키마 대상입니다(`reservations.db.test.ts`). 실제 `/confirm`을 동시에 2회 호출하는 테스트가 필요합니다. expire/no_show는 구현만 있고 단언이 없습니다(QA33). 자동 만료 worker가 없습니다. |
| 3.8 | 알림·구독·fallback_origin | 알림·구독 BI / fallback 구현+테스트 | 1-A #3. |
| 3.9 | F-O01~16, F-C01~08, F-A01~06, 모바일 하단 메뉴 | 부분 | F-O07 개설 완료는 공개 단계 안의 블록입니다. customer/gallery 화면이 없습니다. 하단 메뉴(`field-workspace.tsx:1111`)는 구현만 있습니다. `mobile-navigation.test.tsx`는 시안(`PreviewWorkspace`)만 검사합니다. `screens.ts` F-O02 필드 목록에서 운영시간·사진이 빠져 있습니다. |
| 3.10 | facts·capabilities·availability·external-requests | 구현+테스트 | `integrator-routes.ts:177-220`, `bookings.ts:446,624`. |

## 1-D. 연동 계약 (docs/03) 대조

| 항목 | 분류 | 근거 / 필요한 작업 |
|---|---|---|
| §4.12 AP 제공 18개 엔드포인트 | 구현+테스트 | `integrator-routes.ts`, `integrator-public-write.ts`, `source-refreshes.ts`, `field-event-inbox.ts` 등. |
| §4.12 Field 제공 8개(capabilities, facts, availability, external-requests, by-source, customer-handoffs, exchange, revoke) | 구현+테스트 | `field-api/test/integrator.db.test.ts`. |
| **§4.12 Field 제공 4개** | **미구현**(계약·코드·테스트 모두 없음, 문서에 "후속" 표시 없음) | 아래 4개입니다(직접 확인). `field-api/src/integrator-routes.ts`와 `contracts/field-integrator-v1.openapi.json`에 추가하거나, 문서에 후속으로 명시해야 합니다.<br>• `GET /integrations/v1/external-requests/{id}`<br>• `POST …/{id}/customer-decisions`<br>• `GET …/{id}/notification-route`<br>• `POST /integrations/v1/webhooks/agent` |
| §4.6 분산 상태 7종 | **부분** | `agent-api/migrations/000036_field_action_requests.sql:15`의 CHECK는 `sending, accepted_external, delivery_unknown, rejected` 4종뿐입니다. 아래 상태와 "전달 전 취소 / 외부 철회" 경로가 없습니다. 새 migration과 `field-actions.ts`가 필요합니다.<br>• `draft/awaiting_customer`<br>• `queued`<br>• `retryable_failure`<br>• `canceled_before_delivery` |
| §4.8 단일 알림 주체 | 구현+테스트(로컬) | `notification_owner_product`, `route_generation`. 실제 공급사 unknown 조회는 BI입니다. |
| §4.9 이벤트·멱등 | 부분 | HMAC, ±300초, event_id 409, pending_gap은 구현되어 있습니다. **키 교체가 없고**(연결당 단일 `event_key_id`, `field-event-inbox.ts:113`, QA140) 명시적 body 크기 제한도 없습니다. |
| §4.11 해제·삭제 | 부분 | 서명 revoke와 retry는 구현되어 있습니다. 제품 간 정정·삭제 요청 추적 전달, OAuth `manage` 범용 해제는 없습니다. |
| B05 (커넥터에 외부 통합자와 같은 속도·비용 제한) | 미구현 | 통합자 API에 429 속도 제한이 없습니다. |
| 계약 버전 표기 | 문서 불일치 | §4.12 본문은 AP preview.9라고 적혀 있지만 실제 파일은 preview.10입니다. |

## 1-E. QA160 분류 (기능별 grep, 약 30개 단언 직접 확인)

- **구현+테스트(로컬) 109개:** QA05, 09–12, 14, 16–19, 21, 25–28, 30–32, 34–35, 38, 40–42, 46, 48, 51–53, 56, 58–77, 79–88, 90–97, 100, 102–109, 111–113, 123, 127–133, 135–139, 141–156.
- **부분 18개.** 파일 위치는 위 표에 있습니다.
  - QA01: 가입 악용 한도
  - QA08: 미확인 사실 경고
  - QA20: HEIC·악성코드
  - QA29: spike 스키마 동시성
  - QA33: expire 단언
  - QA55: 배치 렌더 차이
  - QA57/119: 768·1440px, 14px 측정
  - QA89
  - QA101/159: 로그 redaction 테스트 없음
  - QA114
  - QA116: auth 운영 가드 테스트 없음
  - QA124: S3·키 교차 거부
  - QA125: 카카오
  - QA140: 키 교체
  - QA158: 구 consumer·unknown enum
  - QA160: D E2E가 Field에 의존(`run-e2e.mjs:28-31`)
- **구현만 5개:**
  - QA98: postMessage 위조 테스트 없음
  - QA99: 쿠키 차단
  - QA110: 공개키 악용
  - QA126: 연결이 과금을 시작하지 않음
  - QA134
- **미구현 3개:**
  - QA04: 계정 연결
  - QA06: 번호 변경·세션 폐기·보안 알림
  - QA120: 릴리스 인계 증빙
- **BI 21개:** QA02, 03, 07, 13, 15, 22–24, 36–37, 39, 43–45, 50, 54, 78, 117, 118, 121, 122.
- **운영게이트 4개:** QA47(RPO/RTO), 49, 115, 157(운영 MFA).

## 1-F. TASKS.md 미완료 `[ ]` 7개 대 실제

| ID | 문서상 잔여 | 실제 판단 |
|---|---|---|
| A07.F09.PAID | 실 SDK/PG·최종 인수 | **내부 공백도 있습니다.** 체험 mock 전용, 플랜 생성 mock 전용(MFA), 웹훅 없음, 세금계산서 없음. "키만 넣으면 됨"이 아닙니다. |
| A06.F08.DELIVERY | 실발송·실기기 | 어댑터(Solapi/web-push)는 실제 코드입니다. Solapi 계약, 템플릿 심사, VAPID가 필요합니다. 이메일 채널은 어댑터 자체가 없습니다. |
| F04.CUSTOM-DOMAIN | 실 edge/TLS | **edge 어댑터 구현체 0개**입니다. 키만으로 해결되지 않습니다. |
| A09.PUBLIC-WRITE | 실 DNS·브라우저 OAuth | 맞는 설명입니다. 추가로 위 Field 4개 엔드포인트가 미구현입니다. |
| I06.AUTH-LIFECYCLE | 운영 RPO/RTO | 맞는 설명입니다(운영게이트). |
| AUTH.LIVE / PROVIDERS.LIVE | 실메일·카카오·MFA·공급사 | 메일·카카오·MFA는 **코드 구현이 필요합니다**. 설정만으로 되지 않습니다. |
| R00.QA / R02.ACCEPTANCE | 전체 QA·최종 인수 | QA160 모두 `not_run`이고 QA ID 추적성이 없습니다. |

## 1-G. 완료를 주장하지만 코드가 따라가지 못하는 문서

1. `DEVELOPMENT_STATUS.md:3-7`의 "현재 확정 내부 누락은 없으며"는 checkpoint 2362761 기준입니다.
   - 이후 2026-09-29 재감사에서 7건이 발견됐습니다.
   - 이번 대조에서도 아래 내부 누락이 확인됩니다.
     - Field API 4개
     - §4.6 상태 5종
     - human_active
     - 계정 삭제
     - 키 교체
     - HEIC
     - 템플릿 빈 사이트
     - live 빌드 차단
   - 문서 최신화도 HEAD 84af59a에 미반영입니다.
2. `TASKS.md`의 I04.REQUEST가 [x]이지만 §4.6 상태 머신은 4종만 있고 customer-decisions가 없습니다.
3. `docs/03` §4.12 Field 표에 미구현 4개 경로가 "후속" 표시 없이 계약처럼 적혀 있습니다.
4. `FIELD_FIRST_USE_AUDIT_FOLLOWUP_2026-09-29.md`의 `[ ] R00.QA/F09 환불 DB 실패`는 이미 `932ee10`에서 해결됐습니다(오래된 체크). 같은 종류로 `A07_F09_REFUND_EXECUTION_PLAN.md:44`, `A06_F08_DELIVERY_EXECUTION_PLAN.md:53`, `I03_SOURCE_SYNC_STATUS_EXECUTION_PLAN.md:29`에도 이미 통합된 항목이 `[ ]`로 남아 있습니다.
5. UI 문구 과장:
   - HEIC 지원(`site-editor.tsx:348`)
   - "세 배치는 페이지 구성이 서로 다릅니다"(`:540`)
   - 시간표형 "공개는 계속할 수 있습니다"(`:101`)
6. 테스트가 실제 기능이 아니라 시안이나 spike를 검사하는 경우: `editor-preview.test.tsx`, `mobile-navigation.test.tsx`(시안 컴포넌트), `reservations.db.test.ts`(spike 스키마, QA29 근거로 부적합).
7. PRD 2.10 API 표의 경로명이 실제와 다릅니다(1-B 참고).

---

# 산출물 2 — 실제로 서비스하기 위해 필요한 기능

## (a) 자영업자: 10분 안에 홈페이지를 만들고 예약 받기

**필수(출시 전)**

1. **운영 체험 정책을 열어야 합니다.** 아니면 결제 선행을 명시해야 합니다.
   - 위치: `field-api/src/subscription.ts:56`, `subscription-access.ts:21-27`.
   - 지금은 결제 전 승인·사이트·공개·고객 문의가 모두 403입니다.
2. **템플릿 시작 시 카탈로그로 기본 섹션을 자동 구성해야 합니다.**
   - 소개, 서비스 목록, FAQ, 지역·운영시간, 연락 섹션입니다.
   - 위치: `sites.ts:404` → `site-generation.ts:31 layoutToSite` 재사용.
3. **사업 정보 입력을 사이트 제작 1단계 안으로 넣거나, 승인과 사이트 시작을 한 흐름으로 묶어야 합니다.**
   - 위치: `site-editor.tsx:539`, `field-workspace.tsx:1068-1082`.
   - 지금은 화면 이동이 8~10회입니다.
4. **사실과 다른 UI 문구 3곳을 수정해야 합니다.** HEIC, "배치 구성 다름", 시간표형 공개 안내입니다(`site-editor.tsx:101,348,540`).
5. **HEIC를 실제로 변환하거나 명확한 미지원 안내를 해야 합니다.**
   - 위치: `site-media.ts`.
   - 대부분의 아이폰 사진이 HEIC입니다.
6. **공개 주소의 복사·공유·QR을 추가해야 합니다.**
   - 위치: `site-editor.tsx` publish 블록. AP `AgentConsultQr.tsx`를 재사용할 수 있습니다.
   - 고객에게 주소를 알릴 수단이 없습니다.
7. **연락·예약 단계에서 사업자 알림(카카오·푸시) 설정으로 이동하는 링크와 현재 상태가 필요합니다.**
   - 위치: `site-editor.tsx` contact, `field-notification-settings.tsx`.
   - 예약 요청을 실시간으로 알 수 없으면 실사용이 어렵습니다.
8. **공개 고객 폼에 개인정보 수집·이용 고지가 필요합니다.** 위치: `field-public.tsx`, `field-booking.tsx`.
9. **live에서 404가 되는 "화면 둘러보기" 링크를 제거하거나 대체해야 합니다.** 위치: `field-home.tsx`, `agent-home.tsx`의 `/preview` 링크.
10. **공급사 미설정 시 "AI 제안 생성" 버튼을 미리 비활성화하고 이유를 보여 줘야 합니다.**
    - AGENTS.md는 조작 가능한 버튼에 실제 API 또는 비활성 사유를 요구합니다.
    - 위치: `site-editor.tsx` generateSite.
11. **사용자에게 보이는 "(추가)" 표식 정책을 결정해야 합니다.**
    - 현재 `field-workspace.tsx` 23곳, `site-editor.tsx` 12곳, `field-public.tsx` 2곳에 있습니다.
    - 사용자 지침(AGENTS.md 6.0)으로 붙인 표식입니다. 운영 고객 화면에 그대로 노출할지는 **사용자 결정 사항**입니다.

**있으면 좋음**

- slug를 사람이 읽을 수 있게 편집하고, 고객 문의 URL을 slug 기반으로 바꾸기(`sites.ts:403`, `field-site.tsx intakePath`). 테넌트 루트 `/`가 사이트로 연결되게 하기(`proxy.ts`).
- 업종별 서비스·FAQ·소개 예시와 placeholder. 지금은 업종 datalist 7개뿐입니다(`field-workspace.tsx:1073`).
- 운영시간 텍스트와 예약 정책 입력을 하나로 통합(`field-booking.tsx:836`).
- 공개 단계에 390px 모바일 미리보기 프레임, 별도 "개설 완료" 화면(F-O07), 갤러리 섹션.
- 홈 템플릿 카드 선택을 편집기에 반영(`field-home.tsx`).
- 내부 용어 정리: "조직", "저장본 N번", "revision", "카탈로그".
- 페이지 시작안(서비스·소개·FAQ 페이지 템플릿), 섹션 단위 AI 수정.
- 예약 자동 만료 worker.

## (b) 자영업자: 홈페이지에서 AI가 고객 질문에 답하게 하기

**필수(출시 전)**

1. **AP 운영 경로를 열어야 합니다.** 체험 mock 전용(`agent-api/src/subscription.ts:56`, `subscription-access.ts`)과 이메일 인증 발송 문제를 해결해야 합니다(1-A #2, #3).
2. **실제 LLM을 연결해야 합니다.**
   - `AP_OPENAI_API_KEY`/`AP_OPENAI_MODEL`, `AP_CUSTOMER_DAILY_LIMIT`가 필요합니다. 고객 한도는 non-mock 기본값이 NaN이라 사실상 필수입니다(`customer-consultations.ts:203-205`).
   - 어댑터는 실제 호출이 가능한 코드입니다(`openai.ts:41-98`).
3. **활성화 조건에 "공급사·예산 준비 + 테스트 통과"를 넣어야 합니다.**
   - 위치: `deployments.ts:152`.
   - 지금은 키 없이 활성화되어 고객이 차단 문구만 봅니다.
   - 원시 코드 `blocked_integration`이 사업자 화면에 노출됩니다(`agent-ai.tsx:171,186`).
4. **Field 사이트에 AP 위젯을 쉽게 설치하는 경로가 필요합니다.**
   - 위치: `field-ap-connections.tsx`.
   - 지금은 AP 배포 생성 → 증명값 복사 → AP 소유 확인 → 재승인 → 설치로 수동 3단계 이상입니다.
   - PRD 3.5의 "AI 서비스에 가입", "AI 테스트", "AP 관리실 열기"도 없습니다.
5. **사람 응대 상태 전이를 구현해야 합니다.** `human_active` 전이를 `inquiries.ts`에 추가합니다(PRD 2.7).
6. **AI 고지와 국외 이전(OpenAI) 고지가 필요합니다.** 위치: 상담 랜딩·위젯(`agent-public.tsx`)과 처리방침.

**있으면 좋음**

- LLM 장애나 미설정 시 승인 FAQ 기반 결정형 답변, 또는 바로 사람 문의로 전환(`agent-public.tsx:497`).
- 외부 사이트 소유 확인에 meta 태그 같은 쉬운 대안 추가(`deployments.ts:45,52`).
- 공개 요금 안내 페이지(AP-P01).
- 금액 기준 월 LLM 예산 알림. 지금은 토큰 원장만 있습니다(`ai-entitlement.ts`).
- 5,000자 초안 초과 처리 테스트.

## (c) 운영자: 서비스 운영

### 실제 공급사 연결 (어댑터 존재 여부 구분)

| 공급사 | 코드 상태 | 필수 작업 |
|---|---|---|
| LLM (OpenAI) | 실제 호출 어댑터 있음(AP `openai.ts`, Field `field-openai.ts`) | 제품별 키 2개, 모델, 한도. OpenAI 계약과 국외 처리 고지 |
| PG (Toss 빌링) | 실제 어댑터와 worker 3종 있음. **웹훅 없음, 세금계산서 없음** | 제품별 MID, live 키, 승인된 가격·약관·환불 정책. 실제 결제 E2E. (있으면 좋음) 웹훅 수신, 세금계산서·현금영수증 연동 |
| 카카오 알림톡·SMS (Solapi) | 실제 어댑터 있음(`notification-provider.ts`) | Solapi 계약, 발신번호 등록, 카카오 채널(PF), 템플릿 2종 심사, `*_NOTIFICATION_PROVIDER_APPROVED` |
| 웹 푸시 | web-push와 서비스워커 있음 | VAPID 키, 실제 기기 검수 |
| **이메일** | **어댑터 없음** | SES, Resend 등 연결과 어댑터 구현(인증·재설정·운영 알림) |
| DNS/TLS/edge | 기본 서브도메인은 Host 라우팅 있음. **커스텀 도메인 edge 구현체 없음** | 와일드카드 DNS와 `*.base` 인증서(필수). 커스텀 도메인은 Cloudflare for SaaS나 Caddy on-demand TLS 어댑터 구현(커스텀 도메인 출시 시 필수) |
| 객체 저장(S3) | non-mock S3 어댑터 있음 | 제품별 버킷(공개·비공개 분리), IAM, 암호화. (있으면 좋음) CDN |

### 인증

**필수**
- 인증 메일, 비밀번호 재설정(1-A #2).
- 관리자 MFA(1-A #4).
- `trustedOrigins`, `trustProxy`.
- **카카오 로그인**: docs/00 결정 19와 5.3이 이메일과 카카오를 함께 요구합니다. `socialProviders`를 구현하고 카카오 앱을 등록해야 합니다.

**있으면 좋음**
- Valkey 기반 공유 rate limit. 지금은 Better Auth 기본 메모리 저장입니다.
- 번호 변경·세션 폐기·보안 알림(QA06).
- 계정 연결(QA04).

### 배포와 인프라 (docs/04 5.1, ADR 0001/0002)

**필수**
- 제품별 컨테이너 이미지와 배포 정의(Dockerfile 0개). TLS 리버스 프록시.
- 관리형 PG17 2개(권한 분리), Field Valkey(AP 전용 Valkey도 ADR상 미검증).
- 시크릿 관리. 저널 디렉터리(`*_RETENTION/REVOCATION/OAUTH_LIFECYCLE_JOURNAL_*`)는 영속 볼륨이어야 합니다.
- CI: lint, typecheck, unit, DB, 독립성, 보안. AGENTS.md 4절은 "production에 mock이 섞이면 CI 실패"를 요구합니다.
- **profile 가드 통일**: production에서 `*_PROFILE ∈ {live}`를 강제하는 단일 가드가 필요합니다. 지금은 비어 있거나 sandbox인 production 부팅을 API가 막지 않습니다. 가드는 `server.ts`(AP)·`auth.ts`(Field)·`worker.ts`, `billing-context.ts`, `notification-context.ts`에 흩어져 있습니다.
- 운영 프로세스 다수를 각각 감시해야 합니다.
  - AP 8개: server, field-event, retention-purge, billing 3종, notification-delivery, web.
  - Field 11개: server, site worker, retention-purge, ap-event, billing 3종, notification-delivery, custom-domain, ap-route-key, web.

### 모니터링과 관측 (docs/04 5.6)

**필수**
- 구조화 로거(Fastify logger 없음).
- PII redaction 로그 serializer와 테스트(QA101/159).
- 에러 리포팅(Sentry 등).
- `/health/ready` 외에 worker 생존과 큐 적체 지표.
- 운영 DB 백업과 PITR. 현재 `LOCAL_BACKUP_RUNBOOK.md`는 mock 전용이라고 스스로 명시합니다.

**있으면 좋음**
- OTel 트레이싱, correlation_id.
- 제품 간 장애 전파 synthetic probe(5.6).
- 비용 대시보드: LLM, 알림, PG 수수료.

### 법무와 보존 (docs/04 5.5, G-L1)

**필수**
- 제품별 이용약관과 개인정보처리방침 페이지(`/terms`, `/privacy`가 0건).
- 푸터 사업자 정보: 상호, 대표자, 사업자등록번호, 통신판매업 신고번호(0건).
- 수탁사·국외 이전 고지: OpenAI, Solapi, Toss, S3 리전.
- 고객 폼 수집 고지.
- 보존기간 확정. 현재 문의 180일, 사진 90일, 정리 30일, 예약 마지막 예정일+7일 등은 모두 "제안값"입니다.
- 유료 플랜의 가격·세금·환불 조건 승인.

**있으면 좋음**
- AI 답변 면책 문구 표준화, 광고 표시 정책 문서화(매체).

### 관리자 운영

**필수**
- 관리자 MFA와 운영자 부여 절차. 현재 `platform_admin_memberships`의 operator/auditor 구조는 있습니다.
- 운영 플랜 생성·판매 개시 경로. 지금은 MFA 부재로 차단되어 있습니다.
- 신고·고객지원·보존 승인 화면의 non-mock 개방.

**있으면 좋음**
- 조직 화면의 권한 관리(지금은 개수 조회뿐), 고객 문의 대응용 감사 검색.

### 출시 게이트 (docs/04 5.7)

- G-A1~3, G-F1~3, G-I1~3, G-D1~2, G-L1, G-S1, **13개 모두 미통과**입니다.
- 독립 출시 순서는 **F(Field Core) 또는 A(AI Core) 단독 게이트 → G-L1 → I → D** 순이 현실적입니다.
- D의 E2E가 Field에 의존하는 문제(`run-e2e.mjs:28-31`)는 1.6의 "D는 Field를 기다리지 않음"과 충돌하므로 분리해야 합니다.

---

## 권장 착수 순서 (실사용 기준)

1. live 빌드 허용과 profile 가드 통일 → 2. 이메일 어댑터(인증·재설정) → 3. 운영 체험 정책 → 4. 관리자 MFA(플랜 판매 개시) → 5. Field 템플릿 자동 구성과 UI 문구 3곳·HEIC → 6. Dockerfile·CI·로깅·백업 → 7. 약관·처리방침·사업자 정보·수집 고지 → 8. 공급사 키와 계약(OpenAI, Toss, Solapi, VAPID, S3, 와일드카드 TLS) → 9. 카카오 로그인 → 10. human_active·계정 삭제·Field 공개 API 4개·§4.6 상태 → 11. 커스텀 도메인 edge, 웹훅, 세금계산서, CDN.
