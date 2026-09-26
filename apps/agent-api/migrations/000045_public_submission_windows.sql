create table ap.public_submission_windows (
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null check (attempts between 1 and 6),
  window_started_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (organization_id, subject_hash)
);
create index ap_public_submission_windows_cleanup_idx on ap.public_submission_windows(updated_at);
