# FieldAI 비앱 영역 종합 감사 (84af59a → 13bcd31)

- 범위: contracts/, docs/, TASKS.md, DEVELOPMENT_STATUS.md, README.md, infra/, .github/workflows/ci.yml, .dockerignore, pnpm-workspace.yaml, tools/, 루트 package.json
- 저장소 파일은 수정하지 않았다(`git status` clean).
- 임시로 만든 것은 모두 지웠다: 컨테이너·네트워크 `audit-*`, 이미지 `fieldai-audit-*:audit`. 실행 중이던 mock 스택(`fieldai-*-mock-*`)은 건드리지 않았다.
- 직접 실행한 검사:
  - 이미지 6개 빌드
  - 임시 PG17·Valkey에서 migrate 실행, live API와 모든 worker 기동, live 웹 기동
  - `docker compose config`
  - `actionlint`
  - `pnpm test:unit`·`lint`·`typecheck`
  - 계약 정적 테스트
- 영역 2·5·6은 병렬 하위 감사로 조사했고, 그중 일부를 직접 재확인했다.

---

## High

### H1. CI의 `test:db:agent`·`test:db:field`는 지금 상태로는 반드시 실패한다
- DB 테스트 6개 파일이 고정된 mock 컨테이너 이름으로 `docker exec … pg_dump/pg_restore`를 실행한다.
  - AP:
    - `apps/agent-api/test/oauth-lifecycle.db.test.ts:127,150`
    - `apps/agent-api/test/revocation-restore.db.test.ts:63,128`
    - `apps/agent-api/test/retention-purge.db.test.ts:70,105`
    - 대상 컨테이너는 `fieldai-agent-mock-db-1`
  - Field:
    - `apps/field-api/test/oauth-lifecycle.db.test.ts:173,182,211,234`
    - `apps/field-api/test/retention-purge.db.test.ts:77,165`
    - `apps/field-api/test/revocation-restore.db.test.ts:78,129`
    - 대상 컨테이너는 `fieldai-field-mock-db-1`
- CI(`.github/workflows/ci.yml:79-89, 112-122`)는 PostgreSQL을 GitHub `services:`로 띄운다.
  - 이 방식에서는 컨테이너 이름이 자동으로 정해지므로 `docker exec`가 "No such container"로 실패한다.
  - `run-db-suite.mjs:252,285`가 실패를 모아 non-zero로 종료하므로 두 job 모두 red가 된다.
- 이 문제가 드러나지 않은 이유: `main`이 origin보다 56커밋 앞서 있어 Actions가 한 번도 돌지 않았다. `01_SUMMARY.md:179`에도 "GitHub Actions 실제 실행은 미검증"이라고 적혀 있다.
- 최소 수정: agent·field·contracts job에서 `services:`를 지운다. 대신 env를 쓴 뒤 로컬과 같은 compose로 DB를 띄운다.

  ```
  docker compose --project-name fieldai-agent-mock --env-file infra/agent/.env -f infra/agent/compose.mock.yaml up -d --wait
  ```

  - 이렇게 하면 컨테이너 이름이 `fieldai-agent-mock-db-1`이 된다. Field도 같은 방식이다.
  - Field compose에는 Valkey도 들어 있으므로 수동 `docker run` 단계(`ci.yml:126-134`)도 지울 수 있다.

### H2. live 기본 compose에서는 계정·조직 삭제, 사진 실제 삭제, outbox·웹훅 정리가 영원히 실행되지 않는다
- 아래 작업은 모두 `retention-purge-worker` 안에서만 호출된다.
  - 조직·계정 삭제 실행 `runOrganizationDeletionOnce`
  - 사이트 사진 2단계 삭제 `runSiteAssetDeletionOnce`
  - 인증 메일 outbox 익명화·삭제
  - Toss 웹훅 inbox 30일 정리
  - 삭제 비밀번호 시도 창 정리
  - ACK된 Field 사건 정리
  - 근거: `apps/agent-api/src/retention-purge-worker.ts:34-46`, `apps/field-api/src/retention-purge-worker.ts:43-56`
- 이 worker는 비공개 문의 사진 S3(`*_INQUIRY_S3_*`)가 없으면 부팅을 거부한다(`apps/agent-api/src/retention-purge-worker.ts:17-18`, `apps/field-api/src/retention-purge-worker.ts:19-20`).
- compose에서는 `profiles: [retention]`로 opt-in이다(`infra/agent/compose.live.yaml:148-151`, `infra/field/compose.live.yaml:190-193`).
- 실측: 예시 env로 띄우면 API와 기본 worker는 정상이고 retention worker만 exit 1로 끝난다.
- 결과적으로 S3를 연결하기 전에도 다음 일이 생긴다.
  - 사용자가 계정·조직 삭제를 요청하면 화면에는 14일 유예 후 삭제로 보이지만 실행 주체가 없다.
  - "삭제된" 사이트 사진이 사이트 사진 S3에 계속 남는다.
  - 인증 메일 수신 주소(PII)가 outbox에 남는다.
- 이 의존 관계를 적은 문서가 없다. 확인한 곳: `.env.live.example`, README.md:144, ADR 0003:12, docs/04.
- 최소 수정, 둘 중 하나를 고른다.
  - (a) 미디어 저장소가 필요 없는 단계만 묶은 worker(예: `lifecycle-cleanup-worker`)를 기본 서비스로 분리한다.
  - (b) retention worker가 미디어 저장소 없이도 기동하고, 미디어 단계만 `blocked_integration`으로 건너뛰게 한다.
- 함께 고칠 것:
  - 두 `.env.live.example`의 `*_INQUIRY_S3_*` 주석에 "비면 계정·조직 삭제와 정리 작업이 실행되지 않음"을 적는다.
  - 결정 목록에 "삭제 UI를 열기 전 retention profile 필수"를 남긴다.

---

## Medium

### M1. 새로 생긴 제품 간 흐름을 두 실서버 사이에서 검사하는 경로가 없고, 소비자 계약 테스트도 계약 묶음에서 빠졌다
- 대상 흐름:
  - AP→Field customer-decisions
  - AP→Field 서명 webhook(`/integrations/v1/webhooks/agent`, v2)
  - Field §4.12 `external-requests/{id}`
- AP 웹은 `apps/agent-web/src/agent-field-action.tsx:213,225`에서 이 경로를 호출한다. 그런데 `tools/spikes/ap-field-connection-http.test.mjs`는 `proposal.respond` scope만 단언한다(:385, :566). `field-action-browser.py`에는 수락 단계가 없다.
- 유일한 검사는 `apps/agent-api/test/field-customer-decisions.db.test.ts`(Field 스텁 서버 사용)다. 이 파일은 다음 두 곳에서 빠져 있다.
  - `package.json`의 `test:contracts`
  - `tools/run-integration-faults.mjs:60`
- 같은 이유로 양쪽 `revocation-restore.db.test.ts`(v2 해제 서명), AP `integrator-public-write.db.test.ts`, Field `ap-public-installation.db.test.ts`도 계약 묶음 밖에 있다.
- `test:db:*`가 전부 돌리므로 CI에서 아예 빠지지는 않는다. 다만 AGENTS §3의 "계약 PR → consumer test" 단계만 따로 돌리면 이 회귀를 잡지 못한다.
- 최소 수정:
  - 위 파일들을 `test:contracts`와 faults 목록에 추가한다.
  - `ap-field-connection-http.test.mjs`에 다음 단계를 넣는다: Field 대안 시간 제안 → AP GET proposalRevision → POST accept 202 → 같은 키 재전송 멱등 → worker 전달 뒤 Field 예약 반영 → 오래된 revision 409.

### M2. AGENTS §5 명령 15개 중 6개가 CI에 없고, e2e 초안도 그대로는 돌지 않는다
- CI가 실행하는 것: lint, typecheck, test:unit, test:db:agent, test:db:field, test:contracts, build:agent, build:field.
- CI에 없는 것: `test:independence:agent`, `test:independence:field`, `test:integration:faults`, `test:e2e:agent`, `test:e2e:field`, `test:e2e:distribution`, `test:security`.
- `ci.yml:9-11`과 ADR 0003:14가 대는 이유는 "Playwright와 mock 전체 스택 필요"다.
  - 독립성 검사도 `agent-owner-flow-http.test.mjs:62`, `field-owner-flow-http.test.mjs:26`에서 Python 브라우저를 부르므로 이 이유는 사실이다.
- 하지만 AGENTS §5는 "실패가 CI non-zero로 전파되어야 한다"고 요구한다.
- 주석 처리된 e2e 초안(`ci.yml:228-245`)의 문제:
  - `pnpm mock:run` 기동 단계가 없다.
  - Python 경로 변수(`AP_BROWSER_PYTHON`·`FIELD_*_PYTHON`) 전달이 일부만 있다.
- 최소 수정: Playwright venv와 `mock:run` 백그라운드 기동, readiness 대기를 넣은 단일 e2e job을 둔다. 바로 못 하면 docs/04 G 게이트에 "CI 미포함 6개 명령: 수동 증거 필수"를 명시한다.

### M3. `tools/spike-independence.mjs`가 HEAD에서 두 제품 모두 실패한다
- 원인은 자식 env(:25-32)에 `${upper}_PROFILE`이 없다는 것이다.
- agent:
  - 기준 이후 바뀐 :50은 `integrations:{email:'mock'}`을 기대한다.
  - 하지만 profile이 없으므로 `blocked_integration`이 돌아온다. 이번 변경이 만든 회귀다.
- field: origin 검사로 부팅 자체가 거부된다. 기존부터 있던 문제다.
- 최소 수정: 자식 env에 `` [`${upper}_PROFILE`]: 'mock' `` 한 줄을 추가한다.
- 공식 `test:independence:*`(`run-independence.mjs`)는 영향이 없다.

### M4. 브라우저 단계가 조용히 skip되고, 기본 Python 경로가 없다
- `ap-field-connection-http.test.mjs`는 `FIELD_*_BROWSER_PYTHON`이 있을 때만 브라우저 단계를 실행한다(:320, :424-525, :542, :664, :780, :844, :1006).
  - `run-integration-faults.mjs:8,68`은 이 값을 넘기지 않는다. 그래서 브라우저 단계가 빠진 채 pass로 보고된다(AGENTS §5 위반).
  - `FIELD_SAME_PAGE_BROWSER_PYTHON`은 어떤 실행기도 넘기지 않는다. 그래서 `agent-field-same-page-browser.py`는 한 번도 실행되지 않는다.
- 기본 경로 `/tmp/fieldai-ui-venv/bin/python`이 없다.
  - `run-e2e.mjs:88-91`과 `run-security.mjs:55-57`은 즉시 exit 1로 끝난다.
  - README.md:125,127은 여전히 이 경로를 안내한다.
- 최소 수정:
  - 실행기가 Python 경로를 SAME_PAGE에도 넘긴다.
  - spike는 env가 없으면 `t.skip('…')`으로 표시한다.
  - README에 venv·Playwright 설치 절차를 추가한다.

### M5. 신규 사용자 흐름 대부분에 브라우저·HTTP 검사가 없다
아래는 DB·unit 검사만 있고 실서버 HTTP나 브라우저 검사가 0건인 흐름이다.

| 흐름 | spike |
|---|---|
| 이메일 확인 `/verify-email`, 비밀번호 찾기·재설정 | 없음 |
| 관리자 MFA `/admin/mfa` | 없음 |
| Kakao 로그인, 연결 화면 Kakao→2FA 연속성, `/v1/auth/providers` | 없음 |
| 계정·조직 삭제(재인증·조직 선택), 운영자 resume | 없음 |
| 사이트 사진 2단계 삭제 | 없음 |
| TLS ask `/v1/public/site-hosts/allow`, `/.well-known/field-site-health` | 없음 |
| customer decisions, §4.12 조회, Field webhook inbox | 없음 |
| human_active take-over/release | 없음 |
| Toss webhook | 없음 |
| `/terms`·`/privacy` | 없음(이번 감사에서 live 이미지 200만 확인) |
| trial 정책 | `subscription-http.test.mjs`에 있으나 실행기 밖 |
| notification-route | 있음: `ap-field-connection-http.test.mjs:1154-1197` |

- 이메일·MFA·Kakao는 mock에서 꺼지거나 금지된다(`auth.ts:47`, `admin-auth.ts:18`, `kakao-provider.ts:15-17`). 따라서 이 세 흐름은 설계상 mock E2E로 검증할 수 없다는 점도 함께 적어 둔다.
- 최소 spike 추가안:
  1. `ap-field-connection-http.test.mjs`에 M1의 결정 단계를 넣고, `field-action-browser.py`에 320px 수락 단계를 넣는다.
  2. 새 `tools/spikes/account-deletion-http.test.mjs`를 만들어 run-e2e의 agent·field에 등록한다.
     - eligibility 조회 → 조직 삭제 예약 → 취소 200
     - 비밀번호 재인증 계정 삭제 → `/me` 401
     - 비운영자 resume 403, 운영자가 사유 없이 resume하면 400
  3. `field-site-autosave-http.test.mjs`를 확장한다.
     - 업로드 → DELETE → `deleting` 상태에서 GET 404
     - worker 주기 뒤 `FIELD_MEDIA_DIRECTORY`에서 파일 부재
     - 초안에서 사용 중인 사진은 거부
  4. `field-tenant-host-http.test.mjs`를 확장한다(security 실행기에서 돈다).
     - 알 수 없는 도메인 ask → 404 + `no-store`
     - 알 수 없는 Host site-health → 404
     - verified 도메인 fixture → 200과 hex64 proof
  5. `agent-owner-flow-http.test.mjs`를 확장한다.
     - take-over 뒤 AI 무응답, release 뒤 재응답
     - `/privacy`·`/terms` 200
     - `/v1/auth/providers`에 kakao 없음
  6. 새 `auth-mail-http.test.mjs`: 대체 포트 mock API의 stdout 메일 링크를 읽어 재설정 → 새 비밀번호 로그인, 확인 링크 → `emailVerified=true`를 확인한다.
  7. 새 `billing-webhook-http.test.mjs`: 잘못된 본문 4xx, 같은 eventId 멱등을 확인한다.

### M6. 마스터 문서가 분할 문서와 어긋났고, 잘못된 재생성 도구를 고를 위험이 있다
- 마스터 `AI_Field_Service_Operator_Final_Development_Plan_v3.0.md`와 `FINAL_DEVELOPMENT_REPORT_v3.0.html`의 마지막 재생성은 9559a2b(09-27)다.
- 재생성 도구는 `tools/build_report.py`다. docs/00~06·TASKS·AGENTS를 이어 붙여 md와 HTML을 덮어쓴다.
- scratch 복사본에서 재생성하면 1872행이 1980행이 되고 124줄이 다르다.
- 마스터에 빠진 내용:
  - docs/03 §4.12 scope·preview.9~11, v2 서명 전환 순서
  - docs/04 5.1.1 배포 산출물, 5.6.1 로그·PII, G-I1, outbox 보존
  - TASKS 상단 6개 항목
- 재생성본은 check_package 로직을 통과한다.
- 기준 이전에는 문서를 바꿀 때마다 build_report·check_package를 실행했다(HANDOFF:291,318,381,460). 기준 이후 6개 커밋에는 이 단계가 없다.
- 위험 요소 `tools/build_planning_tables.py`(기준 이전부터 존재):
  - :67-68이 `TASKS.md`를 "모든 상태 planned" 보드로, `contracts/task_graph.json`을 덮어쓴다.
  - :161-162가 docs/06과 acceptance_catalog를 덮어쓴다.
  - 이것을 마스터 재생성 도구로 잘못 고르면 §6.1 완료 원장이 지워진다.
- 최소 수정:
  - markdown_it venv에서 `python tools/build_report.py` → `tools/check_package.py`를 실행한다.
  - build_planning_tables.py에 실행 가드를 넣거나 HANDOFF에 "실행 금지"를 적는다.

### M7. TASKS.md 상단이 §6.1 원장 규칙을 어긴다
- (a) 5~15행의 새 항목 6개에 코드 commit 해시가 없다. 해당 커밋: 8e7abd7, a745058, c22b288, b5df6af, 196befc, 13bcd31.
- (b) 170행 `[ ] AUTH.LIVE / PROVIDERS.LIVE`에 내부 완료(메일·카카오·MFA 코드)와 실 공급사 미완료가 섞여 있다. `[x]`/`[ ]`로 나눠야 한다.
- (c) 171행 R00.QA의 수치가 09-29 기준이다(AP DB 136, Field 157). 최신은 169~171과 192~194다.
- (d) 9행과 11행의 "미구현/결정 필요·남긴 것·HEIC·계정 삭제·logger 미처리"는 이후 단계에서 해결됐는데 "(이력)" 표시가 없다.
- (e) 9행의 `A-O09`는 오타다. 올바른 ID는 `AP-O09`(docs/01:133)다.
- 기준 이후 새로 체크된 `[x]` 주장은 모두 코드와 테스트로 뒷받침된다. 거짓 완료는 없다.

### M8. DEVELOPMENT_STATUS.md, 01_SUMMARY 결정 목록, CODEX_HANDOFF 명령이 오래됐다
- `DEVELOPMENT_STATUS.md`:
  - 1행은 "2026-10-02 갱신"이다.
  - 3행은 웹 live 빌드 throw, 메일 없음, MFA 없음, Dockerfile/CI 없음, 체험 mock 전용, 템플릿 빈 사이트를 현재 공백으로 적고 있다.
  - 이 항목들은 모두 c22b288에서 해결됐다.
- `01_SUMMARY.md` 결정 목록:
  - TASKS:5와 HANDOFF:16은 "결정 필요(§3·§9·§10)만 남는다"고 한다. 그런데 그 목록에는 해결된 항목이 섞여 있다.
    - §3:59 trustProxy 문서화
    - §9:160-166 next 포함·TLS ask·connect 2FA·outbox
    - §10:201의 7건
  - 실제로 열린 항목은 따로 모아 둔 곳이 없다: 숨김 사이트 신규 접수, `(추가)` 표식 범위, 템플릿 소개 중복, `oauth-lifecycle-cli` mock 전용(:9), human→AI 재개, §4.6 상태 4종, 웹훅 backoff, nodemailer 공급망, scope 추가 재동의 흐름.
  - 단일 "§13 현재 열린 결정" 목록을 만드는 것을 권한다.
- `CODEX_HANDOFF.md`:
  - 최신 "Exact commands"(57~75행)는 09-29 기준이다.
  - 참조하는 `/private/tmp/fieldai-*-20260929.log`와 `/private/tmp/fieldai-e2e-venv-20260929`가 존재하지 않는다.
  - 10-02~10-03 섹션 5개에는 명령 블록이 없다.
  - 12~16행 "New env"에 `*_EVENT_SIGNATURE_ACCEPT_V1`·`*_EVENT_SIGNATURE_SEND_VERSION`이 빠져 있다.

### M9. 응답과 OpenAPI 스키마의 대조가 일부 경로에만 있다
- `assertContract` helper는 `apps/agent-api/test/integrator.db.test.ts:23~`와 `apps/field-api/test/integrator.db.test.ts:28~`에 있다.
- AP는 읽기 7개 경로만 대조한다.
  - 빠진 AP 경로: connections·deployments 쓰기, source·source-refreshes·field-events 202 영수증, revoke, recovery-status, notification-routes/close 등.
- Field에서 대조하지 않는 경로: POST external-requests·by-source, customer-handoffs·exchange, bind, revoke, webhooks/agent 202.
- 코드 라우트 집합과 OpenAPI paths가 같은지 자동으로 보는 검사가 없다. 지금은 수동 대조로만 1:1을 확인했다.
- 최소 수정:
  - 기존 DB 테스트의 응답에 `assertContract`를 추가한다.
  - `/integrations/v1/*` 라우트 집합과 OpenAPI paths가 같은지 보는 테스트를 1개 둔다. 제외 목록은 `authorization/*`·`notifications/solapi`다.

---

## Low

- **L1. CI static job의 DB 2개가 쓰이지 않는다(`ci.yml:4,35-55`).**
  - 주석은 "test:unit 안의 DB 러너 검사 때문"이라고 한다. 그런데 해당 검사(`tools/test/db-suite-admin-integration.test.mjs:104`)는 `DB_SUITE_ADMIN_INTEGRATION=1`이 없으면 skip된다. 로컬 실측에서 2 skipped였다.
  - 해결: 그 env를 켜서 실제로 실행하거나, services를 제거하고 주석을 고친다. 켤 경우에도 H1처럼 compose로 띄워야 한다.
- **L2. 어떤 실행기에도 연결되지 않은 unit 테스트가 2개 있다(기준 이전 2362761부터).**
  - `apps/field-api/test/route-key-ui-fence.test.ts`, `apps/field-api/test/site-font.test.ts`
  - 직접 실행하면 4/4 통과한다. Field `test:unit` 목록(`apps/field-api/package.json`)에 추가하면 된다.
- **L3. `/v1/public/site-hosts/allow`가 공개 API 호스트에 노출된다.**
  - Caddyfile.example:31은 "공개 인터넷에 노출하지 않는다"고 하지만, `{$FIELD_API_HOST}` 블록(:55-58)이 모든 경로를 프록시한다.
  - Field web rewrite `/v1/:path*`(`apps/field-web/next.config.ts`)로 테넌트·자체 도메인에서도 접근할 수 있다.
  - 응답에 `organizationId`가 포함된다(`apps/field-api/src/custom-domain-routes.ts:121`).
  - 해결: API 호스트 블록에 `respond /v1/public/site-hosts/allow 404`를 두고 ask는 127.0.0.1로만 받는다. 또는 응답에서 organizationId를 뺀다.
- **L4. `FIELD_AUTH_SECRET`이 site-health proof HMAC 키로도 쓰인다(`custom-domain-edge-caddy.ts:13-16`).**
  - `.env.live.example:37` 주석에는 "공개 접수 IP HMAC"만 적혀 있다. 키를 교체하면 도메인 확인 proof도 바뀐다는 내용을 추가한다.
- **L5. Node 버전이 어긋난다.** `NODE_IMAGE=node:24-bookworm-slim`이 고정되지 않아 실제 이미지는 24.21.0이다. `.node-version`은 24.18.0이다. 패치 버전이나 digest로 고정하는 것을 권한다.
- **L6. worker 서비스에 healthcheck가 없다(두 compose).**
  - 기동 실패는 restart와 `--wait`로 드러난다. 하지만 멈춘 루프는 감지하지 못한다.
- **L7. Caddy용 env 예시가 없다.**
  - 필요한 값: `ACME_EMAIL`, `*_WEB_HOST`, `*_API_HOST`, `FIELD_SITE_BASE_DOMAIN`, `CLOUDFLARE_API_TOKEN`.
  - Caddyfile 주석(:9, :63)에만 있다.
- **L8. 계약 문서의 세부 표기가 어긋난다.**
  - docs/03 §4.12 표에 빠진 경로가 있다(:322-356). AP: `GET /agent`, `/deployments` 목록, `/conversations/{id}`, 첨부. Field: `/me`, `bind`, `by-source/{id}/events`.
  - :346 availability 파라미터는 실제로 `serviceId`(필수)와 `date`다.
  - :333-335의 scope 표기는 실제 이름 `ap.conversations.read`·`ap.conversations.reply`로 바꿔야 한다.
  - `contracts/CONTRACT_NOTES.md:34`에 `AP_EVENT_SIGNATURE_SEND_VERSION`이 빠져 있다.
  - Field `/capabilities`에 `request.read`·`notification_route.read` 키가 없다.
- **L9. `tools/build_contract_examples.py:44`가 `CONTRACT_NOTES.md`를 옛 문자열로 덮어쓴다.** 설계용 `contracts/event_envelope.schema.json`과 예제는 실제 envelope와 다르다(uuid가 아니고 `notification_owner_product`·`route_generation`이 없음). 이 파일이 설계용이라는 것을 명시해야 한다.
- **L10. README.md:124의 "제안 응답 미지원"은 낡았다.** capabilities는 이미 `proposal.respond`를 돌려준다(`apps/field-api/src/integrator-routes.ts:194`). mock client에 새 scope가 추가된 뒤에는 기존 연결을 해제하고 다시 연결해야 한다는 안내도 없다.
- **L11. ADR 0003이 낡았다.** :26의 "`?domain=` 허용 endpoint 없음"은 이제 사실이 아니다. :12의 "ap-event"는 실제 profile 이름 `ap-connector`와 다르다.
- **L12. `SHA256SUMS.txt`가 낡았다.** 마지막 갱신은 09-26이고 37개 중 12개가 FAILED다. OpenAPI 두 파일은 목록에 없다.
- **L13. QA ID 추적이 끊겼다.**
  - `acceptance_catalog` 160개가 모두 `not_run`인 것은 check_package.py:24가 강제하는 정상 상태다.
  - 기준 이후 추가된 테스트는 QA ID를 하나도 참조하지 않는다.
  - `docs/technical/LOCAL_FUNCTIONAL_COVERAGE.md`는 갱신되지 않았다.
  - 매핑 예: QA02~04 → auth, QA157 → MFA, QA44 → billing-webhook, QA159 → logging, QA158 → 서명 v2.
- **L14. `*_TRUST_PROXY` 해석이 제품마다 다르다.**
  - AP는 문자열을 Fastify에 그대로 넘긴다(`apps/agent-api/src/app.ts:55`).
  - Field는 true/false를 파싱한다(`apps/field-api/src/app.ts:49`).
  - 예시 주석도 이 차이를 따라 서로 다르게 적혀 있다.
- **L15. 실행기 밖 spike가 있다(기준 이전부터).** 예: `field-request-fallback-browser.py`(이번에 문구만 수정), `auth-entry`·`auth-session`·keyboard browser, `field-site-outage-http` 등.
- **L16. Field 저널 경로가 상대 경로라 엉뚱한 곳에 디렉터리가 생긴다(기준 이전, 참고).**
  - `tools/setup-mock-env.mjs:57`이 `FIELD_REVOCATION_JOURNAL_DIRECTORY`를 상대 경로로 쓴다. AP는 :69-79에서 절대 경로로 정규화한다.
  - 그 결과 `apps/field-api/infra/field/revocation-journal/oauth-lifecycle`(09-28, 빈 디렉터리)이 package cwd 기준으로 생겼다.

---

## 확인 결과 이상 없음

- **환경변수 범위**
  - `apps/*/src`가 읽는 `AP_*`·`FIELD_*` 이름은 모두 다음 셋 중 하나에 있다: `.env.live.example`, compose 고정값(HOST·PORT·PROFILE·journal 경로), 문서(`*_LOG_LEVEL`은 docs/04 5.6.1, 복구 CLI 전용 값은 example 하단 주석).
  - 남은 이름(`*_SIGNATURE_PREFIX`, `*_EMAIL_OUTBOX_ANONYMIZED_TO`, `FIELD_SITE_HEALTH_PATH`)은 코드 상수다.
  - README·docs/03·04·ADR·CONTRACT_NOTES에 있는 env 이름 중 코드나 infra에 없는 것은 없다(Caddy 호스트 변수 제외).
  - 웹의 `NEXT_PUBLIC_*`·`APP_PROFILE`·`*_API_BASE_URL`은 Dockerfile ARG, compose build args·environment와 일치한다. 값이 없는 build arg가 `--env-file`에서 해석되는 것을 `compose config`로 확인했다.
  - Kakao Redirect URI 안내(`<*_PUBLIC_WEB_ORIGIN>/api/auth/callback/kakao`)는 `kakao-provider.ts:31`과 웹 rewrite `/api/auth/:path*`에 맞다.
- **Docker**
  - 6개 타깃이 모두 빌드된다. API 이미지에 next가 없다(460MB/462MB).
  - dist에 compose의 모든 `command` 진입점이 있다. AP 7개, Field 10개.
  - 별도 진입점이 아닌 `source-refresh`·`field-connection-revoke`·`external-request-attachment`는 이벤트 worker 안에서 import된다.
  - migrate 이미지로 빈 PG17에 두 제품 migration이 적용된다.
  - **예시 env를 그대로(빈 값 포함, 부팅 필수값만 채움) 썼을 때:**
    - 두 API 모두 `/health/ready` 200(`email: blocked_integration`)이다.
    - 기본 worker는 모두 blocked_integration 상태로 대기한다.
    - profile worker(site-ai, ap-event, retention)는 설명대로 부팅을 거부한다.
  - live 웹 이미지 두 개 모두 `/`·`/terms`·`/privacy`·`/admin/mfa`·`/workspace`가 200이고 `/preview`는 404다.
  - `.dockerignore` 허용 목록에서 필요한 파일이 빠지지 않았고, `.env`·테스트·journal은 제외된다.
  - `.gitignore`는 `.env.live`를 무시하고 example은 추적한다.
- **compose**
  - 두 compose 모두 `--profile '*' config`가 통과한다.
  - 예시 원본을 그대로 쓰면 `AP_DB_PASSWORD` 필수 오류로 거부된다.
  - 기동 순서 db→migrate→api(healthy)→web·worker, journal named volume 공유, 127.0.0.1 포트 노출, `*_TRUST_PROXY` 기본 서브넷이 모두 일관된다.
- **CI**
  - `actionlint`가 clean이다. pnpm·Node 설정과 job별 env 격리(`test ! -e` 검사)가 맞다.
  - images matrix가 Dockerfile 타깃과 일치한다.
  - 로컬 실측: `pnpm lint`·`typecheck`·`test:unit` exit 0이다. API 51+32, 웹 138+85, tools 37 통과, skip 2다.
  - unit 테스트에 DB·Valkey·Playwright가 필요 없다. `openssl` 바이너리만 쓰는데 ubuntu runner에 있다.
  - contracts job에 Valkey가 없어도 된다. `site-queue.ts:21` lazyConnect이고 DB 테스트는 queue를 스텁한다.
  - `next build`의 기본 profile은 non-live라 CI 웹 빌드에 env가 필요 없다.
- **계약**
  - 코드 라우트와 OpenAPI가 1:1로 맞다(AP 23, Field 15 연산). scope와 security, 허용 scope 목록도 같다.
  - v2 방향 서명(접두사, `X-Signature-Version`, live에서 v1 거부)이 양방향 inbox·revoke에 적용되어 있다.
  - AP의 Field 공개 API 소비 경로·scope·필수 필드가 Field OpenAPI와 정확히 맞다.
  - 버전 표기 AP preview.11 / Field preview.10이 모든 문서에서 일치한다.
  - 정적 계약 테스트 5/5 통과다.
  - `contracts/examples` 폴더는 없고 예제 3종은 `contracts/` 바로 아래에 있다. 간이 스키마 검증 결과 오류가 없다.
- **문서·원장**
  - 기준 이후 TASKS `[x]` 주장(migration AP 000084~93, Field 000075~83, 라우트, 화면, env, 테스트 파일)은 모두 코드에 있다.
  - docs/04 5.1.1 표의 파일이 모두 존재한다.
  - README의 compose profile 이름(retention/site-ai/ap-connector)이 compose와 맞다.
  - `mock:run`이 두 connector setup을 자동 실행한다.
- **실행기**
  - 실행기가 참조하는 spike와 DB 테스트 파일이 모두 존재한다.
  - mock profile에 새로 필수가 된 env는 없다.
  - `run-independence.mjs`가 만드는 env로 두 API가 ready 200, `email: mock`으로 뜬다.
  - 실행 중인 mock 스택의 4311·4321 ready, 3001·3002 `/workspace` 200을 확인했다.
