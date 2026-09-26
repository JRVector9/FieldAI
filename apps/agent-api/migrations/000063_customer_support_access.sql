create table ap.customer_support_access_requests (
  id uuid primary key,
  inquiry_id uuid not null,
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
  foreign key(inquiry_id,organization_id) references ap.inquiries(id,organization_id) on delete cascade,
  unique(requested_by,submission_key_hash),
  check (approved_by is null or approved_by<>requested_by),
  check ((approved_by is null and approval_reason is null and approved_at is null and expires_at is null)
    or (approved_by is not null and approval_reason is not null and approved_at is not null and expires_at>approved_at)),
  check ((revoked_by is null and revocation_reason is null and revoked_at is null)
    or (revoked_by is not null and revocation_reason is not null and revoked_at is not null))
);
create index ap_customer_support_queue_idx on ap.customer_support_access_requests(created_at desc,id desc);

create table ap.customer_support_audit (
  id bigint generated always as identity primary key,
  access_id uuid not null references ap.customer_support_access_requests(id) on delete cascade,
  inquiry_id uuid not null references ap.inquiries(id) on delete cascade,
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
create index ap_customer_support_audit_recent_idx on ap.customer_support_audit(created_at desc,id desc);
