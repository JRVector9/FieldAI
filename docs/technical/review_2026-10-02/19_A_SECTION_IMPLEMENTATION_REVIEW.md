# A절 구현 코드리뷰 — 2026-10-04

착수 기준 `c135fbb`, 완료 코드 `a5eac8c`·외부 변경 병합 `0507bfc`, 별도 worktree `fix/remaining-a-20261004`. 외부 에이전트의 `a9fea58` 연결 stub/connection drain 수리는 동일 패치를 반영하고 A21 실제 응답 observer를 보존했다. 원본 작업 공간의 서버·컨테이너·원장에는 쓰지 않았다.

리뷰 CLI는 모두 `codex exec -m gpt-6.1-sol -c model_reasoning_effort=xhigh --sandbox read-only`였다. 리뷰 자체는 정적 추론이며 실행 증거와 구분한다. 필요한 제품/파일만 검토했고 전체 서비스의 출시 승인으로 사용하지 않는다.

| 범위 | 발견·근거 | 수정 및 실제 검수 |
|---|---|---|
| A09 공개 ask | Next data alias의 normalized path 우회 | Field proxy early404, proxy6/6; Caddy 실제 public Host404/내부 ask200 검수 |
| A02/03 관리자 cursor | boundary 행 보존기간 삭제 후 cursor 실패 | microsecond UTC timestamp+UUID keyset; 삭제 boundary 회귀2/2 |
| A06 사업자 안내 | Field in-place 로그인 후 상태 재조회 누락 | owner-session-changed event와 순번 fence; 웹 회귀7/7 |
| A04 baseline/export | Field native 파일 누락 audit 검증, AP fsync 전에 DB fence 해제 | 서명/audit binding 확인, 보호 export fsync까지 잠금; actual delayed fsync 경합1/1 |
| A18 OAuth 복원 | 삭제한 사용자의 owned client에 다른 actor grant가 되살아남 | owned client disable+전체 token/consent/selection 회수, 현재 상태 검증; 양 제품 actual PG restore 회귀 |
| A18 부분 복원 | applied/target_absent receipt 뒤 개인정보/credential이 다시 복원되면 skip | 감사 존재와 현재 cleanup proof를 함께 확인; 재정리1/다음0 회귀 |
| A18 인증 경합 | 미리 읽은 credential로 deletion commit 뒤 session/account/MFA/client/profile 쓰기 | 사용자 lock+tombstone DB trigger; 실제 lock-wait red→거부 green |
| A18 권한 생성 경합 | 이미 인증된 조직·membership·관리자/매체 권한 쓰기 | 명시 user field mapping+DB trigger, late organization409; 양 제품 PG red→green |
| A18 갱신 교착 | session row→user lock와 삭제 user→session row 역순, 실제 deletion40P01 victim | child UPDATE FOR SHARE NOWAIT로 writer 즉시 거부, INSERT FOR SHARE 직렬화; deadlock 및 정상 concurrent OAuth 회귀 |
| A18 조직 정리 MFA | 만료된 세션의 twoFactorVerified가 남아 잠금 중 정리 UPDATE를 거부 | terminal session에서 false로 정리; 실제 profile lock/55P03 red→green |
| A18 사진 root | nested org symlink로 active 사진 삭제 | restore 전용 disjoint root·lstat/symlink/hardlink 거부; 실제 red→green |
| A18 사진 부분 복원 | 조직 DB row가 없어도 별도 backup의 signed 사진은 존재 | org 존재와 무관한 객체 삭제·부재 확인; 실제 red→green |
| A18 intent rollback | fsync 뒤 rollback과 대기 재시도가 다른 tombstone intent 생성 | target 기준 기존 verified intent 재사용; 실제 PG rollback/waiting retry 회귀 |
| A18 warm guard | 요청마다 receipts count(*) 전체 집계 | 불변 singleton receipt generation과 statement trigger; warm1SQL/no aggregate·TTL60s |
| A24 관리자 세션 | BetterAuth Node 시각이 PG보다 약26ms 앞서 실제 MFA403 | session 발급 DB clock, 미래1분·8시간 거부 유지; 실제 TOTP·절대 나이 회귀 |
| A21 route gate | app.route object/array·all 등록의 미등록 public method를 놓침 | AST 대조 확대; undocumented POST/PATCH/all red→green, 실제 404 회귀. missing URL 방어는 정적 리뷰 제안이며 최초 실제 Fastify404는 이미 통과했다 |
| A20 HTTP 검수 | webhook body 읽기 deadline 없음, 실패한 synthetic domain evidence 남김 | 요청/body deadline10초, finally disconnect·immutable audit 보존; 최종 HTTP gate에서 검수 |

초기/수리 red 로그는 삭제하지 않는다. 전체 최신 정적·DB·계약·독립성·E2E·보안·장애 게이트 결과는 `LOCAL_FUNCTIONAL_COVERAGE.md`와 `CODEX_HANDOFF.md`에 기록한다. 실제 공급사·TLS·운영 복원·HEIC 법무/amd64/실폰·실기기 최종 인수는 별도 미완료다.

최종 제한 재리뷰에서 보고된 P1/P2는 모두 수정했고 해당 검토 범위에 남은 조치 항목은 없었다. 정적·전체 DB·계약·독립성·E2E·보안·장애 검사는 최신 코드에서 실행했으며, 문서 변경 전후 런타임 990파일의 SHA256이 동일하다.
