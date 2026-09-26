alter table ap.field_event_inbox
  add column next_attempt_at timestamptz not null default now();
create index ap_field_event_inbox_retry_idx
  on ap.field_event_inbox(next_attempt_at, received_at)
  where state in ('received', 'pending_gap');
