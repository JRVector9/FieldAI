create table field.external_reservation_manual_contacts (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  reservation_id uuid not null references field.reservations(id) on delete cascade,
  event_id uuid not null references field.reservation_events(id) on delete cascade,
  actor_user_id text not null references "user"(id) on delete cascade,
  method text not null check (method in ('phone', 'in_person')),
  outcome text not null check (outcome in ('attempted', 'reached')),
  recorded_at timestamptz not null default now()
);
create index field_external_reservation_manual_contacts_reservation_idx
  on field.external_reservation_manual_contacts(reservation_id, recorded_at desc);
