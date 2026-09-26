create table ap.field_oauth_attempts (
  id uuid primary key,
  field_connection_id uuid not null,
  ap_grant_id uuid not null references ap.oauth_selections(id) on delete cascade,
  ap_organization_id uuid not null references ap.organizations(id) on delete cascade,
  ap_agent_id uuid not null,
  initiator_user_id text not null references "user"(id) on delete cascade,
  state_hash text not null unique,
  verifier_cipher bytea not null,
  status text not null default 'pending' check (status in ('pending', 'denied', 'completed', 'unknown')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index ap_field_oauth_attempts_org_idx on ap.field_oauth_attempts(ap_organization_id, created_at desc);

create table ap.field_connections (
  id uuid primary key,
  ap_grant_id uuid not null references ap.oauth_selections(id) on delete cascade,
  ap_organization_id uuid not null references ap.organizations(id) on delete cascade,
  ap_agent_id uuid not null,
  initiator_user_id text not null references "user"(id) on delete cascade,
  field_issuer text not null,
  field_client_id text not null,
  field_grant_id text not null,
  field_organization_id text not null,
  scopes text[] not null,
  access_token_cipher bytea not null,
  refresh_token_cipher bytea not null,
  access_expires_at timestamptz not null,
  status text not null check (status in ('pending_binding', 'binding_unknown', 'review_required', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ap_field_connections_org_idx on ap.field_connections(ap_organization_id, created_at desc);
