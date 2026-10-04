-- A-18: independent signed approved deletion intents, their DB commit proofs,
-- and offline replay evidence. No FK: restored/absent targets remain evidence.
create table ap.deletion_journal_receipts (
  entry_id uuid primary key,
  entry_sha256 text not null check(entry_sha256 ~ '^[a-f0-9]{64}$'),
  target_kind text not null check(target_kind in ('account','organization')),
  target_id text not null,
  applied_at timestamptz not null default now(),
  unique(target_kind,target_id)
);
create table ap.deletion_restore_audit (
  entry_id uuid primary key,
  target_kind text not null check(target_kind in ('account','organization')),
  target_id text not null,
  outcome text not null check(outcome in ('applied','target_absent')),
  applied_at timestamptz not null default now()
);
create function ap.protect_deletion_proof() returns trigger language plpgsql as $$
begin raise exception 'deletion proof is immutable' using errcode='PAD01'; end $$;
create trigger deletion_receipt_immutable before update or delete on ap.deletion_journal_receipts
  for each row execute function ap.protect_deletion_proof();
create trigger deletion_receipt_no_truncate before truncate on ap.deletion_journal_receipts
  for each statement execute function ap.protect_deletion_proof();
create trigger deletion_restore_immutable before update or delete on ap.deletion_restore_audit
  for each row execute function ap.protect_deletion_proof();
create trigger deletion_restore_no_truncate before truncate on ap.deletion_restore_audit
  for each statement execute function ap.protect_deletion_proof();
-- Rollback requires preserving both proof tables and their signed external
-- journal first; then drop triggers/tables/function. Never discard proof to boot.
