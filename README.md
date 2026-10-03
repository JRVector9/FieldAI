# 독립 AI 플랫폼 × Field — 최종 개발 계획 v3.0

## 시작 파일

- **AI_Field_Service_Operator_Final_Development_Plan_v3.0.md**: 모든 제품 명세·연동 계약·작업·검수·에이전트 지침을 합친 최종본.
- **FINAL_DEVELOPMENT_REPORT_v3.0.html**: 동일 내용의 목차·검색·인쇄를 갖춘 읽기용 보고서. 제품 UI 시안이 아님.
- **AGENTS.md / TASKS.md**: 개발 에이전트 작업 규칙과 46개 작업/선행 조건.
- **docs/**: AP, Field, 연동, 운영, UI 이관, 160개 인수 항목의 분할 원문.
- **contracts/**: 문서 계약의 JSON Schema·합성 예제·작업/QA 카탈로그와 AP/Field 공개 API OpenAPI 미리보기. 양방향 운영 계약은 미완성.
- **CHANGELOG_v3.0.md**: 이전 통합 구조에서 두 독립 제품으로 바꾼 내역.
- **quality_checks/**: 이번 문서 패키지의 실제 검사 기록. 실서비스 QA와 구분.

## 가장 중요한 원칙

AP를 제품으로 먼저 독립 검증한다. Field는 공식 외부 클라이언트이며 상대 DB·로그인·도메인 코드에 직접 접근하지 않는다. Field도 AP 없이 홈페이지·일반 문의·예약·자체 제작 AI를 운영한다. 기본 상담 위젯과 광고/매체 기능의 출시를 분리한다.

기존 PRD v2.0·통합 AGENTS/TASKS는 이력 자료다. 이 v3.0과 충돌할 때 공유 DB·공통 권한 구조로 돌아가지 않는다. 기존 UI v3의 화면 스타일은 참고할 수 있지만 두 독립 제품으로 업데이트된 시안이라고 오인하지 않는다.

## 첫 개발 지시

AGENTS.md의 첫 실행 프롬프트로 저장소 현황을 확인하고 C00부터 진행한다. AP/Field 트랙은 C01 계약과 C02 격리 환경 후 병렬 진행할 수 있다. A11과 F11은 서로를 기다리지 않는다. I08은 공식 연결, D05는 AP 매체 확장, R02가 전체 Suite 인수다.

가격·실제 브랜드·운영 도메인·구체 라이브러리 버전·외부 공급사 계약은 환경/정책·게이트에서 잠근다. 문서의 제안값을 고객의 확정 요금이나 승인된 계약으로 사용하지 않는다.

## 현재 화면 검토본

2026-09-25 현재 `apps/agent-web`과 `apps/field-web`은 별도 Next 앱이다. AP 사업자·고객·매체·관리자 22개, Field 사업자·고객·관리자 30개 역할별 **미리보기 경로**는 `design_preview`다. 로컬 mock에서는 두 제품 홈의 `작업 시작`이 각각 실제 `/workspace`로 이동하고 `화면 둘러보기`는 비저장 시안을 연다. `APP_PROFILE=design_preview`에서는 시안만 기본 진입으로 표시한다. `/workspace`와 Field 사이트·문의·예약 경로의 부분 기능은 별도 실제 로컬 API/DB에 연결했다. 화면 상태와 검수 범위는 `docs/technical/PHASE_2_UI_REVIEW.md`에 있다.

```bash
pnpm install --frozen-lockfile
pnpm build:web:agent
pnpm build:web:field
APP_PROFILE=design_preview pnpm --filter @fieldai/agent-web start # localhost:3001
APP_PROFILE=design_preview pnpm --filter @fieldai/field-web start # 별도 터미널, localhost:3002
```

두 제품 간 이동 주소가 localhost가 아닌 경우 빌드 전에 `NEXT_PUBLIC_AGENT_WEB_URL`, `NEXT_PUBLIC_FIELD_WEB_URL`을 설정한다. `APP_PROFILE=live`에서는 이 검토본 빌드가 실패한다. 실제 서비스 기능·운영 배포는 후속 단계다.

## 로컬 기능 작업 환경

AP의 `/workspace/campaigns`에서 홍보 카드를 공개하고 활성 매체 위치에 배치를 요청한다. `/publisher`에서는 별도 매체 조직·도메인·광고 위치를 관리하고 정확한 카드 버전의 배치를 승인·거절·중지한다. 매체 위치 활성화에는 DNS 소유 확인이 필요하다. 승인된 배치의 매체 owner는 정확한 origin용 외부 기사 설치 코드를 발급한다. AP iframe 카드의 질문·희망 조건은 한 번 쓰는 인계 ticket으로 AP 상담 화면에 전달되고, 고객 동의 후 AP 원본 문의에 배치 ID를 기록한다. `/placements/[id]`는 설치 코드 발급 후 상담 링크가 열리는 AP 미리보기다. 로컬 분리 origin 브라우저에서 검수했으며 실제 제휴 매체 도메인·TLS는 아직 검수하지 않았다.

사업자 `/workspace/campaigns`와 매체 `/publisher`에는 AP가 기록한 상담 시작·동의 접수의 주별 성과를 표시한다. 완료된 UTC 주의 5건 미만은 감추고 나머지도 구간으로 표시하며 CSV에 동일한 값만 내보낸다. 미리보기·명시 테스트·식별된 봇과 출처가 불명확한 과거 문의는 집계에서 제외한다. Field 연결 예약의 서명 사건을 AP가 처리한 경우 최초 확정도 구간 집계하며, 미연결이면 미지원으로 표시한다. 매출·수금은 측정하지 않는다. 실제 운영 트래픽의 봇 방어·차분 공격과 정식 개인정보 검수는 남아 있다.

AP의 조직·사업 지식 승인·비회원 직접 문의·사업자 답변·홍보 카드 초안/공개/중지와 Field의 조직·서비스 승인·사이트 공개·직접 문의·예약 요청/확정·사업자 처리 알림/읽음은 실제 PostgreSQL 17에 저장된다. Field 서비스는 기본 예약 방식을 상속하거나 자체 방식을 고를 수 있고 공개 승인 때 실제 방식이 고정된다. DST 전환 시간표의 반복 시각은 GMT offset으로 구분한다. AP 문의와 Field 문의·예약의 비회원 확인키를 같은 원본에서 15분 내 5회 잘못 입력하면 각각 15분간 429로 차단한다. 고객은 원본을 연 뒤 새 키를 보관하고 기존 키를 폐기·교체할 수 있다. 두 제품은 별도 DB·계정·API·웹을 사용한다. Field 알림은 현재 관리실 내부 목록이며 고객 카카오·문자·푸시 발송은 공급사 연결 전 `blocked_integration`이다. 아래는 **로컬 mock 기능 검수용** 실행 순서다.

AP 직접 지식과 Field 사업정보·사이트 편집 초안은 서버 revision을 사용해 약 1초 뒤 저장한다. 빈 필수 정보는 비공개 초안에 보존하지만 공개 승인은 완성 뒤 별도로 수행한다. 오프라인·실패·동시 편집 충돌은 저장 완료로 표시하지 않는다.

AP 상담 링크에서는 모델 공급사가 설정되지 않아도 고객이 질문을 사람 문의로 제출할 수 있다. AI 답변 실패를 표시하고 질문을 수정 가능한 문의 내용에 남긴다. 고객 동의 후 같은 AP 문의 화면에서 연결된 Field 사업장에 별도 문의/예약 요청을 선택할 수 있으며, 현재 조건과 별도 전달 동의를 확인한다. 연결이 없는 AP 문의에는 Field 요청 화면이 나타나지 않는다. 로컬 mock의 이 흐름은 실제 AI 답변·고객 외부 알림·예약 확정을 의미하지 않는다.
AI 질문을 건너뛰고 상담 링크에서 바로 사람 문의를 제출해도 활성 배포의 동일 AP 원본과 Field 연결을 사용한다. AI 질문과 사람 제출을 거의 동시에 시작할 때는 상담 세션 생성을 공유한다. 조직의 `/public/{id}` 직접 문의는 별도 AP 자체 접수다.

Field의 로컬 `field-<slug>.localhost:3002` 주소는 해당 사업장의 승인 사이트·공개 문의/예약 시작 화면에 귀속된다. 다른 사업장 공개 화면이나 플랫폼 관리실은 이 주소에서 404이며, 확인키로 여는 기존 문의·예약 재방문 화면은 유지한다. 실제 사업장 DNS/TLS는 아직 운영 검수를 거치지 않았다.

로컬 mock을 처음 시작하거나 다시 띄울 때는 저장소 루트에서 다음 명령을 사용한다. 각 제품은 별도 PostgreSQL 17을 사용하고 Field만 별도 Valkey를 사용한다. 전체 실행은 환경 파일 준비·컨테이너 상태 확인·migration·빌드 뒤 두 API를 임시 기동해 양방향 로컬 OAuth client를 등록/검사하고, 새 설정으로 네 서버와 구성된 사건 worker를 시작한다. 실제 조직 연결과 양쪽 owner의 scope 동의는 각 제품 화면에서 진행한다. 모델 설정이 없으면 Field 제작 AI worker는 `blocked_integration`으로 남고 사이트 직접 편집·문의·예약은 계속된다. Ctrl+C는 이 명령이 띄운 프로세스만 종료하며 DB/큐 데이터 볼륨을 삭제하지 않는다. 이미 3001/3002/4311/4321 포트가 사용 중이면 기존 프로세스를 건드리지 않고 오류를 표시한다.

```bash
pnpm install --frozen-lockfile
pnpm mock:run
```

AP만 또는 Field만 실행할 때는 각각 `pnpm mock:run:agent`, `pnpm mock:run:field`를 사용한다. 단독 명령은 반대 제품의 OAuth client를 등록하거나 반대 제품을 기동하지 않는다. 브라우저에서 AP는 `http://localhost:3001/workspace`, Field는 `http://127.0.0.1:3002/workspace`로 연다. 두 호스트를 구분해야 독립 로그인 쿠키가 충돌하지 않는다. 아래 `setup:mock:*` 명령은 수동 기동 경로에서 필요하다. 운영 배포와 공급사 검수는 이 mock 명령에 포함되지 않는다.

조직을 만든 뒤 AP `http://localhost:3001/workspace/usage`, Field `http://127.0.0.1:3002/workspace/usage`에서 이번 UTC 월의 제품별 AI 호출·문의·예약 기록을 볼 수 있다. 공급사 응답 ID와 토큰이 기록된 호출의 토큰 합계만 표시한다. 이 수치는 가격·크레딧·청구액이 아니며 승인된 플랜/결제 공급사 연결 전에는 결제 성공으로 표시하지 않는다.

로컬 mock에서 AP `http://localhost:3001/workspace/subscription`, Field `http://127.0.0.1:3002/workspace/subscription`은 각각 별도 DB의 카드 없는 14일 체험 상태를 보여준다. 조직 owner가 안내를 확인하고 명시 동의한 뒤 1회 시작·종료 예약할 수 있다. 종료 예약은 남은 체험 기간을 유지하고 자동 유료 전환은 없다. 만료 후 새 AP 상담·문의·배포·홍보와 새 Field 사이트·문의·예약 접수는 거부하고, 기존 문의·예약의 열람·답변·처리·재시도·기록 내보내기와 연결 해제는 유지한다. 이 제안 체험과 제한은 운영 정책/요금 승인 전 로컬 mock 검수용이며, 유료 checkout은 `blocked_integration`이다. 실제 유료 정책과 전체 계정 정리/보존은 후속이다.

로컬 두 PostgreSQL 17이 준비된 뒤 `pnpm test:db:agent`와 `pnpm test:db:field`는 각각 자기 migration과 제품의 모든 `*.db.test.ts`를 실행한다. Field 명령은 실행 중인 Field 사건 worker와 테스트의 전달 큐가 섞이지 않도록 로컬 mock PostgreSQL에 임시 DB를 만들고 테스트 종료 때 그 DB를 정리한다. 기존 Field 서비스 DB와 서버는 계속 실행할 수 있다. `pnpm test:contracts`는 두 공개 OpenAPI 정적 검사 및 현재 양쪽 제공자·연결·업무 전달 소비자 DB 검사를 실행한다. 실패는 명령의 non-zero 종료로 전달된다. 이 명령들은 실공급사 계약·상대 서버 미배포 독립성·운영 보안/출시 게이트까지 통과했다는 뜻은 아니다.

`pnpm test:independence:agent`와 `pnpm test:independence:field`는 각자 상대 제품 mock 컨테이너와 API/웹/DB 포트가 **정지된 상태**에서 실행한다. 먼저 실행 중인 `pnpm mock:run`을 Ctrl+C로 종료하고, AP 검사 전에는 Field compose를 `stop`, Field 검사 전에는 AP compose를 `stop`한다. 명령은 자기 DB/인증만 준 별도 API와 웹을 띄워 가입·승인·직접 업무·mock 체험을 검사하며, 반대 제품이 실행 중이면 기존 서비스를 건드리지 않고 실패한다. 자기 DB 볼륨은 삭제하지 않는다. 검사가 끝나면 `pnpm mock:run`으로 전체 서비스를 다시 연다. 이 로컬 검수는 실모델·발송·결제·도메인/운영 네트워크 격리 출시 승인이 아니다.

수동 실행이 필요하면 다음 순서를 따른다.

```bash
node tools/setup-mock-env.mjs
docker compose --project-name fieldai-agent-mock --env-file infra/agent/.env -f infra/agent/compose.mock.yaml up -d
docker compose --project-name fieldai-field-mock --env-file infra/field/.env -f infra/field/compose.mock.yaml up -d --wait
node tools/run-migrations.mjs agent
node tools/run-migrations.mjs field
pnpm build:agent
pnpm build:field
pnpm build:web:agent
pnpm build:web:field
```

서로 다른 터미널에서 네 프로세스를 실행한다.

```bash
AP_PROFILE=mock node --env-file=infra/agent/.env apps/agent-api/dist/server.js
FIELD_PROFILE=mock node --env-file=infra/field/.env apps/field-api/dist/server.js
APP_PROFILE=mock pnpm --filter @fieldai/agent-web start
APP_PROFILE=mock pnpm --filter @fieldai/field-web start
```

Field 사이트 제작 AI를 실제 공급사와 사용할 때는 Field 전용 secret에 `FIELD_OPENAI_API_KEY`·`FIELD_OPENAI_MODEL`을 설정하고 별도 터미널에서 worker를 시작한다. API/웹은 worker나 Valkey 장애 중에도 일반 사이트·직접 문의·예약 readiness를 유지한다. worker가 없으면 제작 AI 작업은 대기 상태이며 성공으로 표시하지 않는다.

양방향 연결 예약 사건을 자동 전달하려면 두 제품의 독립 worker를 각각 실행한다. Field worker는 Field 예약 사건/outbox를 재조정해 연결별 키로 AP 공개 webhook에 서명 전달한다. AP worker는 durable inbox의 revision을 처리한다. 둘 중 하나가 중지되면 원장은 남고 자동 반영이 지연되며, 고객 확인키의 수동 `sync-events`도 사용할 수 있다. 실제 고객 알림 공급사는 아직 연결되지 않아 AP 원장 상태가 `blocked_integration`이다.

```bash
pnpm build:agent
pnpm build:field
AP_PROFILE=mock node --env-file=infra/agent/.env apps/agent-api/dist/field-event-worker.js
FIELD_PROFILE=mock node --env-file=infra/field/.env apps/field-api/dist/ap-event-worker.js
```

Field 사진은 로컬 mock에서 `FIELD_MEDIA_DIRECTORY`의 전용 파일과 Field DB 자산 원장에 저장된다. 사이트 편집의 사진 보관함에서 다시 선택할 수 있고, alt와 함께 초안을 저장한 뒤 공개해야 고객에게 보인다. `sandbox/live`에서는 Field 전용 `FIELD_S3_BUCKET`, `FIELD_S3_REGION`, `FIELD_S3_ACCESS_KEY_ID`, `FIELD_S3_SECRET_ACCESS_KEY`가 필요하며 S3 호환 공급사는 `FIELD_S3_ENDPOINT`를 추가한다. 공급사/버킷이 없으면 사진 경로는 `blocked_integration`이고 일반 Field readiness는 유지된다. 운영 버킷 권한·백업/복구·HEIC codec는 별도 검수 전이다.

Field 고객 문의 사진은 공개 사이트 사진과 분리된다. 로컬 mock의 `FIELD_INQUIRY_MEDIA_DIRECTORY`에 비공개 저장하고, `sandbox/live`에서는 `FIELD_INQUIRY_S3_BUCKET`, `FIELD_INQUIRY_S3_REGION`, `FIELD_INQUIRY_S3_ACCESS_KEY_ID`, `FIELD_INQUIRY_S3_SECRET_ACCESS_KEY`가 필요하다. S3 호환 공급사는 `FIELD_INQUIRY_S3_ENDPOINT`를 추가한다. 고객은 별도 접수 확인키, 사업자는 Field 조직 세션으로 원본 사진을 읽는다. 사이트 공개 자산 경로에는 노출되지 않는다. 입력 사진은 WebP로 정규화·EXIF 제거하며 메시지당 5장으로 제한한다. 보존 기간에 따른 파일 정리와 실제 S3/HEIC 환경 검수는 남아 있다.

AP 고객 문의 사진은 Field와 분리된 `AP_INQUIRY_MEDIA_DIRECTORY`(로컬 mock)에 저장한다. `sandbox/live`에서는 `AP_INQUIRY_S3_BUCKET`, `AP_INQUIRY_S3_REGION`, `AP_INQUIRY_S3_ACCESS_KEY_ID`, `AP_INQUIRY_S3_SECRET_ACCESS_KEY`가 필요하며 S3 호환 공급사는 `AP_INQUIRY_S3_ENDPOINT`를 더한다. AP 직접 문의와 AI 상담 후 사람 접수의 고객 메시지에 첨부하고, 고객 확인키 또는 AP 조직 사업자 세션만 읽는다. AI 질문·모델 입력·매체 경로에는 사진을 제공하지 않는다. 실 S3/HEIC 환경과 파일 보존·복구는 미검수다.

```bash
pnpm build:field
FIELD_PROFILE=mock node --env-file=infra/field/.env apps/field-api/dist/worker.js
```

- AP 작업: `http://localhost:3001/workspace`에서 로컬 계정→조직→지식 초안→승인→직접 문의함과 사업자 내부 처리 알림을 사용한다. `/workspace/ai`에서 AI 설정을 승인 지식 버전과 묶고 `/workspace/deployments`에서 독립 상담 링크/소유 사이트 위젯을 활성화한다. 링크와 위젯의 AI 질문·답변 후 사람 접수는 같은 AP 대화 ID에 저장하고 별도 확인키로 후속 대화를 연다. 직접/AI 인계 문의와 고객 추가 질문·사업자 답변/메모는 응답 분실 뒤 같은 입력으로 다시 제출하면 기존 원본을 복구한다. 고객은 사람 문의에 비공개 사진을 첨부하고, 사업자는 자기 조직 문의함에서 이를 열람한다. 사진 첨부 응답이 분실되면 같은 파일을 다시 첨부해 기존 사진을 확인한다. 위젯 설치 코드는 `inline`/`floating` 두 모드다. 고객 AI/사업자 테스트에는 `AP_OPENAI_API_KEY`와 `AP_OPENAI_MODEL`이 필요하며, 고객 AI의 일일 조직 한도는 `AP_CUSTOMER_DAILY_LIMIT`로 설정한다. 공급사 키가 없으면 AI 요청은 `blocked_integration`이고 직접 사람 문의는 계속된다. 소유 사이트 위젯은 운영 HTTPS origin의 DNS TXT 증명이 필요하다. 로컬 mock Field 사이트는 사업장별 `field-<slug>.localhost:3002` 주소에서 공개 증명값을 확인한다. 설치는 AP의 공개 `/sdk/v1.js` 계약을 사용한다. 사업자 답변은 고객 확인키로 열람할 수 있지만 외부 알림은 공급사 미연결 상태로 표시한다.
- Field 작업: 양방향 연결 검수에서는 `http://127.0.0.1:3002/workspace`에서 로컬 계정→조직→서비스 초안→승인→직접 문의함·예약 정책/요청/달력을 연다. AP는 `http://localhost:3001`을 사용한다. 브라우저 쿠키는 포트가 아닌 호스트 단위라 두 제품을 모두 `localhost`로 열면 개발용 로그인 쿠키가 충돌한다. `/workspace/site`에서 사이트 초안·디자인·페이지를 편집해 기본 주소에 공개한다. 승인된 사업 정보가 있으면 같은 화면에서 Field 제작 AI에 배치를 요청할 수 있다. `FIELD_OPENAI_API_KEY`와 `FIELD_OPENAI_MODEL`이 모두 필요하고, 없으면 `blocked_integration` 안내와 템플릿 편집 경로가 표시된다. AI 제안은 검토 후 초안에 적용하며 자동 공개되지 않는다. 승인 후 고객 링크에서 비회원 문의·예약을 접수하고, 각각 별도 확인키로 상태와 처리 기록을 조회한다. 직접 문의·후속 질문·사업자 답변과 예약은 응답 분실 뒤 같은 입력으로 다시 제출하면 기존 원본을 복구한다. 고객은 첫 문의나 후속 질문에 비공개 사진을 첨부하고, 사업자는 자기 조직 문의함에서 이를 열람한다. 사진 첨부 응답이 분실되면 같은 파일을 재첨부해 기존 사진을 복구한다. 사업자 내부 메모는 고객에게 공개되거나 알림으로 발송되지 않으며 같은 입력의 재시도로 원본을 확인한다. 예약은 사업자의 최종 확정 전까지 달력을 점유하지 않는다. 영업 종료 시각이 시작보다 이르면 다음 날까지 운영하며, 신청 뒤 승인 서비스 조건이 바뀌면 고객 확인키 화면에서 새 조건을 동의·재제출해야 확정할 수 있다.
- Field 사업자는 예약 상세의 **이 예약 기록 JSON 다운로드**에서 기존 예약 한 건의 스냅샷·처리 사건·Field 알림 상태를 보관할 수 있다. AP 연결 예약에는 Field가 수신한 출처 식별자·요약만 포함되며 AP 대화 원문은 포함되지 않는다. 로컬 mock 체험 만료 뒤에도 기존 기록을 내려받을 수 있다.
- 양방향 연결: `pnpm mock:run`은 로컬 client 등록과 API 재기동을 수행한다. 수동으로 두 API를 띄운 경우에만 `pnpm setup:mock:ap-connector`와 `pnpm setup:mock:field-connector`를 차례로 실행하고 두 API를 재시작한다. 등록 도구는 각 제품의 client secret·token 키를 해당 제품의 무시된 `.env`에 저장한다(권한 600, secret 출력 없음). Field 웹 origin은 `http://127.0.0.1:3002`다. Field owner는 `http://127.0.0.1:3002/workspace/integrations`에서 AP 조직·AI를 승인하고, Field 연결 기록의 링크를 통해 AP owner가 `http://localhost:3001/workspace/integrations`에서 Field 사업장 정보 제공에 별도로 동의한다. 두 제품의 token은 각 서버/DB에만 암호화해 보관하며, 두 동의 뒤 상태는 `review_required`다. `pnpm test:spike:ap-field:http`는 별도 두 로컬 서버의 실제 양방향 HTTP code 교환·bind와 만료 AP access token의 refresh rotation을 검사한다. mock 외 환경은 HTTPS `web` client와 운영 심사가 필요하다. 연결 기능의 정식 QA·공급사 발송·운영 장애 복구 검수는 남아 있다.
- 두 웹과 API가 실행 중일 때 Python Playwright가 준비된 로컬 환경에서는 `<venv>/bin/python tools/spikes/ap-field-connection-browser.py`로 320px 두 동의 화면을 검수할 수 있다. 스크립트는 로컬 mock DB 주소를 확인한 뒤 합성 계정·조직을 만들고 종료 시 삭제한다.
- AP 연결 화면은 현재 Field 공개 카탈로그를 AP owner에게만 `pending_review`로 보여준다. 만료된 AP 보관 Field token은 Field 공개 OAuth endpoint에서 갱신한다. 조회 내용은 AP 승인 지식이나 고객 AI 답변으로 자동 반영되지 않는다. `pnpm test:spike:ap-field:http`는 양쪽 만료 token 회전과 AP 검토 조회를 로컬 두 서버에서 검사한다.
- 현재 연결 화면의 「Field 승인 정보 가져와 검토」는 조회한 공개 사실을 AP 전용 source snapshot에 `pending_review`로 저장한다. 「보관된 검토 자료 열기」는 Field 연결 장애가 있어도 AP owner가 저장본을 확인한다. 같은 source 버전의 다른 hash는 `integrity_conflict`로 격리한다. 원장 저장만으로 AP 고객 상담·가격 안내는 바뀌지 않는다.
- AP owner는 보관된 Field 원본 revision과 서비스를 확인한 후 출처를 승인하고, 사업 소개·서비스 설명 중 공개할 항목을 명시 선택해 AP KnowledgeRelease를 만들 수 있다. 새 지식 공개 뒤 AI 설정에서 새 버전을 별도 승인해야 고객 AI가 사용할 수 있다. Field 가격·영업시간·예약 조건은 정적 AI 근거에 넣지 않으며, 출처가 바뀌거나 24시간 이상 확인되지 않으면 Field 설명도 근거에서 제외한다.
- AP 연결 화면의 「Field 지원 기능 확인」은 등록된 양방향 OAuth grant로 Field 공개 `/integrations/v1/capabilities`를 조회한다. 현재 계약 1.0은 동의한 사업 정보·가용성 조회·외부 요청 수신·고객 예약 인계와 제안 응답(`proposal.respond`)을 표시한다. 기존 grant는 자동 확대되지 않으며 새 scope는 Field owner의 재동의가 필요하다. 로컬 mock client에 새 scope가 추가된 뒤에는 기존 연결을 해제하고 다시 연결해야 새 scope가 grant에 들어간다. 조회 실패나 계약 버전 불일치는 연결 성공으로 표시하지 않는다. `pnpm test:spike:contracts:field`와 `pnpm test:spike:ap-field:http`가 제공자 계약과 실제 AP 소비자 왕복을 검수한다.
- AP 고객이 이미 접수한 대화의 별도 확인키로 `/inquiry/{id}`를 열면 연결된 Field 서비스의 현재 조건을 조회하고 고객 연락처·가격·시간·수신 사업장·전달 항목에 명시 동의해 문의/예약 요청을 보낼 수 있다. AP ActionRequest와 Field 예약은 별도 원장이며 Field의 요청 접수는 예약 확정이 아니다. 응답 분실은 원래 요청 ID로 재조회·동일 본문 재전송한다. accepted 예약 고객은 AP에서 5분짜리 1회 코드를 발급받아 Field `/handoff`에서 독립 예약 확인키로 교환한다. Field 사업자는 전달된 문의를 별도 목록과 내부 알림에서, 외부 예약은 기존 예약함에서 확인한다. 연결을 승인한 Field owner는 새 `ap.conversations.reply` 동의 뒤 같은 화면에서 AP 원본을 읽고 답변한다. 연결 예약 후속 사건은 Field→AP 서명 webhook/양쪽 worker로 AP 원장에 반영하고, 수동 조회도 유지한다. AP가 고객 알림을 한 번만 소유하며 공급사 미연결은 발송 성공으로 표시하지 않는다. `pnpm test:spike:field-actions:agent`와 `FIELD_BROWSER_PYTHON=<venv>/bin/python pnpm test:spike:ap-field:http`(아래 「브라우저 검수 준비」)가 로컬 mock AP→Field 문의/예약/고객 인계·위임 답변과 320px 흐름을 검수한다. route 전환·실공급사 검수는 남았다.
- Field 외부 연결 제공자: 등록된 OAuth BFF client의 code+PKCE 요청은 Field 계정 로그인→사업장 선택→`field.facts.read` 명시 동의를 거친다. Field bearer `/integrations/v1/me`·`/facts`는 선택한 사업장의 승인 카탈로그만 반환한다. 로컬 검수는 `pnpm test:spike:contracts:field`·`pnpm test:spike:oauth:field`를 사용한다. `sandbox/live` OAuth 동의 화면에는 `FIELD_PUBLIC_WEB_ORIGIN` 설정이 필요하다. AP의 역방향 code 보관과 두 동의의 명시 연결은 로컬 mock에서 검수됐고, 승인 Field 정보의 AP 지식 반영과 로컬 Field 사이트의 AP SDK 설치는 부분 구현됐으며, 운영 연결 검수와 나머지 Field 업무 scope는 남아 있다.
- Field 사이트 AP 상담 설치: Field에서 사이트를 공개한 뒤 `/workspace/integrations`의 사업장별 origin을 확인한다. AP `/workspace/deployments`에서 같은 origin의 소유 위젯을 만들고 증명값을 Field에 저장한 뒤 AP에서 소유 확인·활성화한다. AP 접근을 다시 승인하면서 활성 배포를 선택하고 양쪽 동의를 끝낸 뒤 Field에서 표시 방식과 설치를 선택한다. 연결 전 또는 중지 후에도 Field 직접 문의·예약을 사용한다. 로컬 왕복 검수는 `FIELD_BROWSER_PYTHON=<venv>/bin/python pnpm test:spike:ap-field:http`이며 실제 도메인/TLS와 모델 응답은 별도 게이트다.
- 로컬 검수: `pnpm test:spike:business:agent`, `pnpm test:spike:inquiries:agent`, `pnpm test:spike:attachments:agent`, `pnpm test:spike:agents:agent`, `pnpm test:spike:deployments:agent`, `pnpm test:spike:consultations:agent`, `pnpm test:spike:campaigns:agent`, `pnpm test:spike:publishers:agent`, `pnpm test:spike:placements:agent`, `pnpm test:spike:distribution:agent`, `pnpm test:spike:business:field`, `pnpm test:spike:sites:field`, `pnpm test:spike:attachments:field`, `pnpm test:spike:generation:field`, `pnpm test:spike:bookings:field`, `pnpm test:spike:queue:field`, `pnpm test:spike:worker:field`. 동일 제품 DB migration 명령은 advisory lock 경쟁을 피하도록 순차 실행한다. 큐/worker 검수에는 로컬 Field Valkey가 필요하고 합성 모델 응답만 사용한다.
- 연결 장애 회귀: 전체 `pnpm mock:run`의 AP·Field API/웹과 연결 worker가 실행 중일 때 `pnpm test:integration:faults`를 사용한다. 양쪽 mock PostgreSQL 17·Field Valkey를 정확한 로컬 포트에서 확인한 후 계약 정적 검사, 제품별 DB fault, 양방향 실제 HTTP를 실행한다. 운영 서버 중단·키 회전·구버전 호환 및 출시 승인은 별도다.
- 브라우저 검수 준비: 브라우저 단계가 있는 실행기(`test:e2e:*`, `test:security`, `test:integration:faults`, `test:independence:*`)는 Python Playwright 경로를 env로 받는다. venv를 만든다: `python3 -m venv <dir> && <dir>/bin/pip install playwright && <dir>/bin/python -m playwright install chromium`. 그 뒤 `export AP_BROWSER_PYTHON=<dir>/bin/python FIELD_BROWSER_PYTHON=<dir>/bin/python`로 지정한다. `test:integration:faults`는 `FIELD_SAME_PAGE_BROWSER_PYTHON`도 넘기며, 이 값이 있을 때만 같은 화면 연결 브라우저 단계를 실행한다. `test:e2e:*`·`test:security`는 경로가 없으면 즉시 실패한다. CI는 같은 절차를 `.github/workflows/ci.yml`의 e2e job에서 수행한다.

로컬 mock 가입은 메일 발송 없이 로그인할 수 있다. `NODE_ENV=production`의 mock API는 부팅을 거부한다. 실제 메일/카카오 인증, AP 고객 AI의 실모델 품질·실도메인 위젯 검수, Field 자체 도메인·제작 AI의 실모델 검수, 실제 알림·결제·운영 배포는 아직 미완료다. 두 AI 어댑터는 일반 로컬 서버에서 가짜 답변을 만들지 않고 각각 공급사 설정을 요구한다. AP 문의의 사업자 내부 알림은 관리실에서 볼 수 있으나 카카오/푸시·고객 문자는 `blocked_integration`이며, Field 문의·예약 외부 알림도 공급사 연결 전 `blocked_integration`이다. 고객은 별도 확인키로 AP 답변을 직접 조회한다. Field 예약/직접 문의·후속 대화와 AP 문의·후속 메시지 화면은 응답 분실 후 같은 입력으로 다시 제출하면 기존 원본을 복구한다. 새로고침을 가로지르는 접수 복구, 확인키 분실 지원, 실운영 프록시·공급사·복구 및 정식 QA는 남아 있다.

## 운영 배포 산출물

제품별 운영 이미지·compose·edge·CI 파일은 `infra/agent/`, `infra/field/`, `infra/edge/Caddyfile.example`, `.github/workflows/ci.yml`에 있다. 목록과 결정은 `docs/04_SECURITY_OPERATIONS_RELEASE.md` 5.1.1과 `docs/adr/0003-deployment-artifacts.md`를 따른다. 각 제품은 `infra/<product>/.env.live.example`을 저장소 밖 secret으로 채워 `infra/<product>/.env.live`(git 무시)로 두고 다음처럼 따로 배포한다.

```bash
docker compose -p fieldai-agent --env-file infra/agent/.env.live -f infra/agent/compose.live.yaml build
docker compose -p fieldai-agent --env-file infra/agent/.env.live -f infra/agent/compose.live.yaml up -d --wait
docker compose -p fieldai-field --env-file infra/field/.env.live -f infra/field/compose.live.yaml build
docker compose -p fieldai-field --env-file infra/field/.env.live -f infra/field/compose.live.yaml up -d --wait
```

공급사 자격증명이 있어야 부팅되는 worker는 `--profile site-ai`(Field), `--profile ap-connector`(Field)로 따로 켠다. `retention-worker`는 기본 서비스로 항상 뜬다. 계정·조직 삭제 실행, Field 사이트 사진 2단계 삭제, 인증 메일 outbox·결제 웹훅 inbox·시도 창·ACK 사건 정리를 이 worker가 맡으므로 끄지 않는다. 보존 저널 키(`*_RETENTION_JOURNAL_SECRET`)가 비면 이 worker가 시작을 거부한다. `*_INQUIRY_S3_*`(Field는 `FIELD_S3_*`도)가 비어 있으면 사진 파일 삭제 단계만 `blocked_integration`으로 남고 나머지 정리는 계속된다. 로그 수준은 `AP_LOG_LEVEL`/`FIELD_LOG_LEVEL`, 요청 제한 시간은 `AP_REQUEST_TIMEOUT_MS`/`FIELD_REQUEST_TIMEOUT_MS`로 바꾼다(`.env.live.example` 참고). edge(Caddy)의 호스트·ACME 값 예시는 `infra/edge/.env.example`이다. 이미지는 `.node-version`과 같은 Node 패치 버전으로 고정한다. 실제 도메인·TLS·레지스트리 push·운영 서버 검수는 아직 수행하지 않았다.
