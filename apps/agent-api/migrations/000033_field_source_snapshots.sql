create table ap.knowledge_sources (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  provider text not null check (provider = 'field'),
  connection_id uuid not null unique references ap.field_connections(id),
  external_org_id text not null,
  source_revision integer not null check (source_revision > 0),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  approved_source_revision integer,
  ap_knowledge_release_id uuid references ap.knowledge_releases(id),
  state text not null check (state in
    ('current', 'pending_review', 'stale', 'unavailable', 'integrity_conflict', 'revoked')),
  updated_at timestamptz not null default now()
);
create index ap_knowledge_sources_org_idx on ap.knowledge_sources(organization_id, updated_at desc);

create table ap.knowledge_source_snapshots (
  id uuid primary key,
  source_id uuid not null references ap.knowledge_sources(id) on delete cascade,
  source_revision integer not null check (source_revision > 0),
  release_id uuid not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  entity_versions jsonb not null default '{}'::jsonb,
  content jsonb not null,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  unique (source_id, source_revision)
);

create table ap.knowledge_source_integrity_conflicts (
  id uuid primary key,
  source_id uuid not null references ap.knowledge_sources(id) on delete cascade,
  source_revision integer not null check (source_revision > 0),
  expected_hash text not null check (expected_hash ~ '^[a-f0-9]{64}$'),
  observed_hash text not null check (observed_hash ~ '^[a-f0-9]{64}$'),
  observed_content jsonb not null,
  fetched_at timestamptz not null default now(),
  unique (source_id, source_revision, observed_hash)
);
