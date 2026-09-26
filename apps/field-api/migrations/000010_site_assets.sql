create table field.site_assets (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  object_key text not null unique,
  content_type text not null check (content_type = 'image/webp'),
  byte_size integer not null check (byte_size > 0 and byte_size <= 4194304),
  width integer not null check (width between 1 and 2000),
  height integer not null check (height between 1 and 2000),
  sha256 text not null,
  state text not null default 'ready' check (state = 'ready'),
  uploaded_by text not null references "user"(id),
  created_at timestamptz not null default now()
);
create index field_site_assets_org_idx on field.site_assets(organization_id, created_at desc);

create table field.site_release_assets (
  release_id uuid not null references field.site_releases(id) on delete cascade,
  asset_id uuid not null references field.site_assets(id),
  primary key (release_id, asset_id)
);
