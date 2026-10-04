# A절 실행 계획 — 2026-10-04

착수 HEAD: `653de60`, 코드 `a5eac8c`, 외부 `a9fea58` 병합 `0507bfc`. 사용자 요청: `18_REMAINING_WORK.md` A절을 권장 순서로 병렬 구현하고 코드리뷰한다. 기존 완료 `[x]`와 고정 시안을 유지한다.

## 격리·소유권

- 전용 worktree `/private/tmp/fieldai-remaining-a-20261004`, branch `fix/remaining-a-20261004`를 사용한다. 원본 `main`의 변경·서버·컨테이너를 덮어쓰거나 중지하지 않는다.
- 외부 에이전트의 관측된 변경: `tools/setup-mock-env.mjs`, 양제품 OAuth lifecycle CLI 디렉터리 후속(`c36a407`, `653de60`), `tools/spikes/agent-field-same-page-browser.py`. 외부 a9fea58 test patch4파일을 병합하고 A21 observer를 보존했다. 원본 파일/실행 환경은 변경하지 않았다.
- AP 담당은 `apps/agent-api/**`, `apps/agent-web/**`; Field 담당은 `apps/field-api/**`, `apps/field-web/**`만 수정한다. Coordinator가 infra·tools·계약·원장을 관리한다. 담당자끼리 공유 경로는 사전 합의한다.
- A-01 검수는 별도 Docker daemon/네트워크의 HEAD 사본으로 시작한다. 기존 mock 스택은 유지한다. 코드 완료와 실 공급사·운영 출시 승인은 구분한다.

## 순서·완료 기준

- [x] A-01: 양제품 `pnpm test:independence:*` 실제 실행·실패 수정·CI matrix·actionlint. B01/B02, QA80/81/121/122/160. CI 수정은 외부 담당과 조율.
- [x] A-07: Field retention admin live Origin localhost 차단. QA49/157. `node tools/run-db-suite.mjs field test/retention.db.test.ts`.
- [x] A-08: Field 삭제 유예 catalog 404. custom-host 삭제 차단은 기존 구현과 테스트를 보존하고 추가 누락만 수정. QA47/65/79/111. `test/account-deletion.db.test.ts`, `test/custom-domains.db.test.ts`.
- [x] A-09: 공개 Caddy API 호스트 ask 경로 404, 내부 ask 유지. `caddy validate`(DNS 모듈만 검수 사본에서 제외).
- [x] A-10: 양제품 callback에서 삭제 예약과 직렬화하고 토큰 교환·연결 생성 차단, 상대 grant 회수 안내. QA129/131/150/153. 제품별 `test/*-connection.db.test.ts`.
- [x] A-06: 미적용 사업자 쓰기 화면 공통 삭제 안내. QA43/46/119. 제품별 웹 unit.
- [x] A-02: AP 종결 가능 delivery_unknown 목록 API와 기존 종결 API를 사용하는 관리자 패널 `(추가)`. QA139/157/159. AP admin DB·web unit.
- [x] A-03: 제품별 인증 메일 outbox 관리자 목록/API, 주소 마스킹·본문/링크 비노출. QA02/48/157/159. 제품별 admin DB·web unit.
- [x] A-04: live OAuth baseline dry-run·명시 이중 확인·quiesced runbook·격리 DB 회귀. QA47/129/153.
- [x] A-05: 오프라인 CLI 공통 production profile guard·단위 검수. 외부 lifecycle CLI 후속과 충돌 확인.
- [x] A-20: 사진 삭제·도메인 health/ask·customer-decisions·서명 webhook·human_active·Toss·약관 HTTP spike 및 실행기 연결. mock에서 비활성 인증메일/MFA/Kakao는 별도 sandbox 검수로 기록.
- [x] A-21: AP 쓰기·202, Field 전 경로 응답과 OpenAPI 대조·route 집합 대조. `pnpm test:contracts`.
- [x] A-11: 자유 입력 NUL 400 `invalid_text` 확대·API 회귀.
- [x] A-12: AP 사건 발신·수신 교대 처리·unit.
- [x] A-13: Toss webhook 한도 운영 env·검증·문서·unit/DB.
- [x] A-14: 미인증 FK 참조 계정 100건 이후 cursor 처리·DB.
- [x] A-15: subscriptionAccess `to_regclass` 제거·fixture migration 갱신·DB.
- [x] A-16: Field mock 저널 절대경로. 외부 `653de60` 구현을 먼저 검증하고 중복 구현 금지.
- [x] A-17: deleting 사진 placeholder·제한된 진행 목록 polling·Field web unit.
- [x] A-18: 삭제 저널 복원 후 익명화 재적용·격리 복원 DB 검수. 기존 retention journal과 범위 구분.
- [x] A-19: 실제 HEIC 변환·진짜 HEIC fixture·양 API Docker proof. 디코더가 없는 환경은 415를 유지한다.
- [ ] A-19 외부 검수(C-07): HEVC 특허/LGPL 법무·운영 amd64·실폰 HEIC 검수. 내부 변환 완료와 구분한다.
- [x] A-22: QA ID↔실행 테스트·LOCAL_FUNCTIONAL_COVERAGE 갱신.
- [x] A-23: FIELD_AUTH_SECRET health proof HMAC 용도 주석.
- [x] A-24: 관리자 MFA session 최대 나이/step-up·unit/DB.
- [x] A-25: 관리자 logout 오류 한국어 문구·web unit.

## 통합 검수·리뷰

실제로 바뀐 범위의 red→green 회귀를 실행한 후 `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 제품별 DB, `pnpm test:contracts`, 양 API/web build, 새 HTTP spike를 실행한다. 기존 실패·skip·미실행을 숨기지 않는다. A-01은 최종 코드에서 다시 확인한다. 별도 읽기 전용 리뷰로 권한·PII·경합·복원·계약·UI 오류를 확인하고 발견된 결함을 수정·재검증한다.

Coordinator만 TASKS 상단·18 잔여 상태·이 phase 체크·CODEX_HANDOFF·커버리지를 최신 원본과 병합해 갱신한다. 마스터 재생성은 `tools/build_report.py`→`tools/check_package.py`→SHA256SUMS이며 `build_planning_tables.py`는 실행하지 않는다. 원본 main 통합 전에 외부 에이전트 변경과 diff를 다시 확인한다.

## 최종 완료 증거

코드 `a5eac8c`, 외부 `a9fea58` 보존 병합 `0507bfc`, 전용 branch `fix/remaining-a-20261004`. A-01~A-25 내부 완료. 최종 Linux arm64/Node24.18.0/pnpm10.33.4/PG17.11/Chromium153 격리 DIND: 독립성 양방향 exit0(사업자/고객 Chromium 각1/1), E2E AP12·Field11·매체2, 보안 410/410(AP DB49파일191/191·Field DB42파일215/215, UUID DB 전부 제거), 통합 장애 26/26 exit0. Host lint/typecheck/unit408pass·환경 조건skip2, 계약 static14+DB18/UUID9제거·실제 응답43/43, actionlint exit0. API/web4종 build는 새 격리 mock stack 기동에서 exit0.

최종 로그 `/private/tmp/fieldai-a-final-independence-v3-logs`, `/private/tmp/fieldai-a-final-e2e-v3-logs`(E2E), `/private/tmp/fieldai-a-final-e2e-v4-logs`(security/faults), `/private/tmp/fieldai-a-final-contracts.log`, `/private/tmp/fieldai-a-final-{lint-v3,typecheck-v2,unit-v3}.log`. final tar SHA256 `e9475d7b6c9ffe2b5a92ff5295ed1429baccc64fea92cbbcc54bbb83f566ce3d`, 코드990파일과 현재 내용 동일.

A18 구체 복원/identity/role/교착/사진/부분복원 결함은 실제PG red→green 후 제한된 재리뷰에서 남은 P1/P2 없음. UPDATE **FOR SHARE NOWAIT**, INSERT FOR SHARE. 상세는19리뷰. A19 native HEIC 실제API Docker2종/Linux arm64/nodeUID1000/network none proof exit0. 초기 실패와 기존 완료 이력은 인계에 보존했다.

기존 main a9fea58 GitHub run37196988683 전체 success는 확인했다. B #12(A04)는 해결돼 열린 결정13건. C01 새 CI 실제 Actions·C02공급사·C03live기동·C04운영/PITR/원장checkpoint 동시rollback/RPO/RTO·C05관측·C06실기기/접근성/최종시안·C07약관/HEVC-LGPL/amd64/실폰HEIC·C08외부보안·C09서명전환은 별도 미완료. 정식 인수160 status=not_run을 보존하며 QA31개 test reference만 연결했다. 원본 main 통합/실행환경 재시작은 하지 않는다.

문서 패키지: build_report.py·check_package.py exit0(46 Task·160 not_run 인수·21 결정·12 경계·schema3). 분할 문서의 상대 링크를 마스터에서 해석할 수 없는 첫 실패는 저장소 경로 표기로 수정했고, 서비스 코드는 바꾸지 않았다. 마스터/HTML과 SHA256SUMS를 함께 갱신한다.
