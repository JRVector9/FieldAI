create table ap.source_refresh_jobs (
  id uuid primary key,
  connection_id uuid not null references ap.field_connections(id) on delete cascade,
  ap_grant_id uuid not null references ap.oauth_selections(id) on delete cascade,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  expected_source_revision integer not null check (expected_source_revision >= 0),
  idempotency_key_hash text not null check (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending' check (state in ('pending','sending','retry','completed','blocked')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  source_revision integer check (source_revision > 0),
  outcome text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, idempotency_key_hash)
);
create index source_refresh_jobs_pending_idx on ap.source_refresh_jobs(next_attempt_at,created_at)
  where state in ('pending','retry','sending');
