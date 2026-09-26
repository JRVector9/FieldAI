create table ap.publishers (
  id uuid primary key,
  owner_user_id text not null references "user"(id),
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ap.publisher_memberships (
  publisher_id uuid not null references ap.publishers(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (publisher_id, user_id)
);
create index publisher_memberships_user_idx on ap.publisher_memberships(user_id);

create table ap.publisher_domains (
  id uuid primary key,
  publisher_id uuid not null references ap.publishers(id) on delete cascade,
  origin text not null unique,
  verification_proof text not null,
  verified_at timestamptz,
  verified_until timestamptz,
  created_at timestamptz not null default now(),
  unique (id, publisher_id),
  check ((verified_at is null and verified_until is null) or (verified_at is not null and verified_until is not null))
);
create index publisher_domains_publisher_idx on ap.publisher_domains(publisher_id);

create table ap.publisher_slots (
  id uuid primary key,
  publisher_id uuid not null references ap.publishers(id) on delete cascade,
  domain_id uuid not null,
  name text not null check (char_length(name) between 1 and 160),
  format text not null check (format in ('article', 'sidebar')),
  state text not null default 'paused' check (state in ('active', 'paused')),
  created_by text not null references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (domain_id, publisher_id) references ap.publisher_domains(id, publisher_id),
  unique (domain_id, name)
);
create index publisher_slots_publisher_idx on ap.publisher_slots(publisher_id, created_at desc);

create table ap.publisher_outbox (
  id uuid primary key,
  publisher_id uuid not null references ap.publishers(id) on delete cascade,
  event_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index publisher_outbox_pending_idx on ap.publisher_outbox(occurred_at) where delivered_at is null;
