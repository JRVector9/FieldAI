-- H1: better-auth는 로그아웃·만료 세션 조회 때 "session" 행을 실제로 삭제한다. 기존 on delete cascade는
-- 그때 oauth_selections 행까지 지워 이미 동의한 통합 grant(access/refresh token)를 401로 끊었다.
-- 선택 행은 grant의 기준 원장이므로 세션과 수명을 분리한다. 새 동의(postLogin·authorization/current)는
-- 여전히 살아 있는 session_id와 같은지 비교하므로 null 행은 새 동의에 쓰이지 않는다.
alter table field.oauth_selections drop constraint oauth_selections_session_id_fkey;
alter table field.oauth_selections alter column session_id drop not null;
alter table field.oauth_selections add constraint oauth_selections_session_id_fkey
  foreign key (session_id) references "session"(id) on delete set null;
-- field_oauth_selections_session_idx(session_id, created_at desc)는 그대로 유지한다.
-- 롤백(주의): null 행이 있으면 not null 복원이 실패한다. 해당 행 처리 방침(삭제=grant 끊김) 결정 후
--   drop constraint → alter column session_id set not null → on delete cascade FK 재생성.
