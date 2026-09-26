create table field.public_submission_organization_windows (
  organization_id uuid primary key references field.organizations(id) on delete cascade,
  attempts integer not null check (attempts between 1 and 1001),
  window_started_at timestamptz not null,
  updated_at timestamptz not null
);
create index field_public_submission_organization_windows_cleanup_idx
  on field.public_submission_organization_windows(updated_at);
