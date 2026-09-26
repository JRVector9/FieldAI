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

## 문서 대조 결과와 후속 구현

| 요구 | 현재 증거 | 다음 구현 범위 |
|---|---|---|
| Field PRD 3.8: AP 장애 뒤 새 직접 요청의 `fallback_origin`·관계·ID 기반 중복 후보, 전화번호 자동 병합 금지 | 2026-09-26 후속 구현: migration 000055, Field 문의/예약 저장·권한·내보내기, 고객 명시 입력과 사업자 후보 이동. 새 DB 3개 red→전체 Field 24/24. 320px 실제 문의·두 예약·후보 문의/예약 이동·503 재시도 exit 0. 후보는 고객 선언과 같은 Field 조직 수신 ID 대조일 뿐 장애/중복 확인이 아니다. | 마지막 시각 검토로 추가한 후보 버튼 CSS는 다음 mock build 반영. 전체 AP 실제 장애·전체 역할/정식 QA/G와 사용자 최종 인수는 기존 미완료 범위로 유지. |
| AP PRD 2.5: 대표 상담 링크 QR 제공 | 2026-09-26 후속 구현: `AgentConsultQr.tsx`, 활성 링크의 browser PNG 생성/다운로드. 버튼 부재 red→AP 표준 E2E 3/3, 좁은 사업자 HTTP 1/1에서 canvas 실패/재시도·PNG와 실제 320px 표시 이미지의 jsQR 해독·원래 공개 URL·배포 pause 404/re-activate 확인. AP web typecheck/lint/build exit 0. Field 재접수 CSS도 mock 1112 빌드 반영/320px 확인. | 실 휴대전화 카메라·종이 인쇄·사용자 최종 시각/전체 QA/G는 미검수. 외부 QR 서비스·비밀값/고객 정보 전송 없음. |
| C03 고객 표시 상태: 카탈로그 조회 완료와 미등록 값 구분 | 2026-09-26 red→mock 44403의 320px 브라우저 exit 0. 지연/정상 빈 값/404/503·네트워크 실패·재시도, 대상 있는 헤더 링크, 기존 문의·두 예약·후보 흐름 확인. Field web typecheck/lint/build exit 0. | API/DB 변경 없음. 사용자 최종 화면 인수·전체 QA/G는 미검수. |
| AP PRD 2.7: spam 상태는 보존과 별도로 발송 중단 | AP inquiries state CHECK에 spam이 없고 문의함/API에 분류·복구가 없다. 고객 추가 답변은 항상 needs_owner로 바꾸고 알림을 만든다. | AP 자체 스팸 분류/해제·권한/감사·원본 유지·알림 중단과 재개 후 신규 사건 처리를 구현한다. |

이는 전체 PRD의 기능 누락 목록을 완성한 것이 아니다. 현재 표준 검사에서 확인한 경로와 이 문서 대조에서 직접 확인한 누락을 기록한다. 다른 문서 요구는 구현/증빙을 계속 대조해야 한다.

## 계속 남은 검수

- 사용자 최종 시각·동선 인수, 원본 시안과 모든 역할/화면의 대조, 전체 키보드/스크린리더·실 브라우저 200% 확대.
- 실 인증·LLM·카카오/문자/푸시·독립 결제·운영 DNS/TLS·실 객체 저장소/악성코드 검사·백업/보존 정책. 해당 공급사/운영 검수는 `blocked_integration` 또는 미검수이며 로컬 mock 성공으로 통과 처리하지 않는다.
- 정식 QA/G의 실기기·운영 장기 장애·구버전 consumer·복구/보존 증빙. C03과 A/F/I/D 완료/출시 승인은 아직 미증명이다.
