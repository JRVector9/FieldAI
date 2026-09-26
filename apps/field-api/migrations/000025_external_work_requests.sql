alter table field.reservations drop constraint reservations_source_check;
alter table field.reservations add constraint reservations_source_check
  check (source in ('public', 'owner_manual', 'external_ap'));

create table field.external_work_requests (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  provider text not null check (provider = 'agent-platform'),
  connection_id uuid not null references field.ap_connections(id),
  client_id text not null,
  field_grant_id uuid not null,
  action_request_id uuid not null,
  body_hash text not null check (body_hash ~ '^[a-f0-9]{64}$'),
  origin_conversation_id uuid not null,
  source_deployment_id uuid not null,
  kind text not null check (kind in ('inquiry', 'reservation_request')),
  service_id uuid not null,
  catalog_revision integer not null check (catalog_revision > 0),
  policy_revision integer not null check (policy_revision > 0),
  service_snapshot jsonb not null,
  customer_snapshot jsonb not null,
  request_snapshot jsonb not null,
  summary text not null,
  consent_record_id uuid not null,
  consent_confirmed_at timestamptz not null,
  conditions_hash text not null check (conditions_hash ~ '^[a-f0-9]{64}$'),
  is_test boolean not null,
  reservation_id uuid unique references field.reservations(id) on delete cascade,
  status text not null check (status = 'requested'),
  received_at timestamptz not null default now(),
  unique (provider, connection_id, action_request_id),
  check ((kind = 'reservation_request' and reservation_id is not null)
    or (kind = 'inquiry' and reservation_id is null))
);
create index field_external_work_requests_owner_idx
  on field.external_work_requests(organization_id, received_at desc);
