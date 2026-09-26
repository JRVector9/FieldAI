create schema if not exists spike;

create table spike.widget_installations (
  id text primary key,
  allowed_origin text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table spike.widget_nonces (
  nonce_hash text primary key,
  installation_id text not null references spike.widget_installations(id) on delete cascade,
  parent_origin text not null,
  expires_at timestamptz not null
);

create table spike.widget_sessions (
  id uuid primary key,
  token_hash text not null unique,
  installation_id text not null references spike.widget_installations(id) on delete cascade,
  parent_origin text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table spike.widget_handoffs (
  ticket_hash text primary key,
  session_id uuid not null references spike.widget_sessions(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index widget_nonces_expiry on spike.widget_nonces(expires_at);
create index widget_sessions_expiry on spike.widget_sessions(expires_at);
create index widget_handoffs_expiry on spike.widget_handoffs(expires_at);
