create table field.ap_event_deliveries (
  event_id uuid primary key references field.reservation_events(id) on delete cascade,
  connection_id uuid not null references field.ap_connections(id),
  state text not null default 'pending'
    check (state in ('pending', 'sending', 'retry', 'acked', 'blocked')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  acked_at timestamptz,
  last_http_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index field_ap_event_deliveries_due_idx on field.ap_event_deliveries(next_attempt_at)
  where state in ('pending','retry','sending');
