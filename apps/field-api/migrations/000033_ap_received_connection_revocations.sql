create table field.ap_received_connection_revocations (
  id uuid primary key,
  connection_id uuid not null unique references field.ap_connections(id) on delete cascade,
  received_at timestamptz not null default now()
);
