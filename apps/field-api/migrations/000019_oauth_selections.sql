create table field.oauth_selections (
  id uuid primary key,
  session_id text not null references "session"(id) on delete cascade,
  actor_user_id text not null references "user"(id) on delete cascade,
  client_id text not null references "oauthClient"("clientId") on delete cascade,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  requested_scopes text[] not null,
  selection_expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (cardinality(requested_scopes) > 0)
);
create index field_oauth_selections_session_idx on field.oauth_selections(session_id, created_at desc);
create index field_oauth_selections_organization_idx on field.oauth_selections(organization_id, created_at desc);
