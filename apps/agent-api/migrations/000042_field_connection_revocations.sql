create table ap.field_connection_revocations (
  id uuid primary key,
  connection_id uuid not null unique references ap.field_connections(id) on delete cascade,
  received_at timestamptz not null default now()
);
