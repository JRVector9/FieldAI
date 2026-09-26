create table spike.first_party_sessions (
  token_hash text primary key,
  session_id uuid not null references spike.widget_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index first_party_sessions_expiry on spike.first_party_sessions(expires_at);
