alter table field.reservations drop constraint reservations_state_check;
alter table field.reservations add constraint reservations_state_check
  check (state in ('requested', 'proposed', 'customer_accepted', 'confirmed',
    'change_requested', 'change_proposed', 'change_accepted', 'cancel_requested',
    'completed', 'canceled', 'rejected', 'expired', 'no_show'));
alter table field.reservations alter column visitor_key_hash drop not null;
alter table field.reservations alter column consent_at drop not null;
alter table field.reservations add column source text not null default 'public'
  check (source in ('public', 'owner_manual'));
alter table field.reservations add column proposal_start_at timestamptz;
alter table field.reservations add column proposal_end_at timestamptz;
alter table field.reservations add column proposal_accepted_at timestamptz;
alter table field.reservations add column change_preferred_text text;

create table field.reservation_events (
  id uuid primary key,
  reservation_id uuid not null references field.reservations(id) on delete cascade,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  revision integer not null,
  actor_type text not null check (actor_type in ('customer', 'owner')),
  actor_user_id text references "user"(id),
  event_type text not null,
  previous_state text,
  next_state text not null,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (reservation_id, revision)
);
create index field_reservation_events_order_idx on field.reservation_events(reservation_id, revision);
