alter table ap.ai_runs
  add column idempotency_key_hash text
  check (idempotency_key_hash is null or idempotency_key_hash ~ '^[a-f0-9]{64}$');

create unique index ap_ai_runs_customer_idempotency_idx
  on ap.ai_runs(inquiry_id, idempotency_key_hash)
  where kind = 'customer_message' and idempotency_key_hash is not null;
