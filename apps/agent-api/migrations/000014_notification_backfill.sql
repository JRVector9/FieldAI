insert into ap.notification_events
  (id, organization_id, outbox_id, inquiry_id, source_message_id, audience, channel, state, created_at)
select gen_random_uuid(), o.organization_id, o.id, i.id, null,
  case when o.event_type = 'ap.inquiry.owner_reply' then 'customer' else 'owner' end,
  case when o.event_type = 'ap.inquiry.owner_reply' then 'kakao' else 'in_app' end,
  case when o.event_type = 'ap.inquiry.owner_reply' then 'blocked_integration' else 'available' end,
  o.occurred_at
from ap.outbox o
join ap.inquiries i on i.id::text = o.aggregate_id and i.organization_id = o.organization_id
where o.event_type in ('ap.inquiry.created', 'ap.inquiry.customer_message', 'ap.inquiry.owner_reply')
on conflict (outbox_id) do nothing;
