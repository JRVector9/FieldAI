create table ap.field_event_inbox (
  id uuid primary key,
  source_product text not null check (source_product = 'field'),
  source_event_id uuid not null,
  connection_id uuid not null references ap.field_connections(id) on delete cascade,
  action_request_id uuid not null,
  reservation_id uuid not null,
  revision integer not null check (revision >= 0),
  event_type text not null,
  reservation_state text not null,
  occurred_at timestamptz not null,
  route_generation integer not null check (route_generation > 0),
  start_at timestamptz,
  end_at timestamptz,
  body_hash text not null check (body_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'received'
    check (state in ('received', 'pending_gap', 'processed', 'rejected')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  unique (source_product, source_event_id)
);
create index ap_field_event_inbox_work_idx
  on ap.field_event_inbox(state, received_at) where state in ('received', 'pending_gap');
