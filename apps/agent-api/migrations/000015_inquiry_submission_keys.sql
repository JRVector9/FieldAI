alter table ap.inquiries
  add column submission_key_hash text,
  add column submission_request_hash text,
  add constraint ap_inquiry_submission_pair_check
    check ((submission_key_hash is null) = (submission_request_hash is null));

create unique index ap_inquiries_submission_key_unique
  on ap.inquiries(organization_id, submission_key_hash);
