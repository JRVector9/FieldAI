create unique index field_external_work_requests_id_org_unique on field.external_work_requests(id,organization_id);

create table field.customer_support_access_requests (
  id uuid primary key,
  target_kind text not null check (target_kind in ('inquiry','reservation','external_request')),
  target_id uuid not null,
  inquiry_id uuid,
  reservation_id uuid,
  external_request_id uuid,
  organization_id uuid not null,
  requested_by text not null,
  purpose text not null check (purpose in ('customer_requested_investigation','report_investigation','security_incident')),
  reference text not null check (length(reference) between 1 and 160),
  reason text not null check (length(reason) between 10 and 500),
  scopes text[] not null check (array_ndims(scopes)=1 and array_position(scopes,null) is null
    and cardinality(scopes) between 1 and 3 and scopes <@ array['conversation','contact','photos']::text[]
    and cardinality(scopes)=(('conversation'=any(scopes))::int+('contact'=any(scopes))::int+('photos'=any(scopes))::int)),
  minutes integer not null check (minutes between 1 and 60),
  minimum_necessary_at timestamptz not null default now(),
  submission_key_hash text not null,
  request_hash text not null,
  approved_by text,
  approval_reason text check (length(approval_reason) between 10 and 500),
  approved_at timestamptz,
  expires_at timestamptz,
  revoked_by text,
  revocation_reason text check (length(revocation_reason) between 10 and 500),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(inquiry_id,organization_id) references field.inquiries(id,organization_id) on delete cascade,
  foreign key(reservation_id,organization_id) references field.reservations(id,organization_id) on delete cascade,
  foreign key(external_request_id,organization_id) references field.external_work_requests(id,organization_id) on delete cascade,
  check (case target_kind
    when 'inquiry' then inquiry_id is not null and inquiry_id=target_id and reservation_id is null and external_request_id is null
    when 'reservation' then reservation_id is not null and reservation_id=target_id and inquiry_id is null and external_request_id is null
    when 'external_request' then external_request_id is not null and external_request_id=target_id and inquiry_id is null and reservation_id is null
    else false end),
  unique(requested_by,submission_key_hash),
  check (approved_by is null or approved_by<>requested_by),
  check ((approved_by is null and approval_reason is null and approved_at is null and expires_at is null)
    or (approved_by is not null and approval_reason is not null and approved_at is not null and expires_at>approved_at)),
  check ((revoked_by is null and revocation_reason is null and revoked_at is null)
    or (revoked_by is not null and revocation_reason is not null and revoked_at is not null))
);
create index field_customer_support_queue_idx on field.customer_support_access_requests(created_at desc,id desc);

create table field.customer_support_audit (
  id bigint generated always as identity primary key,
  access_id uuid not null references field.customer_support_access_requests(id) on delete cascade,
  target_kind text not null,
  target_id uuid not null,
  actor_user_id text not null,
  action text not null check (action in ('requested','approved','revoked','detail_read','photo_read','photo_unavailable','read_denied')),
  reason text not null,
  scopes text[] not null,
  attachment_id uuid,
  submission_key_hash text,
  request_hash text,
  result jsonb,
  created_at timestamptz not null default now(),
  unique(access_id,actor_user_id,submission_key_hash)
);
create index field_customer_support_audit_recent_idx on field.customer_support_audit(created_at desc,id desc);
