# 개발 진행 상태 — 2026-09-26

## 최신 C03 로컬 핵심 기능 회귀 감사 (2026-09-26)

현재 코드 `a023c67`의 표준 AP E2E 3/3·Field 3/3·Distribution 2/2, AP/Field 격리 DB 각 21/21, 공개 계약·장애 주입·보안·lint/typecheck/unit exit 0. 상대 제품 프로세스/DB/비밀값이 실제 없는 AP/Field 독립 검수도 각각 exit 0이며 제품별 API/웹 build를 실제 실행했다. mock 환경은 **53283**으로 복구했다. 증거 범위는 `docs/technical/LOCAL_FUNCTIONAL_COVERAGE.md`에 기록했다. 기존 표준 경로 실패는 없었지만 Field PRD 3.8의 AP 장애 후 직접 새 요청 `fallback_origin`·원요청 관계/중복 후보가 현재 코드에 없어 다음 내부 기능으로 남긴다. C03 전체 기능·사용자 최종 디자인/동선·정식 QA/G는 계속 미완료다.

## 최신 C03/I03 Field AP 연결·설치 재확인 (2026-09-26)

Field 사업장/사이트 조회와 AP 연결 목록 조회를 분리했다. 목록 GET 실패는 승인 연결 없음과 구분하고 재조회 전에는 이전 기록의 조작을 멈춘다. 이미 설치된 배포가 선택한 연결의 현재 AP 활성 후보에서 사라지거나 연결 자체가 해제된 경우, Field 설치 기록과 고객 상담 가용성을 별도로 표시한다. 320px 브라우저의 거짓 빈 목록·해제 연결 상태 red→최종 exit 0(연결/설치/배포 조회 실패·재시도, 배포 제거, 연결 revoked, 가로 넘침/pageerror 0). 실제 AP pause→Field 활성 후보 제외/AP 공개 404/Field 공개 사이트 200→reactivate 뒤 후보 복귀를 포함한 양제품 HTTP 1/1. Field web typecheck·전체 lint·Python/Node 구문·diff 검사 exit 0, 새 mock **23141** 양제품 build/ready. 실 DNS/TLS·사용자 디자인/동선 인수·정식 QA/G는 미실행이며 C03/I03 `in_progress`다.

## 최신 C03/I03 Field 사이트 AP 설치 상태 (2026-09-26)

Field 사이트의 초안 주소와 실제 공개 주소를 분리했다. 설치 조회 API는 release 존재 여부를 반환하며 UI는 초안에서는 AP 계정 연결을 허용하되 사이트 증명/위젯 설치를 공개 뒤에만 보여준다. 설치 조회 503과 AP 배포 후보 조회 503은 확인 실패/재시도로 표시하고 정상 빈 배포와 구분한다. Field DB 검사 초안 `published` 누락 red→최종 2/2, 320px 새 조직/초안·조회 실패/재시도 브라우저 red→green 및 가로 넘침/pageerror 0, 기존 AP↔Field 연결 HTTP 1/1, Field API build·web typecheck·전체 lint·Python 구문 exit 0. 새 mock **86290** 양제품 build/ready. 사용자 최종 디자인/동선 인수·정식 QA/G·실 공급사는 미실행이며 C03/I03 `in_progress`다.

## 최신 C03/QA57·119 AP/Field 사업자 키보드 초점 (2026-09-26)

원본 시안 HTML의 320px 사업자 `owner/today`를 Chromium에서 다시 열고 하단 메뉴를 확인했다. 실제 제품별 신규 조직 화면의 긴 폼에서 Tab 초점이 하단 메뉴 뒤로 내려가는 오류를 Field(입력 하단 687px)·AP(사업 소개 하단 691px) 각각 0/1 red로 재현했다. 모바일 작업실 내부 스크롤의 하단 여유 100px을 주어 초점이 보이게 했다. 새 mock **2358** 양제품 build/ready, AP/Field 각각 320/390px 폼 초점·모바일 메뉴 Enter 경로 검사 exit 0, 양 웹 typecheck·전체 lint·Python 구문 exit 0. 전체 화면 키보드/스크린리더·실 200% 확대·사용자 최종 시각/동선·정식 QA/G는 미실행으로 C03 `in_progress`다.

## 최신 C03/I04 AP Field 전달 기록 부분 장애 복구 (2026-09-26)

기존 Field 요청이 있는 AP 고객 320px 화면에서 전달 이력 GET 503 뒤 이미 확인한 기록이 사라지는 0/1 red를 재현했다. 같은 문의·확인키의 재조회에서는 마지막으로 확인한 전달 기록과 사진 목록을 유지하고, 다른 문의·확인키로 바뀌면 폐기한다. 서비스/가격/동의·사건 현황은 다시 확인해야 한다. 최종 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1(전달 화면·위젯·원본 답변·해제·알림), AP web typecheck·전체 lint·Python 구문 exit 0. 첫 green 시도는 실행 중인 mock worker와 수동 연결 해제 검사 경합으로 non-zero였으며 최종 실행에서 worker 상태를 명시해 통과했다. mock **7578** 양제품 build/ready·양 API/웹 HTTP 200. 사용자 최종 시각/동선·실 공급사·정식 QA/G는 남아 C03/I04 `in_progress`다.

## 최신 C03/A00/F00 로그인 진입·분배 E2E (2026-09-26)

AP 홈 `로그인`이 가입 폼으로 향하는 320px red를 확인해 기존 `/workspace?mode=login` 분기로 연결했다. Field 홈은 이미 정상 분기였다. 새 320px 브라우저 검사는 두 제품 로그인/무료 시작 4개 진입 1/1. 현재 mock의 표준 AP 3/3·Field 3/3 E2E 통과 뒤, 분배 E2E의 오래된 화면 선택자를 실제 모바일 예약·문의/연결 해제·고객 접힘 도구 동선으로 수정해 최종 매체 복구+AP 배치→Field 업무 2/2 exit 0. 새 mock **1896** 양 API/웹 build/ready, AP web typecheck·전체 lint·Python 구문·diff 검사 exit 0. 기준 `reference/field_ui_prototype_v3.html`의 오늘 1440/320px을 실제 열어 캡처하고 Field 실제 업무·서비스·고객 예약 캡처와 다시 대조했다. 사용자 최종 디자인/동선 인수·실 인증 공급사·정식 QA/G는 남아 C03/A00/F00 `in_progress`다.

## 최신 C03/F-O12 AP 연결 FAQ 선택 화면 (2026-09-26)

Field 승인 FAQ가 AP 별도 출처 검토·owner 승인·선택·지식 공개·재진입까지 이어지는 실제 양방향 연결 브라우저 최종 1/1. 1440px에서 늘어난 시작 카드와 320px 44px 미만 버튼을 확인해 AP 연결 화면의 카드/버튼/FAQ 문답을 정리했다. 버튼 높이 0/1 red→새 mock **27712** 최종 1/1, 320px 가로 넘침·pageerror 0, 1440px 시작 카드 높이<500px. `/tmp/field-ap-faq-{320,1440}.png` 시각 확인, AP web typecheck·전체 lint·diff 검사 exit 0. 기존 FAQ 기능의 제품별 원장/권한은 유지하고 API/DB/계약 변경 없음. 사용자 최종 인수·정식 QA/G·실 공급사는 남아 C03/F-O12 `in_progress`다. 이전 최초 Git 저장은 `3446330`이다.

## 최신 C03/F-O12 승인 FAQ 공개·연결 (2026-09-26)

Field 사업 정보에 질문·답변 초안 입력/자동 저장/충돌 비교·명시 승인을 추가했다. 승인 전 문답은 비공개, 승인본은 공개 사이트의 FAQ 섹션과 Field `field.facts.read` preview.8에만 포함된다. 사이트는 공개 당시의 승인 카탈로그를 유지하고 이후 개정은 stale로 표시한다. AP는 Field 공개 문답을 정규화해 별도 source 검토 원장에 저장하고, AP 사업자가 FAQ 선택·지식 공개·AI 버전 승인을 거쳐 상담 근거로 쓴다. 기존 릴리스/클라이언트의 FAQ 누락은 빈 배열로 읽는다. 계약 red→1/1, Field 격리 DB red→5/5, AP 격리 DB red→1/1, Field 실제 320px 전체 브라우저 red→최종 1/1 두 차례(FAQ와 기존 문의·예약), 320/1440px 캡처·가로 넘침 0, 양 API build/양 웹 typecheck/lint exit 0. mock **47796** 양제품 build/ready. AP 선택 화면 실브라우저·사용자 최종 인수·정식 QA/G·실 공급사는 미실행이며 C03/F-O12 `in_progress`. DB migration·Git 커밋 없음.

## 최신 C03/F-O08 Field 오늘 유형별 처리 항목 (2026-09-26)

시안 v3 `owner/today`에는 `모두/답변 필요/예약 요청` 탭이 있으나 실제 Today에는 없었다. 직접 문의 1건이 있는 실제 320px 브라우저에서 버튼 부재 0/1 red를 확인하고, Field 직접·AP 전달 문의/예약의 정상 조회 후보를 유형별로 필터한 뒤 최신 6건을 표시했다. 탭별 건수/페이지 잔여 `+`, 빈 상태와 기존 상세 이동을 연결했다. 실제 문의 단계와 예약 접수 뒤 탭 전환을 포함한 Field 사업자→고객 전체 브라우저 최종 1/1, `/tmp/field-today-filter-320.png` 시안 대조·가로 넘침 0, Field web typecheck·전체 lint exit 0. mock **98099** 양제품 migration/build/ready·네 HTTP 200. AP 전체 브라우저/사용자 최종 인수·정식 QA/G·외부 공급사는 이 변경 뒤 미실행, C03/F-O08 `in_progress`; API/DB/계약·커밋 변경 없음.

## 최신 C03/F-O08/F-O10 Field 오늘 일정 (2026-09-26)

시안 v3 `owner/today`의 날짜별 일정과 달리 기존 Field 오늘 화면은 전체 확정 예약 수만 표시해 수동 일정이 빠졌다. 실제 오늘 수동 일정 1건 저장 시 기존 카드 0건인 320px red를 확인하고, 예약 정책 시간대의 오늘을 Field 주간 달력 API에서 읽어 확정 예약·전화 예약·수동 시간 차단을 카드/시간순 목록에 표시했다. 직접 추가는 기존 수동 일정 dialog, 예약 항목은 상세로 연결한다. 달력 503은 0건 대신 `—`/재시도다. 320px 실제 캡처 `/tmp/field-today-schedule-320.png` 시안 대조·가로 넘침 0, Field 실제 전체 사업자→고객 브라우저 최종 1/1(오늘 수동 일정 1→삭제 0, 장애 복구, 미래 확정 예약 0, 기존 사이트·문의/두 예약). Field web typecheck·전체 lint exit 0, mock **94263** 양제품 migration/build/ready·네 HTTP 200. AP 전체 브라우저/사용자 최종 인수·정식 QA/G·외부 공급사는 이 변경 뒤 미실행, C03/F-O08/F-O10 `in_progress`; API/DB/계약·커밋 변경 없음.

## 최신 C03/F-O08 Field 홈페이지 공개 상태 분리 (2026-09-26)

시안 v3 오늘의 `내 사이트 · 공개 중`을 실제 사이트 공개본으로 확인하도록 고쳤다. 기존에는 사업 정보 승인만으로 홈페이지가 공개됐다고 잘못 표시했다. 카탈로그와 사이트 조회를 따로 수행해 승인 버전/서비스/예약은 카탈로그, 오늘·AI/사이트 카드·상단 사이트 링크는 실제 사이트 공개 상태를 사용한다. 각 GET 503은 `확인 불가`/재시도이며 승인 상태를 확인하지 못한 경우 중복 승인 버튼을 비활성화한다. 320px 브라우저 승인 직후 잘못된 공개 표시 0/1 red→최종 Field 실제 사업자→고객 전체 1/1(공개 전/후·두 503→복구·비회원 문의/두 예약), Field web typecheck·전체 lint exit 0. mock **40396** 양제품 migration/build/ready·두 API `/health/ready`·두 웹 `/workspace` HTTP 200. AP 전체 브라우저/사용자 최종 인수·정식 QA/G·외부 공급사는 이 변경 뒤 미실행, C03/F-O08 `in_progress`; API/DB/계약·커밋 변경 없음.

## 최신 C03/F-O08 Field 오늘 알림 조회 실패 (2026-09-26)

Field 알림 GET 503에서 오늘 화면이 오류를 알리지 않고 정상 빈 업무처럼 `첫 문의를 기다리고 있어요`라고 표시하는 문제를 320px 브라우저 red로 확인했다. 알림 실패는 오늘 회복 안내와 `업무 알림 다시 확인`으로 복구하고, 문의/예약 숫자는 각 원장의 정상 조회 상태대로 유지한다. 빈 업무 문구는 관련 원장 조회가 모두 완료된 때에만 표시한다. 최종 외부 문의·예약·알림 각각 503→200 복구 320px 검사 exit 0, Field 실제 사업자→사이트 공개→비회원 문의/두 예약 브라우저 1/1, Field web typecheck·전체 lint exit 0, mock **7851** 양제품 migration/build/ready·두 API `/health/ready`/두 웹 `/workspace` 200. 실제 발송 공급사·사용자 최종 인수·정식 QA/G는 미실행이며 C03/F-O08 `in_progress`; API/DB/계약·커밋 변경 없음.

## 최신 C03/A02/F-O08 열린 사업자 작업실의 오늘 재조회 (2026-09-26)

사업자 작업실을 열어 둔 뒤 다른 고객이 문의를 제출해도 AP/Field의 오늘 메뉴가 기존 0건 화면만 다시 보여주던 문제를 두 제품 320px 실제 브라우저 red로 확인했다. 오늘 진입 때 AP는 자기 문의·처리 알림, Field는 자기 직접 문의·AP 전달 요청·직접 예약·내부 알림을 각 제품 GET으로 재조회한다. mock **76683** 양제품 migration/API·웹 build/ready, 두 API `/health/ready`/두 웹 `/workspace` HTTP 200, `pnpm typecheck`·`pnpm lint` exit 0, AP/Field 전체 사업자→고객 브라우저 각 1/1(열린 탭 새 문의·Field 새 직접 예약 1건/고객 이름과 기존 상세/예약 흐름). 사용자 디자인/동선·최종 인수, 장기 대기/푸시·실 공급사·정식 QA/G는 미실행이며 C03/A02/F-O08 `in_progress`. API/DB/계약 변경·Git 커밋 없음.

## 최신 C03/A02 AP 오늘 실제 고객 문의·조회 실패 (2026-09-26)

AP 실제 고객 문의가 오늘 집계에는 1건이나 `지금 확인할 일`에는 알림 제목만 보여 고객/서비스를 알 수 없는 차이를 320px 실제 브라우저에서 red로 확인했다. 이제 AP owner 원장의 `needs_owner` 최근 최대 6건을 고객/서비스/출처와 함께 표시하고 기존 상세로 연다. 알림은 AP 별도 알림 화면에 유지한다. 문의·알림 GET은 loading/failed/ready를 구분해 503에서 거짓 첫 문의/읽지 않음 0건을 표시하지 않고 재시도한다. AP/Field 업무 제목이 320px에서 서비스명을 줄임표로 가리는 것도 양제품 red→줄바꿈 green으로 수정했다. 최종 mock **65366** 양제품 migration/build/ready·두 API `/health/ready`/두 웹 `/workspace` HTTP 200, AP/Field 실제 사업자→고객 전체 브라우저 각 1/1, 두 제품 부분 조회 503→재시도 검사 exit 0, AP web typecheck·전체 lint exit 0. 시안의 단일 역할 계정/Field 예약은 AP에 넣지 않았다. 사용자 시각·동선/최종 인수와 전체 접근성·정식 QA/G·실 공급사는 미실행, C03/A02 `in_progress`; Git 저장소/커밋 없음.

## 최신 C03/F-O08 Field 오늘 실제 처리 항목·장애 복구 (2026-09-26)

시안 v3 `owner/today`와 실제 1440px Field 화면을 대조했다. `지금 확인할 일`이 알림 이력만 보여 실제 고객 문의를 찾기 어려운 차이를 확인하고, Field 직접 문의·AP 전달 요청·Field 직접 예약의 확인 필요 항목을 최근순 최대 6건 표시해 기존 상세로 연결했다. 내부 테스트·조회 실패한 출처의 캐시는 이 목록에서 제외한다. 문의/예약 필수 GET 중 일부가 실패하면 카드에 0건/이전 숫자 대신 `—`와 재시도를 표시하며, 조회 완료 전에는 `첫 문의를 기다리고 있어요`라고 단정하지 않는다. 320px 실제 브라우저에서 이름 누락·503의 잘못된 0건/빈 문구 red→최종 green, Field 전체 사업자→사이트 공개→비회원 문의/두 예약 브라우저 1/1, 320px 가로 넘침 0. Field web typecheck·전체 lint exit 0, mock **85881** 양제품 migration/build/ready·두 API `/health/ready`/두 웹 `/workspace` HTTP 200. 사용자 시각/동선·최종 인수, 실 공급사·정식 QA/G는 미실행이고 C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 C03 실제 화면 글자 크기·확대 근사 점검 (2026-09-26)

AP/Field 실제 사업자 경로에서 13.3px 선택 입력을 발견해 공통 폼 선택 입력을 16px로, Field 고객 대화의 13px 보조 문구를 14px로 조정했다. 새 mock **92540** 양제품 migration/build/ready, 실제 AP/Field 사업자 주요 경로와 비저장 검토본 52개 URL의 320/390px·CSS zoom 2 근사에서 표시 글자 <14px·텍스트 입력 <16px·문서 가로 넘침 0, 실제 사업자 경로의 pageerror 0을 확인했다. `pnpm lint`·`pnpm typecheck` exit 0. 실제 브라우저 200% 줌, 스크린리더/전체 키보드 및 사용자 디자인·동선·최종 인수 검수는 미실행이며 C03 `in_progress`다. Git 저장소/커밋 없음.

## 최신 C03/A02/F-O09 오래된 문의 재개 노출 (2026-09-26)

AP/Field 사업자 직접 문의 목록을 최근 활동 시각·ID 키셋으로 정렬한다. 원래 접수 시각은 유지하고 최근 활동 시각을 목록에 표시한다. Field의 새로고침 성공은 첫 100건을 서버 응답으로 교체한다. 각 제품 신규 index migration `000060`/`000054`를 적용했다. 과거 접수 103건의 마지막 문의에 새 활동을 만든 격리 DB 검사는 AP/Field 각각 20/21 red→21/21 green이고 100+3 탐색·계정 범위 커서는 유지됐다. 전체 lint/typecheck, AP/Field 웹 unit 10/10·14/14 exit 0. 새 mock **92325** 양제품 migration/build/ready·API/웹 HTTP 200, 실제 320px AP/Field 사업자→고객 브라우저 각 1/1. 103건 실제 UI 조작·전체 접근성/정식 QA/G·사용자 최종 인수/실 공급사는 미검수로 관련 Task `in_progress`, 외부는 `blocked_integration`이다. Git 저장소/커밋 없음.

## 최신 C03/F-O09 Field 직접 문의 처리 완료·고객 재개 (2026-09-26)

시안 v3 사업자 문의함의 `처리 완료`를 Field 직접 문의 원장·권한 API·화면에 연결했다. owner/editor만 자기 조직 직접 문의를 revision 조건으로 완료하며 중복은 한 사건으로 수렴한다. 고객은 기존 확인키로 완료 원문을 읽고 질문을 추가해 `needs_owner`로 재개한다. 완료·재개 사건은 Field 전용 migration `000053`과 한 건/조직 내보내기에 보존하고 완료 자체로 발송하지 않는다. 격리 Field DB 20/21 red→21/21 green, Field web unit 14/14·전체 lint/typecheck exit 0. mock **18991** 양제품 migration/build/ready·API/웹 200, 실제 320px 전체 사업자→고객 브라우저 1/1에서 완료 POST 응답 분실→상태 재조회·고객 재개, 두 예약 방식과 조건 재확인을 확인했다. 320/1440px 완료 화면을 시안과 대조했고 320px 가로 넘침 0이다. 사용자 최종 인수·전체 접근성/정식 QA/G·실 공급사는 미검수로 C03/F-O09 `in_progress`, 공급사 `blocked_integration`이다. Git 저장소/커밋 없음.

## 최신 C03/A02 AP 문의 처리 완료·고객 재개 (2026-09-26)

시안 v3 사업자 문의함의 `처리 완료`를 AP 인증 API/DB/화면에 연결했다. revision을 비교해 오래된 완료 요청을 거절하고 동일 요청 중복은 한 사건으로 수렴한다. 고객은 기존 확인키로 원문을 읽고 추가 질문을 보내 `needs_owner`로 재개한다. 사건은 migration `000059`와 한 건/조직 내보내기에 보존하며 완료 자체는 고객 발송을 만들지 않는다. 격리 AP DB 20/21 red→21/21 green, AP 웹 단위 10/10·전체 lint/typecheck exit 0. mock **87846** 양제품 migration/build/ready와 AP/Field API·웹 HTTP 200, 실제 320px 사업자→고객 브라우저에서 완료 ACK 유실→상태 재조회·고객 재개→사업자 조회 1/1, 320/1440px 시안 캡처 대조·320px 가로 넘침 0. 전체 접근성/정식 QA/G·사용자 최종 인수·외부 공급사는 미검수로 C03/A02 `in_progress`, 공급사 `blocked_integration`이다. Git 저장소/커밋 없음.

## 최신 C03/A02 AP 문의함 동의된 AI 이력·유입 출처 (2026-09-26)

시안 v3의 `AI` 탭을 접수 후 동의된 AP 문의의 AI 답변 이력 필터로 구현했다. 익명 AI 세션·외부 업무 직접 준비의 원문은 사업자에게 노출하지 않는다. 목록/상세의 실제 AP 배포 출처와 AI 배지를 연결했다. AP 격리 DB 19/21 red→21/21 green, AP 웹 단위 10/10·전체 lint/typecheck exit 0. 새 mock **66320** 양제품 build/ready·양 API/웹 HTTP 200, 합성 Chromium AI 필터/출처·100→103/503 복구·320px 초점/가로 넘침 0, 실제 AP 링크/외부 위젯→고객 문의/사업자 답변·출처/재열람 1/1. 정식 QA/G·실모델/공급사·사용자 최종 테스트는 남아 C03/A02 `in_progress`, 실 외부 연동 `blocked_integration`이다. Git 저장소/커밋 없음.

## 최신 C03/A02 AP 사업자 문의함 시안·100건 이후 탐색 (2026-09-26)

AP 직접 문의함을 시안 v3의 2단 목록·대화와 모바일 목록↔상세로 정리하고 실제 AP 원본의 검색·상태 필터·답변/메모, 100건 이후 계정 범위 키셋 탐색·실패 재시도를 연결했다. 대량 동시각 DB red→21/21 green, AP 웹 10/10·전체 unit/lint/typecheck exit 0. mock **78359** 양제품 build/ready·양 API/웹 200, 합성 Chromium 100→103·두 종류 503 복구·320px 초점/가로 넘침 0/pageerror 0, 실제 사업자→상담 링크·외부 위젯→고객 문의/사업자 답변·재열람/내보내기 1/1. 기존 구 화면 단위/브라우저 검사는 실제 시안형 UI 요소로 갱신해 최종 통과했다. 사용자 최종 테스트·실 공급사/대량 저장 E2E·전체 접근성/정식 QA/G는 남아 C03/A02 `in_progress`, 공급사 `blocked_integration`이다. Git 저장소/커밋 없음.

## 최신 C03/F-O09 Field 문의함 직접·AP 전달 페이지 탐색 (2026-09-26)

최근 C03/F-O09 Field 문의함 직접·AP 전달 100건 이후 탐색(2026-09-26): Field owner 직접 문의/AP 전달 문의 GET에 조직·목록 종류를 묶은 마이크로초 키셋 페이지를 추가하고, 시안 v3 문의함에서 각 출처별 이전 항목·503 재시도/기존 목록 보존을 연결했다. 모바일 상세 제목 줄바꿈과 다른 계정 목록 초기화도 보완했다. 격리 Field DB red→21/21 green, Field API build·web typecheck/변경 ESLint·unit 14/14, 최신 mock **27863** 양제품 build/ready·양 API ready. 합성 Chromium 직접/AP 100→103/첫 503 복구·오래된 상세/모바일 초점·320px 가로 넘침 0·pageerror 0, 기존 예약 100→103 스모크 exit 0. 실제 저장 대량 흐름·전체 접근성/정식 QA/G·사용자 최종 테스트는 남아 C03/F-O09 `in_progress`다.

## 최신 C03/F-O09·QA57/119 Field 모바일 문의함 초점 이동 (2026-09-26)

최근 C03/F-O09·QA57/119 Field 모바일 문의함 초점 이동(2026-09-26): 320px에서 예약·직접 문의·AP 전달 목록을 열면 대화 뒤로 버튼, 복귀하면 이전 항목(없으면 검색)에 초점을 둔다. 기존 시안 v3의 목록↔대화 구조를 유지하고 데스크톱 초점은 건드리지 않는다. 합성 Chromium 복귀 초점 부재 red→두 스모크 exit 0(예약 100→103/503 재시도, 세 출처 초점, 320px 가로 넘침 0·pageerror 0). Field web typecheck·변경 ESLint exit 0, unit 14/14, 최신 mock **88115** 양제품 build/ready·양 API ready. 전체 200%/스크린리더/키보드 경로·정식 QA/G·사용자 최종 테스트는 남아 `in_progress`다.

## 최신 C03/F07·F-O09 Field 예약 목록 페이지 탐색 (2026-09-26)

최근 C03/F07·F-O09 Field 예약 목록 100건 이후 탐색(2026-09-26): owner 예약 GET에 조직 범위 100건 키셋 페이지/`nextCursor`를 추가하고 PostgreSQL 마이크로초 접수 시각을 보존한다. 문의함·예약 관리의 이전 예약/실패 재시도와 시안 v3의 내부 목록 스크롤을 연결하고 부분 집계는 `+`로 표시한다. 격리 Field DB 처음 19/20 red→최종 20/20, Field API/web build, Field web unit 14/14·typecheck·변경 ESLint exit 0. 최신 mock **48138** 양제품 build/ready·양 API ready; 합성 Chromium 문의함 100→103/503 재시도·103번째 상세, 예약 관리 100→103, 320px 가로 넘침 0·pageerror 0; 기존 문의함 스모크 exit 0. 실제 저장 예약 전체 E2E·정식 QA/G·사용자 최종 테스트는 남아 C03/F07/F-O09 `in_progress`다.

## 최신 C03/F07·F-O09 Field 사업자 문의함 예약 대화 (2026-09-26)

시안 v3의 사업자 문의함에서 Field 직접 예약을 고객 문의·AP 전달과 함께 목록으로 찾고 원문/추가 메시지에 답변할 수 있게 했다. 예약 결정은 기존 예약·일정 처리 화면으로 연결하며 AP 출처 원본은 Field 직접 대화로 복제하지 않는다. 예약 목록·상세 503은 빈 상태가 아닌 재시도이며 고객 추가 메시지 알림은 해당 문의함 대화로 연다. 합성 Chromium 부재 red→구현 green: 1440/320px 목록/상세 장애 복구, 답변 POST 응답 분실 뒤 GET 원본 확인 1건, AP 예약 제외·모바일 목록 복귀·예약 관리·알림 이동, 가로 넘침 0·pageerror 0. 기존 직접 문의/AP 전달 문의함 스모크 exit 0, Field 웹 unit 14/14·typecheck·변경 ESLint exit 0, 최종 mock **15330** 양제품 build/ready·양 API ready. 실제 예약 전체 E2E/최근 100건 밖 탐색, 200% 확대·접근성/보안·정식 QA/G·사용자 최종 검수는 남아 C03/F07/F-O09 `in_progress`다. Git 저장소/커밋 없음.

## 최신 C03/F07 Field 직접 예약 추가 대화 (2026-09-26)

시안 v3의 고객 예약 추가 메시지/사업자 답변을 Field 전용 원장·고객 확인키/사업자 조직 권한 API·알림 outbox·사용량·한 건/전체 내보내기와 연결했다. AP 출처 예약 대화는 AP 원본이며 Field 메시지 API는 거절한다. 고객/사업자 양쪽 화면에서 원문을 읽고 답변하며, 고객 응답 유실·새로고침은 같은 ID로 대조/재시도한다. UUID 검사식과 기존 외부 요청 알림 audience 누락은 실패를 재현한 뒤 수정했다. 격리 Field DB 19/19, 복구 단위 1/1, Field web typecheck·변경 ESLint exit 0, 최신 mock **61671** 양제품 migration/build/ready·양 API ready. 합성 Chromium 고객 1440/320px의 3 POST/응답 유실·GET 503→새로고침 복구·AP 출처 분리와 사업자 답변 1 POST에서 가로 넘침 0·pageerror 0. 외부 알림 공급사·전체 E2E/보안/정식 QA/G·사용자 최종 테스트는 남아 C03/F07 `in_progress`, 공급사 `blocked_integration`다. Git 저장소/커밋 없음.

## 최신 C03/F07 Field 고객 예약 후속 상태·제안 화면 (2026-09-26)

시안 v3 예약 대화의 1440/320px과 실제 Field 화면을 대조해, 고객 확인키 GET에서 접수 당시 승인 사업장명을 반환하고 카드 제목·상태·요청/접수 가격·제안·실제 예약 사건을 표시한다. 제안 동의는 기존 revision API에 연결하며 수락과 사업자 최종 확정을 구분한다. 확인키/사진/조건 재검수/변경·취소/알림 경로는 접이식 관리에서 유지한다. Field web typecheck·변경 ESLint, `pnpm test:db:field` 19/19, mock **13041** 양제품 build/ready·양 API ready exit 0. 합성 Chromium 제안 POST 200/409·신청/확정 상태 320px에서 가로 넘침 0·pageerror 0, 1440/320px 캡처를 시안과 비교했다. 예약 안 추가 자유 메시지는 이 단계 뒤 위 최신 단계에서 구현했다. 실제 고객 예약 전체 E2E/보안·정식 QA/사용자 최종 테스트는 남아 C03/F07 `in_progress`다. Git 저장소/커밋 없음.

## 최신 C03/F05·F06 Field 고객 후속 문의 대화 (2026-09-26)

시안 v3 고객 대화의 1440/320px과 현행 Field 화면을 대조했다. 확인키 인증 Field 문의 GET에서 접수 당시 승인 카탈로그의 사업명·조직 ID를 반환하고 헤더·대화 제목에 표시한다. 접수 ID/연락처 미인증·짧은 상태 배지와 기존 고객/사업자 메시지·추가 질문·사진/복구 경로를 유지한다. Field API build·web typecheck·변경 ESLint exit 0, 격리 PostgreSQL 17 `pnpm test:db:field` 19/19(미승인 이름 변경 뒤 승인 당시 이름 유지 포함). 최종 mock **30112** 양제품 build/ready·양 API ready, 시안/합성 대화 1440/320px 비교에서 320px 가로 넘침 0·pageerror 0·배지 한 줄 표시를 확인했다. 전체 E2E/보안·사용자 최종 검수는 미실행, C03/F05/F06 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/F05·F07 Field 고객 접수 완료·후속 진입 (2026-09-26)

시안 v3 `customer/success`와 문의 완료 화면의 1440/320px 이미지를 대조해, 문의·예약의 실제 접수 응답 뒤 독립 완료 카드에 서버 접수 ID·확인키·후속 경로를 표시했다. 예약 미확정과 알림 원장의 실제 상태를 구분한다. 같은 탭 이동에는 2분 만료·1회 소비되는 세션 확인키를 사용해 Field 원본 GET을 실행하며, 키를 URL에 넣거나 전화번호만으로 열지 않는다. 수동 확인키 입력과 사진 첨부 중 이동 차단/실패 재시도도 남아 있다. Field web typecheck/변경 ESLint exit 0, 최종 mock **30112** 양제품 migration/build/ready·양 API ready. 합성 문의/예약 POST 201/503의 Chromium 1440/320px, 320px 사진 첨부 지연→이동 차단→503 재시도, 후속 Field GET·세션 키 삭제에서 exit 0·가로 넘침 0·pageerror 0. 실제 DB 저장/권한·전체 E2E/보안·정식 QA·사용자 최종 테스트는 미실행; C03/F05/F07 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/F07 Field 고객 희망시간 예약 입력 (2026-09-26)

시안 v3 고객 예약의 날짜·시간대 선택을 Field 희망시간 제출형에 추가하고 기존 자유 입력도 보존했다. 입력은 서버의 기존 `preferredTimeText` 계약으로 전달하며, 시간표형 가능 시간 조회·사업자 확정 전 미점유는 변경하지 않았다. 우측 고객 요약에 현재 희망 시간을 표시한다. Field web typecheck/변경 ESLint exit 0, 최종 mock **43869** 양제품 migration/build/ready·양 API ready. 합성 승인 카탈로그/예약 POST 503의 Chromium 1440/320px에서 날짜+시간대 요청 1회·320px 자유 입력 원문 요청 1회, 요약·가로 넘침 0·pageerror 0. 실제 저장/확정·전체 E2E/DB/보안·정식 QA·사용자 최종 테스트는 미실행, C03/F07 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/A02/A05 AP 고객 상담 링크 시안 정합 (2026-09-26)

AP 상담 링크를 시안 v3 `agent/chat`의 사업자 헤더·중앙 채팅 카드·질문 입력·사람 문의 동선으로 정리했다. 빠른 질문은 서버가 공개한 승인 FAQ만 쓰며 누르면 즉시 AI 질문을 제출하고, 문의 사진은 연락처·내용을 받는 양식 안에 배치했다. 기존 AP AI 결과 미상 복구·안전 접수·선택적 Field 요청은 유지한다. AP web typecheck/변경 ESLint exit 0, 최종 mock **28386** 양제품 migration/build/ready·양 API ready. 합성 승인 지식/AI 공급사 503의 Chromium 1440/320px에서 FAQ 선택→AI 질문 POST 1회·공급사 503 때 초안 보존·사람 문의 앵커·사진 입력·가로 넘침 0·pageerror 0을 확인했다. 실제 AI/문의 제출·전체 E2E/DB/계약/보안·정식 QA·사용자 최종 테스트는 미실행, C03/A02/A05 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/F09 Field 관리자 화면 시안 정합 (2026-09-26)

Field 관리자 집계/사건/감사 화면을 시안 v3 관리실 구조로 정리했다. Field 실제 사업체·문의·예약·사이트/제작·알림 사건 지표만 표시하고, 데스크톱 사이드 메뉴와 모바일 하단 운영/제작/발송/감사·더보기 사업체/구독을 연결했다. Field 제품별 인증·권한·추가 인증 차단과 고객 원문 비노출을 유지한다. 양제품 web typecheck·두 변경 TSX ESLint exit 0, 최종 mock **6199** 양제품 build/ready·양 API ready. 합성 관리자 GET의 Chromium 1440/320px에서 Field 제작/감사/사업체 이동·가로 넘침 0·pageerror 0, 실제 비인증 로그인 요구. 최종 빌드의 AP 관리자 합성 화면도 재확인했다. 합성 UI는 실제 관리자 권한/DB 검사가 아니며 전체 관리자/DB/보안·정식 QA/사용자 인수 테스트는 미실행, C03/F09 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/A10 AP 관리자 화면 시안 정합 (2026-09-26)

AP 관리자 집계/사건/감사 화면을 시안 v3의 관리실 사이드 메뉴·카드 구조로 정리했다. 320px에는 운영/AI/발송/감사 하단 메뉴와 조직/구독 더보기를 연결했다. 기존 인증·권한·추가 인증 차단, 실제 AP 집계/감사 API 및 고객 원문·연락처 비노출 원칙은 유지한다. AP web typecheck/변경 ESLint exit 0, 최종 mock **31228** 양제품 build/ready. 합성 관리자 GET 응답의 Chromium 1440/320px에서 집계·사건·감사/조직 이동·가로 넘침 0·pageerror 0, 실제 비인증 로그인 요구를 확인했다. 합성 UI 응답은 실제 관리자 권한/DB 증거가 아니다. 전체 관리자/DB/보안·정식 QA·사용자 인수 테스트는 미실행, C03/A10 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/D01~D04 AP 제휴 매체 시안 정합 (2026-09-26)

시안 v3의 매체 현황·노출 위치·배치 승인·집계 성과·매체 설정을 AP 매체 관리실의 5개 화면으로 배치했다. 기존 AP 조직/도메인/위치/배치/성과 API와 매체 권한을 유지한다. 활성 배치는 승인·공개 가능·설치를 모두 충족할 때만 세고, 독자 미리보기는 실제 해당 배치의 승인 카드만 연다. 모바일 320px에서 5개 메뉴를 모두 볼 수 있다. AP web typecheck/변경 ESLint·기존 매체 복구/집계 브라우저 스크립트 Python 구문 exit 0, 최종 mock **97778** 양제품 build/ready·양 API ready. 신규 mock 계정/매체 조직의 1440/320px에서 조직 생성·5개 메뉴·노출 위치/배치 빈 상태/집계 이동·가로 넘침 0·pageerror 0을 확인했다. 실제 DNS/배치 승인/외부 기사/성과·전체 E2E/DB/계약/보안·정식 QA·사용자 인수 테스트는 이 변경 뒤 미실행, C03/D01~D04 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/F01/F08 Field 설정·구독 시안 정합 (2026-09-26)

시안 v3 `owner/settings`의 2열 카드·사업체 요약으로 Field 설정 화면을 정리했다. 데스크톱 설정·구독과 모바일 더보기는 같은 화면을 열고, 사이트·서비스·예약 정책·직접 문의·AP 상담 연결·알림·구독/운영 데이터·사용량은 실제 경로로 이동한다. 사업 정보 초안/승인 상태와 로그아웃을 요약 카드에 배치했다. Field web typecheck/변경 ESLint·기존 Field 브라우저 스크립트 2개 Python 구문 exit 0, 최종 mock **64331** 양제품 build/ready·양 API ready. 실제 신규 mock 조직 Chromium 1440/320px에서 8개 카드·정책 펼침·서비스/구독 이동·가로 넘침 0·pageerror 0이다. 깊은 업무 흐름·전체 E2E/DB/계약/보안·정식 QA·사용자 인수 테스트는 미실행, C03/F01/F08 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/F08 Field 사업자 알림 시안 정합 (2026-09-26)

시안 v3의 사업자 알림/고객 답변 알림/업무 이벤트 카드로 구성했다. 실제 Field owner 알림 원장 최근 100건·읽음 API를 연결하고 로딩/조회 실패/빈 이력을 분리했다. 외부 카카오·푸시·수신 번호는 공급사·저장 경로 미연결이므로 비활성 사유를 표시하며 발송 완료로 보이지 않는다. Field web typecheck/변경 ESLint exit 0, 최종 mock **60270** 양제품 build/ready. 실제 빈 mock 조직 1440/320px와 합성 알림 목록 503→재시도 복구를 320px에서 확인했고 가로 넘침 0·pageerror 0이다. 실제 이벤트 열기/읽음·공급사 설정/발송·전체 E2E/DB/계약/보안·정식 QA/사용자 인수 테스트는 미실행이다. C03/F08 `in_progress`, 공급사 `blocked_integration`, Git 저장소/커밋 없음.

## 최신 C03/F01 Field 사업자 서비스 시안 정합 (2026-09-26)

사업자 서비스 화면을 최신 시안 v3의 카드 중심으로 정리했다. Field 서버 초안의 서비스 이름·설명·소요시간·가격·예약 방식과 승인 전/후 상태를 표시하며, 추가·수정 버튼은 실제 저장·승인 폼으로 이동한다. 신규 조직의 첫 사업 정보 입력은 바로 열고, 재방문에는 카드부터 보인다. 정책 버튼은 예약·일정의 영업시간/예약 입력을 연다. Field web typecheck/변경 ESLint exit 0, 최종 mock **79824** 양제품 build/ready. 실제 새 mock 사업자의 1440/320px에서 서비스 추가→서버 초안 저장→새로고침 카드 재표시·수정 입력/정책 이동, 320px 가로 넘침 0·pageerror 0을 확인했다. 실제 서비스 승인→고객 사이트/예약 조건 반영과 전체 E2E/DB/계약/보안·정식 QA/사용자 인수 테스트는 이번 변경 뒤 미실행이다. C03/F01 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/F05/I05 Field 사업자 문의함 실제 목록·상세 (2026-09-26)

시안 v3의 한 목록·대화 상세 구조에 Field 직접 문의/AP 전달 요청을 출처별로 묶어 표시한다. 고객·서비스·요약 검색, 확인 필요/AP 필터, 직접 답변/비공개 메모 전환, 320px 상세→목록 복귀를 연결했다. 원본 조회/답변은 각 제품의 기존 API와 권한을 쓴다. 데이터가 있는 최신 시안 화면과 목록 너비·출처 안내를 대조했다. Field web typecheck/변경 ESLint exit 0, 최종 mock **69685** 양제품 build/ready. 합성 두 출처 응답을 사용한 1440/320px 화면 점검에서 상세/필터/검색/복귀·가로 넘침 0·pageerror 0, 실제 빈 mock 조직의 320px 빈 상태·가로 넘침 0·pageerror 0을 확인했다. 합성 응답 점검은 실제 문의 저장·전달/권한 검사가 아니다. 실제 문의→답변과 전체 E2E/DB/계약/보안·정식 QA/사용자 인수 테스트는 미실행이다. C03/F05/I05 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/F05/I05 Field 사업자 문의함 시안 정합 (2026-09-26)

사업자 문의 메뉴의 빈 상태를 시안 v3의 제목·접수 카드·다음 행동으로 정리했다. 승인 전에는 사이트 준비, 승인 후에는 실제 고객 문의 링크로 이어진다. 문의가 있으면 Field 직접 문의와 AP 전달 문의를 원본·권한 경계에 따라 별도 카드/상세로 유지한다. 두 목록이 모두 정상 조회되어야 빈 상태를 표시하고, 실패한 출처에는 오류와 재시도를 보여준다. Field web typecheck/변경 ESLint exit 0, 최종 mock **45818** 양제품 build/ready, 1440px 시안 이미지와 실제 빈 화면 대조·320px 가로 넘침 0·pageerror 0. 합성 AP 목록 503을 주입한 320px 브라우저에서 빈 상태 미표시→재시도 복구를 확인했다. 실제 문의 제출/답변·실제 AP 장애·두 출처 동시 화면/전체 E2E·정식 QA/사용자 인수 테스트는 미실행이다. C03/F05/I05 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/F07 Field 예약·일정 시안 정합 (2026-09-26)

시안 v3의 사업자 예약 화면을 일자별 일정 카드·날짜 이동/입력·확인할 요청으로 맞추고 Field 예약/수동 차단 원장을 읽는 owner API를 연결했다. 미확정 요청은 일정 점유로 표시하지 않는다. 수동 일정 버튼은 실제 등록 모달, 요청 카드는 기존 처리 상세로 이동한다. 기존 정책·예약 처리 기능은 유지했다. Field API build·web typecheck/변경 ESLint·브라우저 스크립트 Python 구문 exit 0, 최종 mock **95034** 양제품 build/ready. 승인된 mock 계정 API 200/잘못된 기간 400, 수동 차단 201→조회 1건→320px 화면 표시, 최종 320px 모달 등록→일자 일정 표시·가로 넘침 0·pageerror 0, 1440px 시안 대조를 확인했다. 실제 고객 예약→확정·전체 E2E/DB/계약/보안·정식 QA/사용자 인수 테스트는 미실행이다. C03/F07 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/F05 Field 직접 문의 이용 장소 (2026-09-26)

공개 직접 문의에 시안의 선택 지역·이용 장소를 추가하고 Field 원장/공개 POST·확인키 고객/사업자 조회·한 건/전체 JSON export에 연결했다. 장소를 비운 구형 제출은 기존 멱등 해시와 호환한다. migration 000050, Field API build·web typecheck/변경 파일 ESLint exit 0, 최종 mock **45302** 양제품 migration/build/ready. 실제 승인 카탈로그의 Chromium 320px 문의 입력·가로 넘침 0·pageerror 0. 실제 제출/저장·권한/내보내기·전체 E2E·정식 QA는 이번 변경 뒤 미실행이다. C03/F05 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/F07 Field 예약 요청 내용·지역·사진 (2026-09-26)

기준 시안의 예약 요청 내용과 선택 지역/이용 장소를 Field 전용 예약 원장·공개 POST·고객/사업자 상세·한 건/전체 내보내기에 연결했다. 공개 폼은 요청 내용을 필수로 받고 기존 API 형식의 재시도 해시는 유지한다. 예약 사진은 별도 Field 비공개 원장과 확인키/사업자 권한 API로 최대 5장(장당 8MiB)을 WebP 정규화해 저장하도록 구현했다. 고객 제출/확인키 화면의 순차 첨부·남은 사진 재시도, 사업자/고객 사진 열람 및 export도 연결했다. Field migration 000048·000049, Field API build·web typecheck/ESLint·브라우저 스크립트 Python 구문 exit 0, 새 mock **97897** migration·양 API/웹 build·ready와 네 URL HTTP 200. Chromium 320px 승인 카탈로그에서 새 필드·5장 미리보기/6장 거절·가로 넘침 0·pageerror 0. 실제 예약 제출·사진 POST/권한/재시도/내보내기·DB/계약/보안·전체 E2E·정식 QA는 미실행이다. C03/F07 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/F05 Field 문의 사진 최대 5장 (2026-09-26)

기준 시안의 사진 최대 5장 선택을 공개 직접 문의와 확인키 후속 대화에 적용했다. 각 파일 8MiB 한도와 로컬 썸네일, 순차 비공개 업로드, 부분 성공/응답 미상 시 남은 사진 재시도와 같은 파일 중복 응답 200 처리를 연결했다. 실제 승인 카탈로그의 Chromium 320px에서 2/5장 선택·6장 거절, 미리보기 5개 로드·가로 넘침 0·pageerror 0; 기존 문의/예약 탭은 1440/390/320px 가로 넘침 0. 첫 typecheck의 배열 인덱스 오류 2곳을 수정한 뒤 Field web typecheck/변경 TSX ESLint/build exit 0. 최종 mock **45065** 양 API/웹 build·ready 및 네 URL HTTP 200. 실제 제출·사진 업로드/부분 실패 E2E·DB/계약/보안·정식 QA/사용자 인수 테스트는 이번 변경 뒤 미실행이다. C03/F05 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03 Field 고객 후속 대화 시안 정합 (2026-09-26)

고객이 확인키로 연 Field 문의를 시안형 대화 카드·상태·말풍선·추가 질문 입력으로 배치하고 확인키/사진 관리 기능은 접이식 영역에 유지했다. raw 상태 대신 고객용 상태를 표시하고 내부 메모는 렌더에서 제외한다. 합성 GET 응답을 넣은 실제 React 화면에서 Chromium 1440/390/320px 가로 넘침 0·pageerror 0·내부 메모 표시 0; 이는 실제 권한/제출 검사가 아니다. Field web typecheck/변경 TSX ESLint exit 0, 최종 mock **73675** 양 API/웹 build·ready와 네 URL HTTP 200. 실제 제출·키 교체/사진·전체 E2E·DB/계약/보안/접근성·사용자 인수 테스트는 미실행, C03/F06 `in_progress`다. Git 저장소/커밋 없음.

## 최신 C03 Field 고객 문의·예약 접수 시안 정합 (2026-09-26)

공개 고객 접수 화면을 기준 시안의 문의/예약 탭과 입력·승인 사업 요약 2열, 모바일 1열로 바꿨다. 예약 서비스 선택을 실제 승인 서비스·가격 요약에 반영하고 `#reservation` 직접 링크도 예약 탭으로 연다. 실제 승인 카탈로그에서 Chromium 1440/390/320px 가로 넘침 0·pageerror 0과 탭 이동을 확인했다. Field web typecheck/변경 TSX ESLint, 브라우저 스크립트 Python 구문 exit 0; 최종 mock **25525** 양 API/웹 build·ready와 네 URL HTTP 200. 이번 변경 뒤 문의·예약 전체 제출 E2E·DB/계약/보안·접근성·사용자 인수 테스트는 미실행이다. C03/F06/F07 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03 AP 가입·첫 조직·관리실 시안 정합 (2026-09-26)

AP 가입은 시안형 좌우 배치와 실제 이메일 인증, 첫 조직은 AI 시작 카드와 별도 Field 제작 링크로 연결했다. 사업자 관리실은 오늘·문의함·승인 정보·알림·더보기 화면 단위로 전환하며 오늘 수치는 AP 원본 조회를 사용한다. 실제 로컬 계정으로 Chromium 1440/390/320px 가입→조직→오늘/승인 정보를 열어 가로 넘침 0·pageerror 0을 확인했다. AP web typecheck/변경 TSX ESLint, 브라우저 스크립트 Python 구문 exit 0; 최종 mock **67710** 양 API/웹 build·ready와 네 URL HTTP 200. 변경 뒤 전체 E2E·DB/계약/보안/접근성·사용자 인수 테스트는 미실행, 운영 공급사 연결은 `blocked_integration`, C03/A01/A03은 `in_progress`다. Git 저장소/커밋 없음.

이 문서는 실제 실행 근거를 기록한다. `TASKS.md`의 46개 작업과 160개 QA는 자동으로 완료되지 않는다.

## 최신 C03 시안 v3 화면 정합 — Field/AP 첫 화면·사업자·편집기·고객 기본 템플릿 (2026-09-26)

`reference/field_ui_prototype_v3.html`과 실제 1440/390/320px 화면을 나란히 비교했다. Field 홈·가입/시작 선택·사업자 오늘/메뉴를 시안형으로 바꾸고, 문의/예약 집계는 실제 Field API 원본으로, AP 위젯 설치 상태는 Field 설치 API로 읽는다. Field 편집기는 왼쪽 입력/오른쪽 실제 사이트 미리보기, 모바일 편집/미리보기 전환과 고정 저장 행으로 배치했다. 고객 기본 사이트는 사업체 표식·2열 소개·서비스 카드와 실제 Field 직접 문의/예약 링크를 사용한다. 독립 AP 첫 화면은 시안의 AI 단독 소개/두 선택 카드로 변경하고 Field 제작은 별도 제품 링크로 보냈다.

이전 예약 409 `slot_unavailable` 복구의 320px 실제 브라우저 red→green 1/1은 시안형 메뉴 변경 **이전** 결과다. 초기 Field 홈 단위 13/13도 이후 화면 변경 전 결과다. 변경된 브라우저 스크립트 3종은 새 가입/메뉴에 맞추고 Python 구문 exit 0만 확인했다. 최종 Field/AP web typecheck, 변경 파일 ESLint, AP web build, 새 `pnpm mock:run` **25148** 양제품 build·ready exit 0; 네 API ready/웹 홈 HTTP 200. Chromium 시각 확인에서 홈·사업자·편집기 1440/390/320px 가로 넘침 0, 주요 메뉴/모바일 미리보기 전환은 확인했다. 전체 제품 E2E/DB/계약/보안, 200% 확대·키보드/스크린리더, 고객/매체/관리자 모든 시안과 운영 공급사·정식 QA/G는 재실행/검수 전이다. 사용자 최종 테스트 요청에 따라 현재 단계에서는 C03/F03/F04/F07을 `in_progress`로 유지한다. Git 저장소/커밋 없음.

## 최신 C03/F07/QA26 기능 — Field 가능 시간 재조회와 이전 슬롯 해제 (2026-09-25)

Field 고객의 시간표형 예약에서 가능 시간 조회가 실패·미설정·빈 결과일 때 같은 서비스/날짜로 다시 확인하는 버튼을 추가했다. 서비스/날짜 변경이나 재조회가 시작되면 이전 슬롯 선택을 즉시 해제하고, 조회 성공 전 예약 제출을 막는다. 이름·연락처·동의는 유지한다. 예약 요청과 사업자 최종 확정은 기존처럼 별도 단계다.

실제 Field API/PG17과 320px Chromium의 사업자 사이트 공개→고객 두 예약 방식→사업자 확정 흐름에서 첫 availability 503을 주입했다. 수정 전에는 재조회 버튼이 없어 timeout red였고, 수정 뒤 같은 날짜 재조회 200·고객 입력 유지·실제 슬롯 예약/확정 1/1을 확인했다. 추가로 이전 슬롯 선택 뒤 다른 날짜 조회를 응답 대기 상태로 잡아 옛 슬롯 옵션 0개/제출 비활성을 확인하고 503 뒤 원래 날짜로 복구해 같은 흐름 1/1을 재실행했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python 구문 exit 0. 새 `pnpm mock:run` **17759** 양제품 API/웹 build·ready. 이 화면/브라우저 변경 뒤 제품 DB·계약·보안 전체 명령은 재실행하지 않았다. 실알림/공급사·정식 QA26/34/G-F2·전체 접근성/사용자 디자인 검토는 미실행이다. C03/F07 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/A05/QA24 기능 — AI 실패 질문 초안 포화 복구 (2026-09-25)

AP 상담 링크에서 AI 시작·답변 실패 또는 결과 미상 때 사람 문의 초안이 5,000자 한도에 차서 질문을 자동 추가하지 못하면 화면에 누락을 명시한다. 기존 초안과 AI 질문 원문을 지우지 않으며, 고객이 문의 내용을 줄인 뒤 같은 질문을 한 번 넣는 버튼을 제공한다. 실제 추가 여부와 안내를 분리해 성공을 잘못 주장하지 않는다.

신규 320px Chromium에서 4,990자 기존 초안+AI 질문·공급사 503의 누락 안내 timeout red를 확인했다. 수정 뒤 원 초안/질문 유지→내용 축소→버튼으로 정확한 질문 한 번 추가·안내 제거·사람 문의 제출 가능/가로 넘침 없음. 첫 수정 뒤 전체 HTTP 검사는 예전의 오해 소지 있는 문구를 기다리는 기존 단언으로 실패했으나 초안 값 검사는 유지하고 현재 정확한 문구로 수정했다. 최종 새 mock **41820** 양제품 API/웹 build·ready와 전체 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1(112초). `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·Python 구문 exit 0. API/DB/schema/권한/제품 간 계약 변경 없음; 이 수정 뒤 제품 DB·계약·보안 명령은 재실행하지 않았다. 실제 공급사·정식 QA24/G-A2·사용자 디자인 검토는 미실행, C03/A05 `in_progress`, Git 저장소/커밋 없음.

## 최신 A05/C03/QA21·24 기능 — 오래된 AI 실행 결과 미상 (2026-09-25)

AP 상담 AI 실행이 시작 후 5분 이상 `in_progress`이면 읽기 전용 recover와 동일 키 POST 202는 `result_unknown`을 돌려준다. 이는 조회 시점의 안내이며 AP 원장의 실행을 임의로 실패/완료 처리하지 않는다. 새 키 질문은 기존 실행 동안 409로 막고, 원래 모델이 늦게 완료되면 같은 키로 답변을 복구한다. AP 상담 링크는 결과 미상을 사람 문의 초안에 보존하고 위젯은 같은 요청 재조회/AP 사람 문의를 안내한다.

AP 격리 DB는 6분 전 실행에 대한 기존 `in_progress` 응답으로 red, AP 링크 320px 검사도 일반 미확인 안내의 timeout red였다. 구현 뒤 `pnpm test:spike:consultations:agent` 1/1, `pnpm test:db:agent` 20/20; 같은 키 202 `result_unknown`·다른 키 409·늦은 완료를 확인했다. 최종 mock **26057** 양제품 API/웹 build·ready, 전체 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1(114초)은 AP 링크 새로고침 결과 미상→사람 초안→완료 복구, 외부 위젯 결과 미상→재조회→원본 답변, 기존 Field 흐름을 확인했다. `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·Python 구문 exit 0, 계약 정적 2/2+제품 DB 5/5, 보안 기본 import/교차 DB credential·AP 20/20·Field 19/19·tenant/양 관리자 exit 0. 브라우저 AI 결과는 합성 주입이고 실제 공급사 상태 조회·수동 해소/운영 타임아웃 정책·정식 QA/G·디자인 검토는 미검수다. A05/C03 `in_progress`, Git 저장소/커밋 없음.

## 최신 A05/C03/QA21·24 기능 — AI 질문 응답 분실 멱등 복구 (2026-09-25)

AP 상담 링크와 외부 iframe의 AI 질문은 32바이트 임의 키를 `Idempotency-Key`로 보낸다. AP DB는 대화별 키 해시를 유일하게 보관하고 동일 키/질문의 모델 실행·사용량을 재사용한다. 유효한 상담 세션의 GET `/v1/engagements/{id}/messages/recover`는 완료 답변·진행·확정 실패를 돌려주며 다른 질문의 키 재사용은 409다. AP 링크의 탭 임시 원장은 질문 원문 대신 SHA-256만 두고 새로고침 뒤 같은 결과를 찾는다. 위젯은 결과 미상에 재조회 버튼과 AP 사람 문의 경로를 남긴다. 완료 답변 뒤 목록 조회만 실패하면 임시 답변을 보여주고 원본이 돌아올 때까지 새 AI 질문을 막는다.

신규 recover API의 최초 AP DB 검사는 404 red였고 iframe 신규 320px 검사는 복구 안내 timeout red였다. 대화 GET 200에 방금 수락된 답변이 빠진 경우도 임시 답변을 너무 일찍 지워 timeout red였고, 같은 AI 답변이 원본에 있을 때만 지우도록 고쳤다. 구현 후 `pnpm test:spike:consultations:agent` 1/1, 격리 AP DB 20/20. 추가 동시 동일 키 POST는 200/202·모델 호출 1회·AI run 1건·고객/AI 메시지 2건으로 통과했다. 최종 mock **61826** 양제품 API/웹 build·ready, 전체 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1(105초)은 AP 링크의 ACK 유실→첫 recover 503→새로고침 복구와 iframe의 ACK 유실→첫 recover 503→명시 재조회→답변 없는 목록 200→원본 복구, 기존 Field 흐름을 확인했다. `pnpm lint`·`pnpm typecheck`·`pnpm test:unit` exit 0, `pnpm test:contracts` 정적 2/2+제품 DB 5/5, `pnpm test:security` 교차 import/DB credential·AP 20/20·Field 19/19·tenant/양 관리자 exit 0. 브라우저 AI 응답은 합성 주입, 실제 모델 공급사·중단된 in_progress 자동 재개·정식 QA/G·디자인 검토는 미실행이다. A05/C03 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/QA21·24 기능 — AI 답변 수락 후 대화 재조회 복구 (2026-09-25)

AI 답변 POST가 200으로 수락됐으나 후속 대화 GET이 실패하면 AP 고객 화면은 응답 본문의 답변을 임시로 보여준다. 중복 AI 재질문을 막고 사람 문의는 열어 두며, 고객이 대화를 다시 불러와 같은 답변을 확인하면 서버 원본 메시지로 교체한다. 대화 ID/메시지 형태가 예상과 다르면 원본으로 받아들이지 않는다.

320px 실제 브라우저에서 일관된 합성 POST 200/GET 503→200을 주입했다. 기존 화면은 답변이 보이지 않아 timeout red, 수정 뒤 수락 답변·재질문 차단·사람 문의/재조회/원본 교체가 전체 AP↔Field HTTP 1/1(103초)로 통과했다. AP 격리 DB의 합성 모델 실제 POST 200→GET 원본 1/1, `pnpm lint`·`pnpm typecheck`·`pnpm test:unit` exit 0, 새 mock **5260** 양제품 API/웹 build·ready다. 오래된 fixture ID 단독 재실행은 정리된 배포로 timeout했으며 새 배포 전체 검사를 통과했다. 실제 LLM 공급사/POST 응답 분실 멱등 복구·정식 QA21/24/G-A2·사용자 디자인 검토는 남는다. C03 `in_progress`, 운영 공급사 `blocked_integration`, Git 저장소/커밋 없음.

## 최신 C03/QA24 기능 — AI 실패 질문의 사람 문의 초안 보존 (2026-09-25)

AP 공개 상담에서 AI 대화 시작/답변이 실패해도 고객 질문을 같은 화면의 사람 문의 초안에 남긴다. 기존 작성 내용 뒤에 덧붙이고 같은 질문으로 재시도하면 중복을 만들지 않는다. 실패한 AI 입력 자체도 유지한다. AI 성공 후 요청 도중 새로 작성한 입력은 지우지 않는다.

신규 320px 브라우저 검사는 대화 시작 503에서 사람 문의 초안이 비어 red였다. 수정 뒤 시작 503·답변 422·네트워크 중단·서버 500 응답 주입, 422에서 기존 초안 보존/반복 질문 중복 없음이 통과했다. 최종 새 mock **42212** 양제품 API/웹 build·ready와 실제 AP↔Field HTTP/320px 1/1(103초), `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·Python 구문 exit 0이다. API/DB/계약은 변경하지 않았고 해당 제품 DB/실모델·정식 QA24/G-A2는 이번 변경 뒤 별도 재실행하지 않았다. C03 `in_progress`, 운영 공급사 `blocked_integration`, 사용자 디자인/흐름 검토는 남는다. Git 저장소/커밋 없음.

## 최신 I04/C03/QA143 기능 — 익명 Field 사전 조회 한도 (2026-09-25)

AP 고객 상담의 Field 사전 GET과 직접 준비 POST가 유효한 연결을 통해 Field `/me`·`/facts`를 호출하기 전에 AP DB의 조직별 1분 원장을 소비한다. 기본 120건/분이며 `AP_FIELD_PREFLIGHT_ORG_LIMIT`로 1~1000 조정한다. 초과 429/`Retry-After`는 무연결·Field 장애와 별도 화면으로 안내하며 고객 입력을 유지한다. 연결이 없는 AP-only 상담, AP 사람 문의, 이미 수락된 제출 키 복구는 이 한도를 사용하지 않는다.

상담 격리 DB는 신규 표 부재 42P01 red → AP 전용 migration/원자적 원장·API/UI 뒤 1/1, 전체 AP 격리 DB 20/20이다. 합성 한도 2에서 정상 두 GET→세 번째 429/외부 호출 0회, 직접 POST 429·PII null/`ai_assisting`, 기존 제출 키 200·사람 문의 201, 1분 만료 뒤 회복을 확인했다. 병렬 GET 3개는 200/200/429, Field `/me`·`/facts` 4번으로 제한됐다. 새 mock **13869** 양 API/웹 build·ready 후 실제 양제품 HTTP/320px 1/1은 429 안내/재확인(브라우저 응답 주입)과 정상 직접 요청·사진/Field 전달·기존 연결 흐름을 통과했다. `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·Python 구문 exit 0, `pnpm test:contracts` 정적 2/2+제품 DB 5/5, `pnpm test:security` import/교차 DB credential/AP 20/20/Field 19/19/tenant/양 관리자 exit 0. 운영 IP·역프록시 정책/실부하·정상 고객 차단 위험, 실공급사·정식 QA/G-I2/디자인 검토는 미완료, I04/C03 `in_progress`다. Git 저장소/커밋 없음.

## 최신 I04/C03/QA143 기능 — Field 현행 상태를 연락처 제출 전 확인 (2026-09-25)

AP 고객 상담 세션의 사전 조회는 활성 배포·owner 위임·Field 필수 scope 후보를 확인한 뒤 Field `/me`와 승인 `/facts`를 읽는다. 공개 요청 서비스가 1개 이상일 때만 직접 준비를 열며, Field 권한/응답 미확인과 서비스 0개를 다른 이유로 안내한다. `destination=field` POST는 연락처 저장 전에 다시 확인하고, 같은 연결이 AP 트랜잭션 중에도 유효해야 한다. 실패하면 고객명·번호·대화 상태/알림을 변경하지 않고 AP 사람 문의는 계속 가능하다. 사전 확인 뒤 Field 상태가 바뀔 수 있어 최종 조건·수신 사업자·동의는 기존 별도 단계에서 재검증한다.

AP 상담 DB의 새 reason 단언은 기존 API에서 red였고, 구현 뒤 `pnpm test:spike:consultations:agent` 1/1·전체 AP 격리 DB 20/20이다. 합성 Field `/me` 503, facts 503, 서비스 0개, 요청 scope 누락은 직접 준비 503/409·PII null/`ai_assisting`, 장애 뒤 연결 `review_required`, 회복 후 201/멱등 재시도를 확인했다. 새 mock **82858** 양제품 API/웹 build·ready와 실제 AP↔Field HTTP/320px 1/1은 정상 직접 요청/사진/전달 및 장애·서비스 없음 UI 재확인(응답 주입)을 통과했다. `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·Python 구문 exit 0, `pnpm test:contracts` 정적 2/2+제품 DB 5/5, `pnpm test:security` import/교차 DB credential/AP 20/20/Field 19/19/tenant/양 관리자 exit 0. 운영 공개 사전 조회 호출량 정책, 실 Field 장기 장애/공급사·정식 QA/G-I2/사용자 디자인 검토는 남아 I04/C03 `in_progress`다. Git 저장소/커밋 없음.

## 최신 I04/C03/QA16 기능 — 연락처 제출 전 Field 경로 확인 (2026-09-25)

AP 익명 상담의 `/v1/engagements/{id}/field-readiness`는 현재 배포·owner 위임·AP OAuth 동의/refresh·Field 연결/scope **설정 여부**만 no-store boolean으로 돌려준다. 무연결이면 고객 화면에서 직접 준비 버튼을 비활성화하고 재확인/사람 문의를 제공한다. 서버 제출도 409로 차단해 고객명·번호·대화 상태/알림을 변경하지 않는다. 연결 뒤 기존 `external_ready` 준비·별도 Field 조건 조회/동의/전달은 그대로 진행한다. Field 서버 가동·현행 가격·시간은 이 사전 확인 결과에 포함되지 않는다.

신규 API는 404 red → AP 상담 격리 DB 1/1·전체 20/20 green. 전체 AP↔Field 실제 HTTP/320px 브라우저는 첫 실행에서 기존 사진 모드의 교체된 안내 문구 대기 때문에 exit 1; 미전송은 ActionRequest 0건으로 확인하고 문구 대기 순서를 고친 뒤 1/1 통과했다. 최종 화면에서 연결 안내를 연락처 입력란 위로 옮기고 새 mock **54308** 양 API/웹 build·ready 뒤 전체 HTTP/320px 1/1을 다시 통과했다. 무연결 버튼 비활성·사람 문의, 연결 후 직접 준비/사진/현행 조건·별도 동의/Field 접수와 기존 SDK/해제까지 확인했다. `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·Python 구문 exit 0, `pnpm test:contracts` 정적 2/2+제품 DB 5/5, `pnpm test:security` import/교차 DB credential·AP 20/20·Field 19/19·tenant/양 관리자 exit 0. 실 공급사/정식 QA/G-I2/사용자 디자인 검토는 미완료이며 I04/C03 `in_progress`다. Git 저장소/커밋 없음.

## 최신 I04/C03/QA16 기능 — Field 직접 준비 응답 분실·사진 복구 (2026-09-25)

AP 직접 Field 요청 준비 POST가 서버에 저장된 뒤 응답만 끊겨도 같은 탭 새로고침에서 읽기 전용 recover로 기존 대화 ID/확인키를 찾는다. 선택한 사진의 파일 바이트는 복구되지 않으므로 화면이 미저장을 안내하고 같은 AP 요약 메시지에 재선택·첨부한다. 그 뒤 고객이 Field 현재 조건과 사진 전달 항목에 별도로 동의해야 Field 요청이 생성된다.

320px 실제 브라우저의 준비 POST 201/ACK 분실→새로고침에서 기존 화면은 사진 재선택 안내/입력이 없어 timeout red였다. `photoSelected` boolean만 탭 임시 원장에 추가하고 같은 화면 첨부를 연결했다. 최종 새 mock **17073** 양 API/웹 build·ready와 양제품 HTTP/320px 1/1은 원본 1건·준비 전송 0건, 사진 재첨부→Field 복사/사업자 열람을 확인했다. 중간 두 실패는 사진 성공으로 상태 문구가 교체된 뒤 과거 미전송 문구를 기다리던 테스트 순서 문제라 검사 시점을 바로잡았다. `pnpm lint`·`pnpm typecheck`·`pnpm test:unit` exit 0, AP 격리 DB 20/20, 계약 정적 2/2+제품 DB 5/5, 보안 기본 import/교차 DB credential/AP 20/20/Field 19/19/tenant/관리자 exit 0. 실모델/공급사·실 객체 저장소·정식 QA/G-I2/디자인 검토는 미완료, I04/C03 `in_progress`다. Git 저장소/커밋 없음.

## 최신 I04/C03/QA141 기능 — 직접 Field 요청 사진 전달 (2026-09-25)

고객이 AP 상담 링크에서 Field 요청을 직접 준비할 때 마지막 요약 메시지에만 사진을 비공개 첨부한다. AI 질문 첨부는 거부한다. Field로 보낼 ready 사진을 고객이 따로 선택하고 전달 항목에 동의하면 기존 ActionRequest가 사진 UUID를 고정한다. Field는 승인된 AP 인증 복사 경로에서 사진을 받아 자체 저장소에 보관하고 Field 사업자만 열 수 있다. 같은 화면 업로드와 확인키로 AP 대화 재열람 뒤 재선택·업로드 모두 연결했다.

기존 API는 직접 준비 사진을 401로 거부해 AP 상담 DB red였고, 수정 후 1/1·격리 AP DB 20/20이다. 새로고침 뒤 AP 후속 화면은 마지막 요약 메시지를 사진 대상으로 찾지 못해 실제 320px HTTP/browser timeout red였고, 사진 대상과 Field 목록 갱신을 수정했다. 새 mock **82435** 양 API/웹 build·ready 후 전체 양제품 HTTP/320px 브라우저 1/1은 즉시·재열람 사진 두 방식과 Field 복사·사업자 인증 열람을 검증했다. `pnpm test:contracts` 정적 2/2+제품 DB 5/5, `pnpm test:security` 교차 import/DB credential·AP 20/20·Field 19/19·tenant/관리자 exit 0, lint/typecheck exit 0. 실 S3/HEIC·악성코드/보존·POST 응답 분실 주입·실모델/공급사·정식 QA/G-I2·디자인 검토는 남아 `in_progress`다. Git 저장소/커밋 없음.

## 최신 I04/C03/QA16 기능 — AI 대화에서 사람 문의 없이 Field 요청 (2026-09-25)

AP 상담 링크에서 AI 대화와 같은 원본에 이름·번호·AP 저장 동의를 붙이고 `external_ready`/별도 확인키로 멈출 수 있다. 이 준비에는 AP 사람 문의함·사업자 알림·Field 전송이 없다. 이후 고객이 Field의 현재 조건·수신 사업자·전달 항목을 확인하고 별도로 동의해야 기존 ActionRequest가 Field에 접수된다. Field 연결이 없으면 확인키로 AP 원본을 열어 사람 문의를 제출할 수 있다.

기존 API가 직접 준비를 `needs_owner`로 만드는 AP 격리 DB red를 확인했다. 수정 뒤 `pnpm test:spike:consultations:agent` 1/1·`pnpm test:db:agent` 20/20, `pnpm test:contracts` 정적 2/2+제품 DB 5/5, `pnpm lint`·`pnpm typecheck` exit 0. 새 mock **20145** 양 API/웹 build·ready 후 전체 양제품 HTTP와 320px 직접 준비→현재 조건/동의→Field 접수 1/1. `pnpm test:security`는 import/DB credential 경계·AP 20/20·Field 19/19·tenant/양 관리자까지 exit 0. 실모델 고객 화면은 공급사 부재로 검사하지 못해 DB 합성 모델과 화면 fallback만 검수했다. 직접 준비 사진·운영 공급사·정식 QA/G-I2와 사용자 디자인/흐름 검토는 남아 I04/C03 `in_progress`다. Git 저장소/커밋 없음.

## 최신 C03/I04/QA136·143 기능 — Field grant 일시 장애 뒤 고객 복구 (2026-09-25)

AP 고객의 Field 연결 조회에서 `/me`가 일시적으로 503이면 해당 조회만 `field_grant_unknown`/서비스 빈 목록으로 처리하고 AP 연결 원장의 `review_required`를 유지한다. Field가 복구되면 같은 문의 확인키로 현행 사실을 재조회해 `available` 서비스·가격 확인으로 돌아온다. 고객 읽기 한 번으로 연결을 영구 `degraded`로 만들지 않는다. AP owner의 명시 권한 검사는 기존 정책대로 유지한다.

기존 AP 격리 DB에서 `/me` 503 뒤 상태가 `degraded`인 19/20 red → 수정 뒤 `pnpm test:db:agent` 20/20/격리 DB 삭제. 새 mock **49757** 양 API/웹 build·ready 및 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1. 첫 `pnpm test:security`는 기존 AP 연결 검사 cleanup의 facts inbox FK 23503으로 실패했다. 합성 inbox를 refresh job보다 먼저 지우게 고쳐 전체 재실행 exit 0(import/양 DB credential 차단·AP 20/20·Field 19/19·tenant/양 관리자 각 1/1). 최종 lint/typecheck exit 0. 공개 계약/schema/migration/Field 코드 변경 없음. 실 공급사/운영 장기 장애·정식 QA136/143/G-I2는 미검수; C03/I04 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/I04/QA143 검수 — AP 실제 다중 연결 원장·부분 장애 (2026-09-25)

격리 AP DB에서 같은 조직·배포의 실제 `ap.field_connections` 세 건을 만들고 고객 `/field-services`를 조회했다. 정상 연결의 서비스/25,000원 확인→고객 동의/Field 전달은 유지된다. Field facts 503 연결은 `field_facts_unavailable`, facts scope가 빠진 연결은 `field_reauthorization_required`이며 두 연결 모두 서비스가 비어 있다. 잘못된 고객 확인키는 401, 문제 연결로 직접 현재 조건을 조회하면 권한 403 또는 다른 조직 사실 502로 거부된다.

추가 검사는 기존 AP 서버 구현에서 첫 실행부터 통과해 runtime 수정은 없었다. 최종 `pnpm test:db:agent` 20/20·격리 DB 삭제, `pnpm lint`·`pnpm typecheck` exit 0. Field 공개 전송은 이 제품 DB 검사에서 stub이며 실제 두 Field 조직의 HTTP/운영 장기 장애·정식 QA143/G-I2는 미검수다. C03/I04 `in_progress`, Git 저장소/커밋 없음.

## 최신 C02/C03/A10/F10 검수 — 상대 제품 부재의 독립 실행 (2026-09-25)

전체 mock 서버를 종료하고 AP/Field mock compose를 `down`했다. Field 컨테이너와 API/웹/DB/Valkey 포트가 없는 상태에서 `pnpm test:independence:agent` exit 0: AP 자체 가입·승인·owned 외부 위젯·고객 접수·사업자 응답/확인키·mock trial과 320px owner/guest 브라우저 1/1을 확인했다. AP 컨테이너와 API/웹/DB 포트가 없는 상태에서 `pnpm test:independence:field` exit 0: Field 자체 가입·사이트 공개·직접 문의·사업자 응답·두 예약 방식·mock trial과 320px owner/guest 브라우저 1/1을 확인했다. 양쪽 runner는 시작·종료 때 상대 compose/포트 부재를 검사한다.

볼륨 삭제 옵션 없이 제품별 compose를 정리한 뒤 새 전체 mock **28985**에서 양 API/웹 build·ready를 확인했다. 제품 코드/API/schema/DB migration 변경 없음. 이는 로컬 mock 독립성 근거이며 실 LLM·알림·결제·외부 네트워크/서버 ACL·정식 QA121~124/143 및 G-A/G-F 게이트 완료 근거는 아니다. 관련 Task `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/I04/QA143 기능 — 여러 Field 연결의 일부 장애·권한 안내 (2026-09-25)

AP 고객의 Field 서비스 목록에 정상 연결과 `field_facts_unavailable`·`field_reauthorization_required`가 함께 있으면, 정상 연결의 서비스만 선택하고 현재 가격/시간 확인·동의·요청을 진행할 수 있다. 문제 연결 서비스는 숨기며 일시 정보 조회 장애와 사업자 재동의 필요를 구별해 안내한다. AP 원본 문의와 기존 Field 전달 기록은 유지한다.

기존 UI는 재동의 필요를 일반 조회 장애로만 표시해 320px Chromium의 사업자 재동의 문구가 timeout red였다. 새 mock **77720** 양 API/웹 build·ready 뒤 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1은 목록 복합 상태→정상 연결의 현행 가격 확인·고객 동의/실제 전달과 양제품 연결/사건/해제를 검수했다. `pnpm lint`·`pnpm typecheck` exit 0. 복합 연결 상태는 실제 API의 단일 연결 응답에 브라우저에서 추가한 UI 검수이고 실제 두 연결의 DB/HTTP 원장, 운영 공급사 장애·정식 QA143/G-I2·사용자 디자인 검토는 미완료다. C03/I04 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/I04/QA156 기능 — 제출 조건 사전 확인 변경·장애 복구 (2026-09-25)

AP 고객이 Field 가격·시간을 조회한 뒤 제출 조건 사전 확인에서 409를 받으면 화면의 이전 조건을 지우고 Field availability를 재조회한다. 새 조건을 보고 고객이 다시 확인·동의해야 한다. 사전 확인 503/응답 예외에서는 과거 가격을 현재값처럼 표시하지 않는다. AP 원본 문의와 기존 전달 기록은 유지된다.

320px 실제 Chromium에서 사전 확인 409 뒤 새 45,000원이 나타나지 않는 timeout red를 확인했다. 새 mock **92114** 양 API/웹 build·ready 뒤 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http` 1/1은 사전 확인 409→45,000원, 다음 503→가격 제거, 재조회→50,000원, 최종 제출 409→60,000원 재조회와 재동의/실제 전달 및 양제품 연결/해제 흐름을 검수했다. `pnpm lint`·`pnpm typecheck` exit 0. API/DB/schema/Field 내부 코드 변경 없음. 실 공급사/운영 장기 장애·정식 QA156/G-I2/사용자 디자인 검토는 미완료, C03/I04는 `in_progress`다. Git 저장소/커밋 없음.

## 최신 C03/I04/QA143 기능 — Field 연결 정보 부분 장애 고객 안내 (2026-09-25)

AP 고객 Field 서비스 목록 API가 200이어도 연결별 Field facts 조회가 `field_facts_unavailable`이면 현재 서비스·가격·전달 양식을 숨기고 장애 안내/재조회 버튼을 표시한다. AP 원본 문의와 이전 Field 전달 기록은 계속 볼 수 있다. Field 연결이 없는 AP 문의에는 연결 화면을 만들지 않는다.

320px 실제 Chromium에서 부분 장애 응답을 주입하자 안내가 없어 timeout red였다. 응답 완료 전 단언한 초기 테스트 주입 오류도 응답 대기로 고쳐 실제 red를 분리했다. 수정 뒤 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http`는 장애→복구→현재 조건 확인→동의/실제 전달과 양제품 연결/해제 흐름 1/1 통과했다. `pnpm lint`·`pnpm typecheck` exit 0, 새 mock **53354** 양 API/웹 build·ready. DB/schema/Field 내부 코드 변경 없음. 실 공급사/운영 장기 장애·정식 QA143/G-I2, 사용자 디자인 검토는 미완료이며 C03/I04는 `in_progress`다. Git 저장소/커밋 없음.

## 최신 C03/I04/QA156 기능 — Field 조건 변경 후 고객 재확인 (2026-09-25)

AP 고객이 확인한 Field 가격·시간·정책이 최종 제출 전에 바뀌어 `service_conditions_changed` 409가 오면 고객 화면의 이전 조건 카드·동의·제출 키를 해제하고 Field availability를 다시 읽는다. 새 현재 조건을 표시한 다음 고객이 요청 시간·전달 항목을 다시 확인하고 동의해야 한다. 재조회 장애에는 예전 가격/조건을 현재값처럼 표시하지 않는다. 원래 전달 결과 미상은 별도 조회 경로를 유지한다. AP 원본 문의는 그대로다.

320px Chromium에서 구 동의 카드가 남고 새 60,000원 조건을 표시하지 못하는 timeout red를 확인했다. 수정 뒤 `pnpm test:spike:field-actions:agent` 1/1은 25,000→30,000원 가격 변경 뒤 구 hash 제출 409·Field 전송 0건·새 조건 hash를 확인했다. `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-report-venv/bin/python pnpm test:spike:ap-field:http`는 새 조건 재조회·재동의·실제 전달을 포함한 전체 연결/사건/해제 흐름 1/1, Chromium 320px page error 0·가로 넘침 없음. 첫 브라우저 red 뒤 단순 `FIELD_BROWSER_PYTHON=...` 실행은 새 고객 검사를 통과했지만 실행 중 mock 자동 worker를 수동 모드로 검사해 마지막 revoke 처리에서 `empty`/`acked` 경합으로 실패했다. worker 플래그를 실제 환경에 맞추어 전체 통과했다. `pnpm lint`·`pnpm typecheck` exit 0, 새 mock **47268** 양제품 API/웹 build·ready. 실공급사/운영 장기 장애·정식 QA156/G-I2는 미검수; C03/I04 `in_progress`, Git 저장소/커밋 없음.

## 최신 I02/QA134 기능 — AP 직접·Field 서비스 출처 매핑 (2026-09-25)

AP owner 연결 화면이 최신 직접 승인 KnowledgeRelease의 서비스와 Field 승인 snapshot을 나란히 보여준다. 이름이 겹치는 Field 서비스는 별도/AP 설명 우선/Field 설명 우선을 명시 선택해야 공개할 수 있다. 별도 선택은 두 출처를 구별해 보존하고, AP 우선은 Field 설명을 AI 근거에서 제외하며, Field 우선은 새 connector 공개본에서 대응하는 AP 서비스를 제외한다. 직접 입력 초안과 native 승인 원본은 유지한다. 요청은 양쪽 승인 버전과 서비스 매핑을 고정하고 변경 409/같은 선택 200 멱등으로 처리한다. 고객 AI 적용에는 별도 새 AI release 승인이 필요하다.

AP DB의 옵션 API 부재 404 red, JSONB 키 순서로 같은 선택이 새 공개본을 만든 201 red, TypeScript undefined 오류를 수정했다. 최종 `pnpm test:spike:field-connection:agent` 1/1은 중복 무결정/세 선택/owner/버전/멱등을 확인했다. `pnpm test:spike:ap-field:http` 실제 양제품 HTTP 1/1, Chromium 320px 중복 선택·공개·재열람 1/1(page error 0·가로 넘침 없음), `pnpm test:contracts` 정적 2/2+DB 5/5, `pnpm test:integration:faults` 정적 2/2·AP 3/3·Field 2/2·양제품 HTTP/worker 1/1, `pnpm test:e2e:agent` 3/3, `pnpm test:security` import/DB credential 경계·AP 20/20·Field 19/19·tenant/양 관리자 각 1/1, lint/typecheck exit 0. 첫 `python3` 브라우저 실행은 Playwright 부재로 실패했고 report venv로 다시 실행해 통과했다. 새 mock **45262**의 양제품 API/웹 build·ready, 네 HTTP endpoint 200. 운영 실모델/공급사·사용자 디자인 검토·정식 QA134/G-I2는 미완료로 I02 `in_progress`; Git 저장소/커밋 없음.

## 최신 I02/QA136 기능 — AP 상담 Field 근거 실시간 확인 (2026-09-25)

AP 사업자 AI 테스트와 비회원 AI 답변에서 connector KnowledgeRelease의 Field 근거를 사용하기 직전, AP owner 위임 grant로 Field 공개 facts를 다시 읽어 승인 source revision/hash를 검사한다. 일치하면 확인 시각을 갱신하고, 불일치·조회 실패·회수 상태에서는 `field:*` 근거를 모델 입력에서 빼고 AP native 지식으로 답변을 이어가되 Field 미확인과 사람 인계를 표시한다. 모델 생성 중 연결 정보가 바뀌면 연결 근거 답변을 고객 대화에 저장/표시하지 않는다. 일시적인 Field `/me` 장애를 AI 요청만으로 영구 연결 `degraded`로 만들지 않는다. 가격·시간·예약 조건 수치는 연결 지식에 넣지 않으며 고객의 실제 외부 요청은 기존 Field 가용성/조건 hash 재확인을 사용한다.

격리 AP DB에서 이벤트 도착 전 구 버전 연결 근거 2건 노출을 red(19/20), `/me` 일시 장애 뒤 연결 `degraded`를 red(19/20), 25시간 지난 확인 시각을 live 재확인하지 못하는 사례를 red(19/20)로 확인했다. 최종 AP 20/20은 사업자·비회원의 사전/생성 중 버전 변경, Field facts·grant probe 장애, native 답변과 사람 인계, 고객 원문 미저장, 확인 시각 회복을 포함한다. `pnpm test:contracts` 정적 2/2+DB 5/5, `pnpm test:integration:faults` 정적 2/2·AP 3/3·Field 2/2·두 서버 HTTP/worker 1/1, `pnpm test:e2e:agent` 3/3, `pnpm test:security` import/교차 DB 차단·AP 20/20·Field 19/19·tenant 1/1·양 관리자 각 1/1, lint/typecheck exit 0. 새 mock **56421**의 양 API/웹 build·ready, 네 endpoint HTTP 200. 실모델/공급사·운영 장애·전체 QA136/G-I2는 미검수, I02 `in_progress`; Git 저장소/커밋 없음.

## 최신 I02/I07 기능 — Field 승인 사실 변경 서명 전달 (2026-09-25)

최종 권한 수신 보강 이후 `pnpm test:security` 전체를 재실행해 제품 간 import 금지·교차 DB 자격증명 차단·AP 20/20·Field 19/19·tenant 1/1·양 관리자 브라우저 각 1/1, exit 0을 확인했다.

Field 승인 카탈로그 release/outbox를 연결별 내구 delivery와 재조정하고, 최소 ID·revision의 `field.facts.changed`를 연결 HMAC으로 AP에 보낸다. AP는 서명·시간창·현재 owner/grant/scope·동의를 확인해 제품 전체 event ID 멱등 inbox에 저장한 뒤 202를 준다. 별도 AP worker가 최신 Field 공개 facts를 다시 읽는 내구 갱신 작업을 만들고 새 source를 `pending_review`에 보관한다. 사업자 승인·AI 공개·고객 알림은 자동 수행하지 않는다. 연결 생성 전 release는 수동 최초 가져오기 대상이다. 해제/권한 회수 뒤 새 사건은 거부하고, 최근 승인/전송 누락은 release/outbox에서 복구한다.

계약 schema·AP 수신·Field 모듈 부재를 red로 확인했다. 수신기에서 owner 역할 회수 사건이 202로 기록되던 추가 red도 401로 수정했다. 첫 mock worker의 `approved_at` 조회 누락과 HTTP 테스트 `AP_PROFILE=mock` 누락을 수정했다. 최종 AP/Field 격리 DB 20/20·19/19, `pnpm test:contracts` 정적 2/2+DB 5/5, `pnpm test:integration:faults` 정적 2/2·AP 3/3·Field 2/2·양제품 HTTP/worker 1/1, 현재 코드의 `pnpm lint`·`pnpm typecheck` exit 0. 기존 320px 연결 브라우저 1/1/page error 0, 최종 새 `pnpm mock:run` **95318** 양제품 빌드·API/웹 ready와 HTTP 연결 수동/자동 worker 각 1/1·API/웹 네 곳 HTTP 200. `pnpm test:security`는 최종 수신기 권한 보강 직전 import/DB 격리·AP 20/20·Field 19/19·tenant·양 관리자 화면을 통과했고 이후 AP 20/20을 재검사했다. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0, `tools/check_package.py`는 문서 패키지 범위만 통과했다. 실 운영 장애/공급사·전체 QA/G-I는 미검수로 I02/I07 `in_progress`; Git 저장소/커밋 없음.

## 최신 A09/I02/I06/I07 기능 — 갱신 중 연결 해제 경합 (2026-09-25)

AP worker가 Field facts 응답을 기다리는 동안 AP owner가 연결을 해제하면, 이전에는 해제 뒤 source를 다시 `pending_review`로 저장하고 갱신 작업을 `completed`로 기록했다. 격리 AP DB에서 실제 응답 보류→해제 commit→응답 재개로 19/20 red를 확인했다. `storeFacts`의 저장 트랜잭션이 AP connection row를 해제 경로와 같은 순서로 잠그고 조직·Field grant·AP grant·현재 상태를 다시 확인한다. 해제가 먼저 끝나면 작업은 `blocked`, source는 `revoked`, 새 revision snapshot은 0건이다. 저장이 먼저 끝난 경우 해제가 이어 source를 revoked로 전환한다.

수정 뒤 `pnpm test:db:agent` 20/20 임시 DB 삭제, `pnpm test:contracts` 정적 2/2+제품별 DB 5/5, `pnpm test:integration:faults` 정적 2/2·AP 3/3·Field 2/2·양제품 HTTP/worker 1/1, `pnpm lint`·`pnpm typecheck` exit 0. 새 전체 mock **14173**에서 AP/Field API·웹 build/ready. 실 운영 장애·공급사·정식 QA/G-I는 미검수로 A09/I02/I06/I07 `in_progress`, Git 저장소/커밋 없음.

## 최신 A09/I02/C03 기능 — 공식 AP 정보 갱신 요청 (2026-09-25)

AP 공개 OpenAPI preview.7에 `ap.sources.refresh`와 연결별 현재 source 버전, 예상 버전/43자 무작위 멱등 키의 갱신 요청, 작업 상태 조회를 추가했다. AP는 token·client·grant·actor·조직·AI·연결을 확인해 내구 작업을 한 건으로 기록한다. worker는 Field 공개 facts를 재조회해 기존 AP source의 검토 초안으로 저장한다. Field owner BFF/320px 연결 화면은 현재 버전·작업 상태와 AP 검토 링크를 보여주며 응답 미상 때 같은 키를 재사용한다. AP 사업자의 source 승인/고객 AI 공개는 자동 실행되지 않는다. 이전 OAuth resource DB의 허용 범위가 설정 변경만으로 업데이트되지 않아 `000054` migration을 추가했고 실제 로컬 리소스에서 새 범위를 확인했다.

계약 scope/경로, AP GET/POST, Field OAuth 요청은 각각 부재 상태의 red를 확인했다. 수정 뒤 AP/Field 격리 DB 20/20·19/19, `pnpm test:contracts` 정적 2/2+제품별 DB 5/5, 양제품 `pnpm test:spike:ap-field:http` 1/1, 320px 실제 AP↔Field 연결·검토 승인·Field 갱신 요청/완료·AP 승인 버전 불변 브라우저 1/1(page error 0), `pnpm test:security` import/교차 DB 차단·AP 20/20·Field 19/19·tenant 1/1·양 관리자 각 1/1, `pnpm lint`·`pnpm typecheck` exit 0. 최종 전체 mock **28891**에서 API/웹 새 빌드·양 API ready·두 작업실 HTTP 200. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0·`tools/check_package.py`는 문서 패키지 범위만 통과했다. 브라우저 첫 실패의 오래된 기능 문구, 권한 누락, 빠른 작업 완료 뒤 버튼 제거와 검사 반복 경쟁은 원인을 확인하고 수정/재검사했다. 실운영 OAuth client 재동의·실공급사·정식 QA/G·출시 승인은 미완료; A09/I02/C03 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/A10/F10/I07/D05 검수 — 로컬 표준 E2E·장애·보안 (2026-09-25)

실행 중인 제품별 PostgreSQL 17·Field Valkey mock **11532**에서 양 API ready를 확인하고 표준 명령을 순차 실행했다. `pnpm test:e2e:agent` 3/3(사업자 외부 위젯·비회원 문의/사진, 매체 복구, 관리자), `pnpm test:e2e:field` 3/3(사이트·직접 문의·두 예약, 자동 저장/공개 경계, 관리자), `pnpm test:e2e:distribution` 2/2(매체 복구, 배치→Field 예약·서명 사건·집계), `pnpm test:integration:faults` 계약 2/2·AP DB 3/3·Field DB 2/2·HTTP/worker 1/1이 exit 0이다. 최초 `pnpm test:security`는 Field 격리 DB 18/19에서 합성 테스트 조직 정리 순서의 FK 23503으로 exit 1. 해당 `integrator.db.test.ts` finally가 자기 연결의 합성 전달 사건을 먼저 지우게 고쳤다. 이후 전체 `pnpm test:security` exit 0(AP 20/20·Field 19/19·tenant 1/1·양 관리자 각 1/1·import/양방향 DB credential 차단). `pnpm lint`·`pnpm typecheck` exit 0. API·schema·migration·운영 데이터 변경 없음. 사용자 디자인 검토·상대 제품 중단 독립성 재검사·실공급사/침투/정식 QA·출시 게이트는 미검수이며 Task 상태는 그대로다.

## 최신 A02/F05/C03 기능 — 후속 사진 재첨부와 같은 파일 재선택 (2026-09-25)

고객 추가 질문 POST가 저장된 뒤 응답을 잃고 같은 탭을 새로고침해 메시지를 복구한 다음, 로컬 PNG를 다시 선택해 바로 그 메시지 ID에 비공개 사진 한 건을 첨부한다. 이후 같은 PNG를 다른 추가 질문에 다시 선택해도 새 메시지에 별도 첨부할 수 있도록 AP/Field 후속 대화 화면의 파일 input을 성공 시 비운다. 문의 확인키 입력 변경으로 사진 상태를 버릴 때도 파일 input을 비운다. API/DB/제품 간 계약 변경 없음.

처음 추가한 AP/Field 320px 전체 브라우저 검사는 복구 메시지 사진 첨부는 통과했지만 다음 질문의 같은 PNG 재선택 뒤 업로드가 없어 각각 exit 1. AP 진단 단언은 `선택한 사진` UI 상태 미갱신으로 red였다. 수정 후 새 mock **11532**의 `pnpm test:spike:agent-owner-flow:http` 1/1·`pnpm test:spike:field-owner-flow:http` 1/1은 응답 분실·새로고침 복구 메시지와 그 첨부 `messageId` 일치/고객 비공개 이미지 표시, 같은 파일의 다음 메시지 재첨부를 확인했다. `pnpm lint`, `pnpm typecheck` exit 0, 새 API/웹 build·양 API ready·두 작업실 HTTP 200. 이번 UI 변경 뒤 DB·unit은 미실행이며 이전 단계 결과를 이번 단계 통과로 합치지 않는다. 실 S3/HEIC·사진 보존/복구·실공급사·정식 QA/G는 남아 `in_progress`; Git 저장소/커밋 없음.

## 최신 A02/A03/F05/F06 기능 — 후속 질문 새로고침 복구 (2026-09-25)

AP·Field 비회원 추가 질문 POST가 서버에 저장된 뒤 응답을 잃어도, 같은 탭 새로고침에서 현재 문의 확인키와 제출 키 해시로 기존 고객 메시지 ID를 확인한다. 1시간 `sessionStorage`에는 문의 ID·무작위 확인키/제출 키·trim 본문 SHA-256만 저장하고 본문이나 사진 바이트는 두지 않는다. 조회가 404/503이면 시도를 보존하고 동일 본문 재입력만 같은 제출 키로 재시도한다. 다른 본문은 명시 포기 전까지 막고, 미확정 시 확인키 교체를 숨긴다. 성공 시 임시 시도는 삭제되고 복구된 메시지 ID를 사진 재선택 경로에 전달한다.

신규 DB 검사는 두 경로 404로 AP 19/20·Field 18/19 red → 최종 격리 AP 20/20·Field 19/19 green(정확한 메시지/키·형식·타 문의·확인키 교체 후 거부/no-store). 두 제품 320px 전체 브라우저는 임시 기록 부재 red → 새 mock **46615**의 AP 1/1·Field 1/1 green: POST commit/ACK 분실→새로고침→고객 메시지 한 건, 저장값 원문 부재·성공 뒤 삭제. Field는 복구 GET 503→수정 질문 추가 POST 0건·확인키 교체 차단→원래 키로 명시 재조회도 통과했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python 구문 검사, 양제품 API/웹 build, tenant 1/1, import/DB credential 격리 exit 0. 사진 파일 재선택·재첨부의 별도 브라우저 검사는 미실행. 실공급사/정식 QA/G 미완료로 관련 Task는 `in_progress`; Git 저장소/커밋 없음.

## 최신 A02/A03/F05/F07 기능 — 공개 접수 새로고침 복구 (2026-09-25)

AP 직접 문의·상담 사람 인계와 Field 직접 문의·예약의 첫 공개 제출이 서버에 저장된 뒤 응답이 끊겨도, 같은 탭 새로고침에서 현재 유효 확인키와 원본 ID를 읽기 전용 API로 찾는다. 복구 GET은 제출 키·확인키 두 해시와 조직/대화 ID가 맞는 기록만 반환하며 교체된 이전 확인키는 404다. 브라우저의 1시간 `sessionStorage` 임시 시도에는 경로·무작위 키·입력 SHA-256 지문만 두고 고객 이름·번호·문의 원문을 저장하지 않는다. 조회 장애/미발견에는 시도를 보존해 같은 입력만 재시도하며 다른 새 접수는 명시 포기 후에만 허용한다. 별도 기기는 고객이 보관한 확인키로 원본에 접근한다.

AP 상담·Field 예약 복구 GET은 구현 전 404 red, AP/Field 직접 문의 red는 기존 테스트 정리의 FK 실패가 가렸다. 최종 격리 AP DB 20/20·Field DB 19/19은 두 키·타 조직/대화·틀린 키/약한 키·확인키 교체 후 거부를 통과했다. 최종 mock **56038**의 320px AP/Field 전체 사업자→고객 브라우저 각 1/1은 POST commit/ACK 분실→새로고침→동일 ID/확인키를 확인했다. Field 복구 GET 503 때 수정한 입력의 추가 POST 0건·명시 재조회 복구도 통과했다. 임시 보관값의 연락처/문의 원문 부재·성공 후 삭제·가로 넘침 없음, lint/typecheck/unit·양제품 API/웹 build·import/DB 격리·tenant HTTP 1/1·ready/웹 200을 확인했다. 후속 메시지의 새로고침 복구, 탭 종료/다른 기기에서 확인키 미보관 상황, 실공급사·정식 QA/G는 남아 `in_progress`; Git 저장소/커밋 없음.

## 최신 A02/F05/F07 기능 — 공개 접수 조직 전체 상한 (2026-09-25)

AP/Field는 각각의 PostgreSQL 원장으로 기존 정규화 연락처별 15분 5건에 조직 전체 신규 공개 접수 기본 15분 60건을 더했다. 제품별 `AP_PUBLIC_SUBMISSION_ORG_LIMIT`/`FIELD_PUBLIC_SUBMISSION_ORG_LIMIT`를 1~1000으로 설정할 수 있다. AP 직접 문의·상담 인계와 Field 직접 문의·예약은 같은 제품의 조직 한도를 사용하고, 이미 수락한 제출 키는 한도 뒤에도 같은 원본을 복구한다. 429는 연락처/조직 범위와 `Retry-After`를 반환하며 고객 입력을 유지한다. Field 사업자의 내부 첫 문의 테스트는 고객 접수 한도에서 제외된다.

AP/Field 새 DB 검사는 migration 전 신규 표 부재 42P01로 각각 red. 구현 중 Field 검사는 예약 모드 공개본 변경 뒤 테스트용 요청이 400을 반환해 조직 한도 사례를 변경 전 요청 방식으로 이동했다. 최종 격리 DB AP 20/20·Field 19/19, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 양 API/웹 build, import/DB 격리 exit 0. 새 전체 mock 서버 **36783**에서 API ready/두 작업실 HTTP 200, `pnpm test:e2e:agent` 3/3·`pnpm test:e2e:field` 3/3 통과했다. 실부하·적절한 운영 상한/신고 및 한도 악용 DoS·실공급사 비용 정책·정식 QA/G는 미검수로 작업은 `in_progress`; Git 저장소/커밋 없음.

## 최신 C03/F02/F04/F05 기능 — Field 고객처럼 첫 문의 테스트 (2026-09-25)

개설 완료의 다음 행동이 사업자 플랫폼 주소의 공개 고객 문의 화면 테스트 모드로 이어진다. 사업자는 화면의 승인 서비스·이름·문의 내용을 입력하고 서버는 세션·조직·사이트 공개 revision·현재 공개 고객 카탈로그의 서비스를 확인해 `is_test` 원장에 한 건만 저장한다. 응답 분실 뒤 동일 입력은 같은 ID, 다른 입력은 409다. 비로그인 테스트 모드는 제출·예약 양식을 열지 않는다. 테스트 기록은 연락처/동의/확인키·outbox/외부 알림·실적·예약 점유가 없고, 문의함에서 내부 답변할 수 있다. 실제 고객 양식은 기존 접수 경로를 유지한다.

Field 격리 DB 신규 GET 검사는 404로 18/19 red. 중간 구현은 제출 키/해시 쌍 DB 제약 23514와 사이트 공개 뒤 최신 카탈로그 불일치를 드러내 각각 수정했다. 전체 브라우저도 새 링크 부재 red, 201 ACK 분실 뒤 200 복구 문구 검사 차이 red를 거쳐 최종 새 mock **89466**에서 1/1 green(320px 비로그인 차단·사업자 테스트 입력/재시도·문의함 답변·실제 비회원 문의/두 예약). Field 임시 DB 19/19, tenant HTTP 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Python 구문 검사 exit 0, 양제품 build·API ready. 검증 자기 수신처·실발송 공급사·정식 QA/G는 미완료이며 QA69 전체는 `blocked_integration`; Task는 `in_progress`, Git 저장소/커밋 없음.

## 최신 C03/F04/F05/F06 기능 — Field 안전한 내부 첫 문의 (2026-09-25)

Field 승인 사이트 공개 버전마다 사업자 인증의 내부 테스트 문의 한 건을 만든다. 재시도와 응답 분실은 동일 기록으로 돌아온다. DB의 `is_test`/공개 revision과 동의 null·전화 빈값으로 실제 접수와 구분하며, 고객 확인키를 노출하지 않는다. 테스트 생성과 사업자 답변은 outbox·외부 알림을 만들지 않고 사용량·관리자 실제 문의 집계·예약 점유에서 제외한다. 문의함/JSON 내보내기와 운영 보관에는 테스트 표기를 남긴다. 공개 고객 폼은 여전히 실제 접수이며 내부 버튼은 폼·발송 검사가 아니다. AP/제품 간 계약 변경 없음.

신규 Field 격리 DB 검사는 경로 부재 404로 18/19 red. 첫 구현 뒤 테스트 정리의 site release FK 오류와 전체 브라우저의 비동기 버튼 타이밍 실패를 수정했다. 최종 Field DB 19/19, 새 전체 mock **90580**의 `pnpm test:spike:field-owner-flow:http` 1/1(201 commit/ACK 분실→200 같은 테스트 ID, 문의함/답변, 기존 실고객 문의·두 예약), tenant HTTP 1/1, `pnpm test:security` 로컬 기본 검수 exit 0(AP DB 20/20·Field DB 19/19·tenant/양 관리자), lint/typecheck/unit·Python 구문 검사·양제품 build/ready/작업실 HTTP 200, 새 무인증 POST 401. 기본 `python3 tools/check_package.py`는 `jsonschema` 부재로 exit 1; 보고서 venv로 같은 명령을 실행한 문서 패키지 검사만 통과했다. 검증 자기 수신처·실발송 공급사가 없어 QA69 전체는 `blocked_integration`, 정식 QA/G·실운영 검수는 남아 Task `in_progress`; Git 저장소/커밋 없음.

## 최신 C03/F02/F04 기능 — Field 개설 완료와 다음 행동 (2026-09-25)

Field 사이트 편집의 확인·공개 단계에서 서버가 승인 공개본과 tenant 주소를 확인하면 로컬 개설 완료 카드에 실제 공개 주소·고객 문의 화면·사업 운영 이동·선택 AP 연결을 분리해 보여준다. 공개 요청 응답 미상/후속 조회 실패나 주소 null에서는 완료와 고객 링크를 표시하지 않고 재조회한다. 비 mock 주소는 공개본 생성과 운영 DNS/TLS 확인을 구분한다. 실제 문의 제출은 접수로 기록된다고 안내하며 QA69 테스트 문의를 성공으로 가장하지 않는다. API/DB/계약 변경 없음.

기존 320px 전체 브라우저는 공개 확인 뒤 완료 카드 부재로 exit 1 red. 새 mock **4479**에서 `pnpm test:spike:field-owner-flow:http` 1/1은 재조회 실패·POST 결과 미상 숨김, 정상 링크, 주소 null 주입→숨김/재조회 복구와 기존 사업자→고객 문의·두 예약을 통과했다. tenant HTTP 1/1, lint/typecheck/unit·Python 구문 검사 exit 0, 양 API/웹 빌드·ready/작업실 200. 실 도메인/TLS, QA69 테스트 접수/공급사, 전체 접근성/QA/G는 미검수로 C03/F02/F04 `in_progress`; Git 저장소/커밋 없음.

## 최신 C02/C03 검수 — 로컬 보안 표준 명령 (2026-09-25)

`pnpm test:security`를 미구현 자리표시자에서 로컬 mock 전용 실행 명령으로 바꿨다. 제품 간 source import, 양방향 DB 자격증명 차단, 제품별 격리 임시 DB 권한·업무 검증, Field tenant 차단, AP/Field 관리자 권한·조회 감사의 실제 HTTP/320px 브라우저를 순서대로 실행한다. 실행 전 정확한 로컬 PostgreSQL 17·Field Valkey·양제품 API identity/웹 준비를 검사한다. 제품 API/DB/웹·계약 변경 없음.

기존 명령 exit 2 red. 전체 mock **24533**에서 새 `pnpm test:security` exit 0: AP DB 20/20·Field DB 18/18 및 각각 임시 DB 정리, tenant HTTP 1/1, 관리자 AP/Field 각 1/1, import 경계/교차 credential 28P01 통과. `NODE_ENV=production` 실행은 의도대로 exit 1, fake 하위 `pnpm` exit 7은 runner exit 1과 AP 임시 DB 정리 확인. `node --check`, lint/typecheck/unit exit 0·양 API ready. 실공급사·침투/실운영 보안·전체 QA/G는 미검수로 작업 상태는 `in_progress`; Git 저장소/커밋 없음.

## 최신 C03/F04 기능 — Field 공개 사이트 장애 화면과 회복 (2026-09-25)

Field 승인 사이트 홈/하위 페이지 조회가 503일 때 320px 고객 브라우저에 일시 장애 안내와 같은 URL 새로고침 버튼을 보여준다. API가 회복되면 실제 공개 콘텐츠로 돌아오며 404 미공개/없는 페이지는 404로 유지한다. 메타데이터 조회 실패에는 일반 제목과 noindex를 사용하고, 비공개 API 오류 본문은 노출하지 않는다. Field API/DB·AP·제품 간 계약 변경 없음.

기존 빌드의 실제 Next/장애 API 검사는 500 기본 화면에 안내 부재로 exit 1 red. 오류 화면만 넣었을 때 metadata 오류가 경계를 우회해 다시 red였고, metadata 복구 뒤 320px 브라우저에서 안내는 보였지만 `reset()`이 API를 재조회하지 않아 red였다. 버튼을 전체 새로고침으로 수정한 최종 브라우저 검사는 홈·하위 페이지 장애→버튼→API 회복·원래 URL/공개 콘텐츠·404 차단 1/1 통과했다. 새 전체 mock **24533**의 tenant 실제 HTTP 1/1, Field 사업자→고객 문의·두 예약 전체 브라우저 1/1 통과. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Node/Python 구문 검사 exit 0, 양제품 빌드·ready. 실 DNS/TLS·전체 접근성/QA/G 미검수로 C03/F04 `in_progress`; Git 저장소/커밋 없음.

## 최신 C03/F04/F05 기능 — Field tenant 공개 문의 경로의 장애 구분 (2026-09-25)

tenant 호스트 `/public/:organizationId`에서 Field API 공개 사이트 조회가 404이면 기존처럼 404, 조직 불일치도 404다. API 503·네트워크 실패는 비공개 upstream 내용 없이 no-store HTTP 503과 새로고침 안내를 반환한다. Field API/DB·AP·제품 간 계약 변경 없음.

실제 Next proxy 단위 검사는 기존 503→404 오표시에서 Field 웹 11/12 exit 1 red, 수정 뒤 12/12 green. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. 새 mock **37244**의 양제품 API/웹 빌드·ready와 작업실 HTTP 200, `pnpm test:spike:tenant-host:http`의 tenant 실제 HTTP 소유/차단 1/1을 확인했다. 서버 간 API 장애의 실제 HTTP 주입·실 DNS/TLS·전체 QA/G는 미검수이므로 C03/F04/F05는 `in_progress`. Git 저장소/커밋 없음.

## 최신 C03/A05 기능 — AP 고객 상담 링크 첫 조회 장애 복구 (2026-09-25)

AP 활성 상담 링크의 첫 배포 조회가 503·네트워크 오류일 때 중지/미승인 404와 구분하고, 같은 주소에서 명시 재조회한다. 재조회 성공 뒤 공개 사업 정보와 고객 상담/사람 문의를 연다. API/DB/Field 제품 변경 없음.

mock **68851**에서 배포 GET 503 주입 후 일시 장애 안내가 없어 AP 전체 브라우저 exit 1 red. 새 mock **70387**의 첫 재검사는 클릭 직후 다음 GET 응답을 기다리지 않는 테스트 순서로 exit 1이었고 대기 지점을 고쳤다. 최종 `pnpm test:spike:agent-owner-flow:http` 1/1은 링크 503→재조회→공개 정보 503→재조회와 기존 고객/외부 위젯·사업자 흐름을 통과했다. lint/typecheck/unit·Python 구문 검사 exit 0, 양 API/웹 build·ready. 비활성 링크 404 별도 브라우저·실모델/알림/전체 QA/G는 미검수로 C03/A05 `in_progress`; Git 저장소/커밋 없음.

## 최신 C03/A05/F05 기능 — 고객 공개 정보 첫 조회 장애 복구 (2026-09-25)

AP 상담·직접 문의와 Field 사이트의 직접 문의 진입에서 첫 공개 정보 GET 404는 미공개/없는 주소로, 503·네트워크 오류는 일시 장애로 표시하고 같은 화면에서 다시 불러온다. 정보가 없을 때 문의 제출은 비활성 상태로 유지한다. AP의 승인 안내/AI 질문 제한 문구도 로딩·미공개·실패 상태를 구분한다. API/DB/계약은 변경하지 않았다.

기존 mock **81531**에서 두 제품 320px 전체 브라우저의 503 주입은 재조회 안내 부재로 각각 exit 1 red. 새 mock **55374**의 AP·Field 전체 흐름은 각각 1/1 green. AP의 장애 후 남은 ‘불러오는 중’ 문구는 추가 단언 exit 1 red였고, 최종 mock **68851**에서 AP 전체 흐름 1/1 green. Field 코드는 앞선 green 이후 변경하지 않았고 최종 서버에서 다시 빌드·ready였다. lint/typecheck/unit·Python 구문 검사 exit 0, 두 API ready·웹 workspace 200. 실 공급사/전체 QA/G와 사용자 시각 검토는 남아 C03/A05/F05 `in_progress`; Git 저장소/커밋 없음.

## 최신 C03/A10/F10/D05 검수 — 실행 중 로컬 서버와 표준 E2E 명령 (2026-09-25)

전체 mock 서버 **81531**의 AP API `4311`·웹 `3001`, Field API `4321`·웹 `3002`가 ready/HTTP 200이었다. 세 표준 E2E 자리표시자를 로컬 DB/Valkey URL·양 API 식별·웹 준비를 확인한 뒤 실제 브라우저/HTTP 흐름을 순서대로 실행하는 `tools/run-e2e.mjs`로 바꿨다. `pnpm test:e2e:agent`는 AP 사업자 외부 위젯/고객 상담·매체 복구·관리자 3/3, `pnpm test:e2e:field`는 Field 사이트/직접 문의/두 예약 방식·자동 저장·관리자 3/3, `pnpm test:e2e:distribution`은 매체 복구·매체 카드→Field 예약 5건/서명 사건/구간 집계와 연결 해제 2/2 통과했다. 실 공급사/운영 배포·전체 QA/G는 미검수로 C03/A10/F10/D05 상태를 올리지 않았다.

기존 `test:e2e:agent`는 exit 2였다. 새 runner 첫 실행은 `valkey:` URL scheme 누락으로 exit 1이었고 허용을 고쳤다. `NODE_ENV=production` 차단은 의도대로 exit 1, `node --check`, lint/typecheck/unit exit 0. 제품 API/DB/웹·계약 변경 없음. Git 저장소/커밋 없음.

## 최신 A08/F09/C03 기능 — 제품별 관리자 6개 실제 경로 (2026-09-25)

AP와 Field `/admin` 운영 현황에 더해 각 제품의 조직·발송·AI/배포 또는 제작·도메인·구독·신고/감사 경로를 열었다. 모든 경로는 제품별 overview API의 실제 조직/구성원/운영/체험/관리자 조회 원장을 읽는다. 실청구·DNS·고객 상세 지원 접근/관리 조치는 미연결 이유만 표시하고 성공 버튼을 만들지 않았다. 양제품 관리자 경로는 noindex, 잘못된 section은 404다.

새 DB 집계 단언은 이전 API에서 AP 19/20·Field 17/18 red, 최종 각 임시 DB 20/20·18/18·삭제. 기존 웹 빌드의 신규 경로는 404 red였다. 첫 전체 mock **46872**는 서버 페이지가 client 모듈 검증 함수를 호출해 500이었고 서버/클라이언트 공용 순수 경로 모듈로 분리했다. 최종 mock **81531**의 AP/Field 관리자 브라우저 각 1/1은 제품별 6경로·실제 집계/감사·일반 계정 차단·상대 세션 401, 320px 넘침/14px 미만 0, 390px 키보드 Enter, noindex·잘못된 경로 404를 확인했다. Field tenant 호스트 관리자 경로도 404다. lint/typecheck/unit·양 API/웹 build/ready exit 0. 실 MFA·지원 상세/관리 조치·공급사·정식 QA/G는 남아 A08/F09/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 A08/F09/C03 기능 — 제품별 관리자 대기 사건과 조회 감사 (2026-09-25)

AP와 Field 관리자 overview에 각 제품 outbox의 최신 대기 사건 최대 20건을 사건 ID·유형·시각·`pending`/고객 알림 `blocked_integration`으로 표시한다. 고객 연락처·원문·payload·aggregate ID는 반환하지 않는다. 성공한 운영 조회는 제품별 `admin_access_audit`에 actor·resource·시각을 기록한다. 일반 계정과 비 mock은 기존 권한/MFA 차단을 유지하며 발송·재처리 API는 추가하지 않았다.

신규 검사는 기존 응답의 목록 누락으로 AP 19/20·Field 17/18 red. AP 첫 실패는 합성 조직 FK 정리 순서를 고쳐 원인을 확인했다. 임시 DB 최종 AP 20/20·Field 18/18·삭제, 새 mock **45681**의 AP 320px 긴 사건 유형 가로 넘침 red(383px)를 줄바꿈으로 고쳤다. 전체 mock **98932**의 AP/Field 관리자 브라우저 각 1/1은 합성 사건 표시, 비공개 값 제외, 일반 계정 거부/상대 세션 401, 관리자 감사 2건 이상·일반 계정 0건, 320px 넘침 없음을 확인했다. lint/typecheck/unit·Node `--check`·Python `py_compile` exit 0, 양 API/웹 build·ready. 실발송/MFA/관리 조치·정식 QA40/49/119/157/G는 남아 A08/F09/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 F09/C03 기능 — Field 관리자 집계 화면과 독립 권한 (2026-09-25)

Field 전용 `platform_admin_memberships`와 `/v1/admin/overview`·`/admin`을 추가했다. 사업자 권한만으로는 열 수 없고, Field operator에게 Field DB의 문의/예약/사이트/제작/알림/대기 사건 건수만 보여준다. 비 mock은 MFA 미연결 503 `blocked_integration`이다. 권한 grant/revoke 명령은 정확한 Field 로컬 mock DB에서 기존 계정에만 적용한다. AP 앱/DB/세션·공개 계약 변경 없음.

신규 Field DB 검사는 기존 경로 404로 17/18 red, 최종 임시 DB 18/18·삭제. 새 전체 mock **27508**의 320px Field 관리자 브라우저 1/1은 일반 계정 거부·operator 집계·PII 비노출·가로 넘침 없음·명시 권한 철회를 확인했다. AP→Field와 Field→AP 관리자 세션 교차 접근은 각각 401이며 AP 브라우저도 1/1이다. lint/typecheck/unit·Node `--check`·Python `py_compile` exit 0, 양 API ready·두 `/admin` HTTP 200. 실 MFA·관리 조치/감사·정식 QA49/119/157/G-F3는 남아 F09/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 A08/C03 기능 — AP 관리자 집계 화면과 독립 권한 (2026-09-25)

AP 전용 `platform_admin_memberships`를 만들고 mock의 `/v1/admin/overview`와 `/admin`에서 별도 관리자 권한을 확인한다. 일반 AP 로그인 계정은 403, 미인증은 401이며 operator는 AP 원본 DB의 건수만 본다. 비 mock은 MFA 공급사 연결 전 503 `blocked_integration`이다. 명시적 로컬 권한 grant/revoke 명령은 AP mock DB만 허용한다. Field 앱/DB/세션·공개 계약 변경 없음.

격리 AP DB 신규 검사는 최초 404 red, 최종 `pnpm test:db:agent` 20/20과 임시 DB 삭제를 확인했다. 기존 웹 빌드 `/admin` 404 red 뒤 새 전체 mock **82350**의 320px 브라우저 1/1은 일반 계정 거부·operator 집계·이메일 비노출·가로 넘침 없음을 확인했다. 첫 브라우저 재검사의 중복 문구 선택자 실패는 heading으로 고쳤다. lint/typecheck/unit exit 0, 양 API ready·AP `/admin` 및 Field `/workspace` HTTP 200. 실 MFA·관리 조치/감사·Field 관리자·정식 QA49/119/157/G-A3는 남아 A08/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 C02/I07 검수 — AP 표준 DB 검사의 임시 DB 격리 (2026-09-25)

기존 `test:db:agent`는 Field 검사와 달리 작업 중인 AP mock DB에 직접 migration·테스트를 실행했다. 제품별 임시 DB 생성/검사/정리로 runner를 통일했다. 전체 mock 실행 중 AP 20/20, Field 17/17은 각각 임시 DB에서 통과·삭제됐다. 의도적으로 AP 자식 명령을 exit 7로 실패시킨 경우 상위 exit 1, 임시 DB 잔여 0을 실제 PG17에서 확인했다. 이전 기록의 ‘격리 AP DB’ 표기는 이 수정 전 상태에는 정확하지 않다. 운영 백업/복원·정식 독립성 QA/G는 별도이며 C02/I07은 `in_progress`다.

## 최신 D01/C03 기능 — AP 매체 조직 생성 응답 분실의 단일 원본 복구 (2026-09-25)

AP 매체 생성 API는 사용자별 선택 UUID 제출 키를 받아 동일 이름의 병렬·반복 요청을 같은 매체 ID로 수렴시킨다. 같은 키와 다른 이름은 409, 다른 사용자에게 같은 키는 독립이다. 생성 outbox는 한 건이다. 웹은 응답 분실 시 입력·키를 유지하고 결과 미상과 같은 입력 재시도를 안내한다. AP 전용 migration 000049를 추가했고 Field DB·제품 간 공개 계약은 변경하지 않았다.

기존 격리 DB 검사는 잘못된 키를 201로 수락해 18/19 exit 1 red, 기존 320px 브라우저는 POST commit/ACK 분실에서 기대 결과 미상 문구가 없어 exit 1 red. 새 전체 mock **40020**의 최종 `pnpm test:spike:publisher-recovery:http` 1/1은 같은 키 재시도 뒤 조직 한 건과 기존 매체 가입·조회 복구·도메인/위치 등록을 포함한다. 격리 AP DB 19/19, lint/typecheck/unit·Python `py_compile` exit 0, 양 API/웹 build·ready와 작업 화면 HTTP 200. 관리자 운영실은 아직 실제 라우트가 없고 실인증/MFA·실 DNS/정식 QA92/119/G-D1은 남아 D01/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 C03/D01 기능 — AP 매체 관리 조회 장애와 조직 생성 ACK 분리 (2026-09-25)

AP 매체 화면에서 인증 401은 로그인, 첫 목록·세부 목록의 503/네트워크 장애는 명시 재조회로 구별한다. 조직·도메인·위치 등록과 배치 결정의 POST 성공 뒤 목록만 실패하면 저장 성공을 유지하고 재조회하도록 한다. AP API/DB/migration·Field 앱/공개 계약 변경 없음.

기존 mock **33647**의 새 320px 브라우저는 첫 목록 503에서 실패/재조회 UI가 없어 `pnpm test:spike:publisher-recovery:http` exit 1 red. 새 전체 mock **34901**의 최종 같은 명령 1/1은 첫 목록 503→재시도/401, 신규 매체 조직 201→목록 503→재조회·원본 한 건, 세부 목록 503→재조회, HTTPS origin 도메인·광고 위치 등록과 가로 넘침 없음을 포함한다. 격리 AP DB 18/18, lint/typecheck/unit·Python `py_compile` exit 0, 양 API/웹 build·ready. 실 DNS·배치 승인 전체 화면·정식 QA92/119/G-D1은 남아 C03/D01 `in_progress`; Git 저장소/커밋 없음.

## 최신 C03/F02 기능 — Field 섹션 키보드 편집과 공개 순서 (2026-09-25)

Field 사이트 편집기의 섹션마다 번호가 있는 접근성 그룹과 위로·아래로·삭제 버튼 이름을 제공한다. 320px에서 Enter로 두 섹션의 순서를 바꾸고 임시 섹션을 삭제한 뒤, 같은 순서가 Field 서버 초안·승인 공개본·고객 화면에 반영되는 것을 확인했다. Field API/DB/migration·AP 앱/공개 계약 변경 없음.

기존 빌드의 전체 Field 브라우저는 새 `2번 섹션 위로 이동` 접근성 이름을 찾지 못해 exit 1 red. 새 전체 mock **33647**에서 최종 `pnpm test:spike:field-owner-flow:http` 1/1, 격리 Field DB 17/17, lint/typecheck/unit·Python `py_compile` exit 0, 양 API/웹 build·ready와 두 작업 화면 HTTP 200. 전체 키보드/스크린리더/200% 확대·정식 QA57~59/119/G-F1은 남아 C03/F02 `in_progress`; Git 저장소/커밋 없음.

## 최신 A02/C03 기능 — AP 고객 후속 사진 저장 뒤 대화 조회 복구 (2026-09-25)

AP 고객의 추가 질문 사진 업로드가 201/200 ACK됐으면 이후 대화 GET 단절을 사진 저장 실패로 표시하지 않는다. 저장 성공을 유지하고 AP 확인키로 원본 메시지·비공개 사진을 명시 재조회한다. 업로드 응답 자체를 잃은 경우에는 원래 파일/메시지 ID를 보관한다. AP API/DB/migration·Field 앱/공개 계약 변경 없음.

기존 320px 브라우저는 실제 PNG 업로드 201 ACK 뒤 GET 단절에서 성공/재조회 UI가 없어 `pnpm test:spike:agent-owner-flow:http` exit 1 red. 새 전체 mock **53435**의 최종 신규 사업자→상담 링크/일반 외부 소유 위젯→비회원 문의·후속 대화 전체 브라우저 1/1은 201 ACK→GET 단절→재조회·PrivateInquiryPhoto/원본 첨부 한 건을 확인했다. 격리 AP DB 18/18, lint/typecheck/unit·Python `py_compile` exit 0, 양 API/웹 build·ready. 실모델/알림/결제·정식 QA20/41/57/119/143/G-A2와 사용자 디자인 확인은 남아 A02/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 A02/A03/C03 기능 — AP 고객 추가 질문 저장 뒤 대화 조회 복구 (2026-09-25)

AP 비회원 고객의 추가 질문 POST가 201/200 ACK되면 이어지는 대화 GET 단절을 POST 실패로 바꾸지 않는다. 같은 AP 확인키로 명시 재조회해 원본 메시지를 확인한다. AP API/DB/migration·Field 앱/제품 계약 변경 없음.

기존 320px 브라우저는 POST 201 뒤 GET 단절에서 저장 성공/재조회 버튼이 없어 `pnpm test:spike:agent-owner-flow:http` exit 1 red. 새 mock **7618**의 최종 신규 사업자→상담 링크/일반 외부 소유 위젯·비회원 대화 1/1은 GET 단절 뒤 재조회·질문 한 건을 확인했다. 격리 AP DB 18/18, lint/typecheck/unit·Python `py_compile` exit 0, 양 API/웹 build·ready. 사진 업로드 뒤 동일 장애는 다음 단계에서 검수했다. 실공급사·정식 QA17~20/41/143/G-A2는 남아 A02/A03/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 F05/C03 기능 — 고객 후속 사진 저장 뒤 대화 조회 복구 (2026-09-25)

Field 고객이 후속 질문의 실제 사진 업로드 POST에서 201/200 ACK를 받았으면 이후 대화 GET 단절을 사진 업로드 미상으로 표시하지 않는다. 저장 성공을 유지하고 같은 확인키로 원본 대화·비공개 사진을 명시 재조회한다. 업로드 응답 자체를 잃었을 때는 원래 파일/메시지 ID를 보관해 동일 hash 재시도를 유지한다. Field API/DB/migration·AP/계약 변경 없음.

기존 320px 브라우저는 업로드 201 ACK 뒤 GET 단절에서 저장 성공/재조회 UI가 없어 `pnpm test:spike:field-owner-flow:http` exit 1 red. 새 mock **97844**의 전체 신규 사업자→사이트/문의/후속 대화·두 예약/조건 재동의 흐름 1/1은 실제 PNG 업로드→GET 단절→명시 재조회·PrivateInquiryPhoto 표시/원본 첨부 한 건을 확인했다. 격리 Field DB 17/17, lint/typecheck/unit·Python `py_compile` exit 0, 양 API/웹 build·ready. 실알림 공급사/정식 QA20/41/57/119/143/G-F2와 사용자 화면 검토는 남아 F05/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 F05/F06/C03 기능 — 고객 추가 질문 저장 뒤 대화 조회 복구 (2026-09-25)

Field 비회원 고객의 후속 질문 POST가 서버에서 201/200으로 확인됐으면 이어지는 대화 GET 단절을 질문 미전달로 표시하지 않는다. 저장 성공을 유지하고 같은 확인키로 ‘문의 내용 다시 확인’을 제공한다. 새 질문/알림을 만들지 않고 Field 원본 목록을 읽는다. API/DB/migration·AP·제품 계약 변경 없음.

기존 320px 브라우저는 POST 201 뒤 GET 네트워크 단절에서 저장 성공·재조회 UI가 없어 `pnpm test:spike:field-owner-flow:http` exit 1 red. 새 mock **26784**의 최종 전체 사업자→고객 사이트/직접 문의/후속 답변·두 예약/조건 재동의 흐름 1/1은 이 경로의 명시 재조회와 같은 고객 메시지 한 건을 확인했다. 격리 Field DB 17/17, lint/typecheck/unit·Python `py_compile` exit 0, 양 API/웹 build·ready. 사진 업로드 뒤 보조 조회 단절, 실공급사/정식 QA17~20/41/57/119/143/G-F2와 사용자 시각 확인은 남아 F05/F06/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 F07/C03 기능 — 변경된 서비스 조건 동의 결과 미상 복구 (2026-09-25)

고객이 사업자의 새 카탈로그 가격/서비스/시간을 확인하고 다시 제출할 때 POST 응답이 사라져도 미전달로 단정하지 않는다. 확인키로 원본 예약 사건 revision+1·카탈로그 revision·선택 서비스 ID와 현재 요청 시간을 대조한다. 조회 장애 중에는 새 재제출을 숨기고 명시 재조회하며, 원본 revision이 그대로면 입력을 유지한다. POST 200 뒤 보조 예약 GET 실패는 저장 성공과 구별한다. Field API/DB/migration·AP/공개 제품 계약 변경 없음.

첫 두 브라우저 실패는 접근성 이름 선택자에 해당 textarea가 잡히지 않은 검사 입력 문제여서 조건 재확인 form 범위로 고쳤다. 기존 웹의 재확인 POST commit/ACK 분실→첫 예약 GET 503은 결과 확인 경로가 없어 `pnpm test:spike:field-owner-flow:http` exit 1 red. 새 전체 mock **16996**에서 최종 320px 신규 사업자→사이트/문의/두 예약·기존 고객/사업자 처리 복구→가격 변경 승인/고객 재동의 ACK 분실·첫 GET 503·단일 사건→기록 파일 브라우저 1/1. 격리 Field DB 17/17, lint/typecheck/unit·Python `py_compile` exit 0, 양 API/웹 build·ready. 실제 발송·정식 QA25~34/57/119/G-F2·사용자 시각/흐름 승인은 미완료로 F07/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 F07/C03 기능 — 고객 예약 처리 결과 미상 복구 (2026-09-25)

Field 고객의 제안 수락·시간 변경·취소 요청 POST 응답이 사라져도 미전달로 단정하지 않는다. 확인키로 예약 원본 사건의 시작 revision+1, 고객 actor, 유형, 입력을 대조해 반영/미반영/다른 변경을 구별한다. 예약 GET 장애 중에는 후속 예약 조작을 숨기고 명시 재조회를 제공한다. POST 200 뒤 보조 조회 실패는 저장 성공과 분리한다. Field API/DB/migration, AP/공개 제품 계약 변경 없음.

기존 320px 실제 웹의 제안 수락 commit 뒤 ACK 분실/예약 GET 503에서 복구 UI가 없어 `pnpm test:spike:field-owner-flow:http` exit 1 red. 새 전체 mock **19020**의 최종 브라우저 1/1은 사업자 신규 가입→사이트/문의/두 예약 방식·기존 owner 처리 복구·운영 파일과 세 고객 요청의 ACK 분실→GET 503→재조회/사건 단일 기록을 포함한다. 격리 Field DB 17/17, lint/typecheck/unit·Python `py_compile` exit 0, 양 API/웹 build·ready, 두 `/workspace` HTTP 200. 서비스 조건 재확인 POST의 유사 경로와 실발송·정식 QA31~33/57/119/G-F2·사용자 화면 검토는 남아 F07/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 F07/C03 기능 — 예약 처리 결과 미상·사건 재조회 (2026-09-25)

Field 사업자의 예약 확정·시간 제안·취소·거절 등 상태 결정 POST 응답이 사라지면 ‘미전달’로 단정하지 않고 해당 예약의 원본 사건 revision·유형·입력을 읽어 반영/미반영/다른 변경을 구분한다. 예약 GET도 실패하면 같은 화면에서 재조회하고 그동안 상태 처리 버튼을 숨긴다. 이미 POST 200/201을 받은 뒤 목록 조회만 실패한 경우는 처리 ACK와 화면 조회 오류를 분리한다. Field API/DB/migration, AP/공개 제품 계약 변경 없음.

기존 320px 신규 사업자 브라우저에서 확정 POST 서버 반영 뒤 응답 분실·예약 GET 503을 주입하니 결과 미상/재조회가 없어 exit 1 red였다. 최종 `pnpm test:spike:field-owner-flow:http` 1/1은 사이트 공개→직접 문의→두 예약 방식→전화 예약의 실제 화면에서 확정·시간 제안·취소·거절의 POST ACK 분실, 첫 GET 503, 명시 재조회 및 사건 유형별 한 건을 포함한다. 격리 `pnpm test:db:field` 17/17, lint/typecheck/unit exit 0. 새 전체 mock **82869**에서 두 API·웹 build 완료. 고객 외부 알림은 공급사 미연결 상태이며 실제 발송 성공으로 표시하지 않는다. 전체 QA25~34/57/119·G-F2와 사용자 시각/흐름 승인은 미완료로 F07/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 F07/C03 기능 — Field 전화 예약 응답 분실·중복 복구 (2026-09-25)

사업자가 전화 예약을 수동 등록할 때 같은 조직·제출 키·내용은 기존 Field 예약 ID로 복구한다. 서버는 예약 행에 이미 마련된 제출 키/본문 hash와 조직별 transaction lock을 사용해 병렬 요청을 201/200 한 건으로 수렴시킨다. 기존 키는 체험 만료 뒤에도 확인할 수 있고 다른 내용은 409, 신규 예약은 만료 정책대로 403이다. 웹은 응답 분실 때 결과 미상과 동일 입력 재시도를 안내하고 키를 유지한다. AP 앱/DB·제품 간 계약/migration 변경 없음.

신규 DB 검사에서 기존 API의 병렬 동일 키는 201/409로 exit 1 red, 기존 320px 웹은 POST commit 뒤 응답 분실을 ‘미전달’로 오인해 exit 1 red였다. 최종 격리 `pnpm test:db:field` 17/17은 동일 ID/점유·사건·outbox 1건, 본문 충돌/무인증·타 조직/키 누락, 체험 만료 후 재시도와 새 업무 거부를 포함한다. `pnpm test:spike:field-owner-flow:http` 1/1은 신규 사업자→사이트 공개→직접 문의·두 예약 방식→전화 예약 ACK 분실/동일 키 재시도/실제 목록 한 건→운영 기록 다운로드를 포함한다. lint/typecheck/unit exit 0, 새 전체 mock **79052**에서 AP/Field API·웹 빌드 완료. 실발송/실청구/전체 QA25~34·57·119/G-F2와 사용자 디자인 확인은 미완료다. F07/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 I04/C03 기능 — AP 고객 Field 전달 기록 조회 실패 중 새 업무 차단 (2026-09-25)

AP 고객 화면에서 기존 ActionRequest 기록 등 필수 조회가 실패하면 새 Field 요청 조건 확인·동의·제출 양식을 숨긴다. 같은 화면 재조회가 모두 성공한 뒤 양식을 다시 연다. 서버의 원본 대화·예약·연결 상태는 바꾸지 않았다. AP 웹과 320px 브라우저 회귀 검사만 변경했다.

기존 빌드의 서비스 GET 503 및 재시도 중 ActionRequest 기록 GET 503 주입에서 새 조건 확인 버튼이 보여 `pnpm test:spike:ap-field:http` exit 1 red였다. 최종 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1은 조회 오류 중 신규 양식 숨김→두 번째 재조회 뒤 열림과 기존 동의/인계·사건/답변·해제 흐름을 통과했다. `pnpm lint`·`pnpm typecheck`·`pnpm test:unit` exit 0. 새 전체 mock **49780**의 AP/Field API ready, 웹 `/workspace` HTTP 200. 실공급사/정식 QA139/141/143/G-I2와 전체 운영 장애는 미검수다. I04/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 A07/F09/C03 기능 — 양제품 체험 상태·결과 미상 복구 (2026-09-25)

AP/Field 구독 화면의 상태 새로고침이 실패하면 이전 체험 상태를 지우고 버튼을 닫는다. 체험 시작/종료 요청의 HTTP 거절은 상태 코드를 표시하고, 응답 자체를 받지 못하면 성공/실패를 단정하지 않고 결과 미상으로 안내한다. 두 경우 모두 같은 제품의 서버 구독 원장을 다시 읽을 때까지 체험 조작을 열지 않는다. API/DB/migration/제품 간 계약 변경 없음.

성공 조회 뒤 구독 GET 503 주입에서 기존 카드가 남아 AP 브라우저 exit 1 red, 체험 시작 POST commit 뒤 응답 분실에서도 결과 미상 안내가 없어 exit 1 red였다. 최종 `FIELD_SUBSCRIPTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:subscription:http` 1/1은 AP/Field 각각 GET 503→오류/조작 숨김→키보드 Enter 재조회, 시작·종료 POST의 서버 반영 뒤 응답 분실→결과 미상→원장 확인, 기존 체험 만료 후 문의·예약 정리 접근까지 포함한다. `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·양 웹 build exit 0, 전체 mock **5390**에서 양 API ready·두 구독 화면 HTTP 200. 640px/CSS 200% 비로그인 주요 8경로는 가로 넘침·14px 미만·JS 오류 0이었으나 인증 뒤 전체 접근성/사용자 디자인 검토·실결제/정식 QA는 미완료. A07/F09/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 A08/C03 기능 — AP 계정·체험·사업 설정의 직접 문의 파일 포함 (2026-09-25)

AP owner의 기존 직접 문의 JSON 파일에 owner 계정·조직 구성원 역할, AP 자체 체험 동의/기간·종료 예약, 지식·AI 초안과 승인본, 상담 링크/소유 위젯 배포의 공개 ID·origin·상태를 추가했다. 조직별 repeatable-read 스냅샷과 필드별 allowlist로 추출한다. 세션/비밀번호·OAuth 토큰·배포 소유 증명값·고객 확인키는 제외하며 owner 재권한/파일 SHA-256 감사, 500건/64 MiB와 사진 검증을 유지한다. Field 앱/DB·AP migration·제품 간 계약 변경 없음.

새 DB 단언은 `account` 누락으로 exit 1 red였다. 최종 `pnpm test:spike:attachments:agent` 1/1(계정·editor·체험 시작/종료·지식·AI·배포·비밀 제외/권한/감사), `pnpm test:db:agent` 18/18, `pnpm test:spike:export:http` 1/1, `pnpm test:spike:agent-owner-flow:http` 1/1(320px 신규 사업자→일반 외부 사이트 위젯/비회원 접수·답변→실제 다운로드 계정·구성원·지식/AI 승인·배포 필드), lint/typecheck/unit·AP API/웹 build·import 경계 exit 0. 새 전체 mock **98525**에서 양 API ready·웹 `/workspace` 200. 완전한 계정/OAuth/매체 원장·분할 아카이브·보존/삭제/복구·실결제/공급사·정식 QA는 남아 A08/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 F09/C03 기능 — Field 계정·체험·연결 메타데이터 운영 파일 (2026-09-25)

Field owner의 기존 운영 기록 JSON에 owner 계정 식별 정보와 조직 구성원/역할, Field 자체 체험 동의·기간·종료 예약, AP 연결의 선택 AI/배포 범위·scope·상태 및 양방향 해제/확인 시각을 추가했다. 같은 repeatable-read 조직 스냅샷에서 허용 열만 읽고 토큰 암호문·client 비밀·세션·비밀번호·AP 상담 원문은 제외한다. 구성원/연결 각 500건 상한과 기존 64 MiB/감사·owner 권한을 유지한다. Field 구독 화면의 파일 설명을 갱신했다. AP 앱/DB·Field migration·공개 계약 변경 없음.

새 DB 단언은 `account` 누락으로 exit 1 red였다. 첫 typecheck/Field API build는 nullable account 타입으로 exit 2였고 불완전 조직-owner 관계를 명시적으로 중단하도록 고쳤다. 최종 `pnpm test:spike:attachments:field` 1/1(계정·editor·체험 시작/종료·양방향 해제·비밀 제외/권한/감사), `pnpm test:db:field` 17/17, `pnpm test:spike:export:http` 1/1, `pnpm test:spike:field-owner-flow:http` 1/1(320px 신규 사업자→사이트/문의/두 예약→실제 다운로드의 계정/구성원 필드), lint/typecheck/unit·Field API/웹 build·import 경계 exit 0. 전체 mock **39559**에서 두 API ready·웹 `/workspace` 200. 실청구·전체 계정/연동 사건·분할 파일·보존/삭제·공급사/정식 QA는 남아 F09/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 C03 기능 — 작업실 최초 조회 실패 복구 (2026-09-25)

AP/Field 사업자 작업실이 세션 조회 또는 인증된 사업 정보 조회의 503을 로그인/첫 조직 상태로 잘못 표시하던 흐름을 수정했다. 두 웹의 `failed` 상태는 오류와 재시도 버튼을 표시하며, 재시도 시 세션과 사업 초안을 다시 조회한다. 200/세션 없음·401은 기존 로그인, 인증 뒤 사업 초안 404는 첫 조직 화면으로 유지한다. API/DB/계약 변경 없음.

양제품 실제 320px Chromium에서 신규 사업자 가입 후 세션 GET 503을 주입한 새 탭은 기대 오류 화면이 없어 각각 exit 1 red였다. 새 전체 mock 세션 **85209**의 최종 `pnpm test:spike:agent-owner-flow:http`·`pnpm test:spike:field-owner-flow:http` 각 1/1은 세션 503·사업 초안 503 각각의 오류/로그인 숨김/재시도 복구와 이후 고객 업무를 통과했다. `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·두 웹 build exit 0; AP/Field API ready와 두 웹 `/workspace` HTTP 200. 브라우저 네트워크 단절 주입, 사용자 시각 승인·200%/스크린리더 전체·실인증 공급사/정식 QA는 미검수다. C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 F09/C03 기능 — Field 수신 외부 업무·복사 사진의 운영 파일 (2026-09-25)

Field 조직 owner의 운영 파일에 정식 공개 계약으로 수신한 외부 문의와 예약 요청 사본 전체를 포함한다. 고객/서비스/요청 snapshot, 출처·동의·수신 상태를 명시 필드로 내보내고, 복사 완료한 외부 사진만 Field 저장소에서 크기·SHA-256을 검증해 바이트를 넣는다. 대기·복사 실패 사진은 상태와 오류 코드만 남긴다. AP 원본 대화·client/grant·토큰·객체 키는 제외한다. 같은 UUID의 사이트 사진과 외부 수신 사진은 종류별로 분리한다. AP 앱/DB·Field migration·제품 간 계약은 변경하지 않았다.

신규 `externalRequests` 단언은 누락으로 exit 1 red, worker가 합성 pending을 바꾼 경합은 fixture 실행 시각을 미래로 고정했다. 실패 원인 코드 누락도 exit 1 red 뒤 수정했다. 최종 focused Field DB 1/1, 전체 Field DB 17/17, 양제품 웹 프록시 export 1/1, 320px Field 사업자→사이트/문의/두 예약 방식→운영 파일 다운로드 1/1, lint/typecheck/unit·Field API/웹 build·import 경계 exit 0. 전체 mock 세션 **11909**에서 두 API ready·웹 `/workspace` 200. 운영 실구독·보존/삭제/복원·전체 계정/연동 아카이브, 사용자 화면 검토·정식 QA/G는 남아 F09/C03 `in_progress`; Git 저장소/커밋 없음.

## 최신 C02/A08/F09 검수 — 제품별 로컬 mock 백업과 격리 복원 (2026-09-25)

AP/Field 각각의 mock PostgreSQL 17 덤프와 DB에서 참조하는 제품별 사진 파일을 새 0700 디렉터리에 담는 명령을 추가했다. 덤프를 먼저 네트워크 단절 임시 PG17에 복원해 제품 스키마·사진 참조를 확인하고, 파일 크기/SHA-256이 모두 맞으면 manifest를 마지막에 기록한다. 별도 확인 명령도 새 PG17에 복원한다. 사용법은 `docs/technical/LOCAL_BACKUP_RUNBOOK.md`에 남겼다. AP/Field 앱·migration·공개 계약은 변경하지 않았다.

첫 합성 검사 4/4는 PG 초기화 중 소켓 응답을 최종 준비로 오인해 실패했다. TCP 준비 확인으로 고친 뒤 `pnpm test:backup:mock` 8/8은 두 제품별 정상 복원·사진, 누락·변조·다른 제품 DB·저장소 밖 심볼릭 링크 거절을 통과했다. lint/typecheck/unit·`node --check` exit 0, 두 API ready·웹 작업실 200. 현재 서비스 mock 자료의 백업/복원은 실행하지 않았다. 운영 S3/DB, 삭제·revoke 원장 재적용·주기/보존·RPO/RTO 실측과 QA47/G는 남아 C02/A08/F09는 `in_progress`다. Git 저장소/커밋 없음.

## 최신 기능 보강 — F09/C03 Field 조직 운영 기록 묶음 내보내기 (2026-09-25)

Field 조직 owner는 구독·데이터 화면에서 자기 사업의 사업정보·사이트 초안/공개본과 사이트 사진, Field 직접 문의/비공개 사진·메모, 예약·상태 사건·알림·수동 차단/외부 출처 메타데이터를 한 JSON 파일로 받는다. AP 상담 원문·확인키·저장소 키는 포함하지 않는다. 500건/64 MiB 상한은 413, 사진 누락/손상은 503으로 파일 생성을 막는다. 성공한 생성은 Field 전용 감사 원장에 actor·조직·건수·파일 크기/SHA-256을 남긴다. 다른 조직/editor/무인증은 접근할 수 없다.

신규 경로 404 red 뒤 Field DB 17/17, 첨부 DB 1/1(두 문의/예약 사건/실제 두 저장소 사진 바이트·타 조직/editor/무인증/손상/감사), lint/typecheck/unit·Field 웹 build·import/DB 격리 exit 0. 전체 mock 세션 **87716**에서 두 API ready·웹 `/workspace` 200, 양제품 웹 프록시 export HTTP 1/1, 320px 사업자→사이트 공개→고객 문의/두 예약 방식·확정→구독 화면 실제 묶음 다운로드/내용·overflow/page error 0 브라우저 1/1. 실청구/정리 모드, 전체 계정·연동 수신 기록의 대용량 분할 아카이브, 보존/삭제·복원·관리자·정식 QA/G는 남아 F09/C03은 `in_progress`. Git 저장소/커밋 없음.

## 최신 기능 보강 — A08/C03 AP 조직 문의·사진 묶음 내보내기 (2026-09-25)

AP 조직 owner는 구독·데이터 화면에서 자기 조직의 직접 문의 전체를 메시지·내부 메모·고객 사진 WebP 바이트와 함께 JSON으로 받는다. 비밀 확인키와 저장소 키는 제외한다. 500건·64 MiB를 넘으면 413, 사진 저장소가 없거나 바이트/해시가 다르면 503으로 파일 생성을 거절한다. 성공한 파일 생성은 AP 감사 원장에 actor·조직·건수·파일 크기·SHA-256을 기록한다. 다른 조직·editor·비회원은 접근할 수 없다. Field API/DB나 제품 간 계약은 바꾸지 않았다.

신규 경로 404 red, `Map.groupBy` typecheck 실패와 임시 editor membership 때문에 기존 사진 권한 검사가 실패한 사례를 각각 수정했다. AP DB 18/18, 첨부 DB 1/1을 별도 실행했고, 최종 mock 세션 **24840**에서 양제품 웹 프록시 export HTTP 1/1, AP 신규 사업자→일반 외부 사이트 위젯→비회원 문의→320px 구독 화면의 파일 다운로드/내용·가로 넘침·page error 0 브라우저 1/1을 통과했다. lint/typecheck/unit·API/웹 build·import 경계 exit 0, 양 API ready·양 웹 `/workspace` 200. 문서 패키지 검사는 서비스 검사가 아닌 `document_package_only` 통과다. 전체 계정·배포/청구 데이터 및 대용량 분할·보존/삭제·복구·정식 QA/G는 남아 A08/C03은 `in_progress`이며 Git 저장소/커밋은 없다.

## 최신 기능 보강 — A05/C03 AP 상담 배포 생성·상태 복구 (2026-09-25)

AP 배포 생성 POST의 응답이 사라지면 새 링크/위젯이 실제 저장됐는지 알 수 없고, 같은 버튼을 다시 누르면 별도 배포가 생겼다. 배포 목록 GET 503도 빈 목록처럼 보이며 생성 버튼이 열려 있었다. AP 내부 migration 000047에 조직+생성 키의 DB 유일 제약을 만들고 선택적 `idempotencyKey`를 받는 기존 API에 같은 요청 재시도 200/동시 수렴·다른 내용 재사용 409를 추가했다. 기존 키 없는 클라이언트는 유지했다. 화면은 조회 성공 전 조작을 숨기고, POST 결과 미상은 같은 키로만 재확인한다. 활성화 완료 뒤 조회 실패와 활성화 응답 분실은 서로 다르게 표시한다.

기존 `pnpm test:spike:deployments:agent`는 같은 키 반복 201로 exit 1 red, 기존 320px 브라우저는 목록 GET 503 뒤 ‘배포 없음’ 노출로 exit 1 red였다. 새 전체 mock 세션 **40524**에서 최종 AP 사업자→일반 외부 사이트 위젯→비회원 문의/답변 브라우저 1/1은 목록 GET 503→재시도, 링크 POST commit 뒤 ACK 분실→같은 키/한 배포, 활성화 POST 성공 뒤 GET 503→재조회, 위젯 활성화 POST ACK 분실→재조회/설치 코드 복구를 통과했다. AP 전체 DB 18/18은 키 반복·동시 POST·다른 payload/잘못된 키·위젯 재시도를 포함한다. 별도 임시 AP PG17 DB에 47개 migration을 처음부터 적용해 새 UUID 열을 확인하고 임시 DB를 정리했다. Field 연결 소비자 1/1, lint/typecheck/unit exit 0, 양 API/웹 build·ready. Field 앱/DB·공개 SDK/양제품 계약 변경 없음. 실 DNS/TLS·모델/발송·전체 QA/G와 사용자 디자인 검토는 남아 A05/C03은 `in_progress`; Git 저장소/커밋 없음.

## 최신 C03 화면 복구 — Field 가입·로그인 주 동작 (2026-09-25)

실제 비로그인 작업실을 640px Chromium에서 두 차례 확인하니 AP 로그인 버튼은 주 동작으로 보였지만 Field는 UA 기본 회색 버튼이었다. 공통 폼의 제출 버튼·체크박스 규칙이 AP 로컬 CSS에만 있던 것이 원인이었다. 이를 무상태 `@fieldai/ui/states.css`로 옮겨 양제품 작업실에서 동일하게 적용했다. [수정 전](docs/technical/evidence/c03-field-workspace-before.png)·[수정 후 320px](docs/technical/evidence/c03-field-workspace-after-320.png)·[수정 후 640px](docs/technical/evidence/c03-field-workspace-after-640.png) 화면을 남겼다.

전체 mock 세션 **82723**의 AP/Field 320·640px Chromium에서 버튼 배경 `rgb(22,87,159)`, 높이 48px, 글자 16px, 키보드 초점 윤곽선, 가로 넘침 없음, JS 예외 0을 확인했다. 기존 신규 사업자→고객 실제 브라우저 `pnpm test:spike:agent-owner-flow:http`·`pnpm test:spike:field-owner-flow:http` 각 1/1, lint/typecheck/unit exit 0, 양 API/웹 build·ready. API/domain/DB migration/계약 변경 없음. 200% 전체 경로·스크린리더·최종 사용자 디자인 확인과 정식 QA/G는 남아 C03은 `in_progress`; Git 저장소/커밋 없음.

## 최신 기능 보강 — A04/C03 AP AI 초안 저장 결과 미상·충돌 복구 (2026-09-25)

AP AI 설정 PUT이 서버에 반영됐지만 응답만 사라진 경우에도 기존 화면은 ‘요청 미전달’이라고 단정했다. 이제 저장 결과 미상에서는 화면 입력을 보존하고 승인·테스트를 막으며, 재저장 전에 GET으로 서버 초안/revision을 확인한다. GET이 실패하면 같은 화면에서 재시도한다. 서버 초안이 내 입력과 다르거나 PUT 409이면 양쪽 내용을 확인하고 ‘내 입력으로 다시 저장’ 또는 ‘서버 초안 사용’을 명시 선택한다.

기존 AP mock 웹의 320px 검사에서 PUT commit 뒤 응답 분실은 결과 미상 안내 부재로 exit 1 red였다. 새 전체 mock 세션 **19010**의 최종 `pnpm test:spike:agent-owner-flow:http` 1/1은 PUT 응답 분실→GET 503→재조회 revision 복원·중복 PUT 없음, 외부 수정 뒤 409에서 내 입력 재저장, 재차 409에서 서버 초안 선택, 이전 AI 승인 조회/응답 분실 복구와 일반 외부 사이트 위젯→비회원 접수·사업자 답변까지 통과했다. `pnpm test:db:agent` 18/18, lint/typecheck/unit exit 0, Python 브라우저 검사 `py_compile` exit 0, 양 API/웹 build·ready. AP API/DB migration·Field 앱·공개 계약 변경 없음. 실제 LLM·알림/결제·전체 QA/G와 사용자 화면 검토는 남아 A04/C03은 `in_progress`; Git 저장소/커밋 없음.

## 최신 기능 보강 — A04/C03 AP AI 승인 상태 복구 (2026-09-25)

AP AI 설정 화면에서 첫 승인 AI/지식 GET 장애를 ‘승인 없음’으로 바꿀 수 있던 흐름을 고쳤다. 각 필수 조회의 정상 404와 503/네트워크 오류를 구분하고 `ready` 전에는 승인·테스트 조작을 숨기며 같은 화면에서 재시도한다. 승인 POST가 서버에서 반영됐으나 응답이 사라지면 결과 미상으로 표시하고 추가 POST 없이 재조회한다. POST 성공 뒤 상태 GET만 실패하면 이미 완료된 승인과 재조회 필요를 분리한다.

기존 AP 웹의 320px 신규 사업자 검사에서 첫 release GET 503은 오류 표시 부재로 exit 1 red였다. 새 전체 mock 세션 **81965**의 최종 `pnpm test:spike:agent-owner-flow:http` 1/1은 release GET 503→재시도, 지식 GET 503→재시도, 첫 승인 POST commit 뒤 응답 분실→revision 1 재조회·중복 POST 없음, 두 번째 승인 POST 성공 뒤 latest GET 503→revision 2 재조회를 통과했다. 같은 신규 사업자→일반 외부 사이트 위젯→비회원 접수/사업자 답변 흐름도 통과했다. `pnpm test:db:agent` 18/18, 지식 자동 저장 1/1, Field 연결 소비자 1/1, lint/typecheck/unit exit 0, 양 API/웹 build·ready와 두 웹 HTTP 200. AP API/DB migration·Field 앱·공개 계약 변경 없음. 실 LLM·알림/결제·전체 QA/G와 사용자 화면 검토는 남아 A04/C03은 `in_progress`; Git 저장소/커밋 없음.

## 최신 기능 보강 — F02/F04/C03 공개 상태 조회 실패 복구 (2026-09-25)

Field 사이트 편집기가 공개본·과거 릴리스·사진·승인 카탈로그·AI 작업 조회 실패를 각각 ‘공개 전’·‘버전 없음’·‘사진 없음’으로 보여줄 수 있었다. 필수 조회의 예상된 404와 장애를 분리하고 전부 성공한 뒤에만 편집·공개·복구 조작을 연다. 공개 POST는 성공했는데 뒤이은 공개본 GET의 네트워크만 끊긴 경우에는 이미 완료된 공개를 ‘요청 미전달’로 오인하지 않고, 공개 완료·상태 재조회 필요를 표시한다.

공개 POST 자체가 서버에서 commit된 뒤 응답만 사라지면 결과는 미상이다. 기존 문구의 ‘요청 미전달’ 단정을 없애고 편집/재공개 대신 재조회를 제공한다. 실제 320px 브라우저에서 두 번째 공개 POST의 응답을 버린 검사는 exit 1 red였고, 새 mock 세션 **17539**에서 같은 전체 사업자→고객 경로 1/1 green이었다. 재조회한 공개 revision이 서버 초안과 같고 해당 릴리스가 한 건이며 추가 공개 POST가 없음을 확인했다. 최종 lint/typecheck/unit exit 0, 양 API/웹 build·ready와 웹 HTTP 200. 저장/tenant/DB 검수는 아래 단계에서 통과했으며 마지막 응답 분실 수정 뒤 반복하지 않았다.

기존 빌드의 320px 신규 Field 사업자→고객 브라우저 검사는 공개 GET 503 뒤 오류 표시 부재로 exit 1 red, 이후 공개 POST 뒤 첫 GET 단절은 잘못된 ‘요청 미전달’ 표시로 exit 1 red였다. 수정·새 mock 빌드 뒤 앞선 세션 **56824**의 `pnpm test:spike:field-owner-flow:http` 1/1은 공개 POST 뒤 GET 단절→재조회, 재로그인/새로고침 공개 GET 503→재조회, 릴리스 목록 GET 503→재조회, 실제 공개 사이트→비회원 문의/답변·두 예약 방식/확정을 통과했다. 같은 단계에서 `pnpm test:spike:site-autosave:http` 1/1, tenant host 1/1, 격리 Field DB 17/17, lint/typecheck/unit exit 0. Field API/migration·AP·제품 계약 변경 없음. 실공급사·실 DNS/TLS·전체 접근성/정식 QA/G는 남아 F02/F04/C03은 `in_progress`; Git 저장소/커밋 없음.

## 최신 기능·검수 보강 — F02/C03 초기 조회 재시도·C02/I07 Field DB 격리 (2026-09-25)

Field 사이트 편집 첫 사업 정보나 초안 조회가 일시적으로 실패할 때 계정/조직 없음으로 표시하거나 오류를 가리던 흐름을 수정했다. `loading`·`failed`·`needs_setup`·`ready` 상태를 분리하고 같은 화면에 재시도 버튼을 둔다. 사이트 생성 뒤 후속 조회 실패도 성공 문구로 덮지 않는다. 기존 320px Chromium/PG17 검수에서 첫 사업 정보 GET 503을 넣으면 재시도 부재로 exit 1 red였고, 수정 후 사업 정보와 초안 GET에 각각 503 한 번을 주입해 두 재시도와 기존 저장 실패/충돌·모바일 전환·새로고침 재개를 1/1 통과했다.

전체 mock 세션 **76315**에서 `pnpm test:spike:field-owner-flow:http` 1/1, `pnpm test:spike:tenant-host:http` 1/1, 양 API/웹 build·ready. 실행 중 Field 사건 worker와 DB 검사가 동일 전달 큐를 소비해 첫 `pnpm test:db:field`가 16/17(`acked` 기대, `empty` 실제)로 실패했고 재실행 17/17이었다. Field DB runner가 로컬 mock PG17의 독립 임시 DB를 만들고 종료 시 정리하도록 변경한 뒤 worker 활성 상태에서 17/17 연속 2회 통과했다. 자식 명령 실패를 의도한 검사는 exit 1·임시 DB 정리, 잔여 테스트 DB 0개였다. 변경된 runner의 AP 분기도 18/18, 마지막 lint/typecheck/unit exit 0, 양 API ready·두 웹 `/workspace` HTTP 200. 문서 패키지 검사 `document_package_only` 통과는 서비스 검사가 아니다. Field API/worker·migration·제품 계약 변경 없음. 실공급사/전체 접근성/정식 QA·출시 게이트는 남아 관련 작업은 `in_progress`; Git 저장소/커밋 없음.

## 최신 독립 검수 보강 — C02/C03 양제품 단독 실제 화면 흐름 (2026-09-25)

제품별 `pnpm test:independence:*` 명령이 기존 HTTP 업무에 이어 각 제품의 320px 합성 사업자·비회원 브라우저 경로도 순차 실행한다. 상대 제품의 API/웹·DB·큐 컨테이너/포트는 시작과 종료에 없는지 검사한다. AP/Field 런타임·DB migration·공개 계약은 변경하지 않았다.

전체 mock을 종료하고 AP DB를 볼륨 보존 중지한 `pnpm test:independence:field` exit 0은 Field만의 빌드/PG17/HTTP와 새 사업자→사이트 공개→직접 문의·답변→두 예약 방식의 실제 320px 브라우저 1/1을 통과했다. Field DB/Valkey를 중지한 `pnpm test:independence:agent` exit 0은 AP만의 빌드/PG17/외부 소유 사이트 HTTP와 신규 사업자→상담 링크/위젯→고객 접수·답변의 320px 브라우저 1/1을 통과했다. 전체 mock은 세션 **29965**로 복구해 양 API ready·두 웹 HTTP 200. `node --check`, lint/typecheck/unit exit 0. 실 LLM·발송·청구·DNS/TLS·실기기, 전체 QA121/122/출시 게이트는 남아 C02/C03·제품 작업은 `in_progress`다. Git 저장소/커밋 없음.

## 최신 기능 보강 — F02/C03 Field 사이트 초안 작업 위치 재개 (2026-09-25)

Field 사이트 편집기에서 서버에 저장된 초안을 새로고침하면 디자인 단계·첫 페이지로 돌아가던 흐름을 고쳤다. 선택한 단계와 페이지 ID는 검증된 URL 상태로 복원하고, 다른 브라우저에서 일반 편집 URL을 열면 저장된 draft revision을 근거로 편집 단계에 진입한다. 원문·공개본은 기존 Field API/DB에만 남고 URL은 UI 위치만 나타낸다. Field API·DB migration·AP 코드/계약 변경 없음.

기존 320px Chromium/PG17 자동 저장 경로에 새로고침·별도 로그인 브라우저 검사를 추가해 단계 초기화 exit 1 red를 확인했다. 새 mock 세션 **74654**의 양 API/웹 build·ready에서 최종 자동 저장 1/1은 페이지 4·제목 재개, 잘못된 페이지 ID의 홈 대체, 다른 브라우저의 서버 초안 재개와 기존 저장 실패/409/공개본 비노출을 통과했다. Field 사업자→고객 전체 1/1, tenant host 1/1, DB 17/17, lint/typecheck/unit exit 0. 다른 기기에서 마지막 선택 페이지 자동 동기화와 전체 QA61/접근성·실공급사는 남아 F02/C03은 `in_progress`다. Git 저장소/커밋 없음.

## 최신 기능 보강 — F04/C03 Field 승인 사이트 페이지별 검색 메타데이터 (2026-09-25)

Field 공개 사이트의 홈과 하위 페이지에 승인 release의 페이지 이름·상호·첫 본문(없으면 승인 소개)을 문서 제목·설명으로 표시한다. canonical은 서버가 만든 해당 사이트 tenant origin으로 고정하며, 플랫폼 주소/요청 Host·미승인 초안은 canonical 근거가 아니다. Field 작업실과 mock 검토본은 noindex/nofollow를 출력한다. API·DB migration·AP 코드/공개 계약 변경 없음.

기존 mock 빌드의 tenant-host 검사는 공통 Field 문서 제목 때문에 exit 1 red였다. 새 `pnpm mock:run` 세션 **3216**에서 양 API/웹 build·ready. 최종 `pnpm test:spike:tenant-host:http` 1/1은 공개 2페이지 메타데이터·동일 canonical·작업실/검토본 noindex·미공개/교차 tenant 404와 320px 공개 이동을 통과했다. Field 사업자→고객 전체 브라우저 1/1, 사이트 자동 저장 1/1, Field DB 17/17, lint/typecheck/unit exit 0. 실제 DNS/TLS·검색엔진 색인, 전체 QA79/G-F1과 사용자 시각 검토는 남아 F04/C03은 `in_progress`다. Git 저장소/커밋 없음.

## 최신 기능 보강 — F02/C03 Field 모바일 페이지 편집·미리보기 전환 (2026-09-25)

Field 실제 사이트 편집기의 320px 페이지 단계에서 편집과 초안 미리보기를 버튼으로 전환하고, 미리보기 메뉴에서 고른 페이지 ID를 편집 선택과 연결했다. 입력 영역은 전환 중에도 유지해 저장 전 입력을 보존한다. 데스크톱에서는 편집과 미리보기를 함께 표시한다. Field API·DB migration·AP 코드·공개 계약은 변경하지 않았다.

전환 버튼 부재를 실브라우저 exit 1 red로 확인했다. mock 세션 **9358**의 양 API/웹 build·ready에서 최종 사이트 자동 저장 1/1은 320px 버튼/키보드 Enter, 페이지 선택, 미저장 입력 왕복, 저장/실패/충돌·공개본 비노출, 가로 넘침/page error 0과 1440px 동시 표시를 통과했다. Field 사업자 전체 흐름 1/1, Field DB 17/17, tenant host 1/1, lint/typecheck/unit exit 0. 두 API ready와 AP `/workspace`·Field `/workspace/site` HTTP 200. 사용자 시각·전체 접근성, 실 DNS/TLS/공급사, 정식 QA/G는 미검수다. F02/C03은 `in_progress`; Git 저장소/커밋 없음.

## 최신 독립 검수 — C02/A05/C03 Field 부재 AP 외부 위젯 업무 (2026-09-25)

표준 AP 단독 검사의 기존 가입·지식 승인·직접 문의/답변·체험 경로에 AP 자체 AI 승인과 일반 외부 사이트 위젯의 HTTP 업무를 추가했다. 별도 합성 `.localhost` 사이트가 소유 증명 경로를 공개하고, AP는 증명 전 409/증명 후 등록을 확인한다. 활성 SDK iframe의 nonce→세션→1회 인계에서 AP 상담 원본과 first-party 쿠키를 만들고, 고객 사람 문의→사업자 답변→확인키 열람까지 검수한다. AP/Field 앱·DB migration·공개 계약 변경 없음.

전체 mock 세션 88287을 정상 종료하고 Field DB·Valkey 컨테이너를 볼륨 보존 `stop`한 뒤 `pnpm test:independence:agent` exit 0: runner는 Field 컨테이너·API/웹/DB/큐 포트 부재를 시작/종료에 확인하고 AP의 자체 PG17·API·웹을 빌드해 실제 HTTP 흐름을 실행했다. 전체 mock은 세션 **82695**로 복구했고 두 API `ready`, 두 웹 `/workspace` HTTP 200을 확인했다. `node --check tools/spikes/independence-flow.mjs`, lint/typecheck/unit exit 0. 이 검사는 AP 단독 HTTP 흐름이며 320px 전체 브라우저 경로는 앞 단계의 전체 mock 검수다. 실모델/발송/결제/DNS/TLS·외부 배포·정식 QA/G는 남아 C02/A05/C03이 `in_progress`다. Git 저장소/커밋 없음.

## 최신 기능 보강 — A05/C03 AP 일반 외부 사이트 위젯 셀프 설치와 직접 문의 (2026-09-25)

새 AP 사업자가 Field·매체 없이 독립 로컬 외부 사이트 origin을 배포 화면에서 등록하고, 그 사이트의 `/.well-known/ap-site-verification` 경로에 증명값을 공개해 소유 확인 후 위젯을 활성화하는 실제 화면 경로를 추가 검수했다. 로컬 origin에도 DNS TXT만 보이던 안내를 서버의 로컬 HTTP 검증 방식과 맞췄다. 모델 미설정 iframe에서 AP로 넘어온 사람이 접수할 때 AP 원본 상담/고객 세션이 없어 404가 나던 문제를 고쳤다. 위젯의 별도 직접 문의 링크가 세션 없는 위젯 전용 상담 주소로 열려 제출 404가 나는 문제도 AP 공개 문의 주소로 고쳤다. 제품 간 계약·migration·Field 앱 변경 없음.

검수는 세 번의 실제 red를 확인했다: 소유 증명 안내 불일치, 모델 미설정 위젯 handoff 뒤 문의 404, 새 비회원의 직접 링크 문의 404. 수정 후 mock 세션 **88287**에서 `pnpm test:spike:agent-owner-flow:http` 1/1은 기존 AP 상담 링크와 별도 외부 사이트의 무증명 거절→증명 게시/확인→SDK iframe/모델 차단→AP handoff·고객 사람 문의→사업자 답변·확인키 재열람, 새 비회원의 직접 링크 접수를 320px Chromium/실 AP PG17로 확인했다. `pnpm test:db:agent` 18/18, 마지막 수정 후 `pnpm test:spike:deployments:agent` 1/1, 공유 인계의 Field 연결 HTTP/브라우저 회귀 1/1, lint/typecheck/unit exit 0. 양 API ready·두 API/웹 build. 이번 검사는 Field 서버가 켜진 mock이므로 Field 미배포 독립성의 새 증거는 아니다. 실 HTTPS/DNS·모델/발송/결제·운영 QA/G 및 시각/접근성 전체 검수는 남아 A05/C03은 `in_progress`다. Git 저장소/커밋 없음.

## 최신 기능 보강 — F05/F06/C03 문의 답변 중 메모 초안 보존·C02/I07 DB 검사 경합 제거 (2026-09-25)

Field 문의 답변의 서버 저장 응답을 보류한 동안 사업자가 비공개 메모를 입력하면, 기존 재조회가 두 작성칸을 초기화해 메모를 지웠다. 320px Chromium에서 exit 1 red를 확인한 뒤 `apps/field-web/src/field-workspace.tsx`의 문의 선택과 저장 후 갱신을 분리했다. 저장 후에는 다른 미제출 초안과 요청 중 바뀐 제출칸 내용을 유지한다. 브라우저 검사는 비공개 메모가 고객 확인키 화면에는 나오지 않는 것도 확인한다. Field API·migration·제품 간 계약 변경 없음.

같은 mock PostgreSQL에서 Field 사건 worker가 먼저 delivery 행을 만들면 `reconcileApEventDeliveries`의 전역 신규 삽입 수가 3 대신 1이 되어 DB 검사가 간헐적으로 실패했다. 재실행 17/17로 경합을 확인하고 `apps/field-api/test/integrator.db.test.ts`의 단언을 자기 합성 연결 delivery 3건과 전환 후 미전달 사건으로 좁혔다. 런타임 delivery 구현은 바꾸지 않았다. mock 세션 **32481**에서 양쪽 API/웹 build·ready, Field 전체 웹 경로 `pnpm test:spike:field-owner-flow:http` 1/1, AP 전체 웹 경로 `pnpm test:spike:agent-owner-flow:http` 1/1, worker 실행 중 `pnpm test:db:field` 17/17 연속 3회, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. 실발송·실모델·운영 장애와 전체 QA/G는 미검수이며 작업은 `in_progress`다. Git 저장소/커밋 없음.

## 최신 기능 보강 — A00/A01/A02/A03/A05/C03 AP 사업자→상담 링크→비회원 문의 (2026-09-25)

새 AP 계정/조직이 실제 작업 화면에서 사업 지식과 AI 설정을 각각 승인하고 상담 링크를 활성화한 뒤, 별도 320px 비회원 브라우저가 모델 공급사 미설정 상태를 확인하고 사람 문의를 제출하는 경로를 연결 검수했다. 사업자는 AP 원본에 답변과 비공개 메모를 저장했고 고객은 별도 확인키로 답변만 다시 읽었다. 긴 상담 링크가 320px 배포 카드에서 가로로 넘치던 문제를 해당 링크의 줄바꿈으로 고쳤다. 답변 저장 중 입력한 메모가 문의 재조회에서 사라지는 문제도 재현해, 저장 후 다른 작성 초안을 유지하고 제출 후 변경 없는 해당 입력만 비우도록 했다. Field 앱/DB와 제품 간 계약·migration 변경 없음.

초기 검수 링크 선택자 오류 뒤 320px 실제 넘침 433px을 확인했다. 수정 후 지연된 답변 응답 중 메모 작성 검사에서 초안 삭제가 red였고, 수정한 최종 `pnpm test:spike:agent-owner-flow:http` 1/1은 전체 흐름·가로 넘침/page error 0을 통과했다. 새 mock 세션 7764의 두 API/웹 build·ready, `pnpm test:db:agent` 18/18, knowledge-autosave 1/1, signout 1/1, lint/typecheck/unit exit 0. 진짜 Field 미배포 독립성, 실인증/모델/알림/결제/DNS와 전체 QA/G는 이번 경로에서 미검수이며 작업 상태는 `in_progress`다. Git 저장소/커밋 없음.

## 최신 연결 검수 — F07/C03 두 예약 방식의 고객·사업자 실제 화면 (2026-09-25)

앞서 만든 신규 사업자→공개 사이트→직접 문의 경로에 Field 자체 희망시간형/시간표형 서비스를 함께 승인하는 단계와 예약 정책, 두 비회원 예약 접수, 사업자의 명시적 최종 확정, 고객의 별도 확인키 상태 조회를 연결했다. 고객 요청은 확정 전 `신청 접수`였고, 사업자가 10시 요청형을 확정한 뒤 다른 서비스의 10시 시간표는 제외되고 11시는 신청 가능했다. 두 고객의 별도 확인키로 `확정`을 다시 열었다. 앱 코드·DB migration·AP 공개 계약 변경 없음.

처음 세 실패는 두 select의 정확 label 검색과 네이티브 option의 기본 visible 대기라는 브라우저 검수 선택자 문제였다. 서비스 2개가 화면에 남고 9시 옵션이 DOM에 있는 것을 진단한 뒤 범위/대기 조건을 바로잡았다. 최종 `pnpm test:spike:field-owner-flow:http` 1/1, Field PG17·320px Chromium 가로 넘침/page error 0, 합성 계정 정리. `pnpm test:db:field` 17/17, `pnpm test:spike:tenant-host:http` 1/1, `pnpm test:spike:site-autosave:http` 1/1, lint/typecheck/unit exit 0, 양 API ready. 실알림 공급사·DNS/TLS·사용자 시각/접근성·정식 QA/G-F2 전체는 미검수이고 F07/C03은 `in_progress`다. Git 저장소/커밋 없음.

## 최신 연결 검수 — F02/F04/F05/F06/C03 신규 사업자부터 비회원 후속 대화 (2026-09-25)

새 검수 명령 `pnpm test:spike:field-owner-flow:http`는 정확한 Field mock PG17·Field API 준비 상태와 웹을 확인한 뒤 합성 계정을 만들고, 320px Chromium의 사업자 화면에서 가입·조직 생성·서비스 초안 자동 저장/승인·2페이지 사이트 편집/공개를 수행한다. 별도 비회원 브라우저에서 tenant 공개 메뉴·직접 문의·확인키를 확인하고, 사업자 답변을 저장한 다음 고객이 확인키로 원문과 답변을 다시 연다. 합성 데이터는 검사 종료 때 정리한다. 앱 코드·DB migration·제품 간 계약 변경 없음.

첫 두 실행은 검수 locator가 `본문` select와 텍스트 입력, `연락처` 입력과 동의 checkbox를 함께 선택해 exit 1이었으며 locator를 정확히 지정했다. 최종 전체 HTTP/브라우저 1/1, 320px 두 브라우저 가로 넘침/page error 0. `pnpm test:spike:tenant-host:http` 1/1, `pnpm test:spike:site-autosave:http` 1/1, `pnpm test:db:field` 17/17, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0, AP·Field API ready. 실인증·발송·결제·실 DNS/TLS, 사용자 시각 검토와 정식 QA/G 전체는 남아 있으므로 관련 작업은 `in_progress`다. Git 저장소/커밋 없음.

## 최신 기능 보강 — F02/C03 Field 페이지 경로 편집 복구 (2026-09-25)

Field 사이트 편집기에서 페이지 2·3을 추가하고 2를 삭제한 뒤 다시 추가하면 새 페이지가 기존 `page-3`을 재사용해 서버 저장이 막혔다. 새 번호는 현재 slug와 겹치지 않게 고른다. 페이지 선택은 변경 가능한 slug 대신 ID로 유지하고, 수동 입력한 중복·잘못된 경로/빈 이름은 서버 전송 전에 이유를 표시한다. 수정한 뒤 자동 저장을 다시 시도한다. API·DB·공개 계약 변경 없음.

320px 실브라우저/PG17에서 번호 중복과 수동 경로 중복 시 페이지 선택 오류를 각각 red로 확인했다. 최종 mock 세션 73050의 두 API/웹 build·ready에서 `pnpm test:spike:site-autosave:http` 1/1은 재추가 `page-4`, 서버 초안 유일 경로, 중복/형식 오류 API 요청 차단, 수정 후 저장과 기존 장애·충돌 검사를 통과했다. `pnpm test:spike:tenant-host:http` 1/1, lint/typecheck/unit exit 0. 전체 QA60·키보드/접근성 및 실 DNS/TLS는 미검수다. Git 저장소/커밋 없음.

## 최신 기능 보강 — F02/F04/C03 Field 공개 다중 페이지 주소 (2026-09-25)

Field 사이트 편집기에서 정한 소개 페이지 slug를 실제 공개 주소 `/site/{사이트}/{페이지}`로 연결했다. 서버가 승인된 사이트 버전의 페이지를 조회해 렌더링하고 없는 페이지·미승인 초안 페이지는 404다. 공개 메뉴는 직접 링크라 새로고침과 뒤로/앞으로 이동이 유지되며 미리보기의 로컬 페이지 선택은 유지한다. tenant 호스트는 자기 사이트만 허용한다. API·DB·제품 간 계약 변경 없음.

기존 두 번째 페이지 URL의 404를 실제 HTTP에서 exit 1 red로 확인했다. 최종 mock 세션 23289의 두 API/웹 build·ready에서 `pnpm test:spike:tenant-host:http` 1/1 green은 두 사업장·공개/초안 분리·플랫폼/tenant 경로·320px 브라우저 메뉴/CTA·가로 넘침/page error 0을 검수했다. `pnpm test:spike:sites:field` 2/2, `pnpm test:spike:site-autosave:http` 1/1, lint/typecheck/unit·Field 웹 build exit 0. 실제 DNS/TLS, 전체 QA09/60/접근성 및 출시 게이트는 미검수다. Git 저장소/커밋 없음.

## 최신 기능 보강 — A00/F00/C03 제품별 로그아웃 (2026-09-25)

AP와 Field 사업자 작업 화면에서 자기 제품의 실제 세션을 명시적으로 종료할 수 있다. 미저장 초안·전송 전 답변·저장 중에는 버튼과 이유를 표시하고, 요청 오류는 로그인 성공으로 위장하지 않는다. API·DB·제품 간 계약은 바꾸지 않았다.

기존 화면의 버튼 부재를 320px 실제 브라우저에서 exit 1 red로 확인했다. 최종 mock 세션 41360에서 양쪽 API/웹 build·ready, `FIELD_SIGNOUT_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:signout:http` 1/1 green: 미저장 조직명에서 비활성·비운 후 활성, AP 종료 뒤 Field 세션 유지, Field 종료 뒤 양쪽 기존 세션 쿠키 폐기, 가로 넘침/page error 0. 기존 문의 답변/메모는 성공이 확인된 뒤 입력을 비워 버튼이 계속 잠기지 않게 했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. 실메일·카카오, 전체 세션 회수/MFA, 전체 QA/출시 게이트는 미검수다. Git 저장소/커밋 없음.

## 최신 기능 보강 — C03/A00/F00/I00 로그아웃 세션 화면 복구 (2026-09-25)

AP·Field의 비로그인 세션 조회는 정상적으로 HTTP 200 JSON `null`을 반환한다. 작업 화면과 연결 로그인 화면 일부가 이 값을 객체로 가정해 예외를 내고 “인증 서버에 연결할 수 없습니다”로 잘못 표시했다. AP 작업/연결/동의와 Field 작업/동의의 다섯 화면에서 `null`을 로그아웃으로 처리했다. 네트워크 요청 실패는 기존 오류 표시를 유지한다. API·DB·공개 계약 변경 없음.

Chrome AP 작업 화면에서 거짓 오류를 관찰했고 새 320px Chromium 검사도 수정 전 AP 화면에서 exit 1 red였다. 수정 후 mock 세션 16918의 두 제품 API/웹 build·ready에서 다섯 로그아웃 화면 5/5, page error 0·가로 넘침 0. 기존 로그인 후 양방향 HTTP/320px 전체 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. 실메일/카카오·운영 인증/접근성 전체는 미검수이며 작업 상태는 계속 `in_progress`다. Git 저장소/커밋 없음.

## 최신 검수 기반 — I07 로컬 연동 장애 회귀 명령 (2026-09-25)

문서의 `pnpm test:integration:faults` placeholder를 실제 로컬 mock 검사로 바꿨다. 실행 전 AP/Field 각자의 mock PG 접속 대상과 Field Valkey, 두 API의 제품별 준비 응답·두 웹 HTTP 200을 확인한다. 공개 OpenAPI 정적 2/2, AP의 요청 결과 미상/Field 연결·인가 DB 3/3, Field의 위임 답변 결과 미상/인가·해제 DB 2/2, 별도 제품 API·worker 실제 HTTP 1/1을 차례로 실행한다. 각 child 실패/종료는 상위 명령의 실패로 처리한다.

기존 명령 exit 2 red, 정확한 mock DB/Valkey 제한을 넣은 최종 `pnpm test:integration:faults` exit 0을 실제 실행했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`도 exit 0. 이 명령은 실서버 중지·장기 네트워크 장애, HMAC 키 회전, 구버전 consumer 호환, 실제 공급사의 결과 미상과 I07/QA/G 전체를 검증하지 않는다. I07은 `in_progress`이고 출시 승인도 아니다. Git 저장소/커밋 없음.

## 최신 기능 보강 — C03/I04 고객 Field 연결 조회 실패·재시도 (2026-09-25)

AP 고객이 자기 문의를 열 때 Field 서비스 목록 조회가 일시 실패해도 연결 패널을 숨기지 않고 오류와 재시도를 보여준다. 서비스·전달 기록·문의 사진의 세 조회를 각각 처리해, 하나가 실패해도 성공한 AP 전달 기록을 읽고 기존 원요청 확인 경로를 사용할 수 있다. 재시도는 같은 고객 확인키로 목록을 다시 읽으며 새 외부 업무를 자동 제출하지 않는다. API·DB·공개 계약은 변경하지 않았다.

320px 실제 연결 브라우저에서 첫 서비스 목록만 503으로 바꾸자 기존 화면은 패널이 사라져 timeout/전체 명령 exit 1 red였다. 수정 후 새 mock 세션 36104의 양쪽 API/웹 build·ready에서 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1: 오류·기존 기록·재시도와 기존 예약/새 전달/Field 코드/해제 경로를 확인했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` exit 0. 실 Field 서버 중지·장기 장애와 전체 QA119/143/G-I2는 미검수이고 C03/I04는 `in_progress`다. Git 저장소/커밋 없음.

## 최신 기능 보강 — D04 매체 유입 Field 예약의 전체 경로 (2026-09-25)

AP owner가 공개 인가 화면에서 자기 조직의 활성 매체 승인 배포(`placement_embed`)를 정확히 선택할 수 있다. 공개 AP 계약 `1.0.0-preview.6`의 선택 배포 목록도 새 종류를 반환하며, Field 소비자는 이를 해석하지만 Field 자체 사이트 설치는 계속 소유 origin의 `owned_embed`만 허용한다. 매체/캠페인 생성이 AP 기본 위젯이나 미연결 AP 상담에 필요해진 것은 아니다. DB migration은 없다.

실제 두 제품 로컬 PostgreSQL 17·Field Valkey·API/웹/사건 worker에서 별도 매체 계정의 카드/배치 승인과 iframe handoff→AP의 `live` 원본 문의→고객 5명의 Field 현재 조건 확인·별도 동의/예약 요청→Field owner 확정→서명 사건 AP inbox 처리까지 수행했다. 완료된 주만 표시하는 규칙에 맞춰 검수용 AP mirror 확정 시각만 지난주로 옮긴 후 사업자·매체 JSON 및 매체 CSV가 예약 최초 확정 `5-9`, 매출·수금 `not_measured`였고 매체 출력에 고객 식별정보가 없음을 확인했다. 320px Chromium 매체 화면에서 `5~9건`, CSV 링크, 가로 넘침 없음/page error 0도 확인했다. 이는 실 DNS나 사건 시계 조작에 대한 운영 검수가 아니다.

첫 HTTP는 AP 선택의 404 `deployment_not_found`, 새 공개 계약 정적 검사는 enum 누락으로 red였다. 수정 뒤 fixture의 첫 배포 순서 가정, 한국 영업시간 밖 UTC 예약 시각, 인접 주 날짜가 둘 다 걸린 Playwright 선택자가 차례로 실패해 고치고 전체 재실행했다. 최종 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_DISTRIBUTION_E2E=1 FIELD_DISTRIBUTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1, 기존 양방향 HTTP 1/1, AP DB 15파일 18/18·Field DB 10파일 17/17, `pnpm test:contracts` 정적 2/2·DB 5/5, lint/typecheck/unit/import/DB 자격증명 격리 exit 0. mock 세션 57645에서 두 API/웹 build·ready, 합성 HTTP 계정 양쪽 잔여 0명. 실매체 DNS/TLS, 실모델/발송/결제, 복수 역할 차분 공격과 정식 QA104~107/G-D2는 미검수로 D04는 `in_progress`다. Git 저장소/커밋 없음.

## 최신 기능 보강 — D04/QA107 Field 예약 최초 확정 성과 (2026-09-25)

AP는 이미 서명 수신·처리한 Field 예약 확정 사건 원장에서 배포 문의의 최초 확정 시각을 읽어 사업자·매체별 완료 UTC 주 8개의 구간값으로 반환한다. 같은 예약의 재확정은 한 번만 세며, AP 문의의 `live` 배포 귀속과 같은 사업 조직, 예약 요청 종류를 재확인한다. 미리보기·테스트·식별된 봇은 제외한다. 연결도 기간 내 확정 사건도 없으면 확정 지표는 `unsupported_unconnected`, 현재 연동 또는 과거 사건이 있으면 5건 미만 억제 구간을 표시한다. JSON/CSV에 예약 ID·연락처·이름을 넣지 않고 매출/수금은 계속 미측정이다. 새 DB·제품 간 공개 계약 변경 없음.

새 집계 기대의 초기 DB 검사에서 `unsupported_unconnected`가 나와 red, 구현 중 기존 응답의 새 `bookings` 필드 deep equality 실패를 조정한 뒤 `pnpm test:spike:distribution:agent` 1/1과 `pnpm test:spike:field-actions:agent` 1/1 통과. `pnpm test:db:agent` 15파일 18/18, `pnpm test:contracts` 정적 2/2·제공자/소비자 DB 5/5, lint/typecheck/unit/import/DB 자격증명 격리 exit 0. 전체 mock을 세션 13199로 재기동하며 두 제품 API/웹을 빌드했고 AP·Field API ready를 확인했다. 실제 Field 예약→서명 사건→AP 매체 집계의 단일 HTTP/browser E2E와 새 집계 화면 320px/시각 검토, 복수 역할 차분 공격·운영 QA107/G-D2는 미실행이므로 D04는 `in_progress`다. Git 저장소/커밋 없음.

## 최신 기능 보강 — I04 고객 선택 AP 사진의 Field 비공개 수신 (2026-09-25)

고객이 AP 원본 문의에 저장한 사진을 Field 전달 화면에서 최대 5개 개별 선택·별도 동의한다. AP는 같은 문의의 준비된 고객 사진 ID만 ActionRequest에 고정하고 현재 공개 OAuth grant·actor·연결·배포·동의가 맞을 때만 WebP 바이트를 반환한다. Field는 외부 업무를 먼저 멱등 수락한 뒤 자체 DB에 사진별 `pending` 원장을 만들고 별도 worker로 AP API를 읽어 비공개 사본을 저장한다. 실패는 `copy_failed`로 남기고 재시도하며, Field 사업자는 자기 조직의 상태와 완료 사본만 열 수 있다. 원본 AP 대화와 임의 URL은 Field에 복제/조회하지 않는다.

AP/Field DB 집중 각 1/1, 정식 `pnpm test:contracts` 정적 2/2·제공자/소비자 DB 5/5, `pnpm test:db:agent` 18/18, `pnpm test:db:field` 17/17, `pnpm test:unit`, `pnpm lint`, `pnpm typecheck`, import/DB credential 격리 exit 0. 새 mock 세션 11480에서 두 제품 API/웹 빌드·ready와 320px Chromium 고객 사진 업로드→선택/동의→Field worker 복사→사업자 HTTP 인증 다운로드의 양방향 전체 `FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1을 확인했다. 최초 정적 계약은 미구현으로 red였고, 최초 두 HTTP 재실행은 검사 스크립트의 외부 요청 ID 누락으로 실패했다. 수정 후 전체 재실행이 통과했다. 실 S3/악성코드 검사/보존·revoke 경쟁/장기 장애·운영 공급사와 QA142/G-I 전체는 미검수이며 I04는 계속 `in_progress`다. Git 저장소/커밋 없음.

Field 사업자 320px 브라우저 검수도 같은 양방향 fixture에 추가해 전체 1/1 재실행했다. 별도 Field 로그인→외부 문의 선택→`copied` 상태·실제 이미지 로딩·다운로드 링크, 가로 넘침 없음/page error 0을 확인했다.

## 최신 기능 보강 — A05/I04 상담 링크의 직접 사람 접수·동시 시작 (2026-09-25)

상담 링크 고객이 AI 버튼을 건너뛰어도 웹이 활성 배포의 AP 상담 세션을 먼저 만들고 같은 원본에 사람 문의를 접수한다. 상담 세션의 초기 조회·생성을 AI 질문과 사람 제출이 공유해 두 버튼을 거의 동시에 눌러도 세션 생성 POST가 하나다. AP 조직 직접 문의 주소는 배포 없는 자체 접수로 유지한다. 서버의 생성 중 AI 답변 억제·사람 접수 원자성은 기존 DB 경합 테스트대로 유지한다.

기존 빌드의 320px 양방향 연결 브라우저에서는 직접 접수 뒤 Field 패널 부재로 red(exit 1)를 확인했다. 새 `pnpm mock:run` 세션 94753으로 두 제품 API·웹을 다시 빌드하고 네 서버 ready를 확인했다. `FIELD_SAME_PAGE_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1은 AI 실패 대체·AI 미사용 직접 제출·지연된 세션 생성 중 동시 제출의 세 경로에서 AP 원본 배포 귀속/동의와 Field 외부 요청 출처 ID 일치, 320px 가로 넘침 없음/page error 0을 확인했다. 동시 경로의 세션 생성 POST는 1회였다. `pnpm test:db:agent` 15개 파일 18/18, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, import/DB 자격증명 격리 exit 0. 실모델 응답 중 UI 인계·실발송·첨부 인증 복사·운영/출시 QA는 미검수다. Git 저장소/커밋 없음.

## 최신 기능 보강 — I04 AP 상담 화면에서 Field 문의로 이어가기 (2026-09-25)

AP 상담 링크는 모델/예산 설정이 없어도 익명 대화 원본을 만든다. 실제 AI 메시지 호출은 503 `blocked_integration`으로 남기고 고객 질문을 사람 문의 입력에 보존한다. 고객의 첫 동의 접수는 같은 원본 ID와 link 배포 귀속을 유지한다. 연결된 Field 서비스가 있을 때만 같은 화면에 외부 요청 패널을 표시하고, 현재 조건·전달 내용·별도 동의 후 Field 일반 문의를 수락 상태로 보여준다. Field에는 동의한 요청 요약과 원본 ID만 전달하며 AP 원문 복제나 예약 확정은 하지 않는다.

AP DB 집중 1/1, 전체 AP DB 15개 파일 18/18, 새 빌드 `pnpm mock:run` 세션 64953의 두 API·웹 ready, 320px Chromium을 포함한 양방향 HTTP 1/1이 통과했다. 브라우저는 모델 실패 표시→질문 보존→AP 접수→같은 화면 Field 문의·별도 동의→AP/Field DB 원본 ID 대응·가로 넘침 없음/page error 0을 검사했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:contracts`(정적 2/2·DB 5/5), import/DB 자격증명 격리 exit 0. 초기에 상담 링크 fixture 대신 embed 배포를 사용해 404, 모델 미설정 원본 생성 503, 브라우저의 중복 locator와 status 접근성 이름 기대 오류가 있었고 각각 수정 후 전체 흐름을 재실행했다. 실모델 응답 중 인계·실알림·첨부 인증 복사·운영 배포와 QA/G 전체는 미검수이며 I04는 `in_progress`다. Git 저장소/커밋 없음.

## 최신 검수 기반 — C02 제품별 단독 실행 명령 (2026-09-25)

`pnpm test:independence:agent`와 `:field`의 미구현 exit 2를 실제 로컬 단독 검수로 교체했다. runner는 반대 제품 compose 컨테이너와 API/웹/DB(및 Field Valkey) 포트를 확인해 살아 있으면 중지·삭제하지 않고 실패한다. API 자식에게는 자기 DB/인증/필요한 Field 큐·미디어 설정만 전달하고 상대 제품 DB·OAuth connector·모델 비밀은 제거한다. 자기 제품 compose→migration→API/웹 build 뒤 실제 웹 프록시에서 가입·조직·mock 체험·승인·고객 접수/응대와 AP SDK 또는 Field 사이트/예약을 검사한다. 합성 데이터와 API/웹 자식은 종료 시 정리하며 DB 볼륨은 유지한다.

기존 두 명령은 각 exit 2 red, runner 단위 검사는 모듈 부재 red→2/2 green이었다. 실제 Field DB/큐 정지 상태의 AP 명령 exit 0, 실제 AP DB 정지 상태의 Field 명령 exit 0이었다. 첫 AP 흐름은 결제 미설정 응답 코드를 잘못 기대했고, 첫 Field 흐름은 사이트 공개본의 카탈로그 참조를 고려하지 않아 합성 데이터 정리에 실패했다. 코드 기대값과 정리 순서를 수정해 둘 다 전체 재실행 통과했고 잔여 합성 계정은 양쪽 0명이다. 전체 mock을 세션 98257로 복구해 두 API ready, 반대 컨테이너가 있는 상태의 Field 독립 명령은 사전 검사에서 exit 1이며 기존 서버는 유지됐다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, import/DB credential 격리 exit 0. OS 네트워크 ACL·실모델·알림·PG·실 DNS/TLS와 정식 QA121~124/출시 게이트는 미검수다. Git 저장소/커밋 없음.

## 최신 기능 보강 — Field 예약 한 건의 정리 기록 export (2026-09-25)

Field owner가 자기 조직의 기존 예약 한 건을 사업자 상세 화면에서 JSON으로 내려받는다. Field DB의 같은 읽기 snapshot에서 예약 스냅샷·순서 있는 사건·Field 알림 원장·허용된 AP 출처 식별자/요약을 담고, AP 원본 대화와 확인키 hash·OAuth 비밀은 담지 않는다. mock 체험 만료 후에도 기존 예약에 접근할 수 있다. 전체 계정/사진 아카이브나 실보존/복구 정책을 구현한 것은 아니다.

관련 DB 테스트는 경로 부재 404 red 뒤 3/3 green, Field 전체 DB 10개 파일 17/17 green이었다. 새 mock 빌드 세션 43113에서 체험 중 실제 예약→만료→웹 프록시 JSON 다운로드와 320px 사업자 화면 파일 다운로드를 수행했다. 첫 브라우저 실행은 검수 스크립트가 화면 이동 뒤 이전 화면 문구를 찾는 순서 오류로 실패했고, 수정 후 전체 HTTP/브라우저 1/1 통과했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, import/DB 격리도 exit 0. 양쪽 API ready, 합성 계정 잔여 각 0명. `build_report.py` exit 0, `check_package.py`는 문서 패키지 검사만 통과했다. Git 저장소/커밋 없음. 실청구·공급사·보존/복구·정식 QA/G는 미검수다.

## 최신 검수 기반 — C01/C02 표준 DB·공개 계약 명령 (2026-09-25)

`pnpm test:db:agent`, `test:db:field`, `test:contracts`의 placeholder를 실제 로컬 PostgreSQL·공개 OpenAPI 검수로 교체했다. DB runner는 제품별 모든 `*.db.test.ts`를 자동 발견하고 상대 제품 환경변수를 child에서 제거한 뒤 자기 migration과 테스트를 실행한다. 계약 명령은 두 정적 계약과 양쪽 제공자·연결·AP Field Action 소비자 DB 검사를 순차 실행한다. 이 명령들은 부분 검수이며 운영 서버/실공급사/전체 fault·독립성·보안/출시 gate는 남아 있다.

기존 세 명령의 exit 2 red 확인 후 Field DB 10개 파일·17/17 green. AP DB의 첫 전체 실행은 17/18 실패가 실제 non-zero로 전파됐다. 배치 검사가 공개 슬롯 목록을 전역 2개로 가정했지만 동시 매체 검사의 다른 활성 슬롯도 포함된 것이 원인이어서, 자기 매체의 정확한 두 slot ID를 검사하도록 수정했다. AP 재실행 15개 파일·18/18 green. `pnpm test:contracts`는 정적 2/2·DB 5/5 exit 0. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, import·DB 자격증명 격리 exit 0이고 두 mock API는 ready였다. Git 저장소/커밋 없음.

## 최신 기능 보강 — A07/F09 mock 체험 만료 제한 (2026-09-25)

AP·Field는 자기 조직의 로컬 mock 체험이 실제 만료되면 새 업무를 `403 trial_ended`/`cleanup_only`로 거부한다. AP는 새 직접 문의·상담/AI 생성·배포·지식/AI/홍보 공개 등을, Field는 새 직접 문의·공개/외부/수동 예약·사이트 생성/공개·제작 AI 등을 제한한다. 기존 접수의 멱등 재시도, 원본 열람/답변/기록 내보내기, Field 예약 처리·확인키·연결 해제는 유지한다. Field 공개 계약의 외부 신규 요청 403을 AP는 재인가 오류와 구분해 `field_subscription_ended`로 기록한다. 두 제품의 종료 화면과 고객 제출 화면에 사유를 표시한다. 원장이 없는 기존 조직과 비 mock 프로필의 판매 정책은 아직 바꾸지 않았다.

AP 영향 DB 11/11·Field 영향 DB 13/13·마지막 AP 상담/배포/embed/Field Action 회귀 6/6·Field 계약 1/1 통과. 실제 새 빌드로 전체 `pnpm mock:run`을 세션 31010에서 실행 중이며 두 API ready·두 구독 화면 HTTP 200이다. `FIELD_SUBSCRIPTION_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:subscription:http` 1/1에서 두 별도 계정/조직의 승인 정보→체험 시작/종료 예약→만료 뒤 실제 공개 문의 403, 320px 종료 안내·가로 넘침 없음/page error 0을 재확인했다. 합성 계정 잔여 AP/Field 각 0명. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, import/DB 자격증명 격리 exit 0. 승인된 실구독/PG·정리 기간·전체 계정 아카이브/보존·정식 QA/G는 미완료다. Git 저장소/커밋 없음.

## 최신 기능 보강 — A07/F09 제품별 체험 원장 (2026-09-25)

AP·Field는 각자 PostgreSQL에 조직별 1회 카드 없는 14일 체험을 기록한다. 로컬 mock owner가 명시 동의로 시작하고 체험 중 종료 예약을 남길 수 있으며, member는 자기 조직 상태만 읽는다. 별도 `/workspace/subscription` 화면은 상태·기간·자동 청구 없음·유료 checkout 차단을 표시한다. 운영 가격·약관·PG가 확정되지 않아 non-mock 체험 시작과 모든 유료 checkout은 `blocked_integration`이며 실제 결제나 청구액을 만들지 않는다. 만료 후 제한의 후속 구현과 검수는 위 절에 기록했다.

두 API 최초 404 red→AP/Field DB 각 1/1 green. 실제 전체 mock 재기동 후 제품별 웹 proxy·세션/조직·교차 쿠키 401, 체험 시작/재시도·종료 예약·checkout 503와 320px 화면을 `test:spike:subscription:http` 1/1로 확인했다. 합성 계정 잔여 0명. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 양쪽 API/웹 build, 기존 사용량 HTTP 1/1, import/DB 격리 exit 0. 승인 plan·가격·청구 원장/PG·크레딧·만료 후 정리 모드·정식 QA42~46/113/126/146/G는 미완료다. Git 저장소/커밋 없음.

## 최신 기능 보강 — A07/F09 제품별 사용량 조회 (2026-09-25)

AP·Field가 각자의 세션/membership과 DB에서 이번 UTC 월 사용 기록을 읽는 `/v1/usage/summary`를 제공한다. AP는 고객 AI 답변과 사업자 테스트의 완료 건수·기록된 모델 토큰을 구분하고 사람 문의·Field 외부 요청 수락/결과 미상을 나눈다. Field는 제작 AI 요청/공급사 응답·토큰, 직접 문의와 공개/수동/AP 외부 예약을 구분한다. 공급사 response ID와 양쪽 토큰이 모두 기록된 호출만 토큰 합계에 포함한다. 어느 응답에도 청구액을 만들지 않는다. 두 제품 `/workspace/usage`에는 자기 기록과 가격/결제 미연결 상태를 표시하고 실제 작업 화면에서 진입한다.

두 신규 API의 404 red 뒤 AP DB 1/1·Field DB 1/1 green. 테스트는 무인증 401·타 조직 404, 고객/사업자 AI 토큰 분리·결과 미상 제외, Field 예약 출처·이전 달 제외를 확인한다. 새 mock API/웹 재기동 뒤 `FIELD_USAGE_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:usage:http` 1/1은 두 제품 별도 계정/조직·실제 문의를 만들고 각 웹 프록시 응답/교차 세션 401, 320px 작업→사용량 화면의 문의 1건·청구 구분·가로 넘침 없음/page error 0을 확인했다. 합성 계정 잔여는 AP/Field 각 0명이다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 양쪽 API/웹 build, import/DB 자격증명 격리 exit 0. 확정 plan/체험·크레딧/초과 한도·PG 청구/갱신/해지/환불, 실제 모델 비용과 정식 QA/G는 구현·검수되지 않았다. Git 저장소/커밋 없음.

## 최신 기능 보강 — C02/I00 로컬 전체 mock 양방향 connector 준비 (2026-09-25)

`pnpm mock:run` 전체 모드가 두 제품의 컨테이너·migration·빌드 뒤 AP/Field API를 임시 기동해 기존 로컬 OAuth client 등록 도구를 순서대로 실행하고, 바뀐 `.env`를 읽는 최종 API·웹·사건 worker를 시작한다. Field의 새 mock 환경은 첫 실행부터 `FIELD_PUBLIC_WEB_ORIGIN=http://127.0.0.1:3002`를 사용한다. 제품별 단독 명령은 반대 제품 client 등록을 하지 않는다. 조직 연결과 scope 동의는 여전히 각 제품 owner의 화면 작업이다.

신규 Field env의 웹 origin 누락을 unit red로 확인한 뒤 2/2 green. 현재 로컬 PostgreSQL 17 두 개와 Field Valkey에서 전체 명령의 임시 API·기존 client 설정 확인/재기동, 두 API readiness·OAuth issuer·두 `/workspace` 200, `FIELD_EVENT_WORKERS_RUNNING=1 pnpm test:spike:ap-field:http` 1/1을 실행했다. AP 단독은 4311/3001 200·Field 4321/3002 미기동, Field 단독은 4321/3002 200·AP 4311/3001 미기동을 확인하고 각각 정상 종료했다. 전체 명령을 다시 실행해 현재 네 서비스가 준비 상태다. `pnpm test:spike:mock-connectors` 1/1은 별도 임시 env에 두 connector 값이 없는 상태에서 실제 OAuth API의 새 client를 각각 등록한 뒤 합성 owner/client를 정리했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, import/DB 자격증명 격리 exit 0. `build_report.py` exit 0·`check_package.py`는 문서 범위만 통과했다. **새 빈 DB·볼륨의 전체 runner 최초 시작은 미검수**이며, 반대 DB 컨테이너/기존 비밀값을 제거한 정식 제품 독립 QA도 아니다. Git 저장소/커밋 없음.

## 최신 기능 보강 — C02/C03 로컬 mock 재현 가능한 실행 (2026-09-25)

루트 `pnpm mock:run`이 AP·Field 제품별 PostgreSQL 17, Field 전용 Valkey의 compose 상태를 확인하고 migration·API/웹 빌드 후 각각의 API·웹과 구성된 사건 worker를 시작한다. `pnpm mock:run:agent`와 `pnpm mock:run:field`는 상대 제품 웹/API를 띄우지 않고 실행한다. 각 자식에는 자체 `.env`만 로드한다. 이미 사용 중인 4311/4321/3001/3002 포트는 기존 프로세스를 종료/채택하지 않고 명시 오류로 중지한다. 모델 credential이 없어 Field 제작 AI worker는 `blocked_integration`으로 표시하며 일반 사이트·문의·예약은 실행한다. Ctrl+C는 이 명령이 띄운 프로세스를 종료하고 DB/큐 볼륨은 보존한다.

실제 로컬 검수에서 점유 포트 거부 nonzero, 제품별 단독 API readiness/웹 `/workspace` 200과 상대 제품 웹/API 미기동, 전체 네 서비스 준비·AP/Field 사건 worker 실행, Ctrl+C 후 네 포트 해제·PG 컨테이너 healthy 유지, 전체 재기동을 확인했다. 첫 종료 구현에서 분리 프로세스 그룹 자식 여섯 개가 남는 실패를 발견해 이 작업에서 만든 PID만 정리하고 직접 Node/Next 자식으로 바꿔 재검수했다. 제품 선택 환경 파일 준비는 임시 디렉터리에서 AP `.env` mode 600·Field `.env` 미생성을 확인했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 양쪽 기존 API 단독 spike, import/DB 격리 exit 0. 실제 상대 DB 컨테이너 미배포 상태의 전체 제품 독립 QA, 운영 인증/모델/발송/결제·복구·출시 게이트는 미검수다. Git 저장소/커밋 없음.

worker 장애 검사에서 첫 supervisor는 Field 연결 사건 worker를 TERM하자 전체 API/웹을 내리는 red였다. 선택 worker 종료는 자동 전달 불가를 알리되 제품 API·웹은 유지하도록 수정했고 같은 TERM 재검사에서 두 readiness와 `/workspace` 200 및 supervisor 생존을 확인했다. 자동 worker 재시작은 없으며 전체 mock을 정상 종료한 뒤 재기동해 복구한다.

재기동한 전체 mock에서 AP 지식 자동 저장 HTTP 1/1, Field 사업정보 자동 저장 HTTP 1/1, Field 사업장 호스트 HTTP 1/1을 실행했고 합성 계정 잔여 0개를 확인했다. 두 API `/health/ready`는 응답했다. 이는 기존 로컬 기능 경로 검사이며 전체 제품 E2E·출시 게이트는 아니다.

## 최신 기능 보강 — C03 두 제품 홈의 실제 작업 진입 (2026-09-25)

로컬 mock의 AP와 Field 홈의 가장 눈에 띄는 버튼을 각 제품의 실제 `/workspace`로 연결했다. 비저장 `/preview/owner/start`는 별도 `화면 둘러보기` 링크로 유지하고, 홈의 ‘전체 화면 검토 단계’ 문구를 로컬 기능 검수 상태에 맞게 수정했다. `APP_PROFILE=design_preview`에서는 홈이 비저장 시안만 기본 진입으로 표시한다. 제품 간 세션·DB 경계는 바꾸지 않았다. AP와 Field 홈의 SSR 검사는 기본 CTA `/preview`와 시안 모드의 잘못된 `/workspace`를 차례로 red 확인한 뒤 각 2/2 green이었다.

정적 빌드 상태에서는 컴포넌트와 달리 실제 AP `design_preview` 서버가 mock 버튼을 보여주는 오류를 확인했다. 양쪽 홈을 요청 시 렌더링하도록 수정했고 같은 빌드의 mock 3001/3002는 `/workspace`, 시안 3011/3012는 `/preview` 기본 CTA와 비저장 표시를 실제 HTTP로 확인했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:web:agent`, `pnpm build:web:field` exit 0. Chromium 320px에서 mock 각 홈→각 `/workspace` 이동·홈 가로 넘침 없음/page error 0을 재확인했다. 외부 인증·모델·알림·결제/실 도메인, 역할별 전체 실제 업무와 정식 QA57/119·출시 게이트는 별도다. Git 저장소/커밋 없음.

## 최신 기능 보강 — C03/F04 Field 사업장 호스트 경계 (2026-09-25)

Field의 `field-<slug>.localhost:3002` 호스트에서 해당 승인 사이트와 같은 조직의 공개 문의·예약 시작 화면만 열리도록 서버 요청 단계에서 검사한다. 다른 사업장의 사이트/공개 문의와 플랫폼 관리실·루트는 404다. 기존 확인키가 필요한 문의·예약 재방문 화면, 공개 API·정적 자산과 AP 사이트 소유 증명 경로는 유지한다. 플랫폼 호스트의 공개 링크·관리실도 그대로다. 이 변경은 Field 웹에만 적용하고 AP/Field 내부 DB·계약을 합치지 않는다.

구현 전 실제 두 조직 HTTP에서 A 사업장 호스트의 B 공개 문의가 200인 red를 확인했다. `pnpm test:spike:tenant-host:http` 1/1은 mock PostgreSQL 17·Field API 4321·웹 3002에서 두 조직/승인 사이트의 호스트 분리, 320px Chromium의 사이트→직접 문의·예약 시작·가로 넘침 없음/page error 0, AP 소유 증명을 확인했다. `pnpm test:spike:sites:field` 2/2, `pnpm test:spike:site-autosave:http` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:web:field` exit 0. Node fetch의 사용자 지정 Host 헤더는 요청 호스트에 반영되지 않아 실제 사업장 URL로 시험했다. 확인키 화면을 플랫폼 호스트로 돌리는 시도는 같은 포트 로컬 Next 실행에서 상대 Location으로 바뀌어 철회하고 기존 확인키 보호 화면을 유지했다. 테스트 정리의 사이트 release→카탈로그 release FK 오류가 숨겨져 합성 계정 10개가 남았으나, 트랜잭션 정리 순서를 수정하고 10개를 정리했다. 재검사 뒤 합성 잔여 0개를 확인했다. 실 DNS/TLS·운영 장애/보안·전체 접근성 및 QA51/65/67/79·G-F1 정식 판정은 남는다. Git 저장소/커밋 없음.

## 최신 기능 보강 — A01 AP 지식 초안 자동 저장·미완성 재개 (2026-09-25)

AP 사업 지식의 상호·서비스·FAQ를 작성 중에도 약 1초 뒤 비공개 서버 초안으로 저장한다. 지연 응답 중 후속 입력은 다음 revision에 보존하고, 응답 분실 뒤 서버 동일 내용을 재조회해 중복 저장하지 않는다. 오프라인·실패·다른 편집자 충돌은 완료로 표시하지 않고 재시도 또는 두 버전 명시 선택을 제공한다. 미완성 초안은 기기 재접속 후 이어 쓸 수 있지만 승인 API가 공개를 거부한다. 공개 지식/AI 근거는 사업자 별도 승인 전 그대로다. AP owner의 초안 조회는 공개 release 번호와 해당 release의 직접 입력 초안 번호를 구분해 반환한다.

미완성 PUT 400 DB red, 자동 PUT 부재 8초 브라우저 timeout red, 공개/초안 번호 owner 응답 undefined red를 각각 확인한 뒤 수정했다. 로컬 mock PostgreSQL 17·새 AP API/웹·Chromium 320px의 `pnpm test:spike:knowledge-autosave:http` 1/1은 지연 응답, 빈 서비스/FAQ 저장·재개·승인 차단, 실패/응답 분실, 오프라인, 실제 409와 양방향 선택, 승인본 불변, 가로 넘침 없음/page error 0을 검사했다. `pnpm test:spike:business:agent` 3/3, AP AI 2/2·통합자 1/1, lint·typecheck·unit·API/웹 build·import 검사 exit 0, API readiness/웹 `/workspace` HTTP 200이다. Git 저장소/커밋은 없다. 실제 인증/모델·정식 QA22/81/134·G-A1/A3는 미검수다.

## 최신 기능 보강 — F01/F02 사업정보 초안 자동 저장·승인 분리 (2026-09-25)

Field 사업정보와 서비스 입력은 약 1초 뒤 기존 revision 계약으로 서버에 자동 저장한다. 저장 중 새 입력은 다음 revision에 보존한다. 빈 상호·서비스명·소요시간 0도 비공개 초안에 저장해 재접속 후 이어 쓸 수 있고, 완성 전 공개 승인은 거부한다. 오프라인·실패는 저장 완료로 표시하지 않는다. 서버 commit 후 응답만 사라졌다면 같은 내용의 최신 서버 초안을 조회해 중복 쓰기를 피한다. 실제 409에서는 서버 초안과 로컬 입력을 보여주고 사용자가 적용할 버전을 확인한다. 별도 사업자 승인 전 고객 공개 카탈로그는 바뀌지 않는다. 소개 textarea의 접근성 이름은 입력값과 무관하게 유지한다.

자동 PUT 부재로 시작한 실제 브라우저 검사 8초 timeout red, 소개 textarea 접근성 이름 0개 red, 미완성 초안 PUT 400 red를 확인한 뒤 수정했다. `pnpm test:spike:catalog-autosave:http` 1/1은 로컬 mock PostgreSQL 17·새 Field API/웹·Chromium 320px에서 지연 응답, 미완성 서비스 저장·새로고침 재개·승인 차단, 실패/응답 분실, 오프라인, 다른 편집자 충돌·양쪽 선택, 승인본 불변, 가로 넘침 없음/page error 0을 검사했다. `pnpm test:spike:business:field` 3/3, Field 예약 DB 3/3·사이트 DB 2/2, 기존 `pnpm test:spike:site-autosave:http` 1/1, import·lint·typecheck·unit·Field API/웹 빌드 exit 0이다. Git 저장소/커밋은 없다. 정식 QA53/57/61/62/77·G-F1 전체 검수는 남는다.

## 최신 기능 보강 — F02 사이트 초안 자동 저장·충돌 복구 (2026-09-25)

Field 사이트 편집기는 마지막 변경 뒤 약 1초에 기존 revision 계약으로 서버 저장을 시도한다. 저장 응답이 늦는 동안 추가한 입력은 유지하고 다음 revision에 다시 저장한다. 서버가 반영했지만 응답만 사라진 경우 수동 재시도에서 서버 최신 내용과 대조해 같은 저장을 중복하지 않는다. 오프라인·요청 실패는 미저장 상태와 수동 재시도를 표시한다. 다른 편집자의 409 충돌은 자동 덮어쓰지 않고 서버 초안 미리보기와 현재 입력을 보여준 뒤 명시적으로 버전을 선택하게 한다. 화면을 떠날 때 미저장 입력 경고를 표시하며 공개본은 별도 승인 전 그대로다.

신규 실제 웹 검사는 자동 저장 구현 전 첫 PUT이 없어 8초 timeout red였다. 이후 `pnpm test:spike:site-autosave:http` 1/1로 로컬 mock PostgreSQL 17·Field API/웹·Chromium 320px에서 지연 응답/실패/응답 분실/오프라인/양쪽 충돌 해결·공개본 불변·가로 넘침 없음/page error 0을 확인했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:web:field`, `pnpm test:spike:sites:field`(2/2) exit 0이다. 새 웹 빌드와 Field API의 HTTP 준비 상태는 200이다. 운영 네트워크·실 객체 저장소, 200% 확대·키보드/스크린리더 전체와 정식 QA62/G-F1은 미검수다. Git 저장소/커밋은 없다.

## 최신 기능 보강 — A08/F09 직접 문의 대화 기록 내보내기 (2026-09-25)

AP와 Field 사업자 문의 상세에 제품별 JSON 다운로드를 연결했다. owner/editor는 자기 조직의 직접 문의 한 건에서 고객 메시지·답변·내부 메모·첨부 메타데이터를 내려받는다. 사진 파일은 기존 인증 다운로드 경로에서 별도로 받는다. Field 내보내기는 Field 원본만 포함하며 AP 원본을 복제하지 않는다. 확인키·토큰·객체 저장 키는 응답에서 제외한다. 전체 계정 백업이나 구독 종료 정리 모드는 아니다.

신규 API 경로 404와 editor 권한 404의 선행 red를 확인하고 구현 뒤 AP 문의 DB 1/1·Field 사업 DB 2/2·양쪽 첨부 DB 각 1/1을 통과했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 양쪽 API/웹 build, import/DB 격리·제품별 단독 API spike도 exit 0이었다. 새 빌드의 AP·Field API와 웹을 재시작하고 `pnpm test:spike:export:http` 1/1로 양쪽 웹 프록시의 실제 다운로드, 타 제품 세션·무인증 401, 각 제품 JSON 헤더/본문을 확인했다. 4개 HTTP 준비/루트 경로는 200이었다. 로컬 mock PostgreSQL 17 환경이며 Git 저장소/커밋은 없다. 전체 계정·사진 파일 묶음, 보존·복구, 실 청구, 운영 공급사와 정식 QA/G 게이트는 미검수다.

## 최신 기능 보강 — 공개 문의·예약 제출 제한 (2026-09-25)

AP 직접 문의와 AI 상담의 사람 인계, Field 직접 문의와 예약 요청에 제품별 PostgreSQL 제한 원장을 적용했다. 조직·정규화 연락처별 신규 접수는 15분에 5건까지 저장하며 6번째는 429와 `Retry-After`로 거부한다. 같은 멱등 키의 이미 수락한 요청은 제한 중에도 200으로 복구하고, 제한 판단은 새 원본/outbox와 한 트랜잭션에 둔다. 원장에는 제품별 비밀값으로 HMAC 처리한 연락처만 저장한다. Field 문의와 예약은 한 원장을 공유하며 AP/Field 간 원장은 분리한다. Field 예약 연락처 형식도 문의와 동일하게 검사한다. 고객 화면은 입력을 유지하고 제한 이유를 안내한다.

선행 AP 문의·Field 문의·Field 예약 DB 테스트에서 6번째가 201인 red를 각각 확인했다. 구현 후 AP 문의 1/1, AP 상담 1/1, Field 사업/문의 2/2, Field 예약 3/3을 통과했다. 번호 표기 정규화, 같은 제출 재시도, 다른 번호, 15분 만료, Field 예약→문의 공유와 AP 문의/Field 예약의 8건 동시 접수 중 5건 저장을 포함한다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 양쪽 API/웹 build, import/DB 격리, 제품별 mock 단독 API 준비 검사는 exit 0이다. 새 API 빌드로 AP 4311·Field 4321을 재시작하고 두 readiness 및 웹 3001/3002 루트 HTTP 200을 확인했다. Git 저장소/커밋은 없다. 브라우저 320px 제한 안내, 실프록시·운영 부하·신고/이의 처리·전화번호 회전 악용·조직 전체 비용 상한·만료 원장 정리·정식 QA19/25/48과 출시 게이트는 미검수다.

| Task | 제품/담당 | 상태 | 근거·검수 범위 | 다음 의존 |
|---|---|---|---|---|
| C00 | 계약/Coordinator | implemented | `docs/technical/C00_INVENTORY.md`. 로컬 파일·도구·Git·환경변수 이름 조사. 외부 운영 자산은 미확인. QA115·116은 미실행. | C01 |
| C01 | 계약/Coordinator | in_progress | 기존 공개 계약 문서·JSON Schema, AP/Field OAuth·교차 token, AP mock 외부 위젯·1차 도메인 handoff·POST/SSE·사람 인계 부분 spike. AP/Field bearer 공개 경로의 OpenAPI 미리보기·제공자 DB 응답 검사를 추가했다. 양방향 완성 OpenAPI/소비자 테스트·실연결은 없음. B01~B12, QA121~160. | 계약 구현·조직/actor 권한 |
| C02 | 인프라/Coordinator | in_progress | 제품별 서버·PG·migration/DB 격리. Field 전용 Valkey 8.1.10 mock 인스턴스·비밀값·ID 큐·별도 worker, 큐 중지에도 일반 Field readiness 200, 합성 worker 재시작/중복 claim/잘못된 큐 자격증명 검수. `mock:run` 전체/제품별 단독 compose·migration·build·API/웹·구성 worker 시작과 종료/포트 충돌/DB 보존 로컬 검수. AP 큐·서버 ACL/CI/백업과 정식 QA123·124는 미구현. | AP 큐 및 실제 서버 격리/복구 |
| C03 | 디자인/Coordinator | in_progress | AP/Field 웹과 공통 UI, 52개 검토 경로 HTTP 200, 모바일 전체 메뉴, Field 편집·예약 방식 미리보기와 제품별 주요 상세 화면. 52개 경로 320px 넘침 없음·표시 글자 최소 14px, 주요 화면 390/768/1440px 확인. Field 사업장 호스트의 타 조직 공개 화면/관리실 404, 소유 사이트→문의·예약 시작 320px 검사. 두 제품 mock 홈 기본 CTA는 각자 `/workspace`, `design_preview`는 `/preview`이며 같은 빌드의 실제 HTTP·mock 320px 브라우저 확인. 새 mock 실행 명령에서도 두 `/workspace` 200. 200% 확대·스크린리더·실제 데이터 상태는 미검수. QA57·58·119 부분 근거. | 기능 연결 병행; 사용자 화면 검토·남은 접근성·상태 검수는 별도 |
| A00·A01 | AP/Coordinator | in_progress | AP 조직·membership·지식 초안/승인 release, outbox와 로컬 mock 가입·작업 화면. 약 1초 자동 저장·미완성 상호/서비스/FAQ 비공개 재개·승인 차단, 지연 응답/분실·오프라인/409 명시 해결과 공개본 불변을 320px 실제 웹에서 확인. 사업 DB 3/3·브라우저 1/1. | 공급사 인증, source 충돌·외부 변경 검수, AI 설정/사용량/복구·정식 QA |
| A02·A03 | AP/Coordinator | in_progress | AP 원본 비회원 문의·확인키·순서 있는 메시지·사업자 답변/내부 메모·후속 대화. 상담 링크의 익명 AI 질문·답변과 최종 접수도 같은 원본 ID이며 생성 중 사람 인계 시 AI 답변 억제. 직접/AI 인계 접수와 후속 메시지는 재시도 키로 중복을 복구. 고객 제출 사진은 AP 전용 비공개 저장소·확인키/조직 권한으로 조회하며 AI 질문 사진 첨부는 거부. 확인키 5회 실패/15분 제한과 기존 키 폐기·새 키 재열람/응답 분실 복구를 AP DB/Chrome 320px에서 확인. 직접 문의·AI 사람 인계에 15분 5건 신규 제출 제한, 멱등 복구·만료를 DB에서 확인. 조직 전체 기본 15분 60건(제품별 설정)의 번호 변경·429·멱등 복구·만료를 DB에서 확인. 첫 직접/상담 접수 응답 분실 뒤 같은 탭 새로고침 원본/확인키 복구도 DB·320px 브라우저에서 확인. | 실알림·실공급사 비용 정책·신고/조직 한도 DoS 대응·후속 메시지 새로고침 복구·실 S3/HEIC·사진 보존/복구·정식 QA19/41 |
| A04 | AP/Coordinator | in_progress | AI 설정 초안/release와 승인 지식 결합, Responses 어댑터, 사업자/고객 답변의 구조·근거 ID/숫자·사용량·한도 검사. 사업자·고객 호출 한도 분리. 고객 모델 입력에 동일 대화의 최근 공개 고객/AI 메시지 최대 6개·각 500자 문맥을 추가하고 승인 사실과 분리했다. `test:spike:agents:agent` 2/2, 고객 상담 DB 1/1, Chrome 공급사 미설정·합성 응답 검수. | 실제 모델 품질·문맥/근거 의미·실예산/복구·정식 QA22~24/117 |
| A05 | AP/Coordinator | in_progress | AP 단독 상담 링크·owned embed, DNS TXT 검증, origin/CSP 설치, 1회 nonce·ticket의 AP 1차 화면 전환. 링크와 iframe의 고객 AI→동일 AP 대화 사람 문의. inline/floating SDK와 관리 화면 설치 코드. `test:spike:deployments:agent` 1/1, 분리 origin 로컬 Chrome SDK→iframe AI→팝업·같은 ID 접수와 floating 열기/닫기. | 실소유 도메인·다중 ancestor·제3자 쿠키 강제 차단/접근성, 실모델·남용 방지·정식 QA94·97~102·127·128 |
| A06 | AP/Coordinator | in_progress | AP 문의 outbox와 단일 알림 원장 동시 기록, 사업자 내부 처리 알림·사용자별 읽음, 기존 사건 원장 보충. 고객 답변 외부 알림은 `blocked_integration`으로 표시. Chrome 320px 사업자 확인·고객 열람 왕복. | 실카카오/문자/푸시 공급사와 콜백·unknown 조회·대체발송·비용 한도/복구·정식 QA35~40 |
| A07 | AP/Coordinator | in_progress | AP 자기 조직의 이번 UTC 월 고객 AI·사업자 테스트/토큰과 사람 문의·Field 요청을 실제 DB에서 분리 집계하고 `/workspace/usage`에 표시. DB 1/1·320px 실제 웹/양제품 HTTP 1/1. 청구액을 만들지 않는다. 제품별 PG trial 원장·owner 명시 동의 14일 mock 체험/종료 예약, DB 1/1·실제 HTTP/320px 1/1 검수. | 승인 plan·실운영 체험 정책·구독/PG 갱신/해지·크레딧/한도/정리 모드, 정식 QA42~46/113/126/147·G-A1 |
| A08 | AP/Coordinator | in_progress | AP owner/editor의 문의 한 건 JSON·인증 사진 개별 다운로드. 조직 owner의 전체 직접 문의/사진 JSON(base64) 묶음과 생성 감사 원장·손상/누락 503·상한 413. AP DB 18/18·실 웹 HTTP/320px 다운로드 1/1. 전체 계정 백업은 아니다. | 전체 계정·배포/청구/대용량 분할, 보존/삭제·백업/복구·신고/운영 runbook, 정식 QA47~49/157 |
| A09 | AP/Coordinator | in_progress | AP OAuth code+PKCE, 등록 client·AP resource, owner의 조직/승인 AI/배포 선택·동의, opaque bearer client/actor/scope/resource/reference 검사, 선택 철회. `/me`, 최소 agent/대화 읽기·고객 공개 메시지 cursor, 위임 사람 답변의 revision·멱등·감사·AP 원본/outbox/알림 원장. `test:spike:contracts:agent` 정적 1/1+DB 1/1, OAuth 2/2, 교차 issuer 1/1, 기존 Chrome 320px 승인→callback 확인. | source refresh·배포 관리·이벤트/connection revoke scope, 양방향 완성 OpenAPI/consumer test, 운영 client 심사·정식 QA129~133 |
| D00 | AP/Distribution | in_progress | 승인 KnowledgeRelease에서만 상호·서비스명·설명을 가져오는 홍보 카드 초안과 불변 공개 버전, owner 동의·revision·멱등 승인, 광고 표시·중지·지식 변경 노출 보류. `test:spike:campaigns:agent` 1/1과 Chrome 320px 생성→공개→초안 수정→중지→새 지식 재공개 확인. D02 배치 요청 연결. | AI 홍보 문구의 안전한 검토, 구조화 가격 source, 정식 QA87~91/운영 게이트 |
| D01 | AP/Distribution | in_progress | 매체 조직·owner/editor/viewer membership, 매체 전용 도메인 DNS TXT 증명·7일 만료, article/sidebar 광고 위치와 활성/중지·outbox. 사업 조직 membership과 분리. `test:spike:publishers:agent` 1/1, Chrome 320px 화면 흐름 확인. D02 배치 승인 연결. | 실제 매체 DNS/운영 확인, A09 공식 client·AP 관리자, 정식 QA92/94/95 |
| D02 | AP/Distribution | in_progress | 사업자 공개 release와 활성 매체 slot의 배치를 고정해 요청, 매체 owner가 정확한 release/hash의 문구를 승인·거절·중지, 사업자는 취소한다. 공개 조회는 캠페인 현재 버전·승인 지식·slot·DNS 유효성을 매번 확인한다. AP 사업/매체 outbox와 재시도 원장, `test:spike:placements:agent` 1/1, Chrome 320px 두 역할·공개/취소 확인. D03 로컬 설치·접수 연결. | 실매체 DNS/TLS·운영 관리자, 정식 QA90~96·Distribution gate |
| D03 | AP/Distribution | in_progress | 승인 배치·매체 origin에 고정한 `placement_embed` 설치 코드, AP iframe 광고 카드/AI 또는 공급사 미연결 상태, 질문·희망 조건·서비스를 1회 handoff로 AP 1차 상담에 유지. 연락처 동의 접수는 AP 원본에 서버 고정 placement ID로 기록하고 취소 뒤 새 접근을 거부. 조직별 24시간 대화 시작 한도. `test:spike:distribution:agent` 1/1, 별도 origin Chrome 320px 접수·비노출·철회 확인. D04 로컬 사건/집계 연결. | 실매체 DNS/TLS와 제3자 쿠키 차단·중첩 ancestor, 실 AI/알림·정식 QA97~103/118·출시 gate |
| D04 | AP/Distribution | in_progress | AP 문의 시작·동의 접수의 배치 사건을 같은 DB transaction에 중복 없이 기록한다. 미리보기·mock 명시 테스트·알려진 봇은 공개 집계에서 제외하고 과거 출처 미분류 문의도 제외한다. 매체/사업자 회원별 완료 UTC 주 8개만 5 미만 억제·구간값 JSON/CSV로 제공. `test:spike:distribution:agent` 1/1 및 Chrome 320px 양쪽 성과 화면/CSV 확인. 예약 확정은 미연결, 매출은 비측정. | 실 Field 확정 이벤트·봇 탐지/제휴 검증·복수 역할 차분 공격·정식 QA104~107/G-D2 |
| F00·F01 | Field/Coordinator | in_progress | Field 조직·membership·카탈로그 초안/승인 release, 기본 예약 방식과 서비스별 상속/명시 선택·가격. 상속 선택은 공개 승인 때 실제 방식으로 확정하고 과거 공개본을 보존. 사업정보/서비스 1초 자동 저장·응답 지연/분실·오프라인/409 명시 해결과 승인본 불변을 320px 실제 웹에서 확인. 미완성 값도 비공개 초안으로 저장·재조회하고 승인 차단. Field 사업 DB 3/3. | 공급사 인증, 사용량/복구·정식 QA53/57/61/62/77·G-F1 전체 |
| F02·F04 | Field/Coordinator | in_progress | 서버 초안 revision, 3개 배치·최대 5개 소개 페이지, 기본 slug 공개·복구. Field 전용 사진 업로드/정규화·alt·조직 권한·초안/공개본 참조와 보관함. AI 배치 제안이 기존 사진을 보존하거나 실패 처리. 편집 1초 자동 저장·응답 지연 중 추가 입력 보존·응답 분실 재조회·오프라인/409 명시 해결을 320px 실제 웹에서 확인. 사업장 호스트의 타 조직 공개 경로/관리실 404와 소유 사이트→문의·예약 시작/소유 증명 HTTP·브라우저 1/1. `test:spike:sites:field` 2/2, media store 1/1. | HEIC 환경별 codec·실 S3 버킷/ACL·백업/정리, 자체 도메인·TLS, 접근성·정식 QA62/G-F1 전체 |
| F03 | Field/Coordinator | in_progress | Field 자체 Responses 어댑터와 승인 정보 기반 제한 배치 JSON, DB 상태·단일 작업·revision 충돌·취소·토큰 기록, 사업자 제안 UI. 전용 Valkey 큐·별도 worker가 ID만 처리하고 누락 enqueue 재조정·중단 running 결과 미상 보존. 사진·alt 보존 포함 생성 3/3·큐 1/1·worker 1/1 합성 검사. | 실모델·실비용·실서버 worker/복구·정식 QA54/63/64/122 |
| F05·F06 | Field/Coordinator | in_progress | 비회원 직접 문의, 별도 확인키, 후속 질문, 사업자 문의함/답변, 발송 `pending`/outbox. 직접 접수와 고객/사업자 메시지 응답 분실·병렬 제출의 동일 원본 복구. 고객 사진은 전용 비공개 저장소·확인키/조직 권한으로 조회하며 동일 사진 재첨부를 복구. 사업자 내부 메모는 고객 비노출·알림 없음·상태 불변과 재시도 복구를 Field DB·Chrome 320/390px에서 확인. 문의 확인키 5회 실패/15분 제한과 기존 키 폐기·새 키/사진 재열람을 Field DB/Chrome 320px에서 확인. 직접 문의·예약 공유 원장의 15분 5건 신규 제출 제한, 재시도·만료를 DB에서 확인. 조직 전체 기본 15분 60건(별도 설정)의 번호 변경·예약→문의 공유·멱등 복구·만료를 DB에서 확인. 첫 직접 문의 응답 분실 뒤 새로고침 원본/확인키 복구와 수정 입력 차단도 DB·320px 브라우저에서 확인. | 실공급사 비용 정책·신고/조직 한도 DoS 대응·후속 메시지 새로고침 복구·실알림·사진 보존/복구·실 S3/HEIC·정식 QA19/41 |
| F07 | Field/Coordinator | in_progress | 정책·휴무/예외일·두 예약 방식·제안/수락/확정·변경/취소·수동 일정/전화 예약, 별도 확인키·처리 기록·PostgreSQL 충돌 제약. 자정 영업/휴무, 카탈로그 변경 후 고객 재동의·대체/제안 무효화, 비회원 제출 재시도 키·DB 중복 방지. 기본 방식 상속과 DST 반복/누락 시각·실제 소요/현지 날짜 기간을 DB/Chrome으로 확인. 예약 확인키 5회 실패/15분 제한과 기존 키 폐기·새 키 재열람도 확인. 공개 예약·직접 문의 공유 제한 15분 5건 및 조직 전체 기본 15분 60건, 429·재시도·만료를 DB에서 확인. 첫 비회원 예약 응답 분실 뒤 새로고침 원본/확인키 복구를 DB·320px 브라우저에서 확인. | 실공급사 비용 정책·신고/조직 한도 DoS 대응·실알림·복구·정식 QA19/25~34 |
| F08 | Field/Coordinator | in_progress | 문의·예약 outbox와 같은 Field DB 트랜잭션에서 1:1 알림 원장 생성, 기존 사건 멱등 보충, 조직별 owner/editor 알림과 사용자별 읽음. 고객 외부 사건은 `blocked_integration`. 문의/예약 DB 테스트 2/2씩, Chrome 320/390px 문의·예약 이동과 읽음 2→0. | 실카카오/문자/푸시 공급사, 콜백·unknown/대체발송·한도/복구·정식 QA35~40 |
| F09 | Field/Coordinator | in_progress | Field 한 건 문의/예약 export와 조직 owner의 운영 기록 묶음 JSON: 사업정보·사이트/사진·직접 문의/사진·예약/사건/알림/출처. 413/503·생성 감사, Field DB 17/17·실 웹/320px 다운로드 1/1. 월별 제작 AI/문의/예약 출처 사용량과 Field mock trial/종료도 유지. AP 원문은 포함하지 않는다. | 독립 실구독·정리 모드·관리자, 전체 계정/연동 수신 기록·대용량 분할·보존/삭제/백업 복구, 정식 QA42~49/113/146/147/157 |
| I00 | 연동/Coordinator | in_progress | Field의 AP code+PKCE 승인 후 AP BFF가 Field의 별도 code+PKCE를 교환하고 `/me` 조직·scope를 검사해 자기 DB에 access/refresh를 암호화 보관한다. Chromium 320px에서 Field→AP→Field 두 동의와 양쪽 `review_required`를 확인했다. 양쪽 BFF가 상대 OAuth refresh endpoint에서 만료 access token을 회전하고 공개 `/me`로 재검증한다. 각 제품 DB 테스트와 실제 두 서버 HTTP 1/1, 실패 시 `degraded`·자동 재시도 차단. 로컬 Field/AP 웹 host 분리로 쿠키 충돌 해결. | 양방향 revoke/재인가·unknown 복구, 운영 client 심사·정식 QA129~132/G-I1 |
| I01 | 연동/Coordinator | in_progress | 양쪽 grant·조직·actor/AI를 같은 connection ID에 bind한다. Field 공개 OAuth bearer `capabilities`는 계약 1.0과 실제 동의한 사실/가용성/업무요청 scope 지원을 반환하고 제안 응답은 false다. AP owner 조회는 양쪽 grant/조직 확인 뒤 공개 HTTP만 사용하고 타 조직/버전/장애를 거부한다. Field 계약 정적+DB, AP DB, 실제 양쪽 HTTP, Chromium 320px 부분 검수. `review_required`는 설치 성공 아님 | source/deployment 매핑·부분연결·권한 변경/상태 조정·정식 QA130/133/134 |
| I02 | 연동/Coordinator | in_progress | Field source snapshot·owner 출처 승인 후 사업 소개/서비스 설명의 명시 선택으로 AP KnowledgeRelease를 생성한다. native draft와 조직 전체 공개 revision 분리, 원본·hash·권한 재검증, 중복 서비스명 거부, 가격/영업시간/예약 조건 제외, 24시간 freshness/current/승인 버전에서만 AI 근거 허용. 새 AI 버전 승인 전 기존 배포는 stale. AP DB 1/1, native/AI/상담 회귀 5개, 실제 양쪽 서버 HTTP 1/1, Chromium 320px 공개·재열람/page error 0 확인. | signed 변경 이벤트/재조정, 중요값 live 재확인, source mapping 선택 수정 UX, 정식 QA134~138/156·G-I2 |
| I03 | 연동/Coordinator | in_progress | Field 공개 사이트의 사업장별 정확한 mock origin·1일 소유 증명값, AP 공개 OAuth 선택 배포 조회와 mock well-known 확인, Field owner의 설치/중지 원장 및 AP 기본 SDK `inline`/`floating` 설치. Field DB 2/2, AP provider DB 1/1, 양쪽 실제 서버 OAuth→설치 HTTP 1/1, Chromium 320px SDK 버튼/iframe·직접 문의/예약·타 사업장 호스트 404 확인. | 운영 DNS/TLS·실모델, AP revoke/중지·장애 재조정, 정식 QA86/94/128·G-I1 |
| I04 | 연동/Coordinator | in_progress | Field 공개 OAuth 현재 조건·업무 수신/원요청 조회와 미확정 예약 snapshot/outbox. AP 고객 확인키·동의 ActionRequest와 결과 미상 복구, Field owner 외부 문의 목록·내부 알림, 1회 코드로 Field 독립 예약 확인키를 제공한다. 연결 예약 사건은 Field `field.requests.read` 공개 API가 조직/client/grant/actor/connection을 검증해 rev0/확정/취소 등 PII 없는 전체 revision을 반환한다. AP 수동 동기화는 ID·연속성·조직·예약을 검사해 원장/고객 알림을 멱등 기록한다. 연결별 HMAC 키 bind, Field 내구 전송 원장/worker, AP durable inbox/worker를 연결하고 rev 역순·응답 분실·재시도·멱등을 양쪽 DB와 실제 HTTP로 확인했다. mock PG 제공자/소비자·계약 각 1/1, 실제 양쪽 HTTP/320px 브라우저 1/1은 확정 상태·AP 외부 알림 미발송·Field 고객 알림 0건을 확인. | AI 대화 중 직접 제출·첨부 인증 복사, route 전환·AP 처리 결과 조회·실공급사·운영 독립성·정식 QA139~145/148~149/153/155/G-I1~I2 |
| I05 | 연동/Coordinator | in_progress | Field owner가 AP 원본을 공개 OAuth API로 열고 `ap.conversations.reply`·revision/멱등 키로 답변한다. 미전송 본문은 암호화, 수락 뒤 제거/영수증 보관, 응답 미상 후 새 서버/320px 새로고침에서 동일 키 replay와 AP 단일 message/알림 원장·`blocked_integration` 확인. 연결 예약은 Field 고객 알림을 중복 생성하지 않고 AP가 서명 webhook 자동 처리 또는 수동 조회로 Field 사건을 보관하며 고객 알림 원장 한 건을 만든다. AP 공개 OAuth 사건 상태 조회와 Field owner 예약 상세는 로컬 ACK·AP 처리·고객 알림/열람을 분리하고 AP 장애 시 로컬 예약을 유지한다. 제공자/소비자 DB 각 1/1, 실제 별도 worker HTTP·320px 화면 1/1 확인. | route 전환·발송 직전 재확인, revoke/부분 장애·키 회전/보존·실 공급사/정식 QA144/145/148/149·G-I2 |
| I06 | 연동/Coordinator | in_progress | 양쪽 owner 연결 해제·내구 원격 ACK, 기존 예약/고객 확인키 보존, 사건별 직접 연락 기록과 해제 후 AP 처리/미발송 서명 재조회를 로컬 mock에서 검수했다. 기존 예약마다 Field 고객 확인키 명시 동의/철회와 Field owner의 AP 사건·알림 대조/세대 1 종료 영수증→세대 2 활성화를 추가했다. 전환 ID/동의/대조 기준을 Field DB에 선기록하며 양쪽 API 재시작·브라우저 재열람 뒤 복구하고 기준 뒤 사건은 직접 연락 `reached` 전 활성화를 거부한다. AP 202 수신·해제 경쟁은 connection lock으로 고정하고 이미 받은 사건의 내부 처리와 종료 뒤 늦은 inbox 거부를 검사했다. 새 Field 사건만 고객 알림 `blocked_integration`으로 기록하고 AP 전송에서 제외한다. AP/Field DB 각 1/1·정적 계약 2/2, 별도 API/worker 양방향 및 API 중단·재시작 실제 HTTP와 320px 고객/사업자 화면 각 1/1. | 실 공급사 unknown/발송 직전 route 재확인, 구독 종료/삭제·보존, 운영 서버 장애·정식 QA146/148~155/G-I1/I3 |

## 최신 기능 보강 — A04 고객 AI 연속 대화 문맥 (2026-09-25)

AP 고객 상담의 두 번째 이후 모델 호출은 같은 원본 대화에서 이전에 공개된 고객 질문·AI 답변 최근 6개를 각각 500자 이내로 읽어 순서대로 전달한다. 현재 질문은 중복하지 않으며 사업자 답변·내부 메모·다른 대화 기록을 모델 문맥으로 쓰지 않는다. Responses 요청의 `conversationHistory`는 승인 사실과 별도 데이터이며 `store:false`·도구 없음·근거 ID/숫자/사용량 검사를 유지한다. 별도 사람 접수/인계와 공급사 미설정 차단 경로는 유지된다.

검사: `pnpm test:spike:consultations:agent`에서 첫 질문 history가 없던 red→동일 대화 두 번째 요청의 첫 질문/AI 답변 포함 1/1 green. `pnpm --filter @fieldai/agent-api exec tsx --test test/openai.adapter.test.ts`에서 Responses `conversationHistory` 누락 red→1/1 green. `pnpm test:spike:agents:agent` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, import/DB 격리·AP-only spike exit 0. 새 AP API 빌드로 재시작했다. 로컬 AP 환경에는 실제 모델 이름/credential이 모두 없어 실제 응답 품질·요금과 브라우저 두 턴은 미검수다. Git 저장소/커밋 없음.

## 이전 기능 보강 — I06 AP 202 수신 직후 해제 재조정 (2026-09-25)

AP가 유효한 연결에서 Field 예약 사건을 서명 검증해 durable inbox에 202로 받은 직후 연결이 해제되어도, 기존 사건을 내부 사건·고객 알림 원장으로 처리한다. 수신 API는 연결 row lock을 잡은 트랜잭션에서 서명 확인과 inbox commit을 끝내므로 해제가 먼저 commit된 새 요청은 401이다. 이미 AP 종료 영수증이 있는 예약의 늦은 inbox 사건은 `route_closed`로 거부하고 추가 알림을 만들지 않는다. 로컬 mock의 알림 원장은 `blocked_integration`이며 공급사 발송 허가가 아니다.

검사: AP DB `pnpm test:spike:field-actions:agent`에서 수신 뒤 해제 사건이 기존 `deferred`로 멈추는 red, 연결 row lock 없는 수신이 해제와 경쟁해 202가 되는 red, 종료 뒤 늦은 inbox가 처리되는 red를 각각 확인한 후 1/1 green. `pnpm test:spike:integrator:field` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, import/DB 격리 exit 0. 새 AP API/worker 빌드의 별도 두 서버·320px 브라우저로 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http`와 `FIELD_REVOKE_ORIGIN=ap` 변형을 각각 1/1 통과했다. 이 실제 HTTP 검사는 기본 연결 회귀이며 정확한 ACK 직후 해제 경쟁은 DB 테스트에서 검증했다. 실 공급사·운영 서버·정식 QA/G는 미검수다. Git 저장소/커밋 없음.

## 이전 기능 보강 — I06 전환 ID 내구 회수와 사건 기준 대조 (2026-09-25)

Field는 AP 종료 호출 전에 예약별 전환 ID·고객 동의 ID·AP 전달 ACK의 연속 마지막 사건을 자체 DB에 저장한다. AP 응답이 분실되거나 Field API/브라우저가 재시작돼도 같은 ID/기준으로 영수증을 재시도한다. 연결 해제 뒤 AP에 미전달된 사건 및 AP 종료 호출 동안 추가된 사건은 자동 알림 성공으로 취급하지 않고, 사건별 고객 직접 연락 `reached`가 있어야 Field 세대 2로 활성화한다. Field worker는 해제 연결의 신규 AP 전송 원장을 만들지 않으며 AP 종료 경로는 기준을 넘는 inbox 사건이 있으면 거부한다. 고객이 동의를 철회한 동안 활성화하지 않고 재동의 뒤 저장된 ID를 복구한다.

검사: Field 제공자/소비자 DB 1/1, AP 제공자 DB 1/1, 정적 공개 계약 2/2, Field 예약 DB 3/3, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:field`, import/DB 격리 및 AP-only/Field-only spike exit 0. 새 빌드의 로컬 mock PG17·별도 API/worker·Field 웹에서 `FIELD_ROUTE_RESTART=1 FIELD_TEST_AP_SERVER_PID=82942 FIELD_TEST_FIELD_SERVER_PID=82952 FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1: AP 중단→Field 전환 503/저장 ID 확인→Field API 중단·재시작 뒤 같은 ID 확인→AP 재시작→320px 고객/owner 화면에서 전환 완료. Field 시작과 AP 시작 해제의 실제 HTTP/브라우저 전체도 각각 1/1. 처음 DB 기대는 ID 미보존과 최신 예약 revision을 AP 기준으로 잘못 택한 문제를 red로 확인해 수정했다. 실제 공급사 unknown 상태·발송 직전 소유 경로 확인, 운영 환경/정식 QA·게이트는 미검수다. Git 저장소/커밋 없음.

## 이전 기능 보강 — I06 기존 연결 예약별 알림 세대 전환 (2026-09-25)

Field 고객은 자기 예약 확인키로 AP 연결 해제 뒤 향후 Field 알림 담당에 동의/철회한다. 사업자 owner는 양쪽 해제 ACK와 고객 동의를 확인하고 AP 공개 서명 API로 이전 사건의 연속 처리·고객 알림 상태를 대조한다. AP는 세대 1 종료 영수증을 별도 원장에 내구 기록하고 Field는 예약 revision이 유지될 때 세대 2를 켠다. 예약 사건의 세대/담당 제품을 DB에서 고정해 후속 사건만 Field 고객 알림 원장에 한 번 기록하고 AP 전송에서는 제외한다. 고객 철회 시 향후 Field 자동 알림은 정지한다. 공급사 미연결 알림은 `blocked_integration`이고 실제 고객 발송이 아니다.

검사: `pnpm test:spike:integrator:field` 신규 고객 route 404 red→1/1 green, `pnpm test:spike:field-actions:agent` AP 종료 경로 404 red→1/1 green, Field 사업자 활성화 404 red→1/1 green. AP OpenAPI 정적 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:bookings:field` 3/3, 양쪽 API/Field 웹 빌드, import·DB 자격증명 격리 및 AP-only/Field-only spike exit 0. `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http`와 `FIELD_REVOKE_ORIGIN=ap` 변형은 양방향 별도 API/worker·320px 고객 동의/사업자 활성화/고객 상태 및 후속 사건의 Field 단일 원장을 각각 1/1 확인했다. 첫 전체 브라우저 검사는 Field 웹 빌드 후 오래된 Next 프로세스의 JS 제공으로 기존 로그인 지점에서 시간 초과했고, 웹 재시작 뒤 두 방향 모두 통과했다. 전환 ID의 프로세스 중단 뒤 회수, AP 종료/Field 활성화 사이의 예약 revision 경쟁, 실제 공급사 unknown·AP 발송 직전 Field route 재확인, 정식 QA/G·운영 출시는 미검수다. Git 저장소/커밋 없음.

## 이전 기능 보강 — I06 해제 뒤 AP 사건·고객 알림 상태 복구 조회 (2026-09-25)

Field owner의 기존 연결 예약 상세는 해제 뒤 AP OAuth 권한을 다시 열지 않고도 이미 AP가 수신한 사건의 처리·고객 알림 원장 상태를 조회한다. Field 서버는 자체 owner/예약 소속을 확인하고 로컬 ACK 사건만 연결별 HMAC 키로 서명해 AP 공개 읽기 전용 endpoint를 호출한다. AP는 5분 시각창·키/연결/서명·accepted ActionRequest/예약/사건 소속을 확인해 PII 없는 수신/처리/알림/열람 상태만 돌려준다. AP 404/장애에서는 발송되지 않았다고 추론하지 않고 Field 로컬 ACK를 남긴 채 `unavailable`로 표시한다. AP의 `blocked_integration`은 고객 외부 알림 미발송이며, 이 기능이 고객에게 메시지를 보내거나 route generation을 바꾸지는 않는다.

검사: `pnpm test:spike:field-actions:agent` 새 경로 404 red→서명 200, 무서명/위조/만료/타 연결 401·없는 사건 404와 PII 비노출 1/1 green. `pnpm test:spike:integrator:field`는 해제 후 `reauthorization_required` red→서명 재조회 처리 상태 1/1 green, AP 단절 시 local ACK/`unavailable` 보존. Field DB 검사는 어떤 사건을 재시도 차단할지 순서에 의존한 처음 기대가 실패해 사건별 delivery 상태로 고쳐 전체 재실행했다. AP 정적 계약은 경로 누락 red→`1.0.0-preview.3` 1/1 green. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(제품 API/웹 및 도구), `pnpm build:agent`, `pnpm build:field`, import/DB 격리 exit 0. 새 API 빌드로 재시작한 로컬 mock PG17, 양쪽 별도 worker·웹에서 Field 시작/AP 시작 해제의 실제 HTTP·320px 전체 각 1/1: 기존 예약 사건 AP `processed`, 고객 `blocked_integration`, 화면 새로고침과 직접 연락 기록을 확인했다. AP API 실제 중단 재검사 1/1은 중단 중 ACK 보존/원격 확인 불가→재시작 후 원장 상태 복구를 확인했다. API 4311/4321 readiness 200. Git 저장소/커밋 없음. 실 공급사·route generation 전환·정식 QA/G/운영 서버 검수는 미실행이다.

## 최신 장애 검수 — I06 양방향 API 프로세스 중단·회수 (2026-09-25)

로컬 mock AP API를 중단하고 Field owner가 연결을 해제했다. Field API·사이트·기존 예약은 살아 있었고 Field의 원격 회수 원장은 `retry`, AP 연결은 아직 원격 미회수로 남았다. AP API를 재시작하자 별도 Field worker가 동일 revocation ID로 ACK를 받았고 AP source/grant가 폐기됐다. 반대로 Field API를 중단했을 때 AP owner 해제는 AP API·기존 문의를 유지하고 원격 상태 `retry`를 보여줬다. Field API 재시작 뒤 같은 ID로 ACK를 받고 Field grant·위젯 설치를 회수했다. 양 방향 모두 320px 소유자 화면의 대기/최종 상태, 기존 AP 문의·Field 예약 확인키를 확인했다.

검사: `FIELD_REVOKE_OUTAGE=ap FIELD_TEST_AP_SERVER_PID=<검증한 로컬 PID> FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http`와 `FIELD_REVOKE_OUTAGE=field FIELD_REVOKE_ORIGIN=ap FIELD_TEST_FIELD_SERVER_PID=<검증한 로컬 PID> FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 최종 각각 1/1 통과. 테스트는 PID의 명령·로컬 DB host를 확인하고 SIGTERM 뒤 HTTP 연결 실패, worker 시도 1회 이상, 자체 API/원본 접근 200, API 복구 뒤 동일 회수 ID와 반대 제품 회수 상태를 검사한다. 첫 AP 복구 상태 브라우저는 로그인 폼이 없는 Field 연결 화면에서 로그인하려다 실패했고 작업 화면 로그인→연결 화면 이동으로 수정해 재실행했다. 공통 health 검사를 단순 비 200에서 실제 연결 거부로 강화한 뒤 AP 방향도 재실행했다. `pnpm lint`, `pnpm typecheck` exit 0. Git 저장소/커밋 없음. 로컬 mock 결과이며 실 알림 공급사·운영 서버·정식 `test:integration:faults`/QA/G 검수는 미실행이다.

## 최신 기능 보강 — I06 해제 뒤 Field 기존 예약의 직접 연락 기록 (2026-09-25)

해제된 AP 연결이 전달한 기존 Field 예약은 여전히 Field 사업자 상세와 고객 확인키로 열 수 있다. Field owner는 예약 사건별로 직접 전화/대면의 `attempted` 또는 `reached`를 명시적으로 기록한다. Field DB의 `external_reservation_manual_contacts`와 outbox는 연락처/본문 없이 actor·예약·원본 사건·결과를 보관하며 동일 시도 ID 재전송은 한 기록으로 복구한다. 활성 연결/다른 조직·예약 사건에서는 기록을 거부하고, 담당자 계정 삭제 뒤에도 사건은 남는다. 화면은 AP 수신/처리·외부 고객 알림과 별도로 이 기록을 표시한다. 이 기능이 문자/카카오를 보내거나 AP 알림 성공 또는 새 route generation을 만든 것은 아니다.

검사: 새 Field owner GET 404 red→`pnpm test:spike:integrator:field` 1/1 green(활성 연결 409, 타인/타 사건 404, 첫 저장 201/동일 제출 200/다른 결과 409, outbox 한 건, 보조 owner 삭제 뒤 기록 보존). `pnpm test:spike:bookings:field` 3/3. 새 빌드의 Field API/웹과 AP/Field 별도 worker에서 Field 시작 및 AP 시작 해제의 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http`, `FIELD_REVOKE_ORIGIN=ap FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 각 실제 HTTP/320px 1/1: 기존 예약의 직접 연락 시도 저장·새로고침, Field 고객 알림 0건/AP 알림 개수 불변. 첫 전체 검사는 동명이인 테스트 예약을 선택한 브라우저가 저장됐다고 보였으나 대상 예약 단언은 0건으로 실패했고, 예약 ID로 선택하도록 고쳐 재실행 통과했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, import/DB 격리 exit 0. 실제 고객에게 전화하지 않았고, 공급사 발송/route 전환·운영 QA/G는 미검수다. Git 저장소/커밋 없음.

## 최신 기능 보강 — I06 양방향 연결 해제 (2026-09-25)

Field owner의 해제는 Field 연결·AP 위젯 설치·새 AP 작업을 먼저 중단하고 Field 전용 원장/worker가 서명 해제를 AP에 전달한다. AP owner의 해제는 AP 연결·Field source·위임 grant를 먼저 회수하고 AP 전용 원장/worker가 같은 연결별 HMAC 키로 Field에 전달한다. 양쪽 수신은 서명·시간창·키·연결 ID와 동일 revocation ID 재전송을 검증한다. 원격 장애는 `pending/retry/blocked`로 보여 완료로 표시하지 않는다. 기존 AP 문의·Field 예약과 이미 발급한 Field 고객 확인키는 유지한다. 기존 연결 예약의 알림 경로는 자동 전환하지 않는다.

검사: Field 시작의 Field DB/AP 제공자 DB·AP 정적 계약은 신규 경로 404/누락 red→각 1/1 green, AP 시작의 AP DB/Field 제공자 DB·Field 정적 계약도 red→각 1/1 green. 합성 원격 응답 분실 뒤 같은 revocation ID 재시도/ACK, 서명 누락·위조·만료 거부를 확인했다. 새 빌드의 로컬 mock PG17, API 4311/4321, 양쪽 별도 worker, 웹 3001/3002에서 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http`와 `FIELD_REVOKE_ORIGIN=ap FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http`는 각각 1/1 통과했다. 두 320px 화면에서 owner 명시 해제·원격 ACK·가로 넘침 없음/page error 0, 설치 중지와 Field OAuth access token 폐기, 기존 예약 확인키/AP 원본 보존을 확인했다. `pnpm test:spike:field-connection:agent`, `pnpm test:spike:ap-connection:field`, `pnpm test:spike:field-actions:agent` 각 1/1, 정적 계약 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 양쪽 API/AP 웹 build, import/DB 격리 exit 0. 추가 실 HTTP 단언의 UUID/text SQL 타입 불일치는 한 차례 실패했고 테스트 쿼리를 수정해 양방향 전체를 재실행했다. 실제 원격 API 프로세스 중단/재시작, route 전환·실 공급사와 정식 QA/출시 gate는 미검수다. Git 저장소/커밋 없음.

## 최신 기능 보강 — I05 Field 예약 사건 전달·AP 처리 결과 조회 (2026-09-25)

AP 공개 OAuth `GET /integrations/v1/events/{id}/delivery`는 `ap.conversations.read` 동의와 현재 client·actor·조직·배포·연결 및 해당 사건의 ActionRequest/예약 소속을 확인한다. Field owner의 `GET /v1/owner/reservations/{id}/event-deliveries`는 자기 예약·전송 원장을 먼저 읽고 ACK 사건의 AP 상태만 공개 API로 조회한다. 사업자 화면은 Field 전송, AP 수신·처리, AP 고객 알림과 열람 기록 유무를 별도로 표시한다. AP 장애에도 예약과 로컬 ACK를 볼 수 있다. 고객 실제 발송·읽음은 증빙되지 않았으며 발송 차단/열람 미기록으로 표시한다.

검사: AP 공개 조회 404·정적 계약 경로 누락·Field BFF 404 red→구현 뒤 AP DB 1/1, Field DB 1/1, AP 정적 계약 1/1. AP DB는 배포 선택 제거 404·grant 철회 401, Field DB는 타인 404·AP 503에서 로컬 ACK 보존을 확인했다. `pnpm lint`, `pnpm typecheck`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:field` exit 0. 별도 AP/Field API와 두 사건 worker의 `FIELD_EVENT_WORKERS_RUNNING=1 FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1에서 Field rev0/확정 rev1 ACK와 AP 처리·알림 차단 상태를 조회했다. Chromium 320px Field 사업자 상세는 상태 분리/새로고침, 가로 넘침 없음/page error 0을 확인했다. 정식 QA/출시 gate는 미검수다. Git 없음.

## 이전 기능 보강 — I04/I05 Field 서명 예약 사건 자동 전달 (2026-09-25)

양방향 OAuth bind에 연결별 HMAC 키와 초기 route generation을 포함하고 AP/Field DB에 각자 다른 목적 키로 암호화한다. Field 예약 사건/아웃박스에서 연결 예약 사건을 찾아 Field 전용 delivery 원장·worker가 PII 없는 본문을 서명해 AP 공개 HTTP로 보낸다. AP는 키·현재 연결·본문·시간창을 확인하고 durable inbox 저장 뒤 202를 반환한다. AP 전용 worker는 ActionRequest와 reservation ID·연속 revision을 검사해 역순 사건을 보류하고 예약 사건/고객 알림을 한 트랜잭션에서 멱등 기록한다. ACK와 고객 알림 발송 성공을 구분하며 공급사 미연결 알림은 `blocked_integration`이다. Field 고객 알림 중복 발송은 없다.

검사: Field bind 키 변경 replay DB red→green, AP bind 키 누락 DB red→green. `pnpm test:spike:integrator:field` 1/1은 3개 사건의 서명·PII 비노출·응답 분실 뒤 동일 ID 재시도와 grant 철회 blocked를 확인했다. `pnpm test:spike:field-actions:agent` 1/1은 서명 누락/만료·변조·중복·역순 사건과 AP 고객 알림 한 건을 확인했다. 정적 AP/Field OpenAPI 2/2, `pnpm test:spike:ap-field:http` 실제 HTTP 1/1, `FIELD_EVENT_WORKERS_RUNNING=1 pnpm test:spike:ap-field:http` 별도 worker 자동 전달 실제 HTTP 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 양쪽 API build, import·DB 격리 exit 0. 320px 브라우저는 이번 새 자동 전달 변경 뒤 재실행하지 않았고 기존 수동 동기화 화면 검수 근거만 유지한다. 운영 API 중단·route 전환/키 회전, AP 처리 결과의 Field 화면 조회, 정식 QA/실 공급사/출시 gate는 미실행이다. Git 저장소/커밋 없음.

## 이전 기능 보강 — I05 Field에서 AP 원본 답변 (2026-09-25)

### 미전송 답변 재시작 복구

Field는 AP 호출 전 미전송 답변의 암호문·원본 revision·제출 키를 `field.ap_reply_drafts`에 기록한다. AP 응답이 불명확하면 결과를 unknown으로 남기고 새로고침/서버 재시작 후 같은 본문과 키로 재시도한다. 다른 본문은 거부한다. AP 수락 후 본문 암호문을 지우고 AP message ID/알림 상태 영수증만 남겨 Field transcript를 만들지 않는다. Field→브라우저 응답만 분실된 경우에도 영수증으로 저장 성공을 다시 확인한다.

검사: 신규 초안 GET은 404 red→migration/API 후 `pnpm test:spike:ap-connection:field` 1/1 green. 합성 AP 응답 분실 뒤 타 본문 거부·새 앱 인스턴스 동일 key replay·암호문·수락 뒤 본문 삭제/캐시 응답을 확인했다. 실제 API·웹 재시작 후 `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1은 320px에서 로컬 reply scope 제거로 실패를 재현하고 새로고침 초안 복원→scope 복원 후 재시도, Field→브라우저 응답 분실 뒤 AP 원본 영수증 확인을 검수했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Field API/웹 build, import/DB 격리 exit 0. 실제 알림 공급사·예약 후속 알림·정식 QA/G-I2는 미실행. Git 없음.

Field owner가 AP에서 전달받은 문의를 열면 Field BFF는 자기 외부 요청/양방향 연결/actor와 AP의 최신 OAuth `/me` scope·배포를 검사한다. 대화와 메시지는 AP 공개 API로 읽으며 Field DB에 원문을 복제하지 않는다. 답변은 AP `ap.conversations.reply`의 별도 owner 동의, 원본 revision, 같은 멱등 키를 사용한다. AP가 원본 message ID/outbox/고객 알림을 기록한다. Field 화면은 AP 응답 미상일 때 작성 내용을 유지해 같은 제출을 재시도하고, AP 저장 성공과 공급사 미연결 알림을 구분한다. mock client 등록 범위만 확대했고 기존 OAuth grant·consent는 자동 확장하지 않았다.

검사: `pnpm test:spike:ap-connection:field` 1/1에서 타 actor 거부·읽기 실패·reply scope 거부·AP 응답 분실 뒤 같은 키 재시도 확인. `pnpm test:spike:integrator:agent` 1/1, `pnpm test:spike:ap-field:http` 1/1에서 실제 두 API를 통한 답변과 AP 단일 notification event 확인. `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 1/1은 Chromium 320px 원본 읽기, 합성 503에서 답변 초안 유지, 재시도 뒤 AP 저장·고객 알림 미발송 표시를 확인했다. `pnpm lint`, `pnpm typecheck`, Field API·웹 build는 exit 0. 실제 AP 응답 분실은 DB 테스트의 합성 fetcher에서 재현했다. 열린 화면 밖의 초안 복구, 실 공급사 알림, 예약 후속 사건·정식 QA144/145/148/149/G-I2는 미실행. Git 저장소/커밋 없음.

## 이전 기능 보강 — I04 AP 고객의 Field 예약 접근 인계 (2026-09-25)

AP 고객이 자신의 대화 확인키로 accepted Field 예약의 접근 코드를 요청하면 AP는 현재 양방향 연결·별도 `field.customer_access.create` scope를 확인한다. Field는 자체 원장의 action/connection/외부 요청/예약/조직을 다시 맞춰 5분짜리 1회 코드를 발급한다. 고객은 코드를 Field 화면에 입력해 Field 예약 확인키를 받는다. 이후 Field 예약 조회·변경 요청은 AP가 없어도 Field에서 처리한다. 새 교환은 이전 Field 확인키를 폐기하고, 코드 발급은 예약당 1시간 5회로 제한한다. 코드/키 원문은 URL·DB·outbox에 남기지 않는다.

검사: Field scope 등록은 기존 DB resource에 빠져 OAuth 새 scope 400 red였고 migration `000028` 적용 후 토큰에 scope가 포함됐다. Field handoff SQL의 text/uuid 비교 500을 수정했다. Field 제공자 DB `pnpm test:spike:integrator:field` 1/1은 무권한/타 예약 거부, 1회/만료/동시 교환, 키 회전, 발급 제한, grant 철회 후 Field 예약 접근을 확인한다. AP 소비자 새 경로 404 red→`pnpm test:spike:field-actions:agent` 1/1 green은 대화 확인키·accepted 예약·연결 악화 거부를 검사했다. `pnpm test:spike:field-connection:agent` 1/1, Field 계약 정적 1/1, lint/typecheck/양쪽 API·웹 build/import 경계 exit 0. 새 mock OAuth 동의 후 실제 양쪽 서버 HTTP·Chromium 320px AP 코드 발급→Field 교환→Field 예약 열기 1/1 통과. AP 서버를 실제 중지한 운영 독립성 검수와 정식 QA153/155/출시 gate는 미실행. Git 저장소/커밋 없음.

## 이전 기능 보강 — I04 Field 사업자의 AP 전달 문의 목록 (2026-09-25)

Field는 외부 문의의 수신 snapshot을 직접 문의 원본과 별도로 owner/editor에게 보여준다. `field.external_request.accepted` 한 건이 사업자 내부 알림 한 건을 만들고 같은 ActionRequest를 재전송해도 중복 알림을 만들지 않는다. 사업자 화면은 고객 연락처·전달 요약·서비스·접수 시각·테스트 여부를 표시한다. Field 예약 요청은 기존 예약함에 그대로 표시된다. AP 원본 대화와 답변은 이 목록으로 복제하거나 성공 처리하지 않는다.

검사: Field 제공자 DB 테스트에서 owner 조회 API 404 red→`pnpm test:spike:integrator:field` 1/1 green, 타인/무인증 거부·문의만 목록·내부 알림 하나·replay 후 알림 하나 확인. `pnpm test:spike:bookings:field` 3/3, lint/typecheck/Field API·웹 build exit 0. 마지막 Field API/웹 재시작 후 `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 실제 AP→Field 예약·문의와 Field owner API·Chromium 320px Field 사업자 목록 1/1 통과. AP 원본 위임 답변·고객 capability/확정 이벤트와 정식 QA/운영 공급사는 남았다. Git 저장소/커밋 없음.

## 이전 기능 보강 — I04 AP 고객 동의·ActionRequest 전달 (2026-09-25)

AP 원본 문의의 별도 확인키를 가진 고객이 Field 연결 서비스의 현재 가격·시간표·정책과 자신의 연락처, 전달 대상/항목을 확인하고 동의하면 AP ActionRequest가 별도 원장에 저장된다. AP는 같은 ID/본문 hash로 Field 공개 API에 보내고 Field는 미확정 예약으로 접수한다. 응답 분실은 `delivery_unknown`으로 표시하고 같은 대화/연결/서비스/업무 종류의 새 요청을 막는다. 고객의 재조회에서 Field by-source 결과가 권위 있는 404라면 같은 ID/본문으로만 재전송한다. AP outbox에는 고객 연락처가 없다.

검사: AP 새 고객 경로 404 red→`pnpm test:spike:field-actions:agent` 1/1 green. 결과 미상 중 새 키가 202인 red→DB 부분 유일 제약의 409 green. 서비스 목록·원시 가용성·연락처 미표시·404 뒤 재전송·접수 outbox도 red→green. AP 상담·원본 문의·연결 회귀 각 1/1, Field 예약 3/3. AP API를 재시작한 뒤 당시 `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 실제 양쪽 서버 OAuth→AP ActionRequest→Field 수신/예약·Chromium 320px 고객 동의/접수 1/1. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, import 경계 exit 0. 당시 문서 재생성·패키지 검사도 통과했으나 이는 서비스 출시 검수가 아니다. 이후 Field 사업자 문의 목록은 위 최신 기능 보강에 기록했다. Git 저장소/커밋 없음.

## 이전 기능 보강 — I04 Field 외부 요청 수신 기반 (2026-09-25)

Field 승인 카탈로그와 현재 정책의 서비스 가격·예약 방식·가용 슬롯을 공개 OAuth API로 조회한다. Field의 별도 `requests.create/read` 동의 토큰은 같은 연결과 허용 배포의 AP 요청을 수신하고 원래 ActionRequest ID로 결과를 다시 조회할 수 있다. 고객 전달 동의의 대상/항목/시각과 최신 서비스·정책 revision, 조건 hash를 검사하며 같은 ID/본문 재전송은 기존 수신 증빙을 반환한다. 시간표 요청은 Field 예약 `requested`로만 저장하고 고객 외부 알림은 AP 처리 소유로 표시한다. 첨부 전달은 수신하지 않는다.

검사: 새 수신 경로 404 red→구현 후 `pnpm test:spike:integrator:field` 1/1, 만료 동의의 동일 요청 재전송 409 red→기존 수신 조회 200 green. Field owner 확정 시 고객 중복 알림 원장 1건 red→0건 green. Field 예약 회귀 `pnpm test:spike:bookings:field` 3/3, 정적 계약 1/1, AP 연결 DB 1/1. 당시 실제 두 mock 서버 OAuth scope·연결·SDK 설치와 320px Chromium `pnpm test:spike:ap-field:http` 1/1은 외부 요청 전송을 포함하지 않았다. 당시 `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field` exit 0. 로컬 mock PG17에서 migration `000025` 적용, mock AP OAuth client의 **허용 scope만** 확대하고 기존 사용자 consent/grant는 그대로다. 이후 AP 고객 전송·HTTP 검수는 위 최신 기능 보강에 기록했다. Git 저장소/커밋 없음.

## 최신 기능 보강 — I03 Field 사이트 AP SDK 설치 (2026-09-25)

Field 사업장별 `field-<slug>.localhost:3002` 공개 사이트에서만 소유 증명값을 제공한다. AP는 mock 환경에서 해당 사이트의 well-known 응답을 확인하고, 운영 HTTPS 주소는 DNS TXT 검증을 유지한다. AP OAuth bearer의 선택된 활성 배포 목록은 공개 계약 `/integrations/v1/deployments`로 조회한다. Field owner는 해당 조직의 연결·배포·정확한 origin이 모두 맞는 `owned_embed`만 설치할 수 있고, 공개 사이트는 일반 AP `/sdk/v1.js`를 로드한다. Field의 직접 문의·예약은 AP 연결과 별도다.

검사: `pnpm test:spike:contracts:agent` 정적+제공자 DB, `pnpm test:spike:sites:field` 2/2, `pnpm test:spike:deployments:agent` 1/1, `pnpm test:spike:ap-connection:field` 1/1, `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python pnpm test:spike:ap-field:http` 실제 양쪽 서버 HTTP 1/1+Chromium 320px 1회. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 양쪽 API·웹 build, import·DB 격리 통과. 첫 HTTP 검사는 합성 사이트 공개본 FK 정리 순서 때문에 실패했고 수정 후 통과했다. 실도메인·TLS/공급사·출시 게이트는 미검수다. Git 저장소·커밋은 없다.

## 이전 기능 보강 — I01 Field 공개 기능 발견 (2026-09-25)

Field OAuth bearer `GET /integrations/v1/capabilities`는 선택 조직과 계약 버전 `1.0`, 사실 읽기 지원 여부 및 아직 구현하지 않은 가용성 조회·외부 요청·제안 응답의 미지원 상태를 반환한다. AP owner의 `GET /v1/connections/field/{id}/capabilities`는 AP 동의·조직·Field grant를 다시 확인하고 공개 Field endpoint를 호출한다. 타 조직·지원하지 않는 계약 버전·Field 장애는 성공 상태가 아니며, 기존 AP/Field 자체 기능을 막지 않는다. AP 연결 화면은 지원 기능과 미지원 항목을 표시한다.

새 Field DB/계약 및 AP DB 기대 테스트는 양쪽 경로 404 red였고 구현 후 Field 계약 정적+DB 각 1/1, AP DB 1/1 통과. 실제 두 mock API의 OAuth→기능 조회 HTTP 1/1, Chromium 320px 지원 기능 버튼·문구 및 기존 연결/출처 흐름 1회, page error 0·가로 넘침 없음. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 양쪽 API·AP 웹 build, import·DB 격리 exit 0. 첫 새 UI `typecheck`는 map 원소 조회의 nullable 타입 오류로 실패해 변수로 좁힌 뒤 통과. Git 없음. 사용 가능 시간·업무 요청·설치·부분연결은 여전히 미구현이다.

## 이전 기능 보강 — I02 Field 설명의 AP 지식 공개·AI 근거 (2026-09-25)

AP owner가 승인된 Field source에서 사업 소개·지역과 서비스 설명을 명시 선택하면 서버가 Field 공개 API의 현행 조직/revision/hash를 다시 확인한 뒤 native 지식을 보존하는 새 AP KnowledgeRelease를 만든다. source ID·revision/hash·선택·actor를 별도 메타데이터에 남긴다. 직접 입력 draft revision과 조직의 공개 release revision을 분리해 이후 native 지식 수정/재공개도 순서대로 처리한다. 같은 선택 재시도는 기존 release를 반환한다. AP 직접 입력 서비스와 같은 Field 서비스명은 자동 병합하지 않고 409로 거부한다. 숫자를 포함한 Field 소개/설명도 안전 검토 전까지 거부하며 Field 가격·영업시간·예약 조건은 정적 AI 근거에 넣지 않는다. 출처가 current/승인 버전/hash·24시간 이내 확인·연결 권한 조건을 만족할 때만 Field 설명을 사업자 테스트·고객 상담 AI 근거로 사용한다. 새 Field 버전은 AI 근거에서 즉시 제외한다. 새 KnowledgeRelease 뒤 기존 AgentRelease는 다시 승인해야 한다.

신규 AP DB 기대 테스트의 publish 404 red→구현 뒤 1/1 green, 기존 사업 지식 2/2·AI 2/2·고객 상담 1/1, 실제 별도 두 서버 HTTP 1/1(출처 승인→지식 공개→기존 AI stale→새 AI 승인), Chromium 320px 두 동의→source 저장/승인→소개 선택·공개→새로고침 재열람, page error 0·가로 넘침 없음. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, import/DB 자격증명 격리 exit 0. signed 이벤트/누락 재조정, 중요값의 live 재확인과 정식 QA/G-I2는 남는다. Git 없음.

## 이전 기능 보강 — I02 AP owner의 Field source 명시 승인 (2026-09-25)

AP owner가 저장된 Field 승인본의 revision/hash를 보고 체크박스로 검토 확인한 뒤 출처 승인한다. AP 서버는 Field 공개 `/me`·`/facts`로 현행 조직·grant·scope·revision/hash를 다시 확인한다. 원본 변경, Field 장애, 저장 원장의 `integrity_conflict`, 타 owner, stale 요청은 승인하지 않는다. 승인자와 시각, `approved_source_revision`, AP outbox 사건을 한 DB 트랜잭션에 기록한다. 같은 승인 재시도는 200으로 기존 기록을 반환하며 사건을 다시 만들지 않는다. 신규 Field revision은 다시 `pending_review`가 된다. 출처 승인은 AP KnowledgeRelease/고객 AI 활성화가 아니며 응답/UI에 이를 표시한다.

AP DB 기대 테스트는 신규 승인 API 404 red→migration/API 후 1/1 green(원격 변경/장애·타 owner·멱등·새 버전·충돌·outbox). 실제 별도 AP/Field 서버 HTTP에서 Field 승인 서비스/가격 source 저장→명시 승인→AP 공개 지식 release 수 불변 1/1. Chromium 320px 두 동의→저장→검토 체크→승인→새로고침/재열람은 page error 0·가로 넘침 없음. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, import/DB credential 격리 exit 0. KnowledgeRelease/AI 안전 결합과 중요값 live 재확인·signed event/정식 QA/G-I2는 남는다. Git 없음.

## 이전 기능 보강 — I02 Field source snapshot·버전 충돌 격리 (2026-09-25)

AP owner가 Field의 승인 facts를 가져오면 AP 제품 DB의 별도 `knowledge_sources`/`knowledge_source_snapshots`에 connection·Field 조직·release/revision/hash·시각·공개 사실을 기록한다. 같은 revision/hash는 기존 snapshot을 사용하고 낮은 revision은 최신 상태를 내리지 않는다. 같은 revision의 다른 hash는 관측 payload를 격리 원장에 보관하고 source를 `integrity_conflict`로 전환하며 outbox 사건을 1회 기록한다. 새 상위 revision은 `pending_review`와 별도 snapshot/outbox를 만든다. 원격 Field에서 공개 계약 밖 전화번호·내부 메모가 와도 AP 응답/원장에는 보관하지 않는다. AP 원본 지식 release·고객 AI 자료는 바꾸지 않는다. Field 권한 상태가 나빠져도 AP owner는 이미 보관한 검토 자료를 재열람할 수 있다.

AP DB 테스트는 새 sync API 404 red→migration/API 후 1/1 green(타 owner·중복·상위/하위 버전·hash 충돌·검토 자료 보존·미승인 공개 차단). 실제 두 서버 HTTP에서 승인 Field 서비스/가격을 AP 원장으로 읽고 native AP 지식 release 수가 그대로인 것을 1/1 확인했다. Chromium 320px 두 동의→저장→새로고침→보관본 재열람에서 page error 0·가로 넘침 없음. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. AP의 명시 승인과 KnowledgeRelease 연결, signed 변경 이벤트/누락 재조정, 중요값 실시간 확인·정식 G-I2/QA135~138은 남았다. Git 없음.

## 이전 기능 보강 — I00/I02 AP 보관 Field grant 회전·승인 정보 검토 (2026-09-25)

AP 조직 owner는 별도 양방향 동의가 `review_required`인 연결에서 Field의 승인 카탈로그를 읽어 검토할 수 있다. AP 서버는 기존 AP grant/owner와 Field 공개 `/me`의 grant·조직·scope를 재확인하고 Field 공개 `/facts`만 조회한다. 만료된 AP 보관 Field access token은 Field OAuth refresh endpoint에서 한 번 회전하고 새 access/refresh를 AP DB 키로 암호화 저장한다. refresh 실패·결과 미상은 `degraded`로 기록하고 자동 재호출하지 않는다. 검토 응답은 `pending_review`이며 AP 승인 지식·AI·가격 안내에 자동 반영되지 않는다.

새 AP DB 테스트는 조회 API 404 red→구현 후 1/1 green. 실제 두 서버 HTTP에서 Field 승인 카탈로그 발행→AP 역방향 동의→AP 토큰 만료 강제→refresh rotation→승인 정보 조회 1/1 통과. Chromium 320px에서 두 동의 뒤 AP 검토 버튼과 원본 개정/미반영 표시, 가로 넘침 없음·page error 0건을 확인했다. `pnpm lint`, `pnpm typecheck`, `pnpm build:agent`, `pnpm build:web:agent` exit 0. 첫 실제 HTTP는 이전 AP 서버 프로세스가 새 경로를 모르는 404였고 mock AP 서버 재시작 후 통과했다. 첫 브라우저 실행은 `next build` 이후 기존 `next start` 프로세스가 페이지 오류를 내서 실패했고 AP 웹을 새 빌드로 재시작한 뒤 통과했다. source snapshot/해시 충돌/명시 AP 승인·이벤트와 정식 QA/G는 미완료다. Git 없음.

## 이전 기능 보강 — I00 만료 AP grant 회전·전체 브라우저 동의 (2026-09-25)

실제 Chromium 320px 한 브라우저에서 Field owner의 연결 시작→AP owner의 별도 조직·AI 동의→Field owner의 별도 사업장 동의→AP/Field의 동일 `review_required`를 확인했다. 합성 계정/조직은 검수 후 제거했다. 처음 두 웹을 모두 `localhost`로 열면 동일 `better-auth.session_token`이 포트별로 분리되지 않아 AP 세션이 Field 로그인 뒤 사라지는 것을 재현했다. mock Field 웹 origin/안내 주소를 `127.0.0.1:3002`, AP를 `localhost:3001`로 고정하고 등록 도구가 기존 mock 설정도 이전하도록 보강했다. 기본 설정 재기동 뒤 전체 브라우저 흐름을 다시 통과했다.

Field 원장에 저장한 AP access token이 만료되면 Field가 AP의 공개 OAuth token endpoint로 저장된 refresh token을 한 번 회전하고 새 access/refresh를 Field 키로 다시 암호화한 뒤 AP 공개 `/me`를 재검증한다. refresh 실패·결과 미상·AP grant 조회 불가·scope 변경은 `degraded`로 기록해 같은 연결의 자동 재시도를 막는다. DB 기대 테스트는 만료 시 기존 503 red, 실패 후 pending 상태 red를 확인한 뒤 각각 green. `pnpm test:spike:ap-connection:field` 1/1, 실제 두 서버의 만료 토큰 강제 후 `pnpm test:spike:ap-field:http` 1/1, 전체 Playwright Chromium 320px 1회 추가 통과, `pnpm test:spike:oauth:agent` 2/2, Field 공개 계약 정적/DB 각 1/1, `lint`, `typecheck`, `test:unit`, Field API/양쪽 웹 build, UI HTTP, import/DB 격리, 제품별 단독 readiness가 exit 0이다. 첫 `typecheck`는 새 테스트의 nullable DB row 오류로 실패했고 row 존재 검사 후 통과했다. 운영 공급사·양방향 revoke·정식 QA/G-I1은 미완료다. Git 없음.

## 이전 기능 보강 — I00/I01 양방향 동의와 명시 연결 원장 (2026-09-25)

Field 연결 화면에서 AP의 별도 동의 화면으로 이동하고, AP BFF가 Field OAuth code+PKCE를 받아 Field 공개 `/me`로 grant/조직/scope를 확인한다. AP와 Field는 서로의 DB·session을 공유하지 않고 각자 access/refresh를 AES-GCM 암호화 보관한다. AP가 Field 공개 bind API를 호출하면 Field는 저장된 AP token으로 AP 공개 `/me`를 다시 확인하고 두 방향의 조직·AI·actor·grant를 같은 connection ID에 묶는다. 두 원장은 `review_required`이며 정보 동기화·설치 활성으로 오인하지 않는다. 결과 미상은 `binding_unknown`으로 남긴다.

의도한 red는 AP reverse API 404, Field bind API 404, Field refresh 등록 400, Field OpenAPI 새 경로 누락이었다. 수정 후 `pnpm test:spike:field-connection:agent` 1/1, `test:spike:ap-connection:field` 1/1, `test:spike:ap-field:http` 실제 두 서버 1/1, `test:spike:oauth:agent`·`oauth:field` 각 2/2, `test:spike:contracts:field` 정적+DB 각 1/1, `test:spike:connection-ui:http` 1/1, `lint`, `typecheck`, `test:unit`, 양쪽 API/웹 build, import·DB credential 격리와 양쪽 단독 readiness spike가 exit 0이다. Chromium 320px에서 AP·Field 두 연결 경로 HTTP 200·가로 넘침 없음·page error 0건을 확인했다. 전체 브라우저 로그인→양쪽 동의는 아직 실행하지 않았다. 실 공급사·정식 계약/보안/출시 게이트는 남아 있다. Git 없음.

## 이전 기능 보강 — I00 Field BFF의 AP 접근 승인 1차 단계 (2026-09-24)

Field owner가 `/workspace/integrations`에서 자신의 조직을 골라 AP OAuth code+PKCE를 시작한다. AP에서 별도 로그인·조직·AI·scope를 승인하면 Field callback이 state·issuer·현재 Field owner와 AP 공개 `/me`·`/agent`를 검증하고 token을 Field 전용 32바이트 키로 AES-GCM 암호화해 `pending_field_consent`로 저장한다. 거부·중복 callback·결과 미상을 분리하고 브라우저에는 토큰을 반환하지 않는다. AP가 없는 Field에서는 연결 시작만 `blocked_integration`이며 자체 사이트·문의·예약 API는 계속 동작한다. 로컬 mock은 `pnpm setup:mock:ap-connector`로 AP client를 등록하고 Field 전용 env를 구성한다. 이 단계는 Field 정보 제공 동의·연결 활성화가 아니다.

Field DB 기대 테스트는 최초 404 red 뒤 1/1 통과했다. AP `offline_access` 등록/refresh rotation은 최초 400과 refresh 누락을 확인한 뒤 resource 설정·migration으로 수정해 OAuth 2/2 통과했다. 실제 AP 토큰 응답은 `openid`를 scope 목록에 돌려주지 않아 Field는 `offline_access`와 필요한 AP scope를 검증한다. 별도 mock AP 4311·Field 4321의 `pnpm test:spike:ap-field:http` 1/1에서 AP 동의 코드→Field callback→AP 공개 API→Field pending 연결·callback 재시도를 확인했다. AP integrator 1/1, Field OAuth 2/2·integrator 1/1, lint/typecheck/unit·AP/Field API와 Field 웹 빌드·제품 import/DB 격리 exit 0. Field 연결 화면은 320px 비로그인 안내·버튼 비활성·넘침 없음·page error 0건만 확인했고 실제 브라우저 AP 동의 E2E는 미실행이다. 정식 QA/출시 게이트는 미통과다.

## 이전 기능 보강 — I00 Field 역방향 OAuth·승인 사실 읽기 (2026-09-24)

Field owner가 별도 Field 계정으로 사업장과 `field.facts.read` 범위를 선택하고 동의한다. Field issuer의 opaque access token은 Field DB에서 client/resource/actor/선택/consent/current owner membership을 다시 검사한다. `/integrations/v1/me`와 `/facts`는 해당 사업장의 최신 승인 카탈로그 최소 정보만 제공하고 연락처·초안·고객 원본을 제외한다. Field selection revoke는 access/refresh token·consent만 폐기하며 기존 사이트·문의·예약은 유지한다. Field 웹 로그인/선택/동의·거부 화면과 OpenAPI 미리보기를 연결했다. AP 내부 코드/DB import는 없다.

`pnpm test:spike:integrator:field`의 미구현 options 404 red 후 정적 계약 1/1+DB 제공자 1/1, Field OAuth 2/2, 교차 issuer와 실제 API의 상대 token 401 1/1, Field 사업/문의 회귀 2/2가 exit 0이다. lint/typecheck/unit, 양쪽 API 빌드·Field 웹 빌드, import/DB 자격증명 격리, 제품별 자기 DB/인증 환경의 임시 포트 readiness spike도 exit 0이다. Chrome 320px에서 선택→동의→합성 callback code, 가로 넘침 없음·page error 0건을 확인하고 합성 계정/조직 2건을 삭제했다. 초기 브라우저 버튼 높이는 44px로 보강 후 재검수했다. 기존 AP API 4311이 새 답변 경로에서 404를 반환해 새 코드로 재시작했고 readiness 200·무인증 답변 401을 확인했다. 실제 AP client BFF, 양방향 binding, 정식 계약/보안/출시 QA는 미구현이므로 I00은 `in_progress`다. 커밋 없음.

## 이전 기능 보강 — A09 AP 위임 메시지·사람 답변·OpenAPI 미리보기 (2026-09-24)

AP 선택·OAuth token·consent에 모두 `ap.conversations.reply`가 있는 actor는 자신이 선택한 활성 배포의 고객 동의 원본에 사람 답변을 쓸 수 있다. 예상 revision과 재시도 키를 잠금 트랜잭션에서 검사하고 AP 원본 메시지·actor/client/grant 감사 값·outbox·고객 알림 원장을 한 번만 기록한다. 공급사 미연결 고객 전달은 `blocked_integration`이다. `/me`와 고객 공개 메시지 cursor를 추가하고 대화 상세는 메타데이터/revision만 반환한다. `contracts/agent-integrator-v1.openapi.json`은 현재 제공자 경로의 미리보기이며 C01 전체 계약은 아니다.

새 DB 기대값은 `/me`와 답변 경로가 없어 각각 404 red를 확인했다. 첫 답변 동의 token이 403인 원인은 기존 `oauthResource.allowedScopes`에 새 scope가 저장되지 않은 것이었고 `000029` migration으로 갱신했다. 이어 테스트 전용 SQL의 `text=uuid` 비교 오류를 형변환으로 수정했다. `pnpm test:spike:contracts:agent` 정적 1/1+DB 제공자 1/1, `pnpm test:spike:oauth:agent` 2/2, `pnpm test:spike:oauth:issuers` 1/1, `pnpm test:spike:inquiries:agent` 1/1, lint/typecheck/unit/AP 빌드/import·DB 격리 exit 0을 확인했다. 최신 API의 브라우저 UI 검수, Field 소비자 및 정식 `pnpm test:contracts`는 미실행/미완성이다. 커밋 없음.

## 이전 기능 보강 — A09 AP 공식 통합자 인가·공개 읽기 (2026-09-24)

AP OAuth Provider가 등록 client의 code+PKCE(S256), AP resource audience, 동의와 opaque token을 처리한다. AP owner가 실제 소유한 조직의 현재 승인 AI와 활성 상담 배포를 명시 선택하고 `ap.agent.read`/`ap.conversations.read` 중 요청 범위를 동의한다. 공개 API는 token 해시·만료·revocation·client·actor·scope·resource·선택 reference와 현재 owner membership을 검사한다. 최소 AI 정보와 선택 배포의 고객 동의 대화/고객 공개 메시지만 반환한다. 선택 철회는 access/refresh token과 동의를 AP DB에서 폐기하며 AP 원본을 지우지 않는다. Field 내부 코드·DB는 사용하지 않는다.

새 DB 검사는 API 404를 의도한 red(exit 1)로 확인한 뒤 `pnpm test:spike:integrator:agent` 1/1 exit 0이다. 타 owner·미등록 scope·타 배포 선택, 실제 동의/code 교환/bearer 조회, 선택 안 한 배포 404, 내부 메모/연락처 비노출, 타 사용자 철회 거부·철회 후 401을 검사했다. `pnpm test:spike:oauth:agent` 2/2, `pnpm test:spike:oauth:issuers` 1/1, lint/typecheck/unit/AP API·웹 빌드/제품 import·DB 격리 exit 0. Chrome 320px에서 조직·배포 선택→동의→합성 외부 HTTPS callback code를 확인했고 가로 넘침·page error는 없었다. 합성 계정/조직 2개를 정리했다. 최초 OAuth 테스트는 자동 resource 연결로 바뀐 기대값과 postLogin 반복 이동 때문에 실패해 흐름을 수정했고, 최초 교차 issuer 검사는 새 `AP_PUBLIC_WEB_ORIGIN` 설정 누락으로 실패해 독립 프로세스에 명시했다. 첫 브라우저 검수는 잘못된 checkbox 선택자로 실패했으며 선택자를 수정해 재실행했다. 정식 AP/Field 양방향 연결·나머지 위임 scope·공식 OpenAPI/consumer test·실 client 심사/보안 검수는 미완료다.

## 이전 기능 보강 — D04 AP 매체 성과·개인정보 보호 집계 (2026-09-24)

AP 배치 상담 시작과 고객 연락처 동의 접수를 문의 트랜잭션 안에서 `ap.distribution_events`에 한 번씩 기록한다. 과거 D03 문의는 출처 분류를 증명할 수 없어 `unclassified`로 이관하고 공개 집계에서는 제외한다. AP 공개 미리보기의 직접 상담은 `preview`, mock 명시 테스트 헤더는 `test`, 알려진 크롤러 UA는 `bot`으로 분류한다. 상담 카드 조회·iframe reload 자체는 신뢰 가능한 노출 사건으로 세지 않는다. 사업자·매체는 각자 membership 범위의 완료된 UTC 주 8개에 대해 상담 시작·동의 접수의 구간값만 본다. 0~4건은 모두 `under_5`, 이후 5~9/10~19/20~49/50~99/100+이며 JSON/CSV가 같다. 개별 배치/사업자/슬롯/임의 날짜 필터·정확한 합계·원본 ID는 공개하지 않는다. 실제 Field 예약 확정 이벤트가 없어 `unsupported_unconnected`, 매출·수금은 `not_measured`다.

`pnpm test:spike:distribution:agent`는 새 API의 404를 의도한 red(exit 1)로 확인한 뒤 구현 후 1/1 exit 0이다. 실제 AP 상담 원본 2건의 사건 기록, 미리보기·mock 테스트·Googlebot 분류, 비회원/타 매체·사업자 거부, 5 미만 억제·완료 주 구간·JSON/CSV 동일·PII 비노출, 합성 3건 추가 시 5~9 구간과 제외 트래픽 15건 무영향을 검사했다. D02/A05 상담·배포 회귀 각 1/1, lint/typecheck/unit/AP API·웹 빌드·제품 import/DB 격리 exit 0. 별도 origin Chrome 320px에서 사업자/매체 성과 패널·CSV와 외부 카드→AP 동의 접수 재검수, 부모 DOM 개인정보 비노출·가로 넘침 없음·page error 0건을 확인했다. 합성 계정/조직은 정리했다. 첫 브라우저 명령 `python`은 없고 기본 `python3`에는 playwright가 없어 실패했으며, 기존 `/tmp/fieldai-report-venv/bin/python`으로 재실행 통과했다. 운영 봇 방어·실제 제휴·예약 확정 사건·정식 차분 공격/G-D2는 미검수다.

## 이전 기능 보강 — D03 AP 외부 기사 카드·안전 접수 전환 (2026-09-24)

매체 owner가 현재 공개 가능한 승인 배치에 대해 AP 설치 코드를 발급하면 정확한 HTTPS origin의 기사에 AP iframe 광고 카드를 넣는다. iframe에는 승인 카드의 광고 표시·상호·서비스명·설명이 보이고, 질문은 AP 세션/DB에서 처리한다. 실제 모델이 없으면 AI 답변을 성공으로 표시하지 않고 AP 사람 문의 전환을 제공한다. 고객이 쓴 질문·희망 조건은 짧은 1회 ticket으로 AP 첫 화면에 이동하고 승인 서비스가 선택된 상태에서 이름·연락처·동의 후 제출한다. AP는 placement ID를 고객 body가 아니라 배포/세션에서 기록한다. 취소·slot 중지·DNS 만료 후 배포와 새 상담은 거부하되 기존 고객 확인키 원본은 보존한다. 매체 부모 DOM/API에는 연락처·사진·접수키·원문을 반환하지 않는다. 조직별 배치 대화 시작 건수는 24시간 제한하며 sandbox/live에는 명시 설정이 필요하다.

선행 `test/distribution.db.test.ts`는 설치 API 404로 red(exit 1), 구현 후 `pnpm test:spike:distribution:agent` 1/1 exit 0이다. 설치 권한·중복 코드·정확 origin/CSP·DNS 만료·nonce 1회·handoff 출처/1회·질문/희망 조건/서비스 유지·AI 공급사 미연결·합성 AI 대화→같은 원본 사람 접수·위조 배치 ID 무시·취소 뒤 접근 거부·24시간 제한을 검사했다. A05 상담 배포·AP 상담, D00~D02 DB 회귀 각 1/1, lint·typecheck·unit·AP API/웹 빌드·제품 import/DB 격리 exit 0. 별도 origin Chrome에서 AP iframe 광고 카드→공급사 미연결 안내→질문/희망 조건·서비스 AP 인계→동의 접수, 320px 가로 넘침 없음·page error 0건과 부모 DOM 개인정보 비노출, 취소 뒤 새 공개 접근 거부/기존 확인키 조회를 확인했다. 합성 계정/조직 정리. 브라우저 첫 실행은 Playwright APIRequestContext가 합성 HTTPS 도메인의 DNS를 직접 조회해 실패했고, 이미 프록시된 로컬 검수 URL로 바꿔 재실행 통과했다. 실제 제휴 도메인·실모델/알림·제3자 쿠키 강제 차단/중첩 ancestor·성과 집계/정식 출시 게이트는 미검수다.

## 이전 기능 보강 — D02 AP 정확한 카드 버전 배치 승인 (2026-09-24)

AP 사업자 owner가 현재 공개 카드의 불변 release를 활성 매체 slot에 배치 요청하면 매체 owner가 카드 버전 ID와 문구 hash를 검토해 승인·거절·중지한다. 사업자 owner는 요청·승인 배치를 취소한다. 같은 release/slot 중복 요청은 기존 ID를 반환하고 재시도 key/body 충돌은 거부한다. AP 사업·매체 outbox에는 카드/배치 ID와 상태만 기록한다. 승인 기록은 캠페인 새 release나 도메인 만료로 지워지지 않으며 공개 API는 현재 지식·release·slot·DNS 조건을 다시 확인해 노출을 보류한다. 사업자·매체 화면과 AP 공개 `/placements/[id]`에서 정확한 상태를 확인할 수 있다.

선행 DB 테스트는 API 404로 red(exit 1), 구현 후 `pnpm test:spike:placements:agent` 1/1 exit 0이다. 권한, 중복/충돌, 버전·hash 변경, 검증 만료, 중지/취소/거절과 공개 404를 검사했다. D00/D01 회귀 각각 1/1, lint·typecheck·unit·AP API/웹 빌드·제품 import/DB 격리 exit 0. Chrome 320px 두 역할에서 카드 공개→매체 위치→배치 요청→승인→공개→취소와 404→200→404를 확인했고 가로 넘침·page error는 없었다. 합성 계정·조직은 정리했다. 처음 브라우저 검수는 닫힌 select option 대기 오류, 이후 긴 매체 origin의 320px 가로 넘침이 있었고 줄바꿈 수정 후 재실행 통과했다. 실제 외부 기사/상담 D03, 실매체 DNS/TLS, 정식 QA90~96/출시 게이트는 미검수다.

## 이전 기능 보강 — D01 AP 매체 조직·도메인·광고 위치 (2026-09-24)

AP 매체는 사업 조직과 별도 `publishers`/membership을 사용한다. owner가 HTTPS origin을 등록하고 `_ap-publisher.<host>` DNS TXT의 `ap-publisher-verification=<proof>`를 확인해야 article/sidebar 광고 위치를 활성화한다. 검증은 7일 후 만료되며 위치 조회의 `available`도 즉시 false다. owner/editor는 위치를 등록할 수 있고 owner만 도메인·위치 활성/중지를 관리한다. 매체 변경 사건은 AP 전용 publisher outbox에 기록하며 고객 원문은 없다. 매체 계정만으로 AP 사업 지식은 열리지 않는다. D01 구현 시점에는 카드 배치를 포함하지 않았고, 후속 D02에서 정확한 release 승인을 연결했다.

선행 `pnpm --filter @fieldai/agent-api exec tsx --test test/publishers.db.test.ts`는 라우트 404 red(exit 1), 구현 후 `pnpm test:spike:publishers:agent` 1/1 exit 0. 타 매체 404, 중복 origin 409, DNS 실패/성공(주입 검증기), 검증 만료, 위치 활성/중지, 중복 중지 사건 없음, 사업 조직 비공유를 확인했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome 320px에서 매체 조직→도메인→위치, 실제 DNS 기록 없는 `example.test` 확인 실패, mock DB 검증 상태 주입 후 UI 활성/중지, 가로 넘침 없음·page error 0건을 확인했다. 첫 브라우저 실행은 비동기 새로고침 완료 전에 버튼 상태를 읽어 실패했고 상태 대기로 고쳐 통과했다. 합성 계정/조직은 정리했다. 실제 매체 DNS/게재, 공식 OAuth client, 배치 승인, 정식 QA/출시 게이트는 미검수다.

## 이전 기능 보강 — D00 AP 홍보 카드 초안·공개 (2026-09-24)

AP 승인 지식의 상호·서비스명·설명을 고른 홍보 카드만 만들 수 있다. 카드 초안 revision, 사업자 owner의 명시 확인, 불변 공개 release와 공개/중지 상태를 AP DB에 분리해 저장한다. 공개 카드에는 `광고`를 표시하고 가격·자격·후기를 카드 자체에서 임의 생성하지 않는다. 승인 지식의 해당 상호·서비스 설명이 바뀌면 기존 카드 공개 API를 보류하며 최신 승인 정보로 초안을 갱신하고 새 카드 버전을 승인할 수 있다. 카드 공개는 외부 매체 배치 승인이 아니고 기본 AP 상담 위젯은 카드 없이 작동한다.

구현 전 카드 API 404로 `test/campaigns.db.test.ts` red(exit 1), 구현 후 `pnpm test:spike:campaigns:agent` 1/1 exit 0. 첫 green 시도는 합성 조직 정리 중 지식 release 참조 FK 순서 때문에 실패했고 후속 migration으로 지연 제약을 추가해 재실행 통과했다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome 320px에서 생성→공개→초안 수정 중 공개본 유지→중지(공개 404), 승인 지식 변경→최신 정보 초안 갱신→새 버전 공개(200), 가로 넘침 없음·page error 0건을 확인했다. 합성 계정·조직 2건을 정리했다. 브라우저 첫 실행은 AP_PROFILE 누락으로 인증 origin 403, 다음은 중복 텍스트 선택자로 실패했으며 프로필/선택자를 고쳐 재실행 통과했다. 정식 QA87~91, D01/D02 매체 배치, 운영 승인·실공급사는 미검수다.

## 이전 기능 보강 — A02/F05/F07 비회원 확인키 폐기·교체 (2026-09-24)

AP 문의·Field 문의·Field 예약 고객이 현재 확인키로 새 확인키를 등록하면 이전 키를 즉시 폐기한다. 고객 화면은 새 32바이트 무작위 키를 먼저 표시해 보관 확인을 받은 뒤 교체한다. 각 제품 DB의 원본 행을 잠그고 키 해시와 감사/멱등 원장을 한 트랜잭션에 기록한다. 동시 같은 요청·응답 분실 재시도는 원장 한 건으로 확인하며, 더 오래된 키 재사용·더 나중에 폐기된 요청의 성공 오표시는 거부한다. 새 키 원문은 API 응답·DB·outbox에 넣지 않는다. 원본 문의/예약·사진·처리 상태·발송 사건은 유지하고 접수 재시도에서 폐기 키가 다시 반환되지 않게 한다.

선행 `pnpm test:spike:inquiries:agent`, `pnpm test:spike:business:field`, `pnpm test:spike:bookings:field`는 각각 교체 경로 404의 의도한 red(exit 1), 구현 후 1/1·2/2·3/3 exit 0이었다. AP/Field 문의 사진 접근 회귀 `pnpm test:spike:attachments:agent`·`pnpm test:spike:attachments:field` 각 1/1, AP AI→사람 접수 `pnpm test:spike:consultations:agent` 1/1 통과. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 두 API/웹 빌드, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome에서 AP 문의의 첫 교체 응답을 브라우저에만 실패시킨 뒤 같은 요청으로 복구, Field 문의·예약 교체, 이전 키 거부·새 키 재열람, 새로고침 후 320px 넘침 없음·page error 0건을 확인하고 합성 계정·조직/실패 원장을 정리했다. 실제 프록시·운영 보존/복구·고객 키 분실 지원·일반 접수 남용·정식 QA19/G-A2/G-F2는 미검수다.

## 이전 기능 보강 — A02 AP 비회원 확인키 실패 제한 (2026-09-24)

AP 문의 원본·후속 대화·고객 사진 경로에서 같은 문의와 서버 확인 접속 주소의 확인키 오류가 15분 안에 5회 나면 15분간 429/`Retry-After`를 반환한다. AP DB의 실패 원장에는 확인키·IP 원문 대신 `AP_AUTH_SECRET`의 용도 분리 HMAC만 저장한다. 성공한 고객 접근은 실패 기록을 지우고 다른 문의·사업자 경로는 차단하지 않는다. 위조 `X-Forwarded-For`는 신뢰하지 않는다. 고객 화면은 차단 상태를 따로 안내하며 직접 접수·멱등 재시도 흐름은 유지한다. Field 코드/DB·제품 간 공개 계약은 변경하지 않았다.

선행 `pnpm test:spike:inquiries:agent`는 5회 실패 뒤 정상 키가 200인 의도한 red(exit 1)였고 구현 뒤 1/1 exit 0. 위조 헤더, 원본별 분리, 15분 만료 뒤 초기화·성공 뒤 원장 삭제, 사진·메시지 경로 누적을 같은 AP DB 테스트에서 확인했다. `pnpm test:spike:attachments:agent` 1/1, `pnpm test:spike:consultations:agent` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 로컬 AP PostgreSQL 17.11/mock API 4311·웹 3001의 Playwright Chrome 320px에서 429 안내, 넘침 없음, page error 0건을 확인했고 합성 계정·조직·실패 원장을 정리했다. API readiness와 웹 루트는 각각 HTTP 200. 실제 프록시의 공유 주소, 확인키 폐기/재발급, 일반 접수 rate limit 및 정식 QA19/G-A2는 남는다.

## 이전 기능 보강 — F05/F07 Field 비회원 확인키 실패 제한 (2026-09-24)

Field 문의·예약 고객 API에서 같은 원본과 접속 주소의 확인키 오류가 15분 안에 5회 나면 15분간 429와 `Retry-After`를 반환한다. 대상별 Field DB 원장에는 확인키나 IP 원문을 저장하지 않고 Field 비밀키로 만든 HMAC만 저장한다. 정상 확인키 접근은 실패 원장을 지운다. 위조한 `X-Forwarded-For`로 우회할 수 없도록 서버가 확인한 접속 주소만 사용한다. 문의·예약 화면은 차단 안내를 구분해 표시한다. 비회원 제출·재시도 경로와 AP 제품 코드는 변경하지 않았다.

선행 `pnpm test:spike:business:field`·`pnpm test:spike:bookings:field`는 5회 실패 후 정상 키가 200인 의도한 red(exit 1)였고, 구현 뒤 각각 2/2·3/3 exit 0이었다. 헤더 위조·15분 경과 뒤 실패 횟수 초기화 사례를 추가한 뒤에도 통과했다. 보호 대상의 사진 접근 회귀 `pnpm test:spike:attachments:field` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 로컬 Field PostgreSQL 17.11/mock API 4321·웹 3002의 Playwright Chrome 320px에서 문의·예약 각각 차단 안내, 넘침 없음, page error 0건을 확인했고 합성 계정·조직·실패 원장은 정리했다. 두 서비스 `/health/ready`·웹 루트는 HTTP 200이었다. 첫 브라우저 스크립트는 예약용 잘못된 키를 너무 짧게 만들어 401을 반환했으므로, 형식이 유효한 잘못된 키로 수정해 재실행했다. 일반 제출 rate limit·실제 프록시별 접속 주소 설정·확인키 폐기/재발급·정식 QA19/25/40·공급사/운영 게이트는 남는다.

## 이전 기능 보강 — F07 DST 전환 슬롯 (2026-09-24)

`America/New_York`처럼 DST가 있는 시간대에서 반복되는 01:00은 서로 다른 두 ISO instant로 생성하고, 사라지는 02:00은 생성하지 않는다. 서비스 소요와 영업 종료는 UTC 경과 시간으로 검사한다. 모호한 영업 시작은 첫 실제 순간, 종료는 마지막 순간을 사용하며 없는 경계는 다음 유효 분으로 이동한다. 신청 가능 기간은 24시간 덧셈이 아닌 현지 달력 날짜로 계산한다. 고객 시간표는 GMT offset을 보여 반복 01:00을 구분한다. 기존 휴무/자정 넘김/점유·완충 규칙은 같은 슬롯 검사에 적용한다. DB schema·제품 간 계약 변경 없음.

선행 `pnpm test:spike:bookings:field`는 두 번째 가을 01:00 누락으로 red(exit 1), 현지 기간 테스트는 봄 전환 뒤 기간 하루 초과로 red(exit 1)였다. 수정 뒤 3/3 exit 0. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports` exit 0. 로컬 Field PostgreSQL 17/mock API 4321·웹 3002의 Playwright Chrome에서 320px 시간표에 01:00 GMT-4와 GMT-5가 별도 표시되고 각 시간의 신청·사업자 확정이 둘 다 성공했으며 page error 0건이었다. 합성 계정·조직은 정리했다. 뉴욕 2026 봄/가을 전환에 대한 고정 테스트이며 전체 IANA 시간대·실서버 시계/운영 QA26/34 승인은 별도다.

## 이전 기능 보강 — F01/F07 기본 예약 방식 상속 (2026-09-24)

사업자는 카탈로그 초안에서 기본 예약 방식을 고르고 각 서비스에 기본값 상속, 희망 시간 고정, 시간표 고정을 지정한다. 새 서비스는 상속으로 시작한다. 초안은 `inherit` 선택을 유지하지만 승인 공개본의 서비스에는 실제 `request/slot` 방식만 저장한다. 기존 명시 서비스 방식과 이전 승인본·예약 snapshot은 기본값 변경으로 바뀌지 않는다. 기존 카탈로그에는 기본값 `request`를 보충하고 새 필드를 보내지 않는 구버전 편집 요청은 현재 기본값을 유지한다. 사이트 제작 화면은 승인된 기본값과 서비스별 실제 방식을 보여주며 자체 제작 AI가 서비스 설정을 수정하지 않는다. 카탈로그는 Field JSON 원장을 사용해 DB migration은 없다.

선행 `pnpm test:spike:business:field`에서 기본값 누락으로 red(exit 1)를 확인한 뒤 2/2 exit 0. 구버전 요청의 기본값 보존 테스트도 `request`로 되돌아가는 red(exit 1) 뒤 2/2 exit 0. `pnpm test:spike:bookings:field` 2/2, `pnpm test:spike:sites:field` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports` exit 0. 로컬 Field PostgreSQL 17/mock API 4321·웹 3002의 Playwright Chrome에서 상속/명시 초안 저장→승인→고객 폼 분기→상속 시간표 예약 snapshot, 320/390px 가로 넘침 없음·page error 0건을 확인하고 합성 계정·조직을 정리했다. 브라우저 스크립트의 부분 라벨 선택과 숨겨진 option 대기 방식 때문에 초기 실행은 실패했으며 선택자를 수정해 재실행 통과했다. 정식 QA25~34/77·DST·남용 방어·실알림/복구 검수는 남는다.

## 이전 기능 보강 — F08 Field 문의·예약 처리 알림 (2026-09-24)

Field 직접 문의·고객 추가 질문과 예약 요청·고객 수락·변경·취소 요청은 Field outbox와 같은 DB 트랜잭션에서 내부 처리 알림이 된다. 조직의 사업자/편집자가 최근 100건과 전체 미열람 수를 조회하고, 건별로 읽음 처리한 뒤 원본 문의 또는 예약을 연다. 내부 메모·수동 일정은 알림을 만들지 않는다. 사업자 답변과 고객에게 고지해야 할 예약 사건은 외부 발송 성공으로 처리하지 않고 `blocked_integration` 원장에만 남긴다. 고객·사업자 화면도 내부 기록과 외부 미발송을 구분해 표시한다. 원장은 전화·대화 본문·사진·확인키를 복제하지 않는다.

선행 `pnpm test:spike:business:field`는 알림 API 404 red(exit 1)였다. 구현 후 같은 명령 2/2, `pnpm test:spike:bookings:field` 2/2, `pnpm test:spike:attachments:field` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. 문구 수정 뒤 `pnpm lint`, `pnpm typecheck`, `pnpm build:web:field`도 exit 0. 로컬 Field PostgreSQL 17/mock API 4321·웹 3002에서 Chrome으로 문의·예약 알림 표시, 읽음 2→0, 해당 원본 열기, 사업자 답변 뒤 고객/사업자 양쪽의 외부 미발송 표시, 320/390px 넘침 없음·page error 0건을 확인했다. 정책 미설정 합성 조직의 예약 생성이 `policy_not_set`으로 거절된 첫 브라우저 스크립트는 정책을 생성한 뒤 다시 실행해 통과했다. 합성 계정·조직은 정리했다. 기존 Field outbox 중 알림 대상의 누락 0건·대상 불일치 0건을 SQL로 확인했다. Git 커밋은 없다. 정식 QA/독립/E2E/보안/실공급사·복구 검수는 미실행이다.

## 최신 기능 보강 — A02 AP 비공개 고객 문의 사진 (2026-09-24)

AP 자체 직접 문의와 AI 상담 후 사람 접수의 고객 메시지에 사진을 첨부한다. AP 사진은 Field 자산·DB와 분리된 mock 디렉터리 또는 AP 전용 S3 설정을 쓴다. 실제 이미지 형식을 검사하고 입력 8MiB·25M pixel, 출력 WebP 4MiB/2000px, EXIF 제거, 메시지당 5장으로 제한한다. 고객 확인키 또는 해당 AP 조직 사업자/편집자만 인증 GET으로 읽으며 저장 SHA-256이 맞지 않으면 제공하지 않는다. 같은 정규화 파일을 같은 메시지에 재첨부하면 자산 ID 하나로 복구한다. AI 질문은 사진 첨부 대상이 아니고 모델·outbox·매체 경로에 이미지 bytes를 넣지 않는다. 본문 저장 뒤 사진 실패는 본문을 보존하고 재첨부할 수 있게 표시한다.

선행 `pnpm --filter @fieldai/agent-api exec tsx --test test/inquiry-attachments.db.test.ts`는 업로드 경로 404 red(exit 1)였고, 수정 뒤 `pnpm test:spike:attachments:agent` 1/1 exit 0. `pnpm test:spike:consultations:agent`는 새 검수의 모델 호출 기대 개수를 잘못 적어 한 번 실패했고 실제 사업자 테스트까지 포함한 호출 2건으로 바로잡은 뒤 1/1 exit 0이었다. `pnpm test:spike:inquiries:agent` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome에서 직접 문의 본문/사진의 첫 201 응답 분실 후 각각 재시도, 확인키 고객·조직 사업자 사진 열람, 후속 질문 사진, 320/390px 넘침 없음·page error 0건 확인. 첫 브라우저 스크립트는 후속 질문이 추가한 사업자 알림까지 한 건이라고 잘못 기대해 수정 후 통과했다. 합성 계정·조직·파일은 정리했다. AI 인계 사진은 합성 모델 DB 테스트로 검수했으며 실모델/실 S3/HEIC 서버·보존/복구·정식 QA18/20/41/112는 미검수다.

## 이전 기능 보강 — F06 Field 사업자 내부 메모 (2026-09-24)

Field 문의 메시지에 `visibility`를 추가했다. 기존 고객/사업자 대화는 `customer`, 새 사업자 메모는 `internal`이며 고객 확인키 조회는 SQL에서 공개 메시지만 선택한다. 사업자/편집자는 자기 조직 문의 상세에 메모를 작성하고 확인한다. 내부 메모는 `not_applicable` 전달 상태로 저장되며 문의 상태와 outbox를 바꾸지 않는다. 문의 잠금과 메시지 재시도 키를 사용해 응답 분실·동시 제출을 한 메모 ID로 복구한다. 이전 사업자 답변의 재시도 해시는 호환을 유지한다. Field 사업자 화면은 메모·고객 답변 입력과 표시를 구분한다.

선행 `pnpm test:spike:business:field`는 메모 API 404 red(exit 1) 후 2/2 exit 0이었다. 같은 최신 코드에서 `pnpm test:spike:attachments:field` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome에서 사업자 메모 첫 201 응답 분실→재시도 200, 사업자만 메모 표시·고객 API/화면 비노출, 문의 상태 불변, 320/390px 가로 넘침 없음·page error 0건을 확인했다. 합성 계정·조직·사진 파일을 정리했다. 확인키 반복 추측·남용 방어, 새로고침 뒤 분실 응답 복구, 실알림과 정식 QA는 남아 있다.

## 이전 기능 보강 — F05/F06 Field 비공개 문의 사진 (2026-09-24)

고객은 첫 문의 또는 후속 대화에 사진을 선택할 수 있다. 본문 저장 뒤 사진을 별도 업로드하며 실패 시 본문을 보존하고 같은 파일을 재첨부할 수 있다. Field 문의 사진은 공개 사이트 사진과 분리된 mock 디렉터리 또는 별도 S3 설정을 쓴다. 입력은 실제 디코더로 검사하고 8MiB·25M pixel을 제한하며 방향 보정·최대 2000px 축소·EXIF 제거 WebP로 저장한다. 메시지당 5장, 같은 메시지의 같은 정규화 사진은 한 자산 ID만 돌려준다. 고객 확인키 또는 해당 조직 사업자/편집자 세션만 인증 GET을 통해 읽으며 손상된 객체는 제공하지 않는다. 문자/카카오 실발송이나 고객 번호 인증으로 오해하지 않는다.

선행 `pnpm test:spike:attachments:field`는 업로드 경로 404 red, 중복 재첨부가 201인 red를 각각 확인한 뒤 1/1 exit 0이었다. 같은 최신 코드에서 `pnpm test:spike:business:field` 2/2, `pnpm test:spike:sites:field` 2/2, `pnpm test:spike:bookings:field` 2/2, `pnpm test:spike:media:field` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`은 exit 0이었다. Playwright Chrome에서 본문 201 응답 분실→200 복구, 사진 201 응답 분실→200 동일 자산 복구, 고객·사업자 비공개 사진 열람, 후속 질문 사진과 답변, 320/390px 가로 넘침 없음·page error 0건을 확인했다. 합성 계정·조직·파일은 정리했다. 첫 320px 검사에서 파일 선택 입력의 기본 너비 때문에 386px로 넘쳤고 입력 폭을 제한한 뒤 같은 흐름을 재실행해 통과했다. 실 S3/HEIC 서버 codec·고객 사진 보존/정리/복구·정식 QA18/20/41/112/143은 미검수다.

## 이전 기능 보강 — F05/F06 Field 후속 메시지 재시도 복구 (2026-09-24)

Field 고객 추가 질문과 사업자 답변은 문의별 무작위 재시도 키와 작성자/본문 요청 해시를 메시지 원장에 선택적으로 저장한다. 확인키 또는 조직 권한을 검사한 다음 같은 제출은 기존 메시지 ID를 200으로 복구하고, 다른 내용/작성자는 409로 거부한다. 문의 행 잠금과 키 유일 제약 아래 메시지·상태·outbox를 Field DB 한 트랜잭션에 기록한다. 고객/사업자 웹은 같은 입력의 응답 분실 재시도에 키를 유지하고 기존 저장 여부를 분명히 표시한다. 외부 전달은 여전히 `pending`이다.

선행 `pnpm test:spike:business:field`는 고객 질문 병렬 제출이 201 두 건인 red(exit 1)를 확인한 뒤 2/2 green이었다. `pnpm test:spike:bookings:field` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(Field 웹 9/9·AP 웹 8/8), `pnpm build:field`, `pnpm build:web:field` exit 0. Playwright Chrome에서 Field 직접 접수·고객 추가 질문·사업자 답변의 첫 201 응답을 각 브라우저에만 실패시키고 재시도 200·총 메시지 3건을 확인했다. 고객 320px·사업자 390px 넘침 및 page error는 0건, 합성 계정/조직은 정리했다. 실알림·결과 미상 처리·새로고침 복구·정식 QA는 남아 있다.

## 이전 기능 보강 — F05 Field 단독 직접 문의 재시도 복구 (2026-09-24)

Field 비회원 직접 문의에 선택적 `idempotency-key`·`x-receipt-key`를 추가했다. 고객 웹은 한 제출 시도의 무작위 키 둘을 메모리에 유지한다. 응답 분실 뒤 같은 입력으로 다시 제출하면 Field DB의 조직별 키·요청 해시를 확인해 기존 문의 ID·확인키를 200으로 돌려준다. 다른 본문/확인키는 409이고, 기존 헤더 없는 API는 계속 동작한다. 같은 사건의 문의·원문·outbox는 한 건만 저장하며 실제 외부 발송 상태는 `pending`이다.

선행 `pnpm test:spike:business:field`는 동시 제출이 201 두 건인 red(exit 1) 후 2/2 green이었다. `pnpm test:spike:bookings:field` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(Field 웹 9/9·AP 웹 8/8), `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome 320px에서 첫 201 응답을 브라우저에만 실패시킨 뒤 재시도 200·동일 문의/확인키·원문 한 건을 확인했다. 가로 넘침과 page error는 0건이며 합성 계정/조직을 정리했다. 브라우저 테스트 첫 시도에서 Field 공개 페이지에 예약 폼 이름도 있어 선택자가 두 요소를 찾는 실패가 있었고, 문의 폼 범위를 지정해 재검수했다. 실외부 알림·후속 메시지 재시도·새로고침 복구·정식 QA는 미완료다.

## 이전 기능 보강 — A02/A03 후속 메시지·사업자 답변 재시도 복구 (2026-09-24)

고객 추가 질문과 사업자 답변/내부 메모는 문의별 무작위 재시도 키와 작성자·종류·내용 요청 해시를 AP 메시지 원장에 저장한다. 같은 제출은 같은 메시지 ID로 200 복구하고 다른 내용/종류는 409로 거부한다. 확인키와 사업자 조직 권한을 먼저 검사한다. 기존 키 없는 API 호출은 유지한다. 문의 행 잠금과 메시지 키 유일 제약으로 병렬 요청도 메시지·outbox·알림 한 건만 남긴다. 고객/사업자 웹은 응답이 없을 때 같은 입력과 키를 재사용하며 기존 저장 결과를 별도로 안내한다.

선행 `pnpm test:spike:inquiries:agent`는 병렬 추가 질문이 201 두 건인 red(exit 1)를 확인했고, migration/API 후 1/1 통과했다. `pnpm test:spike:consultations:agent` 1/1, `pnpm test:spike:deployments:agent` 1/1, `pnpm test:spike:agents:agent` 2/2, `pnpm test:spike:business:agent` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(AP 웹 8/8·Field 웹 9/9), `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation` exit 0. Playwright Chrome에서 고객 추가 질문과 사업자 답변 각각 첫 201 응답을 브라우저에만 실패시키고 다시 제출해 200/메시지 1건을 확인했다. 사업자 새 질문 알림 1건, 고객/사업자 320/390px 가로 넘침 없음, page error 0건이며 합성 계정/조직을 정리했다. 첫 브라우저 실행은 AP 서버를 `AP_PROFILE=mock` 없이 시작해 가입 origin 403이었고, mock 프로필로 재시작해 통과했다. 이 브라우저 검사는 로컬 mock이며 실외부 알림·정식 QA는 아니다.

## 이전 기능 보강 — A02 직접·AI 인계 접수 재시도 복구 (2026-09-24)

AP 비회원 직접 문의와 AI 대화의 사람 접수에 선택적 `idempotency-key`·`x-receipt-key`를 추가했다. 고객 화면은 한 제출 시도에 무작위 키 둘을 만들고 응답 분실 시 같은 본문·키로 재시도한다. AP DB는 조직별 키 해시와 정규화한 요청 해시를 유일하게 저장하고, 같은 요청이면 기존 대화 ID와 확인키를 200으로 복구한다. 다른 본문/확인키는 409로 거부한다. 키 없는 기존 API 호출은 유지한다. 재시도가 새 문의·outbox·알림을 만들지 않고 AI 대화의 사람 접수도 같은 원본 ID에 머문다.

선행 직접 문의 DB 테스트는 동시 제출 두 건이 모두 201이 되는 red였다. 수정 후 직접/AI 접수 DB 테스트 각 1/1, AI 인계 동시 제출도 201/200 한 건으로 통과했다. Playwright Chrome에서 직접 문의와 합성 AI 대화의 첫 201 응답을 의도적으로 끊고 같은 화면에서 재제출해 200·동일 대화/확인키·알림 1건을 확인했다. 확인키 글자 폭에 따라 320px 화면이 342px로 넘치는 경우를 발견해 CSS를 수정했고 이후 무작위 키 반복 브라우저 검사 3회에서 폭 320px·page error 0건이었다. 검수 계정/조직은 정리하고 일반 AP API를 복구했다. 새로고침 이후 키 유지, 후속 메시지/사업자 답변 멱등, rate limit·확인키 반복 추측 방어는 남는다.

## 이전 기능 보강 — A06 AP 내부 처리 알림과 외부 미연결 표시 (2026-09-24)

AP 직접 문의·사람 접수·고객 추가 질문을 원본 업무/outbox와 같은 트랜잭션에서 알림 사건으로 기록한다. 사업자/편집자는 자기 조직의 처리 알림을 열고 각 계정별 읽음 상태를 남긴다. 단순 AI 질문과 내부 메모는 알림을 만들지 않는다. 사업자 답변은 고객이 확인키로 열람할 수 있지만 카카오/문자 공급사가 없어 외부 알림은 `blocked_integration`이며 발송 성공으로 표시하지 않는다. 고객·사업자 원문/번호/확인키를 알림 payload에 복제하지 않는다. 이전 outbox 문의 사건 3건을 source message ID 없이 보충했고 누락 0건을 확인했다.

새 알림 API는 404 red 후 `pnpm test:spike:inquiries:agent` 1/1, `pnpm test:spike:consultations:agent` 1/1, `pnpm test:spike:deployments:agent` 1/1, `pnpm test:spike:agents:agent` 2/2, `pnpm test:spike:business:agent` 2/2 green이었다. `pnpm lint`, `pnpm typecheck`, `pnpm build:agent`, `pnpm build:web:agent` exit 0. Playwright Chrome 320px에서 비회원 접수→사업자 내부 알림 확인/읽음→사업자 답변→고객 확인키 열람과 외부 알림 미연결 표시, 가로 넘침 없음·page error 0건을 확인했다. 검수 계정/조직은 정리했다. 실공급사 발송/콜백·웹 푸시·대체발송·남용/비용/복구 및 정식 QA35~40은 미실행이다.

## 이전 기능 보강 — A05 소유 사이트 위젯 AI와 동일 대화 전환 (2026-09-24)

소유 origin의 iframe에서 일회용 nonce로 짧은 bearer 세션을 만들고, 승인 지식에 대한 익명 AI 질문·답변을 AP 원본 대화에 저장한다. iframe은 AP 제3자 쿠키를 사용하지 않는다. 일회용 handoff ticket을 AP 1차 도메인에서 교환하면 기존 대화 ID에 새 HttpOnly 상담 쿠키를 결합하고 iframe bearer의 접근을 끊는다. 연락처와 동의는 AP 1차 사람 문의 양식에서만 수집한다. 공급사 미설정이면 `blocked_integration`이고 AI 없이 바로 사람 문의로 전환할 수 있다. 공개 SDK는 같은 배포 ID에서 `data-mode=inline|floating`을 읽고, floating 버튼은 열림 상태를 표시하며 대화 iframe을 재사용한다.

`pnpm test:spike:deployments:agent`는 새 AI 경로 404 red와 일반 SDK 404 red 후 1/1 green, `pnpm test:spike:consultations:agent` 1/1, `pnpm lint`, `pnpm typecheck`, `pnpm build:agent`, `pnpm build:web:agent` exit 0. 검수 전용 합성 모델·합성 소유 origin을 사용한 Playwright Chrome에서 SDK iframe 질문→AI 답변→팝업 전환→같은 대화 ID의 사람 접수, floating 열기/닫기·재열기, 320px 가로 넘침 없음·page error 0건을 확인하고 검수 계정/조직/DB를 정리했다. 일반 AP 서버와 웹을 복구한 뒤 320px 관리 화면의 inline/floating 설치 코드와 가로 넘침 없음도 확인했다. 실소유 도메인, 실제 LLM, 제3자 쿠키 강제 차단·다중 ancestor, 사용량 남용·보존/복구 및 정식 QA는 미검수다.

## 이전 기능 보강 — A04/A05 AP 고객 AI 상담→동일 대화 사람 접수 (2026-09-24)

활성 AP 상담 링크의 1차 화면에서 익명 고객이 승인 지식에 근거한 AI 질문을 할 수 있다. AP 서버는 짧은 HttpOnly 상담 세션을 발급하고 고객 질문·검증한 AI 답변·고객 동의 후 사람 접수·사업자 답변을 하나의 conversation ID와 message sequence에 저장한다. 모델에는 연락처를 보내지 않고, 근거 ID·숫자·응답 구조·사용량을 검사한다. 고객 AI 질문은 사업자 알림을 만들지 않으며 최종 접수 시 한 번 outbox에 기록한다. 모델 응답 중 접수가 이뤄지면 revision과 automation_paused를 재확인해 AI 답변을 고객에게 보내지 않는다. 사업자 테스트 호출 한도와 고객 AI 호출 한도는 별도다.

선행 AP DB 테스트는 고객 상담 경로 404, 익명 대화가 사업자 문의함에 노출되는 실패, 잘못된 모델 사용량이 500이 되는 실패, 사업자 테스트가 고객 사용량 때문에 429가 되는 실패를 확인한 뒤 수정했다. `pnpm test:spike:consultations:agent` 1/1, 기존 AP 사업/문의/AI/배포 테스트 6개, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, AP 최소 환경 API readiness spike가 exit 0이었다. 로컬 Chrome 320px에서 모델 미설정 `blocked_integration` 표시 뒤 사람 문의 접수, 별도 검수 전용 합성 모델 API에서 AI 질문→같은 ID의 접수와 대화 조회를 확인했다. 검수 계정/DB는 삭제하고 합성 서버는 중지했다. 실제 공급사 키·실모델 품질·외부 iframe 안의 AI 대화·실알림·구독·정식 QA117은 미검수다.

## 최신 기능 보강 — F02/F03 사진이 있는 AI 배치 제안 (2026-09-24)

제작 AI 배치 제안은 초안의 사진·alt를 같은 페이지의 맞는 섹션에 이어 붙인다. AI가 해당 섹션을 없앤 경우 기존 사진 섹션을 보존하며, 페이지/섹션 상한 안에서 보존할 수 없으면 작업을 `media_layout_conflict`로 실패 처리하고 초안은 유지한다. 제안 데이터 자체에 사진이 들어가므로 화면 미리보기와 적용 결과가 일치한다. 선행 생성 테스트는 사진 ID가 제안에서 `undefined`가 되는 red였고, 수정 후 `pnpm test:spike:generation:field` 3/3·`pnpm test:spike:sites:field` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm build:field`, `pnpm build:web:field` exit 0. 이 검사는 합성 모델 응답이며 실제 공급사 응답은 검수하지 않았다. 모바일 단계 버튼의 줄바꿈도 고쳐 320px Chrome에서 업로드→alt→저장→공개·가로 넘침 없음·공개 화면 콘솔 오류 0건을 재검수했다.

## 최신 기능 보강 — F02/F04 Field 사이트 공개 사진 (2026-09-24)

Field 사이트 섹션에 사진 자산 ID와 필수 alt를 연결했다. 인증된 Field 사업자/편집자가 바이너리 파일을 업로드하면 실제 디코더 형식·8MiB/25M pixel 제한을 검사하고 방향 보정·최대 2000px 축소·EXIF 제거 WebP로 저장한다. Field DB는 자산 상태·조직·object key·SHA-256을 보유하고, 파일은 별도 Field 저장소 인터페이스에 둔다. `mock`은 Field 전용 비공개 디렉터리를 쓰며 `sandbox/live`는 Field 전용 S3 설정이 없으면 업로드를 `blocked_integration`으로 표시한다. 고객 문의 첨부/AP 파일은 이 저장소를 사용하지 않는다. 공개 승인 시 자산 참조를 릴리스와 함께 DB 트랜잭션에 고정한다. 현재 공개본이 참조한 이미지만 공개 API가 읽고, 초안에서 사진을 제거해도 기존 공개본의 파일은 즉시 삭제하지 않는다. 읽을 때 저장한 해시와 다르면 제공을 거부한다.

편집 화면은 서버 사진 보관함·업로드 중/완료/실패·재첨부·alt 입력·초안 저장·공개를 구분하고, 공개 화면은 승인 사진을 alt와 함께 표시한다. 선행 사이트 테스트는 업로드 경로 404 red, 보관함 404 red, 손상 객체가 200으로 제공되는 red를 확인했다. 수정 후 `pnpm test:spike:sites:field` 2/2, `pnpm test:spike:media:field` 1/1, Field 웹 사진 렌더 테스트 1/1, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`는 각 최종 실행에서 exit 0. 실제 Field 웹 프록시 HTTP 업로드→초안→공개→WebP 조회도 201/200/201/200이었다. Playwright Chrome 390→320px에서 사진 업로드·alt·저장·새로고침·공개 이미지 표시와 320px 가로 넘침 없음·공개 화면 콘솔 오류 0건을 확인했다. 테스트가 만든 계정·조직·DB 자산과 파일은 정리했다. 첫 320px 검수에서 사진 보관함 그리드가 420px까지 넘쳤고 CSS의 최소 폭을 제한한 뒤 재검수했다. 실 S3 자격증명/버킷·ACL·암호화 키·복구, HEIC decoder가 설치된 서버, 사진 정리 정책과 정식 QA56/74/124는 미검수다.

## 최신 기능 보강 — F07 예약 중복 제출 복구 (2026-09-24)

비회원 예약 화면은 한 제출 시도에 무작위 재시도 키와 확인키를 생성한다. 응답 분실 뒤 입력을 바꾸지 않고 다시 제출하면 같은 키를 보내고, Field DB의 조직별 유일 제약이 예약·이벤트·outbox 한 건만 남긴다. 같은 키를 다른 본문 또는 다른 확인키와 쓰면 409 `idempotency_conflict`로 거부한다. 키 없는 기존 API 클라이언트는 기존 동작을 유지한다. 확인키는 URL/outbox에 넣지 않으며 실제 응답을 받은 뒤 화면에 표시한다. 브라우저 새로고침을 가로지르는 재시도 키 보존은 아직 없다.

선행 `pnpm test:spike:bookings:field`는 새 동시 제출 테스트에서 실제 201 두 건으로 red였고, migration/API 후 2/2 green이다. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports` exit 0. 로컬 Field API/웹을 새 코드로 재시작하고 웹 3002 프록시를 통한 HTTP 예약 201→동일 키 재시도 200, 같은 ID·확인키·outbox 1건을 확인했다. 이 검사의 합성 예약은 삭제했다. 첫 typecheck는 테스트 배열 요소가 undefined일 수 있다는 오류로 실패했고 수정 후 통과했다. rate limit·확인키 추측 방어·실알림·DST/기본 방식 상속·정식 QA는 미검수다.

## 최신 기능 보강 — C02/F03 Field 전용 Valkey 큐와 worker (2026-09-24)

Field mock에 별도 Valkey 8.1.10 인스턴스/비밀값/AOF를 추가하고 `iovalkey` 0.4.0으로 작업 ID만 큐에 넣는다. API는 Field PG의 queued 원장을 commit한 뒤 enqueue하며 실패하면 `queue_unavailable`과 job ID를 돌려준다. 별도 worker는 큐 ID를 DB에서 queued→running으로 원자 claim해 모델 호출을 한 번만 시작한다. 주기적 PG→Valkey 재조정은 enqueue 누락을 복구한다. worker 재시작 시 오래된 running은 `result_unknown_after_restart` 실패로 남기고 자동 재호출하지 않는다. 작업에 기록된 모델과 worker 모델이 다르면 `model_changed`로 실패시킨다. 일반 Field 사이트/문의/예약의 readiness는 큐에 의존하지 않는다.

로컬 `pnpm test:spike:queue:field` 1/1, `pnpm test:spike:worker:field` 1/1, `pnpm test:spike:generation:field` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:spike:imports`를 실행해 exit 0을 확인했다. worker 통합 검수는 AP 환경변수 없이 별도 프로세스와 test 전용 합성 Responses 응답을 사용해 대기→제안→명시 적용, 재시작 후 오래된 running의 결과 미상 실패를 확인했다. Field Valkey를 실제 중지한 동안 API readiness와 웹은 200이었고 재기동 후 healthy로 복구했다. 같은 큐 클라이언트의 중지→enqueue 실패→복구 후 enqueue 성공을 수동 검수했다. 첫 Valkey 헬스체크는 CLI 인증 환경변수 차이로 unhealthy였고 수정했다. 첫 큐 클라이언트는 성공한 connect Promise를 계속 보관해 복구 후 enqueue가 실패했고 Promise를 연결 종료 뒤 비우도록 고쳐 재검수했다. 실제 모델 키/요금, 실제 서버 ACL/백업, AP 자체 큐와 정식 독립/보안 QA는 여전히 미검수다.

## 이전 기능 연결 — Field F03 제작 AI 제안 (2026-09-24)

Field 자체 사이트 제작용 모델 설정을 AP와 분리했다. 승인된 Field 카탈로그를 배치 제안 입력으로 사용하며, 모델은 템플릿·색·허용 페이지/섹션 종류만 고른다. 서버가 상호·소개·서비스를 승인 정보에서 넣어 숫자·자격·후기 문구를 모델이 만들어 넣지 않게 한다. 생성은 DB의 단일 활성 작업에 queued/running/proposed/failed/canceled/stale/applied_to_draft로 남기고, 사업자가 제안을 확인·적용해야 초안 revision이 증가한다. 생성 중 수동 편집이나 카탈로그 변경은 적용을 막으며 공개 버전은 그대로다. 공급사 미설정은 503 `blocked_integration`, 템플릿 직접 편집은 계속 사용 가능하다. 토큰 수는 유효하지 않은 모델 배치와 작업 중 취소에도 한 번 기록한다. 가격표를 임의 추정하지 않아 비용은 `unpriced`로 둔다.

선행 `test/site-generation.db.test.ts`의 404 red 이후 `pnpm test:spike:generation:field` 2/2, `pnpm test:spike:sites:field` 1/1, `pnpm test:spike:business:field` 2/2, `pnpm test:spike:bookings:field` 1/1, `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, `pnpm build:field`, `pnpm build:web:field`를 실행해 최종 exit 0을 확인했다. 추가 테스트는 잘못된 배치의 토큰 누락을 red로 확인한 뒤 보정해 green이었다. 로컬 Field API를 재시작해 `/health/ready` 200과 생성 작업 경로의 인증 없는 요청 401을 확인했다. Chrome에서 합성 사업자 계정→카탈로그 승인→사이트 초안→AI 설명 입력→공급사 설정 없음 안내를 확인하고 합성 계정·조직·사이트를 삭제했다. AP/Field API·웹은 HTTP 200이다. 실제 모델 호출·공급사 청구·Valkey 큐·정식 게이트는 미검수다. 첫 재시작에서 종료 훅 등록 순서 오류로 pool이 닫혀 503이 되었고 순서를 고쳐 readiness 200으로 재확인했다. Field business/booking spike를 병렬로 실행했을 때 migration advisory lock이 겹쳐 business 명령이 실패했고 순차 재실행으로 2/2 통과했다. 문서 마스터 재생성과 `check_package.py`는 exit 0이지만 후자는 문서만 검사한다.

## 이전 기능 보강 — Field F07 자정 영업·조건 변경 재동의 (2026-09-24)

Field 예약 정책에서 종료가 시작보다 이른 시간을 다음 날 종료로 취급한다. 다음 날짜의 이른 슬롯도 전날 영업에서 생성하며, 명시 휴무일에는 전날 밤에서 이어지는 슬롯을 감춘다. 확인키를 가진 고객은 신청 뒤 승인 카탈로그가 바뀌면 이전 서비스 스냅샷과 최신 서비스/가격/소요시간을 비교하고 다시 동의한다. 삭제된 서비스는 현재 승인 서비스 중 직접 대체 선택한다. 이전 시간 제안은 무효화하고 사업자가 새 조건으로 재확정하며, 이미 확정된 예약 스냅샷은 자동 변경하지 않는다.

선행 `pnpm test:spike:bookings:field`는 자정 정책 400 red와 재확인 API 404 red를 확인한 뒤 1/1 green이었다. 가격 변경 후 재동의, 삭제된 서비스의 대체/방식 전환, 제안 무효화, revision 경쟁과 자정 전후·다음 날짜·휴무를 DB 테스트에 포함했다. 최신 코드에서 `pnpm test:spike:business:field` 2/2, `pnpm test:spike:sites:field` 1/1, `pnpm typecheck`, `pnpm lint`, `pnpm build:field`, `pnpm build:web:field`, Field API 중지 후 `pnpm test:spike:independence:field`는 exit 0. Chrome에서 합성 고객의 기존 10,000원/30분과 새 15,000원/45분을 확인→동의·재제출→신청 가격/처리 기록 갱신을 검증하고 fixture를 삭제했다. DST 전환/다중 자원, 실알림/복구와 정식 QA25~34는 미실행이다. 첫 타입 검사·Field API 빌드가 nullable `start` 오류로 실패해 값을 좁힌 뒤 재실행 통과했다.

## 이전 기능 연결 — AP A05 상담 링크·소유 사이트 설치 (2026-09-24)

AP 조직/승인 AI·지식에 묶인 `link`와 `owned_embed` 배포를 추가했다. Owned embed는 DNS TXT 소유 증명과 정확한 https origin 뒤 활성화된다. 공개 SDK는 배포 ID만 쓰고 iframe은 허용 origin의 Referer와 `frame-ancestors`를 검사한다. iframe 질문 초안은 외부에서 연락처 패턴을 거부하며 단기 nonce→세션→1회 ticket을 거쳐 AP 1차 상담 화면의 HttpOnly cookie context로 전달한다. 문의 제출은 기존 비회원 동의 양식으로만 이뤄진다. 지식·AI 최신 승인 버전이 바뀌면 기존 배포는 공개 조회가 중단되고 재승인이 필요하다.

선행 API 404 red 이후 `pnpm test:spike:deployments:agent` 1/1을 확인했다. AP 전체 관련 DB/어댑터/spike 테스트 8/8, `pnpm typecheck`, `pnpm lint`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, 기존 AP API 중지 후 `pnpm test:spike:independence:agent`가 최신 코드에서 exit 0이었다. Chrome에서 사업자 상담 링크 발급·활성화→고객 비회원 문의 접수, 별도 origin 합성 사이트의 실제 SDK iframe→새 창 handoff→AP cookie context 200을 확인했다. 로컬 origin fixture는 도메인 증명 API를 우회해 DB에 합성 삽입한 **브라우저 테스트 전용** 데이터이며 검수 후 삭제했다. 실도메인 소유/배포·다중 ancestor·제3자 쿠키 차단·실모델 답변·정식 QA는 미검증이다.

## 이전 기능 연결 — AP A04 AI 설정·사업자 테스트 (2026-09-24)

AP 전용 `AgentDraft`와 `AgentRelease`를 승인 지식 버전에 묶고, 사업자만 질문을 시험하는 API·화면을 연결했다. Responses 어댑터는 명시 모델, JSON Schema, `store:false`, 도구 없음, 출력 토큰 상한을 사용한다. 서버는 답변 형식과 승인 근거 ID·숫자 근거를 확인하고 사용량·실패 상태를 `ai_runs`에 남긴다. 모델 키/모델이 없는 로컬 서버는 `blocked_integration` 503을 반환한다. 실제 고객 문의·알림에는 연결하지 않았다.

선행 API 404를 확인한 뒤 `pnpm test:spike:agents:agent` 2/2, `pnpm typecheck`, `pnpm lint`, `pnpm build:agent`, `pnpm build:web:agent`, `pnpm test:spike:business:agent` 2/2, `pnpm test:spike:inquiries:agent` 1/1, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, AP API 중지 후 `pnpm test:spike:independence:agent`를 실행해 모두 exit 0이었다. Chrome에서 새 로컬 AP 조직→지식 승인→AI 설정 저장·승인→시험 질문의 `blocked_integration` 표시를 확인했고 콘솔 출력은 없었다. 첫 브라우저 이동은 이전 404 캐시를 보여 쿼리 문자열로 새 경로를 열어 실제 페이지를 확인했다. 실제 공급사 호출, 의미적 사실성, 고객 E2E, 정식 QA/출시 게이트는 미검증이다.

## 이전 기능 연결 — Field F07 예약 (2026-09-24)

`field.booking_policies`, `reservations`, `occupancies`, `reservation_events`와 outbox를 Field DB에 추가했다. 고객은 승인 카탈로그에서 희망시간형 또는 시간표형 예약을 비회원으로 신청하고 확인키로 상태·이력을 조회한다. 사업자는 제안→고객 수락→최종 확정, 확정 예약 변경 시 기존 점유를 보존한 원자적 교체, 취소 승인, 수동 일정 차단/해제, 전화 예약 수동 등록을 처리한다. 전화 예약은 고객 동의나 자동 발송을 기록한 것으로 표시하지 않는다. 미확정 요청은 점유하지 않고, 확정·수동 일정은 같은 조직의 PostgreSQL `tstzrange` 배타 제약으로 충돌을 차단한다.

선행 `pnpm test:spike:bookings:field`는 예약 API 404로 실패했고, 구현 후 1/1 통과했다. 테스트는 두 요청의 같은 시간 신청, 서로 다른 서비스의 같은 자원, 동시 확정 1건만 성공, 제안/수락, 변경 교체 충돌 시 기존 점유 유지, 취소 후 점유 해제, 수동 예약, 휴무/정책 revision, 카탈로그 stale 거부와 처리 기록을 검사했다. `pnpm typecheck`, `pnpm lint`, `pnpm build:field`, `pnpm build:web:field`, `pnpm test:unit`, `pnpm test:spike:business:field` 2/2, `pnpm test:spike:sites:field` 1/1, `pnpm test:spike:imports`, `pnpm test:spike:db:isolation`, `pnpm test:spike:independence:field`도 최신 코드에서 exit 0으로 실행했다. Chrome에서 고객 신청→확인키 조회→사업자 제안→고객 수락→사업자 확정→고객 변경/취소 요청→사업자 취소 승인 및 고객 이력 조회를 확인했고 콘솔 출력은 없었다. 실알림은 발송하지 않고 outbox/화면에서 대기 상태로 구분한다. `/tmp/fieldai-report-venv/bin/python tools/build_report.py` exit 0 및 `tools/check_package.py`의 문서 패키지 검사 통과(46 task, 160 QA)는 서비스 QA와 별개다. Git commit 없음.

F07은 부분 구현이다. 일정 제안의 모든 예외·카탈로그 변경 후 중요 조건 재확인/새 동의·요청 rate limit·확인키 반복 방어·실알림·복구·정식 독립/보안/E2E 게이트가 남아 있다. 따라서 QA25~QA34 전체 통과나 출시 완료로 표시하지 않는다.

## 기능 연결 진행 — 2026-09-24

Field F02/F04 추가: `field.sites`·`site_drafts`·`site_releases`를 만들고 초안 수정/승인 카탈로그 결합/기본 slug 공개/디자인 초안 복구를 구현했다. `pnpm test:spike:sites:field`는 선행 API 404 red와 공개 카탈로그 stale 필드 red를 확인한 뒤 1/1 통과했다. Chrome에서 실제 사이트 초안 생성→Editorial 선택→두 번째 소개 페이지/섹션 편집→저장→공개→공개 페이지 이동 및 320px iframe 가로 넘침 없음 확인. 디자인 복구는 당시 가격을 되돌리지 않고 새 초안으로 가져온다. 공개 이후 카탈로그 변경 시 공개 API가 `stale=true`를 반환하고 공개 사이트는 가격·예약 조건 대신 재확인을 표시한다. 사진 업로드·자체 도메인·제작 AI는 아직 없다.

AP A02/A03 추가: `ap.inquiries`·`ap.inquiry_messages`에 지식 승인 버전을 바인딩하고 고객별 확인키/메시지 sequence를 저장한다. 사업자 내부 메모는 고객 조회 SQL에서 제외한다. 직접 문의는 AI 활성화 전부터 가능하며 가짜 AI 응답은 없다. 선행 `pnpm test:spike:inquiries:agent`가 404로 실패한 뒤 migration/API를 구현해 1/1 통과했다. Chrome에서 고객 접수→사업자 메모·답변→고객 확인키 재조회까지 확인했고 내부 메모는 고객 화면에 나타나지 않았다. AP 고객 알림도 아직 발송하지 않고 `pending`이다.

사용자가 화면 시각 검토를 기다리지 말고 기능을 끝까지 구현하도록 지시해 `docs/technical/PHASE_2_EXECUTION_PLAN.md`에 각 작업의 파일 범위·QA·명령을 먼저 기록했다. 기존 화면 검토본과 별도 `/workspace` 경로에 AP/Field 실제 DB 작업 화면을 연결했다. Field 고객 문의는 `/public/{organizationId}`와 `/inquiry/{inquiryId}`에서 수행한다. 현재 로컬 mock DB·API·웹은 동작하며 출시 환경은 아니다.

AP 테스트는 선행 red `404 != 401`을 확인한 뒤 migration/API를 구현해 2개 green으로 전환했다. Field 카탈로그 red와 직접 문의 red도 404를 확인한 뒤 2개 green으로 전환했다. 추가 회귀에서 AP UUID 오류가 500, 편집자 승인·PATCH 범위가 미구현으로 드러나 수정 후 재실행했다. Field 사업자 문의 상세도 선행 404 후 구현했다.

Chrome 실제 왕복: AP `가입→조직 생성→초안 저장→승인→새로고침→미승인 다음 초안`, Field `가입→조직 생성→서비스 시간표 방식·가격 저장→승인→고객 비회원 문의→확인키 열람→사업자 답변→고객 후속 질문`. Field 문자·카카오 알림은 발송하지 않았고 UI/API가 `pending`으로 표시했다. 두 제품의 로컬 mock 가입은 이메일 검증 공급사 없이 동작하되 `NODE_ENV=production`의 mock API 부팅은 차단한다. 검토본의 live 빌드 차단은 유지한다.

당시 기능 구현 후 실제 명령: `pnpm test:spike:business:agent` 2/2, `pnpm test:spike:business:field` 2/2, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm build:web:agent`, `pnpm build:web:field`, `pnpm test:spike:db:isolation`, `pnpm test:spike:imports`, `pnpm test:spike:independence:agent`, `pnpm test:spike:independence:field`는 각 실행 시 exit 0. `NODE_ENV=production`에서 AP/Field `mock` API를 시작한 명령은 의도대로 각각 exit 1. 이후 사이트와 예약의 부분 기능은 위 최신 기록에 반영했다. Git 저장소/commit은 없다. 실제 AI·실알림·결제·외부 연결·운영 배포가 없으므로 A/F task를 완료로 표시하지 않는다.

## 화면 우선 단계 — 2026-09-24

사용자 지시로 API 우선 2단계 계획을 화면 우선으로 수정했다. `TASKS.md`는 C02/C03 뒤 A/F 트랙이며 API 전 UI 목업을 허용한다. `docs/technical/PHASE_2_EXECUTION_PLAN.md`와 `docs/technical/PHASE_2_UI_REVIEW.md`가 새 순서와 검토 경로를 기록한다. 당시 화면은 `design_preview`였으며 이후 `/workspace`와 Field 고객/사이트/예약 경로에 위 부분 기능을 연결했다. 미리보기 경로의 고정 상태를 실서비스로 간주하지 않는다.

실제 실행: `pnpm install` exit 0, `pnpm build:web:agent` exit 0, `pnpm build:web:field` exit 0, `pnpm lint` exit 0, `pnpm typecheck` exit 0, `pnpm test:unit` exit 0, `pnpm test:spike:imports` exit 0. `APP_PROFILE=live pnpm build:web:agent`와 `APP_PROFILE=live pnpm build:web:field`는 설계 검토본 live 빌드 차단을 확인하여 각각 예상대로 exit 1이다. Chrome에서 AP·Field 홈, 사업자 시작, Field 디자인 선택의 라디오 변경, AP AI 설정·오류 상태, Field 320px 디자인 화면을 확인했다. 전체 화면·접근성·200% 확대·서버 sandbox 검수는 미실행이다. Git commit 없음.

`apps/agent-api/test/business-core.db.test.ts`의 선행 미실행 상태는 당시 기록이다. 위 기능 연결 단계에서 red→green을 실행했고 현재 AP 기능 테스트 2개가 통과한다.

### C03 2차 화면 검수

`docs/technical/PHASE_2_UI_REVIEW.md`에 화면별 변경과 검수 범위를 기록했다. 모바일 더보기에서 역할별 전체 경로에 접근하고, Field 편집 문구·색상은 검토본 안에서만 미리보기에 반영된다. 사진·페이지·섹션·저장, 예약 요청과 확정, AP/Field 접수는 실제 API가 없어 비활성이다. AP/Field 핵심 화면에 출처·승인·비회원 접근·두 예약 방식 상태를 분리했다.

실제 실행: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm build:web:agent`, `pnpm build:web:field` 최종 exit 0. AP UI 단위 7개·Field UI 단위 8개가 `test:unit`에 포함됐다. 52개 경로 HTTP 200/화면 ID 확인, AP 22개·Field 30개 320px `scrollWidth=320`·최소 표시 글자 14px 확인, 주요 화면 390/768/1440px 넘침 없음. 브라우저에서 Field 모바일 편집·미리보기 입력 유지, 색상 반영, 고객 예약 방식 전환, 키보드 Enter로 더보기 메뉴 열기를 확인했다. 처음 AP AI·고객 상담의 320px 넘침과 코드 타입 오류는 고친 후 해당 검사를 재실행했다. Git commit 없음.

미실행: 200% 확대·전체 화면의 키보드 순회·스크린리더, 서버 sandbox·실공급사·정식 E2E. C03은 사용자 화면 검토와 나머지 화면 상세화 및 실제 데이터 상태 연결 전까지 `in_progress`다.

## 2026-09-24 실제 실행 결과

로컬 mock, Git commit 없음. `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm test:spike:imports`, `pnpm test:spike:oauth:agent`, `pnpm test:spike:oauth:field`, `pnpm test:spike:oauth:issuers`, `pnpm test:spike:embed:agent`, `pnpm test:spike:conversation:agent`, `pnpm test:spike:db:field`, `pnpm test:spike:db:isolation` 실행 성공. Chrome에서 허용 외부 origin의 위젯 준비·세션 생성, AP 1차 도메인 handoff 화면 도착·새로고침, 거부 origin 차단을 확인했다. 각 제품의 상대 DB를 실제 중지한 기초 독립 검사도 성공했고 DB는 재시작했다. 검사 실패·수정·재실행은 `docs/technical/SPIKE_REPORT.md`에 기록했다.

`pnpm test:spike:phase1`을 다시 실행해 위 14개 부분 검사 모두 exit 0을 확인하고 `quality_checks/phase_1_execution.json`에 범위와 결과를 저장했다. 상대 DB 중지 검사는 이 묶음에 포함되지 않으며 앞선 개별 실행 결과로만 기록한다.

정식 DB/contract/independence/fault/e2e/security 검사와 공급사 실검수는 아직 통과하지 않았다. `test:spike:*` 성공을 릴리스 게이트로 사용하지 않는다.

## 현재 작업 범위

- 허용 파일: `docs/technical/`, `docs/adr/`, `DEVELOPMENT_STATUS.md`, `TASKS.md`, 신규 `apps/`, `infra/`, `examples/`, `tools/`, 루트 workspace 설정.
- 금지: 기존 문서/시안 제거, 기존 Docker 자산 변경, 외부 운영 자산의 복제·삭제, 실제 고객 발송·청구·운영 배포.
- 다음 단계: 사용자 지시에 따라 화면 시각 검토 대기 없이 F03의 실모델·worker 복구/비용 경계와 F07 남은 보호·복구, AP 고객 AI·알림, Field F08 실공급사/F09 및 정식 연결 기능을 이어간다. 목표 개발/검증 서버의 OS·컨테이너·프록시/TLS·DB·백업 구성은 sandbox 검수 전에 읽기 전용으로 대조한다. C01 실행 OpenAPI·consumer test와 C02 제품별 Valkey 큐·키·CI·복구 경계도 남아 있다. 정식 독립 검사는 전체 제품 범위를 구현한 후 연결한다.
- 이 파일의 상태는 실행 결과에 맞춰 갱신한다. 미구현 검사와 공급사 검수는 통과로 표시하지 않는다.
