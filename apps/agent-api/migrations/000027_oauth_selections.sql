create table ap.oauth_selections (
  id uuid primary key,
  session_id text not null references "session"(id) on delete cascade,
  actor_user_id text not null references "user"(id) on delete cascade,
  client_id text not null references "oauthClient"("clientId") on delete cascade,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  agent_id uuid not null,
  allowed_deployment_ids uuid[] not null default '{}',
  requested_scopes text[] not null,
  selection_expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (cardinality(allowed_deployment_ids) <= 20),
  check (cardinality(requested_scopes) > 0)
);
create index oauth_selections_session_idx on ap.oauth_selections(session_id, created_at desc);
create index oauth_selections_organization_idx on ap.oauth_selections(organization_id, created_at desc);
