alter table field.inquiries
  add column is_test boolean not null default false,
  add column test_site_revision integer;

alter table field.inquiries alter column consent_at drop not null;

alter table field.inquiries add constraint field_inquiries_test_boundary check (
  (is_test = false and consent_at is not null and test_site_revision is null)
  or (is_test = true and consent_at is null and test_site_revision > 0 and customer_phone = '')
);

create unique index field_inquiries_site_test_once_idx
  on field.inquiries(organization_id, test_site_revision) where is_test = true;
