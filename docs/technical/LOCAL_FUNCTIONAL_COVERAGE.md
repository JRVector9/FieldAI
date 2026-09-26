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
| AP PRD 2.7: spam 상태는 보존과 별도로 발송 중단 | 2026-09-26 AP migration 000061/owner revision 분류·해제·원본/후속/사진/메모 보존·알림 중단. AP DB 22/22(권한/멱등/경합/감사/내보내기·위임 답변 거절·Field 예약 사건), Field DB 24/24(확정 거절 초안 보존), mock 17560의 AP 사업자 HTTP/브라우저 1/1·양제품 HTTP/브라우저 1/1. Field 화면 spam은 기존 실제 원본 응답의 상태만 주입한 소비자 검사다. typecheck/lint/build exit 0, AP 320px 캡처 확인. | 실 발송 공급사/사용자 최종 인수/전체 QA/G는 미검수. 스팸은 현재 동의 완료 human 상담 원본 대상이며 익명 AI 상담 분류를 구현했다고 주장하지 않는다. |
| AP PRD 2.2 순서 3: native 지역·영업시간 등록 | 2026-09-26 AP business/agents·workspace/public에 선택 native 값을 연결했다. AP DB red→23/23(값 검증/권한/PATCH 보존/승인 전후·구버전 불변 JSONB·owner/customer AI 승인 근거), mock 29076의 320px 사업자 HTTP/브라우저 1/1·자동 저장 HTTP/브라우저 1/1(지역만 바뀐 응답 분실/409, 시간만 바뀐 서버 선택·공개 유지). typecheck/lint/build exit 0. 시안 owner/agent-knowledge 직접 확인. | Field 사실과 자동 병합하지 않는다. 전체 시각/동선·사용자 최종 인수/실 LLM·전체 QA/G는 미검수. |
| Field PRD 3.6: 수신 snapshot 목적·출처·시각·보존기간 | 2026-09-26 migration000056·received-work-record와 원장/상세/exports. Field DB red→24/24(문의/예약 목적·동의·제안180/90·멱등/해제/내보내기·legacy null·목적/JSON null 거부), mock2217 양제품 HTTP/브라우저 1/1(320px 문의/예약 표시·기존 원본/답변/해제/알림). typecheck/lint/build exit 0·320px 캡처 확인. | 정책 상태는 proposed다. 종결시각/보존 연장/자동 정리·법무/운영 정책·공급사·사용자 최종 인수/전체 QA/G는 미완료다. |
| Field PRD 3.2: 셀프 제작 첫 사업 정보의 업종 입력 | 2026-09-26 Field 자체 입력·서버 초안·승인·공개 표시·제작 snapshot 연결. Field DB25/25, 렌더2/2, mock88953 자동 저장/320px1/1·사업자→공개/직접 문의/두 예약1/1. 업종만 수정한 응답 분실/409 두 선택·구버전 보존/미등록·승인본 유지, typecheck/lint/build exit0. 시안 create/business 직접 대조. | AP 공개 facts 계약을 늘리지 않았다. 실제 제작 LLM·전체 시각/흐름·운영/전체 QA/G는 미검수다. |
| Field PRD 3.9 F-A06·QA48/49: 신고/이의 처리·승인 접근 | 2026-09-26 migration000057와 native 신고/공개 snapshot·다른 operator 승인/기간 접근·감사/검토·사이트 제한·사업자 내부 알림/이의/결정/제한 해제. Field DB26/26(session98497), mock46010의 신고 HTTP/320px15625 1/1·기존 관리자19942 1/1, tenant/렌더3/3, typecheck/lint exit0. 자기 승인/auditor/타 actor·타 신고/만료/권한 회수 차단, 다중 제한/원본·신규 직접 접수 유지·멱등/응답 분실·당시 서비스/FAQ/본문·알림 읽음/이동 확인. | 일반 고객 대화·사진의 지원 열람/운영 MFA·신고/이의 정책·법정 보존/복구와 원래 client-IP reverse-proxy 검수는 미완료다. 로컬 peer 기반 신고 한도는 접속자를 합쳐 제한할 수 있다. 표준 Field E2E에 등록했으나 등록 뒤 전체 세트는 미실행이며 이 좁은 결과로 전체 QA49/G를 통과 처리하지 않는다. |
| AP PRD 2.9 AP-A06·QA48/49: AP 신고/이의 처리 | 2026-09-26 migration000062와 native 신고/공개 whitelist snapshot·다른 operator 승인/기간/현재 권한 접근·검토/감사·배포별 hold·owner 내부 알림/읽음/이의/결정. AP DB24/24(session33270), mock10988 신고 HTTP/320px32096 1/1·기존 관리자9826 1/1, typecheck2626/lint17406/build exit0. 실제 PG17 신규 위젯 접수 경합·AI 최종 응답 거절, 복수 hold/owner pause·기존 원본/위젯 사람 인계·직접 접수/다른 배포·기존 고객 새로고침/무권한 복원 차단·ACK 분실/재시도·알림/320px 가로 넘침 확인. | 일반 고객 대화/사진 지원 열람·운영 MFA/IP 신뢰·보존/정리·실 공급사/정식 QA/G/사용자 최종 인수는 미완료다. 원래 peer 기반 신고 한도는 여러 접속자를 합칠 수 있다. 표준 AP E2E4개에 등록했지만 전체 명령은 등록 뒤 미실행이다. 신고 grant는 고객 원문 권한이 아니다. |
| 시안 고객정보 열람 요청·QA49·보안 문서5.3: 별도 승인/사유/기간/감사의 원본 지원 접근 | AP 문의별 native grant/감사·목적/참조/사유·conversation/contact/photos·다른 운영자 승인/기간·현재 양 운영자 membership·회수/만료·header 사진/읽기 뒤 재확인·성공 읽기 감사를 구현했다. AP DB25/25(session86324), 최종 typecheck48647/lint11371 exit0, mock75745 HTTP/320px22877 1/1(ACK 분실·scope별 원본·내부 메모 비노출·실제 사진·queue503 복구·회수/실제8초 기한 폐기·가로 넘침/pageerror0), 기존 AP admin1988 1/1. 시안 request-access 모달 직접 확인. | Field F09의 자체 문의/예약·사진 지원 접근은 아직 미구현이며 자기 DB/세션/권한으로 구현한다. AP 원본은 AP 공개 계약만 이용한다. 운영 MFA·고객 요청 진위·보존/전체 QA49/G·사용자 최종 시각/동선은 미완료. AP 지원 queue100개+cursor/감사 최근100개, 표준 AP E2E5개 등록 뒤 전체 명령 미실행. 신고 grant/관리자 토큰만으로 고객 원문을 열지 않는다. |

이는 전체 PRD의 기능 누락 목록을 완성한 것이 아니다. 현재 표준 검사에서 확인한 경로와 이 문서 대조에서 직접 확인한 누락을 기록한다. 다른 문서 요구는 구현/증빙을 계속 대조해야 한다.

## 계속 남은 검수

- 사용자 최종 시각·동선 인수, 원본 시안과 모든 역할/화면의 대조, 전체 키보드/스크린리더·실 브라우저 200% 확대.
- 실 인증·LLM·카카오/문자/푸시·독립 결제·운영 DNS/TLS·실 객체 저장소/악성코드 검사·백업/보존 정책. 해당 공급사/운영 검수는 `blocked_integration` 또는 미검수이며 로컬 mock 성공으로 통과 처리하지 않는다.
- 정식 QA/G의 실기기·운영 장기 장애·구버전 consumer·복구/보존 증빙. C03과 A/F/I/D 완료/출시 승인은 아직 미증명이다.
