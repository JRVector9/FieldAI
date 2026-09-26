# Delivery backend 통합 patch — root 소유 파일

## 등록

각 제품 `business.ts`에 own type import와 `notification?: NotificationContext` runtime 필드 추가.

```ts
import type { NotificationContext } from './notification-context.js';
// BusinessRuntime / FieldBusinessRuntime
notification?: NotificationContext;
```

각 `app.ts`는 business runtime이 있을 때 기존 notifications/inquiries 등록 뒤 own new routes만 등록:

```ts
// AP
import { registerAgentDeliveryRoutes } from './notification-delivery-routes.js';
registerAgentDeliveryRoutes(app, business, business.notification);
// Field
import { registerFieldDeliveryRoutes } from './notification-delivery-routes.js';
registerFieldDeliveryRoutes(app, business, business.notification);
```

각 `server.ts`는 profile 설정 후 `notificationContextFromEnvironment()`를 한 번 읽고 own business runtime에 `notification` 전달. keys/provider를 다른 제품에서 복사하지 않는다. worker는 own `AP_DATABASE_URL` 또는 `FIELD_DATABASE_URL`만 사용.

각 API package script 추가: `start:notifications: node dist/notification-delivery-worker.js`. `test:unit`에 `test/notification-delivery.adapter.test.ts` 추가. web-push3.6.7 / @types3.6.4 설치는 root가 이미 완료했다.

`tools/mock-run.mjs`는 해당 API build/migrations 후 own worker를 현재 다른 managed worker와 같은 제어 트리에 등록. env에 실 SOLAPI/VAPID 키가 없으면 ready(blocked_integration)이며 합성 성공/실 발송 없이 pending 후보 조회만 한다. 프로덕션은 live profile 필수.

## 자체 저장용 설정

제품별 서로 다른 임의32byte base64url를 `AP_NOTIFICATION_CREDENTIAL_KEY`와 `FIELD_NOTIFICATION_CREDENTIAL_KEY`로 저장하면 외부 공급사 없이 current session/고객 기존 확인 capability의 알림 opt-in 저장·redacted 이력·명시 일일시도상한 API가 동작한다. 실제 key는 로그/문서/검수 출력에 넣지 않는다. 이 설정만으로 발송 성공은 없다.

## optional real 공급사

아래 접두사는 AP_/FIELD_ 각각 별도다. mock profile에 real SOLAPI/VAPID 설정이 있으면 boot가 실패한다. sandbox/live에서만 `*_NOTIFICATION_PROVIDER_APPROVED=true`와 전체 SOLAPI 설정이 있어야 port를 만든다. 이 flag는 계약 증빙 자체를 대신하지 않으며 출시 게이트는 별도다.

- `*_SOLAPI_ACCOUNT_ID`, `*_SOLAPI_API_KEY`, `*_SOLAPI_API_SECRET`
- `*_SOLAPI_FROM` 사전등록 발신번호, `*_SOLAPI_PF_ID`
- `*_SOLAPI_OWNER_TEMPLATE_ID`, `*_SOLAPI_CUSTOMER_TEMPLATE_ID`: 변수가 없는 일반 업무/새답변 템플릿. 이름·번호·원문·사진·접수 확인키·인증 token을 넣지 않는다.
- `*_SOLAPI_CALLBACK_SECRET` 32자 이상. [공식 callback](https://solapi.com/developers/api/webhook)의 SINGLE-REPORT에 `/integrations/v1/notifications/solapi`를 연결. secret SHA1을 X-Solapi-Secret로 전달. 원문 status는 조회 wake만 하고 확정변경/fallback을 직접 하지 않는다.
- `*_PUSH_PROVIDER_APPROVED=true`, `*_PUSH_VAPID_SUBJECT`(mailto), `*_PUSH_VAPID_PUBLIC_KEY`, `*_PUSH_VAPID_PRIVATE_KEY`.

현재 worker unknown은 조회만 한다. SOLAPI 발송의 customFields.deliveryId를 원장ID로 저장하며 응답이 유실돼 providerId가 없을 때도 own 수신번호·발신번호·타입·시작시각 범위로 페이지를 조회해 동일 deliveryId를 찾는다. 조회없음/한도100페이지 초과/계정·recipient·type 불일치/오류는 unknown, 재POST하지 않는다. 자동 공급사 SMS 대체는 disableSms=true. 카카오 미사용 3104 확정 실패와 별도 명시 sms 동의/원래 제품/상한 내일 때만 SMS 원장1건을 만든다. 신고/수신거부를 SMS로 우회하지 않는다.

## 신규 API

- `GET /v1/owner/notification-deliveries`: 현재 own 조직 member. 원문전화/cipher/비밀키/providerID 없이 최근100개 상태, 상한, provider/push 상태/public VAPID key. 후속 UI용 `canManage`, `storageState`, `ownerConsent:{maskedPhone,kakao,push}`도 반환한다. 수신설정은 자기 actor_user_id/target_id에 속한 활성 owner row만 조회한다. 다른 조직 member/owner의 번호·동의를 노출하지 않는다.
- `PUT /v1/owner/notification-limit`: own owner + current session + origin 검사, `{dailyAttemptLimit: 0..1000, costLimitAccepted:true}`. 비용 확정/차감이 아니라 한 KST day에서 시작할 외부 attempt 수 상한이다. 원격실제원가/청구는 공급사 게이트 별도.
- `POST /v1/owner/notification-consent`: own owner + current session + origin, `{phone?:string,kakao:boolean,sms:false,consentVersion:'notification-v1'}`. 번호는 미인증 자기선언으로 표시하며 전화번호 본인확인을 주장하지 않는다. 새 번호는 변경할 때만 전달한다. 활성 본인 번호가 있으면 phone 없이 kakao:true로 같은 동의를 보존하며, kakao:false는 번호 재입력 없이 철회한다. 철회에는 암호키가 없어도 현재 owner/session 확인 후 기존 동의를 폐기한다. 번호 변경/재동의는 새 동의 이후 발생 사건에만 적용한다.
- `POST /v1/owner/push-subscriptions`: own owner/current session/origin, `{subscription:{endpoint,keys:{p256dh,auth}},push:boolean,consentVersion:'notification-v1'}`. push:false는 subscription 재입력 없이 철회한다. HTTPS FCM/Mozilla/Apple 명시 host만 허용. owner당 현 활성 browser subscription 한 개이며 UI에서 교체를 명시해야 한다. HTTP201/202는 accepted(서비스접수), 열람/실단말수신이 아니다.
- `POST /v1/customer/notification-consents/:kind/:id`: **기존 own Bearer 확인 capability** 필요. AP kind=inquiry, Field kind=inquiry/reservation. `{kakao:boolean,sms:boolean,consentVersion:'notification-v1'}`; SMS=true에는 Kakao=true 필요. 번호를 body에서 받지 않고 own 원본 접수번호를 사용한다. 고객 OTP/가입을 강제하지 않는다. 기존 접수 동의를 채널 동의로 자동변환하지 않는다.

backend 최초 완료 시 UI는 미연결이었다. 승인 후속으로 아래 독립 component를 작성했으며 중앙 workspace 등록은 root가 통합한다. 실제 시안/최종 기기/고객 발송동의 흐름 인수는 별도 미완료로 유지한다.

## 보존정책/적용된 migration

AP74는 own mock에 이미 적용되어 원본 동결이며 보완은 AP78입니다. Field68은 신규 원장과 native retention cipher 파기를 포함합니다. started nonterminal 결과는 native work purge를 PAN/PFN02로 보류하며, confirmed/unstarted payload만 기존 승인된 native work purge와 같은 트랜잭션으로 NULL 처리합니다. 이벤트/사용량/원본id/상태증빙은 유지합니다. 실용접근에서는 purge로고객 번호가 사라진 뒤 채널동의를 새로 저장하거나 알림을 새로 발송하지 않습니다.

## 완료 검수

제품별 own UUID PG17 focused 각13/13, adapter각5/5, 각 API typecheck/build와 ownESLint exit0. 독립 initialreview의2P1/1P2를 red증거와함께고쳤고 repair static7649 남은P1/P2없음/confidence0.90. actual명령/failedapproach/시안직접렌더 증거는 executionplan을따릅니다. root등록/managed외부state/최종UI/실supplier는별도검수입니다.

## 고정 UI 삽입 patch — root 소유 중앙 workspace

`apps/field-web/src/field-notification-settings.tsx`의 `FieldNotificationSettings`, `apps/agent-web/src/agent-notification-settings.tsx`의 `AgentNotificationSettings`를 own workspace에 import한다. CSS는 각 component에서 이미 import한다. 기존 notification section의 바깥 special-panel/card는 component를 감싸지 않게 제거하고 section id/현재 navigation visibility를 보존한다. component가 시안 page-heading/좌우카드/하단카드를 소유한다.

```tsx
// Field workspace
<section id="owner-notifications">
  <FieldNotificationSettings organizationId={catalog.organizationId}>
    {/* 기존 notifications 조회 오류/empty/readAt/상세 열기 목록을 그대로 children에 연결 */}
  </FieldNotificationSettings>
</section>

// AP workspace
<section id="agent-notifications">
  <AgentNotificationSettings organizationId={draft.organizationId}>
    {/* 기존 notifications 조회 오류/empty/readAt/상세 열기 목록을 그대로 children에 연결 */}
  </AgentNotificationSettings>
</section>
```

props는 `{organizationId:string, defaultPhone?:string, children?:ReactNode}`다. defaultPhone은 선택이며 저장된 카카오 동의가 있으면 input에 raw 값을 채우지 않고 masked placeholder와 기존 번호 유지 안내를 사용한다. children은 기존 native 업무 이력/읽음·상세 버튼을 연결하며 새로운 발송 원장과 합쳐 readAt를 발송성공으로 해석하지 않는다.

- UI는 own relative API와 same-origin session/X-Organization-ID만 사용한다. localStorage 원장/가짜 성공/peer API 접근 없음.
- 좌측 번호/카카오/푸시/soft 안내/저장, 우측 고객알림, 하단 업무이력 순서를 그대로 사용한다. scoped CSS는 원본 card/head/form/check/input/list 및 반응형 값을 직접 이식했다. 시안 밖 상한/공급사 발송 이력/공급사·구독 상태만 `(추가)`다.
- 카카오 저장과 Push 저장은 API가 별도다. 둘째 단계 실패하면 카카오만 저장됐음을 표시하며 GET으로 다시 확인한다. 저장 응답 유실은 결과 확인 실패로 표시하고 성공/확정 실패를 만들어내지 않는다.
- Push는 실 VAPID/public-key 공급사 설정, secure context, 브라우저 지원, 실제 active ServiceWorker가 모두 있어야 새 동의를 켤 수 있다. 현재 ServiceWorker를 새로 만들지 않는다. 미연결은 정확한 checkbox 비활성 사유이며 기존 서버 동의 철회는 구독 재입력을 강제하지 않는다. 실제 지원 환경에서는 사용자 저장 동작에서만 permission을 요청하고 실제 브라우저 subscription을 encrypted API로 전달한다. 기존 다른 VAPID 키의 구독은 임의 재사용하지 않는다.
- 조직 전환/컴포넌트 종료 뒤 늦은 조회 결과는 폐기한다. 매 새 opt-in은 활성 동의 시각 이후 사건만 대상으로 유지된다. 저장/공급사접수/unknown/확정발송/읽음을 구분하고 재발송 버튼을 만들지 않는다.
- 후속 native는 own UUID PG17 최종 각2/2(38358/73161 exit0): 자기 masked GET/editor격리/번호없는 기존동의유지·철회/실 push recipient등록 후 subscription 없는철회/암호key 없는전화철회/자동app등록1회 소비. 최초backend13/13와 합산하여 전체QA 통과로 표시하지 않는다. 실제 실행 명령/로그는 execution plan을 따른다.
- 중앙 표시/최종 브라우저·320px·Push 기기/ServiceWorker·실 공급사·고객 opt-in UI는 root/사용자 후속이다. 이번 agent는 CUA 거부 이후 browser 우회나 실제 서비스 UI QA를 실행하지 않았다.

### UI 보완 증빙

후속 각2/2 검사는 초기 이력이다. owner→editor 조직 lock 경합의 실제 red200!==404를 추가 재현하고 동의 변경의 transaction 재검사를 owner-only로 보완한 최종 native AP79740/Field23567 각3/3 exit0다. Push POST 응답 유실은 브라우저 구독을 삭제하지 않고 그대로 유지한 뒤 자체 GET으로 현재 저장 상태를 확인한다. 미상 응답을 성공/확정실패로 해석하지 않는다. 명시 precommit 거절/Push POST 전 실패일 때만 새 브라우저 구독 정리를 허용한다. 이 UI 경로는 static review/타입 검수이며 실제 browser 네트워크 장애 인수는 미실행이다.

최종 UI repair static39859 terminal exit0: 두 P2 수정 확인/남은 P1·P2 없음, raw confidence0.97/0.96. 실제browser/provider결과는 이static검토에서 주장하지 않는다. 고정시안 component+중앙삽입 patch는 통합 준비 완료다.
