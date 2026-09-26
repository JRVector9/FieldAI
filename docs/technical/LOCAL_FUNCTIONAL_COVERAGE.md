# 로컬 기능 검수 현황 — 2026-09-26

## 범위

- 검사 코드 커밋: `a023c67` (`Recheck Field AP connection and installed deployment state`). 이후 변경은 이 검수 기록이다.
- 환경: 로컬 `mock`, Node 24/pnpm, 제품별 PostgreSQL 17, Field Valkey, Chromium 합성 계정/업무. AP와 Field의 원장·자격증명·세션은 분리한다.
- 시안: `/Users/jr/Desktop/projects/FieldAI/reference/field_ui_prototype_v3.html`.
- 목적: 현재 명령에 포함된 실제 기능·저장·권한·독립성 경로를 확인한다. 전체 요구 완료와 실 공급사/출시 승인의 증거는 아니다.

## 실제 실행 결과

| 명령 | 결과 | 확인 범위 |
|---|---|---|
| `pnpm lint` | exit 0 | 현재 코드 정적 규칙 |
| `pnpm typecheck` | exit 0 | 양제품 API/웹 타입 |
| `pnpm test:unit` | exit 0 | API 각 3개, AP 웹 10개, Field 웹 14개, tools 7개 |
| `pnpm test:db:agent` | 21/21, exit 0 | 별도 임시 AP DB의 도메인/권한·원본·배포·알림 원장·구독 체험. 임시 DB 제거 확인 |
| `pnpm test:db:field` | 21/21, exit 0 | 별도 임시 Field DB의 카탈로그/사이트·직접 문의/예약·충돌·권한·체험. 임시 DB 제거 확인 |
| `pnpm test:contracts` | exit 0 | 공개 OpenAPI 정적 2개와 AP/Field 제공자·소비자 DB 5개 |
| `pnpm test:integration:faults` | exit 0 | 공개 계약, 제공자/소비자 장애 DB, 실제 양제품 HTTP/worker 전달 |
| `pnpm test:e2e:agent` | 3/3, exit 0 | 320px 사업자→상담 링크/외부 위젯→비회원 문의/답변, 매체 조직 복구, 별도 관리자 경로/권한 |
| `pnpm test:e2e:field` | 3/3, exit 0 | 320px 사업자→사이트 공개→직접 문의/두 예약 방식, 자동 저장/공개 경계, 별도 관리자 경로/권한 |
| `pnpm test:e2e:distribution` | 2/2, exit 0 | 매체 조직 복구, 카드 배치→Field 요청/예약·서명 사건·알림 경로·해제/직접 연락·집계 |
| `pnpm test:security` | exit 0 | 직접 cross-product import 차단, 교차 DB 자격증명 거부, 제품별 권한 DB, tenant 공개 경로, 관리자 감사/권한 |
| `pnpm test:independence:agent` | exit 0 | Field 프로세스/DB/Valkey/비밀값 실제 부재에서 AP 가입·승인·외부 위젯·접수/답변/체험 및 320px owner/customer 흐름 |
| `pnpm test:independence:field` | exit 0 | AP 프로세스/DB/비밀값 실제 부재에서 Field 가입·승인·사이트·접수/답변/두 예약·체험 및 320px owner/customer 흐름 |
| `pnpm build:agent`, `pnpm build:field` | exit 0 | 독립 실행 검사와 mock 복구 과정에서 실제 API 빌드 |
| `pnpm build:web:agent`, `pnpm build:web:field` | exit 0 | 독립 실행 검사와 mock 복구 과정에서 실제 Next 빌드 |

독립성 검수 전 전체 mock PTY를 종료하고 상대 compose 컨테이너를 `stop`했다. 볼륨을 삭제하지 않았다. 검사 후 `pnpm mock:run` PTY **53283**으로 양제품 build/ready를 복구했다. 최종 AP 웹 `http://localhost:3001/workspace`, Field 웹 `http://localhost:3002/workspace`의 HTTP 200과 API `127.0.0.1:4311`/`4321`의 제품별 `status:ready`를 실제 확인했다. 세션이 종료됐는지는 HTTP로 먼저 확인한다.

## 문서 대조에서 확인한 미구현 기능

| 요구 | 현재 증거 | 다음 구현 범위 |
|---|---|---|
| Field PRD 3.8: AP 장애 뒤 고객이 직접 새 요청을 제출하면 `fallback_origin`과 관계를 기록하고 가능한 요청 ID로 중복 후보를 보여줌. 전화번호만 자동 병합하지 않음 | `apps/`·`packages/`에서 `fallback_origin`, `fallbackOrigin`, `중복 후보` 구현을 찾지 못했다. Field 공개 문의/예약에는 해당 관계 입력/저장 경로가 없다. 표준 E2E에도 이 요구 단언은 없다. | Field 직접 문의·예약에 고객이 명시한 AP 대체 경로와 선택적 원요청 ID를 서버 원장으로 보존하고, Field 사업자에게 자기 조직의 기존 AP 수신 요청과 대조한 후보를 표시한다. AP 원문/확인키를 복사하거나 전화번호만으로 병합하지 않는다. 정확한 DB/API/화면 범위와 실패 복구를 다음 작업 시작 시 기록한다. |

이는 전체 PRD의 기능 누락 목록을 완성한 것이 아니다. 현재 표준 검사에서 확인한 경로와 이 문서 대조에서 직접 확인한 누락을 기록한다. 다른 문서 요구는 구현/증빙을 계속 대조해야 한다.

## 계속 남은 검수

- 사용자 최종 시각·동선 인수, 원본 시안과 모든 역할/화면의 대조, 전체 키보드/스크린리더·실 브라우저 200% 확대.
- 실 인증·LLM·카카오/문자/푸시·독립 결제·운영 DNS/TLS·실 객체 저장소/악성코드 검사·백업/보존 정책. 해당 공급사/운영 검수는 `blocked_integration` 또는 미검수이며 로컬 mock 성공으로 통과 처리하지 않는다.
- 정식 QA/G의 실기기·운영 장기 장애·구버전 consumer·복구/보존 증빙. C03과 A/F/I/D 완료/출시 승인은 아직 미증명이다.
