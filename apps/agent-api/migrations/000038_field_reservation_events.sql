create table ap.field_reservation_events (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  action_request_id uuid not null references ap.field_action_requests(id) on delete cascade,
  field_event_id uuid not null unique,
  reservation_id uuid not null,
  revision integer not null check (revision >= 0),
  event_type text not null,
  state text not null,
  occurred_at timestamptz not null,
  route_generation integer not null check (route_generation > 0),
  customer_notification_owner_product text not null check (customer_notification_owner_product = 'ap'),
  start_at timestamptz,
  end_at timestamptz,
  outbox_id uuid not null unique references ap.outbox(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  unique (action_request_id, revision)
);
create index ap_field_reservation_events_action_idx
  on ap.field_reservation_events(action_request_id, revision);

alter table ap.notification_events add column field_reservation_event_id uuid
  unique references ap.field_reservation_events(id) on delete cascade;
