# C01/C02 기술 검증 기록

작성일 2026-09-24. 테스트 데이터는 합성 데이터만 사용한다. 빈 fixture나 mock 응답을 실제 공급사·제품 종단간 검수로 대체하지 않는다.

| Spike | 요구/QA | 상태 | 증빙 |
|---|---|---|---|
| 독립 기초 서버·DB 권한 | B01~B04, QA123~124 | partial_pass | 두 DB·서버 기동, 교차 DB credential `28P01` 거부. 상대 DB를 중지하고 상대 환경값 없이 각 API readiness 성공. 전체 제품·worker·비밀값·배포 독립성은 미검증 |
| 별도 origin 외부 설치 | B05~B06, QA97~102, QA127~128 | partial_pass | AP mock 전용 loader/iframe을 일반 외부 사이트 `127.0.0.1:4381`에 실제 Chrome 설치. 버튼 클릭으로 AP 1차 도메인 `/embed/v1/received` 도착·새로고침 확인. `4382`는 `ORIGIN_DENIED`. DB nonce·ticket 단회 소비/만료·1차 cookie와 원 세션 바인딩 검사 성공. Field 설치·실대화·고객 접수/남용 방어는 남음 |
| code+PKCE·scope·audience·revoke | QA129~132 | partial_pass | AP/Field 각 issuer에서 합성 사용자/client의 code+S256+동의+resource scope+opaque token introspection+revoke 성공. 두 실제 HTTP issuer에서 상대 opaque token을 inactive로 거부. 조직/actor 동의·Kakao 미검증 |
| POST+SSE 재연결·사람 인계 | QA21, QA141, QA144 | partial_pass | AP mock 경로의 실제 PostgreSQL+HTTP에서 멱등 메시지 POST, 순번 SSE live/replay, Last-Event-ID 누락 복구, human handoff 후 낡은 AI commit 억제 성공. tenant/capability/actor 권한·LLM 어댑터·완성 대화 UI 미구현 |
| 예약 동시 확정 | QA25~34, QA122 | partial_pass | 실제 Field PostgreSQL에서 중복 확정 두 트랜잭션 중 하나만 성공, 점유·outbox 1건씩. HTTP/권한/변경/취소·두 예약 방식 미구현 |

## 실행 결과

2026-09-24 로컬 mock 환경, Git commit 없음. `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:agent`, `pnpm build:field`, `pnpm test:spike:imports`, `pnpm test:spike:oauth:agent`, `pnpm test:spike:oauth:field`, `pnpm test:spike:db:field`, `pnpm test:spike:db:isolation` 모두 실제 실행하여 exit 0을 확인했다. Field DB를 중지한 `pnpm test:spike:independence:agent`와 AP DB를 중지한 `pnpm test:spike:independence:field`도 각각 exit 0이며, 중지한 DB는 검사 종료 후 다시 건강 상태로 시작했다. Field auth 추가 후 Field-only 검사를 다시 성공시켰다.

`pnpm test:spike:oauth:issuers`도 실행 성공했다. 두 서버를 서로의 DB·키 없이 별도 포트에서 시작하고 실제 HTTP로 각 issuer의 토큰을 발급했다. 각자의 introspection은 active, 상대 토큰의 introspection은 inactive였다. 첫 실행에서는 Better Auth가 HTTP 요청에 302 대신 200 `redirect` JSON을 반환하여 테스트 기대가 실패했다. 실제 응답 흐름을 확인해 테스트가 그 JSON을 따라가도록 수정했고 재실행 성공했다. 이 검사는 현재 OAuth endpoint의 token 격리 증빙이며 업무 API의 조직·scope middleware 검사는 아니다.

초기 `pnpm test:spike:embed:agent`는 실제 AP PostgreSQL에 합성 설치를 만들고 exact `Referer` origin, CSP `frame-ancestors`, 일회용 nonce·handoff ticket을 검사하여 성공했다. 이어 `AP_PROFILE=mock` AP API(4311), 합성 외부 사이트(4381), 거부 사이트(4382)를 별도 로컬 서버로 실행했다. Chrome에서 4381 iframe의 `상담 준비 완료`를 확인하고 AP DB에 해당 설치 세션 1건을 조회했다. 4382 iframe은 `ORIGIN_DENIED`를 표시했다. 합성 설치 `spike-external-site`와 테스트 세션은 로컬 mock DB에 남아 있다.

이후 같은 1단계에서 first-party 브라우저 전환을 보강했다. AP iframe의 버튼이 단기 ticket을 발급받고 AP `/embed/v1/wait` 탭과 정확한 origin/source의 `postMessage`로 전달한다. 새 AP 탭이 자체 origin에서 ticket을 JSON POST로 단회 소비해 원 위젯 세션에 바인딩된 HttpOnly/SameSite=Lax cookie를 발급받는다. ticket·세션 비밀값은 URL query에 넣지 않는다. `pnpm test:spike:embed:agent`에서 구현 전 `/received` 404 실패를 확인했고, 구현 후 다른 origin의 POST 403, 허용 POST 303, cookie 없는 접근 401, 원 세션 바인딩, ticket 재사용·만료 410을 실제 DB로 검증했다. Chrome의 외부 사이트 4381에서 버튼 클릭→AP `127.0.0.1:4311/embed/v1/received`의 `대화 이어가기 준비 완료` 표시·새로고침 유지까지 확인했다. 임시 API·사이트 서버와 검증 탭은 종료했다. 받은 화면은 실제 대화/연락처 접수 기능이 없는 기술 검증용이며 정식 QA97~102 전체 통과가 아니다.

처음에는 ticket을 새 탭의 HTML form POST로 넘겼다. Chrome이 해당 새 탭 제출에 `Origin: null`을 보냈고 AP의 Origin 검사가 `ORIGIN_DENIED`로 거부했다. 검사를 완화하지 않고 AP 1차 탭이 같은 origin에서 직접 POST하도록 바꿔 브라우저 검증에 성공했다. 2026-09-24 10:18 KST의 `pnpm test:spike:phase1`은 14/14 부분 명령 exit 0이며 명령별 결과는 `quality_checks/phase_1_execution.json`에 있다.

`AP_PROFILE=mock NODE_ENV=production node --env-file=infra/agent/.env apps/agent-api/dist/server.js`는 예상대로 exit 1과 `mock profile is forbidden in production`을 반환했다. 전체 production 금지 상태의 CI·부팅 검사는 아직 구현되지 않았다.

`pnpm test:spike:conversation:agent`는 실제 AP PostgreSQL과 로컬 HTTP/SSE를 사용해 성공했다. 같은 idempotency key/본문은 동일 sequence를 돌려주고, 같은 key/다른 본문은 409였다. SSE 첫 연결은 seq 1을 받았고, 열린 연결에서 새 POST 후 seq 2를 받았으며, `Last-Event-ID: 2` 재접속은 누락된 인계 이벤트 seq 3만 재생했다. 인계로 conversation revision이 바뀐 후 오래된 revision의 AI commit은 409 `{suppressed:true}`였고 DB에는 AI 답변 이벤트가 없었다. 구현 전 테스트는 404로 실패한 뒤 구현 후 통과했다. 이 경로는 `AP_PROFILE=mock`일 때만 노출되는 spike이며 실제 고객 상담 권한·메시지 원본/보존·사용량·LLM 검증을 포함하지 않는다.

OAuth 테스트에서는 등록 client에 resource를 자동 부여할 것으로 기대했지만 `invalid_target`이 발생했다. 관리자가 client-resource 연결을 별도로 설정한 뒤 scope flow가 성공했다. public client introspection도 거부되어 confidential BFF client로 검증했다. 이는 실제 관리자 승인·조직 매핑 구현이 필요함을 드러낸다.

Field auth 추가 직후 독립 검사에서 Field 자식 환경에 자체 auth secret/base URL이 전달되지 않아 서버가 조기 종료했다. 검사 스크립트의 종료 대기 리스너도 늦게 등록되어 원래 원인을 숨기고 exit 13이 났다. 자체 Field 인증 설정을 전달하고 종료 promise를 프로세스 생성 직후 등록했다. 잘못된 base URL을 주입한 음성 검사에서는 이제 구체적 `ERR_INVALID_URL`과 exit 1을 반환한다.

정식 `test:db:*`, `test:contracts`, `test:independence:*`, `test:integration:faults`, `test:e2e:*`, `test:security`는 아직 구현되지 않아 스크립트가 명시적 실패로 종료한다. 부분 spike를 해당 정식 게이트 통과로 대체하지 않는다.

## 미확인 외부 조건

Kakao 앱·실메일·LLM·카카오/문자/푸시·PG·DNS/TLS·운영 객체 저장소의 자격증명/계약/승인이 없다. 해당 검수는 `blocked_integration`이며 로컬 spike가 성공해도 출시 게이트 G-A/F/I/L을 통과시키지 않는다.
