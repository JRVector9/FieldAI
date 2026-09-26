# 2단계 화면 검토본 — 2차 검수

2026-09-26 AP/Field 사업자 키보드 부분 검수: 원본 `reference/field_ui_prototype_v3.html`의 320px `owner/today`를 Chromium으로 다시 열어 하단 메뉴 구조를 확인했다. 실제 제품별 신규 조직 화면에서 Tab으로 긴 사업 정보 폼을 이동하면 Field 첫 입력의 하단 687px, AP `사업 소개` 입력의 하단 691px이 654px 하단 메뉴 뒤에 가려졌다. 모바일 작업실 스크롤 영역에 100px 초점 여유를 주고, 새 mock **2358**에서 두 제품의 320/390px Tab 초점·하단 메뉴 Enter 이동을 각각 확인했다. 이 검사는 사업자 초기 폼과 메뉴 경로이며 전체 역할 키보드·스크린리더·실 브라우저 200% 확대·사용자 최종 시각 인수는 아직 아니다.

2026-09-26 기준 HTML 재확인: `reference/field_ui_prototype_v3.html` 자체를 Chromium에서 `FieldPrototype.seedDemo()`와 `owner/today`로 열어 `/tmp/field-reference-today-{1440,320}.png`를 새로 저장하고, 실제 Field 업무 320px 캡처 `/tmp/field-today-task-320.png`를 확인했다. 같은 날짜의 `/tmp/field-services-{prototype,current-1440}.png`, `/tmp/field-booking-{reference,actual}-1440.png`도 나란히 열어 서비스 카드·고객 예약 폼을 대조했다. 기본 밝은 회색 배경/흰 카드/파란 행동/모바일 하단 메뉴와 예약 2열 폼·요약은 참고 시안의 구조를 따른다. 시안 상단의 통합 역할 전환과 Field의 `외부 배포` 수치는 문서상 독립 제품 경계에 맞춰 운영 화면에 복제하지 않는다. 실제 Field의 네 번째 오늘 카드는 홈페이지 공개 상태이고 AP가 배포를 소유한다. 전체 시각·동선 동일성은 사용자가 최종 확인할 예정이며 현재 C03 완료 주장 근거는 아니다.

2026-09-26 AP 연결·FAQ 화면 대조: 실제 AP/Field 별도 계정의 양방향 연결 뒤 AP owner가 Field 승인 사실을 검토하고 FAQ 1건을 지식 공개본에 선택하는 흐름을 320px 브라우저로 확인했다. 1440px 시각 대조에서 시작 카드가 긴 검토 카드 높이까지 늘어나고 모바일 작업 버튼이 44px보다 낮아, 연결 화면을 단일 세로 카드 구조와 44px 버튼으로 정리했다. 최종 `/tmp/field-ap-faq-{320,1440}.png`를 열어 카드/FAQ 문답/줄바꿈을 확인했고 320px 가로 넘침·pageerror는 0이었다. 사용자 시각·동선 최종 인수는 이후다.

2026-09-26 Field FAQ 화면 대조: 시안 v3의 `승인 정보·FAQ`는 Field 사업자가 입력한 문답을 공개 승인 뒤 사이트 고객 질문 섹션과 연결한다. 실제 320px 사업자 작업실에서 FAQ 입력→저장·승인→사이트의 질문 섹션 공개→고객 문답 표시를 확인했고, `/tmp/field-faq-320.png`와 `/tmp/field-faq-1440.png`를 열어 문답 카드·줄바꿈/여백을 확인했다. 320px 문서 가로 넘침 0. 사이트 공개본은 승인 당시의 문답을 유지한다. AP는 별도 Field 출처 검토 후 FAQ를 선택해야 AI 근거가 된다. 사용자 시각·동선과 AP 연결 UI 실브라우저 최종 인수는 이후다.

2026-09-26 Field 오늘 업무 필터 대조: 원본 시안 `owner/today`의 `모두/답변 필요/예약 요청` 세 탭을 실제 Field 직접 문의·AP 전달·예약 원장 항목에 연결했다. 문의만 있을 때와 예약이 접수된 뒤의 유형별 항목 가시성을 320px 브라우저에서 확인했고, 예약 탭 캡처 `/tmp/field-today-filter-320.png`에서 카드 내부 줄바꿈·가로 넘침 0을 확인했다. 실제 업무 상세는 기존 Field/AP 외부 요청 경로를 재사용한다. 사용자의 시각·동선/최종 인수는 이후다.

2026-09-26 Field 오늘 일정 대조: 원본 시안 `owner/today`의 세 번째 집계는 전체 확정 예약이 아니라 `오늘 일정`, 오른쪽 카드는 오늘 시간표와 직접 추가다. 실제 화면을 Field 주간 달력 원장의 확정 예약·전화 예약·수동 일정으로 연결해 320px에서 오늘 수동 일정 1건/삭제 후 0건·미래 확정 예약 오늘 0건을 확인했다. 직접 추가는 실제 Field 수동 일정 dialog, 예약 항목은 기존 상세로 이동한다. 달력 503은 확인 불가/재시도이며 320px 카드 캡처 `/tmp/field-today-schedule-320.png`에서 가로 넘침 0. 사용자의 시각·동선/최종 인수는 이후다.

2026-09-26 Field 홈페이지 공개 상태 대조: 원본 시안 `owner/today`의 `내 사이트 · 공개 중`은 실제 사이트 공개본을 뜻한다. 이전 실제 화면은 사업 정보만 승인해도 홈페이지 카드를 `공개`로 표시했다. 320px 실제 브라우저에서 승인만 한 상태는 `초안`/사이트 링크 없음, 사이트 공개 뒤는 `공개`/실제 공개 사이트 주소, 공개 조회 503은 `확인 불가`/재시도로 표시하도록 수정했다. 오늘·AI·사이트 카드와 승인/서비스 버전의 서로 다른 원장을 구분하며 기존 카드 배치·모바일 메뉴를 유지한다. Field 전체 실제 업무 브라우저 최종 1/1, 사용자 시각·동선/최종 인수는 이후다.

2026-09-26 Field 오늘 오류 상태 추가 점검: 내부 알림 원장 조회만 실패했을 때 문의·예약 숫자는 정상 조회값을 유지하고, 오늘 화면에 알림 실패와 별도 재조회 버튼을 표시한다. 320px 브라우저에서 503→200 복구와 가로 넘침 0을 확인했다. 실제 카카오/문자/푸시 발송 및 사용자 최종 화면 검수는 이후다.

2026-09-26 오늘 화면 동선 보강: 실제 AP/Field 사업자 작업실을 열린 상태로 둔 뒤 별도 고객이 문의를 접수했을 때, 오늘 메뉴를 다시 선택하면 해당 제품 원장과 알림을 재조회해 새 고객 항목을 보여준다. 두 제품 320px 전체 사업자→고객 브라우저 검사에서 재조회 전 0건 red→수정 뒤 고객 이름/상세 이동 green. 장기 대기 자동 갱신·사용자 최종 동선 확인은 별도다.

2026-09-26 모바일 오늘 업무 추가 점검: AP/Field 실제 고객 문의가 있는 320px 화면에서 시안의 `지금 확인할 일`처럼 고객·서비스·유입 출처를 보여주고 상세로 열도록 연결했다. 두 제품에서 처음에는 긴 고객/서비스 제목이 줄임표로 가려지는 것을 브라우저 검사와 캡처로 확인했고, 제목을 줄바꿈해 전체를 읽을 수 있게 했다. 최종 두 제품 업무 흐름/문서 가로 넘침 검사 통과. 사용자 디자인·동선 최종 확인, 전체 키보드/스크린리더/네이티브 200% 확대는 아직이다.

2026-09-26 Field 오늘 화면 대조: 원본 `reference/field_ui_prototype_v3.html#owner/today`의 데모 상태를 열어 1440px 시안과 실제 Field 사업자 오늘 화면을 캡처 비교했다. 네 집계 카드·2열 업무/AI 카드의 구조는 유사하다. 시안의 실제 확인 필요 고객 항목 대신 운영 화면이 알림 제목만 나열하던 차이를 고쳐, 직접 문의·AP 전달 요청·직접 예약의 실제 확인 필요 항목 최대 6건과 기존 상세 이동을 연결했다. 320px 실제 문의 1건 화면에서 카드·메뉴 가로 넘침 0, 고객 이름/서비스·상세 이동 브라우저 검사 통과. 시안의 외부 배포는 AP 제품 소유이므로 Field의 네 번째 카드는 홈페이지 공개 상태다. 사용자 시각/동선 검토와 전체 접근성/정식 인수는 아직이다.

2026-09-26 C03 기능 화면 보강: 실제 AP/Field 사업자 화면의 선택 입력이 브라우저 기본 13.3px로 보이던 것을 공통 16px로, Field 고객 대화 보조 문구 13px을 14px로 수정했다. 새 mock 빌드에서 실제 사업자 주요 경로와 비저장 검토 경로 52개를 320/390px 및 CSS zoom 2 근사 조건으로 다시 검사했고, 표시 글자/텍스트 입력 크기·문서 가로 넘침·pageerror 위반은 0이었다. 이 결과는 실제 브라우저 확대 200%·스크린리더·전체 키보드·사용자 시각/동선 인수 검수는 아니다. 현행 실제 기능/API 연결 범위는 `TASKS.md`와 `DEVELOPMENT_STATUS.md`의 최신 기록을 따른다. 아래 2026-09-24 문단은 당시 비저장 검토본의 이력이다.

작성일: 2026-09-24. Task C03 / 디자인·Coordinator / `in_progress`.

2026-09-25 기능 진입 보강: 로컬 mock 제품 홈의 기본 `작업 시작`은 각 제품의 실제 `/workspace`로 이동한다. `APP_PROFILE=design_preview`로 실행하면 홈의 기본 `화면 둘러보기`는 `/preview/...` 비저장 시안으로 이동한다. 홈은 실행 프로필을 요청 시 확인하므로 같은 빌드에서 두 동작을 분리한다. 기존 2차 화면 검수 기록은 당시 시안 범위를 설명한다.

## 확인할 화면

로컬에서 `APP_PROFILE=design_preview pnpm --filter @fieldai/agent-web start`와 `APP_PROFILE=design_preview pnpm --filter @fieldai/field-web start`를 실행한다. 빌드가 없으면 먼저 `pnpm build:web:agent`, `pnpm build:web:field`를 실행한다.

| 제품 | 제품 홈 | 역할별 주요 화면 |
|---|---|---|
| AP | `http://localhost:3001` | 사업자 `/preview/owner/start`, 지식 `/preview/owner/knowledge`, AI `/preview/owner/ai`, 문의 `/preview/owner/inbox`, 설치 `/preview/owner/install`; 고객 `/preview/customer/chat`; 매체 `/preview/media/operations`; 관리자 `/preview/admin/operations` |
| Field | `http://localhost:3002` | 사업자 `/preview/owner/start`, 디자인 `/preview/owner/design`, 편집 `/preview/owner/editor`, 오늘 `/preview/owner/today`, 문의 `/preview/owner/inbox`, 예약 `/preview/owner/bookings`, 연동 `/preview/owner/integrations`; 고객 `/preview/customer/site`, 예약 `/preview/customer/booking`; 관리자 `/preview/admin/operations` |

상단의 역할 링크와 측면 메뉴로 나머지 경로를 탐색한다. 모바일에서는 하단 주요 메뉴의 **더보기**에서 해당 역할의 전체 경로에 접근한다. AP 22개·Field 30개 PRD 화면 ID를 `src/screens.ts`에 매핑했다. `?state=error`, `disconnected`, `permission`, `limit`, `stale`로 예시 상태를 확인한다. 이 상태는 실제 서버 결과가 아니다. 각 제품 홈은 별도 제품으로 이동하는 링크를 표시하며 검토본의 기본 주소는 localhost다. sandbox에서는 `NEXT_PUBLIC_AGENT_WEB_URL`과 `NEXT_PUBLIC_FIELD_WEB_URL`을 실제 주소로 설정해야 한다.

## 구현·검수 범위

- `reference/field_ui_prototype_v3.html`의 흰색·밝은 회색·파란색·시스템 폰트·여백을 기준으로 새 UI를 만들었다. 기존 시안의 통합 역할 전환·localStorage 영업 데이터는 운영 화면에 사용하지 않는다.
- Field 사이트 디자인 세 배치는 서로 다른 미리보기로 표시한다. AP AI 설정, 두 제품 문의함, Field 오늘·달력·연동, AP 설치·연동과 고객 화면은 실제 데이터 없는 상태를 명시한다. 저장·공개·예약·발송 버튼은 API가 없으면 비활성 이유를 표시한다.
- Field 편집에는 모바일 편집/미리보기 전환, 입력 문구·색상 즉시 반영, 사진·alt·소개 페이지·섹션 순서 조작 위치를 넣었다. 미디어·페이지·저장은 API가 없어 비활성으로 표시한다. Field 고객 예약에는 희망시간 제출형과 시간표 선택형을 따로 표시하며 어느 쪽도 실제 예약 요청·확정을 주장하지 않는다.
- AP 지식에는 직접 입력 초안·외부 정보 검토·승인 정보를 분리하고, AP 고객 접수와 Field 비회원 직접 문의에는 번호만으로 원문을 열 수 없고 새 브라우저는 별도 확인키가 필요하다는 안내를 넣었다. Field 연락·예약 설정에는 직접 문의와 두 예약 방식, AP 연결 선택 여부를 분리했다. 매체·각 제품 관리자 및 여러 목록 화면은 업무별 열·빈 상태를 표시한다.
- `APP_PROFILE=live`에서는 두 웹 검토본의 빌드가 실패한다. 제품 기능 연결 전 운영 배포할 수 있는 화면이 아니다.
- 브라우저에서 Field 편집 문구·색상 선택→미리보기→편집 복귀 시 입력 유지, 예약 방식 전환 시 시간표 미연결 상태와 비활성 제출을 확인했다. 모바일 더보기를 키보드 Enter로 열어 Field 사업자 16개 경로를 확인했다. AP 22개·Field 30개 경로의 320px 문서 가로 넘침과 표시 글자 크기를 검사한 결과 모두 `scrollWidth=320`, 최소 14px였다. 390/768/1440px은 AP/Field 주요·보강 화면을 검사해 가로 넘침이 없었다. 전 경로를 각 폭에서 육안으로 하나씩 확인하거나 200% 확대·스크린리더로 검수한 것은 아니다.

## 기능 연결 전 남은 화면 작업

일부 화면은 아직 공통 템플릿 중심이다. 사용자 화면 검토 후 시안과의 시각 차이, 실제 입력 검증, 200% 확대·키보드 전체 경로·스크린리더, 초안/저장/승인/공개/전달/확정/발송 상태 문구를 마감한다. API·DB·권한 연결 뒤 서버 결과에 따라 상태를 다시 검수한다. C03은 계속 `in_progress`이며 A/F 기능 완료나 출시 승인이 아니다.

## 실제 실행 명령

`pnpm install`, `pnpm build:web:agent`, `pnpm build:web:field`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports`는 이번 로컬 환경에서 exit 0. `APP_PROFILE=live pnpm build:web:agent`와 `APP_PROFILE=live pnpm build:web:field`는 의도한 차단으로 exit 1. 초기 설치의 `@types/react@19.2.19` 부재와 lint가 `.next` 생성물을 읽은 실패를 각각 버전·ignore 수정 후 재실행했다. 브라우저 검수 범위는 위 항목에 한정된다.

2차 검수에서 `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:spike:imports`, `pnpm build:web:agent`, `pnpm build:web:field`를 다시 실행해 exit 0을 확인했다. UI 단위 테스트는 AP 7개, Field 8개가 포함됐다. 로컬 두 웹 서버의 52개 화면 경로가 모두 HTTP 200이며 각 ID를 반환함을 확인했다. 처음 `typecheck`는 테스트의 선택 화면 undefined 타입 때문에, 이후 Field 빌드는 색상 배열의 값 타입 때문에 실패했다. 각각 수정 후 재실행해 통과했다. 첫 320px 브라우저 검수에서 AP AI·고객 상담에 13px 넘침이 나와 특수 패널의 최소 너비를 조정하고 두 화면 및 전체 52개 경로를 재검사했다. 이 2차 검수에서 `APP_PROFILE=live` 차단은 다시 실행하지 않았으며 위 문단의 결과는 이전 검수 기록이다.
