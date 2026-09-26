create table ap.campaigns (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  draft_revision integer not null default 1 check (draft_revision > 0),
  draft_knowledge_release_id uuid not null references ap.knowledge_releases(id),
  draft_service_index integer not null check (draft_service_index >= 0),
  state text not null default 'draft' check (state in ('draft', 'published', 'paused')),
  current_release_id uuid,
  updated_by text not null references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index campaigns_organization_idx on ap.campaigns(organization_id, created_at desc);

create table ap.campaign_releases (
  id uuid primary key,
  campaign_id uuid not null,
  organization_id uuid not null,
  revision integer not null check (revision > 0),
  knowledge_release_id uuid not null references ap.knowledge_releases(id),
  service_index integer not null check (service_index >= 0),
  content jsonb not null,
  content_hash text not null,
  approved_by text not null references "user"(id),
  approval_key_hash text not null,
  approval_request_hash text not null,
  approved_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id) references ap.campaigns(id, organization_id) on delete cascade,
  unique (campaign_id, revision),
  unique (campaign_id, approval_key_hash),
  unique (id, campaign_id)
);
alter table ap.campaigns add constraint campaigns_current_release_fk
  foreign key (current_release_id, id) references ap.campaign_releases(id, campaign_id);
