create table field.notification_events (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  outbox_id uuid not null unique references field.outbox(id) on delete cascade,
  target_id text not null,
  audience text not null check (audience in ('owner', 'customer')),
  channel text not null check (channel in ('in_app', 'kakao')),
  state text not null check (state in ('available', 'blocked_integration')),
  created_at timestamptz not null default now(),
  check ((audience = 'owner' and channel = 'in_app' and state = 'available')
      or (audience = 'customer' and channel = 'kakao' and state = 'blocked_integration'))
);
create index field_notification_events_owner_idx
  on field.notification_events(organization_id, created_at desc) where audience = 'owner';

create table field.notification_reads (
  notification_id uuid not null references field.notification_events(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create function field.notification_audience(kind text, detail jsonb) returns text
language sql immutable as $$
  select case
    when kind in (
      'field.inquiry.created', 'field.inquiry.customer_message',
      'field.reservation.requested', 'field.reservation.catalog_reviewed',
      'field.reservation.proposal_accepted', 'field.reservation.change_requested',
      'field.reservation.cancel_requested') then 'owner'
    when kind = 'field.inquiry.owner_reply' then 'customer'
    when kind in (
      'field.reservation.proposed', 'field.reservation.confirmed',
      'field.reservation.canceled', 'field.reservation.reject',
      'field.reservation.expire', 'field.reservation.complete',
      'field.reservation.decline_cancel', 'field.reservation.decline_change')
      and detail ->> 'notification' = 'pending' then 'customer'
    else null
  end
$$;

create function field.capture_notification_event() returns trigger
language plpgsql as $$
declare recipient text;
begin
  recipient := field.notification_audience(new.event_type, new.payload);
  if recipient is null then return new; end if;
  insert into field.notification_events
    (id, organization_id, outbox_id, target_id, audience, channel, state, created_at)
  values (gen_random_uuid(), new.organization_id, new.id, new.aggregate_id, recipient,
    case when recipient = 'owner' then 'in_app' else 'kakao' end,
    case when recipient = 'owner' then 'available' else 'blocked_integration' end,
    new.occurred_at)
  on conflict (outbox_id) do nothing;
  return new;
end
$$;
create trigger field_outbox_notification_event
  after insert on field.outbox for each row execute function field.capture_notification_event();

insert into field.notification_events
  (id, organization_id, outbox_id, target_id, audience, channel, state, created_at)
select gen_random_uuid(), o.organization_id, o.id, o.aggregate_id, recipient.audience,
  case when recipient.audience = 'owner' then 'in_app' else 'kakao' end,
  case when recipient.audience = 'owner' then 'available' else 'blocked_integration' end,
  o.occurred_at
from field.outbox o
cross join lateral (select field.notification_audience(o.event_type, o.payload) as audience) recipient
where recipient.audience is not null
on conflict (outbox_id) do nothing;
