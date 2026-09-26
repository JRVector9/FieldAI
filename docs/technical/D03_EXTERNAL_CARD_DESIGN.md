# D03 외부 기사 카드와 AP 안전 접수 설계 — 2026-09-24

## 경계와 선행

`TASKS.md` D03, AP PRD 2.5~2.6, QA97~103·QA118을 적용한다. 매체는 자체 검증된 HTTPS origin의 승인 slot에 정확한 배치 release를 설치한다. AP 원본 대화·고객 연락처·사진·확인키는 매체 문서/스크립트/postMessage로 전달하지 않는다. AP와 Field는 직접 연결하지 않는다.

## 동작

- 매체 owner가 승인된 배치의 설치 코드를 요청한다. AP는 현재 release·지식·slot·DNS와 최신 승인 AI 설정을 확인하고 배치 ID에 고정된 `placement_embed` 공개 배포 ID를 발급한다. 설정이 없으면 성공 코드 대신 명시적 차단 상태를 보인다. 동일 배치 재요청은 같은 공개 ID다.
- 설치 스크립트는 AP origin iframe을 넣는다. iframe은 정확한 parent origin, source, 공개 ID와 nonce를 검증한 뒤 AP 세션을 발급한다. AI 질문은 AP DB에만 저장한다. 모델 공급사 부재는 안내하고 사람 문의 전환은 유지한다.
- 전환은 기존 AP handoff의 짧은 1회 ticket을 사용한다. 연락처/사진/확인키·질문 원문은 URL, parent postMessage, 매체 DOM에 실지 않는다. AP 첫 화면에서 질문 초안·희망 조건·승인 서비스가 유지되며 고객이 별도 동의 후 제출한다. AI 대화가 없어도 AP 안에서 placement에 묶인 동일 대화 원본을 만든다.
- 공개 배포 조회·질문·handoff·접수는 매번 D02 배치 공개 조건을 재확인한다. 배치 취소/중지·slot 중지·DNS 만료·새 카드 release 후 새 업무는 거부한다. 기존 고객 원본과 확인키 후속 접근은 보존한다.
- 원본 문의의 placement ID는 AP 서버가 세션·배포에서 기록한다. 고객 요청 body의 campaign/placement ID는 귀속에 사용하지 않는다. 매체 API/DOM에는 고객 원본이 없다. D04는 이 ID를 비식별 집계에만 쓴다.
- 배치 대화 시작은 조직의 24시간 건수 제한 `AP_PLACEMENT_ENGAGEMENT_DAILY_LIMIT`을 확인한다. 로컬 mock 기본값은 100이며 sandbox/live에서는 명시 설정이 없으면 시작을 거부한다. AI 응답 한도와 외부 알림 공급사 게이트는 별도로 남는다.

## 검수·남은 게이트

AP DB에서 다른 매체 설치 거부, 공개 조건 철회, 재시도/1회 handoff, 위조 출처, 문의 귀속을 검수한다. 별도 origin Chrome에서 카드→AP AI 또는 차단 안내→사람 접수→사업자 문의함과 고객 확인키까지 확인한다. 실제 제휴 도메인·제3자 쿠키 강제 차단 브라우저·실모델/알림·성과 집계는 별도 출시 증빙이다.
