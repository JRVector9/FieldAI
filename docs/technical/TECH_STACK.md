# 기술 스택 기준안 — 2026-09-24

상태: **C01 기술 선택, 실행 검증 진행 중**. 제품 경계는 v3.0 명세를 따른다. 버전은 오늘 레지스트리/공식 문서에서 확인한 채택 기준이며 설치한 패키지는 잠금 파일로 재확인한다. 검증 전 선택을 운영 승인으로 표시하지 않는다.

| 영역 | 선택 기술·버전 | 이유·비교 대안 | 제약·검증 상태 |
|---|---|---|---|
| 런타임·workspace | Node.js 24 LTS, TypeScript 5.9.3, pnpm 10.33.4 workspace | 현재 Node 24.18.0·pnpm 10.33.4 설치. Node 26은 Current라 운영 기본에서 제외. TS 7은 채택 직전 호환성 검증 부담이 있다. | 실행 버전은 `.node-version`/`packageManager`/lockfile로 고정. 두 API·웹과 Field worker 로컬 빌드 통과; 운영 이미지/CI 검수 전. |
| 제품 웹 | Next.js 16.3.6 + React 19.3.0, 제품별 별도 앱 | Field 공개 사이트 SEO/SSR, AP 제품·고객 화면, 제품별 배포 가능. SPA만 쓰면 Field 공개 페이지 SSR 구현이 추가로 필요하다. | 역할별 검토 화면은 `design_preview`; 별도 `/workspace`와 Field 공개 사이트·문의·예약 일부는 실제 로컬 API/DB에 연결. `APP_PROFILE=live` 빌드는 아직 차단. Next self-host 프록시·캐시·다중 인스턴스 검증 전. |
| API | Fastify 5.12.5, 제품별 별도 프로세스 | 공개 위젯/연동 API의 명시적 네트워크 경계와 테스트 주입. Next 내부 서버 함수를 제품 간 계약으로 쓰지 않는다. | AP·Field 조직/주요 로컬 기능의 일부 API가 동작하며 정식 OpenAPI/외부 연동·운영 보안 검수 전. |
| 사업자 인증 | Better Auth 1.7.5 내장 PostgreSQL adapter(`pg` Pool), 제품별 인스턴스·DB·키·쿠키. 이메일 검증과 별도 Kakao OAuth 앱 | 이메일/카카오 지원, 조직 플러그인. Auth.js+별도 인가 서버보다 초기 구성이 작다. | AP/Field 합성 이메일 사용자의 로컬 인증 spike 성공. 실제 이메일 검증·Kakao·조직 격리 미검증. |
| 외부 OAuth 서버 | `@better-auth/oauth-provider` 1.7.5를 AP/Field 각각 별도 issuer로 구성 | 공식 plugin의 authorization code+PKCE, exact redirect, revocation, resource/audience 기능을 채택. Ory Hydra는 대안이나 제품별 추가 서비스·DB·login/consent UI가 필요하다. | 각 issuer의 로컬 code+PKCE/동의/opaque token/introspection/revoke 및 실제 HTTP 교차 token 거부 성공. AP 원본 공개 읽기/위임 사람 답변과 Field 승인 사실 읽기만 조직·actor 범위 부분 검수; 양방향 실제 연결/나머지 scope·운영 심사 미검증. |
| 데이터·마이그레이션 | PostgreSQL 17.11, `pg` 8.23.0, `node-pg-migrate` 9.0.0, 명시적 SQL/파라미터 쿼리 | 제품별 DB와 별도 migration. 예약 GiST exclusion 같은 DB 제약을 SQL로 명확히 소유한다. 초기 도메인에 ORM 생성 계층을 필수로 추가하지 않는다. | 실제 두 DB 자격증명 격리와 Field 예약 동시성 spike 성공. 운영 백업 미검증. |
| 작업·이벤트 | 제품별 PostgreSQL outbox+inbox, Valkey 기반 queue. Field mock은 Valkey 8.1.10 + `iovalkey` 0.4.0 | 제품별 queue 소비자·자격증명을 분리한다. 업무 원본과 outbox는 각 제품 PostgreSQL 트랜잭션에 저장한다. Field 제작 작업은 PG 상태가 원본이고 Valkey에는 UUID만 둔다. | `pg-boss` 선택은 ADR 0002로 철회. Field 별도 worker의 합성 재시작·중복/누락 enqueue 로컬 검수만 완료; AP 큐·실서버 ACL/복구·알림 outbox 전달은 미검증. |
| 실시간 | HTTP 메시지 POST + SSE(cursor/sequence 재연결), 서버 검증 후 고객 공개 | WebSocket 상시 세션보다 재연결·프록시 운영이 단순. AI 초안 토큰은 내부에서만 모으고 근거·가격·권한 확인 후 완성 답변을 원자 저장·SSE 발행. | AP mock의 멱등 POST·SSE live/replay·사람 인계 후 AI commit 억제 spike 성공. 실제 상담 권한·LLM·다중 인스턴스·프록시 검증 전. |
| AI | OpenAI Responses API에 AP와 Field가 **각각 다른 키·원장·fetch 어댑터**로 호출 | 구조화 출력과 서버 통제 도구 호출. 범용 에이전트 프레임워크·벡터 DB는 초기 구조화 지식에 필수 아님. | 명시 모델·공급사 키 부재로 실제 응답 검수는 `blocked_integration`; 합성 응답은 테스트 fixture에만. 실비용·처리 위치·계약/복구 미검수. |
| 외부 설치 | 공개 JS loader + AP origin iframe + browser `postMessage` + AP DB 세션 | 일반 외부 사이트와 Field가 동일 설치 계약을 사용한다. 브라우저 CSP `frame-ancestors`와 exact origin/referrer 검사를 함께 사용한다. | `mock` 전용 AP API를 별도 origin Chrome에서 설치·세션 생성 및 AP 1차 도메인 handoff 화면 도착까지 검증. HTTP `Referer`는 비브라우저 클라이언트가 위조할 수 있으므로 전체 남용 방어로 간주하지 않는다. Field 설치·실제 고객 접수/상담 UI 미검증. |
| 객체 저장·이미지 변환 | Field 사이트 사진: `sharp` 0.35.4, `@aws-sdk/client-s3` 3.1139.0, Field 전용 S3 bucket/key. 로컬 mock은 Field 전용 비공개 파일 디렉터리. AP/비공개 고객 첨부는 별도 정책 | 사이트 원본은 방향 보정/EXIF 제거 WebP로 정규화하고 Field DB에 자산·공개 릴리스 참조를 기록한다. S3 API 어댑터를 두되 localStorage나 공유 AP 파일 경로를 운영 원장으로 쓰지 않는다. | 로컬 파일 저장/서버 재시작·Field 웹 사진 공개만 검증. 실 S3 공급사/버킷/IAM·암호화 키·백업·HEIC codec·QA124는 미검증이며 미설정 시 `blocked_integration`. |
| 관측·배포 | 제품별 Docker 이미지/compose, 앞단 TLS 프록시, 구조화 로그·OpenTelemetry 계획 | AP-only/Field-only 빌드·배포. 프록시와 제품 health는 상대 서비스에 의존하지 않음. | 실제 배포 플랫폼·도메인·TLS·RPO/RTO 증빙 전. |

채택 패키지의 라이선스와 공급사 약관은 출시 전 다시 검수한다. Drizzle는 현재 구현에 사용하지 않는다. 의존성 보안 감사도 별도 게이트다.

공식 확인 출처: [Node 릴리스](https://nodejs.org/en/about/previous-releases), [PostgreSQL 지원 버전](https://www.postgresql.org/support/versioning/), [Fastify v5](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/), [Next 자체 호스팅](https://nextjs.org/docs/app/guides/self-hosting), [Better Auth Kakao](https://better-auth.com/docs/authentication/kakao), [Better Auth OAuth Provider](https://better-auth.com/docs/plugins/oauth-provider), [Better Auth Fastify](https://better-auth.com/docs/integrations/fastify), [node-pg-migrate](https://salsita.github.io/node-pg-migrate/), [Sharp 이미지 출력/메타데이터](https://sharp.pixelplumbing.com/api-output/), [Sharp libheif 보안 패치](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c), [AWS SDK S3 예제](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html).

참고 프로젝트: [fastify/fastify-postgres](https://github.com/fastify/fastify-postgres)의 연결 관리 패턴, [ory/hydra-login-consent-node](https://github.com/ory/hydra-login-consent-node)의 인가 동의 분리. 코드를 복사하거나 특정 참고 프로젝트가 요구사항을 충족한다고 가정하지 않는다.
