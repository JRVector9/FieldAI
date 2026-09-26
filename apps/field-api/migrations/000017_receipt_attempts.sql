create table field.receipt_attempts (
  target_kind text not null check (target_kind in ('inquiry', 'reservation')),
  target_id uuid not null,
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  failures integer not null check (failures between 1 and 5),
  window_started_at timestamptz not null,
  blocked_until timestamptz,
  updated_at timestamptz not null,
  primary key (target_kind, target_id, subject_hash)
);
create index field_receipt_attempts_cleanup_idx on field.receipt_attempts(updated_at);
