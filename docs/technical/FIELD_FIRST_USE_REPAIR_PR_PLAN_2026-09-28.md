# Field 첫 사용 동선·기능 결함 수리 — PR 분리 계획

Task IDs: F07.BOOKING/F09.TRIAL/F06.INQUIRY, C02.LOCAL/R00.QA, F02.EDITOR/F04.BASIC-PUBLISH/F01.CATALOG, R02.ACCEPTANCE. 기준 `d5fb5a6`와 `FIELD_FIRST_TIME_USABILITY_AND_FUNCTION_QA_2026-09-28.md`의 실제 16개 중 2개 DB 실패 및 브라우저 동선 관찰이다. 기존 `[x]` 구현은 보존하고 아래 재현 범위만 재개한다. v3 시안의 배치·색·글자·메뉴·반응형을 고정하고 신규 UI 기능에 `(추가)`를 붙인다. AP와 Field의 원본·계정·DB·API 경계는 바꾸지 않는다.

| PR 단위 / 의존성 | 단독 소유 파일 | 변경 목표 | 필수 검수 |
| --- | --- | --- | --- |
| PR1 `fix/field-intake-confirm-500` / 선행 | `apps/field-api/src/**`, `apps/field-api/migrations/000074*`(필요 시, 번호74 예약), `apps/field-api/test/bookings.db.test.ts`, `apps/field-api/test/subscription.db.test.ts` 및 직접 관련 Field API test | 시간표 예약 owner 확정 500과 체험 만료 후 기존 예약 owner 확정 500을 복원한다. 추가 조사에서 **두 500 모두 PG42702**이며 migration68의 알림 트리거에서 `reservation_events.detail` 열과 PL/pgSQL `detail` 변수가 충돌함을 DB 오류 context로 확인했다. 초기 문의 접수는 201이다. 서버 저장/기존 예약/알림 원본을 보존하고 적용된 migration 68/73을 덮어쓰지 않는다. | 각 실패 재현→통과, business-core/sites/bookings/subscription 및 관련 알림 회귀. mock 독립 임시 DB, 실패/skip은 그대로 보고. |
| PR2 `fix/field-db-suite-runner` / PR1과 병렬 | `tools/run-db-suite.mjs`, `tools/test/*db-suite*` 신규 검수 파일. 직접 리뷰에서 확인된 Field 단독 테스트의 peer env 오류만 `apps/field-api/test/billing-lifecycle.db.test.ts` 추가 소유(2026-09-28 재개). | `.env` 로드 순서와 Field mock profile을 고쳐 `pnpm test:db:field`가 올바른 own 환경을 자식에 전달. 파일별 UUID DB/원장 격리와 실패 nonzero를 보장한다. 직접 Codex 리뷰의 P1: outer timeout에서 `pnpm`만 종료해 손자 test process가 cleanup 뒤 살아 있을 수 있다. 전체 process tree 종료/대기 또는 동등한 안전한 제어를 확인하고 DB를 정리한다. P2: Field billing lifecycle test가 AP `.env`를 읽는 경로를 own Field `.env`로 한정한다. | runner env 단위 회귀 red→green, 제한 시간/하위 프로세스 종료 검사, Field 단독 테스트와 AP/Field 적용 범위 실행. 이후 PR1 병합 뒤 전체 Field DB 재실행; 실패를 성공으로 삼키지 않음. |
| PR3 `feat/field-first-use-path` / PR1·PR2와 병렬 | `apps/field-web/src/field-workspace.tsx`, `apps/field-web/src/site-editor.tsx`, 필요 시 해당 웹 test 및 기존 scoped CSS만 | 오늘 화면에서 미공개 사업자의 실제 다음 일로 이동, 제작1단계→사업 정보 입력 폼 직접 이동·복귀, 승인/공개 전 누락값과 비활성 이유/해결 경로, 내부 용어를 쉬운 말로 표시. 서버 저장·승인·공개 상태를 혼동하지 않음. | 화면 단위 테스트 red→green, Field web unit/typecheck/build, mock CUA의 미승인·미공개 read-only 동선. 미저장 입력 이동 보호. |
| PR4 `feat/field-first-day-guide` / PR3 뒤 같은 웹 소유자 | PR3과 같은 웹 소유 파일 및 별도 웹 test | 기존 내부 test 문의를 공개 전/후 적절한 `첫 문의 미리 해보기(추가)`로 연결. 고객 발송·실적·실예약과 격리. 오늘/문의함/예약에서 접수·답변·사업자 확정 및 실패/unknown 상태를 짧게 설명. 실제 상태와 권한만 표시하고 허구 업무·발송 성공 생성 금지. | 기존 ownerTest API/웹 검증, Field web unit/typecheck/build, 두 예약 모드의 기존 상태 표시 회귀. |

조정자만 `TASKS.md`, `docs/CODEX_HANDOFF.md`, 공통 계약/schema 번호 예약, 통합 commit, managed runtime, 최종 검수/보고를 소유한다. 각 서브에이전트는 별도 worktree/브랜치에서 작업하고 자신의 범위 밖 파일이 필요하면 조정자에게 알린다. PR1과 PR2의 DB 검사는 UUID 별도 임시 DB를 사용한다. 같은 mock 컨테이너의 스키마/운영 데이터를 직접 초기화하지 않는다. PR3/4의 브라우저 사용은 조정자가 통합 뒤 수행한다.

통합 순서: PR1/PR2는 파일 충돌 없이 순차 cherry-pick, PR3→PR4는 같은 웹 소유자의 직렬 commit을 순차 반영한다. 각 단위는 독립 테스트·`git diff --check`·Codex CLI read-only review 후 병합한다. 최종 `pnpm test:db:field`, Field web unit/typecheck/build와 필요한 UI/API 검사를 실제 실행하고 실패를 남긴다. 실 공급사·고객 발송·청구·운영 삭제·배포는 범위 밖이며 외부/최종 인수는 계속 미완료다.

직접 재리뷰로 확인된 추가 결함(2026-09-28): PR3은 미저장 사업 정보의 `오늘` 주 행동이 페이지를 다시 열어 입력을 잃는 경로, owner 이외 역할에 승인·공개를 지시하는 경로, 새 저장/안내 조작 이름의 `(추가)` 누락을 같은 웹 소유 범위에서 보완한다. PR4는 체험 종료 후 내부 시험 링크가 활성화되어 403으로 끝나는 상태와 AP 문의에 Field 직접 문의의 알림 확인 안내를 적용한 문구를 보완한다. 각 상황의 실제 role/entitlement/원장 상태를 테스트하고 기존 첫 사용 동선 회귀를 확인한다. AP/Field 계약·서버·DB·디자인 CSS는 변경하지 않는다.

PR2 최종 직접 리뷰 추가 범위: test child 실행 중뿐 아니라 임시 DB 생성·제거 구간의 SIGINT/SIGTERM도 suite 범위에서 지연 처리해 cleanup 또는 보존을 끝낸 뒤 nonzero로 종료한다. Mac 로컬 우선의 POSIX 그룹 제어가 지원되지 않는 플랫폼에는 명확한 unsupported 진단을 제공하거나 동등한 안전한 분기를 구현한다. 실제 인터럽트 회귀와 일시 DB/원장 정리 수를 다시 확인한다.

PR4 직접 URL 추가 범위: 제작기의 시험 링크가 종료 체험을 막아도 이미 열린 `/public/:id?ownerTest=1` 폼은 ownerTest GET 200만으로 활성화되는 것이 재리뷰에서 확인됐다. 기존 Field 공개 화면의 ownerTest 사전 검사에 같은 조직의 실제 `subscription.access.canStartNew`를 결합하고, 조회 실패·만료 시 폼을 비활성화하며 사유/재시도만 표시한다. 고객 일반 문의 폼이나 서버 POST 보호 계약은 유지한다.
