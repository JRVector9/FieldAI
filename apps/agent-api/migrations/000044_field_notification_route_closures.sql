create table ap.field_notification_route_closures (
  transfer_id uuid primary key,
  connection_id uuid not null references ap.field_connections(id),
  action_request_id uuid not null references ap.field_action_requests(id),
  reservation_id uuid not null unique,
  latest_revision integer not null check (latest_revision >= 0),
  latest_event_id uuid not null,
  route_generation integer not null check (route_generation = 2),
  closed_at timestamptz not null default now(),
  unique (action_request_id)
);
