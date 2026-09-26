create table field.external_reservation_notification_routes (
  reservation_id uuid primary key references field.reservations(id) on delete cascade,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  connection_id uuid not null references field.ap_connections(id),
  state text not null check (state in ('consented', 'withdrawn', 'active', 'suspended')),
  route_generation integer not null default 1 check (route_generation in (1, 2)),
  customer_consent_id uuid not null unique,
  customer_consent_version text not null check (customer_consent_version = 'field-reservation-route-v1'),
  customer_consented_at timestamptz not null,
  customer_withdrawn_at timestamptz,
  customer_withdrawal_id uuid unique,
  activation_id uuid unique,
  activated_by_user_id text references "user"(id) on delete set null,
  activated_at timestamptz,
  ap_closed_revision integer check (ap_closed_revision >= 0),
  ap_closed_event_id uuid,
  check (
    (state in ('consented', 'withdrawn') and route_generation = 1
      and activation_id is null and activated_at is null
      and ap_closed_revision is null and ap_closed_event_id is null)
    or (state in ('active', 'suspended') and route_generation = 2
      and activation_id is not null and activated_at is not null
      and ap_closed_revision is not null and ap_closed_event_id is not null)
  ),
  check ((state in ('withdrawn', 'suspended')) = (customer_withdrawn_at is not null)),
  check ((customer_withdrawn_at is null) = (customer_withdrawal_id is null))
);
create index field_external_reservation_notification_routes_connection_idx
  on field.external_reservation_notification_routes(connection_id, state);
