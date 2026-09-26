# 실행 아키텍처 기준안 — 2026-09-24

상태: C01/C02 진행 중. [제품 경계](../00_PRODUCT_ARCHITECTURE.md) B01~B12와 [공개 계약](../03_INTEGRATION_CONTRACT.md)을 변경하지 않는다.

## 프로세스·데이터

```text
AP: agent-web → agent-api → AP PostgreSQL ← agent-worker
                       │                 │
                       └─ public SDK/API  └─ AP outbox/inbox/queue

Field: field-web → field-api → Field PostgreSQL ← field-worker
                         │                     │
                         └─ public SDK/client   └─ Field outbox/inbox/queue

두 제품 사이: versioned HTTPS API + 위임 OAuth + 서명된 webhook
```

제품별 DB 사용자·DB/백업·session secret·OAuth issuer/key·worker·객체 bucket·배포 이미지·도메인 설정을 분리한다. 같은 장비/monorepo는 허용하되 AP 기본 health, 가입, native 상담과 Field 제작, 직접 문의, 예약은 상대 주소·환경변수 없이 시작한다. 연결 실패는 선택 기능 `degraded`로만 표시한다.

Field 웹은 자체 공개 페이지와 관리자 UI를 SSR/서버 렌더한다. AP 웹은 제품·관리·고객의 1차 도메인 화면을 맡는다. API는 각 제품의 업무·공개 설치·인가 리소스 서버, Worker는 자체 outbox·AI·알림·동기화만 처리한다. Field는 AP SDK를 일반 외부 사이트와 같은 공개 배포 ID/허용 origin으로 설치한다. 생성 HTTP client·스키마 이외의 상대 제품 domain/db import를 검사한다.

## 인증·상담·설치

사업자 로그인은 제품별 Better Auth 세션이다. AP/Field 연결은 각자의 OAuth issuer에서 **별도** code+PKCE·조직/actor 동의를 받고, 각 제품 API는 자기 audience/scope만 수락한다. OAuth access token을 상대 로그인 쿠키로 교환하지 않는다. 조직 scope는 세션·membership·DB 질의에서 재확인한다. 사람 답변은 해당 actor의 위임 권한이 필요하다.

위젯 loader는 공개 ID와 모드만 받는다. AP iframe은 요청 origin·배포 상태를 확인하고 단기 대화 범위 세션을 만든다. 현재 mock spike에는 CSP `frame-ancestors`와 postMessage origin/source/nonce 검사가 있다. 운영 구현에는 서버 rate limit과 도메인 소유 검증을 추가해야 한다. 제3자 쿠키를 전제로 하지 않고 개인정보 제출은 AP 1차 도메인으로 1회 handoff한다. campaign/publisher/Field 예약은 `owned_embed`의 필수 컬럼이 아니다.

상담 메시지 POST는 클라이언트 멱등 키로 원문과 sequence를 저장한다. SSE는 `Last-Event-ID` 또는 cursor 뒤 이벤트를 재생한다. AI는 승인된 지식 버전으로 구조화 답변을 생성하고 **최종 검증 전 고객에게 모델 토큰을 내보내지 않는다**. 최종 저장 직전 conversation revision/automation_paused를 다시 확인해 사람 인계 후 AI 이중 답변을 막는다. 가격/예약 가능성은 외부 원본 최신성 확인 실패 시 말하지 않고 사람 문의로 전환한다.

## 예약·비동기·복구

Field 예약 요청은 미점유다. Field 사람의 확정 트랜잭션에서 자원·buffer 시간을 포함한 `tstzrange` 점유를 만들고 PostgreSQL GiST exclusion constraint로 중첩을 거부한다. API의 사전 조회만으로 경쟁을 막았다고 주장하지 않는다. 예약 이벤트와 outbox는 같은 Field 트랜잭션에 저장한다.

제품 간 업무는 AP ActionRequest→Field 외부 수신 원장으로, 같은 action ID/body hash는 멱등 처리한다. 원격 타임아웃은 `delivery_unknown`이고 기존 ID 조회 후 재시도한다. 양쪽 webhook은 서명 검증·durable inbox 후 202를 주며 순서 역전은 원본 재조회로 해결한다. 원본별 알림 주체를 이벤트에 기록한다.

공개 사이트 캐시는 승인 릴리스에만 적용한다. 자체 도메인 DNS/TLS는 확인 전 성공으로 표시하지 않는다. 백업은 DB/객체/키/삭제 원장을 제품별로 생성하고 실제 격리 환경에서 복원 검증한다. 추적 ID는 개인정보 없이 전달한다.

## 미검증

이 파일은 실행 설계다. 제품별 로컬 OAuth code+PKCE, 두 issuer의 교차 token 거부, Field DB 동시 예약, 별도 origin의 AP mock 위젯 설치·first-party handoff 화면 도착, AP mock POST+SSE 재연결·사람 인계는 부분 spike만 통과했다. Field 사이트 설치, 실제 고객 접수·상담, 조직 동의, 알림/결제/LLM 공급사, 백업 복원, 운영 배포는 통과하지 않았다. 각 항목의 실제 명령과 결과는 `SPIKE_REPORT.md`와 `DEVELOPMENT_STATUS.md`에 기록한다.
