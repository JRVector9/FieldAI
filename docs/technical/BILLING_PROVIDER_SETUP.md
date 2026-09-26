# 제품별 구독 PG 설정 — 구현 중

현재 구현 범위는 승인 가격의 명시 동의·SDK 카드 인증 준비·콜백의 암호화 대기 저장, Toss HTTP port·인증 발급 worker·첫 청구와 동일 주문 결과 조회다. 갱신/해지/유예·환불·제공량·콜백 페이지/결제 UI는 아직 구현 중이다. 아래 설정만으로 전체 유료 구독이 완료되지 않는다. 외부 설정은 사용자의 후속 기능 테스트 때 연결한다.

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

인증 worker는 조직→구독/인증 순서로 잠그고 공급사 호출 전에 원래 request_key·첫 시작 시각·120초 lease/claim token을 저장한다. 응답 유실/만료 lease는 unknown으로 복구하고 같은 request_key·authKey·customerKey로만 발급을 재요청한다. 원래 첫 시작 시각은 변경할 수 없으며 15일 멱등창 종료 1분 전부터 자동 발급을 중단하고 reconciliation_required로 보존한다. settings/MID/암호화 key가 없거나 달라졌을 때 미시작만 blocked_integration이고 시작한 요청은 unknown이다. 늦게 돌아온 이전 claim의 결과는 폐기한다. 성공 시 billingKey는 제품/구독 purpose로 암호화해 저장하고 authKey/callback ciphertext를 폐기한다. authorization completed는 구독 active/paid나 실제 청구 성공이 아니다.

managed mock은 양제품 인증 worker도 시작한다. 별도 실행은 저장소 root에서 해당 제품 DB/자체 환경만 사용한다.

```bash
node --env-file=infra/agent/.env apps/agent-api/dist/billing-authorization-worker.js
node --env-file=infra/field/.env apps/field-api/dist/billing-authorization-worker.js
# 위 명령에 --once를 추가하면 한 번 처리한 뒤 종료한다.
```

첫 청구 worker는 인증 발급 완료 뒤 period0/transaction/order/request를 저장하고, 날짜는 실제 승인까지 null로 유지한다. 첫 시작·MID·서버 API key의 비가역 fingerprint·customer/orderName·암호화 billingKey snapshot을 호출 전에 기록한다. 180초 lease는 조회와 청구의65초 timeout 두 번을 포함한다. 응답 유실/만료 lease는 같은 order를 GET으로 조회하고, 없음이 확인되면 원래 fingerprint/본문/멱등키로만 재요청한다. 키 변경·미시작 중지·멱등창 종료2분 전에는 새 POST를 하지 않는다. 조회는 이후에도 가능하며 기존 미상 원장을 초기화하지 않는다.

현재 `DONE`·원래 order/금액/잔액/면세/부가세·승인시각 검증 후에만 period0를 실제 approvedAt 기준으로 확정하고 paymentKey를 암호화해 저장한다. 먼저 시작한 원장이 없는 공급사 성공을 모의하지 않는다. 조회된 ABORTED/EXPIRED는 해당 시도를 실패로 확정한다. 다른 HTTP 공급사 오류는 보수적으로 unknown이며 확정 거절 분류/유예와 환불은 후속이다. HTTP fixture/provider는 테스트 주입이며 runtime fallback이 아니다.

```bash
node --env-file=infra/agent/.env apps/agent-api/dist/billing-charge-worker.js
node --env-file=infra/field/.env apps/field-api/dist/billing-charge-worker.js
```

## 명시 세금 조건과 이전 원장

새 청구용 가격에는 운영자가 `taxFreeAmount`를 명시하고 다른 운영자가 해당 버전을 승인해야 한다. [공식 세금 계산](https://docs.tosspayments.com/guides/v2/learn/tax)에 따라 total/vat/taxFree의 일치를 검증한다. 기존 supplyAmount는 total-vat의 전체 순금액이고 공급사 응답의 과세 suppliedAmount+taxFreeAmount와 대조한다. 기존 승인 가격/동의의 미지정값은 null로 보존하고 자동 청구를 blocked_integration으로 막는다. 승인본을 자동 채우지 않는다.

새 owner 동의는 명시 면세값까지 대조한다. 면세 항목이 없던 이전 가격/동의의 멱등 request digest는 그대로 복구하며, 기존 consent/가격 버전을 수정하지 않는다. 명시 면세값 없는 legacy 가입의 실제 청구는 새 승인 버전과 동의가 준비되어야 한다. API key fingerprint는 native 서버 내부 원장에만 쓰고 SDK/사업자 조회/export에 노출하지 않는다.

## 공식 API 근거 / 미검수

[Toss 빌링 SDK 연동](https://docs.tosspayments.com/guides/v2/billing/integration), [코어 API](https://docs.tosspayments.com/reference), [인증·멱등 header](https://docs.tosspayments.com/reference/using-api/authorization)를 직접 확인했고 [공식 quick reference](https://docs.tosspayments.com/guides/v2/get-started/llms-quick-reference)의15일 멱등창을 인증 worker에 반영했다(2026-09-27). authKey/customerKey 발급·기존 billingKey 청구·같은 orderId 조회를 각 제품 HTTP port가 사용한다. 청구 timeout은65초다.

검수는 own UUID PG17 native app과 synthetic HTTP 응답이다. 실제 PG 호출/카드 청구·native callback 웹 페이지·Toss 결제창/실 브라우저 흐름·운영 세금/법무·출시 gate는 미실행이다. 로컬 서버 주소/적용 migration의 최신 사실은 CODEX_HANDOFF.md 상단을 따른다.
