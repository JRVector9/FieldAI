# 리뷰 D — Field 제품·infra·docs (HEAD b5df6af + 미커밋 변경)

범위: `git diff HEAD -- apps/field-api apps/field-web infra docs tools`와 새 파일(`custom-domain-edge-caddy.ts`, `000081_oauth_token_sha256_index.sql`, 새 테스트 4개). 파일은 수정하지 않았다.

## 실행한 검수 (로컬 mock, 격리 DB)
- `node tools/run-db-suite.mjs field test/sites.db.test.ts test/custom-domains.db.test.ts test/oauth-lifecycle.db.test.ts test/account-deletion.db.test.ts test/email-outbox-retention.db.test.ts`: 5+15+13+5+1 전부 pass
- `tsx --test test/custom-domain-edge-caddy.test.ts` (field-api): 5/5 pass
- `tsx --test test/site-photo-delete.test.tsx test/ap-site-verification-host.test.tsx test/account-deletion.test.tsx` (field-web): 7/7 pass
- `tsc --noEmit` field-api, field-web: exit 0. 변경 파일 eslint: 출력 없음
- 잠금 순서 재현 스크립트(scratchpad `deadlock.mjs`, 임시 DB를 만들고 끝나면 삭제): 아래 M1의 교착 두 경우 모두 `40P01` 재현

## 중간 (Medium)

### M1. 사진 삭제가 조직 행 잠금 순서와 어긋나 교착(deadlock)을 만든다 — 재현함
- `apps/field-api/src/sites.ts:414-436` 순서: advisory → `field.sites ... for update` → asset `for update` → **저장소 삭제(네트워크 I/O)** → `delete site_assets` → `insert into field.outbox(organization_id…)`. 마지막 insert는 FK 검사로 `field.organizations` 행에 `FOR KEY SHARE`를 잡는다.
- 다른 경로는 조직 행을 먼저 잠근다.
  - 조직 삭제 실행기 `account-deletion.ts:323-328`: organizations `for update` → site_assets `for update`
  - AI 생성 요청 `site-generation.ts:125-131`: organizations `for update` → sites `for update`
- 결과: 사진 삭제가 sites/asset을 잡고 저장소 I/O를 하는 사이에 위 경로가 시작되면 순환 대기가 생긴다. 임시 DB 재현 결과 `org-deletion-runner {photoDelete:'ok', other:'40P01'}`, `generation-create {photoDelete:'ok', other:'40P01'}`. 어느 쪽이 중단될지는 대기 시작 순서에 따라 달라진다.
  - 실행기가 중단되면 `execution_failed`로 `executionFailures`가 올라가고, 상한에 닿으면 `infinity`로 멈춰 운영자 복구가 필요하다.
  - 사진 삭제가 중단되면 저장소 객체는 이미 지워졌고 DB 행은 남는다. 보관함에 깨진 사진이 남지만, 다시 삭제하면 정리된다.
  - AI 생성이 중단되면 사용자에게 500이 간다.
- 최소 수정: 삭제 트랜잭션 시작 직후(sites 잠금 전)에 `select 1 from field.organizations where id=$1 for key share`를 넣어 조직 → 사이트 → 사진 순서를 맞춘다. 같은 조직 행에 다른 경로가 `for update`로 오면 사진 삭제가 끝날 때까지 기다리므로 순환이 끊긴다. 권장 사항으로, 저장소 I/O 동안 sites `FOR UPDATE`를 계속 잡지 않도록 2단계 처리(삭제 중 표시 → commit → 저장소 삭제 → 확정)를 검토한다. 지금은 S3 지연 시간 동안 자동저장 PUT(`for share`), 공개, sites를 FK로 참조하는 모든 insert가 막힌다. 이 경우 `site_assets.state` check(`'ready'`만 허용)를 바꾸는 migration이 필요하다.
- 참고(기존 결함): 공개 `POST /v1/sites/releases`(`sites.ts:574-631`, sites `for update` → outbox insert)도 AI 생성 요청과 같은 순환을 가진다. 이번 변경이 만든 것은 아니다.

## 낮음 (Low)

### L1. Caddy 어댑터의 "같은 조직" 증명은 위조할 수 있고, 첫 탐침은 항상 실패한다
- `custom-domain-edge-caddy.ts:72`는 `organizationId`만 비교한다. 이 값은 `FIELD_API_HOST`의 `/v1/public/site-hosts/allow?domain=`과 `/v1/public/site-hosts/:hostname`(`custom-domain-routes.ts:118,143`)에서 누구나 얻을 수 있다. 실제로는 "공인 인증서와 200 응답"만 증명한다. 라우팅 DNS(CNAME) 검사가 앞단에 있어 실제 위험은 낮다.
- 수정: 상태 응답에 서버 비밀값으로 만든 HMAC(`domainId:generation`)을 넣고 어댑터가 대조한다.
- `ensureBinding`은 state가 `verifying`(dns_pending·error 등에서 claim)일 때도 탐침한다. 이때 상태 경로와 ask가 404이므로 첫 탐침은 반드시 실패하고, 15분 유예 시계가 그 실패부터 시작한다.
- 수정: `row.state`가 tls_pending/connected가 아니면 탐침 없이 pending을 돌려주거나, 그 실패를 유예 기록에 넣지 않는다.

### L2. TLS 실패 도메인이 error ↔ tls_pending을 무한 반복한다
- `failed` → `error/domain_tls_failed`(`custom-domain-execution.ts:95`) 다음 claim에서 `verifying`이 되고(error는 유지 대상이 아님), 상태 경로가 404를 주어 다시 pending → tls_pending이 된다. 15분 뒤 다시 error가 된다.
- 상태가 바뀔 때마다 `field.site.domain.status` outbox 행이 생긴다. 소비자가 없고 `delivered_at`도 채워지지 않아 관리자 "recentIncidents"에 pending으로 계속 쌓인다.
- 사용자 화면(`field-domain-settings.tsx`)은 `last_error`를 보여 주지 않아 원인 안내(hairpin 443 등)가 없다.
- 수정: error에서는 backoff를 늘리거나, `domain_tls_failed`일 때 이전 상태를 tls_pending으로 claim한다.

### L3. 유예 기록이 작업자 프로세스 메모리에 있다
- `firstFailure` Map(`custom-domain-edge-caddy.ts:64`) 때문에 작업자가 여러 개이거나 재시작하면 failed 판정이 늦어지거나 흔들린다. 문서에 일부 적혀 있다. DB 컬럼(`tls_first_failure_at`)으로 옮기는 것이 정확하다.

### L4. `removeBinding()`이 항상 true를 돌려준다
- `custom-domain-edge-caddy.ts:84`. 라우팅 원본이 Field DB여서 사이트 연결은 실제로 끊기므로 "가짜 성공"으로 보지는 않았다.
- 다만 Caddy에는 이미 발급된 인증서가 만료까지 남는다. `DomainEdgeProvider` 계약 주석(`custom-domains.ts:6-8`, "retained tombstones reject old operations")은 이 어댑터에 해당하지 않는다. 계약 주석에 Caddy 예외를 적어야 한다.

### L5. 운영자 복구 감사가 owner 응답으로 새고, 화면 설명과 맞지 않는다
- `admin.ts:108-112`는 `steps.operatorResumes[{actorUserId,reason,previousError…}]`를 기록한다. `account-deletion.ts:28-31` `view()`가 `steps` 전체를 owner에게 돌려주므로 플랫폼 관리자 내부 사용자 ID가 고객에게 노출된다.
- owner 화면(`field-account.tsx`)은 `steps`를 렌더링하지 않는다. 그런데 관리자 화면 문구(`field-admin.tsx` "사유는 … 해당 조직 owner의 삭제 기록에 남습니다")는 렌더링된다고 말한다.
- 감사가 `admin_access_audit`가 아닌 요청 행 JSON에만 남아 운영자 행위 감사를 한곳에서 모아 볼 수 없다.
- 수정: `view()`에서 `actorUserId`를 빼거나 owner 화면에 사유를 표시하고, 별도 감사 행(또는 check 확장)을 둔다.

### L6. 사용 여부 조회 인덱스가 없다
- `ASSET_IN_USE_SQL`(`sites.ts:88`)은 `site_release_assets where asset_id=…`인데, PK가 `(release_id, asset_id)`라 asset_id만으로는 인덱스를 쓰지 못한다(`000010_site_assets.sql:16-20`). 목록 1회에 최대 50번, 전체 조직의 표를 순차 탐색한다.
- 수정: `create index on field.site_release_assets(asset_id)`.

### L7. `field.site.asset.deleted` outbox 이벤트는 소비자가 없다
- `delivered_at`이 채워지지 않아 관리자 미처리 사건 목록에 남는다. `field.site.published`와 같은 기존 패턴이다. payload에 `siteId`가 없는 점도 다른 사이트 이벤트와 다르다.

### L8. lifecycle 캐시는 TRUNCATE를 막지 못한다
- 빠른 경로(`oauth-lifecycle-journal.ts:165`)는 원장 배열과 receipt 수만 비교한다. 불변성은 row 트리거(`000073:12-13`, before update/delete)에 기댄다.
- `TRUNCATE field.oauth_lifecycle_tombstones`는 row 트리거를 타지 않는다. tombstone이 사라지면 토큰 insert 가드도 무력화되는데, receipt 수는 그대로라 서빙 검사가 이를 놓친다. 이전 코드는 요청마다 tombstone 존재를 확인했다. DB 관리자급 위협이라 낮음으로 분류했다.
- 수정: 두 표에 `before truncate … for each statement` 트리거를 추가한다(새 migration).

### L9. 인증 메일 outbox 보존 정책 공백
- `retention-purge.ts:43-57`은 `sent`만 7일 뒤 익명화한다. `failed`·`blocked_integration`은 90일, `pending`은 30일 동안 원 주소를 그대로 보관한다. 의도라면 보안/보존 문서에 명시해야 한다(현재 docs diff에 없음). 본문에는 주소가 없어 문제없다(`email-provider.ts:76-87`).

### L10. UI 세부
- 사진 보관함 영역 제목 `사진 보관함`(새 영역)에 `(추가)`가 없다. 삭제 버튼에는 붙어 있다.
- 관리자 "다시 실행" 버튼은 사유 10자 미만일 때 비활성 사유를 따로 표시하지 않는다(라벨에 "10~500자"만 있음).
- 편집기 사진 삭제 요청은 `x-organization-id` 없이 서버의 암묵 선택에 기댄다. 지금은 비활성 조건(`publishCanManage`) 덕분에 다른 조직을 지울 수 없어 문제는 없다. 다만 `404 asset_not_found`를 "이미 삭제됨"으로 처리하므로 헤더를 함께 보내는 편이 안전하다.

### L11. 실행 중인 로컬 mock DB에 000081이 아직 없다
- 실행 중 mock DB의 `pgmigrations` 마지막은 `000080`이다. 새 코드로 Field API를 재기동하면 `field.oauth_token_sha256` 부재로 lifecycle 서빙 검사가 실패한다. 재기동 전에 `node tools/run-migrations.mjs field`가 필요하다. 코드 결함은 아니다.

## 확인 결과 문제없음
- **조직 선택 헤더**: `organizationFor`(`sites.ts:104-120`)는 헤더가 있어도 `m.user_id`와 role 조건을 요구한다. `memberFor` + `canManage`(owner)로 예약·취소한다. 실행된 조직 조회는 `owner_user_id=$1`와 헤더 조직을 함께 조건으로 둔다. editor·비구성원·잘못된 헤더 거절은 테스트로 확인했다.
- **재인증**: 비밀번호 계정은 시도 창을 공유하고, 카카오 전용 계정은 최근 세션이 필요하다. `resolveSession`이 없으면 거부한다(fail closed).
- **운영자 복구 권한**: `requireAdmin({role:'operator'})` + MFA. 행 `for update`, `scheduled`+`infinity`일 때만 허용, 사유 10~500자.
- **사진 삭제 IDOR·권한**: `a.organization_id=$2` 범위라 다른 조직이면 404이고 owner만 가능하다. 저장소 부재 확인(S3 HeadObject 404 = 부재, 403 = media_permission)이 실패하면 행을 유지한다. 반복 요청은 404. 업로드와 같은 advisory 키로 50장 상한을 지킨다.
- **사용 중 판정**: 릴리스 참조(FK가 뒷받침)와 조직 전체 초안을 본다. AI 제안은 `apply`가 `base_revision` 일치를 요구하고, 그 초안이 같은 사진을 참조하므로 안전하다. 복구(restore)는 릴리스 내용만 쓰므로 그 사진은 항상 사용 중이다. 문의 첨부는 별도 저장소다.
- **초안 PUT `for share`**: 사진 삭제와 직렬화된다. 공개는 sites `for update`와 FK로 보호된다. PUT ↔ 생성·적용·복구 사이에 순환은 없다.
- **TLS 검증**: `rejectUnauthorized:true` + `servername` + Node 기본 `checkServerIdentity`(이름 검사)로 자체 서명·이름 불일치를 거절한다. 응답 상한 4KB, 타임아웃 있음, 리다이렉트 미추적.
- **SSRF**: DNS rebinding으로 내부 IP에 가도 인증서 검증 실패로 HTTP 요청 전에 끊긴다. 실패 사유도 사용자에게 노출되지 않는다.
- **상태 경로의 조직 ID**: 이미 공개된 allow·site-hosts와 같은 조건(소유권·DNS 검증, tls_pending·connected, 삭제 예약 없음)이라 새 노출은 없다. 포트 붙은 Host·플랫폼 도메인은 404다.
- **작업자 tls_pending 유지**: 상태 경로·ask가 tls_pending을 요구하므로 필요한 변경이다. 기존 테스트에 `verifying` 기대는 없었다.
- **lifecycle 캐시**: 같은 크기 변조는 ctime/mtime stamp와 검증된 sha256 비교로 거부한다. `checkpoint`·`verifiedEntries`는 강제로 다시 읽고, 복원 시 서빙 캐시를 버린다. receipt 수 감소나 DB/표 oid 변경 시 처음부터 다시 확인한다.
- **migration**: Field 000001~000081이 연속이다. Field 쪽에는 000083 참조가 없다(000083은 AP·문서뿐). `IMMUTABLE` 래퍼는 원래 식과 같고 조회도 같은 식을 쓴다.
- **owner 발송 기록 정리**: 발송 작업자의 claim(`started_at` 설정)이 같은 organizations 잠금 아래라 경합이 없다.
- 2FA 연결 동선(`field-connect.tsx`), `ap-site-verification` Host 소문자화, Caddyfile handle 경로(4321, Host 유지 기본 동작), `pnpm-workspace` overrides/ADR A1, mock connector scope 확장.
