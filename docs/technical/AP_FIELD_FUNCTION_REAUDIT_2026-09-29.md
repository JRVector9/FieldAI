# AP·Field 기능 재검토 — 2026-09-29

## 후속 구현 상태 — 2026-09-29

아래 표는 `f199687` 당시 발견 이력이다. 사용자가 누락 전체 구현을 지시해 AP 4건은 `03d48ca`/`2e016c4`, Field 2건은 `5b90ef5`/`80cfeb0`/`3f06668`/`7be6abd`, E2E 사전 조건은 `dc461a9`에서 수리했다. AP/Field 환불 clock과 격리 DB/계약 검수 후속은 `932ee10`/`7886c2e`/`716fadf`/`94168bb`/`052d23b`를 따른다. 현재 검증은 AP DB34파일136/136, Field DB31파일157/157, AP 웹55/55, Field 웹98/98, 정적+표적 계약 검수, lint/typecheck/양 API·웹 build 통과다. **Field 전체 브라우저 E2E 7/7, AP 8/8, 매체 연동 2/2**, mock 통합 장애·보안 재실행, 상대 제품 서비스/DB 부재의 양방향 독립성까지 통과했다. 브라우저 선택자·관리자 검수는 `f8f42cb`/`613e131`/`5e94756`, 장애·독립성 runner는 `066f0b3`/`fb07f42`를 따른다. 첫 보안 실행의 Field DB 연결 종료 1건은 단독/전체 재실행에서 재현되지 않았으나 원인은 미확정이다. 외부 공급사·운영/실기기·사용자 최종 인수는 별도다. 최신 상태는 `TASKS.md` 상단과 `docs/CODEX_HANDOFF.md` 최상단 구현 섹션을 우선한다.

아래 “이전부터 열린 게이트”와 실패 로그는 **구현 이전 시점의 이력**으로 보존한다. 현 시점 전체 DB·unit·계약 게이트의 통과 사실과 혼동하지 않는다.

## 범위와 상태

- 기준: `main` HEAD `f199687`, 작업 시작 시 clean. `TASKS.md` 상단 완료 원장, `docs/CODEX_HANDOFF.md`, 제품 아키텍처 B01~B12, AP/Field PRD, 연동 계약 및 QA 명세를 대조했다.
- AP, Field, 제품 간 계약을 별도 읽기 전용 검토했다. 아래 신규 누락은 소스의 호출 경로로 확인했으며 이번 검토에서 새 DB fixture나 고객 브라우저 종단 시나리오로 재현하지 않았다. 기존 `[x]` 근거는 보존하고 이 추가 범위만 후속 작업으로 다룬다.
- 실 고객 발송·결제·데이터 변경·배포는 수행하지 않았다.

## 새로 확인한 누락

| 우선 | 제품/세부 ID | 증거와 영향 | 후속 검수 |
| --- | --- | --- | --- |
| P1 | AP A02/C03, R00.QA | `apps/agent-api/src/inquiries.ts`의 owner 문의 API는 최신 100건과 `nextCursor`를 반환한다. `apps/agent-web/src/workspace.tsx`의 `오늘` 할 일은 첫 페이지만 `needs_owner`로 걸러, 101번째 이후 미처리 건을 놓치고 `0+`/첫 문의 안내를 보여줄 수 있다. | 100건 이후 미처리 업무를 둔 DB+웹 회귀. cursor 종료/조회 실패를 0건으로 취급하지 않기. |
| P2 | AP A01/C03, R00.QA | `apps/agent-api/src/business.ts`는 viewer 읽기, editor 편집, owner 승인만 허용한다. 지식 GET은 역할을 반환하지 않고 `apps/agent-web/src/workspace.tsx`는 저장·승인 조작을 역할과 무관하게 활성화해 editor 승인, viewer 저장/승인이 404로 끝난다. | 현재 membership 역할 반환/조회와 UI 권한 회귀. 서버 권한 유지. |
| P2 | AP A02/C03, R00.QA | `apps/agent-api/src/inquiries.ts` 알림 GET은 최신 100건만 목록으로 주되 미열람 개수는 전체를 센다. `apps/agent-web/src/workspace.tsx`에는 나머지 알림을 여는 수단이 없어 오래된 미열람 알림을 읽을 수 없다. | cursor/목록 더 보기 또는 미열람 조회, 101건 회귀. |
| P2 | AP A01/A02, R00.QA | `apps/agent-api/src/business.ts`는 동명 서비스를 허용한다. `apps/agent-web/src/agent-public.tsx`는 이름을 select 값으로 사용하고, `apps/agent-api/src/inquiries.ts` 및 `customer-consultations.ts`는 이름이 같은 첫 항목을 `.find`한다. 두 번째 서비스를 골라도 첫 번째 설명의 snapshot이 문의에 저장된다. 계약은 AP 직접 서비스 식별에 공개본 인덱스를 지정한다(`docs/03_INTEGRATION_CONTRACT.md`). | 인덱스/안정 식별자 계약으로 고객 선택·문의 snapshot을 잇고 동명 2개 회귀. |
| P1 | Field F04/F07, R00.QA | 새 조직 생성은 카탈로그 초안만 만든다(`apps/field-api/src/business.ts`). 사이트 편집/공개는 예약 정책을 검사하지 않지만(`apps/field-web/src/site-editor.tsx`, `apps/field-api/src/sites.ts`), 공개 예약 POST는 두 방식 모두 정책이 없으면 `policy_not_set` 409를 반환한다(`apps/field-api/src/bookings.ts`). 첫 사이트를 공개한 고객이 예약을 신청할 수 없다. | 신규 조직→서비스 승인→사이트 공개→희망시간/시간표 제출을 격리 DB+브라우저로 재현하고 공개 전 설정 동선/준비 상태를 검수. 기존 비예약 공개 정책은 명시적으로 결정. |
| P2 | Field F07/F08, R00.QA | 직접 예약 확정·제안·취소 UI(`apps/field-web/src/field-booking.tsx`)는 항상 고객 외부 알림이 공급사 미연결로 미발송이라고 표시한다. 서버는 직접 예약 사건의 `delivery: pending`을 반환하고 이후 알림 worker 상태가 바뀔 수 있다(`apps/field-api/src/bookings.ts`, `notification-delivery-execution.ts`). | 접수 ACK, 발송 pending/unknown/성공/실패를 구분하는 화면 회귀. 실제 공급사 결과를 ACK로 단정하지 않기. |
| P2 · 검수 | C02/R00.QA | `tools/run-e2e.mjs`의 `agent`/`field` 모드 모두 양제품 `.env`와 API·웹 ready를 요구한다. 따라서 제품별 E2E 명령은 상대 제품 부재에서 실행할 수 없다. 이는 검수 실행기의 결합이며 제품 런타임의 B01/B02 위반 증거는 아니다. 별도 `test:independence:*`가 엄격한 단독 검수를 담당한다. | 제품별 E2E 선행조건을 own 제품으로 좁히고 독립성·전체 Suite 게이트를 별도 유지하는 회귀. |

## 이전부터 열린 게이트

- 최신 Field 전체 DB suite는 31파일 중 3파일 실패(`ai-entitlement`, `billing-lifecycle`, `billing-refund`), 환불 테스트 1건 180초 timeout이며 exit 1이다. 이번 검토에서 기존 로그의 `empty`/`blocked_integration`을 확인했지만 DB/Node 시각, `next_attempt_at`, `error_code` 측정 전이라 원인을 확정하지 않았다. `TASKS.md`의 `[ ] R00.QA / F09.REFUND-DECLINE.DB`를 유지한다.
- 이번에 실행한 `pnpm test:unit`은 AP 웹 `test/customer-consultation.test.tsx`의 CSS import `SyntaxError`로 exit 1이다. AP 웹 53/54, Field 웹 92/92가 실행됐고 Field 웹은 통과했다. 루트 unit gate는 실패다.
- AP API 4311은 기동되지 않았고 Field API 4321 ready는 HTTP 200이었다. 신규 사업자 브라우저 종단, 제품별 독립성/통합 장애, 실 공급사·모바일/접근성·출시 검수는 이번 재검토에서 실행하지 않았다.

## 실행한 검사

| 명령 | 결과 |
| --- | --- |
| `pnpm test:unit` | exit 1; AP 웹 53/54, Field 웹 92/92. AP CSS import 오류. |
| `node --test tools/test/agent-integrator-contract.test.mjs tools/test/field-integrator-contract.test.mjs` | 3/3 pass. |
| `node tools/check-import-boundaries.mjs` | pass; 직접 제품 내부 import 위반 없음. |
| `curl http://127.0.0.1:4311/health/ready` | 연결 실패; AP 미기동. |
| `curl http://127.0.0.1:4321/health/ready` | 200; Field 기동. |

## 충돌 없는 후속 PR 순서

1. AP 업무/알림 pagination. `agent-api/src/inquiries.ts`, `agent-web/src/workspace.tsx`와 관련 회귀. 이후 AP 지식 권한 UI/동명 서비스 식별 PR을 진행한다. 두 범위가 `workspace.tsx`를 공유하므로 병렬 편집하지 않는다.
2. Field 예약 준비 동선. `field-api/src/business.ts`·`sites.ts`·`bookings.ts`, `field-web/src/site-editor.tsx`·`field-booking.tsx`와 신규 조직 회귀. 이후 Field 알림 상태 UI PR을 진행한다. 두 범위가 `field-booking.tsx`를 공유한다.
3. 검수 실행기/게이트 PR. `tools/run-e2e.mjs`와 own-only 회귀를 위 기능 PR과 독립해서 진행한다.
4. 기존 Field 환불 DB 실패와 AP unit CSS import는 별도 gate repair로 원인 재현 후 수정한다. 실패 기대값을 현재 동작에 맞추거나 skip 처리하지 않는다.

후속 코드 변경 전 `TASKS.md` 동일 세부 ID에 재개 사유·현재 증거·추가 파일 범위와 요구/QA·검수 명령을 적는다. 본 문서는 구현 완료 체크가 아니다.
