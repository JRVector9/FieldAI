-- better-auth는 만료 세션 조회·로그아웃 때 "session" 행을 실제로 지운다. 기존 on delete cascade는 그때
-- ap.oauth_selections(→ field_connections·source_refresh 등 cascade)를 함께 지워 통합 grant를 조용히 끊었다.
-- 선택 행은 세션과 무관하게 grant 근거로 남아야 하므로 session_id를 nullable + on delete set null로 바꾼다.
-- session_id는 동의 직전 같은 세션에서 만든 선택을 찾는 데만 쓰이며(auth.ts·integrator-routes.ts), null이면 그 조회에서 제외된다.
alter table ap.oauth_selections drop constraint oauth_selections_session_id_fkey;
alter table ap.oauth_selections alter column session_id drop not null;
alter table ap.oauth_selections add constraint oauth_selections_session_id_fkey
  foreign key (session_id) references "session"(id) on delete set null;
-- 롤백: null 행이 있으면 not null 복원이 실패하므로, 되돌리기 전에 null 행 처리 방침(유지 grant 철회 등)을 먼저 정한다.
--   alter table ap.oauth_selections drop constraint oauth_selections_session_id_fkey;
--   alter table ap.oauth_selections alter column session_id set not null;
--   alter table ap.oauth_selections add constraint oauth_selections_session_id_fkey
--     foreign key (session_id) references "session"(id) on delete cascade;
