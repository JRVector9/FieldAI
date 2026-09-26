# D01 매체 조직·도메인·광고 위치 설계 — 2026-09-24

## 요구와 결정

`TASKS.md` D01, AP PRD 2.5, QA92/94/95를 적용한다. 매체 조직은 AP 사업 조직과 별개이고 AP 계정으로 로그인해도 사업 조직 membership을 받지 않는다. 등록한 도메인·광고 위치는 매체 조직 소유이며 다른 매체가 읽거나 승인할 수 없다. 도메인 소유가 확인되기 전에는 광고 위치를 활성화하지 않는다.

고려한 방식은 (1) AP 사업 조직에 매체 역할을 추가하거나 (2) AP DB에 매체 조직과 membership을 분리하는 것이다. (2)를 선택한다. 사업자의 카드 공개 권한과 매체의 위치/배치 승인 권한을 테이블·API에서 분리할 수 있고, 이후 D02의 버전별 배치 승인에 필요한 두 주체가 명확하다. 외부 앱 OAuth 등록은 A09 이후 별도 연결하며 이 AP 세션을 상대 제품 로그인으로 쓰지 않는다.

## 데이터·API

- `ap.publishers`: 매체 조직. `ap.publisher_memberships`: owner/editor/viewer. AP `user`는 인증 원본이지만 사업 조직 membership과 관계를 만들지 않는다.
- `ap.publisher_domains`: 정확한 HTTPS origin, DNS TXT 증명, 검증 시각·만료 시각. 동일 origin은 한 매체만 등록할 수 있다. 실제 DNS 값은 `_ap-publisher.<host>`의 `ap-publisher-verification=<proof>`다. 검증 결과는 7일 후 만료되며 재검증할 수 있다.
- `ap.publisher_slots`: 도메인에 소속된 광고 위치의 이름·형식(`article`/`sidebar`)·active/paused. 등록은 검증 전에도 가능하지만 활성화에는 현재 유효한 도메인 검증이 필요하다. 중지는 기존 배치 승인·거절 기록을 바꾸지 않는다.
- `ap.publisher_outbox`: 매체 원본 변경 사건을 매체 DB 트랜잭션에 기록한다. 대화 원문·고객 연락처는 넣지 않는다.
- AP 세션 `GET/POST /v1/publishers`, `GET/POST /v1/publishers/:id/domains`, `POST /v1/publishers/:id/domains/:domainId/verify`, `GET/POST /v1/publishers/:id/slots`, `POST /v1/publishers/:id/slots/:slotId/{activate,pause}`. AP 사업자 카드/문의 API에 매체 membership을 허용하지 않는다.

## 실패·복구와 검수

DNS가 없거나 다른 값이면 409이고 verified 시각을 적지 않는다. 다른 매체 ID/도메인/위치는 404로 숨긴다. 만료된 검증은 다시 검증해야 활성화할 수 있다. 중복 origin은 409로 거절한다. 이미 active/paused인 동일 상태 요청은 새 사건을 만들지 않는다. DB 테스트로 무권한·타 매체·검증 전/후·만료·중복·상태 사건을 확인하고, AP 웹 320px에서 조직→도메인→위치 흐름을 검사한다. D02 배치와 실매체 DNS/운영 승인 전 D01은 `in_progress`다.
