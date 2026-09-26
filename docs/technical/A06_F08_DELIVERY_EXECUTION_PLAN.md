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
