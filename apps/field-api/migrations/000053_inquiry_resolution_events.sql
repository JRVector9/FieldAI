alter table field.inquiries add column revision integer not null default 0;

create table field.inquiry_resolution_events (
  id uuid primary key,
  inquiry_id uuid not null references field.inquiries(id) on delete cascade,
  event_type text not null check (event_type in ('closed', 'reopened')),
  revision integer not null check (revision > 0),
  actor_user_id text,
  source_message_id uuid references field.inquiry_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (inquiry_id, revision),
  check ((event_type = 'closed' and actor_user_id is not null and source_message_id is null)
    or (event_type = 'reopened' and actor_user_id is null and source_message_id is not null))
);
