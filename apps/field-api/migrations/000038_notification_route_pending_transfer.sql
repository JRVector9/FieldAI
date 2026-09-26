alter table field.external_reservation_notification_routes
  add column pending_transfer_id uuid unique,
  add column pending_revision integer check (pending_revision >= 0),
  add column pending_event_id uuid references field.reservation_events(id),
  add column pending_customer_consent_id uuid,
  add column pending_started_at timestamptz;

alter table field.external_reservation_notification_routes
  add constraint external_notification_pending_complete check (
    (pending_transfer_id is null and pending_revision is null
      and pending_event_id is null and pending_customer_consent_id is null
      and pending_started_at is null)
    or (pending_transfer_id is not null and pending_revision is not null
      and pending_event_id is not null and pending_customer_consent_id is not null
      and pending_started_at is not null and route_generation = 1
      and state in ('consented', 'withdrawn'))
  );

create or replace function field.assign_reservation_event_notification_route() returns trigger
language plpgsql as $$
declare reservation_source text; route_state text; pending_transfer uuid;
begin
  select r.source,n.state,n.pending_transfer_id into reservation_source,route_state,pending_transfer
  from field.reservations r
  left join field.external_reservation_notification_routes n on n.reservation_id = r.id
  where r.id = new.reservation_id;
  if reservation_source = 'external_ap' then
    new.route_generation := case when route_state in ('active', 'suspended') then 2 else 1 end;
    new.notification_owner_product := case
      when route_state = 'active' then 'field'
      when route_state = 'suspended' or pending_transfer is not null then 'none'
      else 'ap' end;
  elsif reservation_source = 'owner_manual' then
    new.route_generation := 1;
    new.notification_owner_product := 'none';
  else
    new.route_generation := 1;
    new.notification_owner_product := 'field';
  end if;
  return new;
end $$;
