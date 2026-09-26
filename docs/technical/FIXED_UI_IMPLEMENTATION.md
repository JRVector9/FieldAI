# 고정 시안 화면 구현 — 2026-09-27

Task ID / Product / Owner: F04.CUSTOM-DOMAIN.UI / Field / Coordinator(root)
State: implemented — 이 문서의 기존 내부 UI 범위는 ef0dfd3으로 완료했다. 사용자 최종 시각·동선 인수는 별도다.

사용자 확정 디자인은 `reference/field_ui_prototype_v3.html`이다. 원본 파일은 수정하지 않는다. 디자인을 다시 제안하거나 반복 조정하지 않고 처음 연결하는 화면에 원본 구조/CSS 값을 사용한다. 새 기능만 `(추가)`로 표시한다. 기존 완료 UI는 이번 작업 범위 밖이다.

**현재 후속 기준:** TASKS·CODEX_HANDOFF 상단을 따른다. 이후 고객 동의/서비스워커·Field 공개설치 BFF/UI는5ceec42의 완료 체크에 기록되어 있으므로 아래 과거 미완료 문구로 재작업하지 않는다. 제공량/관리자 등 새 기능도 기존 배치 안에 `(추가)`로 연결하며 완료 화면의 디자인을 다시 조정하지 않는다. 이번 문서 상태 정리는 새 UI 검수나 기능 완료 추가가 아니다.

## 최신 추가 기능 — 2362761

허용폰트 선택은 기존 사이트 편집 디자인패널, source상태/실제 snapshot수신시각은 기존 정보갱신 패널, 연결key상태/명시종료는 기존 연결 기록에만 추가했다. 각각 `(추가)` 표시하며 원본 reference·플랫폼 CSS·기존 메뉴/배치는 변경하지 않았다. TASKS52[x]/7[ ]가 현재 완료 원장이다. 실제 검수/실패/복구는 C03_FINAL_INTERNAL_UI_EXECUTION_PLAN / own F03·I03 phase, 사용자최종 시각/320px/동선 인수는 별도다.

## 이번 범위

- 신규 `apps/field-web/src/field-domain-settings.tsx`와 `field-domain-settings.css`: 원본 `ownerDomain`, `settingsWrap`, `settingsNav`의 제목·설정 메뉴·기본 주소·자체 도메인 입력·DNS 표·소유/인증서/대표 상태·확인 버튼 배치를 그대로 구현한다.
- `field-workspace.tsx`: 기존 관리실 shell 안에 domain section을 연결하고 설정 메뉴에서 진입시킨다. 기존 화면 배치/색/글자/사이드 메뉴는 바꾸지 않는다.
- 실제 `GET/POST /v1/sites/domains` 및 verify/primary/disconnect/reconnect 연결. UUID 재시도는 같은 등록 본문/키를 유지하며 미상 결과를 성공 표시하지 않는다. 원래 기본 주소는 `GET /v1/sites/ap-installation`의 `defaultOrigin`을 사용한다.
- 시안 밖 여러 등록 주소 선택·대표 선택·연결 해제/재연결은 기존 버튼/입력 스타일 안에서 `(추가)`로 표시한다. 공급사 부재/미확인/연결/해제 상태를 구분한다.

요구/QA: Field PRD3.4·계약4.10·QA13~15/67/86/94/128/159. Domain Agent가 API/domain/DB/Host 검수와 독립 review를 소유하고 root는 중앙 UI 및 등록/runtime을 통합한다. 기존 basic publish/SDK 완료 체크를 다시 열지 않는다.

## 검수

원본 HTML/CSS 읽기, 변경 범위 ESLint·Field web typecheck/build, 좁은 독립 CLI 검토. 사용자 최종 화면/동선 테스트는 사용자에게 남긴다. CUA file:// 열기는 보안정책에 거부되어 우회하지 않는다. 이번 턴 브라우저 시안 확인을 주장하지 않는다. 미설정 외부 DNS/edge/TLS 성공을 만들지 않는다.

## 공개 설치 동의 설명 연결 (A09.PUBLIC-WRITE.UI, root 소유)

- `apps/agent-web/src/agent-connect.tsx` 기존 조직/AI/범위 선택 및 동의 배치를 유지한다. 새 `ap.connections.create`, `ap.deployments.manage` 두 scope에만 사람에게 읽히는 설명과 `(추가)`를 붙인다. 상대 로그인·결제·예약 권한이 아니라 명시 외부 설치 연결/자기 origin 배포 관리라는 계약을 설명한다. 기존 scope/권한 API를 재구현하지 않는다.
- 기존 CSS 변경 없음. AP web typecheck/build·좁은 CLI 검토 대상이며 실제 OAuth HTTP/DB 검수는 Public Agent의 중앙등록 후 focused 결과를 사용한다. 사용자 최종 화면 인수는 별도다.

## 독립 검토 보완 — 구현 중 상태 표시 (2026-09-27)

CLI39241 exit0 P2/high 4건(숫자confidence없음): 사이트 조회실패를 공개전으로 표현, 등록receipt 후 재조회실패 시 등록전 표현, binding과대표선택 혼동/만료후사용중 문구, verify예약접수를 새검사완료로 표현. 디자인 변경 없이 현재상태/확인실패/알려진receipt/마지막조회시각을 분리하고 문구/버튼조건만 수정한다. 기존 화면 재작업이 아니라 이번 신규domain UI 검토 보완이다. 사용자 최종시각검수는 미실행이며 타입/빌드·좁은repair review를 수행한다.

## 알림 설정 연결 (A06.F08.DELIVERY.UI, 병렬 구현/root 중앙부착)

- Delivery Agent가 새 제품별 notification-settings.tsx/CSS와 자기 actor redacted 저장동의 조회/번호없는 유지·철회를 소유한다. root는 양 workspace의 기존 비활성 안내를 새 component로 연결하고 원래 업무 이벤트 목록/읽음·문의진입 동작을 children으로 유지한다.
- 번호·카카오/푸시·저장 좌측/고객알림 우측/하단이력은 ownerNotifications3 원본 구조다. 일일 시도 상한/공급사 발송 이력만 `(추가)`. service worker/VAPID 미설정은 실제 비활성 사유로 표시하고 가짜권한·구독·발송을 만들지 않는다.
- 원래 A06/F08.IN-APP[x]는 유지한다. 새 발송설정 UI/원장연결은 미완료 DELIVERY의 추가 범위다. UI 타입/build/좁은정적검토와 실제 설정API native 검수만 진행하고 사용자 최종기기/동선은 남긴다.

- CLI48546 terminalexit0의 추가P2 confidence0.96/0.93: secondary주소를기본주소사용으로단정/확정limit·구독403을미상·권한으로표시. 이주소의대표여부만표시하고 domain 전용확정거절/재시도조건을 등록과상태조작 모두에 공통적용한다. 좁은finalrepair를수행하며 source배치/CSS변경은없다.

## 최종 내부 통합 검수 (2026-09-27)

- root CLI6407 terminalexit0: 남은 concrete P1/P2 없음, confidence0.86. read-only source 검토이며 UI 실행/테스트는 수행하지 않았다. 추가 상태 오류 48546(0.96/0.93)을 보완한 뒤의 결과다.
- Delivery UI39859 재검토 잔여 P1/P2 없음, 기존 지적0.97/0.96 반영. 자체 설정 API 양제품79740/23567 각3/3 exit0.
- 최신 전체 typecheck50703·lint12958 exit0. managed95896에서 양 API/web 최신 build 완료, ready/웹200·신규 API401·AP78/Field69 적용을 실제 확인했다. 로그는 인계 상단을 따른다.
- 디자인 원본은 수정하지 않았다. 사용자 최종 화면/동선/320px·실기기, 고객 채널동의 UI/서비스워커/실푸시·새Field 공개설치 BFF는 별도 미완료다.

## 내부 완료 체크와 중앙 반영 (2026-09-27)

- [x] **FIXED-UI.INTERNAL / ef0dfd3:** domain/owner notification/scope 설명 중앙 연결·타입/lint/최신 managed build·정적6407 clean. 기존 디자인 고정, 새 기능만 `(추가)`. 사용자 최종 화면/기기/동선 인수와 미구현 고객동의/서비스워커/Field BFF는 미완료다.

managed95896 AP78/Field69·최신 양API/web build/ready·양웹200·새API401·자체workers ready를 root가 실제 확인했다. 현재 TASKS40[x]/7[ ]이며 전체 출시 완료가 아니다. 상세 현재 결과/미실행/다음 명령은 CODEX_HANDOFF.md 상단을 따른다.
