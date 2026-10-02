# Field 제품 읽기 전용 코드 리뷰 (main 84af59a, 2026-10-02)

- 범위: apps/field-api, apps/field-web
- 파일 수정 없음, 테스트 미실행(정적 검토)
- 아래 결함은 모두 실제 코드에서 줄 번호까지 확인했다. 단 [A]는 서브에이전트가 보고했고 핵심 줄만 직접 봤다.

## 높음

### H1. API에 trustProxy가 없음: 고객 확인키 잠금 DoS와 신고 한도가 전역화됨
- **위치**
  - `apps/field-api/src/app.ts:49`: `Fastify()`를 옵션 없이 생성
  - `apps/field-web/next.config.ts:12-14`: `/v1/*`를 Next rewrite로 API에 넘김
  - 결과적으로 `request.ip`는 모든 고객에게 같은 Next 서버 주소다.
- **영향**
  - `receipt-abuse.ts:22`는 실패를 (대상, IP) 단위로 세서 잠근다. IP가 모두 같으므로 사실상 예약·문의 ID 하나 단위가 된다.
    - 공격자가 접수 ID만 알면, 틀린 키로 5번 요청해 실제 고객을 15분 동안 429로 막는다(조회·수락·취소·메시지·사진 전부). 이를 계속 반복할 수 있다.
  - `site-moderation.ts:80`의 IP 한도(15분 5건)는 플랫폼 전체가 함께 쓰게 된다. 아무나 신고 5건을 넣으면 모든 사이트의 신고가 막힌다.
- **수정**: `Fastify({ trustProxy: <Next/LB 주소·hop> })`로 바꾸고, 앞단에서 X-Forwarded-For를 보장한다.

### H2. 사용자 도메인이 대표 주소인 사이트는 AP 위젯 설치·소유 증명이 항상 실패함
- **원인**
  - 웹은 배포 목록을 대표 주소(`siteOrigin`)로 거른다: `apps/field-web/src/field-ap-connections.tsx:100-102`.
  - 그런데 증명 저장(`:113`)과 설치(`:125`) 요청 body에 `origin`을 보내지 않는다.
  - API의 `activeSiteOrigin`은 `requested===undefined`이면 기본 slug 주소를 쓴다: `custom-domains.ts:61`, `sites.ts:171`, `sites.ts:248`.
- **영향**
  - 설치 요청의 배포 origin(사용자 도메인)과 서버 origin(기본 주소)이 달라 거부된다(deployment_not_allowed 계열).
  - 증명값은 기본 주소 기준으로 저장되어, AP가 사용자 도메인의 `/.well-known/ap-site-verification`을 확인하면 실패한다.
  - "공개 사이트 열기" 링크(`:229`)는 `hostname.split(".")[0]`으로 만들어져 `/site/www` 같은 주소가 되고 404다.
- **수정**
  - 두 POST에 `origin: siteOrigin`을 추가한다.
  - 링크는 API 응답의 slug나 `defaultOrigin`으로 만든다.

### H3. 카드 등록(issue) 확정 거절도 영구 `unknown`이 되어 조직이 유료 결제를 다시 시작할 수 없음 [A, 핵심 줄 확인]
- **원인**
  - `billing-authorization-execution.ts:82-85`가 issue의 모든 예외를 삼킨다. 이후 `:93-95`에서 `unknown`으로 기록된다.
  - `toss-billing.ts:40-42`의 `declined` 분류는 `operation==='charge'`일 때만 적용된다.
  - 15일이 지나도 `:48`에서 `unknown`/`authorization_reconciliation_required` 상태로 남는다.
- **출구가 없음**
  - 소유자 취소: `billing-consent-routes.ts:157`의 허용 목록에 `unknown`이 없어 409가 난다.
  - 새 구독: `open_subscription_exists`로 막힌다(에이전트 보고, `billing-consent-routes.ts:101`).
  - 운영자 reconcile API도 없다.
- **시나리오**: 만료 카드로 등록하면 Toss가 4xx를 준다. 화면은 영구 "처리 중"이고, DB를 직접 고치기 전까지 결제할 수 없다.
- **수정**
  - issue에서 HTTP 4xx와 형식이 맞는 오류 코드는 `failed`로 확정한다. 돈이 움직이지 않는 단계다.
  - billingKey가 저장되지 않은 `unknown`(window 경과분)은 소유자 취소를 허용한다.
  - 운영자 정리 경로를 둔다.

### H4. 희망시간 예약을 "정책 없이 공개 가능"하게 한 수리(5b90ef5/80cfeb0)가 반쪽임: 사업자가 확정할 수 없음
- **고객 쪽**: 정책이 없어도 request 예약을 접수한다(`bookings.ts:845-848`).
- **사업자 쪽 처리가 모두 정책을 요구함**
  - 확정: `bookings.ts:1251-1252`가 `policy_not_set` 409를 반환한다.
  - 시간 제안: `:1125-1128`
  - 고객 카탈로그 재검토: `:980-981`. request 서비스도 `policy_not_set`이 된다.
  - 정책이 있어도 확정 시각은 `availableSlots(...,true)`를 통과해야 한다. 즉 영업시간 안의 30분 단위여야 해서, 희망시간 "14:15"로 확정하면 `slot_unavailable`이다.
- **시나리오**: 신규 사업자가 희망시간 방식으로 사이트를 공개한다. 고객 예약은 들어오지만, "사업자 최종 확정"을 누르면 "확정하지 못했습니다: policy_not_set"만 나온다(`field-booking.tsx:668`).
- **문서와 불일치**: AP_FIELD_FUNCTION_REAUDIT의 P1 "수리 완료" 기록과 맞지 않는다.
- **같은 계열의 누락**: `bookingScheduleReady`는 사이트 공개(`sites.ts:520`)에서만 검사한다. 카탈로그 승인(`business.ts:206-256`)에서는 검사하지 않는다.
  - 사이트를 공개한 뒤 slot 서비스를 추가하거나 기본 방식을 slot으로 바꿔 승인하면, 공개 화면은 즉시 새 카탈로그를 쓴다.
  - 그 결과 고객 slot 예약이 409 `policy_not_set`이 된다.
- **수정**
  - request 예약의 확정·제안·재검토는 정책이 없으면 `Asia/Seoul`로 처리하고 occupancy 겹침만 검사한다.
  - 슬롯 격자 검사는 slot 모드에만 적용한다.
  - 카탈로그 승인에도 `bookingScheduleReady`를 적용하거나, UI에서 준비 상태를 안내한다.

## 중간

### M1. 모더레이션 "사이트 숨김"을 공개 API로 우회할 수 있음
- **현황**
  - `/v1/public/sites/:slug`만 hold를 검사한다(`sites.ts:606-607`). 그런데 404 본문에 `organizationId`를 돌려준다.
  - `GET /v1/public/catalog/:id`(`business.ts:259`)는 hold를 검사하지 않는다.
  - 공개 문의 POST(`inquiries.ts:213-316`)와 공개 예약 POST(`bookings.ts:810-904`)도 hold를 검사하지 않는다. 사이트가 공개되었는지도 검사하지 않는다.
  - 반면 ownerTest는 hold를 막는다(`inquiries.ts:92,163`). 의도와 실제 동작이 다르다.
- **시나리오**: `site_hidden` 결정이 난 뒤에도 orgId로 소개·서비스 내용을 읽을 수 있고, 문의·예약을 계속 접수할 수 있다.
- **수정**
  - 세 공개 경로에 hold `not exists` 조건을 추가한다(신규 접수만 막고, 기존 receipt 접근은 유지).
- **주의**: `proxy.ts:63-67`이 404의 `organizationId`에 의존한다. 응답에서 이 값을 빼려면 proxy 판정도 함께 바꿔야 한다.

### M2. 자동저장 응답이 입력 중인 끝 공백·줄바꿈을 지움
- **원인**
  - 서버 `sites.ts:30-31`의 `string()`이 trim하고, 그 trim된 값을 응답으로 돌려준다.
  - 클라이언트 `site-editor.tsx:388-389`는 추가 입력이 없으면 `saved`로 로컬 상태를 통째로 바꾼다. 디바운스는 1초다(`:405-409`).
- **시나리오**: 본문에서 Enter를 누르고 1초 쉬면 줄바꿈이 사라진다. "안녕하세요 "에서 끝 공백이 사라져 다음 글자가 붙는다. 한글 IME 조합에도 영향을 줄 수 있다.
- **수정**: 성공 시 `{...current, revision: saved.revision}`만 반영한다.

### M3. 고객이 수락한 제안이 확정에 실패하면 다시 제안할 길이 없음 [A, 확인]
- **원인**
  - 제안은 `requested`/`change_requested`에서만 가능하다(`bookings.ts:1118`).
  - 제안 시 `availableSlots(..., true)`로 점유를 무시한다(`:1126`). 그래서 이미 확정된 시간도 제안할 수 있다.
  - `customer_accepted`에서는 confirm/reject/expire만 가능하다(`:1406-1407`).
- **시나리오**: 겹치는 시간을 제안하고 고객이 수락하면, 확정은 409(time_conflict)다. 이후 사업자는 거절이나 만료로 고객 요청 자체를 없애는 수밖에 없다.
- **수정**
  - 제안 시 점유를 반영한다(`ignoreOccupancy=false`).
  - `proposed`/`customer_accepted`(`change_*` 포함)에서 재제안을 허용하고, 그때 `proposal_*`를 초기화한다.

### M4. 취소 요청 거절 뒤에도 무효인 제안·수락 기록이 남음 [A, 서버 확인]
- **원인**
  - `bookings.ts:1424-1428`은 `decline_change`일 때만 `proposal_*`를 비운다.
  - 그런데 `change_proposed`/`change_accepted`에서 들어온 `cancel_requested`를 `decline_cancel`하면 `confirmed`로 돌아가면서 제안 값이 그대로 남는다.
  - UI(`field-booking.tsx:858,1297`)는 상태와 관계없이 이 값을 보여준다(에이전트 보고).
- **시나리오**: 고객이 다른 날짜의 "수락된 제안"을 보고 잘못된 날에 방문할 수 있다.
- **수정**
  - `confirmed`로 복귀하는 모든 전이에서 `proposal_*`를 null로 만든다.
  - UI는 제안 관련 상태일 때만 제안 값을 표시한다.

### M5. 사용자 도메인: 일시적 DNS 오류 한 번에 5분간 404, TXT가 한 번만 안 보여도 되돌릴 수 없는 해제
- **오류 시 즉시 사용 불가**
  - `custom-domain-dns.ts:34`는 `tries:1`이고, `:39-40`은 ENODATA/ENOTFOUND 외의 오류를 그대로 throw한다.
  - `custom-domain-execution.ts:91`이 이를 `unknown`으로 기록하면서 `valid_until=null`로 저장한다(`:97-102`).
  - `usable` 조건(`custom-domains.ts:43-45`)이 깨져 다음 점검(5분 뒤)까지 404다.
- **TXT 1회 미검출로 해제 시작**
  - `:65-66`에서 TXT 미검출이 한 번만 관측돼도 `beginOwnershipRelease`를 실행한다. generation이 증가하고 edge 바인딩이 제거된다.
- **수정**
  - `unknown`이면 기존 state와 `valid_until`을 유지하고 짧게 재시도한다.
  - 해제는 연속 N회 미검출이거나 유예 시간이 지난 뒤에만 한다.

### M6. 사업자 환불 사유에 줄바꿈이 있으면 관리자 결제 화면 전체가 안 열림
- **원인**
  - API는 줄바꿈이 든 사유를 저장한다(`billing-refund-routes.ts:9,37`).
  - 관리자 `parseRefund`는 `text()`가 `\n`을 포함한 제어문자를 거부한다(`billing-admin-client.ts:4,26`).
  - 한 건이라도 파싱에 실패하면 `:44`에서 전체를 throw한다.
- **시나리오**: 사업자가 textarea에 여러 줄 사유를 쓰면, 운영자가 모든 환불을 검토·승인할 수 없게 된다.
- **수정**: reason은 `safeText(...,policy=true)`처럼 `\t\n\r`을 허용한다.

### M7. 공개 접수 남용 통제 [A, 일부 확인]
- **조직 단위 한도로 정상 고객 차단**
  - `public-submission-limit.ts`는 전화번호별 5건과 조직 공용 60건/15분 한도만 있고 IP 한도가 없다.
  - 번호를 바꿔 61건을 보내면 그 사업장의 문의·예약이 모두 429가 된다. 가짜 접수와 알림도 60건 생긴다.
- **고객 메시지 무제한**
  - `POST /v1/inquiries/:id/messages`(`inquiries.ts:371-415`)에는 속도 제한이 없다. 메시지 × 첨부 5장으로 저장소가 계속 늘어난다.
- **수정**
  - H1을 고친 뒤 IP 기준 창을 조직 한도보다 먼저 검사한다.
  - 문의 단위로 메시지·첨부 창 한도를 둔다.

### M8. 운영 프로필 게이트가 일관되지 않음 (AGENTS §4)
- **API**
  - `server.ts:15`, `worker.ts:7`, `auth.ts` 등은 `NODE_ENV==='production' && FIELD_PROFILE==='mock'`만 거부한다.
  - 그래서 `FIELD_PROFILE`이 없거나 오타여도 부팅된다. `NODE_ENV`가 없으면 mock 분기가 켜진다: 이메일 인증 해제, localhost origin, mock 체험, 로컬 미디어.
  - 반면 billing/domain/notification 워커는 live를 요구한다.
- **web**
  - `next.config.ts:2`는 `APP_PROFILE=live`이면 throw한다. 그래서 live 분기(테넌트 서브도메인, 사용자 도메인)는 실행할 수 없고 검증되지 않았다.
  - `APP_PROFILE`이 없으면 운영에서도 `localhost:3002` 테넌트 규칙과 preview로 동작한다(`proxy.ts:15`).
- **수정**
  - `FIELD_PROFILE`/`APP_PROFILE`을 필수값(mock|sandbox|live)으로 검사하는 공통 assert를 둔다.
  - web live는 `blocked_integration`으로 명시한다.

## 낮음
1. 테넌트 서브도메인 루트 `/`가 404다.
   - `proxy.ts:50-76`에는 `/` → `/site/<slug>` rewrite가 없다. 사용자 도메인 분기(`:40-44`)에는 있다.
   - 그런데 `publicSiteOrigin`은 맨 origin을 대표 주소로 쓴다. live 전용 경로다.
2. `applyGeneration`/`restore`(`site-editor.tsx:476-482, 518-524`)가 요청 시점의 `site`로 덮어쓰고 `dirty=false`로 만든다. 요청 중 바꾼 색상·템플릿·텍스트가 사라진다. busy 중에도 입력이 막혀 있지 않다.
3. `PUT /v1/sites/draft`에 bodyLimit이 없어 기본 1MiB가 적용된다. `parseContent` 한도(5페이지 × 20섹션 × 5000자)의 한글 본문은 이를 넘을 수 있고, 그러면 413으로 계속 "저장 실패"다.
4. 사진 자산 50개가 영구 상한이다.
   - 삭제 경로가 없다(`sites.ts:334-337`).
   - 개수 확인이 트랜잭션 밖이라 동시 업로드 시 상한을 넘을 수 있다.
5. 슬롯 계산 경계값 두 가지(`bookings.ts:186-188`).
   - 휴무일이면 바로 `[]`를 반환해 전날 심야 영업의 자정 이후 구간까지 사라진다.
   - `day > maxDay`라서 horizon N일 설정에 N+1일째까지 열린다.
6. 수동 등록과 request 확정에도 고객용 최소 여유시간·영업시간·30분 격자가 적용된다(`bookings.ts:1260, 1488`). 30분 뒤 방문하는 전화 예약을 등록할 수 없다. 설계 확인이 필요하다.
7. 웹이 처리하지 못하는 오류 코드들.
   - 403 `paid_subscription_required`: `field-booking.tsx:292`, `field-public.tsx:301`은 `trial_ended`만 분기한다.
   - 사진 업로드 429: 모두 "최대 5장"으로 표시한다(`:216, :1021`). `receipt_rate_limited`도 같은 경로로 온다.
   - 사업자 테스트 문의 409: 모두 "이미 있음"으로 표시한다(`field-public.tsx:350-355`).
   - 게시 409와 AI 생성 429: 오류 종류를 구분하지 않는다(`site-editor.tsx:465, 503`).
   - 일정 차단 제목: 공백만 넣으면 trim 없이 보내 400이 나고, 화면에 이유가 없다(`field-booking.tsx:748`).
8. 첨부를 못 찾은 경우에도 401 `invalid_receipt_key`로 응답한다(`inquiry-attachments.ts:59,134`). 키가 맞는 고객도 abuse 실패로 세어져 잠길 수 있다.
9. `reservation-export.ts:95-106`이 commit 후에도 pg client를 쥔 채 사진을 순차로 가져온다. 동시 export 몇 건이면 pool이 고갈된다.
10. `server.ts:63`이 `app.close()`와 `pool.end()`를 동시에 실행한다. 배포할 때마다 처리 중인 요청이 500이 되고, 하나라도 reject되면 프로세스가 끝나지 않는다.
11. `site-route.ts:7`, `custom-domain-host.ts`가 Host를 소문자로 바꾸지 않는다. 대문자 Host 요청은 404다. 다른 테넌트가 노출되지는 않는다.
12. (잠재) `X-Organization-Id`가 없을 때 권한별로 "가장 오래된 membership"을 고른다(`business.ts:119-124`, `sites.ts:102-107`, `inquiries.ts:63-67`). read와 edit가 서로 다른 조직으로 갈 수 있다. 지금은 owner 1명당 조직 1개라 발현되지 않는다.
13. 사이트 생성 일일 한도가 `date_trunc('day', now())`(DB 세션 시간대, UTC) 기준이라 KST 09시에 초기화된다(`site-generation.ts` 약 127행).
14. 부분 환불 후 VAT 검증(`billing-refund-execution.ts:40`)은 Toss 잔여 VAT 계산 방식에 따라 1원 차이로 영구 unknown이 될 수 있다. sandbox 확인이 필요하다.

## 확인했고 문제없음
- **소유자 라우트 조직 범위**: 문의·예약·첨부·내보내기·알림·외부 요청을 모두 memberships나 `organization_id`로 묶는다. IDOR은 찾지 못했다.
- **고객 경로**: `id + visitor_key_hash`로 묶여 다른 접수를 지정할 수 없다.
- **확인키**: 256비트 랜덤 값의 SHA-256 해시를 `timingSafeEqual`로 비교한다. recover는 제출 키와 확인키 둘 다 요구한다. 전화번호만으로는 열리지 않는다.
- **비회원 handoff**: 1회용, 5분 TTL.
- **예약 점유**: gist exclusion 제약이 있고, `[start-before, end+after)` 공식이 슬롯 계산과 DB에서 같다.
  - 확정·변경·수동 차단은 한 트랜잭션에서 하고 23P01을 409로 바꾼다.
  - 변경 확정은 기존 점유를 UPDATE로 교체해 점유가 비는 순간이 없다.
  - 미확정 요청은 점유하지 않는다. AP integrator에는 확정 API가 없다.
- **시간대**: `localToUtcCandidates`/`boundaryInstant`가 DST 공백과 중복을 처리하고, 서버 로컬 시간대에 의존하지 않는다.
- **알림 단일 발송**: `notification_audience`/`delivery_owner_product` 트리거로 한 제품만 보낸다. unknown은 재발송하지 않고 lookup만 한다.
- **사이트 초안·공개**
  - 초안 PUT은 revision 비교 후 원자적으로 갱신한다.
  - 공개는 sites와 draft 행을 잠그고 revision을 검사해 오래된 초안을 공개하지 않는다. 카탈로그 승인·hold·예약 시간표도 검사한다.
  - 성공 응답일 때만 "공개됨"을 표시한다.
- **AI 생성 큐**
  - 활성 작업 unique 제약이 있다. 상태 전이는 잠금 아래에서 한다.
  - 취소된 작업과 base·catalog revision이 바뀐 작업은 stale로 처리한다.
  - BRPOP 뒤 유실된 작업은 5초마다 DB 기준으로 다시 넣는다.
  - LLM 출력은 strict schema와 allowlist로 받고, 문구는 승인된 카탈로그에서만 채운다.
- **미디어**: sharp로 실제 형식을 판별하고, 25MP 상한, WebP 재인코딩으로 EXIF를 제거한다. UUID 키라 경로 조작이 없다. 공개는 최신 release이면서 hold가 없는 경우에만 한다.
- **XSS**: `dangerouslySetInnerHTML`이 없다. href는 slug/UUID로만 만든다. palette는 hex 정규식으로, 폰트는 allowlist로 검증한다.
- **사용자 도메인**: hostname 정규화, `hostname_claimed` unique, usable 조건(소유·DNS·TLS·바인딩·유효기간)이 있다. `x-forwarded-host`는 신뢰하지 않는다.
- **Toss 청구·환불**
  - 고정 Idempotency-Key, POST 전 `dispatched_at` 커밋, 같은 키로만 lookup 후 재시도, 이중 청구 없음.
  - 금액·VAT·KST 월말 보정이 맞다.
- **워커 claim**: `SKIP LOCKED`와 lease 만료 회수를 쓴다.
- **자격증명이 없을 때**: OpenAI·S3·Solapi·Push·Toss·DNS edge가 모두 `blocked_integration`이나 비활성이 된다. 가짜 성공은 없다.
- **web→API 계약**: 약 200개 호출을 대조했다. 경로·메서드·헤더·body 불일치는 H2 외에 없다. 라우트가 없는 웹 호출도 없다.
