# ADR 0003 — 제품별 배포 산출물(이미지·compose·edge·CI)

- 날짜: 2026-10-03
- 상태: 채택 기준안. 운영 서버·레지스트리·실제 TLS 미검수
- 적용: B01/B02(독립 배포), C02, `docs/04_SECURITY_OPERATIONS_RELEASE.md` 5.1·5.7, ADR 0001·0002

## 결정

1. **제품별 이미지.** AP와 Field는 각자 `infra/<product>/Dockerfile.api`·`Dockerfile.web`를 가진다. 기반은 `node:24-bookworm-slim`, pnpm은 corepack이 루트 `packageManager`(pnpm 10.33.4)를 읽어 고정한다. `pnpm fetch`(lockfile만)→`pnpm install --frozen-lockfile --offline --filter <루트, 제품 앱>`→빌드→`pnpm deploy --prod`로 운영 의존성만 담는다. 빌드 단계에도 상대 제품의 소스·매니페스트를 복사하지 않는다. 빌드 문맥은 허용 목록 `.dockerignore`로 제한해 `infra/*/.env*`, mock 저널·미디어, 문서가 들어가지 않는다.
2. **API 이미지 하나로 API·worker 실행.** 기본 명령은 `node dist/server.js`이고 worker는 같은 이미지에 `command`만 바꾼다. 이미지에는 `NODE_ENV=production`이 고정되어 `*_PROFILE=live`가 아니면 앱이 부팅을 거부한다.
3. **migration 전용 대상.** `Dockerfile.api --target migrate`는 `tools/run-migrations.mjs`, 자기 제품 migration SQL, `node-pg-migrate`의 lockfile 해석 의존성만 담는다(루트 devDependency 전체를 넣으면 1GB 이상). 운영 API 이미지에는 migration 도구를 넣지 않는다.
4. **제품별 live compose.** `infra/<product>/compose.live.yaml`은 자기 PostgreSQL 17(Field는 Valkey 8.1 추가), 1회성 `migrate`, `api`(`/health/ready` healthcheck), `web`, worker별 서비스를 가진다. 순서는 db(healthy)→migrate(성공)→api(healthy)→web·worker. 자격증명이 없으면 부팅을 거부하는 worker(AP/Field retention, Field site-ai·ap-event)는 compose profile로 분리해 준비된 뒤 켠다. 서명 저널은 named volume, 사진은 live에서 S3 호환 저장소만 쓰므로 미디어 볼륨은 두지 않는다. web 컨테이너에는 API 비밀값을 주지 않는다.
5. **edge는 Caddy.** 자동 TLS(ACME)와 짧은 설정 때문에 Caddy를 고른다(`infra/edge/Caddyfile.example`). 각 제품 api/web은 호스트 127.0.0.1에만 노출하고, Caddy가 기본 동작으로 X-Forwarded-For를 실제 접속 IP로 다시 쓴다. Next rewrite는 받은 XFF를 그대로 API로 넘기며(`??=`), API는 `*_TRUST_PROXY`(기본: compose 고정 서브넷)만 신뢰한다. Field 테넌트 `*.<FIELD_SITE_BASE_DOMAIN>`은 DNS-01 와일드카드 인증서가 필요해 DNS 공급사 모듈을 포함한 Caddy 빌드가 필요하다.
6. **CI 범위.** `.github/workflows/ci.yml`은 lint·typecheck·unit, AP 전용 DB job(`test:db:agent`·AP 빌드), Field 전용 DB·Valkey job(`test:db:field`·Field 빌드), 두 DB가 있는 `test:contracts`, 이미지 빌드(push 없음)를 실행한다. E2E·보안·독립성·장애 주입 검사는 Playwright와 mock 전체 스택이 필요해 CI에서 실행하지 않는다.

## 비교

- 두 제품을 하나의 compose/edge 설정에 묶으면 파일은 줄지만 한 제품 배포·장애·비밀값이 다른 제품에 번진다. 제품별 compose는 서비스가 많아지지만 B01/B02를 실행 단위로 보장한다.
- Traefik은 Docker label 기반 자동 구성이 강점이지만 두 제품 compose가 같은 프록시 네트워크·label 규칙을 공유하게 된다. nginx는 인증서 갱신을 별도로 운영해야 한다.
- Next `output: "standalone"`은 이미지를 크게 줄이지만 현재 `next.config.ts`에 설정이 없어(앱 소스 변경 범위 밖) 일반 `next start` 이미지로 만든다.

## 제약·미검수

- 실제 도메인·TLS·DNS-01, 레지스트리 push·서명, 운영 서버 ACL·백업은 검수하지 않았다.
- live OAuth 수명주기 baseline을 만드는 CLI(`oauth-lifecycle-cli`)는 현재 mock 전용이다. live에서 공개 OAuth 연결 제공은 이 절차가 생길 때까지 `blocked_integration`이다.
- 사업자 자체 도메인 on-demand TLS는 Caddy `ask` 형식(`?domain=`) 허용 endpoint가 없어 구성하지 않았다.
- `better-auth`의 선택 peer 해석으로 API 이미지에 `next`(약 290MB)가 포함된다. lockfile/peer 규칙 변경이 필요하며 이 ADR 범위 밖이다.
- 이 ADR은 출시 게이트(G-A*, G-F*) 통과나 공급사 승인이 아니다.

## 되돌림

이미지·compose·Caddy·CI 파일은 앱 소스와 독립이라 삭제·교체로 되돌릴 수 있다. 운영 DB 볼륨·저널 볼륨은 compose `down -v`로 지우지 않는다(저널 키 분실 시 기존 저널을 읽을 수 없음). 다른 edge나 오케스트레이터로 바꿀 때도 제품별 분리·127.0.0.1 노출·XFF 재작성·`*_TRUST_PROXY` 대역 일치 조건을 유지한다.
