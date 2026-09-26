create table field.customer_handoff_codes (
  id uuid primary key,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  organization_id uuid not null references field.organizations(id) on delete cascade,
  external_request_id uuid not null references field.external_work_requests(id) on delete cascade,
  reservation_id uuid not null references field.reservations(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > issued_at)
);
create index field_customer_handoff_codes_rate_idx
  on field.customer_handoff_codes(reservation_id, issued_at desc);
