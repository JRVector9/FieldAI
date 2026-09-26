alter table field.reservations
  add column request_message text
    check (request_message is null or char_length(request_message) between 1 and 2000),
  add column visit_region text
    check (visit_region is null or char_length(visit_region) between 1 and 200);
