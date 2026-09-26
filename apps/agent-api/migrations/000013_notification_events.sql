alter table ap.inquiry_messages drop constraint inquiry_messages_delivery_state_check;
alter table ap.inquiry_messages add constraint ap_inquiry_messages_delivery_state_check
  check (delivery_state in ('pending', 'sent', 'unknown', 'failed', 'not_applicable', 'blocked_integration'));

create table ap.notification_events (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  outbox_id uuid not null unique references ap.outbox(id) on delete cascade,
  inquiry_id uuid not null references ap.inquiries(id) on delete cascade,
  source_message_id uuid references ap.inquiry_messages(id) on delete set null,
  audience text not null check (audience in ('owner', 'customer')),
  channel text not null check (channel in ('in_app', 'kakao')),
  state text not null check (state in ('available', 'blocked_integration')),
  created_at timestamptz not null default now(),
  check ((audience = 'owner' and channel = 'in_app' and state = 'available')
      or (audience = 'customer' and channel = 'kakao' and state = 'blocked_integration'))
);
create index ap_notification_events_owner_idx
  on ap.notification_events(organization_id, created_at desc) where audience = 'owner';

create table ap.notification_reads (
  notification_id uuid not null references ap.notification_events(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
