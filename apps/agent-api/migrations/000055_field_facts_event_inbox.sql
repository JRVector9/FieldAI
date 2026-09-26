create table ap.field_event_receipts (
  source_event_id uuid primary key,
  connection_id uuid not null references ap.field_connections(id) on delete cascade,
  event_kind text not null check (event_kind in ('reservation','facts')),
  body_hash text not null check (body_hash ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null default now()
);
insert into ap.field_event_receipts(source_event_id,connection_id,event_kind,body_hash,received_at)
select source_event_id,connection_id,'reservation',body_hash,received_at
from ap.field_event_inbox;

create table ap.field_facts_event_inbox (
  id uuid primary key,
  source_event_id uuid not null unique references ap.field_event_receipts(source_event_id),
  connection_id uuid not null references ap.field_connections(id) on delete cascade,
  release_id uuid not null,
  source_revision integer not null check (source_revision > 0),
  occurred_at timestamptz not null,
  state text not null default 'received'
    check (state in ('received','scheduled','ignored','blocked')),
  refresh_job_id uuid references ap.source_refresh_jobs(id),
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index field_facts_event_inbox_received_idx on ap.field_facts_event_inbox(received_at)
  where state = 'received';
