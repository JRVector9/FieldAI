create index field_inquiries_activity_idx on field.inquiries(organization_id, updated_at desc, id desc);
