# 개발 종료까지 남은 범위 — 2026-09-26 1차 코드 대조

**완료 항목 기준:** `TASKS.md` 상단 체크 원장을 먼저 읽는다. 본 문서의 부모 Task “부분/미완료”는 남은 범위가 있다는 뜻이며, 이미 `[x]`인 세부 구현을 다시 하라는 지시가 아니다. 재개는 AGENTS.md6.1에 따른 구체적 증거/사유가 있을 때만 한다.


## 기준과 한계

- 1차 대조 기준 commit: **eab1d30** (AP native revocation journal/격리 restore). 후속 A05.WIDGET-END 완료 코드 **fe6a524**와 실제 범위 검수는 아래1행/coverage/인계에 갱신했다. Node24.18.0·로컬 mock PostgreSQL17·Field Valkey8.1.10.
- 사용자 우선순위: 문서 기능을 끝까지 구현해 사용할 로컬 환경을 유지한다. 실 인증/MFA·공급사 연결은 후속, 최종 화면/동선 테스트는 사용자가 한다. 화면 작업 때는 `/Users/jr/Desktop/projects/FieldAI/reference/field_ui_prototype_v3.html`을 직접 열어 비교한다.
- v3 architecture B01~B12/21결정, 양제품 PRD, 연동4.11~4.12, 보안5.3~5.7, TASKS 원본 **46개 Task**, QA01~160을 기능군에 대조했다. 아래는 코드/계약을 읽은 인벤토리이며 **46개 완료/160개 통과라는 뜻이 아니다**.
- 이번 대조에서 추가 서비스 테스트/전체 시안 비교는 실행하지 않았다. native 테스트 최신 실제 증빙은 인계 상단: AP29/29·Field30/30·AP 단독 native revoke200→401/브라우저1/1. UI/API 파일이 있다는 이유로 Done 판정하지 않는다.
- 정확한 시간/완료율은 아직 산정하지 않는다. 내부 구현 누락과 공급사 key 부재를 구분하지 않은 기존 “3작업군” 설명을 작은 Task3개로 해석하면 안 된다. 추가 역할/상태별 누락은 계속 이 목록에 기록한다.

## 1차 내부 개발 6묶음 중 위젯 완료 — 현재 남은 5묶음

| 순서 | 작업 / 관련 ID·QA | 현재 직접 확인한 근거 | 종료 기준 |
|---|---|---|---|
| 1 | [x] A05.WIDGET-END 내부 완료 / C03,A05,D03·QA17/97~102/119 | 코드 fe6a524: native iframe 종료410/안내·입력/AI/조건 폐기·현재 종료 ID를 확인한 새 상담·유실 응답 재조회·과거 ticket 만료/직렬화. 집중 own PG17 DB2/2·native Chromium320 2/2·최종 repair review 추가 P1/P2 없음·managed48590 반영. | 내부 범위는 완료다. 기존 first-party receipt를 유지하며 전체 역할 시안/사용자 최종 인수·실 외부 설치/기기·전체 QA/G는 별도로 남는다. |
| 2 | 독립 유료 구독 내부 기능 / A07,F09·QA43~46/126/146 | [x] 가격/동의/인증발급·**FIRST-CHARGE 00c3e0d**. own 명시tax·첫 거래/기간·원래 order/key/body/start·GET 대조·키 회전/창 제한/stale 폐기·실 승인시각/date/overlap/암호화 paymentKey. 최신 DB각12/12·port각3/3·type/lint/build·review26858 P1/P2 없음(confidence0.82), managed65775 각 auth/charge worker ready·양웹200. 미설정PG/legacy tax는 blocked 유지. | 갱신/해지/유예·확정 HTTP거절 분류·환불/entitlement·접근제한·SDK callback/owner/admin UI. 완료 가격/동의/발급/첫 청구를 반복하지 않는다. 유료전체/실PG는 미완료다. |
| 3 | 알림 발송 내부 기능 / A06,F08·QA35~40/148/149 | in_app 이벤트/읽음·outbox·단일 알림 주체/route generation은 있다. 고객 알림은 `blocked_integration`, 실제 kakao/SMS/webpush 발송·콜백/재조회 worker는 없다. | 제품별 provider adapter·시도/상태/usage 원장·중복/역순/unknown 조회·실패 확정 때만 SMS fallback·푸시 등록/해제/설정/UI. 공급사 미설정이면 blocked 유지. |
| 4 | Field 자체 주소 설정 / F04·PRD3.4·QA13~15 | `sites.ts` 기본 slug/base domain 공개와 tenant host 검사만. 자체 domain 등록/검증/DNS/TLS 상태를 저장·변경하는 native API/DB가 없다. | 도메인 요청/소유 확인/연결 상태와 오류·대표URL, 실패 시 기본 주소 유지, AP 새 origin은 공개 계약 검증. live DNS/TLS 공급사는 후속 연결. |
| 5 | 공개 통합자 최소 계약 / C01,A09·PRD2.10/계약4.12·QA129~133/158 | 문서의 POST `/integrations/v1/connections`, POST `/integrations/v1/deployments`와 scope `ap.deployments.manage`가 현재 OpenAPI/auth/native API에 없다. 현재 deployments는 GET, 해제는 연결별 HMAC이고 범용 manage는 문서도 후속이라고 명시한다. | Coordinator 계약 변경→consumer 검사→native 구현, Field도 동일 공개 client 계약 사용, 모든 client/actor/org/scope 검증·버전/오류 호환성. 범용 manage 후속과 현재 필수 계약 차이는 ADR로 명시. |
| 6 | 권한 수명과 백업 후 복원 / A08,F09,I06·QA47/150~153 | native 연결/selection 회수는 이번 eab1d30에서 journal/restore 구현. 설치된 OAuth provider의 개별 access row 삭제·refresh rotation/revoke family는 별도다. legacy revoked baseline과 Field route key 종료 수명도 미완료. | 실제 native auth 수명 사건의 durable proof·별도 복원 재적용·legacy 근거·원격 미확인/키 종료·기존 업무/접근 유지. 운영 RPO/RTO와 checkpoint/journal 동시 과거 교체 방지는 운영 게이트. |

순서는 고객이 사용하는 작은 위젯 보완 후 큰 미구현 구독·알림·주소·공개 client 기능을 먼저 완성하고, 기존 회수 보완을 별도 완료 기준으로 끝내기 위한 것이다. 새로운 보안 항목을 임의로 계속 확장하지 않는다. 기능 작업 시작 전 각 범위/QA/명령을 phase plan에 기록한다.

## 외부 연결과 사용자 인수는 별도로 남는다

- **이미 adapter/내부 경로가 있는 항목:** AP 상담 LLM(openai.ts), Field 제작 LLM(field-openai.ts/worker), 양방향 OAuth 연결과 AP 공개 SDK. 실 모델/예산/실 client 설정·공급사 검수는 별도다.
- **내부 구현도 필요한 외부 기능:** 위2~4의 유료 결제·메시지 발송·자체 domain. 현재 상태를 “키만 입력하면 완료”라고 설명하지 않는다.
- **사용자가 후속이라고 지정:** 이메일 소유/카카오·계정 연결/번호 변경·MFA, PG·메시지/푸시·DNS/TLS 등 실제 계약/credential 연결. 외부가 없어서 내부 개발을 멈추지 않으며 출시 gate도 pass 처리하지 않는다.
- **최종 인수:** 모든 역할 시안 일치/동선·모바일320/키보드/스크린리더·실기기, 전체 적용 QA01~160의 제품/환경/commit별 evidence와 독립/연결/매체 회귀. 사용자의 최종 테스트 요청을 유지한다.
- **운영 공개:** 실제 운영 ACL/백업 보관/법무·가격·RPO/RTO·G-A/F/I/D/L/S 승인·배포/rollback. 로컬 코드 구현 종료와 운영 서비스 출시 종료는 서로 다른 완료 지점이다.

## 전체 Task 인벤토리

“내부 구현/로컬 구현”은 해당 native 경로가 존재하고 이전 부분 검수 근거가 있다는 뜻이다. 원 Task의 전체 Done(권한/이벤트/usage/오류/복구/전체 QA/공급사/게이트)은 아직 따로 확인해야 한다.

| Task | 현재 범위 | 직접 대조한 코드/문서 | 남은 것 |
|---|---|---|---|
| C00 | 구현 이력 | C00_INVENTORY.md | 외부 운영 자산 부재·QA115 N/A는 미확인 |
| C01 | 부분 | contracts/*-integrator-v1.openapi.json | PRD 최소 목록과 public POST connection/deployment 차이, 구버전 정책 |
| C02 | 로컬 부분 검수 | tools/mock-run.mjs·run-independence.mjs | 운영 DB/큐/키/파일 ACL·CI/배포 |
| C03 | 부분 | 양제품 web/src·reference HTML·위젯 fe6a524 | 모든 역할/최종 시안 대조·미완료 기능 UI |
| A00 | 로컬 구현 | agent-api/src/auth.ts·business.ts | 이메일 소유·카카오·계정 연결·번호 변경·MFA 후속 |
| A01 | 내부 구현 | business.ts·agents.ts·field-sources.ts | 전체 QA/실 모델 근거 검수 |
| A02 | 내부 구현 | customer-consultations.ts·inquiries.ts·inquiry-attachments.ts | 전체 고객/실기기 인수 |
| A03 | 내부 구현 | inquiries.ts·customer-consultations.ts | 외부 알림 발송은 별도 미구현 |
| A04 | adapter 구현/외부 미연결 | openai.ts·agents.ts | 실 LLM·모델/예산 설정과 공급사 검수 |
| A05 | 내부 위젯 보완 완료 | deployments.ts·agent-public.tsx·fe6a524 | 실 외부 설치/기기·사용자 최종 인수 |
| A06 | 이벤트 원장만 구현 | inquiries.ts·field-actions.ts | 공급사 발송/콜백/unknown 조회·SMS fallback·webpush |
| A07 | 체험·가격/동의 backend 부분 구현 | subscription·billing·consent/context/Toss, b639a4d/1a04815 | 인증 발급/청구 worker·미상/갱신/해지/환불·제공량·SDK/결제 UI·실 PG |
| A08 | 부분 | admin.ts·customer-support.ts·retention/revocation 모듈 | 일반 OAuth 개별 수명/legacy 증빙·운영 백업/MFA |
| A09 | 부분 | auth.ts·integrator-routes.ts | 최소 public 연결/설치 write API·scope·범용 client 계약 대조 |
| A10 | 미완료 | run-independence.mjs AP mock 실제 통과 | 실 AI/알림/결제 없는 로컬 결과는 전체 실검수 아님 |
| A11 | 미승인 | 보안 문서5.7 | G-A1~3/G-L1 실제 evidence/출시 승인 |
| F00 | 로컬 구현 | field-api/src/auth.ts·business.ts | 실 인증/계정 보안은 후속 |
| F01 | 내부 구현 | business.ts·bookings.ts | 전체 필드/역할 인수 |
| F02 | 내부 구현 | sites.ts·site-media.ts·site-editor.tsx | HEIC/운영 저장소·최종 접근성/시안 |
| F03 | adapter/worker 구현 | field-openai.ts·site-generation.ts·worker.ts | 실 제작 LLM·모델/예산 설정 |
| F04 | 기본 공개만 구현 | sites.ts·server.ts | 자체 domain 등록/검증/DNS/TLS/실패 상태 API/DB/UI |
| F05 | 내부 구현 | inquiries.ts·inquiry-attachments.ts | 전체 고객/실기기 인수 |
| F06 | 내부 구현 | inquiries.ts·field-workspace.tsx | 외부 발송은 별도 미구현 |
| F07 | 내부 구현 | bookings.ts·reservations.ts·field-booking.tsx | 전체 예약 상태/역할/실기기 최종 인수 |
| F08 | 이벤트 원장만 구현 | notifications.ts·reservation events | 공급사 발송/콜백/unknown 조회·SMS fallback·webpush |
| F09 | 부분 | subscription/billing/consent/context/Toss·admin/support/retention/revocation | 인증 발급/청구/환불/제공량/결제 UI·route key/legacy 증빙·운영 MFA/복구 |
| F10 | 미완료 | run-independence.mjs Field 기존 로컬 증빙 | 실 제작 AI/알림/구독/도메인까지 독립 검수 |
| F11 | 미승인 | 보안 문서5.7 | G-F1~3/G-L1 실제 evidence/출시 승인 |
| I00 | 로컬 구현 | 양제품 auth·integrator·connector | 실 계정/전체 scope·재동의 lifecycle 인수 |
| I01 | 로컬 구현 | 양제품 connector/integrator·source 모듈 | public client 동등 조건/전 scope 대조 |
| I02 | 로컬 구현 | field-sources/source-refreshes·facts-change-delivery | 전체 stale/가격·호환성 QA 증빙 |
| I03 | 로컬 구현 | AP deployments·Field site SDK 설치 | 새 자체 domain origin 검증·실 외부 설치 |
| I04 | 로컬 구현 | field-actions·integrator external-requests·customer-handoffs | 실 공급사/전 동의 및 fault QA |
| I05 | 로컬 구현 | ap-conversations·field-event-inbox·notification-route | 발송 성공과 ACK의 실제 공급사 상태 연결 |
| I06 | 부분 | 양제품 revoke worker·route close·revocation restore | 일반 OAuth token 수명/legacy·Field route key 종료 |
| I07 | 부분 검수 | run-integration-faults.mjs·contract/DB tests | 이전 consumer/알 수 없는 필드·enum·정식 전체 fault |
| I08 | 미승인 | 보안 문서5.7 | G-I1~3 실제 evidence·독립 제품 승인 |
| D00 | 로컬 구현 | campaigns.ts | 최종 사업자 카드/승인/시안 인수 |
| D01 | 로컬 구현 | publishers.ts | 실 매체 도메인/권한/파트너 검수 |
| D02 | 로컬 구현 | placements.ts | 최종 정확 버전 승인/보류 인수 |
| D03 | 로컬 구현 | deployments.ts·placements.ts·위젯 fe6a524 | 실 매체/고객 기기·사용자 최종 인수 |
| D04 | 로컬 구현 | distribution-events.ts·distribution-metrics.ts | 전 작은 집단/차분 억제 QA 증빙 |
| D05 | 미완료/미승인 | run-e2e.mjs distribution | G-D1~2/실 매체 인수·독립 릴리스 |
| R00 | 대조 진행 | 본 문서·QA01~160 | 160개 모두의 제품/환경/commit별 실행 evidence 미완성 |
| R01 | 외부 상태 미확인 | C00_INVENTORY.md | 실 서버 존재/부재 증거 없이 N/A 처리 금지 |
| R02 | 미완료 | 전체 v3/사용자 최종 인수 | 로컬 코드 완료·사용자 테스트·공급사/운영 출시 구분 |

## 실제 명령/미실행

- 읽기: `rg --files apps/agent-api/src apps/field-api/src apps/agent-web/src apps/field-web/src`, native `subscription/auth/deployments/sites/integrator-routes` 직접 읽기, 청구/발송 관련 schema/source 검색, 계약 JSON route method 비교, TASKS/QA 표 대조.
- 경로 추정 실패: field-site-editor.tsx·agent-integrator.openapi.yaml은 없었고 실제 목록에서 site-editor.tsx·contracts/agent-integrator-v1.openapi.json을 확인했다. 해당 실패를 구현/검사 통과로 바꾸지 않았다.
- 이번 문서 대조 때문에 DB/E2E/security/contract 전체를 다시 실행하지 않았다. 마지막 코드 단계 실제 결과/리뷰·commit은 docs/CODEX_HANDOFF.md 상단과 해당 로그를 따른다.
- 계속 사용 가능한 환경: managed mock36780, AP http://localhost:3001/workspace / Field http://localhost:3002/workspace, 이번 단계 양 health/ready 실제 확인. 준비 상태가 미연결 공급사의 기능 완료를 뜻하지 않는다.

## 다음 정확한 작업

```bash
cd /Users/jr/Desktop/projects/FieldAI
git status --short
git log -1 --oneline
sed -n '1,78p' TASKS.md
sed -n '1,78p' docs/CODEX_HANDOFF.md
cat docs/technical/A07_F09_PAID_EXECUTION_PLAN.md
cat apps/agent-api/src/billing-routes.ts
cat apps/field-api/src/billing-routes.ts
curl -fsS http://127.0.0.1:4311/health/ready
curl -fsS http://127.0.0.1:4321/health/ready
```

A05.WIDGET-END·가격/동의/발급·FIRST-CHARGE(00c3e0d)는 완료다. 현재 다음은 PAID의 갱신/해지/유예다. 첫 청구를 반복하지 않는다. SDK/결제 UI 단계에는 owner/billing/admin/billing을 직접 열고 범위/검수 명령을 기록한다. 이전 “원장/동의/인증/첫 청구 worker 없음”은 당시 상태이며 최신 체크가 우선한다.
