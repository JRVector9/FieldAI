create table field.ap_connection_revocations (
  id uuid primary key,
  connection_id uuid not null unique references field.ap_connections(id) on delete cascade,
  state text not null default 'pending'
    check (state in ('pending', 'sending', 'retry', 'acked', 'blocked')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  acknowledged_at timestamptz,
  last_http_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index field_ap_connection_revocations_due_idx
  on field.ap_connection_revocations(next_attempt_at)
  where state in ('pending', 'sending', 'retry');
