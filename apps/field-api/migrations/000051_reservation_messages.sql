create table field.reservation_messages (
  id uuid primary key,
  reservation_id uuid not null references field.reservations(id) on delete cascade,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  sender text not null check (sender in ('customer', 'owner')),
  actor_user_id text,
  body text not null check (char_length(body) between 1 and 5000),
  outbox_id uuid not null unique references field.outbox(id),
  created_at timestamptz not null default now(),
  check ((sender = 'customer' and actor_user_id is null)
    or (sender = 'owner' and actor_user_id is not null))
);
create index field_reservation_messages_order_idx
  on field.reservation_messages(reservation_id, created_at, id);

create or replace function field.notification_audience(kind text, detail jsonb) returns text
language sql immutable as $$
  select case
    when kind in (
      'field.inquiry.created', 'field.inquiry.customer_message',
      'field.reservation.requested', 'field.reservation.catalog_reviewed',
      'field.reservation.proposal_accepted', 'field.reservation.change_requested',
      'field.reservation.cancel_requested', 'field.booking_message.customer') then 'owner'
    when kind in ('field.inquiry.owner_reply', 'field.booking_message.owner') then 'customer'
    when kind in (
      'field.reservation.proposed', 'field.reservation.confirmed',
      'field.reservation.canceled', 'field.reservation.reject',
      'field.reservation.expire', 'field.reservation.complete',
      'field.reservation.decline_cancel', 'field.reservation.decline_change')
      and detail ->> 'notification' = 'pending' then 'customer'
    else null
  end
$$;
