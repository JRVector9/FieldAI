# D04 AP 배포 성과·개인정보 보호 집계 설계 — 2026-09-24

## 범위

`TASKS.md` D04, AP PRD 2.5/2.9, QA104~QA107, G-D2를 적용한다. AP의 배치로 시작된 상담과 고객 동의 후 연락처 제출만 AP DB 사건으로 집계한다. Field 예약 확정 사건이 아직 연결되지 않아 `booking_confirmed`는 `unsupported_unconnected`로, 매출·수금은 `not_measured`로 표시한다. 카드 프레임 조회는 봇·중복 노출을 구분할 신뢰 가능한 사건이 없으므로 노출/클릭 수치로 제시하지 않는다.

## 사건·권한

- `ap.distribution_events`에는 문의 ID, 배치 ID, `engagement_started`/`contact_submitted`, 서버 시각, `live`/`preview`/`test`/`bot`만 저장한다. 이름·전화·질문·사진·확인키를 복제하지 않는다. `(inquiry_id,event_type)` 유일 제약으로 중복 접수/재호출에 한 사건만 남긴다.
- 사건은 AP 문의 시작/제출 트랜잭션에서 기록한다. 첫 화면에서 AP 공개 미리보기로 시작한 배치 상담은 `preview`, 외부 iframe의 알려진 크롤러 UA는 `bot`, mock의 명시 테스트 헤더는 `test`; 그 외 검증된 배치 iframe은 `live`다. 기존 D03 문의는 출처를 신뢰해 분류할 수 없으므로 `unclassified`로 backfill하고 공개 집계에서 제외한다.
- 사업자는 AP membership owner/editor/viewer의 자기 조직 전체 배치 집계만, 매체는 자기 publisher membership의 전체 배치 집계만 읽는다. 비인증·다른 조직은 401/404다. 개별 배치, 사업자, 슬롯, 날짜 임의 필터와 원본 사건 조회 API는 제공하지 않는다.

## 개인정보 보호 출력

완료된 UTC 주(월요일 00:00~다음 월요일 00:00)만 최대 8개 제공한다. 진행 중인 주, 당일 누적, 임의 날짜 구간은 제공하지 않는다. 상담·접수 각각 `under_5`, `5-9`, `10-19`, `20-49`, `50-99`, `100+`의 동일한 구간만 공개한다. `under_5`는 0~4를 합쳐 표현한다. JSON·CSV에 같은 구간을 사용하며 합계·전환율·사업자별/배치별 필터는 두지 않는다. 응답은 no-store이고 CSV에 공식 예약/수금 수치를 넣지 않는다. 동일 주의 완료 후 지연 수정이 일어나면 공개 구간이 바뀔 수 있으므로 운영 보존/정정 정책과 정식 차분·복수 역할 공격 검수는 G-D2에서 별도로 수행한다.

## 구현·검사 순서

1. 기존 D03 DB 검수에 비인증·타 조직·매체 PII 차단, 5개 미만 억제, JSON/CSV 동일 구간, 미리보기/테스트/봇 제외, 중복 사건 1건, 예약·매출 미지원 기대값을 추가하고 404 red를 확인한다.
2. AP migration 000026, 사건 기록 및 집계 API, AP 사업자·매체 성과 화면을 연결한다. Field 코드·DB와 공개 기본 위젯 경로는 건드리지 않는다.
3. `pnpm test:spike:distribution:agent`, D02/A05 회귀, lint/typecheck/unit/AP 빌드, 320px 브라우저 검사를 순차 실행한다. 실매체·실 Field 확정 이벤트·정식 privacy 공격/출시 gate는 미검수로 남긴다.
