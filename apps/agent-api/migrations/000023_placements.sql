alter table ap.publisher_slots add constraint publisher_slots_id_publisher_unique unique (id, publisher_id);

create table ap.placements (
  id uuid primary key,
  organization_id uuid not null,
  campaign_id uuid not null,
  campaign_release_id uuid not null,
  publisher_id uuid not null references ap.publishers(id) on delete cascade,
  slot_id uuid not null,
  state text not null default 'requested' check (state in ('requested', 'approved', 'rejected', 'cancelled', 'suspended')),
  request_key_hash text not null,
  request_hash text not null,
  requested_by text not null references "user"(id),
  decided_by text references "user"(id),
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id) references ap.campaigns(id, organization_id) on delete cascade,
  foreign key (campaign_release_id, campaign_id) references ap.campaign_releases(id, campaign_id) deferrable initially deferred,
  foreign key (slot_id, publisher_id) references ap.publisher_slots(id, publisher_id) deferrable initially deferred,
  unique (campaign_release_id, slot_id),
  unique (organization_id, request_key_hash)
);
create index placements_business_idx on ap.placements(organization_id, created_at desc);
create index placements_publisher_idx on ap.placements(publisher_id, created_at desc);
