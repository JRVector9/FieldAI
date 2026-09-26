create schema if not exists field;

create table field.organizations (
  id uuid primary key,
  owner_user_id text not null unique references "user"(id),
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);
create table field.memberships (
  organization_id uuid not null references field.organizations(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index field_memberships_user_idx on field.memberships(user_id);

create table field.catalog_drafts (
  organization_id uuid primary key references field.organizations(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  content jsonb not null,
  updated_by text not null references "user"(id),
  updated_at timestamptz not null default now()
);
create table field.catalog_releases (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  revision integer not null check (revision > 0),
  content jsonb not null,
  content_hash text not null,
  approved_by text not null references "user"(id),
  approved_at timestamptz not null default now(),
  unique (organization_id, revision)
);
create index field_catalog_latest_idx on field.catalog_releases(organization_id, revision desc);

create table field.outbox (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  event_type text not null,
  aggregate_id text not null,
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index field_outbox_pending_idx on field.outbox(occurred_at) where delivered_at is null;
