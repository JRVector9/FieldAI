# 사용자 결정과 외부 입력 목록 — 2026-10-04

실행 가능한 C-01/A-01부터 순차 진행하고, 제품 정책과 운영 입력을 따로 정리한다. 아래 제안은 아직 채택된 결정이 아니다. 답변 전에는 현재 동작을 유지한다. 근거는 `01_SUMMARY.md` §13, `TASKS.md`의 미완료 부모 항목, 제품별 `.env.live.example`과 edge 예시다.

## 1. 결정이 필요한 13개 항목

기존 B번호를 유지한다. B12 live OAuth baseline은 A04에서 내부 구현을 마쳤다.

| ID | 결정할 내용 | 현재 동작·영향 | 선택지·제안 |
|---|---|---|---|
| B1 | 직접 응대 종료 후 AI가 다시 답해도 되는가 | 현재 AI 재개 없음. 허용 시 동의, 개인정보·첨부·알림 경계를 다시 검수해야 함 | 현행 유지 / 경계 검수 후 재개 허용 |
| B2 | AP 전달 요청 상태를 계약 §4.6 전체로 맞출 것인가 | DB는 sending/accepted_external/delivery_unknown/rejected/unresolved 중심 | draft/awaiting_customer, queued, retryable_failure, canceled_before_delivery의 저장·전이 위치부터 설계 |
| B3 | Toss webhook으로 재조회 시각을 얼마나 앞당길 것인가 | 60초 넘게 남은 unknown만 즉시 조회. worker 기본값도 60초여서 단축 효과가 작음 | 현재 간격 유지 / sandbox 중복 힌트 검수 후 최소 간격 변경 |
| B4 | 신고로 숨긴 사이트의 새 문의·예약을 막을 것인가 | 기존 결정대로 새 접수를 유지함 | 접수 유지 / 공개 신규 접수 차단과 기존 고객 열람 유지 |
| B5 | 운영 화면의 `(추가)` 표식을 유지할 것인가 | 사용자 고정 지침에 따라 표시 | 현행 유지. 숨김은 명시적인 지침 변경 후 적용 |
| B6 | 제품별 체험 기간·동의 버전·AI/접수 예산 | 승인값이 없으면 live 체험과 해당 AI 기능이 닫힘 | AP·Field 각각 일수, 동의 문구/버전, 비용·사용량 상한 입력 |
| B7 | 운영자 정보·약관·환불·보존 정책 | 법적 정보 미설정 표시, 정책 최종 검토 미완료 | 제품별 운영 주체·고지값과 최종 정책 확정 |
| B8 | 외부 공급사·sandbox/live 계약·비용 주체 | 미설정 기능은 blocked_integration | sandbox 가입/인증→결제→사진→AI→발송 순으로 검수. 실발송·청구 권한 별도 |
| B9 | 활성 owned OAuth client가 있는 계정의 삭제 | `oauth_clients_active`로 차단 | 현행 차단 / 삭제 시 client 비활성화와 모든 actor grant 회수 |
| B10 | 카카오 전용 관리자의 MFA 등록 방식 | 비밀번호 없는 2FA 등록을 허용하지 않아 비mock 관리자 진입 불가 | 추가 비밀번호 등록 / passwordless MFA와 재인증을 sandbox에서 검수 |
| B11 | 템플릿 hero와 소개 섹션의 중복 문구 | 현재 두 곳에 표시 | 현행 유지 / 소개를 한 곳에 표시하되 고정 시안 배치 보존 |
| B13 | nodemailer 공급망 검토 후 유지/교체 | 현재 lockfile 버전 고정, 공급망 검토 미완료 | 출처·의존성 검토 후 유지/교체 판단 |
| B14 | 기존 연결에서 scope를 늘리는 재동의를 지원할 것인가 | 현재 해제→재연결 안내 | 현행 유지 / 기존 업무를 보존하고 양방향 actor·org 동의를 갱신하는 흐름 지원 |

추가 범위 확인: **계정 연결**은 자동 병합을 막기 위해 현재 비활성이고, **번호 변경**은 아직 미구현이다. 로그인 계정 연결을 열지, 어떤 재인증과 고객 확인키를 유지할지 별도 요구를 확정해야 한다. B13개 결정과 이 두 공백을 같은 완료 범위로 취급하지 않는다.

## 2. 사용자 또는 공급사에서 필요한 키·정보

원본과 작업 worktree 모두 AP·Field `.env.live`와 edge `.env/.env.live`가 없다. 원격 secret 저장소의 보유 여부는 확인하지 않았으므로 키가 없다고 단정하지 않는다. 이미 보관한 값이 있으면 **배포 대상과 보관 경로**부터 공유하면 된다. 키 값은 보호된 env/secret 저장소에 주입하고 git·보고서에 기록하지 않는다. 이번 mock CI에는 실키가 필요 없다.

| 구분 | 필요한 외부 값·정보 | 변수·등록 위치 | 필요한 시점 |
|---|---|---|---|
| 배포 대상 | 서버/플랫폼, 접근 방법, sandbox/live 구분, 이미지 레지스트리·태그, 백업 저장소 | 제품별 compose·DB·queue, secret 주입 경로 | live 기동 전 |
| 공개 주소·DNS | AP 웹/API, Field 웹/API, 테넌트 기본 도메인, custom CNAME 대상, DNS 접근 | `AP_AUTH_BASE_URL`, `AP_PUBLIC_WEB_ORIGIN`, `FIELD_AUTH_BASE_URL`, `FIELD_PUBLIC_WEB_ORIGIN`, `NEXT_PUBLIC_FIELD_WEB_ORIGIN`, `FIELD_SITE_BASE_DOMAIN`, `FIELD_CUSTOM_DOMAIN_CNAME_TARGET` | 콜백 등록·웹 빌드·TLS 전 |
| DNS/ACME | DNS 공급사 토큰, ACME 이메일, 공개 레코드 | edge `CLOUDFLARE_API_TOKEN`(현재 예시 모듈), `ACME_EMAIL`, AP/Field `*_WEB_HOST/*_API_HOST` | wildcard·자체 도메인 TLS 검수 전 |
| SMTP | 공급사, smtps 주소/계정, 제품별 발신 주소, 도메인 인증 | `AP_SMTP_URL/AP_MAIL_FROM`, `FIELD_SMTP_URL/FIELD_MAIL_FROM` | 가입 확인·비밀번호 재설정 전 |
| 카카오 | 제품별 앱 client ID/secret, 이메일·닉네임 동의 설정 | `AP_KAKAO_CLIENT_ID/SECRET`, `FIELD_KAKAO_CLIENT_ID/SECRET`; 각 웹 origin의 `/api/auth/callback/kakao` | 카카오·MFA 검수 전 |
| Toss | 제품별 sandbox client key/secret key/MID, 빌링 계약, return/webhook 주소 | `AP_TOSS_CLIENT_KEY/SECRET_KEY/MID`, `FIELD_TOSS_CLIENT_KEY/SECRET_KEY/MID` | 실제 SDK·인증·청구·환불 검수 전 |
| S3 | AP 문의 비공개/Field 사이트·문의별 bucket, region, endpoint, access key/secret, IAM 권한 | `AP_INQUIRY_S3_*`, `FIELD_S3_*`, `FIELD_INQUIRY_S3_*` | 사진 업로드·삭제·복원 전 |
| AI | AP 상담·Field 제작용 키/모델, 프로젝트·사용 한도, 비용 예산 | `AP_OPENAI_API_KEY/MODEL`, `FIELD_OPENAI_API_KEY/MODEL`, `AP_CUSTOMER_DAILY_LIMIT`, `AP_PLACEMENT_ENGAGEMENT_DAILY_LIMIT` | 실 AI 검수 전 |
| 솔라피/카카오 문자 | account ID, API key/secret, 승인 발신 번호, PF ID, 승인된 사업자/고객 template ID, 계약 승인 | 제품별 `*_SOLAPI_*`, `*_NOTIFICATION_PROVIDER_APPROVED` | 실발송 검수 전 |
| 웹푸시 | subject 이메일, 발송 정책·승인, 실기기 검수 대상 | 제품별 `*_PUSH_VAPID_SUBJECT/PUBLIC_KEY/PRIVATE_KEY`, `*_PUSH_PROVIDER_APPROVED` | 실제 권한·수신 검수 전 |
| 법적·체험 정책 | 상호·대표·사업자번호·통신판매번호·주소·연락메일·개인정보책임자, 체험 일수·동의 버전 | `NEXT_PUBLIC_LEGAL_*` 7종, AP/Field `*_TRIAL_DAYS/*_TRIAL_CONSENT_VERSION` | live 웹 빌드·체험·약관 전 |
| 운영·최종 검수 | 제품별 관리자, 테스트 사용자·기기, 인수 담당, 외부 보안/법무 담당, 유지보수 시간 | 제품별 role/MFA, C03~08 증거 | 운영·최종 검수 전 |
| 관측·보관 | 오류 수집 서비스·접근, 지표·알림 대상, 저널/checkpoint 백업, RPO/RTO 승인 | C04/C05 운영 runbook | 운영 복구·모니터링 전 |

AP·Field 연결은 선택이다. 연결하려면 각 제품의 운영 owner, 양방향 scope 동의, 조직·actor 매핑을 정하고 공개 OAuth client를 등록한다. `AP_FIELD_*`·`FIELD_AP_*`를 상대 제품 로그인으로 사용하지 않으며 단독 운영에는 필요 없다.

## 3. 새 환경에서 제가 생성할 수 있는 내부 값

신규 제품별 DB·Field Valkey 비밀번호, auth 서명키, 연결/결제/알림 암호화키, retention/revocation 저널 HMAC키, VAPID 키쌍, 콜백 secret, 공개 OAuth 등록 후 client secret은 외부 업체 발급키가 아니다. **신규 환경**이면 배포 대상과 secret 저장소가 정해진 뒤 제품별로 생성할 수 있다.

기존 DB·암호문·저널이 있으면 기존 키와 보관본부터 확인하고 임의 교체하지 않는다. 최초 A18 저널 전환도 writer 정지, 최초 저널·빈 receipt 확인 후 runbook 절차를 따른다.

## 4. 입력 우선순위

1. sandbox/live 배포 대상, 제품별 도메인, 기존 secret 보관 경로.
2. SMTP·카카오 앱키/Redirect 설정: 가입·로그인·MFA부터 실제 검수.
3. Toss sandbox·S3·AI 키/모델과 예산.
4. 발송/푸시, 체험·법적 정보, 운영·최종 검수 담당.
5. B번호별 선택. 미답변 항목은 현행을 유지하며 CI·독립성 검수는 계속 진행한다.
