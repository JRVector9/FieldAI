create table field.site_verification_proofs (
  site_id uuid primary key references field.sites(id) on delete cascade,
  proof text not null check (proof ~ '^[A-Za-z0-9_-]{32,64}$'),
  created_by text not null references "user"(id),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table field.site_ap_installations (
  site_id uuid primary key references field.sites(id) on delete cascade,
  connection_id uuid not null references field.ap_connections(id),
  ap_deployment_id uuid not null,
  ap_public_id text not null check (ap_public_id ~ '^dep_[A-Za-z0-9_-]{20,50}$'),
  site_origin text not null,
  mode text not null check (mode in ('inline', 'floating')),
  status text not null check (status in ('active', 'paused')),
  installed_by text not null references "user"(id),
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index field_site_ap_installations_connection_idx on field.site_ap_installations(connection_id);
