alter table field.reservations
  add column submission_key_hash text,
  add column submission_request_hash text,
  add constraint reservation_submission_pair_check
    check ((submission_key_hash is null) = (submission_request_hash is null));

create unique index field_reservations_submission_key_unique
  on field.reservations (organization_id, submission_key_hash);
