# A06.F08.DELIVERY — 내부 실행 원장과 외부 발송 port

## 착수 기록 — 2026-09-27

Task ID / Product / Owner: A06.F08.DELIVERY / AP와 Field 각각 / delivery 서브에이전트, root 통합
State: in_progress

- 사용자 병렬 구현 승인, AGENTS.md6.1/TASKS 상단/인계 실제 확인. HEAD fc10170. 기존 A06.IN-APP/F08.IN-APP 완료는 유지한다. root는 billing 73/67을 수정 중이다.
- 소유 범위: 각 API의 새 notification-delivery/provider/execution/worker/routes와 좁은 새 tests, AP000074/Field000068 신규 migration. 기존 inquiries/notifications/outbox 생성 코드와 root 소유 app/server/package/managed/TASKS/handoff/coverage는 수정하지 않는다.
- 관련 요구: B01~B04/B08/B10~B12, AP PRD2.8/Field3.8, QA35~40/113/148~149/151~155, G-A3/G-F2/G-I3. 기존 단일 제품 알림 책임/세대 전환을 재검사하고 새 발송만 만든다.
- 검수 예정 명령: 제품별 own UUID PG17 focused notification-delivery DB suite, 각 adapter synthetic fetch unit suite, own API typecheck/build. 동시 worker/lease/응답 유실/중복·역순 callback/한도/철회/단일주체를 실제 테스트한다. 전체 기존 DB/E2E/시각 최종 인수는 반복하지 않는다.

## 설계 결정

1. 기존 notification_events/outbox는 원본 업무 사건이다. 별도 delivery row를 event·recipient·channel별 유일하게 만든다. started_at/claim/원래 provider account/fingerprint/recipient snapshot은 HTTP 전 저장한다. lease가 끝나도 시작한 unknown을 재발송하지 않고 조회만 한다.
2. customer Kakao 확정 실패만 같은 원본 제품의 SMS fallback을 허용한다. 공급사 자동 문자 대체는 비활성화한다. 미열람·timeout·조회 없음·unknown·callback 단독 주장에는 fallback하지 않는다. 고객 발송 목적/channel consent·철회·조직 한도를 재검사한다.
3. 번호/링크만으로 원문 권한을 주지 않는다. 알림에는 이름·상담 원문·사진·확인키를 넣지 않고 일반 업무/새답변 안내만 보낸다. opt-in은 기존 고객 확인 capability/사업자 현재 로그인에서만 변경한다. 기존 접수 동의를 SMS opt-in으로 묵시 변환하지 않는다.
4. AP와 Field 각각 자체 provider/env/key/DB/worker를 가진다. 미설정과 mock의 real 공급사 실행은 blocked_integration으로 유지한다. SOLAPI는 선택적 port이며 실제 계약/카카오 템플릿/발신번호 승인 증빙을 자동 인정하지 않는다. test의 synthetic provider는 dependency injection만 한다.
5. callback은 인증·dedupe 후 조회를 깨우는 신호다. 실제 delivery 확정은 own provider 조회 결과의 원래 account/request/recipient/channel 일치 검증 뒤에만 처리한다. callback status를 그대로 신뢰하지 않는다.
6. history backfill을 새 발송으로 만들지 않는다. 수신 동의 생성 이후 발생 사건만 발송 대상으로 삼는다. 비용 한도는 조직·KST day의 reserve 원장이 lock 안에서 한 번 증가하며 결과미상 reserve를 반환하지 않는다. 새 한도는 명시 승인된 설정만 사용한다.

## 외부/최종 미완료

- 실 SOLAPI 계약/계정/발신번호/카카오 템플릿 및 webhook 설정, 웹 푸시 실 공급사/browser 권한/실 기기, 고지·비용 정책은 blocked_integration/출시 게이트로 유지한다.
- backend 최초 착수 범위에서는 새 UI가 포함되지 않았다(후속 UI 추가 승인 기록은 아래 참조). reference/field_ui_prototype_v3.html 화면 비교·전체 동선·사용자 인수는 미실행이다.
- root가 등록/런치/package/환경 설명을 통합하고 실제 명령 결과로 완료 원장/coverage/handoff를 갱신한다. 이 문서 자체 체크로 부모 전체를 완료하지 않는다.

## 진행 체크

- [x] 미상/실패/단일주체/동의/한도 DB 실패 증거
- [x] 별도 원장·worker·authenticated callback·권한 opt-in 내부 구현
- [x] SOLAPI optional port·synthetic 검수
- [x] own focused PG17/타입/빌드 검수와 독립 CLI review
- [x] root 통합 patch와 실제 결과 전달

## 기존 완료 범위의 좁은 추가 영향 — root 승인 2026-09-27

- A06.IN-APP/I06.NATIVE-REVOKE 기존 완료를 유지한다. 새 발송 상태가 생겨 기존 AP route close의 blocked/not-applicable 전용 판정은 확정 sent/failed와 시작한 unknown/accepted 구별이 필요하다. 기존 `field-notification-route-close.ts`만 승인 추가 소유하며 same action lock으로 closure/claim 직렬화 검수한다.
- F06.REPLY 기존 완료를 유지한다. Field outbox의 owner_reply payload에는 inquiryId만 있어 메시지 projection을 최근 메시지 추정으로 연결할 수 없다. root 승인으로 inquiries.ts의 optional sourceMessageId/payload/owner_reply 호출3군데만 추가한다. 새 migration은 명시 messageId만 저장하며 과거 사건에 최신 메시지를 소급 연결하지 않는다. native exact-source/projection 검수한다.
- [공식 SOLAPI callback](https://solapi.com/developers/api/webhook): 등록 secret의 SHA1 hex를 X-Solapi-Secret로 전달. constant-time 비교 후 내부 원장을 wake한다. 공급사 최종 발송 상태는 GET 조회로 확인한다.
- [공식 발송](https://solapi.com/developers/api/messages), [조회](https://solapi.com/developers/api/msg-getList), [인증](https://solapi.com/developers/api/authentication-api-key), [상태코드](https://solapi.dev/guides/message-status-codes)를 실제 읽었다. 2000/3000은 접수/처리중이고 4000은 수신완료다. 결과 미상/서버/timeout 코드는 실패로 해석하지 않는다. 고객 SMS fallback 허용은 카카오 미사용 3104 확정과 현재 동의/한도를 모두 만족할 때다. 수신거부/스팸은 문자로 우회하지 않는다.
- web-push3.6.7/@types3.6.4는 root가 공식 registry 확인/양 API exact 설치했다. 라이브러리 전역 키 설정을 쓰지 않고 own VAPID details를 전달한다. 브라우저 실제 권한/최종기기 검수는 포함하지 않는다.

## 실제 검수·완료 범위 — 2026-09-27

- [x] 별도 durable delivery/동의/비용 reserve, own worker, no-resend unknown, authoritative GET, 확정3104→SMS 한 건, authenticated callback wake 구현.
- [x] AP closure/action lock과 신규 delivery state의 확정/미상 대조. Field native reply는 exact sourceMessageId로만 projection. 양제품 native retention의 새 customer ciphertext 복사본 파기와 started unknown 보류.
- [x] 각 own UUID PG17 최종 `node /tmp/ap-notification-delivery-run-db.mjs` handle89010 / Field equivalent7245 **exit0 각13/13 fail0 skip0**. 최종 로그 `/tmp/{ap,field}-notification-delivery-final-db.log`. 테스트당 별도 자체 UUID DB, 합성 provider 주입, own current capability/role/http injection/SQL 실제 검수. 기존 native 전체QA 결과를 합산하지 않는다.
- [x] optional SOLAPI/Web Push adapter 최종 각5/5 exit0, `/tmp/{ap,field}-delivery-adapter-final.log`. 실제 HTTP 대신 injected fetch/Web Push transport만 사용한다.
- [x] 각 API typecheck27665/8386 exit0, own 파일 ESLint95866 exit0, 각 API build41765/17490 exit0. `/tmp/{ap,field}-delivery-repaired-type.log`, `/tmp/notification-delivery-final-lint.log`, `/tmp/{ap,field}-delivery-final-build.log`.
- [x] 독립 CLI static:97465 exit0 첫 P1 2/P2 1(raw confidence0.96/0.93/0.72)→POST terminal/fallback 및 반환 recipient binding·상한승인 current session 보완. POST ack의 terminal/fallback은 GET 대조만 확정한다. 실제 추가 red adapter4/5, native12/13 후 각5/5·13/13. repair7649 exit0 **No concrete remaining P1/P2 / raw confidence0.90**. 검토 에이전트는 test/실supplier를 실행하지 않았다.
- [x] root 통합 patch/등록·key 설명은 `A06_F08_DELIVERY_INTEGRATION_PATCH.md`로 제출한다. root 소유 app/server/package/managed/TASKS/handoff/coverage는 이 agent가 편집하지 않았다. git stage/commit/switch도 하지 않았다. 현재 code commit은 root 통합 때 기록한다.
- [ ] root API/worker 등록, own 환경 키와 managed runtime 반영/실 readiness. root의 실제 명령 결과 후 체크한다.
- [ ] 사용자 지정 시안 그대로 UI 연결, 고객 opt-in 동선, 실 Web Push permission/service worker/최종 여러 기기. 화면 디자인 자체는 고정이며 없는 추가 기능은 기존디자인 안에 `(추가)`로 표시한다.
- [ ] real SOLAPI 계약·발신번호·템플릿·발송·callback 실검수와 최종QA/G/가격·법무 승인. 미설정은 blocked_integration이다.

### 실패와 복구

1. port 부재 assertion 실제red exit1. 첫 native fixture는 AP release draft_revision 누락23502로 실패→현재schema의 필수 native 값을 정확히 넣었다. 기대값 삭제 없음.
2. 미상 finish의 boolean 표현식이 null을 allow_fallback에 넣어23502(actual AP6/8)→명시 boolean으로 고쳤다.
3. Field runner 생성에서 env AP→Field 분리를 잘못해 strict own-test-DB guard가 mock DB 경로를 거절했다. 이후 test fixture의 migration CLI 인자 `'agent'`가 남아 Field ownUUID DB에는 schema가 없고 관계user없음 실패였다. 의도와 달리 own AP mock에 AP74가 적용됐음을 root의 실제 DB 조회로 확인했다. 적용된 AP74는 처음 작성한 원본을 보존하고 모든 보존정책 추가 변경을 **새 AP000078**로 분리했다. Field fixture 인자 field와 제품별 env/DB guard로 수정, 이후 Field ownUUID schema/native green. 실제 운영 DB/외부발송/고객자료 복제·삭제는 없었다.
4. Field inquiry_messages 기존check가 blocked_integration projection을 거절23514(7/8)→아직 local runtime 미적용인 신규 Field68에서 명시 상태를 확장했다.
5. AP old route close는 sent에서도409(actual9/10)→같은 actionlock 아래 started nonterminal 존재를 검사하고 sent/failed·안전한미시작 상태만 허용했다.
6. 기존 retention은 row DELETE가 아니라 tombstone UPDATE였다. FK가 현재 purge를 막는다는 초기 추측은 실제코드 확인 후 폐기했다. 실제 추가 ciphertext 미정리와 unknown 보류가 native각10/12 red로 재현돼 AP78/Field68에서 연결했다. 표본 원본/이벤트/비용 metadata는 유지한다.

### 실제 시안 확인과 UI 연결 정보

`reference/field_ui_prototype_v3.html`을 실제 Chromium으로 열었다. 최초 owner/notifications hash는 빈 사용자 start 화면으로 바뀌어 알림설정확인으로 주장하지 않았다. 이후 시안 자체 `seed3()` 예시 상태와 `go('owner/notifications')`로 알림설정을 실제 렌더했다. 1440x1000 screenshot `/tmp/delivery-prototype-owner-notifications-seeded.png`를 직접 시각 확인했다. DOM heading/본문·번호 input·Kakao/Push checkbox·설정저장 버튼·고객우선Kakao/실패SMS 안내·하단이력의2열 구성이다. 시안 파일은 수정하지 않았다. 실제 서비스 화면 디자인/flow 최종 검수는 아직 하지 않았다.

- 시안 좌측 `사업자 알림 번호/카카오 업무 알림/웹 푸시/설정 저장` → own current-session consent와 Push subscription API; 기존위치/색/글자/간격보존.
- 시안 우측 `고객 답변 알림` → 원제품 Kakao→확정실패만SMS, unknown/미열람 중복 없음, 사업자 SMS대체 없음 문구보존.
- 시안 하단 `시안 이벤트 이력` → 기존 native notification events + 새redacted delivery history; 저장/blocked/accepted/unknown/sent/failed/읽음 구분. title만 실제서비스 이력으로표시. 카카오accepted/푸시accepted를 실단말수신으로 바꾸지 않는다.
- 시안에없는 일일시도상한/비용동의와 channel 상태·고객명시opt-in은 root가 같은 디자인 안에 `(추가)`로 연결한다.

## 다음 agent 정확 명령

```bash
cd /Users/jr/Desktop/projects/FieldAI
sed -n '1,68p' TASKS.md
git status --short
cat docs/technical/A06_F08_DELIVERY_INTEGRATION_PATCH.md
node /tmp/ap-notification-delivery-run-db.mjs
node /tmp/field-notification-delivery-run-db.mjs
pnpm --filter @fieldai/agent-api exec tsx --test test/notification-delivery.adapter.test.ts
pnpm --filter @fieldai/field-api exec tsx --test test/notification-delivery.adapter.test.ts
```

위 focused 검수는 새 변경/통합에 concrete risk가 있을 때만 재실행한다. 기억 부재로 완료 backend 전체를 다시 만들거나 검수를 반복하지 않는다. AP74/78·Field68 적용 여부는 실제 pgmigrations를 확인하고 적용 원본을 수정하지 않는다.

## 승인 후속 범위 — 고정 알림 설정 UI (2026-09-27)

- Task: A06.F08.DELIVERY.UI / backend 최초13/13·adapter5/5·review 증빙은 위 완료 이력으로 보존한다. 새 화면 연결만 in_progress다.
- root 추가 소유 승인: 새 `apps/field-web/src/field-notification-settings.tsx/.css`, 새 `apps/agent-web/src/agent-notification-settings.tsx/.css`; 현 own delivery routes의 자기 actor masked phone/kakao/push/canManage GET와 번호 재입력 없는 기존 동의 보존·철회, 기존 focused DB tests. 새 schema 없음. workspace/공통 CSS/app/server 등록은 root가 소유한다.
- 시안 ownerNotifications3 HTML/CSS 원문을 직접 읽었다. 1.55fr/1fr 2열·gap24·card padding26/radius23·form gap21·soft padding17/19/radius14·하단 mt24·원래 checkbox/번호/저장/고객 안내 순서를 보존한다. 원본850px 1열,520px card20/radius18,720px 제목28px 반응형을 그대로 적용한다. 추가 상한/공급사 상태·발송 이력만 `(추가)`로 표시한다. CUA file URL 보안 거부 후 브라우저 우회/다른surface 실행 없이 이번 후속은 로컬 HTML/CSS 원문만 사용한다. 앞의 screenshot은 과거 이력이다.
- 요구/QA: AP2.8/Field3.8, QA35~40/113, G-A3/G-F2; 자기 actor 수신설정만 노출, 원문번호/비밀키 노출 없음, owner current session·own organization·현재 동의·정확 blocked/accepted/unknown 표시. 실제 ServiceWorker/VAPID/Push권한 없으면 정확한 비활성 사유다. 가짜 구독/저장/발송 성공 없음.
- 검수: 새 current-owner GET/재입력 없는 철회·보존/actor 격리/등록 소비를 own UUID PG17 좁은 test-name pattern으로 red→green; own 양웹 및 API typecheck·own lint. 디자인 source 대조는 구현 확인이며 사용자 최종 UI/기기 인수·실 공급사·전체 QA는 미실행으로 남긴다. root 삽입 패치 제출 후 중앙 등록은 root의 실제 evidence로만 체크한다.
- [x] 자기 actor masked GET / 번호 없는 철회·보존 / native 추가 검사
- [x] 고정 시안 알림 component/CSS와 정확 차단 상태 구현
- [x] own 검수/미실행/중앙 삽입 patch 전달

### 후속 UI 실제 검수/실패 기록

- own UUID PG17 focused `node /tmp/ap-notification-settings-run-db.mjs` 최종38358 / Field73161 terminal exit0 각2/2, fail0/skip0. `/tmp/{ap,field}-notification-settings-final-db.log`. 새 GET 자기actor masked/othereditor격리, 기존동의 무번호 유지·철회, 실native Push recipient 저장 blocked→subscription 없이철회, key없는철회, createApp 자동등록1회와 synthetic runtime.notification 주입을 검수했다. 기존 별도 Fastify fixture는 route1회 narrow 등록이며 자동app등록 소비케이스는 수동등록하지 않는다.
- 각 API typecheck25109/22032 terminal exit0, `/tmp/{ap,field}-notification-settings-api-type.log`. 최초 UI typecheck8983/10080 terminal exit0. 최종 source누락/조회실패label 보완 후 UI typecheck·own lint·static audit 결과는 완료 후 아래 기록한다.
- 초기 추가 DB 검사66625/85675 exit1은 test SQL literal 안의 Synthetic quote 이식오류로 transform 단계에서 멈췄다(기능 assertion red로 주장하지 않는다). fixture SQL을 placeholder로 바꿔서 각2/2 exit0(28895/33141), Push/key없는철회 케이스 확장 후 위최종각2/2. 실패기대값/테스트 삭제 없음.
- root source대조에서 최초 이식의 card h2/h3 override 누락이 발견돼 원본 `.v3-card h2{font-size:21px;margin-bottom:8px}`/h3=18과 card p=15px/varmuted·listfirstchildborder0를 그대로 추가했다. 신규 디자인 조정이 아니다. data null/조회실패는 공급사미연결로 단정하지 않고 현재확인불가를 표시한다.
- backend 최초13/13/adapter5/5/repair7649/실제시안과거snapshot 이력은 그대로 보존한다. 이번 추가 UI를 실제 browser/기기/실provider에서 인수검사하지 않았다. 디자인검수는 local HTML/CSS source 대조다. CUA 보안거부 후 다른surface/browser우회 실행 없음. 전체회귀/최종QA/G/실SMS/Kakao/Push 호출도 미실행이다.

### UI narrow review 보완 — 기존 backend 근거 보존

- 최초 UI static90867 terminal exit0는 P2 2건(raw confidence0.91/0.96)이었다. owner→editor downgrade 뒤 consent의 transaction 재검사가 editor를 허용하는 경합과, Push 등록 응답 유실 뒤 새 browser subscription을 즉시 지워 이미 저장된 서버 동의를 고립시키는 문제다. `/tmp/notification-settings-audit-result.md`, `...audit.log`. 정적 review이며 해당 도구는 실제 tests/외부 호출을 실행하지 않았다.
- 권한 경합은 조직 row lock을 실제 보유한 transaction과 pg_stat_activity의 Lock wait를 확인한 own native 추가 case에서 AP29646/Field17660 **각 exit1,200!==404**로 재현했다. 재검사를 owner-only로 좁혔다. Push subscription은 POST 결과미상/5xx/네트워크 유실에는 보존하고 POST 전 실패·명시 precommit4xx/503 거절만 새 browser subscription 정리를 허용한다. PushPermission 거부 후 현재 비활성사유도 갱신한다. 실 browser 장애 재현은 하지 않았다.
- 보완 뒤 `node /tmp/{ap,field}-notification-settings-run-db.mjs`: AP79740/Field23567 terminal exit0 **각3/3 fail0 skip0**. `/tmp/{ap,field}-notification-settings-repaired-db.log`. 이전 각2/2는 이력으로 보존한다. 전체 기존13/13을 기억 부재로 반복하지 않았다.
- 보완 후 양웹 typecheck2021/87434 terminal exit0(`/tmp/{ap,field}-notification-settings-repaired-type.log`), own6파일 ESLint40836 terminal exit0(`/tmp/notification-settings-repaired-lint.log`). API 타입 검수25109/22032 exit0 근거도 보존한다.
- 좁은 repair static39859 terminal exit0는 **두 P2 repair 확인/남은 P1·P2 없음**(raw confidence 권한0.97/Push0.96). `/tmp/notification-settings-repair-audit-result.md`, `...audit.log`. read-only/static이며 자체 tests·browser·provider 인수 없음.

### 후속 현재 상태와 다음 연결

- 내부 UI component/CSS·자기actor consent API·focused native 검수는 root 통합 준비 완료다. 새4웹파일+own routes/tests2씩과 이2문서만 후속 소유 변경이며 schema 변경은 없다. 원래 backend migration/13·adapter5 결과와 기존 완료 이력은 보존한다.
- 기존 root 중앙 workspace의 notification section에 component를 넣고 기존업무 목록/읽음 버튼을 children으로 연결하는 patch는 `A06_F08_DELIVERY_INTEGRATION_PATCH.md`의 마지막 section이다. 중앙등록/managed runtime/사용자 최종시안 인수/실 ServiceWorker·기기/고객동의 UI/실supplier는 아직 남는다. 부모A06.F08.DELIVERY 전체 완료나 출시 승인으로 표시하지 않는다.
- root 소유 TASKS/coverage/handoff/공통files/Git stage·commit는 delivery agent가 수정하거나 실행하지 않았다. root가 코드 포함commit과 실제 통합 검수 후 이완료범위를 원장에 연결한다.
- 이번 후속 exact commands: `node /tmp/ap-notification-settings-run-db.mjs`, `node /tmp/field-notification-settings-run-db.mjs`, `pnpm --filter @fieldai/agent-web typecheck`, `pnpm --filter @fieldai/field-web typecheck`. 이들은 신규변경이 있을때만 좁게검수하며 기존범위를 기억부재로 다시구현하지 않는다.

- 최종 owner-only/native경합 추가 이후 양API typecheck AP41287/Field66807 terminal exit0. `/tmp/{ap,field}-notification-settings-final-api-type.log`. own문서/승인기존2파일 `git diff --check` exit0. 실제 완료code commit은 root통합 이후기록한다.

## 내부 완료 체크와 중앙 반영 (2026-09-27)

- [x] **A06.F08.DELIVERY.INTERNAL** 제품별 encrypted 동의/recipient·durable worker/lease/order/일일 시도 cap·unknown GET 대조/중복 방지·단일 알림 주체·확정 실패/명시 동의 SMS fallback·webpush port/404·410 회수·retention ciphertext 정리·owner 자기설정/철회·기존 이력 보존 UI. 코드 **ef0dfd3**, AP74/78·Field68·notification 모듈/검사·양관리실 component/CSS. own UUID PG17 각13/13+추가 설정/권한 각3/3, adapter 각5/5 exit0; backend7649/0.90·UI39859 재검토 P1/P2 없음. **고객 채널동의 UI/서비스워커·실발송·실기기/최종 화면 인수는 제외**한다.

managed95896 AP78/Field69·최신 양API/web build/ready·양웹200·새API401·자체workers ready를 root가 실제 확인했다. 현재 TASKS40[x]/7[ ]이며 전체 출시 완료가 아니다. 상세 현재 결과/미실행/다음 명령은 CODEX_HANDOFF.md 상단을 따른다.

## 현재 추가 단계 — A06.F08.CUSTOMER-CONSENT-PUSH (2026-09-27)

Task ID / Product / Owner: A06.F08.CUSTOMER-CONSENT-PUSH / AP·Field 독립 / Delivery Agent
State: verified (내부 범위) / 착수 HEAD9a7fe33, root TASKS·paid계획 변경중; 기존40[x]/DELIVERY.INTERNAL ef0dfd3 완료는 유지한다.

- 소유: 양제품 새 customer-notification-consent model/component/CSS·notification-push-client model, public own notification-sw.js; own owner notification settings의실SW/구독 연결부; AP agent-public의 접수·후속대화 component삽입만, Field field-receipt/field-public/field-booking의component삽입만. 새 focused web unittests·기존 notification DBtest 추가case. 공동 app/server/business/package/mock-run/workspace/proxy/공통문서/Git/runtime는 root 소유. 실제 서비스워커/동의 흐름 외의 기존 화면 디자인/업무 로직을 재설계하지 않는다.
- root 추가 승인: own notification-delivery-routes.ts의 기존 확인cap 기반 redacted 고객 GET와 contextkey 없는 false/false 철회·관련native만. 신규 schema 없음. 현재 POST만 있어 새 UI가 기존동의를 조회/응답유실후복구할 수 없고, false/false도key없음503이라 철회가막히는 현재코드가 구체적 추가근거다. 기존 ef0dfd3 원장/미상재발송 금지/worker/provider는 재구현하지 않는다.
- 요구/QA: AP2.5/2.8, Field3.8, QA20/35~40/113/148~149/G-A3/G-F2. 자기접수cap만 사용, 번호/OTP/가입으로 대화 권한을 주지 않는다. 서비스알림과홍보동의분리, 채널별명시동의·번호재입력없는철회, 새동의의사건시각·원래단일주체/미상재발송 금지보존. native 업무종결/retention/현재cap와확인키교체를 존중한다.
- 디자인기준: reference/field_ui_prototype_v3.html intake3·leadSuccess3·customerConversation3·access3·ownerNotifications3 원문을 직접읽었다. 현재서비스 화면삽입에원본 v3-soft/check/btn/card색·패딩·글자·간격값을재사용하며 시안없는 고객채널설정/푸시준비만 `(추가)`다. fileURL정책거부 이후 우회/다른browser표면사용없음. 실제실기기/전체시각/공급사발송은사용자후속이다.
- 검수계획: 새client consent의 owncap/no-phone/no-marketing/응답유실GET복구·실SW등록/지원거부/permission거부/구독저장미상보존/철회구독정리 clientflow를 injected browser/fetch 단위로 실제 red→green. native고객GET cap/철회/key없음/기존번호동의·업무종류/배타적APField·unknown추가POST없음을 ownUUID PG17 test-name pattern으로 검수. public SW push/click handler는 node VM의합성event로 민감내용 미노출/own관리실만open/실showNotification promise검사. 양웹/APItype·ownlint·양웹build 및 승인fallbackgpt6sol/high 좁은readonlyreview clean. 전체기존E2E/QA와실기기/실provider/실permission성공은미실행으로남긴다.
- Field customHost의 새고객동의path는 기존proxy deny목록에없으므로 root exactpatch로연결한다. backend ownorigin은기존운영승인customdomain을검증해야하며 타host·타업무는거부한다. 소유외proxy/공통등록은직접수정하지 않는다.

### 이 단계 체크

- [x] customer redacted GET/현재cap·key없는철회 native
- [x] own 고객 서비스채널 component·접수/후속 UI 연결
- [x] 실제SW/push 준비·구독등록/철회·미상복구 내부clientflow
- [x] focused tests/type/lint/build 및 narrowCLI review
- [x] root 통합patch·완료/미검수 보고

### 푸시 내부 구성 추가와 중앙 patch

- own public `{agent,field}-notifications.webmanifest`도 새 소유 범위로 추가한다. start_url은 own `/workspace`, scope `/`, standalone display다. 사용자 홈 화면 설치/실단말 인수는 미실행이다. 중앙 layout metadata manifest/Apple standalone 등록은 root exactpatch로 제안하며 직접 수정하지 않는다.
- 실제 공식 문서 [WebKit iOS·iPadOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [WebKit16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/), [MDN PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)를 조회했다. iPhone/iPad 홈화면 standalone과 사용자 저장 클릭에서 permission을 바로 요청하는 내부 흐름을 적용한다. 사용자가 일반탭이면 정확한 홈화면 안내, 공급사/VAPID없으면 blocked이며 준비만으로 permission/발송 성공을 주장하지 않는다.
- own cap/current source 재확인은 organization lock 뒤 같은 transaction source `FOR SHARE`와 retention 조건으로 수행한다. Field published slug/운영 승인 customHost가 source organization에 속할 때만 customer Origin을 허용한다. 명시된 cross-site·다른 Host/업무는 거부한다. root receipt-abuse guard와 customHost proxy patch가 등록돼야 최종 통합된다.
- native 첫 red AP76084/Field24724 exit1 각0/2(GET404, cap회전경합200); 보완 green AP37920/Field19487 terminal exit0 각2/2 fail0 skip0. `/tmp/{ap,field}-customer-notification{-red,}-db.log`. 기존13/13완료 검사를 반복하지 않았다. unit red는 새model부재 module-load exit1이며 기능assertion red로 주장하지 않는다.
- 중간 타입 API56474/38533 terminal exit0; 양웹12753 exit2/93188 exit1은 root작업중 billing-return만2오류였다. 자기모듈/import.meta 오류는 사라졌으며 root에 보고했다.

- key없는철회 추가근거: 기존 ef0dfd3 `allowedOrigin(context?.webOrigin)`은 key 없는context에서 실제browser POST Origin을403으로거부한다. 기존 native noKey는 Origin없음이었다. own customer 신규경로에서만 제품 PUBLIC_WEB_ORIGIN(제품 mock 기본origin) 검사를 key와 독립시킨다. owner 기존경로/다른provider는 범위밖이다. actualbrowser같은 Origin·sec-fetch-site=same-origin native assertion을먼저확장한다.

- 좁은 독립CLI61811 gpt-6-sol/high readonly는 설치/대기중 다른 SW를 active-only검사가 임의교체할수있는 P2 1건/rawconfidence0.88을 보고했다. 실test/browser/provider를 실행하지 않은 staticreview다. actual injected unit에 installing/waiting 다른ownoriginSW를 추가해 red먼저확인 후 모든worker slot검사로 보완한다. cap/발송키/원문을읽거나출력하지 않는다.

- repair29772 static는 최초P2 repair확인과 mixed active own + foreign pending 상태의 enable/inspect 미차단 P2 1건/conf0.88 추가를보고했다. 동상태 actualunit을먼저red로확인후 준비뿐아니라inspect/enable에도foreignslot검사를연결한다.
- root owner추가승인: ef0dfd3 owner key없는false철회의actualOrigin도403이므로 기존완료를유지하고 owner-only ownenv fallback 비교·기존focusedowner noKeycase의Origin assertion만추가한다. 권한/새번호/암호화정책/provider 변경은없다. 명령은 ownUUID runner의 test-name-pattern을 해당 owner settings expose1case만지정하여red→green하고 APItype/lint/readonly repair다.


### 이 단계 실제 완료 증거 — 2026-09-27

- 고객 own UUID PG17 최종: `node /tmp/ap-customer-notification-run-db.mjs` AP49974 terminal exit0 **5/5 fail0 skip0**; Field58271 **6/6 fail0 skip0**. `/tmp/{ap,field}-customer-integrated-final-db.log`. currentcap GET/no rawphone·번호접근금지/SMS-only거부/actualOrigin key없는철회·cap회전orglock경합·native payload purge경합·withdraw unknown원장의POST1회/같은시도lookup유지·기존receipt guard의새path→5번실패429/원source동일한도·성공후정리, Field reservation 별도cap/ownpublishedslug/현재verifiedcustomHost/foreign·expired403을 실제 검수했다. peerenv 제거/Node24.18.0/각 own55431 또는55432 PG17/테스트당새UUID DB, 테스트 provider는synthetic주입이다. 실제 provider발송없음.
- key없는 actualOrigin 고객철회 actualred AP69730/Field70430 terminalexit1(403!==200)→30475/61403 exit0 각4/4·5/5. guard 미등록 red57821/40995 exit1(404!==429)→위final각5/5·6/6. 기대값/실패테스트삭제없음. 이전2/2·4/4·5/5는 단계이력이며 최종으로합산하지 않는다.
- 추가 승인 owner actualOrigin: 기존 ef0dfd3 완료 유지. AP29541/Field46777 실제1/1 red exit1(403!==200)→최종94251/49665 terminalexit0 **각1/1 fail0 skip0**. `/tmp/{ap,field}-owner-keyless-origin-complete-db.log`. 기존owner masked/privacy·actor격리·동의유지검사의 noKey철회에 phonefalse/pushfalse actualownOrigin과foreign403만추가했다. 기존전체3/3/13/13를기억부재로반복하지 않았다.
- Browser/client/worker unit: `pnpm --filter @fieldai/{agent,field}-web exec tsx --test test/customer-notification-consent.test.tsx` 최종19046/49962 terminalexit0 **각9/9 fail0 skip0**, `/tmp/{agent,field}-customer-notification-repaired-unit.log`. Browser환경/fetch/SW event는injected합성이고 실제기기권한/실push수신으로주장하지 않는다. SW install/activate waitUntil·generic push노출·own관리실click을nodeVM으로실행했다. lostPOST는GET1회로대조하고새POST없음, newlycreatedsubscription은unknown에보존하며확정거부만정리, 철회는server확정뒤ownactive subscription unsubscribe다.
- SW P2 red: 설치/대기foreignslot actualunit각7/8 exit1→각8/8; ownactive+foreignpending actualunit각8/9 exit1→위최종각9/9. prepare/inspect/enable 모두경쟁worker검사이며 unrelatedSW를등록/교체/해제하지 않는다. disable은server동의철회후ownactive구독만정리한다.
- 타입: APweb93918/Fieldweb8716/API14788/57399 **모두terminalexit0**, `/tmp/{agent,field}-{web,api}-customer-repaired-final-type.log`. own20파일 ESLint24992 **exit0**, `/tmp/customer-notification-repaired-final-lint.log`; serviceworkerJS도포함했다. booking 추가component를대화card안·기존tools앞의visible 위치로최초삽입누락을고친뒤 Fieldtype78399 exit0/해당filelint exit0. 기존예약업무/route부분은재배치하지 않았고, 외부AP예약의채널동의만으로담당이바뀌지않는설명을추가했다.
- 양웹 build: AP92394/Field69238 **terminalexit0**, `/tmp/{agent,field}-customer-notification-complete-build.log`. booking삽입위치최종반영뒤 Field52543 **exit0**, `/tmp/field-customer-notification-placement-build.log`. 초기build91893/35962 exit1·types96844/53020 exit2는동시rootTDD중새billing-mutation-client module부재였고, root가구현완료통보한뒤위gate만다시실행했다. 실패를성공으로주장하거나타작업파일을직접수정하지않았다.
- 독립 static CLI:61811 P2 1(conf0.88)→repair29772 기존repair확인+새P2 1(conf0.88)→최종96633 **terminalexit0 남은concreteP1/P2없음/rawconfidence0.88**. `/tmp/customer-notification-{audit,repair,final-repair}-result.md`와동명.log. 승인fallbackgpt-6-sol/high·read-only·명명scope에만수행했고 해당reviewer는tests/browser/실provider를실행하지않았다. owner Origin/finalSWrepair를함께확인했다. 최종추가booking위치는단순component삽입·안내이며타입/lint/build검수이고별도browser/기기review는하지않았다.
- source와기존삽입부 `git diff --check` 실제exit0. 코드포함신규commit은root통합후기록한다. 이agent는Git stage/commit/switch·centralruntime재기동·운영삭제·실고객메시지/청구/외부배포를실행하지않았다.

### 결정과 남은 인수

- 신규schema/migration/package/외부공개계약 변경없음. 자기cap/source/retention만사용하고카카오/SMS동의는서비스알림에한정한다. 전화번호/OTP가입이조회권한이되지않으며원문번호/키/endpoint를GET에내보내지않는다. customerFalse/False와ownerFalse는key를재입력하지않고실제ownOrigin으로철회한다. 채널동의가알림담당을전환하지않는다.
- 화면은 `reference/field_ui_prototype_v3.html` 고정원본HTML/CSS기준을보존했다. 접수성공/후속문의/예약card에고객옵션만추가하고제목/저장/푸시준비에 `(추가)`를표시한다. owner번호/Kakao/Push/저장·우측고객설명·하단원래이력은그대로며위치/색/글자/메뉴재디자인없음. CUAfileURL거부우회/다른surface사용없고시각판정은local source대조에한정한다.
- root가receipt-abuse/proxy/layoutexactpatch를반영했다고알렸고현재코드에서확인했다. guard는위native에서실제소비했다. Fieldproxy/customHost의최종browser Host동선과metadata/SW 실제HTTP반영은root managed통합및사용자최종검수다. 중앙등록은마지막integrationpatch를따른다.
- [ ] ownmanaged최신빌드/서비스워커·manifestHTTP/사업자로그인·고객동의화면실runtime연결은root중앙통합증거로기록.
- [ ] 사용자실기기홈화면설치/실permission/실subscription·알림수신·최종320px전체시안/동선인수와실SOLAPI/VAPID/콜백 공급사검수. 미설정provider/VAPID는blocked_integration이며브라우저준비는발송성공이아니다.
- [ ] 실제운영보안/가격·법무승인/전체QA-G는부모미완료원장에유지. 이전완료ef0dfd3/40[x]를되돌리거나재구현하지않는다. root TASKS/coverage/handoff/Git중앙등록은root가소유한다.

### 새 범위의 정확한 후속 명령

새 구체변경이 있는 경우에만:

```bash
cd /Users/jr/Desktop/projects/FieldAI
node /tmp/ap-customer-notification-run-db.mjs
node /tmp/field-customer-notification-run-db.mjs
node /tmp/ap-owner-keyless-origin-run-db.mjs
node /tmp/field-owner-keyless-origin-run-db.mjs
pnpm --filter @fieldai/agent-web exec tsx --test test/customer-notification-consent.test.tsx
pnpm --filter @fieldai/field-web exec tsx --test test/customer-notification-consent.test.tsx
pnpm --filter @fieldai/agent-web typecheck
pnpm --filter @fieldai/field-web typecheck
```

위 /tmp native runner는ownlocalmock URL/제품port/user guard뒤outerownUUID를생성하고peerenv제거+test-name-pattern(customer channel 또는owner settings expose)만실행한다. fixture도자체UUID를만들고현재own제품migration으로검사·정리한다. /tmp가없는다음환경은sameguard/selection으로재생성해야하며직접mock DB에이fixture를실행하지않는다. 기존완료테스트전체를다시실행할명령으로해석하지않는다.


## root 승인 좁은 fixture 호환성 — A07.F09.RENEW-CANCEL-ACCESS.BACKEND (2026-09-27)

- State: verified (fixture 호환성만). 기존 ef0dfd3[x]/RENEW-CANCEL-ACCESS.BACKEND를유지한다. root가새AP79/Field70 refund guard와기존billing-lifecycle.db.test.ts252 refunded_amount 직접UPDATE의구체PAB06/PFB06 충돌을보고하고단일casefixture보완을위임했다.
- 소유: 양API `test/billing-lifecycle.db.test.ts`의 `refunded or test-only payment cannot reopen mock or live paid access` 1case + 해당case가정상환불원을만들수있는최소fixture port/approver 반환만. source/migration/다른case기대값/UI/공통rootpaidplan은수정하지않는다. 계획을이deliveryplan에먼저기록해rootpaidplan동시편집을피한다.
- 요구/QA: 원래QA43~46/113/126/146의fullrefund는기존기간의paidaccess를되살리지않으며testmode결제로liveaccess를열지않는다. original cleanup_only 기대값을유지하고owner환불요청→operator검토→다른operator승인→syntheticrefundworker→확정원장으로정당한fullrefund를만든다. trigger우회/약화없음.
- 검수명령: 기존ownUUID lifecycle runner를copy하고 `tsx --test --test-name-pattern 'refunded or test-only' test/billing-lifecycle.db.test.ts` 1case만실행한다. AP/Field실제red→green·양APItype·해당2filelint·diffcheck. 다른18case/전체회귀·실provider·runtime/git은실행하지않는다. 정상refunddbtest/workercontract를read-only대조했다. test-onlyfixture호환성이고운영source변경이아니므로독립review필요성은실제diff후판단한다.


### fixture 호환성 실제 완료

- [x] AP/Field 단일 기존case의원래 `cleanup_only` 기대값보존 +정상owner요청/operator검토/다른approver승인/syntheticworker환불원장으로fixture이행. 변경은두testfile 해당case와fixture return의approver 1property뿐이다.
- actualred AP11834/Field70076 terminalexit1 **각0/1**: AP `PAB06`/Field `PFB06`, `billing_refunded_amount_guard`의원장없는직접UPDATE차단. `/tmp/{ap,field}-billing-lifecycle-refunded-red.log`.
- actualgreen AP61750/Field99164 terminalexit0 **각1/1 fail0 skip0**, `/tmp/{ap,field}-billing-lifecycle-refunded-final.log`. `node /tmp/ap-billing-lifecycle-refunded-run-db.mjs`와Field명령. Node24.18.0/own55431 또는55432 PG17/peerenv제거/outer및fixtureUUID/migration포함, mocked refund port는해당case에서만주입했다. fullrefundstate/refunded_amount=total_amount·providerPOST정확1회·두기존접근제한assertion을실제유지했다.
- 양APItypecheck46326/48201 terminalexit0, `/tmp/{agent,field}-billing-lifecycle-refunded-type.log`; `pnpm exec eslint apps/agent-api/test/billing-lifecycle.db.test.ts apps/field-api/test/billing-lifecycle.db.test.ts`34666 exit0(`/tmp/billing-lifecycle-refunded-lint.log`); 해당diffcheck exit0.
- 미실행: 다른lifecycle18case·전체회귀·UI/browser/build·운영provider/실환불/runtime/git. source/trigger/schema/운영또는mockDB fixture는수정하지않았다. ak CLI는user-facing code변경시에필수이며이번test-only호환성은신규CLI생략했고cleanreview를새로주장하지않는다. 기존delivery검토와합산하지않는다. root가paidplan/TASKS/handoff에이재개증거/commit를연결한다. 기존ef0dfd3[x]를되돌리지않는다.
