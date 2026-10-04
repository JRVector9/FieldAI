# AGENTS.md — 독립 AI 플랫폼 + Field, 개발 기준 v3.0

## 모델 규칙 (JR 지정, 2026-10-04)

- 서브에이전트 생성과 `codex exec` / `codex review`의 모델은 `gpt-6.1-sol`, reasoning effort는 `xhigh`로 지정한다.
- 다른 모델 또는 `high` 이하 effort를 지정하지 않는다. 예: `codex exec -m gpt-6.1-sol -c model_reasoning_effort=xhigh ...`.

이 패키지는 **개발 명세**다. 운영 앱·실제 외부 연동·상용 배포가 이미 존재한다고 가정하지 않는다. 기존 PRD v2.0과 통합 AGENTS/TASKS는 이력 자료이며 이번 제품 경계와 충돌할 때 사용하지 않는다.

## 1. 먼저 읽을 것

1. `docs/00_PRODUCT_ARCHITECTURE.md`의 B01~B12와 21개 결정.
2. 본인이 담당하는 `docs/01_AGENT_PLATFORM_PRD.md` 또는 `docs/02_FIELD_PRD.md`.
3. `docs/03_INTEGRATION_CONTRACT.md` — 서로의 내부 코드가 아니라 이 계약만 사용.
4. `TASKS.md`의 선행 작업·릴리스·완료 기준.
5. `docs/06_REQUIREMENTS_QA.md`의 적용 QA, `docs/04_SECURITY_OPERATIONS_RELEASE.md`의 게이트.

마스터 문서는 `AI_Field_Service_Operator_Final_Development_Plan_v3.0.md`다. 분할 문서와 내용은 동일 기준이며 변경 시 분할 원문→마스터 재생성 순서를 유지한다. UI v3는 시각·기능 참고일 뿐, 단일 계정·공유 DB·로컬 저장·역할 탭은 운영 아키텍처가 아니다.

## 2. 가장 중요한 구현 규칙

- AP는 Field가 없는 환경에서 가입·AI·지식·외부 설치·상담·알림·결제까지 동작한다.
- Field는 AP가 없는 환경에서 사이트 제작(자체 제작 LLM 포함)·직접 문의·예약·알림·결제까지 동작한다.
- AP/Field domain·repository·DB·identity/session·worker queue·secret을 공유하지 않는다. 같은 monorepo라도 네트워크 계약으로 연결한다.
- Field는 일반 외부 사이트와 같은 AP SDK/공개 API를 사용한다. 내부 DB 우회·고객별 설치 대행·공통 superadmin 금지.
- 기본 AP 상담 위젯에 campaign/publisher/Field booking 의존성을 만들지 않는다.
- Field의 제작 AI와 AP의 고객 상담 AI를 혼동하지 않는다.
- AP 원본 대화는 AP API로 읽고 쓴다. Field 원본 대화는 Field가 유지한다. 원문 양방향 복제로 해결하지 않는다.
- 업무 제출은 고객 동의 후 AP ActionRequest→Field 외부 요청이다. AP는 예약을 확정하지 않는다.
- 연결은 두 방향의 scope·토큰·조직·actor 동의를 가진다. API 토큰을 상대 제품 로그인으로 사용하지 않는다.
- 하나의 사건은 한 제품만 고객/사업자 알림을 보낸다. unknown 상태에서 이중 문자 재발송 금지.
- 제품 간 가격/정보 변경에 공유 DB 트랜잭션을 가정하지 않는다. source revision·검수·중요값 재확인·stale 대체 필수.
- 연결 해제는 양쪽 구독 해지나 데이터 삭제가 아니다. 기존 예약·원본·법정 보존·고객 접근 경로를 유지한다.
- 사이트·지식·카드는 명시 승인 전 초안이다. 숫자/자격/경력/후기를 AI가 만들어 넣지 않는다.
- 고객 OTP·회원가입을 새로 강제하지 않는다. 번호/알림 링크만으로 대화 권한을 주지도 않는다.
- 외부 문서 자동 수집·사진 진단·고객 결제·광고비 정산·임의 MCP 도구는 범위 밖이다.

## 3. 작업과 소유 경로

Coordinator는 schema/API/event/권한 변경과 ADR 병합을 조율한다. AP Agent는 AP 앱/도메인/DB, Field Agent는 Field 앱/도메인/DB, Connector Agent는 공개 HTTP client/bridge/권한 매핑만 담당한다. Distribution Agent는 AP의 campaign/publisher 기능만 다룬다. 한 사람이 순차 실행해도 같은 작업 ID를 사용한다.

공통 UI는 데이터 접근 없는 컴포넌트다. 생성 클라이언트는 버전이 고정된 계약에서만 만든다. 다른 worktree가 수정 중인 migration·DTO를 임의 덮어쓰지 않는다. 변경이 필요한 경우 계약 PR→consumer test→구현 PR 순서다.

저장소가 이미 있으면 구조·잠금 파일·테스트·마이그레이션·운영 데이터 유무부터 조사한다. 기존 코드를 지우고 새 monorepo를 만드는 일을 자동으로 수행하지 않는다. 실제 운영 데이터 복제·삭제·계정 이전·카드 청구·고객 메시지 발송은 별도 권한 없이는 하지 않는다.

## 4. 환경과 상태

`mock`, `sandbox`, `live`를 분리한다. production에 mock·예시 로그인·고정 모델 답변·localStorage 원장·가짜 DNS/결제 성공이 들어가면 부팅/CI가 실패해야 한다.

외부 credential/계약이 없으면 상태는 `blocked_integration`이다. 내부 단위 테스트는 진행할 수 있지만 출시 게이트를 통과 처리하지 않는다. 다른 제품 장애를 검증할 때는 환경변수 제거·네트워크 거부·서버 미배포로 실제 독립성을 검사한다. 빈 fixture를 서버 장애로 대체하지 않는다.

## 5. 저장소에 마련할 검수 명령 계약

다음 명령은 구현팀이 실제 스크립트로 만들어야 한다. 현재 문서 패키지에 서비스 테스트가 구현되어 있다는 뜻이 아니다.

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:db:agent
pnpm test:db:field
pnpm test:contracts
pnpm test:independence:agent
pnpm test:independence:field
pnpm test:integration:faults
pnpm test:e2e:agent
pnpm test:e2e:field
pnpm test:e2e:distribution
pnpm test:security
pnpm build:agent
pnpm build:field
```

`test:independence:agent`는 Field 서비스·DB·비밀값 없이 실제 AP 서버/DB로, 반대도 동일하게 실행한다. `test:integration:faults`는 지연·순서 역전·중복·revoke·scope 거부·결과 미상을 재현한다. 프로덕션 공급사 검수는 별도 gate/evidence로 분리한다.

실패한 테스트를 삭제하거나 기대값을 현재 버그에 맞추지 않는다. 미실행·skip은 그대로 보고한다. 실패가 CI non-zero로 전파되어야 한다. pass 개수만 보고하지 말고 어떤 제품/환경/커밋인지 남긴다.

## 6. UI 및 완료 조건

고객·사업자/서비스 제공자·매체·각 제품 관리자 화면을 유지한다. 글자 최소14px, 본문/입력16px, 모바일320px부터 검수한다. 조작 가능한 버튼에는 실제 API 또는 비활성 사유가 필요하다. UI 입력·저장·반영·공개·전달·확정·발송·열람 상태를 구분한다.

한 작업의 Done은 UI+API+domain+DB+권한+이벤트+사용량+오류+테스트+복구가 연결된 상태다. 코드 완료와 출시 승인은 분리한다. 모든 작업 시작 전 파일 범위·관련 요구/QA·명령을 기록한다.

## 6.0 고정 디자인 기준 — 사용자 필수 지침 (2026-09-27)

- 화면 디자인 원본은 `reference/field_ui_prototype_v3.html`이다. 사용자 지시로 디자인 자체를 고정한다. 기존 배치·색상·글자·메뉴·반응형 규칙을 임의로 재설계하거나 반복 조정하지 않는다.
- 원본에 있는 화면을 처음 구현할 때 해당 HTML/CSS를 그대로 기준으로 사용한다. 이미 구현 완료된 화면은 새 오류·요구 변경의 구체적 근거 없이 다시 작업하지 않는다.
- 시안에 없는 새 기능은 기존 디자인 안에 추가하고 사용자에게 보이는 기능 이름에 **`(추가)`**를 표시한다. 기존 시안에 있는 기능에는 추가 표시를 붙이지 않는다.
- API·권한·원장·실제 상태는 v3.0 개발 문서에 연결하며 제품 경계를 지킨다. 시안의 고정 예시 데이터/가짜 성공을 서비스 결과로 승계하지 않는다.

## 6.1 완료 체크와 재작업 금지 — 사용자 필수 지침

- **모든 작업 시작 전에 `TASKS.md` 상단의 `완료 체크 — 재작업 방지 기준`을 먼저 읽는다.** 이어서 `docs/CODEX_HANDOFF.md` 현재 상태, `git status`/`git log`와 해당 구현을 확인한다.
- `[x]`인 세부 작업은 완료 범위다. 에이전트 교체·컨텍스트 압축·기억 부재만으로 재구현하거나 처음부터 검수를 반복하지 않는다. 새 작업은 미완료 `[ ]` 세부 ID에서 선택하고 phase plan에 그 ID/범위/관련 요구/검수 명령을 기록한다.
- 새 오류 재현·요구 변경·현재 코드와 완료 기록의 구체적 불일치가 있을 때만 완료 항목을 다시 연다. **코드 변경 전에 동일 세부 ID에 재개 사유·증거·추가 범위를 기록**하고 기존 완료 이력/근거는 보존한다. 이유 없는 `[x]`→`[ ]` 변경이나 이미 끝난 계획의 재생성은 금지한다.
- 완료 즉시 해당 세부 항목을 `[x]`로 바꾸고 수정 경로·실행한 검수/환경·코드 포함 commit·남은 외부/최종 인수 범위를 기록한다. `TASKS.md`, 사용한 phase 체크박스, 잔여 audit, 인계파일을 같은 단계에 갱신한다. 미실행/실패를 체크하지 않는다.
- 부모 Task가 출시/외부 연동 때문에 `in_progress`여도 끝난 내부 세부 기능은 `[x]`로 유지한다. 부모 전체 완료와 내부 완료 범위를 구분해 같은 기능을 반복하지 않는다. 사용자 최종 화면/동선 테스트와 실 공급사 연결은 별도 미완료로 남긴다.
- 완료 체크의 기준 원장은 `TASKS.md` 상단이다. 상세 증거는 `LOCAL_FUNCTIONAL_COVERAGE.md`와 인계/실제 검사 기록에 연결한다. 중복 목록의 오래된 “남음” 문구보다 최신 체크/코드 상태를 우선한다.
- 단계별 체크박스 하나에 완료 범위와 미완료 범위가 섞이면 같은 세부 ID/근거를 유지한 채 `[x]`와 `[ ]`로 나눈다. 과거 착수·“다음 작업” 기록은 **이력**으로 표시하고, 현재 다음 작업에는 미완료 범위만 적는다.

## 7. 작업 보고 템플릿

```text
Task ID / Product / Owner:
State: planned | in_progress | implemented | blocked | blocked_integration | verified
Requirements / QA / Gate:
Changed paths and reasons:
Contract / schema / migration changes:
Tests actually run, commands, environment, commit:
Not tested and why:
Failure cases and rollback:
External approvals still needed:
Next dependency:
```

## 8. 에이전트 최초 실행 프롬프트

```text
AGENTS.md와 최종 개발 계획 v3.0, TASKS.md를 읽고 현재 저장소를 조사하라.
C00부터 작업한다. AP와 Field는 별도 제품·DB·로그인·구독·배포다.
Field는 정식 외부 클라이언트이고 두 제품 domain/db를 직접 import하지 않는다.
AP 단독 고객은 Field 계정·예약·매체 없이 외부 사이트에 상담 AI를 설치할 수 있어야 한다.
기존 셀프 사이트 제작·두 예약 방식·비회원 접수·역할·최소14px를 유지하라.
먼저 계약/의존성/인프라 격리 검수 계획을 제시하고 승인된 작업 범위 내 구현하라.
미연결 공급사를 성공 모의 처리하지 말고 실제 테스트와 미실행 항목을 구분하라.
이번 턴에서는 선택한 Task의 코드·검수·차단 원인까지 보고하고 출시/청구/삭제를 임의 수행하지 마라.
```
