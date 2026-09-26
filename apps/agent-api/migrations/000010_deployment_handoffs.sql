create table ap.embed_nonces (
  nonce_hash text primary key,
  deployment_id uuid not null references ap.deployments(id) on delete cascade,
  expires_at timestamptz not null
);
create index embed_nonces_expiry_idx on ap.embed_nonces(expires_at);

create table ap.embed_sessions (
  id uuid primary key,
  token_hash text not null unique,
  deployment_id uuid not null references ap.deployments(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index embed_sessions_expiry_idx on ap.embed_sessions(expires_at);

create table ap.embed_handoffs (
  ticket_hash text primary key,
  session_id uuid not null references ap.embed_sessions(id) on delete cascade,
  question text not null check (char_length(question) <= 1000),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index embed_handoffs_expiry_idx on ap.embed_handoffs(expires_at);

create table ap.first_party_handoffs (
  token_hash text primary key,
  deployment_id uuid not null references ap.deployments(id) on delete cascade,
  question text not null check (char_length(question) <= 1000),
  expires_at timestamptz not null
);
create index first_party_handoffs_expiry_idx on ap.first_party_handoffs(expires_at);
