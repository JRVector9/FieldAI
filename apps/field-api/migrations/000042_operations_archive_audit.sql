create table field.operations_archive_audit (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  actor_user_id text not null references "user"(id),
  inquiry_count integer not null check (inquiry_count >= 0),
  reservation_count integer not null check (reservation_count >= 0),
  media_count integer not null check (media_count >= 0),
  byte_size integer not null check (byte_size > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  generated_at timestamptz not null default now()
);
create index operations_archive_audit_org_time_idx
  on field.operations_archive_audit(organization_id, generated_at desc);
