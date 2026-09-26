create table field.ap_oauth_attempts (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  initiator_user_id text not null references "user"(id) on delete cascade,
  state_hash text not null unique,
  verifier_cipher bytea not null,
  status text not null default 'pending' check (status in ('pending', 'denied', 'completed', 'unknown')),
  connection_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index field_ap_oauth_attempts_org_idx on field.ap_oauth_attempts(organization_id, created_at desc);

create table field.ap_connections (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  initiator_user_id text not null references "user"(id) on delete cascade,
  ap_issuer text not null,
  ap_client_id text not null,
  ap_grant_id text not null,
  ap_organization_id text not null,
  ap_agent_id text not null,
  ap_agent_name text not null,
  ap_agent_revision integer not null check (ap_agent_revision > 0),
  allowed_deployment_ids text[] not null,
  scopes text[] not null,
  access_token_cipher bytea not null,
  refresh_token_cipher bytea not null,
  access_expires_at timestamptz not null,
  status text not null check (status in ('pending_field_consent', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index field_ap_connections_org_idx on field.ap_connections(organization_id, created_at desc);
alter table field.ap_oauth_attempts add constraint field_ap_oauth_attempts_connection_fk
  foreign key (connection_id) references field.ap_connections(id) on delete set null;
