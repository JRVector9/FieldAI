create table field.facts_change_deliveries (
  id uuid primary key,
  connection_id uuid not null references field.ap_connections(id) on delete cascade,
  catalog_release_id uuid not null references field.catalog_releases(id) on delete cascade,
  state text not null default 'pending'
    check (state in ('pending','sending','retry','acked','blocked')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  acked_at timestamptz,
  last_http_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id,catalog_release_id)
);
create index facts_change_deliveries_due_idx on field.facts_change_deliveries(next_attempt_at)
  where state in ('pending','retry','sending');
