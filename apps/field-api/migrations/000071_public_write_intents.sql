alter table field.ap_oauth_attempts add column requested_installation boolean not null default false;

create table field.ap_public_installation_intents (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id),
  site_id uuid not null,
  actor_user_id text not null references "user"(id),
  connection_id uuid not null references field.ap_connections(id),
  ap_issuer text not null,
  ap_client_id text not null,
  ap_grant_id text not null,
  ap_organization_id text not null,
  ap_agent_id text not null,
  site_origin text not null,
  mode text not null check(mode in ('inline','floating')),
  revision integer not null default 1 check(revision>0),
  state text not null default 'created' check(state in ('created','connection_prepared','deployment_prepared','verified','ap_active','installed','paused')),
  ap_connection_id uuid,
  deployment jsonb,
  approved_at timestamptz not null default now(),
  sdk_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(site_id,organization_id) references field.sites(id,organization_id)
);
create index field_ap_public_intents_site_idx on field.ap_public_installation_intents(site_id,created_at desc);
create table field.ap_public_installation_operations (
  request_key uuid primary key,
  intent_id uuid not null references field.ap_public_installation_intents(id),
  action text not null check(action in ('connect','prepare','verify','activate','install','pause','refresh')),
  expected_revision integer not null check(expected_revision>0),
  input jsonb not null,
  state text not null default 'pending' check(state in ('pending','unknown','succeeded','rejected')),
  http_status integer,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index field_ap_public_pending_idx on field.ap_public_installation_operations(intent_id)
  where state in ('pending','unknown');
create function field.public_installation_snapshot_immutable() returns trigger language plpgsql as $$
begin
  if tg_table_name='ap_public_installation_intents' then
    if (new.id,new.organization_id,new.site_id,new.actor_user_id,new.connection_id,new.ap_issuer,new.ap_client_id,
      new.ap_grant_id,new.ap_organization_id,new.ap_agent_id,new.site_origin,new.mode,new.approved_at)
      is distinct from (old.id,old.organization_id,old.site_id,old.actor_user_id,old.connection_id,old.ap_issuer,old.ap_client_id,
      old.ap_grant_id,old.ap_organization_id,old.ap_agent_id,old.site_origin,old.mode,old.approved_at) then
      raise exception 'installation approval snapshot is immutable' using errcode='23514';
    end if;
  elsif (new.request_key,new.intent_id,new.action,new.expected_revision,new.input)
    is distinct from (old.request_key,old.intent_id,old.action,old.expected_revision,old.input) then
    raise exception 'installation operation snapshot is immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger field_public_intent_immutable before update on field.ap_public_installation_intents
  for each row execute function field.public_installation_snapshot_immutable();
create trigger field_public_operation_immutable before update on field.ap_public_installation_operations
  for each row execute function field.public_installation_snapshot_immutable();
