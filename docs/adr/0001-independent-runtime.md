# ADR 0001 — 독립 런타임과 초기 서버 선택

- 날짜: 2026-09-24
- 상태: 채택 기준안. 큐 선택은 ADR 0002로 변경
- 적용: B01~B12, QA121~QA124, QA127~QA128

## 결정

단일 pnpm workspace 안에 AP/Field별 웹·API·Worker·DB migration을 두되 프로세스와 자격증명을 분리한다. Node 24 LTS/TypeScript, Next 웹, Fastify API, PostgreSQL 17, 제품별 Better Auth + OAuth Provider를 기본으로 한다. 제품 사이에는 버전 고정 HTTP 계약만 사용한다. 초기 pg-boss 큐 선택은 ADR 0002에 따라 철회했다.

## 비교

- 한 Next 서버에 모든 제품 API를 합치면 시작 파일은 적지만 배포·세션·DB 권한 경계가 흐려진다.
- 제품별 Next+Fastify는 프로세스가 늘지만 공개 API/위젯과 SSR의 책임이 뚜렷하고 독립 빌드가 가능하다.
- 제품별 Keycloak/Ory Hydra는 성숙한 인가 대안이나 각각 별도 배포·DB·로그인/동의 UI의 운영 비용이 크다. Better Auth plugin의 기능은 실제 code/PKCE/revoke spike로 확인해야 한다.
- 큐 선택의 변경 이유와 후속 검증은 ADR 0002를 따른다. outbox와 queue의 재조정은 반드시 검증한다.

## 제약·되돌림

Better Auth의 조직·위임 토큰 범위가 계약을 충족하지 못하면 해당 인가 선택을 철회하고 Ory Hydra 등 검증된 전용 서버로 변경한다. 이 ADR은 공급사 승인이나 출시 승인이 아니다. 계약 변경은 consumer 테스트를 먼저 추가한다.
