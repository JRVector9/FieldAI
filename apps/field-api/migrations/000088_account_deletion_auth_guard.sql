-- Better Auth can read a credential/session before deletion and write afterward.
-- Serialize every identity mutation with the deletion transaction's user lock,
-- then reject writes for a durable tombstone. Terminal cleanup remains possible.
create function field.protect_deleted_identity() returns trigger language plpgsql as $$
declare subjects text[]; actor text; tombstone uuid; client_owner text; client_disabled boolean;
  proposed jsonb=to_jsonb(NEW); previous jsonb=to_jsonb(OLD); user_column text;
begin
  if tg_table_name='session' and tg_op='UPDATE' and (proposed->>'expiresAt')::timestamptz<=clock_timestamp() then return NEW; end if;
  if tg_table_name in ('oauthAccessToken','oauthRefreshToken') and proposed->>'revoked' is not null then return NEW; end if;
  if tg_table_name='oauthClient' and tg_op='UPDATE' and proposed->>'disabled'='true'
    and (proposed-'disabled')=(previous-'disabled') then return NEW; end if;
  if tg_table_name='organizations' and tg_op='UPDATE' and proposed->>'deleted_at' is not null
    and (proposed-'deleted_at')=(previous-'deleted_at') then return NEW; end if;
  user_column=case when tg_table_name='user' then 'id' when tg_table_name='organizations' then 'owner_user_id'
    when tg_table_name in ('memberships','platform_admin_memberships') then 'user_id' else 'userId' end;
  subjects=array[proposed->>user_column];
  if tg_op='UPDATE' then subjects=subjects||array[previous->>user_column]; end if;
  if tg_table_name in ('oauthAccessToken','oauthRefreshToken','oauthConsent') then
    select "userId",disabled into client_owner,client_disabled from "oauthClient" where "clientId"=proposed->>'clientId';
    subjects=subjects||array[client_owner];
    if client_disabled is true then raise exception 'deleted identity or disabled client cannot issue a grant' using errcode='PFA01'; end if;
  end if;
  -- UPDATE already owns its child row before a BEFORE trigger runs. Waiting on
  -- the deleter's user lock would invert deletion's user -> child lock order.
  if tg_op='UPDATE' then perform id from "user" where id=any(subjects) order by id for share nowait;
  else perform id from "user" where id=any(subjects) order by id for share; end if;
  for actor,tombstone in select user_id,id from field.account_deletion_audit where user_id=any(subjects) loop
    if tg_table_name='user' and proposed->>'id'=actor and proposed->>'email'='deleted-'||tombstone::text||'@deleted.invalid'
      and proposed->>'name'='삭제된 사용자' and proposed->>'image' is null and proposed->>'emailVerified'='false' and proposed->>'twoFactorEnabled'='false'
      and (proposed-array['name','email','emailVerified','image','twoFactorEnabled','updatedAt'])=
          (previous-array['name','email','emailVerified','image','twoFactorEnabled','updatedAt']) then
      continue;
    end if;
    raise exception 'deleted identity cannot be recreated' using errcode='PFA01';
  end loop;
  return NEW;
end $$;
create trigger account_deletion_user_guard before insert or update on "user" for each row execute function field.protect_deleted_identity();
create trigger account_deletion_session_guard before insert or update on "session" for each row execute function field.protect_deleted_identity();
create trigger account_deletion_credential_guard before insert or update on "account" for each row execute function field.protect_deleted_identity();
create trigger account_deletion_mfa_guard before insert or update on "twoFactor" for each row execute function field.protect_deleted_identity();
create trigger account_deletion_client_guard before insert or update on "oauthClient" for each row execute function field.protect_deleted_identity();
create trigger account_deletion_access_guard before insert or update on "oauthAccessToken" for each row execute function field.protect_deleted_identity();
create trigger account_deletion_refresh_guard before insert or update on "oauthRefreshToken" for each row execute function field.protect_deleted_identity();
create trigger account_deletion_consent_guard before insert or update on "oauthConsent" for each row execute function field.protect_deleted_identity();
create trigger account_deletion_organization_guard before insert or update on field.organizations for each row execute function field.protect_deleted_identity();
create trigger account_deletion_membership_guard before insert or update on field.memberships for each row execute function field.protect_deleted_identity();
create trigger account_deletion_admin_membership_guard before insert or update on field.platform_admin_memberships for each row execute function field.protect_deleted_identity();

-- Warm serving checks read one singleton epoch, never aggregate every receipt.
alter table field.account_deletion_journal_binding add column receipt_generation bigint not null default 0 check(receipt_generation>=0);
create function field.advance_account_deletion_receipt_generation() returns trigger language plpgsql as $$
begin update field.account_deletion_journal_binding set receipt_generation=receipt_generation+1 where singleton;return null;end $$;
create trigger account_deletion_receipt_generation after insert or update on field.account_deletion_receipts
  for each statement execute function field.advance_account_deletion_receipt_generation();
