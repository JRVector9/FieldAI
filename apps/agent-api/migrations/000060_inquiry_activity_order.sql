create index ap_inquiries_activity_idx on ap.inquiries(organization_id, updated_at desc, id desc);
