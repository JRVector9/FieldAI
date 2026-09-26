alter table ap.inquiries add column distribution_traffic_class text not null default 'unclassified'
  check (distribution_traffic_class in ('unclassified', 'live', 'preview', 'test', 'bot'));
alter table ap.embed_sessions add column distribution_traffic_class text
  check (distribution_traffic_class in ('unclassified', 'live', 'preview', 'test', 'bot'));

create table ap.distribution_events (
  inquiry_id uuid not null references ap.inquiries(id) on delete cascade,
  event_type text not null check (event_type in ('engagement_started', 'contact_submitted')),
  placement_id uuid not null references ap.placements(id) on delete cascade,
  traffic_class text not null check (traffic_class in ('unclassified', 'live', 'preview', 'test', 'bot')),
  occurred_at timestamptz not null default now(),
  primary key (inquiry_id, event_type)
);
create index distribution_events_placement_time_idx
  on ap.distribution_events(placement_id, occurred_at) where traffic_class = 'live';

insert into ap.distribution_events(inquiry_id, event_type, placement_id, traffic_class, occurred_at)
select id, 'engagement_started', placement_id, 'unclassified', created_at
from ap.inquiries where placement_id is not null;
insert into ap.distribution_events(inquiry_id, event_type, placement_id, traffic_class, occurred_at)
select id, 'contact_submitted', placement_id, 'unclassified', submitted_at
from ap.inquiries where placement_id is not null and submitted_at is not null;
