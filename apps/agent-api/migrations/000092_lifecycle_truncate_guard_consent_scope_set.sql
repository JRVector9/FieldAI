-- 1) OAuth lifecycle 증빙 TRUNCATE 차단. 000081의 행 트리거(POL01)는 TRUNCATE에 실행되지 않으므로
--    tombstone·receipt 표에 문장 단위 before truncate 트리거를 더해 POL04로 거절한다(Field 검토 L8과 같은 규칙).
create function ap.protect_oauth_lifecycle_truncate() returns trigger language plpgsql as $$
begin raise exception 'OAuth lifecycle proof cannot be truncated' using errcode='POL04'; end $$;
create trigger lifecycle_tombstone_no_truncate before truncate on ap.oauth_lifecycle_tombstones
  for each statement execute function ap.protect_oauth_lifecycle_truncate();
create trigger lifecycle_receipt_no_truncate before truncate on ap.oauth_lifecycle_receipts
  for each statement execute function ap.protect_oauth_lifecycle_truncate();

-- 2) Field 동의 시도의 요청 scope 집합. full은 preview.9 scope 포함, base는 Field client 등록이 아직 갱신되지 않아
--    authorize가 invalid_scope를 돌려준 뒤 한 번만 다시 시작한 기본 scope 동의다(반복 재시작 방지 표시).
alter table ap.field_oauth_attempts add column scope_set text not null default 'full'
  check (scope_set in ('full', 'base'));

-- 롤백: drop trigger lifecycle_receipt_no_truncate on ap.oauth_lifecycle_receipts;
--   drop trigger lifecycle_tombstone_no_truncate on ap.oauth_lifecycle_tombstones;
--   drop function ap.protect_oauth_lifecycle_truncate(); alter table ap.field_oauth_attempts drop column scope_set;
