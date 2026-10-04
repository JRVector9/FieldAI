# 남은 작업 전체 목록 — 2026-10-04 (HEAD `cbebc38` 기준)

이 문서는 2026-10-02~03의 검토·수정 7개 커밋(`8e7abd7`→`cbebc38`) 이후 **아직 끝나지 않은 모든 작업**을 한곳에 모은 것이다. 출처는 `01_SUMMARY.md` §3·§9~§14, 리뷰 원문 `03`~`17`, 각 수정 에이전트의 "손대지 않은 것" 보고다. 새 작업은 이 문서의 ID로 시작하고, 완료 시 `TASKS.md` 상단과 이 문서의 상태를 같은 커밋에서 갱신한다(AGENTS §6.1).

상태 범례: **코드** = 결정 없이 바로 구현 가능 / **결정 후 코드** = 사용자·운영 결정이 먼저 필요 / **외부** = 공급사 계약·실환경·사람의 검수가 필요.

---

## A. 바로 이어서 할 코드 작업 (우선순위 순)

| ID | 작업 | 근거 | 범위·파일 | 완료 기준 |
|---|---|---|---|---|
| A-01 | **독립성 검사 재실행과 CI job 추가.** 2단계 이후 양 제품 코드가 크게 바뀌었는데 `test:independence:agent/field`는 2026-09-29 이후 실행하지 않았다. 상대 제품 컨테이너를 내린 상태에서 실행하고, 실패 시 수정. CI에 `independence` job 추가 | `16_HOLISTIC_INFRA_DOCS.md` M2, HANDOFF | `tools/run-independence.mjs`, `.github/workflows/ci.yml` | 두 명령 exit0 로그, CI job actionlint 통과 |
| A-02 | **AP 미해결 전달 요청 종결 관리자 화면.** `POST /v1/admin/field-actions/:id/close-unknown`은 있지만 대상 목록 API와 화면이 없다. `GET /v1/admin/field-actions?state=delivery_unknown&unreconcilable=true` 추가 후 `agent-admin.tsx`에 "미해결 전달 요청 종결 (추가)" 패널 | `13` P1-1, 웹 수정 보고 | `apps/agent-api/src/admin.ts`, `apps/agent-web/src/agent-admin.tsx` | 목록·종결 DB 테스트, 웹 단위 테스트 |
| A-03 | **운영자용 인증 메일 outbox 화면.** `failed`/`blocked_integration` 행을 운영자가 볼 수 있어야 메일 장애를 알 수 있다. `GET /v1/admin/email-outbox?state=` + 관리자 패널 "인증 메일 발송 상태 (추가)"(양 제품) | `15_HOLISTIC_WEB.md` M9 | `apps/*-api/src/admin.ts`, `*-admin.tsx` | 주소는 마스킹해 표시, 테스트 |
| A-04 | **live 공개 OAuth 연결 baseline 절차.** `oauth-lifecycle-cli`의 `--baseline-quiesced`가 `*_PROFILE=mock`에서만 동작해 live 공개 OAuth 연결이 `blocked_integration`이다. live에서 운영자가 정지 상태(quiesced)를 선언하고 baseline을 기록하는 안전한 절차(dry-run·이중 확인)를 만든다 | `01_SUMMARY.md` §9·§13-12 | `apps/*-api/src/oauth-lifecycle-cli.ts`, docs/04 runbook | live 프로필에서 baseline 기록 테스트(격리 DB), runbook |
| A-05 | **오프라인 CLI 10종에 production 프로필 가드 적용.** `*-cli.ts`는 mock 전용 검사만 있어 live에서 실행하면 거부되지만 공통 `assertProductionProfile`을 쓰지 않아 메시지·규칙이 다르다 | `13` P3-5 | `apps/agent-api/src/*-cli.ts`, `apps/field-api/src/*-cli.ts` | 단위 테스트, 메시지 통일 |
| A-06 | **삭제 유예 안내를 모든 사업자 화면에.** `rejectExpiredTrial`이 막는 AI 승인·홍보 카드·사업 정보 승인 등은 아직 `deletion_scheduled` 403을 원래 오류 문구로 보여준다 | 웹 수정 보고(종합) | `workspace.tsx`, `field-workspace.tsx`, `agent-campaigns.tsx` 등 `rejectExpiredTrial` 호출 경로 전부 | 공통 헬퍼 `deletion-scheduled-copy.ts` 적용, 테스트 |
| A-07 | **Field `retentionAdminFor` live localhost Origin 허용 제거.** AP는 mock 전용으로 바꿨고 Field는 그대로다 | `14` L3 | `apps/field-api/src/retention-routes.ts` | cross-origin 거부 DB 테스트 |
| A-08 | **Field 공개 catalog·`resolvedCustomHost`의 유예 중 노출.** 삭제 예약 조직의 공개 catalog GET이 열려 있고 slug·조직 ID가 노출된다 | `14` L9, `01_SUMMARY.md` §14 | `apps/field-api/src/business.ts`, `custom-domains.ts` | 유예 중 404 테스트, 기존 숨김 사이트 테스트 유지 |
| A-09 | **Caddyfile API 호스트 블록에서 ask 경로 차단.** `{$FIELD_API_HOST}` 블록이 4321 전체를 열어 `/v1/public/site-hosts/allow`가 공개된다 | `17` Low 4 | `infra/edge/Caddyfile.example` | `caddy validate`(DNS 모듈 제외) |
| A-10 | **AP 연결 callback 단계의 삭제 가드.** start에서만 막고 callback은 확인하지 않는다(이미 생긴 연결은 전제 조건이 막음). callback에서도 409로 닫고 상대 grant 회수 안내 | `13` P1-3 보고, `14` H1 보고 | `apps/agent-api/src/field-connector.ts`, `apps/field-api/src/ap-connector.ts` | DB 테스트 |
| A-11 | **기존 자유 입력의 NUL 문자 400 처리.** 새 입력만 `invalid_text`로 거절하고 기존 입력(문의 메시지 등)은 `internal_error`로만 보인다 | `17` Low 1 | 양 제품 입력 검증 공통 함수 | 400 `invalid_text` 테스트 |
| A-12 | **AP 발신함이 수신함 처리를 늦추는 순서.** `field-event-worker.ts`가 발신함을 먼저 반복한다. 발신·수신을 번갈아 처리하거나 시간 예산을 둔다 | `13` P2-8 | `apps/agent-api/src/field-event-worker.ts` | 테스트 |
| A-13 | **Toss 웹훅 IP 한도 120회/15분 재검토.** 거래가 많은 시간대에 정상 알림이 429로 버려질 수 있다. Toss 발신 IP 허용 목록 또는 한도 상향 env | `13` P3 | `apps/*-api/src/billing-webhook.ts` | env 문서화, 테스트 |
| A-14 | **미인증 선점 계정 정리의 FK 100건 한계.** FK로 참조되는 계정이 100건 넘게 쌓이면 뒤쪽 계정이 처리되지 않는다 | Field API 수정 보고 | `apps/*-api/src/retention-purge.ts` | cursor 기반 처리 테스트 |
| A-15 | **`subscriptionAccess`의 `to_regclass` 매 호출 조회 제거.** 테스트 편의용 조회가 운영 경로에 남아 있다(레거시 fixture는 migration count를 올리거나 별도 플래그) | `13`·`14` L8 | `apps/*-api/src/subscription-access.ts`, `test/ai-entitlement.db.test.ts` | 쿼리 1회 감소, 테스트 통과 |
| A-16 | **`setup-mock-env.mjs`의 Field 원장 상대 경로.** mock은 코드가 절대 경로로 바꾸지만 원인은 여기다 | Field API 수정 보고 | `tools/setup-mock-env.mjs` | 생성된 `.env`가 절대 경로 |
| A-17 | **사진 삭제 중 미리보기 404와 자동 갱신.** 섹션에 지정된 `deleting` 사진의 `<img>`가 404를 낸다. placeholder 표시, 삭제 진행 중 목록 폴링(요청 범위 결정 필요: 폴링 간격) | Field 웹 수정 보고 | `site-editor.tsx` | 단위 테스트 |
| A-18 | **삭제 저널 백업 재적용 원장.** docs/04:102가 요구하는 "복원 후 익명화 재적용"이 없다. 복원하면 익명화한 정보가 되살아난다 | `13` P2-3 | 양 제품 `account-deletion.ts`, 복원 CLI | 복원 뒤 재적용 테스트 |
| A-19 | **HEIC 실제 변환.** 현재는 415로 정직하게 거부만 한다. libheif+HEVC 빌드(특허·라이선스 검토) 또는 클라이언트 변환 | `02` 1-A #7 | `site-media.ts`, Dockerfile | HEIC fixture 변환 테스트 |
| A-20 | **M5 잔여 spike(HTTP).** 사진 삭제 2단계, 자체 도메인 health/ask 전체 흐름, customer-decisions(제안 생성 포함), AP→Field webhook, human_active, Toss webhook, `/terms`·`/privacy` 200. 이메일·MFA·카카오는 mock에서 꺼져 있어 sandbox 전용 spike로 분리 | `16` M5 | `tools/spikes/*`, `tools/run-e2e.mjs`, `run-security.mjs` | 각 spike exit0, 실행기 등록 |
| A-21 | **OpenAPI 응답 스키마 대조 확대.** `assertContract`가 AP 읽기 7경로만 대조한다. 쓰기·202 영수증·Field 경로까지 확대, 라우트 집합↔paths 자동 대조 | `16` M9 | `tools/test/*-integrator-contract.test.mjs` | 모든 §4.12 경로 대조 |
| A-22 | **QA ID 매핑·`LOCAL_FUNCTIONAL_COVERAGE.md` 갱신.** 새 테스트에 docs/06 QA ID가 없고 커버리지 문서가 09-29 기준이다 | `16` L13 | `docs/technical/LOCAL_FUNCTIONAL_COVERAGE.md`, 테스트 주석 | QA ID 표 갱신 |
| A-23 | **`FIELD_AUTH_SECRET` 이중 용도 문서화.** site-health proof HMAC 키로도 쓰인다 | `16` L4 | `infra/field/.env.live.example`, docs/04 | 주석 1줄 |
| A-24 | **관리자 MFA 세션 수명 상한·step-up.** 슬라이딩 갱신으로 사실상 무기한 | `17` Info 7 | `requireAdmin`, better-auth session 설정 | 최대 세션 나이 또는 민감 동작 재확인 |
| A-25 | **관리자 로그아웃 실패 `(status)` 문구.** 남은 원시 상태코드 문구 1곳 | 웹 수정 보고 | `*-admin.tsx` | 한국어 문구 |

## B. 결정이 먼저 필요한 항목 (결정 후 코드)

`01_SUMMARY.md` §13의 14건이다. 각 결정이 내려지면 아래 코드 작업으로 이어진다.

| § 13 # | 결정 | 결정 후 코드 작업 | 규모 |
|---|---|---|---|
| 1 | AI 응대 재개 허용 여부 | `ap_inquiries_contact_state_check` 완화 migration, AI 기록에서 연락처 차단, 알림·첨부·연동의 `mode` 필터 수정, "AI 응대 재개 (추가)" 버튼 | 중 |
| 2 | §4.6 상태 4종의 AP 적용 | AP `field_action_requests.state` migration과 전이 추가, 계약 문서 정합 | 중 |
| 3 | 웹훅 backoff 기준 | `billing-charge-execution.ts`/`refund` backoff 상향 또는 웹훅 앞당김 조건 완화 | 소 |
| 4 | 숨김 사이트 신규 접수 차단 | `moderation.db.test.ts:101` 기대값 변경, 공개 catalog·문의·예약 POST hold 검사(조직 구성원 예외) | 소 |
| 5 | `(추가)` 표식 운영 노출 | 표식 제거 또는 env로 토글 | 소 |
| 6 | 체험 정책 값 | env만 입력 | 없음 |
| 7 | 운영자 법적 정보 | env만 입력 | 없음 |
| 8 | 공급사 키·계약 | env 입력 + C절 검증 | 없음 |
| 9 | 계정 삭제 시 OAuth client 처리 | 현재 차단 사유 `oauth_clients_active`. 비활성화 방식이면 삭제 트랜잭션에서 client disable·토큰 회수 | 소 |
| 10 | 카카오 전용 관리자 2FA | `twoFactor({allowPasswordless:true})` 또는 비밀번호 추가 흐름 + 안내 | 소 |
| 11 | 템플릿 소개 중복 | `catalogStarterSite`에서 '소개' 섹션 제외 또는 hero 본문 비움 | 소 |
| 12 | live OAuth baseline 절차 | A-04 | 중 |
| 13 | nodemailer 공급망 검토 | 버전 고정 유지 또는 교체 | 없음~소 |
| 14 | 같은 연결 scope 재동의 흐름 | `connection_already_bound` 대신 scope 증가 동의 허용, Field 선택 갱신 | 중 |

## C. 검증·운영 작업 (외부)

| ID | 작업 | 현재 상태 | 필요한 것 |
|---|---|---|---|
| C-01 | GitHub Actions 실제 실행 | `ci.yml`은 actionlint 통과만. `main`이 origin보다 앞서 Actions가 한 번도 돌지 않음 | push 후 첫 실행 결과 확인(Actions 결제 상태 포함), e2e job의 same-page 브라우저 단계 첫 실행 red 가능 |
| C-02 | 실 공급사 연결 검증 | 모두 `blocked_integration` | SMTP(`smtps:`), 카카오 앱·Redirect URI, Toss sandbox(인증·청구·환불·웹훅), S3(ListBucket·HeadObject 404), OpenAI 키·`AP_CUSTOMER_DAILY_LIMIT`, 솔라피·web-push, Caddy+ACME DNS-01 와일드카드 |
| C-03 | live compose 기동 리허설 | `docker compose config`와 임시 PG 기동만 확인 | 실제 서버에서 `compose.live` up, `/health/ready`, worker 상시 실행, 로그·헬스체크 확인 |
| C-04 | 백업·PITR·복원 리허설 | runbook은 mock 전용 | 운영 PG 백업, 복원 후 lifecycle/revocation/retention 저널 재검증, A-18 |
| C-05 | 관측 | 로거·PII 가림만 구현 | Sentry 등 오류 수집, worker 큐 지표, 알림 |
| C-06 | 사용자 최종 화면·동선 인수 | 합성 계정 자동 검수만 | 실기기(iOS/Android), 키보드·스크린리더, 시안 대비 확인 |
| C-07 | 법무 검토 | `/terms`·`/privacy` 구조만 | 요금·환불·책임 조항, 보존기간 확정, 수탁사·국외 이전 고지 확정 |
| C-08 | 보안 외부 점검 | 내부 리뷰 5회 | 침투 테스트, 의존성 취약점 스캔 |
| C-09 | v2 서명 전환 실행 | 코드·runbook 준비됨 | 수신자 배포(`ACCEPT_V1=true`) → 발신 v2 → `ACCEPT_V1=false`, blocked 재큐 확인 |

## D. 문서·원장 유지 작업

| ID | 작업 |
|---|---|
| D-01 | `TASKS.md` 170~171행 R00.QA 수치(09-29 기준)를 최신 검수 수치로 갱신 |
| D-02 | 결정(B절)이 내려질 때마다 `01_SUMMARY.md` §13과 이 문서를 같은 커밋에서 갱신 |
| D-03 | 변경이 있는 커밋마다 `tools/build_report.py` → `tools/check_package.py` → `shasum -a 256`으로 SHA256SUMS 재생성(`build_planning_tables.py`는 실행 금지) |
| D-04 | `docs/06_REQUIREMENTS_QA.md`·`acceptance_catalog.json`의 QA ID ↔ 테스트 매핑(A-22와 함께) |

---

## 권장 착수 순서

1. **A-01** 독립성 재실행(회귀 확인이 가장 먼저) → **A-07·A-08·A-09·A-10** 삭제·노출 경계 마감 → **A-06·A-02·A-03** 운영자·사업자 화면 공백 → **A-04·A-05** live 절차 → **A-20·A-21** 검수 확대 → 나머지 A.
2. B절은 사용자 결정을 모아 한 번에 처리한다(1·2·14는 설계 검토 필요, 나머지는 소규모).
3. C절은 공급사 키가 들어오는 순서대로 진행하되 **C-01(CI 첫 실행)**은 즉시 가능하다.
