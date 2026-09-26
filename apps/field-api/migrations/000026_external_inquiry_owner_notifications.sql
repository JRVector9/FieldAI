create or replace function field.notification_audience(kind text, detail jsonb) returns text
language sql immutable as $$
  select case
    when kind in (
      'field.inquiry.created', 'field.inquiry.customer_message',
      'field.external_request.accepted',
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

insert into field.notification_events
  (id,organization_id,outbox_id,target_id,audience,channel,state,created_at)
select gen_random_uuid(),o.organization_id,o.id,o.aggregate_id,'owner','in_app','available',o.occurred_at
from field.outbox o
where o.event_type = 'field.external_request.accepted'
on conflict (outbox_id) do nothing;
