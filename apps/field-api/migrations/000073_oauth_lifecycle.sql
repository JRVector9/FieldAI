create table field.oauth_lifecycle_tombstones (
  kind text not null check(kind in ('token','family','route-key','legacy-baseline')),
  target_key text not null check(target_key ~ '^[a-f0-9]{64}$'),
  payload jsonb not null, revoked_at timestamptz not null,
  primary key(kind,target_key)
);
create table field.oauth_lifecycle_receipts (
  entry_id uuid primary key, entry_sha256 text not null check(entry_sha256 ~ '^[a-f0-9]{64}$')
);
create function field.protect_oauth_lifecycle_proof() returns trigger language plpgsql as $$
begin raise exception 'OAuth lifecycle proof is immutable' using errcode='POL01'; end $$;
create trigger lifecycle_tombstone_immutable before update or delete on field.oauth_lifecycle_tombstones for each row execute function field.protect_oauth_lifecycle_proof();
create trigger lifecycle_receipt_immutable before update or delete on field.oauth_lifecycle_receipts for each row execute function field.protect_oauth_lifecycle_proof();
create function field.protect_oauth_lifecycle_token() returns trigger language plpgsql as $$
declare invalid boolean; parent_revoked timestamptz; authority record;
begin
  -- Explicit revocation/rotation never waits for a parent after locking the child.
  if NEW.revoked is not null then return NEW; end if;
  perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(NEW."clientId",NEW."userId",NEW."referenceId",case when NEW."authorizationCodeId" is null then null else encode(sha256(convert_to(NEW."authorizationCodeId",'UTF8')),'hex') end)::text,771));
  select s.client_id,s.actor_user_id,m.user_id as owner_id into authority from field.oauth_selections s
    left join field.memberships m on m.organization_id=s.organization_id and m.user_id=s.actor_user_id and m.role='owner'
    where s.id::text=NEW."referenceId";
  if found and (authority.client_id<>NEW."clientId" or authority.actor_user_id is distinct from NEW."userId" or authority.owner_id is null) then
    raise exception 'OAuth selection authority is no longer current' using errcode='POL02';
  end if;
  select exists(select 1 from field.oauth_lifecycle_tombstones t where
    (t.kind='legacy-baseline' and NEW."createdAt"<=(t.payload->>'cutoffAt')::timestamptz
      and not((t.payload->case when TG_TABLE_NAME='oauthAccessToken' then 'accessFingerprints' else 'refreshFingerprints' end)
        ? encode(sha256(convert_to(NEW.token,'UTF8')),'hex')))
    or     (t.kind='token' and t.payload->>'tokenType'=case when TG_TABLE_NAME='oauthAccessToken' then 'access' else 'refresh' end
      and t.payload->>'tokenFingerprint'=encode(sha256(convert_to(NEW.token,'UTF8')),'hex'))
    or (t.kind='family' and t.payload->>'clientId'=NEW."clientId" and t.payload->>'userId' is not distinct from NEW."userId"
      and t.payload->>'referenceId' is not distinct from NEW."referenceId" and t.payload->>'codeId' is not distinct from case when NEW."authorizationCodeId" is null then null else encode(sha256(convert_to(NEW."authorizationCodeId",'UTF8')),'hex') end)) into invalid;
  if invalid then raise exception 'OAuth family or token was revoked' using errcode='POL02'; end if;
  if TG_TABLE_NAME='oauthAccessToken' then
  if NEW."refreshId" is not null then
    select revoked into parent_revoked from "oauthRefreshToken" where id=NEW."refreshId" for share nowait;
    if parent_revoked is not null then raise exception 'OAuth refresh parent was revoked' using errcode='POL02'; end if;
  end if;
  end if;
  return NEW;
end $$;
create trigger lifecycle_access_guard before insert or update on "oauthAccessToken" for each row execute function field.protect_oauth_lifecycle_token();
create trigger lifecycle_refresh_guard before insert or update on "oauthRefreshToken" for each row execute function field.protect_oauth_lifecycle_token();

alter table field.ap_connections add column route_key_closed_at timestamptz;
alter table field.ap_connections drop constraint field_ap_event_route_complete;
alter table field.ap_connections add constraint field_ap_event_route_complete check (
  (event_key_id is null and event_secret_cipher is null and route_generation is null and route_key_closed_at is null)
  or (event_key_id is not null and route_generation=1 and
    ((route_key_closed_at is null and event_secret_cipher is not null)
      or (route_key_closed_at is not null and event_secret_cipher is null and status='revoked')))
);
create function field.protect_closed_ap_route_key() returns trigger language plpgsql as $$
begin
  if TG_OP='UPDATE' and OLD.route_key_closed_at is not null and
    (NEW.route_key_closed_at is distinct from OLD.route_key_closed_at or NEW.event_key_id is distinct from OLD.event_key_id
      or NEW.route_generation is distinct from OLD.route_generation or NEW.event_secret_cipher is not null) then
    raise exception 'closed route key cannot be restored' using errcode='POL03';
  end if;
  if exists(select 1 from field.oauth_lifecycle_tombstones t where t.kind='route-key' and t.payload->>'connectionId'=NEW.id::text
    and t.payload->>'keyId'=NEW.event_key_id::text) then
    NEW.route_key_closed_at=coalesce(NEW.route_key_closed_at,now());NEW.event_secret_cipher=null;
  end if;
  return NEW;
end $$;
create trigger lifecycle_ap_route_key_guard before insert or update on field.ap_connections for each row execute function field.protect_closed_ap_route_key();
create table field.ap_route_key_close_requests (
  id uuid primary key,connection_id uuid not null references field.ap_connections(id),organization_id uuid not null,
  actor_user_id text not null, key_id uuid not null,
  state text not null default 'pending' check(state in ('pending','closed','cancelled')),
  last_reason text not null default 'awaiting_reconciliation',requested_at timestamptz not null default now(),closed_at timestamptz
);
create unique index route_key_close_pending on field.ap_route_key_close_requests(connection_id) where state='pending';
