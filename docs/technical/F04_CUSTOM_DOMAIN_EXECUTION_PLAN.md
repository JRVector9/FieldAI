# F04.CUSTOM-DOMAIN 실행 계획 — 2026-09-27

Task ID / Product / Owner: F04.CUSTOM-DOMAIN / Field / Domain Agent (Coordinator=root)
State: implemented; 아래 native/consumer 내부범위 verified. root managed runtime/commit 체크는 별도, 실제 edge/TLS 공급사 연결은 blocked_integration

## 착수 근거와 소유 범위

AGENTS.md6.1·TASKS 상단 36[x]/7[ ]·최신 인계·HEAD fc10170/작업트리·Field PRD3.4·연동4.10·QA13~15/67/86/94/128/159·G-F1을 읽었다. 기존 F02.EDITOR/F04.BASIC-PUBLISH/I03.SDK 완료 이력은 유지한다. 새 미완료 custom-domain 범위만 추가한다. root billing과 Delivery/Public API Agent 변경 파일은 수정하지 않는다.

- 신규 Field `src/custom-domains.ts`, `src/custom-domain-routes.ts`, `src/custom-domain-execution.ts`, `src/custom-domain-worker.ts`, `src/custom-domain-dns.ts`와 좁은 test.
- 신규 미적용 `migrations/000069_custom_domains.sql`만 소유. 기존 적용 migration 변경 금지.
- Coordinator가 추가 허용한 기존 `src/sites.ts`의 공개 origin/AP 설치·검증 연결부, Field web `src/custom-domain-host.ts`, `src/proxy.ts`, `src/app/site/site-route.ts`의 정확한 custom Host 연결부. Coordinator 추가 승인: `.well-known/ap-site-verification/route.ts` origin-bound 조회, `src/field-site.tsx` Widget requestOrigin 타입/guard/dependency만. 위 추가 범위는 Coordinator 승인됐다.
- app/server/package/mock-run/기준 원장/인계/공통 런타임/commit은 root만 변경. 등록·런치 patch를 아래 제출한다.

## 요구·결정

1. 소유자 현재 membership·조직·CSRF·UUID 멱등성으로 exact hostname을 등록하고 미검증 등록 후보는 조직별로 보관하여 선점 공격을 막는다. TXT 소유 검증 뒤에만 durable 전역 hostname claim을 잡고 다른 site binding 중복을 막는다. IP/localhost/플랫폼 기본host/wildcard/포트/경로/비표준 Host를 거부한다.
2. TXT 소유증명, 설정된 edge CNAME과 공개 address, 공급사 binding/TLS 상태, 연결·대표 URL을 별개로 저장한다. 등록/검증대기/오류는 기본 slug 공개·기존 고객업무를 중단하지 않는다.
3. worker는 호출 전 durable generation/claim/lease를 기록하고 늦은 응답은 폐기한다. TXT/DNS 이탈·TLS/공급사 실패·검증기한 만료이면 custom host/canonical을 더 이상 인정하지 않는다. 재연결은 같은 등록에 재검증하며 새 이중 연결을 만들지 않는다.
4. 실제 DNS는 Node resolver로 읽을 수 있다. edge등록/TLS발급 authority/공급사 계약은 제공되지 않았다. runtime의 공급사 port가 없으면 blocked_integration이며 synthetic fixture 성공을 운영 성공으로 사용하지 않는다. 실 DNS 수정·TLS발급·배포는 이 단계에서 실행하지 않는다.
5. ready의 충분조건은 소유TXT/DNS + exact host/site binding과 유효TLS evidence이다. 짧은 검증 유효기한을 적용한다. 증거 없는 ready/manual admin toggle은 없다.
6. 기본 origin은 유지한다. owner가 연결된 domain을 대표로 선택하면 canonical 변경 가능하지만 base slug URL은 계속 접근된다. custom host는 해당 slug/조직의 고객공개/기존 receipt만 허용하며 관리실·다른tenant/API 직접호출은 차단한다.
7. AP 설치키는 origin별이다. 기본 origin AP설치가 custom host에서 재사용되지 않는다. custom origin은 공식 AP GET deployments/일반 소유검증 후 별도 owner 설치 승인. Field 도메인 확인을 AP DB로 전달하지 않는다.

## 단계·검수 명령

- [x] 등록/멱등/권한·격리·삭제 대신 disconnect와 기본주소 보존 native PG17 red→green.
- [x] 소유TXT/DNS/공급사/TLS·claim fencing/이탈·재연결 native fixture 검수.
- [x] exact Host·다른tenant/미검증/폐기domain·default주소/AP exactorigin 소비자 검사.
- [x] focused TypeScript/ESLint/build·ak 독립 CLI narrow read-only audit. 마지막 repair11413 exit0/남은P1·P2 없음(high, 수치confidence미출력).
- [x] root에 실제 결과/등록 patch/외부 미검수 제출. root가 완료 원장·인계·runtime·commit 통합. 소유 등록은 root가 적용했고 final 결과를 전달했다; managed 적용/전체gate 완료를 이 체크로 주장하지 않는다.

명령: strict own UUID PG17 wrapper `node /tmp/field-custom-domain-run-db.mjs`; `pnpm --filter @fieldai/field-api exec tsx --test test/custom-domain-dns.test.ts`; `pnpm --filter @fieldai/field-web exec tsx --test test/custom-domain-host.test.tsx`; `pnpm --filter @fieldai/field-api typecheck`; `pnpm --filter @fieldai/field-web typecheck`; 변경 파일 ESLint; `pnpm --filter @fieldai/field-api build`.
미실행: 실 DNS/TLS/edge 변경, 실제 AP 새origin 검수, 화면/전체 QA/G-F1·접근성/사용자 최종 시각 테스트.

## 실행 결과·실패 접근

### 실제 실행한 검수 (source fc10170 이후 미커밋; root가 source commit/최종 통합 체크를 저장)

- DNS unit: 처음 missing module assertion으로 exit1(red). `.example` fixture는 reserved TLD이므로 실제 DNS 정책을 약화시키지 않고 `.example.com`으로 고쳤다. 최종 `/tmp/field-custom-domain-dns-final.log`, 2/2 fail0/skip0 exit0(90977).
- own PG17 native: `node /tmp/field-custom-domain-run-db.mjs`. `/tmp/field-custom-domain-db-integrated.log`, **11/11 fail0/skip0 exit0(40510)**. 정상 `createFieldApp` + `runtime.customDomain` 등록을 사용한다. Field 자체 사용자/조직/DB·mock/synthetic DNS/edge/AP HTTP fixture다. 실제 auth/provider/DNS/TLS 요청은 아니다. 원본 outer DB에 별도 실제 접속을 유지한 채 fixture별 신규 UUID DB에 migration을 실행해 표준 병렬 DB runner와 충돌하지 않는다. 모든 테스트 DB는 엄격 own127.0.0.1:55432/field_local/fieldai_field_test_UUID 조건 후 생성하고 자체 UUID만 정리했다. AP 환경변수는 wrapper에서 제거했다.
- native 범위: 현재owner/CSRF/조직격리·UUID body충돌·등록선점금지·TXT 후 전역claim·DNS/TLS/exactbinding/증거만료·기본주소/primarycanonical/requestOrigin·unknown·lease 중복/stale응답·disconnect/reconnect·inquiry/asset 조직scope·기본/custom AP설치와 proof 각각보존·DNS소유상실 confirmed-edge-release 이후 새owner·동일 removal key/revision retry·소유상실 outbox·중단된 removal→disconnect→재연결 marker초기화.
- 웹 consumer: `pnpm --filter @fieldai/field-web exec tsx --test test/custom-domain-host.test.tsx test/tenant-proxy.test.tsx`, `/tmp/field-custom-domain-web-final.log`, **3/3 fail0/skip0 exit0(13003)**. 새custom Host 두개+실제로 영향받은 기존tenant proxy 한개. owner/admin 차단, 다른slug/org, exactHTTPS APproof, 기존recover/report, IDN punycode TLD, 실패/no-store를 검사했다. 실제 브라우저/화면 검수가 아니다.
- API types: `pnpm --filter @fieldai/field-api typecheck`, `/tmp/field-custom-domain-api-types-integrated.log`, exit0(89557). 웹types `/tmp/field-custom-domain-web-types-final.log` exit0(36745). 초기 API types 오류는 test payload형식과 peer 작성중 publicwrite fixture였고 최종 해결됐다.
- 변경파일 ESLint `/tmp/field-custom-domain-lint-final.log` exit0(48335; 마지막 release/테스트 파일 집중), 앞서 전체 own 변경경로 lint exit0(72188). API build `/tmp/field-custom-domain-api-build-final.log` exit0(84371), 최종 marker 수정·정상app통합 뒤 `/tmp/field-custom-domain-api-build-integrated.log` exit0(95285). own 경로 `git diff --check` exit0.
- 전체 DB/AP·Field independence/E2E/160QA/G-F1/실TLS/실AP 새origin/사용자 화면 인수는 미실행이며 이 숫자에 포함하지 않는다. 운영 배포·DNS 변경·카드/고객발송·실데이터삭제·git stage/commit은 수행하지 않았다.

### 독립 ak CLI 검토와 실제 수정

`gpt-6-sol/high`, read-only narrow scope; CLI는 tests/provider/DB를 실행하지 않았다. 숫자 confidence는 출력되지 않았고 각 finding의 raw confidence는 **high**였다.

- 89878 exit0 `/tmp/field-custom-domain-audit-result.md`: P2 5개. (1) 소유 확인 전 전역 unique 후보등록 선점은 자체 검토에서도 발견: native red409!=201 후 조직별 후보+TXT 후 전역 claim으로 수정. (2) site_id 단일PK로 기존 AP설치/증명을 교체: native basewidget/proof 보존 red 후 Field69의 `(site_id,site_origin)` 설치PK·별도 custom-domain proof table로 수정. (3) canonical/siteOrigin과 browserorigin 혼동: 공개 requestOrigin과 Widget guard/dependency를 분리. (4) customHost recover/report 누락과 (5) punycodeTLD web 불일치: 실제 새web red 후 allowlist/검증 일치로 수정.
- 78669 exit0 `/tmp/field-custom-domain-repair-result.md`: 기존5개 fixed. P1 중앙app/package미등록은 root전용 파일 통합 gate였으며 root가 직접 등록/worker launch를 추가했다. fixture도 직접등록에서 정상 createFieldApp로 전환하여 실제11/11 통과. P2 이전DNS소유자claim영구보존은 native redtrue!=false 후 durable ownership release generation/정확own edge확정해제/claim반환/새owner검증으로 수정.
- 91796 exit0 `/tmp/field-custom-domain-final-audit.md`: P2 ownership loss unknown 도중 ownerdisconnect→confirmedremove 뒤 release marker 남음. native red2!=null 후 verifieddisconnect에서 markerclear·reconnect fresh generation으로 수정. 11/11 최종 정상경로에 이 경우를 포함했다.
- 추가 자체 재현: outerDB를 TEMPLATE복사하면 다른 파일의 실제접속으로 source database being accessed 오류(3552 exit1). fixture별 own UUID DB migrate로 고쳤다. ownership loss를 HTTP보다 먼저 로컬무효 처리하면서 status outbox가 빠짐을 red0!=1(3179)로 재현했고 동일transaction에 durable event를 추가했다.
- 마지막 해당 P2만 좁은 closeout **11413 exit0**, `/tmp/field-custom-domain-closed-review.md`: **남은 concrete P1/P2 없음**, raw confidence high(수치미출력). 정상 app/package wiring도 직접 확인했다. static/read-only라 runtime/DB/provider tests는 reviewer가 실행하지 않았으며 root managed evidence는 아직 별도다.

## Root 등록·운영 patch / 남은 gate

Coordinator(root)가 실제 중앙 변경을 적용했다(직접 파일 읽음):

1. business.ts의 `customDomain?: CustomDomainContext`; app.ts에서 `registerCustomDomainRoutes(app,businessRuntime,businessRuntime.customDomain)` 한 번; server.ts에 `customDomainContextFromEnvironment()`.
2. package `start:custom-domain`: `node dist/custom-domain-worker.js`; `tools/mock-run.mjs` ownField env의 worker launch; DNS unit script 등록.
3. 기존 FIELD_PUBLIC_WEB_ORIGIN(정확owner Origin), FIELD_SITE_BASE_DOMAIN(기본tenant주소), **FIELD_CUSTOM_DOMAIN_CNAME_TARGET**(optional 신규 CNAME target). 공급사 어댑터/계약은 아직 없으므로 context.edge 미설정=blocked_integration. 임의url로 edge 공급사를 흉내내거나 임의credential/fakeTLS를 만들지 않았다.
4. 제공된 `DomainEdgeProvider`의 ensure/remove는 domainId별 generation tombstone을 보존하고 exacthostname/site/domain binding만 수정해야 한다. ready에는 host/site/generation 일치와 유효 trusted TLS증거를 요구한다. 실 공급사 credential/authority·TLS발급/edge변경·실외부domain검수는 별도 blocked_integration gate다.
5. root가 기존 시안 관리실에 domain UI를 연결한다. 우리 변경은 Host/API/Widget origin 연결뿐이며 JSX배치/메뉴/CSS를 재설계하지 않았다. 사용자 최종 시각/동선 검수는 미실행이다.
6. root 최종 통합 migration/build/managed 재기동/ready·코드 commit·TASKS `[x]` 내부세부/coverage/audit/인계·옵시디언 일지를 연결해야 한다. F04.CUSTOM-DOMAIN 전체/실도메인/화면 인수를 이번 native 완료로 체크하지 않는다.

### Owner UI 계약

- GET `/v1/sites/domains`→domains/providerState; POST 동일경로 `{hostname,requestKey:UUID}`; GET `/:id`; POST `/:id/verify|primary|disconnect|reconnect` `{}`. 현재owner+정확 FIELD_PUBLIC_WEB_ORIGIN Origin, UUID organization header 필요. TXT 인증 전 등록은 소유 성공이 아니다.
- row: id/hostname/state/desiredState/ownership/dns/tls/binding/isPrimary/origin/checkedAt/validUntil/certificateExpiresAt/error + verification(txtName/txtValue/cnameName/cnameTarget) + apOrigin(origin/approvalRequired:true).
- state: registered/ownership_pending/dns_pending/tls_pending/connected/blocked_integration/unknown/error/release_pending/disconnected/verification_expired를 구분. 기본주소는 domain 준비와 무관하게 유지한다.
- AP GET설치에 defaultOrigin·origin별 installations[]; POST설치/verification body.origin은 선택된 정확 custom origin이다. publicSite의 siteOrigin은 canonical, requestOrigin은 해당 요청에서 허용된 실제 origin, defaultOrigin은 계속유효한 기본주소다.
