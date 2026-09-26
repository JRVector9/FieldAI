create table field.site_generation_jobs (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  site_id uuid not null references field.sites(id) on delete cascade,
  requested_by text not null references "user"(id),
  prompt text not null check (char_length(prompt) between 1 and 1000),
  base_revision integer not null check (base_revision >= 0),
  catalog_revision integer not null check (catalog_revision > 0),
  catalog_snapshot jsonb not null,
  status text not null check (status in ('queued', 'running', 'proposed', 'applied_to_draft', 'failed', 'canceled', 'stale')),
  proposal jsonb,
  model text not null,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  provider_response_id text,
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index field_site_generation_active_idx on field.site_generation_jobs(site_id)
  where status in ('queued', 'running', 'proposed');
create index field_site_generation_recent_idx on field.site_generation_jobs(site_id, created_at desc);
