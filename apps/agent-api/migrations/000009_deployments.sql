create table ap.deployments (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  public_id text not null unique check (public_id ~ '^dep_[A-Za-z0-9_-]{20,50}$'),
  kind text not null check (kind in ('link', 'owned_embed')),
  allowed_origin text,
  verification_proof text,
  verified_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'active', 'paused')),
  agent_release_id uuid references ap.agent_releases(id),
  knowledge_revision integer,
  created_by text not null references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'link' and allowed_origin is null and verification_proof is null)
    or (kind = 'owned_embed' and allowed_origin is not null and verification_proof is not null)),
  check (status <> 'active' or (agent_release_id is not null and knowledge_revision is not null))
);
create index deployments_org_idx on ap.deployments(organization_id, created_at desc);
