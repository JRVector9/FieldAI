alter table field.reservation_events add column notification_owner_product text
  not null default 'field' check (notification_owner_product in ('ap', 'field', 'none'));
alter table field.reservation_events add column route_generation integer
  not null default 1 check (route_generation in (1, 2));

update field.reservation_events e set notification_owner_product = 'ap'
from field.reservations r where r.id = e.reservation_id and r.source = 'external_ap';
update field.reservation_events e set notification_owner_product = 'none'
from field.reservations r where r.id = e.reservation_id and r.source = 'owner_manual';

create function field.assign_reservation_event_notification_route() returns trigger
language plpgsql as $$
declare reservation_source text; route_state text;
begin
  select r.source,n.state into reservation_source,route_state
  from field.reservations r
  left join field.external_reservation_notification_routes n on n.reservation_id = r.id
  where r.id = new.reservation_id;
  if reservation_source = 'external_ap' then
    new.route_generation := case when route_state in ('active', 'suspended') then 2 else 1 end;
    new.notification_owner_product := case
      when route_state = 'active' then 'field'
      when route_state = 'suspended' then 'none'
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
create trigger field_reservation_event_notification_route
  before insert on field.reservation_events for each row
  execute function field.assign_reservation_event_notification_route();
