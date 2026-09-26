create table ap.inquiry_receipt_rotations (
  inquiry_id uuid not null references ap.inquiries(id) on delete cascade,
  attempt_hash text not null check (attempt_hash ~ '^[0-9a-f]{64}$'),
  old_key_hash text not null check (old_key_hash ~ '^[0-9a-f]{64}$'),
  new_key_hash text not null check (new_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (inquiry_id, attempt_hash),
  check (old_key_hash <> new_key_hash)
);
