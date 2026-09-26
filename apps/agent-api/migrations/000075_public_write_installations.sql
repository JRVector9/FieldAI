-- New delegated installation writes. Native Field connection/source/revoke tables are unchanged.
update "oauthResource" r set "allowedScopes"=(
  select jsonb_agg(distinct v) from jsonb_array_elements(
    coalesce(r."allowedScopes",'[]'::jsonb)||'["ap.connections.create","ap.deployments.manage"]'::jsonb) v
) where r.identifier like '%/integrations/v1';

create table ap.public_installation_connections (
  id uuid primary key,
  selection_id uuid not null references ap.oauth_selections(id),
  client_id text not null references "oauthClient"("clientId"),
  organization_id uuid not null references ap.organizations(id),
  agent_id uuid not null,
  actor_user_id text not null references "user"(id),
  external_organization_id uuid not null,
  origin text not null,
  created_at timestamptz not null default now(),
  unique(id, selection_id, client_id, organization_id)
);
create index public_installation_connections_grant_idx on ap.public_installation_connections(selection_id,client_id);

create table ap.public_installation_deployments (
  deployment_id uuid primary key references ap.deployments(id),
  connection_id uuid not null references ap.public_installation_connections(id),
  selection_id uuid not null references ap.oauth_selections(id),
  client_id text not null references "oauthClient"("clientId"),
  created_at timestamptz not null default now()
);
create index public_installation_deployments_grant_idx on ap.public_installation_deployments(selection_id,client_id);

create table ap.public_write_operations (
  id uuid primary key,
  selection_id uuid not null references ap.oauth_selections(id),
  client_id text not null references "oauthClient"("clientId"),
  organization_id uuid not null references ap.organizations(id),
  operation text not null check(operation in('connection.create','deployment.create','deployment.verify','deployment.activate','deployment.pause')),
  target_id text not null,
  idempotency_key uuid not null,
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique(selection_id,client_id,operation,target_id,idempotency_key)
);

create function ap.public_installation_immutable() returns trigger language plpgsql as $$
begin
  if to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'public installation bindings and operation receipts are immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger public_connection_immutable before update on ap.public_installation_connections
  for each row execute function ap.public_installation_immutable();
create trigger public_deployment_binding_immutable before update on ap.public_installation_deployments
  for each row execute function ap.public_installation_immutable();
create trigger public_operation_immutable before update on ap.public_write_operations
  for each row execute function ap.public_installation_immutable();

alter table ap.deployments add column public_write_revision integer not null default 1 check(public_write_revision>0);
create function ap.public_deployment_revision() returns trigger language plpgsql as $$
begin
  if exists(select 1 from ap.public_installation_deployments where deployment_id=old.id)
    and row(new.id,new.organization_id,new.kind,new.allowed_origin,new.verification_proof,new.created_by,new.created_at)
      is distinct from row(old.id,old.organization_id,old.kind,old.allowed_origin,old.verification_proof,old.created_by,old.created_at) then
    raise exception 'public deployment installation binding is immutable' using errcode='23514';
  end if;
  if row(new.status,new.verified_at,new.agent_release_id,new.knowledge_revision,new.moderation_restricted)
    is distinct from row(old.status,old.verified_at,old.agent_release_id,old.knowledge_revision,old.moderation_restricted) then
    new.public_write_revision=old.public_write_revision+1;
  else
    new.public_write_revision=old.public_write_revision;
  end if;
  return new;
end $$;
create trigger public_deployment_revision before update on ap.deployments
  for each row execute function ap.public_deployment_revision();
