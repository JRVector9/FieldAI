alter table ap.inquiry_messages
  add column submission_key_hash text,
  add column submission_request_hash text,
  add constraint ap_inquiry_message_submission_pair_check
    check ((submission_key_hash is null) = (submission_request_hash is null));

create unique index ap_inquiry_messages_submission_key_unique
  on ap.inquiry_messages(inquiry_id, submission_key_hash);
