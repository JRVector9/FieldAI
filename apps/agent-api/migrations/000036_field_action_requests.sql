create table ap.field_action_requests (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  inquiry_id uuid not null references ap.inquiries(id) on delete cascade,
  connection_id uuid not null,
  submission_key_hash text not null check (submission_key_hash ~ '^[a-f0-9]{64}$'),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  field_body_hash text not null check (field_body_hash ~ '^[a-f0-9]{64}$'),
  field_request_body jsonb not null,
  kind text not null check (kind in ('inquiry', 'reservation_request')),
  service_id uuid not null,
  service_snapshot jsonb not null,
  consent_record_id uuid not null unique,
  consent_confirmed_at timestamptz not null,
  state text not null check (state in ('sending', 'accepted_external', 'delivery_unknown', 'rejected')),
  external_request_id uuid,
  reservation_id uuid,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inquiry_id, submission_key_hash),
  check ((state = 'accepted_external' and external_request_id is not null)
    or (state <> 'accepted_external' and external_request_id is null))
);
create index ap_field_action_requests_inquiry_idx
  on ap.field_action_requests(inquiry_id, created_at desc);
