-- A-18: serialize identity issuance with account deletion. Reading a password
-- or session before deletion never authorizes a later identity mutation.
create table ap.deletion_receipt_epoch (
  singleton boolean primary key default true check(singleton),
  generation bigint not null check(generation>=0)
);
insert into ap.deletion_receipt_epoch(singleton,generation) select true,count(*) from ap.deletion_journal_receipts;
create function ap.protect_deletion_epoch() returns trigger language plpgsql as $$
begin
  if tg_op='UPDATE' and pg_trigger_depth()=2 and NEW.singleton=OLD.singleton and NEW.generation=OLD.generation+1 then return NEW; end if;
  raise exception 'deletion receipt epoch is maintained by receipts only' using errcode='PAD01';
end $$;
create trigger deletion_epoch_immutable before insert or update or delete on ap.deletion_receipt_epoch
  for each row execute function ap.protect_deletion_epoch();
create trigger deletion_epoch_no_truncate before truncate on ap.deletion_receipt_epoch
  for each statement execute function ap.protect_deletion_proof();
create function ap.advance_deletion_epoch() returns trigger language plpgsql as $$
begin update ap.deletion_receipt_epoch set generation=generation+1 where singleton; return null; end $$;
create trigger deletion_receipt_epoch_advance after insert on ap.deletion_journal_receipts
  for each statement execute function ap.advance_deletion_epoch();

create table ap.deletion_replay_audit (
  id bigint generated always as identity primary key,
  entry_id uuid not null,
  outcome text not null check(outcome in ('applied','target_absent')),
  applied_at timestamptz not null default now()
);
create index deletion_replay_entry_idx on ap.deletion_replay_audit(entry_id,applied_at);
create trigger deletion_replay_immutable before update or delete on ap.deletion_replay_audit
  for each row execute function ap.protect_deletion_proof();
create trigger deletion_replay_no_truncate before truncate on ap.deletion_replay_audit
  for each statement execute function ap.protect_deletion_proof();

create function ap.protect_deleted_identity() returns trigger language plpgsql as $$
declare
  proposed jsonb=to_jsonb(NEW); previous jsonb=to_jsonb(OLD);
  subjects text[]; actor text; owner_id text; client_disabled boolean; deleted boolean;
begin
  -- Only terminal updates are exempt; changing identity/token content while
  -- expiring a row cannot smuggle new credentials into a tombstoned account.
  if tg_op='UPDATE' then
    if tg_table_name='session' and (proposed->>'expiresAt')::timestamptz<=clock_timestamp()
      and proposed->>'twoFactorVerified'='false'
      and (proposed-array['expiresAt','updatedAt','twoFactorVerified'])=(previous-array['expiresAt','updatedAt','twoFactorVerified']) then return NEW; end if;
    if tg_table_name in ('oauthAccessToken','oauthRefreshToken') and proposed->>'revoked' is not null
      and proposed->>'rotationReplayResponse' is null and proposed->>'rotationReplayExpiresAt' is null
      and (proposed-array['revoked','rotationReplayResponse','rotationReplayExpiresAt'])=(previous-array['revoked','rotationReplayResponse','rotationReplayExpiresAt']) then return NEW; end if;
    if tg_table_name='oauthClient' and proposed->>'disabled'='true'
      and (proposed-'disabled')=(previous-'disabled') then return NEW; end if;
    if tg_table_name='oauth_selections' and proposed->>'revoked_at' is not null
      and (proposed-'revoked_at')=(previous-'revoked_at') then return NEW; end if;
    if tg_table_name='organizations' and proposed->>'deleted_at' is not null
      and (proposed-array['deleted_at','updated_at'])=(previous-array['deleted_at','updated_at']) then return NEW; end if;
  end if;
  subjects=array[case when tg_table_name='user' then proposed->>'id'
    when tg_table_name='oauth_selections' then proposed->>'actor_user_id'
    when tg_table_name in ('organizations','publishers') then proposed->>'owner_user_id'
    when tg_table_name in ('memberships','publisher_memberships','platform_admin_memberships') then proposed->>'user_id'
    else proposed->>'userId' end];
  if tg_op='UPDATE' then subjects=subjects||array[case when tg_table_name='user' then previous->>'id'
    when tg_table_name='oauth_selections' then previous->>'actor_user_id'
    when tg_table_name in ('organizations','publishers') then previous->>'owner_user_id'
    when tg_table_name in ('memberships','publisher_memberships','platform_admin_memberships') then previous->>'user_id'
    else previous->>'userId' end]; end if;
  if tg_table_name in ('oauthAccessToken','oauthRefreshToken','oauthConsent','oauth_selections') then
    select "userId" into owner_id from "oauthClient" where "clientId"=coalesce(proposed->>'clientId',proposed->>'client_id');
    subjects=subjects||array[owner_id];
  end if;
  -- INSERT has no existing child row and can safely wait for deletion. UPDATE
  -- already owns the child row: waiting for its parent would reverse deletion's
  -- user->child order. Abort the child writer instead of the approved deletion.
  if tg_op='UPDATE' and tg_table_name<>'user' then
    perform id from "user" where id=any(subjects) order by id for share nowait;
  else
    perform id from "user" where id=any(subjects) order by id for share;
  end if;
  if tg_table_name in ('oauthAccessToken','oauthRefreshToken','oauthConsent','oauth_selections') then
    select disabled into client_disabled from "oauthClient" where "clientId"=coalesce(proposed->>'clientId',proposed->>'client_id') for share;
    if client_disabled is true then raise exception 'disabled client cannot issue a grant' using errcode='PAD02'; end if;
  end if;
  foreach actor in array subjects loop
    if actor is null then continue; end if;
    select exists(select 1 from ap.deletion_journal_receipts where target_kind='account' and target_id=actor)
      or exists(select 1 from ap.account_deletion_audit where user_id=actor)
      or exists(select 1 from "user" where id=actor and email ~ '^deleted-[a-f0-9-]{36}@deleted\.invalid$') into deleted;
    if not deleted then continue; end if;
    if tg_table_name='user' and proposed->>'id'=actor
      and proposed->>'email' ~ '^deleted-[a-f0-9-]{36}@deleted\.invalid$'
      and proposed->>'name'='삭제된 사용자' and proposed->>'emailVerified'='false'
      and proposed->>'image' is null and proposed->>'twoFactorEnabled'='false'
      and (tg_op='INSERT' or (proposed-array['name','email','emailVerified','image','twoFactorEnabled','updatedAt'])=(previous-array['name','email','emailVerified','image','twoFactorEnabled','updatedAt']))
      and (tg_op='INSERT' or previous->>'email' !~ '^deleted-[a-f0-9-]{36}@deleted\.invalid$' or previous->>'email'=proposed->>'email') then continue; end if;
    raise exception 'deleted identity cannot be recreated' using errcode='PAD02';
  end loop;
  return NEW;
end $$;
create trigger account_deletion_user_guard before insert or update on "user" for each row execute function ap.protect_deleted_identity();
create trigger account_deletion_session_guard before insert or update on "session" for each row execute function ap.protect_deleted_identity();
create trigger account_deletion_credential_guard before insert or update on "account" for each row execute function ap.protect_deleted_identity();
create trigger account_deletion_mfa_guard before insert or update on "twoFactor" for each row execute function ap.protect_deleted_identity();
create trigger account_deletion_client_guard before insert or update on "oauthClient" for each row execute function ap.protect_deleted_identity();
create trigger account_deletion_access_guard before insert or update on "oauthAccessToken" for each row execute function ap.protect_deleted_identity();
create trigger account_deletion_refresh_guard before insert or update on "oauthRefreshToken" for each row execute function ap.protect_deleted_identity();
create trigger account_deletion_consent_guard before insert or update on "oauthConsent" for each row execute function ap.protect_deleted_identity();
create trigger account_deletion_selection_guard before insert or update on ap.oauth_selections for each row execute function ap.protect_deleted_identity();
create trigger account_deletion_organization_guard before insert or update on ap.organizations for each row execute function ap.protect_deleted_identity();
create trigger account_deletion_membership_guard before insert or update on ap.memberships for each row execute function ap.protect_deleted_identity();
create trigger account_deletion_publisher_guard before insert or update on ap.publishers for each row execute function ap.protect_deleted_identity();
create trigger account_deletion_publisher_membership_guard before insert or update on ap.publisher_memberships for each row execute function ap.protect_deleted_identity();
create trigger account_deletion_admin_membership_guard before insert or update on ap.platform_admin_memberships for each row execute function ap.protect_deleted_identity();
-- Rollback: stop all writers first, preserve replay/receipt/journal evidence,
-- then remove these triggers/function. Never delete immutable deletion proof.
