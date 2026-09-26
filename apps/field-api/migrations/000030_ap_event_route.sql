alter table field.ap_connections
  add column event_key_id uuid,
  add column event_secret_cipher bytea,
  add column route_generation integer,
  add constraint field_ap_event_route_complete check (
    (event_key_id is null and event_secret_cipher is null and route_generation is null)
    or (event_key_id is not null and event_secret_cipher is not null and route_generation = 1)
  );
