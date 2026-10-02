# FieldAI 기준선 검수 보고 (commit 84af59a, main, 2026-10-02, Node 24.18.0 / pnpm 10.33.4, macOS, profile=mock)

| 명령 | exit | 결과 |
|---|---|---|
| pnpm install --frozen-lockfile --offline | 0 | "Lockfile is up to date", 변경 없음, 드리프트 없음 |
| pnpm lint | 0 | 에러/경고 출력 없음 |
| pnpm typecheck | 0 | agent-api, field-api, agent-web, field-web 모두 통과 |
| pnpm test:unit | 0 | agent-api 20/20, field-api 25/25, agent-web 55/55, field-web 98/98, tools 35 pass / 2 skip / 0 fail |
| pnpm build:agent / build:field | 0 / 0 | tsc 성공 |
| node tools/check-import-boundaries.mjs | 0 | "No direct cross-product internal imports found." |
| node tools/check-db-isolation.mjs | 0 | 자기 DB 연결 2건 성공, 교차 DB 자격증명 2건 거부(28P01) |
| pnpm test:db:agent | **1** | 테스트 파일 34개 중 33개 통과, 테스트 136개 중 135개 통과 / **1개 실패** (retention-purge) |
| pnpm test:db:field | 0 | 파일 31/31, 테스트 157/157 통과 |
| pnpm test:contracts | 0 | 정적 3/3, AP DB 3/3, Field DB 2/2 |
| pnpm test:security | **1** | 사전조건 단계에서 즉시 중단(환경 문제) |

skip 2건(tools): "actual admin create/drop response fault ..." — DB_SUITE_ADMIN_INTEGRATION=1과 POSIX 로컬 Field PostgreSQL이 있어야 실행되므로 의도된 skip이다.

## 실패 1: test:db:agent — apps/agent-api/test/retention-purge.db.test.ts
- 테스트: "AP independently approves and executes retained inquiry cleanup with real files and irreversible native originals" (실패 시점 2125ms)
- 오류: `error: terminating connection due to administrator command` (스택은 pg-protocol parser뿐이고 테스트 코드 줄은 없다)
- 분류: **flaky — 테스트 정리 코드의 경쟁 조건. 제품 코드 결함은 아니다.**
- 근거:
  - 같은 파일만 `node tools/run-db-suite.mjs agent test/retention-purge.db.test.ts`로 5회 다시 실행했고 5/5 통과했다.
  - AP PG 로그 14:35:54.650에서 backend 1015는 restored DB에 마지막 assert 쿼리(`update ap.inquiry_messages set body=... RESURRECT_RESTORED_BODY`)를 실행했다. 2ms 뒤 같은 backend에 `FATAL: terminating connection due to administrator command`가 기록됐다.
- 원인 진단 (테스트 146행):
  - finally 블록은 `await restored.end()` 직후 `drop database ... with(force)`를 실행한다.
  - pg-pool 3.14의 `Pool.end()`는 유휴 client에 대해 `_remove → client.end()`를 호출하지만 소켓 종료를 기다리지 않고 바로 resolve한다.
  - 그래서 backend가 Terminate 메시지를 처리하기 전에 DROP FORCE가 그 backend를 종료시킬 수 있다. 이때 서버가 보낸 FATAL ErrorResponse를 client가 받는다.
  - active query가 없으므로 이 응답은 `_handleErrorEvent`로 처리된다. 이어서 아직 붙어 있는 idleListener가 `pool.emit('error')`를 호출한다.
  - `restored` Pool에는 'error' 리스너가 없어 uncaught 예외가 되고 테스트가 실패한다. 이 때문에 테스트 후반부(makeWork 이하)는 실행되지 않았다.
  - Field DB suite, 다른 에이전트의 mock-run/e2e와 병렬로 실행돼 부하가 있을 때 재현됐다.
- 수정 방향(테스트만):
  - `restored.on('error', ()=>{})`를 붙인다.
  - 또는 DROP 전에 `pg_stat_activity`에서 해당 DB 연결이 사라질 때까지 기다린다.
  - 또는 FORCE 없이 DROP하고 재시도한다.
- 같은 패턴(`db?.end()` 직후 drop with(force))이 apps/field-api/test/ai-entitlement.db.test.ts:40에도 있어 같은 잠재 위험이 있다.

## 실패 2: test:security — tools/run-security.mjs
- 오류: `Chromium test Python is unavailable: /tmp/fieldai-ui-venv/bin/python` (exit 1, 브라우저/HTTP 검사는 시작 전)
- 분류: **환경 문제 (로컬 도구 누락). 코드 결함도 blocked_integration도 아니다.**
- 원인:
  - `/tmp/fieldai-ui-venv`가 없다. /tmp가 정리된 것으로 보인다.
  - 시스템 python3에도 playwright 모듈이 없다. `~/Library/Caches/ms-playwright`에는 chromium이 있다.
  - AP_BROWSER_PYTHON / FIELD_BROWSER_PYTHON도 설정되어 있지 않다.
- 문서 결함: 저장소에 이 venv를 만드는 방법(requirements, 설치 명령)이 없다. README·CODEX_HANDOFF는 경로만 언급한다.
- 함께 확인한 것:
  - security가 실행하는 하위 항목 중 import boundary, DB 자격증명 격리, 양 제품 DB suite는 위에서 따로 실행했다.
  - 나머지 브라우저 3종(field-tenant-host, agent-admin, field-admin)은 **미실행**이다.
  - 4개 포트는 다른 에이전트의 `mock:run`(pid 33263)이 점유해 ready 상태였다.

## 기타 관찰
- 두 ENOENT 로그 `Better Auth Introspection error ... /journal/oauth-lifecycle`는 oauth-lifecycle 테스트의 의도된 저널 누락 경로이며, 해당 테스트는 통과했다. 무해하다.
- git status는 실행 전후 모두 clean이다. 테스트가 추적 파일을 수정하지 않았다. ignored 산출물(dist, .next, tsbuildinfo, tools/spikes/__pycache__)만 남는다.
- 남은 임시 DB:
  - AP: fieldai_agent_test_185bbab8…, fieldai_agent_test_f9a0c61b…
  - Field: fieldai_field_test_c9e41d27…, fieldai_field_test_f722fe20…
  - 이 이름들은 내 로그 어디에도 없다. 동시에 실행 중인 다른 에이전트 프로세스(`run-e2e.mjs field`, `mock-run.mjs suite`)의 것으로 판단해 건드리지 않았다. 해당 프로세스가 끝난 뒤에도 남아 있으면 정리 누락을 확인할 필요가 있다.
- 컨테이너:
  - AP PG는 14:33:31 UTC에 "not properly shut down; automatic recovery" 뒤 기동됐다. Docker 또는 호스트 재시작 후 다른 에이전트가 올린 것으로 보인다.
  - 3개 컨테이너 모두 healthy 상태로 유지 중이다.
- 내 `build:agent/build:field`는 다른 에이전트의 mock-run이 사용하는 `apps/*-api/dist`를 다시 썼다. 출력은 동일 commit 기준이라 내용 차이는 없을 것으로 보인다.
- 미실행: mock:run, e2e, independence, integration:faults (지시에 따라 제외).

로그: scratchpad/baseline-*.log (lint, typecheck, test-unit, build-agent, build-field, docker, test-db-agent, test-db-field, test-contracts, test-security, import-boundaries, db-isolation, install, retention-purge-rerun-1..5)
