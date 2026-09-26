# 로컬 기능 검수 현황 — 2026-09-26

**개발 잔여 대조(2026-09-26):** docs/technical/DEVELOPMENT_REMAINING_AUDIT.md에 TASKS46개 인벤토리/확인된 내부6묶음을 기록했다. native widget 종료, 유료 billing, 메시지 발송, 자체 domain, public client write 계약, OAuth/복원 수명 보완이 남는다. 외부 key 부재와 내부 미구현을 구분하며 전체/C03 in_progress. 코드 단계는 eab1d30 커밋/당시 status clean. 이 문서 대조는 테스트 실행/전체160 QA 통과가 아니다. 다음은 widget→billing/발송/주소/public client 구현이다.


**2026-09-26 AP native 회수 단계 최종:** AP74855 29/29·Field52785 30/30·전체 type/lint57153·최신 lint37774 exit0. 실제 Field 미배포 AP independence53496 exit0(own native 회수/token200→401 포함). 세 번째 review62519 P2 package cwd 문제는 AP 생성/기존 journal 경로 절대화·key/파일 보존으로 보완, actual 설정2/2와 마지막 repair review87113 exit0/추가P1/P2 없음. 리뷰 내부 test는 read-only EPERM 미실행이며 root 설정2/2와 구분한다. mock36780 양 API/웹·retention worker ready/health 실제 확인. 전체/C03/A08는 in_progress. 다음은 전체 문서 기능 대조로 남은 범위 확정이며 위젯/일반 OAuth lifecycle·legacy/Field key·유료 구독 원장/외부 발송 adapter·최종 사용자 화면/실 공급사·운영 QA/G는 완료되지 않았다. 자세한 현재 사실은 docs/CODEX_HANDOFF.md 상단 참조. 아래 누적 기록의 이전 handle/미완료는 당시 이력이다.

- **단독 실행 최신 결과:** 재리뷰88411 exit0/P2 1건은 independence launcher가 AP 회수 원장 설정을 누락하던 문제였다. tools/run-independence.mjs own AP 경로/키 allowlist·환경 단위검사 실제 undefined red→2/2, independence-flow의 실제 owner selection revoke/토큰200→401을 추가했다. managed92152 정상 종료130와 Field DB/Valkey compose stop33427 exit0 뒤 pnpm test:independence:agent **53496 exit0**(/tmp/ap-revocation-independent-standalone.log): 실제 Field API/web/DB/Valkey 미배포/포트 부재를 시작·종료 시 확인하고 AP 가입/승인/문의/답변/export/외부 widget/공개 이어가기·native 회수와 owner/guest browser1/1을 확인했다. 모든 AP 기능/실 공급사 완료를 주장하지 않는다. 후속 세 번째 독립 review62519(/tmp/ap-revocation-third-review.log)는 진행 중이며 clean/commit 미확인이다. 양제품 복구 mock36780(/tmp/ap-revocation-standalone-restored-runtime.log)가 현재 기동 중이다. 이전92152/46139/62510/68922는 종료됐고 독립 gate53496의 API/web도 정상 종료됐다.


## 최신 AP native 회수·복원 — a5aee2b 이후 작업트리

최신 리뷰 보완: 첫 독립93162 exit0 P2 3건(잠금40P01·UUID index·전체 원장 재읽기)을 migration68/증분 서명·DB proof cache로 보완했다. watcher 방식은 실제 same-size 변조 즉시200을 놓친98265/99027 red로 폐기했고, 현재 요청마다 전체 파일 inode/크기/mtime/ctime을 직접 대조한다. 변경 파일만 HMAC/hash를 다시 검사하며 checkpoint/restore는 항상 전체 재검증한다. 최종 AP74855 29/29 fail0/skip0 exit0, type/lint57153 exit0, metadata 읽기500entry/10회18.744ms 대 이전361.09ms(전체 서비스 latency 검수 아님). 최신 mock92152 양제품 build/migrate/ready와 retention worker ready. 재리뷰88411 실행 중으로 clean/commit은 아직 미확인이다. 전체 목표/C03는 in_progress다.


AP native owner 연결/선택 회수·검증된 원격 수신을 AP 전용 HMAC/fsync 원장과 불변 ID/hash receipt에 연결했다. migration67은 해제 즉시 access/refresh ciphertext null·재활성화 금지·늦은 OAuth token 발급 직렬화를 적용한다. 실제 해제 전 PG17 dump/별도 restore의 bearer200→회수 재적용401, 고객 문의/확인키 보존·수신 ID 복원·외부 회수 blocked/가짜 ACK 금지·반복0을 검수했다. 최신 checkpoint 필수·원장 유실/변조/추가·namespace/조직 binding 불일치 전체 rollback과 current DB localhost alias/Field port/원장 내부 증빙 출력 거절을 확인했다. AP DB26074 29/29·Field DB52785 30/30 fail0/skip0 exit0, 최종 type25729/lint6277 exit0, 초기 mock 설정1/1·직접 내부 import 경계12312 exit0, 연결 화면 HTML smoke1/1. mock62510 양제품 API/웹 build/migrate/ready·독립 retention worker ready와 양 health를 확인했다. 독립 CLI93162(gpt-6-sol/high)는 진행 중이며 clean을 아직 주장하지 않는다. 일반 OAuth provider의 개별 토큰 삭제/refresh family 수명·양제품 legacy 회수 baseline/Field route key 수명·embed 종료/새 상담·전체 PRD/QA/G/독립 실행·운영 RPO/RTO·외부 공급사/MFA·사용자 최종 화면/동선은 남아 전체/C03 in_progress다.


## 최신 AP 실제 정리 — e89bf2a 이후 작업트리

AP 정리 요청/다른 승인/취소·독립 worker·실제 파일/원문/AI/자체 사본 정리·usage/ID 보존·DB 재저장 차단, 고객 종료/명시적 새 상담을 연결했다. AP migration65/66·Field migration62의 제품별 immutable journal receipt와 signed 원장 대조로 유실·대체·변조/실행 중 폴더 부재 뒤 추가 정리를 차단한다. JSON/사진/archive/지원 읽기는 응답 종료까지 보호하며 photo-only 첨부 목록은 현재 ready ID와 재대조한다. 열린 고객 follow-up410은 원본 재조회/기존 시도 폐기로 종료 안내를 반영한다. AP DB89449 28/28·Field DB17798 30/30 fail0/skip0 exit0, type18900/lint7378 exit0, native HTTP/320px6968 1/1 exit0. 독립 CLI13308 재리뷰 exit0에서 추가 지적 없음. 최신 mock68922 양제품 build/migrate/ready·독립 worker ready와 양 health를 확인했다. AP revoke 독립 원장/복원·Field route key/legacy·전체 문서 기능/QA/G·운영 RPO/RTO·실 공급사/MFA/사용자 최종 화면·동선은 남아 전체/C03 in_progress다.

## 최신 AP 자체 보존 기반 — d717532 이후 작업트리

- AP 자체 migration64/API/domain/관리자 UI: 승인 정책·불변 보류, 실제 종결/재개·legacy 이관, 익명 활동30/문의180/사진90 preview·AI/발송·지원·외부 미확인/미래 예약·기간과 hold를 구분한다. Field 내부/DB를 조회하지 않는다.
- 실제 PG17 AP DB **1325 27/27**, `/tmp/ap-retention-basis-final-db.log`; legacy63→64 별도 DB **1/1**, `/tmp/ap-retention-basis-migration-final.log`. 합성 fixture/임시 DB를 정리했다. 현재 revision 근거 없는 종결을 추정하지 않는다. 107개 metadata microsecond pagination의 중복/누락·cursor org binding을 확인했다.
- 최종 전체 type **61572**·lint **53746 exit0**; managed mock **92132** 양 API/웹 build/ready. AP native HTTP/Chromium320 **71697 1/1**, `/tmp/ap-retention-basis-final-http.log`: 실제 별도 운영자·ACK 유실 같은 요청 확인/단일 정책·승인/보류 해제·preview503/원장503 복구·조작 잠금·가로 넘침 없음/pageerror0. 시안 admin/audit와 실제 캡처를 열었다. 표준 AP E2E7개에 신규 legacy/HTTP 두 검사를 등록했지만 전체 E2E를 실행한 결과는 아니다.
- 미완료: 실제 AP 정리 요청/worker·private 원문/사진/AI/전달 제거·복원 증빙/회수·외부 업무 종결의 공개 계약 한계, Field route key 수명/legacy·운영 복구, 전체 PRD/역할/QA/G·실 공급사/MFA·최종 사용자 시각/동선 인수. 보존 기반과 미리보기는 실제 삭제 완료/전체 C03 Done이 아니다.

## 최신 Field 삭제 원장 누락 검증 — c809c28 이후 작업트리

- 실제 `pnpm test:db:field` **2217 30/30**, `/tmp/field-retention-checkpoint-final-db.log`, 임시 test/restore DB 제거. 기존 실제 PG17 dump/restore에서 missing directory·누락 entry·미대조 추가·checkpoint 변조는 원문/사진을 유지한 채 거절됐다. 별도 checkpoint export/restore CLI로 실제 삭제/원문 제거·반복0/재저장 거절과 기존 미확인 삭제 거절을 확인했다.
- CLI 안전한 대상 구분: 현재 DB localhost alias, active media symlink alias, 잘못된 local port, 원장 안의 checkpoint 출력을 실제 거절했다. 보호된 독립 원장/최신 checkpoint가 필수이며 둘의 동시 과거 교체·legacy 누락/운영 보관 근거는 별도다.
- 최종 typecheck **57849**, lint **78010**, Field API build **90668 exit0**. 새 CLI/복원 함수 변경으로 API/UI/migration/공개 계약 변경 없음. runtime **21041**을 유지하고 양 API ready를 실제 확인했다. 전체 HTTP/브라우저·AP DB/정식 QA/G는 반복하지 않았다. 직전 c809c28의 실제 reference/HTTP 검수와 구분한다.
- 남음: AP 자체 익명30/업무180/사진90 보존·종결/hold·정리/독립 worker/복원, Field route key 수명·legacy 회수 baseline/미확인 삭제 추가 대조·신뢰 checkpoint/원장 동시 과거 교체·운영 공급사 복구, 전체 PRD/역할/QA/G·최종 사용자 인수. 전체 C03/F09 완료를 주장하지 않는다.

## 최신 Field 권한 회수·격리 복원 — e28229f 이후 작업트리

- 실제 Field DB **8959 30/30**, `/tmp/field-revocation-complete-db.log`. 별도 PG17 test/restore DB와 테스트 전용 원장 정리. native 회수 3경로의 인증/반복·서명 실패·원장 실패503/DB rollback, AP ciphertext null/재활성화 거절, 늦은 token 발급/회수 경합을 확인했다.
- 실제 PG17 해제 전 dump→별도 restore, 기존 bearer 200→원장/CLI 적용→401·refresh 회수/동의 제거·원문/확인키 유지·반복0. checkpoint export 실제 CLI도 실행했다. 누락/변조/없는 전체 디렉터리/미대조 추가 entry·AP namespace 혼합·조직/선택 binding 오류 rollback·현재 DB localhost 별칭/잘못된 로컬 port CLI 거절을 확인했다. native 수신 회수 ID/ACK 중복을 복구하고, 백업 이후 원격 회수 intent fixture는 acked 대신 blocked 재대조로 남겼다.
- 실제 HTTP/320px **12875 1/1**, `/tmp/field-revocation-http-verified.log`: 기존 SDK·AP 원문/답변·동의/1회 handoff·수신 업무/예약/알림·Field 명시 회수/원격 장애 retry·AP 시작 회수/고객 기존 경로를 확인했다. 첫 **9294**는 실행 중인 event worker를 알리는 `FIELD_EVENT_WORKERS_RUNNING=1`이 없어 수동 전달이 empty였고 실패했다. 실제 worker 모드로 재실행했으며 ACK 기대값을 낮추지 않았다.
- 최종 typecheck **52968**, lint **45964**, Field build **73538 exit0**; native mock **21041** 양제품 API/웹 ready/Field retention worker ready. 기준 HTML admin/audit를 Chromium 320px로 열고 `/tmp/field-revocation-prototype-320.png`를 실제 확인했다. 이번 변경은 UI 코드 수정이 아니며 사용자 최종 시각/흐름 인수는 미검수다.
- 남음: 전용 route key 종료 수명·legacy 회수 baseline·신뢰 checkpoint/원장 동시 rollback, 기존 삭제 원장 전체 누락/미확인 삭제 결과 추가 대조·운영 보관/복원, AP 자체 보존/정리, 전체 PRD/역할/QA/G·실 공급사·사용자 최종 인수. C03/F09 전체는 in_progress다. 전체 AP DB/표준 E2E/security/independence 명령을 이번 변화로 다시 실행하지 않았다.

## 최신 Field 정리 실행 — c87f14f 이후 작업트리

- 최종 실제 Field DB: **56067 29/29**, `/tmp/field-retention-phase-db-final.log`, 별도 임시 DB 제거. 공개 문의/실제 사진→요청·별도 승인·멱등/권한·파일 실패 재시도·증빙 ACK 실패와 재기록, 원문/파일 부재·receipt/export·DB 재저장/지원 거절, 지원 승인과 삭제의 실제 경합, 예약 원문/이벤트 사유/달력 label·수신 snapshot/늦은 답변, 사진 scope 원문 유지·승인 후 hold, 늦은 복사 claim의 파일 재쓰기0회, Field 환경만으로 standalone worker 실행을 확인했다.
- 실제 복원: 위 DB 검사에서 정리 전 isolated DB의 PG17 dump를 별도 임시 DB에 restore하고 별도 경로에 실제 사진을 복원했다. 서명 원장 재적용 후 파일 부재/원문 제거·tombstone 재저장 거절·반복 적용0, 미확인 intent/손상 서명 거절을 확인했다. 운영 revoke/전체 원장 유실·실 RPO/RTO는 이 검사가 아니다.
- 실제 native HTTP/320px: **73367 1/1**, `/tmp/field-retention-jobs-final-browser.log`. 관리자 요청 ACK 유실/동일 요청, 승인 전 취소·다른 운영자 승인·독립 worker actual deletion/부재·고객 종료 안내/추가 질문 종료, job 원장503 metadata 유지/잠금/복구와 기존 정책/hold/preview/수신 종결 회귀를 확인했다. 가로 넘침/pageerror0. 기준 HTML admin/audit와 `/tmp/field-retention-jobs-320.png`, `/tmp/field-retention-ended-customer-320.png`를 실제 열었다. 전체 시각 인수는 미검수다.
- 전체 typecheck **58010**, lint **99020 exit0**; Python/Node 구문·diff exit0. mock **54477** 양제품 API/웹 build/ready·Field worker ready/합성 completed를 실제 확인했다. 표준 Field E2E7개 중 이 HTTP 검사만 실행했으며 전체 명령/AP DB/전체 회귀/정식 QA/G는 미실행이다.
- 남음: Field revoke 복원·원장 전체 유실/미확인 결과 대조/운영 복구, AP 자체 보존·정리, 전체 명세/역할·G 검수, 실 공급사·법무/MFA·사용자 최종 인수. C03 전체 완료를 주장하지 않는다.

## 최신 Field 보존 기반 — a13510e 이후 작업트리

- 실제 검수: `pnpm test:db:field` **28/28,93261**(`/tmp/field-retention-pagination-green.log`, 임시 DB 제거); `node --test tools/spikes/field-retention-migration.test.mjs` **1/1**(`/tmp/field-retention-migration.log`,58→실제 legacy 자료→59·별도 DB 제거).
- 실제 native HTTP/320px: `FIELD_BROWSER_PYTHON=/tmp/fieldai-ui-venv/bin/python node --test tools/spikes/field-retention-http.test.mjs` **1/1,36901**(`/tmp/field-retention-recovery-browser.log`); 기존 Field 관리자 **1/1,87655**. 현재 mock85257 양제품 API/웹 build/ready·웹200, 실제 시안 admin/audit와 새 캡처 확인.
- 범위: 정책/다른 승인/immutable 기간·권한/Origin·ACK, 종결/재개·legacy unknown, 미래 예약/수신 예약 원본 기준·양방향 hold/검토 초과, pending 원문 전달·복사/현재 지원 승인, terminal 예약 새 메시지의 활동 시각, 개인정보 없는100개+microsecond cursor105개/조직 binding, preview/원장503 실패 폐기·metadata 유지/잠금/복구, 수신 업무 종결 ACK 복구·원본/확인키 보존·가로 넘침/pageerror0.
- 최종 전체 typecheck37941/lint57228 exit0, 마지막 테스트 타입/등록 ESLint5493·Python/Node 구문/diff exit0. 표준 Field E2E7개 등록 뒤 전체 명령은 이번 변경으로 미실행이다. 아래 a023c67 기록을 현재 전체 회귀 검사로 확대하지 않는다.
- 필수 남음: 실제 정리 job/worker·파일/원문 개인정보 제거 및 소비자 복원/삭제·revoke 원장 재적용, AP 자체 보존 기능·전체 PRD/QA/G. 운영 MFA·법무·실 공급사·사용자 최종 시각/동선은 미검수다. 180/90은 검토 제안이며 mock 정책 승인을 법무/출시 승인으로 주장하지 않는다.

## 범위

- 검사 코드 커밋: `a023c67` (`Recheck Field AP connection and installed deployment state`). 이후 변경은 이 검수 기록이다.
- 환경: 로컬 `mock`, Node 24/pnpm, 제품별 PostgreSQL 17, Field Valkey, Chromium 합성 계정/업무. AP와 Field의 원장·자격증명·세션은 분리한다.
- 시안: `/Users/jr/Desktop/projects/FieldAI/reference/field_ui_prototype_v3.html`.
- 목적: 현재 명령에 포함된 실제 기능·저장·권한·독립성 경로를 확인한다. 전체 요구 완료와 실 공급사/출시 승인의 증거는 아니다.

## 실제 실행 결과

| 명령 | 결과 | 확인 범위 |
|---|---|---|
| `pnpm lint` | exit 0 | 현재 코드 정적 규칙 |
| `pnpm typecheck` | exit 0 | 양제품 API/웹 타입 |
| `pnpm test:unit` | exit 0 | API 각 3개, AP 웹 10개, Field 웹 14개, tools 7개 |
| `pnpm test:db:agent` | 21/21, exit 0 | 별도 임시 AP DB의 도메인/권한·원본·배포·알림 원장·구독 체험. 임시 DB 제거 확인 |
| `pnpm test:db:field` | 21/21, exit 0 | 별도 임시 Field DB의 카탈로그/사이트·직접 문의/예약·충돌·권한·체험. 임시 DB 제거 확인 |
| `pnpm test:contracts` | exit 0 | 공개 OpenAPI 정적 2개와 AP/Field 제공자·소비자 DB 5개 |
| `pnpm test:integration:faults` | exit 0 | 공개 계약, 제공자/소비자 장애 DB, 실제 양제품 HTTP/worker 전달 |
| `pnpm test:e2e:agent` | 3/3, exit 0 | 320px 사업자→상담 링크/외부 위젯→비회원 문의/답변, 매체 조직 복구, 별도 관리자 경로/권한 |
| `pnpm test:e2e:field` | 3/3, exit 0 | 320px 사업자→사이트 공개→직접 문의/두 예약 방식, 자동 저장/공개 경계, 별도 관리자 경로/권한 |
| `pnpm test:e2e:distribution` | 2/2, exit 0 | 매체 조직 복구, 카드 배치→Field 요청/예약·서명 사건·알림 경로·해제/직접 연락·집계 |
| `pnpm test:security` | exit 0 | 직접 cross-product import 차단, 교차 DB 자격증명 거부, 제품별 권한 DB, tenant 공개 경로, 관리자 감사/권한 |
| `pnpm test:independence:agent` | exit 0 | Field 프로세스/DB/Valkey/비밀값 실제 부재에서 AP 가입·승인·외부 위젯·접수/답변/체험 및 320px owner/customer 흐름 |
| `pnpm test:independence:field` | exit 0 | AP 프로세스/DB/비밀값 실제 부재에서 Field 가입·승인·사이트·접수/답변/두 예약·체험 및 320px owner/customer 흐름 |
| `pnpm build:agent`, `pnpm build:field` | exit 0 | 독립 실행 검사와 mock 복구 과정에서 실제 API 빌드 |
| `pnpm build:web:agent`, `pnpm build:web:field` | exit 0 | 독립 실행 검사와 mock 복구 과정에서 실제 Next 빌드 |

독립성 검수 전 전체 mock PTY를 종료하고 상대 compose 컨테이너를 `stop`했다. 볼륨을 삭제하지 않았다. 검사 후 `pnpm mock:run` PTY **53283**으로 양제품 build/ready를 복구했다. 최종 AP 웹 `http://localhost:3001/workspace`, Field 웹 `http://localhost:3002/workspace`의 HTTP 200과 API `127.0.0.1:4311`/`4321`의 제품별 `status:ready`를 실제 확인했다. 세션이 종료됐는지는 HTTP로 먼저 확인한다.

## 문서 대조 결과와 후속 구현

| 요구 | 현재 증거 | 다음 구현 범위 |
|---|---|---|
| Field PRD 3.8: AP 장애 뒤 새 직접 요청의 `fallback_origin`·관계·ID 기반 중복 후보, 전화번호 자동 병합 금지 | 2026-09-26 후속 구현: migration 000055, Field 문의/예약 저장·권한·내보내기, 고객 명시 입력과 사업자 후보 이동. 새 DB 3개 red→전체 Field 24/24. 320px 실제 문의·두 예약·후보 문의/예약 이동·503 재시도 exit 0. 후보는 고객 선언과 같은 Field 조직 수신 ID 대조일 뿐 장애/중복 확인이 아니다. | 마지막 시각 검토로 추가한 후보 버튼 CSS는 다음 mock build 반영. 전체 AP 실제 장애·전체 역할/정식 QA/G와 사용자 최종 인수는 기존 미완료 범위로 유지. |
| AP PRD 2.5: 대표 상담 링크 QR 제공 | 2026-09-26 후속 구현: `AgentConsultQr.tsx`, 활성 링크의 browser PNG 생성/다운로드. 버튼 부재 red→AP 표준 E2E 3/3, 좁은 사업자 HTTP 1/1에서 canvas 실패/재시도·PNG와 실제 320px 표시 이미지의 jsQR 해독·원래 공개 URL·배포 pause 404/re-activate 확인. AP web typecheck/lint/build exit 0. Field 재접수 CSS도 mock 1112 빌드 반영/320px 확인. | 실 휴대전화 카메라·종이 인쇄·사용자 최종 시각/전체 QA/G는 미검수. 외부 QR 서비스·비밀값/고객 정보 전송 없음. |
| C03 고객 표시 상태: 카탈로그 조회 완료와 미등록 값 구분 | 2026-09-26 red→mock 44403의 320px 브라우저 exit 0. 지연/정상 빈 값/404/503·네트워크 실패·재시도, 대상 있는 헤더 링크, 기존 문의·두 예약·후보 흐름 확인. Field web typecheck/lint/build exit 0. | API/DB 변경 없음. 사용자 최종 화면 인수·전체 QA/G는 미검수. |
| AP PRD 2.7: spam 상태는 보존과 별도로 발송 중단 | 2026-09-26 AP migration 000061/owner revision 분류·해제·원본/후속/사진/메모 보존·알림 중단. AP DB 22/22(권한/멱등/경합/감사/내보내기·위임 답변 거절·Field 예약 사건), Field DB 24/24(확정 거절 초안 보존), mock 17560의 AP 사업자 HTTP/브라우저 1/1·양제품 HTTP/브라우저 1/1. Field 화면 spam은 기존 실제 원본 응답의 상태만 주입한 소비자 검사다. typecheck/lint/build exit 0, AP 320px 캡처 확인. | 실 발송 공급사/사용자 최종 인수/전체 QA/G는 미검수. 스팸은 현재 동의 완료 human 상담 원본 대상이며 익명 AI 상담 분류를 구현했다고 주장하지 않는다. |
| AP PRD 2.2 순서 3: native 지역·영업시간 등록 | 2026-09-26 AP business/agents·workspace/public에 선택 native 값을 연결했다. AP DB red→23/23(값 검증/권한/PATCH 보존/승인 전후·구버전 불변 JSONB·owner/customer AI 승인 근거), mock 29076의 320px 사업자 HTTP/브라우저 1/1·자동 저장 HTTP/브라우저 1/1(지역만 바뀐 응답 분실/409, 시간만 바뀐 서버 선택·공개 유지). typecheck/lint/build exit 0. 시안 owner/agent-knowledge 직접 확인. | Field 사실과 자동 병합하지 않는다. 전체 시각/동선·사용자 최종 인수/실 LLM·전체 QA/G는 미검수. |
| Field PRD 3.6: 수신 snapshot 목적·출처·시각·보존기간 | 2026-09-26 migration000056·received-work-record와 원장/상세/exports. Field DB red→24/24(문의/예약 목적·동의·제안180/90·멱등/해제/내보내기·legacy null·목적/JSON null 거부), mock2217 양제품 HTTP/브라우저 1/1(320px 문의/예약 표시·기존 원본/답변/해제/알림). typecheck/lint/build exit 0·320px 캡처 확인. | 정책 상태는 proposed다. 종결시각/보존 연장/자동 정리·법무/운영 정책·공급사·사용자 최종 인수/전체 QA/G는 미완료다. |
| Field PRD 3.2: 셀프 제작 첫 사업 정보의 업종 입력 | 2026-09-26 Field 자체 입력·서버 초안·승인·공개 표시·제작 snapshot 연결. Field DB25/25, 렌더2/2, mock88953 자동 저장/320px1/1·사업자→공개/직접 문의/두 예약1/1. 업종만 수정한 응답 분실/409 두 선택·구버전 보존/미등록·승인본 유지, typecheck/lint/build exit0. 시안 create/business 직접 대조. | AP 공개 facts 계약을 늘리지 않았다. 실제 제작 LLM·전체 시각/흐름·운영/전체 QA/G는 미검수다. |
| Field PRD 3.9 F-A06·QA48/49: 신고/이의 처리·승인 접근 | 2026-09-26 migration000057와 native 신고/공개 snapshot·다른 operator 승인/기간 접근·감사/검토·사이트 제한·사업자 내부 알림/이의/결정/제한 해제. Field DB26/26(session98497), mock46010의 신고 HTTP/320px15625 1/1·기존 관리자19942 1/1, tenant/렌더3/3, typecheck/lint exit0. 자기 승인/auditor/타 actor·타 신고/만료/권한 회수 차단, 다중 제한/원본·신규 직접 접수 유지·멱등/응답 분실·당시 서비스/FAQ/본문·알림 읽음/이동 확인. | 일반 고객 대화·사진의 지원 열람/운영 MFA·신고/이의 정책·법정 보존/복구와 원래 client-IP reverse-proxy 검수는 미완료다. 로컬 peer 기반 신고 한도는 접속자를 합쳐 제한할 수 있다. 표준 Field E2E에 등록했으나 등록 뒤 전체 세트는 미실행이며 이 좁은 결과로 전체 QA49/G를 통과 처리하지 않는다. |
| AP PRD 2.9 AP-A06·QA48/49: AP 신고/이의 처리 | 2026-09-26 migration000062와 native 신고/공개 whitelist snapshot·다른 operator 승인/기간/현재 권한 접근·검토/감사·배포별 hold·owner 내부 알림/읽음/이의/결정. AP DB24/24(session33270), mock10988 신고 HTTP/320px32096 1/1·기존 관리자9826 1/1, typecheck2626/lint17406/build exit0. 실제 PG17 신규 위젯 접수 경합·AI 최종 응답 거절, 복수 hold/owner pause·기존 원본/위젯 사람 인계·직접 접수/다른 배포·기존 고객 새로고침/무권한 복원 차단·ACK 분실/재시도·알림/320px 가로 넘침 확인. | 일반 고객 대화/사진 지원 열람·운영 MFA/IP 신뢰·보존/정리·실 공급사/정식 QA/G/사용자 최종 인수는 미완료다. 원래 peer 기반 신고 한도는 여러 접속자를 합칠 수 있다. 표준 AP E2E4개에 등록했지만 전체 명령은 등록 뒤 미실행이다. 신고 grant는 고객 원문 권한이 아니다. |
| 시안 고객정보 열람 요청·QA49·보안 문서5.3: AP 문의별 승인/사유/기간/감사의 원본 지원 접근 | AP 문의별 native grant/감사·목적/참조/사유·conversation/contact/photos·다른 운영자 승인/기간·현재 양 운영자 membership·회수/만료·header 사진/읽기 뒤 재확인·성공 읽기 감사를 구현했다. AP DB25/25(session86324), 최종 typecheck48647/lint11371 exit0, mock75745 HTTP/320px22877 1/1(ACK 분실·scope별 원본·내부 메모 비노출·실제 사진·queue503 복구·회수/실제8초 기한 폐기·가로 넘침/pageerror0), 기존 AP admin1988 1/1. 시안 request-access 모달 직접 확인. | Field 자체 지원 접근은 아래 행의 별도 native 원장으로 구현했다. AP 원본은 AP 공개 계약만 이용한다. AP의 접수 전 익명 AI 원본은 이 문의 grant 범위가 아니다. 운영 MFA·고객 요청 진위·보존/전체 QA49/G·사용자 최종 시각/동선은 미완료. AP 지원 queue100개+cursor/감사 최근100개, 표준 AP E2E5개 등록 뒤 전체 명령 미실행. 신고 grant/관리자 토큰만으로 고객 원문을 열지 않는다. |
| Field PRD3.6/3.7/3.9 F-A06·QA49: 직접 문의/예약/수신 업무별 지원 접근 | Field migration000058·자체 grant/감사, 업무 종류/ID+org FK·대화/제출/연락처·지역/사진 scope·다른 운영자 승인/최초 기한·현재 양 운영자 권한·회수/만료·파일 읽기 후 재확인. 실제 DB27/27(session15725), 최종 typecheck88434/lint82464 exit0, mock99529 HTTP/320px10485 1/1(업무3종·ACK 분실/동일키·queue503 상세 폐기/목록 유지/복구·scope별 원본/내부 메모 제외·실제 사진/복사 대기 안내·회수/실제8초 종료·원본/점유 보존·가로 넘침/pageerror0), 기존 Field admin10054 1/1. 시안 request-access 모달과 실제 예약/수신 상세 캡처 확인. mock loopback Origin 불일치를 red→green으로 수정하고 외부 Origin 거부를 유지한다. | AP 원문/내부 코드를 조회·복제하지 않는다. Field가 이미 받은 요약/허용 request 필드와 이미 복사된 사진만 읽으며 pending 첨부는409다. 운영 MFA/고객 요청 진위·법정 보존·전체 QA49/G·사용자 최종 시각/동선은 미검수. queue100개+cursor/감사 최근100개, 표준 Field E2E5개 등록 뒤 전체 명령 미실행. 다음 내부 작업은 보존/정리·분쟁 hold와 전체 PRD 누락 대조다. |

이는 전체 PRD의 기능 누락 목록을 완성한 것이 아니다. 현재 표준 검사에서 확인한 경로와 이 문서 대조에서 직접 확인한 누락을 기록한다. 다른 문서 요구는 구현/증빙을 계속 대조해야 한다.

## 계속 남은 검수

- 사용자 최종 시각·동선 인수, 원본 시안과 모든 역할/화면의 대조, 전체 키보드/스크린리더·실 브라우저 200% 확대.
- 실 인증·LLM·카카오/문자/푸시·독립 결제·운영 DNS/TLS·실 객체 저장소/악성코드 검사·백업/보존 정책. 해당 공급사/운영 검수는 `blocked_integration` 또는 미검수이며 로컬 mock 성공으로 통과 처리하지 않는다.
- 정식 QA/G의 실기기·운영 장기 장애·구버전 consumer·복구/보존 증빙. C03과 A/F/I/D 완료/출시 승인은 아직 미증명이다.
