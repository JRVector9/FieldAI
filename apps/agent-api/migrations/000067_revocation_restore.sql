-- 회수한 AP access/refresh 비밀값은 복원 원장 재적용 후에도 다시 저장할 수 없다.
alter table ap.field_connections
  alter column access_token_cipher drop not null,
  alter column refresh_token_cipher drop not null;
update ap.field_connections set access_token_cipher=null,refresh_token_cipher=null where status='revoked';
alter table ap.field_connections add constraint ap_field_connection_token_state check (
  (status='revoked' and access_token_cipher is null and refresh_token_cipher is null)
  or (status<>'revoked' and access_token_cipher is not null and refresh_token_cipher is not null)
);
create function ap.protect_revoked_connection() returns trigger language plpgsql as $$
begin
  if TG_OP='UPDATE' and OLD.status='revoked' and
    (NEW.status<>'revoked' or NEW.access_token_cipher is not null or NEW.refresh_token_cipher is not null) then
    raise exception 'revoked AP connection cannot be reactivated' using errcode='PAP02';
  end if;
  if NEW.status='revoked' then NEW.access_token_cipher=null; NEW.refresh_token_cipher=null; end if;
  return NEW;
end $$;
create trigger ap_field_connection_revoked_guard before insert or update on ap.field_connections
  for each row execute function ap.protect_revoked_connection();

create function ap.protect_revoked_selection() returns trigger language plpgsql as $$
begin
  if OLD.revoked_at is not null and NEW.revoked_at is distinct from OLD.revoked_at then
    raise exception 'revoked AP selection cannot be reactivated' using errcode='PAP02';
  end if;
  return NEW;
end $$;
create trigger ap_oauth_selection_revoked_guard before update on ap.oauth_selections
  for each row execute function ap.protect_revoked_selection();
create function ap.protect_revoked_oauth_token() returns trigger language plpgsql as $$
declare selection_revoked_at timestamptz;
begin
  if TG_OP='UPDATE' and OLD.revoked is not null then
    if NEW.revoked is null then raise exception 'revoked AP token cannot be reactivated' using errcode='PAP02'; end if;
    NEW.revoked=OLD.revoked;
  end if;
  -- 발급 중인 token transaction을 회수와 직렬화해 회수 쿼리 뒤에 늦은 token이 남지 않게 한다.
  select revoked_at into selection_revoked_at from ap.oauth_selections where id::text=NEW."referenceId" for share;
  if selection_revoked_at is not null then
    NEW.revoked=coalesce(NEW.revoked,now());
  end if;
  return NEW;
end $$;
create trigger ap_access_token_revoked_guard before insert or update on "oauthAccessToken"
  for each row execute function ap.protect_revoked_oauth_token();
create trigger ap_refresh_token_revoked_guard before insert or update on "oauthRefreshToken"
  for each row execute function ap.protect_revoked_oauth_token();
create table ap.revocation_restore_audit (
  entry_id uuid primary key,
  organization_id uuid not null,
  target_kind text not null check(target_kind in ('selection','connection')),
  target_id uuid not null,
  outcome text not null check(outcome in ('applied','target_absent')),
  applied_at timestamptz not null default now()
);

-- 삭제/조직 수명과 독립된 서명 회수 증빙. 오래된 DB 복원에서는 외부 checkpoint가 기준이다.
create table ap.revocation_journal_receipts (
  entry_id uuid primary key,
  entry_sha256 text not null check (entry_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null default now()
);
create function ap.protect_revocation_journal_receipt() returns trigger language plpgsql as $$
begin raise exception 'AP revocation journal receipt is immutable' using errcode='PJR01'; end $$;
create trigger ap_revocation_journal_receipt_guard before update or delete on ap.revocation_journal_receipts
  for each row execute function ap.protect_revocation_journal_receipt();
