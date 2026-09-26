create table ap.inquiries (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  knowledge_release_id uuid not null references ap.knowledge_releases(id),
  knowledge_revision integer not null,
  service_snapshot jsonb,
  customer_name text not null check (char_length(customer_name) between 1 and 80),
  customer_phone text not null,
  visitor_key_hash text not null unique,
  state text not null check (state in ('needs_owner', 'human_active', 'waiting_customer', 'closed')),
  mode text not null default 'human' check (mode = 'human'),
  automation_paused boolean not null default true check (automation_paused),
  revision integer not null default 0,
  next_sequence bigint not null default 1,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ap_inquiries_owner_idx on ap.inquiries(organization_id, created_at desc);

create table ap.inquiry_messages (
  id uuid primary key,
  inquiry_id uuid not null references ap.inquiries(id) on delete cascade,
  sequence bigint not null,
  actor text not null check (actor in ('customer', 'owner')),
  visibility text not null check (visibility in ('customer', 'internal')),
  body text not null check (char_length(body) between 1 and 5000),
  delivery_state text not null check (delivery_state in ('pending', 'sent', 'unknown', 'failed', 'not_applicable')),
  created_at timestamptz not null default now(),
  unique (inquiry_id, sequence)
);
create index ap_inquiry_messages_order_idx on ap.inquiry_messages(inquiry_id, sequence);
