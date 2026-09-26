create table field.external_request_attachments (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  external_request_id uuid not null references field.external_work_requests(id) on delete cascade,
  source_attachment_id uuid not null,
  state text not null default 'pending'
    check (state in ('pending','copying','copied','copy_failed')),
  object_key text unique,
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer check (byte_size between 1 and 4194304),
  width integer check (width between 1 and 2000),
  height integer check (height between 1 and 2000),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  error_code text,
  copied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (external_request_id, source_attachment_id),
  check ((state = 'copied' and object_key is not null and sha256 is not null
    and byte_size is not null and width is not null and height is not null and copied_at is not null)
    or (state <> 'copied' and copied_at is null))
);
create index field_external_request_attachment_claim_idx
  on field.external_request_attachments(next_attempt_at, created_at)
  where state in ('pending','copy_failed','copying');
