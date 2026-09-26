# 제품별 구독 PG 설정 — 구현 중

현재 구현 범위는 승인 가격의 명시 동의·SDK 카드 인증 준비·콜백의 암호화 대기 저장과 Toss HTTP port다. 인증 발급/실제 청구 worker·갱신/환불·제공량·콜백 페이지/결제 UI는 아직 구현 중이다. 아래 설정만으로 전체 유료 구독이 완료되지 않는다. 외부 설정은 사용자의 후속 기능 테스트 때 연결한다.

## 각 제품의 자체 환경변수

| AP | Field | 용도 |
|---|---|---|
| AP_PROFILE | FIELD_PROFILE | mock/sandbox의 test key, live의 live key |
| AP_TOSS_CLIENT_KEY | FIELD_TOSS_CLIENT_KEY | 자동결제 SDK용 client key; 결제 위젯 gck key와 구분 |
| AP_TOSS_SECRET_KEY | FIELD_TOSS_SECRET_KEY | 서버 HTTP 인증, 브라우저 응답 제외 |
| AP_TOSS_MID | FIELD_TOSS_MID | 해당 제품 승인 상점 ID, 응답과 기존 인증 intent에 대조 |
| AP_BILLING_CREDENTIAL_KEY | FIELD_BILLING_CREDENTIAL_KEY | 각 제품 자체 AES-256-GCM key; 32 bytes를 base64url로 인코딩한43자 |
| AP_PUBLIC_WEB_ORIGIN | FIELD_PUBLIC_WEB_ORIGIN | SDK 인증 후 돌아올 해당 제품의 웹 origin |

Toss4항목이 모두 없으면 native API는 정상 부팅하고 checkout503/blocked_integration을 유지한다. 부분 설정, key/test-live 불일치, production의 test profile, 잘못된 웹 origin은 부팅 시 거절한다. live origin은 HTTPS여야 한다. 기존 외부 연결·auth·삭제/회수 증빙 key를 billing key로 사용하지 않는다. 기존 암호문이 있으면 해당 credential key를 유지하고 변경은 별도 key rotation 작업으로 처리한다.

현재 AP 로컬 DB는 infra/agent/.env, Field는 infra/field/.env를 각각 사용한다. 실제 PG key를 자동 생성·seed하지 않는다. 실제 승인 가격/세금/약관/환불/최초 청구 정책·MFA·PG 계약/상점 적합성·G-A1/F3/L1 확인은 별도다. 현재 non-mock admin과 live 가격 승인은 blocked_integration이므로 test 승인본을 운영 승인본으로 전환하지 않는다.

## 내부 상태와 복구

- POST `/v1/subscription/checkout`: owner/current session이 승인 plan의 경제값·약관/환불 버전·자동 갱신·인증 후 첫 청구 정책에 명시 동의한다. caller의 UUID Idempotency-Key로 한 consent/authorization을 만들며 응답 유실은 같은 본문/키로 복구한다.
- SDK 준비 정보의 customerKey는 임의 UUID다. callback state는 암호화해 저장하고 계정·세션·조직·provider mode/MID에 묶는다. browser secret key/원시 카드 정보는 반환하거나 받지 않는다.
- POST `/v1/subscription/authorizations/:id/confirm`: 원래 계정/세션·state/customerKey·현재 PG binding/만료를 확인하고 authKey를 암호화해 pending/202로 저장한다. 동일 authKey retry는 같은 상태를 반환한다. **pending은 카드 인증 발급/실제 결제 성공이 아니다.**
- GET `/v1/subscription/authorizations/:id`: 자체 조직 owner에게 비밀값 없는 상태를 반환한다.
- POST `/v1/subscription/authorizations/:id/cancel`: 아직 발급을 시작하지 않은 인증을 중지하고 callback/auth ciphertext를 폐기하며 동의/감사 metadata를 보존한다. 이미 processing/unknown/completed인 인증은 이 경로에서 삭제하지 않는다. 전체 유료 해지는 다음 worker/구독 단계에서 별도 연결한다.

신규 인증/청구 worker는 저장된 같은 request_key/order만 사용해야 한다. 미상 상태에 새 주문을 만들지 않고 같은 원격 주문을 조회한다. 현재 port의 공급사 오류는 보수적으로 unknown으로 분류하며 확정 거절/유예 처리와 환불 API는 다음 실제 worker 단계의 미완료다. HTTP port의 fixture fetcher는 테스트 주입이며 runtime fallback이 아니다.

## 공식 API 근거 / 미검수

[Toss 빌링 SDK 연동](https://docs.tosspayments.com/guides/v2/billing/integration), [코어 API](https://docs.tosspayments.com/reference), [인증·멱등 header](https://docs.tosspayments.com/reference/using-api/authorization)를 2026-09-26 직접 확인했다. authKey/customerKey 발급·기존 billingKey 청구·같은 orderId 조회를 각 제품 HTTP port가 사용한다. 청구 timeout은65초로 설정했다. 공급사 멱등키의15일 유효기간은 worker의 복구 기한으로 반영할 후속 범위다.

검수는 own UUID PG17 native app과 synthetic HTTP 응답이다. 실제 PG 호출/카드 청구·native callback 웹 페이지·Toss 결제창/실 브라우저 흐름·운영 세금/법무·출시 gate는 미실행이다. 로컬 서버 주소/적용 migration의 최신 사실은 CODEX_HANDOFF.md 상단을 따른다.
