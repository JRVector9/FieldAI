create table ap.agent_drafts (
  organization_id uuid primary key references ap.organizations(id) on delete cascade,
  agent_id uuid not null unique,
  revision integer not null default 0 check (revision >= 0),
  content jsonb not null,
  updated_by text not null references "user"(id),
  updated_at timestamptz not null default now()
);

insert into ap.agent_drafts (organization_id, agent_id, content, updated_by)
select id, gen_random_uuid(), jsonb_build_object(
  'name', name || ' AI', 'tone', 'clear', 'guideScope', '',
  'handoffText', '확인되지 않은 사항은 담당자가 답변합니다.'), owner_user_id
from ap.organizations;

create table ap.agent_releases (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  agent_id uuid not null,
  revision integer not null check (revision > 0),
  content jsonb not null,
  content_hash text not null,
  knowledge_release_id uuid not null references ap.knowledge_releases(id) on delete cascade,
  knowledge_revision integer not null,
  approved_by text not null references "user"(id),
  approved_at timestamptz not null default now(),
  unique (organization_id, revision)
);
create index agent_releases_latest_idx on ap.agent_releases(organization_id, revision desc);

create table ap.ai_runs (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  agent_release_id uuid not null references ap.agent_releases(id) on delete cascade,
  knowledge_release_id uuid not null references ap.knowledge_releases(id) on delete cascade,
  kind text not null check (kind = 'owner_test'),
  question text not null,
  status text not null check (status in ('in_progress', 'completed', 'rejected', 'failed')),
  answer jsonb,
  provider_model text,
  provider_response_id text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ai_runs_daily_idx on ap.ai_runs(organization_id, started_at desc);
