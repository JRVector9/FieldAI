-- 회수한 AP access/refresh 비밀값은 복원 원장 재적용 후에도 다시 저장할 수 없다.
alter table field.ap_connections
  alter column access_token_cipher drop not null,
  alter column refresh_token_cipher drop not null;
update field.ap_connections set access_token_cipher=null,refresh_token_cipher=null where status='revoked';
alter table field.ap_connections add constraint field_ap_connection_token_state check (
  (status='revoked' and access_token_cipher is null and refresh_token_cipher is null)
  or (status<>'revoked' and access_token_cipher is not null and refresh_token_cipher is not null)
);
create function field.protect_revoked_connection() returns trigger language plpgsql as $$
begin
  if TG_OP='UPDATE' and OLD.status='revoked' and
    (NEW.status<>'revoked' or NEW.access_token_cipher is not null or NEW.refresh_token_cipher is not null) then
    raise exception 'revoked Field connection cannot be reactivated' using errcode='PFR02';
  end if;
  if NEW.status='revoked' then NEW.access_token_cipher=null; NEW.refresh_token_cipher=null; end if;
  return NEW;
end $$;
create trigger field_ap_connection_revoked_guard before insert or update on field.ap_connections
  for each row execute function field.protect_revoked_connection();

create function field.protect_revoked_selection() returns trigger language plpgsql as $$
begin
  if OLD.revoked_at is not null and NEW.revoked_at is distinct from OLD.revoked_at then
    raise exception 'revoked Field selection cannot be reactivated' using errcode='PFR02';
  end if;
  return NEW;
end $$;
create trigger field_oauth_selection_revoked_guard before update on field.oauth_selections
  for each row execute function field.protect_revoked_selection();
create function field.protect_revoked_oauth_token() returns trigger language plpgsql as $$
declare selection_revoked_at timestamptz;
begin
  if TG_OP='UPDATE' and OLD.revoked is not null then
    if NEW.revoked is null then raise exception 'revoked Field token cannot be reactivated' using errcode='PFR02'; end if;
    NEW.revoked=OLD.revoked;
  end if;
  -- 발급 중인 token transaction을 회수와 직렬화해 회수 쿼리 뒤에 늦은 token이 남지 않게 한다.
  select revoked_at into selection_revoked_at from field.oauth_selections where id::text=NEW."referenceId" for share;
  if selection_revoked_at is not null then
    NEW.revoked=coalesce(NEW.revoked,now());
  end if;
  return NEW;
end $$;
create trigger field_access_token_revoked_guard before insert or update on "oauthAccessToken"
  for each row execute function field.protect_revoked_oauth_token();
create trigger field_refresh_token_revoked_guard before insert or update on "oauthRefreshToken"
  for each row execute function field.protect_revoked_oauth_token();
create table field.revocation_restore_audit (
  entry_id uuid primary key,
  organization_id uuid not null,
  target_kind text not null check(target_kind in ('selection','connection')),
  target_id uuid not null,
  outcome text not null check(outcome in ('applied','target_absent')),
  applied_at timestamptz not null default now()
);
