create or replace function field.capture_notification_delivery_source() returns trigger language plpgsql as $$
declare kind text; event_payload jsonb; reservation_source text; route_state text; pending uuid; owner_product text;
begin
 select event_type,payload into kind,event_payload from field.outbox where id=new.outbox_id;
 if kind='field.inquiry.owner_reply' then
   select m.id into new.delivery_source_message_id from field.inquiry_messages m
   where m.id::text=event_payload->>'sourceMessageId' and m.inquiry_id::text=new.target_id
     and m.sender='owner' and m.visibility='customer';
 elsif new.audience='customer' then
   select r.source,n.state,n.pending_transfer_id into reservation_source,route_state,pending
   from field.reservations r left join field.external_reservation_notification_routes n on n.reservation_id=r.id
   where r.id::text=new.target_id for share of r;
   if kind like 'field.reservation.%' and event_payload->>'revision' is not null then
     select notification_owner_product into owner_product from field.reservation_events
     where reservation_id::text=new.target_id and revision=(event_payload->>'revision')::integer;
   end if;
   new.delivery_owner_product:=coalesce(owner_product,case when reservation_source='owner_manual' then 'none'
    when reservation_source='external_ap' then case when route_state='active' then 'field' when route_state='suspended' or pending is not null then 'none' else 'ap' end
    when reservation_source='public' then 'field' else 'none' end);
 end if;
 return new;
end $$;
