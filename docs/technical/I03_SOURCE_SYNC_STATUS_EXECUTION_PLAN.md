# I03.SOURCE-SYNC-STATUS — 고정 연결 패널의 원본 상태/수신 시각

Task ID / Product / Owner: I03.SOURCE-SYNC-STATUS / AP 공개계약→Field BFF/UI / public_write; Coordinator=root.
State: verified (이번 내부 읽기 기능), source/doc 동결. 착수 HEADd0e0503(source a974b90)·TASKS49[x] 완료 이력을 유지한다. AGENTS6.0/6.1·현handoff·C03_FINAL_INTERNAL_UI_EXECUTION_PLAN·FieldPRD3.5:58/60·계약4.3·QA131/134/152를 직접 읽었다. 기존sourceworker/승인/원장/native회수/설치/완료디자인은 동결한다. 중앙 원장/commit은 root가 별도로 기록한다.

## 승인된 파일/계약/요구

- own apps/agent-api/src/source-refreshes.ts GET DTO, contracts/agent-integrator-v1.openapi.json/CONTRACT_NOTES.md, tools/test/agent-integrator-contract.test.mjs. AP preview.10으로 읽기metadata syncedAt를 추가한다. 설치write endpoint는preview.9 pinnedsubset 그대로 유지하며 그consumer를변경하지않는다.
- own apps/field-api/src/ap-source-refresh.ts, apps/field-web/src/field-source-refresh.tsx, 신규 readonlystatus consumer/helper 및 좁은 API/native/consumer test. 신규 ownUUID runner tools/run-source-sync-status-db-tests.mjs. 공통app/package/runtime/Git/TASKS/인계/마스터는root만통합한다.
- Coordinator가 snapshot source_id+현재source_revision의 실제 knowledge_source_snapshots.fetched_at LEFT JOIN을 승인했다. syncedAt는 현재AP저장버전 수신시각(같은revision재조회heartbeat/승인/AI공개시각아님), missing source/snapshot는null. source.fetched_at는 approval도 now로갱신하므로사용하지않는다. updated_at/now/FieldpublishedAtfallback금지.
- schema/migration 필요없음. applied AP81/Field73 동결, AP82/Field74 미사용. 새scope/권한/조직·owner경계/worker동작변경없음. Fieldconsumer는preview.9 missing=>legacy null, malformedpresenttimestamp502. UI는실제state 라벨과원본수신시각 readonly줄 `(추가)`로표시한다.
- reference/field_ui_prototype_v3.html의 settings3/knowledge3 원문을읽었다. 현재 별도AP연결패널은시안외기능이므로 기존 knowledge-source 배치/스타일/버튼을보존하고 새readonly줄만 `(추가)`. fileURL보안거부우회/시안재설계/완료화면반복조정없음.

## 계약→consumer→구현 / 실제명령

1. 승인된 preview.10 원문/노트 및 고정contractconsumer 변경.
2. 신규 consumer red: nullable/missinglegacy, 잘못된datetime/connection/state, 상태labels+읽기UI 원문(추가). 신규ownUUIDPG17 red로 AP GET syncedAt가 currentrevision snapshot clock과동일함·승인/source.updated clock사용안함·missing snapshot/source null 확인. Field actualBFF legacy/new/malformed 소비·owner/scope경계는좁은필요항목만.
3. 기존GET query와 Field safe DTO/readonlypanel만 구현, worker/승인재실행없음.
4. `node --test tools/test/agent-integrator-contract.test.mjs`; `pnpm --filter @fieldai/field-web exec tsx --test test/field-source-sync-status.test.tsx`; `node tools/run-source-sync-status-db-tests.mjs agent|field`. 제품별 ownloopback PG17 UUID·peerDB/env차단·종료clients0확인뒤 ownUUID만일반DROP.
5. own AP/Field API 및 Fieldweb typecheck, scoped ESLint, diffcheck. 전체QA/E2E/browser반복없음. 필요추가검수는구체적실패근거가있을때만.
6. 승인 fallback `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only`로 이번작은source/DTO/UI범위만 독립검토, 실제결과/rawconfidence기록후동결. root가중앙whole/build/최신managed/원장/commit/문서재생성/journal수행.

## 완료/미검수

- [x] preview.10 계약·legacy consumer: 계약 원문→consumer red→구현 순서를 실행했다. 설치 write preview.9 subset은 유지한다.
- [x] 실제current snapshot nullable시각 API/BFF: own UUID PG17의 실제 loopback HTTP에서 검수했다. source/approval/updated clock으로 대체하지 않는다.
- [x] 고정연결패널 실제state/원본시각 `(추가)` readonlyUI: 기존 배치/버튼은 유지하고 새로운 읽기 줄만 추가했다. consumer SSR 검수이며 브라우저 시각/동선 인수와 구분한다.
- [x] ownfocused검수/type/lint/독립clean: 계약2/2·web consumer2/2·AP/Field own UUID PG17 각각1/1, scoped lint exit0, root 최종 whole type/lint exit0, read-only CLI noP1/P2·raw confidence0.88.
- [ ] rootmanaged/원장/인계/sourcecommit
- [ ] 실공급사·전체버전호환/320px/시각/동선/사용자최종인수 (blocked_integration/미실행)

## 실제 실행 증거 — 2026-09-27 / I03 source

| 명령 | 실제 환경/handle | 결과/로그 |
|---|---|---|
| `node --test tools/test/agent-integrator-contract.test.mjs` | local contract JSON, source HEADd0e0503+I03 diff | exit0, 2/2; `/tmp/source-sync-contract.log` |
| `pnpm --filter @fieldai/field-web exec tsx --test test/field-source-sync-status.test.tsx` | 신규 helper 미구현 상태 | exit1, 2개 실패; `/tmp/source-sync-web-red.log` (유효 consumer red) |
| 같은 web consumer 명령 | 신규 readonly helper 구현 후 | exit0, 2/2; `/tmp/source-sync-web-green.log` |
| `node tools/run-source-sync-status-db-tests.mjs agent` | AP own UUID PG17, handle86743; API DTO 구현 전 | exit1, `undefined !== null`; `/tmp/source-sync-agent-red3.log` (유효 red) |
| `node tools/run-source-sync-status-db-tests.mjs field` | Field own UUID PG17, handle4916; BFF DTO 구현 전 | exit1, 실제 수신 시각 누락; `/tmp/source-sync-field-red.log` (유효 red) |
| 같은 agent 명령 | AP own UUID PG17/mock, peer 제품 env 제거, own 임시 journal, handle9002 | exit0, 1/1; `/tmp/source-sync-agent-green.log` |
| 같은 field 명령 | Field own UUID PG17/mock, peer 제품 env 제거, own 임시 journal, handle47772 | exit0, 1/1; `/tmp/source-sync-field-green.log` |
| `pnpm --filter @fieldai/agent-api typecheck` | handle54682 | exit0; `/tmp/source-sync-agent-type.log` |
| `pnpm --filter @fieldai/field-api typecheck` | handle91399 | exit0; `/tmp/source-sync-field-type.log` |
| `pnpm --filter @fieldai/field-web typecheck` | handle86147 | exit2, 다른 owner의 `test/route-key-client.test.tsx:81` UUID template 타입 1건; source test 오류 없음. `/tmp/source-sync-web-type.log`; root에게 전달 |
| 아래 own scoped ESLint | handle61797 | exit1, 신규 Field fixture의 prefer-const 1건; `let response`→`const response` 보완. `/tmp/source-sync-lint.log` |
| 같은 own scoped ESLint | handle70793, const 보완 후 | exit0; `/tmp/source-sync-lint-green.log` |
| `git diff --check` | own source 구현 후 공유 repository 읽기검사 | exit0 |
| `pnpm typecheck` / `pnpm lint` | root 중앙 통합, 각각 handle10588/45330 | root가 terminal exit0를 확인하여 전달했고 실제 로그를 직접 읽었다. `/tmp/c03-final-internal-typecheck.log`·`/tmp/c03-final-internal-lint.log`. 위 web 중간 실패는 현재 해소 |
| 아래 read-only CLI review | gpt-6-sol/high, handle62400 | terminal exit0, noP1/P2, raw confidence0.88, 사용54,649tokens. `/tmp/source-sync-status-review-result.md`·`/tmp/source-sync-status-review.log` |

own scoped ESLint 명령: `pnpm exec eslint apps/agent-api/src/source-refreshes.ts apps/agent-api/test/source-sync-status.db.test.ts apps/field-api/src/ap-source-refresh.ts apps/field-api/test/source-sync-status.db.test.ts apps/field-web/src/field-source-refresh.tsx apps/field-web/src/field-source-sync-status.tsx apps/field-web/test/field-source-sync-status.test.tsx tools/run-source-sync-status-db-tests.mjs tools/test/agent-integrator-contract.test.mjs`.

AP 검수는 정확한 현행 snapshot 수신 시각·source 승인/변경 시각 분리·missing source/current revision snapshot null·다른 연결404·현행 owner 상실401을 확인했다. Field 실제 BFF는 합성 AP fetcher를 소비해 timestamp 보존·preview.9 missing/null·잘못된 날짜/값502·stale state·owner/auth 경계를 확인했다. 실제 AP→Field 연결의 전체 네트워크 경로/외부 공급사/전체 버전 호환 출시 gate는 미실행이며 성공 처리하지 않는다.

read-only CLI 실제 명령: `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only --skip-git-repo-check -C /Users/jr/Desktop/projects/FieldAI -o /tmp/source-sync-status-review-result.md 'Read /tmp/source-sync-status-review-prompt.md and execute that narrow read-only review. Do not modify any file or execute tests or mutations.' </dev/null > /tmp/source-sync-status-review.log 2>&1`. 이번 GET/DTO/readonly helper·consumer/own runner 및 계획만 승인 범위로 지정했고 독립 검토는 검사나 브라우저를 재실행하지 않았다. 실제 result 원문과 terminal exit를 확인했다.

root 통합 patch 반영 확인: 계약4.3 `ap.sources.refresh`의 상태/시각 읽기·기존 갱신 경로의 preview.10 clock/null/legacy 의미 및 4.11 GET 응답 표 nullable 실제 snapshot 시각, 중앙 package `test:source-sync-status:agent`/`:field` 등록을 root가 적용했다. 원문/마스터 재생성·TASKS/인계/최신 managed/Git은 root 담당이다. 새 route 등록은 없다. web/contract unit glob은 이미 신규 검사를 포함한다.

## 동결 파일 / 다음 에이전트

- 수정: `apps/agent-api/src/source-refreshes.ts`, `apps/field-api/src/ap-source-refresh.ts`, `apps/field-web/src/field-source-refresh.tsx`, `contracts/agent-integrator-v1.openapi.json`, `contracts/CONTRACT_NOTES.md`, `tools/test/agent-integrator-contract.test.mjs`.
- 신규: `apps/agent-api/test/source-sync-status.db.test.ts`, `apps/field-api/test/source-sync-status.db.test.ts`, `apps/field-web/src/field-source-sync-status.tsx`, `apps/field-web/test/field-source-sync-status.test.tsx`, `tools/run-source-sync-status-db-tests.mjs`, 본 계획.
- 구현/검사 11개와 계획 1개를 동결한다. 다른 병렬 owner 파일·schema·managed runtime·Git을 수정하지 않았다. 중앙 managed 재빌드/원장/인계/코드 포함 commit·사용자 최종 UI/동선 검수를 root가 수행한다. own build/browser/320px/실 공급사 검수는 미실행이다.
- 재현 명령: `pnpm test:source-sync-status:agent`, `pnpm test:source-sync-status:field`, `pnpm --filter @fieldai/field-web exec tsx --test test/field-source-sync-status.test.tsx`, `node --test tools/test/agent-integrator-contract.test.mjs`. 구체적 새 오류 없이 완료 범위를 반복검수/재구현하지 않는다. 원본 디자인 고정·완료 화면 반복 조정 금지·새 기능만 `(추가)` 원칙을 유지한다.

## 중앙 통합 완료 — 2362761

- [x] source2362761 저장, whole type10588/lint45330exit0, managed54544 실제최신양build/ready·Fieldintegrations200·보호source401. TASKS52[x]/7[ ]·인계/coverage/audit에완료체크. 기존 중앙재빌드/commit대기문구는 당시이력이다.
- [ ] 사용자최종UI/동선·320px/실기기·전체QA/실공급사/전체호환·출시인수는 별도범위로유지한다. 구현을기억부재로반복하지않는다.

## 조사실패/한계

- 최초추정 packages/contracts·ap-public-client 및 몇migration별칭은없었고 rg --files로 실제 contracts/ 및 기존migration경로를확인했다. source field/worker/승인동작은읽기전용으로대조했으며재구현하지않는다. 실제관리DB데이터/외부계정/청구/발송/삭제는사용하지않는다.
- 초기 AP fixture handle15685/73377은 `agent_releases.draft_revision` 누락23502로 exit1이었다. fixture 필수값을 보완한 뒤 기능 red86743을 확보했다. 이 초기 실패는 기능 red/통과로 계산하지 않는다. 초기 AP fixture의 기존 mock journal 설정을 별도 임시 own journal로 격리했다. 기존 journal/운영 토큰/원장은 수정하지 않았고 합성 own UUID DB만 생성/종료 clients0 확인 후 일반 DROP했다.
