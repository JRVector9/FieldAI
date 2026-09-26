alter table field.ap_connections drop constraint ap_connections_status_check;
alter table field.ap_connections add constraint field_ap_connections_status_check
  check (status in ('pending_field_consent', 'review_required', 'active', 'revoked'));
alter table field.ap_connections
  add column field_grant_id text,
  add column field_actor_user_id text,
  add column field_client_id text,
  add column bound_at timestamptz;
