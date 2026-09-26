create table field.sites (
  id uuid primary key,
  organization_id uuid not null unique references field.organizations(id) on delete cascade,
  slug text not null unique check (slug ~ '^field-[0-9a-f]{12}$'),
  created_at timestamptz not null default now()
);

create table field.site_drafts (
  site_id uuid primary key references field.sites(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  content jsonb not null,
  updated_by text not null references "user"(id),
  updated_at timestamptz not null default now()
);

create table field.site_releases (
  id uuid primary key,
  site_id uuid not null references field.sites(id) on delete cascade,
  revision integer not null check (revision > 0),
  content jsonb not null,
  content_hash text not null,
  catalog_release_id uuid not null references field.catalog_releases(id),
  catalog_revision integer not null,
  published_by text not null references "user"(id),
  published_at timestamptz not null default now(),
  unique (site_id, revision)
);
create index field_site_latest_idx on field.site_releases(site_id, revision desc);
