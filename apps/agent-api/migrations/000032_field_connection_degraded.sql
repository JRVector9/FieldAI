alter table ap.field_connections drop constraint field_connections_status_check;
alter table ap.field_connections add constraint field_connections_status_check
  check (status in ('pending_binding', 'binding_unknown', 'review_required', 'degraded', 'revoked'));
