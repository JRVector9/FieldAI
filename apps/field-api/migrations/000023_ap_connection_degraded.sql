alter table field.ap_connections drop constraint field_ap_connections_status_check;
alter table field.ap_connections add constraint field_ap_connections_status_check
  check (status in ('pending_field_consent', 'review_required', 'active', 'degraded', 'revoked'));
