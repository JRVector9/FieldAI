create schema if not exists ap;

create table ap.organizations (
  id uuid primary key,
  owner_user_id text not null unique references "user"(id),
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);

create table ap.memberships (
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index memberships_user_idx on ap.memberships(user_id);

create table ap.knowledge_drafts (
  organization_id uuid primary key references ap.organizations(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  source_kind text not null default 'native' check (source_kind = 'native'),
  content jsonb not null,
  updated_by text not null references "user"(id),
  updated_at timestamptz not null default now()
);

create table ap.knowledge_releases (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  revision integer not null check (revision > 0),
  source_kind text not null check (source_kind = 'native'),
  content jsonb not null,
  content_hash text not null,
  approved_by text not null references "user"(id),
  approved_at timestamptz not null default now(),
  unique (organization_id, revision)
);
create index knowledge_releases_latest_idx on ap.knowledge_releases(organization_id, revision desc);

create table ap.outbox (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  event_type text not null,
  aggregate_id text not null,
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index outbox_pending_idx on ap.outbox(occurred_at) where delivered_at is null;
