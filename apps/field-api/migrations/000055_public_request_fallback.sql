alter table field.inquiries
  add column fallback_origin text,
  add column fallback_action_request_id uuid,
  add column fallback_declared_at timestamptz,
  add constraint inquiries_fallback_consistent check (
    (fallback_origin is null and fallback_action_request_id is null and fallback_declared_at is null)
    or (fallback_origin is not null and fallback_origin = 'ap_customer_reported'
      and fallback_declared_at is not null and not is_test)
  );

alter table field.reservations
  add column fallback_origin text,
  add column fallback_action_request_id uuid,
  add column fallback_declared_at timestamptz,
  add constraint reservations_fallback_consistent check (
    (fallback_origin is null and fallback_action_request_id is null and fallback_declared_at is null)
    or (fallback_origin is not null and fallback_origin = 'ap_customer_reported'
      and fallback_declared_at is not null and source = 'public')
  );

create index field_external_work_requests_action_lookup_idx
  on field.external_work_requests(organization_id, action_request_id) where not is_test;
