alter table field.inquiry_messages
  add column visibility text not null default 'customer'
    check (visibility in ('customer', 'internal')),
  add constraint field_internal_note_delivery_check
    check (visibility <> 'internal' or (sender = 'owner' and delivery_state = 'not_applicable'));
