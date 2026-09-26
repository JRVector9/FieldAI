create table ap.field_preflight_organization_windows (
  organization_id uuid primary key references ap.organizations(id) on delete cascade,
  attempts integer not null check (attempts between 1 and 1001),
  window_started_at timestamptz not null,
  updated_at timestamptz not null
);

create index ap_field_preflight_organization_windows_cleanup_idx
  on ap.field_preflight_organization_windows(updated_at);
