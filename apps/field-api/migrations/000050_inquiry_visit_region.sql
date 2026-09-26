alter table field.inquiries
  add column visit_region text
    check (visit_region is null or char_length(visit_region) between 1 and 200);
